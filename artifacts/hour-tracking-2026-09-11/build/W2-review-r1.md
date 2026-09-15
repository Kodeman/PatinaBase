# W2 — lane A (DB) adversarial review, round 1

**clean = false** — one blocker. (clean = zero blocker/major. Nothing else here rises above minor; two items are filed as "note — ruling owed" with the question stated, per the severity discipline in the brief.)

**Scope reviewed.** Commit `c71db49d9` (`origin/hour-tracking/integration..hour-tracking/server`, one commit), every line of `00604`–`00607`, the hook diff, the re-registered contract row, the regenerated seed and types, and `W2-impl.md`'s seven findings. Lane B (the scope lens, `hours-ledger.tsx`, the HT-35 band/opt-out, the Desk card, `desk-doorway.tsx`, the copy deck, the Sanity article, `hours-ledger-scope.test.tsx`, `e2e/document/hours.spec.ts`) is phase 2 and its absence is not counted.

---

## Gates re-run by the reviewer (not quoted from the implementer)

All on this program's isolated stack — API 54421, Postgres `127.0.0.1:54422`, `project_id "patina-hours"`. The shared 54321/54322 stack was never touched.

| Command | Result |
|---|---|
| `supabase db reset --workdir …/agent-server` | **clean** — `Finished supabase db reset on branch main.` All four migrations replayed, every `DO $postcondition$` block passed |
| `run-sql-tests.sh -d …/agent-server/supabase/tests/billing -H 127.0.0.1 -p 54422` | **7 green / 7**, 0 unexpected-fail (incl. `time_entry_ledger_test.sql`) |
| `run-sql-tests.sh -d …/agent-server/supabase/tests/commercial -H 127.0.0.1 -p 54422` | **10 green / 16**, 6 unexpected-fail — identical to W1's measured baseline (round 13, line 317); all six abort inside `_countersign_design_services_agreement_impl` ("design services agreement … not found or access denied"). Unchanged by W2 |
| `run-sql-tests.sh -d …/agent-server/supabase/tests/rls -f time_entry -H 127.0.0.1 -p 54422` | **2 green / 2** |
| `run-sql-tests.sh -d …/agent-server/supabase/tests/rls -f hours -H 127.0.0.1 -p 54422` | **2 green / 2** |
| `pnpm --dir …/agent-server --filter @patina/supabase type-check` | clean (`tsc --noEmit`, no output) |
| `pnpm --dir …/agent-server --filter @patina/designer-portal type-check` | clean |
| `pnpm --dir …/agent-server --filter @patina/admin-portal build` | succeeds (the repo's strictest gate) |

Run beyond the brief, because the narrowing is cross-cutting:

| Command | Result |
|---|---|
| whole `tests/rls` with `-k …/supabase/tests/KNOWN_FAILURES.md` | **27 green / 29**; the 2 reds are `design_requests_test.sql` and `studio_titles_test.sql`, both documented verbatim at `KNOWN_FAILURES.md:114-115` (the runner reads the per-dir allowlist, so `-k` at the tests root still prints them as unexpected) |
| whole `tests/field` | **5 green / 6**; the red is `field_capture_note_routing_test.sql`, documented at `KNOWN_FAILURES.md:113` |
| `tests/edge_api` | **3 green / 8**. `public_rpc_authorization_contract_test.sql` aborts at `:171` — see finding **m6** |
| `SUPABASE_DB_URL=…54422 pnpm --dir …/agent-server db:generate` then `git diff --exit-code packages/supabase/src/database.types.ts` | **CLEAN** after regeneration |
| `python3 …/agent-server/scripts/generate-legacy-grants.py` then `git diff --exit-code supabase/seed/00-legacy-grants.sql` | **CLEAN** after regeneration (baseline + 2621 replayed statements) |
| `grep -lE '^\s*(GRANT\|REVOKE)' supabase/migrations/0060*.sql` | `00600, 00601, 00602, 00603, 00604, 00605, 00607` — matches the impl report; `00606` carries none, and the seed does carry all nine new statements under their `00604/00605/00607` comments |
| commit hygiene (`git show --stat HEAD`, `git status --short`, `git ls-files -v | grep '^S'`) | 13 files, all intended; working tree clean; `supabase/config.toml` is skip-worktree'd and **not** in the commit |

## Program-rule sweep (each one checked, not assumed)

- no flag, no `useFeatureFlag`, no `ComingSoon` — `grep` over `0060[4-7]*.sql` returns nothing
- no backfill — no `UPDATE`/`INSERT` DML against `project_time_entries` in any of the four files
- the running-slot index is untouched — no `CREATE INDEX`/`DROP INDEX` anywhere in the four files
- the invoiced lock is untouched and **measured still holding against the new owner policy**: as the studio owner, `UPDATE … SET duration_minutes=999` on an invoiced row raises `guard_invoiced_time_entry():21`, and `DELETE` raises `:5`
- client-supplied rate: W2 adds no rate-writing path; the only new client-writable column is `updated_by` (finding **m1**)
- no RLS policy keyed on `projects.studio_id` — asserted by 00605 and 00606's own postconditions and confirmed in `pg_policy`
- DEFINER contract: `audit_time_entry_change()` REVOKEd from PUBLIC/anon/authenticated/service_role; `project_hours_total` and `project_pricing_studio_id` REVOKEd from PUBLIC/anon and GRANTed to authenticated; `studio_hours_rollup` is INVOKER as HT-38 requires; `anon` holds no privilege on `time_entry_ledger` (measured `has_table_privilege` = f). The one deviation is the **missing caller assert** on `project_pricing_studio_id` — finding **m2**
- §0.8 (both-places guard list): W2 adds no derived money column. `updated_by` is in neither list, which is the hole in **m1**
- 00484 registration contract: the quartet keeps all four names, commands, role sets, permissive flags and postgres ownership; the three write quals are byte-identical; the re-registered row in `public_rpc_authorization_contract_test.sql:533` is **character-for-character** the live qual (`((user_id = auth.uid()) AND is_project_team_member(project_id))`, verified against `pg_get_expr`). But see **m6** — the block never runs
- HT-3-a/b followed: verified independently of the implementer's test, on five project shapes (below)

### HT-3-a/b, measured independently

`public.project_pricing_studio_id` against a fresh fixture (designer D, five shapes), compared with what `00602`/`00603` stamped:

| project | designer's seats | `projects.studio_id` | `project_pricing_studio_id` |
|---|---|---|---|
| P1 | one employer (`member`) + one owned (`owner`) | a1 (stamped) | **a1** — employer tier wins |
| P2 | two employers (`member` + `admin`) | NULL | **NULL** — ambiguous tier is nothing |
| P3 | one owned only | a6 (stamped) | **a6** — owned tier |
| P4 | a `guest` seat, a seat in a `suspended` org, a seat in a `manufacturer` org | NULL | **NULL** |
| P5 | designer of P2 (ambiguous) but studio **named** a2 | a2 | **a2** — step 1 wins (HT-3-c arm (a)) |

The helper's tier filters (`organizations.type = 'design_studio'`, `organizations.status = 'active'`, `status='active'`, `role <> 'guest'`, `role <> 'owner'` / `= 'owner'`) are **byte-for-byte the same predicate** as `00599:327-363` and `00603:218-258`. The three bodies agree; the duplication the implementer flagged (their finding 2) is real but not a divergence today.

### The brief's named probes

| Probe | Result |
|---|---|
| a plain rostered member cannot SELECT a teammate's row / notes / `hourly_rate_cents` / `rate_source` | **holds** — measured: rostered plain member reads 1 of 2 rows; the teammate's `22500 / studio_member` and his notes are invisible; the ledger view returns only her own row |
| `project_hours_total` returns totals to a rostered member, denies a non-member | **holds** — the same member gets `minutes 90 / billable 90 / amount 22500` (the project's whole total, including the row she cannot read); a stranger gets `insufficient_privilege: project_hours_total: the caller is not on this project` |
| the rollup never returns notes, returns only what the caller may read | **holds** — no `note`-like name in either return type (postcondition + `pg_proc.proargnames`); a member aiming `p_user_id` at the owner gets **0** rows; unscoped she gets **only her own bucket**; a stranger gets 0 rows with no error; a sixth `p_group_by` raises `22023` |
| the audit trigger records admin adjusts and cannot be bypassed | **holds** — one row per edit with `action`, both value sets, `organization_id` = the pricing studio, `user_id` = the actor; `ALTER TABLE … DISABLE TRIGGER` as `authenticated` fails `must be owner of table project_time_entries`. Caveat in **m5** (it fires on far more than adjusts) |
| the owner/admin write policy cannot touch invoiced rows | **holds** for the eight frozen columns and for DELETE; `notes` remains writable by the existing lock's own design — note **n2** |
| the ledger view's `studio_id` follows HT-3-a/b | **holds** — table above |

---

## Findings

### B1 · BLOCKER · confidence HIGH (measured end to end)
**The new owner/admin predicate is self-grantable: one `organization_members` INSERT hands any authenticated org owner the studio-wide read AND the UPDATE/DELETE of an unrelated studio's hours — the exact capability HT-10/HT-10-a just removed.**

*Location:* `supabase/migrations/00605_time_entry_admin_write_and_trace.sql:155-193` (`time_entries_owner_admin_update`, `time_entries_owner_admin_delete`) and `supabase/migrations/00606_time_entries_studio_read_narrow.sql:92-105` (`time_entries_owner_admin_read`). The predicate is *the plan's own* (`plan-v2` §3 "RLS changes"), so this is a plan-level defect the implementer reproduced faithfully — not a deviation.

*The predicate:* `EXISTS (projects p JOIN organization_members om ON om.user_id = p.designer_id AND om.status='active' WHERE p.id = project_time_entries.project_id AND is_org_admin_or_owner(om.organization_id))` — "an owner/admin of **any** studio the project's designer actively belongs to". The attacker controls that set: she decides which studios the designer belongs to, because `organization_members` INSERT is governed by `Org owners can insert members` — `WITH CHECK (is_org_admin_or_owner(organization_id) AND role <> 'owner')`, **no consent gate, no `status` constraint, and `status` DEFAULT `'active'`** (verified in `pg_policy` and `\d organization_members`). Note that this insert policy is itself one of the 00484-registered rows in `public_rpc_authorization_contract_test.sql:525`, so tightening *it* is not available as a fix.

*Measured, on the isolated stack (fixture: victim designer V owns studio S_V, teammate T logs a 60-minute billable hour on V's project with `notes='TEAMMATE SECRET'` and a confidential `studio_member_rates` row of 22500; attacker A owns only her own unrelated studio S_A):*

```
-- before: A reads 0 rows of T's hour
-- A, as owner of her OWN org, runs exactly this:
INSERT INTO organization_members (user_id, organization_id, role)
  VALUES (V, S_A, 'member');                                       -- INSERT 0 1
-- immediately after, as A:
 id  | user_id |      notes      | hourly_rate_cents |  rate_source
 f1  | T       | TEAMMATE SECRET |             22500 | studio_member   ← the W1-R10-03 leak, reopened
 f2  | A       | ATTACKER OWN    |                   | none
DELETE FROM project_time_entries WHERE id = f1;                    -- DELETE 1
-- and the hour is gone: teammate_rows_left_as_postgres = 0
-- audit row written: time_entry.deleted | user_id = A | organization_id = S_V
```

A second, worse arm on the same seat: on any project whose `projects.studio_id` is NULL, the seat A writes becomes the designer's **single EMPLOYER-tier candidate**, so `project_pricing_studio_id` (and `resolve_time_rate_cents`, and `set_project_studio_id_owned`) resolve the pricing studio to **S_A** — an org whose `studio_member_rates` A authors as owner. 00599's banner already retracts HT-3-b's "a member can only push the outcome toward 'none'" claim and pins that arm in W1's cases (ad-i)/(ad-ii)/(af), so the *rate* half is W1 residue; the **read and DELETE half is new in W2 and pinned nowhere**. The leak also outlives a revert: the `audit_logs` row the attacker's own edit produces carries `old_values = to_jsonb(OLD)` — notes, rate and all — and `Users can view their audit logs` (`user_id = auth.uid()`) makes it permanently readable by her.

*Why blocker rather than note:* it contradicts **HT-10** in force ("Narrow to owner/admin. Members read own rows plus aggregates on rostered projects") — the narrowing is reversible at will by anyone who owns any organization, which is the ordinary state of every Patina designer — and on the NULL-studio arm it lets a member have her hours priced by a rate she set.

*Exact fix.* Key the three policies on the studio that **owns the work**, not on the designer's membership set, using the callable form 00604 just added:

```sql
-- in all three policies (USING, and the UPDATE policy's WITH CHECK):
USING (public.is_org_admin_or_owner(
         public.project_pricing_studio_id(project_time_entries.project_id)))
```

This is the same studio `00599`'s ASSERT 2 and `00601`'s refusal already key on (HT-3-a), so it **also dissolves W2-impl finding 5** — RLS and the resolver would stop disagreeing, and the "loud refusal from the resolver instead of a denial from RLS" case disappears. Two things must be said in the new migration's banner rather than discovered later: (i) `project_pricing_studio_id` reads `projects.studio_id` at step 1, so §0.13's prohibition must be read deliberately — §0.13 forbids the *column* as a key because a legacy NULL **widens** visibility, whereas here a NULL resolves to `is_org_admin_or_owner(NULL)` = false and therefore **fails closed**, the safe direction, and §0.13 already admits a policy key whose guard replicates `00317:31-47`'s anti-aiming assert; (ii) the trade this makes is that the owner of a legacy project with a NULL `studio_id` and an ambiguous designer tier loses her studio read until she stamps the project — which is exactly the repair HT-3-a step 3 already asks of her ("rate pending", fixed by naming the studio). If the orchestrator would rather not move the predicate in this wave, there is no smaller mechanical fix available: the schema carries no "the designer accepted this seat" fact to `AND` against, and requiring the *entry author* to share the attacker's org only raises the cost from one INSERT to two.

---

### m1 · MINOR · confidence HIGH (measured)
**`updated_by` is forgeable on INSERT, so HT-23's trace is attestable only for UPDATEs.**

*Location:* `00605:65-88` (`stamp_time_entry_updated_by`, `BEFORE UPDATE` only) and `00605:56-57` (the column is added but put in neither of the guard's two lists — §0.8's both-places rule).

*Measured:* as the author (a plain rostered member), `INSERT INTO project_time_entries (…, updated_by) VALUES (…, '<the studio owner's id>')` succeeds and the row reads `updated_by = <the owner>` on a row nobody has ever edited. The column's own comment ("NULL means no edit since 00605") is then false for that row, and a UI that prints "last touched by" names an innocent person.

*Fix:* add an INSERT arm to the stamp — `DROP TRIGGER …; CREATE TRIGGER zzz_stamp_time_entry_updated_by_trg BEFORE INSERT OR UPDATE …` with `IF TG_OP = 'INSERT' THEN NEW.updated_by := NULL; RETURN NEW; END IF;` before the existing body (a fresh row has had no edit) — **or** add `updated_by` to `00600`'s INSERT discard set in `guard_commercial_time_entry_derived_fields` and to its `BEFORE UPDATE OF` column list, which is the §0.8-shaped answer. A follow-up migration, not an edit to 00605 (it has applied on this branch).

### m2 · MINOR · confidence HIGH (measured)
**`project_pricing_studio_id` is a GRANTed SECURITY DEFINER function with no caller assert, and it answers for projects the caller cannot read.**

*Location:* `00604:84-161`; the deliberate choice is argued at `00604:49-54`.

*Measured:* as an authenticated user with no relationship of any kind to the project, `SELECT count(*) FROM projects WHERE id = <P>` returns **0** while `SELECT public.project_pricing_studio_id(<P>)` returns **the studio's uuid**. It is an org-graph disclosure ("which organization employs the designer of project X") gated only on guessing a uuid, and it is a §0.16 deviation (the 00484 contract asks for "a caller assert where it takes a user-supplied scope").

*The banner's reasoning is right and the fix preserves it:* a `RAISE` inside a `security_invoker` view predicate would abort the whole ledger read, so the assert must **return NULL, not raise**:

```sql
IF auth.uid() IS NOT NULL AND NOT (
     COALESCE(public.is_project_team_member(p_project_id), false)
     OR v_designer_id IS NOT DISTINCT FROM auth.uid()
     OR COALESCE(public.is_studio_comember(v_designer_id), false)
) THEN RETURN NULL; END IF;
```
placed after step 1's `SELECT … INTO v_designer_id, v_studio_id`. Every legitimate ledger caller satisfies one of those legs (they can only see the row through the team, designer, studio-co-member or owner/admin policies), so no live read loses a value; a stranger gets NULL instead of the answer. Pin it with a one-line case in `time_entry_ledger_test.sql`.

### m3 · MINOR · confidence HIGH (from the code; not demonstrable until W4)
**`internal_minutes`' `project_id IS NULL` leg is dead, and 00607's claim that "W4's project-less row needs no edit here" is false.**

*Location:* `00607:134-135` (the FILTER) against `00607:85` (`WHERE ledger.studio_id = p_studio_id`) and `00604:100-102` (`IF p_project_id IS NULL THEN RETURN NULL`). A project-less entry gets `studio_id = NULL` from the helper, and `NULL = p_studio_id` is never true, so the row is dropped by the scope filter **before** the FILTER can ever see it. (`project_time_entries.project_id` is still `NOT NULL` today — measured — which is precisely why this will be found in W4 rather than now.)

*Fix:* either delete the `OR keyed.project_id IS NULL` leg and the banner sentence now, so W4 inherits an honest TODO, or make the scope clause read the row's own studio once W4 adds the trigger-validated `project_time_entries.studio_id` column: `WHERE COALESCE(ledger.studio_id, ledger.entry_studio_id) = p_studio_id`.

### m4 · MINOR · confidence HIGH (measured plan)
**The studio scope is unindexable: the ledger's `studio_id` is a per-row plpgsql DEFINER call.**

*Location:* `00604:184` (`public.project_pricing_studio_id(te.project_id) AS studio_id`), consumed by `00607:85`.

*Measured:* `EXPLAIN (ANALYZE, COSTS OFF) SELECT count(*) FROM public.time_entry_ledger WHERE studio_id = '…'` →
```
Aggregate
  ->  Seq Scan on project_time_entries te
        Filter: (project_pricing_studio_id(project_id) = '…'::uuid)
```
No index can serve that filter, and each evaluated row runs up to three further queries inside the function. Every studio-scope sheet load and every `studio_hours_rollup` call is therefore O(all entries the caller can read) — on the one table this whole program exists to fill.

*Fix:* when W4 lands `project_time_entries.studio_id` (already planned, §0.13), have the ledger select the column and keep the function for the trigger that fills it. Until then, say the cost in 00604's banner and have lane B pass the `limit` the hook already accepts (`useTimeEntryLedger` sends none by default, `use-time-tracking.ts`).

### m5 · MINOR · confidence HIGH (from the trigger definition)
**The audit trigger fires on every UPDATE, not on adjusts — a timer stop and every claimed entry each write a full old/new JSON pair.**

*Location:* `00605:148-151` (`AFTER UPDATE OR DELETE … FOR EACH ROW`).

Stopping a timer is an UPDATE (`duration_minutes` set), `claim_time_entries` is an UPDATE per entry (so a 40-line invoice writes 40 audit rows), and each classifier re-rate is another. Each row carries `to_jsonb(OLD)` **and** `to_jsonb(NEW)` of the whole entry. HT-23 asks that edits leave a trace; as built, `audit_logs` becomes the busiest table in the product and the admin adjusts the ruling cares about are buried in machine writes.

*Fix (the shape, if the orchestrator wants it narrowed):* gate the insert — `IF TG_OP = 'DELETE' OR auth.uid() IS DISTINCT FROM OLD.user_id OR (OLD.duration_minutes, OLD.started_at, OLD.billable, OLD.notes) IS DISTINCT FROM (NEW.duration_minutes, NEW.started_at, NEW.billable, NEW.notes) THEN … END IF;`. Whether a member's own timer stop deserves an audit row is a ruling, so this is also listed under **r1** below.

### m6 · MINOR · confidence HIGH (measured)
**The 00484 re-registration 00606's banner leans on is never executed: the contract test aborts 362 lines above it, and `tests/edge_api` is in no wave's gate list.**

*Location:* `supabase/tests/edge_api/public_rpc_authorization_contract_test.sql:171` vs the edited VALUES block at `:533`.

*Measured:* `run-sql-tests.sh -d …/tests/edge_api` → `public_rpc_authorization_contract_test.sql` fails with `ERROR: 00511 must not auto-derive a studio for a non-designer lead` at `:171` — the W1 defect `W2-impl.md` finding 1 describes — so the policy-registration block at `:533` never runs. 00606's banner calls that block "the contract's LIVE-STATE home… so the narrowing remains a signed expectation rather than a silent drift"; today it is a comment in a file that is red before it gets there. I verified by hand that the registered string is byte-identical to the live qual, so the **content** is right; the **device** is inert. The file is also not in `supabase/tests/KNOWN_FAILURES.md`, so nothing distinguishes it from a fresh regression.

*Fix:* add `scripts/run-sql-tests.sh -d supabase/tests/edge_api -f public_rpc_authorization_contract` to W2's (and the program's) gate list, and either rule W1's `00603` question or list the file in `supabase/tests/KNOWN_FAILURES.md` with the line number and the owed ruling — otherwise the signed RPC/policy contract is unguarded for every remaining wave.

### m7 · MINOR · confidence HIGH
**An orphaned query key for the deleted hook survives in the portal.**

*Location:* `apps/designer-portal/src/lib/react-query.ts:309` — `studioReport: (period: string) => [...queryKeys.time.all, 'studio-report', period]`. `useStudioTimeReport` and `timeKeys.studioReport` are gone; this one is unreferenced dead code that will read as a live surface to the next hand. *Fix:* delete the line (one-line follow-commit, designer-portal `type-check` is the gate).

### n1 · NOTE · confidence HIGH
**00604's second profiles postcondition can never fail.** `00604:256-257` — `ASSERT v_flat NOT LIKE '% join profiles%' OR v_flat LIKE '%left join profiles%'`. With `LEFT JOIN public.profiles` in the viewdef the first disjunct is true; with `LEFT JOIN profiles` the second is. It also passes if an INNER `JOIN profiles` were added beside a LEFT one. It is a no-op beside the real assert above it. *Fix:* count the joins instead — `ASSERT (SELECT count(*) FROM regexp_matches(v_flat,'join (public\.)?profiles','g')) = 1` alongside the existing LEFT assert.

### n2 · NOTE — ruling owed · confidence HIGH (measured)
**An owner/admin may now rewrite the `notes` of an **invoiced** entry.** Measured: as the studio owner, `UPDATE project_time_entries SET notes='owner rewrote an invoiced note'` on an invoiced row **succeeds** and is audited; the frozen eight and DELETE both still raise. That is `guard_invoiced_time_entry`'s own design (its message says "only notes (and detaching the invoice) may change") and W2 weakens nothing — but W2 is the wave that hands the owner the keys, so the behaviour is new in practice. *Question for Kody:* once an hour is invoiced, is its narrative frozen too, or is an owner's correction of a note the point? No code change until ruled; §0.12 forbids touching the lock on a guess.

### n3 · NOTE — ruling owed · confidence HIGH
**An audit row with `organization_id = NULL` is readable only by the actor.** `00605:117` stamps the pricing studio, and `Org admins can view org audit logs` requires `organization_id IS NOT NULL`; the only other policy is `Users can view their audit logs` (`user_id = auth.uid()`). So on a "rate pending" project (no pricing studio yet — HT-3-a step 3), the owner cannot see the trace of an edit made on it, while the editor can. *Question:* should the trace fall back to a second organization leg (e.g. the designer's single employer seat) when no studio prices the work, or is an untraceable-to-the-owner edit acceptable on an unstamped project? (Related, same file: for a multi-studio designer the acting admin's own studio may differ from the stamped one — `W2-impl.md` finding 5 — which **B1's** fix also resolves.)

### n4 · NOTE · confidence HIGH
**`resolved_rate_cents` coalesces a missing rate to `0`, which is what a genuine zero looks like.** `00604:204`. HT-26 wants "rate pending", never a blank — and never, presumably, a confident `$0.00`. `rate_source` is on the view, so lane B *can* distinguish, but the honest shape is `te.hourly_rate_cents` left NULL with the `COALESCE` moved into the money expression only. Either keep the 0 and say in the view's COMMENT that `rate_source` is the only honest test, or drop the COALESCE. Worth settling before lane B renders the column in phase 2.

### n5 · NOTE · confidence HIGH
**Two documented deviations from plan-v2 §3's letter, both ruling-covered; stated so the policy count is not a surprise.** §3 said 00606 would `DROP time_entries_studio_read` and leave `Team can view their project time entries` **untouched**. The shipped file narrows **both** (HT-10-a, a later ruling, explicitly requires narrowing the 00484-registered read — and plan §0.17 itself anticipates it as "a real narrowing, not a tidy") and keeps `time_entries_studio_read`'s **name** with an own-row leg rather than dropping it. Result: `project_time_entries` now carries **three** SELECT policies, not two — own-rows-if-rostered, own-rows-if-studio-co-member, and owner/admin. The middle one is slightly wider than §3's plan (own rows on a co-member's project where she is not rostered) and still inside HT-10's "members read own rows". No action; recorded because the revert story is now "two statements, one name each", not one.

### n6 · NOTE · confidence HIGH
**Hook types are narrower than the view.** `TimeEntryLedgerRow.project_id: string` and `user_id: string` are non-nullable while the view will emit a NULL `project_id` the moment W4 lands project-less internal time (the type is hand-written, not generated). One-line fix now (`project_id: string | null`) costs nothing and saves a W4 type break.

---

## What I did not verify

- **Lane B, entirely** — no scope lens, no `hours-ledger.tsx` change, no HT-35 band or opt-out, no Desk card, no `desk-doorway.tsx`, no copy deck, no Sanity article, no `hours-ledger-scope.test.tsx`, no `e2e/document/hours.spec.ts`. By scope (phase 2), not a finding.
- `pnpm --filter @patina/designer-portal test`, `… lint`, and the `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` e2e line from plan §3's gate list — outside my brief's gate list and all three are lane-B-shaped. I did confirm by grep that nothing outside the deleted hook references `useStudioTimeReport`/`StudioTimeReport`/`StudioProjectRollup`/`StudioTimeEntry`, and that `isInvoiceEligibleTimeEntry`, `studioPeriodStartISO` and `StudioPeriod` all still have live callers.
- No prod anything. Nothing was pushed to Strata; I ran only against 54422. (And W1's own constraint stands: W1 must not reach Strata ahead of 00606.)
- `W2-impl.md` finding 1 (W1's `00602`/`00603` stamping a studio for a non-designer lead) I **reproduced** as a red contract test but did not diagnose — it is W1's file and W1's ruling, and I agree it is not W2's work. It is, however, why **m6** matters.
- Concurrency: I did not test two simultaneous admin adjusts, nor the audit trigger under `claim_time_entries` at scale (m5 is reasoned from the trigger definition and the shipped RPC, not measured at volume).
