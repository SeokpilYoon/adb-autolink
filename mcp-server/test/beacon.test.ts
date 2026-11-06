import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BEACON_PORT,
  type BeaconReply,
  beaconSession,
  beaconToken,
  isLocalAddress,
  mac,
  parseBeaconReply,
  queryLegacyBeacon,
  scanBeacons,
  subnetHosts,
  verifyReply,
  wakeKey,
  wakeTargets,
} from "../src/beacon.js";

// Independently computed; the same value comes out of javax.crypto, which the app uses.
const MAC_VECTOR = "afaa20b89efe5ff5020879eec6e592761aedeb8afa0db75ca52ef885ceebc95f";

const KEY = "k".repeat(64);
const CN = "c".repeat(32);
const SN = "d".repeat(32);

describe("mac", () => {
  it("is HMAC-SHA256 of the joined parts, like PortBeacon.kt", () => {
    expect(mac(KEY, "reply", "status", CN, SN, "ADBAL2 serial=R3CX40C2YKL port=0 adb=off")).toBe(MAC_VECTOR);
  });
});

describe("verifyReply", () => {
  const line = "ADBAL2 serial=TEST123 port=41235 adb=on";
  const signed = `${line} mac=${mac(KEY, "reply", "status", CN, SN, line)}`;

  it("accepts a reply signed for this very exchange", () => {
    expect(verifyReply(signed, "h", KEY, "status", CN, SN)).toEqual({ host: "h", serial: "TEST123", port: 41235, adbOn: true, verified: true });
  });

  it("rejects a stranger, a replay and a reply to another command", () => {
    expect(verifyReply(line, "h", KEY, "status", CN, SN)).toBeUndefined();
    expect(verifyReply(signed, "h", "w".repeat(64), "status", CN, SN)).toBeUndefined();
    expect(verifyReply(signed, "h", KEY, "status", "e".repeat(32), SN)).toBeUndefined();
    expect(verifyReply(signed, "h", KEY, "wake", CN, SN)).toBeUndefined();
  });

  it("rejects a tampered port", () => {
    expect(verifyReply(signed.replace("41235", "5555"), "h", KEY, "status", CN, SN)).toBeUndefined();
  });
});

describe("parseBeaconReply (apps before v0.6.1)", () => {
  it("reads serial, port and Wireless debugging state, marked unverified", () => {
    expect(parseBeaconReply("ADBAL1 serial=R3CX40C2YKL port=34847 adb=on", "192.168.0.26")).toEqual({
      host: "192.168.0.26",
      serial: "R3CX40C2YKL",
      port: 34847,
      adbOn: true,
      verified: false,
    });
    expect(parseBeaconReply("ADBAL1 serial=R3CX40C2YKL port=0 adb=off\r", "h")).toMatchObject({ port: 0, adbOn: false });
  });

  it("rejects other protocols and malformed replies", () => {
    expect(parseBeaconReply("HTTP/1.1 400 Bad Request", "h")).toBeUndefined();
    expect(parseBeaconReply("ADBAL1 port=34847 adb=on", "h")).toBeUndefined();
    expect(parseBeaconReply("ADBAL1 serial=x port=99999 adb=on", "h")).toBeUndefined();
  });
});

describe("secrets", () => {
  it("are created once and then reused", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "adbal-beacon-"));
    const token = beaconToken(dir);
    const key = wakeKey(dir);
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(beaconToken(dir)).toBe(token);
    expect(wakeKey(dir)).toBe(key);
    expect(key.startsWith(token)).toBe(false);
  });
});

describe("wakeTargets", () => {
  const off = (serial: string): BeaconReply => ({ host: "h", serial, port: 0, adbOn: false, verified: true });

  it("wakes a named phone, or the only candidate, but never all of them", () => {
    expect(wakeTargets([off("A")], undefined).map((r) => r.serial)).toEqual(["A"]);
    expect(wakeTargets([off("A"), off("B")], undefined)).toEqual([]);
    expect(wakeTargets([off("A"), off("B")], "S21")).toHaveLength(2); // the selector already narrowed these
  });

  it("skips phones that are on, or that did not prove themselves", () => {
    expect(wakeTargets([{ ...off("A"), adbOn: true }], "A")).toEqual([]);
    expect(wakeTargets([{ ...off("A"), verified: false }], "A")).toEqual([]);
  });
});

describe("isLocalAddress", () => {
  it("allows LAN and private VPN addresses only", () => {
    for (const h of ["192.168.0.2", "10.1.2.3", "172.16.0.1", "172.31.255.1", "169.254.1.1", "127.0.0.1", "100.64.0.1", "100.127.0.1", "fe80::1", "fd12::1"]) {
      expect(isLocalAddress(h)).toBe(true);
    }
    for (const h of ["1.2.3.4", "8.8.8.8", "172.32.0.1", "100.128.0.1", "2001:db8::1", "evil.example.com"]) {
      expect(isLocalAddress(h)).toBe(false);
    }
  });
});

