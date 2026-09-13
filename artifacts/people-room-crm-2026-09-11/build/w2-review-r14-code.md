# W2 — adversarial code review, round 14

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD **`7ef47ff98`** ("fix(people-room): W2 round-13 findings").

Read: `rulings.md` (all, §3 through R-BM), `synthesis/direction.md`, `specimens/SPEC.md` §3 §5 §6
§7 §8, `w2a/w2b/w2c-report.md`, `w1a/w1b-report.md`, `w2-review-r5-code.md`, `w2-fix-log-r5.md`,
`w2-review-r13-code.md`, `w2-fix-log-r13.md`.

Diff read against `origin/main` for every changed file under `apps/designer-portal/src`,
`packages/supabase/src/hooks`, `packages/types/src` — 109 files, 24 926 insertions.

---

## 0. Gates, run here at this HEAD

```
$ cd apps/designer-portal && npx tsc --noEmit
DESIGNER_TC_EXIT=0

$ cd packages/supabase && npx tsc --noEmit
SUPABASE_TC_EXIT=0

$ cd apps/designer-portal && npx jest
Test Suites: 585 passed, 585 total
Tests:       7527 passed, 7527 total
Snapshots:   1 passed, 1 total
Time:        24.059 s

$ cd packages/supabase && npx vitest run
 Test Files  104 passed (104)
      Tests  1306 passed | 12 skipped (1318)
   Duration  3.45s

$ cd apps/admin-portal && npx next build --webpack     # owed: @patina/types + @patina/supabase changed
… 137 routes, ƒ Proxy (Middleware)
[exited with code 0]
```

All four green, unchanged from round 13's counts (round 13 raised jest 7514 → 7527 and vitest
1297 → 1306; nothing has moved since).

**Dist packages.** `find packages/<p>/src -newer packages/<p>/dist/index.js` returns nothing for
`types`, `utils`, `api-routes`, `api-client`, `help-system`. `types` / `utils` / `api-routes` /
`help-system` built 13 Sep 07:34; `api-client` 11 Sep 13:47 (its `src` is older still). No dist is
stale.

---

## 1. The mechanical checks the brief names

