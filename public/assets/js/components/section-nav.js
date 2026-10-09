import { html, qs, qsa, render } from '../core/dom.js';
import { onLangChange, t } from '../core/i18n.js';
import { SECTIONS, adjacentSection, sectionIndex, sectionNumber } from '../core/sections.js';
import { icons } from './icons.js';

/** Sections that get a floating "next section" button (others have their own cue or are last). */
const NEXT_BUTTON_ROUTES = new Set(['squad', 'gallery']);
const RING_LENGTH = 2 * Math.PI * 15;

/**
 * Global section chrome: a progress rail (desktop), a "next section" button, and the edge cue
 * that visualises how hard the user is pushing past the end of an inner scroller.
 */
export function createSectionNav({ mount, onStep }) {
  const rail = document.createElement('nav');
  rail.className = 'section-rail';
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'section-next';
  const cue = document.createElement('div');
  cue.className = 'edge-cue';
  cue.setAttribute('aria-hidden', 'true');
  mount.append(rail, next, cue);

  let route = null;

  function paintRail() {
    rail.setAttribute('aria-label', t('section.rail'));
    render(rail, html`
      <span class="section-rail__track" aria-hidden="true"><i></i></span>
      <ol>
        ${SECTIONS.map((section, index) => html`
          <li><a href="${section.path}" class="section-rail__item" data-section="${section.route}">
            <span class="section-rail__num">${sectionNumber(index).slice(1)}</span>
            <span class="section-rail__label">${t(section.label)}</span>
          </a></li>`)}
      </ol>`);
    update();
  }

  function update() {
    const index = sectionIndex(route);
    const visible = index >= 0;
    document.documentElement.classList.toggle('has-sections', visible);
    rail.toggleAttribute('hidden', !visible);
    rail.style.setProperty('--progress', String(visible ? index / (SECTIONS.length - 1) : 0));
    qsa('.section-rail__item', rail).forEach((link, i) => {
      const active = i === index;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'true'); else link.removeAttribute('aria-current');
    });

    const target = NEXT_BUTTON_ROUTES.has(route) ? adjacentSection(route, 'down') : null;
    next.toggleAttribute('hidden', !target);
    if (target) {
      render(next, html`<span class="section-next__label"><small>${t('section.scroll')}</small>${t(target.label)}</span><span class="section-next__icon" aria-hidden="true">${icons.chevronDown}</span>`);
      next.setAttribute('aria-label', t('section.next', { name: t(target.label) }));
      next.dataset.route = route;
    }
  }

  render(cue, html`
    <svg class="edge-cue__ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15"/><circle class="edge-cue__fill" cx="18" cy="18" r="15"/></svg>
    <span class="edge-cue__icon">${icons.chevronDown}</span>
    <span class="edge-cue__text"></span>`);
  const cueFill = qs('.edge-cue__fill', cue);
  const cueText = qs('.edge-cue__text', cue);
  cueFill.style.strokeDasharray = String(RING_LENGTH);

  next.addEventListener('click', () => onStep('down'));
  onLangChange(paintRail);
  paintRail();

  return {
    refresh: paintRail,
    setRoute(name) {
      route = name;
      update();
      this.setPressure({ progress: 0 });
    },
    /** progress 0 hides the cue; 1 means the section change is about to fire. */
    setPressure({ direction, section, progress }) {
      if (!progress || !section) { cue.classList.remove('is-visible'); return; }
      cue.dataset.direction = direction;
      cueText.textContent = t(direction === 'down' ? 'section.next' : 'section.prev', { name: t(section.label) });
      cueFill.style.strokeDashoffset = String(RING_LENGTH * (1 - progress));
      cue.style.setProperty('--progress', String(progress));
      cue.classList.add('is-visible');
      cue.classList.toggle('is-ready', progress >= 1);
    },
  };
}
