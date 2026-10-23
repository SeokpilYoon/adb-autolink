package dev.adbautolink.companion

import android.content.Context
import androidx.core.content.edit

class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("prefs", Context.MODE_PRIVATE)

    /** Auto mode has no switch of its own: it is on while at least one Wi-Fi is whitelisted. */
    val autoEnabled: Boolean get() = whitelist.isNotEmpty()

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

    /** Port-beacon tokens handed over by PCs at setup (install_companion_app), one per PC. */
    var beaconTokens: Set<String>
        get() = sp.getStringSet(KEY_BEACON_TOKENS, null)?.toSet() ?: emptySet()
        set(value) = sp.edit { putStringSet(KEY_BEACON_TOKENS, value) }

    /** ro.serialno from the PC setup (apps cannot read it themselves), echoed in beacon replies. */
    var deviceSerial: String?
        get() = sp.getString(KEY_SERIAL, null)
        set(value) = sp.edit { putString(KEY_SERIAL, value) }

    private companion object {
        const val KEY_USER_OFF = "user_disabled"
        const val KEY_WHITELIST = "whitelist"
        const val KEY_SUGGESTED = "suggested_ssid"
        const val KEY_BEACON_TOKENS = "beacon_tokens"
        const val KEY_SERIAL = "device_serial"
    }
}
