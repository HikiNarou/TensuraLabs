import { api } from '../core/api.js';
import { createDisposer, html, preloadImages, render, qs, qsa, wait } from '../core/dom.js';
import { getLang, t } from '../core/i18n.js';
import { icons } from '../components/icons.js';
import { errorState } from '../components/states.js';

export function createPage(ctx) {
  const disposer = createDisposer();
  const el = document.createElement('section');
  el.className = 'page page-world';
  el.tabIndex = -1;
  el.setAttribute('aria-label', t('nav.world'));
  const state = { issues: [], index: 0, switching: false };

  function paperTemplate(issue, index) {
    return html`
      <article class="gazette" aria-labelledby="gazette-title">
        <header class="gazette__masthead">
          <div class="gazette__ear"><b>${t('world.edition')} N° ${String(index + 1).padStart(2, '0')}</b><span>TENSURA · TECH · PRESS</span><span>EST. 2026</span></div>
          <div class="gazette__crest">
            <span class="gazette__crest-icon" aria-hidden="true">${icons.logoMark}</span>
            <span class="gazette__kicker">${issue.section}</span>
          </div>
          <div class="gazette__ear gazette__ear--right"><b>${t('world.price')}</b><span>TENSURALABS.ID</span><span>${new Date().getFullYear()}</span></div>
        </header>
        <h1 class="gazette__title" id="gazette-title">${issue.masthead}</h1>
        <div class="gazette__rule" aria-hidden="true"><span></span><i><b></b><b></b><b></b></i><span></span></div>
        <div class="gazette__layout">
          <aside class="gazette__sidebar">
            <h2>${issue.sidebarTitle}</h2>
            <div class="gazette__sidebar-art" aria-hidden="true"><img src="${issue.image}" alt="" loading="lazy"></div>
            <ul>${issue.sidebar.map((item) => html`<li>${item}</li>`)}</ul>
          </aside>
          <div class="gazette__main">
            <h2 class="gazette__headline">${issue.headline}</h2>
            <p class="gazette__deck">${issue.deck}</p>
            <figure class="gazette__figure"><img src="${issue.image}" alt="" loading="lazy"></figure>
          </div>
        </div>
        <div class="gazette__columns">${issue.columns.map((column) => html`<p>${column}</p>`)}</div>
        <footer class="gazette__footer"><span>TENSURA OBSERVER</span><span>·</span><span>${issue.label}</span></footer>
      </article>
      <aside class="world-cta" aria-labelledby="world-cta-title">
        <div>
          <h2 id="world-cta-title">${t('world.ctaTitle')}</h2>
          <p>${t('world.ctaText')}</p>
        </div>
        <button type="button" class="btn-navy" data-open-consult><span>${t('world.ctaButton')}</span><i aria-hidden="true"></i></button>
      </aside>`;
  }

  function paint() {
    const issue = state.issues[state.index];
    render(el, html`
      <div class="world-desk" aria-hidden="true"></div>
      <div class="world-stack" aria-hidden="true"><span class="world-sheet world-sheet--1"></span><span class="world-sheet world-sheet--2"></span><span class="world-sheet world-sheet--3"></span></div>
      <div class="world-paper" id="world-paper" data-scroll data-paper tabindex="0" aria-live="polite">${paperTemplate(issue, state.index)}</div>
      <nav class="world-rail" aria-label="${t('world.issues')}">
        ${state.issues.map((item, i) => html`
          <button type="button" class="world-issue ${i === state.index ? 'is-active' : ''}" data-index="${i}" aria-current="${i === state.index ? 'true' : 'false'}" aria-controls="world-paper" title="${item.label}">
            <span class="world-issue__label">${item.label}</span>
            <span class="world-issue__thumb" aria-hidden="true">
              <b>${item.masthead}</b><img src="${item.image}" alt="" loading="lazy"><i></i><i></i><i></i>
            </span>
          </button>`)}
      </nav>`);
  }

  async function select(index) {
    if (state.switching || index === state.index || !state.issues[index]) return;
    state.switching = true;
    const paper = qs('[data-paper]', el);
    paper.classList.add('is-leaving');
    await Promise.all([wait(380), Promise.race([preloadImages([state.issues[index].image]), wait(1200)])]);
    if (!el.isConnected) return;
    state.index = index;
    render(paper, paperTemplate(state.issues[index], index));
    paper.scrollTop = 0;
    paper.classList.remove('is-leaving');
    paper.classList.add('is-arriving');
    qsa('.world-issue', el).forEach((button, i) => {
      button.classList.toggle('is-active', i === index);
      button.setAttribute('aria-current', String(i === index));
    });
    revealActiveIssue();
    const url = new URL(location.href);
    if (index) url.searchParams.set('issue', String(index + 1)); else url.searchParams.delete('issue');
    history.replaceState(history.state, '', url.pathname + url.search);
    await wait(500);
    paper.classList.remove('is-arriving');
    state.switching = false;
  }

  /** Keeps the active edition visible in the rail (horizontal on mobile, vertical on desktop). */
  function revealActiveIssue() {
    const rail = qs('.world-rail', el);
    const active = qs('.world-issue.is-active', el);
    if (!rail || !active) return;
    const horizontal = rail.scrollWidth > rail.clientWidth + 1;
    const offset = horizontal
      ? active.offsetLeft - (rail.clientWidth - active.offsetWidth) / 2
      : active.offsetTop - (rail.clientHeight - active.offsetHeight) / 2;
    rail.scrollTo({ [horizontal ? 'left' : 'top']: Math.max(0, offset), behavior: 'smooth' });
  }

  const ready = api.gazette(getLang()).then(async (issues) => {
    state.issues = issues;
    if (!issues.length) { render(el, html`<div class="state state--empty world-empty"><p>${t('world.empty')}</p></div>`); return; }
    const requested = Number.parseInt(ctx.query.get('issue') ?? '', 10);
    state.index = requested >= 1 && requested <= issues.length ? requested - 1 : 0;
    paint();
    await preloadImages([issues[state.index]?.image]);
    // Warm the other editions so switching never flashes an empty frame.
    preloadImages(issues.map((issue) => issue.image));
  }).catch((error) => render(el, errorState(error)));

  disposer.on(el, 'click', (event) => {
    if (event.target.closest('[data-retry]')) { ctx.refresh(); return; }
    if (event.target.closest('[data-open-consult]')) { ctx.openConsult(); return; }
    const issue = event.target.closest('[data-index]');
    if (issue) select(Number(issue.dataset.index));
  });

  return {
    el,
    title: `${t('nav.world')} — TensuraLabs`,
    ready,
    enter() { el.classList.add('is-entered'); },
    leave() { el.classList.remove('is-entered'); },
    destroy() { disposer.run(); },
  };
}
