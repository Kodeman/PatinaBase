# G3 — Backend Reality

Role: name what the Strata/Cloudflare platform can serve today, and the exact delta where it can't.
Evidence: repo `supabase/migrations/*.sql`, `supabase/functions/*`, `services/orders/prisma/schema.prisma`,
local Postgres (`127.0.0.1:54322`), `supabase secrets list` (names only), `~/.blitz/bin/asc` (App Store Connect).
No prod SQL was reachable this session (§9) — no Supabase MCP tool loaded, no DB credential available to this
sandboxed agent. Everything under §9 is explicitly marked not-read.

---

## 1. Products

`products` (`supabase/migrations/00001_initial_schema.sql:29-45`), widened by five later migrations. Full
column set as of head:

| Group | Columns | Source |
|---|---|---|
| Core | `id, name, description, price_retail, price_trade (cents), dimensions jsonb, materials text[], images text[], vendor_id → vendors, captured_by, captured_at, quality_score, embedding vector(1536)` | `00001_initial_schema.sql:29-45` |
| Catalog/publication | `slug, brand, short_description, category text default 'decor', status text default 'draft' check(draft/in_review/published/deprecated), sku, tags text[], style_tags text[], seo_title, seo_description, published_at` | `00060_product_catalog_columns.sql:6-18` |
| Status vocabulary widened | `status` CHECK now `draft/in_review/published/deprecated/archived`, NOT NULL, default flipped to `'published'` | `00129_products_status_column.sql:33-43` |
| Retailer | added in `00011_add_retailer_id.sql` (retailer_id) | — |
| Color | `00015_product_colors.sql` | — |
| Three-layer catalog | `layer text check(personal/studio/catalog), owner_user_id, studio_id → organizations, promoted_from_id/at/by, vendor_contact jsonb, payment_terms, category, subcategory, usage_notes, lead_time_weeks, style_tags, material_tags, aesthete_vector vector(1536), commission_rate, patina_managed bool, catalog_equivalent_id, merged_into_id, deleted_at` | `00152_three_layer_catalog.sql:31-51` |
| Field-capture origin | `00232_products_field_capture_origin.sql` | — |
| Config foundation | `00403_product_configuration_foundation.sql` | — |

**Category vocabulary**: free-text `category` column (not an enum), seeded `categories` table
(`00060_product_catalog_columns.sql:38-70`) with `Sofa/Chair/Table/Bed/Storage/Lighting/…`. Local live values:
`chair, decor, lighting, sofa, stool, storage, table` (§8). No "maker location / provenance / story" columns on
`products` itself — those live on the joined `vendors` row (`vendor_id`) or on `editorial_stories`
(featured-product join, §2), not on the product.

**Images**: `products.images text[]` — a plain array column, **no separate `product_images` table** (grepped,
zero hits). No alt-text, no ordering metadata beyond array position, no per-image dimensions.

**Inventory / lead time / dimensions / materials / finish / maker**:
- `dimensions jsonb` (`{width,height,depth,unit}`), `materials text[]` — present, free-form.
- No inventory/stock-count column anywhere on `products`.
- `lead_time_weeks integer` exists but **only required (CHECK) for `layer='studio'`**
  (`00152_three_layer_catalog.sql:83-95`) — catalog-layer (the layer the client app reads) has no lead-time
  guarantee.
- "Finish" has no dedicated column; folded into `materials text[]` / `style_tags` / `usage_notes` free text.
- **No `manufacturers` table.** The maker relationship is `products.vendor_id → vendors(id)`
  (`00001_initial_schema.sql:38`, `vendors` created `00001_initial_schema.sql:1-6`: `name, contact_info,
  notes`). `get_recommendations` (below) sources `maker_name/maker_location/maker_story` from `vendors.name`,
  `vendors.made_in`, `vendors.brand_story` — so "maker story" content exists per-vendor, not per-product.

**Related tables found**: `product_styles`, `product_relations` (pairs_with/alternative/never_with),
`product_tags`, `collections` / `collection_products` (`00004_catalog_enhancements.sql:8-34`), `saved_items`
(`00055_saved_items.sql`), `proposal_boards` (`00179_proposal_boards.sql`), `rooms` / `room_features`
(`00019_roomplan_features.sql:12-133`, **no `room_items` table** — grepped, zero hits), `room_scans`
(`00014_portal_business_features.sql`, widened `00285_design_request_submit.sql`), `user_style_signals`
(`00019_roomplan_features.sql:133`), `client_style_profiles` (Aesthete engine, `00242+`).

