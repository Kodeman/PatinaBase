# W0 — adversarial review, round 1

**clean = false** (one major: the only existing test that guards the repaired `project_unbilled_time`
against design-services rows never executes. No blockers.)

- Reviewer: separate context from the implementer. Branch under review `hour-tracking/server`
  (tip `de4b18553`), diffed against `origin/hour-tracking/integration`.
- Stack: the program's own isolated Supabase (`project_id = "patina-hours"`, API 54421, DB 54422).
  The shared 54321/54322 stack was never touched.
- Inventory derived from the diff (no `W0-impl.md` exists).

---

## 1 · Inventory vs plan-v2 §1 — every item found

| Plan item | Found | Evidence |
|---|---|---|
| Migration 1: `time_entry_claim_and_source.sql` | ✅ `supabase/migrations/00595_time_entry_claim_and_source.sql` | see §2 on the number |
| Migration 2: `project_unbilled_time_repair.sql` | ✅ `00596_project_unbilled_time_repair.sql` | |
| Migration 3: `time_entry_auto_roster.sql` | ✅ `00597_time_entry_auto_roster.sql` | |
| `claim_time_entries(p_invoice_id uuid, p_entry_ids uuid[]) RETURNS SETOF uuid`, `LANGUAGE sql`, **INVOKER**, `SET search_path = public, pg_temp`, all four WHERE legs incl. `duration_minutes IS NOT NULL` | ✅ exact signature + body as specified | `pg_proc`: `prosecdef = f`, `proconfig = {search_path=public, pg_temp}` |
| `REVOKE … FROM PUBLIC, anon` + `GRANT … TO authenticated` | ✅ | `has_function_privilege`: anon **f**, authenticated **t** |
| `project_time_entries_source_ck` widened **by name** to nine values | ✅ and exactly one source CHECK exists (no stray `_check` survivor from 00198) | `pg_get_constraintdef` → `source = ANY (ARRAY['timer_auto','timer_manual','manual_entry','field_visit','command_bar','field_manual','internal','widget','intent'])` |
| `project_unbilled_time` redefined, **name kept**, column list/order/types unchanged, profiles join **gone**, projects join **kept**, one rate source | ✅ grafted faithfully from `00412:2671-2688` (diffed line by line) | `pg_get_viewdef` shows no `profiles`, `JOIN projects p` present |
| `time_entry_auto_roster()` DEFINER, `search_path` pinned, `REVOKE ALL FROM PUBLIC, anon, authenticated, service_role` | ✅ | `prosecdef = t`; `proacl = postgres=X/postgres` only; `has_function_privilege('authenticated', …)` = **f** |
| trigger `aaa0_time_entry_auto_roster_trg` BEFORE INSERT, fires first | ✅ + a postcondition asserts it | `pg_trigger` order: `aaa0_…`, `aaa_guard…`, `aab_guard…`, `aac_classify…`, `aad_guard…` |
| own-designer early exit | ✅ and pinned by test case (f) + structural assert (g) | |
| Hook module moved to `packages/supabase/src/hooks/use-time-tracking.ts`, every name preserved (§0.21) | ✅ all eleven names exported from `hooks/index.ts` and the package index | |
| `useClaimTimeEntries` → `rpc('claim_time_entries')`, **compensating detach deleted** | ✅ `:617-619` gone | |
| Deletions: `useTimeEntries`, the `useTimeSummary` wrapper (keeping `fetchTimeSummary`), `useReleaseTimeEntries`, the stale `:653` comment | ✅ all four; `grep -rn "useTimeEntries\|useReleaseTimeEntries\|useTimeSummary" apps packages` → nothing | |
| App-local kept (CR-28): `document-time-provider.tsx`, `time-derivation.ts`, `authority-hours.ts` | ✅ | |
| Callers repointed: `hours-ledger.tsx`, the invoice composer | ✅ (see note N4 — the plan's `overlays/` path is wrong; the real file is `accounts/invoice-composer.tsx`) | |
| 3 new SQL tests (claim atomicity incl. case (d); view repair; auto-roster per role incl. (f) + structural (g)) | ✅ all present with every listed assertion | |
| Governance entries with dates | ✅ `R152` (DECISIONS.md) + `V11` (VISION-DECISIONS.md) | |
| iOS / edge / cron / PostHog: none | ✅ none touched | |

## 2 · Program rules — every prohibition checked, none violated

| Rule | Verdict | Evidence |
|---|---|---|
| §0.5 no flags | ✅ | no added line in the whole diff matches `useFeatureFlag|posthog|isFeatureEnabled|ComingSoon` |
| §0.6 no backfill | ✅ | zero top-level `UPDATE`/`INSERT`/`DELETE` in all three migrations |
| §0.7 client rate never trusted | n/a in W0 (W1 owns it); W0 adds no rate path | — |
| §0.8 guard column list in BOTH places | n/a — W0 adds no derived column | |
| §0.9/§0.16 DEFINER contract | ✅ the one DEFINER function pins `search_path`, is REVOKEd from PUBLIC/anon/authenticated/service_role, and needs no caller assert (trigger-only, takes no user scope). `claim_time_entries` is deliberately INVOKER | probes above |
| §0.10 notes never in a rollup | n/a — W0 adds no rollup | |
| §0.11 running-slot index untouched | ✅ `uniq_project_time_entries_running_timer ON (user_id) WHERE duration_minutes IS NULL` unchanged | `pg_indexes` |
| §0.12 invoiced lock untouched | ✅ `guard_invoiced_time_entry` trigger + function not referenced by any W0 file except in a comment | |
| §0.13 no policy keyed on `projects.studio_id` | ✅ W0 adds/drops **no** policy at all | `pg_policies` shows the pre-existing nine, unchanged |
| §0.17 the 00484 quartet immutable | ✅ all four present and unreshaped; the SELECT policy's qual is still `is_project_team_member(project_id)` alone (plan-v2's correction confirmed on a clean reset) | `pg_policies` |
| §0.1 additive to `project_time_entries` | ✅ no column dropped, no new hours table, no new route | |
| §0.3 banner + idempotency | ✅ all three carry a banner with lineage + hazard; **all three re-applied cleanly a second time by hand** (exit 0 each) | |
| §0.19 types regenerated | ✅ | see §3 |
| §0.20 ACL seed regenerated | ✅ and additive-only (the three new GRANT/REVOKE blocks) | `diff` vs baseline seed |
| §0.4 redefine from the grep-winner | ✅ `project_unbilled_time`'s grep winner is `00412`; the W0 body is `00412`'s with exactly the two ruled deltas | |

