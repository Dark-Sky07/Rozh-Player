/** ROZH Player — settings, with live previews and instant apply. */

import type { AppContext } from '../core/context';
import { icon, hydrateIcons } from '../core/icons';
import { t, n } from '../core/i18n';
import { LANGS } from '../core/langs';
import { isAndroidDevice, pickDeviceFolder, syncDeviceLibrary } from '../core/device';
import { store, type Accent } from '../core/store';
import { confirmDialog, toast } from '../core/ui';
import { $, $$, escapeHtml, fmtBytes } from '../core/util';

const ACCENTS: { id: Accent; color: string }[] = [
  { id: 'ember', color: 'linear-gradient(135deg,#ffd88f,#f7a94f,#d97528)' },
  { id: 'crimson', color: 'linear-gradient(135deg,#ffc0ae,#ff7a72,#c0352f)' },
  { id: 'azure', color: 'linear-gradient(135deg,#c6e0ff,#6ba8ff,#2b5bd7)' },
  { id: 'jade', color: 'linear-gradient(135deg,#c8ffe9,#55d6a4,#178a63)' },
  { id: 'violet', color: 'linear-gradient(135deg,#e6d8ff,#b28bff,#6a3fd1)' },
];

const SUB_COLORS = ['#ffffff', '#ffe9a8', '#ffd166', '#a8e6ff', '#b6ffcf', '#ffb3c1'];

function row(label: string, hint: string, control: string): string {
  return `<div class="setting-row">
    <div class="sr-label"><b>${escapeHtml(label)}</b>${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</div>
    <div class="sr-ctrl">${control}</div>
  </div>`;
}

function sw(on: boolean, attr: string): string {
  return `<button class="switch" role="switch" aria-checked="${on}" ${attr}></button>`;
}

function seg(
  options: { id: string; label: string }[],
  active: string,
  attr: string,
): string {
  return `<div class="seg" ${attr}>${options
    .map((o) => `<button data-v="${o.id}" class="${o.id === active ? 'is-active' : ''}">${escapeHtml(o.label)}</button>`)
    .join('')}</div>`;
}

function codecSupport(): { label: string; ok: boolean }[] {
  const probe = document.createElement('video');
  const tests: [string, string[]][] = [
    ['H.264 / MP4', ['video/mp4; codecs="avc1.42E01E"', 'video/mp4']],
    ['H.265 / HEVC', ['video/mp4; codecs="hvc1.1.6.L93.B0"']],
    ['VP9 / WebM', ['video/webm; codecs="vp9"']],
    ['AV1', ['video/mp4; codecs="av01.0.05M.08"']],
    ['AVI', ['video/x-msvideo', 'video/avi']],
    ['MKV', ['video/x-matroska']],
    ['MP3', ['audio/mpeg']],
    ['AAC / M4A', ['audio/mp4; codecs="mp4a.40.2"', 'audio/aac']],
    ['FLAC', ['audio/flac', 'audio/x-flac']],
    ['Opus', ['audio/ogg; codecs="opus"', 'audio/opus']],
    ['WAV', ['audio/wav']],
  ];
  return tests.map(([label, mimes]) => ({ label, ok: mimes.some((m) => !!probe.canPlayType(m)) }));
}

