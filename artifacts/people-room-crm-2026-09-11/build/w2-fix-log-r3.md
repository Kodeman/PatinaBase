# W2 — fix log, round 3

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. Scope: the 13 findings named in the
round-3 brief — `QA‑R3‑1`, `QA‑R3‑4`, and `CR3‑1..CR3‑11`. Nothing else: the 26
minors (`CR3‑12..CR3‑37`) and the other QA minors are untouched. No dev server
started, no port taken, no prod touched. Local DB
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`) read-only, for
evidence.

## Gates, run here after the changes

```
$ pnpm --dir <worktree> --filter @patina/designer-portal type-check
    > tsc --noEmit                                                    EXIT 0
$ pnpm --dir <worktree> --filter @patina/supabase type-check
    > tsc --noEmit                                                    EXIT 0
$ pnpm --dir <worktree> --filter @patina/admin-portal build
    ✓ Compiled successfully … full route table                        EXIT 0
$ pnpm --dir <worktree> --filter @patina/designer-portal test -- --silent
    Test Suites: 584 passed, 584 total
    Tests:       7422 passed, 7422 total          (7404 before this round's
                                                   new pins; 7398 at r2)
$ cd packages/supabase && npx vitest run
    Test Files  102 passed (102)
    Tests       1290 passed | 12 skipped (1302)   (+6 new pins)
$ cd supabase/functions && deno test --config deno.json --allow-all --no-check \
    _shared/sms.test.ts _tests/sms-inbound.test.ts _tests/field-daily.test.ts
    ok | 109 passed | 0 failed                    (+4 new pins)
    (no deno.lock appeared at the repo root — checked)
$ pnpm --dir <worktree> --filter @patina/designer-portal lint
    ✖ 204 problems (0 errors, 204 warnings)  — every warning pre-existing;
      the one directive this round made stale (party-profile-sheet.tsx's
      exhaustive-deps disable) was removed rather than left warning.
```

---

## The two rulings this round had to make

### CR3-7 — what the leading rule actually marks

The reviewer declined to guess a third time and asked for an orchestrator
ruling. Ruled here as **the rule that closes the rail Patina itself sends on**:

```ts
contactRuleIsHardBlock(rule) =
    contactRuleForbidsSms(rule) || contactRuleIsDoNotContact(rule)
```

Why this and not r2's "any forbidden channel":

* it fixes the one **verified** break. SPEC §5.1 #8 describes F‑11 Dana
  Kowalski's row — the row §5.1 #8, §5.2 and both specimen files all render —
  with the clause and **no** leading rule, while #10 and #11 name one
  explicitly for Frank Bauer and Ray Thao. r2's predicate painted Dana. This one
  does not, and keeps Frank and Ray.
* it is a rule a designer can state out loud: *a leading rule means this person
  is never texted, or cannot be reached directly at all.* It is the same
  predicate the send gates now read (CR3‑9), so the mark and the refusal cannot
  drift.

**What is still owed, and why no formula can close it.** The fixture's `block`
is not derivable from the rule row. Probed against the local seed:

```
$ psql … "select coalesce(sc.full_name, sc.company_name), r.channels_allowed,
          r.channels_forbidden from studio_contact_rules r
          join studio_contacts sc on sc.id = r.subject_id order by 1;"
 Carol Nyström    | {email,mobile} | {sms}      ← fixture F-26, block: TRUE
 Sam Rowe         | {email,mobile} | {sms}      ← fixture F-10, block: FALSE
```

Byte-for-byte identical rows, opposite fixture verdicts. Confirmed:

```
$ psql … -At -c "select count(distinct (r.channels_allowed::text || '|' ||
    r.channels_forbidden::text)) = 1 from studio_contact_rules r
    join studio_contacts sc on sc.id = r.subject_id
    where sc.full_name in ('Carol Nyström','Sam Rowe');"
  t
