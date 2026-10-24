package dev.adbautolink.companion

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.database.ContentObserver
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import java.util.concurrent.Executors

/**
 * Foreground service that enables Wireless debugging when a whitelisted Wi-Fi is connected.
 *
 * Android trusts wireless debugging per BSSID: on an untrusted AP (new network, mesh/band roam)
 * adbd shows a confirmation dialog and resets adb_wifi_enabled to 0. So we act once per
 * (SSID, BSSID): write 1, verify a few seconds later, and if reverted ask the user to approve
 * "Always allow on this network". A manual "off" (tile/app, [Prefs.userDisabled]) is respected
 * until the next network change; any other drop to 0 is retried once (again after a minute of working),
 * then the user is alerted.
 */
class WifiWatcherService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private val evaluateRunnable = Runnable { evaluate() }
    private lateinit var prefs: Prefs
    private lateinit var monitor: WifiMonitor
    private lateinit var notifications: NotificationManager
    private var snapshot: WifiSnapshot? = null
    private var networkKey: String? = null
    private var state = State.IDLE
    private var retried = false
    /** elapsedRealtime when Wireless debugging was last seen on (0 = not since the last drop). */
    private var enabledSince = 0L
    /** Current Wireless debugging port, found by [AdbPortLocator]; read by the beacon thread. */
    @Volatile private var adbPort: Int? = null
    private val locator = Executors.newSingleThreadExecutor()
    /** Bumped whenever Wireless debugging restarts, so a search started before it cannot report a stale port. */
    private var locateGeneration = 0
    private var locating = false
    private var locateAttempts = 0
    /** Last confirmed port: Wireless debugging sometimes comes back on the same one, which is the cheapest check. */
    private var lastAdbPort: Int? = null
    private val beacon = PortBeacon(tokens = { prefs.beaconTokens }, reply = ::beaconReply)
    private val adbObserver = object : ContentObserver(handler) {
        override fun onChange(selfChange: Boolean) = onAdbWifiChanged()
    }

    private enum class State { IDLE, VERIFYING, DONE }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        prefs = Prefs(this)
        notifications = getSystemService(NotificationManager::class.java)
        notifications.createNotificationChannels(
            listOf(
                NotificationChannel(CHANNEL_STATUS, getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW),
                NotificationChannel(CHANNEL_ALERT, getString(R.string.channel_alert_name), NotificationManager.IMPORTANCE_DEFAULT),
            )
        )
        ServiceCompat.startForeground(
            this, STATUS_ID, statusNotification(getString(R.string.status_watching)),
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0,
        )
        monitor = WifiMonitor(this) { snap ->
            if (snap == snapshot) return@WifiMonitor // e.g. signal-strength-only capability change
            snapshot = snap
            val key = snap?.let { "${it.ssid}|${it.bssid}" }
            if (key != networkKey) {
                if (networkKey != null) prefs.userDisabled = false
                networkKey = key
                state = State.IDLE
                retried = false
            }
            if (state != State.VERIFYING) schedule(DEBOUNCE_MS) // don't cut the verify delay short
        }
        monitor.start()
        contentResolver.registerContentObserver(AdbWifiController.enabledUri, false, adbObserver)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!prefs.autoEnabled) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (state != State.VERIFYING) schedule(DEBOUNCE_MS)
        return START_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacks(evaluateRunnable)
        contentResolver.unregisterContentObserver(adbObserver)
        // Fields may be uninitialized if startForeground threw in onCreate.
        if (::monitor.isInitialized) monitor.stop()
        locator.shutdownNow()
        beacon.stop()
        // A notify() racing with the stop would otherwise outlive the service.
        if (::notifications.isInitialized) notifications.cancel(STATUS_ID)
        super.onDestroy()
    }

    private fun schedule(delayMs: Long) {
        handler.removeCallbacks(evaluateRunnable)
        handler.postDelayed(evaluateRunnable, delayMs)
    }

    private fun onAdbWifiChanged() {
        // Switching auto-connect off turns Wireless debugging off just before this service stops:
        // that drop is intended, not a reset to retry.
        if (!prefs.autoEnabled) {
            stopSelf()
            return
        }
        // Every restart of Wireless debugging picks a new port: forget the old one, evaluate() looks again.
        adbPort = null
        locateGeneration++
        locateAttempts = 0
        // A pending evaluation or the verify step will refresh the notification itself.
        if (state == State.VERIFYING || handler.hasCallbacks(evaluateRunnable)) return
        val ssid = snapshot?.ssid
        val dropped = state == State.DONE && !prefs.userDisabled && !AdbWifiController.isEnabled(this) &&
            ssid != null && ssid in prefs.whitelist && snapshot?.ipv4 != null
        // The single retry guards against a pending approval prompt resetting it at once. A drop after a
        // stretch of working fine is a new event (e.g. the system restarted adbd), so it gets a retry again.
        if (dropped && retried && enabledSince != 0L && SystemClock.elapsedRealtime() - enabledSince > STABLE_MS) retried = false
        enabledSince = 0L
        if (dropped && !retried) {
            retried = true
            state = State.IDLE
            schedule(RETRY_MS)
            notifications.notify(STATUS_ID, statusNotification(getString(R.string.status_reset_retrying, ssid)))
            return
        }
        if (dropped) alertApprovalNeeded(ssid)
        evaluate()
    }

    private fun evaluate() {
        if (!prefs.autoEnabled) {
            stopSelf()
            return
        }
        val snap = snapshot
        val ssid = snap?.ssid
        val whitelisted = ssid != null && ssid in prefs.whitelist

        val enabled = AdbWifiController.isEnabled(this)
        if (enabled) notifications.cancel(ALERT_ID)
        updateBeacon(if (whitelisted) snap?.ipv4 else null, enabled)
        val text = when {
            !AdbWifiController.hasPermission(this) -> getString(R.string.status_no_permission)
            snap == null -> getString(R.string.status_no_wifi)
            ssid == null -> getString(R.string.status_ssid_hidden)
            !whitelisted -> {
                if (enabled) WhitelistSuggestion.maybeSuggest(this, ssid)
                getString(R.string.status_not_whitelisted, ssid)
            }
            snap.ipv4 == null -> getString(R.string.status_waiting_ip, ssid)
            enabled -> {
                if (enabledSince == 0L) enabledSince = SystemClock.elapsedRealtime()
                state = State.DONE
                getString(R.string.status_on, ssid)
            }
            prefs.userDisabled -> getString(R.string.status_off_manual, ssid)
            state == State.IDLE -> enable(ssid)
            state == State.VERIFYING -> {
                state = State.DONE
                alertApprovalNeeded(ssid)
                getString(R.string.status_waiting_approval, ssid)
            }
            else -> getString(R.string.status_off, ssid)
        }
        notifications.notify(STATUS_ID, statusNotification(text))
    }

    /** Serve the port beacon on whitelisted Wi-Fi once a PC has set it up, and keep the port it reports current. */
    private fun updateBeacon(ipv4: String?, enabled: Boolean) {
        if (ipv4 == null || prefs.beaconTokens.isEmpty()) {
            beacon.stop()
            return
        }
        beacon.start(ipv4)
        if (!enabled) adbPort = null else if (adbPort == null) locatePort(ipv4)
    }

    /** adbd opens its port a moment after the setting flips, so an empty search is retried a few times. */
    private fun locatePort(ipv4: String) {
        if (locating || locateAttempts >= MAX_LOCATE_ATTEMPTS) return
        locating = true
        val attempt = ++locateAttempts
        val generation = locateGeneration
        val lastPort = lastAdbPort
        locator.execute {
            // The slow full scan only as the last resort, once the cheap candidates kept failing.
            val port = AdbPortLocator.find(this, ipv4, lastPort, allowScan = attempt == MAX_LOCATE_ATTEMPTS)
            handler.post {
                locating = false
                if (generation != locateGeneration) return@post // Wireless debugging restarted meanwhile
                if (port != null) {
                    adbPort = port
                    lastAdbPort = port
                }
                else handler.postDelayed({ if (generation == locateGeneration && adbPort == null) evaluate() }, LOCATE_RETRY_MS)
            }
        }
    }

    private fun beaconReply(): String? {
        val serial = prefs.deviceSerial ?: return null
        val on = AdbWifiController.isEnabled(this)
        return "ADBAL1 serial=$serial port=${if (on) adbPort ?: 0 else 0} adb=${if (on) "on" else "off"}"
    }

    private fun enable(ssid: String): String {
        AdbWifiController.setEnabled(this, true)?.let { return it }
        Log.i(TAG, "Enabled wireless debugging on $ssid / ${snapshot?.bssid}")
        state = State.VERIFYING
        schedule(VERIFY_MS)
        return getString(R.string.status_enabling, ssid)
    }

    private fun alertApprovalNeeded(ssid: String) {
        val open = PendingIntent.getActivity(
            this, 1, AdbWifiController.wirelessDebuggingSettingsIntent(this), PendingIntent.FLAG_IMMUTABLE
        )
        notifications.notify(
            ALERT_ID,
            NotificationCompat.Builder(this, CHANNEL_ALERT)
                .setSmallIcon(R.drawable.ic_tile)
                .setContentTitle(getString(R.string.alert_title, ssid))
                .setContentText(getString(R.string.alert_text))
                .setStyle(NotificationCompat.BigTextStyle().bigText(getString(R.string.alert_big_text)))
                .setContentIntent(open)
                .setAutoCancel(true)
                .build(),
        )
    }

    private fun statusNotification(text: String): Notification {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_STATUS)
            .setSmallIcon(R.drawable.ic_tile)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(text)
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    companion object {
        private const val TAG = "WifiWatcherService"
        private const val CHANNEL_STATUS = "watcher"
        private const val CHANNEL_ALERT = "approval"
        private const val STATUS_ID = 1
        private const val ALERT_ID = 2
        private const val DEBOUNCE_MS = 1_500L
        private const val VERIFY_MS = 3_000L
        private const val RETRY_MS = 2_000L
        private const val STABLE_MS = 60_000L
        private const val LOCATE_RETRY_MS = 2_000L
        private const val MAX_LOCATE_ATTEMPTS = 5

        /** Returns false if the system refused to start the service (e.g. background FGS limits). */
        fun start(context: Context): Boolean = try {
            ContextCompat.startForegroundService(context, Intent(context, WifiWatcherService::class.java))
            true
        } catch (e: IllegalStateException) {
            // ForegroundServiceStartNotAllowedException (API 31+) extends IllegalStateException.
            Log.w(TAG, "Could not start watcher service", e)
            false
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, WifiWatcherService::class.java))
        }

        /** Starts or stops background watching to match [Prefs.autoEnabled] (a non-empty whitelist). */
        fun sync(context: Context) {
            if (Prefs(context).autoEnabled) {
                WifiTriggerReceiver.register(context)
                start(context)
            } else {
                WifiTriggerReceiver.unregister(context)
                stop(context)
            }
        }
    }
}
