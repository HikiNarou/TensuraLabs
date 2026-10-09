import { fragment, html, isMobileViewport, prefersReducedMotion, wait } from './dom.js';
import { t } from './i18n.js';
import { liquidWipe } from './liquid.js';
import { SECTIONS, sectionIndex, sectionNumber } from './sections.js';

const FADE_MS = 360;
const SLIDE_MS = 720;
const WIPE_MS = 1150;
const WIPE_MS_MOBILE = 980;
const HOLD_MS = 380; // the title card stays readable
const REVEAL_MS = 620; // the title card dissolves into the incoming section
const SLIDE_EASE = 'cubic-bezier(.22,1,.36,1)';
const EASE = 'cubic-bezier(.4,0,.2,1)';

function animate(el, keyframes, options) {
  if (!el.animate) return Promise.resolve();
  return el.animate(keyframes, options).finished.catch(() => {});
}

function animateOpacity(el, from, to, duration) {
  if (!el.animate) { el.style.opacity = String(to); return Promise.resolve(); }
  return animate(el, [{ opacity: from }, { opacity: to }], { duration, easing: EASE, fill: 'forwards' })
    .then(() => { el.style.opacity = String(to); });
}

/**
 * Sinks the outgoing view into shadow while the liquid sweeps over it. A black shade layer's
 * opacity is animated (compositor-only) instead of `filter: brightness()`, which forced a
 * full-screen repaint on every frame. The shade lives inside the view, so it follows its clip-path.
 * Returns a disposer that removes the shade.
 */
function sink(el, duration) {
  const shade = document.createElement('div');
  shade.className = 'view-shade';
  shade.setAttribute('aria-hidden', 'true');
  el.append(shade);
  if (shade.animate) shade.animate([{ opacity: 0 }, { opacity: 0.45 }], { duration, easing: 'ease-in', fill: 'forwards' });
  else shade.style.opacity = '0.45';
  return () => shade.remove();
}

function enter(view, kind) {
  view.el.classList.add('is-current');
  view.page.enter?.({ kind });
}

function titleCard(routeName) {
  const index = Math.max(0, sectionIndex(routeName));
  const section = SECTIONS[index];
  return fragment(html`
    <section class="intro-card" data-section="${section.route}" aria-hidden="true">
      <div class="intro-card__bg"></div>
      <div class="intro-card__content">
        <span class="intro-card__index">${sectionNumber(index)}<i> / ${String(SECTIONS.length).padStart(2, '0')}</i></span>
        <h2 class="intro-card__title">${t(section.label)}</h2>
        <span class="intro-card__line"></span>
        <p class="intro-card__sub">${t(section.cipher)}</p>
      </div>
    </section>`);
}

/** Returning to a long section from below should continue where it ends, not jump to its top. */
function landAtEnd(el) {
  const scroller = el.querySelector('[data-scroll]');
  if (scroller && scroller.scrollHeight > scroller.clientHeight) {
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'instant' });
  }
}

const wipeDuration = () => (isMobileViewport() ? WIPE_MS_MOBILE : WIPE_MS);

/** Builds the transition table used by the router. */
export function createTransitions({ canvas, beforeInitial, getSite }) {
  const liquidEnabled = () => getSite?.()?.motion?.liquidTransitions !== false;

  /** Modern alternative to the liquid wipe: the incoming section glides in over a receding one. */
  async function slide({ from, to }, direction) {
    if (!from || prefersReducedMotion()) return fade({ from, to });
    const sign = direction === 'down' ? 1 : -1;
    from.el.classList.add('is-leaving');
    from.page.leave?.();
    if (direction === 'up') landAtEnd(to.el);
    to.el.classList.add('is-liquid-top');
    enter(to, 'slide');
    await Promise.all([
      animate(from.el, [
        { transform: 'none', opacity: 1 },
        { transform: `translateY(${-8 * sign}%) scale(.96)`, opacity: 0 },
      ], { duration: SLIDE_MS, easing: SLIDE_EASE, fill: 'forwards' }),
      animate(to.el, [
        { transform: `translateY(${14 * sign}%)`, opacity: 0, clipPath: direction === 'down' ? 'inset(18% 0 0 0 round 28px)' : 'inset(0 0 18% 0 round 28px)' },
        { transform: 'none', opacity: 1, clipPath: 'inset(0 0 0 0 round 0px)' },
      ], { duration: SLIDE_MS, easing: SLIDE_EASE }),
    ]);
    to.el.classList.remove('is-liquid-top');
  }

  async function fade({ from, to }) {
    const reduced = prefersReducedMotion();
    to.el.classList.add('is-entering');
    to.el.style.opacity = '0';
    if (from) {
      from.el.classList.add('is-leaving');
      from.page.leave?.();
      await animateOpacity(from.el, 1, 0, reduced ? 1 : FADE_MS * 0.7);
    }
    enter(to, 'fade');
    await animateOpacity(to.el, 0, 1, reduced ? 1 : FADE_MS);
    to.el.classList.remove('is-entering');
    to.el.style.opacity = '';
  }

  async function initial({ to }) {
    await beforeInitial?.();
    enter(to, 'initial');
  }

  /**
   * Scrolling down: slime liquid rises over the current section and drains it away, a title card
   * for the next section surfaces underneath, then dissolves into the section itself.
   */
  async function liquidDown({ from, to, outlet }) {
    if (!from || prefersReducedMotion()) return fade({ from, to });
    if (!liquidEnabled()) return slide({ from, to }, 'down');
    const duration = wipeDuration();
    const card = titleCard(to.route.name);
    to.el.style.visibility = 'hidden';
    outlet.insertBefore(card, from.el);
    from.el.classList.add('is-leaving', 'is-liquid-top');
    from.page.leave?.();
    let unsink = null;
    try {
      requestAnimationFrame(() => card.classList.add('is-visible'));
      unsink = sink(from.el, duration);
      await liquidWipe({ element: from.el, canvas, direction: 'rise', duration });
      from.el.style.visibility = 'hidden';
      await wait(HOLD_MS);
      to.el.style.visibility = '';
      to.el.classList.add('is-revealing');
      card.classList.add('is-leaving');
      enter(to, 'liquid');
      await wait(REVEAL_MS);
    } finally {
      unsink?.();
      card.remove();
      to.el.style.visibility = '';
      to.el.classList.remove('is-revealing');
    }
  }

  /** Scrolling up: the previous section floods back in from the top, pushing the current one into shadow. */
  async function liquidUp({ from, to }) {
    if (!from || prefersReducedMotion()) return fade({ from, to });
    if (!liquidEnabled()) return slide({ from, to }, 'up');
    const duration = wipeDuration();
    to.el.classList.add('is-liquid-top');
    to.el.style.clipPath = 'inset(0 0 100% 0)';
    from.el.classList.add('is-leaving');
    from.page.leave?.();
    landAtEnd(to.el);
    let unsink = null;
    try {
      unsink = sink(from.el, duration);
      enter(to, 'liquid');
      await liquidWipe({ element: to.el, canvas, direction: 'fall', duration });
    } finally {
      unsink?.();
      to.el.classList.remove('is-liquid-top');
      to.el.style.clipPath = '';
    }
  }

  /** Used by the admin live preview: swap views without animation. */
  async function instant({ from, to }) {
    from?.page.leave?.();
    enter(to, 'instant');
  }

  return { initial, fade, instant, 'liquid-down': liquidDown, 'liquid-up': liquidUp };
}
