# W1-close DB lane — adversarial review, round 2 (re-run)

Reviewer: separate context; did not write this code. Round 1 of this re-run is
`db-review-r1.md` (12 findings, F1 major). Fable ruled F1 fixable; the fixer
landed it. This round verifies F1, hunts regressions from it, and re-tests every
carry. The earlier run's round-2 file is preserved beside this one as
`db-review-r2-run1.md` (`git mv`).

```
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-si-db rev-parse --show-toplevel
  /Users/kody/Code/patina-merged/.codex/worktrees/agent-si-db
git -C ... branch --show-current
  studio-invoices/w1-db
git -C ... log --oneline 07bfdd55c..HEAD   (first 3)
  5d01bb592 docs(studio-invoices): W1 close db lane fix round 1 notes (F1)
  63f37d53b test(billing): cover the machine insert path and re-pin set_invoice_studio_id
  ae906b50b fix(db): hold the machine to the studio invoice's roster and designer-domain law on insert
git -C ... diff --stat 07bfdd55c...HEAD
  ... supabase/migrations/00571_studio_invoices.sql            | 135 +++-
  ... supabase/tests/billing/studio_invoice_test.sql           | 424 ++++++++-
  ... supabase/tests/edge_api/public_sd_hardening_contract_test.sql | 24 +-
  11 files changed, 2804 insertions(+), 122 deletions(-)
git -C ... status --porcelain   →  (empty; only sandbox EPERM on .env* files)
```

## Verdict — ship

No blocker, no major. F1 is fixed and proven. Everything else standing is a
ruled carry or a nit.

## Gates (run by this reviewer, pasted)

```
supabase --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-si-db db reset
  ...
  Restarting containers...
  Finished supabase db reset on branch main.
  {"target":"local","version":"","message":"Reset local database."}

bash .../scripts/run-sql-tests.sh
  ================ summary ================
  total:             157
  green:             136
  expected-fail:      21  (documented in supabase/tests/KNOWN_FAILURES.md)
  unexpected-fail:    0
  effective-green:   157 / 157  (green + expected-fail)
  ===========================================
  PASS  supabase/tests/billing/studio_invoice_test.sql             0s
  PASS  supabase/tests/edge_api/public_sd_hardening_contract_test.sql  1s

pnpm --dir ... --filter @patina/supabase type-check
  > tsc --noEmit          (no output, exit 0)
pnpm --dir ... --filter @patina/designer-portal type-check
  > tsc --noEmit          (no output, exit 0)
```

## Rebase proof — every CREATE OR REPLACE body sits on its TRUE head

```
grep -rln "CREATE OR REPLACE FUNCTION[^(]*set_invoice_studio_id" supabase/migrations/*.sql | sort
  00318_... / 00511_public_sd_hardening.sql / 00571_studio_invoices.sql   → head = 00511
python extract 00511 body vs 00571 body; diff
  lines removed: 0
  lines added:  210
→ every project-path line byte-identical; the branch is purely additive.

grep -rln "...apply_invoice_payment_effects" → 00178 / 00277 / 00571      → head = 00277
diff 00277 body vs 00571 body:
  68c68,69   'Invoice ' || COALESCE(i.invoice_number,'(draft)') || ' — ' || pr.name
        →    ... || COALESCE(pr.name, i.title, 'Studio invoice')
  77c78     JOIN projects pr  →  LEFT JOIN projects pr
→ exactly the two documented deltas, nothing else.
  (projects.name is NOT NULL — information_schema says is_nullable=NO — so no
   project invoice's description changes.)

grep -rln "...resolve_studio_identity" → 00320 / 00571                    → head = 00320
diff: the third arg, the step-0 block, and `v_studio_id IS NULL AND` on step 1. Nothing else.
```

## F1 (major, round 1) — FIXED

The roster EXISTS and `has_designer_domain_role(NEW.designer_id)` now sit ABOVE
the machine early return on the INSERT arm (00571:263-297), inside
`IF NOT v_postgres_migration`. That is the same point at which the project path
holds `service_role` (its bypass at :469-471 is `v_postgres_migration` only, and
the FOR SHARE tuple + `has_designer_domain_role` at :473-492 run for the machine).

Probe (service_role, fresh fixture, rolled back):

```
F1-a service_role stranger household:              accepted=f state=P0001
F1-b service_role non-designer stamp:              accepted=f state=P0001
F1-c service_role roster household + designer:     accepted=t
```

The suite pins all three (studio_invoice_test.sql:742-828) and the UPDATE-arm
fixture was correctly rewritten as a `RESET ROLE` postgres write. The body hash
is re-pinned (`3a55684…`) and the contract test is green.

No regression found:
- No in-repo machine path inserts an invoice — `grep -B1 -A3 "\.from('invoices')" supabase/functions --include='*.ts' | grep -E "insert\(|upsert\("` → no output.
- Authenticated co-member direct DML for a roster household still lands (probe
  P-A: `accepted=t`), so the roster read is genuinely RLS-visible under
  `designer_clients_studio_rw`.
- The comment's load-bearing claims check out: `service_role rolbypassrls=t`;
  `has_designer_domain_role` `prosecdef=t provolatile=s`;
  `designer_clients.relforcerowsecurity=f` (owner sees all rows).
- Lock order untouched (no FOR SHARE added); the 00511 contract test is green.

## The four ruled close items — all delivered

1. **R3-1** roster on both arms — INSERT arm :296-305 (above the machine return),
   UPDATE arm :164-181 (below it, machine-replay safe). Same P0001 error family.
   Project-path lines byte-identical (0 removed).
