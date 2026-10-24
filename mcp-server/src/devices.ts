import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { splitHostPort } from "./parse.js";

/** Samsung market name (normalized) → model code prefix. */
export const SAMSUNG_MODELS: ReadonlyArray<{ name: string; key: string; prefix: string }> = [
  { name: "Galaxy S21", key: "s21", prefix: "SM-G991" },
  { name: "Galaxy S21+", key: "s21+", prefix: "SM-G996" },
  { name: "Galaxy S21 Ultra", key: "s21ultra", prefix: "SM-G998" },
  { name: "Galaxy S21 FE", key: "s21fe", prefix: "SM-G990" },
  { name: "Galaxy S24", key: "s24", prefix: "SM-S921" },
  { name: "Galaxy S24+", key: "s24+", prefix: "SM-S926" },
  { name: "Galaxy S24 Ultra", key: "s24ultra", prefix: "SM-S928" },
  { name: "Galaxy S24 FE", key: "s24fe", prefix: "SM-S721" },
];

/** "Galaxy S24 Plus" → "s24+", "s24 ultra" → "s24ultra". */
export function normalizeMarketName(s: string): string {
  return s
    .toLowerCase()
    .replace(/samsung|galaxy/g, "")
    .replace(/\bplus\b|plus$/g, "+")
    .replace(/[\s_\-]+/g, "")
    .replace(/5g$/, "");
}

/** "SM_S926N" / "sm s926n" → "SM-S926N". */
export function normalizeModelCode(s: string): string {
  return s.toUpperCase().replace(/[\s_]+/g, "-").replace(/^SM-?/, "SM-");
}

export function marketNameForModel(model: string | undefined): string | undefined {
  if (!model) return undefined;
  const code = normalizeModelCode(model);
  return SAMSUNG_MODELS.find((m) => code.startsWith(m.prefix))?.name;
}

/** A device candidate considered by resolveDevice (online, offline, or only discovered via mDNS). */
export interface DeviceCandidate {
  /** Transport serial used with `adb -s` (empty for mDNS-only entries). */
  serial: string;
  /** Physical device serial (ro.serialno) if known. */
  physicalSerial?: string;
  /** ip:port if wireless. */
  address?: string;
  model?: string;
  state: string;
}

export type AliasMap = Record<string, string>;

export class DeviceSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeviceSelectionError";
  }
}

function idOf(c: DeviceCandidate): string {
  return c.physicalSerial ?? c.serial ?? c.address ?? "";
}

