# Wireless debugging setup guide (Galaxy)

**English** · [한국어](wireless-debugging.ko.md) · [日本語](wireless-debugging.ja.md) · [简体中文](wireless-debugging.zh-Hans.md) · [Español](wireless-debugging.es.md) · [Français](wireless-debugging.fr.md)

For Claude on your PC to reach your phone over Wi-Fi, do the steps below on the phone **once**. After that the ADB Autolink app turns Wireless debugging on by itself and Claude connects on its own.

- Screens: Galaxy S21, One UI 7 (Android 15). Other models and versions may place menus slightly differently.
- Before you start, **connect the PC and the phone to the same Wi-Fi**.

## 1. Turn on Developer options

1. Open **Settings > About phone > Software information**.
2. Tap **Build number** 7 times in a row. Enter your lock screen PIN if asked. "Developer mode has been turned on" means it worked.

<p>
<img src="img/en/01-about.png" width="270" alt="About phone, Software information highlighted">
<img src="img/en/02-software.png" width="270" alt="Software information, Build number highlighted">
</p>

## 2. Turn on Wireless debugging

1. Open **Developer options**, now at the bottom of **Settings**.
2. Scroll to **Debugging** and turn on the **Wireless debugging** switch.
3. When asked "Allow wireless debugging on this network?", check **Always allow on this network** and tap **Allow**.

<p>
<img src="img/en/03-settings.png" width="270" alt="Bottom of Settings, Developer options highlighted">
<img src="img/en/04-devopts.png" width="270" alt="Developer options, Wireless debugging switch highlighted">
</p>

## 3. Pair with your PC (once per PC)

1. Tap the words **Wireless debugging** (not the switch) to open its screen.
2. Tap **Pair device with pairing code**.
3. Tell Claude the **Wi-Fi pairing code** (6 digits) and the **IP address & Port** shown in the dialog. For example: `pair 192.168.0.10:37099 123456`

<p>
<img src="img/en/05-wireless.png" width="270" alt="Wireless debugging, Pair device with pairing code highlighted">
<img src="img/en/06-pair.png" width="270" alt="Pair with device dialog, pairing code and IP address and port highlighted">
</p>

- **Keep the dialog open** until pairing finishes. The code and port change every time it opens.
- The dialog's port is **different** from the "IP address & Port" at the top of the Wireless debugging screen. Use the one in the dialog.

## 4. Done

Once paired, Claude installs the ADB Autolink app and finishes every setting. From then on Wireless debugging turns on whenever the phone joins an allowed Wi-Fi, and Claude connects when it needs to.

## Troubleshooting

| Problem | Fix |
|---|---|
| Tapping Build number does nothing | Developer options may already be on. Check for **Developer options** at the bottom of Settings. |
| Pairing fails | Make sure the dialog is still open, the code and port are the current ones from the dialog, and the PC and phone share the Wi-Fi. |
| The app install is blocked | Turn off **Settings > Security and privacy > Auto Blocker**, and check the screen for a Play Protect prompt. |
| The phone is not found (Windows) | Set the Wi-Fi network profile to **Private**. On Public, phone discovery (mDNS) is blocked. |
