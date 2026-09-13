# W2 adversarial code review — round 5

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD `2f4964494`
("fix(people-room): W2 round-4 findings …").

Read first: `rulings.md` (§1–§6), `synthesis/direction.md` §1–§6 incl. §3.9's
C1–C38, `specimens/SPEC.md` §3/§5/§6/§7/§8, both specimen files,
`w1a-report.md` / `w1b-report.md`, `briefing/current-state.md` §A,
`briefing/shots/strings-today.md`, the three W2 wave reports, and
`w2-fix-log-r4.md`. Every changed file under `apps/designer-portal/src`,
`packages/supabase/src` and `packages/types/src` was read in full or in the
regions the checks name. Local DB read for evidence; **two probes wrote inside
a transaction that was rolled back** (no committed local mutation, no prod, no
dev server, no port taken).

**Verdict: NOT CLEAN — 0 blocking, 2 major, 22 minor.**

---

## 0. Gates, run here, after the last commit

```
$ pnpm --dir <worktree> --filter @patina/designer-portal type-check
> tsc --noEmit
EXIT=0

$ pnpm --dir <worktree> --filter @patina/supabase type-check
> tsc --noEmit
EXIT=0

$ pnpm --dir <worktree> --filter @patina/admin-portal build
✓ Compiled successfully in 24.6s
  Finished TypeScript in 17.9s ...
✓ Generating static pages using 13 workers (137/137) in 963ms
EXIT=0

$ cd apps/designer-portal && npx jest --silent \
    src/components/document/people src/components/document/roster \
    src/lib/document 'src/app/(document)/desk' src/components/document/mobile \
    src/components/document/coordination src/components/document/__tests__
Test Suites: 196 passed, 196 total
Tests:       3278 passed, 3278 total
Time:        10.12 s
EXIT=0

$ cd packages/supabase && npx vitest run     (extra, not asked)
Test Files  103 passed (103)
     Tests  1297 passed | 12 skipped (1309)
EXIT=0
```

---

## 1. The mechanical checks the brief names

