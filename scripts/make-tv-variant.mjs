/**
 * Turns the generated Android project into the **dedicated Android TV build**.
 *
 * Run AFTER `patch-android-tv.mjs` and before the second `tauri android build`
 * (see .github/workflows/release.yml):
 *
 *   node scripts/patch-android-tv.mjs
 *   node scripts/make-tv-variant.mjs
 *   VITE_TV_BUILD=1 npx tauri android build --apk --aab
 *
 * Differences from the phone package:
 *   • its own applicationId (`…rozh.player.tv`) so both can be installed
 *   • label "ROZH Player TV" and a 320×180 launcher banner
 *   • leanback is *required*, touchscreen is not
 *   • the main activity is locked to landscape
 *
 * Every step is idempotent and duplicate-safe: Android's manifest merger refuses
 * duplicated `<uses-feature>` or attribute declarations.
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

/** Exactly one declaration per managed feature — required for the TV package. */
function normaliseFeatures(xml) {
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
    '<uses-feature android:name="android.software.leanback" android:required="true" />',
    '<uses-feature android:name="android.hardware.touchscreen" android:required="false" />',
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

xml = normaliseFeatures(xml);

// a name the TV launcher shows, and the 320×180 banner
xml = setAttr(xml, 'application', 'android:label', 'ROZH Player TV');
xml = setAttr(xml, 'application', 'android:banner', '@drawable/tv_banner');

// television launchers look for this category
if (!xml.includes('LEANBACK_LAUNCHER')) {
  xml = xml.replace(
    /(<category android:name="android\.intent\.category\.LAUNCHER"\s*\/>)/,
    '$1\n            <category android:name="android.intent.category.LEANBACK_LAUNCHER" />',
  );
}

// 16:9 only
xml = setAttr(xml, 'activity', 'android:screenOrientation', 'sensorLandscape');

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

// keep the string resource in sync (the manifest label still wins if the CLI rewrites it)
const strings = join(res, 'values', 'strings.xml');
if (await exists(strings)) {
  const s = await readFile(strings, 'utf8');
  const next = s.replace(/(<string name="app_name">)[^<]*(<\/string>)/, '$1ROZH Player TV$2');
  if (next !== s) await writeFile(strings, next);
}

console.log(`[rozh] Android TV variant ready${gradleChanged ? ` · applicationId ${gradleChanged}` : ''}`);
