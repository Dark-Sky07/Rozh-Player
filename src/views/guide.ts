/** Android TV XMLTV guide for imported IPTV playlists. */

import type { AppContext } from '../core/context';
import { escapeHtml, platform, $ } from '../core/util';
import { icon, hydrateIcons } from '../core/icons';
import { n, t } from '../core/i18n';
import { store, type GuideProgram, type MediaItem, type MediaPlaylist } from '../core/store';
import { toast } from '../core/ui';
import {
  cancelScheduledRecording,
  getScheduledRecordings,
  isRecording,
  scheduleIptvRecording,
  startIptvRecording,
  stopIptvRecording,
} from '../core/recording';

const MAX_XML_BYTES = 20 * 1024 * 1024;
const MAX_PROGRAMS = 20_000;
const recordingWatchers = new WeakMap<HTMLElement, () => void>();

function xmltvDate(raw: string): number | null {
  const match = raw.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-])(\d{2})(\d{2}))?/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s, sign, offsetHours, offsetMinutes] = match;
  const localAsUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  if (!sign) return localAsUtc;
  const offset = (Number(offsetHours) * 60 + Number(offsetMinutes)) * (sign === '+' ? 1 : -1);
  return localAsUtc - offset * 60_000;
}

/** Parse only programmes belonging to this playlist's imported channels. */
export function parseXMLTV(xml: string, items: MediaItem[], now = Date.now()): GuideProgram[] {
  if (xml.length > MAX_XML_BYTES) throw new Error('large');
  const channels = new Map<string, string>();
  const aliases = new Map<string, string>();
  for (const item of items) {
    if (item.tvgId) channels.set(item.tvgId, item.id);
    aliases.set(item.title.trim().toLowerCase(), item.id);
    aliases.set(item.name.trim().toLowerCase(), item.id);
  }
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('xml');
  for (const channel of Array.from(doc.querySelectorAll('channel'))) {
    const channelId = channel.getAttribute('id') ?? '';
    if (!channelId || channels.has(channelId)) continue;
    const names = Array.from(channel.querySelectorAll('display-name')).map((node) => node.textContent?.trim().toLowerCase() ?? '');
    const match = names.map((name) => aliases.get(name)).find(Boolean);
    if (match) channels.set(channelId, match);
  }
  if (!channels.size) return [];
  const from = now - 6 * 60 * 60_000;
  const until = now + 7 * 24 * 60 * 60_000;
  const programs: GuideProgram[] = [];
  for (const node of Array.from(doc.querySelectorAll('programme'))) {
    if (programs.length >= MAX_PROGRAMS) break;
    const targetChannel = channels.get(node.getAttribute('channel') ?? '');
    if (!targetChannel) continue;
    const start = xmltvDate(node.getAttribute('start') ?? '');
    const stop = xmltvDate(node.getAttribute('stop') ?? '');
    if (start == null || stop == null || stop <= start || stop < from || start > until) continue;
    const title = node.querySelector('title')?.textContent?.trim();
    if (!title) continue;
    const description = node.querySelector('desc')?.textContent?.trim().slice(0, 4000);
    const category = node.querySelector('category')?.textContent?.trim().slice(0, 120);
    programs.push({
      channelId: targetChannel,
      title: title.slice(0, 240),
      ...(description ? { description } : {}),
      ...(category ? { category } : {}),
      start,
      stop,
    });
  }
  return programs.sort((a, b) => a.start - b.start || a.channelId.localeCompare(b.channelId));
}

