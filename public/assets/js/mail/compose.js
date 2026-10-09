/** Compose / reply / forward dialog for mailboxes that are allowed to send. */
import { html, qs, render } from '../core/dom.js';
import { mailApi } from './api.js';
import { icons } from './icons.js';
import { fmtBytes, fmtDateTime, t } from './i18n.js';
import { confirmDialog, errorText, modal, toast } from './ui.js';

const MAX_FILES = 5;
const MAX_BYTES = 7 * 1024 * 1024;

const prefixed = (prefix, subject) => (new RegExp(`^${prefix}:`, 'i').test(subject.trim()) ? subject.trim() : `${prefix}: ${subject.trim()}`.trim());
const quote = (text) => String(text ?? '').trim().split(/\r?\n/).map((line) => `> ${line}`).join('\n');
const sender = (message) => (message.fromName ? `${message.fromName} <${message.fromAddress}>` : message.fromAddress);

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function draftFor(mode, message) {
  if (mode === 'reply' && message) {
    return {
      to: message.direction === 'out' ? message.toList.map((entry) => entry.address).join(', ') : (message.replyTo || message.fromAddress),
      subject: prefixed('Re', message.subject || ''),
      text: `\n\n${t('compose.wrote', { date: fmtDateTime(message.createdAt), from: sender(message) })}\n${quote(message.textBody)}`,
      replyToMessageId: message.id,
    };
  }
  if (mode === 'forward' && message) {
    const lines = [
      t('compose.forwardHeader'),
      `${t('read.from')}: ${sender(message)}`,
      `${t('read.date')}: ${fmtDateTime(message.createdAt)}`,
      `${t('compose.subject')}: ${message.subject || t('list.noSubject')}`,
      `${t('read.to')}: ${message.toList.map((entry) => entry.address).join(', ')}`,
    ];
    return { to: '', subject: prefixed('Fwd', message.subject || ''), text: `\n\n${lines.join('\n')}\n\n${message.textBody ?? ''}` };
  }
  return { to: '', subject: '', text: '' };
}

/**
 * Opens the composer. `mode` is "new", "reply" or "forward"; `message` is the full message for replies/forwards.
 * Resolves after the dialog closes; `onSent(message)` runs after a successful send.
 */
