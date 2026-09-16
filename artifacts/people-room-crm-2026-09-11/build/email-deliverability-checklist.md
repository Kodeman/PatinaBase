Source: docs/superpowers/plans/2026-09-11-email-deliverability-delivery-status.md

## Owed to Kody after merge (deploy chain, not run)

1. `supabase db push` (00591) → `supabase functions deploy` for every importer of `_shared/send-email.ts`, `_shared/branded-email.ts`, `_shared/studio-identity.ts` (transitive set is ~20 functions; enumerate with grep at ship time) → `resend-webhook` with `--no-verify-jwt` → designer portal via `infra/deploy-portal.sh designer-portal`.
2. Confirm in Resend: webhook endpoint subscribed to `email.sent, email.delivered, email.delivery_delayed, email.bounced, email.complained, email.opened, email.clicked`; `RESEND_WEBHOOK_SECRET` set on Strata (the webhook now fails closed without it).
3. Rulings: keep Google Fonts `<link>`? set `EMAIL_BUSINESS_ADDRESS`? click/open tracking domain alignment in Resend.
