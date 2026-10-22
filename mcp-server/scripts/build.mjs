// Bundle src/index.ts and src/cli.ts into self-contained ESM files (no node_modules needed at runtime).
// Usage: node scripts/build.mjs [outdir]   (default: dist; release.mjs check builds into a temp dir and compares)
import { build } from "esbuild";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outdir = path.resolve(root, process.argv[2] ?? "dist");
rmSync(outdir, { recursive: true, force: true });
await build({
  absWorkingDir: root,
  entryPoints: { index: "src/index.ts", cli: "src/cli.ts" },
  outdir,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  minify: true,
  legalComments: "none",
  logLevel: process.argv[2] ? "warning" : "info",
  // CJS deps (pngjs, jpeg-js, ...) call require() for node builtins; give ESM output a real require.
  banner: { js: '#!/usr/bin/env node\nimport { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
});
