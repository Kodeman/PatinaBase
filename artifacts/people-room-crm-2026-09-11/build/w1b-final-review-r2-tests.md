# W1b — round 2 tests, types, behaviour review

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. Local Supabase only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). No prod act of
any kind was taken: no `supabase db push`, no `supabase functions deploy`, no
`supabase link`. This review re-checks `w1b-final-fix-log-r1.md`'s five
MAJORs and then looks fresh at `w1b-report.md` against `rulings.md` §3 and
`briefing/fixture.md`.

## 0. Prior findings (r1 fix log) — re-checked

All five re-verified independently in the actual migration source (not just
the fix log's prose) and re-proven by the full SQL suite after a clean reset.

| ID | Status | Evidence |
|---|---|---|
| MAJOR-1 (`create_field_link` past-dated mint / live-token revoke) | **FIXED** | `supabase/migrations/00627_access_grants_and_field_link_window.sql:465-474` carries the window→caller-date→90-day CASE plus the `field_link_window_closed` guard raised before any supersede. Block 10 of `w1b_compliance_authority_directory_test.sql` passes (see §1 below). |
| MAJOR-2 (`people_directory` / `people_directory_seats` winner divergence) | **FIXED** | `party_kind_in_directory()` defined once (`00626:146-174`) and referenced by both the Directory's WHERE (`00626:521`) and the seats view's `first_value()` ORDER BY (`00626:697`). Block 4 passes. |
| MAJOR-3 (`compliance_state()` ignored `blocks[]`) | **FIXED** | `cardinality(d.blocks) > 0` gates both the `lapsed` and `lapses_soon` FILTERs (`00623:364,368`). Block 1 passes. |
| MAJOR-4 (a supersede could launder a lapsed COI into `current`) | **FIXED** | `compliance_successor_wrong_type` / `compliance_successor_not_later` raised in `assert_compliance_holder()` (`00623:245,253`). Block 2 passes. |
| MAJOR-5 (deploy-sequencing hazard, Directory feed loses every trade) | **Recorded, not a code fix (as ruled)** | The hard-constraint banner is still verbatim at `00626:78` ("⚠ DEPLOY SEQUENCING — A HARD CONSTRAINT, NOT A PREFERENCE (w1b r1 MAJOR-5)"). No SQL change was owed; none was made. Not a finding — this is the ruled resolution holding. |

`00595`–`00620` remain untouched on this branch (verified: only `00621` exists
below `00622`); W1b's own files are `00623`–`00627`, exactly as `w1b-report.md`
§0 states.

## 1. Every SQL test under `supabase/tests/people`, run to completion

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
...
NOTICE:  All W1a assertions passed.
ROLLBACK
$ echo EXIT=$?
EXIT=0
```

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
NOTICE:  1. compliance_state: four words, the 30-day boundary both ways, worst-first precedence, a superseded lapse released, and a gateless lapse that changes nothing until it holds a gate: passed
NOTICE:  2. the holder guard: a person is not a firm, a document belongs to one studio, other_named needs its label, blocks is a closed vocabulary, and a supersede must be the same paper covering at least as long: passed
NOTICE:  3. people_directory v4: one row per identity, Dana's two seats beneath it, her four fixture words, no person-level stage, and an honest 28 + 21: passed
NOTICE:  4. the uncarded identity: two seats on two jobs collapse to one row keyed on the phone, pointing at the newest seat, a mixed-kind identity nests every seat it claims, and no row anywhere claims a count it cannot nest: passed
NOTICE:  5. project_party_authority: a member records selections and is refused money and draw certification, an owner records both, and a non-member reads nothing (PR-n): passed
NOTICE:  6. copy_to: a seat on another job is refused, a seat on this one lands: passed
NOTICE:  7. the site access card: no code column and no client toggle (PR-r), four studio policies, a client reads nothing and anon is refused at the grant (PR-w): passed
NOTICE:  8. the key holder must be a seat on the card's own project: passed
NOTICE:  9. v_access_grants: F-08's field link ends with the engagement (PR-d), her warranty seat's link takes the later date (PR-l), no bearer credential is in the ledger, and the four grant-closed sources read without raising: passed
NOTICE:  10. create_field_link: the engagement window sets the expiry and outranks a caller date, warranty answers alone, the 90-day fallback survives for a windowless seat and for a CLOSED one, no mint is dated in the past or revokes on behalf of one, and the supersede and 00284's ownership guard are untouched: passed
NOTICE:  11. the seat's new columns are writable by a member, the eight consent columns are still frozen, the stage vocabulary is closed, and the firm pointer must be a firm in this studio: passed
NOTICE:  12. the seeded fixture reads as the fixture: five granted numbers, Pete's Lindqvist refusal answering on Okonkwo, Joe invited, Frank routed to Rosa, Ray never texted, the lender's paper reported as a fact, Chidi's $2,500 line in cents, Erin preparing only, and Ngozi holding the key: passed
NOTICE:  All W1b assertions passed.
ROLLBACK
$ echo EXIT=$?
EXIT=0
```

Both suites are the only files in `supabase/tests/people/`; both run to
completion with `ON_ERROR_STOP=1` and exit 0.

**One environmental note, not a code finding.** Mid-review, the shared local
`supabase_db_supabase` Postgres container was independently recreated (docker
`CreatedAt` showed it 30s old when a query that had just worked a minute
earlier suddenly returned an empty schema at migration `00199`) — some other
process reset the "sole owner" local DB out from under this review. The
worktree was reset again (`pnpm supabase:reset`, clean, `RESET_EXIT` implied
by "Finished supabase db reset on branch main.") and every gate below was
re-run against that fresh state. Nothing in this finding implicates the
reviewed code; it is a parallel-work/infra hazard for whoever else is sharing
this Postgres instance, flagged for awareness only.

## 2. Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build db:generate
Connecting to db 5432
...
$ git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build diff --stat packages/supabase/src/database.types.ts
(no output — empty diff)
```

The committed `database.types.ts` is byte-identical to a fresh generation off
the reset DB. No type-check break from a stale generated file is possible;
none was found.

## 3. Role probes — designer, client, anon

All run as transactions (`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL
request.jwt.claims = '{"sub":"<uid>","role":"authenticated"}'; ... ROLLBACK;`)
against the seeded dev accounts in `supabase/seed/dev-accounts.sql`
(`designer@patina.dev` = `a0000000-0000-0000-0000-000000000004`,
`client@patina.dev` = `a0000000-0000-0000-0000-000000000005`).

**As `designer@patina.dev` (studio owner, `authenticated`):**
```
people_directory by role: client=7 contact=49 lead=5 sub=1   (62 rows)
project_site_access_cards: 1
v_access_grants: 12
studio_compliance_documents: 36
```

**As `client@patina.dev` (`authenticated`, homeowner, not a studio co-member on
this studio's projects):**
```
people_directory: 0
project_site_access_cards: 0
project_party_authority: 0
studio_compliance_documents: 0
people_directory_seats: 0
```
Confirms the instruction's specific ask: **a client role cannot see
`project_site_access_cards`** — zero rows, no error (RLS-filtered, not
grant-denied, since `authenticated` legitimately holds the SELECT grant and
PR-w's four studio-only policies do the exclusion).

**As `anon`:** every one of `people_directory`, `project_site_access_cards`,
`v_access_grants`, `studio_compliance_documents`, `people_directory_seats`,
`project_party_authority` raises `permission denied` at the **grant** level
(`insufficient_privilege`), before any RLS policy runs — matching PR-w's "anon
is refused at the grant" claim and the report's probe 1/§7 anon block.
`people_directory` itself is `security_invoker`, so even the one pre-existing
`anon_select = t` grant on the view (a legacy blanket grant from
`00-legacy-grants.sql`, not something this wave added) yields nothing: the
underlying `studio_contacts` table refuses anon first.

## 4. Fixture words — F-11, F-12, F-16, F-27

As `designer@patina.dev`, against the seeded Okonkwo fixture:

| ID | Person | reach_state | consent_status | paper_state | contact_rule | fixture says | Verdict |
|---|---|---|---|---|---|---|---|
| F-11 | Dana Kowalski | `field_link` | `granted` | `lapsed` | (none) | Patina reach today: field link · Consent: granted · Docs: COI LAPSED (blocks site_access, draw) | **MATCH** |
| F-12 | Pete Rusk | `on_paper` | `opted_out` | `current` | (none) | Patina reach today: **field link** · Consent: opted_out · Docs: COI current (exp 2027-01-15) | **consent + paper MATCH; reach MISMATCH** |
| F-16 | Amara Osei | `on_paper` | `granted` | `lapses_soon` | (none) | Patina reach today: on paper (would be `account` if the FK were set) · Consent: granted (web form) · Docs: current-ish, firm (Lakeshore) is `lapses_soon` | **MATCH** |
| F-27 | Ray Thao | `on_paper` | `not_asked` | `not_on_file` | "Never text. Use: email, office, portal_311. Hours: Weekdays 08:00 to 16:00." | Patina reach today: on paper · Consent: n/a (do not text) · Docs: n/a | **MATCH** (fixture's "n/a" for an AHJ that is never solicited for SMS is the same fact as `not_asked`; the rule row matches verbatim) |

**Finding — F-12 Pete Rusk's reach_state does not match `fixture.md`'s stated
"Patina reach today" of `field link`.**

`reach_state_for()` returns `field_link` only when an **active, unexpired**
row exists in `field_link_tokens` for one of the identity's seats
(`00626_people_directory_v4_seats.sql:200-213`). The dev seed
(`supabase/seed/people_crm_dev.sql:894-904`) mints field links through the RPC
for exactly six seats — F-08 Erin (Okonkwo), F-09 Luis, F-11 Dana, F-18 Joe,
F-06 Ngozi, and F-28 Erin's second seat — and **F-12 Pete Rusk is not in that
list**. Verified directly:

```sql
select flt.status, flt.expires_at, pp.id as party_id, pr.name as project_name, sc.full_name
from public.field_link_tokens flt
join public.project_parties pp on pp.id = flt.party_id
join public.projects pr on pr.id = pp.project_id
join public.studio_contacts sc on sc.id = pp.studio_contact_id
where sc.full_name in ('Pete Rusk','Dana Kowalski')
order by sc.full_name, flt.expires_at desc;
-- one row: Dana Kowalski | active | 2027-07-01 | Okonkwo residence
-- zero rows for Pete Rusk
```

So `people_directory.reach_state` for Pete Rusk reads `on_paper` where
`briefing/fixture.md`'s row F-11/F-12 table (col 8, "Patina reach today")
states `field link`. This is a fixture-vs-seed mismatch, not a code-path
defect: `reach_state_for()`'s logic is correct and consistent (it did the
right thing with the data it was given — no field link exists, so it
correctly reports `on_paper`), and it does not touch consent gating (Pete's
SMS `consent_status` is independently and correctly `opted_out` regardless of
his reach chip). No text can reach an opted-out number because of this; no
tenant boundary is crossed; no evidence is lost. **Severity: MINOR** — the
seed simply never called `create_field_link` for F-12, so the fixture's
accepted "field link" reach for Pete Rusk is not actually demonstrated by the
data this wave ships. Fix is one line in `people_crm_dev.sql`'s
`ARRAY[...]` LOOP (add Pete's Okonkwo party id) or a fixture-doc correction if
`on_paper` is in fact the intended state for him and the fixture's column was
never updated after that seed decision was made.

## 5. Reset + seed

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build supabase:reset
Applying migration 00623_studio_compliance_documents.sql...
Applying migration 00624_project_party_window_and_authority.sql...
Applying migration 00625_project_site_access_cards.sql...
Applying migration 00626_people_directory_v4_seats.sql...
Applying migration 00627_access_grants_and_field_link_window.sql...
Applying migration 20260910152111_create_contact_messages.sql...
...
Seeding data from supabase/seed/people_crm_dev.sql...
Seeding data from supabase/seed/99-local-edge-settings.sql...
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```

Ran twice in this review (once for the initial pass, once after the
mid-review clobber described in §1); both replays applied cleanly with no
error and the seed ran both times without incident. Confirms **the seed runs
on reset**, as the instruction asked to check.

(Sandbox note: the first attempt at both `supabase:reset` and `db:generate`
failed inside the default Bash sandbox — `EPERM`/`permission denied` writing
Supabase CLI telemetry to `~/.supabase/telemetry.json.tmp...` and opening the
Docker socket at `~/.docker/run/docker.sock`. Both are sandbox path
restrictions unrelated to the reviewed code; both commands were re-run with
the sandbox disabled and completed normally.)

## 6. Every reader of `people_directory` / `v_project_roster` columns

Independently re-derived by grep (not just trusting `w1b-report.md` §4's
table), across `apps/` and `packages/`:

**`people_directory` (via `usePeopleDirectory`/`usePerson`, `PeopleDirectoryRow`,
or the literal view name), production files only:**

```
apps/designer-portal/src/components/document/command-bar.tsx
apps/designer-portal/src/components/document/desk-reconnect.tsx
apps/designer-portal/src/components/document/people/directory/person-row.tsx
apps/designer-portal/src/components/document/people/outreach/audience-rules.ts
apps/designer-portal/src/components/document/people/outreach/audiences-tab.tsx
apps/designer-portal/src/components/document/people/party-profile-sheet.tsx
apps/designer-portal/src/components/document/people/people-room.tsx
apps/designer-portal/src/components/document/people/views/directory-view.tsx
apps/designer-portal/src/components/document/people/views/nurture-view.tsx
apps/designer-portal/src/components/document/people/views/outreach-view.tsx
apps/designer-portal/src/components/document/people/views/person-profile.tsx
apps/designer-portal/src/components/document/people/views/portfolio-view.tsx
apps/designer-portal/src/lib/document/desk-derivation.ts
apps/designer-portal/src/lib/document/people-derivation.ts
apps/designer-portal/src/lib/document/roster-derivation.ts
packages/supabase/src/hooks/index.ts
packages/supabase/src/hooks/use-people.ts
```

This is an exact match for `w1b-report.md` §4's "Every reader of the changed
columns" table. A broader literal-string grep for `"people_directory"` also
surfaced `brief-section.tsx`, `overlays/household-sheet.tsx`,
`directory/makers-marketplace.tsx`, `people/person-bits.tsx`,
`profile/maker-profile.tsx`, `roster/roster-row.tsx`, `use-clients.ts`, and
`use-vendors.ts` — each checked individually: every one of these is a
**comment** referencing `people_directory` conceptually (e.g. "people_directory
role='contact', 00420"), not an actual query against the view or its row
shape. None needs updating for the five appended columns; none is a missed
reader.

**`v_project_roster` (untouched by W1b — this view carries no W1b column
changes; listed per the instruction's ask):**

```
apps/designer-portal/src/components/document/letterhead-instruments.tsx
apps/designer-portal/src/components/document/roster/call-sheet-mount.tsx
apps/designer-portal/src/components/document/roster/call-sheet.tsx
apps/designer-portal/src/lib/document/roster-derivation.ts
packages/supabase/src/hooks/use-coordination.ts
```

W1b did not modify `v_project_roster` (it is `people_directory` and the new
`people_directory_seats`/`v_access_grants` that changed). `v_project_roster`'s
frozen-column debt (R-AV, PunchCourtResolver/SupabaseSiteRequestService still
reading the seat column) is explicitly recorded in `w1b-report.md` §8 as owed
to W2/Field, not this wave — consistent with what's found here: nothing in
this reader list was rewired by W1b, and nothing claims otherwise.

## 7. Type-check gates

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build --filter @patina/supabase type-check
> tsc --noEmit
(no output)                                                    EXIT=0

$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build --filter @patina/designer-portal type-check
> tsc --noEmit
(no output)                                                    EXIT=0
```

Both clean. No type break from the regenerated (unchanged) `database.types.ts`
— consistent with §2's empty diff.

## 8. Settled — not findings

Per instruction, every ruling in `rulings.md` §3 (R-A … R-AY) governs and is
not relitigated here. Specifically checked as still holding, not reopened:

- **R-AY / R-AS** — `studio_channel_consent` is the only thing read for SMS
  consent; `people_directory`'s `consent_status` reads
  `channel_consent_status()` and the two consent **dates** join the record
  through `project_consent_org()`, never the frozen seat columns (probe 7 in
  `w1b-report.md`, re-confirmed by block 3/12 of the W1b suite passing and by
  Pete Rusk's own row: `opted_out` even though his Okonkwo seat column itself
  was seeded `not_asked` — the record, not the seat, wins).
- **PR-r / PR-w** — no `gate_code`-shaped column exists on
  `project_site_access_cards`; no client-facing policy or `show_to_client`
  column exists; confirmed independently in §3 above (client reads 0, anon
  refused at the grant).
- **PR-n** — the admin gate for `money`/`draw_certify` authority scopes lives
  in the RLS policy text itself, not only in the portal; test block 5 passes.
- **R-A / R-K / R-N** (lender/AHJ print no paper word; that's a display rule,
  not a SQL one) — consistent with F-27 Ray Thao's SQL-level `not_on_file`
  still being returned by the view (correct — the suppression is deliberately
  left to the room, per `w1b-report.md` §4 "Display rules deliberately left
  in the app").

## 9. Verdict

**Zero BLOCKING. Zero MAJOR.** One MINOR carried forward from this pass (§4,
F-12 Pete Rusk's seeded reach_state vs. `fixture.md`'s stated "field link").
All five of the prior fix log's MAJORs are independently confirmed fixed in
the migration source and proven by a from-scratch `supabase:reset` plus both
SQL suites passing at exit 0. Generated types are byte-identical to a fresh
`db:generate`. Both named type-check gates pass clean. RLS/grant probes as
designer, client, and anon all match the design's stated posture, including
the specific instruction to confirm a client role cannot see
`project_site_access_cards`. Every production reader of the changed
`people_directory` columns was independently re-derived by grep and matches
`w1b-report.md`'s own table exactly, with no missed call site.

**clean = true.**