```

So two rows (F‑10 Sam Rowe, F‑13 Ingrid Halvorsen) wear a leading rule the
fixture marks `false`. Neither is described in any §5 requirement. **The
orchestrator still owes the ruling the reviewer asked for**: either the fact
moves onto the rule row (a column, a W3 migration + seed) or SPEC §3's fixture
is amended to the derivation. The count moved from six painted rows to five
(`select count(*) from studio_contact_rules where 'sms' = any(channels_forbidden)`
→ 5 of 7), against the fixture's three.

### CR3-10(b) — CR-21 stands; the spec moves

`e2e/people/add-sheet.spec.ts:76-80` asserted `channels_forbidden` contains
`"email"` after Leah task 1. CR‑21 deliberately made the sheet write `[]`,
because the old inference read the forbidden list off whether the Email box
happened to be blank — so "Email only. No cell for work." typed beside an empty
Email box wrote a rule **forbidding email**, the opposite of what the studio
said, and what every send gate would then read. Task 1's acceptance is the rule
on the person carrying the studio's own words, which the spec already asserts
one block above. The machine-readable list nobody typed is not part of it. The
assertion now pins `toEqual([])`, with the ruling written beside it.

---

## QA‑R3‑1 — the Add sheet resolved the wrong studio

`add-person-sheet.tsx` and `roster/rolodex-picker.tsx` still carried
`orgs.find(o => o.type === 'design_studio')?.id` — a first match over an
UNORDERED membership read, the exact QA‑R2‑1 defect the r2 fix log left
unswept in these two files.

```
$ psql … -At -c "select count(*) from organization_members m
    join organizations o on o.id = m.organization_id
    join auth.users u on u.id = m.user_id
    where u.email='designer@patina.dev' and m.status='active'
      and o.type='design_studio';"
  2
```

**Changed**

* `add-person-sheet.tsx` — takes a new optional `organizationId` prop; the
  in-sheet fallback sorts the membership list by id before picking, so the
  guess can never move between renders. Both call sites now pass the answer
  they already hold: `people-room.tsx` its `directoryRolodexOrgId(all)` fold,
  and `directory/rolodex-seed-sheet.tsx` the studio id it was opened with. (A
  prop rather than a second `usePeopleDirectory()` read: the seed sheet lives on
  the account page, where the Directory is not otherwise read at all.)
* `roster/rolodex-picker.tsx` — applies `directoryRolodexOrgId` directly, at no
  extra query cost: the picker ALREADY calls `usePeopleDirectory()` for the
  three words and the rule, so the org that actually holds the cards was in hand
  and unused. The membership list, sorted, is the fallback. The
  `usePeopleDirectory` call moved above the org memo so the value is available
  to it; hook order stays unconditional.
* Both `submitParty` and `submitClient` (and `submitMaker`, `submitEditContact`)
  now unwrap a Postgrest-shaped rejection through a new local
  `writeErrorMessage(err, fallback)`. PostgREST rejects with a PLAIN OBJECT
  (`{message, code}`), not an `Error`, so `e instanceof Error` fell through to
  "Could not add them just now. Try again." for every one of them — which is how
  a wrong-studio refusal reached the designer as a shrug. A raw Postgres string
  still never reaches a face: RLS/permission codes are translated to one
  sentence, and anything naming a constraint, an index, a relation or a column
  falls back to the friendly line (SPEC §8 #3).

---

## CR3-1 (BLOCKING) — the seat sheet was identity-less for every carded seat

`party-profile-sheet.tsx` read its whole body off `usePerson(partyId, role)`,
which under `people_directory` v4 resolves NOTHING for a carded seat. Both live
doors into the sheet pass a `project_parties.id`.

```
$ psql … -At -c "select count(*) filter (where studio_contact_id is not null)
    || '/' || count(*) from project_parties
    where project_id='d0e00000-0000-0000-0000-00000000000a';"
  22/24                       ← carded seats on Okonkwo
$ psql … -At -c "select count(*) from project_parties pp
    where pp.project_id='d0e00000-0000-0000-0000-00000000000a'
      and exists (select 1 from people_directory pd where pd.person_id = pp.id);"
  0                           ← resolvable by seat id: none
