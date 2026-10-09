import { audio } from '../core/audio.js';
import { html, qs, qsa, render } from '../core/dom.js';
import { getLang, languages, onLangChange, setLang, t } from '../core/i18n.js';
import { SECTIONS, sectionNumber } from '../core/sections.js';
import { flourish, icons, logo } from './icons.js';

/** Site header: brand, section menu, language, share, audio, admin entry, and consult CTA. */
export function createHeader({ mount, getSite, openConsult }) {
  const root = document.createElement('header');
  root.className = 'site-header';
  const backdrop = document.createElement('div');
  backdrop.className = 'menu-backdrop';
  mount.append(backdrop, root);

  let activeRoute = 'home';
  let menuOpen = false;
  let openDropdown = null;

  const SOCIALS = [['x', 'X'], ['instagram', 'Instagram'], ['linkedin', 'LinkedIn'], ['github', 'GitHub']];
  const shareLinks = () => {
    const contact = getSite()?.contact ?? {};
    return SOCIALS.filter(([key]) => contact[key]).map(([key, label]) => ({ key, label, href: contact[key] }));
  };

  const languageList = () => html`
    <ul class="dropdown__list" role="menu">
      ${languages.map((lang) => html`
        <li role="none"><button type="button" role="menuitemradio" aria-checked="${lang.code === getLang()}" class="dropdown__item ${lang.code === getLang() ? 'is-active' : ''}" data-lang="${lang.code}">
          <span>${lang.label}</span>${lang.code === getLang() ? html`<span class="dropdown__check">${icons.check}</span>` : ''}
        </button></li>`)}
    </ul>`;

  const shareList = () => html`
    <ul class="dropdown__list dropdown__list--share" role="menu">
      ${shareLinks().map((link) => html`
        <li role="none"><a role="menuitem" class="dropdown__item" href="${link.href}" target="_blank" rel="noopener noreferrer">
          <span class="dropdown__icon">${icons[link.key]}</span><span>${link.label}</span>
        </a></li>`)}
      <li role="none"><button type="button" role="menuitem" class="dropdown__item" data-copy-link>
        <span class="dropdown__icon">${icons.link}</span><span data-copy-label>${t('common.copyLink')}</span>
      </button></li>
    </ul>`;

  function template() {
    const audioLabel = audio.enabled ? t('header.audioOff') : t('header.audioOn');
    return html`
      <div class="bar">
        <a class="bar__brand" href="/" aria-label="TensuraLabs — ${t('nav.home')}">${logo}</a>
        <button type="button" class="bar__toggle" aria-expanded="${menuOpen}" aria-controls="site-menu">
          <span class="bar__toggle-icon">${menuOpen ? '' : icons.menu}</span>
          <span class="gold-text">${menuOpen ? t('menu.collapse') : t('menu.show')}</span>
          ${menuOpen ? html`<span class="bar__toggle-x">${icons.close}</span>` : ''}
        </button>
        <div class="bar__tools">
          <a class="bar__icon" href="${getSite()?.mailUrl || '/mail'}" data-external aria-label="${t('header.mail')}" title="${t('header.mail')}">${icons.mail}</a>
          <a class="bar__icon" href="/admin" data-external aria-label="${t('header.login')}" title="${t('header.login')}">${icons.user}</a>
          <div class="dropdown" data-dropdown="lang">
            <button type="button" class="bar__icon" aria-haspopup="true" aria-expanded="${openDropdown === 'lang'}" aria-label="${t('header.language')}" title="${t('header.language')}">${icons.globe}</button>
            <div class="dropdown__panel">${languageList()}</div>
          </div>
          <div class="dropdown" data-dropdown="share">
            <button type="button" class="bar__icon" aria-haspopup="true" aria-expanded="${openDropdown === 'share'}" aria-label="${t('header.share')}" title="${t('header.share')}">${icons.share}</button>
            <div class="dropdown__panel">${shareList()}</div>
          </div>
          <button type="button" class="bar__icon bar__icon--audio ${audio.enabled ? 'is-playing' : ''}" data-audio-toggle aria-pressed="${audio.enabled}" aria-label="${audioLabel}" title="${audioLabel}">
            ${audio.enabled ? icons.audioOn : icons.audioOff}
          </button>
        </div>
        <button type="button" class="btn-reserve" data-open-consult><span>${t('header.consult')}</span><b aria-hidden="true">+</b></button>
        <button type="button" class="bar__icon bar__icon--audio bar__mobile-audio ${audio.enabled ? 'is-playing' : ''}" data-audio-toggle aria-pressed="${audio.enabled}" aria-label="${audioLabel}">
          ${audio.enabled ? icons.audioOn : icons.audioOff}
        </button>
        <button type="button" class="bar__burger" aria-expanded="${menuOpen}" aria-controls="site-menu" aria-label="${t('header.menu')}">${menuOpen ? icons.close : icons.menu}</button>
      </div>
      <nav class="menu ${menuOpen ? 'is-open' : ''}" id="site-menu" aria-label="Menu" ${menuOpen ? '' : 'inert'}>
        <ol class="menu__list">
          ${SECTIONS.map((item, index) => {
            const isActive = (item.match ?? [item.route]).includes(activeRoute);
            return html`
              <li class="menu__row ${isActive ? 'is-active' : ''}" data-vars="--i:${index}">
                <a href="${item.path}" ${isActive ? html`aria-current="page"` : ''}>
                  <span class="menu__index">${sectionNumber(index)}</span>
                  <span class="menu__label">${t(item.label)}</span>
                  <span class="menu__line" aria-hidden="true">${flourish}</span>
                  <span class="menu__cipher" aria-hidden="true">${t(item.cipher)}</span>
                </a>
              </li>`;
          })}
        </ol>
        <div class="menu__mobile-extras">
          <div class="menu__langs" role="group" aria-label="${t('header.language')}">
            ${languages.map((lang) => html`<button type="button" class="menu__lang ${lang.code === getLang() ? 'is-active' : ''}" data-lang="${lang.code}" aria-pressed="${lang.code === getLang()}">${lang.label}</button>`)}
          </div>
          <div class="menu__socials">
            ${shareLinks().map((link) => html`<a href="${link.href}" target="_blank" rel="noopener noreferrer" aria-label="${link.label}">${icons[link.key]}</a>`)}
            <a href="${getSite()?.mailUrl || '/mail'}" data-external aria-label="${t('header.mail')}">${icons.mail}</a>
            <a href="/admin" data-external aria-label="${t('header.login')}">${icons.user}</a>
          </div>
        </div>
        <span class="menu__corner menu__corner--left" aria-hidden="true"></span>
        <span class="menu__corner menu__corner--right" aria-hidden="true"></span>
      </nav>`;
  }

  function paint() {
    render(root, template());
    root.classList.toggle('is-menu-open', menuOpen);
    backdrop.classList.toggle('is-visible', menuOpen);
    document.documentElement.classList.toggle('is-menu-open', menuOpen);
    qsa('.dropdown', root).forEach((dropdown) => dropdown.classList.toggle('is-open', dropdown.dataset.dropdown === openDropdown));
  }

  function setMenu(open) {
    if (menuOpen === open) return;
    menuOpen = open;
    openDropdown = null;
    paint();
    if (open) qs('.menu__row a', root)?.focus({ preventScroll: true });
  }

  function setDropdown(name) {
    openDropdown = openDropdown === name ? null : name;
    qsa('.dropdown', root).forEach((dropdown) => {
      const isOpen = dropdown.dataset.dropdown === openDropdown;
      dropdown.classList.toggle('is-open', isOpen);
      qs('button', dropdown).setAttribute('aria-expanded', String(isOpen));
    });
  }

  root.addEventListener('click', async (event) => {
    const target = event.target;
    if (target.closest('.bar__toggle, .bar__burger')) { setMenu(!menuOpen); return; }
    if (target.closest('[data-open-consult]')) { setMenu(false); openConsult(); return; }
    if (target.closest('[data-audio-toggle]')) { audio.toggle(); return; }
    const langButton = target.closest('[data-lang]');
    if (langButton) { openDropdown = null; setLang(langButton.dataset.lang); return; }
    if (target.closest('[data-copy-link]')) {
      try {
        await navigator.clipboard.writeText(location.href);
        const label = qs('[data-copy-label]', root);
        if (label) label.textContent = t('common.copied');
      } catch { /* clipboard may be unavailable (insecure context) */ }
      return;
    }
    const dropdownButton = target.closest('.dropdown > button');
    if (dropdownButton) { setDropdown(dropdownButton.parentElement.dataset.dropdown); return; }
    if (target.closest('.menu a')) setMenu(false);
  });

  backdrop.addEventListener('click', () => setMenu(false));
  document.addEventListener('click', (event) => {
    if (openDropdown && !event.target.closest('.dropdown')) setDropdown(null);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (openDropdown) setDropdown(null);
    else if (menuOpen) { setMenu(false); qs('.bar__toggle', root)?.focus(); }
  });
  window.addEventListener('resize', () => { if (openDropdown) setDropdown(null); });

  onLangChange(paint);
  audio.onChange(paint);
  paint();

  return {
    setActive(route) { activeRoute = route; root.dataset.route = route; paint(); },
    refresh: paint,
    setScrolled(scrolled) { root.classList.toggle('is-scrolled', scrolled); },
    closeMenu: () => setMenu(false),
    get isMenuOpen() { return menuOpen; },
  };
}
