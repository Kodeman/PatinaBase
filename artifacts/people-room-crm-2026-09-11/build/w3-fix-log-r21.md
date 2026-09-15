# W3 (P2) — fix log, round 21

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started. No port taken. No migration minted** — R-BS: W3 mints no
further migrations, so `00634` (unapplied on Strata) is amended in place.

Eight findings across the three review lanes, five distinct defects:

* the migrations round's **MAJOR-1** and the code round's **major-2** are one gap — 00634's two
  refusal tokens reach three faces verbatim and neither close act is held for a caller without the
  standing;
* the migrations round's **MAJOR-2** is the second door into 00634 (the Bidding band's "They
  withdrew");
* the code round's **major-1** is the invalidation gap on both doors;
* the code round's **major-3** and **major-4** are one branch's two consequences on a hand-closed
  seat;
* the migrations round's **MAJOR-3** and the code round's **major-5** are the two reports.

Every ruling in `rulings.md` §3 binds; **R-BS** is the one this round was written against.

---

## r21-MAJOR-1 · r21-major-2 — 00634's two refusals printed as schema tokens, and neither close act was held for a caller without the standing

**Fixed in four files.**

### What was wrong

`00634:151` and `:157` raise two bare tokens with no SQLSTATE
(`seat_close_authority_forbidden`, `seat_close_money_authority_forbidden`). Grepped across the
worktree, no hook, mapper or component knew either word. `@supabase/postgrest-js` declares
`PostgrestError extends Error`, so every `e instanceof Error ? e.message` catch printed the token:

| Surface | Was |
|---|---|
| Call Sheet row | `setNote(e instanceof Error ? e.message : …)` — into the sheet's polite `role="status"` announcer |
| Person card `CloseSeatAct` | `setError(e.message)` — into its `role="alert"` |
| Bidding band | `writeErrorMessage`'s fallthrough — a bare token matches none of the schema-word patterns, so `return raw` |

And the act was offered live and unqualified to the caller the database would refuse, while
`household-band.tsx:328,723,753,785` already states the identical PR-n rule in words one region
away.

### What changed

1. **`packages/supabase/src/hooks/use-coordination.ts`** —
   `SEAT_CLOSE_REFUSAL_SENTENCES` + `asSeatCloseError()` beside `asBidError`;
   `useCloseProjectPartySeat` now throws `new Error(asSeatCloseError(error))` rather than
   re-raising the PostgREST object; `seatCloseIsHeldForMoney(authority, isPrincipal)` +
   `SEAT_CLOSE_MONEY_HELD_REASON` mirror `end_party_authority_at_seat_close()`'s own second leg
   (`effective_to IS NULL` AND scope in `money` / `draw_certify`), the shape `householdAddIsHeld`
   already ships. All five exported from `hooks/index.ts`.
2. **`apps/designer-portal/src/lib/document/write-error.ts`** — the two tokens added beside
   CR-3's three and M2R-4's two, ahead of the schema-word guard.
3. **`roster-row.tsx`** — `useOrganizations()` + `consentOrg` give the caller's role, exactly as
   `household-band.tsx` reads it; `closeHeldForMoney` folds into the existing `seatAlreadyClosed`
   hold (`closeHeld` / `closeHeldSentence`), so the act carries `aria-disabled`,
   `aria-describedby` and a **visible** reason for both causes; the close catch now routes through
   `writeErrorMessage` into a new `role="alert"` line (`data-close-seat-error`) instead of
   `setNote` — the r7 MAJOR-4 rule this wave set for the bid editor.
4. **`close-seat-act.tsx`** — takes `organizationId` (passed by `person-profile.tsx` from
   `cardOrgId`), reads `usePartyAuthority(seatId)` (the same key `SeatFacts` one element up
   already holds, so no second query), holds the act with the same visible reason, and routes its
   catch through `writeErrorMessage`.

### Measured

* `packages/supabase` vitest — `asSeatCloseError` maps both tokens and never leaks `seat_close`;
  `seatCloseIsHeldForMoney` holds money/draw_certify for a non-principal, never for an owner or
  admin, never for `schedule`, and never for a grant already ended.
