# ROZH Player 1.0.9

**A rebuilt Windows desktop workspace and reliable Explorer playback**

## Direct downloads

| Platform | Download |
| --- | --- |
| Windows 10/11 (x64) | [Windows installer](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.9/ROZH-Player_1.0.9_x64-setup.exe) |
| macOS — Apple Silicon | [DMG](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.9/ROZH-Player_1.0.9_aarch64.dmg) |
| macOS — Intel | [DMG](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.9/ROZH-Player_1.0.9_x64.dmg) |
| Linux — Debian/Ubuntu | [DEB](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.9/ROZH-Player_1.0.9_amd64.deb) |
| Linux — Fedora/RHEL/openSUSE | [RPM](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.9/ROZH-Player-1.0.9-1.x86_64.rpm) |
| Linux — AppImage | [AppImage](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.9/ROZH-Player_1.0.9_amd64.AppImage) |
| Android phones and tablets | [APK](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.9/ROZH-Player-1.0.9.apk) · [Google Play bundle](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.9/ROZH-Player-1.0.9.aab) |
| Android TV (dedicated build) | [TV APK](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.9/ROZH-Player-TV-1.0.9.apk) · [TV Google Play bundle](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.9/ROZH-Player-TV-1.0.9.aab) |
| Web / PWA | [Static bundle](https://github.com/Dark-Sky07/Rozh-Player/releases/download/v1.0.9/rozh-player-web.zip) |

## What changed

### Windows desktop

- Replaced the player-first landing screen with a dedicated media workspace: a home dashboard for continue-watching and recent items, clear Library / Streams / History destinations, and a single global **Open media** action.
- Removed redundant Open buttons from the Windows sidebar and empty/error player panels. The remaining toolbar action, Ctrl+O, drag-and-drop, and Explorer file opening all route to the visible player.
- Fixed click bubbling that previously triggered two file pickers from controls inside the player; opening files from another page now switches to playback rather than leaving the result hidden behind that page.
- Registered common video, audio, and M3U8 file types for Windows **Open with** / default-app selection.
- Added single-instance handoff: launching a media file from Explorer starts playback immediately, or forwards it to the already-running ROZH window.

### Design references

- Applied the practical conventions of desktop media players: an obvious file-open path and persistent queue/playback context (VLC / PotPlayer), separate Video, Music and file-library destinations (Kodi / KMPlayer), and a concise home for recent media. No interface was copied.

### Compatibility and upgrades

- Bumped Windows and app versions to 1.0.9; Android version code is incremented and the existing signing identity is retained.
- Phone/tablet navigation and the dedicated Android TV shell remain separate.
- After installing, choose **ROZH Player** once in Windows' **Open with → Always** prompt (or set it under Default apps) if another app already owns the file type. Windows does not allow an installer to silently override that user choice.

### Validation

- `npm run build` — TypeScript check and Vite production build passed.
- Tauri configuration JSON and `git diff --check` passed.
- This environment does not include Rust/Windows tooling or a Windows device. The Windows native package and Explorer handoff are covered by the Windows release workflow; a real installed-build verification remains recommended.

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
