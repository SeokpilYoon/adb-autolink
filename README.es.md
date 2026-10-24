<h1 align="center">adb-autolink</h1>

<p align="center"><b>ADB inalámbrico sin intervención para desarrolladores Android, hecho para Claude Code.</b></p>

<p align="center">

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · [简体中文](README.zh-Hans.md) · **Español** · [Français](README.fr.md)

</p>

<p align="center">
  <img src=".claude-plugin/icon.png" width="96" alt="adb-autolink icon" />
</p>

---

Sal con tu teléfono, vuelve y simplemente pídeselo a Claude:

> "Instala Builds/game.apk en mi S21, ábrelo y haz una captura de pantalla."

Sin volver a emparejar y sin escribir direcciones IP, puertos ni códigos de emparejamiento. El teléfono vuelve a activar la depuración inalámbrica por sí solo cuando se une a una red Wi-Fi de confianza, y el servidor MCP lo encuentra mediante mDNS y se reconecta cuando hace falta.

## Cómo funciona

```
 Phone (ADB Autolink app)                      PC (Claude Code + adb-autolink MCP)
 ─────────────────────────                     ───────────────────────────────────
 joins a whitelisted Wi-Fi                     Claude calls any tool (e.g. screenshot)
   → writes adb_wifi_enabled=1                   → adb mdns services  (_adb-tls-connect._tcp)
   → adbd advertises a new random port  ────▶    → adb connect ip:port  (already paired)
                                                 → runs the command
```

- El emparejamiento es permanente; lo único que se rompe al salir de la red es que **la depuración inalámbrica se desactiva** y que **el puerto cambia**. Este proyecto soluciona exactamente esas dos cosas.
- La app complementaria usa `WRITE_SECURE_SETTINGS` (concedido una sola vez por adb) para activar y desactivar la depuración inalámbrica. Sin root.

## Componentes

| Ruta | Qué es |
|---|---|
| `android-app/` | App complementaria **ADB Autolink** (Kotlin, Compose, Android 11+). Activa automáticamente la depuración inalámbrica en los SSID de la lista blanca, incluye un mosaico de Ajustes rápidos y sobrevive a los reinicios. |
| `mcp-server/` | Servidor MCP (TypeScript, bundle autocontenido precompilado en `mcp-server/dist`, sin necesidad de `npm install`) + CLI `adb-autolink`. |
| `skills/setup/` | Skill de configuración guiada para la primera vez (`/adb-autolink:setup`). |

## Requisitos

- Claude Code
- Node.js 20+
- Android SDK platform-tools (`adb` 34+ con mDNS). Se localiza mediante `ADB_PATH`, `ANDROID_HOME` / `ANDROID_SDK_ROOT`, la ubicación predeterminada del SDK de Android Studio o `PATH`.
- Teléfono con Android 11+, en la misma LAN que el PC. Dispositivo probado: Samsung Galaxy (One UI).

## Instalación

```text
/plugin marketplace add SeokpilYoon/adb-autolink
/plugin install adb-autolink@adb-autolink
```

Reinicia Claude Code y ejecuta:

```text
/adb-autolink:setup
```

Claude te guía por el emparejamiento e instala la app complementaria (descargada de la última release de GitHub). La instalación concede por adb todos los permisos y exclusiones y, si la conexión es inalámbrica, permite la Wi-Fi actual, así que no hay nada que configurar en la app. Solo queda el aviso de Android *"Permitir siempre en esta red"*.

¿Es tu primera vez con la depuración inalámbrica? La [guía ilustrada](docs/guide/wireless-debugging.es.md) muestra cada pantalla con el elemento que hay que tocar resaltado.

### Configuración manual (alternativa)

