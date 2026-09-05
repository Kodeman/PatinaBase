# Report — invoice payment path, money rulings, "Middle West", surcharge

Surveyed 2026-09-05 (Explore agent, read-only). Verbatim report.

---

## 1. Homeowner pay path, end to end

### 1a. The invoice email
`/Users/kody/Code/patina-merged/supabase/functions/invoice-send/index.ts`

- Line 51: `const CLIENT_PORTAL_URL = Deno.env.get('CLIENT_PORTAL_URL') ?? 'https://client.patina.cloud';`
- **Line 235: `const portalUrl = \`${CLIENT_PORTAL_URL}/invoices/${invoice.id}\`;`** — this is the only link the email embeds. It is **a client-portal URL, not a magic link and not a Stripe Checkout URL**.
- Lines 251/262 pass `portalUrl` into `buildInvoiceOverdueNoticeEmail` / `buildInvoiceSentEmail` (`supabase/functions/_shared/invoice-emails.ts`).
- Lines 285–290: the in-app/inbox row carries `deep_link: '/invoices/<id>'` — same address.
- Recipient resolution (lines 186–219): prefers the signed-up `profiles` row, falls back to `designer_clients.client_email` for a not-yet-signed-up client. A client with no account gets the email but hits the sign-in wall at the far end (the account is created by the R73 invite-on-send path, `client-invite` edge fn, not by this function).

`supabase/functions/_shared/client-portal-links.ts:13-18` states the doctrine explicitly:

> `/invoices/<id>`, `/proposals/<id>`, `/decisions/<id>` — claimed by the Patina iOS app's `applinks:` entitlement… The portal's middleware 308s them onto the right anchor for everyone else. Keep sending those.

### 1b. The middleware fold
`/Users/kody/Code/patina-merged/apps/client-portal/src/middleware.ts`

- `/invoices/<id>` is **not** in the public list (lines ~96–140: `isInviteLanding`, `isQuizPage`, `isSharePage`, `isFieldPage`, `isRfqPage`, `isEvidencePage`, `isPlansPage`, `isPiecePage`, `isUnsubscribeOutcomePage`).
- Unauthenticated → `/auth/signin?callbackUrl=/invoices/<id>` (the `if (!isAuthenticated && !isAuthPage && !isPublicPage)` block).
- Then role gate: a non-consumer role goes to `/wrong-portal`.
- Then `retiredRouteTarget()` folds the path with a **308**.

`/Users/kody/Code/patina-merged/apps/client-portal/src/lib/retired-routes.ts:129-138`:
```
// `/invoices/<id>` — the letterbox reads `?invoice=` to name which one.
// `/invoices/<id>/print` keeps its own page.
case 'invoices':
  if (segments.length !== 2) return null;
  return { path: '/', anchor: 'letterbox',
    ...(ID_SEGMENT.test(second) ? { params: { invoice: second } } : {}) };
```
`/invoices` (list) → `{ path: '/', anchor: 'letterbox' }` at line 63.

Net: **`/invoices/<id>` → sign-in → `/?invoice=<id>#letterbox`.**

### 1c. Rendering and paying on the one page
- `apps/client-portal/src/components/threshold/threshold.tsx:266` — `useProjectInvoices(projectId)`; line 803–806 mounts `<Letterbox invoice={model.letterbox} invoices={invoicesQuery.data} onRefetch={invoicesQuery.refetch} />`.
- `apps/client-portal/src/components/threshold/letterbox.tsx` — the envelope; imports `useNamedInvoice`, `useCheckoutReturn`, `useCheckoutConfirmation` from `@/lib/threshold/checkout-return` (line 11–17) and renders `<Settlement>` (line 24).
- `apps/client-portal/src/components/threshold/settlement.tsx` — the act. Lines 68–70: `useInvoicePaymentOptions(invoice.id)`, `useStartCheckout()`, `useNotifyCheckIntent()`. Lines 103–118: `handleSettle()` calls `startCheckout.mutateAsync({ invoiceId, paymentMethod: method })` and the browser goes to Stripe.
- `apps/client-portal/src/components/threshold/payment-method-chooser.tsx` — ACH / card / check.
- Return: `?checkout=success|cancel` on `/projects/<id>#letterbox`, read on mount by `apps/client-portal/src/lib/threshold/checkout-return.ts:27-45`, then cleaned from the query string.
- Print survives as its own route: `apps/client-portal/src/app/invoices/[invoiceId]/print/page.tsx` (authenticated; `retired-routes.ts:92` — "the printable invoice has no in-page equivalent").