**`get_recommendations` RPC** — frozen signature, live body is a **00246 shim over the Aesthete engine**, not
the original 00067 scorer:
```
get_recommendations(p_room_id uuid default null, p_category text default null,
                     p_limit int default 20, p_offset int default 0)
RETURNS TABLE(id, name, price_cents, match_score, maker_name, maker_location, maker_story,
              image_url, usdz_url, style_tags, material_tags, badges, category, tier)
```
Signature + RETURNS shape frozen at `00067_ios_api_endpoints.sql:247-268`; **head body is
`00246_aesthete_quiz_bridge.sql:192+`**, which resolves the caller's `client_style_profiles` (or bridges legacy
`user_style_signals` into a `source='derived'` profile, or falls back to a shared neutral profile for
anon/profile-less callers), calls `get_aesthete_matches`, and maps its score to the 0–100 int the client
expects. The 00067 body's `random()*5` jitter is gone (`00246_aesthete_quiz_bridge.sql:51` comment). GRANTed to
`authenticated` **and `anon`** (`00067_ios_api_endpoints.sql:419-420` — 00246 does not narrow this).
`usdz_url` is hardcoded `NULL` — **no AR asset URL exists on any product row today.**

---

## 2. Stories

Client fetch: `EditorialStoriesAPIClient.fetchTodaysStory()`
(`apps/mobile/Patina/Patina/Core/Network/EditorialStoriesAPIClient.swift:71-84`) — a plain PostgREST GET on
`editorial_stories`, `order=sort_order.desc,published_at.desc`, `limit=1`. **No per-user, per-day, or
randomized selection** — every signed-in and anon caller sees the exact same row (the single highest
`sort_order`, tie-broken by newest `published_at`) until an editor either raises another row's `sort_order` or
publishes a new one. "Today's story" is a label, not a rotation mechanism.

Server table: `editorial_stories` (`00143_editorial_stories.sql:17-45`) — `tag, title, subtitle, body_md,
read_minutes, hero_image_url, hero_gradient_key, maker_name/location/avatar_url/avatar_gradient_key,
featured_product_id → products, audience_tags text[], published_at, expires_at, sort_order`. Public-read RLS
for `published_at <= now()` (`00143_editorial_stories.sql:80-97`); admin-only write
(`00143_editorial_stories.sql:110-115`, gated on a `roles.domain='admin'` row).

**How many exist**: exactly the **3 seeded rows** from the migration itself
(`00143_editorial_stories.sql:138-186`, `ON CONFLICT (id) DO NOTHING`) — confirmed live in local Postgres
(§8: `count(*) = 3`). No admin-portal or CMS write path was found in this pass (not exhaustively searched —
flag for a follow-up grep of the admin portal if a direction depends on editorial cadence). `expires_at` exists
on the table but nothing in the fetch query filters on it — an expired-but-highest-sort_order row would still
be served as "today's story."

---

## 3. Leads / design requests

`leads` (`00014_portal_business_features.sql:11-42`): `homeowner_id, designer_id → profiles`, `project_type`
(`full_room/consultation/single_piece/staging`), `project_description, budget_range, timeline, location_*,
match_score, match_reasons jsonb, status text default 'new'` (`new/viewed/contacted/accepted/declined/expired`),
`response_deadline, contacted_at/accepted_at/declined_at`.

`client_request_id` (idempotency key, `00285_design_request_submit.sql:69-79`) — unique per
`(homeowner_id, client_request_id)`; a retried iOS submit replays the same lead instead of duplicating. Junction
table `lead_room_scans` (`00285_design_request_submit.sql:26-40`) carries the full scan set per request
(`leads` itself keeps one primary `room_scan_id`); RLS is participant-SELECT-only, writes are RPC-only
(`00285_design_request_submit.sql:52-60`).

**Claim RPC**: `claim_design_request(p_lead_id uuid)` — defined `00286_design_request_pool_claim.sql:75`,
**redefined whole-body in `00289_design_request_client_status_notifications.sql:29+`** (delta: both
notification_log inserts now carry `entity_type='design_request', entity_id=<lead id>` so the client's
`NotificationRouter` can deep-link — no logic change otherwise). `00289` is the true head; anyone editing
`claim_design_request` again must diff against `00289`, not `00286`.

