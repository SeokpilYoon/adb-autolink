import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { COMPANION_APK_SHA256, COMPANION_APK_URL, COMPANION_PACKAGE } from "./config.js";
import { stateDir } from "./devices.js";
import { t } from "./i18n.js";

export function companionApkUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.ADB_AUTOLINK_APK_URL || COMPANION_APK_URL;
}

/** True if this is the APK released with this version. It gets powerful permissions, so nothing else will do. */
export function apkMatchesPin(apk: Buffer, pin = COMPANION_APK_SHA256): boolean {
  return createHash("sha256").update(apk).digest("hex") === pin;
}

/**
 * Download this version's companion APK into ~/.adb-autolink/cache/ (follows GitHub's release redirects)
 * and check it against the hash pinned in this build. Falls back to a cached copy that passes the same
 * check when the download fails. ADB_AUTOLINK_APK_URL is a deliberate override and skips the check.
 */
export async function downloadCompanionApk(): Promise<{ file: string; note: string }> {
  const url = companionApkUrl();
  const dir = path.join(stateDir(), "cache");
  const file = path.join(dir, "adb-autolink.apk");
  const trusted = (apk: Buffer) => !!process.env.ADB_AUTOLINK_APK_URL || apkMatchesPin(apk);
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const buf = Buffer.from(await res.arrayBuffer());
    // An APK is a ZIP archive.
    if (buf.length < 1024 || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error(`response is not an APK (${buf.length} bytes)`);
    if (!trusted(buf)) throw new Error("the file does not match the hash pinned in this version");
    mkdirSync(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, buf);
    renameSync(tmp, file);
    return { file, note: t("companion.downloaded", url, (buf.length / 1024 / 1024).toFixed(1), file) };
  } catch (e) {
    const msg = (e as Error).message;
    if (existsSync(file) && trusted(readFileSync(file))) return { file, note: t("companion.cached", msg, file) };
    throw new Error(t("companion.downloadFailed", url, msg));
  }
}

/**
 * Shell commands that grant what the app would otherwise ask for screen by screen: location
 * ("Allow all the time" reads the SSID in the background), notifications (API 33+), and exemptions
 * from battery optimization and unused-app permission removal. All are allowed for adb shell.
 */
export function companionSetupCommands(sdk: number, pkg = COMPANION_PACKAGE): string[] {
  const perms = ["ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION", "ACCESS_BACKGROUND_LOCATION"];
  if (sdk >= 33) perms.push("POST_NOTIFICATIONS");
  return [
    ...perms.map((p) => `pm grant ${pkg} android.permission.${p}`),
    `dumpsys deviceidle whitelist +${pkg}`,
    `cmd appops set ${pkg} RUN_ANY_IN_BACKGROUND allow`,
    `cmd appops set ${pkg} AUTO_REVOKE_PERMISSIONS_IF_UNUSED ignore`,
  ];
}

/** Android forgets a PC key unused for 7 days, which would force re-pairing; 0 keeps it. */
export const AUTH_TIMEOUT_OFF_COMMAND = "settings put global adb_allowed_connection_time 0";

/** True when a setup shell command printed nothing that looks like a failure. */
export function setupCommandOk(output: string): boolean {
  return !/exception|error|unknown|not found|bad argument/i.test(output);
}

export interface SetupOptions {
  addCurrentWifi: boolean;
  /** This PC's key: the app answers only a PC proving it, and proves it back. Handed over here, through adb. */
  wakeKey?: string;
  /** ro.serialno, echoed in beacon replies (apps cannot read it themselves). */
  serial?: string;
}

/** Broadcast to the app's SetupReceiver (protected by DUMP, which only adb shell holds). */
export function setupBroadcastCommand(o: SetupOptions, pkg = COMPANION_PACKAGE): string {
  const extras = [`--ez add_current_wifi ${o.addCurrentWifi}`];
  // Both go through the device shell unquoted, so only accept their plain formats.
  if (o.wakeKey && /^[0-9a-f]{64}$/.test(o.wakeKey)) extras.push(`--es wake_key ${o.wakeKey}`);
  if (o.serial && /^[\w.-]{1,64}$/.test(o.serial)) extras.push(`--es serial ${o.serial}`);
  return `am broadcast -n ${pkg}/.SetupReceiver -a ${pkg}.action.SETUP ${extras.join(" ")}`;
}

/** Asks the app to prove, over this adb connection, that it holds this PC's key. Only adb shell may send this. */
export function proveCommand(challenge: string, pkg = COMPANION_PACKAGE): string {
  return `am broadcast -n ${pkg}/.SetupReceiver -a ${pkg}.action.PROVE --es challenge ${challenge}`;
}

/** `data="proof:<hex>,<hex>"`: one MAC per key the app holds. */
export function parseProofs(output: string): string[] {
  const data = /Broadcast completed:.*?data="proof:([0-9a-f,]*)"\s*$/m.exec(output)?.[1];
  return data ? data.split(",").filter(Boolean) : [];
}

export type SetupResult =
  | { kind: "whitelisted"; ssid: string }
  | { kind: "no_ssid" }
  | { kind: "ok" }
  | { kind: "unknown"; raw: string };

/** Parse `am broadcast` output: `Broadcast completed: result=-1, data="whitelisted:<ssid>"`. */
export function parseSetupBroadcast(output: string): SetupResult {
  const data = /Broadcast completed:.*?data="(.*)"\s*$/m.exec(output)?.[1];
  if (data?.startsWith("whitelisted:")) return { kind: "whitelisted", ssid: data.slice("whitelisted:".length) };
  if (data === "no_ssid") return { kind: "no_ssid" };
  if (data === "ok") return { kind: "ok" };
  return { kind: "unknown", raw: output.trim() };
}
