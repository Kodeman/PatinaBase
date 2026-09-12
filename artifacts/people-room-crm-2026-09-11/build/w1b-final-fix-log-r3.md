# W1b — final-run round 3 fix log

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **No prod act of
any kind: no `supabase db push`, no `supabase functions deploy`, no `supabase link`, no Strata
connection.** `apps/designer-portal/.env.local` does not exist in this worktree (`ls` → `No such
file or directory`), so nothing in it can point at Strata — the destructive-local guard is
satisfied by absence, as r3 also found.

Scope: exactly the three findings handed over — r3 migrations-review MAJOR-1 and MAJOR-2, and r3
tests-review MAJOR-1. Every open MINOR (r2's carried set plus r3's MINOR-26…MINOR-30) is untouched
and still open. R-AW / R-AY held throughout: **no consent write, no seat read, no frozen-column
read is added anywhere**; every consent verdict still resolves through the record.

Migration numbers: 00595–00620 untouched; 00621/00622 pre-existed; W1b's files remain exactly
00623–00627. Both fixes are edits **in place** in files unapplied on Strata, which the migration
rules allow. Grep-winner check before redefining anything:

```
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*assert_compliance_holder" supabase/migrations/*.sql | sort | tail -1
supabase/migrations/00623_studio_compliance_documents.sql
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*identity_consent_status" supabase/migrations/*.sql | sort | tail -1
supabase/migrations/00626_people_directory_v4_seats.sql
$ grep -rln "CREATE OR REPLACE VIEW[^(]*people_directory\b"          supabase/migrations/*.sql | sort | tail -1
supabase/migrations/00626_people_directory_v4_seats.sql
```

The winner is the file being edited in each case, so there is nothing to graft from — the fix is
applied to the latest body, not to an older copy.

---

## MAJOR-1 (migrations review) — the third door: an already-lapsed successor, and `blocks`' empty default

**FIXED.** `supabase/migrations/00623_studio_compliance_documents.sql`.

Two legs added to `assert_compliance_holder()`, after the head-of-chain leg, and `blocks` added to
the successor `SELECT` (`d.blocks` → `v_succ_blocks`, declared beside `v_succ_type` /
`v_succ_expires` / `v_succ_superseded`), exactly as the finding prescribed:

- `compliance_successor_already_lapsed` — a dated `doc_type`
  (`coi_gl`/`coi_wc`/`coi_auto`/`license`/`bond`) may not be retired by a successor whose
  `expires_on` is already `< CURRENT_DATE`.
- `compliance_successor_drops_a_gate` — refused unless `NEW.blocks <@ v_succ_blocks`: a renewal
  carries at least the gates of the row it retires. `<@`, not `=`, so widening the gates is still a
  renewal.

Ordering matters and is stated in the code: both new legs run **after**
`compliance_successor_already_superseded`, so a loop-closing edge that is also expired still answers
the cycle error — the worse fact, and the error r2's test leg 2m expects.

The trigger's `UPDATE OF` list is deliberately **not** widened to include `blocks`. Shrinking a
*retired* row's blocks only makes the subset test easier to satisfy and resurrects nothing
(`compliance_state()` ignores superseded rows entirely); editing the *successor's* blocks after the
supersede lands is r2/r3 **MINOR-2**, which is open by ruling and untouched here.

### Walked, as a plain studio member, exactly as probe88 walked it
`build/probe91-w1b-fix-r3-major1-doors.sql` / `.out`, all inside `BEGIN … ROLLBACK`, as
`studio_manager@patina.dev`:

```
=== before: the seeded fixture reads its own words ===
 Dana Kowalski      | lapsed
 Northgate Electric | lapsed

=== V1: the walked act — a coi_gl dated 5 days ago, blocks NEVER typed ===
NOTICE:  V1 leg 1 (the INSERT) landed: 11e2cbb3-920f-46aa-827e-5c6053ddff87
NOTICE:  V1 leg 2 (point the lapse at it): compliance_successor_already_lapsed
 Dana Kowalski      | lapsed
 Northgate Electric | lapsed
 Dana Kowalski | Lindqvist kitchen | lapsed
 Dana Kowalski | Okonkwo residence | lapsed

=== V2: the same act, but the certificate CARRIES the gates (still expired) ===
NOTICE:  V2 (gates carried, itself expired): compliance_successor_already_lapsed

=== V3: an HONEST future-dated renewal, gates left at the empty default ===
NOTICE:  V3 (future date, no gates typed): compliance_successor_drops_a_gate
NOTICE:  V3 positive control (gates typed): ACCEPTED — the renewal lands

=== why the word is STILL lapsed after V3 landed: V2 left a GATING expired row on file ===
 Lakes Regional Insurance | 2026-03-31 | {site_access,draw} | t
 Acme Mutual              | 2026-09-07 | {}                 | f
 Acme Mutual              | 2026-09-07 | {site_access,draw} | f
 Acme Mutual              | 2027-09-12 | {site_access,draw} | f
```

r3's V1 flipped Northgate Electric, Dana Kowalski's identity row and both her seat lines to
`current`; all three now stay `lapsed`. V3's positive control shows the honest renewal is still
accepted once its gates are typed, and the trailing `lapsed` is the record being honest — V2's
probe row is an expired **gating** certificate still on file, which is what `lapsed` means.

### Test legs, beside 2i–2o (`supabase/tests/people/w1b_compliance_authority_directory_test.sql`)

- **2p / 2p0 / 2p1** — door (c): `Stale Renewal Co`, a lapse retired by a certificate that expired
  five days ago **with the gates carried forward**, so the date is isolated from door (d). Refused
  `compliance_successor_already_lapsed`; the word stays `lapsed`.
- **2q0 / 2q / 2q1 / 2q2 / 2q3** — door (d): `Gateless Renewal Co`. `2q0` first asserts the
  renewal really was recorded with the **empty column default** (blocks never named in the INSERT),
  then the supersede is refused `compliance_successor_drops_a_gate`, the word stays `lapsed`, and
  two positive controls follow — the same act with the gates typed lands and the word moves to
  `current` (2q2), and a renewal **widening** the gates is still a renewal (2q3).

**One existing leg's fixture had to move, and this is the honest reason.** r2's cycle fixture
(2l–2o) built its loop from two certificates that had **both already expired**, so its first,
"legitimate" leg is exactly what door (c) now refuses; and a *later*-dated successor would make the
closing edge answer `compliance_successor_not_later` instead of the cycle error. The only shape in
which a cycle is still reachable — and therefore the only shape that still exercises the
head-of-chain guard — is two **in-force duplicates** of the same certificate carrying the same date
and the same gates, which is also the realistic act (the same COI recorded twice). So:

- `f5…041` and `f5…042` are now both `CURRENT_DATE + 100`, `{site_access,draw}`;
- **2l** asserts the card starts `current` on two live certificates (was: `lapsed`) and **2l0**
  asserts there really are two non-superseded certificates to make a loop out of;
- **2l1** asserts retiring one duplicate by its twin is honoured;
- **2m** is unchanged — the closing edge still answers `compliance_successor_already_superseded`;
- **2n** now asserts what the refusal preserved: the word is still `current`, **2n1** that the
  loop-closing edge was not recorded, and **2n2** that the word still rests on a dated certificate
  **in force** rather than on the card's W-9 alone — which is the fallback a closed loop buys.
- **2o** is unchanged and still passes.

---

## MAJOR-2 (migrations review) — a client/lead/maker/team row claimed a `seat_count` it cannot nest

**FIXED, option (a), and the choice is stated.** `supabase/migrations/00626_people_directory_v4_seats.sql`.

`seat_count` on the client (`:508`), lead (`:544`), maker (`:588`) and team (`:725`) branches is now
`0::integer` instead of `identity_seat_count(<a profile id>)`. `person_id` on those four branches is
a domain-table id (`designer_clients.id`, `leads.id`, `vendors.id`, `project_team_members.id`), and
`people_directory_seats.person_id` is only ever a rolodex card id or a `project_parties` id, so
nothing can nest under them by construction. 0 is what the row can nest, so 0 is what it claims.

