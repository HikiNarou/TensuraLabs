import { api } from '../core/api.js';
import { createDisposer, formatDate, html, preloadImages, render, qs, qsa } from '../core/dom.js';
import { getLang, t } from '../core/i18n.js';
import { icons } from '../components/icons.js';
import { createModal } from '../components/modal.js';
import { errorState } from '../components/states.js';

export function createPage(ctx) {
  const disposer = createDisposer();
  const el = document.createElement('section');
  el.className = 'page page-gallery';
  el.tabIndex = -1;
  el.setAttribute('aria-label', t('gallery.title'));
  const state = { items: [], index: 0 };
  let detailModal = null;

  const circularOffset = (i) => {
    const total = state.items.length;
    let offset = i - state.index;
    if (offset > total / 2) offset -= total;
    if (offset < -total / 2) offset += total;
    return offset;
  };

  function paint() {
    render(el, html`
      <div class="gallery-bg" aria-hidden="true">
        ${state.items.map((item, i) => html`<img src="${item.thumbnail}" alt="" class="${i === state.index ? 'is-active' : ''}" data-bg="${i}">`)}
      </div>
      <div class="gallery-head">
        <div class="section-title section-title--light"><h1>${t('gallery.title')}</h1></div>
        <div class="gallery-thumbs">
          <button type="button" class="round-arrow round-arrow--cream" data-step="-1" aria-label="${t('gallery.prev')}">${icons.arrowLeft}</button>
          <div class="gallery-thumbs__track">
            ${state.items.map((item, i) => html`<button type="button" class="gallery-thumb ${i === state.index ? 'is-active' : ''}" data-index="${i}" aria-label="${item.title}" aria-current="${i === state.index}"><img src="${item.thumbnail}" alt="" loading="lazy"></button>`)}
          </div>
          <button type="button" class="round-arrow round-arrow--cream" data-step="1" aria-label="${t('gallery.next')}">${icons.arrowRight}</button>
        </div>
      </div>
      <div class="gallery-carousel" data-carousel aria-roledescription="carousel">
        ${state.items.map((item, i) => html`
          <figure class="gallery-card" data-card="${i}" aria-roledescription="slide" aria-label="${i + 1} / ${state.items.length}">
            <button type="button" class="gallery-card__media" data-open="${i}" aria-label="${t('gallery.open')}: ${item.title}">
              <img src="${item.thumbnail}" alt="" decoding="async">
              <span class="gallery-card__play" aria-hidden="true">${icons.play}</span>
            </button>
            <figcaption class="gallery-card__caption"><span>${item.title}</span><time datetime="${item.date}">${formatDate(item.date)}</time></figcaption>
          </figure>`)}
      </div>`);
    layout();
  }

  function layout() {
    qsa('[data-card]', el).forEach((card) => {
      const offset = circularOffset(Number(card.dataset.card));
      card.style.setProperty('--offset', String(offset));
      card.style.setProperty('--abs', String(Math.abs(offset)));
      card.classList.toggle('is-active', offset === 0);
      card.toggleAttribute('inert', Math.abs(offset) > 1);
      card.setAttribute('aria-hidden', String(offset !== 0));
    });
    qsa('[data-bg]', el).forEach((img) => img.classList.toggle('is-active', Number(img.dataset.bg) === state.index));
    qsa('.gallery-thumb', el).forEach((thumb, i) => {
      thumb.classList.toggle('is-active', i === state.index);
      thumb.setAttribute('aria-current', String(i === state.index));
    });
    // Scroll only the thumbnail track (scrollIntoView would also scroll overflow-hidden ancestors).
    const track = qs('.gallery-thumbs__track', el);
    const thumb = qs('.gallery-thumb.is-active', el);
    if (track && thumb) {
      const left = thumb.offsetLeft - (track.clientWidth - thumb.offsetWidth) / 2;
      track.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
    }
  }

  function select(index) {
    const total = state.items.length;
    if (!total) return;
    state.index = ((index % total) + total) % total;
    layout();
  }

  function openDetail(index) {
    const item = state.items[index];
    if (!item) return;
    detailModal ??= createModal({ className: 'modal--project' });
    render(detailModal.dialog, html`
      <div class="project">
        <button type="button" class="project__close" data-close aria-label="${t('common.close')}">${icons.close}</button>
        <div class="project__media">
          ${item.videoUrl
            ? html`<iframe src="${item.videoUrl}" title="${item.title}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>`
            : html`<img src="${item.thumbnail}" alt="${item.title}">`}
        </div>
        <div class="project__body">
          <time datetime="${item.date}">${formatDate(item.date)}</time>
          <h2>${item.title}</h2>
          <p>${item.summary}</p>
          <h3>${t('gallery.stack')}</h3>
          <ul class="project__stack">${item.stack.map((tech) => html`<li>${tech}</li>`)}</ul>
          <div class="project__actions">
            ${item.projectUrl ? html`<a class="pill pill--light" href="${item.projectUrl}" target="_blank" rel="noopener noreferrer">${t('gallery.visit')} ${icons.external}</a>` : ''}
            <button type="button" class="btn-navy" data-consult><span>${t('gallery.consult')}</span><i aria-hidden="true"></i></button>
          </div>
        </div>
      </div>`);
    detailModal.dialog.setAttribute('aria-label', item.title);
    detailModal.dialog.onclick = (event) => {
      if (event.target.closest('[data-consult]')) { detailModal.close(); ctx.openConsult(); }
    };
    detailModal.open();
  }

  const ready = api.portfolio(getLang()).then(async (items) => {
    state.items = items;
    paint();
    await preloadImages(items.map((item) => item.thumbnail));
  }).catch((error) => render(el, errorState(error)));

  disposer.on(el, 'click', (event) => {
    if (Date.now() < suppressClickUntil) return;
    if (event.target.closest('[data-retry]')) { ctx.refresh(); return; }
    const step = event.target.closest('[data-step]');
    if (step) { select(state.index + Number(step.dataset.step)); return; }
    const thumb = event.target.closest('[data-index]');
    if (thumb) { select(Number(thumb.dataset.index)); return; }
    const open = event.target.closest('[data-open]');
    if (open) {
      const index = Number(open.dataset.open);
      if (index === state.index) openDetail(index); else select(index);
    }
  });
  disposer.on(window, 'keydown', (event) => {
    if (ctx.isOverlayOpen()) return;
    if (event.key === 'ArrowRight') select(state.index + 1);
    if (event.key === 'ArrowLeft') select(state.index - 1);
  });

  // Horizontal swipe / drag.
  let dragStart = null;
  let suppressClickUntil = 0;
  disposer.on(el, 'pointerdown', (event) => {
    if (event.target.closest('[data-carousel]')) dragStart = { x: event.clientX, y: event.clientY };
  });
  disposer.on(window, 'pointerup', (event) => {
    if (!dragStart) return;
    const dx = event.clientX - dragStart.x;
    const dy = event.clientY - dragStart.y;
    dragStart = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      suppressClickUntil = Date.now() + 350;
      select(state.index + (dx < 0 ? 1 : -1));
    }
  });

  return {
    el,
    title: `${t('gallery.title')} — TensuraLabs`,
    ready,
    enter() { el.classList.add('is-entered'); },
    leave() { el.classList.remove('is-entered'); },
    destroy() { disposer.run(); detailModal?.destroy(); },
  };
}
