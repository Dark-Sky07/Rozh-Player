/** ROZH Player — shortcuts sheet and about page. */

import type { AppContext } from '../core/context';
import { icon, hydrateIcons } from '../core/icons';
import { t } from '../core/i18n';
import { store } from '../core/store';
import { escapeHtml, isMac, modKey, platform } from '../core/util';

function keyRow(keys: string[], desc: string): string {
  return `<div class="krow"><span>${escapeHtml(desc)}</span><span class="keys">${keys
    .map((k) => `<kbd>${escapeHtml(k)}</kbd>`)
    .join('')}</span></div>`;
}

export function renderShortcuts(host: HTMLElement, ctx: AppContext): void {
  const mod = modKey();
  const arrow = (k: string): string => (isMac() ? k : k);

  host.innerHTML = `
    <div class="view-head">
      <div>
        <h2>${t('shortcuts.title')}</h2>
        <p>${t('shortcuts.tvHint')}</p>
      </div>
    </div>
    <div class="kbd-cols">
      <div class="kbd-col">
        <h4>${t('shortcuts.playback')}</h4>
        ${keyRow(['Space', 'K'], t('shortcuts.playPause'))}
        ${keyRow([arrow('←'), arrow('→')], t('shortcuts.back') + ' / ' + t('shortcuts.fwd'))}
        ${keyRow(['Shift', arrow('←')], t('shortcuts.backLong'))}
        ${keyRow(['Shift', arrow('→')], t('shortcuts.fwdLong'))}
        ${keyRow(['J', 'L'], '−10s / +10s')}
        ${keyRow([','], t('shortcuts.frame'))}
        ${keyRow(['N', 'B'], t('player.next') + ' / ' + t('player.prev'))}
        ${keyRow(['0', '–', '9'], '0% – 90%')}
      </div>
      <div class="kbd-col">
        <h4>${t('shortcuts.volume')}</h4>
        ${keyRow([arrow('↑'), arrow('↓')], t('shortcuts.volUp') + ' / ' + t('shortcuts.volDown'))}
        ${keyRow(['M'], t('shortcuts.mute'))}
        <h4 style="margin-top:16px">${t('shortcuts.view')}</h4>
        ${keyRow(['F'], t('shortcuts.fullscreen'))}
        ${keyRow(['P'], t('shortcuts.pip'))}
        ${keyRow(['V'], t('shortcuts.subs'))}
        ${keyRow(['C'], t('shortcuts.screenshot'))}
        ${keyRow(['[', ']'], t('shortcuts.speed'))}
      </div>
      <div class="kbd-col">
        <h4>${t('shortcuts.window')}</h4>
        ${keyRow(['Q'], t('shortcuts.queue'))}
        ${keyRow(['O'], t('shortcuts.open'))}
        ${keyRow([mod, ','], t('shortcuts.settings'))}
        ${keyRow(['?'], t('shortcuts.help'))}
        ${keyRow(['Esc'], t('shortcuts.close'))}
      </div>
    </div>

    <div class="empty-panel" style="margin-top:22px;padding:26px">
      <div class="ico-wrap">${icon('tv')}</div>
      <h3>${t('settings.tv')}</h3>
      <p>${t('shortcuts.tvHint')}</p>
    </div>`;

  hydrateIcons(host);
  void ctx;
}

const PLATFORMS = [
  { icon: 'windows', name: 'Windows', sub: '10 · 11 · x64 & ARM64', state: 'ready' },
  { icon: 'apple', name: 'macOS', sub: '11 Big Sur +', state: 'ready' },
  { icon: 'linux', name: 'Linux', sub: 'deb · AppImage · Flatpak', state: 'ready' },
  { icon: 'smartphone', name: 'Android', sub: '8.0 +', state: 'ready' },
  { icon: 'tv', name: 'Android TV', sub: 'remote + gamepad', state: 'ready' },
  { icon: 'globe', name: 'Web / PWA', sub: 'this window', state: 'ready' },
];

export function renderAbout(host: HTMLElement, ctx: AppContext): void {
  host.innerHTML = `
    <div class="about-hero">
      <img src="/icons/rozh-logo.png" alt="ROZH Player" />
      <h2>ROZH<span style="color:var(--accent)">PLAYER</span></h2>
      <p>${t('about.heroSub')}</p>
      <div class="ver">
        <span class="badge mono">v${__APP_VERSION__}</span>
        <span class="badge mono">${escapeHtml(platform.os.toUpperCase())}</span>
        <span class="badge muted mono">Tauri ${platform.tauri ? '2' : '—'}</span>
      </div>
    </div>

    <div class="about-grid">
      ${[
        ['cpu', t('about.feature1'), t('about.feature1Sub')],
        ['film', t('about.feature2'), t('about.feature2Sub')],
        ['subtitles', t('about.feature3'), t('about.feature3Sub')],
        ['layers', t('about.feature4'), t('about.feature4Sub')],
        ['shield', t('about.feature5'), t('about.feature5Sub')],
        ['tv', t('about.feature6'), t('about.feature6Sub')],
      ]
        .map(
          ([ico, title, sub]) => `<div class="about-card">
            ${icon(ico)}
            <h4>${escapeHtml(title)}</h4>
            <p>${escapeHtml(sub)}</p>
          </div>`,
        )
        .join('')}
    </div>

    <div class="box-title" style="margin:24px 0 12px">${icon('globe')}<span>${escapeHtml(
      t('about.platforms'),
    )}</span></div>
    <div class="stream-grid">
      ${PLATFORMS.map(
        (p) => `<div class="provider" style="cursor:default">
          <span class="provider-logo" style="background:rgba(255,255,255,.07);color:var(--accent)">${icon(p.icon)}</span>
          <span class="provider-meta">
            <span class="provider-name">${escapeHtml(p.name)}</span>
            <span class="provider-sub">${escapeHtml(p.sub)}</span>
          </span>
          <span class="badge">READY</span>
        </div>`,
      ).join('')}
    </div>

    <div style="margin:26px 0 10px;text-align:center;color:var(--text-4);font-size:.8rem">
      <p>${t('about.credits')}</p>
      <p style="margin-top:6px">${t('about.license')}: MIT · ${t('settings.storage')}: ${store.media.length}</p>
    </div>`;
  hydrateIcons(host);
  void ctx;
}
