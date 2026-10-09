import { createDisposer, html, isMobileViewport, preloadImages, prefersReducedMotion, render } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { bindSpotlight, createScrollFx } from '../core/scroll-fx.js';
import { SECTIONS } from '../core/sections.js';
import { getHome, getSite, pick } from '../core/site.js';
import { icons, logo } from '../components/icons.js';
import { errorState } from '../components/states.js';

const HERO_IMAGE = '/assets/img/key-visual.jpg';
const ROTATE_MS = 2600;

const sectionHead = (block, align = 'center') => html`
  <header class="hx-head hx-head--${align}">
    ${block.kicker ? html`<p class="hx-kicker" data-reveal>${block.kicker}</p>` : ''}
    <h2 class="hx-title" data-reveal>${block.title}</h2>
    ${block.subtitle ? html`<p class="hx-subtitle" data-reveal>${block.subtitle}</p>` : ''}
  </header>`;

function heroTemplate(home, site) {
  const { hero } = home;
  const announcement = site.announcement?.enabled ? pick(site.announcement) : null;
  const internal = (href) => href.startsWith('/');
  return html`
    <section class="hx-hero" data-hero>
      <div class="hx-hero__bg" aria-hidden="true">
        <div class="hx-hero__kv-wrap"><img class="hx-hero__kv" src="${HERO_IMAGE}" alt="" decoding="async" fetchpriority="high"></div>
        <div class="hx-hero__aurora"></div>
        <div class="hx-hero__grid"></div>
        ${site.motion?.ambientBubbles !== false ? html`<canvas class="home-bubbles"></canvas>` : ''}
        <div class="hx-hero__shade"></div>
      </div>
      <div class="hx-container hx-hero__inner">
        <div class="hx-hero__copy">
          ${announcement?.text ? html`
            <a class="hx-announce" data-anim href="${site.announcement.href || '/news'}" ${internal(site.announcement.href || '/') ? '' : html`target="_blank" rel="noopener noreferrer" data-external`}>
              ${announcement.label ? html`<b>${announcement.label}</b>` : ''}<span>${announcement.text}</span>${icons.arrowRight}
            </a>` : ''}
          <p class="hx-eyebrow" data-anim><span class="hx-pulse" aria-hidden="true"></span>${hero.eyebrow}</p>
          <h1 class="hx-hero__title" data-anim>
            <span class="hx-hero__lead-line">${hero.titleLead}</span>
            <span class="hx-rotator" data-rotator><span class="visually-hidden">${hero.rotating.join(', ')}</span><span class="hx-rotator__stack" aria-hidden="true">${hero.rotating.map((word, index) => html`<span class="hx-rotator__word ${index === 0 ? 'is-active' : ''}">${word}</span>`)}</span></span>
            ${hero.titleTail ? html`<span class="hx-hero__tail">${hero.titleTail}</span>` : ''}
          </h1>
          <p class="hx-hero__lead" data-anim>${hero.lead}</p>
          <div class="hx-hero__actions" data-anim>
            <button type="button" class="hx-btn hx-btn--primary" data-open-consult><span>${hero.primaryCta}</span>${icons.arrowUpRight}</button>
            ${hero.secondaryCta ? html`<a class="hx-btn hx-btn--ghost" href="${hero.secondaryHref || '/gallery'}"><span>${hero.secondaryCta}</span>${icons.arrowRight}</a>` : ''}
          </div>
          ${hero.trust ? html`<p class="hx-trust" data-anim><span class="hx-trust__dots" aria-hidden="true"><i></i><i></i><i></i><i></i></span>${hero.trust}</p>` : ''}
        </div>
        <aside class="hx-deploy" data-anim aria-hidden="true">
          <div class="hx-deploy__bar"><i></i><i></i><i></i><span>${icons.terminal} tensuralabs / ci-cd</span></div>
          <ul class="hx-deploy__log">
            <li class="is-done"><b>${icons.check}</b><span>${t('home.deploy.build')}</span><em>42s</em></li>
            <li class="is-done"><b>${icons.check}</b><span>${t('home.deploy.test')}</span><em>312 ✓</em></li>
            <li class="is-done"><b>${icons.check}</b><span>${t('home.deploy.scan')}</span><em>A+</em></li>
            <li class="is-running"><b><i></i></b><span>${t('home.deploy.release')}</span><em>v2.4.0</em></li>
          </ul>
          <div class="hx-deploy__progress"><i></i></div>
          <div class="hx-deploy__foot"><span><i class="hx-dot"></i>${t('home.deploy.healthy')}</span><span>p95 · 84ms</span></div>
        </aside>
      </div>
      ${home.stats.length ? html`
        <div class="hx-container">
          <dl class="hx-stats" data-anim>
            ${home.stats.map((stat) => html`<div class="hx-stat"><dt>${stat.label}</dt><dd data-count>${stat.value}</dd></div>`)}
          </dl>
        </div>` : ''}
      <button type="button" class="hx-scrollcue" data-scroll-down aria-label="${t('hero.scroll')}"><span class="hx-scrollcue__mouse"><i></i></span><small>${t('home.scroll')}</small></button>
    </section>`;
}

