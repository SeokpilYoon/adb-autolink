# Security

## Reporting a vulnerability

Please report security issues **privately** via
[GitHub Security Advisories](https://github.com/SeokpilYoon/adb-autolink/security/advisories/new).
Do not open a public issue for an unfixed vulnerability.

## What this project can do to a phone

adb-autolink deliberately automates **wireless debugging**, which gives a paired computer full adb access to the phone. The safety model:

- The companion app turns wireless debugging on **only on Wi-Fi networks (SSIDs) you whitelist**. Android itself still requires per-access-point approval ("Always allow on this network") and key-based pairing, so an unpaired computer cannot connect.
- The app holds `WRITE_SECURE_SETTINGS` (granted once via adb) and uses it only for `adb_wifi_enabled`, `adb_enabled`, `development_settings_enabled` and the optional `adb_allowed_connection_time`.
- No exported component lets another app on the phone toggle wireless debugging. The Quick Settings tile requires an unlocked phone.
- The MCP server auto-connects only to phones it has connected to before. It runs adb without a shell, and every value sent to the device shell is validated and quoted.
- Logcat output and screenshots are passed to the model. Treat output from apps you don't trust as untrusted input (prompt injection).

**Never whitelist public Wi-Fi.** Optionally disabling the 7-day authorization timeout keeps paired computers authorized indefinitely, so enable it only on machines you control.

## Release integrity

- Release APKs are signed with the project key. Certificate SHA-256:
  `97ffb9c8660b5754aecf6f04987686b83c9a3a3d29a0a91738e78c6ce6277803`
  Verify with: `apksigner verify --print-certs adb-autolink.apk`
- The plugin runs the committed bundle `mcp-server/dist/index.js`, which has no runtime dependencies. Rebuild it from source with `cd mcp-server && npm ci && npm run build`.

## Contributor rules

- Enable the hook once per clone: `git config core.hooksPath .githooks`. It blocks keystores, `keystore.properties`, `local.properties` and `.env` files, runs [gitleaks](https://github.com/gitleaks/gitleaks) with `.gitleaks.toml` when installed, and refuses `mcp-server/src` changes without a rebuilt `dist`.
- Check new dependencies with `npm audit` before adding them; runtime code must stay dependency-free after bundling.
