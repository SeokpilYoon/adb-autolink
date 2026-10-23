---
name: setup
description: >-
  First-time setup of adb-autolink for an Android phone: pair over wireless debugging, install the ADB Autolink
  companion app, grant its permission, and walk the user through the on-phone settings. Use when the user asks to set
  up, onboard or add a new phone for wireless adb / adb-autolink. Triggers: wireless adb setup, wireless debugging,
  pair phone, connect phone over Wi-Fi, 무선 디버깅, 무선 adb, 폰 연결, 휴대폰 연결, 페어링, ワイヤレスデバッグ,
  ワイヤレス デバッグ, スマホ接続, ペア設定, 无线调试, 连接手机, 配对, depuración inalámbrica, vincular teléfono,
  débogage sans fil, associer le téléphone.
version: 0.3.0
license: MIT
depends_on:
  required_bins:
    - name: adb
      why: Android SDK platform-tools; the MCP server drives the phone through adb (pair, connect, install, shell). Set ADB_PATH if it is not on PATH.
    - name: node
      why: Runs the bundled adb-autolink MCP server (Node.js 20 or newer).
---

# adb-autolink setup

Always talk to the user in the language they are using; pass `lang` to tools that return guidance (`pair_device`, `install_companion_app`, `connect_device`), e.g. `lang: "ko"`. Use the phone's localized setting names (ko: 개발자 옵션 > 무선 디버깅, ja: 開発者向けオプション > ワイヤレス デバッグ, zh: 开发者选项 > 无线调试, es: Opciones para desarrolladores > Depuración inalámbrica, fr: Options pour les développeurs > Débogage sans fil).

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
Call `install_companion_app` (optionally with `device`). It downloads the latest release APK, installs it, grants `WRITE_SECURE_SETTINGS`, location and notification permissions, exempts the app from battery optimization and permission auto-removal, turns off the 7-day authorization timeout, opens the app, and (when connected wirelessly) allows the current Wi-Fi. Relay each numbered step of the result. If install is blocked, relay the hint (Samsung **Auto Blocker** off, Play Protect prompt on screen).

## 4. On the phone (usually nothing)
The install already did the settings, so don't walk the user through the app. Only act on what the result reports:
- Step 4 lists failed commands: ask the user to open the app; its *Setup needed* card shows a button for each missing item.
- Step 7 did not allow a Wi-Fi (USB install, or the Wi-Fi name was unreadable): on the home/office Wi-Fi, tap **Allow this Wi-Fi** in the app. Location services must be ON for the name to be readable.
- When Android asks *"Allow wireless debugging on this network?"* tick **Always allow on this network**. Mesh or dual-band routers may ask once per access point.
- More networks: tap **Allow this Wi-Fi** there, or the **Allow** action in the notification that appears when Wireless debugging is turned on by hand on a new network.

## 5. Verify
- Ask the user to toggle Wi-Fi off and on (or step out and back). Then call `connect_device` and `screenshot` without any manual input.
- Suggest `set_device_alias` (e.g. "test", "main") if they have several phones.
