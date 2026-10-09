/**
 * Default values for admin-editable site settings. The admin console stores overrides in the
 * `settings` table; anything missing falls back to these values (deep merge), so new settings
 * shipped in a release appear automatically without a data migration.
 */
export const SERVICE_ICONS = Object.freeze(['code', 'layers', 'cloud', 'brain', 'bolt', 'shield', 'mobile', 'chart', 'database', 'users']);

export function defaultSiteSettings(contact = {}) {
  return {
    brand: { name: 'TensuraLabs', legalName: 'PT Tensura Labs Indonesia', foundedYear: 2026 },
    theme: { accent: '#5ea8ff', accent2: '#b59bff', highlight: '#e8d7ab', surface: '#0a0c1e' },
    motion: { liquidTransitions: true, ambientBubbles: true, parallax: true, smoothReveal: true },
    contact: {
      email: contact.email ?? 'hello@tensuralabs.id',
      phone: '+62 812-3456-7890',
      address: 'Jakarta, Indonesia',
      whatsapp: contact.whatsapp ?? 'https://wa.me/6281234567890',
      github: contact.github ?? 'https://github.com/tensuralabs',
      linkedin: contact.linkedin ?? 'https://www.linkedin.com/company/tensuralabs',
      instagram: contact.instagram ?? 'https://www.instagram.com/tensuralabs',
      x: contact.x ?? 'https://x.com/tensuralabs',
    },
    seo: {
      ogImage: '/assets/img/key-visual.jpg',
      id: {
        title: 'TensuraLabs — Jasa Software Developer, Engineer, DevOps & LLM',
        description: 'TensuraLabs menyediakan Software Developer, Software Engineer, DevOps Engineer, LLM Fine-Tuning Engineer, dan Programmer untuk membangun aplikasi dan sistem informasi berkualitas produksi.',
      },
      en: {
        title: 'TensuraLabs — Software Developer, Engineer, DevOps & LLM Services',
        description: 'TensuraLabs provides Software Developers, Software Engineers, DevOps Engineers, LLM Fine-Tuning Engineers, and Programmers to build production-grade applications and information systems.',
      },
    },
    announcement: {
      enabled: true,
      href: '/news/tensuralabs-resmi-diluncurkan',
      id: { label: 'BARU', text: 'TensuraLabs resmi diluncurkan — slot proyek Q4 dibuka' },
      en: { label: 'NEW', text: 'TensuraLabs is live — Q4 project slots are open' },
    },
    sections: { squad: true, news: true, gallery: true, world: true },
    homeBlocks: { clients: true, services: true, process: true, metrics: true, testimonials: true, faq: true, cta: true },
    maintenance: {
      enabled: false,
      id: { title: 'Sedang dalam pemeliharaan', text: 'Kami sedang meningkatkan layanan. Silakan kembali beberapa saat lagi.' },
      en: { title: 'Under maintenance', text: 'We are upgrading our services. Please check back shortly.' },
    },
  };
}

