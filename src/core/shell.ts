/** ROZH Player — application shell, routing and orchestration. */

import type { AppContext, ViewId } from './context';
import { icon, hydrateIcons } from './icons';
import { t, n } from './i18n';
import { mountPlayer, type Playable } from './player';
import { applySettings, store, type MediaItem } from './store';
import { convertFileSrc as convertNativePath, NativeFile, onNativeCommand, probeFile, urlForFile } from './native';
import { openDrawer, toast } from './ui';
import { applyDeviceStatus, isAndroidDevice, pickDeviceFolder, syncDeviceLibrary } from './device';
import { autoCheckForUpdates } from './updateUI';
import { focusView, initTv } from './tv';
import { $, $$, escapeHtml, guessMime, isAudioFile, isTextEntry, isWindowsDesktop, pickFiles, platform } from './util';
import { renderHistory } from '../views/history';
import { renderLibrary, generateThumb } from '../views/library';
import { renderTvHome } from '../views/tvHome';
import { renderDesktopHome } from '../views/desktopHome';
import { renderAbout, renderShortcuts } from '../views/misc';
import { renderSettings } from '../views/settings';
import { openUrlModal, renderStreams } from '../views/streams';

const VIEWS: { id: ViewId; icon: string; group: string; mobile?: boolean; desktopOnly?: boolean }[] = [
  { id: 'home', icon: 'home', group: 'play', desktopOnly: true },
  { id: 'player', icon: 'play', group: 'play', mobile: true },
  { id: 'library', icon: 'film', group: 'play', mobile: true },
  { id: 'streams', icon: 'broadcast', group: 'play', mobile: true },
  { id: 'history', icon: 'history', group: 'you', mobile: true },
  { id: 'settings', icon: 'gear', group: 'app', mobile: true },
  { id: 'shortcuts', icon: 'keyboard', group: 'app' },
  { id: 'about', icon: 'info', group: 'app' },
];

let activeView: ViewId = platform.tv ? 'home' : 'player';
let player: ReturnType<typeof mountPlayer>;
const session = new Map<string, { url: string; name: string; size: number }>();
let shellReady = false;
const pendingWindowsOpenPaths: string[][] = [];

/* ------------------------------------------------------------------ */

function navMarkup(primaryOnly = false): string {
  const groups: { key: string; label: string }[] = [
    { key: 'play', label: t('nav.group.play') },
    { key: 'you', label: t('nav.group.you') },
    { key: 'app', label: t('nav.group.app') },
  ];
  return groups
    .map(
      (g) => `
          <div class="nav-title">${escapeHtml(g.label)}</div>
          ${VIEWS.filter(
            (v) => v.group === g.key && (!primaryOnly || v.mobile) && (!v.desktopOnly || isWindowsDesktop),
          )
            .map(
              (v) => `<button class="nav-item" data-view="${v.id}">
                <span class="nav-ico">${icon(v.icon)}</span>
                <span class="nav-label">${escapeHtml(t('nav.' + v.id))}</span>
                <span class="count" data-count="${v.id}" hidden></span>
                <span class="nav-spark" aria-hidden="true"></span>
              </button>`,
            )
            .join('')}`,
    )
    .join('');
}

