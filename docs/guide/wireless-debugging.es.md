# Guía de configuración de la depuración inalámbrica (Galaxy)

[English](wireless-debugging.md) · [한국어](wireless-debugging.ko.md) · [日本語](wireless-debugging.ja.md) · [简体中文](wireless-debugging.zh-Hans.md) · **Español** · [Français](wireless-debugging.fr.md)

Para que Claude en tu PC se conecte al teléfono por Wi-Fi, haz estos pasos en el teléfono **una sola vez**. Después, la app ADB Autolink activa la depuración inalámbrica por sí sola y Claude se conecta automáticamente.

- Capturas: Galaxy S21, One UI 7 (Android 15). **Las capturas están en inglés**; con el teléfono en español los menús están en el mismo lugar. Otros modelos o versiones pueden variar ligeramente.
- Antes de empezar, **conecta el PC y el teléfono a la misma Wi-Fi**.

## 1. Activa las Opciones para desarrolladores

1. Abre **Ajustes > Información del teléfono > Información de software**.
2. Toca **Número de compilación** 7 veces seguidas. Si te pide el PIN de bloqueo, introdúcelo. Cuando aparezca "El modo de desarrollador se ha activado", está listo.

<p>
<img src="img/en/01-about.png" width="270" alt="Información del teléfono, Información de software resaltada">
<img src="img/en/02-software.png" width="270" alt="Información de software, Número de compilación resaltado">
</p>

## 2. Activa la Depuración inalámbrica

1. Abre **Opciones para desarrolladores**, que ahora aparece al final de **Ajustes**.
2. Desplázate hasta **Depuración** y activa el interruptor de **Depuración inalámbrica**.
3. Si pregunta "¿Permitir la depuración inalámbrica en esta red?", marca **Permitir siempre en esta red** y toca **Permitir**.

<p>
<img src="img/en/03-settings.png" width="270" alt="Final de Ajustes, Opciones para desarrolladores resaltadas">
<img src="img/en/04-devopts.png" width="270" alt="Opciones para desarrolladores, interruptor de Depuración inalámbrica resaltado">
</p>

## 3. Vincula el teléfono con tu PC (una vez por PC)

1. Toca el texto **Depuración inalámbrica** (no el interruptor) para abrir su pantalla.
2. ① Fíjate en la **dirección IP y puerto** de la parte superior. Es la dirección a la que Claude se **conecta**.
3. ② Toca **Vincular dispositivo con código de vinculación**.
4. Fíjate en el **código de vinculación de Wi-Fi** (6 dígitos) y la **dirección IP y puerto** (para vincular) que muestra el cuadro.
5. Dile a Claude **los tres valores a la vez**. Por ejemplo: `conecta 192.168.0.10:41235 / vincula 192.168.0.10:37099 123456`

<p>
<img src="img/en/05-wireless.png" width="270" alt="Depuración inalámbrica, (1) dirección IP y puerto y (2) Vincular dispositivo con código de vinculación resaltados">
<img src="img/en/06-pair.png" width="270" alt="Cuadro de vinculación, código de vinculación y dirección IP y puerto para vincular resaltados">
</p>

- El puerto de conexión (①) y el puerto de vinculación del cuadro son **distintos**. Sin la dirección de conexión, la vinculación puede funcionar y la conexión fallar. Con el cuadro abierto, ① sigue visible, atenuado, detrás.
- **No cierres el cuadro** hasta que termine la vinculación. El código y el puerto de vinculación cambian cada vez que se abre.

## 4. Listo

Una vez vinculado, Claude instala la app ADB Autolink y completa todos los ajustes. A partir de ahí, la depuración inalámbrica se activa cada vez que el teléfono se conecta a una Wi-Fi permitida, y Claude se conecta cuando lo necesita.

## Si algo falla

| Problema | Solución |
|---|---|
| Tocar Número de compilación no hace nada | Puede que las Opciones para desarrolladores ya estén activadas. Busca **Opciones para desarrolladores** al final de Ajustes. |
| La vinculación falla | Comprueba que el cuadro siga abierto, que el código y el puerto sean los actuales del cuadro, y que el PC y el teléfono estén en la misma Wi-Fi. |
| La instalación de la app se bloquea | Desactiva **Ajustes > Seguridad y privacidad > Bloqueador automático** y revisa si hay un aviso de Play Protect en pantalla. |
| Vinculado, pero sin conexión | Dile a Claude la **dirección IP y puerto** (①) de la parte superior de la pantalla de Depuración inalámbrica. Se conectará directamente a ella. |
| No se encuentra el teléfono (Windows) | Configura el perfil de la red Wi-Fi como **Privada**. En Pública se bloquea la detección del teléfono (mDNS). |
