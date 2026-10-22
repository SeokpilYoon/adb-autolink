package dev.adbautolink.companion

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import android.util.Log

/** Reads/writes the Settings.Global keys behind Developer options > Wireless debugging. */
object AdbWifiController {
    private const val TAG = "AdbWifiController"
    private const val ADB_WIFI_ENABLED = "adb_wifi_enabled"
    private const val ADB_ALLOWED_CONNECTION_TIME = "adb_allowed_connection_time"
    private const val DEFAULT_CONNECTION_TIME_MS = 7L * 24 * 60 * 60 * 1000

    const val GRANT_COMMAND =
        "adb shell pm grant dev.adbautolink.companion android.permission.WRITE_SECURE_SETTINGS"

    fun hasPermission(context: Context): Boolean =
        context.checkSelfPermission(Manifest.permission.WRITE_SECURE_SETTINGS) ==
            PackageManager.PERMISSION_GRANTED

    fun isEnabled(context: Context): Boolean = global(context, ADB_WIFI_ENABLED) == 1

    val enabledUri: Uri get() = Settings.Global.getUriFor(ADB_WIFI_ENABLED)

    fun isDeveloperOptionsEnabled(context: Context): Boolean =
        global(context, Settings.Global.DEVELOPMENT_SETTINGS_ENABLED) == 1 &&
            global(context, Settings.Global.ADB_ENABLED) == 1

    /** Returns null on success, otherwise an error message. */
    fun setEnabled(context: Context, enabled: Boolean): String? = write {
        val cr = context.contentResolver
        if (enabled) {
            for (key in listOf(Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, Settings.Global.ADB_ENABLED)) {
                if (global(context, key) != 1) Settings.Global.putInt(cr, key, 1)
            }
        }
        Settings.Global.putInt(cr, ADB_WIFI_ENABLED, if (enabled) 1 else 0)
    }

    /** Manual toggle from tile/app: remembers a user "off" so the watcher does not re-enable it. */
    fun setEnabledByUser(context: Context, enabled: Boolean): String? {
        Prefs(context).userDisabled = !enabled
        return setEnabled(context, enabled)
    }

    /** Authorization timeout in ms (0 = never expires). */
    fun allowedConnectionTimeMs(context: Context): Long =
        Settings.Global.getLong(context.contentResolver, ADB_ALLOWED_CONNECTION_TIME, DEFAULT_CONNECTION_TIME_MS)

    fun setAuthTimeoutDisabled(context: Context, disabled: Boolean): String? = write {
        Settings.Global.putLong(
            context.contentResolver, ADB_ALLOWED_CONNECTION_TIME,
            if (disabled) 0L else DEFAULT_CONNECTION_TIME_MS,
        )
    }

    /** Developer options > Wireless debugging, falling back to Developer options. */
    fun wirelessDebuggingSettingsIntent(context: Context): Intent {
        val direct = Intent("android.settings.ADB_WIFI_SETTINGS")
        val intent = if (direct.resolveActivity(context.packageManager) != null) direct
        else Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS)
        return intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    private fun global(context: Context, key: String) = Settings.Global.getInt(context.contentResolver, key, 0)

    private inline fun write(block: () -> Unit): String? = try {
        block()
        null
    } catch (e: SecurityException) {
        Log.w(TAG, "WRITE_SECURE_SETTINGS missing", e)
        "WRITE_SECURE_SETTINGS not granted. Run: $GRANT_COMMAND"
    }
}
