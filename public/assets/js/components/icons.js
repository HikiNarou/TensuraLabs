/* Inline SVG icon set (original artwork). Values are trusted markup wrapped with raw(). */
import { raw } from '../core/dom.js';

const svg = (body, viewBox = '0 0 24 24', extra = '') => `<svg viewBox="${viewBox}" aria-hidden="true" focusable="false" ${extra}>${body}</svg>`;

const ICON_MARKUP = {
  logoMark: svg('<path d="M12.4 3.2c4 .1 7.6 3 7.8 7.3.3 4.7-2.6 9.3-7.6 10.1-4.6.7-8.6-2.4-8.9-6.9C3.4 9 7.6 3.1 12.4 3.2Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.2 9.6 7.6 12.3l2.6 2.7M13.8 9.6l2.6 2.7-2.6 2.7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'),
  menu: svg('<path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/>'),
  close: svg('<path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/>'),
  user: svg('<path d="M12 3a5 5 0 0 1 5 5v1.2a5 5 0 0 1-10 0V8a5 5 0 0 1 5-5Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10.6 9.4h2.8v4.2h-2.8z" fill="currentColor"/><path d="M4.5 21c.8-3.6 3.8-6 7.5-6s6.7 2.4 7.5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  globe: svg('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3Z" fill="none" stroke="currentColor" stroke-width="1.8"/>'),
  share: svg('<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 12.5a7 7 0 1 0 14 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
  audioOn: svg('<path d="M4 14v-2a8 8 0 0 1 16 0v2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="3" y="13" width="4.5" height="7" rx="1.6" fill="currentColor"/><rect x="16.5" y="13" width="4.5" height="7" rx="1.6" fill="currentColor"/><path class="audio-wave" d="M10 17v-3M12 18v-5M14 17v-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
  audioOff: svg('<path d="M4 14v-2a8 8 0 0 1 16 0v2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="3" y="13" width="4.5" height="7" rx="1.6" fill="currentColor"/><rect x="16.5" y="13" width="4.5" height="7" rx="1.6" fill="currentColor"/><path d="M4 4l16 16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
  chevronDown: svg('<path d="M3 6l9 7 9-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M8 13l4 3 4-3" fill="none" stroke="currentColor" stroke-width="1.6"/>'),
  arrowLeft: svg('<path d="M15 5l-7 7 7 7" fill="currentColor"/>'),
  arrowRight: svg('<path d="M9 5l7 7-7 7" fill="currentColor"/>'),
  plus: svg('<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  diamond: svg('<path d="M12 2l5 10-5 10-5-10z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/>'),
  sparkle: svg('<path d="M12 2c.8 4.6 2.6 6.9 8 10-5.4 3.1-7.2 5.4-8 10-.8-4.6-2.6-6.9-8-10 5.4-3.1 7.2-5.4 8-10Z" fill="currentColor"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),
  play: svg('<path d="M8 5v14l11-7z" fill="currentColor"/>'),
  external: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  whatsapp: svg('<path d="M12 2.5a9.5 9.5 0 0 0-8.2 14.3L2.5 21.5l4.8-1.3A9.5 9.5 0 1 0 12 2.5Z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8.6 7.6c.3-.6.6-.6 1-.6h.6c.2 0 .4 0 .6.5l.8 1.9c.1.3 0 .5-.1.7l-.6.7c-.2.2-.2.4 0 .7.5.9 1.2 1.7 2.1 2.3.4.3.7.4 1 .2l.8-.9c.2-.3.5-.3.8-.2l1.8.9c.3.1.5.3.5.5 0 .6-.3 1.6-1.4 2.1-1 .4-2.3.4-4.2-.6-2.1-1.1-3.6-3-4.2-4.3-.6-1.4-.3-2.6.1-3.2Z" fill="currentColor"/>'),
  github: svg('<path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.4 1.1 2.9.8.1-.7.4-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z" fill="currentColor"/>'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 6.5 12 13l8.5-6.5" fill="none" stroke="currentColor" stroke-width="1.8"/>'),
  linkedin: svg('<rect x="3" y="3" width="18" height="18" rx="3" fill="currentColor"/><path d="M7.5 10v7M7.5 7v.1M11 17v-7M11 13.2c0-2 1.2-3.2 2.8-3.2 1.6 0 2.7 1 2.7 3.2V17" stroke="#0b0b0f" stroke-width="2" stroke-linecap="round" fill="none"/>'),
  instagram: svg('<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="17.3" cy="6.7" r="1.2" fill="currentColor"/>'),
  x: svg('<path d="M4 4l16 16M20 4L4 20" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'),
  link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  code: svg('<path d="M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
  layers: svg('<path d="M12 3 2.5 8 12 13l9.5-5L12 3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m2.5 12.5 9.5 5 9.5-5M2.5 16.5l9.5 5 9.5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
  cloud: svg('<path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.5 9.6 4.5 4.5 0 0 0 7 18.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 11.5v5M9.8 13.7 12 11.5l2.2 2.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'),
  brain: svg('<path d="M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5.2A3.2 3.2 0 0 0 7.5 18 2.5 2.5 0 0 0 12 19.5V6a2 2 0 0 0-3-1.5ZM15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5.2 3.2 3.2 0 0 1-3.5 5.3A2.5 2.5 0 0 1 12 19.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 9.5h-2M12 14h2.5M9 12H7.5M16.5 10H15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'),
  bolt: svg('<path d="M13.5 2.5 4.5 13.5h6.5l-1 8 9-11h-6.5l1-8Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'),
  shield: svg('<path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.3 7.5 9.5 4.4-1.2 7.5-4.9 7.5-9.5V6L12 3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m8.8 12 2.2 2.2 4.3-4.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
  mobile: svg('<rect x="6.5" y="2.5" width="11" height="19" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10.5 18.5h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
  chart: svg('<path d="M3.5 20.5h17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M6.5 16.5v-4M11 16.5v-8M15.5 16.5v-6M20 16.5V5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
  database: svg('<ellipse cx="12" cy="5.5" rx="7.5" ry="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 5.5v13c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-13M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" fill="none" stroke="currentColor" stroke-width="1.8"/>'),
  users: svg('<circle cx="9" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M2.5 20c.6-3.6 3.2-5.7 6.5-5.7s5.9 2.1 6.5 5.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M15.5 4.8a3.4 3.4 0 0 1 0 6.4M18 14.6c2 .7 3.2 2.5 3.5 5.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
  quote: svg('<path d="M10 6.5C6.5 7.6 4.5 10.3 4.5 14v3.5h5.5V12H7.3c.2-1.9 1.3-3.1 3.2-3.8L10 6.5ZM19.5 6.5c-3.5 1.1-5.5 3.8-5.5 7.5v3.5h5.5V12h-2.7c.2-1.9 1.3-3.1 3.2-3.8l-.5-1.7Z" fill="currentColor"/>'),
  arrowUpRight: svg('<path d="M7 17 17 7M8.5 7H17v8.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
  chevron: svg('<path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
  phone: svg('<path d="M6.6 3.5h2.6l1.5 4.2-2 1.3a11 11 0 0 0 6.3 6.3l1.3-2 4.2 1.5v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'),
  pin: svg('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="10" r="2.4" fill="none" stroke="currentColor" stroke-width="1.8"/>'),
  terminal: svg('<rect x="2.5" y="4" width="19" height="16" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m6.5 9 3 3-3 3M12 15h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
  crossed: svg('<path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/><path d="M3 3c2 .2 3 1.2 3.2 3.2M21 3c-2 .2-3 1.2-3.2 3.2M3 21c2-.2 3-1.2 3.2-3.2M21 21c-2-.2-3-1.2-3.2-3.2" stroke="currentColor" stroke-width="1.4" fill="none"/>'),
};

export const icons = Object.freeze(Object.fromEntries(Object.entries(ICON_MARKUP).map(([name, markup]) => [name, raw(markup)])));

/** Ornamental flourish used under titles and menu rows. */
export const flourish = raw(`<svg class="flourish" viewBox="0 0 120 16" aria-hidden="true" focusable="false"><path d="M0 8h70c6 0 8-6 14-6 5 0 7 4 4 6-3 2-7 0-5-3M88 8c6 0 9 6 16 6 6 0 10-4 16-6" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>`);

/** Logo lockup: TENSURA ◉ LABS rendered as text + gel-and-brackets emblem. */
export const logo = raw(`<span class="logo" aria-label="TensuraLabs"><span class="logo__word">TENSURA</span><span class="logo__mark">${ICON_MARKUP.logoMark}</span><span class="logo__word">LABS</span></span>`);
