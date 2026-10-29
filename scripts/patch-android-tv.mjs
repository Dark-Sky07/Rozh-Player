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

/**
 * Android's manifest merger rejects duplicated `<uses-feature>` elements, and
 * the generated Tauri manifest already declares some of them. This rewrites the
 * three features ROZH cares about into exactly one declaration each.
 */
function normaliseFeatures(xml, { leanback, touchscreen = 'false' }) {
  const MANAGED = new Set([
    'android.software.leanback',
    'android.hardware.touchscreen',
    'android.hardware.gamepad',
  ]);
  const featureRe = /<uses-feature\b[^>]*\/>[ \t]*\r?\n?/g;
  const stripped = xml.replace(featureRe, (tag) => {
    const name = tag.match(/android:name="([^"]+)"/)?.[1];
    return name && MANAGED.has(name) ? '' : tag;
  });
  const block = [
    `<uses-feature android:name="android.hardware.touchscreen" android:required="${touchscreen}" />`,
    `<uses-feature android:name="android.software.leanback" android:required="${leanback}" />`,
    '<uses-feature android:name="android.hardware.gamepad" android:required="false" />',
  ].join('\n    ');
  return stripped.replace(/(<manifest\b[^>]*>)/, `$1\n    ${block}`);
}

/** Set an attribute on the `<application>` (or `<activity>`) tag, never twice. */
function setAttr(xml, tagName, name, value) {
  const openRe = new RegExp(`<${tagName}\\b[^>]*>`);
  return xml.replace(openRe, (tag) => {
    const attrRe = new RegExp(`${name.replace(/[:.]/g, (m) => `\\${m}`)}\\s*=\\s*"[^"]*"`);
    if (attrRe.test(tag)) return tag.replace(attrRe, `${name}="${value}"`);
    return tag.replace(new RegExp(`<${tagName}\\b`), `<${tagName}\n        ${name}="${value}"`);
  });
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
  xml = setAttr(xml, 'application', 'android:usesCleartextTraffic', 'true');
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
  xml = setAttr(xml, 'application', 'android:hardwareAccelerated', 'true');
  applied.push('hw accel');
}
if (!xml.includes('android:largeHeap')) {
  xml = setAttr(xml, 'application', 'android:largeHeap', 'true');
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

/* ---- 5. feature declarations (exactly one of each, never duplicated) --- */
xml = normaliseFeatures(xml, { leanback: 'false' });

if (!xml.includes('android:banner')) {
  xml = setAttr(xml, 'application', 'android:banner', '@mipmap/ic_launcher');
  applied.push('banner');
}

/* ---- 6. gradle placeholder (older templates) ---------------------------- */
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
