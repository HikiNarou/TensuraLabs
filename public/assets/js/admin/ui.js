/** Shared admin UI primitives: toasts, dialogs, drawers, formatting and small templates. */
import { applyVars, html, qs, qsa, render } from '../core/dom.js';
import { ic } from './icons.js';

export { html, qs, qsa, render, applyVars };

/* Formatting ------------------------------------------------------------- */
const LOCALE = 'id-ID';
export const fmtNumber = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString(LOCALE) : '—');
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export function fmtBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}
export function fmtRelative(iso) {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
  const steps = [[60, 'second'], [3600, 'minute', 60], [86400, 'hour', 3600], [604800, 'day', 86400], [2629800, 'week', 604800], [31557600, 'month', 2629800], [Infinity, 'year', 31557600]];
  for (const [limit, unit, div = 1] of steps) {
    if (Math.abs(diff) < limit) return rtf.format(-Math.round(diff / div), unit);
  }
  return fmtDate(iso);
}
export function fmtDuration(seconds) {
  const s = Math.floor(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}h ${h}j` : h ? `${h}j ${m}m` : `${m}m`;
}
export const initials = (name = '') => name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';
export const debounce = (fn, ms = 300) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; };
export const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/* Domain labels ---------------------------------------------------------- */
export const LEAD_STATUS = {
  new: { label: 'Baru', tone: 'info' },
  contacted: { label: 'Dihubungi', tone: 'violet' },
  qualified: { label: 'Terkualifikasi', tone: 'cyan' },
  proposal: { label: 'Proposal', tone: 'warn' },
  won: { label: 'Deal', tone: 'ok' },
  lost: { label: 'Gagal', tone: 'muted' },
};
export const LEAD_PRIORITY = { low: { label: 'Rendah', tone: 'muted' }, normal: { label: 'Normal', tone: 'info' }, high: { label: 'Tinggi', tone: 'danger' } };
export const BUDGET_LABEL = { '': '—', 'lt-25': '< Rp25 jt', '25-75': 'Rp25–75 jt', '75-200': 'Rp75–200 jt', 'gt-200': '> Rp200 jt', undisclosed: 'Belum ditentukan' };
export const QUOTE_STATUS = {
  draft: { label: 'Draf', tone: 'muted' },
  sent: { label: 'Terkirim', tone: 'info' },
  accepted: { label: 'Diterima', tone: 'ok' },
  rejected: { label: 'Ditolak', tone: 'danger' },
};
export function fmtMoney(amount, currency = 'IDR') {
  const value = Number(amount) || 0;
  return currency === 'USD'
    ? value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    : `Rp${value.toLocaleString(LOCALE, { maximumFractionDigits: 0 })}`;
}
/** Short money for KPI tiles: Rp1,2 M / Rp850 jt. */
export function fmtMoneyShort(amount) {
  const n = Number(amount) || 0;
  if (n >= 1e9) return `Rp${(n / 1e9).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} M`;
  if (n >= 1e6) return `Rp${(n / 1e6).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} jt`;
  return fmtMoney(n);
}
/** Due-date label relative to today ("Hari ini 14.00", "Besok", "Terlambat 2 hari"). */
export function fmtDue(iso) {
  if (!iso) return 'Tanpa tenggat';
  const due = new Date(iso);
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(due) - startOf(new Date())) / 86400000);
  const time = due.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
  if (due < new Date()) return days === 0 ? `Terlambat · hari ini ${time}` : `Terlambat ${Math.abs(days)} hari`;
  if (days === 0) return `Hari ini ${time}`;
  if (days === 1) return `Besok ${time}`;
  if (days < 7) return `${due.toLocaleDateString(LOCALE, { weekday: 'long' })} ${time}`;
  return fmtDate(iso);
}
export const CATEGORY_LABEL = { news: 'Berita', notice: 'Pengumuman', event: 'Acara' };
export const ROLE_LABEL = { admin: 'Admin', editor: 'Editor' };

export const badge = (label, tone = 'muted') => html`<span class="badge badge--${tone}">${label}</span>`;
export const avatar = (name, size = '') => html`<span class="avatar ${size ? `avatar--${size}` : ''}" aria-hidden="true">${initials(name)}</span>`;

export function emptyState(title, text = '', action = '') {
  return html`<div class="empty"><div class="empty__icon">${ic.sparkle}</div><h3>${title}</h3>${text ? html`<p>${text}</p>` : ''}${action}</div>`;
}
export const loading = (rows = 4) => html`<div class="skeleton">${Array.from({ length: rows }, () => html`<i></i>`)}</div>`;
export const errorBox = (error) => html`<div class="alert alert--danger">${ic.alert}<span>${error?.message ?? 'Terjadi kesalahan'}</span><button type="button" class="btn btn--sm" data-retry>Coba lagi</button></div>`;

export function pager(pagination) {
  if (!pagination || pagination.totalPages <= 1) {
    return pagination ? html`<div class="pager"><span>${fmtNumber(pagination.total)} data</span></div>` : '';
  }
  const { page, totalPages, total } = pagination;
  return html`
    <div class="pager">
      <span>${fmtNumber(total)} data · hal. ${page}/${totalPages}</span>
      <div class="pager__btns">
        <button type="button" class="btn btn--icon btn--sm" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="Sebelumnya">${ic.left}</button>
        <button type="button" class="btn btn--icon btn--sm" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''} aria-label="Berikutnya">${ic.right}</button>
      </div>
    </div>`;
}

/* Toasts ----------------------------------------------------------------- */
let toastHost;
export function toast(message, tone = 'ok') {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'toasts';
    toastHost.setAttribute('role', 'status');
    toastHost.setAttribute('aria-live', 'polite');
    document.body.append(toastHost);
  }
  const item = document.createElement('div');
  item.className = `toast toast--${tone === true ? 'danger' : tone}`;
  render(item, html`<span class="toast__icon">${tone === 'ok' ? ic.check : ic.alert}</span><span>${message}</span>`);
  toastHost.append(item);
  requestAnimationFrame(() => item.classList.add('is-in'));
  setTimeout(() => { item.classList.remove('is-in'); setTimeout(() => item.remove(), 300); }, tone === 'ok' ? 3200 : 5200);
}

/* Layered overlays (modal / drawer) -------------------------------------- */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const stack = [];
document.addEventListener('keydown', (event) => {
  const top = stack[stack.length - 1];
  if (!top) return;
  if (event.key === 'Escape') { event.preventDefault(); top.close(); }
  if (event.key === 'Tab') {
    const items = qsa(FOCUSABLE, top.panel).filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

/**
 * Opens an overlay. kind: 'modal' | 'drawer'. Returns { panel, body, close, setContent }.
 * `onClose` fires once; the overlay is removed after its exit animation.
 */
export function overlay({ kind = 'modal', title = '', size = '', onClose, content } = {}) {
  const root = document.createElement('div');
  root.className = `ov ov--${kind} ${size ? `ov--${size}` : ''}`;
  render(root, html`
    <div class="ov__backdrop" data-ov-close></div>
    <section class="ov__panel" role="dialog" aria-modal="true" aria-label="${title}" tabindex="-1">
      <header class="ov__head"><h2>${title}</h2><button type="button" class="btn btn--icon btn--ghost" data-ov-close aria-label="Tutup">${ic.x}</button></header>
      <div class="ov__body"></div>
    </section>`);
  const panel = qs('.ov__panel', root);
  const body = qs('.ov__body', root);
  const returnFocus = document.activeElement;
  let closed = false;
  const api = {
    root, panel, body,
    setTitle(text) { qs('.ov__head h2', root).textContent = text; panel.setAttribute('aria-label', text); },
    setContent(template) { render(body, template); },
    close() {
      if (closed) return;
      closed = true;
      stack.splice(stack.indexOf(api), 1);
      root.classList.remove('is-open');
      setTimeout(() => root.remove(), 280);
      if (!stack.length) document.documentElement.classList.remove('has-overlay');
      returnFocus?.focus?.({ preventScroll: true });
      onClose?.();
    },
  };
  root.addEventListener('click', (event) => { if (event.target.closest('[data-ov-close]')) api.close(); });
  if (content) api.setContent(content);
  document.body.append(root);
  stack.push(api);
  document.documentElement.classList.add('has-overlay');
  requestAnimationFrame(() => {
    root.classList.add('is-open');
    (qs('[autofocus]', panel) ?? panel).focus({ preventScroll: true });
  });
  return api;
}

/** Confirmation dialog; resolves true when confirmed. */
export function confirmDialog({ title = 'Konfirmasi', message = '', confirm = 'Hapus', tone = 'danger' } = {}) {
  return new Promise((resolve) => {
    let result = false;
    const ov = overlay({ title, size: 'sm', onClose: () => resolve(result) });
    ov.setContent(html`
      <p class="ov__text">${message}</p>
      <div class="ov__actions">
        <button type="button" class="btn" data-ov-close>Batal</button>
        <button type="button" class="btn btn--${tone}" data-confirm autofocus>${confirm}</button>
      </div>`);
    qs('[data-confirm]', ov.root).addEventListener('click', () => { result = true; ov.close(); });
    requestAnimationFrame(() => qs('[data-confirm]', ov.root)?.focus());
  });
}

/** Small form dialog. fields: [{ name, label, type, value, options, required, hint }]. Resolves values or null. */
export function formDialog({ title, fields, submit = 'Simpan', onSubmit }) {
  return new Promise((resolve) => {
    let result = null;
    const ov = overlay({ title, size: 'sm', onClose: () => resolve(result) });
    ov.setContent(html`
      <form class="stack" novalidate>
        ${fields.map((f, i) => html`
          <label class="field">
            <span class="field__label">${f.label}</span>
            ${f.type === 'select'
              ? html`<select class="input" name="${f.name}">${f.options.map((o) => html`<option value="${o.value}" ${String(o.value) === String(f.value ?? '') ? 'selected' : ''}>${o.label}</option>`)}</select>`
              : f.type === 'textarea'
                ? html`<textarea class="input" name="${f.name}" rows="4" ${f.required ? 'required' : ''}>${f.value ?? ''}</textarea>`
                : f.type === 'checkbox'
                  ? html`<span class="switch"><input type="checkbox" name="${f.name}" ${f.value ? 'checked' : ''}><i></i></span>`
                  : html`<input class="input" name="${f.name}" type="${f.type ?? 'text'}" value="${f.value ?? ''}" ${f.required ? 'required' : ''} ${i === 0 ? 'autofocus' : ''} autocomplete="${f.autocomplete ?? 'off'}">`}
            ${f.hint ? html`<small class="field__hint">${f.hint}</small>` : ''}
          </label>`)}
        <p class="form-error" data-error hidden></p>
        <div class="ov__actions">
          <button type="button" class="btn" data-ov-close>Batal</button>
          <button type="submit" class="btn btn--primary">${submit}</button>
        </div>
      </form>`);
    const form = qs('form', ov.root);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = {};
      for (const f of fields) {
        const input = form.elements[f.name];
        values[f.name] = f.type === 'checkbox' ? input.checked : input.value.trim();
      }
      const button = qs('[type=submit]', form);
      button.disabled = true;
      try {
        if (onSubmit) await onSubmit(values);
        result = values;
        ov.close();
      } catch (error) {
        const box = qs('[data-error]', form);
        box.hidden = false;
        box.textContent = error.details?.[0]?.message ?? error.message;
      } finally {
        button.disabled = false;
      }
    });
  });
}

/** Copies text with a toast confirmation. */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Disalin ke clipboard'); } catch { toast('Clipboard tidak tersedia', 'danger'); }
}

/** Reads a validation error into a readable string. */
export const errorMessage = (error) => {
  const detail = error?.details?.[0];
  return detail ? `${detail.field ? `${detail.field}: ` : ''}${detail.message}` : (error?.message ?? 'Terjadi kesalahan');
};