**Why not option (b).** Keying the seats view at those rows would move the defect rather than close
it: an uncarded, profile-stamped seat of one of the Directory's seven kinds **also** gets a
party-branch row keyed on the same login, whose `person_id` is the winning seat's id — so the party
row would then claim N and nest 0, the same divergence one branch over. And one login holding both
a `designer_clients` row and an open lead has no single right answer. PR-c's "read the seats under
the household member's card" is served today by **stamping** the seat with that person's rolodex
card (`studio_contact_id`), which is exactly what the dev seed does for Chidi Okonkwo and what puts
the identity on the contacts branch, where the count and the nesting share one key; the household
OBJECT is P2.

00626's own comment at `:838-841` — the one the finding quoted as stating the invariant it breaks —
is rewritten to say what is true: the join nests every seat under exactly one row and **no Directory
row ever claims a seat_count it cannot nest**, with the two by-design dangles (a kind outside the
seven; a seat stamped with neither a card nor one of the seven kinds) named explicitly.

### Walked, as probe83 walked it
`build/probe92-w1b-fix-r3-major2-and-party-consent.sql` / `.out`, section A. The two seats are
inserted by a **plain member** (`studio_manager@patina.dev`) through ordinary RLS, and read back as
the studio owner:

```
=== A0: the whole-fixture invariant BEFORE the act ===
 rows_where_count_disagrees | total_rows
                          0 |         62

=== A1: the act — two login-stamped seats for the household member ===
INSERT 0 2
--- the CLIENT Directory row for that household: claimed vs nested ---
  role  | display_name |              person_id               | seat_count | nested
 client | Client User  | 573b2449-cd41-41cd-94db-747a1418c18e |          0 |      0
--- the NEGATIVE CONTROL: what the old expression claimed ---
 old_seat_count_keyed_on_the_profile
                                   2
--- where those two seats nest ---
 aa000000-0000-4000-8000-000000000001 | client_rep | Client User (rep seat)
 aa000000-0000-4000-8000-000000000001 | other      | Client User (second rep seat)

=== A2: the whole-fixture invariant AFTER the act ===
 rows_where_count_disagrees | total_rows
                          0 |         62
```

r3 measured this act taking `rows_where_count_disagrees` from 0 of 62 to **2 of 62**; it now stays
0 of 62, and the negative control shows the old expression still claiming 2.

### Test leg (block 4, before the whole-fixture assertion)

**4l / 4m / 4n** stage PR-c's own act — two seats (`client_rep` and `other`) stamped with the
**login** of a *seeded* `designer_clients` row (`d0000000-…-c001` / `client-solo@patina.dev`), so
the shape is the shipped one, not an invention of the test. They assert the identity really does
hold two visible seats, that the client Directory row claims **0**, and that both seats key to one
`person_id`. They are staged **before 4k**, so 4k's "no row anywhere claims a count it cannot nest"
now runs over data that can break it — which the finding correctly said it never had.

