/**
 * Tiny message catalog for human-facing text (CLI output, hints, setup guidance).
 * Tool names, descriptions and schemas stay English: they are read by the model.
 *
 * Locale: ADB_AUTOLINK_LANG, else LC_ALL / LC_MESSAGES / LANG, else the OS locale (Intl); fallback en.
 * A tool call can override it for its own duration with withLang() (e.g. the `lang` tool parameter).
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { GUIDE_URL_BASE } from "./config.js";

export const LOCALES = ["en", "ko", "ja", "zh-Hans", "es", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

const en = {
  "cli.usage":
    "Usage:\n" +
    "  adb-autolink devices             List connected and mDNS-discovered devices\n" +
    "  adb-autolink connect [device]    Connect (serial, ip:port, alias or model like S21 / S24+)",
  "cli.unknownCommand": 'Unknown command "{0}"',
  connected: "Connected: {0}",
  "snapshot.online": "Online ({0}):",
  "snapshot.notReady": "Not ready ({0}):",
  "snapshot.discovered": "Discovered via mDNS, not connected ({0}):",
  "snapshot.none": "(none)",
  "connect.notConnected": 'Device "{0}" is not connected and could not be connected automatically.',
  "connect.noOnline": "No online device.",
  "connect.onlineDevices": "Online devices:",
  "connect.discovered": "Discovered via mDNS:",
  "connect.attempts": "Attempts:",
  "connect.unauthorized": "Unauthorized (accept the RSA prompt on the phone): {0}",
  "hint.troubleshoot":
    "No reachable device found over wireless adb. Check:\n" +
    "  1. The phone is on a Wi-Fi network whitelisted in the {0} app, on the same LAN as this PC.\n" +
    "  2. Auto-connect is ON in the {0} app (if it was switched off, tap its Quick Settings tile), so Wireless debugging is on.\n" +
    "  3. The phone was paired with this PC once (pair_device tool, or Developer options > Wireless debugging > Pair device with pairing code).\n" +
    "  4. The PC firewall allows adb inbound UDP 5353 (mDNS) on this network (Windows: allow adb.exe on the Private profile).\n" +
    "  5. `adb mdns check` reports an mdns daemon; try `adb kill-server` if discovery is stuck.",
  "install.failed": "Install failed on {0}:",
  "install.hint": "Hint: {0}",
  "hint.install.blocked":
    "The phone blocked or did not confirm the install. Check the phone screen for a Play Protect scan prompt, and on One UI turn off Auto Blocker (Settings > Security and privacy > Auto Blocker), which blocks adb/sideload installs.",
  "hint.install.incompatible":
    "An incompatible version is installed (different signature or newer versionCode). Uninstall the existing app first (adb uninstall <package>).",
  "hint.install.storage": "Not enough storage on the phone.",
  "warn.locked":
    "WARNING: the lock screen is still showing (a secure lock cannot be dismissed over adb). Unlock the phone, or set up Smart Lock / Extend Unlock (trusted place or trusted device) so it stays unlocked at home.",
  "pair.invalidAddress":
    'Invalid pairing address "{0}". Use the ip:port shown under "Pair device with pairing code", e.g. 192.168.0.23:37099.',
  "pair.invalidCode": 'Invalid pairing code "{0}". It must be the 6-digit Wi-Fi pairing code shown on the phone.',
  "pair.invalidConnectAddress": "Invalid connect address \"{0}\". Use the ip:port shown as \"IP address & Port\" at the top of the Wireless debugging screen, e.g. 192.168.0.23:41235.",
  "pair.connectIsPairing": "{0} is the pairing dialog's address, which only accepts pairing. The connect address is the \"IP address & Port\" at the top of the Wireless debugging screen (a different port).",
  "pair.failed":
    "Pairing with {0} failed:\n{1}\n\nCheck that the pairing dialog is still open on the phone, the code and port are current (they change every time the dialog opens), and the phone is on the same network as this PC.",
  "pair.notConnectedYet": "Paired, but not connected yet: {0}\nAsk the user for the \"IP address & Port\" at the top of the Wireless debugging screen (not the pairing dialog's) and call connect_device with it.",
  "beacon.adbOff": "Found {0} through the ADB Autolink app, but Wireless debugging is OFF on it. On the phone, check for a prompt \"Allow wireless debugging on this network?\" and choose \"Always allow on this network\", or turn Wireless debugging on from the app's Quick Settings tile.",
  "saved.title": "Saved phones ({0}) - the alias works as the \"device\" of every tool",
  "saved.header": "| Alias | Model | Serial | Last address | Last connected | Now |",
  "saved.online": "online",
  "saved.offline": "offline",
  "saved.none": "No phones saved yet. A phone is remembered after its first connection.",
  "saved.reports": "Latest connection check reports:",
  "checkpoint.reportTitle": "Connection checks: {0}",
  "checkpoint.reportHeader": "| # | Stage | Time | Address | Connected via | Took | App | Plugin | Screenshot |",
  "checkpoint.stage.first_connect": "First connection",
  "checkpoint.stage.reconnect": "Reconnect test",
  "checkpoint.via.online": "already connected",
  "checkpoint.via.last_known": "last known address",
  "checkpoint.via.beacon": "ADB Autolink app (port beacon)",
  "checkpoint.via.mdns": "mDNS discovery",
  "checkpoint.via.direct": "address given",
  "checkpoint.saved": "Saved the \"{0}\" checkpoint.\n  Screenshot: {1}\n  Report: {2}\n  Address: {3} (connected via {4} in {5} s)",
  "checkpoint.noApp": "The ADB Autolink app is not installed, so the current screen was captured instead of the app screen.",
  "hint.guide": "Step-by-step guide with screenshots (Developer options, Wireless debugging, pairing code): {0}",
  "companion.usingLocal": "1. Using local APK {0}",
  "companion.downloaded": "1. Downloaded {0} ({1} MB) -> {2}",
  "companion.cached": "1. Download failed ({0}); using the cached {1}",
  "companion.downloadFailed": "Could not download the companion APK from {0}: {1}\nDownload it manually and pass apk_path.",
  "companion.installed": "2. Installed on {0}",
  "companion.granted": "3. Granted WRITE_SECURE_SETTINGS (lets the app toggle Wireless debugging)",
  "companion.grantFailed":
    '3. FAILED to grant WRITE_SECURE_SETTINGS: {0}\n   (Xiaomi/MIUI: enable "USB debugging (Security settings)" in Developer options, then run this again.)',
  "companion.setupDone": "4. Granted location and notification permissions, and exempted the app from battery optimization and unused-app permission removal",
  "companion.setupPartial": "4. Some permissions could not be set ({0}). The app shows what is left to fix.",
  "companion.authTimeoutOff": "5. Turned off the 7-day adb authorization timeout so this PC stays authorized (undo in the app under Advanced)",
  "companion.authTimeoutFailed": "5. Could not turn off the adb authorization timeout: {0}",
  "companion.launched": "6. Launched the app",
  "companion.launchFailed": "6. Could not launch the app: {0}",
  "companion.wifiAdded": "7. Allowed the current Wi-Fi \"{0}\": Wireless debugging now turns on automatically there",
  "companion.wifiNoSsid": "7. Could not read the current Wi-Fi name (is Location on?). Tap \"Allow this Wi-Fi\" in the app.",
  "companion.wifiUsb": "7. Connected over USB, so no Wi-Fi was allowed yet. On your home/office Wi-Fi, tap \"Allow this Wi-Fi\" in the app.",
  "companion.wifiFailed": "7. Could not finish the Wi-Fi setup: {0}\n   Tap \"Allow this Wi-Fi\" in the app.",
  "companion.nextSteps": "The only step left on the phone: the first time Wireless debugging turns on for a network, the phone asks to allow it. Check \"Always allow on this network\".\nTrust is per router (BSSID), so mesh nodes or separate 2.4/5 GHz networks each need one approval. Other Wi-Fi networks can be allowed in the app, or from the notification it shows when you turn Wireless debugging on there.",
};

export type MessageKey = keyof typeof en;
type Catalog = Record<MessageKey, string>;

const ko: Catalog = {
  "cli.usage":
    "사용법:\n" +
    "  adb-autolink devices             연결된 기기와 mDNS로 발견된 기기 목록\n" +
    "  adb-autolink connect [기기]      연결 (시리얼, ip:port, 별칭 또는 S21 / S24+ 같은 모델명)",
  "cli.unknownCommand": '알 수 없는 명령 "{0}"',
  connected: "연결됨: {0}",
  "snapshot.online": "온라인 ({0}):",
  "snapshot.notReady": "준비 안 됨 ({0}):",
  "snapshot.discovered": "mDNS로 발견됨, 미연결 ({0}):",
  "snapshot.none": "(없음)",
  "connect.notConnected": '기기 "{0}"이(가) 연결되어 있지 않고 자동으로 연결하지 못했습니다.',
  "connect.noOnline": "온라인 기기가 없습니다.",
  "connect.onlineDevices": "온라인 기기:",
  "connect.discovered": "mDNS로 발견된 기기:",
  "connect.attempts": "시도 내역:",
  "connect.unauthorized": "미승인 (휴대폰에 뜬 RSA 허용 창을 수락하세요): {0}",
  "hint.troubleshoot":
    "무선 adb로 연결할 수 있는 기기를 찾지 못했습니다. 다음을 확인하세요:\n" +
    "  1. 휴대폰이 {0} 앱에 등록한 Wi-Fi에 연결되어 있고, 이 PC와 같은 네트워크에 있는지.\n" +
    "  2. {0} 앱의 자동 연결이 켜져 있어 무선 디버깅이 켜져 있는지 (꺼 두었다면 빠른 설정 타일을 눌러 켜세요).\n" +
    "  3. 이 PC와 한 번 페어링했는지 (pair_device 도구, 또는 개발자 옵션 > 무선 디버깅 > 페어링 코드로 기기 페어링).\n" +
    "  4. PC 방화벽이 이 네트워크에서 adb의 UDP 5353(mDNS) 수신을 허용하는지 (Windows: 개인 프로필에서 adb.exe 허용).\n" +
    "  5. `adb mdns check`에서 mdns 데몬이 보이는지. 검색이 멈춘 것 같으면 `adb kill-server`를 실행해 보세요.",
  "install.failed": "{0}에 설치하지 못했습니다:",
  "install.hint": "도움말: {0}",
  "hint.install.blocked":
    "휴대폰이 설치를 차단했거나 확인되지 않았습니다. 휴대폰 화면에 Play 프로텍트 검사 창이 떠 있는지 확인하고, 삼성 기기라면 adb/외부 설치를 막는 자동 차단을 끄세요 (설정 > 보안 및 개인정보 보호 > 자동 차단).",
  "hint.install.incompatible":
    "호환되지 않는 버전이 이미 설치되어 있습니다 (서명이 다르거나 versionCode가 더 높음). 먼저 기존 앱을 삭제하세요 (adb uninstall <패키지>).",
  "hint.install.storage": "휴대폰 저장 공간이 부족합니다.",
  "warn.locked":
    "경고: 잠금 화면이 아직 표시되어 있습니다 (보안 잠금은 adb로 해제할 수 없습니다). 휴대폰 잠금을 풀거나, 집에서는 잠금이 풀린 상태로 유지되도록 Smart Lock / 잠금 해제 상태 유지(신뢰할 수 있는 장소·기기)를 설정하세요.",
  "pair.invalidAddress":
    '잘못된 페어링 주소 "{0}". "페어링 코드로 기기 페어링" 아래에 표시된 ip:port를 입력하세요. 예: 192.168.0.23:37099',
  "pair.invalidCode": '잘못된 페어링 코드 "{0}". 휴대폰에 표시된 6자리 Wi-Fi 페어링 코드여야 합니다.',
  "pair.invalidConnectAddress": "잘못된 연결 주소 \"{0}\". 무선 디버깅 화면 맨 위 \"IP 주소 및 포트\"에 표시된 ip:포트를 사용하세요. 예: 192.168.0.23:41235",
  "pair.connectIsPairing": "{0}은(는) 페어링 창의 주소라서 페어링에만 쓰입니다. 연결 주소는 무선 디버깅 화면 맨 위 \"IP 주소 및 포트\"이며 포트가 다릅니다.",
  "pair.failed":
    "{0}와(과) 페어링하지 못했습니다:\n{1}\n\n휴대폰의 페어링 창이 아직 열려 있는지, 코드와 포트가 최신인지(창을 열 때마다 바뀝니다), 휴대폰이 이 PC와 같은 네트워크에 있는지 확인하세요.",
  "pair.notConnectedYet": "페어링은 되었지만 아직 연결되지 않았습니다: {0}\n무선 디버깅 화면 맨 위 \"IP 주소 및 포트\"(페어링 창의 값이 아님)를 알려 주시면 그 주소로 연결합니다.",
  "beacon.adbOff": "ADB Autolink 앱으로 {0}을(를) 찾았지만 무선 디버깅이 꺼져 있습니다. 폰에 \"이 네트워크에서 무선 디버깅을 허용하시겠습니까?\" 창이 떠 있으면 \"이 네트워크에서 항상 허용\"을 선택하거나, 빠른 설정 타일로 무선 디버깅을 켜 주세요.",
  "saved.title": "저장된 폰 ({0}) - 별칭으로 모든 도구의 기기를 지정할 수 있습니다",
  "saved.header": "| 별칭 | 기종 | 시리얼 | 마지막 주소 | 마지막 연결 | 지금 |",
  "saved.online": "온라인",
  "saved.offline": "오프라인",
  "saved.none": "아직 저장된 폰이 없습니다. 처음 연결하면 기억됩니다.",
  "saved.reports": "최근 연결 확인 보고서:",
  "checkpoint.reportTitle": "연결 확인 기록: {0}",
  "checkpoint.reportHeader": "| # | 단계 | 시각 | 주소 | 연결 방법 | 걸린 시간 | 앱 | 플러그인 | 스크린샷 |",
  "checkpoint.stage.first_connect": "최초 연결",
  "checkpoint.stage.reconnect": "재연결 테스트",
  "checkpoint.via.online": "이미 연결됨",
  "checkpoint.via.last_known": "마지막으로 쓴 주소",
  "checkpoint.via.beacon": "ADB Autolink 앱 (포트 비컨)",
  "checkpoint.via.mdns": "mDNS 검색",
  "checkpoint.via.direct": "지정한 주소",
  "checkpoint.saved": "\"{0}\" 확인 기록을 저장했습니다.\n  스크린샷: {1}\n  보고서: {2}\n  주소: {3} ({4}, {5}초)",
  "checkpoint.noApp": "ADB Autolink 앱이 설치되어 있지 않아 앱 화면 대신 현재 화면을 캡처했습니다.",
  "hint.guide": "스크린샷으로 보는 단계별 가이드 (개발자 옵션, 무선 디버깅, 페어링 코드): {0}",
  "companion.usingLocal": "1. 로컬 APK 사용: {0}",
  "companion.downloaded": "1. 다운로드 완료: {0} ({1} MB) -> {2}",
  "companion.cached": "1. 다운로드 실패({0}), 캐시된 파일 사용: {1}",
  "companion.downloadFailed": "{0}에서 컴패니언 APK를 다운로드하지 못했습니다: {1}\n직접 다운로드한 뒤 apk_path로 지정하세요.",
  "companion.installed": "2. {0}에 설치 완료",
  "companion.granted": "3. WRITE_SECURE_SETTINGS 권한 부여 완료 (앱이 무선 디버깅을 켜고 끌 수 있게 됩니다)",
  "companion.grantFailed":
    "3. WRITE_SECURE_SETTINGS 권한 부여 실패: {0}\n   (샤오미/MIUI: 개발자 옵션에서 \"USB 디버깅(보안 설정)\"을 켠 다음 다시 실행하세요.)",
  "companion.setupDone": "4. 위치·알림 권한을 부여하고, 배터리 최적화와 미사용 앱 권한 삭제에서 제외했습니다",
  "companion.setupPartial": "4. 일부 권한을 설정하지 못했습니다 ({0}). 남은 항목은 앱 화면에 표시됩니다.",
  "companion.authTimeoutOff": "5. 이 PC의 승인이 유지되도록 7일 adb 승인 만료를 껐습니다 (앱의 고급 메뉴에서 되돌릴 수 있음)",
  "companion.authTimeoutFailed": "5. adb 승인 만료를 끄지 못했습니다: {0}",
  "companion.launched": "6. 앱 실행 완료",
  "companion.launchFailed": "6. 앱을 실행하지 못했습니다: {0}",
  "companion.wifiAdded": "7. 현재 Wi-Fi \"{0}\"를 허용했습니다: 이제 이 Wi-Fi에서 무선 디버깅이 자동으로 켜집니다",
  "companion.wifiNoSsid": "7. 현재 Wi-Fi 이름을 읽지 못했습니다 (위치가 켜져 있나요?). 앱에서 \"이 Wi-Fi 허용\"을 누르세요.",
  "companion.wifiUsb": "7. USB로 연결되어 있어 아직 허용한 Wi-Fi가 없습니다. 집/사무실 Wi-Fi에 연결한 뒤 앱에서 \"이 Wi-Fi 허용\"을 누르세요.",
  "companion.wifiFailed": "7. Wi-Fi 설정을 마치지 못했습니다: {0}\n   앱에서 \"이 Wi-Fi 허용\"을 누르세요.",
  "companion.nextSteps": "휴대폰에서 남은 일은 하나뿐입니다: 네트워크에서 처음 무선 디버깅이 켜질 때 허용 여부를 묻습니다. \"이 네트워크에서 항상 허용\"을 체크하세요.\n승인은 공유기(BSSID)마다 따로라서, 메시 노드나 2.4/5GHz로 나뉜 네트워크는 각각 한 번씩 승인이 필요합니다. 다른 Wi-Fi는 앱에서 허용하거나, 그곳에서 무선 디버깅을 켰을 때 뜨는 알림에서 허용할 수 있습니다.",
};

const ja: Catalog = {
  "cli.usage":
    "使い方:\n" +
    "  adb-autolink devices             接続中のデバイスと mDNS で見つかったデバイスを一覧表示\n" +
    "  adb-autolink connect [デバイス]  接続(シリアル、ip:port、エイリアス、または S21 / S24+ などのモデル名)",
  "cli.unknownCommand": "不明なコマンド「{0}」",
  connected: "接続しました: {0}",
  "snapshot.online": "オンライン ({0}):",
  "snapshot.notReady": "準備中 ({0}):",
  "snapshot.discovered": "mDNS で検出、未接続 ({0}):",
  "snapshot.none": "(なし)",
  "connect.notConnected": "デバイス「{0}」は接続されておらず、自動接続にも失敗しました。",
  "connect.noOnline": "オンラインのデバイスがありません。",
  "connect.onlineDevices": "オンラインのデバイス:",
  "connect.discovered": "mDNS で検出:",
  "connect.attempts": "試行内容:",
  "connect.unauthorized": "未承認(スマートフォンに表示された RSA の許可ダイアログを承認してください): {0}",
  "hint.troubleshoot":
    "ワイヤレス adb で接続できるデバイスが見つかりません。次を確認してください:\n" +
    "  1. スマートフォンが {0} アプリに登録した Wi-Fi に接続され、この PC と同じネットワークにあること。\n" +
    "  2. {0} アプリの自動接続がオンで、ワイヤレス デバッグがオンになっていること(オフにした場合はクイック設定タイルをタップしてオンにしてください)。\n" +
    "  3. この PC と一度ペア設定済みであること(pair_device ツール、または 開発者向けオプション > ワイヤレス デバッグ > ペア設定コードによるデバイスのペア設定)。\n" +
    "  4. PC のファイアウォールがこのネットワークで adb の UDP 5353(mDNS)受信を許可していること(Windows: プライベート プロファイルで adb.exe を許可)。\n" +
    "  5. `adb mdns check` で mdns デーモンが表示されること。検出が止まっている場合は `adb kill-server` を試してください。",
  "install.failed": "{0} へのインストールに失敗しました:",
  "install.hint": "ヒント: {0}",
  "hint.install.blocked":
    "スマートフォンがインストールをブロックしたか、確認されませんでした。画面に Play プロテクトのスキャン確認が出ていないか確認してください。Galaxy の場合は adb/サイドロードのインストールを妨げる自動ブロッカーをオフにしてください(設定 > セキュリティとプライバシー > 自動ブロッカー)。",
  "hint.install.incompatible":
    "互換性のないバージョンがインストールされています(署名が異なるか versionCode が新しい)。先に既存のアプリをアンインストールしてください(adb uninstall <パッケージ>)。",
  "hint.install.storage": "スマートフォンの空き容量が不足しています。",
  "warn.locked":
    "警告: ロック画面が表示されたままです(セキュアなロックは adb では解除できません)。スマートフォンのロックを解除するか、自宅ではロック解除のままになるよう Smart Lock / ロック解除の延長(信頼できる場所・デバイス)を設定してください。",
  "pair.invalidAddress":
    "ペア設定アドレス「{0}」が正しくありません。「ペア設定コードによるデバイスのペア設定」に表示される ip:port を指定してください(例: 192.168.0.23:37099)。",
  "pair.invalidCode": "ペア設定コード「{0}」が正しくありません。スマートフォンに表示される 6 桁の Wi-Fi ペア設定コードを指定してください。",
  "pair.invalidConnectAddress": "接続アドレス「{0}」が正しくありません。ワイヤレス デバッグ画面上部の「IP アドレスとポート」に表示される ip:ポートを指定してください。例: 192.168.0.23:41235",
  "pair.connectIsPairing": "{0} はペア設定ダイアログのアドレスで、ペア設定専用です。接続アドレスはワイヤレス デバッグ画面上部の「IP アドレスとポート」で、ポートが異なります。",
  "pair.failed":
    "{0} とのペア設定に失敗しました:\n{1}\n\nスマートフォンのペア設定ダイアログが開いたままか、コードとポートが最新か(ダイアログを開くたびに変わります)、スマートフォンがこの PC と同じネットワークにあるかを確認してください。",
  "pair.notConnectedYet": "ペア設定は完了しましたが、まだ接続されていません: {0}\nワイヤレス デバッグ画面上部の「IP アドレスとポート」(ペア設定ダイアログの値ではありません)を教えてください。そのアドレスに接続します。",
  "beacon.adbOff": "ADB Autolink アプリ経由で {0} が見つかりましたが、ワイヤレス デバッグがオフです。スマートフォンに「このネットワークでワイヤレス デバッグを許可しますか?」が表示されていたら「このネットワークで常に許可」を選ぶか、クイック設定タイルからワイヤレス デバッグをオンにしてください。",
  "saved.title": "保存済みのスマートフォン ({0}) - 別名はすべてのツールの「device」に使えます",
  "saved.header": "| 別名 | 機種 | シリアル | 前回のアドレス | 前回の接続 | 現在 |",
  "saved.online": "オンライン",
  "saved.offline": "オフライン",
  "saved.none": "まだ保存されたスマートフォンはありません。初回接続後に記憶されます。",
  "saved.reports": "最新の接続確認レポート:",
  "checkpoint.reportTitle": "接続確認の記録: {0}",
  "checkpoint.reportHeader": "| # | 段階 | 時刻 | アドレス | 接続方法 | 所要時間 | アプリ | プラグイン | スクリーンショット |",
  "checkpoint.stage.first_connect": "初回接続",
  "checkpoint.stage.reconnect": "再接続テスト",
  "checkpoint.via.online": "接続済み",
  "checkpoint.via.last_known": "前回のアドレス",
  "checkpoint.via.beacon": "ADB Autolink アプリ (ポート ビーコン)",
  "checkpoint.via.mdns": "mDNS 検出",
  "checkpoint.via.direct": "指定したアドレス",
  "checkpoint.saved": "「{0}」の確認記録を保存しました。\n  スクリーンショット: {1}\n  レポート: {2}\n  アドレス: {3} ({4}、{5} 秒)",
  "checkpoint.noApp": "ADB Autolink アプリがインストールされていないため、アプリ画面の代わりに現在の画面をキャプチャしました。",
  "hint.guide": "スクリーンショット付きの手順ガイド(開発者向けオプション、ワイヤレス デバッグ、ペア設定コード): {0}",
  "companion.usingLocal": "1. ローカルの APK を使用: {0}",
  "companion.downloaded": "1. ダウンロード完了: {0} ({1} MB) -> {2}",
  "companion.cached": "1. ダウンロード失敗({0})のため、キャッシュを使用: {1}",
  "companion.downloadFailed":
    "{0} からコンパニオン APK をダウンロードできませんでした: {1}\n手動でダウンロードして apk_path に指定してください。",
  "companion.installed": "2. {0} にインストールしました",
  "companion.granted": "3. WRITE_SECURE_SETTINGS を付与しました(アプリがワイヤレス デバッグを切り替えられるようになります)",
  "companion.grantFailed":
    "3. WRITE_SECURE_SETTINGS の付与に失敗しました: {0}\n   (Xiaomi/MIUI: 開発者向けオプションで「USB デバッグ(セキュリティ設定)」をオンにしてから再実行してください。)",
  "companion.setupDone": "4. 位置情報と通知の権限を付与し、バッテリーの最適化と未使用アプリの権限削除の対象外にしました",
  "companion.setupPartial": "4. 一部の権限を設定できませんでした({0})。残りの項目はアプリに表示されます。",
  "companion.authTimeoutOff": "5. この PC の承認が維持されるよう、7 日間の adb 承認タイムアウトをオフにしました(アプリの詳細設定で戻せます)",
  "companion.authTimeoutFailed": "5. adb 承認タイムアウトをオフにできませんでした: {0}",
  "companion.launched": "6. アプリを起動しました",
  "companion.launchFailed": "6. アプリを起動できませんでした: {0}",
  "companion.wifiAdded": "7. 現在の Wi-Fi「{0}」を許可しました: この Wi-Fi ではワイヤレス デバッグが自動でオンになります",
  "companion.wifiNoSsid": "7. 現在の Wi-Fi 名を読み取れませんでした(位置情報はオンですか?)。アプリで「この Wi-Fi を許可」をタップしてください。",
  "companion.wifiUsb": "7. USB 接続のため、まだ Wi-Fi は許可されていません。自宅やオフィスの Wi-Fi に接続して、アプリで「この Wi-Fi を許可」をタップしてください。",
  "companion.wifiFailed": "7. Wi-Fi の設定を完了できませんでした: {0}\n   アプリで「この Wi-Fi を許可」をタップしてください。",
  "companion.nextSteps": "スマートフォンで残っている作業は 1 つだけです: ネットワークで初めてワイヤレス デバッグがオンになるとき、許可を求められます。「このネットワークで常に許可」にチェックを入れてください。\n信頼はルーター(BSSID)ごとなので、メッシュ ノードや 2.4/5 GHz で分かれたネットワークはそれぞれ 1 回の承認が必要です。ほかの Wi-Fi はアプリで許可するか、そこでワイヤレス デバッグをオンにしたときに表示される通知から許可できます。",
};

const zhHans: Catalog = {
  "cli.usage":
    "用法:\n" +
    "  adb-autolink devices             列出已连接及通过 mDNS 发现的设备\n" +
    "  adb-autolink connect [设备]      连接(序列号、ip:port、别名或 S21 / S24+ 等型号)",
  "cli.unknownCommand": "未知命令“{0}”",
  connected: "已连接:{0}",
  "snapshot.online": "在线 ({0}):",
  "snapshot.notReady": "未就绪 ({0}):",
  "snapshot.discovered": "通过 mDNS 发现,未连接 ({0}):",
  "snapshot.none": "(无)",
  "connect.notConnected": "设备“{0}”未连接,且无法自动连接。",
  "connect.noOnline": "没有在线设备。",
  "connect.onlineDevices": "在线设备:",
  "connect.discovered": "通过 mDNS 发现:",
  "connect.attempts": "尝试记录:",
  "connect.unauthorized": "未授权(请在手机上接受 RSA 授权提示):{0}",
  "hint.troubleshoot":
    "未找到可通过无线 adb 连接的设备。请检查:\n" +
    "  1. 手机已连接到在 {0} 应用中加入白名单的 Wi-Fi,并与这台电脑处于同一局域网。\n" +
    "  2. {0} 应用的自动连接已开启,因此无线调试已开启(如果关闭过,请点按其快捷设置图块重新开启)。\n" +
    "  3. 手机已与这台电脑配对过一次(pair_device 工具,或 开发者选项 > 无线调试 > 使用配对码配对设备)。\n" +
    "  4. 电脑防火墙允许 adb 在此网络上接收 UDP 5353(mDNS)入站流量(Windows:在专用网络配置文件中允许 adb.exe)。\n" +
    "  5. `adb mdns check` 能看到 mdns 守护进程;如果发现过程卡住,请尝试 `adb kill-server`。",
  "install.failed": "在 {0} 上安装失败:",
  "install.hint": "提示:{0}",
  "hint.install.blocked":
    "手机拦截了安装或未确认安装。请查看手机屏幕上是否有 Play 保护机制的扫描提示;三星 One UI 用户请关闭会阻止 adb/侧载安装的“自动拦截器”(设置 > 安全和隐私 > 自动拦截器)。",
  "hint.install.incompatible":
    "已安装不兼容的版本(签名不同或 versionCode 更高)。请先卸载现有应用(adb uninstall <包名>)。",
  "hint.install.storage": "手机存储空间不足。",
  "warn.locked":
    "警告:锁屏仍在显示(安全锁屏无法通过 adb 解除)。请解锁手机,或设置 Smart Lock / 延长解锁时间(可信地点或可信设备),让手机在家时保持解锁。",
  "pair.invalidAddress": "配对地址“{0}”无效。请使用“使用配对码配对设备”下显示的 ip:port,例如 192.168.0.23:37099。",
  "pair.invalidCode": "配对码“{0}”无效。必须是手机上显示的 6 位 WLAN 配对码。",
  "pair.invalidConnectAddress": "连接地址“{0}”无效。请使用无线调试页面顶部“IP 地址和端口”中显示的 ip:端口,例如 192.168.0.23:41235。",
  "pair.connectIsPairing": "{0} 是配对对话框的地址,只能用于配对。连接地址是无线调试页面顶部的“IP 地址和端口”,端口不同。",
  "pair.failed":
    "与 {0} 配对失败:\n{1}\n\n请确认手机上的配对对话框仍处于打开状态、配对码和端口是最新的(每次打开对话框都会变化),并且手机与这台电脑在同一网络中。",
  "pair.notConnectedYet": "已配对,但尚未连接:{0}\n请提供无线调试页面顶部的“IP 地址和端口”(不是配对对话框中的值),将用它进行连接。",
  "beacon.adbOff": "已通过 ADB Autolink 应用找到 {0},但其无线调试已关闭。请查看手机上是否有“要在此网络上允许无线调试吗?”提示并选择“始终允许在此网络上使用”,或通过快捷设置图块开启无线调试。",
  "saved.title": "已保存的手机({0})- 别名可用作所有工具的“device”",
  "saved.header": "| 别名 | 机型 | 序列号 | 上次地址 | 上次连接 | 当前 |",
  "saved.online": "在线",
  "saved.offline": "离线",
  "saved.none": "尚未保存任何手机。首次连接后会记住。",
  "saved.reports": "最新的连接检查报告:",
  "checkpoint.reportTitle": "连接检查记录:{0}",
  "checkpoint.reportHeader": "| # | 阶段 | 时间 | 地址 | 连接方式 | 耗时 | 应用 | 插件 | 截图 |",
  "checkpoint.stage.first_connect": "首次连接",
  "checkpoint.stage.reconnect": "重连测试",
  "checkpoint.via.online": "已连接",
  "checkpoint.via.last_known": "上次的地址",
  "checkpoint.via.beacon": "ADB Autolink 应用(端口信标)",
  "checkpoint.via.mdns": "mDNS 发现",
  "checkpoint.via.direct": "指定的地址",
  "checkpoint.saved": "已保存“{0}”检查记录。\n  截图:{1}\n  报告:{2}\n  地址:{3}({4},{5} 秒)",
  "checkpoint.noApp": "未安装 ADB Autolink 应用,因此截取的是当前画面而不是应用画面。",
  "hint.guide": "带截图的分步指南(开发者选项、无线调试、配对码):{0}",
  "companion.usingLocal": "1. 使用本地 APK:{0}",
  "companion.downloaded": "1. 已下载 {0}({1} MB)-> {2}",
  "companion.cached": "1. 下载失败({0}),改用缓存的 {1}",
  "companion.downloadFailed": "无法从 {0} 下载配套应用 APK:{1}\n请手动下载,并通过 apk_path 指定。",
  "companion.installed": "2. 已安装到 {0}",
  "companion.granted": "3. 已授予 WRITE_SECURE_SETTINGS(使应用可以开关无线调试)",
  "companion.grantFailed":
    "3. 授予 WRITE_SECURE_SETTINGS 失败:{0}\n   (小米/MIUI:请在开发者选项中开启“USB 调试(安全设置)”,然后重新运行。)",
  "companion.setupDone": "4. 已授予位置和通知权限,并将应用排除在电池优化和未使用应用权限移除之外",
  "companion.setupPartial": "4. 部分权限未能设置({0})。剩余项目会显示在应用中。",
  "companion.authTimeoutOff": "5. 已关闭 7 天的 adb 授权超时,使此 PC 保持授权(可在应用的“高级”中恢复)",
  "companion.authTimeoutFailed": "5. 无法关闭 adb 授权超时:{0}",
  "companion.launched": "6. 已启动应用",
  "companion.launchFailed": "6. 无法启动应用:{0}",
  "companion.wifiAdded": "7. 已允许当前 Wi-Fi“{0}”:在此 Wi-Fi 上会自动开启无线调试",
  "companion.wifiNoSsid": "7. 无法读取当前 Wi-Fi 名称(位置信息是否已开启?)。请在应用中点按“允许此 Wi-Fi”。",
  "companion.wifiUsb": "7. 通过 USB 连接,因此尚未允许任何 Wi-Fi。连接到家里或办公室的 Wi-Fi 后,在应用中点按“允许此 Wi-Fi”。",
  "companion.wifiFailed": "7. 未能完成 Wi-Fi 设置:{0}\n   请在应用中点按“允许此 Wi-Fi”。",
  "companion.nextSteps": "手机上只剩一步:某个网络第一次开启无线调试时,手机会询问是否允许。请勾选“始终允许在此网络上使用”。\n信任按路由器(BSSID)区分,因此 Mesh 节点或分开的 2.4/5 GHz 网络各需批准一次。其他 Wi-Fi 可在应用中允许,或在那里开启无线调试时通过弹出的通知允许。",
};

const es: Catalog = {
  "cli.usage":
    "Uso:\n" +
    "  adb-autolink devices               Lista los dispositivos conectados y los descubiertos por mDNS\n" +
    "  adb-autolink connect [dispositivo] Conecta (serie, ip:puerto, alias o modelo como S21 / S24+)",
  "cli.unknownCommand": 'Comando desconocido "{0}"',
  connected: "Conectado: {0}",
  "snapshot.online": "En línea ({0}):",
  "snapshot.notReady": "No listos ({0}):",
  "snapshot.discovered": "Descubiertos por mDNS, sin conectar ({0}):",
  "snapshot.none": "(ninguno)",
  "connect.notConnected": 'El dispositivo "{0}" no está conectado y no se pudo conectar automáticamente.',
  "connect.noOnline": "No hay ningún dispositivo en línea.",
  "connect.onlineDevices": "Dispositivos en línea:",
  "connect.discovered": "Descubiertos por mDNS:",
  "connect.attempts": "Intentos:",
  "connect.unauthorized": "Sin autorizar (acepta el aviso RSA en el teléfono): {0}",
  "hint.troubleshoot":
    "No se encontró ningún dispositivo accesible por adb inalámbrico. Comprueba:\n" +
    "  1. Que el teléfono esté en una red Wi-Fi añadida a la lista de la app {0}, en la misma red local que este PC.\n" +
    "  2. Que la conexión automática esté activada en la app {0} y, con ella, la Depuración inalámbrica (si la desactivaste, toca su mosaico de Ajustes rápidos).\n" +
    "  3. Que el teléfono se haya vinculado una vez con este PC (herramienta pair_device, u Opciones para desarrolladores > Depuración inalámbrica > Vincular dispositivo con código de vinculación).\n" +
    "  4. Que el firewall del PC permita a adb recibir UDP 5353 (mDNS) en esta red (Windows: permite adb.exe en el perfil Privado).\n" +
    "  5. Que `adb mdns check` muestre un daemon mdns; si la detección se atasca, prueba `adb kill-server`.",
  "install.failed": "Error al instalar en {0}:",
  "install.hint": "Sugerencia: {0}",
  "hint.install.blocked":
    "El teléfono bloqueó la instalación o no la confirmó. Mira si en la pantalla hay un aviso de análisis de Play Protect y, en One UI, desactiva el Bloqueador automático (Ajustes > Seguridad y privacidad > Bloqueador automático), que impide instalar por adb o desde fuera de la tienda.",
  "hint.install.incompatible":
    "Hay instalada una versión incompatible (otra firma o un versionCode más reciente). Desinstala primero la app existente (adb uninstall <paquete>).",
  "hint.install.storage": "No hay suficiente almacenamiento en el teléfono.",
  "warn.locked":
    "AVISO: la pantalla de bloqueo sigue visible (un bloqueo seguro no se puede quitar por adb). Desbloquea el teléfono o configura Smart Lock / Extend Unlock (lugar o dispositivo de confianza) para que siga desbloqueado en casa.",
  "pair.invalidAddress":
    'Dirección de vinculación no válida "{0}". Usa la ip:puerto que aparece en "Vincular dispositivo con código de vinculación", p. ej. 192.168.0.23:37099.',
  "pair.invalidCode": 'Código de vinculación no válido "{0}". Debe ser el código de vinculación Wi-Fi de 6 dígitos que aparece en el teléfono.',
  "pair.invalidConnectAddress": "Dirección de conexión no válida \"{0}\". Usa la ip:puerto que aparece en \"Dirección IP y puerto\" en la parte superior de la pantalla de Depuración inalámbrica, p. ej. 192.168.0.23:41235.",
  "pair.connectIsPairing": "{0} es la dirección del cuadro de vinculación, que solo sirve para vincular. La dirección de conexión es la \"Dirección IP y puerto\" de la parte superior de la pantalla de Depuración inalámbrica (otro puerto).",
  "pair.failed":
    "No se pudo vincular con {0}:\n{1}\n\nComprueba que el cuadro de vinculación siga abierto en el teléfono, que el código y el puerto sean los actuales (cambian cada vez que se abre) y que el teléfono esté en la misma red que este PC.",
  "pair.notConnectedYet": "Vinculado, pero aún sin conectar: {0}\nIndica la \"Dirección IP y puerto\" de la parte superior de la pantalla de Depuración inalámbrica (no la del cuadro de vinculación) y se conectará a ella.",
  "beacon.adbOff": "Se encontró {0} a través de la app ADB Autolink, pero tiene la Depuración inalámbrica desactivada. En el teléfono, busca el aviso \"¿Permitir la depuración inalámbrica en esta red?\" y elige \"Permitir siempre en esta red\", o actívala desde el mosaico de Ajustes rápidos.",
  "saved.title": "Teléfonos guardados ({0}): el alias sirve como \"device\" en todas las herramientas",
  "saved.header": "| Alias | Modelo | Serie | Última dirección | Última conexión | Ahora |",
  "saved.online": "en línea",
  "saved.offline": "sin conexión",
  "saved.none": "Aún no hay teléfonos guardados. Se recuerdan tras su primera conexión.",
  "saved.reports": "Últimos informes de comprobación de conexión:",
  "checkpoint.reportTitle": "Comprobaciones de conexión: {0}",
  "checkpoint.reportHeader": "| # | Etapa | Hora | Dirección | Conectado mediante | Tiempo | App | Plugin | Captura |",
  "checkpoint.stage.first_connect": "Primera conexión",
  "checkpoint.stage.reconnect": "Prueba de reconexión",
  "checkpoint.via.online": "ya conectado",
  "checkpoint.via.last_known": "última dirección conocida",
  "checkpoint.via.beacon": "app ADB Autolink (baliza de puerto)",
  "checkpoint.via.mdns": "descubrimiento mDNS",
  "checkpoint.via.direct": "dirección indicada",
  "checkpoint.saved": "Se guardó la comprobación \"{0}\".\n  Captura: {1}\n  Informe: {2}\n  Dirección: {3} ({4}, {5} s)",
  "checkpoint.noApp": "La app ADB Autolink no está instalada, así que se capturó la pantalla actual en lugar de la de la app.",
  "hint.guide": "Guía paso a paso con capturas (Opciones para desarrolladores, Depuración inalámbrica, código de vinculación): {0}",
  "companion.usingLocal": "1. Usando el APK local {0}",
  "companion.downloaded": "1. Descargado {0} ({1} MB) -> {2}",
  "companion.cached": "1. Falló la descarga ({0}); se usa la copia en caché {1}",
  "companion.downloadFailed": "No se pudo descargar el APK complementario desde {0}: {1}\nDescárgalo manualmente y pásalo con apk_path.",
  "companion.installed": "2. Instalado en {0}",
  "companion.granted": "3. Concedido WRITE_SECURE_SETTINGS (permite a la app activar y desactivar la Depuración inalámbrica)",
  "companion.grantFailed":
    '3. No se pudo conceder WRITE_SECURE_SETTINGS: {0}\n   (Xiaomi/MIUI: activa "Depuración USB (ajustes de seguridad)" en Opciones para desarrolladores y vuelve a ejecutarlo.)',
  "companion.setupDone": "4. Concedidos los permisos de ubicación y notificaciones, y la app quedó excluida de la optimización de batería y de la eliminación de permisos de apps sin usar",
  "companion.setupPartial": "4. No se pudieron configurar algunos permisos ({0}). La app muestra lo que falta.",
  "companion.authTimeoutOff": "5. Desactivado el vencimiento de 7 días de la autorización adb para que este PC siga autorizado (se puede revertir en la app, en Avanzado)",
  "companion.authTimeoutFailed": "5. No se pudo desactivar el vencimiento de la autorización adb: {0}",
  "companion.launched": "6. App abierta",
  "companion.launchFailed": "6. No se pudo abrir la app: {0}",
  "companion.wifiAdded": "7. Permitida la Wi-Fi actual \"{0}\": la Depuración inalámbrica se activará automáticamente en ella",
  "companion.wifiNoSsid": "7. No se pudo leer el nombre de la Wi-Fi actual (¿está activada la ubicación?). Toca \"Permitir esta Wi-Fi\" en la app.",
  "companion.wifiUsb": "7. Conectado por USB, así que aún no hay ninguna Wi-Fi permitida. En la Wi-Fi de casa u oficina, toca \"Permitir esta Wi-Fi\" en la app.",
  "companion.wifiFailed": "7. No se pudo terminar la configuración de Wi-Fi: {0}\n   Toca \"Permitir esta Wi-Fi\" en la app.",
  "companion.nextSteps": "Solo queda un paso en el teléfono: la primera vez que la Depuración inalámbrica se activa en una red, el teléfono pide permiso. Marca \"Permitir siempre en esta red\".\nLa confianza es por router (BSSID), así que los nodos mesh o las redes separadas de 2,4/5 GHz necesitan una aprobación cada uno. Puedes permitir otras Wi-Fi en la app, o desde la notificación que aparece al activar allí la Depuración inalámbrica.",
};

const fr: Catalog = {
  "cli.usage":
    "Utilisation :\n" +
    "  adb-autolink devices             Liste les appareils connectés et ceux découverts via mDNS\n" +
    "  adb-autolink connect [appareil]  Se connecter (numéro de série, ip:port, alias ou modèle comme S21 / S24+)",
  "cli.unknownCommand": "Commande inconnue « {0} »",
  connected: "Connecté : {0}",
  "snapshot.online": "En ligne ({0}) :",
  "snapshot.notReady": "Pas prêts ({0}) :",
  "snapshot.discovered": "Découverts via mDNS, non connectés ({0}) :",
  "snapshot.none": "(aucun)",
  "connect.notConnected": "L'appareil « {0} » n'est pas connecté et la connexion automatique a échoué.",
  "connect.noOnline": "Aucun appareil en ligne.",
  "connect.onlineDevices": "Appareils en ligne :",
  "connect.discovered": "Découverts via mDNS :",
  "connect.attempts": "Tentatives :",
  "connect.unauthorized": "Non autorisé (acceptez la demande RSA sur le téléphone) : {0}",
  "hint.troubleshoot":
    "Aucun appareil joignable en adb sans fil. Vérifiez que :\n" +
    "  1. Le téléphone est connecté à un réseau Wi-Fi ajouté à la liste de l'application {0}, sur le même réseau local que ce PC.\n" +
    "  2. La connexion automatique est activée dans l'application {0}, et avec elle le débogage sans fil (si vous l'avez désactivée, touchez sa vignette des réglages rapides).\n" +
    "  3. Le téléphone a été associé une fois à ce PC (outil pair_device, ou Options pour les développeurs > Débogage sans fil > Associer l'appareil avec un code d'association).\n" +
    "  4. Le pare-feu du PC autorise adb à recevoir l'UDP 5353 (mDNS) sur ce réseau (Windows : autorisez adb.exe pour le profil Privé).\n" +
    "  5. `adb mdns check` signale un démon mdns ; si la découverte est bloquée, essayez `adb kill-server`.",
  "install.failed": "Échec de l'installation sur {0} :",
  "install.hint": "Conseil : {0}",
  "hint.install.blocked":
    "Le téléphone a bloqué l'installation ou ne l'a pas confirmée. Regardez si l'écran affiche une analyse Play Protect et, sous One UI, désactivez le Blocage automatique (Paramètres > Sécurité et confidentialité > Blocage automatique), qui bloque les installations via adb ou hors Play Store.",
  "hint.install.incompatible":
    "Une version incompatible est installée (signature différente ou versionCode plus récent). Désinstallez d'abord l'application existante (adb uninstall <package>).",
  "hint.install.storage": "Espace de stockage insuffisant sur le téléphone.",
  "warn.locked":
    "ATTENTION : l'écran de verrouillage est toujours affiché (un verrouillage sécurisé ne peut pas être levé via adb). Déverrouillez le téléphone, ou configurez Smart Lock / Extend Unlock (lieu ou appareil de confiance) pour qu'il reste déverrouillé à la maison.",
  "pair.invalidAddress":
    "Adresse d'association « {0} » non valide. Utilisez l'ip:port affiché sous « Associer l'appareil avec un code d'association », par ex. 192.168.0.23:37099.",
  "pair.invalidCode": "Code d'association « {0} » non valide. Il doit s'agir du code d'association Wi-Fi à 6 chiffres affiché sur le téléphone.",
  "pair.invalidConnectAddress": "Adresse de connexion « {0} » non valide. Utilisez l'ip:port affiché dans « Adresse IP et port » en haut de l'écran Débogage sans fil, par ex. 192.168.0.23:41235.",
  "pair.connectIsPairing": "{0} est l'adresse de la boîte d'association, qui ne sert qu'à l'association. L'adresse de connexion est « Adresse IP et port » en haut de l'écran Débogage sans fil (un autre port).",
  "pair.failed":
    "Échec de l'association avec {0} :\n{1}\n\nVérifiez que la fenêtre d'association est toujours ouverte sur le téléphone, que le code et le port sont à jour (ils changent à chaque ouverture) et que le téléphone est sur le même réseau que ce PC.",
  "pair.notConnectedYet": "Associé, mais pas encore connecté : {0}\nIndiquez l'« Adresse IP et port » en haut de l'écran Débogage sans fil (pas celle de la boîte d'association) pour s'y connecter.",
  "beacon.adbOff": "{0} a été trouvé via l'application ADB Autolink, mais son débogage sans fil est désactivé. Sur le téléphone, cherchez l'invite « Autoriser le débogage sans fil sur ce réseau ? » et choisissez « Toujours autoriser sur ce réseau », ou activez-le depuis la vignette des réglages rapides.",
  "saved.title": "Téléphones enregistrés ({0}) : l'alias sert de « device » pour tous les outils",
  "saved.header": "| Alias | Modèle | Série | Dernière adresse | Dernière connexion | Maintenant |",
  "saved.online": "en ligne",
  "saved.offline": "hors ligne",
  "saved.none": "Aucun téléphone enregistré. Un téléphone est mémorisé après sa première connexion.",
  "saved.reports": "Derniers rapports de vérification de connexion :",
  "checkpoint.reportTitle": "Vérifications de connexion : {0}",
  "checkpoint.reportHeader": "| # | Étape | Heure | Adresse | Connecté via | Durée | Application | Plugin | Capture |",
  "checkpoint.stage.first_connect": "Première connexion",
  "checkpoint.stage.reconnect": "Test de reconnexion",
  "checkpoint.via.online": "déjà connecté",
  "checkpoint.via.last_known": "dernière adresse connue",
  "checkpoint.via.beacon": "application ADB Autolink (balise de port)",
  "checkpoint.via.mdns": "découverte mDNS",
  "checkpoint.via.direct": "adresse indiquée",
  "checkpoint.saved": "Vérification « {0} » enregistrée.\n  Capture : {1}\n  Rapport : {2}\n  Adresse : {3} ({4}, {5} s)",
  "checkpoint.noApp": "L'application ADB Autolink n'est pas installée : l'écran actuel a été capturé à la place de celui de l'application.",
  "hint.guide": "Guide pas à pas avec captures (Options pour les développeurs, Débogage sans fil, code d'association) : {0}",
  "companion.usingLocal": "1. Utilisation de l'APK local {0}",
  "companion.downloaded": "1. Téléchargé {0} ({1} Mo) -> {2}",
  "companion.cached": "1. Échec du téléchargement ({0}) ; utilisation de la copie en cache {1}",
  "companion.downloadFailed":
    "Impossible de télécharger l'APK de l'application compagnon depuis {0} : {1}\nTéléchargez-le manuellement et indiquez-le avec apk_path.",
  "companion.installed": "2. Installé sur {0}",
  "companion.granted": "3. WRITE_SECURE_SETTINGS accordé (permet à l'application d'activer ou désactiver le débogage sans fil)",
  "companion.grantFailed":
    "3. ÉCHEC de l'octroi de WRITE_SECURE_SETTINGS : {0}\n   (Xiaomi/MIUI : activez « Débogage USB (paramètres de sécurité) » dans les Options pour les développeurs, puis relancez.)",
  "companion.setupDone": "4. Autorisations de localisation et de notification accordées, et application exclue de l'optimisation de la batterie et de la suppression des autorisations des applications inutilisées",
  "companion.setupPartial": "4. Certaines autorisations n'ont pas pu être définies ({0}). L'application indique ce qu'il reste à corriger.",
  "companion.authTimeoutOff": "5. Expiration de 7 jours de l'autorisation adb désactivée pour que ce PC reste autorisé (réversible dans l'application, section Avancé)",
  "companion.authTimeoutFailed": "5. Impossible de désactiver l'expiration de l'autorisation adb : {0}",
  "companion.launched": "6. Application lancée",
  "companion.launchFailed": "6. Impossible de lancer l'application : {0}",
  "companion.wifiAdded": "7. Wi-Fi actuel « {0} » autorisé : le débogage sans fil s'y activera automatiquement",
  "companion.wifiNoSsid": "7. Impossible de lire le nom du Wi-Fi actuel (la localisation est-elle activée ?). Touchez « Autoriser ce Wi-Fi » dans l'application.",
  "companion.wifiUsb": "7. Connecté en USB : aucun Wi-Fi n'est encore autorisé. Sur le Wi-Fi de la maison ou du bureau, touchez « Autoriser ce Wi-Fi » dans l'application.",
  "companion.wifiFailed": "7. Impossible de terminer la configuration Wi-Fi : {0}\n   Touchez « Autoriser ce Wi-Fi » dans l'application.",
  "companion.nextSteps": "Il ne reste qu'une étape sur le téléphone : la première fois que le débogage sans fil s'active sur un réseau, le téléphone demande l'autorisation. Cochez « Toujours autoriser sur ce réseau ».\nLa confiance est accordée par routeur (BSSID) : les nœuds mesh ou les réseaux 2,4/5 GHz séparés nécessitent chacun une approbation. D'autres Wi-Fi peuvent être autorisés dans l'application, ou depuis la notification affichée quand vous y activez le débogage sans fil.",
};

export const CATALOGS: Record<Locale, Catalog> = { en, ko, ja, "zh-Hans": zhHans, es, fr };

/** Map a BCP 47 / POSIX locale ("ko-KR", "ja_JP.UTF-8", "zh-Hant-TW", "fr") to a supported locale. */
export function normalizeLocale(tag: string | undefined): Locale | undefined {
  if (!tag) return undefined;
  const t = tag.trim().split(/[.@]/)[0]!.replace(/_/g, "-").toLowerCase();
  if (!t || t === "c" || t === "posix") return undefined;
  const lang = t.split("-")[0];
  switch (lang) {
    case "en":
    case "ko":
    case "ja":
    case "es":
    case "fr":
      return lang;
    case "zh":
      return "zh-Hans"; // only Simplified is shipped; closer than English for Traditional readers
    default:
      return "en";
  }
}

