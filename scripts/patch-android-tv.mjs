/**
 * Prepares the generated Android project so the phone/TV APK behaves like a
 * real media player.
 *
 * Run after `npx tauri android init` (idempotent):
 *   node scripts/patch-android-tv.mjs
 *
 * What it fixes — each item was a real "nothing plays" bug:
 *   1. `usesCleartextTraffic` — Android 9+ blocks every plain `http://` request,
 *      and most IPTV/mirror links are http. Without this, network playback
 *      fails on the phone while it works on the desktop build.
 *   2. INTERNET / ACCESS_NETWORK_STATE permissions.
 *   3. Hardware acceleration + large heap for 4K decoding.
 *   4. LEANBACK_LAUNCHER so the same APK also appears on Android TV launchers.
 */
import { readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const gen = join(root, 'src-tauri', 'gen', 'android');
const manifest = join(gen, 'app', 'src', 'main', 'AndroidManifest.xml');

try {
  await access(manifest);
} catch {
  console.error('[rozh] run `npm run tauri android init` first (no manifest found)');
  process.exit(1);
}

let xml = await readFile(manifest, 'utf8');
const before = xml;
const applied = [];

/* ---- 1. cleartext traffic ------------------------------------------------ */
if (xml.includes('android:usesCleartextTraffic="${usesCleartextTraffic}"')) {
  xml = xml.replace('android:usesCleartextTraffic="${usesCleartextTraffic}"', 'android:usesCleartextTraffic="true"');
  applied.push('cleartext placeholder');
} else if (/android:usesCleartextTraffic="false"/.test(xml)) {
  xml = xml.replace(/android:usesCleartextTraffic="false"/g, 'android:usesCleartextTraffic="true"');
  applied.push('cleartext on');
} else if (!xml.includes('android:usesCleartextTraffic')) {
  xml = xml.replace(/<application\s/, '<application\n        android:usesCleartextTraffic="true"\n        ');
  applied.push('cleartext added');
}

/* ---- 2. permissions ------------------------------------------------------ */
const perms = ['android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE'];
const missing = perms.filter((p) => !xml.includes(p));
if (missing.length) {
  const block = missing.map((p) => `    <uses-permission android:name="${p}" />`).join('\n');
  xml = xml.replace(/(<manifest[^>]*>)/, `$1\n${block}`);
  applied.push(`permissions (${missing.length})`);
}

/* ---- 3. hardware acceleration + heap ------------------------------------ */
if (!xml.includes('android:hardwareAccelerated')) {
  xml = xml.replace(/<application\s/, '<application\n        android:hardwareAccelerated="true"\n        ');
  applied.push('hw accel');
}
if (!xml.includes('android:largeHeap')) {
  xml = xml.replace(/<application\s/, '<application\n        android:largeHeap="true"\n        ');
  applied.push('large heap');
}

/* ---- 4. Android TV launcher -------------------------------------------- */
if (!xml.includes('LEANBACK_LAUNCHER')) {
  xml = xml.replace(
    /(<category android:name="android\.intent\.category\.LAUNCHER"\s*\/>)/,
    '$1\n            <category android:name="android.intent.category.LEANBACK_LAUNCHER" />',
  );
  applied.push('leanback launcher');
}

if (!xml.includes('android.hardware.touchscreen')) {
  xml = xml.replace(
    /<application/,
    '<!-- ROZH: also offered on Android TV launchers -->\n    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />\n    <uses-feature android:name="android.software.leanback" android:required="false" />\n\n    <application',
  );
  applied.push('optional touchscreen');
}

if (!xml.includes('android:banner')) {
  const hasIcon = /<application\s+([^>]*?)android:icon="[^"]*"/s.test(xml);
  xml = hasIcon
    ? xml.replace(/<application\s+([^>]*?)android:icon="[^"]*"/s, (m) => `${m}\n        android:banner="@mipmap/ic_launcher"`)
    : xml.replace(/<application\s/, '<application\n        android:banner="@mipmap/ic_launcher"\n        ');
  applied.push('banner');
}

/* ---- 5. gradle placeholder (older templates) ---------------------------- */
const gradle = join(gen, 'app', 'build.gradle.kts');
try {
  let g = await readFile(gradle, 'utf8');
  if (/manifestPlaceholders\["usesCleartextTraffic"\]\s*=\s*"false"/.test(g)) {
    g = g.replace(/(manifestPlaceholders\["usesCleartextTraffic"\]\s*=\s*)"false"/, '$1"true"');
    await writeFile(gradle, g);
    applied.push('gradle cleartext');
  }
} catch {
  /* older templates ship build.gradle instead of .kts — optional */
}

if (xml === before && !applied.length) {
  console.log('[rozh] Android manifest already patched');
} else {
  if (xml !== before) await writeFile(manifest, xml);
  console.log(`[rozh] AndroidManifest patched: ${applied.join(', ') || 'no structural change'}`);
}
