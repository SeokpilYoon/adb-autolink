import { mkdtempSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BEACON_PORT, beaconToken, parseBeaconReply, queryBeacon, subnetHosts } from "../src/beacon.js";

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

  it("gives up quickly on a host with nothing listening", async () => {
    const started = Date.now();
    expect(await queryBeacon("127.0.0.1", "a".repeat(32), 500)).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
