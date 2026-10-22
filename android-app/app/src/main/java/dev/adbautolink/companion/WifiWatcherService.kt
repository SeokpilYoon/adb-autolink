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
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * Foreground service that enables Wireless debugging when a whitelisted Wi-Fi is connected.
 *
 * Android trusts wireless debugging per BSSID: on an untrusted AP (new network, mesh/band roam)
 * adbd shows a confirmation dialog and resets adb_wifi_enabled to 0. So we act once per
 * (SSID, BSSID): write 1, verify a few seconds later, and if reverted ask the user to approve
 * "Always allow on this network". A manual "off" (tile/app, [Prefs.userDisabled]) is respected
 * until the next network change; any other drop to 0 is retried once, then the user is alerted.
 */
class WifiWatcherService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private val evaluateRunnable = Runnable { evaluate() }
    private lateinit var prefs: Prefs
    private lateinit var monitor: WifiMonitor
    private lateinit var multicastLock: WifiManager.MulticastLock
    private lateinit var notifications: NotificationManager
    private var snapshot: WifiSnapshot? = null
    private var networkKey: String? = null
    private var state = State.IDLE
    private var retried = false
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
        multicastLock = getSystemService(WifiManager::class.java).createMulticastLock(TAG).apply { setReferenceCounted(false) }
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
        if (::multicastLock.isInitialized && multicastLock.isHeld) multicastLock.release()
        super.onDestroy()
    }

    private fun schedule(delayMs: Long) {
        handler.removeCallbacks(evaluateRunnable)
        handler.postDelayed(evaluateRunnable, delayMs)
    }

    private fun onAdbWifiChanged() {
        // A pending evaluation or the verify step will refresh the notification itself.
        if (state == State.VERIFYING || handler.hasCallbacks(evaluateRunnable)) return
        val ssid = snapshot?.ssid
        val dropped = state == State.DONE && !prefs.userDisabled && !AdbWifiController.isEnabled(this) &&
            ssid != null && ssid in prefs.whitelist && snapshot?.ipv4 != null
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
        val snap = snapshot
        val ssid = snap?.ssid
        val whitelisted = ssid != null && ssid in prefs.whitelist
        // Keeps mDNS (adb's _adb-tls-connect advertisement) responsive while the screen is off.
        if (whitelisted && !multicastLock.isHeld) multicastLock.acquire()
        if (!whitelisted && multicastLock.isHeld) multicastLock.release()

        val enabled = AdbWifiController.isEnabled(this)
        if (enabled) notifications.cancel(ALERT_ID)
        val text = when {
            !AdbWifiController.hasPermission(this) -> getString(R.string.status_no_permission)
            snap == null -> getString(R.string.status_no_wifi)
            ssid == null -> getString(R.string.status_ssid_hidden)
            !whitelisted -> getString(R.string.status_not_whitelisted, ssid)
            snap.ipv4 == null -> getString(R.string.status_waiting_ip, ssid)
            enabled -> {
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
    }
}