| Check | Result at `7ef47ff98` |
|---|---|
| `useFeatureFlag('call-sheet')` anywhere in `apps` / `packages` | **none**. Surviving `'call-sheet'` strings are the registry SURFACE key (`registry.tsx:236,471`, `ticket-derivation.ts:80,740`) and the `surfaceKey="call-sheet"` analytics prop on six DocumentActions — a different vocabulary. Two dead test mocks survive (CR14-11) |
| Dead flag-off branches | none. `desk/page.tsx`, `doc/[id]/page.tsx`, `command-bar.tsx`, `letterhead-instruments.tsx`, `mobile-bar.tsx` read no flag; `callSheetEnabled` is a literal `true` |
| A portal write to `project_parties.sms_consent_*` | **none**. Grep for `sms_consent_status` / `sms_opt_out_at` / `sms_consented_at` / `sms_consent_source` / `sms_consent_evidence` across `apps/*/src` + `packages/*/src` returns only: a READ (`roster-derivation.ts:399`, off `v_project_roster`), a synthetic-row literal (`roster-derivation.ts:149`, `sms_consent_status: null` on a client row the view does not carry), the frozen type declarations (`use-coordination.ts:77-84`, documented as frozen legacy), `database.types.ts`, comments and test fixtures. No INSERT/UPDATE payload names one |
| Consent writes | only `record_channel_consent` (`use-consent.ts:297`), `record_channel_invite` (`use-consent.ts:327`, `use-coordination.ts:499,780`) and `record_channel_reconsent` (`use-consent.ts:356`). No other door; `supabase.rpc(` across the six changed hook files enumerated and checked one by one |
| Hard delete outside the mistaken-add predicate | `useRemoveProjectParty` has one caller, `roster-row.tsx:557-583`, held on the face by `seatDeleteRefusal` (`roster-row.tsx:302-307`) and again in the hook (`use-coordination.ts:967`). `useClearContactRule` still hard-deletes and still has no caller (CR14-18) |
| Site access card reaching a client surface | `grep -rn "site_access\|SiteAccess\|siteAccess\|site-access" apps/client-portal/src` → no hits |
| A site access CODE field | **none**. `00625` has no `gate_code` column (three banner comments say so deliberately); the one free-text field in that region is labelled **"Lockbox version"** (`site-access-card.tsx:524`) and the sentence beside it is `wayInSentence(...)` → "The code is held off Patina; ask <gate controller>." No input, no state key, no payload key |
| `box-shadow` in changed files | **0**. Scripted over every changed non-test file under the three trees |
| Every CSS custom property used is defined | scripted: 92 distinct `var(--…)` names across the 62 changed portal files, all resolving in `apps/designer-portal/src/app/globals.css` or in `layout.tsx`'s `next/font` variables (`--font-heading`, `--font-inter`, `--font-mono`), except **`--color-linen`**, defined nowhere in the repo (CR14-12), and names carrying a literal fallback (`--doc-mobile-bar-height, 72px`, `--ink-x`, `--ink-y`, `--stagger-index`, `--strata-cycle`, `--radix-collapsible-content-height`) |
| Hooks above early returns | clean. `person-profile.tsx`'s last hook is `useComplianceDocuments` at `:285`, above both returns (`:290`, `:294`). `company-card.tsx` puts `if (!card)` at `:480` after all of its. One shape still breaks the rule harmlessly: `useSiteAccessSummary` (CR14-25) |
| Hydration gate | no render-time width branch anywhere in the new surfaces. The one `matchMedia` (`view-shell.tsx:263`, pre-existing) is inside a `useEffect`. `roster-row.tsx` renders both authority phrases and lets CSS choose. Three render-time clock reads survive (CR14-26) |
| `disabled` attribute vs `aria-disabled` | every `DocumentAction` in the new code that passes `disabled` also passes `held` (`reach-access.tsx:1262`, `person-profile.tsx:465`, `roster-row.tsx:561,605`). `DocumentAction` emits a real `disabled` only while `held` is false (CR14-8). Two raw exceptions remain: `party-mini-row.tsx:200` (attribute + `disabled:opacity-50`) and `add-person-sheet.tsx:1574` (`<option disabled>`) |
| `aria-expanded` pairs with a real id | scripted over every `aria-expanded=` in `people/` + `roster/`: every one carries `aria-controls` within 300 characters, and every named id is rendered in the same component |
| `<a>` inside `<button>` | none. `TelLink` is an `<a>` and is always a sibling (`person-row.tsx:230`, `roster-row.tsx`, `site-access-card.tsx:365`, `reach-access.tsx:470`) |
| One live region | People room one (`people-room.tsx:636`); Call Sheet one (`call-sheet.tsx:224`); `project-team-roster.tsx:105` one. Every new region beneath them is a `role="alert"` refusal. One pre-existing exception inside the room's own sheet: `promote-band.tsx:41` (CR14-45) |
| Analytics only via `people-events.ts` | yes — `posthog.capture` appears exactly once in the tree, `people-events.ts:25` |
| No ad-hoc fetch to a service | one `fetch`, to the portal's own `/api/people/chase-renewal` (`compliance-chase.ts:47`). The route (`app/api/people/chase-renewal/route.ts`) proves membership by reading the firm's card back through the caller's OWN session client under RLS, then enqueues with the service role — `enqueue_agent_task` is not granted to `authenticated` |
| Types imported, not redefined | `PartyKind`, `FieldTrade`, `AuthorityScope`, `ReachState`, `StateWordFamily`, `ContactScope` all from `@patina/types`; `coordination/party.ts` imports `PartyKind` |
| Schema words / forbidden words on a face | scripted over JSX text nodes and over prose string literals in `people/` + `roster/` for `client_rep`, `party_kind`, `sms_consent_status`, `studio_contact_id`, `project_parties`, `not_asked`, `opted_out`, `off_job`, `lapses_soon`, `not_on_file`, and for CRM / dashboard / wizard / badge / pill / modal / toast / spinner / lorem / TBD: **no hits**. Every match is a comment, a type union, a `case`/comparison or a `Record<>` key. The Title-Case LABEL `Client Rep` still reaches one face — CR14-1 |
| Canonical keys and fan-out | §2 |

---

## 2. Keys and invalidations

Roots re-read at this HEAD: `peopleKeys` `['people-directory']`, `peopleSeatKeys`
`['people-directory-seats']`, `consentKeys` `['channel-consent']`, `accessGrantKeys`
`['access-grants']`, `siteAccessKeys` `['project-site-access']`, `partyAuthorityKeys`
`['project-party-authority']`, `complianceKeys` `['studio-compliance-documents']`,
`studioChannelKeys`, `contactRuleKeys`, `affiliationKeys`, `studioContactKeys`, `partySmsKeys`.

Every detail key nests under its own list root. `projectAuthorityKeys.project` nests under
`partyAuthorityKeys.all` deliberately (`use-project-authority.ts:24-27`) and
`useSetPartyAuthority` invalidates the ROOT for exactly that reason; `useChannelConsentRecords`'
list key nests under `consentKeys.all` (`use-consent.ts:247`).

Every mutation in the six changed hook files was walked against the faces that read it. The eleven
fan-outs round 12 tabulated all still hold, including round 11's three fixes (`peopleSeatKeys.all`
at all five card mutations, `partySmsKeys.all` on `useRevokeAccessGrant`, `projectId` on the party
sheet's mint) and round 13's `invalidateChannelFanout` on `useUpdateStudioContactChannel`, which is
what makes CR13-1's new act take effect.

Two style residues survive (CR14-36) and two roots sit outside any keys object (CR14-22). One real
gap survives: `useStudioContactHistory` (CR14-23).

