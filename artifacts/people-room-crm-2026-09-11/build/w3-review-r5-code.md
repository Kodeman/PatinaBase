# W3 (P2) — adversarial code review, round 5

Reviewer context: fresh, separate from the implementer. Worktree
`.codex/worktrees/agent-people-build`, branch `build/people-room-crm-2026-09-11`,
HEAD `61d32968a` ("fix(people-crm): W3 round-4 review — six findings closed"),
working tree CLEAN. Diff read in full against `3d65f81e4` (W2 close-out) for
`apps/designer-portal/src` and `packages/supabase/src` — 45 files,
+7495 / −155. Local Postgres only (`…:54322`, head `00633`, 14 migrations at or
above 00621 applied). No prod. No server started. No migration minted.

**Verdict: CLEAN — zero blocking, zero major.** Ten minor findings below.

---

## 1. Gates, re-run by the reviewer (not taken on the report's word)

| Gate | Result |
|---|---|
| `pnpm --filter @patina/supabase type-check` | rc=0 |
| `pnpm --filter @patina/designer-portal type-check` | rc=0 |
| `pnpm --filter @patina/admin-portal build` | rc=0, full route table printed (the strictest gate, after the shared `@patina/supabase` edits) |
| `cd apps/designer-portal && npx jest` (whole app) | **593 suites, 7634 tests, 1 snapshot — all green** |
| `cd apps/designer-portal && npx jest src/components/document/{people,roster} src/lib/document/__tests__` | 147 suites, 2874 tests green |
| `cd packages/supabase && npx vitest run` (whole package) | **105 files, 1331 passed, 12 skipped** |
| `npx vitest run src/hooks/__tests__/people-crm-w3.test.ts` | 25 passed |

The r4 fix log's numbers reproduce exactly. `@patina/supabase` ships source, not a
dist, so there is no stale dist to rebuild; the admin build is the proof the
shared edit is safe.

## 2. The r4 findings, re-checked one by one

