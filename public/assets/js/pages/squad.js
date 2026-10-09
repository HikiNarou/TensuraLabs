import { api } from '../core/api.js';
import { createDisposer, html, isMobileViewport, preloadImages, render, qs, qsa, wait } from '../core/dom.js';
import { getLang, t } from '../core/i18n.js';
import { icons } from '../components/icons.js';
import { errorState } from '../components/states.js';

const SWITCH_OUT_MS = 320;
const IMAGE_WAIT_MS = 1500; // never keep the stage blank longer than this while a portrait loads

const CODE_SNIPPETS = [
  'const app = await Gel.build({ shape: "api" });\napp.absorb(requirements);\nreturn app.ship("production");',
  'resource "cloud_instance" "squad" {\n  region = "ap-southeast"\n  size   = "dedicated-4"\n}',
  'SELECT member, skill, mastery\nFROM squad_roster\nWHERE mastery > 0.9;',
  'pipeline:\n  - test\n  - scan\n  - deploy: canary(5%)',
];

export function createPage(ctx) {
  const disposer = createDisposer();
  const el = document.createElement('section');
  el.className = 'page page-squad';
  el.tabIndex = -1;
  el.setAttribute('aria-label', t('nav.squad'));

  const state = { roles: [], index: 0, showStats: false, switching: false };

  const ready = api.squad(getLang()).then(async (roles) => {
    state.roles = roles;
    const requested = ctx.query.get('member');
    const found = roles.findIndex((role) => role.key === requested);
    state.index = found >= 0 ? found : 0;
    paint();
    await preloadImages([roles[state.index]?.portrait, ...roles.map((role) => role.avatar)]);
    preloadImages(roles.map((role) => role.portrait));
  }).catch((error) => {
    render(el, errorState(error));
  });

  const role = () => state.roles[state.index];

  function infoTemplate(current) {
    return html`
      <div class="squad-title" data-anim>
        <span class="squad-title__ghost" aria-hidden="true">${current.title}</span>
        <h1 class="squad-title__main">${current.title}</h1>
      </div>
      <div class="squad-tag" data-anim>
        <span class="tag-parchment">${current.tag}</span>
        <span class="squad-tag__icon" aria-hidden="true">${icons.diamond}</span>
      </div>
      <p class="squad-quote" data-anim>${current.quote}</p>
      <div class="squad-desc" data-anim>${current.description.map((line) => html`<p>${line}</p>`)}</div>`;
  }

  function stageTemplate(current) {
    return html`
      <img class="squad-portrait" src="${current.portrait}" alt="${current.title} — ${current.tag}" decoding="async">
      <div class="squad-skills ${state.showStats ? 'is-visible' : ''}" aria-hidden="${!state.showStats}">
        <h2 class="squad-skills__title">${t('squad.skills')}</h2>
        <ul>
          ${current.skills.map(([name, value]) => html`
            <li><span>${name}</span><span class="squad-skills__bar"><i data-vars="--v:${Number(value)}%"></i></span><b>${Number(value)}</b></li>`)}
        </ul>
      </div>`;
  }

  function paint() {
    const current = role();
    if (!current) return;
    el.style.setProperty('--accent', current.accent);
    render(el, html`
      <div class="squad-bg" aria-hidden="true">
        <div class="squad-bg__stars"></div>
        <div class="squad-bg__waves"></div>
        <div class="squad-bg__fog"></div>
      </div>
      <div class="squad-docs" aria-hidden="true">
        ${CODE_SNIPPETS.map((snippet, i) => html`<pre class="squad-doc squad-doc--${i + 1}">${snippet}</pre>`)}
        <span class="squad-docs__glyph">TL<br>SQUAD<br>ROSTER</span>
      </div>
      <div class="squad-stage" data-stage>${stageTemplate(current)}</div>
      <div class="squad-info" id="squad-panel" role="tabpanel" aria-live="polite" data-info>${infoTemplate(current)}</div>
      <div class="squad-switcher">
        <button type="button" class="round-arrow" data-step="-1" aria-label="${t('squad.prev')}">${icons.arrowLeft}</button>
        <div class="squad-switcher__avatars" role="tablist" aria-label="${t('nav.squad')}">
          ${state.roles.map((item, i) => html`
            <button type="button" role="tab" class="avatar ${i === state.index ? 'is-active' : ''}" data-index="${i}"
              aria-selected="${i === state.index}" aria-controls="squad-panel" tabindex="${i === state.index ? '0' : '-1'}"
              aria-label="${t('squad.select')}: ${item.title}" title="${item.title}">
              <img src="${item.avatar}" alt="" width="64" height="64" decoding="async">
            </button>`)}
        </div>
        <button type="button" class="round-arrow" data-step="1" aria-label="${t('squad.next')}">${icons.arrowRight}</button>
      </div>
      <button type="button" class="squad-toggle ${state.showStats ? 'is-on' : ''}" data-toggle-stats aria-pressed="${state.showStats}" aria-label="${t('squad.statToggle')}">
        <span>${state.showStats ? t('squad.art') : t('squad.stat')}</span>
      </button>`);
    el.classList.add('is-ready');
    observeInfo();
  }

  /**
   * Keeps the info column well-formed for any copy length:
   *  - the role title always fits on one line (scaled via --title-fit),
   *  - on desktop the description scrolls inside the room left above the avatar switcher,
   *  - on mobile --info-h docks the STAT toggle/panel right above the info sheet.
   */
  let layoutObserver = null;
  let layoutFrame = 0;
  function layoutInfo() {
    layoutFrame = 0;
    const info = qs('[data-info]', el);
    const title = info && qs('.squad-title', info);
    const main = title && qs('.squad-title__main', title);
    if (!main || !title.clientWidth) return;
    const fit = Number.parseFloat(title.style.getPropertyValue('--title-fit')) || 1;
    const natural = main.getBoundingClientRect().width / fit;
    const nextFit = natural ? Math.min(1, Math.floor(((title.clientWidth - 2) / natural) * 1000) / 1000) : 1;
    if (Math.abs(nextFit - fit) >= 0.002) title.style.setProperty('--title-fit', String(nextFit));

    const desc = qs('.squad-desc', info);
    const switcher = qs('.squad-switcher', el);
    if (desc && switcher) {
      if (isMobileViewport()) desc.style.removeProperty('max-height');
      else {
        const room = Math.floor(switcher.offsetTop - info.offsetTop - desc.offsetTop - 22);
        const value = `${Math.max(64, room)}px`;
        if (desc.style.maxHeight !== value) desc.style.maxHeight = value;
      }
    }
    el.style.setProperty('--info-h', `${Math.ceil(info.offsetHeight)}px`);
  }
  const scheduleLayout = () => { if (!layoutFrame) layoutFrame = requestAnimationFrame(layoutInfo); };
  function observeInfo() {
    layoutObserver?.disconnect();
    const info = qs('[data-info]', el);
    if (info && 'ResizeObserver' in window) {
      layoutObserver = new ResizeObserver(scheduleLayout);
      layoutObserver.observe(info);
      layoutObserver.observe(el);
    }
    scheduleLayout();
    document.fonts?.ready.then(() => { if (el.isConnected) scheduleLayout(); });
  }
  disposer.add(() => { layoutObserver?.disconnect(); cancelAnimationFrame(layoutFrame); });

  const avatars = () => qsa('.avatar', el);

  async function select(index) {
    const total = state.roles.length;
    if (!total || state.switching) return;
    const next = ((index % total) + total) % total;
    if (next === state.index) return;
    state.switching = true;
    const keepFocus = Boolean(document.activeElement?.closest?.('.squad-switcher__avatars'));
    // Wrap-around steps keep the natural direction (last → first slides forward).
    const forward = (next - state.index + total) % total <= total / 2;
    el.style.setProperty('--dir', forward ? '1' : '-1');
    el.classList.add('is-switching');
    await Promise.all([
      wait(SWITCH_OUT_MS),
      Promise.race([preloadImages([state.roles[next].portrait]), wait(IMAGE_WAIT_MS)]),
    ]);
    if (!el.isConnected) return;
    state.index = next;
    const current = role();
    el.style.setProperty('--accent', current.accent);
    render(qs('[data-info]', el), infoTemplate(current));
    render(qs('[data-stage]', el), stageTemplate(current));
    layoutInfo();
    avatars().forEach((avatar, i) => {
      avatar.classList.toggle('is-active', i === next);
      avatar.setAttribute('aria-selected', String(i === next));
      avatar.tabIndex = i === next ? 0 : -1;
    });
    if (keepFocus) avatars()[next]?.focus({ preventScroll: true });
    const url = new URL(location.href);
    url.searchParams.set('member', current.key);
    history.replaceState(history.state, '', url.pathname + url.search);
    requestAnimationFrame(() => {
      el.classList.remove('is-switching');
      el.classList.add('is-arriving');
      setTimeout(() => el.classList.remove('is-arriving'), 900);
    });
    await wait(200);
    state.switching = false;
  }

  disposer.on(el, 'click', (event) => {
    if (event.target.closest('[data-retry]')) { ctx.refresh(); return; }
    const step = event.target.closest('[data-step]');
    if (step) { select(state.index + Number(step.dataset.step)); return; }
    const avatar = event.target.closest('[data-index]');
    if (avatar) { select(Number(avatar.dataset.index)); return; }
    if (event.target.closest('[data-toggle-stats]')) {
      state.showStats = !state.showStats;
      const toggle = qs('[data-toggle-stats]', el);
      toggle.classList.toggle('is-on', state.showStats);
      toggle.setAttribute('aria-pressed', String(state.showStats));
      toggle.querySelector('span').textContent = state.showStats ? t('squad.art') : t('squad.stat');
      const skills = qs('.squad-skills', el);
      skills.classList.toggle('is-visible', state.showStats);
      skills.setAttribute('aria-hidden', String(!state.showStats));
    }
  });

  disposer.on(window, 'keydown', (event) => {
    if (!state.roles.length || ctx.isOverlayOpen() || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]')) return;
    const inTabs = event.target instanceof Element && event.target.closest('.squad-switcher__avatars');
    if (event.key === 'ArrowRight') { event.preventDefault(); select(state.index + 1); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); select(state.index - 1); }
    else if (inTabs && event.key === 'Home') { event.preventDefault(); select(0); }
    else if (inTabs && event.key === 'End') { event.preventDefault(); select(state.roles.length - 1); }
  });

  // Horizontal swipe on the stage switches member (vertical swipes belong to section navigation).
  let swipe = null;
  disposer.on(el, 'touchstart', (event) => {
    swipe = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
  }, { passive: true });
  disposer.on(el, 'touchend', (event) => {
    if (!swipe) return;
    const dx = event.changedTouches[0].clientX - swipe.x;
    const dy = event.changedTouches[0].clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.4 && !event.target.closest('.squad-switcher')) select(state.index + (dx < 0 ? 1 : -1));
  }, { passive: true });

  return {
    el,
    title: `${t('nav.squad')} — TensuraLabs`,
    ready,
    enter() { el.classList.add('is-entered'); },
    leave() { el.classList.remove('is-entered'); },
    destroy() { disposer.run(); },
  };
}
