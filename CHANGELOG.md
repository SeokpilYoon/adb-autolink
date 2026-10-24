# Changelog

All notable changes to adb-autolink are recorded here. Each version must match across these files, and `node scripts/release.mjs check` enforces it:

- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `mcp-server/package.json`
- `mcp-server/src/config.ts`
- `android-app/app/build.gradle.kts` (`versionName`)
- `skills/setup/SKILL.md`

Release pages are generated from these sections.

## v0.4.4 - CI on Windows, Linux and macOS; names for every Android brand

**Upgrading from 0.4.3:** run `/plugin update adb-autolink` and restart Claude Code. The phone app is unchanged apart from its version number.

- **CI:** GitHub Actions now runs the MCP server's typecheck, tests and a start-up check on Windows, Linux and macOS (Node 20 and 22), checks that versions and the committed `dist` are consistent, and builds and lints the companion app. Real phones are not part of CI.
- **Phones outside the Galaxy table get readable names:** on first connection the server reads the product name the phone reports (`ro.product.marketname`, else `ro.product.model`) once. A Pixel 8 is shown as "Pixel 8", gets the alias `Pixel8` (a second one `Pixel8-2`), and is found by "pixel 8". Names that are only a model code are ignored, and Galaxy phones, which report only their code, keep using the built-in table.
- **Clearer support statement in the READMEs:** verified on real devices with Windows and Samsung Galaxy; Linux, macOS and other Android brands are supported but not yet verified on devices. Under WSL2, mirrored networking is needed to reach phones on your Wi-Fi.

## v0.4.3 - Saved phones table and model-name aliases

**Upgrading from 0.4.2:** run `/plugin update adb-autolink` and restart Claude Code. The phone app is unchanged apart from its version number, so there is no need to reinstall it. Phones you connected before get their model-name alias the next time you list devices.

- **Model-name aliases, automatically:** a phone gets its model as alias on its first connection (`S24+`, `S21`), and a second phone of the same model gets `S21-2`, then `S21-3`. Each phone is named once: an alias you remove is not added back, and a phone that already has an alias you chose keeps it.
- **Aliases match the way you say them:** case, spaces, `-` and `_` are ignored, so "s21 2" finds `S21-2`.
- **Remove aliases:** `set_device_alias` takes `remove: true`.
- **Saved phones table:** `list_devices` (and `adb-autolink devices`) ends with a table of every phone this PC remembers (alias, model, serial, last address, last connected, online now) and each phone's latest connection check report. `/adb-autolink:setup` finishes by showing it.
- **Fix:** a phone's "last connected" time was not updated while its address stayed the same; it is now refreshed at least every 10 minutes.

## v0.4.2 - Auto-connect on/off switch, lighter on battery

**Upgrading from 0.4.1:** run `/plugin update adb-autolink`, restart Claude Code, then call `install_companion_app` once per phone. The app updates in place and keeps its whitelist and beacon token.

- **Auto-connect switch:** turn the app off when you are not developing, without losing your allowed Wi-Fi list. Off stops the background service, the Wi-Fi trigger and the port beacon and turns Wireless debugging off, so the app's notification disappears and nothing runs or listens. On brings Wireless debugging back on an allowed Wi-Fi, and Claude reconnects through the port beacon as usual.
  - **In the app:** a main switch bar above the status panel, with a one-line note on what off and on do. While off, the panel says "Auto-connect is off" with a **Turn on auto-connect** button.
  - **Quick Settings tile:** now switches auto-connect instead of Wireless debugging alone. Its subtitle shows Ready, Waiting, Off or Setup needed. Turning it off works on a locked phone, turning it on needs an unlocked one, and a long press opens the app.
  - `install_companion_app` switches auto-connect back on, and when no phone is found the PC's hint now mentions the switch.
- **Battery:** the app no longer holds a multicast lock all the time on an allowed Wi-Fi, which kept the Wi-Fi chip from filtering multicast traffic. It takes the lock only for the few seconds it looks up a new port. With the port beacon, PCs no longer need the phone to answer mDNS while its screen is off.
- **Fix:** switching auto-connect off could leave a "Wireless debugging reset, retrying…" notification behind. The drop it causes is no longer treated as a reset, and the service clears its notification when it stops.

## v0.4.1 - Saved connection checks, and a second drop on the same Wi-Fi is retried

**Upgrading from 0.4.0:** run `/plugin update adb-autolink`, restart Claude Code, then call `install_companion_app` once per phone to get the app fix. The app updates in place and keeps its whitelist and beacon token.

