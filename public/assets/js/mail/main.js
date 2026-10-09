/** TensuraLabs Mail — public temporary-mail app (served on the mail subdomain). */
import { html, qs, qsa, render } from '../core/dom.js';
import { mountAccessForm, showAccessKey } from './access.js';
import { mailApi } from './api.js';
import { openCompose } from './compose.js';
import { icons } from './icons.js';
import { fmtCountdown, fmtListDate, getLang, setLang, t } from './i18n.js';
import { bindFrame, readerEmpty, readerLoading, readerTemplate } from './reader.js';
import { confirmDialog, copyText, errorText, modal, toast } from './ui.js';

const ACTIVE_KEY = 'tl-mail-active';
const POLL_MS = 10_000;
const SESSION_REFRESH_MS = 60_000;
const FOLDERS = ['inbox', 'sent', 'starred'];
const PAGE_SIZE = 30;

const app = document.getElementById('mail-app');
const state = {
  config: null,
  mailboxes: [],
  max: 10,
  activeId: null,
  folder: 'inbox',
  q: '',
  page: 1,
  list: null,
  listError: null,
  listLoading: false,
  selected: new Set(),
  openId: null,
  message: null,
  messageError: null,
  images: false,
  view: 'html',
  navOpen: false,
  latestId: null,
  offline: false,
  pushed: false,
};
let listRequest = 0;
let messageRequest = 0;
let pollTimer = null;
let sessionTimer = null;
let countdownTimer = null;
let unbindFrame = () => {};
let searchTimer = null;

const active = () => state.mailboxes.find((box) => box.id === state.activeId) ?? null;
const usable = (box) => box && box.isActive && !box.expired;
const storeActive = (id) => { try { localStorage.setItem(ACTIVE_KEY, String(id ?? '')); } catch { /* ignore */ } };
const readActive = () => { try { return Number(localStorage.getItem(ACTIVE_KEY)) || null; } catch { return null; } };

