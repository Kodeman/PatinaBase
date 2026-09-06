# W1 DB lane — adversarial review, round 1

Reviewer: separate context (did not write the code). Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-db`, branch `studio-invoices/w1-db`,
range `36b4b539e…HEAD` (4 commits: `c32e628a5`, `699cec925`, `8e5852f30`, `c6cacaee8`).

**Verdict: FIX.** One blocker (a money-path defect the review's own probes reproduced), one major
(test coverage gap on the Stripe rail), the rest minor/nit. No gate is red; every function body was
rebased on its true head.

## Gates run (all green)

| Gate | Result |
|---|---|
| `supabase --workdir <wt> db reset` | clean; ledger tip `00570`, `00568`, `00567` |
| `bash scripts/run-sql-tests.sh` (unsandboxed; sandbox blocks `mktemp`) | `total 157 · green 136 · expected-fail 21 · unexpected-fail 0` — `billing/studio_invoice_test.sql` PASS, `edge_api/public_sd_hardening_contract_test.sql` PASS, `billing/invoice_checkout_integrity_test.sql` PASS, `commercial/multi_studio_signature_test.sql` PASS, `rls/00563_proposal_signing_multi_studio.test.sql` PASS |
| `pnpm --filter @patina/supabase type-check` | clean |
| `pnpm --filter @patina/supabase test -- use-invoices` | 48 passed |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/client-portal type-check` | clean |
| `pnpm --filter @patina/designer-portal test -- accounts desk-receivables` | 3 suites, 12 tests passed |
| `deno check --config supabase/functions/deno.json supabase/functions/_tests/stripe-rail.test.ts` | Check OK (exit 0); the test itself needs the integration runtime and was not run |

Deployed hash of `public.set_invoice_studio_id()` after the reset:
`06609af25c627f49c7b489c07968790c593ce1ad269e6a42e5bda6b1eb0a065a` (21068 bytes) — equals the
re-pinned value at contract test `:1708`.

## True-head verification (anchored grep, run by the reviewer)

| Function | True head | Diff old body → 00570 body |
|---|---|---|
| `set_invoice_studio_id()` | `00511_public_sd_hardening.sql` | **0 lines removed, 96 added** (48 per arm) — every project-path line byte-identical |
| `apply_invoice_payment_effects(uuid)` | `00277_refund_reconciliation.sql` | exactly two hunks: `JOIN projects pr` → `LEFT JOIN projects pr`; description `|| pr.name` → `|| COALESCE(pr.name, i.title, 'Studio invoice')`; refund-contra leg untouched; grants/COMMENT restated identically |
| `resolve_studio_identity` | `00320_studio_branding_read_and_logos.sql` (no later head) | added `p_studio_id uuid DEFAULT NULL`, a step-0 named-studio branch, and `v_studio_id IS NULL AND` on the project step; grants/COMMENT re-applied; 2-arg overload dropped (`to_regprocedure('…(uuid,uuid)')` is NULL after reset); both positional and named 2-arg calls still resolve |
| `create_draft_invoice` | `00511` (not modified; sibling RPC only) | — |

`ls supabase/migrations | tail`: worktree tip `00570_studio_invoices.sql`; main tip `00568` (a peer's
`00569` is in flight elsewhere).

## Reviewer probes (transaction rolled back; psql output verbatim)

Grants: `anon EXECUTE create_draft_studio_invoice = f`, `authenticated = t`, `service_role = f`,
`proacl = {postgres=X/postgres,authenticated=X/postgres}`; `anon EXECUTE resolve_studio_identity(uuid,uuid,uuid) = t`;
`SET ROLE anon; SELECT create_draft_studio_invoice(...)` → `permission denied for function`.

Immutability: `UPDATE invoices SET project_id = NULL` on a project invoice as postgres, service_role,
and authenticated → `studio_id_not_designer_studio` (line 26 RAISE, the identity check) in all three;
attaching a project to a studio invoice, or nulling its `studio_id`/`client_id` → same RAISE.
Direct INSERT with `client_id NULL, project_id NULL` → refused by the trigger before the CHECK.

RPC rejections (all `23514 invalid studio invoice payload` unless noted): negative cents; quantity
100001; extra key `amount_cents`; `milestone_id` key; `metadata.drawId`; missing `sort_order`;
title of 201 chars; `kind='time'` and missing `kind` → `23514 a studio invoice carries ad-hoc lines
only…`; float `unit_amount_cents` 10.5 → `22P02` (jsonb→integer cast, same as 00511). Guest member →
`42501`. Co-member B drafting for a household on A's roster → `designer_id = A`; B then issues
(`INV-0001`, `sent`, due date stamped), chases, and records a partial payment successfully.

