/**
 * Makes the generated Android app launchable from an Android TV home screen.
 *
 * Run after `npm run tauri android init` (idempotent):
 *   node scripts/patch-android-tv.mjs
 *
 * It adds the LEANBACK launcher category to the main activity and marks the
 * touchscreen as optional so the Play Store also offers the app on TVs.
 */
import { readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = join(root, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

try {
  await access(manifest);
} catch {
  console.error('[rozh] run `npm run tauri android init` first (no manifest found)');
  process.exit(1);
}

let xml = await readFile(manifest, 'utf8');
const before = xml;

if (!xml.includes('LEANBACK_LAUNCHER')) {
  xml = xml.replace(
    /(<category android:name="android\.intent\.category\.LAUNCHER"\s*\/>)/,
    '$1\n            <category android:name="android.intent.category.LEANBACK_LAUNCHER" />',
  );
}

if (!xml.includes('android.hardware.touchscreen')) {
  xml = xml.replace(
    /<application/,
    '<!-- ROZH: appears on Android TV launchers too -->\n    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />\n    <uses-feature android:name="android.software.leanback" android:required="false" />\n\n    <application',
  );
}

if (!xml.includes('android:banner')) {
  xml = xml.replace(
    /<application\s+([^>]*?)android:icon="[^"]*"/s,
    (m) => `${m}\n        android:banner="@mipmap/ic_launcher"`,
  );
}

if (xml === before) {
  console.log('[rozh] Android TV flags already present');
} else {
  await writeFile(manifest, xml);
  console.log('[rozh] AndroidManifest patched for Android TV (LEANBACK + optional touchscreen + banner)');
}
