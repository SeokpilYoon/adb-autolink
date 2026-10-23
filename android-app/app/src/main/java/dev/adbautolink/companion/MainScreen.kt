package dev.adbautolink.companion

import android.Manifest
import android.annotation.SuppressLint
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.database.ContentObserver
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleStartEffect
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

private data class Status(
    val secureSettings: Boolean,
    val fineLocation: Boolean,
    val backgroundLocation: Boolean,
    val locationOn: Boolean,
    val notifications: Boolean,
    val batteryUnrestricted: Boolean,
    val autoRevokeExempt: Boolean,
    val adbWifi: Boolean,
    val authTimeoutMs: Long,
) {
    /** install_companion_app grants all of these; anything false is shown as a fix. */
    val complete: Boolean
        get() = secureSettings && fineLocation && backgroundLocation && locationOn && notifications &&
            batteryUnrestricted && autoRevokeExempt
}

/** Link-style buttons sit flush with the text column instead of Material's inset. */
private val FlushLeft = PaddingValues(start = 0.dp, end = 12.dp, top = 8.dp, bottom = 8.dp)

/** What the hero panel says, in priority order. */
private enum class Link { SETUP, LINKED, OFF_ALLOWED, NOT_ALLOWED, NO_WIFI }

private fun Context.granted(permission: String) =
    checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

private fun readStatus(context: Context) = Status(
    secureSettings = AdbWifiController.hasPermission(context),
    fineLocation = context.granted(Manifest.permission.ACCESS_FINE_LOCATION),
    backgroundLocation = context.granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION),
    locationOn = context.getSystemService(LocationManager::class.java).isLocationEnabled,
    notifications = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
        context.granted(Manifest.permission.POST_NOTIFICATIONS),
    batteryUnrestricted = context.getSystemService(PowerManager::class.java)
        .isIgnoringBatteryOptimizations(context.packageName),
    autoRevokeExempt = context.packageManager.isAutoRevokeWhitelisted,
    adbWifi = AdbWifiController.isEnabled(context),
    authTimeoutMs = AdbWifiController.allowedConnectionTimeMs(context),
)

private fun Context.toastIfError(error: String?) {
    error?.let { Toast.makeText(this, it, Toast.LENGTH_LONG).show() }
}

private fun Context.packageIntent(action: String) = Intent(action, Uri.fromParts("package", packageName, null))

private fun Context.openAppDetails() = startActivity(packageIntent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS))

/** Opens a per-package settings screen, falling back to App info if the OEM lacks it. */
private fun Context.openPackageSetting(action: String) {
    runCatching { startActivity(packageIntent(action)) }.onFailure { openAppDetails() }
}

