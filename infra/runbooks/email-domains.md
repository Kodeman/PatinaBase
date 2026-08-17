# Email sender domains

Patina sends transactional and marketing email through Resend. For deliverability, transactional ("you reset your password") and marketing ("here are some new products") should send from **separate verified subdomains** — bounces and complaints on marketing shouldn't hurt the reputation of password-reset deliveries.

## Code config

`packages/email/src/send.ts` and `supabase/functions/_shared/send-email.ts` resolve the From address per category. Set these env vars in production:

| Env var | Used by | Example |
|---|---|---|
| `RESEND_FROM_TRANSACTIONAL` | account verification, password reset, security alert, order confirmation, payment receipt, client confirmation, proposals, decision reminders, review requests, invites | `Patina <hello@patina.cloud>` |
| `RESEND_FROM_MARKETING` | campaigns (campaign-dispatch), digests, engagement notifications (price drop, back in stock, weekly inspiration, etc.) | `Patina <mail@mail.patina.cloud>` |
| `RESEND_FROM` | fallback when the category-specific var is unset | `Patina <hello@patina.cloud>` |

If only `RESEND_FROM` is set, both categories share it (current state, single-domain).

## DNS verification (one-time)

To start sending from `mail.patina.cloud`:

1. **Add the subdomain in Resend.** Resend dashboard → Domains → Add domain → `mail.patina.cloud`. Region: us-east-1 (or whichever region the project is in).
2. **Resend gives you four DNS records.** Typically:
   - `mail.patina.cloud  TXT  v=spf1 include:amazonses.com ~all` (SPF)
   - `resend._domainkey.mail.patina.cloud  TXT  p=...` (DKIM)
   - `_dmarc.mail.patina.cloud  TXT  v=DMARC1; p=quarantine; rua=mailto:dmarc@patina.cloud` (DMARC; recommended `p=none` initially, `p=quarantine` once stable)
   - `mail.patina.cloud  MX  10 feedback-smtp.us-east-1.amazonses.com` (return-path)
3. **Add the records in Cloudflare DNS** (since `patina.cloud` is on Cloudflare). Type, name, value as Resend specifies. Disable Cloudflare proxying (gray cloud, not orange) for TXT and MX.
4. **Click "Verify" in the Resend dashboard.** Propagation usually takes < 5 minutes; can be longer.
5. Once verified, set `RESEND_FROM_MARKETING="Patina <mail@mail.patina.cloud>"` in:
   - the portal Wrangler `vars` blocks and retained service Worker/Container configuration
   - Supabase edge function secrets (`supabase secrets set RESEND_FROM_MARKETING="Patina <mail@mail.patina.cloud>"`)

## Reverse: collapsing back to a single domain

Unset `RESEND_FROM_MARKETING` and `RESEND_FROM_TRANSACTIONAL`; leave `RESEND_FROM` set. Both categories will use the same address.

## Verification

After cutover, send one of each category and inspect headers in Gmail (View → Show original):

- Transactional: From `hello@patina.cloud`, no `List-Unsubscribe` header
- Marketing: From `mail@mail.patina.cloud`, with `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`

`Received-SPF: pass` and `dkim=pass` should appear in both. If not, double-check the SPF / DKIM records in Cloudflare and re-verify in Resend.
