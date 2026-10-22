---
name: setup
description: First-time setup of adb-autolink for an Android phone — pair over wireless debugging, install the ADB Autolink companion app, grant its permission, and walk the user through the on-phone settings. Use when the user asks to set up, onboard, or add a new phone for wireless adb / adb-autolink.
---

# adb-autolink setup

Goal: after this, the phone re-enables wireless debugging by itself on trusted Wi-Fi and every adb-autolink MCP tool reconnects automatically.

Work through the steps in order, one at a time, and confirm each with the user before moving on. Use the `adb-autolink` MCP tools; do not shell out to adb yourself unless a tool is missing.

## 1. Check prerequisites
- Call `list_devices`. If it fails because adb is not found, tell the user to install Android SDK platform-tools (or Android Studio) or set `ADB_PATH`, then stop.
- The PC and phone must be on the same Wi-Fi. On Windows the network profile should be **Private** so mDNS (UDP 5353) reaches adb.

## 2. Pair (once per phone)
Skip if `list_devices` already shows the phone online or discovered.
1. Ask the user to open **Settings → Developer options → Wireless debugging** on the phone, turn it on, then tap **Pair device with pairing code**. (Developer options: tap *Build number* 7 times in *About phone → Software information*.)
2. Ask for the **IP address & port** and the **6-digit code** shown in that dialog.
3. Call `pair_device` with them. A USB-connected phone can skip pairing.

## 3. Install the companion app
Call `install_companion_app` (optionally with `device`). It downloads the latest release APK, installs it, grants `WRITE_SECURE_SETTINGS` and opens the app. If install is blocked, relay the hint (Samsung **Auto Blocker** off, Play Protect prompt on screen).

## 4. On-phone settings (user does these in the ADB Autolink app)
Walk through, one by one:
1. Location permission → **Allow all the time**, and Location services ON (needed to read the Wi-Fi name in the background).
2. Allow notifications.
3. Battery → **Unrestricted** (Samsung: also exclude from *Sleeping apps*).
4. While on the home/office Wi-Fi tap **Add current Wi-Fi**, then turn **Auto-enable** on.
5. When Android asks *"Allow wireless debugging on this network?"* tick **Always allow on this network**. Mesh or dual-band routers may ask once per access point.
6. Optional: *Disable 7-day authorization timeout* so the PC stays authorized.

## 5. Verify
- Ask the user to toggle Wi-Fi off and on (or step out and back). Then call `connect_device` and `screenshot` without any manual input.
- Suggest `set_device_alias` (e.g. "test", "main") if they have several phones.