@Composable
fun MainScreen() {
    val context = LocalContext.current
    val colors = LocalAppColors.current
    val prefs = remember { Prefs(context) }
    var status by remember { mutableStateOf(readStatus(context)) }
    var wifi by remember { mutableStateOf<WifiSnapshot?>(null) }
    var port by remember { mutableStateOf<Int?>(null) }
    var whitelist by remember { mutableStateOf(prefs.whitelist) }
    var refreshKey by remember { mutableIntStateOf(0) }
    // The whitelist can also change from the PC setup or the suggestion notification.
    val refresh = {
        status = readStatus(context)
        whitelist = prefs.whitelist
    }

    // Refresh on resume, then slowly (location/battery can change from the shade without pausing us).
    val lifecycleOwner = LocalLifecycleOwner.current
    LaunchedEffect(Unit) {
        lifecycleOwner.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            while (true) {
                refresh()
                delay(5_000)
            }
        }
    }
    LifecycleStartEffect(Unit) {
        val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) = refresh()
        }
        context.contentResolver.registerContentObserver(AdbWifiController.enabledUri, false, observer)
        onStopOrDispose { context.contentResolver.unregisterContentObserver(observer) }
    }
    // Re-register after location permission changes so the SSID becomes visible.
    LifecycleStartEffect(status.fineLocation, status.locationOn) {
        val monitor = WifiMonitor(context) { wifi = it }
        monitor.start()
        onStopOrDispose {
            monitor.stop()
            wifi = null
        }
    }
    val ip = wifi?.ipv4
    LaunchedEffect(status.adbWifi, ip, refreshKey) {
        port = null
        // adbd opens its port a moment after the setting flips; look a few times before showing "retry".
        repeat(3) { attempt ->
            if (!status.adbWifi || ip == null) return@LaunchedEffect
            withContext(Dispatchers.IO) { AdbPortLocator.find(context, ip) }?.let {
                port = it
                return@LaunchedEffect
            }
            if (attempt < 2) delay(1_500)
        }
    }

    val ssid = wifi?.ssid
    val link = when {
        !status.complete -> Link.SETUP
        status.adbWifi && ip != null -> Link.LINKED
        wifi == null -> Link.NO_WIFI
        ssid != null && ssid in whitelist -> Link.OFF_ALLOWED
        else -> Link.NOT_ALLOWED
    }

    Scaffold(containerColor = colors.paper) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(32.dp),
        ) {
            Text(
                stringResource(R.string.app_name),
                fontFamily = AppType.wide,
                fontSize = 17.sp,
                color = colors.ink,
                modifier = Modifier.padding(top = 8.dp),
            )

            Hero(
                link = link,
                address = if (status.adbWifi) ip else null,
                port = port,
                ssid = ssid,
                ssidHidden = wifi != null && ssid == null,
                showAllow = ssid != null && ssid !in whitelist,
                onAllow = {
                    Whitelist.add(context, ssid!!)
                    refresh()
                },
                onRetryPort = { refreshKey++ },
            )

            if (!status.complete) SetupFixes(status, refresh)

            Column {
                Heading(stringResource(R.string.section_whitelist))
                Spacer(Modifier.height(8.dp))
                if (whitelist.isEmpty()) {
                    Text(stringResource(R.string.whitelist_empty), color = colors.muted)
                }
                whitelist.sorted().forEachIndexed { i, name ->
                    if (i > 0) HorizontalDivider(color = colors.line)
                    Row(Modifier.fillMaxWidth().heightIn(min = 60.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(name, fontFamily = AppType.text, fontSize = 17.sp, color = colors.ink)
                            if (name == ssid) {
                                Text(stringResource(R.string.section_current_network), fontSize = 13.sp, color = colors.linkedText)
                            }
                        }
                        TextButton(onClick = {
                            Whitelist.remove(context, name)
                            refresh()
                        }) { Text(stringResource(R.string.remove), color = colors.muted) }
                    }
                }
            }

            Advanced(status, refresh)
        }
    }
}

@Composable
private fun Heading(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleLarge,
        fontWeight = FontWeight.SemiBold,
        color = LocalAppColors.current.ink,
        modifier = Modifier.semantics { heading() },
    )
}

