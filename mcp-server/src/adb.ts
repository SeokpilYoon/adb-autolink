import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const IS_WIN = process.platform === "win32";
const ADB_EXE = IS_WIN ? "adb.exe" : "adb";

let cachedAdbPath: string | undefined;

/**
 * Resolve the adb binary: ADB_PATH → ANDROID_HOME / ANDROID_SDK_ROOT →
 * %LOCALAPPDATA%\Android\Sdk (Windows) / ~/Library/Android/sdk, ~/Android/Sdk → "adb" on PATH.
 */
export function resolveAdbPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env === process.env && cachedAdbPath) return cachedAdbPath;
  const candidates: string[] = [];
  if (env.ADB_PATH) candidates.push(env.ADB_PATH);
  for (const key of ["ANDROID_HOME", "ANDROID_SDK_ROOT"] as const) {
    const root = env[key];
    if (root) candidates.push(path.join(root, "platform-tools", ADB_EXE));
  }
  if (env.LOCALAPPDATA) {
    candidates.push(path.join(env.LOCALAPPDATA, "Android", "Sdk", "platform-tools", ADB_EXE));
  }
  const home = env.HOME ?? env.USERPROFILE;
  if (home) {
    candidates.push(path.join(home, "Library", "Android", "sdk", "platform-tools", ADB_EXE));
    candidates.push(path.join(home, "Android", "Sdk", "platform-tools", ADB_EXE));
  }
  const found = candidates.find((c) => existsSync(c)) ?? "adb";
  if (env === process.env) cachedAdbPath = found;
  return found;
}

export interface RunAdbOptions {
  serial?: string;
  timeoutMs?: number;
  /** Allow non-zero exit codes without throwing. */
  allowFailure?: boolean;
}

export interface AdbResult<T> {
  stdout: T;
  stderr: string;
  code: number;
}

export class AdbError extends Error {
  constructor(
    message: string,
    readonly args: string[],
    readonly stdout: string,
    readonly stderr: string,
    readonly code: number | string | null,
  ) {
    super(message);
    this.name = "AdbError";
  }
}

const MAX_BUFFER = 256 * 1024 * 1024;
const DEFAULT_TIMEOUT = 30_000;

function buildArgs(args: string[], serial?: string): string[] {
  return serial ? ["-s", serial, ...args] : args;
}

function exec(args: string[], opts: RunAdbOptions, binary: boolean): Promise<AdbResult<Buffer>> {
  const adb = resolveAdbPath();
  const fullArgs = buildArgs(args, opts.serial);
  return new Promise((resolve, reject) => {
    execFile(
      adb,
      fullArgs,
      {
        encoding: "buffer",
        maxBuffer: MAX_BUFFER,
        timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT,
        windowsHide: true,
        shell: false,
      },
      (err, stdout, stderr) => {
        const out = stdout ?? Buffer.alloc(0);
        const errText = (stderr ?? Buffer.alloc(0)).toString("utf8");
        if (err) {
          const e = err as NodeJS.ErrnoException & { code?: number | string; killed?: boolean };
          if (e.code === "ENOENT") {
            reject(
              new AdbError(
                `adb not found (tried "${adb}"). Set ADB_PATH or ANDROID_HOME to your Android SDK platform-tools.`,
                fullArgs,
                "",
                errText,
                "ENOENT",
              ),
            );
            return;
          }
          if (e.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
            reject(
              new AdbError(
                `adb ${fullArgs.join(" ")} produced more than ${MAX_BUFFER / 1024 / 1024} MB of output (maxBuffer exceeded)`,
                fullArgs,
                "",
                errText,
                "EMAXBUFFER",
              ),
            );
            return;
          }
          if (e.killed) {
            reject(
              new AdbError(
                `adb ${fullArgs.join(" ")} timed out after ${opts.timeoutMs ?? DEFAULT_TIMEOUT} ms`,
                fullArgs,
                binary ? "" : out.toString("utf8"),
                errText,
                "ETIMEDOUT",
              ),
            );
            return;
          }
          const code = typeof e.code === "number" ? e.code : 1;
          if (opts.allowFailure) {
            resolve({ stdout: out, stderr: errText, code });
            return;
          }
          const text = (errText || out.toString("utf8")).trim();
          reject(
            new AdbError(`adb ${fullArgs.join(" ")} failed (exit ${code}): ${text}`, fullArgs, out.toString("utf8"), errText, code),
          );
          return;
        }
        resolve({ stdout: out, stderr: errText, code: 0 });
      },
    );
  });
}

/** Run adb and return text output. */
export async function runAdb(args: string[], opts: RunAdbOptions = {}): Promise<AdbResult<string>> {
  const r = await exec(args, opts, false);
  return { ...r, stdout: r.stdout.toString("utf8") };
}

/** Run adb and return raw binary stdout (e.g. `exec-out screencap -p`). */
export async function runAdbBinary(args: string[], opts: RunAdbOptions = {}): Promise<AdbResult<Buffer>> {
  return exec(args, opts, true);
}
