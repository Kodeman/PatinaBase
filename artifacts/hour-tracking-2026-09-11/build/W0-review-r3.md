# W0 — adversarial review, round 3

**clean = true** (zero blocker, zero major)

Reviewer: separate context, not the implementer. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`, branch `hour-tracking/server`
(tip `82ca6c06d`), diffed against `origin/hour-tracking/integration`.
Local stack: the program's own port-isolated project `patina-hours` — Postgres `127.0.0.1:54422`.
Every DB claim below is bracketed by an object probe (`pg_proc` / `pg_constraint` / `pg_policies` /
`pg_trigger` / `pg_get_viewdef`), never by the migrations ledger (§11 amendment, `patina-db-migrations`
step 7).

Round 2's one blocker (**B1**) and five minors (**m1–m5**) are each re-verified below as fixed or
accepted-as-directed. Five new **minor** findings and eleven **notes** are raised; none blocks.

---

## 1 · Round-2 dispositions, verified independently

| id | claimed | verified |
|---|---|---|
| **B1** (blocker) | FIXED, four steps | **Yes, to the limit a lane can reach.** `rulings.md:70` carries **HT-6-a** with the mechanism, both candidate answers, and the Strata measurement (88 entries · 14 unbilled-authorized · 4 rate-less · 8 projects with a change-order rate · **1 intersecting row, $175.00, "Kodys Test Project"**). `time_unbilled_view_repair_test.sql` case **(d)** (`:404-462`) pins today's `0 / 0` with the pre-`00596` figures named in the assert messages and a `(d3)` NOTICE stating the write-down. `plan-v2.md` §1 carries the deploy block-quote. Status is **OWED — not ruled**, which is the correct terminal state for a lane; ruling it is Kody's and gates the deploy (note n9) |
| **m1** | accepted, no code change | Yes — `plan-v2.md` §2 "Two things the W1 lane must not assume" carries it verbatim |
| **m2** | FIXED | Yes — `00597` banner `:60-71` + `COMMENT` `:161-165` no longer imply same-role; `rulings.md` HT-25-a carries the second half verbatim; test case **(i)** at `time_entry_auto_roster_test.sql:231-282` asserts 2 rows, the vendor tombstone intact, live role `support_designer`, exactly one live role. Re-probed myself: a removed `vendor` seat + a new log → `support_designer(live)` beside `vendor(removed)` |
| **m3** | FIXED both ways | Yes — case **(c5)** at `:384-396` runs the reconciliation sweep as the *services* designer **and** asserts `count(*) >= 1` so it cannot pass on an empty set |
| **m4** | FIXED | Yes — `plan-v2.md` §0.20 and §11 restate the rule as the grep and add `00597`. I re-ran the grep: `grep -lE '^\s*(GRANT\|REVOKE)' supabase/migrations/0059[567]*.sql` → `00595`, `00597` only; both appear in the regenerated `supabase/seed/00-legacy-grants.sql` under their own comments |
| **m5** | FIXED both halves | Yes — composer inner catch `:396-421` tracks the failed compensating delete and appends the stranded-draft sentence; `00595`'s banner `:11-21` and `COMMENT` `:155-169` now describe the real mechanism (own PostgREST transaction, `ON DELETE SET NULL` release), not a rollback. I confirmed the FK (`00178:211-212`) and that both BEFORE-UPDATE guards permit an `invoice_id`-only detach |
| **n6** | optional hardening taken | Yes — `00595:97-107` asserts `count(*) = 1` over `pg_constraint` keyed on `source`'s attnum. Probed live: **1** |
| **n9** | split, second half rejected | **The rejection is correct.** `pg_trigger` × `pg_proc` on the reset stack: `aaa_guard_time_entry_invoice_insert_trg` is BEFORE INSERT and executes `guard_commercial_time_entry_derived_fields`. §0.7(c) is a body edit, and `plan-v2.md` §2 now says so |
| n1 / n2 / n3 / n4 / n5 / n7 / n8 / n10 | accepted / carried | Re-checked; carried forward below as notes |

---

## 2 · Inventory vs plan-v2 §1 — every item at its assigned number and signature

| Plan item | Present | Evidence |
|---|---|---|
| `00595_time_entry_claim_and_source.sql` | ✓ | banner, `BEGIN…COMMIT`, renumber lineage recorded |
| `claim_time_entries(p_invoice_id uuid, p_entry_ids uuid[]) RETURNS SETOF uuid`, `LANGUAGE sql`, `SECURITY INVOKER`, `SET search_path = public, pg_temp` | ✓ **verbatim**, plus the plan's `duration_minutes IS NOT NULL` leg | `pg_proc`: `prosecdef = f`, `proconfig = {search_path=public, pg_temp}`, VOLATILE (correct — PostgREST POST-only) |
| `REVOKE … FROM PUBLIC, anon` + `GRANT … TO authenticated` | ✓ | live ACL `{postgres=X,authenticated=X,service_role=X}` — `anon` and PUBLIC absent (note n1) |
| `project_time_entries_source_ck` widened **by name** to nine values | ✓ | `pg_get_constraintdef` lists all nine; exactly **1** CHECK keyed on `source` |
| `00596_project_unbilled_time_repair.sql`, name/column list/order/types unchanged | ✓ | grafted from `00412:2671-2688`; I diffed the column lists head-to-head — identical, `security_invoker = true` retained |
| `profiles` join removed outright; one rate source | ✓ | viewdef probe: no `profiles`, no `change_order_terms`, no `default_hourly_rate_cents`, **keeps** `JOIN projects` (the W4 `project_id IS NULL` filter) |
| `00597_time_entry_auto_roster.sql`, DEFINER, `search_path`, `REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role` | ✓ | `pg_proc`: `prosecdef = t`, ACL `{postgres=X}` only |
| trigger `aaa0_time_entry_auto_roster_trg` BEFORE INSERT, fires first | ✓ | BEFORE-INSERT set in name order = `aaa0_`, `aaa_guard_time_entry_invoice_insert_trg`, `aac_classify_…`; the file's own postcondition asserts it |
| seat `role='support_designer'`, `assigned_by = NEW.user_id`, own-designer early exit | ✓ | body `:97-147`; `UNIQUE (project_id, user_id, role)` exists at `00084:172`, `updated_at` column exists |
| hook module moved to `packages/supabase/src/hooks/use-time-tracking.ts`, names unchanged (§0.21) | ✓ | rename detected; all eleven §0.21 identifiers exported from `hooks/index.ts`; package index already does `export * from "./hooks"` |
| `useClaimTimeEntries` → `rpc('claim_time_entries')`, count compare, **compensating detach deleted** | ✓ | substantive diff read line by line; no `update({invoice_id:null})` survives anywhere |
| §10 deletions 1–7 | ✓ | `grep -rn "useTimeEntries\|useReleaseTimeEntries\|useTimeSummary\b" apps packages` → empty; `grep -rn "hooks/use-time-tracking" apps packages` → empty; the `/desk?book=hours` comment is gone |
| three new SQL test files with the plan's named cases | ✓ | claim (a)(b)(c)(d); view (a)(b)(c incl. c5)(d); roster (a)(b)(c)(d)(e)(f)(g)(h)(i) |
| §9 governance, dated | ✓ | `DECISIONS.md` **R152 … — 2026-09-11**, footer `last id = R152`; `VISION-DECISIONS.md` **V11 … — 2026-09-11**, footer `last id = V11` |
| §10 "verify first" — the `CLAUDE.md` prototype pointer | ✓ | recorded as accurate in `W0-impl.md` §4 |

**Nothing from a later wave was built.** No `rate_source`, `rate_role`, `studio_member_rates`,
resolver, ledger view, rollup RPC, `project_hours_total`, lens, `start_timer`, internal time, or
cron. `useStudioTimeReport` and `useUpdatePhaseEstimates` survive deliberately (§10 rows 14 / NOT
deleted).

**Number and ledger-id re-check (§0.2a / §0.2b), run this round after `git fetch --all --prune`,
across every ref:**

```
refs/{heads,remotes/origin}/build/people-room-crm-2026-09-11 : 00592, 00593, 00594
refs/{heads,remotes/origin}/hour-tracking/server            : 00595, 00596, 00597
no other ref holds 00592–00699.   R151/V10 = peer.  R152/V11 = hour tracking.  No collision.
```

---

## 3 · Program rules — every prohibition checked

| Rule | Verdict |
|---|---|
| client-supplied rate trusted anywhere **in what W0 builds** | **Not violated.** `claim_time_entries` reads no rate. `useCreateTimeEntry`'s input still has no rate field. The pre-existing client-trusted-rate hole is HT-1/W1's `00600` (see minor **r3-m2** for the one claim W0 overstates about it) |
| a flag | none — `grep -i "featureflag\|useFeatureFlag"` over the three migrations and the moved module: nothing added |
| a backfill | none — the only `UPDATE public.project_time_entries` in the wave is inside `claim_time_entries`' body |
| notes in a rollup return | no rollup exists in W0. `project_unbilled_time` carries `te.notes` exactly as `00412` did — unchanged, and not a rollup |
| invoiced lock weakened | `guard_invoiced_time_entry` (`00177:51-84`) is not referenced except in comments; live trigger still `BEFORE UPDATE OR DELETE`, still keyed on `OLD.invoice_id`. The RPC's `duration_minutes IS NOT NULL` leg **strengthens** the lock's interaction with the timer slot |
| a DEFINER function without its assert or with PUBLIC execute | `time_entry_auto_roster` is the only new DEFINER: actor assert (`NEW.user_id = auth.uid()`), fail-closed on NULL actor, `is_studio_comember` gate, ACL `{postgres=X}` only. `claim_time_entries` is INVOKER by design (§0.9-adjacent; plan text) |
| running-slot index touched | `uniq_project_time_entries_running_timer` appears nowhere in the diff |
| a policy keyed on `projects.studio_id` | **no policy added, dropped, renamed or re-qualified at all** — `pg_policies` count on `project_time_entries` is the same nine |
| non-additive change to `project_time_entries` | no column added or dropped; the only DDL is the named `source` CHECK widening (blessed by plan §1) |
| guard column list extended in BOTH the body and the `BEFORE UPDATE OF` list | **not applicable** — W0 adds no derived column. §0.8's obligation lands with `00600` |
| 00484 registration contract when a registered policy is dropped/re-created | **not reached** — nothing is dropped. The 00484 quartet's live quals confirmed unchanged (and the impl's correction to §0.17 is confirmed: the SELECT policy's qual is `is_project_team_member(project_id)` **alone**) |
| migrations at the amendment's assigned numbers | `00595`, `00596`, `00597` — correct, unique on every ref |

---

## 4 · Gates re-run by me, verbatim

All from `/Users/kody/Code/patina-merged/.codex/worktrees/agent-server`. `supabase` and
`run-sql-tests.sh` run with the sandbox off (telemetry file / `mktemp` — note n10).

```
$ supabase db reset --workdir …/agent-server
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
ledger head after reset: 20260910152111, 00597, 00596, 00595   (applies clean through the wave's last migration)

$ scripts/run-sql-tests.sh -d …/agent-server/supabase/tests/billing -H 127.0.0.1 -p 54422
PASS invoice_checkout_integrity_test.sql · invoice_links_test.sql · studio_invoice_test.sql
PASS time_claim_atomicity_test.sql · time_unbilled_view_repair_test.sql
total: 5   green: 5   unexpected-fail: 0   effective-green: 5/5

$ ./scripts/run-sql-tests.sh -d supabase/tests/commercial -k supabase/tests/KNOWN_FAILURES.md -H 127.0.0.1 -p 54422
total: 16  green: 10  expected-fail: 6  unexpected-fail: 0  effective-green: 16/16

$ ./scripts/run-sql-tests.sh -d supabase/tests/rls -f time_entry -k … -H 127.0.0.1 -p 54422
PASS supabase/tests/rls/time_entry_auto_roster_test.sql
total: 1   green: 1   unexpected-fail: 0

$ ./scripts/run-sql-tests.sh -d supabase/tests/rls -k … -H 127.0.0.1 -p 54422
total: 25  green: 23  expected-fail: 2  unexpected-fail: 0  effective-green: 25/25
  (project_roster_test.sql and people_directory_scope_test.sql individually PASS — §12 row 17's catchers)

$ ./scripts/run-sql-tests.sh -d supabase/tests/field -k … -H 127.0.0.1 -p 54422
total: 6   green: 5   expected-fail: 1  unexpected-fail: 0  effective-green: 6/6
  (time_entry_field_visit_source_test.sql PASS)

$ pnpm --filter @patina/supabase type-check            → tsc --noEmit, no output
$ pnpm --filter @patina/designer-portal type-check     → tsc --noEmit, no output
$ pnpm --filter @patina/designer-portal test -- src/hooks/__tests__/use-time-tracking-authority.test.tsx \
      src/hooks/document-time-provider.test.tsx \
      src/components/document/accounts/__tests__/invoice-composer-studio.test.tsx
  Test Suites: 3 passed, 3 total   Tests: 23 passed, 23 total
$ pnpm --filter @patina/designer-portal test           → 573 suites / 7259 tests passed, 1 snapshot
$ pnpm --filter @patina/supabase test                  → 100 files / 1244 passed, 12 skipped
$ pnpm --filter @patina/designer-portal lint           → 0 errors, 201 warnings (all pre-existing)
$ pnpm --filter @patina/admin-portal build             → route table printed, exit 0 (the type-enforcing gate)
```

**Beyond the plan's list, because a `packages/*` edit is the change type** (`patina-verification`
minimum bar (a) — type-check every consuming portal):

```
$ pnpm --filter @patina/manufacturer-portal type-check  → clean
$ pnpm --filter @patina/client-portal type-check        → 9 errors, ALL @patina/aesthete-quiz module-resolution
$ npx turbo build --filter=@patina/aesthete-quiz        → 2 successful
$ pnpm --filter @patina/client-portal type-check        → clean
```

Pre-existing worktree-state, not a W0 defect (note n8).

### Generated files

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54422/postgres pnpm db:generate
$ python3 …/agent-server/scripts/generate-legacy-grants.py
  wrote supabase/seed/00-legacy-grants.sql — baseline + 2600 replayed statements
$ git -C …/agent-server status --short
  (no output)
```

Both generated files are in sync; the seed carries the `00595` REVOKE/GRANT pair and the `00597`
REVOKE under their own file comments. `supabase/config.toml` is `S` (skip-worktree) and unstaged.

---

## 5 · Done-when probes (SQL on 54422, as the roles the plan's tests name)

| Done-when | Probe | Result |
|---|---|---|
| a conflicting two-tab claim leaves the invoice's pre-existing entries stamped | `claim_time_entries(a1, [free, rival-owned])` as the project designer | returns only the free id; `b1` still on `a1`, `b3` still on `a2` (case (a), re-run green) |
| `project_unbilled_time` as the owner includes a roster vendor's entry (vendor not an org member) | fresh fixture, read as the designer under `request.jwt.claims` | 1 row, `user_id` = the vendor |
| `round(duration/60 * resolved_rate_cents) = amount_cents` | same row | `90 min · 15000 · 22500 · reconciles = t` |
| `project_time_entries_source_ck` admits all nine values | `pg_get_constraintdef` | all nine present; exactly one CHECK keyed on `source` |
| a log on an un-rostered project leaves exactly one `support_designer` row | member logs under her own JWT | one live `support_designer` row |
| the project's own designer's entry leaves none | designer logs on her own project | no seat for her; the vendor's pre-existing seat untouched; `v_project_roster` carries no `team` row for her (case (f)) |
| `grep -rn "useTimeEntries\|useReleaseTimeEntries" apps packages` | — | empty |
| three governance entries committed with dates | `git diff` of both ledgers | R152 / V11, both dated 2026-09-11 |

---

## 6 · Commit hygiene

`git show --stat` read per commit (`343252aaa`, `01372b0dd`, `c6b8fa763`, `ef8fe776f`, `f0f97145b`,
`de4b18553`, `a4999ab9d`, `82ca6c06d`). Files match their messages; no stray paths; **no
`supabase/config.toml`** in any commit; no `.env`, no `dist/`, no artifacts. Working tree clean.
The one residual is historical, not content — note n5.

---

## Findings

### BLOCKER

None.

### MAJOR

None.

### MINOR

**r3-m1 · `plan-v2.md` §0.17's claim that an owner cannot claim a teammate's hours is false for the
project designer — measured.** *Confidence: high.*
Location: `plan-v2.md` §0.17, the sentence *"`claim_time_entries` inherits `Team can update their own
time entries`' `user_id = auth.uid()` leg, so **an owner composing an invoice still cannot claim a
teammate's hours** … closed by HT-22's W2 write widening (`time_entries_owner_admin_update`), which
must therefore land before the composer is trusted with a mixed-author claim."*

`Designers manage their project time entries` is `FOR ALL` with `qual = EXISTS(projects p WHERE
p.id = project_id AND p.designer_id = auth.uid())` and **`with_check IS NULL`** — so Postgres reuses
the qual as the UPDATE `WITH CHECK`, and the project designer may update any row on her project,
teammate-authored included. Probed on a fresh fixture (owner + rostered `support_designer` author +
draft invoice): `claim_time_entries` returned **1** and the teammate's entry carries the invoice id.

What *is* true is the narrower statement: a studio co-member who is **not** the project designer
cannot claim — `time_entries_studio_update_own` carries the `user_id = auth.uid()` leg and
`Designers manage …` requires `designer_id = auth.uid()`.
No code defect, and the error is conservative (it understates today's capability), but §0.17 is a
*binding rule* and a W2 test written from it would assert the wrong thing.
**Fix:** rewrite the §0.17(b) clause to *"a studio co-member who is not the project designer cannot
claim a teammate's hours; the project designer already can, via `Designers manage their project time
entries` (ALL, no `with_check`)"*, and drop the "must therefore land before the composer is trusted"
ordering claim or re-scope it to the non-designer case.

**r3-m2 · `00596`'s "ONE rate source" is not an invariant until W1's `00600`, and the view test's
"every row reconciles" sweep has no fixture for the shape that breaks it.** *Confidence: high
(measured).*
Location: `supabase/migrations/00596_project_unbilled_time_repair.sql:50-53`, `COMMENT` `:63-71`
(*"resolved_rate_cents is the rate that priced amount_cents — never a second chain"*);
`supabase/tests/billing/time_unbilled_view_repair_test.sql:304-307` (b1) and `:387-390` (c5).

`resolved_rate_cents` reads `te.hourly_rate_cents`; `amount_cents` prefers `te.rated_amount_cents`.
Nothing yet forbids a caller from supplying one without the other — §0.7(c)'s INSERT-branch hardening
is `00600`'s, per plan §2. Probed as `authenticated` on a non-services project:

```
POST rated_amount_cents=999999, no hourly_rate_cents
  stored: hourly_rate_cents = NULL, rated_amount_cents = 999999, billing_state = 'authorized'
  view:   resolved_rate_cents = 0, amount_cents = 999999, reconciles = f
POST hourly_rate_cents=500000              → 500000 / 500000, reconciles = t  (the HT-1 hole, W1's)
```

So the view can print "rate $0.00 · $9,999.99" on a row an authenticated member wrote, and the
composer will bill it. This is W1's hole to close, not W0's — but W0 asserts the property as already
achieved and its sweep cannot see the counter-example (no fixture sets `rated_amount_cents` without
`hourly_rate_cents`).
**Fix (cheap, either):** (a) add case **(e)** to `time_unbilled_view_repair_test.sql` with exactly the
fixture above, asserting today's non-reconciling shape and naming `00600` as what closes it — so the
sweep's claim is bounded by an assertion rather than by prose; or (b) soften `00596`'s `COMMENT` to
*"one rate source for every row the server wrote; caller-supplied snapshots are rejected from `00600`
(HT-1)"* and add the fixture to W1's `time_rate_resolution_test.sql` list in plan §2.

**r3-m3 · `00597`'s seat confers read through 14 `is_project_team_member`-keyed policies; twelve are
already covered by studio-co-member policies, but the two SMS ones reach outside the studio
boundary.** *Confidence: high on the policy shapes (measured), medium on practical reachability.*
Location: `00597_time_entry_auto_roster.sql:18-44` (the banner's security argument), `:124-130` (the
gate).

The banner argues the seat "never MANUFACTURES authorization" because the gate is *"the same studio
co-membership `time_entries_studio_insert_own` already requires"*, and names exactly one consequence:
`Team can view their project time entries`. I enumerated the real surface — `pg_policies` rows whose
`qual`/`with_check` mention `is_project_team_member`: **14**, on `margin_notes`, `storage.objects`
(×2), `project_documents`, `project_parties`, `project_tasks`, `project_team_members`, `projects`,
`project_time_entries` (×4), `sms_conversations`, `sms_messages`.

Twelve are a no-op for anyone this trigger can seat: each of those tables already carries a
`*_studio_*` policy keyed on `is_studio_comember(projects.designer_id)` — the identical predicate the
gate uses (verified per table, including the two storage policies, which carry the studio leg inline).
The residual two do not reduce:

```
sms_conversations_team_select  … OR EXISTS (project_parties pp JOIN projects p2
    WHERE pp.phone_e164 = sms_conversations.phone_e164 AND is_project_team_member(pp.project_id))
sms_messages_team_select       … the same phone_e164 join
sms_conversations_studio_select / sms_messages_studio_select
    … keyed on the conversation's/message's OWN project being a studio project
```

A seat on project P therefore grants read of **any** SMS conversation (and its messages) whose
`phone_e164` appears in P's `project_parties` — including a conversation active on a project in a
different studio, which the studio policies do not reach. The realistic subject is a trade or vendor
phone number shared across studios. Before `00597` a studio colleague could only get that seat from
the project owner (`Lead designers manage team members`); HT-25 removes the consent step, so the
consent that used to gate this read is gone.

No code change is required if Kody rules the seat's breadth acceptable — HT-25 is ruled, and
plan §12 row 17 already flags "every `is_project_team_member` check" at medium. What is missing is
that the breadth is **named and bounded** rather than asserted away.
**Fix:** (1) replace `00597`'s "gated on the same studio co-membership" paragraph with the
enumeration — *14 policies; 12 already covered by the matching `is_studio_comember` policy; the two
SMS policies' `phone_e164` join is the residual and is not studio-bounded*; (2) record it as owed
sub-ruling **HT-25-b** in `rulings.md` beside HT-25-a (does an auto-seat carry the project's client
SMS thread, and threads reachable through a shared phone number); (3) optionally add a case (j) to
`time_entry_auto_roster_test.sql` pinning whichever answer is ruled.

**r3-m4 · `plan-v2.md` §1 still carries the "rolls the transaction back" claim that round 2's m5
removed from every other artifact.** *Confidence: high.*
Location: `plan-v2.md` §1, the bullet under the `claim_time_entries` signature: *"Partial match is
detected **by the caller counting returned ids** and rolling the transaction back — never by a
compensating UPDATE."*
`00595`'s banner, its `COMMENT`, and `invoice-composer.tsx`'s docblock were all corrected (there is no
transaction to roll back; the compensation is the draft delete plus the `ON DELETE SET NULL` FK). The
plan is the document later waves read, and it still says the false thing.
**Fix:** reword that bullet to match `00595:11-21` — *"…and the caller deletes the draft it just
created, which releases the partial stamp through `fk_time_entries_invoice`'s `ON DELETE SET NULL`;
there is no transaction to roll back and deliberately no compensating UPDATE."*

**r3-m5 · The stranded-draft error names a raw UUID the designer cannot act on.** *Confidence: high.*
Location: `apps/designer-portal/src/components/document/accounts/invoice-composer.tsx:417-418` —
`` `${reason} The draft ${invoice.id} still holds those hours — void it to release them.` ``
`invoices.invoice_number` exists (`information_schema.columns`) and `invoice` is the created draft row,
so the message can name the number the designer actually sees in the invoice list. A uuid in
designer-facing copy is both un-actionable and off-voice.
**Fix:** `` const label = invoice.invoice_number ?? invoice.id; `` then *"The draft invoice
{label} still holds those hours — void it to release them."* (Also consider a leading space/period
guard: `reason` is the hook's own sentence today, but a raw PostgREST message may not end in
punctuation.)

### NOTES

**r3-n1 · `claim_time_entries` retains `service_role` EXECUTE.** Live ACL is
`{postgres=X, authenticated=X, service_role=X}`. That is exactly what the plan prescribes (it revokes
only `PUBLIC, anon`), and Supabase's default privileges grant the rest at creation. Recorded so a
later reader of §0.16 does not mistake it for drift; nothing server-side calls it today.

**r3-n2 · `commercial`'s six expected failures are verifiably not W0's — confirmed analytically, not
just by replay.** I read the raise site myself: `_countersign_design_services_agreement_impl`'s
`'design services agreement % not found or access denied'` fires from a `proposals × organizations ×
organization_members` studio-membership `EXISTS`, with a second `project_commercial_documents ×
projects × organizations` block after it. W0 touches none of those relations. Independent of the
implementer's move-the-migrations-out replay.

**r3-n3 · `KNOWN_FAILURES.md` now absorbs `field/field_capture_note_routing_test.sql`.** The entry
names the root cause (`00584` added four `field_captures_studio_*` policies beside the five the
assertion was written against → 9) and defers the count bump to an FC-R8 ruling. Correct per the
repo's convention, but it is a documented-not-resolved RLS drift owned by nobody in this program.

**r3-n4 · `VISION-DECISIONS.md`'s footer lists `V10`, which is not in the file on this branch.**
Committed footer: `… · V9 · V10 · V11 · last id = V11`. Plan §9.2 prescribed a parenthetical
(*"(V10 is the people-room program's; reconcile order at merge)"*) which the committed line omits.
True only after the peer merges. Resolve at merge with n5's paragraph.

**r3-n5 · Commit history still misleads (carried from r2 n3).** `343252aaa` describes `00592–00594`
and says the view *"now LEFT JOINs profiles"* (the shipped file removes the join and asserts
`NOT LIKE '%JOIN profiles%'`); `ef8fe776f` announces `V10`/`R151`; `f0f97145b` carries six migrations
(three duplicates) until `de4b18553` removes the old three, so the series is not bisectable. The tip
is correct throughout. **Either squash `343252aaa..de4b18553` or carry that paragraph in the merge
commit** — nothing in the branch enforces it, and the merge must also say which side moved
(hour tracking: `00592–00594 → 00595–00597`, `R151 → R152`, `V10 → V11`).

**r3-n6 · Dead exports survive (carried from r2 n8).** `TimeEntryFilters` and `timeKeys.timeEntries`'
`filters` arm lost their only consumer with `useTimeEntries`. Harmless; drop with the next edit to the
module in W1/W2.

**r3-n7 · `authority-hours.ts` re-declares a type it already re-exports.** `timeBillingStateLabel`
now takes a module-local `BillingStateEntry` that is field-for-field `InvoiceEligibleTimeEntry`, which
the same file re-exports from `@patina/supabase`. One `import type { InvoiceEligibleTimeEntry }` would
remove the duplicate. Cosmetic.

**r3-n8 · A fresh worktree needs the dist-resolved packages built before portal gates mean anything.**
`pnpm --filter @patina/client-portal type-check` failed with nine `@patina/aesthete-quiz`
module-resolution errors and was clean after `npx turbo build --filter=@patina/aesthete-quiz`; the
implementer hit the same class on `admin-portal build` with `@patina/design-system`. Put a one-time
`npx turbo build --filter=@patina/design-system --filter=@patina/api-client --filter=@patina/help-system
--filter=@patina/aesthete-quiz` step in every later wave's brief, and note that `pnpm … turbo` fails
with `EACCES` in a worktree — use `npx turbo`.

**r3-n9 · Three items gate the single ship, none of them a lane's to close.** **HT-6-a** (the legacy
rate-less write-down — 1 Strata row, $175, a test project; rule it before `00596` is pushed),
**HT-25-a** (both halves of the re-seat), and the **V11 §6 bullet** owed to Kody because
`docs/vision/VISION.md` is untracked. **r3-m3** proposes **HT-25-b** as a fourth.

**r3-n10 · Runner mechanics, re-confirmed this round.** Invoke `run-sql-tests.sh` from the **worktree's
own copy** with `-k supabase/tests/KNOWN_FAILURES.md`, or every documented failure reads "unexpected"
(the script derives paths from its own location — I reproduced both outputs). Run it with the Bash
sandbox **off**: macOS `mktemp -d` resolves `_CS_DARWIN_USER_TEMP_DIR` and the script reports
`no .sql files found`. Same for `supabase …` and `git fetch`.

**r3-n11 · What I did not verify.** No `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` browser render
pass (the plan's W0 Done-when does not ask for one; the hook move is covered by two type-checks and
573 jest suites, but no surface was driven). Nothing was pushed or applied to Strata — all probes were
local; the Strata figures in HT-6-a are the implementer's read-only measurement, re-read but not
re-measured by me. The six `commercial` failures and the `field_captures` policy-count drift were
reproduced, not diagnosed to root cause. `pnpm lint` outside designer-portal is not trusted
(`patina-verification` Lint reality) and was not run. PostgREST's wire shape for
`RETURNS SETOF uuid` was taken from the generated `database.types.ts` (`Returns: string[]`) rather
than from an HTTP round-trip; the hook's `claimed.length` comparison is correct under either shape.
