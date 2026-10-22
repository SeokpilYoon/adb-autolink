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
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleStartEffect
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay

private data class Status(
    val secureSettings: Boolean,
    val developerOptions: Boolean,
    val fineLocation: Boolean,
    val backgroundLocation: Boolean,
    val locationOn: Boolean,
    val notifications: Boolean,
    val batteryUnrestricted: Boolean,
    val autoRevokeExempt: Boolean,
    val adbWifi: Boolean,
    val authTimeoutMs: Long,
)

private fun Context.granted(permission: String) =
    checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

private fun readStatus(context: Context) = Status(
    secureSettings = AdbWifiController.hasPermission(context),
    developerOptions = AdbWifiController.isDeveloperOptionsEnabled(context),
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
    val prefs = remember { Prefs(context) }
    var status by remember { mutableStateOf(readStatus(context)) }
    var wifi by remember { mutableStateOf<WifiSnapshot?>(null) }
    var port by remember { mutableStateOf<Int?>(null) }
    var whitelist by remember { mutableStateOf(prefs.whitelist) }
    var autoEnabled by remember { mutableStateOf(prefs.autoEnabled) }
    var refreshKey by remember { mutableIntStateOf(0) }
    val refresh = { status = readStatus(context) }
    val reevaluate = { if (prefs.autoEnabled) WifiWatcherService.start(context) }

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
    LifecycleStartEffect(status.adbWifi, ip, refreshKey) {
        port = null
        val discovery = AdbPortDiscovery(context) { port = it }
        if (status.adbWifi) discovery.start(ip)
        onStopOrDispose { discovery.stop() }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { refresh() }

    Scaffold { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(stringResource(R.string.app_name), style = MaterialTheme.typography.headlineSmall)

            Section(stringResource(R.string.section_secure_settings), ok = status.secureSettings && status.developerOptions) {
                Text(
                    stringResource(
                        if (status.developerOptions) R.string.developer_options_on else R.string.developer_options_off
                    )
                )
                if (status.secureSettings) {
                    Text(stringResource(R.string.permission_ok))
                } else {
                    Text(stringResource(R.string.grant_from_pc))
                    SelectionContainer {
                        Text(AdbWifiController.GRANT_COMMAND, fontFamily = FontFamily.Monospace)
                    }
                    OutlinedButton(onClick = {
                        context.getSystemService(ClipboardManager::class.java)
                            .setPrimaryClip(ClipData.newPlainText("pm grant", AdbWifiController.GRANT_COMMAND))
                        Toast.makeText(context, R.string.copied, Toast.LENGTH_SHORT).show()
                    }) { Text(stringResource(R.string.copy_command)) }
                }
            }

            Section(
                stringResource(R.string.section_location),
                ok = status.fineLocation && status.backgroundLocation && status.locationOn,
            ) {
                when {
                    !status.fineLocation -> Button(onClick = {
                        permissionLauncher.launch(
                            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
                        )
                    }) { Text(stringResource(R.string.grant_precise_location)) }
                    !status.backgroundLocation -> {
                        Text(stringResource(R.string.background_location_hint))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = {
                                permissionLauncher.launch(arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION))
                            }) { Text(stringResource(R.string.allow_all_the_time)) }
                            TextButton(onClick = { context.openAppDetails() }) { Text(stringResource(R.string.app_settings)) }
                        }
                    }
                    else -> Text(stringResource(R.string.location_permission_ok))
                }
                if (!status.locationOn) {
                    Text(stringResource(R.string.location_services_off), color = MaterialTheme.colorScheme.error)
                    OutlinedButton(onClick = {
                        context.startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
                    }) { Text(stringResource(R.string.open_location_settings)) }
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !status.notifications) {
                    TextButton(onClick = {
                        permissionLauncher.launch(arrayOf(Manifest.permission.POST_NOTIFICATIONS))
                    }) { Text(stringResource(R.string.allow_notifications)) }
                }
            }

            Section(stringResource(R.string.section_keep_running), ok = status.batteryUnrestricted && status.autoRevokeExempt) {
                Text(
                    stringResource(
                        if (status.batteryUnrestricted) R.string.battery_optimization_ignored
                        else R.string.battery_optimization_on
                    )
                )
                if (!status.batteryUnrestricted) {
                    Button(onClick = { context.requestIgnoreBatteryOptimizations() }) {
                        Text(stringResource(R.string.stop_optimizing_battery))
                    }
                }
                Text(stringResource(R.string.samsung_battery_hint), style = MaterialTheme.typography.bodySmall)
                OutlinedButton(onClick = { context.openAppDetails() }) { Text(stringResource(R.string.open_app_info)) }
                Text(stringResource(if (status.autoRevokeExempt) R.string.auto_revoke_off else R.string.auto_revoke_on))
                if (!status.autoRevokeExempt) {
                    OutlinedButton(onClick = { context.openPackageSetting(Intent.ACTION_AUTO_REVOKE_PERMISSIONS) }) {
                        Text(stringResource(R.string.turn_off_auto_revoke))
                    }
                }
            }

            Section(stringResource(R.string.section_current_network), ok = wifi?.ssid != null) {
                val ssid = wifi?.ssid
                val bssid = wifi?.bssid
                when {
                    wifi == null -> Text(stringResource(R.string.ssid_not_on_wifi))
                    ssid == null -> Text(stringResource(R.string.ssid_hidden), color = MaterialTheme.colorScheme.error)
                    bssid == null -> Text(stringResource(R.string.ssid_value, ssid))
                    else -> Text(stringResource(R.string.ssid_value_bssid, ssid, bssid))
                }
                Text(stringResource(if (status.adbWifi) R.string.wireless_debugging_on else R.string.wireless_debugging_off))
                if (status.adbWifi && ip != null) {
                    SelectionContainer {
                        Text(
                            stringResource(R.string.address, ip, port?.toString() ?: "?"),
                            fontFamily = FontFamily.Monospace,
                        )
                    }
                    if (port == null) {
                        TextButton(onClick = { refreshKey++ }) { Text(stringResource(R.string.retry_port_discovery)) }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(enabled = status.secureSettings, onClick = {
                        context.toastIfError(AdbWifiController.setEnabledByUser(context, !status.adbWifi))
                        refresh()
                    }) { Text(stringResource(if (status.adbWifi) R.string.turn_off else R.string.enable_now)) }
                    OutlinedButton(
                        enabled = ssid != null && ssid !in whitelist,
                        onClick = {
                            whitelist = whitelist + ssid!!
                            prefs.whitelist = whitelist
                            reevaluate()
                        },
                    ) { Text(stringResource(R.string.add_to_whitelist)) }
                }
                Text(stringResource(R.string.first_time_approval_hint), style = MaterialTheme.typography.bodySmall)
                TextButton(onClick = {
                    context.startActivity(AdbWifiController.wirelessDebuggingSettingsIntent(context))
                }) { Text(stringResource(R.string.open_wireless_debugging_settings)) }
            }

            Section(stringResource(R.string.section_whitelist), ok = whitelist.isNotEmpty()) {
                if (whitelist.isEmpty()) Text(stringResource(R.string.whitelist_empty))
                whitelist.sorted().forEach { name ->
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(name, Modifier.weight(1f))
                        TextButton(onClick = {
                            whitelist = whitelist - name
                            prefs.whitelist = whitelist
                            reevaluate()
                        }) { Text(stringResource(R.string.remove)) }
                    }
                }
            }

            Section(stringResource(R.string.section_auto_enable), ok = autoEnabled) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.auto_enable_label), Modifier.weight(1f))
                    Switch(checked = autoEnabled, onCheckedChange = { on ->
                        autoEnabled = on
                        prefs.autoEnabled = on
                        if (on) {
                            WifiTriggerReceiver.register(context)
                            WifiWatcherService.start(context)
                        } else {
                            WifiTriggerReceiver.unregister(context)
                            WifiWatcherService.stop(context)
                        }
                    })
                }
            }

            Section(stringResource(R.string.section_auth_timeout), ok = true) {
                val disabled = status.authTimeoutMs == 0L
                val hours = (status.authTimeoutMs / 3_600_000).toInt()
                Text(
                    stringResource(
                        R.string.auth_timeout_current,
                        if (disabled) stringResource(R.string.auth_timeout_never)
                        else pluralStringResource(R.plurals.auth_timeout_hours, hours, hours),
                    ),
                    fontFamily = FontFamily.Monospace,
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.disable_auth_timeout), Modifier.weight(1f))
                    Switch(checked = disabled, enabled = status.secureSettings, onCheckedChange = { on ->
                        context.toastIfError(AdbWifiController.setAuthTimeoutDisabled(context, on))
                        refresh()
                    })
                }
                Text(stringResource(R.string.auth_timeout_warning), style = MaterialTheme.typography.bodySmall)
            }

            // The system per-app language picker exists only on Android 13+.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                Section(stringResource(R.string.section_language), ok = true) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(stringResource(R.string.language_label), Modifier.weight(1f))
                        OutlinedButton(onClick = { context.openPackageSetting(Settings.ACTION_APP_LOCALE_SETTINGS) }) {
                            Text(stringResource(R.string.change_language))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Section(title: String, ok: Boolean, content: @Composable () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                "${if (ok) "✓" else "!"}  $title",
                style = MaterialTheme.typography.titleMedium,
                color = if (ok) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
            )
            content()
        }
    }
}

// Core function needs to react to Wi-Fi changes in the background; Samsung kills optimized apps.
@SuppressLint("BatteryLife")
private fun Context.requestIgnoreBatteryOptimizations() =
    openPackageSetting(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
