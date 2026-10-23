<h1 align="center">adb-autolink</h1>

<p align="center"><b>Claude Code를 위한, 손댈 필요 없는 Android 개발자용 무선 ADB.</b></p>

<p align="center">

[English](README.md) · **한국어** · [日本語](README.ja.md) · [简体中文](README.zh-Hans.md) · [Español](README.es.md) · [Français](README.fr.md)

</p>

<p align="center">
  <img src=".claude-plugin/icon.png" width="96" alt="adb-autolink icon" />
</p>

---

폰을 들고 나갔다가 돌아와서, 그냥 Claude에게 말하세요.

> "Builds/game.apk를 내 S21에 설치하고, 실행한 다음 스크린샷 찍어줘."

다시 페어링할 필요도, IP 주소나 포트, 페어링 코드를 입력할 필요도 없습니다. 폰이 신뢰하는 Wi-Fi에 접속하면 스스로 무선 디버깅을 다시 켜고, MCP 서버가 mDNS로 폰을 찾아 필요할 때 재연결합니다.

## 동작 방식

```
 Phone (ADB Autolink app)                      PC (Claude Code + adb-autolink MCP)
 ─────────────────────────                     ───────────────────────────────────
 joins a whitelisted Wi-Fi                     Claude calls any tool (e.g. screenshot)
   → writes adb_wifi_enabled=1                   → adb mdns services  (_adb-tls-connect._tcp)
   → adbd advertises a new random port  ────▶    → adb connect ip:port  (already paired)
                                                 → runs the command
```

- 페어링은 영구적입니다. 네트워크를 벗어난 뒤 끊어지는 것은 **무선 디버깅이 꺼지는 것**과 **포트가 바뀌는 것** 두 가지뿐이며, 이 프로젝트는 정확히 이 두 가지를 해결합니다.
- 컴패니언 앱은 `WRITE_SECURE_SETTINGS`(adb로 한 번만 부여)를 사용해 무선 디버깅을 켜고 끕니다. 루팅은 필요 없습니다.

## 구성 요소

| 경로 | 설명 |
|---|---|
| `android-app/` | **ADB Autolink** 컴패니언 앱 (Kotlin, Compose, Android 11+). 화이트리스트에 등록한 SSID에서 무선 디버깅을 자동으로 켜고, 빠른 설정 타일을 제공하며, 재부팅 후에도 유지됩니다. |
| `mcp-server/` | MCP 서버 (TypeScript, `mcp-server/dist`에 미리 빌드된 독립 실행형 번들이라 `npm install` 불필요) + `adb-autolink` CLI. |
| `skills/setup/` | 처음 설정을 안내하는 스킬 (`/adb-autolink:setup`). |

## 요구 사항

- Claude Code
- Node.js 20+
- Android SDK platform-tools (mDNS를 지원하는 `adb` 34+). `ADB_PATH`, `ANDROID_HOME` / `ANDROID_SDK_ROOT`, Android Studio 기본 SDK 위치, `PATH` 순으로 탐색합니다.
- PC와 같은 LAN에 있는 Android 11+ 폰. 테스트 대상: Samsung Galaxy (One UI).

## 설치

```text
/plugin marketplace add SeokpilYoon/adb-autolink
/plugin install adb-autolink@adb-autolink
```

Claude Code를 재시작한 뒤 다음을 실행하세요.

```text
/adb-autolink:setup
```

Claude가 페어링을 안내하고 컴패니언 앱을 설치합니다(최신 GitHub 릴리스에서 다운로드). 설치할 때 필요한 권한과 예외를 adb로 모두 설정하고, 무선으로 연결된 경우 현재 Wi-Fi까지 허용하므로 앱에서 설정할 것이 없습니다. 남는 것은 Android의 *"이 네트워크에서 항상 허용"* 확인 한 번뿐입니다.

### 수동 설정 (대안)