export function renderSettings(host: HTMLElement, ctx: AppContext): void {
  const s = store.settings;
  const support = codecSupport();

  host.innerHTML = `
    <div class="view-head">
      <div>
        <h2>${t('settings.title')}</h2>
        <p>${t('settings.sub')}</p>
      </div>
      <div class="spacer"></div>
      <button class="btn btn-sm" data-reset>${icon('rotateccw')}<span>${t('settings.resetBtn')}</span></button>
    </div>

    <nav class="settings-jump" aria-label="${t('settings.title')}">
      <button data-jump="sec-appearance" class="is-on">${icon('palette')}<span>${t('settings.appearance')}</span></button>
      <button data-jump="sec-playback">${icon('play')}<span>${t('settings.playback')}</span></button>
      <button data-jump="sec-video">${icon('monitor')}<span>${t('settings.video')}</span></button>
      <button data-jump="sec-gestures">${icon('target')}<span>${t('settings.gestures')}</span></button>
      <button data-jump="sec-subtitles">${icon('subtitles')}<span>${t('settings.subtitles')}</span></button>
      <button data-jump="sec-audio">${icon('audio-wave')}<span>${t('settings.audio')}</span></button>
      <button data-jump="sec-about">${icon('info')}<span>${t('settings.about')}</span></button>
    </nav>

    <div class="settings-wrap">
      <section class="setting-group" id="sec-appearance">
        <header>${icon('palette')}<h3>${t('settings.appearance')}</h3></header>
        ${row(
          t('settings.accent'),
          t('settings.accentSub'),
          `<div class="swatches" data-swatches>${ACCENTS.map(
            (a) =>
              `<button class="swatch ${a.id === s.accent ? 'is-active' : ''}" data-accent-id="${a.id}" style="background:${
                a.color
              }" aria-label="${a.id}"></button>`,
          ).join('')}</div>`,
        )}
        ${row(
          t('settings.glass'),
          t('settings.glassSub'),
          seg(
            [
              { id: 'soft', label: t('settings.glass.soft') },
              { id: 'balanced', label: t('settings.glass.balanced') },
              { id: 'bold', label: t('settings.glass.bold') },
            ],
            s.glass,
            'data-glass',
          ),
        )}
        ${row(
          t('settings.motion'),
          t('settings.motionSub'),
          seg(
            [
              { id: 'full', label: t('settings.motion.full') },
              { id: 'reduced', label: t('settings.motion.reduced') },
            ],
            s.motion,
            'data-motion',
          ),
        )}
        <div class="setting-block">
          <div class="sr-label"><b>${t('settings.language')}</b><small>${t('settings.langSub')}</small></div>
          <label class="lang-search">
            ${icon('search')}
            <input type="search" data-lang-filter placeholder="${t('settings.langFilter')}" aria-label="${t(
              'settings.langFilter',
            )}" />
            <span class="badge mono">${n(LANGS.length)}</span>
          </label>
          <div class="lang-grid" data-lang-list>
            ${LANGS.map(
              (l) => `<button class="lang-cell ${s.lang === l.code ? 'is-on' : ''}" data-lang-id="${l.code}" data-lang-search="${escapeHtml(
                `${l.name} ${l.en} ${l.code}`.toLowerCase(),
              )}">
                <span class="lc-name">${escapeHtml(l.name)}</span>
                <span class="lc-meta">${l.rtl ? 'RTL' : 'LTR'} · ${
                  l.coverage === 'full' ? t('settings.langFull') : t('settings.langPartial')
                }</span>
              </button>`,
            ).join('')}
          </div>
          <p class="lang-note">${t('settings.langNote')}</p>
        </div>
        ${row(t('settings.embers'), t('settings.embersSub'), sw(s.showEmbers, 'data-embers'))}
      </section>

      ${
        isAndroidDevice()
          ? `<section class="setting-group" id="sec-device">
        <header>${icon('smartphone')}<h3>${t('device.title')}</h3></header>
        ${row(t('device.auto'), t('device.autoSub'), sw(s.autoIndex, 'data-autoindex'))}
        ${row(t('device.audio'), t('device.audioSub'), sw(s.indexAudio, 'data-indexaudio'))}
        <div class="setting-row">
          <div class="sr-label"><b>${t('device.scan')}</b><small>${t('device.count', {
            n: n(store.deviceCount()),
          })}</small></div>
          <div class="sr-ctrl row" style="gap:8px">
            <button class="btn btn-sm" data-devscan>${icon('rotateccw')}<span>${t('device.scan')}</span></button>
            <button class="btn btn-sm" data-devfolder>${icon('folder')}<span>${t('device.folder')}</span></button>
          </div>
        </div>
      </section>`
          : ''
      }

      <section class="setting-group" id="sec-playback">
        <header>${icon('play')}<h3>${t('settings.playback')}</h3></header>
        ${row(t('settings.autoplay'), t('settings.autoplaySub'), sw(s.autoplay, 'data-autoplay'))}
        ${row(t('settings.resume'), t('settings.resumeSub'), sw(s.resume, 'data-resume'))}
        ${row(
          t('settings.seekStep'),
          `${t('settings.seekStepSub')} · ${s.seekStep}s`,
          `<input class="range" type="range" min="2" max="30" step="1" value="${s.seekStep}" data-seek />`,
        )}
        ${row(
          t('settings.volumeStep'),
          `${Math.round(s.volumeStep * 100)}%`,
          `<input class="range" type="range" min="1" max="20" step="1" value="${Math.round(
            s.volumeStep * 100,
          )}" data-volstep />`,
        )}
        ${row(
          t('settings.tv'),
          t('settings.tvSub'),
          seg(
            [
              { id: 'auto', label: t('settings.tv.auto') },
              { id: 'on', label: t('settings.tv.on') },
              { id: 'off', label: t('settings.tv.off') },
            ],
            s.tv,
            'data-tv',
          ),
        )}
        ${row(
          t('settings.thumbnails'),
          t('settings.thumbnailsSub'),
          sw(s.thumbnails, 'data-thumbs'),
        )}
        ${row(
          t('settings.screenshot'),
          '',
          seg(
            [
              { id: 'png', label: 'PNG' },
              { id: 'jpeg', label: 'JPEG' },
            ],
            s.screenshotFormat,
            'data-shot',
          ),
        )}
      </section>

      <section class="setting-group" id="sec-video">
        <header>${icon('monitor')}<h3>${t('settings.video')}</h3></header>
        ${row(
          t('player.aspect'),
          t('settings.videoSub'),
          seg(
            [
              { id: 'auto', label: t('player.aspect.auto') },
              { id: '16:9', label: '16:9' },
              { id: '4:3', label: '4:3' },
              { id: '21:9', label: '21:9' },
              { id: 'fill', label: t('player.aspect.fill') },
            ],
            s.aspect,
            'data-aspect-set',
          ),
        )}
        ${row(
          t('player.rotate'),
          `${n(s.rotate)}°`,
          `<div class="row-btns">
             <button class="btn btn-sm" data-rotate>${icon('rotate')}${n(90)}°</button>
             <button class="btn btn-sm ${s.flipH ? 'is-on' : ''}" data-flip="h">${t('player.flipH')}</button>
             <button class="btn btn-sm ${s.flipV ? 'is-on' : ''}" data-flip="v">${t('player.flipV')}</button>
           </div>`,
        )}
        ${row(
          t('player.effects'),
          t('player.effectsSub'),
          `<button class="btn btn-sm" data-effects>${icon('sliders')}${t('player.effects')}</button>`,
        )}
        ${row(t('settings.lockSub'), '', sw(s.lock, 'data-lock'))}
      </section>

      <section class="setting-group" id="sec-gestures">
        <header>${icon('target')}<h3>${t('settings.gestures')}</h3></header>
        ${row(t('settings.doubleTap'), t('settings.doubleTapSub'), sw(s.doubleTapSeek, 'data-dtap'))}
        ${row(t('settings.longPress'), t('settings.longPressSub'), sw(s.longPressBoost, 'data-lpress'))}
        ${row(t('settings.stats'), t('settings.statsSub'), sw(s.stats, 'data-stats'))}
        ${row(
          t('settings.frameStep'),
          `${n(s.frameStepMs)} ms`,
          seg(
            [
              { id: '33', label: '30fps' },
              { id: '40', label: '25fps' },
              { id: '50', label: '20fps' },
              { id: '66', label: '15fps' },
            ],
            String(s.frameStepMs),
            'data-frame-step',
          ),
        )}
        ${row(
          t('settings.sleep'),
          s.sleepTimer ? `${n(s.sleepTimer)} ${t('settings.minutes')}` : t('settings.sleepSub'),
          seg(
            [
              { id: '0', label: t('common.off') },
              { id: '15', label: '15' },
              { id: '30', label: '30' },
              { id: '60', label: '60' },
            ],
            String(s.sleepTimer),
            'data-sleep-set',
          ),
        )}
      </section>

      <section class="setting-group" id="sec-subtitles">
        <header>${icon('subtitles')}<h3>${t('settings.subtitles')}</h3></header>
        <div class="setting-row">
          <div class="sub-style-preview" style="flex:1">
            <span style="
              color:${s.subColor};
              font-size:calc(${Math.round(s.subSize / 100)}em * 1.1);
              text-shadow:${
                s.subFontStyle === 'outline'
                  ? '-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000'
                  : s.subFontStyle === 'shadow'
                    ? '0 3px 10px rgba(0,0,0,.95)'
                    : '0 2px 6px rgba(0,0,0,.8)'
              };
              background:${s.subFontStyle === 'box' ? `rgba(0,0,0,${s.subBg / 100})` : 'transparent'};
              padding:${s.subFontStyle === 'box' ? '4px 10px' : '0'};
              border-radius:6px;
            ">${escapeHtml(t('settings.subPreviewText'))}</span>
          </div>
        </div>
        ${row(
          t('settings.subSize'),
          `${s.subSize}%`,
          `<input class="range" type="range" min="60" max="200" step="5" value="${s.subSize}" data-subsize />`,
        )}
        ${row(
          t('settings.subColor'),
          '',
          `<div class="swatches" data-subcolors>${SUB_COLORS.map(
            (c) =>
              `<button class="swatch ${c.toLowerCase() === s.subColor.toLowerCase() ? 'is-active' : ''}" data-sub-col="${c}" style="background:${c}" aria-label="${c}"></button>`,
          ).join('')}</div>`,
        )}
        ${row(
          t('settings.subStyle'),
          '',
          seg(
            [
              { id: 'outline', label: t('settings.subStyle.outline') },
              { id: 'shadow', label: t('settings.subStyle.shadow') },
              { id: 'box', label: t('settings.subStyle.box') },
            ],
            s.subFontStyle,
            'data-substyle',
          ),
        )}
      </section>

      <section class="setting-group" id="sec-audio">
        <header>${icon('sliders')}<h3>${t('settings.audio')}</h3></header>
        ${row(
          t('settings.eq'),
          t('settings.eqSub'),
          `<button class="btn btn-sm" data-eq>${icon('sliders')}<span>${escapeHtml(t('player.equalizer'))}</span></button>`,
        )}
        ${row(t('settings.sdr'), t('settings.sdrSub'), sw(s.sdrBoost, 'data-sdr'))}
        <div class="setting-row" style="align-items:flex-start">
          <div class="sr-label"><b>${t('streams.protocols')}</b><small>${t('settings.hw')}</small></div>
        </div>
        <div class="setting-row" style="flex-wrap:wrap;gap:8px;padding-top:0">
          ${support
            .map(
              (c) =>
                `<span class="badge ${c.ok ? '' : 'muted'}" title="${c.ok ? 'supported' : 'unsupported'}">${
                  c.ok ? '✓' : '✕'
                } ${escapeHtml(c.label)}</span>`,
            )
            .join('')}
        </div>
      </section>

      <section class="setting-group" id="sec-about">
        <header>${icon('info')}<h3>${t('settings.about')}</h3></header>
        <div class="setting-row">
          <div class="sr-label"><b>${t('nav.shortcuts')}</b><small>${t('view.shortcuts.sub')}</small></div>
          <div class="sr-ctrl row" style="gap:8px">
            <button class="btn btn-sm" data-goto-shortcuts>${icon('keyboard')}<span>${t('nav.shortcuts')}</span></button>
            <button class="btn btn-sm" data-goto-about>${icon('info')}<span>${t('nav.about')}</span></button>
          </div>
        </div>
        ${row(t('settings.version'), 'ROZH Player', `<span class="badge mono">v${__APP_VERSION__}</span>`)}
        ${row(
          t('settings.platform'),
          '',
          `<span class="badge mono">${escapeHtml(platformLabel())}</span>`,
        )}
        ${row(
          t('settings.storage'),
          '',
          `<span class="badge muted mono">${store.media.length} · ${fmtBytes(
            store.media.reduce((acc, m) => acc + (m.size || 0), 0),
          )}</span>`,
        )}
        ${row(t('settings.reset'), t('settings.resetSub'), `<button class="btn btn-danger btn-sm" data-reset>${escapeHtml(
          t('settings.resetBtn'),
        )}</button>`)}
      </section>
    </div>`;

  hydrateIcons(host);

  const rerender = (): void => renderSettings(host, ctx);

  $$('[data-accent-id]', host).forEach((btn) =>
    btn.addEventListener('click', () => {
      store.patch({ accent: (btn as HTMLElement).dataset.accentId as Accent });
      $$('[data-accent-id]', host).forEach((b) => b.classList.toggle('is-active', b === btn));
    }),
  );

  const viewEl = host.closest('.view');
  $$('[data-jump]', host).forEach((btn) =>
    btn.addEventListener('click', () => {
      const target = document.getElementById((btn as HTMLElement).dataset.jump!);
      if (!target || !viewEl) return;
      // leave room for the sticky jump bar so the section title stays visible
      const top = (target as HTMLElement).offsetTop - (viewEl as HTMLElement).offsetTop - 74;
      viewEl.scrollTo({ top, behavior: 'smooth' });
      $$('[data-jump]', host).forEach((b) => b.classList.toggle('is-on', b === btn));
    }),
  );

  const bindSeg = (attr: string, apply: (v: string) => void): void => {
    $$(`[${attr}] button`, host).forEach((btn) =>
      btn.addEventListener('click', () => {
        const v = (btn as HTMLElement).dataset.v!;
        apply(v);
        $$(`[${attr}] button`, host).forEach((b) => b.classList.toggle('is-active', b === btn));
      }),
    );
  };

  bindSeg('data-glass', (v) => store.patch({ glass: v as typeof s.glass }));
  bindSeg('data-motion', (v) => store.patch({ motion: v as typeof s.motion }));
  bindSeg('data-tv', (v) => store.patch({ tv: v as typeof s.tv }));
  bindSeg('data-aspect-set', (v) => {
    store.patch({ aspect: v as typeof s.aspect });
    ctx.player.applyAspect();
  });
  bindSeg('data-frame-step', (v) => {
    store.patch({ frameStepMs: Number(v) });
    rerender();
  });
  bindSeg('data-sleep-set', (v) => {
    ctx.player.setSleep(Number(v));
    rerender();
  });

  $<HTMLInputElement>('[data-lang-filter]', host)?.addEventListener('input', (e) => {
    const q = (e.target as HTMLInputElement).value.trim().toLowerCase();
    $$('[data-lang-id]', host).forEach((cell) => {
      const hay = (cell as HTMLElement).dataset.langSearch ?? '';
      cell.toggleAttribute('hidden', !!q && !hay.includes(q));
    });
  });

  $$('[data-lang-id]', host).forEach((btn) =>
    btn.addEventListener('click', () => {
      const code = (btn as HTMLElement).dataset.langId as typeof s.lang;
      if (code === store.settings.lang) return;
      store.patch({ lang: code });
      window.dispatchEvent(new CustomEvent('rozh:relang'));
    }),
  );

  $('[data-rotate]', host)?.addEventListener('click', () => {
    ctx.player.rotate();
    rerender();
  });

  $$('[data-flip]', host).forEach((btn) =>
    btn.addEventListener('click', () => {
      ctx.player.toggleFlip((btn as HTMLElement).dataset.flip === 'h' ? 'h' : 'v');
      (btn as HTMLElement).classList.toggle('is-on');
    }),
  );

  $('[data-effects]', host)?.addEventListener('click', () => {
    ctx.navigate('player');
    setTimeout(() => document.querySelector<HTMLElement>('.stage-bottom [data-act="tools"]')?.click(), 220);
  });
  bindSeg('data-shot', (v) => store.patch({ screenshotFormat: v as 'png' | 'jpeg' }));
  bindSeg('data-substyle', (v) => {
    store.patch({ subFontStyle: v as typeof s.subFontStyle });
    ctx.player.applySubtitleStyle();
    rerender();
  });

  const bindSwitch = (attr: string, apply: (on: boolean) => void): void => {
    const el = $(`[${attr}]`, host);
    el?.addEventListener('click', () => {
      const on = el.getAttribute('aria-checked') !== 'true';
      el.setAttribute('aria-checked', String(on));
      apply(on);
    });
  };
  bindSwitch('data-autoindex', (on) => store.patch({ autoIndex: on }));
  bindSwitch('data-indexaudio', (on) => {
    store.patch({ indexAudio: on });
    void syncDeviceLibrary({ reason: 'manual', silent: true });
  });
  $('[data-goto-shortcuts]', host)?.addEventListener('click', () => ctx.navigate('shortcuts'));
  $('[data-goto-about]', host)?.addEventListener('click', () => ctx.navigate('about'));

  $('[data-devscan]', host)?.addEventListener('click', () => {
    toast(t('device.scanning'), 'info', 1600);
    void syncDeviceLibrary({ reason: 'manual' }).then(() => rerender());
  });
  $('[data-devfolder]', host)?.addEventListener('click', () => {
    void pickDeviceFolder().then((status) => {
      if (status?.state === 'ready') toast(t('device.ready', { n: n(store.deviceCount()) }), 'ok', 2200);
      else if (status?.state === 'cancelled') toast(t('device.cancelled'), 'info', 1800);
      rerender();
    });
  });

  bindSwitch('data-autoplay', (on) => store.patch({ autoplay: on }));
  bindSwitch('data-resume', (on) => store.patch({ resume: on }));
  bindSwitch('data-thumbs', (on) => store.patch({ thumbnails: on }));
  bindSwitch('data-sdr', (on) => {
    store.patch({ sdrBoost: on });
    ctx.player.applyEffects();
  });
  bindSwitch('data-lock', (on) => {
    store.patch({ lock: on });
    if (on) ctx.player.toggleLock();
  });
  bindSwitch('data-dtap', (on) => store.patch({ doubleTapSeek: on }));
  bindSwitch('data-lpress', (on) => store.patch({ longPressBoost: on }));
  bindSwitch('data-stats', (on) => {
    store.patch({ stats: on });
    ctx.player.toggleStats();
  });
  bindSwitch('data-embers', (on) => {
    store.patch({ showEmbers: on });
    document.querySelector<HTMLElement>('.embers')?.style.setProperty('display', on ? '' : 'none');
  });

  const seek = $('[data-seek]', host) as HTMLInputElement | null;
  seek?.addEventListener('input', () => {
    store.patch({ seekStep: Number(seek.value) });
    const hint = seek.closest('.setting-row')?.querySelector('small');
    if (hint) hint.textContent = `${t('settings.seekStepSub')} · ${seek.value}s`;
    seek.style.setProperty('--fill', `${((Number(seek.value) - 2) / 28) * 100}%`);
  });

  const vstep = $('[data-volstep]', host) as HTMLInputElement | null;
  vstep?.addEventListener('input', () => {
    store.patch({ volumeStep: Number(vstep.value) / 100 });
    const hint = vstep.closest('.setting-row')?.querySelector('small');
    if (hint) hint.textContent = `${vstep.value}%`;
    vstep.style.setProperty('--fill', `${((Number(vstep.value) - 1) / 19) * 100}%`);
  });

  const subsize = $('[data-subsize]', host) as HTMLInputElement | null;
  subsize?.addEventListener('input', () => {
    store.patch({ subSize: Number(subsize.value) });
    ctx.player.applySubtitleStyle();
    subsize.style.setProperty('--fill', `${((Number(subsize.value) - 60) / 140) * 100}%`);
    const sample = $('.sub-style-preview span', host) as HTMLElement | null;
    if (sample) sample.style.fontSize = `calc(${Math.round(Number(subsize.value) / 100)}em * 1.1)`;
  });

  $$('[data-sub-col]', host).forEach((btn) =>
    btn.addEventListener('click', () => {
      store.patch({ subColor: (btn as HTMLElement).dataset.subCol! });
      ctx.player.applySubtitleStyle();
      rerender();
    }),
  );

  $('[data-eq]', host)?.addEventListener('click', () => {
    // open the player's equalizer drawer
    ctx.navigate('player');
    setTimeout(() => {
      const btnEl = document.querySelector<HTMLElement>('.stage-top [data-act="eq"]');
      btnEl?.click();
    }, 240);
  });

  $$('[data-reset]', host).forEach((btn) =>
    btn.addEventListener('click', async () => {
      const ok = await confirmDialog(t('settings.resetSub'), { danger: true, okLabel: t('settings.resetBtn') });
      if (!ok) return;
      store.resetSettings();
      window.dispatchEvent(new CustomEvent('rozh:relang'));
      toast(t('settings.resetBtn'), 'ok');
      rerender();
    }),
  );

  // paint gradient fills without firing the handlers above
  const fill = (el: HTMLInputElement | null, pct: number): void => {
    el?.style.setProperty('--fill', `${Math.max(0, Math.min(100, pct))}%`);
  };
  fill(seek, ((s.seekStep - 2) / 28) * 100);
  fill(vstep, ((Math.round(s.volumeStep * 100) - 1) / 19) * 100);
  fill(subsize, ((s.subSize - 60) / 140) * 100);
}

function platformLabel(): string {
  const p = navigator.userAgent;
  if (/Android TV|TV;|FireTV/i.test(p)) return 'Android TV';
  if (/Android/i.test(p)) return 'Android';
  if (/iPhone|iPad/i.test(p)) return 'iOS';
  if (/Mac/i.test(navigator.platform || p)) return 'macOS';
  if (/Win/i.test(navigator.platform || p)) return 'Windows';
  if (/Linux/i.test(p)) return 'Linux';
  return 'Web';
}