```

**Changed** — the sheet now reads `seatResolution.seat` first, with `person` as
the fallback (not the other way round), and the identity behind the seat for the
email the seats view does not carry:

| fact | now reads |
|---|---|
| heading / name | `seat.display_name ?? person.display_name` |
| Trade | `seat.trade ?? meta.trade` |
| Company | `seat.company_name ?? meta.company_name` |
| Phone | `seat.phone_e164 ?? person.phone ?? meta.phone_e164` |
| Email | `seatIdentity.email ?? person.email` |
| Project | `seat.project_name ?? meta.project_name` |
| project id | `seat.project_id ?? person.project_id` |

Consequences, each of which was a shipped defect:

* the heading is the person's name, not "Field party";
* `useProjectParties` is asked for the SEAT's project, so the promote band's row
  lookup resolves at all;
* the edit form seeds from the resolved record and `recordLoaded` is
  `!!seat || !!person`, so **Edit is offered** on a carded seat;
* `saveParty` guards on the seat's project id and sends it to
  `useUpdateProjectParty`, so Edit no longer always refuses with "This party
  isn't attached to a project";
* `doInvite` sends the seat's project where `:490` sent `''`, and the
  "Invite to texts" branch is reachable because the seat's number is read;
* the zero-row-write recovery now re-reads the SEAT as well as the person —
  asking the directory alone would have read every authority refusal as a race
  for exactly this population.

**Pinned** — a new `describe` block in `party-profile-edit.test.tsx` renders a
CARDED seat with `usePerson` answering `null` and asserts the heading, the
contact card, the Edit → Save call (`projectId: 'proj-1'`) and the reachable
invite. 4 new tests; the file's existing 19 still pass (its `usePersonSeat`
mock grew a `refetch`).

---

## CR3-2 — the Add sheet's rule write destroyed a standing rule

`useSetContactRule` is a full-row upsert; the Add sheet sent a bare `reason`,
so `channels_forbidden`, `route_to_person_id`, `contact_hours` and
`escalation_by_class` all went back as their empty defaults. Reachable because
`chain.cardId` is often an **existing** card — 00626's
`apply_party_rolodex_link_trg` (live on `project_parties`) auto-links a new seat
to the one card in the project's studio carrying that `phone_e164`.

**Changed** — `useSetContactRule` gained a `merge?: boolean` mode
(`packages/supabase/src/hooks/use-studio-contacts.ts`). With `merge: true` the
standing row is read first and every field the caller leaves `undefined` is
carried across; an explicitly passed value still wins, including an explicitly
empty array. The default path is byte-identical to before, so the person card's
editor — which loads the rule and round-trips every column it does not own
(CR‑3) — is untouched. `add-person-sheet.tsx` passes `merge: true`.

**Pinned** — `packages/supabase/src/hooks/__tests__/use-studio-contact-rules-and-channels.test.ts`,
against Frank Bauer's seeded row: a reason-only merge keeps
`route_to_person_id: 'card-rosa'`, the hours and the escalation map; a
non-merge write still replaces the row.

---

## CR3-3 — the channel insert dead-ended on a repeat person

`useAddStudioContactChannel` was a bare `.insert()` against
`idx_studio_contact_channels_owner_kind_value UNIQUE (owner_id, channel_kind,
value)` (confirmed live on the local DB). Adding somebody the rolodex already
holds raised `23505`, the sheet rendered `e.message` verbatim — a raw Postgres
string naming the index, on a face — and because `chain.mobileWritten` is only
set after success, every retry re-failed and the rule, the email and the
authority grant behind it never ran.

**Changed** — the hook catches `23505`, reads the standing row back by
`(owner_id, channel_kind, value)` and returns it. Read back rather than
upserted on purpose: **a held channel is not a deleted one** (direction §5.1),
so re-adding a bounced address must not quietly mark it active again, and
re-adding a number must not demote a `preferred` flag somebody set. Any other
error still throws. (The sheet's own error slot is separately hardened by
`writeErrorMessage`, above.)

**Pinned** — same vitest file: a duplicate returns the standing (bounced,
preferred) row unchanged; a `42501` still rejects.

---

## CR3-4 — no surface could add, edit or hold a channel

`useAddStudioContactChannel` had exactly one call site (the Add sheet);
`useUpdateStudioContactChannel` and `useSetStudioContactChannelStatus` had
**zero**. So a phone or email could only ever be written at seat-creation time,
and a bounced address could never be marked bounced — while `ReachAccess`
printed "Nothing on file yet. Add a phone or email to reach them." beside no
control that could.

**Changed** — `people/reach-access.tsx`, both variants:

* an **"Add a channel"** disclosure beneath the Channels list (direction §3.2
  R2's named control): kind select scoped by card kind (`PERSON_CHANNEL_KINDS`
  / `COMPANY_CHANNEL_KINDS`), the value, a "Reach them here first" box, and
  "Put it on the card". Hidden under a do-not-contact rule, where the region
  collapses to one line and routes elsewhere (§5.4) — offering a new channel
  there would contradict the line above it.
* a per-row **"Hold this line" / "Put this line back in use"** disclosure
  carrying the four statuses direction §5.1 defines, in house words ("In use",
  "It bounces", "They unsubscribed", "The line is dead") — `status` is a schema
  word and never reaches a face (SPEC §8 #3). Writes through
  `useSetStudioContactChannelStatus`; the held row's `--rail` ground, leading
  rule and reason sentence are the existing renderer, now reachable.

Both announce through the caller's `onAnnounce`, which is the Room's one live
region (see CR3‑11).

---

## CR3-5 — the site access card could never name a key holder or an emergency line

`useUpdateSiteAccessCard` has accepted `keyHolderEngagementId` and
`emergencyLines` since 00625 and **no surface passed either**. The dev seed
writes both columns, which is why every local walk and every screenshot passed
while the shipped card could not produce either fact:

```
$ psql … -At -c "select key_holder_engagement_id is not null,
    jsonb_array_length(emergency_lines) from project_site_access_cards
    where project_id='d0e00000-0000-0000-0000-00000000000a';"
  t|6                        ← the SEED wrote these, not the card