export function defaultHomeSettings() {
  return {
    id: {
      hero: {
        eyebrow: 'Software House & Mitra Talenta Teknologi',
        titleLead: 'Kami membangun',
        rotating: ['aplikasi web', 'aplikasi mobile', 'sistem informasi', 'platform AI', 'infrastruktur cloud'],
        titleTail: 'yang siap produksi.',
        lead: 'Tim developer, engineer, DevOps, LLM engineer, dan programmer yang merancang, membangun, dan merawat produk digital Anda — dari MVP hingga skala enterprise.',
        primaryCta: 'Konsultasi Gratis',
        secondaryCta: 'Lihat Portofolio',
        secondaryHref: '/gallery',
        trust: 'Dipercaya startup, UMKM, dan instansi di 6 kota',
      },
      stats: [
        { value: '60+', label: 'Proyek terkirim' },
        { value: '99.95%', label: 'Rata-rata uptime' },
        { value: '24 jam', label: 'Waktu respons' },
        { value: '98%', label: 'Klien kembali' },
      ],
      clients: {
        title: 'Teknologi yang kami kuasai di produksi',
        items: ['TypeScript', 'React', 'Next.js', 'Node.js', 'Go', 'Python', 'Kotlin', 'PostgreSQL', 'Redis', 'Kubernetes', 'Terraform', 'AWS', 'PyTorch', 'LangChain'],
      },
      services: {
        kicker: 'Layanan',
        title: 'Satu tim, seluruh siklus produk.',
        subtitle: 'Pilih layanan satuan atau bentuk dedicated team — kami menyesuaikan diri dengan tahap dan anggaran bisnis Anda.',
        items: [
          { icon: 'code', title: 'Pengembangan Web & Mobile', text: 'Aplikasi web, PWA, Android, dan iOS dengan UI yang cepat, aksesibel, dan mudah dirawat.', tags: ['React', 'Next.js', 'Kotlin', 'Flutter'] },
          { icon: 'layers', title: 'Arsitektur & Software Engineering', text: 'Desain sistem, skema basis data, API yang stabil, dan keamanan sejak hari pertama.', tags: ['System Design', 'PostgreSQL', 'Go'] },
          { icon: 'cloud', title: 'DevOps & Cloud', text: 'CI/CD, container, Infrastructure as Code, monitoring 24/7, dan optimasi biaya cloud.', tags: ['Kubernetes', 'Terraform', 'AWS'] },
          { icon: 'brain', title: 'LLM Fine-Tuning & AI', text: 'Fine-tuning model, RAG, evaluasi, dan integrasi asisten AI ke produk serta kanal Anda.', tags: ['PyTorch', 'RAG', 'LoRA'] },
          { icon: 'bolt', title: 'Integrasi & Otomasi', text: 'Hubungkan sistem, payment gateway, dan bot Telegram/WhatsApp untuk menghapus kerja manual.', tags: ['Python', 'Webhook', 'ETL'] },
          { icon: 'users', title: 'Dedicated Team', text: 'Perkuat tim internal Anda dengan talenta senior yang siap bekerja dalam ritme sprint Anda.', tags: ['Staff Aug', 'Scrum'] },
        ],
      },
      process: {
        kicker: 'Proses',
        title: 'Dari ide ke produksi, tanpa kejutan.',
        subtitle: 'Metodologi yang diasah dari puluhan proyek: transparan, terukur, dan dapat diprediksi.',
        steps: [
          { title: 'Discovery', text: 'Workshop kebutuhan, pemetaan alur bisnis, dan definisi metrik keberhasilan.', duration: '1–2 minggu' },
          { title: 'Arsitektur & Desain', text: 'Desain sistem, prototipe UI/UX interaktif, dan estimasi biaya yang transparan.', duration: '1–3 minggu' },
          { title: 'Sprint Pengembangan', text: 'Sprint dua mingguan, demo setiap akhir sprint, dan laporan progres mingguan.', duration: '4–16 minggu' },
          { title: 'Rilis & Perawatan', text: 'QA otomatis, audit keamanan, CI/CD, monitoring 24/7, dan garansi bug 90 hari.', duration: 'Berkelanjutan' },
        ],
      },
      metrics: {
        kicker: 'Kenapa TensuraLabs',
        title: 'Standar engineering yang bisa Anda ukur.',
        items: [
          { value: '80%+', label: 'Test coverage minimum di setiap repositori' },
          { value: '2 minggu', label: 'Siklus sprint dengan demo yang bisa Anda coba' },
          { value: '90 hari', label: 'Garansi perbaikan bug setelah rilis' },
          { value: '100%', label: 'Kode & repositori menjadi milik Anda' },
        ],
      },
      testimonials: {
        kicker: 'Testimoni',
        title: 'Apa kata klien kami.',
        items: [
          { quote: 'Tim TensuraLabs memindahkan seluruh sistem kami ke Kubernetes tanpa downtime. Tagihan cloud turun 38% di bulan pertama.', name: 'Rina Hartono', role: 'CTO, Logistik Nusantara' },
          { quote: 'MVP kami rilis dalam 8 minggu dengan kualitas yang melampaui ekspektasi investor. Komunikasinya jelas setiap minggu.', name: 'Dimas Pratama', role: 'Founder, Kopiloka' },
          { quote: 'Asisten AI hasil fine-tuning mereka menjawab 70% pertanyaan pelanggan secara otomatis. Tim CS kami kini fokus ke kasus penting.', name: 'Sarah Wijaya', role: 'Head of CX, Klinikita' },
        ],
      },
      faq: {
        kicker: 'Tanya Jawab',
        title: 'Pertanyaan yang sering diajukan.',
        items: [
          { q: 'Berapa lama proyek biasanya berjalan?', a: 'MVP umumnya 6–10 minggu; sistem informasi skala menengah 3–6 bulan. Estimasi pasti kami berikan setelah sesi discovery.' },
          { q: 'Bagaimana skema biayanya?', a: 'Tersedia fixed price per proyek untuk ruang lingkup yang jelas, atau dedicated team bulanan untuk pengembangan berkelanjutan.' },
          { q: 'Apakah bisa melanjutkan proyek yang sudah ada?', a: 'Bisa. Kami memulai dengan audit kode dan infrastruktur, lalu menyusun rencana perbaikan bertahap yang realistis.' },
          { q: 'Bagaimana keamanan data dan kerahasiaan proyek?', a: 'Kami menandatangani NDA, menerapkan least privilege, enkripsi data, dan tidak pernah menyimpan kredensial di repositori.' },
        ],
      },
      cta: {
        title: 'Siap membangun produk berikutnya?',
        text: 'Ceritakan kebutuhan Anda. Konsultasi awal 60 menit gratis, proposal teknis dalam 5 hari kerja.',
        button: 'Jadwalkan Konsultasi',
      },
    },
    en: {
      hero: {
        eyebrow: 'Software House & Tech Talent Partner',
        titleLead: 'We build',
        rotating: ['web apps', 'mobile apps', 'information systems', 'AI platforms', 'cloud infrastructure'],
        titleTail: 'that are production-ready.',
        lead: 'A team of developers, engineers, DevOps, LLM engineers, and programmers who design, build, and run your digital products — from MVP to enterprise scale.',
        primaryCta: 'Free Consultation',
        secondaryCta: 'View Portfolio',
        secondaryHref: '/gallery',
        trust: 'Trusted by startups, SMEs, and public institutions in 6 cities',
      },
      stats: [
        { value: '60+', label: 'Projects shipped' },
        { value: '99.95%', label: 'Average uptime' },
        { value: '24h', label: 'Response time' },
        { value: '98%', label: 'Returning clients' },
      ],
      clients: {
        title: 'Technology we run in production',
        items: ['TypeScript', 'React', 'Next.js', 'Node.js', 'Go', 'Python', 'Kotlin', 'PostgreSQL', 'Redis', 'Kubernetes', 'Terraform', 'AWS', 'PyTorch', 'LangChain'],
      },
      services: {
        kicker: 'Services',
        title: 'One team, the whole product lifecycle.',
        subtitle: 'Pick a single service or a dedicated team — we adapt to your stage and budget.',
        items: [
          { icon: 'code', title: 'Web & Mobile Development', text: 'Web apps, PWAs, Android, and iOS with fast, accessible, maintainable interfaces.', tags: ['React', 'Next.js', 'Kotlin', 'Flutter'] },
          { icon: 'layers', title: 'Architecture & Software Engineering', text: 'System design, database schemas, stable APIs, and security from day one.', tags: ['System Design', 'PostgreSQL', 'Go'] },
          { icon: 'cloud', title: 'DevOps & Cloud', text: 'CI/CD, containers, Infrastructure as Code, 24/7 monitoring, and cloud cost optimisation.', tags: ['Kubernetes', 'Terraform', 'AWS'] },
          { icon: 'brain', title: 'LLM Fine-Tuning & AI', text: 'Model fine-tuning, RAG, evaluation, and AI assistants integrated into your product and channels.', tags: ['PyTorch', 'RAG', 'LoRA'] },
          { icon: 'bolt', title: 'Integration & Automation', text: 'Connect systems, payment gateways, and Telegram/WhatsApp bots to remove manual work.', tags: ['Python', 'Webhook', 'ETL'] },
          { icon: 'users', title: 'Dedicated Team', text: 'Extend your in-house team with senior talent that works in your sprint rhythm.', tags: ['Staff Aug', 'Scrum'] },
        ],
      },
      process: {
        kicker: 'Process',
        title: 'From idea to production, without surprises.',
        subtitle: 'A methodology sharpened over dozens of projects: transparent, measurable, predictable.',
        steps: [
          { title: 'Discovery', text: 'Requirement workshops, business flow mapping, and success metrics.', duration: '1–2 weeks' },
          { title: 'Architecture & Design', text: 'System design, interactive UI/UX prototypes, and transparent cost estimates.', duration: '1–3 weeks' },
          { title: 'Development Sprints', text: 'Two-week sprints, a demo at the end of every sprint, and weekly progress reports.', duration: '4–16 weeks' },
          { title: 'Release & Care', text: 'Automated QA, security audits, CI/CD, 24/7 monitoring, and a 90-day bug warranty.', duration: 'Ongoing' },
        ],
      },
      metrics: {
        kicker: 'Why TensuraLabs',
        title: 'Engineering standards you can measure.',
        items: [
          { value: '80%+', label: 'Minimum test coverage in every repository' },
          { value: '2 weeks', label: 'Sprint cycle with a demo you can try' },
          { value: '90 days', label: 'Bug-fix warranty after release' },
          { value: '100%', label: 'Code & repositories owned by you' },
        ],
      },
      testimonials: {
        kicker: 'Testimonials',
        title: 'What our clients say.',
        items: [
          { quote: 'TensuraLabs moved our entire platform to Kubernetes with zero downtime. Our cloud bill dropped 38% in the first month.', name: 'Rina Hartono', role: 'CTO, Logistik Nusantara' },
          { quote: 'Our MVP shipped in 8 weeks with quality beyond our investors\' expectations. Communication was clear every week.', name: 'Dimas Pratama', role: 'Founder, Kopiloka' },
          { quote: 'Their fine-tuned AI assistant answers 70% of customer questions automatically. Our CS team now focuses on what matters.', name: 'Sarah Wijaya', role: 'Head of CX, Klinikita' },
        ],
      },
      faq: {
        kicker: 'FAQ',
        title: 'Frequently asked questions.',
        items: [
          { q: 'How long does a project usually take?', a: 'MVPs usually take 6–10 weeks; mid-sized information systems 3–6 months. We give a firm estimate after discovery.' },
          { q: 'How is pricing structured?', a: 'Fixed price per project for a clear scope, or a monthly dedicated team for continuous development.' },
          { q: 'Can you continue an existing project?', a: 'Yes. We start with a code and infrastructure audit, then plan realistic incremental improvements.' },
          { q: 'How do you handle data security and confidentiality?', a: 'We sign NDAs, apply least privilege, encrypt data, and never store credentials in repositories.' },
        ],
      },
      cta: {
        title: 'Ready to build your next product?',
        text: 'Tell us what you need. The first 60-minute consultation is free, with a technical proposal within 5 business days.',
        button: 'Book a Consultation',
      },
    },
  };
}
