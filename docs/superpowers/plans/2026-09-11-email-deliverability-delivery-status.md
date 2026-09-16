# Email deliverability + Resend delivery status in the designer portal

Date: 2026-09-11 · Trigger: a studio invoice email to matt@kipcc.com bounced ("Generic Temporary Delivery Failure"); Resend Insights flagged the studio logo being served from `bkvcixdmuyejfzcijpdg.supabase.co`. The designer portal had no way to know the email never arrived.

Status: BUILD PLAN (merge to main, no deploy). Deploy checklist at the end is owed separately.

## Which surface, which studio moment, which stream, which promise

- Surface: The Document (designer portal) — invoice folio, Contract Room sent state, People invite rows.
- Studio moment: the studio has sent money-paper or a letter on its own name and needs to know it landed. A bounced invoice is silent lost revenue.
- Stream: subscription floor (reliability) and margin upside (invoices get paid only if delivered).
- Promise: "the studio won't notice Patina" — until the paper doesn't arrive. A quiet delivered/bounced word on the row is the minimum.

## Part 1 — Deliverability (edge functions, `supabase/functions`)

Findings (research 2026-09-11, verified against the code):
1. The only image in any Patina email is the studio logo, embedded as the raw Supabase Storage public URL. Every co-branded sender reaches it through `_shared/studio-identity.ts` → `resolveStudioIdentity()`; the shell `_shared/branded-email.ts` `renderBrandedShell()` renders the `<img>`.
2. No email carries a plain-text alternative. `sendCompliantEmail` supports `text` but no caller passes it.
3. Five functions bypass the compliance chokepoint and POST to Resend directly: `client-invite`, `review-requests`, `waitlist-notify`, `proposal-nudge`, `campaign-dispatch` (batch). They get no suppression check, no unsubscribe header, no `notification_log` row, and a bare `from` with no display name.
4. Client-facing letters set no `reply-to` (vendor-facing ones do).
5. Resend `tags` are never set, so bounces can't be segmented by template in Resend.
6. `api.patina.cloud` is the live `patina-edge-api` Worker, a transparent proxy whose compatibility allowlist already includes `/storage/v1/`. Designer-portal `next/image` remotePatterns already sanction `api.patina.cloud/storage/**`.

Decisions:
- D1 **Logo host**: rewrite the Supabase Storage public-object host to `api.patina.cloud` at email-render time only. New pure helper `_shared/email-assets.ts` `toEmailAssetUrl(url, { supabaseUrl, assetHost })` — replaces `https://<ref>.supabase.co/storage/v1/object/public/` with `https://api.patina.cloud/storage/v1/object/public/` (asset host from env `EMAIL_ASSET_HOST`, default `https://api.patina.cloud`); any other URL passes through unchanged. Applied inside `renderBrandedShell` for `studioLogoUrl` and at every other `<img src` built by an email builder under `supabase/functions` (implementer enumerates with grep). Stored `organizations.logo_url`, portals, iOS, PDFs untouched.
  - Fallback if the probe shows api.patina.cloud does NOT serve the object: same helper, but pointed at a new designer-portal route `app.patina.cloud/api/email-assets/studio-logo/[studioId]` that streams the object with `Cache-Control: public, max-age=86400`. (Decided after probe; see build log.)
