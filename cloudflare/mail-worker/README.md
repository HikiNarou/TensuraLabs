# tensuralabs-mail — Cloudflare Email Worker

Bridges **Cloudflare Email Routing** and the TensuraLabs server.

| Handler | Purpose |
|---|---|
| `email()` | Every message routed to the Worker is streamed (raw MIME) to `INBOUND_URL` with an HMAC signature. Server 2xx = stored, 4xx = rejected to the sender, 5xx/network = temporary failure (sender retries) or forwarded to `FALLBACK_FORWARD`. |
| `POST /send` | Outbound mail signed by the server (`MAIL_PROVIDER=cloudflare`), delivered through the `send_email` binding `SEB`. |
| `GET /health` | Shows whether inbound/outbound are configured (no secrets). |

## Deploy

```bash
cd cloudflare/mail-worker
npm install
npx wrangler login
# edit wrangler.toml → INBOUND_URL, MAIL_DOMAINS (same as server MAIL_DOMAINS)
npx wrangler deploy
npx wrangler secret put MAIL_WORKER_SECRET     # exactly the server's MAIL_WORKER_SECRET (openssl rand -hex 32)
```

Then in the Cloudflare dashboard for **each** receiving domain:

1. **Email → Email Routing → Enable** (Cloudflare adds the MX + SPF records).
2. **Routing rules → Catch-all address → Action: Send to a Worker → `tensuralabs-mail`**.
3. *(Outbound, optional)* Add recipients under **Destination addresses**. Cloudflare's `send_email` binding only delivers to
   verified destination addresses; for arbitrary recipients use `MAIL_PROVIDER=resend` on the server instead.

Server `.env`:

```env
MAIL_HOSTNAME=mail.tensuralabs.app
MAIL_DOMAINS=tensuralabs.app
MAIL_WORKER_SECRET=<same secret>
MAIL_PROVIDER=cloudflare                       # optional, for sending
MAIL_WORKER_URL=https://tensuralabs-mail.<account>.workers.dev
```

Verify with **Admin → Mail → Integrasi → Kirim email uji**, `curl https://tensuralabs-mail.<account>.workers.dev/health`,
and `npx wrangler tail` for structured logs.

## Signature

`X-Tensura-Signature: v1=<hex>` where `hex = HMAC_SHA256(secret, "v1:<unix>:<context>\n" + body)` and
`X-Tensura-Timestamp: <unix>` (±5 minutes). Context is `inbound:<envelope-from>:<envelope-to>` (lower-case) for inbound
mail and `send` for outbound requests. Envelope addresses travel in `X-Mail-From` / `X-Mail-To`.
