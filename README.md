# TensuraLabs — Website & Admin Console

Website company profile TensuraLabs — software house & tech talent partner (Software Developer, Software Engineer,
DevOps Engineer, Programmer, LLM Engineer) dengan identitas visual *slime / gel* yang orisinal.
Semua ilustrasi, maskot, logo, dan nama konten dibuat khusus untuk proyek ini — **tanpa karakter, nama, atau aset
berhak cipta pihak ketiga**.

## Fitur

| Halaman | Rute | Keterangan |
|---|---|---|
| Beranda | `/` | Hero startup (headline, layanan, CTA konsultasi + portofolio, statistik), key visual parallax + gelembung, 4 badge kontak |
| Pengenalan Tim | `/squad?member=developer` | 5 role (Developer, Engineer, DevOps, Programmer, LLM Engineer), switcher avatar + swipe horizontal, panel STAT skill |
| Berita | `/news`, `/news/:slug` | Featured list + preview, tab kategori, grid kartu, paginasi, detail artikel (Markdown aman) |
| Galeri Portofolio | `/gallery` | Carousel melingkar (swipe/keyboard), strip thumbnail, modal detail proyek |
| Kabar Guild | `/world` | Koran “Tensura Observer” dengan rail 4 edisi + CTA konsultasi |
| Legal | `/legal#terms`, `/legal#privacy` | Ketentuan & privasi |
| Mail | `mail.tensuralabs.app` | Email sementara publik (alamat acak/kustom + kunci akses), kotak masuk tim, baca/balas/teruskan, lampiran, kode OTP sekali klik — via Cloudflare Email Routing |
| Admin Console | `/admin` | Dashboard analitik, CRM leads, CMS artikel/tim/portofolio/gazette, pustaka media, editor tampilan Beranda & situs dengan pratinjau langsung, pengguna, log aktivitas, sistem |

### Navigasi antar-section (scroll / swipe / keyboard)

Beranda → Squad → Berita → Galeri → Kabar Guild berperilaku seperti satu halaman panjang:

- **Scroll/swipe ke bawah** → transisi *liquid rise* + kartu judul section berikutnya (nomor `#0N / 05`, judul, sub-judul).
  **Scroll/swipe ke atas** → transisi *liquid fall* kembali ke section sebelumnya. Arah transisi ditentukan otomatis
  dari urutan section (`core/sections.js`), termasuk dari menu dan rail.
- Section dengan konten panjang (Berita, Kabar Guild) di-scroll dulu sampai ujung; setelah itu dorongan scroll
  berikutnya mengisi indikator cincin (*edge cue*) dan memicu pindah section — inersia trackpad tidak bisa
  “melompati” section. Kembali ke Berita dari bawah langsung mendarat di akhir daftar.
- Rail progres di kiri (desktop), tombol “Scroll ke …”, tombol `PageUp/PageDown/↑/↓/Space`, dan `prefers-reduced-motion`
  (fallback fade) didukung. Logika ada di `core/section-scroll.js`, `core/transitions.js`, `components/section-nav.js`.

Efek scroll: progress bar di atas, header *glass* yang memadat saat di-scroll, reveal bertahap per elemen,
transisi liquid yang lebih cepat (atau *slide* bila liquid dimatikan di admin).

Lainnya: bilingual **ID/EN** (`?lang=id|en`, tersimpan), ambient audio generatif (WebAudio, default mati),
modal konsultasi baru (nama, email, WhatsApp, perusahaan, layanan, budget, pesan; validasi inline + honeypot + rate-limit; bottom-sheet di mobile), halaman 404, `prefers-reduced-motion`, fokus/aksesibilitas keyboard.

## Admin Console (`/admin`)