function brandMarkup(fold: boolean): string {
  return `
      <div class="brand">
        <span class="brand-mark"><img class="brand-logo" src="/icons/rozh-logo.png" alt="" /></span>
        <div class="brand-text">
          <div class="brand-name">ROZH</div>
          <div class="brand-sub">PLAYER</div>
        </div>
        ${
          fold
            ? `<button class="iconbtn sidebar-fold" data-act="fold" data-tip="${t('nav.collapse')}" aria-label="${t(
                'nav.collapse',
              )}">${icon('chevron-left')}</button>`
            : ''
        }
      </div>`;
}

function viewsMarkup(): string {
  return `
      <main class="views">
        <section class="view" data-view="home"></section>
        <section class="view" data-view="player"><div class="player-host" style="height:100%"></div></section>
        <section class="view" data-view="library"></section>
        <section class="view" data-view="streams"></section>
        <section class="view" data-view="history"></section>
        <section class="view" data-view="settings"></section>
        <section class="view" data-view="shortcuts"></section>
        <section class="view" data-view="about"></section>
      </main>`;
}

const ambientMarkup = (): string => `
    <div class="bg-aura" aria-hidden="true"></div>
    <div class="embers" aria-hidden="true">${Array.from({ length: 14 }, () => '<i></i>').join('')}</div>`;

/** Dedicated, focus-first living-room navigation. */
function tvNavMarkup(): string {
  const items: { id: ViewId; icon: string; label: string }[] = [
    { id: 'home', icon: 'home', label: t('nav.home') },
    { id: 'player', icon: 'play', label: t('nav.player') },
    { id: 'library', icon: 'film', label: t('nav.library') },
    { id: 'streams', icon: 'radio', label: t('nav.streams') },
    { id: 'history', icon: 'history', label: t('nav.history') },
    { id: 'settings', icon: 'gear', label: t('nav.settings') },
  ];
  return items
    .map(
      (item) => `<button class="nav-item tv-nav-item" data-view="${item.id}" aria-label="${escapeHtml(item.label)}">
        <span class="nav-ico">${icon(item.icon)}</span><span class="nav-label">${escapeHtml(item.label)}</span>
        <span class="count" data-count="${item.id}" hidden></span>
      </button>`,
    )
    .join('');
}

/**
 * An Android TV app should feel native to a couch and a directional remote:
 * fixed destination rail, focused hero, horizontal media shelves and no
 * desktop-like row of web tabs.
 */
function tvTemplate(): string {
  return `
  <div class="shell shell-tv tv-shell" data-tv-shell="true">
    ${ambientMarkup()}
    <header class="tv-rail" aria-label="ROZH Player">
      <div class="tv-brand">${brandMarkup(false)}</div>
      <nav class="tv-nav" aria-label="${escapeHtml(t('nav.home'))}">${tvNavMarkup()}</nav>
      <div class="tv-header-actions">
        ${isAndroidDevice() ? `<button class="tv-toolbar-btn" data-act="tv-scan" aria-label="${escapeHtml(t('tv.scan'))}">${icon('rotate')}<b data-tv-scan-label>${escapeHtml(t('tv.scan'))}</b></button>
        <button class="tv-toolbar-btn" data-act="tv-folder" aria-label="${escapeHtml(t('tv.folder'))}">${icon('folder')}<b>${escapeHtml(t('tv.folder'))}</b></button>` : ''}
        <button class="tv-toolbar-btn" data-act="url" aria-label="${escapeHtml(t('player.openUrl'))}">${icon('link')}<b>${escapeHtml(t('player.openUrl'))}</b></button>
        <button class="tv-toolbar-btn tv-toolbar-primary" data-act="open" aria-label="${escapeHtml(t('player.openFile'))}">${icon('folder-open')}<b>${escapeHtml(t('player.openFile'))}</b></button>
      </div>
    </header>
    <div class="main tv-main">${viewsMarkup()}</div>
  </div>
  <div class="toasts" role="status" aria-live="polite" hidden></div>`;
}

function shellTemplate(): string {
  if (document.documentElement.dataset.tv === 'true') return tvTemplate();

  return `
  <div class="shell ${isWindowsDesktop ? 'windows-shell' : ''}" data-sidebar="${
    platform.mobile || window.innerWidth <= 900 ? 'closed' : store.settings.sidebar
  }">
    ${ambientMarkup()}

    <div class="scrim" hidden></div>

    <aside class="sidebar" aria-label="ROZH Player">
      ${brandMarkup(true)}

      <nav class="nav">${navMarkup()}</nav>

      <div class="sidebar-foot">
        ${isWindowsDesktop ? '' : `<button class="btn btn-primary open-btn" data-act="open">${icon('folder-open')}<span>${t(
          'nav.openFile',
        )}</span></button>`}
        <div class="side-card">
          <span class="foot-text"><span class="dot"></span>${platform.tauri ? platform.os : 'web'}</span>
          <span class="badge mono">v${__APP_VERSION__}</span>
        </div>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <button class="iconbtn mobile-menu" data-act="menu" aria-label="${t('nav.menu')}">${icon('list')}</button>
        <div class="crumb">
          <h1 data-crumb>${t('view.player')}</h1>
          <div class="crumb-sub" data-crumb-sub>${t('view.player.sub')}</div>
        </div>
        <div class="topbar-tools">
          <button class="iconbtn" data-act="url" data-tip="${t('player.openUrl')}" aria-label="${t(
            'player.openUrl',
          )}">${icon('link')}</button>
          <button class="btn btn-primary btn-sm topbar-open" data-act="open">${icon('folder-open')}<span>${t(
            'player.openFile',
          )}</span></button>
          <span class="tb-divider" aria-hidden="true"></span>
          <button class="iconbtn" data-act="settings" data-tip="${t('nav.settings')}" aria-label="${t(
            'nav.settings',
          )}">${icon('gear')}</button>
        </div>
      </header>

      ${viewsMarkup()}
    </div>

    <nav class="tabbar" aria-label="Primary">
      ${VIEWS.filter((v) => v.mobile)
        .map(
          (v) => `<button class="tab-item" data-view="${v.id}">${icon(v.icon)}<span>${escapeHtml(
            t('nav.' + v.id),
          )}</span></button>`,
        )
        .join('')}
    </nav>
  </div>
  <div class="toasts" role="status" aria-live="polite" hidden></div>`;
}

function makeContext(): AppContext {
  return {
    player,
    navigate,
    refreshNav,
    openLocalFiles,
    playMedia,
    addFilesToLibrary,
    playPlayable,
    session,
  };
}

function viewMeta(id: ViewId): { title: string; sub: string } {
  return { title: t('view.' + id), sub: t('view.' + id + '.sub') };
}

function renderActiveView(): void {
  const host = $(`.view[data-view="${activeView}"]`);
  if (!host) return;
  const ctx = makeContext();
  switch (activeView) {
    case 'home':
      if (platform.tv) renderTvHome(host, ctx);
      else renderDesktopHome(host, ctx);
      break;
    case 'library':
      renderLibrary(host, ctx);
      break;
    case 'streams':
      renderStreams(host, ctx);
      break;
    case 'history':
      renderHistory(host, ctx);
      break;
    case 'settings':
      renderSettings(host, ctx);
      break;
    case 'shortcuts':
      renderShortcuts(host, ctx);
      break;
    case 'about':
      renderAbout(host, ctx);
      break;
    default:
      break;
  }
}

export function navigate(view: ViewId): void {
  activeView = view;
  document.body.dataset.view = view;
  try {
    if (location.hash.slice(1) !== view) history.replaceState(null, '', `#${view}`);
  } catch {
    /* some embedded webviews (about:blank, custom protocols) refuse this */
  }

  $$('.view').forEach((v) => v.classList.toggle('is-active', (v as HTMLElement).dataset.view === view));
  $$('.nav-item, .tab-item').forEach((b) =>
    b.classList.toggle('is-active', (b as HTMLElement).dataset.view === view),
  );
  const meta = viewMeta(view);
  const crumb = $('[data-crumb]');
  const sub = $('[data-crumb-sub]');
  if (crumb) crumb.textContent = meta.title;
  if (sub) sub.textContent = meta.sub;

  const shell = $('.shell');
  if (shell?.classList.contains('tv-shell')) shell.dataset.tvView = view;
  if (shell && window.innerWidth <= 900) shell.setAttribute('data-sidebar', 'closed');
  $('.scrim')?.setAttribute('hidden', '');
  focusView(view);

  renderActiveView();
  if (view === 'player') player.showUi();
}