### 1d. Does the client need an account to pay? **Yes.**
- No `/pay/`, no `pay-token`, no `public_token`, no `invoice_token` anywhere. `grep -rn "public_token\|share_token\|pay_token\|invoice_token" supabase/migrations/*.sql` returns **only** `supabase/migrations/00004_catalog_enhancements.sql:85,91` — `projects.share_token`, a catalog/project share, unrelated to invoices.
- The eight login-less token surfaces (`/share/`, `/field/`, `/rfq/`, `/evidence/`, `/plans/`, `/piece/`, `/auth/invite/`, `/quiz`) are enumerated in `middleware.ts` and **none of them is a pay page**.

### 1e. The Checkout edge function and its auth
`/Users/kody/Code/patina-merged/supabase/functions/create-checkout-session/index.ts`

- Lines 5–7 (header): *"verify_jwt stays ON (default) — the gateway demands a valid JWT, and this function additionally proves the caller is a party to the thing being paid."*
- Confirmed against `supabase/config.toml`: there is **no `[functions.create-checkout-session]` block at all**, so it inherits the default `verify_jwt = true`. The only `verify_jwt = false` functions are `stripe-webhook` (330), `resend-webhook` (334), `sms-inbound` (340), `sms-status` (345), `comms-mute` (349), `test-account-login` (359), `fulfillment-po` (513), `fulfillment-evidence` (538), `site-request-guest` (556).
- Lines 10–27: three payable types — `{ invoiceId }`, `{ po_payment_id }`, `{ direct_order_id }`; optional `{ payment_method: 'card' | 'us_bank_account' }` **invoices only**.
- Lines 30–36: *"invoice — caller must be the invoice's client"* (plus a test-key-only designer override).
- Callers: `packages/supabase/src/hooks/use-invoices.ts:1067`, `use-direct-orders.ts:185`, `use-procurement.ts:918`, `apps/designer-portal/src/hooks/use-invoice-checkout-reconciliation.ts:25`.

---

## 2. Is there a pay path that does NOT require a project?

### Invoices: no. Hard schema constraint.
`/Users/kody/Code/patina-merged/supabase/migrations/00178_invoices_v1.sql:31`
```sql
project_id  UUID  NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
```
`client_id` is nullable (line 33) but `project_id` is not. Every client-facing RLS policy routes through the project: lines 263, 324–327, 348–351 all read `JOIN public.projects p ON p.id = i.project_id … AND p.client_id = auth.uid()`. **A project-less invoice cannot exist and cannot be read by a client.**

### `direct_orders` — the one payable with no required project
`/Users/kody/Code/patina-merged/supabase/migrations/00276_direct_orders.sql`

Header (lines 1–44):
> a CLIENT buying a Patina-managed product directly ("buy now", no cart). Unlike invoice/po_payment — whose payable rows are created by the designer's own flows — a direct order is minted on demand by the client, so the create path is a SECURITY DEFINER RPC (clients have no INSERT policy).

- Table at line 48: `client_id NOT NULL → profiles`, `product_id NOT NULL → products`, money snapshotted (`product_name`, `quantity`, `unit_price_cents`, `amount_cents`), `status IN ('pending_payment','paid','canceled')`, Stripe pointers. **No `project_id` column in 00276 at all.**
- RLS: clients SELECT own rows only; writes via `create_direct_order(p_product_id, p_quantity)` (SECURITY DEFINER) and the service-role `stripe-webhook`.
- Paid via the same rail: `create-checkout-session` `{ direct_order_id }`.

`/Users/kody/Code/patina-merged/supabase/migrations/00540_direct_orders_attribution.sql:73-75` later adds:
```sql
ADD COLUMN IF NOT EXISTS designer_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS project_id      UUID REFERENCES public.projects(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,4);
```
**Nullable** — so a direct order still may have no project. Header lines 4–7: *"Everything a client 'buy now' order needs so the designer on the job is not cut out of it, and so the client can see the order after she pays."*

### Portal UI for the houseless order — the precedent for rendering money with no project
`/Users/kody/Code/patina-merged/apps/client-portal/src/lib/threshold/road-orders.ts:18-24` (verbatim):
> An order raised without a project stands on the road of exactly ONE of the client's houses — it has no house of its own, and the same lamp drawn in two houses reads as two lamps. `standsUnfiled` is the caller's answer to "is this the house that holds the unfiled ones", decided the same deterministic way the unfiled asks are (the lowest project id the client can open), so the lamp stands in the same house on every visit. It says so on its own line either way.

