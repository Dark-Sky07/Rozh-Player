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

`patch-android-tv.mjs` must run after `init` and before **every** build — it
enables cleartext `http://` playback (Android 9+ blocks it by default, which is
what made phone streaming fail), declares the network permissions, turns on
hardware acceleration and adds the LEANBACK launcher category:

```bash
node scripts/patch-android-tv.mjs
node scripts/patch-android-native.mjs   # device media library
```

### Device media library

The phone and TV builds index the whole device instead of waiting to be handed
files. Two Android APIs do the work, both unreachable from the webview, so a
small Java class is generated into the project by the second patch script:

```bash
node scripts/patch-android-native.mjs
```

It does four things:

1. copies `scripts/android/MediaBridge.java` into the generated project, using
   the package the Tauri template actually produced (read from
   `MainActivity.kt`, never hard-coded);
2. wires `MainActivity` — `MediaBridge.attach(this)` in `onCreate` plus
   `onRequestPermissionsResult` and `onActivityResult` forwarding;
3. declares `READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO`, `REQUEST_INSTALL_PACKAGES`
   and (Android 12 and older) `READ_EXTERNAL_STORAGE`;
4. adds a `FileProvider` (`@xml/rozh_file_paths`) so the downloaded update APK
   can be handed to the package installer as a `content://` URI instead of a
   `file://` URI, which Android 7+ refuses.

`MediaBridge` queries **MediaStore** for videos and audio, resolves thumbnails,
and enumerates any folder the user picked with `ACTION_OPEN_DOCUMENT_TREE`
(persisted with `takePersistableUriPermission`). Results are written to a JSON
state file in the app cache directory; Rust (`android_media_scan`,
`android_media_status`, `android_media_pick_folder`, `android_open_external`,
`android_media_server`, `android_update_install`, `android_update_status`) is only
the mailbox that carries it to the UI. No JNI, no reflection, no binder from the
Rust side — a failed scan can never take the player down.

Mailbox ids come from `next_token()`, which mixes wall-clock milliseconds with a
counter: a fresh process must never reuse an id a previous run left on disk, or
the bridge would ignore the first commands of the session.

### Loopback media server

`content://` URIs are readable by the app but not by `<video src>` in a WebView,
and no JS player can fetch them. `MediaBridge` therefore opens a `ServerSocket`
on `127.0.0.1` (random port, written to `server.json`) and serves any URI the app
can open:

```
GET http://127.0.0.1:<port>/s/<base64url(uri)>/<name>   200 | 206 + Range
```

`src/core/mediaServer.ts` rewrites device-library URLs through it and leaves
`http(s)://` sources untouched. The file name stays in the path so the player
still recognises the container. When even the server cannot help — AC-3, DTS or
VC-1 that the device decoder has no support for — the player offers **Play in
system player** (`android_open_external`), which hands the URI to the device's
own player or VLC.

### Dedicated Android TV package

The TV build is a second package from the same source, with the 10-foot
interface compiled in (`VITE_TV_BUILD=1`) instead of detected at runtime:

```bash
node scripts/patch-android-tv.mjs
node scripts/patch-android-native.mjs
npx tauri android build --apk --aab                   # phone package
node scripts/make-tv-variant.mjs                      # own applicationId + banner
VITE_TV_BUILD=1 npx tauri android build --apk --aab   # TV package
```

`VITE_TV_BUILD=1` is set only for the second build: the phone package must not
bake the 10-foot interface in.

`make-tv-variant.mjs` changes `applicationId` to `…rozh.player.tv`, sets the
label to **ROZH Player TV**, installs `icons/tv-banner.png` as the 320×180
launcher banner, marks `leanback` as required, drops the touchscreen requirement
and locks the activity to landscape.

By hand, the manifest needs:
1. `<category android:name="android.intent.category.LEANBACK_LAUNCHER" />` inside
   the main `<activity>`.
2. `<uses-feature android:name="android.software.leanback"
   android:required="true" />` and touchscreen `required="false"`.
3. `android:usesCleartextTraffic="true"` on `<application>`.
4. `android:banner="@drawable/tv_banner"` plus the drawable itself.

## 4. CI

`.github/workflows/ci.yml` type-checks, builds the web bundle and runs
`cargo check` + the Rust unit tests on every push.

`.github/workflows/release.yml` builds the whole matrix when a tag `v*` is
pushed and attaches everything to a published release (`draft: false`):

| Job | Runner | Artefacts |
| --- | --- | --- |
| Windows | `windows-latest` | NSIS `*-setup.exe` |
| macOS | `macos-latest` × 2 | `aarch64.dmg`, `x64.dmg` |
| Linux | `ubuntu-22.04` | `.deb`, `.rpm`, `.AppImage` |
| Android | `ubuntu-latest` + NDK 27 | `.apk`, `.aab` (phone **and** `-TV-` variants) |
| Web | `ubuntu-latest` | `rozh-player-web.zip` |
| Manifest | `ubuntu-latest` (after desktop) | `latest.json` |

The release workflow can also be started by hand
(`workflow_dispatch` with a `tag` and an optional `only` filter).

## 5. Signing and in-app updates

Three keys matter, and none of them may ever be regenerated:

| File | Purpose | Password |
| --- | --- | --- |
| `src-tauri/updater/rozh-updater.key` | signs desktop update artefacts | `rozh-updater-key` |
| `src-tauri/keystore/rozh-release.p12` (alias `rozh`) | signs every Android APK/AAB | `rozhplayer` |

The updater public key is inlined in `src-tauri/tauri.conf.json`
(`plugins.updater.pubkey`). The APK key is what makes Android treat a new version
as an *upgrade*: a different certificate means "App not installed", and a lower
`versionCode` (`bundle.android.versionCode` in `tauri.conf.json`, currently
`1000005`) means the installer silently refuses.

Desktop bundles are produced with `createUpdaterArtifacts: true`, which writes a
`.sig` next to every updater artifact. `scripts/collect-desktop-artifacts.mjs`
renames them deterministically (the macOS `.app.tar.gz` name collides across
architectures), and the `latest` job merges the per-runner manifests into the
`latest.json` the app polls:

```json
{
  "version": "1.0.5",
  "notes": "…",
  "pub_date": "…",
  "platforms": {
    "windows-x86_64": { "signature": "…", "url": "https://github.com/…" }
  }
}
```

Rotating either key breaks updates for everyone already on a release, so rotate
only with a deliberate migration plan. `src-tauri/updater/*.key` and
`src-tauri/keystore/*.p12` are committed on purpose — the pipeline has no access
to repository secrets.

Android updates go through the system: `android_update_install(url)` writes a
`command.json`, `MediaBridge` enqueues the APK in `DownloadManager`, polls the
progress into `update.json`, then opens the installer through the `FileProvider`.
`src/core/updateUI.ts` renders the card in Settings → Updates.

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