function clientsTemplate(block) {
  if (!block.items.length) return '';
  const row = html`${block.items.map((name) => html`<li>${name}</li>`)}`;
  return html`
    <section class="hx-marquee" aria-label="${block.title}">
      ${block.title ? html`<p class="hx-marquee__title" data-reveal>${block.title}</p>` : ''}
      <div class="hx-marquee__viewport" data-reveal>
        <ul class="hx-marquee__track">${row}</ul>
        <ul class="hx-marquee__track" aria-hidden="true">${row}</ul>
      </div>
    </section>`;
}

function servicesTemplate(block) {
  return html`
    <section class="hx-section hx-services" id="services">
      <div class="hx-container">
        ${sectionHead(block)}
        <div class="hx-grid hx-grid--3" data-stagger="90">
          ${block.items.map((item, index) => html`
            <article class="hx-card" data-reveal data-spotlight>
              <span class="hx-card__index">${String(index + 1).padStart(2, '0')}</span>
              <span class="hx-card__icon">${icons[item.icon] ?? icons.code}</span>
              <h3>${item.title}</h3>
              <p>${item.text}</p>
              ${item.tags.length ? html`<ul class="hx-tags">${item.tags.map((tag) => html`<li>${tag}</li>`)}</ul>` : ''}
              <button type="button" class="hx-card__cta" data-open-consult data-service="${item.title}"><span>${t('home.services.cta')}</span>${icons.arrowRight}</button>
            </article>`)}
        </div>
      </div>
    </section>`;
}

function processTemplate(block) {
  return html`
    <section class="hx-section hx-process">
      <div class="hx-container">
        ${sectionHead(block)}
        <div class="hx-steps" data-progress data-vars="--count:${block.steps.length}">
          <span class="hx-steps__line" aria-hidden="true"><i></i></span>
          <ol class="hx-steps__list" data-stagger="120">
            ${block.steps.map((step, index) => html`
              <li class="hx-step" data-reveal>
                <span class="hx-step__num">${String(index + 1).padStart(2, '0')}</span>
                <h3>${step.title}</h3>
                <p>${step.text}</p>
                ${step.duration ? html`<span class="hx-step__time">${step.duration}</span>` : ''}
              </li>`)}
          </ol>
        </div>
      </div>
    </section>`;
}

function metricsTemplate(block) {
  return html`
    <section class="hx-section hx-metrics">
      <div class="hx-container">
        <div class="hx-metrics__panel" data-reveal="scale">
          <div class="hx-metrics__head">
            ${block.kicker ? html`<p class="hx-kicker">${block.kicker}</p>` : ''}
            <h2 class="hx-title">${block.title}</h2>
          </div>
          <dl class="hx-metrics__grid" data-stagger="100">
            ${block.items.map((item) => html`<div class="hx-metric" data-reveal><dd data-count>${item.value}</dd><dt>${item.label}</dt></div>`)}
          </dl>
        </div>
      </div>
    </section>`;
}

