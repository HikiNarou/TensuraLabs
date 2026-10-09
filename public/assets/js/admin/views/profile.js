import { api } from '../api.js';
import { ic } from '../icons.js';
import { avatar, badge, confirmDialog, copyText, errorBox, errorMessage, fmtDate, fmtDateTime, fmtRelative, formDialog, html, loading, overlay, qs, render, ROLE_LABEL, toast } from '../ui.js';

const svgDataUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Displays recovery codes once with copy / download helpers. */
function showRecoveryCodes(codes, email) {
  const text = `Kode pemulihan TensuraLabs Console (${email})\nDibuat: ${new Date().toLocaleString('id-ID')}\nSetiap kode hanya dapat dipakai sekali.\n\n${codes.join('\n')}\n`;
  const ov = overlay({ title: 'Kode pemulihan', size: 'sm' });
  render(ov.body, html`
    <div class="stack">
      <div class="alert alert--warn">${ic.lock}<span>Simpan kode ini di tempat aman (password manager). Kode hanya ditampilkan <b>sekali</b> dan dapat dipakai login jika ponsel Anda hilang.</span></div>
      <ol class="recovery">${codes.map((code) => html`<li><code>${code}</code></li>`)}</ol>
      <div class="ov__actions">
        <button type="button" class="btn" data-copy-codes>${ic.copy}<span>Salin</span></button>
        <button type="button" class="btn" data-download-codes>${ic.download}<span>Unduh .txt</span></button>
        <button type="button" class="btn btn--primary" data-ov-close>Selesai</button>
      </div>
    </div>`);
  ov.body.addEventListener('click', (e) => {
    if (e.target.closest('[data-copy-codes]')) copyText(text);
    if (e.target.closest('[data-download-codes]')) {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: 'tensuralabs-recovery-codes.txt' });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  });
}

function twoFactorCard(status, setup) {
  if (status.enabled) {
    return html`
      <section class="card stack tfa" data-tfa>
        <header class="card__head"><h3>${ic.shield} Autentikasi dua langkah</h3>${badge('Aktif', 'ok')}</header>
        <p class="muted">Login memerlukan kode 6 digit dari aplikasi authenticator. Aktif sejak ${fmtDate(status.enabledAt)}.</p>
        <div class="tfa__meta ${status.recoveryRemaining <= 3 ? 'is-low' : ''}">${ic.key}<span><b>${status.recoveryRemaining}</b> dari 10 kode pemulihan tersisa${status.recoveryRemaining <= 3 ? ' — sebaiknya buat ulang.' : '.'}</span></div>
        <div class="row row--wrap row--end">
          <button type="button" class="btn btn--sm" data-tfa-regen>${ic.refresh}<span>Buat ulang kode pemulihan</span></button>
          <button type="button" class="btn btn--sm btn--danger-ghost" data-tfa-disable>Nonaktifkan</button>
        </div>
      </section>`;
  }
  if (setup) {
    return html`
      <section class="card stack tfa" data-tfa>
        <header class="card__head"><h3>${ic.shield} Aktifkan autentikasi dua langkah</h3><button type="button" class="btn btn--sm btn--ghost" data-tfa-cancel>Batal</button></header>
        <div class="tfa__setup">
          <figure class="tfa__qr"><img src="${svgDataUrl(setup.qrSvg)}" alt="Kode QR untuk aplikasi authenticator" width="180" height="180"></figure>
          <ol class="tfa__steps">
            <li>Buka Google Authenticator, 1Password, Authy, atau aplikasi TOTP lain.</li>
            <li>Pindai kode QR, atau masukkan kunci ini secara manual:
              <div class="secret"><code>${setup.secret}</code><button type="button" class="btn btn--sm btn--ghost btn--icon" data-copy="${setup.secret.replace(/\s/g, '')}" aria-label="Salin kunci">${ic.copy}</button></div></li>
            <li>Masukkan kode 6 digit yang muncul:
              <form class="row" data-tfa-enable>
                <input class="input input--otp" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" placeholder="000000" required aria-label="Kode verifikasi">
                <button class="btn btn--primary" type="submit">${ic.check}<span>Verifikasi</span></button>
              </form></li>
          </ol>
        </div>
      </section>`;
  }
  return html`
    <section class="card stack tfa" data-tfa>
      <header class="card__head"><h3>${ic.shield} Autentikasi dua langkah</h3>${badge('Belum aktif', 'warn')}</header>
      <p class="muted">Lindungi akun dari pencurian password: selain password, login juga membutuhkan kode dari aplikasi authenticator di ponsel Anda.</p>
      <div class="row row--end"><button type="button" class="btn btn--primary" data-tfa-setup>${ic.lock}<span>Aktifkan 2FA</span></button></div>
    </section>`;
}