`RoadOrderModel.houseless: boolean` (line 42), `ClosedOrderModel.houseless` (line 57); filter logic lines 72–92 and 105–120. Rendered by `apps/client-portal/src/components/threshold/road-orders.tsx` at `#road`, paid with `useStartDirectOrderCheckout` (line 5, 58).

**This is the only existing "money with no project" surface in the client portal, and it is solved by adopting the lowest-project-id house, not by a project-less page.**

---

## 3. Prior rulings on invoices / billing / fees / retainers / studio money

### `docs/vision/VISION.md` (96 lines, read in full)

**§3 "How we make money" — lines 38–46, verbatim:**
> Two streams.
> - **Floor — the studio subscription.** Studios pay for The Document. Leah's would; others will. (Price and tiers: open, §7.)
> - **Upside — margin on furniture.** A piece sold through a designer-led project carries Patina margin. **This is where the first real dollar comes from.**
> - **The Pledge** returns a share of *marketplace* margin to the designers who teach the engine. …
> Superseded by this section: affiliate revenue (Jan spine); "designers never pay for their own client relationships" (v4 one-pager, Aug). The v4 numbers themselves (18% blended take · 4% client project fee · 25% Pledge) are still the working figures pending §7.

**§4, line 54:** "**To both:** pricing is one page, public, and stable. No lock-in, no hidden fees. Your data exports."

**§6, line 75:** "**Scope creep and side journeys.** A feature that doesn't serve §2's studio at §2's moment waits."

**§1, line 23:** "3. **The marketplace** — the till."

**Open V-rulings (§7, lines 82–89):**
| ID | Verbatim |
|---|---|
| V1 | "**Margin pocket.** Does Patina's furniture margin come from the maker's trade discount (v4: 18%, carved not stacked) or from the studio's own procurement markup (25%)?" |
| V2 | "**Studio price.** Keep Pro $49 / Studio $149? Any solo tier at all, given the 'first hires' trigger?" |
| V6 | "**Pledge × subscription.** Studios pay a subscription *and* receive Pledge royalties. Coherent on paper (different streams); does it survive Leah's ear and counsel?" |

### `docs/vision/VISION-DECISIONS.md` (138 lines, read in full)

- **S3, line 20:** "Two revenue streams: studio subscription (floor) + furniture margin (upside). First real dollar = margin on a furniture sale. Studios *do* pay for The Document."
- **S2, line 19:** "Homeowners are the studio's clients; makers are the studio's vendors."
- **V8, lines 108–132** (2026-09-04, "the client page"): "**The web client page is surface #1's client-facing face — the homeowner-facing side of The Document — not a fourth ranked surface.**" and "The web client page **may be designed for daily return** the same way the iOS client app already is under V7."

### `docs/design/the-document/DECISIONS.md` (10,722 lines) — money rulings

**R74 · The Invoice folio + the composer — where money is written** (line 2636):
> Invoice detail = an **Invoice folio** (paper DocSheet) opened from Accounts-ledger rows, margin MONEY items, and ⌘K — carrying **Issue & send · Record payment · Resend · Void · Print**… Authoring = an **anti-wizard composer sheet** with self-composing pull-through sections (**milestones · unbilled time · FF&E · ad-hoc**, typed line kinds per 00178/00187), totals via `computeInvoiceTotals`.

**This is the only load-bearing use of "ad-hoc" in the money area: it is a LINE KIND on a project invoice, not a project-less invoice.**

**R75 · Export opens the composer — the time→invoice pull-through** (line 2640) — the Hours ledger's week of unbilled entries pre-claimed as a time section.

**R76 · Bill from the line — FF&E invoicing** (line 2644).

**R77 · The full Hours ledger** (line 2648) — "an **all-time unbilled balance** with a 'bill it' handoff", "**delete-with-confirm on unbilled entries** (billed entries stay immutable)". This is the hourly/time-and-materials path — and it terminates in a project invoice.

**R73 · Invite-on-send — the no-login household send path** (line 2632, verbatim):
> Linking a no-account household to a proposal (or a decision, or any client-facing act) sends a **magic-link invite carrying the document**; the client-portal account is created when they open it. … **One identity model, one new email leg.**

**R79 · The OpenProjectSheet — projects that skip the proposal** (line 2656, verbatim):
> A capture-lead-sheet sibling on the Desk header + ⌘K ("open a project"): essentials only — household (R73 machinery), title, budget band, start date — one RPC, then compose in `/doc/[id]`.

