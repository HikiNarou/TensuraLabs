/** Pure pagination helpers (no DOM), shared by list pages and covered by unit tests. */

export const PAGE_WINDOW = 1; // page links shown on each side of the current page before collapsing to "…"

/** Page numbers to render, with null marking a gap: [1, null, 4, 5, 6, null, 12]. */
export function paginationItems(page, totalPages, windowSize = PAGE_WINDOW) {
  const pages = new Set([1, totalPages]);
  for (let p = page - windowSize; p <= page + windowSize; p += 1) if (p >= 1 && p <= totalPages) pages.add(p);
  // Avoid a lone "…" that would hide a single page.
  if (page - windowSize - 1 === 2) pages.add(2);
  if (page + windowSize + 1 === totalPages - 1) pages.add(totalPages - 1);
  const sorted = [...pages].sort((a, b) => a - b);
  const items = [];
  sorted.forEach((p, index) => {
    if (index && p - sorted[index - 1] > 1) items.push(null);
    items.push(p);
  });
  return items;
}
