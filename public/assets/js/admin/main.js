/**
 * TensuraLabs Console — admin SPA shell (vanilla ES modules, CSP-compliant).
 * Hash router (#/view/param?query), role-aware navigation, command palette, light/dark theme.
 */
import { api } from './api.js';
import { ic } from './icons.js';
import { avatar, debounce, errorMessage, fmtRelative, html, overlay, qs, qsa, render, ROLE_LABEL, toast } from './ui.js';

const app = document.getElementById('admin');
const THEME_KEY = 'tl.admin.theme';

const NAV = [
  { group: 'Ringkasan', items: [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', roles: ['admin', 'editor'] },
    { id: 'tasks', label: 'Tugas & Follow-up', icon: 'todo', roles: ['admin', 'editor'], badge: 'tasks' },
  ] },
  { group: 'Penjualan', items: [
    { id: 'leads', label: 'Leads & CRM', icon: 'leads', roles: ['admin'], badge: 'leads' },
    { id: 'quotes', label: 'Penawaran', icon: 'quote', roles: ['admin'] },
    { id: 'mail', label: 'Mail', icon: 'mail', roles: ['admin'], badge: 'mail' },
  ] },
  { group: 'Konten', items: [
    { id: 'articles', label: 'Artikel', icon: 'articles', roles: ['admin', 'editor'] },
    { id: 'content/squad', label: 'Tim', icon: 'squad', roles: ['admin', 'editor'] },
    { id: 'content/portfolio', label: 'Portofolio', icon: 'portfolio', roles: ['admin', 'editor'] },
    { id: 'content/gazette', label: 'Kabar Guild', icon: 'gazette', roles: ['admin', 'editor'] },
    { id: 'media', label: 'Media', icon: 'image', roles: ['admin', 'editor'] },
  ] },
  { group: 'Tampilan', items: [
    { id: 'appearance/home', label: 'Halaman Beranda', icon: 'home', roles: ['admin'] },
    { id: 'appearance/site', label: 'Tema & Situs', icon: 'palette', roles: ['admin'] },
  ] },
  { group: 'Sistem', items: [
    { id: 'users', label: 'Pengguna', icon: 'users', roles: ['admin'] },
    { id: 'webhooks', label: 'Webhook & Integrasi', icon: 'webhook', roles: ['admin'] },
    { id: 'audit', label: 'Log Aktivitas', icon: 'audit', roles: ['admin'] },
    { id: 'system', label: 'Sistem', icon: 'server', roles: ['admin'] },
  ] },
];

const VIEWS = {
  dashboard: () => import('./views/dashboard.js'),
  leads: () => import('./views/leads.js'),
  tasks: () => import('./views/tasks.js'),
  quotes: () => import('./views/quotes.js'),
  webhooks: () => import('./views/webhooks.js'),
  mail: () => import('./views/mail.js'),
  articles: () => import('./views/articles.js'),
  content: () => import('./views/content.js'),
  appearance: () => import('./views/appearance.js'),
  media: () => import('./views/media.js'),
  users: () => import('./views/users.js'),
  audit: () => import('./views/audit.js'),
  system: () => import('./views/system.js'),
  profile: () => import('./views/profile.js'),
};
const ROLE_OF = { leads: ['admin'], mail: ['admin'], quotes: ['admin'], webhooks: ['admin'], appearance: ['admin'], users: ['admin'], audit: ['admin'], system: ['admin'] };
const BADGE_POLL_MS = 45000;

const state = { user: null, current: null, guard: null, lastHash: '', badges: {}, poll: 0, unread: 0 };

/* Theme ------------------------------------------------------------------ */
function initialTheme() {
  try { const saved = localStorage.getItem(THEME_KEY); if (saved) return saved; } catch { /* ignore */ }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  const button = qs('[data-theme-toggle]');
  if (button) render(button, theme === 'dark' ? ic.sun : ic.moon);
}
setTheme(initialTheme());

