import { api } from '../api.js';
import { areaChart, barList, bindChartTooltip, donut, sparkline } from '../charts.js';
import { ic } from '../icons.js';
import { openTaskEditor, taskRow, toggleTask } from '../task-editor.js';
import { avatar, badge, errorBox, errorMessage, fmtMoneyShort, fmtNumber, fmtRelative, html, LEAD_STATUS, qs, render, toast } from '../ui.js';

const RANGES = [7, 30, 90];
const REFRESH_MS = 60000;
const DEVICE_LABEL = { desktop: 'Desktop', mobile: 'Mobile', tablet: 'Tablet' };
const DEVICE_TONE = { desktop: 'accent', mobile: 'violet', tablet: 'cyan' };
const ACTION_ICON = { create: 'plus', update: 'edit', delete: 'trash', login: 'key', logout: 'logout', upload: 'upload', reset: 'refresh', bulk: 'list', comment: 'message' };

function delta(current, previous) {
  if (!previous) return current ? html`<span class="delta delta--up">${ic.trend} baru</span>` : '';
  const pct = Math.round(((current - previous) / previous) * 100);
  return html`<span class="delta ${pct >= 0 ? 'delta--up' : 'delta--down'}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}%</span>`;
}

function kpi({ label, value, icon, foot = '', spark = '', tone = 'accent', href }) {
  const inner = html`<div class="kpi__top"><span class="kpi__icon kpi__icon--${tone}">${ic[icon]}</span><span class="kpi__label">${label}</span></div>
    <div class="kpi__value">${value}</div><div class="kpi__foot">${foot}</div>${spark}`;
  return href ? html`<a class="card kpi" href="${href}">${inner}</a>` : html`<div class="card kpi">${inner}</div>`;
}

