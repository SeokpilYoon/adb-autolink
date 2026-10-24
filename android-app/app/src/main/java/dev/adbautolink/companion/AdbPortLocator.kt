package dev.adbautolink.companion

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.util.Log
import java.io.IOException
import java.net.Inet4Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit

/**
 * Finds the current Wireless debugging (TLS) port. Every candidate is confirmed with the adb handshake:
 * adbd answers a CNXN packet on its TLS port with STLS, which nothing else does.
 *
 * Confirmation matters because after Wireless debugging restarts, NsdManager can still resolve the
 * previous instance's port from its cache (same instance name, closed port). Apps cannot read
 * /proc/net or service.adb.tls.port, so the candidates are: the last port, this device's own mDNS
 * advertisement, and, only when [allowScan], every open port (correct but slow, tens of seconds).
 * Blocking; call off the main thread.
 */
object AdbPortLocator {
    private const val TAG = "AdbPortLocator"
    private const val A_CNXN = 0x4e584e43
    private const val A_STLS = 0x534c5453
    private const val SERVICE_TYPE = "_adb-tls-connect._tcp"
    private const val SCAN_THREADS = 48
    /** Linux's default ephemeral range first: adbd binds port 0, so the kernel picks from it. */
    private val SCAN_RANGES = listOf(32768..60999, 1024..32767, 61000..65535)

    /** [ipv4] is this device's Wi-Fi address (where the PC connects); loopback is the fallback. */
    fun find(context: Context, ipv4: String?, lastKnown: Int? = null, allowScan: Boolean = false): Int? {
        val host = ipv4?.let(InetAddress::getByName) ?: InetAddress.getLoopbackAddress()
        if (lastKnown != null && isAdbTls(host, lastKnown)) return lastKnown
        fromMdns(context, host, ipv4)?.let { return it }
        return if (allowScan) scan(host) else null
    }

    /** This device's own `_adb-tls-connect` advertisement, confirmed by handshake (stale cache entries fail it). */
    @Suppress("DEPRECATION") // resolveService: fine for a one-shot resolution on every supported API level.
    private fun fromMdns(context: Context, host: InetAddress, ipv4: String?, timeoutMs: Long = 4_000): Int? {
        val nsd = context.getSystemService(NsdManager::class.java) ?: return null
        // Held only for this lookup (seconds) instead of all the time: it keeps the Wi-Fi chip from filtering
        // multicast, which is what costs battery. The port beacon makes a permanent lock unnecessary.
        val lock = context.applicationContext.getSystemService(WifiManager::class.java)
            ?.createMulticastLock(TAG)?.apply { setReferenceCounted(false) }
        runCatching { lock?.acquire() }
        try {
            return fromMdns(nsd, host, ipv4, timeoutMs)
        } finally {
            if (lock?.isHeld == true) lock.release()
        }
    }

    @Suppress("DEPRECATION")
    private fun fromMdns(nsd: NsdManager, host: InetAddress, ipv4: String?, timeoutMs: Long): Int? {
        val found = LinkedBlockingQueue<NsdServiceInfo>()
        val listener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) = Unit
            override fun onDiscoveryStopped(serviceType: String) = Unit
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) = Unit
            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) = Unit
            override fun onServiceFound(info: NsdServiceInfo) {
                found.add(info)
            }
            override fun onServiceLost(info: NsdServiceInfo) = Unit
        }
        try {
            nsd.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
        } catch (e: RuntimeException) {
            Log.w(TAG, "discoverServices failed", e)
            return null
        }
        try {
            val deadline = System.currentTimeMillis() + timeoutMs
            while (true) {
                val left = deadline - System.currentTimeMillis()
                if (left <= 0) return null
                val info = found.poll(left, TimeUnit.MILLISECONDS) ?: return null
                val resolved = resolve(nsd, info) ?: continue
                if (!isOwn(resolved, ipv4)) continue
                if (isAdbTls(host, resolved.port)) return resolved.port
                Log.i(TAG, "mDNS gave port ${resolved.port}, which is not adbd (stale cache)")
            }
        } finally {
            runCatching { nsd.stopServiceDiscovery(listener) }
        }
    }

    @Suppress("DEPRECATION")
    private fun resolve(nsd: NsdManager, info: NsdServiceInfo): NsdServiceInfo? {
        val done = CountDownLatch(1)
        var result: NsdServiceInfo? = null
        try {
            nsd.resolveService(info, object : NsdManager.ResolveListener {
                override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) = done.countDown()
                override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                    result = serviceInfo
                    done.countDown()
                }
            })
        } catch (e: RuntimeException) {
            return null
        }
        done.await(2, TimeUnit.SECONDS)
        return result
    }

    @Suppress("DEPRECATION")
    private fun isOwn(info: NsdServiceInfo, ipv4: String?): Boolean {
        if (ipv4 == null) return true
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            info.hostAddresses.any { it is Inet4Address && it.hostAddress == ipv4 }
        } else {
            info.host?.hostAddress == ipv4
        }
    }

    private fun scan(host: InetAddress): Int? {
        val started = System.currentTimeMillis()
        val pool = Executors.newFixedThreadPool(SCAN_THREADS)
        try {
            for (range in SCAN_RANGES) {
                val chunks = range.chunked((range.count() + SCAN_THREADS - 1) / SCAN_THREADS)
                val open = pool.invokeAll(chunks.map { ports -> Callable { ports.filter { isOpen(host, it) } } }).flatMap { it.get() }
                val port = open.firstOrNull { isAdbTls(host, it) }
                Log.i(TAG, "scan $range: open=$open adb=$port (${System.currentTimeMillis() - started} ms)")
                if (port != null) return port
            }
        } finally {
            pool.shutdownNow()
        }
        return null
    }

    private fun isOpen(host: InetAddress, port: Int): Boolean = try {
        Socket().use { it.connect(InetSocketAddress(host, port), 200) }
        true
    } catch (e: IOException) {
        false
    }

    fun isAdbTls(host: InetAddress, port: Int): Boolean = try {
        Socket().use { s ->
            s.connect(InetSocketAddress(host, port), 300)
            s.soTimeout = 700
            s.getOutputStream().apply {
                write(cnxnPacket())
                flush()
            }
            val header = ByteArray(24)
            var read = 0
            val input = s.getInputStream()
            while (read < header.size) {
                val n = input.read(header, read, header.size - read)
                if (n < 0) return false
                read += n
            }
            ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN).int == A_STLS
        }
    } catch (e: IOException) {
        false
    }

    /** A host CNXN message (protocol version 0x01000001, so the checksum field is informational). */
    private fun cnxnPacket(): ByteArray {
        val payload = "host::\u0000".toByteArray()
        return ByteBuffer.allocate(24 + payload.size).order(ByteOrder.LITTLE_ENDIAN)
            .putInt(A_CNXN)
            .putInt(0x01000001)
            .putInt(256 * 1024)
            .putInt(payload.size)
            .putInt(payload.sumOf { it.toInt() and 0xff })
            .putInt(A_CNXN.inv())
            .put(payload)
            .array()
    }
}
