# W3 (P2) — fix log, round 8

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
base `e9879caeb`. Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started. No port taken.** Migrations **00623**, **00629** and **00630**
edited in place (the 00621–00633 block is unapplied on Strata). **No migration minted** — nothing
here needs a number above 00633, and 00595–00620 stay reserved to the hour-tracking program.

Four findings handed back — two in the data lane (`B-1`, `M-1`), one in the designer portal
(`R8-BLOCKING-1`), one in the wave's own record (`R8-MAJOR-1`). All four closed; nothing else
changed. The rulings that govern them, all already on `rulings.md` §3: **R-BF** (transitive
supersession), **R-AZ**, **R-BA**, **R-BN** ("a merge never deletes a typed fact"), **R-AP**,
**PR-h**, **PR-o**, **R-G**, **R-K**, **R-AY**, **R-BE**, **R-BL**, **R-BM**.

---

## Gates, on a fresh database

| Gate | Result |
|---|---|
| `pnpm supabase:reset` (full replay + every seed) | rc=0, clean replay (the CLI telemetry `EPERM` again needed `dangerouslyDisableSandbox` — harness, not product) |
| `people/w3_merge_sweep_household_test.sql` (**block 11 widened + new block 11c**) | rc=0 — "11. the r7 review's three migration findings (B-1, M-1, M-2) and r8 M-1: passed", "11c. r8 B-1 — retyping a renewal no longer launders the lapse: passed", "W3 SQL suite: all blocks passed" |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." |
| `rls/people_directory_scope_test.sql` · `rls/studio_contacts_test.sql` · `rls/project_roster_test.sql` · `rls/anon_table_grant_narrowing_test.sql` | rc=0 each |
| `python3 scripts/generate-legacy-grants.py` | re-run — **no diff**. No GRANT or REVOKE changed this round (two function BODIES were re-issued inside the files that already grant them) |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** — no type drift (no column, table or function signature changed) |
| `pnpm --filter @patina/supabase type-check` | rc=0 |
| `pnpm --filter designer-portal type-check` | rc=0 |
| `pnpm --filter admin-portal build` | rc=0, full route table printed (the strictest gate after the shared `@patina/supabase` edit) |
| `cd apps/designer-portal && npx jest src/components/document/roster/__tests__/roster-row.test.tsx` | 40 passed (was 37 — three new r8 BLOCKING-1 cases) |
| `cd apps/designer-portal && npx jest` (whole portal) | **593 suites, 7656 tests, 1 snapshot, all green** |
| `cd packages/supabase && npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` | **29 passed** (was 28 — one new `bidStageOutcome` case) |
| `cd packages/supabase && npx vitest run` (whole package) | **105 files, 1335 passed, 12 skipped** |

No Playwright run and no dev server this round; no port was taken.

---

## B-1 — retyping a renewal laundered the lapse it retired

