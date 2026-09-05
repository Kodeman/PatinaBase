# W1 CLOSE — DB lane adversarial review, round 1

Reviewer: separate context; did not write the code. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-db`
(`git rev-parse --show-toplevel` → that path), branch `studio-invoices/w1-db`,
range `07bfdd55c..HEAD` (HEAD `ae06d2699`). Close-round commits:

```
ae06d2699 docs(studio-invoices): W1 DB lane close notes
c98ad2e51 test(billing): pin the roster gate, the watched title, and the brand resolver fall-through
c289902d9 fix(db): hold a studio invoice to its studio's roster on both trigger arms
```

Diff: `supabase/migrations/00571_studio_invoices.sql` (+102/−?), `supabase/tests/billing/studio_invoice_test.sql` (+278),
`supabase/tests/edge_api/public_sd_hardening_contract_test.sql` (+16/−?), program docs. Worktree clean after HEAD.

**Verdict: ship.** All four ruled items are delivered exactly as briefed, every gate is green, every
`CREATE OR REPLACE FUNCTION` body sits on its true head with the project path byte-identical, and the
suite pins each item. One **major** survives — but it is a *pre-existing* W1 defect the close round
neither introduced nor was briefed to touch (C-1: the machine settle on a studio invoice fails once the
stamped designer's membership is no longer active). Everything else is minor or a carry.

---

## Gates (run by this reviewer, from the worktree)

| Gate | Result |
|---|---|
| `supabase --workdir <wt> db reset` (STACK OWNER; notice appended to `w1/stack-reset-notice.md`) | `Finished supabase db reset on branch main.` exit=0; `Applying migration 00571_studio_invoices.sql...` — log `w1-close/db-reset-review-r1.log` (562 lines) |
| `bash <wt>/scripts/run-sql-tests.sh` (first run died in the sandbox at `mktemp`; re-run unsandboxed) | `total 157 · green 136 · expected-fail 21 · unexpected-fail 0 · effective-green 157/157` exit=0 |
| — `billing/studio_invoice_test.sql` | PASS (1s) |
| — `edge_api/public_sd_hardening_contract_test.sql` | PASS (re-pinned hash + trigger def verify) |
| — `billing/invoice_checkout_integrity_test.sql`, `commercial/multi_studio_signature_test.sql`, `rls/00563_proposal_signing_multi_studio.test.sql` | PASS |
| `pnpm --dir <wt> --filter @patina/supabase type-check` | `tsc --noEmit` exit=0 |
| `pnpm --dir <wt> --filter @patina/designer-portal type-check` | `tsc --noEmit` exit=0 |

## True-head proof (anchored grep, run by this reviewer)

```
set_invoice_studio_id          → 00318, 00511, 00571      head 00511 ✓
apply_invoice_payment_effects  → 00178, 00277, 00571      head 00277 ✓
resolve_studio_identity        → 00320, 00571             head 00320 ✓
create_draft_studio_invoice    → 00571 only (new)
```

Body diff head → 00571 (`difflib.unified_diff`, n=0):

```
set_invoice_studio_id:          436 → 623 lines, added=187 removed=0 hunks=2   (project path byte-identical)
apply_invoice_payment_effects:  138 → 139 lines, added=3   removed=2 hunks=2   (LEFT JOIN + COALESCE(pr.name, i.title, 'Studio invoice') only)
resolve_studio_identity:         69 →  83 lines, added=15  removed=1 hunks=2   (step-0 gated SELECT + `v_studio_id IS NULL AND` on step 1)
```

Live catalog after the reset:

```
set_invoice_studio_id  sha256 f39043a2f3d9f70f5bb8d97c23f436a1f159085a49dc961d928ca25723ee94a6  octet_length 25627  = contract pin :1716
trigger: … ar_last_chased_at, created_at, updated_at, title ON public.invoices FOR EACH ROW EXECUTE FUNCTION set_invoice_studio_id()
  (00511:3076-3088 list verbatim + title; sibling BEFORE trigger set_invoices_updated_at still sorts after it)
