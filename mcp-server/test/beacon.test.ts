import { mkdtempSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BEACON_PORT,
  type BeaconReply,
  beaconToken,
  parseBeaconReply,
  queryBeacon,
  requestWake,
  subnetHosts,
  wakeKey,
  wakeProof,
  wakeTargets,
} from "../src/beacon.js";

// Independently computed; the same value comes out of javax.crypto, which the app uses.
const HMAC_VECTOR = "076af86410f7f5501cc5c1af6f958e83afd2cd03fc97fd4e8996b346eec4eb5b";

describe("parseBeaconReply", () => {
  it("reads serial, port and Wireless debugging state", () => {
    expect(parseBeaconReply("ADBAL1 serial=R3CX40C2YKL port=34847 adb=on", "192.168.0.26")).toEqual({
      host: "192.168.0.26",
      serial: "R3CX40C2YKL",
      port: 34847,
      adbOn: true,
    });
    expect(parseBeaconReply("ADBAL1 serial=R3CX40C2YKL port=0 adb=off\r", "h")).toMatchObject({ port: 0, adbOn: false });
  });

  it("rejects other protocols and malformed replies", () => {
    expect(parseBeaconReply("HTTP/1.1 400 Bad Request", "h")).toBeUndefined();
    expect(parseBeaconReply("ADBAL1 port=34847 adb=on", "h")).toBeUndefined();
    expect(parseBeaconReply("ADBAL1 serial=x port=99999 adb=on", "h")).toBeUndefined();
  });
});

describe("beaconToken", () => {
  it("is created once and then reused", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "adbal-beacon-"));
    const a = beaconToken(dir);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(beaconToken(dir)).toBe(a);
  });
});

describe("wake", () => {
  const off = (serial: string): BeaconReply => ({ host: "h", serial, port: 0, adbOn: false, nonce: "a".repeat(32) });

  it("reads the nonce an app offers, and ignores a malformed one", () => {
    const nonce = "0123456789abcdef".repeat(2);
    expect(parseBeaconReply(`ADBAL1 serial=S port=0 adb=off nonce=${nonce}`, "h")?.nonce).toBe(nonce);
    expect(parseBeaconReply("ADBAL1 serial=S port=0 adb=off nonce=xyz", "h")?.nonce).toBeUndefined();
  });

  it("keeps a separate wake key, reused like the token", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "adbal-wake-"));
    const key = wakeKey(dir);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(wakeKey(dir)).toBe(key);
    expect(key.startsWith(beaconToken(dir))).toBe(false);
  });

  it("signs nonce and serial with HMAC-SHA256", () => {
    expect(wakeProof("k".repeat(64), "n".repeat(32), "R3CX40C2YKL")).toBe(HMAC_VECTOR);
  });

  it("wakes a named phone, or the only candidate, but never all of them", () => {
    expect(wakeTargets([off("A")], undefined).map((r) => r.serial)).toEqual(["A"]);
    expect(wakeTargets([off("A"), off("B")], undefined)).toEqual([]);
    expect(wakeTargets([off("A"), off("B")], "S21")).toHaveLength(2); // the selector already narrowed these
  });

  it("skips phones that are on, or whose app cannot wake", () => {
    expect(wakeTargets([{ ...off("A"), adbOn: true }], "A")).toEqual([]);
    const { nonce: _, ...oldApp } = off("A");
    expect(wakeTargets([oldApp], "A")).toEqual([]);
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

describe("queryBeacon", () => {
  let server: net.Server | undefined;
  afterEach(() => server?.close());

  /** A fake companion app on the beacon port that answers only the right token. */
  const listen = (token: string) =>
    new Promise<boolean>((resolve) => {
      server = net.createServer((s) => {
        s.once("data", (d) => {
          if (d.toString().trim() === `ADBAL1 ${token}`) s.end("ADBAL1 serial=TEST123 port=41235 adb=on\n");
          else s.destroy();
        });
      });
      server.once("error", () => resolve(false)); // port taken on this machine: skip
      server.listen(BEACON_PORT, "127.0.0.1", () => resolve(true));
    });

  it("returns the phone's port for the right token and nothing for a wrong one", async () => {
    if (!(await listen("a".repeat(32)))) return;
    expect(await queryBeacon("127.0.0.1", "a".repeat(32))).toMatchObject({ serial: "TEST123", port: 41235, adbOn: true });
    expect(await queryBeacon("127.0.0.1", "b".repeat(32))).toBeUndefined();
  });

  it("sends the proof, never the key, and reads acceptance from the reply", async () => {
    const key = "k".repeat(64);
    const nonce = "n".repeat(32);
    const seen: string[] = [];
    server = net.createServer((s) => {
      s.once("data", (d) => {
        seen.push(d.toString());
        if (d.toString().trim() === `ADBAL1W ${wakeProof(key, nonce, "TEST123")}`) s.end("ADBAL1 serial=TEST123 port=0 adb=off\n");
        else s.destroy();
      });
    });
    const free = await new Promise<boolean>((resolve) => {
      server!.once("error", () => resolve(false));
      server!.listen(BEACON_PORT, "127.0.0.1", () => resolve(true));
    });
    if (!free) return;
    expect(await requestWake("127.0.0.1", key, nonce, "TEST123")).toMatchObject({ serial: "TEST123" });
    expect(await requestWake("127.0.0.1", "w".repeat(64), nonce, "TEST123")).toBeUndefined();
    expect(seen.join("")).not.toContain(key);
  });

  it("gives up quickly on a host with nothing listening", async () => {
    const started = Date.now();
    expect(await queryBeacon("127.0.0.1", "a".repeat(32), 500)).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
