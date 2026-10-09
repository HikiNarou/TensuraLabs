import { api } from '../api.js';
import { ic } from '../icons.js';
import { openTaskEditor, taskRow, toggleTask } from '../task-editor.js';
import {
  avatar, badge, BUDGET_LABEL, confirmDialog, copyText, debounce, emptyState, errorBox, errorMessage, fmtDateTime, fmtMoney, fmtNumber,
  fmtRelative, html, LEAD_PRIORITY, LEAD_STATUS, loading, overlay, pager, QUOTE_STATUS, qs, qsa, render, toast,
} from '../ui.js';

const STATUSES = Object.keys(LEAD_STATUS);
const DEFAULTS = { view: 'table', status: 'all', priority: 'all', service: '', assigned: 'all', q: '', from: '', to: '', sort: 'newest', page: 1 };
const EVENT_TEXT = {
  created: () => 'mengirim permintaan konsultasi',
  resubmitted: () => 'mengirim ulang permintaan',
  status: (e) => html`mengubah status ${badge(LEAD_STATUS[e.data.from]?.label ?? e.data.from, LEAD_STATUS[e.data.from]?.tone)} → ${badge(LEAD_STATUS[e.data.to]?.label ?? e.data.to, LEAD_STATUS[e.data.to]?.tone)}`,
  priority: (e) => html`mengubah prioritas menjadi <b>${LEAD_PRIORITY[e.data.to]?.label ?? e.data.to}</b>`,
  assigned: (e) => (e.data.to ? html`menugaskan ke <b>${e.data.name}</b>` : 'menghapus penanggung jawab'),
  note: () => 'memperbarui catatan internal',
  comment: () => 'menambahkan komentar',
  task: (e) => (e.data.action === 'completed' ? 'menyelesaikan tugas' : 'membuat tugas follow-up'),
  quote: (e) => ({ created: 'membuat penawaran', sent: 'mengirim penawaran', accepted: 'menandai penawaran diterima', rejected: 'menandai penawaran ditolak', draft: 'mengembalikan penawaran ke draf' }[e.data.action] ?? 'memperbarui penawaran'),
};
const EVENT_ICON = { created: 'send', resubmitted: 'refresh', status: 'board', priority: 'star', assigned: 'user', note: 'edit', comment: 'message', task: 'todo', quote: 'quote' };

const waLink = (phone) => {
  const digits = phone.replace(/\D/g, '').replace(/^0/, '62');
  return digits ? `https://wa.me/${digits}` : '';
};