idx_invoices_client | CREATE INDEX idx_invoices_client ON public.invoices USING btree (client_id) WHERE (client_id IS NOT NULL)
create_draft_studio_invoice(uuid,uuid,text,numeric,integer,text,jsonb) | {postgres=X/postgres,authenticated=X/postgres}   (anon/PUBLIC revoked)
resolve_studio_identity(uuid,uuid,uuid)                                 | {postgres,anon,authenticated,service_role}
```

## The four ruled items — delivered?

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | R3-1 roster EXISTS on BOTH arms, RPC's rule verbatim, same error family, project path untouched, hash re-pinned, stranger-bill rejection + positive case in the suite | **DELIVERED** | `00571:160-170` (UPDATE arm) and `:283-293` (INSERT arm; `:294` keeps the designer-domain check) carry the exact `designer_clients ⋈ organization_members ON organization_id = NEW.studio_id … status='active' AND role<>'guest'` predicate; both `RAISE EXCEPTION 'studio_id_not_designer_studio'` (P0001); 0 project-path lines removed; pin `f39043a2…`; suite `:539-562` (stranger → P0001, row never landed), `:596-609` (roster household direct INSERT accepted), `:755-794` (service_role writes a stranger row, member's memo and title UPDATEs both → P0001, row unchanged) |
| 2 | R3-2 `resolve_studio_identity` short-circuit only on `type='design_studio' AND status='active'`, else fall through; anon test: manufacturer id → fallback, active studio → itself | **DELIVERED** | `00571:1321-1326`; steps 1 and 2 both gated on `v_studio_id IS NULL`; suite `:800-836` as `anon`: manufacturer + household → all-NULL row; manufacturer + designer A → `source='studio'` on a studio that is not the maker; Studio Two → `Studio Invoice Two`. Reviewer probe adds: a `deactivated` design_studio id + designer A → falls through to Studio One; + household → all NULL; dead id → all NULL |
| 3 | R3-3 trigger recreated with `title` in `UPDATE OF`; `pg_get_triggerdef` contains `title` asserted in the suite | **DELIVERED** | `00571:715-725` (`DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`, 00511's list verbatim + `title`); suite `:711-715`; contract test `:2367-2393` column arrays and normalized def string re-pinned |
| 4 | R3-7 `idx_invoices_client` partial index, asserted in the suite | **DELIVERED** | `00571:1241-1243`; suite `:717-722`; live `pg_indexes` row above |

Close notes: `w1/db-notes.md` "## Close" section is present in both copies and identical (142 lines each, `diff` exit 0);
`deploySet = ['migration 00571_studio_invoices.sql']`. No TS, no grants, no types moved this round (verified: no
GRANT/REVOKE diff; `database.types.ts` untouched).

## Probes (reviewer's own; log `w1-close/db-probes-review-r1.log`, source `db-probes-review-r1.sql`)

```
P-A  roster row deleted after issue → owner void_invoice     REFUSED P0001 studio_id_not_designer_studio
     control (roster row restored) → void                    ACCEPTED status=void
P-B  stamped designer's membership → 'suspended' (second owner added first; guard_org_membership_changes
     forbids removing the last owner) → service_role claim/finalize/settle
                                                              REFUSED P0001 studio_id_not_designer_studio
P-C  postgres session UPDATE invoices SET project_id=NULL on a seeded project invoice
                                                              REFUSED P0001 (line 26); same as service_role
P-D  stranger reads invoices → 0 rows; household reads → 1 row (the voided one; drafts hidden)
P-E  resolver as anon: deactivated studio + designer A → Studio One (fall-through); + household → NULL row; dead id → NULL row
P-F  RPC as A: negative cents 23514 · quantity 1e9 23514 · kind time 23514 (explicit message) ·
     stranger household 42501 · non-member studio 42501 · manufacturer org as studio 42501 · blank title 23514 ·
     two-studio: studio_id=…0002, INV-0001 off Studio Two's counter
P-G  owner rewrites title on a SENT studio invoice by direct DML → 0 rows (RLS: both UPDATE policies are status='draft'),
     the trigger is the second wall (suite :779-794 proves the trigger wall on a service_role-written row)
P-H  direct DML with title NULL → ACCEPTED (F-N1 carry, see M-1)
P-J  household on non-designer B's roster only, stamped to designer A: direct DML ACCEPTED; RPC REFUSED 42501 (see M-2)
```

(Two earlier probe runs produced false "ACCEPTED (BAD)" lines — P-C without a `RESET ROLE` and P-G looking up
a label created later in the file — both were my probe's bugs; the direct re-probes above are the truth.)

---

## Findings

### C-1 · MAJOR (0.85) · pre-existing, NOT introduced by the close round — the machine settle on a studio invoice fails once the stamped designer is no longer an active member

`00571:119-136` (UPDATE arm, studio branch): the first predicate — `NEW.designer_id` must be an *active non-guest
member* of an *active* `NEW.studio_id` — runs **before** the `service_role OR v_postgres_migration` early return
at `:138`. The project path's UPDATE arm for the machine (`:203-226`) checks only the project tuple and the
`previous_lead` history and never the designer's membership status. So a studio invoice is stricter than a
project invoice exactly on the path the webhook uses:

```
P-B: designer A suspended → service_role claim → finalize → settle
     REFUSED P0001 studio_id_not_designer_studio
