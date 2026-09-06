# W1 DB lane — adversarial review, round 4 (verification of the R3 fix round)

Reviewer context: fresh, did not write the code. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-db`, branch
`studio-invoices/w1-db`, range `36b4b539e1f2cb732fb722d84edfe758d6b4008a..HEAD`
(head `f3e6c1916`).

Filename note: the brief asked for `db-review-r3.md`, which already exists on the
branch (the review this round verifies). Writing here as `db-review-r4.md` rather
than destroying it.

## Verdict

**ship** — no blocker and no major survives, which is the stated bar. Both R3
findings are genuinely closed and re-probed; what remains is minors and nits,
most carried unchanged from round 3, three new. None of them blocks the wave;
F-N1 and R3-3 are the two the orchestrator should rule on before Wave 2 builds
on this foundation.

## Gates run (all from this worktree)

```
supabase --workdir …/agent-si-db db reset      → "Finished supabase db reset" (clean, tip 00571)
scripts/run-sql-tests.sh                        total 157 | green 136 | expected-fail 21 | unexpected-fail 0
  billing/studio_invoice_test.sql               PASS
  billing/invoice_checkout_integrity_test.sql   PASS
  edge_api/public_sd_hardening_contract_test    PASS   (re-pinned trigger hash verifies)
  commercial/multi_studio_signature_test.sql    PASS
  rls/00563_proposal_signing_multi_studio       PASS
pnpm --filter @patina/supabase type-check        clean
pnpm --filter @patina/supabase test -- use-invoices   48 passed (48)
pnpm --filter @patina/designer-portal type-check clean
pnpm --filter @patina/client-portal type-check   clean
pnpm --filter @patina/designer-portal test -- accounts desk-receivables   3 suites, 12 passed
supabase/functions/_tests/run.sh                 FAILED at seed — pre-existing, see F-N2
```

## True-head verification (the blocker class)

Anchored greps run by this reviewer; last file wins:

```
set_invoice_studio_id          → 00318, 00511, 00571   (head 00511 ✓)
apply_invoice_payment_effects  → 00178, 00277, 00571   (head 00277 ✓)
resolve_studio_identity        → 00320, 00571          (head 00320 ✓)
```

Body diffs, extracted programmatically head→00571:

- `set_invoice_studio_id`: 441 → 612 lines, **0 lines removed**, 171 added. Every
  project-path line byte-identical. The banner's "171 inserted lines" now matches.
- `apply_invoice_payment_effects`: exactly two hunks — `JOIN projects pr` →
  `LEFT JOIN`, and `|| pr.name` → `|| COALESCE(pr.name, i.title, 'Studio invoice')`.
  Refund-contra leg untouched.
- `resolve_studio_identity`: signature gains `p_studio_id uuid DEFAULT NULL`; the
  only body change is the step-0 short-circuit plus `v_studio_id IS NULL AND` on
  step 1. Every in-repo caller passes two args and still resolves.

No stale-head rebase anywhere.

## R3 findings — verified

| id | was | now |
|---|---|---|
| R3-1 | blocker | **FIXED, re-probed** |
| R3-2 | major | **FIXED, re-probed** |
| R3-3 | minor | open |
| R3-4 | minor | open |
| R3-5 | minor | open |
| R3-6 | minor | open (and wider than reported) |
| R3-7 | minor | partly open |
| R3-8 | nit | open |
| R3-9 | nit | open |
| R3-10 | nit | open, still undocumented |
| R3-11 / R3-12 | nit | unchanged, parity/latent |

### R3-1 — closed

```
P1 as owner A, household with no designer_clients row:
  ERROR:  studio_id_not_designer_studio
  CONTEXT:  PL/pgSQL function set_invoice_studio_id() line 199 at RAISE
P2 control, household on A's roster stamped to A:  accepted, 1 row
```

### R3-2 — closed

`OR NOT public.has_designer_domain_role(NEW.designer_id)` on the INSERT arm, and
the same predicate on both the roster resolution and the post-lock revalidation
in `create_draft_studio_invoice`. This is exactly what the project path requires
at 00571:541 (`AND public.has_designer_domain_role(NEW.designer_id)` inside its
clean-draft block), so the studio branch is no longer looser. `has_designer_domain_role`
is `SECURITY DEFINER STABLE` (00511:2266), so the read is RLS-independent.

The UPDATE arm deliberately omits both predicates. The lane's justification holds
under inspection: the four identity columns are compared `IS DISTINCT FROM OLD`
at the top of that arm and raise, so no row reaches it unjudged; and the lane's
own probe shows that applying the predicates on UPDATE strands an outstanding
invoice when a roster row is deleted (`void_invoice` reaches that arm as the
owner). Verified independently that `UPDATE invoices SET project_id = NULL` on a
project invoice raises `P0001` at line 26 (the immutability check), so the new
CHECK cannot be walked into.

The roster read inside the trigger is RLS-visible to a co-member:

```
P3  co-member B (designer-domain) inserts stamping A, household on A's roster only
    → accepted, 1 row      (designer_clients_studio_rw, 00316:39, is studio-wide)
