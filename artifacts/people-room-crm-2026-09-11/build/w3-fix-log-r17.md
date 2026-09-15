# W3 (P2) — round 17 fix log

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local Postgres only. **No prod touched. No server started. No port taken. No migration minted**
(`00632` edited in place — unapplied on Strata, above 00627, outside the reserved 00595–00620).

Five findings in, four fixes out: three of them (`r17-blocking-1`, `F8`, `r17-major-1`
migrations, `MAJOR-2-corroborated` / `r17-major-2` code) are one defect and one ruling, and two
(`carried-code-review-MAJOR-1-bid-withdraw`, `r17-major-1` code) are one write.

**The shape is not the reviewers' proposed fix.** Both migration reviewers and the code reviewer
proposed scoping r16 F1's grant-opening loop to the household's own jobs. `rulings.md` §3 carries a
ruling made for exactly these findings, and it rules the other way:

> **R-BQ** — A household figure never opens a money grant by itself. `add_household_member`
> (project-scoped, PR-n gated) is the only door that opens authority; `set_household_threshold`
> only MOVES grants whose `source_household_id` is that household and refuses nothing else. Members
> added before a figure existed get authority through a named per-member act on the Client side
> band ('Record the authority', R-J shape, project-scoped). The figure's consequence sentence names
> only the moves it makes. *(Fable, 2026-09-15)*

> **R-BR** — Correcting a bid outcome away from 'withdrawn' clears `off_job_at` and
> `off_job_reason` so the seat's band, window clause and open-seat filters agree.

So the loop is **removed**, not bounded; the act that opens a grant is the one that already names a
job; and the figure's sentence is left saying what it always said, because the write beneath it is
what changed.

---

## 1. `r17-blocking-1` · `F8` (blocking) — the figure act opened money authority on other jobs' seats

**Fixed — `supabase/migrations/00632_client_households.sql`.**

`set_household_threshold()`'s second loop (r16 F1) is gone. What stands in its place is the rule and
the reasoning, at the site (`00632` §4, the `── r17 BLOCKING-1, R-BQ — AND IT OPENS NOTHING ──`
block), in the file banner (`── AND ONE DOOR THAT OPENS AUTHORITY — ONLY ONE ──`), and in both
function COMMENTs. The move loop is untouched: same predicate, same `source_household_id` leg
(r16 MAJOR-1), same closed-seat ending (r15 MAJOR-1), same per-seat PR-n refusals over the grants
this household itself wrote.

Re-measured on a fresh reset, all three of the reviewer's own probes, all rolled back:

| probe | before (HEAD) | after |
|---|---|---|
| `probe-r17-a` A-d (two households, one shared member, only Okonkwo names a figure) | `Lindqvist kitchen=250000 [src_hh=Okonkwo r17 household] \| Okonkwo residence=250000` | **`none`** |
| `probe-r17-a` A-f (then the Lindqvist household names $9,000) | both still `250000`, stamped Okonkwo, unmovable for ever | **`none`** — nothing was written for either household to be locked out of |
| `probe-r17-b` B-c (ONE household, no fold, an ordinary roster seat on another job) | `Lindqvist kitchen=250000 \| Okonkwo residence=250000` | **`none`** |

And the pre-fix body still reproduces it: HEAD's `set_household_threshold()` re-installed inside a
rolled-back transaction on the fixed database answers `B-c … Lindqvist kitchen=250000 | Okonkwo
residence=250000`. The difference is the change, not the fixture.

**What replaces r16 F1's repair** (R-BQ's second sentence), so the member seated before the figure
is not left signing nothing:

* `packages/supabase/src/hooks/use-households.ts` — `useProjectHousehold` now returns
  `clientRepSeatCardIds`: the cards holding the OPEN `client_rep` seat `add_household_member()`
  would reuse, one per card. `memberCardIds` could not answer it (every client-side card whatever
  its seat kind, and the plain `client` seat never carries the figure, PR-c).
