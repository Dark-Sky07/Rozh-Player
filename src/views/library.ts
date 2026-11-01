/** ROZH Player — the library grid. */

import type { AppContext } from '../core/context';
import { icon, hydrateIcons } from '../core/icons';
import type { NativeFile } from '../core/native';
import { t, n } from '../core/i18n';
import { store, type MediaItem } from '../core/store';
import { focusView } from '../core/tv';
import {
  applyDeviceStatus,
  isAndroidDevice,
  lastDeviceStatus,
  onDeviceSync,
  pickDeviceFolder,
  syncDeviceLibrary,
  type DeviceStatus,
} from '../core/device';
import { confirmDialog, openModal, toast } from '../core/ui';
import { escapeHtml, fmtBytes, fmtTime, fmtRelative, isAudioFile, pickFiles, platform, $, $$ } from '../core/util';

export type LibraryFilter = 'all' | 'video' | 'audio' | 'stream' | 'favorites' | 'playlists';

let filter: LibraryFilter = 'all';
let query = '';
let openedPlaylistId: string | null = null;

/** Set a TV navigation category before opening the shared library view. */
export function setLibraryFilter(next: LibraryFilter): void {
  filter = next;
  query = '';
}
/** Last device-scan report, kept so a redraw does not lose the progress bar. */
let deviceStatus: DeviceStatus | null = null;
let deviceBound = false;
let lastCtx: AppContext | null = null;

/** Grab a poster frame from a local file without touching the main player. */
export async function generateThumb(file: File): Promise<string | undefined> {
  if (!store.settings.thumbnails) return undefined;
  if (isAudioFile(file.name)) return undefined;
  const native = (file as NativeFile).__url;
  const url = native ?? URL.createObjectURL(file);
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
    if (!native) URL.revokeObjectURL(url);
  }
}

function kindOf(item: MediaItem): 'video' | 'audio' | 'stream' {
  if (item.source === 'url') return 'stream';
  if (item.kind === 'audio' || isAudioFile(item.name)) return 'audio';
  return 'video';
}

function streamHost(raw?: string): string {
  if (!raw) return t('player.stream');
  try {
    const url = new URL(raw);
    return url.hostname || t('player.stream');
  } catch {
    return t('player.stream');
  }
}

function card(item: MediaItem): string {
  const k = kindOf(item);
  const progress = item.duration > 0 ? Math.min(100, Math.max(0, (item.position / item.duration) * 100)) : 0;
  const thumb = item.thumb
    ? `<img src="${escapeHtml(item.thumb)}" alt="" loading="lazy" />`
    : `<div class="ph">${icon(k === 'audio' ? 'music' : k === 'stream' ? 'broadcast' : 'film')}</div>`;
  return `
    <div class="media-card" data-id="${escapeHtml(item.id)}" role="button" tabindex="0" aria-label="${escapeHtml(item.title)}">
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
        <button class="media-remove" data-remove="${escapeHtml(item.id)}" aria-label="${escapeHtml(t('library.remove'))}">${icon(
          'x',
        )}</button>
      </div>
      <div class="media-body">
        <div class="media-name">${escapeHtml(item.title)}</div>
        <div class="media-info">
          <span>${escapeHtml(
            item.source === 'url'
              ? streamHost(item.url)
              : item.size
                ? fmtBytes(item.size)
                : '—',
          )}</span>
          <span class="dotsep"></span>
          <span>${escapeHtml(item.playedAt ? fmtRelative(item.playedAt) : fmtRelative(item.addedAt))}</span>
        </div>
        ${platform.tv ? `<div class="media-card-actions">
          <button class="media-action ${item.favorite ? 'is-favorite' : ''}" data-favorite="${escapeHtml(item.id)}" aria-pressed="${
            item.favorite ? 'true' : 'false'
          }" aria-label="${escapeHtml(t(item.favorite ? 'library.favoriteRemoved' : 'library.favoriteAdded'))}">${icon('star')}</button>
          <button class="media-action" data-playlist-add="${escapeHtml(item.id)}" aria-label="${escapeHtml(
            t('library.playlistAdd'),
          )}">${icon('plus')}</button>
        </div>` : ''}
      </div>
    </div>`;
}

