# W2 — adversarial code review, round 4

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. Local only: no dev server started, no
port taken, no migration applied, no prod touched. The local DB
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`) was read READ-ONLY,
inside `BEGIN … ROLLBACK`, for evidence.

**Verdict: NOT CLEAN — 1 blocking, 4 major.**

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
  EXIT=0

$ cd apps/designer-portal && npx jest --silent \
    src/components/document/people src/components/document/roster \
    src/lib/document src/app/(document)/desk src/components/document/mobile \
    src/components/document/coordination src/components/document/__tests__
  Test Suites: 196 passed, 196 total
  Tests:       3255 passed, 3255 total
  Time:        9.664 s
  EXIT=0

$ cd packages/supabase && npx vitest run
  Test Files  102 passed (102)
       Tests  1290 passed | 12 skipped (1302)
  EXIT=0
```

Every gate is green. **Every finding below survives a green gate** — which is
the point of this round: the blocking one is a CSS custom property that no
test in the tree measures.

Also run, and clean: `react-hooks/rules-of-hooks` over
`components/document/people`, `components/document/roster` and `lib/document`
(ESLint 9 flat config, `@typescript-eslint/parser` + `eslint-plugin-react-hooks`).
**No hook sits below an early return anywhere in the wave's files.**

---

## 1. The brief's checklist, answered

| Check | Answer |
|---|---|
| Hooks above early returns | **PASS** — `rules-of-hooks` clean over all three trees. `person-profile.tsx:238` (the maker branch) and `company-card.tsx:358` (`!card`) are the two early returns; every hook sits above both. |
| Hydration gate | **PASS, narrowly.** Five surfaces build a clock in render (`people-room.tsx:137`, `person-profile.tsx:146`, `company-card.tsx:174`, `use-call-sheet-roster.ts:68`, `roster-row.tsx:176`). None of them reaches SSR markup — the Directory renders off empty query data on the server, and the Call Sheet and both cards mount behind an interaction. `company-card.tsx:174`'s `today = new Date()` is a DEFAULT PARAMETER, so it is a fresh object on every render and churns `ComplianceTable`'s work; a nuisance, not a mismatch. |
| One canonical query key per entity | **PASS.** Thirteen roots, one per read model, every detail key a prefix-extension of its root: `people-directory`, `people-directory-seats`, `channel-consent`, `access-grants`, `studio-contacts`, `studio-contact-channels`, `studio-contact-rules`, `studio-person-affiliations`, `studio-compliance-documents`, `project-party-authority`, `project-site-access`, `project-parties/:id`, `project-roster/:id`. §2 lists every mutation's invalidations. |
| RLS-safe writes send every column a WITH CHECK joins through | **PASS.** Verified live: `project_party_authority` (`engagement_id`, `scope` — both sent), `studio_contact_channels` (`owner_id` — sent), `studio_contact_rules` (`subject_type`, `subject_id` — both sent), `project_site_access_cards` (`project_id` — sent on every upsert), `studio_compliance_documents` (`organization_id` sent explicitly). |
| Consent writes only through `record_channel_consent` | **PASS.** `use-consent.ts` touches `studio_channel_consent` only with `.select()` (`:212`, `:254`); every write is `record_channel_consent` / `record_channel_invite` / `record_channel_reconsent`. |
| No portal writer of `project_parties.sms_consent_*` (R-AS) | **PASS.** `grep` for the eight columns over `apps/designer-portal/src`, `packages/supabase/src/hooks` and `packages/types/src` returns twelve hits: two comments, one synthetic-row literal (`roster-derivation.ts:149`), one vitals READ of `v_project_roster.sms_consent_status` (`:399`), and the eight frozen fields on the `ProjectParty` interface. **Zero mutation payloads.** |
| No hard delete outside the mistaken-add predicate | **PASS, with one dead exception.** Two `.delete()` calls survive: `use-coordination.ts:927` (gated on `seatDeleteRefusal`) and `use-studio-contacts.ts:1059` (`useClearContactRule`, which has **zero call sites** — CR3-26, still open). |
| Site access card never reaches a client-facing path | **PASS.** `grep -rln` over `apps/client-portal`, `apps/admin-portal`, `packages/api-routes`: no hits. The only portal consumers are `roster/call-sheet.tsx` and `roster/site-access-card.tsx`. No `show_to_client` on the card, and 00625 carries no anon leg. |
| No code field anywhere | **PASS.** `gate_code` / `lockbox_code` / `alarm_code` appear only in 00625's own comments explaining their absence. No column, no input, no type field. |
| PR-n authority scope gating, client AND DB | **PASS, both halves.** Client: `add-person-sheet.tsx:1377` disables the two options, `:1383-1390` prints the reason, `:432-435` resets a stale choice, `:737-741` refuses the write. DB (read live off the local cluster): `project_party_authority_studio_insert` and `_update` both carry `((scope <> ALL (ARRAY['money','draw_certify'])) OR is_org_admin_or_owner(project_party_recorded_studio(engagement_id)))`. |
| `call-sheet` flag fully removed | **PASS for the flag, FAIL for the imports.** `grep -rn "useFeatureFlag('call-sheet')" apps/designer-portal/src` returns nothing and no dead branch survives. But **five** files now import `useFeatureFlag` and call it zero times (CR3-12, widened — `party-profile-sheet.tsx` joined the list this round). |
| dist rebuilt after edits | **PASS.** `@patina/supabase` ships `src` (`package.json` `main: ./src/index.ts`) — no dist to stale. `@patina/types/dist/field-config.js` is 2026-09-12 23:00:19, newer than `src/field-config.ts` at 22:48:54, and carries the PR-f kinds (13 hits) and `STATE_WORD_PIGMENTS` / `resolveStateWord` (8 hits) in `dist/studio-config.js`. |
| Analytics only via `people-events.ts` | **PASS.** Zero `posthog.` / `captureEvent` in `components/document/people` or `components/document/roster`; fifteen call sites, all `peopleEvents.*`. |
| Document grammar — `box-shadow` in changed files | **PASS.** Zero `box-shadow` / `shadow-` in any changed component. The three `globals.css` hits are pre-existing and outside the diff. |
| Tokens only | **FAIL — see CR4-1** (`--hairline` undefined) and CR3-34 (five new raw `rgba()` literals, still open). |
| Every string on a face is SPEC vocabulary | **FAIL — see CR4-5** (Title-Case kind and trade on every seat line, "Client Rep" on a face). |
| aria: no `disabled` attribute | **PASS on the wave's acts.** Every `disabled=` in the people/roster tree is paired with `held` on a `DocumentAction`, and `document-action.tsx:309` emits `disabled={unavailable && !held}` — so the native attribute never lands. The two bare ones are `add-person-sheet.tsx:1377` (an `<option>`, with the reason printed beneath) and `party-mini-row.tsx:190` (pre-existing on `main`, with `disabled:opacity-50` — a state carried by opacity, SPEC §8 #5). |
| `aria-expanded` pairs with a real id | **PASS.** Nine files carry `aria-expanded`; the count of `aria-controls` matches in every one, and each target is an `id` rendered in the same component. |
| No `<a>` inside `<button>` | **PASS.** `TelLink` is an `<a>` and every call site places it as a SIBLING; `ContactRuleLine` renders a `<p>` beside the row button, never inside it; `PartyMiniRow` deliberately renders the rule as a `<span>` "because a selectable mini row is a `<button>`, which takes phrasing content only". |
| One live region | **PARTIAL.** CR3-11's two card-level regions are gone. Ten `role="status"` elements remain across the room and the sheet (`people-room.tsx:556` the Room's own, `directory-view.tsx:356`, `call-sheet.tsx:179`, `roster-row.tsx:618`, `project-team-roster.tsx:94`, `rolodex-picker.tsx:430`, `promote-band.tsx:41`, `rolodex-seed-sheet.tsx:208`, `maker-profile.tsx:179,419`). None of them ECHOES another — each carries its own message — but the Directory screen mounts two at once. Filed minor (CR4-25). |
| Types imported, not redefined | **PASS.** `coordination/party.ts` now imports `PartyKind` from `@patina/types` (w2a §7); no local copy of a shipped union survives in the wave's files. |
| No ad-hoc fetch | **PASS.** Three `fetch()` calls in the tree, all to same-app Next routes (`/api/people/chase-renewal`, `/api/clients/invite/resend`, `/api/vendors/…`), none to a NestJS service. |

