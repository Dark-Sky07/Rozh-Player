/** ROZH Player — small shared helpers (DOM, formatting, storage, platform). */

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T | null =>
  root.querySelector<T>(sel);

export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] =>
  Array.from(root.querySelectorAll<T>(sel));

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);

export const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 65 -> "1:05", 3725 -> "1:02:05" */
export function fmtTime(seconds: number, forceHours = false): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0 || forceHours) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

/** Human readable duration: "1h 12m" / "42 min" */
export function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m} min`;
  return `${Math.round(seconds)}s`;
}

export function fmtBytes(b: number): string {
  if (!Number.isFinite(b) || b <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

export function fmtRelative(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms = 200): T & { cancel(): void } {
  let t: number | undefined;
  const wrapped = ((...args: never[]) => {
    if (t) clearTimeout(t);
    t = window.setTimeout(() => fn(...args), ms);
  }) as T & { cancel(): void };
  wrapped.cancel = () => {
    if (t) clearTimeout(t);
  };
  return wrapped;
}

export function rafThrottle<T extends (...args: never[]) => void>(fn: T): T {
  let scheduled = false;
  let lastArgs: never[] = [] as never[];
  return ((...args: never[]) => {
    lastArgs = args;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      fn(...lastArgs);
    });
  }) as T;
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/* ------------------------------------------------------------------ */
/* storage                                                            */
/* ------------------------------------------------------------------ */

const KEY_PREFIX = 'rozh.v1.';

export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(KEY_PREFIX + key);
      if (raw == null) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(KEY_PREFIX + key, JSON.stringify(value));
    } catch {
      /* quota / private mode — ignore */
    }
  },
  del(key: string): void {
    try {
      localStorage.removeItem(KEY_PREFIX + key);
    } catch {
      /* ignore */
    }
  },
};

/* ------------------------------------------------------------------ */
/* platform                                                           */
/* ------------------------------------------------------------------ */

export type HostKind = 'web' | 'desktop' | 'android' | 'ios';

export interface PlatformInfo {
  host: HostKind;
  tauri: boolean;
  os: 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'web';
  touch: boolean;
  tv: boolean;
  standalone: boolean;
  mobile: boolean;
}

function detect(): PlatformInfo {
  const ua = navigator.userAgent;
  const tauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const touch = matchMedia('(hover: none) and (pointer: coarse)').matches || 'ontouchstart' in window;
  const android = /Android/i.test(ua);
  const ios = /iPhone|iPad|iPod/i.test(ua) && !/Android/i.test(ua);
  const standalone =
    matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  // Android TV / Fire TV signals
  const tv =
    /AndroidTV|TV;|SMART-TV|SmartTV|FireTV|AFT[A-Z]|BRAVIA|Web0S|Tizen|Xbox/i.test(ua) ||
    (android && !touch && matchMedia('(min-width: 1200px)').matches);

  let os: PlatformInfo['os'] = 'web';
  if (android) os = 'android';
  else if (ios) os = 'ios';
  else if (/Win/i.test(navigator.platform || ua)) os = 'windows';
  else if (/Mac/i.test(navigator.platform || ua)) os = 'macos';
  else if (/Linux|X11/i.test(ua)) os = 'linux';

  const host: HostKind = tauri ? (android || ios ? 'android' : 'desktop') : 'web';
  return {
    host,
    tauri,
    os,
    touch,
    tv,
    standalone,
    mobile: android || ios,
  };
}

export const platform: PlatformInfo = detect();

/** Native-feeling file picker: Tauri dialog when packaged, hidden <input> on the web. */
export async function pickFiles(accept = 'video/*,audio/*,.mkv,.webm,.avi,.mov,.m4v,.ts,.mp4,.mp3,.flac,.wav,.m4a,.opus,.ogg,.aac,.srt,.vtt,.ass,.ssa'): Promise<File[]> {
  if (platform.tauri) {
    try {
      const [{ open }, { convertFileSrc }] = await Promise.all([
        import('@tauri-apps/plugin-dialog'),
        import('@tauri-apps/api/core'),
      ]);
      const res = await open({ multiple: true, directory: false });
      if (!res) return [];
      const paths = Array.isArray(res) ? res : [res];
      // The asset protocol streams straight from disk — no memory copy, any size.
      return paths.map((p) => {
        const name = p.split(/[\\/]/).pop() ?? p;
        const file = new File([], name, { type: guessMime(name) }) as File & { __path?: string; __url?: string };
        file.__path = p;
        file.__url = convertFileSrc(p);
        return file;
      });
    } catch (err) {
      console.warn('[rozh] native dialog unavailable, using the web picker', err);
    }
  }
  return new Promise<File[]>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      resolve(Array.from(input.files ?? []));
      input.remove();
    });
    input.addEventListener('cancel', () => {
      resolve([]);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

const MIME_MAP: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  ts: 'video/mp2t',
  ogv: 'video/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  srt: 'text/plain',
  vtt: 'text/vtt',
  ass: 'text/plain',
  ssa: 'text/plain',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

export function guessMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_MAP[ext] ?? '';
}

export function ext(name: string): string {
  return (name.split('.').pop() ?? '').toLowerCase();
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[._]+/g, ' ').trim();
}

export function isAudioFile(name: string): boolean {
  return /^(mp3|m4a|aac|flac|wav|ogg|opus|wma|aiff?|alac)$/i.test(ext(name));
}

export function isSubtitleFile(name: string): boolean {
  return /^(srt|vtt|ass|ssa|sub)$/i.test(ext(name));
}

export function isImageFile(name: string): boolean {
  return /^(jpe?g|png|webp|gif|avif|bmp|heic)$/i.test(ext(name));
}

/** Native file download (screenshots, frame grabs). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Keyboard-key label that matches what the user actually presses. */
export function isMac(): boolean {
  return /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
}

export function modKey(): string {
  return isMac() ? '⌘' : 'Ctrl';
}

export function haptic(ms = 8): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}

export function isTextEntry(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
