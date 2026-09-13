# W2 adversarial code review — round 6

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD `23e922802`
("fix(people-room): W2 round-5 findings — the firm's own name, the Add sheet's
own door, the client side's real seats, one shape for a number, the studio the
job records, and what a revoke closes").

Read first: `rulings.md` §1–§6 (through R-BM), `synthesis/direction.md` §1–§6
incl. §3.9's C1–C38, `specimens/SPEC.md` §3/§5/§6/§7/§8, `w2a-report.md`,
`w2b-report.md`, `w2c-report.md`, `w2-review-r5-code.md`, `w2-review-r5-qa.md`,
`w2-fix-log-r5.md`, `w1a-report.md`, `w1b-report.md`. Every changed file under
`apps/designer-portal/src`, `packages/supabase/src/hooks` and
`packages/types/src` was read in full or in the regions the checks name. The
local database was read for evidence; nothing was written, no dev server was
started, no port was taken, no production anything.

**Verdict: NOT CLEAN — 0 blocking, 3 major, 33 minor.**

The three majors are all NEW to this round. Two of them (CR6-1, CR6-2) are
face-level defects on the room's two primary new surfaces that five code rounds
and five QA rounds did not name; the third (CR6-3) is r1's CR-45, raised once
and never assigned.

---

## 0. Gates, run here, at HEAD `23e922802`

```
$ pnpm --dir <worktree> --filter @patina/designer-portal type-check
> @patina/designer-portal@0.1.0 type-check
> tsc --noEmit
EXIT=0

$ pnpm --dir <worktree> --filter @patina/supabase type-check
> @patina/supabase@0.0.1 type-check
> tsc --noEmit
EXIT=0

$ pnpm --dir <worktree> --filter @patina/admin-portal build
...
ƒ Proxy (Middleware)
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
EXIT=0

$ cd apps/designer-portal && npx jest --silent \
    src/components/document/people src/components/document/roster \
    src/lib/document 'src/app/(document)/desk' src/components/document/mobile \
    src/components/document/coordination src/components/document/__tests__
Test Suites: 196 passed, 196 total
Tests:       3287 passed, 3287 total
Snapshots:   0 total
Time:        17.925 s
EXIT=0
```

All four green. Nine more tests than r5's 3278 — the r5 fix log's new cases.

---

## 1. The mechanical checks the brief names

| Check | Result |
|---|---|
| Hooks above early returns | **PASS.** `views/person-profile.tsx` — last hook `useComplianceDocuments({holderId: firmId})` at `:231`, first early return (`role === 'maker'`) at `:235`. `company-card.tsx` — the three seeding `useEffect`s at `:376/:395/:420`, `if (!card)` at `:432`. `reach-access.tsx` (both `ChannelRow` and `ReachAccess`), `people-room.tsx`, `add-person-sheet.tsx`, `roster-row.tsx`, `site-access-card.tsx`, `rolodex-picker.tsx`, `directory-view.tsx`, `person-row.tsx`, `access-grant-list.tsx` (`GrantRow`), `view-shell.tsx`: no conditional hook, no hook after a return. `SeatFacts` calls `usePartyAuthority` as its own component, which is correct. |
| Hydration gate | **PASS, with the carried nit (CR6-25).** `/people` and the document shell are `'use client'`; no `window`/`document` read during render in any changed file — every read is inside `useEffect` or a handler. `roster-row.tsx:184` and `:264` still call a bare `new Date()` in render. |
| One canonical query key per entity | **PASS**, with one stray root (CR6-27). Table in §2. |
| Every mutation's invalidations | **Listed in §2.** Four fan-outs still short (CR6-11, CR6-12, CR6-14, CR6-27). |
| RLS-safe writes send every joined column | **PASS.** Re-verified against the live policies: `studio_contact_channels` INSERT sends `owner_type`+`owner_id`; `studio_contact_rules` sends `subject_type`+`subject_id`; `studio_person_affiliations` sends `person_id`+`company_id`; `studio_compliance_documents` sends `organization_id`; `project_party_authority` sends `engagement_id`+`scope`; `project_site_access_cards` sends `project_id`; `studio_contacts` sends `organization_id`; `project_parties` sends `project_id`. |
| Consent writes ONLY through the RPCs | **PASS.** `record_channel_consent` (`use-consent.ts:297`), `record_channel_invite` (`:327`), `record_channel_reconsent` (`:356`), plus `record_channel_invite` from `useAddProjectParty` (`use-coordination.ts:499`) and `useRecordPartySmsConsent` (`:780`). The only `.from('studio_channel_consent')` calls in the tree are two `.select('*')` reads (`use-consent.ts:212`, `:254`). **No table write to `studio_channel_consent` anywhere.** |
| No portal writer of `sms_consent_*` (R-AS / R-AY) | **PASS.** `grep -rn --include='*.ts' --include='*.tsx' "sms_consent_status\|sms_opt_out_at\|sms_consented_at\|sms_consent_source\|sms_consent_evidence\|sms_consent_ip\|sms_consent_disclosure" apps packages`, excluding tests and `database.types.ts`, returns **eleven hits and zero writers**: `use-coordination.ts:77-84` (the `ProjectParty` READ interface), `:989` (`ProjectRosterRow`, the column 00594 repointed to the record's verdict), `:528` + `use-people.ts:104` + `people-derivation.ts:246` (comments), `roster-derivation.ts:149` (a synthetic in-memory client row, literal `null`), `:399` (a READ of the repointed view column), and one e2e comment. `useAddProjectParty`'s INSERT and `useUpdateProjectParty`'s `dbPatch` (`use-coordination.ts:641-701`) name none of the eight. |
| No hard delete outside the mistaken-add predicate | **PASS, with one weak leg (CR6-14).** Exactly two `.delete()` in the whole changed set: `use-coordination.ts:951` (`project_parties`, behind a server-side re-derivation of `seatDeleteRefusal` from three fresh reads at `:900-949`) and `use-studio-contacts.ts:1092` (`useClearContactRule`, lifting a rule — documented). |
| Site access card never reaches a client surface | **PASS.** `SiteAccessCard` is mounted from `roster/call-sheet.tsx:246` and nowhere else. `grep -rn "site_access\|SiteAccess\|site-access" apps/client-portal/src` → **zero hits**. No `show_to_client` in `site-access-card.tsx` or `notice-log.tsx`. |
| No code field anywhere | **PASS on the schema, FAILS on the face — CR6-3.** `grep -rni --include='*.ts' --include='*.tsx' "gate_code\|lockbox_code\|alarm_code\|gateCode\|lockboxCode\|alarmCode" apps packages` → **zero hits**, and `UpdateSiteAccessCardInput` carries `lockboxVersion` / `alarmRef` only. But the card offers a free-text input labelled **"The way in"**, over `lockbox_version`, immediately above the sentence "The code is held off Patina" — see CR6-3. |
| PR-n gating, client AND DB | **PASS on the DB; still mis-scoped on the client** (carried, CR6-8). |
| `call-sheet` flag fully removed | **PASS in product code, with leftovers (CR6-17).** `grep -rn "useFeatureFlag('call-sheet')" apps packages` → nothing. All 14 consumers repointed, every dead branch deleted. `command-bar.tsx:488 case 'call-sheet'` is a surface-key switch, not a flag; `registry.tsx:236` and `ticket-derivation.ts:80,740` are the overlay key. Leftovers: four dead imports, one live test mock, two flag-shaped parameters in `lib/document`. |
| dist rebuilt after edits | **PASS.** `@patina/types` is the only dist-bearing package in the diff (`@patina/supabase` resolves from source, `"main": "./src/index.ts"`; `api-client`, `api-routes`, `auth`, `help-system`, `patina-design-system`, `utils` are untouched). `dist/field-config.js` 2026-09-12 23:00:19 > `src/field-config.ts` 22:48:54; `dist/studio-config.js` 21:27:48 > `src/studio-config.ts` 20:57:22. Contents confirmed, not just timestamps: `dist/field-config.js` carries `PARTY_KINDS_ACCEPTED_BY_DB` / `partyKindOwesPaper` / `INSPECTOR_SUBTYPE_*` (10 hits), `dist/studio-config.js` carries `STATE_WORD_PIGMENTS` / `resolveStateWord` / `SEAT_STAGE_WORD_*` (14 hits). The r5 fix commit touched no file under `packages/types`. |
| Analytics only via `people-events.ts` | **PASS.** The only `posthog` reference under `components/document/people`, `components/document/roster` and `lib/analytics/people-events.ts` is `people-events.ts:20-25`, behind `isAnalyticsEnabled()`. No inline `posthog.capture`. (Docblock drift, CR6-28.) |
| Document grammar — `box-shadow` = 0 | **PASS.** Sweeping every file in `git diff origin/main --name-only`: `globals.css:360` and `:1942` (both pre-existing, outside this diff's hunks) and one docblock sentence in `state-word.tsx`. No `boxShadow` in any TSX. `StateWord` paints border + text on `background: 'transparent'` (SPEC §8 #10). |
| **Every CSS custom property used is defined in the designer portal's `globals.css`** | **FAIL — CR6-1 (major) and CR6-30 (minor).** 42 distinct `var(--…)` tokens are spent by the changed `.ts`/`.tsx` files; 167 are defined in `apps/designer-portal/src/app/globals.css`. Three are used and not defined: **`--hairline`** (14 W2 sites, zero on `origin/main` — CR6-1), `--color-linen` (three sites, all pre-existing — CR6-30), and `--x` (a docblock in a test). |
| Every string on a face is SPEC vocabulary | **FAIL — CR6-2.** The sweep for `client_rep`, `party_kind`, `sms_consent`, `studio_contact_id`, `project_parties`, `not_on_file`, `lapses_soon`, `opted_out`, `field_link`, `on_paper` as rendered text returns nothing, and `contactRuleClause` renders `channel_kind` tokens through `CHANNEL_WORD` rather than raw. But `companyIdentityLine` prints `studio_contacts.company_kind` verbatim — `gc`, `authority`, `photography`, `stager`, `supplier`, `maker`, `lender`, `architect` — on 11 of 21 seeded firm cards. |
| aria: no `disabled` attribute | **PASS on every act this wave authored**, with four carried exceptions. `DocumentAction` emits `disabled={unavailable && !held}` (`document-action.tsx:309`), so each `disabled={…}` paired with an identical `held={…}` lands as `aria-disabled="true"` and stays focusable: `reach-access:1038-1039`, `person-profile:371-372`, `roster-row:497-498,541-542`, `notice-log:137-138`, `party-profile-sheet:794-795,859-860,982-983`. Exceptions: `add-person-sheet:1501` (`<option disabled>`, CR6-29), `party-mini-row:190` (a raw `<button disabled>` with `disabled:opacity-50`, CR6-19), `rolodex-picker:423,593` and `roster-row:639-640` / `notice-log:138` while a mutation is pending (CR6-23). |
| `aria-expanded` pairs with a real id | **PASS.** All 17 `aria-controls` in the People/roster surfaces resolve to a rendered `id`; every panel is rendered unconditionally with `hidden`, so the target exists while collapsed. Two `aria-describedby` still dangle when the act becomes available (CR6-20), and one id is rendered that nothing points at, plus two hardcoded ids (CR6-26). |
| No `<a>` inside `<button>` | **PASS.** Every `TelLink` is an `<a>` and is always a sibling, never a descendant, of the row's own control: `person-row.tsx:201`, `roster-row.tsx:364`, `contact-rule-line.tsx:113` (inside a `<p>`, outside the row button), `site-access-card.tsx:365,547`, `reach-access.tsx:356`. `party-mini-row` renders a `<button>` whose words are `<span>`s. The company card's crew line puts `ContactRuleLine` after the `<p>` that holds the name button, not inside it. |
| One live region | **PARTIAL** (carried, CR6-21). |
| Types imported, not redefined | **PASS.** No local re-declaration of `PartyKind` / `FieldTrade` / `ReachState` / `PaperState` / `SeatStage` / `ConsentWord`. `coordination/party.ts:105` imports `PartyKind` from `@patina/types`. `use-coordination.ts:51` is an explicit re-export alias. |
| No ad-hoc fetch | **PASS.** One `fetch` in the whole changed set: `compliance-chase.ts:47` → the same-origin route `/api/people/chase-renewal`, which proves studio membership through the caller's own RLS read before enqueuing with the service role. Every other match is `refetch()`. No NestJS call outside `@patina/api-routes`. |

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
| Seat authority | `['project-party-authority']` | `.list(engagementId)`, `[…,'project',projectId]` (portal-local, nested under the root on purpose) |
| Site access card | `['project-site-access']` | `.detail(projectId)` |
| Roster (Call Sheet) | `['project-roster', projectId]` | — |
| Seats (raw) | `['project-parties', projectId]` | — |
| Field link token | `['field-links', partyId]` | a SECOND read model over the same entity as `access-grants` (CR6-11) |
| Project consent org | `['project-consent-org', projectId]` | derived scalar |
| Project recorded studio | `['project-recorded-studio', projectId]` | derived scalar |
| Contact history | `['studio-contact-history', ids]` | **a stray root** nothing invalidates (CR6-27) |

Every detail key sits under its list root, so a root invalidation reaches it.
No duplicate root, and no inline literal key in the reviewed surfaces.

Mutation fan-outs are unchanged from r5's table except that `useRevokeAccessGrant`
still stops at `accessGrantKeys.all` + `['people-directory']` +
`['people-directory-seats']` + `['project-roster']` (`use-access-grants.ts:296-307`),
and the five `use-studio-contacts` card mutations still stop at
`studioContactKeys.all` + `['people-directory']`
(`:278, :353, :380, :406, :534-538`).

---

## 3. Round 5, re-checked at HEAD

### The two assigned findings — both **FIXED**

* **CR5-1** (MAJOR, the studio guess behind two rolodex writes) — **FIXED, both
  halves.** `add-person-sheet.tsx:483-485` reads `useProjectRecordedStudio(open && projectId ? projectId : null)`
  and `:745-748` mints into `recordedStudioId`, never `organizationId`;
  `:754` prints the "This job isn't attached to a studio yet…" clause where it
  resolves NULL. `rolodex-picker.tsx:197-200` derives `canStamp`, `:315-318`
  mints into `recordedStudioId`, `:545/:553` withholds the stamp rather than
  offering it, and both `catch`es (`:288`, `:347`) now run through
  `writeErrorMessage` from the new `lib/document/write-error.ts` instead of
  `e instanceof Error`.
* **CR5-2** (MAJOR, the whole-edition revoke) — **FIXED.**
  `access-grant-list.tsx:66-76` exports `grantRevokeConsequence`, `:250-252`
  prints it above the confirm, `REVOKE_REASON_REQUIRED_PROMPT` (`:47-48`) and
  `REVOKE_REASON_MIN_LENGTH` / `REVOKE_REASON_TOO_SHORT` gate the reason
  (`:180-184`, `:262-270`), and `reach-access.tsx` passes `subjectName`.

### The twenty-one unassigned r5 minors — **every one still OPEN**

Re-read at HEAD and each confirmed present, with re-verified line numbers. They
are carried below as CR6-11 … CR6-29 with the evidence.

---

## 4. Findings

### CR6-1 · MAJOR · high confidence — `var(--hairline)` is not a token in this portal, so every hairline rule in the redesigned room draws in the text ink

`--hairline` is spent **fourteen times** across W2's own files and is **defined
nowhere in the designer portal**:

```
reach-access.tsx:345          border-t border-[var(--hairline)]   (every Channels row)
company-card.tsx:184          border-t border-[var(--hairline)]   (every Jobs row)
company-card.tsx:590          border-t border-[var(--hairline)]   (every crew line)
access-grant-list.tsx:212     border-t border-[var(--hairline)]   (every grant row)
compliance-table.tsx:86       border-t border-[var(--hairline)]   (every paper cell, 1440)
compliance-table.tsx:148      border-t border-[var(--hairline)]   (every paper stack, 390)
directory/company-row.tsx:62  border-b border-[var(--hairline)]   (every firm row)
directory/person-row.tsx:123  border-b border-[var(--hairline)]   (every person row)
directory/person-row.tsx:220  border-t border-[var(--hairline)]   (the seats panel)
views/directory-view.tsx:435  border-b border-[var(--hairline)]   (the makers lens line)
views/directory-view.tsx:462  border-y border-[var(--hairline)]   (the duplicate band, both rules)
views/directory-view.tsx:502  border-t border-[var(--hairline)]   (the list's top rule)
views/person-profile.tsx:394  border-t border-[var(--hairline)]   (every live seat row)
views/person-profile.tsx:416  border-t border-[var(--hairline)]   (every past seat row)
```

**It is new.** `git grep "var(--hairline)" origin/main -- apps/designer-portal/src`
returns nothing; `origin/main`'s `person-row.tsx:73` drew its rule with
`border-[var(--color-pearl)]`.

**It is undefined here.** A grep for `--hairline *:` over `apps/designer-portal`
and `packages/patina-design-system` (all files, node_modules and .next excluded)
returns **zero**; the only definition in the repo is
`apps/client-portal/src/app/globals.css:87` — the **client** portal. The
designer portal's house-sheet `:root` block (`globals.css:1975-2037`, PR-v's own
alias block) defines `--hairline-strong: #D8CCB8` and deliberately does not
define `--hairline`; the comment at `globals.css:637-638` says so outright —
*"The LIGHTER rule (the specimen's `--hairline`). `--rule-hair` is a full
shorthand value…"*. Nothing sets it at runtime either (`grep setProperty … |
grep -i hairline` → zero).

**What renders.** Tailwind emits the arbitrary value as a colour, not a width —
verified by running the project's own `tailwindcss` 3.4.19 over a probe:

```
$ npx tailwindcss -c <probe> -i <probe.css> -o <out.css>
.border-t                        { border-top-width: 1px }
.border-\[var\(--hairline\)\]    { border-color: var(--hairline) }
.border-\[var\(--hairline-strong\)\] { border-color: var(--hairline-strong) }
```

A `var()` reference to an undefined custom property with no fallback makes the
declaration *invalid at computed-value time*: the property computes to `unset`,
and `border-color` is not inherited, so `unset` resolves to its initial value,
**`currentColor`**. Tailwind's preflight default never gets a chance — the
utility class already won the cascade.

So the Directory's ledger rules, the duplicate band, the seats panel, the person
card's seat and past-seat rows, the company card's crew and jobs rows, every
Channels row, every access-grant row and every compliance-table row draw in the
element's own ink rather than in the house hairline. PR-q, C9 and house sheet
§A4/§A9 make the hairline ledger row the whole idiom of the redesigned
Directory; this paints it as an ink-ruled table.

Five code rounds and five QA rounds never named it: `grep -rn hairline
w2-review-r*-qa.md w2-review-r*-code.md` returns nothing.

**Fix:** spend `--hairline-strong` (the token the house sheet actually defines
for this rule) at all fourteen sites, or add `--hairline` to PR-v's alias block
in `globals.css` beside `--hairline-strong`. Do not leave it half-done: the room
must not spend two names for one rule.

---

### CR6-2 · MAJOR · high confidence — the company card's identity line prints the raw `company_kind` token on 11 of 21 firms

`apps/designer-portal/src/components/document/people/company-card.tsx:117-134`

```ts
export function companyIdentityLine(card: StudioContact, counts: …): string {
  const parts: string[] = [];
  const kind = card.company_kind ?? card.contact_kind;
  const trade = card.trades?.[0] ?? card.specialties?.[0] ?? null;
  if (trade && kind) parts.push(`${getFieldTradeLabel(trade)} ${kind}`);
  else if (kind) parts.push(kind);          // ← the raw column value
  …
```

Neither `companyKindShortLabel` nor `companyKindLabel` is called. `grep -rn
"companyKindShortLabel\|companyKindLabel\|contactCardKindLabel"
apps/designer-portal/src` returns five call sites and the company card is not
one of them.

**Evidence, from the live local seed:**

```
$ psql … "select company_name, company_kind, trades from studio_contacts
          where entity_kind='company' order by company_name"
 Ashgrove Millwork                     | maker       | {}
 Beck + Rowe Architects                | architect   | {}
 City of Minneapolis, CPED Inspections | authority   | {}
 Granite North                         | supplier    | {}
 Great Northern Bank                   | lender      | {}
 Jonah Feld Photography                | photography | {}
 Kestrel Staging                       | stager      | {}
 Lumen & Co.                           | supplier    | {}
 Marrow & Sons                         | gc          | {}
 Ostrom Builders                       | gc          | {}
 Radon Solutions North                 | sub         | {}
 … (the other ten carry a trade)
```

So opening **Marrow & Sons** — the firm SPEC §5.1 #13 fixes as
"GC · 3 on the crew · 2 open jobs" — gives a card headed
**"gc · 3 people · 2 projects"**. CPED gives "authority · 1 person · 1 project",
Jonah Feld Photography "photography · 1 person · 1 project", Great Northern Bank
"lender · 1 person · 1 project".

Two things are wrong at once. The word is the schema's, not the studio's (SPEC
§8 #3; SPEC §5.3 #1 fixes the shape as "Electrical sub · 1 person · 2
projects"), and the **same firm reads two ways two clicks apart**: the Directory
firm row that opens the card renders `companyKindShortLabel` correctly
(`people-derivation.ts:1068`) and prints "GC", so the row says GC and the card
it opens says `gc`.

This is precisely the class r2's CR-6 fixed on the Directory row — its own
docblock (`people-derivation.ts:919-925`) records that seven of twenty-one firm
rows printed a raw lowercase token and that `gc` must read "GC", not "General
Contractor" — and the company card was never brought along.

**Fix:** `companyKindShortLabel(kind)` in both branches of
`companyIdentityLine`, so the card and the row that opens it print one word.

---

### CR6-3 · MAJOR · high confidence (carried, r1 CR-45, never assigned) — the site access card offers a free-text field labelled "The way in", directly above "The code is held off Patina"

`apps/designer-portal/src/components/document/roster/site-access-card.tsx:505-526`

```tsx
<section>
  <h3 className={REGION_HEAD}>The way in</h3>
  <EditableLine
    label="The way in"                    // ← the region's own name
    fieldId="site-access-way-in"
    value={card.lockbox_version ?? ''}
    empty="No lockbox on file."
    onSave={(next) => save({ projectId, lockboxVersion: next }, 'way_in')}
  />
  <p className={`mt-1 ${LINE}`} data-way-in>
    {wayInSentence(card.lockbox_version, gate ?? keyHolder?.name)}
  </p>
```

PR-r is a hard ruling: "Store the lockbox version, the key holder, the hours, and
who was told. **Hold the code itself off Patina** and print that the code is held
off Patina." The schema honours it — there is no code column anywhere
(`grep -rni "gate_code\|lockbox_code\|alarm_code\|gateCode\|lockboxCode\|alarmCode"
apps packages` → zero hits) and `UpdateSiteAccessCardInput` carries
`lockboxVersion` / `alarmRef` only.

The **face** does not. A studio opening "The way in" is shown one open text
field carrying the region's own name, with no hint that the column behind it is
a *version*, and its value is printed verbatim as the first half of the sentence
directly beneath — `wayInSentence` composes `"${version}. The code is held off
Patina; ask ${ask}."`. A studio that types "Lockbox on the back gate, 4417"
gets exactly that printed on the card, under a sentence promising the code is
held off Patina, with nothing anywhere refusing or warning.

r1 raised this as CR-45 with the one-line fix — *"A label naming the version
would close it"* — and it was never assigned in r1, r2, r3, r4 or r5.

I am grading it **major** rather than blocking because the stored column is a
version and the brief's blocking clause names "a site access code field"; the
schema has none. It is a face-level hazard around the ruling that matters most
on this card, and it has now survived five rounds.

**Fix:** label the control "Lockbox version" (and the empty state "No lockbox
version on file."), with the region head "The way in" left as the region's name.
Optionally refuse a value that looks like digits with no other words.

---

### CR6-4 · MINOR · high confidence (carried, CR3-13; extended) — the Directory seats panel names a project the Directory does not have, and says it while the seats are still loading

`apps/designer-portal/src/components/document/people/directory/person-row.tsx:225-229`

```tsx
{seatsOpen && (seats ?? []).length === 0 && (
  <li className="t-body-sm py-2 text-[var(--ink-subtle)]">
    No open seat on this project.
  </li>
)}
```

R-V fixes that exact string for the person card's R4 region, which is scoped to
one project. The Directory is the studio's cross-project ledger; there is no
"this project". r3 raised this (CR3-13) and r4/r5 carried it.

What is new: the branch is not only reachable on an R-BG divergence, it is
reachable on **every single open**. `usePeopleSeats({ personId: seatsOpen ?
person.person_id : null })` (`:66-68`) is `enabled: false` while the panel is
closed, so `data` is `undefined` on the first render after the toggle and the
panel prints "No open seat on this project." until the round trip lands —
directly beneath a disclosure button that says "2 seats", because the branch is
only rendered when `seat_count > 0` (`:205`). Two statements that contradict
each other, one pixel apart, on every expand.

**Fix:** print the sentence only when the query has settled, and give the
Directory its own wording ("No seats on the book yet.") so R-V's sentence stays
on the card.

---

### CR6-5 · MINOR · high confidence (carried, CR5-10) — `openPersonLabel` is exported, used nowhere, and the control it describes names only the person

`apps/designer-portal/src/components/document/people/directory/person-row.tsx:51-55` defines and
exports `openPersonLabel(person)` → `"<name>, <identity line>"`. `grep -rn
"openPersonLabel" apps/designer-portal/src` returns that line and nothing else.
The rendered control (`:130-137`) carries the bare `{person.display_name}` as
its accessible name, while SPEC §7 #6 describes an open-person button "whose
accessible name is the person's name **and role summary** only". Either wire the
helper or delete it; a helper that exists and is bypassed reads as the rule
being applied when it is not.

---

### CR6-6 · MINOR · high confidence (carried, CR3-12) — the person card's History counts seats and prints them as projects

`apps/designer-portal/src/components/document/people/views/person-profile.tsx:494-500`

```tsx
{`Worked ${person.seat_count ?? 0} of the studio's ${
  (person.seat_count ?? 0) === 1 ? "projects" : "projects"
}.`}
```

Two defects in three lines. The plural ternary has the same word on both
branches — dead code. And `seat_count` is `identity_seat_count()`, which is
`count(*)` over `project_parties`, not a distinct-project count
(`00626_people_directory_v4_seats.sql:709-740`) — R-BG fixes it as "counts
exactly the seats `people_directory_seats` nests". A person holding two seats on
one job (the fixture itself contemplates one: SPEC §3's head note says "F-28 is
F-08's second seat") would have their card claim a project they never worked.

Confidence in the code is high; the divergence is currently **latent** — on the
live seed no identity holds two seats on one project:

```
$ psql … group by party_identity_key(...) having count(*) <> count(distinct project_id)
(0 rows)
```

**Fix:** either count distinct `project_id` over the identity's seats, or change
the sentence to name seats.

---

### CR6-7 · MINOR · high confidence — the company card's Jobs region prints nothing at all for a firm with crew but no live seats

`apps/designer-portal/src/components/document/people/company-card.tsx:900-920`

```tsx
{crew.length === 0 ? (
  <p …>{NO_JOBS_SENTENCE}</p>          // "Not on a job yet."
) : (
  <ul …>{crew.map((a) => <CrewJobs seats={seatsByPerson.get(a.person_id) ?? []} … />)}</ul>
)}
```

`CrewJobs` returns `null` when its seats array is empty (`:177`). So a firm that
has affiliations but no open seats renders the "Jobs" heading, an empty `<ul>`,
and the money-book line — a region that states nothing. The fallback sentence is
gated on `crew.length`, which is the wrong question: the region is about seats,
not people. C32's ruling is explicit — "a region that vanishes reads as an
oversight; a region that says 'none on file' reads as a fact" — and the person
card next door follows it correctly for both `liveSeats` and `pastSeats`.

**Fix:** gate `NO_JOBS_SENTENCE` on the flattened seat count, not on `crew.length`.

---

### CR6-8 · MINOR · high confidence (carried, CR5-7 / CR-8) — PR-n's face gate still reads the book's studio while the policy reads the job's, and the right resolver is now eight lines below it

`apps/designer-portal/src/components/document/people/directory/add-person-sheet.tsx:446-450`

```ts
const isOrgAdmin = useMemo(() => {
  const role = (orgs ?? []).find((o) => o.id === organizationId)?.membership?.role;
  return role === "owner" || role === "admin";
}, [orgs, organizationId]);
```

`organizationId` is the studio that holds the **book**; the four
`project_party_authority_studio_*` policies gate the admin-only scopes on
`project_party_recorded_studio(engagement_id)` — the studio that records the
**job**. On a job whose recorded studio is not the book's, the face offers a
money or draw-certify scope the database will refuse, or refuses one the
designer may in fact grant.

What makes it worth re-raising: CR5-1's fix introduced
`useProjectRecordedStudio` into **this same file**, at `:483-485`, thirty-three
lines below `isOrgAdmin`. The fix is now one identifier.

---

### CR6-9 · MINOR · medium confidence — the company card lists the doors its *people* hold, and prints a reach-family word SPEC §5.3 #9 bars from the card

`apps/designer-portal/src/components/document/people/company-card.tsx:704-710`

```tsx
<ReachAccess cardId={card.id} cardKind="company" …
  grantSubjectIds={firmSeatIds}     // every seat of every crew member
```

Direction §5.1's company variant says "Access grants lists **firm-scoped tokens
only**". `firmSeatIds` (`:329-332`) is every `seat_id` of every crew member, so
the firm's card renders their personal grants; `grantRowParts` prints
`ACCESS_GRANT_TIER_LABELS['field_link']` = **"Field link"**, one of the three
reach words, on a card SPEC §5.3 #9 says carries "no consent word and no reach
word anywhere". The consent half is correctly withheld (`showConsent={isPerson}`).

Medium confidence because a tier label is arguably a different vocabulary from a
`StateWord` in the reach family — but it is the same three words, on the one
surface the rule names.

---

### CR6-10 · MINOR · medium confidence — the company card asserts a payee that may never have been recorded, and the Payee region has no "none on file" fallback

`apps/designer-portal/src/components/document/people/company-card.tsx:806-808`

```tsx
<p className="t-body-sm text-[var(--ink)]">Remit to {card.remit_to ?? name}</p>
```

With `remit_to` NULL the card prints "Remit to Northgate Electric" as a recorded
fact. Direction §1 line 5 makes the company card the only writer of a payee
identity, and §3.3 R4's source is `E2.remit_to`; a fallback to the firm's own
name states something the studio never wrote. Every other absent record in this
build prints its own sentence (R-V / C32); the Payee region is the one that
invents. The tax id and the retainage are correctly conditional.

---

### CR6-11 · MINOR · high confidence (carried, CR5-3) — revoking a grant from the person card leaves the party sheet's link read stale

`packages/supabase/src/hooks/use-access-grants.ts:296-307` invalidates
`accessGrantKeys.all`, `['people-directory']`, `['people-directory-seats']` and
`['project-roster']` — not `partySmsKeys.links(partyId)`. `useRevokeFieldLink`
does. Two doors onto one token, two answers.

---

### CR6-12 · MINOR · high confidence (carried, CR5-4) — minting from the party sheet does not move the Call Sheet behind it

`apps/designer-portal/src/components/document/people/party-profile-sheet.tsx:491` —
`createLink.mutateAsync({ partyId })`. `projectId` is omitted, so
`useCreateFieldLink`'s `['project-roster', projectId]` leg is skipped;
`seatProjectId` is in scope at `:233` and IS passed to the revoke twenty-six
lines later (`:514-518`). The roster row behind the open sheet keeps printing
reach `On paper` for a door that is now open.

---

### CR6-13 · MINOR · high confidence (carried, CR5-5) — a retired flag still has a live mock and eight branch-setting tests

`apps/designer-portal/src/components/document/command-bar.test.tsx:61, 65, 114` and the eight
`mockCallSheetFlag = true` assignments. The file is byte-identical to
`origin/main`; `command-bar.tsx` reads no `call-sheet` flag any more, so those
assertions now pass for a different reason than they were written for. w2c's
list of 14 retired consumers does not name this file.

---

### CR6-14 · MINOR · medium confidence (carried, CR5-8) — the server-side delete guard asks a narrower paper question than the face, and fails open on an unreadable read

`packages/supabase/src/hooks/use-coordination.ts:936-945`. `hasComplianceDocument`
reads only `studio_compliance_documents WHERE holder_id = <the card>`, while the
face's `roster-row.tsx:242-246` uses `row.paper`, which is
`identity_paper_state(studio_contact_id, COALESCE(seat.company_id, card.company_id))`
— worst-first over the person AND their firm (R-BA / R-BJ). A seat whose only
held paper is the firm's lapsed COI is refused by the face and permitted by the
hook. Separately, an RLS-refused read returns `[]` rather than raising, so the
guard reads "no paper held". The hook is the guard that exists for when the UI
is bypassed.

---

### CR6-15 · MINOR · high confidence (carried, CR5-6) — five card mutations move the identity read model but not the seats one

`packages/supabase/src/hooks/use-studio-contacts.ts:277-278, 352-353, 379-380,
405-406, 534-538`. `people_directory_seats` carries `display_name`,
`company_name`, `phone_e164`, `studio_contact_id`, `consent_status`,
`reach_state`, `paper_state`, `contact_rule_summary`, `warranty_until` — every
one of which a card edit can move — and `usePromoteToStudioContact` writes the
column that decides a seat's whole identity fold. Every other card-adjacent
fan-out in this wave invalidates both roots.

---

### CR6-16 · MINOR · medium confidence (carried, CR5-7) — two Call Sheet reads still resolve a tenant question with something other than the project's studio

`call-sheet.tsx:98` → `roster-groups.tsx:67-69` (`useProjectConsentOrg(projectId)`
feeding `useStudioContacts(consentOrg)`; on a studio-less project the read comes
back empty, `peopleById` is empty, `contactRouteTarget` returns `null`, and SPEC
§5.4 #12 / R-L's routed line prints "Write Rosa Delgado…" with no email and no
`tel:`), and `rolodex-picker.tsx:179-184` (the picker's `organizationId` is a
"which org holds the most cards" tally, so the search scope can offer cards the
guard would refuse — the *stamp* is now correctly gated by CR5-1's fix, the
search scope is not).

---

### CR6-17 · MINOR · high confidence (carried, CR5-9) — four dead `useFeatureFlag` imports and two flag-shaped parameters survive the retirement

Imports referenced nowhere in their own file: `mobile/mobile-bar.tsx:20`,
`mobile/mobile-sheets.tsx:54`, `letterhead-instruments.tsx:31`,
`coordination/item-composer.tsx:48`.

Two flag parameters remain in `lib/document`:
`lens-ladder-derivation.ts:636-644` (`callSheetEnabled?: boolean`, with a
docblock that still describes the flag as live — *"with the flag off nothing
mounts the overlay"* — and a live branch at `:689`), and `shelves.ts:95-120`.
`shelvesFor` has no production caller at all. `doc/[id]/page.tsx:2028` now
hard-codes `callSheetEnabled: true` with a comment naming rulings §6, and
`:813`'s projectless path passes `false` where `hasProject(input)` already
answers false — correct behaviour, dead scaffolding.

---

### CR6-18 · MINOR · high confidence (carried, CR5-21) — every drafted chase reads "for a current certificate"

`apps/designer-portal/src/components/document/people/company-card.tsx:765-767` —
`documentId: docs[0]?.id ?? null, documentLabel: docs[0] ? null : "a current certificate"`.
The label is `null` exactly when a document exists, and the route falls back to
the same literal, so both branches produce one string and the draft never names
the paper being chased.

---

### CR6-19 · MINOR · medium confidence (carried, CR5-11) — a mini row uses the `disabled` attribute and opacity to express a state

`apps/designer-portal/src/components/document/roster/party-mini-row.tsx:186-196` —
`<button … disabled={disabled} className="… disabled:opacity-50 …">`. Both the
attribute (SPEC §7 #4, direction §5.5) and opacity-as-state (SPEC §8 #5) are
named forbidden. `rolodex-picker.tsx:423` passes `disabled={addParty.isPending}`
so it is transient, but `party-mini-row.tsx` is in this wave's changed set.

---

### CR6-20 · MINOR · high confidence (carried, CR5-12) — two `aria-describedby` references dangle once the act becomes available

`roster-row.tsx:641` sets `aria-describedby={`${panelId}-send-held`}`
unconditionally while the `<p id=…>` renders only `{!body.trim() && …}`
(`:653-660`). `notice-log.tsx:139` sets `aria-describedby={heldId}`
unconditionally while `<p id={heldId}>` renders only `{picked.length === 0 && …}`.
`roster-row.tsx:499` and `:543` already do it conditionally, in the same file.

---

### CR6-21 · MINOR · medium confidence (carried, CR5-13) — more than one live region can be live on one screen

`people-room.tsx:561` is the Room's announcer (the only one carrying
`aria-live="polite"`). Seven other `role="status"` survive in the room's own
surfaces: `directory-view.tsx:364`, `call-sheet.tsx:206`, `roster-row.tsx:666`,
`project-team-roster.tsx:94`, `rolodex-picker.tsx:448`,
`rolodex-seed-sheet.tsx:208`, `room-shell.tsx:171`. SPEC §7 #3 asks for exactly
one.

---

### CR6-22 · MINOR · medium confidence (carried, CR5-14) — an emergency line with no name is silently deleted by any unrelated edit to the list

`site-access-card.tsx:246-255` — `storedLines()` is the round-trip shape for
every write to `emergency_lines` and it `.filter((line) => !!line?.name)`, so
adding or removing one line rewrites the array without any stored line carrying
a phone and a role but no name. The add form refuses a nameless line, but the
seed and any import can write one, and the card's own render hides them, so the
loss is invisible.

---

### CR6-23 · MINOR · low confidence (carried, CR5-17) — three acts emit a real `disabled` while their mutation is in flight

`roster-row.tsx:639-640` (`held={!body.trim()}`, `disabled={!body.trim() ||
sendSms.isPending}`), `notice-log.tsx:137-138` (`held={picked.length === 0}`,
`disabled={picked.length === 0 || logTold.isPending}`) and
`rolodex-picker.tsx:593` (`disabled` with no `held` at all). With the held
condition false and a mutation pending, `DocumentAction` emits the native
`disabled` (`document-action.tsx:309`), which SPEC §7 #4 forbids outright.
Transient, and `loading` is also set.

---

### CR6-24 · MINOR · low confidence (carried, CR5-15) — a seat line is a control well under the room's own 44px floor

`seat-line.tsx:88-101` — `py-[6px]` around an 11px `.t-meta` span, roughly 28px
tall, while every other control in the room carries `min-h-11`
(`person-row.tsx:134, 209`, `TelLink`'s `min-h-[44px]`, the chips, the
disclosures). SPEC §6.2's Targets rule names the row's open control and the
`tel:` link and does not name the seat line — but R-AA makes the seat line a
door, and the company card and the person card both mount it too.

---

### CR6-25 · MINOR · low confidence (carried, CR5-16) — `new Date()` is read during render on every roster row

`roster-row.tsx:184` (`doc.expires_on < new Date().toISOString().slice(0,10)`)
and `:264` (`grantWindowEnd(row.onSiteTo, row.warrantyUntil, new Date())`),
against the room's own convention (`people-room.tsx:137`, `company-card.tsx`,
`person-profile.tsx`, all `useMemo(() => new Date(), [])`).

---

### CR6-26 · MINOR · high confidence (carried, CR5-20) — one id nothing points at, and two hardcoded ids where `useId` is the file's own pattern

`reach-access.tsx:1021` renders `<p id={mintBandId}>` and no `aria-describedby`
names it (the mint act points at `mintReasonId`). `site-access-card.tsx:403` and
`:565` hardcode `aria-controls="site-access-emergency-lines"` /
`"site-access-key-holder"` while every other disclosure in this wave uses
`useId()`; two site access cards on one document would collide.

---

### CR6-27 · MINOR · medium confidence (carried, CR5-22) — a second root over card/seat data that nothing invalidates

`use-studio-contacts.ts:445` keys `useStudioContactHistory` at
`['studio-contact-history', ids]`, outside `studioContactKeys`. It reads
`project_parties` and feeds the picker's history line, yet no seat or card
mutation invalidates it — `useAddProjectParty`, `useCloseProjectPartySeat` and
`usePromoteToStudioContact` all move the rows it counts.

---

### CR6-28 · MINOR · high confidence (carried, CR5-19) — three docblocks describe behaviour the code no longer has

* `contact-rule-line.tsx:10-12` ("A HARD BLOCK — a rule that forbids a channel
  outright") and `:46-48` ("True when the rule forbids a channel outright") are
  the pre-R-BL reading; the shipped predicate is do-not-contact **or** a route.
* `contact-rule.ts:95-103` still says "Two rows (F-10 Sam Rowe, F-13 Ingrid
  Halvorsen) therefore wear a rule the fixture marks `false`". Under the shipped
  predicate neither does — their seeded rows are `forbidden={sms}` /
  `{sms,mobile}` with no route, so `contactRuleIsHardBlock` is false for both.
  The live divergence runs the other way: F-26 Carol Nyström and F-27 Ray Thao
  are `block: true` in SPEC §3 and print no leading rule. CR3-23's orchestrator
  ruling is still owed, and the comment should describe the divergence that
  exists.
* `people-events.ts:4` says "Eight events"; `PEOPLE_EVENT_NAMES` defines nine.

---

### CR6-29 · MINOR · low confidence (carried, CR3-18) — `<option disabled>`

`add-person-sheet.tsx:1501` — `disabled={!isOrgAdmin && isAdminOnlyAuthorityScope(scope)}`
on an `<option>`. SPEC §7 #4's ban is written for the specimen files and an
`<option>` has no `aria-disabled` equivalent, which is why this is low
confidence; recorded because it is the one surviving literal `disabled`
attribute on an interactive element in the People surfaces.

---

### CR6-30 · MINOR · medium confidence — `--color-linen` is undefined too, and two of its three sites are W2-touched lines

`grep -rn -- "--color-linen *:"` across `apps` and `packages` returns **zero**.
It is spent at `party-profile-sheet.tsx:908`, `add-person-sheet.tsx:1580` and
`directory/letter-line-field.tsx:191`, always as `bg-[var(--color-linen)]/45`.
Unlike CR6-1 this is **pre-existing** — all three lines exist on `origin/main` —
so the 45%-opacity tint has always resolved to nothing and the band has always
painted on the parent's ground. Recorded because the brief asks for the sweep
and because whoever fixes CR6-1 will be in the same file.

---

### CR6-31 · MINOR · medium confidence — a held channel's reason names an address whatever kind of line it is

`reach-access.tsx:96-110` keys `heldChannelReason` on `channel.status` alone, so
a **phone** line marked `bounced` prints "This address bounced back, 12 March
2026. Texts and calls still reach them." on a row whose value is a phone number.
`unsubscribed` has the mirror problem in reverse ("They unsubscribed… Calls
still reach them." on an email row reads correctly; on a phone row it is the
wrong promise). The kind is already in hand — `isPhoneChannel(channel.channel_kind)`
is called four lines away at `:352`.

---

### CR6-32 · MINOR · low confidence — the lapse boundary is computed in UTC

`compliance-table.tsx:53-63` — `documentPaperState` compares
`Date.parse(`${doc.expires_on}T00:00:00Z`)` against
`Date.parse(`${today.toISOString().slice(0,10)}T00:00:00Z`)`. West of UTC,
`today.toISOString()` rolls to tomorrow after 18:00 local, so a certificate
expiring today reads `lapsed` from six in the evening. The room's own date
helpers (`formatSeatDate`, `formatLongDate`, `rosterDateKey`) all take pains to
read a DATE column by parts for exactly this reason.

---

### CR6-33 · MINOR · low confidence — two `authorityPhrase` implementations, two punctuations for one fact

`roster-derivation.ts:1024-1045` joins its phrases with `". "` and appends a
final `"."`; `person-profile.tsx:87-97` returns each phrase bare and the caller
joins with `" · "`. So the same grant reads "Selections." on the Call Sheet and
"Selections" on the person card, and a two-scope seat reads "Signs money to
$2,500. Prepares only." on one and "Signs money to $2,500 · Prepares only" on
the other. R-Q's principle — one fact, one wording, wherever it surfaces —
applies to authority as much as to consent.

---

### CR6-34 · MINOR · low confidence — the company card's identity line spells its warranty date long where SPEC spells it short

`company-card.tsx:132` uses `formatLongDate` → "warranty through 21 November
2026"; SPEC §5.3 #1 fixes the line as "warranty through 21 Nov 2026", and R-U's
own fold ("Changed 16 Oct 2026") and every seat line use the short form. This is
the month-form question r4's carry-forward list already flagged as owed to the
orchestrator; recorded here with the one call site that takes the long form
inside a scanned line rather than a read sentence.

---

### CR6-35 · MINOR · low confidence (carried, r1 CR-47) — two searchers over one book, and they disagree

`use-people.ts:262-276`'s in-memory search matches name, email and phone digits
only, while its own `PeopleFilters.search` docblock and direction §3.1 also name
firm and trade. The Directory does not use it — `directoryEntryMatches`
(`people-derivation.ts:1018-1039`) is the real matcher and does match firm,
trade and the party-kind word — so the command bar reads the narrower one and
finds fewer people than the room does for the same string.

---

### CR6-36 · MINOR · low confidence — two dead ternaries where both branches are the same string

`person-profile.tsx:495-497` (`=== 1 ? "projects" : "projects"`, see CR6-6) and
`add-person-sheet.tsx:1650-1652` (`partyName.trim() ? "them" : "them"`). Neither
changes output; both read as a plural or a pronoun that was meant to vary and
does not.

---

## 5. What this review did not cover

The visual and behavioural walk at 1440 and 390 (the QA reviewer owns 3000/3002
— and CR6-1 is exactly the kind of finding a computed-style probe on that walk
would confirm in one line), the Playwright specs under `e2e/people` (not run —
no port taken), the iOS surfaces under `apps/mobile/Capture`, the W1 migrations
beyond the functions, policies and triggers named above, the dev seed beyond the
reads quoted, and the Sanity help articles.