- **`save_checkpoint` tool:** records a setup check. It connects (timing how long it takes and noting how: already online, last known address, port beacon or mDNS), opens the ADB Autolink app so the screen shows the current ip:port, and saves the screenshot with a report row under `~/.adb-autolink/checks/<device>_<serial>/<date_time>/` (`1-first-connect.png`, `2-reconnect.png`, `report.md`, `session.json`). A reconnect test joins the device's latest session from the last 24 hours, and the five newest sessions per device are kept. The result gives the file paths. The records stay in the plugin's state folder, not your project, because phone screens can show personal data.
- **`/adb-autolink:setup` verifies with saved records:** a checkpoint right after the first connection, then another after the user turns Wi-Fi off and on, so the report shows the port changing while the connection still comes back.
- **Fix (app): Wireless debugging dropping a second time on the same Wi-Fi was not turned back on.** The app retried only once per network, to avoid looping on a pending "Always allow on this network" prompt, and that retry was not restored until the Wi-Fi changed. It now gets a retry again after Wireless debugging has worked for a minute. An immediate reset by a pending prompt still gets a single retry.

## v0.4.0 - Reconnects even where mDNS is blocked

**Upgrading from 0.3.x:** run `/plugin update adb-autolink`, restart Claude Code, then call `install_companion_app` once per phone. The reinstall hands the app this PC's beacon token; until then the phone cannot use the new reconnect path. The app updates in place and keeps your whitelist.

- **Fix: after Wi-Fi off/on the phone was not found again.** Android gives Wireless debugging a new random port every time it turns on, and the PC learned the new port only from mDNS. mDNS is often blocked: Windows drops inbound multicast on networks with the Public profile (the default for a new Wi-Fi) or without a firewall rule for adb, and many routers filter it. The PC then retried the old port and was refused.
- **Port beacon:** on an allowed Wi-Fi the companion app answers on TCP 47383 (Wi-Fi address only) with its current port. It answers only requests that carry the token this PC gave it during `install_companion_app`. The PC asks the phone's last IP, then scans its own private /24 subnets in case the phone got a new address, and only then falls back to mDNS. In testing with mDNS blocked, a phone whose port had just changed was reconnected in about 3 seconds with no input.
- **Correct port on the phone:** the phone's own mDNS can return the previous port from its cache right after Wireless debugging restarts, which also made the app screen show a stale port. Every candidate port is now confirmed with the adb handshake (adbd answers `CNXN` with `STLS` on its TLS port), and a full scan of open ports remains as a slow last resort.
- **Clearer failure:** when the phone answers but Wireless debugging is off, the error says so and points at the "Always allow on this network" prompt, instead of a generic "no device found".

## v0.3.2 - Pairing asks for the connect address too

**Upgrading from 0.3.1:** run `/plugin update adb-autolink` and restart Claude Code. The phone app is unchanged apart from its version number, so there is no need to reinstall it.

- **Fix: pairing succeeded but the phone did not connect.** The pairing dialog's port only accepts `adb pair`; connecting needs the *IP address & Port* at the top of the Wireless debugging screen. Setup asked only for the dialog's values and relied on mDNS discovery for the rest, so on networks where discovery failed it fell back to an old port and was refused.
  - `pair_device` takes a new `connect_address` and connects to it right after pairing. A bare port is accepted and uses the pairing address's IP; passing the dialog's address by mistake is rejected with an explanation.
  - Without `connect_address` it now keeps looking for the phone for about 10 seconds instead of 1.5, then asks for the address at the top of the screen instead of retrying an old port.
  - `/adb-autolink:setup` asks for all three values (connect address, pairing address, code) in one message.
- **Guide step 3 updated in all six languages:** note ① the connect address at the top of the screen, then ② open the pairing dialog, and send the three values together. The screenshot marks both with numbers, and a "Paired, but not connected" row was added to troubleshooting ([한국어](https://github.com/SeokpilYoon/adb-autolink/blob/main/docs/guide/wireless-debugging.ko.md), [English](https://github.com/SeokpilYoon/adb-autolink/blob/main/docs/guide/wireless-debugging.md)).

## v0.3.1 - Illustrated wireless debugging guide

**Upgrading from 0.3.0:** run `/plugin update adb-autolink` and restart Claude Code. The phone app is unchanged apart from its version number, so there is no need to reinstall it.

- **Step-by-step guide with screenshots** for turning on Developer options and Wireless debugging and finding the pairing code: [English](https://github.com/SeokpilYoon/adb-autolink/blob/main/docs/guide/wireless-debugging.md), [한국어](https://github.com/SeokpilYoon/adb-autolink/blob/main/docs/guide/wireless-debugging.ko.md), [日本語](https://github.com/SeokpilYoon/adb-autolink/blob/main/docs/guide/wireless-debugging.ja.md), [简体中文](https://github.com/SeokpilYoon/adb-autolink/blob/main/docs/guide/wireless-debugging.zh-Hans.md), [Español](https://github.com/SeokpilYoon/adb-autolink/blob/main/docs/guide/wireless-debugging.es.md), [Français](https://github.com/SeokpilYoon/adb-autolink/blob/main/docs/guide/wireless-debugging.fr.md). Each screen marks the item to tap; personal details are blurred. Screenshots are from a Galaxy S21 (One UI 7) in Korean and English, and the other languages give their own menu names.
- **Claude shares the guide in your language:** `/adb-autolink:setup` links it before pairing, and failed pairing or "no reachable device" messages end with the link.

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
