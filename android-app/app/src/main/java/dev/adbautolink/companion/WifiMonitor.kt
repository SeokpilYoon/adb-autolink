package dev.adbautolink.companion

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.annotation.RequiresApi
import java.net.Inet4Address

/** [ssid] is null when Android hides it ("<unknown ssid>": missing background location or location services off). */
data class WifiSnapshot(val ssid: String?, val bssid: String?, val ipv4: String?)

/** Tracks the current Wi-Fi network (SSID, BSSID, IPv4). Callbacks are delivered on the main thread. */
class WifiMonitor(context: Context, private val onChange: (WifiSnapshot?) -> Unit) {
    private val cm = context.getSystemService(ConnectivityManager::class.java)
    private val wm = context.applicationContext.getSystemService(WifiManager::class.java)
    private val handler = Handler(Looper.getMainLooper())
    private val callback =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Callback(ConnectivityManager.NetworkCallback.FLAG_INCLUDE_LOCATION_INFO)
        else Callback()

    // The callback sees every Wi-Fi network; keep state per Network so SSID and IP never mix.
    private val states = HashMap<Network, WifiSnapshot>()
    private var current: Network? = null
    private var registered = false

    fun start() {
        if (registered) return
        val request = NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build()
        try {
            cm.registerNetworkCallback(request, callback, handler)
            registered = true
        } catch (e: RuntimeException) {
            Log.w(TAG, "registerNetworkCallback failed", e)
        }
    }

    fun stop() {
        if (!registered) return
        runCatching { cm.unregisterNetworkCallback(callback) }
        registered = false
        states.clear()
        current = null
    }

    private fun update(network: Network, change: (WifiSnapshot) -> WifiSnapshot) {
        val snap = change(states[network] ?: WifiSnapshot(null, null, null))
        states[network] = snap
        current = network
        onChange(snap)
    }

    /** API 30 only: NetworkCallback cannot request location info there. */
    @Suppress("DEPRECATION")
    private fun legacyInfo(): WifiInfo? = if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) wm?.connectionInfo else null

    private inner class Callback : ConnectivityManager.NetworkCallback {
        constructor() : super()

        @RequiresApi(Build.VERSION_CODES.S)
        constructor(flags: Int) : super(flags)

        override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
            val info = (caps.transportInfo as? WifiInfo)
            val ssid = normalizeSsid(info?.ssid) ?: normalizeSsid(legacyInfo()?.ssid)
            val bssid = (info?.bssid ?: legacyInfo()?.bssid)?.takeUnless { it == "02:00:00:00:00:00" }
            update(network) { it.copy(ssid = ssid, bssid = bssid) }
        }

        override fun onLinkPropertiesChanged(network: Network, lp: LinkProperties) {
            val ipv4 = lp.linkAddresses.map { it.address }.filterIsInstance<Inet4Address>().firstOrNull()?.hostAddress
            update(network) { it.copy(ipv4 = ipv4) }
        }

        override fun onLost(network: Network) {
            states.remove(network)
            if (network != current) return
            current = states.keys.firstOrNull()
            onChange(current?.let(states::get))
        }
    }

    companion object {
        private const val TAG = "WifiMonitor"

        /** Strips quotes; returns null for blank or "<unknown ssid>" (location permission/services missing). */
        fun normalizeSsid(raw: String?): String? =
            raw?.removeSurrounding("\"")?.takeUnless { it.isBlank() || it == "<unknown ssid>" }
    }
}
