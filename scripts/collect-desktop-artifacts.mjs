/**
 * Collect desktop bundles for a release.
 *
 * Tauri writes installers *and* updater artifacts with names that collide across
 * targets (`ROZH Player.app.tar.gz` exists once per macOS architecture), so the
 * copies that go to the release get deterministic names, and every signature is
 * recorded next to the file it belongs to.
 *
 * A bundle is an updater artifact when Tauri wrote a `.sig` next to it — Windows
 * ships the NSIS installer itself (or an `.nsis.zip` on some bundler versions),
 * macOS ships `*.app.tar.gz`, Linux ships `*.AppImage.tar.gz`.
 *
 * Output:
 *   out/*                       → uploaded as release assets
 *   manifest/desktop.json       → consumed by the `latest` job (see release.yml)
 *
 * Usage: node scripts/collect-desktop-artifacts.mjs
 */
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(root, 'src-tauri', 'target');
const out = join(root, 'out');
const manifestDir = join(root, 'manifest');

const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const version = pkg.version;

const SKIP_DIRS = new Set(['deps', 'incremental', 'build', '.fingerprint']);

async function walk(dir, acc = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(full, acc);
    } else {
      acc.push(full);
    }
  }
  return acc;
}

const files = await walk(target);
const present = new Set(files);
const rel = (p) => relative(target, p).split(sep).join('/');
const base = (p) => p.split(/[\\/]/).pop();

const BUNDLE = /(^|\/)(bundle|dmg|macos|nsis|msi|appimage|deb|rpm)\//;
const INSTALLER = /\.(exe|msi|dmg|deb|rpm|AppImage)$/i;
const ARCHIVE = /\.(app\.tar\.gz|AppImage\.tar\.gz|nsis\.zip)$/i;

/** Which `latest.json` platform key this bundle belongs to. */
function platformKey(p) {
  const path = rel(p);
  if (/darwin|macos|\.dmg$|\.app\.tar\.gz$/i.test(path) || base(p).includes('.dmg')) {
    return /aarch64|arm64/i.test(path + base(p)) ? 'darwin-aarch64' : 'darwin-x86_64';
  }
  if (/nsis|msi|\.exe$|\.msi$/i.test(path)) return 'windows-x86_64';
  if (/appimage|\.deb$|\.rpm$/i.test(path)) return 'linux-x86_64';
  return null;
}

/** Release-facing name; keeps installers recognisable and updates unique. */
function assetName(p, key) {
  const name = base(p);
  const arch = key === 'darwin-aarch64' ? 'aarch64' : key === 'darwin-x86_64' ? 'x64' : 'amd64';
  if (/\.app\.tar\.gz$/i.test(name)) return `ROZH-Player_${version}_${arch}.app.tar.gz`;
  if (/\.AppImage\.tar\.gz$/i.test(name)) return `ROZH-Player_${version}_amd64.AppImage.tar.gz`;
  if (/\.nsis\.zip$/i.test(name)) return `ROZH-Player_${version}_x64.nsis.zip`;
  if (/\.dmg$/i.test(name)) return `ROZH-Player_${version}_${arch}.dmg`;
  if (/\.exe$/i.test(name)) return `ROZH-Player_${version}_x64-setup.exe`;
  if (/\.msi$/i.test(name)) return `ROZH-Player_${version}_x64.msi`;
  if (/\.deb$/i.test(name)) return `ROZH-Player_${version}_amd64.deb`;
  if (/\.rpm$/i.test(name)) return `ROZH-Player-${version}-1.x86_64.rpm`;
  if (/\.AppImage$/i.test(name)) return `ROZH-Player_${version}_amd64.AppImage`;
  return name;
}

await rm(out, { recursive: true, force: true });
await rm(manifestDir, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await mkdir(manifestDir, { recursive: true });

const written = new Set();
const candidates = {};
const report = [];

/**
 * Only these files can feed Tauri's updater, and the order decides which one is
 * used when the bundler signed several of them (Linux signs the AppImage, the
 * .deb and the .rpm, but only an AppImage can replace a running AppImage).
 */
function updaterRank(p, key) {
  const name = base(p);
  if (key.startsWith('darwin')) return /\.app\.tar\.gz$/i.test(name) ? 0 : -1;
  if (key.startsWith('windows')) {
    if (/\.exe$/i.test(name)) return 0;
    if (/\.nsis\.zip$/i.test(name)) return 1;
    if (/\.msi$/i.test(name)) return 2;
    return -1;
  }
  if (/\.AppImage\.tar\.gz$/i.test(name)) return 0;
  if (/\.AppImage$/i.test(name)) return 1;
  return -1;
}

for (const file of files) {
  const name = base(file);
  if (!INSTALLER.test(name) && !ARCHIVE.test(name)) continue;
  if (!BUNDLE.test(rel(file))) continue;
  // Ignore anything that is not a real bundle output (e.g. AppImage internals).
  if (/\.AppImage$/i.test(name) && !/bundle\/appimage/i.test(rel(file))) continue;

  const key = platformKey(file);
  if (!key) continue;

  const target_name = assetName(file, key);
  await copyFile(file, join(out, target_name));
  written.add(target_name);

  const sigSource = `${file}.sig`;
  const hasSig = present.has(sigSource);
  if (!hasSig) {
    report.push(`${key.padEnd(15)} ${target_name}`);
    continue;
  }

  const signature = (await readFile(sigSource, 'utf8')).trim();
  if (!signature) {
    console.error(`::error title=updater signature::empty .sig for ${rel(file)}`);
    process.exit(1);
  }
  await writeFile(join(out, `${target_name}.sig`), signature);
  const rank = updaterRank(file, key);
  report.push(`${key.padEnd(15)} ${target_name}  (update, rank ${rank})`);
  if (rank < 0) continue;
  const current = candidates[key];
  if (!current || rank < current.rank) {
    candidates[key] = { rank, file: target_name, signature };
  }
}

const platforms = {};
for (const [key, value] of Object.entries(candidates)) {
  platforms[key] = { file: value.file, signature: value.signature };
}

// Each runner only builds its own targets, so the expectation comes from the
// workflow (`EXPECTED_PLATFORMS`); without it every platform is required.
const expected = (process.env.EXPECTED_PLATFORMS ?? '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);
const required = expected.length ? expected : ['windows-x86_64', 'darwin-x86_64', 'darwin-aarch64', 'linux-x86_64'];
const missing = required.filter((k) => !platforms[k]);
if (missing.length) {
  console.error(`::error title=updater artifacts::missing ${missing.join(', ')} (no signed bundle found)`);
  console.error(report.join('\n') || '(no bundles at all)');
  process.exit(1);
}

// One file per runner: the `latest` job merges them, so the names must not
// collide when the artefacts are downloaded into a single folder.
const runner = process.env.ARTIFACT_KEY ?? 'desktop';
await writeFile(
  join(manifestDir, `desktop-${runner}.json`),
  JSON.stringify({ version, platforms }, null, 2),
);

console.log(report.join('\n'));
console.log(`\n${Object.keys(platforms).length} updater platforms for v${version}`);
