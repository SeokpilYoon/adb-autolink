<h1 align="center">adb-autolink</h1>

<p align="center"><b>为 Claude Code 打造的、无需手动操作的 Android 开发者无线 ADB。</b></p>

<p align="center">

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · **简体中文** · [Español](README.es.md) · [Français](README.fr.md)

</p>

<p align="center">
  <img src=".claude-plugin/icon.png" width="96" alt="adb-autolink icon" />
</p>

---

带着手机出门，回来后直接对 Claude 说：

> "把 Builds/game.apk 安装到我的 S21 上，启动它并截一张图。"

无需重新配对，也不用输入 IP 地址、端口或配对码。手机加入你信任的 Wi-Fi 网络时会自动重新开启无线调试，MCP 服务器通过 mDNS 找到它，并在需要时重新连接。

## 工作原理

```
 Phone (ADB Autolink app)                      PC (Claude Code + adb-autolink MCP)
 ─────────────────────────                     ───────────────────────────────────
 joins a whitelisted Wi-Fi                     Claude calls any tool (e.g. screenshot)
   → writes adb_wifi_enabled=1                   → adb mdns services  (_adb-tls-connect._tcp)
   → adbd advertises a new random port  ────▶    → adb connect ip:port  (already paired)
                                                 → runs the command
```

- 配对是永久的；离开网络后失效的只有两件事：**无线调试被关闭**和**端口发生变化**。本项目正是解决这两个问题。
- 配套应用使用 `WRITE_SECURE_SETTINGS`（通过 adb 授予一次）来开关无线调试，无需 root。

## 组件

| 路径 | 说明 |
|---|---|
| `android-app/` | **ADB Autolink** 配套应用（Kotlin、Compose，Android 11+）。在白名单 SSID 上自动开启无线调试，提供快速设置图块，重启后依然有效。 |
| `mcp-server/` | MCP 服务器（TypeScript，预构建的独立打包文件位于 `mcp-server/dist`，无需 `npm install`）+ `adb-autolink` CLI。 |
| `skills/setup/` | 首次设置向导技能（`/adb-autolink:setup`）。 |

## 环境要求

- Claude Code
- Node.js 20+
- Android SDK platform-tools（支持 mDNS 的 `adb` 34+）。依次通过 `ADB_PATH`、`ANDROID_HOME` / `ANDROID_SDK_ROOT`、Android Studio 默认 SDK 位置和 `PATH` 查找。
- 与电脑处于同一局域网的 Android 11+ 手机。已测试机型：Samsung Galaxy（One UI）。

## 安装

```text
/plugin marketplace add SeokpilYoon/adb-autolink
/plugin install adb-autolink@adb-autolink
```

重启 Claude Code，然后运行：

```text
/adb-autolink:setup
```

Claude 会引导你完成配对并安装配套应用（从最新的 GitHub release 下载）。安装时会通过 adb 设置所有权限和豁免，并在无线连接时允许当前 Wi-Fi，因此应用中无需任何设置。唯一剩下的是 Android 的*“始终允许在此网络上使用”*确认。

第一次使用无线调试？请参阅[图文设置指南](docs/guide/wireless-debugging.zh-Hans.md)，每个画面都标出了要点按的位置。

### 手动设置（备选）

