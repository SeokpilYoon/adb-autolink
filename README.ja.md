<h1 align="center">adb-autolink</h1>

<p align="center"><b>Claude Code のための、操作いらずの Android 開発者向けワイヤレス ADB。</b></p>

<p align="center">

[English](README.md) · [한국어](README.ko.md) · **日本語** · [简体中文](README.zh-Hans.md) · [Español](README.es.md) · [Français](README.fr.md)

</p>

<p align="center">
  <img src=".claude-plugin/icon.png" width="96" alt="adb-autolink icon" />
</p>

---

スマートフォンを持って出かけ、戻ってきたら、そのまま Claude に頼むだけです。

> 「Builds/game.apk を S21 にインストールして、起動してスクリーンショットを撮って。」

再ペアリングも、IP アドレス、ポート、ペアリングコードの入力も不要です。信頼する Wi-Fi ネットワークに接続すると、スマートフォンが自動でワイヤレス デバッグを再び有効にし、MCP サーバーが mDNS で見つけて必要なときに再接続します。

## 仕組み

```
 Phone (ADB Autolink app)                      PC (Claude Code + adb-autolink MCP)
 ─────────────────────────                     ───────────────────────────────────
 joins a whitelisted Wi-Fi                     Claude calls any tool (e.g. screenshot)
   → writes adb_wifi_enabled=1                   → adb mdns services  (_adb-tls-connect._tcp)
   → adbd advertises a new random port  ────▶    → adb connect ip:port  (already paired)
                                                 → runs the command
```

- ペアリングは永続します。ネットワークを離れたあとに壊れるのは、**ワイヤレス デバッグがオフになること**と**ポートが変わること**だけで、このプロジェクトはまさにこの 2 点を解決します。
- コンパニオンアプリは `WRITE_SECURE_SETTINGS`(adb で一度だけ付与)を使ってワイヤレス デバッグを切り替えます。root は不要です。

## コンポーネント

| パス | 内容 |
|---|---|
| `android-app/` | **ADB Autolink** コンパニオンアプリ(Kotlin、Compose、Android 11+)。許可リストの SSID でワイヤレス デバッグを自動で有効化し、クイック設定タイルを備え、再起動後も動作します。 |
| `mcp-server/` | MCP サーバー(TypeScript、`mcp-server/dist` にビルド済みの自己完結バンドルを同梱、`npm install` 不要)と `adb-autolink` CLI。 |
| `skills/setup/` | 初回セットアップを案内するスキル(`/adb-autolink:setup`)。 |

## 必要環境

- Claude Code
- Node.js 20+
- Android SDK platform-tools(mDNS 対応の `adb` 34+)。`ADB_PATH`、`ANDROID_HOME` / `ANDROID_SDK_ROOT`、Android Studio 既定の SDK 場所、`PATH` の順に探します。
- PC と同じ LAN 上の Android 11+ スマートフォン。
- **実機で確認済み:** Windows + Samsung Galaxy(S21 は One UI 7、S24+ は One UI 8)。**対応しているが実機では未確認:** Linux、macOS、ほかの Android メーカー(Pixel、Xiaomi など)。CI は Windows、Linux、macOS でサーバーのビルドとテストを実行します。WSL2 ではミラー ネットワーク モードを有効にしないと、同じ Wi-Fi のスマートフォンに届きません。

## インストール

```text
/plugin marketplace add SeokpilYoon/adb-autolink
/plugin install adb-autolink@adb-autolink
```

Claude Code を再起動してから、次を実行します。

```text
/adb-autolink:setup
```

Claude がペアリングを案内し、コンパニオンアプリをインストールします(最新の GitHub リリースからダウンロード)。インストール時に必要な権限と除外設定を adb ですべて行い、ワイヤレス接続中なら現在の Wi-Fi も許可するため、アプリで設定することはありません。残るのは Android の*「このネットワークで常に許可」*の確認 1 回だけです。

ワイヤレス デバッグが初めてなら、[画像付きの設定ガイド](docs/guide/wireless-debugging.ja.md)を参照してください。各画面でタップする場所が強調されています。

### 手動セットアップ(別の方法)