/* Routing ---------------------------------------------------------------- */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [pathPart, queryPart = ''] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  return { view: parts[0] ?? 'dashboard', params: parts.slice(1), query: new URLSearchParams(queryPart), path: pathPart };
}
export const navigate = (path) => { location.hash = `#/${path.replace(/^#?\/?/, '')}`; };
/** Updates the query string without remounting the view. */
export function setQuery(params) {
  const { path } = parseHash();
  const search = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null && v !== 'all')).toString();
  const hash = `#/${path}${search ? `?${search}` : ''}`;
  state.lastHash = hash;
  history.replaceState(null, '', hash);
}
const canSee = (roles) => !roles || roles.includes(state.user?.role);

async function route() {
  if (!state.user) return;
  if (state.guard?.() && !window.confirm('Ada perubahan yang belum disimpan. Tinggalkan halaman ini?')) {
    history.replaceState(null, '', state.lastHash || '#/dashboard');
    return;
  }
  state.guard = null;
  state.lastHash = location.hash;
  const { view, params, query, path } = parseHash();
  const main = qs('.main');
  if (!VIEWS[view] || !canSee(ROLE_OF[view])) { navigate('dashboard'); return; }
  closeSidebar();
  qsa('.nav__link').forEach((link) => {
    const id = link.dataset.nav;
    const active = path === id || path.startsWith(`${id}/`) || (id === view && !id.includes('/'));
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  try { state.current?.destroy?.(); } catch (error) { console.error(error); }
  state.current = null;
  document.documentElement.classList.remove('print-mode');
  closeNotifications();
  const host = document.createElement('div');
  host.className = 'view';
  main.replaceChildren(host);
  main.scrollTop = 0;
  render(host, html`<div class="skeleton skeleton--page"><i></i><i></i><i></i><i></i></div>`);
  try {
    const module = await VIEWS[view]();
    if (parseHash().path !== path) return; // navigated away while loading
    state.current = await module.mount({
      root: host, params, query, user: state.user, navigate, setQuery,
      setTitle: (title) => { document.title = `${title} · TensuraLabs Console`; qs('[data-page-title]').textContent = title; },
      guard: (fn) => { state.guard = fn; },
      refreshBadges,
      reload: () => { state.guard = null; route(); },
    }) ?? null;
  } catch (error) {
    console.error(error);
    render(host, html`<div class="alert alert--danger">${ic.alert}<span>Gagal memuat halaman: ${errorMessage(error)}</span></div>`);
  }
}

/* Shell ------------------------------------------------------------------ */
function shellTemplate() {
  const user = state.user;
  return html`
    <div class="shell">
      <aside class="sidebar" id="sidebar">
        <a class="brand" href="#/dashboard">${ic.logo}<span><b>TensuraLabs</b><small>Console</small></span></a>
        <button type="button" class="cmdk-trigger" data-cmdk>${ic.search}<span>Cari / perintah…</span><kbd>Ctrl K</kbd></button>
        <nav class="nav" aria-label="Navigasi admin">
          ${NAV.map((group) => {
            const items = group.items.filter((item) => canSee(item.roles));
            if (!items.length) return '';
            return html`<div class="nav__group"><p class="nav__title">${group.group}</p>
              ${items.map((item) => html`<a class="nav__link" href="#/${item.id}" data-nav="${item.id}">${ic[item.icon]}<span>${item.label}</span>${item.badge ? html`<em class="nav__badge" data-badge="${item.badge}" hidden></em>` : ''}</a>`)}
            </div>`;
          })}
        </nav>
        <div class="sidebar__foot">
          <a class="nav__link" href="/" target="_blank" rel="noopener">${ic.external}<span>Lihat situs</span></a>
        </div>
      </aside>
      <div class="sidebar-backdrop" data-close-sidebar></div>
      <div class="workspace">
        <header class="topbar">
          <button type="button" class="btn btn--icon btn--ghost topbar__menu" data-open-sidebar aria-label="Buka menu" aria-controls="sidebar">${ic.menu}</button>
          <h1 class="topbar__title" data-page-title>Dashboard</h1>
          <div class="topbar__actions">
            <button type="button" class="btn btn--icon btn--ghost" data-cmdk aria-label="Cari">${ic.search}</button>
            <div class="notif">
              <button type="button" class="btn btn--icon btn--ghost notif__btn" data-notif aria-label="Notifikasi" aria-haspopup="true" aria-expanded="false">${ic.bell}<em class="notif__count" data-notif-count hidden></em></button>
              <div class="notif__panel" data-notif-panel hidden role="dialog" aria-label="Notifikasi"></div>
            </div>
            <button type="button" class="btn btn--icon btn--ghost" data-theme-toggle aria-label="Ganti tema">${document.documentElement.dataset.theme === 'dark' ? ic.sun : ic.moon}</button>
            <div class="usermenu">
              <button type="button" class="usermenu__btn" data-usermenu aria-haspopup="true" aria-expanded="false">${avatar(user.name)}<span><b>${user.name}</b><small>${ROLE_LABEL[user.role]}</small></span>${ic.down}</button>
              <div class="usermenu__panel" hidden>
                <div class="usermenu__info"><b>${user.name}</b><small>${user.email}</small></div>
                <a href="#/profile" class="usermenu__item">${ic.user}<span>Profil & keamanan</span></a>
                <a href="/" target="_blank" rel="noopener" class="usermenu__item">${ic.external}<span>Buka situs publik</span></a>
                <button type="button" class="usermenu__item usermenu__item--danger" data-logout>${ic.logout}<span>Keluar</span></button>
              </div>
            </div>
          </div>
        </header>
        <main class="main" id="main" tabindex="-1"></main>
      </div>
    </div>`;
}

function closeSidebar() { document.documentElement.classList.remove('sidebar-open'); }

function setBadge(selector, value, tone = '') {
  const el = qs(selector);
  if (!el) return;
  el.hidden = !value;
  el.textContent = value > 99 ? '99+' : String(value);
  el.classList.toggle('is-danger', tone === 'danger');
}

/** Sidebar counters + notification bell. Failures are non-critical and simply retried next poll. */
async function refreshBadges() {
  if (!state.user) return;
  const jobs = [
    api.notificationCount().then(({ unread }) => {
      if (unread > state.unread && state.unread !== null && document.hidden === false && state.badges.ready) qs('.notif__btn')?.classList.add('is-ringing');
      state.unread = unread;
      setBadge('[data-notif-count]', unread);
    }),
    api.taskSummary().then((t) => setBadge('[data-badge="tasks"]', t.mineOverdue || t.mine, t.mineOverdue ? 'danger' : '')),
  ];
  if (state.user.role === 'admin') {
    jobs.push(api.leads({ status: 'new', pageSize: 1 }).then((r) => setBadge('[data-badge="leads"]', r.pagination.total)));
    jobs.push(api.mailUnread().then((r) => setBadge('[data-badge="mail"]', r.team)));
  }
  await Promise.allSettled(jobs);
  state.badges.ready = true;
}

function startPolling() {
  clearInterval(state.poll);
  state.poll = setInterval(() => { if (!document.hidden) refreshBadges(); }, BADGE_POLL_MS);
}

/* Notifications ---------------------------------------------------------- */
const NOTIF_ICON = { lead: 'leads', assignment: 'user', task: 'todo', reminder: 'clock', quote: 'quote', mail: 'mail' };

function closeNotifications() {
  const panel = qs('[data-notif-panel]');
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  qs('[data-notif]')?.setAttribute('aria-expanded', 'false');
}

async function openNotifications() {
  const panel = qs('[data-notif-panel]');
  const button = qs('[data-notif]');
  if (!panel.hidden) { closeNotifications(); return; }
  qs('.usermenu__panel').hidden = true;
  panel.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  button.classList.remove('is-ringing');
  render(panel, html`<div class="notif__head"><b>Notifikasi</b></div><div class="skeleton"><i></i><i></i><i></i></div>`);
  try {
    const data = await api.notifications({ pageSize: 15 });
    state.unread = data.unread;
    setBadge('[data-notif-count]', data.unread);
    render(panel, html`
      <div class="notif__head"><b>Notifikasi</b>${data.unread ? html`<button type="button" class="link" data-notif-readall>${ic.checkAll}<span>Tandai semua dibaca</span></button>` : ''}</div>
      ${data.items.length ? html`<ul class="notif__list">${data.items.map((n) => html`
        <li><a class="notif__item ${n.readAt ? '' : 'is-unread'}" href="${n.link || '#/dashboard'}" data-notif-id="${n.id}">
          <span class="notif__icon notif__icon--${n.type}">${ic[NOTIF_ICON[n.type] ?? 'bell']}</span>
          <span class="notif__text"><b>${n.title}</b>${n.body ? html`<small>${n.body}</small>` : ''}<time datetime="${n.createdAt}">${fmtRelative(n.createdAt)}</time></span>
        </a></li>`)}</ul>`
        : html`<div class="notif__empty">${ic.bell}<p>Belum ada notifikasi.</p><small>Lead baru, tugas, dan penawaran akan muncul di sini.</small></div>`}`);
  } catch (error) {
    render(panel, html`<div class="notif__head"><b>Notifikasi</b></div><p class="notif__empty">${errorMessage(error)}</p>`);
  }
}

function mountShell() {
  render(app, shellTemplate());
  app.addEventListener('click', onShellClick);
  route();
  state.unread = null;
  state.badges.ready = false;
  refreshBadges();
  startPolling();
}

async function onShellClick(event) {
  const t = event.target;
  if (t.closest('[data-open-sidebar]')) { document.documentElement.classList.add('sidebar-open'); return; }
  if (t.closest('[data-close-sidebar]')) { closeSidebar(); return; }
  if (t.closest('[data-theme-toggle]')) { setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); return; }
  if (t.closest('[data-cmdk]')) { openPalette(); return; }
  if (t.closest('[data-notif]')) { openNotifications(); return; }
  if (t.closest('[data-notif-readall]')) {
    try { await api.readNotifications(); state.unread = 0; setBadge('[data-notif-count]', 0); qsa('.notif__item.is-unread').forEach((el) => el.classList.remove('is-unread')); t.closest('[data-notif-readall]').remove(); } catch (error) { toast(errorMessage(error), 'danger'); }
    return;
  }
  const notifItem = t.closest('[data-notif-id]');
  if (notifItem) {
    closeNotifications();
    if (notifItem.classList.contains('is-unread')) api.readNotifications([Number(notifItem.dataset.notifId)]).then(() => refreshBadges()).catch(() => {});
    return;
  }
  if (!t.closest('[data-notif-panel]')) closeNotifications();
  const menuButton = t.closest('[data-usermenu]');
  const panel = qs('.usermenu__panel');
  if (menuButton) {
    const open = panel.hidden;
    panel.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
    return;
  }
  if (panel && !panel.hidden && !t.closest('.usermenu__panel')) { panel.hidden = true; qs('[data-usermenu]')?.setAttribute('aria-expanded', 'false'); }
  if (t.closest('.usermenu__item')) panel.hidden = true;
  if (t.closest('[data-logout]')) {
    try { await api.logout(); } catch { /* session may already be gone */ }
    clearInterval(state.poll);
    state.user = null;
    showLogin('Anda telah keluar.');
  }
}

/* Command palette -------------------------------------------------------- */
function paletteCommands() {
  const nav = NAV.flatMap((g) => g.items.filter((i) => canSee(i.roles)).map((i) => ({ label: i.label, hint: g.group, icon: i.icon, run: () => navigate(i.id) })));
  const actions = [
    { label: 'Tulis artikel baru', hint: 'Aksi', icon: 'plus', run: () => navigate('articles/new') },
    { label: 'Tambah tugas / follow-up', hint: 'Aksi', icon: 'todo', run: () => navigate('tasks?new=1') },
    { label: 'Tugas yang terlambat', hint: 'Aksi', icon: 'clock', run: () => navigate('tasks?due=overdue') },
    { label: 'Unggah media', hint: 'Aksi', icon: 'upload', run: () => navigate('media') },
    { label: 'Profil & keamanan', hint: 'Akun', icon: 'user', run: () => navigate('profile') },
    { label: 'Ganti tema terang/gelap', hint: 'Aksi', icon: 'moon', run: () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark') },
    { label: 'Buka situs publik', hint: 'Tautan', icon: 'external', run: () => window.open('/', '_blank', 'noopener') },
  ];
  if (state.user.role === 'admin') {
    actions.splice(1, 0, { label: 'Lihat leads baru', hint: 'Aksi', icon: 'leads', run: () => navigate('leads?status=new') },
      { label: 'Buat penawaran baru', hint: 'Aksi', icon: 'quote', run: () => navigate('quotes/new') },
      { label: 'Buka kotak masuk Mail', hint: 'Aksi', icon: 'mail', run: () => navigate('mail/messages') },
      { label: 'Kelola alamat email', hint: 'Aksi', icon: 'mail', run: () => navigate('mail/addresses') });
    actions.push({ label: 'Unduh backup database', hint: 'Sistem', icon: 'download', run: () => { window.location.href = '/api/admin/system/backup'; } });
  }
  return [...actions, ...nav];
}

let paletteOpen = false;
function openPalette() {
  if (paletteOpen || !state.user) return;
  paletteOpen = true;
  const commands = paletteCommands();
  let results = commands;
  let active = 0;
  let remote = [];
  const ov = overlay({ title: 'Perintah cepat', size: 'palette', onClose: () => { paletteOpen = false; } });
  render(ov.body, html`
    <div class="palette">
      <label class="palette__search">${ic.search}<input class="input" placeholder="Ketik halaman, aksi, atau cari lead/artikel…" autofocus data-pq></label>
      <ul class="palette__list" role="listbox"></ul>
      <p class="palette__foot"><kbd>↑</kbd><kbd>↓</kbd> navigasi · <kbd>Enter</kbd> pilih · <kbd>Esc</kbd> tutup</p>
    </div>`);
  const list = qs('.palette__list', ov.body);
  const input = qs('[data-pq]', ov.body);
  const all = () => [...results, ...remote];
  function paint() {
    const items = all();
    render(list, items.length ? html`${items.map((c, i) => html`<li role="option" aria-selected="${i === active}" class="palette__item ${i === active ? 'is-active' : ''}" data-i="${i}">${ic[c.icon] ?? ic.right}<span>${c.label}</span><small>${c.hint}</small></li>`)}` : html`<li class="palette__empty">Tidak ada hasil</li>`);
    qs('.is-active', list)?.scrollIntoView({ block: 'nearest' });
  }
  const searchRemote = debounce(async (q) => {
    if (q.length < 2) { remote = []; paint(); return; }
    const jobs = [api.articles({ q, pageSize: 5 }).then((r) => r.items.map((a) => ({ label: a.title, hint: `Artikel · ${a.locale.toUpperCase()}`, icon: 'articles', run: () => navigate(`articles/${a.id}`) })))];
    jobs.push(api.tasks({ q, status: 'all', pageSize: 5 }).then((r) => r.items.map((tk) => ({ label: tk.title, hint: `Tugas · ${tk.status === 'done' ? 'selesai' : 'terbuka'}`, icon: 'todo', run: () => navigate(`tasks/${tk.id}`) }))));
    if (state.user.role === 'admin') {
      jobs.push(api.leads({ q, pageSize: 5 }).then((r) => r.items.map((l) => ({ label: `${l.name} — ${l.email}`, hint: 'Lead', icon: 'leads', run: () => navigate(`leads/${l.id}`) }))));
      jobs.push(api.quotes({ q, pageSize: 5 }).then((r) => r.items.map((qt) => ({ label: `${qt.number} — ${qt.title}`, hint: `Penawaran · ${qt.clientName}`, icon: 'quote', run: () => navigate(`quotes/${qt.id}`) }))));
    }
    const settled = await Promise.allSettled(jobs);
    remote = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
    paint();
  }, 250);
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    results = q ? commands.filter((c) => `${c.label} ${c.hint}`.toLowerCase().includes(q)) : commands;
    active = 0;
    remote = [];
    paint();
    searchRemote(q);
  });
  input.addEventListener('keydown', (event) => {
    const items = all();
    if (event.key === 'ArrowDown') { event.preventDefault(); active = Math.min(items.length - 1, active + 1); paint(); }
    if (event.key === 'ArrowUp') { event.preventDefault(); active = Math.max(0, active - 1); paint(); }
    if (event.key === 'Enter' && items[active]) { event.preventDefault(); ov.close(); items[active].run(); }
  });
  list.addEventListener('click', (event) => {
    const item = event.target.closest('[data-i]');
    if (!item) return;
    ov.close();
    all()[Number(item.dataset.i)]?.run();
  });
  paint();
}

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openPalette(); }
  if (event.key === 'Escape') closeNotifications();
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.user) refreshBadges(); });