## 3 · Gates re-run by the reviewer (all from the isolated stack)

```
supabase db reset --workdir .codex/worktrees/agent-server
  → exit 0; "Applying migration 00595_… / 00596_… / 00597_…"; all 22 seeds; clean through the wave's last migration

run-sql-tests.sh -d supabase/tests/billing    -k supabase/tests/KNOWN_FAILURES.md   →  5/5 green           (both new suites PASS)
run-sql-tests.sh -d supabase/tests/commercial -k supabase/tests/KNOWN_FAILURES.md   → 16/16 effective      (10 green + 6 documented)
run-sql-tests.sh -d supabase/tests/rls        -k supabase/tests/KNOWN_FAILURES.md   → 25/25 effective      (23 green + 2 documented; time_entry_auto_roster_test PASS)
run-sql-tests.sh -d supabase/tests/rls -f time_entry                                →  1/1 PASS
run-sql-tests.sh -d supabase/tests/field      -k supabase/tests/KNOWN_FAILURES.md   →  5/6  (1 undocumented pre-existing — N1)

pnpm --filter @patina/supabase type-check          → clean
pnpm --filter @patina/designer-portal type-check   → clean
pnpm --filter @patina/supabase test                → 100 files, 1244 passed / 12 skipped
pnpm --filter @patina/designer-portal test         → 573 suites, 7259 passed (the 4 time/authority specs: 30/30)
npx turbo build --filter=@patina/supabase          → 2 successful
pnpm --filter @patina/admin-portal build           → exit 0 (the strict gate after a packages/* edit)

SUPABASE_DB_URL=…54422 pnpm db:generate  +  python3 scripts/generate-legacy-grants.py
  → git status --short   EMPTY   (generated files in sync; supabase/config.toml correctly absent/skip-worktree)
```

**Caveat on the suite invocations (finding m4).** Run the way the brief spells it — absolute
`-d …/.codex/worktrees/agent-server/supabase/tests/commercial`, no `-k` — the runner prints
worktree-prefixed relative paths, matches nothing in the known-failures file, and reports
**6 unexpected failures** in `commercial` and **2** in `rls`. The numbers above are the same run from
inside the worktree with `-d supabase/tests/commercial -k supabase/tests/KNOWN_FAILURES.md`, where the
path match works.

