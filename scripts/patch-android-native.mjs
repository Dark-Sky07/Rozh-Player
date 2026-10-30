/**
 * Prepares the generated Android project for the device media library.
 *
 * Run after `npx tauri android init` and after scripts/patch-android-tv.mjs
 * (idempotent, safe to run twice):
 *
 *   node scripts/patch-android-native.mjs
 *
 * What it does:
 *   1. Copies scripts/android/MediaBridge.java into the generated project with
 *      the package the Tauri template actually generated (the identifier is
 *      configurable, so it is read from MainActivity.kt, never hard-coded).
 *   2. Wires MainActivity: `MediaBridge.attach(this)` in onCreate plus the two
 *      result callbacks the framework needs in order to answer permission and
 *      folder-picker requests.
 *   3. Declares the MediaStore permissions, including Android 14's selected
 *      media access and legacy READ_EXTERNAL_STORAGE for Android 12 and older.
 *   4. Adds the self-update plumbing: REQUEST_INSTALL_PACKAGES plus a
 *      FileProvider so the downloaded APK can be handed to the package
 *      installer as a `content://` URI (a bare `file://` URI throws
 *      FileUriExposedException on Android 7+).
 */
import { readFile, writeFile, mkdir, readdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const gen = join(root, 'src-tauri', 'gen', 'android');
const javaRoot = join(gen, 'app', 'src', 'main', 'java');
const manifest = join(gen, 'app', 'src', 'main', 'AndroidManifest.xml');
const source = join(root, 'scripts', 'android', 'MediaBridge.java');
const resXml = join(gen, 'app', 'src', 'main', 'res', 'xml');

const fail = (msg) => {
  console.error(`::error title=android-native::${msg}`);
  process.exit(1);
};

await access(manifest).catch(() => fail('run `npx tauri android init` first (no manifest found)'));

/** Find the generated MainActivity.kt anywhere under src/main/java. */
async function findMainActivity(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = await findMainActivity(full);
      if (hit) return hit;
    } else if (entry.name === 'MainActivity.kt') {
      return full;
    }
  }
  return null;
}

let activityPath = null;
try {
  activityPath = await findMainActivity(javaRoot);
} catch {
  activityPath = null;
}
if (!activityPath) fail('MainActivity.kt not found in the generated project');

let activity = await readFile(activityPath, 'utf8');
const pkg = activity.match(/^\s*package\s+([\w.]+)/m)?.[1];
if (!pkg) fail('MainActivity.kt has no package declaration');

/* ---- 1. copy the bridge next to MainActivity --------------------------- */
const bridgeDir = dirname(activityPath);
const bridgeTarget = join(bridgeDir, 'MediaBridge.java');
const bridgeSource = await readFile(source, 'utf8');
const bridge = bridgeSource.replace(/^package\s+[\w.]+;/m, `package ${pkg};`);
await mkdir(bridgeDir, { recursive: true });
await writeFile(bridgeTarget, bridge);

/* ---- 2. wire MainActivity --------------------------------------------- */
const APP_START = '// rozh:media-bridge-start';
const APP_END = '// rozh:media-bridge-end';

if (!activity.includes(APP_START)) {
  // attach once the Tauri activity exists
  const onCreateRe = /(override\s+fun\s+onCreate\s*\([^)]*\)\s*\{)([\s\S]*?)(\n\s*\})/;
  if (!onCreateRe.test(activity)) {
    // some templates have no onCreate override yet — add one
    activity = activity.replace(
      /(class\s+MainActivity\s*:\s*[\w.]+\(\)\s*\{)/,
      `$1\n  override fun onCreate(savedInstanceState: android.os.Bundle?) {\n    super.onCreate(savedInstanceState)\n    ${pkg}.MediaBridge.attach(this)\n  }\n`,
    );
    if (!activity.includes('MediaBridge.attach')) fail('could not inject a onCreate override');
  } else {
    activity = activity.replace(onCreateRe, (full, open, body, close) => {
      if (body.includes('MediaBridge.attach')) return full;
      return `${open}${body}\n    ${pkg}.MediaBridge.attach(this)${close}`;
    });
  }

  const callbacks = `
  ${APP_START}
  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray,
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    ${pkg}.MediaBridge.onPermissions(requestCode, grantResults)
  }

  override fun onActivityResult(requestCode: Int, resultCode: Int, data: android.content.Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    ${pkg}.MediaBridge.onActivityResult(requestCode, resultCode, data)
  }
  ${APP_END}
`;
  const lastBrace = activity.lastIndexOf('}');
  if (lastBrace < 0) fail('MainActivity.kt is not a class body');
  activity = `${activity.slice(0, lastBrace)}${callbacks}${activity.slice(lastBrace)}`;
}