/* Login ------------------------------------------------------------------ */
function showLogin(message = '', tone = 'info') {
  app.removeEventListener('click', onShellClick);
  document.title = 'Masuk · TensuraLabs Console';
  render(app, html`
    <div class="login">
      <div class="login__art" aria-hidden="true"><div class="login__orb"></div><div class="login__grid"></div>
        <div class="login__pitch"><h2>Kelola seluruh situs TensuraLabs dari satu tempat.</h2>
          <ul><li>${ic.leads} CRM leads, penawaran & tugas follow-up</li><li>${ic.palette} Editor tampilan dengan pratinjau langsung</li><li>${ic.shield} Keamanan 2FA, audit log & webhook bertanda tangan</li></ul></div>
      </div>
      <form class="login__card" novalidate>
        <div class="brand brand--lg">${ic.logo}<span><b>TensuraLabs</b><small>Console</small></span></div>
        <h1>Selamat datang kembali</h1>
        <p class="muted">Masuk untuk melanjutkan ke dashboard.</p>
        ${message ? html`<div class="alert alert--${tone}">${message}</div>` : ''}
        <label class="field"><span class="field__label">Email</span><input class="input" name="email" type="email" autocomplete="username" required autofocus></label>
        <label class="field"><span class="field__label">Password</span>
          <span class="password"><input class="input" name="password" type="password" autocomplete="current-password" required><button type="button" class="btn btn--icon btn--ghost" data-reveal aria-label="Tampilkan password">${ic.eye}</button></span></label>
        <p class="form-error" data-error hidden></p>
        <button class="btn btn--primary btn--block" type="submit">Masuk</button>
        <a class="muted small login__back" href="/">← Kembali ke situs</a>
      </form>
    </div>`);
  const form = qs('form', app);
  qs('[data-reveal]', form).addEventListener('click', (event) => {
    const input = form.elements.password;
    input.type = input.type === 'password' ? 'text' : 'password';
    render(event.currentTarget, input.type === 'password' ? ic.eye : ic.eyeOff);
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = qs('[type=submit]', form);
    const error = qs('[data-error]', form);
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    if (!email || !password) { error.hidden = false; error.textContent = 'Email dan password wajib diisi.'; return; }
    button.disabled = true;
    button.textContent = 'Memproses…';
    try {
      const result = await api.login({ email, password });
      if (result.mfaRequired) { showMfa(result.challenge, email); return; }
      enterConsole(result.user);
    } catch (err) {
      error.hidden = false;
      error.textContent = errorMessage(err);
      button.disabled = false;
      button.textContent = 'Masuk';
    }
  });
}

