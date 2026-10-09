import { api } from '../api.js';
import { ic } from '../icons.js';
import {
  badge, confirmDialog, copyText, emptyState, errorBox, errorMessage, fmtDateTime, fmtRelative, html, loading, overlay, qs, qsa, render, toast,
} from '../ui.js';

const EVENT_LABEL = {
  'lead.created': 'Lead baru masuk',
  'lead.resubmitted': 'Lead mengirim ulang',
  'lead.updated': 'Lead diperbarui (status/PIC)',
  'task.created': 'Tugas dibuat',
  'task.completed': 'Tugas selesai',
  'quote.sent': 'Penawaran dikirim',
  'quote.accepted': 'Penawaran diterima',
  'quote.rejected': 'Penawaran ditolak',
  'mail.received': 'Email masuk ke alamat tim',
  'mail.sent': 'Email terkirim',
  ping: 'Tes koneksi',
};
const VERIFY_SNIPPET = `// Node.js — verifikasi signature webhook TensuraLabs
import crypto from 'node:crypto';

function verify(rawBody, header, secret, toleranceSec = 300) {
  const { t, v1 } = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(\`\${t}.\${rawBody}\`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1 ?? ''));
}

// verify(req.rawBody, req.get('X-Tensura-Signature'), process.env.TENSURA_WEBHOOK_SECRET)`;

function healthOf(hook) {
  if (!hook.isActive) return { label: 'Nonaktif', tone: 'muted' };
  if (hook.failureCount >= 3) return { label: `${hook.failureCount}× gagal beruntun`, tone: 'danger' };
  if (hook.lastStatus === null || hook.lastStatus === undefined) return { label: 'Belum ada pengiriman', tone: 'info' };
  return hook.failureCount ? { label: 'Gagal terakhir', tone: 'warn' } : { label: 'Sehat', tone: 'ok' };
}

/** Shows a freshly issued secret exactly once. */
function showSecret(secret, title = 'Simpan secret webhook') {
  const ov = overlay({ title, size: 'sm' });
  render(ov.body, html`
    <div class="stack">
      <div class="alert alert--warn">${ic.lock}<span>Secret ini hanya ditampilkan <b>sekali</b>. Simpan di environment variable server penerima.</span></div>
      <div class="secret"><code>${secret}</code><button type="button" class="btn btn--sm" data-copy-secret>${ic.copy}<span>Salin</span></button></div>
      <div class="ov__actions"><button type="button" class="btn btn--primary" data-ov-close>Sudah saya simpan</button></div>
    </div>`);
  qs('[data-copy-secret]', ov.body).addEventListener('click', () => copyText(secret));
}

function editorDialog(events, hook = null) {
  return new Promise((resolve) => {
    let result = null;
    const ov = overlay({ title: hook ? 'Edit webhook' : 'Webhook baru', onClose: () => resolve(result) });
    const selected = new Set(hook?.events ?? ['lead.created']);
    render(ov.body, html`
      <form class="stack" novalidate>
        <label class="field"><span class="field__label">Nama</span><input class="input" name="name" maxlength="80" required autofocus value="${hook?.name ?? ''}" placeholder="mis. Slack #sales, Zapier CRM"></label>
        <label class="field"><span class="field__label">URL endpoint</span><input class="input mono" name="url" type="url" maxlength="500" required value="${hook?.url ?? ''}" placeholder="https://hooks.example.com/tensura">
          <small class="field__hint">Harus HTTPS dan dapat diakses publik. Alamat jaringan privat diblokir demi keamanan.</small></label>
        <fieldset class="field"><legend class="field__label">Event <button type="button" class="link" data-all>Pilih semua</button></legend>
          <div class="checks">${events.map((ev) => html`<label class="check"><input type="checkbox" name="events" value="${ev}" ${selected.has(ev) ? 'checked' : ''}>
            <span><b class="mono">${ev}</b><small>${EVENT_LABEL[ev] ?? ''}</small></span></label>`)}</div></fieldset>
        <label class="toggle-row"><span><b>Aktif</b><small class="muted">Kirim event segera setelah disimpan.</small></span><span class="switch"><input type="checkbox" name="isActive" ${hook ? (hook.isActive ? 'checked' : '') : 'checked'}><i></i></span></label>
        <p class="form-error" data-error hidden></p>
        <div class="ov__actions"><button type="button" class="btn" data-ov-close>Batal</button><button type="submit" class="btn btn--primary">${ic.check}<span>${hook ? 'Simpan' : 'Buat webhook'}</span></button></div>
      </form>`);
    const form = qs('form', ov.body);
    qs('[data-all]', form).addEventListener('click', () => { const boxes = qsa('[name=events]', form); const all = boxes.every((b) => b.checked); boxes.forEach((b) => { b.checked = !all; }); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const error = qs('[data-error]', form);
      const body = {
        name: form.elements.name.value.trim(),
        url: form.elements.url.value.trim(),
        events: qsa('[name=events]:checked', form).map((b) => b.value),
        isActive: form.elements.isActive.checked,
      };
      if (!body.events.length) { error.hidden = false; error.textContent = 'Pilih minimal satu event.'; return; }
      const button = qs('[type=submit]', form);
      button.disabled = true;
      try {
        result = hook ? { webhook: await api.updateWebhook(hook.id, body) } : await api.createWebhook(body);
        ov.close();
      } catch (err) { error.hidden = false; error.textContent = errorMessage(err); } finally { button.disabled = false; }
    });
  });
}