/**
 * Android-only strip above the grid: what the last scan found, a button to run
 * it again, the folder picker, and the permission prompt when access is missing.
 */
function devicePanel(): string {
  if (!isAndroidDevice()) return '';
  const st = (deviceStatus ?? lastDeviceStatus())?.state;
  const busy = st === 'scanning' || st === 'picking' || st === 'starting';
  const denied = st === 'permission' || st === 'denied';
  const count = store.deviceCount();
  const status =
    st === 'scanning'
      ? t('device.scanning')
      : st === 'picking'
        ? t('device.picking')
        : st === 'denied'
          ? t('device.denied')
          : count
            ? t('device.count', { n: n(count) })
            : t('device.sub');

  return `
    <div class="device-bar ${denied ? 'is-warn' : ''} ${busy ? 'is-busy' : ''}" data-device-bar>
      <span class="db-ico">${icon(denied ? 'shield' : busy ? 'rotateccw' : 'smartphone')}</span>
      <div class="db-text">
        <b>${escapeHtml(denied ? t('device.permission') : t('device.title'))}</b>
        <small>${escapeHtml(denied ? t('device.permissionSub') : status)}</small>
      </div>
      <div class="db-actions">
        ${
          denied
            ? `<button class="btn btn-primary btn-sm" data-grant>${icon('shield')}<span>${escapeHtml(t('device.grant'))}</span></button>`
            : `<button class="btn btn-sm" data-scan ${busy ? 'disabled' : ''}>${icon('rotateccw')}<span>${escapeHtml(
                t('device.scan'),
              )}</span></button>`
        }
        <button class="btn btn-sm" data-folder ${busy ? 'disabled' : ''}>${icon('folder')}<span>${escapeHtml(
          t('device.folder'),
        )}</span></button>
      </div>
    </div>`;
}

async function runDeviceSync(host: HTMLElement, ctx: AppContext, kind: 'scan' | 'folder'): Promise<void> {
  const done = kind === 'scan' ? await syncDeviceLibrary({ reason: 'manual' }) : applyDeviceStatus(await pickDeviceFolder());
  if (done.status?.state === 'cancelled') {
    toast(t('device.cancelled'), 'info', 1800);
  } else if (done.status?.state === 'error') {
    toast(t('device.error'), 'bad', 2400);
  } else if (done.status?.state === 'permission' || done.status?.state === 'denied') {
    // the prompt is on screen; the panel explains what to do next
  } else if (done.status?.state === 'ready' || done.added || done.removed) {
    toast(t('device.ready', { n: n(store.deviceCount()) }), 'ok', 2200);
  } else {
    toast(t('device.empty'), 'info', 1800);
  }
  renderLibrary(host, ctx);
  if (platform.tv) focusView('library');
  ctx.refreshNav();
}

