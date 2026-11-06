# Security

## Reporting a vulnerability

Please report security issues **privately** via
[GitHub Security Advisories](https://github.com/SeokpilYoon/adb-autolink/security/advisories/new).
Do not open a public issue for an unfixed vulnerability.

## What this project can do to a phone

adb-autolink deliberately automates **wireless debugging**, which gives a paired computer full adb access to the phone. The safety model:

- The companion app turns wireless debugging on **only on Wi-Fi networks (SSIDs) you whitelist**, and listens for your PC only there. Android itself still requires per-access-point approval ("Always allow on this network") and key-based pairing, so an unpaired computer cannot connect.
- **Remote wake:** on a whitelisted Wi-Fi, a PC set up with `install_companion_app` can turn wireless debugging on over the network, even while auto-connect is off and the phone is locked. A paired PC with this key can therefore reach a phone you switched off, so treat that PC like the phone itself. The phone notifies you each time. **Advanced > Let my PC turn this on** disables it, and **Forget all PCs** removes every key. Forgetting a PC here does not remove its adb authorization: use *Revoke USB debugging authorizations* in Developer options for that.
- **Network protocol:** both ends prove they hold a key that reached the phone only through adb; it is never sent over the network. Strangers get no answer, nonces belong to one connection, and a PC believes nothing from a host that did not prove itself.
- **Impostors:** adb accepts whatever answers on an address and takes its word for the serial. So a phone whose app has proved itself must prove it again through every new wireless adb connection, or it is disconnected. A phone not yet set up with the app cannot be told from an impostor: do the first setup on a network you trust, or over USB.
- The app holds `WRITE_SECURE_SETTINGS` (granted once via adb) and uses it only for `adb_wifi_enabled`, `adb_enabled`, `development_settings_enabled` and the optional `adb_allowed_connection_time`.
- No exported component lets another app on the phone toggle wireless debugging. Turning auto-connect on from the Quick Settings tile requires an unlocked phone.
- The MCP server runs adb without a shell, and every value sent to the device shell is validated and quoted. `ip:port` selectors must be local or private VPN addresses unless `ADB_AUTOLINK_ALLOW_PUBLIC=1` is set.
- Screen text, logcat output and screenshots are passed to the model, and text on a screen can be written by anyone who can send you a message. Treat them as untrusted input (prompt injection). Text output is labelled as such, but do not auto-allow `install_companion_app`, `install_apk`, `pair_device` or `connect_device`.

**Never whitelist public Wi-Fi.** Optionally disabling the 7-day authorization timeout keeps paired computers authorized indefinitely, so enable it only on machines you control.

## Security review

**Latest review: v0.6.1, November 2026.** adb-autolink is a personal open-source project. **This was not a third-party audit**: the review was done with Claude, by the project's author and a separate review pass that was given the code without the author's conclusions. It does not prove the absence of bugs. It records what was checked, so you can decide for yourself.

**Threats considered:** a stranger on the same Wi-Fi who can sniff, spoof ARP and run fake services; a malicious app on the phone; a malicious app or user on the PC; a stolen PC or phone; text on the phone's screen trying to steer the model; a tampered download.

**What it found:** v0.6.0 had no way for a stranger to get a shell on a phone without a paired key, but it had real weaknesses, fixed in v0.6.1:

| Severity | Weakness in v0.6.0 | Fix in v0.6.1 |
|---|---|---|
| High | The PC trusted whatever answered on the network, so a stranger could pose as a remembered phone and receive what was typed or installed | Both ends prove a key, and a set-up phone must prove it again through every new wireless adb connection |
| Medium | A stranger could relay the PC's signature to turn a phone on | Mutual authentication, with nonces bound to one connection |
| Medium | While switched off, the app listened on any Wi-Fi, and a remote wake showed nothing on the phone | Listens only on allowed Wi-Fi, notifies on every wake, **Forget all PCs** added |
| Medium | Text on screen could steer the model into sending secrets to a public address | Public addresses refused, output from the phone labelled as data |
| Medium | The downloaded APK was not verified | SHA-256 pinned per version |
| Medium | Another app could take the listening port | Mutual authentication stops it posing as the app, and the app keeps retrying the port |
| Low | Keys in error text, a stall that blocked the listener, a token sent in the clear, screen dumps on shared storage, key transfer between devices, npm advisories | Each fixed |

**Tested on real phones** (Galaxy S24+ and Galaxy S21): a wrong key, the old token, a forged wake proof and a proof for another exchange all get no answer or are refused; a PC with the wrong key is disconnected instead of trusted; a public address is refused; **Let my PC turn this on** switched off refuses a correctly signed wake; a phone switched off comes back on request and shows a notification. The protocol also has unit tests against a simulated phone and an impostor.

**Not tested:** an end-to-end attack with a real fake adb server (the check was made with a PC holding the wrong key), the refusal on a Wi-Fi that is not allowed, and Android versions or brands beyond the two phones above.

**Accepted risks:**

- A paired PC that holds the key can turn on a phone you switched off, even a locked one. That is the feature. If a PC is lost, use both **Forget all PCs** and *Revoke USB debugging authorizations* on the phone.
- A phone cannot be told from an impostor before its first setup, so set up on a trusted network or over USB.
- One PC key is shared by all its phones, so a rooted phone could pose as another phone of the same PC.
- The key is briefly on the PC's command line during setup.

**Checked on every commit, in public:** [CI](https://github.com/SeokpilYoon/adb-autolink/actions/workflows/ci.yml) runs the tests, checks that the committed bundle starts, and runs `npm audit` for high or critical advisories.

## Release integrity

- Release APKs are signed with the project key. Certificate SHA-256:
  `97ffb9c8660b5754aecf6f04987686b83c9a3a3d29a0a91738e78c6ce6277803`
  Verify with: `apksigner verify --print-certs adb-autolink.apk`
- `install_companion_app` downloads the APK of its own version and refuses it unless its SHA-256 matches the hash pinned in the plugin. `ADB_AUTOLINK_APK_URL` and `apk_path` are deliberate overrides and skip that check.
- The plugin runs the committed bundle `mcp-server/dist/index.js`, which has no runtime dependencies. Rebuild it from source with `cd mcp-server && npm ci && npm run build`.

## Contributor rules

- Enable the hook once per clone: `git config core.hooksPath .githooks`. It blocks keystores, `keystore.properties`, `local.properties` and `.env` files, runs [gitleaks](https://github.com/gitleaks/gitleaks) with `.gitleaks.toml` when installed, and refuses `mcp-server/src` changes without a rebuilt `dist`.
- Check new dependencies with `npm audit` before adding them; runtime code must stay dependency-free after bundling.