(RPC = `open_project_direct`, `supabase/migrations/00237_open_project_direct.sql` — **the existing answer to "a studio wants to bill without a proposal": open a project directly, then invoice it.**)

**R26 · The Account Page — engagement financials in the document** (line 1042, verbatim excerpt):
> Resolves C-2, the biggest in-document parity gap, **under the ledger rule: engagement-scoped money lives IN the document.** A settled-bar band at the top of the Project section — "The accounts · this project"… the designer-earnings block (**design fee** + est. commissions, linking → Accounts), and payment milestones with INLINE TRIGGER CONFIG (on signing · on production start · when [section] settles · on date)… **Marked "Studio eyes only" and excluded from the client mirror — enforce with a CI test, not a convention.**

**R36 · The Accounts book — the studio's money ledger** (line 1532, verbatim):
> The Accounts book grows pages in the R28 grammar — DM-mono page links, never tabs — and carries three: **Ledger** (invoices: draft / sent / paid / partially-paid / void — the old Billing list), **Receivables** (A/R aging buckets plus the Send-reminder dunning Billing carried), and **Earnings** (**design fees** + Via-Patina commissions + teaching royalties; the Aesthete fold lives here per R37). The opening **front-matter** band … states **Revenue · AR · margin**.

**R37 · The Aesthete fold** (line 1542, verbatim excerpt):
> The **Earnings page reads in two bands.** *What you earn* gathers **design fees** and Via-Patina commissions — client-work income. *What teaching returns* gathers teaching royalties and the running Pledge — taught-taste income. Keeping them apart lets the Designer-Taught loop speak in its own voice instead of dissolving into the invoice stream. The **Pledge is twinned, and the two directions never blur**…

**R30 · Via Patina — the marketplace rail** (line 1099, verbatim excerpt):
> **The brand moment ships with v1: at the instant of ordering, one quiet line shows the commission flowing to her own book and the Pledge's share of it** ("Commission to your Accounts: ~$336 · the Pledge returns $84 as teaching royalty").

**R81 · The Amendment sheet — scope changes** (line 2664) — fee/timeline impacts, "**No list page — the margin and band ARE the status tracking.**"

**R135 · The client page is The Document's homeowner face** (line 10701, verbatim excerpt):
> it is **The Document's homeowner face**, the place where the studio's own client **signs, pays, and reads** the record Nora keeps for her.
> … Every old address … `/invoices`, `/invoices/[id]`, `/budget`, `/documents`, `/orders`… now **redirects to an anchor on the one page** rather than rendering as a route of its own.
> - **The acts never leave the page — including the toll.** `SpineToll` kept an outbound `href` to `/invoices/<id>` for a caller that no longer exists. It is gone; settling in place is the only way the act is taken.
> - **No feature flag.** … **zero clients are live on the platform.**

**R133 · The two CS calls are doctrine** (line 10687) — "a stalled invite — routes to Kody, not to a support queue."

### "retainer" — one hit
`docs/design/the-document/DECISIONS.md:8286` (inside the doc-polish Wave-4 bug lane, **I132**):
> J3 — both halves (ceiling and **retainer**) AND the client-portal commercial shell, which is the surface the client actually reads.

Context is the design-services agreement's fee ceiling/retainer fields in the commercial-document shell, not a standalone retainer-invoice product.

### Terms with **no** hits in `docs/`
`standalone invoice`, `ad-hoc invoice`, `ad hoc invoice`, `consultation fee`, `time and materials`, `project-less invoice`, `projectless` — **zero matches**. The only `project-less` in a money-adjacent context is `docs/design/the-document/DECISIONS.md:2909` and `:2915`:
> "requires a project — **project-less escalation from a sent proposal needs a ruling**" … "rulings queue: markup-setting-not-owner-gated · **project-less C4** · post-sale money edits."

That is the nearest existing open ruling on "act without a project", and it is about the Decision Composer, not invoices.

---

## 4. "Middle West" / "Middlewest"

**Important reframing: Middle West Studio is Patina's own parent company and first customer — Leah Kochaver's / Kody's studio — not an outside studio that filed a request.** ~530 case-variant hits across the repo.

