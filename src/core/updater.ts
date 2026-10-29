/**
 * ROZH Player — in-app updates.
 *
 * Two channels, one UI:
 *
 *   • **Desktop** (Windows / macOS / Linux) uses Tauri's signed updater. The
 *     build pipeline publishes `latest.json` next to the bundles and signs each
 *     updater artifact, so an update is verified before it is applied and the
 *     app restarts into the new version by itself.
 *
 *   • **Android / Android TV** uses the release page: the latest release is read
 *     from the GitHub API, the matching APK is handed to the system download
 *     manager, and the package installer opens when it is complete. Android
 *     upgrades in place because every release is signed with the same key.
 *
 * Both paths are inert in the browser build.
 */

import { platform } from './util';

export type UpdateChannel = 'desktop' | 'android' | 'none';

export interface UpdateInfo {
  channel: UpdateChannel;
  /** Version offered by the release channel. */
  version: string;
  /** Version currently running. */
  current: string;
  notes: string;
  size: number;
  /** Direct asset URL (Android) — empty for the desktop updater. */
  url: string;
}

const RELEASES_API = 'https://api.github.com/repos/Dark-Sky07/Rozh-Player/releases/latest';

export const currentVersion = (): string => __APP_VERSION__;

export function updateChannel(): UpdateChannel {
  if (!platform.tauri) return 'none';
  if (platform.os === 'android') return 'android';
  if (platform.os === 'windows' || platform.os === 'macos' || platform.os === 'linux') return 'desktop';
  return 'none';
}

/** 1.2.10 > 1.2.9 — plain numeric comparison, ignores a leading `v`. */
export function isNewer(candidate: string, current: string): boolean {
  const parse = (v: string): number[] =>
    String(v)
      .replace(/^v/i, '')
      .split(/[.+-]/)
      .map((p) => Number.parseInt(p, 10) || 0);
  const a = parse(candidate);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

interface GithubAsset {
  name: string;
  size: number;
  browser_download_url: string;
}

interface GithubRelease {
  tag_name: string;
  body?: string;
  assets?: GithubAsset[];
}

async function latestRelease(): Promise<GithubRelease | null> {
  try {
    const res = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as GithubRelease;
  } catch {
    return null;
  }
}

/** Which APK belongs to this package: the TV build has its own asset. */
function pickApk(assets: GithubAsset[]): GithubAsset | null {
  const wantsTv = platform.tvBuild || document.documentElement.dataset.tv === 'true';
  const apks = assets.filter((a) => a.name.toLowerCase().endsWith('.apk'));
  const tv = apks.find((a) => /-tv-/i.test(a.name) || /TV/i.test(a.name));
  const phone = apks.find((a) => !/-tv-/i.test(a.name) && !/TV/i.test(a.name));
  return wantsTv ? tv ?? phone ?? null : phone ?? null;
}

/** Ask the channel what the newest version is. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const channel = updateChannel();
  if (channel === 'none') return null;
  const current = currentVersion();

  if (channel === 'android') {
    const release = await latestRelease();
    if (!release?.tag_name) return null;
    const version = release.tag_name.replace(/^v/i, '');
    const asset = pickApk(release.assets ?? []);
    if (!asset) return null;
    return {
      channel,
      version,
      current,
      notes: release.body ?? '',
      size: asset.size,
      url: asset.browser_download_url,
    };
  }

  const { check } = await import('@tauri-apps/plugin-updater');
  const update = await check();
  if (!update) return null;
  pending = update as DesktopUpdate;
  return {
    channel,
    version: update.version,
    current: update.currentVersion ?? current,
    notes: update.body ?? '',
    size: 0,
    url: '',
  };
}

/* ------------------------------------------------------------------ */
/* desktop install                                                     */
/* ------------------------------------------------------------------ */

interface DesktopUpdate {
  downloadAndInstall: (cb: (event: Record<string, unknown>) => void) => Promise<void>;
}

/** The update `checkForUpdate()` just found, so installing does not re-download the manifest. */
let pending: DesktopUpdate | null = null;

/**
 * Download + install the pending desktop update, then relaunch.
 * `onProgress` receives 0–100 (or -1 when the size is unknown).
 */
export async function installDesktopUpdate(onProgress?: (percent: number) => void): Promise<void> {
  let update = pending;
  if (!update) {
    const { check } = await import('@tauri-apps/plugin-updater');
    update = (await check()) as DesktopUpdate | null;
  }
  if (!update) throw new Error('no update available');
  let total = 0;
  let done = 0;
  await update.downloadAndInstall((event: Record<string, unknown>) => {
    const kind = String(event.event ?? '');
    if (kind === 'Started') {
      total = Number((event.data as { contentLength?: number })?.contentLength ?? 0);
      onProgress?.(0);
    } else if (kind === 'Progress') {
      done += Number((event.data as { chunkLength?: number })?.chunkLength ?? 0);
      onProgress?.(total > 0 ? Math.min(99, Math.round((done / total) * 100)) : -1);
    } else if (kind === 'Finished') {
      onProgress?.(100);
    }
  });
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}

/* ------------------------------------------------------------------ */
/* android install                                                     */
/* ------------------------------------------------------------------ */

export interface AndroidInstallState {
  state: 'idle' | 'downloading' | 'installing' | 'done' | 'error' | 'permission';
  progress?: number;
  message?: string;
}

/** Hand the APK to Android's download manager; the installer opens on completion. */
export async function installAndroidUpdate(url: string): Promise<AndroidInstallState> {
  try {
    const api = await import('@tauri-apps/api/core');
    const state = await api.invoke<AndroidInstallState>('android_update_install', { url });
    return state ?? { state: 'error', message: 'no response' };
  } catch (err) {
    return { state: 'error', message: String((err as Error)?.message ?? err) };
  }
}

/** Poll the download/install progress written by the Java bridge. */
export async function androidUpdateStatus(): Promise<AndroidInstallState | null> {
  try {
    const api = await import('@tauri-apps/api/core');
    return await api.invoke<AndroidInstallState>('android_update_status');
  } catch {
    return null;
  }
}
