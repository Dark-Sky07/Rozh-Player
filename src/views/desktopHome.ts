/** ROZH Player — focused Windows desktop home. */

import type { AppContext } from '../core/context';
import { icon, hydrateIcons } from '../core/icons';
import { t, n } from '../core/i18n';
import { store, type MediaItem } from '../core/store';
import { escapeHtml, fmtBytes, fmtTime, isAudioFile } from '../core/util';

function isResume(item: MediaItem): boolean {
  return item.kind !== 'audio' && item.duration > 0 && item.position > 15 && item.position < item.duration - 25;
}

function kind(item: MediaItem): 'video' | 'audio' | 'stream' {
  if (item.source === 'url' || item.kind === 'stream') return 'stream';
  return item.kind === 'audio' || isAudioFile(item.name) ? 'audio' : 'video';
}

function art(item: MediaItem, className = ''): string {
  if (item.thumb) return `<img class="${className}" src="${escapeHtml(item.thumb)}" alt="" loading="lazy" />`;
  const type = kind(item);
  return `<span class="win-art-fallback ${className}">${icon(type === 'audio' ? 'music' : type === 'stream' ? 'broadcast' : 'film')}</span>`;
}

function tile(item: MediaItem): string {
  const type = kind(item);
  const percent = item.duration > 0 ? Math.min(100, Math.max(0, (item.position / item.duration) * 100)) : 0;
  return `<button class="win-media-tile" type="button" data-home-media="${escapeHtml(item.id)}" aria-label="${escapeHtml(t('desktop.playItem', { title: item.title }))}">
    <span class="win-tile-art">${art(item)}<span class="win-tile-play">${icon('play')}</span>
      <span class="win-tile-kind">${escapeHtml(t(type === 'audio' ? 'desktop.audio' : type === 'stream' ? 'desktop.stream' : 'desktop.video'))}</span>
      ${percent > 1 && percent < 96 ? `<span class="win-tile-progress"><i style="width:${percent}%"></i></span>` : ''}
    </span>
    <span class="win-tile-meta"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.source === 'url' ? item.url ?? '' : item.size ? fmtBytes(item.size) : item.name)}</small></span>
  </button>`;
}

function quickLink(view: 'library' | 'streams' | 'history', title: string, subtitle: string, iconName: string): string {
  return `<button class="win-quick-link" type="button" data-home-go="${view}">
    <span class="win-quick-icon">${icon(iconName)}</span>
    <span><b>${escapeHtml(title)}</b><small>${escapeHtml(subtitle)}</small></span>
    ${icon('arrow-right')}
  </button>`;
}

export function renderDesktopHome(host: HTMLElement, ctx: AppContext): void {
  const library = store.library();
  const recent = [...library].sort((a, b) => (b.playedAt || b.addedAt || 0) - (a.playedAt || a.addedAt || 0));
  const resumable = recent.filter(isResume);
  const featured = resumable[0] ?? recent[0];
  const played = recent.filter((item) => item.playedAt > 0).slice(0, 8);
  const percent = featured?.duration ? Math.min(100, Math.max(0, (featured.position / featured.duration) * 100)) : 0;

  host.innerHTML = `<div class="win-home">
    <section class="win-home-hero ${featured?.thumb ? 'has-art' : ''}" aria-label="${escapeHtml(t('desktop.homeTitle'))}">
      <div class="win-hero-backdrop">${featured?.thumb ? art(featured, 'win-hero-image') : `<span class="win-hero-emblem">${icon('play')}</span>`}</div>
      <div class="win-hero-shade"></div>
      <div class="win-hero-copy">
        <span class="win-overline"><i></i>${escapeHtml(featured ? t(resumable.length ? 'desktop.resumeLabel' : 'desktop.recentLabel') : t('desktop.libraryLabel'))}</span>
        <h2>${escapeHtml(featured?.title ?? t('desktop.homeTitle'))}</h2>
        <p>${escapeHtml(featured ? (isResume(featured) ? t('desktop.resumeAt', { time: fmtTime(featured.position) }) : t('desktop.featuredSub')) : t('desktop.homeSub'))}</p>
        ${featured && isResume(featured) ? `<div class="win-hero-progress"><span><i style="width:${percent}%"></i></span><small>${fmtTime(featured.position)} / ${fmtTime(featured.duration)}</small></div>` : ''}
        <div class="win-hero-actions">
          ${featured ? `<button class="btn btn-primary win-resume" type="button" data-home-media="${escapeHtml(featured.id)}">${icon('play')}<span>${escapeHtml(t(isResume(featured) ? 'desktop.resume' : 'desktop.playNow'))}</span></button>` : `<span class="win-home-hint">${icon('mouse-pointer')}<span>${escapeHtml(t('desktop.openHint'))}</span></span>`}
          <button class="btn btn-ghost" type="button" data-home-go="library">${icon('film')}<span>${escapeHtml(t('desktop.browseLibrary'))}</span></button>
        </div>
      </div>
      <div class="win-hero-count"><b>${n(library.length)}</b><span>${escapeHtml(t('desktop.mediaItems'))}</span></div>
    </section>

    <section class="win-quick-links" aria-label="${escapeHtml(t('desktop.shortcuts'))}">
      ${quickLink('library', t('nav.library'), t('desktop.libraryShortcut'), 'film')}
      ${quickLink('streams', t('nav.streams'), t('desktop.streamsShortcut'), 'broadcast')}
      ${quickLink('history', t('nav.history'), t('desktop.historyShortcut'), 'history')}
    </section>

    <section class="win-home-section">
      <div class="win-section-heading"><div><span>${escapeHtml(t('desktop.yourMedia'))}</span><h2>${escapeHtml(t(played.length ? 'desktop.recentlyPlayed' : 'desktop.newToYou'))}</h2></div>
        ${library.length ? `<button class="win-section-link" type="button" data-home-go="library">${escapeHtml(t('desktop.seeLibrary'))}${icon('arrow-right')}</button>` : ''}
      </div>
      ${played.length ? `<div class="win-media-row">${played.map(tile).join('')}</div>` : `<div class="win-home-empty"><span class="win-empty-icon">${icon('clapperboard')}</span><div><b>${escapeHtml(t('desktop.emptyTitle'))}</b><p>${escapeHtml(t('desktop.emptySub'))}</p></div><span class="win-empty-shortcut"><kbd>Ctrl</kbd><span>+</span><kbd>O</kbd></span></div>`}
    </section>
  </div>`;

  hydrateIcons(host);
  host.querySelectorAll<HTMLElement>('[data-home-media]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = store.media.find((candidate) => candidate.id === button.dataset.homeMedia);
      if (item) void ctx.playMedia(item);
    });
  });
  host.querySelectorAll<HTMLElement>('[data-home-go]').forEach((button) => {
    button.addEventListener('click', () => ctx.navigate(button.dataset.homeGo as 'library' | 'streams' | 'history'));
  });
}
