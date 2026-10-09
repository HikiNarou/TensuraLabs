import { api } from '../api.js';
import { ic } from '../icons.js';
import { avatar, badge, confirmDialog, debounce, emptyState, errorBox, errorMessage, fmtRelative, formDialog, html, loading, pager, qs, render, ROLE_LABEL, toast } from '../ui.js';

const ROLE_HINT = 'Admin: akses penuh. Editor: artikel, konten, media, dan dashboard tanpa data leads.';

export async function mount(ctx) {
  ctx.setTitle('Pengguna');
  const f = { q: '', role: 'all', page: 1 };

  render(ctx.root, html`
    <div class="page-head">
      <div><h2>Pengguna & akses</h2><p class="muted">${ROLE_HINT}</p></div>
      <button type="button" class="btn btn--primary" data-new>${ic.plus}<span>Undang pengguna</span></button>
    </div>
    <div class="card filters">
      <label class="search">${ic.search}<input type="search" class="input" placeholder="Cari nama atau email…" data-q></label>
      <select class="input" data-role aria-label="Peran"><option value="all">Semua peran</option><option value="admin">Admin</option><option value="editor">Editor</option></select>
    </div>
    <div data-results>${loading(4)}</div>`);

  let data;
  async function load() {
    const results = qs('[data-results]', ctx.root);
    try {
      data = await api.users({ ...f, pageSize: 20 });
      render(results, data.items.length ? html`
        <div class="card card--flush"><div class="table-wrap"><table class="table">
          <thead><tr><th>Pengguna</th><th>Peran</th><th>Status</th><th>2FA</th><th>Sesi aktif</th><th>Login terakhir</th><th></th></tr></thead>
          <tbody>${data.items.map((u) => html`<tr>
            <td><div class="cell-user">${avatar(u.name)}<span><b>${u.name}${u.id === ctx.user.id ? html` <small class="muted">(Anda)</small>` : ''}</b><small>${u.email}</small></span></div></td>
            <td>${badge(ROLE_LABEL[u.role], u.role === 'admin' ? 'violet' : 'info')}</td>
            <td>${u.isActive ? badge('Aktif', 'ok') : badge('Nonaktif', 'muted')}</td>
            <td>${u.twoFactor ? html`<span class="badge badge--ok" title="Autentikasi dua langkah aktif">${ic.shield}Aktif</span>` : html`<span class="muted small">Tidak</span>`}</td>
            <td>${u.activeSessions}</td>
            <td class="nowrap">${u.lastLoginAt ? fmtRelative(u.lastLoginAt) : html`<span class="muted">Belum pernah</span>`}</td>
            <td class="col-actions">
              <button type="button" class="btn btn--icon btn--ghost btn--sm" data-edit="${u.id}" aria-label="Edit">${ic.edit}</button>
              <button type="button" class="btn btn--icon btn--ghost btn--sm" data-password="${u.id}" aria-label="Reset password">${ic.key}</button>
              ${u.twoFactor && u.id !== ctx.user.id ? html`<button type="button" class="btn btn--icon btn--ghost btn--sm" data-reset-2fa="${u.id}" aria-label="Reset 2FA" title="Reset 2FA">${ic.lock}</button>` : ''}
              ${u.id !== ctx.user.id ? html`<button type="button" class="btn btn--icon btn--ghost btn--sm" data-delete="${u.id}" aria-label="Hapus">${ic.trash}</button>` : ''}
            </td></tr>`)}</tbody></table></div>${pager(data.pagination)}</div>`
        : emptyState('Tidak ada pengguna'));
    } catch (error) { render(results, errorBox(error)); }
  }

  const find = (id) => data.items.find((u) => u.id === Number(id));
  const search = debounce(() => { f.page = 1; load(); }, 300);
  ctx.root.addEventListener('input', (e) => { if (e.target.matches('[data-q]')) { f.q = e.target.value.trim(); search(); } });
  ctx.root.addEventListener('change', (e) => { if (e.target.matches('[data-role]')) { f.role = e.target.value; f.page = 1; load(); } });
  ctx.root.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-retry]')) { load(); return; }
    const page = t.closest('[data-page]');
    if (page && !page.disabled) { f.page = Number(page.dataset.page); load(); return; }
    if (t.closest('[data-new]')) {
      const values = await formDialog({
        title: 'Undang pengguna', submit: 'Buat akun',
        fields: [
          { name: 'name', label: 'Nama', required: true },
          { name: 'email', label: 'Email', type: 'email', required: true },
          { name: 'role', label: 'Peran', type: 'select', value: 'editor', options: [{ value: 'editor', label: 'Editor' }, { value: 'admin', label: 'Admin' }], hint: ROLE_HINT },
          { name: 'password', label: 'Password awal', type: 'password', required: true, autocomplete: 'new-password', hint: 'Min. 10 karakter, kombinasi huruf & angka. Bagikan secara aman.' },
        ],
        onSubmit: (v) => api.createUser({ ...v, isActive: true }),
      });
      if (values) { toast('Pengguna dibuat'); load(); }
      return;
    }
    const edit = t.closest('[data-edit]');
    if (edit) {
      const user = find(edit.dataset.edit);
      const self = user.id === ctx.user.id;
      const values = await formDialog({
        title: `Edit ${user.name}`,
        fields: [
          { name: 'name', label: 'Nama', value: user.name, required: true },
          ...(self ? [] : [
            { name: 'role', label: 'Peran', type: 'select', value: user.role, options: [{ value: 'editor', label: 'Editor' }, { value: 'admin', label: 'Admin' }] },
            { name: 'isActive', label: 'Akun aktif (bisa login)', type: 'checkbox', value: user.isActive },
          ]),
        ],
        onSubmit: (v) => api.updateUser(user.id, v),
      });
      if (values) { toast('Pengguna diperbarui'); load(); }
      return;
    }
    const pw = t.closest('[data-password]');
    if (pw) {
      const user = find(pw.dataset.password);
      const values = await formDialog({
        title: `Reset password ${user.name}`, submit: 'Reset password',
        fields: [{ name: 'password', label: 'Password baru', type: 'password', required: true, autocomplete: 'new-password', hint: 'Semua sesi pengguna ini akan diakhiri.' }],
        onSubmit: (v) => api.resetUserPassword(user.id, v.password),
      });
      if (values) toast('Password direset');
      return;
    }
    const reset2fa = t.closest('[data-reset-2fa]');
    if (reset2fa) {
      const user = find(reset2fa.dataset.reset2fa);
      if (!(await confirmDialog({ title: 'Reset 2FA?', message: `Autentikasi dua langkah ${user.name} akan dinonaktifkan dan kode pemulihannya dihapus. Gunakan hanya jika pengguna kehilangan akses ke aplikasi authenticator.`, confirm: 'Reset 2FA' }))) return;
      try { await api.resetUserTwoFactor(user.id); toast('2FA direset — minta pengguna mengaktifkannya kembali'); load(); } catch (error) { toast(errorMessage(error), 'danger'); }
      return;
    }
    const del = t.closest('[data-delete]');
    if (del) {
      const user = find(del.dataset.delete);
      if (!(await confirmDialog({ title: 'Hapus pengguna?', message: `${user.name} (${user.email}) tidak akan bisa login lagi. Riwayat aktivitasnya tetap tersimpan.` }))) return;
      try { await api.deleteUser(user.id); toast('Pengguna dihapus'); load(); } catch (error) { toast(errorMessage(error), 'danger'); }
    }
  });
  await load();
  return {};
}