function testimonialsTemplate(block) {
  if (!block.items.length) return '';
  return html`
    <section class="hx-section hx-testimonials">
      <div class="hx-container">
        ${sectionHead(block)}
        <div class="hx-quotes" data-stagger="110">
          ${block.items.map((item) => html`
            <figure class="hx-quote" data-reveal data-spotlight>
              <span class="hx-quote__mark" aria-hidden="true">${icons.quote}</span>
              <blockquote>${item.quote}</blockquote>
              <figcaption><span class="hx-avatar" aria-hidden="true">${item.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('')}</span>
                <span><b>${item.name}</b><small>${item.role}</small></span></figcaption>
            </figure>`)}
        </div>
      </div>
    </section>`;
}

function faqTemplate(block) {
  if (!block.items.length) return '';
  return html`
    <section class="hx-section hx-faq">
      <div class="hx-container hx-faq__layout">
        <div class="hx-faq__intro">
          ${sectionHead(block, 'left')}
          <button type="button" class="hx-btn hx-btn--ghost" data-open-consult data-reveal><span>${t('home.faq.ask')}</span>${icons.arrowRight}</button>
        </div>
        <div class="hx-accordion" data-stagger="70">
          ${block.items.map((item, index) => html`
            <div class="hx-acc" data-reveal>
              <h3><button type="button" class="hx-acc__q" aria-expanded="false" aria-controls="faq-${index}" id="faq-q-${index}">
                <span>${item.q}</span><i aria-hidden="true">${icons.chevron}</i></button></h3>
              <div class="hx-acc__a" id="faq-${index}" role="region" aria-labelledby="faq-q-${index}"><div><p>${item.a}</p></div></div>
            </div>`)}
        </div>
      </div>
    </section>`;
}

function ctaTemplate(block, site) {
  const { contact } = site;
  const channels = [
    { key: 'whatsapp', icon: 'whatsapp', href: contact.whatsapp, label: 'WhatsApp' },
    { key: 'email', icon: 'mail', href: contact.email ? `mailto:${contact.email}` : '', label: contact.email },
    { key: 'github', icon: 'github', href: contact.github, label: 'GitHub' },
    { key: 'linkedin', icon: 'linkedin', href: contact.linkedin, label: 'LinkedIn' },
  ].filter((channel) => channel.href);
  return html`
    <section class="hx-section hx-cta">
      <div class="hx-container">
        <div class="hx-cta__card" data-reveal="scale" data-progress>
          <div class="hx-cta__glow" aria-hidden="true"></div>
          <h2>${block.title}</h2>
          ${block.text ? html`<p>${block.text}</p>` : ''}
          <div class="hx-cta__actions">
            <button type="button" class="hx-btn hx-btn--light" data-open-consult><span>${block.button}</span>${icons.arrowUpRight}</button>
          </div>
          <ul class="hx-channels">
            ${channels.map((channel) => html`<li><a href="${channel.href}" ${channel.href.startsWith('mailto:') ? '' : html`target="_blank" rel="noopener noreferrer"`} data-external>
              ${icons[channel.icon]}<span>${channel.label}</span></a></li>`)}
          </ul>
        </div>
      </div>
    </section>`;
}