async function deliveriesDrawer(hook) {
  const ov = overlay({ kind: 'drawer', title: `Riwayat · ${hook.name}`, size: 'lg' });
  const paint = async () => {
    ov.setContent(loading(6));
    try {
      const items = await api.webhookDeliveries(hook.id);
      ov.setContent(items.length ? html`
        <div class="row row--between"><p class="muted small">${items.length} pengiriman terakhir (maks. 100 disimpan).</p><button type="button" class="btn btn--sm" data-reload>${ic.refresh}<span>Muat ulang</span></button></div>
        <ul class="deliveries">${items.map((d) => html`
          <li class="delivery ${d.ok ? 'is-ok' : 'is-fail'}">
            <details>
              <summary><i class="dot dot--${d.ok ? 'ok' : 'danger'}"></i><b class="mono">${d.event}</b>
                <span class="badge badge--${d.ok ? 'ok' : 'danger'}">${d.statusCode ?? 'ERR'}</span>
                ${d.attempt > 1 ? html`<span class="badge badge--warn">percobaan ${d.attempt}</span>` : ''}
                <span class="spacer"></span><small class="muted" title="${fmtDateTime(d.createdAt)}">${fmtRelative(d.createdAt)} · ${d.durationMs} ms</small></summary>
              <div class="delivery__body">
                ${d.error ? html`<div class="alert alert--danger">${ic.alert}<span>${d.error}</span></div>` : ''}
                <small class="muted mono">Delivery ID: ${d.deliveryId}</small>
                <span class="field__label">Payload</span><pre class="code">${prettyJson(d.payload)}</pre>
                ${d.response ? html`<span class="field__label">Respons</span><pre class="code">${d.response}</pre>` : ''}
              </div>
            </details>
          </li>`)}</ul>`
        : emptyState('Belum ada pengiriman', 'Tekan "Tes" untuk mengirim event ping ke endpoint ini.'));
    } catch (error) { ov.setContent(errorBox(error)); }
  };
  ov.body.addEventListener('click', (e) => { if (e.target.closest('[data-reload], [data-retry]')) paint(); });
  await paint();
}
const prettyJson = (text) => { try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text ?? ''; } };

