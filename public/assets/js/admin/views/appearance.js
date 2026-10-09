import { api } from '../api.js';
import { createForm } from '../form.js';
import { ic } from '../icons.js';
import { confirmDialog, debounce, errorBox, errorMessage, fmtRelative, html, qs, qsa, render, toast } from '../ui.js';

const ICONS = ['code', 'layers', 'cloud', 'brain', 'bolt', 'shield', 'mobile', 'chart', 'database', 'users'].map((v) => ({ value: v, label: v }));
const head = (kicker = true, subtitle = true) => [
  ...(kicker ? [{ type: 'text', key: 'kicker', label: 'Kicker', max: 40 }] : []),
  { type: 'text', key: 'title', label: 'Judul bagian', max: 120, wide: !kicker },
  ...(subtitle ? [{ type: 'textarea', key: 'subtitle', label: 'Subjudul', max: 300, rows: 2 }] : []),
];

const HOME_SCHEMA = [{ type: 'localized', key: null, fields: [
  { type: 'group', key: 'hero', label: 'Hero', icon: 'sparkle', hint: 'Bagian pembuka paling atas', collapsible: true, fields: [
    { type: 'text', key: 'eyebrow', label: 'Eyebrow', max: 80, wide: true },
    { type: 'text', key: 'titleLead', label: 'Judul — awal', max: 60 },
    { type: 'text', key: 'titleTail', label: 'Judul — akhir', max: 80 },
    { type: 'list', key: 'rotating', label: 'Kata berganti (animasi)', max: 40, maxItems: 8, addLabel: 'Tambah kata' },
    { type: 'textarea', key: 'lead', label: 'Paragraf pembuka', max: 400, rows: 3 },
    { type: 'text', key: 'primaryCta', label: 'Tombol utama', max: 40 },
    { type: 'text', key: 'secondaryCta', label: 'Tombol kedua', max: 40 },
    { type: 'text', key: 'secondaryHref', label: 'Tautan tombol kedua', placeholder: '/gallery' },
    { type: 'text', key: 'trust', label: 'Teks kepercayaan', max: 140 },
  ] },
  { type: 'group', key: null, label: 'Statistik hero', icon: 'trend', collapsible: true, fields: [
    { type: 'repeater', key: 'stats', label: 'Angka statistik', maxItems: 6, itemTitle: (i) => `${i.value} — ${i.label}`, fields: [
      { type: 'text', key: 'value', label: 'Nilai', max: 16 }, { type: 'text', key: 'label', label: 'Label', max: 80 }] },
  ] },
  { type: 'group', key: 'clients', label: 'Marquee teknologi / klien', icon: 'layers', collapsible: true, fields: [
    { type: 'text', key: 'title', label: 'Judul', max: 120, wide: true },
    { type: 'list', key: 'items', label: 'Item berjalan', max: 40, maxItems: 30 },
  ] },
  { type: 'group', key: 'services', label: 'Layanan', icon: 'code', collapsible: true, fields: [
    ...head(),
    { type: 'repeater', key: 'items', label: 'Kartu layanan', min: 1, maxItems: 12, itemTitle: (i) => i.title, addLabel: 'Tambah layanan', fields: [
      { type: 'select', key: 'icon', label: 'Ikon', options: ICONS }, { type: 'text', key: 'title', label: 'Judul', max: 80 },
      { type: 'textarea', key: 'text', label: 'Deskripsi', max: 300, rows: 2 }, { type: 'list', key: 'tags', label: 'Tag', max: 30, maxItems: 6 }] },
  ] },
  { type: 'group', key: 'process', label: 'Proses kerja', icon: 'board', collapsible: true, fields: [
    ...head(),
    { type: 'repeater', key: 'steps', label: 'Langkah', min: 1, maxItems: 8, itemTitle: (i) => i.title, addLabel: 'Tambah langkah', fields: [
      { type: 'text', key: 'title', label: 'Judul', max: 60 }, { type: 'text', key: 'duration', label: 'Durasi', max: 30 },
      { type: 'textarea', key: 'text', label: 'Deskripsi', max: 300, rows: 2 }] },
  ] },
  { type: 'group', key: 'metrics', label: 'Metrik dampak', icon: 'chart', collapsible: true, fields: [
    ...head(true, false),
    { type: 'repeater', key: 'items', label: 'Metrik', maxItems: 8, itemTitle: (i) => `${i.value} — ${i.label}`, fields: [
      { type: 'text', key: 'value', label: 'Nilai', max: 16 }, { type: 'text', key: 'label', label: 'Label', max: 120 }] },
  ] },
  { type: 'group', key: 'testimonials', label: 'Testimoni', icon: 'message', collapsible: true, fields: [
    ...head(true, false),
    { type: 'repeater', key: 'items', label: 'Testimoni', maxItems: 12, itemTitle: (i) => i.name, fields: [
      { type: 'textarea', key: 'quote', label: 'Kutipan', max: 400, rows: 3 }, { type: 'text', key: 'name', label: 'Nama', max: 60 }, { type: 'text', key: 'role', label: 'Jabatan & perusahaan', max: 80 }] },
  ] },
  { type: 'group', key: 'faq', label: 'FAQ', icon: 'alert', collapsible: true, fields: [
    ...head(true, false),
    { type: 'repeater', key: 'items', label: 'Pertanyaan', maxItems: 20, itemTitle: (i) => i.q, fields: [
      { type: 'text', key: 'q', label: 'Pertanyaan', max: 200, wide: true }, { type: 'textarea', key: 'a', label: 'Jawaban', max: 800, rows: 3 }] },
  ] },
  { type: 'group', key: 'cta', label: 'Ajakan (CTA) penutup', icon: 'send', collapsible: true, fields: [
    { type: 'text', key: 'title', label: 'Judul', max: 120, wide: true }, { type: 'textarea', key: 'text', label: 'Teks', max: 300, rows: 2 }, { type: 'text', key: 'button', label: 'Label tombol', max: 40 }] },
] }];

