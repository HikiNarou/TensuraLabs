import { api } from '../core/api.js';
import { createDisposer, formatDate, html, render, qs, qsa } from '../core/dom.js';
import { getLang, t } from '../core/i18n.js';
import { adjacentSection } from '../core/sections.js';
import { flourish, icons } from '../components/icons.js';
import { paginationItems } from '../core/pagination.js';
import { errorState, skeletonCards } from '../components/states.js';

const CATEGORIES = ['all', 'news', 'notice', 'event'];
const PAGE_SIZE = 6;
const NEXT_SECTION = adjacentSection('news', 'down');

export function createPage(ctx) {
  const disposer = createDisposer();
  const el = document.createElement('section');
  el.className = 'page page-news paper-bg';
  el.tabIndex = -1;
  el.setAttribute('aria-label', t('news.title'));

  const initialCategory = ctx.query.get('category');
  const state = {
    category: CATEGORIES.includes(initialCategory) ? initialCategory : 'all',
    page: Math.max(1, Number.parseInt(ctx.query.get('page') ?? '1', 10) || 1),
    featured: [],
    activeFeatured: 0,
    list: null,
    controller: null,
  };

  render(el, html`
    <div class="news-scroll" data-scroll>
      <div class="news-inner">
        <div class="news-head">
          <div class="news-head__left">
            <div class="section-title section-title--dark">
              <h1>${t('news.title')}</h1>
              <span class="section-title__rule" aria-hidden="true">${flourish}</span>
              <span class="section-title__rings" aria-hidden="true"></span>
            </div>
            <ul class="news-featured" data-featured aria-label="${t('news.title')}"></ul>
          </div>
          <div class="news-preview" data-preview aria-hidden="true">
            <div class="news-preview__plate"></div>
            <div class="news-preview__card">
              <div class="news-preview__meta"><span>▲ TENSURA · OBSERVER</span><small>NEWSROOM ARCHIVE · VOL. 01</small></div>
              <div class="news-preview__frame"><img alt="" data-preview-img></div>
            </div>
          </div>
        </div>
        <div class="news-tabs" role="tablist" aria-label="${t('news.title')}">
          ${CATEGORIES.map((category) => html`
            <button type="button" role="tab" class="pill ${state.category === category ? 'is-active' : ''}" data-category="${category}"
              id="news-tab-${category}" aria-controls="news-grid" aria-selected="${state.category === category}" tabindex="${state.category === category ? '0' : '-1'}">
              ${t(`news.tab.${category}`)}
            </button>`)}
        </div>
        <div class="news-grid" id="news-grid" role="tabpanel" aria-labelledby="news-tab-${state.category}" aria-busy="true" data-grid>${skeletonCards(PAGE_SIZE)}</div>
        <nav class="pagination" data-pagination aria-label="${t('news.page')}"></nav>
        ${NEXT_SECTION ? html`
          <footer class="section-footer">
            <button type="button" class="section-footer__next" data-next-section aria-label="${t('section.next', { name: t(NEXT_SECTION.label) })}">
              <small>${t('section.scroll')}</small><strong>${t(NEXT_SECTION.label)}</strong><span aria-hidden="true">${icons.chevronDown}</span>
            </button>
          </footer>` : ''}
      </div>
    </div>`);

  const featuredEl = qs('[data-featured]', el);
  const gridEl = qs('[data-grid]', el);
  const paginationEl = qs('[data-pagination]', el);
  const previewImg = qs('[data-preview-img]', el);
  const scroller = qs('[data-scroll]', el);

  function setPreview(index) {
    const article = state.featured[index];
    if (!article) return;
    state.activeFeatured = index;
    qsa('.news-featured__item', featuredEl).forEach((item, i) => item.classList.toggle('is-active', i === index));
    if (previewImg.getAttribute('src') !== article.cover) {
      previewImg.classList.remove('is-loaded');
      previewImg.onload = () => previewImg.classList.add('is-loaded');
      previewImg.src = article.cover;
    }
  }

  function paintFeatured() {
    render(featuredEl, html`${state.featured.map((article, index) => html`
      <li class="news-featured__item ${index === state.activeFeatured ? 'is-active' : ''}" data-featured-index="${index}" data-vars="--i:${index}">
        <a href="/news/${article.slug}" title="${article.title}"><span class="news-featured__dot" aria-hidden="true"></span><span class="news-featured__title">${article.title}</span><span class="news-featured__plus" aria-hidden="true">${icons.plus}</span></a>
      </li>`)}`);
    setPreview(state.activeFeatured);
  }

  function cardTemplate(article, index) {
    return html`
      <article class="news-card" data-vars="--i:${index}">
        <a href="/news/${article.slug}" class="news-card__link">
          <div class="news-card__plate" aria-hidden="true"></div>
          <div class="news-card__frame"><img class="news-card__image" src="${article.cover}" alt="" loading="lazy" decoding="async"></div>
          <div class="news-card__body">
            <div class="news-card__meta"><time datetime="${article.publishedAt}">${formatDate(article.publishedAt)}</time><span class="news-card__badge">${t(`news.category.${article.category}`)}</span></div>
            <h2 class="news-card__title">${article.title}</h2>
            <p class="news-card__summary">${article.summary}</p>
          </div>
        </a>
      </article>`;
  }

  function paintPagination(pagination) {
    if (pagination.totalPages <= 1) { render(paginationEl, html``); return; }
    const items = paginationItems(pagination.page, pagination.totalPages);
    render(paginationEl, html`
      <button type="button" class="pagination__arrow" data-page="${pagination.page - 1}" ${pagination.page <= 1 ? 'disabled' : ''} aria-label="${t('news.prevPage')}">${icons.arrowLeft}</button>
      ${items.map((page) => (page === null
        ? html`<span class="pagination__gap" aria-hidden="true">…</span>`
        : html`<button type="button" class="pagination__num ${page === pagination.page ? 'is-active' : ''}" data-page="${page}" ${page === pagination.page ? html`aria-current="page"` : ''} aria-label="${t('news.page')} ${page}">${page}</button>`))}
      <button type="button" class="pagination__arrow" data-page="${pagination.page + 1}" ${pagination.page >= pagination.totalPages ? 'disabled' : ''} aria-label="${t('news.nextPage')}">${icons.arrowRight}</button>`);
  }

  async function loadList({ scroll = false } = {}) {
    state.controller?.abort();
    const controller = new AbortController();
    state.controller = controller;
    // Hold the current height while loading so the page below never jumps up and back.
    if (gridEl.offsetHeight) gridEl.style.minHeight = `${gridEl.offsetHeight}px`;
    gridEl.classList.add('is-loading');
    gridEl.setAttribute('aria-busy', 'true');
    try {
      const result = await api.articles({ lang: getLang(), category: state.category, page: state.page, pageSize: PAGE_SIZE }, controller.signal);
      if (controller.signal.aborted) return;
      if (state.page > result.pagination.totalPages) { state.page = result.pagination.totalPages; syncUrl(); return loadList(); }
      render(gridEl, result.items.length
        ? html`${result.items.map(cardTemplate)}`
        : html`<p class="state state--empty">${t('news.empty')}</p>`);
      paintPagination(result.pagination);
      if (scroll) scrollToTabs();
    } catch (error) {
      if (error.name === 'AbortError') return;
      render(gridEl, errorState(error));
      render(paginationEl, html``);
    } finally {
      if (state.controller === controller) {
        gridEl.classList.remove('is-loading');
        gridEl.setAttribute('aria-busy', 'false');
        requestAnimationFrame(() => { if (state.controller === controller) gridEl.style.removeProperty('min-height'); });
      }
    }
    return undefined;
  }

  /** Scrolls only the news scroller (scrollIntoView could also shift overflow-hidden ancestors). */
  function scrollToTabs() {
    const tabs = qs('.news-tabs', el);
    const offset = Number.parseFloat(getComputedStyle(tabs).scrollMarginTop) || 0;
    const top = tabs.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - offset;
    scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  function syncUrl() {
    const params = new URLSearchParams();
    if (state.category !== 'all') params.set('category', state.category);
    if (state.page > 1) params.set('page', String(state.page));
    const search = params.toString();
    history.replaceState(history.state, '', `/news${search ? `?${search}` : ''}`);
  }

  const ready = Promise.all([
    api.articles({ lang: getLang(), category: 'all', page: 1, pageSize: 5 }).then((result) => {
      state.featured = result.items;
      paintFeatured();
    }).catch(() => { featuredEl.hidden = true; }),
    loadList(),
  ]);

  function selectCategory(tab, { focus = false } = {}) {
    if (focus) tab.focus();
    if (tab.dataset.category === state.category) return;
    state.category = tab.dataset.category;
    state.page = 1;
    qsa('[data-category]', el).forEach((button) => {
      const active = button === tab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    gridEl.setAttribute('aria-labelledby', tab.id);
    syncUrl();
    loadList();
  }

  // WAI-ARIA tabs: arrow keys / Home / End move between categories.
  disposer.on(el, 'keydown', (event) => {
    const tab = event.target instanceof Element ? event.target.closest('[data-category]') : null;
    if (!tab) return;
    const tabs = qsa('[data-category]', el);
    const index = tabs.indexOf(tab);
    const target = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    selectCategory(tabs[(target + tabs.length) % tabs.length], { focus: true });
  });

  disposer.on(el, 'pointerover', (event) => {
    const item = event.target.closest('[data-featured-index]');
    if (item) setPreview(Number(item.dataset.featuredIndex));
  });
  disposer.on(el, 'focusin', (event) => {
    const item = event.target.closest('[data-featured-index]');
    if (item) setPreview(Number(item.dataset.featuredIndex));
  });
  disposer.on(el, 'click', (event) => {
    if (event.target.closest('[data-retry]')) { loadList(); return; }
    if (event.target.closest('[data-next-section]')) { ctx.stepSection('down'); return; }
    const tab = event.target.closest('[data-category]');
    if (tab) { selectCategory(tab); return; }
    const pageButton = event.target.closest('[data-page]');
    if (pageButton && !pageButton.disabled) {
      state.page = Number(pageButton.dataset.page);
      syncUrl();
      loadList({ scroll: true });
    }
  });

  return {
    el,
    title: `${t('news.title')} — TensuraLabs`,
    ready,
    enter() { el.classList.add('is-entered'); },
    leave() { el.classList.remove('is-entered'); },
    destroy() { state.controller?.abort(); disposer.run(); },
  };
}
