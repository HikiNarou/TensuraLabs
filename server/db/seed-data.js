/* Initial content for TensuraLabs. All copy and artwork referenced here is original. */

/**
 * Bump whenever SQUAD_ROLES, PORTFOLIO_ITEMS, or GAZETTE_ISSUES change. These tables are not
 * editable from the admin console, so boot re-syncs them from this file when the version differs.
 */
export const STATIC_CONTENT_VERSION = 2;

export const SQUAD_ROLES = [
  {
    key: 'developer',
    portrait: '/assets/img/squad/role-developer.webp',
    avatar: '/assets/img/squad/role-developer-avatar.jpg',
    accent: '#5b6cff',
    content: {
      id: {
        title: 'DEVELOPER',
        tag: 'Web & Mobile Apps',
        quote: '"Ide tanpa eksekusi hanyalah mimpi. Kirim spesifikasinya, saya kirim produknya."',
        description: [
          'Software Developer TensuraLabs merancang dan membangun aplikasi web serta mobile dari nol hingga siap rilis. Teliti, cepat beradaptasi, dan selalu menulis kode yang mudah dirawat.',
          'Menguasai frontend modern dan API backend, ia mengubah wireframe menjadi antarmuka yang halus, responsif, dan dapat diakses di semua perangkat.',
          'Setiap baris kode ditinjau, diuji, dan didokumentasikan—karena kualitas bukan fitur tambahan, melainkan standar.',
        ],
        skills: [['React / Vue', 95], ['Node.js', 90], ['Kotlin & Swift', 80], ['UI Engineering', 92]],
      },
      en: {
        title: 'DEVELOPER',
        tag: 'Web & Mobile Apps',
        quote: '"An idea without execution is just a dream. Send me the spec, I\'ll ship the product."',
        description: [
          'TensuraLabs Software Developers design and build web and mobile applications from scratch to release. Meticulous, adaptable, and always writing maintainable code.',
          'Fluent in modern frontends and backend APIs, they turn wireframes into smooth, responsive, accessible interfaces on every device.',
          'Every line is reviewed, tested, and documented—because quality is not an add-on, it is the baseline.',
        ],
        skills: [['React / Vue', 95], ['Node.js', 90], ['Kotlin & Swift', 80], ['UI Engineering', 92]],
      },
    },
  },
  {
    key: 'engineer',
    portrait: '/assets/img/squad/role-engineer.webp',
    avatar: '/assets/img/squad/role-engineer-avatar.jpg',
    accent: '#c9a65a',
    content: {
      id: {
        title: 'ENGINEER',
        tag: 'Arsitektur & Keamanan Sistem',
        quote: '"Sistem yang baik tidak terlihat. Ia hanya bekerja—hari ini, besok, dan saat trafik melonjak sepuluh kali lipat."',
        description: [
          'Software Engineer TensuraLabs memikul tanggung jawab atas arsitektur: pemodelan domain, desain basis data, keamanan, dan skalabilitas.',
          'Ia memecah masalah bisnis yang rumit menjadi layanan yang jelas batasnya, dengan kontrak API yang stabil dan pengujian otomatis yang menyeluruh.',
          'Dari kriptografi hingga antrean pesan, setiap keputusan teknis dicatat sebagai ADR agar tim dan klien memahami alasannya.',
        ],
        skills: [['System Design', 96], ['PostgreSQL', 90], ['Security', 88], ['Go / Java', 85]],
      },
      en: {
        title: 'ENGINEER',
        tag: 'Architecture & Security',
        quote: '"Good systems are invisible. They simply work—today, tomorrow, and when traffic spikes tenfold."',
        description: [
          'TensuraLabs Software Engineers own the architecture: domain modelling, database design, security, and scalability.',
          'They break complex business problems into well-bounded services with stable API contracts and thorough automated tests.',
          'From cryptography to message queues, every technical decision is recorded as an ADR so the team and the client understand why.',
        ],
        skills: [['System Design', 96], ['PostgreSQL', 90], ['Security', 88], ['Go / Java', 85]],
      },
    },
  },
  {
    key: 'devops',
    portrait: '/assets/img/squad/role-devops.webp',
    avatar: '/assets/img/squad/role-devops-avatar.jpg',
    accent: '#ff7a59',
    content: {
      id: {
        title: 'DEVOPS',
        tag: 'Cloud, CI/CD & Observability',
        quote: '"Kalau deploy masih bikin deg-degan, berarti pipeline-nya belum selesai."',
        description: [
          'DevOps Engineer TensuraLabs membangun fondasi tempat aplikasi hidup: infrastruktur sebagai kode, CI/CD, container, dan observabilitas.',
          'Ia memastikan setiap rilis berjalan otomatis, dapat diulang, dan dapat dikembalikan dalam hitungan detik bila terjadi masalah.',
          'Monitoring, alerting, backup, dan hardening server adalah rutinitas hariannya—agar sistem klien tetap menyala 24/7.',
        ],
        skills: [['Kubernetes', 90], ['Terraform', 88], ['CI/CD', 95], ['Linux & Cloud', 93]],
      },
      en: {
        title: 'DEVOPS',
        tag: 'Cloud, CI/CD & Observability',
        quote: '"If deploying still makes you nervous, the pipeline isn\'t finished yet."',
        description: [
          'TensuraLabs DevOps Engineers build the ground applications live on: infrastructure as code, CI/CD, containers, and observability.',
          'They make every release automated, repeatable, and reversible within seconds if something goes wrong.',
          'Monitoring, alerting, backups, and server hardening are daily rituals—keeping client systems up 24/7.',
        ],
        skills: [['Kubernetes', 90], ['Terraform', 88], ['CI/CD', 95], ['Linux & Cloud', 93]],
      },
    },
  },
  {
    key: 'programmer',
    portrait: '/assets/img/squad/role-programmer.webp',
    avatar: '/assets/img/squad/role-programmer-avatar.jpg',
    accent: '#3fd1c7',
    content: {
      id: {
        title: 'PROGRAMMER',
        tag: 'Integrasi, Otomasi & Algoritma',
        quote: '"Bug itu seperti slime: kecil, lucu, lalu tiba-tiba membelah diri. Lebih baik ditangkap sejak awal."',
        description: [
          'Programmer TensuraLabs adalah spesialis implementasi: algoritma, integrasi pihak ketiga, otomasi, dan skrip yang membuat pekerjaan manual menghilang.',
          'Tenang di bawah tekanan, ia menelusuri bug paling licin hingga akarnya dan menuliskan tes regresi agar tidak pernah kembali.',
          'Dari bot Telegram hingga pipeline data, ia menyelesaikan detail kecil yang menentukan kualitas besar.',
        ],
        skills: [['Python', 94], ['TypeScript', 90], ['Algorithms', 89], ['Automation', 92]],
      },
      en: {
        title: 'PROGRAMMER',
        tag: 'Integration, Automation & Algorithms',
        quote: '"Bugs are like slimes: small, cute, and then suddenly they split. Better catch them early."',
        description: [
          'TensuraLabs Programmers are implementation specialists: algorithms, third-party integrations, automation, and scripts that make manual work disappear.',
          'Calm under pressure, they trace the slipperiest bugs to the root and write regression tests so they never return.',
          'From Telegram bots to data pipelines, they nail the small details that define great quality.',
        ],
        skills: [['Python', 94], ['TypeScript', 90], ['Algorithms', 89], ['Automation', 92]],
      },
    },
  },
  {
    key: 'llm',
    portrait: '/assets/img/squad/role-llm.webp',
    avatar: '/assets/img/squad/role-llm-avatar.jpg',
    accent: '#c86bff',
    content: {
      id: {
        title: 'LLM ENGINEER',
        tag: 'Fine-Tuning, RAG & Evaluasi',
        quote: '"Model yang hebat lahir dari data yang jujur dan evaluasi yang tidak kenal kompromi."',
        description: [
          'LLM Fine-Tuning Engineer TensuraLabs menyesuaikan model bahasa besar dengan domain bisnis Anda: kurasi dataset, fine-tuning (LoRA/QLoRA), dan alignment berbasis preferensi.',
          'Ia membangun pipeline RAG dengan vector database, guardrail keamanan, serta evaluasi otomatis agar jawaban model akurat, konsisten, dan dapat diaudit.',
          'Dari prototipe hingga serving produksi yang hemat GPU, setiap eksperimen tercatat sehingga hasilnya dapat direproduksi.',
        ],
        skills: [['Fine-Tuning (LoRA)', 93], ['RAG & Vector DB', 91], ['Evaluasi Model', 89], ['Python & PyTorch', 94]],
      },
      en: {
        title: 'LLM ENGINEER',
        tag: 'Fine-Tuning, RAG & Evaluation',
        quote: '"Great models come from honest data and uncompromising evaluation."',
        description: [
          'TensuraLabs LLM Fine-Tuning Engineers adapt large language models to your business domain: dataset curation, fine-tuning (LoRA/QLoRA), and preference-based alignment.',
          'They build RAG pipelines with vector databases, safety guardrails, and automated evaluations so answers stay accurate, consistent, and auditable.',
          'From prototype to GPU-efficient production serving, every experiment is tracked so results are reproducible.',
        ],
        skills: [['Fine-Tuning (LoRA)', 93], ['RAG & Vector DB', 91], ['Model Evaluation', 89], ['Python & PyTorch', 94]],
      },
    },
  },
];

