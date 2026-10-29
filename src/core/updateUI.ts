/**
 * ROZH Player — the update card (Settings → Updates).
 *
 * One card, four channels of behaviour:
 *
 *   idle → checking → up-to-date | available → downloading → installing → done
 *
 * Desktop installs through Tauri's signed updater and restarts itself; Android
 * downloads the APK with the system download manager and lets the package
 * installer take over — which is an in-place upgrade, because every release is
 * signed with the same key. The card owns its own DOM so a progress tick does
 * not redraw the rest of the settings page.
 */

import { icon } from './icons';
import { n, t } from './i18n';
import { store } from './store';
import { toast } from './ui';
import { escapeHtml, fmtBytes } from './util';
import {
  androidUpdateStatus,
  checkForUpdate,
  currentVersion,
  installAndroidUpdate,
  installDesktopUpdate,
  isNewer,
  updateChannel,
  type UpdateInfo,
} from './updater';

type Phase = 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'installing' | 'ready' | 'error';

interface CardState {
  phase: Phase;
  info: UpdateInfo | null;
  progress: number;
  message: string;
  checkedAt: number;
  /** Android asked for "install unknown apps" permission. */
  permission: boolean;
}

const state: CardState = {
  phase: 'idle',
  info: null,
  progress: -1,
  message: '',
  checkedAt: 0,
  permission: false,
};

let poll: number | 0 = 0;
let lastAutoCheck = 0;

export function updatePhase(): Phase {
  return state.phase;
}

/* ------------------------------------------------------------------ */
/* markup                                                              */
/* ------------------------------------------------------------------ */

function statusLine(): string {
  const channel = updateChannel();
  const v = currentVersion();
  switch (state.phase) {
    case 'checking':
      return t('update.checking');
    case 'none':
      return t('update.upToDate', { v });
    case 'available':
      return state.info ? t('update.available', { v: state.info.version }) : '';
    case 'downloading':
      return state.progress >= 0
        ? t('update.downloading', { p: n(state.progress) })
        : t('update.downloadingUnknown');
    case 'installing':
      return state.permission ? t('update.permission') : t('update.installing');
    case 'ready':
      return t('update.ready');
    case 'error':
      return state.message || t('update.error');
    default:
      return channel === 'none' ? t('update.webOnly') : t('update.idle', { v });
  }
}

function ctaLabel(): string {
  switch (state.phase) {
    case 'checking':
      return t('update.checkingShort');
    case 'available':
      return updateChannel() === 'desktop' ? t('update.installNow') : t('update.downloadNow');
    case 'downloading':
      return t('update.downloadingShort');
    case 'installing':
      return state.permission ? t('update.settings') : t('update.installingShort');
    case 'ready':
      return t('update.restart');
    case 'error':
      return t('update.retry');
    case 'none':
      return t('update.checkAgain');
    default:
      return t('update.check');
  }
}

function ctaDisabled(): boolean {
  return state.phase === 'checking' || state.phase === 'downloading' || (state.phase === 'installing' && !state.permission);
}

function cardMarkup(): string {
  const busy = state.phase === 'checking' || state.phase === 'downloading';
  const showBar = state.phase === 'downloading' || (state.phase === 'installing' && !state.permission);
  const pct = state.progress >= 0 ? Math.max(2, Math.min(100, state.progress)) : 12;
  const version = state.info?.version ?? currentVersion();
  return `
    <div class="uc-head">
      <div class="uc-mark ${state.phase === 'available' || state.phase === 'ready' ? 'is-new' : ''} ${
        busy ? 'is-busy' : ''
      }">${icon(state.phase === 'available' || state.phase === 'ready' ? 'download' : 'rotateccw')}</div>
      <div class="uc-body">
        <b>${escapeHtml(t('update.appName'))} <span class="mono uc-ver">v${escapeHtml(version)}</span></b>
        <small class="uc-note">${escapeHtml(statusLine())}</small>
        ${
          state.phase === 'available' && state.info
            ? `<small class="uc-meta">${
                state.info.size ? `${escapeHtml(fmtBytes(state.info.size))} · ` : ''
              }${escapeHtml(t('update.currentIs', { v: state.info.current }))}</small>`
            : ''
        }
      </div>
      <button class="btn btn-sm ${state.phase === 'available' || state.phase === 'ready' ? 'btn-primary' : ''}" data-uc="go" ${
        ctaDisabled() ? 'disabled' : ''
      }>${escapeHtml(ctaLabel())}</button>
    </div>
    <div class="uc-progress" ${showBar ? '' : 'hidden'}>
      <div class="uc-track"><i style="width:${pct}%"></i></div>
      <span class="uc-pct mono">${state.progress >= 0 ? `${n(Math.round(state.progress))}%` : ''}</span>
    </div>`;
}

