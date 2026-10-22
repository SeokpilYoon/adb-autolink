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

            Section("1. Secure settings permission", ok = status.secureSettings && status.developerOptions) {
                Text(
                    if (status.developerOptions) "Developer options + USB debugging: ON"
                    else "Developer options / USB debugging: OFF (turned on automatically when enabling)"
                )
                if (status.secureSettings) {
                    Text("Permission OK")
                } else {
                    Text("Grant once from a PC (USB or wireless adb):")
                    SelectionContainer {
                        Text(AdbWifiController.GRANT_COMMAND, fontFamily = FontFamily.Monospace)
                    }
                    OutlinedButton(onClick = {
                        context.getSystemService(ClipboardManager::class.java)
                            .setPrimaryClip(ClipData.newPlainText("pm grant", AdbWifiController.GRANT_COMMAND))
                        Toast.makeText(context, "Copied", Toast.LENGTH_SHORT).show()
                    }) { Text("Copy command") }
                }
            }

            Section(
                "2. Location (needed to read the Wi-Fi name)",
                ok = status.fineLocation && status.backgroundLocation && status.locationOn,
            ) {
                when {
                    !status.fineLocation -> Button(onClick = {
                        permissionLauncher.launch(
                            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
                        )
                    }) { Text("Grant precise location") }
                    !status.backgroundLocation -> {
                        Text("Choose \"Allow all the time\" so the SSID can be read in the background.")
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = {
                                permissionLauncher.launch(arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION))
                            }) { Text("Allow all the time") }
                            TextButton(onClick = { context.openAppDetails() }) { Text("App settings") }
                        }
                    }
                    else -> Text("Location permission OK")
                }
                if (!status.locationOn) {
                    Text("Location services are OFF. The SSID is hidden until you turn them on.",
                        color = MaterialTheme.colorScheme.error)
                    OutlinedButton(onClick = {
                        context.startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))
                    }) { Text("Open location settings") }
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !status.notifications) {
                    TextButton(onClick = {
                        permissionLauncher.launch(arrayOf(Manifest.permission.POST_NOTIFICATIONS))
                    }) { Text("Allow notifications (status notification)") }
                }
            }

            Section("3. Keep running (Samsung)", ok = status.batteryUnrestricted && status.autoRevokeExempt) {
                Text("Battery optimization: ${if (status.batteryUnrestricted) "ignored (OK)" else "ON - the watcher may be killed"}")
                if (!status.batteryUnrestricted) {
                    Button(onClick = { context.requestIgnoreBatteryOptimizations() }) { Text("Stop optimizing battery") }
                }
                Text(
                    "Also set App info > Battery > \"Unrestricted\", and add this app to Settings > Battery > " +
                        "Background usage limits > \"Never sleeping apps\".",
                    style = MaterialTheme.typography.bodySmall,
                )
                OutlinedButton(onClick = { context.openAppDetails() }) { Text("Open app info") }
                Text("Remove permissions if unused: ${if (status.autoRevokeExempt) "off (OK)" else "ON - may revoke location"}")
                if (!status.autoRevokeExempt) {
                    OutlinedButton(onClick = { context.openPackageSetting(Intent.ACTION_AUTO_REVOKE_PERMISSIONS) }) {
                        Text("Turn off \"Remove permissions if unused\"")
                    }
                }
            }

            Section("Current network", ok = wifi?.ssid != null) {
                val ssid = wifi?.ssid
                when {
                    wifi == null -> Text("SSID: not on Wi-Fi")
                    ssid == null -> Text(
                        "SSID: <unknown ssid> - Android hides it. Grant location \"Allow all the time\" and turn location ON.",
                        color = MaterialTheme.colorScheme.error,
                    )
                    else -> Text("SSID: $ssid" + (wifi?.bssid?.let { "  ($it)" } ?: ""))
                }
                Text("Wireless debugging: ${if (status.adbWifi) "ON" else "OFF"}")
                if (status.adbWifi && ip != null) {
                    SelectionContainer {
                        Text("Address: $ip:${port ?: "?"}", fontFamily = FontFamily.Monospace)
                    }
                    if (port == null) TextButton(onClick = { refreshKey++ }) { Text("Retry port discovery") }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(enabled = status.secureSettings, onClick = {
                        context.toastIfError(AdbWifiController.setEnabledByUser(context, !status.adbWifi))
                        refresh()
                    }) { Text(if (status.adbWifi) "Turn off" else "Enable now") }
                    OutlinedButton(
                        enabled = ssid != null && ssid !in whitelist,
                        onClick = {
                            whitelist = whitelist + ssid!!
                            prefs.whitelist = whitelist
                            reevaluate()
                        },
                    ) { Text("Add to whitelist") }
                }
                Text(
                    "First time on each network Android asks \"Allow wireless debugging on this network?\" " +
                        "- tick \"Always allow on this network\" once.",
                    style = MaterialTheme.typography.bodySmall,
                )
                TextButton(onClick = {
                    context.startActivity(AdbWifiController.wirelessDebuggingSettingsIntent(context))
                }) { Text("Open Wireless debugging settings") }
            }

            Section("Whitelisted Wi-Fi", ok = whitelist.isNotEmpty()) {
                if (whitelist.isEmpty()) Text("No networks yet. Connect to your Wi-Fi and tap \"Add to whitelist\".")
                whitelist.sorted().forEach { name ->
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(name, Modifier.weight(1f))
                        TextButton(onClick = {
                            whitelist = whitelist - name
                            prefs.whitelist = whitelist
                            reevaluate()
                        }) { Text("Remove") }
                    }
                }
            }

            Section("Auto-enable", ok = autoEnabled) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Turn on Wireless debugging on whitelisted Wi-Fi", Modifier.weight(1f))
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

            Section("Optional: authorization timeout", ok = true) {
                val disabled = status.authTimeoutMs == 0L
                Text(
                    "Current: " + if (disabled) "never expires" else "${status.authTimeoutMs / 3_600_000} h",
                    fontFamily = FontFamily.Monospace,
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Disable 7-day authorization timeout", Modifier.weight(1f))
                    Switch(checked = disabled, enabled = status.secureSettings, onCheckedChange = { on ->
                        context.toastIfError(AdbWifiController.setAuthTimeoutDisabled(context, on))
                        refresh()
                    })
                }
                Text(
                    "Android forgets PC authorizations not used for 7 days. Disabling this keeps your PC " +
                        "authorized forever: anyone holding that PC's adb key can connect while Wireless " +
                        "debugging is on. Only use with trusted PCs and networks.",
                    style = MaterialTheme.typography.bodySmall,
                )
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