| r4 finding | State | Evidence |
|---|---|---|
| B-1 · merge threw away the Patina account | **FIXED** | `00629` COALESCEs `profile_id`/`email` onto the survivor; `merge_two_logins` present (`grep -c` = 4 over the two new refusal tokens); `merge_studio_contacts` present in the applied DB |
| B-2 · merge dropped a do-not-contact block | **FIXED** | `contact_rule_blocks_contact` exists in the applied DB; `merge_contact_rule_conflict` raised in 00629; the face follows — `compare-merge-sheet.tsx:107,109-114` takes `survivorHasRule` and no longer claims the rule moves |
| B-3 · "an old link still opens this person" was false | **FIXED** | `useResolvedContactId` (`use-studio-contacts.ts`, `resolve_merged_contact` RPC) is the first caller in the repo; `people-room.tsx:115-129, 208-227, 272-292, 329-352` parks the unmatched `?person=`/`?firm=` id and opens the survivor through one `openDirectoryPerson` |
| M-1 · sole-proprietor fold aborted on a renewed certificate | **FIXED** (migration, out of this lane's diff; function present and its suite block 8 is on the branch) |
| M-2 · the report told Fable a shipped change was deferred | **FIXED** on the record |
| M-3 · merge stranded the absorbed firm's agreement links | **FIXED** (migration) |
| QA-2 / code MAJOR-1 · picker's second consent composer | **FIXED** | `carriedConsentNotice` is gone from `lib/document/bring-forward.ts` (only its tombstone comment at :142-156 remains); `rolodex-picker.tsx:795-806` calls `consentSentence()` and resolves `record.origin_project_id` through `useProjects()` |

## 3. The brief's own checklist

**Travel list writes only the allowed facts.** `useBringForward`
(`use-coordination.ts`, the INSERT) names exactly
`project_id, party_kind, display_name, company_name, company_id, trade, phone,
email, studio_contact_id`. No consent column, no `show_to_client`, no bid
column, no notes, no pricing. `show_to_client` is born at PD-11's `false`
default. A test sweeps the payload for the forbidden keys, and
`bring-forward.spec.ts:203-211` asserts it against the database. ✓

**Consent is never copied per seat (R-AY).** The only `sms_consent_*` string in
the whole diff's added lines is a jest fixture
(`project-roster-surfaces.test.tsx`) and a test regex. No hook, component or
lib in this wave reads or writes `project_parties.sms_consent_*` or calls
`record_channel_consent`. ✓

**Merge sheet — survivor flip and a true consequence sentence.**
`preferredSurvivorId` (`compare-merge-sheet.tsx:63-71`) pre-picks the older
card, ties broken on the id; the pre-pick is taken once
(`:159-168`, guarded on `survivorId ||`), so a refetch cannot undo a flip; both
column heads are `aria-pressed` buttons (`:285-310`). The sentence's three
load-bearing claims are each true against 00629: the channel union plus the
scalar-to-channel mint (`00629:1029-1084`) makes "their own number and address
travel with them" true; consent is keyed on `(organization_id, channel_kind,
channel_value)` and is untouched, so "consent stays with the number" is true;
`merged_into` is a tombstone with `resolve_merged_contact()` now wired, so "an
old link still opens this person" is true. ✓

**PR-n gating.** `client_households`' WITH CHECK plus
`assert_household_threshold_principal` (a BEFORE UPDATE trigger that sees OLD,
so erasing is gated too); the face gates ahead of it —
`household-band.tsx:359-362` is `aria-disabled` + `aria-describedby` with the
reason at `:396-404` standing on the face whether pressed or not; and
`useSetHouseholdThreshold` translates the zero-row UPDATE into the principal
sentence. ✓

**Close this seat replaced every hard delete.** Grepping the delete mutations:
`project_parties.delete()` exists at exactly one place
(`use-coordination.ts:992`, `useRemoveProjectParty`), reached from exactly one
call site (`roster-row.tsx:934`, "Added by mistake" at `:950`), held behind
`seatDeleteRefusal` whose `hasBid` now reads the bid COLUMNS as well as the
stage list (`roster-row.tsx:450`, `use-coordination.ts` `SEAT_BID_COLUMNS`).
`studio_contacts` has no delete hook at all; archive/restore go through
00629's RPCs. `CloseSeatAct` is one component on two surfaces
(`person-profile.tsx:518-527` over `liveSeats`, and the Call Sheet row). The
word "Remove" appears on no face in the wave. ✓

**Cross-tenant reads / RLS.** `studio_contact_merges`,
`studio_compliance_notices` and `client_households` all have
`relrowsecurity = t` with member-scoped SELECT policies (queried on the local
DB). Every new list hook filters on `organization_id` beside RLS
(`useComplianceNotices`, `useStudioContactMerges`, `useClientHouseholds`); the
household overlap read leans on RLS, which carries both the tenant leg and the
co-member leg (00632). `useStudioContacts` now filters `merged_into IS NULL` by
default, so no selector offers a folded card. ✓

**Document grammar.** Zero `shadow` / `drop-shadow` in the diff's added lines.
The new people-family files use `t-body-sm` and the `--ink` / `--hairline-strong`
/ `--rail` / `--paper` house tokens; the new roster-family files use the
roster family's own `--color-charcoal` / `--color-pearl` / `--color-aged-oak` /
`--color-clay-ink` and `bg-white/40`, which is byte-for-byte the idiom the
shipped `kickoff-band`, `notice-log` and `promote-band` already use. Every
sheet is a `DocSheet` (`CompareMergeSheet`, `RolodexPicker`); the bid editor and
the household add form are inline bands, not sheets, which is what direction
§3.4 and §4 ask for. ✓

**SPEC vocabulary.** Outcomes render through `SEAT_BID_OUTCOME_ACTS` /
`_LABELS`, roles through `HOUSEHOLD_MEMBER_ROLE_LABELS`, merge evidence through
`MERGE_MATCHED_ON_LABELS`; ten merge refusals, six bid refusals, eight household
refusals and eight new `writeErrorMessage` legs turn bare Postgres tokens into
sentences. ✓

**Hooks above early returns, hydration.** Every new component declares its full
hook list before its first `return` (`HouseholdBand` — 12 hooks then
`if (!household)` at `:265`; `CloseSeatAct` — 4 hooks then `if (!confirming)` at
`:59`; `CompareMergeSheet`, `ArchiveCardDoor`, `TravelListPane`,
`RolodexPicker` likewise). No new `new Date()` reaches render output. ✓

---

## 4. Findings

All minor. Severity ladder as briefed: none is a wrong fact on a face, a
cross-tenant read or write, an RLS or grant hole, a consent write outside
`record_channel_consent`, a reset failure, or data loss on merge; none is a
reader disagreeing with the record on a shipped face, a broken Leah task, or a
broken a11y contract.

### m-1 · `merge.spec.ts` cannot pass: the room's own announcer holds the merged card's name

`apps/designer-portal/e2e/people/merge.spec.ts:178`

```ts
await expect(page.getByText(NEWER_NAME)).toHaveCount(0);
```

Two assertions earlier the same test proves the announcer says
`"Two cards are now one. <survivor> carries everything <merged> held."`
(`merge.spec.ts:171-174`). That string is composed at
`compare-merge-sheet.tsx:273-276` and lands verbatim in
`<p data-people-announcer className="sr-only">{announcement}</p>`
(`people-room.tsx:703-707`) via `directory-view.tsx:530` →
`people-room.tsx:571-574`, which also sets the visible `notice`. Playwright's
text engine matches the smallest element containing the substring, and that
`<p>`'s own text node contains `NEWER_NAME` — so the locator resolves to 1, not
0, and `sr-only` (a 1px clipped box) is still a match for `toHaveCount`.

Neither spec has ever been run (room report §10.1), so this is unmeasured but
deterministic by construction. Fix: scope the assertion to the Directory list
rather than the page, or assert the row locator
(`[data-directory-row]`, `[data-compare-merge]`) is gone.
**Confidence: high.**

### m-2 · the wave's one gated act that uses native `disabled` instead of `held`

`household-band.tsx:472` — `disabled={!personId || addMember.isPending}` on
"Add to the household", with no `held`, no `aria-disabled` and no reason line.

Every other gated act in this wave follows the room's §5.5 grammar:
`archive-card-door.tsx:97-99` (`disabled` + `held` + `aria-describedby` + a
sentence that stands whether or not the act can be pressed),
`household-band.tsx:275-277` and `:359-362` (`aria-disabled` + `describedby`),
and the exactly-analogous shipped control — "nothing typed yet" on the send-SMS
act — is `roster-row.tsx:1069-1070`, `held={!body.trim()} disabled={!body.trim()
|| sendSms.isPending}`. Native `disabled` takes the control out of the tab
order, which is the harm `held` exists to prevent.

`compare-merge-sheet.tsx:395` (`disabled={!canMerge || merge.isPending}`) is the
same shape but only transiently true while the two cards load, so it is the
weaker half of this finding.
**Confidence: high.**

### m-3 · clearing a bid outcome leaves the seat's stage where the outcome put it

`use-coordination.ts`, `useSetPartyBid`:

```ts
if (patch.bidOutcome !== undefined) {
  dbPatch.bid_outcome = patch.bidOutcome ?? null;
  if (patch.bidOutcome) { dbPatch.stage = SEAT_BID_OUTCOME_STAGE[...]; … }
}
```

The stage moves only when an outcome is SET. The editor's first option is
`<option value="">Nothing recorded yet</option>`
(`roster-row.tsx`, the "How it came back" select), so a studio that records
"They declined" and then corrects to "Nothing recorded yet" writes
`bid_outcome = NULL` and leaves `stage = 'declined'`. The row then prints the
stage word "Declined" (`roster-row.tsx:537`, `<StateWord family="stage">`) for a
bid the record no longer carries, and the editor's own sentence — "The outcome
is what moves them out of the bidding band. Nothing else on this row does." — is
false in that direction. This is the symmetric half of the one-way door MAJOR-7
closed for the editor's visibility.
**Confidence: high.**

### m-4 · `off_job_at` is stamped on "They withdrew" and never cleared on a correction

Same hook: `if (patch.bidOutcome === 'withdrawn') dbPatch.off_job_at = today`.
Nothing clears it when the outcome is corrected away from `withdrawn`.
`rosterBandFor` bands on `stage` alone (`use-coordination.ts:1743-1755`), so the
stale date is invisible while the seat is back in a crew or bidding band — but
the moment any other door bands the seat `done`, `rosterWindowClause`
(`roster-row.tsx:106-110`) prints "Off the job &lt;date&gt;." carrying the date
of a withdrawal the studio retracted.
**Confidence: medium** (the harm needs a second, later act).

### m-5 · the picker asks for a notice clause on holders whose paper it never fetched

`rolodex-picker.tsx:364-373` builds `firmIds` from `hits.map(c => c.company_id)`
only, and `useComplianceDocumentsFor(open ? firmIds : [])` is the only document
read on the sheet. `paperClauseFor` (`:490-497`) then asks
`noticedPaperClause([contact.company_id, contact.id], …)` — the person's own
card id is in the holder set but no person-held document is ever in
`firmPaper`. So a sole proprietor whose certificate sits on their own person
card (R-BA's own case) can never earn the expiry-notice clause on a pick row,
while the same notice prints on the roster row and the company card.

Second, latent half: `holderName` is `firmNameFor(contact) ?? contactName(contact)`
— the FIRM's name — so if a person-held document ever did reach that list the
clause would attribute the person's own licence to their firm.

Measured on the local seed: 36 compliance documents, 35 company-held and one
person-held (Luis Ochoa, `other_named`, expires 2029-05-01), and the sweep's
three notices are all company-held (Ostrom Builders, Northgate Electric,
Lakeshore Painting Co.). So neither half is reachable today.
**Confidence: high** (the code path), **low** that it bites the current fixture.

### m-6 · the household band mints into `project_consent_org`, the guards read `project_recorded_studio`

`call-sheet.tsx:109` resolves `consentOrg` through `useProjectConsentOrg`, hands
it to `RosterGroups`, which hands it to `HouseholdBand` as `organizationId`
(`roster-groups.tsx`, the `band === 'clientSide'` mount) and uses it for the bid
editor's estimator list (`roster-groups.tsx:75, 118-127`). `HouseholdBand` then
WRITES it as `client_households.organization_id`
(`household-band.tsx:201-212`).

Measured on the local DB:

```
project_consent_org   = COALESCE(p.studio_id, _primary_studio_for(p.designer_id))
project_recorded_studio = p.studio_id            -- strictly
```

Every guard these acts hit resolves through the second one:
`assert_project_party_cards()`, `assert_party_bid_quoted_by()`, and
`add_household_member`'s grant leg via `project_party_recorded_studio`. The
picker in this same wave already reads `useProjectRecordedStudio` for exactly
this reason (`rolodex-picker.tsx:224-236`, CR5-1) and withholds the stamp when
it is NULL. On the R-BI legacy population (`projects.studio_id IS NULL`) the
household band instead offers "Open a household", mints a row in the fallback
org, and the member add is then refused — in words, since `write-error.ts` now
translates `party_card_project_has_no_studio`. No data is lost; an orphan row
is.
**Confidence: medium-high.**

### m-7 · an unparseable figure silently erases the household's change-order figure

`household-band.tsx:226-234`:

```ts
const digits = figure.replace(/[^0-9.]/g, "");
const dollars = digits ? Number(digits) : NaN;
… coThresholdCents: Number.isFinite(dollars) ? Math.round(dollars * 100) : null
```

`""`, `"tbd"` and `"1.2.3"` all reach `null`, which is "take the figure off the
record" — under an act labelled "Write the figure", with no consequence
sentence and no confirm. The band then flips to "No change-order figure is on
file for this household." and `add_household_member()` stops writing the money
authority row. 00632 itself treats erasing as a money change (that is the whole
reason `assert_household_threshold_principal` exists), so the face is the looser
of the two gates.
**Confidence: high.**

### m-8 · opening a household is two writes, and the orphan path is narrowed rather than closed

`use-households.ts:341-365` — the INSERT lands, then
`designer_clients.household_id` is UPDATEd in a second statement. If that second
write fails (`designer_clients` carries both a permissive studio policy and two
RESTRICTIVE designer-only write policies, 00316 + 00555:1418-1441) while
`memberPersonIds` was empty — the `householdWouldBeFindable` branch satisfied by
`designerClientId` alone (`household-band.tsx:188-189`) — the household is
invisible to `useProjectHousehold`'s two ways in, the band prints the same
sentence and the same door, and the next press mints another row. 00632 has no
uniqueness constraint and the room offers no delete. This is r1 BLOCKING-1's
shape, narrowed by r3 MAJOR-2 but not closed.
**Confidence: medium.**

### m-9 · two invalidation gaps, both five minutes wide

`lib/react-query.ts:177` sets `staleTime: 5 minutes`, so a key nobody
invalidates stays stale for that long.

* `useMergeStudioContacts` invalidates ten key families but not
  `['studio-contact-history', …]` — the picker's rollup, whose distinct-project
  count and prior-job names move the moment `project_parties.studio_contact_id`
  is repointed — and not `resolvedContactKeys`, so an id resolved to itself
  before the merge keeps answering itself afterwards.
* `useBringForward` invalidates parties, roster, bids, people and seats, but not
  the same history key; re-opening the picker inside the window still prints the
  pre-add rollup.

Neither shows a wrong fact (the history line's job names do not change, only the
counts), and the picker closes on success.
**Confidence: high.**

### m-10 · the merge sheet promises a rule move that 00629 will refuse

`compare-merge-sheet.tsx:109-114` reads "seats, channels, contact rule and firm
designations move onto &lt;survivor&gt;" whenever the survivor carries no rule
— which is precisely the case 00629 refuses with `merge_contact_rule_conflict`
when the absorbed card's rule BLOCKS (r4 B-2: raised when the absorbed rule
blocks and the survivor's does not). The studio reads a promise, presses, and
gets a refusal.

The refusal's sentence is good and actionable ("Settle one rule on the card you
are keeping, then merge."), and the Contact rule row two elements above shows
the block clause, so a careful reader is not misled. But the sheet already holds
both rules (`ruleIndex`, `:175-176`) and `contactRuleIsHardBlock` — R-BL's one
formula — is already imported elsewhere in the room, so the sheet could say it
before the press rather than after.
**Confidence: high.**

---

## 5. Not findings (checked, and correct)

* The Playwright specs are chromium-pinned (`test.skip(({browserName}) =>
  browserName !== "chromium")` in both), use web-first `expect` and
  `expect.poll` over `e2e/helpers/supabase-admin.ts`, and tear their own
  fixtures down. `bring-forward.spec.ts` runs `sweep_compliance_expiries()` in
  `beforeAll` so the Northgate clause has a notice row behind it, and opens its
  own project rather than mutating the seeded Okonkwo residence.
* `directoryDuplicatePairs`' new `row.role !== "contact"` guard
  (`people-derivation.ts`) is right: the CONTACTS branch is the only one of
  `people_directory`'s five that emits a `studio_contacts` id as `person_id`
  (`00629`, the branch tails at `'client'`, `'lead'`, `'maker'`, `'team'`,
  `'contact'`), and the merge act takes two card ids.
* `noticedPaperClause` prints only where `studio_compliance_notices` holds a
  row, so a certificate that crossed the line before any sweep ran never claims
  the studio was told. `indexComplianceNotices` upgrades to `lapsed` regardless
  of arrival order.
* `useComplianceDocumentsFor` applies `retainedComplianceDocuments`, so a
  superseded document's notice cannot print beside a `Current` paper word
  (M2R-7 holds).
* `rosterMetaLine`'s new firm segment is suppressed on a firm's own row, and the
  390 name floor (`min-w-[8rem] flex-1 sm:min-w-0` + `flex-wrap`) leaves the
  1440 row untouched.
* The bring-forward seat is born `phone` only; 00281's
  `normalize_party_phone_e164` BEFORE trigger (re-attached to `studio_contacts`
  by 00417:207) fills `phone_e164`, which is the value
  `people_directory_seats.consent_status` keys on. The Birth rule holds with no
  consent write.
* Archiving from the person card does not blank the card: the CONTACTS branch
  filters `merged_into IS NULL` only and emits `status = 'archived'`, so the
  profile stays standing and the door flips to "Bring this card back".