export const PORTFOLIO_ITEMS = [
  {
    slug: 'slimepay-commerce', thumbnail: '/assets/img/portfolio/commerce-platform.jpg', projectDate: '2026-07-02',
    stack: ['Next.js', 'NestJS', 'PostgreSQL', 'Redis'], projectUrl: null, videoUrl: null,
    content: {
      id: { title: 'TensuraLabs丨SlimePay — Platform E-Commerce Multi-Vendor', label: 'E-COMMERCE PLATFORM', summary: 'Marketplace multi-vendor dengan checkout satu halaman, pembayaran QRIS & virtual account, serta dasbor penjual real-time. Menangani 40 ribu transaksi per hari tanpa downtime.' },
      en: { title: 'TensuraLabs丨SlimePay — Multi-Vendor Commerce Platform', label: 'E-COMMERCE PLATFORM', summary: 'Multi-vendor marketplace with one-page checkout, QRIS & virtual account payments, and a real-time seller dashboard. Handles 40k daily transactions with zero downtime.' },
    },
  },
  {
    slug: 'lumen-analytics', thumbnail: '/assets/img/portfolio/analytics-dashboard.jpg', projectDate: '2026-06-26',
    stack: ['Python', 'FastAPI', 'ClickHouse', 'Vue'], projectUrl: null, videoUrl: null,
    content: {
      id: { title: 'TensuraLabs丨Lumen Analytics — Dasbor Business Intelligence', label: 'DATA ANALYTICS', summary: 'Pipeline data dan dasbor BI untuk jaringan ritel 120 cabang. Laporan yang dulu butuh dua hari kini tersedia dalam hitungan detik.' },
      en: { title: 'TensuraLabs丨Lumen Analytics — Business Intelligence Dashboard', label: 'DATA ANALYTICS', summary: 'Data pipeline and BI dashboard for a 120-branch retail chain. Reports that once took two days are now ready in seconds.' },
    },
  },
  {
    slug: 'civic-mobile', thumbnail: '/assets/img/portfolio/civic-mobile.jpg', projectDate: '2025-12-19',
    stack: ['Kotlin Multiplatform', 'SwiftUI', 'Ktor'], projectUrl: null, videoUrl: null,
    content: {
      id: { title: 'TensuraLabs丨Civic Mobile — Aplikasi Layanan Publik', label: 'MOBILE APP', summary: 'Aplikasi Android & iOS berbagi logika bisnis dengan Kotlin Multiplatform, mendukung mode offline dan notifikasi real-time untuk 200 ribu pengguna.' },
      en: { title: 'TensuraLabs丨Civic Mobile — Public Service App', label: 'MOBILE APP', summary: 'Android & iOS apps sharing business logic through Kotlin Multiplatform, with offline mode and real-time notifications for 200k users.' },
    },
  },
  {
    slug: 'nimbus-cloud-migration', thumbnail: '/assets/img/portfolio/cloud-migration.jpg', projectDate: '2025-05-13',
    stack: ['Kubernetes', 'Terraform', 'ArgoCD', 'Grafana'], projectUrl: null, videoUrl: null,
    content: {
      id: { title: 'TensuraLabs丨Nimbus Cloud — Migrasi Infrastruktur ke Kubernetes', label: 'DEVOPS & CLOUD', summary: 'Migrasi 34 layanan monolit ke Kubernetes dengan GitOps. Biaya infrastruktur turun 38% dan waktu deploy dari 2 jam menjadi 6 menit.' },
      en: { title: 'TensuraLabs丨Nimbus Cloud — Kubernetes Infrastructure Migration', label: 'DEVOPS & CLOUD', summary: 'Migrated 34 monolith services to Kubernetes with GitOps. Infrastructure cost down 38% and deploy time from 2 hours to 6 minutes.' },
    },
  },
  {
    slug: 'helix-ai-assistant', thumbnail: '/assets/img/portfolio/ai-assistant.jpg', projectDate: '2025-03-04',
    stack: ['TypeScript', 'Fine-tuned LLM', 'Telegram Bot API', 'pgvector'], projectUrl: null, videoUrl: null,
    content: {
      id: { title: 'TensuraLabs丨Helix — Asisten AI untuk Customer Service', label: 'AI ASSISTANT', summary: 'Asisten AI berbasis RAG dengan model hasil fine-tuning, terhubung ke WhatsApp dan Telegram, menjawab 70% pertanyaan pelanggan secara otomatis dengan eskalasi ke agen manusia.' },
      en: { title: 'TensuraLabs丨Helix — AI Customer Service Assistant', label: 'AI ASSISTANT', summary: 'RAG-based AI assistant on a fine-tuned model, connected to WhatsApp and Telegram, resolving 70% of customer questions automatically with human escalation.' },
    },
  },
];