Stripe rail (service_role): `claim_invoice_checkout_attempt` → `finalize_invoice_checkout_attempt`
→ `settle_invoice_checkout_payment` on an issued studio invoice → `{"outcome": "succeeded", "amount_cents": 5000, "surcharge_cents": 150}`;
invoice `paid`, `amount_paid_cents 5000`, `paid_at` set; `invoice_payments` row `succeeded / stripe / pi_rv_1`;
`designer_earnings` row `project_id NULL, net_amount 5000, status confirmed, description "Invoice INV-0001 — Checkout probe"`;
the household reads the payment row (count 1). `get_invoice_payment_options` as the household →
`{"check_remit_to": null, "card_surcharge_bps": 300}`. Stranger claim → `invoice_checkout_payer_not_allowed`.

Read boundary: household unscoped `SELECT count(*) FROM invoices` → 3 (`paid, partially_paid, void`);
stranger → 0 invoices, 0 line items.

## Findings

### F1 — BLOCKER · money path · `supabase/migrations/00570_studio_invoices.sql:136-151` and `:211-226`

**Direct authenticated DML on a studio invoice bypasses 00511's clean-draft gate.** The project path
(lines 450-489, byte-identical from 00511) lets a `current_user = 'authenticated'` actor write a row
only when it is a clean draft: `status = 'draft'`, `invoice_number IS NULL`, `amount_paid_cents = 0`,
`sent_at/paid_at/voided_at … IS NULL`, `reminder_count = 0`, and on UPDATE the identity and
`updated_at` unchanged. The new studio branch returns `NEW` for any active non-guest member with no
such predicate, on both arms. RLS does not close it: `Designers can create their invoices` is
`WITH CHECK (designer_id = auth.uid())` with no status term, and the draft-UPDATE policy only pins
`status = 'draft'`.

Reproduced (as `authenticated`, JWT `sub` = member A, i.e. exactly what PostgREST does):

```
=== P1 direct INSERT of a non-draft studio invoice as an authenticated member
INSERT … (project_id NULL, status 'paid', invoice_number 'INV-9999', amount_paid_cents 100000, sent_at now(), paid_at now())
 P1 spoofed paid studio row exists |     1
=== P1b same direct INSERT on a PROJECT invoice
ERROR:  studio_id_not_designer_studio   CONTEXT: set_invoice_studio_id() line 414 at RAISE
 P1b spoofed paid project row exists |     0
=== P1c direct UPDATE of a studio draft as authenticated
UPDATE … SET amount_paid_cents = 9999, invoice_number = 'INV-7777', reminder_count = 5
 amount_paid_cents 9999 | invoice_number INV-7777 | reminder_count 5 | status draft
=== P1d same direct UPDATE on a project draft
ERROR:  studio_id_not_designer_studio   CONTEXT: set_invoice_studio_id() line 414 at RAISE
```

Consequences: an ungated status write (a `paid` invoice with no `invoice_payments` row and no
earnings, counted by `account-summary.ts`), a spoofed number that will collide with
`studio_invoice_counters` under `uniq_invoices_studio_number` (the next real `issue_invoice` at that
number fails), and a pre-set `amount_paid_cents` that survives `issue_invoice`. This is the plan's
risk #1 ("the rewrite loosens the 00511 authority model") realised, and the patina-stripe-payments
rule "never an ungated status write".

Fix: in both studio branches, after the actor-membership check, add
`IF current_user = 'authenticated' THEN <the same clean-draft predicate as lines 462-485> ELSE RETURN NEW`
(the RPC/SD paths run as `current_user = 'postgres'` and keep today's behaviour, as the project
path does at line 494). Re-pin the hash at contract test `:1708`. Add to
`supabase/tests/billing/studio_invoice_test.sql`: a direct INSERT with `status = 'paid'` /
`invoice_number` set → `P0001`, and a direct UPDATE of a studio draft setting `amount_paid_cents`
or `invoice_number` → `P0001`, both as the member.

### F2 — MAJOR · test coverage · `supabase/tests/billing/studio_invoice_test.sql:162-186`

The suite settles the studio invoice with a **direct postgres INSERT into `invoice_payments`**, not
`claim_invoice_checkout_attempt` → `finalize_invoice_checkout_attempt` →
`settle_invoice_checkout_payment`. The brief allowed the direct insert only "if that is how the
sibling suite drives the trigger"; the sibling (`invoice_checkout_integrity_test.sql:766, 854, 999`)
drives the Checkout RPCs. The Stripe rail on a project-less invoice is the plan's risk #2 and is
unproven by the lane's own suite (the Deno case cannot run here). The reviewer's probe above shows
the rail works — add that sequence (as `service_role`, with the household's `stripe_customer_id`
set via `ON CONFLICT DO UPDATE` as the sibling does) to the suite so it stays proven.

### F3 — MINOR · process · `artifacts/…/w1/db-notes.md` vs `stack-reset-notice.md`

db-notes says the lane ran `supabase db reset` twice and "both are logged in
`stack-reset-notice.md`"; the notice holds one lane entry. The first reset ran against the **main
checkout** (the notes admit it) and replayed main's ledger, dropping the peer's `00569` from the
shared stack — exactly the footgun the brief's CWD correction warns about. Nothing to fix in code;
the orchestrator should know the peer's `00569` was wiped once and that the log is incomplete.

