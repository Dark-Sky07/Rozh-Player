/**
 * ROZH Player — loopback media server (Android).
 *
 * A `content://` URI is readable by the app but not by `<video src>` in the
 * Android WebView, and it cannot be fetched at all by hls.js / mpegts.js / dash.js
 * (no Range support, no CORS, no URL the loaders understand). MKV with AC-3 or
 * DTS — exactly the files the built-in decoder refuses — never even reach the
 * demuxer.
 *
 * `MediaBridge.java` therefore starts a tiny HTTP server on `127.0.0.1` (random
 * port) inside the app process. It streams any URI the app is allowed to open,
 * answers `Range` requests with `206`, and needs no permissions. This module
 * turns a media URL into that stream URL.
 *
 * Everything here is a no-op off Android: the URL comes back untouched.
 */

import { platform } from './util';

/** Extensions the webview can usually decode on its own — no server needed. */
const NATIVE_EXT = /\.(mp4|m4v|webm|ogg|oga|ogv|mp3|m4a|aac|wav|flac|opus)$/i;

interface MediaServerInfo {
  port: number;
  token: string;
}

let serverInfo: MediaServerInfo | null = null;
let probing: Promise<MediaServerInfo | null> | null = null;

async function probe(): Promise<MediaServerInfo | null> {
  if (serverInfo) return serverInfo;
  if (!platform.tauri || platform.os !== 'android') return null;
  try {
    const api = await import('@tauri-apps/api/core');
    const res = await api.invoke<{ port?: number; token?: string }>('android_media_server');
    const port = Number(res?.port ?? 0);
    const token = String(res?.token ?? '');
    if (Number.isInteger(port) && port > 0 && port <= 65535 && /^[A-Za-z0-9_-]{43}$/.test(token)) {
      serverInfo = { port, token };
      return serverInfo;
    }
  } catch {
    /* the bridge may not have started yet */
  }
  return null;
}

async function mediaServerInfo(): Promise<MediaServerInfo | null> {
  if (serverInfo) return serverInfo;
  if (!probing) probing = probe().finally(() => { probing = null; });
  return probing;
}

/** Resolve the port once; the bridge writes an authenticated endpoint at launch. */
export async function mediaServerPort(): Promise<number> {
  return (await mediaServerInfo())?.port ?? 0;
}

/** True when the URL is a local, app-owned reference that the webview cannot fetch. */
export function needsServer(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('content://')) return true;
  if (url.startsWith('file://')) return true;
  // Tauri's asset protocol on Android also yields no byte ranges for some
  // providers; the server is strictly better when it is available.
  if (url.startsWith('http://asset.localhost')) return false;
  return false;
}

function base64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fileName(url: string): string {
  const clean = url.split('#')[0].split('?')[0];
  const last = clean.split('/').pop() ?? '';
  const decoded = (() => {
    try {
      return decodeURIComponent(last);
    } catch {
      return last;
    }
  })();
  return decoded.replace(/[^\w.\-\s()[\]]+/g, '_').slice(-80) || 'media';
}

function streamFor(url: string, info: MediaServerInfo, hint?: string): string {
  const named = hint && /\.[a-z0-9]{2,4}$/i.test(hint) ? hint : fileName(url);
  // The name stays in the path so `.mkv`, `.ts`, `.m3u8` detection keeps working
  // in the player, and so the server can guess a MIME type.
  return `http://127.0.0.1:${info.port}/s/${info.token}/${base64Url(url)}/${encodeURIComponent(named)}`;
}

/** A URL the webview can actually play for this media reference. */
export async function streamableUrl(url: string, hint?: string): Promise<string> {
  if (!needsServer(url)) return url;
  const info = await mediaServerInfo();
  if (!info) return url;
  return streamFor(url, info, hint);
}

/**
 * Some containers need demuxing in JavaScript (MKV → MSE). Those loaders fetch
 * the source themselves, so they need the same URL even for plain files.
 */
export async function streamableFetchUrl(url: string, hint?: string): Promise<string> {
  if (!needsServer(url)) return url;
  const info = await mediaServerInfo();
  return info ? streamFor(url, info, hint) : url;
}

/* ------------------------------------------------------------------ */
/* system player hand-off                                              */
/* ------------------------------------------------------------------ */

/**
 * Some codecs (AC-3, DTS, VC-1 inside MKV, …) are simply not decodable by the
 * webview, no matter how the bytes are delivered. The device's own player can
 * often handle them, so the player offers a one-tap hand-off instead of a dead
 * end. Only local, app-owned media qualifies.
 */
export function canHandOff(url?: string): boolean {
  if (!url || !platform.tauri || platform.os !== 'android') return false;
  return url.startsWith('content://') || url.startsWith('file://');
}

const MIME: Record<string, string> = {
  mkv: 'video/x-matroska',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  avi: 'video/x-msvideo',
  mov: 'video/quicktime',
  flv: 'video/x-flv',
  ts: 'video/mp2t',
  m2ts: 'video/mp2t',
  wmv: 'video/x-ms-wmv',
  mpg: 'video/mpeg',
  mpeg: 'video/mpeg',
  '3gp': 'video/3gpp',
  ogv: 'video/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
};

function mimeFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return MIME[ext] ?? 'video/*';
}

/** Open the file in whatever player the device has; true when the intent fired. */
export async function openInSystemPlayer(url: string, name: string): Promise<boolean> {
  if (!canHandOff(url)) return false;
  try {
    const api = await import('@tauri-apps/api/core');
    await api.invoke('android_open_external', { uri: url, mime: mimeFor(name || fileName(url)) });
    return true;
  } catch (err) {
    console.warn('[rozh] system player hand-off failed', err);
    return false;
  }
}

export { NATIVE_EXT };
