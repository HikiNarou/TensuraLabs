import { audio } from './core/audio.js';
import { escapeHtml, wait } from './core/dom.js';
import { getLang, onLangChange, t } from './core/i18n.js';
import { createRouter } from './core/router.js';
import { createSectionScroll } from './core/section-scroll.js';
import { configureSections, isSectionEnabled, sectionTransition } from './core/sections.js';
import { getSite, isPreview, listenForPreview, loadSettings, onSettingsChange, pick } from './core/site.js';
import { createTransitions } from './core/transitions.js';
import { createConsultModal } from './components/consult-modal.js';
import { createHeader } from './components/header.js';
import { createSectionNav } from './components/section-nav.js';

/** The home hero image is the LCP element; preload it only when the visit starts on the home page. */
if (location.pathname === '/') {
  const hint = document.createElement('link');
  Object.assign(hint, { rel: 'preload', as: 'image', href: '/assets/img/key-visual.jpg' });
  hint.setAttribute('fetchpriority', 'high');
  document.head.append(hint);
}

/** Used only when the settings API is unreachable; the home page then shows a retry state. */
const FALLBACK = {
  site: {
    name: 'TensuraLabs',
    brand: { name: 'TensuraLabs', legalName: 'TensuraLabs' },
    contact: { email: 'hello@tensuralabs.id' },
    motion: {}, sections: {}, homeBlocks: {}, seo: {},
    announcement: { enabled: false }, maintenance: { enabled: false },
  },
  home: null,
};

const ALL_ROUTES = [
  { name: 'home', pattern: /^\/$/, load: () => import('./pages/home.js') },
  { name: 'squad', pattern: /^\/squad\/?$/, load: () => import('./pages/squad.js') },
  { name: 'news', pattern: /^\/news\/?$/, load: () => import('./pages/news.js') },
  { name: 'news-detail', pattern: /^\/news\/([a-z0-9-]+)\/?$/, params: ['slug'], load: () => import('./pages/news-detail.js') },
  { name: 'gallery', pattern: /^\/gallery\/?$/, load: () => import('./pages/gallery.js') },
  { name: 'world', pattern: /^\/world\/?$/, load: () => import('./pages/world.js') },
  { name: 'legal', pattern: /^\/legal\/?$/, load: () => import('./pages/legal.js') },
];
const ALWAYS_ON = new Set(['home', 'legal']);
const NOT_FOUND = { name: 'not-found', pattern: /.*/, load: () => import('./pages/not-found.js') };

/** Live route table; disabled sections fall through to the 404 page. */
const ROUTES = [];
function syncRoutes() {
  ROUTES.splice(0, ROUTES.length, ...ALL_ROUTES.filter((route) => ALWAYS_ON.has(route.name) || isSectionEnabled(route.name)));
}

function setViewportUnit() {
  document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
}

const setMeta = (selector, value) => { if (value) document.querySelector(selector)?.setAttribute('content', value); };

function updateMeta() {
  const seo = pick(getSite()?.seo ?? {});
  setMeta('meta[name="description"]', seo.description || t('meta.description'));
  setMeta('meta[property="og:description"]', seo.description || t('meta.description'));
  setMeta('meta[property="og:title"]', seo.title || t('meta.title'));
  setMeta('meta[property="og:image"]', getSite()?.seo?.ogImage);
}
const defaultTitle = () => pick(getSite()?.seo ?? {}).title || t('meta.title');

async function hideLoader(startedAt) {
  const loader = document.getElementById('loader');
  if (!loader) return;
  const elapsed = performance.now() - startedAt;
  if (elapsed < 700) await wait(700 - elapsed);
  loader.classList.add('is-done');
  document.documentElement.classList.remove('is-loading');
  await wait(650);
  loader.remove();
}

/** Full-screen notice shown to visitors while the admin has maintenance mode switched on. */
function showMaintenance(site) {
  const copy = pick(site.maintenance);
  const contact = site.contact ?? {};
  const app = document.getElementById('app');
  app.innerHTML = `
    <section class="maintenance" role="main">
      <div class="maintenance__glow" aria-hidden="true"></div>
      <div class="maintenance__card">
        <span class="maintenance__badge"><i></i>${escapeHtml(site.brand?.name ?? site.name)}</span>
        <h1>${escapeHtml(copy.title || t('maintenance.back'))}</h1>
        <p>${escapeHtml(copy.text || '')}</p>
        ${contact.email ? `<a class="maintenance__link" href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a>` : ''}
      </div>
    </section>`;
  document.title = copy.title || site.name;
}

