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
import { readFile, writeFile, access, copyFile, mkdir, readdir, rename, rmdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const appDir = join(root, 'src-tauri', 'gen', 'android', 'app');
const manifest = join(appDir, 'src', 'main', 'AndroidManifest.xml');
const res = join(appDir, 'src', 'main', 'res');
const tauriConfig = join(root, 'src-tauri', 'tauri.conf.json');

const exists = async (p) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

async function moveTree(source, destination) {
  if (!(await exists(source))) return;
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) await moveTree(from, to);
    else {
      await mkdir(dirname(to), { recursive: true });
      await rename(from, to);
    }
  }
  await rmdir(source);
}

async function movePackageSources(source, destination) {
  if (!(await exists(source))) return;
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    // A package ending in `.tv` nests under its phone-package directory.
    if (from === destination) continue;
    const to = join(destination, entry.name);
    if (entry.isDirectory()) await moveTree(from, to);
    else {
      await mkdir(dirname(to), { recursive: true });
      await rename(from, to);
    }
  }
}

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

/* ---- native app identity ------------------------------------------------- */
// Keep Tauri, Gradle, and Java/Kotlin aligned. Tauri derives the Android
// source directory from the bundle identifier during build.
const config = JSON.parse(await readFile(tauriConfig, 'utf8'));
const currentIdentifier = typeof config.identifier === 'string' ? config.identifier : 'app.rozh.player';
const baseIdentifier = currentIdentifier.endsWith('.tv') ? currentIdentifier.slice(0, -3) : currentIdentifier;
const tvIdentifier = `${baseIdentifier}.tv`;
const javaRoot = join(appDir, 'src', 'main', 'java');
const basePackageDir = join(javaRoot, ...baseIdentifier.split('.'));
const tvPackageDir = join(javaRoot, ...tvIdentifier.split('.'));
await movePackageSources(basePackageDir, tvPackageDir);

let androidSourceCount = 0;
async function updatePackageDeclarations(dir) {
  if (!(await exists(dir))) return;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) await updatePackageDeclarations(file);
    else if (/\.(java|kt)$/.test(entry.name)) {
      androidSourceCount += 1;
      const source = await readFile(file, 'utf8');
      const escaped = baseIdentifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const next = source.replace(new RegExp(`(^\\s*package\\s+)${escaped}(\\s*;?)`, 'm'), `$1${tvIdentifier}$2`);
      if (next !== source) await writeFile(file, next);
    }
  }
}
await updatePackageDeclarations(tvPackageDir);
if (androidSourceCount === 0) throw new Error(`No Android Java/Kotlin source found under ${tvPackageDir}`);

let gradleChanged = null;
for (const file of ['build.gradle.kts', 'build.gradle']) {
  const p = join(appDir, file);
  if (!(await exists(p))) continue;
  let g = await readFile(p, 'utf8');
  for (const key of ['namespace', 'applicationId']) {
    const re = new RegExp(`(${key}\\s*=?\\s*)"([^"]+)"`);
    const match = g.match(re);
    if (match && match[2] !== tvIdentifier) {
      g = g.replace(re, `$1"${tvIdentifier}"`);
      gradleChanged = `${match[2]} → ${tvIdentifier}`;
    }
  }
  if (gradleChanged) await writeFile(p, g);
  if (!/applicationId\s*=?\s*"[^"]+\.tv"/.test(g)) {
    throw new Error('Android applicationId was not updated to the dedicated .tv variant');
  }
  if (/namespace\s*=?\s*"[^"]+"/.test(g) && !/namespace\s*=?\s*"[^"]+\.tv"/.test(g)) {
    throw new Error('Android namespace does not match the dedicated .tv variant');
  }
  break;
}

// The native identity is the fail-safe if a TV frontend is rebuilt without
// VITE_TV_BUILD=1.
if (config.identifier !== tvIdentifier) {
  config.identifier = tvIdentifier;
  await writeFile(tauriConfig, `${JSON.stringify(config, null, 2)}\n`);
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
