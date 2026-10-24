import { runAdb } from "./adb.js";
import { type BeaconReply, beaconToken, queryBeacon, scanBeacons, subnetHosts } from "./beacon.js";
import { latestReport } from "./checkpoints.js";
import { COMPANION_APP_NAME } from "./config.js";
import {
  type AliasMap,
  type DeviceCandidate,
  DeviceSelectionError,
  describeCandidate,
  displayName,
  ensureAutoAlias,
  loadAliases,
  loadKnownDevices,
  marketNameForModel,
  matchSelector,
  normalizeModelCode,
  planConnect,
  rememberDevice,
  resolveDevice,
  uniquePhysical,
} from "./devices.js";
import {
  type AdbDeviceEntry,
  type MdnsService,
  connectServices,
  isAddressSerial,
  isMdnsSerial,
  parseConnectOutput,
  parseDevicesList,
  parseMdnsServices,
  serialFromInstance,
  splitHostPort,
} from "./parse.js";
import { guideUrl, t } from "./i18n.js";

/** ip:port → ro.serialno (ports change per session, so this never goes stale for a live address). */
const addressSerialCache = new Map<string, string>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface DeviceInfo extends DeviceCandidate {
  entry?: AdbDeviceEntry;
  mdns?: MdnsService;
}

/** ro.product.marketname, else ro.product.model; "" if neither answers. */
async function reportedProductName(serial: string): Promise<string> {
  for (const prop of ["ro.product.marketname", "ro.product.model"]) {
    try {
      const r = await runAdb(["shell", "getprop", prop], { serial, timeoutMs: 5_000 });
      const v = r.stdout.trim();
      if (v) return v;
    } catch {
      // try the next one
    }
  }
  return "";
}

/** `adb devices -l` with physical serials filled in. */
export async function listAdbDevices(): Promise<DeviceInfo[]> {
  const { stdout } = await runAdb(["devices", "-l"], { timeoutMs: 15_000 });
  const entries = parseDevicesList(stdout);
  const known = loadKnownDevices();
  const result: DeviceInfo[] = [];
  for (const e of entries) {
    const info: DeviceInfo = { serial: e.serial, state: e.state, entry: e };
    if (e.model) info.model = e.model;
    if (isMdnsSerial(e.serial)) {
      const s = serialFromInstance(e.serial);
      if (s) info.physicalSerial = s;
    } else if (isAddressSerial(e.serial)) {
      info.address = e.serial;
      let phys = addressSerialCache.get(e.serial);
      if (!phys && e.state === "device") {
        try {
          const r = await runAdb(["shell", "getprop", "ro.serialno"], { serial: e.serial, timeoutMs: 5_000 });
          phys = r.stdout.trim() || undefined;
          if (phys) addressSerialCache.set(e.serial, phys);
        } catch {
          // leave unknown
        }
      }
      if (phys) info.physicalSerial = phys;
    } else {
      info.physicalSerial = e.serial;
    }
    if (info.physicalSerial) {
      const k = known[info.physicalSerial];
      if (!info.model && k?.model) info.model = k.model;
      let marketName = k?.marketName;
      // Phones outside the Galaxy table: ask once for the name people use ("Pixel 8"), before the
      // auto alias is chosen. An empty string records that the phone has none.
      if (marketName === undefined && e.state === "device" && !marketNameForModel(info.model)) {
        marketName = await reportedProductName(e.serial);
      }
      if (marketName) info.marketName = marketName;
      if (e.state === "device" && (e.model || info.address)) {
        rememberDevice(info.physicalSerial, { model: e.model, product: e.product, lastAddress: info.address, marketName });
      }
    }
    result.push(info);
  }
  return result;
}

let serverStarted = false;

/** `adb mdns services`, `_adb-tls-connect._tcp` entries only, enriched from remembered devices. */
export async function discoverMdns(): Promise<DeviceInfo[]> {
  let stdout = "";
  try {
    // A freshly started adb server often reports no services on its first query; start it explicitly first.
    if (!serverStarted) {
      const r = await runAdb(["start-server"], { timeoutMs: 15_000, allowFailure: true });
      serverStarted = r.code === 0;
    }
    stdout = (await runAdb(["mdns", "services"], { timeoutMs: 6_000, allowFailure: true })).stdout;
  } catch {
    return [];
  }
  const known = loadKnownDevices();
  return connectServices(parseMdnsServices(stdout)).map((svc) => {
    const info: DeviceInfo = { serial: "", address: svc.address, state: "discovered", mdns: svc };
    if (svc.serial) {
      info.physicalSerial = svc.serial;
      const model = known[svc.serial]?.model;
      if (model) info.model = model;
    }
    return info;
  });
}