export async function mount(ctx) {
  ctx.setTitle('Leads & CRM');
  const f = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) if (ctx.query.has(key)) f[key] = key === 'page' ? Number(ctx.query.get(key)) || 1 : ctx.query.get(key);
  if (!['table', 'board'].includes(f.view)) f.view = 'table';
  let meta = { services: [], assignees: [] };
  let data = null;
  const selected = new Set();
  let drawer = null;

  const filterParams = () => ({ status: f.status, priority: f.priority, service: f.service, assigned: f.assigned, q: f.q, from: f.from, to: f.to, sort: f.sort });
  const sync = () => ctx.setQuery({ ...filterParams(), view: f.view === 'table' ? '' : f.view, page: f.page > 1 ? f.page : '', sort: f.sort === 'newest' ? '' : f.sort });

  function shell() {
    render(ctx.root, html`
      <div class="page-head">
        <div><h2>Leads & CRM</h2><p class="muted">Kelola permintaan konsultasi dari situs, dari lead baru hingga deal.</p></div>
        <div class="row">
          <div class="segmented" role="group" aria-label="Tampilan">
            <button type="button" class="${f.view === 'table' ? 'is-active' : ''}" data-view="table">${ic.list}<span>Tabel</span></button>
            <button type="button" class="${f.view === 'board' ? 'is-active' : ''}" data-view="board">${ic.board}<span>Kanban</span></button>
          </div>
          <a class="btn" data-export href="${api.leadsExportUrl(filterParams())}" download>${ic.download}<span>Ekspor CSV</span></a>
        </div>
      </div>
      <div class="card filters">
        <label class="search">${ic.search}<input type="search" class="input" placeholder="Cari nama, email, perusahaan, pesan…" value="${f.q}" data-f="q"></label>
        ${f.view === 'table' ? html`<select class="input" data-f="status" aria-label="Status">
          <option value="all">Semua status</option><option value="open" ${f.status === 'open' ? 'selected' : ''}>Masih terbuka</option>
          ${STATUSES.map((s) => html`<option value="${s}" ${f.status === s ? 'selected' : ''}>${LEAD_STATUS[s].label}</option>`)}</select>` : ''}
        <select class="input" data-f="priority" aria-label="Prioritas"><option value="all">Semua prioritas</option>${Object.entries(LEAD_PRIORITY).map(([k, v]) => html`<option value="${k}" ${f.priority === k ? 'selected' : ''}>${v.label}</option>`)}</select>
        <select class="input" data-f="service" aria-label="Layanan"><option value="">Semua layanan</option>${meta.services.map((s) => html`<option value="${s}" ${f.service === s ? 'selected' : ''}>${s}</option>`)}</select>
        <select class="input" data-f="assigned" aria-label="Penanggung jawab">
          <option value="all">Semua PIC</option><option value="me" ${f.assigned === 'me' ? 'selected' : ''}>Ditugaskan ke saya</option><option value="none" ${f.assigned === 'none' ? 'selected' : ''}>Belum ditugaskan</option>
          ${meta.assignees.map((u) => html`<option value="${u.id}" ${String(f.assigned) === String(u.id) ? 'selected' : ''}>${u.name}</option>`)}</select>
        <details class="filters__more">
          <summary class="btn btn--ghost">${ic.filter}<span>Lainnya</span></summary>
          <div class="filters__pop">
            <label class="field"><span class="field__label">Dari tanggal</span><input class="input" type="date" data-f="from" value="${f.from}"></label>
            <label class="field"><span class="field__label">Sampai tanggal</span><input class="input" type="date" data-f="to" value="${f.to}"></label>
            ${f.view === 'table' ? html`<label class="field"><span class="field__label">Urutkan</span><select class="input" data-f="sort">
              ${[['newest', 'Terbaru'], ['oldest', 'Terlama'], ['updated', 'Baru diperbarui'], ['priority', 'Prioritas']].map(([v, l]) => html`<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`)}</select></label>` : ''}
            <button type="button" class="btn btn--ghost btn--sm" data-reset>Reset filter</button>
          </div>
        </details>
      </div>
      <div class="bulkbar" data-bulk hidden></div>
      <div data-results>${loading(6)}</div>`);
  }

  async function load() {
    const results = qs('[data-results]', ctx.root);
    const exportLink = qs('[data-export]', ctx.root);
    if (exportLink) exportLink.href = api.leadsExportUrl(filterParams());
    try {
      if (f.view === 'board') {
        data = await api.leadBoard(filterParams());
        render(results, boardView());
      } else {
        data = await api.leads({ ...filterParams(), page: f.page, pageSize: 20 });
        render(results, tableView());
      }
      paintBulk();
    } catch (error) {
      render(results, errorBox(error));
    }
  }

  function tableView() {
    if (!data.items.length) return emptyState('Tidak ada lead', f.q || f.status !== 'all' ? 'Coba ubah filter pencarian.' : 'Lead baru dari formulir konsultasi akan muncul di sini.');
    const allChecked = data.items.every((l) => selected.has(l.id));
    return html`
      <div class="card card--flush">
        <div class="table-wrap"><table class="table table--hover">
          <thead><tr>
            <th class="col-check"><input type="checkbox" data-check-all ${allChecked ? 'checked' : ''} aria-label="Pilih semua"></th>
            <th>Kontak</th><th>Layanan</th><th>Anggaran</th><th>Status</th><th>Prioritas</th><th>PIC</th><th>Masuk</th>
          </tr></thead>
          <tbody>${data.items.map((lead) => html`
            <tr data-open="${lead.id}" class="${lead.status === 'new' ? 'is-unread' : ''}">
              <td class="col-check"><input type="checkbox" data-check="${lead.id}" ${selected.has(lead.id) ? 'checked' : ''} aria-label="Pilih ${lead.name}"></td>
              <td><div class="cell-user">${avatar(lead.name)}<span><b>${lead.name}</b><small>${lead.email}${lead.company ? ` · ${lead.company}` : ''}</small></span></div></td>
              <td>${lead.service || html`<span class="muted">—</span>`}</td>
              <td class="nowrap">${BUDGET_LABEL[lead.budget] ?? '—'}</td>
              <td>${badge(LEAD_STATUS[lead.status].label, LEAD_STATUS[lead.status].tone)}</td>
              <td>${badge(LEAD_PRIORITY[lead.priority].label, LEAD_PRIORITY[lead.priority].tone)}</td>
              <td>${lead.assigneeName ? html`<span class="cell-user cell-user--sm">${avatar(lead.assigneeName, 'sm')}<small>${lead.assigneeName}</small></span>` : html`<span class="muted">—</span>`}</td>
              <td class="nowrap" title="${fmtDateTime(lead.createdAt)}">${fmtRelative(lead.createdAt)}</td>
            </tr>`)}</tbody>
        </table></div>
        ${pager(data.pagination)}
      </div>`;
  }

  function boardView() {
    return html`<div class="kanban">${STATUSES.map((status) => {
      const column = data[status] ?? { total: 0, items: [] };
      return html`
        <section class="kanban__col" data-col="${status}">
          <header class="kanban__head"><span class="dot dot--${LEAD_STATUS[status].tone}"></span><b>${LEAD_STATUS[status].label}</b><em>${fmtNumber(column.total)}</em></header>
          <div class="kanban__list" data-drop="${status}">
            ${column.items.map((lead) => html`
              <article class="kanban__card" draggable="true" data-drag="${lead.id}" data-open="${lead.id}" tabindex="0">
                <div class="kanban__card-top"><b>${lead.name}</b>${lead.priority === 'high' ? badge('Tinggi', 'danger') : ''}</div>
                <small class="muted">${lead.company || lead.email}</small>
                ${lead.service ? html`<span class="chip">${lead.service}</span>` : ''}
                <div class="kanban__card-foot"><span>${BUDGET_LABEL[lead.budget] && lead.budget ? BUDGET_LABEL[lead.budget] : ''}</span><span>${lead.assigneeName ? avatar(lead.assigneeName, 'sm') : ''}<small>${fmtRelative(lead.createdAt)}</small></span></div>
              </article>`)}
            ${column.total > column.items.length ? html`<a class="kanban__more" href="#/leads?status=${status}">+${column.total - column.items.length} lainnya</a>` : ''}
            ${!column.items.length ? html`<p class="kanban__empty">Seret kartu ke sini</p>` : ''}
          </div>
        </section>`;
    })}</div>`;
  }

  function paintBulk() {
    const bar = qs('[data-bulk]', ctx.root);
    if (!bar) return;
    bar.hidden = !selected.size || f.view !== 'table';
    if (bar.hidden) return;
    render(bar, html`
      <b>${selected.size} dipilih</b>
      <select class="input input--sm" data-bulk-action="status" aria-label="Ubah status"><option value="">Ubah status…</option>${STATUSES.map((s) => html`<option value="${s}">${LEAD_STATUS[s].label}</option>`)}</select>
      <select class="input input--sm" data-bulk-action="priority" aria-label="Ubah prioritas"><option value="">Prioritas…</option>${Object.entries(LEAD_PRIORITY).map(([k, v]) => html`<option value="${k}">${v.label}</option>`)}</select>
      <select class="input input--sm" data-bulk-action="assign" aria-label="Tugaskan"><option value="">Tugaskan…</option><option value="none">— Tanpa PIC —</option>${meta.assignees.map((u) => html`<option value="${u.id}">${u.name}</option>`)}</select>
      <button type="button" class="btn btn--sm btn--danger" data-bulk-delete>${ic.trash}<span>Hapus</span></button>
      <button type="button" class="btn btn--sm btn--ghost" data-bulk-clear>Batal</button>`);
  }

  async function bulk(action, value) {
    const ids = [...selected];
    try {
      const body = { action, ids };
      if (action !== 'delete') body.value = action === 'assign' ? (value === 'none' ? null : Number(value)) : value;
      const result = await api.bulkLeads(body);
      toast(`${result?.affected ?? ids.length} lead diperbarui`);
      selected.clear();
      ctx.refreshBadges();
      load();
    } catch (error) { toast(errorMessage(error), 'danger'); }
  }

  /* Detail drawer ------------------------------------------------------ */
  async function openLead(id) {
    drawer?.close();
    const ov = overlay({ kind: 'drawer', title: 'Detail lead', size: 'lg', onClose: () => { if (drawer === ov) drawer = null; } });
    drawer = ov;
    ov.setContent(loading(8));
    let lead; let tasks = []; let quotes = [];
    const refresh = async () => {
      try {
        [lead, tasks, quotes] = await Promise.all([
          api.lead(id),
          api.tasks({ leadId: id, status: 'all', sort: 'due', pageSize: 50 }).then((r) => r.items).catch(() => []),
          api.quotes({ leadId: id, pageSize: 20 }).then((r) => r.items).catch(() => []),
        ]);
        paintLead();
      } catch (error) { ov.setContent(errorBox(error)); }
    };
    function paintLead() {
      ov.setTitle(lead.name);
      const wa = lead.phone ? waLink(lead.phone) : '';
      ov.setContent(html`
        <div class="lead">
          <div class="lead__hero">
            ${avatar(lead.name, 'lg')}
            <div><h3>${lead.name}</h3><p class="muted">${lead.company || 'Perorangan'} · ${lead.locale.toUpperCase()} · ${fmtDateTime(lead.createdAt)}</p>
              <div class="row row--wrap">${badge(LEAD_STATUS[lead.status].label, LEAD_STATUS[lead.status].tone)} ${badge(`Prioritas ${LEAD_PRIORITY[lead.priority].label.toLowerCase()}`, LEAD_PRIORITY[lead.priority].tone)} ${lead.marketingOptIn ? badge('Setuju marketing', 'ok') : ''}</div></div>
          </div>
          <div class="lead__contact">
            <a class="btn btn--sm" href="mailto:${lead.email}?subject=${encodeURIComponent('Konsultasi TensuraLabs')}">${ic.mail}<span>${lead.email}</span></a>
            <button type="button" class="btn btn--sm btn--ghost btn--icon" data-copy="${lead.email}" aria-label="Salin email">${ic.copy}</button>
            ${lead.phone ? html`<a class="btn btn--sm" href="tel:${lead.phone.replace(/[^\d+]/g, '')}">${ic.phone}<span>${lead.phone}</span></a>` : ''}
            ${wa ? html`<a class="btn btn--sm btn--ok" href="${wa}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ''}
          </div>
          <div class="lead__grid">
            <label class="field"><span class="field__label">Status</span><select class="input" data-lead="status">${STATUSES.map((s) => html`<option value="${s}" ${lead.status === s ? 'selected' : ''}>${LEAD_STATUS[s].label}</option>`)}</select></label>
            <label class="field"><span class="field__label">Prioritas</span><select class="input" data-lead="priority">${Object.entries(LEAD_PRIORITY).map(([k, v]) => html`<option value="${k}" ${lead.priority === k ? 'selected' : ''}>${v.label}</option>`)}</select></label>
            <label class="field"><span class="field__label">Penanggung jawab</span><select class="input" data-lead="assignedTo"><option value="">— Belum ditugaskan —</option>${meta.assignees.map((u) => html`<option value="${u.id}" ${lead.assignedTo === u.id ? 'selected' : ''}>${u.name}</option>`)}</select></label>
          </div>
          <dl class="dl">
            <div><dt>Layanan</dt><dd>${lead.service || '—'}</dd></div>
            <div><dt>Anggaran</dt><dd>${BUDGET_LABEL[lead.budget] ?? '—'}</dd></div>
            <div><dt>Sumber</dt><dd>${lead.source || '—'}</dd></div>
            <div><dt>Diperbarui</dt><dd>${fmtRelative(lead.updatedAt)}</dd></div>
          </dl>
          <section class="lead__work">
            <div class="lead__work-head"><h4>Tugas follow-up <span class="muted">${tasks.filter((t) => t.status !== 'done').length}</span></h4>
              <button type="button" class="btn btn--sm btn--ghost" data-lead-task>${ic.plus}<span>Tugas</span></button></div>
            ${tasks.length ? html`<ul class="todos card card--flush">${tasks.map((task) => taskRow(task, { showLead: false, compact: true }))}</ul>`
              : html`<p class="muted small">Belum ada tugas. Jadwalkan follow-up agar lead tidak terlewat.</p>`}
          </section>
          <section class="lead__work">
            <div class="lead__work-head"><h4>Penawaran <span class="muted">${quotes.length}</span></h4>
              <a class="btn btn--sm btn--ghost" href="#/quotes/new?lead=${lead.id}">${ic.plus}<span>Buat penawaran</span></a></div>
            ${quotes.length ? html`<ul class="feed">${quotes.map((q) => html`<li><a class="feed__row" href="#/quotes/${q.id}"><span class="feed__main"><b class="mono">${q.number}</b><small>${q.title}</small></span>
              <span class="feed__side"><b>${fmtMoney(q.total, q.currency)}</b>${badge(QUOTE_STATUS[q.status]?.label, QUOTE_STATUS[q.status]?.tone)}</span></a></li>`)}</ul>`
              : html`<p class="muted small">Belum ada penawaran untuk lead ini.</p>`}
          </section>
          <section><h4>Pesan</h4><blockquote class="lead__message">${lead.message}</blockquote></section>
          <section><h4>Catatan internal</h4>
            <textarea class="input" rows="3" data-note maxlength="2000" placeholder="Catatan hanya terlihat oleh tim…">${lead.note}</textarea>
            <div class="row row--end"><button type="button" class="btn btn--sm" data-save-note>Simpan catatan</button></div></section>
          ${lead.related?.length ? html`<section><h4>Permintaan lain dari email ini</h4><ul class="feed">${lead.related.map((r) => html`<li><button type="button" class="feed__row" data-related="${r.id}"><span class="feed__main"><b>${r.service || 'Konsultasi'}</b><small>${fmtDateTime(r.createdAt)}</small></span>${badge(LEAD_STATUS[r.status]?.label, LEAD_STATUS[r.status]?.tone)}</button></li>`)}</ul></section>` : ''}
          <section><h4>Riwayat & komentar</h4>
            <form class="comment" data-comment><textarea class="input" rows="2" name="message" maxlength="2000" placeholder="Tulis komentar atau hasil follow-up…" required></textarea><button class="btn btn--primary btn--sm" type="submit">${ic.send}<span>Kirim</span></button></form>
            <ul class="timeline">${[...lead.events].reverse().map((e) => html`
              <li class="timeline__item--${e.type}"><span class="timeline__icon">${ic[EVENT_ICON[e.type] ?? 'sparkle']}</span>
                <div><p><b>${e.userName ?? (e.type === 'created' || e.type === 'resubmitted' ? lead.name : 'Sistem')}</b> ${EVENT_TEXT[e.type]?.(e) ?? e.type}</p>
                ${e.message && e.type !== 'created' ? html`<div class="timeline__msg">${e.message}</div>` : ''}<small title="${fmtDateTime(e.createdAt)}">${fmtRelative(e.createdAt)}</small></div></li>`)}</ul>
          </section>
          <div class="lead__danger"><button type="button" class="btn btn--sm btn--danger-ghost" data-delete-lead>${ic.trash}<span>Hapus lead</span></button></div>
        </div>`);
    }
    async function update(changes, message = 'Lead diperbarui') {
      try { await api.updateLead(id, changes); toast(message); await refresh(); load(); ctx.refreshBadges(); } catch (error) { toast(errorMessage(error), 'danger'); }
    }
    ov.body.addEventListener('change', (event) => {
      const select = event.target.closest('[data-lead]');
      if (!select) return;
      const key = select.dataset.lead;
      update({ [key]: key === 'assignedTo' ? (select.value ? Number(select.value) : null) : select.value });
    });
    ov.body.addEventListener('click', async (event) => {
      const copy = event.target.closest('[data-copy]');
      if (copy) copyText(copy.dataset.copy);
      if (event.target.closest('[data-save-note]')) update({ note: qs('[data-note]', ov.body).value }, 'Catatan disimpan');
      const related = event.target.closest('[data-related]');
      if (related) openLead(Number(related.dataset.related));
      if (event.target.closest('[data-lead-task]')) {
        const saved = await openTaskEditor({ user: ctx.user, defaults: { leadId: id, leadName: lead.name, leadCompany: lead.company } });
        if (saved) { await refresh(); ctx.refreshBadges(); }
        return;
      }
      const toggle = event.target.closest('[data-toggle-task]');
      if (toggle) {
        const done = toggle.getAttribute('aria-pressed') !== 'true';
        toggle.closest('.todo')?.classList.toggle('is-done', done);
        try { await toggleTask(Number(toggle.dataset.toggleTask), done); toast(done ? 'Tugas selesai ✓' : 'Tugas dibuka kembali'); ctx.refreshBadges(); await refresh(); } catch (error) { toast(errorMessage(error), 'danger'); await refresh(); }
        return;
      }
      const taskEl = event.target.closest('[data-task]');
      if (taskEl && !event.target.closest('a')) {
        const task = tasks.find((x) => x.id === Number(taskEl.dataset.task));
        const saved = task && await openTaskEditor({ task, user: ctx.user });
        if (saved) { await refresh(); ctx.refreshBadges(); }
        return;
      }
      if (event.target.closest('[data-delete-lead]')) {
        if (!(await confirmDialog({ title: 'Hapus lead?', message: `Lead dari ${lead.name} beserta riwayatnya akan dihapus permanen.` }))) return;
        try { await api.deleteLead(id); toast('Lead dihapus'); ov.close(); load(); ctx.refreshBadges(); } catch (error) { toast(errorMessage(error), 'danger'); }
      }
    });
    ov.body.addEventListener('submit', async (event) => {
      event.preventDefault();
      const textarea = event.target.elements.message;
      const message = textarea.value.trim();
      if (!message) return;
      try { await api.commentLead(id, message); await refresh(); toast('Komentar ditambahkan'); } catch (error) { toast(errorMessage(error), 'danger'); }
    });
    await refresh();
  }

  /* Events ------------------------------------------------------------- */
  const reload = () => { f.page = 1; selected.clear(); sync(); load(); };
  const search = debounce(() => reload(), 300);
  ctx.root.addEventListener('input', (event) => {
    const input = event.target.closest('[data-f]');
    if (input?.dataset.f === 'q') { f.q = input.value.trim(); search(); }
  });
  ctx.root.addEventListener('change', (event) => {
    const input = event.target.closest('[data-f]');
    if (input && input.dataset.f !== 'q') { f[input.dataset.f] = input.value; reload(); return; }
    const check = event.target.closest('[data-check]');
    if (check) { const id = Number(check.dataset.check); if (check.checked) selected.add(id); else selected.delete(id); paintBulk(); return; }
    if (event.target.closest('[data-check-all]')) {
      data.items.forEach((l) => (event.target.checked ? selected.add(l.id) : selected.delete(l.id)));
      qsa('[data-check]', ctx.root).forEach((c) => { c.checked = event.target.checked; });
      paintBulk();
      return;
    }
    const bulkSelect = event.target.closest('[data-bulk-action]');
    if (bulkSelect?.value) bulk(bulkSelect.dataset.bulkAction, bulkSelect.value);
  });
  ctx.root.addEventListener('click', async (event) => {
    const t = event.target;
    const view = t.closest('[data-view]');
    if (view) { f.view = view.dataset.view; selected.clear(); sync(); shell(); load(); return; }
    if (t.closest('[data-reset]')) { Object.assign(f, DEFAULTS, { view: f.view }); sync(); shell(); load(); return; }
    if (t.closest('[data-retry]')) { load(); return; }
    const page = t.closest('[data-page]');
    if (page && !page.disabled) { f.page = Number(page.dataset.page); sync(); load(); return; }
    if (t.closest('[data-bulk-clear]')) { selected.clear(); qsa('[data-check], [data-check-all]', ctx.root).forEach((c) => { c.checked = false; }); paintBulk(); return; }
    if (t.closest('[data-bulk-delete]')) {
      if (await confirmDialog({ title: `Hapus ${selected.size} lead?`, message: 'Tindakan ini permanen dan tidak dapat dibatalkan.' })) bulk('delete');
      return;
    }
    if (t.closest('input, select, a, button, label')) return;
    const row = t.closest('[data-open]');
    if (row) openLead(Number(row.dataset.open));
  });
  ctx.root.addEventListener('keydown', (event) => {
    const card = event.target.closest('[data-open]');
    if (card && event.key === 'Enter') openLead(Number(card.dataset.open));
  });

  // Kanban drag & drop.
  let dragId = null;
  ctx.root.addEventListener('dragstart', (event) => {
    const card = event.target.closest('[data-drag]');
    if (!card) return;
    dragId = Number(card.dataset.drag);
    card.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(dragId));
  });
  ctx.root.addEventListener('dragend', (event) => { event.target.closest?.('[data-drag]')?.classList.remove('is-dragging'); qsa('.is-over', ctx.root).forEach((el) => el.classList.remove('is-over')); });
  ctx.root.addEventListener('dragover', (event) => {
    const zone = event.target.closest('[data-drop]');
    if (!zone || dragId === null) return;
    event.preventDefault();
    qsa('.is-over', ctx.root).forEach((el) => el !== zone && el.classList.remove('is-over'));
    zone.classList.add('is-over');
  });
  ctx.root.addEventListener('drop', async (event) => {
    const zone = event.target.closest('[data-drop]');
    if (!zone || dragId === null) return;
    event.preventDefault();
    const id = dragId;
    dragId = null;
    const status = zone.dataset.drop;
    const card = qs(`[data-drag="${id}"]`, ctx.root);
    if (card?.closest('[data-drop]') === zone) return;
    zone.prepend(card);
    try { await api.updateLead(id, { status }); toast(`Dipindah ke ${LEAD_STATUS[status].label}`); ctx.refreshBadges(); } catch (error) { toast(errorMessage(error), 'danger'); }
    load();
  });

  try { meta = await api.leadMeta(); } catch { /* filters still work without meta */ }
  shell();
  await load();
  if (ctx.params[0]) openLead(Number(ctx.params[0]));
  return { destroy() { drawer?.close(); } };
}