**Status trigger**: `notify_design_request_status_change()` — `AFTER UPDATE OF status ON leads`, SECURITY
DEFINER, fires only when `client_request_id IS NOT NULL AND homeowner_id IS NOT NULL AND status IS DISTINCT
FROM OLD.status AND NEW.status IN ('accepted','declined','expired')`
(`00289_design_request_client_status_notifications.sql:14-24`) — exception-wrapped, never unwinds the status
update on notification failure.

**What the client can read under RLS**: `"Homeowners can view their leads"`
(`00014_portal_business_features.sql:58`, `homeowner_id = auth.uid()`); `"Homeowners can create leads"`
(`00014_portal_business_features.sql:64`). No homeowner UPDATE/DELETE policy — status changes flow only through
RPCs/triggers on the designer/service side.

---

## 4. Money rail

**`sign_proposal`** — frozen client-facing signature is `sign_proposal(p_proposal_id uuid, p_signed_name text)`,
**redefined in `00400_proposal_signature_authority.sql:408-437`** (this supersedes the earlier
`00210/00387/00390/00399` bodies — 00400 is the anchored-grep head). It resolves `auth.uid()` internally,
delegates to `_sign_proposal_authorized_00400` (audit IP / activation / project-start-date are server-owned,
not client-suppliable), and is `REVOKE ALL … GRANT EXECUTE … TO authenticated` only
(`00400_proposal_signature_authority.sql:434-437`). Matches iOS `ProposalsAPIClient` / `ProposalSignSheet`
usage.

**Invoices** (`invoices`, `00178_invoices_v1.sql:29-57`): `project_id, designer_id, client_id, invoice_number,
status default 'draft'` (`draft/sent/partially_paid/paid/void`), `issue_date, due_date, payment_terms_days,
currency, subtotal_cents, tax_rate, tax_cents, total_cents, amount_paid_cents, stripe_checkout_session_id,
sent_at, paid_at, voided_at, reminder_count`. `total_cents` falls back to `budget_cents` for pre-00139 rows
per `supabase/AGENTS.md` (patina-stripe-payments skill note) — a new money summary must special-case both this
fallback and `refunded` exclusion.

**`create-checkout-session`** (`supabase/functions/create-checkout-session/index.ts:1-50`) dispatches on
**three** payable types today: `{ invoiceId }`, `{ po_payment_id }`, and **`{ direct_order_id }`** — a client
"buy now" order for a Patina-managed product. This third type is a fully-built backend surface with **no iOS
client code anywhere** (see §5 — this is the load-bearing finding for any "direct orders" direction). iOS's own
usage is invoice-only: `SFSafariViewController` hand-off + 3s/60s poll-on-dismiss
(`apps/mobile/Patina/Patina/Features/Invoices/Views/SafariView.swift:1-9`,
`InvoicesViewModel.swift:6-83` — matches C10 exactly, no scope drift).

**`stripe-webhook`** (`supabase/functions/stripe-webhook/index.ts`, ~1720 lines): raw-body → signature verify →
`stripe_webhook_events` idempotency claim → guarded status transition → release-claim-on-error. Handles
`checkout.session.completed/async_payment_succeeded/async_payment_failed`, `payment_intent.succeeded/failed`,
`charge.refunded` (full refund flips state via 00277 trigger; partial only logs+notifies). Resolves the payable
row by session id → PI id → `metadata.<type>_id` latest-pending, across `invoice_payments`, `po_payments`, AND
`direct_orders` (`stripe-webhook/index.ts:815-818` dispatch; `:1056-1387` direct_order settle branch — receipt
email, ops email, failure email, `direct_order_payment_failed` notification, all built).

**`client_decisions`**: not client-keyed directly — joins via `designer_client_id → designer_clients(id)`,
`designer_clients.client_id → profiles(id)`. A query joining straight on a hypothetical `client_id` column on
`client_decisions` will fail (verified against local schema, §8).