function footerTemplate(site) {
  const { contact, brand } = site;
  const socials = ['github', 'linkedin', 'instagram', 'x'].filter((key) => contact[key]);
  return html`
    <footer class="hx-footer">
      <div class="hx-container hx-footer__grid">
        <div class="hx-footer__brand">
          <a href="/" aria-label="${brand.name}">${logo}</a>
          <p>${t('home.footer.about')}</p>
          <ul class="hx-footer__socials">${socials.map((key) => html`<li><a href="${contact[key]}" target="_blank" rel="noopener noreferrer" aria-label="${key}">${icons[key]}</a></li>`)}</ul>
        </div>
        <nav aria-label="${t('home.footer.explore')}">
          <h3>${t('home.footer.explore')}</h3>
          <ul>${SECTIONS.map((section) => html`<li><a href="${section.path}">${t(section.label)}</a></li>`)}</ul>
        </nav>
        <div class="hx-footer__col hx-footer__col--contact">
          <h3>${t('home.footer.contact')}</h3>
          <ul class="hx-footer__contact">
            ${contact.email ? html`<li><a href="mailto:${contact.email}" data-external>${icons.mail}<span>${contact.email}</span></a></li>` : ''}
            ${contact.phone ? html`<li><a href="tel:${contact.phone.replace(/[^\d+]/g, '')}" data-external>${icons.phone}<span>${contact.phone}</span></a></li>` : ''}
            ${contact.address ? html`<li><span>${icons.pin}<span>${contact.address}</span></span></li>` : ''}
          </ul>
        </div>
        <div class="hx-footer__col hx-footer__col--legal">
          <h3>${t('home.footer.legal')}</h3>
          <ul>
            <li><a href="/legal#terms">${t('consult.termsLink')}</a></li>
            <li><a href="/legal#privacy">${t('consult.privacyLink')}</a></li>
          </ul>
        </div>
      </div>
      <div class="hx-container hx-footer__bottom">
        <span>© ${new Date().getFullYear()} ${brand.legalName || brand.name}. ${t('home.footer.rights')}</span>
        ${SECTIONS[1] ? html`<button type="button" class="hx-footer__next" data-next><span>${t('section.next', { name: t(SECTIONS[1].label) })}</span>${icons.chevronDown}</button>` : ''}
      </div>
    </footer>`;
}