function openPlaylistDialog(mediaId: string, host: HTMLElement, ctx: AppContext): void {
  const playlists = store.getPlaylists();
  const options = playlists
    .map((playlist) => `<option value="${escapeHtml(playlist.id)}">${escapeHtml(playlist.name)}</option>`)
    .join('');
  openModal({
    title: t('library.playlistAdd'),
    icon: 'list-video',
    body: `<label class="form-label">${escapeHtml(t('library.playlists'))}</label>
      <select class="input" data-playlist-select ${playlists.length ? '' : 'disabled'}>${options}</select>
      <label class="form-label" style="margin-top:16px">${escapeHtml(t('library.playlistName'))}</label>
      <input class="input" data-playlist-name maxlength="80" placeholder="${escapeHtml(t('library.playlistName'))}" />`,
    footer: `<button class="btn" data-playlist-cancel>${escapeHtml(t('common.cancel'))}</button>
      <button class="btn" data-playlist-create>${escapeHtml(t('library.playlistCreate'))}</button>
      <button class="btn btn-primary" data-playlist-confirm ${playlists.length ? '' : 'disabled'}>${escapeHtml(
        t('library.playlistAdd'),
      )}</button>`,
    onMount: (root, close) => {
      const nameInput = $('[data-playlist-name]', root) as HTMLInputElement | null;
      $('[data-playlist-cancel]', root)?.addEventListener('click', close);
      $('[data-playlist-create]', root)?.addEventListener('click', () => {
        const playlist = store.createPlaylist(nameInput?.value ?? '');
        if (!playlist) {
          nameInput?.focus();
          return;
        }
        store.addToPlaylist(playlist.id, mediaId);
        close();
        toast(t('library.playlistAdded'), 'ok');
        renderLibrary(host, ctx);
        ctx.refreshNav();
      });
      $('[data-playlist-confirm]', root)?.addEventListener('click', () => {
        const select = $('[data-playlist-select]', root) as HTMLSelectElement | null;
        if (!select?.value) return;
        const added = store.addToPlaylist(select.value, mediaId);
        if (!added) toast(t('library.playlistDuplicate'), 'info');
        else toast(t('library.playlistAdded'), 'ok');
        close();
        renderLibrary(host, ctx);
        ctx.refreshNav();
      });
      requestAnimationFrame(() => (playlists.length ? $('[data-playlist-select]', root) : nameInput)?.focus());
    },
  });
}