/** The one loud element: a panel colored by link state, led by the current port in large type. */
@Composable
private fun Hero(
    link: Link,
    address: String?,
    port: Int?,
    ssid: String?,
    ssidHidden: Boolean,
    showAllow: Boolean,
    onAllow: () -> Unit,
    onRetryPort: () -> Unit,
) {
    val c = LocalAppColors.current
    val (bgTarget, fgTarget) = when (link) {
        Link.LINKED -> c.linked to c.onLinked
        Link.SETUP, Link.OFF_ALLOWED -> c.attention to c.onAttention
        Link.NOT_ALLOWED, Link.NO_WIFI -> c.idle to c.onIdle
    }
    val bg by animateColorAsState(bgTarget, tween(450), label = "heroBg")
    val fg by animateColorAsState(fgTarget, tween(450), label = "heroFg")
    val title = stringResource(
        when (link) {
            Link.SETUP -> R.string.hero_setup
            Link.LINKED -> R.string.hero_linked
            Link.OFF_ALLOWED -> R.string.hero_off_allowed
            Link.NOT_ALLOWED -> R.string.hero_not_allowed
            Link.NO_WIFI -> R.string.hero_no_wifi
        }
    )

    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(28.dp))
            .background(bg)
            .padding(horizontal = 22.dp, vertical = 24.dp),
    ) {
        Text(title, fontSize = 17.sp, fontWeight = FontWeight.Medium, color = fg)
        when {
            address != null -> {
                Spacer(Modifier.height(28.dp))
                SelectionContainer {
                    Column {
                        Text(address, fontFamily = AppType.wide, fontSize = 22.sp, color = fg.copy(alpha = 0.78f))
                        Text(
                            ":${port ?: "·····"}",
                            fontFamily = AppType.wideHeavy,
                            fontSize = 64.sp,
                            lineHeight = 68.sp,
                            style = TextStyle(fontFeatureSettings = "tnum"), // digits don't shift as the port changes
                            maxLines = 1,
                            softWrap = false,
                            color = fg,
                        )
                    }
                }
                if (port == null) {
                    TextButton(onClick = onRetryPort, contentPadding = FlushLeft) {
                        Text(stringResource(R.string.retry_port_discovery), color = fg)
                    }
                }
                if (ssid != null) Text(ssid, fontFamily = AppType.text, fontSize = 16.sp, color = fg.copy(alpha = 0.85f))
            }
            ssid != null -> {
                Spacer(Modifier.height(20.dp))
                Text(ssid, fontFamily = AppType.wideHeavy, fontSize = 34.sp, lineHeight = 40.sp, color = fg)
            }
        }
        if (ssidHidden) {
            Spacer(Modifier.height(12.dp))
            Text(stringResource(R.string.ssid_hidden), fontSize = 14.sp, color = fg)
        }
        if (link == Link.OFF_ALLOWED) {
            Spacer(Modifier.height(12.dp))
            Text(stringResource(R.string.first_time_approval_hint), fontSize = 14.sp, lineHeight = 20.sp, color = fg.copy(alpha = 0.85f))
        }
        if (showAllow) {
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = onAllow,
                colors = ButtonDefaults.buttonColors(containerColor = fg, contentColor = bg),
            ) { Text(stringResource(R.string.add_to_whitelist), fontWeight = FontWeight.SemiBold) }
        }
    }
}

/** Only what is still missing, each with the one action that fixes it. */
@Composable
private fun SetupFixes(status: Status, refresh: () -> Unit) {
    val context = LocalContext.current
    val c = LocalAppColors.current
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { refresh() }
    val fixes = buildList<@Composable () -> Unit> {
        if (!status.secureSettings) add {
            Fix(stringResource(R.string.grant_from_pc)) {
                SelectionContainer {
                    Text(AdbWifiController.GRANT_COMMAND, fontFamily = AppType.text, fontSize = 13.sp, color = c.ink)
                }
                OutlinedButton(onClick = {
                    context.getSystemService(ClipboardManager::class.java)
                        .setPrimaryClip(ClipData.newPlainText("pm grant", AdbWifiController.GRANT_COMMAND))
                    Toast.makeText(context, R.string.copied, Toast.LENGTH_SHORT).show()
                }) { Text(stringResource(R.string.copy_command)) }
            }
        }
        if (!status.fineLocation) add {
            Fix(stringResource(R.string.issue_location)) {
                Button(onClick = {
                    permissionLauncher.launch(
                        arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
                    )
                }) { Text(stringResource(R.string.grant_precise_location)) }
            }
        } else if (!status.backgroundLocation) add {
            Fix(stringResource(R.string.background_location_hint)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = {
                        permissionLauncher.launch(arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION))
                    }) { Text(stringResource(R.string.allow_all_the_time)) }
                    TextButton(onClick = { context.openAppDetails() }) { Text(stringResource(R.string.app_settings)) }
                }
            }
        }
        if (!status.locationOn) add {
            Fix(stringResource(R.string.location_services_off)) {
                OutlinedButton(onClick = {
                    context.startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
                }) { Text(stringResource(R.string.open_location_settings)) }
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !status.notifications) add {
            Fix(null) {
                OutlinedButton(onClick = {
                    permissionLauncher.launch(arrayOf(Manifest.permission.POST_NOTIFICATIONS))
                }) { Text(stringResource(R.string.allow_notifications)) }
            }
        }
        if (!status.batteryUnrestricted) add {
            Fix(stringResource(R.string.battery_optimization_on)) {
                Button(onClick = { context.requestIgnoreBatteryOptimizations() }) {
                    Text(stringResource(R.string.stop_optimizing_battery))
                }
                Text(stringResource(R.string.samsung_battery_hint), fontSize = 13.sp, lineHeight = 18.sp, color = c.muted)
                TextButton(onClick = { context.openAppDetails() }) { Text(stringResource(R.string.open_app_info)) }
            }
        }
        if (!status.autoRevokeExempt) add {
            Fix(stringResource(R.string.auto_revoke_on)) {
                OutlinedButton(onClick = { context.openPackageSetting(Intent.ACTION_AUTO_REVOKE_PERMISSIONS) }) {
                    Text(stringResource(R.string.turn_off_auto_revoke))
                }
            }
        }
    }

    Column {
        Heading(stringResource(R.string.status_card_issues))
        Spacer(Modifier.height(4.dp))
        Text(stringResource(R.string.setup_from_pc_hint), fontSize = 14.sp, lineHeight = 20.sp, color = c.muted)
        fixes.forEach { fix ->
            Spacer(Modifier.height(16.dp))
            fix()
        }
    }
}

