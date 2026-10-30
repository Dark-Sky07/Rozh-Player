import { defineConfig, loadEnv } from 'vite';
import pkg from './package.json';

// ROZH Player — build config.
// The same bundle powers the web/PWA build, the Tauri desktop app (Windows, macOS,
// Linux), and the Tauri mobile build (Android, Android TV) after `tauri android init`.
export default defineConfig(({ mode }) => {
  const tvBuild = loadEnv(mode, '.', 'VITE_').VITE_TV_BUILD === '1';

  return {
    clearScreen: false,
    plugins: [
      {
        name: 'rozh-tv-build-flag',
        transformIndexHtml(html) {
          return html.replace('data-tv-build="0"', `data-tv-build="${tvBuild ? '1' : '0'}"`);
        },
      },
    ],
    define: {
      __BUILD_ID__: JSON.stringify(String(Date.now())),
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: false,
      // the sandbox preview proxies through a generated hostname
      allowedHosts: true,
      hmr: { overlay: true },
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
    },
    // jassub spawns an ES-module worker; keep worker output compatible.
    worker: {
      format: 'es',
    },
    build: {
      target: 'es2020',
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false,
      chunkSizeWarningLimit: 1400,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('hls.js')) return 'hls';
            if (id.includes('dashjs')) return 'dash';
            if (id.includes('mpegts.js')) return 'mpegts';
            if (id.includes('jassub')) return 'libass';
            return undefined;
          },
        },
      },
    },
  };
});