| Path:line | Text |
|---|---|
| `docs/vision/VISION.md:25` | "Patina is a venture of **Middle West Studio** (Madison, WI). Two-person core: Kody (build / infra / ops) and Leah Kochaver (design / voice / teaching)." |
| `docs/vision/VISION.md:33` | "The first homeowner beta cohort is Middle West's active design clients (Kody's words: 'active Patina customers' — read as the studio's current clients; confirm). Patina does not sell to homeowners." |
| `docs/vision/VISION.md:87` | V4 — "**Entity.** Stay a venture of Middle West, or separate LLC before Design Chicago?" |
| `docs/vision/VISION-DECISIONS.md:19` | S2 — "(Kody's phrase for the first homeowner cohort was 'active Patina customers' — read as Middle West's current clients; confirm.)" |
| `docs/vision/VISION-DECISIONS.md:23` | S6 — "Patina remains a venture of Middle West Studio for now (see V4)." |
| `docs/vision/VISION-DECISIONS.md:49` | V4 open ruling — entity/equity/IP/trademark/Pledge counterparty |
| `docs/vision/workshops/2026-09-01-vision-workshop.md:18,20,24,77,99` | "venture of Middle West Studio" (reaffirmed) |
| `docs/vision/recruiting-one-liners.md:42` | "**'Co-founder'** bylines beyond Middle West Studio — V4." |
| `docs/vision/the-compass.html:156,178,244` | published Compass page renders the same |
| `docs/ops/stripe-webhook-reconciliation-2026-08.md:167,180,187,201` | "`…JmCVe1Jxdu` — **Middle West Studio**, the account Kody is signed into" |
| `docs/ops/stripe-rail-verification.md:6,9,13,15,31` | "Kody has since ruled Middle West Studio (`acct_1T6KiLJmCVe1Jxdu`)" as the Stripe account of record |
| `docs/Prog/programa-teardown-patina-gap-map.html:409` | "Patina · Middlewest Studio · July 2026" (colophon) |
| `supabase/functions/_shared/trade-rfq-emails.test.ts:20,31,44,105,107,146` | test fixture `studioName: "Middle West Studio"`, designer "Leah Rowe" |
| `supabase/functions/_shared/quote-request-emails.test.ts:15,19,35,40,88,92` | same fixture |
| `docs/design/the-document/DECISIONS.md:299` | "…act) works against **Middlewest's real data**. Rationale: first impressions don't [lie]" |
| `docs/design/the-document/DECISIONS.md:632` | "lands on **Middlewest's REAL activated projects** — Leah cannot mount the Order [assistant]" |
| `docs/design/the-document/DECISIONS.md:1015` | "(custom sections deferred; **six phases cover Middlewest**)" |

Plus ~30 mock/prototype HTML files under `docs/design/the-document/`, `docs/prds/`, `artifacts/document-*` that use "Middlewest Studio" as the canonical fixture studio name.

**Memory directory** (`/Users/kody/.claude/projects/-Users-kody-Code-patina-merged/memory/`):
- `project_agent_os_program.md:25` — "Prod Stripe = **'Middle West Studio' acct_1T6KiLJmCVe1Jxdu, SANDBOX/TEST-mode ONLY**"
- `project_prod_flow_fixes_2026_09_04.md:16,21` — "Kody's designer account `kody@middlewest.studio` is in **two studios** (Kody Kochaver + Middle West Studio, both created 2026-09-02 after admin studio mgmt 00556)"; org id `7ba72774-…2628`
- `project_ios_testflight_polish_2026_09_01.md:239` — "Leah `ce3aee90-…` / **Middle West Studio `7ba72774-…`**"
- `project_studio_shared_workspace_branding.md:10` — "Prod resolver verified: Kody's designer uuid `74056c2a-…` → '**Middlewest Studio**', source=studio."
- `project_posthog_analytics_buildout.md:10` — PostHog org "Middlewest Studio"
- `project_sanity_help_system.md:10` — Sanity org `obSMhE9bd` (Middle West Studio)
- `project_field_companion_program_2026_08_24.md:47` — code-signing identity `Apple Distribution: Middle West Studio LLC`

**Nothing anywhere in the repo or memory records a "project-less invoice" request from Middle West or any other studio.** There is no such ticket, ruling, or note on disk.

---

## 5. The invoice surcharge

### Migration
`/Users/kody/Code/patina-merged/supabase/migrations/00428_invoice_payment_method_surcharge.sql` (~800 lines)

Header, lines 2–8:
> **00428 — Invoice payment-method chooser + inline surcharge (ACH / card / check).** The client picks the rail BEFORE Checkout: ACH (preferred), card, or mail a check. A surcharge rides along with the online rails and is modelled HERE, in the database, because the 00397 invoice-checkout rail asserts the exact claimed amount at three checkpoints.