2. **R3-2** `resolve_studio_identity` short-circuits on `type='design_studio'
   AND status='active'` only, else falls through (:1332-1345). Suite :878-918
   proves anon gets the fallback for a manufacturer id and never its name, and
   gets the studio for an active design studio.
3. **R3-3** trigger recreated with `title`:
   `pg_get_triggerdef` ends `... created_at, updated_at, title ON public.invoices ...`;
   asserted at studio_invoice_test.sql:712-716.
4. **R3-7** `idx_invoices_client`:
   `CREATE INDEX idx_invoices_client ON public.invoices USING btree (client_id) WHERE (client_id IS NOT NULL)`
   — no duplicate index on the table; asserted at :718-724.

## Independent probes (all rolled back)

RLS boundary on a live issued studio invoice:

```
H1 household sees invoice rows=1
H2 household reads internal_notes='private studio note'   ← F9 carry
H3 household sees lines=1
H4 household UPDATE memo: rows=0 (RLS)
H5 household INSERT own invoice: refused P0001
S1 stranger sees invoice rows=0     S2 stranger sees lines=0
A1 anon sees invoice rows=0
```

Identity immutability / CHECK cannot be walked around:

```
G1 service_role UPDATE project_id -> NULL on a seeded project invoice: refused P0001
chk_invoices_anchor = CHECK (project_id IS NOT NULL OR (client_id IS NOT NULL AND studio_id IS NOT NULL))
```

Grants:

```
create_draft_studio_invoice   postgres=X/postgres authenticated=X/postgres   (anon, PUBLIC, service_role revoked)
apply_invoice_payment_effects postgres=X/postgres service_role=X/postgres
resolve_studio_identity       postgres, anon, authenticated, service_role     (brand-only, ruled C2-7)
```

Composer money bounds:

```
F6-tax    2 x 1e9 with tax_rate 0.5 (total 3e9): REFUSED 22003 integer out of range
F6-single 100000 x 1e9:                           REFUSED 22003 integer out of range
F-frac    qty 0.5 x 333:  ACCEPTED subtotal=167 line=167   (integer cents, round-half-up)
F-nan     quantity "NaN": REFUSED 23514 invalid studio invoice payload
```

## Findings

### Carries re-proven (ruled; no action asked of this lane)

- **F2 (minor, 0.9)** `designer_clients.status` unfiltered in both trigger arms
  and in the RPC. Probe: a `status='lead'` roster row lets service_role insert a
  studio invoice for that household — `F2 ... accepted=t`. W4 with R3-12/R3-13.
- **F3 (minor, 0.85)** S12 is only the composer's law. Probe F1-d: service_role
  `INSERT ... title NULL` → `accepted=t`. The ledger, folio head, email subject
  and Stripe product name all read that column.
- **F4 (minor, 0.8)** UPDATE-arm roster gate strands authenticated acts once the
  household leaves every roster (documented advisory A-1 in db-notes).
- **F9 (minor, 0.9)** `internal_notes` reaches the household through the
  whole-row `invoices_household_select` policy (probe H2). Exact parity with
  00178's project-keyed client policy; program-wide decision, not this lane.
- **F5 / F7 (nits)** the two comment-accuracy nits are unchanged.
- **F8 (nit, 0.95)** line 1311 is 144 characters inside a 78-column banner.
- **F10 (nit)** the deactivated-studio leg of C-1 is still code-read only.
- **F6 — DOWNGRADE to nit (0.9).** The 22003 overflow is *exact parity* with the
  project sibling: `create_draft_invoice` (00511) carries the identical bounds
  (`quantity > 100000`, `unit_amount_cents > 1000000000`) and the identical
  `round(line.quantity * line.unit_amount_cents)::integer` / `v_subtotal + v_tax`
  math. Pre-existing posture, not introduced here.

### New this round

- **N1 (nit, 0.95)** The banner at 00571:29 still says the branch is
  "199 inserted lines across the two arms, zero removed". The F1 move made it
  **210** (diff of the two extracted bodies: 0 removed, 210 added). Stale count
  in the file's own provenance note.
- **N2 (nit, 0.6)** db-notes:173-175 documents the latent
  `invoices.client_id … ON DELETE SET NULL` vs `chk_invoices_anchor` conflict but
  not `invoices_studio_id_fkey`, which is *also* SET NULL
  (`confdeltype='n'`): a hard `DELETE` of an `organizations` row that owns studio
  invoices hits the same check violation. Same latency, same one-line fix to the note.
- **N3 (nit, 0.5)** `create_draft_studio_invoice`'s SD posture (owner, ACL, lock
  order) is pinned only by the migration-time `DO $studio_draft_roster$` block
  (00571:1018-1082). It is absent from
  `public_sd_hardening_contract_test.sql` (`grep create_draft_studio_invoice` →
  no hits; `_00511_expected_public` still asserts exactly 17 rows). The plan's
  wording ("the way 00511:7189 does") points at the migration-time roster, and
  the block does re-run on every `db reset`/`db push` — so this is coverage
  shape, not a gap in this lane's delivery.
- **N4 (nit, 0.5, on the record)** Probe F1-e: `service_role` may INSERT a studio
  invoice already `status='paid'` with a hand-picked `invoice_number` and
  `amount_paid_cents` — the clean-draft predicate is `current_user='authenticated'`
  only. Exact parity with the project path's INSERT arm; no in-repo caller does
  it. Not an objection.

## Process

`db-review-r2.md` already existed from the earlier run of this step (HEAD then
`6160651e2`); it is preserved as `db-review-r2-run1.md` beside this file, exactly
as round 1 preserved `db-review-r1-run1.md`.
