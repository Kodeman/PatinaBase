# W3 (P2) — adversarial code review, round 11

Worktree `.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
HEAD `42ddf0aa4`. Reviewed range `3d65f81e4..HEAD` over `apps/designer-portal/src` and
`packages/supabase/src` (45 files, +9345/−157), read in full alongside 00629–00632 and
`specimens/SPEC.md` §5.7. Working tree clean under `apps/`, `packages/`, `supabase/`, `e2e/`.
Local Postgres only. No server started, no port taken, no prod touched, no migration minted.

**Verdict: NOT clean — 1 blocking, 1 major, 9 minor.**

---

## 0. Gates, re-run this round (not taken on trust)

| Gate | Result this round | Report §9 says |
|---|---|---|
| `pnpm --filter @patina/supabase type-check` | rc=0, no output | clean ✓ |
| `pnpm --filter designer-portal type-check` | rc=0, no output | clean ✓ |
| `pnpm --filter admin-portal build` | rc=0, full route table printed | exit 0 ✓ |
| `apps/designer-portal` `npx jest` (whole suite) | **593 suites, 7665 tests, 1 snapshot, all green** | 7656 (stale) |
| the ten W3 suites by file | 10 suites, **174 tests**, all green | — |
| `packages/supabase` `npx vitest run` | **105 files, 1337 passed / 12 skipped** | 1335 (stale) |
| `npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` | **31 passed** | 29 (stale) |

Every gate the brief names is green. The numbers in `w3-room-report.md` §9 and §1 were measured
before the r10 round and were not carried forward (minor m5 below).

## 0b. Prior findings, re-checked

| Round / id | State |
|---|---|
| r10 BLOCKING-1 (data) — folded firm's paper on its crew | **fixed**, 00629 §4f re-issues `identity_paper_state` with `COALESCE(resolve_merged_contact(...), ...)`; pinned by SQL block 11g |
| r10 BLOCKING-1 (portal) — household promising money the RPC leaves standing | **fixed**, `useProjectHousehold` returns `clientSideMoneyGrants` (use-households.ts:300-341) and `householdMemberConsequence`'s `standingGrant` branch (household-band.tsx:186-198) prints the standing figure. New minor m6 on the dedupe inside it |
| r10 MAJOR-1 — dead bid-refusal token | **fixed**, `project_parties_bid_window_check` matches 00631:86-88 |
| r10 MAJOR-2 — picker could not see a person-held paper | **fixed for the picker** (rolodex-picker.tsx:588-597, :615-628). **Still open on the roster row** — see BLOCKING/MAJOR-1 below |
| r10 F1 / R-BP — the sixth bring-forward candidate | **closed**, SPEC §5.7 amended, `bringForwardSelectionLine` doc and e2e updated |
| r9 M-1, r8 B-1, r7 B-1/BLOCKING-1, r6 B-1, r5 M-4, r4 B-1/B-2/B-3, r3 M-2, r1 B-1/M-1..M-7 | re-read in the shipped files; all still closed |

---

## BLOCKING-1 — the merge consequence sentence promises a reduction the RPC does not make, for three of the facts the sheet asks the studio to decide

**Where.** `apps/designer-portal/src/components/document/people/compare-merge-sheet.tsx:122-124`
(and the post-merge announcement, `:403-404`), against
`supabase/migrations/00629_studio_contact_merges.sql:1692-1724`.

The sheet's whole job is stated in its own comment (`compare-merge-sheet.tsx:139-151`): "00629 now
carries every one onto the survivor, COALESCEd, so the survivor's own value wins where it has one —
which makes WHICH CARD SURVIVES the lever that decides which of two typed values the room keeps."
The consequence sentence says so out loud:

> `Everything else ${mergedName} holds — the verdict, the trades, the notes and the payee facts —`
> `travels the same way, and where both cards say something ${survivorName}’s own words stand.`

That is true for `studio_verdict`, `notes`, `legal_name`, `dba_name`, `remit_to`, `retainage_bps`,
`tax_id_last4`, `w9_on_file_at`, `warranty_until` and the three designations — every one of them is
a `COALESCE(s.x, v_merged.x)`. It is **false** for three of the fifteen facts the sheet prints, and
one of the three is named in the sentence:

```sql
-- 00629:1717-1724
is_sole_proprietor = s.is_sole_proprietor OR COALESCE(v_merged.is_sole_proprietor, false),
trades      = s.trades      || ARRAY(SELECT unnest(v_merged.trades)      EXCEPT SELECT unnest(s.trades)),
specialties = s.specialties || ARRAY(SELECT unnest(v_merged.specialties) EXCEPT SELECT unnest(s.specialties))
```

**Failure, concretely.** Adaeze's card carries `trades {electrical}`, Chidi's `trades {plumbing}`.
The sheet prints a `Trades` row with `electrical` in one column and `plumbing` in the other
(`carriedRows`, `:178`), directly under a sentence saying the survivor's own words stand where both
cards say something. The studio flips the survivor to control that value (PR-o's whole purpose).
After the merge the survivor holds `{electrical, plumbing}` — neither column, and the flip changed
nothing about it. Same for `Specialties` (`:179`) and for `Sole proprietor` (`:192`), where a
survivor recorded `false` comes out `true` if the folded card said `true` — and `is_sole_proprietor`
is what decides the person card's Paper region and its document list
(`person-profile.tsx:381/:423/:577`, the reason r6 M-4 put the row in the table at all).

This is the same class this program has twice called blocking — r8 BLOCKING-1 ("the face can no
longer promise a move the write does not make") and r10 BLOCKING-1 ("the household stops promising
money the RPC leaves standing"). R-BN settles the WRITE (array union, `is_sole_proprietor` OR'd);
it says nothing about the sentence, and the sentence contradicts it.

**Fix.** Split the clause: name the COALESCEd facts as "the survivor's own words stand", and say
what the list-valued facts actually do — e.g. "…and the trades and specialties on both cards are
kept together." Do the same for `Sole proprietor`, or mark those three rows in `carriedRows` so the
table stops implying a pick. The announcement at `:403-404` repeats the claim and moves with it.
Confidence: high (the write was read in the migration; the sentence and the table were read in the
component).

---

## MAJOR-1 — the roster row's expiry sentences read only the firm's holder id, so a person-held certificate prints a paper word with no clause

**Where.** `apps/designer-portal/src/components/document/roster/roster-row.tsx:261-263` (the
document read), `:276-281` (`blocking`, the held clause's source) and `:288-296` (`lapsesSoonClause`,
new this wave).

```tsx
const paperNeedsWords = row.paper === 'lapsed' || row.paper === 'lapses_soon';
const { data: heldPaper } = useComplianceDocuments(
  paperNeedsWords && row.companyId ? { holderId: row.companyId } : undefined,
);
…
const lapsesSoonClause = row.paper === 'lapses_soon'
  ? noticedPaperClause([row.companyId], row.companyName, heldPaper, noticeIndex, COMPLIANCE_DOC_TYPE_LABELS)
  : null;
