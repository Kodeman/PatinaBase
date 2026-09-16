# W2a — the foundation: vocabulary, hooks, primitives, analytics

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Local only. **Nothing was pushed to Strata**: no `supabase db push`, no `supabase functions deploy`,
no migration minted (W2 still mints from **00628**).

This wave builds nothing the studio can see. It is the layer W2b and W2c write the surfaces on,
so **§1 is the import list** — every export, with its file — and the rest is what those exports
mean and what they deliberately refuse to do.

---

## 0. The three things a builder must read before importing anything

1. **The consent word never comes from `status_raw`.** v4 puts the rolodex ARCHIVE state there for
   a carded human, so `status_raw` reads `active` for someone the studio's record says `opted_out`.
   Read `consent_status`, and render **nothing** when it is null — "no record" is its own fact and
   "Not asked" over a dated refusal is the fail-open word this program removed (R-BB).
2. **`usePerson(<seat id>)` finds nothing for a carded seat.** The Call Sheet chevron and the roster
   row pass a `project_parties.id`; v4 keys a carded human on their ROLODEX CARD. Use
   **`usePersonSeat`** (R-BE).
3. **`PartyKind` is wider than the database CHECK.** PR-f's four new kinds are in the type and the
   labels; `project_parties_party_kind_check` still admits only eleven. Gate anything that WRITES a
   seat on `PARTY_KINDS_ACCEPTED_BY_DB`. §6 owes the migration.

---

## 1. Every export, by file

### `packages/types/src/field-config.ts`

| Export | Kind | What it is |
|---|---|---|
| `FieldTrade` | type | widened by PR-f: `radon_mitigation`, `insulation`, `waterproofing`, `septic` (+ the shipped `roofing`) |
| `ALL_FIELD_TRADES` · `FIELD_TRADE_LABELS` · `getFieldTradeLabel` | const/fn | unchanged shape, four new entries |
| `PartyKind` | type | widened by PR-f: `inspector`, `lender`, `engineer`, `other_named` |
| `ALL_PARTY_KINDS` | const | **new** — the fifteen, in order |
| `PARTY_KINDS_ACCEPTED_BY_DB` | const | **new** — the ELEVEN the CHECK admits today. Gate every seat WRITE on this |
| `isPartyKindWritable(kind)` | fn | **new** — the predicate for the above |
| `PARTY_KIND_LABELS` · `getPartyKindLabel` · `FIELD_PARTY_KINDS` · `isFieldPartyKind` | const/fn | unchanged shape, four new entries |
| `PARTY_KINDS_REQUIRING_LABEL` · `partyKindRequiresLabel(kind)` | const/fn | **new** — `other_named` needs a written label beside it |
| `InspectorSubtype` | type | **new** — `ahj \| lender \| third_party` |
| `ALL_INSPECTOR_SUBTYPES` · `INSPECTOR_SUBTYPE_LABELS` · `getInspectorSubtypeLabel` · `isInspectorSubtype` | const/fn | **new** |
| `INSPECTOR_SUBTYPE_META_KEY` | const | **new** — `'inspector_subtype'`. There is NO column; the value rides in the seat's `meta` (§6) |
| `partyKindOwesPaper(kind)` | fn | **new** — R-A/C13/C24: a lender or an inspector prints NO paper word at all. The view reports `not_on_file`; this predicate is the DISPLAY rule that decides whether the fact is owed |

### `packages/types/src/studio-config.ts`

