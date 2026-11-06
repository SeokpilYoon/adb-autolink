/** Branding and distribution constants. */
export const NAME = "adb-autolink";
export const VERSION = "0.6.1";
/** Android companion app (turns Wireless debugging on when the phone joins a whitelisted Wi-Fi). */
export const COMPANION_APP_NAME = "ADB Autolink";
export const COMPANION_PACKAGE = "dev.adbautolink.companion";
export const COMPANION_APK_URL = `https://github.com/SeokpilYoon/adb-autolink/releases/download/v${VERSION}/adb-autolink.apk`;
/** SHA-256 of that APK, written by `node scripts/release.mjs pin`; `publish` refuses a mismatch. */
export const COMPANION_APK_SHA256 = "cd586c89a86f21aa8ba5addb82a211a222d03d5f45fd87b2492448474218bfa8";
/** Illustrated wireless debugging setup guide; one page per locale, English without a suffix. */
export const GUIDE_URL_BASE = "https://github.com/SeokpilYoon/adb-autolink/blob/main/docs/guide/wireless-debugging";