function clock(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

function programCard(item: MediaItem, sorted: GuideProgram[], now: number): string {
  const current = sorted.find((program) => program.start <= now && program.stop > now);
  const next = sorted.find((program) => program.start >= (current?.stop ?? now));
  const existingSchedule = next && item.url
    ? getScheduledRecordings().find((entry) => entry.url === item.url && entry.startAt === next.start && entry.stopAt === next.stop)
    : undefined;
  const percent = current ? Math.min(100, Math.max(0, ((now - current.start) / (current.stop - current.start)) * 100)) : 0;
  const recordingThis = isRecording(item.url);
  const recordingBusy = isRecording() && !recordingThis;
  return `<article class="guide-channel">
    <div class="guide-channel-source">
    <button class="guide-channel-play" data-guide-play="${escapeHtml(item.id)}" aria-label="${escapeHtml(t('player.play') + ' ' + item.title)}">
      ${item.thumb ? `<img src="${escapeHtml(item.thumb)}" alt="" loading="lazy" />` : `<span class="guide-channel-mark">${icon('broadcast')}</span>`}
      <span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.bucket ?? t('player.stream'))}</small></span>
      ${icon('play')}
    </button>
    ${platform.tauri && !platform.mobile && item.url ? `<button class="btn guide-record" data-guide-record="${escapeHtml(item.id)}" ${recordingBusy ? 'disabled' : ''}>${icon(recordingThis ? 'square' : 'video')}<span>${escapeHtml(
      t(recordingThis ? 'pvr.stop' : 'pvr.record'),
    )}</span></button>` : ''}
    </div>
    <div class="guide-programs">
      ${current ? `<div class="guide-program guide-current"><small>${escapeHtml(t('guide.now'))} · ${clock(current.start)}–${clock(current.stop)}</small><b>${escapeHtml(current.title)}</b>${current.category ? `<span>${escapeHtml(current.category)}</span>` : ''}${current.description ? `<p>${escapeHtml(current.description)}</p>` : ''}<i><em style="width:${percent}%"></em></i></div>` : `<div class="guide-program guide-no-program"><small>${escapeHtml(t('guide.now'))}</small><b>${escapeHtml(t('guide.noCurrent'))}</b></div>`}
      ${next ? `<div class="guide-program guide-next"><small>${escapeHtml(t('guide.next'))} · ${clock(next.start)}</small><b>${escapeHtml(next.title)}</b>${platform.tauri && !platform.mobile && item.url ? `<button class="btn guide-schedule" data-guide-schedule="${escapeHtml(item.id)}" data-schedule-start="${next.start}" data-schedule-stop="${next.stop}" data-schedule-title="${escapeHtml(next.title)}" ${existingSchedule ? `data-scheduled-id="${escapeHtml(existingSchedule.id)}"` : ''}>${icon(existingSchedule ? 'x' : 'calendar')}<span>${escapeHtml(t(existingSchedule ? 'pvr.cancelSchedule' : 'pvr.schedule'))}</span></button>` : ''}</div>` : ''}
    </div>
  </article>`;
}

function scheduledMarkup(): string {
  const entries = getScheduledRecordings();
  if (!entries.length) return '';
  return `<section class="guide-scheduled"><header><h3>${escapeHtml(t('pvr.scheduledTitle'))}</h3><span>${entries.length}</span></header>
    ${entries.map((entry) => `<article><div><b>${escapeHtml(entry.title)}</b><small>${escapeHtml(new Date(entry.startAt).toLocaleString())} – ${escapeHtml(new Date(entry.stopAt).toLocaleTimeString())}</small></div>
      <button class="btn" data-cancel-schedule="${escapeHtml(entry.id)}">${icon('x')}<span>${escapeHtml(t('pvr.cancelSchedule'))}</span></button></article>`).join('')}
  </section>`;
}

function guideMarkup(playlists: MediaPlaylist[], data: Map<string, GuideProgram[]>): string {
  const now = Date.now();
  const usable = playlists.flatMap((playlist) => {
    const items = store.playlistItems(playlist.id).filter((item) => item.tvgId || item.guidePlaylistId === playlist.id);
    const programs = data.get(playlist.id) ?? [];
    return items.length ? [{ playlist, items, programs }] : [];
  });
  if (!usable.length) {
    return `<div class="empty-panel"><div class="ico-wrap">${icon('tv')}</div><h3>${escapeHtml(t('guide.empty'))}</h3><p>${escapeHtml(
      t('guide.emptySub'),
    )}</p><button class="btn btn-primary" data-guide-playlists>${icon('list-video')}<span>${escapeHtml(t('library.playlists'))}</span></button></div>`;
  }
  return usable.map(({ playlist, items, programs }) => {
    const byChannel = new Map<string, GuideProgram[]>();
    for (const program of programs) {
      const list = byChannel.get(program.channelId) ?? [];
      list.push(program);
      byChannel.set(program.channelId, list);
    }
    return `<section class="guide-playlist">
      <header class="guide-playlist-head"><h2>${escapeHtml(playlist.name)}</h2><span>${escapeHtml(t('guide.programs', { n: n(programs.length) }))}</span></header>
      ${items.map((item) => programCard(item, byChannel.get(item.id) ?? [], now)).join('')}
    </section>`;
  }).join('');
}

async function fetchGuide(url: string): Promise<string> {
  const response = platform.tauri
    ? await (await import('@tauri-apps/plugin-http')).fetch(url)
    : await fetch(url);
  if (!response.ok) throw new Error(`http-${response.status}`);
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > MAX_XML_BYTES) throw new Error('large');
  const xml = await response.text();
  if (xml.length > MAX_XML_BYTES) throw new Error('large');
  return xml;
}

