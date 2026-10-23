package dev.adbautolink.companion

import android.content.Context

/** Whitelist edits. Watching runs while the list is non-empty, so every change re-syncs the watcher. */
object Whitelist {
    fun add(context: Context, ssid: String) {
        val prefs = Prefs(context)
        prefs.whitelist = prefs.whitelist + ssid
        WhitelistSuggestion.cancel(context)
        WifiWatcherService.sync(context)
    }

    fun remove(context: Context, ssid: String) {
        val prefs = Prefs(context)
        prefs.whitelist = prefs.whitelist - ssid
        WifiWatcherService.sync(context)
    }
}
