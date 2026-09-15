# W3 round 24 — fix log

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Local only. No migration minted (R-BS: W3 mints none). No portal source changed. No server started.
No prod anything.

---

## r24-major-1 (major / high) — `w3-room-report.md` states two facts HEAD does not support (eighth filing)

**Filed at** `w3-room-report.md:199` (§3 row 3) and `:355-358` (§5), by `w3-review-r24-code.md`
§2 major-1. Documentation drift only — the reviewer's own words: *"zero defects in the room's actual
behaviour"* (`w3-review-r24-qa.md:11`). Nothing under `apps/`, `packages/`, `supabase/` or
`services/` was touched by this fix; `git status --porcelain -- apps packages supabase services`
is empty at the end of the round.

### (a) §3 row 3 — the pick count is six, not five

**Measured, not re-read.** New probe
`artifacts/people-room-crm-2026-09-11/build/probe-r24-a-bring-forward-pool.sql` reproduces
`rolodex-picker.tsx`'s `hits` for needle `lindqvist` on the Okonkwo residence (the open job excluded
from the rollup, per `useStudioContactHistory`'s `excludeProjectId`), searching every field the
composer searches — `full_name`, the resolved firm name, legacy `company_name`, the resolved trades,
`email`, and every prior project name:

```
 full_name        | firm |    prior_jobs     | matched_on
------------------+------+-------------------+------------
 Ben Ostrom       | -    | Lindqvist kitchen | prior job
 Claire Bissett   | -    | Lindqvist kitchen | prior job
 Dana Kowalski    | -    | Lindqvist kitchen | prior job
 Erin Sato        | -    | Lindqvist kitchen | prior job
 Ingrid Halvorsen | -    | Lindqvist kitchen | prior job
 Pete Rusk        | -    | Lindqvist kitchen | prior job
(6 rows)
```

Exactly the six R-BP names, and **no card matches the needle by name, firm, e-mail or trade** — so
`hits.length` is 6 and `sharedJobName` resolves to the one job. The code already agreed:
`bring-forward.ts:68-69` documents `"4 of 6 from the Lindqvist kitchen selected"` citing R-BP, and
`bring-forward.test.ts:60` pins the string. The report carried the pre-R-BP figure.

**Changed.** §3 row 3 now reads `"4 of 6 from the Lindqvist kitchen selected"`, cites R-BP by id,
names all six (Erin Sato listed but not selected, per the ruling), records that SPEC §5.7 #3 was
amended from five to six, and points at the two code sites that say six.

**Pinned.** `pnpm exec jest src/lib/document/__tests__/bring-forward.test.ts` (in
`apps/designer-portal`) → **1 suite passed, 17 tests passed**, including *"names the prior job when
every row on offer came from it"* asserting `bringForwardSelectionLine(4, 6, "Lindqvist kitchen")`.

### (b) §5 — "All six writers" is seven

**Measured at HEAD `96fcc861b`:**

```
grep -n "invalidateClientHouseholds(queryClient)" packages/supabase/src/hooks/use-coordination.ts
 588   useAddProjectParty
 755   useUpdateProjectParty
 978   useCloseProjectPartySeat
1126   useRemoveProjectParty
2101   useSetPartyAuthority
2845   useSetPartyBid          <- the one §5 omitted
2956   useBringForward
```

Enclosing hook for each line confirmed by reading back to the nearest `export function use…`
(485 / 671 / 917 / 1033 / 2046 / 2719 / 2908). `use-coordination.ts:2843` calls `useSetPartyBid`
*"the seventh seat writer and the only one that told neither"*, and R-BS names it beside
`useCloseProjectPartySeat`.

**Changed.** §5 now reads "All **seven** writers", enumerates `useSetPartyBid` in sequence, and says
in one sentence why it belongs (recording "They withdrew" moves `off_job_at`, which moves
`useProjectHousehold`'s open-seat filter) and why the list was short (written at r15, the seventh
writer arrived at r21).

### (c) The eighth-filing instruction — the measuring commands in the banner

The reviewer asked for the ONE command that settles each numeric claim, stated in the banner, *"so
the next round re-measures rather than re-reads"*. Added to the report's banner, above the r23
paragraph: a new **"How to re-measure this file"** block naming all eight filings of this defect and
its shape (a section re-measured in one round goes stale in the next, because the re-measurement is
taken section by section rather than over the file), followed by the three commands with their
expected answers —

1. the §3 pick count → the new `probe-r24-a-bring-forward-pool.sql` (expects 6 rows, named);
2. the §5 writer count → the `invalidateClientHouseholds` grep (expects 7 call sites, named with
   their line numbers and hooks);
3. the §1 `### Changed` table → `git diff --stat 3d65f81e4..HEAD -- apps/designer-portal/src
   packages/supabase/src` (verified to run: 50 files changed).

The block's instruction is explicit: run all three, over the WHOLE file, before the next round signs
it off.

### Gates

Documentation + one new read-only probe; no schema, no portal source, no seed, no grants. So no
`supabase:reset`, no `db:generate`, no type gate and no regeneration of
`seed/00-legacy-grants.sql` is owed. The one gate that bears on the corrected figure —
`jest src/lib/document/__tests__/bring-forward.test.ts` — was run and is green (17/17). Migration
head on the branch is unchanged at `00634`; nothing was minted, and nothing entered the reserved
`00595`–`00620` range.