**What it is:** the card/ACH **processing fee passed through to the client**, charged as a *second Stripe line item on top of* the invoice balance.

Money invariants (lines 11–26, verbatim):
> `invoice_payments.amount_cents` stays the pure invoice-applied balance. `surcharge_cents` is a SEPARATE column. **Charged gross = amount + surcharge.** … ONE rounding formula, exact integer half-up, lives in `invoice_payment_surcharge_cents`: `(cents::bigint * bps + 5000) / 10000`. The bigint cast is MANDATORY — int4 overflows above ~$71.6k invoices. **ACH = LEAST(formula(cents, 80), 500). Card = formula(cents, studio bps), bps CHECK 0..300, default 300.** The TypeScript twin is `packages/shared/src/invoice/index.ts` — keep them in lockstep. … a caller that omits `p_payment_method` gets NULL → surcharge 0 → today's exact behavior. Required, because iOS calls `create-checkout-session` with `{invoiceId}` only.

**Where it is configured — PER STUDIO, not per invoice** (lines 43–52):
```sql
CREATE TABLE IF NOT EXISTS public.studio_billing_settings (
  studio_id          uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  card_surcharge_bps integer NOT NULL DEFAULT 300
                       CHECK (card_surcharge_bps >= 0 AND card_surcharge_bps <= 300),
  check_remit_to     text, …);
```
Comment, line 92: *"Card surcharge in basis points, 0..300. The 300 ceiling is the card-network cap (3%); some US states restrict surcharging further — a studio that cannot surcharge sets 0."*

Columns added: `invoice_checkout_attempts.surcharge_cents` + `payment_method` (lines 100–117), `invoice_payments.surcharge_cents` (lines 122–141).
Reader RPC: `get_invoice_payment_options(p_invoice_id)` at line 720 — SECURITY DEFINER, `GRANT EXECUTE … TO authenticated` (line 766), readable by "its client, its designer, or an active member of its studio", defaults `{300, null}`, and *"Every denial raises `invoice_not_found` so existence is never confirmed"* (line 769).

### Portal UI
- **Configured by the studio:** `apps/designer-portal/src/components/document/account/account-studio-page.tsx` — line 66 (`bpsToPercentInput`), lines 195–208 (form seed), 479–480 (dirty check), 910 (`${card_surcharge_bps / 100}%`), 916 (`check_remit_to`).
- **Shown to the client:** `apps/client-portal/src/components/threshold/settlement.tsx:76-91` — `cardSurchargeBps` is `null` while `get_invoice_payment_options` is in flight (comment lines 74–79: *"previewing the platform default there over-quotes every studio configured below 3% … over-quoting is survivable, under-quoting is not"*), then `onlineSurchargeCents(method, invoice.balanceCents, bps)`; `chargeTotal = invoice.balanceCents + surcharge` (line 91).
- `apps/client-portal/src/components/threshold/payment-method-chooser.tsx:45,54` — the three rails and the check remit-to fallback.
- **On the printed invoice:** `apps/client-portal/src/app/invoices/[invoiceId]/print/page.tsx:31,323-327` — the "How to pay" block prints `check_remit_to`.
- Shared math: `packages/shared/src/invoice/index.ts:188,203` (`onlineSurchargeCents`, `DEFAULT_CARD_SURCHARGE_BPS`, `CHECK_REMIT_FALLBACK`).

### Memory record
`/Users/kody/.claude/projects/-Users-kody-Code-patina-merged/memory/project_invoice_payment_surcharge_2026_08_05.md` (30 days old — verify before relying on prod claims). Notes still-owed items: an authenticated test-mode prod walk, **a real designer configuring `studio_billing_settings` (table empty → 300 bps fallback everywhere)**, and live Stripe keys.

---

## 6. Proposal → project → invoice pipeline

The normal birth of a project invoice:

