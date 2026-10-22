import { defineConfig } from "vitest/config";

// Pin human-facing text to English so assertions do not depend on the machine locale.
export default defineConfig({ test: { env: { ADB_AUTOLINK_LANG: "en" } } });