function renderPlaylists(host: HTMLElement, ctx: AppContext): void {
  const playlists = store.getPlaylists();
  const active = openedPlaylistId ? playlists.find((playlist) => playlist.id === openedPlaylistId) : null;
  if (openedPlaylistId && !active) openedPlaylistId = null;
  const media = active ? store.playlistItems(active.id) : [];
  const content = active
    ? `<div class="view-head playlist-head">
        <div><h2>${escapeHtml(active.name)}</h2><p>${escapeHtml(t('library.playlistCount', { n: n(media.length) }))}</p></div>
        <div class="spacer"></div>
        ${media.length ? `<button class="btn btn-primary" data-playlist-play>${icon('play')}<span>${escapeHtml(t('library.playlistPlay'))}</span></button>` : ''}
        <button class="btn" data-playlist-back>${icon('arrow-left')}<span>${escapeHtml(t('library.playlistBack'))}</span></button>
      </div>
      ${media.length ? `<div class="playlist-media-grid">${media
        .map((item, index) => `<div class="playlist-media-item">
          <button class="playlist-media-play" data-media-play="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.title)}">
            ${item.thumb ? `<img src="${escapeHtml(item.thumb)}" alt="" loading="lazy" />` : `<span>${icon(kindOf(item) === 'audio' ? 'music' : 'film')}</span>`}
            <b>${n(index + 1)}. ${escapeHtml(item.title)}</b>
          </button>
          <button class="media-action" data-playlist-remove="${escapeHtml(item.id)}" aria-label="${escapeHtml(t('library.playlistRemove'))}">${icon('x')}</button>
        </div>`)
        .join('')}</div>` : `<div class="empty-panel"><div class="ico-wrap">${icon('list-video')}</div><h3>${escapeHtml(
          t('library.playlistEmpty'),
        )}</h3><button class="btn" data-playlist-browse>${icon('grid')}<span>${escapeHtml(t('library.playlistBrowse'))}</span></button></div>`}`
    : `<div class="view-head playlist-head">
        <div><h2>${escapeHtml(t('library.playlists'))}</h2><p>${escapeHtml(t('library.playlistCount', { n: n(playlists.length) }))}</p></div>
        <div class="spacer"></div>
        <button class="btn" data-browse-media>${icon('grid')}<span>${escapeHtml(t('library.all'))}</span></button>
        <button class="btn btn-primary" data-playlist-new>${icon('plus')}<span>${escapeHtml(t('library.createPlaylist'))}</span></button>
      </div>
      ${playlists.length ? `<div class="playlist-grid">${playlists
        .map((playlist) => `<div class="playlist-card-wrap">
          <button class="playlist-card" data-playlist-open="${escapeHtml(playlist.id)}">
            <span class="playlist-card-icon">${icon('list-video')}</span>
            <span class="playlist-card-copy"><b>${escapeHtml(playlist.name)}</b><small>${escapeHtml(
              t('library.playlistCount', { n: n(playlist.itemIds.filter((id) => store.media.some((item) => item.id === id)).length) }),
            )}</small></span>
            ${icon('chevron-right')}
          </button>
          <button class="media-action" data-playlist-delete="${escapeHtml(playlist.id)}" aria-label="${escapeHtml(t('library.playlistDelete'))}">${icon('trash')}</button>
        </div>`)
        .join('')}</div>` : `<div class="empty-panel"><div class="ico-wrap">${icon('list-video')}</div><h3>${escapeHtml(
          t('library.noPlaylists'),
        )}</h3><button class="btn btn-primary" data-playlist-new>${icon('plus')}<span>${escapeHtml(t('library.createPlaylist'))}</span></button></div>`}`;

  host.innerHTML = content;
  hydrateIcons(host);
  $('[data-playlist-back]', host)?.addEventListener('click', () => {
    openedPlaylistId = null;
    renderLibrary(host, ctx);
  });
  $('[data-playlist-play]', host)?.addEventListener('click', () => {
    void ctx.playMediaQueue(media);
  });
  $('[data-playlist-browse], [data-browse-media]', host)?.addEventListener('click', () => ctx.navigate('library', 'all'));
  $('[data-playlist-new]', host)?.addEventListener('click', () => {
    openModal({
      title: t('library.createPlaylist'),
      icon: 'list-video',
      body: `<label class="form-label">${escapeHtml(t('library.playlistName'))}</label><input class="input" data-new-playlist maxlength="80" autofocus />`,
      footer: `<button class="btn" data-cancel>${escapeHtml(t('common.cancel'))}</button><button class="btn btn-primary" data-create>${escapeHtml(
        t('library.playlistCreate'),
      )}</button>`,
      onMount: (root, close) => {
        const input = $('[data-new-playlist]', root) as HTMLInputElement | null;
        $('[data-cancel]', root)?.addEventListener('click', close);
        const create = (): void => {
          const playlist = store.createPlaylist(input?.value ?? '');
          if (!playlist) {
            input?.focus();
            return;
          }
          openedPlaylistId = playlist.id;
          close();
          renderLibrary(host, ctx);
          ctx.refreshNav();
        };
        $('[data-create]', root)?.addEventListener('click', create);
        input?.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') create();
        });
        requestAnimationFrame(() => input?.focus());
      },
    });
  });
  $$('[data-playlist-open]', host).forEach((button) => button.addEventListener('click', () => {
    openedPlaylistId = (button as HTMLElement).dataset.playlistOpen ?? null;
    renderLibrary(host, ctx);
  }));
  $$('[data-playlist-delete]', host).forEach((button) => button.addEventListener('click', async () => {
    const id = (button as HTMLElement).dataset.playlistDelete!;
    const playlist = store.getPlaylists().find((candidate) => candidate.id === id);
    if (!playlist || !(await confirmDialog(`${t('library.playlistDelete')}: «${playlist.name}»`, { danger: true }))) return;
    store.deletePlaylist(id);
    renderLibrary(host, ctx);
    ctx.refreshNav();
  }));
  $$('[data-playlist-remove]', host).forEach((button) => button.addEventListener('click', () => {
    if (!active) return;
    store.removeFromPlaylist(active.id, (button as HTMLElement).dataset.playlistRemove!);
    renderLibrary(host, ctx);
    ctx.refreshNav();
  }));
  $$('[data-media-play]', host).forEach((button) => button.addEventListener('click', () => {
    const item = store.media.find((candidate) => candidate.id === (button as HTMLElement).dataset.mediaPlay);
    if (item) void ctx.playMedia(item);
  }));
}

