/**
 * Section navigation by intent: wheel / trackpad, touch swipe and keyboard.
 *
 * Rules that keep it predictable:
 *  - Inner scrollers (news list, gazette paper, long descriptions) always scroll natively first.
 *  - Once an inner scroller hits its end, the *same* gesture never changes section. The user has
 *    to pause and push again, and a pressure meter (edge cue) shows the progress of that push.
 *  - Pages without their own scroller change section on a single deliberate flick.
 *  - While a transition runs, and until trackpad inertia has died down, wheel input is swallowed
 *    so momentum can neither scroll the incoming page nor skip a section.
 */
import { adjacentSection, sectionIndex } from './sections.js';

const FREE_THRESHOLD = 45; // px of wheel delta on pages without an inner scroller
const EDGE_THRESHOLD = 260; // px of extra push needed after an inner scroller reached its end
const INERTIA_GAP_MS = 200; // silence that separates two wheel gestures
const FREE_DECAY_MS = 320;
const EDGE_DECAY_MS = 700;
const TOUCH_THRESHOLD = 84; // px of vertical swipe
const TOUCH_RATIO = 1.3; // vertical must dominate horizontal by this factor
const KEY_STEP = 96;

const KEY_DIRECTIONS = { ArrowDown: 'down', PageDown: 'down', ArrowUp: 'up', PageUp: 'up' };
const TEXT_ENTRY = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="slider"], [role="listbox"]';
const SPACE_ACTIVATES = 'button, a[href], summary, [role="button"], [role="tab"], [role="menuitem"], [role="menuitemradio"]';

const wheelDelta = (event) => {
  if (event.deltaMode === 1) return event.deltaY * 16;
  if (event.deltaMode === 2) return event.deltaY * window.innerHeight;
  return event.deltaY;
};

function isVerticalScroller(el) {
  if (!(el instanceof HTMLElement) || el.scrollHeight <= el.clientHeight + 1) return false;
  return /(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY);
}

const canScroll = (el, direction) => (direction === 'down'
  ? Math.ceil(el.scrollTop + el.clientHeight) < el.scrollHeight - 1
  : el.scrollTop > 1);

/** Vertical scrollers from `node` up to and including `boundary`, innermost first. */
function scrollersBetween(node, boundary) {
  const list = [];
  for (let el = node instanceof Element ? node : node?.parentElement; el; el = el.parentElement) {
    if (isVerticalScroller(el)) list.push(el);
    if (el === boundary) break;
  }
  return list;
}

