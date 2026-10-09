const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeText = (value) => String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);

/**
 * Minimal, XSS-safe Markdown renderer for article bodies.
 * Input is escaped first; only a whitelisted syntax subset is converted to HTML.
 */
function inline(text) {
  return escapeText(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/g, (_, label, href) => {
      const external = href.startsWith('http');
      return `<a href="${href}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
    });
}

export function renderMarkdown(source) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.type}>${list.items.map((item) => `<li>${inline(item)}</li>`).join('')}</${list.type}>`);
    list = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    let match;
    if (!trimmed) { flushParagraph(); flushList(); continue; }
    if ((match = /^(#{2,4})\s+(.+)$/.exec(trimmed))) {
      flushParagraph(); flushList();
      const level = match[1].length;
      out.push(`<h${level}>${inline(match[2])}</h${level}>`);
      continue;
    }
    if ((match = /^[-*]\s+(.+)$/.exec(trimmed)) || (match = /^\d+[.)]\s+(.+)$/.exec(trimmed))) {
      flushParagraph();
      const type = /^\d/.test(trimmed) ? 'ol' : 'ul';
      if (!list || list.type !== type) { flushList(); list = { type, items: [] }; }
      list.items.push(match[1]);
      continue;
    }
    flushList();
    paragraph.push(trimmed);
  }
  flushParagraph();
  flushList();
  return out.join('\n');
}
