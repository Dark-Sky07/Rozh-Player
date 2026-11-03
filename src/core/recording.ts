/** Desktop IPTV recorder and persistent, EPG-timed schedule manager. */

import { platform, storage, uid } from './util';
import { toast } from './ui';
import { t } from './i18n';

export interface ScheduledIptvRecording {
  id: string;
  url: string;
  title: string;
  startAt: number;
  stopAt: number;
  path: string;
}

const SCHEDULE_KEY = 'pvr.scheduled.v1';
const MAX_SCHEDULES = 100;
const MAX_DURATION_MS = 12 * 60 * 60_000;
let recordingPath: string | null = null;
let recordingUrl: string | null = null;
let recordingTitle = '';
let activeScheduleId: string | null = null;
const storedSchedules = storage.get<unknown>(SCHEDULE_KEY, []);
let scheduled: ScheduledIptvRecording[] = Array.isArray(storedSchedules) ? storedSchedules as ScheduledIptvRecording[] : [];
let initialized = false;
const timers = new Map<string, { start?: number; stop?: number }>();

function persistSchedules(): void {
  storage.set(SCHEDULE_KEY, scheduled);
}

function changed(): void {
  window.dispatchEvent(new Event('rozh:recording-state'));
}

export function getScheduledRecordings(): ScheduledIptvRecording[] {
  return [...scheduled].sort((a, b) => a.startAt - b.startAt);
}

export function isRecording(url?: string): boolean {
  return recordingPath !== null && (url === undefined || recordingUrl === url);
}

export function isScheduledRecording(url: string, startAt: number, stopAt: number): boolean {
  return scheduled.some((item) => item.url === url && item.startAt === startAt && item.stopAt === stopAt);
}

function safeTitle(title: string): string {
  return title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 80) || 'ROZH IPTV recording';
}

async function choosePath(title: string): Promise<string | null> {
  const { save } = await import('@tauri-apps/plugin-dialog');
  const selected = await save({
    defaultPath: `${safeTitle(title)}.mkv`,
    filters: [{ name: 'Matroska recording (stream copy)', extensions: ['mkv'] }],
  });
  if (!selected) return null;
  return selected.toLowerCase().endsWith('.mkv') ? selected : `${selected}.mkv`;
}

async function beginRecording(url: string, title: string, path: string, scheduleId: string | null): Promise<boolean> {
  if (recordingPath) {
    toast(t('pvr.alreadyRecording'), 'warn');
    return false;
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('start_iptv_recording', { url, path });
    recordingPath = path;
    recordingUrl = url;
    recordingTitle = title;
    activeScheduleId = scheduleId;
    toast(t(scheduleId ? 'pvr.scheduledStarted' : 'pvr.started', { title }), 'ok', 4000);
    changed();
    return true;
  } catch (error) {
    console.warn('[rozh] IPTV recording could not start', error);
    toast(t('pvr.startError'), 'bad', 4500);
    changed();
    return false;
  }
}

export async function startIptvRecording(url: string, title: string): Promise<boolean> {
  if (!platform.tauri || platform.mobile) return false;
  if (recordingPath) {
    toast(t('pvr.alreadyRecording'), 'warn');
    return false;
  }
  try {
    const path = await choosePath(title);
    if (!path) return false;
    return await beginRecording(url, title, path, null);
  } catch (error) {
    console.warn('[rozh] IPTV recording could not start', error);
    toast(t('pvr.startError'), 'bad', 4000);
    return false;
  }
}

