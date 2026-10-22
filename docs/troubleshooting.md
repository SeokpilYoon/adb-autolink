# Troubleshooting

## The phone is not found

1. Check the **ADB Autolink** notification on the phone. It should say *Wireless debugging ON*.
   - **"not whitelisted"**: add the current Wi-Fi network in the app.
   - **`<unknown ssid>`**: the app can't see the Wi-Fi name. Set location to *Allow all the time*, turn Location services on, and turn off auto-revoke of permissions for unused apps.
   - **"waiting for approval"**: approve the access point (see the next section).
2. The PC and phone must be on the same LAN. Guest networks and AP/client isolation block mDNS and adb.
3. Run `node mcp-server/dist/cli.js devices`. If mDNS discovery comes back empty:
   - **Windows:** set the network profile to **Private**, and allow `adb.exe` through the firewall (UDP 5353 for mDNS, plus the TCP port).
   - Run `adb mdns check`. You need platform-tools 34 or newer.

## "Allow wireless debugging on this network?" keeps coming back

- Android approves each **access point** (BSSID) separately, not each network name.
- Mesh systems and dual-band routers have several access points. Approve each one once with **Always allow on this network**.
- When Android resets the setting, the app retries once, then shows an *Approve wireless debugging* notification. Tapping it opens the right settings screen.

## Screenshot shows the lock screen or a black frame

- **Lock screen:** adb can only dismiss a lock that has no PIN or pattern. For hands-free use, set up Smart Lock (trusted places), or unlock the phone yourself.
- **Black frame:** the app uses `FLAG_SECURE`, and Android blanks it in screenshots.

## Install is blocked

- **Samsung:** turn off **Auto Blocker** (Settings → Security and privacy → Auto Blocker).
- **Play Protect:** look for a scan prompt on the phone and answer it.

## The app stops working after a while (Samsung)

- Set battery usage to **Unrestricted**.
- Remove the app from *Sleeping apps* and *Deep sleeping apps*.

## The PC must re-authorize after a week

Android revokes a paired PC that hasn't connected for 7 days. To stop this, turn on *Disable 7-day authorization timeout* in the app (`adb_allowed_connection_time=0`). Read [SECURITY.md](../SECURITY.md) first.

## `input_text` refuses Korean or emoji

`adb shell input text` can only type ASCII. Paste the text through the clipboard instead, or use an IME-based method.