* `write-error.test.ts` — both tokens, including the `Error`-shaped PostgREST rejection.
* `roster-row.test.tsx` — the act is `aria-disabled` with the sentence for a `member`, live for an
  `admin`, live on a `schedule`-only seat, and a refused close lands in `role="alert"` with
  `onAnnounce` **not** called.
* `close-seat-act.test.tsx` — the same three.

---

## r21-MAJOR-2 — the Bidding band was a second door into 00634

**Fixed in `supabase/migrations/00634_seat_close_ends_authority.sql` (amended in place), per R-BS.**

### What was wrong

`useSetPartyBid` writes `off_job_at = today` on the transition into `withdrawn`, which was exactly
`end_party_authority_at_seat_close_trg`'s `WHEN` clause. So (a) a plain member recording what a
bidder did was refused `seat_close_money_authority_forbidden` — recording a withdrawal is not a
money act — and (b) when a principal took it and then corrected it back, R-BR cleared `off_job_at`
while 00634 deliberately does not re-open a grant, so the seat returned to the job live with its
money delegation closed and no act in the room able to restore it.

### What changed

The trigger's `WHEN` clause excludes exactly the statement that moves `bid_outcome` INTO
`withdrawn`:

```sql
WHEN (OLD.off_job_at IS NULL
      AND NEW.off_job_at IS NOT NULL
      AND NOT (COALESCE(NEW.bid_outcome, '') = 'withdrawn'
               AND COALESCE(OLD.bid_outcome, '') <> 'withdrawn'))
```

Both legs are COALESCE-first: a bare `=` against a NULL `bid_outcome` makes the whole predicate
NULL, and a NULL `WHEN` does not fire — which would have taken the trigger off every seat carrying
no bid at all. Every other path that dates a seat — the room's own Close this seat, a migration, a
job, `service_role` — still fires it, so the invariant holds on every close ACT rather than only
on the portal's.

The file's banner and the function COMMENT now state the clamp, the two harms it closes, and
**what it leaves standing**, plainly: a seat dated by a recorded withdrawal keeps its open grants
until the principal closes the seat, because a withdrawal is the bidder's act on the record and
PR-n reserves ending a delegation to the principal. `useProjectAuthority` already keeps a grant
still OPEN on a closed seat deliberately ("a state the room should show rather than hide",
`use-project-authority.ts:60-76`), so that state is readable rather than hidden.

### Measured

