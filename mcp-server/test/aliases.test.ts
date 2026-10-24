import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatSavedPhones } from "../src/connector.js";
import {
  aliasKey,
  autoAliasBase,
  loadAliases,
  matchSelector,
  nextAutoAlias,
  rememberDevice,
  removeAlias,
  setAlias,
} from "../src/devices.js";
import { withLang } from "../src/i18n.js";

describe("alias rules", () => {
  it("compares ignoring case, spaces, - and _", () => {
    expect(aliasKey("S21-2")).toBe(aliasKey("s21 2"));
    expect(aliasKey("S21_2")).toBe(aliasKey("s21-2"));
    expect(aliasKey("S21")).not.toBe(aliasKey("S21-2"));
  });

  it("uses the model name, without Galaxy and spaces", () => {
    expect(autoAliasBase("SM_S926N")).toBe("S24+");
    expect(autoAliasBase("SM-G991N")).toBe("S21");
    expect(autoAliasBase("SM-S928N")).toBe("S24Ultra");
    expect(autoAliasBase("SM_A536N")).toBe("SM-A536N"); // no market name known
  });

  it("numbers repeats from 2", () => {
    expect(nextAutoAlias("S21", {})).toBe("S21");
    expect(nextAutoAlias("S21", { S21: "a" })).toBe("S21-2");
    expect(nextAutoAlias("S21", { S21: "a", "S21-2": "b" })).toBe("S21-3");
    expect(nextAutoAlias("S21", { s21: "a", "s21 2": "b" })).toBe("S21-3");
  });

  it("matches an alias written differently", () => {
    const cands = [
      { serial: "A", physicalSerial: "A", state: "device" },
      { serial: "B", physicalSerial: "B", state: "device" },
    ];
    expect(matchSelector("s21 2", cands, { S21: "A", "S21-2": "B" }).map((c) => c.serial)).toEqual(["B"]);
  });
});

describe("automatic aliases", () => {
  const prevHome = process.env.ADB_AUTOLINK_HOME;
  beforeEach(() => {
    process.env.ADB_AUTOLINK_HOME = mkdtempSync(path.join(os.tmpdir(), "adbal-alias-"));
  });
  afterEach(() => {
    if (prevHome === undefined) delete process.env.ADB_AUTOLINK_HOME;
    else process.env.ADB_AUTOLINK_HOME = prevHome;
  });

  it("names phones by model on first sight, numbering a second phone of the same model", () => {
    rememberDevice("R3CX40C2YKL", { model: "SM_S926N" });
    rememberDevice("R3CR40Y924J", { model: "SM_G991N" });
    rememberDevice("R3CRXXXXXXX", { model: "SM_G991N" });
    expect(loadAliases()).toEqual({ "S24+": "R3CX40C2YKL", S21: "R3CR40Y924J", "S21-2": "R3CRXXXXXXX" });
  });

  it("leaves a phone that already has an alias alone, and never re-adds a removed auto alias", () => {
    rememberDevice("SER1", { model: "SM_G991N" });
    removeAlias("s21");
    rememberDevice("SER1", { model: "SM_G991N", lastAddress: "1.2.3.4:5" });
    expect(loadAliases()).toEqual({});

    setAlias("test", "SER2");
    rememberDevice("SER2", { model: "SM_G991N" });
    expect(loadAliases()).toEqual({ test: "SER2" });
    const devices = JSON.parse(readFileSync(path.join(process.env.ADB_AUTOLINK_HOME!, "devices.json"), "utf8"));
    expect(devices.SER2.autoAlias).toBe(true);
  });

  it("refuses to remove an alias that does not exist", () => {
    expect(() => removeAlias("nope")).toThrow(/No alias "nope"/);
  });
});

describe("formatSavedPhones", () => {
  it("renders a localized table with aliases, model and state, plus report paths", () => {
    const out = withLang("ko", () =>
      formatSavedPhones([
        {
          serial: "R3CX40C2YKL",
          aliases: ["S24+"],
          model: "SM_S926N",
          lastAddress: "192.168.0.26:44229",
          lastSeen: "2026-10-24T05:12:00.000Z",
          online: true,
          report: "C:\\checks\\report.md",
        },
        { serial: "R3CR40Y924J", aliases: [], model: "SM_G991N", online: false },
      ]),
    );
    expect(out).toContain("| 별칭 | 기종 |");
    expect(out).toContain("| `S24+` | Galaxy S24+ (SM-S926N) | R3CX40C2YKL | 192.168.0.26:44229 |");
    expect(out).toContain("| 온라인 |");
    expect(out).toContain("| - | Galaxy S21 (SM-G991N) | R3CR40Y924J | - | - | 오프라인 |");
    expect(out).toContain("S24+: C:\\checks\\report.md");
  });

  it("explains an empty list", () => {
    expect(withLang("en", () => formatSavedPhones([]))).toContain("No phones saved yet");
  });
});

describe("phones outside the Galaxy table", () => {
  it("uses the product name the phone reports, unless it is just the model code", async () => {
    const { displayName } = await import("../src/devices.js");
    expect(displayName("Pixel_8", "Pixel 8")).toBe("Pixel 8");
    expect(displayName("SM_S926N", "Galaxy S24+")).toBe("Galaxy S24+"); // table wins
    expect(displayName("SM_A536N", "SM-A536N")).toBeUndefined();
    expect(displayName("2201116SG", "")).toBeUndefined();
  });

  it("builds aliases from those names", () => {
    expect(autoAliasBase("Pixel_8", "Pixel 8")).toBe("Pixel8");
    expect(autoAliasBase("Pixel_8", "Google Pixel 8 Pro")).toBe("Pixel8Pro");
    expect(autoAliasBase("2201116SG", "Redmi Note 11")).toBe("RedmiNote11");
    expect(autoAliasBase("SM_A536N", "Galaxy A53 5G")).toBe("A535G");
    expect(autoAliasBase("2201116SG", "")).toBe("2201116SG");
  });

  it("finds a phone by its reported name", () => {
    const cands = [
      { serial: "P", physicalSerial: "P", model: "Pixel_8", marketName: "Pixel 8", state: "device" },
      { serial: "R", physicalSerial: "R", model: "2201116SG", marketName: "Redmi Note 11", state: "device" },
    ];
    expect(matchSelector("pixel 8", cands).map((c) => c.serial)).toEqual(["P"]);
    expect(matchSelector("Redmi-Note-11", cands).map((c) => c.serial)).toEqual(["R"]);
  });
});

describe("automatic aliases for other brands", () => {
  const prevHome = process.env.ADB_AUTOLINK_HOME;
  beforeEach(() => {
    process.env.ADB_AUTOLINK_HOME = mkdtempSync(path.join(os.tmpdir(), "adbal-alias-"));
  });
  afterEach(() => {
    if (prevHome === undefined) delete process.env.ADB_AUTOLINK_HOME;
    else process.env.ADB_AUTOLINK_HOME = prevHome;
  });

  it("names a Pixel after its reported name", () => {
    rememberDevice("PIX1", { model: "Pixel_8", marketName: "Pixel 8" });
    rememberDevice("PIX2", { model: "Pixel_8", marketName: "Pixel 8" });
    expect(loadAliases()).toEqual({ Pixel8: "PIX1", "Pixel8-2": "PIX2" });
  });
});