export function openCompose({ mailbox, config, mode = 'new', message = null, onSent }) {
  const draft = draftFor(mode, message);
  const files = [];
  let sending = false;
  let sent = false;

  const title = mode === 'reply' ? t('compose.reply') : mode === 'forward' ? t('compose.forward') : t('compose.title');
  const dialog = modal({
    title,
    size: 'lg',
    className: 'mx-modal--compose',
    beforeClose: async () => {
      if (sent || sending === true) return !sending;
      const form = qs('form', dialog.root);
      const dirty = files.length || ['to', 'cc', 'subject', 'text'].some((name) => (form.elements[name]?.value ?? '') !== (draft[name] ?? ''));
      if (!dirty) return true;
      return confirmDialog({ title: t('compose.discard'), text: t('compose.discardText'), confirmLabel: t('compose.discardOk'), danger: true });
    },
    content: html`
      <form class="mx-compose" novalidate>
        <div class="mx-compose__row"><span class="mx-compose__label">${t('compose.from')}</span><span class="mx-compose__from">${mailbox.address}</span></div>
        <div class="mx-compose__row">
          <label class="mx-compose__label" for="mx-to">${t('compose.to')}</label>
          <input id="mx-to" name="to" class="mx-compose__input" type="text" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false"
            value="${draft.to}" ${draft.to ? '' : 'autofocus'} placeholder="nama@contoh.com" aria-describedby="mx-to-hint">
          <button type="button" class="mx-link-btn" data-toggle-cc>${t('compose.addCc')}</button>
        </div>
        <div class="mx-compose__row" data-cc-row hidden>
          <label class="mx-compose__label" for="mx-cc">${t('compose.cc')}</label>
          <input id="mx-cc" name="cc" class="mx-compose__input" type="text" inputmode="email" autocapitalize="none" spellcheck="false">
        </div>
        <div class="mx-compose__row">
          <label class="mx-compose__label" for="mx-subject">${t('compose.subject')}</label>
          <input id="mx-subject" name="subject" class="mx-compose__input" type="text" maxlength="250" value="${draft.subject}">
        </div>
        <textarea name="text" class="mx-compose__body" placeholder="${t('compose.body')}" aria-label="${t('compose.body')}" ${draft.to ? 'autofocus' : ''}>${draft.text}</textarea>
        <div class="mx-compose__files" data-files></div>
        <p class="mx-form__error" data-error role="alert" hidden></p>
        <footer class="mx-compose__foot">
          <label class="mx-btn mx-btn--ghost mx-btn--sm mx-file-btn">
            ${icons.clip}<span>${t('compose.attach')}</span>
            <input type="file" multiple data-file-input class="mx-offscreen">
          </label>
          <span class="mx-hint" id="mx-to-hint">${t('compose.limit')}${config.sending?.dailyQuota ? ` · ${t('compose.quota', { quota: config.sending.dailyQuota })}` : ''}</span>
          <button type="submit" class="mx-btn mx-btn--primary">${icons.send}<span data-send-label>${t('compose.send')}</span></button>
        </footer>
      </form>`,
  });

  const form = qs('form', dialog.root);
  const textarea = form.elements.text;
  if (draft.to) {
    requestAnimationFrame(() => { textarea.focus(); textarea.setSelectionRange(0, 0); textarea.scrollTop = 0; });
  }

  const setError = (text) => { const box = qs('[data-error]', form); box.textContent = text || ''; box.hidden = !text; };
  const totalBytes = () => files.reduce((sum, file) => sum + file.size, 0);

  function paintFiles() {
    render(qs('[data-files]', form), html`${files.map((file, index) => html`
      <span class="mx-file-chip">${icons.file}<span class="mx-file-chip__name">${file.filename}</span><small>${fmtBytes(file.size)}</small>
        <button type="button" class="mx-icon-btn mx-icon-btn--xs" data-remove-file="${index}" aria-label="${t('compose.removeFile')}">${icons.close}</button></span>`)}`);
  }

  function addFile(entry) {
    if (files.length >= MAX_FILES) { setError(t('compose.tooMany')); return false; }
    if (totalBytes() + entry.size > MAX_BYTES) { setError(t('compose.tooLarge')); return false; }
    files.push(entry);
    return true;
  }

  // Forwarding keeps the original attachments (fetched from this origin, size-limited).
  if (mode === 'forward' && message?.attachments?.length) {
    const forwardable = message.attachments.filter((file) => file.disposition === 'attachment');
    Promise.all(forwardable.map(async (file) => {
      const response = await fetch(mailApi.attachmentUrl(mailbox.id, message.id, file.id), { credentials: 'same-origin' });
      if (!response.ok) throw new Error(response.statusText);
      return { filename: file.filename, contentType: file.contentType, size: file.size, blob: await response.blob() };
    })).then((list) => { list.forEach((entry) => addFile(entry)); paintFiles(); }).catch((error) => setError(errorText(error)));
  }

  form.addEventListener('click', (event) => {
    if (event.target.closest('[data-toggle-cc]')) {
      const row = qs('[data-cc-row]', form);
      row.hidden = false;
      event.target.closest('[data-toggle-cc]').hidden = true;
      form.elements.cc.focus();
    }
    const remove = event.target.closest('[data-remove-file]');
    if (remove) { files.splice(Number(remove.dataset.removeFile), 1); setError(''); paintFiles(); }
  });

  form.addEventListener('change', (event) => {
    if (!event.target.matches('[data-file-input]')) return;
    setError('');
    for (const file of event.target.files) {
      if (!addFile({ filename: file.name, contentType: file.type || 'application/octet-stream', size: file.size, blob: file })) break;
    }
    event.target.value = '';
    paintFiles();
  });

  form.addEventListener('input', () => setError(''));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending) return;
    const to = form.elements.to.value.trim();
    if (!to) { setError(t('compose.toHint')); form.elements.to.focus(); return; }
    sending = true;
    const button = qs('button[type="submit"]', form);
    button.disabled = true;
    qs('[data-send-label]', form).textContent = t('compose.sending');
    try {
      const attachments = await Promise.all(files.map(async (file) => ({
        filename: file.filename,
        contentType: /^[\w.+-]+\/[\w.+-]+$/.test(file.contentType) ? file.contentType.toLowerCase() : 'application/octet-stream',
        content: await toBase64(file.blob),
      })));
      const result = await mailApi.send(mailbox.id, {
        to, cc: form.elements.cc.value.trim(), subject: form.elements.subject.value.trim(), text: textarea.value,
        ...(draft.replyToMessageId ? { replyToMessageId: draft.replyToMessageId } : {}), attachments,
      });
      sent = true;
      sending = false;
      toast(t('compose.sent'));
      dialog.close(true);
      onSent?.(result);
    } catch (error) {
      sending = false;
      button.disabled = false;
      qs('[data-send-label]', form).textContent = t('compose.send');
      setError(errorText(error));
    }
  });

  return dialog;
}
