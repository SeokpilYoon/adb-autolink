/**
 * iPhone support through Apple's `xcrun devicectl` (Xcode 15+, macOS only).
 *
 * CoreDevice owns pairing and the Wi-Fi connection, so unlike Android there is no port that changes
 * and no companion app: a phone paired once in Xcode (with "Connect via network") stays reachable on
 * the same network. Every command writes machine-readable JSON with --json-output; the key paths
 * follow Flutter's devicectl integration (flutter_tools/lib/src/ios/core_devices.dart).
 */
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const IS_MAC = process.platform === "darwin";

export interface IosDevice {
  /** CoreDevice identifier, what --device takes. */
  identifier: string;
  udid: string;
  name?: string;
  /** "iPhone16,1" */
  productType?: string;
  /** "iPhone 15 Pro" */
  marketingName?: string;
  osVersion?: string;
  /** "wired" (USB), "localNetwork" (Wi-Fi), or undefined when not reachable right now. */
  transport?: string;
  tunnelState?: string;
  paired: boolean;
  developerMode?: string;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

/** `devicectl list devices` -> iPhones and iPads (Macs, watches and TVs are left out). */
export function parseDeviceList(json: unknown): IosDevice[] {
  const devices = obj(obj(json).result).devices;
  if (!Array.isArray(devices)) return [];
  return devices.flatMap((d): IosDevice[] => {
    const hw = obj(obj(d).hardwareProperties);
    const dev = obj(obj(d).deviceProperties);
    const conn = obj(obj(d).connectionProperties);
    const platform = str(hw.platform)?.toLowerCase();
    const identifier = str(obj(d).identifier);
    if (!identifier || (platform && platform !== "ios")) return [];
    return [
      {
        identifier,
        udid: str(hw.udid) ?? identifier,
        name: str(dev.name),
        productType: str(hw.productType),
        marketingName: str(hw.marketingName),
        osVersion: str(dev.osVersionNumber),
        transport: str(conn.transportType),
        tunnelState: str(conn.tunnelState),
        paired: str(conn.pairingState) === "paired",
        developerMode: str(dev.developerModeStatus),
      },
    ];
  });
}

/** Reachable now (over USB or Wi-Fi) and paired with this Mac. */
export function isAvailable(d: IosDevice): boolean {
  const t = d.transport?.toLowerCase();
  return d.paired && (t === "wired" || t === "localnetwork");
}

/** `devicectl device info apps --bundle-id X` -> the app bundle's URL on the device. */
export function parseAppUrl(json: unknown, bundleId: string): string | undefined {
  const apps = obj(obj(json).result).apps;
  if (!Array.isArray(apps)) return undefined;
  return str(obj(apps.find((a) => str(obj(a).bundleIdentifier) === bundleId)).url);
}

/** PIDs of processes running from inside the app bundle (app extensions excluded). */
export function parsePids(json: unknown, appUrl: string): number[] {
  const procs = obj(obj(json).result).runningProcesses;
  if (!Array.isArray(procs)) return [];
  const base = appUrl.replace(/\/$/, "");
  return procs.flatMap((p) => {
    const exe = str(obj(p).executable);
    const pid = obj(p).processIdentifier;
    return exe && exe.startsWith(base) && !exe.includes(".appex") && typeof pid === "number" ? [pid] : [];
  });
}

/** "success", or the error devicectl reports. */
export function parseOutcome(json: unknown): { ok: boolean; message: string } {
  const info = obj(obj(json).info);
  const outcome = str(info.outcome) ?? "unknown";
  if (outcome === "success") return { ok: true, message: outcome };
  const err = obj(obj(json).error);
  const userInfo = obj(err.userInfo);
  const reason =
    str(obj(userInfo.NSLocalizedDescription).string) ??
    str(userInfo.NSLocalizedDescription) ??
    str(err.description) ??
    outcome;
  return { ok: false, message: reason };
}

export class IosUnavailableError extends Error {}

/** Run `xcrun devicectl <args> --json-output <tmp>` and return the parsed JSON (also on failure). */
export async function devicectl(args: string[], timeoutMs = 60_000): Promise<unknown> {
  if (!IS_MAC) throw new IosUnavailableError("iPhone support needs macOS with Xcode 15 or later (xcrun devicectl).");
  const dir = mkdtempSync(path.join(os.tmpdir(), "adbal-devicectl-"));
  const out = path.join(dir, "out.json");
  try {
    const { code, stderr } = await new Promise<{ code: number; stderr: string }>((resolve) => {
      execFile("xcrun", ["devicectl", ...args, "--json-output", out], { timeout: timeoutMs }, (err, _stdout, stderr) => {
        const e = err as (NodeJS.ErrnoException & { code?: number | string }) | null;
        resolve({ code: e ? (typeof e.code === "number" ? e.code : 1) : 0, stderr: String(stderr ?? "") });
      });
    });
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(out, "utf8"));
    } catch {
      if (/unable to find utility "devicectl"|xcrun: error/i.test(stderr)) {
        throw new IosUnavailableError("xcrun devicectl was not found. Install Xcode 15 or later and run `sudo xcode-select -s /Applications/Xcode.app`.");
      }
      throw new Error(`devicectl ${args.slice(0, 3).join(" ")} failed (exit ${code}): ${stderr.trim() || "no output"}`);
    }
    return json;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function run(args: string[], timeoutMs?: number): Promise<unknown> {
  const json = await devicectl(args, timeoutMs);
  const r = parseOutcome(json);
  if (!r.ok) throw new Error(`devicectl ${args.slice(0, 3).join(" ")}: ${r.message}`);
  return json;
}

let cache: { at: number; devices: IosDevice[] } | undefined;

/** Paired iPhones known to this Mac (cached for a few seconds: every tool call resolves its target). */
export async function listIosDevices(maxAgeMs = 3_000): Promise<IosDevice[]> {
  if (!IS_MAC) return [];
  if (cache && Date.now() - cache.at < maxAgeMs) return cache.devices;
  try {
    const devices = parseDeviceList(await devicectl(["list", "devices", "--timeout", "5"], 20_000));
    cache = { at: Date.now(), devices };
    return devices;
  } catch {
    return []; // no Xcode: Android keeps working
  }
}

export async function iosInstall(id: string, appPath: string): Promise<void> {
  await run(["device", "install", "app", "--device", id, appPath], 600_000);
}

export async function iosLaunch(id: string, bundleId: string): Promise<number | undefined> {
  const json = await run(["device", "process", "launch", "--device", id, "--terminate-existing", bundleId], 60_000);
  const pid = obj(obj(obj(json).result).process).processIdentifier;
  return typeof pid === "number" ? pid : undefined;
}

/** Kills every process of the app; returns how many were running. */
export async function iosTerminate(id: string, bundleId: string): Promise<number> {
  const url = parseAppUrl(await run(["device", "info", "apps", "--device", id, "--bundle-id", bundleId]), bundleId);
  if (!url) throw new Error(`${bundleId} is not installed on this iPhone.`);
  const pids = parsePids(await run(["device", "info", "processes", "--device", id]), url);
  for (const pid of pids) await run(["device", "process", "terminate", "--device", id, "--pid", String(pid), "--kill"]);
  return pids.length;
}

/** Saves a PNG screenshot to `dest` (devicectl in Xcode 16 and later). */
export async function iosScreenshot(id: string, dest: string): Promise<void> {
  await run(["device", "capture", "screenshot", "--device", id, "--destination", dest], 60_000);
}
