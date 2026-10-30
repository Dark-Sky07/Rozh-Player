/**
 * Downloads a static FFmpeg build into src-tauri/bin so the desktop app can
 * remux/transcode containers the system webview cannot decode (MKV, AVI, TS…).
 *
 * Binaries come from the ffmpeg-static GitHub releases (GPL builds).
 * Nothing is committed: `bin/` only keeps a README in git.
 *
 *   node scripts/fetch-ffmpeg.mjs            # host platform
 *   node scripts/fetch-ffmpeg.mjs linux-x64  # cross-fetch for CI
 */
import { mkdir, chmod, stat, unlink, rename } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, 'src-tauri', 'bin');

const TAG = 'b6.1.1';
// Digests are GitHub's published release-asset SHA-256 values. Keep the
// version and hashes pinned so a moved/replaced upstream asset fails closed.
const MAP = {
  'win32-x64': { asset: 'ffmpeg-win32-x64', file: 'ffmpeg.exe', size: 82797568, sha256: '04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00' },
  'darwin-x64': { asset: 'ffmpeg-darwin-x64', file: 'ffmpeg', size: 78862176, sha256: 'ebdddc936f61e14049a2d4b549a412b8a40deeff6540e58a9f2a2da9e6b18894' },
  'darwin-arm64': { asset: 'ffmpeg-darwin-arm64', file: 'ffmpeg', size: 45568216, sha256: 'a90e3db6a3fd35f6074b013f948b1aa45b31c6375489d39e572bea3f18336584' },
  'linux-x64': { asset: 'ffmpeg-linux-x64', file: 'ffmpeg', size: 79826272, sha256: 'e7e7fb30477f717e6f55f9180a70386c62677ef8a4d4d1a5d948f4098aa3eb99' },
  'linux-arm64': { asset: 'ffmpeg-linux-arm64', file: 'ffmpeg', size: 51134160, sha256: '6bb182d0d75d23028db82e9e4f723ca69b853d055698486e6984ddb2c06fb8ce' },
  'linux-ia32': { asset: 'ffmpeg-linux-ia32', file: 'ffmpeg', size: 52155436, sha256: 'c6472eb993612db72ca50893a34137ba11173e60a1a4c028d4660a3f755d2490' },
};

const wanted = process.argv[2] ?? `${process.platform}-${process.arch}`;
const entry = MAP[wanted];
if (!entry) {
  console.error(`[rozh] no prebuilt FFmpeg for "${wanted}". Supported: ${Object.keys(MAP).join(', ')}`);
  process.exit(1);
}

const url = `https://github.com/eugeneware/ffmpeg-static/releases/download/${TAG}/${entry.asset}`;
const dest = join(outDir, entry.file);

await mkdir(outDir, { recursive: true });

const temporary = `${dest}.download-${process.pid}`;

async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

// Reuse only an intact, expected binary; never trust size alone.
try {
  const s = await stat(dest);
  if (s.size === entry.size && (await sha256File(dest)) === entry.sha256) {
    console.log(`[rozh] verified FFmpeg ${TAG} already present → ${dest}`);
    process.exit(0);
  }
  await unlink(dest);
} catch {
  /* not yet downloaded */
}

console.log(`[rozh] downloading pinned FFmpeg ${TAG} ${entry.asset} …`);
let res;
try {
  res = await fetch(url, { redirect: 'follow' });
} catch (err) {
  console.error(
    `[rozh] network error: ${err.message}\n` +
      `       Download manually and move it to src-tauri/bin/${entry.file}:\n       ${url}`,
  );
  process.exit(1);
}
if (!res.ok || !res.body) {
  console.error(`[rozh] download failed (${res.status}). Grab it manually:\n       ${url}`);
  process.exit(1);
}
try {
  const contentLength = Number(res.headers.get('content-length') ?? 0);
  if (contentLength && contentLength !== entry.size) throw new Error(`unexpected asset size ${contentLength}`);
  await pipeline(res.body, createWriteStream(temporary, { flags: 'wx' }));
  const downloaded = await stat(temporary);
  if (downloaded.size !== entry.size) throw new Error(`size mismatch: expected ${entry.size}, received ${downloaded.size}`);
  const actual = await sha256File(temporary);
  if (actual !== entry.sha256) throw new Error(`SHA-256 mismatch for ${entry.asset}`);
  if (!entry.file.endsWith('.exe')) await chmod(temporary, 0o755);
  await rename(temporary, dest);
  console.log(`[rozh] verified FFmpeg ready: ${(downloaded.size / 1e6).toFixed(1)} MB → ${dest}`);
} catch (err) {
  try { await unlink(temporary); } catch { /* no partial file */ }
  console.error(`[rozh] refusing unverified FFmpeg: ${err.message}`);
  process.exit(1);
}
