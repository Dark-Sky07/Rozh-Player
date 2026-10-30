/**
 * ROZH Player — 10-foot mode (Android TV, Fire TV, gamepad-driven boxes).
 *
 * A television has no pointer: everything is reached with a D-pad. The web
 * platform can move focus with Tab, but Tab order follows the DOM, which is not
 * where the user looks. This module adds real spatial navigation on top of the
 * existing UI — arrows move to the nearest control in that direction, OK
 * activates, Back closes the topmost sheet — plus focus restore per view.
 *
 * All of it is inert unless TV mode is on (`:root[data-tv='true']`), so the
 * desktop/phone builds keep their native behaviour.
 */

import { toast } from './ui';
import { t } from './i18n';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled]):not([hidden])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[data-tv-focus]',
].join(',');

export type Dir = 'up' | 'down' | 'left' | 'right';

const isTv = (): boolean => document.documentElement.dataset.tv === 'true';

/** Topmost open sheet, so focus is trapped inside it. */
function overlayRoot(): HTMLElement | null {
  const open = Array.from(
    document.querySelectorAll<HTMLElement>('.drawer.show, .modal.show, .popover.show, .sheet.show'),
  );
  return open.length ? open[open.length - 1]! : null;
}

/**
 * Effective opacity of an element *including its ancestors*. The player fades
 * the whole control bar out while it is idle; without this walk the invisible
 * buttons would still be focusable and the D-pad would jump into nothing.
 */
function effectiveOpacity(el: HTMLElement): number {
  let opacity = 1;
  let node: HTMLElement | null = el;
  for (let depth = 0; depth < 8 && node && node !== document.body; depth += 1) {
    const cs = getComputedStyle(node);
    if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
    if (cs.pointerEvents === 'none') return 0;
    opacity *= Number(cs.opacity || '1');
    node = node.parentElement;
  }
  return opacity;
}

function visible(el: HTMLElement): boolean {
  if (el.closest('[hidden]')) return false;
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return false;
  const r = el.getBoundingClientRect();
  if (r.width < 6 || r.height < 6) return false;
  if (r.bottom < -8 || r.top > window.innerHeight + 8) return false;
  return effectiveOpacity(el) > 0.35;
}

function scope(): ParentNode {
  return overlayRoot() ?? document;
}

export function tvCandidates(): HTMLElement[] {
  const root = scope();
  const list = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if (el.dataset.tvSkip === 'true') return false;
    return visible(el);
  });
  return list;
}

export function focusEl(el: HTMLElement | null): void {
  if (!el) return;
  document.querySelectorAll('.tv-focus').forEach((n) => n.classList.remove('tv-focus'));
  el.focus({ preventScroll: true });
  el.classList.add('tv-focus');
  try {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  } catch {
    /* older webviews */
  }
}

function current(): HTMLElement | null {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body || el === document.documentElement) return null;
  return el;
}