| Menu | Fitur |
|---|---|
| Dashboard | KPI (kunjungan, pengunjung unik, leads, konversi) 7/30/90 hari, widget **Follow-up saya** (centang langsung), ringkasan penjualan (pipeline, deal, tingkat penerimaan, layanan terlaris), grafik tren, funnel lead, aktivitas tim, auto-refresh tiap menit |
| Tugas & Follow-up | Tugas dengan PIC, prioritas, tenggat (preset cepat), terkait lead; KPI klik-filter (terlambat / hari ini / milik saya), tambah cepat, grup per urgensi, pengingat otomatis jatuh tempo |
| Leads & CRM | Tabel + filter (status, prioritas, layanan, tanggal, pencarian), bulk action, ekspor CSV, papan **Kanban** drag & drop, drawer detail (status, prioritas, PIC, catatan internal, komentar, timeline, lead terkait, **tugas follow-up** & **penawaran** milik lead) |
| Penawaran | Nomor otomatis `TL-Q-YYYY-NNNN`, editor item dengan total live (diskon, PPN, IDR/USD), alur Draf → Terkirim → Diterima/Ditolak (lead otomatis pindah ke Proposal/Deal), duplikat, dokumen siap **cetak / PDF A4** |
| Artikel | Filter & bulk, duplikat, terjadwal (`scheduled`), featured, editor Markdown + toolbar + pratinjau split, cover dari pustaka media, pratinjau SERP, terjemahan ID/EN, pemulihan draf otomatis, `Ctrl+S` |
| Tim · Portofolio · Kabar Guild | CRUD, urutkan drag & drop, publish/sembunyikan, form bilingual |
| Media | Upload (drag & drop, png/jpg/webp/gif/svg), teks alt, salin URL, hapus |
| Halaman Beranda | Edit seluruh konten Beranda (hero, statistik, layanan, proses, FAQ, CTA, footer) per bahasa, urutkan blok, **pratinjau langsung** desktop/tablet/mobile sebelum disimpan, reset ke bawaan |
| Tema & Situs | Preset tema + warna aksen, animasi (liquid transition, gelembung ambient, parallax, reveal), aktif/nonaktif section, kontak, SEO, mode pemeliharaan |
| Pengguna | Kelola akun admin/editor, reset password, status & reset 2FA, nonaktifkan |
| Webhook & Integrasi | Kirim event (`lead.*`, `task.*`, `quote.*`) ke Slack/Zapier/n8n/CRM; ditandatangani HMAC-SHA256, retry otomatis, log pengiriman + payload, tes ping, rotasi secret, auto-nonaktif setelah 20 gagal, guard SSRF |
| Log Aktivitas | Audit trail semua perubahan (siapa, apa, kapan) |
| Sistem | Info server & database, unduh backup DB, tugas pemeliharaan (sesi kedaluwarsa, audit & analitik lama, media yatim, optimasi DB) |
| Profil | Ubah profil & password, **autentikasi dua langkah (TOTP)** dengan QR + 10 kode pemulihan, kelola sesi aktif |

Fitur umum: **notifikasi in-app** (lead baru, penugasan, tugas jatuh tempo, penawaran diterima/ditolak), command palette `Ctrl+K` (navigasi + cari lead/artikel/tugas/penawaran), tema terang/gelap, proteksi perubahan belum
disimpan, responsif penuh (sidebar off-canvas di mobile). Role `admin` = semua fitur; `editor` = artikel, konten & media.

## Mail — `mail.tensuralabs.app` (V5)

Layanan email berbasis **Cloudflare Email Routing** (terinspirasi *cloudflare_temp_email*), terintegrasi penuh dengan
Admin Console, notifikasi, webhook, dan CRM.

```
Pengirim ──SMTP──▶ Cloudflare Email Routing (catch-all) ──▶ Worker tensuralabs-mail
                     └─ POST /api/mail/inbound (MIME mentah + HMAC) ──▶ server ──▶ SQLite (mail_*)
Server ──POST /send (HMAC)──▶ Worker ──send_email──▶ penerima      (atau MAIL_PROVIDER=resend)
```

**Aplikasi Mail (publik, host `MAIL_HOSTNAME`):** buat alamat acak/kustom di domain yang diizinkan, kunci akses
ditampilkan **sekali** (salin/unduh), masuk kembali dengan alamat + kunci, beberapa kotak dalam satu perangkat,
folder Masuk/Terkirim/Berbintang, pencarian, aksi massal, pembaca HTML ter-*sandbox* (gambar eksternal diblokir
default, CSP ketat), tampilan teks, lampiran, unduh `.eml`, chip kode OTP, tulis/balas/teruskan (bila diizinkan),
auto-refresh, ganti kunci (perangkat lain dikeluarkan), hapus alamat. Responsif (drawer + FAB di ponsel), ID/EN.

**Admin → Mail:** ringkasan (KPI, grafik lalu lintas, status integrasi, pengirim teratas, log penerimaan),
kotak masuk semua alamat (filter, baca, balas/teruskan, bintang, **jadikan lead**), alamat tim dengan PIC
(notifikasi email masuk ke PIC), aktif/nonaktif/perpanjang/ganti kunci, pengaturan kebijakan (domain, nama
dicadangkan, masa berlaku & retensi, batas ukuran/lampiran, kuota kirim, pengirim diblokir), panduan integrasi +
**email uji** end-to-end. Event webhook baru: `mail.received`, `mail.sent`. Pembersihan otomatis tiap jam
(alamat kedaluwarsa & email lewat retensi; email berbintang disimpan).

