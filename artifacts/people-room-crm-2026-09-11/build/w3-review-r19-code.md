# W3 (P2) — adversarial code review, round 19

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
HEAD `0225b47ac` (r18 fix round). Working tree clean; the wave is committed.
Diff read in full: `3d65f81e4..HEAD` over `apps/designer-portal/src` and
`packages/supabase/src` — 46 files, +11,341 / −172.
No prod touched, no server started, no port taken, no migration minted.

Verdict: **not clean** — 2 major, 9 minor, 0 blocking.

---

## 1. Prior findings re-checked (r18 fix log)

| r18 finding | State at HEAD | Evidence |
|---|---|---|
| BLOCKING-1 — a bid-outcome save erases a hand-closed seat | **FIXED** | `use-coordination.ts:2586` — the clear branch is now `} else if (written.stage && previous.bidOutcome === 'withdrawn') {`; pinned by `people-crm-w3.test.ts:373` ("leaves a HAND-CLOSED seat's date and reason alone"), 43/43 green |
| MAJOR-1 — the merge doubles a seat and its money authority | **FIXED** | `00629_studio_contact_merges.sql:1698-1717` — the open-seat collision pre-check, `RAISE EXCEPTION 'merge_seat_collision'` before the first write; `use-studio-contacts.ts` carries `MERGE_REFUSAL_SENTENCES.merge_seat_collision` and the `details` branch in `asMergeError` (kind rendered through `getPartyKindLabel`, never a raw token); SQL block 13d is the suite's last block |
| MAJOR-1 — "Add to the household" natively `disabled` | **FIXED** | `household-band.tsx:941-956` — `disabled={addHeld \|\| !personId \|\| addMember.isPending}` **with** `held={addHeld \|\| !personId}`, `aria-describedby` branching `household-grant-held` / `household-person-held`, the visible reason at `:922-929`, `onHeldActivate` routing into the band's `role="alert"`; `DocumentAction` renders `disabled={unavailable && !held}` (`document-action.tsx:309`), so the act stays focusable and `aria-disabled` |
| MAJOR-2 — the report stated a money write the RPC cannot make | **FIXED** | `w3-room-report.md:277-285` and `:401` now say ONE `money` row, `change_order` nowhere in 00632, the two 250000 rows attributed to the seed |

A NEW instance of the r18 BLOCKING-1 *shape* survives on the other branch of the same
`if` — see major-1 below. The r18 fix guarded the **clearing** leg and left the
**stamping** leg ungated.

---

## 2. Gates run in this round (mine, not the report's)

| Gate | Command | Result |
|---|---|---|
| supabase type-check | `pnpm --filter @patina/supabase type-check` | clean (`tsc --noEmit`, no output) |
| designer type-check | `pnpm --filter designer-portal type-check` | clean |
| admin-portal build (shared-package gate) | inline local env, no `.env.local` | **succeeded**, full route table emitted |
| vitest, the wave's hook suites | `npx vitest run src/hooks/__tests__/people-crm-w3.test.ts src/hooks/__tests__/use-households-r16.test.ts` | 2 files, **47 passed** (43 + 4) |
| jest, the wave's surfaces | `npx jest src/components/document/{people,roster}/__tests__ src/lib/document/__tests__/{bring-forward,compliance-notice,write-error}.test.ts` | 33 suites, **533 passed** |
| jest, per file | see major-2 | 45 / 17 / 6 / 8 / 5 / 37 / 50 / 17 / 10 |
| eslint | `npx eslint src/components/document/{roster,people} src/lib/document/{bring-forward,compliance-notice}.ts src/lib/analytics/people-events.ts` | **0 errors**, 4 warnings, all in files this wave did not touch |

---

## 3. Findings

### major-1 — a bid correction on a HAND-CLOSED seat moves the day the seat left the job
**`packages/supabase/src/hooks/use-coordination.ts:2584`** · confidence **high**

```ts
if (patch.bidOutcome === 'withdrawn' && written.moved) {
  dbPatch.off_job_at = new Date().toISOString().slice(0, 10);
} else if (written.stage && previous.bidOutcome === 'withdrawn') {
```

r18 narrowed the SECOND branch to R-BR's own scope (the seat leaving `withdrawn`).
The FIRST branch was left as it was: it stamps `off_job_at = today` on **any** save
whose outcome moves TO `withdrawn`, with no test for a date already standing.

