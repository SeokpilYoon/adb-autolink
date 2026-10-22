/** Helpers for building safe command strings for the device's /system/bin/sh. */

/** POSIX single-quote a value so the device shell treats it literally. */
export function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Encode text for `input text`. The `input` command turns `%s` into a space and
 * cannot receive real spaces as part of one argument, so spaces become `%s`.
 * The whole thing is then single-quoted for the device shell, which blocks any
 * shell metacharacter interpretation ($, `, ;, |, &, quotes...).
 * A literal "%s" has no escape in `input text`; inputTextCommands splits it across two commands.
 */
export function encodeInputText(text: string): string {
  return shQuote(text.replace(/ /g, "%s"));
}

/**
 * Build the device shell command(s) to type `text`. Newlines are sent as ENTER
 * key events between `input text` chunks. Returns one command string per step.
 */
export function inputTextCommands(text: string): string[] {
  if (text.includes("\t")) throw new Error("input_text cannot type tab characters; use key_event TAB instead.");
  const bad = /[^\x20-\x7E\r\n]/.exec(text);
  if (bad) {
    throw new Error(
      `input_text supports printable ASCII only; found "${bad[0]}" (U+${bad[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}). ` +
        "Android's `input text` cannot type Korean/emoji/non-ASCII; use the clipboard or an IME-based approach instead.",
    );
  }
  const commands: string[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((line, i) => {
    // Split between "%" and "s" so `input text` cannot turn a literal "%s" into a space.
    for (const chunk of line.split(/(?<=%)(?=s)/)) if (chunk) commands.push(`input text ${encodeInputText(chunk)}`);
    if (i < lines.length - 1) commands.push("input keyevent 66");
  });
  return commands;
}

const KEY_ALIASES: Record<string, string> = {
  BACK: "KEYCODE_BACK",
  HOME: "KEYCODE_HOME",
  ENTER: "KEYCODE_ENTER",
  RETURN: "KEYCODE_ENTER",
  MENU: "KEYCODE_MENU",
  POWER: "KEYCODE_POWER",
  APP_SWITCH: "KEYCODE_APP_SWITCH",
  RECENTS: "KEYCODE_APP_SWITCH",
  TAB: "KEYCODE_TAB",
  DEL: "KEYCODE_DEL",
  BACKSPACE: "KEYCODE_DEL",
  DELETE: "KEYCODE_FORWARD_DEL",
  ESC: "KEYCODE_ESCAPE",
  ESCAPE: "KEYCODE_ESCAPE",
  UP: "KEYCODE_DPAD_UP",
  DOWN: "KEYCODE_DPAD_DOWN",
  LEFT: "KEYCODE_DPAD_LEFT",
  RIGHT: "KEYCODE_DPAD_RIGHT",
  VOLUME_UP: "KEYCODE_VOLUME_UP",
  VOLUME_DOWN: "KEYCODE_VOLUME_DOWN",
  WAKEUP: "KEYCODE_WAKEUP",
  SLEEP: "KEYCODE_SLEEP",
};

/** Normalize a key name ("back", "KEYCODE_HOME", "66") to an `input keyevent` argument. */
export function normalizeKey(key: string): string {
  const k = key.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (/^\d{1,4}$/.test(k)) return k;
  if (!/^[A-Z0-9_]+$/.test(k)) throw new Error(`Invalid key "${key}". Use a name like BACK/HOME/ENTER or a numeric keycode.`);
  if (KEY_ALIASES[k]) return KEY_ALIASES[k];
  return k.startsWith("KEYCODE_") ? k : `KEYCODE_${k}`;
}

/** Android package name validation (also blocks shell metacharacters). */
export function assertPackageName(pkg: string): string {
  if (!/^[A-Za-z][\w]*(\.[A-Za-z_][\w]*)+$/.test(pkg)) throw new Error(`Invalid package name "${pkg}"`);
  return pkg;
}