export function createPage(ctx) {
  const disposer = createDisposer();
  const site = getSite();
  const home = getHome();
  if (!home?.hero) return unavailablePage(ctx);
  const blocks = site.homeBlocks ?? {};
  const el = document.createElement('section');
  el.className = 'page page-home';
  el.tabIndex = -1;
  el.setAttribute('aria-label', t('nav.home'));

  render(el, html`
    <div class="home-scroll" data-scroll>
      ${heroTemplate(home, site)}
      ${blocks.clients !== false ? clientsTemplate(home.clients) : ''}
      ${blocks.services !== false ? servicesTemplate(home.services) : ''}
      ${blocks.process !== false ? processTemplate(home.process) : ''}
      ${blocks.metrics !== false && home.metrics.items.length ? metricsTemplate(home.metrics) : ''}
      ${blocks.testimonials !== false ? testimonialsTemplate(home.testimonials) : ''}
      ${blocks.faq !== false ? faqTemplate(home.faq) : ''}
      ${blocks.cta !== false ? ctaTemplate(home.cta, site) : ''}
      ${footerTemplate(site)}
    </div>`);

  const scroller = el.querySelector('.home-scroll');
  const hero = el.querySelector('[data-hero]');

  disposer.on(el, 'click', (event) => {
    const consult = event.target.closest('[data-open-consult]');
    if (consult) { ctx.openConsult(consult.dataset.service ? { service: consult.dataset.service } : undefined); return; }
    if (event.target.closest('[data-next]')) { ctx.stepSection('down'); return; }
    if (event.target.closest('[data-scroll-down]')) {
      scroller.scrollTo({ top: hero.offsetHeight - 40, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      return;
    }
    const question = event.target.closest('.hx-acc__q');
    if (question) {
      const open = question.getAttribute('aria-expanded') !== 'true';
      question.setAttribute('aria-expanded', String(open));
      question.closest('.hx-acc').classList.toggle('is-open', open);
    }
  });

  // Scroll-linked hero (fade/lift) and the header "scrolled" state. --hero-p is scoped to the
  // hero (smaller style-recalc surface), quantised, and written only when it actually changes.
  let heroHeight = hero.offsetHeight || 1;
  let heroValue = '';
  const heroResize = 'ResizeObserver' in window ? new ResizeObserver(() => { heroHeight = hero.offsetHeight || 1; }) : null;
  heroResize?.observe(hero);
  disposer.add(() => heroResize?.disconnect());
  const fx = createScrollFx(scroller, {
    onScroll: ({ top }) => {
      const value = Math.min(1, top / heroHeight).toFixed(3);
      if (value !== heroValue) { heroValue = value; hero.style.setProperty('--hero-p', value); }
      ctx.onPageScroll?.(top);
    },
  });
  disposer.add(() => fx.destroy());
  disposer.add(bindSpotlight(el));
  disposer.add(startRotator(el.querySelector('[data-rotator]')));
  disposer.add(startPointerParallax(el.querySelector('.hx-hero__kv-wrap')));
  const bubbles = el.querySelector('.home-bubbles');
  if (bubbles) disposer.add(startBubbles(bubbles, hero));

  return {
    el,
    title: ctx.defaultTitle(),
    ready: preloadImages([HERO_IMAGE]),
    enter() {
      el.classList.add('is-entered');
      fx.refresh();
      el.querySelectorAll('.hx-stats [data-count]').forEach((node) => node.classList.add('is-visible'));
    },
    leave() { el.classList.remove('is-entered'); },
    destroy() { disposer.run(); },
  };
}

/** Shown only when the settings API could not be reached during boot. */
function unavailablePage(ctx) {
  const el = document.createElement('section');
  el.className = 'page page-home page-home--offline';
  el.tabIndex = -1;
  render(el, html`<div class="hx-offline">${errorState({ message: t('common.loadError') })}</div>`);
  el.addEventListener('click', (event) => { if (event.target.closest('[data-retry]')) location.reload(); });
  return { el, title: ctx.defaultTitle(), destroy() {} };
}

/**
 * Rotating hero words. Every word sits in the same grid cell, so the line always reserves the box
 * of the longest word: swapping words can never re-wrap the headline or move anything below it.
 * When the longest word is wider than the column it is scaled down (--rot-fit) to stay on one line.
 * Rotation pauses while the hero is off-screen or the tab is hidden, and is off for reduced motion.
 */
function startRotator(rotator) {
  if (!rotator) return () => {};
  const stack = rotator.querySelector('.hx-rotator__stack');
  const words = [...rotator.querySelectorAll('.hx-rotator__word')];
  const cleanups = [];
  let fitScale = 1;

  const fit = () => {
    const available = rotator.clientWidth;
    const width = stack.getBoundingClientRect().width;
    if (!available || !width) return;
    const natural = width / fitScale;
    const next = Math.min(1, Math.floor(((available - 2) / natural) * 1000) / 1000);
    if (Math.abs(next - fitScale) < 0.002) return;
    fitScale = next;
    rotator.style.setProperty('--rot-fit', String(next));
  };
  fit();
  document.fonts?.ready.then(() => { if (rotator.isConnected) fit(); });
  if ('ResizeObserver' in window) {
    let frame = 0;
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fit); });
    observer.observe(rotator);
    cleanups.push(() => { cancelAnimationFrame(frame); observer.disconnect(); });
  }

  if (words.length > 1 && !prefersReducedMotion()) {
    let index = 0;
    let timer = 0;
    let leaveTimer = 0;
    let onScreen = true;
    const advance = () => {
      const previous = words[index];
      index = (index + 1) % words.length;
      words.forEach((word) => word.classList.remove('is-leaving'));
      previous.classList.remove('is-active');
      previous.classList.add('is-leaving');
      words[index].classList.add('is-active');
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => previous.classList.remove('is-leaving'), 800);
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = 0;
      if (onScreen && !document.hidden) timer = setTimeout(() => { advance(); schedule(); }, ROTATE_MS);
    };
    const visibility = 'IntersectionObserver' in window
      ? new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; schedule(); })
      : null;
    visibility?.observe(rotator);
    document.addEventListener('visibilitychange', schedule);
    schedule();
    cleanups.push(() => {
      clearTimeout(timer); clearTimeout(leaveTimer); visibility?.disconnect();
      document.removeEventListener('visibilitychange', schedule);
    });
  }
  return () => cleanups.forEach((cleanup) => cleanup());
}