Reachable, and the same population r18 was about. A seat in Bidding is quoted, then the
studio presses **Close this seat** (`useCloseProjectPartySeat` writes `stage='off_job'`,
`off_job_at='2026-09-10'`, `off_job_reason='Picked another electrician'`). The row bands
`done`, but `seatCarriesBid(bid)` is true, so `roster-row.tsx:794` still offers the editor
("Change what came back"). A week later the studio records what actually happened —
"They withdrew" — and `previous.bidOutcome` is `'quoted'`, so `written.moved` is true and
`off_job_at` is rewritten to today. `rosterWindowClause` (`roster-row.tsx:106-125`) then
prints "Off the job 17 Sep 2026. Picked another electrician." over a seat the record said
left on the 10th. Nothing else in the repo holds the original date and no audit row is
written; the consequence sentence beside the press promises only the move to Off the job.

`people-crm-w3.test.ts:418` pins `previous: { bidOutcome: 'selected', stage: 'active' }`
(a live seat) and `:334` pins the withdrawn→withdrawn re-save; the hand-closed→withdrawn
case is unpinned.

**Fix.** Gate the stamp on the seat not already carrying one, the mirror of r18's own
guard: `if (patch.bidOutcome === 'withdrawn' && written.moved && !previousOffJobAt)`, with
`previous` widened to carry `offJobAt` — or, narrower still, gate it on
`previous.stage !== 'off_job'`.

### major-2 — the room report's test and gate numbers are stale again at HEAD
**`artifacts/people-room-crm-2026-09-11/build/w3-room-report.md:67, :69, :72, :396, :397, :398`** · confidence **high**

The report says it was re-measured "in the r15 fix round"; r16, r17 and r18 all changed
these files and §1/§9 were not re-measured with them. Measured at HEAD, file by file:

| Report says | Measured at HEAD |
|---|---|
| `people-crm-w3.test.ts` (40) — twice, §1:67 and §9:397 | **43** |
| `bring-forward.test.ts` (15), §1:67 | **17** |
| `household-band.test.tsx` (34), §1:69 | **45** |
| `roster-row.test.tsx` (26 → 49), §1:72 | **50** |
| `packages/supabase` vitest "105 files, 1346 passed", §9:396 | r18's own log says 106 / 1353 |
| "block 12, the r15 closed-seat pin, is the last", §9:398 | **13d** is last (`w3_merge_sweep_household_test.sql:5191`), after 13, 13b, 13c |

This is the fourth filing of the same defect (r7 M-4, r8 MAJOR-1, r15 MAJOR-3): §9 is the
table a reader uses to decide the wave is verified, and it now understates its own coverage
and misnames the suite's last block. The counts that ARE right (compliance-notice 10,
travel-list 5, compare-merge 17, close-seat 6, archive-door 8, rolodex-picker 37) are
confirmed.

### minor-1 — the flagship terminal act is natively `disabled`, with no `held` and no reason
**`apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx:608`** · confidence **high**

```tsx
<DocumentAction actionKey="merge-studio-contacts" variant="primary"
  disabled={!canMerge || merge.isPending} loading={merge.isPending} …>
  {`Merge into ${survivorName}`}
```

No `held`, so `DocumentAction` emits a native `disabled` (`document-action.tsx:309`) — off
the tab order, no `aria-disabled`, no `aria-describedby`, and no sentence on the face.
`canMerge` is false until the `useEffect` at `:305-314` can take PR-o's pre-pick, which
needs both `useStudioContact` reads to resolve, so on **every** open the sheet's one
terminal act is briefly a dead button labelled "Merge into This card"
(`mergeCardName(null)` → "This card", `:51`); if either card never resolves (RLS, a stale
id) it stays that way with nothing said. This is the rule r18 MAJOR-1 enforced two
components over and that `roster-row.tsx:1078-1081`, `archive-card-door.tsx:97-99` and
`household-band.tsx:941-942` all honour. Either hold it with a reason
("Choose the card that stays." / "These two cards are still loading.") or render the act
only once both cards are in hand.

### minor-2 — `useSetPartyBid` is the seventh writer of `project_parties` and skips `invalidateClientHouseholds`
**`packages/supabase/src/hooks/use-coordination.ts:2628-2634`** · confidence **high**

r15 gave six seat/authority mutations one `invalidateClientHouseholds` helper
(`:30-36`). `useSetPartyBid` writes `stage`, `off_job_at` and `off_job_reason` — the exact
columns `useProjectHousehold`'s open-seat reckoning reads (`use-households.ts:325-441`:
`clientSideHasAuthority`, `clientSideMoneyGrants`, `clientRepSeatCardIds`) — and does not
call it. With `staleTime` at five minutes the band can answer over a seat the same screen
just moved. Low reachability today (the bid editor is gated on `band === 'bidding' || hasBid`
and a client-side seat reaches neither), which is why this is minor rather than major; but
the rule the wave states is "every touched key", and one of seven writers is silently out
of the set.