Checked and **not** a finding: the consent RPCs invalidate `['project-roster', projectId]` only for
the originating project, but the Call Sheet row's consent word is read off
`seat.consent_status` (`callSheetRowFromSeat` → `people_directory_seats`), which
`peopleSeatKeys.all` does reach. No other project's sheet can go stale on a word.

---

## 3. Round 13, re-checked at this HEAD

| id | Verdict |
|---|---|
| QA-R13-1 | **FIXED** — `roster-row.tsx:255-275` resolves `consentRecord.record.origin_project_id` against `useProjects()` and passes that name; a record naming no origin keeps the sheet's job. Same shape as `reach-access.tsx:330-352` |
| QA-R13-2 | **FIXED** — `site-access-card.tsx:211-218` reads `useProject(open ? projectId : '')` and prints `projectAddress ?? project.site_address` in a `[data-site-address]` line under the head. `projects.site_address` holds "4412 Fremont Ave S, Minneapolis MN 55409" |
| QA-R13-3 | **CLOSED by SPEC amendment** — `SPEC.md` §5.6 #7 now fixes ONE entry with the amendment stamped in place. The shipped card prints exactly one |
| CR13-1 | **FIXED** — `consentable` no longer gates display (`reach-access.tsx:288-291`), and the door back exists: `unconfirmedSmsLine` prints its sentence and a tertiary **"This line takes texts"** calling `useUpdateStudioContactChannel({ smsCapable: true })`, whose `invalidateChannelFanout` reopens the band. **But the fix's predicate is `isPhoneChannel`, not `mobile` — see CR14-43** |
| CR13-2 | **FIXED** — `channelConsentReadAxis` (`:165-171`) reads a phone against `sms` and an address against `email`; `showConsentWord = readable && (consentable \|\| hasRecord)`; the R-Q sentence prints on `readable && sentence`. Every write stays on `channelConsentAxis` |
| CR13-3 | **PARTLY FIXED** — `seat-line.tsx:81-108` ships `SEAT_KIND_WORDS` / `seatKindWord` / `seatTradeWord`, and `person-profile.tsx:516` renders Past seats through `seatLineParts`. The Directory seat line and both card regions now read "sub · electrical" and "household member". **The Call Sheet roster row was not reached — CR14-1** |
| CR13-4 | **FIXED** — `retainedComplianceDocuments` (`use-studio-contacts.ts:1449-1483`) walks `superseded_by` transitively, depth-capped at 64, cycle-guarded, requiring an in-force successor carrying at least the root's gates; read against `pg_get_functiondef('compliance_state')` the two rules match term for term (`root_blocks <@ s.blocks`, `expires_on IS NULL OR >= CURRENT_DATE`, depth 64). `useComplianceDocuments` now fetches the whole chain. `documentPaperState` returns `current` for a gateless paper before it looks at a date |
| CR13-5 | **FIXED** — the guard selects `company_id`, resolves the firm the way R-BJ does and calls `identity_paper_state`, with `typeof paper === 'string' ? paper !== 'not_on_file' : true` so an unanswerable read refuses |
| CR13-6 | **FIXED** — `company-card.tsx:885` prints `card.remit_to ? "Remit to <x>" : "No remit-to on file."` |
| CR13-7 | **FIXED** — `DOOR_NOUN` + `withArticle` (`add-person-sheet.tsx:208-220`) key on the sheet's own `SeatAddKind` and serve both the intro (`:1072`) and the refusal (`:705`); `KIND_NOUN` is gone. One residue: CR14-44 |
| CR13-8 | **FIXED** — `useAffiliations` orders `from_date desc nulls last, id asc` (`use-studio-contacts.ts:1192-1194`) and `person-profile.tsx:316-318` picks the affiliation whose `company_id` matches the firm the card NAMES |

CR13-9 … CR13-49 were **not assigned** in round 13. Every one is re-verified **OPEN** at this HEAD
and carried below with its line number re-checked here.

---

## 4. Findings

### CR14-1 · MAJOR · medium confidence (NEW — CR13-3's fix did not reach the Call Sheet)
#### The Call Sheet roster row still speaks the column-head vocabulary, and still calls a household member a "Client Rep"

CR13-3 was fixed in `seatLineParts` and in Past seats. The Call Sheet row composes its meta line
somewhere else and was left on `PARTY_KIND_LABELS`:

```ts
// use-call-sheet-roster.ts:89
kindLabel: (kind) => getPartyKindLabel(kind) || (kind ?? ''),
// roster-derivation.ts:603-604
function metaOf(kind, trade, kindLabel) {
  return [kindLabel || (kind ?? ''), trade ?? ''].filter(Boolean).join(' · ');
}
// roster-derivation.ts:631   meta: metaOf(seat.party_kind, tradeLabel || null, kindLabel)
// roster-row.tsx:366         {row.meta && <span>{row.meta}</span>}
```

