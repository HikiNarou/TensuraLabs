import { api } from '../api.js';
import { ic } from '../icons.js';
import {
  badge, confirmDialog, debounce, emptyState, errorBox, errorMessage, fmtDate, fmtMoney, fmtMoneyShort, fmtNumber, fmtRelative,
  html, loading, pager, QUOTE_STATUS, qs, qsa, render, toast,
} from '../ui.js';

const TABS = [['all', 'Semua'], ['open', 'Aktif'], ['draft', 'Draf'], ['sent', 'Terkirim'], ['accepted', 'Diterima'], ['rejected', 'Ditolak']];
const SORTS = [['updated', 'Terakhir diubah'], ['newest', 'Terbaru dibuat'], ['total', 'Nilai terbesar'], ['validity', 'Masa berlaku']];
const DEFAULTS = { status: 'all', q: '', sort: 'updated', page: 1 };
const DEFAULT_TERMS = 'Pembayaran 50% di muka, 50% setelah serah terima.\nHarga belum termasuk biaya pihak ketiga (domain, hosting, lisensi) kecuali disebutkan.\nRevisi minor termasuk selama 30 hari setelah rilis.';
const UNITS = ['paket', 'bulan', 'jam', 'hari', 'halaman', 'modul', 'unit'];

/** Mirrors the server's integer-safe totals so the editor preview matches the saved document. */
export function computeTotals({ items, discountPct = 0, taxPct = 0 }) {
  const lines = items.map((item) => ({ ...item, amount: Math.round((Number(item.qty) || 0) * (Number(item.unitPrice) || 0)) }));
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  const discountAmount = Math.round((subtotal * (Number(discountPct) || 0)) / 100);
  const taxAmount = Math.round(((subtotal - discountAmount) * (Number(taxPct) || 0)) / 100);
  return { lines, subtotal, discountAmount, taxAmount, total: subtotal - discountAmount + taxAmount };
}

const isoDay = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const pct = (n) => `${String(Number(n) || 0).replace('.', ',')}%`;
const statusBadge = (q) => html`${badge(QUOTE_STATUS[q.status]?.label ?? q.status, QUOTE_STATUS[q.status]?.tone)}${q.isExpired ? html` ${badge('Kedaluwarsa', 'warn')}` : ''}`;

/* Printable / read-only document -------------------------------------- */
function quoteDocument(quote, site) {
  const brand = site?.brand ?? {};
  const contact = site?.contact ?? {};
  const cur = quote.currency;
  return html`
    <article class="qdoc" aria-label="Dokumen penawaran ${quote.number}">
      <header class="qdoc__head">
        <div class="qdoc__brand"><span class="qdoc__logo">${ic.logo}</span>
          <div><b>${brand.name || 'TensuraLabs'}</b>${brand.legalName ? html`<small>${brand.legalName}</small>` : ''}
            <small>${[contact.email, contact.phone].filter(Boolean).join(' · ')}</small>${contact.address ? html`<small>${contact.address}</small>` : ''}</div></div>
        <div class="qdoc__title"><span>Penawaran harga</span><b>${quote.number}</b>
          <small>Tanggal: ${fmtDate(quote.sentAt ?? quote.createdAt)}</small>${quote.validUntil ? html`<small>Berlaku s/d: ${fmtDate(`${quote.validUntil}T00:00:00`)}</small>` : ''}</div>
      </header>
      <section class="qdoc__parties">
        <div><span class="qdoc__label">Ditujukan kepada</span><b>${quote.clientName}</b>${quote.clientCompany ? html`<span>${quote.clientCompany}</span>` : ''}${quote.clientEmail ? html`<span>${quote.clientEmail}</span>` : ''}</div>
        <div><span class="qdoc__label">Perihal</span><b>${quote.title}</b><span class="qdoc__status">${statusBadge(quote)}</span></div>
      </section>
      <div class="table-wrap"><table class="table qdoc__items">
        <thead><tr><th class="qdoc__no">#</th><th>Deskripsi</th><th class="num">Jumlah</th><th class="num">Harga satuan</th><th class="num">Total</th></tr></thead>
        <tbody>${quote.items.map((item, i) => html`<tr><td class="qdoc__no">${i + 1}</td><td>${item.description}</td>
          <td class="num nowrap">${fmtNumber(item.qty)} ${item.unit}</td><td class="num nowrap">${fmtMoney(item.unitPrice, cur)}</td><td class="num nowrap">${fmtMoney(item.amount, cur)}</td></tr>`)}</tbody>
      </table></div>
      <dl class="qdoc__totals">
        <div><dt>Subtotal</dt><dd>${fmtMoney(quote.subtotal, cur)}</dd></div>
        ${quote.discountPct ? html`<div><dt>Diskon ${pct(quote.discountPct)}</dt><dd>− ${fmtMoney(quote.discountAmount, cur)}</dd></div>` : ''}
        ${quote.taxPct ? html`<div><dt>PPN ${pct(quote.taxPct)}</dt><dd>${fmtMoney(quote.taxAmount, cur)}</dd></div>` : ''}
        <div class="qdoc__grand"><dt>Total</dt><dd>${fmtMoney(quote.total, cur)}</dd></div>
      </dl>
      ${quote.notes ? html`<section class="qdoc__block"><span class="qdoc__label">Catatan</span><p>${quote.notes}</p></section>` : ''}
      ${quote.terms ? html`<section class="qdoc__block"><span class="qdoc__label">Syarat & ketentuan</span><p>${quote.terms}</p></section>` : ''}
      <footer class="qdoc__sign"><div><span>Hormat kami,</span><i></i><b>${brand.name || 'TensuraLabs'}</b></div><div><span>Disetujui oleh,</span><i></i><b>${quote.clientName}</b></div></footer>
    </article>`;
}