### minor-3 — only the first bring-forward refusal is translated, while every refused name is listed
**`apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:753-760`** · confidence **high**

```tsx
`${result.refused.map(row => row.name).join(', ')} did not go on the call sheet. ` +
writeErrorMessage({ message: result.refused[0].reason }, 'The studio’s book refused the seat.')
```

`useBringForward` inserts per pick and collects a reason per pick, so two cards refused for
two different reasons (one card in another studio's book, one folded away) read as one
sentence naming both and explaining only the first. Group the names by translated reason,
or say "for different reasons" and name them per row.

### minor-4 — the live primary act does nothing and says nothing with nothing ticked
**`apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:689`** · confidence **high**

R-I forbids gating the act row, and `bringForwardActLabel(0)` correctly reads "Add to the
roster" — but `addPicked` opens with `if (picked.length === 0) return;`. A press in the
sheet's opening state (and the state "Put back" returns to) is a silent no-op: no
`role="alert"`, no status line, nothing. One sentence — "Tick the people you want to bring
forward first." — into `setError` keeps R-I and answers the press.

### minor-5 — `useCreateClientHousehold` is two writes, and the second one failing lies about the first
**`packages/supabase/src/hooks/use-households.ts:528-552`** · confidence **medium**

The INSERT lands, then `designer_clients.household_id` is PATCHed in a separate request and
a failure there `throw`s. `household-band.tsx:476` catches it and prints "Could not open the
household." over a household that now exists; 00632 carries no uniqueness on
`(organization_id, designer_id)` and the room offers no delete, so a retry mints a second
one — r1 BLOCKING-1's shape through a different door. Either write the pointer first, do
both in an RPC, or treat a pointer failure as a warning beside a household that was opened
(the overlap resolver already finds it, because `memberPersonIds` is seeded at `:539`).

### minor-6 — "Papers on file" reads "None" while the two document reads are still in flight
**`apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx:400-403`** · confidence **high**

`String((leftPaper ?? []).length || "None")` cannot tell "no paper" from "not read yet", so
the sheet whose whole job is to show what each card holds before one folds asserts an
absence for the first frame. `useComplianceDocuments` exposes `isLoading`; print "—" (the
table's own "not read" mark, used by `carriedRows`) until it resolves.

### minor-7 — the consequence sentence promises a number and an address that may not exist
**`apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx:141`** · confidence **medium**

"…and `<merged>`'s own number and address travel with them." is unconditional, while the
table three elements above prints "—" for Mobile and Email whenever the folded card holds
neither (the ordinary thin duplicate). The same sentence already branches on the pair for
the contact rule (`:131-138`) and splits trades/specialties/sole-proprietor out (r11
BLOCKING-1); this clause is the one left unbranched. Drop it, or name only what the folded
card actually carries.

### minor-8 — the picker's mini row prints the expiry notice without the `partyKindOwesPaper` gate the roster row applies
**`apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:933, 964-968`** · confidence **low**

`roster-row.tsx:724` gates `data-expiry-notice` on
`partyKindOwesPaper(contactKind ?? row.partyKind)`; the picker's row does not. With the
kind chip on "All" the hit list carries every card in the book, lender and inspector firms
included, and R-A / R-K / R-N say those print no paper word at all. Needs a lender or
inspector card holding a noticed compliance document to surface, which the seed does not
have — hence low confidence and minor — but the gate is one expression and the two
surfaces should read the same rule.

### minor-9 — `CloseSeatAct` never clears its own refusal
**`apps/designer-portal/src/components/document/people/close-seat-act.tsx:127`** · confidence **high**

`setError` is written on failure and never reset — not on reopening the confirm, not on a
later success. A refusal the studio has since fixed keeps standing in the `role="alert"`
paragraph under a seat that closed. `household-band.tsx` and `rolodex-picker.tsx` both
`setError(null)` at the head of every act; the Call Sheet's own copy of this block does the
same. Add `setError(null)` to the confirm handler and to `setConfirming(true)`.

---

## 4. Checked and clean

* **Travel list writes only the allowed facts.** `useBringForward`'s INSERT
  (`use-coordination.ts:2712-2723`) names exactly `project_id, party_kind, display_name,
  company_name, company_id, trade, phone, email, studio_contact_id`. No pricing column, no
  note column, no `show_to_client` (so PD-11's `false` default stands), no bid column, no
  consent column. `TRAVELS` / `STAYS_BEHIND` (`travel-list-pane.tsx:20-34`) match the
  contract, and `roster-row.test.tsx` / `rolodex-picker.test.tsx` sweep the payload for the
  forbidden keys.
* **Consent is never copied per seat.** The whole wave's diff contains no write to
  `sms_consent_*`, `opt_out_*` or `studio_channel_consent`; the only occurrences are reads,
  comments and test fixtures. R-AY / R-AS hold: the verdict is read off the record keyed on
  the channel value, and the merge writes nothing to it by construction.
* **Merge sheet — survivor flip and a true consequence sentence.** `preferredSurvivorId`
  pre-picks the older card and breaks ties on the id; the pre-pick is taken once
  (`:312 if (survivorId || !left || !right) return`), so a refetch cannot undo a flip. Both
  column heads are `aria-pressed` buttons. The sentence branches on the rule PAIR, splits
  the UNIONed trades/specialties and the OR'd sole-proprietor flag out of "the survivor's
  own words stand", states the paper move and the supersede, and closes on the ID promise
  rather than on numbers. The `role="status"` announcement carries the same split.
  Fourteen refusals render as sentences; three read `details` to name the job; a bare
  snake_case token from any other trigger is answered with a sentence
  (`asMergeError`'s `/^[a-z][a-z0-9_]*$/` leg), so no schema word reaches the sheet.
* **PR-n gating.** `householdAddIsHeld` mirrors 00632's own grant leg; "Set the figure",
  "Take the figure away", "Add to the household" and "Record the authority" are each
  `aria-disabled` with a visible reason and an `onHeldActivate` that announces it;
  `useSetHouseholdThreshold` translates a zero-row RPC answer into the principal sentence.
  R-BQ holds on the face: the figure's consequence names only moves, and the per-member
  "Record the authority" act is project-scoped through `add_household_member`.
* **"Close this seat" replaced every hard delete.** `grep '\.delete()'` over the two hook
  files returns two sites: `project_parties` (`use-coordination.ts:1019`, reached only by
  `useRemoveProjectParty`) and `studio_contact_rules` (`use-studio-contacts.ts:1226`,
  a rule, not a seat). The single party-delete call site is `roster-row.tsx:1074-1100`
  ("Added by mistake"), held behind `seatDeleteRefusal`, whose `hasBid` now reads the bid
  COLUMNS as well as the stage list. `CloseSeatAct` is mounted on the person card's
  `liveSeats` only (`person-profile.tsx:515-527`); the Call Sheet keeps its declared second
  copy. The word "Remove" appears on no face.
* **Invalidations.** `useMergeStudioContacts` reaches ten key roots plus `partyBidKeys`,
  `clientHouseholdKeys` and `resolvedContactKeys`; `useAddHouseholdMember` and
  `useSetHouseholdThreshold` reach `peopleKeys`, `peopleSeatKeys`, `partyAuthorityKeys`,
  the project roster and the household roots; six of the seven `project_parties` writers
  call `invalidateClientHouseholds` (the seventh is minor-2).
* **aria rules.** Every gated act in the wave uses `held` + `aria-disabled` + a visible
  reason except compare-merge's terminal act (minor-1). Native `disabled` elsewhere is only
  the `isPending` loading convention the codebase already uses. Pick controls carry
  `role="checkbox"` / `aria-checked` (`party-mini-row.tsx:245-246`); the single-add control
  is a SIBLING of the row button, not nested inside it.
* **Document grammar.** No `box-shadow` and no Tailwind `shadow-*` anywhere in the new or
  changed components. House tokens throughout (`--ink`, `--rail`, `--paper`,
  `--hairline-strong`, `--terracotta-ink` on the People-room surfaces; `--color-*` on the
  Call Sheet surfaces, which is that surface's existing family). `DocSheet` wraps both
  sheets the wave adds (`CompareMergeSheet`, and the picker it extends).
* **SPEC vocabulary.** No raw `client_rep` / `no_response` / `off_job` / `bid_outcome`
  token reaches a face: role words come from `HOUSEHOLD_MEMBER_ROLE_LABELS`, outcomes from
  `SEAT_BID_OUTCOME_ACTS` / `_LABELS`, kinds from `getPartyKindLabel`, stages from
  `getSeatStageLabel`, and `writeErrorMessage` gained ten more 00624 / 00631 tokens.
* **Tenancy.** `client_households` reads carry no `organization_id` predicate but 00632's
  SELECT policy is `is_active_studio_member(organization_id) AND
  is_studio_comember(designer_id)`, and `member_person_ids` holds card ids that are
  themselves org-scoped, so the overlap read cannot reach another studio's row. No
  cross-tenant read or write found.
* **Playwright.** `e2e/people/bring-forward.spec.ts:31` and `merge.spec.ts:23` are both
  chromium-pinned via `test.skip(({ browserName }) => browserName !== "chromium")`.
  Not re-run this round (no port taken).
