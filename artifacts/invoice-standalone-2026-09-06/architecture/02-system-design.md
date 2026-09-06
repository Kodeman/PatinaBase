# The Invoice, Standing Alone — system design

T2b · v2 · after T3 review · 2026-09-06 · Architect (Opus). Every claim below was re-opened against the file it cites.
Scope: `/pay/[token]` — a public, account-less invoice page with guest checkout. Rulings K1–K3 fixed; T4's rulings on the 49 T3 findings are binding and folded in throughout.

---

## 0 · Corrections

### 0.1 Corrections to the blueprint (v1's table, retained)

21 corrections stand; T3 re-opened 20 of 21 and confirmed them. Abbreviated here — the load-bearing ones:

| # | Blueprint claim | What the code says | Consequence |
|---|---|---|---|
| C1 | `invoice-checkout-core.ts` is shared | Private to one function: `create-checkout-session/invoice-checkout-core.ts` (287 lines); zero `_shared` importers | The lift is a real move + import rewrite; the test moves with it |
| C3 | return URLs at `create-checkout-session/index.ts:288-300` | `:303-314`; per-session wrap at `:1159-1160` | Two edit sites |
| C4 | the payer helper is reusable | `ensureStripeCustomer(admin, stripe, caller)` (`:756-823`) keys on `caller.id`; `startInvoiceCheckout` passes `p_payer_id: caller.id` (`:1070`) | Must re-parameterise on an explicit payer id |
| C5 | `has_payer=false` is rare | False. `invoices.client_id` nullable (`00178:33`), `projects.client_id` nullable, and a rostered-never-signed-up household has **no `profiles` row**: `00018:2-5` drops `designer_clients.client_id NOT NULL` and adds `client_email`; `profiles.id PRIMARY KEY REFERENCES auth.users(id)` (`00013:13`) | The link-payer path (§2.4) |
| C6 | `can_manage_invoice` at `00397:1265` | `:1251-1263`; `:1265` is the REVOKE | Citation |
| C8/C9 | `resolve_studio_identity(project_id, …)` | `(p_project_id, p_designer_id, p_studio_id)` all `DEFAULT NULL`, `00571:1318`; 2-arg dropped `00571:1316`; `anon` granted `00571:1414` | Call by name, all three |
| C10 | `00429:1908-1911` is an anon grant | The opposite — REVOKE from anon, GRANT to authenticated + service_role | It argues *against* anon |
| C17 | `/invoices/<id>/print` 404s | It renders (391 lines) and `retired-routes.ts:92-97,146-149` lets it through deliberately | Nothing to fix; the question is whether to retire it (§6, W3b) |
| C18 | rate-limit binding under `unsafe.bindings` | Workers rate limiting GA 2025-09-19; wrangler 4 schema exposes top-level **`ratelimits`**: `{name, namespace_id, simple:{limit,period}}` | Use `ratelimits` |
| C19 | `deploy-portal.sh client-portal` | `case` accepts `client\|designer\|admin\|manufacturer` (`:26-32`) | `./infra/deploy-portal.sh client` |
| C20 | one allowlist to widen | Four (see 0.2): `middleware.ts:153-162`, `app-chrome.tsx` `PUBLIC_PREFIXES`, `posthog.ts:83` `HEX_BEARER_IN_URL`, `next.config.js:19-36` next-pwa | Blocking; the analytics one ships the raw token to PostHog |
| C21 | deploy order | patina-deploy's house order is migrations → functions → services → portals | Reasoned deviation, §12 |

### 0.2 Corrections to v1, from the T3 review

