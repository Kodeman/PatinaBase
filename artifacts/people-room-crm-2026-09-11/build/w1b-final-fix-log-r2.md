# W1b final review r2 — fix log

Scope: the three MAJOR findings of `w1b-final-review-r2-migrations.md`, and nothing
else. `w1b-final-review-r2-tests.md` reports zero BLOCKING and zero MAJOR, so it
asked for no code change. Every MINOR in either report is left standing.

00623–00627 are unapplied on Strata, so all three fixes are **edits in place**; no
migration number is minted. Local Postgres only (`127.0.0.1:54322`), no prod act.
The worktree has no `apps/designer-portal/.env.local`, so nothing in it could point
at Strata.

Rulings honoured: R-AY/R-AW (record-only — every consent read added here resolves
through `channel_consent_status()` off `studio_channel_consent`; no seat consent
column is read anywhere, and no seat read is reintroduced), R-AK (a reduction is
scoped to the resolving studio's own rows, never across tenants), R-G/PR-p (no
person-level stage, no new person-level column at all), PR-u (a document is a fact
inside one rolodex), PR-h/CS2 §4 (only gating paper moves the paper word).

---

## MAJOR-1 — `compliance_state()` printed `current` over a firm whose lapsed, gating COI was still on file, through two more doors

**Files.** `supabase/migrations/00623_studio_compliance_documents.sql` — banner
lineage, a new named CHECK, two new legs in `assert_compliance_holder()`, two new
column comments, the function COMMENT and the `compliance_successor_not_later` HINT.
`supabase/tests/people/w1b_compliance_authority_directory_test.sql` — block 2.

**Door (a), the undated successor.** Closed twice over.

1. `studio_compliance_documents_dated_expiry_check` — `doc_type NOT IN ('coi_gl',
   'coi_wc', 'coi_auto', 'license', 'bond') OR expires_on IS NOT NULL`. crm-model
   §2's own rule ("yes for dated types"), which nothing enforced. An undated
   certificate cannot be recorded at all, so it cannot be a successor either.
2. `compliance_successor_undated` in the trigger — a dated `doc_type` whose
   `superseded_by` names a row with no `expires_on` is refused. This says the same
   thing where the CHECK cannot see it (a row that predates the constraint), and it
   is independently load-bearing: with the CHECK dropped, the second of the two
   member writes is still refused (probe80 §3).

The `compliance_successor_not_later` HINT no longer promises that "an undated
successor … always qualifies"; it now says an undated successor qualifies only for
a type that has no expiry at all.

**Door (b), the two-row supersede cycle.** `compliance_successor_already_superseded`
— `superseded_by` must name a document whose own `superseded_by IS NULL`, the head
of its chain. The trigger already read that row, so this costs one more column in
the same `SELECT`. A cycle of any length is unreachable in any number of statements,
because the edge that closes one must always point at a row that is already
superseded. A genuine chain (A→B, then B→C) is untouched, and so is re-pointing a
predecessor at a later renewal.

**Walked as a plain `member` of the seeded studio**, the review's own two probes:

```
$ psql … -f artifacts/…/build/probe70-w1b-final-r2-undated-successor-member.sql
--- 1. what the room prints for Northgate Electric, as the member, before any act ---
    display_name    | paper_state
--------------------+-------------
 Northgate Electric | lapsed
 Dana Kowalski      | lapsed
--- 2. PATH 1: an UNDATED coi_gl, then point the lapsed one at it (2 ordinary writes) ---
ERROR:  new row for relation "studio_compliance_documents" violates check constraint
        "studio_compliance_documents_dated_expiry_check"

$ psql … -f artifacts/…/build/probe71-w1b-final-r2-cycle-member.sql
--- PATH 2: the two-row supersede CYCLE. A second lapsed COI of the same type and date. ---
INSERT 0 1
UPDATE 1
ERROR:  compliance_successor_already_superseded
HINT:  superseded_by must name the paper that is STILL in force — a document whose own
       superseded_by is null. …
```

`probe80-w1b-fix-r2-major1-doors.sql` walks both doors and re-reads the word after
each refusal, then removes each guard in turn:

```
=== 0. what the room prints before any act (the fixture's G-14 fact) ===
 Dana Kowalski      | lapsed
 Northgate Electric | lapsed
=== 1. DOOR (a): record the renewal without typing the date ===
NOTICE:  undated coi_gl as a member -> new row … violates check constraint
         "studio_compliance_documents_dated_expiry_check"
 Dana Kowalski      | lapsed          (after_door_a)
 Northgate Electric | lapsed
=== 2. DOOR (b): the two-row supersede cycle ===
NOTICE:  A -> B (a legitimate supersede of one duplicate by the other): accepted
NOTICE:  B -> A (the edge that closes the loop) -> compliance_successor_already_superseded
 Dana Kowalski      | lapsed          (after_door_b)
 Northgate Electric | lapsed
    and the record: the 2026-03-31 lapse is still on file and still counted
 doc_type | expires_on |       blocks       | superseded
 coi_gl   | 2026-03-31 | {site_access,draw} | f
 coi_gl   | 2026-03-31 | {site_access,draw} | t
 license  | 2027-12-31 | {}                 | f
 w9       |            | {payment}          | f
=== 3. NEGATIVE CONTROL: drop the CHECK and door (a) reopens ===
NOTICE:  with the CHECK gone, the undated coi_gl lands: 40ba2b66-…
NOTICE:  the second write (mark the old one superseded) -> compliance_successor_undated
    the trigger leg holds the door on its own — the word has not moved:
 Dana Kowalski      | lapsed
 Northgate Electric | lapsed
```

