# ROZH Player Security and Release Readiness Audit

**Audit date:** 2026-10-30  
**Scope:** repository-wide static review of the TypeScript frontend, Tauri/Rust commands and configuration, Android Java bridge, dependency manifests, and GitHub Actions workflows. This is not a penetration test or a substitute for device or store review.

## Summary

Historical signing material was committed to repository history, so the old updater and Android signing identities are treated as compromised. The owner provisioned fresh signing identities in protected GitHub Actions secrets. The v1.1.1 signing preflight passed both updater-key matching and Android keystore validation, and the v1.1.1 release was published after its release workflow completed.

This branch prepares v1.1.2 with Android phone and Android TV fixes. Those changes must pass the protected pull-request checks and the gated release workflow before any v1.1.2 tag is published. Do not claim physical-device, Play Store, or sideload-migration validation unless those tests are actually completed. No signing-secret values are present in this audit.

## Existing security hardening

- **DOM injection:** toast content and boot-failure text use `textContent`; dynamic library/history thumbnail URLs and media IDs are escaped before markup insertion. Toast callers pass plain text.
- **Android loopback media server:** each process creates a cryptographically random 256-bit bearer token. The route accepts only the tokenized path and `content://` or `file://` sources; request lines/headers are bounded, active connections are capped, CORS is explicit, MIME response headers are validated, and byte-range handling is implemented.
- **Android update downloads:** URLs are checked in the frontend, Rust command, and Java bridge. Only version-matched phone/TV APKs at the exact HTTPS GitHub release path are accepted; Java also checks that the asset matches the installed phone or TV package.
- **Native FFmpeg commands:** probe/remux require an accessible regular local media file with an allowed media extension. Network protocols are excluded from FFmpeg input; remux outputs include a path-derived identifier to avoid same-name collisions. File reveal canonicalizes and verifies paths.
- **FFmpeg supply chain:** the downloader pins FFmpeg release assets, exact sizes, and GitHub-published SHA-256 digests; it verifies cached files and downloads to a temporary file before installing. Release builds fail closed on download/integrity failures. macOS builds fetch the correct architecture binary for each target.
- **Android HLS fetch cancellation:** abort and destroy cancel the native HTTP request.
- **Native permission scope:** unused Tauri filesystem, opener, and OS plugins/permissions and the DevTools toggle permission were removed. Dialog permission is narrowed to `allow-open`; process permission is limited to restart.
- **GitHub Actions:** third-party actions are pinned to full commit SHAs. Release runs only for version-tag pushes, checks out the exact tag, validates that the `vMAJOR.MINOR.PATCH` tag matches `package.json`, requires the release commit to be reachable from `main`, and limits write permission to the final publishing job. Platform jobs stage artifacts; the final job publishes only after required builds, signing, manifest validation, and asset checks succeed.
- **Signing preflight:** the manual workflow verifies that the Tauri private key matches the configured public key and validates the Android keystore, alias, and passwords without intentionally printing secret values. Owner-triggered run [41099673390](https://github.com/Dark-Sky07/Rozh-Player/actions/runs/41099673390) passed both checks.
- **Signing transition:** v1.1.1 introduced the fresh updater and Android signing identities and was published as a public GitHub release. Existing v1.1.0 desktop installs require a one-time manual migration to trust the new updater key. Existing v1.1.0 Android sideload installs require uninstall/reinstall because the certificate changed; this may erase app-private data. Future updates are intended to use the replacement identities in place.

## Android fixes in the proposed v1.1.2 release

- Each scan/picker request now has an ID, and the mailbox publishes a fresh pending state before sending a command. This prevents a previous launch's `ready` snapshot from prematurely completing the next scan.
- The Android process skips the command left by its previous run so a stale play/install command is not replayed on launch, and refreshes its Activity reference after configuration-driven recreation.
- The audio-index preference is applied to MediaStore and persisted SAF folders. Missing provider MIME types are classified from filenames, and a declined Android 13+ audio permission no longer prevents video scanning.
- Android 14+ selected-media permission is declared and used so selected videos remain indexable when full-library access is not granted.
- Indexed Android media is de-duplicated by document URI rather than filename and size, preserving same-named files in different folders.

## Release gates and remaining limitations

### Before publishing v1.1.2

1. Open a pull request from this branch and merge only after the required Web, Rust, and Android checks pass on protected `main`.
2. Confirm signing secrets remain configured; the release workflow must complete its native build, signing, manifest, and asset validation steps before its final publishing job can create a public non-draft release.
3. Verify the public assets and updater manifest after publication. Do not publish a tag while required CI or signing validation is failing or incomplete.
4. Test Android phone and TV permissions, library indexing, local/network playback, remote navigation, and in-place update behavior on representative physical devices before describing them as device-certified.

The GitHub release's AAB files are artifacts for a possible separate Play Console submission; they are **not** automatically published to Google Play. Play App Signing, upload-key configuration, store-policy compliance, and store acceptance have not been verified.

### Platform and security limits

- Android signing-certificate rotation means sideloaded v1.1.0 installations cannot directly install v1.1.1 or later. Uninstalling may erase app-private settings, history, and playlists; media files stored elsewhere on the device are not removed. Physical-device migration is unverified.
- The release workflow does not provision Apple Developer ID signing/notarization or Windows code-signing credentials. Platform security warnings may therefore appear.
- The Android manifest requests `REQUEST_INSTALL_PACKAGES` to support GitHub sideload updates. Google Play restricts this permission for apps whose core purpose is not package installation. A Play-distributed build may require a separate update flow and build configuration.
- Android allows cleartext traffic to support user-entered HTTP media streams. This permits interception/modification on untrusted networks. Keep HTTP as an explicit user choice and warn when it is used; a stricter store channel may be needed.
- Static FFmpeg binaries are GPL builds. Verify applicable source-code, license, and notice obligations and include required materials with each distribution before store submission.
- Tauri's asset-protocol scope remains `**`, and HTTP capability/CSP access remains broad because the app intentionally opens user-selected files and arbitrary media streams. Strictly narrowing those scopes without redesigning file grants would break core playback; they remain defense-in-depth risks if an XSS or compromised dependency is introduced.
- There is no committed `Cargo.lock`, and Rust dependencies use broad version ranges. This makes native builds less reproducible and complicates vulnerability review.
- The requested GitHub contributor-attribution state (only the repository owner shown as contributor) is not verified by these release changes; GitHub's historical Contributors graph may continue to show prior identities.

## Repository controls and release state

- The `main` branch is protected by the active Arena ruleset. It requires a pull request and the Web typecheck/build, Rust cargo check, and Android bridge compile checks; it blocks force-pushes and deletion and has no bypass actors.
- The owner reports that the six required GitHub Actions secrets are configured. Their values are intentionally inaccessible to this session.
- Latest published release at audit time: [v1.1.1](https://github.com/Dark-Sky07/Rozh-Player/releases/tag/v1.1.1). Release workflow run [41099996287](https://github.com/Dark-Sky07/Rozh-Player/actions/runs/41099996287) was triggered from the merged v1.1.1 tag.

## Validation performed for this branch

- `npm ci`: passed; npm reported zero known vulnerabilities in the installed dependency set.
- `npm run build`: TypeScript check and Vite production build passed. Vite emitted existing mixed static/dynamic import chunk warnings.
- `git diff --check`: passed.
- Cargo/Rust tests could not run locally because Cargo is not installed in this sandbox. Android native generation/build and physical-device tests also remain unavailable here; GitHub Actions must validate the native build changes.
- The v1.1.2 protected PR checks, release signing, native release artifacts, update migration, Play Store submission, and physical-device playback/update behavior remain **unverified** until their respective CI or device tests pass.
