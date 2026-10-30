# ROZH Player 1.1.4

**Corrected Android fullscreen sizing and controls**

- Reworked Android fullscreen to size the player from the complete app viewport rather than a fixed child inside the animated player view. This prevents cropped/half-height video after rotating the device.
- Kept the player, stage, and video dimensions bounded by the landscape viewport; playback overlays remain interactive above the fullscreen surface.
- See [full release notes](releases/v1.1.4.md).

---

# ROZH Player 1.1.3

**Reliable immersive fullscreen playback on Android**

- Android video playback now automatically enters landscape fullscreen and hides the system bars; the app sidebar and navigation chrome stay out of the way.
- Replaced Android WebView's inconsistent native fullscreen path with the in-app player layer, keeping controls and playback menus together. Controls continue to fade after inactivity and reappear on touch or remote input.
- Fixed fullscreen overlays so playback settings and menus remain above the video, and Back exits fullscreen cleanly.
- The Android release uses a separate native orientation mailbox so display changes cannot interfere with device media indexing.
- See [full release notes](releases/v1.1.3.md).

---

# ROZH Player 1.1.2

**More reliable Android phone and Android TV media libraries**

- Fixed stale scan-state and mailbox-command races that could make device indexing appear complete without applying the latest result; the native bridge also refreshes its Activity after Android recreates it.
- Applied the audio-index preference to MediaStore and picked folders; retained audio classification when providers omit MIME types.
- Kept video indexing available when Android 13+ audio access is declined and added Android 14+ selected-video access.
- Preserved separate files that share a filename and size by de-duplicating indexed media by document URI.
- See [full release notes](releases/v1.1.2.md).

---

# ROZH Player 1.1.1

**Security signing transition and safer release validation**

Existing desktop users must install this release manually once because the trusted updater key changed. Existing Android phone/tablet and Android TV sideload installations must be uninstalled before installing the new APKs because the signing certificate changed. Back up app-private settings, history, and playlists first if available; media files stored elsewhere on the device are not removed. Future updates use the new signing identities.

The Android AAB files are supplied for a separate Play Console submission; this GitHub release does not publish to Google Play. Confirm Play App Signing and upload-key settings before submitting them.

## Security and release pipeline

- Rotated the embedded Tauri updater public key after the previous signing material was exposed.
- Release builds use newly provisioned Android signing material and fail closed when it is missing or invalid.
- Release assets publish only after all desktop, Android, Android TV, web, signing, and updater-manifest jobs succeed.
- Main requires pull requests and passing Web, Rust, and Android checks; force-pushes and branch deletion are blocked.
- Includes repository-wide native media and release-pipeline hardening described in [the security audit](SECURITY_AUDIT.md).

## Platforms

Windows 10/11, macOS, Linux, Android phones/tablets, Android TV (dedicated package), and Web/PWA.

## Validation

- Local web typecheck and production build passed. The release workflow must pass all native builds, signing, and artifact validation before it creates the public release.
- Physical-device signing migration and Play Store submission need separate validation.

---

# ROZH Player 1.1.0

**Immersive fullscreen playback, more capable rendition selection, and a more responsive TV experience**

## Direct downloads

| Platform | Download |
| --- | --- |
| Windows 10/11 (x64) | [Windows installer](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.1.0/ROZH-Player_1.1.0_x64-setup.exe) |
| macOS — Apple Silicon | [DMG](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.1.0/ROZH-Player_1.1.0_aarch64.dmg) |
| macOS — Intel | [DMG](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.1.0/ROZH-Player_1.1.0_x64.dmg) |
| Linux — Debian/Ubuntu | [DEB](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.1.0/ROZH-Player_1.1.0_amd64.deb) |
| Linux — Fedora/RHEL/openSUSE | [RPM](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.1.0/ROZH-Player-1.1.0-1.x86_64.rpm) |
| Linux — AppImage | [AppImage](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.1.0/ROZH-Player_1.1.0_amd64.AppImage) |
| Android phones and tablets | [APK](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.1.0/ROZH-Player-1.1.0.apk) · [Google Play bundle](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.1.0/ROZH-Player-1.1.0.aab) |
| Android TV (dedicated build) | [TV APK](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.1.0/ROZH-Player-TV-1.1.0.apk) · [TV Google Play bundle](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.1.0/ROZH-Player-TV-1.1.0.aab) |
| Web / PWA | [Static bundle](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.1.0/rozh-player-web.zip) |