No TypeScript reader depends on the column yet (`grep -rn seat_count apps packages --include=*.ts
--include=*.tsx` → only `database.types.ts` and the function's own signature), so nothing in the
portals changes; W2 builds the unfold on the seats view.

---

## MAJOR-1 (tests review) — the PARTY branch's consent word read the winning seat's number

**FIXED.** `supabase/migrations/00626_people_directory_v4_seats.sql`.

The r2 fix log's own "not fixed, and not in scope" carve-out is closed. `consent_word` no longer
lives inside the `DISTINCT ON` subquery off `pp.phone_e164`; the party branch is now

```sql
FROM (
  SELECT q0.*,
         COALESCE(public.identity_consent_status(
           public.project_consent_org(q0.project_id),
           q0.identity_key, NULL), 'not_asked')  AS consent_word
  FROM ( … DISTINCT ON (party_identity_key(…)) … ) q0
) q
```

i.e. the second option the finding offered — the word computed **above** the `DISTINCT ON`, keyed on
`identity_key` — using `identity_consent_status()`, which is r2 MAJOR-2's own reduction and already
wired into the contacts branch. Three consequences, all deliberate:

- it is evaluated **once per emitted identity**, not once per candidate seat, so MINOR-30's cost
  shape is not made worse;
- because it replaces `q.consent_word` at its source, all **three** faces of the party branch move
  together — `status_raw`, `meta.sms_consent_status` and the appended `consent_status` — so no
  reader can print a softer word than another;
- the card-phone argument is `NULL` (an uncarded identity has no card; its numbers are exactly its
  seats'), and the `COALESCE` to `'not_asked'` preserves 00594's party-branch shape, where
  `status_raw` has always carried a word rather than NULL. The contacts branch's
  NULL-means-no-number-anywhere rule is untouched (test 3r still passes).

Record-only holds: `identity_consent_status()` resolves **every** number through
`channel_consent_status()` at **one** studio (R-AK), and nothing here reads a
`project_parties.sms_consent_*` column.

### Walked
`build/probe92-…out`, section B: an identity keyed on a **login** (`party_identity_key()`'s 2nd leg,
which outranks the phone, so the two seats may carry two different numbers) with the refusal on the
**non-winning** seat's number:

```
--- the row, its three consent faces, and the seat it points at ---
   display_name   |              person_id               | status_raw | meta_word | consent_status | seat_count
 Two Number Login | aa000000-0000-4000-8000-000000000012 | opted_out  | opted_out | opted_out      |          2
--- its two seat lines ---
 aa000000-…-011 | +16125550771 | opted_out
 aa000000-…-012 | +16125550772 | not_asked
--- the NEGATIVE CONTROL: the winning seat's own number alone ---
 old_expression_word
 not_asked

=== B2: no Directory row is more permissive than the record, whole fixture ===
 pairs | face_hides_a_refusal
    11 |                    0
```

The winning seat is `…012`, whose own number carries no record — `not_asked` is exactly what the old
expression printed. The seat **lines** still print per-number truth (`not_asked` on `…012`), which
is correct: a seat line is about that seat's number, the identity row is the worst-first reduction.

### Test leg (block 4, `4e6`–`4e11`)

One row for the login-keyed identity; the winner is asserted to be the newer seat (so the leg means
something); `consent_status`, `status_raw` and `meta->>'sms_consent_status'` are each asserted
`opted_out`; and `4e11` is the negative control asserting the winning seat's own number carries no
record.

### One shipped W1a leg had to be widened, not weakened

`supabase/tests/people/w1a_identity_channels_consent_test.sql` leg **37c2** asserted that
`people_directory`'s definition contains the literal string `channel_consent_status`. The party
branch was the last place that literal appeared in the view text; both consent-bearing branches now
reach the record through `identity_consent_status()`. 37c2 now accepts either reader **and** a new
**37c3** asserts the chain to the record rather than assuming it — `identity_consent_status`'s own
`prosrc` must contain `channel_consent_status`. R-AS/R-AY's claim is asserted more tightly than
before, not more loosely.

---

## Verification run (every command, in order)

```
$ ls -la apps/designer-portal/.env.local
"apps/designer-portal/.env.local": No such file or directory (os error 2)

$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2707 replayed statements
$ git status --porcelain -- supabase/seed/00-legacy-grants.sql
                                        # (empty — no GRANT/REVOKE changed)

$ pnpm --dir <worktree> supabase:reset
RESET_EXIT=0
Seeding data from supabase/seed/people_crm_dev.sql...
Finished supabase db reset on branch main.
$ grep -in error <log> | grep -vi _error
                                        # (nothing)

$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
W1B_EXIT=0                              # 12 blocks, 12 NOTICEs, all passed
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
W1A_EXIT=0                              # All W1a assertions passed

# the seed replays on an already-seeded database
$ psql … -v ON_ERROR_STOP=1 -f supabase/seed/people_crm_dev.sql
SEED_REPLAY_EXIT=0
docs=36 seats=31 authority=11 consent=7 site_cards=1     # identical to post-reset

# every shipped suite that touches the changed objects
people/w1b_compliance_authority_directory_test             exit=0
people/w1a_identity_channels_consent_test                  exit=0
field/field_links_test                                     exit=0
rls/project_roster_test                                    exit=0
rls/field_parties_test                                     exit=3  ERROR: consent_legacy_column_frozen
rls/people_directory_scope_test                            exit=3  ERROR: FAIL a2: expected exactly 12 columns, got 17
rls/sms_tables_test                                        exit=0
rls/studio_contacts_backfill_test                          exit=0
document/lead_contact_phone_test                           exit=0
rls/00584_studio_comember_rls_sweep.test                   exit=0
site_requests/security_and_lifecycle_test                  exit=3  ERROR: send must transition not_asked consent to pending
commercial/trade_rfq_test                                  exit=3  ERROR: design services agreement d9300000-… not found or access denied
```

The four reds are **the same four, with the same messages**, as r3 §1.4 measured before this round:
MINOR-27 (`people_directory_scope_test`'s stale column count), MINOR-28 (the two W1a
freeze/repoint suites) and the unrelated `trade_rfq_test`. No new red; none of the three fixes
touched them, and all four remain open by ruling.

```
# replay / idempotency
00623_studio_compliance_documents              exit=0 REPLAY_OK   (file applied twice, rolled back)
00626_people_directory_v4_seats                exit=0 REPLAY_OK

# all five in one transaction, then the shapes
people_directory_columns = 17
dated_expiry_check_count = 1
assert_compliance_holder carries both new legs = 1

# generated types
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir <worktree> db:generate
GEN_EXIT=0
$ git diff --numstat -- packages/supabase/src/database.types.ts
                                        # (empty — no drift; no function signature changed)

$ pnpm --dir <worktree> --filter @patina/supabase   type-check   → SUPABASE_TC=0
$ pnpm --dir <worktree> --filter designer-portal    type-check   → DESIGNER_TC=0
```

Two commands needed the sandbox disabled and are recorded as such: `supabase:reset` (writes
`~/.supabase/telemetry.json`) and `db:generate` (reads the Docker socket). Both failed first inside
the sandbox with `EPERM` / `operation not permitted`, never with a SQL error. `db:generate`'s first
sandboxed attempt truncated `database.types.ts` through the shell redirect; the file was restored
with `git checkout --` before the real run, and the final `git diff --numstat` above is over the
committed file.

## Files changed

```
supabase/migrations/00623_studio_compliance_documents.sql          two trigger legs + v_succ_blocks + COMMENT + banner lineage
supabase/migrations/00626_people_directory_v4_seats.sql            party-branch consent wrapper; seat_count 0 on four branches;
                                                                   seats-view comment; view COMMENT; banner lineage
supabase/tests/people/w1b_compliance_authority_directory_test.sql  2l0/2l/2l1/2n/2n1/2n2 reworked; 2p/2q added; 4e6–4e11 added;
                                                                   4l/4m/4n added before 4k; two NOTICE strings extended
supabase/tests/people/w1a_identity_channels_consent_test.sql       37c2 widened, 37c3 added
artifacts/.../build/probe91-w1b-fix-r3-major1-doors.sql|.out       the two supersede doors, walked as a plain member
artifacts/.../build/probe92-w1b-fix-r3-major2-and-party-consent.sql|.out
artifacts/.../build/w1b-final-fix-log-r3.md                        this file
```

`supabase/seed/00-legacy-grants.sql` regenerated and byte-identical; no seed data changed; no edge
function, portal, iOS or `packages/*` source touched.

## Still open, deliberately (for the next round's reader)

Every MINOR from r2 and r3 stands, unfixed and unclaimed — in particular **MINOR-2** (a member may
still edit `blocks` on a non-superseded row, or on a successor after the supersede lands, with no
history row), **MINOR-26** (`w1b-report.md` documents a code state now four fix rounds old — it
should be rewritten from the code, not patched), **MINOR-27** (one line in
`people_directory_scope_test.sql`: `12` → `17`) and **MINOR-30** (the five appended columns' cost
before W2 commits the room to `select('*')`).
