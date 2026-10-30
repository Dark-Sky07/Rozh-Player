/**
 * Build `latest.json`, the file Tauri's updater polls.
 *
 * Shape (Tauri v2):
 *   { version, notes, pub_date, platforms: { "<target>": { signature, url } } }
 *
 * The signature is the *content* of the `.sig` file Tauri produced while
 * bundling, and the url points at the asset in this GitHub release.
 *
 * Usage: node scripts/build-latest-json.mjs <manifest-dir> [out-file]
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifestDir = process.argv[2] ?? join(root, 'manifest');
const outFile = process.argv[3] ?? join(root, 'latest.json');

const repo = process.env.GITHUB_REPOSITORY ?? 'Dark-Sky07/Rozh-Player';
const tag = process.env.TAG ?? `v${JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version}`;
const baseUrl = `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/`;

/** Merge every desktop manifest the matrix jobs uploaded. */
const platforms = {};
let version = '';
for (const entry of await readdir(manifestDir)) {
  if (!entry.endsWith('.json')) continue;
  const data = JSON.parse(await readFile(join(manifestDir, entry), 'utf8'));
  version = data.version || version;
  for (const [key, value] of Object.entries(data.platforms ?? {})) {
    platforms[key] = {
      signature: value.signature,
      url: baseUrl + encodeURI(value.file),
    };
  }
}

if (!version || !Object.keys(platforms).length) {
  console.error('::error title=latest.json::no platform manifests were provided');
  process.exit(1);
}

/** A short, plain-text summary: the first section of the release notes. */
async function notes() {
  try {
    let raw;
    try {
      raw = await readFile(join(root, 'docs', 'releases', `${tag}.md`), 'utf8');
    } catch {
      raw = await readFile(join(root, 'docs', 'RELEASE_NOTES.md'), 'utf8');
    }
    const sections = raw.split(/^### /m).slice(1);
    const first = sections[0] ?? raw;
    return first
      .split('\n')
      .slice(1)
      .join('\n')
      .replace(/^[-*] /gm, '• ')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 1400);
  } catch {
    return 'Bug fixes and playback improvements.';
  }
}

const payload = {
  version,
  notes: await notes(),
  pub_date: new Date().toISOString(),
  platforms,
};

await writeFile(outFile, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`latest.json → v${version}, ${Object.keys(platforms).length} platforms`);
for (const [key, value] of Object.entries(platforms)) console.log(`  ${key.padEnd(15)} ${value.url}`);