if (!activity.includes('MediaBridge.attach')) fail('MediaBridge.attach is missing from MainActivity.kt');
await writeFile(activityPath, activity);

/* ---- 3. permissions ---------------------------------------------------- */
let xml = await readFile(manifest, 'utf8');
const before = xml;
const wanted = [
  { name: 'android.permission.READ_MEDIA_VIDEO', extra: '' },
  { name: 'android.permission.READ_MEDIA_AUDIO', extra: '' },
  { name: 'android.permission.READ_MEDIA_VISUAL_USER_SELECTED', extra: '' },
  { name: 'android.permission.READ_EXTERNAL_STORAGE', extra: ' android:maxSdkVersion="32"' },
  { name: 'android.permission.REQUEST_INSTALL_PACKAGES', extra: '' },
];
const missing = wanted.filter((p) => !xml.includes(p.name));
if (missing.length) {
  const block = missing
    .map((p) => `    <uses-permission android:name="${p.name}"${p.extra} />`)
    .join('\n');
  xml = xml.replace(/(<manifest[^>]*>)/, `$1\n${block}`);
}
if (xml !== before) await writeFile(manifest, xml);

/* ---- 4a. make sure androidx.core is on the compile classpath ----------- */
const gradlePath = join(gen, 'app', 'build.gradle.kts');
let gradle = '';
try {
  gradle = await readFile(gradlePath, 'utf8');
} catch {
  gradle = '';
}
if (gradle && !/androidx\.core:core/.test(gradle)) {
  const injected = gradle.replace(
    /dependencies\s*\{/,
    `dependencies {\n    implementation("androidx.core:core-ktx:1.13.1")`,
  );
  if (injected !== gradle) {
    await writeFile(gradlePath, injected);
    gradle = injected;
  }
}

/* ---- 4. FileProvider for the downloaded update -------------------------- */
await mkdir(resXml, { recursive: true });
const pathsFile = join(resXml, 'rozh_file_paths.xml');
const pathsXml = `<?xml version="1.0" encoding="utf-8"?>
<!-- Paths the in-app updater is allowed to expose through FileProvider. -->
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-files-path name="updates" path="Download/" />
    <cache-path name="cache" path="rozh-media/" />
</paths>
`;
await writeFile(pathsFile, pathsXml);

let providerXml = await readFile(manifest, 'utf8');
if (!providerXml.includes('rozh.fileprovider.PROVIDER')) {
  const provider = `
    <!-- rozh.fileprovider.PROVIDER -->
    <provider
      android:name="androidx.core.content.FileProvider"
      android:authorities="\${applicationId}.fileprovider"
      android:exported="false"
      android:grantUriPermissions="true">
      <meta-data
        android:name="android.support.FILE_PROVIDER_PATHS"
        android:resource="@xml/rozh_file_paths" />
    </provider>`;
  if (!/\n\s*<application\b/.test(providerXml)) fail('manifest has no <application> element');
  // insert as the first child of <application>
  providerXml = providerXml.replace(/(<application\b[^>]*>)/, `$1${provider}`);
  await writeFile(manifest, providerXml);
}
xml = providerXml;

/* ---- 5. assert --------------------------------------------------------- */
const checks = [
  ['bridge source', bridge.includes(`package ${pkg};`)],
  ['bridge file', await access(bridgeTarget).then(() => true).catch(() => false)],
  ['attach call', activity.includes(`${pkg}.MediaBridge.attach(this)`)],
  ['permission callback', activity.includes('MediaBridge.onPermissions')],
  ['folder callback', activity.includes('MediaBridge.onActivityResult')],
  ['manifest video permission', xml.includes('android.permission.READ_MEDIA_VIDEO')],
  ['manifest audio permission', xml.includes('android.permission.READ_MEDIA_AUDIO')],
  ['manifest selected-media permission', xml.includes('android.permission.READ_MEDIA_VISUAL_USER_SELECTED')],
  ['manifest legacy permission', xml.includes('android.permission.READ_EXTERNAL_STORAGE')],
  ['manifest install permission', xml.includes('android.permission.REQUEST_INSTALL_PACKAGES')],
  ['file provider', xml.includes('androidx.core.content.FileProvider')],
  ['androidx.core on classpath', !gradle || /androidx\.core:core/.test(gradle)],
  ['provider paths', xml.includes('@xml/rozh_file_paths')],
  ['playback mode watcher', bridge.includes('startPlaybackModeWatcher')],
  ['immersive system bars', bridge.includes('WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE')],
  ['landscape orientation', bridge.includes('SCREEN_ORIENTATION_SENSOR_LANDSCAPE')],
];
const broken = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (broken.length) fail(`not applied: ${broken.join(', ')}`);

console.log(
  `[rozh] Android bridge installed (package ${pkg}): MediaBridge.java, MainActivity hooks, media + install permissions, FileProvider`,
);
