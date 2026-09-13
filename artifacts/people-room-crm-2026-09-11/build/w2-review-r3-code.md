# W2 — adversarial code review, round 3

Reviewer context: fresh. Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. Read before reviewing: `rulings.md` (§1–§3, §6),
`synthesis/direction.md` §1–§8 incl. §3.9, `specimens/SPEC.md` §3/§5/§6/§7/§8, both specimen
HTML files, `build/w1a-report.md`, `build/w1b-report.md`, `briefing/current-state.md` §A,
`briefing/shots/strings-today.md`, `build/w2a-report.md`, `w2b-report.md`, `w2c-report.md`,
`build/w2-fix-log-r2.md`. Every changed file under `apps/designer-portal/src`,
`packages/supabase/src/hooks` and `packages/types/src` was read.

**Verdict: NOT clean — 4 major, 0 blocking, 20 minor.**

---

## 0. Gates, run here

| Gate | Command | Result |
|---|---|---|
| designer type-check | `pnpm --dir <wt> --filter @patina/designer-portal type-check` | `tsc --noEmit` · **EXIT 0** |
| supabase type-check | `pnpm --dir <wt> --filter @patina/supabase type-check` | `tsc --noEmit` · **EXIT 0** |
| admin-portal build (strictest) | `pnpm --dir <wt> --filter @patina/admin-portal build` | full route manifest · **EXIT 0** |
| designer jest (whole suite) | `cd apps/designer-portal && npx jest --silent` | `Test Suites: 584 passed, 584 total` · `Tests: 7432 passed, 7432 total` · **EXIT 0** |
| designer jest (changed dirs) | `npx jest src/components/document/people src/components/document/roster src/lib/document src/app/(document)/desk` | `Test Suites: 141 passed` · `Tests: 2702 passed` · **EXIT 0** |
| supabase vitest | `cd packages/supabase && npx vitest run src/hooks/__tests__` | `Test Files 90 passed` · `Tests 1175 passed | 12 skipped` · **EXIT 0** |
| eslint (changed dirs) | `npx eslint src/components/document/people src/components/document/roster src/lib/document src/lib/analytics src/app/api/people` | `✖ 6 problems (0 errors, 6 warnings)` · **EXIT 0** |

No dev server was started; no port was taken; no prod was touched. Local DB read-only.

---

## 1. Mechanical checks the brief names

