/** Bahasa Indonesia / English strings and formatting helpers for TensuraLabs Mail. */
const STORAGE_KEY = 'tl-mail-lang';

const STRINGS = {
  id: {
    'app.name': 'TensuraLabs Mail',
    'app.tagline': 'Email sementara yang instan & privat',
    'app.backToSite': 'Ke situs TensuraLabs',
    'lang.switch': 'English',
    'lang.label': 'Bahasa',
    'hero.kicker': 'Guild Mailroom',
    'hero.title': 'Alamat email sekali pakai, siap dalam satu klik.',
    'hero.text': 'Terima email verifikasi, lampiran, dan newsletter tanpa membagikan alamat pribadi. Tanpa pendaftaran — akses dilindungi kunci rahasia.',
    'hero.f1.title': 'Instan & tanpa daftar', 'hero.f1.text': 'Alamat acak atau nama pilihan Anda di domain resmi TensuraLabs.',
    'hero.f2.title': 'Privat secara default', 'hero.f2.text': 'Gambar pelacak diblokir, konten email diisolasi, kunci akses tidak pernah disimpan dalam bentuk asli.',
    'hero.f3.title': 'Kedaluwarsa otomatis', 'hero.f3.text': 'Alamat dan email dihapus otomatis sesuai masa berlaku — tanpa jejak.',
    'tab.create': 'Buat alamat', 'tab.login': 'Masuk dengan kunci',
    'create.name': 'Nama alamat', 'create.namePlaceholder': 'kosongkan untuk nama acak', 'create.domain': 'Domain',
    'create.hint': '{min}–{max} karakter: huruf kecil, angka, titik, minus, garis bawah.',
    'create.hintRandom': 'Nama dibuat acak oleh sistem.',
    'create.random': 'Nama acak', 'create.submit': 'Buat alamat', 'create.disabled': 'Pembuatan alamat baru sedang dinonaktifkan oleh administrator. Anda tetap dapat masuk ke alamat yang sudah ada.',
    'create.ttl': 'Berlaku {ttl} · email disimpan {days}', 'create.ttlForever': 'tanpa batas waktu',
    'login.address': 'Alamat email', 'login.key': 'Kunci akses', 'login.keyPlaceholder': 'XXXXX-XXXXX-XXXXX-XXXXX', 'login.submit': 'Masuk',
    'login.hint': 'Kunci akses diberikan saat alamat dibuat. Tanpa kunci, alamat tidak dapat dibuka dari perangkat lain.',
    'key.title': 'Simpan kunci akses Anda', 'key.text': 'Kunci ini hanya ditampilkan sekali. Gunakan untuk membuka alamat ini dari perangkat lain atau setelah cookie dihapus.',
    'key.address': 'Alamat', 'key.key': 'Kunci akses', 'key.download': 'Unduh .txt', 'key.copyAll': 'Salin semua', 'key.done': 'Saya sudah menyimpannya',
    'key.rotatedTitle': 'Kunci akses baru', 'key.rotatedText': 'Kunci lama sudah tidak berlaku. {count} perangkat lain telah dikeluarkan.',
    'key.fileIntro': 'TensuraLabs Mail — kunci akses', 'key.fileWarn': 'Jaga kerahasiaan kunci ini. Siapa pun yang memilikinya dapat membaca kotak masuk Anda.',
    'nav.compose': 'Tulis email', 'nav.inbox': 'Kotak masuk', 'nav.sent': 'Terkirim', 'nav.starred': 'Berbintang',
    'nav.mailboxes': 'Alamat di perangkat ini', 'nav.add': 'Tambah alamat', 'nav.signOutAll': 'Keluar dari semua alamat', 'nav.open': 'Buka navigasi',
    'box.copy': 'Salin alamat', 'box.copied': 'Alamat disalin', 'box.rotate': 'Ganti kunci akses', 'box.forget': 'Lupakan dari perangkat ini', 'box.delete': 'Hapus alamat permanen',
    'box.expiresIn': 'Kedaluwarsa dalam {time}', 'box.expired': 'Kedaluwarsa', 'box.noExpiry': 'Tanpa masa berlaku', 'box.team': 'Alamat tim', 'box.inactive': 'Dinonaktifkan',
    'box.receiveOnly': 'Hanya menerima', 'box.switch': 'Ganti alamat', 'box.unread': '{count} belum dibaca',
    'box.expiredBanner': 'Alamat ini sudah kedaluwarsa dan tidak lagi menerima email. Lupakan alamat ini atau buat alamat baru.',
    'box.inactiveBanner': 'Alamat ini dinonaktifkan oleh administrator.',
    'list.search': 'Cari pengirim, subjek, isi…', 'list.refresh': 'Muat ulang', 'list.readAll': 'Tandai semua dibaca', 'list.selectAll': 'Pilih semua',
    'list.selected': '{count} dipilih', 'list.markRead': 'Tandai dibaca', 'list.markUnread': 'Tandai belum dibaca', 'list.star': 'Beri bintang', 'list.unstar': 'Hapus bintang', 'list.delete': 'Hapus',
    'list.emptyInbox': 'Kotak masuk masih kosong', 'list.emptyInboxText': 'Email ke {address} akan muncul di sini secara otomatis.',
    'list.emptySent': 'Belum ada email terkirim', 'list.emptyStarred': 'Belum ada email berbintang', 'list.emptySearch': 'Tidak ada email yang cocok dengan "{q}"',
    'list.waiting': 'Menunggu email masuk', 'list.noSubject': '(tanpa subjek)', 'list.to': 'Ke: {to}', 'list.page': 'Halaman {page} dari {pages}', 'list.prev': 'Sebelumnya', 'list.next': 'Berikutnya',
    'read.empty': 'Pilih email untuk dibaca', 'read.emptyText': 'Email dibuka dalam mode aman: skrip dimatikan dan gambar eksternal diblokir.',
    'read.back': 'Kembali', 'read.reply': 'Balas', 'read.forward': 'Teruskan', 'read.star': 'Bintang', 'read.unread': 'Belum dibaca', 'read.delete': 'Hapus', 'read.source': 'Unduh .eml',
    'read.from': 'Dari', 'read.to': 'Kepada', 'read.cc': 'Cc', 'read.date': 'Tanggal', 'read.replyTo': 'Balas ke',
    'read.remote': 'Gambar & konten eksternal diblokir untuk melindungi privasi Anda.', 'read.remoteShow': 'Tampilkan gambar', 'read.remoteHide': 'Blokir lagi',
    'read.viewHtml': 'Tampilan HTML', 'read.viewText': 'Teks biasa', 'read.attachments': '{count} lampiran', 'read.copyCode': 'Salin kode {code}', 'read.codeCopied': 'Kode {code} disalin',
    'read.sentBy': 'Dikirim melalui {provider}', 'read.auth': 'Autentikasi', 'read.noBody': '(Email ini tidak memiliki isi)',
    'compose.title': 'Tulis email', 'compose.reply': 'Balas', 'compose.forward': 'Teruskan', 'compose.from': 'Dari', 'compose.to': 'Kepada', 'compose.cc': 'Cc', 'compose.addCc': 'Tambah Cc',
    'compose.subject': 'Subjek', 'compose.body': 'Tulis pesan…', 'compose.attach': 'Lampirkan file', 'compose.send': 'Kirim', 'compose.sending': 'Mengirim…', 'compose.sent': 'Email terkirim',
    'compose.toHint': 'Pisahkan beberapa alamat dengan koma.', 'compose.limit': 'Maks. 5 lampiran, total 7 MB.', 'compose.tooLarge': 'Total lampiran melebihi 7 MB', 'compose.tooMany': 'Maksimal 5 lampiran',
    'compose.discard': 'Buang draf?', 'compose.discardText': 'Pesan yang belum dikirim akan hilang.', 'compose.discardOk': 'Buang', 'compose.quota': 'Kuota harian: {quota} email', 'compose.forwardHeader': '---------- Pesan diteruskan ----------',
    'compose.wrote': 'Pada {date}, {from} menulis:', 'compose.removeFile': 'Hapus lampiran',
    'confirm.cancel': 'Batal', 'confirm.forget': 'Lupakan alamat ini?', 'confirm.forgetText': '{address} akan dihapus dari perangkat ini. Anda masih bisa membukanya lagi dengan kunci akses.',
    'confirm.forgetOk': 'Lupakan', 'confirm.delete': 'Hapus alamat permanen?', 'confirm.deleteText': '{address} beserta semua emailnya akan dihapus selamanya dan tidak dapat dipulihkan.',
    'confirm.deleteOk': 'Hapus permanen', 'confirm.rotate': 'Ganti kunci akses?', 'confirm.rotateText': 'Kunci lama langsung tidak berlaku dan perangkat lain yang membuka {address} akan dikeluarkan.', 'confirm.rotateOk': 'Ganti kunci',
    'confirm.deleteMsg': 'Hapus email ini?', 'confirm.deleteMsgText': 'Email akan dihapus permanen.', 'confirm.deleteMany': 'Hapus {count} email?', 'confirm.signOut': 'Keluar dari semua alamat?',
    'confirm.signOutText': 'Semua alamat akan dilupakan dari perangkat ini. Pastikan Anda menyimpan kunci aksesnya.', 'confirm.signOutOk': 'Keluar',
    'toast.newMail': 'Email baru dari {from}', 'toast.newMailMany': '{count} email baru', 'toast.deleted': 'Email dihapus', 'toast.forgotten': 'Alamat dilupakan', 'toast.removed': 'Alamat dihapus',
    'toast.updated': 'Diperbarui', 'toast.copied': 'Disalin ke papan klip', 'toast.copyFail': 'Gagal menyalin', 'toast.created': 'Alamat {address} siap digunakan', 'toast.loggedIn': 'Berhasil masuk ke {address}',
    'toast.offline': 'Koneksi terputus — mencoba lagi…', 'toast.back': 'Koneksi pulih', 'toast.signedOut': 'Anda telah keluar',
    'common.close': 'Tutup', 'common.loading': 'Memuat…', 'common.retry': 'Coba lagi', 'common.error': 'Terjadi kesalahan', 'common.unknownSender': 'Pengirim tidak dikenal',
    'common.me': 'saya', 'common.turnstile': 'Verifikasi keamanan', 'common.turnstileNeeded': 'Selesaikan verifikasi keamanan terlebih dahulu',
    'footer.privacy': 'Email dihapus otomatis · jangan gunakan untuk akun penting', 'footer.powered': 'Didukung Cloudflare Email Routing',
    'time.now': 'baru saja', 'time.m': '{n} mnt', 'time.h': '{n} j', 'time.d': '{n} hr',
    'dur.d': '{n} hari', 'dur.h': '{n} jam', 'dur.m': '{n} menit',
  },
  en: {
    'app.name': 'TensuraLabs Mail',
    'app.tagline': 'Instant, private temporary email',
    'app.backToSite': 'To TensuraLabs site',
    'lang.switch': 'Bahasa Indonesia',
    'lang.label': 'Language',
    'hero.kicker': 'Guild Mailroom',
    'hero.title': 'Disposable email addresses, ready in one click.',
    'hero.text': 'Receive verification emails, attachments, and newsletters without sharing your personal address. No sign-up — access is protected by a secret key.',
    'hero.f1.title': 'Instant, no sign-up', 'hero.f1.text': 'A random address or a name you choose on official TensuraLabs domains.',
    'hero.f2.title': 'Private by default', 'hero.f2.text': 'Tracking pixels are blocked, email content is isolated, and access keys are never stored in plain text.',
    'hero.f3.title': 'Self-destructing', 'hero.f3.text': 'Addresses and messages are deleted automatically when they expire — no trace left.',
    'tab.create': 'Create address', 'tab.login': 'Sign in with key',
    'create.name': 'Address name', 'create.namePlaceholder': 'leave empty for a random name', 'create.domain': 'Domain',
    'create.hint': '{min}–{max} characters: lowercase letters, digits, dot, dash, underscore.',
    'create.hintRandom': 'The name is generated randomly.',
    'create.random': 'Random name', 'create.submit': 'Create address', 'create.disabled': 'Creating new addresses is currently disabled by the administrator. You can still sign in to existing addresses.',
    'create.ttl': 'Valid for {ttl} · messages kept {days}', 'create.ttlForever': 'indefinitely',
    'login.address': 'Email address', 'login.key': 'Access key', 'login.keyPlaceholder': 'XXXXX-XXXXX-XXXXX-XXXXX', 'login.submit': 'Sign in',
    'login.hint': 'The access key is shown when the address is created. Without it the address cannot be opened on another device.',
    'key.title': 'Save your access key', 'key.text': 'This key is shown only once. Use it to open this address on another device or after clearing cookies.',
    'key.address': 'Address', 'key.key': 'Access key', 'key.download': 'Download .txt', 'key.copyAll': 'Copy all', 'key.done': 'I have saved it',
    'key.rotatedTitle': 'New access key', 'key.rotatedText': 'The old key no longer works. {count} other device(s) have been signed out.',
    'key.fileIntro': 'TensuraLabs Mail — access key', 'key.fileWarn': 'Keep this key secret. Anyone who has it can read your inbox.',
    'nav.compose': 'Compose', 'nav.inbox': 'Inbox', 'nav.sent': 'Sent', 'nav.starred': 'Starred',
    'nav.mailboxes': 'Addresses on this device', 'nav.add': 'Add address', 'nav.signOutAll': 'Sign out of all addresses', 'nav.open': 'Open navigation',
    'box.copy': 'Copy address', 'box.copied': 'Address copied', 'box.rotate': 'Rotate access key', 'box.forget': 'Forget on this device', 'box.delete': 'Delete address permanently',
    'box.expiresIn': 'Expires in {time}', 'box.expired': 'Expired', 'box.noExpiry': 'No expiry', 'box.team': 'Team address', 'box.inactive': 'Disabled',
    'box.receiveOnly': 'Receive only', 'box.switch': 'Switch address', 'box.unread': '{count} unread',
    'box.expiredBanner': 'This address has expired and no longer receives email. Forget it or create a new address.',
    'box.inactiveBanner': 'This address has been disabled by the administrator.',
    'list.search': 'Search sender, subject, body…', 'list.refresh': 'Refresh', 'list.readAll': 'Mark all as read', 'list.selectAll': 'Select all',
    'list.selected': '{count} selected', 'list.markRead': 'Mark as read', 'list.markUnread': 'Mark as unread', 'list.star': 'Star', 'list.unstar': 'Unstar', 'list.delete': 'Delete',
    'list.emptyInbox': 'Your inbox is empty', 'list.emptyInboxText': 'Email sent to {address} will appear here automatically.',
    'list.emptySent': 'No sent email yet', 'list.emptyStarred': 'No starred email yet', 'list.emptySearch': 'No email matches "{q}"',
    'list.waiting': 'Waiting for incoming email', 'list.noSubject': '(no subject)', 'list.to': 'To: {to}', 'list.page': 'Page {page} of {pages}', 'list.prev': 'Previous', 'list.next': 'Next',
    'read.empty': 'Select an email to read', 'read.emptyText': 'Email opens in safe mode: scripts are disabled and external images are blocked.',
    'read.back': 'Back', 'read.reply': 'Reply', 'read.forward': 'Forward', 'read.star': 'Star', 'read.unread': 'Unread', 'read.delete': 'Delete', 'read.source': 'Download .eml',
    'read.from': 'From', 'read.to': 'To', 'read.cc': 'Cc', 'read.date': 'Date', 'read.replyTo': 'Reply-To',
    'read.remote': 'External images & content are blocked to protect your privacy.', 'read.remoteShow': 'Show images', 'read.remoteHide': 'Block again',
    'read.viewHtml': 'HTML view', 'read.viewText': 'Plain text', 'read.attachments': '{count} attachment(s)', 'read.copyCode': 'Copy code {code}', 'read.codeCopied': 'Code {code} copied',
    'read.sentBy': 'Sent via {provider}', 'read.auth': 'Authentication', 'read.noBody': '(This email has no content)',
    'compose.title': 'New email', 'compose.reply': 'Reply', 'compose.forward': 'Forward', 'compose.from': 'From', 'compose.to': 'To', 'compose.cc': 'Cc', 'compose.addCc': 'Add Cc',
    'compose.subject': 'Subject', 'compose.body': 'Write your message…', 'compose.attach': 'Attach files', 'compose.send': 'Send', 'compose.sending': 'Sending…', 'compose.sent': 'Email sent',
    'compose.toHint': 'Separate multiple addresses with commas.', 'compose.limit': 'Max 5 attachments, 7 MB total.', 'compose.tooLarge': 'Attachments exceed 7 MB in total', 'compose.tooMany': 'At most 5 attachments',
    'compose.discard': 'Discard draft?', 'compose.discardText': 'Your unsent message will be lost.', 'compose.discardOk': 'Discard', 'compose.quota': 'Daily quota: {quota} emails', 'compose.forwardHeader': '---------- Forwarded message ----------',
    'compose.wrote': 'On {date}, {from} wrote:', 'compose.removeFile': 'Remove attachment',
    'confirm.cancel': 'Cancel', 'confirm.forget': 'Forget this address?', 'confirm.forgetText': '{address} will be removed from this device. You can open it again with its access key.',
    'confirm.forgetOk': 'Forget', 'confirm.delete': 'Delete address permanently?', 'confirm.deleteText': '{address} and all of its email will be deleted forever and cannot be recovered.',
    'confirm.deleteOk': 'Delete permanently', 'confirm.rotate': 'Rotate access key?', 'confirm.rotateText': 'The old key stops working immediately and other devices that opened {address} will be signed out.', 'confirm.rotateOk': 'Rotate key',
    'confirm.deleteMsg': 'Delete this email?', 'confirm.deleteMsgText': 'The email will be deleted permanently.', 'confirm.deleteMany': 'Delete {count} emails?', 'confirm.signOut': 'Sign out of all addresses?',
    'confirm.signOutText': 'All addresses will be forgotten on this device. Make sure you have saved their access keys.', 'confirm.signOutOk': 'Sign out',
    'toast.newMail': 'New email from {from}', 'toast.newMailMany': '{count} new emails', 'toast.deleted': 'Email deleted', 'toast.forgotten': 'Address forgotten', 'toast.removed': 'Address deleted',
    'toast.updated': 'Updated', 'toast.copied': 'Copied to clipboard', 'toast.copyFail': 'Copy failed', 'toast.created': '{address} is ready to use', 'toast.loggedIn': 'Signed in to {address}',
    'toast.offline': 'Connection lost — retrying…', 'toast.back': 'Back online', 'toast.signedOut': 'You have signed out',
    'common.close': 'Close', 'common.loading': 'Loading…', 'common.retry': 'Try again', 'common.error': 'Something went wrong', 'common.unknownSender': 'Unknown sender',
    'common.me': 'me', 'common.turnstile': 'Security check', 'common.turnstileNeeded': 'Please complete the security check first',
    'footer.privacy': 'Email is deleted automatically · do not use for important accounts', 'footer.powered': 'Powered by Cloudflare Email Routing',
    'time.now': 'just now', 'time.m': '{n}m', 'time.h': '{n}h', 'time.d': '{n}d',
    'dur.d': '{n} days', 'dur.h': '{n} hours', 'dur.m': '{n} minutes',
  },
};

