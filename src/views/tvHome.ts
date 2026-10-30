/** ROZH Player — remote-first Android TV home. */

import type { AppContext } from '../core/context';
import { icon, hydrateIcons } from '../core/icons';
import { applyDeviceStatus, isAndroidDevice, lastDeviceStatus, onDeviceSync, pickDeviceFolder, syncDeviceLibrary, type DeviceStatus } from '../core/device';
import { t, n } from '../core/i18n';
import { store, type MediaItem } from '../core/store';
import { toast } from '../core/ui';
import { escapeHtml, fmtTime, isAudioFile } from '../core/util';

let deviceStatus: DeviceStatus | null = null;
let subscribed = false;
let context: AppContext | null = null;

function mediaKind(item: MediaItem): 'video' | 'audio' {
  return item.kind === 'audio' || isAudioFile(item.name) ? 'audio' : 'video';
}

function isResumable(item: MediaItem): boolean {
  return item.duration > 0 && item.position > 15 && item.position < item.duration - 25;
}

function progress(item: MediaItem): number {
  return item.duration > 0 ? Math.min(100, Math.max(0, (item.position / item.duration) * 100)) : 0;
}

function art(item: MediaItem): string {
  if (item.thumb) return `<img src="${escapeHtml(item.thumb)}" alt="" loading="lazy" />`;
  const type = mediaKind(item);
  return `<span class="tv-art-fallback tv-art-${type}">${icon(type === 'audio' ? 'music' : 'film')}</span>`;
}

function card(item: MediaItem, resume = false): string {
  const pct = progress(item);
  const type = mediaKind(item);
  return `<button class="tv-card" type="button" data-tv-media="${escapeHtml(item.id)}" aria-label="${escapeHtml(
    `${resume ? `${t('tv.resume')}: ` : ''}${item.title}`,
  )}">
    <span class="tv-card-art">${art(item)}<span class="tv-card-kind">${escapeHtml(t(type === 'audio' ? 'tv.music' : 'tv.video'))}</span>
      ${resume ? `<span class="tv-card-progress"><i style="width:${pct}%"></i></span>` : ''}
      ${resume ? `<span class="tv-card-time">${fmtTime(Math.max(0, item.duration - item.position))} ${escapeHtml(t('tv.left'))}</span>` : ''}
    </span>
    <span class="tv-card-title">${escapeHtml(item.title)}</span>
    <span class="tv-card-sub">${escapeHtml(resume ? `${fmtTime(item.position)} / ${fmtTime(item.duration)}` : item.bucket || item.name)}</span>
  </button>`;
}

function shelf(title: string, items: MediaItem[], resume = false, goTo = 'library'): string {
  if (!items.length) return '';
  return `<section class="tv-shelf" aria-label="${escapeHtml(title)}">
    <div class="tv-shelf-head"><h2>${escapeHtml(title)}</h2><button class="tv-view-all" data-tv-go="${goTo}">${escapeHtml(t('tv.viewAll'))}${icon('chevron-right')}</button></div>
    <div class="tv-rail-scroll"><div class="tv-rail-items">${items.map((item) => card(item, resume)).join('')}</div></div>
  </section>`;
}

function hero(item: MediaItem | undefined, count: number): string {
  if (!item) {
    return `<section class="tv-hero tv-hero-empty" aria-label="${escapeHtml(t('view.home'))}">
      <div class="tv-hero-backdrop"><span class="tv-hero-glow"></span><span class="tv-hero-mark">${icon('play')}</span></div>
      <div class="tv-hero-copy">
        <span class="tv-eyebrow">ROZH PLAYER <i></i> ${escapeHtml(t('tv.homeLabel'))}</span>
        <h1>${escapeHtml(count ? t('tv.libraryReady') : t('tv.welcome'))}</h1>
        <p>${escapeHtml(count ? t('tv.libraryReadySub') : t('tv.emptySub'))}</p>
        <div class="tv-hero-actions">
          <button class="tv-action tv-action-primary" data-act="open">${icon('folder-open')}<span>${escapeHtml(t('player.openFile'))}</span></button>
          ${isAndroidDevice() ? `<button class="tv-action" data-tv-scan>${icon('rotate')}<span data-tv-scan-label>${escapeHtml(t(deviceStatus?.state === 'scanning' ? 'tv.scanning' : 'tv.scan'))}</span></button>` : ''}
          <button class="tv-action" data-tv-go="library">${icon('film')}<span>${escapeHtml(t('nav.library'))}</span></button>
        </div>
      </div>
      <div class="tv-hero-foot"><span>${icon('hard-drive')}<b>${escapeHtml(t('tv.deviceLibrary'))}</b></span><strong>${n(count)} <small>${escapeHtml(t('tv.items'))}</small></strong></div>
    </section>`;
  }

  const pct = progress(item);
  const status = isResumable(item) ? t('tv.continueWatching') : t('tv.recentlyAdded');
  return `<section class="tv-hero" aria-label="${escapeHtml(status)}">
    <div class="tv-hero-backdrop">${item.thumb ? `<img src="${escapeHtml(item.thumb)}" alt="" />` : `<span class="tv-hero-mark">${icon(mediaKind(item) === 'audio' ? 'music' : 'film')}</span>`}<span class="tv-hero-shade"></span></div>
    <div class="tv-hero-copy">
      <span class="tv-eyebrow">ROZH PLAYER <i></i> ${escapeHtml(status)}</span>
      <h1>${escapeHtml(item.title)}</h1>
      <p>${escapeHtml(isResumable(item) ? t('tv.resumeSub', { time: fmtTime(item.position) }) : item.bucket || item.name)}</p>
      ${isResumable(item) ? `<div class="tv-hero-progress"><span><i style="width:${pct}%"></i></span><small>${fmtTime(item.position)} / ${fmtTime(item.duration)}</small></div>` : ''}
      <div class="tv-hero-actions">
        <button class="tv-action tv-action-primary" data-tv-media="${escapeHtml(item.id)}">${icon('play')}<span>${escapeHtml(isResumable(item) ? t('tv.resume') : t('player.play'))}</span></button>
        <button class="tv-action" data-tv-go="library">${icon('film')}<span>${escapeHtml(t('nav.library'))}</span></button>
        <button class="tv-action tv-action-icon" data-act="open" aria-label="${escapeHtml(t('player.openFile'))}">${icon('folder-open')}</button>
      </div>
    </div>
    <div class="tv-hero-foot"><span>${icon(mediaKind(item) === 'audio' ? 'music' : 'film')}<b>${escapeHtml(mediaKind(item) === 'audio' ? t('tv.music') : t('tv.video'))}</b></span><strong>${item.duration ? fmtTime(item.duration) : t('tv.ready')}</strong></div>
  </section>`;
}