/** Collapse multiple transports of the same physical device (USB + Wi-Fi) into the first one. */
export function uniquePhysical(cands: DeviceCandidate[]): DeviceCandidate[] {
  const seen = new Set<string>();
  return cands.filter((c) => {
    const id = idOf(c);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * Pure selector matching. Tiers (first tier that yields matches wins):
 * exact serial (transport or physical) → ip:port → alias → Samsung market name → model code substring.
 */
export function matchSelector(selector: string, cands: DeviceCandidate[], aliases: AliasMap = {}): DeviceCandidate[] {
  const sel = selector.trim();
  if (!sel) return [];
  const lower = sel.toLowerCase();

  const tiers: Array<(c: DeviceCandidate) => boolean> = [
    (c) => c.serial.toLowerCase() === lower || (c.physicalSerial?.toLowerCase() ?? "") === lower,
    (c) => splitHostPort(sel) !== undefined && (c.address === sel || c.serial === sel),
    (c) => {
      const entry = Object.entries(aliases).find(([a]) => aliasKey(a) === aliasKey(sel));
      if (!entry) return false;
      const target = entry[1].toLowerCase();
      return (c.physicalSerial?.toLowerCase() ?? c.serial.toLowerCase()) === target || c.serial.toLowerCase() === target;
    },
    (c) => {
      const known = SAMSUNG_MODELS.find((m) => m.key === normalizeMarketName(sel));
      return !!known && !!c.model && normalizeModelCode(c.model).startsWith(known.prefix);
    },
    (c) => {
      const needle = sel.toUpperCase().replace(/[\s_\-]+/g, "");
      if (needle.length < 3 || !c.model) return false;
      return c.model.toUpperCase().replace(/[\s_\-]+/g, "").includes(needle);
    },
  ];

  for (const tier of tiers) {
    const hits = uniquePhysical(cands.filter(tier));
    if (hits.length > 0) return hits;
  }
  return [];
}

export function describeCandidate(c: DeviceCandidate, aliases: AliasMap = {}): string {
  const id = c.physicalSerial ?? c.serial;
  const alias = Object.entries(aliases).find(([, s]) => s === id)?.[0];
  const parts = [c.serial || c.address || id];
  const market = marketNameForModel(c.model);
  if (c.model) parts.push(market ? `${market} (${c.model})` : c.model);
  if (alias) parts.push(`alias=${alias}`);
  if (c.physicalSerial && c.physicalSerial !== c.serial) parts.push(`serial=${c.physicalSerial}`);
  parts.push(`[${c.state}]`);
  return parts.join(" ");
}

/**
 * Choose exactly one device among `online` candidates.
 * Throws DeviceSelectionError when nothing or more than one physical device matches.
 * Returns undefined when no selector is given and there are no online devices (caller may try connecting).
 */
export function resolveDevice(
  selector: string | undefined,
  online: DeviceCandidate[],
  aliases: AliasMap = {},
): DeviceCandidate | undefined {
  if (!selector || !selector.trim()) {
    const uniq = uniquePhysical(online);
    if (uniq.length === 1) return uniq[0];
    if (uniq.length === 0) return undefined;
    throw new DeviceSelectionError(
      `Multiple devices are online; pass "device" (serial, ip:port, alias or model like "S21"/"S24+"):\n` +
        uniq.map((c) => `  - ${describeCandidate(c, aliases)}`).join("\n"),
    );
  }
  const hits = matchSelector(selector, online, aliases);
  if (hits.length === 1) return hits[0];
  if (hits.length === 0) return undefined;
  throw new DeviceSelectionError(
    `Selector "${selector}" matches multiple devices; be more specific:\n` +
      hits.map((c) => `  - ${describeCandidate(c, aliases)}`).join("\n"),
  );
}

// ---------------------------------------------------------------------------
// Persistent state (~/.adb-autolink, override with ADB_AUTOLINK_HOME)

export function stateDir(): string {
  return process.env.ADB_AUTOLINK_HOME ?? path.join(os.homedir(), ".adb-autolink");
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path.join(stateDir(), file), "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown): void {
  const dir = stateDir();
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, file);
  const tmp = `${target}.${process.pid}.tmp`;
  const json = JSON.stringify(data, null, 2);
  writeFileSync(tmp, json, "utf8");
  // Windows: antivirus/indexers or a concurrent reader can briefly lock the target (EPERM/EBUSY).
  for (let i = 0; ; i++) {
    try {
      renameSync(tmp, target);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if ((code !== "EPERM" && code !== "EBUSY" && code !== "EACCES") || i >= 4) break;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (i + 1));
    }
  }
  rmSync(tmp, { force: true });
  writeFileSync(target, json, "utf8");
}

export function loadAliases(): AliasMap {
  return readJson<AliasMap>("aliases.json", {});
}

/** Aliases compare ignoring case, spaces, "_" and "-", so "S21-2", "s21 2" and "S21_2" are the same. */
export function aliasKey(alias: string): string {
  return alias.toLowerCase().replace(/[\s_\-]+/g, "");
}

function saveAliases(aliases: AliasMap, alias: string): void {
  try {
    writeJson("aliases.json", aliases);
  } catch (e) {
    throw new Error(`Could not save alias "${alias}" to ${path.join(stateDir(), "aliases.json")}: ${(e as Error).message}`);
  }
}

export function setAlias(alias: string, physicalSerial: string): AliasMap {
  const a = alias.trim();
  if (!a || /[:\s]/.test(a)) throw new Error(`Invalid alias "${alias}" (must be non-empty, no spaces or colons)`);
  const aliases = loadAliases();
  for (const key of Object.keys(aliases)) if (aliasKey(key) === aliasKey(a)) delete aliases[key];
  aliases[a] = physicalSerial;
  saveAliases(aliases, a);
  return aliases;
}

/** Removes an alias (matched like a selector). Throws if there is no such alias. */
export function removeAlias(alias: string): AliasMap {
  const aliases = loadAliases();
  const key = Object.keys(aliases).find((k) => aliasKey(k) === aliasKey(alias));
  if (!key) throw new Error(`No alias "${alias}". Saved aliases: ${Object.keys(aliases).join(", ") || "(none)"}`);
  delete aliases[key];
  saveAliases(aliases, key);
  return aliases;
}

/** "Galaxy S24+" -> "S24+", "Galaxy S24 Ultra" -> "S24Ultra"; models without a market name use their code. */
export function autoAliasBase(model: string): string {
  const market = marketNameForModel(model);
  return market ? market.replace(/^Galaxy\s+/, "").replace(/\s+/g, "") : normalizeModelCode(model);
}

/** base, then base-2, base-3, ... : the first one no other phone uses. */
export function nextAutoAlias(base: string, aliases: AliasMap): string {
  const taken = new Set(Object.keys(aliases).map(aliasKey));
  let alias = base;
  for (let n = 2; taken.has(aliasKey(alias)); n++) alias = `${base}-${n}`;
  return alias;
}

/**
 * Gives a newly seen phone its model name as alias ("S21", then "S21-2" for a second S21), once:
 * a phone that already has an alias, or whose auto alias the user removed, is left alone.
 */
export function ensureAutoAlias(physicalSerial: string): void {
  const all = loadKnownDevices();
  const known = all[physicalSerial];
  if (!known?.model || known.autoAlias) return;
  const aliases = loadAliases();
  if (!Object.values(aliases).includes(physicalSerial)) {
    aliases[nextAutoAlias(autoAliasBase(known.model), aliases)] = physicalSerial;
    try {
      writeJson("aliases.json", aliases);
    } catch {
      return; // try again next time
    }
  }
  all[physicalSerial] = { ...known, autoAlias: true };
  try {
    writeJson("devices.json", all);
  } catch {
    // best effort
  }
}

/** Remembered device facts so model/alias selectors work before the device is connected. */
export interface KnownDevice {
  model?: string;
  product?: string;
  lastAddress?: string;
  lastSeen?: string;
  /** The automatic model-name alias was handled (given, or the phone already had one). Never redone. */
  autoAlias?: boolean;
}

export function loadKnownDevices(): Record<string, KnownDevice> {
  return readJson<Record<string, KnownDevice>>("devices.json", {});
}

export function rememberDevice(physicalSerial: string, info: KnownDevice): void {
  const all = loadKnownDevices();
  const prev = all[physicalSerial] ?? {};
  const next = { ...prev, ...Object.fromEntries(Object.entries(info).filter(([, v]) => v !== undefined)) };
  const unchanged = JSON.stringify(prev) === JSON.stringify({ ...next, lastSeen: prev.lastSeen });
  // Unchanged facts still refresh lastSeen now and then, so "last connected" stays meaningful.
  const fresh = !!prev.lastSeen && Date.now() - Date.parse(prev.lastSeen) < LAST_SEEN_REFRESH_MS;
  if (!unchanged || !fresh) {
    next.lastSeen = new Date().toISOString();
    all[physicalSerial] = next;
    try {
      writeJson("devices.json", all);
    } catch {
      // best effort
    }
  }
  ensureAutoAlias(physicalSerial);
}

const LAST_SEEN_REFRESH_MS = 10 * 60 * 1000;

/**
 * Decide which discovered, not-online mDNS entries to `adb connect` (pure).
 * - selector: connect entries matching it (remembered ones by remembered model/alias, any by serial/alias);
 *   if none match, bootstrap: connect the unremembered entries so their model can be learned, then the caller
 *   disconnects the ones that turn out not to match.
 * - no selector: connect remembered entries; unremembered ones only on first run (nothing remembered at all).
 */
export function planConnect<T extends DeviceCandidate>(
  selector: string | undefined,
  notOnline: T[],
  known: Record<string, KnownDevice>,
  aliases: AliasMap = {},
): { connect: T[]; bootstrap: boolean } {
  const isKnown = (c: T) => !!c.physicalSerial && !!known[c.physicalSerial];
  const unknown = notOnline.filter((c) => !isKnown(c));
  if (!selector?.trim()) {
    const remembered = notOnline.filter(isKnown);
    return { connect: remembered.length || Object.keys(known).length ? remembered : unknown, bootstrap: false };
  }
  const withModel = notOnline.map((c) => (isKnown(c) && !c.model ? { ...c, model: known[c.physicalSerial!]!.model } : c));
  const hits = new Set(matchSelector(selector, withModel, aliases));
  const matched = notOnline.filter((_, i) => hits.has(withModel[i]!));
  return matched.length ? { connect: matched, bootstrap: false } : { connect: unknown, bootstrap: true };
}