1. **Proposal signed** — `sign_proposal` (00210, client-invoked) or `record_offline_signature` (00254, designer-invoked). Both call `activate_proposal_as_project`.
2. **`activate_proposal_as_project`** creates the project, carries boards/doc_codes/custom_fields, and inserts the payment-milestone schedule from the proposal. Body lineage: `00167` → `00180` → `00199` → `00262` → `00269` → **`00274`** (head).
3. **`supabase/migrations/00274_deposit_autodraft_on_signing.sql`** — the deposit invoice is **auto-drafted at signature**. Header lines 2–10, verbatim:
   > **Decision reversal:** 00206 (R34) wired `on_date` milestones to `draft_invoice_from_milestone` and left a note — "on_signing stays a designer act (config stored, drafting manual)". **Product has now reversed that call: signature AUTO-DRAFTS the deposit invoice.** Still draft-only — the designer reviews and sends through the existing Issue & Send flow (`issue_invoice`, 00178); nothing about the review-then-send state machine changes.

   The kickoff milestone (`sort_order = 0`) is stamped `trigger_kind = 'on_signing'` and `draft_invoice_from_milestone(<kickoff id>)` is PERFORMed, guarded to `amount_cents > 0` and wrapped in `BEGIN/EXCEPTION WHEN OTHERS` so a signature always succeeds.
