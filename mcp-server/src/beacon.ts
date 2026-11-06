/**
 * Port beacon: the companion app tells this PC, over a fixed TCP port, the current Wireless debugging port.
 *
 * Android picks a new random connect port every time Wireless debugging turns on, and mDNS (multicast
 * UDP 5353) is often blocked: Windows drops inbound multicast on Public networks or without a firewall
 * rule, and many routers filter it. Asking the phone over unicast TCP needs neither.
 *
 * Both sides prove they hold the key handed over by adb at setup, which never travels over the network.
 * A scan reaches every host on the subnet, so nothing a stranger answers may be believed or signed:
 *
 *   PC    -> "ADBAL2 <cn> <mac(hello, cn)>"          strangers get no answer at all
 *   phone -> "ADBAL2 <sn>"
 *   PC    -> "<status|wake> <mac(cmd, cn, sn)>"
 *   phone -> "ADBAL2 serial=<ro.serialno> port=<port, 0 if unknown> adb=<on|off> mac=<mac(reply, cmd, cn, sn, line)>"
 *
 * mac() is HMAC-SHA256 of its "|"-joined parts, must match PortBeacon.kt. Nonces live and die with the
 * connection, so proofs cannot be replayed, and a wake is only ever sent to a host that already proved
 * itself with a status reply.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { stateDir } from "./devices.js";

export const BEACON_PORT = 47383;
const MAGIC = "ADBAL2";
const LEGACY_MAGIC = "ADBAL1";

export type BeaconCommand = "status" | "wake";

export interface BeaconReply {
  host: string;
  serial: string;
  /** Wireless debugging connect port; 0 when the app has not seen it yet. */
  port: number;
  adbOn: boolean;
  /** The phone proved it holds this PC's key. False only for apps older than the current protocol. */
  verified: boolean;
}

/** A random hex secret created on first use and kept in the state dir. */
function secretFile(dir: string, name: string, bytes: number): string {
  const file = path.join(dir, name);
  try {
    const existing = readFileSync(file, "utf8").trim();
    if (new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(existing)) return existing;
  } catch {
    // create below
  }
  const secret = randomBytes(bytes).toString("hex");
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, `${secret}\n`, { mode: 0o600 });
  return secret;
}

/** Only for apps older than v0.6.1, which identify a PC by this token, sent in the clear. */
export const beaconToken = (dir = stateDir()): string => secretFile(dir, "beacon-token", 16);

/** This PC's key: proves it to its phones and theirs to it. Reaches a phone only through adb at setup. */
export const wakeKey = (dir = stateDir()): string => secretFile(dir, "wake-key", 32);

export const mac = (key: string, ...parts: string[]): string => createHmac("sha256", key).update(parts.join("|")).digest("hex");

export function sameMac(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Phones to turn on. Naming a phone is a request for that phone. Without a name, only an obvious single
 * candidate: a bare "connect" must not switch on every phone in the house.
 */
export function wakeTargets(replies: BeaconReply[], selector: string | undefined): BeaconReply[] {
  if (!selector && replies.length !== 1) return [];
  return replies.filter((r) => !r.adbOn && r.verified);
}

/** Addresses a phone can have on a LAN or a private VPN (Tailscale's 100.64.0.0/10). */
export function isLocalAddress(host: string): boolean {
  const ip = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (!ip) return /^(::1$|fe[89ab]|f[cd])/i.test(host);
  const a = Number(ip[1]);
  const b = Number(ip[2]);
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 100 && b >= 64 && b <= 127);
}

function parseStatus(line: string, host: string, magic: string, verified: boolean): BeaconReply | undefined {
  const parts = line.trim().split(/\s+/);
  if (parts[0] !== magic) return undefined;
  const kv = Object.fromEntries(parts.slice(1).map((p) => p.split("=", 2) as [string, string]));
  const port = Number(kv.port);
  if (!kv.serial || !Number.isInteger(port) || port < 0 || port > 65535) return undefined;
  return { host, serial: kv.serial, port, adbOn: kv.adb === "on", verified };
}

/** The phone's reply to an old-protocol request. Unauthenticated: anyone on the network can send this. */
export const parseBeaconReply = (line: string, host: string): BeaconReply | undefined => parseStatus(line, host, LEGACY_MAGIC, false);

