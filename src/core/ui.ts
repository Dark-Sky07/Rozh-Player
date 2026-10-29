/** ROZH Player — toasts, drawers, modals and popovers. */

import { icon } from './icons';
import { $, escapeHtml, uid } from './util';
import { t } from './i18n';

/* ------------------------------------------------------------------ */
/* toasts                                                             */
/* ------------------------------------------------------------------ */

let toastHost: HTMLElement | null = null;

function host(): HTMLElement {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'toasts';
    toastHost.setAttribute('role', 'status');
    toastHost.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastHost);
  }
  return toastHost;
}

export type ToastKind = 'info' | 'ok' | 'warn' | 'bad';

export function toast(message: string, kind: ToastKind = 'info', ms = 2600): void {
  const el = document.createElement('div');
  el.className = 'toast';
  el.dataset.kind = kind;
  const glyph = kind === 'ok' ? 'check' : kind === 'bad' ? 'x' : kind === 'warn' ? 'info' : 'info';
  el.innerHTML = `${icon(glyph)}<div>${message}</div>`;
  host().appendChild(el);
  const kill = (): void => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  };
  const timer = window.setTimeout(kill, ms);
  el.addEventListener('click', () => {
    clearTimeout(timer);
    kill();
  });
  // keep the stack short
  const all = host().children;
  if (all.length > 4) all[0].remove();
}

/* ------------------------------------------------------------------ */
/* overlay stack                                                      */
/* ------------------------------------------------------------------ */

type CloseFn = () => void;
const stack: { id: string; close: CloseFn }[] = [];

let backdrop: HTMLElement | null = null;

function ensureBackdrop(): HTMLElement {
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    backdrop.addEventListener('click', () => closeTop());
    document.body.appendChild(backdrop);
  }
  return backdrop;
}

function syncBackdrop(): void {
  const bd = ensureBackdrop();
  bd.classList.toggle('show', stack.length > 0);
  document.body.dataset.overlay = stack.length > 0 ? 'true' : 'false';
}

export function closeTop(): void {
  const top = stack[stack.length - 1];
  if (top) top.close();
}

export function closeAllOverlays(): void {
  [...stack].reverse().forEach((s) => s.close());
}

export function hasOverlay(): boolean {
  return stack.length > 0;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && stack.length) {
    e.stopPropagation();
    closeTop();
  }
});

/* ------------------------------------------------------------------ */
/* drawer (side sheet)                                                */
/* ------------------------------------------------------------------ */

export interface DrawerOptions {
  title: string;
  icon?: string;
  width?: number;
  body: string | HTMLElement;
  onMount?: (body: HTMLElement, close: () => void) => void;
  onClose?: () => void;
}

export function openDrawer(opts: DrawerOptions): () => void {
  const el = document.createElement('div');
  el.className = 'drawer';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', opts.title);
  if (opts.width) el.style.width = `min(${opts.width}px, 100vw)`;
  el.innerHTML = `
    <div class="drawer-head">
      ${opts.icon ? icon(opts.icon) : ''}
      <h3>${escapeHtml(opts.title)}</h3>
      <button class="iconbtn" data-close aria-label="${escapeHtml(t('common.close'))}">${icon('x')}</button>
    </div>
    <div class="drawer-body"></div>`;
  const body = $('.drawer-body', el)!;
  if (typeof opts.body === 'string') body.innerHTML = opts.body;
  else body.appendChild(opts.body);

  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));

  const id = uid('drawer');
  const close = (): void => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 380);
    const i = stack.findIndex((s) => s.id === id);
    if (i >= 0) stack.splice(i, 1);
    syncBackdrop();
  };
  stack.push({ id, close });
  syncBackdrop();

  $('[data-close]', el)?.addEventListener('click', close);
  opts.onMount?.(body, close);

  // swipe-to-close on touch
  let startY = 0;
  let startX = 0;
  let tracking = false;
  el.addEventListener(
    'touchstart',
    (e) => {
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      tracking = body.scrollTop <= 0;
    },
    { passive: true },
  );
  el.addEventListener(
    'touchmove',
    (e) => {
      if (!tracking) return;
      const dy = e.touches[0].clientY - startY;
      const dx = Math.abs(e.touches[0].clientX - startX);
      if (dy > 90 && dx < 60) {
        tracking = false;
        close();
      }
    },
    { passive: true },
  );

  return close;
}

/* ------------------------------------------------------------------ */
/* modal                                                              */
/* ------------------------------------------------------------------ */

export interface ModalOptions {
  title: string;
  icon?: string;
  body: string | HTMLElement;
  footer?: string;
  onMount?: (root: HTMLElement, close: () => void) => void;
  onClose?: () => void;
  width?: number;
}