const online = (d: DeviceInfo) => d.state === "device";

export function troubleshootingHint(): string {
  return `${t("hint.troubleshoot", COMPANION_APP_NAME)}\n${t("hint.guide", guideUrl())}`;
}

async function adbConnect(address: string, timeoutMs = 10_000): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await runAdb(["connect", address], { timeoutMs, allowFailure: true });
    return parseConnectOutput(`${r.stdout}\n${r.stderr}`);
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function adbDisconnect(serial: string): Promise<string> {
  const r = await runAdb(["disconnect", serial], { timeoutMs: 5_000, allowFailure: true });
  addressSerialCache.delete(serial);
  return `${r.stdout}${r.stderr}`.trim();
}

/** Disconnect offline wireless transports that belong to the same phone (same physical serial or host, different port). */
async function cleanupStale(devices: DeviceInfo[], target: DeviceInfo, log: string[]): Promise<void> {
  const host = target.address ? splitHostPort(target.address)?.host : undefined;
  for (const d of devices) {
    if (d.state === "device") continue;
    if (!isAddressSerial(d.serial) && !isMdnsSerial(d.serial)) continue;
    if (d.serial === target.address) continue;
    const samePhys = !!target.physicalSerial && d.physicalSerial === target.physicalSerial;
    const sameHost = !!host && !!d.address && splitHostPort(d.address)?.host === host;
    if (samePhys || sameHost) {
      await adbDisconnect(d.serial);
      log.push(`disconnected stale ${d.serial} (${d.state})`);
    }
  }
}

export interface EnsureResult {
  serial: string;
  device: DeviceInfo;
  log: string[];
}

function pick(selector: string | undefined, devices: DeviceInfo[], aliases: AliasMap): DeviceInfo | undefined {
  return resolveDevice(selector, devices.filter(online), aliases) as DeviceInfo | undefined;
}

/** A wireless transport can stay in "device" state after the phone changed port; probe it (twice before giving up). */
async function isResponsive(d: DeviceInfo): Promise<boolean> {
  if (!isAddressSerial(d.serial) && !isMdnsSerial(d.serial)) return true;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await runAdb(["shell", "echo", "ok"], { serial: d.serial, timeoutMs: 8_000 });
      if (r.stdout.trim() === "ok") return true;
    } catch {
      // retry once
    }
  }
  return false;
}

/** Return the selected online device after verifying it responds; drops dead wireless transports. */
async function pickLive(selector: string | undefined, devices: DeviceInfo[], aliases: AliasMap, log: string[]) {
  const hit = pick(selector, devices, aliases);
  if (!hit) return undefined;
  if (await isResponsive(hit)) return hit;
  await adbDisconnect(hit.serial);
  log.push(`dropped unresponsive ${hit.serial}`);
  return undefined;
}

/** Remembered devices (model + last ip:port) as candidates, so "S21" resolves while offline. */
function knownCandidates(): DeviceInfo[] {
  return Object.entries(loadKnownDevices())
    .filter(([, k]) => k.lastAddress)
    .map(([phys, k]) => ({
      serial: "",
      physicalSerial: phys,
      address: k.lastAddress,
      model: k.model,
      marketName: k.marketName || undefined,
      state: "known",
    }));
}

/** Transports belonging to any of `targets` (by ip:port or physical serial). */
const isTargetOf = (targets: DeviceInfo[]) => (d: DeviceInfo) =>
  targets.some(
    (t) => (!!t.address && (d.serial === t.address || d.address === t.address)) || (!!t.physicalSerial && d.physicalSerial === t.physicalSerial),
  );

/** Serializes ensureConnected: parallel tool calls must not disconnect each other's devices or double-connect. */
let connectLock: Promise<unknown> = Promise.resolve();

/**
 * Make sure the selected device is connected and return its transport serial.
 * On-demand: lists devices; if the target is not online, tries its last known ip:port,
 * then discovers it via mDNS and runs `adb connect`.
 */
export function ensureConnected(selector?: string): Promise<EnsureResult> {
  const run = connectLock.then(() => ensureConnectedUnlocked(selector));
  connectLock = run.catch(() => undefined);
  return run;
}