**Keamanan:** inbound wajib HMAC-SHA256 (`X-Tensura-Signature: v1=<hex>` atas `"v1:<ts>:inbound:<from>:<to>\n" + body`,
toleransi 5 menit) — respons 4xx = tolak permanen, 5xx = Cloudflare mencoba ulang; kunci akses acak 100-bit hanya disimpan sebagai HMAC-SHA256 (kunci dari `SESSION_SECRET`),
sesi mailbox berupa token ter-hash dengan cookie `HttpOnly`/`SameSite=Lax` khusus host mail (API tetap dijaga guard Origin + JSON); rate-limit per IP
untuk pembuatan, login & kirim; Turnstile opsional; honeypot; deduplikasi Message-ID; HTML email disajikan dari
endpoint terpisah dengan CSP `sandbox` tanpa script.

### Setup produksi

1. **DNS:** record `mail` (A/CNAME, *proxied*) ke server ini, set `MAIL_HOSTNAME=mail.tensuralabs.app`.
2. **Secret:** `MAIL_WORKER_SECRET=$(openssl rand -hex 32)` di `.env` server.
3. **Worker:** `cd cloudflare/mail-worker && npm i && npx wrangler deploy && npx wrangler secret put MAIL_WORKER_SECRET`
   (atur `INBOUND_URL` & `MAIL_DOMAINS` di `wrangler.toml`). Detail: `cloudflare/mail-worker/README.md`.
4. **Email Routing:** aktifkan untuk tiap domain di `MAIL_DOMAINS` → *Routing rules* → *Catch-all* → *Send to a Worker* → `tensuralabs-mail`.
5. **Kirim keluar (opsional):** `MAIL_PROVIDER=cloudflare` + `MAIL_WORKER_URL=https://tensuralabs-mail.<akun>.workers.dev`
   (Cloudflare `send_email` hanya mengirim ke *destination address* terverifikasi) atau `MAIL_PROVIDER=resend` + `RESEND_API_KEY`,
   lalu aktifkan di Admin → Mail → Pengaturan.
6. Cek Admin → Mail → **Integrasi** → *Kirim email uji*.

Pengembangan lokal: buka `http://mail.localhost:3000` (host mail default di luar produksi).

API (host mail): `GET /api/mail/config`, `GET /api/mail/session`, `POST /api/mail/addresses`, `POST /api/mail/login`,
`POST /api/mail/logout`, `/api/mail/mailboxes/:id` (`DELETE`, `/session`, `/rotate-key`, `/poll`, `/messages` + `bulk`,
`read-all`, `:mid`, `:mid/html`, `:mid/raw`, `:mid/attachments/:aid`, `/send`); inbound `POST /api/mail/inbound`;
admin `/api/admin/mail/*` (`overview`, `meta`, `unread`, `inbound-log`, `settings`, `addresses` + `bulk`/`rotate-key`,
`messages` + `bulk`/`html`/`raw`/`attachments`/`lead`, `send`, `test-inbound`).

## Teknologi

- **Backend:** Node.js ≥ 22.13 (disarankan 24), Express 5, Zod, Helmet (CSP ketat), compression, express-rate-limit
- **Database:** SQLite bawaan Node (`node:sqlite`), WAL, migrasi berversi (`PRAGMA user_version`)
- **Frontend:** Vanilla ES Modules tanpa build step (router History API, komponen modular, CSS design tokens)
- **Tes:** `node:test` (integrasi API end-to-end)

## Menjalankan

```bash
npm install
cp .env.example .env          # isi SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm start                     # http://localhost:3000  ·  admin: http://localhost:3000/admin
```

Mode pengembangan (auto-reload): `npm run dev` · Tes: `npm test`

Membuat/reset akun admin atau editor kapan saja:

```bash
npm run create-admin -- --email you@domain.com --name "Nama Anda" [--role editor]
```

Role: `admin` (semua fitur) · `editor` (konten: artikel, tim, portofolio, gazette, media).

## Docker

```bash
docker build -t tensuralabs .
docker run -d -p 3000:3000 -v tensuralabs-data:/app/data \
  -e SESSION_SECRET="$(openssl rand -base64 48)" \
  -e ADMIN_EMAIL=admin@domain.com -e ADMIN_PASSWORD='ganti-password-kuat' \
  -e TRUST_PROXY=1 tensuralabs
```

