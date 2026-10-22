/** Pure parsers for adb output. No I/O here. */
import { t } from "./i18n.js";

export type DeviceState =
  | "device"
  | "offline"
  | "unauthorized"
  | "authorizing"
  | "connecting"
  | "no permissions"
  | "recovery"
  | "sideload"
  | "bootloader"
  | "host"
  | string;

export interface AdbDeviceEntry {
  /** Transport serial as shown by `adb devices` (USB serial, ip:port or mDNS name). */
  serial: string;
  state: DeviceState;
  /** Model as reported by adb, underscores converted back to dashes (SM_S926N → SM-S926N). */
  model?: string;
  product?: string;
  device?: string;
  transportId?: string;
  usb?: string;
}

export interface MdnsService {
  /** Instance name, e.g. adb-R5CR10ABCDE-Xyz12A */
  instance: string;
  /** Service type without trailing dot, e.g. _adb-tls-connect._tcp */
  type: string;
  /** host:port */
  address: string;
  host: string;
  port: number;
  /** Physical serial extracted from instance name, if any. */
  serial?: string;
}

export const MDNS_CONNECT_TYPE = "_adb-tls-connect._tcp";

const IGNORED_LINE = /^(\*|List of |adb server|error:)/i;

/** Parse `adb devices -l`. */
export function parseDevicesList(output: string): AdbDeviceEntry[] {
  const result: AdbDeviceEntry[] = [];
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || IGNORED_LINE.test(line)) continue;
    const tokens = line.split(/\s+/);
    if (tokens.length < 2) continue;
    const serial = tokens[0]!;
    let state: string = tokens[1]!;
    let rest = tokens.slice(2);
    if (state === "no" && rest[0]?.startsWith("permissions")) {
      state = "no permissions";
      // Skip the parenthesised explanation that follows.
      const idx = rest.findIndex((t) => t.includes(":") && !t.startsWith("("));
      rest = idx >= 0 ? rest.slice(idx) : [];
    }
    const entry: AdbDeviceEntry = { serial, state };
    for (const tok of rest) {
      const colon = tok.indexOf(":");
      if (colon <= 0) continue;
      const key = tok.slice(0, colon);
      const value = tok.slice(colon + 1);
      switch (key) {
        case "model":
          entry.model = value.replace(/_/g, "-");
          break;
        case "product":
          entry.product = value;
          break;
        case "device":
          entry.device = value;
          break;
        case "transport_id":
          entry.transportId = value;
          break;
        case "usb":
          entry.usb = value;
          break;
      }
    }
    result.push(entry);
  }
  return result;
}

/** Split "host:port" (IPv4 or bracketed/unbracketed IPv6). */
export function splitHostPort(address: string): { host: string; port: number } | undefined {
  const m = /^\[?([^\]]+?)\]?:(\d{1,5})$/.exec(address.trim());
  if (!m) return undefined;
  const port = Number(m[2]);
  if (port <= 0 || port > 65535) return undefined;
  return { host: m[1]!, port };
}

/** True for transport serials of the form ip:port. */
export function isAddressSerial(serial: string): boolean {
  return splitHostPort(serial) !== undefined;
}

/** Extract physical serial from an mDNS instance name `adb-<serial>-<suffix>`. */
export function serialFromInstance(instance: string): string | undefined {
  const name = instance.replace(/\._adb[-\w]*\._tcp\.?$/i, "");
  const m = /^adb-(.+)-[^-]+$/.exec(name);
  return m ? m[1] : undefined;
}

/** True for transport serials adb creates when auto-connecting via mDNS. */
export function isMdnsSerial(serial: string): boolean {
  return /^adb-.+\._adb-tls-connect\._tcp\.?$/i.test(serial);
}

