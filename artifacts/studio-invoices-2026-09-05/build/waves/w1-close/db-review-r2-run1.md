# W1-close DB lane — adversarial review, round 2

Reviewer: separate context; did not write this code and did not review it in round 1.

```
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-si-db rev-parse --show-toplevel
  /Users/kody/Code/patina-merged/.codex/worktrees/agent-si-db
git -C ... branch --show-current
  studio-invoices/w1-db
git -C ... log --oneline 07bfdd55c..HEAD
  6160651e2 docs(studio-invoices): W1 close DB lane fix round 1 notes
  3e2abad53 test(billing): settle a studio invoice with the stamped designer suspended
  9576fa0b5 fix(db): let a studio invoice settle after its designer leaves the studio
  3e40e63c4 docs(studio-invoices): W1 close DB lane adversarial review round 1
  ae06d2699 docs(studio-invoices): W1 DB lane close notes
  c98ad2e51 test(billing): pin the roster gate, the watched title, and the brand resolver fall-through
  c289902d9 fix(db): hold a studio invoice to its studio's roster on both trigger arms
  e492f1fea docs(studio-invoices): W1 DB lane adversarial review round 4
  f3e6c1916 docs(studio-invoices): W1 DB lane fix round 2 notes for R3-1 and R3-2
  aaf511c5a fix(db): hold a studio invoice to its household's roster and a designer
  f4acf89b0 docs(studio-invoices): W1 DB lane adversarial review round 3
  5b2cfd777 docs(studio-invoices): W1 DB lane fix round 1 re-verification
git -C ... diff --stat 07bfdd55c...HEAD
  8 files changed, 1666 insertions(+), 29 deletions(-)
```

**Verdict: ship.** No blocker, no major. All four ruled close items are delivered
and proven on a fresh stack; the round-1 close finding C-1 is genuinely fixed
(with a negative control the lane ran and I re-verified by suite); every function
body is still rebased on its true head with **zero** project-path lines changed.
What is left is five minors and four nits, every one of them either an explicit
carry the orchestrator already holds, or a documented advisory — nothing that
changes the money path or the read boundary.

---

## Gates run (all green, this context, after a full reset)

| Gate | Result |
|---|---|
| `supabase --workdir <wt> db reset` | `Finished supabase db reset on branch main.` / `{"target":"local","message":"Reset local database."}` |
| ledger tip | `00571, 00568, 00567, 00566, 00565` (only 00571 exists on this branch) |
| `bash <wt>/scripts/run-sql-tests.sh` | `total 157 · green 136 · expected-fail 21 · unexpected-fail 0 · effective-green 157/157` |
| — `billing/studio_invoice_test.sql` | PASS |
| — `edge_api/public_sd_hardening_contract_test.sql` | PASS |
| — `billing/invoice_checkout_integrity_test.sql` | PASS |
| — `commercial/multi_studio_signature_test.sql` | PASS |
| `pnpm --dir <wt> --filter @patina/supabase type-check` | clean (`tsc --noEmit`) |
| `pnpm --dir <wt> --filter @patina/designer-portal type-check` | clean (`tsc --noEmit`) |
| worktree cleanliness | `git status --porcelain` → empty |

## The four ruled items — delivered, each proven

**1. R3-1 · roster on BOTH trigger arms.** Present on the INSERT arm
(`00571:280-303`) and the UPDATE arm (`00571:162-179`), each raising the project
path's own `P0001 studio_id_not_designer_studio`. Predicate matches the RPC's
roster rule (`designer_clients` × `organization_members` on `NEW.studio_id`,
`status='active'`, `role <> 'guest'`). Contract hash re-pinned and matching the
deployed body:

```
SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex')||' | '||octet_length(prosrc)
FROM pg_proc WHERE proname='set_invoice_studio_id';
  b6f0ab2a38d6bbbf286df30d115dac544dcae96ed494c3235692feafb9a3cc89 | 26272
grep -n b6f0ab2a… supabase/tests/edge_api/public_sd_hardening_contract_test.sql
  1719:    'b6f0ab2a38d6bbbf286df30d115dac544dcae96ed494c3235692feafb9a3cc89',
```

