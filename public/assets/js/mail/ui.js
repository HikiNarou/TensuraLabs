/** Small UI primitives for the mail app: toasts, modal sheets, confirmation, clipboard. */
import { html, qs, qsa, render } from '../core/dom.js';
import { icons } from './icons.js';
import { t } from './i18n.js';

export function toast(message, tone = 'ok', { timeout = 3600 } = {}) {
  const host = document.getElementById('mx-toasts');
  if (!host) return;
  const node = document.createElement('div');
  node.className = `mx-toast mx-toast--${tone}`;
  render(node, html`<span class="mx-toast__icon">${tone === 'danger' ? icons.alert : tone === 'info' ? icons.mail : icons.check}</span><span>${message}</span>`);
  host.append(node);
  requestAnimationFrame(() => node.classList.add('is-in'));
  const dismiss = () => { node.classList.remove('is-in'); setTimeout(() => node.remove(), 250); };
  node.addEventListener('click', dismiss);
  setTimeout(dismiss, timeout);
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const stack = [];

/**
 * Opens a modal dialog (a bottom sheet on phones). `content` is an html`` template.
 * `beforeClose()` may return false (or a Promise<false>) to keep the dialog open.
 */
export function modal({ title, content, size = 'md', className = '', dismissible = true, beforeClose }) {
  const previous = document.activeElement;
  const root = document.createElement('div');
  root.className = `mx-modal mx-modal--${size} ${className}`;
  render(root, html`
    <div class="mx-modal__backdrop" data-close></div>
    <section class="mx-modal__panel" role="dialog" aria-modal="true" aria-labelledby="mx-modal-title-${stack.length}">
      <header class="mx-modal__head">
        <h2 id="mx-modal-title-${stack.length}">${title}</h2>
        ${dismissible ? html`<button type="button" class="mx-icon-btn" data-close aria-label="${t('common.close')}">${icons.close}</button>` : ''}
      </header>
      <div class="mx-modal__body"></div>
    </section>`);
  const body = qs('.mx-modal__body', root);
  render(body, content);
  document.body.append(root);
  document.documentElement.classList.add('has-modal');
  requestAnimationFrame(() => root.classList.add('is-open'));

  let closed = false;
  const api = {
    root, body,
    async close(force = false) {
      if (closed) return;
      if (!force && beforeClose && (await beforeClose()) === false) return;
      closed = true;
      stack.splice(stack.indexOf(api), 1);
      root.classList.remove('is-open');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(() => {
        root.remove();
        if (!stack.length) document.documentElement.classList.remove('has-modal');
      }, 200);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
      api.onClose?.();
    },
    onClose: null,
  };
  stack.push(api);

  function onKey(event) {
    if (stack.at(-1) !== api) return;
    if (event.key === 'Escape' && dismissible) { event.preventDefault(); api.close(); }
    if (event.key === 'Tab') {
      const items = qsa(FOCUSABLE, root).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }
  document.addEventListener('keydown', onKey, true);
  root.addEventListener('click', (event) => { if (dismissible && event.target.closest('[data-close]')) api.close(); });
  setTimeout(() => (qs('[autofocus]', root) ?? qs(FOCUSABLE, body))?.focus({ preventScroll: true }), 60);
  return api;
}

export function confirmDialog({ title, text, confirmLabel, danger = false }) {
  return new Promise((resolve) => {
    let answer = false;
    const dialog = modal({
      title, size: 'sm',
      content: html`<p class="mx-muted">${text}</p>
        <div class="mx-actions">
          <button type="button" class="mx-btn mx-btn--ghost" data-close>${t('confirm.cancel')}</button>
          <button type="button" class="mx-btn ${danger ? 'mx-btn--danger' : 'mx-btn--primary'}" data-ok autofocus>${confirmLabel}</button>
        </div>`,
    });
    dialog.onClose = () => resolve(answer);
    qs('[data-ok]', dialog.root).addEventListener('click', () => { answer = true; dialog.close(true); });
  });
}

export async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.className = 'mx-offscreen';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

/** Saves text as a downloaded file (Blob URL, CSP-safe). */
export function downloadText(filename, content) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const errorText = (error) => error?.message || t('common.error');
