# W2 — adversarial code review, round 4

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. Local only: no dev server started, no
port taken, no migration applied, no prod touched. The local DB
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`) was read READ-ONLY
for evidence.

> ⚠ FILE NAMING. A file named `w2-review-r4-code.md` already existed (written
> 13 Sep 01:25, BEFORE `w2-review-r3-code.md` at 02:34 — the `CR3-n` prefix has
> been reused across three dispatches). It was renamed
> `w2-review-r4-code.prior.md` rather than overwritten. THIS file is the review
> of HEAD as it stands after `w2-fix-log-r3.md`'s two passes.

**Verdict: NOT CLEAN — 0 blocking, 3 major, 13 minor.**

---

## 0. Gates, run here

```
$ pnpm --dir <worktree> --filter @patina/designer-portal type-check
  > tsc --noEmit
  EXIT=0

$ pnpm --dir <worktree> --filter @patina/supabase type-check
  > tsc --noEmit
  EXIT=0

$ pnpm --dir <worktree> --filter @patina/admin-portal build
  ▲ Next.js 16.2.10 (webpack)
  … full route table …
  ƒ Proxy (Middleware)
  ○  (Static)   prerendered as static content
  ƒ  (Dynamic)  server-rendered on demand
  [exited with code 0]

$ cd apps/designer-portal && npx jest --silent \
    src/components/document/people src/components/document/roster \
    src/lib/document src/app/\(document\)/desk src/components/document/mobile \
    src/components/document/coordination src/components/document/__tests__
  Test Suites: 196 passed, 196 total
  Tests:       3271 passed, 3271 total
  Time:        9.724 s
  [exited with code 0]

$ cd packages/supabase && npx vitest run
  Test Files  103 passed (103)
       Tests  1297 passed | 12 skipped (1309)
    Duration  4.25s
  [exited with code 0]
