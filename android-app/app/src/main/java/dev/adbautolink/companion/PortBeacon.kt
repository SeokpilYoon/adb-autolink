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
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Tells the PC the current Wireless debugging port over plain TCP on [PORT].
 *
 * Android picks a new random connect port each time Wireless debugging turns on, and the PC's only
 * other way to learn it, mDNS, is often blocked (Windows firewall on Public networks, routers that
 * filter multicast). Protocol, shared with mcp-server/src/beacon.ts:
 *
 *   PC    -> "ADBAL1 <token>\n"
 *   phone -> "ADBAL1 serial=<ro.serialno> port=<port, 0 if unknown> adb=<on|off>[ nonce=<hex>]\n"
 *   PC    -> "ADBAL1W <hex HMAC-SHA256(wake key, "wake <nonce> <serial>")>\n"     (new connection)
 *   phone -> the status line, after [onWake]
 *
 * Requests without a token handed over by a PC at setup get no answer at all. The token travels in the
 * clear, so it reveals only the port: turning Wireless debugging on takes the wake key, which is never
 * sent over the network, and a nonce that works once.
 */
class PortBeacon(
    private val tokens: () -> Set<String>,
    /** Keys that may turn Wireless debugging on right now; empty when there is nothing to offer. */
    private val wakeKeys: () -> Set<String>,
    private val serial: () -> String?,
    private val reply: () -> String?,
    private val onWake: () -> Unit,
) {
    private class Nonce(val value: String, val expiresAt: Long)

    // The single accept thread is the only user.
    private var nonce: Nonce? = null
    private val random = SecureRandom()

    private var server: ServerSocket? = null
    private var boundTo: String? = null

    /** Listens on the Wi-Fi address only, so the beacon is never reachable over mobile data. */
    fun start(ipv4: String) {
        if (boundTo == ipv4 && server?.isClosed == false) return
        stop()
        try {
            val s = ServerSocket().apply {
                reuseAddress = true
                bind(InetSocketAddress(InetAddress.getByName(ipv4), PORT), 8)
            }
            server = s
            boundTo = ipv4
            Thread({ acceptLoop(s) }, TAG).apply { isDaemon = true }.start()
        } catch (e: IOException) {
            Log.w(TAG, "could not listen on $ipv4:$PORT", e)
        }
    }

    fun stop() {
        runCatching { server?.close() }
        server = null
        boundTo = null
    }

    private fun acceptLoop(s: ServerSocket) {
        while (!s.isClosed) {
            val client = try {
                s.accept()
            } catch (e: IOException) {
                return // closed by stop()
            }
            runCatching { answer(client) }.onFailure { Log.d(TAG, "request failed", it) }
        }
    }

    private fun answer(client: Socket) {
        client.use { c ->
            c.soTimeout = 2_000
            val line = readLine(c) ?: return
            val text = when {
                line.startsWith("$WAKE ") -> if (wake(line.removePrefix("$WAKE ").trim())) reply() else null
                line.startsWith("$MAGIC ") -> status(line.removePrefix("$MAGIC ").trim())
                else -> null
            } ?: return
            val out = c.getOutputStream()
            out.write("$text\n".toByteArray())
            out.flush()
        }
    }

    private fun status(token: String): String? {
        val bytes = token.toByteArray()
        if (tokens().none { MessageDigest.isEqual(it.toByteArray(), bytes) }) return null
        val text = reply() ?: return null
        if (wakeKeys().isEmpty()) return text
        val hex = ByteArray(16).also(random::nextBytes).toHex()
        nonce = Nonce(hex, SystemClock.elapsedRealtime() + NONCE_TTL_MS)
        return "$text nonce=$hex"
    }

    private fun wake(proof: String): Boolean {
        val current = nonce ?: return false
        nonce = null // one attempt per nonce, right or wrong
        if (SystemClock.elapsedRealtime() > current.expiresAt) return false
        val id = serial() ?: return false
        val message = "wake ${current.value} $id".toByteArray()
        val expected = proof.toByteArray()
        if (wakeKeys().none { MessageDigest.isEqual(hmac(it, message).toByteArray(), expected) }) return false
        onWake()
        return true
    }

    private fun hmac(key: String, message: ByteArray): String =
        Mac.getInstance(HMAC).run {
            init(SecretKeySpec(key.toByteArray(), HMAC))
            doFinal(message).toHex()
        }

    private fun ByteArray.toHex() = joinToString("") { "%02x".format(it) }

    /** One short line; anything longer than a request can be is dropped. */
    private fun readLine(c: Socket): String? {
        val input = c.getInputStream()
        val buf = StringBuilder()
        while (buf.length < 128) {
            val b = input.read()
            if (b < 0 || b == '\n'.code) return buf.toString()
            buf.append(b.toChar())
        }
        return null
    }

    companion object {
        private const val TAG = "PortBeacon"
        private const val MAGIC = "ADBAL1"
        private const val WAKE = "ADBAL1W"
        private const val HMAC = "HmacSHA256"
        private const val NONCE_TTL_MS = 15_000L
        const val PORT = 47383
    }
}