/* Routing: #/<folder>[/<messageId>] -------------------------------------- */
function parseHash() {
  const [, folder, id] = location.hash.match(/^#\/(inbox|sent|starred)(?:\/(\d+))?$/) ?? [];
  return { folder: folder ?? 'inbox', id: id ? Number(id) : null };
}
function go(folder, id = null, { replace = false } = {}) {
  const hash = `#/${folder}${id ? `/${id}` : ''}`;
  if (location.hash === hash) { onRoute(); return; }
  if (replace) { history.replaceState(null, '', hash); onRoute(); } else location.hash = hash;
}

function onRoute() {
  if (!active()) return;
  const { folder, id } = parseHash();
  const folderChanged = folder !== state.folder;
  if (folderChanged) {
    state.folder = folder;
    state.page = 1;
    state.selected.clear();
    paintSide();
    loadList();
  }
  if (id !== state.openId) {
    state.pushed = Boolean(id && !state.openId);
    openMessage(id);
  }
  document.querySelector('.mx-shell')?.classList.toggle('is-reading', Boolean(id));
}

/* Boot -------------------------------------------------------------------- */
async function boot() {
  try {
    const [config, session] = await Promise.all([mailApi.config(), mailApi.session()]);
    state.config = config;
    applySession(session);
    paintApp();
  } catch (error) {
    render(app, html`<div class="mx-boot mx-boot--error">${icons.alert}<p>${errorText(error)}</p>
      <button type="button" class="mx-btn mx-btn--primary" data-action="reload">${t('common.retry')}</button></div>`);
  }
}

function applySession(session) {
  state.mailboxes = session.mailboxes;
  state.max = session.max;
  if (!state.mailboxes.some((box) => box.id === state.activeId)) {
    const stored = readActive();
    state.activeId = (state.mailboxes.find((box) => box.id === stored) ?? state.mailboxes[0])?.id ?? null;
  }
}

function paintApp() {
  unbindFrame();
  if (!active()) { stopPolling(); paintLanding(); return; }
  paintShell();
  const { folder, id } = parseHash();
  state.folder = folder;
  state.openId = null;
  state.page = 1;
  state.latestId = null;
  state.selected.clear();
  paintSide();
  paintTop();
  loadList();
  if (id) openMessage(id); else paintReader();
  qs('.mx-shell', app).classList.toggle('is-reading', Boolean(id));
  startPolling();
}

/* Landing ----------------------------------------------------------------- */
function langButton() {
  return html`<button type="button" class="mx-chip-btn" data-action="lang" title="${t('lang.label')}">${icons.globe}<span>${getLang() === 'id' ? 'EN' : 'ID'}</span></button>`;
}
function brand() {
  return html`<a class="mx-brand" href="/" aria-label="${t('app.name')}"><span class="mx-brand__mark">${icons.logo}</span><span class="mx-brand__word">TENSURA<b>LABS</b></span><span class="mx-brand__tag">MAIL</span></a>`;
}
function announcement() {
  const text = state.config?.announcement?.[getLang()] || state.config?.announcement?.id;
  return text ? html`<div class="mx-announce">${icons.info}<span>${text}</span></div>` : '';
}

function paintLanding() {
  const config = state.config;
  render(app, html`
    <div class="mx-landing">
      <header class="mx-landing__top">
        ${brand()}
        <div class="mx-landing__tools">
          ${langButton()}
          ${config.siteUrl ? html`<a class="mx-chip-btn" href="${config.siteUrl}">${icons.external}<span>${t('app.backToSite')}</span></a>` : ''}
        </div>
      </header>
      ${announcement()}
      <main class="mx-hero">
        <section class="mx-hero__copy">
          <span class="mx-kicker">${icons.mail}${t('hero.kicker')}</span>
          <h1>${t('hero.title')}</h1>
          <p class="mx-hero__lead">${t('hero.text')}</p>
        </section>
        <section class="mx-card mx-hero__card" data-access></section>
        <section class="mx-hero__more">
          <ul class="mx-features">
            <li><span>${icons.bolt}</span><div><b>${t('hero.f1.title')}</b><p>${t('hero.f1.text')}</p></div></li>
            <li><span>${icons.shield}</span><div><b>${t('hero.f2.title')}</b><p>${t('hero.f2.text')}</p></div></li>
            <li><span>${icons.clock}</span><div><b>${t('hero.f3.title')}</b><p>${t('hero.f3.text')}</p></div></li>
          </ul>
        </section>
      </main>
      <footer class="mx-foot"><span>${t('footer.privacy')}</span><span>© ${new Date().getFullYear()} TensuraLabs · ${t('footer.powered')}</span></footer>
    </div>`);
  mountAccessForm(qs('[data-access]', app), { config, onSuccess: onAccessGranted });
  document.title = t('app.name');
}

async function onAccessGranted(mailbox, accessKey) {
  if (accessKey) await showAccessKey(mailbox.address, accessKey);
  toast(accessKey ? t('toast.created', { address: mailbox.address }) : t('toast.loggedIn', { address: mailbox.address }));
  const session = await mailApi.session();
  applySession(session);
  state.activeId = mailbox.id;
  storeActive(mailbox.id);
  history.replaceState(null, '', '#/inbox');
  paintApp();
}

function openAccessDialog(tab = 'create') {
  const dialog = modal({ title: t('nav.add'), size: 'sm', content: html`<div data-access></div>` });
  mountAccessForm(qs('[data-access]', dialog.root), {
    config: state.config, tab,
    onSuccess: async (mailbox, accessKey) => { dialog.close(true); await onAccessGranted(mailbox, accessKey); },
  });
}

/* Shell ------------------------------------------------------------------- */
function paintShell() {
  render(app, html`
    <div class="mx-layout">
      <header class="mx-top">
        <button type="button" class="mx-icon-btn mx-top__menu" data-action="nav" aria-label="${t('nav.open')}">${icons.menu}</button>
        ${brand()}
        <div class="mx-top__address" data-slot="address"></div>
        <div class="mx-top__tools">${langButton()}</div>
      </header>
      ${announcement()}
      <div class="mx-shell">
        <aside class="mx-side" data-slot="side" aria-label="Navigasi"></aside>
        <section class="mx-list" data-slot="list" aria-label="${t('nav.inbox')}"></section>
        <section class="mx-read" data-slot="read" aria-live="polite"></section>
      </div>
      <button type="button" class="mx-fab" data-action="compose" aria-label="${t('nav.compose')}" hidden>${icons.pen}</button>
      <div class="mx-scrim" data-action="nav-close"></div>
    </div>`);
}

function paintTop() {
  const box = active();
  const slot = qs('[data-slot="address"]', app);
  if (!slot || !box) return;
  render(slot, html`
    <button type="button" class="mx-address" data-action="copy-address" title="${t('box.copy')}">
      <span class="mx-address__text">${box.address}</span><span class="mx-address__icon">${icons.copy}</span>
    </button>
    <span class="mx-expiry ${box.expired ? 'is-expired' : ''}" data-countdown>${expiryLabel(box)}</span>`);
  const fab = qs('.mx-fab', app);
  if (fab) fab.hidden = !(box.canSend && usable(box));
  const unread = state.mailboxes.reduce((sum, item) => sum + item.unreadCount, 0);
  document.title = `${unread ? `(${unread}) ` : ''}${box.address} · ${t('app.name')}`;
}

function expiryLabel(box) {
  if (!box.isActive) return t('box.inactive');
  if (box.expired) return t('box.expired');
  if (!box.expiresAt) return box.source === 'admin' ? t('box.team') : t('box.noExpiry');
  const left = fmtCountdown(box.expiresAt);
  return left ? t('box.expiresIn', { time: left }) : t('box.expired');
}

function paintSide() {
  const box = active();
  const slot = qs('[data-slot="side"]', app);
  if (!slot || !box) return;
  const showSent = box.canSend || box.sentCount > 0;
  const folders = FOLDERS.filter((folder) => folder !== 'sent' || showSent);
  render(slot, html`
    <div class="mx-side__scroll">
      ${box.canSend && usable(box) ? html`<button type="button" class="mx-btn mx-btn--primary mx-btn--block mx-side__compose" data-action="compose">${icons.pen}<span>${t('nav.compose')}</span></button>` : ''}
      <nav class="mx-folders">
        ${folders.map((folder) => html`
          <a href="#/${folder}" class="mx-folder ${state.folder === folder ? 'is-active' : ''}" ${state.folder === folder ? html`aria-current="page"` : ''}>
            ${folder === 'inbox' ? icons.inbox : folder === 'sent' ? icons.send : icons.star}<span>${t(`nav.${folder}`)}</span>
            ${folder === 'inbox' && box.unreadCount ? html`<b class="mx-count">${box.unreadCount > 99 ? '99+' : box.unreadCount}</b>` : ''}
          </a>`)}
      </nav>

      <div class="mx-side__section">
        <h3>${t('nav.mailboxes')} <small>${state.mailboxes.length}/${state.max}</small></h3>
        <ul class="mx-boxes">
          ${state.mailboxes.map((item) => html`
            <li><button type="button" class="mx-box ${item.id === box.id ? 'is-active' : ''} ${usable(item) ? '' : 'is-dim'}" data-action="switch" data-id="${item.id}" title="${item.address}">
              <span class="mx-box__dot ${item.unreadCount ? 'has-unread' : ''}" aria-hidden="true"></span>
              <span class="mx-box__text"><span>${item.address}</span><small>${expiryLabel(item)}</small></span>
              ${item.unreadCount ? html`<b class="mx-count">${item.unreadCount > 99 ? '99+' : item.unreadCount}</b>` : ''}
            </button></li>`)}
        </ul>
        ${state.mailboxes.length < state.max ? html`<button type="button" class="mx-btn mx-btn--ghost mx-btn--block mx-btn--sm" data-action="add">${icons.plus}<span>${t('nav.add')}</span></button>` : ''}
      </div>

      <div class="mx-side__section mx-side__actions">
        <button type="button" class="mx-menu-item" data-action="copy-address">${icons.copy}<span>${t('box.copy')}</span></button>
        ${usable(box) ? html`<button type="button" class="mx-menu-item" data-action="rotate">${icons.key}<span>${t('box.rotate')}</span></button>` : ''}
        <button type="button" class="mx-menu-item" data-action="forget">${icons.logout}<span>${t('box.forget')}</span></button>
        ${box.canDelete ? html`<button type="button" class="mx-menu-item mx-menu-item--danger" data-action="delete-box">${icons.trash}<span>${t('box.delete')}</span></button>` : ''}
        ${state.mailboxes.length > 1 ? html`<button type="button" class="mx-menu-item" data-action="signout">${icons.logout}<span>${t('nav.signOutAll')}</span></button>` : ''}
      </div>

      <div class="mx-side__foot">
        ${state.config.siteUrl ? html`<a href="${state.config.siteUrl}">${icons.external}<span>${t('app.backToSite')}</span></a>` : ''}
        <p>${t('footer.privacy')}</p>
      </div>
    </div>`);
}

/* Message list ------------------------------------------------------------ */
async function loadList({ silent = false } = {}) {
  const box = active();
  if (!box) return;
  const ticket = ++listRequest;
  state.listLoading = true;
  if (!silent) paintList();
  try {
    const data = await mailApi.messages(box.id, { folder: state.folder, q: state.q, page: state.page, pageSize: PAGE_SIZE });
    if (ticket !== listRequest) return;
    state.list = data;
    state.listError = null;
    if (state.latestId !== null && data.items.length) state.latestId = Math.max(state.latestId, ...data.items.filter((item) => item.direction === 'in').map((item) => item.id), 0);
    const visible = new Set(data.items.map((item) => item.id));
    for (const id of state.selected) if (!visible.has(id)) state.selected.delete(id);
  } catch (error) {
    if (ticket !== listRequest) return;
    state.listError = error;
    if (error.status === 404) { refreshSession(); return; }
  } finally {
    if (ticket === listRequest) { state.listLoading = false; paintList(); }
  }
}

function emptyState(box) {
  if (state.q) return html`<div class="mx-empty">${icons.search}<h3>${t('list.emptySearch', { q: state.q })}</h3></div>`;
  if (state.folder === 'sent') return html`<div class="mx-empty">${icons.send}<h3>${t('list.emptySent')}</h3></div>`;
  if (state.folder === 'starred') return html`<div class="mx-empty">${icons.star}<h3>${t('list.emptyStarred')}</h3></div>`;
  return html`<div class="mx-empty mx-empty--inbox">
    <span class="mx-radar" aria-hidden="true"><span></span><span></span>${icons.inbox}</span>
    <h3>${t('list.emptyInbox')}</h3>
    <p>${t('list.emptyInboxText', { address: box.address })}</p>
    <button type="button" class="mx-btn mx-btn--ghost mx-btn--sm" data-action="copy-address">${icons.copy}<span>${box.address}</span></button>
    <small class="mx-pulse-text">${t('list.waiting')}</small>
  </div>`;
}

function row(item, box) {
  const outgoing = item.direction === 'out';
  const who = outgoing ? t('list.to', { to: item.toList.map((entry) => entry.address).join(', ') }) : (item.fromName || item.fromAddress || t('common.unknownSender'));
  const selected = state.selected.has(item.id);
  return html`
    <li class="mx-row ${item.isRead || outgoing ? '' : 'is-unread'} ${state.openId === item.id ? 'is-open' : ''} ${selected ? 'is-selected' : ''}">
      <label class="mx-check" title="${t('list.selectAll')}"><input type="checkbox" data-select="${item.id}" ${selected ? 'checked' : ''} aria-label="${item.subject || t('list.noSubject')}"><span></span></label>
      <button type="button" class="mx-star ${item.isStarred ? 'is-on' : ''}" data-action="star" data-id="${item.id}" aria-pressed="${item.isStarred}" aria-label="${t('read.star')}">${item.isStarred ? icons.starFill : icons.star}</button>
      <a class="mx-row__link" href="#/${state.folder}/${item.id}">
        <span class="mx-row__who">${who}</span>
        <span class="mx-row__date">${item.attachmentCount ? html`<span class="mx-row__clip">${icons.clip}</span>` : ''}${fmtListDate(item.createdAt)}</span>
        <span class="mx-row__subject">${item.subject || t('list.noSubject')}</span>
        <span class="mx-row__snippet">${item.snippet}</span>
      </a>
    </li>`;
}

function paintList() {
  const box = active();
  const slot = qs('[data-slot="list"]', app);
  if (!slot || !box) return;
  const searchFocused = document.activeElement?.matches?.('[data-search]');
  const caret = searchFocused ? document.activeElement.selectionStart : null;
  const items = state.list?.items ?? [];
  const pagination = state.list?.pagination;
  const allSelected = items.length > 0 && items.every((item) => state.selected.has(item.id));
  const selection = state.selected.size;
  const blocked = !usable(box);
  const previousScroll = qs('.mx-list__body', slot)?.scrollTop ?? 0;

  render(slot, html`
    <div class="mx-list__head">
      <h1 class="mx-list__title">${t(`nav.${state.folder}`)}${state.list ? html` <small>${pagination.total}</small>` : ''}</h1>
      <div class="mx-searchbox">
        ${icons.search}
        <input type="search" class="mx-search" data-search value="${state.q}" placeholder="${t('list.search')}" aria-label="${t('list.search')}" ${blocked ? 'disabled' : ''}>
      </div>
    </div>
    <div class="mx-toolbar ${selection ? 'has-selection' : ''}">
      <label class="mx-check" title="${t('list.selectAll')}"><input type="checkbox" data-select-all ${allSelected ? 'checked' : ''} ${items.length ? '' : 'disabled'} aria-label="${t('list.selectAll')}"><span></span></label>
      ${selection ? html`
        <span class="mx-toolbar__count">${t('list.selected', { count: selection })}</span>
        <button type="button" class="mx-icon-btn" data-bulk="read" title="${t('list.markRead')}" aria-label="${t('list.markRead')}">${icons.mailOpen}</button>
        <button type="button" class="mx-icon-btn" data-bulk="unread" title="${t('list.markUnread')}" aria-label="${t('list.markUnread')}">${icons.mail}</button>
        <button type="button" class="mx-icon-btn" data-bulk="star" title="${t('list.star')}" aria-label="${t('list.star')}">${icons.star}</button>
        <button type="button" class="mx-icon-btn mx-icon-btn--danger" data-bulk="delete" title="${t('list.delete')}" aria-label="${t('list.delete')}">${icons.trash}</button>`
      : html`
        <button type="button" class="mx-icon-btn ${state.listLoading ? 'is-spinning' : ''}" data-action="refresh" title="${t('list.refresh')}" aria-label="${t('list.refresh')}" ${blocked ? 'disabled' : ''}>${icons.refresh}</button>
        ${state.folder === 'inbox' && box.unreadCount ? html`<button type="button" class="mx-icon-btn" data-action="read-all" title="${t('list.readAll')}" aria-label="${t('list.readAll')}">${icons.checkAll}</button>` : ''}
        <span class="mx-toolbar__spacer"></span>
        ${pagination && pagination.totalPages > 1 ? html`
          <span class="mx-toolbar__page">${t('list.page', { page: pagination.page, pages: pagination.totalPages })}</span>
          <button type="button" class="mx-icon-btn" data-page="${pagination.page - 1}" ${pagination.page <= 1 ? 'disabled' : ''} aria-label="${t('list.prev')}">${icons.left}</button>
          <button type="button" class="mx-icon-btn" data-page="${pagination.page + 1}" ${pagination.page >= pagination.totalPages ? 'disabled' : ''} aria-label="${t('list.next')}">${icons.right}</button>` : ''}`}
    </div>
    ${blocked ? html`<div class="mx-alert mx-alert--warn">${icons.alert}<span>${box.isActive ? t('box.expiredBanner') : t('box.inactiveBanner')}</span></div>` : ''}
    <div class="mx-list__body">
      ${blocked ? '' : state.listError && !state.list ? html`<div class="mx-empty">${icons.alert}<h3>${errorText(state.listError)}</h3>
          <button type="button" class="mx-btn mx-btn--ghost mx-btn--sm" data-action="refresh">${t('common.retry')}</button></div>`
        : !state.list ? html`<ul class="mx-rows">${Array.from({ length: 6 }, () => html`<li class="mx-row mx-row--skel"><span class="mx-skel mx-skel--line"></span><span class="mx-skel mx-skel--line mx-skel--short"></span></li>`)}</ul>`
        : items.length ? html`<ul class="mx-rows">${items.map((item) => row(item, box))}</ul>` : emptyState(box)}
    </div>`);

  const body = qs('.mx-list__body', slot);
  if (body && previousScroll) body.scrollTop = previousScroll;
  if (searchFocused) {
    const input = qs('[data-search]', slot);
    input.focus();
    if (caret !== null) input.setSelectionRange(caret, caret);
  }
}

/* Reader ------------------------------------------------------------------ */
async function openMessage(id) {
  const box = active();
  unbindFrame();
  state.openId = id;
  state.message = null;
  state.messageError = null;
  state.images = false;
  state.view = 'html';
  qsa('.mx-row.is-open', app).forEach((node) => node.classList.remove('is-open'));
  if (!id || !box) { paintReader(); return; }
  qs(`[href="#/${state.folder}/${id}"]`, app)?.closest('.mx-row')?.classList.add('is-open');
  const ticket = ++messageRequest;
  paintReader();
  try {
    const message = await mailApi.message(box.id, id);
    if (ticket !== messageRequest) return;
    state.message = message;
    const listed = state.list?.items.find((item) => item.id === id);
    if (listed && !listed.isRead && message.direction === 'in') {
      listed.isRead = true;
      box.unreadCount = Math.max(0, box.unreadCount - 1);
      paintList(); paintSide(); paintTop();
    }
  } catch (error) {
    if (ticket !== messageRequest) return;
    state.messageError = error;
  }
  paintReader();
}

function paintReader() {
  const slot = qs('[data-slot="read"]', app);
  const box = active();
  if (!slot || !box) return;
  unbindFrame();
  if (!state.openId) render(slot, readerEmpty());
  else if (state.messageError) {
    render(slot, html`<div class="mx-read__inner"><div class="mx-read__bar"><button type="button" class="mx-icon-btn mx-read__back" data-action="close-message" aria-label="${t('read.back')}">${icons.back}</button></div>
      <div class="mx-empty">${icons.alert}<h3>${errorText(state.messageError)}</h3></div></div>`);
  } else if (!state.message) render(slot, readerLoading());
  else {
    render(slot, readerTemplate({ mailbox: box, message: state.message, view: state.view, images: state.images }));
    unbindFrame = bindFrame(qs('.mx-frame', slot));
  }
  if (window.matchMedia('(max-width: 979px)').matches && state.openId) slot.scrollTop = 0;
}

function closeMessage() {
  // Opening a message from the list pushed a history entry: going back keeps the phone back button natural.
  if (state.pushed && parseHash().id) { state.pushed = false; history.back(); } else go(state.folder, null, { replace: true });
}

/* Polling ----------------------------------------------------------------- */
function startPolling() {
  stopPolling();
  pollTimer = setInterval(poll, POLL_MS);
  sessionTimer = setInterval(refreshSession, SESSION_REFRESH_MS);
  poll();
  countdownTimer = setInterval(() => {
    const box = active();
    if (!box) return;
    if (box.expiresAt && !box.expired && new Date(box.expiresAt) <= new Date()) { box.expired = true; paintSide(); paintList(); }
    const label = qs('[data-countdown]', app);
    if (label) { label.textContent = expiryLabel(box); label.classList.toggle('is-expired', box.expired); }
  }, 30_000);
}
function stopPolling() {
  clearInterval(pollTimer); clearInterval(sessionTimer); clearInterval(countdownTimer);
  pollTimer = sessionTimer = countdownTimer = null;
}

async function poll() {
  const box = active();
  if (!box || document.hidden) return;
  try {
    const result = await mailApi.poll(box.id);
    if (state.offline) { state.offline = false; toast(t('toast.back'), 'ok', { timeout: 1800 }); }
    if (active()?.id !== box.id) return;
    const known = state.latestId;
    const before = `${box.unreadCount}:${box.expired}:${box.isActive}`;
    Object.assign(box, result.mailbox);
    const changed = before !== `${box.unreadCount}:${box.expired}:${box.isActive}`;
    if (known === null) state.latestId = result.latestId;
    else if (result.latestId > known) {
      state.latestId = result.latestId;
      if (state.page === 1) await loadList({ silent: true });
      notifyNew(box);
    }
    if (changed) {
      paintTop(); paintSide();
      if (!state.selected.size) paintList();
    }
  } catch (error) {
    if (error.status === 404) refreshSession();
    else if (error.status === 0 && !state.offline) { state.offline = true; toast(t('toast.offline'), 'danger'); }
  }
}

function notifyNew(box) {
  const newest = state.list?.items?.find((item) => item.direction === 'in');
  toast(newest && box.unreadCount <= 1 ? t('toast.newMail', { from: newest.fromName || newest.fromAddress }) : t('toast.newMailMany', { count: box.unreadCount || 1 }), 'info');
}

async function refreshSession() {
  try {
    const session = await mailApi.session();
    const before = state.activeId;
    applySession(session);
    if (state.activeId !== before || !active()) { paintApp(); return; }
    paintSide(); paintTop();
  } catch { /* transient */ }
}

/* Actions ----------------------------------------------------------------- */
async function switchMailbox(id) {
  if (id === state.activeId) { setNav(false); return; }
  state.activeId = id;
  storeActive(id);
  state.list = null;
  state.q = '';
  state.latestId = null;
  setNav(false);
  history.replaceState(null, '', '#/inbox');
  paintApp();
}

function setNav(open) {
  state.navOpen = open;
  qs('.mx-layout', app)?.classList.toggle('is-nav-open', open);
}

async function bulk(action) {
  const box = active();
  const ids = [...state.selected];
  if (!ids.length) return;
  if (action === 'delete' && !(await confirmDialog({ title: t('confirm.deleteMany', { count: ids.length }), text: t('confirm.deleteMsgText'), confirmLabel: t('list.delete'), danger: true }))) return;
  try {
    await mailApi.bulk(box.id, { action, ids });
    state.selected.clear();
    if (action === 'delete' && ids.includes(state.openId)) go(state.folder, null, { replace: true });
    await refreshCounts();
    await loadList({ silent: true });
    toast(action === 'delete' ? t('toast.deleted') : t('toast.updated'), 'ok', { timeout: 1800 });
  } catch (error) { toast(errorText(error), 'danger'); }
}

async function refreshCounts() {
  const box = active();
  try { Object.assign(box, (await mailApi.poll(box.id)).mailbox); paintSide(); paintTop(); } catch { /* ignore */ }
}

async function toggleStar(id) {
  const box = active();
  const item = state.list?.items.find((entry) => entry.id === id) ?? (state.message?.id === id ? state.message : null);
  if (!item) return;
  const next = !item.isStarred;
  try {
    await mailApi.update(box.id, id, { isStarred: next });
    item.isStarred = next;
    if (state.message?.id === id) state.message.isStarred = next;
    const listed = state.list?.items.find((entry) => entry.id === id);
    if (listed) listed.isStarred = next;
    if (state.folder === 'starred' && !next) await loadList({ silent: true }); else paintList();
    if (state.message?.id === id) paintReader();
  } catch (error) { toast(errorText(error), 'danger'); }
}

async function markOpenUnread() {
  const box = active();
  const message = state.message;
  if (!message) return;
  try {
    await mailApi.update(box.id, message.id, { isRead: false });
    const listed = state.list?.items.find((entry) => entry.id === message.id);
    if (listed) listed.isRead = false;
    box.unreadCount += 1;
    closeMessage();
    paintList(); paintSide(); paintTop();
  } catch (error) { toast(errorText(error), 'danger'); }
}

async function deleteOpen() {
  const box = active();
  const message = state.message;
  if (!message || !(await confirmDialog({ title: t('confirm.deleteMsg'), text: t('confirm.deleteMsgText'), confirmLabel: t('read.delete'), danger: true }))) return;
  try {
    await mailApi.removeMessage(box.id, message.id);
    toast(t('toast.deleted'), 'ok', { timeout: 1800 });
    go(state.folder, null, { replace: true });
    await refreshCounts();
    await loadList({ silent: true });
  } catch (error) { toast(errorText(error), 'danger'); }
}

async function copyAddress() {
  const box = active();
  toast((await copyText(box.address)) ? t('box.copied') : t('toast.copyFail'), 'ok', { timeout: 1800 });
}

async function rotateKey() {
  const box = active();
  setNav(false);
  if (!(await confirmDialog({ title: t('confirm.rotate'), text: t('confirm.rotateText', { address: box.address }), confirmLabel: t('confirm.rotateOk'), danger: true }))) return;
  try {
    const { accessKey, signedOut } = await mailApi.rotateKey(box.id);
    await showAccessKey(box.address, accessKey, { rotated: true, signedOut });
  } catch (error) { toast(errorText(error), 'danger'); }
}

async function forgetBox() {
  const box = active();
  setNav(false);
  if (!(await confirmDialog({ title: t('confirm.forget'), text: t('confirm.forgetText', { address: box.address }), confirmLabel: t('confirm.forgetOk'), danger: true }))) return;
  try {
    await mailApi.forget(box.id);
    toast(t('toast.forgotten'));
    await afterRemoval();
  } catch (error) { toast(errorText(error), 'danger'); }
}

async function deleteBox() {
  const box = active();
  setNav(false);
  if (!(await confirmDialog({ title: t('confirm.delete'), text: t('confirm.deleteText', { address: box.address }), confirmLabel: t('confirm.deleteOk'), danger: true }))) return;
  try {
    await mailApi.remove(box.id);
    toast(t('toast.removed'));
    await afterRemoval();
  } catch (error) { toast(errorText(error), 'danger'); }
}

async function signOutAll() {
  setNav(false);
  if (!(await confirmDialog({ title: t('confirm.signOut'), text: t('confirm.signOutText'), confirmLabel: t('confirm.signOutOk'), danger: true }))) return;
  try {
    await mailApi.logout();
    toast(t('toast.signedOut'));
    await afterRemoval();
  } catch (error) { toast(errorText(error), 'danger'); }
}

async function afterRemoval() {
  state.activeId = null;
  state.list = null;
  state.latestId = null;
  history.replaceState(null, '', location.pathname);
  applySession(await mailApi.session());
  storeActive(state.activeId);
  paintApp();
}

function compose(mode = 'new') {
  const box = active();
  if (!box?.canSend) return;
  setNav(false);
  openCompose({
    mailbox: box, config: state.config, mode, message: mode === 'new' ? null : state.message,
    onSent: async () => {
      box.sentCount += 1;
      paintSide();
      if (state.folder === 'sent') await loadList({ silent: true });
    },
  });
}

/* Events ------------------------------------------------------------------ */
app.addEventListener('click', async (event) => {
  const target = event.target;
  const pageButton = target.closest('[data-page]');
  if (pageButton) { state.page = Number(pageButton.dataset.page); state.selected.clear(); loadList(); qs('.mx-list__body', app)?.scrollTo({ top: 0 }); return; }
  const bulkButton = target.closest('[data-bulk]');
  if (bulkButton) { bulk(bulkButton.dataset.bulk); return; }
  if (target.closest('.mx-folder')) setNav(false);

  const actionNode = target.closest('[data-action]');
  if (!actionNode) return;
  const { action } = actionNode.dataset;
  switch (action) {
    case 'reload': location.reload(); break;
    case 'lang': setLang(getLang() === 'id' ? 'en' : 'id'); active() ? paintApp() : paintLanding(); break;
    case 'nav': setNav(!state.navOpen); break;
    case 'nav-close': setNav(false); break;
    case 'switch': switchMailbox(Number(actionNode.dataset.id)); break;
    case 'add': setNav(false); openAccessDialog(); break;
    case 'copy-address': copyAddress(); break;
    case 'rotate': rotateKey(); break;
    case 'forget': forgetBox(); break;
    case 'delete-box': deleteBox(); break;
    case 'signout': signOutAll(); break;
    case 'refresh': refreshCounts(); loadList(); break;
    case 'read-all': {
      try { await mailApi.readAll(active().id); await refreshCounts(); await loadList({ silent: true }); } catch (error) { toast(errorText(error), 'danger'); }
      break;
    }
    case 'star': event.preventDefault(); toggleStar(Number(actionNode.dataset.id)); break;
    case 'star-open': toggleStar(state.message?.id); break;
    case 'unread-open': markOpenUnread(); break;
    case 'delete-open': deleteOpen(); break;
    case 'close-message': closeMessage(); break;
    case 'compose': compose('new'); break;
    case 'reply': compose('reply'); break;
    case 'forward': compose('forward'); break;
    case 'images': state.images = !state.images; paintReader(); break;
    case 'view': state.view = actionNode.dataset.view; paintReader(); break;
    case 'copy-code': {
      const { code } = actionNode.dataset;
      toast((await copyText(code)) ? t('read.codeCopied', { code }) : t('toast.copyFail'), 'ok', { timeout: 2000 });
      break;
    }
    default: break;
  }
});

app.addEventListener('change', (event) => {
  const input = event.target;
  if (input.matches('[data-select-all]')) {
    const items = state.list?.items ?? [];
    if (input.checked) items.forEach((item) => state.selected.add(item.id)); else state.selected.clear();
    paintList();
  } else if (input.matches('[data-select]')) {
    const id = Number(input.dataset.select);
    if (input.checked) state.selected.add(id); else state.selected.delete(id);
    paintList();
  }
});

app.addEventListener('input', (event) => {
  if (!event.target.matches('[data-search]')) return;
  clearTimeout(searchTimer);
  const value = event.target.value;
  searchTimer = setTimeout(() => { state.q = value.trim(); state.page = 1; state.selected.clear(); loadList({ silent: true }); }, 300);
});

window.addEventListener('hashchange', onRoute);
document.addEventListener('visibilitychange', () => { if (!document.hidden && active()) poll(); });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.navOpen) setNav(false);
  if (event.target.matches?.('input, textarea, select') || document.documentElement.classList.contains('has-modal')) return;
  if (event.key === '/' && active()) { event.preventDefault(); qs('[data-search]', app)?.focus(); }
  if (event.key === 'c' && active()?.canSend && usable(active())) { event.preventDefault(); compose('new'); }
});

boot();