| Check | Result |
|---|---|
| Hooks above early returns | **PASS.** Re-read `people-room` (hooks end :318, `body` is an expression), `views/person-profile` (last hook `useComplianceDocuments` :234, maker return :238, loading return :242), `company-card` (`if (!card)` at :432, the three seeding `useEffect`s at :380/:404/:417 all above it), `reach-access`, `add-person-sheet`, `party-profile-sheet`, `roster-row`, `roster-groups`, `site-access-card`, `rolodex-picker`, `view-shell`, `directory-view`, `access-grant-list` (`GrantRow` hooks :124-129, no early return above). No conditional hook. |
| Hydration gate | **PASS, with one nit (CR5-16).** `/people` and the document shell are `'use client'`; no `window`/`document` read during render in any changed file (all inside `useEffect` or handlers). `roster-row.tsx:184` and `:264` call a bare `new Date()` in render rather than the room's `useMemo(() => new Date(), [])` — a re-render instability, not a mismatch, since both derivations only move across a day boundary. |
| One canonical query key per entity | **PASS**, with one stray root (CR5-22). Full table in §2. |
| Every mutation's invalidations | **Listed in §2.** Four fan-outs still short (CR5-4, CR5-5, CR5-7). |
| RLS-safe writes send every joined column | **PASS**, verified against the live policies rather than the comments: `studio_contact_channels` INSERT sends `owner_type`+`owner_id` and the WITH CHECK joins `studio_contact_org(owner_id)`; `studio_contact_rules` sends `subject_type`+`subject_id` (`CASE subject_type WHEN 'engagement' … ELSE is_active_studio_member(studio_contact_org(subject_id)) END`); `studio_person_affiliations` sends `person_id`+`company_id` (`is_active_studio_member(studio_contact_org(person_id)) AND studio_contact_org(person_id) = studio_contact_org(company_id)`); `studio_compliance_documents` sends `organization_id` (`is_active_studio_member(organization_id)`); `project_party_authority` sends `engagement_id`+`scope`; `project_site_access_cards` sends `project_id`; `studio_contacts` sends `organization_id`; `project_parties` sends `project_id`. |
| Consent writes ONLY through the RPCs | **PASS.** `record_channel_consent` / `record_channel_invite` / `record_channel_reconsent` (`use-consent.ts:297,327,356`), plus `record_channel_invite` from `useAddProjectParty` (`use-coordination.ts:501`) and `useRecordPartySmsConsent` (`:780`). No table write to `studio_channel_consent` anywhere. |
| No portal writer of `sms_consent_*` (R-AS) | **PASS.** `grep -n sms_consent_status\|sms_opt_out_at\|sms_consented_at\|sms_consent_source\|sms_consent_evidence` over `apps/` + `packages/` (excluding tests and `database.types.ts`) returns only READ interfaces and comments: `use-coordination.ts:77-81` (`ProjectParty`), `:989` (`ProjectRosterRow`, repointed by 00594), `:528`/`use-people.ts:104`/`people-derivation.ts:246` (comments), `roster-derivation.ts:149` (a synthetic in-memory client row, `null`) and `:399` (a READ of the repointed view column). **Zero writers.** `useAddProjectParty`'s INSERT (`use-coordination.ts:703-733`) names none of the eight; `useUpdateProjectParty`'s `dbPatch` (`:641-701`) names none. |
| No hard delete outside the mistaken-add predicate | **PASS, with one weak leg (CR5-6).** Exactly two `.delete()` in the whole diff: `use-coordination.ts:951` (`project_parties`, behind a server-side re-derivation of `seatDeleteRefusal` from three fresh reads) and `use-studio-contacts.ts:1092` (`useClearContactRule` — lifting a rule, documented). |
| Site access card never reaches a client surface | **PASS.** `SiteAccessCard` is mounted from `roster/call-sheet.tsx:221` and nowhere else. `grep -rn "site_access\|SiteAccess\|site-access" apps/client-portal/src` → nothing. No `show_to_client` anywhere in `site-access-card.tsx` / `notice-log.tsx` (one comment line only). 00625 carries four studio policies, no client leg. |
| No code field anywhere | **PASS.** `grep -rni "gate_code\|lockbox_code\|alarm_code\|gateCode\|lockboxCode\|alarmCode" apps packages` → **zero hits**. `UpdateSiteAccessCardInput` carries `lockboxVersion` and `alarmRef` only; the face prints "The code is held off Patina; ask <gate controller>." |
| PR-n gating, client AND DB | **PASS on the DB; still mis-scoped on the client** (carried, CR5-8). Client: `add-person-sheet.tsx:481-485` `isOrgAdmin`, `:500-503` the reset effect, `:831-835` the pre-write refusal, `:1510` the `<option disabled>` gate, `:1516` the visible sentence. DB: the four `project_party_authority_studio_*` policies each carry the admin leg on `money`/`draw_certify`. The client reads the membership role for the org that holds the **book**; the policy gates on `project_party_recorded_studio(engagement_id)`, the studio that holds the **job**. |
| `call-sheet` flag fully removed | **PASS in product code, with leftovers (CR5-9, CR5-10).** `grep -rn "useFeatureFlag('call-sheet')" apps packages` → nothing. All 14 consumers repointed and every dead branch deleted (verified in the diff for `desk/page.tsx`, `doc/[id]/page.tsx`, `command-bar.tsx`, `letterhead-instruments.tsx`, `mobile-bar.tsx`, `mobile-sheets.tsx`, `kickoff-band.tsx`, `item-composer.tsx`). `command-bar.tsx:488 case 'call-sheet'` is a surface-key switch, not a flag. Leftovers: four dead imports, one live test mock, and two flag-shaped parameters still in `lib/document`. |
| dist rebuilt after edits | **PASS.** `@patina/types` is the only dist-bearing package in the diff (`@patina/supabase` is consumed from source — `package.json` `"main": "./src/index.ts"`; `packages/{api-client,api-routes,auth,help-system,patina-design-system,utils}` have dists and are untouched by this diff). `dist/field-config.js` 2026-09-12 23:00:19 > `src/field-config.ts` 22:48:54; `dist/studio-config.js` 21:27:48 > `src/studio-config.ts` 20:57:22. The r4 fix commit (`2f4964494`) touched no file under `packages/types`. |
| Analytics only via `people-events.ts` | **PASS.** The only `posthog` reference in `components/document/people`, `components/document/roster` and `lib/analytics/people-events.ts` is `people-events.ts:20-25`, behind `isAnalyticsEnabled()`. Nine acts, no engagement metric. (Docblock drift, CR5-19.) |
| Document grammar — `box-shadow` = 0 | **PASS.** Sweeping every file in `git diff origin/main --name-only`: `globals.css:360` and `:1942` (both pre-existing, outside this diff's hunk) and one docblock sentence in `state-word.tsx`. No `boxShadow` in any TSX. `StateWord` paints border + text on `background: 'transparent'` (SPEC §8 #10). |
| Tokens only, and PR-v's alias block | **PASS.** The new `globals.css` hunk (`:1975-2037`) sits at **bare `:root`** — verified by reading the file, the enclosing selector at `:1975` is `:root`, not the `html:has([data-document-shell])` block above it — so `--sage` / `--golden` / `--terracotta` / `--sage-ink` / `--golden-ink` / `--color-dusty-blue-ink` resolve on `/people` and on `/doc/<id>` alike. The three aliased bases (`--color-sage:44`, `--color-terracotta:46`, `--color-golden-hour:47`) are themselves at the file's first `:root`. Two inks are literals for the reason `--clay-ink` is (`contrast.test.ts` refuses an alias-form `--*-ink`). |
| Every string on a face is SPEC vocabulary | **PASS.** A sweep of every JSX text node in the changed files for `client_rep`, `party_kind`, `sms_consent`, `studio_contact_id`, `project_parties`, `not_on_file`, `lapses_soon`, `opted_out`, `field_link`, `on_paper` returns nothing. `toast` appears only as a state identifier. `contactRuleClause` renders `channel_kind` tokens through `CHANNEL_WORD` (`contact-rule.ts:49-58`), never raw. `person-profile.tsx:424` prints `getPartyKindLabel(seat.party_kind)`, not the token. |
| aria: no `disabled` attribute | **PASS on every act this wave authored**, with three carried exceptions. `DocumentAction` emits `disabled={unavailable && !held}` (`document-action.tsx:309`), so each `disabled={…}` paired with `held={…}` lands as `aria-disabled="true"` and stays focusable: `reach-access:1031-1032`, `person-profile:371-372`, `roster-row:497-498,540-541,639-640`, `notice-log:137-138`, `party-profile-sheet:794-795,859-860,982-983`. Exceptions: `add-person-sheet:1510` (`<option disabled>`, carried CR3-18), `party-mini-row:190` (a raw `<button disabled>` with `disabled:opacity-50`, CR5-11), `rolodex-picker:405,563` (`disabled` + `loading`, no `held`) and `roster-row:639-640` while `sendSms.isPending` (CR5-17). |
| `aria-expanded` pairs with a real id | **PASS.** All 17 `aria-controls` resolve to a rendered `id`, each panel rendered unconditionally with `hidden` so the target exists while collapsed: `confirmId` (access-grant-list), `company-designations-<id>` / `company-payee-<id>` / `company-verdict-<id>`, `seatsPanelId`, `statusBandId` / `bandId` / `channelBandId` / `ruleBandId`, `authorityFieldId` (×2), `panelId` (roster-row, notice-log, view-shell), `site-access-emergency-lines`, `site-access-key-holder`, `mobile-studio-menu`. Two `aria-describedby` still dangle when the act becomes available (CR5-5's sibling, CR5-12). |
| No `<a>` inside `<button>` | **PASS.** `TelLink` is an `<a>` and is always a sibling of the row's own control: `person-row.tsx:200-202`, `roster-row.tsx:362-366`, `contact-rule-line.tsx:113`, `site-access-card.tsx:361`. `party-mini-row` renders a `<button>` whose words are `<span>`s. |
| One live region | **PARTIAL** (carried, CR5-13). `people-room.tsx:561` is the Room's; the two card-level regions CR3-11 removed are gone (`company-card.tsx:462` and `person-profile.tsx:294` are now comments). Seven other `role="status"` survive: `directory-view.tsx:364`, `call-sheet.tsx:179`, `roster-row.tsx:666`, `project-team-roster.tsx:94`, `rolodex-picker.tsx:430`, `promote-band.tsx:41`, `rolodex-seed-sheet.tsx:208`. |
| Types imported, not redefined | **PASS.** No local re-declaration of `PartyKind` / `FieldTrade` / `ReachState` / `PaperState` / `SeatStage` / `ConsentWord`. `coordination/party.ts:105` now imports `PartyKind` instead of keeping its own eleven-value list. `use-coordination.ts:51` is an explicit re-export alias. |
| No ad-hoc fetch | **PASS.** One `fetch` in the whole diff: `compliance-chase.ts:47` → the same-origin route `/api/people/chase-renewal`, which proves studio membership through the caller's own RLS read of `studio_contacts` before enqueuing with the service role (`route.ts:55-70`). No NestJS call outside `@patina/api-routes`. |

---

## 2. Query keys and fan-out

| Entity | Root | Detail / list |
|---|---|---|
| Directory identity | `['people-directory']` | `.list(filters)`, `.person(id, role)` |
| Directory seat | `['people-directory-seats']` | `.list(filters)`, `.seat(seatId)` |
| Channel consent | `['channel-consent']` | `.record(org, kind, value)`, `[…,'list',org,kind]` |
| Access grant | `['access-grants']` | `.list(filters)` |
| Rolodex card | `['studio-contacts']` | `.list(org, filters)`, `.detail(id)` |
| Typed channel | `['studio-contact-channels']` | `.list(ownerId)`, `.owners(ids)` |
| Contact rule | `['studio-contact-rules']` | `.detail(type,id)`, `[…,'list']` |
| Affiliation | `['studio-person-affiliations']` | `.list(filters)` |
| Compliance doc | `['studio-compliance-documents']` | `.list(filters)`, `.state(holderId)` |
| Seat authority | `['project-party-authority']` | `.list(engagementId)`, `[…,'project',projectId]` (portal-local, deliberately nested under the root) |
| Site access card | `['project-site-access']` | `.detail(projectId)` |
| Roster (Call Sheet) | `['project-roster', projectId]` | — |
| Seats (raw) | `['project-parties', projectId]` | — |
| Field link token | `['field-links', partyId]` | a SECOND read model over the same entity as `access-grants` (CR5-4) |
| Project consent org | `['project-consent-org', projectId]` | derived scalar |
| Project recorded studio | `['project-recorded-studio', projectId]` | derived scalar (new this round) |
| Contact history | `['studio-contact-history', ids]` | **a stray root** nothing invalidates (CR5-22) |

Every detail key sits under its list root, so a root invalidation reaches it. No
duplicate root and no inline literal key in the reviewed surfaces.

### Every mutation, and what it invalidates

| Mutation | Invalidates |
|---|---|
| `useRecordChannelConsent` / `useRecordChannelInvite` / `useRecordChannelReconsent` | `consentKeys.all`, `peopleKeys.all`, `peopleSeatKeys.all`, + `['project-roster',pid]` and `['project-parties',pid]` when `originProjectId` is passed |
| `useRevokeAccessGrant` | `accessGrantKeys.all`, `['people-directory']`, `['people-directory-seats']`, `['project-roster']` — **misses `['field-links',…]`** (CR5-4) |
| `useCreateFieldLink` | `partySmsKeys.links(partyId)`, `['access-grants']`, `['people-directory']`, `['people-directory-seats']`, `['project-roster',pid]` *(only when `projectId` is passed — it is not, at `party-profile-sheet.tsx:491`; CR5-5)* |
| `useRevokeFieldLink` | the same five |
| `useSendPartySms` | `partySmsKeys.thread(partyId)` |
| `useAddStudioContact` / `useUpdateStudioContact` / `useArchiveStudioContact` / `useRestoreStudioContact` | `studioContactKeys.all`, `['people-directory']` — **misses `peopleSeatKeys.all`** (CR5-7; `use-studio-contacts.ts:277-278, 352-353, 379-380, 405-406`) |
| `usePromoteToStudioContact` | `studioContactKeys.all`, `['project-parties',pid]`, `['people-directory']` — **misses `peopleSeatKeys.all` and `['project-roster',pid]`** (CR5-7; `:534-538`) |
| `useAddStudioContactChannel` / `useUpdateStudioContactChannel` / `useSetStudioContactChannelStatus` | `studioChannelKeys.list(owner)`, `studioChannelKeys.all`, `studioContactKeys.detail(owner)`, `peopleKeys.all`, `peopleSeatKeys.all` |
| `useSetContactRule` / `useClearContactRule` | `contactRuleKeys.all`, `peopleKeys.all`, `peopleSeatKeys.all`, `studioContactKeys.detail(subject)` |
| `useSetAffiliation` / `useCloseAffiliation` | `affiliationKeys.all`, `studioContactKeys.all`, `peopleKeys.all`, `peopleSeatKeys.all`, `.detail(person)`, `.detail(company)` |
| `useRecordComplianceDocument` / `useConfirmComplianceDocument` | `complianceKeys.all`, `studioContactKeys.detail(holder)`, `peopleKeys.all`, `peopleSeatKeys.all` |
| `useAddProjectParty` | `['project-parties',pid]`, `peopleKeys.all`, `['project-roster',pid]`, `peopleSeatKeys.all`, `consentKeys.all` |
| `useUpdateProjectParty` | `['project-parties',pid]`, `['project-roster',pid]`, `peopleKeys.all`, `peopleSeatKeys.all` |
| `useRecordPartySmsConsent` | the four above + `['channel-consent']` |
| `useCloseProjectPartySeat` | `['project-parties',pid]`, `['project-roster',pid]`, `peopleKeys.all`, `peopleSeatKeys.all` |
| `useRemoveProjectParty` | the same four |
| `useSetPartyAuthority` | `partyAuthorityKeys.all` (reaching the portal-local `[…,'project',pid]`), `['project-parties',pid]`, `['project-roster',pid]`, `peopleSeatKeys.all` |
| `useUpdateSiteAccessCard` / `useLogSiteAccessTold` | `siteAccessKeys.detail(pid)` |
| `useChaseTheRenewal` | `['agent-tasks']` |

---

## 3. Prior findings, re-checked at HEAD

### `w2-fix-log-r4.md`'s six — **all verified FIXED**

* **QA‑R5‑1** FIXED. `add-person-sheet.tsx:412-429` (`typedPhoneE164` / `phoneMatchedCard` / `phoneCollisionName`, exactly-one match mirroring the trigger's `HAVING count(*) = 1`), `:1404-1419` (the sentence and its `aria-describedby`), `:1690-1696` (the submit act's `"add-party-phone-on-file add-party-consequence"`), `:735-737` + `:873-884` (`chainRef.autoLinkedCardId` and the landed-elsewhere clause). `sameWrittenName` is the test in both places.
* **QA‑R5‑2** FIXED in `supabase/seed/people_crm_dev.sql`. Re-verified on the live local DB: `Okonkwo residence` has 24 party rows, `people_directory_seats` nests all 24 for `designer@patina.dev`, and the window literals are shifted rather than rewritten.
* **QA‑R4‑3** FIXED. `reach-access.tsx:894-1000` is one `{isPerson && (<>…</>)}` block; a company card renders `Channels` then `Access grants` and no `Edit the rule`.
* **CR‑1** FIXED **at the party sheet only.** `party-profile-sheet.tsx:257-260` now reads `useProjectRecordedStudio(seatProjectId)` and `showPromoteBand` is gated on it. **Two sibling write sites were not repointed — CR5-1 below.**
* **CR‑2** FIXED. `grantWindowEnd` and `MINT_FALLBACK_SENTENCE` live in `roster-derivation.ts:950-971`; `roster-row.tsx:264` reads them and uses the one value three times (`expiresAt`, `expiry_source`, the printed sentence); `reach-access.tsx:63-64` imports them back. `CallSheetRow.warrantyUntil` is filled from `PeopleDirectorySeat.warranty_until`.
* **CR‑3** FIXED. `roster-row.tsx:342` — `onOpenSeat && row.personId && row.seatId && seatProfileRole(row.partyKind)`, and `peopleEvents.personCardOpened` now fires inside that branch only.

### `w2-review-r4-code.md`'s thirteen minors — **all still OPEN, untouched by design**

Re-read at HEAD and each confirmed present: CR‑4 (`use-access-grants.ts:296-307`),
CR‑5 (`party-profile-sheet.tsx:491`), CR‑6 (`command-bar.test.tsx:61,65,114,510…647`),
CR‑7 (five fan-outs), CR‑8 (`call-sheet.tsx:88` → `roster-groups.tsx:67-69`;
`rolodex-picker.tsx:179-184`; `add-person-sheet.tsx:481-485`), CR‑9
(`use-coordination.ts:929-940`), CR‑10 (`roster-row.tsx:641`, `notice-log.tsx:139`),
CR‑11 (`party-mini-row.tsx:186-196`), CR‑12 (seven live regions), CR‑13
(`site-access-card.tsx:248-255`), CR‑14 (`seat-line.tsx:88-101`, `py-[6px]`),
CR‑15 (`contact-rule-line.tsx:10-12` and `:46-48`), CR‑16 (the twelve r3 minors:
CR3‑11 `people-derivation.ts:1096`, CR3‑12 `person-profile.tsx:498-505`, CR3‑13
`person-row.tsx:230-234`, CR3‑14 `people-room.tsx:397-404`, CR3‑15
`company-card.tsx:770`, CR3‑16 `party-profile-sheet.tsx:941` +
`rolodex-picker.tsx:519`, CR3‑17 `access-grant-list.tsx:36-37`, CR3‑18
`add-person-sheet.tsx:1510`, CR3‑20/21/22/23/24). They are carried below as
CR5‑4 … CR5‑15 with their re-verified line numbers.

---

## 4. Findings

### CR5-1 · MAJOR · high confidence — the studio guess that CR‑1 removed from the party sheet still drives TWO rolodex writes, and each failure leaves an orphan card in the book

`apps/designer-portal/src/components/document/people/directory/add-person-sheet.tsx:762-763`

```ts
if (!chain.cardId && wantsCard && organizationId) {
  const card = await promoteToCard.mutateAsync({ organizationId, party });
```

`apps/designer-portal/src/components/document/roster/rolodex-picker.tsx:298-311`

```ts
if (stamp && organizationId) {
  const contact = await addContact.mutateAsync({ organizationId, … });
  studioContactId = contact.id;
}
…
await addParty.mutateAsync({ projectId, …, studioContactId });
```

In both, `organizationId` is the studio that holds the **book**
(`add-person-sheet.tsx:325-333` → the `organizationId` prop, which
`people-room.tsx:159-162` derives as `directoryRolodexOrgId(all) ?? memberOrgId`;
`rolodex-picker.tsx:179-184` derives the same tally locally). The guard the write
is checked against is the studio the **job** records —
`assert_project_party_cards()` (00624) reads `project_recorded_studio(NEW.project_id)`
for `studio_contact_id` and refuses otherwise. That is exactly the resolver
CR‑1's fix introduced, `useProjectRecordedStudio` (`use-coordination.ts:2131-2147`),
which neither of these two call sites reads.

**Failure scenario, with live evidence.** Five of the eight local projects record
no studio (`projects.studio_id IS NULL`) — R‑BI's named legacy population, which
W3 backfills and which the W7 preflight is supposed to *count*, not assume away:

```
$ psql … "select p.name, p.studio_id, public.project_recorded_studio(p.id) from projects p"
  Aspen Loft Refresh | (null) | (null)        Birch Hollow | (null) | (null)
  Chen Residence     | (null) | (null)        Marrow & Vale Residence | (null) | (null)
  Olsen Lake House   | (null) | (null)
  Cedar Lane Study / Lindqvist kitchen / Okonkwo residence → Local Dev Studio
```

The seat INSERT on such a project succeeds (all three card columns NULL, the
guard returns early); the card stamp does not:

```
$ psql … BEGIN;
  INSERT INTO project_parties (project_id, party_kind, display_name)
    VALUES ('b0000000-…-0000000000d1','sub','CR5 Probe Person');      → INSERT 0 1
  UPDATE project_parties SET studio_contact_id = <a Local Dev Studio person card>
    WHERE display_name='CR5 Probe Person';
  ERROR:  party_card_project_has_no_studio
  CONTEXT: PL/pgSQL function assert_compliance… assert_project_party_cards() line 17
  ROLLBACK;
```

So the Add sheet's sequence on any studio-less project — and, for a designer in
two design studios, on any project whose recorded studio is not the one holding
the book (`designer@patina.dev` is a member of two) — is:

1. `useAddProjectParty` writes the seat (succeeds, `studio_contact_id` NULL);
2. `usePromoteToStudioContact` INSERTs a `studio_contacts` row into the book's
   org (succeeds — the policy only asks `is_active_studio_member(organization_id)`);
3. the same mutation's second PostgREST call, `UPDATE project_parties SET
   studio_contact_id = …`, raises, `mutateAsync` rejects, and **`chain.cardId`
   is never assigned** (`add-person-sheet.tsx:764`), so the two calls leave a
   card behind with nothing pointing at it;
4. the designer sees "This project isn't attached to a studio yet, so a firm from
   the studio's book can't be put on its seats. Give the project a studio first."
   (`writeErrorMessage:171`) — a sentence that says nothing about the card that
   was just written into their rolodex;
5. **pressing Add again mints a second orphan**, and a third, because the resume
   chain only records a card id it never received.

The picker's half is worse on the reporting side: `rolodex-picker.tsx:327` tests
`e instanceof Error`, and a PostgREST rejection is a plain object (the same fact
`writeErrorMessage`'s own docblock records at `add-person-sheet.tsx:147-149`), so
the refusal reaches the face as the generic "Could not add them to the call
sheet." with an orphan card already written and no way to tell.

**Fix:** resolve the studio from the seat's project in both places, exactly as
`party-profile-sheet.tsx:257-260` now does — `useProjectRecordedStudio(projectId)`
— and where it resolves NULL, do not mint a card at all (state the fact instead,
the way `showPromoteBand` does). The picker's `catch` should go through
`writeErrorMessage`, not `e instanceof Error`.

---

### CR5-2 · MAJOR · medium confidence — "Revoke" on a `project_review` grant closes the door for EVERY reviewer on that edition, and the card never says so

`apps/designer-portal/src/components/document/people/access-grant-list.tsx:171-200`

`ACCESS_GRANT_REVOKE_ROUTES` declares the fact and the reason the surface must
carry it (`use-access-grants.ts:133-139`):

```ts
/**
 * True when the RPC closes the door for EVERY subject on the scope, not just
 * this row's. `revoke_project_review_access` revokes the whole edition, so a
 * per-row Revoke there closes every reviewer — the surface must say so in
 * its consequence sentence before the act.
 */
revokesWholeScope?: boolean;
```

`grep -rn "revokesWholeScope" apps packages` outside the type and the table
returns **nothing**. `AccessGrantList` renders one `Revoke` act for every
revokable tier with one fixed prompt and no tier-specific consequence sentence.

The RPC is unambiguous:

```
$ psql … pg_get_functiondef('revoke_project_review_access')
  UPDATE public.project_review_access SET status='revoked', revoked_at=now(), …
   WHERE edition_id = p_edition_id AND status='active';
  … IF char_length(btrim(COALESCE(p_reason,'')))<5 THEN RAISE 'revocation reason is required'
```

and the grant is reachable on an ordinary person card: `v_access_grants`'
`project_review` leg sets `subject_id = pra.actor_id`, a **profile** id, and
`person-profile.tsx:219-223` pushes `person.profile_id` into `grantSubjectIds`.
So a designer opening a person card, seeing one "Review access · one review
edition" row and pressing Revoke revokes every other reviewer's access to that
edition, with the only visible sentence beside the act being
`REVOKE_REASON_PROMPT` — which reads "Say why the door closes. **Optional**,
kept with the record." on the one route in the table whose
`reasonRequired: true` and whose RPC refuses a reason under five characters
(carried CR3‑17, now with teeth: the prompt is not merely wrong, it is wrong on
the row whose act is the widest).

Confidence is medium only because the local seed holds zero
`project_review_access` rows (`select count(*) → 0`), so no walk would surface
it; the code path is live and the blast radius is proven from the RPC body.

**Fix:** print the tier's own consequence sentence above the confirm —
`revokesWholeScope` must produce something like "This closes the review for
everyone on this edition, not only <name>." — and make the reason field required
(and ≥5 characters) where `reasonRequired` is set, rather than labelled
"Optional".

---

### CR5-3 · MINOR · high confidence (carried, CR‑4/CR3‑5) — revoking a grant from the person card leaves the party sheet's link read stale

`packages/supabase/src/hooks/use-access-grants.ts:296-307` invalidates
`accessGrantKeys.all`, `['people-directory']`, `['people-directory-seats']` and
`['project-roster']` — not `partySmsKeys.links(partyId)`. `useRevokeFieldLink`
(`use-party-sms.ts`) does. Two doors onto one token, two answers. Fix: thread the
subject id through `RevokeAccessGrantInput` and invalidate `['field-links', id]`,
or invalidate the `['field-links']` root.

### CR5-4 · MINOR · high confidence (carried, CR‑5/CR3‑6) — minting from the party sheet does not move the Call Sheet behind it

`party-profile-sheet.tsx:491` — `createLink.mutateAsync({ partyId })`. `projectId`
is omitted, so `useCreateFieldLink`'s `['project-roster', projectId]` leg is
skipped; `seatProjectId` is in scope at `:232` and IS passed to the revoke twenty-three
lines later (`:514-518`). The roster row behind the open sheet keeps printing reach
`On paper` for a door that is now open.

### CR5-5 · MINOR · high confidence (carried, CR‑6) — a retired flag still has a live mock and eight branch-setting tests

`apps/designer-portal/src/components/document/command-bar.test.tsx:61, 65, 114`
and eight `mockCallSheetFlag = true` assignments (`:510, 527, 540, 554, 568, 583,
614, 647`). The file is byte-identical to `origin/main`; `command-bar.tsx` reads
no `call-sheet` flag any more, so those assertions now pass for a different
reason than they were written for. w2c's list of 14 retired consumers does not
name this file.

### CR5-6 · MINOR · high confidence (carried, CR‑7/CR3‑7) — five card mutations move the identity read model but not the seats one

`use-studio-contacts.ts:277-278, 352-353, 379-380, 405-406, 534-538`.
`people_directory_seats` carries `display_name, company_name, phone_e164,
studio_contact_id, consent_status, reach_state, paper_state,
contact_rule_summary, warranty_until` — every one of which a card edit can move —
and `usePromoteToStudioContact` writes the column that decides a seat's whole
identity fold. Every other card-adjacent fan-out in this wave invalidates both
roots.

### CR5-7 · MINOR · medium confidence (carried, CR‑8/CR3‑8/CR3‑9) — three Call Sheet reads resolve a TENANT question with something other than the project's studio

* `call-sheet.tsx:88` → `roster-groups.tsx:67-69` — `useProjectConsentOrg(projectId)`
  feeds `useStudioContacts(consentOrg)`. R‑BD rules that every tenant resolution
  for a project uses `project_tenant_org()`, and 00594's own comment says
  `project_consent_org` is "NOT the resolver for the site access card or the
  authority grant". On a studio-less project the read comes back empty,
  `peopleById` is empty, `contactRouteTarget` returns `null`, and SPEC §5.4 #12 /
  R‑L's routed line prints "…Write Rosa Delgado…" with no email and no `tel:`.
* `rolodex-picker.tsx:179-184` — the picker's `organizationId` is a
  "which org holds the most cards" tally, so on a project belonging to the
  designer's other studio it offers cards the guard will refuse.
* `add-person-sheet.tsx:481-485` — `isOrgAdmin` reads the membership role for the
  studio that holds the BOOK while the DB policy gates on
  `project_party_recorded_studio(engagement_id)`.

### CR5-8 · MINOR · medium confidence (carried, CR‑9) — the server-side delete guard asks a narrower paper question than the face, and fails open on an unreadable read

`use-coordination.ts:936-945` (`useRemoveProjectParty`). `hasComplianceDocument`
reads only `studio_compliance_documents WHERE holder_id = <the card>`, while the
face's `roster-row.tsx:242-246` uses `row.paper`, which is
`identity_paper_state(studio_contact_id, COALESCE(seat.company_id, card.company_id))`
— worst-first over the person AND their firm (R‑BA / R‑BJ). A seat whose only
held paper is the firm's lapsed COI is refused by the face and permitted by the
hook. Separately, an RLS-refused read returns `[]` rather than raising, so the
guard reads "no paper held". The UI is the stricter of the two today, but the
hook is the guard that exists for when the UI is bypassed.

### CR5-9 · MINOR · high confidence — four dead `useFeatureFlag` imports and two flag-shaped parameters survive the retirement

Imports now referenced nowhere in their file (lint does not flag them; I ran
`npx eslint` on all four and it is silent):
`mobile/mobile-bar.tsx:20`, `mobile/mobile-sheets.tsx:54`,
`letterhead-instruments.tsx:31`, `coordination/item-composer.tsx:48`.

Two flag parameters remain in `lib/document`:
`lens-ladder-derivation.ts:637-644` (`callSheetEnabled?: boolean`, with a
docblock that still describes the flag as live and a live branch at `:689`
`if (input.callSheetEnabled ?? true)`), and `shelves.ts:95-120`
(`callSheetEnabled: boolean` gating the `callsheet` shelf). `shelvesFor` has
**no production caller at all** — `grep -rn "shelvesFor" apps/designer-portal/src`
returns the definition and one test file — so it is a dead function carrying a
retired flag. `ticket-derivation.ts:719-741` also still branches on
`people.callSheetEnabled`; the only non-`true` producer is
`doc/[id]/page.tsx:813`'s projectless path, where `hasProject(input)` already
answers false, so the behaviour is correct and only the scaffolding is dead.

### CR5-10 · MINOR · high confidence — `openPersonLabel` is exported and used nowhere; the Directory's open-person control names only the person

`directory/person-row.tsx:51-55` defines and exports `openPersonLabel(person)`
("name, identity line"); `grep -rn "openPersonLabel" apps/designer-portal/src`
returns only that line. The rendered control (`:130-137`) has the bare
`{person.display_name}` as its accessible name. SPEC §7 #6 describes an
open-person button "whose accessible name is the person's name **and role summary**
only". Either wire the helper or delete it; a helper that exists and is bypassed
reads as the rule being applied when it is not.

### CR5-11 · MINOR · medium confidence (carried, CR‑11) — a mini row uses the `disabled` attribute and opacity to express a state

`roster/party-mini-row.tsx:186-196` — `<button … disabled={disabled}
className="… disabled:opacity-50 …">`. Both the attribute (SPEC §7 #4,
direction §5.5) and opacity-as-state (SPEC §8 #5) are named forbidden.
`rolodex-picker.tsx:405` passes `disabled={addParty.isPending}` so it is
transient, but `party-mini-row.tsx` is in this wave's changed set.

### CR5-12 · MINOR · high confidence (carried, CR‑10) — two `aria-describedby` references dangle once the act becomes available

`roster-row.tsx:641` sets `aria-describedby={`${panelId}-send-held`}`
unconditionally while the `<p id=…>` renders only `{!body.trim() && …}`
(`:653-660`). `notice-log.tsx:139` sets `aria-describedby={heldId}`
unconditionally while `<p id={heldId}>` renders only `{picked.length === 0 && …}`
(`:151-157`). `roster-row.tsx:499` and `:543` already do it conditionally, in the
same file.

### CR5-13 · MINOR · medium confidence (carried, CR‑12) — more than one live region can be live on one screen

`people-room.tsx:561` is the Room's announcer, but `directory-view.tsx:364`,
`call-sheet.tsx:179`, `roster-row.tsx:666`, `project-team-roster.tsx:94`,
`rolodex-picker.tsx:430`, `promote-band.tsx:41` and `rolodex-seed-sheet.tsx:208`
each still carry their own `role="status"`. SPEC §7 #3 asks for exactly one.

### CR5-14 · MINOR · medium confidence (carried, CR‑13) — an emergency line with no name is silently deleted by any unrelated edit to the list

`site-access-card.tsx:248-255` — `storedLines()` is the round-trip shape for
every write to `emergency_lines` and it `.filter((line) => !!line?.name)`, so
adding or removing one line rewrites the array without any stored line carrying
a phone and a role but no name. The add form refuses a nameless line
(`:455-460`), but the seed and any import can write one, and the card's own
render (`:246`) hides them, so the loss is invisible.

### CR5-15 · MINOR · low confidence (carried, CR‑14) — a seat line is a control well under the room's own 44px floor

`seat-line.tsx:88-101` — `py-[6px]` around an 11px `.t-meta` span, roughly 28px
tall, while every other control in the room carries `min-h-11`
(`person-row.tsx:134, 211`, `TelLink`'s `min-h-[44px]`, the chips, the
disclosures). SPEC §6.2's Targets rule names the row's open control and the
`tel:` link and does not name the seat line — but R‑AA makes the seat line a
door.

### CR5-16 · MINOR · low confidence — `new Date()` is read during render on every roster row

`roster-row.tsx:184` (`doc.expires_on < new Date().toISOString().slice(0,10)`)
and `:264` (`grantWindowEnd(row.onSiteTo, row.warrantyUntil, new Date())`). Both
allocate a fresh clock on every render, against the room's own convention
(`people-room.tsx:137`, `company-card.tsx:214`, `person-profile.tsx`, all
`useMemo(() => new Date(), [])`). The derivations only move across a day
boundary, so this is a determinism/consistency nit rather than a live bug.

### CR5-17 · MINOR · low confidence — the roster row's Send act emits a real `disabled` while sending

`roster-row.tsx:639-640` — `held={!body.trim()}` and `disabled={!body.trim() ||
sendSms.isPending}`. With a non-empty body and a send in flight, `held` is false
and `DocumentAction` emits the native `disabled` (`document-action.tsx:309`,
`disabled={unavailable && !held}`), which SPEC §7 #4 forbids outright. Same shape
as the carried `rolodex-picker.tsx:563`. Transient, and `loading` is also set.

### CR5-18 · MINOR · medium confidence — the person card's three Reach & access sub-heads are `<h3>` siblings of the region's own `<h3>`

`person-profile.tsx:334-336` renders `<h3>Reach & access</h3>`; `reach-access.tsx:792,
:909, :998` render `<h3>Channels</h3>`, `<h3>Contact rule</h3>`,
`<h3>Access grants</h3>` inside the same `<section>`. SPEC §5.2 #2 calls them
sub-heads of that region; at the same level they read as four peers. `h1 → h2 →
h3` order itself is unbroken (RoomShell `h1` at `room-shell.tsx:148`, the card's
name at `h2`), so this is structure, not an order violation. Same shape on the
company card (`company-card.tsx:696` `<h3>Reach & access</h3>` above the same
component).

### CR5-19 · MINOR · high confidence — three docblocks describe behaviour the code no longer has

* `contact-rule-line.tsx:10-12` ("A HARD BLOCK — a rule that forbids a channel
  outright") and `:46-48` ("True when the rule forbids a channel outright") are
  the pre-R‑BL reading (carried CR‑15).
* `contact-rule.ts:95-103` names F‑10 Sam Rowe and F‑13 Ingrid Halvorsen as rows
  that "wear a rule the fixture marks `false`". Under the shipped predicate
  (`contactRuleIsDoNotContact(rule) || route_to_person_id`) neither does: the
  seeded rows are `forbidden={sms}` / `{sms,mobile}` with no route, so no leading
  rule prints. The live divergence runs the other way — F‑26 Carol Nyström and
  F‑27 Ray Thao are `block: true` in SPEC §3 and print **no** leading rule here.
  CR3‑23's orchestrator ruling is still owed, and the comment should describe the
  divergence that actually exists. (Verified against the seed:
  `select full_name, channels_forbidden, route_to_person_id is not null from
  studio_contact_rules` → only Frank Bauer routes and only Frank Bauer forbids
  all four direct channels.)
* `people-events.ts:4` says "Eight events"; `PEOPLE_EVENT_NAMES` defines nine.

### CR5-20 · MINOR · high confidence — two ids that nothing points at, and two hardcoded ids where `useId` is the file's own pattern

`reach-access.tsx:1021` renders `<p id={mintBandId}>` and no `aria-describedby`
names it (the mint act points at `mintReasonId`). `site-access-card.tsx:400` and
`:558` hardcode `aria-controls="site-access-emergency-lines"` /
`"site-access-key-holder"`, while every other disclosure in this wave uses
`useId()`; two site access cards on one document (a second project sheet) would
collide.

### CR5-21 · MINOR · high confidence (carried, CR3‑15) — every drafted chase reads "for a current certificate"

`company-card.tsx:769-770` — `documentId: docs[0]?.id ?? null, documentLabel:
docs[0] ? null : "a current certificate"`. The label is `null` exactly when a
document exists, and the route falls back to the same literal
(`route.ts:83`, `${documentLabel ?? 'a current certificate'}`), so both branches
produce one string and the draft never names the paper being chased.

### CR5-22 · MINOR · medium confidence — a second root over card/seat data that nothing invalidates

`use-studio-contacts.ts:445` keys `useStudioContactHistory` at
`['studio-contact-history', ids]`, outside `studioContactKeys`. It reads
`project_parties` (project count, last project, last date) and feeds the picker's
history line (`rolodex-picker.tsx:214`), yet no seat or card mutation invalidates
it — `useAddProjectParty`, `useCloseProjectPartySeat` and
`usePromoteToStudioContact` all move the rows it counts. Fix: nest it under
`studioContactKeys` (or add it to the seat fan-out).

### CR5-23 · MINOR · low confidence — `v_access_grants` labels the revoker as the granter

`v_access_grants`' `project_review` leg selects `pra.revoked_by AS granted_by`
(view definition line 167). No W2 surface renders `granted_by`
(`grantRowParts` prints tier, opens, minted, used), so nothing is visibly wrong
today — but the column is a trap for the next reader. A W1b view fix, recorded
here because W2a's `AccessGrant` interface types it.

---

## 5. What this review did not cover

The visual and behavioural walk at 1440 and 390 (the QA reviewer owns 3000/3002),
the Playwright specs under `e2e/people` (not run — no port taken), the iOS
surfaces under `apps/mobile/Capture`, the W1 migrations beyond the policies,
triggers and functions named above, the dev seed beyond the band composition
re-check, and the Sanity help articles.