## What changed

### Fullscreen playback and quality

- Fullscreen controls now fade away after 2.8 seconds of inactivity on desktop, mobile, and TV, including while paused. Pointer, touch, keyboard, and remote activity brings them back; fullscreen no longer stays visible just because a mouse is resting over the video.
- Platforms without a usable Fullscreen API use ROZH's own full-window layout instead of native video controls that the app cannot hide. TV Back also exits fullscreen before leaving playback.
- Removed HLS's player-size rendition cap. Adaptive HLS/DASH can use the source's available renditions, and the quality menu still lets users select a listed rendition manually.
- Playback does not add an app-imposed resolution ceiling or routinely re-encode source media. Actual playback remains bounded by the source, available codecs, network throughput, and the device's decoder/display; this is not a promise that every codec or resolution decodes on every device.

### Android TV and shared controls

- Expanded D-pad handling for Android key names/keycodes, center/OK activation, and safe movement away from seek/volume sliders.
- Reworked TV navigation into a horizontal header, with softer item-specific focus treatment and a content-first startup focus.
- Centered the animated startup logo and added viewport-aware, keyboard-focusable tooltips that reposition around edges and fullscreen layouts.
- Kept file and URL actions routed through the player and corrected the view-click delegation that could undo actions inside a view.

### Compatibility and upgrades

- Bumped the app to 1.1.0 and Android version code to 1001000; release signing identity remains unchanged for in-place Android upgrades.
- The dedicated Android TV package remains separate from the phone/tablet build. Desktop in-app updates continue to use the signed updater feed.

### Validation

- `npm run build` — TypeScript check and Vite production build passed.
- `git diff --check` passed.
- CI release jobs build the native platform packages. This sandbox cannot verify playback or remote behavior on physical devices; representative Windows, Android, and TV-device checks remain recommended.


---

# ROZH Player 1.0.8

**A dedicated, remote-first Android TV home**

## Download

| Platform | Release asset |
| --- | --- |
| Windows 10/11 (x64) | [ROZH-Player_1.0.8_x64-setup.exe](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.8/ROZH-Player_1.0.8_x64-setup.exe) |
| macOS — Apple Silicon | [ROZH-Player_1.0.8_aarch64.dmg](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.8/ROZH-Player_1.0.8_aarch64.dmg) |
| macOS — Intel | [ROZH-Player_1.0.8_x64.dmg](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.8/ROZH-Player_1.0.8_x64.dmg) |
| Linux — Debian/Ubuntu | [ROZH-Player_1.0.8_amd64.deb](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.8/ROZH-Player_1.0.8_amd64.deb) |
| Linux — Fedora/RHEL/openSUSE | [ROZH-Player-1.0.8-1.x86_64.rpm](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.8/ROZH-Player-1.0.8-1.x86_64.rpm) |
| Linux — AppImage | [ROZH-Player_1.0.8_amd64.AppImage](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.8/ROZH-Player_1.0.8_amd64.AppImage) |
| Android phones and tablets (APK) | [ROZH-Player-1.0.8.apk](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.8/ROZH-Player-1.0.8.apk) |
| Android phones and tablets (Google Play bundle) | [ROZH-Player-1.0.8.aab](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.8/ROZH-Player-1.0.8.aab) |
| Android TV (dedicated APK) | [ROZH-Player-TV-1.0.8.apk](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.8/ROZH-Player-TV-1.0.8.apk) |
| Android TV (Google Play bundle) | [ROZH-Player-TV-1.0.8.aab](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.8/ROZH-Player-TV-1.0.8.aab) |
| Web / PWA | [rozh-player-web.zip](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.8/rozh-player-web.zip) |

