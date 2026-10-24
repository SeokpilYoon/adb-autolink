import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// Release signing is optional: without this file the release APK is built unsigned.
// Path comes from -PADB_AUTOLINK_KEYSTORE_PROPERTIES or the env var of the same name.
// Keys: storeFile, storePassword, keyAlias, keyPassword (storeFile may be relative to the file).
val keystorePropertiesFile = file(
    providers.gradleProperty("ADB_AUTOLINK_KEYSTORE_PROPERTIES")
        .orElse(providers.environmentVariable("ADB_AUTOLINK_KEYSTORE_PROPERTIES"))
        .getOrElse("${System.getProperty("user.home")}/.android/adb-autolink-keystore.properties")
)
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.isFile) keystorePropertiesFile.inputStream().use(::load)
}

android {
    namespace = "dev.adbautolink.companion"
    compileSdk = 35

    defaultConfig {
        applicationId = "dev.adbautolink.companion"
        minSdk = 30
        targetSdk = 35
        versionCode = 10
        versionName = "0.4.3"
    }

    signingConfigs {
        if (!keystoreProperties.isEmpty) {
            create("release") {
                storeFile = keystorePropertiesFile.parentFile.resolve(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    androidResources {
        // Ship only the translated locales (drops partial AndroidX translations); keep in sync with res/xml/locales_config.xml.
        localeFilters += listOf("en", "ko", "ja", "zh-rCN", "es", "fr")
    }
    buildFeatures {
        compose = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

// Release asset: build/dist/adb-autolink.apk (+ a versioned copy). Runs after assembleRelease.
val copyReleaseApk by tasks.registering(Sync::class) {
    dependsOn("assembleRelease")
    val versionName = android.defaultConfig.versionName
    val distDir = rootProject.layout.buildDirectory.dir("dist")
    from(layout.buildDirectory.dir("outputs/apk/release")) { include("*.apk") }
    into(distDir)
    eachFile { name = "adb-autolink.apk" }
    doLast {
        val dist = distDir.get()
        dist.file("adb-autolink.apk").asFile.copyTo(dist.file("adb-autolink-$versionName.apk").asFile, overwrite = true)
    }
}
tasks.matching { it.name == "assembleRelease" }.configureEach { finalizedBy(copyReleaseApk) }

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    debugImplementation(libs.androidx.compose.ui.tooling)
}