/** The final line of a session; undefined unless the phone proved it holds the key for this very exchange. */
export function verifyReply(line: string, host: string, key: string, cmd: BeaconCommand, cn: string, sn: string): BeaconReply | undefined {
  const m = /^(.*) mac=([0-9a-f]{64})$/.exec(line.trim());
  if (!m || !sameMac(m[2]!, mac(key, "reply", cmd, cn, sn, m[1]!))) return undefined;
  return parseStatus(m[1]!, host, MAGIC, true);
}

/** One authenticated exchange. Resolves undefined on refusal, timeout or anything that fails to prove itself. */
export function beaconSession(host: string, key: string, cmd: BeaconCommand, timeoutMs = 2_500): Promise<BeaconReply | undefined> {
  return new Promise((resolve) => {
    const cn = randomBytes(16).toString("hex");
    let sn: string | undefined;
    let buf = "";
    let settled = false;
    const finish = (r: BeaconReply | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(r);
    };
    const timer = setTimeout(() => finish(undefined), timeoutMs);
    const socket = net.connect({ host, port: BEACON_PORT });
    socket.on("error", () => finish(undefined));
    socket.on("close", () => finish(undefined));
    socket.on("connect", () => socket.write(`${MAGIC} ${cn} ${mac(key, "hello", cn)}\n`));
    socket.on("data", (d) => {
      buf += d.toString("utf8");
      if (buf.length > 512) return finish(undefined);
      for (let nl = buf.indexOf("\n"); nl >= 0 && !settled; nl = buf.indexOf("\n")) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (sn) return finish(verifyReply(line, host, key, cmd, cn, sn));
        const challenge = new RegExp(`^${MAGIC} ([0-9a-f]{32})$`).exec(line);
        if (!challenge) return finish(undefined);
        sn = challenge[1]!;
        socket.write(`${cmd} ${mac(key, cmd, cn, sn)}\n`);
      }
      return undefined;
    });
  });
}

/** Ask an app older than v0.6.1 at the one address it was last seen. Sends the token in the clear. */
export function queryLegacyBeacon(host: string, token: string, timeoutMs = 1_500): Promise<BeaconReply | undefined> {
  return new Promise((resolve) => {
    let buf = "";
    let settled = false;
    const finish = (r: BeaconReply | undefined) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(r);
    };
    const socket = net.connect({ host, port: BEACON_PORT });
    socket.setTimeout(timeoutMs, () => finish(undefined));
    socket.on("error", () => finish(undefined));
    socket.on("connect", () => socket.write(`${LEGACY_MAGIC} ${token}\n`));
    socket.on("data", (d) => {
      buf += d.toString("utf8");
      const nl = buf.indexOf("\n");
      if (nl >= 0) finish(parseBeaconReply(buf.slice(0, nl), host));
      else if (buf.length > 512) finish(undefined);
    });
    socket.on("close", () => finish(buf ? parseBeaconReply(buf, host) : undefined));
  });
}

/** Every other address in the /24 of each private IPv4 interface of this PC (phones get a new DHCP lease). */
export function subnetHosts(interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces()): string[] {
  const hosts = new Set<string>();
  for (const infos of Object.values(interfaces)) {
    for (const i of infos ?? []) {
      if (i.family !== "IPv4" || i.internal) continue;
      const [a, b, c, d] = i.address.split(".").map(Number) as [number, number, number, number];
      const isPrivate = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
      if (!isPrivate) continue; // skip VPN/CGNAT ranges such as Tailscale's 100.64.0.0/10
      for (let h = 1; h < 255; h++) if (h !== d) hosts.add(`${a}.${b}.${c}.${h}`);
    }
  }
  return [...hosts];
}

/** Query many hosts with bounded concurrency; returns every reply that proved itself. */
export async function scanBeacons(hosts: string[], key: string, timeoutMs = 900, concurrency = 64): Promise<BeaconReply[]> {
  const replies: BeaconReply[] = [];
  let next = 0;
  const worker = async () => {
    while (next < hosts.length) {
      const host = hosts[next++]!;
      const r = await beaconSession(host, key, "status", timeoutMs);
      if (r) replies.push(r);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, hosts.length) }, worker));
  return replies;
}
