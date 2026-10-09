/** Reading pane: header, safe HTML iframe (auto-height), plain-text view, attachments, verification-code shortcut. */
import { html } from '../core/dom.js';
import { mailApi } from './api.js';
import { icons } from './icons.js';
import { fmtBytes, fmtDateTime, t } from './i18n.js';

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+[^\s<>"'`.,;:!?)\]]/gi;
const CODE_HINT = /(code|kode|otp|pin|passcode|verif|token|konfirmasi|confirm|one[- ]time|sekali pakai)/i;

/** Finds a likely one-time verification code (4–8 digits, or 6–8 alphanumerics with a digit) near a hint word. */
export function findVerificationCode(message) {
  const haystack = `${message.subject ?? ''}\n${String(message.textBody ?? message.snippet ?? '').slice(0, 4000)}`;
  if (!CODE_HINT.test(haystack)) return '';
  const near = new RegExp(`${CODE_HINT.source}[^\\n]{0,60}?\\b(\\d{4,8}|(?=[A-Z0-9]*\\d)[A-Z0-9]{6,8})\\b`, 'i').exec(haystack);
  if (near) return near[2];
  const lone = /(?:^|\s)(\d{4,8})(?:\s|$)/m.exec(haystack);
  return lone ? lone[1] : '';
}

/** Escaped plain text with clickable http(s) links. */
function linkify(text) {
  const out = [];
  let last = 0;
  for (const match of String(text).matchAll(URL_PATTERN)) {
    out.push(String(text).slice(last, match.index));
    out.push(html`<a href="${match[0]}" target="_blank" rel="noopener noreferrer nofollow">${match[0]}</a>`);
    last = match.index + match[0].length;
  }
  out.push(String(text).slice(last));
  return out;
}

const person = (name, address) => (name ? html`<b>${name}</b> <span class="mx-muted">&lt;${address}&gt;</span>` : html`<b>${address}</b>`);
const people = (list) => list.map((entry, index) => html`${index ? ', ' : ''}${entry.name ? html`${entry.name} <span class="mx-muted">&lt;${entry.address}&gt;</span>` : entry.address}`);

function authBadge(label, value) {
  if (!value) return '';
  const tone = value === 'pass' ? 'ok' : ['fail', 'softfail', 'permerror'].includes(value) ? 'danger' : 'muted';
  return html`<span class="mx-badge mx-badge--${tone}" title="${t('read.auth')}">${label} ${value}</span>`;
}

export function readerEmpty() {
  return html`<div class="mx-read__empty">
    <span class="mx-read__empty-icon">${icons.mailOpen}</span>
    <h3>${t('read.empty')}</h3>
    <p class="mx-muted">${t('read.emptyText')}</p>
  </div>`;
}

export function readerLoading() {
  return html`<div class="mx-read__inner"><div class="mx-skel mx-skel--title"></div><div class="mx-skel mx-skel--line"></div><div class="mx-skel mx-skel--block"></div></div>`;
}

/** Full reader template. `view` is "html" or "text"; `images` toggles remote content. */
export function readerTemplate({ mailbox, message, view, images }) {
  const showHtml = message.hasHtml && view === 'html';
  const files = (message.attachments ?? []).filter((file) => file.disposition === 'attachment' || !message.hasHtml);
  const code = message.direction === 'in' ? findVerificationCode(message) : '';
  const canReply = mailbox.canSend && !mailbox.expired && mailbox.isActive;
  return html`
    <div class="mx-read__inner">
      <div class="mx-read__bar">
        <button type="button" class="mx-icon-btn mx-read__back" data-action="close-message" aria-label="${t('read.back')}">${icons.back}</button>
        <div class="mx-read__tools">
          ${canReply ? html`
            <button type="button" class="mx-icon-btn" data-action="reply" title="${t('read.reply')}" aria-label="${t('read.reply')}">${icons.reply}</button>
            <button type="button" class="mx-icon-btn" data-action="forward" title="${t('read.forward')}" aria-label="${t('read.forward')}">${icons.forward}</button>` : ''}
          <button type="button" class="mx-icon-btn ${message.isStarred ? 'is-starred' : ''}" data-action="star-open" aria-pressed="${message.isStarred}" title="${t('read.star')}" aria-label="${t('read.star')}">${message.isStarred ? icons.starFill : icons.star}</button>
          ${message.direction === 'in' ? html`<button type="button" class="mx-icon-btn" data-action="unread-open" title="${t('read.unread')}" aria-label="${t('read.unread')}">${icons.mail}</button>` : ''}
          <a class="mx-icon-btn" href="${mailApi.rawUrl(mailbox.id, message.id)}" download title="${t('read.source')}" aria-label="${t('read.source')}">${icons.download}</a>
          <button type="button" class="mx-icon-btn mx-icon-btn--danger" data-action="delete-open" title="${t('read.delete')}" aria-label="${t('read.delete')}">${icons.trash}</button>
        </div>
      </div>

      <h2 class="mx-read__subject">${message.subject || t('list.noSubject')}</h2>
      <div class="mx-read__meta">
        <span class="mx-avatar" aria-hidden="true">${(message.direction === 'out' ? mailbox.address : (message.fromName || message.fromAddress || '?')).trim().charAt(0).toUpperCase()}</span>
        <dl class="mx-read__people">
          <div><dt>${t('read.from')}</dt><dd>${message.direction === 'out' ? html`<b>${mailbox.address}</b>${message.sentByName ? html` <span class="mx-muted">· ${message.sentByName}</span>` : ''}` : person(message.fromName, message.fromAddress || t('common.unknownSender'))}</dd></div>
          <div><dt>${t('read.to')}</dt><dd>${people(message.toList ?? [])}</dd></div>
          ${message.ccList?.length ? html`<div><dt>${t('read.cc')}</dt><dd>${people(message.ccList)}</dd></div>` : ''}
          ${message.replyTo && message.replyTo !== message.fromAddress ? html`<div><dt>${t('read.replyTo')}</dt><dd>${message.replyTo}</dd></div>` : ''}
          <div><dt>${t('read.date')}</dt><dd>${fmtDateTime(message.createdAt)}</dd></div>
        </dl>
        <div class="mx-read__badges">${authBadge('SPF', message.spf)}${authBadge('DKIM', message.dkim)}
          ${message.direction === 'out' && message.provider ? html`<span class="mx-badge mx-badge--muted">${t('read.sentBy', { provider: message.provider })}</span>` : ''}</div>
      </div>

      ${code ? html`<button type="button" class="mx-code-chip" data-action="copy-code" data-code="${code}">${icons.key}<span>${t('read.copyCode', { code })}</span><b>${code}</b>${icons.copy}</button>` : ''}

      ${message.hasHtml ? html`<div class="mx-read__switch">
        ${message.textBody ? html`<div class="mx-seg" role="group">
          <button type="button" class="${view === 'html' ? 'is-active' : ''}" data-action="view" data-view="html" aria-pressed="${view === 'html'}">${t('read.viewHtml')}</button>
          <button type="button" class="${view === 'text' ? 'is-active' : ''}" data-action="view" data-view="text" aria-pressed="${view === 'text'}">${t('read.viewText')}</button>
        </div>` : html`<span></span>`}
        ${showHtml && message.hasRemoteContent ? html`<div class="mx-remote ${images ? 'is-on' : ''}">${icons.image}<span>${images ? '' : t('read.remote')}</span>
          <button type="button" class="mx-link-btn" data-action="images">${images ? t('read.remoteHide') : t('read.remoteShow')}</button></div>` : ''}
      </div>` : ''}

      <div class="mx-read__body">
        ${showHtml
          ? html`<iframe class="mx-frame" title="${message.subject || t('list.noSubject')}" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              referrerpolicy="no-referrer" loading="eager" src="${mailApi.htmlUrl(mailbox.id, message.id, images)}"></iframe>`
          : html`<pre class="mx-text">${message.textBody?.trim() ? linkify(message.textBody) : t('read.noBody')}</pre>`}
      </div>

      ${files.length ? html`<section class="mx-files" aria-label="${t('read.attachments', { count: files.length })}">
        <h3>${icons.clip}<span>${t('read.attachments', { count: files.length })}</span></h3>
        <div class="mx-files__grid">${files.map((file) => html`
          <a class="mx-file" href="${mailApi.attachmentUrl(mailbox.id, message.id, file.id)}" download="${file.filename}">
            <span class="mx-file__icon">${/^image\//.test(file.contentType) ? icons.image : icons.file}</span>
            <span class="mx-file__name">${file.filename}</span>
            <small>${fmtBytes(file.size)}</small>
            <span class="mx-file__dl">${icons.download}</span>
          </a>`)}</div>
      </section>` : ''}
    </div>`;
}

/** Sizes the sandboxed iframe to its content (same-origin, scripts disabled inside). */
export function bindFrame(frame) {
  if (!frame) return () => {};
  let observer = null;
  const fit = () => {
    try {
      const doc = frame.contentDocument;
      if (!doc?.documentElement) return;
      const height = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0);
      frame.style.height = `${Math.min(Math.max(height, 120), 40000)}px`;
    } catch { /* cross-origin (should not happen) */ }
  };
  const onLoad = () => {
    fit();
    try {
      observer?.disconnect();
      observer = new ResizeObserver(fit);
      observer.observe(frame.contentDocument.documentElement);
      for (const image of frame.contentDocument.images) image.addEventListener('load', fit, { once: true });
    } catch { /* ignore */ }
    setTimeout(fit, 400);
  };
  frame.addEventListener('load', onLoad);
  return () => { observer?.disconnect(); frame.removeEventListener('load', onLoad); };
}
