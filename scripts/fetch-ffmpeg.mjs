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
import { mkdir, chmod, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, 'src-tauri', 'bin');

const TAG = 'b6.0';
const MAP = {
  'win32-x64': { asset: 'ffmpeg-win32-x64', file: 'ffmpeg.exe' },
  'win32-ia32': { asset: 'ffmpeg-win32-ia32', file: 'ffmpeg.exe' },
  'win32-arm64': { asset: 'ffmpeg-win32-arm64', file: 'ffmpeg.exe' },
  'darwin-x64': { asset: 'ffmpeg-darwin-x64', file: 'ffmpeg' },
  'darwin-arm64': { asset: 'ffmpeg-darwin-arm64', file: 'ffmpeg' },
  'linux-x64': { asset: 'ffmpeg-linux-x64', file: 'ffmpeg' },
  'linux-arm64': { asset: 'ffmpeg-linux-arm64', file: 'ffmpeg' },
  'linux-ia32': { asset: 'ffmpeg-linux-ia32', file: 'ffmpeg' },
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

// already there?
try {
  const s = await stat(dest);
  if (s.size > 5_000_000) {
    console.log(`[rozh] ffmpeg already present (${(s.size / 1e6).toFixed(1)} MB) → ${dest}`);
    process.exit(0);
  }
} catch {
  /* not yet downloaded */
}

console.log(`[rozh] downloading ${entry.asset} …`);
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
await pipeline(res.body, createWriteStream(dest));
if (!entry.file.endsWith('.exe')) await chmod(dest, 0o755);
const s = await stat(dest);
console.log(`[rozh] ffmpeg ready: ${(s.size / 1e6).toFixed(1)} MB → ${dest}`);
