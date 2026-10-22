import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { runAdb, runAdbBinary } from "./adb.js";
import { downloadCompanionApk } from "./companion.js";
import { COMPANION_APP_NAME, COMPANION_PACKAGE } from "./config.js";
import { adbDisconnect, ensureConnected, formatSnapshot, listAdbDevices, snapshot } from "./connector.js";
import { describeCandidate, loadAliases, resolveDevice, setAlias } from "./devices.js";
import { decodePng, downscale, encodeJpeg, isAllBlack } from "./image.js";
import {
  installFailureHint,
  isAddressSerial,
  isMdnsSerial,
  parseKeyguardShowing,
  parsePairOutput,
  parseWakefulness,
  validatePairArgs,
} from "./parse.js";
import { assertPackageName, inputTextCommands, normalizeKey, shQuote } from "./shell.js";

const deviceParam = z
  .string()
  .optional()
  .describe('Target device: serial, ip:port, alias, or model like "S21" / "S24+". Optional if only one device.');

const text = (t: string): CallToolResult => ({ content: [{ type: "text", text: t }] });

async function guard(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (e) {
    return { isError: true, content: [{ type: "text", text: (e as Error).message }] };
  }
}

async function shell(serial: string, command: string, timeoutMs = 30_000): Promise<string> {
  const r = await runAdb(["shell", command], { serial, timeoutMs });
  return `${r.stdout}${r.stderr}`.trim();
}

const intParam = z.number().int().min(0).max(100_000);

const LOCK_WARNING =
  "WARNING: the lock screen is still showing (secure lock cannot be dismissed over adb). Unlock the phone, or set up " +
  "Smart Lock / Extend Unlock (trusted place or trusted device) so it stays unlocked at home.";

