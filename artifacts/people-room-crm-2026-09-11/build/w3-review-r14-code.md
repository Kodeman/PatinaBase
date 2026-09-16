# W3 (P2) — adversarial code review, round 14

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
HEAD `61a780967` (`fix(people-crm): W3 r13 — six major findings closed`).
Working tree clean; the whole W3 surface is committed. Diff read in full over
`3d65f81e4..HEAD -- apps/designer-portal/src packages/supabase/src`
(45 files, 10,105 insertions).

**Verdict: clean.** Zero blocking, zero major. Ten findings, all minor.

---

## 1. Prior findings, re-checked

Every finding in `build/w3-fix-log-r13.md` was re-read against the shipped files.

| Finding | State |
|---|---|
| r13-mig-major-1 — `merge_seat_card_other_studio` + generic fallback | **FIXED.** `MERGE_REFUSAL_SENTENCES` carries the key and `asMergeError` (`use-studio-contacts.ts`) ends in `if (/^[a-z][a-z0-9_]*$/.test(message.trim())) return 'The merge did not go through, and nothing was changed.'` — a bare token can no longer reach the sheet's `role="alert"`. The `details` leg naming the job is there for both studio-less and other-studio. |
| r13-mig-major-2 — `project_parties_touch_updated_at` + `patina.suppress_party_touch` | **FIXED.** 00629 mints the function, keeps 00212's trigger NAME, and brackets the four seat statements. Out of this review's file scope; the SQL reads as the log describes. |
| r13-qa-major-1 / r13-code-major-2 — merge consequence branched on the survivor alone | **FIXED.** `mergeConsequenceSentence(survivorName, mergedName, survivorHasRule, mergedHasRule)`; `ruleMoves = mergedHasRule && !survivorHasRule`, `ruleStays` only when both hold one (`compare-merge-sheet.tsx:128-138`). Call site `:590-595` passes both flags off `ruleIndex`. |
| r13-code-major-1 — an archived estimator erased "Priced by …" | **FIXED.** `roster-groups.tsx:78-95` adds `useStudioContacts(consentOrg, { includeArchived: true })` → `bidPeople` with `archived`; `roster-row.tsx:415-433` resolves the recorded id against the whole book, `bidPeopleOptions` keeps the recorded/drafted archived card selectable, and `bidNote` prints "Priced by Tom Marrow, whose card is put away." |
| r13-code-major-3 — merge did not invalidate two roots it writes through | **FIXED.** `useMergeStudioContacts.onSuccess` now invalidates `partyBidKeys.all`, `clientHouseholdKeys.all` and `resolvedContactKeys.all` off the exported factories. (See R14-1 for the one root still missing.) |

## 2. The brief's own checks

