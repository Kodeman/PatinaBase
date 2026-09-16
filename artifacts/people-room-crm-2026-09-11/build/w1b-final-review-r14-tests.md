# W1b — final review round 14: tests, types, behaviour

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`. Local DB only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`), which this wave owns exclusively for the
duration of this review. Migration ledger confirmed at `00590 00591 00592 00593 00594 00621 00622 00623
00624 00625 00626 00627 20260910152111` before AND after a fresh `supabase:reset` run mid-review — no
drift.

Scope read first: `build/w1b-report.md` (619 lines), `rulings.md` §3 (R-A .. R-BJ), `build/w1b-final-fix-log-r13.md`
(the two r13 MAJORs — R-BI ruled-not-patched, R-BJ fixed), and `briefing/fixture.md` for F-11/F-12/F-16/F-27.

## 1. Prior fix log (r13) — re-checked

| Finding | r13 disposition | r14 re-check |
|---|---|---|
| MAJOR-1 (studio-less duplicate identity) | Ruled R-BI, not patched — two rows kept until W3's backfill, residue asserted (block 23c-23e) | **CONFIRMED STILL RULED, TESTS GREEN.** `00626`'s §1b banner, `rolodex_card_for_party_phone()`'s COMMENT, and 00624's third preflight count are all in place (`supabase/migrations/00626_people_directory_v4_seats.sql`, `00624_project_party_window_and_authority.sql`). Block 16-18 and 23c-23e of the W1b suite pass. Not a finding — this is a recorded ruling in `rulings.md` §3 (R-BI). |
| MAJOR-2 (auto-linked seat's paper word) | Fixed: `people_directory_seats.paper_state` now `identity_paper_state(pp.studio_contact_id, COALESCE(pp.company_id, sc.company_id))` | **CONFIRMED FIXED.** Verified the exact line in `supabase/migrations/00626_people_directory_v4_seats.sql:2017-2026`. Block 22-23 of the suite (`w1b_compliance_authority_directory_test.sql`) pass, including the r13 negative control (old formula vs. shipped formula on Dana Kowalski's inline-added seat). |

Both r13 items are closed as documented. No regression found in either.

## 2. SQL test suites — full run, twice (before and after a fresh reset)

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
...
NOTICE:  All W1a assertions passed.
ROLLBACK
EXIT=0   (49 NOTICE lines, unchanged from close-out)

$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
...
NOTICE:  23. the auto-linked seat prints the identity's paper word — lapsed under a row reading lapsed,
         where it read not_on_file (r13 MAJOR-2) — a seat naming its own firm still keeps that firm's word,
         and the studio-less population's second identity is the RULED residue of r13 MAJOR-1: two rows
         until R-BD's W3 backfill, and never the affirmative consent word: passed
