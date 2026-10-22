# adb-autolink documentation

Each document covers one topic.

| Doc | Covers |
|---|---|
| [architecture.md](architecture.md) | The components, the reconnect flow, and where state lives |
| [troubleshooting.md](troubleshooting.md) | Symptoms and fixes: discovery, approval, lock screen, install, battery |
| [release.md](release.md) | Version sync, building, and publishing a release |
| [../SECURITY.md](../SECURITY.md) | The security model and how to report a vulnerability |
| [../CHANGELOG.md](../CHANGELOG.md) | Release history |

```mermaid
flowchart LR
    subgraph Phone
        W[Wi-Fi joins whitelisted SSID] --> S[WifiWatcherService]
        S -->|adb_wifi_enabled=1| D[adbd advertises _adb-tls-connect._tcp on a random port]
        S -->|value reset by Android| A[notify: approve this access point]
    end
    subgraph PC
        T[Claude calls a tool] --> E[ensureConnected]
        E -->|already online| R[run adb command]
        E -->|adb mdns services| M[match remembered device] --> C[adb connect ip:port] --> R
    end
    D -. mDNS .-> M
```