1. 한 번만 페어링합니다. **개발자 옵션 > 무선 디버깅 > 페어링 코드로 기기 페어링**을 연 다음 `adb pair <ip:port> <code>`를 실행합니다 (또는 Claude에게 `pair_device` 호출을 요청).
2. [Releases](https://github.com/SeokpilYoon/adb-autolink/releases/latest)에서 APK를 설치하고 권한을 부여합니다.
   ```bash
   adb install -r adb-autolink.apk
   adb shell pm grant dev.adbautolink.companion android.permission.WRITE_SECURE_SETTINGS
   ```
3. **ADB Autolink** 앱에서 다음을 설정합니다.
   - 위치 → **항상 허용**, 위치 서비스 켜기 (백그라운드에서 Wi-Fi 이름을 읽는 데 필요)
   - 알림 허용
   - 배터리 → **제한 없음** (Samsung: 사용하지 않는 앱 절전 대상에서도 제외)
   - **이 Wi-Fi 허용**을 누릅니다 (허용된 Wi-Fi가 하나라도 있으면 자동 모드가 켜집니다)
   - 앱의 *설정 필요* 카드에는 아직 빠진 항목만 표시됩니다.
4. 각 네트워크에서 처음에는 Android가 *"이 네트워크에서 무선 디버깅을 허용하시겠습니까?"*라고 묻습니다. **이 네트워크에서 항상 허용**을 체크하세요. 신뢰는 액세스 포인트(BSSID) 단위라서 메시 또는 듀얼 밴드 공유기는 AP마다 한 번씩 물을 수 있습니다. 이 승인이 필요하면 앱이 알림으로 알려줍니다.

## MCP 도구

모든 기기 도구는 먼저 자동으로 연결합니다. 기기는 시리얼, `ip:port`, 별칭, 모델명(`S21`, `S24+`, `S24 Ultra`)으로 선택합니다. 생략하면 온라인 기기가 하나일 때 그 기기를 사용합니다.

| 도구 | 설명 |
|---|---|
| `list_devices` | 연결된 기기와 mDNS로 발견된 폰 |
| `connect_device` / `disconnect_device` | 명시적 연결 / 연결 해제 (보통은 필요 없음) |
| `pair_device` | 6자리 코드로 최초 페어링 |
| `install_companion_app` | ADB Autolink 앱을 다운로드해 설치하고 권한 부여 |
| `install_apk` | APK 설치 (`-r -g`) |
| `launch_app` / `stop_app` | 실행 (런처 또는 특정 액티비티) / 강제 종료 |
| `screenshot` | 기본은 1280px JPEG 미리보기, 원본 PNG는 `full_resolution`, `save_path` 선택 가능 |
| `tap` / `swipe` / `input_text` / `key_event` | 입력 (`input_text`는 ASCII만 가능, Android `input`의 제한) |
| `wake_device` | 화면을 깨우고 보안이 없는 잠금 화면 해제 |
| `logcat` | 패키지, 태그, 우선순위로 필터링, 줄 수 제한, 크래시 버퍼 |
| `set_device_alias` | 기기에 `test`, `main` 같은 이름 지정 |

CLI: `node mcp-server/dist/cli.js devices` · `node mcp-server/dist/cli.js connect S21`

## 언어

컴패니언 앱, CLI, 설정 안내, 설정 스킬은 **English, 한국어, 日本語, 简体中文, Español, Français**를 지원합니다.

- **앱:** 폰의 언어를 따릅니다. Android 13+에서는 앱별로 언어를 선택할 수도 있습니다.
- **CLI와 도구 안내:** `ADB_AUTOLINK_LANG`(`en`, `ko`, `ja`, `zh-Hans`, `es`, `fr`)을 따르며, 설정하지 않으면 OS 로케일을 따릅니다.
- **Claude:** 사용자가 쓰는 언어로 답합니다.

## 문서

[docs/](docs/README.md)를 참고하세요: [아키텍처](docs/architecture.md), [문제 해결](docs/troubleshooting.md), [릴리스 절차](docs/release.md), [보안](SECURITY.md), [변경 이력](CHANGELOG.md).

## 문제 해결

| 증상 | 확인할 것 |
|---|---|
| 폰을 찾을 수 없음 | 폰이 화이트리스트에 있는 Wi-Fi에 연결되어 있나요? 앱 알림에 *ON*이라고 표시되나요? PC와 같은 LAN인가요? |
| mDNS 검색 결과가 비어 있음 | Windows 네트워크 프로필이 **개인**이어야 하며, 방화벽에서 `adb.exe`(UDP 5353)를 허용하세요 |
| 스크린샷에 잠금 화면이 나옴 | adb는 PIN이나 패턴을 풀 수 없습니다. Smart Lock(신뢰할 수 있는 장소)을 쓰거나 직접 잠금을 해제하세요 |
| 스크린샷이 검은색임 | 해당 앱이 `FLAG_SECURE`를 사용합니다 |
| 설치가 차단됨 | Samsung **자동 차단**을 끄고, 폰에 뜨는 Play 프로텍트 안내에 응답하세요 |
| SSID가 `<unknown ssid>`로 표시됨 | 위치 "항상 허용", 위치 서비스 켜기, 사용하지 않는 앱 권한 자동 해제 끄기 |
| 일주일 뒤 PC에서 재승인을 요구함 | 앱에서 *7일 인증 시간 제한 해제*를 켜세요 (`adb_allowed_connection_time=0`) |

## 보안 참고

- 무선 디버깅은 화이트리스트에 등록한 SSID에서만 자동으로 켜지며, Android는 여전히 액세스 포인트별 신뢰와 키 기반 페어링을 강제합니다. 공용 Wi-Fi는 등록하지 마세요.
- MCP 서버는 이전에 연결한 적이 있는 폰에만 자동 연결합니다. 최초 실행만 예외입니다.
- 빠른 설정 타일은 폰의 잠금이 해제되어 있어야 사용할 수 있습니다.
- 무선 디버깅을 켜면 개발자 옵션과 USB 디버깅도 함께 켜지며, 끄더라도 이 설정은 원래대로 돌아가지 않습니다.
- Logcat 출력과 화면 내용은 모델에 전달되므로, 신뢰할 수 없는 앱의 로그는 신뢰할 수 없는 입력으로 취급하세요.

## 소스에서 빌드

```bash
# MCP server
cd mcp-server && npm install && npm run build && npm test

# Android app (JDK 17-21; Android Studio's bundled JBR works)
cd android-app && ./gradlew assembleDebug
# Release: signing is read from ~/.android/adb-autolink-keystore.properties
# (storeFile, storePassword, keyAlias, keyPassword); unsigned if absent.
./gradlew assembleRelease   # → android-app/build/dist/adb-autolink.apk
```

기여자: 클론마다 한 번 `git config core.hooksPath .githooks`로 시크릿 가드 훅을 활성화하세요 ([SECURITY.md](SECURITY.md) 참고).

## 라이선스

[MIT](LICENSE)