Produksi: jalankan di belakang reverse proxy HTTPS (Nginx/Caddy/Cloudflare), set `TRUST_PROXY=1`,
backup file `data/tensuralabs.db` secara berkala. Cookie sesi otomatis `Secure` saat `NODE_ENV=production`.

## Struktur

```
server/
  app.js, index.js, config.js
  db/            koneksi, migrasi, seed konten (ID/EN)
  lib/           crypto (scrypt), errors, validate, logger, slug
  middleware/    security (CSP, CSRF origin guard), auth (session + role), errors
  modules/       mail (inbound · public · admin · transport · mime)
                 content · articles · leads · auth · admin · settings · analytics · media
                 users · audit · dashboard · system  (routes + repository + schema)
public/
  index.html, admin.html, mail.html
  assets/css     base (tokens), chrome (header/menu/modal), home-squad, content, admin
  assets/js      core (router, transitions, liquid, sections, section-scroll, i18n, api, audio, markdown, dom)
                 components (header, section-nav, modal, consult-modal, icons, states) · pages/*
                 admin/ (main, api, ui, form builder, charts, media-picker, views/*)
  assets/img     ilustrasi orisinal, cover berita, portofolio
cloudflare/mail-worker/   Email Worker (Email Routing → server, POST /send → send_email)
scripts/create-admin.js
tests/*.test.js
```

## API ringkas

Publik: `GET /api/health`, `/api/site`, `/api/home`, `/api/squad?lang`, `/api/portfolio?lang`, `/api/gazette?lang`,
`/api/articles?lang&category&page&pageSize`, `/api/articles/:slug?lang`, `POST /api/leads`, `POST /api/track`
(analitik tanpa cookie, menghormati DNT/GPC), `GET /uploads/*`.
Probe: `GET /api/ready` (cek DB, untuk readiness probe). Semua respons membawa header `X-Request-Id`.
Auth: `POST /api/auth/login` (→ `{ mfaRequired, challenge }` bila 2FA aktif), `POST /api/auth/mfa`, `POST /api/auth/logout`, `GET /api/auth/session`, `GET /api/auth/me`.
Admin (`/api/admin/...`): `dashboard`, `leads` (+ `meta`, `board`, `export.csv`, `bulk`, `:id/comments`),
`articles` (+ `bulk`, `:id/duplicate`), `content/:collection` (+ `reorder`), `settings/:key` (+ `defaults`), `media`,
`users` (+ `:id/password`, `:id/2fa/reset`), `profile` (+ `password`, `sessions`, `2fa/*`), `tasks` (+ `summary`, `meta`, `bulk`),
`quotes` (+ `:id/status`, `:id/duplicate`), `notifications` (+ `count`, `read`), `webhooks` (+ `:id/test`, `:id/rotate-secret`,
`:id/deliveries`), `audit`, `system` (+ `backup`, `maintenance`).

## Keamanan

Password di-hash `scrypt` + perbandingan constant-time; token sesi disimpan sebagai hash; cookie `HttpOnly`,
`SameSite=Strict`; CSP `self` tanpa inline script/style; guard CSRF (Origin + wajib JSON); rate-limit login & form;
honeypot anti-bot; IP disimpan sebagai HMAC; ekspor CSV aman dari formula injection; validasi semua input dengan Zod;
SQL selalu berparameter.

**V4:** 2FA TOTP (RFC 6238, anti-replay) dengan secret terenkripsi AES-256-GCM (kunci diturunkan dari `SESSION_SECRET`)
dan kode pemulihan sekali pakai (di-hash); penguncian akun 5× gagal / 15 menit; secret webhook terenkripsi saat disimpan
dan hanya ditampilkan sekali; tujuan webhook divalidasi terhadap jaringan privat (anti-SSRF). Lupa perangkat 2FA:
`npm run create-admin -- --email you@domain.com --name "Nama" --reset-2fa` (juga membuka kunci login).

### Verifikasi webhook

Header `X-Tensura-Signature: t=<unix>,v1=<hex>` dengan `v1 = HMAC_SHA256(secret, "<t>.<raw body>")`. Tolak jika selisih
`t` > 5 menit; bandingkan dengan `timingSafeEqual`. Contoh kode lengkap tersedia di menu *Webhook & Integrasi*.
Status 408/429/5xx dan galat jaringan dicoba ulang (2 dtk, 15 dtk).

