import { api } from '../api.js';
import { createForm } from '../form.js';
import { ic } from '../icons.js';
import { badge, confirmDialog, emptyState, errorBox, errorMessage, html, loading, overlay, qs, qsa, render, toast } from '../ui.js';

const COLLECTIONS = {
  squad: {
    title: 'Tim', singular: 'anggota tim', subtitle: 'Profil peran yang tampil di bagian "Pengenalan Tim".', public: '/squad',
    image: (i) => i.avatar || i.portrait, name: (i) => i.content?.id?.title, sub: (i) => i.content?.id?.tag,
    schema: [
      { type: 'text', key: 'key', label: 'Kunci (unik)', max: 60, hint: 'huruf kecil & tanda hubung, mis. "developer"' },
      { type: 'color', key: 'accent', label: 'Warna aksen' },
      { type: 'image', key: 'portrait', label: 'Ilustrasi utama', hint: 'Disarankan WebP/PNG transparan, rasio potret.' },
      { type: 'image', key: 'avatar', label: 'Avatar (thumbnail)' },
      { type: 'toggle', key: 'isPublished', label: 'Tampilkan di situs', wide: true },
      { type: 'localized', key: 'content', fields: [
        { type: 'text', key: 'title', label: 'Nama peran', max: 40 },
        { type: 'text', key: 'tag', label: 'Label / spesialisasi', max: 80 },
        { type: 'textarea', key: 'quote', label: 'Kutipan', max: 300, rows: 2, wide: true },
        { type: 'list', key: 'description', label: 'Paragraf deskripsi', multiline: true, max: 800, maxItems: 6, addLabel: 'Tambah paragraf' },
        { type: 'pairs', key: 'skills', label: 'Statistik keahlian (0–100)', maxItems: 8, labels: ['Keahlian'] },
      ] },
    ],
    blank: () => ({ key: '', portrait: '', avatar: '', accent: '#5b6cff', isPublished: true, content: { id: { title: '', tag: '', quote: '', description: [''], skills: [] }, en: { title: '', tag: '', quote: '', description: [''], skills: [] } } }),
  },
  portfolio: {
    title: 'Portofolio', singular: 'proyek', subtitle: 'Proyek yang tampil di "Galeri Portofolio".', public: '/gallery',
    image: (i) => i.thumbnail, name: (i) => i.content?.id?.title, sub: (i) => `${i.projectDate} · ${i.stack?.slice(0, 3).join(', ')}`,
    schema: [
      { type: 'text', key: 'slug', label: 'Slug (unik)', max: 60 },
      { type: 'date', key: 'projectDate', label: 'Tanggal proyek' },
      { type: 'image', key: 'thumbnail', label: 'Gambar utama', hint: 'Rasio 16:10 disarankan.' },
      { type: 'list', key: 'stack', label: 'Tech stack', max: 30, maxItems: 12, addLabel: 'Tambah teknologi' },
      { type: 'text', key: 'projectUrl', label: 'URL proyek (opsional)', placeholder: 'https://…', inputType: 'url' },
      { type: 'text', key: 'videoUrl', label: 'Video YouTube embed (opsional)', placeholder: 'https://www.youtube-nocookie.com/embed/…' },
      { type: 'toggle', key: 'isPublished', label: 'Tampilkan di situs', wide: true },
      { type: 'localized', key: 'content', fields: [
        { type: 'text', key: 'title', label: 'Judul', max: 160, wide: true },
        { type: 'text', key: 'label', label: 'Label kategori', max: 60 },
        { type: 'textarea', key: 'summary', label: 'Ringkasan', max: 800, rows: 4, wide: true },
      ] },
    ],
    blank: () => ({ slug: '', thumbnail: '', projectDate: new Date().toISOString().slice(0, 10), stack: [], projectUrl: '', videoUrl: '', isPublished: true, content: { id: { title: '', label: '', summary: '' }, en: { title: '', label: '', summary: '' } } }),
  },
  gazette: {
    title: 'Kabar Guild', singular: 'edisi', subtitle: 'Edisi koran di halaman "Kabar Guild".', public: '/world',
    image: (i) => i.image, name: (i) => i.content?.id?.headline, sub: (i) => i.content?.id?.label,
    schema: [
      { type: 'text', key: 'key', label: 'Kunci (unik)', max: 60 },
      { type: 'toggle', key: 'isPublished', label: 'Tampilkan di situs' },
      { type: 'image', key: 'image', label: 'Gambar edisi' },
      { type: 'localized', key: 'content', fields: [
        { type: 'text', key: 'label', label: 'Label tab', max: 60 },
        { type: 'text', key: 'masthead', label: 'Masthead', max: 80 },
        { type: 'text', key: 'section', label: 'Rubrik', max: 60 },
        { type: 'text', key: 'headline', label: 'Headline', max: 160, wide: true },
        { type: 'textarea', key: 'deck', label: 'Deck / subjudul', max: 400, rows: 2, wide: true },
        { type: 'list', key: 'columns', label: 'Kolom artikel', multiline: true, max: 1500, maxItems: 4, addLabel: 'Tambah kolom' },
        { type: 'text', key: 'sidebarTitle', label: 'Judul sidebar', max: 60 },
        { type: 'list', key: 'sidebar', label: 'Butir sidebar', max: 120, maxItems: 8 },
      ] },
    ],
    blank: () => ({ key: '', image: '', isPublished: true, content: { id: { label: '', masthead: '', section: '', headline: '', deck: '', columns: [''], sidebarTitle: '', sidebar: [] }, en: { label: '', masthead: '', section: '', headline: '', deck: '', columns: [''], sidebarTitle: '', sidebar: [] } } }),
  },
};

