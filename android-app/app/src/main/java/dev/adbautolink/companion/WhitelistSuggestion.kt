package dev.adbautolink.companion

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat

/**
 * "Allow this Wi-Fi?" notification, posted when Wireless debugging is turned on by hand on a
 * network that is not whitelisted yet. Each SSID is offered once; [AddWifiReceiver] handles the action.
 */
object WhitelistSuggestion {
    private const val CHANNEL = "suggest"
    private const val NOTIFICATION_ID = 3
    const val EXTRA_SSID = "ssid"

    fun maybeSuggest(context: Context, ssid: String) {
        val prefs = Prefs(context)
        if (ssid in prefs.whitelist || ssid == prefs.suggestedSsid) return
        prefs.suggestedSsid = ssid

        val notifications = context.getSystemService(NotificationManager::class.java)
        notifications.createNotificationChannel(
            NotificationChannel(CHANNEL, context.getString(R.string.channel_suggest_name), NotificationManager.IMPORTANCE_DEFAULT)
        )
        val allow = PendingIntent.getBroadcast(
            context, 0,
            Intent(context, AddWifiReceiver::class.java).putExtra(EXTRA_SSID, ssid),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val open = PendingIntent.getActivity(
            context, 2, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE
        )
        notifications.notify(
            NOTIFICATION_ID,
            NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_tile)
                .setContentTitle(context.getString(R.string.suggest_title, ssid))
                .setContentText(context.getString(R.string.suggest_text))
                .setStyle(NotificationCompat.BigTextStyle().bigText(context.getString(R.string.suggest_text)))
                .setContentIntent(open)
                .addAction(0, context.getString(R.string.suggest_action), allow)
                .setAutoCancel(true)
                .build(),
        )
    }

    fun cancel(context: Context) {
        context.getSystemService(NotificationManager::class.java).cancel(NOTIFICATION_ID)
    }
}

/** Notification action target (not exported): whitelists the suggested SSID. */
class AddWifiReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        intent.getStringExtra(WhitelistSuggestion.EXTRA_SSID)?.let { Whitelist.add(context, it) }
    }
}
