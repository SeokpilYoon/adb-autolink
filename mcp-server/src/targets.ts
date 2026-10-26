/**
 * Routes a tool call to an iPhone (macOS + devicectl) or, as before, to Android over adb.
 * The `device` parameter is shared: aliases, model names ("iPhone 15 Pro") and UDIDs pick an iPhone,
 * anything else keeps the Android path.
 */
import { listAdbDevices } from "./connector.js";
import { DeviceSelectionError, type DeviceCandidate, describeCandidate, loadAliases, matchSelector, rememberDevice } from "./devices.js";
import { t } from "./i18n.js";
import { IS_MAC, type IosDevice, isAvailable, listIosDevices } from "./ios.js";

export function iosCandidate(d: IosDevice): DeviceCandidate {
  return {
    serial: d.identifier,
    physicalSerial: d.udid,
    model: d.productType,
    marketName: d.marketingName,
    state: isAvailable(d) ? "device" : "offline",
  };
}

/** Remember paired iPhones like Android phones, so they get model-name aliases and show in the saved table. */
function rememberIos(devices: IosDevice[]): void {
  for (const d of devices) {
    if (d.productType) rememberDevice(d.udid, { model: d.productType, marketName: d.marketingName ?? "", platform: "ios" });
  }
}

/**
 * The iPhone a tool call is for, or undefined when it is for Android.
 * Without a selector an iPhone is chosen only if it is the single reachable one and no Android device is online.
 */
export async function iosTarget(selector?: string): Promise<IosDevice | undefined> {
  if (!IS_MAC) return undefined;
  const devices = await listIosDevices();
  if (devices.length === 0) return undefined;
  rememberIos(devices);
  const aliases = loadAliases();
  const cands = devices.map(iosCandidate);

  if (selector?.trim()) {
    const hits = matchSelector(selector, cands, aliases);
    if (hits.length === 0) return undefined;
    if (hits.length > 1) {
      throw new DeviceSelectionError(
        `"${selector}" matches several iPhones:\n${hits.map((c) => `  - ${describeCandidate(c, aliases)}`).join("\n")}`,
      );
    }
    const d = devices.find((x) => x.identifier === hits[0]!.serial)!;
    if (!isAvailable(d)) throw new DeviceSelectionError(t("ios.notReachable", d.marketingName ?? d.name ?? d.udid));
    return d;
  }

  const reachable = devices.filter(isAvailable);
  if (reachable.length !== 1) return undefined;
  const androidOnline = (await listAdbDevices().catch(() => [])).some((d) => d.state === "device");
  return androidOnline ? undefined : reachable[0];
}

/** For tools that are Android-only for now: a clear error instead of an adb failure. */
export async function androidOnly(selector: string | undefined, tool: string): Promise<void> {
  if (await iosTarget(selector)) throw new Error(t("ios.unsupported", tool));
}

export function describeIos(d: IosDevice): string {
  const via = d.transport?.toLowerCase() === "wired" ? "USB" : "Wi-Fi";
  return `${d.marketingName ?? d.productType ?? "iPhone"} "${d.name ?? ""}" iOS ${d.osVersion ?? "?"} udid=${d.udid} [${via}]`;
}
