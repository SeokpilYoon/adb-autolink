package dev.adbautolink.companion

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Intent
import android.database.ContentObserver
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.widget.Toast

/**
 * Quick Settings tile for the "Auto-connect" main switch: the fastest way to stop everything when the
 * phone is not being used for development, and to bring it back. Long-press opens the app.
 */
class AdbWifiTileService : TileService() {
    private val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
        override fun onChange(selfChange: Boolean) = refresh()
    }

    override fun onStartListening() {
        contentResolver.registerContentObserver(AdbWifiController.enabledUri, false, observer)
        refresh()
    }

    override fun onStopListening() {
        contentResolver.unregisterContentObserver(observer)
    }

    override fun onClick() {
        if (!AdbWifiController.hasPermission(this)) {
            openApp()
            return
        }
        // Turning off is always safe; turning on may enable Wireless debugging, so not from a locked phone.
        if (AutoConnect.isOn(this)) toggle(on = false)
        else if (isLocked) unlockAndRun { toggle(on = true) } else toggle(on = true)
    }

    private fun toggle(on: Boolean) {
        AutoConnect.set(this, on)?.let { Toast.makeText(this, it, Toast.LENGTH_LONG).show() }
        refresh()
    }

    private fun refresh() {
        val tile = qsTile ?: return
        val on = AutoConnect.isOn(this)
        tile.state = if (on) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        tile.subtitle = getString(
            when {
                !AdbWifiController.hasPermission(this) -> R.string.tile_setup_needed
                !on -> R.string.tile_off
                AdbWifiController.isEnabled(this) -> R.string.tile_ready
                else -> R.string.tile_waiting
            }
        )
        tile.updateTile()
    }

    @SuppressLint("StartActivityAndCollapseDeprecated")
    private fun openApp() {
        val intent = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startActivityAndCollapse(PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE))
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(intent)
        }
    }
}