export function renderTvHome(host: HTMLElement, ctx: AppContext): void {
  context = ctx;
  deviceStatus = lastDeviceStatus();
  const all = store.library();
  const videos = all.filter((item) => mediaKind(item) === 'video');
  const audio = all.filter((item) => mediaKind(item) === 'audio');
  const resumable = all.filter(isResumable).sort((a, b) => (b.playedAt || 0) - (a.playedAt || 0));
  const recent = [...all].sort((a, b) => (b.addedAt || b.playedAt || 0) - (a.addedAt || a.playedAt || 0));
  const featured = resumable[0] ?? recent[0];
  const count = isAndroidDevice() ? store.deviceCount() : all.length;

  host.innerHTML = `<div class="tv-home">
    ${hero(featured, count)}
    ${resumable.length ? shelf(t('tv.continueWatching'), resumable.slice(0, 12), true, 'history') : ''}
    ${shelf(t('tv.recentlyAdded'), recent.slice(0, 12))}
    ${shelf(t('tv.videoLibrary'), videos.slice(0, 12))}
    ${shelf(t('tv.musicLibrary'), audio.slice(0, 12))}
    ${all.length ? `<div class="tv-home-footer"><span>${icon('hard-drive')}${escapeHtml(t('tv.indexed', { count: n(count) }))}</span><button data-tv-go="library">${escapeHtml(t('tv.openLibrary'))}${icon('arrow-right')}</button></div>` : ''}
  </div>`;
  hydrateIcons(host);

  if (!subscribed && isAndroidDevice()) {
    subscribed = true;
    onDeviceSync((status) => {
      deviceStatus = status;
      const live = document.querySelector<HTMLElement>('.view[data-view="home"].is-active');
      const labels = document.querySelectorAll<HTMLElement>('[data-tv-scan-label]');
      if (status?.state === 'scanning') labels.forEach((label) => (label.textContent = t('tv.scanning')));
      if (live && status?.state === 'ready' && context) renderTvHome(live, context);
    });
  }

  host.querySelectorAll<HTMLElement>('[data-tv-media]').forEach((el) => {
    el.addEventListener('click', () => {
      const item = store.media.find((candidate) => candidate.id === el.dataset.tvMedia);
      if (item) void ctx.playMedia(item);
    });
  });
  host.querySelectorAll<HTMLElement>('[data-tv-go]').forEach((el) => {
    el.addEventListener('click', () => ctx.navigate(el.dataset.tvGo as Parameters<AppContext['navigate']>[0]));
  });
  host.querySelectorAll<HTMLButtonElement>('[data-tv-scan]').forEach((el) => {
    el.addEventListener('click', async () => {
      el.disabled = true;
      const result = await syncDeviceLibrary({ reason: 'manual' });
      if (result.status?.state === 'error') toast(t('device.error'), 'bad', 2400);
      else if (result.added || result.removed) toast(t('device.ready', { n: n(store.deviceCount()) }), 'ok', 2200);
      else if (result.status?.state !== 'permission' && result.status?.state !== 'denied') toast(t('device.empty'), 'info', 1800);
      if (document.querySelector('.view[data-view="home"].is-active') && context) renderTvHome(host, context);
      ctx.refreshNav();
    });
  });
  host.querySelectorAll<HTMLButtonElement>('[data-tv-folder]').forEach((el) => {
    el.addEventListener('click', async () => {
      const result = applyDeviceStatus(await pickDeviceFolder());
      if (result.status?.state === 'ready') toast(t('device.ready', { n: n(store.deviceCount()) }), 'ok', 2200);
      if (context) renderTvHome(host, context);
    });
  });
}