**Stripe configuration state**, per `supabase secrets list` (names + `updated_at` only — the CLI returns a
digest, never a plaintext value, so no secret content was read or is reported):
`STRIPE_SECRET_KEY` (updated 2026-07-08), `STRIPE_WEBHOOK_SECRET` (updated 2026-08-18) — **both names are
present in Strata's secret store**. Per `patina-stripe-payments` skill and memory (`project_stripe_integration.md`
— "TWO-ACCOUNT MISMATCH, all test-mode"), **name-presence does not prove live mode**: `secrets list` cannot
distinguish a `sk_test_…` from `sk_live_…` value. Treat Stripe as **configured but unverified-live**; do not
build a direction that assumes LIVE keys are armed without Kody confirming.
`services/orders`' own Stripe module remains intentionally dormant (`STRIPE_SECRET_KEY` unset there →
`assertStripeConfigured()` 503 `stripe_not_configured`, per skill) — irrelevant to any client-facing payment
work, which lives entirely in the edge-function rail above.

**Known open hole** (flagged per skill requirement): `po_payments.state` can be self-marked `'paid'` by the
owning designer's own authenticated session (RLS `FOR ALL` on `00148`'s policy) — not a client-app-facing risk
directly, but relevant if any direction lets a client see a designer-sourced PO's payment state as proof of
funds received.

---

## 5. Orders

**`services/orders` (Prisma, `svc_orders` schema)** — `services/orders/prisma/schema.prisma:104-170` — has a
full `Order` model with `status` (`created/paid/processing/fulfilled/closed/refunded/canceled`),
`paymentStatus` (`pending/authorized/captured/refunded/failed/canceled/partially_refunded`),
`fulfillmentStatus` (`unfulfilled/partial/fulfilled`), `Shipment`, `Payment`, `Refund`, `Address` models, Stripe
`paymentIntentId`/`checkoutSessionId` columns. **This is dormant** — the service's Stripe module is unset in
every environment (`patina-stripe-payments` skill, verified) and no client or portal code creates an `Order`
row through it. Do not route new order work through this service (also forbidden generally by C13 — no new
NestJS services, and this one is parked, not "the" order rail).

**The live client-facing order rail is `public.direct_orders`** (`00276_direct_orders.sql:41-63`) — already
built end-to-end on the Supabase side:
- Table: `client_id → profiles (RESTRICT)`, `product_id → products`, money **snapshotted at create time**
  (`product_name, unit_price_cents, amount_cents` — later product edits never move an existing order),
  `status default 'pending_payment'` CHECK `(pending_payment, paid, canceled)` — **no shipped/delivered/
  fulfillment states**, `stripe_checkout_session_id/payment_intent_id`, `shipping jsonb` (full Stripe
  `shipping_details` + email, stamped on settle).
- RLS: client SELECT-own only (`00276_direct_orders.sql:91-95`); no client INSERT/UPDATE — writes are
  RPC/service-role only.
- `create_direct_order(p_product_id, p_quantity)` — SECURITY DEFINER, validates the product is buyable
  (not soft-deleted, `patina_managed` or catalog-vendor-sold, positive price), snapshots name/price, clamps
  quantity, inserts `pending_payment`.
- `create-checkout-session`'s `direct_order_id` branch and `stripe-webhook`'s settle branch are both live
  (§4).