/** Nearest neighbour in the pressed direction, scored by distance + alignment. */
export function nextInDirection(dir: Dir): HTMLElement | null {
  const list = tvCandidates();
  if (!list.length) return null;
  const from = current();
  // the video surface is focusable with tabindex=-1 and therefore not a
  // candidate itself — but it can still be the starting point of a move
  if (!from) {
    // nothing focused: enter the active view instead of the top-left icon
    const view = document.querySelector<HTMLElement>('.view.is-active');
    const inView = view ? list.find((el) => view.contains(el)) : null;
    return inView ?? list[0] ?? null;
  }

  const a = from.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  const horizontal = dir === 'left' || dir === 'right';
  // how far off-axis a jump may drift, as a share of the screen
  const maxPerpendicular = (horizontal ? window.innerHeight : window.innerWidth) * 0.5;

  /** Score a candidate; returns null when it is not in that direction. */
  const scoreOf = (el: HTMLElement, strict: boolean): number | null => {
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2;
    const by = b.top + b.height / 2;
    const dx = bx - ax;
    const dy = by - ay;
    const primary = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
    if (primary < 6) return null;
    const secondary = horizontal ? Math.abs(dy) : Math.abs(dx);
    // overlap on the perpendicular axis: what "same row / same column" means
    const overlap = horizontal
      ? Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
      : Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    if (strict) {
      // Stay inside the corridor: the two boxes share a band, or at least one
      // centre projects into the other's span. Without this a press of "up"
      // teleports from the sidebar to a title-bar icon 1300 px to the right.
      const aligned =
        overlap > 0 ||
        (horizontal ? ay >= b.top && ay <= b.bottom : ax >= b.left && ax <= b.right) ||
        (horizontal ? by >= a.top && by <= a.bottom : bx >= a.left && bx <= a.right);
      if (!aligned) return null;
      // a 14 px offset must not drag the focus across the screen
      if (secondary > primary * 6 + 240) return null;
    } else if (secondary > maxPerpendicular) {
      // second chance: anywhere in that direction, but not on the far side of
      // the display — a remote should never lose the ring in a corner
      return null;
    }
    return primary + secondary * 2.6 - overlap * 1.6 + Math.hypot(dx, dy) * 0.12;
  };

  const pick = (strict: boolean): HTMLElement | null => {
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const el of list) {
      if (el === from) continue;
      const score = scoreOf(el, strict);
      if (score !== null && score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  };

  return pick(true) ?? pick(false);
}

export function moveFocus(dir: Dir): boolean {
  const next = nextInDirection(dir);
  if (next) {
    focusEl(next);
    return true;
  }

  // Treat the side rail and the content as two deliberate regions. Spatial
  // scoring alone can miss the transition when a tall hero sits below a short
  // navigation item; every TV app must have a reliable Right-to-enter path.
  const focused = current();
  const activeView = document.querySelector<HTMLElement>('.view.is-active');
  if (focused?.closest('.tv-nav') && dir === 'right' && activeView) {
    const content = Array.from(activeView.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible);
    const target = content.find((el) => el.matches('.tv-action-primary, .tv-card, button, a[href]')) ?? content[0];
    if (target) {
      focusEl(target);
      return true;
    }
  }
  if (focused?.closest('.view.is-active') && dir === 'left') {
    const activeNav = document.querySelector<HTMLElement>('.tv-nav-item.is-active');
    if (activeNav && visible(activeNav)) {
      focusEl(activeNav);
      return true;
    }
  }

  // Nothing in that direction: on the player view, ↑/↓ from the top bar lands
  // on the video surface itself, which is where a remote expects to be.
  const stage = document.querySelector<HTMLElement>('.stage');
  if (stage && document.body.dataset.view === 'player' && (dir === 'down' || dir === 'up')) {
    const focused = current();
    if (focused !== stage) {
      focusEl(stage);
      return true;
    }
  }
  return false;
}

/** First sensible control of a view (used after route changes). */
export function focusView(view: string): void {
  if (!isTv()) return;
  const attempt = (tries: number): void => {
    const host = document.querySelector<HTMLElement>(`.view[data-view="${view}"].is-active`);
    if (!host) return;
    // keep the current focus when it already lives inside this view
    if (current()?.closest('.view') === host) return;
    const scoped = Array.from(host.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible);
    // Land on something a remote user can actually act on: a card or a button,
    // not the search box that happens to be first in the DOM.
    const preferred =
      scoped.find((el) => el.matches('.media-card, .stream-card, .opt-row')) ??
      scoped.find((el) => el.matches('.chip, .lang-cell, .nav-item')) ??
      scoped.find((el) => el.matches('button, a[href]')) ??
      scoped[0];
    if (preferred) {
      focusEl(preferred);
      return;
    }
    // views fade in, so the first probe can legitimately find nothing
    if (tries > 0) window.setTimeout(() => attempt(tries - 1), 180);
    else focusEl(document.querySelector<HTMLElement>('.nav-item.is-active'));
  };
  // the view animates in over ~200 ms; probing too early finds only faded,
  // non-focusable boxes, so the first probe waits for the first paint
  window.setTimeout(() => attempt(4), 120);
}

/**
 * True while the D-pad belongs to the video surface (seek / volume) instead of
 * the focus ring — mirrors the guard inside the player.
 */
function playerOwnsDpad(): boolean {
  if (document.body.dataset.view !== 'player') return false;
  if (overlayRoot()) return false;
  if (document.documentElement.dataset.kbdHelp === 'open') return false;
  const el = current();
  const stage = document.querySelector('.stage');
  return !el || el === stage || el.classList.contains('video');
}

function pressSpaceLike(): void {
  // `k` is the player's play/pause shortcut; using Space here would re-enter
  // this TV capture handler and synthesize another activation indefinitely.
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true }));
}

