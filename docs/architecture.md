# Architecture

## Components

| Path | Role |
|---|---|
| `android-app/` | **ADB Autolink** (Kotlin, Compose, minSdk 30) turns wireless debugging back on when the phone joins a whitelisted network. |
| `mcp-server/` | MCP server over stdio and the `adb-autolink` CLI. TypeScript sources are bundled into `dist/` with esbuild, so the plugin needs no runtime dependencies. |
| `skills/setup/` | The `/adb-autolink:setup` onboarding skill. |
| `.claude-plugin/`, `.mcp.json` | Plugin and marketplace manifests. The repository root is the plugin. |

## Why wireless ADB breaks and how it is fixed

Pairing is persistent: the phone keeps the PC's adb key. The optional `adb_allowed_connection_time=0` setting removes the 7-day expiry for a PC that hasn't connected recently. What breaks after you leave the network is that wireless debugging switches off, and when it comes back adbd listens on a new random port.

### Phone side (`WifiWatcherService`)

- **Monitoring:**
  - A foreground service (type `specialUse`) watches Wi-Fi through a `NetworkCallback` with location info.
  - A backup `PendingIntent` callback restarts the service if its process is killed.
  - `BootReceiver` restarts it after a reboot or an app update.
- **Turning wireless debugging on:**
  - On a whitelisted network the service writes `adb_wifi_enabled=1` and checks a few seconds later that it stuck.
  - Android approves wireless debugging per access point (BSSID) and resets the setting to 0 on an access point you haven't approved yet. The service then retries once and asks the user to approve that access point.
- **Manual off:** if the user turns wireless debugging off with the tile or in the app, the service leaves it off until the network changes.
- **Screen off:** a `MulticastLock` is held on whitelisted networks so the mDNS advertisement keeps working while the screen is off.

### PC side (`ensureConnected`)

Every device tool goes through `ensureConnected`, and only one connection attempt runs at a time:

1. **Already online:** the target is checked with `echo ok` (8 s timeout, one retry) and used as is.
2. **Otherwise:** the last known `ip:port` is tried first, then `adb mdns services` is read for `_adb-tls-connect._tcp` entries.
3. **Which entries are connected:** only remembered serials that match the selector. Unknown devices are connected only on the first run.
4. **Cleanup:** stale `offline` entries for the same phone are disconnected. Devices that adb auto-connected through mDNS are matched to the same phone, so they are not listed twice.

## State

| Where | What |
|---|---|
| Phone: app SharedPreferences | Whitelist, the auto-enable switch, and the user-off flag |
| PC: `~/.adb-autolink/` (`ADB_AUTOLINK_HOME`) | `aliases.json` and remembered devices (serial → model, last address) |
| PC: `~/.adb-autolink/cache/` | The downloaded companion APK |

## Languages

- **Phone app:** standard Android string resources in `values`, `values-ko`, `values-ja`, `values-zh-rCN`, `values-es` and `values-fr`.
- **MCP server:**
  - Tool names and descriptions stay in English, because the model reads them.
  - Text meant for people follows `ADB_AUTOLINK_LANG`, then the OS locale. Tools that return guidance also accept a `lang` parameter.