```

The WORD on that row is `people_directory_seats.paper_state`, which is
`identity_paper_state(studio_contact_id, COALESCE(seat.company_id, card.company_id))` — R-BA/R-BJ,
`00626:1677`, `:919-978` — i.e. it reduces worst-first over **the person's own documents and their
firm's**. The row's sentences reduce over the firm's alone. `CallSheetRow` already carries
`row.personId` (`roster-derivation.ts:491`), so the id is in hand and unused.

**Failure, concretely.** A sole proprietor seated as a `sub` with no firm card (`company_id` NULL)
whose own `coi_gl` has lapsed: `paper_state` = `lapsed`, so the row prints the paper word `Lapsed`,
`paperNeedsWords` is true, but `row.companyId` is null → the document query is disabled →
`blocking` is undefined → **no held clause at all**, and `noticedPaperClause([null], …)` returns
null at its own `holders.size === 0` guard (`compliance-notice.ts:109-110`). PR-h ("both, one
source… the roster row prints a held clause in words with a terracotta leading rule") is not kept
for that population, and the same row's person card and Directory row both say more than the Call
Sheet does. With a firm card present but the lapse on the PERSON, the row prints the word and the
sentence names the firm's paper or nothing.

This is exactly the shape r10 MAJOR-2 found on the picker's mini row ("a row could read `Lapsed`
with no sentence beside it") and fixed there with `hits.flatMap(c => [c.company_id, c.id])` plus a
holder-name resolver. The fix was not carried to the roster row, which is the surface direction §3.8
and PR-h actually name.

**Fix.** `useComplianceDocumentsFor([row.companyId, row.personId])` (the holder-agnostic hook this
wave already added, `use-studio-contacts.ts:1606-1641`), `noticedPaperClause([row.companyId,
row.personId], doc => doc.holder_id === row.personId ? row.name : row.companyName, …)`, and widen
`blocking`'s source the same way. Not reachable on today's fixture (one person-held document, expiring
2029-05-01, and it is not in `studio_compliance_notices`), which is why this needs a test rather
than a walk — the pin the picker got in `compliance-notice.test.ts` and `rolodex-picker.test.tsx`.
Confidence: high on the code path, medium on how soon a studio hits it.

---

## Minor findings

**m1 — the travel-list pane's "What stays behind" does not print what SPEC §5.7 #5 and both
published plates print.**
`travel-list-pane.tsx:30-34` ships `prior pricing · prior project notes · show to client`;
`specimens/SPEC.md` §5.7 row 5 and the plates (`people-room-1440.html:1185`,
`people-room-390.html:1319`) all say `2025 pricing · 2025 project notes · Show to client`. The
"What travels" list matches SPEC exactly, so the divergence is deliberate on one side only and
nothing records it. The shipped wording is the honest generic one (the pane is a fixed contract, not
a reading of the rows), so the cheap close is an amendment note under SPEC §5.7 in R-BP's own shape
rather than a code change. Confidence: high.

**m2 — `CloseSeatAct` is "one component, two surfaces" in the report and one surface in the code.**
`person-profile.tsx:521` is its only mount (`grep -rn CloseSeatAct apps/designer-portal/src`).
The Call Sheet row keeps its own independent copy of the two-step close —
`roster-row.tsx:197` (`closing`), `:952-1005` (the sentence, the reason field, the confirm, the
`peopleEvents.seatClosed` call). The report §1 and §6 say the extraction exists so "the wording, the
dated write and `peopleEvents.seatClosed` cannot drift between the two surfaces"; they already
differ — `roster-row.tsx:987` announces `${row.name}'s seat is closed.` with a straight apostrophe,
`close-seat-act.tsx:113` with `’`. Either mount `CloseSeatAct` in the roster row's `closing` branch
(the delete act stays beside it) or correct the report. Confidence: high.

