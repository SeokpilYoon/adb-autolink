package dev.adbautolink.companion

import android.content.Context
import androidx.core.content.edit

class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("prefs", Context.MODE_PRIVATE)

    var autoEnabled: Boolean
        get() = sp.getBoolean(KEY_AUTO, false)
        set(value) = sp.edit { putBoolean(KEY_AUTO, value) }

    /** Whitelisted SSIDs, stored without surrounding quotes. */
    var whitelist: Set<String>
        get() = sp.getStringSet(KEY_WHITELIST, null)?.toSet() ?: emptySet()
        set(value) = sp.edit { putStringSet(KEY_WHITELIST, value) }

    /** True when the user turned Wireless debugging OFF via tile/app; cleared on turn-on or network change. */
    var userDisabled: Boolean
        get() = sp.getBoolean(KEY_USER_OFF, false)
        set(value) = sp.edit { putBoolean(KEY_USER_OFF, value) }

    private companion object {
        const val KEY_AUTO = "auto_enabled"
        const val KEY_USER_OFF = "user_disabled"
        const val KEY_WHITELIST = "whitelist"
    }
}
