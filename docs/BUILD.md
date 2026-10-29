# Building ROZH Player

## 0. Common

```bash
npm install
node scripts/copy-libass.mjs     # runs automatically on predev/prebuild
```

## 1. Web / PWA

```bash
npm run dev       # http://localhost:5173
npm run build     # static site in dist/
npm run preview   # serve the production build
```

Deploy `dist/` to any static host. `manifest.webmanifest` + icons make it
installable; media keys work through the Media Session API.

## 2. Desktop

Install [Rust](https://rustup.rs) (1.77+) and the Tauri prerequisites for your OS.

### Windows
- Microsoft Visual Studio C++ Build Tools (Desktop development with C++)
- WebView2 runtime (preinstalled on Windows 11, bundled by the installer otherwise)

### macOS
```bash
xcode-select --install
```

### Linux (Debian/Ubuntu)
```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

### Build

```bash
node scripts/fetch-ffmpeg.mjs     # optional: native fallback engine
npm run tauri:dev                 # live app
npm run tauri:build               # installers in src-tauri/target/release/bundle
```

Bundle targets are declared in `src-tauri/tauri.conf.json` (`"targets": "all"`).

## 3. Android / Android TV

```bash
npm run tauri android init        # once — creates src-tauri/gen/android
npm run tauri android dev
npm run tauri android build
```

For TV, the quick way:

```bash
node scripts/patch-android-tv.mjs     # adds LEANBACK + optional touchscreen + banner
```

Or by hand:
1. Open `src-tauri/gen/android/app/src/main/AndroidManifest.xml`.
2. Inside the main `<activity>` add
   `<category android:name="android.intent.category.LEANBACK_LAUNCHER" />`.
3. Add `<uses-feature android:name="android.hardware.touchscreen" android:required="false" />`.
4. ROZH detects the TV at runtime and switches to the 10-foot layout
   (or force it in Settings → TV mode).

## 4. CI

`.github/workflows/ci.yml` type-checks, builds the web bundle and runs
`cargo check` + the Rust unit tests on every push.

`.github/workflows/release.yml` builds the whole matrix when a tag `v*` is
pushed and attaches everything to a **draft** release:

| Job | Runner | Artefacts |
| --- | --- | --- |
| Windows | `windows-latest` | NSIS `*-setup.exe` |
| macOS | `macos-latest` × 2 | `aarch64.dmg`, `x64.dmg` |
| Linux | `ubuntu-22.04` | `.deb`, `.rpm`, `.AppImage` |
| Android | `ubuntu-latest` + NDK 27 | `.apk`, `.aab` |
| Web | `ubuntu-latest` | `rozh-player-web.zip` |

The release workflow can also be started by hand
(`workflow_dispatch` with a `tag` and an optional `only` filter).

Installers are **unsigned** — add the usual Tauri signing keys as repository
secrets before shipping to end users. The Android job creates an ephemeral
keystore so the APK installs; put a real keystore in `src-tauri/keystore/` and
a matching `keystore.properties` to sign with your own key.

## 5. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `ffmpeg sidecar not found` | run `node scripts/fetch-ffmpeg.mjs` |
| Blank window on Linux | missing `WEBKIT_DISABLE_COMPOSITING_MODE=1`? set it for older Mesa drivers |
| MKV won't play in the browser | expected — browsers don't demux MKV; use the desktop build |
| libass didn't load | ensure `public/jassub/` exists (run `npm run prebuild`) |
