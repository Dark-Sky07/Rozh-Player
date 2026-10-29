/** ROZH Player — the library grid. */

import type { AppContext } from '../core/context';
import { icon, hydrateIcons } from '../core/icons';
import { t, n } from '../core/i18n';
import { store, type MediaItem } from '../core/store';
import { confirmDialog, toast } from '../core/ui';
import { escapeHtml, fmtBytes, fmtTime, fmtRelative, isAudioFile, pickFiles, $, $$ } from '../core/util';

let filter: 'all' | 'video' | 'audio' | 'stream' = 'all';
let query = '';

/** Grab a poster frame from a local file without touching the main player. */
export async function generateThumb(file: File): Promise<string | undefined> {
  if (!store.settings.thumbnails) return undefined;
  if (isAudioFile(file.name)) return undefined;
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'metadata';
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      const done = (): void => resolve();
      video.addEventListener('loadeddata', done, { once: true });
      video.addEventListener('error', () => reject(new Error('decode')), { once: true });
      setTimeout(done, 2000);
    });
    const target = Math.min(Math.max(0.6, (video.duration || 4) * 0.12), 20);
    video.currentTime = target;
    await new Promise<void>((resolve) => {
      video.addEventListener('seeked', () => resolve(), { once: true });
      setTimeout(resolve, 1400);
    });
    if (!video.videoWidth) return undefined;
    const w = 384;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = Math.round((video.videoHeight / video.videoWidth) * w) || 216;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return undefined;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

function kindOf(item: MediaItem): 'video' | 'audio' | 'stream' {
  if (item.source === 'url') return 'stream';
  if (item.kind === 'audio' || isAudioFile(item.name)) return 'audio';
  return 'video';
}

function card(item: MediaItem): string {
  const k = kindOf(item);
  const progress = item.duration > 0 ? Math.min(100, (item.position / item.duration) * 100) : 0;
  const thumb = item.thumb
    ? `<img src="${item.thumb}" alt="" loading="lazy" />`
    : `<div class="ph">${icon(k === 'audio' ? 'music' : k === 'stream' ? 'broadcast' : 'film')}</div>`;
  return `
    <div class="media-card" data-id="${item.id}" role="button" tabindex="0" aria-label="${escapeHtml(item.title)}">
      <div class="media-thumb">
        ${thumb}
        <div class="media-play"><i>${icon('play')}</i></div>
        ${item.duration ? `<span class="media-dur mono">${fmtTime(item.duration)}</span>` : ''}
        <span class="media-badge"><span class="badge ${k === 'stream' ? '' : 'muted'}">${k.toUpperCase()}</span></span>
        ${
          progress > 1 && progress < 96
            ? `<div class="media-progress"><i style="width:${progress}%"></i></div>`
            : ''
        }
        <button class="media-remove" data-remove="${item.id}" aria-label="${escapeHtml(t('library.remove'))}">${icon(
          'x',
        )}</button>
      </div>
      <div class="media-body">
        <div class="media-name">${escapeHtml(item.title)}</div>
        <div class="media-info">
          <span>${escapeHtml(
            item.source === 'url'
              ? new URL(item.url ?? 'https://x').hostname
              : item.size
                ? fmtBytes(item.size)
                : '—',
          )}</span>
          <span class="dotsep"></span>
          <span>${escapeHtml(item.playedAt ? fmtRelative(item.playedAt) : fmtRelative(item.addedAt))}</span>
        </div>
      </div>
    </div>`;
}

