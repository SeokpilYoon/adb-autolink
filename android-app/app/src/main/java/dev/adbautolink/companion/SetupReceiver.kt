package dev.adbautolink.companion

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Finishes setup from the PC (install_companion_app). Protected by android.permission.DUMP in the
 * manifest, so only adb shell (or the system) can send it:
 *
 *   am broadcast -n dev.adbautolink.companion/.SetupReceiver -a dev.adbautolink.companion.action.SETUP --ez add_current_wifi true
 *       [--es beacon_token <PC token>] [--es serial <ro.serialno>]
 *
 * The result data tells the PC what happened: "whitelisted:<ssid>", "no_ssid" or "ok".
 */
class SetupReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_SETUP) return
        // Before the watcher (re)starts below, so it opens the port beacon right away.
        val prefs = Prefs(context)
        prefs.paused = false // setting up from the PC means the user wants auto-connect running
        intent.getStringExtra(EXTRA_SERIAL)?.let { prefs.deviceSerial = it }
        intent.getStringExtra(EXTRA_BEACON_TOKEN)?.let { token ->
            val others = prefs.beaconTokens - token
            prefs.beaconTokens = others.take(MAX_PCS - 1).toSet() + token
        }
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
        const val EXTRA_BEACON_TOKEN = "beacon_token"
        const val EXTRA_SERIAL = "serial"
        const val MAX_PCS = 4
    }
}