export function createSectionScroll({ router, isBlocked, onPressure }) {
  let armed = true;
  let lastWheelAt = 0;
  let lastNativeAt = 0;
  let pressure = { direction: null, amount: 0 };
  let decayTimer = 0;
  let touch = null;

  /** The current page when it is a full-screen section, otherwise null. */
  function currentSection() {
    const current = router.current;
    if (!current || sectionIndex(current.route.name) < 0) return null;
    return { route: current.route.name, el: current.el };
  }

  /** Events from outside the page (header, rail) act on the page's main scroller. */
  function originFor(target, pageEl) {
    if (target instanceof Node && pageEl.contains(target)) return target;
    return pageEl.querySelector('[data-scroll]') ?? pageEl;
  }

  const nativeScroller = (origin, pageEl, direction) => scrollersBetween(origin, pageEl).find((el) => canScroll(el, direction)) ?? null;
  const hasScroller = (origin, pageEl) => scrollersBetween(origin, pageEl).length > 0;

  function report(direction, section, progress) {
    onPressure?.({ direction, section, progress: Math.max(0, Math.min(1, progress)) });
  }

  function resetPressure() {
    clearTimeout(decayTimer);
    if (pressure.amount > 0) report(pressure.direction, null, 0);
    pressure = { direction: null, amount: 0 };
  }

  function go(direction, section) {
    armed = false;
    resetPressure();
    touch = null;
    router.navigate(section.path, { transition: direction === 'down' ? 'liquid-down' : 'liquid-up' });
  }

  function onWheel(event) {
    const now = performance.now();
    const gap = now - lastWheelAt;
    lastWheelAt = now;
    if (event.ctrlKey) return; // pinch-zoom

    const page = currentSection();
    if (!page) return;
    if (router.busy) { armed = false; event.preventDefault(); return; }
    if (!armed) {
      if (gap < INERTIA_GAP_MS) { event.preventDefault(); return; }
      armed = true;
    }
    if (isBlocked()) return;

    const delta = wheelDelta(event);
    if (!delta || Math.abs(event.deltaX) > Math.abs(delta)) return;
    const direction = delta > 0 ? 'down' : 'up';
    const origin = originFor(event.target, page.el);

    if (nativeScroller(origin, page.el, direction)) { lastNativeAt = now; resetPressure(); return; }
    const section = adjacentSection(page.route, direction);
    if (!section) { resetPressure(); return; }
    // Inertia that carried an inner scroller to its end must not leak into a section change.
    if (now - lastNativeAt < INERTIA_GAP_MS) { lastNativeAt = now; event.preventDefault(); return; }

    const edge = hasScroller(origin, page.el);
    if (pressure.direction !== direction) pressure = { direction, amount: 0 };
    pressure.amount += Math.abs(delta);
    const threshold = edge ? EDGE_THRESHOLD : FREE_THRESHOLD;
    if (edge) report(direction, section, pressure.amount / threshold);

    clearTimeout(decayTimer);
    decayTimer = setTimeout(resetPressure, edge ? EDGE_DECAY_MS : FREE_DECAY_MS);
    if (pressure.amount >= threshold) go(direction, section);
  }

  function onTouchStart(event) {
    const page = currentSection();
    if (!page || event.touches.length !== 1 || router.busy || isBlocked()) { touch = null; return; }
    const point = event.touches[0];
    const origin = originFor(event.target, page.el);
    touch = {
      x: point.clientX,
      y: point.clientY,
      route: page.route,
      // Captured at the start: a swipe that begins mid-list scrolls the list, never the section.
      canDown: Boolean(nativeScroller(origin, page.el, 'down')),
      canUp: Boolean(nativeScroller(origin, page.el, 'up')),
    };
  }

  function touchIntent(point) {
    if (!touch) return null;
    const dy = touch.y - point.clientY;
    const dx = touch.x - point.clientX;
    if (!dy || Math.abs(dy) < Math.abs(dx) * TOUCH_RATIO) return null;
    const direction = dy > 0 ? 'down' : 'up';
    if (direction === 'down' ? touch.canDown : touch.canUp) return null;
    const section = adjacentSection(touch.route, direction);
    return section ? { direction, section, distance: Math.abs(dy) } : null;
  }

  function onTouchMove(event) {
    const intent = touchIntent(event.touches[0]);
    if (!intent) { if (pressure.amount) resetPressure(); return; }
    pressure = { direction: intent.direction, amount: intent.distance };
    report(intent.direction, intent.section, intent.distance / TOUCH_THRESHOLD);
  }

  function onTouchEnd(event) {
    const intent = touchIntent(event.changedTouches[0]);
    touch = null;
    if (intent && intent.distance >= TOUCH_THRESHOLD && !router.busy && !isBlocked()) go(intent.direction, intent.section);
    else resetPressure();
  }

  function onTouchCancel() {
    touch = null;
    resetPressure();
  }

  function onKeyDown(event) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const isSpace = event.key === ' ' || event.key === 'Spacebar';
    const direction = isSpace ? (event.shiftKey ? 'up' : 'down') : KEY_DIRECTIONS[event.key];
    if (!direction) return;
    const page = currentSection();
    if (!page || isBlocked()) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(TEXT_ENTRY) || (isSpace && target?.closest(SPACE_ACTIVATES))) return;
    if (router.busy) { event.preventDefault(); return; }

    const origin = originFor(target, page.el);
    const mainScroller = page.el.querySelector('[data-scroll]');
    const scroller = nativeScroller(origin, page.el, direction) ?? (mainScroller && canScroll(mainScroller, direction) ? mainScroller : null);
    if (scroller) {
      event.preventDefault();
      const step = event.key.startsWith('Arrow') ? KEY_STEP : scroller.clientHeight * 0.85;
      scroller.scrollBy({ top: direction === 'down' ? step : -step, behavior: 'smooth' });
      return;
    }
    const section = adjacentSection(page.route, direction);
    if (!section) return;
    event.preventDefault();
    if (!event.repeat) go(direction, section);
  }

  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: true });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('touchcancel', onTouchCancel, { passive: true });
  window.addEventListener('keydown', onKeyDown);

  return {
    /** Programmatic step, used by "next section" buttons. */
    step(direction) {
      const page = currentSection();
      const section = page && adjacentSection(page.route, direction);
      if (section && !router.busy && !isBlocked()) go(direction, section);
    },
    destroy() {
      clearTimeout(decayTimer);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchCancel);
      window.removeEventListener('keydown', onKeyDown);
    },
  };
}