| Check | Result |
|---|---|
| Travel list writes only the allowed facts | **PASS.** `useBringForward`'s INSERT (`use-coordination.ts`) names exactly `project_id, party_kind, display_name, company_name, company_id, trade, phone, email, studio_contact_id`. No pricing column, no `off_job_*`, no note, no `show_to_client` (born at PD-11's `false` default), no bid column, no consent column. `TravelListPane`'s `STAYS_BEHIND` says the same three things out loud. |
| Consent never copied per seat | **PASS.** No W3 hook writes `studio_channel_consent` or any `project_parties.sms_consent_*` column, and `grep -niE "INSERT INTO public.studio_channel_consent\|UPDATE public.studio_channel_consent"` over 00629/00631/00632 returns nothing. R-AY holds: the picker READS the verdict (`useChannelConsentRecords` → `consentSentence`) and writes nothing. |
| Merge sheet survivor flip | **PASS.** `preferredSurvivorId` picks the smaller `created_at` (older), ties on id; the effect takes the pre-pick once (`:305-314`, guarded on `survivorId ||`) so a refetch cannot undo a flip; both column heads are `aria-pressed` buttons (`:481-484`); `survivor_flipped` is measured against the pre-pick. |
| A true consequence sentence | **PASS** against the code. The sentence's four branches (rule moves / rule stays / trades-and-specialties kept together / paper moves and supersedes) each match 00629's own statement — verified against the `UPDATE public.studio_contacts s SET …` block: COALESCE survivor-wins for eleven columns, `||`-UNION for `trades`/`specialties`, `OR` for `is_sole_proprietor`. See R14-10 for the one reduced column the table does not print. |
| PR-n gating | **PASS.** `householdAddIsHeld(isPrincipal, threshold, role)` mirrors 00632's own grant leg; "Set the figure" and "Take the figure away" carry `aria-disabled` + `aria-describedby` + a reason paragraph that is on the face pressed or not (`household-band.tsx:564-639`); `useSetHouseholdThreshold` translates the zero-row RPC answer into `household_threshold_forbidden`'s sentence rather than swallowing it. |
| Close this seat replaced every hard delete | **PASS.** `grep -rn "useRemoveProjectParty" apps/ packages/` → one hook, one call site (`roster-row.tsx:251`), held behind `seatDeleteRefusal`, whose `hasBid` now reads the bid COLUMNS as well as the stage list. `.delete()` on `project_parties` exists exactly once (`use-coordination.ts:992`). No new delete path. (See R14-3 on the "one component, two surfaces" claim.) |
| Invalidations complete | **ONE GAP** — R14-1. Everything else checks out: `studioContactKeys.all` is `['studio-contacts']` and prefix-covers `detail`; `partyBidKeys`, `clientHouseholdKeys`, `resolvedContactKeys`, `studioChannelKeys`, `contactRuleKeys`, `affiliationKeys`, `complianceKeys`, `peopleKeys`, `peopleSeatKeys`, `['project-parties']`, `['project-roster']` all reached. |
| aria rules | **PASS** on every gated act (archive door, the two figure acts, "Open a household", "Add to the household" when held, the seat's hard delete) — `aria-disabled` via `DocumentAction`'s `held`, plus a standing reason. Two arguable spots: R14-9 (a form-completion gate) and the transient `disabled` during `isPending`, which is the shipped idiom everywhere. |
| Document grammar | **PASS.** Zero `box-shadow` / `shadow-*` in any of the seven new or rewritten surfaces. House tokens (`--ink`, `--ink-subtle`, `--paper`, `--rail`, `--hairline-strong`, `--terracotta-ink`) all resolve in `globals.css:1977-2002`; `.t-body-sm` at `:2043`; `--color-dusty-blue-ink` present at `:2031` (PR-v). People-room surfaces use the house set, Call-Sheet surfaces the shipped `--color-*` set, which is the split those two rooms already ship. |
| SPEC vocabulary | **PASS.** Every `no_response` / `off_job` / `bid_outcome` / `client_rep` / `opted_out` / `lapses_soon` / `not_on_file` occurrence in the four biggest surfaces is a PREDICATE, never rendered text. `SEAT_BID_OUTCOME_ACTS`, `HOUSEHOLD_MEMBER_ROLE_LABELS`, `MERGE_MATCHED_ON_LABELS` carry the studio's words. |
| Hooks above early returns | **PASS.** `HouseholdBand`, `CompareMergeSheet`, `CloseSeatAct`, `ArchiveCardDoor`, `RolodexPicker`, `RosterRow` all declare every hook before the first `return`. |
| `@patina/supabase` hooks only | **PASS.** No ad-hoc `fetch`; every read and write in the wave goes through a hook in the data layer. |

## 3. Gates, run this round

| Gate | Result |
|---|---|
| `pnpm --filter @patina/supabase type-check` | rc=0 |
| `pnpm --filter designer-portal type-check` | rc=0 |
| `pnpm --filter admin-portal build` | **exit 0**, full route table |
| `apps/designer-portal` `npx jest src/components/document/{roster,people} src/lib/document` | **149 suites, 2941 passed** |
| the nine W3 suites, named | **9 suites, 180 passed** |
| `packages/supabase` `npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` | **34 passed** |
| `npx eslint src/components/document/{roster,people} src/lib/document/{bring-forward,compliance-notice}.ts src/lib/analytics/people-events.ts` | **0 errors**, 4 warnings, all pre-existing in files this wave did not touch |

No server started, no port taken, no prod touched, no migration minted, no `git add -A`.

---

## 4. Findings

### R14-1 · minor · high confidence — `['studio-contact-history']` is invalidated by nothing, and W3 made it load-bearing

`packages/supabase/src/hooks/use-studio-contacts.ts:540` is the only place that
string appears in the repo: `queryKey: ['studio-contact-history', ids, excludeProjectId]`.
It is not under `studioContactKeys.all` (`['studio-contacts']`), and neither
`useMergeStudioContacts.onSuccess` nor `useBringForward.onSuccess` names it.

Before this wave the rollup only fed the quiet PR-i line. W3 made it the
**search index**: `rolodex-picker.tsx:339-357` filters hits on
`history?.[c.id]?.projectNames`, which is how SPEC §5.7 #3's "Lindqvist" search
works at all, and `:449-464`'s `sharedJobName` decides whether `data-pick-count`
names a job. So after a fold, the survivor's prior jobs are the ones the folded
card's seats carried, and the picker keeps searching the pre-merge rollup — up
to the portal's five-minute `staleTime`, with `refetchOnWindowFocus: false`.
The room report §2 states the merge fans out to "every key a card's facts are
read through"; this is the one it misses.

**Fix:** export a `studioContactHistoryKeys = { all: ['studio-contact-history'] }`
root beside the others and invalidate it in `useMergeStudioContacts.onSuccess`
and `useBringForward.onSuccess` (a bring-forward writes a seat, which is a row
the rollup counts once the picker is opened on a different job).

### R14-2 · minor · medium-high confidence — a zero-row bid write prints PostgREST plumbing on the row

`useSetPartyBid` ends `.update(dbPatch).eq('id', id).select('*').single()` and
throws `new Error(asBidError(error))`. `asBidError` returns the raw `message`
for anything not in `BID_REFUSAL_SENTENCES`, and — this is the load-bearing part
— it **discards `error.code`**. `roster-row.tsx:521`'s catch then calls
`writeErrorMessage(e, 'Could not write the bid.')`, whose first branch
(`write-error.ts:26`) keys on `/row-level security|permission denied|42501|PGRST116/`
against `code + message`. The code it needs was thrown away one frame earlier,
and PostgREST's zero-row text — "JSON object requested, multiple (or no) rows
returned" — matches no branch and no schema-word guard, so it is returned
verbatim into `data-bid-error`.

Reachable because `project_parties` SELECT is wider than UPDATE:
`00421_studio_comember_read_policies.sql:88-95` admits
`is_studio_comember(p.designer_id) OR (p.studio_id IS NOT NULL AND is_active_studio_member(p.studio_id))`,
while `00584_studio_comember_rls_sweep.sql:895-911` admits only the first leg.
00628 stamps `projects.studio_id` from the designer's studio, so the two legs
agree — until that designer's membership goes inactive or is demoted to guest
(`is_studio_comember` excludes both, 00556:68-73). The row stays readable, the
bid editor stays offered, and the press answers with a sentence about JSON.

**Fix:** carry `code`/`details` through the rethrow (throw an object, or
`Object.assign(new Error(...), { code, details })`), or add a zero-row branch to
`asBidError` — "The bid was not written. This job is not yours to edit."

### R14-3 · minor · high confidence — `CloseSeatAct` is mounted on one surface, not two

`grep -rn "CloseSeatAct"` returns the file itself and exactly one mount,
`person-profile.tsx:521`. The Call Sheet row keeps its own copy of the confirm —
`roster-row.tsx:997-1052`: the same sentence ("– Close {name}'s seat? The seat
stays on the job with the day it closed, and everything it carries stays with
it."), the same "Why it closed" field, the same `useCloseProjectPartySeat` call
and the same `peopleEvents.seatClosed` payload, written out inline.

The two are byte-identical today, so nothing on a face is wrong. But the room
report §1 ("one component, two surfaces") and §6 ("extracted so the wording, the
dated write and `peopleEvents.seatClosed` cannot drift between the two
surfaces") describe an extraction that did not land, and the drift they name is
exactly what the duplication still allows.

**Fix:** mount `CloseSeatAct` in roster-row's `closing` branch (the row keeps its
own "Added by mistake" act beside it), or amend both report sections.

### R14-4 · minor · high confidence — the room report's quoted strings and counts are stale against HEAD

`w3-room-report.md`'s preamble says every face-string and number "now names what
the files print, measured this round". Five do not:

1. **§2's consequence sentence** still reads "…— the verdict, **the trades**, the
   notes and the payee facts — travels the same way…" and stops there. The code
   (`compare-merge-sheet.tsx:155-159`) took "the trades" OUT of that clause in
   r11 BLOCKING-1 and added a whole sentence the report does not quote: "The
   trades and specialties on both cards are kept together, and a card recorded
   as a sole proprietor keeps that either way." The report's quote is the
   pre-r11 face.
2. **§2 says "eleven refusals"**; `MERGE_REFUSAL_SENTENCES` holds thirteen keys
   (the r11 `merge_seat_on_studioless_project` and the r13
   `merge_seat_card_other_studio` are both in, plus the generic fallback).
3. **§1 lists `carriedConsentNotice`** among `lib/document/bring-forward.ts`'s
   exports. That function was deleted; `bring-forward.ts:144-157` is its epitaph
   and nothing exports it.
4. **§3 row 3 quotes "4 of 5 from the Lindqvist kitchen selected"**; R-BP amended
   the pool to six and `bringForwardSelectionLine`'s own docstring says "4 of 6".
5. **§1's test counts and §9's gate rows** are the r8-round measurements
   (593 suites / 7656 tests; 105 files / 1335 passed; `people-crm-w3.test.ts` 29;
   `compare-merge-sheet.test.tsx` 15; `household-band.test.tsx` 29). Measured now:
   people/roster/lib jest = **149 suites / 2941 passed**; the nine W3 suites =
   **180 tests**; `people-crm-w3.test.ts` = **34**.

**Fix:** re-measure §1, §2, §3 and §9 against HEAD before the report is carried
into the ship record.

### R14-5 · minor · medium confidence — clearing every bid field on a withdrawn seat is a one-way door

`roster-row.tsx:787` offers the editor on `isSeat && (band === 'bidding' || hasBid)`.
`bidStageOutcome`'s `writesStage` requires an outcome, so clearing the outcome
writes `bid_outcome = NULL` and no stage — the seat keeps the stage the erased
outcome gave it, which the sentence at `:494-502` says out loud. But if the
studio also clears the six dates and the estimator, `seatCarriesBid` goes false,
the row sits at `off_job` in the Done band (`rosterBandFor`, `use-coordination.ts:1745`),
and the door back is gone from every surface — which is the one-way door MAJOR-7
named, reached from the other direction.

**Fix:** offer the editor on `off_job` / `declined` / `no_response` seats as well,
or refuse a clear that would strand the stage.

### R14-6 · minor · low confidence — `carried_opt_out` counts picks the act dropped

`rolodex-picker.tsx:717-721` fires `peopleEvents.bringForwardPicked` with
`carried_opt_out: pickedFacts.some(row => row.consent === 'opted_out')`.
`pickedFacts` (`:567-595`) is derived from `picked` — every ticked row — while
the act writes `fresh` (`:694`), the picked rows minus the ones already seated.
`picked_count` correctly reads `result.added.length`, so one property counts the
batch and the other counts the ticks.

**Fix:** derive the flag from `result.added` (or from `fresh`).

### R14-7 · minor · low confidence — the prior-job search sends up to 200 uuids in one PostgREST `in.()`

`rolodex-picker.tsx:96` caps the history scan at `HISTORY_SCAN = 200` and `:334`
hands `scanned.map(c => c.id)` to `useStudioContactHistory`, which issues
`.in('studio_contact_id', ids)`. Two hundred uuids is roughly 7.8 KB of query
string before the rest of the URL; an 8 KB request-line limit anywhere on the
path answers 414, and that one request carries BOTH the history line and the
prior-job search, so Leah task 5 stops working with no message. Report §10 item 6
names the 200 cap as a completeness limit, not as a request-size one.

**Fix:** chunk the `in.()` at ~50 ids per request, or move the rollup to the
server-side view §10 item 6 already calls the honest answer.

### R14-8 · minor · medium confidence — two refusals on the Call Sheet row still speak in the polite status voice

`roster-row.tsx:1041-1045` (close the seat) and the "Added by mistake" branch
below it both `.catch(e => setNote(...))`, where `setNote` drives the row's
`role="status"` announcer — the same voice that says "The bid is written on
{name}'s seat." r7 MAJOR-4 moved the bid refusal off exactly that voice, and its
own note says "Every other refusal in this wave is a `role="alert"`". These two
sit eight lines from `bidError`, which is the idiom.

Pre-existing (W2), but this wave rewrote the file around them and left them the
odd pair out; a screen-reader user is told a close FAILED in the voice that tells
them it succeeded, and a later status change can swallow it.

**Fix:** give the row one `role="alert"` line (or reuse `bidError`) for both.

### R14-9 · minor · low confidence — "Add to the household" is natively `disabled` while nobody is chosen

`household-band.tsx:719` passes `disabled={addHeld || !personId || addMember.isPending}`
with `held={addHeld}`. `DocumentAction` renders `disabled={unavailable && !held}`
(`document-action.tsx:309`), so with `addHeld` false and no person chosen the
primary act leaves the tab order entirely with no sentence beside it. Every other
gated act in the wave — the archive door, the two figure acts, "Open a household"
— is `aria-disabled` + a standing reason.

A form-completion gate is arguably a different thing from a permission gate, so
this is called low.

**Fix:** `held={addHeld || !personId}` with a describedby pointing at "Choose
someone from the book first."

### R14-10 · minor · medium-high confidence — `company_kind` is a reduced column the compare table does not print (R-BN)

R-BN: "The compare sheet shows both values wherever a reduction will pick one."
00629's survivor UPDATE reduces sixteen columns; `carriedRows`
(`compare-merge-sheet.tsx:228-261`) prints fifteen. The missing one is
`company_kind = COALESCE(s.company_kind, v_merged.company_kind)`.

It is not cosmetic: `company-card.tsx:511` reads
`partyKindOwesPaper(card.company_kind ?? card.contact_kind)`, so which card
survives decides whether the merged firm owes paper at all — R-K's whole branch
("a lender or inspector firm prints only 'No paper is held for this firm.' and
no act"). The sheet's "What they are" row prints `contact_kind`, which
`company_kind` shadows for exactly that test, so the studio can read two firm
cards as the same kind while the lever they are about to pull says otherwise.
The population is the firm↔firm duplicate fold — crm-model §4 rule 4, and the
fixture r13 MAJOR-2 itself built.

**Fix:** add `["Firm kind", card => companyKindLabel(card.company_kind)]` to
`carriedRows`' `fields` list, rendered only where either card holds one, the way
the other twelve typed facts already are.

---

## 5. What was NOT treated as a finding

- Every ruling in `rulings.md` §3, and R-AS / R-AY / R-BE / R-BL / R-BM in
  particular. R-AY is honoured: consent is read, never copied.
- Anything the reports scope to W4, and the eight items in room report §10.
- `disabled` during `isPending` on the picker's mini rows, the single-add
  sibling and the merge act — the shipped idiom on every surface, and a
  transient state, not a gate.
- The two `useStudioContacts` reads in `RosterGroups` (archived-included and
  archived-excluded): different filter objects are different query keys by
  design, and r13 MAJOR-1's fix needs both.
- `useComplianceNotices` called once per roster row: React Query keys it on the
  studio, so it is one request; room report §10 item 7 already owns the hoist.
