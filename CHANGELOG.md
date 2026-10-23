# Changelog

All notable changes to adb-autolink are recorded here. Each version must match across these files, and `node scripts/release.mjs check` enforces it:

- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `mcp-server/package.json`
- `mcp-server/src/config.ts`
- `android-app/app/build.gradle.kts` (`versionName`)
- `skills/setup/SKILL.md`

Release pages are generated from these sections.

## v0.3.0 - Nothing to set up in the phone app

**Upgrading from 0.2.x:** run `/plugin update adb-autolink`, restart Claude Code, then call `install_companion_app` once more so it applies the new automatic setup. The app updates in place and keeps your whitelist. If you had whitelisted networks but left *Auto-enable* off, auto mode is now on for them: remove a network from the list to stop it.

- **`install_companion_app` does the whole setup over adb.** Besides `WRITE_SECURE_SETTINGS` it now grants location (including *Allow all the time*) and notification permissions, exempts the app from battery optimization and from removal of unused apps' permissions, and turns off the 7-day adb authorization timeout so the PC is not forgotten after a week away (undo in the app under *Advanced*). Each step is reported, and a failed one only leaves that item for the app to fix.
- **The current Wi-Fi is allowed automatically** when the app is installed over wireless adb, since that network is your development network. Over USB the result tells you to tap *Allow this Wi-Fi* instead.
- **No auto-enable switch:** auto mode is on while at least one Wi-Fi is allowed.
- **"Allow this Wi-Fi?" notification** when Wireless debugging is turned on by hand (tile or system settings) on a network that is not allowed yet. Each network is offered once.
- **Redesigned app screen.** One panel colored by link state (ultramarine: the PC can connect now; amber: needs attention; slate: not an allowed Wi-Fi) leads with the current port in large type, the number that used to be typed by hand. Below it: fixes only for what is missing, the allowed Wi-Fi list, and a collapsed *Advanced* section (manual toggle, authorization timeout, language). The app now uses its own palette instead of wallpaper colors, and bundles the Archivo font (SIL OFL 1.1, see `android-app/third_party/archivo/OFL.txt`).
- The setup broadcast is received by a receiver protected by `android.permission.DUMP`, so only adb shell can trigger it.

## v0.2.1 - Cloning the repository no longer adds a broken project MCP server

**Upgrading from 0.2.0:** run `/plugin update adb-autolink` and restart Claude Code. If you opened Claude Code inside a clone of this repository and approved the project server `adb-autolink` it offered, remove that approval with `/mcp` or `claude mcp reset-project-choices`. The plugin server (`plugin:adb-autolink:adb-autolink`) is not affected, and the phone app is unchanged apart from its version number.

- **Fix: running Claude Code inside a clone no longer fails with `adb-autolink: CONNECTION_CLOSED`.** The MCP server was declared in a root `.mcp.json`. Claude Code also reads that file as the project MCP config of any clone, and there `${CLAUDE_PLUGIN_ROOT}` is not expanded, so node looked for `<clone>/${CLAUDE_PLUGIN_ROOT}/mcp-server/dist/index.js` and exited. The server is now declared in `.claude-plugin/plugin.json` (`mcpServers`), and the root `.mcp.json` is gone.

## v0.2.0 - Six languages, release tooling and secret guards

**Upgrading from 0.1.0:** run `/plugin update adb-autolink` and restart Claude Code. Then call `install_companion_app` to update the phone app; it is signed with the same key, so it updates in place and keeps your whitelist. The MCP state directory (`~/.adb-autolink`) and tool names are unchanged.

- **Multilingual:** six languages (English, 한국어, 日本語, 简体中文, Español, Français).
  - The companion app's UI and notifications. On Android 13+ the language can be chosen per app in system settings.
  - CLI output, connection hints and setup guidance, which follow `ADB_AUTOLINK_LANG` or the OS locale.
  - Guidance-returning tools, which accept a `lang` parameter so Claude answers in your language.
  - The READMEs.
- **Setup skill:**
  - Versioned frontmatter that lists the required binaries (`adb`, `node`).
  - Trigger phrases in every supported language.
  - Claude replies in the user's language.
- **Release tooling:**
  - `scripts/release.mjs check` verifies that versions, the CHANGELOG section and the committed MCP bundle agree.
  - `publish` tags the release and creates the GitHub release from this file, with the APK attached as `adb-autolink.apk`.
- **Security:**
  - New `SECURITY.md` and `.gitleaks.toml`.
  - New `.githooks/pre-commit` hook. It blocks signing keys and local secrets, scans staged changes with gitleaks, and refuses MCP source changes that come without a rebuilt bundle.
- **Docs:** a `docs/` folder covering architecture, troubleshooting and the release process.

## v0.1.0 - First release

- **ADB Autolink companion app** (Android 11+):
  - Turns wireless debugging back on when the phone joins a whitelisted Wi-Fi network, using `WRITE_SECURE_SETTINGS`.
  - Watches per-access-point approval and retries once.
  - Quick Settings tile.
  - Restarts after a reboot or app update.
- **MCP server:**
  - Reconnects on demand through mDNS discovery (`_adb-tls-connect._tcp`).
  - Device selection by serial, alias or model name (S21, S24+).
  - Tools: `pair_device`, `install_companion_app`, `install_apk`, `launch_app` / `stop_app`, `screenshot`, `tap` / `swipe` / `input_text` / `key_event`, `wake_device`, `logcat`.
- **Distribution:** Claude Code plugin and marketplace at the repository root, plus the `/adb-autolink:setup` skill.
