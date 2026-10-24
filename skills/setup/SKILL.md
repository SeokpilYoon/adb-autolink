---
name: setup
description: >-
  First-time setup of adb-autolink for an Android phone: pair over wireless debugging, install the ADB Autolink
  companion app, grant its permission, and walk the user through the on-phone settings. Use when the user asks to set
  up, onboard or add a new phone for wireless adb / adb-autolink. Triggers: wireless adb setup, wireless debugging,
  pair phone, connect phone over Wi-Fi, 무선 디버깅, 무선 adb, 폰 연결, 휴대폰 연결, 페어링, ワイヤレスデバッグ,
  ワイヤレス デバッグ, スマホ接続, ペア設定, 无线调试, 连接手机, 配对, depuración inalámbrica, vincular teléfono,
  débogage sans fil, associer le téléphone.
version: 0.4.4
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
- The PC and phone must be on the same Wi-Fi. A **Private** network profile on Windows lets mDNS (UDP 5353) reach adb; it is not required once the companion app is installed, whose port beacon works without mDNS.

## 2. Pair (once per phone)
Skip if `list_devices` already shows the phone online or discovered.
0. First give the user the illustrated guide in their language, since most people have never seen these menus:
   `https://github.com/SeokpilYoon/adb-autolink/blob/main/docs/guide/wireless-debugging.md` (English), or the same path ending in
   `.ko.md`, `.ja.md`, `.zh-Hans.md`, `.es.md`, `.fr.md`. It shows each screen with the item to tap highlighted.
1. Ask the user to open **Settings → Developer options → Wireless debugging** on the phone and turn it on. (Developer options: tap *Build number* 7 times in *About phone → Software information*.)
2. Ask for **three values in one message**, naming both ports explicitly because users confuse them:
   - **Connect address**: the *IP address & Port* at the top of the Wireless debugging screen (① in the guide).
   - Then tap **Pair device with pairing code**: the dialog's *IP address & Port* (pairing port) and the **6-digit code**. Keep the dialog open.
   - Example reply: `connect 192.168.0.10:41235 / pair 192.168.0.10:37099 123456`
3. Call `pair_device` with `address` (dialog), `code` and `connect_address` (top of the screen). A USB-connected phone can skip pairing.
4. If the result says paired but not connected, ask only for the connect address (top of the Wireless debugging screen) and call `connect_device` with it. Never retry with an old remembered port.

## 3. Install the companion app
Call `install_companion_app` (optionally with `device`). It downloads the latest release APK, installs it, grants `WRITE_SECURE_SETTINGS`, location and notification permissions, exempts the app from battery optimization and permission auto-removal, turns off the 7-day authorization timeout, opens the app, and (when connected wirelessly) allows the current Wi-Fi. Relay each numbered step of the result. If install is blocked, relay the hint (Samsung **Auto Blocker** off, Play Protect prompt on screen).

## 4. On the phone (usually nothing)
The install already did the settings, so don't walk the user through the app. Only act on what the result reports:
- Step 4 lists failed commands: ask the user to open the app; its *Setup needed* card shows a button for each missing item.
- Step 7 did not allow a Wi-Fi (USB install, or the Wi-Fi name was unreadable): on the home/office Wi-Fi, tap **Allow this Wi-Fi** in the app. Location services must be ON for the name to be readable.
- When Android asks *"Allow wireless debugging on this network?"* tick **Always allow on this network**. Mesh or dual-band routers may ask once per access point.
- More networks: tap **Allow this Wi-Fi** there, or the **Allow** action in the notification that appears when Wireless debugging is turned on by hand on a new network.

## 5. Verify, with a saved record
1. Call `save_checkpoint` with `stage: "first_connect"` (and `device` if there are several phones). It opens the ADB Autolink app, screenshots the current ip:port and saves it with a report row. Give the user the screenshot and report paths from the result.
2. Ask the user to toggle Wi-Fi off and on (or step out and back).
3. Call `save_checkpoint` with `stage: "reconnect"`. It reconnects without any input, records how (normally the port beacon) and how long it took, and adds the second screenshot to the same report. Give the user both paths, and point out that the port changed while the connection still came back.
   - If it fails saying Wireless debugging is OFF, the phone is waiting on *"Always allow on this network"*; ask the user to approve it and call `save_checkpoint` again.
4. Finish by calling `list_devices` and showing its **saved phones** table as is: alias, model, serial, last address, last connected, online now, plus the latest check report paths.
   - Each phone already has its model name as alias (`S24+`, `S21`; a second phone of the same model gets `S21-2`), which works as the `device` of every tool. Tell the user they can say e.g. "install it on S21".
   - Offer `set_device_alias` only if they want another name; `remove: true` deletes one.

Records live in `~/.adb-autolink/checks/<device>_<serial>/<date_time>/` (`1-first-connect.png`, `2-reconnect.png`, `report.md`); the five newest sessions per device are kept.