```

All four gates green. None of the findings below is caught by any of them.

---

## 1. Mechanical checks the brief names

| Check | Result |
|---|---|
| Hooks above early returns | **PASS.** Read through `people-room` (hooks end :318, `body` is an expression not a return), `views/person-profile` (hooks end :234, maker return :238, loading return :242), `company-card` (`!card` return :432), `reach-access`, `add-person-sheet`, `party-profile-sheet`, `roster-row`, `roster-groups`, `site-access-card`, `rolodex-picker`, `view-shell`, `directory-view`. Every `return` above a hook in those files is inside a module-scope helper, not the component. No conditional hook. |
| Hydration gate | **PASS (no new risk).** `/people` is `'use client'`; `useMemo(() => new Date(), [])` is the shipped pattern; no `window`/`document` read during render in any changed file (only inside `useEffect` and event handlers). |
| Consent writes only through the RPCs | **PASS.** `record_channel_consent` / `record_channel_invite` / `record_channel_reconsent` only (`use-consent.ts:297, 327, 356`). No table write to `studio_channel_consent` anywhere. |
| No portal writer of the frozen columns (R-AS) | **PASS.** `grep -rn --include=*.ts --include=*.tsx -e sms_consent_status -e sms_opt_out_at -e sms_consented_at -e sms_consent_source -e sms_consent_evidence apps packages` returns, outside tests and `database.types.ts`: `use-coordination.ts:77-81` (the `ProjectParty` READ interface), `:989` (`ProjectRosterRow`, which 00594:1166+ repointed to `channel_consent_status()`), `:528` (a comment), `use-people.ts:104` (a comment), `people-derivation.ts:246` (a comment), `roster-derivation.ts:149` (a synthetic in-memory client row, `null`) and `:399` (a READ of `v_project_roster`'s repointed column). **Zero writers.** |
| No hard delete outside the mistaken-add predicate | **PASS, with one weak leg (CR-9).** Two `.delete()` in the changed hooks: `project_parties` (`use-coordination.ts`, gated by a SERVER-SIDE re-derivation of `seatDeleteRefusal` from three fresh reads before the delete — not merely the UI's copy) and `studio_contact_rules` in `useClearContactRule` (lifting a rule, documented). Channels and affiliations are status/date moves. |
| Site access card never reaches a client surface | **PASS.** `SiteAccessCard` is mounted from `roster/call-sheet.tsx:221` and nowhere else. `grep -rn "site_access\|SiteAccess" apps/client-portal/src` → nothing. 00625 has four studio policies, no client leg, no `show_to_client`. |
| No code field anywhere | **PASS.** `grep -rni "gate_code\|lockbox_code\|alarm_code\|gateCode\|lockboxCode\|alarmCode" apps packages` (ts/tsx) → **zero hits**. `UpdateSiteAccessCardInput` carries none; the card's face says the code is held off Patina. |
| PR-n gating, client AND DB | **PASS on the DB, still mis-scoped on the client** (CR3-9, carried). Client: `add-person-sheet.tsx:429` `isOrgAdmin`, `:444` reset effect, `:773-777` pre-write refusal, `:1416` option gate. DB: `project_party_authority_studio_*` each carry `scope NOT IN ('money','draw_certify') OR is_org_admin_or_owner(project_party_recorded_studio(engagement_id))`. |
| `call-sheet` flag fully removed | **PASS in product code.** `grep -rn "useFeatureFlag('call-sheet')" apps packages` → nothing. All 14 consumers repointed; the dead branches are deleted. One stale test mock survives (CR-6). `command-bar.tsx:488 case 'call-sheet'` is a surface-key switch, not a flag. |
| dist rebuilt after edits | **PASS.** `@patina/types` is the only reviewed package with a `dist`; `@patina/supabase` has none (consumed from source) and no other package in the diff has one. `dist/field-config.js` 12 Sep 23:00:19 > `src/field-config.ts` 22:48:54; `dist/studio-config.js` 21:27:48 > `src/studio-config.ts` 20:57:22. Export parity checked programmatically: 68/68 source exports present in the two `.d.ts`; `partyKindOwesPaper` and `resolveStateWord` both present in the emitted JS. |
| Analytics only via `people-events.ts` | **PASS.** The only `posthog.capture` in `components/document/people`, `components/document/roster` and `lib/analytics/people-events.ts` is `people-events.ts:25`, behind `isAnalyticsEnabled()`. Nine acts, no engagement metric. |
| Document grammar — `box-shadow` in changed files | **PASS (0).** Sweeping every file in `git diff origin/main --name-only`, the only hits are `globals.css:360` / `:1942` (both pre-existing, outside this diff's hunks) and one docblock sentence in `state-word.tsx`. The new `globals.css` hunk adds five token aliases and one literal at **bare `:root`** (verified: the enclosing selector at `:1975` is `:root`, not the `html:has([data-document-shell])` block above it), so `--sage` / `--golden` / `--terracotta` / `--sage-ink` / `--golden-ink` resolve on every page including `/people`. `StateWord` paints border + text on `background: 'transparent'` (SPEC §8 #10). |
| No `<a>` inside `<button>` | **PASS.** `TelLink` is an `<a>` and is always a sibling — `person-row.tsx:200`, `roster-row.tsx:333`, `contact-rule-line.tsx:113`, `site-access-card.tsx:361`. `party-mini-row.tsx` renders a `<button>` and the row's words are `<span>`s (its docblock says why). |
| `aria-expanded` pairs with a real id | **PASS.** All 17 `aria-controls` resolve to a rendered `id`: `company-designations-<id>`, `company-payee-<id>`, `company-verdict-<id>`, `statusBandId`, `bandId`, `channelBandId`, `ruleBandId`, `confirmId`, `panelId` (×3), `seatsPanelId`, `authorityFieldId` (×2), `site-access-emergency-lines`, `site-access-key-holder`. Each panel div/ul is rendered unconditionally with `hidden`, so the target exists while collapsed. |
| No `disabled` attribute on an act | **PASS on every act the wave authored.** Each `disabled={…}` on a `DocumentAction` in the changed surfaces is paired with `held={…}` (`DocumentAction` emits `disabled={unavailable && !held}` → `false` + `aria-disabled="true"`): `reach-access:1050`, `person-profile:372`, `roster-row:464,508,607`, `notice-log:138`, `party-profile-sheet:773,838,961`. Three exceptions, all pre-existing and carried: `<option disabled>` (CR3-18), `rolodex-picker:563` (a `DocumentAction` with `disabled` + `loading` but no `held`), `party-mini-row:190` (a raw `<button disabled>` with `disabled:opacity-50` — CR-11). |
| One live region | **PARTIAL** (CR-12). `people-room.tsx:561` is the Room's announcer; the two card-level regions CR3-11 removed are gone. But `directory-view.tsx:364`, `call-sheet.tsx:179`, `roster-row.tsx:633`, `project-team-roster.tsx:94`, `rolodex-picker.tsx:430`, `promote-band.tsx:41` and `rolodex-seed-sheet.tsx:208` each still carry their own `role="status"`, and more than one can be live on one screen. |
| Types imported, not redefined | **PASS.** No local re-declaration of `PartyKind` / `FieldTrade` / `ReachState` / `PaperState` / `SeatStage`. `coordination/party.ts` imports `PartyKind` rather than keeping a second list; `use-coordination.ts:51` is an explicit re-export alias. |
| No ad-hoc fetch to a service | **PASS.** The only new `fetch` is `compliance-chase.ts:47` → same-origin `/api/people/chase-renewal`, which proves membership through the caller's own RLS read of `studio_contacts` before enqueuing with the service role. No NestJS call outside `@patina/api-routes`. |
| RLS-safe writes send every joined column | **PASS.** `studio_contact_channels` writes send `owner_id` (00593:345-368 joins `studio_contact_org(owner_id)` in USING and WITH CHECK); `studio_contact_rules` sends `subject_type` + `subject_id`; `studio_compliance_documents` sends `organization_id`; `project_party_authority` sends `engagement_id` + `scope`; `project_site_access_cards` sends `project_id`; `studio_contacts` sends `organization_id`. |

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
| Field link token | `['field-links', partyId]` | — (a SECOND read model over the same entity as `access-grants`; CR3-5) |
| Project consent org | `['project-consent-org', projectId]` | — (a derived scalar, not an entity) |

Every detail key sits **under** its list root, so a root invalidation reaches it. No duplicate root,
no inline literal key in the reviewed surfaces.

### Every mutation and what it invalidates

| Mutation | Invalidates |
|---|---|
| `useRecordChannelConsent` / `useRecordChannelInvite` / `useRecordChannelReconsent` | `consentKeys.all`, `peopleKeys.all`, `peopleSeatKeys.all`, + `['project-roster',pid]` and `['project-parties',pid]` when `originProjectId` is passed |
| `useRevokeAccessGrant` | `accessGrantKeys.all`, `['people-directory']`, `['people-directory-seats']`, `['project-roster']` — **misses `['field-links',partyId]`** (CR3-5, open) |
| `useCreateFieldLink` | `partySmsKeys.links(partyId)`, `['access-grants']`, `['people-directory']`, `['people-directory-seats']`, `['project-roster',pid]` *(only when `projectId` is passed — it is not, at `party-profile-sheet.tsx:469`; CR3-6, open)* |
| `useRevokeFieldLink` | the same five |
| `useSendPartySms` | `partySmsKeys.thread(partyId)` |
| `useAddStudioContact` / `useUpdateStudioContact` / `useArchiveStudioContact` / `useRestoreStudioContact` | `studioContactKeys.all`, `['people-directory']` — **misses `peopleSeatKeys.all`** (CR3-7, open; `use-studio-contacts.ts:277-278, 352-353, 379-380, 405-406`) |
| `usePromoteToStudioContact` | `studioContactKeys.all`, `['project-parties',pid]`, `['people-directory']` — **misses `peopleSeatKeys.all` and `['project-roster',pid]`** (CR3-7, open; `:534-538`) |
| `useAddStudioContactChannel` / `useUpdateStudioContactChannel` / `useSetStudioContactChannelStatus` | `studioChannelKeys.list(owner)`, `studioChannelKeys.all`, `studioContactKeys.detail(owner)`, `peopleKeys.all`, `peopleSeatKeys.all` |
| `useSetContactRule` / `useClearContactRule` | `contactRuleKeys.all`, `peopleKeys.all`, `peopleSeatKeys.all`, `studioContactKeys.detail(subject)` |
| `useSetAffiliation` / `useCloseAffiliation` | `affiliationKeys.all`, `studioContactKeys.all`, `peopleKeys.all`, `peopleSeatKeys.all`, `studioContactKeys.detail(person)`, `.detail(company)` |
| `useRecordComplianceDocument` / `useConfirmComplianceDocument` | `complianceKeys.all`, `studioContactKeys.detail(holder)`, `peopleKeys.all`, `peopleSeatKeys.all` |
| `useAddProjectParty` | `['project-parties',pid]`, `peopleKeys.all`, `['project-roster',pid]`, `peopleSeatKeys.all`, `consentKeys.all` |
| `useUpdateProjectParty` | `['project-parties',pid]`, `['project-roster',pid]`, `peopleKeys.all`, `peopleSeatKeys.all` |
| `useRecordPartySmsConsent` | the four above + `['channel-consent']` |
| `useCloseProjectPartySeat` | `['project-parties',pid]`, `['project-roster',pid]`, `peopleKeys.all`, `peopleSeatKeys.all` |
| `useRemoveProjectParty` | the same four |
| `useSetPartyAuthority` | `partyAuthorityKeys.all` (which reaches the portal-local `[…,'project',pid]`), `['project-parties',pid]`, `['project-roster',pid]`, `peopleSeatKeys.all` |
| `useUpdateSiteAccessCard` / `useLogSiteAccessTold` | `siteAccessKeys.detail(pid)` |
| `useChaseTheRenewal` | `['agent-tasks']` |

---

## 3. Prior findings, re-checked at HEAD

### `w2-fix-log-r3.md`, first pass (QA‑R3‑1, QA‑R3‑4, CR3‑1…CR3‑11) — **all verified FIXED**

* **QA‑R3‑1** FIXED. `people-room.tsx:151-162`, `add-person-sheet.tsx:318-325`, `rolodex-picker.tsx:179-184`, `rolodex-seed-sheet.tsx` all sort the membership list before the fallback pick and prefer `directoryRolodexOrgId`. (**One sibling was missed — CR-1 below.**)
* **CR3‑1** FIXED. `party-profile-sheet.tsx:217-300` reads `seatResolution.seat` first with `person` as fallback; `seatProjectId` at `:238`; `consent` off `seatResolution.identity.consent_status` at `:285`.
* **CR3‑2** FIXED. `useSetContactRule` gained `merge` (`use-studio-contacts.ts:929, 1026-1038`); `add-person-sheet.tsx:751` passes `merge: true`.
* **CR3‑3** FIXED. `useAddStudioContactChannel` catches `23505` and re-reads the standing row (`use-studio-contacts.ts:775-800`).
* **CR3‑4** FIXED. `reach-access.tsx:855-920` adds "Add a channel"; `:355-405` adds "Hold this line" / "Put this line back in use" through `useSetStudioContactChannelStatus`.
* **CR3‑5** FIXED. `site-access-card.tsx:525-610` names the key holder from the job's seats; `:350-490` edits the emergency lines.
* **CR3‑6** FIXED **on the person card only**. `grantWindowEnd` (`reach-access.tsx:568-587`) mirrors the RPC and the radios are gone. **The same defect survives on the Call Sheet — CR-2 below.**
* **CR3‑7 (R‑BL)** FIXED. `contact-rule.ts:110-114` — `contactRuleIsDoNotContact(rule) || route_to_person_id`.
* **CR3‑8** FIXED. `company-card.tsx:405-414` seeds the verdict from `card.studio_verdict` once per opening.
* **CR3‑9** FIXED. `contactRuleForbidsSms` in `lib/document/contact-rule.ts:126-130`, read by `roster-row.tsx:227-232` and `person-profile.tsx:280`; the Deno half is in `_shared/sms.ts`.
* **CR3‑10** FIXED (both e2e specs).
* **CR3‑11** FIXED. `person-profile.tsx:300` and `company-card.tsx:467` both `const announce = notify / onAnnounce`; `queryAllByRole('status')` is empty on both cards.
* **QA‑R3‑4** — tracked as W3 (R-BM). No change owed.

### `w2-fix-log-r3.md`, second pass (QA‑1, QA‑2, CR3‑1…CR3‑4 of `w2-review-r3-code.md` §4) — **all verified FIXED**

* **QA‑1** FIXED. `use-studio-contacts.ts:781-793` asks `normalize_channel_value` for the stored key before the recovery read.
* **QA‑2** FIXED. `section-eyebrow.tsx:31` wraps the label in its own `<span>`; the digits are `aria-hidden` with an `sr-only` `, N listed` companion.
* **CR3‑1** FIXED. `add-person-sheet.tsx:1553` "is invited, not consenting."; `:804` "The invite is recorded; nothing has been sent yet." The word `consenting` appears in no other branch of that sheet.
* **CR3‑2** FIXED. `person-row.tsx:100` and `roster-row.tsx:140` both read `contactRuleClause(rule)` and nothing else; `contact-rule-line.tsx:36-43`'s prop doc now forbids passing the column through.
* **CR3‑3** FIXED. `site-access-card.tsx:335` — `save({ projectId }, 'way_in')`, and `useUpdateSiteAccessCard` (`use-coordination.ts:2048-2051`) only stamps `changed_at`/`changed_by`/`told_refs = []` when `lockboxVersion`/`alarmRef`/`keyHolderEngagementId` is `!== undefined`.
* **CR3‑4** FIXED. `people-room.tsx:351` — `setOpenFirm(null)` inside `nav.goView`.

### `w2-review-r3-code.md` §4's twenty minors (CR3‑5…CR3‑24) — **untouched by design; all still OPEN**

Re-read at HEAD, each confirmed present: CR3‑5 (`use-access-grants.ts:295-307`), CR3‑6
(`party-profile-sheet.tsx:469`), CR3‑7 (five fanouts in `use-studio-contacts.ts`), CR3‑8
(`call-sheet.tsx:88` → `roster-groups.tsx:68`), CR3‑9 (`add-person-sheet.tsx:429-433`), CR3‑10
(`roster-row.tsx:607`, `notice-log.tsx:139`), CR3‑11 (`people-derivation.ts:1096`), CR3‑12
(`person-profile.tsx:500-503`), CR3‑13 (`person-row.tsx:230-234`), CR3‑14 (`person-row.tsx:226` →
`people-room.tsx:397-404`), CR3‑15 (`company-card.tsx:770-771`), CR3‑16
(`party-profile-sheet.tsx:919`, `rolodex-picker.tsx:519`), CR3‑17 (`access-grant-list.tsx:35-37`),
CR3‑18 (`add-person-sheet.tsx:1416`), CR3‑19 — **partly fixed** (`contact-rule-line.tsx:36-43`'s
"pass the column straight through" line is gone; `:10-12`'s pre-R-BL "forbids a channel outright"
sentence and `ContactRuleLineProps.blocked`'s `:46-48` doc both survive), CR3‑20
(`site-access-card.tsx:503-524`), CR3‑21 (`site-access-card.tsx:362`), CR3‑22
(`reach-access.tsx:791-800`), CR3‑23 (`contact-rule.ts:95-103`, ruling still owed), CR3‑24
(`use-coordination.ts:520-533`, W3).

---

## 4. Findings

### CR-1 · MAJOR · high confidence — the party sheet's promote band still guesses which studio to write the rolodex card into, and a wrong guess leaves an orphan card behind

`apps/designer-portal/src/components/document/people/party-profile-sheet.tsx:232-235`

```ts
const organizationId = useMemo(
  () => orgs?.find((o) => o.type === 'design_studio')?.id ?? orgs?.[0]?.id ?? null,
  [orgs],
);
```

This is byte-for-byte the QA‑R2‑1 / QA‑R3‑1 defect — a FIRST MATCH over an unordered membership read.
`useOrganizations` (`use-organizations.ts:159-169`) has no `ORDER BY`, so PostgREST returns the rows
in heap order. The r3 sweep fixed the identical line in `people-room.tsx`, `directory-view.tsx`,
`add-person-sheet.tsx`, `rolodex-seed-sheet.tsx` and `rolodex-picker.tsx` and **did not touch this
file**, which is the one place the guess is used for a **WRITE**.

`organizationId` gates `showPromoteBand` (`:257-261`) and is passed straight to
`PromoteBand` → `usePromoteToStudioContact` (`use-studio-contacts.ts:490-520`), whose first leg is:

```ts
.from('studio_contacts').insert({ organization_id: organizationId, … })
```

and whose second leg is `project_parties.update({ studio_contact_id: contact.id })`.

**Failure scenario, with live evidence.** `designer@patina.dev` is an active member of two
`design_studio` organizations:

```
$ psql … "select o.id, o.name, o.type from organization_members m
          join organizations o on o.id=m.organization_id
          join auth.users u on u.id=m.user_id
          where u.email='designer@patina.dev' and m.status='active'
            and o.type='design_studio';"
  783187b5-ed15-4426-8861-d02d98030d55 | Leah Hartwell     | design_studio
  b0000000-0000-0000-0000-000000000001 | Local Dev Studio  | design_studio