/* List ------------------------------------------------------------------ */
async function mountList(ctx) {
  ctx.setTitle('Penawaran');
  const f = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) if (ctx.query.has(key)) f[key] = key === 'page' ? Number(ctx.query.get(key)) || 1 : ctx.query.get(key);
  const sync = () => ctx.setQuery(Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== DEFAULTS[k])));

  render(ctx.root, html`
    <div class="page-head">
      <div><h2>Penawaran</h2><p class="muted">Susun proposal harga, kirim ke klien, dan pantau nilai pipeline hingga deal.</p></div>
      <a class="btn btn--primary" href="#/quotes/new">${ic.plus}<span>Penawaran baru</span></a>
    </div>
    <div class="grid grid--kpi" data-summary>${loading(1)}</div>
    <div class="tabs" role="tablist">${TABS.map(([key, label]) => html`<button type="button" role="tab" class="tab ${f.status === key ? 'is-active' : ''}" aria-selected="${f.status === key}" data-tab="${key}">${label}<span class="tab__count" data-count="${key}"></span></button>`)}</div>
    <div class="card filters">
      <label class="search">${ic.search}<input type="search" class="input" placeholder="Cari nomor, klien, perusahaan…" value="${f.q}" data-f="q"></label>
      <select class="input" data-f="sort" aria-label="Urutkan">${SORTS.map(([v, l]) => html`<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`)}</select>
    </div>
    <div data-results>${loading(6)}</div>`);

  function paintSummary(s) {
    const tile = (label, value, icon, tone, foot) => html`<div class="card kpi"><div class="kpi__top"><span class="kpi__icon kpi__icon--${tone}">${ic[icon]}</span><span class="kpi__label">${label}</span></div><div class="kpi__value">${value}</div><div class="kpi__foot"><span class="muted">${foot}</span></div></div>`;
    render(qs('[data-summary]', ctx.root), html`
      ${tile('Pipeline aktif', fmtMoneyShort(s.pipeline), 'trend', 'accent', `${fmtNumber(s.byStatus.sent)} penawaran terkirim`)}
      ${tile('Nilai deal', fmtMoneyShort(s.won), 'coins', 'ok', `${fmtNumber(s.byStatus.accepted)} penawaran diterima`)}
      ${tile('Tingkat penerimaan', s.acceptanceRate === null ? '—' : pct(s.acceptanceRate), 'bolt', 'warn', 'diterima / diputuskan')}
      ${tile('Draf', fmtNumber(s.byStatus.draft), 'edit', 'violet', 'belum dikirim')}`);
    const counts = { ...s.byStatus, all: Object.values(s.byStatus).reduce((a, b) => a + b, 0), open: s.byStatus.draft + s.byStatus.sent };
    qsa('[data-count]', ctx.root).forEach((el) => { el.textContent = counts[el.dataset.count] ? String(counts[el.dataset.count]) : ''; });
  }

  async function load() {
    const results = qs('[data-results]', ctx.root);
    try {
      const data = await api.quotes({ ...f, pageSize: 25 });
      paintSummary(data.summary);
      if (!data.items.length) {
        render(results, emptyState(f.q || f.status !== 'all' ? 'Tidak ada penawaran yang cocok' : 'Belum ada penawaran',
          f.q || f.status !== 'all' ? 'Coba ubah filter atau kata kunci.' : 'Buat penawaran pertama Anda — bisa langsung dari detail lead.',
          html`<a class="btn btn--primary" href="#/quotes/new">${ic.plus}<span>Penawaran baru</span></a>`));
        return;
      }
      render(results, html`
        <div class="card card--flush"><div class="table-wrap"><table class="table table--hover table--quotes">
          <thead><tr><th>Nomor</th><th>Klien & perihal</th><th class="num">Total</th><th>Status</th><th class="hide-sm">Berlaku s/d</th><th class="hide-sm">Diubah</th></tr></thead>
          <tbody>${data.items.map((q) => html`<tr data-href="#/quotes/${q.id}" tabindex="0">
            <td class="nowrap"><b class="mono">${q.number}</b></td>
            <td><div class="cell-quote"><b>${q.clientName}${q.clientCompany ? html` <span class="muted">· ${q.clientCompany}</span>` : ''}</b><small>${q.title}</small></div></td>
            <td class="num nowrap"><b>${fmtMoney(q.total, q.currency)}</b></td>
            <td class="nowrap">${statusBadge(q)}</td>
            <td class="hide-sm nowrap">${q.validUntil ? fmtDate(`${q.validUntil}T00:00:00`) : html`<span class="muted">—</span>`}</td>
            <td class="hide-sm nowrap muted">${fmtRelative(q.updatedAt)}</td></tr>`)}</tbody>
        </table></div></div>
        ${pager(data.pagination)}`);
    } catch (error) { render(results, errorBox(error)); }
  }

  const search = debounce(() => { f.page = 1; sync(); load(); }, 300);
  ctx.root.addEventListener('input', (e) => { if (e.target.matches('[data-f="q"]')) { f.q = e.target.value.trim(); search(); } });
  ctx.root.addEventListener('change', (e) => { if (e.target.matches('[data-f="sort"]')) { f.sort = e.target.value; f.page = 1; sync(); load(); } });
  ctx.root.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      f.status = tab.dataset.tab; f.page = 1; sync();
      qsa('[data-tab]', ctx.root).forEach((b) => { const on = b === tab; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); });
      load(); return;
    }
    if (e.target.closest('[data-retry]')) { load(); return; }
    const page = e.target.closest('[data-page]');
    if (page && !page.disabled) { f.page = Number(page.dataset.page); sync(); load(); return; }
    const row = e.target.closest('[data-href]');
    if (row && !e.target.closest('a, button')) location.hash = row.dataset.href;
  });
  ctx.root.addEventListener('keydown', (e) => { const row = e.target.closest('[data-href]'); if (row && e.key === 'Enter') location.hash = row.dataset.href; });
  await load();
  return {};
}

