import { describe, expect, it } from "vitest";
import { companionSetupCommands, parseSetupBroadcast, setupBroadcastCommand, setupCommandOk } from "../src/companion.js";

describe("companion setup", () => {
  it("grants notifications only on API 33+", () => {
    expect(companionSetupCommands(32).some((c) => c.includes("POST_NOTIFICATIONS"))).toBe(false);
    expect(companionSetupCommands(34).some((c) => c.includes("POST_NOTIFICATIONS"))).toBe(true);
  });

  it("covers background location and both battery/auto-revoke exemptions", () => {
    const cmds = companionSetupCommands(34, "x.y");
    expect(cmds).toContain("pm grant x.y android.permission.ACCESS_BACKGROUND_LOCATION");
    expect(cmds).toContain("dumpsys deviceidle whitelist +x.y");
    expect(cmds).toContain("cmd appops set x.y RUN_ANY_IN_BACKGROUND allow");
    expect(cmds).toContain("cmd appops set x.y AUTO_REVOKE_PERMISSIONS_IF_UNUSED ignore");
  });

  it("detects failing shell output", () => {
    expect(setupCommandOk("")).toBe(true);
    expect(setupCommandOk("Added: dev.adbautolink.companion")).toBe(true);
    expect(setupCommandOk("Exception occurred while executing 'grant':\njava.lang.SecurityException: ...")).toBe(false);
    expect(setupCommandOk("Error: Unknown operation string: FOO")).toBe(false);
  });

  it("builds an explicit broadcast to the DUMP-protected receiver", () => {
    expect(setupBroadcastCommand(true, "x.y")).toBe(
      "am broadcast -n x.y/.SetupReceiver -a x.y.action.SETUP --ez add_current_wifi true",
    );
  });

  it("parses the receiver result", () => {
    const head = "Broadcasting: Intent { act=x.y.action.SETUP flg=0x400000 cmp=x.y/.SetupReceiver (has extras) }\n";
    expect(parseSetupBroadcast(`${head}Broadcast completed: result=0, data="whitelisted:My "Home" 5G"`)).toEqual({
      kind: "whitelisted",
      ssid: 'My "Home" 5G',
    });
    expect(parseSetupBroadcast(`${head}Broadcast completed: result=0, data="no_ssid"\r\n`)).toEqual({ kind: "no_ssid" });
    expect(parseSetupBroadcast(`${head}Broadcast completed: result=0, data="ok"`)).toEqual({ kind: "ok" });
    // Receiver never ran (e.g. old app version without SetupReceiver).
    expect(parseSetupBroadcast(`${head}Broadcast completed: result=0`).kind).toBe("unknown");
  });
});