async function ensureConnectedUnlocked(selector?: string): Promise<EnsureResult> {
  const log: string[] = [];
  const aliases = loadAliases();
  let devices = await listAdbDevices();
  let hit = await pickLive(selector, devices, aliases, log);
  if (hit) return { serial: hit.serial, device: hit, log };
  if (log.length) devices = await listAdbDevices();

  // Fast path: last known ip:port of the selected (or only remembered) device.
  if (!selector || !splitHostPort(selector.trim())) {
    const known = knownCandidates();
    const targets = selector ? matchSelector(selector, known, aliases) : known.length === 1 ? known : [];
    if (targets.length === 1 && targets[0]!.address) {
      const addr = targets[0]!.address;
      const r = await adbConnect(addr, 3_000);
      log.push(`adb connect ${addr} (last known): ${r.message}`);
      if (r.ok) {
        devices = await waitForOnline(() => pick(selector, devices, aliases), (d) => (devices = d), isTargetOf(targets as DeviceInfo[]));
        hit = await pickLive(selector, devices, aliases, log);
        if (hit) return { serial: hit.serial, device: hit, log };
      }
    }
  }

  // Direct ip:port selector: just try it.
  if (selector && splitHostPort(selector.trim())) {
    const addr = selector.trim();
    const r = await adbConnect(addr);
    log.push(`adb connect ${addr}: ${r.message}`);
    devices = await waitForOnline(() => pick(selector, devices, aliases), (d) => (devices = d), isTargetOf([{ serial: "", address: addr, state: "" }]));
    hit = pick(selector, devices, aliases);
    if (hit) return { serial: hit.serial, device: hit, log };
  }

  // Port beacon: ask the companion app for its current port. Unicast TCP, so it works where mDNS is blocked.
  const beacon = await connectViaBeacon(selector, devices, aliases, log);
  if (beacon.hit) return { serial: beacon.hit.serial, device: beacon.hit, log };

  const backoff = [0, 700, 1500, 2500];
  const attempted = new Set<string>();
  let lastDiscovered: DeviceInfo[] = [];
  for (const delay of backoff) {
    if (delay) await sleep(delay);
    // adb's own mDNS auto-connect may have brought the device up meanwhile.
    devices = await listAdbDevices();
    hit = pick(selector, devices, aliases);
    if (hit) return { serial: hit.serial, device: hit, log };
    const discovered = await discoverMdns();
    lastDiscovered = discovered;
    if (discovered.length === 0) continue;

    const onlinePhys = new Set(devices.filter(online).map((d) => d.physicalSerial).filter(Boolean));
    const notOnline = discovered.filter((d) => !d.physicalSerial || !onlinePhys.has(d.physicalSerial));
    const plan = planConnect(selector, notOnline, loadKnownDevices(), aliases);
    const targets = plan.connect.filter((t) => !attempted.has(t.address!));
    if (targets.length === 0) continue;

    for (const t of targets) {
      attempted.add(t.address!);
      await cleanupStale(devices, t, log);
      const r = await adbConnect(t.address!);
      log.push(`adb connect ${t.address}${t.physicalSerial ? ` (${t.physicalSerial})` : ""}: ${r.message}`);
      if (r.ok && t.physicalSerial) rememberDevice(t.physicalSerial, { lastAddress: t.address });
    }
    // When bootstrapping, wait for every target to settle so non-matching ones can be dropped below.
    const check = plan.bootstrap ? () => undefined : () => pick(selector, devices, aliases);
    devices = await waitForOnline(check, (d) => (devices = d), isTargetOf(targets));
    if (plan.bootstrap && selector) {
      // Models are now remembered (listAdbDevices); drop bootstrap connections that are not the requested device.
      const extra = devices.filter((d) => online(d) && isTargetOf(targets)(d) && !matchSelector(selector, [d], aliases).length);
      for (const d of extra) log.push(`disconnected non-matching ${d.serial}${d.model ? ` (${d.model})` : ""}: ${await adbDisconnect(d.serial)}`);
      if (extra.length) devices = await listAdbDevices();
    }
    hit = pick(selector, devices, aliases);
    if (hit) return { serial: hit.serial, device: hit, log };
  }

  const onlineNow = uniquePhysical(devices.filter(online));
  const parts: string[] = [];
  if (selector) {
    parts.push(t("connect.notConnected", selector));
  } else {
    parts.push(t("connect.noOnline"));
  }
  if (onlineNow.length) parts.push(`${t("connect.onlineDevices")}\n${onlineNow.map((d) => `  - ${describeCandidate(d, aliases)}`).join("\n")}`);
  if (lastDiscovered.length)
    parts.push(`${t("connect.discovered")}\n${lastDiscovered.map((d) => `  - ${d.mdns?.instance} ${d.address}`).join("\n")}`);
  if (log.length) parts.push(`${t("connect.attempts")}\n${log.map((l) => `  - ${l}`).join("\n")}`);
  if (beacon.off.length) parts.push(t("beacon.adbOff", beacon.off.map((r) => `${r.serial} (${r.host})`).join(", ")));
  const unauthorized = devices.filter((d) => d.state === "unauthorized");
  if (unauthorized.length) parts.push(t("connect.unauthorized", unauthorized.map((d) => d.serial).join(", ")));
  parts.push(troubleshootingHint());
  throw new DeviceSelectionError(parts.join("\n\n"));
}

