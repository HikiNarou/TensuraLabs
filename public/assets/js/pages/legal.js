import { html, render } from '../core/dom.js';
import { getLang, t } from '../core/i18n.js';
import { icons } from '../components/icons.js';

const CONTENT = {
  id: {
    terms: ['Ketentuan Layanan', [
      'Dengan mengirimkan formulir konsultasi, Anda menyatakan bahwa data yang diberikan benar dan Anda berwenang mewakili organisasi terkait.',
      'Konsultasi awal bersifat gratis dan tidak mengikat. Ruang lingkup, biaya, dan jadwal proyek hanya berlaku setelah tertuang dalam perjanjian tertulis.',
      'Seluruh kode sumber hasil proyek menjadi milik klien setelah kewajiban pembayaran diselesaikan, kecuali disepakati lain.',
      'TensuraLabs berhak menolak permintaan yang melanggar hukum, etika, atau kebijakan kami.',
    ]],
    privacy: ['Kebijakan Privasi', [
      'Kami hanya mengumpulkan email, pilihan platform, preferensi bahasa, dan persetujuan pemasaran yang Anda berikan secara sukarela.',
      'Alamat IP tidak disimpan dalam bentuk asli; kami hanya menyimpan sidik jari kriptografis (HMAC) untuk mencegah penyalahgunaan.',
      'Data digunakan semata-mata untuk menghubungi Anda terkait konsultasi dan, jika Anda menyetujui, untuk mengirimkan informasi promosi.',
      'Anda dapat meminta akses, koreksi, atau penghapusan data kapan saja dengan menghubungi hello@tensuralabs.id. Kami tidak menjual data kepada pihak ketiga.',
    ]],
  },
  en: {
    terms: ['Terms of Service', [
      'By submitting the consultation form, you confirm that the data provided is accurate and that you are authorised to represent the related organisation.',
      'The initial consultation is free and non-binding. Project scope, pricing, and timelines apply only once set out in a written agreement.',
      'All source code produced in a project belongs to the client once payment obligations are fulfilled, unless agreed otherwise.',
      'TensuraLabs may decline requests that violate the law, ethics, or our policies.',
    ]],
    privacy: ['Privacy Policy', [
      'We only collect the email, platform choice, language preference, and marketing consent that you voluntarily provide.',
      'IP addresses are never stored in raw form; we keep only a cryptographic fingerprint (HMAC) to prevent abuse.',
      'Data is used solely to contact you about the consultation and, if you consent, to send promotional information.',
      'You may request access, correction, or deletion of your data at any time by contacting hello@tensuralabs.id. We never sell data to third parties.',
    ]],
  },
};

export function createPage() {
  const el = document.createElement('section');
  el.className = 'page page-article paper-bg';
  el.tabIndex = -1;
  const copy = CONTENT[getLang()];
  render(el, html`
    <div class="article-scroll" data-scroll>
      <a class="article-close" href="/" aria-label="${t('notFound.back')}">${icons.crossed}</a>
      <article class="article">
        <header class="article__header"><h1 class="article__title">${t('legal.title')}</h1></header>
        <div class="article__body prose">
          ${['terms', 'privacy'].map((key) => html`
            <h2 id="${key}">${copy[key][0]}</h2>
            <ol>${copy[key][1].map((item) => html`<li>${item}</li>`)}</ol>`)}
        </div>
      </article>
    </div>`);

  return {
    el,
    title: `${t('legal.title')} — TensuraLabs`,
    enter() {
      el.classList.add('is-entered');
      const hash = location.hash.slice(1);
      if (hash) el.querySelector(`#${CSS.escape(hash)}`)?.scrollIntoView({ block: 'start' });
    },
    leave() { el.classList.remove('is-entered'); },
    destroy() {},
  };
}