export async function mount(ctx) {
  ctx.setTitle('Dashboard');
  const isAdmin = ctx.user.role === 'admin';
  let days = Number(ctx.query.get('days')) || 30;
  if (!RANGES.includes(days)) days = 30;

  let data = null;
  let timer = 0;
  let loading = false;
  async function load({ silent = false } = {}) {
    if (loading) return;
    loading = true;
    qs('[data-refresh]', ctx.root)?.classList.add('is-spinning');
    try {
      data = await api.dashboard(days);
      const scroll = qs('.main')?.scrollTop ?? 0;
      paint(data);
      if (silent && qs('.main')) qs('.main').scrollTop = scroll;
    } catch (error) {
      if (!silent || !data) render(ctx.root, errorBox(error));
    } finally {
      loading = false;
      qs('[data-refresh]', ctx.root)?.classList.remove('is-spinning');
    }
  }
  const schedule = () => { clearInterval(timer); timer = setInterval(() => { if (!document.hidden && !document.documentElement.classList.contains('has-overlay')) load({ silent: true }); }, REFRESH_MS); };
  const onVisible = () => { if (!document.hidden && data && Date.now() - Date.parse(data.generatedAt) > REFRESH_MS) load({ silent: true }); };
  document.addEventListener('visibilitychange', onVisible);

  function paint(d) {
    const t = d.traffic;
    const L = d.leads;
    const T = d.tasks;
    const Q = d.quotes;
    const hour = new Date().getHours();
    const greet = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 19 ? 'Selamat sore' : 'Selamat malam';
    render(ctx.root, html`
      <div class="page-head">
        <div><h2>${greet}, ${ctx.user.name.split(' ')[0]} 👋</h2><p class="muted">Ringkasan performa ${days} hari terakhir · <span title="Diperbarui otomatis tiap menit">diperbarui ${new Date(d.generatedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span></p></div>
        <div class="row">
          <button type="button" class="btn btn--icon btn--ghost" data-refresh aria-label="Muat ulang" title="Muat ulang">${ic.refresh}</button>
          <div class="segmented" role="group" aria-label="Rentang waktu">${RANGES.map((r) => html`<button type="button" class="${r === days ? 'is-active' : ''}" data-days="${r}">${r} hari</button>`)}</div>
        </div>
      </div>

      <div class="grid grid--kpi">
        ${kpi({ label: 'Kunjungan halaman', value: fmtNumber(t.totals.views), icon: 'eye', foot: html`${delta(t.totals.views, t.previousViews)} <span class="muted">vs periode sebelumnya</span>`, spark: sparkline(t.series.map((s) => s.views)) })}
        ${kpi({ label: 'Pengunjung unik', value: fmtNumber(t.totals.visitors), icon: 'users', tone: 'violet', foot: html`<span class="muted">anonim · tanpa cookie</span>`, spark: sparkline(t.series.map((s) => s.visitors), 'violet') })}
        ${isAdmin ? kpi({ label: 'Leads masuk', value: fmtNumber(L.current), icon: 'leads', tone: 'ok', href: '#/leads', foot: html`${delta(L.current, L.previous)} <span class="muted">${fmtNumber(L.fresh)} belum ditangani</span>`, spark: sparkline(L.series.map((s) => s.total), 'ok') })
          : kpi({ label: 'Artikel terbit', value: fmtNumber(d.articles.published), icon: 'articles', tone: 'ok', href: '#/articles', foot: html`<span class="muted">${d.articles.drafts} draf · ${d.articles.scheduled} terjadwal</span>` })}
        ${isAdmin ? kpi({ label: 'Konversi', value: d.conversion === null ? '—' : `${String(d.conversion).replace('.', ',')}%`, icon: 'bolt', tone: 'warn', foot: html`<span class="muted">leads / pengunjung unik</span>` })
          : kpi({ label: 'Konten tampil', value: fmtNumber(d.content.squad + d.content.portfolio + d.content.gazette), icon: 'portfolio', tone: 'warn', foot: html`<span class="muted">tim, portofolio & kabar</span>` })}
      </div>

      <div class="grid grid--main grid--main-rev">
        <section class="card">
          <header class="card__head"><h3>Follow-up saya</h3><div class="row"><button type="button" class="btn btn--sm btn--ghost" data-new-task>${ic.plus}<span>Tugas</span></button><a class="link" href="#/tasks?scope=mine">Semua →</a></div></header>
          <div class="pills">
            <a class="pill ${T.overdue ? 'pill--danger' : ''}" href="#/tasks?due=overdue"><b>${fmtNumber(T.overdue)}</b><span>terlambat</span></a>
            <a class="pill ${T.dueToday ? 'pill--warn' : ''}" href="#/tasks?due=today"><b>${fmtNumber(T.dueToday)}</b><span>hari ini</span></a>
            <a class="pill" href="#/tasks"><b>${fmtNumber(T.open)}</b><span>terbuka</span></a>
            <span class="pill pill--ok"><b>${fmtNumber(T.doneWeek)}</b><span>selesai 7 hari</span></span>
          </div>
          ${T.upcoming.length ? html`<ul class="todos">${T.upcoming.map((task) => taskRow(task, { showLead: isAdmin, compact: true }))}</ul>`
            : html`<p class="muted small empty-inline">${ic.check} Tidak ada follow-up terbuka. Kerja bagus!</p>`}
        </section>
        ${isAdmin && Q ? html`
          <section class="card">
            <header class="card__head"><h3>Penjualan</h3><a class="link" href="#/quotes">Penawaran →</a></header>
            <div class="mini-stats mini-stats--lg">
              <div><small>Pipeline aktif</small><b>${fmtMoneyShort(Q.pipeline)}</b><span class="muted small">${fmtNumber(Q.byStatus.sent)} terkirim</span></div>
              <div><small>Deal ${days} hari</small><b class="tone-ok">${fmtMoneyShort(Q.won)}</b><span class="muted small">${fmtNumber(Q.byStatus.accepted)} diterima total</span></div>
              <div><small>Penerimaan</small><b>${Q.acceptanceRate === null ? '—' : `${String(Q.acceptanceRate).replace('.', ',')}%`}</b><span class="muted small">${fmtNumber(Q.byStatus.draft)} draf</span></div>
            </div>
            <h4 class="mt">Layanan paling diminati</h4>
            ${barList((L.byService ?? []).map((s) => ({ label: s.service, value: s.total })), { empty: 'Belum ada data layanan.' })}
          </section>` : ''}
          ${d.mail ? html`
          <section class="card card--span">
            <header class="card__head"><h3>Mail</h3><a class="link" href="#/mail">Kotak masuk →</a></header>
            <div class="mini-stats mini-stats--lg">
              <div><small>Email masuk 24 jam</small><b>${fmtNumber(d.mail.messages.inboundDay)}</b><span class="muted small">${d.mail.lastInboundAt ? `terakhir ${fmtRelative(d.mail.lastInboundAt)}` : 'belum ada'}</span></div>
              <div><small>Belum dibaca (tim)</small><b class="${d.mail.unreadTeam ? 'tone-warn' : ''}">${fmtNumber(d.mail.unreadTeam)}</b><span class="muted small">${fmtNumber(d.mail.messages.outboundDay)} terkirim 24 jam</span></div>
              <div><small>Alamat aktif</small><b>${fmtNumber(d.mail.addresses.active)}</b><span class="muted small">${d.mail.rejectedDay ? `${fmtNumber(d.mail.rejectedDay)} ditolak` : `${fmtNumber(d.mail.addresses.createdDay)} baru`}</span></div>
            </div>
          </section>` : ''}
      </div>

      <div class="grid grid--main">
        <section class="card card--chart">
          <header class="card__head"><h3>Trafik</h3><div class="legend legend--inline"><span><i class="dot dot--accent"></i>Kunjungan</span><span><i class="dot dot--violet"></i>Pengunjung</span>${isAdmin ? html`<span><i class="dot dot--ok"></i>Leads</span>` : ''}</div></header>
          ${areaChart({
            data: t.series.map((s, i) => ({ ...s, leads: isAdmin ? L.series[i]?.total ?? 0 : 0 })),
            series: [{ key: 'views', label: 'Kunjungan', tone: 'accent' }, { key: 'visitors', label: 'Pengunjung', tone: 'violet' }, ...(isAdmin ? [{ key: 'leads', label: 'Leads', tone: 'ok' }] : [])],
          })}
        </section>
        ${isAdmin ? html`
          <section class="card">
            <header class="card__head"><h3>Pipeline leads</h3><a class="link" href="#/leads?view=board">Kanban →</a></header>
            ${donut(Object.entries(LEAD_STATUS).map(([key, meta]) => ({ label: meta.label, value: L.byStatus[key] ?? 0, tone: meta.tone })), { label: 'Status leads' })}
            <div class="mini-stats">
              <div><small>Win rate</small><b>${L.winRate === null ? '—' : `${L.winRate}%`}</b></div>
              <div><small>Respons rata-rata</small><b>${L.avgResponseHours === null ? '—' : `${String(L.avgResponseHours).replace('.', ',')} jam`}</b></div>
              <div><small>Prioritas tinggi</small><b>${L.urgent}</b></div>
            </div>
          </section>` : html`
          <section class="card">
            <header class="card__head"><h3>Status artikel</h3><a class="link" href="#/articles">Kelola →</a></header>
            ${donut([{ label: 'Terbit', value: d.articles.published, tone: 'ok' }, { label: 'Terjadwal', value: d.articles.scheduled, tone: 'warn' }, { label: 'Draf', value: d.articles.drafts, tone: 'muted' }], { label: 'Status artikel' })}
          </section>`}
      </div>

      <div class="grid grid--3">
        <section class="card"><header class="card__head"><h3>Halaman teratas</h3></header>${barList(t.topPages.map((p) => ({ label: p.path, value: p.views })))}</section>
        <section class="card"><header class="card__head"><h3>Sumber trafik</h3></header>${barList(t.referrers.map((r) => ({ label: r.host || 'Langsung', value: r.views })))}</section>
        <section class="card"><header class="card__head"><h3>Perangkat</h3></header>
          ${donut(['desktop', 'mobile', 'tablet'].map((k) => ({ label: DEVICE_LABEL[k], value: t.devices.find((x) => x.device === k)?.views ?? 0, tone: DEVICE_TONE[k] })), { label: 'Perangkat', size: 120 })}</section>
      </div>

      <div class="grid grid--2">
        ${isAdmin ? html`
          <section class="card">
            <header class="card__head"><h3>Leads terbaru</h3><a class="link" href="#/leads">Semua →</a></header>
            ${L.recent.length ? html`<ul class="feed">${L.recent.map((lead) => html`
              <li><a href="#/leads/${lead.id}" class="feed__row">${avatar(lead.name)}<span class="feed__main"><b>${lead.name}</b><small>${lead.service || lead.email}</small></span>
                <span class="feed__side">${badge(LEAD_STATUS[lead.status]?.label, LEAD_STATUS[lead.status]?.tone)}<small>${fmtRelative(lead.createdAt)}</small></span></a></li>`)}</ul>`
              : html`<p class="muted small">Belum ada lead masuk.</p>`}
          </section>` : ''}
        <section class="card">
          <header class="card__head"><h3>Artikel terpopuler</h3><a class="link" href="#/articles">Artikel →</a></header>
          ${barList(d.articles.topViewed.map((a) => ({ label: a.title, value: a.views })), { empty: 'Belum ada data kunjungan artikel.' })}
        </section>
        <section class="card">
          <header class="card__head"><h3>Aktivitas tim</h3>${isAdmin ? html`<a class="link" href="#/audit">Log →</a>` : ''}</header>
          ${d.activity.length ? html`<ul class="timeline">${d.activity.map((a) => html`
            <li><span class="timeline__icon">${ic[ACTION_ICON[a.action] ?? 'sparkle']}</span><div><p><b>${a.userName ?? a.actor ?? 'Sistem'}</b> ${a.summary}</p><small>${fmtRelative(a.createdAt)}</small></div></li>`)}</ul>`
            : html`<p class="muted small">Belum ada aktivitas.</p>`}
        </section>
      </div>

      <section class="card quick">
        <h3>Aksi cepat</h3>
        <div class="quick__grid">
          ${isAdmin ? html`<a href="#/quotes/new" class="quick__item">${ic.quote}<span>Buat penawaran</span></a>` : ''}
          <a href="#/tasks?new=1" class="quick__item">${ic.todo}<span>Tugas baru</span></a>
          <a href="#/articles/new" class="quick__item">${ic.plus}<span>Tulis artikel</span></a>
          ${isAdmin ? html`<a href="#/appearance/home" class="quick__item">${ic.home}<span>Ubah beranda</span></a>
          <a href="#/appearance/site" class="quick__item">${ic.palette}<span>Tema & warna</span></a>` : ''}
          <a href="#/media" class="quick__item">${ic.upload}<span>Unggah media</span></a>
          <a href="#/content/portfolio" class="quick__item">${ic.portfolio}<span>Tambah portofolio</span></a>
        </div>
      </section>`);
    bindChartTooltip(ctx.root);
  }

  ctx.root.addEventListener('click', async (event) => {
    const range = event.target.closest('[data-days]');
    if (range) { days = Number(range.dataset.days); ctx.setQuery({ days: days === 30 ? '' : days }); load(); return; }
    if (event.target.closest('[data-retry]')) { load(); return; }
    if (event.target.closest('[data-refresh]')) { load({ silent: true }); return; }
    if (event.target.closest('[data-new-task]')) {
      if (await openTaskEditor({ user: ctx.user })) { load({ silent: true }); ctx.refreshBadges(); }
      return;
    }
    const toggle = event.target.closest('[data-toggle-task]');
    if (toggle) {
      toggle.closest('.todo')?.classList.add('is-done');
      toggle.setAttribute('aria-pressed', 'true');
      try { await toggleTask(Number(toggle.dataset.toggleTask), true); toast('Tugas selesai ✓'); ctx.refreshBadges(); setTimeout(() => load({ silent: true }), 400); } catch (error) { toast(errorMessage(error), 'danger'); load({ silent: true }); }
      return;
    }
    const row = event.target.closest('[data-task]');
    if (row && !event.target.closest('a')) ctx.navigate(`tasks/${row.dataset.task}`);
  });
  ctx.root.addEventListener('keydown', (event) => {
    const row = event.target.closest('[data-task]');
    if (row && event.key === 'Enter' && event.target === row) ctx.navigate(`tasks/${row.dataset.task}`);
  });
  await load();
  schedule();
  return { destroy() { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); } };
}
