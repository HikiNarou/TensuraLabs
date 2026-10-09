/**
 * Minimal RFC 5322 / 2045 / 2047 message builder for outgoing mail (no external dependency).
 * Produces CRLF-terminated, 7-bit safe MIME: headers are encoded-words, bodies are base64.
 */
import crypto from 'node:crypto';

const CRLF = '\r\n';
const isAscii = (value) => /^[\x20-\x7e]*$/.test(value);

/** RFC 2047 "B" encoded-words, split so every word stays under 75 characters. */
export function encodeHeaderValue(value) {
  const text = String(value ?? '').replace(/[\r\n]+/g, ' ');
  if (isAscii(text)) return text;
  const words = [];
  let chunk = '';
  for (const char of text) {
    if (Buffer.byteLength(chunk + char) > 42) { words.push(chunk); chunk = ''; }
    chunk += char;
  }
  if (chunk) words.push(chunk);
  return words.map((word) => `=?UTF-8?B?${Buffer.from(word).toString('base64')}?=`).join(`${CRLF} `);
}

/** Formats `Name <user@domain>`; quotes or encodes the display name as needed. */
export function formatAddress({ address, name = '' }) {
  const display = String(name ?? '').replace(/[\r\n"]+/g, ' ').trim();
  if (!display) return address;
  return `${isAscii(display) ? `"${display.replace(/\\/g, '\\\\')}"` : encodeHeaderValue(display)} <${address}>`;
}

const wrapBase64 = (buffer) => buffer.toString('base64').replace(/.{1,76}/g, (line) => `${line}${CRLF}`);
const boundary = (tag) => `----=_TL_${tag}_${crypto.randomBytes(12).toString('hex')}`;
const headerLines = (headers) => Object.entries(headers)
  .filter(([, value]) => value !== undefined && value !== null && value !== '')
  .map(([key, value]) => `${key}: ${value}`).join(CRLF);

function attachmentPart({ filename, contentType, content }) {
  const name = String(filename).replace(/[\r\n"\\]+/g, '_');
  const encodedName = isAscii(name) ? `"${name}"` : `"${encodeHeaderValue(name).replace(/\r\n /g, ' ')}"`;
  const star = isAscii(name) ? '' : `; filename*=UTF-8''${encodeURIComponent(name)}`;
  return `${headerLines({
    'Content-Type': `${contentType || 'application/octet-stream'}; name=${encodedName}`,
    'Content-Transfer-Encoding': 'base64',
    'Content-Disposition': `attachment; filename=${encodedName}${star}`,
  })}${CRLF}${CRLF}${wrapBase64(content)}`;
}

export const createMessageId = (domain) => `<${crypto.randomUUID()}@${domain}>`;

/**
 * Builds a complete message. Returns { raw: Buffer, messageId }.
 * @param {object} message { from, to[], cc[], replyTo, subject, text, html, messageId, inReplyTo, references, date, attachments[] }
 */
export function buildMime(message) {
  const domain = message.from.address.split('@')[1] ?? 'localhost';
  const messageId = message.messageId ?? createMessageId(domain);
  const text = String(message.text ?? '').replace(/\r?\n/g, CRLF);
  const textPart = `${headerLines({ 'Content-Type': 'text/plain; charset=UTF-8', 'Content-Transfer-Encoding': 'base64' })}${CRLF}${CRLF}${wrapBase64(Buffer.from(text))}`;
  let body = textPart;
  let contentType = 'text/plain; charset=UTF-8';
  let transfer = 'base64';
  let bodyContent = wrapBase64(Buffer.from(text));

  if (message.html) {
    const alt = boundary('alt');
    const htmlPart = `${headerLines({ 'Content-Type': 'text/html; charset=UTF-8', 'Content-Transfer-Encoding': 'base64' })}${CRLF}${CRLF}${wrapBase64(Buffer.from(String(message.html)))}`;
    body = `--${alt}${CRLF}${textPart}--${alt}${CRLF}${htmlPart}--${alt}--${CRLF}`;
    contentType = `multipart/alternative; boundary="${alt}"`;
    transfer = undefined;
    bodyContent = body;
  }

  if (message.attachments?.length) {
    const mixed = boundary('mix');
    const first = message.html
      ? `Content-Type: ${contentType}${CRLF}${CRLF}${body}`
      : textPart;
    bodyContent = [`--${mixed}${CRLF}${first}`, ...message.attachments.map((file) => `--${mixed}${CRLF}${attachmentPart(file)}`)].join('')
      + `--${mixed}--${CRLF}`;
    contentType = `multipart/mixed; boundary="${mixed}"`;
    transfer = undefined;
  }

  const headers = headerLines({
    From: formatAddress(message.from),
    To: message.to.map((address) => formatAddress(typeof address === 'string' ? { address } : address)).join(`,${CRLF} `),
    Cc: message.cc?.length ? message.cc.map((address) => formatAddress(typeof address === 'string' ? { address } : address)).join(`,${CRLF} `) : '',
    'Reply-To': message.replyTo ? formatAddress(typeof message.replyTo === 'string' ? { address: message.replyTo } : message.replyTo) : '',
    Subject: encodeHeaderValue(message.subject ?? ''),
    Date: (message.date ?? new Date()).toUTCString().replace('GMT', '+0000'),
    'Message-ID': messageId,
    'In-Reply-To': message.inReplyTo ?? '',
    References: message.references ?? '',
    'MIME-Version': '1.0',
    'X-Mailer': 'TensuraLabs Mail',
    'Content-Type': contentType,
    'Content-Transfer-Encoding': transfer,
  });
  return { raw: Buffer.from(`${headers}${CRLF}${CRLF}${bodyContent}`), messageId };
}
