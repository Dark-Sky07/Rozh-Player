// Copies the libass (JASSUB) worker + wasm into public/ so the runtime can
// lazily load them without bundling 4 MB into the main app chunk.
import { cp, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, 'node_modules', 'jassub', 'dist');
const dest = join(root, 'public', 'jassub');

const files = ['wasm/jassub-worker.js', 'wasm/jassub-worker.wasm', 'wasm/jassub-worker-modern.wasm', 'default.woff2'];

try {
  await access(src);
} catch {
  console.warn('[rozh] jassub not installed — skipping libass assets');
  process.exit(0);
}

await mkdir(dest, { recursive: true });
for (const f of files) {
  await cp(join(src, f), join(dest, f.split('/').pop()));
}
console.log('[rozh] libass worker + fonts copied to public/jassub');