4. **Other birth paths** — `draft_invoice_from_milestone` on later milestones (R26's inline trigger config: on signing / on production start / when [section] settles / on date), the R74 composer (milestones · unbilled time · FF&E · ad-hoc), R75 (Hours week export), R76 (FF&E "Bill →").
5. **Projects that skip a proposal entirely** — R79 + `supabase/migrations/00237_open_project_direct.sql` (`open_project_direct`): household, title, budget band, start date, one RPC. **This is the existing supported route for billing without a proposal, and it still produces a project.**
6. **Issue → send** — `issue_invoice` (00178) assigns the number (studio-scoped since `00318_studio_invoice_numbering_and_ops.sql` / `00513_invoice_numbering_studio_uniqueness.sql`), then the `invoice-send` edge fn.
7. **Chase** — `supabase/migrations/00209_invoice_chase.sql`, `00181_invoice_reminders_cron.sql`, `supabase/functions/invoice-reminders`, `00278_client_reminder_cadence.sql`.

### Invoice/payment-related plans and design docs

`docs/superpowers/plans/` contains only **five** files:
| File | One line |
|---|---|
| `2026-06-11-the-document-slice-1-desk.md` | The Document's first slice — the Desk. |
| `2026-09-03-designer-onboarding-learning.md` | Designer onboarding + the walkthrough (R129–R133). |
| `2026-09-04-the-client-page.md` | Path A vs Path B proposal work for the homeowner's page. |
| `2026-09-04-client-page-completion.md` | Built the Threshold out to cover **every act the old routes performed — including settling an invoice in place**. |
| `2026-09-04-client-portal-retirement.md` | Deleted the old route tree, header and both flags; carries **the full redirect table** (`/invoices/<id>` → `#letterbox`) in its End state section. |

`docs/design/` subdirectories: `authorized-schedule`, `back-of-house`, `capture-launch`, `Chrome ext`, `doc-polish`, `field-capture`, `field-companion`, `ios-*`, `library-variance`, `mood-board-reimagined`, `project-ffe-workflow`, `schedule-fidelity`, `spec-books`, `studio-rosters`, **`the-client-page`**, `the-current-set`, `the-document`, **`the-single-pane`**, `workflow-alignment`, `workflow-completion`. Only `the-client-page/README.md` and `the-single-pane/README.md` are invoice/payment-bearing READMEs. **There is no dedicated invoicing or billing design package.** The invoice rulings live inline in `docs/design/the-document/DECISIONS.md` (R74–R77, R26, R36, R37, R81).

Other money-adjacent docs: `docs/ops/stripe-rail-verification.md`, `docs/ops/stripe-webhook-reconciliation-2026-08.md`.

---

## 7. The client-portal cutover (2026-09-04, "The Client Page")

Sources read in full: `/Users/kody/Code/patina-merged/docs/design/the-client-page/README.md` (187 lines) and `/Users/kody/Code/patina-merged/apps/client-portal/README.md` (127 lines).

### How the "pay" act is placed
- **Anchor:** `#letterbox`. (`the-client-page/README.md:113`: "invoices on `#letterbox`"; `apps/client-portal/README.md` route-map table: "`/invoices`, `/invoices/[id]` → `#letterbox`".)
- **Instrument stack** (`the-client-page/README.md:128-130`, verbatim): "`letterbox.tsx`/`earlier-invoices.tsx`/`payment-method-chooser.tsx`/`settlement.tsx` (money — settle the balance, prior invoices, the checkout return-URL reader)".
- **Instrument type:** the letterbox is a *drawing of a letter standing half out of a slot* that unfolds into `Settlement`, which renders `SpineToll` — one of the six devices inherited from The Making v1, moved to `components/threshold/instruments/` (`spine-toll.tsx`). The act itself is a `ScoredAction` (`instruments/scored-action`). Per R135: *"The acts never leave the page — including the toll… settling in place is the only way the act is taken."*
- **Where money is also stated:** `house-ledger.tsx`/`story-pole.tsx` at `#ledger` ("the money standing and the phase"). Design fixture facts, `the-client-page/README.md:63-66`: "the **money standing** ($61,400 agreed of $85,000, Invoice No. 4 balance $9,125 due 15 August)".

### Could a no-project invoice render there? **No.**
- Both authenticated routes are `/` and `/projects/[projectId]`, and both render the same `<Threshold>` component (`apps/client-portal/README.md`, Route map).
- `apps/client-portal/src/components/threshold/threshold.tsx:266` — `useProjectInvoices(projectId)`. Every query on the page is keyed on `projectId`; line 535 `const hasProject = !!projectId;` gates all of them.
- `/` resolves to a project via `apps/client-portal/src/lib/threshold/active-project.ts` (`pickActiveProjectId`, doc comment lines 1–12) and `apps/client-portal/src/lib/data/active-project.ts`.
- `apps/client-portal/src/app/page.tsx:57-68`, verbatim comment:
  > "No house at all, or not one of them opens (a deletion mid-request, an RLS skew between the two selects): the front door is not the place for a 404. `/projects/<id>` still answers one."
  → renders `<ProjectsEmptyState />`. **A client with no project sees an empty state, not a payable.**
- The DB agrees independently: `invoices.project_id` is `NOT NULL`, and every client RLS policy on `invoices` / `invoice_line_items` / `invoice_payments` joins through `projects.client_id = auth.uid()` (00178 lines 263, 324–327, 348–351).

The only precedent for money that has no project is the **houseless direct order**, which is placed by adopting one house (`lib/threshold/road-orders.ts:18-24`) rather than by rendering a project-less page.

---

## 8. Studio subscription vs. client invoices — not the same thing

**There is no studio-subscription billing in the codebase.** `grep -rln "subscription" supabase/migrations` returns four files, none of them billing: `00021_user_management_foundation.sql` / `00022_seed_roles_permissions.sql` (a `subscription_tier` field / role seeds), `00396_project_phases_realtime.sql` (Postgres realtime subscriptions), `00556_admin_studio_management.sql`. There is **no Stripe subscription, no price/product table, no recurring-billing webhook branch, and no studio invoice-to-Patina table**. `grep -rln "studio_billing" supabase/migrations` returns exactly one file — `00428`, whose `studio_billing_settings` is *not* the studio's bill to Patina but the studio's **surcharge configuration for billing its own homeowners** (`card_surcharge_bps`, `check_remit_to`). `profiles.stripe_customer_id` (00178:178, 725) is the *paying party's* lazily-created Stripe customer for one-off Checkout, used by both clients (invoices, direct orders) and designers (catalog PO payments) — `create-checkout-session` is `mode: 'payment'` only, never `mode: 'subscription'` (index.ts header line 45). The studio subscription exists today **only as vision text** — VISION.md §3 "Floor — the studio subscription. Studios pay for The Document. (Price and tiers: open, §7.)", S3 in VISION-DECISIONS.md, and the open ruling **V2** on price — with zero schema, zero edge function, and zero UI. So "invoices" in this task unambiguously means **studio → homeowner**, and nothing in the invoice rail is entangled with Patina → studio money.

---

## Summary of the binding constraints

1. `invoices.project_id` is `NOT NULL` (00178:31) and every client-facing RLS policy reads through `projects.client_id` — a project-less invoice is currently impossible at the DB layer.
2. The homeowner pay path requires an authenticated client-portal session. No tokenized public pay page exists; `create-checkout-session` runs `verify_jwt = true` and additionally proves the caller is the invoice's client.
3. The one page is keyed on `projectId` (`threshold.tsx:266`, `page.tsx:57-68`) — a client with no project gets `ProjectsEmptyState`.
4. The existing ruled answer to "bill without a proposal" is **R79 / `open_project_direct` (00237)** — open a project directly. The existing precedent for "money with no project" is the **houseless direct order** adopting one house (`lib/threshold/road-orders.ts:18-24`).
5. "Ad-hoc" is already claimed vocabulary: R74's fourth invoice **line kind**, not a project-less invoice.
6. "Middle West Studio" is Patina's own parent and first customer (VISION.md:25, S6), and there is **no record on disk of any project-less-invoice request** from it or anyone else.
