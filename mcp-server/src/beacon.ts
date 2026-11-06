/**
 * Port beacon: the companion app answers on a fixed TCP port with the current Wireless debugging port.
 *
 * Android picks a new random connect port every time Wireless debugging turns on, and mDNS (multicast
 * UDP 5353) is often blocked: Windows drops inbound multicast on Public networks or without a firewall
 * rule, and many routers filter it. Asking the phone over unicast TCP needs neither. The app answers only
 * a request that carries a token this PC handed it at install time (install_companion_app).
 *
 *   PC  -> phone:47383   "ADBAL1 <token>\n"
 *   phone -> PC          "ADBAL1 serial=<ro.serialno> port=<connect port, 0 if unknown> adb=<on|off>[ nonce=<hex>]\n"
 *
 * With Wireless debugging off, the app also offers a one-time nonce. Turning it on is a second request
 * on a new connection, proving this PC holds the wake key without ever sending it:
 *
 *   PC  -> phone:47383   "ADBAL1W <hex HMAC-SHA256(wake key, "wake <nonce> <serial>")>\n"
 *   phone -> PC          the status line above, or nothing when refused
 *
 * The token is sent in the clear (and to every host a scan reaches), so it only ever reveals a port.
 * The wake key is a separate secret that leaves this PC only through adb at setup.
 */
import { createHmac, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { stateDir } from "./devices.js";

export const BEACON_PORT = 47383;
const MAGIC = "ADBAL1";

export interface BeaconReply {
  host: string;
  serial: string;
  /** Wireless debugging connect port; 0 when the app has not seen it yet. */
  port: number;
  adbOn: boolean;
  /** One-time value for a wake request; only apps that can turn Wireless debugging on send it. */
  nonce?: string;
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

/** This PC's beacon token: lets it ask a phone for its status. */
export const beaconToken = (dir = stateDir()): string => secretFile(dir, "beacon-token", 16);

/** This PC's wake key: lets it turn Wireless debugging on. Never sent over the network. */
export const wakeKey = (dir = stateDir()): string => secretFile(dir, "wake-key", 32);

/** Must match PortBeacon.kt. */
export const wakeProof = (key: string, nonce: string, serial: string): string =>
  createHmac("sha256", key).update(`wake ${nonce} ${serial}`).digest("hex");

/**
 * Phones to turn on. Naming a phone is a request for that phone. Without a name, only an obvious single
 * candidate: a bare "connect" must not switch on every phone in the house.
 */
export function wakeTargets(replies: BeaconReply[], selector: string | undefined): BeaconReply[] {
  if (!selector && replies.length !== 1) return [];
  return replies.filter((r) => !r.adbOn && r.nonce);
}

export function parseBeaconReply(line: string, host: string): BeaconReply | undefined {
  const parts = line.trim().split(/\s+/);
  if (parts[0] !== MAGIC) return undefined;
  const kv = Object.fromEntries(parts.slice(1).map((p) => p.split("=", 2) as [string, string]));
  const port = Number(kv.port);
  if (!kv.serial || !Number.isInteger(port) || port < 0 || port > 65535) return undefined;
  const nonce = kv.nonce && /^[0-9a-f]{32}$/.test(kv.nonce) ? kv.nonce : undefined;
  return { host, serial: kv.serial, port, adbOn: kv.adb === "on", ...(nonce ? { nonce } : {}) };
}

/** Ask one host. Resolves undefined on refusal, timeout, a wrong token (the app just closes) or garbage. */
export const queryBeacon = (host: string, token: string, timeoutMs = 1_500): Promise<BeaconReply | undefined> =>
  exchange(host, `${MAGIC} ${token}`, timeoutMs);

/** Ask a phone that offered `nonce` to turn Wireless debugging on. A reply means it accepted. */
export const requestWake = (host: string, key: string, nonce: string, serial: string, timeoutMs = 2_500): Promise<BeaconReply | undefined> =>
  exchange(host, `${MAGIC}W ${wakeProof(key, nonce, serial)}`, timeoutMs);

function exchange(host: string, line: string, timeoutMs: number): Promise<BeaconReply | undefined> {
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
    socket.on("connect", () => socket.write(`${line}\n`));
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

/** Query many hosts with bounded concurrency; returns every reply. */
export async function scanBeacons(hosts: string[], token: string, timeoutMs = 600, concurrency = 64): Promise<BeaconReply[]> {
  const replies: BeaconReply[] = [];
  let next = 0;
  const worker = async () => {
    while (next < hosts.length) {
      const host = hosts[next++]!;
      const r = await queryBeacon(host, token, timeoutMs);
      if (r) replies.push(r);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, hosts.length) }, worker));
  return replies;
}