@Composable
private fun Fix(text: String?, actions: @Composable () -> Unit) {
    val c = LocalAppColors.current
    // An amber rule ties each fix to the amber hero above.
    Row {
        Spacer(
            Modifier
                .padding(top = 3.dp, end = 14.dp)
                .width(3.dp)
                .height(18.dp)
                .background(c.attention, RoundedCornerShape(2.dp))
        )
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (text != null) Text(text, color = c.ink, lineHeight = 22.sp)
            actions()
        }
    }
}

/** Rarely needed controls, collapsed by default: manual toggle, authorization timeout, language. */
@Composable
private fun Advanced(status: Status, refresh: () -> Unit) {
    val context = LocalContext.current
    val c = LocalAppColors.current
    var open by rememberSaveable { mutableStateOf(false) }
    val chevron by animateFloatAsState(if (open) 90f else 0f, tween(200), label = "chevron")

    Column {
        HorizontalDivider(color = c.line)
        Row(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 56.dp)
                .clickable { open = !open },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                stringResource(R.string.section_advanced),
                style = MaterialTheme.typography.titleMedium,
                color = c.ink,
                modifier = Modifier.weight(1f),
            )
            Text("›", fontSize = 26.sp, color = c.muted, modifier = Modifier.rotate(chevron))
        }
        AnimatedVisibility(open) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(bottom = 24.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.manual_toggle_label), Modifier.weight(1f), color = c.ink)
                    OutlinedButton(enabled = status.secureSettings, onClick = {
                        context.toastIfError(AdbWifiController.setEnabledByUser(context, !status.adbWifi))
                        refresh()
                    }) { Text(stringResource(if (status.adbWifi) R.string.turn_off else R.string.enable_now)) }
                }
                TextButton(contentPadding = FlushLeft, onClick = {
                    context.startActivity(AdbWifiController.wirelessDebuggingSettingsIntent(context))
                }) { Text(stringResource(R.string.open_wireless_debugging_settings)) }

                HorizontalDivider(color = c.line)
                val disabled = status.authTimeoutMs == 0L
                val hours = (status.authTimeoutMs / 3_600_000).toInt()
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(stringResource(R.string.disable_auth_timeout), color = c.ink)
                        Text(
                            stringResource(
                                R.string.auth_timeout_current,
                                if (disabled) stringResource(R.string.auth_timeout_never)
                                else pluralStringResource(R.plurals.auth_timeout_hours, hours, hours),
                            ),
                            fontSize = 13.sp,
                            color = c.muted,
                        )
                    }
                    Switch(checked = disabled, enabled = status.secureSettings, onCheckedChange = { on ->
                        context.toastIfError(AdbWifiController.setAuthTimeoutDisabled(context, on))
                        refresh()
                    })
                }
                Text(stringResource(R.string.auth_timeout_warning), fontSize = 13.sp, lineHeight = 18.sp, color = c.muted)

                // The system per-app language picker exists only on Android 13+.
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    HorizontalDivider(color = c.line)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(stringResource(R.string.language_label), Modifier.weight(1f), color = c.ink)
                        TextButton(onClick = { context.openPackageSetting(Settings.ACTION_APP_LOCALE_SETTINGS) }) {
                            Text(stringResource(R.string.change_language))
                        }
                    }
                }
            }
        }
    }
}

// Core function needs to react to Wi-Fi changes in the background; Samsung kills optimized apps.
@SuppressLint("BatteryLife")
private fun Context.requestIgnoreBatteryOptimizations() =
    openPackageSetting(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