const strip = ({ id, sortOrder, createdAt, updatedAt, ...rest }) => rest;

export async function mount(ctx) {
  const name = ctx.params[0];
  const config = COLLECTIONS[name];
  if (!config) { ctx.navigate('content/squad'); return {}; }
  ctx.setTitle(config.title);
  let items = [];
  let editor = null;

  async function load() {
    try { items = await api.content(name); paint(); } catch (error) { render(qs('[data-list]', ctx.root), errorBox(error)); }
  }

  render(ctx.root, html`
    <div class="page-head">
      <div><h2>${config.title}</h2><p class="muted">${config.subtitle} Seret untuk mengubah urutan.</p></div>
      <div class="row"><a class="btn btn--ghost" href="${config.public}" target="_blank" rel="noopener">${ic.external}<span>Lihat di situs</span></a>
      <button type="button" class="btn btn--primary" data-new>${ic.plus}<span>Tambah ${config.singular}</span></button></div>
    </div>
    <div data-list>${loading(4)}</div>`);

  function paint() {
    render(qs('[data-list]', ctx.root), items.length ? html`
      <ul class="sortable">${items.map((item, index) => html`
        <li class="sortable__item ${item.isPublished ? '' : 'is-hidden'}" draggable="true" data-id="${item.id}">
          <span class="sortable__grip" aria-hidden="true">${ic.grip}</span>
          <img class="sortable__thumb" src="${config.image(item)}" alt="" loading="lazy">
          <div class="sortable__main"><b>${config.name(item) || '(tanpa judul)'}</b><small>${config.sub(item) ?? ''}</small></div>
          ${item.isPublished ? badge('Tampil', 'ok') : badge('Disembunyikan', 'muted')}
          <div class="sortable__actions">
            <button type="button" class="btn btn--icon btn--ghost btn--sm" data-move="up" data-index="${index}" ${index === 0 ? 'disabled' : ''} aria-label="Naikkan">${ic.up}</button>
            <button type="button" class="btn btn--icon btn--ghost btn--sm" data-move="down" data-index="${index}" ${index === items.length - 1 ? 'disabled' : ''} aria-label="Turunkan">${ic.down}</button>
            <button type="button" class="btn btn--icon btn--ghost btn--sm" data-toggle="${item.id}" aria-label="${item.isPublished ? 'Sembunyikan' : 'Tampilkan'}">${item.isPublished ? ic.eyeOff : ic.eye}</button>
            <button type="button" class="btn btn--icon btn--ghost btn--sm" data-edit="${item.id}" aria-label="Edit">${ic.edit}</button>
            <button type="button" class="btn btn--icon btn--ghost btn--sm" data-delete="${item.id}" aria-label="Hapus">${ic.trash}</button>
          </div>
        </li>`)}</ul>`
      : emptyState(`Belum ada ${config.singular}`, '', html`<button type="button" class="btn btn--primary" data-new>${ic.plus}<span>Tambah ${config.singular}</span></button>`));
  }

  async function saveOrder() {
    try { await api.reorderContent(name, items.map((i) => i.id)); toast('Urutan disimpan'); } catch (error) { toast(errorMessage(error), 'danger'); load(); }
  }

  function openEditor(item) {
    const isNew = !item;
    const initial = isNew ? config.blank() : strip(item);
    let dirty = false;
    const ov = overlay({
      kind: 'drawer', size: 'xl', title: isNew ? `Tambah ${config.singular}` : `Edit: ${config.name(item) ?? ''}`,
      onClose: () => { editor = null; },
    });
    ov.setContent(html`<form class="drawer-form" novalidate><div data-form></div>
      <div class="drawer-form__foot"><span class="muted small" data-dirty></span><button type="button" class="btn" data-ov-close>Batal</button><button type="submit" class="btn btn--primary">${ic.check}<span>Simpan</span></button></div></form>`);
    const form = createForm(qs('[data-form]', ov.body), config.schema, initial, {
      onChange: () => { dirty = true; qs('[data-dirty]', ov.body).textContent = 'Perubahan belum disimpan'; },
    });
    const originalClose = ov.close;
    ov.close = () => { if (dirty && !window.confirm('Buang perubahan yang belum disimpan?')) return; originalClose(); };
    qs('form', ov.body).addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = qs('[type=submit]', ov.body);
      button.disabled = true;
      try {
        await api.saveContent(name, isNew ? null : item.id, form.value);
        dirty = false;
        toast(isNew ? 'Data ditambahkan' : 'Perubahan disimpan');
        originalClose();
        load();
      } catch (error) {
        if (!form.showErrors(error.details)) toast(errorMessage(error), 'danger');
        else toast('Periksa kembali isian yang ditandai', 'danger');
      } finally { button.disabled = false; }
    });
    editor = ov;
  }

  ctx.root.addEventListener('click', async (event) => {
    const t = event.target;
    if (t.closest('[data-new]')) { openEditor(null); return; }
    if (t.closest('[data-retry]')) { load(); return; }
    const edit = t.closest('[data-edit]');
    if (edit) { openEditor(items.find((i) => i.id === Number(edit.dataset.edit))); return; }
    const move = t.closest('[data-move]');
    if (move) {
      const i = Number(move.dataset.index);
      const j = move.dataset.move === 'up' ? i - 1 : i + 1;
      [items[i], items[j]] = [items[j], items[i]];
      paint();
      saveOrder();
      return;
    }
    const toggle = t.closest('[data-toggle]');
    if (toggle) {
      const item = items.find((i) => i.id === Number(toggle.dataset.toggle));
      try { await api.saveContent(name, item.id, { ...strip(item), isPublished: !item.isPublished }); toast(item.isPublished ? 'Disembunyikan dari situs' : 'Ditampilkan di situs'); load(); } catch (error) { toast(errorMessage(error), 'danger'); }
      return;
    }
    const del = t.closest('[data-delete]');
    if (del) {
      const item = items.find((i) => i.id === Number(del.dataset.delete));
      if (!(await confirmDialog({ title: `Hapus ${config.singular}?`, message: `"${config.name(item)}" akan dihapus dari situs.` }))) return;
      try { await api.deleteContent(name, item.id); toast('Data dihapus'); load(); } catch (error) { toast(errorMessage(error), 'danger'); }
    }
  });

  // Drag-to-reorder.
  let dragEl = null;
  ctx.root.addEventListener('dragstart', (e) => { dragEl = e.target.closest('.sortable__item'); if (dragEl) { dragEl.classList.add('is-dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragEl.dataset.id); } });
  ctx.root.addEventListener('dragover', (e) => {
    const over = e.target.closest('.sortable__item');
    if (!dragEl || !over || over === dragEl) return;
    e.preventDefault();
    const rect = over.getBoundingClientRect();
    over.parentElement.insertBefore(dragEl, e.clientY > rect.top + rect.height / 2 ? over.nextSibling : over);
  });
  ctx.root.addEventListener('dragend', () => {
    if (!dragEl) return;
    dragEl.classList.remove('is-dragging');
    dragEl = null;
    const order = qsa('.sortable__item', ctx.root).map((el) => Number(el.dataset.id));
    if (order.join() === items.map((i) => i.id).join()) return;
    items = order.map((id) => items.find((i) => i.id === id));
    paint();
    saveOrder();
  });

  await load();
  return { destroy() { editor?.close(); } };
}