Suite carries the r3 stranger-bill rejection verbatim plus the positive case
(`studio_invoice_test.sql:537-630`).

**2. R3-2 · `resolve_studio_identity` short-circuits on an active design studio
only, else falls through** (`00571:1332-1342`, plus `IF v_studio_id IS NULL AND
p_project_id IS NOT NULL` at `:1344`). Suite covers manufacturer → fallback,
manufacturer → designer derivation, active studio → itself. All in-repo callers
pass two positional args and still bind the 3-arg default (00330:133, 00334:93,
00412:1545, 00423:1781); no TypeScript caller exists.

**3. R3-3 · `title` in the trigger's `UPDATE OF` list.** 00511:3076-3083 verbatim
+ `title`; verified against the live catalog:

```
pg_get_triggerdef → CREATE TRIGGER set_invoice_studio_id BEFORE INSERT OR UPDATE OF
  id, …, created_at, updated_at, title ON public.invoices FOR EACH ROW …
```

Asserted both in `studio_invoice_test.sql:711-717` and in the contract test's
normalized triggerdef pin.

**4. R3-7 · `idx_invoices_client`.**

```
CREATE INDEX idx_invoices_client ON public.invoices USING btree (client_id)
  WHERE (client_id IS NOT NULL)
```

Not redundant — the other seven indexes on `invoices` are keyed on
`project_id`, `designer_id`, `studio_id`, `due_date` or `id`. Asserted at
`studio_invoice_test.sql:719-724`.

## True-head proof (re-run in this context)

```
grep -rln "CREATE OR REPLACE FUNCTION[^(]*set_invoice_studio_id"  → 00318 / 00511 / 00571
grep -rln "…resolve_studio_identity"                              → 00320 / 00571
grep -rln "…apply_invoice_payment_effects"                        → 00178 / 00277 / 00571
```

`difflib.unified_diff(00511 body, 00571 body, n=0)` →
**`added 199  removed 0`** — every project-path line byte-identical, matching the
migration header's own count. `apply_invoice_payment_effects` vs its 00277 head:
exactly two hunks (`LEFT JOIN projects`, `COALESCE(pr.name, i.title, 'Studio
invoice')`). `resolve_studio_identity` vs its 00320 head: exactly two hunks (the
third argument, the guarded step-0 short-circuit + the `v_studio_id IS NULL`
guard on step 1).

## C-1 (round 1's major) — fixed, and the fix is not vacuous

