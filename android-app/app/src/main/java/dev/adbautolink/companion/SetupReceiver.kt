package dev.adbautolink.companion

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Finishes setup from the PC (install_companion_app). Protected by android.permission.DUMP in the
 * manifest, so only adb shell (or the system) can send it:
 *
 *   am broadcast -n dev.adbautolink.companion/.SetupReceiver -a dev.adbautolink.companion.action.SETUP --ez add_current_wifi true
 *       [--es wake_key <PC key>] [--es serial <ro.serialno>]
 *
 * The result data tells the PC what happened: "whitelisted:<ssid>", "no_ssid" or "ok".
 *
 * action.PROVE --es challenge <hex> answers "proof:<mac>,<mac>", one per key held: over adb, the PC cannot
 * otherwise tell this phone from anything else that speaks the protocol.
 */
class SetupReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == ACTION_PROVE) {
            val challenge = intent.getStringExtra(EXTRA_CHALLENGE) ?: return
            if (HEX_32.matches(challenge)) {
                resultData = "proof:" + Prefs(context).wakeKeys.joinToString(",") { PortBeacon.mac(it, "adb", challenge) }
            }
            return
        }
        if (intent.action != ACTION_SETUP) return
        // Before the watcher (re)starts below, so it opens the port beacon right away.
        val prefs = Prefs(context)
        prefs.paused = false // setting up from the PC means the user wants auto-connect running
        intent.getStringExtra(EXTRA_SERIAL)?.let { prefs.deviceSerial = it }
        intent.getStringExtra(EXTRA_WAKE_KEY)?.takeIf(HEX_64::matches)?.let { key ->
            val others = prefs.wakeKeys - key
            prefs.wakeKeys = others.take(MAX_PCS - 1).toSet() + key
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
        const val ACTION_PROVE = "dev.adbautolink.companion.action.PROVE"
        const val EXTRA_CHALLENGE = "challenge"
        const val EXTRA_WAKE_KEY = "wake_key"
        const val EXTRA_SERIAL = "serial"
        const val MAX_PCS = 4
        val HEX_32 = Regex("[0-9a-f]{32}")
        val HEX_64 = Regex("[0-9a-f]{64}")
    }
}
