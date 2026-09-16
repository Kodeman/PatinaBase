# W0 — review round 2, fixes applied

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`, branch `hour-tracking/server`.
Commit **`82ca6c06d`** — `fix(time): W0 review round 2 — pin the legacy rate-less write-down, the cross-role re-seat, and the composer's stranded-draft error`.
Local stack: the program's own port-isolated Supabase project `patina-hours` (Postgres `127.0.0.1:54422`). `supabase/config.toml` stays skip-worktree'd and unstaged.
Every migration edited **in place** — W0 is unmerged and unapplied to prod, so no "fix" migration was added.

## Disposition

| id | verdict | where |
|---|---|---|
| **B1** | **FIXED** (all four steps) — measured, ruled-as-owed, tested, deploy-gated | Strata probe (read-only, below); `rulings.md` new row **HT-6-a**; `supabase/tests/billing/time_unbilled_view_repair_test.sql` case **(d)** (header `:37-72`, fixtures `:174-208`, asserts `:405-463`); `plan-v2.md` §1 deploy note |
| **m1** | ACCEPTED, no code change (as the finding directs) | `plan-v2.md` §2 "Two things the W1 lane must not assume" + §3 "One thing the W2 lane must not assume" |
| **m2** | **FIXED** | `rulings.md` HT-25-a second half (verbatim clause folded in); `supabase/migrations/00597_time_entry_auto_roster.sql` banner `:60-75` + `COMMENT` `:161-165`; new case **(i)** at `supabase/tests/rls/time_entry_auto_roster_test.sql:218-265` |
| **m3** | **FIXED both ways** — sentence corrected AND made true | `build/W0-fix-r1.md` m1 section (correction paragraph); new case **(c5)** at `time_unbilled_view_repair_test.sql:389-401` |
| **m4** | **FIXED** | `plan-v2.md` §0.20 (`:50`) and §11 (`:1042` region) — restated as a grep, `00597` added |
| **m5** | **FIXED** (both halves) | `apps/designer-portal/src/components/document/accounts/invoice-composer.tsx` — docblock `:18-26`, inner catch `:396-419`; `supabase/migrations/00595_time_entry_claim_and_source.sql` banner `:8-21` + `COMMENT` `:150-156` |
| **n1** | ACCEPTED, no change in W0 (as directed) | `plan-v2.md` §4 "One thing the W3 lane must not assume" |
| **n2** | **FIXED** | `plan-v2.md` W0/W1/W2 gate blocks + the §12 risk-table row at `:18` |
| **n3** | CARRIED to merge | below |
| **n4** | CARRIED to merge | below |
| **n5** | CARRIED to the owed-to-Kody list | below |
| **n6** | **FIXED** (the optional hardening taken) | `00595_time_entry_claim_and_source.sql:86-103` |
| **n7** | recorded | below, and in the merge-commit paragraph |
| **n8** | ACCEPTED, deferred to W1/W2 as directed | below |
| **n9** | **SPLIT — first half FIXED, second half REJECTED with evidence** | `build/W0-impl.md` §1 probe paragraph (corrected table); rejection below, and the true fact recorded in `plan-v2.md` §2 |
| **n10** | recorded, and the rule is in this report's gate block | below |

Files committed (5): `supabase/migrations/00595_time_entry_claim_and_source.sql`, `supabase/migrations/00597_time_entry_auto_roster.sql`, `supabase/tests/billing/time_unbilled_view_repair_test.sql`, `supabase/tests/rls/time_entry_auto_roster_test.sql`, `apps/designer-portal/src/components/document/accounts/invoice-composer.tsx`.
`plan-v2.md`, `rulings.md`, `W0-impl.md` and `W0-fix-r1.md` are **untracked working files in the main checkout** (`artifacts/hour-tracking-2026-09-11/` is on no ref, and `build/` is gitignored), so they are edited but not committed by this lane.

---

## B1 — the legacy rate-less write-down