- D2 **Plain-text part**: `prepareCompliantEmail` derives `text` from `html` when the caller passes none, via new `_shared/html-to-text.ts` `htmlToText(html)` (drop `<head>`, `<style>`, the hidden preheader div and MSO conditionals; `<a href>` → `label (url)`; block elements → newlines; `<br>` → newline; decode common entities; collapse blank runs to max two). Unit-tested. Every chokepoint caller gets multipart/alternative for free.
- D3 **Chokepoint everywhere**: `client-invite`, `review-requests`, `proposal-nudge`, `waitlist-notify` are moved onto `sendCompliantEmail`. Categories: client-invite → `transactional`; review-requests → `operational`; proposal-nudge → `operational`; waitlist-notify → `transactional`. `campaign-dispatch` (batch endpoint) stays as is — noted as follow-up. Implementer first re-checks each function on origin/main (client-invite shipped v44 on 2026-09-09 and may already differ from the research read).
- D4 **Reply-To** on client-facing letters where the designer's email is already loaded in the function (`invoice-send`, `invoice-reminders`, `proposal-send`, `client-invite`, `review-requests`): `replyTo` = the sending designer's email (or the studio identity's contact email when that is what the function has). Where neither is already loaded, skip and report — no new queries just for this.
- D5 **Tags**: `prepareCompliantEmail` sets Resend `tags` automatically: `category` and `template` (from `templateId`, sanitized to `[A-Za-z0-9_-]`), merged under any caller-supplied tags.
- D6 **Fonts and footer address**: left as-is. The Google Fonts `<link>` is a design-language choice (Fraunces in Apple Mail); the footer postal address is an ops setting (`EMAIL_BUSINESS_ADDRESS` secret), not code. Both listed as owed rulings.
- D7 The `packages/email` (Node/React) shells are out of scope this pass: they carry no studio logo and serve admin/marketing paths. Follow-up: give them the same `text` derivation.

## Part 2 — Delivery status in the designer portal

Findings:
1. `resend-webhook` matches `event.data.email_id` to `notification_log.provider_id` and flips `status` (`delivered/opened/clicked/bounced/complained`). It ignores `email.delivery_delayed`, and verification is skipped entirely when `RESEND_WEBHOOK_SECRET` is unset.
2. `invoice-send` gets `providerId`/`logId` back and throws them away; nothing links an invoice to its `notification_log` row except loose `metadata->>invoice_id`.
3. `proposal-send` persists `provider_id` on `proposal_send_dispatches` and mirrors it into `notification_log`, but the Contract Room polls `proposal_send_dispatches.state`, which the webhook never touches.
4. `notification_log` has no recipient, no delivered/bounced timestamps, no structured bounce reason, and designers can't read rows whose `user_id` is the client.
5. No hook, chip, or vocabulary for delivery state exists in the designer portal.

Decisions:
- D8 **Correlation columns** on `notification_log` (migration `00591_notification_log_delivery.sql`, minted against origin/main head `00590`): `ref_type text`, `ref_id uuid`, `recipient text`, `delivered_at timestamptz`, `bounced_at timestamptz`, `bounce_type text`, `bounce_reason text`, `delayed_at timestamptz`, `last_event text`, `last_event_at timestamptz`. Index `(ref_type, ref_id, created_at desc) WHERE channel = 'email'`. Backfill `ref_type/ref_id` from `metadata->>'invoice_id'` (→ `invoice`), `metadata->>'proposal_id'` / commercial-document ids the implementer finds in existing metadata. The `notification_status` enum is NOT extended; delivery delay is recorded in `delayed_at`/`last_event`, status stays `sent`.
- D9 **Read access for the studio**: new RLS SELECT policies on `notification_log`, one per ref_type, each an `EXISTS` subquery against the referenced table executed under the caller's own RLS (so visibility inherits from the invoice / commercial document / invitation / review the designer can already see). No SECURITY DEFINER RPC.
- D10 **Senders stamp the ref**: `sendCompliantEmail` takes `ref?: { type, id }` and writes `ref_type/ref_id/recipient`. `invoice-send` and `invoice-reminders` pass `{ type:'invoice', id }`; `client-invite` `{ type:'client_invitation', id }`; `review-requests` `{ type:'client_review', id }`; `proposal-send`'s dispatch mirror (`_sync_proposal_send_email_log`, SQL) sets `ref_type/ref_id` to the commercial document. `notification-dispatch` generic sends stay unstamped.
- D11 **Webhook**: handle `email.delivery_delayed` (`delayed_at`, `last_event`), `email.sent` (`last_event` only), write `delivered_at` / `bounced_at` / `bounce_type` / `bounce_reason` (from `data.bounce.{type,subType,message}` when present), always update `last_event/last_event_at`. Fail closed when `RESEND_WEBHOOK_SECRET` is unset (401). Existing profile-suppression behaviour unchanged.
- D12 **Hook**: `packages/supabase/src/hooks/use-email-delivery.ts` — `useEmailDelivery(refType, refIds)` selects the columns above where `channel='email'`, reduces to the latest row per `ref_id`, returns `{ byRef: Record<id, EmailDelivery> }` with a derived `state: 'sending'|'sent'|'delivered'|'delayed'|'bounced'|'complained'|'failed'|'suppressed'|'opened'`. Query key `['email-delivery', refType, sortedIds]`. `refetchInterval` 30s while any latest row is `sending`/`sent`/`delayed` and under 48h old, else off. No realtime this pass (pattern exists in `use-comms.ts`; add later if polling proves insufficient).
- D13 **Chip**: `apps/designer-portal/src/components/document/shared/delivery-word.tsx` — a quiet typographic word in the Document language (no shadows): `Sent`, `Delivered`, `Delayed`, `Bounced — didn't reach {recipient}` (error tone, reason on hover/title), `Marked as spam`, `Suppressed`, `Failed`. Renders nothing when there is no send row.
- D14 **Surfaces** (designer portal only): invoice folio (next to the invoice status once sent; replaces the transient post-send note after reload), invoice ledger/list rows (bounced only, as the same word), Contract Room sent state for commercial documents, People invite rows (where First Letter invitations render on origin/main). Comms-thread emails are out of scope (their sender path is a DB queue whose consumer wasn't located).
- D15 A bounce carries one action: "Fix the address in People" link where People is reachable; no automatic resend.

## Waves

- W1-DB (Sonnet): migration 00591 + `pnpm db:generate` + `supabase/tests` SQL asserts + backfill. Owns `supabase db reset` for the program.
- W1-Edge (Opus): Part 1 D1–D5 and Part 2 D10–D11 across `supabase/functions` (`_shared`, `resend-webhook`, `invoice-send`, `invoice-reminders`, `client-invite`, `review-requests`, `proposal-nudge`, `waitlist-notify`, `proposal-send` where needed). Deno tests.
- W2-Portal (Opus): D12–D15 after W1 merges. Gates: `@patina/supabase` type-check + vitest, designer-portal type-check + jest, admin-portal build.
- Adversarial review per wave in a separate context; fixes; integration verification; merge to main; push. **No deploy.**

## Owed to Kody after merge (deploy chain, not run)

1. `supabase db push` (00591) → `supabase functions deploy` for every importer of `_shared/send-email.ts`, `_shared/branded-email.ts`, `_shared/studio-identity.ts` (transitive set is ~20 functions; enumerate with grep at ship time) → `resend-webhook` with `--no-verify-jwt` → designer portal via `infra/deploy-portal.sh designer-portal`.
2. Confirm in Resend: webhook endpoint subscribed to `email.sent, email.delivered, email.delivery_delayed, email.bounced, email.complained, email.opened, email.clicked`; `RESEND_WEBHOOK_SECRET` set on Strata (the webhook now fails closed without it).
3. Rulings: keep Google Fonts `<link>`? set `EMAIL_BUSINESS_ADDRESS`? click/open tracking domain alignment in Resend.

## Build log (2026-09-11)

Branches: `email-deliverability/w1-db` (00591 + RLS + types), `email-deliverability/w1-edge` (edge functions + proxy Worker), `email-deliverability/w2-portal` (hook + delivery word + surfaces). Merged to `main` via `email-deliverability/integration`. NOT deployed.

Rulings made during build (amend D-numbers above):
- D8 amended: `notification_log.user_id` is now nullable so sends to recipients without a Patina account (the bounced-invoice case) are logged; `sendCompliantEmail` logs whenever `userId` OR `ref` is present.
- D9 amended: one studio-side policy (`notification_log_ref_studio_select`) using `is_studio_comember(<doc>.designer_id)`; the client keeps only the pre-existing owner-read policy. Anon lost INSERT/UPDATE/DELETE on `notification_log`; the 00041 service-role policies are now `TO service_role`.
- D10 amended: `ref` is stamped only on the outbound copy to the external recipient, never on studio-facing notices; backfills exclude rows addressed to the designer or any studio co-member.
- Proposal accept (Resend 2xx) now logs `sent`, not `delivered`; only the webhook writes `delivered`.
- D1 amended: exact-origin match only (no `*.supabase.co` wildcard); local stacks exempt unless `EMAIL_ASSET_HOST` is set; SVG logos are dropped from email in favour of the studio name; campaign images go through the same rewrite. `patina-edge-api` now passes upstream cache headers for `/storage/v1/object/public/` and strips `set-cookie`.
- D13 amended: `failed` renders nothing (ambiguous sends are never called "didn't send"); attention states carry a date; quiet ink is `--text-muted`.
- review-requests: `client_reviews` row is inserted as `queued` before the send and promoted to `sent`; suppressed clients are skipped at the candidate query.
- proposal-nudge returns 409 `email_suppressed`; the portal surfaces it on the send wall and finalize head.
- Found and fixed in passing: every `email.bounced` webhook was crashing on `.catch` of a PostgREST builder (no suppression ever ran); bounce type was read from a field Resend never sends; webhook now has a 5-minute replay window and constant-time signature compare.

Deploy checklist (owed; do in this order):
1. `supabase db push` (00591) — verify with `\d public.notification_log` on Strata: 10 new columns, `user_id` nullable, policy `notification_log_ref_studio_select`, constraints `notification_log_ref_type_chk` / `notification_log_ref_pair_chk`, anon has no write ACL.
2. Deploy every edge function importing `_shared/send-email.ts`, `_shared/branded-email.ts`, `_shared/client-letter.ts`, `_shared/email-assets.ts`, `_shared/html-to-text.ts`, `_shared/studio-identity.ts` (transitive; ~36 functions — enumerate with grep at ship time), plus `resend-webhook` with `--no-verify-jwt`.
3. Confirm `RESEND_WEBHOOK_SECRET` is set on Strata (the webhook now fails closed) and the Resend endpoint subscribes to `email.sent, email.delivered, email.delivery_delayed, email.bounced, email.complained, email.opened, email.clicked`.
4. `npx wrangler deploy --config infra/edge-api-worker/wrangler.jsonc --env production` (public-storage cache headers), then probe a studio logo URL on api.patina.cloud for `cache-control: public`.
5. `./infra/deploy-portal.sh designer-portal`; signed-in walk: invoice folio, ledger, receivables, send sheet, People letter line, reviews pending tab at 1440 and 390.
6. Rulings still open: keep the Google Fonts `<link>`; set `EMAIL_BUSINESS_ADDRESS`; Resend click/open tracking domain; letter-line per-row hook (N+1) batching; `purge_client_account` does not erase null-user rows by recipient email; the 86 KB PNG studio logo should be re-exported small.
