/** Desktop IPTV recording through the bundled FFmpeg process, using stream copy only. */

import { platform } from './util';
import { toast } from './ui';
import { t } from './i18n';

let recordingPath: string | null = null;
let recordingUrl: string | null = null;
let recordingTitle = '';

export function isRecording(url?: string): boolean {
  return recordingPath !== null && (url === undefined || recordingUrl === url);
}

export async function startIptvRecording(url: string, title: string): Promise<boolean> {
  if (!platform.tauri || platform.mobile) return false;
  if (recordingPath) {
    toast(t('pvr.alreadyRecording'), 'warn');
    return false;
  }
  try {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const safeName = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 80) || 'ROZH IPTV recording';
    const selected = await save({
      defaultPath: `${safeName}.mkv`,
      filters: [{ name: 'Matroska recording (stream copy)', extensions: ['mkv'] }],
    });
    if (!selected) return false;
    const path = selected.toLowerCase().endsWith('.mkv') ? selected : `${selected}.mkv`;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('start_iptv_recording', { url, path });
    recordingPath = path;
    recordingUrl = url;
    recordingTitle = title;
    toast(t('pvr.started', { title }), 'ok', 3500);
    return true;
  } catch (error) {
    console.warn('[rozh] IPTV recording could not start', error);
    toast(t('pvr.startError'), 'bad', 4000);
    return false;
  }
}

export async function stopIptvRecording(): Promise<boolean> {
  if (!recordingPath || !platform.tauri || platform.mobile) return false;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<{ path?: string }>('stop_iptv_recording');
    const saved = result?.path ?? recordingPath;
    recordingPath = null;
    recordingUrl = null;
    const title = recordingTitle;
    recordingTitle = '';
    toast(t('pvr.saved', { title, path: saved }), 'ok', 4500);
    return true;
  } catch (error) {
    console.warn('[rozh] IPTV recording could not stop cleanly', error);
    recordingPath = null;
    recordingUrl = null;
    recordingTitle = '';
    toast(t('pvr.stopError'), 'bad', 4500);
    return false;
  }
}
