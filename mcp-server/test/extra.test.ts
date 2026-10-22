import { describe, expect, it } from "vitest";
import { type DeviceCandidate, resolveDevice } from "../src/devices.js";
import { installFailureHint, parseKeyguardShowing, parseWakefulness } from "../src/parse.js";
import { inputTextCommands } from "../src/shell.js";

describe("dedupe of the same phone under several transports", () => {
  const mdnsName: DeviceCandidate = {
    serial: "adb-R5CR10ABCDE-Xyz12A._adb-tls-connect._tcp",
    physicalSerial: "R5CR10ABCDE",
    model: "SM-G991N",
    state: "device",
  };
  const ipPort: DeviceCandidate = {
    serial: "192.168.0.23:37123",
    address: "192.168.0.23:37123",
    physicalSerial: "R5CR10ABCDE",
    model: "SM-G991N",
    state: "device",
  };
  it("mDNS-name serial + ip:port count as one online device", () => {
    expect(resolveDevice(undefined, [mdnsName, ipPort])).toBe(mdnsName);
    expect(resolveDevice("S21", [mdnsName, ipPort])).toBe(mdnsName);
    expect(resolveDevice("192.168.0.23:37123", [mdnsName, ipPort])).toBe(ipPort);
  });
});

describe("wake / keyguard parsing", () => {
  it("detects keyguard showing", () => {
    expect(parseKeyguardShowing("    mShowingLockscreen=true mShowingDream=false")).toBe(true);
    expect(parseKeyguardShowing("  KeyguardServiceDelegate\n    showing=true\n")).toBe(false); // 'showing' line itself lacks keyword
    expect(parseKeyguardShowing("  mKeyguardShowing=true")).toBe(true);
    expect(parseKeyguardShowing("  isKeyguardShowing=false mDreamingLockscreen=false")).toBe(false);
    expect(parseKeyguardShowing("")).toBe(false);
  });
  it("reads wakefulness", () => {
    expect(parseWakefulness("  mWakefulness=Asleep\n")).toBe("Asleep");
    expect(parseWakefulness("mWakefulness=Awake")).toBe("Awake");
    expect(parseWakefulness("")).toBeUndefined();
  });
});

describe("install hints", () => {
  it("explains Auto Blocker / Play Protect failures", () => {
    expect(installFailureHint("Failure [INSTALL_FAILED_VERIFICATION_FAILURE]")).toMatch(/Auto Blocker/);
    expect(installFailureHint("Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: ...]")).toMatch(/Uninstall/);
    expect(installFailureHint("Success")).toBeUndefined();
  });
});

describe("input_text validation", () => {
  it("rejects non-ASCII (Korean)", () => {
    expect(() => inputTextCommands("안녕")).toThrow(/ASCII/);
    expect(() => inputTextCommands("hi 😀")).toThrow(/ASCII/);
  });
  it("keeps every shell metacharacter inside single quotes", () => {
    const meta = String.raw`()<>|;&*\~"'` + "`$";
    const quoted = String.raw`'()<>|;&*\~"'\''` + "`$'";
    expect(inputTextCommands(meta)).toEqual([`input text ${quoted}`]);
  });
});
