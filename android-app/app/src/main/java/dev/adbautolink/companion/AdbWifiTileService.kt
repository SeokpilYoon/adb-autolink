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
        // Don't let a locked phone enable wireless debugging from the shade.
        if (isLocked) unlockAndRun { toggle() } else toggle()
    }

    private fun toggle() {
        if (!AdbWifiController.hasPermission(this)) {
            openApp()
            return
        }
        AdbWifiController.setEnabledByUser(this, !AdbWifiController.isEnabled(this))
            ?.let { Toast.makeText(this, it, Toast.LENGTH_LONG).show() }
        refresh()
    }

    private fun refresh() {
        val tile = qsTile ?: return
        val on = AdbWifiController.isEnabled(this)
        tile.state = if (on) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        tile.subtitle = when {
            !AdbWifiController.hasPermission(this) -> "Setup needed"
            on -> "On"
            else -> "Off"
        }
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