export async function scheduleIptvRecording(
  url: string,
  title: string,
  startAt: number,
  stopAt: number,
): Promise<boolean> {
  if (!platform.tauri || platform.mobile) return false;
  const now = Date.now();
  if (!Number.isFinite(startAt) || !Number.isFinite(stopAt) || startAt < now - 60_000 || stopAt <= startAt || stopAt - startAt > MAX_DURATION_MS) {
    toast(t('pvr.invalidSchedule'), 'warn');
    return false;
  }
  if (scheduled.length >= MAX_SCHEDULES) {
    toast(t('pvr.scheduleLimit'), 'warn');
    return false;
  }
  if (recordingPath) {
    toast(t('pvr.alreadyRecording'), 'warn');
    return false;
  }
  const collision = scheduled.some((item) => startAt < item.stopAt && stopAt > item.startAt);
  if (collision) {
    toast(t('pvr.scheduleConflict'), 'warn');
    return false;
  }
  try {
    const path = await choosePath(title);
    if (!path) return false;
    if (scheduled.some((item) => item.path.toLowerCase() === path.toLowerCase())) {
      toast(t('pvr.pathConflict'), 'warn');
      return false;
    }
    const entry: ScheduledIptvRecording = { id: uid('recording'), url, title: safeTitle(title), startAt, stopAt, path };
    scheduled = [...scheduled, entry].sort((a, b) => a.startAt - b.startAt);
    persistSchedules();
    arm(entry);
    toast(t('pvr.scheduleAdded', { title: entry.title }), 'ok', 4500);
    changed();
    return true;
  } catch (error) {
    console.warn('[rozh] IPTV recording could not be scheduled', error);
    toast(t('pvr.startError'), 'bad', 4000);
    return false;
  }
}

function removeSchedule(id: string): void {
  const handle = timers.get(id);
  if (handle?.start) clearTimeout(handle.start);
  if (handle?.stop) clearTimeout(handle.stop);
  timers.delete(id);
  scheduled = scheduled.filter((item) => item.id !== id);
  persistSchedules();
  changed();
}

export async function cancelScheduledRecording(id: string): Promise<void> {
  if (activeScheduleId === id) {
    await stopIptvRecording();
    return;
  }
  if (!scheduled.some((item) => item.id === id)) return;
  removeSchedule(id);
  toast(t('pvr.scheduleCancelled'), 'ok');
}

function arm(entry: ScheduledIptvRecording): void {
  const previous = timers.get(entry.id);
  if (previous?.start) clearTimeout(previous.start);
  if (previous?.stop) clearTimeout(previous.stop);
  const now = Date.now();
  if (entry.stopAt <= now) {
    removeSchedule(entry.id);
    toast(t('pvr.missed', { title: entry.title }), 'warn', 5000);
    return;
  }
  const handles: { start?: number; stop?: number } = {};
  handles.start = window.setTimeout(() => {
    void beginRecording(entry.url, entry.title, entry.path, entry.id).then((started) => {
      if (!started) {
        removeSchedule(entry.id);
        return;
      }
      const remaining = Math.max(0, entry.stopAt - Date.now());
      handles.stop = window.setTimeout(() => void stopIptvRecording(), remaining);
      timers.set(entry.id, handles);
    });
  }, Math.max(0, entry.startAt - now));
  timers.set(entry.id, handles);
}

/** Re-arm persisted jobs on every desktop launch and recover jobs whose window is underway. */
export function initRecordingScheduler(): void {
  if (initialized || !platform.tauri || platform.mobile) return;
  initialized = true;
  const valid = scheduled.filter((item) =>
    item && typeof item.id === 'string' && typeof item.url === 'string' && typeof item.path === 'string' &&
    Number.isFinite(item.startAt) && Number.isFinite(item.stopAt) && item.stopAt > item.startAt,
  );
  if (valid.length !== scheduled.length) {
    scheduled = valid;
    persistSchedules();
  }
  scheduled.forEach(arm);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const current = Date.now();
    scheduled.forEach((entry) => {
      const existing = timers.get(entry.id);
      if (!existing || (!existing.start && !existing.stop)) arm(entry);
      else if (entry.startAt <= current && !recordingPath && !existing.stop) arm(entry);
    });
  });
}

export async function stopIptvRecording(): Promise<boolean> {
  if (!recordingPath || !platform.tauri || platform.mobile) return false;
  const path = recordingPath;
  const title = recordingTitle;
  const scheduleId = activeScheduleId;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<{ path?: string }>('stop_iptv_recording');
    const saved = result?.path ?? path;
    recordingPath = null;
    recordingUrl = null;
    recordingTitle = '';
    activeScheduleId = null;
    if (scheduleId) removeSchedule(scheduleId);
    toast(t('pvr.saved', { title, path: saved }), 'ok', 4500);
    changed();
    return true;
  } catch (error) {
    console.warn('[rozh] IPTV recording could not stop cleanly', error);
    recordingPath = null;
    recordingUrl = null;
    recordingTitle = '';
    activeScheduleId = null;
    if (scheduleId) removeSchedule(scheduleId);
    toast(t('pvr.stopError'), 'bad', 4500);
    changed();
    return false;
  }
}