1. Empareja una vez: **Opciones para desarrolladores > Depuración inalámbrica > Vincular dispositivo con código de vinculación**, y luego `adb pair <ip:port> <code>` (o pide a Claude que llame a `pair_device`).
2. Instala el APK desde [Releases](https://github.com/SeokpilYoon/adb-autolink/releases/latest) y concede el permiso:
   ```bash
   adb install -r adb-autolink.apk
   adb shell pm grant dev.adbautolink.companion android.permission.WRITE_SECURE_SETTINGS
   ```
3. En la app **ADB Autolink**:
   - Ubicación → **Permitir siempre** y servicios de ubicación activados (necesario para leer el nombre del Wi-Fi en segundo plano)
   - Permitir notificaciones
   - Batería → **Sin restricciones** (Samsung: exclúyela también de las apps en suspensión)
   - Toca **Permitir esta Wi-Fi** (el modo automático está activo mientras haya al menos una Wi-Fi permitida)
   - La tarjeta *Falta configuración* de la app solo muestra lo que aún falta.
4. La primera vez en cada red, Android pregunta *"¿Permitir la depuración inalámbrica en esta red?"*: marca **Permitir siempre en esta red**. La confianza es por punto de acceso (BSSID), así que los routers mesh o de doble banda pueden preguntar una vez por cada AP. La app te avisa con una notificación cuando hace falta esta aprobación.

## Herramientas MCP

Todas las herramientas de dispositivo se conectan automáticamente primero. Selecciona un dispositivo por número de serie, `ip:port`, alias o nombre de modelo (`S21`, `S24+`, `S24 Ultra`). Si lo omites, se usa el único dispositivo en línea.

| Herramienta | Descripción |
|---|---|
| `list_devices` | Dispositivos conectados, teléfonos descubiertos por mDNS y una tabla de todos los teléfonos guardados (alias, modelo, última dirección, si está en línea) |
| `connect_device` / `disconnect_device` | Conexión / desconexión explícita (normalmente no hace falta) |
| `pair_device` | Primer emparejamiento con un código de 6 dígitos |
| `install_companion_app` | Descarga e instala la app ADB Autolink y le concede su permiso |
| `save_checkpoint` | Captura la app ADB Autolink y registra cómo se conectó el teléfono, en la primera conexión y tras apagar y encender la Wi-Fi (`~/.adb-autolink/checks/`) |
| `install_apk` | Instala un APK (`-r -g`) |
| `launch_app` / `stop_app` | Inicia (launcher o una actividad concreta) / fuerza la detención |
| `screenshot` | Vista previa JPEG de 1280px por defecto, `full_resolution` para el PNG original, `save_path` opcional |
| `tap` / `swipe` / `input_text` / `key_event` | Entrada (`input_text` solo admite ASCII, una limitación de `input` de Android) |
| `wake_device` | Enciende la pantalla y descarta un bloqueo de pantalla no seguro |
| `logcat` | Filtra por paquete, etiqueta o prioridad, limita líneas, búfer de fallos |
| `set_device_alias` | Añade o quita alias. Cada teléfono recibe automáticamente el nombre de su modelo (`S21`, un segundo `S21-2`) |

CLI: `node mcp-server/dist/cli.js devices` · `node mcp-server/dist/cli.js connect S21`

## Idiomas

La app complementaria, la CLI, la guía de configuración y la skill de configuración admiten **English, 한국어, 日本語, 简体中文, Español y Français**.

- **App:** sigue el idioma del teléfono. En Android 13+ también puedes elegir un idioma por app.
- **CLI y guía de las herramientas:** siguen `ADB_AUTOLINK_LANG` (`en`, `ko`, `ja`, `zh-Hans`, `es`, `fr`), o la configuración regional del SO si no está definida.
- **Claude:** responde en el idioma en que le escribes.

## Documentación

Consulta [docs/](docs/README.md): [arquitectura](docs/architecture.md), [solución de problemas](docs/troubleshooting.md), [proceso de publicación](docs/release.md), [seguridad](SECURITY.md), [registro de cambios](CHANGELOG.md).

## Solución de problemas

| Síntoma | Qué comprobar |
|---|---|
| No se encuentra el teléfono | ¿Está en un Wi-Fi de la lista blanca? ¿La notificación de la app dice *ON*? ¿Está en la misma LAN que el PC? |
| El descubrimiento mDNS está vacío | El perfil de red de Windows debe ser **Privada**; permite `adb.exe` (UDP 5353) en el firewall |
| La captura muestra la pantalla de bloqueo | adb no puede desbloquear un PIN o patrón; usa Smart Lock (lugares de confianza) o desbloquea manualmente |
| La captura sale en negro | La app usa `FLAG_SECURE` |
| Instalación bloqueada | Desactiva el **Bloqueador automático** de Samsung; responde al aviso de Play Protect en el teléfono |
| El SSID aparece como `<unknown ssid>` | Ubicación en "Permitir siempre", servicios de ubicación activados, revocación automática de permisos de apps sin usar desactivada |
| El PC pide volver a autorizar tras una semana | Activa *Desactivar el tiempo de espera de autorización de 7 días* en la app (`adb_allowed_connection_time=0`) |

## Notas de seguridad

- La depuración inalámbrica solo se activa automáticamente en los SSID de tu lista blanca, y Android sigue exigiendo confianza por punto de acceso y emparejamiento basado en claves. No añadas Wi-Fi públicas a la lista blanca.
- El servidor MCP solo se conecta automáticamente a teléfonos a los que ya se haya conectado antes. La primera ejecución es la única excepción.
- El mosaico de Ajustes rápidos activa y desactiva la conexión automática. Al desactivarla se detienen el trabajo en segundo plano y la depuración inalámbrica; para activarla, el teléfono debe estar desbloqueado.
- Activar la depuración inalámbrica también activa las Opciones para desarrolladores y la depuración USB; desactivarla no revierte esos cambios.
- La salida de Logcat y el contenido de la pantalla se pasan al modelo, así que trata los logs de apps no fiables como entrada no fiable.

## Compilar desde el código fuente

```bash
# MCP server
cd mcp-server && npm install && npm run build && npm test

# Android app (JDK 17-21; Android Studio's bundled JBR works)
cd android-app && ./gradlew assembleDebug
# Release: signing is read from ~/.android/adb-autolink-keystore.properties
# (storeFile, storePassword, keyAlias, keyPassword); unsigned if absent.
./gradlew assembleRelease   # → android-app/build/dist/adb-autolink.apk
```

Colaboradores: activa una vez por clon el hook que protege los secretos con `git config core.hooksPath .githooks` (consulta [SECURITY.md](SECURITY.md)).

## Licencia

[MIT](LICENSE)
