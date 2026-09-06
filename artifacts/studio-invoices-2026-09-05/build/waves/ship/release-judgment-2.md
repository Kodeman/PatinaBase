# Studio invoices — release judgment 2 (post-merge)

**Judge:** release judge (read-only; separate context) · **Date:** 2026-09-05
**Worktree:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-integration`
(`git -C <wt> rev-parse --show-toplevel` → that path) · **Branch:** `studio-invoices/integration`
**Judged:** `e6ef1b821` (the brief's sha). HEAD at judging time was `9e0245ab1`, one docs-only
commit past it (`walk-merge-r1.md` + 39 screenshots); `git log --oneline e6ef1b821..HEAD` shows
exactly that commit and no code.

## Verdict — **ship** (no blocker, no major)

The first judgment blocked on one thing: the branch was behind a production that had moved
(B1). That is closed. The code findings of the first judgment stand as they were — every
function body is a true-head rebase, no money write leaves the rail, RLS is additive, the flag
is fail-closed on the designer side and absent on the client side, the deploy set is complete
and its order is forced by the schema. F1 and F5 are closed; the rest are minor/nit and carried.

---

## B1 — closed, verified with a fresh fetch (unsandboxed)

```
git -C <wt> fetch origin main            → * branch main -> FETCH_HEAD
git -C <wt> rev-parse origin/main        → 7d7a8ef2b5745225886c043be7f4df0812dd93b9
git -C <wt> log --oneline HEAD..origin/main   → (empty)
git -C <wt> log --oneline origin/main..HEAD | wc -l   → 109
git -C <wt> log -1 --format='%h %P' 8168ef4f4 → 8168ef4f4 09a06eb7c 7d7a8ef2b   (the merge; second parent = origin/main tip)
```

`origin/main` has not moved since the merge; the branch is a strict superset of it. The
merge's conflict resolutions were the two the first judgment predicted (`threshold.test.tsx`
imports; `00-legacy-grants.sql` regenerated). `git diff --stat origin/main HEAD --
_shared/decision-notify.ts _shared/project-approval-notification.ts` is **empty** — the
approvals modules our deploy set re-bundles are byte-identical to what main already shipped.

**Strata pre-flight (read-only, `supabase --workdir <main checkout> migration list --linked`):**
remote ledger ends `…, 00566, 00567, 00568, 00569`. No `00570` anywhere; the worktree's local
ledger is `… 00568, 00569, 00571`. A `db push` from the worktree will find **exactly `00571`
pending.**

---

## (a) Every plan item — delivered or deferred with a reason

Rulings S1–S12 re-read (`build/rulings.md`); the first judgment's table stands. Changes since:

| item | state now | evidence |
|---|---|---|
| F1 — stale "do not SEND until W3" comment in `create-checkout-session/index.ts` | **closed** | `git show 37b15a35f`: the nine-line block replaced with the delivered order (migration → functions → designer → client) |
| F5 — void result copy "the number retired" | **closed** | `invoice-folio.tsx`: now `'invoice voided · the letter withdrawn, nothing else released'`; test re-pinned; re-walk step 7 proves it on screen |
| W2-A4 pre-existing red (`client-note-composer.test.tsx`) | **gone** | main's clock freeze came with the merge; full designer jest 515/515 suites, 6174/6174 |
| S9 Desk need line · F2/R3-12/R3-13 roster-status filters | deferred — W4 by ruling | unchanged |
| S11 iOS null-safety only | delivered | `InvoicesAPIClient.swift:189` selects `title`; `BudgetMath.projectScopedRollup` present beside main's `PaymentTermsDisplay` change |

Changed-file set vs `origin/main` (non-artifact): **63 files** — client-portal 20, designer-portal
13, iOS 5, `@patina/supabase` 6, edge 13, one migration, one seed, two SQL tests, `DECISIONS.md`
(R136 at line 10724). `apps/admin-portal`, `apps/manufacturer-portal`, `supabase/config.toml`,
`apps/*/wrangler.jsonc`, `infra/` — **no diff**.

## (b) Function bodies rebased on their true heads — re-verified on the merged tree

Anchored grep, merged tree (`grep -rln "CREATE OR REPLACE FUNCTION[^(]*<name>" supabase/migrations/*.sql | sort`):

```
set_invoice_studio_id         → 00318, 00511, [00571]    true head = 00511   (00569 does not touch it)
apply_invoice_payment_effects → 00178, 00277, [00571]    true head = 00277
resolve_studio_identity       → 00320, [00571]           true head = 00320
create_draft_studio_invoice   → new in 00571
```

Body-to-body diffs, extracted `CREATE … $$…$$` blocks, run by me:

```
set_invoice_studio_id   00511→00571 : 0 removed / 210 added   (442 → 652 lines; project path byte-identical)
apply_…_effects         00277→00571 : 68c68,69  '— ' || COALESCE(pr.name, i.title, 'Studio invoice')
                                      77c78     JOIN projects → LEFT JOIN projects
resolve_studio_identity 00320→00571 : +p_studio_id uuid DEFAULT NULL; +step 0 (active design_studio only);
                                      step 1 guarded `v_studio_id IS NULL AND`; nothing else removed
```

Contract pin recomputed (sha256 of the `$$` body):

```
00571  3a556842c060e47d90ce8b3b04a0b6f3e726a390f2a2446b0dee599862390a4c  = public_sd_hardening_contract_test.sql:1724
00511  3ce8183f5490b21a6a087a6a21e8e36c2c1b4c51d1577da614799a473f99099b  (old pin; method proven)
```

`DROP FUNCTION IF EXISTS resolve_studio_identity(uuid, uuid)` prod-safety: the eleven
migrations that mention the name were checked — no `CREATE VIEW` body and no `BEGIN ATOMIC`
(zero in the repo) references it; 00556's `admin_studio_overview` view body does not call it.
Every caller is a plpgsql body or a comment, so no `pg_depend` row blocks the DROP. The local
reset (00569 then 00571) and the 157/158 SQL run are the replay proof.

## (c) Money writes, RLS, grants — re-read on the merged diff

- `stripe-webhook/index.ts` diff vs `origin/main`: the `InvoiceJoined` shape (+`studio_id`,
  `title`, nullable `project_id`), the `loadInvoiceJoined` select (+ an error log), the
  letter/desk-line names via `_shared/invoice-subject.ts`, and `invoiceBrandingRef` for the
  co-brand. **No status write, no `invoice_payments` write, no RPC call changed.**
- `create-checkout-session/index.ts` + `invoice-checkout-core.ts`: the payable select, the
  Stripe line label, and the return address (`invoiceCheckoutReturnAddress` →
  `clientProjectLink`, which yields `/` for a null project and `/projects/<id>` otherwise;
  `{CHECKOUT_SESSION_ID}` spliced after encoding). Nothing on the settle path.
- Migration: `create_draft_studio_invoice` inserts `status` = draft only; every amount is
  `round(quantity * unit_amount_cents)::integer`, `unit_amount_cents` bounded `0..1e9`;
  `kind <> 'adhoc'` raises; roster + `has_designer_domain_role` gate the stamped designer.
- RLS: three additive `TO authenticated` SELECT policies keyed on `invoices.client_id`, all
  `status <> 'draft'`; 00178's project-keyed policies untouched. SQL suite seeds a household,
  a second household and a stranger and probes the boundary (`studio_invoice_test.sql:286+`).
- Grants: `create_draft_studio_invoice` REVOKE from PUBLIC/anon/authenticated/service_role/
  dashboard_user → GRANT authenticated, asserted by `DO $studio_draft_roster$` (owner, secdef,
  search_path, lock order, ACL tuple); `apply_invoice_payment_effects` service_role only;
  `resolve_studio_identity(uuid,uuid,uuid)` anon/authenticated/service_role (brand-only).
  Seed regenerated by the script (36+/12− vs main).

## (d) The flag

Designer: exactly one gate — `invoice-composer.tsx:114 useFeatureFlag('studio-invoice')`;
the hook defaults `{ value: false, isLoading: true }`, SSR-safe, honours
`NEXT_PUBLIC_FLAG_OVERRIDES`. Prod `wrangler.jsonc` top-level vars carry **no** override (the
only `NEXT_PUBLIC_FLAG_OVERRIDES` is `room-file:true` in the staging env block, line 111), so
prod resolves through PostHog and fails closed until Kody creates the flag. Re-walk flag-off:
50 samples / 0 frames with the option; the ledger still renders existing studio rows (S10).
Client: `useFeatureFlag` has zero call sites outside its hook file — flagless per R135.

## (e) Deploy set and order

Independent fixpoint walk over relative imports from the three changed `_shared` modules
(`invoice-emails.ts`, `invoice-subject.ts`, `studio-identity.ts`; `decision-notify.ts` and
`project-approval-notification.ts` enter as importers): **20 functions**, identical to the
steward's list. All 20 exist on Strata (`functions list`, read-only); `stripe-webhook` is
`verify_jwt=false` there and in `config.toml`, the other 19 true. `config.toml` has no diff.

Order (hard, schema-forced — the functions select `studio_id, title`):

1. `supabase db push` → `00571_studio_invoices.sql` (pre-flight: `migration list --linked`
   must show 00569 applied and exactly 00571 pending)
2. `supabase functions deploy` × 20: client-invite, commercial-document-notify,
   create-checkout-session, decision-first-notice, decision-reminders, decision-resolved-notify,
   expire-decisions, invoice-check-intent, invoice-reminders, invoice-send, notification-digest,
   notification-dispatch, po-send, proposal-nudge, proposal-sign-confirmation,
   quote-request-send, review-requests, spec-pdf, stripe-webhook, trade-rfq-send
3. `./infra/deploy-portal.sh designer-portal` (from the merged tree, never `opennextjs-cloudflare build` directly)
4. `./infra/deploy-portal.sh client-portal`
5. Flag `studio-invoice` (Kody; see g)

Admin and manufacturer portals: no diff vs main — do not deploy. No NestJS service or
Cloudflare Container unit changed.

## (f) Rollback — before-set captured read-only at judging time

- **Workers** (`wrangler deployments list`, bottom row = live):
  designer `c0937064-91c1-45b5-9187-48dd976e09c7` (2026-09-05T23:20Z);
  client `c64e78bc-32e0-4896-86d9-d781a96f6b37` (2026-09-05T23:17Z). Both are the approvals
  W2 deploys the first judgment named; still live.
- **Functions** (Strata versions now; rollback = redeploy from an `origin/main` checkout):
  client-invite v40 · commercial-document-notify v22 · create-checkout-session v44 ·
  decision-first-notice v2 · decision-reminders v43 · decision-resolved-notify v43 ·
  expire-decisions v43 · invoice-check-intent v19 · invoice-reminders v43 · invoice-send v44 ·
  notification-digest v40 · notification-dispatch v42 · po-send v45 · proposal-nudge v40 ·
  proposal-sign-confirmation v37 · quote-request-send v38 · review-requests v39 · spec-pdf v36 ·
  stripe-webhook v48 · trade-rfq-send v19.
- **Migration:** `title`, nullable `project_id`, `chk_invoices_anchor`, `idx_invoices_client`,
  three policies — additive, droppable. Bodies restorable: trigger from `00511:2616` +
  definition `00511:3076` (drop `title` from `UPDATE OF`, re-pin `3ce8183f…`);
  `apply_invoice_payment_effects` from `00277:128`; `resolve_studio_identity` = DROP the
  3-arg and recreate from `00320:27`. **`NOT NULL` cannot be re-added once a studio row
  exists** — void such rows first or leave `project_id` nullable.
- **Instant lever:** disable the PostHog flag, or `NEXT_PUBLIC_FLAG_OVERRIDES=studio-invoice:false`
  in the designer `wrangler.jsonc` prod vars + redeploy.

## (g) Owed to Kody

1. Create PostHog flag **`studio-invoice`** targeted to Middle West (kochaver/patina domains);
   verify against `/flags` with a real-browser UA **before** enabling (the `threshold` flag
   matched everyone on 2026-09-04).
2. Prod walk as a two-studio designer: draw from each studio, issue, letterhead + number
   series, record a check, Earnings row with `project_id` NULL.
3. **Live Stripe never exercised** — no Checkout leg, webhook settle, ACH or surcharge on a
   studio invoice (local key is `sk_test_fake_local_no_real_calls`). A prod test-mode card +
   ACH on a studio invoice, then the `designer_earnings` row.
4. Ruling on ios-r3-3: the iOS Budget empty state reads "Nothing billed yet" for a
   studio-invoice-only homeowner (consequence of S11).
5. Tell the approvals peer `00571` is on main once merged, so their `00572/00573` push follows
   a `git merge main`. Mint W4+ from `00574`.
6. `stripe-rail.test.ts` harness (W2-A1 / F7): `designerA` needs a designer-domain role in
   `seed()` — pre-existing red that blocks every future money-rail Deno gate.

## Findings (every one, severity + confidence)

| id | sev | conf | finding |
|---|---|---|---|
| F2 | minor | 0.9 | A studio draft voided before issue is API-readable by the household (`status <> 'draft'` admits `void`). Parity with 00178's project policy; never rendered. |
| F3 | minor | 0.9 | `designer_clients.status` unfiltered in the trigger's roster EXISTS and the RPC — a `lead` roster row admits the household. W4 with R3-12/R3-13. |
| F4 | minor | 0.85 | S12 (title required) is the composer's law only; service_role may insert `title NULL`. Every reader falls back. |
| F6 | minor | 0.8 | `internal_notes` reaches the household through the whole-row household policy — parity with 00178; program-wide. |
| F7 | minor | 1.0 | Deno null-project webhook case (`stripe-rail.test.ts:498`) never executes — harness dies at seed (pre-existing). Houseless settle proven by the SQL suite only; live rail owed (g-3). |
| F8 | nit | 0.85 | Houseless door reads "From the studio · not for a house" where deck M5(b) draws "From the studio" alone. |
| F9 | nit | 1.0 | Receivables meta "9d overdue" and the designer AR-escalation email (`invoice-emails.ts:419`, pre-existing, re-indented only) say "overdue"; designer-facing, never a homeowner. |
| F10 | nit | 0.85 | `useLetterPayee` issues a second `resolve_studio_identity` per house view under a key that never hits Threshold's. |
| F11 | nit | 0.8 | `CREATE INDEX idx_invoices_client` non-CONCURRENTLY inside the migration's `BEGIN;/COMMIT;` — brief lock on a small table (the wrapper is the same six neighbors 00554–00567 used on Strata). |
| F12 | nit | 0.85 | "Studio invoice" reaches Stripe's Checkout line only when `title` is NULL (composer forbids it). |
| F13 | nit | 0.7 | `YourDesignerSeat.urgentProjectId` nil for a studio invoice; with two designers the iOS home seat may name the wrong one. |
| F14 | nit | 0.9 | (M1-3) On a front door holding several letters, the pending/cancelled Checkout-return lines do not name the invoice (`letterbox.tsx:226-231`, `road-orders.tsx:108-113`). |
| F15 | nit | 0.9 | (M1-4, seed-shaped) Local seed projects with NULL `studio_id` cannot draw a project invoice (`useCreateDraftInvoice` guard predates the program). Not prod. |
| F16 | nit | 1.0 | `direct_order_attribution_test.sql` fails between 00:00–02:00 UTC (fixture rows straddle midnight); identical on `origin/main`, untouched since `ee784a83c`. |
| F17 | nit | 0.9 | `supabase/migrations/_pending/00106_drop_client_messages.sql` sits in a subdirectory the CLI ignores; identical on `origin/main`, not this program's. |

## Walk verdicts read

r1 `fix` (W-1 major → fixed `7f8586ce5`) · r2 `ship` (2 minor, 4 nit) · carry review `ship`
(C1–C7) · **merge r1 `ship`** (eight steps + a project-invoice regression + an approvals W2
smoke on the same client page; W2-4 fixed and re-proved; W-1 holds; one seed-shaped advisory).
