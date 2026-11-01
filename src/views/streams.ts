/** ROZH Player — live streams and direct links. */

import type { AppContext } from '../core/context';
import { icon, hydrateIcons } from '../core/icons';
import { t } from '../core/i18n';
import { store } from '../core/store';
import { openModal, toast } from '../core/ui';
import { $, $$, escapeHtml, platform, storage } from '../core/util';

export interface Provider {
  name: string;
  sub: string;
  url: string;
  badge: string;
  /** short label used inside the tile */
  mark: string;
}

export const PROVIDERS: Provider[] = [
  {
    name: 'Apple BipBop ADV',
    sub: 'HLS · fMP4 · multi-bitrate',
    url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8',
    badge: 'HLS',
    mark: 'HLS',
  },
  {
    name: 'Mux test stream',
    sub: 'HLS · adaptive 240p → 1080p',
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    badge: 'HLS',
    mark: 'MUX',
  },
  {
    name: 'Big Buck Bunny',
    sub: 'DASH · 30 fps',
    url: 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd',
    badge: 'DASH',
    mark: 'DASH',
  },
  {
    name: 'Sintel trailer',
    sub: 'MP4 · progressive',
    url: 'https://test-videos.co.uk/vids/sintel/mp4/h264/720/Sintel_720_10s_1MB.mp4',
    badge: 'MP4',
    mark: 'MP4',
  },
  {
    name: 'SomaFM · Groove Salad',
    sub: 'MP3 radio · ambient',
    url: 'https://ice1.somafm.com/groovesalad-128-mp3',
    badge: 'RADIO',
    mark: 'FM',
  },
  {
    name: 'ROZH Aurora',
    sub: 'Bundled demo reel · 18 s',
    url: '/demo/aurora.mp4',
    badge: 'DEMO',
    mark: 'R',
  },
];

const RECENT_KEY = 'streams.recent';

