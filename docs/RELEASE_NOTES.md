# ROZH Player 1.0.3

**Playback that finally works on the phone — plus a real Android TV build.**

Windows · macOS · Linux · Android · Android TV · Web

## Download

| Platform | File |
| --- | --- |
| **Windows 10/11 (x64)** | `ROZH.Player_1.0.3_x64-setup.exe` |
| **macOS — Apple Silicon (M1–M4)** | `ROZH.Player_1.0.3_aarch64.dmg` |
| **macOS — Intel** | `ROZH.Player_1.0.3_x64.dmg` |
| **Linux (Debian/Ubuntu)** | `ROZH.Player_1.0.3_amd64.deb` |
| **Linux (Fedora/RHEL/openSUSE)** | `ROZH.Player-1.0.3-1.x86_64.rpm` |
| **Linux (any distribution)** | `ROZH.Player_1.0.3_amd64.AppImage` |
| **Android 7.0+ (phones, tablets)** | `ROZH-Player-1.0.3.apk` |
| **Android TV (dedicated build)** | `ROZH-Player-TV-1.0.3.apk` |
| **Google Play bundles** | `ROZH-Player-1.0.3.aab`, `ROZH-Player-TV-1.0.3.aab` |
| **Web / PWA** | `rozh-player-web.zip` — unzip and serve from any static host |

## Install

**Windows** — run the `setup.exe`. SmartScreen shows "Windows protected your PC"
because the build carries no commercial code-signing certificate; choose
**More info → Run anyway**.

**macOS** — open the `dmg` and drag ROZH Player into Applications. On first launch
Gatekeeper may refuse an unidentified developer; right-click the app and choose
**Open** (or allow it in System Settings → Privacy & Security).

**Linux** — `sudo apt install ./ROZH.Player_1.0.3_amd64.deb`, or `chmod +x` the
AppImage and run it.

**Android** — sideload `ROZH-Player-1.0.3.apk`. Allow "install unknown apps" for
your file manager when Android asks.

**Android TV / Fire TV** — sideload `ROZH-Player-TV-1.0.3.apk` (or install it
through a USB stick / `adb install`). It is a separate package
(`…rozh.player.tv`), so it can sit next to the phone app, it appears in the
launcher's apps row with its own banner, and it starts straight into the 10-foot
interface. Use *Send files to TV* or `adb` if you have no browser on the TV.

Both APKs are signed with an ephemeral CI key, so a later release may ask you to
uninstall the previous version first.

**Web** — serve the unzipped folder from any static web server (`npx serve`,
nginx, …). It is a PWA, so Chrome and Edge can install it.

## What's new in 1.0.3

### Android: nothing played — now everything does

Four separate root causes were found and fixed; each of them alone was enough to
make the phone build silent.

- **Local files.** The Android file dialog returns `content://` URIs, which no
  asset protocol can stream and which `<video>` cannot open — every file you
  picked turned into an empty `File` and a dead player. The mobile build now uses
  the webview's own file chooser, which hands back real `File` objects backed by
  the same content providers (Downloads, Google Photos, SD card, USB-OTG, SMB
  apps…). Seeking works because Chromium streams from the provider handle.
- **`http://` streams.** Android 9+ blocks cleartext traffic unless the manifest
  opts in. Most IPTV and mirror links are plain `http`, so they failed on the
  phone while working on the desktop. `usesCleartextTraffic` is now enabled, and
  `INTERNET` / `ACCESS_NETWORK_STATE` are declared explicitly.
- **Cross-origin (CORS) manifests.** Many panels do not send
  `Access-Control-Allow-Origin`, and hls.js reads playlists with `fetch`, so the
  manifest never loaded. HLS now retries through the native Rust HTTP layer
  (Tauri HTTP plugin), which is not bound by the webview's origin rules — on
  Android, Windows and Linux alike.
- **IPTV `.ts` / `.flv` links.** Chromium-based webviews cannot demux raw
  MPEG-TS or HTTP-FLV. A bundled software demuxer (mpegts.js) now feeds Media
  Source Extensions, so those channels play on every platform, phone included.

Playback failures are no longer a black screen: the error card shows the engine,
the `MediaError` code and whether the source was a local file or the network, so a
bug report is one screenshot away.

### New: dedicated Android TV build

`ROZH-Player-TV-1.0.3.apk` is built from the same source with the television
experience baked in, not merely detected:

- **Real D-pad navigation.** Spatial navigation replaces Tab order: the arrows
  move to the nearest control in that direction, the ring is drawn with a glow
  and a focus animation, and the highlight follows programmatic focus too.
- **Remote-first player.** On the video surface: ◀ ▶ seek, ◀▶ hold-style steps
  are the configured seek steps, **OK** plays/pauses, **▲ ▼** raise the control
  bar and put the ring on it, **Back** hides the controls, then leaves the player.
- **10-foot interface.** Everything scales up (cards, buttons, sliders,
  typography), the media grid uses fewer, larger cells, sheets widen, and
  overscan-safe margins keep content away from the bezel.
- **TV package details.** `leanback` required, touchscreen not required,
  sensor-landscape orientation, its own 320×180 launcher banner, and a separate
  `applicationId` so the phone app stays installed.
- The phone APK also appears in Android TV launcher rows (`LEANBACK_LAUNCHER`,
  optional touchscreen), so either package works on a box.

### Player & UI

- New `tv.css` layer: focus rings, larger transport controls, bigger stage title
  and empty-state artwork, no scrollbars on screens without a pointer.
- The video surface is now focusable, so a remote or a keyboard can drive
  playback without touching the controls first.
- `mpegts` is code-split, so it costs nothing until a `.ts`/`.flv` link is opened.

### Engineering

- `scripts/patch-android-tv.mjs` now also fixes cleartext traffic, permissions,
  hardware acceleration and heap size — every Android release gets them.
- New `scripts/make-tv-variant.mjs` produces the TV package (applicationId,
  label, banner, orientation, leanback features).
- CI builds **two** Android packages per release: phone + TV, APK and AAB, both
  signed and attached.

## Known limitations

- Builds are **unsigned** commercially (no Windows/macOS certificate in CI).
- **iOS** is not built; it needs an Apple developer account and provisioning.
- FFmpeg is not bundled (size + GPL); the desktop builds play virtually every
  container through the system webview and the remux fallback.
- In the web build MKV/AVI cannot be demuxed by the browser — use a desktop build.
- DRM (Widevine/PlayReady) content is not supported.

---

### Technical

Built from source at the commit tagged `v1.0.3`:

- UI: TypeScript + Vite, zero framework, ~70 kB gzip
- Shell: Tauri 2 (Rust) — WebView2 / WKWebView / WebKitGTK / Android WebView
- Streaming: hls.js, dash.js, mpegts.js (code-split), native Rust HTTP fallback
- Android: NDK r27, minSdk 24, arm64-v8a + armeabi-v7a + x86_64
- CI: GitHub Actions matrix (Windows · macOS universal · Linux · Android · Android TV · Web)

`npm run tauri:build` reproduces these packages on your own machine; see
`docs/BUILD.md`.