/* Editor ---------------------------------------------------------------- */
async function mountEditor(ctx, quote) {
  const isNew = !quote;
  ctx.setTitle(isNew ? 'Penawaran baru' : `Edit ${quote.number}`);
  let leads = [];
  let value;
  try {
    leads = (await api.leads({ pageSize: 100, sort: 'updated' })).items;
  } catch { /* lead picker is optional */ }
  if (quote) value = structuredClone(quote);
  else {
    const leadId = Number(ctx.query.get('lead')) || null;
    let lead = leadId ? leads.find((l) => l.id === leadId) : null;
    if (leadId && !lead) lead = await api.lead(leadId).catch(() => null);
    value = {
      leadId: lead?.id ?? null, title: lead?.service ? `Proposal ${lead.service}` : '', clientName: lead?.name ?? '', clientEmail: lead?.email ?? '',
      clientCompany: lead?.company ?? '', currency: 'IDR', discountPct: 0, taxPct: 11, validUntil: isoDay(14), notes: '', terms: DEFAULT_TERMS,
      items: [{ description: lead?.service ? `Pengembangan ${lead.service}` : '', unit: 'paket', qty: 1, unitPrice: 0 }],
    };
    if (lead && !leads.some((l) => l.id === lead.id)) leads.unshift(lead);
  }
  let dirty = false;
  ctx.guard(() => dirty);

  const itemRow = (item, i) => html`
    <tr class="qitem" data-item="${i}">
      <td class="qitem__desc"><textarea class="input" rows="1" data-k="description" maxlength="300" placeholder="Deskripsi pekerjaan / deliverable" aria-label="Deskripsi item ${i + 1}">${item.description}</textarea></td>
      <td class="qitem__qty"><input class="input input--num" type="number" inputmode="decimal" min="0.01" step="0.01" data-k="qty" value="${item.qty}" aria-label="Jumlah"></td>
      <td class="qitem__unit"><input class="input" list="quote-units" data-k="unit" maxlength="20" value="${item.unit}" aria-label="Satuan"></td>
      <td class="qitem__price"><input class="input input--num" type="number" inputmode="numeric" min="0" step="1" data-k="unitPrice" value="${item.unitPrice}" aria-label="Harga satuan"></td>
      <td class="qitem__amount num" data-amount="${i}"></td>
      <td class="qitem__ops"><div class="row">
        <button type="button" class="btn btn--icon btn--ghost btn--sm" data-move="${i}:-1" aria-label="Naikkan" ${i === 0 ? 'disabled' : ''}>${ic.up}</button>
        <button type="button" class="btn btn--icon btn--ghost btn--sm" data-remove="${i}" aria-label="Hapus item" ${value.items.length === 1 ? 'disabled' : ''}>${ic.trash}</button></div></td>
    </tr>`;

  render(ctx.root, html`
    <div class="page-head page-head--sticky">
      <div><a class="link" href="#/quotes">← Penawaran</a><h2>${isNew ? 'Penawaran baru' : quote.number} ${quote ? statusBadge(quote) : ''}</h2></div>
      <div class="row row--wrap">
        ${quote ? html`<a class="btn" href="#/quotes/${quote.id}/print" target="_blank" rel="noopener">${ic.printer}<span class="hide-sm">Pratinjau</span></a>` : ''}
        <button type="button" class="btn" data-save>${ic.check}<span>Simpan draf</span></button>
        <button type="button" class="btn btn--primary" data-save-send>${ic.send}<span>Simpan & tandai terkirim</span></button>
      </div>
    </div>
    <form class="editor__layout quote-editor" novalidate>
      <div class="editor__main stack">
        <section class="card stack">
          <h3>Klien</h3>
          <label class="field"><span class="field__label">Terkait lead</span>
            <select class="input" name="leadId"><option value="">— Tanpa lead (klien langsung) —</option>
              ${leads.map((l) => html`<option value="${l.id}" ${value.leadId === l.id ? 'selected' : ''}>${l.name}${l.company ? ` · ${l.company}` : ''}${l.service ? ` — ${l.service}` : ''}</option>`)}</select>
            <small class="field__hint">Memilih lead mengisi data klien otomatis. Saat dikirim, lead pindah ke tahap Proposal; saat diterima, menjadi Deal.</small></label>
          <div class="form-grid">
            <label class="field"><span class="field__label">Nama klien</span><input class="input" name="clientName" maxlength="120" required value="${value.clientName}"></label>
            <label class="field"><span class="field__label">Perusahaan</span><input class="input" name="clientCompany" maxlength="120" value="${value.clientCompany}"></label>
            <label class="field field--wide"><span class="field__label">Email klien</span><input class="input" type="email" name="clientEmail" maxlength="254" value="${value.clientEmail}"></label>
          </div>
          <label class="field"><span class="field__label">Perihal / judul penawaran</span><input class="input input--lg" name="title" maxlength="160" required value="${value.title}" placeholder="mis. Pengembangan Website Company Profile"></label>
        </section>
        <section class="card card--flush">
          <header class="card__head card__head--pad"><h3>Item pekerjaan</h3><span class="muted small" data-count-items></span></header>
          <div class="table-wrap"><table class="table qitems">
            <thead><tr><th>Deskripsi</th><th class="num">Jml</th><th>Satuan</th><th class="num">Harga satuan</th><th class="num">Total</th><th><span class="visually-hidden">Aksi</span></th></tr></thead>
            <tbody data-items></tbody>
          </table></div>
          <datalist id="quote-units">${UNITS.map((u) => html`<option value="${u}"></option>`)}</datalist>
          <div class="qitems__foot"><button type="button" class="btn btn--dashed btn--sm" data-add-item>${ic.plus}<span>Tambah item</span></button></div>
        </section>
        <section class="card stack">
          <label class="field"><span class="field__label">Catatan untuk klien</span><textarea class="input" name="notes" rows="3" maxlength="3000" placeholder="Ruang lingkup, timeline, asumsi…">${value.notes}</textarea></label>
          <label class="field"><span class="field__label">Syarat & ketentuan</span><textarea class="input" name="terms" rows="4" maxlength="3000">${value.terms}</textarea></label>
        </section>
      </div>
      <aside class="editor__side stack">
        <section class="card stack quote-sum">
          <h3>Ringkasan</h3>
          <div class="form-grid form-grid--tight">
            <label class="field"><span class="field__label">Mata uang</span><select class="input" name="currency">${['IDR', 'USD'].map((c) => html`<option ${value.currency === c ? 'selected' : ''}>${c}</option>`)}</select></label>
            <label class="field"><span class="field__label">Berlaku s/d</span><input class="input" type="date" name="validUntil" value="${value.validUntil ?? ''}"></label>
            <label class="field"><span class="field__label">Diskon (%)</span><input class="input input--num" type="number" name="discountPct" min="0" max="100" step="0.1" value="${value.discountPct}"></label>
            <label class="field"><span class="field__label">PPN (%)</span><input class="input input--num" type="number" name="taxPct" min="0" max="100" step="0.1" value="${value.taxPct}"></label>
          </div>
          <dl class="qtotals" data-totals></dl>
          <p class="form-error" data-error hidden></p>
        </section>
        ${quote ? html`<section class="card stack">
          <h3>Lainnya</h3>
          <button type="button" class="btn btn--block" data-duplicate>${ic.copy}<span>Duplikat penawaran</span></button>
          <button type="button" class="btn btn--block btn--danger-ghost" data-delete>${ic.trash}<span>Hapus penawaran</span></button>
          <small class="muted">Dibuat ${fmtRelative(quote.createdAt)}${quote.creatorName ? ` oleh ${quote.creatorName}` : ''}.</small>
        </section>` : ''}
      </aside>
    </form>`);

  const form = qs('form', ctx.root);
  const tbody = qs('[data-items]', ctx.root);

  function readItems() {
    return qsa('[data-item]', tbody).map((row) => ({
      description: qs('[data-k="description"]', row).value.trim(),
      unit: qs('[data-k="unit"]', row).value.trim(),
      qty: Number(qs('[data-k="qty"]', row).value) || 0,
      unitPrice: Math.round(Number(qs('[data-k="unitPrice"]', row).value) || 0),
    }));
  }
  function paintItems() {
    render(tbody, html`${value.items.map(itemRow)}`);
    qsa('textarea[data-k="description"]', tbody).forEach(autosize);
    paintTotals();
  }
  function autosize(el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight + 2, 240)}px`; }
  function paintTotals() {
    value.items = readItems();
    const cur = form.elements.currency.value;
    const totals = computeTotals({ items: value.items, discountPct: form.elements.discountPct.value, taxPct: form.elements.taxPct.value });
    totals.lines.forEach((line, i) => { const cell = qs(`[data-amount="${i}"]`, tbody); if (cell) cell.textContent = fmtMoney(line.amount, cur); });
    qs('[data-count-items]', ctx.root).textContent = `${value.items.length} item`;
    render(qs('[data-totals]', ctx.root), html`
      <div><dt>Subtotal</dt><dd>${fmtMoney(totals.subtotal, cur)}</dd></div>
      <div><dt>Diskon</dt><dd>− ${fmtMoney(totals.discountAmount, cur)}</dd></div>
      <div><dt>PPN</dt><dd>${fmtMoney(totals.taxAmount, cur)}</dd></div>
      <div class="qtotals__grand"><dt>Total</dt><dd>${fmtMoney(totals.total, cur)}</dd></div>`);
  }
  function body() {
    const el = form.elements;
    return {
      leadId: el.leadId.value ? Number(el.leadId.value) : null,
      title: el.title.value.trim(), clientName: el.clientName.value.trim(), clientEmail: el.clientEmail.value.trim(), clientCompany: el.clientCompany.value.trim(),
      currency: el.currency.value, items: readItems(), discountPct: Number(el.discountPct.value) || 0, taxPct: Number(el.taxPct.value) || 0,
      validUntil: el.validUntil.value || null, notes: el.notes.value.trim(), terms: el.terms.value.trim(),
    };
  }
  function validate(data) {
    if (data.clientName.length < 2) return ['clientName', 'Nama klien minimal 2 karakter.'];
    if (data.title.length < 2) return ['title', 'Judul penawaran minimal 2 karakter.'];
    const bad = data.items.findIndex((it) => !it.description || it.qty <= 0);
    if (bad >= 0) return [null, `Item #${bad + 1}: isi deskripsi dan jumlah lebih dari 0.`];
    return null;
  }

  let busy = false;
  async function save(send = false) {
    if (busy) return;
    const data = body();
    const error = qs('[data-error]', ctx.root);
    const problem = validate(data);
    if (problem) {
      error.hidden = false; error.textContent = problem[1];
      if (problem[0]) form.elements[problem[0]].focus();
      toast(problem[1], 'danger');
      return;
    }
    error.hidden = true;
    busy = true;
    qsa('[data-save], [data-save-send]', ctx.root).forEach((b) => { b.disabled = true; });
    try {
      let saved = await api.saveQuote(quote?.id, data);
      if (send) saved = await api.quoteStatus(saved.id, 'sent');
      dirty = false;
      toast(send ? `${saved.number} ditandai terkirim` : isNew ? `Draf ${saved.number} dibuat` : 'Penawaran disimpan');
      ctx.navigate(`quotes/${saved.id}`);
    } catch (err) {
      error.hidden = false; error.textContent = errorMessage(err);
      toast(errorMessage(err), 'danger');
    } finally {
      busy = false;
      qsa('[data-save], [data-save-send]', ctx.root).forEach((b) => { b.disabled = false; });
    }
  }

  form.addEventListener('input', (e) => {
    dirty = true;
    if (e.target.matches('textarea[data-k]')) autosize(e.target);
    if (e.target.closest('[data-item]') || ['discountPct', 'taxPct'].includes(e.target.name)) paintTotals();
  });
  form.addEventListener('change', (e) => {
    dirty = true;
    if (e.target.name === 'currency') paintTotals();
    if (e.target.name === 'leadId' && e.target.value) {
      const lead = leads.find((l) => l.id === Number(e.target.value));
      if (!lead) return;
      const el = form.elements;
      el.clientName.value = lead.name ?? '';
      el.clientEmail.value = lead.email ?? '';
      el.clientCompany.value = lead.company ?? '';
      if (!el.title.value.trim() && lead.service) el.title.value = `Proposal ${lead.service}`;
    }
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); save(false); });
  ctx.root.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(false); }
  });
  ctx.root.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-save]')) { save(false); return; }
    if (t.closest('[data-save-send]')) {
      if (await confirmDialog({ title: 'Tandai sebagai terkirim?', message: 'Penawaran akan dikunci (tidak bisa diedit kecuali dikembalikan ke draf). Kirim dokumen PDF/cetak ke klien melalui email Anda.', confirm: 'Simpan & tandai', tone: 'primary' })) save(true);
      return;
    }
    if (t.closest('[data-add-item]')) {
      value.items = readItems();
      value.items.push({ description: '', unit: 'paket', qty: 1, unitPrice: 0 });
      dirty = true; paintItems();
      qsa('[data-k="description"]', tbody).at(-1)?.focus();
      return;
    }
    const remove = t.closest('[data-remove]');
    if (remove) { value.items = readItems(); value.items.splice(Number(remove.dataset.remove), 1); dirty = true; paintItems(); return; }
    const move = t.closest('[data-move]');
    if (move) {
      const [i, dir] = move.dataset.move.split(':').map(Number);
      value.items = readItems();
      const j = i + dir;
      if (j < 0 || j >= value.items.length) return;
      [value.items[i], value.items[j]] = [value.items[j], value.items[i]];
      dirty = true; paintItems(); return;
    }
    if (t.closest('[data-duplicate]')) { await duplicate(ctx, quote); return; }
    if (t.closest('[data-delete]')) { if (await remove_(ctx, quote)) dirty = false; }
  });

  paintItems();
  return { destroy() { dirty = false; } };
}

