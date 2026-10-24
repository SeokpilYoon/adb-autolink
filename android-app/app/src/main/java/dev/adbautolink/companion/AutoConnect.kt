package dev.adbautolink.companion

import android.content.ComponentName
import android.content.Context
import android.service.quicksettings.TileService

/** The "Auto-connect" main switch shared by the app screen and the Quick Settings tile. */
object AutoConnect {
    fun isOn(context: Context): Boolean = !Prefs(context).paused

    /**
     * Off: stops background watching (service, Wi-Fi trigger, port beacon) and turns Wireless debugging off,
     * so nothing runs or listens until it is switched back on. On: watching resumes and turns Wireless
     * debugging on again on an allowed Wi-Fi. Returns an error message, or null.
     */
    fun set(context: Context, on: Boolean): String? {
        val prefs = Prefs(context)
        prefs.paused = !on
        prefs.userDisabled = false
        val error = if (!on && AdbWifiController.isEnabled(context)) AdbWifiController.setEnabled(context, false) else null
        WifiWatcherService.sync(context)
        refreshTile(context)
        return error
    }

    fun refreshTile(context: Context) {
        runCatching { TileService.requestListeningState(context, ComponentName(context, AdbWifiTileService::class.java)) }
    }
}