/** ADB_AUTOLINK_LANG, then LC_ALL / LC_MESSAGES / LANG, then the OS locale; fallback en. */
export function detectLocale(env: NodeJS.ProcessEnv = process.env, osLocale?: () => string): Locale {
  for (const v of [env.ADB_AUTOLINK_LANG, env.LC_ALL, env.LC_MESSAGES, env.LANG]) {
    const l = normalizeLocale(v);
    if (l) return l;
  }
  try {
    return normalizeLocale((osLocale ?? (() => Intl.DateTimeFormat().resolvedOptions().locale))()) ?? "en";
  } catch {
    return "en";
  }
}

const override = new AsyncLocalStorage<Locale>();

/** Run fn with a per-call locale (e.g. a tool's `lang` parameter); unknown/undefined keeps the detected one. */
export function withLang<T>(lang: string | undefined, fn: () => T): T {
  const l = normalizeLocale(lang);
  return l ? override.run(l, fn) : fn();
}

export function currentLocale(): Locale {
  return override.getStore() ?? detectLocale();
}

export function format(template: string, args: readonly (string | number)[]): string {
  return template.replace(/\{(\d+)\}/g, (m, i: string) => (Number(i) < args.length ? String(args[Number(i)]) : m));
}

/** Translate `key` into the current locale, substituting {0}, {1}, ... */
export function t(key: MessageKey, ...args: (string | number)[]): string {
  return format(CATALOGS[currentLocale()][key] ?? en[key], args);
}

/** The illustrated setup guide in the given (default: current) locale. */
export function guideUrl(locale: Locale = currentLocale()): string {
  return `${GUIDE_URL_BASE}${locale === "en" ? "" : `.${locale}`}.md`;
}