---

## 2. Mutation invalidations, as built

| Mutation | Invalidates |
|---|---|
| `useAddProjectParty` | `project-parties/:id` · `people-directory` · `project-roster/:id` · `people-directory-seats` |
| `useUpdateProjectParty` | the same four |
| `useRecordPartySmsConsent` | the same four + `channel-consent` |
| `useCloseProjectPartySeat` | the same four |
| `useRemoveProjectParty` | the same four |
| `useSetPartyAuthority` | `project-party-authority` (ROOT — reaches `projectAuthorityKeys.project`) · `project-parties/:id` · `project-roster/:id` · `people-directory-seats` |
| `useCreateFieldLink` | `field-links/:party` · `access-grants` · `people-directory` · `people-directory-seats` · `project-roster/:id` |
| `useRevokeAccessGrant` | `access-grants` · `people-directory` · `people-directory-seats` · `project-roster` |
| `useRecordChannelConsent` / `Invite` / `Reconsent` | `channel-consent` · `people-directory` · `people-directory-seats` (+ `project-roster/:id`, `project-parties/:id` when an origin project is given) |
| `useAdd/Update/SetStatus StudioContactChannel` | `studio-contact-channels` list + root · `studio-contacts` detail · `people-directory` · `people-directory-seats` |
| `useSetContactRule` / `useClearContactRule` | `studio-contact-rules` root · `people-directory` · `people-directory-seats` · `studio-contacts` detail |
| `useSetAffiliation` / `useCloseAffiliation` | `studio-person-affiliations` · `studio-contacts` root + two details · `people-directory` · `people-directory-seats` |
| `useRecordComplianceDocument` / `useConfirmComplianceDocument` | `studio-compliance-documents` · `studio-contacts` detail · `people-directory` · `people-directory-seats` |
| `useUpdateSiteAccessCard` / `useLogSiteAccessTold` | `project-site-access/:projectId` only |
| `useAddStudioContact` / `useUpdateStudioContact` / `Archive` / `Restore` / `usePromoteToStudioContact` | `studio-contacts` root · `people-directory` — **not `people-directory-seats`** (CR3-17, open) |
| `useChaseTheRenewal` | `agent-tasks` |

