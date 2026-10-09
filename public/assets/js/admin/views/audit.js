import { api } from '../api.js';
import { ic } from '../icons.js';
import { avatar, badge, debounce, emptyState, errorBox, fmtDateTime, fmtRelative, html, loading, pager, qs, render } from '../ui.js';

const ACTION_TONE = { create: 'ok', update: 'info', delete: 'danger', login: 'violet', logout: 'muted', upload: 'cyan', reset: 'warn', backup: 'warn', maintenance: 'warn', export: 'cyan' };
const ENTITY_LABEL = { auth: 'Autentikasi', article: 'Artikel', lead: 'Lead', media: 'Media', settings: 'Pengaturan', user: 'Pengguna', profile: 'Profil', session: 'Sesi', system: 'Sistem', squad: 'Tim', portfolio: 'Portofolio', gazette: 'Kabar Guild', content: 'Konten' };

export async function mount(ctx) {
  ctx.setTitle('Log Aktivitas');
  const f = { q: '', entity: '', action: '', from: '', to: '', page: 1 };
  let entities = [];

  render(ctx.root, html`
    <div class="page-head"><div><h2>Log aktivitas</h2><p class="muted">Jejak audit setiap perubahan di dashboard (disimpan 180 hari).</p></div></div>
    <div class="card filters" data-filters></div>
    <div data-results>${loading(8)}</div>`);

  function paintFilters() {
    render(qs('[data-filters]', ctx.root), html`
      <label class="search">${ic.search}<input type="search" class="input" placeholder="Cari ringkasan atau pelaku…" value="${f.q}" data-f="q"></label>
      <select class="input" data-f="entity" aria-label="Entitas"><option value="">Semua entitas</option>${entities.map((e) => html`<option value="${e}" ${f.entity === e ? 'selected' : ''}>${ENTITY_LABEL[e] ?? e}</option>`)}</select>
      <input class="input" type="date" data-f="from" value="${f.from}" aria-label="Dari tanggal">
      <input class="input" type="date" data-f="to" value="${f.to}" aria-label="Sampai tanggal">`);
  }

  async function load() {
    const results = qs('[data-results]', ctx.root);
    try {
      const data = await api.audit({ ...f, pageSize: 30 });
      if (!entities.length && data.entities?.length) { entities = data.entities; paintFilters(); }
      render(results, data.items.length ? html`
        <div class="card card--flush"><div class="table-wrap"><table class="table">
          <thead><tr><th>Waktu</th><th>Pelaku</th><th>Aksi</th><th>Entitas</th><th>Ringkasan</th></tr></thead>
          <tbody>${data.items.map((row) => {
            const base = row.action.replace(/^bulk-.*/, 'update');
            return html`<tr>
              <td class="nowrap" title="${fmtDateTime(row.createdAt)}">${fmtRelative(row.createdAt)}</td>
              <td><span class="cell-user cell-user--sm">${avatar(row.userName ?? row.actor ?? '?', 'sm')}<small>${row.userName ?? row.actor ?? 'Sistem'}</small></span></td>
              <td>${badge(row.action, ACTION_TONE[base] ?? 'muted')}</td>
              <td>${ENTITY_LABEL[row.entity] ?? row.entity}${row.entityId ? html` <small class="muted">#${row.entityId}</small>` : ''}</td>
              <td>${row.summary}</td></tr>`;
          })}</tbody></table></div>${pager(data.pagination)}</div>`
        : emptyState('Belum ada aktivitas', 'Coba ubah filter.'));
    } catch (error) { render(results, errorBox(error)); }
  }

  const search = debounce(() => { f.page = 1; load(); }, 300);
  ctx.root.addEventListener('input', (e) => { if (e.target.matches('[data-f="q"]')) { f.q = e.target.value.trim(); search(); } });
  ctx.root.addEventListener('change', (e) => { const k = e.target.dataset.f; if (k && k !== 'q') { f[k] = e.target.value; f.page = 1; load(); } });
  ctx.root.addEventListener('click', (e) => {
    const page = e.target.closest('[data-page]');
    if (page && !page.disabled) { f.page = Number(page.dataset.page); load(); }
    if (e.target.closest('[data-retry]')) load();
  });
  paintFilters();
  await load();
  return {};
}
