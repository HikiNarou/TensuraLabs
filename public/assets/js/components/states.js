import { html } from '../core/dom.js';
import { t } from '../core/i18n.js';

/** Error placeholder; pages handle clicks on [data-retry] through event delegation. */
export function errorState(error) {
  return html`
    <div class="state state--error" role="alert">
      <p>${t('common.loadError')}</p>
      <small>${error?.message ?? ''}</small>
      <button type="button" class="pill pill--light" data-retry>${t('common.retry')}</button>
    </div>`;
}

export function skeletonCards(count) {
  return html`${Array.from({ length: count }, () => html`<div class="news-card news-card--skeleton" aria-hidden="true"><div class="news-card__frame"></div><div class="news-card__body"><i></i><i></i><i></i></div></div>`)}`;
}
