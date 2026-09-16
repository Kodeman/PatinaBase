# W3 fix log — round 15

Five findings from `w3-review-r15-migrations.md` / `-qa.md` / `-code.md`, closed.
Two of them (`r15-major-1` and `r15-qa-major-1`) are the same defect filed twice, so they
are closed by one change. Nothing else touched. Seven files in the working tree:

```
supabase/migrations/00632_client_households.sql
supabase/tests/people/w3_merge_sweep_household_test.sql
packages/supabase/src/hooks/use-coordination.ts
packages/supabase/src/hooks/__tests__/people-crm-w3.test.ts
apps/designer-portal/src/components/document/roster/roster-row.tsx
apps/designer-portal/src/components/document/roster/__tests__/roster-row.test.tsx
apps/designer-portal/src/components/document/people/close-seat-act.tsx
artifacts/people-room-crm-2026-09-11/build/w3-room-report.md
```

No migration was minted: `00632` is unapplied on Strata and was edited in place, which the
brief permits. No prod contact, no server started, no port taken.

---

## r15-major-1 + r15-qa-major-1 (major, one defect) — the household stops touching a closed seat

`add_household_member()` found its seat by `project_id + studio_contact_id + party_kind`,
`ORDER BY created_at LIMIT 1` — the OLDEST row, which is exactly the row the studio closed
with "Close this seat". So the act opened no seat, and then wrote the household's `money`
grant onto that closed row with `effective_to` NULL. The Client side band is assembled
before the window rule (`callSheetProjection()`), so the row printed "Signs money to
$2,500." as live authority over a record saying the person left the job.
`set_household_threshold()`'s grant loop had the identical omission, so raising the figure
GREW a live authority on a closed seat.

**Fixed, three places.**

1. `00632:364-370+` — the seat lookup gains `AND pp.off_job_at IS NULL`, so a closed seat is
   left closed and a new one is opened, which is what the RPC's own COMMENT already promised
   ("opens (or finds) that member's seat on the job"). The COMMENT now says so explicitly.

2. `00632`'s `set_household_threshold()` loop — **the decision the finding left open.** The
   loop now reads `pp.off_job_at` and, where a grant stands on a closed seat, **ENDS it with
   `effective_to = GREATEST(effective_from, off_job_at)`** rather than moving the figure onto
   it. Of the two answers offered (skip the row, or close it) this takes 00624's own shape for
   ending a delegation — *"Delegations end (CS5-24). A delegation during travel is a row, not
   an edit"* — and it is the same branch the NULL-figure case already used two lines below.
   Skipping would have left the household named as the source of an open grant the household
   may no longer move: the same two-contradictory-facts harm one column over, and the exact
   thing the function's own banner exists to close. The row keeps its record and its dates;
   only its openness ends, on the day the seat did.

