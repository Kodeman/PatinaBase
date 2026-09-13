# W2 — round 1 fix log

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. Fixes for the 26 findings in
`w2-review-r1-qa.md` (QA-1…QA-8) and `w2-review-r1-code.md` (CR-1…CR-26).
No production anything; local DB `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

## Gates (all run after the last edit)

```
pnpm --filter @patina/types build            EXIT=0   (dist rebuilt — partyKindOwesPaper changed)
pnpm --filter @patina/designer-portal type-check   EXIT=0
pnpm --filter @patina/supabase type-check          EXIT=0
pnpm --filter @patina/admin-portal build           EXIT=0   (strictest)
jest src/components/document src/lib/document src/app
    → Test Suites: 457 passed, 457 total · Tests: 6042 passed, 6042 total
vitest run packages/supabase/src/hooks/__tests__
    → 88 files passed · 1163 passed | 12 skipped
eslint people/ roster/ room-shell.tsx lib/document/contact-rule.ts app/api/people
    → 0 errors, 4 warnings — the SAME four pre-existing warnings the review recorded
```

---

## QA-1 / CR-3 — "Chase the renewal" could never succeed

**Changed.** `enqueue_agent_task` is granted to `postgres`, `service_role` and
`agent_writer` only, never `authenticated`, and the company card called it
straight from `createBrowserClient()`.

- NEW `apps/designer-portal/src/app/api/people/chase-renewal/route.ts` — proves
  studio membership by reading the firm's card back through the CALLER'S OWN
  session client (RLS is the check, not a second copy of the rule), then
  enqueues with the service-role admin client. 403 when the card does not read
  back; 401 from `getAuthenticatedDesignerAdmin`.
- `components/document/people/compliance-chase.ts` — `useChaseTheRenewal` now
  POSTs to that route. Input type, hook name and `chaseConsequenceSentence`
  unchanged, so `company-card.tsx` and its test are untouched.

Evidence (local DB):
```
BEGIN; SET LOCAL ROLE authenticated;  SELECT enqueue_agent_task(...) →
  ERROR:  permission denied for function enqueue_agent_task
BEGIN; SET LOCAL ROLE service_role;   SELECT enqueue_agent_task(...) →
  task_id returned; SELECT count(*) FROM agent_tasks
     WHERE task_type='compliance_chase' AND source='people_room' → 1
```

## QA-2 / CR-7 — an AHJ firm printed a paper word

**Changed.** `packages/types/src/field-config.ts`: `partyKindOwesPaper` now
reads a named vocabulary `PARTY_KINDS_OWING_NO_PAPER = ['inspector','lender','authority']`
instead of two string literals. A null/unknown kind still owes paper (unchanged).
This fixes the Directory firm row, the person row AND `company-card.tsx:209`,
which gates the whole Paper region (and therefore "Record a document" and
"Chase the renewal") on the same predicate.

Evidence:
```
$ node -e "require('./dist/field-config.js')" →
  "authority" -> false   "lender" -> false   "inspector" -> false
  "sub" -> true          "gc" -> true        null -> true
```
Seed row confirmed: `City of Minneapolis, CPED Inspections` carries
`company_kind = contact_kind = 'authority'`.
Pinned in `people-directory-derivation.test.ts` — `it.each(["lender","inspector","authority"])`.

## QA-3 — a blocked person's own phone printed as a live `tel:` link

**Changed.** `directory/person-row.tsx` and `roster/roster-row.tsx` both
suppress the row's OWN `TelLink` when the subject is under a hard block. The
number is not deleted — it still lives on the person card, behind the rule that
governs it (§5.4 "Channels are hidden, never deleted"). Pinned:
`person-row-hardening.test.tsx` → "a hard block takes the person's own phone off
the row (QA-3)".

## QA-4 / CR-15 / CR-14 — the routed line carried no channel

**Changed.**
- `contact-rule-line.tsx` renders the routed person's email **and** her office
  phone as a `tel:` link (was an `else-if`, so a person with both never showed
  her phone). It also suppresses the canonical "Write X instead." when the
  studio's own sentence already says "Write X" — no house voice talking over
  the studio.
- NEW `lib/document/contact-rule.ts` → `contactRouteTarget()` resolves
  `route_to_person_id` to a person and a channel, preferring the TYPED `office`
  channel (R-L) over `studio_contacts.phone`.
- `views/directory-view.tsx` and `roster/roster-groups.tsx` both read
  `useContactRules()` + `useStudioContactChannelsFor(routedIds)` and pass a real
  `routeTo` down. The roster row previously passed NO route target at all.

Seed evidence: Frank Bauer's rule carries `route_to_person_id =
d0e10000-…-0014` (Rosa Delgado, `rosa@twin-cities-drywall-plaster.com`,
`(612) 555-0114`). Pinned in `contact-rule.test.ts`.

## QA-5 / CR-5 — raw snake_case enum tokens on a face

**Changed.** The faces no longer print `contact_rule_summary()`. The clause is
derived by `contactRuleClause()` in the new `lib/document/contact-rule.ts`,
which maps every `channel_kind` through a sentence-voice table
(`after_hours → "after hours"`, `ap_email → "AP email"`, `portal_311 → "the 311
portal"`, `sms → "text"`). `CONTACT_CHANNEL_KIND_LABELS` is column-head voice —
lower-casing it mangles "AP email" — so the sentence keeps its own list.