$ psql … "select public.project_tenant_org('d0e00000-…-00000000000a');"
  b0000000-0000-0000-0000-000000000001

$ psql … "select count(*) from project_parties
          where project_id='d0e00000-…-00000000000a' and studio_contact_id is null;"
  2                        ← exactly the population the promote band serves
```

When the unordered read hands back `783187b5` first, the promote inserts a **new `studio_contacts`
row into the Leah Hartwell studio**, then the `project_parties` UPDATE trips
`assert_project_party_cards_trg` (00624:646-678), which raises
`party_studio_contact_other_studio`. The hook throws, **the inserted card is not rolled back**
(two separate PostgREST requests, no transaction), and the sheet prints
"Could not add them to the rolodex just now." — because `promote-band.tsx:74` tests
`error instanceof Error` and a PostgREST rejection is a plain object. The designer sees a shrug, a
stray card sits in the other studio's rolodex, and pressing again mints a second one.

**Fix:** resolve the studio from the SEAT's project, not from the membership list —
`seat.project_id` is already in scope at `:238`, and `project_tenant_org` / `project_recorded_studio`
is what the DB guard checks against. At minimum, apply the r3 sweep's sorted-fallback so the guess
cannot move between renders, and make the insert conditional on the link succeeding (or link first).

---

### CR-2 · MAJOR · high confidence — the Call Sheet's "Copy field link" states an expiry the token will not carry, and records a false `expiry_source`

`apps/designer-portal/src/components/document/roster/roster-row.tsx:247-266`

```ts
const { token } = await createLink.mutateAsync({
  partyId: seatId, projectId, expiresAt: row.onSiteTo ?? undefined,
});
…
peopleEvents.grantMinted({
  tier: 'field_link',
  expiry_source: row.onSiteTo ? 'engagement_window' : 'fallback_90_day',
});
setNote(`Field link copied — shown once. ${fieldLinkExpirySentence(row.onSiteTo)}`);
```

CR3‑6 established — and the fix log records the probe — that `create_field_link(uuid, timestamptz)`
(00627:577-584) does **not** take `p_expires_at` when the seat has a live window:

```sql
v_expires := CASE
  WHEN v_window_end IS NOT NULL
   AND v_window_end::timestamptz + interval '1 day' > now()
       THEN v_window_end::timestamptz + interval '1 day'   -- max(on_site_to, warranty_until)
  WHEN p_expires_at IS NOT NULL AND p_expires_at > now() THEN p_expires_at
  ELSE now() + interval '90 days' END;