The UPDATE arm now reads: NOT-NULL shape checks → machine early return →
`organization_members × organizations` EXISTS → actor + roster block →
clean-draft bound. Suite section "A settle replays after the stamped designer has
left the studio" issues an invoice, promotes co-member B, suspends the stamped
designer A, then runs claim → finalize → settle as `service_role` and asserts
`paid / 40000 / paid_at IS NOT NULL`. It passes. The lane's negative control
(old body replayed in a scratch transaction → `ERROR: studio_id_not_designer_studio`
from `apply_invoice_payment_effects` at the claim's rollup) proves the test bites.

I re-probed the residual: with the household deleted from **every** roster, an
authenticated owner's `void_invoice` is `REFUSED P0001` but `service_role`'s
`void_invoice` is `ACCEPTED` — so the C-1 fix narrows advisory A-1 to the
authenticated actor only. Recorded below as A-1'.

## Money path and payload bounds, re-probed

```
P-IMMUT  service_role UPDATE invoices SET project_id = NULL on a seeded
         project invoice                                  REFUSED P0001
P-CHK    chk_invoices_anchor CHECK ((project_id IS NOT NULL)
         OR ((client_id IS NOT NULL) AND (studio_id IS NOT NULL)))
P-NEG      unit_amount_cents -5000                        REFUSED 23514
P-HUGE     quantity 999999999 × 2000000000                REFUSED 23514
P-NEGTAX   p_tax_rate -1                                  REFUSED 23514
P-LONGTITLE title 500 chars                               REFUSED 23514
```

Suite already pins: `INV-0001` off `studio_invoice_counters` (per-studio, S8
two-studio case at `:300-331`), the Checkout rail end to end, the `design_fee`
earning with `project_id IS NULL` and `net_amount = 66000`, the refund contra
leg, and the household / co-member / stranger read boundary. Grants:
`create_draft_studio_invoice → postgres=X/postgres,authenticated=X/postgres`
(anon and PUBLIC revoked); the three new policies are `TO authenticated`.

---

## Findings

### C2-1 (minor, 0.95) — the main-checkout `db-notes.md` is still a stale 00570 mirror

`M-3` from round 1 is only half closed. `stack-reset-notice.md` now matches
(`diff` exit 0), and the `## Close` + `## Fix round 1 (W1-close db lane) — C-1`
sections are byte-identical between the two copies (`diff` exit 0 over main
335-586 vs worktree 657-908). But the rest of the main copy was never refreshed:

```
wc -l  worktree 908   main 586
main:1   # W1 DB lane — studio invoices (00570)
main:6   `deploySet = ['migration 00570_studio_invoices.sql']`
main:8   ## The migration — `supabase/migrations/00570_studio_invoices.sql`
```

Main is missing `## Fix round 2 — R2-1 (renumber)`, `## Fix round 1 —
re-verification` and `## Fix round 3`, and it names **00570**, which on this
program is a *peer session's* migration (`approvals/w2-web`). The branch copy is
correct throughout. **Fix:** at integration overwrite the main-checkout
`db-notes.md` with the branch copy; do not read a deploySet out of the main copy.

### C2-2 (minor, 0.9) — the trigger's roster is still one predicate looser than the RPC (M-2, now documented)

Round 1's M-2 was not implemented; the lane took the ruling's other option and
documented the widening (`db-notes.md:781-790`, "Advisory left standing by these
four"). Re-proved on a fresh stack — household Two sits only on **non-designer**
co-member B's roster, stamped to designer A:

```
P-M2 trigger (direct DML INSERT): ACCEPTED
P-M2 rpc  (create_draft_studio_invoice): REFUSED 42501
```

So the row's law admits a household the composer's law refuses. Intra-studio and
ruled acceptable, but it means the trigger is not a strict superset of the RPC —
a future fixer reading "the same rule create_draft_studio_invoice resolves the
household through" (`00571:167-170`) will be misled, because the RPC additionally
requires `has_designer_domain_role(relationship.designer_id)` (`00571:816`).

### C2-3 (minor, 0.9) — `designer_clients.status` is still unfiltered in the new roster gate (R3-10 carry, now load-bearing at the row)

```
UPDATE public.designer_clients SET status = 'lead' WHERE id = …;
P-R310 lead-status roster, direct DML INSERT: ACCEPTED
```

A household that is only a *lead* — never an active client — satisfies the new
row-level roster gate. Before this close round the roster rule lived only in the
RPC; item 1 promoted it to the row's law without carrying a status filter, so
the gap is now pinned into the trigger's contract hash too. Carried finding, not
a regression, but it should be resolved with R3-12/R3-13 in W4 rather than after
the hash is on Strata.

### C2-4 (minor, 0.85) — S12 is still not the row's law (M-1 carry)

```
INSERT INTO public.invoices (…, title NULL, project_id NULL, …) as owner A
P-M1 null-title direct DML: ACCEPTED
```

`create_draft_studio_invoice` refuses a blank title (23514, suite `:363-372`);
direct PostgREST DML writes a NULL-title studio invoice that the ledger, the
folio head, the invoice email and the Stripe product name all read. `title` is
now in the trigger's `UPDATE OF` list, so the cheapest close is a `title`
clause in the studio branch's clean-draft predicate. Not in the four items.

### C2-5 (minor, 0.8) — the parity claim behind the C-1 fix is not accurate as written

`00571:124-131` and the contract test's pinned comment both say the UPDATE arm's
live-authority reads sit below the machine early return "exactly as the project
path's do". The project path's UPDATE arm does the opposite: it re-reads the
project tuple (`WHERE project.id = NEW.project_id AND project.client_id IS NOT
DISTINCT FROM NEW.client_id AND project.studio_id = NEW.studio_id`, `00571:214-220`)
and the `previous_lead` provenance *before* its `service_role` early return at
`:226`. The parity holds only for *membership/role* reads, which the project path
never does on a machine UPDATE. The studio branch now performs **no** structural
tuple re-validation for a machine UPDATE. That is safe — the four identity
columns are compared to `OLD` and raise on drift at `:100-108`, and the INSERT
arm still validates live authority before the row exists — but the comment as
written will mislead the next reader of a money-path gate. Reword, or say plainly
that the studio branch's only structural check *is* its membership read, which is
why it had to move.

### C2-6 (nit, 0.85) — item 3's stated motivation overstates the hole it closes

`00571:720-723`: "without it a direct UPDATE that touches only the regarding line
never fires the gate and **could rewrite an issued studio invoice's title**".
RLS already forbids that: both UPDATE policies on `invoices` are draft-only
(`Designers can update their draft invoices` and `invoices_studio_update_draft`,
each `USING (… AND status = 'draft')`). Probed: a hand `UPDATE … SET title` on an
issued studio invoice as its own stamped designer matches **0 rows**. Item 3 is
still correct and load-bearing — the suite proves it on a *draft* whose authority
is wrong (`studio_invoice_test.sql:797-812`, title-only write `REFUSED P0001`) —
but the comment claims a reachable exploit that is not reachable.

### C2-7 (nit, 0.8) — the ruled resolver change makes any active design studio's brand anon-readable by id

```
SET LOCAL ROLE anon;
SELECT * FROM public.resolve_studio_identity(NULL, NULL, '<a studio the caller
                                             has no relationship to>');
  studio_id 5f110000-…0003 | name 'Studio Invoice Three' | source 'studio'
```

Before 00571 an anon caller needed a project id or a designer id to reach a
studio's letterhead; the 3-arg form lets them name the studio directly. This is
exactly what item 2 ruled ("an active design_studio id returns it"), the payload
is brand-only (name/logo/website), and the r3 concern — non-studio organization
names — is closed. Logging it so the widening is on the record, not as an
objection.

### C2-8 (nit, 0.7) — `A-1'`: the stranding window is narrower than round 1 recorded

Round 1's A-1 said an outstanding studio invoice becomes un-issuable/un-voidable
once the household leaves every roster. Post-C-1 that is true only of the
**authenticated** actor:

```
P-A1  authenticated owner void_invoice after roster removal : REFUSED P0001
P-A1b service_role         void_invoice after roster removal : ACCEPTED
```

`db-notes.md:899-906` records this correctly; the round-1 finding text does not.

### C2-9 (nit, 0.6) — a comment paragraph lost its wrap

`00571:1299-1300`: "…never becomes an anon organization-name lookup. Two overloads
would make the PostgREST rpc call ambiguous, so this" — the inserted sentence
pushed the next one onto a ~110-column line in an otherwise 80-column banner.

## Carried unchanged, not re-litigated this round

R3-4 (no contract-test row for `create_draft_studio_invoice`), R3-6 (unguarded
document doorway in two ledger files), R3-8 (`use-invoices.ts:786` forces
`kind:'adhoc'`), R3-9 (unguarded `ADD CONSTRAINT`), R3-11 (int4 overflow parity),
R3-12 (`ON DELETE SET NULL` vs the CHECK), F-N2 (`stripe-rail` harness seed fails
pre-lane), F-N3 (`internal_notes` reaches the household through the whole-row
`invoices_household_select`), F-N5 (narrower REVOKE list), bare `auth.uid()` in
the three new policies (all three confirmed still `TO authenticated`, so the
initplan cost is the only issue).

`deploySet = ['migration 00571_studio_invoices.sql']`
