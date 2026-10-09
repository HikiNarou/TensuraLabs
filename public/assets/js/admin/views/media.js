import { api } from '../api.js';
import { ic } from '../icons.js';
import { uploadFiles } from '../media-picker.js';
import { confirmDialog, copyText, debounce, emptyState, errorBox, errorMessage, fmtBytes, fmtDateTime, html, loading, overlay, pager, qs, render, toast } from '../ui.js';

const USAGE_LABEL = { articles: 'Artikel', squad: 'Tim', portfolio: 'Portofolio', gazette: 'Kabar Guild', settings: 'Pengaturan' };

export async function mount(ctx) {
  ctx.setTitle('Media');
  const f = { q: ctx.query.get('q') ?? '', page: Number(ctx.query.get('page')) || 1 };
  let data = null;
  let uploading = '';

  render(ctx.root, html`
    <div class="page-head">
      <div><h2>Pustaka media</h2><p class="muted" data-summary>Gambar untuk artikel, tim, portofolio, dan tampilan situs.</p></div>
      <label class="btn btn--primary">${ic.upload}<span>Unggah gambar</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden data-upload></label>
    </div>
    <div class="dropzone dropzone--lg" data-drop>${ic.upload}<div><b>Seret & lepas gambar ke sini</b><small>JPG, PNG, WebP, atau GIF · maksimal 5 MB per file · SVG tidak diizinkan demi keamanan</small></div><span data-progress></span></div>
    <div class="card filters"><label class="search">${ic.search}<input type="search" class="input" placeholder="Cari nama file atau teks alt…" value="${f.q}" data-q></label></div>
    <div data-results>${loading(4)}</div>`);

  async function load() {
    const results = qs('[data-results]', ctx.root);
    try {
      data = await api.media({ ...f, pageSize: 30 });
      qs('[data-summary]', ctx.root).textContent = `${data.pagination.total} file · ${fmtBytes(data.totalBytes)} total`;
      render(results, data.items.length ? html`
        <div class="media-grid media-grid--lg">${data.items.map((m) => html`
          <button type="button" class="media-tile" data-open="${m.id}">
            <img src="${m.url}" alt="${m.alt}" loading="lazy"><span>${m.originalName}<small>${m.width}×${m.height} · ${fmtBytes(m.size)}</small></span>
          </button>`)}</div>${pager(data.pagination)}`
        : emptyState(f.q ? 'Tidak ditemukan' : 'Belum ada media', f.q ? 'Coba kata kunci lain.' : 'Unggah gambar pertama Anda.'));
    } catch (error) { render(results, errorBox(error)); }
  }

  async function upload(files) {
    if (!files?.length) return;
    const progress = qs('[data-progress]', ctx.root);
    const created = await uploadFiles(files, (i, n) => { uploading = `Mengunggah ${i + 1}/${n}…`; progress.textContent = uploading; });
    progress.textContent = '';
    if (created.length) toast(`${created.length} gambar diunggah`);
    f.page = 1;
    load();
  }

  async function openDetail(id) {
    const ov = overlay({ kind: 'drawer', title: 'Detail media' });
    ov.setContent(loading(5));
    let item;
    try { item = await api.mediaItem(id); } catch (error) { ov.setContent(errorBox(error)); return; }
    const absolute = `${location.origin}${item.url}`;
    ov.setContent(html`
      <div class="stack">
        <div class="media-detail__img"><img src="${item.url}" alt="${item.alt}"></div>
        <dl class="dl">
          <div><dt>Nama asli</dt><dd>${item.originalName}</dd></div>
          <div><dt>Dimensi</dt><dd>${item.width}×${item.height}px</dd></div>
          <div><dt>Ukuran</dt><dd>${fmtBytes(item.size)} · ${item.mime}</dd></div>
          <div><dt>Diunggah</dt><dd>${fmtDateTime(item.createdAt)}${item.uploadedBy ? ` · ${item.uploadedBy}` : ''}</dd></div>
        </dl>
        <label class="field"><span class="field__label">URL</span><div class="input-group"><input class="input" readonly value="${item.url}"><button type="button" class="btn" data-copy="${item.url}">${ic.copy}<span>Salin</span></button></div></label>
        <form class="field" data-alt><span class="field__label">Teks alternatif (aksesibilitas & SEO)</span><div class="input-group"><input class="input" name="alt" maxlength="200" value="${item.alt}"><button class="btn" type="submit">Simpan</button></div></form>
        <div class="usage"><span class="field__label">Dipakai di</span>${item.usage.total
          ? html`<ul class="chips">${Object.entries(USAGE_LABEL).filter(([k]) => item.usage[k]).map(([k, label]) => html`<li class="chip">${label} · ${item.usage[k]}</li>`)}</ul>`
          : html`<p class="muted small">Tidak dipakai di mana pun.</p>`}</div>
        <div class="row row--between"><a class="btn btn--ghost" href="${item.url}" target="_blank" rel="noopener">${ic.external}<span>Buka</span></a>
          <button type="button" class="btn btn--danger-ghost" data-del>${ic.trash}<span>Hapus</span></button></div>
      </div>`);
    ov.body.addEventListener('click', async (e) => {
      const copy = e.target.closest('[data-copy]');
      if (copy) copyText(copy.dataset.copy === item.url ? item.url : absolute);
      if (e.target.closest('[data-del]')) {
        const inUse = item.usage.total > 0;
        if (!(await confirmDialog({ title: 'Hapus media?', message: inUse ? `Gambar ini masih dipakai di ${item.usage.total} tempat. Menghapusnya akan membuat gambar tersebut hilang dari situs.` : 'File akan dihapus permanen.' }))) return;
        try { await api.deleteMedia(item.id, inUse); toast('Media dihapus'); ov.close(); load(); } catch (error) { toast(errorMessage(error), 'danger'); }
      }
    });
    ov.body.addEventListener('submit', async (e) => {
      e.preventDefault();
      try { item = { ...item, ...(await api.updateMedia(item.id, e.target.elements.alt.value.trim())) }; toast('Teks alt disimpan'); load(); } catch (error) { toast(errorMessage(error), 'danger'); }
    });
  }

  const search = debounce(() => { f.page = 1; ctx.setQuery(f); load(); }, 300);
  ctx.root.addEventListener('input', (e) => { if (e.target.matches('[data-q]')) { f.q = e.target.value.trim(); search(); } });
  ctx.root.addEventListener('change', (e) => { if (e.target.matches('[data-upload]')) { upload(e.target.files); e.target.value = ''; } });
  ctx.root.addEventListener('click', (e) => {
    const tile = e.target.closest('[data-open]');
    if (tile) { openDetail(Number(tile.dataset.open)); return; }
    const page = e.target.closest('[data-page]');
    if (page && !page.disabled) { f.page = Number(page.dataset.page); ctx.setQuery({ ...f, page: f.page > 1 ? f.page : '' }); load(); }
    if (e.target.closest('[data-retry]')) load();
  });
  const zone = qs('[data-drop]', ctx.root);
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('is-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('is-over'); upload(e.dataTransfer.files); });
  await load();
  return {};
}
