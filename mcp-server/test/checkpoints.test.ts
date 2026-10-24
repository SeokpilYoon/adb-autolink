import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checksDir, deviceFolderName, saveCheckpoint, sessionName, viaFromLog } from "../src/checkpoints.js";
import { withLang } from "../src/i18n.js";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);

describe("checkpoint naming", () => {
  it("builds file-system-safe device folders", () => {
    expect(deviceFolderName("Galaxy S24+", "R3CX40C2YKL")).toBe("Galaxy-S24+_R3CX40C2YKL");
    expect(deviceFolderName(undefined, "abc")).toBe("device_abc");
    expect(deviceFolderName("A/B:C", "x")).toBe("A-B-C_x");
  });

  it("names sessions by sortable local time", () => {
    expect(sessionName(new Date(2026, 9, 24, 15, 3, 9))).toBe("2026-10-24_15-03-09");
  });
});

describe("viaFromLog", () => {
  it("reads how ensureConnected got through", () => {
    expect(viaFromLog([], false)).toBe("online");
    expect(viaFromLog(["adb connect 1.2.3.4:5 (last known): connected to 1.2.3.4:5"], false)).toBe("last_known");
    expect(
      viaFromLog(
        [
          "adb connect 1.2.3.4:5 (last known): cannot connect to 1.2.3.4:5",
          "adb connect 1.2.3.4:6 (beacon, R3CX): connected to 1.2.3.4:6",
        ],
        false,
      ),
    ).toBe("beacon");
    expect(viaFromLog(["adb connect 1.2.3.4:7 (R3CX): connected to 1.2.3.4:7"], false)).toBe("mdns");
    expect(viaFromLog(["adb connect 1.2.3.4:7: connected to 1.2.3.4:7"], true)).toBe("direct");
  });
});

describe("saveCheckpoint", () => {
  const base = { deviceName: "Galaxy S24+", serial: "R3CX40C2YKL", pluginVersion: "0.4.1", appVersion: "0.4.1", png };

  it("starts a session at first connection and adds the reconnect test to it", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "adbal-checks-"));
    const first = saveCheckpoint({
      ...base,
      stage: "first_connect",
      address: "192.168.0.26:34847",
      via: "direct",
      elapsedMs: 1200,
      now: new Date(2026, 9, 24, 15, 30, 12),
      root,
    });
    const again = saveCheckpoint({
      ...base,
      stage: "reconnect",
      address: "192.168.0.26:41235",
      via: "beacon",
      elapsedMs: 2900,
      now: new Date(2026, 9, 24, 15, 34, 40),
      root,
    });
    const dir = path.join(checksDir(root), "Galaxy-S24+_R3CX40C2YKL", "2026-10-24_15-30-12");
    expect(first.png).toBe(path.join(dir, "1-first-connect.png"));
    expect(again.png).toBe(path.join(dir, "2-reconnect.png"));
    expect(existsSync(again.png)).toBe(true);
    const report = readFileSync(again.report, "utf8");
    expect(report).toContain("`192.168.0.26:34847`");
    expect(report).toContain("`192.168.0.26:41235`");
    expect(report).toContain("2.9 s");
    expect(report).toContain("[2-reconnect.png](2-reconnect.png)");
  });

  it("writes the report in the requested language", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "adbal-checks-"));
    const r = await withLang("ko", async () =>
      saveCheckpoint({ ...base, stage: "first_connect", address: "a:1", via: "online", elapsedMs: 10, root }),
    );
    expect(readFileSync(r.report, "utf8")).toContain("최초 연결");
  });

  it("keeps only the five newest sessions per device", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "adbal-checks-"));
    for (let i = 0; i < 7; i++) {
      saveCheckpoint({ ...base, stage: "first_connect", address: "a:1", via: "online", elapsedMs: 10, now: new Date(2026, 9, 1 + i, 9), root });
    }
    const sessions = readdirSync(path.join(checksDir(root), "Galaxy-S24+_R3CX40C2YKL")).sort();
    expect(sessions).toHaveLength(5);
    expect(sessions[0]).toBe("2026-10-03_09-00-00");
  });
});