function detect() {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (fromUrl in STRINGS) return fromUrl;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored in STRINGS) return stored;
  } catch { /* storage unavailable */ }
  return (navigator.language || 'id').toLowerCase().startsWith('id') ? 'id' : 'en';
}

let current = detect();
document.documentElement.lang = current;

export const getLang = () => current;
export const locale = () => (current === 'id' ? 'id-ID' : 'en-US');

export function setLang(lang) {
  if (!(lang in STRINGS)) return;
  current = lang;
  document.documentElement.lang = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* storage unavailable */ }
}

export function t(key, params = {}) {
  const template = STRINGS[current][key] ?? STRINGS.id[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => (params[name] ?? `{${name}}`));
}

/** "2 j 14 mnt" style countdown until `iso`. */
export function fmtCountdown(iso, now = Date.now()) {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return '';
  const minutes = Math.max(1, Math.round(ms / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts = [];
  if (days) parts.push(t('time.d', { n: days }));
  if (hours) parts.push(t('time.h', { n: hours }));
  if (!days && mins) parts.push(t('time.m', { n: mins }));
  return parts.join(' ');
}

/** Duration in hours → "3 hari" / "12 jam". */
export function fmtHours(hours) {
  if (!hours) return t('create.ttlForever');
  return hours % 24 === 0 ? t('dur.d', { n: hours / 24 }) : t('dur.h', { n: hours });
}

/** Compact list timestamp: time today, day+month this year, full date otherwise. */
export function fmtListDate(iso) {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  if (date.getFullYear() === now.getFullYear()) return date.toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  return date.toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
}

export const fmtDateTime = (iso) => new Date(iso).toLocaleString(locale(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function fmtRelative(iso, now = Date.now()) {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return t('time.now');
  if (seconds < 3600) return t('time.m', { n: Math.round(seconds / 60) });
  if (seconds < 86400) return t('time.h', { n: Math.round(seconds / 3600) });
  return t('time.d', { n: Math.round(seconds / 86400) });
}

export function fmtBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