NOTICE:  All W1b assertions passed.
ROLLBACK
EXIT=0   (24 NOTICE lines = 23 blocks + summary)
```

Reset, replayed:

```
$ python3 scripts/generate-legacy-grants.py
wrote .../supabase/seed/00-legacy-grants.sql — baseline + 2723 replayed statements
$ git diff --stat -- supabase/seed/00-legacy-grants.sql
   (no diff — byte-for-byte reproducible, matches r13's own baseline)

$ pnpm --dir .../agent-people-build supabase:reset
RESET_EXIT=0
Seeding data from supabase/seed/people_crm_dev.sql...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
   # zero /error/i lines besides the "Applying migration ...458_sms_message_error_capture.sql" filename

$ psql ... -At -c "select string_agg(version,' ' order by version) ... where version >= '00590';"
00590 00591 00592 00593 00594 00621 00622 00623 00624 00625 00626 00627 20260910152111
```

Both suites re-run clean after the reset (identical NOTICE output to above). **Reset/replay: no failure.**

## 3. Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir .../agent-people-build db:generate
GEN_EXIT=0   (Docker-socket permission denied under the default sandbox; re-ran with the sandbox
              override, which is the only way to reach the local Supabase CLI's docker inspection —
              not a defect in the branch)
$ git -C .../agent-people-build diff --stat packages/supabase/src/database.types.ts
   (no output — empty diff)
$ git -C .../agent-people-build status --porcelain packages/supabase/src/database.types.ts
   (no output — clean)
```

Generated types are byte-identical to what is checked in. No drift.

## 4. Type-check

```
$ pnpm --dir .../agent-people-build --filter @patina/supabase type-check
> tsc --noEmit
SUPABASE_TC_EXIT=0   (clean, no output)

$ pnpm --dir .../agent-people-build --filter @patina/designer-portal type-check
> tsc --noEmit
DESIGNER_TC_EXIT=0   (clean, no output)
```

**No type breaks.** Consistent with the empty `database.types.ts` diff — there was nothing new for either
package to disagree with.

## 5. Role probes — designer, client, anon

Pattern lifted verbatim from the suite's own `pg_temp.assume_user` / `pg_temp.assume_anon` helpers
(`supabase/tests/people/w1b_compliance_authority_directory_test.sql:29-58`), run standalone against the
live (non-transactional-suite) seeded database.

**designer@patina.dev** (`a0000000-…-004`, owner of `b0000000-…-0001`, the studio holding the Okonkwo
fixture):

```
 role   | count          people_directory_seats_rows  31
--------+-------         site_access_cards             1
 client |     7          authority_grants             11
 contact|    49          compliance_documents         36
 lead   |     5          v_access_grants_rows         13
 sub    |     1          v_project_roster_rows        31
```

Matches `w1b-report.md`'s own probe58 counts exactly (role counts, entity_kind 28+21, etc.).

**client@patina.dev** (`a0000000-…-005`): not an `organization_members` row anywhere, and not the
`client_id` of either Okonkwo residence or Lindqvist kitchen (both `client_id IS NULL` — no seeded client
is attached to the studio that owns the site access card). Reading as this role:

```
 people_directory role counts: 0 rows
 people_directory_seats_rows:  0
 v_project_roster_rows:        0
 authority_grants:             0
 compliance_documents:         0
 project_site_access_cards: SELECT succeeds, count = 0  (RLS narrows to nothing — no client leg exists in
                                                          the policy at all, so no client, related or not,
                                                          can ever match)
```

This reproduces the report's own probe58 "what a CLIENT account reads" figures exactly (0/0/0/0). The seed
does not attach `client@patina.dev` to studio `b0000000-…-0001` at all, so this is a weaker probe than an
authorized-but-still-refused client would be; **the stronger guarantee — a client role denied against the
project that actually owns the card — is what the suite's own block 7, 13 and 15 assert with a synthetic
fixture, and those pass.** Reading the RLS directly (`supabase/migrations/00625_project_site_access_cards.sql:236-275`)
confirms all four policies are `is_active_studio_member(project_recorded_studio(...)) AND
is_studio_comember(project_designer(...))` — no client disjunct exists to add one, and `REVOKE ALL ...
FROM PUBLIC, anon, authenticated` followed by a scoped `GRANT ... TO authenticated` (line 279-282) means a
client role's only path to a row is the same USING clause every other authenticated caller gets. **Client
cannot see `project_site_access_cards` — confirmed both by direct probe and by reading the policy text.**

**anon**:

```
people_directory:          permission denied for table studio_contacts   (refused — anon has no SELECT on
                                                                            the base tables the view joins,
                                                                            confirming the report's own
                                                                            "pre-existing artefact" note:
                                                                            the view's OWN grant shows
                                                                            anon_select=t from the legacy
                                                                            blanket grant, but security_invoker
                                                                            means it can never actually read
                                                                            anything through it)
people_directory_seats:    permission denied for view people_directory_seats
project_site_access_cards: permission denied for table project_site_access_cards   (refused at the GRANT,
                                                                                     before any policy runs
                                                                                     — matches report §7)
v_access_grants:           permission denied for view v_access_grants
project_party_authority:   permission denied for table project_party_authority
studio_compliance_documents: permission denied for table studio_compliance_documents
```

Anon reads nothing anywhere in this wave's surface. Confirmed.

## 6. F-11 / F-12 / F-16 / F-27 against the fixture

As `designer@patina.dev`:

```
 display_name  |  role   | reach_state | consent_status | paper_state |  contact_rule_summary
---------------+---------+-------------+----------------+-------------+-------------------------
 Amara Osei    | contact | on_paper    | granted        | lapses_soon | (none)
 Dana Kowalski | contact | field_link  | granted        | lapsed      | (none)
 Pete Rusk     | contact | field_link  | opted_out      | current     | (none)
 Ray Thao      | contact | on_paper    | not_asked      | not_on_file | Never text. Use: email, office,
                                                                          portal_311. Hours: Weekdays
                                                                          08:00 to 16:00.
```

Checked against `fixture.md` (lines 38, 39, 43, 54):

- **F-11 Dana Kowalski / Northgate Electric**: fixture says field link, granted (2026-10-12 on the Okonkwo
  row), COI lapsed 2026-03-31. → `field_link` / `granted` / `lapsed`. **Matches.**
- **F-12 Pete Rusk / Rusk Mechanical**: fixture says field link, opted_out (STOP on the 2025 Lindqvist
  thread, carried by phone), COI current to 2027-01-15. → `field_link` / `opted_out` / `current`.
  **Matches** — and his reach still reads `field_link` despite the opt-out, which is R-BH's explicit ruling
  (opted out of texts, not of the link) and block 12/23 assert it.
- **F-16 Amara Osei / Lakeshore Painting Co.**: fixture says "on paper (would be account if the FK were
  set)", granted (web form 2026-10-14), COI current but the seed deliberately sets it to
  `CURRENT_DATE + 23` to demonstrate the moving `lapses_soon` boundary. → `on_paper` / `granted` /
  `lapses_soon`. **Matches**, including the deliberately-near-expiry paper word.
