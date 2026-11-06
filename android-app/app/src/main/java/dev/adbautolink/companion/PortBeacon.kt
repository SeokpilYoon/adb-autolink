package dev.adbautolink.companion

import android.os.SystemClock
import android.util.Log
import java.io.IOException
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Tells a set-up PC the current Wireless debugging port over plain TCP on [PORT], and lets it turn
 * Wireless debugging on.
 *
 * Android picks a new random connect port each time Wireless debugging turns on, and the PC's only
 * other way to learn it, mDNS, is often blocked (Windows firewall on Public networks, routers that
 * filter multicast). Protocol, shared with mcp-server/src/beacon.ts:
 *
 *   PC    -> "ADBAL2 <cn> <mac(hello, cn)>"
 *   phone -> "ADBAL2 <sn>"
 *   PC    -> "<status|wake> <mac(cmd, cn, sn)>"
 *   phone -> "ADBAL2 serial=<ro.serialno> port=<port, 0 if unknown> adb=<on|off> mac=<mac(reply, cmd, cn, sn, line)>"
 *
 * [mac] is HMAC-SHA256 of its "|"-joined parts, with a key handed over by adb at setup that never
 * travels over the network. Each side proves it holds the key: anyone else gets no answer at all, and a
 * PC never believes a reply that does not prove it came from its phone. Nonces belong to one connection.
 */
class PortBeacon(
    /** Keys of the set-up PCs. */
    private val keys: () -> Set<String>,
    private val canWake: () -> Boolean,
    /** "ADBAL2 serial=... port=... adb=..." */
    private val status: () -> String?,
    private val onWake: () -> Unit,
) {
    private var server: ServerSocket? = null
    private var boundTo: String? = null
    /** Clients being served, per address: one noisy host must not take every slot. */
    private val active = ConcurrentHashMap<InetAddress, Int>()
    private val random = SecureRandom()

    /** Listens on the Wi-Fi address only, so the beacon is never reachable over mobile data. False if the port is taken. */
    fun start(ipv4: String): Boolean {
        if (boundTo == ipv4 && server?.isClosed == false) return true
        stop()
        return try {
            val s = ServerSocket().apply {
                reuseAddress = true
                bind(InetSocketAddress(InetAddress.getByName(ipv4), PORT), 8)
            }
            server = s
            boundTo = ipv4
            Thread({ acceptLoop(s) }, TAG).apply { isDaemon = true }.start()
            true
        } catch (e: IOException) {
            Log.w(TAG, "could not listen on $ipv4:$PORT", e)
            false
        }
    }

    fun stop() {
        runCatching { server?.close() }
        server = null
        boundTo = null
    }

    /** Each client gets its own short-lived thread, so a stalled one cannot silence the beacon for the others. */
    private fun acceptLoop(s: ServerSocket) {
        while (!s.isClosed) {
            val client = try {
                s.accept()
            } catch (e: IOException) {
                return // closed by stop()
            }
            val from = client.inetAddress
            if (active.values.sum() >= MAX_CLIENTS || (active[from] ?: 0) >= MAX_PER_HOST) {
                runCatching { client.close() }
                continue
            }
            active.merge(from, 1, Int::plus)
            Thread({
                try {
                    runCatching { answer(client) }.onFailure { Log.d(TAG, "request failed", it) }
                } finally {
                    active.compute(from) { _, n -> if (n == null || n <= 1) null else n - 1 }
                }
            }, TAG).apply { isDaemon = true }.start()
        }
    }

    private fun answer(client: Socket) {
        client.use { c ->
            val deadline = SystemClock.elapsedRealtime() + CLIENT_MS
            val hello = readLine(c, deadline)?.split(" ") ?: return
            if (hello.size != 3 || hello[0] != MAGIC) return
            val cn = hello[1]
            if (!NONCE.matches(cn)) return
            val key = keys().firstOrNull { same(mac(it, "hello", cn), hello[2]) } ?: return

            val sn = ByteArray(16).also(random::nextBytes).toHex()
            send(c, "$MAGIC $sn")
            val request = readLine(c, deadline)?.split(" ") ?: return
            if (request.size != 2) return
            val cmd = request[0]
            if ((cmd != "status" && cmd != "wake") || !same(mac(key, cmd, cn, sn), request[1])) return
            if (cmd == "wake") {
                if (!canWake()) return
                onWake()
            }
            val line = status() ?: return
            send(c, "$line mac=${mac(key, "reply", cmd, cn, sn, line)}")
        }
    }

    private fun send(c: Socket, line: String) {
        val out = c.getOutputStream()
        out.write("$line\n".toByteArray())
        out.flush()
    }

    /** One short line, within the client's overall deadline; anything longer than a request can be is dropped. */
    private fun readLine(c: Socket, deadline: Long): String? {
        val input = c.getInputStream()
        val buf = StringBuilder()
        while (buf.length < 128) {
            val left = deadline - SystemClock.elapsedRealtime()
            if (left <= 0) return null
            c.soTimeout = left.toInt()
            val b = input.read()
            if (b < 0) return null
            if (b == '\n'.code) return buf.toString().trim()
            buf.append(b.toChar())
        }
        return null
    }

    companion object {
        private const val TAG = "PortBeacon"
        private const val MAGIC = "ADBAL2"
        private const val HMAC = "HmacSHA256"
        private const val MAX_CLIENTS = 8
        private const val MAX_PER_HOST = 2
        private const val CLIENT_MS = 3_000L
        private val NONCE = Regex("[0-9a-f]{32}")
        const val PORT = 47383

        private fun same(a: String, b: String) = MessageDigest.isEqual(a.toByteArray(), b.toByteArray())

        private fun ByteArray.toHex() = joinToString("") { "%02x".format(it) }

        /** HMAC-SHA256 of the "|"-joined parts, as hex. */
        fun mac(key: String, vararg parts: String): String =
            Mac.getInstance(HMAC).run {
                init(SecretKeySpec(key.toByteArray(), HMAC))
                doFinal(parts.joinToString("|").toByteArray()).toHex()
            }
    }
}