New SQL block **13f** (the suite's last), on a freshly reset database, one transaction, ROLLBACKed:

* `13f-a` a plain member records "They withdrew" on a money-bearing seat — the press LANDS;
* `13f-b/c` the grant is untouched (`effective_to IS NULL`) and the seat is dated;
* `13f-d/e` a seat ALREADY reading `withdrawn`, closed BY HAND by a plain member, is still refused
  `seat_close_money_authority_forbidden` — the clamp is exactly the statement it names, no wider;
* `13f-f` the principal's hand-close of that same seat still ends the grant today.

`pg_get_triggerdef` read back off the catalog carries the clamp verbatim (quoted in
`w3-data-report.md` §8).

---

## r21-major-1 — closing a seat ended its money in the database and nothing told the browser

**Fixed in `packages/supabase/src/hooks/use-coordination.ts`.**

`00634:163-167` ends every open grant on the seat at the close. `useCloseProjectPartySeat`
invalidated five roots and none was a prefix of `partyAuthorityKeys.all` — the root
`projectAuthorityKeys.project` nests under — so with `staleTime` five minutes and
`refetchOnWindowFocus` false the Call Sheet went on printing `Signs money to $2,500.` in the
present tense over a grant the same transaction closed, while the household band two elements down
(which IS invalidated) refetched and dropped the clause. `useSetHouseholdThreshold` already
invalidates that root (`use-households.ts:623`).

Both doors now invalidate `partyAuthorityKeys.all`, and `useSetPartyBid` also calls
`invalidateClientHouseholds(queryClient)` — it moves `off_job_at` in both directions, which is
exactly what `useProjectHousehold`'s open-seat filter reads, and it was the seventh seat writer and
the only one telling neither.

**Measured:** two new vitest cases assert `partyAuthorityKeys.all[0]` is among the invalidated
roots for both hooks, and `useSetPartyBid` joins the existing `seatWriters` table that pins
`clientHouseholdKeys.all` for every seat writer.

---

## r21-major-3 — recording a bid outcome on a hand-closed seat put it back in a crew band

**Fixed in `packages/supabase/src/hooks/use-coordination.ts`.**

`SEAT_STAGES_PAST_THE_BID` omits `off_job` by design so `withdrawn` can reach past it, and neither
r19's guard on the stamp nor r18's guard on the clear constrains the STAGE write. The editor is
offered on a hand-closed seat ("Change what came back"), so: close with the reason "Picked another
electrician" → record "Selected" → stage `awarded` written, `off_job_at` and the reason standing.
The row then read the word **Awarded** beside its own "Off the job 10 Sep 2026. Picked another
electrician."; the person card listed it as a LIVE seat and offered Close this seat while the Call
Sheet HELD that act on the same seat; `useProjectHousehold`'s filter counted it closed.

`bidStageOutcome` now folds a hand-close into `pastTheBid`, through a new exported predicate:

```ts
seatClosedByHand({ bidOutcome, offJobAt, offJobReason })
//   a date stands, AND (the outcome is not 'withdrawn'  — no withdrawal can have written it
//                       OR a reason stands beside it    — which the withdrawal never writes)
```

`offJobReason` joins `offJobAt` on `SetPartyBidInput['previous']`, and `roster-row.tsx` passes it
on both sides — the write and the consequence sentence read the same object, so the face never
promises a band move the write will not make.

**Measured:** vitest — `bidStageOutcome` on a hand-closed seat returns `pastTheBid` true and
`stage: null` for "Selected"; on a withdrawal-dated seat it still returns `pastTheBid` false and
`stage: 'bidding'`, so **R-BR is untouched**. `seatClosedByHand`'s four-case truth table is pinned.

---

## r21-major-4 — a correction away from "They withdrew" NULLed a day and a reason the withdrawal never wrote

**Fixed in the same branch.**

r19's `!previous.offJobAt` guard means recording "They withdrew" on a hand-closed seat writes no
date; the clearing branch below had no matching guard, so three presses (close with a reason →
"They withdrew" → "They quoted") NULLed `off_job_at` **and** the studio's own sentence — a sentence
nothing else in the room holds a copy of, with no audit row, under a consequence sentence promising
only the move to Bidding.

The branch now reads `&& !seatClosedByHand(previous)`, so it clears only what the withdrawal itself
put there — R-BR's own scope, stated in the comment. (With the major-3 fix the branch is also
unreachable on that population, because `written.stage` is null there; both guards are kept, since
the two findings are separate rules.)

**Measured:** vitest — the three-press population writes `bid_outcome` alone, with neither
`off_job_at` nor `off_job_reason` in the patch; the genuine R-BR population still writes
`stage: 'bidding'` with both columns nulled.

**Residue, declared:** a hand close taken with NO reason typed is indistinguishable from a
withdrawal's own record once "They withdrew" is recorded on it, and stays inside R-BR. Nothing is
destroyed there — there is no sentence to destroy — but the recorded DAY can still be cleared.
Discriminating that population needs a column the room does not have.

---

## r21-MAJOR-3 — `w3-data-report.md` described a six-migration wave and never named 00634

**Fixed in `artifacts/people-room-crm-2026-09-11/build/w3-data-report.md`.** Every figure below
re-measured at HEAD on 2026-09-15 against the freshly reset local database; the round is now stated
in the file beside the figures a later round can move.