export function refreshNav(): void {
  const counts: Record<string, number> = {
    library: store.library().length,
    history: store.recent().length,
    streams: 0,
  };
  $$('[data-count]').forEach((el) => {
    const id = (el as HTMLElement).dataset.count!;
    const c = counts[id] ?? 0;
    el.textContent = String(c);
    ;(el as HTMLElement).hidden = c === 0;
  });
}

/* ------------------------------------------------------------------ */
/* media plumbing                                                      */
/* ------------------------------------------------------------------ */

function toPlayable(item: MediaItem): Playable | null {
  const live = session.get(item.id);
  const url = live?.url ?? item.url;
  if (!url) return null;
  return {
    key: `${item.name}::${item.size}`,
    name: item.name,
    title: item.title,
    url,
    isStream: item.source === 'url',
    kind: item.kind,
    size: item.size,
    mediaId: item.id,
    thumb: item.thumb,
  };
}

async function playMedia(item: MediaItem): Promise<void> {
  const playable = toPlayable(item);
  if (playable) {
    navigate('player');
    player.setQueue([playable], 0);
    await player.load(playable);
    store.updateMedia(item.id, { playedAt: Date.now(), plays: (item.plays ?? 0) + 1 });
    return;
  }
  // A local file from a previous session: ask for it again, then match by name.
  toast(`${t('player.openFile')} · ${escapeHtml(item.title)}`, 'info', 2600);
  const files = await pickFiles();
  const match =
    files.find((f) => f.name === item.name && f.size === item.size) ??
    files.find((f) => f.name === item.name) ??
    files[0];
  if (!match) return;
  const url = URL.createObjectURL(match);
  session.set(item.id, { url, name: match.name, size: match.size });
  const refreshed = toPlayable(item);
  if (!refreshed) return;
  navigate('player');
  player.setQueue([refreshed], 0);
  await player.load(refreshed);
  if (!item.thumb) {
    const thumb = await generateThumb(match);
    if (thumb) store.updateMedia(item.id, { thumb });
  }
}