## 4 · Done-when probes (SQL, as the roles the plan names)

Beyond re-running the implementer's suites I wrote independent fixtures (transaction-wrapped,
rolled back):

| Probe | Result |
|---|---|
| owner claims an authorized entry | `count=1`, view `rate=10000 amount=10000` for 60 min @ $100/h (reconciles) |
| a `pending_authorization` entry is claimed | **never** — `count=0` |
| an unrelated authenticated outsider calls `claim_time_entries` on another studio's entry | `count=0`, `invoice_id` still NULL (RLS is the spine, as designed) |
| a **guest** studio co-member logs time | refused (`insufficient_privilege`) **and seated nobody** — `is_studio_comember`'s `role <> 'guest'` leg holds, so the DEFINER seat cannot manufacture a guest's INSERT |
| `anon` EXECUTE on `claim_time_entries` | **f** |
| partial two-invoice claim | the composing invoice's pre-existing entry keeps its `invoice_id` (test case (a)); compensation is sound end-to-end — `fk_time_entries_invoice` is `ON DELETE SET NULL` and `guard_invoiced_time_entry` explicitly permits detaching, so the composer's "delete the draft" releases a partial stamp |
| auto-roster seat / own-designer exclusion | per the RLS suite, green |
| `project_unbilled_time` over seeded data | **0 rows** — no seed writes `project_time_entries` (finding m5) |

---

## Findings

### MAJOR

**m1 · The only existing test that guards the repaired view on design-services rows never executes.**
*Confidence: high.* Location: `supabase/tests/commercial/design_services_authority_test.sql:221,349,362`
(the three `project_unbilled_time` asserts plan-v2 §1 names as the regression guard) vs
`supabase/migrations/00596_project_unbilled_time_repair.sql`.
The file aborts at **line 177** (`design services agreement d5300000-… not found or access denied`,
raised inside `_countersign_design_services_agreement_impl`) — 44 lines before the first
`project_unbilled_time` assert, so none of the three runs. The new
`time_unbilled_view_repair_test.sql` builds **only non-services fixtures** (no
`project_commercial_documents`, no `project_billing_authorities`; greps return nothing), so after W0
there is **zero executing coverage** of the rewritten view for authority-rated rows — exactly the
rows where `rated_amount_cents` comes from an authority rate rather than from
`duration × hourly_rate_cents`. The invariant does hold structurally (`00578:2790-2817` always writes
`rated_amount_cents = round(duration/60 × hourly_rate_cents)` and sends over-ceiling rows to
`pending_authorization`, which the view filters out) — but that is my reading, not a test.
**Fix:** add a design-services fixture to
`supabase/tests/billing/time_unbilled_view_repair_test.sql` — an origin `project_commercial_documents`
row of kind `design_services`, an active `project_billing_authorities` + a
`project_billing_authority_rates` row covering `started_at`, a roster seat for the author — and assert
(i) the authority-rated entry appears in `project_unbilled_time`, (ii)
`round(duration_minutes/60.0 * resolved_rate_cents) = amount_cents` on it, (iii) an over-ceiling
entry does **not** appear. That restores the guard inside a suite that actually runs, independent of
the broken commercial file.

### MINOR

**m2 · plan-v2 contradicts itself on W0's migration numbers; the implementation follows the correct
half.** *Confidence: high.* Location: `plan-v2.md:25` (§0.2 amendment) vs `:31` (§0.2a) vs the §1/§2
range headings.
§0.2 line 25 and the orchestrator brief say **W0 = 00595–00597, W1 = 00598–00603**. §0.2a and the
§1 heading ("Migrations (00598–00600)") / §2 heading ("Migrations (00601–00606)") say W0 must shift
again to 00598–00600, on the stated premise that the peer program "had already committed
`00595_people_cards_affiliations_rules.sql`, `00596_…`, `00597_…`". **That premise is false.** After
`git fetch --all --prune` I enumerated every ref: `origin/build/people-room-crm-2026-09-11` (tip
`c4ca5b9f1`, including its own r1-review commit) holds **00592, 00593, 00594** only; 00595–00597 exist
on `hour-tracking/server` alone; **00598–00600 exist on no ref.** So the branch is right at
00595–00597 and nothing collides.
**Fix:** amend plan-v2 — delete §0.2a's second +3 shift (keep its *lesson*, drop its false fact) and
restore the §1–§8 range headings to the line-25 amendment (W0 00595–00597, W1 00598–00603, W2
00604–00607, W3 00608–00609, W4 00610–00614, W6 00616–00617, W7 00618–00620). **W1 mints from
00598.** Re-run the all-branch check immediately before merge regardless.