3. **The face half of the finding** (`roster-row.tsx:107-116`, named in both claims: *"with no
   off-job clause on that band"*). `rosterWindowClause()` printed "Off the job &lt;date&gt;."
   only when `band === 'done'`, and a `client` / `client_rep` seat never reaches that band. It
   now composes the clause from the ROW'S OWN record (`offJobAt` / `offJobReason`) wherever the
   row is banded; a `done` row with no date behaves exactly as before. So the closed Client-side
   row carries its closing date beside whatever authority it still prints. **Flagged for the
   orchestrator**: this is not in either finding's `fix` field, which prescribed the two SQL
   guards only — it is in both findings' claims, and without it the QA walk's own symptom (close
   Dale Whitcomb's seat, watch "Signs money to $2,500." stand alone on an OFF THE JOB row)
   survives the SQL fix, because a seat closed AFTER its grant was written never passes through
   either RPC.

**Pinned.** `supabase/tests/people/w3_merge_sweep_household_test.sql` gains **block 12**, its own
`f9c…` id space, staging a closed `client_rep` seat on block 3's job:

```
12-b  add_household_member must NOT return the closed seat id
12-c  the card holds 2 client_rep seats on the job afterwards
12-d  the closed seat's own off_job_at is unmoved
12-e  the closed seat still carries exactly its original 1 money grant
12-f  the NEW seat's grant reads the household's figure
12-g  set_household_threshold moves the LIVE seat to 500000
12-h  the CLOSED seat's grant is no longer open
12-i  the closed seat's figure did NOT grow (still 250000)
12-j  zero open money grants survive on the closed seat
```

and a jest case in `roster-row.test.tsx` ("prints the off-job clause on a closed client-side
seat, beside its authority").

**Measured.**

*Negative control, before the reset* — block 12 run against the OLD function bodies:

```
ERROR: BLOCK 12 FAIL (12-b): add_household_member reused the CLOSED seat
       (f01bdfa3-45ce-4bb9-ad11-3c71c5ed9889) instead of opening one
```

*After `pnpm supabase:reset`* — the suite is green through block 12:

```
NOTICE: 12. r15 MAJOR-1 — a closed seat is left closed, a new seat is opened, and the grant
        standing on the closed one is ended rather than moved: passed
NOTICE: W3 SQL suite: all blocks passed
```

*The reviewer's own probe, re-run unchanged* (`probe-r15-a-closed-seat-household.sql`), which
read `A-c seats … now: 1` and `A-d MONEY GRANT ON A CLOSED SEAT … effective_to=<null>` when it
was filed:

```
A-a existing client_rep seats for this card on this job: 1 (all closed: 1)
A-b add_household_member returned seat a588cda3-5607-44b5-9d3d-7734c0d22230
    (the closed one is aa000000-0000-4000-8000-0000000000b1)
A-c seats for this card on this job now: 2
A-d grant on an open seat: threshold=250000
    source=client_households.co_threshold_cents seat_off_job_at=<null> effective_to=<null>
```

*Fix controls, including the negative one* (`probe-r15-e-fix-controls.sql`, ROLLBACKed):

```
E-a first add returned the OPEN seat it should reuse      ← the guard did not break reuse
E-b second add opened a NEW seat: yes
E-c live seat:   threshold=500000 effective_to=<null>
E-d closed seat: threshold=250000 effective_to=2026-09-15 off_job_at=2026-08-16
```

---

## r15-code-major-1 — the household band refetches when the seats under it move

`useProjectHousehold` is keyed `["client-households","project",projectId]` and its queryFn reads
`project_parties` and `project_party_authority`; no mutation that writes either table invalidated
it. With `staleTime` five minutes, `refetchOnWindowFocus: false` and the band mounted for the whole
visit, the held door ("Seat the client on this job first, then open the household.") could stand
over a client row two elements above, and the add sentence could promise the household's figure
over a foreign money grant `add_household_member()` deliberately leaves standing.

**Fixed** in `packages/supabase/src/hooks/use-coordination.ts`: one helper,
`invalidateClientHouseholds(queryClient)`, built on the exported `clientHouseholdKeys.all` root
(never a hand-typed literal), called in the `onSuccess` of exactly the six mutations the finding
names — `useAddProjectParty` (:588), `useUpdateProjectParty` (:755), `useCloseProjectPartySeat`
(:880), `useRemoveProjectParty` (:1028), `useSetPartyAuthority` (:2003), `useBringForward` (:2713).
A helper rather than six literals, as the finding suggested, so the six stay in step.

`useSetPartyBid` and `useRecordPartySmsConsent` were deliberately left alone: neither changes
`memberCardIds` nor an authority row, and neither is in the finding.

**Pinned** by a new `describe` block in `packages/supabase/src/hooks/__tests__/people-crm-w3.test.ts`
that drives each of the six hooks' `onSuccess` and asserts the `client-households` root appears in
the invalidated keys — six cases, one per mutation.

---

## r15-code-major-2 — the CloseSeatAct claim, corrected rather than made true

The report claimed "one component, two surfaces" and an invariant ("extracted so the wording, the
dated write and `peopleEvents.seatClosed` cannot drift"). Measured: `person-profile.tsx:65` is the
only importer; `roster-row.tsx` never imports it and keeps a complete second copy.

**Taken the finding's second option — amend the record — not the repoint.** The Call Sheet's copy
carries the surviving hard delete ("Added by mistake", held behind `seatDeleteRefusal`) inside the
same `DocumentActionRow`, uses its own surface/region analytics keys, and routes its refusal into
the sheet's `role="status"` announcer rather than a local `role="alert"`. Repointing it would mean
widening `CloseSeatAct` on all three axes — a refactor no finding asked for, in a round scoped to
the findings' own fixes. So:

- `w3-room-report.md` §1's file row now says the component serves the person card and the Call
  Sheet keeps the original.
- §6 states the two copies are hand-kept in step, and why.
- §10 gains item 9: the repoint, named as owed.
- `close-seat-act.tsx`'s header comment — which carried the same untrue invariant in code — now
  says the component is the person card's, names the Call Sheet's copy, and says a change to the
  wording, the write or the analytics belongs in BOTH files.
- `roster-row.tsx`'s `closing` block gains the matching comment, so a reader arriving from either
  side is told there are two.

---

## r15-code-major-3 — the report re-measured against HEAD

Every one of the eight items, re-measured in this round, plus the new §5/§6/§10 text above:

| Report | Was | Now (measured) |
|---|---|---|
| §1, `bring-forward.ts` exports | listed `carriedConsentNotice` | `countInWords`, `pickerHistoryLine`, `bringForwardSelectionLine`, `bringForwardActLabel`, `BringForwardRowFacts`, `bringForwardConsequence`; the deletion by r4 MAJOR-1 named |
| §2, the quoted consequence sentence | the pre-r11 string ("the verdict, the trades, the notes…") | the shipped string, with r11 BLOCKING-1's separate trades/specialties/sole-proprietor sentence |
| §2, refusal count | "eleven" | **thirteen** (`MERGE_REFUSAL_SENTENCES`, counted), the last two named |
| §1 test table | w3 29 · compliance-notice 9 · compare-merge 15 · household-band 29 · picker 35 · roster-row 40 | **40 · 10 · 17 · 34 · 37 · 49** (each file run alone; w3 and roster-row include this round's two new pins) |
| §9 gates | jest 7656 · vitest 1335 | **jest 593 suites / 7675 tests / 1 snapshot** · **vitest 105 files / 1346 passed / 12 skipped** |
| §9 | w3 vitest file "29 passed" | **40 passed** |
| §10 item 1 | "Neither Playwright spec has been run" | both ran green in r14 (3 passed, 15.6 s, chromium); the r15 QA round's wider `e2e/people` run recorded in §9 |
| §7 | Lakeshore "lapses_soon 2026-10-06" | the seed writes `CURRENT_DATE + 23`, so the report now states it **relative to the seed** and stops quoting a literal that drifts a day per day |

---

## Gates, this round

| Gate | Result |
|---|---|
| `pnpm supabase:reset` | clean replay, "Finished supabase db reset on branch main." |
| `psql … supabase/tests/people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed" (block 12 last) |
| `SUPABASE_DB_URL=… pnpm db:generate` | rc=0, **no diff** in `packages/supabase/src/database.types.ts` |
| `python3 scripts/generate-legacy-grants.py` | re-run, **no diff** (2766 replayed statements) — no GRANT/REVOKE changed |
| `pnpm --dir packages/supabase type-check` | exit 0, no output |
| `pnpm --dir apps/designer-portal type-check` | exit 0, no output |
| `pnpm --dir apps/admin-portal build` | **exit 0**, full route table printed |
| `cd apps/designer-portal && npx jest` | **593 suites, 7675 tests, 1 snapshot, all green** |
| `cd packages/supabase && npx vitest run` | **105 files, 1346 passed, 12 skipped** |
| the nine W3 jest files, run alone | 181 passed |
| migration numbering | none minted; `00632` edited in place (unapplied on Strata), nothing below 00621, nothing inside 00595–00620 |

No server was started, no port taken, no Playwright run; ports 3000 and 3002 untouched.

---

## Not done (named, not silently dropped)

- The thirteen minors in `w3-review-r15-code.md` §4 and the twenty-three in
  `w3-review-r15-migrations.md` §4 — out of this round's brief, which named five findings.
- The repoint of `roster-row.tsx`'s close block at `CloseSeatAct` (report §10 item 9).
- A grant is still not closed automatically when a seat is closed through the ordinary
  "Close this seat" act (that write is a plain PostgREST UPDATE, not an RPC). `set_household_threshold()`
  now repairs the household's own grants when the figure is touched, and the face carries the
  off-job date; a trigger that ends every authority row with its seat is a broader rule than any
  finding asked for and is a ruling for Fable.
