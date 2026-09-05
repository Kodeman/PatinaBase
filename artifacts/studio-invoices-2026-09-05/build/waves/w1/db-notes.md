# W1 DB lane — studio invoices (00570)

Branch `studio-invoices/w1-db`, worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-db`,
base `36b4b539e1f2cb732fb722d84edfe758d6b4008a`.

`deploySet = ['migration 00570_studio_invoices.sql']`

## The migration — `supabase/migrations/00570_studio_invoices.sql`

Minted 00570 (worktree tip was 00568; 00569 is a peer session's). One transaction,
six parts, banner naming rulings S1–S12.

1. **The anchor.** `invoices.project_id` DROP NOT NULL (FK + cascade kept),
   `ADD COLUMN title text` with a COMMENT, and
   `CONSTRAINT chk_invoices_anchor CHECK (project_id IS NOT NULL OR (client_id IS NOT NULL AND studio_id IS NOT NULL))`.
2. **`public.set_invoice_studio_id()` — the real gate.** Body copied from its true head
   (`00511_public_sd_hardening.sql:2616-3057`, confirmed by the anchored grep) with an
   `IF NEW.project_id IS NULL THEN … END IF` branch inserted in BOTH arms, before the
   project lookups; on UPDATE it sits *after* 00511's identity-immutability check, so
   project_id/designer_id/client_id/studio_id stay as immutable on a studio invoice as on a
   project one. `diff` old→new body: **96 lines added, 0 removed** (48 per arm) — every
   project-path line byte-identical. The branch requires an active `design_studio`
   organization, `NEW.designer_id` an active non-guest member of it, `NEW.client_id` present,
   and then either the service_role/postgres early return (same semantics as the project
   path) or an actor that is an active non-guest member. It reads no project and takes no
   lock, so the canonical `root -> user_roles -> memberships -> organization` lock order the
   00511 DO block and the contract test pin is untouched (no `PERFORM role.id`,
   `PERFORM user_role.id`, `PERFORM membership.id`, `PERFORM studio.id`, `FOR SHARE;` or
   `FOR UPDATE;` strings introduced ahead of the root lock).
3. **`public.create_draft_studio_invoice(p_client_id, p_studio_id, p_title, p_tax_rate,
   p_payment_terms_days, p_memo, p_lines) RETURNS uuid`.** SECURITY DEFINER,
   `search_path = pg_catalog, public, pg_temp`, `REVOKE ALL … FROM PUBLIC, anon,
   authenticated, service_role, dashboard_user` then `GRANT EXECUTE … TO authenticated`.
   Guards: `is_active_studio_member(p_studio_id)` plus an explicit active-`design_studio`
   check; the household resolved through `designer_clients` joined to an active non-guest
   `organization_members` row of that studio (the actor's own roster row wins, else the
   lowest-id roster owner), and THAT member stamped as `invoices.designer_id`; memberships
   then organizations locked `FOR SHARE` in canonical order and every authority row
   re-validated after the lock; the 00511:3482-3560 payload checks (array bounds, key
   allowlist, metadata object + reserved-anchor rejection, tax/terms/memo bounds,
   per-line description/quantity/unit_amount_cents/sort_order bounds) minus the
   project-child clauses; a dedicated `kind <> 'adhoc'` rejection with a readable message
   (S6); required non-blank `p_title` (S12); totals computed with 00511's exact rounding
   (`round(quantity * unit_amount_cents)::integer`, `round(subtotal * tax_rate)::integer`).
   Inserts the header (`project_id NULL`, `status 'draft'`, `currency 'USD'`) and its
   `kind='adhoc'` lines, returns the id.
4. **`public.apply_invoice_payment_effects(uuid)`.** Body from its true head
   (`00277_refund_reconciliation.sql:128-271`) with exactly two deltas on the forward
   earnings INSERT: `JOIN projects pr` → `LEFT JOIN projects pr`, and the description
   `'… — ' || pr.name` → `'… — ' || COALESCE(pr.name, i.title, 'Studio invoice')`.
   The refund-contra leg is untouched.
5. **Client RLS, additive.** `invoices_household_select`,
   `invoice_line_items_household_select`, `invoice_payments_household_select` —
   `TO authenticated`, `client_id = auth.uid() AND status <> 'draft'` (child tables via
   `EXISTS invoices i`). 00178's three project-keyed client policies are untouched.
6. **`public.resolve_studio_identity`.** `DROP FUNCTION … (uuid, uuid)` then CREATE the
   3-arg form with `p_studio_id uuid DEFAULT NULL`; when it is given, the organizations row
   is read directly and neither the project nor `_primary_studio_for` is consulted (S8).
   Grants/COMMENT re-applied. Drop+create rather than an overload so PostgREST `rpc` stays
   unambiguous; every in-repo caller passes two arguments and still resolves.

### Deliberate deviations from the brief, and why

- **`designer_earnings.project_id` stays `i.project_id`, not `pr.id`.** With the LEFT JOIN the
  two are identical (both NULL when there is no house), and keeping `i.project_id` leaves that
  line byte-identical to 00277.
- **SD roster registration.** 00511's canonical-lock-order roster (migration `:7189`,
  contract test `:2443`) is a closed VALUES list that requires a `PERFORM user_role.id`
  roles-catalog lock; a studio invoice has no project lead, so no designer-domain role is
  read and that lock does not exist. Instead 00570 carries its own
  `DO $studio_draft_roster$` block asserting the same things 00511 asserts about
  `create_draft_invoice`: overload universe = 1, owner postgres, plpgsql, SECURITY DEFINER,
  volatile, non-strict, non-leakproof, `proconfig = search_path=pg_catalog, public, pg_temp`,
  result `uuid`, `PERFORM membership.id` before `PERFORM studio.id`, and an exact ACL tuple
  of `authenticated/postgres/EXECUTE/not-grantable`. The contract test's closed lists are
  unmodified apart from the re-pinned hash below.
- **`supabase/seed/00-legacy-grants.sql` regenerated** (`python3 scripts/generate-legacy-grants.py`).
  Not named in the brief, but required: the seed's baseline grants EXECUTE on every public
  function to anon/authenticated/service_role and then replays the migrations' REVOKEs, so
  without the regen `create_draft_studio_invoice` would be anon-executable on every fresh
  local stack. The generator also dropped the two now-dead 2-arg
  `resolve_studio_identity` grant statements. +36/−12 lines.

## Hashes re-pinned

`supabase/tests/edge_api/public_sd_hardening_contract_test.sql` (17-row manifest, unchanged count):

| function | old `body_sha256` | new |
|---|---|---|
| `public.set_invoice_studio_id()` | `3ce8183f5490b21a6a087a6a21e8e36c2c1b4c51d1577da614799a473f99099b` | `06609af25c627f49c7b489c07968790c593ce1ad269e6a42e5bda6b1eb0a065a` |

Computed the way the manifest computes it, against the deployed body after the reset:
`encode(extensions.digest(convert_to(prosrc,'UTF8'),'sha256'),'hex')`.

`apply_invoice_payment_effects` is **not** pinned anywhere under `supabase/tests/`
(only referenced by name in an assertion message in `commercial/trade_scope_test.sql`), so
nothing to re-pin. Its new hash, for the record:
`e9bfb420504644f22a81e2c2353bbb5cfdb771f56dfe5ea786de6d0a0d231c93` (5057 bytes).
`resolve_studio_identity` is not pinned in any contract manifest either.

## Tests

- **New:** `supabase/tests/billing/studio_invoice_test.sql` — 15 DO blocks: draft (project_id
  NULL, studio/designer/household stamped, exact totals, two ad-hoc lines) → issue
  (`INV-0001` off `studio_invoice_counters`) → pay (invoice paid, `designer_earnings` row with
  `project_id NULL` and the title in the description) → refund contra (`net_amount = -66000`,
  project still NULL, invoice back to `sent`) → void a fresh draft; the two-studio designer
  drawing off Studio Two's counter while Studio One's stays at 1; the read boundary
  (household reads the issued invoice + its lines + payments but not a draft, co-member
  reads, stranger reads zero rows and is never told the row exists); rejections
  (non-adhoc kind 23514, blank title 23514, empty line array 23514, off-roster household
  42501, non-member studio 42501, hand-rolled foreign-studio INSERT P0001); and
  `resolve_studio_identity(NULL, designer, studioTwo)` returning Studio Two's letterhead.
- **Deno:** `supabase/functions/_tests/stripe-rail.test.ts` gained a studio fixture
  (`ids.studio` / `ids.studioInvoice` / `ids.studioInvPay`, `EVT.studioInv`, `SESS.studioInv`,
  cleanup) and step (a2) — a `checkout.session.completed` on a project-less invoice settles
  and writes a `designer_earnings` row with `project_id === null` and the title in the
  description. **It could not be RUN in this lane** (it is an integration test needing the
  edge-function runtime + Stripe signing secret); it passes `deno check --config
  supabase/functions/deno.json` and must run at integration.
- **`packages/supabase/src/hooks/__tests__/use-invoices.test.ts`**: 4 new cases for
  `useCreateDraftStudioInvoice` (exact RPC arg shape, kind forced to `adhoc`, error surfaced
  verbatim, invalidation of `['invoices']` + `['document-state']` + `['ffe-invoice-coverage']`
  with no `['projects', …]` key) and 1 for `useClientInvoices` (key + unscoped select). 48
  tests pass.
- **New:** `apps/designer-portal/src/lib/document/__tests__/desk-receivables.test.ts` — a
  project invoice still keys on its house; an overdue studio invoice produces no Desk entry
  and does not displace the house rows (ruling S9).
- **`apps/designer-portal/src/components/document/accounts/__tests__/invoice-folio.test.tsx`**:
  `title: null` added to the fixture, plus a studio-invoice case — no `document ↗` doorway,
  and issue/send are called with `projectId: undefined`.

## Portal null-safety (minimal; the feature is Wave 2)

- `invoice-folio.tsx` — five `projectId: invoice.project_id` → `?? undefined`; a
  `documentProjectId` const gates the `document ↗` doorway.
- `accounts-receivables-page.tsx` — two `projectId` → `?? undefined`; house label
  `project?.name ?? title ?? 'Studio'`.
- `accounts-ledger-page.tsx` — house label `project?.name ?? title ?? 'Studio'`.
- `desk-receivables.ts` — `if (!inv.project_id) continue;` before the per-project map.
- `invoice-overlays.tsx` — `if (!projectId) return;` before `router.push('/doc/…')`.
- `apps/client-portal` needed **no** changes; its type-check is green as-is (it reads
  invoices through `useProjectInvoices`, which never dereferences a nullable `project_id`).

## Hooks

`packages/supabase/src/hooks/use-invoices.ts`: `Invoice.project_id: string | null`,
`Invoice.title: string | null` (every invoice select is `*`, so no select changes were
needed), `CreateDraftStudioInvoiceInput`, `useCreateDraftStudioInvoice(options?)` and
`useClientInvoices()`; all four exported from `hooks/index.ts`.
`packages/supabase/src/database.types.ts` regenerated (`pnpm --filter @patina/supabase
generate` against the local stack): `project_id: string | null` and `title` on every
invoices shape, the new RPC, and `resolve_studio_identity` gaining `p_studio_id?`.

## Stack

`supabase db reset` was run twice. The **first** run picked up the main checkout instead of
this worktree (this agent's cwd resets between tool calls, so a bare `cd` does not stick);
it replayed main's ledger to 00568 and so dropped the peer 00569 that was on the shared
local stack. The **second** run used `supabase db reset --workdir
/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-db` and applied this branch's
ledger, tip **00570**. Both are logged in `stack-reset-notice.md`. Nothing was pushed and no
production object was touched.

## Deferred / for later waves

- Wave 2 owns the composer branch, the ledger/folio "studio" stamp and the `studio-invoice`
  flag; Wave 3 owns the client page and iOS. Nothing of either was built here.
- Edge functions (`invoice-send`, `invoice-reminders`, `create-checkout-session`,
  `stripe-webhook`, `invoice-check-intent`, `_shared/studio-identity.ts`) are NOT in this
  lane's brief and are unchanged — the DB is inert for them until they select `title` and
  pass `p_studio_id`.
- Latent, documented not fixed (plan item 9): `invoices.client_id … ON DELETE SET NULL`
  (00178:33) now conflicts with `chk_invoices_anchor` on a hard profile delete. The purge
  path (00538/00539) anonymizes rather than deletes, so it cannot fire today.

---

## Fix round 1 (review `db-review-r1.md`)

Both listed findings addressed; minors F3–F8 left as advisories (none trivial enough
to touch without widening scope, and none blocks the program).

### F1 — BLOCKER, fixed · `supabase/migrations/00570_studio_invoices.sql`

The studio branch used to `RETURN NEW` for any active non-guest member, on both
arms, with no predicate on state or money. Direct PostgREST DML
(`current_user = 'authenticated'`) could therefore hand-write a `paid` studio
invoice with a spoofed `invoice_number` and a pre-set `amount_paid_cents` — an
ungated status write, and a number that would later collide with
`studio_invoice_counters` under `uniq_invoices_studio_number`.

Both studio branches now apply, after the actor-membership check, the same
clean-draft predicate the project path applies at the `current_user =
'authenticated'` fork: `status = 'draft'`, `invoice_number / issue_date /
sent_at / paid_at / voided_at / void_reason / stripe_checkout_session_id IS
NULL`, `amount_paid_cents = 0`, `reminder_count = 0`, `last_reminder_at /
ar_flagged_at / ar_last_chased_at IS NULL`, plus (UPDATE arm only)
`updated_at` unchanged — `created_at`, `id` and the four identity columns are
already pinned by 00511's immutability check at the top of that arm. When
`current_user = 'postgres'` (every SECURITY DEFINER billing RPC) the branch
returns `NEW` exactly as before, so `issue_invoice`, `void_invoice`,
`record_payment` and the Checkout RPCs are unaffected.

Trigger ordering makes the `updated_at` term safe: on `public.invoices` the
BEFORE-UPDATE triggers are `set_invoice_studio_id` and
`set_invoices_updated_at`, fired in name order (`_` < `s`), so the gate reads
`NEW.updated_at` before `update_updated_at_column()` bumps it — a plain draft
edit from the composer still passes.

Diff against the true head (`00511_public_sd_hardening.sql`) body:
**145 lines added across the two arms, 0 removed** — every project-path line is
still byte-identical.

Re-pinned body SHA-256 at
`supabase/tests/edge_api/public_sd_hardening_contract_test.sql:1708`:

| | value |
|---|---|
| was (00570 round 0) | `06609af25c627f49c7b489c07968790c593ce1ad269e6a42e5bda6b1eb0a065a` |
| now | `e329335f260c48e56032a7445feffea2505cdd11972d23f75949ea9394509c97` (23106 bytes) |

Computed exactly as the contract test computes it, against the deployed body
after the reset:

```
$ psql … -At -c "SELECT encode(extensions.digest(convert_to(prosrc,'UTF8'),'sha256'),'hex')
                 FROM pg_proc WHERE oid = 'public.set_invoice_studio_id()'::regprocedure;"
