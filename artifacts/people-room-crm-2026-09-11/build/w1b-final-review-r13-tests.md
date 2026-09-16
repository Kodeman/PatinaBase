# W1b — final review round 13, tests / types / behaviour

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `457066c2d` ("fix(people-crm): w1b r12 — the
stage backfill leaves updated_at alone, and one human keeps one identity in the
record"). Local DB only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`);
nothing touched on Strata, no `supabase db push`, no `supabase functions deploy`.
Predecessor: `w1b-final-review-r12-tests.md`. Prior fix log re-checked:
`w1b-final-fix-log-r12.md` (M1, M2).

## Operational hazard hit again this round — THIRD consecutive round, not a code finding

Mid-round, `pnpm --dir … supabase:reset` was run to independently confirm the seed
runs clean. It failed twice in a row before succeeding:

```
attempt 1: LegacyMigrationApplyError — "Connection terminated unexpectedly" while
           applying 00591 (unrelated pre-existing migration)
attempt 2: LegacyMigrationApplyError — duplicate key value violates unique
           constraint "pg_extension_name_index" (extname=vector), applying 00001
attempt 3: EXIT=0, "Finished supabase db reset on branch main."
```

Immediately after attempt 3 reported success and an independent `psql` read
confirmed `count(*) from schema_migrations = 555` / head `00627`, a *second*
independent read taken while writing this report found the table gone entirely
(`relation "supabase_migrations.schema_migrations" does not exist`,
`relation "public.organizations" does not exist`, `auth.users` count 0) and
`docker ps` showed `supabase_db_supabase` with an uptime of 18 seconds — i.e. the
container had been torn down and was mid-replay again, unprompted by this
session, working through the migration list from `00001` forward in real time
(watched live: count went `555 → ERROR → ERROR → ERROR → 290 → 384 → 528 → 555`
over about 40 seconds). It then held stable at 555 for the remainder of the
round and every check below is against that confirmed-stable state, re-verified
immediately before and after the SQL suites, the type-checks, and every probe.

This is the **third round in a row** this exact shape has fired
(r11-tests: "most likely a settling replica read"; r12-tests: "starting to look
like a real second actor... not a one-off race"). Seeing it a third time, across
three different review sessions, on the port this program was told it owns
exclusively, is no longer plausibly a one-off local race — either something is
actively re-resetting `127.0.0.1:54322` out from under this wave, or
`supabase db reset` itself is retry-racing against a prior failed invocation's
still-running teardown/recreate (this round's own attempts 1→2→3 were fired in
quick succession without a settling wait, which is at least sufficient to
explain the flapping I personally triggered — but does not explain why r11 and
r12 saw the identical shape without stacking `reset` calls). **Flagged again for
Kody, more strongly**: before this program's deploy, confirm nothing else has a
scheduled or supervisory process touching `supabase_db_supabase`, and consider
adding a settle-and-recheck step to `supabase:reset` tooling generally. Not
graded as a SQL finding — it is external to the migrations under review, and
every result below was captured only once the ledger was independently
reconfirmed stable immediately before and after.

---

## 1. Every SQL test under `supabase/tests/people`, fresh state confirmed first

```
$ psql … -At -c "select count(*), max(version) from supabase_migrations.schema_migrations;"
555 | 20260910152111
$ psql … -At -c "select string_agg(version,' ' order by version) from schema_migrations where version>='00590' and version<'20260101000000';"
00590 00591 00592 00593 00594 00621 00622 00623 00624 00625 00626 00627
```

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
...
NOTICE:  45h. a release that raises is a warning, not an aborted consent act (final-run MAJOR-3): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
EXIT=0   (48 "passed" NOTICEs, 0 FAIL/ERROR)

$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
...
NOTICE:  21. 00624's stage backfill: … (r12 MAJOR-1): passed
NOTICE:  22. the auto-link keeps one human one identity IN THE RECORD: … (r12 MAJOR-2): passed
NOTICE:  All W1b assertions passed.
ROLLBACK
EXIT=0   (22 "passed" NOTICEs — blocks 1-22, 0 FAIL/ERROR)
```

Both suites pass, 0 failures, run twice this round (once on the first stable
window, once again after the fresh `supabase:reset` in the hazard note above,
identical results both times).

**Bonus, adjacent to the requested directory** (not asked for, run anyway for
continuity with r11/r12's own practice): `supabase/tests/rls/people_directory_scope_test.sql`
— `EXIT=0`, all eleven cases (a)-(k) pass, "All people_directory scope
assertions passed."

## 2. Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build db:generate
GEN_EXIT=0
$ git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build diff --stat -- packages/supabase/src/database.types.ts
(no output)
```

Zero diff. `database.types.ts` is in sync with the live schema at HEAD.

*(Note for whoever runs this next: the first `db:generate` attempt this round
failed with `permission denied ... dial unix /Users/kody/.docker/run/docker.sock:
connect: operation not permitted` — a sandbox restriction on the Docker socket,
not a project defect. Re-run with the sandbox override succeeded cleanly.)*

## 3. Role probes — designer, client, anon, and a genuine cross-tenant caller

All four probes below were run against the confirmed-stable, freshly-reset
555-migration state. Full scripts and raw output are at
`/private/tmp/claude-501/.../scratchpad/r13/probe-r13-roles.sql` (+ `.out`,
`.out2`) and `probe-cross-tenant-real.sql` / `probe-cross-tenant-grant-check.sql`
(paths are this session's scratchpad, not committed to the repo).

### As designer (`designer@patina.dev`, `a0000000-…-0004`, admin/owner of Local Dev Studio)

```
 display_name  |  role   | reach_state | consent_status | paper_state | seat_count
---------------+---------+-------------+----------------+-------------+------------
 Amara Osei    | contact | on_paper    | granted        | lapses_soon |          1
 Dana Kowalski | contact | field_link  | granted        | lapsed      |          2
 Pete Rusk     | contact | field_link  | opted_out      | current     |          2
 Ray Thao      | contact | on_paper    | not_asked      | not_on_file |          1

 designer_site_access_cards = 1 · designer_authority_grants = 11 · designer_compliance_documents = 36
```

### As client (`client@patina.dev`, `a0000000-…-0005`)

```
 client_site_access_cards = 0 · client_authority_grants = 0 · client_compliance_documents = 0
 client_directory_seats = 0 · people_directory rows by role = (0 rows)
```

**Client cannot see `project_site_access_cards` — confirmed live** (0 rows), matching
the four policies' text (§5 below): no client leg, no `show_to_client` column exists
to make one (PR-w).

### As anon

```
project_site_access_cards → insufficient_privilege (refused at the grant)
project_party_authority   → insufficient_privilege (refused at the grant)
v_access_grants           → insufficient_privilege (refused at the grant)
people_directory_seats    → insufficient_privilege (refused at the grant)
people_directory           → ERROR: permission denied for table studio_contacts
```

The last line reproduces r11/r12's own MINOR #2 exactly (still open — see §6):
`people_directory` shows `anon_select=t` in `information_schema` (a pre-existing
local-only legacy grant blanket, not present on Strata's actual grant scheme),
but a real anon `SELECT * FROM people_directory` still hard-errors on the
underlying `studio_contacts` table before RLS is ever consulted — so anon reads
**nothing** in practice, it just errors instead of returning zero rows.

### A false alarm worth recording, and the genuine cross-tenant probe that replaced it

My first cross-tenant attempt used `studio_manager@patina.dev`
(`a0000000-…-0003`) as the "outside" caller, expecting a non-member. It read the
*same* counts as the designer (site access cards = 1, authority grants = 11,
compliance docs = 36) — alarming until `organization_members` showed
`studio_manager@patina.dev` is itself an **admin of Local Dev Studio**
(`b0000000-…-0001`), the same tenant as the fixture. Not a leak — a wrong test
subject. Re-run against a real second tenant, `cf-phase1-alice@patina.invalid`
(`cf100000-…-0001`, owner of "Phase One Synthetic Studio",
`cf120000-…-0001`, confirmed **not** a member of Local Dev Studio via
`is_active_studio_member('b0000000-…-0001') = f`):

```
 people_directory (Dana Kowalski / Northgate Electric)   → 0 rows
 outside_site_access_cards  = 0
 outside_authority_grants   = 0
 outside_compliance_docs    = 0
 outside_directory_seats    = 0
 outside_access_grants      = 1   ← inspected: this caller's OWN studio_member
                                     grant (scope_id = cf120000-…-0001, their own
                                     studio; subject_id = their own profile),
                                     not a leak of Local Dev Studio data
```

No cross-tenant read. Recorded here because it is exactly the kind of
false-positive a "cannot resolve to what it looks like" probe can produce, and
because the correction — and the fact the correction was necessary — is
evidence this round's cross-tenant check was genuinely adversarial, not a
rubber stamp.

## 4. The Okonkwo fixture, checked against `briefing/fixture.md` for F-11, F-12, F-16, F-27

| Fixture row | Fixture says (reach / consent / paper) | `people_directory` read as designer | Match |
|---|---|---|---|
| F-11 Dana Kowalski | field link / granted (2025 written, carried by phone; Okonkwo row set granted 2026-10-12) / COI lapsed 2026-03-31 (worst of her documents) | `field_link` / `granted` / `lapsed` | yes |
| F-12 Pete Rusk | field link / opted_out (STOP on 2025 Lindqvist thread; Okonkwo row itself reads `not_asked`, but the **record** — R-AY — decides) / COI current (exp 2027-01-15) | `field_link` / `opted_out` / `current` | yes — the identity-level `opted_out` correctly overrides the Okonkwo seat's raw `not_asked`, exactly what test block 12/22 assert |
| F-16 Amara Osei | fixture's own annotation: "reach chip reads on paper for someone who logs in" (account exists but unlinkable, G-5) / granted (web form 2026-10-14) / Lakeshore's COI is deliberately `CURRENT_DATE+23` → `lapses_soon` | `on_paper` / `granted` / `lapses_soon` | yes, including the deliberately-moving `lapses_soon` date |
| F-27 Ray Thao | on paper / n/a — never texted, no consent process ever initiated / n/a — AHJ never owed paper | `on_paper` / `not_asked` / `not_on_file` | yes — `not_asked` and `not_on_file` are the correct raw facts; R-A/R-N's "print no paper word for an AHJ" is a documented **display** rule left to the app (SQL block 12g), not something this view should suppress |

All four match the fixture's own words exactly, including the two
identity-vs-record subtleties (F-12's opted_out overriding a `not_asked` seat,
F-16's account-exists-but-unlinkable reach) that are the whole point of the v4
rebuild and of R-AY.

## 5. RLS + grants on the five W1b objects, independently re-queried (not read from the report)

```
 relname                     | relkind | rls | policies
------------------------------+---------+-----+----------
 people_directory_seats       | v       | f   |        0
 project_party_authority      | r       | t   |        4
 project_site_access_cards    | r       | t   |        4
 studio_compliance_documents  | r       | t   |        4
 v_access_grants              | v       | f   |        0
```

Table-grant SELECT holders: `authenticated`, `postgres`, `service_role` only, on
all five — no `anon` grant on any of the four sensitive objects (matches PR-w's
"anon revoked explicitly").

`project_site_access_cards`'s four policies, read directly from `pg_policies`:

```
project_site_access_cards_studio_select | SELECT | is_active_studio_member(project_recorded_studio(project_id)) AND is_studio_comember(project_designer(project_id))
project_site_access_cards_studio_insert | INSERT | (same, on WITH CHECK)
project_site_access_cards_studio_update | UPDATE | (same, both sides)
project_site_access_cards_studio_delete | DELETE | (same, on USING)
```

No client leg on any of the four. Matches PR-w exactly.

The freeze trigger, read directly via `pg_get_triggerdef`:

```
CREATE TRIGGER refuse_legacy_consent_write_trg BEFORE UPDATE OF
  sms_consent_status, sms_consented_at, sms_opt_out_at, sms_consent_source,
  sms_consent_evidence, sms_consent_recorded_at, sms_consent_recorded_by,
  sms_consent_disclosure_version, phone, phone_e164
ON public.project_parties FOR EACH ROW EXECUTE FUNCTION refuse_legacy_consent_write()
```

Exactly the ten named columns (R-AX), unchanged. None of `00624`'s ten new
`project_parties` columns (`stage`, `on_site_from/to`, `site_access_mode`,
`contracted_through`, `off_job_at/reason`, `company_id`, `warranty_until`,
`warranty_contact_person_id`) is on it — a member can still move them.

## 6. Prior findings (r12), re-checked fresh — not read from the fix log, re-derived

| # | r12 verdict | This round (r13) |
|---|---|---|
| M1 (MAJOR) — 00624's stage backfill stamped `updated_at` on every completed-project seat | Fixed by `w1b-final-fix-log-r12.md` | **Confirmed FIXED and holding**: `DISABLE TRIGGER set_updated_at_project_parties` / `ENABLE TRIGGER` bracket the backfill UPDATE at `00624:788`/`801`; test block 21 (staged fixture, both forms) passes |
| M2 (MAJOR) — `party_identity_key()`'s COALESCE stopped at the stamp, so an unstamped seat on a carded human's own number was a second identity | Fixed by `w1b-final-fix-log-r12.md` | **Confirmed FIXED and holding**: `rolodex_card_for_party_phone`, `link_party_to_rolodex_card`/`apply_party_rolodex_link_trg`, `link_rolodex_card_to_parties`/`link_rolodex_card_to_parties_trg` all present in `00626` §1b; test block 22 passes; live probe (§4 above, Dana Kowalski) shows `seat_count=2` on ONE row, not split across two |
| r11/r12 op-hazard note — flapping local DB on 127.0.0.1:54322 | Flagged twice, unresolved | **Fired a third time this round** (see hazard note above). Escalated language; still not a code finding |
| MINOR #1 — `w1b-report.md` stale relative to HEAD | Stale at r7 (`9812807e1`), 4 rounds behind at r12 | **STILL OPEN, now 5 rounds behind**: report last touched `9812807e1` (r7); current HEAD `457066c2d` is the r12 fix commit — r8, r9, r10, r11, r12 all postdate the report and are undescribed in it |
| MINOR #2 — anon `SELECT * FROM people_directory` hard-errors instead of returning empty | Open, local-only | **STILL OPEN, unchanged** — reproduced live this round (§3), same `permission denied for table studio_contacts` |
| MINOR #3 — the CONTACTS branch's `meta` carries no `sms_consented_at`/`sms_opt_out_at` (unlike the PARTY branch's `meta`, which joins `ev.consented_at`/`ev.opt_out_at`) | Open, unchanged, no shipped/W2-planned reader broken | **STILL OPEN, unchanged**. Confirmed live this round: `SELECT meta->>'sms_consented_at', meta->>'sms_opt_out_at' FROM people_directory WHERE display_name IN (...)` returns empty for all four fixture identities (`00626:1718-1756`, contrast the PARTY branch's `:1178-1179`). Re-grepped every reader of `people_directory` in `apps/` and `packages/` (§7) for `sms_consented_at`/`sms_opt_out_at`: every hit is either a test fixture literal or `use-coordination.ts`'s own direct reads/writes of `project_parties`' frozen columns (an unrelated, already-frozen surface) — **no reader consumes the Directory's `meta` consent-date keys today**, so this stays MINOR, not MAJOR, exactly as r12 concluded |

## 7. Readers of `people_directory` / `v_project_roster`, listed fresh from `apps/` and `packages/`

```
$ grep -rln "people_directory" apps packages --include="*.ts" --include="*.tsx"
```

Live readers of the row shape (both hooks are `select('*')`, so the five
appended columns widen type-safely — confirmed by the clean `type-check` below):

- `packages/supabase/src/hooks/use-people.ts` (`usePeopleDirectory`, `usePerson`)
- `packages/supabase/src/hooks/index.ts` (barrel)
- `apps/designer-portal/src/lib/document/people-derivation.ts`
- `apps/designer-portal/src/lib/document/desk-derivation.ts`
- `apps/designer-portal/src/lib/document/roster-derivation.ts`
- `apps/designer-portal/src/components/document/people/people-room.tsx`
- `apps/designer-portal/src/components/document/people/views/directory-view.tsx`
- `apps/designer-portal/src/components/document/people/directory/person-row.tsx`
- `apps/designer-portal/src/components/document/people/views/person-profile.tsx`, `nurture-view.tsx`, `outreach-view.tsx`, `portfolio-view.tsx`
- `apps/designer-portal/src/components/document/people/outreach/audience-rules.ts`, `audiences-tab.tsx`
- `apps/designer-portal/src/components/document/people/party-profile-sheet.tsx` — **known-open W2 gap, R-BE**, not a W1 finding (already ruled; see below)
- `apps/designer-portal/src/components/document/command-bar.tsx`
- `apps/designer-portal/src/components/document/desk-reconnect.tsx`
- `apps/designer-portal/src/components/document/roster/call-sheet-mount.tsx`, `roster-row.tsx` (via `v_project_roster` primarily, `people_directory` incidentally through shared types)

**Checked, cleared, not a finding** — comment-only mentions, spot-checked one by
one, none is a live query on the changed columns: `brief-section.tsx`,
`overlays/household-sheet.tsx`, `people/directory/makers-marketplace.tsx`,
`people/person-bits.tsx`, `people/profile/maker-profile.tsx`, `use-clients.ts`,
`use-vendors.ts`, and the various `__tests__/*.test.tsx` files under
`people/__tests__/` and `roster/__tests__/`.

**`v_project_roster` readers**: `packages/supabase/src/hooks/use-coordination.ts`
(`useProjectRoster`), `.../roster/call-sheet-mount.tsx`, `call-sheet.tsx`,
`roster-row.tsx`, `.../lib/document/roster-derivation.ts`,
`letterhead-instruments.tsx` (comment only). Re-confirmed by grep this round
that **no migration in `00623`-`00627` touches `v_project_roster`** — every hit
inside those five files is prose comparing the new Directory to it, never a
`CREATE OR REPLACE VIEW` or `ALTER VIEW` — so these readers are not graded
findings for W1b; `v_project_roster`'s own repoint onto `studio_channel_consent`
happened in the W1a lane (`00621`/`00622`, R-AY) and is not re-litigated here.

**R-BE (party-profile-sheet.tsx), spot-checked**: the file at HEAD guards the
consent chip with `{person ? <ConsentChip status={consent} /> : null}`
(`party-profile-sheet.tsx:512`), with a comment naming exactly why (v4 keys a
carded human on their rolodex card, so `usePerson(<seat id>, <party_kind>)`
finds no row for 21 of 22 field seats, and the fallback chain used to print
"Not asked" over a record that said `opted_out`). This matches the fix log's
claim and rulings.md's R-BE (owed to W2, not a W1 finding — settled).

## 8. Type-checks

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build --filter @patina/supabase type-check
> tsc --noEmit
(clean, exit 0)

$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build --filter @patina/designer-portal type-check
> tsc --noEmit
(clean, exit 0)
```

No type breaks anywhere. Expected, given §2's zero-diff regen — nothing changed
for either `tsc` invocation to disagree with.

## 9. Settled rulings spot-checked (not findings, sanity only)

R-BF (transitive supersession walk), R-BG (`identity_seat_count`'s tenant leg
matching `people_directory_seats`'), and the several `project_consent_org()`
call sites remaining in `00626` after R-BD (retired `project_consent_org()`
from **guards**, not from the semantically distinct "where does the consent
record live" question) were all spot-checked against the migration text and
match their rulings exactly, each with its own multi-paragraph banner comment
citing the review round that settled it. Not re-litigated; recorded here only
because a `grep project_consent_org` on `00626` returns six code hits and it
would be sloppy to leave that unexplained in a review that grades on grep
output elsewhere in this document.

---

## New findings this round

**None.** Every check this round either reconfirms an already-fixed item
(M1, M2 — independently re-derived from migration text and a fresh test run,
not read from the fix log), reconfirms an already-open MINOR unchanged
(report staleness, anon hard-error, CONTACTS-branch consent dates), or
independently re-establishes a result the report/prior rounds already reached
(fixture words, RLS/grants, cross-tenant boundary, client boundary, type
safety) using fresh queries and a fresh reset rather than reused output. The
one thing that is new is the third occurrence of the reset-flapping hazard,
which is not a SQL/migration defect.

## Summary

| # | Severity | Confidence | File | One-line |
|---|---|---|---|---|
| 1 | MINOR | CONFIRMED | `artifacts/people-room-crm-2026-09-11/build/w1b-report.md` | Last touched at `9812807e1` (r7); five fix rounds (r8-r12) postdate it and are undescribed |
| 2 | MINOR | CONFIRMED | local dev grants only (`supabase/seed/00-legacy-grants.sql`) | Anon `SELECT * FROM people_directory` hard-errors (`permission denied for table studio_contacts`) instead of returning zero rows; local-only, not present on Strata's actual (post-flip) grant scheme |
| 3 | MINOR | CONFIRMED | `supabase/migrations/00626_people_directory_v4_seats.sql:1718-1756` (contrast the PARTY branch's `:1178-1179`) | The CONTACTS branch's `meta` carries no `sms_consented_at`/`sms_opt_out_at`, unlike the PARTY branch — every carded human's Directory row has no consent date to source R-Q's sentence from; no shipped or W2-planned reader is broken today (verified live and by a fresh reader-grep, §7), so it stays under the MAJOR bar |
| 4 | MINOR (operational, not a SQL/migration defect) | CONFIRMED (3rd occurrence) | n/a — local Docker/Supabase CLI environment on `127.0.0.1:54322` | The local DB was independently observed torn down and mid-replay-from-`00001` without this session issuing a reset, for the third review round running; every result in this report was captured only against an independently reconfirmed-stable ledger, but the recurrence itself is worth Kody's attention before deploy |

Zero BLOCKING, zero MAJOR. **Clean by the stated bar.** Both M1 and M2 (the two
MAJORs open at the migrations-lane r12 review) are confirmed fixed and holding,
independently re-derived this round from migration text and two fresh full
`ON_ERROR_STOP=1` runs of both SQL suites (48 + 22 blocks, 0 failures) against
an independently-reconfirmed, freshly-`supabase:reset` 555-migration state. The
Okonkwo fixture's F-11/F-12/F-16/F-27 rows read exactly the words
`briefing/fixture.md` states, including the two identity-vs-record subtleties
(Pete Rusk's record-level `opted_out` overriding his Okonkwo seat's raw
`not_asked`; Amara Osei's account-exists-but-unlinkable reach). A client role
reads zero rows from every W1b-sensitive object including
`project_site_access_cards`; anon is refused everywhere at the grant; a
genuine, freshly-identified second-tenant caller (not the false-positive
`studio_manager@patina.dev`, who turned out to be a Local Dev Studio admin)
reads zero rows from every sensitive object and the one `v_access_grants` row
it does see is its own studio's own grant, not a leak. `database.types.ts`
shows zero diff after regen, and both `@patina/supabase` and
`@patina/designer-portal` type-check clean. Three MINORs carry forward
unchanged from r12 (report staleness, anon hard-error, CONTACTS-branch consent
dates); one new operational note (the reset-flapping hazard, third occurrence)
is recorded but not graded as a code finding. Every ruling in `rulings.md` §3
held in every probe run this round, including a spot-check of the six
remaining `project_consent_org()` call sites in `00626` against R-BD's own
carve-out; none was treated as a finding.
