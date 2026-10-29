/**
 * ROZH Player — native (Tauri) bridge.
 *
 * Everything here is a no-op in the browser, so the same bundle runs on the web
 * unchanged. On desktop it unlocks the asset protocol and the FFmpeg fallback.
 */

import { platform } from './util';

export interface NativeFile extends File {
  __path?: string;
  __url?: string;
}

export const isNative = platform.tauri;

export async function convertFileSrc(path: string): Promise<string> {
  if (!platform.tauri) return path;
  const { convertFileSrc: convert } = await import('@tauri-apps/api/core');
  return convert(path);
}

/**
 * Ask the Rust side to remux/transcode a path into something the webview can
 * decode. Returns a playable asset URL, or null when unavailable.
 */
export async function remuxToPlayable(path: string): Promise<string | null> {
  if (!platform.tauri) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const out = await invoke<string>('remux_file', { path });
    if (!out) return null;
    return await convertFileSrc(out);
  } catch (err) {
    console.warn('[rozh] native remux unavailable', err);
    return null;
  }
}

export interface ProbeResult {
  duration: number;
  video: string;
  audio: string;
}

export async function probeFile(path: string): Promise<ProbeResult | null> {
  if (!platform.tauri) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<ProbeResult>('probe_file', { path });
  } catch {
    return null;
  }
}

export async function revealInFolder(path: string): Promise<void> {
  if (!platform.tauri) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('reveal_in_folder', { path });
  } catch {
    /* ignore */
  }
}

/** Global window controls, used by the custom title area on desktop. */
export async function toggleNativeFullscreen(): Promise<void> {
  if (!platform.tauri) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    const fs = await win.isFullscreen();
    await win.setFullscreen(!fs);
  } catch {
    /* ignore */
  }
}

/** Subscribe to tray/menu commands emitted by the Rust side. */
export async function onNativeCommand(handler: (cmd: string) => void): Promise<void> {
  if (!platform.tauri) return;
  try {
    const { listen } = await import('@tauri-apps/api/event');
    await listen<string>('rozh:command', (e) => handler(e.payload));
  } catch {
    /* ignore */
  }
}
