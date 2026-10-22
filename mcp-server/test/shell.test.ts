import { describe, expect, it } from "vitest";
import { assertPackageName, encodeInputText, inputTextCommands, normalizeKey, shQuote } from "../src/shell.js";

describe("shQuote / encodeInputText", () => {
  it("single-quotes and escapes embedded quotes", () => {
    expect(shQuote("abc")).toBe("'abc'");
    expect(shQuote("it's")).toBe("'it'\\''s'");
  });

  it("converts spaces to %s and neutralizes shell metacharacters", () => {
    expect(encodeInputText("hello world")).toBe("'hello%sworld'");
    expect(encodeInputText("a;rm -rf /")).toBe("'a;rm%s-rf%s/'");
    expect(encodeInputText("$(reboot)`id`|&<>")).toBe("'$(reboot)`id`|&<>'");
    expect(encodeInputText(`say "hi" it's`)).toBe(`'say%s"hi"%sit'\\''s'`);
  });

  it("splits newlines into ENTER key events", () => {
    expect(inputTextCommands("user\npass word")).toEqual(["input text 'user'", "input keyevent 66", "input text 'pass%sword'"]);
    expect(inputTextCommands("x\n")).toEqual(["input text 'x'", "input keyevent 66"]);
  });

  it("keeps a literal %s by splitting it across commands", () => {
    expect(inputTextCommands("100%sure")).toEqual(["input text '100%'", "input text 'sure'"]);
    expect(inputTextCommands("a %s b")).toEqual(["input text 'a%s%'", "input text 's%sb'"]);
    expect(inputTextCommands("50% off")).toEqual(["input text '50%%soff'"]);
  });

  it("rejects tabs with a clear error", () => {
    expect(() => inputTextCommands("a\tb")).toThrow(/tab/);
  });
});

describe("normalizeKey", () => {
  it("maps names and numbers", () => {
    expect(normalizeKey("back")).toBe("KEYCODE_BACK");
    expect(normalizeKey("HOME")).toBe("KEYCODE_HOME");
    expect(normalizeKey("enter")).toBe("KEYCODE_ENTER");
    expect(normalizeKey("KEYCODE_VOLUME_UP")).toBe("KEYCODE_VOLUME_UP");
    expect(normalizeKey("volume up")).toBe("KEYCODE_VOLUME_UP");
    expect(normalizeKey("66")).toBe("66");
    expect(() => normalizeKey("BACK; reboot")).toThrow();
  });
});

describe("assertPackageName", () => {
  it("accepts valid and rejects injection", () => {
    expect(assertPackageName("com.example.game")).toBe("com.example.game");
    expect(() => assertPackageName("com.x;reboot")).toThrow();
    expect(() => assertPackageName("noDots")).toThrow();
  });
});
