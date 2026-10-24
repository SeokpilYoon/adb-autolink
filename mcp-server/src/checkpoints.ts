/**
 * Connection checkpoints for setup: a screenshot plus a report row at the first connection and at each
 * reconnect test, so there is a record that the phone came back on a new port without any input.
 *
 *   ~/.adb-autolink/checks/<Market-name>_<serial>/<yyyy-mm-dd_HH-MM-SS>/
 *     1-first-connect.png, 2-reconnect.png, ..., session.json, report.md
 *
 * Kept in the state dir rather than the user's project: phone screens can show personal data and must
 * not end up committed to a game repository.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stateDir } from "./devices.js";
import { type MessageKey, t } from "./i18n.js";

export type Stage = "first_connect" | "reconnect";
export const STAGES = ["first_connect", "reconnect"] as const;
/** How ensureConnected reached the phone, read from its log. */
export type Via = "online" | "last_known" | "beacon" | "mdns" | "direct";

export interface CheckpointEntry {
  n: number;
  stage: Stage;
  time: string;
  address: string;
  via: Via;
  elapsedMs: number;
  appVersion?: string;
  pluginVersion: string;
  file: string;
}

export interface Session {
  device: string;
  serial: string;
  entries: CheckpointEntry[];
}

const KEEP_SESSIONS = 5;
/** A reconnect test joins the device's latest session unless that session is older than this. */
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function checksDir(root = stateDir()): string {
  return path.join(root, "checks");
}

/** "Galaxy S24+" + "R3CX40C2YKL" -> "Galaxy-S24+_R3CX40C2YKL" (safe on every file system). */
export function deviceFolderName(name: string | undefined, serial: string): string {
  return `${name || "device"}_${serial}`.replace(/[^\w+.-]+/g, "-");
}

const pad = (n: number) => String(n).padStart(2, "0");

const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Local time, sortable: 2026-10-24_15-30-12. */
export function sessionName(d: Date): string {
  return `${localDate(d)}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

/** Local wall-clock time for the report: 2026-10-24 15:30:12. */
export function localTime(d: Date): string {
  return `${localDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Classify ensureConnected's log. `direct` = the caller passed an ip:port selector. */
export function viaFromLog(log: string[], direct: boolean): Via {
  const connected = log.filter((l) => /: connected to /.test(l));
  if (connected.length === 0) return "online";
  const last = connected[connected.length - 1]!;
  if (/\(beacon/.test(last)) return "beacon";
  if (/\(last known\)/.test(last)) return "last_known";
  return direct ? "direct" : "mdns";
}

function readSession(dir: string): Session | undefined {
  try {
    return JSON.parse(readFileSync(path.join(dir, "session.json"), "utf8")) as Session;
  } catch {
    return undefined;
  }
}

/** Existing session folders of one device, oldest first (names sort by time). */
function sessions(deviceDir: string): string[] {
  if (!existsSync(deviceDir)) return [];
  return readdirSync(deviceDir)
    .filter((n) => /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(n) && statSync(path.join(deviceDir, n)).isDirectory())
    .sort();
}

/** A first connection always starts a session; a reconnect test continues the latest recent one. */
export function pickSessionDir(deviceDir: string, stage: Stage, now: Date): string {
  const latest = sessions(deviceDir).at(-1);
  if (stage === "reconnect" && latest) {
    const dir = path.join(deviceDir, latest);
    const age = now.getTime() - statSync(dir).mtimeMs;
    if (age < SESSION_MAX_AGE_MS) return dir;
  }
  let name = sessionName(now);
  for (let s = 1; existsSync(path.join(deviceDir, name)); s++) name = sessionName(new Date(now.getTime() + s * 1000)); // same second twice
  return path.join(deviceDir, name);
}

const stageLabel = (s: Stage) => t(`checkpoint.stage.${s}` as MessageKey);
const viaLabel = (v: Via) => t(`checkpoint.via.${v}` as MessageKey);

export function renderReport(s: Session): string {
  const rows = s.entries.map((e) =>
    [
      e.n,
      stageLabel(e.stage),
      e.time,
      `\`${e.address}\``,
      viaLabel(e.via),
      `${(e.elapsedMs / 1000).toFixed(1)} s`,
      e.appVersion ?? "-",
      e.pluginVersion,
      `[${e.file}](${e.file})`,
    ].join(" | "),
  );
  const images = s.entries.map((e) => `<img src="${e.file}" width="270" alt="${e.n}. ${stageLabel(e.stage)}">`);
  return [
    `# ${t("checkpoint.reportTitle", s.device)}`,
    "",
    t("checkpoint.reportHeader"),
    "|---|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => `| ${r} |`),
    "",
    `<p>\n${images.join("\n")}\n</p>`,
    "",
  ].join("\n");
}

export interface SaveInput {
  stage: Stage;
  deviceName?: string;
  serial: string;
  address: string;
  via: Via;
  elapsedMs: number;
  appVersion?: string;
  pluginVersion: string;
  png: Buffer;
  now?: Date;
  root?: string;
}

/** Write the screenshot, append the report row, prune old sessions. Returns the absolute paths. */
export function saveCheckpoint(i: SaveInput): { png: string; report: string; sessionDir: string; entry: CheckpointEntry } {
  const now = i.now ?? new Date();
  const deviceDir = path.join(checksDir(i.root), deviceFolderName(i.deviceName, i.serial));
  const dir = pickSessionDir(deviceDir, i.stage, now);
  mkdirSync(dir, { recursive: true });

  const session = readSession(dir) ?? { device: i.deviceName ? `${i.deviceName} (${i.serial})` : i.serial, serial: i.serial, entries: [] };
  const n = session.entries.length + 1;
  const file = `${n}-${i.stage.replace("_", "-")}.png`;
  writeFileSync(path.join(dir, file), i.png);
  const entry: CheckpointEntry = {
    n,
    stage: i.stage,
    time: localTime(now),
    address: i.address,
    via: i.via,
    elapsedMs: i.elapsedMs,
    appVersion: i.appVersion,
    pluginVersion: i.pluginVersion,
    file,
  };
  session.entries.push(entry);
  writeFileSync(path.join(dir, "session.json"), `${JSON.stringify(session, null, 2)}\n`);
  const report = path.join(dir, "report.md");
  writeFileSync(report, renderReport(session));

  for (const old of sessions(deviceDir).slice(0, -KEEP_SESSIONS)) rmSync(path.join(deviceDir, old), { recursive: true, force: true });
  return { png: path.join(dir, file), report, sessionDir: dir, entry };
}

/** The newest report.md recorded for a phone, if any (device folders end in "_<serial>"). */
export function latestReport(serial: string, root?: string): string | undefined {
  const dir = checksDir(root);
  if (!existsSync(dir)) return undefined;
  const reports = readdirSync(dir)
    .filter((d) => d.endsWith(`_${serial}`))
    .flatMap((d) => sessions(path.join(dir, d)).map((s) => path.join(dir, d, s, "report.md")))
    .filter((f) => existsSync(f))
    .sort((a, b) => path.basename(path.dirname(a)).localeCompare(path.basename(path.dirname(b))));
  return reports.at(-1);
}