| Check | Result |
|---|---|
| Hooks above early returns | **PASS.** Scripted scan + manual read of `people-room`, `directory-view`, `person-profile` (hooks end :234, `maker` return :238), `company-card` (hooks end :431, `!card` return :432), `reach-access`, `add-person-sheet`, `party-profile-sheet`, `roster-row`, `roster-groups`, `site-access-card`, `rolodex-picker`, `view-shell`. No conditional hook anywhere. |
| Hydration gate | **PASS (no new risk).** The room is a client-only page (`app/(document)/people/page.tsx` is `'use client'`, all data is React Query). `useMemo(() => new Date(), [])` matches the shipped pattern in `threads-view`, `nurture-view`, `outreach/audiences-tab`. No `window`/`document` read during render in any changed file. |
| Consent writes only through the record RPCs | **PASS.** `record_channel_consent` / `record_channel_invite` / `record_channel_reconsent` only. No table write to `studio_channel_consent`. |
| No portal writer of the frozen columns (R-AS) | **PASS.** `grep -rn --include=*.ts --include=*.tsx -e sms_consent_status -e sms_opt_out_at -e sms_consented_at -e sms_consent_source -e sms_consent_evidence apps packages` returns only: generated `database.types.ts`, the `ProjectParty` / `ProjectRosterRow` READ types, docblocks, and `roster-derivation.ts:149` (a synthetic in-memory row object, not a payload). Zero writers. |
| No hard delete outside the mistaken-add predicate | **PASS.** Only two `.delete()` in the changed hooks: `project_parties` at `use-coordination.ts:951`, gated by `seatDeleteRefusal` on consent / bid stage / held paper; and `studio_contact_rules` in `useClearContactRule` (lifting a rule, documented; channels and affiliations are status/date moves, never deletes). |
| Site access card never reaches a client surface | **PASS.** `SiteAccessCard` is mounted from `roster/call-sheet.tsx:221` only. 00625 has four studio policies, no client leg, no `show_to_client`. No reference in `apps/client-portal`. |
| No code field anywhere | **PASS.** `gate_code` / `lockbox_code` / `alarm_code` appear only in migration banners, the seed comment and the W1b SQL test that asserts the columns do not exist. `UpdateSiteAccessCardInput` carries none. |
| PR-n gating, client AND DB | **PASS** (see CR3-9 for a scoping caveat). Client: `add-person-sheet.tsx:429` `isOrgAdmin`, `:448` reset effect, `:773` pre-write refusal with a sentence, `:1413` option gate. DB: `project_party_authority_studio_insert/update/delete` each carry `scope NOT IN ('money','draw_certify') OR is_org_admin_or_owner(project_party_recorded_studio(engagement_id))`. |
| `call-sheet` flag fully removed | **PASS.** `grep -rn "useFeatureFlag('call-sheet')" apps packages` → nothing. All 14 consumers repointed; the dead branches (`callSheetOn ? … : 0` counts, the item composer's `<select>` court picker, the command bar's surface filter, the mobile bar's conditional spread, the studio page's `onSkipSeed`/`onOpenSeedReview` guards, the `RolodexSeedSheet` mount guard) are deleted, not left standing. `command-bar.tsx:488 case 'call-sheet'` is a surface-key switch, not a flag. |
| dist rebuilt after edits | **PASS.** `@patina/types` is the only reviewed package with a `dist`. `dist/field-config.js` 12 Sep 23:00 > `src/field-config.ts` 22:48; `dist/studio-config.js` 21:27 > `src/studio-config.ts` 20:57. Export parity checked programmatically: 39/39 `studio-config`, 29/29 `field-config`, nothing missing from the `.d.ts`. `@patina/supabase` and `@patina/design-system` have no dist (consumed from source). |
| Analytics only via `people-events.ts` | **PASS.** No `posthog.` or bare `capture(` in `components/document/people` or `components/document/roster`. `people-events.ts` is the only caller of `posthog.capture`, behind `isAnalyticsEnabled()`. Nine acts, no engagement metric. |
| Document grammar — `box-shadow` in changed files | **PASS (0).** The only hits in the whole changed set are `globals.css:360` / `:1942`, both pre-existing and outside this diff, plus one docblock sentence in `state-word.tsx`. Every new surface paints with `var(--…)` tokens; `StateWord` is border+text on `background: 'transparent'` (SPEC §8 #10). |
| No `<a>` inside `<button>` | **PASS.** Scripted scan over every `<button>`/`<DocumentAction>` block in `people/**` and `roster/**`: zero nested anchors. `TelLink` is always a sibling. |
| `aria-expanded` pairs with a real id | **PASS.** All 13 pairs resolve to a rendered `id` (`company-designations-<id>`, `company-payee-<id>`, `company-verdict-<id>`, `site-access-emergency-lines`, `site-access-key-holder`, `seatsPanelId`, `panelId`, `channelBandId`, `ruleBandId`, `confirmId`, `statusBandId`, `bandId`, `authorityFieldId`). |
| No `disabled` attribute on an act | **PASS on acts.** Every `disabled={…}` on a `DocumentAction` in the changed surfaces is paired with `held={…}`, and `DocumentAction` emits `disabled={unavailable && !held}` → `false` with `aria-disabled="true"`. One exception on a non-act: `<option disabled>` (CR3-18). |
| One live region | **PASS in practice.** `people-room.tsx:556` is the Room's announcer (rendered only while a toast is live); `person-profile.tsx:294` and `company-card.tsx:462` both document dropping their own in favour of it (CR3-11). `directory-view.tsx:364` is an inline `role="status"` notice, and `roster-row`/`call-sheet`/`project-team-roster` each carry one inside their own sheet. `role="alert"` error slots are separate and correct. |
| Types imported, not redefined | **PASS.** No local re-declaration of `PartyKind` / `FieldTrade` / `ReachState` / `PaperState` / `SeatStage`. `use-coordination.ts:51` is an explicit re-export alias of `SharedPartyKind`. `coordination/party.ts` now imports `PartyKind` rather than keeping a second list. `studio-config` and `field-config` are both `export *`'d from `packages/types/src/index.ts`. |
| No ad-hoc fetch to a service | **PASS.** The only new `fetch` is `compliance-chase.ts:47` → same-origin `/api/people/chase-renewal`, which proves membership through the caller's own RLS before enqueuing with the service role (`enqueue_agent_task` is granted to `agent_writer`/`service_role` only). No NestJS call outside `@patina/api-routes`. |
| RLS-safe writes send every joined column | **PASS.** Interface/column parity verified against the live local schema for all eleven read shapes (`PeopleDirectoryRow`, `PeopleDirectorySeat`, `StudioContact`, `StudioContactChannel`, `StudioContactRule`, `StudioPersonAffiliation`, `StudioComplianceDocument`, `ProjectPartyAuthority`, `ProjectSiteAccessCard`, `ProjectParty`, `ProjectRosterRow`, `ChannelConsentRecord`, `AccessGrant`) — zero drift. Writes: `studio_contact_channels` sends `owner_id` (policy joins `studio_contact_org(owner_id)`); `studio_contact_rules` sends `subject_type`+`subject_id`; `studio_compliance_documents` sends `organization_id`; `project_party_authority` sends `engagement_id`+`scope`; `project_site_access_cards` sends `project_id`. |

---

## 2. Query keys, one root per entity

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
| Seat authority | `['project-party-authority']` | `.list(engagementId)`, `[…,'project',projectId]` (portal-local, nested under the root on purpose) |
| Site access card | `['project-site-access']` | `.detail(projectId)` |
| Roster (Call Sheet) | `['project-roster', projectId]` | — |
| Seats (raw) | `['project-parties', projectId]` | — |
| Field link token | `['field-links', partyId]` | — (a SECOND read model over the same entity as `access-grants`; see CR3-5) |

Every detail key sits **under** its list root, so a root invalidation reaches it. No duplicate root, no
inline literal key in the reviewed surfaces.

### Every mutation and what it invalidates

| Mutation | Invalidates |
|---|---|
| `useRecordChannelConsent` / `useRecordChannelInvite` / `useRecordChannelReconsent` | `consentKeys.all`, `peopleKeys.all`, `peopleSeatKeys.all`, `['project-roster',pid]`, `['project-parties',pid]` |
| `useRevokeAccessGrant` | `accessGrantKeys.all`, `['people-directory']`, `['people-directory-seats']`, `['project-roster']` — **misses `['field-links',partyId]`** (CR3-5) |
| `useCreateFieldLink` | `partySmsKeys.links`, `['access-grants']`, `['people-directory']`, `['people-directory-seats']`, `['project-roster',pid]` *(only when `projectId` is passed — it is not, at `party-profile-sheet.tsx:469`; CR3-6)* |
| `useRevokeFieldLink` | same five |
| `useSendPartySms` | `partySmsKeys.thread` |
| `useAddStudioContact` / `useUpdateStudioContact` / `useArchiveStudioContact` / `useRestoreStudioContact` | `studioContactKeys.all`, `['people-directory']` — **misses `peopleSeatKeys.all`** (CR3-7) |
| `usePromoteToStudioContact` | `studioContactKeys.all`, `['project-parties',pid]`, `['people-directory']` — **misses `peopleSeatKeys.all` and `['project-roster',pid]`** (CR3-7) |
| `useAddStudioContactChannel` / `useUpdate…` / `useSetStudioContactChannelStatus` | `studioChannelKeys.list(owner)`, `studioChannelKeys.all`, `studioContactKeys.detail(owner)`, `peopleKeys.all`, `peopleSeatKeys.all` |
| `useSetContactRule` / `useClearContactRule` | `contactRuleKeys.all`, `peopleKeys.all`, `peopleSeatKeys.all`, `studioContactKeys.detail(subject)` |
| `useSetAffiliation` / `useCloseAffiliation` | `affiliationKeys.all`, `studioContactKeys.all`, `peopleKeys.all`, `peopleSeatKeys.all`, `studioContactKeys.detail(person)`, `.detail(company)` |
| `useRecordComplianceDocument` / `useConfirmComplianceDocument` | `complianceKeys.all`, `studioContactKeys.detail(holder)`, `peopleKeys.all`, `peopleSeatKeys.all` |
| `useAddProjectParty` | `['project-parties',pid]`, `peopleKeys.all`, `['project-roster',pid]`, `peopleSeatKeys.all`, `consentKeys.all` |
| `useUpdateProjectParty` | `['project-parties',pid]`, `['project-roster',pid]`, `peopleKeys.all`, `peopleSeatKeys.all` |
| `useRecordPartySmsConsent` | the four above + `['channel-consent']` |
| `useCloseProjectPartySeat` | `['project-parties',pid]`, `['project-roster',pid]`, `peopleKeys.all`, `peopleSeatKeys.all` |
| `useRemoveProjectParty` | same four |
| `useSetPartyAuthority` | `partyAuthorityKeys.all`, `['project-parties',pid]`, `['project-roster',pid]`, `peopleSeatKeys.all` |
| `useUpdateSiteAccessCard` / `useLogSiteAccessTold` | `siteAccessKeys.detail(pid)` |
| `useChaseTheRenewal` | `['agent-tasks']` |

---

## 3. Prior findings, re-checked at HEAD

**Round-2 CR-1…CR-16** — all FIXED. Spot-confirmed: CR-1 (`lib/document/compliance-chase-task.ts`
holds the literal; type-check exits 0), CR-2 (`AccessGrantFilters.subjectIds` + `grantSubjectIds`
threaded from both cards), CR-3 (`seededRuleRef` + `otherForbidden` + whole-row round-trip in
`reach-access.tsx:697-713, 785-800`), CR-4 (one predicate pair in `lib/document/contact-rule.ts`),
CR-6/CR-15 (`companyKindShortLabel` / `contactCardKindLabel`), CR-7 (`STUDIO_KINDS =
new Set(["studio","team"])`, `people-derivation.ts:974`), CR-8 (designations + payee + company
`ReachAccess`), CR-9 (`ContactRuleLine` under every crew name), CR-11 (`getPartyKindLabel` in Past
seats), CR-12 (scope picker + threshold + PR-n), CR-13 (`ACCOUNT_TIERS` in `grantEndsSentence`),
CR-14 (`openJobs` derived in the card), CR-16 (settled by R-BL).

**Round-2 re-dispatch CR-1…CR-10** — nine FIXED, one **regressed at its call site**:

* CR-1 FIXED (branch green, R-BL predicate + rewritten pin).
* CR-2 FIXED (`consentSentenceForRecord` takes a resolution, never `record.status`).
* CR-3 FIXED (`companyId` on `AddProjectPartyInput`/`UpdateProjectPartyPatch`, `company_id` on the
  insert, `useSetAffiliation` in the chain, three 00624 refusals translated).
* **CR-4 OPEN at the surface** — the hook is right, the only caller defeats it. See **CR3-3**.
* CR-5 FIXED for `useRevokeFieldLink`; the same shape is still open on two neighbours (CR3-5, CR3-6).
* CR-6 FIXED (`consentKeys.all` on the add path).
* CR-7 FIXED (`roster-row.tsx:562-569`, visible, not `sr-only`).
* CR-8 FIXED (`set_by` sent on the upsert; setter resolved off `useOrganizationMembers`).
* CR-9 FIXED (`origin_project_id` resolved to a name; `carriedForwardSentence` appended only on a差).
* CR-10 FIXED (`firmHistorySentence`, `company-card.tsx:73-113`).

**QA-R2-1…7, 9** — all FIXED and re-read at HEAD (`directoryRolodexOrgId` in `people-room.tsx:159`
and `directory-view.tsx:160`; firm jobs off `usePeopleSeats({all:true})`; `routeTo`/`routeCandidates`
on the person card; `contactRuleClause` in `reach-access` and the picker; the consent checkbox's own
short label; the e2e `[data-roster-band]` gate; the sole-proprietor paper fold; `directoryIdentityRows`).

---

## 4. Findings

### CR3-1 · MAJOR · high confidence — the Add sheet tells the studio consent is recorded when the ledger records an invite

`apps/designer-portal/src/components/document/people/directory/add-person-sheet.tsx:1541-1544`

```tsx
<p className="mt-2 text-[0.7rem] leading-relaxed text-[var(--color-mocha)]">
  {partyName.trim() || "They"} is recorded as consenting on this
  evidence. Patina has not sent them anything yet.
</p>
```

and `:798-800`

```ts
const message =
  textUpdates && phone.trim()
    ? `${trimmedName} added to ${proj}. The consent is recorded; nothing has been sent yet.`
```

The sheet's consent door is `useAddProjectParty` → `record_channel_invite`
(`use-coordination.ts:499`). `record_channel_invite`
(`00594_studio_channel_consent.sql`, the `record_channel_invite` body) returns the standing row only
when it is a sendable `granted`; otherwise it calls
`record_channel_consent(..., 'pending', ...)`. For every person the studio does not already hold a
grant for — the whole point of the Add sheet — the record lands **`pending`**, which
`consentWordFor` prints as **`Invited`**. So the sheet asserts "recorded as consenting" and the
Directory row, the seat line and the Call Sheet row beside it all print `Invited` for the same
number.

SPEC §5.5 #15 requires the opposite sentence, verbatim: *"He is invited, not consenting, until he
replies YES."* `grep -n "invited, not consenting" add-person-sheet.tsx` returns nothing. W2b §2
lists the string as delivered; it is not.

The CR-4 rationale in the code comment (the double opt-in no longer dispatches, so telling the studio
to wait for a YES would be false) is sound about the YES and wrong about the verdict: the honest
sentence is that the invite is recorded, not that consent is.

**Fix:** print the record's own word. Something like *"<Name> is invited, not consenting. Patina has
not sent them anything yet."*, and *"… The invite is recorded; nothing has been sent yet."* on the
confirmation. If the standing-grant branch is taken, the sheet may say so separately.

---

### CR3-2 · MAJOR · high confidence — raw schema tokens reach the Directory row and the roster row through the `contact_rule_summary` fallback

`apps/designer-portal/src/components/document/people/directory/person-row.tsx:91-92`

```tsx
const { rest, routedName } = splitRoutedClause(person.contact_rule_summary);
const clause = rule ? contactRuleClause(rule) : rest;
```

`apps/designer-portal/src/components/document/roster/roster-row.tsx:135`

```tsx
const ruleClause = rule ? contactRuleClause(rule) : row.ruleSummary;
```

`contact_rule_summary()` (`00626_people_directory_v4_seats.sql:770-804`) renders the forbidden and
allowed lists as raw `channel_kind` tokens. Probed against the local DB as `designer@patina.dev`'s
studio:

```
Frank Bauer     | Never text. Do not use: after_hours, ap_email, dispatch, email, mobile, office. Write Rosa Delgado instead.
Ray Thao        | Never text. Use: email, office, portal_311. Hours: Weekdays 08:00 to 16:00.
Ingrid Halvorsen| Never text. Do not use: mobile. Use: email, office.
```

`splitRoutedClause` only lifts the "Write X instead." clause; `rest` carries the tokens through
unchanged. `after_hours`, `ap_email`, `portal_311` and `dispatch` are schema words, forbidden on a
face by SPEC §8 #3 — and the module that exists to prevent exactly this says so in its own header
(`lib/document/contact-rule.ts:5-9, 43-47`).

The fallback is not theoretical. `useContactRules()` is a separate query from `usePeopleDirectory()`
/ `useProjectRoster()`: on every cold load of the Directory or the Call Sheet the rows paint before
the rules resolve, and `rule` is `undefined` for every row in that window. If the rules read fails or
is refused, the raw list is what the studio reads permanently. The summary also drops the studio's
own typed `reason` entirely, so the fallback is both schema-worded and less true than the real clause.

**Fix:** render no clause while the rule row is unresolved (`rules === undefined`), or sanitise `rest`
through `contactChannelWord` before printing it. Never pass `contact_rule_summary` to a face.

---

### CR3-3 · MAJOR · high confidence — "Start the card" stamps a way-in change that never happened, and clears `told_refs`

`apps/designer-portal/src/components/document/roster/site-access-card.tsx:328`

```tsx
void save({ projectId, lockboxVersion: null }, 'way_in').catch(() => undefined);
```

`useUpdateSiteAccessCard` (`packages/supabase/src/hooks/use-coordination.ts:2049-2058`) computes

```ts
const wayInChanged =
  input.lockboxVersion !== undefined ||
  input.alarmRef !== undefined ||
  input.keyHolderEngagementId !== undefined;
```

`lockboxVersion: null` is **not** `undefined`, so starting a card stamps `changed_at`, `changed_by`
and blanks `told_refs`. The card then renders (`site-access-card.tsx:624-632`) *"The way in changed
13 Sep 2026, by Priya Natarajan. Nobody has been told yet."* directly under "The way in" region
reading *"No lockbox on file."* — a false claim about a lockbox nobody has written, which is the
exact defect CR-4 was raised to remove, and R-U's Call Sheet head fold prints the same wrong date.

The re-dispatch pin agrees with me and not with the code:
`packages/supabase/src/hooks/__tests__/use-site-access-and-reach-fanout.test.ts:135-140`

```ts
it('starting the card claims nothing about a lockbox nobody has written', async () => {
  await hookOf(useUpdateSiteAccessCard()).mutationFn({ projectId: 'proj-okonkwo' });
  expect(upserted.current).toEqual({ project_id: 'proj-okonkwo' });
});
```

The test calls the hook with `{ projectId }` alone; the only caller in the product does not. Green
suite, defeated fix.

**Fix:** `save({ projectId }, 'way_in')` at `site-access-card.tsx:328`.

---

### CR3-4 · MAJOR · high confidence — choosing a rail view leaves the company card on screen

`apps/designer-portal/src/components/document/people/people-room.tsx:345-351`

```tsx
goView: (v) => {
  setOpenPerson(null);
  setPendingThreadId(null);
  setNotice(null);
  setHighlightPersonId(null);
  setView(v);
},
```

`openFirm` is never cleared, and the body is chosen `openFirm ? <CompanyCard/> : openPerson ? … : view === …`
(`:397-420`). `nav.openPerson` does clear it (`:329 setOpenFirm(null)`); `goView` does not — and
`goView` is what `PeopleDesktopRail` and `PeopleCompactSelector` both call (`:498, :516`), and what
`filterDirectory` and `askEngine` route through.

Failure: open `/people`, click a firm row (Northgate Electric) → the company card mounts; click
`Threads` (or `Nurture`, `Reviews`, `Portfolio`, `Outreach`, `Your Eye`) in the rail → the company
card is still on screen, the rail shows nothing active (`activeView={openPerson || openFirm ? null : view}`,
`:513`), and the address effect writes `?view=threads&firm=<id>`. The only way out is the card's own
"Back". `?firm=` is new this wave, so this is a path the room did not have before.

**Fix:** add `setOpenFirm(null)` to `goView`.

---

### CR3-5 · MINOR · high confidence — revoking a field link from the person card leaves the party sheet's link read stale

`packages/supabase/src/hooks/use-access-grants.ts:296-307` invalidates `accessGrantKeys.all`,
`['people-directory']`, `['people-directory-seats']` and `['project-roster']`, but not
`partySmsKeys.links(partyId)` (`['field-links', partyId]`). `useRevokeFieldLink`
(`use-party-sms.ts:204-212`) does invalidate it — the two doors onto the same token disagree.
A `field_link` grant's `grant_id` carries the token id in segment 1 (`accessGrantNaturalKey`), but
not the party id, so the fan-out needs the subject passed in.

**Fix:** thread the subject (engagement) id through `RevokeAccessGrantInput` and invalidate
`partySmsKeys.links(subjectId)` for the `field_link` tier, or invalidate the `['field-links']` root.

---

### CR3-6 · MINOR · high confidence — minting a field link from the party sheet does not move the Call Sheet behind it

`apps/designer-portal/src/components/document/people/party-profile-sheet.tsx:469`

```ts
const { token } = await createLink.mutateAsync({ partyId });
```

`projectId` is omitted, so `useCreateFieldLink`'s `onSuccess` skips
`['project-roster', projectId]` (`use-party-sms.ts:172-174`). `seatProjectId` is already in scope at
`:238` and is passed correctly to the **revoke** eleven lines later (`:495`). The roster row behind
the open sheet keeps printing reach `On paper` for a door that is now open. Named as
"flagged, not fixed" in `w2-fix-log-r2.md`; still open.

**Fix:** `createLink.mutateAsync({ partyId, projectId: seatProjectId })`.

---

### CR3-7 · MINOR · medium confidence — the card mutations move the identity read model but not the seats one

`packages/supabase/src/hooks/use-studio-contacts.ts:277-278, 352-353, 379-380, 405-406, 534-538` all
invalidate `studioContactKeys.all` + `['people-directory']` and stop. `people_directory_seats`
carries `display_name, company_name, phone_e164, studio_contact_id, consent_status, reach_state,
paper_state, contact_rule_summary, warranty_until` (checked against the live view), and
`paper_state` is `identity_paper_state(studio_contact_id, COALESCE(seat.company_id, card.company_id))`
per R-BJ — all of which a card edit can move. Every other card-adjacent fanout in this wave
(`invalidateChannelFanout`, `invalidateRuleFanout`, `invalidateAffiliationFanout`,
`invalidateComplianceFanout`) invalidates both roots; these five do not.

The sharpest case is `usePromoteToStudioContact`, which writes `project_parties.studio_contact_id`
— the column that decides a seat's whole identity fold — and invalidates neither
`peopleSeatKeys.all` nor `['project-roster', projectId]`. The Add sheet compensates by invalidating
both itself at `add-person-sheet.tsx:791-792`; `promote-band.tsx:36` does not.

**Fix:** add `peopleSeatKeys.all` to the four card mutations and `peopleSeatKeys.all` +
`['project-roster', party.project_id]` to `usePromoteToStudioContact`.

---

### CR3-8 · MINOR · medium confidence — the Call Sheet scopes its rolodex read through the CONSENT resolver, against R-BD

`apps/designer-portal/src/components/document/roster/roster-groups.tsx:67-69`

```tsx
const { data: contacts } = useStudioContacts(consentOrg ?? null, { includeArchived: false });
```

`consentOrg` is `project_consent_org(projectId)` (`call-sheet.tsx:89`), whose second leg is
`_primary_studio_for(designer_id)`. R-BD rules that *every tenant resolution for a project uses
`project_tenant_org()`*, and 00594's own comment says `project_consent_org` "must read the same for
every caller… NOT the resolver for the site access card or the authority grant". Scoping the
rolodex is a tenant resolution, and getting it wrong is exactly the QA-R2-1 defect — which the
Directory fixed with `directoryRolodexOrgId` and this surface did not.

Local evidence (this worktree's DB):

```
Okonkwo residence        studio_id set   → consent_org b0000000-…-0001  (49 studio_contacts) ✓
Aspen Loft Refresh       studio_id NULL  → consent_org 783187b5-…       (0 studio_contacts)  ✗
Birch Hollow             studio_id NULL  → 783187b5-…                                        ✗
Chen Residence           studio_id NULL  → 783187b5-…                                        ✗
Marrow & Vale Residence  studio_id NULL  → 783187b5-…                                        ✗
Olsen Lake House         studio_id NULL  → 783187b5-…                                        ✗
```

On five of eight local projects the read is empty, so `peopleById` is empty,
`contactRouteTarget` returns `null`, and SPEC §5.4 #12 / R-L's routed line prints
"Write Rosa Delgado instead." with no way to reach her. R-BI declares studio-less projects a legacy
population W3 backfills, which bounds the blast radius but does not make the resolver right.

**Fix:** resolve the rolodex org through `project_tenant_org` (or the directory fold), and keep
`consentOrg` for the consent reads it is named for.

---

### CR3-9 · MINOR · medium confidence — PR-n's client gate answers for the rolodex studio, not the project's

`apps/designer-portal/src/components/document/people/directory/add-person-sheet.tsx:429-433`

```ts
const isOrgAdmin = useMemo(() => {
  const role = (orgs ?? []).find((o) => o.id === organizationId)?.membership?.role;
  return role === "owner" || role === "admin";
}, [orgs, organizationId]);
```

`organizationId` is the studio that holds the **book**. The DB policy gates on
`is_org_admin_or_owner(project_party_recorded_studio(engagement_id))` — the studio that holds the
**job**. For a designer in two design studios (which is `designer@patina.dev` locally) the two can
differ, so the sheet can refuse a write the DB would allow, or allow one the DB refuses. The DB
refusal is translated (`writeErrorMessage:158-160`), so the failure mode is a wrong sentence rather
than a raw error — but the two halves of PR-n are asking different questions.

**Fix:** read the membership role for the project's own studio.

---

### CR3-10 · MINOR · high confidence — two `aria-describedby` references dangle once the act becomes available

`roster-row.tsx:603` sets `aria-describedby={`${panelId}-send-held`}` unconditionally while the
described `<p id={…-send-held}>` renders only `{!body.trim() && …}` (`:615-622`).
`notice-log.tsx:139` sets `aria-describedby={heldId}` unconditionally while `<p id={heldId}>` renders
only `{picked.length === 0 && …}` (`:147-152`). As soon as the studio types (or ticks a name) the
button points at an id that is not in the document.

**Fix:** make the attribute conditional on the same predicate, as `roster-row.tsx:461` and `:505`
already do.

---

### CR3-11 · MINOR · high confidence — a second, regex-over-prose hard-block predicate survives

`apps/designer-portal/src/lib/document/people-derivation.ts:1096-1099`

```ts
export function contactRuleBlocks(summary: string | null | undefined): boolean {
  if (!summary) return false;
  return /\b(never|do not|don't|no )/i.test(summary);
}
```

CR-4's whole point was one answer to "is this rule a hard block", and R-BL fixed it as a predicate
over `channels_forbidden` / `route_to_person_id`. This export now has no product call site — only
`people-directory-derivation.test.ts:179-181` keeps it alive — and it answers differently from
`contactRuleIsHardBlock` for Ray Thao ("Never text." → `true` here, `false` there). A dead second
answer is the thing that produced CR-4.

**Fix:** delete the export and its three pins.

---

### CR3-12 · MINOR · high confidence — the person card's history line has a dead plural ternary and counts seats as projects

`apps/designer-portal/src/components/document/people/views/person-profile.tsx:502-504`

```tsx
{`Worked ${person.seat_count ?? 0} of the studio's ${
  (person.seat_count ?? 0) === 1 ? "projects" : "projects"
}.`}
```

Both branches are `"projects"`, so a single-seat person reads "Worked 1 of the studio's projects."
Separately, `seat_count` counts SEATS (R-BG) while SPEC §5.2 #10 asks for projects — two seats on one
job reads as two projects.

**Fix:** `"project" : "projects"`, and count distinct `project_id` over `seats` for the sentence.

---

### CR3-13 · MINOR · high confidence — the Directory row's empty seat panel names a project the Directory does not have

`apps/designer-portal/src/components/document/people/directory/person-row.tsx:220-224`

```tsx
{seatsOpen && (seats ?? []).length === 0 && (
  <li className="t-body-sm py-2 text-[var(--ink-subtle)]">
    No open seat on this project.
  </li>
)}
```

R-V fixes that exact string for the person card's R4 region, which is scoped to one project. The
Directory is the studio's cross-project ledger; there is no "this project". The branch is only
reachable when `seat_count > 0` and the seats read returns nothing — an R-BG divergence — which makes
the wrong sentence doubly misleading.

**Fix:** "No seats on the book yet." or similar, and keep R-V's wording on the card.

---

### CR3-14 · MINOR · medium confidence — a Directory seat line opens the seat sheet, not the person card

`person-row.tsx:216` passes `onOpen={(s) => (onOpenSeat ? onOpenSeat(s) : onOpen())}`, and
`people-room.tsx:394-400` wires `onOpenSeat` to `setOpenParty(...)` — the SMS/field-link party sheet.

R-AA (rulings §3): *"activating it opens that person's card — the same open-person path as the row's
name."* Direction §2.1 draws the same edge as `seat line ──► PERSON CARD @ seat ?person=&seat=`, and
draws the person card's own seat edge to `/doc/<project>?sheet=call`. The build routes both to the
party sheet, and `?seat=` is not implemented. Neither w2b nor w2c records this as a deviation.

**Fix:** either implement R-AA (`?person=&seat=`) or take the deviation to Fable as a ruling.

---

### CR3-15 · MINOR · medium confidence — "Chase the renewal" never names the paper it is chasing

`apps/designer-portal/src/components/document/people/company-card.tsx:770-772`

```tsx
documentId: docs[0]?.id ?? null,
documentLabel: docs[0] ? null : "a current certificate",
```

`docs[0]` is the soonest-to-lapse document (the hook sorts), so the id is right — but `documentLabel`
is `null` exactly when a document exists, and the route falls back to
`` `Chase ${companyName} for ${documentLabel ?? 'a current certificate'}` ``
(`app/api/people/chase-renewal/route.ts:78`). Every drafted task therefore reads "for a current
certificate" and the payload's `document_label` is `null`, so the reviewer of the
`awaiting_review` draft cannot tell a lapsed COI from a lapsed licence.

**Fix:** `documentLabel: docs[0] ? documentTypeLabel(docs[0]) : "a current certificate"`.

---

### CR3-16 · MINOR · high confidence — `placeholder=` survives on two fields in the reviewed surfaces

`people/party-profile-sheet.tsx:919` (`placeholder="Where and when they agreed, e.g. signed site
kickoff form on Aug 8"` on the consent-evidence textarea) and `roster/rolodex-picker.tsx:519`
(`placeholder="optional"` on the email field). Direction §5.4 Editing and house sheet §A14 say
"label always visible, no `placeholder`"; the Add sheet had every one removed (w2b §1) and these two
are in the same wave's file list. Both fields do carry visible labels, so the impact is grammar, not
usability.

---

### CR3-17 · MINOR · high confidence — the revoke reason says "Optional" on the one tier that requires it

`people/access-grant-list.tsx:36-37` prints `REVOKE_REASON_PROMPT = "Say why the door closes.
Optional, kept with the record."` for every tier, but
`ACCESS_GRANT_REVOKE_ROUTES.project_review` carries `reasonRequired: true`
(`use-access-grants.ts:163-170`) and the hook throws "Say why the door closes. This one keeps the
reason on record." on a blank one. A studio told the field is optional meets a refusal.

---

### CR3-18 · MINOR · low confidence — `disabled` on the authority-scope options

`people/directory/add-person-sheet.tsx:1413` — `<option ... disabled={!isOrgAdmin && isAdminOnlyAuthorityScope(scope)}>`.
SPEC §7 #4 / direction §5.5 ban the `disabled` attribute in favour of `aria-disabled` + a visible
reason. The visible reason IS present (`:1419-1424`), and a `<select>` option is not an act, so this
is grammar rather than a gate the keyboard cannot reach.

---

### CR3-19 · MINOR · high confidence — `ContactRuleLine`'s docblock now contradicts the module it delegates to

`people/contact-rule-line.tsx:10-12` still says a hard block is *"a rule that forbids a channel
outright"* (the pre-R-BL reading, which R-BL explicitly overturned for Ray Thao and Dana Kowalski),
and `:37-41` still instructs callers to *"pass that column straight through rather than re-composing
it here"* — the `contact_rule_summary` habit CR-5 and CR3-2 exist to end. Doc drift on the one
primitive four surfaces read.

---

### CR3-20 · MINOR · medium confidence — the site access card prints the lockbox twice, and shares one pending flag across every editor

`roster/site-access-card.tsx:497-510` renders `EditableLine` with the raw `card.lockbox_version`
("Lockbox, version 3") and then `wayInSentence(card.lockbox_version, …)` ("Lockbox, version 3. The
code is held off Patina; ask Luis Ochoa.") directly beneath it — the same string twice. SPEC §5.6 #3
names one line. Separately, `saving={updateCard.isPending}` is passed to all three `EditableLine`s
and to both inline bands, so saving one region shows "Writing…" on every act on the card.

---

### CR3-21 · MINOR · low confidence — the who-to-call line is a full-width `tel:` target at every width

`roster/site-access-card.tsx:360-366` passes `fullWidth` unconditionally. R-X / SPEC §6.2 say the
whole line is the target **at 390** and only the digits are linked **at 1440**. The Call Sheet is one
760px DocSheet at every width, so this may be the deliberate reading — but nothing measures a
viewport and nothing in w2c records the choice.

---

### CR3-22 · MINOR · high confidence — the rule editor can write a channel into both lists at once

`people/reach-access.tsx:789-800` sends `channelsAllowed: rule?.channels_allowed ?? []` unchanged
while rebuilding `channelsForbidden` from the two checkboxes plus `otherForbidden`. Ticking "never
email" on a rule whose `channels_allowed` already contains `email` writes a row that both allows and
forbids it. Nothing in 00592 refuses the contradiction, and `contactRuleClause` will print "Never
text. Do not use: email. Use: email."

---

### CR3-23 · MINOR · high confidence (carried, already self-flagged) — the R-BL predicate cannot reproduce SPEC §3's `block` flags, and a ruling is owed

`lib/document/contact-rule.ts:92-102` records it plainly: F-26 Carol Nyström (`block: true`) and
F-10 Sam Rowe (`block: false`) carry byte-identical rule rows in the seed
(`allowed={email,mobile}`, `forbidden={sms}`), so no formula over `channels_forbidden` can separate
them, and two rows (F-10, F-13) wear a leading rule the fixture marks `false`. Confirmed against the
local DB. Either the fact moves onto the rule row (a W3 column) or SPEC §3 is amended. Recorded here
so it is not lost between rounds.

---

### CR3-24 · MINOR · high confidence (carried) — the opt-in invite still dispatches nothing

`use-coordination.ts:520-533` documents it and W2a §6 #1 owes the fix to W3: R-AS took both halves
off the `project_parties` INSERT, so `fc_optin_invite_dispatch` (00284 / `00432:27-68`) no longer
fires and ticking "text updates" sends nothing. Not a W2 defect, but it is the reason CR3-1's copy
matters and it must not fall out of the program's deploy checklist.

---

## 5. What this review did not cover

Visual/behavioural walk at 1440 and 390 (the QA reviewer owns 3000/3002), the Playwright specs, the
iOS surfaces, the W1 migrations beyond the policies and functions named above, and the Sanity help
articles.
