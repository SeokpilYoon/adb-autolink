package dev.adbautolink.companion

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.net.Inet4Address

/**
 * Best-effort mDNS discovery of this device's own `_adb-tls-connect._tcp` service to learn the
 * current Wireless debugging port. Matches the resolved host against [ownIpv4]. Never throws.
 */
class AdbPortDiscovery(context: Context, private val onPort: (Int) -> Unit) {
    private val nsd = context.getSystemService(NsdManager::class.java)
    private val main = Handler(Looper.getMainLooper())
    private val pending = ArrayDeque<NsdServiceInfo>()
    private var resolving = false
    private var ownIpv4: String? = null
    private var active = false

    private val discoveryListener = object : NsdManager.DiscoveryListener {
        override fun onDiscoveryStarted(serviceType: String) = Unit
        override fun onDiscoveryStopped(serviceType: String) = Unit
        override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
            Log.w(TAG, "discovery failed: $errorCode")
            main.post { active = false }
        }
        override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) = Unit
        override fun onServiceFound(info: NsdServiceInfo) {
            main.post { pending.addLast(info); resolveNext() }
        }
        override fun onServiceLost(info: NsdServiceInfo) = Unit
    }

    fun start(ownIpv4: String?) {
        this.ownIpv4 = ownIpv4
        if (active || nsd == null || ownIpv4 == null) return
        try {
            nsd.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discoveryListener)
            active = true
        } catch (e: RuntimeException) {
            Log.w(TAG, "discoverServices failed", e)
        }
    }

    fun stop() {
        if (!active) return
        active = false
        pending.clear()
        runCatching { nsd?.stopServiceDiscovery(discoveryListener) }
    }

    @Suppress("DEPRECATION") // resolveService/host: fine for one-shot best-effort resolution.
    private fun resolveNext() {
        if (resolving || !active) return
        val info = pending.removeFirstOrNull() ?: return
        resolving = true
        val listener = object : NsdManager.ResolveListener {
            override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) = done(null)
            override fun onServiceResolved(serviceInfo: NsdServiceInfo) = done(serviceInfo)
            private fun done(resolved: NsdServiceInfo?) {
                main.post {
                    resolving = false
                    if (!active) return@post // late result after stop()
                    if (resolved != null && isOwn(resolved)) onPort(resolved.port)
                    resolveNext()
                }
            }
        }
        try {
            nsd?.resolveService(info, listener)
        } catch (e: RuntimeException) {
            Log.w(TAG, "resolveService failed", e)
            resolving = false
            resolveNext()
        }
    }

    @Suppress("DEPRECATION")
    private fun isOwn(info: NsdServiceInfo): Boolean {
        val own = ownIpv4 ?: return false
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            info.hostAddresses.any { it is Inet4Address && it.hostAddress == own }
        } else {
            info.host?.hostAddress == own
        }
    }

    private companion object {
        const val TAG = "AdbPortDiscovery"
        const val SERVICE_TYPE = "_adb-tls-connect._tcp"
    }
}