```

**Changed** — `roster/site-access-card.tsx` (direction §3.7 puts E15's
ownership here):

* **Key holder** — "Name the key holder" / "Name a different key holder" opens a
  select over the job's own SEATS (rows with a `seatId`; a studio teammate holds
  no engagement id, so the `key_holder_engagement_id` BEFORE trigger cannot be
  tripped from here), seeded from `card.key_holder_engagement_id` on each
  opening, with "Nobody on the job holds one" as the clearing choice. Writes
  `{projectId, keyHolderEngagementId}` and stamps
  `peopleEvents.siteAccessChanged({region: 'key_holder'})` — a region the event
  type already named and nothing ever sent. R‑U's head fold gets its key-holder
  half back.
* **Who to call first** — "Add someone to call" (Name / What they are to this
  job / Number) appends to the stored array, and each line carries "Take <name>
  off the list". The seed writes `label` where the hook's type says `role`; both
  are read on the way out and normalised on the way back in, so an edit never
  drops a word a seeded line carried. Region `'emergency_lines'`.

Both go through the card's existing `save()`, so a refusal lands in the CR‑11
error slot and the editor stays open.

**Pinned** — 6 new tests in `site-access-card.test.tsx`: the picker is seeded,
offers only seats, writes the chosen seat and can write `null`; the line editor
appends without losing the three seeded lines, refuses a nameless line writing
nothing, and removes one line leaving the rest standing.

---

## CR3-6 — PR-l's mint choice was silently overridden by the RPC

`create_field_link(uuid, timestamptz)` (00627) computes
`max(on_site_to, warranty_until)` and takes it whenever it is still ahead,
falling through to `p_expires_at` only when there is no live window and to
ninety days when there is neither. So on a seat whose warranty outlives its
window, choosing "Ends with the job" still minted to the **warranty** end,
`mintConsequenceSentence` named a date the token did not carry, and
`peopleEvents.grantMinted({expiry_source})` recorded a choice that never reached
the database.

**Ruling taken: the second of the two the reviewer offered.** Letting
`p_expires_at` outrank the window is a W3 **migration**, which the reviewer
itself scopes to W3; this is a W2 UI round on a shared local Postgres. So the
radios are gone and the room states the one date the RPC will land on.

**Changed** — `reach-access.tsx`:

* new exported `grantWindowEnd(seatWindowEnd, warrantyEnd, now)`, which mirrors
  the RPC exactly: the later of the two days, taken only while it is still
  ahead (the RPC reads a window through the END of its last day, and a window
  already closed is the same fact as no window);
* the consequence sentence reads that date; where there is none, a new
  `MINT_FALLBACK_SENTENCE` states the ninety-day term rather than promising a
  window;
* where the warranty IS the later date, a quiet line says so — "This seat runs
  out a warranty, so the door ends with the warranty." — because the date above
  it is then the warranty's;
* `expiry_source` is `engagement_window` or `fallback_90_day`; there is no third
  source the RPC can be made to take from this side of the wire. The comment in
  the file names the W3 migration that would restore the choice.

**Pinned** — the PR‑l test in `reach-access.test.tsx` is replaced by three: a
warranty that outlives the window IS the stated date and no radios render; a
seat with no window states the ninety-day term; a window already closed reads as
no window.

---

## CR3-8 — the verdict band erased a standing verdict

`company-card.tsx` held `useState("")` and nothing seeded it, while
`recordVerdict` writes `verdict.trim() || null`. Two clicks — "Record a verdict"
then "Save the verdict" — wrote NULL over a firm's standing verdict, with the
text it destroyed printed one line above. The designations and payee bands added
in the same round both carry a seeding ref; this one was left out.

**Changed** — a `seededVerdictRef` in the same idiom as its two siblings: seeded
from `card.studio_verdict` once per opening, keyed on the card's id, cleared on
close so a background refetch can never clobber what the studio is typing.

**Pinned** — two tests in `company-card.test.tsx`: an untouched save on a card
holding "Good crew. Slow to send paper." writes that string back, and a first
verdict on an empty card still records.

---

## CR3-9 — the composers ignored the contact rule

The roster row gated Text on `consent === 'granted' && phone`, the person card
on `consent_status === 'granted'` alone, and `grep -rl channels_forbidden
supabase/functions/` returned nothing — so a person carrying BOTH a recorded
grant and a "Never text" rule got a live act, a live Send, and no server
backstop. Direction §2.2 lists E7's readers as "every composer before consent";
C7 rules that the rule outranks.

**Changed**

* `lib/document/contact-rule.ts` — new `contactRuleForbidsSms(rule)`, the one
  predicate all three readers share (and the first half of the CR3‑7 block).
* `roster/roster-row.tsx` — `canText` consults it; the held sentence is now
  chosen ("The studio's rule for <name> says never text. Change the rule on
  their card first." vs the consent sentence) and feeds both the visible
  `sr-only` reason and `onHeldActivate`.
* `people/views/person-profile.tsx` — same gate, with a new exported
  `RULE_FORBIDS_TEXT_SENTENCE` above the "Send a text" act.
* `supabase/functions/_shared/sms.ts` — a new exported
  `contactRuleForbidsSms(supabase, partyId, phone)` asked immediately after the
  consent verdict, refusing with `reason: "contact_rule_forbids_sms"`. It asks
  the ENGAGEMENT first (a per-job override is the same table with
  `subject_type = 'engagement'`), then the seat's CARD, then — for a phone-only
  send with no seat — every card holding that number, mirroring the phone-global
  consent scan. **Fail-closed**, like `channelConsentVerdict`: a rule that
  cannot be read is not a rule that does not exist. The rule binds the
  double-opt-in invite too — "never text" is not "never text except once, to
  ask" — so it sits before the `isInvite` branch and covers `sms-dispatch`,
  `field-daily` and `site-request-dispatch` alike.

**Pinned** — 2 tests on the roster row (held on a grant + rule; open on an
email-only rule), 1 on the person card, 3 on the predicate, and 4 Deno tests in
`_shared/sms.test.ts` (card rule refuses; engagement rule refuses the invite;
an email-only rule leaves the rail open; a failed rule read refuses).

⚠ **Not deployed.** `_shared/sms.ts` is imported by several functions and a
`_shared/*` edit requires redeploying every one of them. This round is local
only; the deploy belongs to the program's ship step.

---

## CR3-10 — two shipped e2e specs asserted removed behaviour

**(a) `e2e/field/field-coordination.spec.ts`.** Beyond the named assertion, the
spec was stale in three more ways this wave made fatal: it opened the sheet with
`/\bAdd\b/`, filled by placeholders that no longer exist, and left the trade
blank (now required for a sub). Rewritten to the labels the sheet actually
renders, to tick the opt-in (never preselected) and record its source and
evidence, and then to assert:

* the seat exists carrying `+15551239876` — and **no** consent word of its own;
* `studio_channel_consent` holds `status = 'pending'` for that number, which is
  what `record_channel_invite` writes and what every gate reads.

The frozen-column seed at `:139` is gone, with the reason written in its place.
(`refuse_legacy_consent_write_trg` fires on UPDATE only, so the seed did not
error — it simply recorded nothing and taught the spec a fact that is no longer
true.)

**(b) `e2e/people/add-sheet.spec.ts`** — ruled above; assertion now
`toEqual([])` with the ruling beside it.

Neither spec was RUN: the QA reviewer owns ports 3000/3002 and this round starts
no server. Both are static-correct against the shipped markup and the shipped
writes; the QA gate is the proof.

---

## CR3-11 — two live regions echoed every announcement

Both new cards defined `announce = (m) => { setAnnouncement(m); notify(m); }`,
feeding the card's own `role="status"` AND the Room's. Every consent, grant,
document, designation, payee and verdict change was announced twice from two
live regions on one screen.

**Changed** — both per-card regions and their `announcement` state are deleted;
`announce` is now the Room's `notify` / `onAnnounce` directly. Direction §5.5
names one destination, SPEC §7 #3 asks for exactly one, and both regions were
this wave's.

**Pinned** — `queryAllByRole("status")` is empty on both cards.

---

## QA‑R3‑4 — Leah task 5's travel-list pane

Tracked, not built. `build/w2c-report.md` §4.6 already scopes SPEC §5.7's
`#state-pick` multi-select "Bring forward" pane to W3, and the reviewer files it
"for completeness, not a regression". "From the rolodex" still opens the
single-pick picker. No change this round beyond the picker's studio resolution
(QA‑R3‑1), which the pane will inherit.

---

## Files changed

```
apps/designer-portal/src/components/document/people/party-profile-sheet.tsx      CR3-1
apps/designer-portal/src/components/document/people/directory/add-person-sheet.tsx
                                                                    QA-R3-1, CR3-2, CR3-3
apps/designer-portal/src/components/document/people/people-room.tsx              QA-R3-1
apps/designer-portal/src/components/document/people/directory/rolodex-seed-sheet.tsx
                                                                                 QA-R3-1
apps/designer-portal/src/components/document/roster/rolodex-picker.tsx           QA-R3-1
apps/designer-portal/src/components/document/people/reach-access.tsx       CR3-4, CR3-6
apps/designer-portal/src/components/document/roster/site-access-card.tsx         CR3-5
apps/designer-portal/src/lib/document/contact-rule.ts                      CR3-7, CR3-9
apps/designer-portal/src/components/document/people/company-card.tsx      CR3-8, CR3-11
apps/designer-portal/src/components/document/people/views/person-profile.tsx
                                                                          CR3-9, CR3-11
apps/designer-portal/src/components/document/roster/roster-row.tsx               CR3-9
packages/supabase/src/hooks/use-studio-contacts.ts                         CR3-2, CR3-3
supabase/functions/_shared/sms.ts                                                CR3-9

tests
apps/designer-portal/src/components/document/people/__tests__/party-profile-edit.test.tsx
apps/designer-portal/src/components/document/people/__tests__/reach-access.test.tsx
apps/designer-portal/src/components/document/people/__tests__/company-card.test.tsx
apps/designer-portal/src/components/document/people/__tests__/person-profile.test.tsx
apps/designer-portal/src/components/document/roster/__tests__/site-access-card.test.tsx
apps/designer-portal/src/components/document/roster/__tests__/roster-row.test.tsx
apps/designer-portal/src/lib/document/__tests__/contact-rule.test.ts
apps/designer-portal/e2e/field/field-coordination.spec.ts
apps/designer-portal/e2e/people/add-sheet.spec.ts
packages/supabase/src/hooks/__tests__/use-studio-contact-rules-and-channels.test.ts  (new)
supabase/functions/_shared/sms.test.ts
```

## Owed to the orchestrator

1. **CR3-7's residue** — the fixture's `block` is not in the rule row. Rule it:
   a column + W3 migration + seed, or amend SPEC §3/§5.1.
2. **CR3-6's migration** — if PR‑l's choice is wanted back, `p_expires_at` must
   outrank a live window in `create_field_link`. W3.
3. **CR3-9's deploy** — `_shared/sms.ts` changed; every importing function needs
   redeploying when this ships.
4. The 26 minors (`CR3‑12..CR3‑37`) and QA‑R3‑2/3/5/6/9 are untouched by design.
