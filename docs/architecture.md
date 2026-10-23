# Architecture

## Components

| Path | Role |
|---|---|
| `android-app/` | **ADB Autolink** (Kotlin, Compose, minSdk 30) turns wireless debugging back on when the phone joins a whitelisted network. |
| `mcp-server/` | MCP server over stdio and the `adb-autolink` CLI. TypeScript sources are bundled into `dist/` with esbuild, so the plugin needs no runtime dependencies. |
| `skills/setup/` | The `/adb-autolink:setup` onboarding skill. |
| `.claude-plugin/` | Plugin manifest (including the MCP server definition) and marketplace manifest. The repository root is the plugin. |

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
- **Port beacon (`PortBeacon`, `AdbPortLocator`):** the PC can rarely rely on mDNS to learn the new port. Windows drops inbound multicast on Public networks or without a firewall rule for adb, and many routers filter it. So on whitelisted Wi-Fi the app answers on TCP 47383 (Wi-Fi address only) with the current port, and only to a request carrying a token that a PC handed it in `install_companion_app`.
  - Protocol: the PC sends `ADBAL1 <token>`, and the phone replies `ADBAL1 serial=<ro.serialno> port=<port, 0 if unknown> adb=<on|off>`.
  - Finding the port on the phone: apps cannot read `/proc/net` or `service.adb.tls.port`, and the phone's own mDNS can return the previous port from its cache after a restart. So every candidate (the last port, then the mDNS answer) is confirmed with the adb handshake: adbd answers a `CNXN` packet on its TLS port with `STLS`. A full scan of open ports, which is correct but takes tens of seconds, is the last resort.

### PC side (`ensureConnected`)

Every device tool goes through `ensureConnected`, and only one connection attempt runs at a time:

1. **Already online:** the target is checked with `echo ok` (8 s timeout, one retry) and used as is.
2. **Otherwise:** the last known `ip:port` is tried first. Then the companion app's port beacon is asked, at the phone's last IP and otherwise across the PC's private /24 subnets (`beacon.ts`). Then `adb mdns services` is read for `_adb-tls-connect._tcp` entries. A beacon reply with Wireless debugging off turns into a precise error: usually the "Always allow on this network" prompt is waiting.
3. **Which entries are connected:** only remembered serials that match the selector. Unknown devices are connected only on the first run.
4. **Cleanup:** stale `offline` entries for the same phone are disconnected. Devices that adb auto-connected through mDNS are matched to the same phone, so they are not listed twice.

## State

| Where | What |
|---|---|
| Phone: app SharedPreferences | Whitelist (auto mode is on while it is non-empty), the user-off flag, the last suggested SSID, beacon tokens (one per PC) and the device serial |
| PC: `~/.adb-autolink/` (`ADB_AUTOLINK_HOME`) | `aliases.json`, remembered devices (serial → model, last address) and `beacon-token` |
| PC: `~/.adb-autolink/cache/` | The downloaded companion APK |

## Languages

- **Phone app:** standard Android string resources in `values`, `values-ko`, `values-ja`, `values-zh-rCN`, `values-es` and `values-fr`.
- **MCP server:**
  - Tool names and descriptions stay in English, because the model reads them.
  - Text meant for people follows `ADB_AUTOLINK_LANG`, then the OS locale. Tools that return guidance also accept a `lang` parameter.