`PARTY_KIND_LABELS` (`field-config.ts:203-219`) maps `client_rep → 'Client Rep'`,
`sub → 'Subcontractor'`, `gc → 'General Contractor'`, and `rosterTradeLabel` returns
`getFieldTradeLabel`'s Title Case. The seed carries a `client_rep` seat on the very project the
Call Sheet is built for:

```
$ psql … -c "select pp.party_kind, pp.display_name from project_parties pp
             join projects p on p.id=pp.project_id where p.name ilike '%Okonkwo%';"
 client_rep | Chidi Okonkwo
 sub        | Dana Kowalski
 …
```

So for ONE seat, on one screen's worth of the room:

* the Add sheet's door writes it and calls him **"a household member"** (`add-person-sheet.tsx:156`);
* the Directory seat line and the person card now print **"Okonkwo residence · household member"**;
* the Call Sheet roster row prints **"Client Rep"**.

And Dana Kowalski reads "sub · electrical" on the Directory and "Subcontractor · Electrical" on the
Call Sheet. That is exactly the divergence CR13-3 named — C5's "one door, the studio's words" — on
the surface Leah's task 1 lives on. r13 rated the identical defect MAJOR and fixed it; this is the
half it missed.

**Fix.** Pass `seatKindWord` / `seatTradeWord` as `labels.kindLabel` / `labels.tradeLabel` in
`use-call-sheet-roster.ts`, or give `metaOf` the same vocabulary. `PARTY_KIND_LABELS` stays the
column heads (`rolodex-picker.tsx:386,507`'s filter chips, `party-profile-sheet.tsx:330`'s Kind
row) — those are column contexts and are correct as they are.

---

### CR14-2 … CR14-42 — the carried findings, every one re-verified OPEN at `7ef47ff98`

Line numbers re-checked here. Severities are this brief's rubric.

