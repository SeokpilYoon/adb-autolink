# Release

The release page is generated from `CHANGELOG.md`, so you never write it by hand.

## 1. Bump the version

Set the same version in all of these:

- `.claude-plugin/plugin.json`
- the plugin entry in `.claude-plugin/marketplace.json`
- `mcp-server/package.json`
- `mcp-server/src/config.ts`
- `android-app/app/build.gradle.kts` (`versionName`; also increase `versionCode`)
- the `version` field in the frontmatter of `skills/setup/SKILL.md`

Then add a `## vX.Y.Z - <title>` section at the top of `CHANGELOG.md`. If upgrading needs any action from users, start the section with an **Upgrading from …** paragraph.

## 2. Build

```bash
(cd mcp-server && npm ci && npm run build && npm test)
(cd android-app && ./gradlew assembleRelease lintRelease)   # → android-app/build/dist/adb-autolink.apk
node scripts/release.mjs check
```

Release signing reads `~/.android/adb-autolink-keystore.properties` (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`).

- Every release must be signed with the **same key**. Otherwise users can't update the app in place.
- Back up the keystore outside the repository.

## 3. Publish

Commit and push, then run:

```bash
node scripts/release.mjs publish
```

This command:

1. Runs `check` again.
2. Makes sure the working tree is clean and pushed.
3. Tags `vX.Y.Z`.
4. Creates the GitHub release with the CHANGELOG section as its notes and the APK attached as `adb-autolink.apk`.

`install_companion_app` downloads `releases/latest/download/adb-autolink.apk`, so the asset name must never change.

After publishing, users get the new version with `/plugin update adb-autolink`.
