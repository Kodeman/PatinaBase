# W1b — final review round 7, fix log

Three findings in scope: **BLOCKING-1** (`assert_project_party_cards()` still
resolved the studio through `project_consent_org()`, so on a
`studio_id IS NULL` project the only tenant guard on
`project_parties.company_id` / `.warranty_contact_person_id` was INVERTED),
**MAJOR-1** (`identity_phone_numbers()`' seat leg equality-tested the same
guessing resolver, so a seat on a studio-less job of the studio's own work
dropped its number out of a WORST-FIRST reduction and the Directory row printed
`granted` over the studio's own recorded `opted_out`) and **MAJOR-2** (after v4
the shipped party-profile sheet resolves a seat, not an identity, and printed
"Not asked" over a record that says `opted_out`).

Nothing else was touched. Every r7 MINOR stays open exactly as the review left
it — MINOR-r7-1 (`blocks` missing from the compliance guard's `UPDATE OF`
list), MINOR-r7-2 (`supabase/tests/rls/people_directory_scope_test.sql:308`
still asserts 12 columns against 17 and is still the one RED shipped gate),
MINOR-r7-3, MINOR-r7-4, MINOR-r7-5, and the whole carried MINOR list including
MINOR-35 (`w1b-report.md` stale — one bullet was added to §8 for MAJOR-2 and
nothing else in that report was rewritten).

