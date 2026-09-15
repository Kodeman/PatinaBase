# W3 (P2) — fix log, round 19

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`.
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod touched. No server started. No port taken.** One migration minted — `00634`, above
00627 and clear of the reserved 00595–00620. 00629 is unapplied on Strata and was edited in
place (comment only).

Four findings were handed over; they are four distinct defects, filed by three reviews:

| Handed over | Distinct defect |
|---|---|
| `r19-major-1` (`00629:1692`, migrations review §2) | **1.** the refusal's own HINT names a repair that produces the contradiction the refusal exists to prevent |
| `MAJOR-1` (`rolodex-picker.tsx:849`, QA review) | **2.** the bring-forward picker's sheet head names no job, at either width |
| `r19-major-1` (`use-coordination.ts:2584`, code review) | **3.** a bid correction moves a date a hand-closed seat already carries |
| `r19-major-2` (`w3-room-report.md:67,69,72,396,397,398`) | **4.** the report's §1 test list and §9 gate table are stale at HEAD |

---

## 1. MAJOR — closing a seat did not end the money it carried, so the merge's own repair left two live figures on one job

`supabase/migrations/00634_seat_close_ends_authority.sql` (new) ·
`supabase/migrations/00629_studio_contact_merges.sql:1698-1710` (comment) ·
`apps/designer-portal/src/components/document/roster/use-project-authority.ts`

**Was.** `00629:1692-1697` justified `merge_seat_collision`'s OPEN-SEATS-ONLY carve-out with
"its grant was ended at the close". Nothing made that rule. `useCloseProjectPartySeat`
(`use-coordination.ts:856-883`) writes `stage`, `off_job_at`, `off_job_reason` and nothing
else; the only closer of a grant anywhere was `set_household_threshold()` (`00632:713-716`),
which runs only when somebody touches a household FIGURE and only over grants that household
sourced. An `agreement §4` grant had no closer at all. So the HINT's own repair — *"Close one
of these two seats first, then merge."* — left the closed seat's money grant **open**, the fold
went through, and the survivor came out holding two `client_rep` seats on one job with two open
money grants at two different figures: r18 MAJOR-1's own harm statement, reached by following
the refusal's own instruction.

**Now — shape (a) of the three the review left open: end the grant when the seat closes.**
One rule, not a merge-shaped exception; 00624's own shape for ending a delegation (CS5-24) and
verbatim `set_household_threshold()`'s formula:

```sql
CREATE TRIGGER end_party_authority_at_seat_close_trg
  AFTER UPDATE OF off_job_at ON public.project_parties
  FOR EACH ROW
  WHEN (OLD.off_job_at IS NULL AND NEW.off_job_at IS NOT NULL)
  EXECUTE FUNCTION public.end_party_authority_at_seat_close();
```

whose body sets `effective_to = GREATEST(effective_from, NEW.off_job_at)` on every open grant
the seat carried. The row keeps its record, its figure, its source clause and its dates; only
its OPENNESS ends, on the day the seat did — so R-BN ("a merge never deletes a typed fact")
and PR-n both stand, and it is the studio's own act of closing the seat that ends it, not the
fold. `SECURITY DEFINER`, `search_path` pinned to `public`, every relation schema-qualified,
`REVOKE ALL … FROM PUBLIC, anon, authenticated`. The file also carries a one-time, idempotent
backfill over seats already closed, with a NOTICE reporting what it ended and what remains.
R-BR's correction (a bid outcome moved away from `withdrawn`, which clears `off_job_at`)
deliberately does NOT re-open a grant: a delegation ends as a row.

`00629:1698-1710` now records that the carve-out's sentence is a rule **00634** makes, names
the trigger, and says not to widen the predicate without reading it.

**And the day of the close, on the face.** `useProjectAuthority`'s window is
`effective_to.is.null,effective_to.gte.<today>`, which keeps a grant through its last day in
force — right for a live seat, wrong for the one day a seat closed TODAY, which is the whole of
the repair path (the studio closes a duplicate seat in order to fold, and folds the same
minute). The hook now also reads `off_job_at` and drops a grant whose `effective_to` is set on
a seat that has left the job. A grant still OPEN on a closed seat is deliberately kept — that
is a state the room should show, not hide.

**Pinned.**
* `supabase/tests/people/w3_merge_sweep_household_test.sql`, block **13d** — the block the
  review names, with the fixture it names:
  * **13d-o / 13d-p** — the control pair's survivor seat is now seated OPEN carrying a $4,000
    `agreement §4` grant and closed *inside the block* by the three columns the room's own
    "Close this seat" writes; closing it leaves **0** open money grants on it, and the grant's
    `effective_to` is the day the seat left the job.
  * **13d-q** — the symmetric case the review names (the SURVIVOR's seat is the closed one):
    after the control fold the survivor holds **0** open money grants on that job **counting
    closed seats**.
  * **13d-r** — the assertion asked for by name: the same count as 13d-n **without** the
    `pp.off_job_at IS NULL` scope. It reads **1**; before 00634 it read 2.
  * **13d-s** — the retired figure is still on the book at 250000, ended on the day it closed
    (R-BN).
* `apps/designer-portal/src/components/document/roster/__tests__/use-project-authority.test.tsx`
  (new, 3 cases) — the day-of-close drop, the still-open grant on a closed seat that is kept,
  and a live seat's future-dated grant that is kept.

**Re-measured.** `probe-r19-a-closed-seat-two-figures.sql`, re-run verbatim on the freshly
reset database, one transaction, ROLLBACKed:

```
A-a  refusal merge_seat_collision | DETAIL Okonkwo residence · client_rep | HINT … Close one …
A-b  the room takes exactly that repair (the three columns useCloseProjectPartySeat writes)
A-c  seat 7d7ace38…  off_job_at 2026-09-15  money 250000  effective_to 2026-09-15   <- ENDED
A-d  the fold goes through: survivor f7d0…000a
A-e  f7e0…000a  client_rep  open    money 1000000  agreement §4                  effective_to (none)
     7d7ace38…  client_rep  closed  money  250000  client_households…            effective_to 2026-09-15
