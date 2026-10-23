package dev.adbautolink.companion

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight

/**
 * Fixed palette instead of wallpaper-based dynamic color: the screen's job is a status read at a
 * glance, so each link state owns one color (ultramarine = PC can connect, amber = needs attention).
 */
@Immutable
data class AppColors(
    val paper: Color,
    val surface: Color,
    val ink: Color,
    val muted: Color,
    val line: Color,
    val linked: Color,
    /** Linked hue for text on paper (the fill color is too dark to read on the dark background). */
    val linkedText: Color,
    val onLinked: Color,
    val attention: Color,
    val onAttention: Color,
    val idle: Color,
    val onIdle: Color,
)

private val Light = AppColors(
    paper = Color(0xFFE8ECF2),
    surface = Color(0xFFF7F9FC),
    ink = Color(0xFF0F1B2D),
    muted = Color(0xFF5B6779),
    line = Color(0xFFCBD3DE),
    linked = Color(0xFF3D3BF3),
    linkedText = Color(0xFF3D3BF3),
    onLinked = Color(0xFFFFFFFF),
    attention = Color(0xFFE0A21B),
    onAttention = Color(0xFF0F1B2D),
    idle = Color(0xFFC9D1DC),
    onIdle = Color(0xFF0F1B2D),
)

private val Dark = AppColors(
    paper = Color(0xFF0C1424),
    surface = Color(0xFF16213A),
    ink = Color(0xFFE7ECF4),
    muted = Color(0xFF93A0B4),
    line = Color(0xFF25324D),
    linked = Color(0xFF4744F5),
    linkedText = Color(0xFF9C9BFF),
    onLinked = Color(0xFFFFFFFF),
    attention = Color(0xFFE8AE2E),
    onAttention = Color(0xFF0F1B2D),
    idle = Color(0xFF25324D),
    onIdle = Color(0xFFE7ECF4),
)

val LocalAppColors = staticCompositionLocalOf { Light }

/** Archivo (variable: weight + width). Hangul falls back to the system font, so it is used where Latin dominates. */
@OptIn(ExperimentalTextApi::class)
private fun archivo(weight: Int, width: Float) = FontFamily(
    Font(
        R.font.archivo,
        weight = FontWeight(weight),
        variationSettings = FontVariation.Settings(FontVariation.weight(weight), FontVariation.width(width)),
    )
)

object AppType {
    /** The port number: the value that changes every session and used to be typed by hand. */
    val wideHeavy = archivo(weight = 700, width = 115f)
    val wide = archivo(weight = 560, width = 112f)
    val text = archivo(weight = 450, width = 100f)
}

@Composable
fun AppTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val c = if (dark) Dark else Light
    val scheme = (if (dark) darkColorScheme() else lightColorScheme()).copy(
        // Buttons, text buttons and switches sit on paper, so they use the readable tint.
        primary = c.linkedText,
        onPrimary = if (dark) c.paper else c.onLinked,
        background = c.paper,
        onBackground = c.ink,
        surface = c.paper,
        onSurface = c.ink,
        onSurfaceVariant = c.muted,
        surfaceContainer = c.surface,
        outline = c.line,
        outlineVariant = c.line,
        error = Color(0xFFC2410C),
    )
    CompositionLocalProvider(LocalAppColors provides c) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