e329335f260c48e56032a7445feffea2505cdd11972d23f75949ea9394509c97
```

The review's own probes, re-run against the fixed body (transaction rolled
back), now refuse:

```
=== P1 direct INSERT of a non-draft studio invoice as an authenticated member
ERROR:  studio_id_not_designer_studio
CONTEXT:  PL/pgSQL function set_invoice_studio_id() line 197 at RAISE
 P1 spoofed paid studio row exists |     0
=== P1e clean draft direct INSERT still allowed
 P1e clean draft landed |     1
=== P1c direct UPDATE of a studio draft as authenticated
ERROR:  studio_id_not_designer_studio
CONTEXT:  PL/pgSQL function set_invoice_studio_id() line 98 at RAISE
 P1c after refused update | 0 |  | 0 | draft
=== P1f benign draft edit still allowed
 P1f memo | edited
```

Two new blocks in `supabase/tests/billing/studio_invoice_test.sql` pin this as
member A: a direct INSERT of a `paid` row with `INV-9999` → `P0001` and no row;
a direct UPDATE setting `amount_paid_cents`, then one setting `invoice_number`
/ `status` / `sent_at` → `P0001` each, the draft unchanged after both; and a
positive control (a `memo` edit) so the gate cannot pass by refusing
everything. The blocks use a `v_accepted` sentinel rather than a `RAISE
EXCEPTION` sentinel — `RAISE EXCEPTION` defaults to SQLSTATE `P0001`, so the
suite's existing sentinel style cannot distinguish "refused" from "accepted"
when the expected code is itself `P0001`.

### F2 — MAJOR, fixed · `supabase/tests/billing/studio_invoice_test.sql`

The payment leg no longer settles with a direct `invoice_payments` INSERT. It
now drives the same three RPCs the sibling suite drives
(`invoice_checkout_integrity_test.sql:766 / 854 / 999`), as `service_role`,
with the household's `stripe_customer_id` seeded first:

`claim_invoice_checkout_attempt(v_id, household, 'cus_studio_invoice_household',
false, 'card')` → asserts `amount_cents = 66000` and `surcharge_cents = 1980`
(the studio's own 300 bps, read off `studio_billing_settings` by `studio_id` —
the project-less path) → `finalize_invoice_checkout_attempt(…,
'cs_studio_invoice_1')` → `settle_invoice_checkout_payment(…, 67980, 'card')`
→ `outcome = succeeded`, invoice `paid` at `66000` with `paid_at` set, and one
`designer_earnings` row with `status = 'confirmed'` (the stripe rail's status,
where the old direct check-payment insert produced `'paid'`), `project_id
NULL`, `net_amount 66000`, and the title in the description. Plan risk #2 is
now proven by the lane's own suite rather than only by a reviewer probe. The
refund-contra block that follows is unchanged and still passes against the
Stripe payment row.

The Deno case in `supabase/functions/_tests/stripe-rail.test.ts` still needs
the integration runtime and did not run here (unchanged from round 0).

### Gates, fix round 1

| Gate | Result |
|---|---|
| `supabase --workdir <wt> db reset` | clean (logged in `stack-reset-notice.md`) |
| `bash scripts/run-sql-tests.sh` | `total 157 · green 136 · expected-fail 21 · unexpected-fail 0` |
| — `billing/studio_invoice_test.sql` | PASS |
| — `edge_api/public_sd_hardening_contract_test.sql` | PASS (re-pinned hash) |
| — `billing/invoice_checkout_integrity_test.sql` | PASS |
| — `commercial/multi_studio_signature_test.sql` | PASS |
| — `rls/00563_proposal_signing_multi_studio.test.sql` | PASS |
| `pnpm --filter @patina/supabase type-check` | clean |
| `pnpm --filter @patina/supabase test -- use-invoices` | 48 passed |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/client-portal type-check` | clean |
| `pnpm --filter @patina/designer-portal test -- accounts desk-receivables` | 3 suites, 12 tests passed |