**m3 · `time_entry_auto_roster`'s co-membership gate is bypassed whenever `auth.uid()` IS NULL, and
the seat it then writes confers project-wide read.** *Confidence: high.* Location:
`supabase/migrations/00597_time_entry_auto_roster.sql:84-95`.
Probed: as `postgres` (i.e. any `service_role`/server-side writer), inserting an entry for a user with
**no organization, no studio relationship, no roster row** seats them `support_designer`
(`seats_for_stranger=1`). The seat then satisfies `Team can view their project time entries`, whose
live qual is `is_project_team_member(project_id)` **alone** — so that stranger gains SELECT on every
row of that project, notes included. Reachable today only from direct SQL or `service_role`: I
confirmed **no** edge function or NestJS service writes `project_time_entries` (grep over
`supabase/functions` + `services` is empty), and iOS writes under the member's own JWT. The banner
calls the NULL bypass deliberate (00317:38-39 precedent) but does not state this consequence, and no
test pins it.
**Fix:** either narrow the bypass (`IF v_actor IS NULL AND current_user <> 'postgres' THEN RETURN
NEW;`, or require co-membership whenever `current_user = 'service_role'`), or — if the bypass stays —
add a test case asserting the NULL-actor seat is intended and a banner line saying *a server-side
writer grants the authored-for user roster read on that project*. Re-check before W4/lane D adds any
cron or edge writer of time entries.