async function playPlayable(item: Playable): Promise<void> {
  navigate('player');
  player.setQueue([item], 0);
  await player.load(item);
}

/**
 * Register files in the library immediately (metadata + session URL), then fill
 * in poster frames in the background so the UI never waits on a decoder.
 */
function ingestFiles(files: File[], opts: { autoplay?: boolean } = {}): Playable[] {
  const media = files.filter((f) => !/\.(srt|vtt|ass|ssa)$/i.test(f.name));
  const playables: Playable[] = [];

  for (const file of media) {
    const existing = store.media.find((m) => m.name === file.name && m.size === file.size);
    const item = store.addMedia({
      name: file.name,
      title: file.name.replace(/\.[^.]+$/, ''),
      kind: isAudioFile(file.name) ? 'audio' : 'video',
      source: 'local',
      size: file.size,
      ext: (file.name.split('.').pop() ?? '').toLowerCase(),
      thumb: existing?.thumb,
      inLibrary: true,
    });
    if (!session.has(item.id)) {
      session.set(item.id, { url: urlForFile(file), name: file.name, size: file.size });
    }
    const playable = toPlayable(item);
    if (playable) playables.push({ ...playable, file });

    const nativePath = (file as { __path?: string }).__path;
    if (nativePath) {
      void probeFile(nativePath).then((probe) => {
        if (!probe) return;
        if (probe.duration > 0) store.updateMedia(item.id, { duration: probe.duration });
        if (activeView === 'library' || activeView === 'history' || activeView === 'home') renderActiveView();
      });
    }

    if (!item.thumb) {
      void generateThumb(file).then((thumb) => {
        if (!thumb) return;
        store.updateMedia(item.id, { thumb });
        if (activeView === 'library' || activeView === 'history' || activeView === 'home') renderActiveView();
      });
    }
  }

  refreshNav();
  if (media.length) toast(t('library.added', { n: n(media.length) }), 'ok', 2000);
  if (activeView === 'library' || activeView === 'history' || activeView === 'home') renderActiveView();

  if (opts.autoplay !== false && playables.length && !player.current) {
    navigate('player');
    void player.load(playables[0]);
  }
  return playables;
}

async function addFilesToLibrary(files: File[]): Promise<void> {
  ingestFiles(files);
}

async function registerOpenedFiles(files: File[]): Promise<void> {
  const playables = ingestFiles(files, { autoplay: false });
  // adopt the player's live object URL for whatever is currently playing
  const current = player.current;
  if (current) {
    const match = playables.find((p) => p.name === current.name);
    if (match?.mediaId) {
      session.set(match.mediaId, { url: current.url, name: current.name, size: current.size });
      current.mediaId = match.mediaId;
      store.updateMedia(match.mediaId, { playedAt: Date.now(), plays: 1 });
    }
  }
}

const WINDOWS_MEDIA_EXTENSIONS = new Set([
  'mp4', 'm4v', 'mov', 'mkv', 'avi', 'webm', 'wmv', 'flv', 'ts', 'm2ts', 'mpg', 'mpeg', '3gp', 'ogv',
  'mp3', 'm4a', 'm4b', 'aac', 'flac', 'wav', 'ogg', 'oga', 'opus', 'wma', 'aif', 'aiff', 'ape', 'alac', 'm3u8',
]);