```

## Money path, probed end-to-end (not just the suite)

```
draft   project_id=NULL  studio_id=…0001  designer_id=A  subtotal 60000  tax 4800  total 64800
issue   invoice_number = INV-0001, status sent      (studio_invoice_counters row minted, next_number 1)
settle  status paid, amount_paid_cents 64800, paid_at set
earn    design_fee 64800/64800, project_id NULL, status confirmed,
        description 'Invoice INV-0001 — September consultation'
refund  contra -64800, project_id NULL,
        'Refund reversal — Invoice INV-0001 — September consultation'
        invoice falls back to sent, amount_paid_cents 0
```

Integer cents throughout; the webhook path only flips `invoice_payments` and the
00178/00277 trigger owns the rollup. No ungated status write was found: the studio
branch applies the same clean-draft predicate the project path applies at the
`current_user = 'authenticated'` fork.

## RLS boundary, probed

```
household (client_id = auth.uid())   issued invoice: 1 row, lines: 1 row
stranger profile                     0 rows (no error, no existence signal)
draft                                invisible to the household (status <> 'draft')
```

## Findings

### F-N1 (minor, 0.95) — S12 is not the row's law, only the composer's

`00571` PART 1 adds `title text` with no NOT NULL/length constraint, and the
studio branch of `set_invoice_studio_id()` does not require one. By the lane's own
R3-1 standard ("S4 is the row's law, not only the composer RPC's"), S12 should be
too — and the clean-draft block in the same branch is where it would go.

```
direct DML as owner A, title NULL      → S12 null-title studio invoice accepted (title_null t)
direct DML as owner A, 5000-char title → S12 5000-char title accepted (char_length 5000)
```

The RPC bounds it (`NULLIF(btrim(COALESCE(p_title,'')),'') IS NULL OR char_length(p_title) > 200`,
asserted at studio_invoice_test.sql:363 as 23514). The migration banner nevertheless
credits S12 to "PART 1, PART 3"; PART 1 contributes only the column and its comment.
Consequence if it ever fires: an untitled studio invoice in the household letterbox
with no regarding line, and an earnings row that reads "Studio invoice".

Fix: add `AND NEW.title IS NOT NULL AND btrim(NEW.title) <> '' AND char_length(NEW.title) <= 200`
to the studio branch's clean-draft predicate (both arms), or a
`CHECK (project_id IS NOT NULL OR (title IS NOT NULL AND btrim(title) <> ''))`.

### F-N2 (minor, 0.9) — the new stripe-rail step cannot run, for a pre-existing reason

Brief item 7's `stripe-rail.test.ts` null-project case is written but unexecuted.
The whole harness dies in `seed()` before reaching it:

```
supabase/functions/_tests/run.sh
  payable_type dispatch … FAILED
  error: Error: insert projects failed: studio_id_not_designer_studio
    at seed (…/agent-si-db/supabase/functions/_tests/stripe-rail.test.ts:165:17)
```

Lane-independent: the **base** copy in the main checkout fails identically against
the same stack and the same running functions —

```
deno test --no-check -A /Users/kody/Code/patina-merged/supabase/functions/_tests/stripe-rail.test.ts
  error: Error: insert projects failed: studio_id_not_designer_studio
    at seed (…/patina-merged/supabase/functions/_tests/stripe-rail.test.ts:159:17)