| Export | Kind | What it is |
|---|---|---|
| `StateWordPigment` | type | `current \| pending \| blocked \| dormant` |
| `StateWordFamily` | type | `reach \| consent \| stage \| paper` |
| `StateWordPigmentTokens` | interface | `{ border, color }` |
| `STATE_WORD_PIGMENTS` | const | **the pigment table.** sage/golden/terracotta/hairline+faint, as `var(--…)` names. Identical to SPEC §2.2's four `.word--*` rules |
| `REACH_STATE_PIGMENTS` | const | Account current · Field link pending · On paper dormant |
| `ConsentWord` · `ALL_CONSENT_WORDS` · `CONSENT_WORD_LABELS` · `CONSENT_WORD_PIGMENTS` | type/const | `texting \| invited \| opted_out \| not_asked` |
| `consentWordFor(status)` | fn | record status → word. **Returns `null` for a null/absent status** |
| `SeatStage` · `ALL_SEAT_STAGES` | type/const | the TWELVE values `project_parties.stage`'s CHECK admits |
| `SeatStageWord` · `ALL_SEAT_STAGE_WORDS` · `SEAT_STAGE_WORD_LABELS` · `SEAT_STAGE_WORD_PIGMENTS` | type/const | the NINE words direction §3.8 prints |
| `seatStageWordFor(stage)` · `getSeatStageLabel(stage)` | fn | twelve → nine: `invited`→Bidding, `mobilized`/`active`→On the job, `retired`→Off the job |
| `PaperState` · `ALL_PAPER_STATES` · `PAPER_STATE_LABELS` · `PAPER_STATE_PIGMENTS` · `paperStateFor` | type/const/fn | `current \| lapses_soon \| lapsed \| not_on_file` |
| `StateWordResolution` | interface | `{ family, value, label, pigment, tokens }` |
| `resolveStateWord(family, value)` | fn | **the one reduction.** Any raw family value → its word and its pigment, or `null` |

`ReachState` / `REACH_STATE_LABELS` / `getReachStateLabel` are unchanged.

### `packages/supabase/src/hooks/use-people.ts`

| Export | Kind | Notes |
|---|---|---|
| `PeopleDirectoryRow` | interface | **v4.** Twelve shipped columns + `reach_state`, `consent_status`, `paper_state`, `contact_rule_summary`, `seat_count` |
| `PeopleDirectorySeat` | interface | **new** — one row of `people_directory_seats` (31 columns) |
| `PeopleFilters` · `PeopleSeatFilters` | interface | `search` now also matches phone DIGITS (4+, suffix match) |
| `PersonSeatResolution` | interface | **new** — `{ seat, identity }` |
| `peopleKeys` | const | `.all` · `.list(filters)` · **`.person(id, role)`** (new — was an inline literal) |
| `peopleSeatKeys` | const | **new** — `.all` · `.list(filters)` · `.seat(seatId)` |
| `usePeopleDirectory(filters?)` | hook | unchanged call shape; rows widen |
| `usePerson(personId, role?)` | hook | the IDENTITY reader. Unchanged, and **not** the seat reader |
| `usePeopleSeats(filters?)` | hook | **new** — a person's seats, or a project's roster |
| `usePersonSeat(seatId)` | hook | **new, R-BE** — seat → identity |
| `PartyRole` · `FIELD_ROSTER_ROLES` · `isFieldRosterRole` | type/const/fn | unchanged |

### `packages/supabase/src/hooks/use-consent.ts` — **new file**

| Export | Kind | Notes |
|---|---|---|
| `ConsentChannelKind` · `ConsentStatus` · `ConsentSource` | type | `sms\|email` · the four statuses · the five sources |
| `ChannelConsentRecord` | interface | a `studio_channel_consent` row |
| `ChannelConsentResolution` | interface | `{ verdict, record }` — the verdict from `channel_consent_status()`, the dates from the row |
| `consentKeys` | const | `.all` · `.record(org, kind, value)` — all three parts of the PK |
| `useChannelConsent(org, kind, value)` | hook | asks the VERDICT function and the record together |
| `useRecordChannelConsent()` | hook | `record_channel_consent`. PR-m's manual opt-out goes here |
| `useRecordChannelInvite()` | hook | `record_channel_invite` — the ADD path's door; cannot lower a standing grant |
| `useRecordChannelReconsent()` | hook | `record_channel_reconsent` — the studio's way back from a refusal |
| `useProjectConsentOrg(projectId)` | hook | `project_consent_org()`; `null` = no studio to record against |
| `asWrittenConsentError(error)` | fn | the RPCs' seven named refusals, as sentences |
| `CONSENT_LEGACY_FROZEN` · `CONSENT_FROZEN_SENTENCE` | const | the freeze's errcode and its English |
| `RecordChannelConsentInput` · `RecordChannelInviteInput` · `RecordChannelReconsentInput` | interface | — |

### `packages/supabase/src/hooks/use-access-grants.ts` — **new file**

