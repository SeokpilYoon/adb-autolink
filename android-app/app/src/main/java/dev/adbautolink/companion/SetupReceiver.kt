package dev.adbautolink.companion

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Finishes setup from the PC (install_companion_app). Protected by android.permission.DUMP in the
 * manifest, so only adb shell (or the system) can send it:
 *
 *   am broadcast -n dev.adbautolink.companion/.SetupReceiver -a dev.adbautolink.companion.action.SETUP --ez add_current_wifi true
 *
 * The result data tells the PC what happened: "whitelisted:<ssid>", "no_ssid" or "ok".
 */
class SetupReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_SETUP) return
        resultData = if (intent.getBooleanExtra(EXTRA_ADD_CURRENT_WIFI, false)) {
            // Installed over wireless adb: the current network is a development network by definition.
            val ssid = WifiMonitor.currentSsid(context)
            if (ssid == null) "no_ssid"
            else {
                Whitelist.add(context, ssid)
                "whitelisted:$ssid"
            }
        } else {
            WifiWatcherService.sync(context)
            "ok"
        }
    }

    private companion object {
        const val ACTION_SETUP = "dev.adbautolink.companion.action.SETUP"
        const val EXTRA_ADD_CURRENT_WIFI = "add_current_wifi"
    }
}