export function renderLibrary(host: HTMLElement, ctx: AppContext): void {
  lastCtx = ctx;
  if (filter === 'playlists') {
    renderPlaylists(host, ctx);
    return;
  }
  const items = store.library();
  const filtered = items.filter((item) => {
    const k = kindOf(item);
    if (filter === 'favorites' && !item.favorite) return false;
    if (filter !== 'all' && filter !== 'favorites' && k !== filter) return false;
    if (!query) return true;
    return item.title.toLowerCase().includes(query) || item.name.toLowerCase().includes(query);
  });

  const chips: { id: LibraryFilter; label: string; count: number }[] = [
    { id: 'all', label: t('library.all'), count: items.length },
    { id: 'video', label: t('library.video'), count: items.filter((i) => kindOf(i) === 'video').length },
    { id: 'audio', label: t('library.audio'), count: items.filter((i) => kindOf(i) === 'audio').length },
    { id: 'stream', label: t('library.streams'), count: items.filter((i) => kindOf(i) === 'stream').length },
    ...(platform.tv
      ? [
          { id: 'favorites' as const, label: t('library.favorites'), count: store.favorites().length },
          { id: 'playlists' as const, label: t('library.playlists'), count: store.getPlaylists().length },
        ]
      : []),
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

    ${devicePanel()}

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
              <div class="ico-wrap">${icon(filter === 'favorites' ? 'star' : 'search')}</div>
              <h3>${t(filter === 'favorites' ? 'library.noFavorites' : 'library.noMatch')}</h3>
              <p>${t(filter === 'favorites' ? 'library.noFavoritesSub' : 'library.noMatchSub')}</p>
            </div>`
          : `<div class="media-grid">${filtered.map((i) => card(i)).join('')}</div>`
    }`;

  hydrateIcons(host);

  if (isAndroidDevice() && !deviceBound) {
    deviceBound = true;
    deviceStatus = lastDeviceStatus();
    onDeviceSync((status) => {
      const changedState = status?.state !== deviceStatus?.state;
      deviceStatus = status;
      const live = document.querySelector<HTMLElement>('.view[data-view="library"].is-active');
      if (live && lastCtx && changedState) {
        renderLibrary(live, lastCtx);
        if (platform.tv) focusView('library');
      }
    });
  }

  $$('[data-scan]', host).forEach((btn) =>
    btn.addEventListener('click', () => void runDeviceSync(host, ctx, 'scan')),
  );
  $$('[data-grant]', host).forEach((btn) =>
    btn.addEventListener('click', () => void runDeviceSync(host, ctx, 'scan')),
  );
  $$('[data-folder]', host).forEach((btn) =>
    btn.addEventListener('click', () => void runDeviceSync(host, ctx, 'folder')),
  );

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
      // Android TV has no dependable WebView file chooser. Use SAF and keep the
      // user in the library, where the indexed media is immediately playable.
      if (isAndroidDevice() && platform.tv) {
        await runDeviceSync(host, ctx, 'folder');
        return;
      }
      const files = await pickFiles();
      if (files.length) await ctx.addFilesToLibrary(files);
    }),
  );

  $$('[data-favorite]', host).forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    const id = (button as HTMLElement).dataset.favorite!;
    const favorite = store.toggleFavorite(id);
    toast(t(favorite ? 'library.favoriteAdded' : 'library.favoriteRemoved'), 'info', 1600);
    renderLibrary(host, ctx);
    ctx.refreshNav();
  }));
  $$('[data-playlist-add]', host).forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    openPlaylistDialog((button as HTMLElement).dataset.playlistAdd!, host, ctx);
  }));

  $$('.media-card', host).forEach((cardEl) => {
    const id = (cardEl as HTMLElement).dataset.id!;
    const item = store.media.find((m) => m.id === id);
    if (!item) return;
    const open = (): void => {
      void ctx.playMedia(item);
    };
    cardEl.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      open();
    });
    cardEl.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
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