export const GAZETTE_ISSUES = [
  {
    key: 'observer', image: '/assets/img/banner-network.jpg',
    content: {
      id: {
        label: 'Tensura Observer', masthead: 'TENSURA OBSERVER', section: 'EDISI PERDANA',
        headline: 'TENSURALABS MEMBUKA GERBANGNYA',
        deck: 'Startup perangkat lunak asal Indonesia menghadirkan developer, engineer, DevOps, LLM engineer, dan programmer dalam satu tim.',
        columns: [
          'TensuraLabs lahir dari keyakinan sederhana: setiap bisnis berhak memiliki perangkat lunak yang andal tanpa harus membangun tim teknologi dari nol. Kami menyediakan talenta Software Developer, Software Engineer, DevOps Engineer, LLM Fine-Tuning Engineer, dan Programmer yang bekerja sebagai satu kesatuan.',
          'Seperti slime yang dapat beradaptasi dengan bentuk apa pun, tim kami menyesuaikan diri dengan kebutuhan klien—mulai dari MVP startup, sistem informasi instansi, hingga modernisasi infrastruktur perusahaan besar.',
          'Kami bekerja secara transparan: repositori dimiliki klien, progres dilaporkan setiap minggu, dan setiap rilis melewati review kode serta pengujian otomatis.',
        ],
        sidebarTitle: 'DALAM ANGKA',
        sidebar: ['60+ proyek selesai', '98% klien kembali', 'Uptime rata-rata 99,95%', 'Tim tersebar di 6 kota'],
      },
      en: {
        label: 'Tensura Observer', masthead: 'TENSURA OBSERVER', section: 'FIRST EDITION',
        headline: 'TENSURALABS OPENS ITS GATES',
        deck: 'An Indonesian software startup brings developers, engineers, DevOps, LLM engineers, and programmers together in one team.',
        columns: [
          'TensuraLabs was born from a simple belief: every business deserves reliable software without building a technology team from scratch. We provide Software Developers, Software Engineers, DevOps Engineers, LLM Fine-Tuning Engineers, and Programmers who work as one unit.',
          'Like a slime that adapts to any shape, our team adapts to each client—from startup MVPs and institutional information systems to enterprise infrastructure modernisation.',
          'We work transparently: the client owns the repository, progress is reported weekly, and every release passes code review and automated testing.',
        ],
        sidebarTitle: 'BY THE NUMBERS',
        sidebar: ['60+ projects delivered', '98% returning clients', '99.95% average uptime', 'Team across 6 cities'],
      },
    },
  },
  {
    key: 'process', image: '/assets/img/banner-office.jpg',
    content: {
      id: {
        label: 'Seni Mengirim Produk', masthead: 'SENI MENGIRIM PRODUK', section: 'PROSES KERJA',
        headline: 'DARI IDE KE PRODUKSI DALAM ENAM LANGKAH',
        deck: 'Metodologi yang kami asah dari puluhan proyek: jelas, terukur, dan tanpa kejutan.',
        columns: [
          '1. Discovery — workshop kebutuhan, pemetaan alur bisnis, dan definisi metrik keberhasilan. 2. Arsitektur — desain sistem, skema basis data, dan estimasi biaya yang transparan.',
          '3. Desain UI/UX — wireframe dan prototipe interaktif yang divalidasi bersama pengguna. 4. Pengembangan — sprint dua mingguan dengan demo di setiap akhir sprint.',
          '5. QA & Keamanan — pengujian otomatis, uji beban, dan audit keamanan. 6. Rilis & Perawatan — CI/CD, monitoring 24/7, dan SLA dukungan pasca-rilis.',
        ],
        sidebarTitle: 'JANJI KAMI',
        sidebar: ['Kode milik Anda', 'Laporan mingguan', 'Garansi bug 90 hari', 'Dokumentasi lengkap'],
      },
      en: {
        label: 'The Art of Shipping', masthead: 'THE ART OF SHIPPING', section: 'HOW WE WORK',
        headline: 'FROM IDEA TO PRODUCTION IN SIX STEPS',
        deck: 'A methodology sharpened over dozens of projects: clear, measurable, and free of surprises.',
        columns: [
          '1. Discovery — requirement workshops, business flow mapping, and success metrics. 2. Architecture — system design, database schema, and transparent cost estimates.',
          '3. UI/UX Design — wireframes and interactive prototypes validated with real users. 4. Development — two-week sprints with a demo at the end of every sprint.',
          '5. QA & Security — automated tests, load testing, and security audits. 6. Release & Care — CI/CD, 24/7 monitoring, and a post-launch support SLA.',
        ],
        sidebarTitle: 'OUR PROMISE',
        sidebar: ['You own the code', 'Weekly reports', '90-day bug warranty', 'Complete documentation'],
      },
    },
  },
  {
    key: 'stack', image: '/assets/img/key-visual.jpg',
    content: {
      id: {
        label: 'Tensura dalam Lensa', masthead: 'TENSURA DALAM LENSA', section: 'TEKNOLOGI',
        headline: 'TEKNOLOGI YANG KAMI PERCAYA',
        deck: 'Teknologi yang kami pilih bukan karena tren, tetapi karena terbukti di produksi.',
        columns: [
          'Frontend: React, Next.js, Vue, dan Svelte dengan TypeScript. Mobile: Kotlin Multiplatform, Flutter, dan SwiftUI. Backend: Node.js, Go, Python, dan Java dengan arsitektur modular.',
          'Data: PostgreSQL, MySQL, Redis, ClickHouse, dan Elasticsearch. Messaging: Kafka, RabbitMQ, dan NATS untuk sistem yang tetap responsif di bawah beban berat.',
          'Infrastruktur: Docker, Kubernetes, Terraform, dan GitHub Actions di AWS, GCP, maupun VPS lokal seperti Linode—lengkap dengan Prometheus, Grafana, dan Loki.',
        ],
        sidebarTitle: 'STANDAR KAMI',
        sidebar: ['OWASP ASVS', 'Clean Architecture', 'Test coverage > 80%', 'Infrastructure as Code'],
      },
      en: {
        label: 'Tensura in View', masthead: 'TENSURA IN VIEW', section: 'TECHNOLOGY',
        headline: 'THE STACK WE TRUST',
        deck: 'We pick technology not because it is trendy, but because it is proven in production.',
        columns: [
          'Frontend: React, Next.js, Vue, and Svelte with TypeScript. Mobile: Kotlin Multiplatform, Flutter, and SwiftUI. Backend: Node.js, Go, Python, and Java with modular architecture.',
          'Data: PostgreSQL, MySQL, Redis, ClickHouse, and Elasticsearch. Messaging: Kafka, RabbitMQ, and NATS for systems that stay responsive under heavy load.',
          'Infrastructure: Docker, Kubernetes, Terraform, and GitHub Actions on AWS, GCP, or local VPS providers such as Linode—complete with Prometheus, Grafana, and Loki.',
        ],
        sidebarTitle: 'OUR STANDARDS',
        sidebar: ['OWASP ASVS', 'Clean Architecture', 'Test coverage > 80%', 'Infrastructure as Code'],
      },
    },
  },
  {
    key: 'faq', image: '/assets/img/portfolio/ai-assistant.jpg',
    content: {
      id: {
        label: 'Tanya Jawab Klien', masthead: 'TANYA JAWAB KLIEN', section: 'TANYA JAWAB',
        headline: 'PERTANYAAN YANG SERING DIAJUKAN',
        deck: 'Semua yang perlu Anda ketahui sebelum memulai proyek bersama TensuraLabs.',
        columns: [
          'Berapa lama proyek berjalan? MVP umumnya 6–10 minggu; sistem informasi skala menengah 3–6 bulan. Bagaimana skema biaya? Tersedia fixed price per proyek atau dedicated team bulanan.',
          'Apakah bisa melanjutkan proyek yang sudah ada? Bisa. Kami memulai dengan audit kode dan infrastruktur, lalu menyusun rencana perbaikan bertahap.',
          'Bagaimana keamanan data? Kami menandatangani NDA, menerapkan prinsip least privilege, enkripsi data, dan tidak pernah menyimpan kredensial di repositori.',
        ],
        sidebarTitle: 'KONTAK CEPAT',
        sidebar: ['Respons < 24 jam', 'Konsultasi awal gratis', 'Bahasa Indonesia & Inggris', 'Senin–Sabtu'],
      },
      en: {
        label: 'Client Q&A', masthead: 'CLIENT Q&A', section: 'Q & A',
        headline: 'FREQUENTLY ASKED QUESTIONS',
        deck: 'Everything you need to know before starting a project with TensuraLabs.',
        columns: [
          'How long does a project take? MVPs usually take 6–10 weeks; mid-sized information systems 3–6 months. How is pricing structured? Fixed price per project or a monthly dedicated team.',
          'Can you continue an existing project? Yes. We start with a code and infrastructure audit, then plan incremental improvements.',
          'How do you handle data security? We sign NDAs, apply least privilege, encrypt data, and never store credentials in repositories.',
        ],
        sidebarTitle: 'QUICK CONTACT',
        sidebar: ['Reply within 24 hours', 'Free initial consultation', 'Indonesian & English', 'Monday–Saturday'],
      },
    },
  },
];

