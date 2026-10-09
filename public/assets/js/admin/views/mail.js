/**
 * Mail console (admin): overview, team/temporary addresses, every message with a safe reader,
 * compose/reply from team mailboxes, lead conversion, policy settings, and Cloudflare integration status.
 */
import { api, fileToBase64 } from '../api.js';
import { areaChart, barList, bindChartTooltip } from '../charts.js';
import { ic } from '../icons.js';
import {
  badge, confirmDialog, copyText, debounce, emptyState, errorBox, errorMessage, fmtBytes, fmtDateTime, fmtNumber, fmtRelative,
  html, loading, overlay, pager, qs, qsa, render, toast, toLocalInput,
} from '../ui.js';

const TABS = [
  ['overview', 'Ringkasan', 'chart'],
  ['messages', 'Kotak masuk', 'mail'],
  ['addresses', 'Alamat', 'users'],
  ['settings', 'Pengaturan', 'settings'],
  ['integration', 'Integrasi', 'bolt'],
];
const RANGES = [7, 14, 30];
const FOLDERS = [['all', 'Semua'], ['inbox', 'Masuk'], ['sent', 'Terkirim'], ['starred', 'Berbintang']];
const INBOUND_STATUS = { accepted: ['Diterima', 'ok'], duplicate: ['Duplikat', 'muted'], rejected: ['Ditolak', 'danger'], error: ['Error', 'danger'] };
const REJECT_REASON = {
  'invalid-recipient': 'Alamat penerima tidak valid', 'unknown-recipient': 'Alamat tidak terdaftar', expired: 'Alamat kedaluwarsa',
  disabled: 'Alamat dinonaktifkan', 'too-large': 'Melebihi batas ukuran', 'parse-error': 'MIME tidak dapat dibaca',
};
const MAX_ATTACH_BYTES = 7 * 1024 * 1024;

const isExpired = (address) => Boolean(address.expiresAt && new Date(address.expiresAt) <= new Date());
const sender = (m) => (m.direction === 'out' ? `Ke: ${m.toList.map((e) => e.address).join(', ')}` : (m.fromName || m.fromAddress || 'Pengirim tidak dikenal'));

function addressStatus(address) {
  if (!address.isActive) return badge('Nonaktif', 'muted');
  if (isExpired(address)) return badge('Kedaluwarsa', 'danger');
  if (address.expiresAt) return badge(`s.d. ${fmtDateTime(address.expiresAt)}`, 'warn');
  return badge('Aktif', 'ok');
}

/** One-time access key display. */
function showKey(address, accessKey, title = 'Kunci akses alamat') {
  const ov = overlay({ title, size: 'sm' });
  render(ov.body, html`
    <div class="stack">
      <div class="alert alert--warn">${ic.lock}<span>Kunci ini hanya ditampilkan <b>sekali</b>. Bagikan secara aman ke PIC — kunci dipakai untuk membuka alamat di aplikasi Mail.</span></div>
      <div class="secret"><code>${address}</code><button type="button" class="btn btn--sm" data-copy="${address}">${ic.copy}<span>Salin</span></button></div>
      <div class="secret"><code class="mail-key">${accessKey}</code><button type="button" class="btn btn--sm" data-copy="${accessKey}">${ic.copy}<span>Salin</span></button></div>
      <div class="ov__actions"><button type="button" class="btn btn--primary" data-ov-close>Sudah saya simpan</button></div>
    </div>`);
  ov.body.addEventListener('click', (e) => { const b = e.target.closest('[data-copy]'); if (b) copyText(b.dataset.copy); });
}

/* Compose ------------------------------------------------------------------ */
function composeDialog({ addresses, from, mode = 'new', message = null, onSent }) {
  const senders = addresses.filter((a) => a.isActive && !isExpired(a));
  if (!senders.length) { toast('Belum ada alamat aktif untuk mengirim. Buat alamat tim terlebih dahulu.', 'danger'); return; }
  const quoteLines = (text) => String(text ?? '').trim().split(/\r?\n/).map((l) => `> ${l}`).join('\n');
  const prefix = (p, subject) => (new RegExp(`^${p}:`, 'i').test(subject) ? subject : `${p}: ${subject}`.trim());
  const draft = { to: '', subject: '', text: '' };
  if (message && mode === 'reply') {
    draft.to = message.direction === 'out' ? message.toList.map((e) => e.address).join(', ') : (message.replyTo || message.fromAddress);
    draft.subject = prefix('Re', message.subject || '');
    draft.text = `\n\nPada ${fmtDateTime(message.createdAt)}, ${message.fromName ? `${message.fromName} <${message.fromAddress}>` : message.fromAddress} menulis:\n${quoteLines(message.textBody)}`;
  } else if (message && mode === 'forward') {
    draft.subject = prefix('Fwd', message.subject || '');
    draft.text = `\n\n---------- Pesan diteruskan ----------\nDari: ${message.fromName ? `${message.fromName} <${message.fromAddress}>` : message.fromAddress}\nTanggal: ${fmtDateTime(message.createdAt)}\nSubjek: ${message.subject || '(tanpa subjek)'}\nKepada: ${message.toList.map((e) => e.address).join(', ')}\n\n${message.textBody ?? ''}`;
  }
  const fromId = from ?? message?.addressId ?? senders[0].id;
  const lockedFrom = mode === 'reply';
  const files = [];
  const ov = overlay({ title: mode === 'reply' ? 'Balas email' : mode === 'forward' ? 'Teruskan email' : 'Tulis email', size: 'lg' });
  render(ov.body, html`
    <form class="stack mail-compose" novalidate>
      <label class="field"><span class="field__label">Dari</span>
        <select class="input mono" name="fromAddressId" ${lockedFrom ? 'disabled' : ''}>${senders.map((a) => html`<option value="${a.id}" ${a.id === fromId ? 'selected' : ''}>${a.address}${a.label ? ` — ${a.label}` : ''}</option>`)}</select></label>
      <div class="form-grid">
        <label class="field"><span class="field__label">Kepada</span><input class="input" name="to" value="${draft.to}" placeholder="nama@contoh.com, …" ${draft.to ? '' : 'autofocus'} autocomplete="off"></label>
        <label class="field"><span class="field__label">Cc <small class="muted">(opsional)</small></span><input class="input" name="cc" placeholder="pisahkan dengan koma" autocomplete="off"></label>
      </div>
      <label class="field"><span class="field__label">Subjek</span><input class="input" name="subject" maxlength="250" value="${draft.subject}"></label>
      <label class="field"><span class="field__label">Pesan</span><textarea class="input mail-compose__body" name="text" rows="12" ${draft.to ? 'autofocus' : ''}>${draft.text}</textarea></label>
      <div class="chips" data-files></div>
      <p class="form-error" data-error hidden></p>
      <div class="ov__actions mail-compose__foot">
        <label class="btn btn--sm btn--ghost mail-file">${ic.upload}<span>Lampiran</span><input type="file" multiple data-file class="sr-only"></label>
        <small class="muted">Maks. 5 file · total 7 MB</small>
        <span class="spacer"></span>
        <button type="button" class="btn" data-ov-close>Batal</button>
        <button type="submit" class="btn btn--primary">${ic.send}<span>Kirim</span></button>
      </div>
    </form>`);
  const form = qs('form', ov.body);
  const error = qs('[data-error]', form);
  const showError = (text) => { error.hidden = !text; error.textContent = text || ''; };
  const paintFiles = () => render(qs('[data-files]', form), html`${files.map((f, i) => html`<span class="chip">${f.name} · ${fmtBytes(f.size)} <button type="button" class="link" data-remove="${i}" aria-label="Hapus lampiran">${ic.x}</button></span>`)}`);
  form.addEventListener('change', (e) => {
    if (!e.target.matches('[data-file]')) return;
    showError('');
    for (const file of e.target.files) {
      if (files.length >= 5) { showError('Maksimal 5 lampiran'); break; }
      if (files.reduce((s, f) => s + f.size, 0) + file.size > MAX_ATTACH_BYTES) { showError('Total lampiran melebihi 7 MB'); break; }
      files.push(file);
    }
    e.target.value = '';
    paintFiles();
  });
  form.addEventListener('click', (e) => { const r = e.target.closest('[data-remove]'); if (r) { files.splice(Number(r.dataset.remove), 1); paintFiles(); } });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const button = qs('[type=submit]', form);
    button.disabled = true;
    try {
      const attachments = await Promise.all(files.map(async (f) => ({
        filename: f.name, contentType: /^[\w.+-]+\/[\w.+-]+$/.test(f.type) ? f.type.toLowerCase() : 'application/octet-stream', content: await fileToBase64(f),
      })));
      const sent = await api.sendMail({
        fromAddressId: Number(form.elements.fromAddressId.value), to: form.elements.to.value, cc: form.elements.cc.value,
        subject: form.elements.subject.value.trim(), text: form.elements.text.value,
        ...(mode === 'reply' && message ? { replyToMessageId: message.id } : {}), attachments,
      });
      toast('Email terkirim');
      ov.close();
      onSent?.(sent);
    } catch (err) { showError(errorMessage(err)); } finally { button.disabled = false; }
  });
}