export function renderGuide(host: HTMLElement, ctx: AppContext): void {
  const playlists = store.getPlaylists().filter((playlist) => !!playlist.epgUrl);
  host.innerHTML = `<div class="view-head guide-head"><div><h2>${escapeHtml(t('guide.title'))}</h2><p>${escapeHtml(t('guide.sub'))}</p></div><div class="spacer"></div><button class="btn btn-primary" data-guide-refresh ${
    playlists.length ? '' : 'disabled'
  }>${icon('rotate')}<span>${escapeHtml(t('guide.refresh'))}</span></button></div><div class="guide-content" data-guide-content><div class="empty-panel"><div class="ico-wrap">${icon(
    'calendar',
  )}</div><h3>${escapeHtml(playlists.length ? t('guide.loading') : t('guide.empty'))}</h3>${playlists.length ? '' : `<p>${escapeHtml(t('guide.emptySub'))}</p>`}</div></div>`;
  hydrateIcons(host);

  const paint = async (): Promise<void> => {
    const data = new Map<string, GuideProgram[]>();
    await Promise.all(playlists.map(async (playlist) => data.set(playlist.id, await store.getGuide(playlist.id))));
    const content = $('[data-guide-content]', host);
    if (content && document.body.dataset.view === 'guide') {
      content.innerHTML = `${scheduledMarkup()}${guideMarkup(playlists, data)}`;
      hydrateIcons(content);
      content.querySelectorAll<HTMLElement>('[data-guide-play]').forEach((button) => button.addEventListener('click', () => {
        const item = store.media.find((candidate) => candidate.id === button.dataset.guidePlay);
        if (item) void ctx.playMedia(item);
      }));
      content.querySelectorAll<HTMLElement>('[data-guide-record]').forEach((button) => button.addEventListener('click', async () => {
        const item = store.media.find((candidate) => candidate.id === button.dataset.guideRecord);
        if (item?.url && isRecording(item.url)) await stopIptvRecording();
        else if (item?.url && !isRecording()) await startIptvRecording(item.url, item.metadata?.title ?? item.title);
        await paint();
      }));
      content.querySelectorAll<HTMLElement>('[data-guide-schedule]').forEach((button) => button.addEventListener('click', async () => {
        const scheduleId = button.dataset.scheduledId;
        if (scheduleId) await cancelScheduledRecording(scheduleId);
        else {
          const item = store.media.find((candidate) => candidate.id === button.dataset.guideSchedule);
          const startAt = Number(button.dataset.scheduleStart);
          const stopAt = Number(button.dataset.scheduleStop);
          const title = button.dataset.scheduleTitle ?? item?.title ?? t('player.stream');
          if (item?.url && Number.isFinite(startAt) && Number.isFinite(stopAt)) {
            await scheduleIptvRecording(item.url, title, startAt, stopAt);
          }
        }
        await paint();
      }));
      content.querySelectorAll<HTMLElement>('[data-cancel-schedule]').forEach((button) => button.addEventListener('click', async () => {
        await cancelScheduledRecording(button.dataset.cancelSchedule ?? '');
        await paint();
      }));
      $('[data-guide-playlists]', content)?.addEventListener('click', () => ctx.navigate('library', 'playlists'));
    }
  };

  const previousWatcher = recordingWatchers.get(host);
  if (previousWatcher) window.removeEventListener('rozh:recording-state', previousWatcher);
  const watcher = (): void => void paint();
  recordingWatchers.set(host, watcher);
  window.addEventListener('rozh:recording-state', watcher);
  void paint();
  $('[data-guide-refresh]', host)?.addEventListener('click', async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    let failed = false;
    for (const playlist of playlists) {
      if (!playlist.epgUrl) continue;
      try {
        const items = store.playlistItems(playlist.id);
        const xml = await fetchGuide(playlist.epgUrl);
        const programs = parseXMLTV(xml, items);
        await store.setGuide(playlist.id, programs);
      } catch {
        failed = true;
      }
    }
    button.disabled = false;
    toast(failed ? t('guide.error') : t('guide.loaded'), failed ? 'warn' : 'ok', 2400);
    await paint();
  });
}