function receiveWindowsOpenPaths(paths: string[]): void {
  const accepted = [...new Set(paths.filter((path) => typeof path === 'string' && path.trim()))];
  if (!accepted.length) return;
  if (!shellReady) pendingWindowsOpenPaths.push(accepted);
  else void openWindowsPaths(accepted);
}

async function initializeWindowsOpenBridge(): Promise<void> {
  if (!isWindowsDesktop || !platform.tauri) return;
  try {
    const [{ listen }, { invoke }] = await Promise.all([
      import('@tauri-apps/api/event'),
      import('@tauri-apps/api/core'),
    ]);
    // Subscribe before reading startup argv so Explorer launches during webview
    // startup cannot lose a second-open request.
    await listen<string[]>('rozh:open-files', (event) => receiveWindowsOpenPaths(event.payload));
    const initial = await invoke<string[]>('take_initial_open_files');
    if (initial?.length) pendingWindowsOpenPaths.push(initial);
  } catch (error) {
    console.warn('[rozh] Windows Explorer open integration unavailable', error);
  }
}

async function openWindowsPaths(paths: string[]): Promise<void> {
  try {
    const files: NativeFile[] = [];
    for (const raw of paths) {
      const path = raw.replace(/^\"|\"$/g, '');
      const name = path.split(/[\\/]/).filter(Boolean).pop() ?? '';
      const extension = name.split('.').pop()?.toLowerCase() ?? '';
      if (!name || !WINDOWS_MEDIA_EXTENSIONS.has(extension)) continue;
      const file = new File([], name, { type: guessMime(name) }) as NativeFile;
      file.__path = path;
      file.__url = await convertNativePath(path);
      files.push(file);
    }
    if (!files.length) return;
    navigate('player');
    await player.loadFiles(files);
  } catch (error) {
    console.error('[rozh] opening media from Explorer failed', error);
    toast(t('player.openFailed'), 'bad', 3200);
  }
}

async function openLocalFiles(): Promise<void> {
  try {
    const files = await pickFiles();
    if (!files.length) return;
    // The global toolbar stays available from every destination. After a
    // selection, make the player visible before loading so the action never
    // appears to do nothing while the library or settings page stays on top.
    navigate('player');
    await player.loadFiles(files);
  } catch (error) {
    console.error('[rozh] opening media failed', error);
    toast(t('player.openFailed'), 'bad', 3200);
  }
}

/* ------------------------------------------------------------------ */
/* chrome behaviour                                                    */
/* ------------------------------------------------------------------ */

function bindSmartTooltips(): void {
  const tooltip = document.createElement('div');
  tooltip.className = 'smart-tooltip';
  tooltip.id = 'rozh-smart-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.append(tooltip);

  let hovered: HTMLElement | null = null;
  let focused: HTMLElement | null = null;
  let active: HTMLElement | null = null;
  let timer = 0;
  const resolve = (target: EventTarget | null): HTMLElement | null =>
    target instanceof Element ? target.closest<HTMLElement>('[data-tip]') : null;

  const position = (): void => {
    if (!active || tooltip.hidden || !active.isConnected) return;
    const fullscreenRoot = document.fullscreenElement;
    if (fullscreenRoot && tooltip.parentElement !== fullscreenRoot) fullscreenRoot.append(tooltip);
    else if (!fullscreenRoot && tooltip.parentElement !== document.body) document.body.append(tooltip);

    const anchor = active.getBoundingClientRect();
    const box = tooltip.getBoundingClientRect();
    const gap = 10;
    const edge = 12;
    const spaces = {
      top: anchor.top,
      bottom: window.innerHeight - anchor.bottom,
      right: window.innerWidth - anchor.right,
      left: anchor.left,
    };
    const order: Array<keyof typeof spaces> = ['top', 'bottom', 'right', 'left'];
    const side = order.find((candidate) => spaces[candidate] >= (candidate === 'top' || candidate === 'bottom' ? box.height : box.width) + gap)
      ?? order.reduce((best, candidate) => spaces[candidate] > spaces[best] ? candidate : best, order[0]);

    let left = anchor.left + (anchor.width - box.width) / 2;
    let top = anchor.top - box.height - gap;
    if (side === 'bottom') top = anchor.bottom + gap;
    if (side === 'right') {
      left = anchor.right + gap;
      top = anchor.top + (anchor.height - box.height) / 2;
    }
    if (side === 'left') {
      left = anchor.left - box.width - gap;
      top = anchor.top + (anchor.height - box.height) / 2;
    }
    left = Math.max(edge, Math.min(left, window.innerWidth - box.width - edge));
    top = Math.max(edge, Math.min(top, window.innerHeight - box.height - edge));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };

  const hide = (): void => {
    window.clearTimeout(timer);
    active = null;
    tooltip.classList.remove('is-visible');
    tooltip.hidden = true;
  };

  const update = (): void => {
    const next = focused ?? hovered;
    if (!next || !next.dataset.tip?.trim()) {
      hide();
      return;
    }
    if (active === next && !tooltip.hidden) {
      position();
      return;
    }
    hide();
    active = next;
    timer = window.setTimeout(() => {
      if (!active || !active.isConnected) {
        hide();
        return;
      }
      tooltip.textContent = active.dataset.tip ?? '';
      tooltip.hidden = false;
      tooltip.style.visibility = 'hidden';
      position();
      tooltip.style.visibility = '';
      requestAnimationFrame(() => tooltip.classList.add('is-visible'));
    }, 260);
  };

  document.addEventListener('pointerover', (event) => {
    if (event.pointerType === 'touch') return;
    hovered = resolve(event.target);
    update();
  });
  document.addEventListener('pointerout', (event) => {
    const leaving = resolve(event.target);
    if (leaving && leaving === hovered && !(event.relatedTarget instanceof Node && leaving.contains(event.relatedTarget))) {
      hovered = null;
      update();
    }
  });
  document.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    hovered = resolve(event.target);
    update();
  }, { passive: true });
  window.addEventListener('rozh:controls-hidden', () => {
    hovered = null;
    focused = null;
    hide();
  });
  window.addEventListener('rozh:controls-shown', () => {
    focused = resolve(document.activeElement);
    update();
  });
  document.addEventListener('focusin', (event) => {
    focused = resolve(event.target);
    update();
  });
  document.addEventListener('focusout', (event) => {
    const leaving = resolve(event.target);
    if (leaving && leaving === focused && !(event.relatedTarget instanceof Node && leaving.contains(event.relatedTarget))) {
      focused = null;
      update();
    }
  });
  window.addEventListener('resize', position, { passive: true });
  window.addEventListener('scroll', position, { capture: true, passive: true });
  document.addEventListener('fullscreenchange', position);
}

