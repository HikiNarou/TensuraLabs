/** Small DOM helpers. All interpolated values in `html` are escaped unless wrapped with `raw`. */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
const RAW = Symbol('raw');

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"'`]/g, (char) => ESCAPES[char]);

export const raw = (value) => ({ [RAW]: true, value: String(value ?? '') });

function serialize(value) {
  if (value === null || value === undefined || value === false) return '';
  if (Array.isArray(value)) return value.map(serialize).join('');
  if (typeof value === 'object' && value[RAW]) return value.value;
  return escapeHtml(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, index) => { out += serialize(value) + strings[index + 1]; });
  return raw(out);
}

/** Renders an html`` result into a DocumentFragment (or replaces children of a target). */
/**
 * CSP-safe CSS custom properties: templates use `data-vars="--i:2;--v:40%"` instead of
 * inline `style` attributes (blocked by `style-src 'self'`); values are applied via CSSOM.
 */
export function applyVars(root) {
  const nodes = root.querySelectorAll ? root.querySelectorAll('[data-vars]') : [];
  const list = root.matches?.('[data-vars]') ? [root, ...nodes] : nodes;
  for (const node of list) {
    for (const pair of node.dataset.vars.split(';')) {
      const index = pair.indexOf(':');
      if (index < 0) continue;
      const name = pair.slice(0, index).trim();
      if (name.startsWith('--')) node.style.setProperty(name, pair.slice(index + 1).trim());
    }
  }
  return root;
}

export function render(target, template) {
  target.innerHTML = template.value;
  return applyVars(target);
}

export function fragment(template) {
  const tpl = document.createElement('template');
  tpl.innerHTML = template.value.trim();
  const node = tpl.content.firstElementChild;
  return node ? applyVars(node) : node;
}

export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/** Registers an event listener and returns a disposer. */
export function on(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}

/** Collects disposers so pages can clean up everything on unmount. */
export function createDisposer() {
  const disposers = new Set();
  return {
    add(fn) { if (typeof fn === 'function') disposers.add(fn); return fn; },
    on(target, type, handler, options) { return this.add(on(target, type, handler, options)); },
    run() { for (const fn of disposers) { try { fn(); } catch (error) { console.error(error); } } disposers.clear(); },
  };
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const isMobileViewport = () => window.matchMedia('(max-width: 768px)').matches;
export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

export function formatDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Preloads images and resolves when all have loaded or failed (never rejects). */
export function preloadImages(urls, timeoutMs = 12000) {
  const unique = [...new Set(urls.filter(Boolean))];
  return Promise.all(unique.map((url) => new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(resolve, timeoutMs);
    img.onload = img.onerror = () => { clearTimeout(timer); resolve(); };
    img.decoding = 'async';
    img.src = url;
  })));
}
