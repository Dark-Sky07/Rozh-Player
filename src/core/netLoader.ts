/**
 * ROZH Player — CORS-free network loading for HLS.
 *
 * Browsers and webviews refuse cross-origin `.m3u8` requests unless the origin
 * sends `Access-Control-Allow-Origin`. Plenty of IPTV panels do not, which is
 * the second reason "nothing played" on Android: hls.js could not even read the
 * manifest. The Tauri HTTP plugin performs the request in Rust (outside the
 * webview security model), so we hand that loader to hls.js as a fallback.
 *
 * Everything here is optional: when the plugin is missing (web build, older
 * installs) `nativeHlsLoader()` resolves to `null` and the caller keeps its
 * default behaviour.
 */

import { platform } from './util';

interface HlsCallbacks {
  onSuccess?: (response: unknown, stats: unknown, context: unknown, networkDetails?: unknown) => void;
  onError?: (error: unknown, context: unknown, networkDetails?: unknown, stats?: unknown) => void;
}

interface LoaderContext {
  url: string;
  responseType?: string;
}

interface LoaderBase {
  stats?: Record<string, unknown>;
  destroy?(): void;
  abort?(): void;
}

type FetchLike = (input: string, init?: Record<string, unknown>) => Promise<Response>;

interface HlsNamespace {
  DefaultConfig?: { loader?: new (config: unknown) => LoaderBase };
}

/**
 * Returns a hls.js config fragment (`{ loader }`) that proxies every network
 * request through the native layer, or `null` when that is not possible.
 */
export async function nativeHlsLoader(Hls: unknown): Promise<{ loader: unknown } | null> {
  if (!platform.tauri) return null;

  let tauriFetch: FetchLike | null = null;
  try {
    const mod = (await import('@tauri-apps/plugin-http')) as unknown as { fetch?: FetchLike };
    tauriFetch = mod.fetch ?? null;
  } catch {
    return null;
  }

  const Base = (Hls as HlsNamespace)?.DefaultConfig?.loader;
  if (!tauriFetch || !Base) return null;

  const doFetch = tauriFetch;
  const BaseCtor = Base as new (config: unknown) => LoaderBase;

  class NativeLoader extends BaseCtor {
    private controller: AbortController | null = null;
    private inner: LoaderBase;

    constructor(config: unknown) {
      super(config);
      this.inner = new BaseCtor(config);
    }

    destroy(): void {
      this.inner.destroy?.();
    }

    abort(): void {
      try {
        this.controller?.abort();
      } catch {
        /* ignore */
      }
      this.inner.abort?.();
    }

    getCacheAge(): number | null {
      return null;
    }

    load(context: LoaderContext, _config: unknown, callbacks: HlsCallbacks): void {
      const started = performance.now();
      this.controller = new AbortController();
      const stats = (this.stats ?? this.inner?.stats ?? {}) as Record<string, unknown>;
      const loading = (stats.loading ?? (stats.loading = { start: 0, first: 0, end: 0 })) as Record<string, number>;
      loading.start = started;
      stats.chunkCount = Number(stats.chunkCount ?? 0) + 1;

      doFetch(context.url)
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const bin = context.responseType === 'arraybuffer';
          const data = bin ? await res.arrayBuffer() : await res.text();
          loading.first = performance.now();
          loading.end = loading.first;
          stats.loaded = bin ? (data as ArrayBuffer).byteLength : (data as string).length;
          stats.total = stats.loaded;
          callbacks.onSuccess?.({ url: context.url, data }, stats, context, res);
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          callbacks.onError?.({ code: 0, text: message }, context, null, stats);
        });
    }
  }

  return { loader: NativeLoader as unknown };
}
