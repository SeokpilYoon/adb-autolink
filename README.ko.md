# adb-autolink

**Claude Code용 무선 ADB 자동 연결 도구입니다. 폰을 만지지 않아도 다시 연결됩니다.**

폰을 들고 나갔다 돌아와서 Claude에게 이렇게만 말하면 됩니다.

> "S21에 Builds/game.apk 설치하고 실행한 다음 스크린샷 찍어줘"

다시 페어링할 필요도, IP·포트·페어링 코드를 입력할 필요도 없습니다. 폰은 등록해 둔 Wi-Fi에 연결되면 스스로 무선 디버깅을 켭니다. MCP 서버는 필요할 때 mDNS로 폰을 찾아 다시 연결합니다.

[English README](README.md)

## 동작 원리
- 페어링은 한 번 하면 계속 유지됩니다. 외출하고 돌아왔을 때 문제가 되는 건 **무선 디버깅이 꺼지는 것**과 **포트가 바뀌는 것** 두 가지뿐이고, 이 프로젝트는 그 둘을 해결합니다.
- 컴패니언 앱은 adb로 한 번만 부여하는 `WRITE_SECURE_SETTINGS` 권한을 사용해 무선 디버깅을 켭니다. 루팅은 필요 없습니다.
- MCP 서버는 도구가 호출될 때 `adb mdns services`로 폰의 현재 포트를 찾아 `adb connect` 합니다.

## 구성
| 경로 | 설명 |
|---|---|
| `android-app/` | **ADB Autolink** 앱 (Kotlin + Compose, Android 11 이상). 등록한 Wi-Fi에서 무선 디버깅을 자동으로 켜고, 빠른 설정 타일을 제공하며, 재부팅 후에도 동작합니다. |
| `mcp-server/` | MCP 서버와 CLI. 미리 빌드된 단일 번들이 들어 있어 `npm install`이 필요 없습니다. |
| `skills/setup/` | 첫 설정을 안내하는 스킬 (`/adb-autolink:setup`) |

## 요구 사항
- Claude Code
- Node.js 20 이상
- Android SDK platform-tools (`adb` 34 이상)
- Android 11 이상 폰, PC와 같은 네트워크(LAN)에 연결되어 있어야 함

## 설치
```text
/plugin marketplace add SeokpilYoon/adb-autolink
/plugin install adb-autolink@adb-autolink
```
Claude Code를 재시작한 뒤 아래를 실행합니다.
```text
/adb-autolink:setup
```
Claude가 순서대로 안내합니다.
1. 페어링
2. 앱 설치 (최신 GitHub 릴리스에서 자동으로 받음)
3. 권한 부여
4. 폰 설정

### 수동 설정
1. 페어링: **개발자 옵션 → 무선 디버깅 → 페어링 코드로 기기 페어링**을 연 뒤 `adb pair <ip:port> <코드>`를 실행합니다.
2. [Releases](https://github.com/SeokpilYoon/adb-autolink/releases/latest)에서 APK를 받아 설치하고 권한을 부여합니다.
   ```bash
   adb install -r adb-autolink.apk
   adb shell pm grant dev.adbautolink.companion android.permission.WRITE_SECURE_SETTINGS
   ```
3. ADB Autolink 앱에서 다음을 설정합니다.
   - 위치 권한을 **항상 허용**으로 하고 위치 서비스를 켭니다.
   - 알림을 허용합니다.
   - 배터리를 **제한 없음**으로 설정합니다.
   - **현재 Wi-Fi 추가**를 누르고 **자동 켜기**를 켭니다.
4. 네트워크마다 처음 한 번 "이 네트워크에서 무선 디버깅을 허용할까요?" 창이 뜹니다. **항상 허용**에 체크하세요. 이 승인은 공유기(AP) 단위라서, 메시 Wi-Fi나 2.4/5GHz가 따로 잡히는 공유기라면 각각 한 번씩 허용해야 합니다.

## MCP 도구
모든 기기 도구는 실행 전에 자동으로 연결합니다. 기기는 serial, `ip:port`, 별칭, 모델명(`S21`, `S24+`)으로 지정할 수 있습니다.

- 연결: `list_devices`, `connect_device`, `disconnect_device`
- 설정: `pair_device`, `install_companion_app`
- 앱: `install_apk`, `launch_app`, `stop_app`
- 화면: `screenshot`, `wake_device`
- 입력: `tap`, `swipe`, `input_text`(영문만 가능), `key_event`
- 로그와 기타: `logcat`, `set_device_alias`

## 문제 해결
| 증상 | 확인할 것 |
|---|---|
| 폰을 찾지 못함 | 등록한 Wi-Fi에 연결되어 있는지, 앱 알림에 "ON"이 표시되는지, PC와 같은 네트워크인지 |
| mDNS 탐색 결과가 비어 있음 | Windows 네트워크 프로필이 **개인**인지, 방화벽이 `adb.exe`의 UDP 5353을 허용하는지 |
| 스크린샷에 잠금 화면이 찍힘 | PIN이나 패턴 잠금은 adb로 해제할 수 없습니다. Smart Lock(신뢰할 수 있는 장소)을 설정하세요. |
| 스크린샷이 검은 화면 | 앱이 `FLAG_SECURE`를 사용하는 경우입니다. |
| 설치가 차단됨 | 삼성 **자동 차단(Auto Blocker)**을 끄고, 폰 화면에 뜬 Play Protect 확인 창을 처리하세요. |
| SSID가 `<unknown ssid>`로 표시됨 | 위치 권한이 "항상 허용"인지, 위치 서비스가 켜져 있는지, 권한 자동 회수가 꺼져 있는지 |

## 보안
- 등록한 Wi-Fi에서만 자동으로 켜집니다. 그 위에 안드로이드의 공유기 단위 승인과 키 기반 페어링이 그대로 적용됩니다. 공용 Wi-Fi는 등록하지 마세요.
- MCP 서버는 이전에 한 번이라도 연결했던 기기만 자동으로 연결합니다. 처음 실행할 때만 예외입니다.
- 폰이 잠겨 있으면 빠른 설정 타일이 동작하지 않습니다.
- 무선 디버깅을 켤 때 개발자 옵션과 USB 디버깅도 함께 켜집니다.
- logcat과 화면 내용은 그대로 Claude에게 전달됩니다.

## 라이선스
[MIT](LICENSE)
