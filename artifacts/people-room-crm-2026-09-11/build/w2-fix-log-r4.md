# W2 fix log — round 4 (QA r5 + code r4 findings)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, base HEAD `fb8e4e528`. Local only:
no dev server started, no port taken, no migration written, no prod touched.
The local DB (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`) was
read for evidence, and written ONCE — the QA-R5-2 date re-anchor, which is the
finding's own fix applied to the fixture the next round reads.

Six findings were named and six were fixed. Nothing else was changed.

## Gates, run here after the last edit

```
$ pnpm --dir <worktree> --filter @patina/designer-portal type-check   → EXIT 0
$ pnpm --dir <worktree> --filter @patina/supabase type-check          → EXIT 0
$ pnpm --dir <worktree> --filter @patina/admin-portal build           → EXIT 0 (full route table)
$ cd apps/designer-portal && npx jest --silent \
    src/components/document/people src/components/document/roster \
    src/lib/document 'src/app/(document)/desk' src/components/document/mobile \
    src/components/document/coordination src/components/document/__tests__
  Test Suites: 196 passed, 196 total
  Tests:       3278 passed, 3278 total       (3271 before — 7 new)
$ cd packages/supabase && npx vitest run
  Test Files  103 passed (103)   Tests 1297 passed | 12 skipped
$ pnpm --dir <worktree> --filter @patina/designer-portal lint
  ✖ 203 problems (0 errors, 203 warnings) — every warning pre-existing; the one
  warning in a file this round touched (`party-profile-sheet.tsx:129`, an unused
  `@next/next/no-img-element` disable) is on a line this round did not edit.
```

---

## QA-R5-1 (BLOCKING) — a phone collision silently wrote the studio's typed rule and channel onto the WRONG person's card

**Changed** — `apps/designer-portal/src/components/document/people/directory/add-person-sheet.tsx`

The auto-link itself is correct and stays: 00626's `apply_party_rolodex_link_trg`
stamps a new seat with the ONE person card in `project_recorded_studio(project_id)`
whose `phone_e164` matches (`rolodex_card_for_party_phone`, exactly one match or
none), which is how a studio re-adding a returning sub works at all. What was
wrong is that the sheet wrote AND announced identically whether the matched
card's name was the name on screen or somebody else's.

Three changes, one fact:

1. **Before the write.** A new `phoneMatchedCard` memo mirrors the trigger:
   `telHref(phone)` (the same normalization as the database's
   `normalize_phone_e164` — the module says so in its own docblock) resolved to
   E.164, matched against the rolodex read the sheet already holds
   (`useStudioContacts`), `entity_kind === 'person'`, and **exactly one**
   match — the trigger's own `HAVING count(*) = 1`, because two cards sharing a
   number are a card-to-card merge the studio rules on and no seat is
   auto-linked at all. Where that card's name is not the name typed, a line
   under the Mobile field reads:

   > This number is already on file for Dana Kowalski. The rule and the channel
   > you write here land on Dana Kowalski's card, and this seat is theirs — not
   > a new person's.

   It is not an error and not a refusal: a shared office line and a household
   number are both real, and the studio is the one who knows which this is.

2. **At the act.** That paragraph's id joins the submit button's
   `aria-describedby` (`"add-party-phone-on-file add-party-consequence"`), so
   the fact reaches the ear at the act, not only the eye at the field.

3. **After the write.** `chainRef` gained `autoLinkedCardId` — the
   `studio_contact_id` the BEFORE-INSERT trigger stamped on the returned seat,
   kept apart from `cardId`, which two steps later may instead be a card this
   sheet minted itself. Where the stamp names a card whose name is not the name
   typed, the confirmation says so:

   > QA Collide Person added to Okonkwo residence. That number is already on
   > file for Dana Kowalski, so this seat and what you wrote sit on Dana
   > Kowalski's card.

   Where the card cannot be named (a project recording a studio this sheet's
   rolodex read does not cover) the sentence still states the fact rather than
   nothing: "That number was already on file, so this seat and what you wrote
   sit on the card that holds it."

`sameWrittenName` is the name test in both places — case and surrounding space
are not a different person, so re-adding "dana kowalski" against Dana's own
number is the ordinary returning-person path and says nothing.

**Evidence** — four new tests in
`people/directory/__tests__/add-person-sheet-kinds.test.tsx` (the mock's rolodex
gained a standing person card, `card-dana` / `+16125550111`):
`names whose card a typed number is already on, before the write` (asserts the
sentence AND the `aria-describedby` pair), `says nothing when the number and the
name are the same person`, `names the card the seat landed on in the
confirmation` (drives `addParty` to resolve with `studio_contact_id:
'card-dana'` — the trigger's stamp — and asserts the exact announcement string),
`adds no such clause when the card is the person typed`. All four pass; the
suite is 19/19.

**NOT changed, and named here so it is not re-litigated.** `add-sheet.spec.ts:37`
and `person-card.spec.ts:51`/`:111` will still fail. Their premise is that a
FRESH name paired with Dana Kowalski's real seeded number `(612) 555-0111`
mints a fresh card (`cardByName(name)` non-null, `ruleForSubject(<that card>)`),
which is the exact behaviour 00626's auto-link exists to prevent — the three
specs are asserting the pre-auto-link world. Re-authoring them (a unique phone
per `uniqueName`, or an assertion against the matched card) is a test-authoring
decision, not this finding's stated fix, and was left for the round that owns
it.

---

## QA-R5-2 (MAJOR) — the Call Sheet's this-week/later split did not match the fixture's own story on today's calendar

**Changed** — `supabase/seed/people_crm_dev.sql`

`rosterBandFor` (`use-coordination.ts:1702-1714`: a done stage decides, then a
bid stage, then `on_site_from > today` is Later) is exactly as designed and was
not touched. The seed's Okonkwo windows were literal 2026 dates chosen against
direction §3.4's frozen specimen date of **2026-10-20**, so on any other date
the story inverts.

The literals stay readable in the VALUES list — they are the fixture's own
story, and the intervals between seats are the story — and a single UPDATE
immediately after the INSERT shifts them by `CURRENT_DATE - DATE '2026-10-20'`
for this ONE project. Every interval is preserved exactly; the fixture is the
same fixture, told on whatever day it is read. It is idempotent because the
INSERT's own `ON CONFLICT DO UPDATE SET on_site_from = EXCLUDED.on_site_from,
on_site_to = EXCLUDED.on_site_to, off_job_at = EXCLUDED.off_job_at` restores the
literals before the shift re-applies them — replaying the seed lands on the same
answer as seeding fresh.

`off_job_at` rides with the two window columns: it is the Done band's printed
date on the same seats, and leaving it at 2026-10-02 would have printed a
FUTURE date under a past-tense word ("off the job") for Granite North. The
Lindqvist file below is deliberately untouched — a closed 2025 job whose whole
point is that its windows are behind us — and the compliance paper's expiry
dates are untouched too: those are facts about documents, not about an
engagement.

**Evidence.** Bands, computed against the shipped predicate, on the live local
DB:

```
BEFORE (wall clock 2026-09-13, literal dates)
  this_week  3   Claire Bissett, Ray Thao, Sam Rowe
  later     17   …every one of Tom Marrow, Erin Sato, Luis Ochoa, Ngozi Eze,
                 Dana Kowalski, Joe Wozniak, Carol Nyström

AT THE SPECIMEN DATE 2026-10-20 (same literal dates, simulated)
  clientSide  2 · this_week 10 · later 10 · bidding 1 · done 1

AFTER the re-anchor (wall clock 2026-09-13)
  clientSide  2  Adaeze Okonkwo, Chidi Okonkwo
  this_week  10  Carol Nyström, Claire Bissett, Dana Kowalski, Erin Sato,
                 Joe Wozniak, Luis Ochoa, Ngozi Eze, Ray Thao, Sam Rowe,
                 Tom Marrow
  later      10  Amara Osei, Frank Bauer, Ingrid Halvorsen, Jim Lindgren,
                 Jonah Feld, Kelly Marsh, Nadia Brooks, Owen Ashby, Pete Rusk,
                 Rosa Delgado
  bidding     1  Rivera Finishes
  done        1  Granite North
```

Identical to the specimen-date composition, seat for seat. All four vitals
counts close over `studioSide + clientSide + this_week` (`callSheetVitals`), so
this is also what moves "reachable by text", "with accounts" and "on paper" back
onto the right population.

The seed was replayed end-to-end inside a rolled-back transaction to prove
idempotency: `INSERT 0 24` (the ON CONFLICT reset) → `UPDATE 19` (the shift) →
the same 2/10/10/1/1 composition. The shift was then applied to the live local
DB as one statement (`UPDATE 19`), so the next QA walk reads the fixture as
written. Spot check after: Dana Kowalski `2026-09-12 → 2027-05-24`, Tom Marrow
`2026-09-05 → 2027-07-07`, Pete Rusk `2026-10-03 → 2027-04-24`.

**Caveat carried, as the finding asks.** SPEC §5.4's literal vitals string
("12 · 5 · 4 · 2") is still not what the fixture produces — at the specimen date
itself the population is 10 crew + 2 client side + the studio-side team rows,
and Amara Osei's grant sits in `later`. The band COMPOSITION is now true on any
date; the exact SPEC counts are a separate reconciliation and were not chased
here.

---

## QA-R4-3 (MAJOR) — every company card rendered a "Contact rule" region direction §5.1 says a firm never has

**Changed** — `apps/designer-portal/src/components/document/people/reach-access.tsx`

The heading, the `ContactRuleLine`/`NO_RULE_SENTENCE` fallback and the "Edit the
rule" disclosure (with its two checkboxes, route select, reason field and Save)
are now one `{isPerson && (<>…</>)}` block — the same gate the mint band four
regions below already uses, on the `isPerson` the file already computed at
`:607`. Direction §5.1: "Company variant: … Contact rule is replaced by three
designations"; SPEC §5.3 names six company regions and no Contact rule among
them. The write that block offered went to `studio_contact_rules` keyed
`subject_type: 'company'` — a row no reader in this build (Directory row, roster
row, person card, send gate) ever queries, every one of them keying rule lookups
by person id — so the act succeeded silently and had zero effect anywhere.

**Evidence** — new test in `people/__tests__/reach-access.test.tsx`,
`gives a COMPANY card no contact rule region at all`: the heading list is
`["Channels", "Access grants"]` (was `["Channels", "Contact rule", "Access
grants"]`), `NO_RULE_SENTENCE` is absent, and no "Edit the rule" button exists.
The person-variant order test is unchanged and still passes.

---

## CR-1 (MAJOR) — the promote band guessed which studio to write the rolodex card into

**Changed** — `apps/designer-portal/src/components/document/people/party-profile-sheet.tsx`,
`packages/supabase/src/hooks/use-coordination.ts`, `packages/supabase/src/hooks/index.ts`

`orgs?.find(o => o.type === 'design_studio')?.id ?? orgs?.[0]?.id` is gone. The
studio now comes off the SEAT'S JOB, through a new
`useProjectRecordedStudio(seatProjectId)` → `project_recorded_studio()`
(00624:335-343 — `projects.studio_id`, no fallback, no caller-relative leg),
which is **the resolver `assert_project_party_cards` checks the stamp against**
(00624:646-678: `sc.organization_id = v_org AND sc.organization_id = v_recorded`).

That is what makes the failure unreachable rather than merely less likely: the
card can only be inserted into the rolodex the following link will accept, so
`party_studio_contact_other_studio` cannot be raised on the ordinary path and
there is no orphan card to leave behind (the two PostgREST calls are still not
one transaction — nothing here can make them one). Where the job records no
studio the RPC returns NULL, `showPromoteBand` is already `!!organizationId`, so
the act is not offered at all instead of minting a card the guard's other arm
(`party_card_project_has_no_studio`) would refuse.

**Evidence** —
```
$ psql … "select public.project_recorded_studio('d0e00000-…-00000000000a');"
  b0000000-0000-0000-0000-000000000001      ← Local Dev Studio, the job's studio
$ psql … "select public.project_tenant_org('d0e00000-…-00000000000a');"
  b0000000-0000-0000-0000-000000000001      ← agree here; the membership read did not
$ psql … "select has_function_privilege('authenticated',
            'public.project_recorded_studio(uuid)','execute');"
  t                                          ← callable from the portal
```
The unordered membership read that produced the defect still returns both
"Leah Hartwell" (`783187b5-…`) and "Local Dev Studio" for `designer@patina.dev`;
nothing now reads it for this purpose. The four jest suites that mount this
sheet gained the new hook in their `@patina/supabase` mock
(`party-profile-edit`, `party-profile-invite-to-texts`, `people-room-address`,
`people-room-nudge-scope`) and all pass.

`promote-band.tsx:74`'s `error instanceof Error` test was left alone — it is
named in the finding's CLAIM as part of the failure chain but not in its fix,
and with the resolver correct the PostgREST rejection it mishandles is no longer
reachable from this path.

---

## CR-2 (MAJOR) — "Copy field link" stated an expiry the token would not carry, and recorded a false `expiry_source`

**Changed** — `apps/designer-portal/src/lib/document/roster-derivation.ts`,
`apps/designer-portal/src/components/document/roster/roster-row.tsx`,
`apps/designer-portal/src/components/document/people/reach-access.tsx`

1. `CallSheetRow` gained `warrantyUntil`, filled from
   `PeopleDirectorySeat.warranty_until` in `callSheetRowFromSeat` and `null` on
   the team and client rows. Until now the Call Sheet row could not see the
   warranty at all, so it could not have computed the right date even in
   principle.
2. `grantWindowEnd` and `MINT_FALLBACK_SENTENCE` moved out of `reach-access.tsx`
   into `roster-derivation.ts`, beside `fieldLinkExpirySentence` — **one
   derivation, both mint doors**, which is the finding's own wording.
   `reach-access.tsx` imports them back; its behaviour is byte-identical.
3. `roster-row.tsx`'s `copyLink` now reads
   `grantWindowEnd(row.onSiteTo, row.warrantyUntil, new Date())` and uses that
   one value three times: the `expiresAt` it sends, the `expiry_source` it
   records, and the sentence it prints (`fieldLinkExpirySentence(grantEnd)`, or
   `MINT_FALLBACK_SENTENCE` where both dates are behind us).

The sent value is `${grantEnd}T23:59:59Z`, matching the person card's door
exactly. A bare date is midnight, which on the window's last day is already
behind `now()` — `create_field_link`'s `p_expires_at > now()` leg would reject
it and drop to the ninety-day term.

**Evidence** — the five seats the finding names still carry a warranty that
outlives a window already in the past:
```
$ psql … "select display_name, on_site_to, warranty_until from project_parties
          where warranty_until is not null order by 1;"
  Ben Ostrom | 2025-10-15 | 2026-11-21      Dana Kowalski | 2025-10-15 | 2026-11-21
  Erin Sato  | 2025-10-15 | 2026-11-21      Ingrid Halvorsen | 2025-09-30 | 2026-11-21
  Pete Rusk  | 2025-10-15 | 2026-11-21      (+ Claire Bissett, Karin Lindqvist, dateless)
```
Three tests in `roster/__tests__/roster-row.test.tsx`, all passing:
the existing mint test now asserts `expiresAt: '2027-08-13T23:59:59Z'`;
`states the WARRANTY date when the warranty outlives the window` drives exactly
the seeded shape (`onSiteTo: '2025-10-15'`, `warrantyUntil: '2026-11-21'`) and
asserts the row prints "Ends with the job, 21 November 2026" and sends
`2026-11-21T23:59:59Z` — where the old code printed 15 October 2025 and sent it;
`says ninety days when the window and the warranty have both closed` asserts the
fallback sentence and `expiresAt: undefined`, which is also the `expiry_source:
'fallback_90_day'` case the old code recorded as `'engagement_window'`.

---

## CR-3 (MAJOR) — the Call Sheet chevron was an inert button on every seat the party sheet excludes, and fired analytics anyway

**Changed** — `apps/designer-portal/src/components/document/roster/roster-row.tsx`

The chevron's condition went from `onOpenSeat && row.personId` to
`onOpenSeat && row.personId && row.seatId && seatProfileRole(row.partyKind)`.
`row.personId` is `seat.person_id`, set for every CARDED seat of every kind,
while `call-sheet-mount.tsx:48-53` returns silently unless
`seatProfileRole(row.partyKind)` is non-null (`PROFILE_OPENABLE_KINDS`: gc, sub,
installer, receiver, architect, photographer, stager). Where there is no door
there is now no control — R-AA's "no inert buttons" — and because the chevron
only renders where the open succeeds, `peopleEvents.personCardOpened` is now
only fired by a click that actually opens something. The chevron was NOT
re-routed to the person card: that is the finding's alternative, a
cross-surface navigation change, and the stated primary fix is the gate.

**Evidence** — the six carded Okonkwo seats outside the openable list are
unchanged on the live DB:
```
$ psql … "select party_kind, display_name from project_parties
          where project_id='d0e00000-…-00000000000a'
            and party_kind in ('client','client_rep','other','vendor')
            and studio_contact_id is not null order by 1,2;"
  client Adaeze Okonkwo · client_rep Chidi Okonkwo · other Carol Nyström ·
  other Ray Thao · vendor Claire Bissett · vendor Owen Ashby
```
`roster/__tests__/call-sheet-mount.test.tsx`'s "opens nothing for a kind the
directory party branch excludes" is rewritten as `prints no chevron at all for a
kind the directory party branch excludes` — it now asserts the "Open Ochoa
Lighting" button is absent, which is the fix, and still asserts no profile
opens. The suite's "draws a chevron for a seat the directory admits" and "opens
the person with the seat id and the kind the row carries" are untouched and
still pass, so the door that should exist still does.

---

## What was NOT touched

* No migration was written. Every change above is portal, package or seed.
* `promote-band.tsx`'s error narrowing (CR-1's claim, not its fix).
* The three e2e specs QA-R5-1's claim names (see that section).
* Every other open finding from either r4 file — QA-R5-3, QA-R5-4, QA-R3-2/3/4/5/6/9,
  CR3-5…CR3-24 and the r4 minors — was out of this round's list and is unchanged.
