import { api } from '../api.js';
import { ic } from '../icons.js';
import { confirmDialog, errorBox, errorMessage, fmtBytes, fmtDuration, fmtNumber, html, loading, render, toast } from '../ui.js';

const TASKS = [
  { task: 'sessions', icon: 'key', title: 'Bersihkan sesi kedaluwarsa', text: 'Menghapus sesi login yang sudah tidak berlaku.' },
  { task: 'analytics', icon: 'trend', title: 'Pangkas data pengunjung', text: 'Menghapus jejak pengunjung anonim > 90 hari (agregat tetap).' },
  { task: 'audit', icon: 'audit', title: 'Pangkas log audit', text: 'Menghapus log aktivitas yang lebih tua dari 180 hari.' },
  { task: 'orphans', icon: 'image', title: 'Hapus file yatim', text: 'Menghapus file di folder unggahan yang tidak tercatat di pustaka media.' },
  { task: 'notifications', icon: 'bell', title: 'Bersihkan notifikasi', text: 'Menghapus notifikasi yang sudah dibaca lebih dari 30 hari.' },
  { task: 'webhooks', icon: 'webhook', title: 'Pangkas log webhook', text: 'Menghapus riwayat pengiriman webhook lebih dari 30 hari.' },
  { task: 'mail', icon: 'mail', title: 'Retensi Mail', text: 'Menghapus alamat sementara kedaluwarsa, email lewat masa simpan, dan sesi Mail usang.' },
  { task: 'optimize', icon: 'database', title: 'Optimalkan database', text: 'Menjalankan PRAGMA optimize dan checkpoint WAL.' },
];
const TABLE_LABEL = { users: 'Pengguna', sessions: 'Sesi', leads: 'Leads', lead_events: 'Riwayat lead', tasks: 'Tugas', quotes: 'Penawaran', notifications: 'Notifikasi', webhooks: 'Webhook', webhook_deliveries: 'Log webhook', articles: 'Artikel', media: 'Media', audit_logs: 'Log audit', squad_roles: 'Tim', portfolio_items: 'Portofolio', gazette_issues: 'Kabar Guild', mail_addresses: 'Alamat email', mail_messages: 'Email', mail_attachments: 'Lampiran email' };

export async function mount(ctx) {
  ctx.setTitle('Sistem');
  async function load() {
    render(ctx.root, loading(6));
    let info;
    try { info = await api.system(); } catch (error) { render(ctx.root, errorBox(error)); return; }
    const memPct = Math.round(((info.memory.systemTotal - info.memory.systemFree) / info.memory.systemTotal) * 100);
    render(ctx.root, html`
      <div class="page-head"><div><h2>Sistem</h2><p class="muted">Kesehatan server, database, backup, dan pemeliharaan.</p></div>
        <div class="row"><button type="button" class="btn btn--ghost" data-reload>${ic.refresh}<span>Segarkan</span></button>
        <a class="btn btn--primary" href="/api/admin/system/backup" download>${ic.download}<span>Unduh backup</span></a></div></div>
      <div class="grid grid--kpi">
        <div class="card kpi"><div class="kpi__top"><span class="kpi__icon kpi__icon--ok">${ic.server}</span><span class="kpi__label">Status</span></div><div class="kpi__value kpi__value--sm"><span class="dot dot--ok dot--pulse"></span> Online</div><div class="kpi__foot muted">uptime ${fmtDuration(info.uptimeSeconds)} · ${info.env}</div></div>
        <div class="card kpi"><div class="kpi__top"><span class="kpi__icon">${ic.bolt}</span><span class="kpi__label">Memori proses</span></div><div class="kpi__value kpi__value--sm">${fmtBytes(info.memory.rss)}</div><div class="kpi__foot muted">heap ${fmtBytes(info.memory.heapUsed)} · sistem ${memPct}% terpakai</div></div>
        <div class="card kpi"><div class="kpi__top"><span class="kpi__icon kpi__icon--violet">${ic.database}</span><span class="kpi__label">Database</span></div><div class="kpi__value kpi__value--sm">${fmtBytes(info.database.size)}</div><div class="kpi__foot muted">skema v${info.database.schemaVersion} · ${info.database.journalMode.toUpperCase()}</div></div>
        <div class="card kpi"><div class="kpi__top"><span class="kpi__icon kpi__icon--warn">${ic.image}</span><span class="kpi__label">Unggahan</span></div><div class="kpi__value kpi__value--sm">${fmtBytes(info.uploads.size)}</div><div class="kpi__foot muted">${fmtNumber(info.counts.media)} file media</div></div>
      </div>
      <div class="grid grid--2">
        <section class="card"><header class="card__head"><h3>Informasi</h3></header>
          <dl class="dl dl--rows">
            <div><dt>Versi aplikasi</dt><dd>${info.version}</dd></div><div><dt>Node.js</dt><dd>${info.node}</dd></div>
            <div><dt>Platform</dt><dd>${info.platform}</dd></div><div><dt>Beban (1/5/15 m)</dt><dd>${info.load.map((n) => n.toFixed(2)).join(' · ')}</dd></div>
            <div><dt>File database</dt><dd>${info.database.path}</dd></div>
          </dl></section>
        <section class="card"><header class="card__head"><h3>Isi database</h3></header>
          <dl class="dl dl--rows">${Object.entries(info.counts).map(([k, v]) => html`<div><dt>${TABLE_LABEL[k] ?? k}</dt><dd>${fmtNumber(v)}</dd></div>`)}</dl></section>
      </div>
      <section class="card"><header class="card__head"><h3>Pemeliharaan</h3></header>
        <div class="tasks">${TASKS.map((t) => html`<div class="task"><span class="task__icon">${ic[t.icon]}</span><div><b>${t.title}</b><small>${t.text}</small></div><button type="button" class="btn btn--sm" data-task="${t.task}">Jalankan</button></div>`)}</div>
      </section>`);
  }
  ctx.root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-reload], [data-retry]')) { load(); return; }
    const button = e.target.closest('[data-task]');
    if (!button) return;
    const task = TASKS.find((t) => t.task === button.dataset.task);
    if (!(await confirmDialog({ title: task.title, message: `${task.text} Lanjutkan?`, confirm: 'Jalankan', tone: 'primary' }))) return;
    button.disabled = true;
    try { const r = await api.maintenance(task.task); toast(`Selesai · ${fmtNumber(r?.affected ?? 0)} item diproses`); load(); } catch (error) { toast(errorMessage(error), 'danger'); button.disabled = false; }
  });
  await load();
  return {};
}