```

The second figure is no longer a present-tense fact: the record keeps it, ended on the day the
seat left, and the Call Sheet's reader drops it.

---

## 2. MAJOR — the bring-forward picker's sheet head named no job, at either width

`apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:849` ·
`apps/designer-portal/src/components/document/overlays/doc-sheet.tsx:161-176`

**Was.** SPEC §5.7 #2 requires the picker to be a DocSheet titled "From the rolodex" with the
eyebrow "OKONKWO RESIDENCE". The `DocSheet` call passed no `pageLabel`, so no eyebrow rendered
anywhere in the sheet at 1440 or 390 — QA's DOM search over `[role="dialog"]` found the sheet's
text opening `FROM THE ROLODEX\nCLOSE\nALL…` with the only "OKONKWO" in it being the person-row
surname "Adaeze Okonkwo". `projectName` already reached the component (threaded from
`call-sheet.tsx:280-289`) and was spent only on the consequence sentence and the consent
clauses.

**Now.** `pageLabel={projectName ?? undefined}` on the DocSheet call — the head's title line is
already `uppercase`, so the name is passed as the studio spells it. And the second half of the
finding: `DocSheetHead`'s page-label span was `hidden font-normal … sm:inline`, so **every**
sheet that names a page lost that name at 390 while SPEC §5.7 #9's rule is that the two widths
carry identical facts. The `hidden … sm:inline` pair is gone; the title line is already
`min-w-0 truncate`, so a long pair ellipses rather than pushing the put-back hint off the sheet.

**Pinned.** `rolodex-picker.test.tsx` — new case "names the job in the sheet head, at both
widths (SPEC §5.7 #2)": `[data-doc-sheet-page-label]` carries "Okonkwo residence", the title
line contains it, and the span does not carry `hidden`. `doc-sheet.test.tsx`'s own pin, which
asserted `toHaveClass('hidden', 'sm:inline')`, now asserts the opposite and that the segment
carries its text.

---

## 3. MAJOR — a bid correction moved the day a hand-closed seat had already left the job

`packages/supabase/src/hooks/use-coordination.ts` (`useSetPartyBid`, `SetPartyBidInput`) ·
`apps/designer-portal/src/components/document/roster/roster-row.tsx:533-540`

**Was.** r18 narrowed only the CLEARING branch (`previous.bidOutcome === 'withdrawn'`) and left
the STAMPING branch ungated on the same population: a seat the studio closed by hand still
carries its bid, so `seatCarriesBid` keeps the editor on the row ("Change what came back"), and
recording "They withdrew" a week later rewrote `off_job_at` to today —
`rosterWindowClause` then printing a closing date a week later than the record, beside the
studio's own untouched reason, with nothing anywhere holding the original: no audit row, no
second copy, and a consequence sentence that promises only the move to Off the job.

**Now.** `SetPartyBidInput.previous` carries `offJobAt?: string | null` (optional, so an older
call site cannot silently lose the guard's meaning — absent reads as "no date stands", the
pre-r19 behaviour), `roster-row.tsx` passes `row.offJobAt ?? null`, and the branch reads:

```ts
if (patch.bidOutcome === 'withdrawn' && written.moved && !previous.offJobAt) {
```

A date the room already holds is the record; this branch may only WRITE one, never move one.

**Pinned.** `packages/supabase/src/hooks/__tests__/people-crm-w3.test.ts` — two new cases:
"never moves a date the seat already carries (r19 major-1)" (`previous: { bidOutcome: 'quoted',
stage: 'off_job', offJobAt: '2026-09-10' }` → `off_job_at` and `off_job_reason` both undefined
in the patch, `bid_outcome` still written) and "still dates a withdrawal on a seat carrying no
date" (`offJobAt: null` → a date is written). `roster-row.test.tsx`'s two `previous` assertions
carry `offJobAt` too.

---

## 4. MAJOR — the report's §1 test list and §9 gate table were stale at HEAD

`artifacts/people-room-crm-2026-09-11/build/w3-room-report.md`

Fourth filing of the same defect (r7 M-4, r8 MAJOR-1, r15 MAJOR-3). Every count in §1 and §9
was re-measured this round, each file run alone, on the files as they stand after this round's
fixes; the "(re-measured in the r15 fix round)" parentheticals are gone and the paragraph now
says so and names the defect.

| §1 said | Measured now |
|---|---|
| `people-crm-w3.test.ts` (40) | **45** |
| `bring-forward.test.ts` (15) | **17** |
| `compliance-notice.test.ts` (10) | 10 |
| `travel-list-pane.test.tsx` (5) | 5 |
| `compare-merge-sheet.test.tsx` (17) | 17 |
| `household-band.test.tsx` (34) | **45** |
| `close-seat-act.test.tsx` (6) | 6 |
| `archive-card-door.test.tsx` (8) | 8 |
| `rolodex-picker.test.tsx` (15 → 37) | **15 → 38** |
| `roster-row.test.tsx` (26 → 49) | **26 → 50** |
| — | added: `overlays/doc-sheet.test.tsx` (10), `use-project-authority.test.tsx` (3, new) |

| §9 said | Measured now |
|---|---|
| designer-portal jest "593 suites, 7675 tests" | **594 suites, 7693 tests, 1 snapshot** |
| `packages/supabase` vitest "105 files, 1346 passed" | **106 files, 1355 passed, 12 skipped** |
| `people-crm-w3.test.ts` "40 passed" | **45 passed** |
| SQL suite "(block 12, the r15 closed-seat pin, is the last)" | **block 13d is the last**, after 13, 13b and 13c; block 12 is eight blocks from the end |

---

## Gates run after the fixes

| Gate | Result |
|---|---|
| `pnpm supabase:reset` (full replay + every seed) | rc=0, "Finished supabase db reset on branch main." — ledger head `20260910152111`, `00634`, `00633`, `00632`; `end_party_authority_at_seat_close_trg` present (1) |
| `people/w3_merge_sweep_household_test.sql` | rc=0 — **"W3 SQL suite: all blocks passed"**, 13d last |
| `people/w1a_identity_channels_consent_test.sql` | rc=0 — "All W1a assertions passed." |
| `people/w1b_compliance_authority_directory_test.sql` | rc=0 — "All W1b assertions passed." |
| `SUPABASE_DB_URL=… pnpm db:generate` | **no diff** in `packages/supabase/src/database.types.ts` (00634 adds no relation) |
| `python3 scripts/generate-legacy-grants.py` | re-run — **2767 replayed statements**, output matches the working tree exactly (00634's one REVOKE) |
| migration numbering | `00634` minted — above 00627, clear of the reserved 00595–00620; 00629 edited in place (comment only, unapplied on Strata) |
| `pnpm --filter @patina/supabase type-check` | clean |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/admin-portal build` (inline local env, no `.env.local`) | **rc=0**, full route table emitted |
| `packages/supabase` vitest, whole package | **106 files, 1355 passed, 12 skipped** |
| `packages/supabase` vitest, `people-crm-w3.test.ts` | **45 passed** |
| designer-portal jest, whole app | **594 suites, 7693 passed, 1 snapshot** |
| `npx eslint` over the four touched portal files + the new test | **0 errors, 0 warnings** |
| `probe-r19-a-closed-seat-two-figures.sql` re-run | A-c now reads `effective_to 2026-09-15` — the grant ends with its seat |

Nothing outside the four defects was changed. No flag, no schema column, no new RPC, no new
NestJS surface, no trade or homeowner writing surface, no consent read for a verdict (R-AY),
every tenant resolution still through `project_tenant_org()` (R-BD).