function bindChrome(): void {
  bindSmartTooltips();
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    // Route markers also live on the containing <section class="view">. Only
    // actual navigation controls should switch views; otherwise every click
    // inside a view bubbles up and gets routed back to its parent (breaking
    // playback cards, settings links, and TV shelf actions).
    const viewBtn = target.closest<HTMLElement>('button[data-view], a[data-view], [role="tab"][data-view]');
    if (viewBtn?.dataset.view) {
      navigate(viewBtn.dataset.view as ViewId);
      return;
    }
    // Player owns controls rendered inside its own surface. Letting both its
    // handler and the shell handle Open/URL clicks launches two native dialogs.
    if (target.closest('.player-view [data-act]')) return;
    const act = target.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (!act) return;
    switch (act) {
      case 'open':
        void openLocalFiles();
        break;
      case 'url':
        openUrlModal((url, title) => void playPlayable({
          key: `url::${url}`,
          name: title || url,
          title: title || url,
          url,
          isStream: true,
          kind: /\.(m3u8|mpd)$/i.test(url) ? 'stream' : isAudioFile(url.split('?')[0]) ? 'audio' : 'video',
          size: 0,
        }));
        break;
      case 'settings':
        navigate('settings');
        break;
      case 'tv-scan':
        void syncDeviceLibrary({ reason: 'manual' }).then((result) => {
          if (result.status?.state === 'error') toast(t('device.error'), 'bad', 2400);
          if (activeView === 'home' || activeView === 'library') renderActiveView();
          refreshNav();
        });
        break;
      case 'tv-folder':
        void pickDeviceFolder().then((status) => {
          applyDeviceStatus(status);
          if (activeView === 'home' || activeView === 'library') renderActiveView();
          refreshNav();
        });
        break;
      case 'menu':
        toggleSidebar(true);
        break;
      case 'fold':
        toggleSidebar();
        break;
      default:
        break;
    }
  });

  $('.scrim')?.addEventListener('click', () => toggleSidebar(false));

  const topbar = $('.topbar');
  document.addEventListener(
    'scroll',
    (e) => {
      const el = e.target as HTMLElement;
      if (!el.classList?.contains('view')) return;
      topbar?.classList.toggle('scrolled', el.scrollTop > 4);
    },
    { capture: true, passive: true },
  );

  // global shortcuts that are app-level
  window.addEventListener('keydown', (e) => {
    if (isTextEntry(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === ',') {
      e.preventDefault();
      navigate('settings');
    }
    if (mod && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      void openLocalFiles();
    }
    if (mod && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      openUrlModal((url, title) => void playPlayable({
        key: `url::${url}`,
        name: title || url,
        title: title || url,
        url,
        isStream: true,
        kind: 'stream',
        size: 0,
      }));
    }
  });

  window.addEventListener('rozh:shortcuts', () => navigate('shortcuts'));
  window.addEventListener('rozh:relang', () => void rebuild());
  window.addEventListener('rozh:files-opened', (e) => {
    const detail = (e as CustomEvent<{ files: File[] }>).detail;
    if (detail?.files?.length) void registerOpenedFiles(detail.files);
  });

  attachPlayerEvents();
}

