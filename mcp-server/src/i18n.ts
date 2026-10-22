/**
 * Tiny message catalog for human-facing text (CLI output, hints, setup guidance).
 * Tool names, descriptions and schemas stay English: they are read by the model.
 *
 * Locale: ADB_AUTOLINK_LANG, else LC_ALL / LC_MESSAGES / LANG, else the OS locale (Intl); fallback en.
 * A tool call can override it for its own duration with withLang() (e.g. the `lang` tool parameter).
 */
import { AsyncLocalStorage } from "node:async_hooks";

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
    "  2. Wireless debugging is ON (the app turns it on automatically; check its notification / Quick Settings tile).\n" +
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
  "pair.failed":
    "Pairing with {0} failed:\n{1}\n\nCheck that the pairing dialog is still open on the phone, the code and port are current (they change every time the dialog opens), and the phone is on the same network as this PC.",
  "pair.notConnectedYet": "Paired, but not connected yet: {0}\nTry connect_device in a few seconds.",
  "companion.usingLocal": "1. Using local APK {0}",
  "companion.downloaded": "1. Downloaded {0} ({1} MB) -> {2}",
  "companion.cached": "1. Download failed ({0}); using the cached {1}",
  "companion.downloadFailed": "Could not download the companion APK from {0}: {1}\nDownload it manually and pass apk_path.",
  "companion.installed": "2. Installed on {0}",
  "companion.granted": "3. Granted WRITE_SECURE_SETTINGS (lets the app toggle Wireless debugging)",
  "companion.grantFailed":
    '3. FAILED to grant WRITE_SECURE_SETTINGS: {0}\n   (Xiaomi/MIUI: enable "USB debugging (Security settings)" in Developer options, then run this again.)',
  "companion.launched": "4. Launched the app",
  "companion.launchFailed": "4. Could not launch the app: {0}",
  "companion.nextSteps":
    "Next steps on the phone, in the {0} app:\n" +
    '  a. Location permission: choose "Allow all the time" and keep Location on (needed to read the Wi-Fi name in the background).\n' +
    "  b. Allow notifications.\n" +
    '  c. Battery: set the app to "Unrestricted" so the system does not kill it (Samsung: also keep it out of "Sleeping apps").\n' +
    '  d. While on your home/office Wi-Fi, tap "Add current Wi-Fi" to whitelist it, then turn auto mode on.\n' +
    '  e. The first time Wireless debugging turns on for a network, the phone asks to allow it: check "Always allow on this network".\n' +
    "     Trust is per router (BSSID), so mesh nodes or separate 2.4/5 GHz networks each need one approval.",
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
    "  2. 무선 디버깅이 켜져 있는지 (앱이 자동으로 켭니다. 알림이나 빠른 설정 타일을 확인하세요).\n" +
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
  "pair.failed":
    "{0}와(과) 페어링하지 못했습니다:\n{1}\n\n휴대폰의 페어링 창이 아직 열려 있는지, 코드와 포트가 최신인지(창을 열 때마다 바뀝니다), 휴대폰이 이 PC와 같은 네트워크에 있는지 확인하세요.",
  "pair.notConnectedYet": "페어링은 되었지만 아직 연결되지 않았습니다: {0}\n몇 초 뒤 connect_device를 다시 시도하세요.",
  "companion.usingLocal": "1. 로컬 APK 사용: {0}",
  "companion.downloaded": "1. 다운로드 완료: {0} ({1} MB) -> {2}",
  "companion.cached": "1. 다운로드 실패({0}), 캐시된 파일 사용: {1}",
  "companion.downloadFailed": "{0}에서 컴패니언 APK를 다운로드하지 못했습니다: {1}\n직접 다운로드한 뒤 apk_path로 지정하세요.",
  "companion.installed": "2. {0}에 설치 완료",
  "companion.granted": "3. WRITE_SECURE_SETTINGS 권한 부여 완료 (앱이 무선 디버깅을 켜고 끌 수 있게 됩니다)",
  "companion.grantFailed":
    "3. WRITE_SECURE_SETTINGS 권한 부여 실패: {0}\n   (샤오미/MIUI: 개발자 옵션에서 \"USB 디버깅(보안 설정)\"을 켠 다음 다시 실행하세요.)",
  "companion.launched": "4. 앱 실행 완료",
  "companion.launchFailed": "4. 앱을 실행하지 못했습니다: {0}",
  "companion.nextSteps":
    "이제 휴대폰의 {0} 앱에서 할 일:\n" +
    '  a. 위치 권한: "항상 허용"을 선택하고 위치를 켜 두세요 (백그라운드에서 Wi-Fi 이름을 읽는 데 필요합니다).\n' +
    "  b. 알림을 허용하세요.\n" +
    '  c. 배터리: 시스템이 앱을 종료하지 않도록 "제한 없음"으로 설정하세요 (삼성: "절전 상태 앱"에서도 제외).\n' +
    '  d. 집/사무실 Wi-Fi에 연결된 상태에서 "현재 Wi-Fi 추가"를 눌러 등록한 뒤 자동 모드를 켜세요.\n' +
    '  e. 네트워크에서 처음 무선 디버깅이 켜질 때 허용 여부를 묻습니다: "이 네트워크에서 항상 허용"을 체크하세요.\n' +
    "     신뢰는 공유기(BSSID) 단위라서 메시 노드나 2.4/5GHz가 분리된 네트워크는 각각 한 번씩 허용해야 합니다.",
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
    "  2. ワイヤレス デバッグがオンになっていること(アプリが自動でオンにします。通知またはクイック設定タイルを確認してください)。\n" +
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
  "pair.failed":
    "{0} とのペア設定に失敗しました:\n{1}\n\nスマートフォンのペア設定ダイアログが開いたままか、コードとポートが最新か(ダイアログを開くたびに変わります)、スマートフォンがこの PC と同じネットワークにあるかを確認してください。",
  "pair.notConnectedYet": "ペア設定は完了しましたが、まだ接続されていません: {0}\n数秒後に connect_device をお試しください。",
  "companion.usingLocal": "1. ローカルの APK を使用: {0}",
  "companion.downloaded": "1. ダウンロード完了: {0} ({1} MB) -> {2}",
  "companion.cached": "1. ダウンロード失敗({0})のため、キャッシュを使用: {1}",
  "companion.downloadFailed":
    "{0} からコンパニオン APK をダウンロードできませんでした: {1}\n手動でダウンロードして apk_path に指定してください。",
  "companion.installed": "2. {0} にインストールしました",
  "companion.granted": "3. WRITE_SECURE_SETTINGS を付与しました(アプリがワイヤレス デバッグを切り替えられるようになります)",
  "companion.grantFailed":
    "3. WRITE_SECURE_SETTINGS の付与に失敗しました: {0}\n   (Xiaomi/MIUI: 開発者向けオプションで「USB デバッグ(セキュリティ設定)」をオンにしてから再実行してください。)",
  "companion.launched": "4. アプリを起動しました",
  "companion.launchFailed": "4. アプリを起動できませんでした: {0}",
  "companion.nextSteps":
    "次に、スマートフォンの {0} アプリで以下を行ってください:\n" +
    "  a. 位置情報の権限:「常に許可」を選び、位置情報をオンのままにします(バックグラウンドで Wi-Fi 名を取得するために必要)。\n" +
    "  b. 通知を許可します。\n" +
    "  c. バッテリー: システムに終了されないよう「制限なし」に設定します(Galaxy は「スリープ中のアプリ」からも除外)。\n" +
    "  d. 自宅/オフィスの Wi-Fi に接続した状態で「現在の Wi-Fi を追加」をタップして登録し、自動モードをオンにします。\n" +
    "  e. そのネットワークで初めてワイヤレス デバッグがオンになると許可を求められます:「このネットワークで常に許可する」にチェックしてください。\n" +
    "     信頼はルーター(BSSID)ごとなので、メッシュの各ノードや 2.4/5 GHz が別のネットワークはそれぞれ一度ずつ許可が必要です。",
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
    "  2. 无线调试已开启(应用会自动开启;请查看其通知或快捷设置图块)。\n" +
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
  "pair.failed":
    "与 {0} 配对失败:\n{1}\n\n请确认手机上的配对对话框仍处于打开状态、配对码和端口是最新的(每次打开对话框都会变化),并且手机与这台电脑在同一网络中。",
  "pair.notConnectedYet": "已配对,但尚未连接:{0}\n请过几秒后再试 connect_device。",
  "companion.usingLocal": "1. 使用本地 APK:{0}",
  "companion.downloaded": "1. 已下载 {0}({1} MB)-> {2}",
  "companion.cached": "1. 下载失败({0}),改用缓存的 {1}",
  "companion.downloadFailed": "无法从 {0} 下载配套应用 APK:{1}\n请手动下载,并通过 apk_path 指定。",
  "companion.installed": "2. 已安装到 {0}",
  "companion.granted": "3. 已授予 WRITE_SECURE_SETTINGS(使应用可以开关无线调试)",
  "companion.grantFailed":
    "3. 授予 WRITE_SECURE_SETTINGS 失败:{0}\n   (小米/MIUI:请在开发者选项中开启“USB 调试(安全设置)”,然后重新运行。)",
  "companion.launched": "4. 已启动应用",
  "companion.launchFailed": "4. 无法启动应用:{0}",
  "companion.nextSteps":
    "接下来请在手机上的 {0} 应用中完成:\n" +
    "  a. 位置权限:选择“始终允许”,并保持位置信息开启(用于在后台读取 Wi-Fi 名称)。\n" +
    "  b. 允许通知。\n" +
    "  c. 电池:设为“不受限制”,以免被系统关闭(三星:同时将其移出“休眠应用”)。\n" +
    "  d. 连接家里/办公室的 Wi-Fi 时,点按“添加当前 Wi-Fi”将其加入白名单,然后开启自动模式。\n" +
    "  e. 某个网络首次开启无线调试时,手机会询问是否允许:请勾选“始终允许在此网络上使用”。\n" +
    "     信任按路由器(BSSID)计算,因此 Mesh 的每个节点或分开的 2.4/5 GHz 网络都需要各确认一次。",
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
    "  2. Que la Depuración inalámbrica esté activada (la app la activa sola; revisa su notificación o el icono de Ajustes rápidos).\n" +
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
  "pair.failed":
    "No se pudo vincular con {0}:\n{1}\n\nComprueba que el cuadro de vinculación siga abierto en el teléfono, que el código y el puerto sean los actuales (cambian cada vez que se abre) y que el teléfono esté en la misma red que este PC.",
  "pair.notConnectedYet": "Vinculado, pero aún sin conectar: {0}\nPrueba connect_device dentro de unos segundos.",
  "companion.usingLocal": "1. Usando el APK local {0}",
  "companion.downloaded": "1. Descargado {0} ({1} MB) -> {2}",
  "companion.cached": "1. Falló la descarga ({0}); se usa la copia en caché {1}",
  "companion.downloadFailed": "No se pudo descargar el APK complementario desde {0}: {1}\nDescárgalo manualmente y pásalo con apk_path.",
  "companion.installed": "2. Instalado en {0}",
  "companion.granted": "3. Concedido WRITE_SECURE_SETTINGS (permite a la app activar y desactivar la Depuración inalámbrica)",
  "companion.grantFailed":
    '3. No se pudo conceder WRITE_SECURE_SETTINGS: {0}\n   (Xiaomi/MIUI: activa "Depuración USB (ajustes de seguridad)" en Opciones para desarrolladores y vuelve a ejecutarlo.)',
  "companion.launched": "4. App abierta",
  "companion.launchFailed": "4. No se pudo abrir la app: {0}",
  "companion.nextSteps":
    "Siguientes pasos en el teléfono, en la app {0}:\n" +
    '  a. Permiso de ubicación: elige "Permitir todo el tiempo" y deja la ubicación activada (necesario para leer el nombre de la Wi-Fi en segundo plano).\n' +
    "  b. Permite las notificaciones.\n" +
    '  c. Batería: ponla en "Sin restricciones" para que el sistema no la cierre (Samsung: sácala también de "Aplicaciones en suspensión").\n' +
    '  d. Conectado a la Wi-Fi de casa u oficina, toca "Añadir Wi-Fi actual" para añadirla a la lista y activa el modo automático.\n' +
    '  e. La primera vez que se active la Depuración inalámbrica en una red, el teléfono pedirá permiso: marca "Permitir siempre en esta red".\n' +
    "     La confianza es por router (BSSID), así que cada nodo mesh o red 2,4/5 GHz separada necesita una aprobación.",
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
    "  2. Le débogage sans fil est activé (l'application l'active automatiquement ; voyez sa notification ou sa vignette des Réglages rapides).\n" +
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
  "pair.failed":
    "Échec de l'association avec {0} :\n{1}\n\nVérifiez que la fenêtre d'association est toujours ouverte sur le téléphone, que le code et le port sont à jour (ils changent à chaque ouverture) et que le téléphone est sur le même réseau que ce PC.",
  "pair.notConnectedYet": "Associé, mais pas encore connecté : {0}\nRéessayez connect_device dans quelques secondes.",
  "companion.usingLocal": "1. Utilisation de l'APK local {0}",
  "companion.downloaded": "1. Téléchargé {0} ({1} Mo) -> {2}",
  "companion.cached": "1. Échec du téléchargement ({0}) ; utilisation de la copie en cache {1}",
  "companion.downloadFailed":
    "Impossible de télécharger l'APK de l'application compagnon depuis {0} : {1}\nTéléchargez-le manuellement et indiquez-le avec apk_path.",
  "companion.installed": "2. Installé sur {0}",
  "companion.granted": "3. WRITE_SECURE_SETTINGS accordé (permet à l'application d'activer ou désactiver le débogage sans fil)",
  "companion.grantFailed":
    "3. ÉCHEC de l'octroi de WRITE_SECURE_SETTINGS : {0}\n   (Xiaomi/MIUI : activez « Débogage USB (paramètres de sécurité) » dans les Options pour les développeurs, puis relancez.)",
  "companion.launched": "4. Application lancée",
  "companion.launchFailed": "4. Impossible de lancer l'application : {0}",
  "companion.nextSteps":
    "Étapes suivantes sur le téléphone, dans l'application {0} :\n" +
    "  a. Autorisation de localisation : choisissez « Toujours autoriser » et laissez la localisation activée (nécessaire pour lire le nom du Wi-Fi en arrière-plan).\n" +
    "  b. Autorisez les notifications.\n" +
    "  c. Batterie : choisissez « Non restreinte » pour que le système ne ferme pas l'application (Samsung : retirez-la aussi des « Applications en veille »).\n" +
    "  d. Connecté au Wi-Fi de la maison ou du bureau, appuyez sur « Ajouter le Wi-Fi actuel » pour l'ajouter à la liste, puis activez le mode automatique.\n" +
    "  e. La première fois que le débogage sans fil s'active sur un réseau, le téléphone demande l'autorisation : cochez « Toujours autoriser sur ce réseau ».\n" +
    "     La confiance est accordée par routeur (BSSID) : chaque nœud mesh ou réseau 2,4/5 GHz séparé demande une approbation.",
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
