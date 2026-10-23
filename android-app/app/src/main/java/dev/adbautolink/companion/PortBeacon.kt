package dev.adbautolink.companion

import android.util.Log
import java.io.IOException
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.security.MessageDigest

/**
 * Tells the PC the current Wireless debugging port over plain TCP on [PORT].
 *
 * Android picks a new random connect port each time Wireless debugging turns on, and the PC's only
 * other way to learn it, mDNS, is often blocked (Windows firewall on Public networks, routers that
 * filter multicast). Protocol, shared with mcp-server/src/beacon.ts:
 *
 *   PC    -> "ADBAL1 <token>\n"
 *   phone -> "ADBAL1 serial=<ro.serialno> port=<port, 0 if unknown> adb=<on|off>\n"
 *
 * Requests without a token handed over by a PC at setup get no answer at all.
 */
class PortBeacon(private val tokens: () -> Set<String>, private val reply: () -> String?) {
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
            if (!line.startsWith("$MAGIC ")) return
            val token = line.removePrefix("$MAGIC ").trim().toByteArray()
            if (tokens().none { MessageDigest.isEqual(it.toByteArray(), token) }) return
            val text = reply() ?: return
            val out = c.getOutputStream()
            out.write("$text\n".toByteArray())
            out.flush()
        }
    }

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
        const val PORT = 47383
    }
}