**The mechanism is confirmed, by file and by fixture.** `00412:2675-2681` resolved both `resolved_rate_cents` and `amount_cents` through `te.hourly_rate_cents → NULLIF(projects.change_order_terms->>'hourly_rate_cents',0) → profiles.default_hourly_rate_cents → 0`. `00596` reduces both to `te.hourly_rate_cents` / `te.rated_amount_cents`. The classifier's non-services branch (`00578:2648-2654`) sets `billing_state='authorized'` and leaves **both** `hourly_rate_cents` and `rated_amount_cents` NULL when no rate was supplied, and `useCreateTimeEntry`'s `CreateTimeEntryInput` has no rate field, so it cannot supply one. Reproduced in the new test, printed by its own NOTICE:

```
time_unbilled_view_repair (d3): pre-00596 this row read rate=17500 amount=35000;
post-00596 it reads 0/0 — owed ruling HT-6-a.
```

The asymmetry the three artifacts treated as symmetric is also confirmed: `profiles.default_hourly_rate_cents` has **no writer anywhere** (grep over `apps`, `packages`, `services`, `supabase` returns only `00177`'s `ADD COLUMN`, the two view bodies, `00555`'s comment, and `database.types.ts`) and **0 rows set on Strata** — cutting that leg is free. `projects.change_order_terms->>'hourly_rate_cents'` is written on every proposal activation from a **$175/h editor default** (`apps/designer-portal/src/components/portal/scope-builder/change-order-terms-editor.tsx:27` — note the path, which is `portal/scope-builder/`, not `document/accounts/`) — that leg is live.

### Step 1 — Strata exposure, measured read-only (2026-09-11)

The finding's query, verbatim:

```
rows = 1 · projects = 1 · cents_at_risk = 17500
```

Denominators, same session:

```
all_entries                  = 88
unbilled_authorized          = 14   (invoice_id IS NULL, billable, completed, 'authorized')
unbilled_rateless            =  4   (of those, hourly_rate_cents IS NULL)
projects_with_co_rate        =  8
profiles_with_default_rate   =  0
```

The one intersecting row, named so the ruling has a subject:

| entry | day | minutes | source | project | change-order rate | at risk |
|---|---|---|---|---|---|---|
| `8f3f1653-cd8a-4af3-908e-fc52f79d7973` | 2026-08-03 | 60 | `manual_entry` | **"Kodys Test Project"** (designer = Kody, `74056c2a-…`) | 17500 | **$175.00** |

The other three rate-less rows sit on projects with **no** change-order rate (two on "Ashford Heights — main floor refresh", one on "Lake house, main floor") and read `0/0` both before and after `00596` — `00596` changes nothing for them.

**So the live write-down today is one row, $175, on a test project — not a studio's money.** That makes the "accept $0" answer cheap, but it does not change the mechanism for any row logged between now and W1's resolver, and it does not make the test gap acceptable. Nothing was mutated on Strata.

### Step 2 — recorded as owed ruling HT-6-a