export async function mount(ctx) {
  ctx.setTitle('Webhook & Integrasi');
  let data = null;

  async function load() {
    try {
      data = await api.webhooks();
      paint();
    } catch (error) { render(ctx.root, errorBox(error)); }
  }

  function paint() {
    const { items } = data;
    render(ctx.root, html`
      <div class="page-head">
        <div><h2>Webhook & Integrasi</h2><p class="muted">Kirim event real-time (lead, tugas, penawaran) ke Slack, Zapier, n8n, atau CRM Anda — ditandatangani HMAC-SHA256.</p></div>
        <button type="button" class="btn btn--primary" data-create>${ic.plus}<span>Webhook baru</span></button>
      </div>
      ${items.length ? html`<div class="hooks">${items.map((hook) => {
        const health = healthOf(hook);
        const rate = hook.week.total ? Math.round((hook.week.ok / hook.week.total) * 100) : null;
        return html`
          <article class="card hook ${hook.isActive ? '' : 'is-off'}" data-hook="${hook.id}">
            <header class="hook__head">
              <span class="hook__icon">${ic.webhook}</span>
              <div class="hook__title"><b>${hook.name}</b><code class="mono" title="${hook.url}">${hook.url}</code></div>
              <label class="switch" title="${hook.isActive ? 'Nonaktifkan' : 'Aktifkan'}"><input type="checkbox" data-toggle="${hook.id}" ${hook.isActive ? 'checked' : ''} aria-label="Aktif"><i></i></label>
            </header>
            <div class="chips">${hook.events.map((ev) => html`<span class="chip mono" title="${EVENT_LABEL[ev] ?? ''}">${ev}</span>`)}</div>
            <dl class="hook__stats">
              <div><dt>Kesehatan</dt><dd>${badge(health.label, health.tone)}</dd></div>
              <div><dt>Sukses 7 hari</dt><dd>${rate === null ? '—' : `${rate}%`} <small class="muted">(${hook.week.ok}/${hook.week.total})</small></dd></div>
              <div><dt>Terakhir</dt><dd>${hook.lastDeliveryAt ? html`<span title="${fmtDateTime(hook.lastDeliveryAt)}">${fmtRelative(hook.lastDeliveryAt)}</span> · ${hook.lastStatus || 'ERR'}` : '—'}</dd></div>
            </dl>
            ${!hook.isActive && hook.failureCount >= 20 ? html`<div class="alert alert--danger">${ic.alert}<span>Dinonaktifkan otomatis setelah ${hook.failureCount} kegagalan beruntun. Perbaiki endpoint lalu aktifkan kembali.</span></div>` : ''}
            <footer class="hook__actions">
              <button type="button" class="btn btn--sm" data-test="${hook.id}" ${hook.isActive ? '' : 'disabled'}>${ic.play}<span>Tes</span></button>
              <button type="button" class="btn btn--sm" data-log="${hook.id}">${ic.list}<span>Riwayat</span></button>
              <button type="button" class="btn btn--sm" data-edit="${hook.id}">${ic.edit}<span>Edit</span></button>
              <span class="spacer"></span>
              <button type="button" class="btn btn--sm btn--ghost" data-rotate="${hook.id}" title="Rotasi secret">${ic.key}<span class="hide-sm">Rotasi secret</span></button>
              <button type="button" class="btn btn--sm btn--icon btn--danger-ghost" data-delete="${hook.id}" aria-label="Hapus webhook">${ic.trash}</button>
            </footer>
          </article>`;
      })}</div>` : html`<div class="card">${emptyState('Belum ada webhook', 'Hubungkan TensuraLabs dengan tools tim Anda. Setiap lead baru bisa langsung muncul di Slack atau CRM.', html`<button type="button" class="btn btn--primary" data-create>${ic.plus}<span>Buat webhook pertama</span></button>`)}</div>`}

      <section class="card stack docs">
        <header class="card__head"><h3>${ic.code} Verifikasi signature</h3><button type="button" class="btn btn--sm btn--ghost" data-copy-snippet>${ic.copy}<span>Salin kode</span></button></header>
        <p class="muted">Setiap request <code>POST</code> berisi JSON <code>{ id, event, createdAt, data }</code> dengan header <code>X-Tensura-Event</code>, <code>X-Tensura-Delivery</code>, dan <code>X-Tensura-Signature: t=&lt;unix&gt;,v1=&lt;hmac&gt;</code>. HMAC dihitung dari <code>"t.rawBody"</code> memakai secret webhook. Balas 2xx dalam 8 detik; status 408/429/5xx atau gangguan jaringan dicoba ulang otomatis (2 detik, lalu 15 detik).</p>
        <pre class="code">${VERIFY_SNIPPET}</pre>
      </section>`);
  }

  ctx.root.addEventListener('change', async (e) => {
    const toggle = e.target.closest('[data-toggle]');
    if (!toggle) return;
    try { await api.updateWebhook(Number(toggle.dataset.toggle), { isActive: toggle.checked }); toast(toggle.checked ? 'Webhook diaktifkan' : 'Webhook dinonaktifkan'); load(); } catch (error) { toggle.checked = !toggle.checked; toast(errorMessage(error), 'danger'); }
  });
  ctx.root.addEventListener('click', async (e) => {
    const t = e.target;
    const find = (attr) => { const el = t.closest(`[${attr}]`); return el ? data.items.find((h) => h.id === Number(el.getAttribute(attr))) : null; };
    if (t.closest('[data-retry]')) { load(); return; }
    if (t.closest('[data-copy-snippet]')) { copyText(VERIFY_SNIPPET); return; }
    if (t.closest('[data-create]')) {
      const result = await editorDialog(data.events);
      if (result) { toast('Webhook dibuat'); showSecret(result.secret); load(); }
      return;
    }
    let hook = find('data-edit');
    if (hook) { if (await editorDialog(data.events, hook)) { toast('Webhook disimpan'); load(); } return; }
    hook = find('data-log');
    if (hook) { deliveriesDrawer(hook); return; }
    hook = find('data-test');
    if (hook) {
      const btn = t.closest('[data-test]');
      btn.disabled = true; btn.classList.add('is-loading');
      try {
        const r = await api.testWebhook(hook.id);
        toast(r.ok ? `Ping berhasil · HTTP ${r.statusCode} · ${r.durationMs} ms` : `Ping gagal${r.statusCode ? ` · HTTP ${r.statusCode}` : ''}${r.error ? ` · ${r.error}` : ''}`, r.ok ? 'ok' : 'danger');
        load();
      } catch (error) { toast(errorMessage(error), 'danger'); btn.disabled = false; btn.classList.remove('is-loading'); }
      return;
    }
    hook = find('data-rotate');
    if (hook) {
      if (!(await confirmDialog({ title: 'Rotasi secret?', message: `Secret lama "${hook.name}" langsung tidak berlaku. Perbarui server penerima segera setelah ini.`, confirm: 'Rotasi', tone: 'primary' }))) return;
      try { const { secret } = await api.rotateWebhookSecret(hook.id); showSecret(secret, 'Secret baru'); } catch (error) { toast(errorMessage(error), 'danger'); }
      return;
    }
    hook = find('data-delete');
    if (hook) {
      if (!(await confirmDialog({ title: 'Hapus webhook?', message: `"${hook.name}" dan riwayat pengirimannya akan dihapus.` }))) return;
      try { await api.deleteWebhook(hook.id); toast('Webhook dihapus'); load(); } catch (error) { toast(errorMessage(error), 'danger'); }
    }
  });

  render(ctx.root, loading(6));
  await load();
  return {};
}