/** Wire the (possibly rebuilt) player into the shell. */
function attachPlayerEvents(): void {
  player.events.onLoaded = (item) => {
    document.title = item ? `${item.title} · ROZH Player` : 'ROZH Player';
    if (item?.mediaId) store.updateMedia(item.mediaId, { playedAt: Date.now() });
    refreshNav();
  };
  player.events.onStateChange = () => refreshNav();
}

function toggleSidebar(force?: boolean): void {
  const shell = $('.shell');
  if (!shell) return;
  const isMobile = window.innerWidth <= 900;
  const open = shell.getAttribute('data-sidebar') !== 'closed';
  if (isMobile) {
    const next = force ?? !open;
    shell.setAttribute('data-sidebar', next ? 'open' : 'closed');
    const scrim = $('.scrim');
    if (scrim) scrim.toggleAttribute('hidden', !next);
    return;
  }
  const collapsed = shell.getAttribute('data-sidebar') === 'collapsed';
  const next = force ?? !collapsed;
  shell.setAttribute('data-sidebar', next ? 'collapsed' : 'open');
  store.patch({ sidebar: next ? 'collapsed' : 'open' });
  const fold = $('.sidebar-fold');
  if (fold) fold.innerHTML = icon(next ? 'chevron-right' : 'chevron-left');
  if (!next && isMobile) shell.setAttribute('data-sidebar', 'closed');
}

function seedEmbers(): void {
  $$('.embers i').forEach((el, i) => {
    const left = Math.random() * 100;
    const dur = 9 + Math.random() * 10;
    const delay = Math.random() * 12;
    const size = 1.5 + Math.random() * 2.5;
    const dx = (Math.random() - 0.5) * 160;
    el.style.left = `${left}%`;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.animationDuration = `${dur}s`;
    el.style.animationDelay = `${delay}s`;
    el.style.setProperty('--dx', `${dx}px`);
    el.style.opacity = String(0.3 + Math.random() * 0.5);
    void i;
  });
  const wrap = $('.embers') as HTMLElement | null;
  if (wrap) wrap.style.display = store.settings.showEmbers ? '' : 'none';
}

/* ------------------------------------------------------------------ */
/* boot / rebuild                                                      */
/* ------------------------------------------------------------------ */