export function openModal(opts: ModalOptions): () => void {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(opts.title)}" ${
      opts.width ? `style="width:min(${opts.width}px,100%)"` : ''
    }>
      <div class="modal-head">
        ${opts.icon ? icon(opts.icon) : ''}
        <h3>${escapeHtml(opts.title)}</h3>
        <button class="iconbtn" data-close aria-label="${escapeHtml(t('common.close'))}">${icon('x')}</button>
      </div>
      <div class="modal-body"></div>
      ${opts.footer ? `<div class="modal-foot">${opts.footer}</div>` : ''}
    </div>`;
  const body = $('.modal-body', wrap)!;
  if (typeof opts.body === 'string') body.innerHTML = opts.body;
  else body.appendChild(opts.body);
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('show'));

  const id = uid('modal');
  const close = (): void => {
    wrap.classList.remove('show');
    setTimeout(() => wrap.remove(), 320);
    const i = stack.findIndex((s) => s.id === id);
    if (i >= 0) stack.splice(i, 1);
    syncBackdrop();
    opts.onClose?.();
  };
  stack.push({ id, close });
  syncBackdrop();

  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) close();
  });
  wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  opts.onMount?.(wrap, close);
  return close;
}

export function confirmDialog(message: string, opts?: { danger?: boolean; okLabel?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    let answered = false;
    openModal({
      title: opts?.danger ? t('common.clear') : t('common.ok'),
      icon: opts?.danger ? 'trash' : 'info',
      body: `<p class="modal-hint" style="font-size:.92rem;color:var(--text-1)">${escapeHtml(message)}</p>`,
      footer: `<button class="btn" data-cancel>${escapeHtml(t('common.cancel'))}</button>
               <button class="btn ${opts?.danger ? 'btn-danger' : 'btn-primary'}" data-ok>${
                 escapeHtml(opts?.okLabel ?? t('common.ok'))
               }</button>`,
      onMount: (root, closeFn) => {
        $('[data-cancel]', root)?.addEventListener('click', () => {
          answered = true;
          resolve(false);
          closeFn();
        });
        $('[data-ok]', root)?.addEventListener('click', () => {
          answered = true;
          resolve(true);
          closeFn();
        });
      },
      onClose: () => {
        if (!answered) resolve(false);
      },
    });
  });
}

/* ------------------------------------------------------------------ */
/* popover menu                                                       */
/* ------------------------------------------------------------------ */

export interface PopItem {
  label: string;
  icon?: string;
  hint?: string;
  active?: boolean;
  danger?: boolean;
  onClick?: () => void;
  sep?: boolean;
  head?: boolean;
}

export function openPopover(anchor: HTMLElement, items: PopItem[], opts?: { align?: 'start' | 'center' | 'end' }): () => void {
  const pop = document.createElement('div');
  pop.className = 'popover';
  pop.setAttribute('role', 'menu');
  pop.innerHTML = items
    .map((it, i) => {
      if (it.sep) return '<div class="pop-sep"></div>';
      if (it.head) return `<div class="pop-head">${escapeHtml(it.label)}</div>`;
      return `<button class="pop-item ${it.active ? 'is-active' : ''} ${it.danger ? 'danger' : ''}" role="menuitem" data-i="${i}">
        ${it.icon ? icon(it.icon) : '<span style="width:16px"></span>'}
        <span class="pl">${escapeHtml(it.label)}</span>
        ${it.active ? icon('check') : it.hint ? `<span class="pk">${escapeHtml(it.hint)}</span>` : ''}
      </button>`;
    })
    .join('');
  document.body.appendChild(pop);

  const rect = anchor.getBoundingClientRect();
  const pr = pop.getBoundingClientRect();
  const align = opts?.align ?? 'center';
  let left = rect.left + rect.width / 2 - pr.width / 2;
  if (align === 'start') left = rect.left;
  if (align === 'end') left = rect.right - pr.width;
  left = Math.max(10, Math.min(left, window.innerWidth - pr.width - 10));
  let top = rect.top - pr.height - 10;
  if (top < 10) top = rect.bottom + 10;
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  pop.style.transformOrigin = top < rect.top ? 'bottom center' : 'top center';

  requestAnimationFrame(() => pop.classList.add('show'));

  const id = uid('pop');
  const close = (): void => {
    pop.classList.remove('show');
    setTimeout(() => pop.remove(), 200);
    const i = stack.findIndex((s) => s.id === id);
    if (i >= 0) stack.splice(i, 1);
    syncBackdrop();
    document.removeEventListener('pointerdown', onOutside, true);
  };
  stack.push({ id, close });
  syncBackdrop();

  function onOutside(e: PointerEvent): void {
    if (!pop.contains(e.target as Node) && !anchor.contains(e.target as Node)) close();
  }
  setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);

  pop.querySelectorAll<HTMLButtonElement>('.pop-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const it = items[Number(btn.dataset.i)];
      close();
      it?.onClick?.();
    });
  });

  return close;
}