| § | Was | Now (measured) |
|---|---|---|
| §0 heading + table | "The six migrations", `00628–00633` | "The seven migrations", `00628–00634`, with 00634's own row naming the trigger, the gate and the R-BS clamp |
| §0 | "12 blocks as of r7" | **21 numbered blocks as of r21**, enumerated, **13f last** |
| §1 | "Eleven, not eight" refusals | **fourteen distinct tokens** (sixteen `RAISE EXCEPTION` sites), the three seat refusals named |
| §1 | `people_directory` "plus one line" | **two** deltas, both cited at `00629:2716-2718`; §7/§10.1's argument settled — the TEAM tenant leg shipped |
| §2 | "33 papers in total" | **36** (`count(*)`; the four-way breakdown 9/24/2/1 was already right) |
| §2 | Lakeshore `lapses_soon` 2026-10-06 | **2026-10-08** (the seed's dates are relative) |
| §4 | no `source_household_id` anywhere (0 hits) | added to the Objects table with its FK, index and r16 MAJOR-1 lineage |
| §8 | "301 insertions"; "+168 lines (2752 replayed statements)" | **no diff** on `database.types.ts`; **no diff** on `00-legacy-grants.sql`, "baseline + **2767** replayed statements"; plus a 00634 trigger row read back from `pg_get_triggerdef`, the admin-portal build row, and the corrected block counts |
| §9 | RPC/trigger lists | `contact_rule_blocks_contact()` added to the RPC list (with r21-n2's caveat carried); `project_parties_touch_updated_at()` and `end_party_authority_at_seat_close()` added to the trigger-function list, the latter noted as the wave's one definer trigger that states its gate in its own body |
| §10.6 | "the sweep has never run against the seeded book" | corrected — it has; re-measured here as `{"scanned":3,"notices":3,"notified":6}` then `{"scanned":3,"notices":0,"notified":0}`, so §2's table is a measurement and not a projection |

---

## r21-major-5 — `w3-room-report.md` §1 and §9 stale at HEAD, the sixth filing

**Fixed in `artifacts/people-room-crm-2026-09-11/build/w3-room-report.md`.** Every §1 count
re-measured file by file at HEAD, each file run alone; §9's four figures re-run whole.

| Claim | Was | Now |
|---|---|---|
| §1 `people-crm-w3.test.ts` | 45 | **66** |
| §1 `roster-row.test.tsx` | 26 → 50 | 26 → **56** |
| §1 `close-seat-act.test.tsx` | 6 | **9** |
| §1 `write-error.test.ts` | not listed | **6**, listed |
| §9 `people-crm-w3.test.ts` | 45 passed (r19) | **66 passed** (r21) |
| §9 `npx jest` whole | 594 suites / 7693 tests (r19) | **594 suites / 7705 tests** (r21) |
| §9 `npx vitest run` whole | 106 files / 1355 passed (r19) | **106 files / 1376 passed, 12 skipped** (r21) |
| §9 "Block 13d is the last" | — | **13f is the last** (r21) |

Every other §1 count re-measured **unchanged** and correct: `bring-forward` 17 ·
`compliance-notice` 10 · `travel-list-pane` 5 · `compare-merge-sheet` 17 · `household-band` 45 ·
`archive-card-door` 8 · `rolodex-picker` 38 · `doc-sheet` 10 · `use-project-authority` 3.

§1 and §9 now both state the round at which they were measured.

---

## Gates run this round

| Gate | Result |
|---|---|
| `pnpm --dir … supabase:reset` | clean — "Finished supabase db reset on branch main." |
| `supabase/tests/people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `supabase/tests/people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." |
| `supabase/tests/people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed", **13f last** |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** |
| `python3 scripts/generate-legacy-grants.py` | **no diff** — baseline + 2767 replayed statements |
| `pnpm --filter @patina/supabase type-check` | clean |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/admin-portal build` | clean, full route table printed |
| `cd apps/designer-portal && npx jest` | **594 suites, 7705 tests, 1 snapshot, all green** |
| `cd packages/supabase && npx vitest run` | **106 files, 1376 passed, 12 skipped** |
| migration numbering | nothing minted; `00634` amended in place, still above `00627` and outside the reserved `00595–00620` |

No prod. No server started. No port taken. No `.env.local` created.