| id | r13 id | Sev. | Conf. | Finding, at this HEAD |
|---|---|---|---|---|
| CR14-2 | CR13-9 | minor | high | `person-row.tsx:180-196` — the 390 line-2 middle dot between reach and consent is unconditional while the paper dot beside it IS gated. `StateWord` returns `null` for an unresolvable value (`state-word.tsx:40`), and four of `people_directory`'s legs select `NULL::text AS consent_status` (re-verified in `pg_get_viewdef`: lines 25, 49, 75, 180 — client, lead, vendor and one contacts leg), so every one of those rows prints a dangling "·" at 390 |
| CR14-3 | CR13-10 | minor | high | `person-row.tsx:62-68` exports `openPersonLabel`; nothing imports it. The rendered control (`:156-163`) carries the bare `display_name`, where SPEC §7 #6 asks for "the person's name and role summary only" |
| CR14-4 | CR13-11 | minor | high | `add-person-sheet.tsx:1718-1724` ships "Adding Joe Wozniak puts **them** … opens a field link for **their window**." SPEC §5.5 #13 fixes "…puts **him** … for **the framing window**." The trade is two fields above on the same form. The line still carries a dead ternary, `partyName.trim() ? "them" : "them"` |
| CR14-5 | CR13-12 | minor | high | `person-profile.tsx:585-590` — History prints `formatSeatDate` (short): "Last touch 17 Oct 2026." SPEC §5.2 #10 fixes "Last touch 17 October 2026, text, logistics." `formatLongDate` is imported in the same tree; the channel and topic have no source in this build |
| CR14-6 | CR13-13 | minor | high | `truncate` (`text-overflow: ellipsis`, SPEC §8 #5) at `party-mini-row.tsx:149,153`, `rolodex-seed-sheet.tsx:80`, `view-shell.tsx:298`, plus six pre-existing sites under `people/ops` and `people/profile`. Direction §1 line 9 fixes "rows wrap instead of truncating" |
| CR14-7 | CR13-14 | minor | high | `rolodex-picker.tsx:577` renders `{stamp ? '✓' : ''}` — the glyph SPEC §8 #5 names forbidden and §5.7 #4 repeats. `coordination/item-composer.tsx:900` carries a second. Both pre-existing |
| CR14-8 | CR13-15 | minor | low | `DocumentAction` computes `disabled={unavailable && !held}` (`document-action.tsx:309`), so an act whose `held` has gone false while `loading` is true emits a real `disabled`: `roster-row.tsx:704`, `notice-log.tsx:138`, `rolodex-picker.tsx:423,600`, `party-profile-sheet.tsx:801,866,989`. `party-mini-row.tsx:200` is worse — a raw `<button disabled={disabled} className="… disabled:opacity-50 …">`, the attribute AND opacity-as-state |
| CR14-9 | CR13-16 | minor | low | `add-person-sheet.tsx:1574` — `disabled` on an `<option>` (the PR-n admin-only authority scopes), which has no `aria-disabled` equivalent. The scope is also refused in `submitParty`, so the gate is real; the attribute is the issue |
| CR14-10 | CR13-17 | minor | high | **Five** dead `useFeatureFlag` imports, each the file's only occurrence of the symbol: `mobile/mobile-bar.tsx`, `mobile/mobile-sheets.tsx`, `letterhead-instruments.tsx`, `coordination/item-composer.tsx`, `people/party-profile-sheet.tsx` (grep count 1 in each) |
| CR14-11 | CR13-18 | minor | high | `command-bar.test.tsx:65` still mocks a `call-sheet` FLAG (`mockCallSheetFlag`) and `__tests__/call-sheet-doorways.test.tsx:92` carries the same branch; neither component reads a flag any more |
| CR14-12 | CR13-19 | minor | medium | `--color-linen` is defined **nowhere** in the repo (three uses, no definition) and is spent at `party-profile-sheet.tsx:914`, `add-person-sheet.tsx:1653`, `directory/letter-line-field.tsx:191`, always `bg-[var(--color-linen)]/45` with no fallback, so those three bands compute to no ground. Pre-existing on `origin/main` |
| CR14-13 | CR13-20 | minor | medium | `placeholder=` survives at `rolodex-picker.tsx:359,544`, `party-profile-sheet.tsx:947` and `letter-line-field.tsx:178`; direction §5.4's Editing state is "label always visible, no `placeholder`". The Add sheet itself is clean |
| CR14-14 | CR13-21 | minor | medium | `party-profile-sheet.tsx:560` — `projectId: linkedParty?.project_id ?? seatProjectId ?? ''`. The empty string reaches `project_consent_org(p_project_id := '')` and surfaces a raw `22P02 invalid input syntax for type uuid` where the hook's own written sentence exists for exactly that case |
| CR14-15 | CR13-22 | minor | medium | `people-room.tsx:128` reads `usePeopleDirectory({ role:'all' })` UNSCOPED for the head count and the rail count, while `directory-view.tsx:141-144` reads `{ scope: scope === 'mine' ? 'mine' : undefined }` for the list — so MINE narrows the list and not the head. Direction §3.1 makes the head a count of cards, so this may be intended. **A ruling, not necessarily a fix** |
| CR14-16 | CR13-23 | minor | medium | `people-room.tsx:236,477` land the chip with `directoryChipFromParam`, which knows the six chips and the legacy eleven only (`directory-roles.ts:104-112`); `architect`, `engineer`, `inspector`, `vendor` and plain `contact` fall to `everyone` where `directoryBandOf` would have said Crew or Makers. The comment's promise does not hold for the kinds PR-f widened |
| CR14-17 | CR13-24 | minor | low | `directory-view.tsx:537-541` suppresses a firm's payee marker on `entryPaperWord(row) === null`, true both for a firm that owes no paper (right) and for one whose `paper_state` simply did not resolve. Two facts, one gate |
| CR14-18 | CR13-25 | minor | low | `use-studio-contacts.ts:1099-1120` — `useClearContactRule` HARD-DELETES the `studio_contact_rules` row, destroying `set_by` / `set_at` / `reason`, where every other retirement this wave added is dated. Still no caller |
| CR14-19 | CR13-26 | minor | medium | `directory-view.tsx:474-503` — the duplicate band prints the sentence then two name buttons separated by a bare `{" "}`: "These two cards share a phone. Adaeze Okonkwo Chidi Okonkwo". Structurally right per R-Y; as prose it reads as one four-word name |
| CR14-20 | CR13-27 | minor | medium | `site-access-card.tsx:365-370` passes `fullWidth` with no width branch, so the whole who-to-call line is the `tel:` target at 1440 too, where R-X / SPEC §6.2 fix "the whole line at 390, only the digits at 1440". `TelLink` also composes `Call ${personName}, ${text}` over a `text` that already opens with the name (`tel-link.tsx:92`) |
| CR14-21 | CR13-28 | minor | high | Three docblocks describe behaviour the code no longer has: `contact-rule-line.tsx:10-12` gives the pre-R-BL reading that `contactRuleIsHardBlock` contradicts; `contact-rule.ts:95-103` still names Sam Rowe and Ingrid Halvorsen as rows that "wear a rule the fixture marks false", which R-BL's shipped predicate makes false for both; `people-events.ts:4` says "Eight events" where `PEOPLE_EVENT_NAMES` (`:30-40`) defines nine |
| CR14-22 | CR13-29 | minor | low | Two query roots outside any keys object, invalidated by nothing: `use-coordination.ts:2148` `['project-recorded-studio', projectId]`, `use-consent.ts:381` `['project-consent-org', projectId]` |
| CR14-23 | CR13-30 | minor | medium | `use-studio-contacts.ts:461` keys `useStudioContactHistory` at `['studio-contact-history', ids]`, outside `studioContactKeys`, and nothing invalidates it — while `useAddProjectParty`, `useCloseProjectPartySeat`, `useRemoveProjectParty` and `usePromoteToStudioContact` all move the `project_parties` rows it counts for the picker's history line |
| CR14-24 | CR13-31 | minor | medium | R-BD retires `project_consent_org()` from guards and reducers; five portal call sites survive — `use-coordination.ts:492,673,769,912` and `useProjectConsentOrg` (`use-consent.ts:387`), consumed by `call-sheet.tsx` and `project-team-roster.tsx`. The `:912` one is inside the hard-delete guard, where the resolver returning NULL silently sets `hasConsentRecord = false`. `project_consent_org` = `COALESCE(p.studio_id, _primary_studio_for(p.designer_id))` and `project_tenant_org` has a broader fallback (both re-read with `pg_get_functiondef` here), so the two disagree exactly on the studio-less population R-BI names. Losing the seat does not lose the consent record (R-AY), which is why this is minor rather than major. **A ruling is owed on the guard** |
| CR14-25 | CR13-32 | minor | low | `site-access-card.tsx:79-89` — `useSiteAccessSummary` calls `useSiteAccessCard` and then returns early on the caller's behalf. Harmless today (the return is after the only hook); it is the one shape in this wave that breaks the moment a second hook is added below it |
| CR14-26 | CR13-33 | minor | low | Render-time clock reads, against the room's own `useMemo(() => new Date(), [])` convention: `roster-row.tsx:210` (`doc.expires_on < new Date().toISOString().slice(0,10)`), `:326` (`grantWindowEnd(..., new Date())`), `company-card.tsx:249`'s default prop `today = new Date()`, and now `use-studio-contacts.ts:1508`'s `new Date().toISOString()` inside `useComplianceDocuments`' queryFn |
| CR14-27 | CR13-34 | minor | low | Two `authorityPhrase` implementations. `roster-derivation.ts` joins with `". "`, appends a final stop and rounds the figure (`Math.round(cents/100)`); `person-profile.tsx:120-131` returns each phrase bare and the caller joins with `" · "`, with the figure from `formatMoneyFromCents`. One grant reads "Selections." on the Call Sheet and "Selections" on the person card; a $2,500.50 threshold reads "$2,501" on one and "$2,500.50" on the other |
| CR14-28 | CR13-35 | minor | low | Two UTC-vs-local date comparisons. `compliance-table.tsx:70-71` compares `Date.parse(\`${doc.expires_on}T00:00:00Z\`)` against `today.toISOString().slice(0,10)`; `retainedComplianceDocuments` is called with `new Date().toISOString().slice(0,10)` (`use-studio-contacts.ts:1508`) where the SQL it mirrors uses `CURRENT_DATE`. West of UTC both roll to tomorrow after 18:00 local, so a certificate expiring today reads `lapsed` from six in the evening and a chain can retire a link a day early. `people-format.ts` and `seat-line.ts` both parse by parts and say why |
| CR14-29 | CR13-36 | minor | low | `company-card.tsx:165-166` spells the warranty long — `formatLongDate` → "warranty through 21 November 2026" — where SPEC §5.3 #1 fixes "warranty through 21 Nov 2026", and R-U's fold and every seat line use the short form |
| CR14-30 | CR13-37 | minor | low | `use-people.ts:266-275`'s in-memory search matches name, email and phone digits only, while direction §3.1 also names firm and trade. The Directory uses `directoryEntryMatches`, which matches both, so the command bar finds fewer people than the room does for the same string |
| CR14-31 | CR13-38 | minor | low | `person-profile.tsx:417-419` renders `<h3>Reach &amp; access</h3>`, then `ReachAccess` renders `<h3>Channels</h3>`, `<h3>Contact rule</h3>`, `<h3>Access grants</h3>` — four peers where SPEC §5.2 #2 calls three of them "sub-heads". Same on the company card. `site-access-card.tsx` opens its six regions at `<h3>` (`:367,524,555,650,664,680`) with no `<h2>` anywhere in the sheet — its own title is a `<p class="font-heading">` (`:285`) — so the heading run skips a level, against SPEC §7 #11 |
| CR14-32 | CR13-39 | minor | low | `seat-line.tsx:139` — `py-[6px]` around an 11px span, roughly 28px tall, where every other control in the room carries `min-h-11`. R-AA makes the seat line a door, and the Directory row, the person card and the company card all mount it |
| CR14-33 | CR13-40 | minor | low | `notice-log.tsx:77-102` renders a `<ul>` of `role="checkbox"` buttons with no `role="group"` and no group label, unlike every chip row in the room (SPEC §7 #7) |
| CR14-34 | CR13-41 | minor | medium | `site-access-card.tsx:161-176` — `EditableLine`'s collapsed act is a tertiary whose only text is **`Edit`**, mounted three times ("Lockbox version", "Hours", "Receiving"). Three controls, one accessible name. The SAVE row already composes `Save ${label.toLowerCase()}` at `:132` |
| CR14-35 | CR13-42 | minor | low | `reach-access.tsx:839` mints `mintBandId`, rendered at `:1251`, and no `aria-describedby` names it (the mint act points at `mintReasonId`, `:1263`) — a `useId()` spent on nothing. `site-access-card.tsx:431`, `:596` and `panelId="site-access-notice-log"` (`:692`) hardcode ids where every other disclosure in this wave uses `useId()` |
| CR14-36 | CR13-43 | minor | low | `use-access-grants.ts:305-307` and `use-party-sms.ts:172-175,209-212` still invalidate with raw `['people-directory']` / `['people-directory-seats']` / `['project-roster']` / `['access-grants']` literals where `peopleKeys.all` / `peopleSeatKeys.all` / `accessGrantKeys.all` exist and are imported elsewhere in the same package. Functionally identical (the literals equal the roots, re-verified); r11 canonicalised the same literals in `use-studio-contacts.ts` and left these |
| CR14-37 | CR13-44 | minor | low | `person-profile.tsx` renders no "Edit identity" and no "Archive", which direction §3.2 R1 names as the card's two tertiary controls. SPEC §5.2's acceptance list does not require them |
| CR14-38 | CR13-45 | minor | medium | `PARTY_KINDS_OWING_NO_PAPER` exempts exactly `inspector`, `lender`, `authority` (`field-config.ts:296-302`), so the studio's OWN principal, lead designer and bookkeeper, and both homeowners, print `Not on file` in the paper column of the studio's own ledger (`entryPaperWord`). C13/C24/R-A's reasoning applies verbatim. **Needs a ruling**, not a code change |
| CR14-39 | CR13-46 | minor | medium | Avatar measures diverge from the spec at three call sites. `Avatar`'s default `size` is 42 (`person-bits.tsx:133`), and `person-row.tsx:154` and `person-profile.tsx:400` both call it with no `size` — so the Directory person row renders a 42px circle where SPEC §6.1 fixes "34px avatar" and direction §4 says "Person circle fixed at 34px in every row context", and the person card header renders 42px where SPEC §5.2 #1 fixes "48px circle". `party-mini-row.tsx:145` passes `size={30}` where SPEC §5.7 #4 says "the 34px circle" |
| CR14-40 | CR13-47 | minor | low | `use-call-sheet-roster.ts` / `use-project-authority.ts` still live under `components/document/roster` rather than beside `usePartyAuthority` in `@patina/supabase`, and `people/compliance-chase.ts` likewise. Each says so in its own docblock and names the orchestrator. The key nesting is correct |
| CR14-41 | CR13-48 | minor | high | `w2b-report.md` §2's strings table quotes an Add-sheet line the code does not ship. The shipped line is `{partyName.trim() \|\| "They"} is invited, not consenting. Patina has not sent them anything yet.` (`add-person-sheet.tsx:1710-1713`) — the CORRECT wording since R-AS retired the seat-side dispatch, and §3 of the same report already flags the deviation. One line in the report |
| CR14-42 | CR13-49 | minor | high | Seed / fixture divergence (W1 scope), all re-verified against `postgresql://postgres:postgres@127.0.0.1:54322/postgres` this round: Dana Kowalski's email status is `dead` not `bounced`; Adaeze Okonkwo reads `on_paper` / `not_asked` where F-04 gives `Account` / `Texting`; the seed spells "Carol Nyström", SPEC §3 "Carol Nystrom"; Northgate Electric's `warranty_until`, `tax_id_last4` and `remit_to` are all NULL, so SPEC §5.3 #1's "warranty through 21 Nov 2026" and §5.3 #6's "Tax id ending 4417" never print (and CR13-6's fix now prints "No remit-to on file."); Northgate holds three compliance documents where SPEC §5.3 #3 names four; no two person cards share a `phone_e164`, so SPEC §5.1 #17's duplicate band cannot fire on this seed |

---

### CR14-43 · MINOR · medium confidence (NEW — a scoping residue of CR13-1's fix)
#### "This line takes texts" is offered on nine person office landlines, including the card whose rule reads "Never text"

`reach-access.tsx:290-291`:

```ts
const unconfirmedSmsLine =
  showConsent && isPhoneChannel(String(channel.channel_kind)) && !channel.sms_capable;
```

`isPhoneChannel` (`:99-108`) admits `mobile`, `office`, `dispatch` and `after_hours`.
`showConsent` is `isPerson` (`:1034`), so a company card is untouched — but nine PERSON cards on
this seed carry an `office` row, all `sms_capable = false`:

```
$ psql … -c "select sc.full_name, c.channel_kind, c.sms_capable
             from studio_contact_channels c join studio_contacts sc on sc.id=c.owner_id
             where c.owner_type='person' and c.channel_kind in ('office','dispatch','after_hours');"
 Claire Bissett | office | f      Ingrid Halvorsen | office | f     Marcus Hale  | office | f
 Dale Whitcomb  | office | f      Jim Lindgren     | office | f     Ray Thao     | office | f
 Frank Bauer    | office | f      Jonah Feld       | office | f     Rosa Delgado | office | f
(9 rows)
```

Each of those cards now prints, beside a landline, "Patina has not been told this line takes texts,
so nothing about texting can be written down on it yet." and a tertiary act to assert that it does.
On Ray Thao's card that sits two regions under his own rule clause, "Never text. Office phone or
the 311 portal only." CR12-1's stated rule was *"a portal handle and a landline are channels the
studio reaches somebody on, not channels anybody can consent to"*; the door back that CR13-1 needed
was for a backfilled **mobile**.

The send is still held — `canText` checks `contactRuleForbidsSms` (`person-profile.tsx:361-364`) — so
nothing false is asserted about the studio's own rule, and `channelConsentAxis` already treats an
`sms_capable` office line as consentable, so the model permits this today. It is the face that is
wrong, and it is wrong on nine of twenty person cards.

**Fix.** Gate `unconfirmedSmsLine` on `String(channel.channel_kind) === "mobile"`. That closes
CR13-1 exactly (all nine of its cards are mobiles) and leaves no landline offering a texting
sentence.

---

### CR14-44 · MINOR · high confidence (NEW — the other half of CR13-7)
#### The "someone else" door introduces itself as "a contact"

`KIND_CHOICES` (`add-person-sheet.tsx:154-163`) offers **"someone else"**; `DOOR_NOUN.other_named`
(`:215`) is `"contact"`. So pressing that door prints "Add **a contact** to a project…" (`:1072`)
and refuses with "**A contact** needs a name." (`:705`) — the same door-vs-prose mismatch CR13-7
named, one row lower in the same map. ("Someone else" takes no article, so `DOOR_NOUN` cannot
simply repeat the switch word; the switch word is the one to change, or the noun is.) Not covered
by any SPEC acceptance string — §5.5 #2 only fixes the eight switch words, which are correct.

---

### CR14-45 · MINOR · low confidence (pre-existing, inside the room)
#### A second `role="status"` lives inside the People room's own sheet

SPEC §7 #3 asks for exactly one live region per screen and CR3-11/CR11-10 spent two rounds
consolidating on `people-room.tsx:636`. `promote-band.tsx:41` still renders its confirmation in a
`role="status"` div, and `PromoteBand` is mounted by `party-profile-sheet.tsx:603`, which the room
opens over itself. The region only exists after a promote (`promoted === true`), so the collision
is brief and one-shot. `profile/maker-profile.tsx:179,419` carries two more, in a view that
replaces the Directory rather than overlaying it. Neither file is in this wave's diff.

---

## 5. Settled — checked and deliberately NOT reported

- Every ruling in `rulings.md` §3 (R-A … R-BM). In particular R-AB (inert specimen acts, which do
  not govern the shipped room), R-BL (Ray Thao is not a hard block — re-verified against
  `contactRuleIsHardBlock` and the seeded rule rows), R-BM (the bring-forward travel-list picker
  and SPEC §5.7's mini-row acceptance are W3, so the picker printing kind · trade rather than firm
  · trade is not a W2 finding), R-B / CR9-3 (the company card's money-book line is a sentence, not
  a door — confirmed, no control is rendered), R-X (the 390 site-access tap target; CR14-20 is the
  *1440* half of it), R-F (the vitals literal — `callSheetVitalsLine`, `roster-derivation.ts:889`,
  reads "<n> on the job this week · <n> reachable by text · <n> with accounts · <n> on paper").
- Everything the wave reports scope to W3/W4: the record-side opt-in dispatch (w2a §6 #1), the
  `party_kind` CHECK widening (w2a §6 #2), `inspector_subtype`'s column (w2a §6 #3), `usePerson`
  not being renamed (w2a §6 #4), the household object (w2b §6 #3), the bid note's own columns
  (w2c §4 #2), the "who was told" change-log table (w2c §4 #3, and now SPEC §5.6 #7's amendment),
  the picker history line's "closed 2025" (w2c §4 #5), Leah task 5's e2e (w2c §4 #7),
  `deriveStatusDot` surviving for `deriveNurtureQueue`.
- `useComplianceDocuments({ unverifiedOnly: true })` applying `retainedComplianceDocuments` over a
  partial set: a successor outside the filtered rows is unresolvable and the predecessor stays in
  the list, which is the safe direction and matches the rule's own "a successor the caller cannot
  see retires nothing".
- The consent RPCs not invalidating other projects' `['project-roster']` (see §2).
- The `call-sheet` flag's PostHog definition (w2c §4 #10) — the code is clean.

---

## 6. What this review did not cover

The visual and behavioural walk at 1440 and 390 (`document.documentElement.scrollWidth` was not
measured — the QA reviewer owns 3000/3002), the Playwright specs under `e2e/people` (not run; no
port taken, no dev server started), the iOS surfaces under `apps/mobile/Capture`, the W1 migrations
except where a reader's contract had to be checked against them (00593, 00594, 00623, 00625,
00626), and the Sanity help articles. Database evidence above is read-only `psql` against the local
instance; `people_directory` returns 0 rows to `postgres` because it is `security_invoker` with no
`auth.uid()`, so its per-row facts are cited from `pg_get_viewdef` / `pg_get_functiondef` and from
the base tables.

**Nothing was written to any database. Nothing was pushed to Strata. No prod surface was touched.
No server was started.**