export function renderLibrary(host: HTMLElement, ctx: AppContext): void {
  const items = store.library();
  const filtered = items.filter((item) => {
    const k = kindOf(item);
    if (filter !== 'all' && k !== filter) return false;
    if (!query) return true;
    return item.title.toLowerCase().includes(query) || item.name.toLowerCase().includes(query);
  });

  const chips: { id: typeof filter; label: string; count: number }[] = [
    { id: 'all', label: t('library.all'), count: items.length },
    { id: 'video', label: t('library.video'), count: items.filter((i) => kindOf(i) === 'video').length },
    { id: 'audio', label: t('library.audio'), count: items.filter((i) => kindOf(i) === 'audio').length },
    { id: 'stream', label: t('library.streams'), count: items.filter((i) => kindOf(i) === 'stream').length },
  ];

  host.innerHTML = `
    <div class="view-head">
      <div>
        <h2>${t('library.title')}</h2>
        <p>${t('library.emptySub')}</p>
      </div>
      <div class="spacer"></div>
      <div class="row">
        <div class="field" style="width:min(46vw,260px)">
          ${icon('search')}
          <input type="search" placeholder="${escapeHtml(t('library.search'))}" value="${escapeHtml(query)}" data-search />
        </div>
        <button class="btn btn-primary" data-add>${icon('plus')}<span>${t('library.add')}</span></button>
      </div>
    </div>

    <div class="toolbar">
      <div class="filter-scroll">
        ${chips
          .map(
            (c) => `<button class="chip ${filter === c.id ? 'is-active' : ''}" data-filter="${c.id}">
              ${escapeHtml(c.label)} <span style="opacity:.6">${n(c.count)}</span>
            </button>`,
          )
          .join('')}
      </div>
      <div class="spacer"></div>
      ${items.length ? `<span class="muted" style="font-size:.78rem">${t('library.count', { n: n(filtered.length) })}</span>` : ''}
    </div>

    ${
      items.length === 0
        ? `<div class="empty-panel">
            <div class="ico-wrap">${icon('folder-open')}</div>
            <h3>${t('library.empty')}</h3>
            <p>${t('library.emptySub')}</p>
            <button class="btn btn-primary" style="margin-top:12px" data-add>${icon('plus')}<span>${t(
              'library.add',
            )}</span></button>
          </div>`
        : filtered.length === 0
          ? `<div class="empty-panel">
              <div class="ico-wrap">${icon('search')}</div>
              <h3>${t('library.noMatch')}</h3>
              <p>${t('library.noMatchSub')}</p>
            </div>`
          : `<div class="media-grid">${filtered.map((i) => card(i)).join('')}</div>`
    }`;

  hydrateIcons(host);

  $$('[data-filter]', host).forEach((chip) =>
    chip.addEventListener('click', () => {
      filter = (chip as HTMLElement).dataset.filter as typeof filter;
      renderLibrary(host, ctx);
    }),
  );

  const search = $('[data-search]', host) as HTMLInputElement | null;
  search?.addEventListener('input', () => {
    query = search.value;
    // re-render without losing focus or caret
    const pos = search.selectionStart;
    renderLibrary(host, ctx);
    const next = $('[data-search]', host) as HTMLInputElement | null;
    next?.focus();
    if (next && pos != null) next.setSelectionRange(pos, pos);
  });

  $$('[data-add]', host).forEach((btn) =>
    btn.addEventListener('click', async () => {
      const files = await pickFiles();
      if (files.length) await ctx.addFilesToLibrary(files);
    }),
  );

  $$('.media-card', host).forEach((cardEl) => {
    const id = (cardEl as HTMLElement).dataset.id!;
    const item = store.media.find((m) => m.id === id);
    if (!item) return;
    const open = (): void => {
      void ctx.playMedia(item);
    };
    cardEl.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-remove]')) return;
      open();
    });
    cardEl.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });

  $$('[data-remove]', host).forEach((btn) =>
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.remove!;
      const item = store.media.find((m) => m.id === id);
      if (!item) return;
      const ok = await confirmDialog(`${t('library.remove')}: «${item.title}»`, { danger: true });
      if (ok) {
        store.removeMedia(id);
        toast(t('library.remove'), 'info', 1500);
        renderLibrary(host, ctx);
        ctx.refreshNav();
      }
    }),
  );
}