async function duplicate(ctx, quote) {
  try { const copy = await api.duplicateQuote(quote.id); toast(`Diduplikasi menjadi ${copy.number}`); ctx.navigate(`quotes/${copy.id}`); } catch (error) { toast(errorMessage(error), 'danger'); }
}
async function remove_(ctx, quote) {
  if (!(await confirmDialog({ title: `Hapus ${quote.number}?`, message: 'Penawaran akan dihapus permanen.' }))) return false;
  try { await api.deleteQuote(quote.id); toast('Penawaran dihapus'); ctx.guard(null); ctx.navigate('quotes'); return true; } catch (error) { toast(errorMessage(error), 'danger'); return false; }
}

/* Read-only detail (sent / accepted / rejected) ------------------------- */
async function mountDetail(ctx, quote, site) {
  ctx.setTitle(quote.number);
  const actions = {
    sent: [['accepted', 'Tandai diterima', 'btn--ok', 'check'], ['rejected', 'Tandai ditolak', 'btn--danger-ghost', 'x'], ['draft', 'Kembalikan ke draf', '', 'edit']],
    rejected: [['draft', 'Revisi sebagai draf', '', 'edit']],
    accepted: [],
  }[quote.status] ?? [];
  render(ctx.root, html`
    <div class="page-head page-head--sticky">
      <div><a class="link" href="#/quotes">← Penawaran</a><h2>${quote.number} ${statusBadge(quote)}</h2></div>
      <div class="row row--wrap">
        ${actions.map(([status, label, cls, icon]) => html`<button type="button" class="btn ${cls}" data-status="${status}">${ic[icon]}<span>${label}</span></button>`)}
        <a class="btn btn--primary" href="#/quotes/${quote.id}/print" target="_blank" rel="noopener">${ic.printer}<span>Cetak / PDF</span></a>
      </div>
    </div>
    <div class="editor__layout">
      <div class="editor__main"><div class="qdoc-wrap">${quoteDocument(quote, site)}</div></div>
      <aside class="editor__side stack">
        <section class="card stack">
          <h3>Status</h3>
          <ol class="qsteps">
            <li class="is-done"><b>Draf dibuat</b><small>${fmtDate(quote.createdAt)}${quote.creatorName ? ` · ${quote.creatorName}` : ''}</small></li>
            <li class="${quote.sentAt ? 'is-done' : ''}"><b>Terkirim</b><small>${quote.sentAt ? fmtDate(quote.sentAt) : '—'}</small></li>
            <li class="${quote.decidedAt ? `is-done is-${quote.status}` : ''}"><b>${quote.status === 'rejected' ? 'Ditolak' : 'Diterima'}</b><small>${quote.decidedAt ? fmtDate(quote.decidedAt) : 'Menunggu keputusan klien'}</small></li>
          </ol>
          ${quote.isExpired ? html`<div class="alert alert--warn">${ic.alert}<span>Masa berlaku sudah lewat. Perpanjang dengan mengembalikan ke draf.</span></div>` : ''}
          ${quote.leadId ? html`<a class="btn btn--block" href="#/leads/${quote.leadId}">${ic.leads}<span>Buka lead ${quote.leadName ?? ''}</span></a>` : ''}
          ${quote.clientEmail ? html`<a class="btn btn--block" href="mailto:${quote.clientEmail}?subject=${encodeURIComponent(`Penawaran ${quote.number} — ${quote.title}`)}">${ic.mail}<span>Email klien</span></a>` : ''}
        </section>
        <section class="card stack">
          <h3>Lainnya</h3>
          <button type="button" class="btn btn--block" data-duplicate>${ic.copy}<span>Duplikat sebagai draf baru</span></button>
          ${quote.status !== 'accepted' ? html`<button type="button" class="btn btn--block btn--danger-ghost" data-delete>${ic.trash}<span>Hapus penawaran</span></button>` : html`<small class="muted">Penawaran yang diterima disimpan permanen sebagai arsip.</small>`}
        </section>
      </aside>
    </div>`);
  const CONFIRM = {
    accepted: ['Tandai diterima?', 'Lead terkait akan dipindah ke tahap Deal. Status ini final.', 'Tandai diterima', 'ok'],
    rejected: ['Tandai ditolak?', 'Anda masih bisa merevisinya sebagai draf nanti.', 'Tandai ditolak', 'danger'],
    draft: ['Kembalikan ke draf?', 'Penawaran bisa diedit kembali, lalu dikirim ulang.', 'Kembalikan', 'primary'],
  };
  ctx.root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-status]');
    if (btn) {
      const [title, message, confirm, tone] = CONFIRM[btn.dataset.status];
      if (!(await confirmDialog({ title, message, confirm, tone }))) return;
      try { await api.quoteStatus(quote.id, btn.dataset.status); toast('Status diperbarui'); ctx.reload(); } catch (error) { toast(errorMessage(error), 'danger'); }
      return;
    }
    if (e.target.closest('[data-duplicate]')) { await duplicate(ctx, quote); return; }
    if (e.target.closest('[data-delete]')) await remove_(ctx, quote);
  });
  return {};
}