1. 一度だけペアリングします。**開発者向けオプション > ワイヤレス デバッグ > ペア設定コードによるデバイスのペア設定**を開き、`adb pair <ip:port> <code>` を実行します(または Claude に `pair_device` の呼び出しを依頼)。
2. [Releases](https://github.com/SeokpilYoon/adb-autolink/releases/latest) から APK をインストールし、権限を付与します。
   ```bash
   adb install -r adb-autolink.apk
   adb shell pm grant dev.adbautolink.companion android.permission.WRITE_SECURE_SETTINGS
   ```
3. **ADB Autolink** アプリで次を設定します。
   - 位置情報 → **常に許可**、位置情報サービスをオン(バックグラウンドで Wi-Fi 名を読み取るために必要)
   - 通知を許可
   - バッテリー → **制限なし**(Samsung: スリープ中のアプリからも除外)
   - **この Wi-Fi を許可**をタップ(許可した Wi-Fi が 1 つでもあれば自動モードがオンになります)
   - アプリの*設定が必要です*カードには、まだ足りない項目だけが表示されます。
4. 各ネットワークで初回のみ、Android が*「このネットワークでワイヤレス デバッグを許可しますか?」*と尋ねます。**このネットワークで常に許可**にチェックを入れてください。信頼はアクセスポイント(BSSID)単位なので、メッシュやデュアルバンドのルーターでは AP ごとに一度尋ねられることがあります。この承認が必要なときは、アプリが通知でお知らせします。

## MCP ツール

すべてのデバイス系ツールは、最初に自動接続します。デバイスはシリアル、`ip:port`、エイリアス、モデル名(`S21`、`S24+`、`S24 Ultra`)で指定します。省略すると、オンラインのデバイスが 1 台だけの場合はそれが使われます。

| ツール | 説明 |
|---|---|
| `list_devices` | 接続中のデバイス、mDNS で見つかったスマートフォン、保存済みの全スマートフォンの表 (別名、機種、前回のアドレス、現在オンラインか) |
| `connect_device` / `disconnect_device` | 明示的な接続 / 切断(通常は不要) |
| `pair_device` | 6 桁のコードによる初回ペアリング |
| `install_companion_app` | ADB Autolink アプリをダウンロードしてインストールし、権限を付与 |
| `save_checkpoint` | 初回接続時と Wi-Fi オフ/オンのテスト後に ADB Autolink アプリ画面をキャプチャし、接続方法を記録 (`~/.adb-autolink/checks/`) |
| `install_apk` | APK をインストール(`-r -g`) |
| `launch_app` / `stop_app` | 起動(ランチャーまたは特定の Activity)/ 強制停止 |
| `screenshot` | 既定は 1280px の JPEG プレビュー。元の PNG は `full_resolution`、`save_path` も指定可 |
| `tap` / `swipe` / `input_text` / `key_event` | 入力(`input_text` は ASCII のみ。Android の `input` の制限) |
| `wake_device` | 画面を点灯し、セキュアでないキーガードを解除 |
| `logcat` | パッケージ、タグ、優先度でフィルタ、行数の制限、クラッシュバッファ |
| `set_device_alias` | 別名の追加と削除。各スマートフォンには機種名が自動で付く (`S21`、同じ機種の 2 台目は `S21-2`) |

CLI: `node mcp-server/dist/cli.js devices` · `node mcp-server/dist/cli.js connect S21`

## 言語

コンパニオンアプリ、CLI、セットアップ案内、セットアップスキルは **English、한국어、日本語、简体中文、Español、Français** に対応しています。

- **アプリ:** スマートフォンの言語に従います。Android 13+ ではアプリごとに言語を選ぶこともできます。
- **CLI とツールの案内:** `ADB_AUTOLINK_LANG`(`en`、`ko`、`ja`、`zh-Hans`、`es`、`fr`)に従い、未設定の場合は OS のロケールに従います。
- **Claude:** あなたが書いた言語で答えます。

## ドキュメント

[docs/](docs/README.md) を参照してください: [アーキテクチャ](docs/architecture.md)、[トラブルシューティング](docs/troubleshooting.md)、[リリース手順](docs/release.md)、[セキュリティ](SECURITY.md)、[変更履歴](CHANGELOG.md)。

## トラブルシューティング

| 症状 | 確認すること |
|---|---|
| スマートフォンが見つからない | 許可リストの Wi-Fi に接続していますか? アプリの通知は *ON* になっていますか? PC と同じ LAN ですか? |
| mDNS の検出結果が空 | Windows のネットワーク プロファイルは**プライベート**にし、ファイアウォールで `adb.exe`(UDP 5353)を許可してください |
| スクリーンショットがロック画面になる | adb では PIN やパターンを解除できません。Smart Lock(信頼できる場所)を使うか、手動でロック解除してください |
| スクリーンショットが真っ黒 | そのアプリが `FLAG_SECURE` を使っています |
| インストールがブロックされる | Samsung の**自動ブロッカー**をオフにし、スマートフォンに表示される Play プロテクトの確認に応答してください |
| SSID が `<unknown ssid>` と表示される | 位置情報は「常に許可」、位置情報サービスをオン、未使用アプリの権限の自動取り消しをオフ |
| 1 週間後に PC で再承認を求められる | アプリで *7 日間の承認タイムアウトを無効にする* を有効にしてください(`adb_allowed_connection_time=0`) |

## セキュリティに関する注意

- ワイヤレス デバッグは、許可リストに登録した SSID でのみ自動で有効になります。Android はこれに加えて、アクセスポイントごとの信頼と鍵ベースのペアリングを引き続き強制します。公共の Wi-Fi は登録しないでください。
- MCP サーバーは、過去に接続したことのあるスマートフォンにしか自動接続しません。例外は初回の実行だけです。
- クイック設定タイルで自動接続のオン/オフを切り替えられます。オフにするとバックグラウンドの動作とワイヤレス デバッグがすべて止まり、オンにするにはスマートフォンのロック解除が必要です。
- ワイヤレス デバッグを有効にすると、開発者向けオプションと USB デバッグも有効になります。オフにしても、これらは元に戻りません。
- Logcat の出力と画面の内容はモデルに渡されます。信頼できないアプリのログは、信頼できない入力として扱ってください。

## ソースからビルド

```bash
# MCP server
cd mcp-server && npm install && npm run build && npm test

# Android app (JDK 17-21; Android Studio's bundled JBR works)
cd android-app && ./gradlew assembleDebug
# Release: signing is read from ~/.android/adb-autolink-keystore.properties
# (storeFile, storePassword, keyAlias, keyPassword); unsigned if absent.
./gradlew assembleRelease   # → android-app/build/dist/adb-autolink.apk
```

コントリビューターの方へ: クローンごとに一度、`git config core.hooksPath .githooks` でシークレットガードのフックを有効にしてください([SECURITY.md](SECURITY.md) を参照)。

## ライセンス

[MIT](LICENSE)
