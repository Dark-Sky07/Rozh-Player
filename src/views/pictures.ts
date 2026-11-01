/** A simple local picture gallery for the Android TV media-center shell. */

import type { AppContext } from '../core/context';
import { icon, hydrateIcons } from '../core/icons';
import { t } from '../core/i18n';
import { store, type MediaItem } from '../core/store';
import { openModal, toast } from '../core/ui';
import { streamableUrl } from '../core/mediaServer';
import { $$, escapeHtml, isImageFile, pickFiles, platform } from '../core/util';

function imageUrl(item: MediaItem, ctx: AppContext): string | null {
  return ctx.session.get(item.id)?.url ?? item.thumb ?? null;
}

function renderViewer(items: MediaItem[], initial: number, ctx: AppContext): void {
  if (!items.length) return;
  let index = initial;
  const getBody = (): string => {
    const item = items[index]!;
    const url = imageUrl(item, ctx);
    return `<div class="picture-viewer"><div class="picture-viewer-stage">${url
      ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(item.title)}" />`
      : `<div class="empty-panel"><h3>${escapeHtml(t('pictures.unavailable'))}</h3></div>`}</div>
      <div class="picture-viewer-foot"><button class="btn" data-picture-prev ${items.length < 2 ? 'disabled' : ''}>${icon('chevron-left')}<span>${escapeHtml(
        t('player.prev'),
      )}</span></button><span>${escapeHtml(item.title)} · ${index + 1} / ${items.length}</span><button class="btn" data-picture-next ${items.length < 2 ? 'disabled' : ''}><span>${escapeHtml(
        t('player.next'),
      )}</span>${icon('chevron-right')}</button></div></div>`;
  };
  openModal({
    title: t('pictures.title'),
    icon: 'camera',
    width: 1100,
    body: getBody(),
    onMount: (root) => {
      const paint = (): void => {
        const body = root.querySelector<HTMLElement>('.modal-body');
        if (!body) return;
        body.innerHTML = getBody();
        hydrateIcons(body);
        const viewIndex = index;
        const item = items[viewIndex]!;
        const stage = body.querySelector<HTMLElement>('.picture-viewer-stage');
        if (stage && !imageUrl(item, ctx) && item.url) {
          void streamableUrl(item.url, item.name).then((url) => {
            if (index === viewIndex && !url.startsWith('content://')) {
              const liveStage = body.querySelector<HTMLElement>('.picture-viewer-stage');
              if (liveStage) liveStage.innerHTML = `<img src="${escapeHtml(url)}" alt="${escapeHtml(item.title)}" />`;
            }
          });
        }
        body.querySelector('[data-picture-prev]')?.addEventListener('click', () => {
          index = (index - 1 + items.length) % items.length;
          paint();
        });
        body.querySelector('[data-picture-next]')?.addEventListener('click', () => {
          index = (index + 1) % items.length;
          paint();
        });
      };
      paint();
      root.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          index = (index - 1 + items.length) % items.length;
          paint();
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          index = (index + 1) % items.length;
          paint();
        }
      });
    },
  });
}

export function renderPictures(host: HTMLElement, ctx: AppContext): void {
  const items = store.library().filter((item) => item.kind === 'image').sort((a, b) => b.addedAt - a.addedAt);
  host.innerHTML = `<div class="view-head"><div><h2>${escapeHtml(t('pictures.title'))}</h2><p>${escapeHtml(t('pictures.sub'))}</p></div><div class="spacer"></div><button class="btn btn-primary" data-pictures-add>${icon(
    'plus',
  )}<span>${escapeHtml(t('pictures.add'))}</span></button></div>${items.length ? `<div class="picture-grid">${items
    .map((item) => {
      const url = imageUrl(item, ctx);
      return `<button class="picture-card" data-picture-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.title)}">
        ${url ? `<img src="${escapeHtml(url)}" alt="" loading="lazy" />` : `<span>${icon('camera')}<small>${escapeHtml(t('pictures.unavailable'))}</small></span>`}
        <b>${escapeHtml(item.title)}</b>
      </button>`;
    })
    .join('')}</div>` : `<div class="empty-panel"><div class="ico-wrap">${icon('camera')}</div><h3>${escapeHtml(
    t('pictures.empty'),
  )}</h3><p>${escapeHtml(t('pictures.emptySub'))}</p><button class="btn btn-primary" data-pictures-add>${icon('plus')}<span>${escapeHtml(
    t('pictures.add'),
  )}</span></button></div>`}`;
  hydrateIcons(host);

  $$('[data-pictures-add]', host).forEach((button) => button.addEventListener('click', async () => {
    const files = await pickFiles('image/*,.jpg,.jpeg,.png,.webp,.gif,.avif,.bmp,.heic');
    const images = files.filter((file) => isImageFile(file.name));
    if (files.length && !images.length) toast(t('pictures.emptySub'), 'warn', 2200);
    if (images.length) await ctx.addFilesToLibrary(images);
    if (platform.tv) ctx.refreshNav();
  }));
  $$('[data-picture-id]', host).forEach((button) => button.addEventListener('click', () => {
    const id = (button as HTMLElement).dataset.pictureId;
    const ordered = store.library().filter((item) => item.kind === 'image').sort((a, b) => b.addedAt - a.addedAt);
    const index = ordered.findIndex((item) => item.id === id);
    if (index >= 0) renderViewer(ordered, index, ctx);
  }));
}