/** Privacy-friendly page view beacon (server honours DNT/GPC and ignores bots). */
let firstView = true;
function trackView(path) {
  if (isPreview) return;
  const body = JSON.stringify({ path, referrer: firstView ? document.referrer : '' });
  firstView = false;
  fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'same-origin' }).catch(() => {});
}

/** Thin progress bar + header "scrolled" state, bound to the current page's inner scroller. */
function createScrollWatcher({ mount, header }) {
  const bar = document.createElement('div');
  bar.className = 'scroll-progress';
  bar.setAttribute('aria-hidden', 'true');
  bar.innerHTML = '<i></i>';
  mount.append(bar);
  let unbind = () => {};
  let frame = 0;

  function measure(scroller) {
    frame = 0;
    const max = scroller.scrollHeight - scroller.clientHeight;
    const progress = max > 4 ? scroller.scrollTop / max : 0;
    bar.style.setProperty('--p', progress.toFixed(4));
    bar.classList.toggle('is-active', max > 4);
    header.setScrolled(scroller.scrollTop > 12);
  }

  return {
    attach(el) {
      unbind();
      const scroller = el.querySelector('[data-scroll]') ?? (el.matches('[data-scroll]') ? el : null);
      if (!scroller) { bar.classList.remove('is-active'); header.setScrolled(false); unbind = () => {}; return; }
      const onScroll = () => { if (!frame) frame = requestAnimationFrame(() => measure(scroller)); };
      scroller.addEventListener('scroll', onScroll, { passive: true });
      unbind = () => { scroller.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); frame = 0; };
      measure(scroller);
    },
  };
}

async function bootstrap() {
  const startedAt = performance.now();
  setViewportUnit();
  window.addEventListener('resize', setViewportUnit);

  const { site } = await loadSettings(FALLBACK);
  configureSections(site.sections);
  syncRoutes();
  updateMeta();
  document.documentElement.classList.toggle('no-liquid', site.motion?.liquidTransitions === false);

  if (site.maintenance?.enabled && !isPreview) {
    showMaintenance(site);
    await hideLoader(startedAt);
    return;
  }

  const consult = createConsultModal();
  const chrome = document.getElementById('chrome');
  const header = createHeader({ mount: chrome, getSite, openConsult: () => consult.open() });
  const watcher = createScrollWatcher({ mount: chrome, header });

  const canvas = document.getElementById('liquid-canvas');
  const transitions = createTransitions({ canvas, beforeInitial: () => hideLoader(startedAt), getSite });

  let router = null;
  let sectionScroll = null;
  const isOverlayOpen = () => header.isMenuOpen || document.documentElement.classList.contains('is-modal-open');
  const sectionNav = createSectionNav({ mount: chrome, onStep: (direction) => sectionScroll?.step(direction) });
  const context = {
    get site() { return getSite(); },
    openConsult: (options) => consult.open(options),
    isOverlayOpen,
    refresh: () => router.refresh(),
    defaultTitle,
    stepSection: (direction) => sectionScroll?.step(direction),
  };

  router = createRouter({
    outlet: document.getElementById('app'),
    routes: ROUTES,
    notFound: NOT_FOUND,
    transitions,
    context,
    resolveTransition: sectionTransition,
    onChange: (current) => {
      header.setActive(current.route.name);
      sectionNav.setRoute(current.route.name);
      document.body.dataset.route = current.route.name;
      watcher.attach(current.el);
      trackView(current.path);
    },
  });
  sectionScroll = createSectionScroll({ router, isBlocked: isOverlayOpen, onPressure: (state) => sectionNav.setPressure(state) });

  onLangChange(() => { updateMeta(); router.refresh(); });
  onSettingsChange(({ site: next }) => {
    configureSections(next.sections);
    syncRoutes();
    updateMeta();
    document.documentElement.classList.toggle('no-liquid', next.motion?.liquidTransitions === false);
    header.refresh();
    sectionNav.refresh();
    // Keep the editor's scroll position while drafts stream in.
    const scroller = router.current?.el.querySelector('[data-scroll]');
    const top = scroller?.scrollTop ?? 0;
    Promise.resolve(router.refresh('instant')).then(() => {
      const next = router.current?.el.querySelector('[data-scroll]');
      if (next && top) { next.scrollTop = top; next.dispatchEvent(new Event('scroll')); }
    });
  });
  listenForPreview();
  audio.resumeOnGesture();
  document.documentElement.lang = getLang();
  await router.start();
}

bootstrap().catch((error) => {
  console.error(error);
  document.getElementById('loader')?.classList.add('is-done');
  document.documentElement.classList.remove('is-loading');
});