```

Consequence: a household pays at Stripe; the webhook's `settle_invoice_checkout_payment` raises; the
`invoice_payments` flip never lands; Stripe retries the event until it gives up; the invoice stays `sent` with
money captured. Same for a deactivated studio (`anchor_studio.status = 'active'`). This is the behaviour the
lane shipped in round 1 and rounds 2–4 did not catch; it is outside the four ruled items, so I am not blocking
the close on it — but it is a money-path defect and the orchestrator should rule before W2 builds on it.
Fix shape: move the membership/studio-active predicate below the machine early return on the UPDATE arm (keep
`studio_id/designer_id/client_id IS NOT NULL` above it), mirroring how the project path lets the machine
"reconcile exact historical tuples". The INSERT arm is fine as is (identity is settled there).

### A-1 · ADVISORY (ruled) · the UPDATE-arm roster gate strands an outstanding studio invoice the day the household leaves every roster of the studio

Fable ruled BOTH arms; this is the cost, proven: `P-A void after roster delete: REFUSED P0001`. `issue_invoice`,
`void_invoice`, `record payment` all reach that arm as the actor (`current_user='postgres'`,
`role` GUC = `authenticated`). The lane documents it in db-notes "Advisory left standing". Not a finding against
the brief; recorded so W4's roster-archive work (R3-12/R3-13 carry) knows the row is now pinned to the roster.

### M-1 · MINOR (0.9) · carry F-N1 — S12 is still only the composer's law

`P-H null title: ACCEPTED` by direct DML as the owner. The RPC bounds it (blank → 23514, proven P-F). Not in
the four items; carry.

### M-2 · MINOR (0.9) · the trigger's roster is one predicate looser than the RPC's

The RPC's roster resolution (`00571:804`) and its post-lock revalidation (`:854`) both require
`has_designer_domain_role(<roster owner>)`; the trigger's roster `EXISTS` (both arms) requires the roster
owner to be an active non-guest member only, and checks designer-domain on `NEW.designer_id` (INSERT) instead.
Proven: `P-J direct DML (household on non-designer B's roster, stamped to designer A): ACCEPTED` vs
`RPC: REFUSED 42501`. Intra-studio and the earning still lands on a designer, so it is the widening the lane's
own advisory names; the brief said "mirror the RPC's roster rule", and this is the one clause that is not mirrored.

### M-3 · MINOR (0.95) · the main-checkout `db-notes.md` is a stale mirror

`/Users/kody/Code/patina-merged/artifacts/.../w1/db-notes.md` is 476 lines and still headed
`00570`; the worktree copy is 798 lines (`00571`). The "## Close" section is mirrored identically (142/142,
diff exit 0), but the main copy lacks the fix-round-2/3 sections and the renumber. `stack-reset-notice.md`
also still has two divergent copies (`diff` exit 1; each missing the other's rounds). Reconcile at integration
(the worktree copies are the ones on the branch).

### N-1 · NIT · `studio_invoice_counters` reads back NULL under the actor

Not a defect — RLS-on, zero policies, as the suite comments say — but a probe author will trip on it; the
suite already resets the role for that read.

### Carried unchanged from r3/r4 (not re-litigated; none touched by the four items)

R3-4 no contract-test row for the new SD RPC · R3-6 unguarded `document ↗` in two ledger files · R3-8 hook
forces `kind:'adhoc'` · R3-9 unguarded `ADD CONSTRAINT` · R3-10 `designer_clients.status` unfiltered ·
R3-11 int4 overflow parity · R3-12 `ON DELETE SET NULL` vs the CHECK (latent) · F-N2 stripe-rail harness seed
fails pre-lane · F-N3 `internal_notes` reaches the household through the whole-row policy · F-N5 narrower
REVOKE list · bare `auth.uid()` in the three new policies.

## What probed clean this round

- Money: integer cents throughout; the webhook still only flips `invoice_payments` and the 00178/00277 trigger
  owns the rollup (suite `:196-222` claim → finalize → settle → earnings `project_id IS NULL`); refund contra
  untouched; no ungated status write — the clean-draft predicate on both arms is intact under the new gates.
- RLS read boundary: household sees issued/void only, stranger 0 rows with no error; co-member edits a clean draft
  (suite `:612-626`).
- Immutability: `project_id` cannot be nulled on a project invoice by postgres or service_role (P-C).
- Numbering: off `studio_invoice_counters` per studio; a two-studio designer draws off the studio named (P-F).
- Grants: `create_draft_studio_invoice` executable by `authenticated` only; anon/PUBLIC revoked.
- Vision refusals: no homeowner-facing string was introduced this round (the only new copy is SQL comments and
  test assertion text).