function paint(): void {
  const app = document.getElementById('app')!;
  // snapshot playback so a rebuild (e.g. language switch) is seamless
  const prev = player?.current ?? null;
  const prevPos = player?.video.currentTime ?? 0;
  const wasPlaying = player?.playing ?? false;
  const prevQueue = player ? [...player.queue] : [];
  const prevIndex = player?.index ?? 0;

  player?.destroy();
  app.innerHTML = shellTemplate();
  const host = $('.player-host', app) as HTMLElement;
  player = mountPlayer(host);
  hydrateIcons(app);
  seedEmbers();
  attachPlayerEvents();

  applySettings(store.settings);
  refreshNav();
  navigate(activeView);

  if (prev && prevQueue.length) {
    player.setQueue(prevQueue, prevIndex);
    void player.load({ ...prev }, { autoplay: wasPlaying, startAt: prevPos });
  }
  document.body.dataset.view = activeView;
}

export async function rebuild(): Promise<void> {
  paint();
}

export async function bootApp(): Promise<void> {
  await initializeWindowsOpenBridge();
  await store.init();
  applySettings(store.settings);

  const hash = location.hash.replace('#', '') as ViewId;
  if (platform.tv || isWindowsDesktop) activeView = 'home';
  else if (VIEWS.some((v) => v.id === hash)) activeView = hash;

  paint();
  bindChrome();
  shellReady = true;
  for (const paths of pendingWindowsOpenPaths.splice(0)) await openWindowsPaths(paths);

  // tray / menu-bar transport (desktop only; the promise resolves to a no-op on web)
  void onNativeCommand((cmd) => {
    if (cmd === 'toggle') player.toggle();
    else if (cmd === 'open') void openLocalFiles();
    else if (cmd === 'queue') player.showUi();
  });

  // Android phone + Android TV: index everything on the device at every launch.
  // This is what makes the library useful on a phone without any file picking.
  if (isAndroidDevice()) {
    void syncDeviceLibrary({ reason: 'launch' }).then((res) => {
      if (!res.added && !res.removed) return;
      refreshNav();
      if (activeView === 'library' || activeView === 'history' || activeView === 'home') renderActiveView();
    });
  }

  // Ask the release channel once per launch, without getting in the way.
  autoCheckForUpdates();

  // TV mode: spatial navigation, back-button handling and a sane first focus
  initTv();
  if (document.documentElement.dataset.tv === 'true') focusView(activeView);

  // First-run niceties. Not on Android (the device scan is the onboarding and
  // the permission dialog owns the first frame) and not on TV (a modal before
  // the remote has been explained is a trap).
  if (
    !store.settings.seenWelcome &&
    store.media.length === 0 &&
    !platform.tv &&
    !isAndroidDevice() &&
    !isWindowsDesktop
  ) {
    setTimeout(() => {
      openDrawer({
        title: 'ROZH Player',
        icon: 'sparkles',
        body: `
          <div style="text-align:center;padding:6px 4px 2px">
            <img src="/icons/rozh-logo.png" alt="" style="width:96px;height:96px;border-radius:50%;margin:0 auto 14px;filter:drop-shadow(0 16px 40px rgba(240,150,60,.45))" />
            <h3 style="font-size:1.05rem;color:var(--text-0);font-weight:800">${t('player.empty.title')}</h3>
            <p style="color:var(--text-3);font-size:.86rem;line-height:1.9;margin-top:8px">${t('player.empty.sub')}</p>
          </div>
          <div class="opt-list" style="margin-top:14px">
            <button class="opt-row" data-go="open">${icon('folder-open')}<span class="op-label">${t(
              'player.openFile',
            )}</span>${icon('chevron-left', 'check')}</button>
            <button class="opt-row" data-go="demo">${icon('sparkles')}<span class="op-label">${t(
              'player.sample',
            )}</span>${icon('chevron-left', 'check')}</button>
            <button class="opt-row" data-go="streams">${icon('broadcast')}<span class="op-label">${t(
              'nav.streams',
            )}</span>${icon('chevron-left', 'check')}</button>
          </div>`,
        onMount: (body, close) => {
          $$('[data-go]', body).forEach((btn) =>
            btn.addEventListener('click', () => {
              const go = (btn as HTMLElement).dataset.go;
              close();
              if (go === 'open') void openLocalFiles();
              else if (go === 'demo') {
                navigate('player');
                player.playDemo();
              } else navigate('streams');
            }),
          );
        },
      });
      store.patch({ seenWelcome: true });
    }, 900);
  }

  document.body.classList.add('rozh-ready');
  document.getElementById('boot')?.setAttribute('data-gone', 'true');
  setTimeout(() => document.getElementById('boot')?.remove(), 700);
}
