import { describe, expect, it } from "vitest";
import {
  connectServices,
  isAddressSerial,
  isMdnsSerial,
  parseConnectOutput,
  parseDevicesList,
  parseMdnsServices,
  serialFromInstance,
} from "../src/parse.js";

describe("parseDevicesList", () => {
  it("parses devices -l output with mixed states", () => {
    const out = [
      "* daemon not running; starting now at tcp:5037",
      "* daemon started successfully",
      "List of devices attached",
      "R5CR10ABCDE            device usb:1-1 product:o1sksx model:SM_G991N device:o1s transport_id:1",
      "192.168.0.23:37123     offline transport_id:4",
      "adb-R5CT20XYZ12-Ab3dEf._adb-tls-connect._tcp device product:e2sksx model:SM_S926N device:e2s transport_id:5",
      "emulator-5554\tunauthorized transport_id:2",
      "",
    ].join("\r\n");
    const list = parseDevicesList(out);
    expect(list).toHaveLength(4);
    expect(list[0]).toEqual({
      serial: "R5CR10ABCDE",
      state: "device",
      usb: "1-1",
      product: "o1sksx",
      model: "SM-G991N",
      device: "o1s",
      transportId: "1",
    });
    expect(list[1]).toMatchObject({ serial: "192.168.0.23:37123", state: "offline", transportId: "4" });
    expect(list[2]).toMatchObject({ serial: "adb-R5CT20XYZ12-Ab3dEf._adb-tls-connect._tcp", model: "SM-S926N" });
    expect(list[3]).toMatchObject({ serial: "emulator-5554", state: "unauthorized" });
  });

  it("handles empty list and no-permissions state", () => {
    expect(parseDevicesList("List of devices attached\n\n")).toEqual([]);
    const l = parseDevicesList("ABC no permissions (user in plugdev group); see [http://x] usb:1-2 transport_id:3\n");
    expect(l[0]).toMatchObject({ serial: "ABC", state: "no permissions", transportId: "3" });
  });
});

describe("parseMdnsServices", () => {
  it("parses tab and space separated entries, trailing dots, and ignores non-connect types", () => {
    const out = [
      "List of discovered mdns services",
      "adb-R5CR10ABCDE-Xyz12A\t_adb-tls-connect._tcp\t192.168.0.23:37123",
      "adb-R5CT20XYZ12-Ab3dEf   _adb-tls-connect._tcp.   192.168.0.31:41001",
      "adb-R5CR10ABCDE-Xyz12A\t_adb-tls-pairing._tcp\t192.168.0.23:38999",
      "adb-R5CR10ABCDE\t_adb._tcp\t192.168.0.23:5555",
      "garbage line",
    ].join("\n");
    const all = parseMdnsServices(out);
    expect(all).toHaveLength(4);
    expect(all[1]).toMatchObject({ type: "_adb-tls-connect._tcp", address: "192.168.0.31:41001", serial: "R5CT20XYZ12" });
    const conn = connectServices(all);
    expect(conn.map((c) => c.address)).toEqual(["192.168.0.23:37123", "192.168.0.31:41001"]);
    expect(conn[0]).toMatchObject({ instance: "adb-R5CR10ABCDE-Xyz12A", serial: "R5CR10ABCDE", host: "192.168.0.23", port: 37123 });
  });

  it("handles instance names with spaces when columns are tab separated", () => {
    const [svc] = parseMdnsServices("adb-R5CR10ABCDE-Xyz12A (2)\t_adb-tls-connect._tcp\t192.168.0.23:37123");
    expect(svc).toMatchObject({ instance: "adb-R5CR10ABCDE-Xyz12A (2)", address: "192.168.0.23:37123" });
  });

  it("returns nothing for header-only output", () => {
    expect(parseMdnsServices("List of discovered mdns services\n")).toEqual([]);
  });
});

describe("serial helpers", () => {
  it("extracts serial from instance names and mdns transport serials", () => {
    expect(serialFromInstance("adb-R5CR10ABCDE-Xyz12A")).toBe("R5CR10ABCDE");
    expect(serialFromInstance("adb-R5CR10ABCDE-Xyz12A._adb-tls-connect._tcp")).toBe("R5CR10ABCDE");
    expect(serialFromInstance("something-else")).toBeUndefined();
    expect(isMdnsSerial("adb-R5CR10ABCDE-Xyz12A._adb-tls-connect._tcp")).toBe(true);
    expect(isMdnsSerial("R5CR10ABCDE")).toBe(false);
    expect(isAddressSerial("192.168.0.23:37123")).toBe(true);
    expect(isAddressSerial("emulator-5554")).toBe(false);
  });

  it("interprets adb connect output", () => {
    expect(parseConnectOutput("connected to 192.168.0.23:37123").ok).toBe(true);
    expect(parseConnectOutput("already connected to 192.168.0.23:37123").ok).toBe(true);
    expect(parseConnectOutput("failed to connect to '192.168.0.23:37123': Connection refused").ok).toBe(false);
    expect(parseConnectOutput("cannot connect to 192.168.0.23:1: No connection could be made").ok).toBe(false);
  });
});