**m4 · The "must stay green" suites are only green against the top-level known-failures file, and its
documented causes have drifted.** *Confidence: high.* Location: `supabase/tests/KNOWN_FAILURES.md:83-87`
vs the live failures; plan-v2 §1/§2 gate lists.
Two distinct problems. (a) Path matching: the per-directory default (`<dir>/KNOWN_FAILURES.md`) does
not exist for `commercial`/`rls`/`billing`/`field`, and `run-sql-tests.sh` matches entries by the
**relative path it prints**, so an absolute `-d` under the worktree makes every documented failure
read as *unexpected*. (b) Drift: the six commercial failures are genuinely **pre-existing, not W0's** —
I proved it by replaying the integration baseline (`git archive origin/hour-tracking/integration
supabase` into a scratch workdir, 545 migrations, none of W0's files) into the same stack and getting
the **identical six** — but four of them now die at
`design services agreement … not found or access denied` inside
`_countersign_design_services_agreement_impl`, **earlier** than the `designDisposition` readiness gate
KNOWN_FAILURES.md documents. W1 names `supabase/tests/commercial` "the real gate for the classifier
rewrite"; that gate currently exercises 10 of 16 files and stops before the authority asserts.
**Fix:** (i) every wave runs the suites worktree-relative with `-k supabase/tests/KNOWN_FAILURES.md`
(or add per-directory symlinks), and states it; (ii) before W1 starts, either repair the countersign
fixture drift or update KNOWN_FAILURES.md to the *current* failure point and record in the W1 brief
that the classifier rewrite's DB gate is the 10 green files plus W1's own new suites — not "commercial
green".

**m5 · Two W0 Done-when probes cannot be demonstrated against a reset database.**
*Confidence: high.* Location: plan-v2 §1 "Done-when", bullets 2 and 3.
`SELECT count(*) FROM project_unbilled_time` after a clean reset is **0** (`project_time_entries` is
empty — no seed writes it), so "a `SELECT` of `project_unbilled_time` as the owner includes an entry
authored by a roster vendor" and "on any one row: `round(duration/60 × resolved_rate_cents) =
amount_cents`" have no seeded evidence. They are satisfied only by the new test's three fixtures and
by my own probe (60 min @ $100/h → rate 10000, amount 10000).
**Fix:** state in the wave report that both are fixture-proven, not seed-proven; optionally seed one
unbilled entry so the ledger surfaces have any data to render in local dev (W2's lens will want it).

**m6 · The commit series is not bisectable and two messages state facts the tip contradicts.**
*Confidence: high.* Location: `343252aaa`, `ef8fe776f`, `f0f97145b`, `de4b18553`.
`343252aaa`'s body describes migrations **00592/00593/00594** and says `project_unbilled_time` "now
LEFT JOINs profiles" — the shipped body removes the profiles join **entirely** (correctly: the file
and its postcondition assert `NOT LIKE '%JOIN profiles%'`). `ef8fe776f` announces **V10/R151**, which
became V11/R152. And `f0f97145b` added 00595–00597 while 00592–00594 were still in the tree —
for one commit the branch carried **six** migrations, three of them duplicates, so a `db reset` at
that commit applies both sets; `de4b18553` removed the old three. The tip is correct in every respect;
only the history misleads.
**Fix:** no code change needed. Either squash `343252aaa…de4b18553` at merge, or put one paragraph in
the merge commit saying the numbers in the early messages are pre-renumber and that the view's profiles
join is removed, not outer-joined.

### NOTES

**N1 · `supabase/tests/field/field_capture_note_routing_test.sql` fails undocumented** —
`FAIL 7f: field_captures should carry exactly five policies, got 9`. Pre-existing and structurally
unrelated (W0 adds no policy to any table). Fix: add it to `supabase/tests/KNOWN_FAILURES.md` with the
FC-R8 note its own message suggests, so it stops reading as a W0 regression in every later wave.

**N2 · `VISION-DECISIONS.md`'s new footer lists `V10`**, which is not in this file on this branch (it
is the peer program's entry). It becomes true only if the peer merges first. Both programs also append
at the identical end-of-file position in **both** ledgers, so expect a textual merge conflict in
`DECISIONS.md` and `VISION-DECISIONS.md` — resolve by keeping both entries in id order. Peer ids
verified: peer = R151/V10, hours = R152/V11; no id collision.

**N3 · The V11 entry's owed `VISION.md` §6 bullet cannot be committed** because `docs/vision/VISION.md`
is untracked. The entry records the sentence verbatim and its insertion point; it stays owed to Kody.
Flagging so it is carried into the program's owed list, not lost in a ledger entry.

**N4 · plan-v2 §1's portal path is wrong**: the claim call site is
`apps/designer-portal/src/components/document/accounts/invoice-composer.tsx`, not
`…/components/document/overlays/invoice-composer.tsx` (no composer exists under `overlays/`). The
implementer repointed the real file. The `hours-ledger.tsx:161-171` cite was correct. Fix: correct the
path in plan-v2 so W3 does not hunt for a file that isn't there.

**N5 · `useStartTimer(options?: { toast })` makes the duplicate-timer warning optional.** Inside the
hook the handler is `toast?.('You already have a timer running', 'warning')`, so any future call site
that forgets `{ toast }` loses the only feedback for SQLSTATE 23505 — silently. Today there is exactly
one call site (`document-time-provider.tsx:137`) and it passes the toast. Fix (cheap, and worth doing
before W3 adds ⌘K and mobile capture paths): make the option required, or fall back to a
`console.warn` when absent so the swallow is visible in dev.

**N6 · `claim_time_entries` also carries `service_role=X`** in its ACL (Supabase default privileges,
not a W0 GRANT). Not a rule violation — §0.16 requires REVOKE from PUBLIC/anon plus an explicit
`authenticated` GRANT, both present — recorded only so a later "why is service_role in the ACL" pass
does not treat it as drift.

**N7 · Commit hygiene is otherwise clean.** Six commits, 21 files, every path plausible for its
message; `supabase/config.toml` appears in **no** commit and `git ls-files -v` confirms it is still
`S` (skip-worktree); no `git add -A` artefacts; `git status --short` empty after a fresh
`db:generate` + `generate-legacy-grants.py`.

---

## What I did not verify

- Nothing was run against **Strata**; no `db push`, no deploy. Prod's `project_time_entries_source_ck`
  shape (whether 00198's unnamed CHECK survived there the way 00545 assumed) was **not** probed — only
  the local replay, which has exactly one source CHECK.
- No browser / live-mode render pass: W0 changes no UI, and the designer-portal specs + type-check
  cover the import moves.
- `pnpm --filter @patina/designer-portal lint` was not run (W0's gate list omits it; the implementer
  reports 0 errors / 201 pre-existing warnings).
- iOS: untouched by W0, not built.
- The 6 commercial + 2 rls pre-existing failures were **reproduced**, not diagnosed to root cause.
