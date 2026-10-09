/** Media library picker dialog (browse, search, upload). Resolves the chosen URL or null. */
import { api, fileToBase64 } from './api.js';
import { ic } from './icons.js';
import { debounce, emptyState, errorMessage, fmtBytes, html, overlay, qs, render, toast } from './ui.js';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
const MAX_BYTES = 5 * 1024 * 1024;

/** Uploads files sequentially; returns created media items. */
export async function uploadFiles(files, onProgress) {
  const created = [];
  for (const [index, file] of [...files].entries()) {
    onProgress?.(index, files.length, file);
    if (!ACCEPT.split(',').includes(file.type)) { toast(`${file.name}: format tidak didukung`, 'danger'); continue; }
    if (file.size > MAX_BYTES) { toast(`${file.name}: ukuran maksimal 5 MB`, 'danger'); continue; }
    try {
      const data = await fileToBase64(file);
      created.push(await api.uploadMedia({ filename: file.name, alt: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), data }));
    } catch (error) {
      toast(`${file.name}: ${errorMessage(error)}`, 'danger');
    }
  }
  return created;
}

export function openMediaPicker() {
  return new Promise((resolve) => {
    let chosen = null;
    const state = { q: '', page: 1, data: null, busy: false };
    const ov = overlay({ title: 'Pustaka media', size: 'lg', onClose: () => resolve(chosen) });

    function view() {
      const items = state.data?.items ?? [];
      return html`
        <div class="picker">
          <div class="toolbar">
            <label class="search">${ic.search}<input type="search" class="input" placeholder="Cari nama atau alt…" value="${state.q}" data-q></label>
            <label class="btn btn--primary">${ic.upload}<span>${state.busy ? 'Mengunggah…' : 'Unggah'}</span><input type="file" accept="${ACCEPT}" multiple hidden data-upload></label>
          </div>
          <div class="dropzone" data-drop>${ic.upload}<span>Seret & lepas gambar di sini (JPG, PNG, WebP, GIF · maks 5 MB)</span></div>
          ${!state.data ? html`<div class="skeleton skeleton--grid"><i></i><i></i><i></i><i></i></div>`
            : items.length ? html`<div class="media-grid">${items.map((m) => html`
                <button type="button" class="media-tile" data-pick="${m.url}" title="${m.originalName}">
                  <img src="${m.url}" alt="${m.alt}" loading="lazy"><span>${m.originalName}<small>${m.width}×${m.height} · ${fmtBytes(m.size)}</small></span>
                </button>`)}</div>`
              : emptyState('Belum ada media', 'Unggah gambar pertama Anda untuk digunakan di situs.')}
          ${state.data?.pagination?.totalPages > 1 ? html`<div class="pager"><span>Hal. ${state.page}/${state.data.pagination.totalPages}</span><div class="pager__btns">
            <button type="button" class="btn btn--icon btn--sm" data-page="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''}>${ic.left}</button>
            <button type="button" class="btn btn--icon btn--sm" data-page="${state.page + 1}" ${state.page >= state.data.pagination.totalPages ? 'disabled' : ''}>${ic.right}</button></div></div>` : ''}
          <details class="picker__manual"><summary>Gunakan URL manual</summary>
            <form class="row" data-manual><input class="input" name="url" placeholder="/assets/img/… atau https://…"><button class="btn" type="submit">Pakai</button></form>
          </details>
        </div>`;
    }

    const paint = () => {
      const focusQ = document.activeElement?.matches?.('[data-q]');
      render(ov.body, view());
      if (focusQ) { const q = qs('[data-q]', ov.body); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    };
    async function load() {
      try { state.data = await api.media({ q: state.q, page: state.page, pageSize: 24 }); } catch (error) { toast(errorMessage(error), 'danger'); state.data = { items: [] }; }
      paint();
    }
    async function upload(files) {
      if (!files?.length) return;
      state.busy = true; paint();
      const created = await uploadFiles(files);
      state.busy = false;
      if (created.length === 1 && files.length === 1) { chosen = created[0].url; toast('Gambar diunggah'); ov.close(); return; }
      if (created.length) toast(`${created.length} gambar diunggah`);
      state.page = 1; load();
    }

    const search = debounce((q) => { state.q = q; state.page = 1; load(); }, 300);
    ov.body.addEventListener('input', (e) => { if (e.target.matches('[data-q]')) search(e.target.value); });
    ov.body.addEventListener('change', (e) => { if (e.target.matches('[data-upload]')) upload(e.target.files); });
    ov.body.addEventListener('click', (e) => {
      const tile = e.target.closest('[data-pick]');
      if (tile) { chosen = tile.dataset.pick; ov.close(); return; }
      const page = e.target.closest('[data-page]');
      if (page && !page.disabled) { state.page = Number(page.dataset.page); load(); }
    });
    ov.body.addEventListener('submit', (e) => {
      e.preventDefault();
      const url = new FormData(e.target).get('url')?.toString().trim();
      if (url) { chosen = url; ov.close(); }
    });
    ov.body.addEventListener('dragover', (e) => { if (e.target.closest('[data-drop]')) { e.preventDefault(); e.target.closest('[data-drop]').classList.add('is-over'); } });
    ov.body.addEventListener('dragleave', (e) => e.target.closest?.('[data-drop]')?.classList.remove('is-over'));
    ov.body.addEventListener('drop', (e) => { if (e.target.closest('[data-drop]')) { e.preventDefault(); upload(e.dataTransfer.files); } });
    paint();
    load();
  });
}
