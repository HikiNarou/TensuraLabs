import { html, render } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { icons } from '../components/icons.js';

export function createPage() {
  const el = document.createElement('section');
  el.className = 'page page-404';
  el.tabIndex = -1;
  render(el, html`
    <div class="page-404__inner">
      <span class="page-404__slime" aria-hidden="true">${icons.logoMark}</span>
      <span class="page-404__code">404</span>
      <h1>${t('notFound.title')}</h1>
      <p>${t('notFound.text')}</p>
      <a class="btn-parchment btn-parchment--small" href="/"><span class="btn-parchment__label">${t('notFound.back')}</span></a>
    </div>`);
  return {
    el,
    title: `404 — TensuraLabs`,
    enter() { el.classList.add('is-entered'); },
    destroy() {},
  };
}
