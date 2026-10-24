import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { runAdb, runAdbBinary } from "./adb.js";
import { beaconToken } from "./beacon.js";
import { STAGES, saveCheckpoint, viaFromLog } from "./checkpoints.js";
import {
  AUTH_TIMEOUT_OFF_COMMAND,
  companionSetupCommands,
  downloadCompanionApk,
  parseSetupBroadcast,
  setupBroadcastCommand,
  setupCommandOk,
} from "./companion.js";
import { COMPANION_APP_NAME, COMPANION_PACKAGE, VERSION } from "./config.js";
import { adbDisconnect, ensureConnected, formatSnapshot, listAdbDevices, snapshot } from "./connector.js";
import { describeCandidate, loadAliases, marketNameForModel, resolveDevice, setAlias } from "./devices.js";
import { LOCALES, guideUrl, t, withLang } from "./i18n.js";
import { decodePng, downscale, encodeJpeg, isAllBlack } from "./image.js";
import {
  installFailureHint,
  isAddressSerial,
  isMdnsSerial,
  parseKeyguardShowing,
  parsePairOutput,
  parseWakefulness,
  splitHostPort,
  validateConnectAddress,
  validatePairArgs,
} from "./parse.js";
import { assertPackageName, inputTextCommands, normalizeKey, shQuote } from "./shell.js";

const deviceParam = z
  .string()
  .optional()
  .describe('Target device: serial, ip:port, alias, or model like "S21" / "S24+". Optional if only one device.');

const langParam = z
  .string()
  .optional()
  .describe(
    `Language for human-facing guidance and errors in the result (${LOCALES.join(", ")}; BCP 47 tags like "ko-KR" are fine). ` +
      "Pass the language the user is writing in. Defaults to the system locale.",
  );

const text = (s: string): CallToolResult => ({ content: [{ type: "text", text: s }] });

async function guard(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (e) {
    return { isError: true, content: [{ type: "text", text: (e as Error).message }] };
  }
}

/** guard() with human-facing text in `lang` (falls back to the detected locale). */
const guardLang = (lang: string | undefined, fn: () => Promise<CallToolResult>) => withLang(lang, () => guard(fn));

async function shell(serial: string, command: string, timeoutMs = 30_000): Promise<string> {
  const r = await runAdb(["shell", command], { serial, timeoutMs });
  return `${r.stdout}${r.stderr}`.trim();
}

const intParam = z.number().int().min(0).max(100_000);

/** Wake the screen and try to dismiss a non-secure keyguard. Returns a warning if still locked. */
async function ensureAwake(serial: string): Promise<string | undefined> {
  const power = await shell(serial, "dumpsys power | grep mWakefulness=", 10_000).catch(() => "");
  if (parseWakefulness(power) !== "Awake") await shell(serial, "input keyevent KEYCODE_WAKEUP");
  const before = await shell(serial, "dumpsys window | grep -iE 'keyguard|lockscreen'", 10_000).catch(() => "");
  if (!parseKeyguardShowing(before)) return undefined;
  await shell(serial, "wm dismiss-keyguard").catch(() => "");
  await new Promise((r) => setTimeout(r, 500));
  const after = await shell(serial, "dumpsys window | grep -iE 'keyguard|lockscreen'", 10_000).catch(() => "");
  return parseKeyguardShowing(after) ? t("warn.locked") : undefined;
}

/** Validate a local .apk path and return it absolute. */
function apkFile(apk: string): string {
  const abs = path.resolve(apk);
  if (path.extname(abs).toLowerCase() !== ".apk") throw new Error(`Not an .apk file: ${abs}`);
  if (!existsSync(abs) || !statSync(abs).isFile()) throw new Error(`APK not found: ${abs}`);
  return abs;
}

/** `adb install <flags> <apk>`; throws with an actionable hint unless it prints Success. */
async function adbInstall(serial: string, abs: string, flags: string[]): Promise<string> {
  const r = await runAdb(["install", ...flags, abs], { serial, timeoutMs: 600_000, allowFailure: true });
  const out = `${r.stdout}${r.stderr}`.trim();
  if (!/\bSuccess\b/.test(out)) {
    const hint = installFailureHint(out);
    throw new Error(`${t("install.failed", serial)}\n${out}${hint ? `\n\n${t("install.hint", hint)}` : ""}`);
  }
  return out;
}

