# ADB Autolink release rules.
# Activities, services (incl. the TileService), and receivers are referenced from the
# manifest, so AAPT2 generates keep rules for them; Compose and AndroidX ship their own
# consumer rules. Nothing app-specific needs to be kept by reflection.

# Keep line numbers for readable crash stack traces.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
