#!/usr/bin/env node
// Release helper (no dependencies). The GitHub release page is generated from CHANGELOG.md.
//
//   node scripts/release.mjs check     versions agree, CHANGELOG has "## v<version>", mcp-server/dist is up to date
//   node scripts/release.mjs publish   check + clean/pushed git + tag v<version> + gh release with adb-autolink.apk
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = (p) => path.join(root, p);
const read = (p) => readFileSync(rel(p), "utf8");
const APK = "android-app/build/dist/adb-autolink.apk";
const ASSET_NAME = "adb-autolink.apk"; // install_companion_app downloads releases/latest/download/adb-autolink.apk

class CheckError extends Error {}

function versions() {
  const pick = (file, re) => {
    const m = re.exec(read(file));
    return m ? m[1] : undefined;
  };
  const marketplace = JSON.parse(read(".claude-plugin/marketplace.json"));
  const entry = marketplace.plugins?.find((p) => p.name === "adb-autolink") ?? marketplace.plugins?.[0];
  return {
    ".claude-plugin/plugin.json": JSON.parse(read(".claude-plugin/plugin.json")).version,
    ".claude-plugin/marketplace.json": entry?.version,
    "mcp-server/package.json": JSON.parse(read("mcp-server/package.json")).version,
    "mcp-server/package-lock.json": JSON.parse(read("mcp-server/package-lock.json")).version,
    "mcp-server/src/config.ts": pick("mcp-server/src/config.ts", /export const VERSION\s*=\s*"([^"]+)"/),
    "android-app/app/build.gradle.kts (versionName)": pick("android-app/app/build.gradle.kts", /versionName\s*=\s*"([^"]+)"/),
    "skills/setup/SKILL.md (frontmatter)": pick("skills/setup/SKILL.md", /^---\r?\n[\s\S]*?^version:\s*["']?([^\s"']+)["']?\s*$[\s\S]*?^---/m),
  };
}

/** Body of the "## v<version>" CHANGELOG section (up to the next "## "). */
function changelogSection(version) {
  if (!existsSync(rel("CHANGELOG.md"))) return undefined;
  const lines = read("CHANGELOG.md").split(/\r?\n/);
  const esc = version.replace(/\./g, "\\.");
  const start = lines.findIndex((l) => new RegExp(`^## v${esc}(\\s|$)`).test(l));
  if (start < 0) return undefined;
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join("\n").trim();
}

