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
      el.innerHTML = `<div style="text-align:center;color:#ffb4b4;font-family:system-ui;padding:24px">
        <div style="font-size:1.1rem;font-weight:700;margin-bottom:8px">ROZH Player</div>
        <div style="font-size:.85rem;opacity:.8">${String(err?.message ?? err)}</div>
      </div>`;
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