```

`v_window_end` is `max(on_site_to, warranty_until)` (`00627:565`). The fix landed **only** in
`reach-access.tsx` (`grantWindowEnd`, `MINT_FALLBACK_SENTENCE`). The Call Sheet row — the surface
Leah actually uses — still names `row.onSiteTo` alone, and `CallSheetRow` carries no
`warranty_until` at all (`roster-derivation.ts:486-519`), so it cannot compute the right date.

**Failure scenario, with live evidence.** Five seeded seats carry a warranty that outlives their
window, and every one of those windows is already in the past:

```
$ psql … "select display_name, on_site_to, warranty_until,
          (warranty_until > on_site_to) from project_parties
          where warranty_until is not null order by 1;"
  Ben Ostrom       | 2025-10-15 | 2026-11-21 | t
  Dana Kowalski    | 2025-10-15 | 2026-11-21 | t
  Erin Sato        | 2025-10-15 | 2026-11-21 | t
  Ingrid Halvorsen | 2025-09-30 | 2026-11-21 | t
  Pete Rusk        | 2025-10-15 | 2026-11-21 | t
```

Copying Dana Kowalski's field link mints a token good to **2026‑11‑22** and prints
"Ends with the job, 15 October 2025. Renews when they use it." — a date thirteen months in the past,
under a link that is live. Separately, a seat whose window HAS closed and carries no warranty falls
to the RPC's ninety-day term while the row still prints "Ends with the job, <closed date>" and
records `expiry_source: 'engagement_window'`.

**Fix:** carry `warranty_until` onto `CallSheetRow` (the seats view already has it —
`PeopleDirectorySeat.warranty_until`) and reuse `grantWindowEnd(row.onSiteTo, row.warrantyUntil, now)`
plus `MINT_FALLBACK_SENTENCE` here, so one derivation serves both mint doors.

---

### CR-3 · MAJOR · high confidence — the Call Sheet chevron is an inert button on every seat whose kind the party sheet excludes, and it fires `personCardOpened` anyway

`apps/designer-portal/src/components/document/roster/roster-row.tsx:307-321` renders the chevron
whenever `onOpenSeat && row.personId`:

```tsx
{onOpenSeat && row.personId && (
  <button type="button" onClick={() => { peopleEvents.personCardOpened({ source: 'roster_row' }); onOpenSeat(row); }}
    aria-label={`Open ${row.name}`} …>›</button>
)}
```

`apps/designer-portal/src/components/document/roster/call-sheet-mount.tsx:48-53` then refuses:

```ts
const openSeat = (row: CallSheetRow) => {
  if (!row.seatId) return;
  const role = seatProfileRole(row.partyKind);
  if (!role) return;                       // ← silent
  setParty({ id: row.seatId, role: role as PartyRole });
};
```

`seatProfileRole` admits only `PROFILE_OPENABLE_KINDS` = gc, sub, installer, receiver, architect,
photographer, stager (`roster-derivation.ts:182-206`). `row.personId` is `seat.person_id`
(`:619`), which is set for **every carded seat of every kind**.

**Failure scenario, with live evidence.** On the flagship Okonkwo seed:

```
$ psql … "select party_kind, display_name, studio_contact_id is not null
          from project_parties where project_id='d0e00000-…-00000000000a'
            and party_kind in ('client','client_rep','other','vendor') order by 1,2;"
  client     | Adaeze Okonkwo  | t
  client_rep | Chidi Okonkwo   | t
  other      | Carol Nyström   | t
  other      | Ray Thao        | t
  vendor     | Claire Bissett  | t
  vendor     | Owen Ashby      | t