```

The raiser is `set_project_studio_id()` (a `projects` insert), which this lane
never touched (`git diff` shows no reference). So the failure predates the lane,
but the new step (a2) is unverified evidence; integration should either fix the
harness seed or record the step as untested. Housekeeping: both runs minted a root
`deno.lock` (worktree and main checkout); this reviewer deleted both.

### F-N3 (minor, 0.85) — `internal_notes` reaches the household through the new policy

`invoices_household_select` is a row policy on the whole row, and the lane's
`useClientInvoices()` selects `'*'`.

```
as the household: internal_notes = 'PRIVATE STUDIO NOTE'   (readable)
```

Parity, not regression: 00178's project-keyed client policy is also a whole-row
`SELECT`, and `useProjectInvoices` also selects `'*'` — so the same column already
reaches a homeowner on a project invoice. Worth naming because a studio invoice's
*only* read path is the one this lane created, and Wave 3 wires the new hook into
the client page. A column-scoped select in Wave 3 (or a `SELECT` grant narrowing)
would close it for both.

### F-N4 (nit, 0.8) — a co-member can stamp another member as `designer_id`

`P3` above: member B composes, member A carries the invoice and the design_fee
earning. Consistent with the shared-studio workspace model (`designer_clients_studio_rw`
is studio-wide by design) and with `invoices_studio_insert WITH CHECK
is_studio_comember(designer_id)`, so this is a note rather than a defect — but the
earnings attribution is now settable by any co-member.

### F-N5 (nit, 0.8) — the REVOKE list is narrower than its sibling's

00571:945 revokes `FROM PUBLIC, anon, authenticated, service_role, dashboard_user`;
`create_draft_invoice` (00511:3704-3708) additionally revokes `agent_reader,
agent_writer, edge_catalog_reader, edge_rls_user`. The effective ACL is identical
today —

```
create_draft_studio_invoice | postgres | {postgres=X/postgres,authenticated=X/postgres}
```

— because none of those roles held a grant. Cosmetic divergence from the pattern
00511 established precisely because blanket grants have appeared before.

### Carried from round 3, unchanged

- **R3-3 (minor)** — still no `client_id` index; the new unscoped hook seq-scans.
  `pg_indexes` for `invoices`: `idx_invoices_designer_status, idx_invoices_due_date_live,
  idx_invoices_project, idx_invoices_studio, invoices_pkey,
  uniq_invoices_designer_number_studioless, uniq_invoices_studio_number`. All three
  new policies still call bare `auth.uid()` (confirmed in `pg_get_expr(polqual, …)`).
- **R3-4 (minor)** — `grep -n` over `public_sd_hardening_contract_test.sql` finds no
  row for `create_draft_studio_invoice`, `apply_invoice_payment_effects` or
  `resolve_studio_identity`. Only the migration's one-shot `DO` block asserts the
  new RPC's shape.
- **R3-5 (minor)** — `resolve_studio_identity(NULL, <designer>, '…dead')` still
  returns `source = full_name`; a studio id matching no `organizations` row skips
  steps 1 and 2 instead of falling through.
- **R3-6 (minor, wider than reported)** — the unguarded doorway is in *two* files,
  not one: `accounts-ledger-page.tsx:145` and `accounts-receivables-page.tsx:215`
  both call `onOpenDocument(inv.project_id)` unconditionally, while
  `invoice-folio.tsx:355` gates it and `accounts-book.tsx:90` swallows the null.
  Three treatments of the same case; type-clean either way.
- **R3-7 (minor, partly fixed)** — the banner is now correct (171), but
  `db-notes.md` states the trigger diff three different ways: `:21` "96 lines added,
  0 removed (48 per arm)", `:212` "145 lines added", `:610` "145 -> 171". The true
  count is 171. The `## Stack` section still says the reset "was run twice"; the log
  now carries ten entries. The two `stack-reset-notice.md` copies still diverge
  (`diff` exit=1) — this reviewer appended only to the worktree copy.
- **R3-8 (nit)** — `use-invoices.ts:785-796` still forces `kind: 'adhoc'`, so the
  RPC's explicit non-adhoc message stays unreachable from the portal.
- **R3-9 (nit)** — `ADD COLUMN IF NOT EXISTS title` is guarded, `ADD CONSTRAINT
  chk_invoices_anchor` is not. Title bound folded into F-N1.
- **R3-10 (nit, undocumented)** — `designer_clients.status` is still unfiltered, so
  a `lead` relationship bills like an active client, and `db-notes.md` records no
  decision:

  ```
  P2 direct DML, relationship.status = 'lead'  → accepted, 1 row
  P4 create_draft_studio_invoice on the same   → returned 6e40e227-…
  ```

- **R3-11 / R3-12 (nit)** — int4 overflow parity with `create_draft_invoice`, and
  the latent `ON DELETE SET NULL` vs. the new CHECK; both already in `db-notes.md`
  (§Deferred) or accepted as parity.

## Housekeeping checks

- Migration number: `00571` is free. Peer worktrees hold `00569`
  (`agent-cae-w2-backend`, `agent-cae-w2-integration`) and `00570`
  (`agent-cae-w2-web`); repo tip is `00568`. No collision.
- `supabase/seed/00-legacy-grants.sql` regenerated: the 2-arg
  `resolve_studio_identity` block is replaced by the 3-arg one, and the three new
  REVOKE/GRANT pairs are appended.
- `packages/supabase/src/database.types.ts` matches the live schema: `project_id:
  string | null`, `title: string | null` on every `invoices` shape,
  `create_draft_studio_invoice` args, `resolve_studio_identity` gains `p_studio_id?`.
- No vision refusal in any string this lane introduced. The designer-facing
  fallbacks are "Studio" (ledger/receivables) and "Studio invoice" (earnings
  description); nothing homeowner-facing ships in this lane.
- `deploySet = ['migration 00571_studio_invoices.sql']` — the file is renamed from
  the brief's 00570, which the brief permits.
