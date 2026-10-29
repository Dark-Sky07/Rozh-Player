# ROZH Player 1.0.6

**Updates that install over the old version — on every platform.**

_1.0.6 is the same feature set as 1.0.5 with a corrected update manifest: the
published `latest.json` now points every platform at the package the updater can
actually install (the AppImage tarball on Linux, the `.app` archive on macOS, the
NSIS installer on Windows), instead of whichever signed file the bundler happened
to write last. Installing 1.0.6 by hand once puts you on the fixed channel;
everything after it updates from inside the app._

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
| **Web / PWA** | `rozh-player-web.zip` — unzip and serve from any static host |

## Install

**Windows** — run the `setup.exe`. SmartScreen shows "Windows protected your PC"
because the build carries no commercial code-signing certificate; choose
**More info → Run anyway**.

**macOS** — open the `dmg` and drag ROZH Player into Applications. On first launch
Gatekeeper may refuse an unidentified developer; right-click the app and choose
**Open**.

**Linux** — `sudo apt install ./ROZH-Player_1.0.6_amd64.deb`, or `chmod +x` the
AppImage and run it.

**Android** — open `ROZH-Player-1.0.6.apk`, allow "install unknown apps" once, and
the package installer updates the app in place.

**Android TV / Fire TV** — sideload `ROZH-Player-TV-1.0.6.apk`. It is a separate
package (`…rozh.player.tv`) with its own `LEANBACK_LAUNCHER` entry and banner.

## What is new

### Update from inside the app

Settings → **Updates** now checks, downloads and installs the next version
without leaving ROZH. The card shows the new version, the download size, a real
progress bar, and a **Restart now** button when the update is ready.

- **Windows, macOS, Linux** — the release ships a signed updater manifest. ROZH
  downloads the new build in the background, verifies its signature against the
  embedded public key and starts it; the app relaunches into the new version
  itself. Nothing to uninstall, nothing to find in a downloads folder.
- **Android and Android TV** — ROZH reads the newest release, picks the APK that
  matches the package (the TV build never downloads the phone build and vice
  versa), hands the download to Android's download manager and opens the package
  installer when it completes. The installed app is replaced, not duplicated.
- **Automatic** — a quiet check runs a few seconds after launch. If a newer
  version exists, a toast points to Settings. The check can be turned off, and
  it is a plain HTTPS request to the public release feed: no account, no ping.

### Upgrades are in place, permanently

Android only updates an app in place when the new APK is signed with the **same**
key and reports a **higher** version code. From this release on:

- every APK is signed with one long-lived release key (valid to 2055);
- the version code is pinned in the build config and climbs with every version
  (`1.0.6` → `1000005`), so the store and the installer always agree.

**One-time note for 1.0.4 users:** 1.0.4 was signed with a throwaway key that no
longer exists, so Android refuses to upgrade across it. Uninstall 1.0.4 once,
install 1.0.6, and every future version will install straight over the top.

### A local media server for the files Android's decoder refuses

Files that live behind `content://` cannot be played by a WebView at all, and
MKV/AC-3/DTS files are outside what the device decoder accepts. ROZH now starts a
tiny HTTP server inside its own process:

- streams any file the app is allowed to read over `127.0.0.1` with real HTTP
  `Range` support, so seeking works and JS players can fetch byte ranges;
- serves the exact `content://` URI the device library hands over, so nothing has
  to be copied to a temporary folder first;
- if a container still cannot be decoded by the webview, the player offers
  **Play in system player** and hands the file to the device's own player or VLC
  instead of showing a dead end.

The server is loopback-only, needs no permission, and stops with the app.

### Fixed in 1.0.6

- **The update manifest now names the right file per platform.** Tauri signs every
  Linux bundle, so `latest.json` could point at the `.deb` or `.rpm`; only an
  AppImage can replace a running AppImage. The collector ranks the candidates
  (AppImage tarball → AppImage → `app.tar.gz` → NSIS installer) and refuses to
  publish a manifest with a gap.
- **The release pipeline exports the updater key as content**, which is what
  Tauri expects (`TAURI_SIGNING_PRIVATE_KEY`), instead of a path — desktop
  bundles were failing to sign at the very last step.
- **Media URLs carry the real file name**, so the loopback server returns the
  correct `Content-Type` for device files whose `content://` path has no
  extension.
- `.idsig` side files no longer clutter the release assets.

### Fixes

- **Android commands no longer go missing after a restart.** The native bridge
  ignores a command whose id matches the last one it saw, and ids restarted at 1
  on every launch — so the first commands of a session (including the launch
  scan) were dropped. Ids are now monotonic across launches.
- **Android library files play.** Device items are routed through the loopback
  server, which fixes the silent "nothing happens" on media that the webview
  could not open at all.
- Windows installs stay per-machine, so 1.0.6 replaces 1.0.4 in the same folder.
  The updater may ask for administrator permission once while it swaps the files.

## How updates are delivered

| Platform | Mechanism | Restart |
| --- | --- | --- |
| Windows | Signed NSIS installer, run silently by the updater | automatic |
| macOS | Signed `.app.tar.gz`, exchanged in place | automatic |
| Linux (AppImage) | Signed `.AppImage.tar.gz`, exchanged in place | automatic |
| Linux (deb / rpm) | Detected and reported; install with your package manager | manual |
| Android / Android TV | System download manager + package installer | automatic |

Signing keys for the updater and for Android live in the repository because the
release pipeline has to sign every artefact unattended; rotating them would break
updates for everyone already running a release, so they never change.
