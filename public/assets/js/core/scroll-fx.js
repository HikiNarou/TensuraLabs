/**
 * Scroll-driven effects for a page's inner scroller:
 *  - [data-reveal]            fades/slides in once when it enters the viewport (variants: up, left, right, scale)
 *  - [data-stagger]           children with [data-reveal] get incremental delays
 *  - [data-count]             animates the numeric part of its text when revealed ("99.95%", "< 24h")
 *  - [data-progress]          receives --p (0 → 1) while it travels through the viewport
 *  - [data-parallax="0.2"]    translates by its progress (respects the "parallax" motion setting)
 * Everything degrades to static content under prefers-reduced-motion.
 */
import { prefersReducedMotion } from './dom.js';

const COUNT_PATTERN = /^(\D*?)(\d+(?:[.,]\d+)?)(.*)$/s;

function animateCount(el, duration = 1400) {
  const original = el.dataset.countFinal ?? el.textContent.trim();
  el.dataset.countFinal = original;
  const match = COUNT_PATTERN.exec(original);
  if (!match) return;
  const [, prefix, numeric, suffix] = match;
  const separator = numeric.includes(',') ? ',' : '.';
  const decimals = numeric.split(/[.,]/)[1]?.length ?? 0;
  const target = Number.parseFloat(numeric.replace(',', '.'));
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 4;
    const value = (target * eased).toFixed(decimals).replace('.', separator);
    el.textContent = `${prefix}${value}${suffix}`;
    if (t < 1 && el.isConnected) requestAnimationFrame(step);
    else el.textContent = original;
  };
  requestAnimationFrame(step);
}

export function createScrollFx(scroller, { onScroll } = {}) {
  const reduced = prefersReducedMotion();
  const root = document.documentElement;
  const disposers = [];

  scroller.querySelectorAll('[data-stagger]').forEach((group) => {
    const step = Number(group.dataset.stagger) || 80;
    group.querySelectorAll(':scope > [data-reveal]').forEach((child, index) => child.style.setProperty('--d', `${index * step}ms`));
  });

  const revealables = [...scroller.querySelectorAll('[data-reveal], [data-count]')];
  if (reduced || root.classList.contains('no-reveal') || !('IntersectionObserver' in window)) {
    revealables.forEach((el) => el.classList.add('is-visible'));
  } else {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        if (entry.target.hasAttribute('data-count')) animateCount(entry.target);
        observer.unobserve(entry.target);
      }
    }, { root: scroller, rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    revealables.forEach((el) => observer.observe(el));
    disposers.push(() => observer.disconnect());
  }

  /*
   * Progress/parallax: geometry is measured only on resize (ResizeObserver), never per frame.
   * Per frame we only do arithmetic with scrollTop and write transforms / --p for elements
   * that an IntersectionObserver reports as near the viewport. Parallax is lerp-smoothed and
   * the rAF loop stops as soon as everything has settled.
   */
  const items = (reduced ? [] : [...scroller.querySelectorAll('[data-progress], [data-parallax]')]).map((el) => ({
    el, top: 0, height: 0, speed: Number(el.dataset.parallax) || 0, progress: -1, shown: NaN, active: true,
  }));
  const byEl = new Map(items.map((item) => [item.el, item]));
  let viewportHeight = scroller.clientHeight;
  let maxScroll = 1;
  let frame = 0;

  function measure() {
    viewportHeight = scroller.clientHeight;
    maxScroll = Math.max(1, scroller.scrollHeight - viewportHeight);
    const base = scroller.getBoundingClientRect().top - scroller.scrollTop;
    for (const item of items) {
      // Undo our own transform so the measurement reflects the layout position.
      const offset = Number.isFinite(item.shown) ? item.shown : 0;
      const rect = item.el.getBoundingClientRect();
      item.top = rect.top - base - offset;
      item.height = rect.height;
    }
  }

  function tick() {
    frame = 0;
    const top = scroller.scrollTop;
    const parallaxOn = !root.classList.contains('no-parallax');
    let moving = false;
    for (const item of items) {
      if (!item.active) continue;
      const progress = Math.min(1, Math.max(0, (top + viewportHeight - item.top) / (viewportHeight + item.height)));
      if (Math.abs(progress - item.progress) > 0.0005) {
        item.progress = progress;
        item.el.style.setProperty('--p', progress.toFixed(4));
      }
      if (!item.speed) continue;
      const target = parallaxOn ? (0.5 - progress) * item.speed * 200 : 0;
      const current = Number.isFinite(item.shown) ? item.shown : target;
      const next = Math.abs(target - current) < 0.15 ? target : current + (target - current) * 0.18;
      if (next !== target) moving = true;
      if (Math.abs(next - item.shown) >= 0.05 || !Number.isFinite(item.shown)) {
        item.shown = next;
        item.el.style.transform = next ? `translate3d(0, ${next.toFixed(2)}px, 0)` : '';
      }
    }
    onScroll?.({ top, progress: top / maxScroll, max: maxScroll });
    if (moving) schedule();
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(tick); };

  if (items.length && 'IntersectionObserver' in window) {
    const near = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const item = byEl.get(entry.target);
        if (item) item.active = entry.isIntersecting;
      }
      schedule();
    }, { root: scroller, rootMargin: '25% 0px 25% 0px' });
    items.forEach((item) => near.observe(item.el));
    disposers.push(() => near.disconnect());
  }

  const onResize = () => { measure(); schedule(); };
  let resizeObserver = null;
  if ('ResizeObserver' in window) {
    let pending = 0;
    resizeObserver = new ResizeObserver(() => { cancelAnimationFrame(pending); pending = requestAnimationFrame(onResize); });
    resizeObserver.observe(scroller);
    if (scroller.firstElementChild) resizeObserver.observe(scroller.firstElementChild);
  } else {
    window.addEventListener('resize', onResize);
  }
  scroller.addEventListener('scroll', schedule, { passive: true });
  disposers.push(() => {
    scroller.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', onResize);
    resizeObserver?.disconnect();
    cancelAnimationFrame(frame);
  });
  measure();
  tick();

  return {
    refresh: onResize,
    destroy() { disposers.forEach((dispose) => dispose()); },
  };
}

/** Pointer-following highlight for cards: sets --mx / --my inside [data-spotlight] elements. */
export function bindSpotlight(container) {
  const onMove = (event) => {
    const card = event.target.closest?.('[data-spotlight]');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    card.style.setProperty('--my', `${event.clientY - rect.top}px`);
  };
  container.addEventListener('pointermove', onMove, { passive: true });
  return () => container.removeEventListener('pointermove', onMove);
}