/**
 * Ask remembered phones' companion apps for their current connect port: first at their last known IP,
 * then across this PC's private /24 subnets (DHCP may have moved them). `off` lists phones that answered
 * but have Wireless debugging off, which usually means the "Always allow on this network" prompt is waiting.
 */
async function connectViaBeacon(
  selector: string | undefined,
  devices: DeviceInfo[],
  aliases: AliasMap,
  log: string[],
): Promise<{ hit?: DeviceInfo; off: BeaconReply[] }> {
  const off: BeaconReply[] = [];
  if (selector && splitHostPort(selector.trim())) return { off };
  const known = knownCandidates();
  const targets = (selector ? matchSelector(selector, known, aliases) : known) as DeviceInfo[];
  const onlinePhys = new Set(devices.filter(online).map((d) => d.physicalSerial));
  const wanted = new Set(targets.map((t) => t.physicalSerial).filter((s): s is string => !!s && !onlinePhys.has(s)));
  if (wanted.size === 0) return { off };

  const token = beaconToken();
  const lastHosts = [...new Set(targets.map((t) => (t.address ? splitHostPort(t.address)?.host : undefined)).filter((h): h is string => !!h))];
  const ask = async (hosts: string[], scan: boolean) => {
    const replies = scan ? await scanBeacons(hosts, token) : (await Promise.all(hosts.map((h) => queryBeacon(h, token)))).filter((r) => !!r);
    return replies.filter((r): r is BeaconReply => !!r && wanted.has(r.serial));
  };
  let mine = await ask(lastHosts, false);
  if (mine.length === 0) {
    const hosts = subnetHosts().filter((h) => !lastHosts.includes(h));
    mine = await ask(hosts, true);
    log.push(`beacon: scanned ${hosts.length} hosts on the local subnets, ${mine.length} remembered phone(s) answered`);
  }
  // Wireless debugging just came back on: the app needs a few seconds to confirm its new port.
  for (let i = 0; i < 4 && mine.some((r) => r.adbOn && !r.port); i++) {
    await sleep(1_500);
    mine = await ask([...new Set(mine.map((r) => r.host))], false);
  }

  const connected: DeviceInfo[] = [];
  for (const r of mine) {
    if (!r.adbOn || !r.port) {
      log.push(`beacon ${r.host}: ${r.serial} answered, Wireless debugging ${r.adbOn ? "on but port unknown" : "OFF"}`);
      if (!r.adbOn) off.push(r);
      continue;
    }
    const address = `${r.host}:${r.port}`;
    const target: DeviceInfo = { serial: "", physicalSerial: r.serial, address, state: "known" };
    await cleanupStale(devices, target, log);
    const c = await adbConnect(address);
    log.push(`adb connect ${address} (beacon, ${r.serial}): ${c.message}`);
    if (c.ok) {
      rememberDevice(r.serial, { lastAddress: address });
      connected.push(target);
    }
  }
  if (connected.length === 0) return { off };
  let current = devices;
  current = await waitForOnline(() => pick(selector, current, aliases), (d) => (current = d), isTargetOf(connected));
  return { hit: await pickLive(selector, current, aliases, log), off };
}

/** Poll `adb devices` briefly until the predicate selects a device (connect can take a moment to settle). */
async function waitForOnline(
  check: () => DeviceInfo | undefined,
  update: (d: DeviceInfo[]) => void,
  isTarget: (d: DeviceInfo) => boolean,
): Promise<DeviceInfo[]> {
  let devices: DeviceInfo[] = [];
  for (let i = 0; i < 5; i++) {
    devices = await listAdbDevices();
    update(devices);
    let ok = false;
    try {
      ok = !!check();
    } catch {
      ok = true; // ambiguity is a final answer, let the caller throw it
    }
    const pending = (d: DeviceInfo) => isTarget(d) && (d.state === "connecting" || d.state === "authorizing" || d.state === "offline");
    if (ok || !devices.some(pending)) break;
    await sleep(400);
  }
  return devices;
}

