import { describe, expect, it } from "vitest";
import {
  IS_MAC,
  IosUnavailableError,
  devicectl,
  isAvailable,
  parseAppUrl,
  parseDeviceList,
  parseOutcome,
  parsePids,
} from "../src/ios.js";
import { autoAliasBase, displayName, matchSelector } from "../src/devices.js";
import { iosCandidate } from "../src/targets.js";

// Shaped after `xcrun devicectl list devices --json-output` (key paths as parsed by Flutter's core_devices.dart).
const LIST = {
  info: { outcome: "success" },
  result: {
    devices: [
      {
        identifier: "11111111-2222-3333-4444-555555555555",
        connectionProperties: { pairingState: "paired", transportType: "localNetwork", tunnelState: "connected" },
        deviceProperties: { name: "My iPhone", osVersionNumber: "17.5.1", developerModeStatus: "enabled" },
        hardwareProperties: { udid: "00008130-000A1B2C3D4E5F60", productType: "iPhone16,1", marketingName: "iPhone 15 Pro", platform: "iOS" },
      },
      {
        identifier: "66666666-7777-8888-9999-000000000000",
        connectionProperties: { pairingState: "paired", tunnelState: "unavailable" },
        deviceProperties: { name: "Old Phone", osVersionNumber: "16.7" },
        hardwareProperties: { udid: "00008020-0011223344556677", productType: "iPhone11,2", marketingName: "iPhone XS", platform: "iOS" },
      },
      {
        identifier: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        connectionProperties: { pairingState: "paired", transportType: "wired" },
        deviceProperties: { name: "Watch" },
        hardwareProperties: { udid: "w", productType: "Watch6,1", platform: "watchOS" },
      },
    ],
  },
};

describe("devicectl parsing", () => {
  it("keeps iPhones and reads name, model, iOS version and how they connect", () => {
    const list = parseDeviceList(LIST);
    expect(list.map((d) => d.marketingName)).toEqual(["iPhone 15 Pro", "iPhone XS"]);
    expect(list[0]).toMatchObject({ udid: "00008130-000A1B2C3D4E5F60", osVersion: "17.5.1", transport: "localNetwork", paired: true });
    expect(isAvailable(list[0]!)).toBe(true);
    expect(isAvailable(list[1]!)).toBe(false); // paired but not reachable now
  });

  it("finds an app's processes, skipping its extensions", () => {
    const apps = { result: { apps: [{ bundleIdentifier: "com.example.game", url: "file:///private/var/containers/Bundle/Application/ABC/Game.app/" }] } };
    const url = parseAppUrl(apps, "com.example.game")!;
    expect(url).toContain("Game.app");
    expect(parseAppUrl(apps, "com.other")).toBeUndefined();
    const procs = {
      result: {
        runningProcesses: [
          { executable: `${url}Game`, processIdentifier: 501 },
          { executable: `${url}PlugIns/Widget.appex/Widget`, processIdentifier: 502 },
          { executable: "file:///usr/libexec/backboardd", processIdentifier: 60 },
        ],
      },
    };
    expect(parsePids(procs, url)).toEqual([501]);
  });

  it("reports devicectl failures with their reason", () => {
    expect(parseOutcome({ info: { outcome: "success" } })).toEqual({ ok: true, message: "success" });
    const err = { info: { outcome: "failed" }, error: { userInfo: { NSLocalizedDescription: { string: "The device is locked." } } } };
    expect(parseOutcome(err)).toEqual({ ok: false, message: "The device is locked." });
  });
});

describe("iPhones share names and aliases with Android", () => {
  it("is named and aliased by its marketing name", () => {
    expect(displayName("iPhone16,1", "iPhone 15 Pro")).toBe("iPhone 15 Pro");
    expect(autoAliasBase("iPhone16,1", "iPhone 15 Pro")).toBe("iPhone15Pro");
  });

  it("is selected by name or alias", () => {
    const cands = parseDeviceList(LIST).map(iosCandidate);
    expect(matchSelector("iphone 15 pro", cands).map((c) => c.physicalSerial)).toEqual(["00008130-000A1B2C3D4E5F60"]);
    expect(matchSelector("iPhone15Pro", cands, { iPhone15Pro: "00008130-000A1B2C3D4E5F60" })).toHaveLength(1);
    expect(matchSelector("S21", cands)).toHaveLength(0); // Android names never pick an iPhone
  });
});

// The real tool, on macOS only (CI runs this on GitHub's macOS runners, which have Xcode but no iPhone).
describe.runIf(IS_MAC)("xcrun devicectl on this Mac", () => {
  it("lists devices in the JSON shape the parser expects", async () => {
    let json: unknown;
    try {
      json = await devicectl(["list", "devices", "--timeout", "3"], 60_000);
    } catch (e) {
      if (e instanceof IosUnavailableError) return; // Xcode older than 15: nothing to check
      throw e;
    }
    expect(parseOutcome(json).ok).toBe(true);
    expect(Array.isArray((json as { result?: { devices?: unknown } }).result?.devices)).toBe(true);
    expect(Array.isArray(parseDeviceList(json))).toBe(true);
  }, 90_000);
});