/** Parse `adb mdns services`. Returns all services; filter on `type` for connect entries. */
export function parseMdnsServices(output: string): MdnsService[] {
  const result: MdnsService[] = [];
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || IGNORED_LINE.test(line)) continue;
    // adb separates columns with tabs; instance names may contain spaces. Whitespace split only as a fallback.
    const tokens = line.includes("	") ? line.split("	").map((t) => t.trim()).filter(Boolean) : line.split(/\s+/);
    const typeIdx = tokens.findIndex((t) => /^_adb[-\w]*\._tcp\.?$/i.test(t));
    if (typeIdx <= 0 || typeIdx + 1 >= tokens.length) continue;
    const instance = tokens.slice(0, typeIdx).join(" ");
    const type = tokens[typeIdx]!.replace(/\.$/, "").toLowerCase();
    const address = tokens[typeIdx + 1]!;
    const hp = splitHostPort(address);
    if (!hp) continue;
    const svc: MdnsService = { instance, type, address: `${hp.host.includes(":") ? `[${hp.host}]` : hp.host}:${hp.port}`, host: hp.host, port: hp.port };
    const serial = serialFromInstance(instance);
    if (serial) svc.serial = serial;
    result.push(svc);
  }
  return result;
}

/** Only `_adb-tls-connect._tcp` services, de-duplicated by address. */
export function connectServices(services: MdnsService[]): MdnsService[] {
  const seen = new Set<string>();
  return services.filter((s) => {
    if (s.type !== MDNS_CONNECT_TYPE || seen.has(s.address)) return false;
    seen.add(s.address);
    return true;
  });
}

/** Result of `adb connect`: adb exits 0 even on failure, so inspect the text. */
export function parseConnectOutput(output: string): { ok: boolean; message: string } {
  const message = output.trim();
  const ok = /\b(connected to|already connected to)\b/i.test(message) && !/failed|unable|cannot/i.test(message);
  return { ok, message };
}

/** Detect a showing keyguard from `dumpsys window` (field names vary across Android/One UI versions). */
export function parseKeyguardShowing(dumpsys: string): boolean {
  return /\b(mDreamingLockscreen|isKeyguardShowing|mShowingLockscreen|mKeyguardShowing|keyguardShowing|showing)=true\b/i.test(
    dumpsys.split(/\r?\n/).filter((l) => /keyguard|lockscreen/i.test(l)).join("\n"),
  );
}

/** Screen-on state from `dumpsys power` (mWakefulness=Awake|Asleep|Dozing). */
export function parseWakefulness(dumpsys: string): string | undefined {
  return /mWakefulness=(\w+)/.exec(dumpsys)?.[1];
}

/** Map install failure output to an actionable hint (One UI Auto Blocker, Play Protect...). */
export function installFailureHint(output: string): string | undefined {
  if (/INSTALL_FAILED_VERIFICATION_FAILURE|Play Protect|INSTALL_FAILED_USER_RESTRICTED|user rejected|INSTALL_FAILED_ABORTED|Auto Blocker/i.test(output)) {
    return t("hint.install.blocked");
  }
  if (/INSTALL_FAILED_UPDATE_INCOMPATIBLE|INSTALL_FAILED_VERSION_DOWNGRADE/.test(output)) {
    return t("hint.install.incompatible");
  }
  if (/INSTALL_FAILED_INSUFFICIENT_STORAGE/.test(output)) return t("hint.install.storage");
  return undefined;
}

/** Validate `pair_device` input: ip:port (or host:port) of the pairing dialog and its 6-digit code. */
export function validatePairArgs(address: string, code: string): { address: string; code: string } {
  const addr = address.trim();
  const hp = splitHostPort(addr);
  if (!hp || !/^[\w.:%-]+$/.test(hp.host)) {
    throw new Error(t("pair.invalidAddress", address));
  }
  const c = code.replace(/[\s-]/g, "");
  if (!/^\d{6}$/.test(c)) throw new Error(t("pair.invalidCode", code));
  return { address: addr, code: c };
}

/** Result of `adb pair`: "Successfully paired to 192.168.0.23:37099 [guid=adb-R5CR10ABCDE-Xyz12A]". */
export function parsePairOutput(output: string): { ok: boolean; serial?: string; message: string } {
  const message = output.trim();
  const ok = /Successfully paired/i.test(message);
  const guid = /guid=([^\]\s]+)/.exec(message)?.[1];
  const serial = guid ? serialFromInstance(guid) : undefined;
  return serial ? { ok, serial, message } : { ok, message };
}