/* Message reader (drawer) ---------------------------------------------------- */
function readerDrawer(id, { addresses, onChange, onClose, sendingEnabled }) {
  let message = null;
  let images = false;
  let view = 'html';
  const ov = overlay({ kind: 'drawer', title: 'Email', size: 'lg', onClose });
  const fit = (frame) => {
    const resize = () => {
      try { const doc = frame.contentDocument; frame.style.height = `${Math.min(Math.max(doc.documentElement.scrollHeight, 140), 40000)}px`; } catch { /* ignore */ }
    };
    frame.addEventListener('load', () => {
      resize();
      try { new ResizeObserver(resize).observe(frame.contentDocument.documentElement); } catch { /* ignore */ }
      setTimeout(resize, 400);
    });
  };
  const paint = () => {
    const m = message;
    const address = m.address;
    const showHtml = m.hasHtml && view === 'html';
    const files = (m.attachments ?? []).filter((f) => f.disposition === 'attachment' || !m.hasHtml);
    const canReply = sendingEnabled && address.isActive && !isExpired(address);
    ov.setTitle(m.subject || '(tanpa subjek)');
    ov.setContent(html`
      <div class="mail-read">
        <div class="mail-read__actions">
          ${canReply ? html`<button type="button" class="btn btn--sm" data-reply>${ic.send}<span>Balas</span></button><button type="button" class="btn btn--sm btn--ghost" data-forward>${ic.right}<span>Teruskan</span></button>` : ''}
          ${m.direction === 'in' ? (m.leadId ? html`<a class="btn btn--sm btn--ghost" href="#/leads/${m.leadId}">${ic.leads}<span>Lihat lead #${m.leadId}</span></a>`
            : html`<button type="button" class="btn btn--sm btn--ghost" data-lead>${ic.leads}<span>Jadikan lead</span></button>`) : ''}
          <span class="spacer"></span>
          <button type="button" class="btn btn--icon btn--sm btn--ghost ${m.isStarred ? 'is-starred' : ''}" data-star aria-pressed="${m.isStarred}" title="Bintang">${ic.star}</button>
          ${m.direction === 'in' ? html`<button type="button" class="btn btn--icon btn--sm btn--ghost" data-unread title="Tandai belum dibaca">${ic.mail}</button>` : ''}
          <a class="btn btn--icon btn--sm btn--ghost" href="${api.mailRawUrl(m.id)}" download title="Unduh .eml">${ic.download}</a>
          <button type="button" class="btn btn--icon btn--sm btn--danger-ghost" data-delete title="Hapus">${ic.trash}</button>
        </div>
        <dl class="mail-read__meta">
          <div><dt>Dari</dt><dd>${m.direction === 'out' ? html`<b class="mono">${address.address}</b>${m.sentByName ? html` <span class="muted">· ${m.sentByName}</span>` : ''}` : html`<b>${m.fromName || m.fromAddress}</b>${m.fromName ? html` <span class="muted mono">&lt;${m.fromAddress}&gt;</span>` : ''}`}</dd></div>
          <div><dt>Kepada</dt><dd class="mono">${m.toList.map((e) => e.address).join(', ')}</dd></div>
          ${m.ccList?.length ? html`<div><dt>Cc</dt><dd class="mono">${m.ccList.map((e) => e.address).join(', ')}</dd></div>` : ''}
          <div><dt>Kotak</dt><dd><span class="mono">${address.address}</span> ${address.ownerName ? html`<span class="muted">· PIC ${address.ownerName}</span>` : ''}</dd></div>
          <div><dt>Waktu</dt><dd>${fmtDateTime(m.createdAt)} · ${fmtBytes(m.size)}</dd></div>
          ${m.spf || m.dkim || m.provider ? html`<div><dt>Teknis</dt><dd class="row">${m.spf ? badge(`SPF ${m.spf}`, m.spf === 'pass' ? 'ok' : 'warn') : ''}${m.dkim ? badge(`DKIM ${m.dkim}`, m.dkim === 'pass' ? 'ok' : 'warn') : ''}${m.provider ? badge(`via ${m.provider}`, 'info') : ''}</dd></div>` : ''}
        </dl>
        ${m.hasHtml ? html`<div class="row row--between mail-read__switch">
          ${m.textBody ? html`<div class="segmented"><button type="button" class="${view === 'html' ? 'is-active' : ''}" data-view="html">HTML</button><button type="button" class="${view === 'text' ? 'is-active' : ''}" data-view="text">Teks</button></div>` : html`<span></span>`}
          ${showHtml && m.hasRemoteContent ? html`<button type="button" class="btn btn--sm btn--ghost" data-images>${ic.eye}<span>${images ? 'Blokir gambar eksternal' : 'Tampilkan gambar eksternal'}</span></button>` : ''}
        </div>` : ''}
        ${showHtml ? html`<iframe class="mail-frame" title="Isi email" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" src="${api.mailHtmlUrl(m.id, images)}"></iframe>`
          : html`<pre class="mail-text">${m.textBody?.trim() || '(Email ini tidak memiliki isi)'}</pre>`}
        ${files.length ? html`<div class="mail-files">${files.map((f) => html`<a class="mail-file" href="${api.mailAttachmentUrl(m.id, f.id)}" download="${f.filename}">${ic.download}<span>${f.filename}</span><small class="muted">${fmtBytes(f.size)}</small></a>`)}</div>` : ''}
      </div>`);
    const frame = qs('.mail-frame', ov.body);
    if (frame) fit(frame);
  };
  const load = async () => {
    ov.setContent(loading(8));
    try { message = await api.mailMessage(id); paint(); onChange?.('read'); } catch (error) { ov.setContent(errorBox(error)); }
  };
  ov.body.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-retry]')) { load(); return; }
    if (!message) return;
    if (t.closest('[data-view]')) { view = t.closest('[data-view]').dataset.view; paint(); return; }
    if (t.closest('[data-images]')) { images = !images; paint(); return; }
    if (t.closest('[data-reply]')) { composeDialog({ addresses, mode: 'reply', message, onSent: () => onChange?.('sent') }); return; }
    if (t.closest('[data-forward]')) { composeDialog({ addresses, from: message.addressId, mode: 'forward', message, onSent: () => onChange?.('sent') }); return; }
    try {
      if (t.closest('[data-star]')) { message = { ...message, ...(await api.updateMailMessage(message.id, { isStarred: !message.isStarred })), address: message.address }; paint(); onChange?.('star'); }
      if (t.closest('[data-unread]')) { await api.updateMailMessage(message.id, { isRead: false }); toast('Ditandai belum dibaca'); onChange?.('unread'); ov.close(); }
      if (t.closest('[data-lead]')) {
        const { lead, created } = await api.mailToLead(message.id);
        toast(created ? `Lead baru dibuat: ${lead.name}` : `Ditambahkan ke lead ${lead.name}`);
        message.leadId = lead.id; paint(); onChange?.('lead');
      }
      if (t.closest('[data-delete]')) {
        if (!(await confirmDialog({ title: 'Hapus email?', message: `"${message.subject || '(tanpa subjek)'}" akan dihapus permanen beserta lampirannya.` }))) return;
        await api.deleteMailMessage(message.id); toast('Email dihapus'); onChange?.('delete'); ov.close();
      }
    } catch (error) { toast(errorMessage(error), 'danger'); }
  });
  load();
  return ov;
}

/* Address editor --------------------------------------------------------------- */
function addressDialog({ meta, address = null }) {
  return new Promise((resolve) => {
    let result = null;
    const ov = overlay({ title: address ? `Edit ${address.address}` : 'Alamat email baru', onClose: () => resolve(result) });
    render(ov.body, html`
      <form class="stack" novalidate>
        ${address ? '' : html`<div class="field"><span class="field__label">Alamat</span>
          <div class="mail-addr-input"><input class="input mono" name="localPart" maxlength="64" placeholder="mis. sales (kosong = acak)" autofocus autocomplete="off">
          <span>@</span><select class="input" name="domain">${meta.domains.map((d) => html`<option value="${d}">${d}</option>`)}</select></div>
          <small class="field__hint">Alamat tim boleh memakai nama yang dicadangkan untuk publik (sales, support, …).</small></div>`}
        <div class="form-grid">
          <label class="field"><span class="field__label">Label</span><input class="input" name="label" maxlength="80" value="${address?.label ?? ''}" placeholder="mis. Tim Sales"></label>
          <label class="field"><span class="field__label">PIC (notifikasi email masuk)</span>
            <select class="input" name="ownerUserId"><option value="">— Tanpa PIC —</option>${meta.users.map((u) => html`<option value="${u.id}" ${address?.ownerUserId === u.id ? 'selected' : ''}>${u.name} · ${u.email}</option>`)}</select></label>
          <label class="field"><span class="field__label">Kuota kirim / 24 jam</span><input class="input" name="sendQuotaDaily" type="number" min="0" max="5000" value="${address?.sendQuotaDaily ?? ''}" placeholder="ikuti pengaturan global"></label>
          <label class="field"><span class="field__label">Kedaluwarsa</span><input class="input" name="expiresAt" type="datetime-local" value="${address?.expiresAt ? toLocalInput(address.expiresAt) : ''}"><small class="field__hint">Kosongkan agar permanen.</small></label>
        </div>
        <label class="toggle-row"><span><b>Boleh mengirim email</b><small class="muted">Berlaku jika pengiriman diaktifkan di Pengaturan.</small></span><span class="switch"><input type="checkbox" name="canSend" ${address ? (address.canSend ? 'checked' : '') : 'checked'}><i></i></span></label>
        ${address ? html`<label class="toggle-row"><span><b>Aktif</b><small class="muted">Alamat nonaktif menolak email masuk dan mengeluarkan semua perangkat.</small></span><span class="switch"><input type="checkbox" name="isActive" ${address.isActive ? 'checked' : ''}><i></i></span></label>` : ''}
        <p class="form-error" data-error hidden></p>
        <div class="ov__actions"><button type="button" class="btn" data-ov-close>Batal</button><button type="submit" class="btn btn--primary">${ic.check}<span>${address ? 'Simpan' : 'Buat alamat'}</span></button></div>
      </form>`);
    const form = qs('form', ov.body);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const el = form.elements;
      const quota = el.sendQuotaDaily.value.trim();
      const body = {
        label: el.label.value.trim(),
        ownerUserId: el.ownerUserId.value ? Number(el.ownerUserId.value) : null,
        canSend: el.canSend.checked,
        sendQuotaDaily: quota === '' ? null : Number(quota),
        expiresAt: el.expiresAt.value ? new Date(el.expiresAt.value).toISOString() : null,
      };
      if (address) body.isActive = el.isActive.checked;
      else Object.assign(body, { localPart: el.localPart.value.trim().toLowerCase(), domain: el.domain.value });
      const button = qs('[type=submit]', form);
      button.disabled = true;
      try {
        result = address ? { address: await api.updateMailAddress(address.id, body) } : await api.createMailAddress(body);
        ov.close();
      } catch (err) { const box = qs('[data-error]', form); box.hidden = false; box.textContent = errorMessage(err); } finally { button.disabled = false; }
    });
  });
}

/* View -------------------------------------------------------------------------- */
export async function mount(ctx) {
  const tab = TABS.some(([key]) => key === ctx.params[0]) ? ctx.params[0] : 'overview';
  ctx.setTitle('Mail');
  let meta = null;
  let settings = null;
  const cleanups = [];

  const shell = (content, actions = '') => html`
    <div class="page-head">
      <div><h2>Mail</h2><p class="muted">Email sementara & kotak masuk tim di <a class="link" href="${meta?.integration?.publicUrl ?? '#'}" target="_blank" rel="noopener">${meta?.integration?.hostname ?? 'mail'}</a> — diterima lewat Cloudflare Email Routing.</p></div>
      <div class="row">${actions}</div>
    </div>
    <div class="tabs mail-tabs" role="tablist">${TABS.map(([key, label, icon]) => html`<a role="tab" class="tab ${key === tab ? 'is-active' : ''}" aria-selected="${key === tab}" href="#/mail${key === 'overview' ? '' : `/${key}`}">${ic[icon]}<span>${label}</span></a>`)}</div>
    <div class="mail-tab">${content}</div>`;

  try {
    [meta, settings] = await Promise.all([api.mailMeta(), api.mailSettings()]);
  } catch (error) {
    render(ctx.root, errorBox(error));
    ctx.root.addEventListener('click', (e) => { if (e.target.closest('[data-retry]')) ctx.reload(); });
    return {};
  }
  const sendingEnabled = settings.value.sending.enabled && meta.integration.transport.configured;
  const teamAddresses = async () => (await api.mailAddresses({ source: 'admin', pageSize: 100 })).items;
  const composeButton = sendingEnabled ? html`<button type="button" class="btn btn--primary" data-compose>${ic.send}<span>Tulis email</span></button>` : '';
  ctx.root.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-compose]')) return;
    try { composeDialog({ addresses: await teamAddresses(), onSent: () => { if (tab === 'messages') ctx.reload(); } }); } catch (error) { toast(errorMessage(error), 'danger'); }
  });

  /* Overview ------------------------------------------------------------- */
  if (tab === 'overview') {
    let days = Number(ctx.query.get('days')) || 14;
    if (!RANGES.includes(days)) days = 14;
    const paint = (d) => {
      const I = d.integration;
      const checks = [
        { ok: I.inbound.configured, label: 'Penerimaan (Worker → server)', hint: I.inbound.configured ? `Endpoint ${I.inbound.endpoint}` : 'Set MAIL_WORKER_SECRET di server & Worker' },
        { ok: I.transport.configured, label: 'Pengiriman keluar', hint: I.transport.configured ? `${I.transport.provider} · ${I.transport.target}` : `Belum diatur: ${I.transport.missing.join(', ')}` },
        { ok: settings.value.sending.enabled, label: 'Kebijakan kirim', hint: settings.value.sending.enabled ? `Aktif · kuota ${settings.value.sending.dailyQuota}/hari` : 'Nonaktif di Pengaturan' },
        { ok: I.turnstile, label: 'Anti-bot Turnstile', hint: I.turnstile ? 'Aktif untuk pembuatan alamat publik' : 'Opsional · TURNSTILE_SITE_KEY & SECRET', optional: true },
      ];
      render(ctx.root, shell(html`
        <div class="row row--between mail-range">
          <p class="muted small">Diperbarui ${fmtRelative(d.generatedAt)}</p>
          <div class="segmented" role="group" aria-label="Rentang">${RANGES.map((r) => html`<button type="button" class="${r === days ? 'is-active' : ''}" data-days="${r}">${r} hari</button>`)}</div>
        </div>
        <div class="grid grid--kpi">
          <div class="card kpi"><div class="kpi__top"><span class="kpi__icon kpi__icon--accent">${ic.mail}</span><span class="kpi__label">Email masuk</span></div><div class="kpi__value">${fmtNumber(d.messages.inboundRange)}</div><div class="kpi__foot"><span class="muted">${fmtNumber(d.messages.inboundDay)} dalam 24 jam</span></div></div>
          <div class="card kpi"><div class="kpi__top"><span class="kpi__icon kpi__icon--violet">${ic.send}</span><span class="kpi__label">Email terkirim</span></div><div class="kpi__value">${fmtNumber(d.messages.outboundRange)}</div><div class="kpi__foot"><span class="muted">${fmtNumber(d.messages.outboundDay)} dalam 24 jam</span></div></div>
          <a class="card kpi" href="#/mail/addresses?status=active"><div class="kpi__top"><span class="kpi__icon kpi__icon--ok">${ic.users}</span><span class="kpi__label">Alamat aktif</span></div><div class="kpi__value">${fmtNumber(d.addresses.active)}</div><div class="kpi__foot"><span class="muted">${fmtNumber(d.addresses.team)} tim · ${fmtNumber(d.addresses.createdDay)} baru 24 jam</span></div></a>
          <a class="card kpi" href="#/mail/messages?folder=inbox&unread=1"><div class="kpi__top"><span class="kpi__icon kpi__icon--warn">${ic.bell}</span><span class="kpi__label">Belum dibaca (tim)</span></div><div class="kpi__value">${fmtNumber(d.unreadTeam)}</div><div class="kpi__foot"><span class="muted">${d.rejectedDay ? `${fmtNumber(d.rejectedDay)} ditolak 24 jam` : `Penyimpanan ${fmtBytes(d.messages.bytes)}`}</span></div></a>
        </div>
        <div class="grid grid--main">
          <section class="card card--chart">
            <header class="card__head"><h3>Lalu lintas email</h3><div class="legend legend--inline"><span><i class="dot dot--accent"></i>Masuk</span><span><i class="dot dot--violet"></i>Keluar</span></div></header>
            ${areaChart({ data: d.series, series: [{ key: 'inbound', label: 'Masuk', tone: 'accent' }, { key: 'outbound', label: 'Keluar', tone: 'violet' }] })}
          </section>
          <section class="card">
            <header class="card__head"><h3>Status integrasi</h3><a class="link" href="#/mail/integration">Detail →</a></header>
            <ul class="mail-checks">${checks.map((c) => html`<li class="${c.ok ? 'is-ok' : c.optional ? 'is-optional' : 'is-bad'}"><span class="mail-checks__dot">${c.ok ? ic.check : c.optional ? ic.x : ic.alert}</span><div><b>${c.label}</b><small class="muted">${c.hint}</small></div></li>`)}</ul>
            <p class="muted small">Email terakhir diterima: ${d.lastInboundAt ? html`<b title="${fmtDateTime(d.lastInboundAt)}">${fmtRelative(d.lastInboundAt)}</b>` : 'belum ada'}</p>
          </section>
        </div>
        <div class="grid grid--3">
          <section class="card"><header class="card__head"><h3>Pengirim teratas</h3></header>${barList(d.topSenders.map((s) => ({ label: s.sender, value: s.total })), { empty: 'Belum ada email masuk.' })}</section>
          <section class="card"><header class="card__head"><h3>Alamat per domain</h3></header>${barList(d.byDomain.map((s) => ({ label: s.domain, value: s.total })), { empty: 'Belum ada alamat.' })}</section>
          <section class="card"><header class="card__head"><h3>Penerimaan terbaru</h3><a class="link" href="#/mail/integration">Log →</a></header>
            ${d.recentInbound.length ? html`<ul class="feed mail-feed">${d.recentInbound.map((l) => html`<li><span class="mail-dot mail-dot--${INBOUND_STATUS[l.status]?.[1] ?? 'muted'}"></span><div><b class="mono">${l.envelopeTo}</b><small class="muted">${INBOUND_STATUS[l.status]?.[0] ?? l.status}${l.reason ? ` · ${REJECT_REASON[l.reason] ?? l.reason}` : ''} · ${fmtRelative(l.createdAt)}</small></div></li>`)}</ul>` : emptyState('Belum ada email', 'Kirim email uji dari tab Integrasi.')}
          </section>
        </div>`, composeButton));
      bindChartTooltip(ctx.root);
    };
    const load = async () => {
      try { paint(await api.mailOverview(days)); } catch (error) { render(ctx.root, shell(errorBox(error))); }
    };
    ctx.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-days]');
      if (b) { days = Number(b.dataset.days); ctx.setQuery({ days: days === 14 ? '' : days }); load(); }
      if (e.target.closest('[data-retry]')) load();
    });
    render(ctx.root, shell(loading(8), composeButton));
    await load();
    return {};
  }

  /* Messages ------------------------------------------------------------- */
  if (tab === 'messages') {
    const f = {
      q: ctx.query.get('q') ?? '', folder: FOLDERS.some(([k]) => k === ctx.query.get('folder')) ? ctx.query.get('folder') : 'all',
      addressId: ctx.query.get('addressId') ?? '', unread: ctx.query.get('unread') === '1' ? '1' : '', from: ctx.query.get('from') ?? '', to: ctx.query.get('to') ?? '',
      page: Number(ctx.query.get('page')) || 1,
    };
    let data = null;
    let addresses = [];
    const selected = new Set();
    let drawer = null;
    const sync = () => ctx.setQuery({ ...f, page: f.page > 1 ? f.page : '' , folder: f.folder === 'all' ? '' : f.folder });
    const paintRows = () => {
      const body = qs('[data-rows]', ctx.root);
      if (!body) return;
      if (!data) { render(body, loading(8)); return; }
      const all = data.items.length && data.items.every((m) => selected.has(m.id));
      render(body, data.items.length ? html`
        ${selected.size ? html`<div class="bulkbar"><b>${selected.size} dipilih</b>
          <button type="button" class="btn btn--sm" data-bulk="read">Tandai dibaca</button><button type="button" class="btn btn--sm" data-bulk="unread">Belum dibaca</button>
          <button type="button" class="btn btn--sm" data-bulk="star">${ic.star}<span>Bintang</span></button><button type="button" class="btn btn--sm btn--danger-ghost" data-bulk="delete">${ic.trash}<span>Hapus</span></button></div>` : ''}
        <div class="table-wrap"><table class="table mail-table mail-table--msgs">
          <thead><tr><th class="mail-table__check"><input type="checkbox" data-all ${all ? 'checked' : ''} aria-label="Pilih semua"></th><th></th><th>Dari / Ke</th><th>Subjek</th><th class="hide-sm">Kotak</th><th class="num">Waktu</th></tr></thead>
          <tbody>${data.items.map((m) => html`
            <tr class="${m.direction === 'in' && !m.isRead ? 'is-unread' : ''}" data-open="${m.id}">
              <td class="mail-table__check"><input type="checkbox" data-select="${m.id}" ${selected.has(m.id) ? 'checked' : ''} aria-label="Pilih"></td>
              <td><button type="button" class="mail-star ${m.isStarred ? 'is-on' : ''}" data-star="${m.id}" aria-pressed="${m.isStarred}" aria-label="Bintang">${ic.star}</button></td>
              <td class="mail-table__who">${m.direction === 'out' ? html`<span class="badge badge--violet">Keluar</span> ` : ''}${sender(m)}</td>
              <td class="mail-table__subject"><b>${m.attachmentCount ? html`<span class="muted" title="${m.attachmentCount} lampiran">📎</span> ` : ''}${m.subject || '(tanpa subjek)'}</b><small class="muted">${m.snippet}</small></td>
              <td class="hide-sm mono small">${m.mailbox}</td>
              <td class="num small" title="${fmtDateTime(m.createdAt)}">${fmtRelative(m.createdAt)}</td>
            </tr>`)}</tbody>
        </table></div>
        ${pager(data.pagination)}`
        : emptyState('Tidak ada email', f.q || f.unread || f.addressId || f.from ? 'Coba ubah filter pencarian.' : 'Email yang diterima semua alamat akan tampil di sini.'));
    };
    const load = async () => {
      try {
        data = await api.mailMessages({ ...f, unread: f.unread || undefined, pageSize: 30 });
        for (const id of [...selected]) if (!data.items.some((m) => m.id === id)) selected.delete(id);
        paintRows();
      } catch (error) { render(qs('[data-rows]', ctx.root), errorBox(error)); }
    };
    try { addresses = (await api.mailAddresses({ pageSize: 100 })).items; } catch { addresses = []; }
    render(ctx.root, shell(html`
      <div class="filters">
        <label class="search">${ic.search}<input type="search" class="input" data-f="q" value="${f.q}" placeholder="Cari pengirim, subjek, isi…"></label>
        <select class="input" data-f="addressId" aria-label="Kotak masuk"><option value="">Semua alamat</option>${addresses.map((a) => html`<option value="${a.id}" ${String(a.id) === f.addressId ? 'selected' : ''}>${a.address}${a.unreadCount ? ` (${a.unreadCount})` : ''}</option>`)}</select>
        <select class="input" data-f="folder" aria-label="Folder">${FOLDERS.map(([k, l]) => html`<option value="${k}" ${k === f.folder ? 'selected' : ''}>${l}</option>`)}</select>
        <input class="input" type="date" data-f="from" value="${f.from}" aria-label="Dari tanggal">
        <input class="input" type="date" data-f="to" value="${f.to}" aria-label="Sampai tanggal">
        <label class="check-inline"><input type="checkbox" data-f="unread" ${f.unread ? 'checked' : ''}><span>Belum dibaca</span></label>
      </div>
      <section class="card card--flush" data-rows></section>`, composeButton));
    paintRows();
    const onSearch = debounce(() => { f.page = 1; sync(); load(); }, 300);
    ctx.root.addEventListener('input', (e) => { if (e.target.matches('[data-f="q"]')) { f.q = e.target.value.trim(); onSearch(); } });
    ctx.root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.matches('[data-f]') && t.dataset.f !== 'q') { f[t.dataset.f] = t.type === 'checkbox' ? (t.checked ? '1' : '') : t.value; f.page = 1; sync(); load(); return; }
      if (t.matches('[data-all]')) { data.items.forEach((m) => (t.checked ? selected.add(m.id) : selected.delete(m.id))); paintRows(); return; }
      if (t.matches('[data-select]')) { const id = Number(t.dataset.select); if (t.checked) selected.add(id); else selected.delete(id); paintRows(); }
    });
    const open = (id) => {
      drawer?.close();
      history.replaceState(null, '', `#/mail/messages/${id}${location.hash.includes('?') ? `?${location.hash.split('?')[1]}` : ''}`);
      drawer = readerDrawer(id, {
        addresses: addresses.filter((a) => a.source === 'admin'), sendingEnabled,
        onChange: (kind) => { load(); if (kind === 'read' || kind === 'unread' || kind === 'delete') ctx.refreshBadges(); },
        onClose: () => {
          drawer = null;
          // Only rewrite the URL while still on the reader route — never clobber a navigation in progress.
          if (location.hash.startsWith(`#/mail/messages/${id}`)) history.replaceState(null, '', `#/mail/messages${location.hash.includes('?') ? `?${location.hash.split('?')[1]}` : ''}`);
        },
      });
    };
    ctx.root.addEventListener('click', async (e) => {
      const t = e.target;
      if (t.closest('[data-retry]')) { load(); return; }
      const page = t.closest('[data-page]');
      if (page) { f.page = Number(page.dataset.page); sync(); load(); return; }
      const star = t.closest('[data-star]');
      if (star) {
        const m = data.items.find((x) => x.id === Number(star.dataset.star));
        try { await api.updateMailMessage(m.id, { isStarred: !m.isStarred }); m.isStarred = !m.isStarred; paintRows(); } catch (error) { toast(errorMessage(error), 'danger'); }
        return;
      }
      const bulk = t.closest('[data-bulk]');
      if (bulk) {
        const action = bulk.dataset.bulk;
        if (action === 'delete' && !(await confirmDialog({ title: `Hapus ${selected.size} email?`, message: 'Email beserta lampirannya dihapus permanen.' }))) return;
        try { const r = await api.bulkMailMessages({ action, ids: [...selected] }); toast(`${r.affected} email diperbarui`); selected.clear(); load(); ctx.refreshBadges(); } catch (error) { toast(errorMessage(error), 'danger'); }
        return;
      }
      if (t.closest('input, button, a, label')) return;
      const row = t.closest('[data-open]');
      if (row) open(Number(row.dataset.open));
    });
    await load();
    if (ctx.params[1]) open(Number(ctx.params[1]));
    return { destroy: () => drawer?.close() };
  }

  /* Addresses ------------------------------------------------------------ */
  if (tab === 'addresses') {
    const f = { q: ctx.query.get('q') ?? '', status: ctx.query.get('status') ?? 'all', source: ctx.query.get('source') ?? 'all', page: Number(ctx.query.get('page')) || 1 };
    let data = null;
    const selected = new Set();
    const sync = () => ctx.setQuery({ ...f, page: f.page > 1 ? f.page : '' });
    const paintRows = () => {
      const body = qs('[data-rows]', ctx.root);
      if (!data) { render(body, loading(6)); return; }
      const all = data.items.length && data.items.every((a) => selected.has(a.id));
      render(body, data.items.length ? html`
        ${selected.size ? html`<div class="bulkbar"><b>${selected.size} dipilih</b><button type="button" class="btn btn--sm" data-bulk="activate">Aktifkan</button>
          <button type="button" class="btn btn--sm" data-bulk="deactivate">Nonaktifkan</button><button type="button" class="btn btn--sm btn--danger-ghost" data-bulk="delete">${ic.trash}<span>Hapus</span></button></div>` : ''}
        <div class="table-wrap"><table class="table mail-table">
          <thead><tr><th class="mail-table__check"><input type="checkbox" data-all ${all ? 'checked' : ''} aria-label="Pilih semua"></th><th>Alamat</th><th class="hide-sm">PIC</th><th>Status</th><th class="num">Masuk</th><th class="num hide-sm">Keluar</th><th class="hide-sm">Terakhir</th><th></th></tr></thead>
          <tbody>${data.items.map((a) => html`<tr>
            <td class="mail-table__check"><input type="checkbox" data-select="${a.id}" ${selected.has(a.id) ? 'checked' : ''} aria-label="Pilih"></td>
            <td><a class="mono" href="#/mail/messages?addressId=${a.id}">${a.address}</a>
              <small class="muted mail-sub">${a.source === 'admin' ? badge('Tim', 'info') : badge('Publik', 'muted')} ${a.label}${a.canSend ? ' · boleh kirim' : ''}</small></td>
            <td class="hide-sm">${a.ownerName ?? html`<span class="muted">—</span>`}</td>
            <td>${addressStatus(a)}</td>
            <td class="num">${fmtNumber(a.inboxCount)}${a.unreadCount ? html` <span class="badge badge--info">${a.unreadCount} baru</span>` : ''}</td>
            <td class="num hide-sm">${fmtNumber(a.sentCount)}</td>
            <td class="hide-sm small muted">${a.lastReceivedAt ? fmtRelative(a.lastReceivedAt) : '—'}</td>
            <td class="mail-table__actions">
              <button type="button" class="btn btn--icon btn--sm btn--ghost" data-test="${a.id}" title="Kirim email uji" ${a.isActive && !isExpired(a) ? '' : 'disabled'}>${ic.play}</button>
              <button type="button" class="btn btn--icon btn--sm btn--ghost" data-edit="${a.id}" title="Edit">${ic.edit}</button>
              <button type="button" class="btn btn--icon btn--sm btn--ghost" data-rotate="${a.id}" title="Ganti kunci akses">${ic.key}</button>
              <button type="button" class="btn btn--icon btn--sm btn--danger-ghost" data-delete="${a.id}" title="Hapus">${ic.trash}</button>
            </td></tr>`)}</tbody>
        </table></div>${pager(data.pagination)}`
        : emptyState('Belum ada alamat', 'Buat alamat tim seperti sales@ atau support@, atau tunggu pengunjung membuat alamat sementara.', html`<button type="button" class="btn btn--primary" data-create>${ic.plus}<span>Alamat baru</span></button>`));
    };
    const load = async () => {
      try { data = await api.mailAddresses(f); paintRows(); } catch (error) { render(qs('[data-rows]', ctx.root), errorBox(error)); }
    };
    render(ctx.root, shell(html`
      <div class="filters">
        <label class="search">${ic.search}<input type="search" class="input" data-f="q" value="${f.q}" placeholder="Cari alamat atau label…"></label>
        <select class="input" data-f="status" aria-label="Status">${[['all', 'Semua status'], ['active', 'Aktif'], ['inactive', 'Nonaktif'], ['expired', 'Kedaluwarsa']].map(([k, l]) => html`<option value="${k}" ${k === f.status ? 'selected' : ''}>${l}</option>`)}</select>
        <select class="input" data-f="source" aria-label="Sumber">${[['all', 'Semua sumber'], ['admin', 'Alamat tim'], ['public', 'Publik (sementara)']].map(([k, l]) => html`<option value="${k}" ${k === f.source ? 'selected' : ''}>${l}</option>`)}</select>
      </div>
      <section class="card card--flush" data-rows></section>`, html`<button type="button" class="btn btn--primary" data-create>${ic.plus}<span>Alamat baru</span></button>`));
    paintRows();
    const onSearch = debounce(() => { f.page = 1; sync(); load(); }, 300);
    ctx.root.addEventListener('input', (e) => { if (e.target.matches('[data-f="q"]')) { f.q = e.target.value.trim(); onSearch(); } });
    ctx.root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.matches('select[data-f]')) { f[t.dataset.f] = t.value; f.page = 1; sync(); load(); return; }
      if (t.matches('[data-all]')) { data.items.forEach((a) => (t.checked ? selected.add(a.id) : selected.delete(a.id))); paintRows(); return; }
      if (t.matches('[data-select]')) { const id = Number(t.dataset.select); if (t.checked) selected.add(id); else selected.delete(id); paintRows(); }
    });
    ctx.root.addEventListener('click', async (e) => {
      const t = e.target;
      const find = (attr) => { const el = t.closest(`[${attr}]`); return el ? data.items.find((a) => a.id === Number(el.getAttribute(attr))) : null; };
      if (t.closest('[data-retry]')) { load(); return; }
      const page = t.closest('[data-page]');
      if (page) { f.page = Number(page.dataset.page); sync(); load(); return; }
      if (t.closest('[data-create]')) {
        const result = await addressDialog({ meta });
        if (result) { toast(`Alamat ${result.address.address} dibuat`); showKey(result.address.address, result.accessKey); load(); }
        return;
      }
      const bulk = t.closest('[data-bulk]');
      if (bulk) {
        const action = bulk.dataset.bulk;
        if (action === 'delete' && !(await confirmDialog({ title: `Hapus ${selected.size} alamat?`, message: 'Semua email di alamat tersebut ikut terhapus permanen.' }))) return;
        try { const r = await api.bulkMailAddresses({ action, ids: [...selected] }); toast(`${r.affected} alamat diperbarui`); selected.clear(); load(); } catch (error) { toast(errorMessage(error), 'danger'); }
        return;
      }
      let a = find('data-edit');
      if (a) { if (await addressDialog({ meta, address: a })) { toast('Alamat disimpan'); load(); } return; }
      a = find('data-test');
      if (a) {
        try { await api.testMailInbound(a.id); toast(`Email uji masuk ke ${a.address}`); load(); ctx.refreshBadges(); } catch (error) { toast(errorMessage(error), 'danger'); }
        return;
      }
      a = find('data-rotate');
      if (a) {
        if (!(await confirmDialog({ title: 'Ganti kunci akses?', message: `Kunci lama ${a.address} langsung tidak berlaku dan semua perangkat yang membukanya akan dikeluarkan.`, confirm: 'Ganti kunci', tone: 'primary' }))) return;
        try { const r = await api.rotateMailKey(a.id); showKey(a.address, r.accessKey, `Kunci baru · ${r.signedOut} perangkat dikeluarkan`); } catch (error) { toast(errorMessage(error), 'danger'); }
        return;
      }
      a = find('data-delete');
      if (a) {
        if (!(await confirmDialog({ title: 'Hapus alamat?', message: `${a.address} beserta ${fmtNumber(a.inboxCount + a.sentCount)} email akan dihapus permanen.` }))) return;
        try { await api.deleteMailAddress(a.id); toast('Alamat dihapus'); load(); } catch (error) { toast(errorMessage(error), 'danger'); }
      }
    });
    await load();
    return {};
  }

  /* Settings -------------------------------------------------------------- */
  if (tab === 'settings') {
    const paint = (s) => {
      const v = s.value;
      render(ctx.root, shell(html`
        <form class="mail-settings stack" novalidate>
          <section class="card stack">
            <header class="card__head"><h3>${ic.globe} Domain & alamat</h3>${s.customized ? badge(`Diubah ${s.updatedAt ? fmtRelative(s.updatedAt) : ''}`, 'info') : badge('Default', 'muted')}</header>
            <label class="field"><span class="field__label">Domain penerima</span><input class="input mono" name="domains" value="${v.domains.join(', ')}">
              <small class="field__hint">Pisahkan dengan koma. Setiap domain harus diarahkan ke Worker lewat Cloudflare Email Routing (catch-all).</small></label>
            <label class="toggle-row"><span><b>Pembuatan alamat publik</b><small class="muted">Pengunjung dapat membuat alamat sementara sendiri di aplikasi Mail.</small></span><span class="switch"><input type="checkbox" name="publicCreation" ${v.publicCreation ? 'checked' : ''}><i></i></span></label>
            <label class="toggle-row"><span><b>Nama alamat kustom</b><small class="muted">Jika mati, alamat publik selalu dibuat acak.</small></span><span class="switch"><input type="checkbox" name="customNames" ${v.customNames ? 'checked' : ''}><i></i></span></label>
            <div class="form-grid form-grid--3">
              <label class="field"><span class="field__label">Panjang min.</span><input class="input" type="number" name="nameMinLength" min="1" max="32" value="${v.nameMinLength}"></label>
              <label class="field"><span class="field__label">Panjang maks.</span><input class="input" type="number" name="nameMaxLength" min="3" max="64" value="${v.nameMaxLength}"></label>
              <label class="field"><span class="field__label">Panjang nama acak</span><input class="input" type="number" name="randomNameLength" min="6" max="24" value="${v.randomNameLength}"></label>
            </div>
            <label class="field"><span class="field__label">Nama dicadangkan (tidak bisa dipakai publik)</span><textarea class="input mono" name="reservedNames" rows="3">${v.reservedNames.join(', ')}</textarea></label>
          </section>
          <section class="card stack">
            <header class="card__head"><h3>${ic.clock} Masa berlaku & retensi</h3></header>
            <div class="form-grid">
              <label class="field"><span class="field__label">Masa berlaku alamat publik (jam)</span><input class="input" type="number" name="addressTtlHours" min="0" max="8760" value="${v.addressTtlHours}"><small class="field__hint">0 = tanpa batas. Alamat kedaluwarsa dihapus otomatis.</small></label>
              <label class="field"><span class="field__label">Simpan email publik (hari)</span><input class="input" type="number" name="retentionDays" min="0" max="3650" value="${v.retentionDays}"><small class="field__hint">0 = simpan selamanya. Email berbintang tidak dihapus.</small></label>
              <label class="field"><span class="field__label">Simpan email tim (hari)</span><input class="input" type="number" name="teamRetentionDays" min="0" max="3650" value="${v.teamRetentionDays}"><small class="field__hint">Untuk alamat tim / ber-PIC. 0 = selamanya.</small></label>
              <label class="field"><span class="field__label">Maks. alamat per perangkat</span><input class="input" type="number" name="maxAddressesPerBrowser" min="1" max="50" value="${v.maxAddressesPerBrowser}"></label>
              <label class="field"><span class="field__label">Ukuran email maks. (MB)</span><input class="input" type="number" name="maxMessageSizeMb" min="1" max="25" value="${v.maxMessageSizeMb}"><small class="field__hint">Cloudflare Email Routing membatasi 25 MB.</small></label>
            </div>
          </section>
          <section class="card stack">
            <header class="card__head"><h3>${ic.send} Pengiriman</h3>${meta.integration.transport.configured ? badge(`Transport: ${meta.integration.transport.provider}`, 'ok') : badge('Transport belum diatur', 'warn')}</header>
            ${meta.integration.transport.configured ? '' : html`<div class="alert alert--warn">${ic.alert}<span>Atur <code>${meta.integration.transport.missing.join(', ')}</code> di environment server agar email bisa dikirim. Lihat tab Integrasi.</span></div>`}
            <label class="toggle-row"><span><b>Aktifkan pengiriman</b><small class="muted">Membalas & menulis email dari alamat yang diizinkan.</small></span><span class="switch"><input type="checkbox" name="sending.enabled" ${v.sending.enabled ? 'checked' : ''}><i></i></span></label>
            <label class="toggle-row"><span><b>Izinkan alamat publik mengirim</b><small class="muted">Berisiko spam — jika mati, hanya alamat dengan izin "boleh mengirim" (alamat tim).</small></span><span class="switch"><input type="checkbox" name="sending.allowPublic" ${v.sending.allowPublic ? 'checked' : ''}><i></i></span></label>
            <label class="field"><span class="field__label">Kuota default per alamat / 24 jam</span><input class="input" type="number" name="sending.dailyQuota" min="0" max="5000" value="${v.sending.dailyQuota}"></label>
          </section>
          <section class="card stack">
            <header class="card__head"><h3>${ic.message} Pengumuman di aplikasi Mail</h3></header>
            <div class="form-grid">
              <label class="field"><span class="field__label">Bahasa Indonesia</span><input class="input" name="announcement.id" maxlength="280" value="${v.announcement.id}"></label>
              <label class="field"><span class="field__label">English</span><input class="input" name="announcement.en" maxlength="280" value="${v.announcement.en}"></label>
            </div>
          </section>
          <p class="form-error" data-error hidden></p>
          <div class="row row--between mail-settings__foot"><button type="button" class="btn btn--ghost" data-reset>${ic.refresh}<span>Kembalikan default</span></button><button type="submit" class="btn btn--primary">${ic.check}<span>Simpan pengaturan</span></button></div>
        </form>`));
    };
    const list = (text) => text.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    ctx.root.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const el = form.elements;
      const n = (name) => Number(el[name].value);
      const body = {
        domains: list(el.domains.value), publicCreation: el.publicCreation.checked, customNames: el.customNames.checked,
        nameMinLength: n('nameMinLength'), nameMaxLength: n('nameMaxLength'), randomNameLength: n('randomNameLength'), reservedNames: list(el.reservedNames.value),
        addressTtlHours: n('addressTtlHours'), retentionDays: n('retentionDays'), teamRetentionDays: n('teamRetentionDays'),
        maxAddressesPerBrowser: n('maxAddressesPerBrowser'), maxMessageSizeMb: n('maxMessageSizeMb'),
        sending: { enabled: el['sending.enabled'].checked, allowPublic: el['sending.allowPublic'].checked, dailyQuota: n('sending.dailyQuota') },
        announcement: { id: el['announcement.id'].value.trim(), en: el['announcement.en'].value.trim() },
      };
      const error = qs('[data-error]', form);
      const button = qs('[type=submit]', form);
      button.disabled = true; error.hidden = true;
      try { settings = await api.saveMailSettings(body); toast('Pengaturan Mail disimpan'); paint(settings); } catch (err) { error.hidden = false; error.textContent = errorMessage(err); } finally { button.disabled = false; }
    });
    ctx.root.addEventListener('click', async (e) => {
      if (!e.target.closest('[data-reset]')) return;
      if (!(await confirmDialog({ title: 'Kembalikan default?', message: 'Semua pengaturan Mail kembali ke nilai bawaan (domain dari MAIL_DOMAINS).', confirm: 'Kembalikan', tone: 'primary' }))) return;
      try { settings = await api.resetMailSettings(); toast('Pengaturan dikembalikan'); paint(settings); } catch (error) { toast(errorMessage(error), 'danger'); }
    });
    paint(settings);
    return {};
  }

  /* Integration ---------------------------------------------------------- */
  const I = meta.integration;
  let log = [];
  let addresses = [];
  const paint = () => {
    const usable = addresses.filter((a) => a.isActive && !isExpired(a));
    render(ctx.root, shell(html`
      <div class="grid grid--2">
        <section class="card stack">
          <header class="card__head"><h3>${ic.download} Penerimaan (inbound)</h3>${I.inbound.configured ? badge('Siap', 'ok') : badge('Belum diatur', 'danger')}</header>
          <p class="muted">Cloudflare Email Routing meneruskan setiap email ke Worker <code>tensuralabs-mail</code>, lalu Worker mengirim MIME mentah ke endpoint di bawah dengan tanda tangan HMAC-SHA256.</p>
          <div class="secret"><code>${I.inbound.endpoint}</code><button type="button" class="btn btn--sm" data-copy="${I.inbound.endpoint}">${ic.copy}<span>Salin</span></button></div>
          ${I.inbound.configured ? '' : html`<div class="alert alert--warn">${ic.alert}<span>Set <code>MAIL_WORKER_SECRET</code> (≥ 32 karakter acak) di server dan sebagai secret Worker.</span></div>`}
          <div class="row mail-test">
            <select class="input mono" data-test-address aria-label="Alamat tujuan">${usable.map((a) => html`<option value="${a.id}">${a.address}</option>`)}</select>
            <button type="button" class="btn" data-test ${usable.length ? '' : 'disabled'}>${ic.play}<span>Kirim email uji</span></button>
          </div>
          <small class="muted">Email uji melewati pipeline yang sama (parsing, penyimpanan, notifikasi PIC, webhook <code>mail.received</code>).</small>
        </section>
        <section class="card stack">
          <header class="card__head"><h3>${ic.send} Pengiriman (outbound)</h3>${I.transport.configured ? badge(I.transport.provider, 'ok') : badge('Belum diatur', 'warn')}</header>
          <dl class="mail-kv">
            <div><dt>Provider</dt><dd class="mono">${I.transport.provider}</dd></div>
            <div><dt>Target</dt><dd class="mono">${I.transport.target || '—'}</dd></div>
            <div><dt>Status kebijakan</dt><dd>${settings.value.sending.enabled ? badge('Aktif', 'ok') : badge('Nonaktif', 'muted')}</dd></div>
            <div><dt>Turnstile</dt><dd>${I.turnstile ? badge('Aktif', 'ok') : badge('Opsional · nonaktif', 'muted')}</dd></div>
          </dl>
          ${I.transport.configured ? '' : html`<div class="alert alert--info">${ic.alert}<span>Untuk Cloudflare: set <code>MAIL_PROVIDER=cloudflare</code> dan <code>MAIL_WORKER_URL</code> (URL Worker). Worker mengirim lewat binding <code>send_email</code> ke alamat tujuan yang terverifikasi, atau gunakan <code>MAIL_PROVIDER=resend</code> untuk tujuan bebas.</span></div>`}
        </section>
      </div>
      <section class="card stack docs">
        <header class="card__head"><h3>${ic.code} Langkah setup Cloudflare</h3></header>
        <ol class="mail-steps">
          <li><b>DNS:</b> buat record <code>${I.hostname}</code> (A/CNAME, proxied) ke server ini. Aplikasi Mail hanya tampil di host tersebut.</li>
          <li><b>Email Routing:</b> aktifkan untuk setiap domain (${settings.value.domains.map((d, i) => html`${i ? ', ' : ''}<code>${d}</code>`)}) — Cloudflare menambahkan MX & SPF otomatis.</li>
          <li><b>Worker:</b> deploy folder <code>cloudflare/mail-worker</code> → <code>npx wrangler deploy</code>, lalu <code>npx wrangler secret put MAIL_WORKER_SECRET</code> (nilai sama dengan server).</li>
          <li><b>Rute:</b> Email Routing → Routing rules → <i>Catch-all</i> → Action <i>Send to a Worker</i> → <code>tensuralabs-mail</code>.</li>
          <li><b>Kirim keluar (opsional):</b> set <code>MAIL_PROVIDER=cloudflare</code> & <code>MAIL_WORKER_URL</code>, lalu aktifkan pengiriman di tab Pengaturan.</li>
        </ol>
      </section>
      <section class="card card--flush">
        <header class="card__head card__head--pad"><h3>Log penerimaan</h3><button type="button" class="btn btn--sm btn--ghost" data-reload>${ic.refresh}<span>Muat ulang</span></button></header>
        ${log.length ? html`<div class="table-wrap"><table class="table">
          <thead><tr><th>Waktu</th><th>Status</th><th>Kepada</th><th class="hide-sm">Dari</th><th class="num hide-sm">Ukuran</th></tr></thead>
          <tbody>${log.map((l) => html`<tr>
            <td class="small" title="${fmtDateTime(l.createdAt)}">${fmtRelative(l.createdAt)}</td>
            <td>${badge(INBOUND_STATUS[l.status]?.[0] ?? l.status, INBOUND_STATUS[l.status]?.[1] ?? 'muted')}${l.reason ? html`<small class="muted mail-sub">${REJECT_REASON[l.reason] ?? l.reason}</small>` : ''}</td>
            <td class="mono small">${l.messageId ? html`<a href="#/mail/messages/${l.messageId}">${l.envelopeTo}</a>` : l.envelopeTo}</td>
            <td class="mono small hide-sm">${l.envelopeFrom || '—'}</td>
            <td class="num small hide-sm">${fmtBytes(l.size)}</td></tr>`)}</tbody></table></div>`
          : emptyState('Belum ada email masuk', 'Log 30 hari terakhir dari Worker akan tampil di sini.')}
      </section>`));
  };
  const load = async () => {
    try {
      [log, addresses] = await Promise.all([api.mailInboundLog(), api.mailAddresses({ status: 'active', pageSize: 100 }).then((r) => r.items)]);
      paint();
    } catch (error) { render(ctx.root, shell(errorBox(error))); }
  };
  ctx.root.addEventListener('click', async (e) => {
    const t = e.target;
    const copy = t.closest('[data-copy]');
    if (copy) { copyText(copy.dataset.copy); return; }
    if (t.closest('[data-reload], [data-retry]')) { load(); return; }
    if (t.closest('[data-test]')) {
      const id = Number(qs('[data-test-address]', ctx.root).value);
      try { const r = await api.testMailInbound(id); toast('Email uji diterima ✓'); ctx.refreshBadges(); await load(); if (r.messageId) ctx.navigate(`mail/messages/${r.messageId}`); } catch (error) { toast(errorMessage(error), 'danger'); }
    }
  });
  render(ctx.root, shell(loading(8)));
  await load();
  cleanups.forEach((fn) => fn());
  return {};
}