describe("subnetHosts", () => {
  it("lists the private /24 of each interface without itself, skipping VPN ranges", () => {
    const hosts = subnetHosts({
      wifi: [{ address: "192.168.0.10", family: "IPv4", internal: false } as os.NetworkInterfaceInfo],
      tailscale: [{ address: "100.101.102.103", family: "IPv4", internal: false } as os.NetworkInterfaceInfo],
      lo: [{ address: "127.0.0.1", family: "IPv4", internal: true } as os.NetworkInterfaceInfo],
    });
    expect(hosts).toHaveLength(253);
    expect(hosts).toContain("192.168.0.26");
    expect(hosts).not.toContain("192.168.0.10");
    expect(hosts.some((h) => h.startsWith("100."))).toBe(false);
  });
});

describe("beaconSession", () => {
  let server: net.Server | undefined;
  afterEach(() => server?.close());

  const listen = (onClient: (s: net.Socket) => void) =>
    new Promise<boolean>((resolve) => {
      server = net.createServer((s) => {
        s.on("error", () => {}); // the client hanging up on a refused exchange is expected
        onClient(s);
      });
      server.once("error", () => resolve(false)); // port taken on this machine: skip
      server.listen(BEACON_PORT, "127.0.0.1", () => resolve(true));
    });

  /** The app's side of PortBeacon.kt. */
  const phone = (key: string, seen: string[] = [], forge?: (line: string) => string) => (s: net.Socket) => {
    const sn = randomBytes(16).toString("hex");
    let cn = "";
    let buf = "";
    s.on("data", (d) => {
      buf += d;
      seen.push(d.toString());
      for (let nl = buf.indexOf("\n"); nl >= 0; nl = buf.indexOf("\n")) {
        const parts = buf.slice(0, nl).split(" ");
        buf = buf.slice(nl + 1);
        if (!cn) {
          if (parts[2] !== mac(key, "hello", parts[1]!)) return void s.destroy();
          cn = parts[1]!;
          s.write(`ADBAL2 ${sn}\n`);
        } else {
          const cmd = parts[0]!;
          if (parts[1] !== mac(key, cmd, cn, sn)) return void s.destroy();
          const line = "ADBAL2 serial=TEST123 port=41235 adb=on";
          s.end(forge ? forge(line) : `${line} mac=${mac(key, "reply", cmd, cn, sn, line)}\n`);
        }
      }
      return undefined;
    });
  };

  it("completes with the right key on both sides, and never sends the key", async () => {
    const seen: string[] = [];
    if (!(await listen(phone(KEY, seen)))) return;
    expect(await beaconSession("127.0.0.1", KEY, "status")).toMatchObject({ serial: "TEST123", port: 41235, verified: true });
    expect(await beaconSession("127.0.0.1", KEY, "wake")).toMatchObject({ serial: "TEST123" });
    expect(seen.join("")).not.toContain(KEY);
  });

  it("gets nothing from a phone that does not know this PC", async () => {
    if (!(await listen(phone("w".repeat(64))))) return;
    expect(await beaconSession("127.0.0.1", KEY, "status")).toBeUndefined();
  });

  it("does not believe an impostor claiming a serial and a port", async () => {
    if (!(await listen((s) => {
      s.once("data", () => s.write(`ADBAL2 ${"a".repeat(32)}\n`));
      s.on("data", () => s.write("ADBAL2 serial=R3CX40C2YKL port=5555 adb=on\n"));
    }))) return;
    expect(await beaconSession("127.0.0.1", KEY, "status", 800)).toBeUndefined();
  });

  it("does not believe a reply signed by another key", async () => {
    if (!(await listen(phone(KEY, [], (line) => `${line} mac=${"0".repeat(64)}\n`)))) return;
    expect(await beaconSession("127.0.0.1", KEY, "status")).toBeUndefined();
  });

  it("does not hang on a host that accepts and stays silent", async () => {
    if (!(await listen(() => {}))) return;
    const started = Date.now();
    expect(await beaconSession("127.0.0.1", KEY, "status", 300)).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("scans and keeps only proven replies", async () => {
    if (!(await listen(phone(KEY)))) return;
    expect(await scanBeacons(["127.0.0.1"], KEY)).toHaveLength(1);
    expect(await scanBeacons(["127.0.0.1"], "w".repeat(64))).toEqual([]);
  });

  it("still reads an old app, which never counts as verified", async () => {
    const token = "a".repeat(32);
    if (!(await listen((s) => {
      s.once("data", (d) => {
        if (d.toString().trim() === `ADBAL1 ${token}`) s.end("ADBAL1 serial=TEST123 port=41235 adb=on\n");
        else s.destroy();
      });
    }))) return;
    expect(await queryLegacyBeacon("127.0.0.1", token)).toMatchObject({ serial: "TEST123", verified: false });
    expect(await queryLegacyBeacon("127.0.0.1", "b".repeat(32))).toBeUndefined();
  });
});