| Export | Kind | Notes |
|---|---|---|
| `AccessGrant` | interface | a `v_access_grants` row (12 columns, no bearer credential) |
| `AccessGrantTier` · `ALL_ACCESS_GRANT_TIERS` | type/const | the eleven tiers |
| `ACCESS_GRANT_TIER_LABELS` · `ACCESS_GRANT_TIER_OPENS` | const | the words, and "what it opens" |
| `AccessGrantFilters` | interface | `subjectId` / `scopeId` / `tier` / `includeRevoked` |
| `accessGrantKeys` | const | `.all` · `.list(filters)` |
| `useAccessGrants(filters?)` | hook | newest door first |
| `AccessGrantRevokeRoute` | interface | `{ rpc, idArg, reasonArg?, reasonRequired?, revokesWholeScope?, keySegment }` |
| `ACCESS_GRANT_REVOKE_ROUTES` | const | **the routing table** — all eleven tiers named, four routed, seven `null` |
| `accessGrantRevokeRoute` · `isAccessGrantRevokable` · `accessGrantNaturalKey` | fn | — |
| `ACCESS_GRANT_NOT_REVOKABLE_SENTENCE` | const | what a surface prints where no door exists here |
| `useRevokeAccessGrant()` | hook | routes to the tier's own RPC. Never writes a token table |
| `RevokeAccessGrantInput` | interface | — |

### `packages/supabase/src/hooks/use-studio-contacts.ts`