```

Six of the sheet's twenty-four rows — including both halves of SPEC §5.4 #5's Client side band and
two of §5.1's named rows — render a focusable control announced "Open Adaeze Okonkwo" that does
nothing when pressed. R-AA's rule is "No inert buttons". Worse, `peopleEvents.personCardOpened`
fires before the refusal, so the taxonomy records card opens that never happened.

**Fix:** either gate the chevron on `seatProfileRole(row.partyKind)` and print nothing where there
is no door, or (better, and what direction §2.1 draws) route the chevron to the PERSON CARD, which
opens for every kind. Move the analytics call inside the branch that actually opens something.

---

### CR-4 · MINOR · high confidence (carried, CR3‑5) — revoking a grant from the person card leaves the party sheet's link read stale

`packages/supabase/src/hooks/use-access-grants.ts:295-307` invalidates `accessGrantKeys.all`,
`['people-directory']`, `['people-directory-seats']` and `['project-roster']` — not
`partySmsKeys.links(partyId)`. `useRevokeFieldLink` (`use-party-sms.ts:204-212`) does. Two doors onto
one token, two answers. Fix: thread the subject id through `RevokeAccessGrantInput` and invalidate
`['field-links', subjectId]`, or invalidate the `['field-links']` root.

---

### CR-5 · MINOR · high confidence (carried, CR3‑6) — minting from the party sheet does not move the Call Sheet behind it

`party-profile-sheet.tsx:469` — `createLink.mutateAsync({ partyId })`. `projectId` is omitted, so
`useCreateFieldLink`'s `['project-roster', projectId]` leg is skipped. `seatProjectId` is in scope at
`:238` and IS passed to the revoke eleven lines later (`:495`). The roster row behind the open sheet
keeps printing reach `On paper` for a door that is now open.

---

### CR-6 · MINOR · high confidence — a retired flag still has a live mock and a live branch-setting test

`apps/designer-portal/src/components/document/command-bar.test.tsx:61-69, 114, 510`

The file is unchanged from `origin/main` (`git diff origin/main` on it is empty) and still carries
`let mockCallSheetFlag = false`, a `useFeatureFlag` mock keyed on `'call-sheet'`, and a test that
sets `mockCallSheetFlag = true` before asserting that four surface rows print. `command-bar.tsx` no
longer reads any flag, so the assertion now passes for a different reason than it was written for
and the mock is dead scaffolding that reads as if the flag still gates the palette. w2c's list of
14 retired consumers does not include this file. Fix: delete the mock and the assignment, or drop
the flag branch from the `useFeatureFlag` mock entirely.

---

### CR-7 · MINOR · high confidence (carried, CR3‑7) — five card mutations move the identity read model but not the seats one

`use-studio-contacts.ts:277-278, 352-353, 379-380, 405-406, 534-538`. `people_directory_seats`
carries `display_name, company_name, phone_e164, studio_contact_id, consent_status, reach_state,
paper_state, contact_rule_summary, warranty_until` — every one of which a card edit can move — and
`usePromoteToStudioContact` writes the column that decides a seat's whole identity fold. Every other
card-adjacent fanout in this wave invalidates both roots. Add `peopleSeatKeys.all` to the four, and
`peopleSeatKeys.all` + `['project-roster', party.project_id]` to the promote.

---

### CR-8 · MINOR · medium confidence (carried, CR3‑8, widened) — three Call Sheet surfaces resolve a TENANT question through the CONSENT resolver or through a card tally

Three separate reads on the project-scoped Call Sheet path ask "which studio's rolodex" with
something other than the project's own studio:

* `call-sheet.tsx:88` → `roster-groups.tsx:67-69` — `useProjectConsentOrg(projectId)` feeds
  `useStudioContacts(consentOrg)`. R-BD rules that *every tenant resolution for a project uses
  `project_tenant_org()`*, and 00594's own comment says `project_consent_org` is "NOT the resolver
  for the site access card or the authority grant". Locally five of eight projects have
  `studio_id IS NULL`, where the read comes back empty and `contactRouteTarget` returns `null`, so
  SPEC §5.4 #12 / R-L's routed line prints "Write Rosa Delgado instead." with no way to reach her.
* `rolodex-picker.tsx:179-184` — the picker's `organizationId` is `directoryRolodexOrgId(directory)`,
  a "which org holds the most cards" tally over the whole book (`people-derivation.ts:778-797`).
  On a project belonging to the designer's OTHER studio, the picker offers cards that
  `assert_project_party_cards_trg` will refuse with `party_studio_contact_other_studio`, and the
  refusal reaches the face as `rolodex-picker.tsx:274`'s generic sentence (a PostgREST rejection is
  not an `Error`).
* `add-person-sheet.tsx:429-433` (CR3‑9) — `isOrgAdmin` reads the membership role for the studio
  that holds the BOOK while the DB policy gates on `project_party_recorded_studio(engagement_id)`,
  the studio that holds the JOB.

One fix serves all three: resolve the project's studio through `project_tenant_org` /
`project_recorded_studio` and pass it down, keeping `consentOrg` for the consent reads it is named
for.

---

### CR-9 · MINOR · medium confidence — the server-side delete guard asks a narrower paper question than the face, and fails open on an unreadable read

`packages/supabase/src/hooks/use-coordination.ts` (`useRemoveProjectParty`)

The hook re-derives `seatDeleteRefusal` server-side — good, and better than the UI copy — but its
`hasComplianceDocument` leg reads only `studio_compliance_documents WHERE holder_id = <the card>`.
The face's `roster-row.tsx:239-243` uses `row.paper`, which is
`identity_paper_state(studio_contact_id, COALESCE(seat.company_id, card.company_id))` — worst-first
over the person AND their firm (R-BA / R-BJ). A seat whose only held paper is the firm's lapsed COI
is refused by the face and permitted by the hook. Separately, an RLS-refused read returns `[]`
rather than raising, so the guard reads "no paper held". The UI is the stricter of the two today, so
no path reaches the gap — but the hook is the guard that exists precisely for when the UI is
bypassed. Fix: ask `identity_paper_state` (or read the firm's documents too) and treat an unreadable
compliance read as "held".

---

### CR-10 · MINOR · high confidence (carried, CR3‑10) — two `aria-describedby` references dangle once the act becomes available

`roster-row.tsx:607` sets `aria-describedby={`${panelId}-send-held`}` unconditionally while the
described `<p>` renders only `{!body.trim() && …}` (`:617-624`). `notice-log.tsx:139` sets
`aria-describedby={heldId}` unconditionally while `<p id={heldId}>` renders only
`{picked.length === 0 && …}` (`:155-160`). `roster-row.tsx:466` and `:512` already do it
conditionally, in the same file.

---

### CR-11 · MINOR · medium confidence — a mini row uses the `disabled` attribute and opacity to express a state

`apps/designer-portal/src/components/document/roster/party-mini-row.tsx:186-196`

```tsx
<button type="button" role={selectable ? 'radio' : undefined} disabled={disabled}
  className={`… disabled:opacity-50 …`}>
