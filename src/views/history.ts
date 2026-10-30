/** ROZH Player — resume list. */

import type { AppContext } from '../core/context';
import { icon, hydrateIcons } from '../core/icons';
import { t, n } from '../core/i18n';
import { store } from '../core/store';
import { confirmDialog } from '../core/ui';
import { $, $$, escapeHtml, fmtRelative, fmtTime } from '../core/util';

export function renderHistory(host: HTMLElement, ctx: AppContext): void {
  const items = store.recent();

  host.innerHTML = `
    <div class="view-head">
      <div>
        <h2>${t('history.title')}</h2>
        <p>${t('history.emptySub')}</p>
      </div>
      <div class="spacer"></div>
      ${
        items.length
          ? `<button class="btn btn-danger btn-sm" data-clear>${icon('trash')}<span>${t('history.clear')}</span></button>`
          : ''
      }
    </div>
    ${
      items.length
        ? `<div class="history-list">
            ${items
              .map((item) => {
                const pct = item.duration > 0 ? Math.min(100, Math.max(0, (item.position / item.duration) * 100)) : 0;
                const done = pct > 96;
                const left = Math.max(0, item.duration - item.position);
                return `<button class="history-item" data-id="${escapeHtml(item.id)}">
                  <span class="history-thumb">
                    ${
                      item.thumb
                        ? `<img src="${escapeHtml(item.thumb)}" alt="" loading="lazy" />`
                        : `<span class="ph">${icon(
                            item.kind === 'audio' ? 'music' : item.source === 'url' ? 'broadcast' : 'film',
                          )}</span>`
                    }
                  </span>
                  <span class="history-meta">
                    <span class="ht">${escapeHtml(item.title)}</span>
                    <span class="hs">
                      ${
                        done
                          ? `<span style="color:var(--ok)">${t('history.completed')}</span>`
                          : left > 0
                            ? t('history.left', { t: fmtTime(left) })
                            : t('player.stream')
                      }
                      · ${escapeHtml(fmtRelative(item.playedAt))}
                      ${item.plays > 1 ? ` · ${t('history.plays', { n: n(item.plays) })}` : ''}
                    </span>
                    ${pct > 0 ? `<span class="history-bar"><i style="width:${pct}%"></i></span>` : ''}
                  </span>
                  <span class="history-time mono">${pct > 0 ? `${Math.round(pct)}%` : ''}</span>
                </button>`;
              })
              .join('')}
          </div>`
        : `<div class="empty-panel">
            <div class="ico-wrap">${icon('history')}</div>
            <h3>${t('history.empty')}</h3>
            <p>${t('history.emptySub')}</p>
            <button class="btn btn-primary" style="margin-top:12px" data-open>${icon('folder-open')}<span>${t(
              'player.openFile',
            )}</span></button>
          </div>`
    }`;

  hydrateIcons(host);

  $$('.history-item', host).forEach((row) => {
    row.addEventListener('click', () => {
      const item = store.media.find((m) => m.id === (row as HTMLElement).dataset.id);
      if (item) void ctx.playMedia(item);
    });
  });

  $('[data-open]', host)?.addEventListener('click', () => void ctx.openLocalFiles());

  $('[data-clear]', host)?.addEventListener('click', async () => {
    const ok = await confirmDialog(t('history.clear') + '?', { danger: true });
    if (!ok) return;
    store.clearHistory();
    renderHistory(host, ctx);
    ctx.refreshNav();
  });
}