Two gaps stand, both carried: **CR3-17** (card edits leave the seats view
stale, and `people_directory_seats.paper_state` reads the card's firm) and
**CR3-18** (seat mutations never invalidate `project-site-access` or
`studio-contact-history`, while `key_holder_engagement_id` is FK `ON DELETE SET
NULL`).

---

## 3. Prior findings, re-checked

### Round 3's named thirteen

| id | status | evidence |
|---|---|---|
| QA-R3-1 wrong studio in the Add sheet | **FIXED** | `add-person-sheet.tsx:308` sorts before picking and takes the `organizationId` prop; `people-room.tsx:532` passes `directoryRolodexOrgId(all)`; `rolodex-picker.tsx:182` sorts. |
| QA-R3-4 travel-list pane | **TRACKED, W3** | unchanged, as ruled. |
| CR3-1 seat sheet identity-less | **FIXED** | `party-profile-sheet.tsx:207-222` reads `seatResolution.seat` first with `person` as fallback; name, trade, company, phone, project and project id all resolve off the seat. |
| CR3-2 rule write destroys a standing rule | **FIXED** | `use-studio-contacts.ts:996-1011` reads the standing row under `merge`; `add-person-sheet.tsx:730` passes `merge: true`. |
| CR3-3 channel insert dead-ends on 23505 | **FIXED** | `use-studio-contacts.ts:769-782` catches `23505` and reads the standing row back without touching its status or its `preferred` flag. |
| CR3-4 nothing could add/edit/hold a channel | **FIXED** | `reach-access.tsx:793-862` ("Add a channel") and `:316-365` ("Hold this line" with the four statuses in house words). |
| CR3-5 key holder / emergency lines unwritable | **FIXED** | `site-access-card.tsx:387-490` (lines) and `:552-610` (key-holder picker over seats only). |
| CR3-6 mint choice overridden by the RPC | **FIXED** | `reach-access.tsx:521-535` `grantWindowEnd` mirrors the RPC; the radios are gone; `MINT_FALLBACK_SENTENCE` states the ninety-day term. |
| CR3-7 leading rule on rows the fixture marks `block:false` | **OPEN — ORCHESTRATOR RULING OWED** | `contact-rule.ts:78-99` states the residue in the file: F-10 Sam Rowe and F-13 Ingrid Halvorsen still wear a rule the fixture marks `false`, and no formula over `channels_forbidden` can separate F-26 Carol Nyström from F-10 (byte-identical rows). Either a column + W3 migration, or SPEC §3 is amended. |
| CR3-8 verdict band erases a verdict | **FIXED** | `company-card.tsx:325-340` `seededVerdictRef`. |
| CR3-9 composers ignore the contact rule | **FIXED** | `roster-row.tsx:214-222`, `person-profile.tsx:280-281`, `contact-rule.ts:116-120`, `_shared/sms.ts`. ⚠ `_shared/sms.ts` changed — every importing function needs redeploying at ship. |
| CR3-10 stale e2e specs | **FIXED** (static; not run — the QA reviewer owns the ports) | `e2e/people/add-sheet.spec.ts` pins `toEqual([])`; `e2e/field/field-coordination.spec.ts` rewritten. |
| CR3-11 two live regions echo | **FIXED** | `queryAllByRole("status")` empty on both cards; `announce = notify` / `onAnnounce` on both. A separate, non-echoing multiplicity remains — CR4-25. |

### Round 3's twenty-six minors — all untouched by design, all re-verified OPEN

`CR3-12` five dead `useFeatureFlag` imports (was four; `party-profile-sheet.tsx:53`
joined) · `CR3-13` dangling middle dot at 390 — **13 of 64 Directory rows carry
`consent_status IS NULL`, measured on the local seed** (`person-row.tsx:151-153`)
· `CR3-14` held Text reason still `sr-only` (`roster-row.tsx:556`) · `CR3-15`
held clause prints "COI, general liability" where SPEC §5.4 #7 fixes "insurance"
(`roster-row.tsx:181-190`) · `CR3-16` picker prints a paper word for lenders and
inspectors (`rolodex-picker.tsx:400`) · `CR3-17` card edits leave the seats view
stale · `CR3-18` seat mutations leave the site access card stale · `CR3-19`
"Show to client" has no `.catch` (`roster-row.tsx:525-531`) · `CR3-20`
mistaken-add predicates disagree across the seam · `CR3-21` empty `if` body
(`use-coordination.ts:1684-1687`) · `CR3-22` person-card history wrong three
ways (`person-profile.tsx:499-505` — both ternary arms still read `"projects"`)
· `CR3-23` `useOrganizations({enabled:true})` on every mount
(`party-profile-sheet.tsx:230`) · `CR3-24` supersede is two statements
(`use-studio-contacts.ts:1482-1488`) · `CR3-25` `told_refs` read-then-write race
· `CR3-26` `useClearContactRule` dead and hard-deleting · `CR3-27` **partly
fixed** — swept from the add sheet and the picker, **still standing in
`party-profile-sheet.tsx:232-235`, where it drives a WRITE** (promoted to CR4-2)
· `CR3-28` chase reports success when `p_on_conflict: 'ignore'` wrote nothing ·
`CR3-29` chase route's return type is a lie · `CR3-30` three dead exports
(`openPersonLabel`, `isPartyKindWritable`/`PARTY_KINDS_ACCEPTED_BY_DB`,
`contactRuleBlocks` — all confirmed zero call sites) · `CR3-31` "client rep" on
a face (`add-person-sheet.tsx:228`) · `CR3-32` notice-log confirmation silent
(`notice-log.tsx:164-166`) · `CR3-33` `changedBy` resolves only for a roster
member (`site-access-card.tsx:230-231`) · `CR3-34` five raw `rgba()` literals ·
`CR3-35` `SeatLine` has no 44px floor (`seat-line.tsx:88`) · `CR3-36` table and
word can disagree on a transitive supersede · `CR3-37` `useProjects()` with a
mock fallback for one clause (`directory-view.tsx:286`).

---

## BLOCKING

### CR4-1 — `--hairline` does not exist in the designer portal; every ledger rule paints in ink

**blocking · confidence high · 14 call sites**

The wave's whole visual premise is the hairline ledger row (PR-q, C9, SPEC §6.1
"Region seams `1px solid var(--hairline-strong)`", §5.1 #7's row grammar). It is
drawn with `border-[var(--hairline)]` in fourteen places:

```
people/access-grant-list.tsx:164        people/company-card.tsx:144, 518
people/reach-access.tsx:293             people/compliance-table.tsx:86, 148
people/directory/person-row.tsx:115, 212
people/directory/company-row.tsx:62
people/views/person-profile.tsx:393, 415
people/views/directory-view.tsx:427, 454, 494
```

`--hairline` is **not defined anywhere in the designer portal**. The house sheet
defines `--hairline-strong: #D8CCB8` (`globals.css:1994`) and `--rule-hair`, and
its own comment at `globals.css:638` says so out loud: *"The LIGHTER rule (the
specimen's `--hairline`). `--rule-hair` is a full shorthand value…"* — i.e. the
specimen's token has a different name here. The only definition in the repo is
in a different app: `apps/client-portal/src/app/globals.css:87`.

Confirmed against the **built** bundle in the worktree
(`apps/designer-portal/.next/static/css/96105f6870d15ede.css`, 2026-09-13 01:06):

```
.border-\[var\(--hairline\)\]{border-color:var(--hairline)}
```

and, in the same file, the only matching declaration is
`--hairline-strong:#D8CCB8`. A `var()` with no fallback and no definition makes
the declaration *invalid at computed-value time*; `border-color` is not
inherited, so it falls back to its initial value, `currentColor`. On these rows
`color` inherits `--ink`, which `globals.css:1981` defines as
`var(--color-charcoal)`.

**Failure:** the Directory's row separators, the seats-panel rule, both cards'
region seams between seats, the compliance table's row rules, the channel rows
and the access-grant rows all render as near-black 1px lines instead of the pale
hairline. The ledger the redesign exists to build reads as a boxed table in ink.
Both widths, every studio, on first load — and no test in the tree measures a
custom property's existence, which is why five green gates say nothing about it.

**Fix:** either add `--hairline: #E8E3DB;` to the designer portal's house-sheet
`:root` block beside `--hairline-strong` (the client portal's value, and the
name the specimens and `@patina/types`' `STATE_WORD_PIGMENTS` already spend), or
repoint all fourteen call sites at `--hairline-strong`. The first is the one the
alias block PR-v already established the pattern for; a token-existence test
beside `contrast.test.ts` would stop the next one.

Related, pre-existing and out of this wave's diff: `--color-linen` is also
undefined in the designer portal and is spent three times in
`components/document/people` (`party-profile-sheet.tsx:880`,
`directory/add-person-sheet.tsx:1456`, `directory/letter-line-field.tsx:191`),
where `background-color` falls back to `transparent`. Filed as CR4-22.

---

## MAJOR

### CR4-2 — the party sheet still guesses the studio, and the guess is what a rolodex card is written into

**major · confidence high**

`apps/designer-portal/src/components/document/people/party-profile-sheet.tsx:232-235`:

```ts
const organizationId = useMemo(
  () => orgs?.find((o) => o.type === 'design_studio')?.id ?? orgs?.[0]?.id ?? null,
  [orgs],
);
```

This is the exact QA-R2-1 / CR3-27 defect the r3 fix log swept out of
`add-person-sheet.tsx` and `rolodex-picker.tsx` — a FIRST MATCH over an
unordered membership read — left standing in the third file, which the same
round edited for CR3-1. Measured on the local seed:

```
$ psql … -At -c "select count(*) from organization_members m
    join organizations o on o.id = m.organization_id
    join auth.users u on u.id = m.user_id
    where u.email='designer@patina.dev' and m.status='active'
      and o.type='design_studio';"
  2
```

Unlike the two files already fixed, this one is not a read scope: it feeds
`showPromoteBand` (`:254-258`) and is passed straight to the promote band
(`:568-570`), which calls `usePromoteToStudioContact().mutateAsync({
organizationId, party })` (`promote-band.tsx:63`). A designer in two design
studios promoting a seat therefore **mints the rolodex card in whichever studio
PostgREST happened to return first** — a card in the wrong studio's book, which
the Directory (scoped by `directoryRolodexOrgId`) will then never show, and
which `apply_party_rolodex_link_trg` will not re-link.

**Fix:** the same one the other two files took — sort the membership list before
picking, and prefer the answer the room already holds. The cheapest correct
source here is the seat's own project: the sheet already reads
`seatProjectId`, so `useProjectConsentOrg(seatProjectId)` (or a `project_tenant_org`
read) names the studio that owns the job, rather than a membership guess.

### CR4-3 — Revoke ignores `reasonRequired` and `revokesWholeScope`: the face says "Optional" where the RPC refuses, and says nothing where the act closes every reviewer

**major · confidence high**

`packages/supabase/src/hooks/use-access-grants.ts:170-177` declares the
`project_review` route with two flags, and the interface comment at `:133-139`
says explicitly *"the surface must say so in its consequence sentence before the
act"*:

```ts
project_review: {
  rpc: 'revoke_project_review_access',
  idArg: 'p_edition_id',
  reasonArg: 'p_reason',
  reasonRequired: true,
  revokesWholeScope: true,
  keySegment: 1,
},
```

`apps/designer-portal/src/components/document/people/access-grant-list.tsx`
reads neither flag. It calls `isAccessGrantRevokable(grant.tier)` (`:130`) and
nothing else, then prints one fixed prompt for every tier (`:35-37`, rendered at
`:190-192`):

```
REVOKE_REASON_PROMPT = "Say why the door closes. Optional, kept with the record."
```

Two failures, both reachable. `v_access_grants`' `project_review` leg
(`00627:484-497`) carries `subject_type = 'profile'` and
`subject_id = pra.actor_id`, and `person-profile.tsx:219-223` puts
`person.profile_id` into `grantSubjectIds` — so a client or a studio member
holding review access gets a `project_review` row on their person card.

1. Pressing "Close this door" with the reason box empty throws
   `useRevokeAccessGrant`'s own `'Say why the door closes. This one keeps the
   reason on record.'` (`use-access-grants.ts:283-285`) into the row's error
   slot — a refusal the label one line above promised would not happen.
2. When a reason IS typed, the act revokes the whole **edition**
   (`p_edition_id`), closing every reviewer's door, and the surface never says
   so. A destructive blast radius stated in the routing table and nowhere on the
   face.

**Fix:** read `accessGrantRevokeRoute(grant.tier)` in `GrantRow`; swap
`REVOKE_REASON_PROMPT` for a required-variant when `reasonRequired`, and print a
consequence sentence above the confirm when `revokesWholeScope` ("This closes
the review for everyone on this edition, not just <name>.").

### CR4-4 — the contact rule's authorship: SPEC §5.2 #5's "Set by <name>" is not rendered, and `set_by` silently mis-attributes after any edit

**major · confidence high**

SPEC §5.2 #5 fixes the person card's rule line as:

> "Text only. The email on file bounces. **Set by Priya Natarajan, 12 October 2026.**"

`reach-access.tsx:606-614` renders:

```ts
const setOn = formatSeatDate(rule?.set_at?.slice(0, 10));
return setOn ? `${clause} Set ${setOn}.` : clause;
```

— no name, and `formatSeatDate` spells "12 Oct 2026" where the acceptance
literal is "12 October 2026". The name is not merely unrendered: it is not
resolvable correctly if it were added. `useSetContactRule`
(`use-studio-contacts.ts:1012-1035`) upserts with `set_at: new Date()…` and
**never sends `set_by`**. Read live off the local cluster:

```
$ psql … -At -c "select column_name, column_default from information_schema.columns
                 where table_name='studio_contact_rules' and column_name in ('set_by','set_at');"
  set_by|auth.uid()
  set_at|now()
```

`DEFAULT auth.uid()` fires on INSERT only. On the UPDATE leg of the upsert
`set_by` keeps the ORIGINAL author while `set_at` is stamped with today — so a
rule Priya wrote and Dale later edited reads "Set by Priya Natarajan, <the day
Dale edited it>". The audit half of a do-not-contact instruction, wrong.

**Fix:** send `set_by: (await supabase.auth.getUser()).data.user?.id ?? null`
in the upsert payload (the site-access hook already does exactly this for
`changed_by`, `use-coordination.ts:2006-2011`), and render the resolved name
plus `formatLongDate` in `ruleSummary` — the person card already builds a
`peopleById` index that can name a `set_by`.

### CR4-5 — schema vocabulary and Title Case on every seat line, and "Client Rep" on a face

**major · confidence high**

SPEC §5.1 #8 fixes the canonical Directory seat line, and §5.2 #7 the person
card's, as:

> "Okonkwo residence · **sub** · **electrical** · On the job · 12 Oct 2026 to 13 Aug 2027"

`components/document/people/seat-line.tsx:66-75` composes it from the shipped
label maps:

```ts
const kind = getPartyKindLabel(seat.party_kind);   // 'sub' -> 'Subcontractor'
const trade = getFieldTradeLabel(seat.trade);       // 'electrical' -> 'Electrical'
```

so the line renders **"Okonkwo residence · Subcontractor · Electrical"**. The
same two maps feed `roster-derivation.ts:598-601` (`metaOf`), which is the Call
Sheet row's mono second line, and `person-profile.tsx:423-430` (Past seats).
`personIdentityLine` (`people-derivation.ts:1046`) already lowercases the trade
for the Directory's own second line, so the room is internally inconsistent as
well as off-spec.

Two consequences rather than one:

* **Casing.** Every seat line at both widths, on the Directory, both cards and
  the Call Sheet, prints Title-Case where §5.1 #8 and §5.2 #7 print lowercase.
  §5.1 #13 has the same shape at firm level and was already routed through
  `companyKindShortLabel` by CR-6 ("GC", not "General Contractor"); the seat
  line was not.
* **A schema concept on a face.** `PARTY_KIND_LABELS.client_rep = 'Client Rep'`
  (`packages/types/src/field-config.ts:203`). C5 rules *"the string `client_rep`
  never appears on a face"* and names the studio's word: "a household member".
  The dev seed carries one such seat —

  ```
  $ psql … -At -c "select party_kind, count(*) from project_parties group by 1;"
    … client_rep|1 …
  ```

  — so the Call Sheet's Client-side row and that person's seat line both print
  "Client Rep" today. `person-profile.tsx:418-421`'s own comment says CR-11
  replaced the raw token here; it replaced it with a Title-Cased restatement of
  the same schema concept, not with the studio's word. CR3-31 is the same word
  in the Add sheet's error string.

**Fix:** give `seat-line.tsx` / `metaOf` a seat-line vocabulary the way
`companyKindShortLabel` gives the firm row one — lowercase, and "a household
member" (or "household") for `client_rep` — rather than reusing the
column-head-voice maps. Do not lower-case `PARTY_KIND_LABELS` in place: it is
the picker's and the select's column-head voice and other rooms read it.

---

## MINOR

### CR4-6 — the avatar sizes miss both ends of the one visual difference
**minor · confidence high** — `Avatar`'s default is `size = 42`
(`person-bits.tsx:133`). `directory/person-row.tsx:119` calls it with no size,
so the Directory PERSON row renders a 42px circle where SPEC §6.1's row measure
and direction §4 both fix 34px ("Person circle fixed at 34px in every row
context; 42px reserved for the company square and card headers"), collapsing the
circle/square contrast to a shape difference alone. `views/person-profile.tsx:316`
likewise renders 42px where SPEC §5.2 #1 asks for a 48px circle.
`roster-row.tsx:304` passes `size={34}` correctly; `company-row.tsx:64` and the
company card header are correct at 42.

### CR4-7 — SPEC §5.3 #8's company history clause never renders
**minor · confidence high** — `company-card.tsx:857-861` prints
`card.studio_verdict ?? NO_VERDICT_SENTENCE` and nothing else. §5.3 #8 requires
"First job 2025, the Lindqvist kitchen. Two projects. No verdict recorded." The
two missing clauses are both in hand on that render (`seatsByPerson`,
`openJobs`, and each seat's `on_site_from`).

### CR4-8 — SPEC §5.2 #4's carried-forward sentence never renders; its function is dead
**minor · confidence high** — `consent-sentence.ts:85-92` exports
`carriedForwardSentence`, written for §5.2 #4's second sentence ("Carried
forward to the Okonkwo residence, 12 October 2026."). `grep` over the portal
returns **zero call sites**. The person card's channel row prints
`consentSentenceForRecord` only (`reach-access.tsx:196`), so the acceptance
line is absent and a fourth dead export joins CR3-30's three.

### CR4-9 — the three Reach & access sub-heads are siblings of the region head
**minor · confidence high** — `person-profile.tsx:334` renders
`<h3>Reach &amp; access</h3>`, and `reach-access.tsx:761`, `:862`, `:942`
render `<h3>Channels</h3>`, `<h3>Contact rule</h3>`, `<h3>Access grants</h3>`
inside it. SPEC §5.2 #2 calls them "sub-heads" and §7 #11 asks for headings in
order; by ear they read as four peers, not one region with three parts. The same
shape repeats on the company card (`company-card.tsx:612`).

### CR4-10 — SPEC §5.3 #3's "Not on file" table row cannot be rendered
**minor · confidence high** — §5.3 #3 lists four rows for Northgate Electric,
the fourth being "COI workers compensation (`Not on file`, blocks site access,
draw)" — a paper that does not exist as a row.
`compliance-table.tsx:116` maps `documents`, so only papers on file can print.
A "Not on file" ROW needs a required-documents model nobody has minted; today
"Not on file" can only appear as the region-level word when the firm holds
nothing at all (`company-card.tsx:646`). Either the fixture drops that row or
W3 adds the model — an orchestrator ruling, not a patch.

### CR4-11 — five date reads take the UTC day in modules that deliberately avoid it
**minor · confidence high** — `roster-derivation.ts:557` states the rule ("never
a `new Date()` — a DATE string parsed as UTC and printed in a local zone loses a
day"), and `rosterDateKey` honours it. Five reads do not:
`roster-row.tsx:176` (`doc.expires_on < new Date().toISOString().slice(0,10)` —
decides whether the held clause prints), `use-project-authority.ts:48` and
`use-coordination.ts:1824` (the `effective_to` cutoff), `use-coordination.ts:806`
(`off_job_at` on close), `compliance-table.tsx:57` (`documentPaperState`). West
of Greenwich after 18:00 local these all read TOMORROW, so a certificate lapsing
today, a grant ending today, and a seat closed this evening each land a day out.

### CR4-12 — the Add sheet's resume chain never re-writes a seat the studio has since corrected
**minor · confidence medium** — `add-person-sheet.tsx:390-402, 649-674`.
`chainRef` correctly stops a second seat being written after a mid-chain
failure, and `close()` clears it (`:524-531`). But it is not cleared when the
studio edits the form after a failure: if `addParty` succeeded and
`addChannel` then failed, correcting the name or the number and pressing again
writes the NEW channel against the OLD seat — `chain.party` is reused verbatim,
so `project_parties.display_name` / `phone_e164` keep the first attempt's values
while the card's channel carries the second's.

### CR4-13 — `useProjectAuthority` filters the end of a grant but not its start
**minor · confidence high** — `use-project-authority.ts:48-53` and
`use-coordination.ts:1820-1824` both filter
`effective_to.is.null,effective_to.gte.<today>` and never look at
`effective_from`. A grant recorded today to begin next month prints its
authority phrase on the Call Sheet and the person card from the moment it is
written. `useSetPartyAuthority` defaults `effective_from` to today, so this only
bites a deliberately future-dated grant — but the column exists precisely for
that.

### CR4-14 — "Chase the renewal" can never name the paper it is chasing
**minor · confidence high** — `company-card.tsx:692-697` sends
`documentId: docs[0]?.id ?? null` and `documentLabel: docs[0] ? null : "a
current certificate"` — so whenever the firm holds ANY document the label is
`null`, and the route's summary falls back to the generic
`"Chase <firm> for a current certificate"` (`route.ts:83`) while
`payload.document_label` is `null`. `ChaseRenewalInput`'s own comment says the
field exists "so the draft can name it". Pass `documentTypeLabel(docs[0])`.
(CR3-28's separate defect — `p_on_conflict: 'ignore'` making a second chase
unreachable and unreported — still stands on top of this.)

### CR4-15 — only dedupe rule 1 is implemented, and a three-way collision shows two names
**minor · confidence high** — direction §3.1's Directory table names "dedupe
rules 1 to 3 (`crm-model.md` §4)" for the duplicate band.
`people-derivation.ts:1102-1121` implements rule 1 (phone) only, and for a
bucket of three or more emits `[sorted[0], sorted[1]]` — the third card is
silently dropped from a band whose entire job is to name the collision.

### CR4-16 — the site access card's two array writes are read-modify-write over a cached array, and one is destructive with no confirm
**minor · confidence medium** — `site-access-card.tsx:243-253` (`storedLines()`)
reads `card.emergency_lines` out of the React Query cache and writes the whole
array back, the same class as CR3-25's `told_refs` race: two members editing the
card at once lose one set. Separately, "Take `<name>` off the list"
(`:369-384`) deletes a line on a single press, with no two-step confirm and no
consequence sentence — the only unconfirmed destructive act in the wave, on the
card whose value is "who do I call".

### CR4-17 — "The way in" is printed twice, as a region head and as its own field label
**minor · confidence high** — `site-access-card.tsx:493` renders
`<h3>The way in</h3>` and `:496-499` passes `label="The way in"` to
`EditableLine`, which renders it again as the field's `<label>` when the editor
opens. "Hours" and "Receiving" have the same shape (`:614`, `:628`).

### CR4-18 — the 1440 word columns are a flex row with a conditional child, so an absent word shifts the ones after it
**minor · confidence medium** — `person-row.tsx:167-181` renders three
`w-[108px]` words inside `flex gap-3`, with `StateWord` returning `null` for a
null value and paper wrapped in `paper ? … : null`. SPEC §6.1's row measure
describes three fixed columns; a row missing consent slides its paper word into
consent's column, and the ledger's columns stagger. Not observable on today's
seed —

```
consent_null_paper_present=0 | consent_present_paper_null=0 | both_null=13
```

— because the thirteen null rows are null in both, but it is reachable in prod
(an identity with an email and no phone at a firm holding a current COI).

### CR4-19 — two static element ids where the rest of the wave uses `useId`
**minor · confidence high** — `site-access-card.tsx:402/412`
(`site-access-emergency-lines`) and `:558/560` (`site-access-key-holder`) are
literals. Every other disclosure in the wave takes `useId()`. Only one card
mounts today, so it is fragile rather than broken.

### CR4-20 — `created_by` is never written on two new tables
**minor · confidence high** — `useAddStudioContactChannel`
(`use-studio-contacts.ts:756-766`) and `useUpdateSiteAccessCard`
(`use-coordination.ts:2006-2027`) both omit `created_by`, which is a plain
nullable column on both tables (no `auth.uid()` default on
`studio_contact_channels`, confirmed live). Nothing reads it today; the audit
trail is simply not written.

### CR4-21 — the roster's routed-person lookup is scoped by the CONSENT org, not the tenant org
**minor · confidence medium** — `roster-groups.tsx:67-69` scopes
`useStudioContacts(consentOrg ?? null, …)`, where `consentOrg` comes from
`project_consent_org()` (`call-sheet.tsx:88`). R-BD retires that resolver from
everything but the consent ledger; for a project whose `studio_id IS NULL`
(R-BI's legacy population) it is `COALESCE(studio_id, designer's primary)`,
which may not be the studio holding the cards. The routed name then resolves to
nothing and `ContactRuleLine` prints the block with no way to reach the routed
person — C22's failure mode, arrived at silently.

### CR4-22 — `--color-linen` is also undefined in the designer portal
**minor · confidence high · pre-existing** — spent three times under
`components/document/people` (`party-profile-sheet.tsx:880`,
`directory/add-person-sheet.tsx:1456`, `directory/letter-line-field.tsx:191`)
as `bg-[var(--color-linen)]/45`; no definition in `globals.css` or the imported
typography sheet, so those grounds are transparent. Not this wave's, but it is
the same class as CR4-1 and the same one-line token fix would close both.

### CR4-23 — `people-events.ts` says eight events and defines nine
**minor · confidence high** — the module header
(`lib/analytics/people-events.ts:4`) reads "Eight events, one per act";
`PEOPLE_EVENT_NAMES` (`:30-40`) and `peopleEvents` (`:124-160`) both carry nine.

### CR4-24 — the rolodex picker prints its empty sentence over a list of hits
**minor · confidence high · pre-existing** — `rolodex-picker.tsx:413-427` renders
"– No one by that name in the rolodex." unconditionally, outside the
`hits.length > 0` guard above it. Confirmed present on `origin/main`, so not
this wave's — but the picker is a changed file and the line reads as a
contradiction under every search that matches.

### CR4-25 — ten live regions in one tree
**minor · confidence high** — CR3-11 removed the two that ECHOED. Ten
`role="status"` elements remain: `people-room.tsx:556` (the Room's own, the one
direction §5.5 names), `views/directory-view.tsx:356`, `roster/call-sheet.tsx:179`,
`roster/roster-row.tsx:618`, `roster/project-team-roster.tsx:94`,
`roster/rolodex-picker.tsx:430`, `people/promote-band.tsx:41`,
`directory/rolodex-seed-sheet.tsx:208`, `profile/maker-profile.tsx:179` and
`:419`. Each carries its own message, so nothing double-announces — but the
Directory screen mounts two at once and SPEC §7 #3 asks for exactly one.

### CR4-26 — the Add sheet's typed phone can diverge from the card's channel
**minor · confidence medium** — `submitParty` writes the phone twice: onto the
seat (`addParty`, `:669`) and onto the card as a `mobile` channel
(`addChannel`, `:687-697`). Nothing reconciles them afterwards, and
`useUpdateProjectParty` does not write the channel. Editing the number on the
card later leaves `project_parties.phone_e164` — which is what
`people_directory_seats.phone_e164` and the auto-link trigger read — standing at
the old value.

---

## 4. What I did not review

The five Playwright specs under `e2e/people/` and `e2e/field/` were read but not
run: the QA reviewer owns 3000/3002 with `next start`, and this round started no
server. The W1 migrations were read only where a portal claim depended on them
(00592, 00623, 00624, 00625, 00627, and `project_consent_org` / `project_tenant_org`
in 00594/00621/00622). Patina Field's Swift surfaces are W5's. No DB mutation,
no migration, no deploy, no prod.

## 5. Owed to the orchestrator

1. **CR3-7's residue** — the fixture's `block` is not derivable from the rule
   row. Rule it: a column + W3 migration + seed, or amend SPEC §3.
2. **CR3-6's migration** — restoring PR-l's mint choice needs `p_expires_at` to
   outrank a live window in `create_field_link`. W3.
3. **CR3-9's deploy** — `_shared/sms.ts` changed; every importing function needs
   redeploying when this ships.
4. **CR4-10** — SPEC §5.3 #3's "Not on file" table row needs a required-paper
   model or a fixture amendment.
5. **CR4-5's vocabulary** — a seat-line voice distinct from the column-head
   `PARTY_KIND_LABELS` / `FIELD_TRADE_LABELS`, and the studio's word for
   `client_rep`.
6. The consent sentence's month form: R-Q and SPEC §5.8 spell "3 Dec 2025";
   SPEC §5.1 #9 and §5.2 #4 spell "3 December 2025" and "12 October 2026". The
   build took the short form everywhere. One of the two spellings has to go.