| From | v1 said | Correct | Fixed in |
|---|---|---|---|
| S7 | AASA paths at `route.ts:23` | `grep -n "paths:"` gives `:12` (Field) and **`:40`** (the client app's four money paths) | §6, §8 |
| M2/M5 | `stripe-webhook` is a *letters-only* edit | It also owns `invoice-checkout-integrity.ts` (263 lines, imported only by `index.ts` and its test) and `resolveRecipient` (`:319-349`) | §5 |
| M3 | "one active attempt per invoice across both rails" sold as a safety property | `claim_invoice_checkout_attempt` RAISEs `invoice_checkout_attempt_payer_mismatch` at `00428:294-297`, **above** the supersede branch at `:302-330`, and nothing in 573 migrations sweeps a stale attempt | §2.6, §2.7 |
| M4 | "nothing else about `invoice_checkout_attempts` moves" | `finalize_invoice_checkout_attempt` (`00428:414-419`, assertion `:441-443`, `recorded_by` invariant `:461`) and `recover_invoice_checkout_session_evidence` (`:505-510`, `:532-534`, `:553`) both degenerate to NULL-vs-NULL on a link attempt | §2.5 |
| S2 | the limiter protects the token surface | It was specified only in `invoice-link.ts`; `state` is a cheaper, uncounted oracle | §6, §10 |

### 0.3 Corrections to the T3 review

Two, both verified directly:

| # | T3 said | What the code says | Consequence |
|---|---|---|---|
| R1 | **S1** — every `/pay/<token>` response "is stored in the visitor's browser for 30 days" by next-pwa's `NetworkFirst` catch-all | The catch-all is real (`next.config.js:19-36`), but `withPWA` is the **identity function when `OPEN_NEXT === 'true'`** (`next.config.js:11-12`), and `infra/deploy-portal.sh:288` builds with exactly that. `apps/client-portal/public/sw.js` is **gitignored** (`apps/client-portal/.gitignore:48`) and untracked. So **the deployed Worker registers no service worker and has no `https-calls` cache.** The exposure is real for a non-OpenNext production build (a local `pnpm --dir apps/client-portal build`, a preview host) and for any browser still holding an SW from an earlier such deploy | The `NetworkOnly` fix is still applied as ruled — it is one line, it protects the non-OpenNext builds, and it fails safe if the PWA is ever re-enabled — but the deck must not claim prod is caching pay links today |
| R3 | **M9/M10** cite `void_invoice` at `00397:1271-1345` | That body is real but is **renamed** to `_void_invoice_authorized_legacy_00397` at `00397:1449-1450`; `public.void_invoice` is a thin authority wrapper created at `:1454-1477` delegating at `:1475` — the same rename-wrapper idiom `issue_invoice` uses | The M9/M10 edits go in the **legacy body**, not in `public.void_invoice`. Grafting from the wrong one would silently drop the authorization wrapper (patina-db-migrations' anchored-grep rule) |
| R2 | **M5** — `resolveRecipient` should "fall back on `designer_clients` keyed on `designer_id` (+ the invoice's project)" | `designer_clients` has **no `project_id`** column (`database.types.ts` `designer_clients.Row`: `designer_id, client_id, client_email, client_name, lead_id, …`) | Ruling applied in its implementable form: `invoice_links.payer_email` first, then `designer_id` + `client_id IS NULL` via `maybeSingle()` — which resolves only when exactly one email-only roster row exists, matching `idx_designer_clients_unique_email` (`00018:26-28`). Reported as the one ruling not applicable verbatim |

---

## 1 · The six review notes, decided

**Note 1 — raw token vs hash. Ruled: one `token` column, no hash.** Four server producers must re-emit the *same* link for the invoice's life or K2's "stays as a receipt" fails; hash-only forces a remint per send. The hash's only value — "a DB read yields no working link" — is void with the raw token in the adjacent column. Protection is the table's posture (RLS on, zero policies, all grants revoked from `PUBLIC/anon/authenticated`). `00548:79-97` hashes because `resolve_board_share` is anon-callable from a browser; ours is not.

**Note 2 — void → dead vs "withdrawn". Ruled: dead (K2), with a third behaviour.** M9+M10 reconciled: `invoice_links.status` gains `closed`, and the resolver returns a **settling sheet** when a closed link's invoice carries a `pending`/`requires_refund` payment (§3.2). "Withdrawn by {studio}" stays owed, now with something to look at.

**Note 3 — does every rostered household have a profile? No.** `00018:2-5`, `00013:13`, `00013:72-88`; `client-invite/index.ts:273-280` relabels an existing profile and never inserts one. So the payer-less case is the feature's core population, not an edge. T3 weighed the synthetic-payer alternative and rejected it on the same ground: minting a profile means minting an `auth.users` row for someone who never asked. **Ruled: the link-payer path is built, and `invoice_link_id` becomes a first-class identity term everywhere `payer_id` is one** (M1–M4, M6) — not a nullable column only the claim function knows about. `00571:52-57`'s `chk_invoices_anchor` guarantees a studio invoice always carries `client_id`, so only *project* invoices can be payer-less.

**Note 4 — PostHog.** Provider is in the root layout (`app/layout.tsx:75-79` → `providers.tsx:35-39`), so `/pay/[token]` gets it as `/plans/[token]` does. Guests are never `identify`'d (`PostHogProvider.tsx:24-38`). Two blocking edits: `pay` into `HEX_BEARER_IN_URL` (`posthog.ts:83`), asserted in the existing `lib/analytics/__tests__/posthog-privacy.test.ts`; and `/pay` into `PUBLIC_PREFIXES`. Properties carry no id (§9).

**Note 5 — regenerate and receipts.** The four producers call `ensure_invoice_link(p_invoice_id)`, which returns the **active** row's token and mints only when none exists, so a Regenerate is picked up by the next letter and no producer may cache a token. Paid links stay `active`; death is `void` only. M11 adds the missing guard: Regenerate **refuses** while an attempt is live (§2.5).

**Note 6 — Stripe `customer` vs `customer_email`.** `customer_email` appears nowhere in `supabase/functions`; every session sets `customer:` (`index.ts:1117`, `:1304`) and `assertInvoiceSessionIdentity` asserts `session.customerId === attempt.stripeCustomerId`. (a) Payer-profile branch: the prefill is the household's real signup email, not editable, correct — no placeholder case exists. (b) Link-payer branch: the Customer is created with **no email**, so Checkout collects one, editable — and M5 now persists it to `invoice_links.payer_email` so Patina can actually write to it.

---

## 2 · Data

### 2.1 `public.invoice_links`

```sql
CREATE TABLE IF NOT EXISTS public.invoice_links (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id         uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  token              text NOT NULL,
  status             text NOT NULL DEFAULT 'active',
  stripe_customer_id text,          -- link-payer branch only (§2.4)
  payer_email        text,          -- captured from Checkout (M5, §5)
  created_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  revoked_at         timestamptz,
  view_count         integer NOT NULL DEFAULT 0,
  last_viewed_at     timestamptz,
  CONSTRAINT chk_invoice_links_status CHECK (status IN ('active','revoked','closed')),
  CONSTRAINT chk_invoice_links_token  CHECK (token ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chk_invoice_links_dead
    CHECK ((status <> 'active') = (revoked_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoice_links_token ON public.invoice_links(token);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoice_links_active
  ON public.invoice_links(invoice_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_invoice_links_invoice ON public.invoice_links(invoice_id);

ALTER TABLE public.invoice_links ENABLE ROW LEVEL SECURITY;   -- no policies, deliberately
REVOKE ALL ON TABLE public.invoice_links FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.invoice_links TO service_role;
```
`token` = `encode(extensions.gen_random_bytes(32),'hex')`, schema-qualified per the 00282 incident. Three statuses: `active` (payable/receipt), `revoked` (Regenerate), `closed` (set by `void_invoice`, M9 — the row records the death rather than leaving it a predicate inside one resolver).

### 2.2 The mint trigger

```sql
CREATE OR REPLACE FUNCTION public.mint_invoice_link_on_issue()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path TO 'public','extensions'
AS $$
BEGIN
  INSERT INTO public.invoice_links (invoice_id, token, created_by)
  VALUES (NEW.id, encode(extensions.gen_random_bytes(32),'hex'), NEW.designer_id)
  ON CONFLICT (invoice_id) WHERE status = 'active' DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;   -- M12: a missing link is recoverable via ensure_invoice_link;
                -- a failed payment settlement is not.
END $$;

CREATE TRIGGER invoice_link_mint_on_issue
  AFTER UPDATE OF status ON public.invoices
  FOR EACH ROW
  WHEN (NEW.status IN ('sent','partially_paid','paid') AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.mint_invoice_link_on_issue();
```

**Proof it fires on every issue path.** Every writer of `invoices.status='sent'` is an UPDATE; nothing inserts an invoice already at `'sent'`:
- `public.issue_invoice` — 00178:363 → 00318:99 → renamed `_issue_invoice_authorized_legacy_00397` (00397:1366) → `_issue_invoice_pre_00412` (00412:2690); head `00412:2694-2724`. The status write lives at **`00318:181-190`**, gated on `status='draft'` (`00318:118-120`).
- `app_private.issue_invoice_for_actor` (`00511:3713`) **duplicates** rather than delegates — its own UPDATE at **`00511:4071-4080`**. The ceremony path (00511/00566), and the reason a trigger beats editing `issue_invoice`.
- Trade-draw (00423) and executed-on-paper (00425) INSERT `'draft'` (`00423:1970,2559`; `00425:742,969`) then `PERFORM public.issue_invoice(...)` (`00423:1997,2587`). `00423:1752`'s `'sent'` is on `proposals`.
- All 19 migration INSERTs into `public.invoices` use `'draft'`. No edge function or hook inserts a status.
- `apply_invoice_payment_effects` (head `00571:1094-1240`, derivation `:1114-1128`, UPDATE `:1131-1145`) can move a **draft** straight to `partially_paid` — hence the `WHEN` covers all three terminal states, and refund contras walking `partially_paid → sent` are absorbed by the `ON CONFLICT`.

### 2.3 Backfill

```sql
INSERT INTO public.invoice_links (invoice_id, token, created_by)
SELECT i.id, encode(extensions.gen_random_bytes(32),'hex'), i.designer_id
FROM public.invoices i
WHERE i.status IN ('sent','partially_paid','paid')
ON CONFLICT (invoice_id) WHERE status = 'active' DO NOTHING;
```
Draft and void are skipped; `ensure_invoice_link` covers any later arrival.

### 2.4 `invoice_checkout_attempts` — the discriminated union

```sql
ALTER TABLE public.invoice_checkout_attempts
  ADD COLUMN IF NOT EXISTS invoice_link_id uuid REFERENCES public.invoice_links(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS return_nonce text;
ALTER TABLE public.invoice_checkout_attempts ALTER COLUMN payer_id DROP NOT NULL;
ALTER TABLE public.invoice_checkout_attempts
  ADD CONSTRAINT chk_invoice_attempt_actor
  CHECK ((payer_id IS NOT NULL) <> (invoice_link_id IS NOT NULL));   -- exactly one
ALTER TABLE public.invoice_checkout_attempts
  ADD CONSTRAINT chk_invoice_attempt_nonce CHECK (return_nonce IS NULL OR return_nonce ~ '^[0-9a-f]{64}$');
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoice_attempt_return_nonce
  ON public.invoice_checkout_attempts(return_nonce) WHERE return_nonce IS NOT NULL;
```
An **exclusive-or** CHECK, not a disjunction — T4's "real discriminated union". `uniq_invoice_checkout_active_attempt` (`00397:58-60`, on `state IN ('claimed','session_created','processing')`) is untouched, so one live attempt per invoice across both rails. The `state` CHECK (`00397:38-44`) already carries `expired` and `superseded`; the sweep and the actor-change supersede need no new values.

### 2.5 Existing money RPCs that change

| Function | Change | Why |
|---|---|---|
| `claim_invoice_checkout_attempt` (`00428:190-397`) | Move the payer/customer RAISE at **`:294-297`** *below* the supersede branch (`:302-330`) and add `'actor_changed'` to the `v_supersede_reason` CASE (`:306-311`): fail the stale pending payment, mark the attempt `superseded`, clear `invoices.stripe_checkout_session_id`, return `superseded_session_id`. Signature unchanged — the pinned literal `(uuid,uuid,text,boolean,text)` at `invoice_checkout_integrity_test.sql:738,743` stays valid | M3. Today only the household can claim, so the RAISE is unreachable; the link rail makes it a lockout — a stranger who opens a link Checkout and walks away would otherwise block the household from paying its own invoice, forever |
| `claim_invoice_link_checkout_attempt` (**new**) | Sibling grafted from `00428:190-397`, same surcharge call (`invoice_payment_surcharge_cents`, `00428:148-171`), same supersede machinery including `'actor_changed'`; identity is "the link is active and belongs to this invoice, and `p_stripe_customer_id` matches `invoice_links.stripe_customer_id`"; stamps `invoice_link_id` + `return_nonce`, leaves `payer_id` NULL | The sibling, not a signature change, is what leaves the pinned literal alone |
| `finalize_invoice_checkout_attempt` (`00428:414-419`) | `DROP FUNCTION IF EXISTS` the 4-arg form (00571:1316 idiom, to avoid 42725), recreate with `p_invoice_link_id uuid DEFAULT NULL` as a 5th arg; the assertion at `:441-443` gains `OR v_attempt.invoice_link_id IS DISTINCT FROM p_invoice_link_id`; the `recorded_by IS DISTINCT FROM v_attempt.payer_id` invariant (`:461`) is kept but no longer the only term | M4 — otherwise both assertions are vacuously true for every link attempt and `stripe_customer_id` becomes the sole anchor |
| `recover_invoice_checkout_session_evidence` (`00428:505-510`) | Same treatment; assertion `:532-534`, invariant `:553`. **The pinned signature literal at `invoice_checkout_integrity_test.sql:748` (`(uuid,uuid,text,text)`) must be updated to `(uuid,uuid,text,text,uuid)` in the same wave** | M4 |
| `_void_invoice_authorized_legacy_00397` (`00397:1271-1357`, renamed at `:1449-1450`; `public.void_invoice` is now the authorization wrapper created at `:1454-1477` that delegates at `:1475` — the `issue_invoice` idiom) | Edit the **legacy body**, where the attempt logic lives. In the block that already fails the pending payment and closes the attempt (`:1343-1353`), also `UPDATE invoice_links SET status='closed', revoked_at=now() WHERE invoice_id=$1 AND status='active'`. **Refuse** with `invoice_checkout_in_progress` when an attempt is `processing`; `claimed`/`session_created` do not block | M9 + M10. The code comment at `:1340-1342` already predicts the M10 case verbatim: "if Stripe reports a late charge, `settle_invoice_checkout_payment` converts it to `requires_refund` because the invoice is void" |
| `regenerate_invoice_link` (new, below) | Refuses with `invoice_checkout_in_progress` while an attempt is `claimed`/`session_created`/`processing` | M11 — the Stripe `success_url` carries a nonce bound to the *old* attempt; the sweep clears abandonment within 24h |

### 2.6 The new RPCs

| RPC | Signature | Semantics | Grants |
|---|---|---|---|
| `ensure_invoice_link` | `(p_invoice_id uuid) RETURNS text` | Active row's token; mints when `sent/partially_paid/paid` and none exists. NULL for draft/void/closed/missing | `REVOKE … FROM PUBLIC, anon, authenticated;` `GRANT … TO service_role` |
| `resolve_invoice_link` | `(p_token text, p_record_view boolean DEFAULT true) RETURNS jsonb` | §3. VOLATILE (it writes `view_count`) | `REVOKE … FROM PUBLIC, anon, authenticated, service_role;` `GRANT … TO authenticated, service_role` — **not anon**, mirroring `resolve_plan_transmittal` (`00429:1908-1911`); called only from `createServiceClient()` |
| `resolve_invoice_link_for_checkout` | `(p_token text) RETURNS TABLE(invoice_id uuid, link_id uuid, payer_id uuid, link_stripe_customer_id text, balance_cents integer, currency text, card_surcharge_bps integer)` | Ids only; rows only when the link is `active`, the invoice `sent`/`partially_paid`, balance > 0. `payer_id := coalesce(i.client_id, p.client_id)`. `card_surcharge_bps` always the coalesced integer (G5) | service_role |
| `resolve_invoice_return_nonce` | `(p_nonce text) RETURNS text` | The attempt's link token, or NULL. Single-purpose, valid for the attempt's life | service_role |
| `set_invoice_link_stripe_customer` | `(p_link_id uuid, p_stripe_customer_id text) RETURNS text` | Compare-and-set (`WHERE stripe_customer_id IS NULL`) then return the canonical winner — the `ensureStripeCustomer` race discipline (`index.ts:790-812`) | service_role |
| `set_invoice_link_payer_email` | `(p_link_id uuid, p_email text) RETURNS void` | M5. Idempotent; last write wins | service_role |
| `claim_invoice_link_checkout_attempt` | `(p_invoice_id uuid, p_invoice_link_id uuid, p_stripe_customer_id text, p_payment_method text) RETURNS jsonb` | §2.5 | service_role |
| `regenerate_invoice_link` | `(p_invoice_id uuid) RETURNS text` | Revoke active + mint; gated on `public.can_manage_invoice` (`00397:1251-1263`); M11 refusal | `REVOKE … FROM PUBLIC, anon;` `GRANT … TO authenticated, service_role` |
| `get_invoice_link` | `(p_invoice_id uuid) RETURNS jsonb` → `{token, status}` | **Gate: `public.can_manage_invoice(p_invoice_id) OR auth.uid() = coalesce(i.client_id, p.client_id)`** — **not** `get_invoice_payment_options`'s predicate (S5) | `REVOKE … FROM PUBLIC, anon;` `GRANT … TO authenticated, service_role` |
| `expire_stale_invoice_checkout_attempts` | `(p_stale interval DEFAULT '24 hours') RETURNS jsonb` | §2.7 | `REVOKE … FROM PUBLIC, anon, authenticated;` `GRANT … TO service_role` |

**S5, in full.** `get_invoice_payment_options`' studio arm is `is_active_studio_member(i.studio_id)` (`00428:746-751`; the helper itself is `00417:40-55`) — any active non-guest member of the org, with no design-studio type check (`is_studio_comember` head body, `00556:51-76`, is the same shape). `_can_manage_invoice_owner` (`00397:903-911`) exists precisely for this, and its COMMENT (`00397:916-917`) says so: *"contractor/manufacturer co-membership never grants money authority."* Reading a fee rate through the loose gate is one thing; handing out a permanent bearer credential is another.

Error names, uniform and non-oracular: `invoice_not_found` (every authority failure and every missing row), `invoice_link_not_payable`, `invoice_checkout_in_progress`, `invoice_checkout_customer_mismatch` (reused from 00428). Grant idiom: the batched `REVOKE ALL ON FUNCTION a(…), b(…) FROM PUBLIC, anon, authenticated, service_role;` then a targeted GRANT — `00437:515-528`. The migration adds GRANTs, so `python3 scripts/generate-legacy-grants.py` is re-run and `supabase/seed/00-legacy-grants.sql` committed **with the migration** (D2 — it is `sql_paths[0]` for local resets and deliberately absent from `[remotes.staging]`; it is not a deploy step).

### 2.7 The sweep (M3, belt-and-braces)

`expire_stale_invoice_checkout_attempts()` follows `groom_agent_tasks` (`00300:78-199`) exactly: `pg_try_advisory_xact_lock(hashtext('job:invoice-checkout-attempts-expire'))` → a `skipped` `job_runs` row and return on contention (`00300:96-100`); `set_config('app.actor', …, true)`; a `running` row (`00300:104-106`); the work; `UPDATE job_runs SET status='succeeded', finished_at=now(), detail=…` (`00300:181-183`). The work is: flip `claimed`/`session_created` attempts older than `p_stale` to `expired`, fail their pending `invoice_payments` rows, and clear `invoices.stripe_checkout_session_id` where it points at them. `processing` is **never** swept — that is ACH money in flight.

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'invoice-checkout-attempts-expire') THEN
    PERFORM cron.unschedule('invoice-checkout-attempts-expire');
  END IF;
END $$;
SELECT cron.schedule(
  'invoice-checkout-attempts-expire', '17 * * * *',
  $$SELECT public.expire_stale_invoice_checkout_attempts();$$
);
```
A SQL RPC, not `invoke_edge_function` — there is no HTTP work to do (`00300:201-207` is the precedent; `00181`/`00304` use the edge bridge because theirs send mail). The registry `COMMENT ON EXTENSION pg_cron` is carried forward and extended inside `DO $$ … EXCEPTION WHEN insufficient_privilege THEN NULL; END $$` (`00300:214-218`). `job_runs` (`00300:41-52`) needs no change.

---

## 3 · Read path

### 3.1 The payable payload

`resolve_invoice_link(p_token, p_record_view)` → one `jsonb`, no uuids anywhere.

```jsonc
{
  "sheet": "invoice",                        // discriminator; "settling" in §3.2
  "invoice": {
    "number": "string|null", "title": "string|null",
    "status": "sent|partially_paid|paid",
    "issue_date": "date|null", "due_date": "date|null", "paid_at": "timestamptz|null",
    "currency": "string",
    "subtotal_cents": "integer", "tax_cents": "integer", "tax_rate": "number",
    "total_cents": "integer", "amount_paid_cents": "integer",
    "balance_cents": "integer",              // GREATEST(total_cents - amount_paid_cents, 0)
    "memo": "string|null", "project_name": "string|null",
    "is_studio_invoice": "boolean"           // invoices.project_id IS NULL
  },
  "line_items": [{ "description", "quantity", "unit_amount_cents", "amount_cents", "kind",
                   "attribution" }],             // FF&E maker/vendor name or null — never an id (W2 ask)
  "payments":   [{ "amount_cents", "surcharge_cents", "method", "status",
                   "rail": "card|us_bank_account|null", "received_at" }],
  "studio": { "name": "string|null", "logo_url": "string|null",
              "website": "string|null", "source": "string|null",
              "location": "string|null" },        // "City, State" from organizations.address (W2 ask)
  "designer_display_name": "string|null",
  "client_display_name": "string|null",
  "payment_options": {
    "card_surcharge_bps": "integer",         // ALWAYS coalesced; never null (G5)
    "check_remit_to": "string|null"          // NULL → CHECK_REMIT_FALLBACK client-side
  },
  "pay": {
    "rails": ["us_bank_account","card","check"],   // all three today
    "processing": "boolean"                        // a pending payment with a stamped PaymentIntent — ACH in flight (G8 as amended by W1 review F3; a merely-claimed or abandoned card attempt is neither listed nor processing)
  }
}
```

`pay.has_payer` is **gone** (G7): the link-payer path is built, so the payer's existence stops being a UI concept and the check-only state is deleted from the mockup. `card_surcharge_bps` is never null (G5): `claim_invoice_checkout_attempt` coalesces to 300 immediately before charging (`00428:250-253`) and `get_invoice_payment_options` returns `coalesce(v_bps, 300)` (`00428:746-761`) — 300 is the rate the platform *will* charge, and `studio_billing_settings` rows are written only by a studio admin, so a null branch would disable card payment for most studios. `check_remit_to` NULL resolves to the tested `CHECK_REMIT_FALLBACK` (`packages/shared/src/invoice/index.ts:189`), not a new string. `pay.processing` is explicit rather than derived, and `state/route.ts` returns it too so the ACH-processing state survives the poll.

**Studio identity**: `SELECT * FROM public.resolve_studio_identity(p_project_id => i.project_id, p_designer_id => i.designer_id, p_studio_id => i.studio_id)` — all three named, as `_shared/studio-identity.ts:56-66` does and for the reason it gives. The two-studio letterhead fix; `anon` already holds EXECUTE (`00571:1414`).

**Forbidden keys**, never at any depth: any uuid or `*_id`, `internal_notes`, `email`, `payer_email`, `phone`, `stripe_customer_id`, `stripe_checkout_session_id`, `stripe_payment_intent_id`, `stripe_event_id`, `void_reason`, `voided_at`, `ar_flagged_at`, `ar_last_chased_at`, `last_reminder_at`, `reminder_count`, `token`, `return_nonce`, payment `reference`/`recorded_by`/`note`. Enforced twice: a SQL assertion walking the payload's keys, and a recursive TS parser — the `plan-transmittal.ts:72-79` `carriesStoragePath()` idiom.

### 3.2 The settling sheet, and dead-link semantics

Malformed token, unknown token, `revoked`, invoice `draft`, invoice `void` with no live payment → **the same NULL**, one `<DeadLink/>`, no timing branch, no oracle.

The exception (M10): a `closed` link whose invoice carries any `pending` or `requires_refund` payment returns

```jsonc
{ "sheet": "settling",
  "invoice": { "number": "string|null" },
  "studio": { "name", "logo_url", "website", "source" },
  "designer_display_name": "string|null" }
```

— letterhead, invoice number, one sentence ("a payment on this invoice is being sorted out by {studio}"), studio contact. **No amounts, no chooser, no pay act.** Without it, a guest who was charged real money seconds before the studio voided the invoice is told "This link is no longer good," with no receipt and no address to write to. `void_invoice` refusing while an attempt is `processing` (§2.5) closes the common half of the window; this closes the rest.

**View counting**: `p_record_view` defaults true; the page passes it, `state` passes false. `UPDATE … SET view_count = view_count + 1, last_viewed_at = now()` runs before the payload is built and never appears in it. Kept for support diagnostics; **not surfaced** in v1 (V3).

---

## 4 · Guest pay

### 4.1 `invoice-link-checkout` (new, `verify_jwt = false`)

```
POST /functions/v1/invoice-link-checkout   { "token": "<64 hex>", "method": "card"|"us_bank_account"|"check" }
→ 200 { "url": "https://checkout.stripe.com/…" }   |   200 { "ok": true }   (check)
```

| Condition | Body | HTTP |
|---|---|---|
| `Origin` present and ≠ `CLIENT_PORTAL_URL` | `{"error":"forbidden_origin"}` | 403 |
| token malformed / unknown / revoked / closed / draft / void / balance ≤ 0 | `{"error":"invoice_not_found"}` | 404 |
| unknown `method` | `{"error":"bad_payment_method"}` | 400 |
| claim RPC raises `invoice_checkout_*` | mapped code + `detail` (`invoice_not_payable`, `checkout_payer_mismatch`, `payment_reconciliation_required`; `payment_processing` for a completed session with a pending debit **or**, per W1 review F1, a different actor meeting a `processing` attempt) | 409 |
| body unparsable / unknown method | `invalid_body` / `bad_payment_method` | 400 · 405 for a non-POST |
| a post-resolve failure | `lookup_failed`, `stripe_not_configured`, `notification_failed`, `customer_persistence_failed`, `payer_profile_not_found`, `invoice_link_not_found` | 500 |
| Stripe throws | `{"error":"stripe_error","detail":…}` | 502 |

None of the 400/500 rows is a token-validity oracle: every one is reached only after the token resolved (as built, W1 review F11).

**CORS is not wildcard (S3).** The browser reaches this only through the same-origin Worker route, which sends no `Origin`; anything else must equal `CLIENT_PORTAL_URL`. iOS opens the *page*, not the function. `Access-Control-Allow-Origin` echoes `CLIENT_PORTAL_URL`, never `*`. There is **no constant response floor** (W1 deviation 9, accepted): a malformed token returns after a regex test, an unknown one after one RPC, a valid one after an RPC plus a Stripe call. That timing tells an attacker nothing usable against 256 bits of entropy — entropy is the control, the portal's limiter is friction.

`config.toml`, matching the shape of the other nine `verify_jwt=false` entries (`stripe-webhook`:331, `resend-webhook`:335, `sms-inbound`:341, `sms-status`:346, `comms-mute`:350, `test-account-login`:360, `fulfillment-po`:514, `fulfillment-evidence`:539, `site-request-guest`:557 — the skill's "only four" is stale):
```toml
# The 64-hex invoice link token IS the credential, checked inside
# resolve_invoice_link_for_checkout (SECURITY DEFINER, service_role-only, 00574).
# verify_jwt = false so the gateway does not demand a caller JWT; the origin
# check and CORS are in-code, as site-request-guest does.
[functions.invoice-link-checkout]
verify_jwt = false
```

### 4.2 Stripe metadata (M6) and the identity terms (M1, M2)

Exactly this key set, on **both** the Session and the PaymentIntent (`payment_intent_data.metadata`), for the link rail:
```ts
{ payable_type: 'invoice', invoice_id, checkout_attempt_id, invoice_link_id, payment_method }
```
`payer_id` is **omitted**, never the string `"null"`. The payer rail keeps today's set (`index.ts:1101-1112`) and adds nothing. Metadata is load-bearing — the webhook resolves by session id → PI id → `metadata.invoice_id` latest-pending and can recreate a missing pending row from it.

`InvoiceCheckoutAttempt` (`invoice-checkout-core.ts:15-40`): `payerId` widens to `string | null` and `invoiceLinkId: string | null` is added. `assertInvoiceSessionIdentity` (`:156-187`) gains two conditional terms in the style it already uses for `paymentMethod`:
```ts
(attempt.payerId !== null && metadata.payer_id !== attempt.payerId) ||
(attempt.invoiceLinkId !== null && metadata.invoice_link_id !== attempt.invoiceLinkId) ||
```
The amount assertion (`amountCents + surchargeCents`) and the customer assertion are untouched.

**The two truthiness guards must go (M1).** `mapInvoiceAttempt` throws `'Database returned an invalid invoice Checkout claim.'` on a falsy `payer_id` (`create-checkout-session/index.ts:853`), and the reconcile path repeats it (`:973`). A link claim echoes `payer_id NULL`, so **every guest checkout would throw before reaching Stripe**. Both become "exactly one of `payer_id` / `invoice_link_id` is present", matching the CHECK.

**The webhook's own assertion must gain the term (M2).** `stripe-webhook/invoice-checkout-integrity.ts` (263 lines, imported only by `index.ts` and its test) carries an identity check independent of `assertInvoiceSessionIdentity`: `ClaimedCheckoutAttempt.payer_id` typed `string` (`:6`), mismatch `input.payerId !== attempt.payer_id` (`:101`), `payment.recorded_by !== attempt.payer_id` (`:107`). On a link attempt all three sides are NULL and both terms **drop out silently** — the webhook would settle on `customerId` + `invoice_id` + `attemptId` alone. Fix: add `invoice_link_id` to the `index.ts:207` select column list and to `ClaimedCheckoutAttempt`/`ClaimedCheckoutEvidence`; add `(attempt.invoice_link_id !== null && input.invoiceLinkId !== attempt.invoice_link_id)` to `:101`; add a tampered-link-id case to `invoice-checkout-integrity.test.ts` beside the existing `payerId: 'client-foreign'` case (`:108`).

### 4.3 What is lifted into `_shared/`

| Move | From | To |
|---|---|---|
| the state machine + guards (287 lines) + its test | `create-checkout-session/invoice-checkout-core{,.test}.ts` | `_shared/invoice-checkout-core{,.test}.ts` |
| `ensureStripeCustomer` | `index.ts:756-823` | `_shared/invoice-checkout-stripe.ts`, re-parameterised `(admin, stripe, payerId: string)`; the `.is('stripe_customer_id', null)` compare-and-set + canonical re-read (`:790-812`) survive verbatim |
| `startInvoiceCheckout` | `index.ts:1052-1246` | `_shared/invoice-checkout-driver.ts`, parameterised on `{ claimRpc, claimArgs, payerId \| invoiceLinkId }` |
| the check-intent body | `invoice-check-intent/index.ts:180-296` | `_shared/invoice-check-intent-core.ts`; the JWT function becomes a thin adapter |

### 4.4 Byte-identical behaviour for signed-in callers

`create-checkout-session` keeps every branch (`invoice` `:212-362`, `po_payment` `:398-528`, `direct_order` `:587-750`, the `reconcile_session_id` fallback `:904-1050`) and every metadata key. Its changes: `_shared` imports; `ensureStripeCustomer(admin, stripe, caller.id)`; the two `mapInvoiceAttempt` guards; and the invoice return URLs at `:303-314`, which become the nonce form (§4.6). `po_payment`/`direct_order` return URLs do not move. `INVOICE_CHECKOUT_DESIGNER_TEST_MODE` (`:93-95, 239-244`) stays on the JWT path only — the guest function passes `p_allow_designer_test := false`, always.

### 4.5 Payer resolution

`payer := coalesce(invoices.client_id, projects.client_id)` — the same expression `claim_invoice_checkout_attempt` enforces at `00428:227-231`, with the payer's `profiles.stripe_customer_id` matched at `:233-237`.

When `payer` is NULL, the **link-payer** branch: `stripe.customers.create({ name: <client_display_name> ?? undefined, metadata: { invoice_link_id } }, { idempotencyKey: 'patina-invoice-link-customer:<link_id>' })` — **no `email`**, so Checkout collects one — persisted via `set_invoice_link_stripe_customer`, then `claim_invoice_link_checkout_attempt`. The ledger is indifferent: `invoice_payments.recorded_by` is nullable (`00178:137`) and `apply_invoice_payment_effects` touches neither `payer_id` nor `recorded_by`.

### 4.6 Return URLs — the nonce (S10)

The token is a permanent credential (K2), so it does not enter Stripe's retained logs — Session objects are visible in the dashboard, in event payloads, in webhook logs and in any data export, indefinitely.

```
success: {CLIENT_PORTAL_URL}/pay/return/<nonce>?checkout=success&session_id={CHECKOUT_SESSION_ID}
cancel:  {CLIENT_PORTAL_URL}/pay/return/<nonce>?checkout=cancelled
```
`return_nonce` is 32 random bytes hex on the attempt (§2.4), single-purpose, valid for the attempt's life. `app/pay/return/[nonce]/route.ts` resolves it with the service client (`resolve_invoice_return_nonce`), no-store, rate-limited, and **303s** to `/pay/<token>?checkout=…` carrying the same query. **Both rails** — the signed-in `create-checkout-session` invoice path too — so Stripe never sees a token. An unknown nonce 303s to `/pay/return/unavailable`, a static dead-link page.

**M7's safety valve**: `create-checkout-session` calls `ensureInvoiceLinkUrl(...)` for the token behind the nonce and, when it returns null, falls back to `invoiceCheckoutReturnAddress(...)` exactly as today (`invoice-checkout-core.ts:138-154`) — a session must never be created with a broken return address.

### 4.7 The abandoned-Checkout case

The DB claim (`uniq_invoice_checkout_active_attempt`, `00397:58-60`) returns the existing attempt with its `stripeCheckoutSessionId`; `runInvoiceCheckout` sets `reused = true` and **retrieves** rather than creates (`invoice-checkout-core.ts:250-253`); the payer re-enters the same session. One re-claim/re-create cycle on an expired session, fail-closed on a second (`:265-283`). A rail change, a balance change or now an **actor change** supersedes (§2.5), and the caller expires the old Stripe session best-effort (`index.ts:1083-1091`). Anything the payer simply abandons is cleared by the hourly sweep within 24h (§2.7).

---

## 5 · Webhook, letters, and the redeploy set

New `_shared/invoice-links.ts`:
```ts
export const INVOICE_LINK_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
export function invoiceLinkPath(token: string): string;                 // `/pay/${token}`
export function invoiceLinkUrl(baseUrl: string, token: string): string;
export function invoiceReturnUrl(baseUrl: string, nonce: string, outcome: 'success'|'cancelled'): string;
export async function ensureInvoiceLinkUrl(admin, baseUrl, invoiceId): Promise<string | null>;
```
A `null` return is the safety valve: the letter falls back to today's `/invoices/<id>` rather than shipping a broken address.

**Letter edits** — each replaces one `` `${CLIENT_PORTAL_URL}/invoices/${invoice.id}` `` with `await ensureInvoiceLinkUrl(...) ?? <today's literal>`: `stripe-webhook/index.ts:418` (receipt) and `:517` (failure), `invoice-send/index.ts:259`, `invoice-reminders/index.ts:353`.

**I1 — the recorded ruling being reversed.** The comment at `stripe-webhook/index.ts:414-420` states the opposite decision at the exact line being edited: *"`/invoices/<id>` stays: the Patina iOS app claims `/invoices/*` in its applinks entitlement, so a client with the app installed opens the native invoice."* After this change a signed-in iOS client's receipt link opens Safari, not the app. That is a legitimate K1 consequence, not a side effect: **the comment is rewritten in the same commit** and the reversal is recorded in the R137 DECISIONS entry (§13 W4).

**I2** — `notification_log.metadata.deep_link` stays `/invoices/<id>` because it routes the iOS inbox by id. So the emailed link and the in-app inbox link for the same event now land on different surfaces. Harmless, stated here so nobody "fixes" it later.

**M5 — the receipt actually reaching someone.** `resolveRecipient` (`stripe-webhook/index.ts:319-349`) computes `clientUserId = invoice.client_id ?? invoice.project?.client_id` and gates the `designer_clients` fallback on `if (!email && clientUserId)` (`:337`), keying on `.eq('client_id', clientUserId)` (`:342`). In the exact payer-less case the link path exists for, both ids are NULL, the fallback is skipped, and `if (recipient.email)` short-circuits: no receipt, no failure letter, no inbox row. Three changes:
1. `handleSessionCompleted` (`:607`) persists `session.customer_details?.email` — the accessor already used at `:1192` for direct orders — onto `invoice_links.payer_email` via `set_invoice_link_payer_email`.
2. `resolveRecipient` prefers `invoice_links.payer_email` when no profile email resolves.
3. The `designer_clients` fallback's gate relaxes from `!email && clientUserId` to `!email`; when `clientUserId` is null it matches `designer_id = invoice.designer_id AND client_id IS NULL` through `maybeSingle()`, which resolves only when exactly one email-only roster row exists (`idx_designer_clients_unique_email`, `00018:26-28`) and returns null otherwise. **This is the one T4 ruling not implementable as written** — see correction R2: `designer_clients` has no `project_id` to key on.

**Redeploy set.** `invoice-checkout-integrity.ts` is private to `stripe-webhook` and fans out to nothing. The `_shared` modules do:

| Module | Importers |
|---|---|
| `_shared/invoice-links.ts` (new) | `stripe-webhook`, `invoice-send`, `invoice-reminders`, `invoice-link-checkout` |
| `_shared/invoice-checkout-core.ts` (moved in) | `create-checkout-session`, `invoice-link-checkout` |
| `_shared/invoice-checkout-stripe.ts`, `-driver.ts` (new) | `create-checkout-session`, `invoice-link-checkout` |
| `_shared/invoice-check-intent-core.ts` (new) | `invoice-check-intent`, `invoice-link-checkout` |
| `_shared/invoice-emails.ts`, `-subject.ts` (untouched) | `stripe-webhook`, `invoice-reminders`, `invoice-send`, `invoice-check-intent` (+ `create-checkout-session` for `-subject`) |

**Deploy six**: `invoice-link-checkout` (`--no-verify-jwt`), `create-checkout-session`, `stripe-webhook`, `invoice-send`, `invoice-reminders`, `invoice-check-intent`. **D3**: re-grep at ship time rather than trusting this table — `grep -rl "_shared/invoice-checkout\|_shared/invoice-links\|_shared/invoice-check-intent" supabase/functions --include='*.ts'` is a §12 step, compared against this list.

---

## 6 · Client portal

| File | Responsibility |
|---|---|
| `src/app/pay/[token]/page.tsx` | **new.** `dynamic = 'force-dynamic'`; `metadata = { robots:{index:false,follow:false}, referrer:'no-referrer' }` (`plans/[token]/page.tsx:8-14`). Limiter, then `resolveInvoiceLink(token)`; null → `<DeadLink/>`; `sheet:'settling'` → `<SettlingSheet/>` |
| `src/app/pay/[token]/invoice-link.ts` | **new.** `import 'server-only'`; `createServiceClient()` from `@patina/supabase/server` (**not** the package root — `packages/supabase/src/index.ts:103-104` forbids the re-export); regex gate before any round trip; recursive forbidden-key parser (`plan-transmittal.ts:72-79, 196-212`) |
| `src/app/pay/[token]/invoice-sheet.tsx` | **new.** The restored old-page layout (`git show 923c0e935^:…/invoices/[invoiceId]/page.tsx`, 752 lines) driven off the payload: chooser with three arrived-at totals, fee row, "Total to pay", live Pay label, `@media print` + the print-only colophon line |
| `src/app/pay/[token]/payment-method-chooser.tsx` (+ `__tests__/`) | **moved** from `components/threshold/`. Props (`:38-58`) unchanged; the `Preferred · lowest fee` chip string (`:84`) is retired — check is $0, so "lowest fee of the three" is false (G3) |
| `src/app/pay/[token]/checkout/route.ts` | **new.** `POST`, no-store, **limiter**; server-side call to `invoice-link-checkout` |
| `src/app/pay/[token]/state/route.ts` | **new.** `GET`, no-store, **limiter** (S2); re-resolves with `p_record_view=false`; returns `{ status, amount_paid_cents, balance_cents, payments, processing }` |
| `src/app/pay/return/[nonce]/route.ts` | **new.** `GET`, no-store, limiter; resolves the nonce and 303s to `/pay/<token>?checkout=…` (S10) |

**Middleware diff** (`src/middleware.ts`): add `isPayPage = pathname.startsWith('/pay/')` beside `isPlansPage` (after `:125`); add `isPayPage ||` to `isPublicPage` (`:153-162`). **S8**: widen the header block at `:144-147` from `if (isPlansPage)` to **all** bearer prefixes — `isPlansPage || isPayPage || isSharePage || isFieldPage || isRfqPage || isEvidencePage` — in the same wave. Four bearer routes have carried neither `Cache-Control: private, no-store` nor `X-Robots-Tag` since they shipped; this is a one-line change with no cost, and the deck must not imply the header was already a house rule for token surfaces.

**The other three allowlists**: `/pay` into `PUBLIC_PREFIXES` (`app-chrome.tsx`); `pay` into `HEX_BEARER_IN_URL` (`posthog.ts:83`); and **S1** — a `NetworkOnly` `runtimeCaching` entry matching `/^https?:\/\/[^/]+\/(pay|plans|share|rfq|evidence|field)\//` placed **before** the `/^https?.*/` `NetworkFirst` catch-all (`next.config.js:19-36`). Per correction R1 the catch-all is inert on the deployed Worker (`withPWA` is the identity function when `OPEN_NEXT === 'true'`, `next.config.js:11-12`, and `deploy-portal.sh:288` sets it; `public/sw.js` is gitignored at `.gitignore:48`) — the entry is applied anyway because it costs one line, it protects non-OpenNext builds and preview hosts, and it fails safe if the PWA is ever re-enabled. Playwright asserts `caches` holds nothing for `/pay/`.

**Checkout return**: `consumeCheckoutReturn(hash?: string)` defaults to today's `orderId ? '#road' : '#letterbox'` (`checkout-return.ts:75`); the pay page passes `''`. The second hardcoded `'#letterbox'` in `consumeNamedInvoice` (`:108`) is left alone.

**Rate limit**: add beside `services` (`wrangler.jsonc:43-47`) —
```jsonc
"ratelimits": [ { "name": "PAY_LINK_RATELIMIT", "namespace_id": "<owed>", "simple": { "limit": 30, "period": 60 } } ]
```
Read with the **sync** `getCloudflareContext()` (`lib/data/service-binding.ts:55-60`); never the async accessor (`:38-45` explains why — it boots Miniflare and returns a 503 stub). Key on `cf-connecting-ip`; over-limit renders the dead link, not a "too many attempts" oracle. **S4**: fail open in dev, fail **loud** in production — when `NODE_ENV === 'production'` and the binding is absent, log an error and emit a PostHog event, so a typo'd binding name cannot silently disable the only brute-force control behind a green deploy.

**D1 — W2 is purely additive.** `/pay/[token]` and `/pay/return/[nonce]` ship with the letterbox's settle-in-place and `/invoices/[invoiceId]/print` **untouched and live**. Both surfaces work; nothing a homeowner reaches is removed while `/pay` links are new in the wild. The retirement is W3b, a separate later deploy after the functions have soaked: delete `components/threshold/settlement.tsx` (217 lines) and the letterbox's checkout hooks (`:138,:149,:159-170`), replace the `Settlement` render (`:304-316`) and the `invoice_print` `ScoredAction` (`:280-290`) with one "Open the invoice" action; delete `app/invoices/[invoiceId]/print/`; relax `retired-routes.ts:148-154`'s `segments.length !== 2` so `/invoices/<id>/print` folds instead of 404ing, and update the `:92-97` comment that records the opposite ruling. Every step then rolls back alone.

---

## 7 · Designer portal

`invoice-folio.tsx` (858 lines). `clientInvoiceUrl` (`:265-267`) builds `/invoices/${invoiceId}` and is reachable only inside `showClientFallback` (`:634`) — after a send fails. Replace with `invoiceLinkUrl(resolveClientPortalOrigin(window.location.origin), link.token)` from `useInvoiceLink(invoiceId)`, and promote **Copy link** into the act row for every invoice where `!isDraft && invoice.status !== 'void'` (the `canPrint` predicate, `:175`); `copyClientInvoiceUrl` (`:269-276`) is reused. Add **Regenerate**, with the M11 refusal surfaced as *"A payment is in progress on this invoice. Try again later."* The `hasClientPortalAccount` branch (`:184-186`) gains the M5 truth: when there is no household profile, the copy says **"the receipt goes to the address they give at checkout"** — which is now true, because `payer_email` is captured and addressed. `resolveClientPortalOrigin` (`client-portal-url.ts:25-41`) is unchanged.

`packages/supabase/src/hooks/use-invoices.ts` (1331 lines): `useInvoiceLink(invoiceId)` (key `['invoice-link', invoiceId]`, `rpc('get_invoice_link')`) after `useInvoicePaymentOptions` (`:1221`); `useRegenerateInvoiceLink()` after `useVoidInvoice` (`:1307`). Export from the value block closing at `hooks/index.ts:1551` and the type block at `:1576`.

`packages/utils/src/invoice-link.ts` (**new**), the `document-share.ts` twin (`:12-36`): pattern, `isLikelyInvoiceLinkToken`, `invoiceLinkPath`, `invoiceLinkUrl`. Barrel-export beside `document-share` (`index.ts:16`). **`packages/utils` is dist-resolved** (`"main": "./dist/index.js"`) — `pnpm turbo build --filter=@patina/utils`, and only ever deploy through `infra/deploy-portal.sh`.

---

## 8 · iOS (W4)

**The control is that `/pay/*` is absent from the AASA** (`route.ts:40` lists `["/piece/*", "/invoices/*", "/proposals/*", "/decisions/*"]`; `:12` is the Field app's `/field/sr_*`), asserted by a test that checks `/pay/*` is not present and the four money paths are unchanged. A claimed `/pay/*` would open an app with no pay screen and dead-end the one person the feature is for. That `SFSafariViewController` is unaffected by applinks for its initially-loaded URL is a true footnote, not the control — it invites testing the wrong thing (I3).

`InvoicesAPIClient.swift:257-277` — `startCheckout(invoiceId:)` invokes `create-checkout-session`; replace with `payLinkURL(invoiceId:)` calling `get_invoice_link` and building `https://client.patina.cloud/pay/<token>`. `CheckoutError.from(code:detail:)` keeps its mapping. `InvoiceDetailView.swift:255` calls the new method; `checkoutBinding` (`:76-81`) and the `SafariView` presentation (`:68-73`) are unchanged, and `checkoutDismissed(invoiceId:)` still polls on dismissal. Entitlement (`Patina.entitlements:9`) and `DeepLinkHandler.swift:301-302` unchanged. Until W4 ships, the legacy JWT path stays valid — only its return URL moves.

---

## 9 · Analytics

Provider in the root layout, already serving `/plans/[token]`. `initPostHog` sets `ip:false`, `respect_dnt:true`, `before_send: sanitizePostHogEvent`, `surface:'client-web'` (`posthog.ts:150-173`). Guests are never identified.

**Blocking edit**: `pay` into `HEX_BEARER_IN_URL` (`posthog.ts:83`). **S9** names its enforcement: a new case in `apps/client-portal/src/lib/analytics/__tests__/posthog-privacy.test.ts` — *"redacts pay-link bearers from pageview, referrer, autocapture, and nested values"* — modelled on the evidence case at `:117-127`, asserting `/pay/[redacted]` in `$current_url`, `$referrer`, an autocaptured `href`, and a nested JSON value.

New `payLinkEvents` namespace in `events.ts`: `view`, `methodSelected`, `paymentStarted` (`sendBeacon`, as `client_payment_started` does at `:60-77`), `paymentCompleted`, `paymentCancelled`, `checkIntent`, `deadLink`, `settling`, plus `rateLimitBindingMissing` for S4. Property whitelist, exactly: `status`, `is_studio_invoice`, `has_balance`, `method`, `amount_cents`, `surcharge_cents`, `currency`. Forbidden: every id (the payload has none), the token, the nonce, any name, email or address. The `clientEvents.invoice*` names are not reused — they carry `invoice_id` and are locked to the signed-in dashboards.

---

## 10 · Security posture

| # | Concern | Mechanism | Where |
|---|---|---|---|
| S1 | Enumeration | 256-bit token, unique index, `^[0-9a-f]{64}$` gate before any round trip. **The deck names entropy as the control and the limiter as friction, not as the boundary** | `00574`; `invoice-link.ts` |
| S2 | Existence oracle | malformed / unknown / revoked / closed-without-live-payment / draft / void → one NULL → one `<DeadLink/>`; the function collapses them to 404. No timing floor anywhere — 256-bit entropy is the control (W1 review F11) | `resolve_invoice_link`; `invoice-link-checkout` |
| S3 | Brute force | `ratelimits` binding, 30/min per `cf-connecting-ip`, on **all three** routes — page, `state`, `checkout` — plus `pay/return`. `state` was the cheaper, uncounted oracle | `wrangler.jsonc`; the four route modules |
| S4 | Limiter silently absent | Fail open in dev; in production log an error **and** emit a PostHog event. Smoke step proves 31 rapid requests → dead link | `invoice-link.ts`; §12 step 6 |
| S5 | Service-worker cache | `NetworkOnly` before the catch-all for all six bearer prefixes. Cache Storage does **not** honour `no-store`, so the middleware header would not have covered it. Per R1 the catch-all is inert on the deployed Worker; the entry protects non-OpenNext builds and any re-enabling | `next.config.js:19-36` |
| S6 | Intermediary caching | `Cache-Control: private, no-store, max-age=0` + `X-Robots-Tag: noindex, nofollow`, widened to **all** bearer prefixes; `force-dynamic`; `robots` metadata | `middleware.ts:144-147` |
| S7 | Edge cache | The Worker is the origin; `/pay/*` renders dynamically (dummy incremental cache, `open-next.config.ts`). **Verify no zone Cache Rule matches `/pay/*` before the first deploy** | dashboard check, §12 |
| S8 | Token in analytics | `HEX_BEARER_IN_URL` + `pay`; `sanitizePostHogEvent` is a `before_send` hook, so autocapture is covered; asserted in `posthog-privacy.test.ts` | `posthog.ts:83` |
| S9 | Token in the `Referer` | `next.config.js:155-156` sets `Referrer-Policy: strict-origin-when-cross-origin` globally — a cross-origin navigation sends the **origin only**. The page's `referrer:'no-referrer'` is belt-and-braces; the header wins on the live path (`tests/plans-link.spec.ts:230-243` accepts either) | verified, no change |
| S10 | Token in Stripe's retained logs | **Removed entirely** by the return nonce (§4.6), on both rails. A Session's `success_url` is visible in the dashboard, in event payloads, in webhook logs and in any export, indefinitely; a permanent bearer credential does not belong there | `00574`; `pay/return/[nonce]` |
| S11 | Token in a `callbackUrl` | `isPublicPage` prevents `/pay/<64hex>` reaching the `callbackUrl` builders (`middleware.ts:172,232`; `use-auth.ts:130`). A Jest case pins it: `/pay/<64hex>` produces no redirect and no `callbackUrl` | §11 |
| S12 | CORS as a bypass | No wildcard. `Origin` absent (the Worker's server-side call) or `= CLIENT_PORTAL_URL`; anything else 403 | `invoice-link-checkout` |
| S13 | Token in logs | No `console.log`/`RAISE NOTICE` may interpolate `p_token`, `token` or `return_nonce`; errors log the **link id**. Enforced, not just reviewed: a grep gate in the W1 exit criteria | §11, §13 |
| S14 | Payload leakage | Forbidden-key list enforced twice (SQL assertion + recursive TS parser) | §3.1 |
| S15 | Prod auto-grants `anon` EXECUTE | Strata predates the 2026-05-30 flip. Every new function carries an explicit `REVOKE … FROM PUBLIC, anon`, and the ten signatures are registered in `platform_acl_compatibility_test.sql`'s must-not-hold list | `00574`; §11 |
| S16 | Table reachable directly | RLS on, zero policies, all grants revoked from `PUBLIC/anon/authenticated` | `00574` |
| S17 | Link-holder pays as the household | A stranger with the link can open a Checkout attributed to the household payer; they pay with their own instrument and the ledger is unchanged. On the link-payer branch the receipt goes to the address they type. **Named in the deck** | named |
| S18 | The token prints | Browsers stamp the URL into the print header and no stylesheet suppresses it. Accepted, with one print-only colophon line in the studio's voice: *"This sheet carries a payment link. Treat it like a check."* | `invoice-sheet.tsx` |
| S19 | Clickjacking | `X-Frame-Options: DENY` + `frame-ancestors 'none'`, already global | `next.config.js:100-165` |

---

## 11 · Tests and gates

**SQL** — `supabase/tests/billing/invoice_links_test.sql`, modelled on `billing/invoice_checkout_integrity_test.sql` and `mood_boards/share_security_test.sql` (the `pg_temp.assume_*_actor` + `SET LOCAL ROLE anon` idiom):
mint on `issue_invoice`, on `app_private.issue_invoice_for_actor`, on a draft→`partially_paid` jump; no duplicate on a `partially_paid`→`sent` refund walk; the M12 exception swallow (a forced failure inside the trigger does not abort the settlement); backfill covers sent/partially_paid/paid, skips draft/void; resolve happy path for a project invoice **and** a studio invoice with no house (two-studio letterhead asserted against `resolve_studio_identity`); resolve NULL for malformed/unknown/revoked/draft/void; the **settling sheet** for a `closed` link with a `pending` payment and with a `requires_refund` payment; the forbidden-key walk; `p_record_view=false` leaves `view_count`; the discriminated-union CHECK rejects both-null and both-set.
**M3, three cases pinned**: guest claims → household claims → the guest attempt is `superseded` with reason `actor_changed` and a `superseded_session_id` is returned; the mirror; and post-Regenerate, the new link's customer supersedes rather than raising. Plus the sweep: a 25-hour-old `claimed` attempt flips to `expired` with a `job_runs` row; a `processing` attempt is **never** swept.
**M4**: `finalize`/`recover` reject a link attempt presented with a foreign `stripe_customer_id` **and** with a foreign `invoice_link_id`. **M8**: a link payment asserts `recorded_by IS NULL AND invoice_link_id IS NOT NULL`, alongside the existing payer-bound assertion at `invoice_checkout_integrity_test.sql:790-791`. **M11**: Regenerate raises `invoice_checkout_in_progress` for each of the three live states. **M10**: `void_invoice` raises for `processing`, succeeds for `claimed`/`session_created`, and sets the link `closed`.
**S6 — the v1 test plan was wrong.** `can_manage_invoice` returns TRUE for "an active non-guest peer in the same active design_studio" (`00397:916-917`), so the assertion is **co-member yes**, contractor/manufacturer or guest member **no**, stranger `invoice_not_found`. Asserting co-member *no* would fail, and an implementer who "fixed" it by tightening the gate would lock a studio's own partners out of their own invoice links.
`ASSERT NOT has_function_privilege('anon'::name, '<sig>', 'EXECUTE')` for all ten new functions (`rls/00555_ios_round_one_security.test.sql:1285-1297` idiom). Register the ten in `public_rpc_authorization_contract_test.sql` and `platform_acl_compatibility_test.sql:369-395`, and **update the pinned literal at `invoice_checkout_integrity_test.sql:748`** to `recover_invoice_checkout_session_evidence(uuid,uuid,text,text,uuid)`.

**Deno** — `_shared/invoice-checkout-core.test.ts` moves and gains a link-shaped claim payload plus tampered-`invoice_link_id` identity cases; `stripe-webhook/invoice-checkout-integrity.test.ts` gains a tampered-link-id case beside `payerId: 'client-foreign'` (`:108`); new `_shared/invoice-links.test.ts` (pattern, path, url, nonce url, null fallback) and `_shared/invoice-check-intent-core.test.ts`.

**Jest (client-portal)** — the parser (forbidden keys at depth, malformed token, null passthrough, the settling discriminator); the sheet's fee/total/label arithmetic against `onlineSurchargeCents`; the moved chooser test; `state`, `checkout` and `pay/return/[nonce]` route handlers; `checkout-return.test.ts` for the `hash` param; `retired-routes.test.ts` (W3b); the AASA test asserting `/pay/*` absent; **`posthog-privacy.test.ts`** for the `pay` redaction; the S11 `callbackUrl` case. Coverage floors are enforced (`jest.config.js:71-78`: 70/60/70/70).

**Playwright** — `tests/pay-link.spec.ts`, modelled on `tests/plans-link.spec.ts` (283 lines): mint through honest RPCs against the **local** stack; assert `x-robots-tag`; assert `Cache-Control` matches `/no-store|no-cache/` and never `public|s-maxage|max-age=[1-9]`; **assert `caches.keys()`/`cache.match()` hold nothing for `/pay/`** (S1); toggle ACH/Card/Check and assert the three arrived-at totals, the fee row and the Pay label move together; the nonce route 303s; revoke → dead; garbage → dead; void → dead; void-with-pending → settling sheet.

**Gates** (patina-verification; all `--filter`ed, because turbo silently skips workspaces lacking a script):
```bash
pnpm supabase:reset
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/billing/invoice_links_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/billing/invoice_checkout_integrity_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/billing/studio_invoice_test.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/edge_api/platform_acl_compatibility_test.sql
python3 scripts/generate-legacy-grants.py && git diff --stat supabase/seed/00-legacy-grants.sql
pnpm db:generate && git diff --exit-code packages/supabase/src/database.types.ts
deno test --allow-all --config supabase/functions/deno.json supabase/functions   # no root deno.lock after
grep -rn "p_token\|token\|return_nonce" supabase/functions/invoice-link-checkout | grep -i "console\.\|log(" # expect: no hits (S13)
pnpm --filter @patina/utils type-check && pnpm turbo build --filter=@patina/utils
pnpm --filter @patina/supabase type-check test
pnpm --filter @patina/client-portal type-check test
env -u CI pnpm --filter @patina/client-portal test:e2e -- --project=chromium tests/pay-link.spec.ts
pnpm --filter @patina/designer-portal type-check lint test
pnpm --filter @patina/admin-portal build     # the repo's strictest gate; @patina/utils changed
```
`client-portal build` is not a type gate (`next.config.js:47-49`); `type-check` is. Only designer-portal's lint is meaningful.

---

## 12 · Migration, deploy order, rollback

`ls supabase/migrations | tail` → head **`00573_approval_record_typed_name.sql`** (00570 is absent on main — renumbered to 00571 during the studio-invoice program). Mint **`00574_invoice_links.sql`**; re-check at build time.

One file: table + indexes + RLS + grants · mint trigger · backfill · the `invoice_checkout_attempts` alter (`invoice_link_id`, `return_nonce`, XOR CHECK) · the five modified money RPCs (§2.5) · the ten new RPCs · the sweep + `cron.schedule` + registry comment · the batched REVOKE/GRANT block · a banner naming the grafted head bodies (`claim_invoice_link_checkout_attempt` from `00428:190-397`; `finalize`/`recover` from `00428:414`/`:505`; `void_invoice` from `00397:1271`).

| # | Step | Why here |
|---|---|---|
| 0 | `00574` **and** the regenerated `00-legacy-grants.sql` committed together | D2 — the seed is a repo artifact for local resets, not a prod action |
| 1 | `supabase db push` | House law: migrations first. Additive; the backfill makes every open invoice linkable and nothing points at a link yet |
| 2 | `./infra/deploy-portal.sh client` | **The deviation.** `/pay/[token]` and `/pay/return/[nonce]` must exist before any function emits them — the rule `create-checkout-session/index.ts:284-302` already documents for return addresses. The house order guards portal→DB, which step 1 satisfies. **Purely additive (D1)**: the letterbox and the print sheet stay live |
| 3 | `./infra/deploy-portal.sh designer` | Copy link / Regenerate against a working route. `@patina/utils` dist rebuilt by Phase 1 — never a raw `opennextjs-cloudflare build` |
| 4 | Re-grep the `_shared` importer set (D3), then `supabase functions deploy invoice-link-checkout --no-verify-jwt` and the other five by name | Letters and return URLs flip. `config.toml` must already carry the `verify_jwt = false` block |
| 5 | Smoke | (a) no zone Cache Rule matches `/pay/*`; (b) `wrangler deployments list --name patina-client-portal` — **bottom** row; (c) response headers on a real `/pay/<token>`; (d) **a service-worker cache check** — `caches.keys()` empty (D4/S1); (e) **a sandbox card payment on a payer-less invoice**, end to end, then SELECT the `invoice_payments` row and confirm a receipt was addressed to the Checkout-collected email (D4/M1/M5); (f) 31 rapid requests → dead link (S4); (g) `cron.job` carries `invoice-checkout-attempts-expire` and `job_runs` gains a row within the hour; (h) `wrangler tail`. `/api/version` proves liveness only |
| 6 | **W3b**, later, after soak | Retire settle-in-place and the print sheet: `./infra/deploy-portal.sh client` again |
| 7 | iOS (W4) | The legacy JWT path stays valid until then |

**Rollback, per step — each alone (D1).** (4) redeploy each function's prior version: letters revert to `/invoices/<id>`, `create-checkout-session` returns to the letterbox, and any `/pay` link already in the wild **still works**, because step 2 is still deployed. (3) redeploy the designer portal from the prior commit: Copy link disappears, links keep working. (2) redeploy the client portal from the prior commit: `/pay` links 404 — so revert (4) first, but nothing a homeowner reaches through the letterbox is lost, because W2 removed nothing. (6) reverts independently of everything else. (1) is additive: `DROP TRIGGER invoice_link_mint_on_issue ON public.invoices;` freezes minting without breaking a link, and `cron.unschedule('invoice-checkout-attempts-expire')` stops the sweep. `payer_id DROP NOT NULL` cannot be reversed once a link attempt exists, and should not be — it is a widening, which is why M1–M4 must be right the first time and why W1 gets a second review pass after the fixes.

---

## 13 · Waves

| Wave | Files | Gate | Exit criterion | Size | Parallel |
|---|---|---|---|---|---|
| **W1 · Link + guest rail** | `00574`; `00-legacy-grants.sql`; `_shared/invoice-links.ts`, `invoice-checkout-core{,.test}.ts` (moved), `invoice-checkout-stripe.ts`, `invoice-checkout-driver.ts`, `invoice-check-intent-core.ts`; `invoice-link-checkout/index.ts`; `create-checkout-session/index.ts` (imports, payer param, the two guards, nonce URLs); `stripe-webhook/{index.ts,invoice-checkout-integrity{,.test}.ts}`; `invoice-check-intent/index.ts`; `config.toml`; `invoice_links_test.sql`; the two ACL tests + the `:748` literal; the Deno tests | the four psql suites → `db:generate` clean → `deno test` → the S13 grep | A token resolves clean; guest checkout opens a session for **both** a household-payer and a payer-less invoice; actor change supersedes rather than raising; `anon` holds EXECUTE on none of the ten | **L** | own worktree |
| **W2 · The page, additive** | `app/pay/[token]/*`, `app/pay/return/[nonce]/route.ts`; `middleware.ts` (all bearer prefixes); `app-chrome.tsx`; `next.config.js` (NetworkOnly); `posthog.ts` + `events.ts` + `posthog-privacy.test.ts`; `checkout-return.ts`; `wrangler.jsonc`; `tests/pay-link.spec.ts` | `client-portal type-check test` + `test:e2e … pay-link.spec.ts` | Nine states render; the toggle moves the three totals, fee row and Pay label together; 390px no h-scroll; print collapses with the colophon; `caches` empty for `/pay/`; the token never reaches PostHog. **Letterbox and print sheet untouched** | **L** | own worktree; needs W1's RPCs locally |
| **W3 · Producers + folio** | `stripe-webhook:418,517` + the `:414-420` comment; `invoice-send:259`; `invoice-reminders:353`; `resolveRecipient`; `invoice-folio.tsx`; `use-invoices.ts` + `hooks/index.ts`; `packages/utils/src/invoice-link.ts` + barrel; the deploy chain | `utils` type-check + turbo build; `supabase`; `designer-portal type-check lint test`; `admin-portal build` | Every producer emits `/pay/<token>`; Regenerate refuses mid-payment; a payer-less receipt reaches the Checkout email | **M** | after W2 |
| **W3b · Retirement** | delete `settlement.tsx` + tests; letterbox hooks and render; delete `app/invoices/[invoiceId]/print/`; `retired-routes.ts:92-97,148-154` + its test | `client-portal type-check test`; e2e | Settle-in-place gone; `/invoices/<id>/print` folds. **Separate deploy, separately revertible** | **S** | after soak |
| **W4 · iOS + record** | `InvoicesAPIClient.swift`, `InvoiceDetailView.swift`; **R137** in `DECISIONS.md` (R136 is the last) recording K1's supersession of R135's "the acts never leave the page" *and* the I1 reversal of the `/invoices/*` applinks ruling; PostHog dashboard wiring; follow-ups (folio colour cleanup per G6, `pay.patina.cloud` ruled never per V1) | patina-ios-verification: Release-scheme simulator launch + a device pass | Pay opens `/pay/<token>` in `SafariView`; the invoice settles on dismissal | **S** | after W3 |

W1 ∥ W2 in separate worktrees (patina-parallel-work); W2 stubs its RPC calls until W1's migration lands locally. W3 serialises after both; W3b after soak; W4 last.

---

## 14 · File list

**Create** — `supabase/migrations/00574_invoice_links.sql` · `supabase/functions/invoice-link-checkout/index.ts` · `_shared/invoice-links{,.test}.ts` · `_shared/invoice-checkout-stripe.ts` · `_shared/invoice-checkout-driver.ts` · `_shared/invoice-check-intent-core{,.test}.ts` · `supabase/tests/billing/invoice_links_test.sql` · `apps/client-portal/src/app/pay/[token]/{page.tsx,invoice-link.ts,invoice-sheet.tsx,settling-sheet.tsx,payment-method-chooser.tsx,checkout/route.ts,state/route.ts}` · `app/pay/return/[nonce]/route.ts` · `apps/client-portal/tests/pay-link.spec.ts` · `packages/utils/src/invoice-link.ts`

**Modify** — `create-checkout-session/index.ts` (`_shared` imports; `ensureStripeCustomer(…, caller.id)`; the `:853`/`:973` guards; nonce return URLs at `:303-314`) · `stripe-webhook/index.ts` (`:207` select, `:319-349` `resolveRecipient`, `:414-420` comment, `:418`, `:517`, `:607` payer-email capture) · `stripe-webhook/invoice-checkout-integrity{,.test}.ts` (`:6`, `:101`, `:107`, test `:108`) · `invoice-send/index.ts:259` · `invoice-reminders/index.ts:353` · `invoice-check-intent/index.ts` (adapter) · `_shared/invoice-checkout-core.ts` (moved in; `:15-40` types, `:156-187` identity) · `supabase/config.toml` · `supabase/seed/00-legacy-grants.sql` (regenerated) · `supabase/tests/edge_api/{public_rpc_authorization_contract_test.sql,platform_acl_compatibility_test.sql}` · `supabase/tests/billing/invoice_checkout_integrity_test.sql:748` · `packages/supabase/src/database.types.ts` (regenerated) · `packages/supabase/src/hooks/{use-invoices.ts,index.ts}` · `packages/utils/src/index.ts` · `apps/client-portal/src/middleware.ts:144-147,153-162` · `components/layout/app-chrome.tsx` · `lib/analytics/{posthog.ts:83,events.ts,__tests__/posthog-privacy.test.ts}` · `lib/threshold/checkout-return.ts:75` · `next.config.js:19-36` · `wrangler.jsonc` · **W3b:** `components/threshold/letterbox.tsx`, `lib/retired-routes.ts:92-97,148-154` · `apps/designer-portal/src/components/document/accounts/invoice-folio.tsx:265-276,634-664` · `apps/mobile/Patina/…/{InvoicesAPIClient.swift:257-277,InvoiceDetailView.swift:255}` · `docs/design/the-document/DECISIONS.md` (R137)

**Delete (W3b only)** — `components/threshold/settlement.tsx` + tests · `app/invoices/[invoiceId]/print/page.tsx`
**Moved, not deleted** — `components/threshold/payment-method-chooser.tsx` + `__tests__/` → `app/pay/[token]/` · `create-checkout-session/invoice-checkout-core{,.test}.ts` → `_shared/`

---

## 15 · Open rulings for Kody

Everything else the architecture raised has been ruled (T4 §"The architect's seven open rulings"). Four remain:

1. **`PAY_LINK_RATELIMIT` namespace id.** Account-scoped integer chosen by the author; no Patina Worker has one today. Must be settled before W2 ships, and no other Patina Worker may reuse it.
2. **"Withdrawn by {studio}" vs dead.** Default stays dead (K2). The settling sheet (§3.2) now exists, so the softer state is a two-line variation on a sheet Kody can look at rather than an abstract choice.
3. **Stripe's own receipt emails in live mode.** Belt-and-braces behind M5's `payer_email` path; dashboard-gated and off by default in test mode. Confirm they are on before the first real guest payment.
4. **The standing `STRIPE_SECRET_KEY` account mismatch** (`docs/ops/stripe-rail-verification.md:1-7,36-45`) — two different Stripe accounts are in play, and the key almost certainly still holds the sandbox account's. **This must be fixed before any guest payment is real**; it is a pre-condition on the whole feature, not a follow-up.
