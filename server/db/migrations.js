export const MIGRATIONS = Object.freeze([
  {
    version: 1,
    sql: `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'editor')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        last_login_at TEXT
      );

      CREATE TABLE sessions (
        id INTEGER PRIMARY KEY,
        token_digest TEXT NOT NULL UNIQUE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX idx_sessions_expires ON sessions(expires_at);

      CREATE TABLE leads (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL COLLATE NOCASE,
        platform TEXT NOT NULL CHECK (platform IN ('web', 'android', 'ios')),
        marketing_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (marketing_opt_in IN (0, 1)),
        locale TEXT NOT NULL DEFAULT 'id' CHECK (locale IN ('id', 'en')),
        status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'closed')),
        note TEXT NOT NULL DEFAULT '',
        ip_digest TEXT,
        user_agent TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE (email, platform)
      );
      CREATE INDEX idx_leads_status_created ON leads(status, created_at DESC);

      CREATE TABLE articles (
        id INTEGER PRIMARY KEY,
        slug TEXT NOT NULL,
        locale TEXT NOT NULL CHECK (locale IN ('id', 'en')),
        category TEXT NOT NULL CHECK (category IN ('news', 'notice', 'event')),
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        body TEXT NOT NULL,
        cover TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
        published_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE (slug, locale)
      );
      CREATE INDEX idx_articles_public ON articles(locale, status, published_at DESC);

      CREATE TABLE squad_roles (
        id INTEGER PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        sort_order INTEGER NOT NULL,
        portrait TEXT NOT NULL,
        avatar TEXT NOT NULL,
        accent TEXT NOT NULL,
        content TEXT NOT NULL
      );

      CREATE TABLE portfolio_items (
        id INTEGER PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        sort_order INTEGER NOT NULL,
        thumbnail TEXT NOT NULL,
        project_date TEXT NOT NULL,
        stack TEXT NOT NULL,
        project_url TEXT,
        video_url TEXT,
        content TEXT NOT NULL
      );

      CREATE TABLE gazette_issues (
        id INTEGER PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        sort_order INTEGER NOT NULL,
        image TEXT NOT NULL,
        content TEXT NOT NULL
      );
    `,
  },
  {
    // v2: key/value metadata (static content version) and the move to original artwork:
    // retired image paths are remapped and legacy seeded titles are renamed (admin edits are untouched).
    version: 2,
    sql: `
      CREATE TABLE app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      UPDATE articles SET cover = CASE cover
          WHEN '/assets/img/news/cover-1.jpg' THEN '/assets/img/news/cover-launch.jpg'
          WHEN '/assets/img/news/cover-2.jpg' THEN '/assets/img/news/cover-faq.jpg'
          WHEN '/assets/img/news/cover-3.jpg' THEN '/assets/img/news/cover-report.jpg'
          WHEN '/assets/img/news/cover-4.jpg' THEN '/assets/img/news/cover-clean-code.jpg'
          WHEN '/assets/img/news/cover-5.jpg' THEN '/assets/img/news/cover-devops.jpg'
          WHEN '/assets/img/news/cover-6.jpg' THEN '/assets/img/news/cover-webinar.jpg'
          WHEN '/assets/img/hero.jpg' THEN '/assets/img/key-visual.jpg'
          WHEN '/assets/img/banner-city.jpg' THEN '/assets/img/banner-network.jpg'
          WHEN '/assets/img/banner-workshop.jpg' THEN '/assets/img/banner-office.jpg'
          WHEN '/assets/img/portfolio/commerce.jpg' THEN '/assets/img/portfolio/commerce-platform.jpg'
          WHEN '/assets/img/portfolio/analytics.jpg' THEN '/assets/img/portfolio/analytics-dashboard.jpg'
          WHEN '/assets/img/portfolio/mobile.jpg' THEN '/assets/img/portfolio/civic-mobile.jpg'
          WHEN '/assets/img/portfolio/cloud.jpg' THEN '/assets/img/portfolio/cloud-migration.jpg'
          WHEN '/assets/img/portfolio/ai.jpg' THEN '/assets/img/portfolio/ai-assistant.jpg'
        END
      WHERE cover IN ('/assets/img/news/cover-1.jpg', '/assets/img/news/cover-2.jpg', '/assets/img/news/cover-3.jpg', '/assets/img/news/cover-4.jpg', '/assets/img/news/cover-5.jpg', '/assets/img/news/cover-6.jpg', '/assets/img/hero.jpg', '/assets/img/banner-city.jpg', '/assets/img/banner-workshop.jpg', '/assets/img/portfolio/commerce.jpg', '/assets/img/portfolio/analytics.jpg', '/assets/img/portfolio/mobile.jpg', '/assets/img/portfolio/cloud.jpg', '/assets/img/portfolio/ai.jpg');

      UPDATE articles SET title = 'Catatan Engineering — Edisi Clean Code', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE title = 'Ilmu Segala Hal — Edisi Clean Code';
      UPDATE articles SET title = 'Engineering Notes — Clean Code Edition', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE title = 'The Science of All Things — Clean Code Edition';
      UPDATE articles SET title = 'Catatan Engineering — Edisi DevOps', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE title = 'Ilmu Segala Hal — Edisi DevOps';
      UPDATE articles SET title = 'Engineering Notes — DevOps Edition', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE title = 'The Science of All Things — DevOps Edition';
      UPDATE articles SET title = 'Program Magang TensuraLabs 2026', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE title = 'Program Magang Guild TensuraLabs 2026';
      UPDATE articles SET title = 'TensuraLabs Internship Program 2026', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE title = 'TensuraLabs Guild Internship Program 2026';
    `,
  },
  {
    // v3: CRM-grade leads (contact details, pipeline, priority, assignment, activity timeline),
    // site settings (appearance & home content), media library, audit trail, privacy-friendly
    // analytics, account status, richer sessions, and publish toggles for code-seeded content.
    version: 3,
    sql: `
      ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));
      ALTER TABLE users ADD COLUMN updated_at TEXT;

      ALTER TABLE sessions ADD COLUMN user_agent TEXT NOT NULL DEFAULT '';
      ALTER TABLE sessions ADD COLUMN ip_digest TEXT;
      ALTER TABLE sessions ADD COLUMN last_seen_at TEXT;
      CREATE INDEX idx_sessions_user ON sessions(user_id);

      CREATE TABLE leads_v3 (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL COLLATE NOCASE,
        phone TEXT NOT NULL DEFAULT '',
        company TEXT NOT NULL DEFAULT '',
        service TEXT NOT NULL DEFAULT '',
        budget TEXT NOT NULL DEFAULT '',
        message TEXT NOT NULL DEFAULT '',
        locale TEXT NOT NULL DEFAULT 'id' CHECK (locale IN ('id', 'en')),
        status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost')),
        priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
        note TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        marketing_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (marketing_opt_in IN (0, 1)),
        assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
        ip_digest TEXT,
        user_agent TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      INSERT INTO leads_v3 (id, email, locale, status, note, source, service, marketing_opt_in, ip_digest, user_agent, created_at, updated_at)
        SELECT id, email, locale,
          CASE status WHEN 'closed' THEN 'won' ELSE status END,
          note, 'legacy', 'platform:' || platform, marketing_opt_in, ip_digest, user_agent, created_at, updated_at
        FROM leads;
      DROP TABLE leads;
      ALTER TABLE leads_v3 RENAME TO leads;
      CREATE INDEX idx_leads_status_created ON leads(status, created_at DESC);
      CREATE INDEX idx_leads_email ON leads(email);
      CREATE INDEX idx_leads_created ON leads(created_at DESC);

      CREATE TABLE lead_events (
        id INTEGER PRIMARY KEY,
        lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        type TEXT NOT NULL CHECK (type IN ('created', 'resubmitted', 'status', 'priority', 'assigned', 'note', 'comment')),
        message TEXT NOT NULL DEFAULT '',
        data TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX idx_lead_events_lead ON lead_events(lead_id, created_at DESC);
      INSERT INTO lead_events (lead_id, type, message, created_at) SELECT id, 'created', 'Imported from v2', created_at FROM leads;

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE TABLE media (
        id INTEGER PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        original_name TEXT NOT NULL,
        mime TEXT NOT NULL,
        size INTEGER NOT NULL,
        width INTEGER,
        height INTEGER,
        alt TEXT NOT NULL DEFAULT '',
        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX idx_media_created ON media(created_at DESC);

      CREATE TABLE audit_logs (
        id INTEGER PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        actor TEXT NOT NULL DEFAULT 'system',
        action TEXT NOT NULL,
        entity TEXT NOT NULL,
        entity_id TEXT,
        summary TEXT NOT NULL DEFAULT '',
        ip_digest TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
      CREATE INDEX idx_audit_entity ON audit_logs(entity, created_at DESC);

      CREATE TABLE analytics_pageviews (
        day TEXT NOT NULL,
        path TEXT NOT NULL,
        views INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (day, path)
      ) WITHOUT ROWID;
      CREATE TABLE analytics_visitors (
        day TEXT NOT NULL,
        digest TEXT NOT NULL,
        PRIMARY KEY (day, digest)
      ) WITHOUT ROWID;
      CREATE TABLE analytics_referrers (
        day TEXT NOT NULL,
        host TEXT NOT NULL,
        views INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (day, host)
      ) WITHOUT ROWID;
      CREATE TABLE analytics_devices (
        day TEXT NOT NULL,
        device TEXT NOT NULL CHECK (device IN ('mobile', 'tablet', 'desktop')),
        views INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (day, device)
      ) WITHOUT ROWID;

      ALTER TABLE squad_roles ADD COLUMN is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1));
      ALTER TABLE portfolio_items ADD COLUMN is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1));
      ALTER TABLE gazette_issues ADD COLUMN is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1));

      ALTER TABLE articles ADD COLUMN featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1));
      ALTER TABLE articles ADD COLUMN author_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
    `,
  },
  {
    // v4: account security (TOTP 2FA, recovery codes, MFA challenges, login throttling),
    // sales workflow (tasks & follow-ups, quotations), in-app notifications, and signed outgoing webhooks.
    // lead_events is rebuilt to accept the new 'task' and 'quote' timeline entries.
    version: 4,
    sql: `
      ALTER TABLE users ADD COLUMN totp_secret TEXT;
      ALTER TABLE users ADD COLUMN totp_pending TEXT;
      ALTER TABLE users ADD COLUMN totp_enabled_at TEXT;
      ALTER TABLE users ADD COLUMN totp_last_step INTEGER;

      CREATE TABLE user_recovery_codes (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_digest TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX idx_recovery_user ON user_recovery_codes(user_id);

      CREATE TABLE mfa_challenges (
        id INTEGER PRIMARY KEY,
        token_digest TEXT NOT NULL UNIQUE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        attempts INTEGER NOT NULL DEFAULT 0,
        user_agent TEXT NOT NULL DEFAULT '',
        ip_digest TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX idx_mfa_expires ON mfa_challenges(expires_at);

      CREATE TABLE login_throttle (
        key TEXT PRIMARY KEY,
        failures INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) WITHOUT ROWID;

      CREATE TABLE lead_events_v4 (
        id INTEGER PRIMARY KEY,
        lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        type TEXT NOT NULL CHECK (type IN ('created', 'resubmitted', 'status', 'priority', 'assigned', 'note', 'comment', 'task', 'quote')),
        message TEXT NOT NULL DEFAULT '',
        data TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      INSERT INTO lead_events_v4 (id, lead_id, user_id, type, message, data, created_at)
        SELECT id, lead_id, user_id, type, message, data, created_at FROM lead_events;
      DROP TABLE lead_events;
      ALTER TABLE lead_events_v4 RENAME TO lead_events;
      CREATE INDEX idx_lead_events_lead ON lead_events(lead_id, created_at DESC);

      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
        assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
        due_at TEXT,
        reminded_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX idx_tasks_status_due ON tasks(status, due_at);
      CREATE INDEX idx_tasks_assignee ON tasks(assigned_to, status);
      CREATE INDEX idx_tasks_lead ON tasks(lead_id);

      CREATE TABLE quotes (
        id INTEGER PRIMARY KEY,
        number TEXT NOT NULL UNIQUE,
        lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        client_name TEXT NOT NULL,
        client_email TEXT NOT NULL DEFAULT '',
        client_company TEXT NOT NULL DEFAULT '',
        currency TEXT NOT NULL DEFAULT 'IDR' CHECK (currency IN ('IDR', 'USD')),
        items TEXT NOT NULL DEFAULT '[]',
        discount_pct REAL NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
        tax_pct REAL NOT NULL DEFAULT 0 CHECK (tax_pct >= 0 AND tax_pct <= 100),
        subtotal INTEGER NOT NULL DEFAULT 0,
        discount_amount INTEGER NOT NULL DEFAULT 0,
        tax_amount INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected')),
        valid_until TEXT,
        notes TEXT NOT NULL DEFAULT '',
        terms TEXT NOT NULL DEFAULT '',
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        sent_at TEXT,
        decided_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX idx_quotes_status ON quotes(status, updated_at DESC);
      CREATE INDEX idx_quotes_lead ON quotes(lead_id);

      CREATE TABLE notifications (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        link TEXT NOT NULL DEFAULT '',
        read_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX idx_notifications_user ON notifications(user_id, read_at, created_at DESC);

      CREATE TABLE webhooks (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        secret TEXT NOT NULL,
        events TEXT NOT NULL DEFAULT '[]',
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        failure_count INTEGER NOT NULL DEFAULT 0,
        last_status INTEGER,
        last_delivery_at TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE TABLE webhook_deliveries (
        id INTEGER PRIMARY KEY,
        webhook_id INTEGER NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
        delivery_id TEXT NOT NULL,
        event TEXT NOT NULL,
        attempt INTEGER NOT NULL DEFAULT 1,
        status_code INTEGER,
        ok INTEGER NOT NULL DEFAULT 0 CHECK (ok IN (0, 1)),
        duration_ms INTEGER NOT NULL DEFAULT 0,
        error TEXT NOT NULL DEFAULT '',
        payload TEXT NOT NULL DEFAULT '',
        response TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX idx_webhook_deliveries ON webhook_deliveries(webhook_id, created_at DESC);
    `,
  },
  {
    // v5: Mail subdomain (Cloudflare Email Routing → Worker → API). Addresses carry a hashed access key,
    // anonymous browser sessions may hold several addresses, messages keep the raw MIME for ".eml" export,
    // and attachments are stored as BLOBs so the regular database backup covers the whole mailbox.
    version: 5,
    sql: `
      CREATE TABLE mail_addresses (
        id INTEGER PRIMARY KEY,
        local_part TEXT NOT NULL,
        domain TEXT NOT NULL COLLATE NOCASE,
        address TEXT NOT NULL UNIQUE COLLATE NOCASE,
        label TEXT NOT NULL DEFAULT '',
        key_digest TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'public' CHECK (source IN ('public', 'admin')),
        owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        can_send INTEGER NOT NULL DEFAULT 0 CHECK (can_send IN (0, 1)),
        send_quota_daily INTEGER CHECK (send_quota_daily IS NULL OR send_quota_daily >= 0),
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        ip_digest TEXT,
        expires_at TEXT,
        last_received_at TEXT,
        last_access_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX idx_mail_addresses_expires ON mail_addresses(expires_at) WHERE expires_at IS NOT NULL;
      CREATE INDEX idx_mail_addresses_owner ON mail_addresses(owner_user_id);
      CREATE INDEX idx_mail_addresses_created ON mail_addresses(created_at DESC);

      CREATE TABLE mail_messages (
        id INTEGER PRIMARY KEY,
        address_id INTEGER NOT NULL REFERENCES mail_addresses(id) ON DELETE CASCADE,
        direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
        message_id TEXT NOT NULL DEFAULT '',
        in_reply_to TEXT NOT NULL DEFAULT '',
        references_header TEXT NOT NULL DEFAULT '',
        envelope_from TEXT NOT NULL DEFAULT '',
        from_address TEXT NOT NULL DEFAULT '',
        from_name TEXT NOT NULL DEFAULT '',
        reply_to TEXT NOT NULL DEFAULT '',
        to_list TEXT NOT NULL DEFAULT '[]',
        cc_list TEXT NOT NULL DEFAULT '[]',
        subject TEXT NOT NULL DEFAULT '',
        snippet TEXT NOT NULL DEFAULT '',
        text_body TEXT NOT NULL DEFAULT '',
        html_body TEXT NOT NULL DEFAULT '',
        has_remote_content INTEGER NOT NULL DEFAULT 0 CHECK (has_remote_content IN (0, 1)),
        attachment_count INTEGER NOT NULL DEFAULT 0,
        size INTEGER NOT NULL DEFAULT 0,
        raw BLOB,
        raw_sha256 TEXT NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
        is_starred INTEGER NOT NULL DEFAULT 0 CHECK (is_starred IN (0, 1)),
        provider TEXT NOT NULL DEFAULT '',
        provider_id TEXT NOT NULL DEFAULT '',
        sent_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
        spf TEXT NOT NULL DEFAULT '',
        dkim TEXT NOT NULL DEFAULT '',
        sent_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE (address_id, raw_sha256)
      );
      CREATE INDEX idx_mail_messages_box ON mail_messages(address_id, direction, created_at DESC, id DESC);
      CREATE INDEX idx_mail_messages_created ON mail_messages(created_at DESC);
      CREATE INDEX idx_mail_messages_unread ON mail_messages(address_id, is_read) WHERE direction = 'in' AND is_read = 0;

      CREATE TABLE mail_attachments (
        id INTEGER PRIMARY KEY,
        message_id INTEGER NOT NULL REFERENCES mail_messages(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
        content_id TEXT NOT NULL DEFAULT '',
        disposition TEXT NOT NULL DEFAULT 'attachment' CHECK (disposition IN ('attachment', 'inline')),
        size INTEGER NOT NULL DEFAULT 0,
        data BLOB NOT NULL
      );
      CREATE INDEX idx_mail_attachments_message ON mail_attachments(message_id);

      CREATE TABLE mail_sessions (
        id INTEGER PRIMARY KEY,
        token_digest TEXT NOT NULL UNIQUE,
        ip_digest TEXT,
        user_agent TEXT NOT NULL DEFAULT '',
        expires_at TEXT NOT NULL,
        last_seen_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX idx_mail_sessions_expires ON mail_sessions(expires_at);

      CREATE TABLE mail_session_addresses (
        session_id INTEGER NOT NULL REFERENCES mail_sessions(id) ON DELETE CASCADE,
        address_id INTEGER NOT NULL REFERENCES mail_addresses(id) ON DELETE CASCADE,
        added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        PRIMARY KEY (session_id, address_id)
      ) WITHOUT ROWID;
      CREATE INDEX idx_mail_session_addresses_address ON mail_session_addresses(address_id);

      CREATE TABLE mail_inbound_log (
        id INTEGER PRIMARY KEY,
        envelope_from TEXT NOT NULL DEFAULT '',
        envelope_to TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK (status IN ('accepted', 'duplicate', 'rejected', 'error')),
        reason TEXT NOT NULL DEFAULT '',
        size INTEGER NOT NULL DEFAULT 0,
        message_id INTEGER REFERENCES mail_messages(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX idx_mail_inbound_log_created ON mail_inbound_log(created_at DESC);
    `,
  },
]);