New row in `rulings.md` → *Sub-rulings and owed rulings*, carrying the mechanism, the two candidate answers ((a) stamp `hourly_rate_cents` once from the change-order rate, which **preserves** the amount and is arguably what P-4's *"unbilled history keep their amounts"* requires rather than what it forbids; (b) accept $0 explicitly with Leah told before the deploy), the full Strata measurement, and the three live-money consequences (Hours ledger balance + per-row dollars, `useStudioTimeReport`'s studio `unbilledAmountCents`, the composer's time line → `claim_time_entries` → `guard_invoiced_time_entry` freeze). **Status: OWED — not ruled. Shipped as the write-down.**

### Step 3 — the test case

`time_unbilled_view_repair_test.sql` case **(d)**, in a deliberately **third** studio (`a7220000-…`) so neither case (a)'s profile-visibility precondition nor case (b1)'s sweep changes meaning. Fixture: a non-services project carrying `change_order_terms.hourly_rate_cents = 17500` plus a 120-minute billable entry with no rate. Asserts (d1) the preconditions — project rate present, row rate NULL, `rated_amount_cents` NULL, `billing_state='authorized'`; (d2) the view reports **0 / 0**, each assert message tagged `(HT-6-a, unruled)`; (d3) raises a NOTICE naming the pre-`00596` figures computed from the project's own terms. Ruling (a) flips exactly the two (d2) asserts.

### Step 4 — the deploy gate

`plan-v2.md` §1 now carries a block-quote under the migrations table: **`00596` is not a pure repair and must not be pushed to Strata ahead of W1's resolver.** P-3 (one ship at the end, after W7) already forbids it; the note exists so nobody reasons past P-3 on the premise that W0 is "just the bug fixes". It points at HT-6-a and names the $175 exposure.

---

## m2 — the cross-role re-seat

Probed on the isolated stack: a member whose **`vendor`** seat the owner removed logs again →

```
role             | live
-----------------+------
support_designer | t
vendor           | f
```

`ON CONFLICT (project_id, user_id, role)` can only match a row of the role the INSERT proposes, which is always `support_designer`, so a new row is inserted beside the tombstone. The classifier's `count(DISTINCT member.role) = 1 … WHERE removed_at IS NULL` correctly excludes the tombstone (verified: `count = 1`), so the entry rates at the **Support designer** rate-card row rather than **Vendor**, and `v_project_roster` / the Call Sheet list them as a support designer.

Folded into `rulings.md` HT-25-a **verbatim** ("removal of a non-`support_designer` seat re-seats the member as `support_designer`, a role they never held, which the classifier then uses as the rate role"), with the probe output and the fix-if-ruled-otherwise (a `removed_at IS NOT NULL` pre-check that refuses rather than inserts, if only the cross-role form is to go). `00597`'s banner and `COMMENT` no longer imply same-role. New case **(i)** asserts (i1) two rows, (i2) the vendor tombstone intact, (i3) the live role is `support_designer`, (i4) exactly one live role. **Before (i), this behaviour passed no assertion at all.**

---

## m3 — the sweep RLS had narrowed

The finding is right and there was no coverage gap: `(b1)` runs as `a7200000-…-001`, `project_unbilled_time` is `security_invoker = true`, and case (c)'s rows live in a separate studio, so `(b1)`'s "every row of the view" was **two rows, not four**; `(c3)` already asserted the authority-rated reconciliation directly. Both remedies taken: `W0-fix-r1.md`'s sentence is corrected in place with the reason, **and** new case **(c5)** runs the same sweep as `a7210000-…-001`, with a companion assert that the sweep saw ≥ 1 row — so it cannot pass on an empty result set, which is exactly how `(b1)` silently missed this studio.

---

## m5 — the stranded draft, and "no transaction to roll back"

Both halves confirmed before changing anything: `fk_time_entries_invoice … ON DELETE SET NULL` at `00178:205-212`; `guard_invoiced_time_entry` permits an `invoice_id`-only change; `guard_time_entry_invoice_authority` returns early on `NEW.invoice_id IS NULL`. So the draft delete really is the release path — and the bare `catch {}` really did strand the hours on an abandoned draft, out of `project_unbilled_time`, recoverable only by voiding or deleting that invoice.

The composer's inner catch now tracks whether the compensating delete failed and, when it did, appends `The draft <id> still holds those hours — void it to release them.` to the claim error instead of swallowing it. `00595`'s banner and `COMMENT` no longer say "rolls the transaction back" — they now say what actually happens: PostgREST gives the RPC its own transaction, a short return means rows **are** stamped, and the caller deletes the draft it just created, which releases the partial stamp through the ON DELETE SET NULL FK. The composer's file docblock carried the same false claim ("no orphaned time line survives") and is corrected too.

---

## n6 — the widen is now provably effective

`00595`'s postcondition gains a `count(*) = 1` assert over `pg_constraint` for CHECKs whose `conkey` is the `source` attnum, with the reasoning inline (00545's own F4 comment warns about the shape; 00545 paid the archaeology; nothing between 00545 and 00591 touches `source`). Stated explicitly in the comment: **Strata was not probed for this — the assert is what will probe it, at push time.**

---

## n9 — first half fixed, second half rejected

**First half is correct.** `W0-impl.md`'s trigger-order paragraph listed five triggers as the BEFORE-INSERT set; two are not. Re-measured (`tgtype & 2` BEFORE, `& 4` INSERT, `& 16` UPDATE):

