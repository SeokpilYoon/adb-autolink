package dev.adbautolink.companion

import android.content.Context
import androidx.core.content.edit

class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("prefs", Context.MODE_PRIVATE)

    /** Wireless debugging follows the Wi-Fi unless the user paused auto-connect, once a Wi-Fi is whitelisted. */
    val autoEnabled: Boolean get() = !paused && whitelist.isNotEmpty()

    /** A set-up PC may turn Wireless debugging on over the network: on a whitelisted Wi-Fi, also while paused. */
    val wakeReady: Boolean get() = remoteWake && wakeKeys.isNotEmpty()

    /** The background service has something to do: following the Wi-Fi, or waiting for a PC on it. */
    val serviceNeeded: Boolean get() = whitelist.isNotEmpty() && (!paused || wakeReady)

    /** The "Auto-connect" main switch (app and Quick Settings tile) is off. Keeps the whitelist. */
    var paused: Boolean
        get() = sp.getBoolean(KEY_PAUSED, false)
        set(value) = sp.edit { putBoolean(KEY_PAUSED, value) }

    /** Whitelisted SSIDs, stored without surrounding quotes. */
    var whitelist: Set<String>
        get() = sp.getStringSet(KEY_WHITELIST, null)?.toSet() ?: emptySet()
        set(value) = sp.edit { putStringSet(KEY_WHITELIST, value) }

    /** True when the user turned Wireless debugging OFF via tile/app; cleared on turn-on or network change. */
    var userDisabled: Boolean
        get() = sp.getBoolean(KEY_USER_OFF, false)
        set(value) = sp.edit { putBoolean(KEY_USER_OFF, value) }

    /** Last SSID offered in the "allow this Wi-Fi?" notification, so each network is suggested only once. */
    var suggestedSsid: String?
        get() = sp.getString(KEY_SUGGESTED, null)
        set(value) = sp.edit { putString(KEY_SUGGESTED, value) }

    /** Keys shared with set-up PCs (install_companion_app), one per PC. Never leave the phone. */
    var wakeKeys: Set<String>
        get() = sp.getStringSet(KEY_WAKE_KEYS, null)?.toSet() ?: emptySet()
        set(value) = sp.edit { putStringSet(KEY_WAKE_KEYS, value) }

    /** The user's "let my PC turn this on" setting. */
    var remoteWake: Boolean
        get() = sp.getBoolean(KEY_REMOTE_WAKE, true)
        set(value) = sp.edit { putBoolean(KEY_REMOTE_WAKE, value) }

    /** No PC is trusted any more. Also drops the token older versions kept. */
    fun forgetPcs() = sp.edit {
        remove(KEY_WAKE_KEYS)
        remove(KEY_BEACON_TOKENS)
    }

    /** ro.serialno from the PC setup (apps cannot read it themselves), echoed in beacon replies. */
    var deviceSerial: String?
        get() = sp.getString(KEY_SERIAL, null)
        set(value) = sp.edit { putString(KEY_SERIAL, value) }

    private companion object {
        const val KEY_USER_OFF = "user_disabled"
        const val KEY_WHITELIST = "whitelist"
        const val KEY_SUGGESTED = "suggested_ssid"
        const val KEY_BEACON_TOKENS = "beacon_tokens"
        const val KEY_WAKE_KEYS = "wake_keys"
        const val KEY_REMOTE_WAKE = "remote_wake"
        const val KEY_SERIAL = "device_serial"
        const val KEY_PAUSED = "paused"
    }
}
