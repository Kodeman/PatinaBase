# W1 — adversarial review, round 1

**clean = false** (3 blockers, 3 majors)

Reviewer context: separate from the implementer. Diff under review
`git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-server diff origin/hour-tracking/integration...hour-tracking/server`
= commits `b39ba9ec2` (migrations 00598–00601) · `d048bad36` (hooks) · `906b94ab6` (tests).
All gates were re-run by me from the worktree against the program's own isolated stack
(`127.0.0.1:54422`). Every finding below is measured, not inferred; probe transcripts are quoted.

---

## 1 · Gates I ran (verbatim results)

| Gate | Result |
|---|---|
| `supabase db reset --workdir .../agent-server` | **clean**, applied `00595 → 00596 → 00597 → 00598 → 00599 → 00600 → 00601 → 20260910152111`, all 26 seeds, `Finished supabase db reset` |
| `run-sql-tests.sh -d .../tests/billing -H 127.0.0.1 -p 54422` | **6 / 6 green** (incl. `time_rate_resolution_test.sql`, `time_unbilled_view_repair_test.sql`, `time_claim_atomicity_test.sql`) |
| `run-sql-tests.sh -d .../tests/commercial` | **10 green / 6 unexpected-fail**, identical set to W0's baseline; all six are documented in `supabase/tests/KNOWN_FAILURES.md` (verified by grep, 1–3 hits each) and all six abort inside `_countersign_design_services_agreement_impl` — **pre-existing, not this wave** |
| `run-sql-tests.sh -d .../tests/rls -f time_entry` | **1 / 1 green** |
| `run-sql-tests.sh -d .../tests/billing -f rate` | **1 / 1 green** |
| `run-sql-tests.sh -d .../tests/rls -f studio_member_rates` | **1 / 1 green** |
| `pnpm --filter @patina/supabase type-check` | clean (no output) |
| `pnpm --filter @patina/designer-portal type-check` | clean (no output) |
| `pnpm --filter @patina/designer-portal test` (full) | **573 suites / 7260 tests passed** |
| `pnpm --filter @patina/designer-portal test -- use-time-tracking-authority` | 3/3 passed |
| `pnpm --filter @patina/supabase test -- use-studio-member-rates` | 7/7 passed |
| `pnpm --filter @patina/designer-portal lint` | `✖ 201 problems (0 errors, 201 warnings)` — matches the report |
| `pnpm --filter @patina/admin-portal build` | **exit 0** (the repo's strict type gate) |
| generated files: `generate-legacy-grants.py` + `SUPABASE_DB_URL=…54422 db:generate`, then `git status --short` | **empty** — both generated artefacts are in sync and committed |
| commit hygiene (`git show --stat` ×3) | files match messages; no stray paths; `supabase/config.toml` absent from all three commits and still `S` (skip-worktree) |

Plan-item conformance (refutation attempt, §2 lane A): `00598` table/trigger/3 policies with the exact
names `studio_member_rates_read_self_or_admin` / `_admin_insert` / `_admin_update`, no DELETE policy
— ✓. `00599` signature `(p_project_id uuid, p_user_id uuid, p_at timestamptz, p_rate_role text DEFAULT NULL)
RETURNS TABLE (cents integer, source text, role text)`, DEFINER, pinned search_path, REVOKE PUBLIC/anon +
GRANT authenticated — ✓ (probed: `anon_exec=f authd_exec=t`). `00600` both columns with the exact CHECK
sets, guard grafted faithfully from `00412:2344-2384` (diffed line by line), `rate_source`+`rate_role` in
**both** the `IS DISTINCT FROM` chain **and** the `BEFORE UPDATE OF` list, `rate_role` added to `aac_`'s
list, one BEFORE INSERT trigger under 00412's name (n9 respected) — ✓. `00601` grafted verbatim from
`00578:2599-2820` (diffed; all three raises, the `FOR UPDATE` lock and 00575's F-2 delta byte-identical) —
✓. `00602`/`00603` absent by design — ✓. No flag, no backfill DML (the only `UPDATE` in the four files is
inside the 00598 trigger body), `uniq_project_time_entries_running_timer` untouched, `guard_invoiced_time_entry`
still installed and still BEFORE (probed; and a `billable` flip on an invoiced row raises
`…only notes (and detaching the invoice) may change`), the 00484 "Team can …" quartet intact and
unre-qualified, no policy keyed on `projects.studio_id`, no rollup and therefore no `notes` in one.
00484 registers none of the three triggers 00600 drops/re-creates (grepped).

---

## 2 · Findings

### W1-R1-01 · BLOCKER · confidence high
**`resolve_time_rate_cents` discloses any project's signed hourly rate cards to any authenticated user.**
`supabase/migrations/00599_resolve_time_rate_cents.sql:88-149`

The caller assert only refuses when `p_user_id IS DISTINCT FROM auth.uid()`. It never asks whether the
caller has **any** relationship to `p_project_id`, and `p_rate_role` is taken from the caller verbatim
(the banner at `:22-23` says it is "already validated by the caller" — but nothing validates a direct
RPC call; only `00601`'s delta 1 validates, and that is the trigger path). The function is DEFINER and
`GRANT EXECUTE … TO authenticated`, so tier 1 runs for a complete stranger.

Measured (fresh user with no profile link to the project, `supabase/tests/billing/time_rate_resolution_test.sql`
fixtures):
```
PROBE4 stranger direct reads: authority_rate_cards=0 time_entries=0
PROBE4 resolver as a total stranger, p_rate_role=lead_designer -> cents=25000 source=authority role=lead_designer
PROBE4 same, p_rate_role=vendor -> cents=9000 source=authority
```
`project_billing_authority_rates` is otherwise gated to studio co-members (`billing_authority_rates_studio_read`)
and the client (`billing_authority_rates_client_read`) — this hands the signed rate card to anyone with a
project uuid, one roster-role name at a time. Violates §0.16 ("a caller assert **where it takes a
user-supplied scope**") and the spirit of HT-10-a.

**Fix.** Add a relationship assert before tier 1 and validate the role inside the resolver, e.g. after the
studio resolution:
```sql
IF auth.uid() IS NOT NULL
   AND NOT (
     public.is_project_team_member(p_project_id)
     OR v_designer_id IS NOT DISTINCT FROM auth.uid()
     OR public.is_studio_comember(v_designer_id)
     OR COALESCE(public.is_org_admin_or_owner(v_studio_id), false)
   )
THEN RAISE EXCEPTION '…' USING ERRCODE = 'insufficient_privilege';
END IF;
```
and reject a `p_rate_role` the **caller** does not hold (same EXISTS the classifier uses at
`00601:102-123`) rather than trusting it. Add a case to
`supabase/tests/billing/time_rate_resolution_test.sql` asserting a stranger's direct RPC call raises, and
one asserting an unheld `p_rate_role` raises at the RPC boundary too.

---

### W1-R1-02 · BLOCKER · confidence high
**A `billable` off→on toggle permanently re-prices an authority-bound hour at the studio rate, while
`rate_source` still reads `'authority'`.**
`supabase/migrations/00601_classifier_rate_resolver.sql:155-161` (the `NOT NEW.billable` branch), with
`:278-293` vs `00599:119-149` as the divergence mechanism.

`00578`'s non-billable branch never touched `hourly_rate_cents`. `00601` adds
`NEW.hourly_rate_cents := v_rate_cents; NEW.rate_source := v_rate_source;` **before** the bound-row
handling at `:190-204`, so a bound row's rate is replaced by the resolver's answer. `billable` is not in
`aab_`'s watched list, so the derived-field guard cannot catch it, and the classifier's own immutability
raise at `:84-91` cannot either (the classifier is doing the write). On the way back to billable the
`v_is_bound` arm reads `OLD.hourly_rate_cents` — which is now the overwritten value — so the loss is
permanent.

The divergence is not exotic: the classifier has a **single-card fallback** (`:278-293`) that binds an
hour to the only card on the authority when the roster role matches no card name; `resolve_time_rate_cents`
has no such fallback (tier 1 requires `v_match_count = 1` on a role-name match), so for every such entry
the two disagree. `00599`'s banner at `:120-121` claims "the resolver and the classifier cannot disagree
about which card a role matches" — they can, and do.

Measured on a one-card design-services authority (`Principal` 30000) with the member auto-rostered as
`support_designer`, and `UpdateTimeEntryInput.updates` (`packages/supabase/src/hooks/use-time-tracking.ts:400`)
already exposing `billable` to the shipped UI:
```
PROBE7 bound via the single-card fallback: rate=30000 src=authority amt=30000 bound=t role=support_designer
PROBE7 after a billable off/on round trip: raised=f rate=15000 src=authority amt=15000
        (signed card 30000 -> 1h should stay 30000)
```
A studio under-bills a signed $300/h hour at $150/h, the row then claims `rate_source='authority'`, and
`claim_time_entries` will invoice-lock it at the wrong number. Same mechanism reproduces with a second
rate version:
```
PROBE2 before flip: rate=9000 src=authority amt=9000
PROBE2 after billable=false: rate=20000 src=authority amt=0
PROBE2 after billable=true again: rate=20000 src=authority amt=20000   (bound card was 9000)
```

**Fix.** In the `NOT NEW.billable` branch, never overwrite a bound row:
```sql
IF TG_OP = 'INSERT' OR OLD.billing_authority_id IS NULL THEN
  NEW.hourly_rate_cents := v_rate_cents;
  NEW.rate_source       := v_rate_source;
ELSE
  NEW.hourly_rate_cents := OLD.hourly_rate_cents;
  NEW.rate_source       := OLD.rate_source;
END IF;
```
Then pin it: a new case in `time_rate_resolution_test.sql` that binds an hour through the single-card
fallback, round-trips `billable`, and asserts rate, amount **and** `rate_source` are unchanged. Separately
decide whether the resolver should replicate the single-card fallback (see W1-R1-07) — but the branch fix
is what stops the money loss.

---

### W1-R1-03 · BLOCKER · confidence high
**`rate_role` is re-validated on every UPDATE, not only when it changes, so an ordinary roster change makes
an un-invoiced entry permanently un-editable.**
`supabase/migrations/00601_classifier_rate_resolver.sql:102-123`

Delta 1 validates `NEW.rate_role` whenever the `aac_` trigger fires, including a plain duration
correction where `NEW.rate_role = OLD.rate_role`. Once the owner removes the roster seat the recorded role
came from, every guarded edit raises — and `rate_role` itself cannot be changed either, because `aab_`'s
chain (`00600:147`) refuses it for any non-`postgres` caller. The row is frozen with no escape but DELETE.
HT-25-a's cross-role re-seat (00597 re-seats as `support_designer` beside a removed `vendor` tombstone)
makes exactly this role churn the expected case, and a project-designer handover does the same to
`rate_role='lead_designer'` rows.

Measured:
```
PROBE1 seeded: rate=9000 src=authority role=vendor auth=t
  (owner then sets removed_at on the member's 'vendor' roster row)
PROBE1 RESULT: duration edit raised=t msg=rate_role vendor is not a role this member holds on the project
PROBE1 stored duration now = 60          -- the correction was refused
```

**Fix.** Validate only a *new* pick:
```sql
IF NEW.rate_role IS NOT NULL
   AND (TG_OP = 'INSERT' OR NEW.rate_role IS DISTINCT FROM OLD.rate_role)
THEN … END IF;
```
Add a case asserting that after the seat is removed the member can still correct her own un-invoiced
entry's duration, and that the recorded `rate_role` survives the edit.

---

### W1-R1-04 · MAJOR · confidence high
**The wave's headline repair — "the stranded no-rate row becomes promotable by a later signed addendum" —
is not delivered, and the Done-when is unmet.**
`supabase/migrations/00601_classifier_rate_resolver.sql:296-309`; promotion filter
`supabase/migrations/00577_agreement_fee_schedules.sql:2487-2496`

Plan §2 and Done-when #4 rest on the premise that the promotion filter "requires both non-NULL" (rate and
amount) and that stamping the studio rate is therefore enough. Every promotion loop in the lineage
(`00412:1138`, `00414:913`, `00475:892`, `00511:4596`, `00566:843`, `00575:1845`, `00578:6610`) additionally
**JOINs on `entry.billing_authority_id`** and requires `entry.authority_rate_id IS NOT NULL`. `00601:297-298`
sets both to NULL on exactly the branch it claims to repair.

Measured against the real predicate:
```
PROBE5 repaired no-rate row: rate=15000 amount=30000 state=pending_authorization src=studio_member
                             billing_authority_id=NULL authority_rate_id=NULL
PROBE5 rows the addendum promotion loop would pick up = 0   (plan Done-when expects 1)
```
Test case (c) asserts the rate and the state but never the promotability, so the suite is green on a claim
that is false.

**Fix.** Either (a) decide that the repaired row is promoted by a different mechanism and add it — a
promotion arm for unbound `pending_authorization` rows whose `rate_source = 'studio_member'` — or (b)
amend the plan's Done-when and `00601`'s banner (delta 2, third bullet) to say the row keeps its money and
prints honestly but is **not** promotable, and record it as an owed ruling beside HT-6-a. Either way add an
assert to `time_rate_resolution_test.sql` case (c) that states the promotability outcome explicitly so it
stops being an unverified sentence.

---

### W1-R1-05 · MAJOR · confidence high
**The resolver's caller assert silently revokes a policy-granted capability: a project designer who is a
plain org member can no longer edit a teammate's time entry.**
`supabase/migrations/00599_resolve_time_rate_cents.sql:88-94`

`Designers manage their project time entries` is an `ALL` policy qualified only on
`projects.designer_id = auth.uid()` with no `user_id` leg (confirmed in `pg_policies`), so before W1 a
project designer could correct a teammate's row. `00601` now calls the resolver on every fire with
`p_user_id = NEW.user_id`, and the assert refuses anyone who is not the author and not
`is_org_admin_or_owner` of the resolved studio — aborting the UPDATE.

Measured (project designer is an org `member`, the entry is the hire's):
```
PROBE3 seeded: rate=15000 src=studio_member
PROBE3 RESULT: raised=t msg=resolve_time_rate_cents: only a studio owner or admin may resolve another
               member's rate   stored duration=60
```
This is arguably a hardening, but it is undeclared, unruled, untested, and it lands in the wave whose
plan note **m1** explicitly flagged this policy shape without asking for it to be closed. It also means
the W2 owner/admin adjust path (HT-22) will be the *only* way to touch a teammate's row — fine for an
owner, a regression for a member-level project designer.

**Fix.** Either admit the designer leg in the assert
(`OR EXISTS (SELECT 1 FROM projects WHERE id = p_project_id AND designer_id = auth.uid())`) and say so in
the banner, or keep the narrowing and record it as an owed sub-ruling under HT-1 with a test case that
pins the refusal deliberately. Silence is the thing to fix.

---

### W1-R1-06 · MAJOR · confidence high
**`close_prior_studio_member_rate` leaves overlapping history bands whenever a rate is backdated between
two existing rows, and test case (g) does not catch it.**
`supabase/migrations/00598_studio_member_rates.sql:62-86`; test
`supabase/tests/rls/studio_member_rates_test.sql:307-323`

The first `UPDATE` closes only rows that are still **open** (`r.effective_to IS NULL`). A backdated row
landing inside an already-closed row's span never re-closes it, so two rows cover the same dates. HT-3
rules the history "dated, append-only"; the shipped ladder produces a self-contradictory one, which lane B's
"dated history rows beneath each field" will render as two overlapping bands.

Measured (A from day−30, B from day−10, then a backdated C from day−20):
```
 hourly_rate_cents | from_off | to_off
             10000 |      -30 |    -11
             15000 |      -20 |    -11
             20000 |      -10 |
 rows_covering_day_minus_15 = 2
```
Case (g)'s backdated arm only ever backdates *before* the earliest row, so it asserts
`effective_to = CURRENT_DATE - 1` and passes while the overlap exists. The partial unique index still
holds (one open row) and the resolver is deterministic (`ORDER BY effective_from DESC`), so this is
history integrity rather than immediate money — but it is a new table's core invariant.

**Fix.** Close every row whose span contains the new start, open or not:
```sql
UPDATE public.studio_member_rates r
   SET effective_to = NEW.effective_from - 1
 WHERE r.studio_id = NEW.studio_id AND r.user_id = NEW.user_id
   AND r.effective_from < NEW.effective_from
   AND (r.effective_to IS NULL OR r.effective_to >= NEW.effective_from);
```
and extend case (g) with the three-row interleave above, asserting exactly one row covers any date in the
span.

---

### W1-R1-07 · MINOR · confidence high
**The resolver and the classifier disagree about "the authority rate", contradicting `00599`'s own banner.**
`00599:119-149` vs `00601:278-293`

The classifier falls back to the authority's single card when no role name matches; the resolver does not.
`00599:120-121` claims they "cannot disagree". They can; it is the mechanism behind W1-R1-02 and it also
means `resolve_time_rate_cents` (a `GRANT`ed RPC lane B will call to preview a rate) will report
`studio_member` for an hour the classifier will bind at the card rate.

**Fix.** After the role-match attempt in tier 1, add the same `v_current_rate_count = 1` single-card
fallback, or delete the banner's claim and state the asymmetry. Pin whichever is chosen with a case that
compares the resolver's answer to the stored row on a one-card authority.

---

### W1-R1-08 · MINOR · confidence high
**"History is a fact" is enforced only against DELETE; owner/admin may rewrite any historical row in place.**
`00598:111-115`

`studio_member_rates_admin_update` has no column restriction and no `effective_to IS NULL` predicate, so an
owner can change `hourly_rate_cents`, `effective_from` or `effective_to` on a closed row. The hook only
upserts today's row, so this is latent, not live. **Fix:** narrow the UPDATE policy's `USING` to the open
row (`effective_to IS NULL`), or add a `BEFORE UPDATE` guard freezing `hourly_rate_cents`/`effective_from`
on closed rows; assert it per role.

### W1-R1-09 · MINOR · confidence high
**A rate row can be created for a user who is not a member of the studio.** `00598:107-109` — the INSERT
policy checks `is_org_admin_or_owner(studio_id)` and `created_by = auth.uid()` but never that `user_id`
belongs to `studio_id`. **Fix:** add an `EXISTS` on `organization_members` (active, non-guest) to the
`WITH CHECK`, or a trigger assert; add a case.

### W1-R1-10 · MINOR · confidence high
**Two comments in `00600` contradict each other about `rate_role`'s mutability.** `00600:99-101` says
"immutable afterwards"; `00600:176-178` says "a member changing their role pick must re-price the hour".
`aab_` raises first for every non-`postgres` caller, so only `postgres` can change it. **Fix:** delete or
correct the `aac_` comment; it is the premise W1-R1-03 was built on.

### W1-R1-11 · MINOR · confidence high
**`p_at::date` casts in the session time zone inside a DEFINER function.** `00599:157-158`. A rate boundary
can land on the wrong day for a member whose `started_at` is near midnight UTC. **Fix:** decide the
anchor explicitly (`(p_at AT TIME ZONE 'UTC')::date`, or the studio's zone) and say so in the banner.

### W1-R1-12 · NOTE
§0.7(c) is implemented as 2 refusals (`rate_source`, `rated_amount_cents`) + 2 discards
(`hourly_rate_cents`, `billing_state`). The reasoning in `W1-impl.md` §5.2 and `00600`'s banner is sound
and the wave's own Done-when requires the `99999` insert to succeed — but the plan's literal text is not
met, so it needs an explicit nod rather than an inferred one.

### W1-R1-13 · NOTE
HT-41's ruled text says the entry "records the role in **rate_source**"; shipped as a separate `rate_role`
column (the pair). Banner-documented as an architect choice; flagging so the ruling sheet can be amended
rather than left contradicting the schema.

### W1-R1-14 · NOTE
**W1 is half a wave.** Lane B's items are absent from the diff: `account-studio-page.tsx` "Studio rates"
section, `studio-rate-rows.tsx`, the `hours-ledger.tsx` rate/rate-source column and "rate pending",
`authority-hours.ts` `timeRateProvenance`, the `pending-time-authorization-band.tsx` doorway, and the
`authority-hours.test.ts` extension. Consequently Done-when #3 ("a rate typed on `/desk?account=studio`
appears on the next entry's row") and HT-26's rendering are unverifiable at this commit. Correct for a
lane-A brief; not a passable W1.

### W1-R1-15 · NOTE
**The existing commercial suite cannot reach the path this wave rewrote.** All six red files abort in
`_countersign_design_services_agreement_impl` before any authority-rate assert, so "commercial green
unchanged" is true but is not coverage of `00601`. The classifier rewrite's only real coverage is the new
9-case billing file — which is exactly why W1-R1-02 and W1-R1-04 went green.

### W1-R1-16 · NOTE
W0's `time_unbilled_view_repair_test.sql` case (b) now writes its fixture with
`aac_classify_project_time_entry_authority_trg` **disabled**. The reasoning (a pre-W1 row is a snapshot) is
right and the asserts are unchanged, but the fixture no longer exercises a live write path, so case (b) can
no longer fail on a classifier regression. Consider adding a sibling arm written through the live path.

### W1-R1-17 · NOTE
`studio_member_rates` has no `updated_at` (repo convention: "use `created_at` and `updated_at`"), so an
in-place correction (W1-R1-08) leaves no trace. Cheap to add now, annoying after the table has rows.

---

## 3 · What I could not verify

- Nothing was applied to Strata; P-3 holds. No `supabase db push` was run.
- Lane B's UI and the live-mode render check (`NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`) — the code does
  not exist yet (W1-R1-14).
- The Strata-side studio resolution for a legacy project whose designer belongs to two studios
  (`W1-impl.md` §7) — unreproducible locally, unchanged by this review.
- The addendum-promotion behaviour end to end: the ceremony itself is red pre-existing, so W1-R1-04 rests
  on the filter predicate evaluated directly plus a reading of all seven promotion loops, not on a
  countersign run.
