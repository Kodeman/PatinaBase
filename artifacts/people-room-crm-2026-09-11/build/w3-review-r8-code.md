# W3 (P2) — adversarial code review, round 8

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `e9879caeb` ("W3 round-7"). Working tree CLEAN
(`git status --porcelain` empty). Range read in full: `47282a2c6~1..HEAD` over
`apps/designer-portal/src` and `packages/supabase/src` — 45 files, 8172 insertions.

Local Postgres only. No prod. No server started, no port taken, no migration minted, no
Playwright run.

**Verdict: NOT clean — 1 blocking, 1 major, 5 minor.**

---

## 0. Gates, re-run by this review

| Gate | Result |
|---|---|
| `pnpm --filter @patina/supabase type-check` | rc=0, no output |
| `pnpm --filter designer-portal type-check` | rc=0, no output |
| `pnpm --filter admin-portal build` | **rc=0**, full route table printed |
| `apps/designer-portal && npx jest src/components/document/people src/components/document/roster src/lib/document/__tests__` | **147 suites, 2893 tests, all green** |
| `apps/designer-portal && npx jest` (whole portal) | **593 suites, 7653 tests, 1 snapshot, all green** |
| `packages/supabase && npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` | **28 passed** |
| `packages/supabase && npx vitest run` (whole package) | **105 files, 1334 passed, 12 skipped** |
| `packages/supabase` dist | none — `package.json` `main`/`exports` point at `./src/*`; nothing to stale (the report's claim holds) |

Every r7 fix is present on disk and verified:

| r7 finding | Verified at |
|---|---|
| B-1 (firm designations carry) | `00629:1562-1570` (three COALESCE/NULLIF columns) + `compare-merge-sheet.tsx:203-208` (three name-resolved rows) |
| M-1 (six legs gated on `v_retiring`) | `00629:734, 740-744, 773, 795, 834, 844` — all six carry `v_retiring AND` |
| M-2 (affiliation stand-down) | `00629:1004` — `merged_into IS NOT NULL` disjunct re-issued |
| M-3 (TEAM branch assertion) | `w1b_compliance_authority_directory_test.sql:768, 2426` — `role <> 'contact'` restored |
| R7-BLOCKING-1 (`previous` on the bid write) | `use-coordination.ts:2191-2206, 2477-2488` — **fixed, and is the source of BLOCKING-1 below** |
| R7-MAJOR-1 (`firmNameOf`) | `compare-merge-sheet.tsx:301-305` |
| R7-MAJOR-2 (`tradesOfCard`) | `rolodex-picker.tsx:107-120, 325, 522` |
| R7-MAJOR-3 (`householdAddIsHeld`) | `household-band.tsx:187-193, 671-674`; mirrors `00632:387-399` exactly |
| R7-MAJOR-4 (`data-bid-error`) | `roster-row.tsx:889-896` — `role="alert"`, announcer untouched |

Contract checks the brief names, all PASSING:

- **Travel list writes only the allowed facts.** `useBringForward`'s INSERT
  (`use-coordination.ts:2600-2612`) names `project_id, party_kind, display_name,
  company_name, company_id, trade, phone, email, studio_contact_id` and nothing else — no
  pricing column, no notes column, no `show_to_client`, no bid column.
- **Consent never copied per seat.** `grep` over `use-coordination.ts` / `use-households.ts`
  finds no write to any `sms_consent_*` column; `record_channel_consent` is called from
  `use-consent.ts:297` alone. R-AY holds.
- **Every hard delete replaced.** `grep "\.delete()"` over `apps/designer-portal/src` and
  `packages/supabase/src` returns exactly one seat delete —
  `use-coordination.ts:992`, behind `seatDeleteRefusal`, now widened with the eight bid
  columns (`:946-951`) — reached from exactly one call site,
  `roster-row.tsx:982` "Added by mistake". No `studio_contacts` delete anywhere; archive
  and restore go through `archive_studio_contact()` / `restore_studio_contact()`.
- **No trade or homeowner writing surface.** Every new write door is designer-portal-only.
- **Cross-tenant.** `client_households` RLS (`00632:224-265`) gates SELECT/INSERT/UPDATE on
  `is_active_studio_member(organization_id) AND is_studio_comember(designer_id)`, and
  `member_person_ids` are studio-scoped card ids, so `useProjectHousehold`'s unfiltered
  `.overlaps(...)` (`use-households.ts:308-312`) cannot reach another studio's row. No hole.
- **Document grammar.** Zero `shadow` / `box-shadow` in any new or changed component.
  Both token families used (`--ink*` on the people surface, `--color-*` on the roster
  surface) resolve at bare `:root` (`globals.css:1976-2002`); each file matches the surface
  it sits on. `t-body-sm` / `.t-*` used on the people surface as its siblings do.
- **DocSheet.** The two sheets this wave adds or changes are DocSheets
  (`compare-merge-sheet.tsx:455`, `rolodex-picker.tsx:757`); the bid editor, the household
  band and `CloseSeatAct` are inline regions, correctly not sheets.
- **Playwright.** `e2e/people/merge.spec.ts` and `e2e/people/bring-forward.spec.ts` are
  chromium-pinned (`test.skip(({browserName}) => browserName !== "chromium")`), assert
  through `expect.poll` over `e2e/helpers/supabase-admin.ts`, use web-first `expect`, and
  clean up in `afterAll`. Not run, per the brief.
- **Hooks above early returns.** `HouseholdBand`'s eleven hooks all precede
  `if (!household)` at `:386`; `CloseSeatAct`'s four precede `if (!confirming)` at `:59`;
  `CompareMergeSheet` and `RolodexPicker` have no early return.

---

## BLOCKING-1 — the bid editor promises a stage move the write no longer makes, and a losing bidder can stay banded as crew

**Confidence: high.** Reproduced by reading; the two halves are eleven lines apart in two files.

**Where:** `apps/designer-portal/src/components/document/roster/roster-row.tsx:853-857`
against `packages/supabase/src/hooks/use-coordination.ts:2477-2488`.

The editor prints, above the act:

```
Recording this moves ${row.name} to ${SEAT_BID_OUTCOME_LABELS[bidDraft.outcome]}.
A bidder who did not win never reads as crew.
```

r7 BLOCKING-1 then taught `useSetPartyBid` to write `stage` under **two** conditions the
sentence knows nothing about:

```ts
const moved = (patch.bidOutcome ?? null) !== (previous.bidOutcome ?? null);
if (patch.bidOutcome && moved) {
  const pastTheBid = SEAT_STAGES_PAST_THE_BID.includes(previous.stage ?? '');
  if (!pastTheBid || patch.bidOutcome === 'withdrawn') {
    dbPatch.stage = nextStage;
  }
```

Two reachable states where the sentence is false:

1. **Every ordinary correction.** `openBidEditor` (`roster-row.tsx:837-849`) seeds
   `outcome` from the seat's EXISTING `bid_outcome`, so a studio changing "Who priced it"
   or "The number holds until" re-sends the same outcome. `moved` is false, no `stage` is
   written — and the face has just said "Recording this moves Northgate Electric to
   Awarded." on a seat that is already `active`. The sentence claims a move on the most
   common press the editor takes.

2. **The correction that matters.** The editor is offered whenever
   `isSeat && (band === 'bidding' || hasBid)` (`roster-row.tsx:922`), and `hasBid` is
   `seatCarriesBid(bid)` — true for any seat carrying `bid_selected_at`, which is the
   ordinary history of every awarded sub that has since gone to work. On such a seat
   (`stage: 'mobilized' | 'active' | 'closeout' | 'warranty' | 'retired'`) changing the
   outcome to **They declined** or **No response** writes `bid_outcome` and **no stage at
   all**. The seat stays in a crew band while the record says the bidder lost — which is
   the single invariant §3.4 asks this band to keep, and which the sentence promises out
   loud in the same frame ("A bidder who did not win never reads as crew.").

The press leaves no trace the studio can read, either: `bidNote`
(`roster-derivation.ts:948-973`) prints Asked / Due / Quoted / Selected / Holds until /
Priced by and **never the outcome word**, and `SEAT_BID_OUTCOME_LABELS` is rendered on
exactly one face in the whole repo — this sentence (`grep` over `apps` + `packages`:
`roster-row.tsx:32, 855` and the export line only). So after the save the row reads
identically to before, in the same band, with `bid_outcome = 'declined'` written
underneath.

**Fix (either, not both):**
- Branch the sentence on the same two predicates the hook uses — export a small
  `bidStageOutcome(previous, next)` from `use-coordination.ts` so the face and the write
  read one answer, and say the true thing in the past-the-bid case ("Their stage stays on
  the job; this records only what came back."), or
- Hold the outcome select on a past-the-bid seat (leaving `withdrawn` live), with the
  reason beside it, and drop the move clause when `moved` is false.

Either way, add a jest case that opens the editor on a `stage: 'active'` row, leaves the
outcome unchanged, and asserts the sentence does not say "moves … to".

---

## MAJOR-1 — `w3-room-report.md` describes faces the code does not have

**Confidence: high.** Every quote below was compared against the shipped file.

**Where:** `artifacts/people-room-crm-2026-09-11/build/w3-room-report.md`.

The wave's own record is the pre-r2/r5/r6/r7 draft. r7 M-4 ruled exactly this shape MAJOR
for `w3-data-report.md`; the room report was never carried forward. A reader — Kody's prod
walk, the W7 deploy brief, the help drafts — takes the report as the description of the
face, and it disagrees with it in at least six places:

| Report says | The code prints |
|---|---|
| §2 — "…seats, channels, **contact rule, paper and firm designations** move onto Adaeze Okonkwo. … Chidi Okonkwo's card is kept as a record of the merge, **and both ways of reaching this person still work.**" | `compare-merge-sheet.tsx:96-130` — a six-clause sentence that branches on `survivorHasRule`, names "their own number and address", "the verdict, the trades, the notes and the payee facts", the supersede rule, and ends "**so an old link still opens this person.**" The quoted last clause was deliberately replaced (MAJOR-4 in that file's own comment). |
| §2 — "Each of `merge_studio_contacts()`'s **eight** refusals renders as a sentence" | `use-studio-contacts.ts:429-450` — **eleven** (`merge_survivor_archived`, `merge_two_logins`, `merge_contact_rule_conflict` added). The data report was corrected to eleven in r7; the room report was not. |
| §4 — "**The editor**: the answer was owed · how it came back · the number holds until · who priced it" (four fields) | `roster-row.tsx:930-1013` — **seven**: the studio asked, the answer was owed, how it came back, the number came back, the studio chose them, the number holds until, who priced it. |
| §7 — "'Northgate Electric's insurance **lapses in 30 days**, on 6 October 2026.'" | `compliance-notice.ts:76-78` — "`…lapses on 6 October 2026.`" M2R-1 removed the interval on purpose ("an interval beside a date is arithmetic, and arithmetic on a face has to be right"); the report still quotes the removed wording as the shipped one. |
| §9 — jest "592 suites, 7613 tests"; vitest "1323 passed"; §1 "`people-crm-w3.test.ts` (17)" | measured this round: **593 / 7653**, **1334 passed**, and that file holds **28**. |
| §5 — "the band therefore prints 'No household is on file…' with **Open a household** beside it" | `household-band.tsx:392-419` — on a job whose client side carries no card and no `designer_clients` row the act is `aria-disabled` with "Seat the client on this job first, then open the household." beside it (r3 MAJOR-2). The report describes the pre-fix door. |

**Fix:** carry `w3-room-report.md` forward against the shipped files the way the data report
was carried forward in r7 — §2's sentence and refusal count, §4's field list, §7's clause,
§5's door state, §9's gate numbers.

---

## MINOR-1 — one already-seated pick costs the studio the whole batch

**Confidence: high.**
**Where:** `apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:627-643`.

`addPicked` pre-checks every pick against `rosterHasIdentity` and, on the first hit,
`setError(...)` and `return`s — **nothing is written**. The consequence sentence a beat
above has just read "Adds four seats to the …", and the report's own §3 states the opposite
invariant ("One pick refused does not cost the others" — which is true of the DATABASE
refusal path at `:668-686`, and false of this one). On the seeded Okonkwo residence, where
Dana, Pete, Ingrid and Claire are already seated, this is the state the picker opens in.

The refusal names who, and unticking them recovers, so it is recoverable rather than lossy.

**Fix:** drop the already-seated rows from `picks`, write the rest, and fold their names
into the same sentence the DB-refusal branch composes — one shape for "these went on, these
did not".

## MINOR-2 — the picker's name search narrowed from the whole book to the first 200 cards, on a premise that is not true

**Confidence: high on the code fact; impact conditional on book size.**
**Where:** `rolodex-picker.tsx:263-272, 322-328` and `use-studio-contacts.ts:225-233`.

The picker stopped passing `search` to `useStudioContacts` and now filters in memory over
`scanned = contacts.slice(0, HISTORY_SCAN /* 200 */)`. The comment justifying it
(`:264-268`, repeated in report §3) says "the shipped picker asked PostgREST to filter by
name/company/email, so that search returned nothing" — **`useStudioContacts` never filtered
server-side by name**: `:225-233` runs the identical in-memory filter over the *whole*
fetched list. The real reason the job search failed is that the hook's filter has no
project names in it, which is correct and is what the change fixes; but the 200-card cap
that came with it also narrows the NAME search, which previously covered every card the
studio holds.

Owed item 6 frames this as "will not find a 201st card **by the job it worked**". It also
will not find them by name, firm or email. Today's seeded book is 49 cards, so nothing is
visibly broken.

**Fix:** run the name/firm/email leg over `contacts` and only the prior-job leg over
`scanned`, or state the real limit in owed item 6.

## MINOR-3 — a merge leaves two caches holding the pre-merge answer

**Confidence: high.**
**Where:** `packages/supabase/src/hooks/use-studio-contacts.ts:510-523`.

`merge_studio_contacts()` repoints `client_households.member_person_ids` and
`primary_member_person_id` (`00629:2023-2031`), and `resolve_merged_contact()` starts
answering differently for the folded id — but `useMergeStudioContacts`'s `onSuccess`
invalidates neither `clientHouseholdKeys.all` nor `resolvedContactKeys.all`. A Call Sheet
open in another tab keeps the pre-merge household membership until its own refetch, and a
`?person=<old id>` resolution cached before the merge answers the old id.

Ten keys are invalidated and the report's §2 list matches the code exactly; these two are
the ones neither knows about.

**Fix:** add both to the fan-out.

## MINOR-4 — the duplicate band stopped naming collisions it used to name

**Confidence: high.**
**Where:** `apps/designer-portal/src/lib/document/people-derivation.ts:1355-1366`.

M2R-6 replaced `if (directoryEntryIsLegacyClientRecord(row)) continue;` with
`if (row.role !== "contact") continue;`. That is right for the ACT (only two
`studio_contacts` ids can merge), but the band's first job per report §2 is *naming the
collision*: a `lead` row or a `team` row sharing a number with a card is now dropped
silently, where P1 printed "These two cards share a phone." for it. The studio loses a
warning rather than gaining a correct act.

**Fix:** if the collision is worth naming, keep the pair and render it without the
"Compare these two" control plus a sentence saying why (it is not a card yet); otherwise
record the narrowing as a deliberate ruling in `rulings.md` §3.

## MINOR-5 — `ComplianceNotice` does not carry `expires_on`, which 00630 made NOT NULL

**Confidence: high; no face effect today.**
**Where:** `packages/supabase/src/hooks/use-studio-contacts.ts:537-544` vs
`database.types.ts:25038-25046`.

The generated row type gained `expires_on: string` (r5 M-3, with
`UNIQUE (document_id, state, expires_on)`); the hand-written `ComplianceNotice` interface
did not. `select('*')` returns the column, so it is present at runtime and simply
untyped — and `noticedPaperClause` reads the DOCUMENT's `expires_on`
(`compliance-notice.ts:112, 121`), which is correct today only because
`clear_compliance_notices_on_date_change()` deletes a notice whose document's date moves.
The next reader that wants "the date the studio was told about" has no typed way to reach
it, and the invariant that makes the document's date safe lives in a trigger the type does
not mention.

**Fix:** add `expires_on: string` to the interface and a one-line comment naming the
trigger that keeps it equal to the document's.

---

## What this review did NOT do

No e2e run (the brief forbids taking a port this round). No migration was read beyond the
six spot-checks re-verifying r7's four data-lane findings. The 18 migration MINORs, the 11
code MINORs and the QA findings carried open from earlier rounds were not re-adjudicated.
Everything in `rulings.md` §3 and everything the reports scope to W4 was treated as settled
and is not reported above.