1. 配对一次：**开发者选项 > 无线调试 > 使用配对码配对设备**，然后运行 `adb pair <ip:port> <code>`（也可以让 Claude 调用 `pair_device`）。
2. 从 [Releases](https://github.com/SeokpilYoon/adb-autolink/releases/latest) 安装 APK 并授予权限：
   ```bash
   adb install -r adb-autolink.apk
   adb shell pm grant dev.adbautolink.companion android.permission.WRITE_SECURE_SETTINGS
   ```
3. 在 **ADB Autolink** 应用中：
   - 位置信息 → **始终允许**，并开启位置服务（后台读取 Wi-Fi 名称所需）
   - 允许通知
   - 电池 → **无限制**（Samsung：同时将其从休眠应用中排除）
   - 点按**允许此 Wi-Fi**（只要允许了至少一个 Wi-Fi，自动模式就会开启）
   - 应用的*需要设置*卡片只列出仍缺少的项目。
4. 在每个网络上首次连接时，Android 会询问*"要在此网络上允许无线调试吗？"*：勾选**在此网络上始终允许**。信任以接入点（BSSID）为单位，因此 Mesh 或双频路由器可能会对每个 AP 各询问一次。需要此授权时，应用会通过通知提醒你。

## MCP 工具

所有设备工具都会先自动连接。可通过序列号、`ip:port`、别名或型号名（`S21`、`S24+`、`S24 Ultra`）选择设备。省略时，若只有一台在线设备，就使用它。

| 工具 | 说明 |
|---|---|
| `list_devices` | 已连接的设备，以及通过 mDNS 发现的手机 |
| `connect_device` / `disconnect_device` | 显式连接 / 断开（通常不需要） |
| `pair_device` | 使用 6 位配对码进行首次配对 |
| `install_companion_app` | 下载并安装 ADB Autolink 应用，并授予其权限 |
| `save_checkpoint` | 在首次连接和 Wi-Fi 关开测试后截取 ADB Autolink 应用画面并记录连接方式（`~/.adb-autolink/checks/`） |
| `install_apk` | 安装 APK（`-r -g`） |
| `launch_app` / `stop_app` | 启动（启动器或指定 Activity）/ 强制停止 |
| `screenshot` | 默认返回 1280px 的 JPEG 预览，`full_resolution` 返回原始 PNG，可选 `save_path` |
| `tap` / `swipe` / `input_text` / `key_event` | 输入（`input_text` 仅支持 ASCII，这是 Android `input` 的限制） |
| `wake_device` | 唤醒屏幕并解除非安全锁屏 |
| `logcat` | 按包名、标签或优先级过滤，限制行数，崩溃缓冲区 |
| `set_device_alias` | 为设备命名，例如 `test`、`main` |

CLI：`node mcp-server/dist/cli.js devices` · `node mcp-server/dist/cli.js connect S21`

## 语言

配套应用、CLI、设置引导和设置技能支持 **English、한국어、日本語、简体中文、Español 和 Français**。

- **应用：** 跟随手机的语言。在 Android 13+ 上还可以为每个应用单独选择语言。
- **CLI 与工具提示：** 跟随 `ADB_AUTOLINK_LANG`（`en`、`ko`、`ja`、`zh-Hans`、`es`、`fr`），未设置时使用操作系统的区域设置。
- **Claude：** 用你书写的语言回答。

## 文档

参见 [docs/](docs/README.md)：[架构](docs/architecture.md)、[故障排查](docs/troubleshooting.md)、[发布流程](docs/release.md)、[安全](SECURITY.md)、[更新日志](CHANGELOG.md)。

## 故障排查

| 现象 | 检查项 |
|---|---|
| 找不到手机 | 手机是否连接了白名单中的 Wi-Fi？应用通知是否显示 *ON*？是否与电脑在同一局域网？ |
| mDNS 发现结果为空 | Windows 网络配置文件必须为**专用**；在防火墙中放行 `adb.exe`（UDP 5353） |
| 截图显示锁屏界面 | adb 无法解锁 PIN 或图案；请使用 Smart Lock（可信地点）或手动解锁 |
| 截图是黑屏 | 该应用使用了 `FLAG_SECURE` |
| 安装被阻止 | 关闭 Samsung **自动拦截**；并在手机上响应 Play 保护提示 |
| SSID 显示为 `<unknown ssid>` | 位置信息选"始终允许"，开启位置服务，关闭对未使用应用权限的自动撤销 |
| 一周后电脑要求重新授权 | 在应用中启用*禁用 7 天授权超时*（`adb_allowed_connection_time=0`） |

## 安全说明

- 无线调试只会在你加入白名单的 SSID 上自动开启，Android 仍会强制执行按接入点的信任和基于密钥的配对。不要把公共 Wi-Fi 加入白名单。
- MCP 服务器只会自动连接之前连接过的手机，首次运行是唯一的例外。
- 快速设置图块可开关自动连接。关闭后后台运行和无线调试都会停止；开启时手机需要处于解锁状态。
- 开启无线调试也会同时开启开发者选项和 USB 调试；关闭无线调试不会还原这些设置。
- Logcat 输出和屏幕内容会传递给模型，因此请将来自不受信任应用的日志视为不受信任的输入。

## 从源码构建

```bash
# MCP server
cd mcp-server && npm install && npm run build && npm test

# Android app (JDK 17-21; Android Studio's bundled JBR works)
cd android-app && ./gradlew assembleDebug
# Release: signing is read from ~/.android/adb-autolink-keystore.properties
# (storeFile, storePassword, keyAlias, keyPassword); unsigned if absent.
./gradlew assembleRelease   # → android-app/build/dist/adb-autolink.apk
```

贡献者：每个克隆仓库中运行一次 `git config core.hooksPath .githooks` 来启用密钥防泄漏钩子（参见 [SECURITY.md](SECURITY.md)）。

## 许可证

[MIT](LICENSE)