function enterConsole(user) {
  state.user = user;
  if (!location.hash) history.replaceState(null, '', '#/dashboard');
  mountShell();
  toast(`Halo, ${user.name}!`);
}

/** Second login step for accounts with two-factor authentication. */
function showMfa(challenge, email) {
  // A fresh form element drops the password step's listeners.
  const previous = qs('.login__card', app);
  const card = previous.cloneNode(false);
  previous.replaceWith(card);
  let useRecovery = false;
  function paint(message = '') {
    render(card, html`
      <div class="brand brand--lg">${ic.logo}<span><b>TensuraLabs</b><small>Console</small></span></div>
      <div class="mfa__icon">${ic.shield}</div>
      <h1>Verifikasi dua langkah</h1>
      <p class="muted">${useRecovery ? 'Masukkan salah satu kode pemulihan Anda (format XXXX-XXXX).' : html`Buka aplikasi autentikator dan masukkan kode 6 digit untuk <b>${email}</b>.`}</p>
      ${message ? html`<div class="alert alert--danger">${message}</div>` : ''}
      <label class="field"><span class="field__label">${useRecovery ? 'Kode pemulihan' : 'Kode verifikasi'}</span>
        <input class="input input--lg ${useRecovery ? '' : 'input--otp'}" name="code" required autofocus
          ${useRecovery ? html`autocomplete="off" maxlength="12" placeholder="XXXX-XXXX"` : html`inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" placeholder="••••••"`}></label>
      <button class="btn btn--primary btn--block" type="submit">Verifikasi & masuk</button>
      <button type="button" class="link login__alt" data-mfa-toggle>${useRecovery ? 'Gunakan kode aplikasi autentikator' : 'Tidak bisa mengakses aplikasi? Gunakan kode pemulihan'}</button>
      <a class="muted small login__back" href="#" data-mfa-cancel>← Kembali ke login</a>`);
    requestAnimationFrame(() => card.elements.code?.focus());
  }
  card.addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = card.elements.code.value.trim();
    if (!code) return;
    const button = qs('[type=submit]', card);
    button.disabled = true;
    button.textContent = 'Memverifikasi…';
    try {
      const { user } = await api.verifyMfa({ challenge, code });
      enterConsole(user);
    } catch (err) {
      if (err.code === 'MFA_EXPIRED' || err.code === 'ACCOUNT_LOCKED') { showLogin(errorMessage(err), 'warn'); return; }
      paint(errorMessage(err));
    }
  });
  card.addEventListener('input', (event) => {
    const input = event.target;
    if (input.name !== 'code' || useRecovery) return;
    input.value = input.value.replace(/\D/g, '').slice(0, 6);
    if (input.value.length === 6) card.requestSubmit();
  });
  card.addEventListener('click', (event) => {
    if (event.target.closest('[data-mfa-toggle]')) { useRecovery = !useRecovery; paint(); }
    if (event.target.closest('[data-mfa-cancel]')) { event.preventDefault(); showLogin(); }
  });
  paint();
}

window.addEventListener('hashchange', route);
window.addEventListener('tl:unauthorized', () => {
  if (!state.user) return;
  clearInterval(state.poll);
  state.user = null;
  state.guard = null;
  showLogin('Sesi berakhir. Silakan masuk kembali.', 'warn');
});
window.addEventListener('beforeunload', (event) => { if (state.guard?.()) { event.preventDefault(); event.returnValue = ''; } });

(async function boot() {
  try {
    const { user } = await api.session();
    state.user = user;
  } catch { state.user = null; }
  if (state.user) mountShell(); else showLogin();
}());
