/**
 * ROZH Player — playback engine.
 *
 * A single <video> element drives both video and audio, wrapped in a bespoke
 * control surface: custom scrubber, gesture layer, keyboard map, subtitle
 * engine (VTT/SRT native + ASS through libass), adaptive streaming (HLS/DASH),
 * a six-band equalizer, frame capture, PiP, casting and OS media keys.
 */

import { icon, hydrateIcons } from './icons';
import { t, n } from './i18n';
import { store, type Fit, type LoopMode } from './store';
import { openDrawer, openPopover, toast, type PopItem } from './ui';
import { openUrlModal } from '../views/streams';
import { remuxToPlayable, revealInFolder, type NativeFile } from './native';
import {
  $,
  $$,
  clamp,
  escapeHtml,
  fmtTime,
  haptic,
  isAudioFile,
  isTextEntry,
  pickFiles,
  platform,
  saveBlob,
  ext,
} from './util';

export interface Playable {
  key: string;
  name: string;
  title: string;
  url: string;
  isStream: boolean;
  kind: 'video' | 'audio' | 'stream';
  size: number;
  mediaId?: string;
  thumb?: string;
  /** object URL that must be revoked when the item leaves the queue */
  owned?: boolean;
  file?: File;
  artist?: string;
}

export interface PlayerEvents {
  onProgress?: (pos: number, dur: number) => void;
  onStateChange?: (playing: boolean) => void;
  onLoaded?: (item: Playable, dur: number) => void;
  onEnded?: () => void;
  onQueueChange?: () => void;
  onError?: (message: string) => void;
}

const TEMPLATE = `
<div class="player-view">
  <div class="stage-wrap" data-empty="true" data-idle="false" data-fs="false">
    <div class="stage" data-state="empty" data-playing="false" data-buffering="false" data-fit="contain">
      <video class="video" playsinline webkit-playsinline preload="metadata"></video>

      <div class="audio-art">
        <div class="audio-disc"><img src="/icons/rozh-logo.png" alt="" /></div>
        <div class="audio-viz">${
          Array.from({ length: 28 }, () => '<i></i>').join('')
        }</div>
      </div>

      <div class="stage-empty">
        <div class="empty-inner">
          <img class="empty-logo" src="/icons/rozh-logo.png" alt="" />
          <h3>${t('player.empty.title')}</h3>
          <p>${t('player.empty.sub')}</p>
          <div class="drop-zone">
            <div class="dz-title">${t('player.empty.drop')}</div>
            <div class="dz-sub">${t('player.empty.dropSub')}</div>
          </div>
          <div class="empty-actions">
            <button class="btn btn-primary btn-lg" data-act="open">${icon('folder-open')}<span>${t(
              'player.openFile',
            )}</span></button>
            <button class="btn btn-lg" data-act="url">${icon('link')}<span>${t('player.openUrl')}</span></button>
            <button class="btn btn-ghost btn-lg" data-act="demo">${icon('sparkles')}<span>${t(
              'player.sample',
            )}</span></button>
          </div>
          <div class="empty-formats">
            ${['MP4', 'MKV', 'WebM', 'MOV', 'AVI', 'TS', 'MP3', 'FLAC', 'WAV', 'M4A', 'OGG', 'HLS', 'DASH']
              .map((f) => `<span class="badge muted">${f}</span>`)
              .join('')}
          </div>
        </div>
      </div>

      <div class="stage-center">
        <button class="big-play" data-act="toggle" aria-label="${t('player.play')}">${icon('play')}</button>
        <div class="spinner" aria-hidden="true"></div>
      </div>

      <div class="gesture-hud"><span class="gh-ico">${icon('volume-2')}</span><span class="gh-text"></span></div>

      <div class="stage-top">
        <div class="now-mini">
          <div class="nm-title">&nbsp;</div>
          <div class="nm-sub">&nbsp;</div>
        </div>
        <div class="stage-top-actions">
          <button class="iconbtn" data-act="ab" data-tip="${t('player.ab')}" aria-label="${t('player.ab')}">${icon(
            'target',
          )}</button>
          <button class="iconbtn" data-act="capture" data-tip="${t('player.capture')}" aria-label="${t(
            'player.capture',
          )}">${icon('camera')}</button>
          <button class="iconbtn" data-act="pip" data-tip="${t('player.pip')}" aria-label="${t('player.pip')}">${icon(
            'pip',
          )}</button>
          <button class="iconbtn" data-act="cast" data-tip="Cast" aria-label="Cast">${icon('cast')}</button>
          <button class="iconbtn" data-act="tracks" data-tip="${t('player.subtitles')}" aria-label="${t(
            'player.subtitles',
          )}">${icon('subtitles')}</button>
          <button class="iconbtn" data-act="eq" data-tip="${t('player.equalizer')}" aria-label="${t(
            'player.equalizer',
          )}">${icon('sliders')}</button>
        </div>
      </div>

      <div class="stage-bottom">
        <div class="scrub" role="slider" tabindex="0" aria-label="${t('player.seek')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="scrub-track">
            <div class="scrub-buffer"></div>
            <div class="scrub-fill"></div>
            <div class="scrub-knob"></div>
          </div>
          <div class="chapters"></div>
          <div class="scrub-tip">0:00</div>
        </div>
        <div class="ctrl-row">
          <button class="iconbtn play-btn" data-act="toggle" aria-label="${t('player.play')}">${icon('play')}</button>
          <button class="iconbtn" data-act="prev" data-tip="${t('player.prev')}" aria-label="${t('player.prev')}">${icon(
            'skip-back',
          )}</button>
          <button class="iconbtn" data-act="next" data-tip="${t('player.next')}" aria-label="${t('player.next')}">${icon(
            'skip-forward',
          )}</button>
          <div class="vol-wrap">
            <button class="iconbtn" data-act="mute" data-tip="${t('player.mute')}" aria-label="${t('player.mute')}">${icon(
              'volume-2',
            )}</button>
            <div class="vol-slider"><input class="range vol-range" type="range" min="0" max="1" step="0.01" aria-label="${t(
              'player.volume',
            )}" /></div>
          </div>
          <div class="time"><span class="cur mono">0:00</span><span class="sep">/</span><span class="dur mono">0:00</span></div>
          <div class="ctrl-spacer"></div>
          <button class="iconbtn" data-act="queue" data-tip="${t('player.queue')}" aria-label="${t('player.queue')}">${icon(
            'list',
          )}</button>
          <button class="iconbtn" data-act="shuffle" data-tip="${t('player.shuffle')}" aria-label="${t(
            'player.shuffle',
          )}">${icon('shuffle')}</button>
          <button class="iconbtn" data-act="loop" data-tip="${t('player.loop')}" aria-label="${t('player.loop')}">${icon(
            'repeat',
          )}</button>
          <button class="rate-chip" data-act="speed" data-tip="${t('player.speed')}">1×</button>
          <button class="iconbtn" data-act="tracks" data-tip="${t('player.subtitles')}" aria-label="${t(
            'player.subtitles',
          )}">${icon('subtitles')}</button>
          <button class="iconbtn" data-act="fit" data-tip="${t('player.fit')}" aria-label="${t('player.fit')}">${icon(
            'eye',
          )}</button>
          <button class="iconbtn" data-act="pip" data-tip="${t('player.pip')}" aria-label="${t('player.pip')}">${icon(
            'pip',
          )}</button>
          <button class="iconbtn" data-act="fullscreen" data-tip="${t('player.fullscreen')}" aria-label="${t(
            'player.fullscreen',
          )}">${icon('maximize')}</button>
        </div>
      </div>
    </div>

    <div class="stage-meta">
      <div class="meta-main">
        <div class="meta-title"><span class="mt-text">${t('player.empty.title')}</span></div>
        <div class="meta-sub">
          <span class="ms-kind badge muted">${t('player.local')}</span>
          <span class="dotsep"></span>
          <span class="ms-detail meta-details">—</span>
        </div>
      </div>
      <div class="meta-actions">
        <button class="iconbtn" data-act="addqueue" data-tip="${t('player.addQueue')}" aria-label="${t(
          'player.addQueue',
        )}">${icon('plus')}</button>
        <button class="iconbtn" data-act="open" data-tip="${t('player.openFile')}" aria-label="${t(
          'player.openFile',
        )}">${icon('folder-open')}</button>
        <button class="iconbtn" data-act="url" data-tip="${t('player.openUrl')}" aria-label="${t('player.openUrl')}">${icon(
          'link',
        )}</button>
        ${
          platform.tauri
            ? `<button class="iconbtn" data-act="reveal" data-tip="${t('player.reveal')}" aria-label="${t(
                'player.reveal',
              )}">${icon('folder')}</button>`
            : ''
        }
        <button class="iconbtn" data-act="queue" data-tip="${t('player.queue')}" aria-label="${t('player.queue')}">${icon(
          'list',
        )}</button>
      </div>
    </div>
  </div>
