import { api } from '../api.js';
import { ic } from '../icons.js';
import { openTaskEditor, taskRow, toggleTask } from '../task-editor.js';
import { debounce, emptyState, errorBox, errorMessage, fmtNumber, html, LEAD_PRIORITY, loading, pager, qs, qsa, render, toast } from '../ui.js';

const SCOPES = [['all', 'Semua'], ['mine', 'Ditugaskan ke saya'], ['created', 'Saya buat'], ['unassigned', 'Belum ditugaskan']];
const DUE_OPTIONS = [['all', 'Semua tenggat'], ['overdue', 'Terlambat'], ['today', 'Hari ini'], ['week', '7 hari ke depan'], ['nodate', 'Tanpa tenggat']];
const DEFAULTS = { scope: 'all', status: 'open', due: 'all', priority: 'all', q: '', sort: 'due', page: 1 };
const DAY = 86400000;

/** Buckets open tasks by urgency for the default "due" ordering. */
function groupTasks(items) {
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const t0 = startToday.getTime();
  const groups = [
    { key: 'overdue', label: 'Terlambat', tone: 'danger', items: [] },
    { key: 'today', label: 'Hari ini', tone: 'warn', items: [] },
    { key: 'week', label: '7 hari ke depan', tone: 'info', items: [] },
    { key: 'later', label: 'Nanti', tone: 'muted', items: [] },
    { key: 'nodate', label: 'Tanpa tenggat', tone: 'muted', items: [] },
    { key: 'done', label: 'Selesai', tone: 'ok', items: [] },
  ];
  const by = Object.fromEntries(groups.map((g) => [g.key, g]));
  for (const task of items) {
    if (task.status === 'done') by.done.items.push(task);
    else if (!task.dueAt) by.nodate.items.push(task);
    else if (task.isOverdue) by.overdue.items.push(task);
    else if (Date.parse(task.dueAt) < t0 + DAY) by.today.items.push(task);
    else if (Date.parse(task.dueAt) < t0 + 7 * DAY) by.week.items.push(task);
    else by.later.items.push(task);
  }
  return groups.filter((g) => g.items.length);
}