### F4 — MINOR · SD roster · `00570_studio_invoices.sql:876-940`, `supabase/tests/edge_api/public_sd_hardening_contract_test.sql:2085`

The brief asked to register `create_draft_studio_invoice` "the way 00511 (~:7189) registers
`create_draft_invoice`". The lane wrote a self-contained `DO $studio_draft_roster$` in the migration
(runs once, at apply time) and left the contract test untouched. The contract test is the ongoing
guard: `atomic_draft_catalog_contract` (`:2085`) pins `create_draft_invoice`'s overload universe,
semantics, argument list, result, body SHA-256 and byte length. Nothing pins the new RPC there, so
its body/ACL can drift silently after merge. Add a sibling block (or a manifest row) pinning
`create_draft_studio_invoice(uuid,uuid,text,numeric,integer,text,jsonb)`. The deviation is
documented in db-notes; the reasoning about the lock-order roster is sound.

### F5 — MINOR · `00570_studio_invoices.sql:1192-1194` · `resolve_studio_identity` with an unknown studio id

When `p_studio_id` is non-NULL but matches no `organizations` row, step 0 sets `v_studio_id`, step
1/2 are skipped, and the function falls to the profile identity (`source = 'full_name'`) instead of
the project/primary-studio derivation. Probe: `resolve_studio_identity(NULL, A, '…dead')` →
`name NULL, source full_name`. Not reachable from a real invoice (`studio_id` is FK-checked), so
this is an edge-case note, not a defect in the rail.

### F6 — MINOR · authority model · `00570_studio_invoices.sql:112-130`

The studio branch does not require `has_designer_domain_role(NEW.designer_id)` where the project
path does (line 379 / 461). The brief did not ask for it and db-notes explains the choice ("no
project lead"). Flagging for the orchestrator only: a member with no designer-domain role can be
stamped as a studio invoice's `designer_id` and receive its `designer_earnings`.

### F7 — NIT · `packages/supabase/src/hooks/use-invoices.ts:786-796`

`useCreateDraftStudioInvoice` forces `kind: 'adhoc'` on every line and drops `milestoneId` /
`ffeItemId`, so a caller that passes a milestone line gets a silent adhoc line instead of the RPC's
clear `check_violation`. Passing `row.kind` through would let the DB's message surface (R83 band).
Test `'forces kind adhoc even when the caller names another kind'` pins the current behaviour.

### F8 — NIT · `00570_studio_invoices.sql:47-48` / `:50-55`

`ADD COLUMN IF NOT EXISTS title` is guarded; `ADD CONSTRAINT chk_invoices_anchor` is not. Harmless
on a fresh apply; inconsistent if the file is ever re-run. `title` has no length CHECK, so direct
DML can exceed the RPC's 200-char bound.

### Items verified as delivered (no finding)

1. PART 1 — nullable `project_id` (FK + cascade kept), `title`, CHECK, COMMENT: present; `pg_get_constraintdef` matches the brief.
2. PART 2 — both arms, before the project lookups, UPDATE arm after the immutability check; hash re-pinned and equal to the deployed body.
3. PART 3 — signature, SECURITY DEFINER, `search_path = pg_catalog, public, pg_temp`, REVOKE/GRANT, roster resolution (actor's own row first, else lowest `designer_id`), adhoc-only, totals with 00511 rounding, `memo` via `NULLIF` like 00511.
4. PART 4 — LEFT JOIN + COALESCE, `project_id = i.project_id` (identical to `pr.id` under the LEFT JOIN); contra leg untouched; no hash pinned anywhere under `supabase/tests`.
5. PART 5 — three additive policies, `TO authenticated`, drafts hidden; 00178's stay.
6. PART 6 — drop+create, defaults keep the 2-arg call shape (`00330/00331/00334/00388/00412/00423` bodies, `_shared/studio-identity.ts`, `use-studio-identity.ts`, `StudioIdentityService.swift`).
7. Suite covers draft → issue (`INV-0001` off `studio_invoice_counters`) → pay → refund contra → void, household/co-member/stranger, rejections, two-studio numbering; stripe-rail Deno case added, `deno check` clean.
8. `database.types.ts` regenerated: `project_id: string | null`, `title`, `create_draft_studio_invoice`, `resolve_studio_identity.p_studio_id`.
9. Hooks: `Invoice.project_id | null`, `title`, `useCreateDraftStudioInvoice` (invalidates `['invoices']`, `['document-state']`), `useClientInvoices` (key `['invoices','client']`, select `*, line_items:invoice_line_items(*)` = `useProjectInvoices`' shape), exports, 5 new hook tests. Every invoice select is `*`-based so `title` arrives everywhere.
10. Portal null-safety: folio (`?? undefined` ×5, doorway gated), receivables (×2 + label), ledger label, desk-receivables skip, overlays guard; client-portal needed nothing (type-check clean). No homeowner-facing copy was added in this lane; the designer-facing `'Studio'` label and `${days}d overdue` are pre-existing designer copy.
11. `seed/00-legacy-grants.sql` regenerated (needed so the new RPC is not anon-executable on a fresh local stack; verified `anon = f` after reset).
