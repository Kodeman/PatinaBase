# W3 (P2) — adversarial code review, round 15

Scope: every changed file under `apps/designer-portal/src` and `packages/supabase/src` in
`e6aa10bdd..HEAD` (the W3 range; `e6aa10bdd` is W2's last commit), read in full, against
`build/w3-room-report.md`, the portal rules in the brief, and `rulings.md` §3.

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `3bcdf0d70`. Local DB only. Nothing was written to
Strata, no migration minted, no dev server started, no port taken.

**Verdict: NOT clean — 3 major, 10 minor, 0 blocking.**

---

## 0. Gates, re-run this round (not taken on trust)

| Gate | Measured |
|---|---|
| `pnpm --dir packages/supabase type-check` | exit 0, no output |
| `pnpm --dir apps/designer-portal type-check` | exit 0, no output |
| `pnpm --dir apps/admin-portal build` | exit 0, full route table printed |
| `cd apps/designer-portal && npx jest` | **593 suites, 7674 tests, 1 snapshot, all green** |
| `cd packages/supabase && npx vitest run` | **105 files, 1340 passed, 12 skipped** |
| `npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` | **34 passed** |
| `psql … supabase/tests/people/w3_merge_sweep_household_test.sql` | rc=0 — "W3 SQL suite: all blocks passed" (through block 11m-f) |
| Local `studio_compliance_notices` | 3 rows: Ostrom `lapsed` 2025-12-31, Northgate `lapsed` 2026-03-31, Lakeshore `lapses_soon` **2026-10-08** |

One environment note, not a finding: the FIRST `pnpm --dir packages/supabase type-check` of the
session reported `src/database.types.ts(30622,1): error TS1005`. A bare `npx tsc --noEmit` in the
same directory seconds later, and every subsequent run, was clean, and `git status` shows the file
unmodified against HEAD. Transient (a concurrent reader/writer on the shared checkout), not a
defect in the wave.

## 0b. r14 findings, re-checked

| r14 finding | State |
|---|---|
| `r14-mig-blocking-1` / `r14-blocking-1-sms-capable` — a fold destroyed `sms_capable` | **FIXED.** `00629:1713` carries `sms_capable = s.sms_capable OR u.merged_sms_capable` with `mc.sms_capable AS merged_sms_capable` at `:1730`; the SQL suite's block 10 pins it three ways and the whole suite is rc=0 here |
| `qa-r14-e2e` 1 — "Put back" strict-mode collision | **FIXED.** `e2e/people/bring-forward.spec.ts:281` addresses `[data-action-key="bring-forward-put-back"]` |
| `qa-r14-e2e` 2 — the folded name after a merge | **FIXED.** `merge.spec.ts:186-212` walks the DOM with `[data-people-announcer]` removed and then re-asserts on `/people?role=all&scope=studio` |
| `qa-r14-e2e` 3 — `people_directory_seats` read as the service role | **FIXED.** `bring-forward.spec.ts:242-253` polls through `psqlAsUserRow(DESIGNER, …)`; `e2e/helpers/psql.ts:99-117` returns the LAST row with the reason in the comment |

Both specs are chromium-pinned (`test.skip(({browserName}) => browserName !== "chromium", …)`),
carry no `networkidle` and no `waitForTimeout`, use web-first `expect(locator)` assertions and
`expect.poll` over `e2e/helpers/supabase-admin.ts` for every database read. They do not import
`e2e/utils/wait-helpers.ts`, but they never need to — no bare wait exists in either file. Neither
spec was RUN this round (no port taken, per the round's own instruction); r14's log records
3-for-3.

## 0c. Checks that came back clean

- **Travel list writes only the allowed facts.** `useBringForward`'s INSERT
  (`use-coordination.ts:2646-2656`) names exactly `project_id, party_kind, display_name,
  company_name, company_id, trade, phone, email, studio_contact_id`. No consent column, no bid
  column, no `show_to_client`, no notes, no pricing. `project_parties.show_to_client` defaults
  `false` and `sms_consent_status` defaults `'not_asked'` (measured on the local catalog), so the
  seat is born at PD-11's opt-in default. `phone` alone is written because `normalize_party_phone_e164()`
  (00281:117-139) derives `phone_e164`, which is the value `people_directory_seats.consent_status`
  keys on. `people-crm-w3.test.ts:475-490` sweeps the payload for the forbidden keys.
- **Consent is never copied per seat.** The whole W3 diff over `packages/supabase/src` and
  `apps/designer-portal/src` contains no added write to any `sms_consent_*` / `opt_out_*` column
  and no call to `record_channel_consent` outside the existing rail; the only hits are test
  fixtures and the forbidden-key sweep. R-AS / R-AY hold.
- **Merge survivor flip.** `preferredSurvivorId` (`compare-merge-sheet.tsx:64-72`) pre-picks the
  older card with an id tiebreak; the pre-pick effect (`:305-314`) is guarded by
  `if (survivorId || !left || !right) return`, so a refetch cannot undo a flip; both column heads
  are `aria-pressed` buttons (`:481-484`).
- **The merge consequence sentence is true of 00629.** Verdict / legal name / DBA / company kind /
  remit-to / retainage / tax id / W-9 / warranty / notes and the three designations are COALESCEd
  onto the survivor (`00629:1945-1985`); `trades`, `specialties` are UNIONed and
  `is_sole_proprietor` OR'd (`:1986-1987` and the §5 UNION), which is exactly the split the
  sentence and the `kept` column print. Thirteen refusals are mapped, the two that can name the
  job read `details`, and `asMergeError`'s bare-token guard (`use-studio-contacts.ts:2001`) keeps
  every foreign trigger token off the sheet.
- **"Close this seat" replaced every hard delete.** `grep` over `apps/` and `packages/` finds one
  `.delete()` on `project_parties` (`use-coordination.ts:992`, `useRemoveProjectParty`) with one
  call site (`roster-row.tsx:1083`, "Added by mistake") held behind `seatDeleteRefusal`, whose
  `hasBid` leg now reads the bid COLUMNS as well as `stage`. The person card's live-seat list
  (`person-profile.tsx:509-529`, over `liveSeats`) mounts `CloseSeatAct` — closed seats stay in
  "Past seats" and are offered no close act.
- **PR-n gating.** `householdAddIsHeld` (`household-band.tsx:219-225`) mirrors
  `add_household_member()`'s grant leg (`00632:389-401`) exactly; the two figure acts carry
  `aria-disabled` + `aria-describedby="household-figure-held"` with the reason paragraph rendered
  whether or not the act can be pressed (`:567-570, :631-639`); `HOUSEHOLD_REFUSAL_SENTENCES`
  translates both `household_grant_forbidden` and `household_threshold_forbidden`.
- **RLS / grants on the new read paths.** `client_households` (4 policies),
  `studio_compliance_notices` (member SELECT), `studio_contact_merges` (member SELECT) and
  `studio_compliance_documents` (4 policies) all have `relrowsecurity = t` on the local catalog.
  The hooks that read without an `organization_id` filter (`useComplianceDocumentsFor`,
  `useProjectHousehold`'s overlap) are bounded by those policies; no cross-tenant read or write
  was found, and the one cross-tenant write door (a seat stamped with another studio's card) is
  refused by 00624 and named in words by `write-error.ts:55-57`.
- **Document grammar.** No `box-shadow`, no `shadow-*`, no raw hex in any of the nine new or
  changed W3 surface files. The `rgba()` literals that remain (`roster-row.tsx:622/709/998/1232`,
  `party-mini-row.tsx:249-250`, `rolodex-picker.tsx:1161`) are all pre-W3 house idiom, unchanged
  by this wave. `--terracotta-ink`, `--ink-subtle`, `--rail`, `--hairline-strong`, `--paper` are
  all defined in `globals.css:1977-2002`.
- **DocSheet.** Both sheets this wave adds use it (`compare-merge-sheet.tsx:515`,
  `rolodex-picker.tsx:827`). `HouseholdBand`, `CloseSeatAct` and `ArchiveCardDoor` are inline
  bands and acts, not sheets.
- **Hooks above early returns.** `HouseholdBand`'s `if (!household) return` (`:433`) sits below
  every hook; `CloseSeatAct`'s `if (!confirming) return` (`:59`) below all four;
  `CompareMergeSheet` and `RolodexPicker` have no early return. `useComplianceNotices` in
  `roster-row.tsx:294-296` is called unconditionally with a null org rather than conditionally.
- **R-AS / R-AY / R-BE / R-BL / R-BM** — no code in this range contradicts any of them.

---

## 1. MAJOR — the household band goes stale against the seats it sits under, and can promise money the write will not make

**Confidence: high (code-verified end to end; not walked live).**

`useProjectHousehold` is keyed `["client-households", "project", projectId]`
(`packages/supabase/src/hooks/use-households.ts:218`) and its `queryFn` reads
`project_parties` (`:272-276`) and `project_party_authority` (`:308-312`) to produce
`memberCardIds`, `clientSideHasAuthority` and `clientSideMoneyGrants`.

**No mutation that writes either of those two tables invalidates that key.** Measured:

| Mutation | `onSuccess` invalidations | household key? |
|---|---|---|
| `useAddProjectParty` (`use-coordination.ts:461`) | `project-parties`, `project-roster`, `peopleKeys`, `peopleSeatKeys` | no |
| `useUpdateProjectParty` (`:646`, `:726`) | same four | no |
| `useCloseProjectPartySeat` (`:830`) | same four | no |
| `useRemoveProjectParty` (`:908`, `:997`) | same four | no |
| `useBringForward` (`:2636`, `:2678-2684`) | + `partyBidKeys` | no |
| `useSetPartyAuthority` (`:1920`, `:1966-1975`) | `partyAuthorityKeys.all`, `project-parties`, `project-roster`, `peopleSeatKeys` | no |

The portal's QueryClient runs `staleTime: 1000 * 60 * 5` with `refetchOnWindowFocus: false`
(`apps/designer-portal/src/lib/react-query.ts:177, :194`), and `HouseholdBand` stays mounted under
the Client side band for the whole visit (`roster-groups.tsx:226-233`). So the band reads a
five-minute-old answer to a question the studio has just changed on the same screen. Two reachable
faces:

**(a) The gated door contradicts the row above it.** `householdWouldBeFindable`
(`household-band.tsx:331-332`) is `memberCardIds.length > 0 || designerClientId`. On a job whose
client side is not yet seated the door renders `aria-disabled` with
"Seat the client on this job first, then open the household." (`:443-465`). The studio then seats
the client — from the rolodex picker's single Add (`useAddProjectParty`), from bring forward
(`client_rep` is in `DEFAULT_SCOPE_KINDS`, `rolodex-picker.tsx:128-139`), or by stamping an
existing seat with a card (`useUpdateProjectParty`) — and the Call Sheet row appears two elements
above while the band keeps the held door and keeps the sentence. A reload is the only way out.

**(b) The add sentence can promise the household's figure over a foreign grant that will stand.**
This is r10 BLOCKING-1's own defect, re-reachable through the cache.
`householdMemberConsequence`'s `foreign` branch (`household-band.tsx:197-207`) keys entirely on
`standingGrantForChoice`, which comes from the same stale `clientSideMoneyGrants`. Sequence, all
on one Call Sheet within five minutes: the studio records the agreement's money grant on Chidi's
`client_rep` seat (R-J's "Confirm from the agreement" → `useSetPartyAuthority`, which does not
invalidate the household key), then opens "Add a household member" and picks him as
`client_rep`. The band reads `clientSideMoneyGrants = []`, `foreign` is false, and the sentence
prints "They may sign money to $5,000." while `add_household_member()` (`00632:426-444`) reads the
seat's open money row, sees a `source_clause` that is not `client_households.co_threshold_cents`,
and leaves $2,500 exactly as the studio wrote it — over a Call Sheet row still printing
"Signs money to $2,500."

The r13 MAJOR-3 precedent is the same shape one wave over (a merge leaving `partyBidKeys` and
`clientHouseholdKeys` stale), and it was closed by adding the invalidations rather than by
shortening `staleTime`. Under the round's own rubric (b) is arguably a wrong fact on a face and so
blocking; it is filed major because it is cache-window-bounded, as r13 MAJOR-3 was.

**Fix.** Invalidate `clientHouseholdKeys.all` (which is the `["client-households"]` prefix, and so
reaches the project key) in the `onSuccess` of `useAddProjectParty`, `useUpdateProjectParty`,
`useCloseProjectPartySeat`, `useRemoveProjectParty`, `useBringForward` and `useSetPartyAuthority` —
the same import `use-studio-contacts.ts:6` already makes. A helper beside `peopleSeatKeys` would
keep the six in step.

## 2. MAJOR — `CloseSeatAct` has one consumer; the Call Sheet keeps its own copy, and the report says the opposite

**Confidence: high (grep-verified).**

`w3-room-report.md` §1 describes `close-seat-act.tsx` as "`CloseSeatAct` — the two-step dated
close, one component, **two surfaces**", and §6 states the invariant: "extracted so the wording,
the dated write and `peopleEvents.seatClosed` cannot drift between the two surfaces."

The only importer is `apps/designer-portal/src/components/document/people/views/person-profile.tsx:65`.
`roster-row.tsx` never imports it — its sole mention is a comment at `:227`. The Call Sheet row
still owns a complete second copy at `roster-row.tsx:997-1052`: its own confirm sentence
(`:1000-1002`, byte-for-byte the same prose `closeSeatConfirmSentence` composes at
`close-seat-act.tsx:30-35`), its own "Why it closed" input, its own
`closeSeat.mutateAsync({id, projectId, reason})` and its own `peopleEvents.seatClosed` call.

So the stated invariant does not exist in the code: two hand-maintained copies of one act's
wording, write and analytics sit in two files, and they agree today only by coincidence. Either
repoint `roster-row.tsx`'s `closing` block at `CloseSeatAct` (which is what the extraction was
for), or amend §1 and §6 to say the component serves the person card alone and the Call Sheet's
copy is the original.

## 3. MAJOR — the room report is stale against the shipped files in eight measured places

**Confidence: high (each item measured this round).**

The same carry-forward defect r7 M-4 and r8 MAJOR-1 filed against this report and against
`w3-data-report.md`. The report's own preamble claims "Every one of them now names what the files
print, measured this round"; the r9–r14 rounds then moved the files under it.

| Report | Says | Measured |
|---|---|---|
| §1 file table, `lib/document/bring-forward.ts` | exports "… `carriedConsentNotice`, `countInWords`" | `carriedConsentNotice` does not exist; the file's own comment (`bring-forward.ts:144-158`) records that r4 MAJOR-1 deleted it in favour of the one composer in `consent-sentence.ts` |
| §2, the quoted consequence sentence | "…the verdict, **the trades**, the notes and the payee facts — travels the same way, and where both cards say something Adaeze Okonkwo's own words stand." | r11 BLOCKING-1 split trades/specialties/sole-proprietor out: the shipped string (`compare-merge-sheet.tsx:155-159`) reads "…the verdict, the notes and the payee facts…" followed by "The trades and specialties on both cards are kept together, and a card recorded as a sole proprietor keeps that either way." |
| §2 | "each of `merge_studio_contacts()`'s **eleven** refusals renders as a sentence" | `MERGE_REFUSAL_SENTENCES` holds **thirteen** (`use-studio-contacts.ts:1924-1958`); the code's own comment says thirteen |
| §1 test table | `people-crm-w3.test.ts` (29) | 34 |
| §1 test table | `compliance-notice.test.ts` (9) | 10 |
| §1 test table | `compare-merge-sheet.test.tsx` (15) | 17 |
| §1 test table | `household-band.test.tsx` (29) | 34 |
| §1 test table | `rolodex-picker.test.tsx` (15 → 35) · `roster-row.test.tsx` (26 → 40) | 37 · 48 |
| §9 gates | jest "7656 tests" · vitest "1335 passed" | 7674 · 1340 |
| §10 item 1 | "**Neither Playwright spec has been run.**" | `build/w3-fix-log-r14.md` records a green chromium run of both, 3 passed in 15.6 s |
| §7 | the sweep's third notice is "Lakeshore Painting Co. (lapses_soon **2026-10-06**)" | the local row reads **2026-10-08** — the seed's expiry is relative, so the literal drifts a day per day |

None of these is a defect in the shipped face; all of them are the record disagreeing with the
code a reader will check it against, which is the thing this report is for.

---

## 4. MINOR

**m-1 (medium) — `CloseSeatAct` swallows every database refusal into a shrug.**
`close-seat-act.tsx:115-119` catches with `e instanceof Error ? e.message : "Could not close the
seat."`, but `useCloseProjectPartySeat` (`use-coordination.ts:840-847`) throws the raw PostgREST
rejection, which is a plain object. So an RLS refusal, and every 00624 seat-card trigger the
UPDATE fires (`party_studio_contact_other_studio`, `party_card_merged_away`, …), reaches the
person card as "Could not close the seat." with no reason and no act. This is precisely the
pattern CR5-1 named ("a PostgREST rejection is a plain object, so `e instanceof Error` turned
every 00624 card-guard refusal into a shrug", quoted at `rolodex-picker.tsx:644-645`) and
`writeErrorMessage` exists for; every other write path in this wave routes through it. The Call
Sheet's own close (`roster-row.tsx:1035-1038`) has the same shape and additionally puts the
refusal in the `role="status"` announcer, which is what r7 MAJOR-4 ruled against for the bid.
Fix: `writeErrorMessage(e, "Could not close the seat.")` in both.

**m-2 (medium) — the household add sentence promises a grant on a studio-less job, where the whole act is refused.**
`householdAddIsHeld` (`household-band.tsx:219-225`) mirrors only the owner/admin leg of
`add_household_member()`'s grant branch. The branch has a second refusal one line earlier —
`household_grant_project_has_no_studio` (`00632:391-396`) — which rolls back the membership and
the seat too. On the studio-less population R-BI names, the consequence sentence prints "They may
sign money to $X." and the press fails; the refusal IS translated afterwards
(`use-households.ts:113-114`), so this is the softer half of r7 MAJOR-3, but it is a promise no
press can keep. The picker already reads `useProjectRecordedStudio` for exactly this population
(`rolodex-picker.tsx:259-262`).

**m-3 (medium) — nothing invalidates `['studio-contact-history', …]`.**
The key is minted at `use-studio-contacts.ts:540` and invalidated nowhere in the repo.
`merge_studio_contacts()` repoints every seat's `studio_contact_id`, so the survivor gains the
folded card's prior jobs — but the picker's `projectNames` rollup, which is both the history line
(PR-i) and the in-memory index SPEC §5.7 #3's prior-job search runs over
(`rolodex-picker.tsx:339-357`), keeps the pre-merge answer for five minutes. Searching "Lindqvist"
right after a merge can miss the surviving card. Add the key to `useMergeStudioContacts`'s fan-out.

**m-4 (medium) — the terminal act says nothing when nothing is ticked.**
R-I forbids gating "Add to the roster", and `bringForwardActLabel(0)` correctly reads
"Add to the roster" — but `addPicked` then returns silently (`rolodex-picker.tsx:659`). Pressing a
live primary act and getting no alert, no status line and no change is the one state the act row
never explains. One sentence into the existing `role="alert"` would close it.

**m-5 (medium) — `aria-disabled` rule: the household add act is natively `disabled` for the
"nobody chosen" state.** `household-band.tsx:719` passes
`disabled={addHeld || !personId || addMember.isPending}` with `held={addHeld}`. `held` only takes
effect in company with `disabled` (`document-action.tsx:166-167`), so the `addHeld` leg is
correctly `aria-disabled` with its reason — but the `!personId` leg removes the act from the tab
order with no reason on the face at all, which is the shape the wave's own doc comment forbids
(`archive-card-door.tsx:12-17`: "`aria-disabled` plus `aria-describedby` plus a sentence on the
face, never a `disabled` attribute"). Same shape, lower stakes:
`compare-merge-sheet.tsx:608` (`disabled={!canMerge || …}`) and `rolodex-picker.tsx:970`
(`data-add-one`, disabled while any add is pending).

**m-6 (low) — the household overlap read is unscoped and unordered.**
`use-households.ts:384-388` selects `client_households` by `.overlaps("member_person_ids", …)`
with `.limit(1)`, no `organization_id`/`designer_id` filter and no `ORDER BY`. RLS bounds the
tenant, so this is not a leak; it is a stability question — two households holding the same
client-side card resolve to whichever row Postgres returns first, and the band's whole face hangs
off that pick. Scope the read to `household?.organization_id ?? organizationId` and order it.

**m-7 (low) — comments now contradicted by the code they annotate.**
`roster-row.tsx:308` still quotes "Northgate Electric's insurance lapses in 30 days, on 6 October
2026." as the clause the block below produces; M2R-1 took the interval out and
`expiryNoticeClause` (`compliance-notice.ts:76-78`) composes "lapses on <date>." only.
`compliance-notice.ts:60-62` fixes Lakeshore's expiry at 2026-10-06 as a measured fact; the seeded
row now reads 2026-10-08 because the seed date is relative to `current_date`.

**m-8 (low) — a partial bring-forward refusal names one reason for every refused pick.**
`rolodex-picker.tsx:731-739` joins every refused name into one sentence and then appends
`writeErrorMessage({message: result.refused[0].reason}, …)` — the FIRST refusal's reason. Two
picks refused for two different reasons (one merged away, one on another studio's card) report the
first reason under both names. `useBringForward` already returns the reason per pick
(`use-coordination.ts:2660-2666`); group the names by translated sentence.

**m-9 (low) — `RosterGroups` reads the rolodex twice per Call Sheet.**
`roster-groups.tsx:75` (`includeArchived: false`) and `:96` (`includeArchived: true`) are two
distinct query keys over the same table, and the second is a superset of the first. The unarchived
list can be derived from `contactsWithArchived` in memory. Related and already owed in §10 item 7:
`useComplianceNotices` is still one hook call per roster row (`roster-row.tsx:294`), keyed on the
studio so it is one request, but one observer per row.

**m-10 (low) — the new Call Sheet-side surfaces size text with arbitrary values rather than the
`.t-*` steps.** `household-band.tsx` and the bid editor in `roster-row.tsx` use
`text-[0.74rem]` / `text-[0.72rem]` / `text-[0.7rem]`, where this wave's people-room-side files
(`compare-merge-sheet.tsx`, `close-seat-act.tsx`, `archive-card-door.tsx`) use `t-body-sm`. Both
are internally consistent with their own surface, so this is house-grammar debt carried forward
rather than a regression introduced here — named because the brief asks for `.t-*` steps.

---

## 5. Not findings

- `useBringForward` writing `phone` and `email`: they are the channel VALUES the consent record is
  keyed on, not a copy of a verdict, and `normalize_party_phone_e164()` derives the `phone_e164`
  the seats view reads. The report's §3 reasoning holds.
- The seat's birth `stage` (`'active'`, the column default) is what `useAddProjectParty` has always
  produced; bring forward changes nothing about it.
- `directoryDuplicatePairs`'s new `row.role !== "contact"` guard is correct: `people_directory` v5
  has five identity branches (`'client'`, `'lead'`, `'maker'`, `'team'`, `'contact'` —
  `00629:2681, :2742, :2781, :3025, :3093`) and only `contact` carries a `studio_contacts` id,
  which is what the band's new act merges.
- A lapsed non-gating certificate printing a paper word with no sentence is not reachable:
  `compliance_state()` requires `cardinality(d.blocks) > 0` for both `lapsed` and `lapses_soon`
  (`00623:682-690`), so `row.paper === 'lapsed'` always has a blocking document behind it for
  `heldClause` to name.
- Everything `rulings.md` §3 settles, and everything the reports scope to W4.
