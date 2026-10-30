/**
 * ROZH Player — reactive state.
 * Settings live in localStorage (tiny, synchronous); the media library and
 * history live in IndexedDB so thumbnails and resume points survive reloads.
 */

import { storage, uid, platform } from './util';
import { isRtl } from './langs';

export type Accent = 'ember' | 'crimson' | 'azure' | 'jade' | 'violet';
export type Glass = 'soft' | 'balanced' | 'bold';
export type LoopMode = 'off' | 'all' | 'one';
export type Fit = 'contain' | 'cover' | 'fill' | 'zoom';
export type Aspect = 'auto' | '16:9' | '4:3' | '21:9' | 'fill' | 'stretch';
/** Interface languages. Only `fa` and `en` are complete; the rest fall back. */
export type Lang =
  | 'fa'
  | 'ku'
  | 'en'
  | 'ar'
  | 'tr'
  | 'ru'
  | 'es'
  | 'fr'
  | 'de'
  | 'it'
  | 'pt'
  | 'hi'
  | 'ur'
  | 'zh'
  | 'ja'
  | 'ko'
  | 'id'
  | 'he'
  | 'ps'
  | 'az'
  | 'nl'
  | 'pl'
  | 'cs'
  | 'sk'
  | 'hu'
  | 'ro'
  | 'bg'
  | 'sr'
  | 'hr'
  | 'uk'
  | 'el'
  | 'sv'
  | 'no'
  | 'da'
  | 'fi'
  | 'vi'
  | 'th'
  | 'ms'
  | 'bn'
  | 'ta'
  | 'te'
  | 'tl'
  | 'sw'
  | 'kk'
  | 'uz'
  | 'hy'
  | 'ka'

/** Colour grading applied to the video element (CSS filter values). */
export interface VideoEffects {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  blur: number;
  grayscale: number;
}

export interface Settings {
  accent: Accent;
  glass: Glass;
  motion: 'full' | 'reduced';
  lang: Lang;
  sidebar: 'open' | 'collapsed';
  volume: number;
  muted: boolean;
  rate: number;
  autoplay: boolean;
  resume: boolean;
  loop: LoopMode;
  shuffle: boolean;
  fit: Fit;
  seekStep: number;
  volumeStep: number;
  seekStepLong: number;
  subSize: number;
  subColor: string;
  subShadow: number;
  subBg: number;
  subFontStyle: 'outline' | 'shadow' | 'box';
  eqEnabled: boolean;
  eq: number[];
  tv: 'auto' | 'on' | 'off';
  thumbnails: boolean;
  screenshotFormat: 'png' | 'jpeg';
  confirmExit: boolean;
  hlsQuality: number; // -1 = auto
  audioOnlyQuality: 'auto' | 'high' | 'data';
  sdrBoost: boolean;
  showEmbers: boolean;
  seenWelcome: boolean;
  /* --- VLC / PotPlayer style playback extras --- */
  effects: VideoEffects;
  aspect: Aspect;
  rotate: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  pitch: boolean;
  subOffsetMs: number;
  sleepTimer: number;
  lock: boolean;
  stats: boolean;
  longPressBoost: boolean;
  doubleTapSeek: boolean;
  frameStepMs: number;
  /* --- Android device library --- */
  autoIndex: boolean;
  indexAudio: boolean;
  /* --- updates --- */
  autoUpdate: boolean;
}

/** Bookmarked positions, grouped by playable key. */
export interface Bookmark {
  t: number;
  label: string;
  at: number;
}

export type MediaKind = 'video' | 'audio' | 'stream';

export interface MediaItem {
  id: string;
  name: string;
  title: string;
  kind: MediaKind;
  source: 'local' | 'url' | 'demo';
  url?: string;
  size: number;
  duration: number;
  position: number;
  addedAt: number;
  playedAt: number;
  thumb?: string;
  ext: string;
  inLibrary: boolean;
  plays: number;
  /** `content://` URI of a file indexed from the device (Android only). */
  deviceUri?: string;
  /** Folder / album the device file came from. */
  bucket?: string;
}

