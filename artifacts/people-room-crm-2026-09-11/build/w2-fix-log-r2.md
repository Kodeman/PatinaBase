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
