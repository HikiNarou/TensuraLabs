/**
 * Site-wide settings store (brand, theme, contact, SEO, home content). Loaded once at boot from
 * the public API; the admin console can push unsaved drafts into a preview iframe via postMessage.
 */
import { request } from './api.js';
import { getLang, setLang } from './i18n.js';

const listeners = new Set();
const PREVIEW_MESSAGE = 'tl:preview-settings';
let site = null;
let home = null;

export const isPreview = new URLSearchParams(location.search).get('preview') === '1' && window.parent !== window;

/** Picks the current-locale branch of a { id, en } object (falls back to Indonesian). */
export const pick = (value, lang = getLang()) => value?.[lang] ?? value?.id ?? {};

export async function loadSettings(fallback) {
  const [siteData, homeData] = await Promise.all([
    request('/api/site').catch(() => null),
    request('/api/home').catch(() => null),
  ]);
  site = siteData ?? fallback.site;
  home = homeData ?? fallback.home;
  applyTheme();
  return { site, home };
}

export const getSite = () => site;
export const getHome = () => pick(home);

export function onSettingsChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Exposes theme colours as CSS custom properties (validated #RRGGBB on the server). */
export function applyTheme() {
  const theme = site?.theme;
  if (!theme) return;
  const root = document.documentElement.style;
  const hex = (value, fallback) => (/^#[0-9a-f]{6}$/i.test(value ?? '') ? value : fallback);
  const rgb = (value) => [1, 3, 5].map((i) => Number.parseInt(value.slice(i, i + 2), 16)).join(', ');
  const accent = hex(theme.accent, '#5ea8ff');
  const accent2 = hex(theme.accent2, '#b59bff');
  root.setProperty('--slime', accent);
  root.setProperty('--accent', accent);
  root.setProperty('--accent-rgb', rgb(accent));
  root.setProperty('--accent-2', accent2);
  root.setProperty('--accent-2-rgb', rgb(accent2));
  root.setProperty('--highlight', hex(theme.highlight, '#e8d7ab'));
  root.setProperty('--surface', hex(theme.surface, '#0a0c1e'));
  const motion = site.motion ?? {};
  document.documentElement.classList.toggle('no-parallax', motion.parallax === false);
  document.documentElement.classList.toggle('no-reveal', motion.smoothReveal === false);
}

/** In preview mode the admin console streams draft settings; apply them live. */
export function listenForPreview() {
  if (!isPreview) return;
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    const { type, payload } = event.data ?? {};
    if (type !== PREVIEW_MESSAGE || !payload || typeof payload !== 'object') return;
    if (payload.site) site = { ...payload.site, name: payload.site.brand?.name ?? site?.name };
    if (payload.home) home = payload.home;
    if (payload.lang && payload.lang !== getLang()) setLang(payload.lang, { persist: false });
    applyTheme();
    listeners.forEach((listener) => listener({ site, home }));
  });
  window.parent.postMessage({ type: 'tl:preview-ready' }, location.origin);
}