**Test legs, one per door and then some** (block 2, which the review noted had
neither): `2i` an undated `coi_gl` is refused at the CHECK; `2j` an undated `bond`
likewise; an undated `lien_waiver_unconditional` still lands, because an undated
TYPE is untouched; `2k` with the CHECK dropped and restored inside the rolled-back
transaction, an undated successor of a dated paper is refused
(`compliance_successor_undated`); `2l–2n` the cycle — the card starts `lapsed`, the
first supersede lands, the edge that closes the loop is refused
(`compliance_successor_already_superseded`), and the word is still `lapsed`; `2o` a
real renewal at the head of the chain moves it to `current`. Three existing legs
(`2a`, `2b`, `2d`) gained an `expires_on` so each still isolates the constraint it
names rather than racing the new CHECK.

---

## MAJOR-2 — the Directory row for a carded human read the consent word off the CARD's number

**RULED** (the fix instruction's first option, taken): reduce the record's verdict
over **every number the identity carries** — the card's `phone_e164` plus the
`phone_e164` of every seat keyed to the same `party_identity_key()` — rather than
adding a second column the room would have to learn to print. This is R-AK/PR-x's
own reduction restated on the read side, it stays record-only (R-AY), and it adds no
column, so PR-y's "replaces the six-branch view at 100%, no flag" and the
append-only column contract both hold unchanged (`people_directory` is still 17
columns).

**Precedence — worst-first, which is least-permission-first:**

| | |
|---|---|
| `opted_out` | a refusal on ANY number this identity carries. Fail-closed, and G-3's defect is a row promising reach the rail refuses |
| `not_asked` | a number with no record at all: nothing may be sent to it, and "Not asked" is the honest call to action |
| `pending` | asked, unanswered |
| `granted` | only when EVERY number on file is permitted |

`NULL` still means the identity carries no number **anywhere** — the same fact the
branch used to state with `CASE WHEN sc.phone_e164 IS NOT NULL`, now true of the
identity rather than of the card alone.

**Files.** `supabase/migrations/00626_people_directory_v4_seats.sql` — new
`identity_consent_status(uuid, text, text)` with its REVOKE/GRANT and COMMENT; the
contacts branch's consent expression; the header's `consent_status` semantics
paragraph; the view COMMENT. `supabase/seed/00-legacy-grants.sql` regenerated.
`packages/supabase/src/database.types.ts` regenerated.

**Walked, with the old expression printed beside the new one**
(`probe81-w1b-fix-r2-major2-major3.sql`, two carded humans on the seeded Okonkwo job
— one whose card number is not the number their seat carries, one whose card has no
number):

```
=== MAJOR-2. the identity row, the seat line, and the record ===
  display_name  |  role   |     phone      | the_word_on_the_face
 Emailonly Sub  | contact |                | opted_out
 Two-Number Sub | contact | (612) 555-7100 | opted_out
  display_name  |  phone_e164  | the_word_on_the_seat
 Emailonly Sub  | +16125557001 | opted_out
 Two-Number Sub | +16125557200 | opted_out
 channel_value |  status
 +16125557001  | opted_out
 +16125557200  | opted_out

    NEGATIVE CONTROL - what the OLD expression (the CARD number alone) answers:
   full_name    | old_card_only_word | new_identity_word
 Emailonly Sub  |                    | opted_out
 Two-Number Sub | not_asked          | opted_out
```

**Test legs** (block 3): `3o` card number ≠ seat number, the seat's refusal is on the
face; `3p` a card with no number at all still prints its seat's refusal; `3q` no seat
line disagrees with the row; `3r` a carded human with no number anywhere still prints
no consent word (`NULL`); `3s` both numbers granted reads `granted`; `3t` one
un-asked number pulls the identity word back to `not_asked`, which is the ordering
itself rather than last-write-wins.

The seeded fixture is undisturbed — block 12's `12a` still counts exactly five
`granted` numbers in the studio, and `probe81`'s whole-fixture invariant reads
`rows_where_consent_understates = 0`.

**Not fixed, and not in scope:** the Directory's **party** branch (uncarded
identities) still reads its winning seat's number for the consent word. The finding
is stated over carded humans, whose identity row moved to the contacts branch; an
uncarded identity keyed on a phone has that same number on every seat by
construction, so only a profile- or email-keyed uncarded identity with two different
numbers could differ. Named here rather than changed, because the party branch's
`consent_word` is also the row's `status_raw` and its `meta.sms_consent_status`, and
moving it is a wider act than this round authorises.