/** Clean, validated URL or null. Accepts bare hosts by adding https:// */
export function normalizeUrl(raw: string): string | null {
  let value = raw.trim();
  if (!value || value.length > 8192) return null;
  if (!/^[a-z]+:\/\//i.test(value)) value = `https://${value}`;
  try {
    const u = new URL(value);
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function pushRecent(url: string): void {
  const list = storage.get<string[]>(RECENT_KEY, []);
  const next = [url, ...list.filter((u) => u !== url)].slice(0, 8);
  storage.set(RECENT_KEY, next);
}

export function openUrlModal(onOpen: (url: string, title?: string) => void): void {
  const recent = storage.get<string[]>(RECENT_KEY, []);
  const close = openModal({
    title: t('player.openUrl'),
    icon: 'link',
    body: `
      <div class="field" style="height:48px">
        ${icon('link')}
        <input type="url" inputmode="url" dir="ltr" placeholder="${escapeHtml(
          t('streams.placeholder'),
        )}" data-url autofocus />
      </div>
      <p class="modal-hint">${t('streams.hint')}</p>
      <div class="row" style="gap:6px;flex-wrap:wrap">
        ${['m3u8', 'mpd', 'mp4', 'mkv', 'webm', 'mp3', 'flac', 'ts']
          .map((p) => `<span class="badge muted">.${p}</span>`)
          .join('')}
      </div>
      ${
        recent.length
          ? `<div class="box-title" style="margin-top:6px">${icon('history')}<span>${escapeHtml(
              t('streams.recent'),
            )}</span></div>
             <div class="opt-list">
               ${recent
                 .map(
                   (u) => `<button class="opt-row" data-recent="${encodeURIComponent(u)}">
                     ${icon('link')}<span class="op-label" style="direction:ltr">${escapeHtml(u)}</span>
                   </button>`,
                 )
                 .join('')}
             </div>`
          : ''
      }`,
    footer: `<button class="btn" data-close>${escapeHtml(t('common.cancel'))}</button>
             <button class="btn btn-primary" data-go>${icon('play')}<span>${escapeHtml(t('streams.open'))}</span></button>`,
    onMount: (root, closeFn) => {
      const input = $('[data-url]', root) as HTMLInputElement;
      const go = (): void => {
        const url = normalizeUrl(input.value);
        if (!url) {
          toast(t('streams.invalid'), 'bad');
          input.focus();
          return;
        }
        pushRecent(url);
        closeFn();
        onOpen(url, decodeURIComponent(url.split('/').pop() || url));
      };
      $('[data-go]', root)?.addEventListener('click', go);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') go();
      });
      $$('[data-recent]', root).forEach((btn) =>
        btn.addEventListener('click', () => {
          input.value = decodeURIComponent((btn as HTMLElement).dataset.recent!);
          go();
        }),
      );
      setTimeout(() => input.focus(), 120);
    },
  });
  void close;
}

export interface M3UChannel {
  title: string;
  url: string;
  group?: string;
  logo?: string;
  tvgId?: string;
}

/** Parse a basic M3U / M3U8 channel list, preserving common IPTV metadata. */
export function parseM3U(text: string, baseUrl?: string): M3UChannel[] {
  if (text.length > 5 * 1024 * 1024) return [];
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const channels: M3UChannel[] = [];
  const seen = new Set<string>();
  let info = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      info = line;
      continue;
    }
    if (line.startsWith('#') || !info) continue;
    let resolved = line;
    try {
      if (baseUrl) resolved = new URL(line, baseUrl).toString();
    } catch {
      info = '';
      continue;
    }
    if (!baseUrl && !/^https?:\/\//i.test(resolved)) {
      info = '';
      continue;
    }
    const url = normalizeUrl(resolved);
    if (!url || seen.has(url)) {
      info = '';
      continue;
    }
    let comma = -1;
    let inQuotes = false;
    for (let index = 0; index < info.length; index += 1) {
      if (info[index] === '"') inQuotes = !inQuotes;
      else if (info[index] === ',' && !inQuotes) {
        comma = index;
        break;
      }
    }
    const attr = (name: string): string | undefined => {
      const match = info.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`, 'i'));
      return match?.[1]?.trim() || undefined;
    };
    let title = comma >= 0 ? info.slice(comma + 1).trim() : '';
    title ||= attr('tvg-name') || (() => {
      try { return new URL(url).hostname; } catch { return url; }
    })();
    const group = attr('group-title');
    const rawLogo = attr('tvg-logo');
    const logo = rawLogo ? normalizeUrl(rawLogo) ?? undefined : undefined;
    const tvgId = attr('tvg-id') || attr('channel-id');
    seen.add(url);
    channels.push({
      title: title.slice(0, 200),
      url,
      ...(group ? { group: group.slice(0, 120) } : {}),
      ...(logo ? { logo } : {}),
      ...(tvgId ? { tvgId: tvgId.slice(0, 160) } : {}),
    });
    info = '';
    if (channels.length >= 500) break;
  }
  return channels;
}

export function parseM3UEpgUrl(text: string, baseUrl?: string): string | undefined {
  const header = text.replace(/^\uFEFF/, '').split(/\r?\n/).find((line) => line.trim().startsWith('#EXTM3U'))?.trim();
  if (!header) return undefined;
  const match = header.match(/(?:url-tvg|x-tvg-url|tvg-url)="([^"]+)"/i);
  const raw = match?.[1]?.split(',')[0]?.trim();
  if (!raw) return undefined;
  try {
    return normalizeUrl(baseUrl ? new URL(raw, baseUrl).toString() : raw) ?? undefined;
  } catch {
    return undefined;
  }
}

function openM3UImport(ctx: AppContext): void {
  openModal({
    title: t('streams.importPlaylist'),
    icon: 'list-video',
    width: 640,
    body: `<label class="form-label">${escapeHtml(t('streams.playlistUrl'))}</label>
      <input class="input" type="url" inputmode="url" dir="ltr" data-m3u-url placeholder="https://example.com/playlist.m3u" />
      <label class="form-label" style="margin-top:14px">${escapeHtml(t('streams.playlistName'))}</label>
      <input class="input" data-m3u-name maxlength="80" placeholder="${escapeHtml(t('streams.playlistName'))}" />
      <label class="form-label" style="margin-top:14px">${escapeHtml(t('streams.epgUrl'))}</label>
      <input class="input" type="url" inputmode="url" dir="ltr" data-m3u-epg placeholder="https://example.com/guide.xml" />
      <p class="modal-hint">${escapeHtml(t('streams.epgHint'))}</p>
      <label class="form-label" style="margin-top:14px">${escapeHtml(t('streams.chooseFile'))}</label>
      <input class="input" type="file" accept=".m3u,.m3u8,audio/x-mpegurl,application/vnd.apple.mpegurl,text/plain" data-m3u-file />
      <p class="modal-hint">M3U / M3U8 · HTTP(S) links only · up to 500 channels</p>`,
    footer: `<button class="btn" data-m3u-cancel>${escapeHtml(t('common.cancel'))}</button><button class="btn btn-primary" data-m3u-import>${icon(
      'download',
    )}<span>${escapeHtml(t('streams.import'))}</span></button>`,
    onMount: (root, close) => {
      const urlInput = $('[data-m3u-url]', root) as HTMLInputElement | null;
      const nameInput = $('[data-m3u-name]', root) as HTMLInputElement | null;
      const epgInput = $('[data-m3u-epg]', root) as HTMLInputElement | null;
      const fileInput = $('[data-m3u-file]', root) as HTMLInputElement | null;
      const importButton = $('[data-m3u-import]', root) as HTMLButtonElement | null;
      let fileText: string | null = null;
      let fileName = '';
      $('[data-m3u-cancel]', root)?.addEventListener('click', close);
      fileInput?.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) {
          fileText = null;
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          fileInput.value = '';
          fileText = null;
          toast(t('streams.fileTooLarge'), 'warn');
          return;
        }
        try {
          fileText = await file.text();
          fileName = file.name.replace(/\.(m3u8?)$/i, '');
          if (nameInput && !nameInput.value) nameInput.value = fileName;
          if (epgInput && !epgInput.value) epgInput.value = parseM3UEpgUrl(fileText) ?? '';
        } catch {
          fileText = null;
          toast(t('streams.importError'), 'bad');
        }
      });
      importButton?.addEventListener('click', async () => {
        if (!importButton || !urlInput || !nameInput) return;
        importButton.disabled = true;
        let text = fileText ?? '';
        let baseUrl: string | undefined;
        let inferredName = fileName;
        try {
          if (fileText === null) {
            const url = normalizeUrl(urlInput.value);
            if (!url) throw new Error('invalid-url');
            const init = { headers: { Accept: 'application/vnd.apple.mpegurl, audio/x-mpegurl, text/plain, */*' } };
            const response = platform.tauri
              ? await (await import('@tauri-apps/plugin-http')).fetch(url, init)
              : await fetch(url, init);
            if (!response.ok) throw new Error('http');
            const size = Number(response.headers.get('content-length') ?? 0);
            if (size > 5 * 1024 * 1024) throw new Error('large');
            text = await response.text();
            if (text.length > 5 * 1024 * 1024) throw new Error('large');
            baseUrl = response.url || url;
            if (epgInput && !epgInput.value) epgInput.value = parseM3UEpgUrl(text, baseUrl) ?? '';
            try {
              inferredName = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '');
              inferredName = inferredName.replace(/\.(m3u8?)$/i, '');
            } catch {
              inferredName = '';
            }
          }
          const channels = parseM3U(text, baseUrl);
          if (!channels.length) {
            toast(t('streams.importEmpty'), 'warn');
            importButton.disabled = false;
            return;
          }
          const rawEpgUrl = epgInput?.value.trim() ?? '';
          const epgUrl = rawEpgUrl ? normalizeUrl(rawEpgUrl) : parseM3UEpgUrl(text, baseUrl);
          if (rawEpgUrl && !epgUrl) throw new Error('invalid-epg-url');
          const playlist = store.createPlaylist(nameInput.value || inferredName || t('streams.importPlaylist'), { epgUrl: epgUrl ?? undefined });
          if (!playlist) throw new Error('playlist-name');
          channels.forEach((channel) => {
            const item = store.addMedia({
              name: channel.title,
              title: channel.title,
              kind: /\.(mp3|m4a|aac|flac|wav|ogg|opus)(?:[?#]|$)/i.test(channel.url) ? 'audio' : 'stream',
              source: 'url',
              url: channel.url,
              thumb: channel.logo,
              bucket: channel.group,
              tvgId: channel.tvgId,
              guidePlaylistId: playlist.id,
              ext: 'm3u',
              inLibrary: true,
            });
            store.addToPlaylist(playlist.id, item.id);
          });
          close();
          toast(t('streams.importSuccess', { count: channels.length }), 'ok', 3200);
          ctx.refreshNav();
          const live = document.querySelector<HTMLElement>('.view[data-view="streams"].is-active');
          if (live) renderStreams(live, ctx);
        } catch (error) {
          importButton.disabled = false;
          toast(error instanceof Error && error.message === 'large' ? t('streams.fileTooLarge') : t('streams.importError'), 'bad', 3000);
        }
      });
    },
  });
}

export function renderStreams(host: HTMLElement, ctx: AppContext): void {
  const recent = storage.get<string[]>(RECENT_KEY, []);
  host.innerHTML = `
    <div class="view-head">
      <div>
        <h2>${t('streams.title')}</h2>
        <p>${t('streams.sub')}</p>
      </div>
      <div class="spacer"></div>
      ${platform.tv ? `<button class="btn btn-primary" data-import-m3u>${icon('list-video')}<span>${escapeHtml(t('streams.importPlaylist'))}</span></button>` : ''}
    </div>

    <form class="stream-form" data-form>
      <div class="field">
        ${icon('link')}
        <input type="url" inputmode="url" dir="ltr" placeholder="${escapeHtml(
          t('streams.placeholder'),
        )}" data-input aria-label="${escapeHtml(t('streams.custom'))}" />
      </div>
      <button class="btn btn-primary" type="submit">${icon('play')}<span>${t('streams.open')}</span></button>
    </form>

    <div class="toolbar" style="margin-top:-6px">
      ${['HLS', 'DASH', 'MP4', 'MKV', 'WebM', 'MP3', 'FLAC', 'Radio']
        .map((p) => `<span class="badge muted">${p}</span>`)
        .join('')}
    </div>

    <div class="box-title" style="margin:8px 0 10px">
      ${icon('broadcast')}<span>${escapeHtml(t('streams.providers'))}</span>
    </div>
    <div class="stream-grid">
      ${PROVIDERS.map(
        (p, i) => `<button class="provider" data-provider="${i}">
          <span class="provider-logo">${escapeHtml(p.mark)}</span>
          <span class="provider-meta">
            <span class="provider-name">${escapeHtml(p.name)}</span>
            <span class="provider-sub">${escapeHtml(p.sub)}</span>
          </span>
          <span class="badge muted">${p.badge}</span>
        </button>`,
      ).join('')}
    </div>

    ${
      recent.length
        ? `<div class="box-title" style="margin:22px 0 10px">${icon('history')}<span>${escapeHtml(
            t('streams.recent'),
          )}</span></div>
           <div class="history-list">
             ${recent
               .map(
                 (u) => `<button class="history-item" data-url-item="${encodeURIComponent(u)}">
                   <span class="history-thumb"><span class="ph">${icon('link')}</span></span>
                   <span class="history-meta">
                     <span class="ht" style="direction:ltr;text-align:left">${escapeHtml(u)}</span>
                     <span class="hs">${escapeHtml(t('player.stream'))}</span>
                   </span>
                   <span class="history-time">${icon('play')}</span>
                 </button>`,
               )
               .join('')}
           </div>`
        : ''
    }`;

  hydrateIcons(host);
  $('[data-import-m3u]', host)?.addEventListener('click', () => openM3UImport(ctx));

  const form = $('[data-form]', host) as HTMLFormElement;
  const input = $('[data-input]', host) as HTMLInputElement;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = normalizeUrl(input.value);
    if (!url) {
      toast(t('streams.invalid'), 'bad');
      return;
    }
    pushRecent(url);
    const title = decodeURIComponent(url.split('/').pop() || url);
    ctx.playPlayable({
      key: `url::${url}`,
      name: title,
      title,
      url,
      isStream: true,
      kind: /\.(mp3|m4a|aac|flac|wav|ogg|opus)$/i.test(url) ? 'audio' : /\.(m3u8|mpd)$/i.test(url) ? 'stream' : 'video',
      size: 0,
    });
    renderStreams(host, ctx);
  });

  $$('[data-provider]', host).forEach((btn) =>
    btn.addEventListener('click', () => {
      const p = PROVIDERS[Number((btn as HTMLElement).dataset.provider)];
      if (!p) return;
      pushRecent(p.url);
      const isAudio = /radio|mp3/i.test(p.badge);
      void ctx.playPlayable({
        key: `url::${p.url}`,
        name: p.name,
        title: p.name,
        url: p.url,
        isStream: true,
        kind: isAudio ? 'audio' : p.badge === 'HLS' || p.badge === 'DASH' ? 'stream' : 'video',
        size: 0,
      });
    }),
  );

  $$('[data-url-item]', host).forEach((btn) =>
    btn.addEventListener('click', () => {
      const url = decodeURIComponent((btn as HTMLElement).dataset.urlItem!);
      void ctx.playPlayable({
        key: `url::${url}`,
        name: url,
        title: decodeURIComponent(url.split('/').pop() || url),
        url,
        isStream: true,
        kind: 'stream',
        size: 0,
      });
    }),
  );
}

/** Save a stream into the library so it survives restarts. */
export function rememberStream(url: string, title: string): void {
  store.addMedia({
    name: title,
    title,
    kind: 'stream',
    source: 'url',
    url,
    inLibrary: true,
  });
}