- **F-27 Ray Thao / City of Minneapolis CPED Inspections**: fixture says on paper, never texted, n/a
  consent, no paper (AHJ owes none). → `on_paper` / `not_asked` / `not_on_file`, rule "Never text... Hours:
  Weekdays 08:00 to 16:00." **Matches** — the DB fact `not_on_file` is correct (an AHJ holds no paper);
  R-A/R-N's "no paper word at all" is the display layer's job, not this layer's, and SQL block 12g asserts
  that split holds.

All four fixture identities check out exactly against `fixture.md`'s own words.

## 7. Every reader of `people_directory` / `v_project_roster` columns

`grep -rl` across `apps/` and `packages/` (not limited to the table in `w1b-report.md` §4, to catch
anything the report's own list might have missed):

```
$ grep -rln "people_directory\b" apps packages --include="*.ts" --include="*.tsx"
$ grep -rln "v_project_roster\b" apps packages --include="*.ts" --include="*.tsx"
```

Beyond the files `w1b-report.md` §4 already names (`use-people.ts`, `people-derivation.ts`,
`desk-derivation.ts`, `roster-derivation.ts`, `people-room.tsx`, `directory-view.tsx`, `person-row.tsx`,
`person-profile.tsx`/`nurture-view.tsx`/`outreach-view.tsx`/`portfolio-view.tsx`, `audience-rules.ts`/
`audiences-tab.tsx`, `party-profile-sheet.tsx`, `command-bar.tsx`, `desk-reconnect.tsx`, hooks `index.ts`),
the grep additionally surfaces:

| File | What it is |
|---|---|
| `apps/designer-portal/src/components/document/brief-section.tsx` | comment only, no read |
| `apps/designer-portal/src/components/document/overlays/household-sheet.tsx` | comment only, no read |
| `apps/designer-portal/src/components/document/people/directory/makers-marketplace.tsx` | comment only, no read |
| `apps/designer-portal/src/components/document/people/person-bits.tsx` | comments describing the shape; no `.from()` call |
| `apps/designer-portal/src/components/document/people/profile/maker-profile.tsx` | comment only, no read |
| `apps/designer-portal/src/components/document/roster/roster-row.tsx` | comments describing `v_project_roster` / `people_directory`'s split; the actual data comes in as props from `call-sheet-mount.tsx` / `call-sheet.tsx` |
| `packages/supabase/src/hooks/use-clients.ts` | comment only, no read |
| `packages/supabase/src/hooks/use-vendors.ts` | comment only, no read |
| `apps/designer-portal/src/components/document/letterhead-instruments.tsx` | comment only, no read |
| `apps/designer-portal/src/components/document/roster/call-sheet.tsx` | comment only in the grep hit; reads via `call-sheet-mount.tsx` |
| `apps/designer-portal/src/components/document/roster/call-sheet-mount.tsx` | comment referencing both tables; the actual query is `useProjectRoster` |
| **`packages/supabase/src/hooks/use-coordination.ts`** | **actual reader**: `useProjectRoster()` (`:1005-1018`) does `.from('v_project_roster').select('*').eq('project_id', projectId)`, typed by `ProjectRosterRow` (`:974-993`), which includes `sms_consent_status`. |

`use-coordination.ts`'s `useProjectRoster` is the one genuine reader the report's table doesn't name by
file (it's implied by `call-sheet-mount.tsx`/`roster-row.tsx` consuming its output, but the actual
`.from('v_project_roster')` call lives here). **Not a W1b concern**: none of 00623-00627 touches
`v_project_roster`'s definition (confirmed by grep — every hit in the new migrations is a comment
cross-reference, never a `CREATE OR REPLACE VIEW v_project_roster`); its `sms_consent_status` column is
R-AV's territory (W1a/close-out), already ruled and already reads the record per that ruling. No new
finding here — listed for completeness since the task asked for every reader, not just the ones the
report already named.