const toggles = (keys, labels) => keys.map((key) => ({ type: 'toggle', key, label: labels[key][0], hint: labels[key][1] }));
const SITE_SCHEMA = [
  { type: 'group', key: 'theme', label: 'Warna tema', icon: 'palette', hint: 'Aksen, gradien, dan latar', collapsible: true, fields: [
    { type: 'color', key: 'accent', label: 'Aksen utama' }, { type: 'color', key: 'accent2', label: 'Aksen kedua (gradien)' },
    { type: 'color', key: 'highlight', label: 'Highlight' }, { type: 'color', key: 'surface', label: 'Permukaan gelap' }] },
  { type: 'group', key: 'motion', label: 'Animasi & efek', icon: 'bolt', collapsible: true, fields: toggles(['liquidTransitions', 'ambientBubbles', 'parallax', 'smoothReveal'], {
    liquidTransitions: ['Transisi liquid antar bagian', 'Jika mati, memakai transisi slide modern'], ambientBubbles: ['Gelembung ambient di hero', 'Animasi kanvas latar'],
    parallax: ['Efek parallax', 'Gerak gambar mengikuti kursor & scroll'], smoothReveal: ['Animasi muncul saat scroll', 'Elemen tampil bertahap'] }) },
  { type: 'group', key: 'homeBlocks', label: 'Blok beranda', icon: 'home', hint: 'Tampilkan/sembunyikan bagian di beranda', collapsible: true, fields: toggles(['clients', 'services', 'process', 'metrics', 'testimonials', 'faq', 'cta'], {
    clients: ['Marquee teknologi', ''], services: ['Layanan', ''], process: ['Proses kerja', ''], metrics: ['Metrik dampak', ''], testimonials: ['Testimoni', ''], faq: ['FAQ', ''], cta: ['CTA penutup', ''] }) },
  { type: 'group', key: 'sections', label: 'Bagian situs', icon: 'list', hint: 'Halaman penuh pada navigasi utama', collapsible: true, fields: toggles(['squad', 'news', 'gallery', 'world'], {
    squad: ['Pengenalan Tim', '/squad'], news: ['Berita', '/news'], gallery: ['Galeri Portofolio', '/gallery'], world: ['Kabar Guild', '/world'] }) },
  { type: 'group', key: 'announcement', label: 'Pengumuman', icon: 'sparkle', hint: 'Pita di atas judul hero', collapsible: true, fields: [
    { type: 'toggle', key: 'enabled', label: 'Tampilkan pengumuman' }, { type: 'text', key: 'href', label: 'Tautan', placeholder: '/news atau https://…' },
    { type: 'localized', key: null, fields: [{ type: 'text', key: 'label', label: 'Label', max: 16 }, { type: 'text', key: 'text', label: 'Teks', max: 140 }] }] },
  { type: 'group', key: 'brand', label: 'Identitas merek', icon: 'star', collapsible: true, fields: [
    { type: 'text', key: 'name', label: 'Nama merek', max: 60 }, { type: 'text', key: 'legalName', label: 'Nama legal', max: 120 },
    { type: 'number', key: 'foundedYear', label: 'Tahun berdiri', min: 1900, maxValue: 2100 }] },
  { type: 'group', key: 'contact', label: 'Kontak & sosial', icon: 'phone', collapsible: true, fields: [
    { type: 'text', key: 'email', label: 'Email', inputType: 'email' }, { type: 'text', key: 'phone', label: 'Telepon', max: 40 },
    { type: 'text', key: 'address', label: 'Alamat', max: 200, wide: true }, { type: 'text', key: 'whatsapp', label: 'WhatsApp (https://wa.me/…)' },
    { type: 'text', key: 'github', label: 'GitHub' }, { type: 'text', key: 'linkedin', label: 'LinkedIn' }, { type: 'text', key: 'instagram', label: 'Instagram' }, { type: 'text', key: 'x', label: 'X / Twitter' }] },
  { type: 'group', key: 'seo', label: 'SEO & berbagi', icon: 'globe', collapsible: true, fields: [
    { type: 'image', key: 'ogImage', label: 'Gambar Open Graph' },
    { type: 'localized', key: null, fields: [{ type: 'text', key: 'title', label: 'Judul halaman', max: 120, wide: true }, { type: 'textarea', key: 'description', label: 'Deskripsi meta', max: 320, rows: 3 }] }] },
  { type: 'group', key: 'maintenance', label: 'Mode pemeliharaan', icon: 'alert', hint: 'Sembunyikan situs sementara dari pengunjung', collapsible: true, fields: [
    { type: 'toggle', key: 'enabled', label: 'Aktifkan mode pemeliharaan', hint: 'Pengunjung melihat halaman pemberitahuan; admin tetap bisa mengakses dashboard.', wide: true },
    { type: 'localized', key: null, fields: [{ type: 'text', key: 'title', label: 'Judul', max: 100, wide: true }, { type: 'textarea', key: 'text', label: 'Pesan', max: 400, rows: 3 }] }] },
];

