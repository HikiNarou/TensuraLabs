import { api } from '../core/api.js';
import { createDisposer, formatDate, html, raw, render } from '../core/dom.js';
import { getLang, t } from '../core/i18n.js';
import { renderMarkdown } from '../core/markdown.js';
import { icons } from '../components/icons.js';
import { errorState } from '../components/states.js';

export function createPage(ctx) {
  const disposer = createDisposer();
  const el = document.createElement('section');
  el.className = 'page page-article paper-bg';
  el.tabIndex = -1;
  const page = { el, title: `${t('news.title')} — TensuraLabs` };

  const closeButton = html`<a class="article-close" href="/news" aria-label="${t('news.close')}">${icons.crossed}</a>`;

  page.ready = api.article(ctx.params.slug, getLang()).then((article) => {
    page.title = `${article.title} — TensuraLabs`;
    document.title = page.title;
    render(el, html`
      <div class="article-scroll" data-scroll>
        ${closeButton}
        <article class="article">
          <header class="article__header">
            <h1 class="article__title">${article.title}</h1>
            <div class="article__meta">
              <time datetime="${article.publishedAt}">${formatDate(article.publishedAt)}</time>
              <span class="news-card__badge">${t(`news.category.${article.category}`)}</span>
            </div>
          </header>
          <div class="article__cover"><img src="${article.cover}" alt="" decoding="async"></div>
          <div class="article__body prose">${raw(renderMarkdown(article.body))}</div>
          <nav class="article__nav" aria-label="${t('news.title')}">
            ${article.neighbours.newer ? html`<a class="pill" href="/news/${article.neighbours.newer}">${icons.arrowLeft}<span>${t('news.newer')}</span></a>` : html`<span></span>`}
            ${article.neighbours.older ? html`<a class="pill" href="/news/${article.neighbours.older}"><span>${t('news.older')}</span>${icons.arrowRight}</a>` : html`<span></span>`}
          </nav>
        </article>
      </div>`);
  }).catch((error) => {
    const message = error.status === 404 ? html`<div class="state state--error" role="alert"><p>${t('news.notFound')}</p><a class="pill pill--dark" href="/news">${t('news.close')}</a></div>` : errorState(error);
    render(el, html`<div class="article-scroll">${closeButton}<div class="article">${message}</div></div>`);
  });

  disposer.on(el, 'click', (event) => { if (event.target.closest('[data-retry]')) ctx.refresh(); });
  disposer.on(window, 'keydown', (event) => {
    if (event.key === 'Escape' && !ctx.isOverlayOpen()) ctx.navigate('/news');
  });

  page.enter = () => el.classList.add('is-entered');
  page.leave = () => el.classList.remove('is-entered');
  page.destroy = () => disposer.run();
  return page;
}
