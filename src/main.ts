/** ROZH Player — entry point. */

import './styles/theme.css';
import './styles/app.css';
import './styles/overlays.css';
import './styles/player-extras.css';
import './styles/studio.css';
import './styles/responsive.css';
import './styles/tv.css';
import './styles/desktop.css';
import { bootApp } from './core/shell';

function boot(): void {
  bootApp().catch((err) => {
    console.error('[rozh] boot failed', err);
    const el = document.getElementById('boot');
    if (el) {
      const panel = document.createElement('div');
      panel.style.cssText = 'text-align:center;color:#ffb4b4;font-family:system-ui;padding:24px';
      const title = document.createElement('div');
      title.style.cssText = 'font-size:1.1rem;font-weight:700;margin-bottom:8px';
      title.textContent = 'ROZH Player';
      const detail = document.createElement('div');
      detail.style.cssText = 'font-size:.85rem;opacity:.8';
      detail.textContent = String(err?.message ?? err);
      panel.append(title, detail);
      el.replaceChildren(panel);
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