/** `adb screencap` as PNG plus its decoded pixels (decoded once: black check, JPEG and preview reuse them). */
async function captureScreen(serial: string): Promise<{ png: Buffer; img: ReturnType<typeof decodePng> }> {
  const { stdout: png } = await runAdbBinary(["exec-out", "screencap", "-p"], { serial, timeoutMs: 30_000 });
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  if (png.length < 8 || !png.subarray(0, 4).equals(sig)) {
    throw new Error(`screencap did not return a PNG (${png.length} bytes): ${png.subarray(0, 200).toString("utf8")}`);
  }
  return { png, img: decodePng(png) };
}

/** versionName of an installed package, or undefined when it is not installed. */
async function installedVersion(serial: string, pkg: string): Promise<string | undefined> {
  const out = await shell(serial, `dumpsys package ${pkg} | grep -m1 versionName`, 10_000).catch(() => "");
  return /versionName=(\S+)/.exec(out)?.[1];
}

/** After `adb pair` the phone can take several seconds to advertise its connect port over mDNS: retry before giving up. */
async function connectAfterPairing(serial: string | undefined): ReturnType<typeof ensureConnected> {
  let last: unknown;
  for (const wait of serial ? [1_500, 3_000, 5_000] : [1_500]) {
    await new Promise((res) => setTimeout(res, wait));
    try {
      return await ensureConnected(serial);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

/** Launch an app's launcher activity via monkey. */
async function launchPackage(serial: string, pkg: string): Promise<string> {
  const out = await shell(serial, `monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`);
  if (/No activities found|monkey aborted/i.test(out)) throw new Error(`Could not launch ${pkg}: ${out}`);
  return out;
}

/** ensureConnected + ensureAwake for interactive tools. */
async function connectAwake(device: string | undefined): Promise<{ serial: string; warn: string }> {
  const { serial } = await ensureConnected(device);
  const w = await ensureAwake(serial);
  return { serial, warn: w ? `\n${w}` : "" };
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    "list_devices",
    {
      description: "List Android devices known to adb (online, offline, unauthorized) plus phones advertising Wireless debugging via mDNS that are not connected yet, with model, alias and serial. Start here to see what is available.",
      inputSchema: {},
    },
    () => guard(async () => text(formatSnapshot(await snapshot()))),
  );

  server.registerTool(
    "connect_device",
    {
      description: "Connect to a device over wireless adb: tries its last known ip:port, then finds its current port via mDNS and runs adb connect. Usually not needed, since every other tool auto-connects. The phone must have been paired once (see pair_device).",
      inputSchema: { device: deviceParam, lang: langParam },
    },
    ({ device, lang }) =>
      guardLang(lang, async () => {
        const r = await ensureConnected(device);
        const lines = [t("connected", describeCandidate(r.device, loadAliases()))];
        if (r.log.length) lines.push(...r.log.map((l) => `  ${l}`));
        return text(lines.join("\n"));
      }),
  );

  server.registerTool(
    "disconnect_device",
    {
      description: "Disconnect a wireless adb device (USB devices are untouched). Without device, disconnects every wireless device.",
      inputSchema: { device: deviceParam },
    },
    ({ device }) =>
      guard(async () => {
        const devices = await listAdbDevices();
        const wireless = devices.filter((d) => isAddressSerial(d.serial) || isMdnsSerial(d.serial));
        if (!device) {
          if (!wireless.length) return text("No wireless devices connected.");
          const out = await Promise.all(wireless.map((d) => adbDisconnect(d.serial)));
          return text(out.join("\n"));
        }
        const hit = resolveDevice(device, wireless, loadAliases());
        if (!hit) return text(`No connected wireless device matches "${device}".`);
        return text(await adbDisconnect(hit.serial));
      }),
  );

  server.registerTool(
    "install_apk",
    {
      description: "Install an APK file from this PC onto the device (adb install; by default -r keeps app data and -g grants runtime permissions).",
      inputSchema: {
        path: z.string().describe("Path to the .apk on this PC"),
        replace: z.boolean().default(true).describe("Reinstall keeping data (-r)"),
        grant_permissions: z.boolean().default(true).describe("Grant runtime permissions (-g)"),
        device: deviceParam,
      },
    },
    ({ path: apk, replace, grant_permissions, device }) =>
      guard(async () => {
        const abs = apkFile(apk);
        const { serial } = await ensureConnected(device);
        const out = await adbInstall(serial, abs, [...(replace ? ["-r"] : []), ...(grant_permissions ? ["-g"] : [])]);
        return text(`Installed ${path.basename(abs)} on ${serial}\n${out}`);
      }),
  );

  server.registerTool(
    "launch_app",
    {
      description: "Launch an app by package name (its launcher activity), or a specific activity via am start -n. Wakes the screen first.",
      inputSchema: {
        package: z.string().describe("Package name, e.g. com.example.game"),
        activity: z.string().optional().describe('Activity, e.g. ".MainActivity" or "com.example/.MainActivity"'),
        device: deviceParam,
      },
    },
    ({ package: pkg, activity, device }) =>
      guard(async () => {
        assertPackageName(pkg);
        const { serial, warn } = await connectAwake(device);
        let out: string;
        if (activity) {
          if (!/^[\w.$/]+$/.test(activity)) throw new Error(`Invalid activity "${activity}"`);
          const component = activity.includes("/") ? activity : `${pkg}/${activity}`;
          out = await shell(serial, `am start -W -n ${shQuote(component)}`);
          if (/Error|does not exist/i.test(out)) throw new Error(out);
        } else {
          out = await launchPackage(serial, pkg);
        }
        return text(`Launched ${pkg} on ${serial}\n${out}${warn}`);
      }),
  );

  server.registerTool(
    "stop_app",
    {
      description: "Force-stop an app by package name (am force-stop).",
      inputSchema: { package: z.string(), device: deviceParam },
    },
    ({ package: pkg, device }) =>
      guard(async () => {
        assertPackageName(pkg);
        const { serial } = await ensureConnected(device);
        await shell(serial, `am force-stop ${pkg}`);
        return text(`Stopped ${pkg} on ${serial}`);
      }),
  );

  server.registerTool(
    "screenshot",
    {
      description:
        "Capture the device screen (wakes it first). Returns a JPEG downscaled to a 1280px long edge unless full_resolution=true; " +
        "tap/swipe coordinates always use the full device resolution reported in the result. save_path also saves the full-resolution " +
        "image on this PC (.png = original PNG, .jpg/.jpeg = JPEG). A fully black image means the screen is off or the app blocks capture (FLAG_SECURE).",
      inputSchema: {
        device: deviceParam,
        save_path: z.string().optional().describe("Optional .png/.jpg/.jpeg file path on this PC to save the full-resolution screenshot"),
        overwrite: z.boolean().default(false).describe("Allow save_path to replace an existing file"),
        full_resolution: z.boolean().default(false).describe("Return the original PNG instead of a downscaled JPEG"),
      },
    },
    ({ device, save_path, overwrite, full_resolution }) =>
      guard(async () => {
        const abs = save_path ? path.resolve(save_path) : undefined;
        const ext = abs ? path.extname(abs).toLowerCase() : "";
        if (abs && ![".png", ".jpg", ".jpeg"].includes(ext)) throw new Error(`save_path must end in .png, .jpg or .jpeg: ${abs}`);
        if (abs && !overwrite && existsSync(abs)) throw new Error(`File already exists: ${abs} (pass overwrite=true to replace it)`);
        const { serial, warn } = await connectAwake(device);
        const { png, img } = await captureScreen(serial);
        const meta = { width: img.width, height: img.height };
        let note = `Screenshot from ${serial} (${meta.width}x${meta.height})`;
        if (abs) {
          mkdirSync(path.dirname(abs), { recursive: true });
          const out = ext === ".png" ? png : encodeJpeg(img, 92);
          writeFileSync(abs, out, { flag: overwrite ? "w" : "wx" });
          note += `, saved to ${abs}`;
        }
        if (isAllBlack(img)) {
          note += "\nNote: the image is entirely black - the screen may be off, or the foreground app uses FLAG_SECURE (secure apps capture black).";
        }
        let data: Buffer = png;
        let mimeType = "image/png";
        if (!full_resolution) {
          data = encodeJpeg(downscale(img, 1280), 80);
          mimeType = "image/jpeg";
          note += ` - returned as JPEG <=1280px (coordinates for tap/swipe use the full ${meta.width}x${meta.height} resolution)`;
        }
        return {
          content: [
            { type: "image", data: data.toString("base64"), mimeType },
            { type: "text", text: note + warn },
          ],
        };
      }),
  );

  server.registerTool(
    "save_checkpoint",
    {
      description:
        "Record a setup checkpoint: connect (timing how long it takes and how: already online, last known address, " +
        "ADB Autolink port beacon or mDNS), open the ADB Autolink app so its screen shows the current ip:port, take a " +
        "screenshot and save it with a report row under ~/.adb-autolink/checks/<device>/<session>/. Call it with " +
        "stage=first_connect right after the first successful connection in setup, and with stage=reconnect after the user " +
        "turned Wi-Fi off and on. Give the user the returned screenshot and report paths.",
      inputSchema: {
        stage: z.enum(STAGES).describe("first_connect (starts a new session) or reconnect (joins the latest session of this device)"),
        device: deviceParam,
        lang: langParam,
      },
    },
    ({ stage, device, lang }) =>
      guardLang(lang, async () => {
        const started = Date.now();
        const c = await ensureConnected(device);
        const elapsedMs = Date.now() - started;
        const via = viaFromLog(c.log, !!device && !!splitHostPort(device.trim()));
        const warn = await ensureAwake(c.serial);
        const appVersion = await installedVersion(c.serial, COMPANION_PACKAGE);
        if (appVersion) {
          await shell(c.serial, `am start -n ${COMPANION_PACKAGE}/.MainActivity`);
          await new Promise((res) => setTimeout(res, 2_500)); // let the app confirm and draw the port
        }
        const { png, img } = await captureScreen(c.serial);
        const serial = c.device.physicalSerial ?? c.serial;
        const address = c.device.address ?? c.serial;
        const saved = saveCheckpoint({
          stage,
          deviceName: marketNameForModel(c.device.model) ?? c.device.model,
          serial,
          address,
          via,
          elapsedMs,
          appVersion,
          pluginVersion: VERSION,
          png,
        });
        const lines = [
          t("checkpoint.saved", t(`checkpoint.stage.${stage}`), saved.png, saved.report, address, t(`checkpoint.via.${via}`), (elapsedMs / 1000).toFixed(1)),
        ];
        if (!appVersion) lines.push(t("checkpoint.noApp"));
        if (warn) lines.push(warn);
        return {
          content: [
            { type: "image", data: encodeJpeg(downscale(img, 1280), 80).toString("base64"), mimeType: "image/jpeg" },
            { type: "text", text: lines.join("\n") },
          ],
        };
      }),
  );

  server.registerTool(
    "tap",
    {
      description: "Tap at screen coordinates in device pixels (full resolution, as reported by screenshot).",
      inputSchema: { x: intParam, y: intParam, device: deviceParam },
    },
    ({ x, y, device }) =>
      guard(async () => {
        const { serial, warn } = await connectAwake(device);
        await shell(serial, `input tap ${x} ${y}`);
        return text(`Tapped (${x}, ${y}) on ${serial}${warn}`);
      }),
  );

  server.registerTool(
    "swipe",
    {
      description: "Swipe from (x1,y1) to (x2,y2) in device pixels over duration_ms. Use identical start/end points with a long duration (e.g. 800 ms) for a long-press.",
      inputSchema: {
        x1: intParam,
        y1: intParam,
        x2: intParam,
        y2: intParam,
        duration_ms: z.number().int().min(1).max(60_000).optional(),
        device: deviceParam,
      },
    },
    ({ x1, y1, x2, y2, duration_ms, device }) =>
      guard(async () => {
        const { serial, warn } = await connectAwake(device);
        await shell(serial, `input swipe ${x1} ${y1} ${x2} ${y2}${duration_ms ? ` ${duration_ms}` : ""}`, 90_000);
        return text(`Swiped (${x1},${y1}) -> (${x2},${y2}) on ${serial}${warn}`);
      }),
  );

  server.registerTool(
    "input_text",
    {
      description: "Type text into the currently focused input field. Printable ASCII only (adb input cannot type non-ASCII such as Korean or emoji); newlines are sent as ENTER.",
      inputSchema: { text: z.string().min(1), device: deviceParam },
    },
    ({ text: value, device }) =>
      guard(async () => {
        const commands = inputTextCommands(value); // validates before touching the device
        const { serial, warn } = await connectAwake(device);
        for (const cmd of commands) await shell(serial, cmd);
        return text(`Typed ${value.length} chars on ${serial}${warn}`);
      }),
  );

  server.registerTool(
    "wake_device",
    {
      description: "Turn the screen on and dismiss a swipe-only lock screen. A secure lock (PIN/pattern/biometric) cannot be dismissed over adb; the result says if it is still showing.",
      inputSchema: { device: deviceParam },
    },
    ({ device }) =>
      guard(async () => {
        const { serial } = await ensureConnected(device);
        const w = await ensureAwake(serial);
        return text(w ? `${serial}: screen on.\n${w}` : `${serial}: screen on and unlocked.`);
      }),
  );

  server.registerTool(
    "key_event",
    {
      description: "Send a key press: a name like BACK, HOME, ENTER, APP_SWITCH, DEL, VOLUME_UP, POWER, any KEYCODE_* name, or a numeric keycode.",
      inputSchema: { key: z.string(), device: deviceParam },
    },
    ({ key, device }) =>
      guard(async () => {
        const code = normalizeKey(key);
        const { serial } = await ensureConnected(device);
        await shell(serial, `input keyevent ${code}`);
        return text(`Sent ${code} on ${serial}`);
      }),
  );

  server.registerTool(
    "logcat",
    {
      description:
        "Read recent logcat lines. Filter by package (must be running; filters by its pid), tag and minimum priority. " +
        "crash_only=true reads the crash buffer (works even if the app already died). clear=true clears the buffer after reading.",
      inputSchema: {
        package: z.string().optional(),
        tag: z.string().optional(),
        priority: z.enum(["V", "D", "I", "W", "E", "F"]).optional(),
        lines: z.number().int().min(1).max(5000).default(200),
        clear: z.boolean().default(false),
        crash_only: z.boolean().default(false),
        device: deviceParam,
      },
    },
    ({ package: pkg, tag, priority, lines, clear, crash_only, device }) =>
      guard(async () => {
        if (pkg) assertPackageName(pkg);
        if (tag && !/^[^\s'"`$;&|<>\\*:]+$/.test(tag)) throw new Error(`Invalid tag "${tag}"`);
        const { serial } = await ensureConnected(device);
        const args = ["logcat", "-d", "-v", "threadtime", "-t", String(lines)];
        if (crash_only) args.push("-b", "crash");
        let pidNote = "";
        let grepPkg = false;
        if (pkg) {
          const pid = (await runAdb(["shell", "pidof", "-s", pkg], { serial, timeoutMs: 10_000, allowFailure: true })).stdout.trim();
          if (/^\d+$/.test(pid)) {
            if (!crash_only) args.push(`--pid=${pid}`);
            else grepPkg = true;
            pidNote = ` pid=${pid}`;
          } else if (crash_only) {
            grepPkg = true;
          } else {
            throw new Error(`${pkg} is not running on ${serial} (no pid). Launch it first, or use crash_only=true to see past crashes.`);
          }
        }
        if (tag) args.push(`${tag}:${priority ?? "V"}`, "*:S");
        else if (priority) args.push(`*:${priority}`);
        const r = await runAdb(args, { serial, timeoutMs: 30_000, allowFailure: true });
        let out = r.stdout;
        if (grepPkg && pkg) {
          // Crash entries span many lines from the crashing pid; keep all lines of pids that mention the package.
          const all = out.split(/\r?\n/);
          const pidOf = (l: string) => /^\S+\s+\S+\s+(\d+)\s+\d+\s+[VDIWEF]\s/.exec(l)?.[1];
          const pids = new Set(all.filter((l) => l.includes(pkg)).map(pidOf).filter(Boolean));
          out = all.filter((l) => l.includes(pkg) || pids.has(pidOf(l))).join("\n");
        }
        if (clear) await runAdb(["logcat", "-c", ...(crash_only ? ["-b", "crash"] : [])], { serial, timeoutMs: 10_000, allowFailure: true });
        const header = `logcat ${serial}${pkg ? ` ${pkg}${pidNote}` : ""}${crash_only ? " [crash buffer]" : ""}${clear ? " (cleared after read)" : ""}`;
        return text(`${header}\n${out.trim() || "(no matching log lines)"}${r.stderr.trim() ? `\n${r.stderr.trim()}` : ""}`);
      }),
  );

  server.registerTool(
    "pair_device",
    {
      description:
        "Pair this PC with a phone for wireless debugging (one-time per phone and PC; runs adb pair). On the phone open Settings > " +
        "Developer options > Wireless debugging. Ask the user for THREE values in one message: (1) connect_address, the " +
        '"IP address & Port" at the top of the Wireless debugging screen; then after tapping "Pair device with pairing code", ' +
        "(2) the ip:port and (3) the 6-digit code shown in that dialog (keep it open). The two ports differ: the dialog's is for " +
        "pairing only. After pairing it connects to connect_address (or finds the phone via mDNS) and remembers it. " +
        "If the user does not know how to get there, share the illustrated guide in their language: " +
        `${guideUrl("en")} (English), or the same path ending in .ko.md / .ja.md / .zh-Hans.md / .es.md / .fr.md.`,
      inputSchema: {
        address: z.string().describe('ip:port shown in the "Pair device with pairing code" dialog, e.g. 192.168.0.23:37099'),
        code: z.string().describe("6-digit Wi-Fi pairing code shown in the same dialog"),
        connect_address: z
          .string()
          .optional()
          .describe(
            'ip:port shown as "IP address & Port" at the top of the Wireless debugging screen (NOT the pairing dialog\'s). ' +
              "Strongly recommended: without it the connection depends on mDNS discovery, which some networks block.",
          ),
        lang: langParam,
      },
    },
    ({ address, code, connect_address, lang }) =>
      guardLang(lang, async () => {
        const args = validatePairArgs(address, code);
        const connectTo = connect_address === undefined ? undefined : validateConnectAddress(connect_address, args.address);
        const r = await runAdb(["pair", args.address, args.code], { timeoutMs: 30_000, allowFailure: true });
        const pair = parsePairOutput(`${r.stdout}\n${r.stderr}`);
        if (!pair.ok) throw new Error(`${t("pair.failed", args.address, pair.message)}\n\n${t("hint.guide", guideUrl())}`);
        const lines = [pair.message];
        try {
          const c = connectTo ? await ensureConnected(connectTo) : await connectAfterPairing(pair.serial);
          lines.push(t("connected", describeCandidate(c.device, loadAliases())), ...c.log.map((l) => `  ${l}`));
        } catch (e) {
          lines.push(t("pair.notConnectedYet", (e as Error).message.split("\n")[0] ?? ""));
        }
        return text(lines.join("\n"));
      }),
  );

  server.registerTool(
    "install_companion_app",
    {
      description:
        `Install the ${COMPANION_APP_NAME} companion app (${COMPANION_PACKAGE}) on a phone. The app turns Wireless debugging on ` +
        "automatically whenever the phone joins a whitelisted Wi-Fi, so it reconnects without touching the phone. Downloads the latest " +
        "release APK from GitHub unless apk_path is given, installs it, grants WRITE_SECURE_SETTINGS, location and notification " +
        "permissions, exempts it from battery optimization and unused-app permission removal, turns off the 7-day adb authorization " +
        "timeout, launches it, and when connected wirelessly whitelists the phone's current Wi-Fi. Nothing is left to set up in the " +
        "app except allowing more Wi-Fi networks. The phone must already be reachable over adb (USB, or paired via pair_device).",
      inputSchema: {
        device: deviceParam,
        apk_path: z.string().optional().describe("Local companion .apk to install instead of downloading the latest release"),
        lang: langParam,
      },
    },
    ({ device, apk_path, lang }) =>
      guardLang(lang, async () => {
        const steps: string[] = [];
        let apk: string;
        if (apk_path) {
          apk = apkFile(apk_path);
          steps.push(t("companion.usingLocal", apk));
        } else {
          const d = await downloadCompanionApk();
          apk = d.file;
          steps.push(d.note);
        }
        const { serial } = await ensureConnected(device);
        await adbInstall(serial, apk, ["-r"]);
        steps.push(t("companion.installed", serial));
        const grant = await runAdb(["shell", "pm", "grant", COMPANION_PACKAGE, "android.permission.WRITE_SECURE_SETTINGS"], {
          serial,
          timeoutMs: 15_000,
          allowFailure: true,
        });
        const grantOut = `${grant.stdout}${grant.stderr}`.trim();
        steps.push(
          grant.code === 0 && !/exception|error/i.test(grantOut)
            ? t("companion.granted")
            : t("companion.grantFailed", grantOut),
        );
        // Everything the app would otherwise ask for screen by screen.
        const sdk = Number.parseInt(await shell(serial, "getprop ro.build.version.sdk", 10_000).catch(() => ""), 10) || 0;
        const failed: string[] = [];
        for (const cmd of companionSetupCommands(sdk)) {
          const out = await shell(serial, cmd, 15_000).catch((e: Error) => e.message);
          if (!setupCommandOk(out)) failed.push(cmd);
        }
        steps.push(failed.length ? t("companion.setupPartial", failed.join(", ")) : t("companion.setupDone"));
        const timeout = await shell(serial, AUTH_TIMEOUT_OFF_COMMAND, 10_000).catch((e: Error) => e.message);
        steps.push(setupCommandOk(timeout) ? t("companion.authTimeoutOff") : t("companion.authTimeoutFailed", timeout));
        try {
          await ensureAwake(serial);
          await launchPackage(serial, COMPANION_PACKAGE);
          steps.push(t("companion.launched"));
        } catch (e) {
          steps.push(t("companion.launchFailed", (e as Error).message));
        }
        // Installed over wireless adb: the phone is on a development network right now, so allow it.
        const wireless = isAddressSerial(serial) || isMdnsSerial(serial);
        try {
          const physical = (await shell(serial, "getprop ro.serialno", 10_000).catch(() => "")).trim();
          const cmd = setupBroadcastCommand({ addCurrentWifi: wireless, beaconToken: beaconToken(), serial: physical });
          const r = parseSetupBroadcast(await shell(serial, cmd, 15_000));
          if (r.kind === "whitelisted") steps.push(t("companion.wifiAdded", r.ssid));
          else if (r.kind === "no_ssid") steps.push(t("companion.wifiNoSsid"));
          else if (r.kind === "ok") steps.push(t("companion.wifiUsb"));
          else steps.push(t("companion.wifiFailed", r.raw));
        } catch (e) {
          steps.push(t("companion.wifiFailed", (e as Error).message));
        }
        return text([...steps, "", t("companion.nextSteps")].join("\n"));
      }),
  );

  server.registerTool(
    "set_device_alias",
    {
      description: 'Save a friendly alias (e.g. "test", "main") for a device. The alias works as the device parameter of every tool, even before the device is connected.',
      inputSchema: { alias: z.string().min(1), device: z.string().optional().describe("Device to alias (serial, ip:port, model)") },
    },
    ({ alias, device }) =>
      guard(async () => {
        const r = await ensureConnected(device);
        const phys = r.device.physicalSerial ?? r.serial;
        const all = setAlias(alias, phys);
        return text(
          `Alias "${alias}" → ${phys}\nAll aliases:\n${Object.entries(all)
            .map(([a, s]) => `  ${a} → ${s}`)
            .join("\n")}`,
        );
      }),
  );
}