const DEFAULT_SETTINGS: Settings = {
  accent: 'ember',
  glass: 'balanced',
  motion: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full',
  /** Interface language. English is the default for every platform. */
  lang: 'en',
  sidebar: 'open',
  volume: 0.9,
  muted: false,
  rate: 1,
  autoplay: true,
  resume: true,
  loop: 'off',
  shuffle: false,
  fit: 'contain',
  seekStep: 5,
  volumeStep: 0.05,
  seekStepLong: 30,
  subSize: 100,
  subColor: '#ffffff',
  subShadow: 40,
  subBg: 55,
  subFontStyle: 'outline',
  eqEnabled: false,
  eq: [0, 0, 0, 0, 0, 0],
  tv: platform.tv ? 'on' : 'auto',
  thumbnails: true,
  screenshotFormat: 'png',
  confirmExit: true,
  hlsQuality: -1,
  audioOnlyQuality: 'auto',
  sdrBoost: false,
  showEmbers: true,
  seenWelcome: false,
  effects: { brightness: 1, contrast: 1, saturation: 1, hue: 0, blur: 0, grayscale: 0 },
  aspect: 'auto',
  rotate: 0,
  flipH: false,
  flipV: false,
  pitch: true,
  subOffsetMs: 0,
  sleepTimer: 0,
  lock: false,
  stats: false,
  longPressBoost: true,
  doubleTapSeek: true,
  frameStepMs: 40,
  autoIndex: true,
  indexAudio: true,
  autoUpdate: true,
};

/* ------------------------------------------------------------------ */
/* IndexedDB (tiny promise wrapper)                                    */
/* ------------------------------------------------------------------ */

const DB_NAME = 'rozh-player';
const DB_VERSION = 1;
const STORE = 'state';

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const d = await db();
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = d.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* storage unavailable (private mode) — state stays in memory */
  }
}

/* ------------------------------------------------------------------ */
/* store                                                               */
/* ------------------------------------------------------------------ */

type Listener = () => void;

class Store {
  settings: Settings = { ...DEFAULT_SETTINGS, ...storage.get<Partial<Settings>>('settings', {}) };
  media: MediaItem[] = [];
  resumeMap: Record<string, { pos: number; at: number }> = storage.get('resume', {});
  ready = false;

  private listeners = new Set<Listener>();