export async function mount(ctx) {
  ctx.setTitle('Tugas & Follow-up');
  const isAdmin = ctx.user.role === 'admin';
  const f = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) if (ctx.query.has(key)) f[key] = key === 'page' ? Number(ctx.query.get(key)) || 1 : ctx.query.get(key);
  let data = null;

  const sync = () => ctx.setQuery(Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== DEFAULTS[k])));

  function shell() {
    render(ctx.root, html`
      <div class="page-head">
        <div><h2>Tugas & Follow-up</h2><p class="muted">Satu tempat untuk semua tindak lanjut: telepon klien, kirim proposal, review rilis.</p></div>
        <button type="button" class="btn btn--primary" data-new>${ic.plus}<span>Tugas baru</span></button>
      </div>
      <div class="grid grid--kpi" data-summary>${loading(1)}</div>
      <form class="card quickadd" data-quick>
        <span class="quickadd__icon">${ic.plus}</span>
        <input class="input" name="title" maxlength="160" placeholder="Tambah tugas cepat untuk saya… lalu tekan Enter" aria-label="Judul tugas cepat">
        <select class="input input--sm" name="when" aria-label="Tenggat"><option value="">Tanpa tenggat</option><option value="today">Hari ini 17.00</option><option value="tomorrow" selected>Besok 09.00</option><option value="week">Minggu depan</option></select>
        <button class="btn btn--primary btn--sm" type="submit">Tambah</button>
      </form>
      <div class="tabs" role="tablist">
        ${SCOPES.map(([key, label]) => html`<button type="button" role="tab" class="tab ${f.scope === key ? 'is-active' : ''}" aria-selected="${f.scope === key}" data-scope="${key}">${label}</button>`)}
      </div>
      <div class="card filters">
        <label class="search">${ic.search}<input type="search" class="input" placeholder="Cari tugas${isAdmin ? ' atau nama lead' : ''}…" value="${f.q}" data-f="q"></label>
        <select class="input" data-f="status" aria-label="Status">
          ${[['open', 'Belum selesai'], ['done', 'Selesai'], ['all', 'Semua status']].map(([v, l]) => html`<option value="${v}" ${f.status === v ? 'selected' : ''}>${l}</option>`)}</select>
        <select class="input" data-f="due" aria-label="Tenggat">${DUE_OPTIONS.map(([v, l]) => html`<option value="${v}" ${f.due === v ? 'selected' : ''}>${l}</option>`)}</select>
        <select class="input" data-f="priority" aria-label="Prioritas"><option value="all">Semua prioritas</option>${Object.entries(LEAD_PRIORITY).map(([k, v]) => html`<option value="${k}" ${f.priority === k ? 'selected' : ''}>${v.label}</option>`)}</select>
        <select class="input" data-f="sort" aria-label="Urutkan">${[['due', 'Tenggat terdekat'], ['priority', 'Prioritas'], ['newest', 'Terbaru dibuat']].map(([v, l]) => html`<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`)}</select>
      </div>
      <div data-results>${loading(6)}</div>`);
  }

  function paintSummary(s) {
    const tile = (label, value, icon, tone, due, scope = 'all') => html`
      <button type="button" class="card kpi kpi--button ${f.due === due && f.scope === scope ? 'is-active' : ''}" data-quickfilter="${due}" data-quickscope="${scope}">
        <div class="kpi__top"><span class="kpi__icon kpi__icon--${tone}">${ic[icon]}</span><span class="kpi__label">${label}</span></div>
        <div class="kpi__value">${fmtNumber(value)}</div></button>`;
    render(qs('[data-summary]', ctx.root), html`
      ${tile('Belum selesai', s.open, 'todo', 'accent', 'all')}
      ${tile('Terlambat', s.overdue, 'alert', 'danger', 'overdue')}
      ${tile('Jatuh tempo hari ini', s.dueToday, 'clock', 'warn', 'today')}
      ${tile('Ditugaskan ke saya', s.mine, 'user', 'violet', 'all', 'mine')}`);
  }

  async function load() {
    const results = qs('[data-results]', ctx.root);
    try {
      data = await api.tasks({ ...f, pageSize: 50 });
      paintSummary(data.summary);
      if (!data.items.length) {
        render(results, emptyState(f.q || f.due !== 'all' || f.priority !== 'all' ? 'Tidak ada tugas yang cocok' : f.status === 'done' ? 'Belum ada tugas selesai' : 'Semua beres! 🎉',
          f.status === 'open' && !f.q ? 'Tidak ada tugas terbuka. Tambahkan tugas baru atau tindak lanjut dari halaman lead.' : 'Coba ubah filter atau kata kunci.',
          html`<button type="button" class="btn btn--primary" data-new>${ic.plus}<span>Tugas baru</span></button>`));
        return;
      }
      const grouped = f.sort === 'due' ? groupTasks(data.items) : [{ key: 'all', label: '', items: data.items }];
      render(results, html`
        ${grouped.map((g) => html`<section class="todo-group">
          ${g.label ? html`<h4 class="todo-group__title"><i class="dot dot--${g.tone}"></i>${g.label}<span>${g.items.length}</span></h4>` : ''}
          <ul class="todos card card--flush">${g.items.map((task) => taskRow(task, { showLead: isAdmin }))}</ul></section>`)}
        ${pager(data.pagination)}`);
    } catch (error) {
      render(results, errorBox(error));
    }
  }

  async function edit(task, defaults) {
    const saved = await openTaskEditor({ task, user: ctx.user, defaults });
    if (saved) { load(); ctx.refreshBadges(); }
    if (ctx.params[0]) ctx.navigate(`tasks${location.hash.includes('?') ? `?${location.hash.split('?')[1]}` : ''}`);
  }

  const search = debounce(() => { f.page = 1; sync(); load(); }, 300);
  ctx.root.addEventListener('input', (event) => {
    if (event.target.matches('[data-f="q"]')) { f.q = event.target.value.trim(); search(); }
  });
  ctx.root.addEventListener('change', (event) => {
    const input = event.target.closest('[data-f]');
    if (input && input.dataset.f !== 'q') { f[input.dataset.f] = input.value; f.page = 1; sync(); load(); }
  });
  ctx.root.addEventListener('submit', async (event) => {
    if (!event.target.matches('[data-quick]')) return;
    event.preventDefault();
    const form = event.target;
    const title = form.elements.title.value.trim();
    if (title.length < 2) { form.elements.title.focus(); return; }
    const when = form.elements.when.value;
    let dueAt = null;
    if (when) {
      const d = new Date(); d.setSeconds(0, 0);
      if (when === 'today') d.setHours(17, 0);
      if (when === 'tomorrow') { d.setDate(d.getDate() + 1); d.setHours(9, 0); }
      if (when === 'week') { d.setDate(d.getDate() + 7); d.setHours(9, 0); }
      dueAt = d.toISOString();
    }
    try {
      await api.createTask({ title, assignedTo: ctx.user.id, dueAt });
      form.elements.title.value = '';
      toast('Tugas ditambahkan');
      load();
      ctx.refreshBadges();
    } catch (error) { toast(errorMessage(error), 'danger'); }
  });
  ctx.root.addEventListener('click', async (event) => {
    const t = event.target;
    if (t.closest('[data-retry]')) { load(); return; }
    if (t.closest('[data-new]')) { edit(null); return; }
    const scope = t.closest('[data-scope]');
    if (scope) { f.scope = scope.dataset.scope; f.page = 1; sync(); qsa('[data-scope]', ctx.root).forEach((b) => { const on = b === scope; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); }); load(); return; }
    const quick = t.closest('[data-quickfilter]');
    if (quick) {
      f.due = quick.dataset.quickfilter; f.scope = quick.dataset.quickscope; f.status = 'open'; f.page = 1;
      sync(); shell(); load(); return;
    }
    const page = t.closest('[data-page]');
    if (page && !page.disabled) { f.page = Number(page.dataset.page); sync(); load(); return; }
    const toggle = t.closest('[data-toggle-task]');
    if (toggle) {
      const id = Number(toggle.dataset.toggleTask);
      const done = toggle.getAttribute('aria-pressed') !== 'true';
      const row = toggle.closest('.todo');
      row.classList.toggle('is-done', done);
      toggle.setAttribute('aria-pressed', String(done));
      try { await toggleTask(id, done); toast(done ? 'Tugas selesai ✓' : 'Tugas dibuka kembali'); ctx.refreshBadges(); setTimeout(load, 350); } catch (error) { toast(errorMessage(error), 'danger'); load(); }
      return;
    }
    if (t.closest('a')) return;
    const row = t.closest('[data-task]');
    if (row) edit(data.items.find((x) => x.id === Number(row.dataset.task)));
  });
  ctx.root.addEventListener('keydown', (event) => {
    const row = event.target.closest('[data-task]');
    if (row && event.key === 'Enter' && event.target === row) edit(data.items.find((x) => x.id === Number(row.dataset.task)));
  });

  shell();
  await load();
  if (ctx.params[0]) {
    try { edit(await api.task(Number(ctx.params[0]))); } catch (error) { toast(errorMessage(error), 'danger'); }
  } else if (ctx.query.get('new') === '1') {
    edit(null, ctx.query.get('lead') ? { leadId: Number(ctx.query.get('lead')) } : {});
  }
  return {};
}