All five W1b files are unapplied on Strata, so they were edited in place
(`supabase/CLAUDE.md`'s standard remediation). No migration number was minted:
00623–00627 still stand, 00621 is untouched, and 00595–00620 remain reserved to
the other program.

Every ruling in `rulings.md` §3 held, R-AW/R-AY included: no seat's frozen
`sms_consent_*` column is read or written by anything below, and no seat read
was reintroduced. The one consent change widens the **number set** a record is
looked up on; the verdict still comes from `studio_channel_consent` alone,
through `channel_consent_status()`.

Two rulings were recorded by Fable for this round and both are honoured here:
**R-BD** (one tenant resolver everywhere; the `studio_id IS NULL` population is
legacy, W3 backfills the unambiguous ones, W7's preflight counts the rest) and
**R-BE** (the party-profile sheet is a W2 reader repoint, not a W1 fix).

---

## BLOCKING-1 — the card guard resolves through `project_tenant_org()`, and the COMMENT no longer names two resolvers as one

**What was wrong.** r6 MAJOR-1 moved every gate in this wave onto
`project_tenant_org()` — the four site-access policies (`00625:216-250`), the
four authority policies through `project_party_org()` (`00624:167-176`), the
Directory's party branch (`00626:1173`) and the seats view (`00626:1493`). The
BEFORE trigger that is the **only** tenant guard on `project_parties.company_id`
and `.warranty_contact_person_id` was left on `project_consent_org()`, whose
`_primary_studio_for()` fallback names a studio nobody on the job belongs to on
5 of 8 local projects. On that population the guard was inverted: it refused
the working studio's OWN cards and accepted a card of the guessed studio.

**What landed** (`supabase/migrations/00624_project_party_window_and_authority.sql`):

- `:350` — `v_org := public.project_tenant_org(NEW.project_id);` (was
  `project_consent_org`). One line, the same substitution r6 made at
  `00625:216-250`, `00624:167-176`, `00626:1173` and `00626:1493`.
- `:304-348` — the block comment now carries the walk and says why, including
  the consequence the review asked to be stated: `project_tenant_org()` is
  CALLER-RELATIVE where the record names no studio, so a writer with no
  `auth.uid()` (service_role, a seed, a backfill) resolves NULL on that
  population and takes the existing `party_card_project_has_no_studio`
  refusal — the honest answer, and already the behaviour for a project that
  resolves to no studio at all. Every project the seed and both suites write a
  pointer on records its `studio_id`, so nothing in the chain relied on the old
  guess.
- `:398-414` — the now-false COMMENT is corrected. It read "both in the studio
  `project_party_org()`/`project_consent_org()` resolves"; it now names
  `project_tenant_org()` as this wave's ONE gate resolver, records that it
  resolved through `project_consent_org()` until r7 BLOCKING-1 and what that
  inverted, and states the caller-relative consequence.
- `:86-104` — the banner's owed-count paragraph gains the sentence the review
  asked for in the deploy brief, plus R-BD. See MAJOR-1 below.

**The suite leg** (`supabase/tests/people/w1b_compliance_authority_directory_test.sql`,
block 14 — the block whose summary previously claimed "may record both" over a
job where two further writes did not land at all):

- four new fixture cards: a firm and a warranty contact in the studio doing the
  work, and the same two in the studio the consent resolver guesses;
- `14t` — the working studio's OWN firm card lands on its own seat;
- `14u` — its OWN warranty contact lands;
- `14v` — the foreign card is first proved unreadable to this caller
  (`count(*) = 0`), so the refusal below proves something;
- `14w` — a FIRM card of the guessed studio is refused
  `party_company_other_studio`;
- `14x` — a PERSON card of the guessed studio is refused
  `party_warranty_contact_other_studio`;
- the block's closing NOTICE now names all four writes and both refusals.

**Not downgraded.** The review offered the downgrade if reachability is
weighted; the fix is one line either way and the guard's own error name was
precisely the violation it permitted, so it was taken as graded.

---

## MAJOR-1 — the number set names the studio DOING the work beside the record's studio, and the "fail-closed" claim is retired

**What was wrong.** `00626:624`'s seat leg was
`public.project_consent_org(pj.id) = p_organization_id` — a single equality
against the guessing resolver, in front of a WORST-FIRST reduction. Dropping a
number can only make the printed word MORE permissive (this function's own r4
MAJOR-3 argument), so on a studio-less job the studio's own seat dropped out
and the identity row printed the affirmative word over the studio's own
recorded refusal, with the seat line printing NULL (the r6 gate) so nothing on
the face argued.

**What landed** (`supabase/migrations/00626_people_directory_v4_seats.sql`):

- `:660-687` — the leg is now "the seat's project BELONGS to
  `p_organization_id`": `pj.studio_id = p_organization_id` when the record
  names one, else EITHER `project_consent_org(pj.id) = p_organization_id`
  (kept — that is where the record lives, R-AK) OR `p_organization_id` itself
  when the job's designer / lead designer / creator actively belongs to it and
  it is an active `design_studio`. That third leg is
  `project_tenant_org()`'s membership leg stated as a **SET** rather than as
  its ranked `LIMIT 1` pick, deliberately: the pick answers "which ONE of the
  CALLER's studios is this job's", and a caller who belongs to two studios of
  the same designer would otherwise drop the number again for whichever studio
  lost the ranking — the same fail-open by another route. It is a strict
  superset of `project_tenant_org(pp.project_id) = p_organization_id`.
- It cannot widen across tenants: the function is gated on
  `is_active_studio_member(p_organization_id)`, so every number returned is
  carried by a seat on a job that studio's own designer of record is doing,
  read by a member of that studio, with the VERDICT still resolved at
  `p_organization_id` under the caller's own RLS (R-BB's requirement: a wider
  same-studio set can only make the word LESS permissive).
- `:599-633` banner and `:701-733` COMMENT — rewritten to carry the walk and to
  **retire the fail-closed claim** the r6 fix log made for this leg. Both now
  say, in those words, that it was fail-OPEN.
- `00624:86-104` banner — the deploy-brief sentence the review asked for: the
  owed count of `studio_id IS NULL` projects on Strata gates a **consent**
  question, not only a visibility one, because the send rail
  (`_shared/sms.ts` `resolveProjectOrg()` over `primaryStudioFor()`) resolves
  the org the same way SQL does, so a `granted` record at the guessed studio
  permits a text to a number the studio doing the work has recorded
  `opted_out`. Recorded as `project_consent_org()`'s own pre-existing posture
  (00594 / R-AK), not something this chain introduces. R-BD's backfill and W7
  preflight are named in the same paragraph.

**The suite leg** — new **block 16**, probe138's mutation control both ways:

- a card in the studio doing the work carrying a permitted number, a second
  work mobile the SAME studio records `opted_out`, and a seat carrying that
  second number on the studio-less job;
- `16a/16b` — premise: the actor is a member of the studio whose card and
  records these are, and is NOT a member of the org the consent resolver
  guesses (without which the fail-open cannot be observed);
- `16c` — the number set contains BOTH numbers;
- `16d` — the Directory row prints `opted_out`;
- `16e/16f/16g` — the control: the same seat moved onto a job that RECORDS its
  studio reads an identical number set and an identical word, so
  `projects.studio_id` no longer decides whether a recorded refusal reaches the
  face.

---

## MAJOR-2 — named in what W2 owes, and the sheet stops printing a word it cannot source

Per **R-BE** this is a W2 reader repoint, not a W1 fix. Two things landed.

1. **Named, with the other two readers**
   (`artifacts/people-room-crm-2026-09-11/build/w1b-report.md` §8, "Owed by this
   wave"): the party-profile sheet is the THIRD reader W2 owes beside
   `directory-view.tsx`'s chips and the head count / seat lines. The bullet
   carries the measurement (of 22 field seats `usePerson` resolves 1 and 21 open
   empty), the call sites the seat id comes from
   (`roster/call-sheet-mount.tsx:72`, the roster row), and the repoint: read
   `people_directory_seats` for the seat, join the identity on `person_id`, and
   take the consent word from the new `consent_status` column — never from
   `status_raw`, which on a card row carries the ARCHIVE state (`active`), the
   third answer the review measured.

2. **The interim guard**
   (`apps/designer-portal/src/components/document/people/party-profile-sheet.tsx:512`):
   `{person ? <ConsentChip status={consent} /> : null}`. With `person` null the
   fallback chain `person?.status_raw ?? meta.sms_consent_status ?? 'not_asked'`
   yielded `'not_asked'` and `ConsentChip` mapped it onto
   `SMS_CONSENT_DISPLAY.not_asked`, so the sheet printed **"Not asked"** for a
   human whose record — and the seat line on the same screen — says
   `opted_out`. It now prints no consent word at all rather than the
   affirmative-adjacent one. Nothing else in the sheet changed: `granted` is
   still `consent === 'granted'` (false), so the composer stays closed, and the
   invite branch still needs a phone that is null.

---

## What was run

```
$ grep -n NEXT_PUBLIC_SUPABASE_URL /Users/kody/Code/patina-merged/apps/designer-portal/.env.local
1:# prod # NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co   ← commented
14:# prod # NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321                    ← commented
19:NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321                             ← ACTIVE, local
   (the worktree carries no apps/designer-portal/.env.local of its own)

$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2715 replayed statements
$ git status --porcelain -- supabase/seed/00-legacy-grants.sql      (empty — no drift)

$ pnpm --dir …/agent-people-build supabase:reset
… Seeding data from supabase/seed/people_crm_dev.sql …
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
$ psql … -At -c "select prosrc like '%project_tenant_org%' from pg_proc where proname='assert_project_party_cards'"   → t
$ psql … -At -c "select prosrc like '%design_studio%'      from pg_proc where proname='identity_phone_numbers'"       → t
$ psql … -At -c "select max(version) from supabase_migrations.schema_migrations"                                      → 20260910152111

$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
W1B_EXIT=0    → 16 blocks + "All W1b assertions passed."
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
W1A_EXIT=0    → "All W1a assertions passed."

$ SUPABASE_DB_URL=…54322/postgres pnpm --dir … db:generate
GEN_EXIT=0
$ git diff --numstat -- packages/supabase/src/database.types.ts      (empty — no drift)
  (first attempt failed on the Docker socket inside the tool sandbox — EPERM,
   not a schema error; re-run with the sandbox off: exit 0)

$ pnpm --dir …/apps/designer-portal type-check        TYPECHECK_EXIT=0
$ npx jest src/components/document/people src/components/document/roster
Test Suites: 24 passed, 24 total   Tests: 256 passed, 256 total
```

No edge function was touched, so no Deno suite is in scope and no `_shared/*`
redeploy is added to the chain.

### Block 14 and block 16, as they now read

```
NOTICE:  14. a studio-less job: the admin of the studio doing the work reads its seat, its site
access card and its authority grant and may record all four — the card, the grant, the seat's FIRM
pointer and its WARRANTY CONTACT, both naming their own rolodex cards — while a firm card and a
person card of the studio the consent resolver guesses are refused party_company_other_studio /
party_warranty_contact_other_studio (r7 BLOCKING-1), … : passed
NOTICE:  16. the number set and the identity's consent word: a seat on a STUDIO-LESS job of this
studio contributes its number, so the studio's own recorded refusal decides the Directory word
(opted_out, not the affirmative one), and the same seat moved onto a job that RECORDS its studio
reads identically — projects.studio_id no longer decides whether a refusal reaches the face
(r7 MAJOR-1, probe138's control both ways): passed
NOTICE:  All W1b assertions passed.
```

### The negative control — `probe143-w1b-fix-r7-negative-control.sql`

Two phases in one file, both ROLLBACKed. Phase A walks the shipped bodies;
Phase B restores r6's two bodies verbatim (`git show HEAD:…`) inside the
transaction and walks the identical fixture, so the new suite legs are shown to
BITE rather than to describe behaviour that was already right.

```
################ PHASE A — the shipped bodies ################
 consent_resolver_names = Leah Hartwell      gate_resolver_names = Local Dev Studio
A: the working studio's OWN firm pointer LANDED
B: the working studio's OWN warranty contact LANDED
 can_the_admin_read_the_foreign_card = 0
C: refused — party_company_other_studio
 company_id = e7100000-…-0000a1 (its OWN firm) | paper_state not_on_file
 record_for_the_seats_number = opted_out
 number_set         = {+16125559996,+16125559997}
 Probe143 Carded Trade | opted_out
 number_set_control = {+16125559996,+16125559997}
 Probe143 Carded Trade | opted_out

################ PHASE B — r6's bodies restored (the pre-fix behaviour) ################
A: REFUSED — party_company_other_studio
B: REFUSED — party_warranty_contact_other_studio
 can_the_admin_read_the_foreign_card = 0
C: a FOREIGN studio's firm pointer LANDED on this studio's seat
 company_id = e7100000-…-0000b1 (the FOREIGN firm) | paper_state not_on_file
 record_for_the_seats_number = opted_out
 number_set         = {+16125559996}
 Probe143 Carded Trade | granted
 number_set_control = {+16125559996,+16125559997}
 Probe143 Carded Trade | opted_out
```

Phase B reproduces both findings exactly as r7 measured them (probe137's A/B/D,
probe138's set and control). Phase A is the fix.

### Cross-tenant, re-walked after the widened number set

```
$ psql … -f probe140-r7-cross-tenant-sweep.sql
 docs 0 | authority 0 | site_cards 0 | seats 0 | grants 1   (grants: 00627's recorded residual)
 the four definer readers: rfq 0 | agreement 0 | plan 0 | invoice 0
 foreign_numbers 0 | foreign_consent_word (empty) | foreign_consent_dates 0
 foreign_numbers_naming_my_own_org 1        ← the caller's OWN p_card_phone_e164
                                              echoed back; identical to the
                                              committed r7 baseline
 writes: site access INSERT refused · document INSERT refused · lockbox UPDATE 0 rows
 anon: permission denied on people_directory, the seats view, v_access_grants,
       the site access card and compliance_state
$ psql … -f probe105-w1b-final-r5-cross-tenant-numbers.sql
 THE LEAK legs: 0 rows, both the login key and the foreign card uuid
 the existence oracle: 0 hits on a seated number and 0 on an unseated one
 consent_word_at_my_own_org: empty
$ psql … -f probe141-r7-r6-blocking1-rewalk.sql
 rfq 0 | agreement 0 | plan 0 | invoice 0 | through_the_ledger 0
 seats 0 | site_cards 0 | authority 0 | docs 0
 client 6 | lead 5        (r6 MAJOR-2's recorded residual)
 positive control: the owning studio's admin still reads the plan grant = 1
```

Suite block 13 (the tenant boundary, which includes "cannot pull a foreign
identity's numbers, consent word or consent dates by naming their OWN org") is
green after the widening.

### The MAJOR-2 premise, re-measured — unchanged, as R-BE expects

```
$ psql … -f probe139-r7-party-sheet-useperson.sql
 usePerson(seat_id, role) rows: 0 for all eight walked seats
 Pete Rusk, both seats: record_word opted_out, sheet_finds_a_row 0
 the card row the view DOES return: person_id d0e10000-…-000012 | role contact |
   status_raw active | consent_status opted_out
```

The SQL side is untouched by design — the repoint is W2's, and the sheet now
prints no chip instead of "Not asked".

### Not re-run, and still red

`supabase/tests/rls/people_directory_scope_test.sql` remains RED at
`:308` (`expected exactly 12 columns, got 17`) — carried MINOR-27 / MINOR-r7-2,
one line, explicitly out of this round's scope.

### Environment note carried forward

The seeded `Leah Hartwell` organisation is re-minted with a fresh uuid on every
reset, so probes that hard-code it are not replayable —
`probe107-w1b-final-r5-consent-fail-open-side-studio.sql` fails on an
`organization_members` FK for exactly that reason and was not repaired (not in
scope). `probe143` resolves that org through
`project_consent_org('b0000000-…-0000d1')` instead and is replayable.