</div>`;

type HlsLike = {
  destroy(): void;
  loadSource(url: string): void;
  attachMedia(el: HTMLVideoElement): void;
  on(evt: string, cb: (data: unknown, data2?: unknown) => void): void;
  levels: { height?: number; bitrate?: number; name?: string }[];
  currentLevel: number;
  autoLevelEnabled: boolean;
  nextLevel: number;
};

export class Player {
  readonly root: HTMLElement;
  readonly wrap: HTMLElement;
  readonly stage: HTMLElement;
  readonly video: HTMLVideoElement;
  events: PlayerEvents = {};

  current: Playable | null = null;
  queue: Playable[] = [];
  index = -1;

  private hls: HlsLike | null = null;
  private dash: { destroy?: () => void; reset?: () => void } | null = null;
  private hlsLevels: { height?: number; bitrate?: number }[] = [];
  private dashLevels: { height?: number; bitrate?: number; index: number }[] = [];
  private jassub: { destroy: () => void } | null = null;
  private objectUrls: string[] = [];
  private userSubs: { label: string; url: string; track: HTMLTrackElement }[] = [];
  private audioCtx: AudioContext | null = null;
  private eqNodes: BiquadFilterNode[] = [];
  private masterGain: GainNode | null = null;
  private eqGainDb: number[] = [...store.settings.eq];

  private hideTimer = 0;
  private disposers: (() => void)[] = [];
  private lastVolume = store.settings.volume || 0.9;
  private dragging = false;
  private brightness = 1;
  private ab = { a: 0, b: 0 };
  private errorCount = 0;

  constructor(host: HTMLElement) {
    host.innerHTML = TEMPLATE;
    this.root = $('.player-view', host)!;
    this.wrap = $('.stage-wrap', host)!;
    this.stage = $('.stage', host)!;
    this.video = $('.video', host)!;
    hydrateIcons(host);

    this.bindControls();
    this.bindVideoEvents();
    this.bindKeyboard();
    this.bindGestures();
    this.bindDragDrop(host);
    this.syncSettingsUi();
    this.applyFit(store.settings.fit);
    this.applyLoop(store.settings.loop);
    this.syncShuffle(store.settings.shuffle);
    this.applySubtitleStyle();
    this.video.playbackRate = store.settings.rate;
    this.startIdleLoop();
  }

  /* ================================================================ */
  /* loading                                                          */
  /* ================================================================ */

  async load(item: Playable, opts: { autoplay?: boolean; startAt?: number } = {}): Promise<void> {
    this.teardownEngine();
    this.current = item;
    this.errorCount = 0;
    this.nativeTried = false;
    this.ab = { a: 0, b: 0 };

    const isAudio = item.kind === 'audio' || isAudioFile(item.name);
    this.stage.dataset.state = isAudio ? 'audio' : 'video';
    this.wrap.dataset.empty = 'false';
    this.video.poster = item.thumb ?? '';
    this.video.style.filter = `brightness(${this.brightness}) contrast(${
      store.settings.sdrBoost ? 1.06 : 1
    }) saturate(${store.settings.sdrBoost ? 1.12 : 1})`;

    this.setText(item.title, item.isStream ? t('player.stream') : isAudio ? t('player.audioOnly') : t('player.local'));
    this.updateMeta(item);
    this.renderChapters([]);

    const url = item.url;
    const clean = url.split('#')[0].split('?')[0].toLowerCase();
    const isHls = /\.m3u8$/.test(clean);
    const isDash = /\.mpd$/.test(clean);

    // resume position (set before we attach so loadedmetadata sees it)
    let start = opts.startAt ?? 0;
    if (!start && !item.isStream) start = store.getResume(item.key);
    this.pendingStart = start;

    this.stage.dataset.buffering = 'true';
    this.video.src = '';
    this.video.removeAttribute('src');

    try {
      if (isHls) await this.attachHls(url);
      else if (isDash) await this.attachDash(url);
      else {
        this.video.src = url;
        this.video.load();
      }
    } catch (err) {
      console.warn('[rozh] engine attach failed, falling back to native src', err);
      this.video.src = url;
      this.video.load();
    }

    if (opts.autoplay !== false) {
      try {
        await this.play();
      } catch {
        /* autoplay blocked — the big play button is showing */
      }
    }
    this.events.onLoaded?.(item, this.video.duration || 0);
    this.updateMediaSession();
    this.updateQueueButton();
  }

  private pendingStart = 0;

  private async attachHls(url: string): Promise<void> {
    const mod = (await import('hls.js')) as unknown as {
      default: { isSupported(): boolean; new (cfg: Record<string, unknown>): HlsLike } & {
        Events: Record<string, string>;
      };
    };
    const Hls = mod.default;
    if (!Hls?.isSupported?.()) {
      this.video.src = url;
      return;
    }
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 90,
      maxBufferLength: 42,
      capLevelToPlayerSize: true,
      startLevel: store.settings.hlsQuality >= 0 ? store.settings.hlsQuality : -1,
    });
    this.hls = hls;
    hls.loadSource(url);
    hls.attachMedia(this.video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      this.hlsLevels = (hls.levels ?? []).map((l) => ({ height: l.height, bitrate: l.bitrate }));
      this.stage.dataset.buffering = 'false';
    });
    hls.on(Hls.Events.ERROR, (_e, data) => {
      const d = data as { fatal?: boolean; type?: string };
      if (d?.fatal) {
        console.warn('[rozh] hls fatal', d);
        if (d.type === 'networkError') hls.loadSource(url);
        else this.showError(t('player.mediaError'));
      }
    });
  }

  private async attachDash(url: string): Promise<void> {
    const mod = (await import('dashjs')) as unknown as {
      MediaPlayer?: () => { create(): Record<string, unknown> };
      default?: { MediaPlayer?: () => { create(): Record<string, unknown> } };
    };
    const factory = mod.MediaPlayer ?? mod.default?.MediaPlayer;
    if (!factory) {
      this.video.src = url;
      return;
    }
    const dp = factory().create() as unknown as {
      initialize: (v: HTMLVideoElement, src: string, autoplay: boolean) => void;
      destroy: () => void;
      getBitrateInfoListFor: (t: string) => { height?: number; bitrate?: number }[];
      setAutoSwitchQualityFor: (t: string, on: boolean) => void;
      setQualityFor: (t: string, i: number) => void;
    };
    this.dash = dp;
    dp.initialize(this.video, url, false);
    try {
      this.dashLevels = dp.getBitrateInfoListFor('video').map((l, i) => ({ height: l.height, bitrate: l.bitrate, index: i }));
    } catch {
      this.dashLevels = [];
    }
  }

  private teardownEngine(): void {
    try {
      this.hls?.destroy();
    } catch {
      /* noop */
    }
    this.hls = null;
    this.hlsLevels = [];
    try {
      this.dash?.destroy?.();
    } catch {
      /* noop */
    }
    this.dash = null;
    this.dashLevels = [];
    this.clearJassub();
    this.clearUserSubs();
  }

  /* ================================================================ */
  /* transport                                                        */
  /* ================================================================ */

  get duration(): number {
    return Number.isFinite(this.video.duration) ? this.video.duration : 0;
  }

  get playing(): boolean {
    return !this.video.paused && !this.video.ended;
  }

  async play(): Promise<void> {
    if (!this.current) return;
    this.video.playbackRate = store.settings.rate;
    this.applyVolume();
    try {
      await this.video.play();
    } catch (err) {
      this.stage.dataset.playing = 'false';
      if ((err as DOMException)?.name === 'NotAllowedError') $('.big-play', this.root)?.classList.add('show');
      throw err;
    }
  }

  pause(): void {
    this.video.pause();
  }

  toggle(): void {
    if (!this.current) {
      this.openFiles();
      return;
    }
    if (this.video.paused) void this.play().catch(() => undefined);
    else this.pause();
  }

  seek(time: number): void {
    if (!this.current || !Number.isFinite(time)) return;
    const dur = this.duration;
    const target = clamp(time, 0, dur || 0);
    try {
      this.video.currentTime = target;
    } catch {
      /* seek before metadata */
    }
    this.renderProgress();
  }

  seekBy(delta: number): void {
    if (!this.current) return;
    const dur = this.duration;
    const target = clamp(this.video.currentTime + delta, 0, dur || 0);
    this.seek(target);
    this.flashHud(
      delta > 0 ? 'forward' : 'back',
      `${delta > 0 ? '+' : '−'}${n(Math.abs(Math.round(delta)))}s · ${fmtTime(target)}`,
    );
  }

  seekPercent(p: number): void {
    if (!this.current || !this.duration) return;
    this.seek((p / 100) * this.duration);
  }

  stepFrame(dir: 1 | -1): void {
    if (!this.current) return;
    this.pause();
    this.seek(this.video.currentTime + dir / 30);
  }

  setRate(rate: number): void {
    const r = clamp(rate, 0.25, 4);
    store.patch({ rate: r });
    this.video.playbackRate = r;
    (this.video as HTMLVideoElement & { preservesPitch?: boolean }).preservesPitch = true;
    this.syncRateChip();
    toast(`${t('player.speed')} · ${r}×`, 'info', 1200);
  }

  setVolume(v: number): void {
    const vol = clamp(v, 0, 1);
    store.patch({ volume: vol, muted: vol === 0 ? true : false });
    if (vol > 0) this.lastVolume = vol;
    this.applyVolume();
  }

  private applyVolume(): void {
    const s = store.settings;
    const eff = s.muted ? 0 : s.volume;
    if (this.masterGain) {
      this.video.volume = 1;
      this.masterGain.gain.value = eff;
    } else {
      this.video.volume = eff;
    }
    this.video.muted = s.muted && !this.masterGain;
    this.syncVolumeUi();
  }

  toggleMute(): void {
    const s = store.settings;
    if (s.muted || s.volume === 0) {
      store.patch({ muted: false, volume: this.lastVolume || 0.8 });
      this.flashHud('volume', `${n(Math.round((this.lastVolume || 0.8) * 100))}%`);
    } else {
      this.lastVolume = s.volume;
      store.patch({ muted: true });
      this.flashHud('muted', t('player.mute'));
    }
    this.applyVolume();
  }

  setLoop(mode: LoopMode): void {
    store.patch({ loop: mode });
    this.applyLoop(mode);
    toast(mode === 'one' ? t('player.loopOne') : mode === 'all' ? t('player.loopOn') : t('player.loopOff'), 'info', 1300);
  }

  private applyLoop(mode: LoopMode): void {
    this.video.loop = mode === 'one';
    this.syncLoopButton();
  }

  cycleLoop(): void {
    const order: LoopMode[] = ['off', 'all', 'one'];
    const next = order[(order.indexOf(store.settings.loop) + 1) % order.length];
    this.setLoop(next);
  }

  toggleShuffle(): void {
    const on = !store.settings.shuffle;
    store.patch({ shuffle: on });
    this.syncShuffle(on);
    toast(`${t('player.shuffle')} ${on ? t('common.on') : t('common.off')}`, 'info', 1300);
  }

  private syncShuffle(on: boolean): void {
    $$('[data-act="shuffle"]', this.root).forEach((b) => b.classList.toggle('is-on', on));
  }

  setFit(fit: Fit): void {
    store.patch({ fit });
    this.applyFit(fit);
  }

  applyFit(fit: Fit): void {
    this.stage.dataset.fit = fit;
    this.video.style.objectFit =
      fit === 'contain' ? 'contain' : fit === 'cover' ? 'cover' : fit === 'fill' ? 'fill' : 'cover';
    this.video.style.transform = fit === 'zoom' ? 'scale(1.08)' : '';
  }

  /* ================================================================ */
  /* queue                                                            */
  /* ================================================================ */

  setQueue(items: Playable[], startIndex = 0): void {
    this.queue.forEach((q) => this.revokeIfOwned(q));
    this.queue = items;
    this.index = startIndex;
    this.updateQueueButton();
    this.events.onQueueChange?.();
  }

  enqueue(items: Playable[], playNow = false): void {
    if (playNow) {
      this.setQueue(items, 0);
      void this.load(items[0]);
      return;
    }
    const fresh = items.filter((it) => !this.queue.some((q) => q.key === it.key));
    this.queue.push(...fresh);
    if (this.index < 0) this.index = 0;
    this.updateQueueButton();
    this.events.onQueueChange?.();
    toast(`${n(fresh.length)} ${t('player.addQueue')}`, 'ok', 1600);
  }

  next(auto = false): void {
    if (this.queue.length < 2) {
      if (!auto) toast(t('player.emptyQueue'), 'info', 1300);
      return;
    }
    let nextIndex: number;
    if (store.settings.shuffle) {
      do {
        nextIndex = Math.floor(Math.random() * this.queue.length);
      } while (nextIndex === this.index && this.queue.length > 1);
    } else {
      nextIndex = (this.index + 1) % this.queue.length;
    }
    this.playIndex(nextIndex);
  }

  prev(): void {
    if (this.queue.length < 2) return;
    if (this.video.currentTime > 4) {
      this.seek(0);
      return;
    }
    this.playIndex((this.index - 1 + this.queue.length) % this.queue.length);
  }

  playIndex(i: number): void {
    const item = this.queue[i];
    if (!item) return;
    this.index = i;
    void this.load(item);
    this.events.onQueueChange?.();
  }

  private revokeIfOwned(item: Playable): void {
    if (item.owned && item.url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(item.url);
      } catch {
        /* noop */
      }
    }
  }

  clearQueue(): void {
    this.queue.forEach((q) => this.revokeIfOwned(q));
    this.queue = [];
    this.index = -1;
    this.updateQueueButton();
    this.events.onQueueChange?.();
  }

  /* ================================================================ */
  /* subtitles                                                        */
  /* ================================================================ */

  async addSubtitleFile(file: File): Promise<void> {
    const e = ext(file.name);
    if (e === 'ass' || e === 'ssa') {
      const text = await file.text();
      await this.renderAss(text, file.name);
      toast(`${t('player.subLoaded')} · ${escapeHtml(file.name)}`, 'ok');
      return;
    }
    const text = await file.text();
    const vtt = e === 'vtt' ? text : srtToVtt(text);
    const blob = new Blob([vtt], { type: 'text/vtt' });
    const url = URL.createObjectURL(blob);
    this.objectUrls.push(url);
    this.attachTextTrack(url, file.name, true);
    toast(`${t('player.subLoaded')} · ${escapeHtml(file.name)}`, 'ok');
  }

  private attachTextTrack(url: string, label: string, show: boolean): void {
    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = label;
    track.srclang = /fa|farsi|persian/i.test(label) ? 'fa' : 'en';
    track.src = url;
    if (show) track.default = true;
    this.video.appendChild(track);
    track.addEventListener('load', () => {
      if (show) this.showTrack(track);
    });
    if (show) this.showTrack(track);
    this.userSubs.push({ label, url, track });
  }

  private showTrack(target: HTMLTrackElement): void {
    for (let i = 0; i < this.video.textTracks.length; i++) {
      const tt = this.video.textTracks[i];
      tt.mode = 'disabled';
    }
    const tt = target.track;
    if (tt) tt.mode = 'showing';
    this.applyCueStyle();
  }

  disableSubtitles(): void {
    for (let i = 0; i < this.video.textTracks.length; i++) this.video.textTracks[i].mode = 'disabled';
    this.stage.querySelector('.jassub-canvas')?.remove();
    this.clearJassub();
  }

  private clearUserSubs(): void {
    this.userSubs.forEach((s) => s.track.remove());
    this.userSubs = [];
  }

  private clearJassub(): void {
    try {
      this.jassub?.destroy();
    } catch {
      /* noop */
    }
    this.jassub = null;
  }

  private async renderAss(content: string, label: string): Promise<void> {
    this.clearJassub();
    try {
      const mod = (await import('jassub')) as unknown as {
        default: new (opts: Record<string, unknown>) => { destroy: () => void; ready: Promise<void> };
      };
      const JASSUB = mod.default;
      this.jassub = new JASSUB({
        video: this.video,
        subContent: content,
        workerUrl: '/jassub/jassub-worker.js',
        wasmUrl: '/jassub/jassub-worker.wasm',
        modernWasmUrl: '/jassub/jassub-worker-modern.wasm',
        defaultFont: '/jassub/default.woff2',
        availableFonts: { 'default.woff2': '/jassub/default.woff2' },
        queryFonts: 'local',
        debug: false,
      });
      const canvas = this.stage.querySelector('canvas');
      if (canvas) canvas.classList.add('jassub-canvas');
      toast(`${t('player.assNote')} · ${escapeHtml(label)}`, 'ok');
    } catch (err) {
      console.warn('[rozh] libass unavailable', err);
      toast(t('player.subNone'), 'warn');
    }
  }

  private applyCueStyle(): void {
    const s = store.settings;
    let style = document.getElementById('rozh-cue-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'rozh-cue-style';
      document.head.appendChild(style);
    }
    const shadow =
      s.subFontStyle === 'outline'
        ? `-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 3px 6px rgba(0,0,0,.9)`
        : s.subFontStyle === 'shadow'
          ? `0 3px 10px rgba(0,0,0,.95), 0 0 22px rgba(0,0,0,.75)`
          : `0 2px 6px rgba(0,0,0,.8)`;
    const bg =
      s.subFontStyle === 'box' ? `rgba(0,0,0,${s.subBg / 100})` : 'transparent';
    style.textContent = `video::cue{
      color:${s.subColor};
      background:${bg};
      font-size:calc(${s.subSize / 100} * 1.05vw + 8px);
      font-family:'Vazirmatn',system-ui,sans-serif;
      text-shadow:${shadow};
      line-height:1.45;
    }`;
  }

  applySubtitleStyle(): void {
    this.applyCueStyle();
    document.documentElement.style.setProperty('--sub-size', `${store.settings.subSize}%`);
    document.documentElement.style.setProperty('--sub-color', store.settings.subColor);
  }

  toggleSubtitles(): void {
    const tracks = Array.from(this.video.textTracks);
    const active = tracks.find((tt) => tt.mode === 'showing');
    if (active) {
      this.disableSubtitles();
      toast(t('player.subtitles') + ' · ' + t('common.off'), 'info', 1400);
      return;
    }
    const first = this.userSubs[0] ?? this.userSubs.find((s) => s.track.default);
    if (first) {
      this.showTrack(first.track);
      return;
    }
    for (let i = 0; i < tracks.length; i++) {
      if (tracks[i].kind === 'subtitles' || tracks[i].kind === 'captions') {
        tracks[i].mode = 'showing';
        this.applyCueStyle();
        return;
      }
    }
    this.openTracksDrawer();
  }

  /* ================================================================ */
  /* equalizer                                                        */
  /* ================================================================ */

  private async ensureAudioGraph(): Promise<void> {
    if (this.audioCtx) {
      if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const src = ctx.createMediaElementSource(this.video);
    const freqs = [60, 170, 400, 1000, 3500, 10000];
    const types: BiquadFilterType[] = ['lowshelf', 'peaking', 'peaking', 'peaking', 'peaking', 'highshelf'];
    const nodes: BiquadFilterNode[] = freqs.map((f, i) => {
      const node = ctx.createBiquadFilter();
      node.type = types[i];
      node.frequency.value = f;
      node.Q.value = 1.1;
      node.gain.value = this.eqGainDb[i] ?? 0;
      return node;
    });
    const gain = ctx.createGain();
    gain.gain.value = store.settings.muted ? 0 : store.settings.volume;
    let cursor: AudioNode = src;
    nodes.forEach((node) => {
      cursor.connect(node);
      cursor = node;
    });
    cursor.connect(gain);
    gain.connect(ctx.destination);
    this.audioCtx = ctx;
    this.eqNodes = nodes;
    this.masterGain = gain;
    this.video.volume = 1;
    if (ctx.state === 'suspended') await ctx.resume();
  }

  async setEqBand(index: number, db: number): Promise<void> {
    this.eqGainDb[index] = db;
    store.patch({ eq: [...this.eqGainDb] });
    if (!store.settings.eqEnabled) return;
    await this.ensureAudioGraph();
    const node = this.eqNodes[index];
    if (node) node.gain.value = db;
  }

  async setEqEnabled(on: boolean): Promise<void> {
    store.patch({ eqEnabled: on });
    if (on) {
      await this.ensureAudioGraph();
      this.eqNodes.forEach((node, i) => (node.gain.value = this.eqGainDb[i] ?? 0));
      this.applyVolume();
    } else {
      this.eqNodes.forEach((node) => (node.gain.value = 0));
    }
    this.applyVolume();
  }

  /* ================================================================ */
  /* capture / pip / cast / fullscreen                                */
  /* ================================================================ */

  captureFrame(): void {
    if (!this.current || !this.video.videoWidth) {
      toast(t('player.notSupported'), 'warn');
      return;
    }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = this.video.videoWidth;
      canvas.height = this.video.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height);
      const format = store.settings.screenshotFormat;
      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          saveBlob(blob, `rozh-${(this.current?.title || 'frame').replace(/[^\w\u0600-\u06FF-]+/g, '_').slice(0, 40)}-${stamp}.${format}`);
          toast(t('player.saved'), 'ok');
        },
        `image/${format}`,
        0.94,
      );
    } catch {
      toast(t('player.mediaError'), 'warn');
    }
  }

  async captureThumb(atTime?: number): Promise<string | undefined> {
    if (!this.current || !this.video.videoWidth) return undefined;
    const wasPaused = this.video.paused;
    const prev = this.video.currentTime;
    try {
      if (atTime == null) {
        const target = Math.min(Math.max(1.5, (this.duration || 10) * 0.12), 30);
        this.video.currentTime = target;
        await new Promise<void>((r) => {
          const onSeek = (): void => {
            this.video.removeEventListener('seeked', onSeek);
            r();
          };
          this.video.addEventListener('seeked', onSeek);
          setTimeout(r, 1200);
        });
      }
      const canvas = document.createElement('canvas');
      const w = 384;
      canvas.width = w;
      canvas.height = Math.round((this.video.videoHeight / this.video.videoWidth) * w) || 216;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/jpeg', 0.72);
      this.video.currentTime = prev;
      if (wasPaused) this.pause();
      return data;
    } catch {
      this.video.currentTime = prev;
      return undefined;
    }
  }

  async toggleFullscreen(): Promise<void> {
    const d = document as Document & {
      webkitExitFullscreen?: () => Promise<void>;
      webkitFullscreenElement?: Element;
    };
    const isFs = !!document.fullscreenElement || !!d.webkitFullscreenElement;
    try {
      if (isFs) {
        await (document.exitFullscreen?.() ?? d.webkitExitFullscreen?.());
      } else if (this.wrap.requestFullscreen) {
        await this.wrap.requestFullscreen({ navigationUI: 'hide' });
      } else if ((this.video as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen) {
        (this.video as HTMLVideoElement & { webkitEnterFullscreen: () => void }).webkitEnterFullscreen();
      } else {
        this.wrap.classList.toggle('fs-fallback');
      }
    } catch {
      this.wrap.classList.toggle('fs-fallback');
      this.wrap.dataset.fs = this.wrap.classList.contains('fs-fallback') ? 'true' : 'false';
    }
  }

  async togglePip(): Promise<void> {
    const v = this.video as HTMLVideoElement & { webkitSetPresentationMode?: (m: string) => void };
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await this.video.requestPictureInPicture();
      } else if (v.webkitSetPresentationMode) {
        v.webkitSetPresentationMode('picture-in-picture');
      } else {
        toast(t('player.pip') + ' — ' + t('common.error'), 'warn');
      }
    } catch {
      toast(t('player.pip') + ' — ' + t('common.error'), 'warn');
    }
  }

  async cast(): Promise<void> {
    const remote = (this.video as HTMLVideoElement & { remote?: { prompt?: () => Promise<void> } }).remote;
    const airplay = (this.video as HTMLVideoElement & { webkitShowPlaybackTargetPicker?: () => void })
      .webkitShowPlaybackTargetPicker;
    try {
      if (remote?.prompt) await remote.prompt();
      else if (airplay) airplay.call(this.video);
      else toast('Cast: ' + t('common.error'), 'warn');
    } catch {
      /* user cancelled */
    }
  }

  /* ================================================================ */
  /* AB loop                                                          */
  /* ================================================================ */

  cycleAb(): void {
    if (!this.current) return;
    if (!this.ab.a) {
      this.ab.a = this.video.currentTime;
      this.ab.b = 0;
      toast(`${t('player.abSet')} · ${fmtTime(this.ab.a)}`, 'ok', 1500);
      return;
    }
    if (!this.ab.b) {
      if (this.video.currentTime <= this.ab.a + 0.5) {
        toast(t('player.ab') + ' — ' + t('common.error'), 'warn', 1500);
        return;
      }
      this.ab.b = this.video.currentTime;
      toast(`${t('player.abDone')} · ${fmtTime(this.ab.a)} → ${fmtTime(this.ab.b)}`, 'ok', 2000);
      return;
    }
    this.ab = { a: 0, b: 0 };
    toast(t('player.abClear'), 'info', 1400);
  }

  /* ================================================================ */
  /* UI wiring                                                        */
  /* ================================================================ */

  private bindControls(): void {
    this.root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!btn) return;
      e.preventDefault();
      const act = btn.dataset.act;
      haptic();
      switch (act) {
        case 'toggle':
          this.toggle();
          break;
        case 'open':
          void this.openFiles();
          break;
        case 'url':
          this.openUrlDialog();
          break;
        case 'demo':
          this.playDemo();
          break;
        case 'next':
          this.next();
          break;
        case 'prev':
          this.prev();
          break;
        case 'mute':
          this.toggleMute();
          break;
        case 'reveal': {
          const path = (this.current?.file as NativeFile | undefined)?.__path;
          if (path) void revealInFolder(path);
          break;
        }
        case 'queue':
          this.openQueueDrawer();
          break;
        case 'shuffle':
          this.toggleShuffle();
          break;
        case 'loop':
          this.cycleLoop();
          break;
        case 'speed':
          this.openSpeedMenu(btn);
          break;
        case 'tracks':
          this.openTracksDrawer();
          break;
        case 'eq':
          this.openEqDrawer();
          break;
        case 'fit':
          this.openFitMenu(btn);
          break;
        case 'pip':
          void this.togglePip();
          break;
        case 'cast':
          void this.cast();
          break;
        case 'fullscreen':
          void this.toggleFullscreen();
          break;
        case 'capture':
          this.captureFrame();
          break;
        case 'ab':
          this.cycleAb();
          break;
        case 'addqueue':
          if (this.current) this.enqueue([{ ...this.current, owned: false }], false);
          break;
        default:
          break;
      }
    });

    // volume slider
    const vol = $('.vol-range', this.root) as HTMLInputElement;
    vol.value = String(store.settings.volume);
    vol.addEventListener('input', () => this.setVolume(Number(vol.value)));

    // scrubber
    const scrub = $('.scrub', this.root)!;
    const pctFromEvent = (e: PointerEvent): number => {
      const r = scrub.getBoundingClientRect();
      const raw = (e.clientX - r.left) / r.width;
      const v = document.documentElement.dir === 'rtl' ? 1 - raw : raw;
      return clamp(v, 0, 1);
    };
    scrub.addEventListener('pointermove', (e) => {
      const p = pctFromEvent(e);
      const tip = $('.scrub-tip', scrub)!;
      tip.textContent = fmtTime(p * this.duration);
      tip.style.left = `${p * 100}%`;
      if (this.dragging) {
        this.scrubPreview = p;
        this.renderProgress();
      }
    });
    scrub.addEventListener('pointerdown', (e) => {
      if (!this.current) return;
      this.dragging = true;
      this.scrubPreview = pctFromEvent(e);
      scrub.classList.add('dragging');
      scrub.setPointerCapture(e.pointerId);
      this.renderProgress();
      this.showUi();
    });
    scrub.addEventListener('pointerup', (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      scrub.classList.remove('dragging');
      const p = pctFromEvent(e);
      this.scrubPreview = null;
      this.seek(p * this.duration);
      try {
        scrub.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    });
    scrub.addEventListener('pointercancel', () => {
      this.dragging = false;
      this.scrubPreview = null;
      scrub.classList.remove('dragging');
    });
    scrub.addEventListener('keydown', (e) => {
      if (!this.current) return;
      if (e.key === 'ArrowRight') this.seekBy(store.settings.seekStep);
      if (e.key === 'ArrowLeft') this.seekBy(-store.settings.seekStep);
    });

    // click on the stage: single = toggle UI / double = fullscreen
    let clickTimer = 0;
    this.stage.addEventListener('click', (e) => {
      const onControl = (e.target as HTMLElement).closest('.stage-top, .stage-bottom, .big-play, .stage-empty');
      if (onControl) return;
      if (!this.current) return;
      if (e.detail === 1) {
        clickTimer = window.setTimeout(() => this.toggleUiVisible(), 180);
      } else if (e.detail === 2) {
        clearTimeout(clickTimer);
        void this.toggleFullscreen();
      }
    });

    const onFs = (): void => {
      const fs = !!document.fullscreenElement;
      this.wrap.dataset.fs = String(fs);
      $$('[data-act="fullscreen"]', this.root).forEach((b) => {
        b.innerHTML = icon(fs ? 'fullscreen-exit' : 'maximize');
      });
      window.setTimeout(() => this.renderProgress(), 120);
    };
    document.addEventListener('fullscreenchange', onFs);
    this.disposers.push(() => document.removeEventListener('fullscreenchange', onFs));
  }

  private scrubPreview: number | null = null;

  private bindVideoEvents(): void {
    const v = this.video;

    v.addEventListener('loadedmetadata', () => {
      this.stage.dataset.buffering = 'false';
      if (this.pendingStart > 3 && this.pendingStart < (this.duration || Infinity) - 5) {
        this.video.currentTime = this.pendingStart;
        toast(t('player.resumed', { t: fmtTime(this.pendingStart) }), 'ok', 2400);
        this.pendingStart = 0;
      }
      this.renderProgress();
      this.updateMetaDuration();
    });

    v.addEventListener('timeupdate', () => {
      this.renderProgress();
      this.checkAb();
    });

    v.addEventListener('progress', () => this.renderProgress());

    v.addEventListener('play', () => {
      this.stage.dataset.playing = 'true';
      $$('.play-btn', this.root).concat($$('.big-play', this.root)).forEach((b) => {
        b.innerHTML = icon('pause');
        b.setAttribute('aria-label', t('player.pause'));
      });
      $('.big-play', this.root)?.classList.remove('show', 'pulse');
      this.events.onStateChange?.(true);
      this.startProgressTicker();
      this.scheduleHide();
      void this.ensureAudioGraph().catch(() => undefined);
    });

    v.addEventListener('pause', () => {
      this.stage.dataset.playing = 'false';
      $$('.play-btn', this.root).concat($$('.big-play', this.root)).forEach((b) => {
        b.innerHTML = icon('play');
        b.setAttribute('aria-label', t('player.play'));
      });
      this.events.onStateChange?.(false);
      this.stopProgressTicker();
      this.showUi();
      if (this.current && this.video.currentTime > 0.2) $('.big-play', this.root)?.classList.add('show');
      this.persistPosition();
    });

    v.addEventListener('waiting', () => (this.stage.dataset.buffering = 'true'));
    v.addEventListener('playing', () => {
      this.stage.dataset.buffering = 'false';
      this.stage.dataset.playing = 'true';
    });
    v.addEventListener('canplay', () => (this.stage.dataset.buffering = 'false'));
    v.addEventListener('ratechange', () => this.syncRateChip());

    v.addEventListener('volumechange', () => this.syncVolumeUi());

    v.addEventListener('ended', () => {
      this.stage.dataset.playing = 'false';
      this.events.onEnded?.();
      this.persistPosition(true);
      const loop = store.settings.loop;
      if (loop === 'one') {
        this.seek(0);
        void this.play();
        return;
      }
      if (loop === 'all' || (store.settings.autoplay && this.queue.length > 1)) {
        this.next(true);
        return;
      }
      $('.big-play', this.root)?.classList.add('show');
      $$('.play-btn', this.root).forEach((b) => (b.innerHTML = icon('play')));
    });

    v.addEventListener('error', () => {
      const err = v.error;
      if (!this.current) return;
      if (this.errorCount++ > 1) return;
      const code = err?.code ?? 0;
      if (code === 4 || code === 3) {
        void this.nativeFallback().then((ok) => {
          if (!ok) this.showError(t('player.mediaError'));
        });
      }
    });

    // resume tracking every 5s
    const resumeTimer = window.setInterval(() => {
      if (this.playing) this.persistPosition();
    }, 5000);
    this.disposers.push(() => clearInterval(resumeTimer));

    this.onWindow('beforeunload', () => {
      this.persistPosition();
      this.queue.forEach((q) => this.revokeIfOwned(q));
    });
  }

  private persistPosition(reset = false): void {
    if (!this.current || this.current.isStream) return;
    const dur = this.duration;
    if (dur > 0 && this.video.currentTime > dur - 20) {
      store.setResume(this.current.key, 0);
      if (reset && this.current.mediaId) {
        store.updateMedia(this.current.mediaId, { position: 0, playedAt: Date.now() });
      }
      return;
    }
    store.setResume(this.current.key, this.video.currentTime);
    if (this.current.mediaId) {
      store.updateMedia(this.current.mediaId, {
        position: this.video.currentTime,
        duration: dur || undefined,
        playedAt: Date.now(),
      });
    }
    this.events.onProgress?.(this.video.currentTime, dur);
  }

  private startProgressTicker(): void {
    if (this.progressTimerLoop) return;
    this.progressTimerLoop = window.setInterval(() => this.renderProgress(), 250);
  }

  private progressTimerLoop = 0;

  private stopProgressTicker(): void {
    clearInterval(this.progressTimerLoop);
    this.progressTimerLoop = 0;
  }

  private nativeTried = false;

  /**
   * Desktop only: hand a container the webview refuses to the bundled FFmpeg
   * (lossless remux first, transcode as a last resort) and retry playback.
   */
  private async nativeFallback(): Promise<boolean> {
    const path = (this.current?.file as NativeFile | undefined)?.__path;
    if (!path || this.nativeTried) return false;
    this.nativeTried = true;
    this.stage.dataset.buffering = 'true';
    toast(t('player.preparing'), 'info', 4000);
    const url = await remuxToPlayable(path);
    if (!url) {
      this.stage.dataset.buffering = 'false';
      return false;
    }
    this.video.src = url;
    this.video.load();
    try {
      await this.play();
      this.nativeTried = false;
      return true;
    } catch {
      return false;
    }
  }

  private showError(message: string): void {
    this.stage.dataset.buffering = 'false';
    this.stage.dataset.state = 'empty';
    this.wrap.dataset.empty = 'true';
    $('.empty-inner', this.root)!.innerHTML = `
      <img class="empty-logo" src="/icons/rozh-logo.png" alt="" />
      <h3>${escapeHtml(t('player.error'))}</h3>
      <p>${escapeHtml(message)}</p>
      <p style="font-size:.84rem;color:var(--text-4)">${escapeHtml(t('player.notSupportedSub'))}</p>
      <div class="empty-actions">
        <button class="btn btn-primary btn-lg" data-act="open">${icon('folder-open')}<span>${escapeHtml(
          t('player.openFile'),
        )}</span></button>
        <button class="btn btn-lg" data-act="url">${icon('link')}<span>${escapeHtml(t('player.openUrl'))}</span></button>
      </div>`;
    this.events.onError?.(message);
  }

  private renderProgress(): void {
    if (!this.current) return;
    const dur = this.duration || 0;
    const cur = this.dragging && this.scrubPreview != null ? this.scrubPreview * dur : this.video.currentTime;
    const pct = dur ? clamp((cur / dur) * 100, 0, 100) : 0;
    const fill = $('.scrub-fill', this.root) as HTMLElement;
    const knob = $('.scrub-knob', this.root) as HTMLElement;
    const curEl = $('.cur', this.root) as HTMLElement;
    const durEl = $('.dur', this.root) as HTMLElement;
    if (fill) fill.style.width = `${pct}%`;
    if (knob) knob.style.insetInlineStart = `${pct}%`;
    if (curEl) curEl.textContent = fmtTime(cur, dur >= 3600);
    if (durEl) durEl.textContent = dur ? fmtTime(dur, dur >= 3600) : '--:--';

    // buffer
    try {
      const b = this.video.buffered;
      if (b.length && dur) {
        let end = 0;
        for (let i = 0; i < b.length; i++) if (b.start(i) <= this.video.currentTime + 0.5) end = b.end(i);
        const bufEl = $('.scrub-buffer', this.root) as HTMLElement;
        if (bufEl) bufEl.style.width = `${clamp((end / dur) * 100, 0, 100)}%`;
      }
    } catch {
      /* noop */
    }

    const scrub = $('.scrub', this.root);
    scrub?.setAttribute('aria-valuenow', String(Math.round(pct)));
    scrub?.setAttribute('aria-valuetext', `${fmtTime(cur)} / ${fmtTime(dur)}`);
  }

  private renderChapters(points: number[]): void {
    const host = $('.chapters', this.root)!;
    const dur = this.duration;
    host.innerHTML =
      dur > 0 ? points.map((p) => `<i style="inset-inline-start:${clamp((p / dur) * 100, 0, 100)}%"></i>`).join('') : '';
  }

  private checkAb(): void {
    if (this.ab.a && this.ab.b && this.video.currentTime >= this.ab.b) {
      this.video.currentTime = this.ab.a;
    }
  }

  private syncVolumeUi(): void {
    const s = store.settings;
    const range = $('.vol-range', this.root) as HTMLInputElement;
    if (range) {
      range.value = String(s.muted ? 0 : s.volume);
      range.style.setProperty('--fill', `${(s.muted ? 0 : s.volume) * 100}%`);
    }
    const btn = $('.vol-wrap [data-act="mute"]', this.root);
    if (btn) btn.innerHTML = icon(s.muted || s.volume === 0 ? 'volume-x' : s.volume < 0.5 ? 'volume-1' : 'volume-2');
  }

  private syncRateChip(): void {
    const chip = $('.rate-chip', this.root);
    if (chip) {
      chip.textContent = `${this.video.playbackRate}×`;
      chip.classList.toggle('is-modified', Math.abs(this.video.playbackRate - 1) > 0.01);
    }
  }

  private syncLoopButton(): void {
    const btn = $('[data-act="loop"]', this.root);
    if (!btn) return;
    const mode = store.settings.loop;
    btn.classList.toggle('is-on', mode !== 'off');
    btn.innerHTML = icon(mode === 'one' ? 'repeat-1' : 'repeat');
  }

  private syncSettingsUi(): void {
    this.syncVolumeUi();
    this.syncRateChip();
    this.syncLoopButton();
    this.syncShuffle(store.settings.shuffle);
  }

  private updateMeta(item: Playable): void {
    const titleEl = $('.mt-text', this.root);
    if (titleEl) titleEl.textContent = item.title;
    const kind = $('.ms-kind', this.root);
    if (kind) {
      kind.textContent = item.isStream
        ? (item.url.split('?')[0].split('/').pop() || 'STREAM').toUpperCase().slice(0, 12)
        : (ext(item.name) || 'FILE').toUpperCase();
    }
    const detail = $('.ms-detail', this.root);
    if (detail) detail.textContent = item.isStream ? item.url : item.name;
    this.updateNowMini();
  }

  private updateMetaDuration(): void {
    const detail = $('.ms-detail', this.root);
    if (!detail) return;
    const dur = this.duration;
    detail.textContent = `${this.current?.isStream ? this.current.url : this.current?.name ?? ''}${
      dur ? ` · ${fmtTime(dur)}` : ''
    }`;
  }

  private updateQueueButton(): void {
    const count = this.queue.length;
    $$('[data-act="queue"]', this.root).forEach((btn) => {
      const existing = btn.querySelector('.q-count');
      if (existing) existing.remove();
      btn.classList.toggle('has-badge', count > 1);
      if (count > 1) {
        const badge = document.createElement('span');
        badge.className = 'q-count';
        badge.textContent = String(count);
        btn.appendChild(badge);
      }
    });
  }

  private updateNowMini(): void {
    const title = $('.nm-title', this.root);
    const sub = $('.nm-sub', this.root);
    if (title) title.textContent = this.current?.title ?? '';
    if (sub) sub.textContent = this.current?.isStream ? this.current.url : this.current?.name ?? '';
  }

  private setText(title: string, badge: string): void {
    const titleEl = $('.mt-text', this.root);
    if (titleEl) titleEl.textContent = title;
    const kind = $('.ms-kind', this.root);
    if (kind) kind.textContent = badge;
  }

  /* ================================================================ */
  /* idle / overlay visibility                                        */
  /* ================================================================ */

  /** Detach every window-level listener so a rebuilt player leaves no ghosts. */
  destroy(): void {
    this.disposers.forEach((fn) => {
      try {
        fn();
      } catch {
        /* noop */
      }
    });
    this.disposers = [];
    this.teardownEngine();
    this.stopProgressTicker();
    this.queue.forEach((q) => this.revokeIfOwned(q));
    this.queue = [];
    this.current = null;
  }

  private onWindow<K extends keyof WindowEventMap>(
    type: K,
    handler: (ev: WindowEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ): void {
    window.addEventListener(type, handler as EventListener, opts);
    this.disposers.push(() => window.removeEventListener(type, handler as EventListener, opts));
  }

  private startIdleLoop(): void {
    const wake = (): void => this.showUi();
    this.wrap.addEventListener('pointermove', wake, { passive: true });
    this.wrap.addEventListener('pointerdown', wake, { passive: true });
    this.wrap.addEventListener('touchstart', wake, { passive: true });
    this.root.addEventListener('focusin', wake);
  }

  showUi(): void {
    this.wrap.dataset.idle = 'false';
    this.wrap.classList.add('ui-visible');
    this.scheduleHide();
  }

  private toggleUiVisible(): void {
    const visible = this.wrap.classList.contains('ui-visible');
    if (visible) {
      this.wrap.classList.remove('ui-visible');
      this.wrap.dataset.idle = 'true';
      $('.big-play', this.root)?.classList.remove('show');
    } else {
      this.showUi();
      if (this.video.paused && this.current) $('.big-play', this.root)?.classList.add('show');
    }
  }

  private scheduleHide(): void {
    clearTimeout(this.hideTimer);
    if (!this.playing) return;
    this.hideTimer = window.setTimeout(() => {
      if (this.playing) {
        this.wrap.classList.remove('ui-visible');
        this.wrap.dataset.idle = 'true';
      }
    }, 2800);
  }

  private flashHud(kind: 'volume' | 'muted' | 'forward' | 'back', text: string): void {
    const hud = $('.gesture-hud', this.root)!;
    const ico = $('.gh-ico', hud)!;
    const label = $('.gh-text', hud)!;
    ico.innerHTML = icon(kind === 'muted' ? 'volume-x' : kind === 'volume' ? 'volume-2' : kind === 'forward' ? 'step-forward' : 'step-back');
    label.textContent = text;
    hud.classList.add('show');
    clearTimeout(this.hudTimer);
    this.hudTimer = window.setTimeout(() => hud.classList.remove('show'), 900);
  }

  private hudTimer = 0;

  /* ================================================================ */
  /* keyboard                                                         */
  /* ================================================================ */

  private bindKeyboard(): void {
    this.onWindow('keydown', (e) => {
      if (isTextEntry(e.target)) return;
      if (document.documentElement.dataset.kbdHelp === 'open') return;
      const tv = document.documentElement.dataset.tv === 'true';
      const mod = e.ctrlKey || e.metaKey;

      if (mod) return;

      const k = e.key;
      const step = store.settings.seekStep;
      const longStep = store.settings.seekStepLong;
      const volStep = store.settings.volumeStep;

      const handled = (): void => {
        e.preventDefault();
        e.stopPropagation();
      };

      switch (k) {
        case ' ':
        case 'k':
        case 'K':
          if (!this.current && document.body.dataset.view === 'player') {
            handled();
            this.openFiles();
            return;
          }
          handled();
          this.toggle();
          this.showUi();
          return;
        case 'ArrowRight':
          if (tv) return;
          handled();
          this.seekBy(e.shiftKey ? longStep : step);
          this.showUi();
          return;
        case 'ArrowLeft':
          if (tv) return;
          handled();
          this.seekBy(-(e.shiftKey ? longStep : step));
          this.showUi();
          return;
        case 'ArrowUp':
          if (tv) return;
          handled();
          this.setVolume(store.settings.volume + volStep);
          this.flashHud('volume', `${n(Math.round(store.settings.volume * 100))}%`);
          this.showUi();
          return;
        case 'ArrowDown':
          if (tv) return;
          handled();
          this.setVolume(store.settings.volume - volStep);
          this.flashHud('volume', `${n(Math.round(store.settings.volume * 100))}%`);
          this.showUi();
          return;
        case 'j':
        case 'J':
          handled();
          this.seekBy(-10);
          return;
        case 'l':
        case 'L':
          handled();
          this.seekBy(10);
          return;
        case 'm':
        case 'M':
          handled();
          this.toggleMute();
          return;
        case 'f':
        case 'F':
          handled();
          void this.toggleFullscreen();
          return;
        case 'p':
        case 'P':
          handled();
          void this.togglePip();
          return;
        case 'v':
        case 'V':
          handled();
          this.toggleSubtitles();
          return;
        case 'c':
        case 'C':
          handled();
          this.captureFrame();
          return;
        case 'n':
        case 'N':
          handled();
          this.next();
          return;
        case 'b':
        case 'B':
          handled();
          this.prev();
          return;
        case 'q':
        case 'Q':
          handled();
          this.openQueueDrawer();
          return;
        case 'o':
        case 'O':
          handled();
          void this.openFiles();
          return;
        case ',':
          handled();
          this.stepFrame(-1);
          return;
        case '.':
          handled();
          this.stepFrame(1);
          return;
        case '[':
          handled();
          this.setRate(Math.max(0.25, Math.round((store.settings.rate - 0.25) * 100) / 100));
          return;
        case ']':
          handled();
          this.setRate(Math.min(4, Math.round((store.settings.rate + 0.25) * 100) / 100));
          return;
        case 'Home':
          handled();
          this.seek(0);
          return;
        case 'End':
          handled();
          this.seek(this.duration);
          return;
        case '?':
        case '/':
          handled();
          window.dispatchEvent(new CustomEvent('rozh:shortcuts'));
          return;
        case 'Escape':
          if (this.wrap.classList.contains('fs-fallback')) {
            this.wrap.classList.remove('fs-fallback');
            this.wrap.dataset.fs = 'false';
          }
          return;
        default:
          break;
      }

      if (/^[0-9]$/.test(k) && this.current) {
        handled();
        this.seekPercent(Number(k) * 10);
      }
    });
  }

  /* ================================================================ */
  /* touch gestures                                                   */
  /* ================================================================ */

  private bindGestures(): void {
    if (!platform.touch) return;
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let startVolume = 0;
    let startBrightness = 1;
    let mode: 'none' | 'volume' | 'brightness' = 'none';
    let moved = false;
    let lastTap = 0;

    this.stage.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length !== 1) return;
        const tch = e.touches[0];
        startX = tch.clientX;
        startY = tch.clientY;
        startTime = Date.now();
        startVolume = store.settings.volume;
        startBrightness = this.brightness;
        mode = 'none';
        moved = false;
      },
      { passive: true },
    );

    this.stage.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length !== 1 || !this.current) return;
        const tch = e.touches[0];
        const dx = tch.clientX - startX;
        const dy = tch.clientY - startY;
        if (!moved && Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx) * 1.4) {
          const rect = this.stage.getBoundingClientRect();
          mode = startX - rect.left < rect.width / 2 ? 'volume' : 'brightness';
          moved = true;
        }
        if (mode === 'volume') {
          const next = clamp(startVolume - dy / (this.stage.clientHeight * 0.7), 0, 1);
          store.patch({ volume: next, muted: false });
          this.applyVolume();
          this.flashHud('volume', `${n(Math.round(next * 100))}%`);
        } else if (mode === 'brightness') {
          this.brightness = clamp(startBrightness - dy / (this.stage.clientHeight * 0.8), 0.35, 1.6);
          this.video.style.filter = `brightness(${this.brightness}) contrast(${
            store.settings.sdrBoost ? 1.06 : 1
          }) saturate(${store.settings.sdrBoost ? 1.12 : 1})`;
          this.flashHud('volume', `☀ ${n(Math.round(this.brightness * 100))}%`);
        }
      },
      { passive: true },
    );

    this.stage.addEventListener('touchend', (e) => {
      if (!this.current) return;
      const tch = e.changedTouches[0];
      const dx = tch.clientX - startX;
      const dy = tch.clientY - startY;
      const dt = Date.now() - startTime;
      if (mode !== 'none') {
        mode = 'none';
        return;
      }
      if (Math.abs(dx) > 40 || Math.abs(dy) > 40 || dt > 400) return;
      const now = Date.now();
      const rect = this.stage.getBoundingClientRect();
      const leftSide = tch.clientX - rect.left < rect.width / 2;
      if (now - lastTap < 320) {
        this.seekBy(leftSide ? -10 : 10);
        lastTap = 0;
      } else {
        lastTap = now;
      }
    });
  }

  /* ================================================================ */
  /* drag & drop (+ paste)                                            */
  /* ================================================================ */

  private bindDragDrop(host: HTMLElement): void {
    const dz = () => $('.drop-zone', host);
    let depth = 0;
    const onOver = (e: DragEvent): void => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      dz()?.classList.add('hot');
    };
    this.onWindow('dragenter', (e) => {
      depth++;
      onOver(e);
    });
    this.onWindow('dragover', onOver);
    this.onWindow('dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) dz()?.classList.remove('hot');
    });
    this.onWindow('drop', (e) => {
      e.preventDefault();
      depth = 0;
      dz()?.classList.remove('hot');
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) void this.loadFiles(files);
    });
    this.onWindow('paste', (e) => {
      const text = e.clipboardData?.getData('text/plain')?.trim();
      if (text && /^https?:\/\//i.test(text)) {
        this.playStream(text, text.split('/').pop() || text);
      }
    });
  }

  /* ================================================================ */
  /* open dialogs & drawers                                           */
  /* ================================================================ */

  async openFiles(): Promise<void> {
    const files = await pickFiles();
    if (files.length) await this.loadFiles(files);
  }

  async loadFiles(files: File[]): Promise<void> {
    const subs = files.filter((f) => /\.(srt|vtt|ass|ssa)$/i.test(f.name));
    const media = files.filter((f) => !/\.(srt|vtt|ass|ssa)$/i.test(f.name));
    if (!media.length && subs.length && this.current) {
      for (const s of subs) await this.addSubtitleFile(s);
      return;
    }
    if (!media.length) return;

    const playables = media.map((f) => this.fileToPlayable(f));
    this.setQueue(playables, 0);
    await this.load(playables[0]);
    for (const s of subs) await this.addSubtitleFile(s);
    window.dispatchEvent(new CustomEvent('rozh:files-opened', { detail: { playables, files: media } }));
  }

  fileToPlayable(file: File): Playable {
    const nativePath = (file as NativeFile).__path;
    const nativeUrl = (file as NativeFile).__url;
    const url = nativeUrl ?? URL.createObjectURL(file);
    const isAudio = isAudioFile(file.name);
    return {
      // native files carry no byte size, so the absolute path is the identity
      key: nativePath ? `native::${nativePath}` : `${file.name}::${file.size}`,
      name: file.name,
      title: file.name.replace(/\.[^.]+$/, ''),
      url,
      isStream: false,
      kind: isAudio ? 'audio' : 'video',
      size: file.size,
      owned: !nativeUrl,
      file,
    };
  }

  playStream(url: string, title?: string, autoplay = true): void {
    const clean = url.split('?')[0].toLowerCase();
    const isHls = /\.m3u8$/.test(clean);
    const isDash = /\.mpd$/.test(clean);
    const isAudio = /\.(mp3|m4a|aac|flac|wav|ogg|opus)$/.test(clean);
    const item: Playable = {
      key: `url::${url}`,
      name: title || url.split('/').pop() || url,
      title: title || (isHls ? 'HLS stream' : isDash ? 'DASH stream' : 'Network stream'),
      url,
      isStream: true,
      kind: isAudio ? 'audio' : isHls || isDash ? 'stream' : 'video',
      size: 0,
    };
    this.setQueue([item], 0);
    void this.load(item, { autoplay });
  }

  playDemo(): void {
    const demo: Playable = {
      key: 'demo::aurora',
      name: 'aurora.mp4',
      title: 'Aurora — ROZH demo reel',
      url: '/demo/aurora.mp4',
      isStream: false,
      kind: 'video',
      size: 680664,
    };
    this.setQueue([demo], 0);
    void this.load(demo);
  }

  private openUrlDialog(): void {
    openUrlModal((url: string, title?: string) => this.playStream(url, title));
  }

  private openQueueDrawer(): void {
    const body = document.createElement('div');
    const render = (): void => {
      if (!this.queue.length) {
        body.innerHTML = `<div class="empty-panel" style="padding:34px 16px">
          <div class="ico-wrap">${icon('list')}</div>
          <h3>${escapeHtml(t('player.emptyQueue'))}</h3>
          <p>${escapeHtml(t('player.emptyQueueSub'))}</p>
        </div>`;
        return;
      }
      body.innerHTML = `
        <div class="box-title">${icon('list')}<span>${escapeHtml(t('player.queue'))}</span><span class="spacer"></span><span class="cnt">${n(
          this.queue.length,
        )}</span></div>
        <div class="q-list">
          ${this.queue
            .map(
              (q, i) => `<div class="q-item ${i === this.index ? 'is-active' : ''}" data-i="${i}" role="button" tabindex="0">
                <span class="q-idx">${i === this.index ? icon('volume-2') : n(i + 1)}</span>
                <span class="q-meta">
                  <span class="q-name">${escapeHtml(q.title)}</span>
                  <span class="q-sub">${escapeHtml(q.isStream ? q.url : q.name)}</span>
                </span>
                <span class="q-actions">
                  <button class="iconbtn" data-del="${i}" aria-label="${escapeHtml(t('common.remove'))}">${icon('trash')}</button>
                </span>
              </div>`,
            )
            .join('')}
        </div>`;
      $$('.q-item', body).forEach((row) => {
        row.addEventListener('click', (ev) => {
          if ((ev.target as HTMLElement).closest('[data-del]')) return;
          this.playIndex(Number(row.dataset.i));
        });
      });
      $$('[data-del]', body).forEach((btn) => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const i = Number((btn as HTMLElement).dataset.del);
          const [removed] = this.queue.splice(i, 1);
          if (removed) this.revokeIfOwned(removed);
          if (i < this.index) this.index--;
          else if (i === this.index) this.index = Math.min(this.index, this.queue.length - 1);
          render();
        });
      });
    };
    render();
    openDrawer({
      title: t('player.queue'),
      icon: 'list',
      body,
      onMount: (b, close) => {
        const foot = document.createElement('div');
        foot.className = 'drawer-foot';
        foot.innerHTML = `<button class="btn btn-danger btn-sm" data-clear>${icon('trash')}<span>${escapeHtml(
          t('common.clear'),
        )}</span></button><div class="spacer"></div><button class="btn btn-primary btn-sm" data-open>${icon(
          'folder-open',
        )}<span>${escapeHtml(t('player.openFile'))}</span></button>`;
        b.parentElement?.appendChild(foot);
        $('[data-clear]', foot)?.addEventListener('click', () => {
          this.clearQueue();
          render();
        });
        $('[data-open]', foot)?.addEventListener('click', () => {
          close();
          void this.openFiles();
        });
      },
    });
  }

  private openSpeedMenu(anchor: HTMLElement): void {
    const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
    openPopover(
      anchor,
      [
        { label: t('player.speed'), head: true },
        ...speeds.map<PopItem>((s) => ({
          label: `${s}×`,
          active: Math.abs(store.settings.rate - s) < 0.01,
          onClick: () => this.setRate(s),
        })),
        { sep: true, label: '' },
        { label: '−0.25×', icon: 'minus', onClick: () => this.setRate(store.settings.rate - 0.25) },
        { label: '+0.25×', icon: 'plus', onClick: () => this.setRate(store.settings.rate + 0.25) },
      ],
      { align: 'end' },
    );
  }

  private openFitMenu(anchor: HTMLElement): void {
    const fits: { v: Fit; label: string }[] = [
      { v: 'contain', label: t('player.fit') + ' · Fit' },
      { v: 'cover', label: 'Crop' },
      { v: 'fill', label: 'Stretch' },
      { v: 'zoom', label: 'Zoom 8%' },
    ];
    openPopover(
      anchor,
      [
        { label: t('player.fit'), head: true },
        ...fits.map<PopItem>((f) => ({
          label: f.label,
          active: store.settings.fit === f.v,
          onClick: () => this.setFit(f.v),
        })),
      ],
      { align: 'end' },
    );
  }

  private openTracksDrawer(label?: string): void {
    openDrawer({
      title: t('player.subtitles'),
      icon: 'subtitles',
      body: '<div class="opt-list" data-subs></div><div class="box-title" style="margin-top:14px">' +
        icon('audio-wave') +
        `<span>${escapeHtml(t('player.audio'))}</span></div><div class="opt-list" data-audio></div>
        <div class="box-title" style="margin-top:14px">${icon('gauge')}<span>${escapeHtml(t('player.quality'))}</span></div>
        <div class="opt-list" data-quality></div>`,
      onMount: (body, close) => {
        const subsHost = $('[data-subs]', body)!;
        const audioHost = $('[data-audio]', body)!;
        const qualityHost = $('[data-quality]', body)!;

        const renderSubs = (): void => {
          const tracks = Array.from(this.video.textTracks);
          const rows: string[] = [
            `<button class="opt-row ${tracks.every((tt) => tt.mode !== 'showing') ? 'is-active' : ''}" data-sub="-1">
              <span class="op-label">${escapeHtml(t('common.off'))}</span>${icon('check', 'check')}
            </button>`,
          ];
          this.userSubs.forEach((s, i) => {
            const on = s.track.track?.mode === 'showing';
            rows.push(`<button class="opt-row ${on ? 'is-active' : ''}" data-sub="${i}">
              <span class="op-label">${escapeHtml(s.label)}</span>${icon('check', 'check')}
            </button>`);
          });
          if (!this.userSubs.length) {
            rows.push(
              `<div class="opt-row" style="color:var(--text-4);cursor:default"><span class="op-label">${escapeHtml(
                t('player.noSubs'),
              )}</span></div>`,
            );
          }
          subsHost.innerHTML = rows.join('');
          $$('[data-sub]', subsHost).forEach((btn) => {
            btn.addEventListener('click', () => {
              const idx = Number((btn as HTMLElement).dataset.sub);
              if (idx < 0) this.disableSubtitles();
              else {
                const entry = this.userSubs[idx];
                if (entry) this.showTrack(entry.track);
              }
              renderSubs();
            });
          });
        };
        renderSubs();

        const audioTracks = Array.from((this.video as HTMLVideoElement & { audioTracks?: { label?: string; language?: string; enabled: boolean }[] }).audioTracks ?? []);
        audioHost.innerHTML = audioTracks.length
          ? audioTracks
              .map(
                (at, i) =>
                  `<button class="opt-row ${at.enabled ? 'is-active' : ''}" data-audio-track="${i}">
                    <span class="op-label">${escapeHtml(at.label || at.language || `Track ${i + 1}`)}</span>${icon(
                      'check',
                      'check',
                    )}
                  </button>`,
              )
              .join('')
          : `<div class="opt-row" style="color:var(--text-4);cursor:default"><span class="op-label">${escapeHtml(
              t('player.noAudioTracks'),
            )}</span></div>`;
        $$('[data-audio-track]', audioHost).forEach((btn) => {
          btn.addEventListener('click', () => {
            const i = Number((btn as HTMLElement).dataset.audioTrack);
            const list = Array.from((this.video as HTMLVideoElement & { audioTracks?: { enabled: boolean }[] }).audioTracks ?? []);
            list.forEach((at, j) => (at.enabled = j === i));
            this.openTracksDrawer();
          });
        });

        const renderQuality = (): void => {
          const levels = this.hlsLevels.length ? this.hlsLevels : this.dashLevels;
          if (!levels.length) {
            qualityHost.innerHTML = `<div class="opt-row" style="color:var(--text-4);cursor:default"><span class="op-label">${escapeHtml(
              t('settings.auto'),
            )}</span></div>`;
            return;
          }
          qualityHost.innerHTML = [`<button class="opt-row ${store.settings.hlsQuality < 0 ? 'is-active' : ''}" data-q="-1">
              <span class="op-label">${escapeHtml(t('settings.auto'))}</span>${icon('check', 'check')}
            </button>`]
            .concat(
              levels.map(
                (l, i) => `<button class="opt-row ${store.settings.hlsQuality === i ? 'is-active' : ''}" data-q="${i}">
                  <span class="op-label">${l.height ? `${l.height}p` : `Level ${i + 1}`}</span>
                  <span class="op-hint">${l.bitrate ? `${Math.round(l.bitrate / 1000)} kbps` : ''}</span>
                  ${icon('check', 'check')}
                </button>`,
              ),
            )
            .join('');
          $$('[data-q]', qualityHost).forEach((btn) => {
            btn.addEventListener('click', () => {
              const i = Number((btn as HTMLElement).dataset.q);
              store.patch({ hlsQuality: i });
              if (this.hls) {
                this.hls.currentLevel = i;
                this.hls.nextLevel = i;
              }
              if (this.dash && i >= 0) {
                const dp = this.dash as unknown as { setAutoSwitchQualityFor?: (t: string, v: boolean) => void; setQualityFor?: (t: string, i: number) => void };
                dp.setAutoSwitchQualityFor?.('video', false);
                dp.setQualityFor?.('video', i);
              }
              renderQuality();
            });
          });
        };
        renderQuality();

        const foot = document.createElement('div');
        foot.className = 'drawer-foot';
        foot.innerHTML = `<button class="btn btn-sm" data-addsub>${icon('upload')}<span>${escapeHtml(
          t('player.subtitles'),
        )}</span></button><div class="spacer"></div><button class="btn btn-primary btn-sm" data-done>${escapeHtml(
          t('common.done'),
        )}</button>`;
        body.parentElement?.appendChild(foot);
        $('[data-addsub]', foot)?.addEventListener('click', async () => {
          const files = await pickFiles('.srt,.vtt,.ass,.ssa');
          for (const f of files) await this.addSubtitleFile(f);
          renderSubs();
        });
        $('[data-done]', foot)?.addEventListener('click', close);
        if (label) renderSubs();
      },
    });
  }

  private openEqDrawer(): void {
    const labels = ['60', '170', '400', '1k', '3.5k', '10k'];
    openDrawer({
      title: t('player.equalizer'),
      icon: 'sliders',
      body: `
        <div class="setting-row" style="padding:0 0 12px">
          <div class="sr-label"><b>${escapeHtml(t('settings.eq'))}</b><small>${escapeHtml(t('settings.eqSub'))}</small></div>
          <div class="sr-ctrl"><button class="switch" role="switch" data-eq-toggle aria-checked="${
            store.settings.eqEnabled
          }"></button></div>
        </div>
        <div class="eq">
          ${labels
            .map(
              (l, i) => `<div class="eq-band">
                <input type="range" min="-12" max="12" step="0.5" value="${this.eqGainDb[i] ?? 0}" data-band="${i}" aria-label="${l} Hz" />
                <label>${l}</label>
              </div>`,
            )
            .join('')}
        </div>
        <div class="chip-grid" style="grid-template-columns:repeat(3,1fr);margin-top:12px">
          <button data-preset="flat">Flat</button>
          <button data-preset="bass">Bass</button>
          <button data-preset="voice">Voice</button>
        </div>`,
      onMount: (body) => {
        const sw = $('[data-eq-toggle]', body)!;
        sw.addEventListener('click', () => {
          const on = sw.getAttribute('aria-checked') !== 'true';
          sw.setAttribute('aria-checked', String(on));
          void this.setEqEnabled(on);
        });
        $$('[data-band]', body).forEach((input) => {
          input.addEventListener('input', () => {
            void this.setEqBand(Number((input as HTMLInputElement).dataset.band), Number((input as HTMLInputElement).value));
          });
        });
        const presets: Record<string, number[]> = {
          flat: [0, 0, 0, 0, 0, 0],
          bass: [8, 5, 1, 0, 0, -1],
          voice: [-2, 0, 3, 5, 3, 1],
        };
        $$('[data-preset]', body).forEach((btn) => {
          btn.addEventListener('click', () => {
            const values = presets[(btn as HTMLElement).dataset.preset ?? 'flat'];
            values.forEach((v, i) => {
              this.eqGainDb[i] = v;
              const input = $(`[data-band="${i}"]`, body) as HTMLInputElement | null;
              if (input) input.value = String(v);
            });
            store.patch({ eq: [...this.eqGainDb] });
            if (store.settings.eqEnabled) this.eqNodes.forEach((node, i) => (node.gain.value = values[i]));
            const swEl = $('[data-eq-toggle]', body)!;
            if (swEl.getAttribute('aria-checked') !== 'true') {
              swEl.setAttribute('aria-checked', 'true');
              void this.setEqEnabled(true);
            }
          });
        });
      },
    });
  }

  /* ================================================================ */
  /* media session                                                    */
  /* ================================================================ */

  private updateMediaSession(): void {
    if (!('mediaSession' in navigator) || !this.current) return;
    const artwork = [
      { src: '/icons/rozh-256.png', sizes: '256x256', type: 'image/png' },
      { src: '/icons/rozh-512.png', sizes: '512x512', type: 'image/png' },
    ];
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: this.current.title,
        artist: this.current.isStream ? 'ROZH Player · Stream' : this.current.artist || 'ROZH Player',
        album: 'ROZH Player',
        artwork: this.current.thumb ? [{ src: this.current.thumb, sizes: '384x216', type: 'image/jpeg' }, ...artwork] : artwork,
      });
      const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null): void => {
        try {
          navigator.mediaSession.setActionHandler(action, handler);
        } catch {
          /* unsupported action */
        }
      };
      set('play', () => void this.play());
      set('pause', () => this.pause());
      set('stop', () => this.pause());
      set('seekbackward', (d) => this.seekBy(-(d.seekOffset ?? 10)));
      set('seekforward', (d) => this.seekBy(d.seekOffset ?? 10));
      set('seekto', (d) => {
        if (typeof d.seekTime === 'number') this.seek(d.seekTime);
      });
      set('previoustrack', () => this.prev());
      set('nexttrack', () => this.next());
    } catch {
      /* MediaMetadata unavailable */
    }
  }
}

/* ------------------------------------------------------------------ */
/* helpers                                                           */
/* ------------------------------------------------------------------ */

/** Convert SubRip to WebVTT so the native text-track engine can show it. */
export function srtToVtt(srt: string): string {
  const body = srt
    .replace(/\r+/g, '')
    .replace(/^\uFEFF/, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    .trim();
  return `WEBVTT\n\n${body}\n`;
}

export function mountPlayer(host: HTMLElement): Player {
  return new Player(host);
}