---

## MAJOR-3 — `reach_state` on an uncarded identity's row saw only the winning seat's links

**Files.** `supabase/migrations/00626_people_directory_v4_seats.sql` — new
`reach_state_for_identity(uuid, text)` with its REVOKE/GRANT and COMMENT; the party
branch's reach expression; the header's `reach_state` paragraph; the view COMMENT.
`supabase/seed/00-legacy-grants.sql` and the generated types regenerated.

`reach_state_for(q.profile_id, NULL, q.id)` became
`reach_state_for_identity(q.profile_id, q.identity_key)`, whose EXISTS clause matches
`party_identity_key(...) = p_identity_key` — the same set `identity_seat_count()`
counts and `people_directory_seats` nests, and the rule the migration's own comment
(`00626:71-76`) and `w1b-report.md:129` already claimed. The contacts branch is
unchanged: it passes `sc.id`, which already matches every seat stamped with that card.
`reach_state_for(uuid, uuid, uuid)` is untouched and still serves the contacts branch,
the team branch and the per-seat read in `people_directory_seats`.

**Walked** (`probe81`, an uncarded two-seat identity whose live unexpired link hangs
on the seat the Directory does **not** point at):

```
=== MAJOR-3. the uncarded identity row, its seats, and the record ===
    display_name    | role | seat_count | reach_state
 Two-Seat Tradesman | sub  |          2 | field_link
               seat_id                |   project_name    |  stage   | reach_state | holds_a_live_link
 c8200000-…-000000000012 | Lindqvist kitchen | active   | on_paper    | f
 c8200000-…-000000000011 | Okonkwo residence | warranty | field_link  | t

    NEGATIVE CONTROL — what the OLD expression (the WINNING seat alone) answers:
    display_name    | old_winning_seat_only | new_identity_reach
 Two-Seat Tradesman | on_paper              | field_link

    and the invariant: no Directory row disagrees with the seat lines beneath it
 rows_where_reach_disagrees | 0
```

**Test legs** (block 4, whose uncarded identity held no link at all): `4e1` a live
link on the NON-winning seat reads `field_link` on the identity row; `4e2`/`4e3` the
link really is on the non-winning seat and the winner holds none, so the leg means
something; `4e4` a revoked link is not a door; `4e5` an expired one is not either.

---

## Gates

```
$ pnpm --dir <worktree> supabase:reset
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}

$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
NOTICE:  1. compliance_state: … passed
NOTICE:  2. the holder guard: … a dated type must carry its date (and may not be renewed by an
         undated one), and a supersede may not close a chain: passed
NOTICE:  3. people_directory v4: … and the consent word reduced worst-first over every number
         the identity carries — the card's and its seats': passed
NOTICE:  4. the uncarded identity: … reach reads a live door on a NON-winning seat (and stops
         reading a revoked or expired one) … passed
NOTICE:  5. … 6. … 7. … 8. … 9. … 10. … 11. … 12. … passed
NOTICE:  All W1b assertions passed.
ROLLBACK                                                      (12 blocks, 12 NOTICEs, exit 0)

$ psql … -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  All W1a assertions passed.                                              (exit 0)

$ psql … -f supabase/tests/document/lead_contact_phone_test.sql                  (exit 0)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir <worktree> db:generate
  packages/supabase/src/database.types.ts | 12 ++++++++++++      (the two new functions only)

$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2707 replayed statements
  supabase/seed/00-legacy-grants.sql | 24 ++++++++++++++++++++++++

$ pnpm --dir <worktree> --filter @patina/supabase        type-check   → 0
$ pnpm --dir <worktree> --filter @patina/designer-portal type-check   → 0

$ psql … BEGIN; \i 00623 \i 00626 \i 00623 \i 00626 → 'two in-transaction replays
  of both files: OK'; people_directory_columns = 17; the dated-expiry CHECK present
  exactly once. ROLLBACK.
```

No Deno suite is relevant: `grep -rln "people_directory\|reach_state\|compliance_state\|
identity_consent" supabase/functions/` matches one line, and it is a comment
(`sms-inbound/pipeline.ts:166`). No file under `supabase/functions/` was touched.

## One PRE-EXISTING failure, not caused here and not in scope

`supabase/tests/rls/people_directory_scope_test.sql` fails at its first assertion:

```
psql:supabase/tests/rls/people_directory_scope_test.sql:308: ERROR:  FAIL a2: expected
exactly 12 columns, got 17
```

It hard-codes `people_directory`'s pre-v4 shape. 00626 appends five columns on
purpose ("APPENDED, never inserted", `00626:40-46`), and that landed in `f21cc0087`,
before this round: this fix adds no view column at all (the generated-types diff is
two functions, and `git diff HEAD -- …00626… | grep -E "^[+-][^+-].* AS [a-z_]+,?$"`
matches only two lines inside the new function's CTE). `scope` is still column 12, so
the file's `a3` assertion is satisfied; only the count is stale. Owed to whoever owns
the wave's test-coverage debt, and left untouched under "these findings, nothing else".