Evidence: `psql` on the seed showed
`Frank Bauer | Never text. Do not use: after_hours, ap_email, dispatch, email, mobile, office. …`
Pinned: `contact-rule.test.ts` asserts the clause `.not.toMatch(/after_hours|ap_email|portal_311/)`.

## QA-6 — the Call Sheet's "Studio side" band never rendered

**Changed, both halves the finding offered.**
- `roster/roster-groups.tsx`: the two STRUCTURAL bands (Studio side, Client
  side) now print their heading and a stated-absence sentence ("No one recorded
  on the studio side yet.") instead of vanishing — R-V's rule. The four WINDOW
  bands still disappear when empty, because an empty "Bidding" is not a fact.
- `supabase/seed/people_crm_dev.sql`: `project_team_members` held **zero rows
  for every project in the whole database** (`select project_id, count(*) …` →
  0 rows), so this was a seed gap, not an Okonkwo one. The seed now gives
  Okonkwo a lead designer (Leah Hartwell) and a support designer (Studio
  Manager). Also applied idempotently to the local DB so this round is walkable
  without a reset: `INSERT 0 2`, `okonkwo_team → 2`. `v_project_roster` carries
  a `project_team_members` branch (`tm.role AS kind`), so the band now fills.

## QA-7 — the travel-list pane

**No fix owed this round**, as the finding itself states (W3 scope per
`w2c-report.md` §4 item 6). Nothing changed.

## QA-8 — the room's title was not a heading

**Changed.** `rooms/room-shell.tsx` renders the title as `<h1>` (same type
treatment; only the element changed). To keep exactly one `h1` per page, the
five headings that render INSIDE a `RoomShell` were demoted to `h2`:
`room-view.tsx:304`, `piece-room.tsx:620`, `agreement-composer.tsx:1341`,
`people/profile/profile-shell.tsx:55`, `people/view-shell.tsx:333` (`ViewHeader`).
`directory.spec.ts:28` asks for `getByRole("heading", { name: "The People Room" })`,
which now resolves.

---

## CR-1 — `useSetPartyAuthority` upsert could never succeed (42P10)

**Changed.** `use-coordination.ts` replaces the `.upsert(..., { onConflict:
'engagement_id,scope' })` with a check-then-write: select the OPEN row
(`effective_to IS NULL`), then update by id or insert. This is the pattern
`use-leads.ts:481` already documents for partial unique indexes.

Evidence (local DB, both shapes in one transaction):
```
old: INSERT … ON CONFLICT (engagement_id, scope) DO UPDATE
     ERROR:  there is no unique or exclusion constraint matching the ON CONFLICT specification
new: select-open-row → no insert when one stands (the UPDATE branch) — no error
```
No migration minted: a non-partial UNIQUE would break 00624's own shape
("a delegation during travel is a row, not an edit").

## CR-2 — `useSetAffiliation` upsert could never succeed (42P10)

**Changed.** Same check-then-write in `use-studio-contacts.ts`, over
`studio_person_affiliations`' partial index (`WHERE to_date IS NULL`).
Evidence: the old shape probed as
`ERROR: there is no unique or exclusion constraint matching the ON CONFLICT specification`.

## CR-4 — the Add sheet promised a text nothing sends

**Changed.** `add-person-sheet.tsx`:
- the confirmation now reads "… added to <project>. The consent is recorded;
  nothing has been sent yet."
- the consent block's "… is invited, not consenting, until they reply YES."
  becomes "<Name> is recorded as consenting on this evidence. Patina has not
  sent them anything yet."
Test updated to assert the new sentence AND that "until they reply YES" is gone.

## CR-6 — the studio's typed rule never reached a face

**Changed.** `contactRuleClause()` prints `studio_contact_rules.reason` as the
clause when the studio typed one, and falls back to the mechanical clause list
(in house words) only where it did not. The mechanical list is the
machine-readable half. Pinned in `contact-rule.test.ts`.

## CR-8 — a grant write never refreshed the Call Sheet

**Changed.** `useSetPartyAuthority.onSuccess` invalidates
`partyAuthorityKeys.all` (the root) instead of `.list(engagementId)`, which is
not a prefix of the project-wide key. The false comment in
`use-project-authority.ts` is corrected to say why the ROOT is required.

## CR-9 — the vitals counted the whole roster

**Changed.** `roster-derivation.ts` `callSheetVitals` counts all four numbers
over one population — `studioSide + clientSide + this_week` — which is the
arithmetic SPEC §5.4 #3 / R-F's literal closes over. `call-sheet-derivation.test.ts`
now pins the population size explicitly and adds a negative control asserting
`later`/`bidding`/`done` never reach any of the four. `call-sheet.test.tsx`'s
literal updated.

## CR-10 — the way-in line named the wrong person

**Changed.** `site-access-card.tsx:309` is now
`wayInSentence(card.lockbox_version, gate ?? keyHolder?.name)` — the GATE
CONTROLLER first. `wayInSentence`'s docstring in `roster-derivation.ts`
corrected. `site-access-card.test.tsx` now pins
"…ask Luis Ochoa." (was "…ask Ngozi Eze.").

## CR-11 — every site-access write failure was swallowed

**Changed.** `site-access-card.tsx`: `save()` is `async`, sets a `saveError`
state and RETHROWS; `EditableLine.onSave` returns a promise and the editor
closes only on resolution, staying open with the typed value on rejection. A
`role="alert"` slot (`[data-site-access-error]`) prints the failure at the head
of the card. The swallowing `.catch(() => undefined)` is gone.

## CR-12 — revoking a door left the reach word claiming it open

**Changed.** `use-access-grants.ts` `useRevokeAccessGrant.onSuccess` now mirrors
`useCreateFieldLink`: `['people-directory']`, `['people-directory-seats']` and
`['project-roster']` alongside `accessGrantKeys.all`.

## CR-13 — no consent sentence on the Directory person row

**Changed.** NEW `useChannelConsentRecords(organizationId, 'sms')` in
`use-consent.ts` (one query for the whole ledger, not one per row);
`directory-view.tsx` joins it to the rolodex cards on `phone_e164` and passes
`consentClause` to `PersonRow`, which prints it under the identity line as
`[data-consent-clause]` using the one wording (`consentSentenceForRecord`).
`invalidateConsentFanout` now invalidates `consentKeys.all` so the list key is
reached.

## CR-14 — see QA-4 above. Both channels render; the office phone is sourced
from the typed `office` channel where one exists.

## CR-15 — see QA-4 above. `roster-row.tsx` takes `rule` + `routeTo`.

## CR-16 — the Add sheet's authority field had one branch and no acts

**Changed.** `add-person-sheet.tsx` reads the project's standing grants through
`useProjectAuthority(projectId)` and renders BOTH branches, each with its act:
- sourced → "Defaulted from the agreement. Confirm it, or write a different
  one." + **Confirm from the agreement** (opens the field prefilled with the
  agreement's `source_clause`)
- unsourced → "Nothing defaulted from the agreement." + **Record the authority**
  (opens the empty field)
Both acts carry `aria-expanded`/`aria-controls` onto the field's real id. The
"Authority" label now lives with the input.

## CR-17 — PR-g's firm sorting was computed and unused

**Changed.** `directory-view.tsx`'s sort uses
`firmBands.get(row.person_id) ?? directoryBandOf(row)` for a firm row, so a firm
sorts into the band of the crew it carries instead of sinking to `BAND_ORDER 4`.

## CR-18 — a seat added from the rolodex did not appear on the Call Sheet

**Changed.** `useAddProjectParty.onSuccess` now also invalidates
`['project-roster', data.project_id]` and `peopleSeatKeys.all` — the two keys
`use-call-sheet-roster.ts:64-66` reads, and the two every other seat mutation in
the file already invalidated.

## CR-19 — the PR-n sentence was thrown for every failure

**Changed.** New `authorityWriteError(error, scope)` helper: the admin-only
sentence is returned ONLY for a recognisable RLS refusal (`42501`, or `PGRST116`
when the WITH CHECK leg returns no row). Everything else — CR-1's 42P10, the
`authority_copy_to_off_project` trigger, a network failure — rethrows as itself.

## CR-20 — the five chained writes had no rollback and no idempotency

**Changed.** `add-person-sheet.tsx` carries a `chainRef` recording what has
already landed (`party`, `cardId`, `mobileWritten`, `emailWritten`,
`ruleWritten`). A retry RESUMES the chain rather than restarting it, so a second
press cannot write a second seat. `reset()` clears the ref — a fresh add is a
fresh chain.

## CR-21 — the forbidden channel was inferred from an empty field

**Changed.** `channelsForbidden: partyEmail.trim() ? [] : ["email"]` →
`channelsForbidden: []`. The studio's typed sentence is recorded as `reason`;
which channel is barred is written on the person card, where there are controls
that say so. Test expectation updated with the reason in the comment.

## CR-22 — two different block heuristics for one fact

**Changed.** One predicate, `contactRuleIsHardBlock(rule)` in
`lib/document/contact-rule.ts`, reading `channels_forbidden` /
`channels_allowed` — not a regex over rendered prose. A hard block is a rule
that leaves NO channel open, per direction §5.4; a rule forbidding text while
naming email is ordinary prose. Both regexes are deleted from the render path
(`person-row.tsx`, `roster-row.tsx`). Against the seed this takes the terracotta
rule OFF Sam Rowe, Carol Nyström, Ingrid Halvorsen and Ray Thao (all of whom
carry `channels_allowed`) and leaves it ON Frank Bauer (`channels_allowed = {}`).
Pinned in `contact-rule.test.ts` and `person-row-hardening.test.tsx`.

## CR-23 — an ended authority grant kept printing

**Changed.** Both reads filter to open grants:
`usePartyAuthority` (`use-coordination.ts`) and `useProjectAuthority`
(`roster/use-project-authority.ts`) add
`.or('effective_to.is.null,effective_to.gte.<today>')`.

## CR-24 — the threshold figure printed on a phone

**Changed.** `roster-row.tsx` renders two phrases and lets CSS choose: the full
`authorityPhrase` at `sm:` and up, and a figure-less phrase
(`threshold_cents: null`) below it, marked `[data-authority-no-figure]`. A CSS
branch rather than a JS width branch, because the Call Sheet renders one
DocSheet at every width and a JS branch hydrates wrong on first paint.

## CR-25 — the studio had no way back from a refusal

**Changed.** `reach-access.tsx` wires `useRecordChannelReconsent` (zero call
sites before): a grant recorded over a standing opt-out routes to
`record_channel_reconsent`, which keeps the prior refusal as history. The act
reads "Record a fresh consent" on a refused channel, with the sentence "They can
rejoin by replying START — or the studio can record a fresh consent here, with
where and when they said so." Source and evidence are still required.

## CR-26 — bare `disabled` on two gated acts

**Changed.** Both now pass `held` + `aria-describedby` and print a VISIBLE
consequence sentence:
- `roster-row.tsx:538` Send → "Write the message first — a text with no words is
  not a text." (the same wording the party sheet beside it already uses)
- `notice-log.tsx:136` Save this note → "Pick who was told first — a notice with
  no names on it records nothing."
The `isPending` halves keep the native attribute, as the finding asked.

---

## Files changed

Portal:
`app/api/people/chase-renewal/route.ts` (new) ·
`lib/document/contact-rule.ts` (new) · `lib/document/roster-derivation.ts` ·
`components/document/rooms/room-shell.tsx` ·
`components/document/rooms/room-view/room-view.tsx` ·
`components/document/rooms/piece/piece-room.tsx` ·
`components/document/rooms/drafting/agreement/agreement-composer.tsx` ·
`components/document/people/{compliance-chase.ts,contact-rule-line.tsx,reach-access.tsx,view-shell.tsx}` ·
`components/document/people/profile/profile-shell.tsx` ·
`components/document/people/directory/{person-row.tsx,add-person-sheet.tsx}` ·
`components/document/people/views/directory-view.tsx` ·
`components/document/roster/{roster-row.tsx,roster-groups.tsx,site-access-card.tsx,notice-log.tsx,use-project-authority.ts}`

Packages:
`packages/types/src/field-config.ts` ·
`packages/supabase/src/hooks/{index.ts,use-coordination.ts,use-studio-contacts.ts,use-consent.ts,use-access-grants.ts}`

New hooks exported from `@patina/supabase`: `useContactRules`,
`useStudioContactChannelsFor`, `useChannelConsentRecords`.

Seed: `supabase/seed/people_crm_dev.sql`.

Tests: `lib/document/__tests__/contact-rule.test.ts` (new, 13 tests) plus
updated pins in `call-sheet-derivation.test.ts`, `people-directory-derivation.test.ts`,
`people-primitives.test.tsx`, `person-row-hardening.test.tsx`,
`add-person-sheet-kinds.test.tsx`, `directory-scope.test.tsx`,
`reach-access.test.tsx`, `call-sheet.test.tsx`, `call-sheet-mount.test.tsx`,
`project-roster-surfaces.test.tsx`, `site-access-card.test.tsx`.

## Not changed, and why

- **QA-7** — the finding states no fix is owed (W3 scope).
- **No migration was minted.** CR-1 and CR-2 are fixed in the hooks
  (check-then-write), which is what both findings named first and what the house
  already documents for partial unique indexes. Adding a non-partial UNIQUE to
  `project_party_authority` would contradict 00624's own shape.
- **QA-9 through QA-15 and CR-27 through CR-47** were outside this round's
  instruction and are untouched.
