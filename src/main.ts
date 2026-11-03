/** ROZH Player — entry point. */

import './styles/theme.css';
import './styles/app.css';
import './styles/overlays.css';
import './styles/player-extras.css';
import './styles/studio.css';
import './styles/responsive.css';
import './styles/tv.css';
import './styles/desktop.css';
import { platform } from './core/util';

function enableTvMode(): void {
  // The dedicated TV APK embeds this flag in index.html. Also update the
  // shared platform descriptor: shell routing and focus logic use it too.
  document.documentElement.dataset.tv = 'true';
  platform.tv = true;
  platform.tvBuild = true;
}

async function preparePlatform(): Promise<void> {
  if (document.documentElement.dataset.tvBuild === '1' || platform.tvBuild || platform.tv) {
    enableTvMode();
    return;
  }

  // Native package identity is authoritative on Android. This protects the
  // TV interface from stale/misconfigured Vite assets and vendor-specific TV
  // WebView user agents that look like ordinary Android phones.
  if (platform.tauri && platform.os === 'android') {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      if (await invoke<boolean>('is_android_tv_variant')) enableTvMode();
    } catch (err) {
      // The heuristic still handles most Android TV devices if running an
      // older native bridge that predates this command.
      console.warn('[rozh] native TV identity unavailable', err);
    }
  }
}

function showBootError(err: unknown): void {
  console.error('[rozh] boot failed', err);
  const el = document.getElementById('boot');
  if (!el) return;
  const panel = document.createElement('div');
  panel.style.cssText = 'text-align:center;color:#ffb4b4;font-family:system-ui;padding:24px';
  const title = document.createElement('div');
  title.style.cssText = 'font-size:1.1rem;font-weight:700;margin-bottom:8px';
  title.textContent = 'ROZH Player';
  const detail = document.createElement('div');
  detail.style.cssText = 'font-size:.85rem;opacity:.8';
  detail.textContent = String((err as { message?: unknown })?.message ?? err);
  panel.append(title, detail);
  el.replaceChildren(panel);
}

async function boot(): Promise<void> {
  try {
    await preparePlatform();
    // Import only after native TV identity is resolved; the shell chooses its
    // initial route at module load, so this prevents a blank player landing.
    const { bootApp } = await import('./core/shell');
    await bootApp();
  } catch (err) {
    showBootError(err);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void boot());
else void boot();