| Export | Kind | Notes |
|---|---|---|
| `StudioContact` | interface | **widened** with 00592's card columns: `is_sole_proprietor`, `studio_verdict(_at)`, and the twelve company-card fields |
| `StudioCompanyCardFields` · `StudioPersonCardFields` · `UpdateStudioContactCardPatch` | interface/type | **new** — the camelCase patch shape |
| `UpdateStudioContactInput.card` | field | **new** — `useUpdateStudioContact` patches the card fields through it |
| `ContactChannelKind` · `ALL_CONTACT_CHANNEL_KINDS` · `CONTACT_CHANNEL_KIND_LABELS` | type/const | the seven kinds (00592's CHECK) |
| `PERSON_CHANNEL_KINDS` · `COMPANY_CHANNEL_KINDS` | const | which lines belong to which card |
| `ContactChannelStatus` · `ALL_CONTACT_CHANNEL_STATUSES` · `isContactChannelHeld` | type/const/fn | held = anything but `active` |
| `StudioContactChannel` | interface | — |
| `studioChannelKeys` · `useStudioContactChannels(ownerId)` | const/hook | preferred first, then by kind |
| `useAddStudioContactChannel` · `useUpdateStudioContactChannel` · `useSetStudioContactChannelStatus` | hook | status moves; **nothing deletes a channel** |
| `AddStudioContactChannelInput` · `UpdateStudioContactChannelInput` · `SetStudioContactChannelStatusInput` | interface | — |
| `ContactRuleSubjectType` · `ContactRuleChannel` · `ALL_CONTACT_RULE_CHANNELS` | type/const | `person\|company\|engagement`; the seven kinds + `sms` |
| `StudioContactRule` · `SetStudioContactRuleInput` | interface | — |
| `contactRuleKeys` · `useContactRule` · `useSetContactRule` · `useClearContactRule` | const/hook | one rule per subject; **`null` is a fact**, not an empty rule |
| `StudioPersonAffiliation` · `AffiliationFilters` · `SetAffiliationInput` | interface | — |
| `affiliationKeys` · `useAffiliations` · `useSetAffiliation` · `useCloseAffiliation` | const/hook | close with a date, never delete |
| `ComplianceDocType` · `ALL_COMPLIANCE_DOC_TYPES` · `COMPLIANCE_DOC_TYPE_LABELS` | type/const | the nine (00623's CHECK) |
| `DATED_COMPLIANCE_DOC_TYPES` · `complianceDocRequiresExpiry` | const/fn | the five that can lapse |
| `ComplianceBlock` · `ALL_COMPLIANCE_BLOCKS` · `COMPLIANCE_BLOCK_LABELS` | type/const | `site_access \| payment \| draw` |
| `StudioComplianceDocument` · `ComplianceDocumentFilters` · `RecordComplianceDocumentInput` | interface | — |
| `complianceKeys` · `useComplianceDocuments` · `useComplianceState` · `useRecordComplianceDocument` · `useConfirmComplianceDocument` | const/hook | soonest expiry first, undated last |

### `packages/supabase/src/hooks/use-coordination.ts`

| Export | Kind | Notes |
|---|---|---|
| `ProjectParty` | interface | the eight `sms_consent_*` fields are documented **FROZEN**; they stay because `select('*')` still returns them |
| `AddProjectPartyInput` | interface | unchanged shape; `textUpdates` now records ONLY on the record |
| `RecordPartySmsConsentInput` | interface | **gains `projectId`** (required) — the record is the studio's, resolved from the job |
| `CloseProjectPartySeatInput` | interface | **new** |
| `useCloseProjectPartySeat()` | hook | **new** — `stage='off_job'`, dated `off_job_at`, a reason. The act that replaces Remove |
| `SeatDeleteRefusal` · `SEAT_DELETE_REFUSAL_SENTENCES` · `seatDeleteRefusal(facts)` | type/const/fn | **new** — the mistaken-add predicate, pure, so a surface can explain the act before it is pressed |
| `useRemoveProjectParty()` | hook | still a DELETE, now gated on the predicate (consent record / bid stage / held paper) |
| `RosterBand` · `ROSTER_BANDS` · `ROSTER_BAND_LABELS` | type/const | this week · later · bidding · done |
| `RosterWindowSeat` | interface | `{ stage, on_site_from, on_site_to }` — both seat shapes satisfy it |
| `rosterBandFor(seat, today)` · `groupRosterByWindow(seats, today)` · `rosterDateKey(date)` | fn | **pure**, `today` injected |
| `useProjectRosterByWindow(projectId, today?)` | hook | `usePeopleSeats` + the banding; returns `{ …query, bands }` |
| `AuthorityScope` · `ALL_AUTHORITY_SCOPES` · `AUTHORITY_SCOPE_LABELS` | type/const | the seven (00624's CHECK) |
| `ADMIN_ONLY_AUTHORITY_SCOPES` · `isAdminOnlyAuthorityScope` | const/fn | PR-n: `money` + `draw_certify` |
| `ProjectPartyAuthority` · `SetPartyAuthorityInput` | interface | `threshold_cents` is integer CENTS ($2,500 = `250000`) |
| `partyAuthorityKeys` · `usePartyAuthority` · `useSetPartyAuthority` | const/hook | an RLS refusal on an admin-only scope comes back as a sentence |
| `SiteAccessEmergencyLine` · `ProjectSiteAccessCard` · `UpdateSiteAccessCardInput` | interface | **no code column, by design (PR-r)** |
| `siteAccessKeys` · `useSiteAccessCard` · `useUpdateSiteAccessCard` · `useLogSiteAccessTold` | const/hook | a change stamps `changed_at`/`changed_by` and **clears `told_refs`** |
| `normalizePartyPhoneForCompare` | fn | unchanged |

### `packages/supabase/src/hooks/use-party-sms.ts`

| Export | Kind | Notes |
|---|---|---|
| `useCreateFieldLink()` | hook | **input widened** to `{ partyId, expiresAt?, projectId? }` and now calls the TWO-argument `create_field_link` (PR-d/PR-l: the expiry comes off the seat's window). `{ partyId }` alone still compiles |
| `CreateFieldLinkInput` | interface | **new** |

All of the above are re-exported from `packages/supabase/src/hooks/index.ts`.

### `apps/designer-portal/src/lib/document/directory-roles.ts`

| Export | Kind | Notes |
|---|---|---|
| `DIRECTORY_ROLES` | const | unchanged — the FROZEN legacy eleven, in order |
| `LegacyDirectoryRole` | type | **new** — one of those eleven (narrower than `DirectoryRole`) |
| `DirectoryChip` · `DIRECTORY_CHIPS` · `DIRECTORY_CHIP_LABELS` | type/const | **new** — everyone · clients · crew · makers · studio · firms |
| `DEFAULT_DIRECTORY_CHIP` | const | `'everyone'` |
| `LEGACY_ROLE_TO_CHIP` | const | **the forward map**, eleven → six |
| `isDirectoryChip` · `isLegacyDirectoryRole` · `directoryChipFromParam(raw)` | fn | an unreadable `?role=` opens on Everyone, never an empty room |

### `apps/designer-portal/src/components/document/people/` — the primitives

| File | Export | Notes |
|---|---|---|
| `state-word.tsx` | `StateWord({ family, value, plain?, className? })` | the one bordered mono word, all four families. **Renders `null` for a value that names no word** |
| | `PlainFact({ children, className? })` | authority, as plain uncoloured text — never a state pigment |
| `contact-rule-line.tsx` | `ContactRuleLine({ summary, blocked?, routeTo?, className? })` | the E7 sentence; a hard block takes the 2px `--terracotta-ink` leading rule on the `--rail` ground |
| | `ContactRouteTarget` | `{ name, email?, officePhone? }` |
| | `routedSentence(name)` | `"Write <name> instead."` — one wording |
| `seat-line.tsx` | `SeatLine({ seat, onOpen, className? })` | project · kind · trade · **stage word** · window, as a BUTTON (R-AA) |
| | `seatWindowText(from, to)` · `formatSeatDate(value)` · `seatLineParts(seat)` | pure |
| `tel-link.tsx` | `TelLink({ phone, label?, personName?, fullWidth?, className?, onClick? })` | its own 44×44 control; `fullWidth` is R-X's 390 adaptation |
| | `telHref(phone)` | pure |
| `person-bits.tsx` | `ConsentChip({ status, plain? })` | **rebound to `StateWord`**'s consent family |
| | `RoleBadge({ role })` | **raised to the 12px `.t-meta` floor**; identity hues held off the four state tokens |
| | `Avatar` · `initials` · `companyKindBadgeStyle` | unchanged |
| | ~~`StatusDot`~~ | **DELETED** (§3) |

### `apps/designer-portal/src/lib/analytics/people-events.ts` — **new file**

`peopleEvents` with nine acts: `directoryChip`, `personCardOpened`, `companyCardOpened`,
`consentRecorded`, `grantMinted`, `grantRevoked`, `seatClosed`, `siteAccessChanged`,
`bringForwardPicked`. Plus `PEOPLE_EVENT_NAMES` and one properties interface per act. Re-exported
from `lib/analytics/index.ts`. Nothing here is an engagement metric — every event is the shape of
one act (the studio surface is never optimized for engagement).

---

## 2. The stage ladder, stated once

`project_parties.stage`'s CHECK has **twelve** values; direction §3.8 prints **nine** words.
`seatStageWordFor` is the reduction, and it is the only place it exists:

| Stored | Word | Pigment |
|---|---|---|
| `prospect` | Prospect | dormant |
| `invited` | **Bidding** | pending |
| `bidding` | Bidding | pending |
| `declined` | Declined | dormant |
| `no_response` | No response | dormant |
| `awarded` | Awarded | pending |
| `mobilized` | **On the job** | current |
| `active` | On the job | current |
| `closeout` | Closing out | pending |
| `warranty` | Warranty | dormant |
| `off_job` | Off the job | dormant |
| `retired` | **Off the job** | dormant |

The stage family never spends the **blocked** pigment — a stage is where the work stands, not a
thing that holds the work up. A test asserts that over all twelve.

**The band rule** (ux-1-ia §5, direction §3.4), in `rosterBandFor`: a done stage decides outright,
then a bid stage, then the window — `on_site_from > today` is Later, and everything else (a window
covering today, a closed window on a seat still marked crew, or no window at all) is this week.
`prospect` rides in Bidding: it is pre-award and belongs to no crew band.

---

## 3. R-AS — every portal writer of the frozen columns, gone

`grep` over `packages` and `apps` for a write to any of the eight columns returns **none**. What was
removed, and what replaced it:

| Writer | Was | Is |
|---|---|---|
| `useAddProjectParty` | INSERT carrying `sms_consent_status` + four evidence columns | the seat carries **no consent column**; `record_channel_invite` (already there) is the whole act |
| `useUpdateProjectParty`'s `revertsToOptedOut` branch | reverted / transplanted eight columns on a phone change | **deleted.** The record is keyed on the NUMBER, so moving a seat's number already moves which record it reads |
| `useUpdateProjectParty`'s frozen-column second leg | `currentStatus === 'opted_out'` off the seat | **deleted.** One reader, one answer: `project_consent_org()` + `channel_consent_status()` |
| `NOT_ASKED_CONSENT_COLUMNS` | the eight-column revert bundle | **deleted** |
| `useRecordPartySmsConsent` | six-column UPDATE + three seat-shaped guards | `record_channel_invite`, whose own gates ask all three questions of the ledger |
| the party sheet's consent read | `person?.status_raw ?? meta.sms_consent_status ?? 'not_asked'` | `usePersonSeat(partyId).identity.consent_status`, and **no chip at all** when the identity is null (R-BE) |
| the roster row's collapsed `dotOnly` chip | a bare colour dot, inside the toggle's accessible name | **removed.** SPEC §6.1 keeps consent in the unfold; SPEC §5.1 #16 and §7 #9 both forbid the dot |

Still READING the frozen shape, and correctly: `ProjectParty`'s eight fields (the columns exist and
`select('*')` returns them) and `ProjectRosterRow.sms_consent_status` — which is
`v_project_roster`'s column, repointed by 00594 to the **record's** verdict, not the seat's.

`asWrittenConsentError` stays wired even though nothing here can trigger the freeze: 00594's OTHER
trigger, `consent_opted_out_phone_frozen` (R-AX), still guards `phone`/`phone_e164` in the database
where no hook can be bypassed.

---

## 4. PR-v — the alias block, and the one new token

`apps/designer-portal/src/app/globals.css`, inside the existing house-sheet `:root` block:

```
--sage: var(--color-sage);          --sage-ink:      #5F6B57;
--golden: var(--color-golden-hour); --golden-ink:    #79651E;
--terracotta: var(--color-terracotta);
--color-dusty-blue-ink: #556B82;
```

The two inks are LITERALS, not `var(--color-sage-ink)`: `lib/document/__tests__/contrast.test.ts`
**refuses an alias-form `--*-ink` token outright** (an alias parses to no hex and would ship
unmeasured), and `--clay-ink` / `--terracotta-ink` already sit there as literals for the same reason.

`--color-dusty-blue-ink` is PR-v's own ask. `--color-dusty-blue` (#8B9CAD, hue 210°) is a MATERIAL
pigment — it paints the GC's avatar and role badge and reads 1.9:1 on paper, so a dusty-blue WORD
had nothing to spend. #556B82 is hue 210.7° and clears AA on every light ground the contrast guard
measures: **5.28 paper · 5.16 off-white · 5.51 white · 5.01 red-letter band · 4.89 note band**. The
guard's `it.each(inkTokens)` picks it up automatically and passes.

`--terracotta-ink`, `--ink-faint` and `--hairline-strong` were already in that block; the four
pigment pairs in `STATE_WORD_PIGMENTS` now all resolve.

---

## 5. Verification

```
$ pnpm --dir … --filter @patina/supabase        type-check     SUPABASE_TC=0
$ pnpm --dir … --filter @patina/designer-portal type-check     DESIGNER_TC=0
$ npx turbo build --filter=@patina/types                        TYPES_BUILD=0
$ pnpm --dir … --filter @patina/admin-portal    build           ADMIN_BUILD=0   (the strictest gate)

$ cd apps/designer-portal && npx jest
Test Suites: 574 passed, 574 total
Tests:       7297 passed, 7297 total

$ cd packages/supabase && npx vitest run
Test Files  101 passed (101)
     Tests  1284 passed | 12 skipped (1296)
```

### The two new suites

- **`apps/designer-portal/src/components/document/people/__tests__/people-primitives.test.tsx`** —
  35 tests over the four primitives. Pins the twelve→nine stage reduction, the four pigment pairs
  at their source, "no record prints nothing", the blocked-only leading rule, R-L's
  email-then-office-phone selection, R-AA's button, the 44px target and R-X's full-width variant,
  and that `TelLink` is an `<a>` so it can never nest in the row button.
  *(jsdom discards a `var(--x)` declaration entirely, so the token PAIRING is asserted against
  `STATE_WORD_PIGMENTS` and the DOM is asserted for what jsdom keeps.)*
- **`packages/supabase/src/hooks/__tests__/people-crm-foundation.test.ts`** — 30 tests. Every
  entity root distinct; every detail key UNDER its list root (a detail key that is not is a key no
  fan-out can reach); the consent key carrying all three parts of its PK; the eleven-tier revoke
  table; the four bands including the precedence cases; `rosterDateKey` in the LOCAL calendar day;
  the mistaken-add predicate.

### The two suites that were rewritten, not repaired

`use-update-project-party.test.ts` (14 tests) and the consent half of
`use-coordination-authority.test.ts` (10 tests) pinned the OLD seat-writing behaviour — the consent
revert, the sibling probe, the six-column write, the `not_asked` transition pin. R-AS removes the
behaviour, so the tests were rewritten to pin what replaces it, including a `FROZEN_COLUMNS` sweep
asserting that no INSERT or UPDATE payload names one. Both files' headers say what moved and why.

Two shipped tests moved with the code, each in one line plus a comment:
`party-profile-invite-to-texts.test.tsx` (the hook now takes `projectId`; the fixture drives
branches through `consent_status`, not `status_raw`) and `roster-row.test.tsx` (one consent word, in
the unfold).

---

## 6. Not done, and owed

**Owed by this program, and the first one is a behaviour change W2b/W2c cannot see:**

1. **THE OPT-IN INVITE NO LONGER DISPATCHES FROM THE PORTAL.** `fc_optin_invite_dispatch`
   (00284's trigger on `project_parties`, body at `00432:27-68`) fires the double-opt-in SMS off a
   row landing at `sms_consent_status = 'pending'` **with** the four evidence columns. R-AS took
   both halves off the INSERT, so a seat is born at the `not_asked` default and the trigger returns
   without dispatching. w1a §5.1b(c) named this INSERT "the one path that still makes the invite's
   evidence proof work", and the brief's "leave none" retires it.
   **What is owed:** a record-side dispatch, the shape `00622` already used for the site-request
   release — an `AFTER INSERT OR UPDATE OF status ON studio_channel_consent` trigger firing
   `sms_optin_invite` when a record becomes a standing `pending`, and `_shared/sms.ts`'s opt-in
   evidence proof repointed off the seat's four columns onto the record's. Both are W3's; neither is
   a portal change. Until it lands, ticking "text updates" records the invite and **sends nothing**.
2. **`PartyKind`'s four new values are refused by the database.**
   `project_parties_party_kind_check` still admits eleven. `PARTY_KINDS_ACCEPTED_BY_DB` exists so a
   picker can gate itself, but the CHECK widening is a migration this wave did not mint (W2 mints
   from 00628). Until then F-26 and F-27 stay on `other`, as the W1b seed records honestly.
3. **`inspector_subtype` has no column.** W1b added the stage/window/firm columns and not this one.
   `INSPECTOR_SUBTYPE_META_KEY` carries it in the seat's `meta`, per the brief's own fallback.
4. **`usePerson` was not renamed.** R-BE says "the hook takes a seat id"; `usePerson` has a second
   caller, `views/person-profile.tsx`, which passes a Directory **identity** id and would break. So
   the seat reader is a new export, **`usePersonSeat`**, and `usePerson` keeps its identity
   contract. R-BE's three substantive rules (seats view → identity join, `consent_status` not
   `status_raw`, no chip when the identity is null) are all delivered, and the party sheet is
   repointed. Flagged in case Fable wants the name itself.
5. **The party-profile sheet still reads its BODY off `usePerson`.** Only the consent word and the
   chip's gate moved to `usePersonSeat`. The sheet's meta-driven content (trade, company, project
   name, `phone_e164`) still comes from the party branch, which v4 no longer emits for a carded
   seat — so a carded seat's sheet body is thin until W2b/W2c rebuild it on `usePersonSeat`'s
   `seat`. That rebuild is theirs; the reader they need is exported and typed.
6. **`deriveStatusDot` survives in `people-derivation.ts`.** Direction §4 retires it there too, but
   `views/person-profile.tsx` still calls it and that file is a W2b/W2c surface. The COMPONENT
   (`StatusDot`) is deleted and no row renders a dot.
7. **The four W2a surfaces the primitives replace are not rebuilt.** `person-row.tsx` and
   `company-row.tsx` were repointed only far enough to compile and to stop rendering a bare dot —
   the hairline ledger row, the three word columns, the seat lines, the six chips and PR-g's mixed
   list are W2b/W2c's. `directory-view.tsx` still maps `role` to bands, so the Directory will read
   oddly until they land (w1b §8 said so; no flag exists to hide it).
8. **Nothing calls `peopleEvents` yet.** The taxonomy is defined and exported; the call sites belong
   to the surfaces.

**Carried forward from W1, untouched here:** Patina Field's `PunchCourtResolver` /
`SupabaseSiteRequestService` (R-AV), `site_request_resend()`, `sendPartySms` /
`flushDeferredMessages` / `mayTextField`'s surviving seat legs, the inbound YES gate, 00621's two
dispatch gates, and the unattributable-send fail-open policy ruling.

---

## 7. One thing beyond the brief, flagged

`PartyLike` in `apps/designer-portal/src/components/document/coordination/party.ts` carried its own
hand-written copy of the eleven party kinds. Widening `PartyKind` broke four call sites against it,
and a second list would have silently rejected PR-f's kinds at every court. It now imports
`PartyKind` from `@patina/types`. One import, one deletion, no behaviour change.
