import { renderMarkdown } from '../../core/markdown.js';
import { api } from '../api.js';
import { ic } from '../icons.js';
import { openMediaPicker } from '../media-picker.js';
import {
  badge, CATEGORY_LABEL, confirmDialog, debounce, emptyState, errorBox, errorMessage, fmtDate, fmtDateTime, fmtNumber, fmtRelative,
  html, loading, pager, qs, qsa, render, toast, toLocalInput,
} from '../ui.js';

const STATUS_BADGE = {
  published: ['Terbit', 'ok'],
  draft: ['Draf', 'muted'],
  scheduled: ['Terjadwal', 'warn'],
};
const statusOf = (a) => (a.status === 'published' && a.scheduled ? 'scheduled' : a.status);

export async function mount(ctx) {
  const [param] = ctx.params;
  if (param === 'new' || /^\d+$/.test(param ?? '')) return mountEditor(ctx, param === 'new' ? null : Number(param));
  return mountList(ctx);
}

/* List ------------------------------------------------------------------- */
async function mountList(ctx) {
  ctx.setTitle('Artikel');
  const f = { lang: ctx.query.get('lang') ?? 'all', status: ctx.query.get('status') ?? 'all', category: ctx.query.get('category') ?? 'all', q: ctx.query.get('q') ?? '', page: Number(ctx.query.get('page')) || 1 };
  const selected = new Set();
  let data = null;

  render(ctx.root, html`
    <div class="page-head">
      <div><h2>Artikel</h2><p class="muted">Berita, pengumuman, dan acara dalam dua bahasa.</p></div>
      <a class="btn btn--primary" href="#/articles/new">${ic.plus}<span>Artikel baru</span></a>
    </div>
    <div class="card filters">
      <label class="search">${ic.search}<input type="search" class="input" placeholder="Cari judul atau ringkasan…" value="${f.q}" data-f="q"></label>
      <div class="segmented" role="group" aria-label="Status">${[['all', 'Semua'], ['published', 'Terbit'], ['scheduled', 'Terjadwal'], ['draft', 'Draf']].map(([v, l]) => html`<button type="button" data-status="${v}" class="${f.status === v ? 'is-active' : ''}">${l}</button>`)}</div>
      <select class="input" data-f="lang" aria-label="Bahasa"><option value="all">Semua bahasa</option><option value="id" ${f.lang === 'id' ? 'selected' : ''}>Indonesia</option><option value="en" ${f.lang === 'en' ? 'selected' : ''}>English</option></select>
      <select class="input" data-f="category" aria-label="Kategori"><option value="all">Semua kategori</option>${Object.entries(CATEGORY_LABEL).map(([k, v]) => html`<option value="${k}" ${f.category === k ? 'selected' : ''}>${v}</option>`)}</select>
    </div>
    <div class="bulkbar" data-bulk hidden></div>
    <div data-results>${loading(6)}</div>`);

  const sync = () => ctx.setQuery({ ...f, page: f.page > 1 ? f.page : '' });

  async function load() {
    const results = qs('[data-results]', ctx.root);
    try {
      data = await api.articles({ ...f, pageSize: 15 });
      render(results, data.items.length ? html`
        <div class="card card--flush"><div class="table-wrap"><table class="table table--hover">
          <thead><tr><th class="col-check"><input type="checkbox" data-check-all aria-label="Pilih semua" ${data.items.every((a) => selected.has(a.id)) ? 'checked' : ''}></th><th>Artikel</th><th>Kategori</th><th>Status</th><th class="num">Dilihat</th><th>Tanggal</th><th></th></tr></thead>
          <tbody>${data.items.map((a) => {
            const [label, tone] = STATUS_BADGE[statusOf(a)];
            return html`<tr data-open="${a.id}">
              <td class="col-check"><input type="checkbox" data-check="${a.id}" ${selected.has(a.id) ? 'checked' : ''} aria-label="Pilih"></td>
              <td><div class="cell-article"><img src="${a.cover}" alt="" loading="lazy"><span><b>${a.featured ? html`<i class="star" title="Unggulan">${ic.star}</i>` : ''}${a.title}</b><small><span class="locale">${a.locale.toUpperCase()}</span> /news/${a.slug}</small></span></div></td>
              <td>${CATEGORY_LABEL[a.category]}</td>
              <td>${badge(label, tone)}</td>
              <td class="num">${fmtNumber(a.views)}</td>
              <td class="nowrap" title="${fmtDateTime(a.publishedAt)}">${a.publishedAt ? fmtDate(a.publishedAt) : html`<span class="muted">diubah ${fmtRelative(a.updatedAt)}</span>`}</td>
              <td class="col-actions">
                ${a.status === 'published' && !a.scheduled ? html`<a class="btn btn--icon btn--ghost btn--sm" href="/news/${a.slug}?lang=${a.locale}" target="_blank" rel="noopener" aria-label="Lihat">${ic.external}</a>` : ''}
                <button type="button" class="btn btn--icon btn--ghost btn--sm" data-duplicate="${a.id}" aria-label="Duplikat">${ic.copy}</button>
              </td></tr>`;
          })}</tbody></table></div>${pager(data.pagination)}</div>`
        : emptyState('Belum ada artikel', 'Mulai menulis untuk mengisi halaman Berita.', html`<a class="btn btn--primary" href="#/articles/new">${ic.plus}<span>Tulis artikel</span></a>`));
      paintBulk();
    } catch (error) { render(results, errorBox(error)); }
  }

  function paintBulk() {
    const bar = qs('[data-bulk]', ctx.root);
    bar.hidden = !selected.size;
    if (!selected.size) return;
    render(bar, html`<b>${selected.size} dipilih</b>
      <button type="button" class="btn btn--sm" data-bulk="publish">Terbitkan</button>
      <button type="button" class="btn btn--sm" data-bulk="unpublish">Jadikan draf</button>
      <button type="button" class="btn btn--sm" data-bulk="feature">${ic.star}<span>Unggulkan</span></button>
      <button type="button" class="btn btn--sm" data-bulk="unfeature">Lepas unggulan</button>
      <button type="button" class="btn btn--sm btn--danger" data-bulk="delete">${ic.trash}<span>Hapus</span></button>
      <button type="button" class="btn btn--sm btn--ghost" data-bulk-clear>Batal</button>`);
  }

  const reload = () => { f.page = 1; selected.clear(); sync(); load(); };
  const search = debounce(reload, 300);
  ctx.root.addEventListener('input', (e) => { if (e.target.matches('[data-f="q"]')) { f.q = e.target.value.trim(); search(); } });
  ctx.root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-f]') && t.dataset.f !== 'q') { f[t.dataset.f] = t.value; reload(); return; }
    if (t.matches('[data-check]')) { const id = Number(t.dataset.check); if (t.checked) selected.add(id); else selected.delete(id); paintBulk(); return; }
    if (t.matches('[data-check-all]')) { data.items.forEach((a) => (t.checked ? selected.add(a.id) : selected.delete(a.id))); qsa('[data-check]', ctx.root).forEach((c) => { c.checked = t.checked; }); paintBulk(); }
  });
  ctx.root.addEventListener('click', async (e) => {
    const t = e.target;
    const status = t.closest('[data-status]');
    if (status) { f.status = status.dataset.status; qsa('[data-status]', ctx.root).forEach((b) => b.classList.toggle('is-active', b === status)); reload(); return; }
    const page = t.closest('[data-page]');
    if (page && !page.disabled) { f.page = Number(page.dataset.page); sync(); load(); return; }
    if (t.closest('[data-retry]')) { load(); return; }
    if (t.closest('[data-bulk-clear]')) { selected.clear(); load(); return; }
    const bulkButton = t.closest('[data-bulk]');
    if (bulkButton) {
      const action = bulkButton.dataset.bulk;
      if (action === 'delete' && !(await confirmDialog({ title: `Hapus ${selected.size} artikel?`, message: 'Artikel akan dihapus permanen.' }))) return;
      try { const r = await api.bulkArticles({ action, ids: [...selected] }); toast(`${r?.affected ?? selected.size} artikel diperbarui`); selected.clear(); load(); } catch (error) { toast(errorMessage(error), 'danger'); }
      return;
    }
    const dup = t.closest('[data-duplicate]');
    if (dup) {
      try { const copy = await api.duplicateArticle(Number(dup.dataset.duplicate)); toast('Artikel diduplikasi sebagai draf'); ctx.navigate(`articles/${copy.id}`); } catch (error) { toast(errorMessage(error), 'danger'); }
      return;
    }
    if (t.closest('input, a, button, label')) return;
    const row = t.closest('[data-open]');
    if (row) ctx.navigate(`articles/${row.dataset.open}`);
  });
  await load();
  return {};
}

