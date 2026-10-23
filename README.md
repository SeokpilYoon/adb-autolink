<h1 align="center">adb-autolink</h1>

<p align="center"><b>Zero-touch wireless ADB for Android developers, built for Claude Code.</b></p>

<p align="center">

**English** · [한국어](README.ko.md) · [日本語](README.ja.md) · [简体中文](README.zh-Hans.md) · [Español](README.es.md) · [Français](README.fr.md)

</p>

<p align="center">
  <img src=".claude-plugin/icon.png" width="96" alt="adb-autolink icon" />
</p>

---

Walk out with your phone, come back, and just ask Claude:

> "Install Builds/game.apk on my S21, launch it and take a screenshot."

No re-pairing, no typing IP addresses, ports or pairing codes. The phone turns wireless debugging back on by itself when it joins a Wi-Fi network you trust, and the MCP server finds it via mDNS and reconnects on demand.

## How it works

```
 Phone (ADB Autolink app)                      PC (Claude Code + adb-autolink MCP)
 ─────────────────────────                     ───────────────────────────────────
 joins a whitelisted Wi-Fi                     Claude calls any tool (e.g. screenshot)
   → writes adb_wifi_enabled=1                   → adb mdns services  (_adb-tls-connect._tcp)
   → adbd advertises a new random port  ────▶    → adb connect ip:port  (already paired)
                                                 → runs the command
```

- Pairing is permanent; what breaks after leaving the network is only that **wireless debugging turns off** and **the port changes**. This project fixes exactly those two things.
- The companion app uses `WRITE_SECURE_SETTINGS` (granted once over adb) to toggle wireless debugging. No root.

## Components

| Path | What |
|---|---|
| `android-app/` | **ADB Autolink** companion app (Kotlin, Compose, Android 11+). Auto-enables wireless debugging on whitelisted SSIDs, Quick Settings tile, survives reboots. |
| `mcp-server/` | MCP server (TypeScript, prebuilt self-contained bundle in `mcp-server/dist`, no `npm install` needed) + `adb-autolink` CLI. |
| `skills/setup/` | Guided first-time setup skill (`/adb-autolink:setup`). |

## Requirements

- Claude Code
- Node.js 20+
- Android SDK platform-tools (`adb` 34+ with mDNS). Found via `ADB_PATH`, `ANDROID_HOME` / `ANDROID_SDK_ROOT`, the default Android Studio SDK location, or `PATH`.
- Android 11+ phone, on the same LAN as the PC. Tested target: Samsung Galaxy (One UI).

## Install

```text
/plugin marketplace add SeokpilYoon/adb-autolink
/plugin install adb-autolink@adb-autolink
```

Restart Claude Code, then run:

```text
/adb-autolink:setup
```

Claude walks you through pairing and installs the companion app (downloaded from the latest GitHub release). The install grants every permission and exemption over adb and, when connected wirelessly, allows the current Wi-Fi, so there is nothing to configure in the app. The only prompt left is Android's *"Always allow on this network"*.

### Manual setup (alternative)