```

Both the attribute (SPEC §7 #4, direction §5.5) and opacity-as-state (SPEC §8 #5) are named
forbidden. `rolodex-picker.tsx:405` passes `disabled={addParty.isPending}`, so it is transient
rather than a gate — and both lines predate this wave (`git show origin/main:…` has them) — but
`party-mini-row.tsx` IS in this wave's changed set and the wave's own report claims every act in
these surfaces uses `held` + `aria-disabled`. `rolodex-picker.tsx:563` is the same shape on a
`DocumentAction` (`disabled` + `loading`, no `held`).

---

### CR-12 · MINOR · medium confidence — more than one live region can be live on one screen

`people-room.tsx:561` is the Room's announcer and CR3‑11 removed the two card-level ones, but
`directory-view.tsx:364` (the add notice), `call-sheet.tsx:179` (`added`), `roster-row.tsx:633`
(the per-row `note`), `project-team-roster.tsx:94`, `rolodex-picker.tsx:430` and
`promote-band.tsx:41` each still carry `role="status"`. On `/doc/<id>` with the Call Sheet open,
adding from the rolodex and then acting on a row lights two at once; on `/people`, an add notice and
a toast can coexist. SPEC §7 #3 asks for exactly one. Each region is small and correct on its own,
which is why this is minor rather than major.

---

### CR-13 · MINOR · medium confidence — an emergency line with no name is silently deleted by any unrelated edit to the list

`site-access-card.tsx:248-255` — `storedLines()` is the round-trip shape for every write to
`emergency_lines`, and it `.filter((line) => !!line?.name)`. Adding or removing one line therefore
rewrites the whole array without any stored line that carries a phone and a role but no name. The
add form refuses a nameless line (`:455-460`), so the room cannot create one — but the seed and any
future import can, and the card's own render (`:246`) hides them too, so the loss is invisible. Fix:
carry unknown-shaped lines through untouched, or state the refusal.

---

### CR-14 · MINOR · low confidence — a seat line is a control well under the room's own 44px floor

`seat-line.tsx:88-101` — the `SeatLine` button is `py-[6px]` around an 11px `.t-meta` span, roughly
28px tall. Every other control in the room carries `min-h-11` (`person-row.tsx:134, 211`,
`TelLink`'s `min-h-[44px]`, the chips, the disclosures). SPEC §6.2's Targets rule names the row's
open control and the `tel:` link explicitly and does not name the seat line, so this is a house-floor
question rather than a stated requirement — but R-AA makes the seat line a door, and a door 28px
tall on a phone is the one the thumb misses.

---

### CR-15 · MINOR · high confidence (carried, CR3‑19, partly fixed) — `ContactRuleLine`'s docblock still describes the pre-R-BL block

`contact-rule-line.tsx:10-12` — "A HARD BLOCK — a rule that forbids a channel outright" — and
`:46-48` — "True when the rule forbids a channel outright" — are both the reading R-BL explicitly
overturned for Ray Thao and Dana Kowalski. The CR3‑2 half of CR3‑19 (the "pass that column straight
through" instruction) IS fixed at `:36-43`. Fix the remaining two sentences to R-BL's wording.

---

### CR-16 · MINOR · high confidence (carried) — the twelve other r3 minors, unchanged

CR3‑11 (`contactRuleBlocks`, a dead second hard-block answer at `people-derivation.ts:1096`, kept
alive only by three pins), CR3‑12 (the dead plural ternary and seats-as-projects at
`person-profile.tsx:500-503`), CR3‑13 ("No open seat on this project." on a cross-project ledger,
`person-row.tsx:230-234`), CR3‑14 (a Directory seat line opens the seat sheet, not the person card —
against R-AA, and the same edge CR-3 above hits from the other side), CR3‑15 (`documentLabel` is
`null` exactly when a document exists, so every drafted chase reads "for a current certificate" —
`company-card.tsx:770-771`), CR3‑16 (`placeholder=` at `party-profile-sheet.tsx:919` and
`rolodex-picker.tsx:519`), CR3‑17 ("Optional" printed on `project_review`, the one tier whose RPC
refuses a blank reason — `access-grant-list.tsx:35-37`), CR3‑18 (`<option disabled>`), CR3‑20 (the
lockbox printed twice and one `isPending` shared across every editor on the card), CR3‑21
(`fullWidth` at every width), CR3‑22 (the rule editor can write a channel into
`channels_allowed` and `channels_forbidden` at once — `reach-access.tsx:791-800`), CR3‑23 (the
R-BL/fixture mismatch; **an orchestrator ruling is still owed**), CR3‑24 (the opt-in invite still
dispatches nothing; W3, and it must stay on the deploy checklist).

---

## 5. What this review did not cover

The visual and behavioural walk at 1440 and 390 (the QA reviewer owns 3000/3002), the Playwright
specs (not run — no port taken), the iOS surfaces, the W1 migrations beyond the policies, triggers
and functions named above, and the Sanity help articles.