  async init(): Promise<void> {
    const media = await idbGet<MediaItem[]>('media');
    if (Array.isArray(media)) this.media = media;
    this.ready = true;
    this.emit();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  /* ---------------- settings ---------------- */
  private saveTimer = 0;

  /** Coalesce localStorage writes — volume drags fire dozens of patches a second. */
  private persistSettings(): void {
    if (this.saveTimer) return;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = 0;
      storage.set('settings', this.settings);
    }, 220);
  }

  patch(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    this.persistSettings();
    applySettings(this.settings);
    this.emit();
  }

  resetSettings(): void {
    this.settings = { ...DEFAULT_SETTINGS, lang: this.settings.lang };
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = 0;
    storage.set('settings', this.settings);
    applySettings(this.settings);
    this.emit();
  }

  /* ---------------- media ---------------- */
  private persist = (() => {
    let timer: number | undefined;
    return (): void => {
      if (timer) clearTimeout(timer);
      timer = window.setTimeout(() => {
        void idbSet('media', this.media);
      }, 350);
    };
  })();

  addMedia(item: Partial<MediaItem> & { name: string }): MediaItem {
    // Device URIs identify a concrete MediaStore/SAF document. Do not merge
    // different files merely because two folders contain the same name and
    // byte size; that made Android libraries silently lose tracks and videos.
    const existing = item.deviceUri
      ? this.media.find((m) => m.deviceUri === item.deviceUri)
      : this.media.find(
          (m) =>
            !m.deviceUri &&
            m.name === item.name &&
            m.size === (item.size ?? 0) &&
            m.source === (item.source ?? 'local'),
        );
    if (existing) {
      if (item.thumb && !existing.thumb) existing.thumb = item.thumb;
      if (item.duration) existing.duration = item.duration;
      if (item.url && item.url !== existing.url) existing.url = item.url;
      if (item.deviceUri) existing.deviceUri = item.deviceUri;
      if (item.bucket) existing.bucket = item.bucket;
      existing.inLibrary = existing.inLibrary || !!item.inLibrary;
      this.persist();
      this.emit();
      return existing;
    }
    const now = Date.now();
    const created: MediaItem = {
      id: uid('m'),
      name: item.name,
      title: item.title ?? item.name,
      kind: item.kind ?? 'video',
      source: item.source ?? 'local',
      url: item.url,
      size: item.size ?? 0,
      duration: item.duration ?? 0,
      position: 0,
      addedAt: now,
      playedAt: 0,
      thumb: item.thumb,
      ext: item.ext ?? (item.name.split('.').pop() ?? '').toLowerCase(),
      inLibrary: item.inLibrary ?? true,
      plays: 0,
      deviceUri: item.deviceUri,
      bucket: item.bucket,
    };
    this.media.unshift(created);
    this.persist();
    this.emit();
    return created;
  }

  /**
   * Drop device-indexed entries that are no longer on the device. Entries the
   * user opened by hand (no `deviceUri`) are never touched.
   */
  pruneDevice(keep: Set<string>): number {
    const before = this.media.length;
    this.media = this.media.filter((m) => !m.deviceUri || keep.has(m.deviceUri));
    const removed = before - this.media.length;
    if (removed) {
      this.persist();
      this.emit();
    }
    return removed;
  }

  /** How many library entries came from the device index. */
  deviceCount(): number {
    return this.media.filter((m) => !!m.deviceUri).length;
  }

  updateMedia(id: string, patch: Partial<MediaItem>): void {
    const item = this.media.find((m) => m.id === id);
    if (!item) return;
    Object.assign(item, patch);
    this.persist();
    this.emit();
  }

  removeMedia(id: string): void {
    this.media = this.media.filter((m) => m.id !== id);
    this.persist();
    this.emit();
  }

  clearLibrary(): void {
    this.media = [];
    this.persist();
    this.emit();
  }

  clearHistory(): void {
    this.media.forEach((m) => {
      m.playedAt = 0;
      m.position = 0;
      m.plays = 0;
    });
    this.resumeMap = {};
    storage.set('resume', {});
    this.persist();
    this.emit();
  }

  library(): MediaItem[] {
    return this.media.filter((m) => m.inLibrary);
  }

  recent(limit = 40): MediaItem[] {
    return this.media
      .filter((m) => m.playedAt > 0)
      .sort((a, b) => b.playedAt - a.playedAt)
      .slice(0, limit);
  }

  /* ---------------- bookmarks ---------------- */
  private bookmarks: Record<string, Bookmark[]> = storage.get<Record<string, Bookmark[]>>('bookmarks', {});

  marks(key: string): Bookmark[] {
    return [...(this.bookmarks[key] ?? [])].sort((a, b) => a.t - b.t);
  }

  addMark(key: string, t: number, label: string): Bookmark {
    const mark: Bookmark = { t, label: label.trim() || `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`, at: Date.now() };
    const list = this.bookmarks[key] ?? [];
    // replace a bookmark within 2s of an existing one
    const near = list.findIndex((b) => Math.abs(b.t - t) < 2);
    if (near >= 0) list[near] = mark;
    else list.push(mark);
    this.bookmarks[key] = list;
    storage.set('bookmarks', this.bookmarks);
    this.emit();
    return mark;
  }

  removeMark(key: string, at: number): void {
    this.bookmarks[key] = (this.bookmarks[key] ?? []).filter((b) => Math.abs(b.at - at) > 0.5);
    storage.set('bookmarks', this.bookmarks);
    this.emit();
  }

  allMarks(): { key: string; mark: Bookmark }[] {
    return Object.entries(this.bookmarks).flatMap(([key, list]) => list.map((mark) => ({ key, mark })));
  }

  /* ---------------- resume ---------------- */
  /**
   * Resume points are keyed by the playable key, which already contains the
   * file name plus its size (or the absolute path for native Tauri files), so
   * two different films never share a bookmark.
   */
  fingerprint(key: string): string {
    return key;
  }

  getResume(key: string): number {
    if (!this.settings.resume) return 0;
    const rec = this.resumeMap[this.fingerprint(key)];
    if (!rec) return 0;
    // ignore resume points in the last 20 seconds, or ancient ones
    if (Date.now() - rec.at > 1000 * 60 * 60 * 24 * 60) return 0;
    return rec.pos;
  }

  setResume(key: string, pos: number): void {
    if (!this.settings.resume) return;
    if (pos < 5) return;
    this.resumeMap[this.fingerprint(key)] = { pos, at: Date.now() };
    storage.set('resume', this.resumeMap);
  }
}

export const store = new Store();

const applied: Record<string, string> = {};

/** Push settings into CSS custom properties + document attributes (only when they change). */
export function applySettings(s: Settings): void {
  const root = document.documentElement;
  const set = (key: string, value: string, apply: (v: string) => void): void => {
    if (applied[key] === value) return;
    applied[key] = value;
    apply(value);
  };

  set('accent', s.accent, (v) => (root.dataset.accent = v));
  set('glass', s.glass, (v) => (root.dataset.glass = v));
  set('motion', s.motion, (v) => (root.dataset.motion = v));
  // A dedicated Android TV package must never fall back to the phone layout,
  // even if an old preference was migrated with TV mode explicitly disabled.
  set('tv', platform.tvBuild || s.tv === 'on' || (s.tv === 'auto' && platform.tv) ? 'true' : 'false', (v) => {
    root.dataset.tv = v;
  });
  set('lang', s.lang, (v) => {
    root.lang = v;
    root.dir = isRtl(v as typeof s.lang) ? 'rtl' : 'ltr';
  });
  set('subSize', String(s.subSize), (v) => root.style.setProperty('--sub-size', `${v}%`));
  set('subColor', s.subColor, (v) => root.style.setProperty('--sub-color', v));
}
