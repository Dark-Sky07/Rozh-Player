# ROZH Player Security and Release Readiness Audit

**Audit date:** 2026-10-30  
**Scope:** repository-wide static review of the TypeScript frontend, Tauri/Rust commands and configuration, Android Java bridge, dependency manifests, and GitHub Actions release workflows. This is not a penetration test or a substitute for device/store review.

## Summary

The audit identified exposed signing credentials, an unauthenticated Android loopback file server, arbitrary Android update URLs, unsafe HTML insertion, broad native permissions, and release-workflow supply-chain risks. The code changes in this branch address the application-level issues below and remove private signing files from the current tree. **A secure new release is still blocked:** the signing keys were committed in Git history and must be migrated without breaking installed-app upgrades; the GitHub Actions secrets API is not currently accessible to this session. No v1.2.0 release was created.

## Fixed in this branch

- **DOM injection:** toast content and boot-failure text now use `textContent`; dynamic library/history thumbnail URLs and media IDs are escaped before markup insertion. Toast callers now pass plain text.
- **Android loopback media server:** each process creates a cryptographically random 256-bit bearer token. The route no longer treats base64 as authorization; it accepts only the tokenized route, `content://` or `file://` sources, and GET/HEAD/OPTIONS. Request lines/headers are bounded, active connections are capped, CORS is explicit, MIME response headers are validated, and byte-range handling was corrected.
- **Android update downloads:** the URL is checked in the frontend, Rust command, and Java bridge. Only version-matched phone/TV APKs at the exact HTTPS GitHub release path are accepted; Java also checks that the asset matches the installed phone or TV package.
- **Native FFmpeg commands:** probe/remux now require an accessible regular local media file with an allowed media extension. Network protocols are excluded from FFmpeg input; remux outputs include a path-derived identifier to avoid same-name collisions. File reveal canonicalizes and verifies paths.
- **FFmpeg supply chain:** the downloader now pins FFmpeg 6.1.1 release assets, exact sizes, and GitHub-published SHA-256 digests; it verifies cached files and downloads to a temporary file before installing. Release builds no longer ignore download/integrity failures. macOS builds fetch the correct architecture binary for each target.
- **Android HLS fetch cancellation:** abort and destroy now cancel the native HTTP request.
- **Native permission scope:** removed unused Tauri filesystem, opener, and OS plugins/permissions and the DevTools toggle permission. Dialog permission is narrowed to `allow-open`; process permission is limited to restart.
- **GitHub Actions:** third-party actions are pinned to full commit SHAs. The signing workflow runs only for version-tag pushes (manual dispatch is disabled), checks out the exact tag, requires a `vMAJOR.MINOR.PATCH` tag matching `package.json`, and requires the release commit to already be reachable from `main`. Write permissions are limited to artifact-publishing jobs. Android/updater signing now reads protected Actions secrets rather than source files or workflow literals and fails closed when secrets are absent.
- **Android update selection:** the TV updater no longer falls back to installing the phone APK, and API assets must match the official repository, tag, variant, and filename.

## Critical blockers — owner action required

### Signing credentials are compromised

The Android release keystore and Tauri updater private key had been committed, and the Android password was hard-coded in the workflow. The private files are deleted from the current tree and ignored going forward, but **they remain recoverable from Git history**. Treat both signing identities as compromised. The embedded Tauri updater public key has not been rotated, and the Android certificate has not been migrated.

A safe desktop transition needs one release signed by the currently trusted key that embeds a new updater public key; later releases can then use the new private key. Android is more restrictive: replacing a package signing certificate can block in-place upgrades on older Android versions. Use a tested Android signing-certificate lineage or store-managed signing migration, and decide what to do for unsupported devices. Do not merely set the exposed keys as permanent Actions secrets.

The release workflow now requires these protected repository secrets: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`, and `ANDROID_KEY_ALIAS`. The GitHub Actions secrets API returned HTTP 403 in this session, so the secrets could not be migrated or provisioned here. **Do not publish a new release until the owner completes the signing migration and validates upgrades from the currently released v1.1.0 apps.**

### `main` protection and contributor attribution remain unresolved

`main` was confirmed unprotected and GitHub still lists `rozh` as a contributor. Creating a repository ruleset and listing Actions secrets both returned `Resource not accessible by integration` (HTTP 403). No history rewrite or force-push was attempted. An owner/admin must enable protection for `main` (require pull requests and CI checks; block force-push/deletion) and decide how to remove the unwanted historical attribution. A `.mailmap` alone is not a guaranteed fix to GitHub's Contributors graph.

## App-store and platform release gaps

- The Android manifest currently requests `REQUEST_INSTALL_PACKAGES` to support sideloaded GitHub updates. Google Play restricts this permission for apps whose core purpose is not package installation. A Play-distributed build should use Play's in-app-update mechanism and omit this permission; keep a separate sideload build if required.
- Android enables cleartext traffic to support user-entered HTTP media streams. This permits interception/modification of those streams on untrusted networks. Keep HTTP as an explicit user choice, warn when used, and build a stricter store channel if its policy requires HTTPS-only traffic.
- The release workflow does not provision Apple Developer ID signing/notarization or Windows code-signing credentials. Those are required for polished store distribution and reduce platform security warnings. Store-specific update systems may also need a separate build from the GitHub self-updater.
- Static FFmpeg binaries are GPL builds. Verify the applicable source-code, license, and notice obligations and include the required materials with each distribution before app-store submission.
- Tauri's asset-protocol scope remains `**`, and HTTP capability/CSP access remains broad because the app intentionally opens user-selected files and arbitrary media streams. Strictly narrowing those scopes without redesigning file grants would break core playback; they remain defense-in-depth risks if an XSS or compromised dependency is introduced.
- There is no committed `Cargo.lock`, and Rust dependencies use broad version ranges. This makes native builds less reproducible and complicates vulnerability review. Generate and commit a lockfile in a Rust-enabled environment, then review/update it under CI.

## Validation performed

- `npm ci`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed. Vite reported existing mixed static/dynamic import chunk warnings; output was produced successfully.
- `npm audit`: 0 advisories in the npm dependency tree.
- `node --check` for FFmpeg and Android patch scripts: passed.
- Tauri JSON configuration parsing and GitHub Actions YAML formatting/parsing: passed.
- `git diff --check`: passed.
- GitHub Actions CI run [41054309764](https://github.com/Dark-Sky07/Rozh-Player/actions/runs/41054309764) passed all three jobs: Web typecheck/build, Rust `cargo check --all-targets` plus unit tests, and Android debug APK build (including Java/Kotlin bridge compilation) through the Tauri CLI.
- Native desktop package builds, signed updater migration, upgrades from v1.1.0, store submission checks, and physical-device playback/update tests remain **unverified**. The Android CI result is a debug build, not a signed store artifact.

## Recommended release gate

1. Obtain GitHub admin/Actions-secrets access; configure main/tag rulesets and the signing secrets.
2. Complete and document updater-key migration and Android certificate-lineage/store-signing decisions.
3. Separate store builds from sideload builds where store policy requires it; add platform signing/notarization and required FFmpeg legal materials.
4. Generate and commit `Cargo.lock`; run the Rust and Android CI jobs.
5. Test v1.1.0-to-migration and migration-to-next upgrades on Windows, macOS, Linux, Android phone, and Android TV hardware before publishing a public non-draft release.
