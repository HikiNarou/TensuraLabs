/**
 * The ordered, full-screen "sections" of the site. Vertical scroll / swipe / keyboard
 * intents move between neighbours; menu jumps pick the liquid direction from the order.
 * Sections other than home can be hidden from the admin console (`configureSections`).
 */
const ALL_SECTIONS = Object.freeze([
  Object.freeze({ route: 'home', path: '/', label: 'nav.home', cipher: 'menu.cipher.home' }),
  Object.freeze({ route: 'squad', path: '/squad', label: 'nav.squad', cipher: 'menu.cipher.squad' }),
  Object.freeze({ route: 'news', path: '/news', label: 'nav.news', cipher: 'menu.cipher.news', match: ['news', 'news-detail'] }),
  Object.freeze({ route: 'gallery', path: '/gallery', label: 'nav.gallery', cipher: 'menu.cipher.gallery' }),
  Object.freeze({ route: 'world', path: '/world', label: 'nav.world', cipher: 'menu.cipher.world' }),
]);

/** Live list of enabled sections (mutated in place so importers always see the current order). */
export const SECTIONS = [...ALL_SECTIONS];

/** Applies the admin's section visibility map, e.g. { squad: true, news: false, ... }. */
export function configureSections(enabled = {}) {
  const next = ALL_SECTIONS.filter((section) => section.route === 'home' || enabled[section.route] !== false);
  SECTIONS.splice(0, SECTIONS.length, ...next);
}

export const isSectionEnabled = (route) => SECTIONS.some((section) => section.route === route || section.match?.includes(route));

/** Index of a route in the section order, or -1 for routes that are not sections (article, legal, 404). */
export const sectionIndex = (routeName) => SECTIONS.findIndex((section) => section.route === routeName);

/** Neighbouring section in a direction ('down' | 'up'), or null at either end. */
export function adjacentSection(routeName, direction) {
  const index = sectionIndex(routeName);
  if (index < 0) return null;
  return SECTIONS[index + (direction === 'down' ? 1 : -1)] ?? null;
}

/** Liquid transition between two sections, chosen by their order; null when not both are sections. */
export function sectionTransition(fromRoute, toRoute) {
  const from = sectionIndex(fromRoute);
  const to = sectionIndex(toRoute);
  if (from < 0 || to < 0 || from === to) return null;
  return to > from ? 'liquid-down' : 'liquid-up';
}

/** Two-digit display index, e.g. "#03". */
export const sectionNumber = (index) => `#${String(index + 1).padStart(2, '0')}`;
