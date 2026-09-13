# W2 — fix log, round 2

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. Scope: the 25 findings named in the
round-2 briefs (`w2-review-r2-qa.md` QA‑R2‑1..7 and 9, `w2-review-r2-code.md`
CR‑1..16). Nothing else. No dev server started, no port taken, no prod touched.
Local DB (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`) read-only,
as `designer@patina.dev` through `set_config('request.jwt.claims', …)`.

## Gates, run here after the changes

```
$ pnpm --dir <worktree> --filter @patina/designer-portal type-check   → tsc --noEmit, EXIT 0
    (with `.next/types/**` present on disk — the condition CR-1 says made it fail)
$ pnpm --dir <worktree> --filter @patina/supabase type-check          → EXIT 0
$ pnpm --dir <worktree> --filter @patina/admin-portal build           → EXIT 0, full route table
$ cd apps/designer-portal && npx jest --silent
    Test Suites: 584 passed, 584 total
    Tests:       7398 passed, 7398 total     (7390 before; +8 new pins)
$ cd packages/supabase && npx vitest run src/hooks/__tests__
    Test Files 88 passed · Tests 1163 passed | 12 skipped
$ cd apps/designer-portal && npx eslint <changed people/roster/lib/api dirs>
    ✖ 4 problems (0 errors, 4 warnings)  — all pre-existing
```

---

## The one ruling this round had to make: CR-16

CR-16 is a spec-vs-ruling conflict the reviewer declined to resolve. Resolved
here by **splitting one overloaded predicate into the two facts the sources are
actually describing**, in `lib/document/contact-rule.ts`:

* **`contactRuleIsHardBlock(rule)` — any forbidden channel.** This is the fact
  that earns the 2px `--terracotta-ink` leading rule. SPEC §5.1 #11 names Ray
  Thao's row (`forbidden={sms}`, office and the 311 portal wide open) as
  carrying it; SPEC §3's fixture marks F‑15, F‑26 and F‑27 `block: true`; and
  `contact-rule-line.tsx`'s own module doc already said "a rule that forbids a
  channel outright". The r1 narrow reading contradicted all three.
* **`contactRuleIsDoNotContact(rule)` — no direct channel left open.** This is
  direction §5.4's Channels-region STATE ("`channels_forbidden` covers every
  channel" → collapse to one line and route somewhere reachable), and it is
  what takes a person's own number off a row (SPEC §5.1 #10). Computed over
  `sms · mobile · office · email` — `dispatch`, `after_hours` and `ap_email`
  are a firm's lines and `portal_311` is a municipal portal, so naming them
  bars nothing further. Frank Bauer's seeded rule (all seven) → true; Dana
  Kowalski's `{email}` → false; Ray Thao's `{sms}` → false; Ingrid Halvorsen's
  `{sms,mobile}` → false (office and email still open).

Both answers now come from one module, so the Directory row, the roster row,
the person card, the company card's crew line and the picker's mini row all
read the same two facts (R‑S / C29 satisfied, CR‑4 closed).

Consequence, deliberate: Ray Thao, Carol Nyström, Ingrid Halvorsen and Sam Rowe
now wear the leading rule **everywhere** (they wore it on the card and in the
picker only), and they **keep** their `tel:` links (they lost them nowhere,
because the phone suppression moved to the narrower predicate). Frank Bauer's
number stays off every row.

---

## QA‑R2‑1 — the rolodex read resolved to the wrong studio

`people-room.tsx` resolved `organizationId` as
`orgs?.find(o => o.type === 'design_studio')?.id` — a first match over an
unordered `organization_members` read. `designer@patina.dev` holds active
membership in two `design_studio` orgs and all 49 `studio_contacts` rows sit
under one of them.

**Changed**

* `lib/document/people-derivation.ts` — new `directoryRolodexOrgId(rows)`:
  tallies `meta.organization_id` across the directory rows already in hand and
  returns the org that actually holds the cards, ties broken by id so the
  answer never moves between renders. (`people_directory`'s contacts branch
  carries the column — confirmed against `pg_get_viewdef`, line 213.)
* `people-room.tsx:140-160` — `organizationId = directoryRolodexOrgId(all) ??
  memberOrgId`, and `memberOrgId` itself now sorts the membership list before
  matching, so even the fallback is deterministic.
* `views/directory-view.tsx` — derives its own `rolodexOrgId` from its own rows
  and feeds `useStudioContacts` and `useChannelConsentRecords` with it, so the
  payee markers and the routed-channel index can never be scoped to an org the
  rows do not belong to.
* `company-card.tsx` — `cardOrgId = card.organization_id ?? organizationId`.
  A firm's crew are by definition cards in the firm's own studio, so the crew
  names, the payee name and the Jobs names read the firm's own org. Also used
  for `RecordDocumentSheet` and (as `card.organization_id`) for the chase.
* `views/person-profile.tsx` — same `cardOrgId` shape, used for the rolodex
  read, `ReachAccess` and `RecordDocumentSheet`.

**Evidence** `meta.organization_id` present on every contacts-branch row
(`pg_get_viewdef('people_directory')` line 213). Jest: `directory-scope`,
`company-card`, `person-profile` suites green.

**Not changed, flagged:** `directory/add-person-sheet.tsx:245` and
`roster/rolodex-picker.tsx:157` still carry the same `.find()`. They were not
named in the finding; the same helper is now available if the orchestrator
wants them swept.

## QA‑R2‑2 — every firm row printed "0 open jobs"

`firmCounts` counted `row.project_id` over Directory rows; 00626 moved every
carded human onto the contacts branch, whose `project_id` is hard-coded
`NULL::uuid`.

**Changed** `views/directory-view.tsx` — crew still counts the rows in hand;
open jobs now come from `usePeopleSeats({ all: true })`, filtered to
`seat.company_id` and `!seatIsDone(seat.stage)`.
`packages/supabase/src/hooks/use-people.ts` — `PeopleSeatFilters.all`, and the
query is enabled on it (RLS already narrows the read; `people_directory_seats`
carries `company_id`).

**Evidence** DB: Northgate Electric's two seats carry
`company_id = d0e20000-…-0003` and `person_id = d0e10000-…-0011`; stages
`active` and `warranty`, so the row now reads **1 open job**, not 0. New pin in
`directory-scope.test.tsx` ("counts the crew off its rows and the open jobs off
the seats") with a closed seat as the negative control.

## QA‑R2‑3 / CR‑10 — the person card could not route, and could not be routed

`views/person-profile.tsx` mounted `ReachAccess` with neither `routeTo` nor
`routeCandidates`, so Frank Bauer's card printed "Do not contact directly."
with no way to reach Rosa Delgado, and the "Write someone else instead" select
offered only "Nobody". Leah task 4 had no home.

**Changed** `person-profile.tsx` now builds the same pair of reads
`directory-view.tsx` and `roster-groups.tsx` already build — `useContactRules()`
+ `useStudioContactChannelsFor(routedIds)` over a `peopleById` index off the
firm-scoped rolodex — and passes `routeTo={contactRouteTarget(...)}` and
`routeCandidates` (every other person card in the studio, sorted by name). All
hooks sit above both early returns (verified: hooks end line 231, the `maker`
return is line 235).

## QA‑R2‑4 / CR‑5 — raw schema tokens on two faces

**(a) the person card.** `reach-access.tsx` composed its own `ruleSummary`,
unconditionally prepending `Never ${forbidden…}` through
`CONTACT_CHANNEL_KIND_LABELS` (which has no `sms` key) ahead of the studio's
own reason. Replaced with `contactRuleClause(rule)` — the shared composer r1's
CR‑6 introduced — plus the card's own "Set <date>." stamp (direction §3.2 R3).
The private composer is deleted.

**(b) the picker.** `roster/rolodex-picker.tsx:374` passed
`people_directory.contact_rule_summary` — the mechanical clause list in raw
tokens — straight into `PartyMiniRow`. It now reads the rule ROW
(`useContactRules()` + `indexContactRules`) and passes
`contactRuleClause(rule)` and `contactRuleIsHardBlock(rule)`.

`party-mini-row.tsx` takes a `ruleBlocked` prop and its regex over rendered
prose (CR‑4's fourth answer, the shape CR‑22 deleted) is gone.

**Evidence** `contact-rule.test.ts` pins `contactRuleClause` on Frank's and
Ray's seeded rows and asserts no `after_hours|ap_email|portal_311` survives;
`rolodex-picker.test.tsx`'s mock now serves a rule row whose
`contact_rule_summary` is deliberately full of schema words, and the suite's
"carries the words that travel, and the rule as a sentence" assertion passes
against the composed clause instead.

## QA‑R2‑5 — the consent checkbox answered to "Project"

`add-person-sheet.tsx` wrapped the checkbox and a full paragraph — including
"They agreed to Patina **project** texts" — in one `<label>`, so the box's
accessible name contained "project" and `getByLabel('Project')` resolved to two
elements.

**Changed** the checkbox gets its own short `<label htmlFor>` ("They gave prior
express consent for text updates") and the disclosure moves outside it as
`aria-describedby` — the pattern R‑W already set for the company card's crew
line.

**Evidence** `awk '/<label/,/<\/label>/' add-person-sheet.tsx | grep -i project`
now returns exactly one hit: the real Project select's own label.

**Flagged, NOT fixed (out of scope, and a genuine spec conflict):**
`add-sheet.spec.ts:76-80` polls `channels_forbidden` and asserts
`toContain("email")`, but r1's CR‑21 fix deliberately made the sheet write
`channelsForbidden: []` ("nothing is inferred"). That test will still fail
after this a11y fix, for a second, independent reason. One of the two has to
move and it is not this round's call.

## QA‑R2‑6 — call-sheet task 6 raced the fetch

Confirmed by reading the mount rather than by network instrumentation:
`call-sheet.tsx:84-93` passes `enabled: open` to `useCallSheetRoster`,
`useProjectConsentOrg` and `useSiteAccessSummary`, so every read STARTS when
the sheet opens, while the heading the helper waits on (`Call sheet ·
Okonkwo residence`) is static markup that satisfies its assertion immediately.
The bands then had the default 5s budget to cover a cold round trip.

**Changed** `e2e/people/call-sheet.spec.ts`'s `openTheCallSheet` now gates on
`[data-roster-band]` with a 30s web-first expect (no `waitForTimeout`), so both
specs wait on the thing they are about to assert.

## QA‑R2‑7 — the person card and the company card disagreed about one COI

**Evidence first.** `compliance_state('d0e10000-…-0011')` → `not_on_file`;
`identity_paper_state(card, company)` → `lapsed`;
`compliance_state(northgate)` → `lapsed`. Dana is `is_sole_proprietor = t`.
The card read the first; the Directory row, the seat line and Northgate's own
card read the second.

**Changed** `person-profile.tsx` R5 now reads the firm's documents alongside her
own (`useComplianceDocuments({ holderId: company_id })`, merged for a sole
proprietor per direction §3.2 R5) and prints
`person.paper_state ?? ownPaperState ?? "not_on_file"` — `person.paper_state`
IS `identity_paper_state(sc.id, sc.company_id)` on the contacts branch
(`pg_get_viewdef` line 220), so the two surfaces now answer from one formula
(R‑BA).

## QA‑R2‑9 — a company-only bid minted a phantom person

**Evidence.** `project_parties d0e30000-…-091`: `display_name` and
`company_name` both "Rivera Finishes", `studio_contact_id` NULL, `profile_id`
NULL, `stage = no_response`. `party_identity_key`'s COALESCE chain falls
through to the row's own id, and `people_directory` returns it as a person-band
row beside the firm's own contacts row.

**Changed** `people-derivation.ts` — `directoryEntryIsCompanyOnlySeat()` and
`directoryIdentityRows()`, applied in `directory-view.tsx`'s `rows` memo and in
`people-room.tsx`'s head count. Such an engagement reaches the studio through
the firm's row and the Call Sheet's Bidding/Done bands (which read the roster,
not this view), which is where it belongs.

**Negative control.** The same predicate as SQL over the whole seeded directory
returns exactly one row — Rivera Finishes. No real person is dropped. New pin
in `directory-scope.test.tsx`.

## CR‑1 — the type-check gate failed

`route.ts` exported `COMPLIANCE_CHASE_TASK_TYPE`; the App Router validator in
`.next/types` rejects any export but the handlers and the config set.

**Changed** the literal moves to a new plain module
`src/lib/document/compliance-chase-task.ts` (no `use client`, importable from
both sides); the route imports it and `compliance-chase.ts` re-exports it, so
there is one literal rather than two.

**Evidence** `.next/types/app/api/people/chase-renewal/route.ts` exists on disk
and `pnpm --filter @patina/designer-portal type-check` exits 0.

## CR‑2 — the Access grants region could never show a grant

`useAccessGrants({ subjectId: cardId })` asked `v_access_grants` for a rolodex
CARD id; the view's `subject_id` is an engagement id (`field_link`) or a
profile id (`client_account`, `studio_member`).

**Changed** `AccessGrantFilters.subjectIds` (a `.in('subject_id', …)` leg, with
`enabled` widened to cover it) in `packages/supabase/src/hooks/use-access-grants.ts`;
`ReachAccess` takes a `grantSubjectIds` prop; `person-profile.tsx` passes the
identity's seat ids ∪ its `profile_id`; `company-card.tsx` passes its crew's
seat ids. Revoke (direction §5.3, SPEC §5.2 #6) now has a reachable call site.

## CR‑3 — "Edit the rule" → "Save the rule" destroyed the rule

Three separate holes, all closed in `reach-access.tsx`:

1. **The editor is seeded** from the loaded rule when the band opens — a `useRef`
   keyed on the rule's own id, so a background refetch cannot clobber typing,
   and the seed is dropped when the band closes.
2. **The channels the two checkboxes do not speak for are preserved.** Frank
   Bauer's rule forbids seven channels and the editor offers two; the other
   five are held in `otherForbidden` and written back.
3. **The upsert is sent whole**: `channelsAllowed`, `contactHours` and
   `escalationByClass` are round-tripped from the loaded rule instead of being
   defaulted to `[]` / `null` / `{}` by `useSetContactRule`.

## CR‑4 — four answers to "is this rule a hard block"

One answer now, from `contactRuleIsHardBlock`: `person-row.tsx` (unchanged),
`roster-row.tsx` (unchanged), `reach-access.tsx` (was `forbidden.length > 0`
inline — now the helper), `party-mini-row.tsx` (was a regex over rendered
prose — now a `ruleBlocked` prop the picker computes with the helper). The
phone suppression on `person-row.tsx` and `roster-row.tsx` moved to
`contactRuleIsDoNotContact` (see the CR‑16 ruling above).

## CR‑6 / CR‑15 — card and company kinds through the PARTY label map

`getPartyKindLabel` is the party vocabulary; `contact_kind` is the CARD
vocabulary. Seven of twenty-one firm rows printed a raw lowercase token and the
studio's own three people printed `studio`.

**Changed** the company-kind vocabulary moves from `directory/company-row.tsx`
into `people-derivation.ts` (this module takes no React import; the row
re-exports `companyKindLabel`, so `party-mini-row.tsx`, `rolodex-seed-sheet.tsx`
and `company-row.test.tsx` are untouched), plus two new readers:

* `companyKindShortLabel` — the firm ROW's word, `gc → "GC"` per SPEC §5.1 #13,
  then the company map, then the party map (so a `sub` firm still reads
  "Subcontractor"), then prettification. Used by `firmIdentityLine`.
* `contactCardKindLabel` — party map first, then the company map, then
  prettification. Used by `personIdentityLine`'s fallback.

**Evidence** the seed's eleven company kinds — architect, authority, gc, lender,
maker, photography, showroom, stager, sub, supplier, workroom — now render
Architect · Authority · **GC** · Lender · Maker · Photography · Showroom ·
Stager · Subcontractor · Supplier · Workroom. Zero raw tokens. The derivation
test's expected string is updated from "General Contractor" to "GC".

## CR‑7 — the studio's people banded under Crew

`STUDIO_KINDS` was `new Set(["team"])`; the seed's three studio people carry
`contact_kind = 'studio'` (verified: Dale Whitcomb, Leah Hartwell, Priya
Natarajan). Added `'studio'`, and added the directory-scope pins CR‑7 asked for
(under Studio, absent from Crew, plus the CR‑15 line reading "Studio").

## CR‑8 — the company card wrote almost nothing it is the only writer of

`company-card.tsx` gains the two acts direction §3.3 names and the third region
direction §5.1 defines:

* **"Set paperwork contact, signer and site contact"** (tertiary) — three
  selects over the firm's own crew, seeded from the card on open (same ref
  pattern as CR‑3), written through `useUpdateStudioContact`'s `card` patch.
* **"Edit payee"** (tertiary) — remit-to, last four of the tax id, retainage in
  percent (converted to bps), seeded from the card, same write path.
* **Reach & access, the COMPANY variant** — `ReachAccess` mounted with
  `cardKind="company"`. `ChannelRow` takes `showConsent`, which is false for a
  firm, so the firm's office/dispatch/AP lines are readable but no consent word,
  no consent sentence and no "Record consent" band appear; the mint
  consequence, the clock radios and "Mint access" are person-only. SPEC §5.3
  #9's "a firm has neither consent nor reach" is kept — the existing test
  asserting no `data-state-family="consent"` / `"reach"` on the card still
  passes with the region mounted.

## CR‑9 — the crew line carried no rule and no routed line

`company-card.tsx` reads `useContactRules()` + `useStudioContactChannelsFor()`
the way `roster-groups.tsx` does and renders `ContactRuleLine` under each crew
name with `contactRouteTarget(...)`. C7's own example — Frank Bauer named as
signer, with Rosa Delgado's channel printed rather than his — is now what the
card does. The R‑W pin (one control on the line, designations plain) still
passes: `ContactRuleLine` renders `null` where there is no rule.

## CR‑11 — `client_rep` printed raw on the person card

`person-profile.tsx`'s Past-seats line now uses `getPartyKindLabel(seat.party_kind)`
and `getFieldTradeLabel(seat.trade)`, matching `seat-line.tsx:69-72`.

## CR‑12 — no surface could record a money scope or a threshold

`add-person-sheet.tsx`'s authority band gains:

* a **scope picker** over `ALL_AUTHORITY_SCOPES` with `AUTHORITY_SCOPE_LABELS`,
  defaulting to the kind's own scope (household → change order, else selections)
  as before;
* a **threshold field** in dollars, converted to `thresholdCents` and passed
  through `useSetPartyAuthority`;
* **the client half of PR‑n**: `isAdminOnlyAuthorityScope` now has call sites —
  the admin-only options are `disabled` for a non-admin with the reason in
  words beside the picker, the effect resets a stale choice if membership
  changes, and `submitParty` refuses the write with a sentence rather than
  letting the DB policy answer. (Owner/admin is read off
  `useOrganizations()[…].membership.role`.)

Labels are "What they may decide" and "Up to, in dollars" — deliberately not
"Authority scope", so `getByLabel('Authority')` (substring) still resolves to
the clause field alone.

## CR‑13 — every grant claimed it "ends with the job"

`access-grant-list.tsx`'s `grantEndsSentence` takes the tier: `studio_member`
and `client_account` read "No end date. Revoked by removing the account."
(SPEC §3 F‑04 / F‑16); `field_link` keeps PR‑d's wording; every other link tier
reads "Ends <date>." or "No end date on file." The ≤14-day count is factored
out and applies to any dated tier.

## CR‑14 — the company card head never printed the project count

Taken via CR‑14's own second option (derive in the card), because `?firm=` opens
the card where the Directory has computed nothing: `company-card.tsx` counts
distinct projects across the firm's seats from the same
`usePeopleSeats({ all: true })` read the Directory uses. The `jobsCount` prop
survives as an override.

**Warranty note.** SPEC §5.3 #1 reads Northgate Electric as "1 person · **2
projects** · warranty through 21 Nov 2026", and its second seat is the one under
warranty — so the card's count and its Jobs region use `seatIsClosed`
(off_job · retired · declined · no_response) while the Directory row's "N **open**
jobs" uses `seatIsDone` (those four plus `warranty`). Two questions, two words
on the face, both named and documented in `people-derivation.ts`.

---

## What was NOT changed, and why

* **`add-sheet.spec.ts:76-80`** — see QA‑R2‑5 above. A spec-vs-CR‑21 conflict,
  not this round's ruling.
* **QA‑R2‑8, QA‑R2‑10, QA‑R2‑11, QA‑R2‑12, CR‑17..CR‑35** — not in the briefed
  list.
* **`add-person-sheet.tsx` / `rolodex-picker.tsx` org resolution** — same root
  cause as QA‑R2‑1 but not in the finding's file list; `directoryRolodexOrgId`
  is available if the orchestrator wants the sweep.
* **No migration.** QA‑R2‑9 names `party_identity_key()` as a possible site; it
  is fixed at the display layer, which is the half the finding's own fix
  sentence asks for and carries no schema risk on a shared local DB.

---

# Round-2 re-dispatch — CR‑1 … CR‑10 (2026‑09‑13)

A second pass over the same round-2 brief, re-issued with the code review's
CR‑1..CR‑10 attached. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `9b5038e1d` at the start. No prod, no
migration, no server started.

## Gates run at the end of this pass

| Gate | Result |
|---|---|
| `pnpm --filter @patina/designer-portal type-check` | exit 0 |
| `pnpm --filter @patina/supabase type-check` | exit 0 |
| `npx jest src/components/document/people src/lib/document src/components/document/roster` | **141 suites, 2702 tests, all passing** |
| `npx vitest run src/hooks/__tests__` (packages/supabase) | **90 files, 1175 passing, 12 skipped** |
| `pnpm --filter @patina/admin-portal build` | exit 0 (full route manifest) |

## QA‑R2‑1 … QA‑R2‑7, QA‑R2‑9 — verified already fixed at HEAD, not re-fixed

CONTEXT‑1 is right: `5633230b0` landed these before this pass began. Re-read at
HEAD rather than taken on trust:

* **QA‑R2‑1** — `people-room.tsx:159-162` resolves `organizationId` as
  `directoryRolodexOrgId(all ?? []) ?? memberOrgId`, and `memberOrgId` itself
  sorts by id before `.find()`. No unordered `.find()` over two `design_studio`
  memberships survives.
* **QA‑R2‑2** — `views/directory-view.tsx:192-213`: `firmCounts` buckets crew off
  the rows in hand and open jobs off `usePeopleSeats({ all: true })`
  (`seat.company_id` / `seat.project_id`, skipping `seatIsDone`). The v4 view's
  hard-coded `project_id NULL` is no longer read for the count.
* **QA‑R2‑3** — `views/person-profile.tsx:191/196/342-343` computes `routeTo` and
  `routeCandidates` and passes both into `<ReachAccess>`.
* **QA‑R2‑4** — `reach-access.tsx:612-620` builds `ruleSummary` from the shared
  `contactRuleClause()` and reads `contactRuleIsHardBlock()`; the parallel
  mechanical-list composer is gone.
* **QA‑R2‑5** — `directory/add-person-sheet.tsx:1432-1451`: the checkbox's own
  `<label>` is the short sentence and the marketing paragraph is
  `aria-describedby` outside it. The accessible name no longer contains
  "project".
* **QA‑R2‑6** — `e2e/people/call-sheet.spec.ts`'s `openTheCallSheet()` now gates
  on `[data-roster-band]` (rendered at `roster-groups.tsx:108`) with a 30s budget
  instead of each band assertion racing the roster fetch on a 5s default.
* **QA‑R2‑7** — `views/person-profile.tsx:225-234, 286-288`: the sole-proprietor
  Paper region folds `documents` with the firm's `useComplianceDocuments({
  holderId: firmId })` worst-first, per R‑BA.
* **QA‑R2‑9** — `lib/document/people-derivation.ts:737, 827` — "A COMPANY-ONLY
  ENGAGEMENT IS NOT A PERSON (QA‑R2‑9)", fixed at the display layer.

Nothing was re-edited for these eight.

## CR‑1 — BLOCKING. The branch was red, and R‑BL was uncommitted.

**Confirmed both halves before touching anything.** With the working-tree
`contact-rule.ts`, `npx jest …/person-row-hardening.test.tsx` reported
`Tests: 1 failed, 13 passed` — `● the rule clause › a rule that forbids text
takes the leading rule and KEEPS the phone (CR-16)`, at
`person-row-hardening.test.tsx:191`,
`container.querySelector('[data-contact-rule-blocked="true"]')` → `null`.

**Changed.** The R‑BL predicate is kept
(`contactRuleIsHardBlock = contactRuleIsDoNotContact(rule) ||
Boolean(rule?.route_to_person_id)`, `contact-rule.ts:105-112`) and the pin was
rewritten to R‑BL's wording rather than the predicate bent back to the pin:
`person-row-hardening.test.tsx` now asserts a `forbidden={sms}` /
`allowed={email,mobile}` row renders **no** `[data-contact-rule-blocked="true"]`
and **keeps** its `TelLink` and the studio's own sentence. The two neighbouring
pins are untouched: a rule leaving no channel open still takes the rule, and a
do-not-contact rule still takes the phone off the row.

**Evidence.** `npx jest src/components/document/people src/lib/document` →
`Test Suites: 141 passed · Tests: 2702 passed`, exit 0.

## CR‑2 — the consent WORD and the consent CLAUSE could contradict on one line.

**Changed.** `consent-sentence.ts:66-98` — `consentSentenceForRecord` no longer
takes a raw record. It takes a resolution
(`Pick<ChannelConsentResolution, "verdict" | "record">`) and passes
`resolved.verdict` as the status, never `record.status`. The reason is written
into the docblock: `channel_consent_status()` folds `refusal_unanswered` into
`opted_out` whatever `status` says (00594:1062‑1063), and 00594:655‑666 records
that `granted` rows carrying that flag are minted on purpose.

Both call sites moved with it:

* `reach-access.tsx:191` → `consentSentenceForRecord(consent, …)` — `consent` is
  the `ChannelConsentResolution` off `useChannelConsent`, the same object
  `StateWord value={consent?.verdict}` renders the word from three lines above.
* `views/directory-view.tsx:301-318` → the clause map now pairs each record with
  the identity's own `people_directory.consent_status`
  (`verdicts = new Map(rows.map(r => [r.person_id, r.consent_status]))`), which
  is where the printed word comes from. `rows` joined the memo's deps.

`roster-row.tsx:207` was already correct and is unchanged.

**Pin.** `reach-access.test.tsx` — "the VERDICT decides which half of the record
the sentence reads": one record (`status: granted`, `refusal_unanswered: true`,
both date pairs populated) reads "Opted out by text, 3 Dec 2025, on the
Lindqvist kitchen." under verdict `opted_out` and "Written consent, 2 May 2025,
…" under `granted`.

## CR‑3 — no surface in the room could attach a person or a seat to a FIRM card.

**Changed, in four places.**

1. `use-coordination.ts:415-432` — `AddProjectPartyInput` gains `companyId`, and
   the insert at `:535` sends `company_id`. The docblock names why the snapshot
   string answered nothing: `directoryFirmOf` reads `meta.company_id`.
2. `use-coordination.ts:558-563, :636` — `UpdateProjectPartyPatch` gains
   `companyId`; `useUpdateProjectParty` writes `company_id` when it is supplied
   and leaves it standing when it is not.
3. `directory/add-person-sheet.tsx:656-663` — the Add sheet sends
   `companyId: matchedFirm?.id ?? null` alongside the name. A firm typed by hand
   has no card, so it stays a snapshot string and sends `null`.
4. `directory/add-person-sheet.tsx:711-725` — the rolodex half. The
   already-built `useSetAffiliation` is called inside the same chain once the
   card exists, recorded on `chainRef.current.affiliationWritten` like the other
   four steps, so a retry after a mid-chain failure does not write it twice.
   Designations (signer / paperwork / licence) are deliberately NOT set here —
   they are the company card's to set; this records only that they work there.

**00624's refusals now speak.** `writeErrorMessage` (`:155-167`) translates
`party_card_project_has_no_studio`, `party_company_other_studio` and
`party_company_not_a_company` into sentences. The last two are newly reachable
*because* of this change, and the existing schema-word guard does not match a
bare token, so without them the token itself would have reached a face
(SPEC §8 #3).

**Pins.** `add-person-sheet-kinds.test.tsx` — "ties the seat and the person to
the firm card that was picked" asserts `addParty` receives
`{companyId: "firm-cedar", companyName: "Cedar & Iron Framing"}` and
`setAffiliation` receives `{personId: "card-new", companyId: "firm-cedar"}`;
"a firm typed by hand has no card yet, so no id is sent" asserts
`companyId: null` and `setAffiliation` never called.

## CR‑4 — every site-access edit restamped "the way in changed" and erased who was told.

**Changed.** `use-coordination.ts:2010-2030` — `useUpdateSiteAccessCard` computes
`wayInChanged = lockboxVersion|alarmRef|keyHolderEngagementId !== undefined`
BEFORE building the row, and only then puts `changed_at`, `changed_by` and
`told_refs: []` on it. The upsert's UPDATE leg sets only the columns the payload
carries, so a write that omits the three leaves the standing stamp and the
standing `told_refs` exactly as they were.

The docblock names the seven acts the card routes through this door and the
false sentence the old behaviour produced at `site-access-card.tsx:646-651`.

**Pins.** New file
`packages/supabase/src/hooks/__tests__/use-site-access-and-reach-fanout.test.ts`:
a lockbox change stamps and clears; the alarm and the key holder do too; an
emergency line, the hours, the notes and receiving instructions each send
**no** `told_refs`, `changed_at` or `changed_by`; and "Start the card" sends
`{project_id}` alone — it claims nothing about a lockbox nobody has written.

## CR‑5 — a revoked field link left the reach word claiming a door that was shut.

**Changed.** `use-party-sms.ts:180-215` — `useRevokeFieldLink` takes an optional
`projectId` and its `onSuccess` mirrors `useCreateFieldLink`'s fan-out:
`partySmsKeys.links(partyId)`, `['access-grants']`, `['people-directory']`,
`['people-directory-seats']` and `['project-roster', projectId]`.
`party-profile-sheet.tsx:490-497` passes `projectId: seatProjectId`.

**Pin.** `use-site-access-and-reach-fanout.test.ts` — "a revoke moves every read
model the mint moves".

## CR‑6 — `useAddProjectParty` wrote to the consent ledger and never invalidated it.

**Changed.** `use-coordination.ts:552-560` — `onSuccess` now also invalidates
`consentKeys.all` (imported from `./use-consent` at `:10`), beside the four keys
it already moved. The comment names the sibling doors that already do it
(`useRecordPartySmsConsent`, and every hook in `use-consent.ts` through
`invalidateConsentFanout`).

**Pin.** `use-site-access-and-reach-fanout.test.ts` — "invalidates the consent
root beside the roster keys" (`['channel-consent']`).

## CR‑7 — the Text act's held reason was `sr-only`.

**Changed.** `roster-row.tsx:556-570` — the reason renders as
`mt-1 text-[0.7rem] text-[var(--color-aged-oak)]`, the same treatment the Send
act's own reason gets fourteen lines below. `aria-describedby` still points at
it, so nothing changes for a screen reader; a sighted designer now sees the
sentence SPEC §5.4's string list always named as a face string.

**Pin.** `roster-row.test.tsx` — "the Text act prints its held reason where a
sighted reader can see it": `aria-disabled="true"`, the described element holds
the sentence verbatim, and it does not carry `sr-only`.

## CR‑8 — rule provenance was on no face, and would have been wrong if it were.

**Changed, both halves.**

* `use-studio-contacts.ts:988-1005, :1045` — `useSetContactRule` reads
  `supabase.auth.getUser()` and sends `set_by` on the upsert. `set_by`'s
  `DEFAULT auth.uid()` fires on the INSERT leg alone, so on
  `ON CONFLICT DO UPDATE` the row kept the ORIGINAL setter while `set_at` moved
  to today.
* `reach-access.tsx:564-566, 612-630` — the Contact rule region resolves
  `rule.set_by` against `useOrganizationMembers(organizationId)` and prints
  "… Set by Priya Natarajan, 13 Sep 2026." With no name to give it falls back to
  the standing "Set 13 Sep 2026." rather than inventing one. The date keeps
  `formatSeatDate`'s house form, which is what every other date on these faces
  uses.

**Pins.** `reach-access.test.tsx` — "names the setter off the studio's own
roster" and "with no name to give, the date still stands alone".
`use-studio-contact-rules-and-channels.test.ts` gained an `auth.getUser` stub on
its client mock (the hook now asks who is signed in).

## CR‑9 — SPEC §5.2 #4's carried-forward sentence was written and never called.

**Changed.** `reach-access.tsx:196-236` — `ChannelRow` resolves the consent
record's OWN `origin_project_id` to a name (`useProjects`, the same read
`directory-view.tsx` uses for the identical job) and:

* passes that name as the first sentence's project — the row used to pass the
  SEAT's project name, so Dana's consent claimed it was given on a job she
  joined eighteen months later;
* appends `carriedForwardSentence(seatProjectName, seatWindowStart)` when the
  record's origin project differs from the seat's, and nothing when they match —
  a consent recorded on the job in hand has been carried nowhere.

`seatWindowStart` is a new prop, threaded from
`views/person-profile.tsx:349` (`firstSeat?.on_site_from`). The company card
mounts `cardKind="company"`, whose `showConsent` is false, so it is unaffected.

**Pins.** `reach-access.test.tsx` — "R‑Q + CR‑9 — the origin job in the first
sentence, the carry-forward in the second" produces SPEC §5.2 #4's line
end-to-end; "a consent recorded on the job in hand has been carried nowhere"
asserts the second sentence is absent.

## CR‑10 — the company card's History region dropped SPEC §5.3 #8's facts.

**Changed.** `company-card.tsx:73-113` adds `firmHistorySentence()` (exported,
pure) and `:307-338` derives its three facts from `seatsByPerson` — the very
seats the Jobs region directly above already reads. A firm's first day on a job
is the earliest of its crew's `on_site_from`; the project count is the distinct
`project_id` count. `:895-899` prints the sentence above the verdict line, which
is unchanged.

The count is spelled ("Two projects.") because SPEC §5.3 #8 spells it — a figure
belongs to money and to dates.

**Pin.** `company-card.test.tsx` — "prints the first job, its year and the
project count (SPEC §5.3 #8)": two seats (Lindqvist 2025‑04‑14, Okonkwo
2026‑10‑12) render `[data-firm-history]` as "First job 2025, the Lindqvist
kitchen. Two projects." with "No verdict recorded." still beside it.

## What was NOT changed this pass, and why

* **QA‑R4‑1 / QA‑R4‑2 / QA‑R4‑3** (CONTEXT‑1's round-4 findings) — not in the
  briefed list. QA‑R4‑1 in particular (`useAddStudioContactChannel`'s
  duplicate-key recovery query in `use-studio-contacts.ts`) is a different root
  cause from anything above and is untouched.
* **`useCreateFieldLink`'s own call site** (`party-profile-sheet.tsx:469`) still
  omits `projectId`, so a MINT does not invalidate `['project-roster', …]`
  either. Same shape as CR‑5, but CR‑5 names the mint as the correct model and
  only the revoke as the defect; flagged, not fixed.
* **`usePromoteToStudioContact`** still inserts `company_name` text and no
  `studio_contacts.company_id`. CR‑3's fix sentence names the two input types,
  the Add sheet's send and `useSetAffiliation`; `studio_contacts.company_id` is
  a DERIVED legacy pointer a trigger keeps in step off the affiliation (R‑AI),
  which this pass now writes.
* **No migration, no seed edit, no server.** The local DB carries other
  sessions' work.
