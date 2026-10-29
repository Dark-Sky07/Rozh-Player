/**
 * Turns the generated Android project into the **dedicated Android TV build**.
 *
 * Run AFTER `patch-android-tv.mjs` and before the second
 * `tauri android build` (see .github/workflows/release.yml):
 *
 *   node scripts/patch-android-tv.mjs       # shared fixes (cleartext, perms…)
 *   VITE_TV_BUILD=1 npx tauri android build --apk --aab
 *
 * Differences from the phone APK:
 *   • its own applicationId (`…rozh.player.tv`) so both can live on a phone
 *   • label "ROZH Player TV" and a 320×180 launcher banner
 *   • leanback is *required*, touchscreen is not
 *   • the main activity is locked to landscape
 */
import { readFile, writeFile, access, copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const appDir = join(root, 'src-tauri', 'gen', 'android', 'app');
const manifest = join(appDir, 'src', 'main', 'AndroidManifest.xml');
const res = join(appDir, 'src', 'main', 'res');

const exists = async (p) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

if (!(await exists(manifest))) {
  console.error('[rozh] run `npx tauri android init` before making the TV variant');
  process.exit(1);
}

/* ---- applicationId ------------------------------------------------------- */
let gradleChanged = null;
for (const file of ['build.gradle.kts', 'build.gradle']) {
  const p = join(appDir, file);
  if (!(await exists(p))) continue;
  let g = await readFile(p, 'utf8');
  const m = g.match(/applicationId\s*=?\s*"([^"]+)"/);
  if (m && !m[1].endsWith('.tv')) {
    g = g.replace(m[0], m[0].replace(`"${m[1]}"`, `"${m[1]}.tv"`));
    await writeFile(p, g);
    gradleChanged = `${m[1]} → ${m[1]}.tv`;
  }
  break;
}

/* ---- manifest ------------------------------------------------------------ */
let xml = await readFile(manifest, 'utf8');
const before = xml;

// leanback is mandatory on this package, touchscreen is not
xml = xml.replace(
  /<uses-feature android:name="android\.software\.leanback"[^>]*\/>/,
  '<uses-feature android:name="android.software.leanback" android:required="true" />',
);
if (!xml.includes('android.software.leanback')) {
  xml = xml.replace(
    /<application/,
    '    <uses-feature android:name="android.software.leanback" android:required="true" />\n    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />\n    <uses-feature android:name="android.hardware.gamepad" android:required="false" />\n\n    <application',
  );
}
if (!xml.includes('android.hardware.touchscreen')) {
  xml = xml.replace(
    /<application/,
    '    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />\n\n    <application',
  );
}

// a name the TV launcher shows
xml = xml.replace(/android:label="@string\/app_name"/g, 'android:label="ROZH Player TV"');
if (!xml.includes('android:label="ROZH Player TV"')) {
  xml = xml.replace(/<application\s/, '<application\n        android:label="ROZH Player TV"\n        ');
}

// launcher banner (320×180)
if (xml.includes('android:banner=')) {
  xml = xml.replace(/android:banner="[^"]*"/, 'android:banner="@drawable/tv_banner"');
} else {
  xml = xml.replace(/<application\s/, '<application\n        android:banner="@drawable/tv_banner"\n        ');
}

// television launchers look for this category
if (!xml.includes('LEANBACK_LAUNCHER')) {
  xml = xml.replace(
    /(<category android:name="android\.intent\.category\.LAUNCHER"\s*\/>)/,
    '$1\n            <category android:name="android.intent.category.LEANBACK_LAUNCHER" />',
  );
}

// 16:9 only
if (!xml.includes('android:screenOrientation')) {
  xml = xml.replace(/<activity\s/, '<activity\n            android:screenOrientation="sensorLandscape"\n            ');
}

if (xml !== before) await writeFile(manifest, xml);

/* ---- banner asset -------------------------------------------------------- */
const bannerSrc = join(root, 'src-tauri', 'icons', 'tv-banner.png');
await mkdir(join(res, 'drawable'), { recursive: true });
if (await exists(bannerSrc)) {
  await copyFile(bannerSrc, join(res, 'drawable', 'tv_banner.png'));
} else {
  console.warn('[rozh] icons/tv-banner.png missing — reusing the launcher icon');
  const icon = join(root, 'src-tauri', 'icons', '128x128.png');
  if (await exists(icon)) await copyFile(icon, join(res, 'drawable', 'tv_banner.png'));
}

// keep the app label in sync for good measure (the manifest label wins)
const strings = join(res, 'values', 'strings.xml');
if (await exists(strings)) {
  const s = await readFile(strings, 'utf8');
  const next = s.replace(/(<string name="app_name">)[^<]*(<\/string>)/, '$1ROZH Player TV$2');
  if (next !== s) await writeFile(strings, next);
}

console.log(`[rozh] Android TV variant ready${gradleChanged ? ` · applicationId ${gradleChanged}` : ''}`);