/** Wake the screen and try to dismiss a non-secure keyguard. Returns a warning if still locked. */
async function ensureAwake(serial: string): Promise<string | undefined> {
  const power = await shell(serial, "dumpsys power | grep mWakefulness=", 10_000).catch(() => "");
  if (parseWakefulness(power) !== "Awake") await shell(serial, "input keyevent KEYCODE_WAKEUP");
  const before = await shell(serial, "dumpsys window | grep -iE 'keyguard|lockscreen'", 10_000).catch(() => "");
  if (!parseKeyguardShowing(before)) return undefined;
  await shell(serial, "wm dismiss-keyguard").catch(() => "");
  await new Promise((r) => setTimeout(r, 500));
  const after = await shell(serial, "dumpsys window | grep -iE 'keyguard|lockscreen'", 10_000).catch(() => "");
  return parseKeyguardShowing(after) ? LOCK_WARNING : undefined;
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
    throw new Error(`Install failed on ${serial}:\n${out}${hint ? `\n\nHint: ${hint}` : ""}`);
  }
  return out;
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
      inputSchema: { device: deviceParam },
    },
    ({ device }) =>
      guard(async () => {
        const r = await ensureConnected(device);
        const lines = [`Connected: ${describeCandidate(r.device, loadAliases())}`];
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
        const { stdout: png } = await runAdbBinary(["exec-out", "screencap", "-p"], { serial, timeoutMs: 30_000 });
        const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
        if (png.length < 8 || !png.subarray(0, 4).equals(sig)) {
          throw new Error(`screencap did not return a PNG (${png.length} bytes): ${png.subarray(0, 200).toString("utf8")}`);
        }
        // Decode the PNG once; the black check, saved JPEG and downscaled preview all reuse the raw pixels.
        const img = decodePng(png);
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
        "Developer options > Wireless debugging > Pair device with pairing code, then pass the ip:port and the 6-digit code shown in " +
        "that dialog (keep it open; its port differs from the connect port). After pairing it connects to the phone and remembers it.",
      inputSchema: {
        address: z.string().describe('ip:port shown in the "Pair device with pairing code" dialog, e.g. 192.168.0.23:37099'),
        code: z.string().describe("6-digit Wi-Fi pairing code shown in the same dialog"),
      },
    },
    ({ address, code }) =>
      guard(async () => {
        const args = validatePairArgs(address, code);
        const r = await runAdb(["pair", args.address, args.code], { timeoutMs: 30_000, allowFailure: true });
        const pair = parsePairOutput(`${r.stdout}\n${r.stderr}`);
        if (!pair.ok) {
          throw new Error(
            `Pairing with ${args.address} failed:\n${pair.message}\n\nCheck that the pairing dialog is still open on the phone, ` +
              "the code and port are current (they change every time the dialog opens), and the phone is on the same network as this PC.",
          );
        }
        const lines = [pair.message];
        try {
          // The connect port is advertised via mDNS; give the phone a moment to publish it.
          await new Promise((res) => setTimeout(res, 1_500));
          const c = await ensureConnected(pair.serial);
          lines.push(`Connected: ${describeCandidate(c.device, loadAliases())}`, ...c.log.map((l) => `  ${l}`));
        } catch (e) {
          lines.push(`Paired, but not connected yet: ${(e as Error).message.split("\n")[0]}`, "Try connect_device in a few seconds.");
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
        "release APK from GitHub unless apk_path is given, installs it, grants WRITE_SECURE_SETTINGS, launches it, and lists the setup " +
        "steps left to do on the phone. The phone must already be reachable over adb (USB, or paired via pair_device).",
      inputSchema: {
        device: deviceParam,
        apk_path: z.string().optional().describe("Local companion .apk to install instead of downloading the latest release"),
      },
    },
    ({ device, apk_path }) =>
      guard(async () => {
        const steps: string[] = [];
        let apk: string;
        if (apk_path) {
          apk = apkFile(apk_path);
          steps.push(`1. Using local APK ${apk}`);
        } else {
          const d = await downloadCompanionApk();
          apk = d.file;
          steps.push(`1. APK ${d.note}`);
        }
        const { serial } = await ensureConnected(device);
        await adbInstall(serial, apk, ["-r"]);
        steps.push(`2. Installed on ${serial}`);
        const grant = await runAdb(["shell", "pm", "grant", COMPANION_PACKAGE, "android.permission.WRITE_SECURE_SETTINGS"], {
          serial,
          timeoutMs: 15_000,
          allowFailure: true,
        });
        const grantOut = `${grant.stdout}${grant.stderr}`.trim();
        steps.push(
          grant.code === 0 && !/exception|error/i.test(grantOut)
            ? "3. Granted WRITE_SECURE_SETTINGS (lets the app toggle Wireless debugging)"
            : `3. FAILED to grant WRITE_SECURE_SETTINGS: ${grantOut}\n   (Xiaomi/MIUI: enable "USB debugging (Security settings)" in Developer options, then run this again.)`,
        );
        try {
          await ensureAwake(serial);
          await launchPackage(serial, COMPANION_PACKAGE);
          steps.push("4. Launched the app");
        } catch (e) {
          steps.push(`4. Could not launch the app: ${(e as Error).message}`);
        }
        return text(
          [
            ...steps,
            "",
            `Next steps on the phone, in the ${COMPANION_APP_NAME} app:`,
            '  a. Location permission: choose "Allow all the time" and keep Location on (needed to read the Wi-Fi name in the background).',
            "  b. Allow notifications.",
            '  c. Battery usage: set the app to "Unrestricted" so the system does not kill it (important on Samsung).',
            '  d. While on your home/office Wi-Fi, tap "Add current Wi-Fi" to whitelist it, then enable auto mode.',
            '  e. The first time Wireless debugging turns on for a network, the phone asks to allow it: check "Always allow on this network".',
            "     Trust is per router (BSSID), so mesh nodes or separate 2.4/5 GHz networks each need one approval.",
          ].join("\n"),
        );
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