/** Snapshot for list_devices / CLI: adb transports plus discovered-but-not-connected phones. */
export interface SavedPhone {
  serial: string;
  aliases: string[];
  model?: string;
  marketName?: string;
  lastAddress?: string;
  lastSeen?: string;
  online: boolean;
  report?: string;
}

/** Every phone this PC remembers, most recently seen first, with its aliases and latest check report. */
export function savedPhones(adb: DeviceInfo[], aliases: AliasMap): SavedPhone[] {
  const onlinePhys = new Set(adb.filter(online).map((d) => d.physicalSerial));
  return Object.entries(loadKnownDevices())
    .map(([serial, k]) => ({
      serial,
      aliases: Object.entries(aliases)
        .filter(([, s]) => s === serial)
        .map(([a]) => a),
      model: k.model,
      marketName: k.marketName || undefined,
      lastAddress: k.lastAddress,
      lastSeen: k.lastSeen,
      online: onlinePhys.has(serial),
      report: latestReport(serial),
    }))
    .sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""));
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const shortTime = (iso: string | undefined) => {
  const d = iso ? new Date(iso) : undefined;
  return d && !Number.isNaN(d.getTime()) ? `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : "-";
};

/** Markdown table of saved phones (aliases are what the "device" parameter of every tool accepts). */
export function formatSavedPhones(list: SavedPhone[]): string {
  if (list.length === 0) return `${t("saved.title", 0)}\n${t("saved.none")}`;
  const rows = list.map((p) => {
    const market = displayName(p.model, p.marketName);
    const model = p.model ? (market ? `${market} (${normalizeModelCode(p.model)})` : p.model) : "-";
    const alias = p.aliases.length ? p.aliases.map((a) => `\`${a}\``).join(", ") : "-";
    const now = t(p.online ? "saved.online" : "saved.offline");
    return `| ${alias} | ${model} | ${p.serial} | ${p.lastAddress ?? "-"} | ${shortTime(p.lastSeen)} | ${now} |`;
  });
  const lines = [t("saved.title", list.length), "", t("saved.header"), "|---|---|---|---|---|---|", ...rows];
  const reports = list.filter((p) => p.report);
  if (reports.length) {
    lines.push("", t("saved.reports"), ...reports.map((p) => `  - ${p.aliases[0] ?? p.serial}: ${p.report}`));
  }
  return lines.join("\n");
}

export async function snapshot(): Promise<{ adb: DeviceInfo[]; discovered: DeviceInfo[]; aliases: AliasMap }> {
  const [adb, mdns] = await Promise.all([listAdbDevices(), discoverMdns()]);
  const connected = new Set(adb.filter(online).flatMap((d) => [d.physicalSerial, d.address].filter(Boolean)));
  const discovered = mdns.filter((m) => !(m.physicalSerial && connected.has(m.physicalSerial)) && !connected.has(m.address));
  // Phones remembered before auto aliases existed get theirs now, oldest first so numbering follows age.
  const known = Object.entries(loadKnownDevices()).sort(([, a], [, b]) => (a.lastSeen ?? "").localeCompare(b.lastSeen ?? ""));
  for (const [serial] of known) ensureAutoAlias(serial);
  return { adb, discovered, aliases: loadAliases() };
}

export function formatSnapshot(s: { adb: DeviceInfo[]; discovered: DeviceInfo[]; aliases: AliasMap }): string {
  const lines: string[] = [];
  const on = s.adb.filter(online);
  const other = s.adb.filter((d) => !online(d));
  lines.push(t("snapshot.online", on.length));
  lines.push(...(on.length ? on.map((d) => `  - ${describeCandidate(d, s.aliases)}`) : [`  ${t("snapshot.none")}`]));
  if (other.length) {
    lines.push(t("snapshot.notReady", other.length));
    lines.push(...other.map((d) => `  - ${describeCandidate(d, s.aliases)}`));
  }
  lines.push(t("snapshot.discovered", s.discovered.length));
  lines.push(
    ...(s.discovered.length
      ? s.discovered.map((d) => `  - ${describeCandidate({ ...d, serial: d.address ?? "" }, s.aliases)} instance=${d.mdns?.instance}`)
      : [`  ${t("snapshot.none")}`]),
  );
  lines.push("", formatSavedPhones(savedPhones(s.adb, s.aliases)));
  return lines.join("\n");
}