/* Print view -------------------------------------------------------------- */
function mountPrint(ctx, quote, site) {
  ctx.setTitle(`${quote.number} — ${quote.clientName}`);
  document.documentElement.classList.add('print-mode');
  render(ctx.root, html`
    <div class="print-bar">
      <a class="btn btn--ghost" href="#/quotes/${quote.id}">← Kembali</a>
      <span class="muted small">Gunakan "Simpan sebagai PDF" di dialog cetak untuk mengirim ke klien.</span>
      <button type="button" class="btn btn--primary" data-print>${ic.printer}<span>Cetak / PDF</span></button>
    </div>
    <div class="qdoc-wrap qdoc-wrap--print">${quoteDocument(quote, site)}</div>`);
  qs('[data-print]', ctx.root).addEventListener('click', () => window.print());
  const timer = setTimeout(() => window.print(), 450);
  return { destroy() { clearTimeout(timer); document.documentElement.classList.remove('print-mode'); } };
}

export async function mount(ctx) {
  const [param, sub] = ctx.params;
  if (!param) return mountList(ctx);
  if (param === 'new') return mountEditor(ctx, null);
  const id = Number(param);
  let quote; let site = null;
  try {
    [quote, site] = await Promise.all([api.quote(id), api.settings().then((s) => s.site?.value ?? null).catch(() => null)]);
  } catch (error) {
    render(ctx.root, html`${errorBox(error)}<p><a class="link" href="#/quotes">← Kembali ke daftar penawaran</a></p>`);
    return {};
  }
  if (sub === 'print') return mountPrint(ctx, quote, site);
  if (quote.status === 'draft') return mountEditor(ctx, quote);
  return mountDetail(ctx, quote, site);
}
