# ROZH Player Security and Release Readiness Audit

**Audit date:** 2026-10-30  
**Scope:** repository-wide static review of the TypeScript frontend, Tauri/Rust commands and configuration, Android Java bridge, dependency manifests, and GitHub Actions workflows. This is not a penetration test or a substitute for device or store review.

## Summary

Prior signing material had been committed to repository history, and the release workflow previously contained an Android signing password. The current release preparation rotates the Tauri updater public key, uses newly generated signing identities supplied by the owner through protected Actions secrets, and adds a manual signing preflight. The release workflow now stages platform artifacts and has a single final publishing job, so it cannot create a public release until all required platform builds, signing, and asset validation pass.

Version **1.1.1** is prepared on the active feature branch but has not been released. The new release workflow and signing preflight have not yet run in GitHub Actions. No secret values are present in this audit or intended to be printed in workflow logs.

## Fixed or hardened in the current release branch

- **DOM injection:** toast content and boot-failure text use `textContent`; dynamic library/history thumbnail URLs and media IDs are escaped before markup insertion. Toast callers pass plain text.
- **Android loopback media server:** each process creates a cryptographically random 256-bit bearer token. The route no longer treats base64 as authorization; it accepts only the tokenized route, `content://` or `file://` sources, and GET/HEAD/OPTIONS. Request lines/headers are bounded, active connections are capped, CORS is explicit, MIME response headers are validated, and byte-range handling was corrected.
- **Android update downloads:** the URL is checked in the frontend, Rust command, and Java bridge. Only version-matched phone/TV APKs at the exact HTTPS GitHub release path are accepted; Java also checks that the asset matches the installed phone or TV package.
- **Native FFmpeg commands:** probe/remux require an accessible regular local media file with an allowed media extension. Network protocols are excluded from FFmpeg input; remux outputs include a path-derived identifier to avoid same-name collisions. File reveal canonicalizes and verifies paths.
- **FFmpeg supply chain:** the downloader pins FFmpeg 6.1.1 release assets, exact sizes, and GitHub-published SHA-256 digests; it verifies cached files and downloads to a temporary file before installing. Release builds fail closed on download/integrity failures. macOS builds fetch the correct architecture binary for each target.
- **Android HLS fetch cancellation:** abort and destroy cancel the native HTTP request.
- **Native permission scope:** removed unused Tauri filesystem, opener, and OS plugins/permissions and the DevTools toggle permission. Dialog permission is narrowed to `allow-open`; process permission is limited to restart.
- **GitHub Actions:** third-party actions are pinned to full commit SHAs. The release workflow runs only for version-tag pushes, checks out the exact tag, requires a `vMAJOR.MINOR.PATCH` tag matching `package.json`, requires a release commit already reachable from `main`, and limits write permission to the final publishing job. Platform jobs upload artifacts rather than publishing partial releases. Android/updater signing uses protected Actions secrets and fails closed when inputs are absent or invalid.
- **Signing preflight:** a manually dispatched workflow verifies that the Tauri private key matches the public key in the application config, and tests the Android keystore, alias, store password, and key password. It does not upload probe files or intentionally print secret values.
- **Android update selection:** the TV updater no longer falls back to installing the phone APK, and API assets must match the official repository, tag, variant, and filename.
- **Signing transition:** the updater public key was rotated in the v1.1.1 branch. Existing desktop users need a one-time manual installation to trust the new updater key. Existing Android sideload users must uninstall the old app before installing v1.1.1 because the signing certificate changed; this can remove app-private data. Future releases are intended to update in place under the new keys.

## Release gates and remaining limitations

### Before publishing v1.1.1

1. Merge the reviewed release-preparation PR through the protected `main` branch and wait for all required checks.
2. From the default branch, run **Signing preflight** and confirm both signing checks pass. The secrets API is not accessible to this session; the owner reports that all six required Actions secrets have been configured. Do not expose their values in chat or logs.
3. Only after those checks pass, create and push the `v1.1.1` tag on the merged commit. The release workflow's final publish job must succeed before a public, non-draft release appears.
4. Verify the published assets and updater manifest. Test the one-time v1.1.0-to-v1.1.1 migration and subsequent in-place update on representative devices before describing those behaviors as device-certified.

The v1.1.1 release is a GitHub release. Its AAB files are build artifacts for possible separate Play Console submission; they are **not** automatically published to Google Play. Play App Signing, upload-key configuration, store-policy compliance, and store acceptance have not been verified.

### Platform and security limits

- Android signing-certificate rotation means sideloaded v1.1.0 installations cannot update directly to v1.1.1. Uninstalling may erase app-private settings, history, and playlists; media files stored elsewhere on the device are not removed. Physical-device migration is unverified.
- The release workflow does not provision Apple Developer ID signing/notarization or Windows code-signing credentials. Platform security warnings may therefore appear.
- The Android manifest requests `REQUEST_INSTALL_PACKAGES` to support GitHub sideload updates. Google Play restricts this permission for apps whose core purpose is not package installation. A Play-distributed build may require a separate update flow and build configuration.
- Android allows cleartext traffic to support user-entered HTTP media streams. This permits interception/modification on untrusted networks. Keep HTTP as an explicit user choice and warn when it is used; a stricter store channel may be needed.
- Static FFmpeg binaries are GPL builds. Verify applicable source-code, license, and notice obligations and include required materials with each distribution before store submission.
- Tauri's asset-protocol scope remains `**`, and HTTP capability/CSP access remains broad because the app intentionally opens user-selected files and arbitrary media streams. Strictly narrowing those scopes without redesigning file grants would break core playback; they remain defense-in-depth risks if an XSS or compromised dependency is introduced.
- There is no committed `Cargo.lock`, and Rust dependencies use broad version ranges. This makes native builds less reproducible and complicates vulnerability review.
- The requested GitHub contributor-attribution state (only the repository owner shown as contributor) is not verified by these release changes; GitHub's historical Contributors graph may continue to show prior identities.

## Repository controls and release state

- The `main` branch is protected by the active `Arena` ruleset. It requires a pull request and the Web typecheck/build, Rust cargo check, and Android bridge compile checks; it blocks force-pushes and deletion and has no bypass actors.
- The owner reports that these six GitHub Actions secrets are configured: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`, and `ANDROID_KEY_ALIAS`. Their values are intentionally inaccessible to this session.
- No v1.1.1 tag or public release has been created. The release and signing-preflight workflows still need GitHub Actions validation.

## Validation performed

- `npm run typecheck`: passed on the v1.1.1 worktree.
- `npm run build`: passed; Vite emitted existing mixed static/dynamic import chunk warnings but produced the production build.
- Prettier validation for the release and signing-preflight workflow YAML: passed.
- JSON parsing, updater public-key format check, JavaScript syntax check for `scripts/build-latest-json.mjs`, release-notes/version checks, and `git diff --check`: passed.
- Earlier main-branch CI run [41066224419](https://github.com/Dark-Sky07/Rozh-Player/actions/runs/41066224419) passed after PR #2 was merged. It does not validate the current v1.1.1 release-workflow edits.
- The new GitHub release workflow, signing preflight, native desktop release packages, secret/key matching, signed Android packages, v1.1.0 upgrade migration, store submission, and physical-device playback/update behavior remain **unverified** until the applicable CI or device tests pass.
