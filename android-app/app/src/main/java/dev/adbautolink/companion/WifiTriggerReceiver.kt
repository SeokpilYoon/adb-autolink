package dev.adbautolink.companion

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.util.Log

/**
 * Backup trigger: a PendingIntent-based network callback survives process death, so if the
 * watcher service was killed (e.g. by Samsung battery management) Wi-Fi changes still wake us.
 */
class WifiTriggerReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val prefs = Prefs(context)
        if (!prefs.autoEnabled || WifiWatcherService.start(context)) return
        // Service could not start from the background: enable directly (best-effort).
        val ssid = WifiMonitor.currentSsid(context)
        if (ssid != null && ssid in prefs.whitelist && !AdbWifiController.isEnabled(context)) {
            AdbWifiController.setEnabled(context, true)?.let { Log.w(TAG, it) }
        }
    }

    companion object {
        private const val TAG = "WifiTriggerReceiver"

        private fun pendingIntent(context: Context) = PendingIntent.getBroadcast(
            context, 0, Intent(context, WifiTriggerReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE, // system adds network extras
        )

        /** Re-registering with the same PendingIntent replaces the previous request. */
        fun register(context: Context) {
            val request = NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build()
            runCatching {
                context.getSystemService(ConnectivityManager::class.java)
                    .registerNetworkCallback(request, pendingIntent(context))
            }.onFailure { Log.w(TAG, "register failed", it) }
        }

        fun unregister(context: Context) {
            runCatching {
                context.getSystemService(ConnectivityManager::class.java)
                    .unregisterNetworkCallback(pendingIntent(context))
            }
        }
    }
}