1. Pair once: **Developer options → Wireless debugging → Pair device with pairing code**, then `adb pair <ip:port> <code>` (or ask Claude to call `pair_device`).
2. Install the APK from [Releases](https://github.com/SeokpilYoon/adb-autolink/releases/latest) and grant the permission:
   ```bash
   adb install -r adb-autolink.apk
   adb shell pm grant dev.adbautolink.companion android.permission.WRITE_SECURE_SETTINGS
   ```
3. In the **ADB Autolink** app:
   - Location → **Allow all the time** and Location services ON (needed to read the Wi-Fi name in the background)
   - Allow notifications
   - Battery → **Unrestricted** (Samsung: also exclude it from sleeping apps)
   - Tap **Allow this Wi-Fi** (auto mode is on while at least one Wi-Fi is allowed)
   - The app's *Setup needed* card lists only what is still missing.
4. The first time on each network Android asks *"Allow wireless debugging on this network?"*: tick **Always allow on this network**. Trust is per access point (BSSID), so mesh or dual-band routers may ask once per AP. The app notifies you when this approval is needed.

## MCP tools

Every device tool auto-connects first. Select a device by serial, `ip:port`, alias, or model name (`S21`, `S24+`, `S24 Ultra`). If you omit it, the only online device is used.

| Tool | Description |
|---|---|
| `list_devices` | Connected devices plus phones discovered via mDNS |
| `connect_device` / `disconnect_device` | Explicit connect / disconnect (usually not needed) |
| `pair_device` | First-time pairing with a 6-digit code |
| `install_companion_app` | Download + install the ADB Autolink app and grant its permission |
| `install_apk` | Install an APK (`-r -g`) |
| `launch_app` / `stop_app` | Start (launcher or a specific activity) / force-stop |
| `screenshot` | 1280px JPEG preview by default, `full_resolution` for the original PNG, optional `save_path` |
| `tap` / `swipe` / `input_text` / `key_event` | Input (`input_text` is ASCII only, an Android `input` limitation) |
| `wake_device` | Wake the screen and dismiss a non-secure keyguard |
| `logcat` | Filter by package, tag or priority, limit lines, crash buffer |
| `set_device_alias` | Name devices, e.g. `test`, `main` |

CLI: `node mcp-server/dist/cli.js devices` · `node mcp-server/dist/cli.js connect S21`

## Languages

The companion app, the CLI, setup guidance and the setup skill support **English, 한국어, 日本語, 简体中文, Español and Français**.

- **App:** follows the phone's language. On Android 13+ you can also pick a language per app.
- **CLI and tool guidance:** follow `ADB_AUTOLINK_LANG` (`en`, `ko`, `ja`, `zh-Hans`, `es`, `fr`), or the OS locale if it isn't set.
- **Claude:** answers in the language you write in.

## Documentation

See [docs/](docs/README.md): [architecture](docs/architecture.md), [troubleshooting](docs/troubleshooting.md), [release process](docs/release.md), [security](SECURITY.md), [changelog](CHANGELOG.md).

## Troubleshooting

| Symptom | Check |
|---|---|
| Phone not found | Phone on a whitelisted Wi-Fi? App notification says *ON*? Same LAN as the PC? |
| mDNS discovery is empty | Windows network profile must be **Private**; allow `adb.exe` (UDP 5353) through the firewall |
| Screenshot shows the lock screen | adb can't unlock a PIN or pattern; use Smart Lock (trusted places) or unlock manually |
| Screenshot is black | The app uses `FLAG_SECURE` |
| Install blocked | Samsung **Auto Blocker** off; answer the Play Protect prompt on the phone |
| SSID shows `<unknown ssid>` | Location "Allow all the time", location services on, auto-revoke of unused-app permissions off |
| PC asked to re-authorize after a week | Enable *Disable 7-day authorization timeout* in the app (`adb_allowed_connection_time=0`) |

## Security notes

- Wireless debugging is only auto-enabled on SSIDs you whitelist, and Android still enforces per-access-point trust plus key-based pairing. Don't whitelist public Wi-Fi.
- The MCP server auto-connects only to phones it has connected to before. The first run is the only exception.
- The Quick Settings tile requires an unlocked phone.
- Enabling wireless debugging also turns on Developer options and USB debugging; turning it off does not revert those.
- Logcat output and screen content are passed to the model, so treat logs from untrusted apps as untrusted input.

## Building from source

```bash
# MCP server
cd mcp-server && npm install && npm run build && npm test

# Android app (JDK 17-21; Android Studio's bundled JBR works)
cd android-app && ./gradlew assembleDebug
# Release: signing is read from ~/.android/adb-autolink-keystore.properties
# (storeFile, storePassword, keyAlias, keyPassword); unsigned if absent.
./gradlew assembleRelease   # → android-app/build/dist/adb-autolink.apk
```

Contributors: enable the secret-guard hook once per clone with `git config core.hooksPath .githooks` (see [SECURITY.md](SECURITY.md)).

## License

[MIT](LICENSE)