## What changed

### Android TV

- Added a dedicated Home destination with a persistent left navigation rail, a featured media area, and browsable resume, recent, video, and music shelves.
- Put device-library scan, folder selection, open-file, and open-link actions within easy reach from the TV home.
- Reworked the TV shell into a 10-foot layout with larger type, stronger focus states, overscan-safe spacing, and D-pad navigation between the rail and content.
- TV builds now launch directly into Home; the Back key returns to Home from other views. Playback keeps its immersive TV presentation and remote controls.
- Added English and Persian Home labels. The existing phone and tablet shell is unchanged.

### Compatibility and upgrades

- The dedicated Android TV package remains separate from the Android phone/tablet package.
- Android version code is incremented and release signing identity is retained so existing installations can update in place.
- Other platform builds and the in-app update feeds remain part of the standard release workflow.

### Validation

- `npm run build` — TypeScript check and Vite production build passed.
- `git diff --check` passed.
- This environment has no browser runtime or physical Android TV, so visual browser QA, device navigation, and playback on a real TV have not been verified. Please validate D-pad behavior on representative devices.

---

# ROZH Player 1.0.7

**Android touch usability and responsive playback controls**

## Download

| Platform | Release asset |
| --- | --- |
| Windows 10/11 (x64) | [ROZH-Player_1.0.7_x64-setup.exe](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.7/ROZH-Player_1.0.7_x64-setup.exe) |
| macOS — Apple Silicon | [ROZH-Player_1.0.7_aarch64.dmg](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.7/ROZH-Player_1.0.7_aarch64.dmg) |
| macOS — Intel | [ROZH-Player_1.0.7_x64.dmg](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.7/ROZH-Player_1.0.7_x64.dmg) |
| Linux — Debian/Ubuntu | [ROZH-Player_1.0.7_amd64.deb](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.7/ROZH-Player_1.0.7_amd64.deb) |
| Linux — Fedora/RHEL/openSUSE | [ROZH-Player-1.0.7-1.x86_64.rpm](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.7/ROZH-Player-1.0.7-1.x86_64.rpm) |
| Linux — AppImage | [ROZH-Player_1.0.7_amd64.AppImage](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.7/ROZH-Player_1.0.7_amd64.AppImage) |
| Android phones and tablets (APK) | [ROZH-Player-1.0.7.apk](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.7/ROZH-Player-1.0.7.apk) |
| Android phones and tablets (Google Play bundle) | [ROZH-Player-1.0.7.aab](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.7/ROZH-Player-1.0.7.aab) |
| Android TV (dedicated APK) | [ROZH-Player-TV-1.0.7.apk](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.7/ROZH-Player-TV-1.0.7.apk) |
| Android TV (Google Play bundle) | [ROZH-Player-TV-1.0.7.aab](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.7/ROZH-Player-TV-1.0.7.aab) |
| Web / PWA | [rozh-player-web.zip](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.7/rozh-player-web.zip) |

## What changed

### Android phone, tablet, and TV usability

- Reworked the phone transport bar so play, seek, volume, time, and fullscreen stay on-screen instead of being pushed beyond the edge by desktop-only actions.
- Kept the advanced player actions available in the player's action tray while simplifying the primary touch controls.
- Made volume adjustment directly reachable by touch; narrowed the controls and safely prioritised essential actions on very small phones.
- Reflowed the Android media-library scan and folder actions into a full-width, thumb-friendly row on narrow screens.
- Kept settings section names visible in the horizontally scrollable settings navigation instead of relying on unlabeled icons.
- Improved tab-label clipping and top-bar sizing at very narrow widths; retained safe-area spacing for notched devices.
- The responsive changes apply to Android phones and tablets; the separate Android TV package retains its 10-foot layout and focus controls.