/** Eased pointer parallax on the key visual (desktop, motion allowed). Idles when settled or off-screen. */
function startPointerParallax(target) {
  if (!target || prefersReducedMotion() || isMobileViewport() || document.documentElement.classList.contains('no-parallax')) return () => {};
  if (window.matchMedia?.('(hover: none)').matches) return () => {};
  const pointer = { x: 0, y: 0, cx: 0, cy: 0 };
  let rafId = 0;
  let last = 0;
  let onScreen = true;
  const tick = (now) => {
    rafId = 0;
    const dt = Math.min(64, last ? now - last : 16.7);
    last = now;
    const k = 1 - Math.pow(1 - 0.06, dt / 16.7); // frame-rate independent easing
    pointer.cx += (pointer.x - pointer.cx) * k;
    pointer.cy += (pointer.y - pointer.cy) * k;
    target.style.transform = `translate3d(${(-pointer.cx * 1.6).toFixed(3)}%, ${(-pointer.cy * 1.1).toFixed(3)}%, 0)`;
    if (Math.abs(pointer.x - pointer.cx) > 0.001 || Math.abs(pointer.y - pointer.cy) > 0.001) rafId = requestAnimationFrame(tick);
    else last = 0;
  };
  const wake = () => { if (!rafId && onScreen && !document.hidden) rafId = requestAnimationFrame(tick); };
  const onMove = (event) => {
    pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
    pointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
    wake();
  };
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; if (onScreen) wake(); }) : null;
  observer?.observe(target);
  window.addEventListener('pointermove', onMove, { passive: true });
  return () => { cancelAnimationFrame(rafId); observer?.disconnect(); window.removeEventListener('pointermove', onMove); };
}

/** Floating translucent slime bubbles: one pre-rendered sprite blitted per bubble, dt-based motion,
 *  paused while the hero is off-screen or the tab is hidden. */
function startBubbles(canvas, hero) {
  if (prefersReducedMotion()) return () => {};
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return () => {};
  const lowPower = (navigator.hardwareConcurrency || 4) <= 4 || isMobileViewport();
  const dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 1.5);
  let width = 0;
  let height = 0;
  let rafId = 0;
  let last = 0;
  let visible = true;
  const bubbles = [];
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim() || '94, 168, 255';

  // Pre-render a single high-quality bubble sprite (radial gradient) once.
  const SPRITE = 64;
  const sprite = document.createElement('canvas');
  sprite.width = SPRITE; sprite.height = SPRITE;
  const sctx = sprite.getContext('2d');
  const c = SPRITE / 2;
  const gradient = sctx.createRadialGradient(c * 0.65, c * 0.65, c * 0.1, c, c, c);
  gradient.addColorStop(0, 'rgba(235, 245, 255, 1)');
  gradient.addColorStop(0.6, `rgba(${accent}, 0.5)`);
  gradient.addColorStop(1, `rgba(${accent}, 0)`);
  sctx.fillStyle = gradient;
  sctx.beginPath(); sctx.arc(c, c, c, 0, Math.PI * 2); sctx.fill();

  const resize = () => {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const spawn = (initial = false) => ({
    x: Math.random() * width,
    y: initial ? Math.random() * height : height + 20,
    r: 2 + Math.random() * 7,
    speed: 9 + Math.random() * 27, // px per second
    drift: Math.random() * Math.PI * 2,
    alpha: 0.15 + Math.random() * 0.35,
  });

  resize();
  const count = width < 768 ? 10 : lowPower ? 16 : 24;
  for (let i = 0; i < count; i += 1) bubbles.push(spawn(true));

  const draw = (now) => {
    rafId = 0;
    if (!visible || document.hidden) { last = 0; return; }
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    ctx.clearRect(0, 0, width, height);
    for (const bubble of bubbles) {
      bubble.y -= bubble.speed * dt;
      bubble.drift += 0.6 * dt;
      bubble.x += Math.sin(bubble.drift) * 15 * dt;
      if (bubble.y < -20) Object.assign(bubble, spawn());
      const size = bubble.r * 2;
      ctx.globalAlpha = bubble.alpha;
      ctx.drawImage(sprite, Math.round(bubble.x - bubble.r), Math.round(bubble.y - bubble.r), size, size);
    }
    ctx.globalAlpha = 1;
    rafId = requestAnimationFrame(draw);
  };
  const wake = () => { if (visible && !document.hidden && !rafId) rafId = requestAnimationFrame(draw); };
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; wake(); });
  observer.observe(hero);
  let resizeFrame = 0;
  const onResize = () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(resize); };
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', wake);
  rafId = requestAnimationFrame(draw);
  return () => {
    cancelAnimationFrame(rafId); cancelAnimationFrame(resizeFrame); observer.disconnect();
    window.removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', wake);
  };
}
