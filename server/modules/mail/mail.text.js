/** Text helpers for e-mail content: HTML → plain text, snippets, remote-content detection, filenames. */

const NAMED_ENTITIES = Object.freeze({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™', hellip: '…',
  mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', middot: '·', euro: '€', zwnj: '', zwj: '',
});

export function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Converts e-mail HTML into readable plain text (used for search, snippets, and text-only clients). */
export function htmlToText(html) {
  if (!html) return '';
  return decodeEntities(String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(head|style|script|title|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|section|article|header|footer|h[1-6]|li|tr|table|blockquote|pre|ul|ol)\s*>/gi, '\n')
    .replace(/<(td|th)\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ''))
    .replace(/\r/g, '')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const snippetOf = (text, max = 180) => {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
};

/** True when the HTML would load anything from the network (tracking pixels, remote images/fonts/CSS). */
export function hasRemoteContent(html) {
  if (!html) return false;
  return /\b(?:src|background|poster|srcset)\s*=\s*["']?\s*(?:https?:)?\/\//i.test(html)
    || /url\(\s*["']?\s*(?:https?:)?\/\//i.test(html)
    || /@import\s+(?:url\()?\s*["']?\s*(?:https?:)?\/\//i.test(html);
}

/** Keeps a filename safe for storage and Content-Disposition. */
export function safeFilename(name, fallback = 'lampiran') {
  const cleaned = String(name ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f"\\/:*?<>|]+/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 180);
  return cleaned || fallback;
}

/** RFC 6266 / 5987 Content-Disposition value with an ASCII fallback. */
export function contentDisposition(type, filename) {
  const name = safeFilename(filename);
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/[%;]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Turns plain text into simple, escaped HTML paragraphs (used when sending text-only compositions). */
export function textToHtml(text) {
  const escape = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const body = String(text ?? '').replace(/\r\n?/g, '\n').split(/\n{2,}/).map((block) => {
    const quoted = block.split('\n').every((line) => line.startsWith('>'));
    const inner = escape(block).replace(/\n/g, '<br>');
    return quoted
      ? `<blockquote style="margin:0 0 0 .8ex;border-left:2px solid #c7cbd8;padding-left:1ex;color:#555">${inner.replace(/(^|<br>)&gt; ?/g, '$1')}</blockquote>`
      : `<p style="margin:0 0 1em">${inner}</p>`;
  }).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1d2130">${body}</body></html>`;
}