**Closed.** `supabase/migrations/00623_studio_compliance_documents.sql` (`compliance_state()`),
`supabase/migrations/00630_compliance_expiry_sweep.sql` (`compliance_document_state()`),
`supabase/migrations/00629_studio_contact_merges.sql` (§4c's banner claim).

### What was wrong

r9 and r10 of W1b moved two of `assert_compliance_holder()`'s three time-varying supersede legs
into the READER — the successor must still be in force, and must still carry the root's gates — and
left the third, `doc_type`, asserted only at the instant the edge is written. The trigger judges a
row against its OWN successor and never against the rows pointing AT it, so editing the
**successor's** `doc_type` was judged by nothing at all, and
`studio_compliance_documents_member_update` lets any active studio member do it in one PATCH.

The harm is PR-h's exact one: a firm card and its Directory firm row print `current` (R-G, R-K) over
a firm holding no in-force general-liability certificate, the roster row loses its held clause, and
`compliance_document_state()` answers `superseded`, so `sweep_compliance_expiries()` CONTINUEs past
the row and direction §8 P2's "a lapse announces itself before it blocks a draw" is switched off for
that document forever.

### What changed

The root's `doc_type` now rides the recursive walk beside its `blocks`, and the retirement asks for
it:

- `compliance_state()` — `chain(root, root_blocks, root_doc_type, succ, depth)`, and the `retired`
  CTE gains `AND s.doc_type = c.root_doc_type`.
- `compliance_document_state()` — `me` now selects `d.doc_type`, and the `retired` CTE gains
  `AND s.doc_type = m.doc_type`.

It cannot reject a legitimate chain: `compliance_successor_wrong_type` already holds every edge to
one paper at write time, and the row was already being read. Both banners and both `COMMENT`s state
the third leg beside the other two.

`00629:657-667` claimed in writing that R-BF re-reckons a chain whose head "changed type". It now
says what is true after this fix — the reader re-reckons all three facts an ordinary member edit can
move (in force, gates, paper) — and names the three legs that are NOT re-reckoned, because they
judge the SHAPE of the edge rather than the state of the successor (a dated row's successor must be
dated, must end no earlier, and must stand at the head of its own chain), each written by CHANGING
`superseded_by`, which is exactly what `v_retiring` names. The one edit that would outrun the reader
(clearing a dated successor's date) is refused outright by
`studio_compliance_documents_dated_expiry_check`.

### Measured

New suite block **11c**, on a fresh seeded database, as an ordinary studio member, in the
transaction the suite rolls back:

```
firm holds  coi_gl  CURRENT_DATE-40   {site_access,draw}   (the lapse)
            coi_gl  CURRENT_DATE+300  {site_access,draw}   (the renewal)
before                                   compliance_state -> lapsed
write 1  point the lapse at the renewal  compliance_state -> current      (legitimate)
write 2  UPDATE ... SET doc_type='w9'    compliance_state -> lapsed       (was: current)
         on the RENEWAL                  compliance_document_state(lapse) -> lapsed (was: superseded)
control  put doc_type back to coi_gl     compliance_state -> current
                                         compliance_document_state(lapse) -> superseded
```

And the same two rows read by the PRE-FIX formula beside the shipped one, to show the leg is what
moved the answer (`artifacts/people-room-crm-2026-09-11/build/probe45-r8-b1-doctype.sql`, one
transaction, ROLLBACKed, probe function in `pg_temp`):

```
 pre_fix_word | shipped_word | lapse_state | in_force_coi
--------------+--------------+-------------+--------------
 current      | lapsed       | lapsed      |            0
```

Zero in-force general-liability certificates on the card, and the pre-fix body still said `current`.

The negative control in block 11c is the point of the leg: a legitimate same-paper chain still
retires, so nothing that renews honestly is newly counted. W1b's own 26-block compliance suite is
green on a fresh database, which is the wider control.

---

## M-1 — a person-to-person merge aborted with `designated_person_is_self`

**Closed.** `supabase/migrations/00629_studio_contact_merges.sql:1926-1934` (now the NULLIF block),
plus the new case in suite block 11.

### What was wrong

The three statements that repoint the designations **other cards** hold naming the merged person
carried no guard against the SURVIVOR being one of those other cards. When it was, the statement
wrote `S.signer_person_id = S` and `assert_studio_contact_designations()` (00592 / R-AP) raised
`designated_person_is_self` — the whole merge lost, with a raw schema token naming nothing the
studio did.

r7 B-1 is what made it reachable. Before it, only `company-card.tsx` wrote these three
(`use-studio-contacts.ts:361-365`) and that sheet opens firm cards only, so no person card could
hold one; r7's COALESCE (`00629:1562-1570`) now lands a folded firm's paperwork contact and signer
on a PERSON survivor in a sole-proprietor fold. Folding that designated person into the same
survivor a moment later — both acts the room offers — hit the statement. And there was no repair:
`person-profile.tsx` neither reads nor writes those columns, so the studio could not clear the
pointer that was refusing the merge, and the pair could never be folded. That closed loop is r6
M-1's own argument.

### What changed

The fold ANSWERS the designation rather than carrying it, exactly as r6 M-1 answers a route: after
the merge the designated person IS the survivor, and a person is not their own signer, so the
pointer is dropped where it would become a self reference and carried everywhere else —
`SET <col> = NULLIF(p_survivor, id)` on all three statements. The same idiom §5 uses three hundred
lines above.

R-BN holds: nothing is deleted, because §5's COALESCE only ever writes these three ONTO the survivor
and never moves them off the folded card, which keeps its own copy. The banner above the block says
all of this, including why the path is new.

### Measured

New case in suite block 11, continuing the fixture r7 B-1 built (the sole-proprietor fold has just
landed `paperwork_contact_person_id = R7 Paperwork Hand` on the PERSON card R7 Sole Prop):

```
merge_studio_contacts(R7 Sole Prop, R7 Paperwork Hand, 'manual')
  -> returns (was: ERROR designated_person_is_self)
  -> survivor.paperwork_contact_person_id IS NULL          (the self reference dropped)
  -> R7 Marrow & Sons.paperwork_contact_person_id = survivor (a third card still repoints)
  -> resolve_merged_contact(folded) = survivor              (PR-o: both ids stay resolvable)
```

---

## R8-BLOCKING-1 — the bid editor promised a stage move the write no longer makes

**Closed.** `packages/supabase/src/hooks/use-coordination.ts`,
`packages/supabase/src/hooks/index.ts`,
`apps/designer-portal/src/components/document/roster/roster-row.tsx`, plus four jest mock factories
and two suites.

### What was wrong

r7 BLOCKING-1 taught `useSetPartyBid` to write `stage` only when the outcome actually CHANGED and
the seat is not already past the bid (`mobilized`, `active`, `closeout`, `warranty`, `retired`,
`withdrawn` excepted). The editor's consequence sentence knew none of that and said
"Recording this moves &lt;name&gt; to &lt;Outcome&gt;. A bidder who did not win never reads as
crew." whenever an outcome was selected. Two reachable presses make that false: every ordinary
correction (the editor seeds `outcome` from the seat's existing `bid_outcome`, so fixing "Who priced
it" re-sends it unchanged and no stage is written), and a `declined` / `no_response` answer recorded
against a seat already past the bid, where the stage deliberately stays put. `bidNote` prints no
outcome word and `SEAT_BID_OUTCOME_LABELS` is rendered on exactly one face in the repo — this
sentence — so the press left no readable trace either.

### What changed

One answer, read by both halves. `bidStageOutcome(previous, next)` is exported from
`use-coordination.ts` (and from `packages/supabase/src/hooks/index.ts`, with its `BidStageOutcome`
type) and returns `{ outcome, moved, pastTheBid, stage }`. `useSetPartyBid` now writes
`dbPatch.stage` from `written.stage` and dates `off_job_at` only on a real transition into
`withdrawn`; `roster-row.tsx` derives `bidSentence` from the same call. Three sentences, one per
thing the press can do:

| State | Sentence |
|---|---|
| the write moves the seat | "Recording this moves &lt;name&gt; to &lt;Outcome&gt;. A bidder who did not win never reads as crew." |
| outcome changed, seat past the bid | "This seat is past the bidding, so its stage stays where it is. Recording this writes what came back, and nothing else." |
| outcome unchanged | "The outcome is unchanged, so nothing moves. This records the dates and who priced it." |
| no outcome selected | unchanged — "The outcome is what moves them out of the bidding band. Nothing else on this row does." |

The outcome select stays live on a past-the-bid seat (the finding's second option was an
alternative, not a companion): correcting a mis-picked outcome from anywhere in the portal is what
MAJOR-7 opened that door for, and closing it would re-make the one-way door.

### Measured

Three new jest cases in `roster-row.test.tsx`, the first being the one the finding names:

- `stage: 'active'`, outcome left unchanged, "Who priced it" edited → the editor's text does not
  match `/moves Rivera Finishes to/`, and the unchanged sentence prints.
- `stage: 'active'`, outcome changed to `declined` → no "moves … to", no "never reads as crew", and
  the past-the-bidding sentence prints.
- `stage: 'active'`, outcome changed to `withdrawn` → the move sentence still prints, because the
  write still moves the seat to `off_job`.

One new vitest case in `people-crm-w3.test.ts` pins the helper itself against the four shapes, and
the five existing `useSetPartyBid` cases still pass unchanged — the hook's behaviour did not move,
only where its two predicates live.

`bidStageOutcome` was added to the four jest mock factories that render a roster row
(`roster-row`, `call-sheet`, `call-sheet-mount`, `project-roster-surfaces`), because the component
calls it in its body.

---

## R8-MAJOR-1 — the wave's own record described faces the code does not have

**Closed.** `artifacts/people-room-crm-2026-09-11/build/w3-room-report.md`, carried forward against
the shipped files the way `w3-data-report.md` was carried forward in r7 (that round's M-4), with a
note at the head saying so.

| Section | Was | Now |
|---|---|---|
| §1 Tests | per-file counts from the first draft (`people-crm-w3.test.ts` 17, `roster-row` 26 → 35, …) | measured this round: 29 · 15 · 9 · 5 · 15 · 29 · 6 · 8, `rolodex-picker` 15 → 35, `roster-row` 26 → 40 |
| §2 sheet fields | "Nine fields, two columns" | the nine, plus the fifteen carried facts the sheet prints wherever either card holds one (r5 B-1 / r6 M-4 / r7 B-1, R-BN) |
| §2 consequence sentence | the pre-r3/r4/r5 quote ending "both ways of reaching this person still work" | the shipped six-clause sentence, its `survivorHasRule` branch, and the closing clause "so an old link still opens this person" (MAJOR-4 replaced the old one on purpose) |
| §2 refusals | "eight refusals" | **eleven**, naming the three added in r4 and r5 |
| §4 the editor | "Bidding band only", four fields | offered on any seat that carries a bid, **seven** fields, named |
| §4 the stage | "the outcome IS the stage", unqualified | the two guards (r7 BLOCKING-1) and the one answer both halves now read (r8 BLOCKING-1), with the three sentences |
| §4 bid refusals | "four refusals" | six (`asBidError`) |
| §5 the household door | an ungated "Open a household" | `aria-disabled` with "Seat the client on this job first, then open the household." beside it (r3 MAJOR-2) |
| §7 the notice clause | "lapses in 30 days, on 6 October 2026" | "lapses on 6 October 2026" — M2R-1 removed the interval on purpose, and the report now says why |
| §9 gates | 592 / 7613 · vitest 1323 | **593 / 7656 · vitest 1335**, plus the two per-file gates and the SQL suite row |

---

## What this round did NOT touch

The 21 migration MINORs and the 5 code MINORs the r8 reviews carried open were **not** addressed —
the brief names four findings and forbids anything else. Nothing in `rulings.md` was amended: every
fix above lands inside a ruling that already stands (R-BF, R-AP, R-BN, PR-h, PR-o). No prod
mutation, no flag, no deploy.