/** The whole section, ready to drop into the settings markup. */
export function updateSection(): string {
  return `<section class="setting-group" id="sec-update">
    <header>${icon('download')}<h3>${t('update.title')}</h3></header>
    <div class="update-card" data-uc-card data-phase="${state.phase}">${cardMarkup()}</div>
    <div class="setting-row">
      <div class="sr-label"><b>${t('update.auto')}</b><small>${t('update.autoSub')}</small></div>
      <div class="sr-ctrl">
        <button class="switch" role="switch" aria-checked="${store.settings.autoUpdate}" data-uc-auto></button>
      </div>
    </div>
  </section>`;
}

/* ------------------------------------------------------------------ */
/* behaviour                                                           */
/* ------------------------------------------------------------------ */

function paint(): void {
  const card = document.querySelector<HTMLElement>('[data-uc-card]');
  if (!card) return;
  card.dataset.phase = state.phase;
  card.innerHTML = cardMarkup();
}

function stopPolling(): void {
  if (poll) {
    clearInterval(poll);
    poll = 0;
  }
}

async function runCheck(quiet = false): Promise<void> {
  if (state.phase === 'checking' || state.phase === 'downloading') return;
  if (updateChannel() === 'none') {
    state.phase = 'idle';
    paint();
    return;
  }
  state.phase = 'checking';
  if (!quiet) paint();
  try {
    const info = await checkForUpdate();
    state.checkedAt = Date.now();
    if (info && isNewer(info.version, info.current)) {
      state.info = info;
      state.phase = 'available';
    } else {
      state.info = info;
      state.phase = 'none';
    }
  } catch (err) {
    state.phase = 'error';
    state.message = String((err as Error)?.message ?? err);
  }
  paint();
  if (state.phase === 'available' && quiet) {
    toast(t('update.toast', { v: state.info?.version ?? '' }), 'info', 5200);
  }
}

async function runInstall(): Promise<void> {
  const info = state.info;
  if (!info) return;
  state.phase = 'downloading';
  state.progress = 0;
  paint();

  if (info.channel === 'desktop') {
    try {
      await installDesktopUpdate((pct) => {
        state.progress = pct;
        paint();
      });
    } catch (err) {
      state.phase = 'error';
      state.message = String((err as Error)?.message ?? err);
      paint();
    }
    return;
  }

  const first = await installAndroidUpdate(info.url);
  applyAndroid(first);
  stopPolling();
  poll = window.setInterval(async () => {
    const next = await androidUpdateStatus();
    if (!next) return;
    applyAndroid(next);
  }, 900);
}

function applyAndroid(next: { state: string; progress?: number; message?: string }): void {
  const progress = Number(next.progress ?? 0);
  switch (next.state) {
    case 'downloading':
      state.phase = 'downloading';
      state.progress = progress;
      break;
    case 'installing':
      state.phase = 'installing';
      state.permission = false;
      state.progress = 100;
      stopPolling();
      break;
    case 'permission':
      state.phase = 'installing';
      state.permission = true;
      state.message = t('update.permission');
      stopPolling();
      break;
    case 'done':
      state.phase = 'ready';
      state.progress = 100;
      stopPolling();
      break;
    case 'error':
      state.phase = 'error';
      state.message = next.message ?? '';
      stopPolling();
      break;
    default:
      break;
  }
  paint();
}

/** Wire the card up; safe to call on every render. */
export function bindUpdateSection(host: HTMLElement): void {
  const card = host.querySelector<HTMLElement>('[data-uc-card]');
  card?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-uc="go"]');
    if (!btn || btn.hasAttribute('disabled')) return;
    // "Open settings" (install permission) simply retries: Android keeps the
    // grant, so the second attempt goes straight to the download.
    if (state.phase === 'available' || state.permission) void runInstall();
    else if (state.phase === 'ready') {
      if (updateChannel() === 'desktop') void installDesktopUpdate().catch(() => undefined);
      else void runInstall();
    } else void runCheck();
  });

  const toggle = host.querySelector<HTMLElement>('[data-uc-auto]');
  toggle?.addEventListener('click', () => {
    const on = toggle.getAttribute('aria-checked') !== 'true';
    toggle.setAttribute('aria-checked', String(on));
    store.patch({ autoUpdate: on });
  });
}

/** Ask once per launch, silently, a few seconds after the UI is up. */
export function autoCheckForUpdates(): void {
  if (!store.settings.autoUpdate) return;
  if (updateChannel() === 'none') return;
  const now = Date.now();
  // at most once every six hours, even across relaunches
  if (now - lastAutoCheck < 6 * 3600_000) return;
  lastAutoCheck = now;
  const started = Number(sessionStorage.getItem('rozh.update.checked') ?? 0);
  if (now - started < 6 * 3600_000) return;
  sessionStorage.setItem('rozh.update.checked', String(now));
  window.setTimeout(() => {
    void runCheck(true);
  }, 4200);
}
