# W2 — adversarial code review, round 15

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD **`e6aa10bdd`** ("fix(people-room): W2 round-14 — one seat
vocabulary on the Call Sheet row"). Working tree clean.

Read: `rulings.md` (§3 through R-BM, §4–§6), `synthesis/direction.md` §1–§6 and §3.9,
`specimens/SPEC.md` §3 §5 §6 §7 §8, `build/w2a-report.md`, `w2b-report.md`, `w2c-report.md`,
`w2-review-r13-code.md` / `-qa.md`, `w2-review-r14-code.md`, `w2-fix-log-r13.md`,
`w2-fix-log-r14.md`.

`git diff origin/main` read in full for every changed file under `apps/designer-portal/src`,
`packages/supabase/src/hooks`, `packages/types/src` — **109 files, 24 958 insertions**.

---

## 0. Gates, run here at this HEAD

```
$ cd apps/designer-portal && npx tsc --noEmit
DESIGNER_TC_EXIT=0

$ cd packages/supabase && npx tsc --noEmit
SUPABASE_TC_EXIT=0

$ cd apps/designer-portal && npx jest
Test Suites: 585 passed, 585 total
Tests:       7528 passed, 7528 total
Snapshots:   1 passed, 1 total
Time:        26.591 s
JEST_EXIT=0

$ cd packages/supabase && npx vitest run
 Test Files  104 passed (104)
      Tests  1306 passed | 12 skipped (1318)
   Duration  3.72s
VITEST_EXIT=0

$ cd apps/admin-portal && npx next build --webpack     # owed: @patina/types + @patina/supabase changed
… 137 routes, ƒ Proxy (Middleware)
ADMIN_BUILD_EXIT=0
```

Four gates green. Jest is 7527 → 7528, exactly the one test round 14 added.

**Dist packages.** `find packages/<p>/src -newer packages/<p>/dist/index.js` returns nothing for
`types`, `utils`, `api-routes`, `api-client`, `help-system` (built 13 Sep 07:34; `api-client`
11 Sep 13:47 over older `src`). `@patina/supabase` ships from `src` (`"main": "./src/index.ts"`),
so it has no dist to stale.

---

## 1. The mechanical checks the brief names

| Check | Result at `e6aa10bdd` |
|---|---|
| `useFeatureFlag('call-sheet')` anywhere in `apps` / `packages` | **none**. The surviving `'call-sheet'` strings are the registry SURFACE key and the `surfaceKey="call-sheet"` analytics prop — a different vocabulary. Five dead `useFeatureFlag` imports survive (CR15-11) and two dead test mocks (CR15-12) |
| Dead flag-off branches | none. `desk/page.tsx`, `doc/[id]/page.tsx`, `command-bar.tsx`, `letterhead-instruments.tsx`, `mobile-bar.tsx`, `mobile-sheets.tsx`, `account-studio-page.tsx` read no flag; `callSheetEnabled` is a literal `true`. One stale comment survives (CR15-5) |
| A portal write to `project_parties.sms_consent_*` | **none**. Scripted grep over the eight columns across `apps/*/src` + `packages/*/src` (excluding `database.types.ts` and tests) returns: one READ off `v_project_roster` (`roster-derivation.ts:399`), one synthetic-row literal (`:149`), the frozen type declarations (`use-coordination.ts:77-84`) and comments. No INSERT/UPDATE payload names one |
| Consent writes | only `record_channel_consent` (`use-consent.ts:297`), `record_channel_invite` (`use-consent.ts:327`, `use-coordination.ts:499`, `:780`) and `record_channel_reconsent` (`use-consent.ts:356`). No other door |
| Hard delete outside the mistaken-add predicate | `useRemoveProjectParty` (`use-coordination.ts:972`) has one caller, `roster-row.tsx:557-583`, held on the face by `seatDeleteRefusal` and again in the hook (`:963`). `useClearContactRule` (`use-studio-contacts.ts:1110`) still hard-deletes and still has no caller (CR15-19) |
| Site access card reaching a client surface | `grep -rn "site_access\|SiteAccess\|siteAccess\|site-access" apps/client-portal/src` → **no hits** |
| A site access CODE field | **none**. `gate_code` appears only in 00625's three banner comments saying the column does not exist. The one free-text control in that region is labelled **"Lockbox version"** (`site-access-card.tsx:527`) and the sentence beside it is `wayInSentence(...)` → "The code is held off Patina; ask <gate controller>." No input, no state key, no payload key |
| `box-shadow` in changed files | **0**. Scripted over every changed non-test file under the three trees. The only hits in the whole diff are `globals.css`'s pre-existing `--elevation-sheet` rule and its print reset, plus one docblock |
| Every CSS custom property used is defined | scripted: 92 distinct `var(--…)` names across the 62 changed portal source files, all resolving in `globals.css` or in `layout.tsx`'s `next/font` variables, except **`--color-linen`** (CR15-13, pre-existing on `origin/main` — `git grep` confirms all three uses and no definition) and names carrying a literal fallback (`--doc-quiet-reserve`, `--wash-still`, `--ink-x/y`, `--i`, `--stagger-index`, `--strata-cycle`, `--radix-collapsible-content-height`, `--doc-mobile-bar-height`) |
| Hooks above early returns | clean. `person-profile.tsx`'s last hook is `useComplianceDocuments` (`:285`), above both returns (`:289`, `:293`). `company-card.tsx` puts `if (!card)` at `:485` after all of its. `ReachAccess`, `ChannelRow`, `RosterGroups`, `CallSheet`, `SiteAccessCard`, `DirectoryView`, `PeopleRoom` have no early return above a hook. One shape still breaks the rule harmlessly: `useSiteAccessSummary` (CR15-26) |
| Hydration gate | no render-time width branch in the new surfaces; both authority phrases render and CSS chooses (`roster-row.tsx:355-364`), both word registers render and CSS chooses (`person-row.tsx:180-215`). The one `matchMedia` (`view-shell.tsx:263`, pre-existing) is inside a `useEffect`. Three render-time clock reads survive (CR15-27) |
| `disabled` vs `aria-disabled` | every `DocumentAction` in the new code that passes `disabled` also passes `held`. Two raw exceptions remain: `party-mini-row.tsx:200` and `add-person-sheet.tsx:1574` (`<option disabled>`) — CR15-9, CR15-10 |
| `aria-expanded` pairs with a real id | scripted over every `aria-expanded=` in `people/` + `roster/`: **every one** carries `aria-controls` within 400 characters, and every named id is rendered in the same component |
| `<a>` inside `<button>` | none. `TelLink` is an `<a>` and is always a sibling |
| One live region | People room one (`people-room.tsx:636`); Call Sheet one (`call-sheet.tsx:224`); `project-team-roster.tsx` one. One pre-existing exception inside the room's own sheet: `promote-band.tsx:41` (CR15-46) |
| Analytics only via `people-events.ts` | yes — `posthog.capture` appears in `lib/analytics/*` module-local `track()` guards only; no inline capture anywhere under `people/` or `roster/` |
| No ad-hoc fetch to a service | one `fetch`, to the portal's own `/api/people/chase-renewal` (`compliance-chase.ts:47`). The route proves membership by reading the firm's card back through the caller's OWN session client under RLS, then enqueues with the service role — `enqueue_agent_task` is not granted to `authenticated` |
| Types imported, not redefined | `PartyKind`, `FieldTrade`, `AuthorityScope`, `ReachState`, `StateWordFamily`, `ContactScope`, `ComplianceDocType`, `ComplianceBlock` all imported; `coordination/party.ts` imports `PartyKind` |
| Schema / forbidden words on a face | scripted over JSX text and prose string literals under `people/` + `roster/` for `client_rep`, `party_kind`, `sms_consent_status`, `studio_contact_id`, `project_parties`, `not_asked`, `opted_out`, `off_job`, `lapses_soon`, `not_on_file`, and for CRM / dashboard / wizard / badge / pill / modal / toast / spinner / lorem / TBD: **no hits**. Every match is a comment, a type union, a `case`/comparison or a `Record<>` key |
| Consent key normalisation | verified against the local DB: `studio_contact_channels` carries a BEFORE INSERT/UPDATE `normalize_studio_contact_channel_trg`, so a hand-typed "(612) 555-0111" is stored `+16125550111` — the same key `record_channel_consent` writes and `channel_consent_status` (which does NOT normalise its argument) reads. `useChannelConsent`'s `.eq('channel_value', channel.value)` therefore cannot miss |
| e2e under `e2e/people`, chromium-pinned | all six specs carry `({ browserName }) => browserName !== 'chromium'` skips |
| One seat vocabulary on every face | CR14-1's fix verified (§3). Three non-column faces still speak the column-head vocabulary — CR15-2 |

---

## 2. Keys and invalidations

Roots re-read at this HEAD: `peopleKeys` `['people-directory']`, `peopleSeatKeys`
`['people-directory-seats']`, `consentKeys` `['channel-consent']`, `accessGrantKeys`
`['access-grants']`, `siteAccessKeys`, `partyAuthorityKeys` `['project-party-authority']`,
`complianceKeys` `['studio-compliance-documents']`, `studioChannelKeys`, `contactRuleKeys`,
`affiliationKeys`, `studioContactKeys`, `partySmsKeys`.

Every detail key nests under its own list root. `projectAuthorityKeys.project` nests under
`partyAuthorityKeys.all` deliberately (`use-project-authority.ts:24-27`) and `useSetPartyAuthority`
invalidates the ROOT for that reason; `useChannelConsentRecords`' list key nests under
`consentKeys.all` (`use-consent.ts:247`) and `invalidateConsentFanout` invalidates that root.

`invalidateConsentFanout`, `invalidateComplianceFanout` and `invalidateChannelFanout` were each
walked against the faces that read them. Two style residues survive (CR15-37), two roots sit outside
any keys object (CR15-22), one real gap survives (CR15-23).

Checked and **not** a finding: the consent RPCs invalidate `['project-roster', projectId]` only for
the originating project; the Call Sheet row's consent word reads `seat.consent_status` off
`people_directory_seats`, which `peopleSeatKeys.all` does reach.

---

## 3. Round 14, re-checked at this HEAD

| id | Verdict |
|---|---|
| CR14-1 | **FIXED.** `use-call-sheet-roster.ts:87-98` now injects `kindLabel: seatKindWord` and `tradeLabel: (kind, trade) => rosterTradeLabel(kind, trade).toLowerCase()`; `getPartyKindLabel` is no longer imported there. Verified against the seed: `client_rep` → "household member", `sub`+`electrical` → "sub · electrical", `gc` → "GC". `rosterTradeLabel` is the right choice over `seatTradeWord` because a `vendor` seat's `trade` is a VendorSpecialty — and all four seeded vendor seats are trade-less, so the vendor branch is latent either way. `project-roster-surfaces.test.tsx` asserts the fix against BOTH the Call Sheet and the project-team region. Two residues, both named in the fix log and both carried below: the Call Sheet's `META` class still CSS-uppercases the fixed words (CR15-4), and `seatTradeWord` is still not vendor-aware (CR15-14) |
| CR14-2 … CR14-45 | **every one re-verified OPEN** at this HEAD, line numbers re-checked here. Round 14 assigned only CR14-1, and `w2-fix-log-r14.md` confirms nothing else was touched. Carried below as CR15-2 … CR15-46 with their original ids in the second column |

---

## 4. Findings

### CR15-1 · MINOR · medium confidence (NEW)
#### The company card's Paper table drops `doc_label` on every document but `other_named`

`documentTypeLabel` (`compliance-table.tsx:40-47`):

```ts
if (doc.doc_type === "other_named") return doc.doc_label ?? "Other";
return COMPLIANCE_DOC_TYPE_LABELS[doc.doc_type] ?? String(doc.doc_type);
```

Two seeded documents carry a studio-written `doc_label` on a TYPED row, read back from
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`:

```
 Beck + Rowe Architects | coi_gl  | Professional liability | PL-88231  | Architects Mutual
 Radon Solutions North  | license | MDH radon mitigation   | RMEC-1180 | Minnesota Dept of Health
```

So Beck + Rowe's card prints its professional-liability policy as **"COI, general liability"** — a
different insurance product from the one the record names — and Radon Solutions North's licence
prints as **"Licence"** where the record says "MDH radon mitigation". The roster row's held clause
drops it too: `roster-row.tsx:214-222` orders the fallback
`COMPLIANCE_DOC_TYPE_LABELS[...] ?? blocking.doc_label ?? blocking.doc_type`, so `doc_label` is only
ever reached for a type outside the map.

**Two defensible resolutions, and the panel owes the pick.** 00623's own column comment and
`StudioComplianceDocument`'s docblock both say `doc_label` is "Required when doc_type =
other_named", and `RecordDocumentSheet` only renders the label field for `other_named` — so the
portal's read and write agree and the SEED is the outlier (W1 scope, CR15-43's family). The other
reading is that a label the record holds should print: one line in `documentTypeLabel`
(`doc.doc_label?.trim() || <type label>`) and a reorder in `roster-row.tsx`.

---

### CR15-2 · MINOR · high confidence (NEW — the half of CR14-1 that is not the Call Sheet)
#### Three non-column faces still speak the column-head kind vocabulary

CR14-1's fix instruction enumerated where `PARTY_KIND_LABELS` legitimately stays: the picker's
filter chips (`rolodex-picker.tsx:386,507`) and the party sheet's **Kind row**
(`party-profile-sheet.tsx:330`). Three other call sites are not column contexts and were not named:

* `party-profile-sheet.tsx:581` — the sheet's eyebrow, `Field crew · {getPartyKindLabel(role)}`.
  A seat line reading "Okonkwo residence · sub · electrical" opens a sheet headed
  **"Field crew · Subcontractor"**, one click away.
* `party-profile-sheet.tsx:616` — the edit-mode meta line, `{getPartyKindLabel(role)} · {projectName}`.
* `people-derivation.ts:1296-1301` — `personIdentityLine`'s fallback for a card with no firm and no
  trade goes through `contactCardKindLabel` → `getPartyKindLabel`, so Ngozi Eze's Directory row
  reads **"Receiver"** above a seat line reading "receiver".

Milder than CR14-1 in kind: `client_rep` cannot reach the party sheet at all (`seatProfileRole`
excludes it, and `people-room.tsx:445` gates on `isFieldRosterRole`), so no face here prints a
different NOUN — only the column-head register of the same noun. Fix: `seatKindWord` at all three,
or a ruling that the sheet eyebrow is a column context.

---

### CR15-3 · MINOR · high confidence (NEW)
#### The contact rule's provenance date prints short where SPEC fixes the long form

`reach-access.tsx:854-862` composes the rule's provenance with `formatSeatDate`, so the person card
prints "Text only. The email on file bounces. **Set by Priya Natarajan, 12 Oct 2026.**" where
SPEC §5.2 #5 fixes "…Set by Priya Natarajan, **12 October 2026**." `formatLongDate` is imported in
the same file (`:76`) and is what every other sentence on that card spends. Same family as CR15-6
(short where SPEC wants long) and CR15-30 (long where SPEC wants short).

---

### CR15-4 · MINOR · high confidence (NEW — a residue of CR14-1's fix, named in its own fix log)
#### The Call Sheet row CSS-uppercases the seat words the Directory prints lower

`roster-row.tsx:78-79`'s `META` class carries `uppercase`, so CR14-1's fixed vocabulary renders
**"HOUSEHOLD MEMBER"** and **"SUB · ELECTRICAL"** on the sheet against the Directory's
"household member" / "sub · electrical". `w2-fix-log-r14.md` records the deferral explicitly ("If
the panel wants one case as well as one word, that is a one-line change to `META` and a separate
finding") — this is that finding. No SPEC acceptance string fixes the Call Sheet row's case, so it
is a ruling, not a defect.

---

### CR15-5 · MINOR · high confidence (NEW — extends CR15-21's docblock family)
#### Two docblocks describe behaviour the r13/r14 fixes removed

* `doc/[id]/page.tsx:1894-1897` still reads "The roster fetch is gated on the flag so a cohort
  without it doesn't pay for a query…" — the flag read was deleted in the same commit and
  `rosterProjectId` is now ungated.
* `party-profile-sheet.tsx:586-594` still reads "…R-BE owes W2 the repoint … **Until then** the
  sheet says nothing rather than the affirmative-adjacent word", directly above the line that
  performs that repoint, and is immediately followed by a second comment saying the same thing in
  two lines. One of the two is dead.

---

### CR15-6 … CR15-46 — the carried findings, every one re-verified OPEN at `e6aa10bdd`

Line numbers re-checked here. Severities are this brief's rubric.

| id | r14 id | Sev. | Conf. | Finding, at this HEAD |
|---|---|---|---|---|
| CR15-6 | CR14-2 | minor | high | `person-row.tsx:186-189` — the 390 line-2 middle dot between reach and consent is unconditional while the paper dot beside it IS gated. `StateWord` returns `null` for an unresolvable value, and four of `people_directory`'s legs select `NULL::text AS consent_status`, so every one of those rows prints a dangling "·" at 390 |
| CR15-7 | CR14-3 | minor | high | `person-row.tsx:62-68` exports `openPersonLabel`; nothing imports it. The rendered control (`:157-164`) carries the bare `display_name`, where SPEC §7 #6 asks for "the person's name and role summary only" |
| CR15-8 | CR14-4 | minor | high | `add-person-sheet.tsx:1718-1724` ships "Adding Joe Wozniak puts **them** … opens a field link for **their window**." SPEC §5.5 #13 fixes "…puts **him** … for **the framing window**." The line still carries a dead ternary, `partyName.trim() ? "them" : "them"` |
| CR15-9 | CR14-8 | minor | low | `DocumentAction` computes `disabled={unavailable && !held}`, so an act whose `held` has gone false while `loading` is true emits a real `disabled`: `roster-row.tsx:704`, `notice-log.tsx:138`, `rolodex-picker.tsx:423,600`, `party-profile-sheet.tsx:801,866,989`. `party-mini-row.tsx:200` is worse — a raw `<button disabled={disabled} className="… disabled:opacity-50 …">`, the attribute AND opacity-as-state |
| CR15-10 | CR14-9 | minor | low | `add-person-sheet.tsx:1574` — `disabled` on an `<option>` (PR-n's admin-only authority scopes), which has no `aria-disabled` equivalent. `submitParty` refuses the scope too, so the gate is real; the attribute is the issue |
| CR15-11 | CR14-10 | minor | high | **Five** dead `useFeatureFlag` imports, each the file's only occurrence of the symbol (grep count 1): `mobile/mobile-bar.tsx:20`, `mobile/mobile-sheets.tsx:54`, `letterhead-instruments.tsx:31`, `coordination/item-composer.tsx:48`, `people/party-profile-sheet.tsx:53` |
| CR15-12 | CR14-11 | minor | high | `command-bar.test.tsx:65` still mocks a `call-sheet` FLAG (`mockCallSheetFlag`) and `__tests__/call-sheet-doorways.test.tsx:92` carries the same branch; neither component reads a flag any more |
| CR15-13 | CR14-12 | minor | medium | `--color-linen` is defined **nowhere** in the repo (three uses, no definition) and is spent at `party-profile-sheet.tsx:914`, `add-person-sheet.tsx:1653`, `directory/letter-line-field.tsx:191`, always `bg-[var(--color-linen)]/45` with no fallback, so those three bands compute to no ground. Pre-existing on `origin/main` (`git grep` confirms all three sites and no definition there either) |
| CR15-14 | (new in r14's fix log) | minor | medium | `seatTradeWord` (`seat-line.tsx:108-110`) is `getFieldTradeLabel(trade).toLowerCase()`, and `getFieldTradeLabel` returns the RAW column value for anything outside `FIELD_TRADE_LABELS`. A `vendor` seat carrying a specialty would print a schema word ("stone_fabricator") on the Directory seat line and the person card's Past seats. Latent on this seed — all four seeded vendor seats are trade-less (`psql`: `vendor | (null) | 4`) — and the Call Sheet is now safe through `rosterTradeLabel` |
| CR15-15 | CR14-13 | minor | medium | `placeholder=` survives at `rolodex-picker.tsx:359,544`, `party-profile-sheet.tsx:947` and `letter-line-field.tsx:178`; direction §5.4's Editing state is "label always visible, no `placeholder`". The Add sheet itself is clean |
| CR15-16 | CR14-14 | minor | medium | `party-profile-sheet.tsx:560` — `projectId: linkedParty?.project_id ?? seatProjectId ?? ''`. The empty string reaches `project_consent_org(p_project_id := '')` (`use-coordination.ts:768-771`) and surfaces a raw `22P02 invalid input syntax for type uuid` where the hook's own written sentence exists for exactly that case |
| CR15-17 | CR14-15 | minor | medium | `people-room.tsx:128` reads `usePeopleDirectory({ role:'all' })` UNSCOPED for the head count and the rail count, while `directory-view.tsx:145-148` reads `{ scope: scope === 'mine' ? 'mine' : undefined }` for the list — so MINE narrows the list and not the head. Direction §3.1 makes the head a count of cards, so this may be intended. **A ruling, not necessarily a fix** |
| CR15-18 | CR14-16 | minor | medium | `people-room.tsx:248,272,287` land the chip with `directoryChipFromParam`, which knows the six chips and the legacy eleven only (`directory-roles.ts:101-112`); `architect`, `engineer`, `inspector`, `vendor` and plain `contact` fall to `everyone` where `directoryBandOf` would have said Crew or Makers |
| CR15-19 | CR14-18 | minor | low | `use-studio-contacts.ts:1099-1120` — `useClearContactRule` HARD-DELETES the `studio_contact_rules` row, destroying `set_by` / `set_at` / `reason`, where every other retirement this wave added is dated. Still no caller (only the barrel re-export at `index.ts:2137`) |
| CR15-20 | CR14-17 | minor | low | `directory-view.tsx:531-535` suppresses a firm's payee marker on `entryPaperWord(row) === null`, true both for a firm that owes no paper (right) and for one whose `paper_state` simply did not resolve. Two facts, one gate |
| CR15-21 | CR14-19 | minor | medium | `directory-view.tsx:479-502` — the duplicate band prints the sentence then two name buttons separated by a bare `{" "}`: "These two cards share a phone. Adaeze Okonkwo Chidi Okonkwo". Structurally right per R-Y; as prose it reads as one four-word name |
| CR15-22 | CR14-22 | minor | low | Two query roots outside any keys object, invalidated by nothing: `use-coordination.ts:2169` `['project-recorded-studio', projectId]`, `use-consent.ts:381` `['project-consent-org', projectId]` |
| CR15-23 | CR14-23 | minor | medium | `use-studio-contacts.ts:461` keys `useStudioContactHistory` at `['studio-contact-history', ids]`, outside `studioContactKeys`, and nothing invalidates it — while `useAddProjectParty`, `useCloseProjectPartySeat`, `useRemoveProjectParty` and `usePromoteToStudioContact` all move the `project_parties` rows it counts for the picker's history line |
| CR15-24 | CR14-20 | minor | medium | `site-access-card.tsx:390-395` passes `fullWidth` with no width branch, so the whole who-to-call line is the `tel:` target at 1440 too, where R-X / SPEC §6.2 fix "the whole line at 390, only the digits at 1440". `TelLink` also composes `Call ${personName}, ${text}` over a `text` that already opens with the name (`tel-link.tsx:92`) |
| CR15-25 | CR14-21 | minor | high | Three docblocks describe behaviour the code no longer has: `contact-rule-line.tsx:10-12` gives the pre-R-BL reading ("a rule that forbids a channel outright") that `contactRuleIsHardBlock` contradicts; `contact-rule.ts:95-103` still names Sam Rowe and Ingrid Halvorsen as rows that "wear a rule the fixture marks false", which R-BL's shipped predicate makes false for both; `people-events.ts:4` says "Eight events" where `PEOPLE_EVENT_NAMES` (`:30-40`) defines nine |
| CR15-26 | CR14-25 | minor | low | `site-access-card.tsx:79-89` — `useSiteAccessSummary` calls `useSiteAccessCard` and then returns early on the caller's behalf. Harmless today (the return is after the only hook); it is the one shape in this wave that breaks the moment a second hook is added below it |
| CR15-27 | CR14-26 | minor | low | Render-time clock reads, against the room's own `useMemo(() => new Date(), [])` convention: `roster-row.tsx:210`, `:326`, `company-card.tsx:249`'s default prop `today = new Date()`, and `use-studio-contacts.ts:1508`'s `new Date().toISOString()` inside `useComplianceDocuments`' queryFn |
| CR15-28 | CR14-27 | minor | low | Two `authorityPhrase` implementations. `roster-derivation.ts:1053-1073` joins with `". "`, appends a final stop and ROUNDS the figure (`Math.round(cents/100)`); `person-profile.tsx:125-135` returns each phrase bare, the caller joins with `" · "`, and the figure comes from `formatMoneyFromCents`. One grant reads "Selections." on the Call Sheet and "Selections" on the person card; a $2,500.50 threshold reads "$2,501" on one and "$2,500.50" on the other |
| CR15-29 | CR14-28 | minor | low | Two UTC-vs-local date comparisons. `compliance-table.tsx:69-71` compares `Date.parse(\`${doc.expires_on}T00:00:00Z\`)` against `today.toISOString().slice(0,10)`; `retainedComplianceDocuments` is called with `new Date().toISOString().slice(0,10)` (`use-studio-contacts.ts:1508`) where the SQL it mirrors uses `CURRENT_DATE`. West of UTC both roll to tomorrow after 18:00 local |
| CR15-30 | CR14-29 | minor | low | `company-card.tsx:165-166` spells the warranty long — `formatLongDate` → "warranty through 21 November 2026" — where SPEC §5.3 #1 fixes "warranty through 21 Nov 2026", and R-U's fold and every seat line use the short form |
| CR15-31 | CR14-30 | minor | low | `use-people.ts:263-276`'s in-memory search matches name, email and phone digits only, while direction §3.1 also names firm and trade. The Directory uses `directoryEntryMatches`, which matches both, so the command bar finds fewer people than the room does for the same string |
| CR15-32 | CR14-31 | minor | low | `person-profile.tsx:418-420` renders `<h3>Reach &amp; access</h3>`, then `ReachAccess` renders `<h3>Channels</h3>`, `<h3>Contact rule</h3>`, `<h3>Access grants</h3>` — four peers where SPEC §5.2 #2 calls three of them "sub-heads". Same on the company card. `site-access-card.tsx` opens its six regions at `<h3>` with no `<h2>` in the sheet — its own title is a `<p class="font-heading">` (`:298`) — so the heading run skips a level (SPEC §7 #11) |
| CR15-33 | CR14-32 | minor | low | `seat-line.tsx:140` — `py-[6px]` around an 11px span, roughly 28px tall, where every other control in the room carries `min-h-11`. R-AA makes the seat line a door, and the Directory row, the person card and the company card all mount it |
| CR15-34 | CR14-33 | minor | low | `notice-log.tsx:77-102` renders a `<ul>` of `role="checkbox"` buttons with no `role="group"` and no group label, unlike every chip row in the room (SPEC §7 #7) |
| CR15-35 | CR14-34 | minor | medium | `site-access-card.tsx:161-176` — `EditableLine`'s collapsed act is a tertiary whose only text is **`Edit`**, mounted three times ("Lockbox version", "Hours", "Receiving"). Three controls, one accessible name. The SAVE row already composes `Save ${label.toLowerCase()}` at `:132` |
| CR15-36 | CR14-35 | minor | low | `site-access-card.tsx:456`, `:621` and `panelId="site-access-notice-log"` (`:695`) hardcode ids where every other disclosure in this wave uses `useId()`. `reach-access.tsx`'s `mintBandId` now renders (`:1240`) but the mint act's `aria-describedby` still names only `mintReasonId` (`:1263`) |
| CR15-37 | CR14-36 | minor | low | `use-access-grants.ts:305-307` and `use-party-sms.ts:169,172-175,208-212` still invalidate with raw `['people-directory']` / `['people-directory-seats']` / `['project-roster']` / `['access-grants']` literals where `peopleKeys.all` / `peopleSeatKeys.all` / `accessGrantKeys.all` exist and are imported elsewhere in the same package. Functionally identical (the literals equal the roots, re-verified) |
| CR15-38 | CR14-37 | minor | low | `person-profile.tsx` renders no "Edit identity" and no "Archive", which direction §3.2 R1 names as the card's two tertiary controls (the file's only `Archive` hit is `includeArchived: false` at `:196`). SPEC §5.2's acceptance list does not require them |
| CR15-39 | CR14-38 | minor | medium | `PARTY_KINDS_OWING_NO_PAPER` exempts exactly `inspector`, `lender`, `authority` (`field-config.ts:293-298`), so the studio's OWN principal, lead designer and bookkeeper (`contact_kind = 'studio'`) and both homeowners (`contact_kind = 'client'`) print `Not on file` in the paper column of the studio's own ledger. C13/C24/R-A's reasoning applies verbatim. **Needs a ruling**, not a code change |
| CR15-40 | CR14-39 | minor | medium | Avatar measures diverge from the spec at three call sites. `Avatar`'s default `size` is 42 (`person-bits.tsx:133`), and `person-row.tsx:155` and `person-profile.tsx:400` both call it with no `size` — so the Directory person row renders a 42px circle where SPEC §6.1 fixes "34px avatar" and direction §4 says 34px in every row context, and the person card header renders 42px where SPEC §5.2 #1 fixes "48px circle". `party-mini-row.tsx:145` passes `size={30}` where SPEC §5.7 #4 says "the 34px circle" |
| CR15-41 | CR14-40 | minor | low | `use-call-sheet-roster.ts` / `use-project-authority.ts` still live under `components/document/roster` rather than beside `usePartyAuthority` in `@patina/supabase`, and `people/compliance-chase.ts` likewise. Each says so in its own docblock and names the orchestrator. The key nesting is correct |
| CR15-42 | CR14-41 | minor | high | `w2b-report.md` §2's strings table quotes an Add-sheet line the code does not ship. The shipped line is `{partyName.trim() \|\| "They"} is invited, not consenting. Patina has not sent them anything yet.` (`add-person-sheet.tsx:1710-1713`) — the CORRECT wording since R-AS retired the seat-side dispatch. One line in the report |
| CR15-43 | CR14-42 | minor | high | Seed / fixture divergence (W1 scope), re-verified against the local DB this round: Northgate Electric holds THREE compliance documents where SPEC §5.3 #3 names four (no `coi_wc`), its `coi_gl` blocks `{site_access,draw}` where the fixture gives `{site access, payment, draw}` (so §5.3 #4's clause prints "Site access and the draw are held…"), its `warranty_until` / `tax_id_last4` / `remit_to` are all NULL; the seed spells "Carol Nyström" where SPEC §3 spells "Carol Nystrom"; and no two person cards share a `phone_e164`, so SPEC §5.1 #17's duplicate band cannot fire on this seed |
| CR15-44 | CR14-43 | minor | medium | `reach-access.tsx:290-291` gates `unconfirmedSmsLine` on `isPhoneChannel`, which admits `mobile`, `office`, `dispatch` and `after_hours`, so nine seeded PERSON cards carrying an `office` landline (`sms_capable = f`) — Ray Thao's among them, two regions under his own "Never text. Office phone or the 311 portal only." — print "Patina has not been told this line takes texts…" and a tertiary act to assert that it does. Fix: gate on `String(channel.channel_kind) === "mobile"` |
| CR15-45 | CR14-44 | minor | high | `KIND_CHOICES` (`add-person-sheet.tsx:154-163`) offers **"someone else"**; `DOOR_NOUN.other_named` (`:215`) is `"contact"`. Pressing that door prints "Add **a contact** to a project…" (`:1072`) and refuses with "**A contact** needs a name." (`:705`) — CR13-7's mismatch, one row lower in the same map |
| CR15-46 | CR14-45 | minor | low | `promote-band.tsx:41` renders its confirmation in a second `role="status"`, and `PromoteBand` is mounted by `party-profile-sheet.tsx:603`, which the room opens over itself. The region only exists after a promote, so the collision is brief and one-shot. `profile/maker-profile.tsx:179,419` carries two more. Neither file is in this wave's diff |

---

## 5. Settled — checked and deliberately NOT reported

- Every ruling in `rulings.md` §3 (R-A … R-BM). In particular **R-AB** (inert specimen acts, which
  do not govern the shipped room), **R-BL** (Ray Thao is not a hard block — re-verified against
  `contactRuleIsHardBlock` and the seeded rule rows), **R-BM** (the bring-forward travel-list picker
  and SPEC §5.7's mini-row acceptance are W3, so the picker's single-add shape, its "Client Rep"
  filter chip and its missing "What travels" pane are not W2 findings), **R-B / CR9-3** (the company
  card's money-book line is a sentence, not a door — confirmed, no control is rendered),
  **R-X** (the 390 site-access tap target; CR15-24 is the *1440* half of it), **R-F** (the vitals
  literal), **R-V / C32** (every region prints its own absence sentence), **R-Y** (no Compare &
  merge act), **R-P** (the Paper region's fixed order — verified in `company-card.tsx:777-874`:
  table, clause, consequence sentence, act row).
- Everything the wave reports scope to W3/W4: the record-side opt-in dispatch (w2a §6 #1), the
  `party_kind` CHECK widening (w2a §6 #2), `inspector_subtype`'s column (w2a §6 #3), `usePerson` not
  being renamed (w2a §6 #4), the household object (w2b §6 #3), the bid note's own columns (w2c §4
  #2), the "who was told" change-log table (w2c §4 #3, and SPEC §5.6 #7's amendment), the picker
  history line's "closed 2025" (w2c §4 #5), Leah task 5's e2e (w2c §4 #7), `deriveStatusDot`
  surviving for `deriveNurtureQueue`.
- The company card's seventh region ("Reach & access", the company variant) — direction §5.1 names
  it and gates every person-only control on `isPerson`; `shownGrants` filters to
  `subject_type === 'contact'`, so SPEC §5.3 #9's "no consent word and no reach word" holds.
- The Directory row printing `person.phone` raw rather than through `telDisplay`: every seeded card
  stores `(612) 555-01NN` in `studio_contacts.phone` (verified in `psql`), so both surfaces agree.
- `useComplianceDocuments({ unverifiedOnly: true })` applying `retainedComplianceDocuments` over a
  partial set: a successor outside the filtered rows is unresolvable and the predecessor stays,
  which is the safe direction.
- CR15-16's sibling on the seed: Okonkwo, Lindqvist and Cedar Lane all carry `studio_id`, so
  `project_consent_org` resolves and the CR8-5 card-kind join lands (Ray Thao and Carol Nyström both
  read `contact_kind = 'inspector'`, so no paper word prints for either).

---

## 6. What this review did not cover

The visual and behavioural walk at 1440 and 390 (`document.documentElement.scrollWidth` was not
measured — the QA reviewer owns 3000/3002 and no server was started here), the Playwright specs
under `e2e/people` (not run; no port taken), the iOS surfaces under `apps/mobile/Capture`, the
W1 migrations except where a reader's contract had to be checked against them (00592, 00593, 00594,
00623, 00625, 00626, 00627), and the Sanity help articles. Database evidence above is read-only
`psql` against the local instance; `people_directory` returns 0 rows to `postgres` because it is
`security_invoker` with no `auth.uid()`, so its per-row facts are cited from `pg_get_viewdef` /
`pg_get_functiondef` and from the base tables.

**Nothing was written to any database. Nothing was pushed to Strata. No prod surface was touched.
No server was started. No port was taken.**

---

## 7. Verdict

**Zero blocking. Zero major. Forty-six minor findings**, five of them new (CR15-1 … CR15-5), one
fixed and closed (CR14-1), forty-one carried and re-verified open. By this brief's rubric the round
is **clean**.