Every other newly-found file is a comment/doc-string reference with no actual query — correctly excluded
from `w1b-report.md`'s reader table, which only lists files that actually consume the row shape.

## 8. BLOCKING — an `opted_out` seat's phone can be moved, live, with no new consent recorded

**This is a new finding, not covered by any ruling in `rulings.md` §3 (including R-AX, which is the ruling
this defeats) and not mentioned in `w1b-report.md` or either fix log.**

### The mechanism

`refuse_legacy_consent_write()` (`supabase/migrations/00594_studio_channel_consent.sql:854-921`) is the
trigger R-AX describes: *"An `opted_out` seat's phone_e164 cannot move... so the rule lives where the
portal hook cannot be bypassed."* Its phone-freeze clause, at **`00594_studio_channel_consent.sql:914-920`**:

```sql
IF OLD.sms_consent_status = 'opted_out'
   AND NEW.phone_e164 IS DISTINCT FROM OLD.phone_e164 THEN
  RAISE EXCEPTION 'consent_opted_out_phone_frozen' ...
```

This checks the SEAT's OWN legacy column, `project_parties.sms_consent_status`. But `00622_consent_record_is_the_only_gate.sql`
(R-AY, "record-only consent", the very migration this program's consent architecture stands on) retires the
mirror that used to keep that column in sync with the truth, and — as `w1b-report.md` §6 states outright —
**"Every seat is born at the column default `not_asked` and `studio_channel_consent` carries the truth."**
Confirmed directly: Pete Rusk's own Okonkwo seat (`d0e30000-…-0012`) carries `sms_consent_status =
'not_asked'` on its own row, while `studio_channel_consent` for his number (`+16125550112`, org
`b0000000-…-0001`) correctly reads `opted_out`. **No seat created or touched under the current architecture
will ever again carry `'opted_out'` in this column** — so `OLD.sms_consent_status = 'opted_out'` can never
be true, and the trigger's phone-freeze clause is permanently dead code for any row this program's own
write paths produce.

The portal has the **identical** blind spot: `useUpdateProjectParty` in `packages/supabase/src/hooks/use-coordination.ts:668`
reads `currentStatus = currentRow.sms_consent_status` (the same frozen column) and only refuses a phone
edit at **`use-coordination.ts:758`** — `if (phoneGenuinelyChanged && currentStatus === 'opted_out')
{ throw new Error(OPTED_OUT_PHONE_EDIT_SENTENCE); }` — which is equally unreachable for the same reason.
**This is not a DB-only regression with an app-level backstop: the actual designer-portal UI has no
backstop either.**

### Walked, live, on the seeded fixture

As `designer@patina.dev` (`a0000000-…-004`, studio owner):

```sql
UPDATE public.project_parties SET phone = '+19995551234', phone_e164 = '+19995551234'
 WHERE id = 'd0e30000-0000-0000-0000-000000000012';  -- Pete Rusk's Okonkwo seat
-- NOTICE:  PHONE MOVE SUCCEEDED   (no exception — the freeze never fired)
```

For Pete Rusk specifically the visible consequence is contained, **but only because he is a carded
identity**: `people_directory`'s consent word for a carded human reduces over the CARD's own number too
(00626, R-BC), and I never touched `studio_contacts`' own phone — only the seat's. His Directory row still
read `consent_status = opted_out` after the move in this run.

**The uncontained case — an uncarded identity, whose Directory row IS keyed on the phone number
(`party_identity_key()`'s rule 3) — loses the opt-out outright.** Constructed directly against the live
seeded database, org `b0000000-…-0001`:

```sql
-- record a real opt-out for a fresh number, no card involved
SELECT record_channel_consent('b0000000-…-0001', 'sms', '+15005550001', 'opted_out', 'inbound_sms', 'STOP reply', NULL, NULL);
-- add an uncarded seat carrying that number
INSERT INTO project_parties (..., studio_contact_id) VALUES (..., NULL) -- phone +15005550001

--- BEFORE ---
 display_name       | phone           | consent_status | reach_state | seat_count
 Test Uncarded Sub   | (500) 555-0001  | opted_out      | on_paper    | 1

UPDATE project_parties SET phone = '(500) 555-9999', phone_e164 = '+15005559999' WHERE id = '99990000-…-01';
-- NOTICE: UNCARDED PHONE MOVE SUCCEEDED   (no exception)

--- AFTER ---
 display_name       | phone           | consent_status | reach_state | seat_count
 Test Uncarded Sub   | (500) 555-9999  | not_asked      | on_paper    | 1
```

**The opt-out is gone from every reader that will ever be asked about this seat again** — `not_asked`
where it read `opted_out` one statement earlier, with zero newly recorded consent. The original
`studio_channel_consent` row for `+15005550001` is untouched (evidence at that address is not destroyed —
`select * from studio_channel_consent where channel_value='+15005550001'` still shows `status=opted_out`
after the move), but it is now orphaned: no seat, no Directory row, no reader will ever surface it again for
this person, because the identity key that used to resolve to it (the phone number itself) no longer
matches anything live.

### Why this is BLOCKING under the stated rubric

*"An opt-out can be lost or overwritten without a newly recorded consent"* — this is exactly that, reached
through an ordinary, RLS-permitted write (`project_parties`' UPDATE policy is `is_studio_comember(designer_id)`,
per the trigger's own comment at `00594:...`, so any authenticated co-member of the studio can do this via
PostgREST directly), and through the shipped portal's own "edit a party's phone number" flow with **no
error, no warning, no confirmation** — the exact opposite of the sentence `OPTED_OUT_PHONE_EDIT_SENTENCE`
exists to show.

### Why this wasn't caught by the existing green suites

`w1a_identity_channels_consent_test.sql` block 43 (`:5728-5876`) does assert
`consent_opted_out_phone_frozen` fires — but its fixture **directly `INSERT`s a row with
`sms_consent_status = 'opted_out'`** (`:5745-5750`) to construct the condition, bypassing every current
write path (`useAddProjectParty` never sets this column to anything but its default; nothing else writes
it since R-AY). That test proves the trigger's mechanism is correct *for a row shaped the way the schema
looked before R-AY* — a shape this program's own write paths no longer produce. It is the same category of
risk `w1b-report.md` itself names when justifying why blocks 3-4/9-12 assert against the seeded fixture
rather than a synthetic one ("a test that re-invented Dana's two seats would prove the view works on data
the room will never hold") — block 43 is the mirror image: it proves a guard works on data **the room can
no longer produce**, which is worse than not testing it, because it reads green.

### Fix (not applied — reporting only, per the task)

The freeze clause (both in SQL and in `use-coordination.ts`) needs to ask the RECORD, not the seat's own
column: `channel_consent_status(project_consent_org(project_id), 'sms', OLD.phone_e164) = 'opted_out'`
(or the equivalent `channelConsentVerdict` call client-side) in place of `OLD.sms_consent_status =
'opted_out'`. This is a one-clause change in a trigger this wave did not touch, sitting directly beneath
the identity-consent reduction 00626 built — in scope for this review because it is the exact mechanism
R-AY's own architecture (which 00626 depends on and displays) silently defeated.

## 9. Everything else

No other BLOCKING or MAJOR findings. Specifically checked and clean:

- `compliance_state()` / `identity_paper_state()` (00623/00626): worst-first reduction, transitive
  supersede walk (R-BF), `blocks[]`-gated lapse/lapses_soon — read the function bodies directly; matches
  the extensive r1-r10 lineage comments and all pass in block 1-3/19.
- `project_site_access_cards` (00625): four policies, dual-gated on `project_recorded_studio` AND
  `is_studio_comember(project_designer)`, no client leg, `REVOKE ALL ... FROM PUBLIC, anon, authenticated`
  before a scoped re-grant — read directly, matches PR-w exactly.
- `project_party_authority` (00624): PR-n's money/draw_certify admin gate is in the INSERT/UPDATE policies
  themselves (`scope NOT IN ('money','draw_certify') OR is_org_admin_or_owner(...)`), not only in the
  portal — read directly, matches.
- `studio_channel_consent`: no INSERT/UPDATE/DELETE policy exists for `authenticated` at all (only
  `..._member_select`), so the record itself cannot be tampered with directly via PostgREST — the only
  write door is `record_channel_consent()` / `record_channel_reconsent()`, both SECURITY DEFINER. The §8
  finding is entirely about the SEAT-to-number binding in `project_parties`, not about record tampering.
- Tenant boundaries: blocks 13-18 and 20 of the W1b suite (co-member of another studio; studio-less
  projects; a designer's second studio) all pass, and I did not find a hole they miss.
- `v_access_grants` / `create_field_link` (00627): four grant-closed sources routed through definer readers
  that return only the twelve normalised columns; no bearer credential in the ledger (`grant_id` is a uuid
  or `md5(token)`, never the token itself) — read directly, matches.

## Summary

- SQL suites: **both green**, before and after a fresh reset (23 W1b blocks, 49 W1a blocks).
- Types: **no drift** (`database.types.ts` diff empty after regen).
- Type-check: **`@patina/supabase` and `@patina/designer-portal` both clean.**
- Role probes: designer sees the full fixture; client sees nothing on this wave's tables (weak-probe by
  seed data, strong-probe by the suite's own synthetic fixture, and by reading the RLS text directly); anon
  refused everywhere at the grant.
- Fixture: F-11/F-12/F-16/F-27 all match `fixture.md`'s own words exactly.
- r13's two findings: both confirmed closed (R-BI ruled, R-BJ fixed and tested).
- **One new BLOCKING finding**: the `opted_out`-phone freeze (00594, R-AX) checks a column
  (`project_parties.sms_consent_status`) that R-AY's record-only consent architecture — the architecture
  this very wave's `people_directory` v4 depends on — permanently defaults to `not_asked`, in both the DB
  trigger and the portal's own JS guard. An uncarded identity's opt-out is losable, live, with zero new
  consent recorded, through an ordinary RLS-permitted phone edit that raises no error anywhere.
