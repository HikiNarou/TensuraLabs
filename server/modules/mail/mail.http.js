/** HTTP helpers shared by the public mail app and the admin console for reading message content. */
import { contentDisposition, safeFilename } from './mail.text.js';
import { emailDocumentPolicy, renderEmailDocument } from './mail.service.js';

const INLINE_IMAGE = /^image\/(png|jpe?g|gif|webp|bmp|avif)$/;

const noStore = (res) => res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });

/** Serves the sandboxed HTML body. `attachmentBase` is the URL prefix for this message's attachments. */
export function sendMessageHtml(res, repo, message, { allowRemote, attachmentBase }) {
  const html = repo.messageHtml(message.id);
  const document = renderEmailDocument(html || '<p style="color:#667">(Tidak ada konten HTML)</p>', {
    inline: repo.inlineAttachments(message.id),
    attachmentUrl: (id) => `${attachmentBase}/${id}?inline=1`,
    allowRemote,
  });
  noStore(res);
  res.set({ 'Content-Security-Policy': emailDocumentPolicy(allowRemote), 'X-Frame-Options': 'SAMEORIGIN', 'Cross-Origin-Resource-Policy': 'same-origin' });
  res.type('html').send(document);
}

/** Downloads the original MIME source as .eml. */
export function sendMessageRaw(res, repo, message) {
  const row = repo.messageRaw(message.id);
  if (!row?.raw) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Sumber email tidak tersedia' } }); return; }
  noStore(res);
  const name = safeFilename(`${(row.subject || 'email').slice(0, 80)}.eml`);
  res.set({ 'Content-Type': 'message/rfc822', 'Content-Disposition': contentDisposition('attachment', name), 'Content-Security-Policy': "default-src 'none'; sandbox" });
  res.send(Buffer.from(row.raw));
}

/** Streams one attachment. Only well-known raster images may be shown inline; everything else downloads. */
export function sendAttachment(res, file, { inline = false } = {}) {
  noStore(res);
  const showInline = inline && INLINE_IMAGE.test(file.contentType);
  res.set({
    'Content-Type': showInline ? file.contentType : 'application/octet-stream',
    'Content-Disposition': contentDisposition(showInline ? 'inline' : 'attachment', file.filename),
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Length': String(file.data.length),
  });
  res.send(Buffer.from(file.data));
}
