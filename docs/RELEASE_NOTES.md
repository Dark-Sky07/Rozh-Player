# ROZH Player 1.0.4

**A phone build that feels like an app, a TV build that feels like a TV, and a
library that fills itself.**

Windows · macOS · Linux · Android · Android TV · Web

## Download

| Platform | File |
| --- | --- |
| **Windows 10/11 (x64)** | `ROZH.Player_1.0.4_x64-setup.exe` |
| **macOS — Apple Silicon (M1–M4)** | `ROZH.Player_1.0.4_aarch64.dmg` |
| **macOS — Intel** | `ROZH.Player_1.0.4_x64.dmg` |
| **Linux (Debian/Ubuntu)** | `ROZH.Player_1.0.4_amd64.deb` |
| **Linux (Fedora/RHEL/openSUSE)** | `ROZH.Player-1.0.4-1.x86_64.rpm` |
| **Linux (any distribution)** | `ROZH.Player_1.0.4_amd64.AppImage` |
| **Android 7.0+ (phones, tablets)** | `ROZH-Player-1.0.4.apk` |
| **Android TV (dedicated build)** | `ROZH-Player-TV-1.0.4.apk` |
| **Google Play bundles** | `ROZH-Player-1.0.4.aab`, `ROZH-Player-TV-1.0.4.aab` |
| **Web / PWA** | `rozh-player-web.zip` — unzip and serve from any static host |

## Install

**Windows** — run the `setup.exe`. SmartScreen shows "Windows protected your PC"
because the build carries no commercial code-signing certificate; choose
**More info → Run anyway**.

**macOS** — open the `dmg` and drag ROZH Player into Applications. On first launch
Gatekeeper may refuse an unidentified developer; right-click the app and choose
**Open** (or allow it in System Settings → Privacy & Security).

**Linux** — `sudo apt install ./ROZH.Player_1.0.4_amd64.deb`, or `chmod +x` the
AppImage and run it.

**Android** — sideload `ROZH-Player-1.0.4.apk`. Allow "install unknown apps" for
your file manager when Android asks. On first launch Android asks for media
access — grant it and the library fills itself.

**Android TV / Fire TV** — sideload `ROZH-Player-TV-1.0.4.apk` (USB stick,
`adb install`, or a file manager on the box). It is a separate package
(`…rozh.player.tv`), so it can sit next to the phone app, and it declares
`LEANBACK_LAUNCHER`, so it appears in the TV launcher with its own banner.

## What is new

### The device library indexes itself

Every time the phone or the TV app starts, ROZH asks Android for the media index
and adds everything it finds — videos and (optionally) music — to the library:

- **MediaStore scan** of all video and audio on internal storage and SD cards,
  with name, size, duration, folder and a system-generated thumbnail.
- **Folder picker** for anything the system index does not know about. ROZH
  remembers the folder across launches (persisted SAF grant) and re-indexes it
  next time.
- **Stays in sync**: entries removed from the device disappear from the library;
  nothing is duplicated on the next launch.
- The permission prompt appears once. If access is refused, the library shows a
  card explaining how to grant it instead of an empty grid.
- Controls: **Settings → Device library** (auto-index on/off, include audio,
  scan now, add folder) and the device strip at the top of the library.

### Two new interfaces

The desktop shell was being stretched onto phones and televisions. It is not any
more — both platforms now have their own layout:

**Phones** — a real mobile app:
- compact app bar with the logo, current destination and the three actions that
  matter; the destination list lives in a drawer and a bottom tab bar
- thumb-sized controls, 48 px tab targets, safe-area padding on notched phones
- two-column library (three on tablets), horizontal filter chips, no hover-only
  affordances, no 300 px sidebar eating a third of the screen
- the player is edge to edge, ignores browser scroll chaining, and survives
  rotation and landscape (chrome hides, video keeps the full frame)

**Android TV** — a 10-foot interface:
- one horizontal top bar (brand · Player · Library · Live & links · Recent ·
  Settings · Open link · Open file) instead of a desktop side rail
- overscan-safe margins, larger type, larger cards, larger transport buttons
- every control shows a focus ring; nothing depends on hover
- **spatial D-pad navigation** with a corridor-aware neighbour search: arrows
  move to the control the viewer is looking at, OK activates, Back closes the
  topmost sheet or returns to the player
- remote transport keys (`MediaPlayPause`), timeline scrubbing from the video
  surface, and the first focus lands on something usable after every route
  change

### Also in this release

- Typography: Latin text and numbers now use the platform UI font, so an English
  interface never shows Persian-shaped digits; Persian still uses Vazirmatn
- `hidden` is now authoritative — elements marked hidden can no longer be forced
  visible by a component rule (sleep chip, stats panel, lock veil)
- Empty player no longer shows drop targets and codec badges on TV/phone
- Shortcuts and About are reachable from Settings (needed on TV, handy on phone)
- CI asserts the Android bridge wiring (manifest permissions, `MediaBridge.java`,
  `MainActivity` hooks) before the APK is built, next to the existing manifest
  and TV-package checks

## Formats

Everything the platform decodes, plus:

- **Containers** MP4, MKV, WebM, MOV, AVI, TS, M2TS, FLV, WMV, 3GP, OGG
- **Codecs** H.264, H.265/HEVC, VP8/VP9, AV1, MPEG-2/4, AAC, MP3, FLAC, Opus,
  Vorbis, WAV, AC-3 and more — subject to the platform decoder
- **Streams** HLS (`.m3u8`), DASH (`.mpd`), MPEG-TS / FLV over HTTP with the
  bundled software demuxer
- **Subtitles** SRT, WebVTT, ASS/SSA (libass), embedded text tracks
- Desktop adds an FFmpeg fallback that remuxes or transcodes anything the
  webview refuses (MKV with AC-3, AVI, old MPEG-4 …)

Android plays what the system decoder supports; exotic codecs that only FFmpeg
can open are available in the desktop builds.

## Notes

- Builds are unsigned; Windows SmartScreen and macOS Gatekeeper will ask once.
- No account, no telemetry, no server: the library lives on your device.
- ROZH Player is MIT licensed.