### Compatibility and upgrades

- Android minimum remains 7.0 (API 24). The Android phone and dedicated Android TV packages use the same persistent signing identity and an incremented version code for in-place upgrades.
- Desktop, Android, Android TV, and web release artifacts are built by the release workflow. Desktop in-app updates and Android package-installer updates remain enabled.

### Validation

- [npm run build](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.7/npm run build) (TypeScript check and Vite production build).
- Android phone/TV native project generation and packaging remain covered by the release workflow. This sandbox has no Android SDK or physical Android devices; real-device verification is still recommended for OEM-specific touch, permission, and media-decoder behaviour.

---

# ROZH Player 1.0.6

**Updates that install over the old version — on every platform.**

_1.0.6 corrected the updater manifest so every platform points at the package its updater can install — the AppImage on Linux, the `.app` archive on macOS, and the NSIS installer on Windows. Installing 1.0.6 by hand once puts you on the fixed update channel._

Windows · macOS · Linux · Android · Android TV · Web

## Download

| Platform | File |
| --- | --- |
| **Windows 10/11 (x64)** | `ROZH-Player_1.0.6_x64-setup.exe` |
| **macOS — Apple Silicon (M1–M4)** | `ROZH-Player_1.0.6_aarch64.dmg` |
| **macOS — Intel** | `ROZH-Player_1.0.6_x64.dmg` |
| **Linux (Debian/Ubuntu)** | `ROZH-Player_1.0.6_amd64.deb` |
| **Linux (Fedora/RHEL/openSUSE)** | `ROZH-Player-1.0.6-1.x86_64.rpm` |
| **Linux (any distribution)** | `ROZH-Player_1.0.6_amd64.AppImage` |
| **Android 7.0+ (phones, tablets)** | `ROZH-Player-1.0.6.apk` |
| **Android TV (dedicated build)** | `ROZH-Player-TV-1.0.6.apk` |
| **Google Play bundles** | `ROZH-Player-1.0.6.aab`, `ROZH-Player-TV-1.0.6.aab` |
| **Web / PWA** | `rozh-player-web.zip` |

## Install

**Windows** — run the setup executable. **macOS** — open the DMG and move ROZH Player to Applications. **Linux** — install the DEB/RPM or run the AppImage. **Android** — open the APK and allow installation from this source if prompted. **Android TV / Fire TV** — sideload the dedicated TV APK; it is a separate package with its own Leanback launcher entry and banner.

## What is new in 1.0.6

### Update from inside the app

Settings → **Updates** checks, downloads, and installs the next version without leaving ROZH Player. The card shows the version, download progress, and a restart action when ready.

- **Windows, macOS, Linux** — signed updater manifests are verified against the embedded public key; the updater downloads and installs the compatible package in place.
- **Android and Android TV** — the matching phone or TV APK is handed to Android's package installer; the installed app is replaced rather than duplicated.
- An optional quiet check runs after launch. It can be disabled in Settings.

### Android media support

- Automatically indexes device media and lets users add folders through Android's document picker.
- A loopback HTTP media server serves readable `content://` files with byte-range support for seeking.
- Offers a system-player handoff when the embedded decoder cannot handle a file.

### Upgrade signing

Android in-place upgrades require the same signing identity and a higher version code. From 1.0.5 onward the APKs use a persistent release key and an incremented version code. **Users upgrading directly from 1.0.4 must uninstall that one version first**, because 1.0.4 used a different temporary key; install 1.0.6 (or later) after that one-time migration.

### Fixed in 1.0.6

- Corrected the updater manifest to select the installable package for each desktop platform.
- Removed stray Android signature sidecar files from release assets.
- Added checks that fail release builds when an expected desktop updater artifact is missing.

---

# ROZH Player 1.0.5 and earlier

See the [GitHub releases](https://github.com/Dark-Sky07/Rozh-Player/releases) for previous version assets and notes.