const COVERS = Object.freeze({
  launch: '/assets/img/news/cover-launch.jpg',
  faq: '/assets/img/news/cover-faq.jpg',
  report: '/assets/img/news/cover-report.jpg',
  cleanCode: '/assets/img/news/cover-clean-code.jpg',
  devops: '/assets/img/news/cover-devops.jpg',
  webinar: '/assets/img/news/cover-webinar.jpg',
});

export const ARTICLES = [
  {
    slug: 'tensuralabs-resmi-diluncurkan', category: 'news', cover: COVERS.launch, publishedAt: '2026-09-23T03:00:00.000Z',
    id: { title: 'TensuraLabs Resmi Diluncurkan', summary: 'Software house dengan tim developer, engineer, DevOps, LLM engineer, dan programmer kini membuka layanan untuk umum.', body: 'Halo, para pembangun produk!\n\nHari ini TensuraLabs resmi membuka layanan untuk umum. Kami hadir untuk membantu bisnis membangun aplikasi dan sistem informasi yang andal, aman, dan siap berkembang.\n\n## Apa yang kami tawarkan\n\n- **Software Developer** untuk aplikasi web dan mobile\n- **Software Engineer** untuk arsitektur dan sistem berskala besar\n- **DevOps Engineer** untuk infrastruktur, CI/CD, dan observabilitas\n- **Programmer** untuk integrasi, otomasi, dan algoritma\n\n## Cara memulai\n\nKlik tombol **Konsultasi** di bagian atas halaman, isi email dan platform yang Anda butuhkan, dan tim kami akan menghubungi Anda dalam 24 jam.' },
    en: { title: 'TensuraLabs Officially Launches', summary: 'A software house of developers, engineers, DevOps, LLM engineers, and programmers is now open to the public.', body: 'Hello, product builders!\n\nToday TensuraLabs officially opens to the public. We help businesses build reliable, secure applications and information systems that are ready to grow.\n\n## What we offer\n\n- **Software Developers** for web and mobile apps\n- **Software Engineers** for architecture and large-scale systems\n- **DevOps Engineers** for infrastructure, CI/CD, and observability\n- **Programmers** for integrations, automation, and algorithms\n\n## How to start\n\nClick the **Consult** button at the top of the page, enter your email and target platform, and our team will contact you within 24 hours.' },
  },
  {
    slug: 'faq-konsultasi-proyek', category: 'notice', cover: COVERS.faq, publishedAt: '2026-08-26T03:00:00.000Z',
    id: { title: 'FAQ Konsultasi Proyek TensuraLabs', summary: 'Kami merangkum pertanyaan yang paling sering diajukan seputar alur konsultasi, estimasi biaya, dan jadwal proyek.', body: 'Kami telah merangkum pertanyaan yang paling sering diajukan seputar konsultasi proyek.\n\n## Apakah konsultasi berbayar?\n\nTidak. Sesi konsultasi awal selama 60 menit sepenuhnya gratis.\n\n## Apa yang perlu disiapkan?\n\n- Gambaran masalah bisnis yang ingin diselesaikan\n- Target pengguna dan platform\n- Perkiraan anggaran dan tenggat waktu\n\n## Berapa lama sampai menerima proposal?\n\nProposal teknis beserta estimasi biaya dikirim maksimal **5 hari kerja** setelah sesi discovery.' },
    en: { title: 'TensuraLabs Project Consultation FAQ', summary: 'We compiled the most common questions about the consultation flow, cost estimates, and project timelines.', body: 'We have compiled the most frequently asked questions about project consultations.\n\n## Is the consultation paid?\n\nNo. The initial 60-minute consultation is completely free.\n\n## What should I prepare?\n\n- An overview of the business problem\n- Target users and platforms\n- Expected budget and deadline\n\n## How long until I receive a proposal?\n\nA technical proposal with cost estimate is sent within **5 business days** after the discovery session.' },
  },
  {
    slug: 'laporan-optimasi-performa', category: 'notice', cover: COVERS.report, publishedAt: '2026-08-22T03:00:00.000Z',
    id: { title: 'Laporan Tensura: Optimasi Performa & Keamanan', summary: 'Fokus utama: optimasi kecepatan muat, penguatan keamanan API, dan peningkatan observabilitas di seluruh proyek klien.', body: 'Terima kasih atas dukungan dan masukan dari seluruh klien kami!\n\nSetelah meninjau masukan, kami merangkum area optimasi untuk kuartal ini.\n\n## Optimasi Performa\n\nWaktu muat halaman rata-rata turun 41% melalui code splitting, kompresi gambar modern, dan caching di edge.\n\n## Penguatan Keamanan\n\n- Rotasi kunci otomatis setiap 30 hari\n- Rate limiting adaptif pada endpoint publik\n- Audit dependensi harian\n\n## Observabilitas\n\nSetiap layanan kini memiliki tracing terdistribusi sehingga akar masalah dapat ditemukan dalam hitungan menit.' },
    en: { title: 'Tensura Report: Performance & Security Optimisation', summary: 'Key focus: load-time optimisation, API security hardening, and better observability across client projects.', body: 'Thank you for the support and feedback from all of our clients!\n\nAfter reviewing your input, we outlined this quarter\'s optimisation areas.\n\n## Performance\n\nAverage page load time dropped 41% through code splitting, modern image compression, and edge caching.\n\n## Security Hardening\n\n- Automatic key rotation every 30 days\n- Adaptive rate limiting on public endpoints\n- Daily dependency audits\n\n## Observability\n\nEvery service now has distributed tracing, so root causes can be found within minutes.' },
  },
  {
    slug: 'ilmu-segala-hal-clean-code', category: 'news', cover: COVERS.cleanCode, publishedAt: '2026-07-26T03:00:00.000Z',
    id: { title: 'Catatan Engineering — Edisi Clean Code', summary: 'Ada pepatah di tim kami: kode ditulis sekali, tetapi dibaca ratusan kali. Inilah prinsip clean code yang kami pegang.', body: 'Ada pepatah di tim kami: kode ditulis sekali, tetapi dibaca ratusan kali.\n\n## Nama yang jujur\n\nNama variabel dan fungsi harus menjelaskan niat, bukan implementasi.\n\n## Fungsi kecil, satu tanggung jawab\n\nFungsi yang melakukan satu hal lebih mudah diuji, dipahami, dan diganti.\n\n## Tes sebagai dokumentasi\n\nTes yang baik menjelaskan perilaku sistem lebih jelas daripada komentar mana pun.' },
    en: { title: 'Engineering Notes — Clean Code Edition', summary: 'A saying in our team: code is written once but read hundreds of times. These are the clean code principles we live by.', body: 'A saying in our team: code is written once but read hundreds of times.\n\n## Honest names\n\nVariable and function names should reveal intent, not implementation.\n\n## Small functions, single responsibility\n\nFunctions that do one thing are easier to test, understand, and replace.\n\n## Tests as documentation\n\nGood tests explain system behaviour more clearly than any comment.' },
  },
  {
    slug: 'ilmu-segala-hal-devops', category: 'news', cover: COVERS.devops, publishedAt: '2026-07-20T03:00:00.000Z',
    id: { title: 'Catatan Engineering — Edisi DevOps', summary: 'Pada edisi ini, Anda akan melihat bagaimana pipeline CI/CD kami mengirim kode ke produksi puluhan kali sehari dengan aman.', body: 'Pada edisi ini kita membedah pipeline CI/CD di TensuraLabs.\n\n## Setiap commit diuji\n\nLint, unit test, integration test, dan pemindaian keamanan berjalan otomatis pada setiap pull request.\n\n## Deploy bertahap\n\nRilis dimulai dari 5% trafik (canary), dipantau metriknya, lalu diperluas secara otomatis.\n\n## Rollback satu klik\n\nJika metrik memburuk, sistem kembali ke versi sebelumnya dalam waktu kurang dari 30 detik.' },
    en: { title: 'Engineering Notes — DevOps Edition', summary: 'In this edition you will see how our CI/CD pipeline safely ships code to production dozens of times a day.', body: 'In this edition we dissect the CI/CD pipeline at TensuraLabs.\n\n## Every commit is tested\n\nLinting, unit tests, integration tests, and security scans run automatically on every pull request.\n\n## Progressive delivery\n\nReleases start at 5% of traffic (canary), metrics are watched, then rollout expands automatically.\n\n## One-click rollback\n\nIf metrics degrade, the system returns to the previous version in under 30 seconds.' },
  },
  {
    slug: 'webinar-arsitektur-microservices', category: 'event', cover: COVERS.webinar, publishedAt: '2026-07-23T03:00:00.000Z',
    id: { title: 'Webinar: Monolit atau Microservices?', summary: 'Ikuti webinar gratis bersama engineer TensuraLabs dan pelajari kapan sebaiknya memecah monolit.', body: 'Webinar gratis "Monolit atau Microservices?" akan segera dimulai!\n\n## Materi\n\n- Tanda-tanda monolit perlu dipecah\n- Pola strangler fig untuk migrasi bertahap\n- Studi kasus migrasi 34 layanan ke Kubernetes\n\n## Cara mendaftar\n\nKlik tombol **Konsultasi**, pilih platform Web, dan centang persetujuan menerima informasi. Tautan webinar akan dikirim ke email Anda.' },
    en: { title: 'Webinar: Monolith or Microservices?', summary: 'Join a free webinar with TensuraLabs engineers and learn when it makes sense to split a monolith.', body: 'The free webinar "Monolith or Microservices?" is coming soon!\n\n## Agenda\n\n- Signs your monolith should be split\n- The strangler fig pattern for incremental migration\n- Case study: migrating 34 services to Kubernetes\n\n## How to register\n\nClick the **Consult** button, choose the Web platform, and tick the consent to receive updates. The webinar link will be sent to your email.' },
  },
  {
    slug: 'program-magang-guild', category: 'event', cover: COVERS.launch, publishedAt: '2026-06-15T03:00:00.000Z',
    id: { title: 'Program Magang TensuraLabs 2026', summary: 'Kami membuka 12 posisi magang untuk calon developer, engineer, dan DevOps yang ingin belajar langsung di proyek nyata.', body: 'TensuraLabs membuka program magang angkatan 2026.\n\n## Posisi\n\n- Frontend Developer (4 orang)\n- Backend Engineer (4 orang)\n- DevOps Engineer (2 orang)\n- QA Automation (2 orang)\n\n## Fasilitas\n\nMentoring langsung, proyek nyata, dan peluang bergabung sebagai karyawan tetap.' },
    en: { title: 'TensuraLabs Internship Program 2026', summary: 'We are opening 12 internship positions for aspiring developers, engineers, and DevOps who want hands-on experience.', body: 'TensuraLabs is opening its 2026 internship cohort.\n\n## Positions\n\n- Frontend Developer (4)\n- Backend Engineer (4)\n- DevOps Engineer (2)\n- QA Automation (2)\n\n## Benefits\n\nDirect mentoring, real projects, and a path to a full-time role.' },
  },
  {
    slug: 'pemeliharaan-terjadwal', category: 'notice', cover: COVERS.report, publishedAt: '2026-06-01T03:00:00.000Z',
    id: { title: 'Pemberitahuan Pemeliharaan Infrastruktur Terjadwal', summary: 'Pemeliharaan rutin pusat data dilakukan tanpa downtime berkat arsitektur multi-zona.', body: 'Kami akan melakukan pemeliharaan infrastruktur terjadwal.\n\n## Dampak\n\nTidak ada downtime yang diharapkan berkat arsitektur multi-zona dan load balancing otomatis.\n\n## Kontak darurat\n\nJika Anda mengalami kendala, hubungi tim dukungan melalui email atau WhatsApp yang tercantum di halaman utama.' },
    en: { title: 'Scheduled Infrastructure Maintenance Notice', summary: 'Routine data centre maintenance will run with zero downtime thanks to our multi-zone architecture.', body: 'We will perform scheduled infrastructure maintenance.\n\n## Impact\n\nNo downtime is expected thanks to multi-zone architecture and automatic load balancing.\n\n## Emergency contact\n\nIf you experience any issues, contact support via the email or WhatsApp listed on the home page.' },
  },
];
