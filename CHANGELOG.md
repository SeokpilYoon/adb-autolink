# Changelog

All notable changes to adb-autolink are recorded here. Each version must match across these files, and `node scripts/release.mjs check` enforces it:

- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `mcp-server/package.json`
- `mcp-server/src/config.ts`
- `android-app/app/build.gradle.kts` (`versionName`)
- `skills/setup/SKILL.md`

Release pages are generated from these sections.

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
