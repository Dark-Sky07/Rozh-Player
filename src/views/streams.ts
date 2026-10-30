/** ROZH Player — live streams and direct links. */

import type { AppContext } from '../core/context';
import { icon, hydrateIcons } from '../core/icons';
import { t } from '../core/i18n';
import { store } from '../core/store';
import { openModal, toast } from '../core/ui';
import { $, $$, escapeHtml, storage } from '../core/util';

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

export function renderStreams(host: HTMLElement, ctx: AppContext): void {
  const recent = storage.get<string[]>(RECENT_KEY, []);
  host.innerHTML = `
    <div class="view-head">
      <div>
        <h2>${t('streams.title')}</h2>
        <p>${t('streams.sub')}</p>
      </div>
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