/** Rebuild the MCP bundle into a temp dir (same esbuild config) and compare with the committed dist byte for byte. */
function distProblems() {
  const server = rel("mcp-server");
  if (!existsSync(path.join(server, "node_modules", "esbuild"))) {
    return ["mcp-server/node_modules is missing; run (cd mcp-server && npm ci) so the bundle can be verified"];
  }
  const tmp = mkdtempSync(path.join(os.tmpdir(), "adb-autolink-dist-"));
  try {
    const r = spawnSync(process.execPath, ["scripts/build.mjs", tmp], { cwd: server, encoding: "utf8" });
    if (r.status !== 0) return [`rebuilding the bundle failed:\n${r.stderr || r.stdout}`];
    const committed = path.join(server, "dist");
    const want = readdirSync(tmp).sort();
    const have = existsSync(committed) ? readdirSync(committed).sort() : [];
    const problems = [];
    for (const f of want) {
      if (!have.includes(f)) problems.push(`mcp-server/dist/${f} is missing`);
      // Compare ignoring CRLF/LF so a Windows checkout with autocrlf does not count as stale.
      else if (readFileSync(path.join(tmp, f), "utf8").replace(/\r\n/g, "\n") !== readFileSync(path.join(committed, f), "utf8").replace(/\r\n/g, "\n"))
        problems.push(`mcp-server/dist/${f} differs from a fresh build of mcp-server/src`);
    }
    for (const f of have) if (!want.includes(f)) problems.push(`mcp-server/dist/${f} is not produced by the build (stale file)`);
    if (problems.length) problems.push("run: (cd mcp-server && npm run build)");
    return problems;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function check() {
  const problems = [];
  const v = versions();
  const plugin = v[".claude-plugin/plugin.json"];
  console.log("Versions:");
  for (const [file, ver] of Object.entries(v)) console.log(`  ${ver === plugin ? "ok  " : "DIFF"} ${ver ?? "(not found)"}  ${file}`);
  if (!plugin) problems.push(".claude-plugin/plugin.json has no version");
  for (const [file, ver] of Object.entries(v)) if (ver !== plugin) problems.push(`${file} is ${ver ?? "missing"}, expected ${plugin}`);

  const notes = plugin ? changelogSection(plugin) : undefined;
  if (!notes) problems.push(`CHANGELOG.md has no non-empty "## v${plugin}" section`);
  else console.log(`CHANGELOG: "## v${plugin}" section found (${notes.split("\n").length} lines)`);

  const dist = distProblems();
  if (!dist.length) console.log("mcp-server/dist: matches a fresh build");
  problems.push(...dist);

  if (problems.length) throw new CheckError(`check failed:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  console.log(`check: OK (v${plugin})`);
  return { version: plugin, notes };
}

// stdout is null when the caller inherits stdio.
const run = (cmd, args, opts = {}) => (execFileSync(cmd, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }) ?? "").trim();

/** aapt2 from ANDROID_HOME / ANDROID_SDK_ROOT / %LOCALAPPDATA%/Android/Sdk (newest build-tools first). */
function findAapt2() {
  const sdks = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Android", "Sdk"), path.join(os.homedir(), "Library", "Android", "sdk"), path.join(os.homedir(), "Android", "Sdk")].filter(Boolean);
  const exe = process.platform === "win32" ? "aapt2.exe" : "aapt2";
  for (const sdk of sdks) {
    const bt = path.join(sdk, "build-tools");
    if (!existsSync(bt)) continue;
    const dirs = readdirSync(bt).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const d of dirs) if (existsSync(path.join(bt, d, exe))) return path.join(bt, d, exe);
  }
  return undefined;
}

function apkVersionName(apk) {
  const aapt2 = findAapt2();
  if (!aapt2) throw new CheckError("aapt2 not found (set ANDROID_HOME, or install Android SDK build-tools)");
  const badging = run(aapt2, ["dump", "badging", apk]);
  const m = /versionName='([^']*)'/.exec(badging);
  if (!m) throw new CheckError(`could not read versionName from ${apk}`);
  return m[1];
}

function publish() {
  const { version, notes } = check();
  const tag = `v${version}`;

  const apk = rel(APK);
  if (!existsSync(apk)) throw new CheckError(`${APK} not found; build it with (cd android-app && ./gradlew assembleRelease)`);
  const apkVersion = apkVersionName(apk);
  if (apkVersion !== version) throw new CheckError(`${APK} has versionName ${apkVersion}, expected ${version}; rebuild the APK`);
  console.log(`APK: ${APK} versionName ${apkVersion}`);

  if (run("git", ["status", "--porcelain"])) throw new CheckError("working tree is not clean; commit or stash first");
  run("git", ["fetch", "--quiet", "--tags"]);
  const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  let upstream;
  try {
    upstream = run("git", ["rev-parse", "--abbrev-ref", "@{u}"]);
  } catch {
    throw new CheckError(`branch ${branch} has no upstream; push it first`);
  }
  if (run("git", ["rev-parse", "HEAD"]) !== run("git", ["rev-parse", upstream])) throw new CheckError(`HEAD is not pushed to ${upstream}`);
  const head = run("git", ["rev-parse", "HEAD"]);
  const remoteTag = run("git", ["ls-remote", "--tags", "origin", `refs/tags/${tag}^{}`]).split(/\s/)[0];
  if (remoteTag) {
    // Resume a publish that pushed the tag but did not create the release.
    if (remoteTag !== head) throw new CheckError(`tag ${tag} already exists on origin at another commit`);
    console.log(`tag ${tag} already on origin at HEAD; resuming`);
  } else {
    if (run("git", ["tag", "--list", tag])) throw new CheckError(`tag ${tag} already exists locally but not on origin`);
    run("git", ["tag", "-a", tag, "-m", `adb-autolink ${tag}`]);
    run("git", ["push", "origin", tag], { stdio: ["ignore", "inherit", "inherit"] });
    console.log(`tagged and pushed ${tag}`);
  }

  const tmp = mkdtempSync(path.join(os.tmpdir(), "adb-autolink-notes-"));
  try {
    const notesFile = path.join(tmp, "notes.md");
    writeFileSync(notesFile, `${notes}\n`);
    // gh names the asset after the file, which must stay adb-autolink.apk.
    if (path.basename(apk) !== ASSET_NAME) throw new CheckError(`asset must be named ${ASSET_NAME}`);
    execFileSync("gh", ["release", "create", tag, apk, "--title", `adb-autolink ${tag}`, "--notes-file", notesFile, "--verify-tag"], {
      cwd: root,
      stdio: "inherit",
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`published ${tag}`);
}

const cmd = process.argv[2];
try {
  if (cmd === "check") check();
  else if (cmd === "publish") publish();
  else {
    console.error("Usage: node scripts/release.mjs <check|publish>");
    process.exit(2);
  }
} catch (e) {
  console.error(e instanceof CheckError ? e.message : (e.stack ?? String(e)));
  process.exit(1);
}
