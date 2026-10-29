# ROZH Player 1.0.2

**One player, every platform — Windows · macOS · Linux · Android · Android TV · Web**

## Download

| Platform | File |
| --- | --- |
| **Windows 10/11 (x64)** | `ROZH.Player_1.0.2_x64-setup.exe` |
| **macOS — Apple Silicon (M1–M4)** | `ROZH.Player_1.0.2_aarch64.dmg` |
| **macOS — Intel** | `ROZH.Player_1.0.2_x64.dmg` |
| **Linux (Debian/Ubuntu)** | `ROZH.Player_1.0.2_amd64.deb` |
| **Linux (Fedora/RHEL/openSUSE)** | `ROZH.Player-1.0.2-1.x86_64.rpm` |
| **Linux (any distribution)** | `ROZH.Player_1.0.2_amd64.AppImage` |
| **Android 7.0+ / Android TV** | `ROZH-Player-1.0.2.apk` |
| **Web / PWA** | `rozh-player-web.zip` — unzip and serve from any static host |

## Install

**Windows** — run the `setup.exe`. SmartScreen shows "Windows protected your PC"
because the build carries no commercial code-signing certificate; choose
**More info → Run anyway**.

**macOS** — open the `dmg` and drag ROZH Player into Applications. On first launch
Gatekeeper may refuse an unidentified developer; right-click the app and choose
**Open** (or allow it in System Settings → Privacy & Security).

**Linux** — `sudo apt install ./ROZH.Player_1.0.2_amd64.deb`, or `chmod +x` the
AppImage and run it.

**Android / Android TV** — sideload the APK. On a TV it appears in the LEANBACK
launcher row after install. The build is signed with an ephemeral CI key, so a
later release may require uninstalling the previous one first.

**Web** — serve the unzipped folder from any static web server (`npx serve`,
nginx, …). It is a PWA, so Chrome and Edge can install it.

## What's new in 1.0.2

**Every change now ships as a new, published release.** Release notes and tags
are English-only and versioned from here on.

### Interface

- **English is the default language** for new installs on every platform; the
  Persian and Kurdish translations remain complete and one click away.
- 47 languages with a searchable picker, per-language coverage badges and
  automatic RTL/LTR layout switching.
- Redesigned shell: floating rail and topbar, layered surfaces, ember buttons,
  row-style tool tiles, technical stats panel and a sticky section jump bar in
  Settings.
- New **Picture & effects** and **Gestures** settings sections: aspect ratio,
  rotation, flips, effects, screen lock, double-tap seek, hold-for-2×, stats,
  sleep timer and frame-step length.
- Mobile layout fix: the rail now closes correctly in RTL and no longer widens
  the viewport; icons always render at a sane size.

### Player

- Frame stepping honours the configured frame length, bound to `,` `.` and
  `Alt + ←/→`.
- New shortcuts: `E` effects, `I` stats, `A` aspect ratio, `Z` sleep timer,
  `D` subtitle sync, `Ctrl/⌘ + B` scene bookmark. The shortcuts sheet and the
  tools drawer both document them.

### Audio

- **Audio actually plays.** Building the Web Audio graph on every playback
  silenced cross-origin streams in Chromium; the graph is now created only while
  the equalizer is enabled, and tainted sources are skipped with a clear message
  instead of going quiet.
- The mute state survives graph creation: volume and mute are owned by a single
  code path.

### Release engineering

- Releases are published automatically instead of waiting as drafts.
- Android artefacts now carry the real version number in their filenames.

## Known limitations

- Builds are **unsigned** (no commercial Windows/macOS certificate in CI).
- **iOS** is not built; it needs an Apple developer account and provisioning.
- FFmpeg is not bundled (size + GPL); drop an `ffmpeg` binary next to the app to
  enable the native fallback. All common formats play without it.
- In the web build MKV/AVI cannot be demuxed by the browser — use a desktop build.

---

### Technical

Built from source at the commit tagged `v1.0.2`:

- UI: TypeScript + Vite, zero framework, ~66 kB gzip
- Shell: Tauri 2 (Rust) — WebView2 / WKWebView / WebKitGTK
- Android: NDK r27, minSdk 24, arm64-v8a + armeabi-v7a + x86_64
- CI: GitHub Actions matrix (Windows · macOS universal · Linux · Android · Web)

`npm run tauri:build` reproduces these packages on your own machine; see
`docs/BUILD.md`.