### Job terjadwal

Server menjalankan scheduler ringan di dalam proses: pengingat tugas jatuh tempo (notifikasi), pembersihan sesi &
challenge MFA kedaluwarsa, serta pembersihan harian log/notifikasi lama. Event diproses asinkron dan dikuras saat
shutdown (SIGTERM) agar tidak ada webhook yang hilang.

### Performa animasi Beranda (V4)

Efek scroll tidak lagi membaca layout per frame (geometri di-cache via `ResizeObserver`, elemen aktif via
`IntersectionObserver`), parallax di-*lerp* dan rAF berhenti saat diam, tidak ada animasi `filter`/`blur` pada elemen
besar (diganti overlay opacity yang dikomposit GPU), `backdrop-filter` dimatikan di perangkat sentuh, kanvas gelembung &
liquid memakai sprite pra-render, fisika berbasis delta-time (sama mulus di 60/120 Hz) dan kualitas adaptif untuk
perangkat low-end.

## Kustomisasi konten

Konten awal ada di `server/db/seed-data.js` (role tim, portofolio, gazette, artikel). Artikel dapat dikelola
lewat `/admin` dan hanya di-seed bila tabel kosong. Role tim, portofolio, dan gazette kini bisa dikelola di admin;
selama belum diedit admin, menaikkan `STATIC_CONTENT_VERSION` tetap menyinkronkan konten bawaan saat server start.

**Upgrade dari V1:** cukup jalankan server versi baru — migrasi v2 otomatis membuat tabel `app_meta`, memetakan
path gambar lama di artikel ke aset baru, mengganti judul artikel bawaan lama, dan menyinkronkan role/portofolio/gazette.
Artikel yang sudah diedit admin dan gambar upload sendiri tidak disentuh. Ganti ilustrasi di `public/assets/img/` dengan nama file yang sama, dan link kontak lewat variabel `CONTACT_*`.

**Upgrade ke V3:** jalankan server versi baru — migrasi v3 berjalan otomatis (tabel settings, analitik, media, audit,
komentar/aktivitas lead, kolom baru artikel & konten). Status lead `closed` lama dipetakan ke `won`; field `platform`
pada form konsultasi diganti `service`/`budget`/`company`. File upload disimpan di `data/uploads` (ubah via `UPLOAD_DIR`) —
ikut ter-backup bila volume `/app/data` di-mount.

## Changelog — V4.1 (UI stability & polish)

- **Home:** fixed hero layout shift — the rotating word now reserves the width of the longest word (single grid cell) and auto-fits, so the title, lead, CTAs, stats and cards never move. Rotation pauses offscreen / hidden tab and is disabled for reduced motion. Compact hero on short desktop screens; footer contact column no longer breaks e-mail mid-word on mobile; hero image preloaded only on `/`.
- **Squad:** viewport-safe sizing unit (`--su`) for short/wide screens, tablet layout, rewritten mobile dock (info sheet + STAT toggle + skills panel), accessible tablist (roving tabindex, Home/End), correct wrap-around slide direction, single-line auto-fit titles.
- **News:** accessible category tabs (arrow keys), `aria-busy` + reserved height while loading (no jump), shared pure `core/pagination.js` with "…" gaps (unit tested in `tests/ui.test.js`), tablet 2-column grid, reduced-motion support.
- **Guild / World:** image preloading before switching issues, active issue kept in view in the rail, deep links via `?issue=N`, empty state (ID/EN), aligned mobile rail with scroll-snap and focus styles.

## Changelog — V5.0 (Mail)

- **Mail di `mail.tensuralabs.app`:** aplikasi email sementara + kotak masuk tim berbasis Cloudflare Email Routing, Worker siap deploy (`cloudflare/mail-worker`), parser MIME (multipart, quoted-printable/base64, charset, RFC 2047, lampiran inline/CID).
- **Admin → Mail:** ringkasan & grafik, kotak masuk terpadu, alamat tim + PIC, pengaturan kebijakan, panduan integrasi + email uji, konversi email → lead, badge belum dibaca, perintah cepat.
- **Integrasi:** notifikasi `mail` ke PIC, webhook `mail.received`/`mail.sent`, kartu Mail di Dashboard, statistik & pemeliharaan di Sistem, ikon Mail di header situs.
- **Database:** migrasi v5 (`mail_addresses`, `mail_messages`, `mail_attachments`, `mail_sessions`, `mail_session_addresses`, `mail_inbound_log`) — otomatis saat start.

