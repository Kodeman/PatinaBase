# W2 — fix log, round 13

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, from HEAD `5d5760bbe` ("docs(people-room): W2 round-13
adversarial code review"). Eleven findings assigned — `QA-R13-1`, `QA-R13-2`, `QA-R13-3`, `CR13-1`
… `CR13-8`. Nothing else was touched: none of the unassigned carried findings (CR13-9 … CR13-49),
no migration, no seed, no prod surface, no server started.

Gates at the end of the round, all green:

```
$ cd apps/designer-portal && npx tsc --noEmit          → DESIGNER_TC=0
$ cd packages/supabase   && npx tsc --noEmit           → SUPABASE_TC=0
$ cd apps/designer-portal && npx jest                  → 585 suites, 7527 tests passed
$ cd packages/supabase   && npx vitest run             → 104 files, 1306 passed | 12 skipped
$ cd apps/admin-portal   && npx next build --webpack   → ADMIN_BUILD=0   (owed: @patina/supabase changed)
$ npx eslint <the eight changed portal files>          → no output
```

Jest rose 7514 → 7527 and vitest 1297 → 1306: thirteen new portal tests and nine new package
tests, one per finding that has a testable face.

---

## QA-R13-1 · blocking · a consent record named two different origin jobs depending on the surface

**What was wrong.** `roster-row.tsx:245` substituted the SHEET's own project name into R-Q's
sentence for every record it read, whatever `origin_project_id` the record carried. Pete Rusk's
opt-out — one row in `studio_channel_consent` — therefore read "…on the Lindqvist kitchen." on the
Directory (which resolves the record's own origin) and "…on the Okonkwo residence." on the Call
Sheet roster row.

The record itself, read locally:

```
$ psql … -c "select sc.full_name, cc.status, cc.opt_out_at::date, p.name as origin_project
             from studio_channel_consent cc
             left join projects p on p.id = cc.origin_project_id
             left join studio_contacts sc on sc.phone_e164 = cc.channel_value
             where sc.full_name = 'Pete Rusk';"
 Pete Rusk | opted_out | 2025-12-03 | Lindqvist kitchen
```

**What changed.** `apps/designer-portal/src/components/document/roster/roster-row.tsx` — the row
resolves the record's own `origin_project_id` against `useProjects()` and passes THAT name, exactly
as the person card already did (`reach-access.tsx:274-305`). A record naming an origin reads that
job or none; a record naming none keeps the room's standing behaviour (the job in hand).

```tsx
projectName: consentRecord?.record?.origin_project_id ? originProjectName : projectName,
```

**Evidence.** Two new tests in `roster-row.test.tsx`: "names the job the RECORD names, not the
sheet it is read on (QA-R13-1)" (prints "Opted out by text, 3 Dec 2025, on the Lindqvist kitchen."
on the Okonkwo sheet) and "names no job when the record's origin cannot be resolved" (prints
"Opted out by text, 3 Dec 2025." and never the word Okonkwo). Four roster suites gained a
`@/hooks/use-projects` mock, since the row now reads it.

---

## QA-R13-2 · blocking · the site access card never printed the project's street address

**What was wrong.** SPEC §5.6 #1 fixes the head as the job AND "4412 Fremont Ave S, Minneapolis MN
55409". `SiteAccessCard` has carried a `projectAddress` prop since round 6, forwarded by
`call-sheet.tsx:273` and `call-sheet-mount.tsx:62` — and the ONE live mount, `doc/[id]/page.tsx:3422`,
never passed it, because `document_state` (the view the page reads) carries no address column.
`projects.site_address` held the string byte-for-byte all along:

```
$ psql … -c "select name, site_address from projects where id='d0e00000-…-00000000000a';"
 Okonkwo residence | 4412 Fremont Ave S, Minneapolis MN 55409
```

**What changed.** `site-access-card.tsx` reads the fact itself — `useProject(open ? projectId : '')`
from `@patina/supabase` (`select('*')`, so `site_address` is on the row) — and prints
`projectAddress ?? project.site_address` beside the head, in a `[data-site-address]` line. The prop
stays as the caller's override, so nothing that passes one changes. The read is gated on `open`,
like the card's own `useSiteAccessCard`.

**Evidence.** Two new tests in `site-access-card.test.tsx`: the address prints with
`projectAddress={undefined}` when the project holds one, and no address line renders at all when it
does not.

---

## QA-R13-3 · blocking (SPEC acceptance) · "Who was told" holds one entry, the spec asks for two

**Ruling taken: amend the SPEC, do not add the table.** The finding offers two closes — a
change-log table for site-access notices, or a single-entry acceptance criterion. The table is W1
schema work already named as owed to a later wave in `build/w2c-report.md` §4 item 3 and listed
under "scope to W3/W4" in `w2-review-r13-code.md` §5; minting a migration for it inside a W2 fix
round would widen this round past its brief and past the reserved-number window. `00625`'s
`project_site_access_cards` holds a single `changed_at` / `changed_by` / `told_refs` triple, so the
shipped card can only ever print the last change.

**What changed.** `artifacts/people-room-crm-2026-09-11/specimens/SPEC.md` §5.6 #7 now reads: ONE
entry — the last change and who heard it — with the amendment stamped in place (id, date, the
reason, and the wave the log table is owed to). The two-entry specimen stands as the design target
and is explicitly not a W2 defect. No code changed; the shipped face already prints the one entry
the record can support.

---

## CR13-1 · blocking · PR-m's manual opt-out was unreachable on nine of twenty seeded person mobiles

**What was wrong.** Round 12's `channelConsentAxis` returns null for a phone whose `sms_capable` is
false, and `consentable` gated the WHOLE recording band — including PR-m's "They told the studio to
stop" checkbox. 00593 leaves that column at its `false` default wherever there is no SMS-rail
evidence:

```
$ psql … -c "select count(*) from studio_contact_channels c join studio_contacts sc on sc.id=c.owner_id
             where c.owner_type='person' and c.channel_kind='mobile' and c.sms_capable=false;"
 9
```

(Adaeze Okonkwo, Carol Nyström, Chidi Okonkwo, Kelly Marsh, Leah Hartwell, Owen Ashby, Priya
Natarajan, Sam Rowe, Tom Marrow.) And there was no way back: `sms_capable` had only INSERT-time
writers, and `useUpdateStudioContactChannel` had no caller anywhere in `apps/*/src` or
`packages/*/src`.

**What changed.** Both limbs the finding names.

1. *Display and offer are two questions* (see CR13-2): `readable` / `showConsentWord` decide what is
   PRINTED; `consentable` still decides what is OFFERED, so CR12-1's rule ("consent is offered on a
   line that can take the message") is untouched.
2. *The door back*, which 00593's own backfill note anticipated ("a wrong `true` is then a card the
   studio has to correct by hand"): a phone row whose `sms_capable` is false now prints "Patina has
   not been told this line takes texts, so nothing about texting can be written down on it yet."
   and a tertiary act **"This line takes texts"** calling the already-written
   `useUpdateStudioContactChannel({ smsCapable: true })` — whose `invalidateChannelFanout` already
   fans out to `studioChannelKeys`, `studioContactKeys.detail`, `peopleKeys.all` and
   `peopleSeatKeys.all`. Once written, the whole recording band opens, PR-m's checkbox included.
   The act carries its own visible `role="alert"` refusal slot (the recording band's is inside a
   `hidden` div).

The write is reachable for a studio member — `studio_contact_channels_member_update` is
`is_active_studio_member(studio_contact_org(owner_id))` USING **and** WITH CHECK, and the only
BEFORE UPDATE triggers on the table are the owner-kind assert, the value normaliser and
`set_updated_at`. Rehearsed locally in a rolled-back transaction:

```
$ psql … -c "begin; update studio_contact_channels set sms_capable=true
             where id='35e10eb9-…' returning id, sms_capable; rollback;"
 35e10eb9-693e-438f-9fb6-afdbd8bfe40c | t     (UPDATE 1)
```

**Evidence.** Three new tests in `reach-access.test.tsx`: the act appears on an unconfirmed mobile
and calls the hook with `{ id, ownerId, smsCapable: true }`; "Record consent" is absent BEFORE it
and present after (with PR-m's checkbox reachable); and the act disappears once the line is
confirmed. The existing CR12-1 tests — Ray Thao's office line and his 311 handle offering no word,
no sentence and no "Record consent" — still pass unchanged.

---

## CR13-2 · major · the consent word four other faces printed was invisible on the card that owns the channel

**What was wrong.** `identity_consent_status` (00626) reduces over `identity_phone_numbers()` and
never consults `sms_capable` (`pg_get_functiondef` — no such predicate in the body), so a record on
an unconfirmed number still drives the Directory row's word and clause, the seat line,
`v_project_roster.sms_consent_status`, the Call Sheet row and vitals, and the person card's own
`canText` → "Send a text". Only the Channels row for that very number printed nothing — no word, no
R-Q sentence, no door. Reachable today: `useRecordPartySmsConsent` and `useAddProjectParty`'s
"text updates" tick both write `record_channel_invite` against the seat's `phone_e164` with no
channel lookup.

**What changed.** `reach-access.tsx` splits the axis in two:

```ts
channelConsentAxis(channel)      // WRITE: sms only when sms_capable; email kinds; else null
channelConsentReadAxis(channel)  // READ:  a phone reads sms, an email address reads email; else null
```

`useChannelConsent` is asked on the READ axis, the R-Q sentence prints whenever that read resolves
a record, and the consent WORD prints when the row is writable (so "Not asked" still shows on a
textable line) or when a record exists. Every write stays gated on the write axis, and a portal
handle reads nothing either way.

**Evidence.** New test in `reach-access.test.tsx`: an unconfirmed mobile carrying an opted-out
record prints both the `[data-state-family="consent"]` word and "Opted out by text, 3 Dec 2025, on
the Okonkwo residence." CR12-1's own tests still pass: Ray Thao's landline and portal handle hold no
record, so they still print nothing.

---

## CR13-3 · major · the seat line spoke the column vocabulary, and called a household member a "Client Rep"

**What was wrong.** `seatLineParts` composed the line from `getPartyKindLabel` /
`getFieldTradeLabel` — `field-config.ts`'s Title-Case COLUMN HEADS — so the canonical specimen row
read "Okonkwo residence · Subcontractor · Electrical · ON THE JOB · …" where SPEC §5.1 #8 fixes
"… · sub · electrical · On the job · …", and the identity line two rows above already lower-cased
the same trade. Worse, the Add sheet's door says "a household member" and every seat it writes
printed "Client Rep" on the Directory seat line, the person card's Seats region and Past seats.

**What changed.** `seat-line.tsx` gains `SEAT_KIND_WORDS` (the studio's voice: `sub`, `GC`,
`installer`, `receiver`, `household member`, `client`, `inspector`, `lender`, `engineer`, `vendor`,
`architect`, `photographer`, `stager`, `contact`), `seatKindWord()` and `seatTradeWord()` (the trade
lower-cased, the same case `personIdentityLine` uses), all three used by `seatLineParts`. Past seats
in `person-profile.tsx` now render `seatLineParts(seat).join(" · ")` instead of its own inline
array, so the two lines cannot drift again. `PARTY_KIND_LABELS` is untouched — it is still the
column-head vocabulary.

**Evidence.** New test in `people-primitives.test.tsx` ("calls a household member what the door that
wrote it calls them": `client_rep` → "household member", `gc` → "GC"); four existing assertions
across `people-primitives`, `person-profile` and `person-row-hardening` updated from
"Subcontractor · Electrical" to "sub · electrical" — they were pinning the defect.

---

## CR13-4 · major · two reducers decided one paper fact and disagreed twice

**What was wrong.** The company card's table decided each row's word in the browser from
`expires_on` alone, over a list `useComplianceDocuments` filtered with a flat
`.is('superseded_by', null)`. `compliance_state()` / `identity_paper_state()` — what the firm row,
the seat line and the person card's fold read — differ on two axes: R-BF makes supersession
TRANSITIVE with a depth cap and a gates test, and 00623:658-668 moves a document off `current` only
when `cardinality(d.blocks) > 0` ("a date with no gate changes nothing"). Seven of the 36 seeded
documents carry `blocks = {}`:

```
$ psql … -c "select count(*) filter (where cardinality(blocks)=0) gateless, count(*) total
             from studio_compliance_documents;"
 7 | 36
```

**What changed.** One rule per axis, each in the place that owns it.

* `packages/supabase/src/hooks/use-studio-contacts.ts` — new exported
  `retainedComplianceDocuments(rows, today)`, the SQL's retirement rule in TS: a row leaves the list
  only while a reachable successor (walked transitively, depth-capped at 64, cycle-guarded) is IN
  FORCE and carries at least the root's gates. `useComplianceDocuments` now fetches the whole chain
  (a superseded row is what decides whether its predecessor is retired) and applies that rule,
  instead of a flat `superseded_by IS NULL` WHERE clause. `includeSuperseded` still returns
  everything; a successor the caller cannot see retires nothing.
* `compliance-table.tsx` — `documentPaperState` returns `current` for a document with no gates,
  before it looks at any date.

**Evidence.** Five new vitest cases in `people-crm-foundation.test.ts` (retires on an in-force
successor; walks A→B→C transitively where B has itself expired; keeps a row whose successor lapsed;
keeps a row whose successor dropped its gates; keeps a row whose successor is invisible, and never
loops on a cycle) and one new jest case in `compliance-table.test.tsx` ("a paper with no gate cannot
lapse, whatever its date says").

---

## CR13-5 · major · the hard-delete guard asked a different question than the face's refusal

**What was wrong.** `useRemoveProjectParty` tested `studio_compliance_documents WHERE holder_id =
<card>` while the face refuses on `identity_paper_state(card, COALESCE(seat.company_id,
card.company_id))` (R-BA / R-BJ) — the person's own paper AND their firm's. And a PostgREST read
refused by RLS returns `[]` rather than raising, so the guard read "no paper held" exactly where it
could see least, on the one surviving hard delete.

**What changed.** `packages/supabase/src/hooks/use-coordination.ts` — the seat select gains
`company_id`; the guard resolves the firm the way R-BJ does (the seat's own when it names one, the
card's otherwise) and calls `identity_paper_state`, the same function the face's word comes from. A
result that is not a string (a null answer, a read that could not answer) counts as paper held:

```ts
hasComplianceDocument = typeof paper === 'string' ? paper !== 'not_on_file' : true;
```

**Evidence.** New vitest file `use-remove-project-party-guard.test.ts` — four cases: the RPC is
called with the seat's own firm; it falls back to the card's firm when the seat names none; a
`lapsed` firm word refuses the delete with the waiver sentence; and a read that answers nothing
refuses too, rather than deleting.

---

## CR13-6 · major · the Payee region asserted a payee the studio never wrote

**What was wrong.** `company-card.tsx:880` printed `Remit to {card.remit_to ?? name}`. On the local
seed `remit_to` is NULL for Northgate Electric, so the card asserted "Remit to Northgate Electric"
from nothing — on the region a bookkeeper reads before cutting a cheque, and the one region
direction §1 line 5 makes this card the sole writer of.

```
$ psql … -c "select company_name, remit_to from studio_contacts where company_name='Northgate Electric';"
 Northgate Electric |        (NULL)
```

**What changed.** `card.remit_to ? "Remit to <x>" : "No remit-to on file."`, the
existing "Edit payee" act untouched beside it — the same shape every other absent record in this
build prints (R-V / C32).

**Evidence.** New test in `company-card.test.tsx`: with `remit_to = null` the card prints "No
remit-to on file." and never "Remit to Northgate Electric".

---

## CR13-7 · major · the Add sheet's door and its own prose named the same thing differently

**What was wrong.** The kind switch offers "a household member"; the intro read "Add a **client
rep** to a project…" and the refusal "A **client rep** needs a name." — both through
`KIND_NOUN[SEAT_PARTY_KIND['household']]`, i.e. the noun of the `PartyKind` the door WRITES. C5's
letter was kept (the underscored string never reached a face) and its rule — one door, the studio's
words — was not.

**What changed.** `add-person-sheet.tsx` gains `DOOR_NOUN: Record<SeatAddKind, string>` keyed on the
sheet's own `AddedPersonKind` (`GC`, `sub`, `installer`, `receiver`, `household member`, `contact`)
plus `withArticle()`, used by both sentences. The now-unreferenced `KIND_NOUN` map is deleted.

**Evidence.** Two new tests in `add-person-sheet-kinds.test.tsx`: the household door's intro reads
"Add a household member to a project", its refusal reads "A household member needs a name.", and the
string "client rep" is nowhere on the face; and the installer door takes its own article ("Add an
installer to a project").

---

## CR13-8 · major · the person card paired one firm's name with another firm's role and year

**What was wrong.** The card read `person.meta.company_name` (one firm) beside
`affiliations[0].role_at_firm` and `from_date` — an arbitrary open affiliation from a query with no
ORDER BY. R-AO makes affiliations N persons × N firms with siblings left standing, which the Add
sheet creates when an existing person is seated under a second firm, so SPEC §5.2 #1's "Northgate
Electric · owner-operator, since 2025" could print another firm's role and year, and could flip
between renders.

**What changed.**

* `packages/supabase/src/hooks/use-studio-contacts.ts` — `useAffiliations` orders
  `from_date desc nulls last, id asc`, so the list any face reads (the person card AND the company
  card's crew list) is stable.
* `person-profile.tsx` — the card picks the affiliation whose `company_id` matches the firm it is
  NAMING (`person.meta.company_id`, which `people_directory`'s card branch builds — confirmed in
  `pg_get_viewdef`), falling back to the first ordered row only when the card names no firm.

**Evidence.** New test in `person-profile.test.tsx`: with a second open affiliation at
`firm-marrow` ("office manager, since 2019") returned FIRST, the card still prints "Northgate
Electric · owner-operator, since 2025" and the string "office manager" appears nowhere. The test
fixture's `meta` gained `company_id`, which the real view emits and the fixture had been missing.

---

## What was deliberately NOT touched

Every carried finding the round did not assign — CR13-9 … CR13-49, including the `--color-linen`
definition, the five dead `useFeatureFlag` imports, the two dead `call-sheet` flag mocks, the
avatar measures, the `authorityPhrase` divergence, the `compliance-table` UTC date comparison
(CR13-35, adjacent to CR13-4's file and left alone on purpose), the `project_consent_org` call
sites (CR13-31, a ruling is owed), and CR13-45's paper-word vocabulary (a ruling, not a code
change). No migration, no seed, no edge function, no iOS surface, no Sanity article. No server was
started and no database was written to outside one rolled-back rehearsal transaction.