const PRESETS = [
  { name: 'Slime Blue', theme: { accent: '#5ea8ff', accent2: '#b59bff', highlight: '#e8d7ab', surface: '#0a0c1e' } },
  { name: 'Emerald', theme: { accent: '#34d399', accent2: '#22d3ee', highlight: '#d9f99d', surface: '#071612' } },
  { name: 'Sunset', theme: { accent: '#fb7185', accent2: '#f59e0b', highlight: '#fde68a', surface: '#160b10' } },
  { name: 'Royal', theme: { accent: '#818cf8', accent2: '#e879f9', highlight: '#f5d0fe', surface: '#0d0a1f' } },
  { name: 'Mono Cyan', theme: { accent: '#22d3ee', accent2: '#94a3b8', highlight: '#e2e8f0', surface: '#0a0f14' } },
];
const DEVICES = [['desktop', 'monitor', 'Desktop'], ['tablet', 'tablet', 'Tablet'], ['mobile', 'mobile', 'Mobile']];

export async function mount(ctx) {
  const key = ctx.params[0] === 'site' ? 'site' : 'home';
  ctx.setTitle(key === 'home' ? 'Halaman Beranda' : 'Tema & Situs');
  let settings;
  try { settings = await api.settings(); } catch (error) { render(ctx.root, errorBox(error)); return {}; }
  let saved = JSON.stringify(settings[key].value);
  let device = 'desktop';
  let ready = false;

  render(ctx.root, html`
    <div class="appearance">
      <div class="appearance__editor">
        <div class="page-head">
          <div><h2>${key === 'home' ? 'Halaman Beranda' : 'Tema & Situs'}</h2>
            <p class="muted">${key === 'home' ? 'Atur seluruh teks dan blok konten beranda dalam dua bahasa.' : 'Warna, animasi, navigasi, kontak, SEO, dan mode pemeliharaan.'}
            ${settings[key].customized ? html`<br><small>Disesuaikan · ${fmtRelative(settings[key].updatedAt)}</small>` : html`<br><small>Menggunakan konfigurasi bawaan</small>`}</p></div>
          <div class="segmented segmented--sm"><a href="#/appearance/home" class="${key === 'home' ? 'is-active' : ''}">Beranda</a><a href="#/appearance/site" class="${key === 'site' ? 'is-active' : ''}">Tema & Situs</a></div>
        </div>
        ${key === 'site' ? html`<div class="card presets"><span class="field__label">Preset warna</span><div class="presets__row">${PRESETS.map((p, i) => html`
          <button type="button" class="preset" data-preset="${i}" title="${p.name}"><span class="preset__swatch" data-vars="--a:${p.theme.accent};--b:${p.theme.accent2};--s:${p.theme.surface}"></span><small>${p.name}</small></button>`)}</div></div>` : ''}
        <div data-form></div>
        <div class="savebar" data-savebar>
          <span class="savebar__state" data-state>Semua perubahan tersimpan</span>
          <button type="button" class="btn btn--ghost btn--sm" data-reset title="Kembalikan ke konfigurasi bawaan">${ic.refresh}<span>Reset default</span></button>
          <button type="button" class="btn btn--sm" data-discard disabled>Buang</button>
          <button type="button" class="btn btn--primary btn--sm" data-save disabled>${ic.check}<span>Simpan & terbitkan</span></button>
        </div>
      </div>
      <div class="appearance__preview">
        <div class="preview__bar">
          <span class="preview__dot"></span><span class="preview__url">${location.host}/</span>
          <div class="segmented segmented--sm">${DEVICES.map(([d, icon, label]) => html`<button type="button" data-device="${d}" class="${d === device ? 'is-active' : ''}" aria-label="${label}">${ic[icon]}</button>`)}</div>
          <button type="button" class="btn btn--icon btn--ghost btn--sm" data-reload aria-label="Muat ulang pratinjau">${ic.refresh}</button>
        </div>
        <div class="preview__stage" data-stage="${device}"><iframe title="Pratinjau langsung" src="/?preview=1" data-frame></iframe></div>
        <p class="muted small preview__note">Pratinjau langsung — perubahan belum terlihat pengunjung sebelum disimpan.</p>
      </div>
    </div>`);

  const frame = qs('[data-frame]', ctx.root);
  const stage = qs('[data-stage]', ctx.root);
  const VIEWPORT = { desktop: [1366, 0], tablet: [820, 0], mobile: [390, 844] };
  /** Renders the iframe at a real device width and scales it down to fit the stage. */
  function fit() {
    const [width, fixedHeight] = VIEWPORT[device];
    const pad = device === 'mobile' ? 24 : 0;
    const availW = stage.clientWidth - pad * 2;
    const availH = stage.clientHeight - pad * 2;
    if (availW <= 0 || availH <= 0) return;
    const scale = Math.min(1, availW / width, fixedHeight ? availH / fixedHeight : 1);
    const height = fixedHeight || availH / scale;
    frame.style.width = `${width}px`;
    frame.style.height = `${height}px`;
    frame.style.transform = `scale(${scale})`;
    frame.style.left = `${(stage.clientWidth - width * scale) / 2}px`;
    frame.style.top = `${device === 'mobile' ? (stage.clientHeight - height * scale) / 2 : 0}px`;
  }
  const resizeObserver = new ResizeObserver(fit);
  resizeObserver.observe(stage);
  const draft = () => form.value;
  const dirty = () => JSON.stringify(draft()) !== saved;

  let previewLang = 'id';
  const pushPreview = debounce(() => {
    if (!ready || !frame.contentWindow) return;
    const site = key === 'site' ? draft() : settings.site.value;
    const home = key === 'home' ? draft() : settings.home.value;
    frame.contentWindow.postMessage({ type: 'tl:preview-settings', payload: { site: JSON.parse(JSON.stringify(site)), home: JSON.parse(JSON.stringify(home)), lang: previewLang } }, location.origin);
  }, 350);

  function syncBar() {
    const isDirty = dirty();
    qs('[data-state]', ctx.root).textContent = isDirty ? 'Perubahan belum disimpan' : 'Semua perubahan tersimpan';
    qs('[data-savebar]', ctx.root).classList.toggle('is-dirty', isDirty);
    qs('[data-save]', ctx.root).disabled = !isDirty;
    qs('[data-discard]', ctx.root).disabled = !isDirty;
  }

  const form = createForm(qs('[data-form]', ctx.root), key === 'home' ? HOME_SCHEMA : SITE_SCHEMA, settings[key].value, {
    onChange: () => { syncBar(); pushPreview(); },
  });
  ctx.guard(dirty);

  const onMessage = (event) => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
    if (event.data?.type === 'tl:preview-ready') { ready = true; pushPreview(); }
  };
  window.addEventListener('message', onMessage);

  async function save() {
    const button = qs('[data-save]', ctx.root);
    button.disabled = true;
    try {
      const result = await api.saveSettings(key, draft());
      settings[key] = result;
      saved = JSON.stringify(result.value);
      form.set(result.value);
      toast('Tersimpan & langsung tayang di situs');
    } catch (error) {
      if (form.showErrors(error.details)) toast('Periksa isian yang ditandai', 'danger');
      else toast(errorMessage(error), 'danger');
    }
    syncBar();
  }

  ctx.root.addEventListener('click', async (event) => {
    const t = event.target;
    const tab = t.closest('[data-act="tab"]');
    if (tab && tab.dataset.locale !== previewLang) { previewLang = tab.dataset.locale; pushPreview(); return; }
    if (t.closest('[data-save]')) { save(); return; }
    if (t.closest('[data-discard]')) { form.set(JSON.parse(saved)); syncBar(); pushPreview(); return; }
    if (t.closest('[data-reset]')) {
      if (!(await confirmDialog({ title: 'Kembalikan ke default?', message: 'Semua penyesuaian pada bagian ini akan diganti dengan konfigurasi bawaan dan langsung tayang.', confirm: 'Reset', tone: 'danger' }))) return;
      try {
        const result = await api.resetSettings(key);
        settings[key] = result;
        saved = JSON.stringify(result.value);
        form.set(result.value);
        syncBar();
        pushPreview();
        toast('Dikembalikan ke konfigurasi bawaan');
      } catch (error) { toast(errorMessage(error), 'danger'); }
      return;
    }
    const preset = t.closest('[data-preset]');
    if (preset) {
      const value = draft();
      value.theme = { ...PRESETS[Number(preset.dataset.preset)].theme };
      form.set(value);
      syncBar();
      pushPreview();
      return;
    }
    const dev = t.closest('[data-device]');
    if (dev) {
      device = dev.dataset.device;
      stage.dataset.stage = device;
      fit();
      qsa('[data-device]', ctx.root).forEach((b) => b.classList.toggle('is-active', b === dev));
      return;
    }
    if (t.closest('[data-reload]')) { ready = false; frame.src = '/?preview=1'; }
  });
  const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (dirty()) save(); } };
  document.addEventListener('keydown', onKey);
  frame.addEventListener('load', () => { /* ready is signalled by the page via postMessage */ });

  return {
    destroy() {
      window.removeEventListener('message', onMessage);
      resizeObserver.disconnect();
      document.removeEventListener('keydown', onKey);
      form.destroy();
    },
  };
}
