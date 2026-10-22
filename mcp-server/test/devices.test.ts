import { describe, expect, it } from "vitest";
import {
  type DeviceCandidate,
  DeviceSelectionError,
  marketNameForModel,
  matchSelector,
  normalizeMarketName,
  planConnect,
  resolveDevice,
} from "../src/devices.js";

const s21: DeviceCandidate = { serial: "R5CR10ABCDE", physicalSerial: "R5CR10ABCDE", model: "SM-G991N", state: "device" };
const s24p: DeviceCandidate = {
  serial: "192.168.0.31:41001",
  physicalSerial: "R5CT20XYZ12",
  address: "192.168.0.31:41001",
  model: "SM-S926N",
  state: "device",
};
const s24: DeviceCandidate = { serial: "R5CW00S24", physicalSerial: "R5CW00S24", model: "SM-S921N", state: "device" };
const s24u: DeviceCandidate = { serial: "R5CX00ULT", physicalSerial: "R5CX00ULT", model: "SM-S928B", state: "device" };
const all = [s21, s24p, s24, s24u];

describe("normalizeMarketName", () => {
  it("normalizes plus/ultra/galaxy/case/spaces", () => {
    expect(normalizeMarketName("S24+")).toBe("s24+");
    expect(normalizeMarketName("Galaxy S24 Plus")).toBe("s24+");
    expect(normalizeMarketName("s24plus")).toBe("s24+");
    expect(normalizeMarketName("S24 Ultra")).toBe("s24ultra");
    expect(normalizeMarketName("galaxy s21")).toBe("s21");
  });

  it("maps model codes to market names", () => {
    expect(marketNameForModel("SM_S926N")).toBe("Galaxy S24+");
    expect(marketNameForModel("SM-G991B")).toBe("Galaxy S21");
    expect(marketNameForModel("Pixel 8")).toBeUndefined();
  });
});

describe("resolveDevice", () => {
  it("S24 does not match S24+ or S24 Ultra", () => {
    expect(resolveDevice("S24", all)).toBe(s24);
    expect(resolveDevice("S24+", all)).toBe(s24p);
    expect(resolveDevice("galaxy s24 plus", all)).toBe(s24p);
    expect(resolveDevice("S24 Ultra", all)).toBe(s24u);
  });

  it("S24 resolves to nothing when only S24+ is online", () => {
    expect(resolveDevice("S24", [s21, s24p])).toBeUndefined();
    expect(resolveDevice("s21", [s21, s24p])).toBe(s21);
  });

  it("matches by serial, physical serial, ip:port, alias and model code", () => {
    expect(resolveDevice("R5CR10ABCDE", all)).toBe(s21);
    expect(resolveDevice("r5ct20xyz12", all)).toBe(s24p);
    expect(resolveDevice("192.168.0.31:41001", all)).toBe(s24p);
    expect(resolveDevice("main", all, { main: "R5CT20XYZ12" })).toBe(s24p);
    expect(resolveDevice("Test", all, { test: "R5CR10ABCDE" })).toBe(s21);
    expect(resolveDevice("SM-S926N", all)).toBe(s24p);
    expect(resolveDevice("sm_g991", all)).toBe(s21);
  });

  it("matches mDNS-form transport via physical serial", () => {
    const mdnsS21: DeviceCandidate = {
      serial: "adb-R5CR10ABCDE-Xyz12A._adb-tls-connect._tcp",
      physicalSerial: "R5CR10ABCDE",
      model: "SM-G991N",
      state: "device",
    };
    expect(resolveDevice("R5CR10ABCDE", [mdnsS21])).toBe(mdnsS21);
  });

  it("omitted selector: single device, none, or ambiguous", () => {
    expect(resolveDevice(undefined, [s21])).toBe(s21);
    expect(resolveDevice(undefined, [])).toBeUndefined();
    expect(() => resolveDevice(undefined, [s21, s24p])).toThrow(DeviceSelectionError);
    expect(() => resolveDevice(undefined, [s21, s24p])).toThrow(/R5CR10ABCDE/);
  });

  it("same phone over USB and Wi-Fi counts as one device", () => {
    const wifi: DeviceCandidate = { ...s21, serial: "192.168.0.23:37123", address: "192.168.0.23:37123" };
    expect(resolveDevice(undefined, [s21, wifi])).toBe(s21);
    expect(matchSelector("S21", [s21, wifi])).toHaveLength(1);
  });

  it("ambiguous model substring throws", () => {
    expect(() => resolveDevice("SM-S92", all)).toThrow(/multiple/);
  });
});

describe("planConnect (which discovered mDNS entries to adb connect)", () => {
  const disc = (phys: string, port: number): DeviceCandidate => ({
    serial: "",
    physicalSerial: phys,
    address: `192.168.0.${port % 250}:${port}`,
    state: "discovered",
  });
  const s21m = disc("R5CR10ABCDE", 37123);
  const s24m = disc("R5CT20XYZ12", 41001);
  const newm = disc("R5CZ99NEW", 42002);
  const known = { R5CR10ABCDE: { model: "SM-G991N" }, R5CT20XYZ12: { model: "SM-S926N" } };

  it("selector: connects only remembered entries matching by remembered model or alias", () => {
    expect(planConnect("S21", [s21m, s24m, newm], known)).toEqual({ connect: [s21m], bootstrap: false });
    expect(planConnect("main", [s21m, s24m, newm], known, { main: "R5CT20XYZ12" })).toEqual({ connect: [s24m], bootstrap: false });
  });

  it("selector: unremembered entry matched directly by serial", () => {
    expect(planConnect("R5CZ99NEW", [s21m, newm], known)).toEqual({ connect: [newm], bootstrap: false });
  });

  it("selector: bootstraps only unremembered entries when nothing remembered matches", () => {
    expect(planConnect("S24 Ultra", [s21m, s24m, newm], known)).toEqual({ connect: [newm], bootstrap: true });
    expect(planConnect("S24 Ultra", [s21m, s24m], known)).toEqual({ connect: [], bootstrap: true });
  });

  it("no selector: remembered only, unremembered only on first run", () => {
    expect(planConnect(undefined, [s21m, newm], known)).toEqual({ connect: [s21m], bootstrap: false });
    expect(planConnect(undefined, [newm], known)).toEqual({ connect: [], bootstrap: false });
    expect(planConnect(undefined, [s21m, newm], {})).toEqual({ connect: [s21m, newm], bootstrap: false });
  });
});