* `apps/designer-portal/src/components/document/roster/household-band.tsx` — for each household
  member standing on this job as `client_rep` with no open money grant, and only while the
  household names a figure, the band prints R-J's sentence and offers R-J's act:

  > Chidi Okonkwo signs for the household but has no figure of their own on the Okonkwo residence.
  > Nothing defaulted from the agreement.
  > *Chidi Okonkwo may sign money to $2,500 on the Okonkwo residence. No other job changes. Nothing
  > is sent to them.*   **[ Record the authority ]**

  The press calls `add_household_member(household, person, 'client_rep', projectId)` — the one door
  that opens authority, with the job named — so the grant lands on that seat and no other, and PR-n
  is asked by the database exactly as it is for every other grant in the file. Held with its own
  standing reason (`HOUSEHOLD_AUTHORITY_HELD_REASON`) for anyone who is not the principal, because
  `household_grant_forbidden` rolls the whole act back.

**Pinned** in `supabase/tests/people/w3_merge_sweep_household_test.sql`:

* **13b rewritten** (was "the member added before the figure gets the grant when the figure is
  named"): the figure now opens **0** grants by itself (13b-b); the named act then opens exactly
  one, on the same seat, at the household's figure, stamped with the household (13b-c/d/e); the
  plain `client` seat still carries none (13b-f); a seat the studio closed gets nothing from either
  door (13b-g); and raising the figure afterwards MOVES that one grant rather than opening a second
  (13b-h).
* **13c new** — the shape block 13b could not see, because 13b stages every member on ONE job. One
  card holds THREE open `client_rep` seats: the household's own job, an ordinary roster seat on
  another live job, and a seat on an R-BI legacy studio-less job. Naming the figure writes nothing
  anywhere (13c-b); the named act reaches only the job it names (13c-c/d); raising the figure moves
  that grant and still reaches no other job (13c-e/f); and A-f's negative control — the household
  that DOES hold the other job records and keeps its own figure there while the first household's
  stands (13c-g/h).

## 2. `r17-major-1` (migrations) — a studio-less seat refused the whole figure act

**Fixed by the same removal.** The refusal came from the opening loop asking PR-n per seat over
seats it should never have visited. `probe-r17-c` (a household member holding an open `client_rep`
seat on a `studio_id IS NULL` job the household never named):

* before: `C-b the figure act was REFUSED: household_grant_project_has_no_studio`
* after: **`C-b the figure act SUCCEEDED`**

The studio-less leg is pinned inside block 13c (the third seat), so a future opener cannot reach it
without the block failing. The move loop keeps its own `household_grant_project_has_no_studio`
refusal, which is R-BD's repair sentence over a grant this household actually wrote.

## 3. `MAJOR-2-corroborated` · `r17-major-2` (code) — the figure's sentence did not say it opened authority

**Fixed on the write side, per R-BQ's last sentence.** `householdThresholdConsequence` is
**unchanged** — it says only what the press does:

> Change orders over $2,500 will need a signature from the household. Every household member who
> already signs money from this figure moves to $2,500, on every job. Nothing is sent to them.

That was the finding: a sentence about moves in front of a write that also opened. The write no
longer opens, so the sentence is once again the whole truth. The reviewers' proposed
`householdThresholdConsequence(cents, newlyGrantedCount)` is deliberately **not** taken: R-BQ says
the figure's sentence names only the moves it makes. The opening it used to do is now its own act
with its own sentence (§1). The site carries the reasoning, and
`household-band.test.tsx` pins the sentence verbatim plus `expect(sentence).not.toMatch(/given|opens|new/i)`,
so a grant-opening loop cannot come back without this test coming back with it.

## 4. `carried-code-review-MAJOR-1-bid-withdraw` · `r17-major-1` (code) — correcting a withdrawal left the seat dated off the job

**Fixed — `packages/supabase/src/hooks/use-coordination.ts`, `useSetPartyBid`** (R-BR).

The stamp was one-way: `off_job_at` was written on the transition into `withdrawn` and cleared by
nothing in the repo, while `off_job` is absent from `SEAT_STAGES_PAST_THE_BID`, so correcting the
outcome to a live one DID write the new stage and left the date. The row then stood in the Bidding
band printing "Off the job 15 Sep 2026." beside its bid note (r15 MAJOR-1 put that leg ahead of the
band test), and `useProjectHousehold`'s open-seat filter went on counting the seat CLOSED.

```ts
if (patch.bidOutcome === 'withdrawn' && written.moved) {
  dbPatch.off_job_at = new Date().toISOString().slice(0, 10);
} else if (written.stage) {
  dbPatch.off_job_at = null;
  dbPatch.off_job_reason = null;
}
```

Guarded on `written.stage` actually being written, so a correction that moves nothing leaves a
genuine "Close this seat" date alone. `SEAT_STAGES_PAST_THE_BID` is deliberately NOT widened with
`off_job` — that would re-close MAJOR-7's correction door.

Pinned: `people-crm-w3.test.ts` — `withdrawn → quoted` carries `off_job_at: null`,
`off_job_reason: null` and `stage: 'bidding'`; a correction that writes no stage
(`quoted → selected` on an `active` seat) leaves both `undefined`. And
`roster-row.test.tsx` renders the state the fix prevents: a `bidding`-band row carrying a stale
`offJobAt` prints "Off the job 15 Sep 2026."

---

## Files

| File | Change |
|---|---|
| `supabase/migrations/00632_client_households.sql` | r16 F1's grant-opening loop removed from `set_household_threshold()`; banner + both function COMMENTs restated under R-BQ |
| `supabase/tests/people/w3_merge_sweep_household_test.sql` | block 13b rewritten to R-BQ; block 13c added (one member, three jobs, one figure) |
| `packages/supabase/src/hooks/use-households.ts` | `useProjectHousehold` returns `clientRepSeatCardIds`; `useSetHouseholdThreshold` doc records R-BQ |
| `apps/designer-portal/src/components/document/roster/household-band.tsx` | `householdAuthorityGapSentence`, `householdAuthorityConsequence`, `HOUSEHOLD_AUTHORITY_HELD_REASON`, `membersOwedAuthority`, `recordAuthority()`, and the per-member "Record the authority" region |
| `packages/supabase/src/hooks/use-coordination.ts` | `useSetPartyBid` clears `off_job_at` / `off_job_reason` on a correction that moves the stage (R-BR) |
| `apps/designer-portal/.../__tests__/household-band.test.tsx` | 7 new cases (R-BQ), mock carries `clientRepSeatCardIds` |
| `packages/supabase/src/hooks/__tests__/people-crm-w3.test.ts` | 2 new cases (R-BR) |
| `apps/designer-portal/.../__tests__/roster-row.test.tsx` | 1 new case — the face state R-BR prevents |

No new column, no new RPC, no new migration, no GRANT or REVOKE, no schema change at all:
`database.types.ts` and `seed/00-legacy-grants.sql` both regenerate with **no diff**.

## Gates

| Gate | Result |
|---|---|
| `pnpm supabase:reset` (full replay + every seed) | rc=0, "Finished supabase db reset on branch main." |
| `people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed" (13b and 13c last) |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." |
| all 24 `supabase/tests/rls/*.sql` | 21 pass, 3 fail — `design_requests`, `field_parties`, `studio_titles`: the same three r17 n6 records, none W3's, unchanged by this round |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** (no schema change) |
| `python3 scripts/generate-legacy-grants.py` | re-run — **no diff**, 2766 replayed statements |
| `pnpm --dir packages/supabase type-check` | exit 0 |
| `pnpm --dir apps/designer-portal type-check` | exit 0 |
| `pnpm --dir apps/admin-portal build` | exit 0 (shared-package edit gate) |
| `apps/designer-portal` jest (full) | 593 suites, **7687** tests passed (was 7679: +8) |
| `packages/supabase` vitest (full) | 106 files, **1352** passed / 12 skipped (was 1350: +2) |
| `eslint` on the touched portal file | clean |
| `prettier --check` | `household-band.test.tsx` reformatted; `use-coordination.ts`, `roster-row.test.tsx`, `people-crm-w3.test.ts` were already unformatted at HEAD and are left as they are |
| migration numbering | none minted; `00632` edited in place, above 00627, outside 00595–00620 |

## Left standing (not this round's findings)

The r17 review's twenty-nine minors are untouched, and r16-n1 is now slightly wider: with the
opening loop gone, a grant standing on a seat the studio CLOSED is still only ended when the
household's figure is next touched. Nothing in the five findings named it, and R-BQ does not move
it.