**What a homeowner-initiated "buy now" order needs today**: **nothing new on the backend for
create→pay→receipt.** The entire chain (RPC, checkout session, webhook settle, receipt/ops emails) exists and
is wired to Stripe. **The delta is 100% client-side** (a product detail "Buy now" button, calling
`create_direct_order` then `create-checkout-session` with `direct_order_id`, then the same
`SFSafariViewController` + poll pattern invoices already use) **plus** one small backend gap if a direction
wants post-purchase order tracking: `direct_orders.status` has no fulfillment/shipping states beyond
`paid` — the smallest compliant addition is a migration adding a `fulfillment_status` column (mirroring
`services/orders`' vocabulary: `unfulfilled/shipped/delivered`) + a designer-portal or admin write surface,
not a new service (C13). No iOS code references `direct_order`, `DirectOrder`, `create_direct_order`, or "buy
now" anywhere (grepped, zero hits) — confirming this is genuinely unbuilt on the client, not merely unused.

---

## 6. Notifications + push

**In-app**: `notification_log` (`00041_notification_log.sql`) — the single chokepoint every `sendCompliantEmail`
call and every in-app notify writes through (per `patina-prod-ops` skill); INSERT policy is service-role-only
(`auth.uid() IS NULL`), which is why `00289`'s trigger needs SECURITY DEFINER to write a homeowner-facing row
from a designer's own authenticated UPDATE.

**Device tokens**: `device_push_tokens` (`00335_device_push_tokens.sql:22-30`) — `user_id → auth.users, token
text UNIQUE (global), platform default 'ios', environment text CHECK(sandbox/production)`. `environment` is
captured **per token at registration**, never inferred from build config — today's Release signing is Apple
Development, so expect `sandbox` tokens until a true distribution archive ships
(`00335_device_push_tokens.sql:8-12`). RLS: owner-only ALL; `apns-send` reads via service_role.

**APNs send — this is NOT a stub; it is a complete implementation** (correcting/sharpening canon C14 for this
report): `supabase/functions/apns-send/index.ts` + `core.ts` — service-role-invoked only, ES256 provider-JWT
signing via `jose` (cached ~40 min), **per-token host selection** (`api.push.apple.com` vs
`api.sandbox.push.apple.com`, never inferred — `core.ts:46-51`), dead-token cleanup on 410/BadDeviceToken,
`notification_log` status update on send. It fails soft (`{skipped:'apns_not_configured'}`, HTTP 200) only
when `APNS_*` secrets are absent (`apns-send/index.ts:17-20`) — and **`supabase secrets list` shows
`APNS_AUTH_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_TOPIC` all present in Strata**, updated
**2026-07-16**. Callers already wired: `accept_design_request` (`00330`), `ceremony_complete` (`00331`),
`refresh_offered_slots` (`00334`). iOS-side registration is also fully built
(`PushTokenService.swift`, `AppDelegate.swift`, `NotificationRouter.swift`, `DecisionPushHandler.swift`).
**Net: push send is provisioned and wired for three specific triggers today, not a stub awaiting a key.**
What's still unverified in this pass: whether a *real device* has completed the round trip end-to-end in prod
(memory: "Arrival Arc" flagged kody-only, device walk still owed) — that's a walk/QA gap, not a backend gap.
Any new "push earns X" surface needs a new `apns-send` call site (cheap: another SQL RPC → `invoke_edge_function`
→ `apns-send`), not new infrastructure.

**Email templates reaching homeowners**: `_shared/send-email.ts` chokepoint (suppression check, List-Unsubscribe
injection, Resend send, `notification_log` write — per `patina-prod-ops` skill). Direct-order receipt/failure
emails and design-request emails are homeowner-facing today (`stripe-webhook` direct_order branch, `00042`
lead-notification triggers per `00285`'s header comment).

**SMS rail**: Twilio secrets (`TWILIO_ACCOUNT_SID/API_KEY_SID/API_KEY_SECRET/AUTH_TOKEN/FROM_NUMBER`,
`SMS_CONVERSATION_NUMBER`, `SMS_INBOUND_PUBLIC_URL`, `SMS_STATUS_CALLBACK_URL`) all present in Strata secrets
(dated 2026-08-08/12). Memory (`project_sms_enablement_live_2026_08_12.md`) says 10DLC is live for Field/
designer-side SMS — this program is **not** the client iOS app's concern (SMS rail is designer/trades-facing
per `sms-inbound`/`field-daily`); flag if a client direction wants SMS, since that would be new client-facing
scope, not an extension of the existing rail.

---

## 7. Accounts

`profiles` (`00013_profiles_table.sql:12-39`) extends `auth.users`: `email, display_name, avatar_url, role text
default 'designer'` (`designer/homeowner/admin` — free text, not an enum), designer-specific fields
(`business_name, bio, website, phone`), `city/state/zip`, `is_verified/verified_at`. RLS: readable by everyone,
writable by self only.

**No household / multi-member / invite concept for clients** — grepped `CREATE TABLE.*household` and
`CREATE TABLE.*family_member` across all 487 migrations: zero hits. A "invite a partner to co-manage this
project" direction is a clean-sheet backend addition: new junction table + RLS, no existing primitive to
extend.

**Sign in with Apple**: iOS uses the **native ID-token flow**
(`AuthService.signInWithApple(credential:)` →
`supabase.auth.signInWithIdToken(...)`, `apps/mobile/Patina/Patina/Services/Auth/AuthService.swift:256-280`),
**not** the OAuth-redirect provider. `supabase/config.toml`'s `[auth.external.apple] enabled = false`
(`config.toml:280`) governs the *redirect* flow only and is correctly irrelevant here — do not flag it as a
misconfiguration.

**OTP**: `[auth.email] otp_length = 6, otp_expiry = 3600` (`config.toml:181-183`); `[auth.sms] enable_signup =
false` (SMS auth is off; the Field/SMS rail in §6 is a separate notification channel, not phone auth).
Branded auth email templates exist for magic_link/confirmation/recovery/email_change/invite/reauthentication
(`config.toml:196-217`), mirrored to Strata per `scripts/emails/deploy-auth-templates.mjs`.

---

## 8. LOCAL counts (Postgres `127.0.0.1:54322`, verified live)

**Products** (21 total):

| category | status | count |
|---|---|---|
| chair | published | 4 |
| decor | draft | 1 |
| decor | published | 3 |
| lighting | in_review | 1 |
| lighting | published | 3 |
| sofa | published | 2 |
| stool | published | 1 |
| storage | in_review | 2 |
| table | draft | 1 |
| table | published | 3 |

With ≥1 image: **17 of 21**. `vendors` (the maker/manufacturer table): **104 rows**. `editorial_stories`:
**3 rows** (matches the seed exactly — §2). `rooms`: **0 rows** — no local account has a room scan.

**Client/homeowner accounts** (`profiles.role='homeowner'`, 9 total) and their data richness:

| email | leads | lead status | projects | proposals | proposals signed | decisions |
|---|---|---|---|---|---|---|
| `client@patina.dev` | 0 | — | **3** | **4** | 1 | **6** |
| `james.okafor@example.com` | 1 | `accepted` (designer matched) | 0 | 0 | 0 | 0 |
| `marcus.wright@example.com` | 1 | `viewed` | 0 | 0 | 0 | 0 |
| `elena.ruiz@example.com` | 1 | `contacted` | 0 | 0 | 0 | 0 |
| `sarah.chen@example.com` | 1 | `new` | 0 | 0 | 0 | 0 |
| `lily.tanaka@example.com` | 1 | `new` | 0 | 0 | 0 | 0 |
| `david.nielsen@example.com` | 1 | `new` | 0 | 0 | 0 | 0 |
| `arrival-arc-a-…@e2e.patina.test` | 1 | `new`, no designer | 0 | 0 | 0 | 0 |
| `arrival-arc-b-…@e2e.patina.test` | 1 | `accepted` | 0 | 0 | 0 | 0 |

**Invoices and saved_items were 0 across every account** — no local account exercises the invoice-payment or
Saved surfaces; a direction author who needs to *see* those screens will need to seed data first, not assume a
walk account already carries it.

**Two best accounts for a signed-in walk**, per the app's own `EngagementTier` resolver
(`EngagementTier.swift:33-40` — tier is derived from leads + project/proposal/invoice/decision existence, never
stored):
- **`client@patina.dev` — activeProject tier.** 3 projects, 4 proposals (1 signed), 6 decisions, 0 invoices/
  saved items. The only local account that reaches the full project-engagement surface (Your Studio /
  Proposals / Decisions). It has **no rooms** and **no invoices**, so an invoice-payment or room-scan walk on
  this account will hit empty states, not real content.
- **`james.okafor@example.com` — engaged tier.** Lead `status='accepted'` with a designer already matched, but
  0 projects/proposals — exactly the "designer relationship exists, project doesn't yet" state
  `EngagementTier.engaged` is defined around (`EngagementTier.swift:35-37`). Good for walking the pre-project
  Studio-hub-unlock moment.
- No local account represents `discovering` tier with a *live* engaged designer AND a room scan simultaneously
  — every account is either bare-`new` or has 0 rooms.

**Sign-in**: all local homeowner accounts sign in via passwordless OTP (email). Local mail UI (Inbucket) is up
and its API responds correctly: root `GET http://127.0.0.1:54324/` → `200`; `GET
/api/v1/mailbox/<empty-local-part>` → `404` (Inbucket's correct response for a mailbox with no messages yet,
not an error) — verified via curl. An actual OTP send was not triggered (would need the anon key, which lives
in a `.env.local` this sandboxed agent cannot read); the API's live 200/404 responses are sufficient to confirm
the mail UI itself is reachable and functioning for a walk.

---

## 9. PROD read-only counts (Strata) — not read

No Supabase MCP tool (`execute_sql`/`get_logs`/`list_migrations`) was present in this session's toolset (checked
via `ToolSearch`), and the Supabase CLI has no query subcommand that runs read-only SQL against a linked remote
project without a database password — `supabase secrets list` was reachable (§4/§6, names + digests only, per
the CLI's own behavior of never returning plaintext), but there is no equivalent read path for table rows. Every
item below is **not read — no Supabase MCP tool in this session and no credentialed direct-DB path available to
this sandboxed agent**:
- products published by category, with images
- stories count
- leads with `client_request_id`
- client-role account count
- proposals count
- invoices count

A future pass with the Supabase MCP server loaded (or a Kody-supplied read-only prod connection) can fill this
section directly against the same queries used in §8.

---

## 10. Usage data

No PostHog MCP query tool was available in this session — only
`mcp__plugin_posthog_posthog__authenticate`/`complete_authentication` were loadable, and completing that OAuth
flow requires interactive user action this review pass didn't have. **No usage data was available to this
review** — the PostHog tools present required an authentication handshake this subagent could not complete
without the user in the loop.

For a future pass: the app's analytics events would come from
`apps/mobile/Patina/Patina/Services/Analytics/*` (not read this pass — out of the brief's file list beyond
citing the expected location) plus PostHog's autocaptured `$app_opened`; scope to those before querying.

---

## 11. App Store state

`~/.blitz/bin/asc apps list` (read-only, required disabling the command sandbox once — the default sandbox's TLS
interception broke the Apple API's certificate verification; the raw network call itself was read-only) returned
**2 apps** on the account:

| App | Bundle ID | ASC App ID |
|---|---|---|
| Patina Design (**the client app under review**) | `cloud.patina.app` | `6762007888` |
| Patina Field | `cloud.patina.field` | `6805156812` |

`asc builds list --app 6762007888`: **1 build total** — version `2`, uploaded 2026-05-12, `processingState:
VALID`, but `expired: true` (expiration 2026-08-10, >90 days old per Apple's TestFlight retention). **There is
no current, installable TestFlight build for the client app right now** — any direction that assumes "just
TestFlight it" needs a fresh archive/upload first, not just a submission.

---

## 12. Delta ledger

| Backend need | State | Smallest compliant delta |
|---|---|---|
| Direct orders (client buy-now purchase, pay) | **Exists** — table, RPC, checkout dispatch, webhook settle, receipt/failure emails all live (`00276`, §5) | None — client-side only: a "Buy now" screen calling `create_direct_order` → `create-checkout-session{direct_order_id}` → existing `SFSafariViewController`+poll pattern |
| Order status beyond "paid" (fulfillment/shipping/tracking) | **Missing** — `direct_orders.status` CHECK is `pending_payment/paid/canceled` only | 1 migration: add `fulfillment_status text` (+ optional `shipped_at/delivered_at`, `tracking_number`) to `direct_orders`; a designer/admin-portal or edge-function write path to advance it. No new NestJS service (C13) — `services/orders`' richer vocabulary is dormant/parked, don't resurrect it for this |
| Push send (APNs) | **Exists and provisioned** — `apns-send` fully built, `device_push_tokens` live, `APNS_*` secrets present in Strata since 2026-07-16 (§6) | None for the 3 wired triggers (`accept_design_request`, `ceremony_complete`, `refresh_offered_slots`). A new "push earns X" surface = 1 new RPC call site invoking `apns-send` via `invoke_edge_function` — cheap |
| Device tokens | **Exists** — `device_push_tokens` (00335), owner-only RLS, iOS registration wired | None |
| Household / multi-member client invites | **Missing** — zero hits for household/family tables | New: `household_members` (or similar) junction + RLS, invite-accept RPC. No existing primitive to extend |
| "New since last visit" | **Not directly assessed this pass** — no dedicated table found in the grep sweep run; `rooms.has_active_emergence`/`emergence_count`/`last_emergence_at` exist as an emergence-specific signal, not a general one | Needs its own investigation before scoping — flag as open, don't assume either way |
| Story rotation (per-user or per-day variety) | **Missing** — `fetchTodaysStory` always serves the single highest-`sort_order` row (§2); only 3 rows exist total | Cheapest: editorial ops publishes more rows / rotates `sort_order` manually (zero backend change). A true per-day algorithm needs a new RPC (e.g. deterministic per-user-per-day pick) — scope only if a direction needs it |
| Maker/manufacturer pages | **Partial** — `vendors` table carries `name, made_in, brand_story` and is already joined by `get_recommendations`; no client-facing "maker profile" screen or RPC exists, and there's no `manufacturers` table (it's `vendors`) | A read-only RPC or PostgREST view over `vendors` + its products; no new table needed unless richer maker content (photos, multiple locations) is wanted |
| Product Q&A | **Missing** — no table found | New: `product_questions`/`product_answers` tables + RLS. Genuinely greenfield |
| AR asset (usdz) per product | **Missing** — `get_recommendations` hardcodes `usdz_url` NULL; no column found on `products` for it | New: `products.usdz_url` column (or a join table if multiple assets per product) + a capture/upload path — out of scope for a pure backend delta, needs an asset pipeline decision |

---

**Key correction to canon for the direction authors**: C14 ("APNs push send is a backend stub") is stronger
than what the code shows — push send is a complete, secret-provisioned implementation for its three current
trigger points (§6). Treat "add a push trigger" as cheap; treat "prove it reaches a real device in prod" as the
actual open item (a walk, not a build).

---

## Correction — 2026-08-26 (G5 lane, `17-gap-fills.md`)

Four items in this file are superseded or completed by `research/17-gap-fills.md`. Nothing else here
changed.

1. **§6 push callers: three → five.** `apns-send` has five callers, not three. Beyond
   `accept_design_request` (00330), `ceremony_complete` (00331) and `refresh_offered_slots` (00334),
   two edge functions call it over HTTP: `fulfillment-notify/index.ts:42` and
   `site-request-dispatch/index.ts:225`. **The conclusion is unchanged and now proven exhaustively:
   no push caller touches `invoices`, `proposals`, `decisions`, or `direct_orders`.** The new detail
   that moves T8: `fulfillment-notify` pushes to a homeowner's device on
   `confirmed / in_production / shipped / delivered / eta_change / substitution`
   (`_shared/fulfillment-templates.ts:31-37`) — but only when an **admin operator presses send**, and
   only for `fulfillment_orders` (the designer-sourced BOH rail), never `direct_orders`.
   See `17-gap-fills.md` §G1.

2. **§5 `direct_orders`, conclusion now stated:** a client "buy now" order **credits the designer
   nothing** — no commission, no `designer_earnings` row, no project link, no FF&E line. The schema
   dump in this section already implied it; `00301_marketplace_vitals.sql:37-40` says it outright
   ("No designer attribution (client_id is the buyer)"), and the only `designer_earnings` credit path
   (`00277_refund_reconciliation.sql:183-208`) reads `invoice_payments`, never `direct_orders`.
   See `17-gap-fills.md` §G3.

3. **§8 OTP "never exercised" → exercised and PASSING.** `POST /auth/v1/otp` → Mailpit delivery →
   `POST /auth/v1/verify {type:"email"}` returned `200` with a live session for `client@patina.dev`
   on 2026-08-26. **Caveat that blocks a human walk:** the delivered mail is GoTrue's built-in
   link-only fallback and carries **no 6-digit code** — the configured template URL
   (`…kong:8088/email/magic_link.html`) returns `404`, so `supabase/templates/magic-link.html:65`'s
   code box never renders locally. This is a local-environment defect, **not** an app finding.
   Walkers should tap the magic link (it redirects to :3000, the designer portal) or restart the
   stack. See `17-gap-fills.md` §G6.

4. **§8 "no account has an invoice" → false.** `client@patina.dev` now carries one open payable
   invoice, seeded locally: **`INV-2026-0142`**, `id e7000000-0000-0000-0000-00000000d101`, `sent`,
   $4,250.00 unpaid, due 2026-09-01, on project "Aspen Loft Refresh", 2 line items — verified visible
   under the client RLS predicate. The pre-existing `B3-WALK-TEMP-0001` sits on a project this
   account does not own and stays invisible to it. See `17-gap-fills.md` §G7.

Also worth knowing before trusting any local-stack claim in this file: the running Supabase stack was
booted from `/Users/kody/Code/patina-merged/.codex/worktrees/agent` (per `supabase_studio_supabase`'s
env), a path that no longer exists — it does not necessarily reflect `main`'s `supabase/` tree.