| trigger | timing | events | function |
|---|---|---|---|
| `aaa0_time_entry_auto_roster_trg` | BEFORE | INSERT | `time_entry_auto_roster` |
| `aaa_guard_time_entry_invoice_insert_trg` | BEFORE | INSERT | `guard_commercial_time_entry_derived_fields` |
| `aab_guard_commercial_time_entry_derived_fields_trg` | BEFORE | **UPDATE only** | `guard_commercial_time_entry_derived_fields` |
| `aac_classify_project_time_entry_authority_trg` | BEFORE | INSERT + UPDATE | `classify_project_time_entry_authority` |
| `aad_guard_time_entry_invoice_authority_trg` | BEFORE | **UPDATE of `invoice_id` only** | `guard_time_entry_invoice_authority` |

`W0-impl.md` now carries that table, says what it corrects, and keeps the conclusion (unchanged, and independently verified by effect).

**Second half is wrong. SKIPPED.** n9 says "§0.7(c) asks W1 to harden `guard_commercial_time_entry_derived_fields`'s INSERT branch, and that guard has NO INSERT trigger today — W1 must add one, not assume it exists." It does have one, under a misleading name: **`aaa_guard_time_entry_invoice_insert_trg`**, created at `00412:2387-2391` as `BEFORE INSERT ON public.project_time_entries FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_time_entry_derived_fields()`. Confirmed live:

```
aaa_guard_time_entry_invoice_insert_trg | guard_commercial_time_entry_derived_fields
```

(`pg_trigger` joined to `pg_proc` on the isolated stack — the same probe that produced the table above, which is why the row is in it.) n9 read the *name* as being about the invoice guard. So §0.7(c) is a **function-body** edit to that guard's INSERT branch, and **W1 must not add a second BEFORE INSERT trigger on the same function** — recorded in `plan-v2.md` §2 so the corrected fact travels, not just the corrected probe.

---

## Gate outputs

Object probes bracketing the run (after `supabase db reset` on the isolated stack):

```
BEFORE-INSERT trigger order  = aaa0_time_entry_auto_roster_trg,
                               aaa_guard_time_entry_invoice_insert_trg,
                               aac_classify_project_time_entry_authority_trg
source CHECKs keyed on col   = 1   (n6's new assert; migration applied clean)
project_unbilled_time viewdef: no 'profiles', no 'change_order_terms',
                               no 'default_hourly_rate_cents', keeps 'JOIN projects'
m2 probe (removed vendor seat, member logs again) = support_designer(live) + vendor(removed)
```

Every SQL suite run **worktree-relative** with `-k supabase/tests/KNOWN_FAILURES.md` and `-H 127.0.0.1 -p 54422` (n10 / round-1 m4 — and `commercial` is still **10 of 16 files**, the four countersign files aborting before their authority asserts, so "commercial green" is not coverage of the authority rate path):

```
supabase db reset                                  → Finished (548 migrations + 15 seeds)
python3 scripts/generate-legacy-grants.py          → baseline + 2600 replayed statements;
                                                     seed file UNCHANGED (no grant delta)
run-sql-tests.sh -d supabase/tests/billing         →  5 green +  0 expected-fail =  5/5,  0 unexpected
run-sql-tests.sh -d supabase/tests/rls             → 23 green +  2 expected-fail = 25/25, 0 unexpected
run-sql-tests.sh -d supabase/tests/commercial      → 10 green +  6 expected-fail = 16/16, 0 unexpected
run-sql-tests.sh -d supabase/tests/field           →  5 green +  1 expected-fail =  6/6,  0 unexpected
pnpm db:generate → git diff --exit-code packages/supabase/src/database.types.ts → exit 0 (in sync)
pnpm --filter @patina/supabase type-check          → clean (tsc --noEmit)
pnpm --filter @patina/designer-portal type-check   → clean (tsc --noEmit)
pnpm --filter @patina/designer-portal test         → 573 suites / 7259 tests passed
pnpm --filter @patina/designer-portal lint         → 0 errors, 201 warnings (all pre-existing)
pnpm --filter @patina/admin-portal build           → build succeeded (the type-enforcing portal gate)
```

