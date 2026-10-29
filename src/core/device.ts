/**
 * ROZH Player — device media library (Android phone + Android TV).
 *
 * On Android the app must offer everything that is already on the device, on
 * every launch, without the user picking files one at a time. Two native pieces
 * make that possible and both live behind this module:
 *
 *   • a MediaStore scan of every video/audio file, plus any folder the user
 *     picked earlier (persisted SAF grants);
 *   • a folder picker (ACTION_OPEN_DOCUMENT_TREE) for anything the system index
 *     does not know about — SD cards, downloads, USB sticks.
 *
 * The scan runs in the app process; Rust only carries a JSON state file back and
 * forth (see `MediaBridge.java`), so the UI polls a cheap command instead of
 * blocking on a binder call. Everything degrades to a no-op in the browser.
 */

import { convertFileSrc } from '@tauri-apps/api/core';
import { store } from './store';
import { platform } from './util';
import { t, n } from './i18n';

export type DeviceState =
  | 'idle'
  | 'starting'
  | 'scanning'
  | 'ready'
  | 'permission'
  | 'denied'
  | 'picking'
  | 'cancelled'
  | 'error';

export interface DeviceItem {
  name: string;
  title?: string;
  uri: string;
  size?: number;
  kind?: 'video' | 'audio';
  ext?: string;
  /** milliseconds, as MediaStore reports it */
  duration?: number;
  added?: number;
  bucket?: string;
  thumb?: string;
  folder?: boolean;
}

export interface DeviceStatus {
  state: DeviceState;
  count?: number;
  items?: DeviceItem[];
  message?: string;
  ts?: number;
}

export interface SyncResult {
  status: DeviceStatus | null;
  added: number;
  removed: number;
  total: number;
}

/** True only inside the Android shell — the web and desktop builds skip all of it. */
export function isAndroidDevice(): boolean {
  return platform.tauri && platform.os === 'android';
}

let busy = false;
const listeners = new Set<(status: DeviceStatus | null) => void>();

/** Subscribe to scan progress (library view redraws, settings status line). */
export function onDeviceSync(fn: (status: DeviceStatus | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(status: DeviceStatus | null): void {
  listeners.forEach((fn) => {
    try {
      fn(status);
    } catch {
      /* a broken listener must not stop the scan */
    }
  });
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isAndroidDevice()) return null;
  try {
    const api = await import('@tauri-apps/api/core');
    return await api.invoke<T>(cmd, args);
  } catch (err) {
    console.warn('[rozh] android media bridge unavailable', err);
    return null;
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const PENDING: DeviceState[] = ['starting', 'scanning', 'picking', 'idle'];

/**
 * Poll the native state file until the scan settles. `readOnly` polls are free —
 * they never restart a running scan.
 */
async function waitForSettle(state: DeviceStatus | null, timeoutMs: number): Promise<DeviceStatus | null> {
  let current = state;
  const started = Date.now();
  while (current && PENDING.includes(current.state) && Date.now() - started < timeoutMs) {
    await sleep(450);
    current = await invoke<DeviceStatus>('android_media_status');
    emit(current);
  }
  return current;
}

/** Kick a device scan and wait for the result. */
export async function scanDevice(opts: { audio?: boolean } = {}): Promise<DeviceStatus | null> {
  if (!isAndroidDevice()) return null;
  const audio = opts.audio ?? store.settings.indexAudio;
  const kicked = await invoke<DeviceStatus>('android_media_scan', { audio });
  emit(kicked);
  return waitForSettle(kicked, 45_000);
}

/** Ask the system for a folder and index everything inside it. */
export async function pickDeviceFolder(): Promise<DeviceStatus | null> {
  if (!isAndroidDevice()) return null;
  const kicked = await invoke<DeviceStatus>('android_media_pick_folder');
  emit(kicked);
  // the user may take a while inside the system picker
  return waitForSettle(kicked, 240_000);
}

function thumbUrl(path?: string): string | undefined {
  if (!path) return undefined;
  // The asset protocol is how a native file becomes an <img src>. Let Tauri
  // build the URL: it is `asset://` on some platforms and `http://asset.localhost`
  // on others, and both are allowed by the CSP.
  try {
    return convertFileSrc(path);
  } catch {
    return undefined;
  }
}

/**
 * Merge a finished scan into the library.
 *
 * De-duplication is `addMedia`'s job (name + size + source), so a second launch
 * updates the existing row instead of adding a copy. Entries that vanished from
 * the device are dropped, which keeps the grid honest.
 */
export function applyDeviceStatus(status: DeviceStatus | null): SyncResult {
  const empty: SyncResult = { status, added: 0, removed: 0, total: store.library().length };
  if (!status || status.state !== 'ready' || !Array.isArray(status.items)) return empty;

  const before = new Set(store.media.map((m) => m.id));
  const keep = new Set<string>();
  let added = 0;

  for (const raw of status.items) {
    if (!raw?.uri || !raw.name) continue;
    keep.add(raw.uri);
    const kind: 'video' | 'audio' = raw.kind === 'audio' ? 'audio' : 'video';
    const item = store.addMedia({
      name: raw.name,
      title: raw.title || raw.name,
      kind,
      source: 'local',
      url: raw.uri,
      size: raw.size ?? 0,
      duration: raw.duration ? Math.round(raw.duration / 1000) : 0,
      addedAt: raw.added || Date.now(),
      ext: raw.ext || raw.name.split('.').pop()?.toLowerCase() || '',
      thumb: thumbUrl(raw.thumb),
      inLibrary: true,
      deviceUri: raw.uri,
      bucket: raw.bucket,
    });
    if (!before.has(item.id)) added += 1;
  }

  const removed = store.pruneDevice(keep);
  return { status, added, removed, total: store.library().length };
}

/**
 * The whole launch-time flow: scan, index, report. Silent when there is nothing
 * new, so an app that opens onto an unchanged device stays quiet.
 */
export async function syncDeviceLibrary(opts: { silent?: boolean; reason?: 'launch' | 'manual' } = {}): Promise<SyncResult> {
  if (!isAndroidDevice() || busy) return { status: null, added: 0, removed: 0, total: store.library().length };
  if (!store.settings.autoIndex && opts.reason !== 'manual') {
    return { status: null, added: 0, removed: 0, total: store.library().length };
  }
  busy = true;
  try {
    const status = await scanDevice();
    const result = applyDeviceStatus(status);
    if (status?.state === 'permission' || status?.state === 'denied') {
      emit(status);
      return result;
    }
    if (result.added || result.removed) {
      emit(status);
    }
    if (!opts.silent && (result.added || result.removed)) {
      const { toast } = await import('./ui');
      const parts: string[] = [];
      if (result.added) parts.push(t('device.added', { n: n(result.added) }));
      if (result.removed) parts.push(t('device.removed', { n: n(result.removed) }));
      toast(parts.join(' · '), 'ok', 2600);
    }
    return result;
  } finally {
    busy = false;
  }
}

/** True while a scan or picker is in flight (settings + library spinners). */
export function deviceBusy(): boolean {
  return busy;
}
