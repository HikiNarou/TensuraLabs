import { qsa } from '../core/dom.js';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let openCount = 0;

/** Accessible modal dialog with focus trap, ESC/backdrop close, and scroll lock. */
export function createModal({ className = '', label, onClose } = {}) {
  const root = document.createElement('div');
  root.className = `modal ${className}`.trim();
  root.hidden = true;
  root.innerHTML = '<div class="modal__backdrop" data-close></div><div class="modal__dialog" role="dialog" aria-modal="true" tabindex="-1"></div>';
  const dialog = root.querySelector('.modal__dialog');
  if (label) dialog.setAttribute('aria-label', label);
  document.body.append(root);

  let returnFocus = null;
  let isOpen = false;

  function onKeydown(event) {
    if (event.key === 'Escape') { event.stopPropagation(); close(); return; }
    if (event.key !== 'Tab') return;
    const items = qsa(FOCUSABLE, dialog).filter((el) => el.offsetParent !== null);
    if (!items.length) { event.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  root.addEventListener('click', (event) => { if (event.target.closest('[data-close]')) close(); });

  function open() {
    if (isOpen) return;
    isOpen = true;
    returnFocus = document.activeElement;
    root.hidden = false;
    openCount += 1;
    document.documentElement.classList.add('is-modal-open');
    document.addEventListener('keydown', onKeydown, true);
    requestAnimationFrame(() => {
      root.classList.add('is-open');
      (dialog.querySelector('[autofocus]') ?? dialog).focus({ preventScroll: true });
    });
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    root.classList.remove('is-open');
    document.removeEventListener('keydown', onKeydown, true);
    openCount = Math.max(0, openCount - 1);
    if (!openCount) document.documentElement.classList.remove('is-modal-open');
    const finish = () => { if (!isOpen) root.hidden = true; };
    dialog.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, 400);
    returnFocus?.focus?.({ preventScroll: true });
    onClose?.();
  }

  return {
    root,
    dialog,
    open,
    close,
    get isOpen() { return isOpen; },
    destroy() { close(); root.remove(); },
  };
}