/* Editor ----------------------------------------------------------------- */
const slugify = (text) => text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96);
const DRAFT_KEY = (id) => `tl.admin.article.${id ?? 'new'}`;
const TOOLBAR = [
  ['B', '**', '**', 'Tebal'], ['I', '_', '_', 'Miring'], ['H2', '\n## ', '', 'Judul'], ['H3', '\n### ', '', 'Subjudul'],
  ['•', '\n- ', '', 'Daftar'], ['1.', '\n1. ', '', 'Daftar bernomor'], ['❝', '\n> ', '', 'Kutipan'], ['</>', '`', '`', 'Kode'], ['🔗', '[', '](https://)', 'Tautan'],
];

async function mountEditor(ctx, id) {
  ctx.setTitle(id ? 'Edit artikel' : 'Artikel baru');
  let article;
  try {
    article = id ? await api.article(id) : { locale: 'id', category: 'news', title: '', slug: '', summary: '', body: '', cover: '/assets/img/news/cover-launch.jpg', status: 'draft', publishedAt: null, featured: false, translation: null };
  } catch (error) { render(ctx.root, errorBox(error)); return {}; }

  const model = { locale: article.locale, category: article.category, title: article.title, slug: article.slug, summary: article.summary, body: article.body, cover: article.cover, status: article.status, publishedAt: article.publishedAt, featured: !!article.featured };
  const saved = JSON.stringify(model);
  let slugTouched = !!id;
  let mode = 'split';
  let saving = false;

  // Offer to restore a local draft that is newer than the saved article.
  try {
    const local = JSON.parse(localStorage.getItem(DRAFT_KEY(id)) ?? 'null');
    if (local && JSON.stringify(local.model) !== saved && (!article.updatedAt || local.at > Date.parse(article.updatedAt))) {
      if (window.confirm(`Ditemukan draf lokal yang belum disimpan (${fmtRelative(new Date(local.at).toISOString())}). Pulihkan?`)) Object.assign(model, local.model);
      else localStorage.removeItem(DRAFT_KEY(id));
    }
  } catch { /* ignore corrupt drafts */ }

  const dirty = () => JSON.stringify(model) !== saved;
  ctx.guard(dirty);
  const words = () => (model.body.trim().match(/\S+/g) ?? []).length;

  render(ctx.root, html`
    <form class="editor" novalidate>
      <div class="page-head page-head--sticky">
        <div class="row"><a class="btn btn--icon btn--ghost" href="#/articles" aria-label="Kembali">${ic.left}</a>
          <div><h2>${id ? 'Edit artikel' : 'Artikel baru'}</h2><p class="muted small" data-save-state>${id ? `Terakhir diubah ${fmtRelative(article.updatedAt)}` : 'Belum disimpan'}</p></div></div>
        <div class="row">
          ${id && article.status === 'published' ? html`<a class="btn btn--ghost" href="/news/${article.slug}?lang=${article.locale}" target="_blank" rel="noopener">${ic.external}<span>Lihat</span></a>` : ''}
          ${id ? html`<button type="button" class="btn btn--ghost btn--danger-text" data-delete>${ic.trash}<span>Hapus</span></button>` : ''}
          <button type="submit" class="btn btn--primary" data-submit>${ic.check}<span>Simpan</span><kbd>Ctrl S</kbd></button>
        </div>
      </div>
      <div class="editor__layout">
        <div class="editor__main">
          <div class="card stack">
            <label class="field"><span class="field__label">Judul <small class="field__count" data-count="title"></small></span><input class="input input--lg" name="title" maxlength="160" value="${model.title}" placeholder="Judul artikel yang menarik" required></label>
            <label class="field"><span class="field__label">Ringkasan <small class="field__count" data-count="summary"></small></span><textarea class="input" name="summary" rows="2" maxlength="400" placeholder="1–2 kalimat untuk kartu berita & SEO">${model.summary}</textarea></label>
          </div>
          <div class="card card--flush md">
            <div class="md__bar">
              <div class="md__tools">${TOOLBAR.map(([label, before, after, title]) => html`<button type="button" class="md__tool" data-md="${encodeURIComponent(JSON.stringify([before, after]))}" title="${title}">${label}</button>`)}
                <button type="button" class="md__tool" data-insert-image title="Sisipkan gambar">${ic.image}</button></div>
              <div class="segmented segmented--sm">${[['write', 'Tulis'], ['split', 'Split'], ['preview', 'Pratinjau']].map(([v, l]) => html`<button type="button" data-mode="${v}" class="${mode === v ? 'is-active' : ''}">${l}</button>`)}</div>
            </div>
            <div class="md__panes" data-mode-panes="${mode}">
              <textarea class="md__input" name="body" spellcheck="true" placeholder="Tulis isi artikel dengan Markdown…">${model.body}</textarea>
              <div class="md__preview prose" data-preview></div>
            </div>
            <div class="md__foot"><span data-words></span><span>Markdown: **tebal**, _miring_, ## judul, - daftar, [tautan](https://…)</span></div>
          </div>
        </div>
        <aside class="editor__side">
          <div class="card stack">
            <h3>Publikasi</h3>
            <div class="segmented segmented--block">${[['draft', 'Draf'], ['published', 'Terbit']].map(([v, l]) => html`<button type="button" data-status="${v}" class="${model.status === v ? 'is-active' : ''}">${l}</button>`)}</div>
            <label class="field"><span class="field__label">Tanggal terbit</span><input class="input" type="datetime-local" name="publishedAt" value="${toLocalInput(model.publishedAt)}"><small class="field__hint" data-schedule-hint></small></label>
            <label class="toggle-row"><span><b>Artikel unggulan</b><small>Ditandai di daftar admin & API</small></span><span class="switch"><input type="checkbox" name="featured" ${model.featured ? 'checked' : ''}><i></i></span></label>
          </div>
          <div class="card stack">
            <h3>Detail</h3>
            <label class="field"><span class="field__label">Bahasa</span><select class="input" name="locale"><option value="id" ${model.locale === 'id' ? 'selected' : ''}>Indonesia</option><option value="en" ${model.locale === 'en' ? 'selected' : ''}>English</option></select></label>
            <label class="field"><span class="field__label">Kategori</span><select class="input" name="category">${Object.entries(CATEGORY_LABEL).map(([k, v]) => html`<option value="${k}" ${model.category === k ? 'selected' : ''}>${v}</option>`)}</select></label>
            <label class="field"><span class="field__label">Slug URL</span><div class="input-prefix"><span>/news/</span><input class="input" name="slug" value="${model.slug}" maxlength="96" placeholder="otomatis-dari-judul"></div></label>
            ${id ? html`<div class="translation">${ic.globe}<span>${article.translation
              ? html`Terjemahan ${article.translation.locale.toUpperCase()} tersedia · <a href="#/articles/${article.translation.id}">buka</a>`
              : html`Belum ada terjemahan · <button type="button" class="link" data-translate>buat versi ${article.locale === 'id' ? 'EN' : 'ID'}</button>`}</span></div>` : ''}
          </div>
          <div class="card stack">
            <h3>Gambar sampul</h3>
            <div class="cover" data-cover>${model.cover ? html`<img src="${model.cover}" alt="">` : ''}</div>
            <div class="row"><button type="button" class="btn btn--sm" data-pick-cover>${ic.image}<span>Pilih gambar</span></button></div>
            <input class="input" name="cover" value="${model.cover}" placeholder="/uploads/…">
          </div>
          <div class="card stack seo-preview">
            <h3>Pratinjau pencarian</h3>
            <div class="serp"><small data-serp-url></small><b data-serp-title></b><p data-serp-desc></p></div>
          </div>
        </aside>
      </div>
    </form>`);

  const form = qs('form', ctx.root);
  const body = form.elements.body;
  const preview = qs('[data-preview]', ctx.root);

  const renderPreview = debounce(() => { preview.innerHTML = model.body.trim() ? renderMarkdown(model.body) : '<p class="muted">Pratinjau akan muncul di sini.</p>'; }, 150);
  const persistLocal = debounce(() => {
    try { if (dirty()) localStorage.setItem(DRAFT_KEY(id), JSON.stringify({ at: Date.now(), model })); } catch { /* storage full */ }
  }, 800);

  function meta() {
    qs('[data-count="title"]', ctx.root).textContent = `${model.title.length}/160`;
    qs('[data-count="summary"]', ctx.root).textContent = `${model.summary.length}/400`;
    const n = words();
    qs('[data-words]', ctx.root).textContent = `${fmtNumber(n)} kata · ±${Math.max(1, Math.round(n / 200))} menit baca`;
    qs('[data-serp-url]', ctx.root).textContent = `${location.host}/news/${model.slug || slugify(model.title) || 'slug'}`;
    qs('[data-serp-title]', ctx.root).textContent = model.title || 'Judul artikel';
    qs('[data-serp-desc]', ctx.root).textContent = model.summary || 'Ringkasan artikel akan tampil di sini.';
    const hint = qs('[data-schedule-hint]', ctx.root);
    const when = model.publishedAt ? new Date(model.publishedAt) : null;
    hint.textContent = model.status === 'published'
      ? (when && when > new Date() ? `Terjadwal tayang ${fmtDateTime(model.publishedAt)}` : 'Tayang segera setelah disimpan')
      : 'Draf tidak tampil di situs publik';
    const state = qs('[data-save-state]', ctx.root);
    if (dirty()) state.textContent = 'Perubahan belum disimpan';
  }

  form.addEventListener('input', (e) => {
    const t = e.target;
    if (!t.name) return;
    if (t.name === 'featured') model.featured = t.checked;
    else if (t.name === 'publishedAt') model.publishedAt = t.value ? new Date(t.value).toISOString() : null;
    else model[t.name] = t.value;
    if (t.name === 'title' && !slugTouched) { model.slug = slugify(model.title); form.elements.slug.value = model.slug; }
    if (t.name === 'slug') slugTouched = true;
    if (t.name === 'cover') render(qs('[data-cover]', ctx.root), model.cover ? html`<img src="${model.cover}" alt="">` : '');
    if (t.name === 'body') renderPreview();
    meta();
    persistLocal();
  });
  form.addEventListener('change', () => meta());

  function surround(before, after) {
    const { selectionStart: s, selectionEnd: e, value } = body;
    const selected = value.slice(s, e) || (after === '](https://)' ? 'teks tautan' : '');
    body.setRangeText(`${before}${selected}${after}`, s, e, 'end');
    if (!value.slice(s, e) && selected) body.setSelectionRange(s + before.length, s + before.length + selected.length);
    body.focus();
    body.dispatchEvent(new Event('input', { bubbles: true }));
  }

  async function save() {
    if (saving) return;
    const payload = { ...model, slug: model.slug.trim(), publishedAt: model.publishedAt || null };
    if (payload.status === 'published' && !payload.publishedAt) payload.publishedAt = new Date().toISOString();
    saving = true;
    const button = qs('[data-submit]', ctx.root);
    button.disabled = true;
    try {
      const result = await api.saveArticle(id, payload);
      localStorage.removeItem(DRAFT_KEY(id));
      ctx.guard(() => false);
      toast(id ? 'Artikel disimpan' : 'Artikel dibuat');
      if (!id) { ctx.navigate(`articles/${result.id}`); return; }
      ctx.navigate(`articles/${result.id}?t=${Date.now()}`);
    } catch (error) {
      toast(errorMessage(error), 'danger');
      const field = error.details?.[0]?.field;
      if (field && form.elements[field]) form.elements[field].focus();
    } finally {
      saving = false;
      button.disabled = false;
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
  const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } };
  document.addEventListener('keydown', onKey);

  ctx.root.addEventListener('click', async (e) => {
    const t = e.target;
    const tool = t.closest('[data-md]');
    if (tool) { const [before, after] = JSON.parse(decodeURIComponent(tool.dataset.md)); surround(before, after); return; }
    if (t.closest('[data-insert-image]')) { const url = await openMediaPicker(); if (url) surround(`\n![deskripsi gambar](${url})\n`, ''); return; }
    const m = t.closest('[data-mode]');
    if (m) { mode = m.dataset.mode; qs('[data-mode-panes]', ctx.root).dataset.modePanes = mode; qsa('[data-mode]', ctx.root).forEach((b) => b.classList.toggle('is-active', b === m)); renderPreview(); return; }
    const st = t.closest('[data-status]');
    if (st) { model.status = st.dataset.status; qsa('[data-status]', ctx.root).forEach((b) => b.classList.toggle('is-active', b === st)); meta(); persistLocal(); return; }
    if (t.closest('[data-pick-cover]')) {
      const url = await openMediaPicker();
      if (url) { model.cover = url; form.elements.cover.value = url; render(qs('[data-cover]', ctx.root), html`<img src="${url}" alt="">`); meta(); }
      return;
    }
    if (t.closest('[data-translate]')) {
      if (dirty()) { toast('Simpan perubahan terlebih dahulu', 'warn'); return; }
      try { const copy = await api.duplicateArticle(id, article.locale === 'id' ? 'en' : 'id'); toast('Draf terjemahan dibuat — silakan terjemahkan isinya'); ctx.navigate(`articles/${copy.id}`); } catch (error) { toast(errorMessage(error), 'danger'); }
      return;
    }
    if (t.closest('[data-delete]')) {
      if (!(await confirmDialog({ title: 'Hapus artikel?', message: `"${article.title}" akan dihapus permanen.` }))) return;
      try { await api.deleteArticle(id); localStorage.removeItem(DRAFT_KEY(id)); ctx.guard(() => false); toast('Artikel dihapus'); ctx.navigate('articles'); } catch (error) { toast(errorMessage(error), 'danger'); }
    }
  });

  renderPreview();
  meta();
  return { destroy() { document.removeEventListener('keydown', onKey); } };
}
