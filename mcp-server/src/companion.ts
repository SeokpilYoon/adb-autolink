import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { COMPANION_APK_URL } from "./config.js";
import { stateDir } from "./devices.js";

export function companionApkUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.ADB_AUTOLINK_APK_URL || COMPANION_APK_URL;
}

/**
 * Download the latest companion APK into ~/.adb-autolink/cache/ (follows GitHub's release redirects).
 * Falls back to a previously cached copy when the download fails.
 */
export async function downloadCompanionApk(): Promise<{ file: string; note: string }> {
  const url = companionApkUrl();
  const dir = path.join(stateDir(), "cache");
  const file = path.join(dir, "adb-autolink.apk");
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const buf = Buffer.from(await res.arrayBuffer());
    // An APK is a ZIP archive.
    if (buf.length < 1024 || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error(`response is not an APK (${buf.length} bytes)`);
    mkdirSync(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, buf);
    renameSync(tmp, file);
    return { file, note: `downloaded ${url} (${(buf.length / 1024 / 1024).toFixed(1)} MB) -> ${file}` };
  } catch (e) {
    const msg = (e as Error).message;
    if (existsSync(file)) return { file, note: `download failed (${msg}); using cached ${file}` };
    throw new Error(`Could not download the companion APK from ${url}: ${msg}\nDownload it manually and pass apk_path.`);
  }
}