### Not regenerated: `packages/supabase/src/database.types.ts`

This round changed no schema shape (one function body, plus tests), so the
committed types stay as round 0 left them. `pnpm db:generate` was run twice
against the local stack to confirm nothing was owed, and **its output is not
deterministic on this machine**: two consecutive runs against the same
unchanged database differ from each other, and both differ from the committed
file by thousands of lines of view-derived `Relationships` entries
(`edge_catalog_products`, `admin_studio_overview`, …) that come and go even
though both views exist (`SELECT relkind FROM pg_class` → `v`, `v`). The
generated file was discarded with `git checkout --`. Flagged as an advisory,
not a lane defect.

### Left as advisories (from the review's minors)

- **F3** — the round-0 reset log is incomplete and the first round-0 reset ran
  against the main checkout, dropping a peer's `00569`. Nothing to fix in code.
- **F4** — `create_draft_studio_invoice` is registered by a `DO` block in the
  migration, not pinned in the contract test's `atomic_draft_catalog_contract`
  manifest, so its body/ACL can drift silently after merge.
- **F5** — `resolve_studio_identity(NULL, designer, <unknown studio id>)` falls
  to the profile identity instead of the project derivation. Unreachable from a
  real invoice (`studio_id` is FK-checked).
- **F6** — the studio branch does not require `has_designer_domain_role
  (NEW.designer_id)` where the project path does. Deliberate (no project lead);
  a member with no designer-domain role can hold a studio invoice's earnings.
- **F7** — `useCreateDraftStudioInvoice` forces `kind: 'adhoc'`, so a
  milestone line becomes an adhoc line instead of surfacing the RPC's
  `check_violation`.
- **F8** — `ADD CONSTRAINT chk_invoices_anchor` is unguarded (harmless on a
  fresh apply); `title` has no length CHECK, so direct DML can exceed the RPC's
  200-char bound.
