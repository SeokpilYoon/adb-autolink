import { describe, expect, it } from "vitest";
import { parsePairOutput, validatePairArgs } from "../src/parse.js";

describe("validatePairArgs", () => {
  it("accepts ip:port and a 6-digit code (spaces/dashes stripped)", () => {
    expect(validatePairArgs(" 192.168.0.23:37099 ", "123456")).toEqual({ address: "192.168.0.23:37099", code: "123456" });
    expect(validatePairArgs("192.168.0.23:37099", "123 456")).toEqual({ address: "192.168.0.23:37099", code: "123456" });
    expect(validatePairArgs("[fe80::1]:40000", "000-111").code).toBe("000111");
  });
  it("rejects bad addresses", () => {
    for (const a of ["192.168.0.23", "192.168.0.23:0", "192.168.0.23:70000", "", "host:port", "1.2.3.4:5555;reboot", "a b:123"]) {
      expect(() => validatePairArgs(a, "123456"), a).toThrow(/Invalid pairing address/);
    }
  });
  it("rejects bad codes", () => {
    for (const c of ["", "12345", "1234567", "abcdef", "12345a", "123456;"]) {
      expect(() => validatePairArgs("192.168.0.23:37099", c), c).toThrow(/Invalid pairing code/);
    }
  });
});

describe("parsePairOutput", () => {
  it("extracts the physical serial from the guid", () => {
    expect(parsePairOutput("Successfully paired to 192.168.0.23:37099 [guid=adb-R5CR10ABCDE-Xyz12A]\n")).toEqual({
      ok: true,
      serial: "R5CR10ABCDE",
      message: "Successfully paired to 192.168.0.23:37099 [guid=adb-R5CR10ABCDE-Xyz12A]",
    });
  });
  it("reports failure", () => {
    expect(parsePairOutput("Failed: Wrong password or connection was dropped.").ok).toBe(false);
  });
});

describe("validateConnectAddress", () => {
  it("accepts the connect ip:port and expands a bare port with the pairing host", async () => {
    const { validateConnectAddress } = await import("../src/parse.js");
    expect(validateConnectAddress(" 192.168.0.26:41235 ", "192.168.0.26:39823")).toBe("192.168.0.26:41235");
    expect(validateConnectAddress("41235", "192.168.0.26:39823")).toBe("192.168.0.26:41235");
  });

  it("rejects the pairing dialog's address and garbage", async () => {
    const { validateConnectAddress } = await import("../src/parse.js");
    expect(() => validateConnectAddress("192.168.0.26:39823", "192.168.0.26:39823")).toThrow(/pairing/i);
    expect(() => validateConnectAddress("not an address", "192.168.0.26:39823")).toThrow();
  });
});
