# W3 (P2) — adversarial code review, round 22

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `e7172c302`. Local Postgres only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). No prod. No server started. No port
taken. No migration minted. Working tree carries one uncommitted file — `artifacts/.../rulings.md`
(the orchestrator's R-BS edit) — and nothing else.

Scope read in full: the W3 change set under `apps/designer-portal/src` and `packages/supabase/src`
(`git diff 3d65f81e4..HEAD`, 50 files, 12 589 insertions / 189 deletions), plus the supporting
migrations, the installed catalog (`pg_get_functiondef` / `pg_get_triggerdef` / `pg_policies`), and
the two new `e2e/people` specs.

**Verdict: CLEAN — zero blocking, zero major.** Nine minor findings below, every one of them
evidence-grounded and none of them a wrong fact on a face, a cross-tenant read or write, an
RLS/grant hole, a consent write outside `record_channel_consent`, a reset failure or data loss on
merge.

---

## 1. Prior findings, re-checked at HEAD

`w3-fix-log-r21.md`'s eight findings (five distinct defects). All eight **CLOSED**, verified against
HEAD rather than taken from the log.

| Finding | State | Evidence at HEAD |
|---|---|---|
| r21-MAJOR-1 · r21-major-2 — 00634's two refusals as bare tokens, act not held | **fixed** | `use-coordination.ts:867-909` (`SEAT_CLOSE_REFUSAL_SENTENCES`, `asSeatCloseError`, `seatCloseIsHeldForMoney`, `SEAT_CLOSE_MONEY_HELD_REASON`); `write-error.ts:86-91`; `roster-row.tsx:262-267,1271-1296` (held + `aria-describedby` + visible sentence + `role="alert"` at `:1199`); `close-seat-act.tsx:101,116-133,195-202`. `useCloseProjectPartySeat` now throws `new Error(asSeatCloseError(error))` (`use-coordination.ts:957`) rather than the PostgREST object |
| r21-MAJOR-2 — the Bidding band as a second door into 00634 | **fixed** | read back off the live catalog: `end_party_authority_at_seat_close_trg … WHEN ((old.off_job_at IS NULL) AND (new.off_job_at IS NOT NULL) AND (NOT ((COALESCE(new.bid_outcome,'') = 'withdrawn') AND (COALESCE(old.bid_outcome,'') <> 'withdrawn'))))`. Both legs COALESCE-first, so the trigger still fires on every seat carrying no bid |
| r21-major-1 — the close ended money and nothing told the browser | **fixed** | `use-coordination.ts:977-978` (close) and `:2844-2845` (bid) both invalidate `partyAuthorityKeys.all` + `invalidateClientHouseholds`. `projectAuthorityKeys.project` is `[...partyAuthorityKeys.all,'project',id]` (`use-project-authority.ts:24-27`), so the root is a genuine prefix |
| r21-major-3 — a bid outcome on a hand-closed seat put it back in a crew band | **fixed** | `seatClosedByHand` at `use-coordination.ts:2505`, folded into `pastTheBid` at `:2598-2600`; `roster-row.tsx:553-565` reads the SAME object for the consequence sentence and `:611-623` for the write |
| r21-major-4 — a correction away from "They withdrew" NULLed a day and a reason | **fixed** | `use-coordination.ts:2775-2779` — the clearing branch reads `&& !seatClosedByHand(previous)` |
| r21-MAJOR-3 / r21-major-5 — the two reports stale | **fixed** | `w3-data-report.md` §0 reads "The seven migrations / 00628–00634"; `w3-room-report.md` §1/§9 read 66 / 56 / 9 / 594-7705 / 106-1376. Every one of those numbers reproduced below |

No prior finding re-opened.

---

## 2. The explicit checks

| Check | Result |
|---|---|
| **Travel list writes only the allowed facts** | PASS. `useBringForward`'s INSERT names exactly `project_id, party_kind, display_name, company_name, company_id, trade, phone, email, studio_contact_id` (`use-coordination.ts:2900-2913`). No pricing column, no note column, no `show_to_client` — the seat is born at PD-11's `false` default. `TRAVELS` / `STAYS_BEHIND` (`travel-list-pane.tsx:20-34`) state the same contract, and `bring-forward.spec.ts:212-223` asserts it against the database (`show_to_client` false, `bid_outcome` null, `bid_amount_cents` null) |
| **Consent never copied per seat** | PASS. No W3 hook writes any `sms_consent_*` column; `refuse_legacy_consent_write_trg` stands over all eight plus `phone`/`phone_e164` (R-AX). The merge writes nothing to `studio_channel_consent` (keyed on `(organization_id, channel_kind, channel_value)`), and the compare sheet says so on the face (`compare-merge-sheet.tsx:160`). The bring-forward INSERT cannot wake `fc_dispatch_optin_invite` either — that trigger returns early unless `sms_consent_status = 'pending'` with all four evidence columns set, and the insert writes none of them |
| **Merge sheet: survivor flip and a true consequence sentence** | PASS. `columnHead` (`compare-merge-sheet.tsx:475-512`) is a real `aria-pressed` toggle per column; `preferredSurvivorId` pre-picks the older card and the effect at `:305-314` takes the pick once and never overwrites a flip. `survivor`/`merged`/`mergedId` all derive from `survivorId` (`:437-441`), so the table head, the consequence sentence and the write cannot disagree. Every clause of `mergeConsequenceSentence` was checked against the installed `merge_studio_contacts` body: seats (`:1215`), channels (`:517-610`), designations and typed facts COALESCEd survivor-first (`:758-800`), trades/specialties UNIONed and `is_sole_proprietor` OR'd (the two rows that carry a `kept` clause in `carriedRows`), paper moved with the supersede edge (`:1083-1160`), the tombstone kept (`:1333`). Reopening the sheet on a different pair cannot carry a stale survivor: the sheet is modal, `onClose` nulls `comparing`, and `open === false` resets `survivorId` |
| **PR-n gating** | PASS on all four doors, and each mirrors its own DB leg exactly. `householdAddIsHeld` (`household-band.tsx:300-306`) ↔ `add_household_member`'s `co_threshold_cents IS NOT NULL AND p_role = 'client_rep'`; the figure acts (`:716,746`) ↔ `set_household_threshold`'s `is_org_admin_or_owner(v_h.organization_id)`; "Record the authority" (`:837-844`) ↔ the same RPC leg, project-scoped per R-BQ; `seatCloseIsHeldForMoney` (`use-coordination.ts:898-905`) ↔ `end_party_authority_at_seat_close`'s `count(*) FILTER (WHERE scope IN ('money','draw_certify')) … AND effective_to IS NULL` — `ADMIN_ONLY_AUTHORITY_SCOPES` is byte-for-byte those two scopes (`:1942-1948`). Every hold is a *pre-check with a database backstop*, and the backstop's refusal now reaches the face as a sentence |
| **Close this seat replaced every hard delete** | PASS. `grep "\.delete()"` over the data layer returns exactly two rows: `use-coordination.ts:1117` (the surviving mistaken-add delete, held behind `seatDeleteRefusal` and widened this wave to read the bid COLUMNS as well as `stage`, `:1074-1079`) and `use-studio-contacts.ts:1226` (`useClearContactRule`, a rule row, not a seat). The only portal call site of `useRemoveProjectParty` is `roster-row.tsx:329`, inside the close confirm, held with a visible reason. Archive/restore go through 00629's RPCs rather than a table write (`:414-468`); the merge's own DELETEs (`merge.sql:555,866,889,915`) are duplicate-collapse *after* the facts have been OR'd/COALESCEd onto the survivor, per R-BN. The word "Remove" appears on no face |
| **Invalidations** | PASS on every root that carries a fact the write moves. All seven seat writers now reach `partyAuthorityKeys.all` and `clientHouseholdKeys.all` where they move authority or openness; `useMergeStudioContacts` reaches thirteen roots including `partyBidKeys.all`, `clientHouseholdKeys.all` and `resolvedContactKeys.all`. One root is genuinely missed — see **minor-3** |
| **aria rules** | PASS but for one act. Ten of the eleven `disabled=` sites in the wave pair it with `held` (which `DocumentAction:167,281,309` turns into a focusable `aria-disabled="true"`) plus `aria-describedby` plus a VISIBLE sentence. The eleventh is **minor-1** |
| **Document grammar** | PASS. Zero `box-shadow` / `shadow-*` in any W3 file. Colours are house tokens throughout; `bg-white/40` is the established band idiom (`kickoff-band.tsx:77`, `promote-band.tsx:52`, `notice-log.tsx:71` all pre-date this wave). Type: the People-room files use `.t-*` steps, the Call Sheet files use the raw sizes their host surface already uses — consistent within each surface |
| **SPEC vocabulary** | PASS. Every refusal token W3's migrations raise is mapped: `household_*` → `asHouseholdError`; `merge_*` and the four `studio_contact_merge_*` trigger tokens → `asMergeError`, whose `/^[a-z][a-z0-9_]*$/` catch-all answers any bare token the eleven nested triggers raise; `party_*` and `seat_close_*` → `writeErrorMessage`; `project_parties_bid_*` → `asBidError`. The wave's terminal act now routes its per-pick refusals through the translator too (`rolodex-picker.tsx:757-760`). Two doors still print a raw message — **minor-2**, **minor-7** |

---

## 3. Gates, run fresh this round

| Gate | Result |
|---|---|
| `pnpm --filter @patina/supabase type-check` | clean (`tsc --noEmit`, no output) |
| `pnpm --filter @patina/designer-portal type-check` | clean (`tsc --noEmit`, no output) |
| `pnpm --filter @patina/admin-portal build` | clean, full route table printed |
| `cd apps/designer-portal && npx jest` | **594 suites, 7705 tests, 1 snapshot, all green** (27.3 s) |
| `cd packages/supabase && npx vitest run` | **106 files, 1376 passed, 12 skipped** (4.33 s) |
| migration numbering | `ls supabase/migrations \| tail` ends at `00634`; nothing minted, nothing inside the reserved `00595`–`00620`, nothing below `00621` |

Every figure `w3-room-report.md` §9 and `w3-fix-log-r21.md` state was reproduced exactly.

---

## 4. Findings

### minor-1 · the merge sheet's leading act is the one gated act in the wave without `held`
**severity minor · confidence high (code), medium (impact)**
`apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx:604-613`

```tsx
<DocumentAction actionKey="merge-studio-contacts" variant="primary"
  onClick={() => void run()}
  disabled={!canMerge || merge.isPending}
  loading={merge.isPending} …>
```

No `held`, no `aria-describedby`, no sentence. `DocumentAction` renders `disabled={unavailable &&
!held}` (`document-action.tsx:309`), so with `canMerge` false the primary act leaves the tab order
with nothing on the face saying what is missing — the exact regression r18 MAJOR-1 closed on
`household-band.tsx` and CR-26 closed on `roster-row.tsx:1344-1367`. Every other gated act in the
wave carries the pair (`close-seat-act.tsx:116-118`, `archive-card-door.tsx:97-99`,
`roster-row.tsx:1168-1170,1221-1224,1271-1276`, `household-band.tsx:837-844,941-949`).

`canMerge` is `!!survivorId && !!mergedId && survivorId !== mergedId` (`:443`) and `survivorId` is
seeded only once BOTH `useStudioContact` reads land (`:312`), so in the ordinary case this is a
sub-second window. It becomes a **steady** state when either card read fails or returns null (an
RLS refusal, a card deleted between the band's render and the press): the sheet then sits open with
a column of "—", a consequence sentence naming "This card", and an unreachable, unexplained act.

**Fix:** `held={!canMerge}` + `aria-describedby` + a one-line reason ("Choose the card that stays."
/ "One of these cards could not be read."), the `household-band.tsx:941-956` shape.

### minor-2 · the archive door prints the raw rejection
**severity minor · confidence high**
`apps/designer-portal/src/components/document/people/archive-card-door.tsx:70-72`

```tsx
} catch (e) {
  setError(e instanceof Error ? e.message : "The card did not move.");
}
```

`asArchiveError` (`packages/supabase/src/hooks/use-studio-contacts.ts:395-412`) maps exactly two
tokens and then `return message` — so anything else (`permission denied for table
studio_contacts`, a `PGRST` string, a relation name) is wrapped in an `Error` and printed verbatim
in the door's `role="alert"`. SPEC §8 #3 bars a schema word from any face, and this is the one door
in the wave that does not route its catch through `writeErrorMessage` — `openHousehold`,
`saveFigure`, `clearFigure`, `recordAuthority`, `save`, `saveBid`, both close acts, both picker
paths and the picker's per-pick refusals all do.

**Fix:** `setError(writeErrorMessage(e, "The card did not move."))`.

### minor-3 · the merge leaves the picker's prior-job rollup stale
**severity minor · confidence high (code), low (impact)**
`packages/supabase/src/hooks/use-studio-contacts.ts:2074-2100` (`useMergeStudioContacts.onSuccess`)

Thirteen roots are invalidated, including the two this wave minted. `['studio-contact-history', ids,
excludeProjectId]` (`:541`) is not among them — and its queryFn groups `project_parties` by
`studio_contact_id` (`:545-547`), which is precisely the column the merge repoints
(`merge_studio_contacts` … `UPDATE public.project_parties SET studio_contact_id = p_survivor WHERE
studio_contact_id = p_merged`). With the portal's `staleTime` five minutes and
`refetchOnWindowFocus: false`, the rolodex picker's history line
(`pickerHistoryLine`, `rolodex-picker.tsx:969`), its prior-job SEARCH (`:351`) and `sharedJobName`
(`:449-464`) keep the pre-merge grouping: the survivor's count stays low and the folded card's jobs
stay invisible to the search that bring-forward exists for.

Low impact because the merge lives in the People room and the picker in the Call Sheet, so the two
are rarely mounted across one act — but this is the same class r13 MAJOR-3 closed for
`partyBidKeys` and `clientHouseholdKeys` in this very hook.

**Fix:** add `void queryClient.invalidateQueries({ queryKey: ['studio-contact-history'] })`.

### minor-4 · two refused picks are reported with one reason
**severity minor · confidence high**
`apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:753-761`

```tsx
`${result.refused.map((row) => row.name).join(', ')} did not go on the call sheet. ${
  writeErrorMessage({ message: result.refused[0].reason }, 'The studio’s book refused the seat.')}`
```

`useBringForward` inserts one pick at a time and returns a `reason` per refusal
(`use-coordination.ts:2915-2925`), so a batch can carry two different refusals — a merged card and
a studio-less job, say. Every name is listed under the FIRST reason, which makes the second name's
sentence untrue about the second name. Nothing is lost (no seat landed either way) and the rows
stay ticked, so the studio can retry — but the sentence names an act ("Record that job's studio
first") that repairs only one of them.

**Fix:** group by translated reason, or emit one clause per refusal.

### minor-5 · clearing a recorded withdrawal leaves an off-job date nothing can clear
**severity minor · confidence medium**
`packages/supabase/src/hooks/use-coordination.ts:2773-2780`

The R-BR clearing branch is gated on `written.stage` being truthy. Clearing the outcome to
"Nothing recorded yet" (the select's first option, `roster-row.tsx:956`) sends
`bidOutcome: null`, so `bidStageOutcome` writes no stage (`writesStage` requires an outcome) and
the branch is skipped: `off_job_at` — stamped by the withdrawal itself — stands.

The seat is then `{ bid_outcome: null, off_job_at: <date>, off_job_reason: null }`, which
`seatClosedByHand` reads as **hand-closed** (`:2510-2515`: a date stands and the outcome is not
`withdrawn`). So every later correction is also blocked from clearing it, `pastTheBid` is true, no
stage is written, and the room offers no reopen act: the seat is permanently Off the job carrying a
date the withdrawal wrote, with no outcome and no reason behind it.

Not a wrong fact on a face — the consequence sentence for that press says exactly "Clearing the
outcome takes They withdrew off <name>'s record. The seat stays at Off the job."
(`roster-row.tsx:583-592`), which is true — and no data is destroyed. But R-BR's own scope is
"correcting a bid outcome **away from** 'withdrawn' clears off_job_at and off_job_reason", and a
clear is a correction away from it. Adjacent to, but not named by, the residue r21-major-4 declares.

**Fix (if the room wants it):** gate the clearing branch on `previous.bidOutcome === 'withdrawn' &&
(written.stage || written.outcome === null) && !seatClosedByHand(previous)` — or rule the current
behaviour as deliberate and say so in the report's declared-residue list.

### minor-6 · the compare table does not show every value a reduction picks
**severity minor · confidence medium**
`apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx:379-435` and
`:196-276` (`carriedRows`)

R-BN's closing clause: "The compare sheet shows both values wherever a reduction will pick one."
The sheet shows fifteen card-level rows plus the nine header rows, and the two rows 00629 keeps
together carry a `kept` clause. Three reduced facts are not shown at all:

* channel `label` (COALESCEd) and `verified` / `preferred` (OR'd) — `merge.sql:517-540`; the sheet
  prints only the channel VALUES (`:369-377`);
* affiliation `role_at_firm` (COALESCEd) and `from_date` (LEAST) — `merge.sql:875-888`;
* the three affiliation booleans (`is_paperwork_contact`, `is_signer`, `holds_trade_license`, OR'd)
  — same statement. The sheet shows the three CARD-level person pointers, which are a different
  three facts.

`role_at_firm` in particular is the one of these with a face (the company card's crew line), and
where both cards hold an open affiliation at the same firm the absorbed row is DELETEd after the
reduction (`merge.sql:889-895`), so the survivor's word is the only one left.

**Fix:** add the affiliation role row (and the channel label) to `carriedRows` where either card
holds one — or record an amendment to R-BN naming the facts the sheet deliberately does not print.

### minor-7 · two catches on the Call Sheet row still read `e.message`, into the polite announcer
**severity minor · confidence high**
`apps/designer-portal/src/components/document/roster/roster-row.tsx:1184-1188` ("Added by mistake")
and `:1340-1342` (Send)

`useRemoveProjectParty` re-raises the bare PostgREST object for all five of its read errors and for
the DELETE itself (`use-coordination.ts:1047,1056,1066,1102,1109,1118`). A plain object is not an
`Error`, so `e instanceof Error ? e.message : 'Could not take it back.'` degrades every RLS refusal
to a shrug — and routes it into `setNote`, the row's polite `role="status"` line, which is exactly
what r21 major-2 corrected for the close act five lines away (`:1144-1146` now uses
`writeErrorMessage` into `data-close-seat-error`, a `role="alert"`). No token leaks (the object
branch is unreachable for `instanceof`), so this is a silenced reason rather than a schema word.

**Fix:** `writeErrorMessage(e, 'Could not take it back.')` into a `role="alert"`, the shape the
close act next to it now uses.

### minor-8 · the two seat-close surfaces split live from closed on different predicates
**severity minor · confidence medium**
`apps/designer-portal/src/components/document/people/views/person-profile.tsx:255-262` vs
`apps/designer-portal/src/components/document/roster/roster-row.tsx:233`

The person card filters on `stage` alone (`DONE_STAGES`), the Call Sheet on
`!!row.offJobAt || row.stage === 'off_job'`. A seat carrying a date with a live stage would be
listed as live on the card, with `CloseSeatAct` offered, while the Call Sheet holds the act on the
same seat and prints "Off the job <date>." beside it (`rosterWindowClause` reads the DATE first,
`roster-row.tsx:118-124`).

No current writer produces that state — both `off_job_at` writers write `stage` with it — and
nothing is destroyed if one appeared, because `useCloseProjectPartySeat`'s `alreadyClosed` branch
preserves the recorded day and restates rather than nulls the reason
(`use-coordination.ts:939-951`). But §6 of the room report calls these two copies "hand-kept in
step", and on this predicate they are not.

**Fix:** give `CloseSeatAct` the `seatAlreadyClosed` hold the Call Sheet has, or split `liveSeats`
on the same predicate — either closes it at the source.

### minor-9 · "Record the authority" reads only the first open `client_rep` seat
**severity minor · confidence low**
`packages/supabase/src/hooks/use-households.ts:376-397` and
`apps/designer-portal/src/components/document/roster/household-band.tsx:401-421`

`chosenSeatIds` keeps the FIRST open seat per `(card, kind)` — correctly mirroring
`add_household_member`'s `ORDER BY pp.created_at LIMIT 1` — and both `clientRepSeatCardIds` and
`clientSideMoneyGrants` are built from it. A card holding TWO open `client_rep` seats on one job
whose money grant sits on the second therefore reads as "owed authority", and the press would open
a second grant on the first seat: one human, one job, two open money figures — the
`merge_seat_collision` shape, inside one card.

`add_household_member` cannot make the second seat (it reuses the earliest open one) and the room's
own doors do not, so the population is a hand-made or legacy duplicate. Low confidence that it is
reachable at all; recorded because the household band is the surface that would print both.

### note (not a finding) · `set_household_threshold`'s closed-seat leg is unnarrated
`householdThresholdConsequence` (`household-band.tsx:149-155`) says "Every household member who
already signs money from this figure moves to <money>, on every job." The RPC also CLOSES a
household-sourced grant sitting on a seat whose `off_job_at` is set
(`set_household_threshold` … `IF v_seat.off_job_at IS NOT NULL THEN … effective_to = GREATEST(...)`),
which the sentence does not name. Not filed: every reader already drops that grant
(`use-project-authority.ts:74`), so no face changes and no figure the studio can see is moved.

---

## 5. What was checked and found sound

* **No cross-tenant read or write.** `client_households` carries member-scoped SELECT/UPDATE
  (`is_active_studio_member(organization_id) AND is_studio_comember(designer_id)`) and an INSERT
  WITH CHECK that adds PR-n (`(co_threshold_cents IS NULL) OR is_org_admin_or_owner(...)`), read off
  `pg_policies`. `studio_contact_merges` and `studio_compliance_notices` are member-SELECT only.
  The three unfiltered reads that rely on RLS (`useProjectHousehold`'s overlap,
  `useComplianceDocumentsFor`, `usePeopleSeats`) are all covered by it.
* **No consent write outside `record_channel_consent`.** Confirmed by grep and by the freeze
  trigger's column list.
* **No data loss on merge.** Every DELETE in the RPC follows a reduction onto the survivor; the
  tombstone and `resolve_merged_contact` keep both ids resolvable, and `people-room.tsx:325-353`
  is the reader that now honours PR-o's promise for `?person=` and `?firm=`.
* **The duplicate band's new act cannot open on a non-card.** `people-derivation.ts:1358-1370`
  narrows to `row.role === 'contact'`, and the live view definition confirms that branch is the
  only one whose `person_id` is a `studio_contacts.id` (the party branch carries
  `pp.studio_contact_id IS NULL`).
* **Every stage `SEAT_BID_OUTCOME_STAGE` can write is in `project_parties_stage_check`** (read off
  the catalog: `declined` and `no_response` are both stage words).
* **`useRemoveProjectParty`'s use of `project_consent_org`** is the consent LEDGER's own resolver,
  which R-BD explicitly keeps (00624's banner: "the LEDGER still resolves through
  project_consent_org()"). Not an R-BD violation.
* **The two new e2e specs** are chromium-pinned (`test.skip(({browserName}) => …)`), use web-first
  `expect` with explicit timeouts and `expect.poll` over `e2e/helpers/supabase-admin.ts`, and every
  selector they name exists in the shipped components (`data-travel-list`, `data-pick-count`,
  `data-carried-consent`, `data-bring-forward-consequence`).