function deviceName(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ua.split('/')[0] || 'Peramban';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return `${browser}${os ? ` · ${os}` : ''}`;
}

export async function mount(ctx) {
  ctx.setTitle('Profil & keamanan');
  async function load() {
    render(ctx.root, loading(6));
    let profile; let sessions;
    try { [profile, sessions, tfa] = await Promise.all([api.profile(), api.sessions(), api.twoFactorStatus()]); } catch (error) { render(ctx.root, errorBox(error)); return; }
    email = profile.email;
    render(ctx.root, html`
      <div class="page-head"><div class="row">${avatar(profile.name, 'lg')}<div><h2>${profile.name}</h2><p class="muted">${profile.email} · ${ROLE_LABEL[profile.role]} · bergabung ${fmtDateTime(profile.createdAt)}</p></div></div></div>
      <div class="grid grid--2">
        <form class="card stack" data-profile>
          <h3>Informasi akun</h3>
          <label class="field"><span class="field__label">Nama tampilan</span><input class="input" name="name" maxlength="80" value="${profile.name}" required></label>
          <label class="field"><span class="field__label">Email</span><input class="input" value="${profile.email}" disabled><small class="field__hint">Hubungi admin untuk mengganti email.</small></label>
          <div class="row row--end"><button class="btn btn--primary" type="submit">Simpan</button></div>
        </form>
        <form class="card stack" data-password autocomplete="on">
          <h3>Ganti password</h3>
          <input type="text" name="username" autocomplete="username" value="${profile.email}" hidden>
          <label class="field"><span class="field__label">Password saat ini</span><input class="input" type="password" name="currentPassword" autocomplete="current-password" required></label>
          <label class="field"><span class="field__label">Password baru</span><input class="input" type="password" name="newPassword" autocomplete="new-password" minlength="10" required><small class="field__hint">Minimal 10 karakter, kombinasi huruf & angka. Sesi lain akan diakhiri.</small></label>
          <div class="meter" data-meter><i></i></div>
          <div class="row row--end"><button class="btn btn--primary" type="submit">${ic.key}<span>Perbarui password</span></button></div>
        </form>
      </div>
      <div data-tfa-slot>${twoFactorCard(tfa, null)}</div>
      <section class="card">
        <header class="card__head"><h3>Sesi aktif</h3>${sessions.length > 1 ? html`<button type="button" class="btn btn--sm btn--danger-ghost" data-revoke-others>Akhiri sesi lain</button>` : ''}</header>
        <ul class="sessions">${sessions.map((s) => html`
          <li><span class="sessions__icon">${/Mobile|Android|iPhone/.test(s.userAgent) ? ic.mobile : ic.monitor}</span>
            <div><b>${deviceName(s.userAgent)} ${s.current ? badge('Sesi ini', 'ok') : ''}</b><small>Masuk ${fmtDateTime(s.createdAt)} · aktif ${fmtRelative(s.lastSeenAt)} · berakhir ${fmtDateTime(s.expiresAt)}</small></div>
            ${s.current ? '' : html`<button type="button" class="btn btn--sm btn--ghost" data-revoke="${s.id}">Akhiri</button>`}</li>`)}</ul>
      </section>`);
  }

  ctx.root.addEventListener('input', (e) => {
    if (e.target.name !== 'newPassword') return;
    const v = e.target.value;
    const score = [v.length >= 10, v.length >= 14, /[a-z]/.test(v) && /[A-Z]/.test(v), /\d/.test(v), /[^\w]/.test(v)].filter(Boolean).length;
    const meter = qs('[data-meter]', ctx.root);
    meter.dataset.score = String(score);
  });
  let tfa = null; let email = '';
  const paintTfa = (setup = null) => { const slot = qs('[data-tfa-slot]', ctx.root); if (slot) render(slot, twoFactorCard(tfa, setup)); };
  ctx.root.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    if (form.matches('[data-tfa-enable]')) {
      const button = qs('[type=submit]', form);
      button.disabled = true;
      try {
        const { recoveryCodes, status } = await api.twoFactorEnable(form.elements.code.value.replace(/\s/g, ''));
        tfa = status; paintTfa();
        toast('Autentikasi dua langkah aktif');
        showRecoveryCodes(recoveryCodes, email);
      } catch (error) { toast(errorMessage(error), 'danger'); form.elements.code.select(); } finally { button.disabled = false; }
      return;
    }
    try {
      if (form.matches('[data-profile]')) { await api.updateProfile({ name: form.elements.name.value.trim() }); toast('Profil diperbarui'); }
      if (form.matches('[data-password]')) {
        await api.changePassword({ currentPassword: form.elements.currentPassword.value, newPassword: form.elements.newPassword.value });
        toast('Password diperbarui');
        form.reset();
      }
      load();
    } catch (error) { toast(errorMessage(error), 'danger'); }
  });
  ctx.root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-retry]')) { load(); return; }
    const revoke = e.target.closest('[data-revoke]');
    const copy = e.target.closest('[data-copy]');
    if (copy) { copyText(copy.dataset.copy); return; }
    try {
      if (e.target.closest('[data-tfa-setup]')) { paintTfa(await api.twoFactorSetup()); qs('[name=code]', ctx.root)?.focus(); return; }
      if (e.target.closest('[data-tfa-cancel]')) { paintTfa(); return; }
      const passwordPrompt = (title, submit, run) => formDialog({
        title, submit,
        fields: [{ name: 'password', label: 'Konfirmasi password', type: 'password', required: true, autocomplete: 'current-password' }],
        onSubmit: (v) => run(v.password),
      });
      if (e.target.closest('[data-tfa-regen]')) {
        let codes = null;
        await passwordPrompt('Buat ulang kode pemulihan', 'Buat ulang', async (pw) => { const r = await api.twoFactorRecovery(pw); codes = r.recoveryCodes; tfa = r.status; });
        if (codes) { paintTfa(); showRecoveryCodes(codes, email); }
        return;
      }
      if (e.target.closest('[data-tfa-disable]')) {
        let done = false;
        await passwordPrompt('Nonaktifkan 2FA?', 'Nonaktifkan', async (pw) => { tfa = await api.twoFactorDisable(pw); done = true; });
        if (done) { paintTfa(); toast('Autentikasi dua langkah dinonaktifkan'); }
        return;
      }
      if (revoke) { await api.revokeSession(Number(revoke.dataset.revoke)); toast('Sesi diakhiri'); load(); }
      if (e.target.closest('[data-revoke-others]')) {
        if (!(await confirmDialog({ title: 'Akhiri sesi lain?', message: 'Semua perangkat lain akan keluar dari akun Anda.', confirm: 'Akhiri' }))) return;
        await api.revokeOtherSessions(); toast('Sesi lain diakhiri'); load();
      }
    } catch (error) { toast(errorMessage(error), 'danger'); }
  });
  await load();
  return {};
}