**m3 — `useMergeStudioContacts` leaves three keys stale.**
`use-studio-contacts.ts:1985-1999` invalidates ten key families and not
`clientHouseholdKeys.all` — 00629:2213-2221 rewrites `client_households.member_person_ids` in the
same transaction, so a household read cached on the Call Sheet keeps the folded card's id — nor
`resolvedContactKeys.all` (the deep-link resolver the same wave added) nor
`['studio-contact-history']` (the picker's rollup, keyed on card ids the merge just repointed).
Confidence: high; impact small because each of those surfaces refetches on mount.

**m4 — the room report's gate table and file table carry pre-r10 numbers.**
§9: jest `7656` (measured 7665), vitest `1335` (measured 1337), `people-crm-w3.test.ts` `29`
(measured 31); §1's per-file counts move with them. The r10 fix log has the right figures. Same
carry-forward the report itself says it did for §2/§4/§5/§7. Confidence: high.

**m5 — "the earliest seat wins" is claimed but not implemented in `clientSideMoneyGrants`.**
`use-households.ts:322-340`: `seatRows` is sorted by `created_at` (`:289-290`) and the comment at
`:326` says "The earliest seat wins, because that is the one the RPC reuses" — but the loop iterates
`grantRows` in PostgREST's arbitrary order and the `already` guard keeps the FIRST grant seen, not
the one hanging off the earliest seat. A card holding two `client_rep` seats on one job, each with
an open money grant, can therefore feed `householdMemberConsequence` the wrong standing figure —
the r10 BLOCKING-1 failure, one step in. Reachability is low (`add_household_member` reuses a seat
and `rosterHasIdentity` resists a duplicate add), which is why this is minor. Fix: iterate
`seatRows` and look up each seat's grant, or sort `grantRows` by the seat's `created_at` first.
Confidence: high on the code, low on reachability.

**m6 — the household band resolves its studio through the resolver R-BD retires.**
`call-sheet.tsx:109` `useProjectConsentOrg` → `roster-groups.tsx:204` `organizationId={consentOrg}`
→ `household-band.tsx:225-231` (`isPrincipal`), `:233-236` (the candidate rolodex) and `:360-366`
(the `organization_id` the new `client_households` row is minted with). `project_consent_org()` is
`COALESCE(p.studio_id, _primary_studio_for(p.designer_id))` (00594:—); `project_tenant_org()` is
`COALESCE(p.studio_id, <the caller's studio owned by the project's designer>)` (00624). R-BD binds
every tenant resolution for a project to the latter, and `add_household_member()` gates PR-n on
`project_party_recorded_studio(seat)`, i.e. the tenant resolver — while the picker in the same sheet
already uses `useProjectRecordedStudio`. Measured on the local DB: **5 of 8 projects still carry
`studio_id IS NULL`** after 00628's backfill, and for a designer in two studios (the seed's
`designer@patina.dev`, QA-R3-1's own finding) the two resolvers can name different books — the
household minted in one, its members and PR-n guarded against another. Confidence: high that the
retired resolver is used; medium that a divergence is reachable on the seed.

**m7 — one already-seated pick costs the whole batch.**
`rolodex-picker.tsx:664-680`: `addPicked` collects every ticked card already on the call sheet and
returns before any insert. The report §3 says "One pick refused does not cost the others" — true for
a DATABASE refusal (`useBringForward` inserts per pick and `result.refused` keeps the rest), false
for the refusal Leah's task 5 will actually meet, since the picker lists cards already seated here
and only refuses them at the press. The names are printed and the ticks survive, so it is
recoverable, but the pre-check should drop the seated rows and add the others rather than abort.
Confidence: high.

**m8 — native `disabled` where the unavailability is not a policy hold.**
`DocumentAction` renders `disabled={unavailable && !held}` (`document-action.tsx:305`), so an act
passed `disabled` without `held` leaves the tab order. Three W3 call sites do that:
`household-band.tsx:719` (`disabled={addHeld || !personId || addMember.isPending}` — `held` is only
`addHeld`, so "nothing chosen yet" is a native disable), `compare-merge-sheet.tsx:537`
(`disabled={!canMerge || merge.isPending}`), and the picker's per-row checkbox and its sibling Add
button, `rolodex-picker.tsx:926` / `:937` (`disabled={addParty.isPending || bringForward.isPending}`)
— where SPEC §5.7 #6 says the checkboxes are "never `aria-disabled`, never the `disabled` attribute".
All three are transient/self-evident rather than a refusal with a reason, so this is minor, but the
picker one is named in the acceptance table. Confidence: high.

**m9 — `CompareMergeSheet`'s survivor pre-pick is guarded on the id, not on the pair.**
`compare-merge-sheet.tsx:248-257`: `if (survivorId || !left || !right) return;`. If `leftId`/
`rightId` change while `open` stays true, the stale `survivorId` survives, `canMerge`
(`:386`) is still true, and `merge.mutateAsync({ survivorId, mergedId })` would name a card from the
previous pair while the columns show the new one. Not reachable through `directory-view.tsx`
today — the sheet is a modal `DocSheet` and `setComparing` is its only non-null writer — so this is
a latent guard, not a live defect. Reset on `[leftId, rightId]` rather than on `open`.
Confidence: high on the guard, low on reachability.

---

## What was checked and found sound

- **The travel list writes only the allowed facts.** `useBringForward`'s INSERT
  (`use-coordination.ts:2620-2634`) names `project_id, party_kind, display_name, company_name,
  company_id, trade, phone, email, studio_contact_id` and nothing else — no consent column, no bid
  column, no `show_to_client`, no pricing, no note. `phone_e164` is derived by 00281's BEFORE
  trigger from `phone`, so the consent record keyed on the number resolves without a copy.
- **Consent is never copied per seat.** No `sms_consent_*` write anywhere in the wave
  (`grep` over both trees); the picker reads the verdict off `people_directory` and the evidence off
  `studio_channel_consent` (`rolodex-picker.tsx:375-380`, `:876-895`). R-AY holds.
- **The survivor flip.** `preferredSurvivorId` pre-picks the older card with an id tiebreak, both
  column heads are `aria-pressed` buttons (`:415-452`), the pre-pick is taken once so a refetch
  cannot undo a flip, and `survivor_flipped` is measured (`:393-396`).
- **PR-n.** `householdAddIsHeld` mirrors `add_household_member`'s grant leg (00632:388-401); "Set
  the figure" / "Take the figure away" are `aria-disabled` with `aria-describedby` at a reason line
  that is on the face whether or not the act can be pressed (`household-band.tsx:559-616`,
  `:622-630`); `set_household_threshold`'s refusal is translated
  (`HOUSEHOLD_REFUSAL_SENTENCES.household_threshold_forbidden`). R-BO's two-step clear is intact.
- **Close this seat replaced every hard delete.** Exactly one `.delete()` against `project_parties`
  in the whole repo (`use-coordination.ts:992`), one call site
  (`roster-row.tsx:245` → "Added by mistake"), held behind `seatDeleteRefusal` whose `hasBid` now
  reads the bid COLUMNS as well as the stage list (`:946-953`, `roster-row.tsx:1009-1016`). No
  "Remove" word on a party or a seat.
- **The bid write and its sentence.** `bidStageOutcome` is the one reckoning the mutation writes
  from and the face branches on (`use-coordination.ts:2356-2374`, `roster-row.tsx:424-470`); the
  four sentences cover move / past-the-bid / unchanged / cleared; `off_job_at` is stamped on the
  transition only. All eleven merge refusals, all six bid refusals and all eight household refusals
  have a sentence, and no key is shadowed by a substring of another.
- **Document grammar.** No `box-shadow` in any new or changed file; the new components use the house
  tokens (`--ink`, `--ink-subtle`, `--hairline-strong`, `--paper`, `--rail`, `--terracotta-ink`, all
  defined at `globals.css:1977-2002`) and the `.t-*` steps; every sheet is a `DocSheet`
  (`compare-merge-sheet.tsx:454`, `rolodex-picker.tsx:790`).
- **Hooks above early returns.** Every new component calls all hooks before its first return
  (`HouseholdBand` returns at `:432` after them; `CloseSeatAct` at `:59`; `CompareMergeSheet`,
  `ArchiveCardDoor`, `RolodexPicker`, `TravelListPane` have none).
- **Invalidations.** `useSetPartyBid`, `useAddHouseholdMember`, `useSetHouseholdThreshold`,
  `useBringForward`, `useArchiveStudioContact` / `useRestoreStudioContact` each reach every key
  their write moves; `useMergeStudioContacts` misses three (m4).
- **No trade or homeowner writing surface** was added: every new act is a studio-member act inside
  the designer portal.
- **e2e.** `e2e/people/bring-forward.spec.ts` and `merge.spec.ts` are chromium-pinned
  (`test.skip(({browserName}) => browserName !== 'chromium')`), assert through
  `e2e/helpers/supabase-admin`, and mint/tear down their own rows. Not run, per the brief.