`supabase/tests/rls/time_entry_auto_roster_test.sql` (cases a–i), `supabase/tests/billing/time_claim_atomicity_test.sql`, `time_unbilled_view_repair_test.sql` (cases a–d), `rls/project_roster_test.sql` and `field/time_entry_field_visit_source_test.sql` are all green above.

Two notes on the gate list itself:

- **`pnpm turbo build --filter=@patina/supabase` is not in it** (n2). Re-measured: `packages/supabase/package.json` has no `build` script, so turbo skips it and the "2 successful" it prints are `@patina/types` + `@patina/utils`. Replaced in the plan's W0/W1/W2 blocks by `pnpm --filter @patina/supabase type-check` plus `pnpm --filter @patina/admin-portal build` (both already run above, both clean).
- **`scripts/run-sql-tests.sh` needs the sandbox off.** `mktemp -d` on macOS resolves `_CS_DARWIN_USER_TEMP_DIR` and ignores `TMPDIR`, so under the Bash sandbox `LOG_DIR` comes back empty and the script reports `no .sql files found` — a false negative, not a test failure. Run it with `dangerouslyDisableSandbox`. Worth putting in the W1+ briefs.
- **Prettier drift on `invoice-composer.tsx` is pre-existing and repo-wide**, not introduced here: the pre-commit hook's advisory warning fires because the file is committed with single quotes and the repo prettier config wants double. `prettier --write` rewrites 52 lines of untouched code, and `prettier --check` fails identically on `hours-ledger.tsx`, which this lane never touched. The sweep was reverted; the new lines follow the file's own house style.

---

## Carried forward

- **n3 + round-1 m6 — the merge commit must say this** (no code change; the tip is correct, only the early history misleads): the numbers and ids in `343252aaa` / `ef8fe776f` are **pre-renumber** (`00592–00594` / `V10` / `R151`; the shipped set is **`00595–00597` / `R152` / `V11`**); `343252aaa`'s body says `project_unbilled_time` "now LEFT JOINs profiles" and the file it shipped asserts `NOT LIKE '%JOIN profiles%'` — **the join is removed outright** (n7: stronger than HT-6's "LEFT JOIN" wording, authorised by plan-v2 §1, enforced by the file's own postcondition); and `f0f97145b` carried six migrations for one commit (three duplicates) with `de4b18553` removing the old three, so the series is not bisectable. **Either squash `343252aaa..de4b18553` or carry that paragraph in the merge commit.** Nothing in the branch enforces it.
- **n4 — expect a textual conflict** in both `docs/design/the-document/DECISIONS.md` and `docs/vision/VISION-DECISIONS.md`: both programs append at the identical end-of-file position, and `VISION-DECISIONS.md`'s footer lists `V10` (the peer's entry — true only if the peer merges first), while `DECISIONS.md` now reads `R150 → I154 → R152` with `R151` absent. Resolve by keeping **both** entries in id order, leaving the footers as written, and saying in the merge commit which side moved (**hour tracking moved: R151 → R152, V10 → V11**).
- **n5 — owed to Kody:** paste V11's §6 bullet into `docs/vision/VISION.md` after line 73. That file is **untracked** (`git ls-files docs/vision/` returns only `VISION-DECISIONS.md`), so no lane can commit it; the exact sentence and insertion point are recorded verbatim inside the V11 entry, citing `(V11, 2026-09-11)`.
- **n8 — dead exports:** `TimeEntryFilters` and `timeKeys.timeEntries`'s `filters` arm lost their only consumer (`useTimeEntries`, deleted in W0) and are still exported from `packages/supabase/src/hooks/index.ts`. Harmless. Drop them with the next edit to that module in W1/W2, not in a sweep of their own.
- **Owed rulings now standing on this program:** **HT-6-a** (new — the legacy rate-less write-down; rule it before the deploy) and **HT-25-a** (both halves — does the owner's removal stick, and is the cross-role re-seat intended). Plus the unruled program rows HT-2, HT-5, HT-6, HT-8, HT-9, HT-11 … already in `rulings.md`.
- **Re-run the all-branch migration-number check immediately before merge** (§0.2a), and re-check `00597`'s ACL-seed regeneration against the §0.20 **grep**, not a list (m4).