export function initTv(): void {
  if (!isTv()) return;

  document.body.classList.add('tv');
  document.documentElement.dataset.tvNav = 'on';

  let hinted = false;

  window.addEventListener(
    'keydown',
    (e) => {
      if (!isTv()) return;
      if (document.documentElement.dataset.kbdHelp === 'open') return;
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) &&
        (target as HTMLInputElement).type !== 'range';

      // range inputs: left/right adjusts the value, up/down leaves the slider
      const onRange = target instanceof HTMLInputElement && target.type === 'range';

      const dirs: Record<string, Dir> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
        DpadUp: 'up',
        DpadDown: 'down',
        DpadLeft: 'left',
        DpadRight: 'right',
        DPAD_UP: 'up',
        DPAD_DOWN: 'down',
        DPAD_LEFT: 'left',
        DPAD_RIGHT: 'right',
      };
      const keyCode = (e as KeyboardEvent & { keyCode?: number }).keyCode;
      const dir = dirs[e.key] ?? ({ 19: 'up', 20: 'down', 21: 'left', 22: 'right' } as Record<number, Dir>)[keyCode ?? -1];

      if (dir) {
        if (typing) return;
        const focused = current();
        const idlePlayerControl = document.body.dataset.view === 'player' &&
          !!focused?.closest('.stage-wrap[data-idle="true"]');
        if (idlePlayerControl) {
          // When fullscreen chrome has faded while a button still owns focus,
          // the next remote press reveals it instead of navigating into hidden UI.
          e.preventDefault();
          e.stopPropagation();
          window.dispatchEvent(new CustomEvent('rozh:show-ui'));
          const reveal = (tries: number): void => {
            const button = Array.from(document.querySelectorAll<HTMLElement>(
              '.ctrl-row .play-btn, .stage-bottom button, .stage-top-actions button',
            )).find(visible);
            if (button) focusEl(button);
            else if (tries > 0) window.setTimeout(() => reveal(tries - 1), 90);
          };
          window.setTimeout(() => reveal(6), 60);
          return;
        }
        // Let left/right adjust a focused slider; up/down must still escape it,
        // otherwise a D-pad user can get stuck on volume or seek controls.
        if (onRange && (dir === 'left' || dir === 'right')) return;

        if (playerOwnsDpad()) {
          // Left/Right scrub the timeline (the player owns those keys); Up/Down
          // bring the control bar up and put the focus ring on it, which is how
          // TV players let you reach the buttons with a remote.
          if (dir === 'left' || dir === 'right') return;
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('rozh:show-ui'));
          const wanted: Dir = dir;
          // the control bar fades in, so wait until it is really on screen
          // before dropping the focus ring on it
          const barSelectors = ['.ctrl-row .play-btn', '.stage-bottom button', '.stage-top-actions button'];
          const pickBar = (): HTMLElement | null => {
            for (const sel of barSelectors) {
              const hit = Array.from(document.querySelectorAll<HTMLElement>(sel)).find(visible);
              if (hit) return hit;
            }
            return null;
          };
          const grab = (tries: number): void => {
            const bar = pickBar();
            if (bar) {
              focusEl(bar);
              return;
            }
            if (tries > 0) {
              window.setTimeout(() => grab(tries - 1), 90);
              return;
            }
            if (!moveFocus(wanted)) moveFocus(wanted === 'up' ? 'down' : 'up');
          };
          window.setTimeout(() => grab(6), 60);
          return;
        }

        // keep the player controls awake while a remote is being used
        if (document.body.dataset.view === 'player') window.dispatchEvent(new CustomEvent('rozh:show-ui'));
        const moved = moveFocus(dir);
        e.preventDefault();
        e.stopPropagation();
        if (!moved && !hinted) {
          hinted = true;
          toast(t('shortcuts.tvHint'), 'info', 2200);
        }
        return;
      }

      const activationCode = keyCode === 23 || keyCode === 66 || keyCode === 62;
      if (['Enter', 'NumpadEnter', 'Select', 'Accept', ' '].includes(e.key) || activationCode) {
        if (typing) return;
        if (playerOwnsDpad()) {
          // OK on the video surface = play/pause, like every TV player.
          e.preventDefault();
          e.stopPropagation();
          pressSpaceLike();
          return;
        }
        const el = current();
        if (el) {
          // Android TV remotes disagree on whether the center button produces
          // Enter, Select, or DPAD_CENTER. Trigger the focused action once and
          // cancel the WebView's own synthesized click to avoid double firing.
          e.preventDefault();
          e.stopPropagation();
          el.click();
        }
        return;
      }

      const isBack = ['Backspace', 'BrowserBack', 'GoBack', 'Escape'].includes(e.key) || keyCode === 4 || keyCode === 111;
      if (isBack) {
        const sheet = overlayRoot();
        if (sheet) {
          e.preventDefault();
          (sheet.querySelector<HTMLElement>('[data-close]') ?? sheet).click();
          return;
        }
        const fullscreen = document.fullscreenElement || document.querySelector('.stage-wrap[data-fs="true"]');
        if (fullscreen) {
          e.preventDefault();
          document.querySelector<HTMLElement>('.stage-wrap [data-act="fullscreen"]')?.click();
          return;
        }
        // Back consistently returns to the media hub; from Home the Android
        // system may handle it (rather than unexpectedly opening a blank player).
        if (document.body.dataset.view !== 'home') {
          e.preventDefault();
          document.querySelector<HTMLElement>('.tv-nav-item[data-view="home"]')?.click();
        }
        return;
      }

      if (e.key === 'MediaPlayPause' || e.key === 'MediaPlay' || e.key === 'MediaPause') {
        e.preventDefault();
        pressSpaceLike();
      }
    },
    true,
  );

  // keep the highlight in sync with clicks / programmatic focus
  document.addEventListener('focusin', (e) => {
    const el = e.target as HTMLElement;
    if (!el || el === document.body) return;
    document.querySelectorAll('.tv-focus').forEach((n) => n !== el && n.classList.remove('tv-focus'));
    el.classList.add('tv-focus');
  });
  document.addEventListener('focusout', (e) => {
    (e.target as HTMLElement)?.classList?.remove('tv-focus');
  });

  // a remote has no pointer: drop a sensible first focus once the shell is up
  setTimeout(() => {
    if (current()) return;
    const stage = document.querySelector<HTMLElement>('.stage');
    if (stage && document.body.dataset.view === 'player') focusEl(stage);
    else focusView(document.body.dataset.view || 'player');
  }, 600);
}
