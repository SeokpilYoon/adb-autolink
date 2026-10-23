/**
 * Port beacon: the companion app answers on a fixed TCP port with the current Wireless debugging port.
 *
 * Android picks a new random connect port every time Wireless debugging turns on, and mDNS (multicast
 * UDP 5353) is often blocked: Windows drops inbound multicast on Public networks or without a firewall
 * rule, and many routers filter it. Asking the phone over unicast TCP needs neither. The app answers only
 * a request that carries a token this PC handed it at install time (install_companion_app).
 *
 *   PC  -> phone:47383   "ADBAL1 <token>\n"
 *   phone -> PC          "ADBAL1 serial=<ro.serialno> port=<connect port, 0 if unknown> adb=<on|off>\n"
 */
import { randomBytes } from "node:crypto";
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
}

/** This PC's beacon token (created on first use, kept in the state dir). */
export function beaconToken(dir = stateDir()): string {
  const file = path.join(dir, "beacon-token");
  try {
    const existing = readFileSync(file, "utf8").trim();
    if (/^[0-9a-f]{32}$/.test(existing)) return existing;
  } catch {
    // create below
  }
  const token = randomBytes(16).toString("hex");
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, `${token}\n`, { mode: 0o600 });
  return token;
}

export function parseBeaconReply(line: string, host: string): BeaconReply | undefined {
  const parts = line.trim().split(/\s+/);
  if (parts[0] !== MAGIC) return undefined;
  const kv = Object.fromEntries(parts.slice(1).map((p) => p.split("=", 2) as [string, string]));
  const port = Number(kv.port);
  if (!kv.serial || !Number.isInteger(port) || port < 0 || port > 65535) return undefined;
  return { host, serial: kv.serial, port, adbOn: kv.adb === "on" };
}

/** Ask one host. Resolves undefined on refusal, timeout, a wrong token (the app just closes) or garbage. */
export function queryBeacon(host: string, token: string, timeoutMs = 1_500): Promise<BeaconReply | undefined> {
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
    socket.on("connect", () => socket.write(`${MAGIC} ${token}\n`));
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
