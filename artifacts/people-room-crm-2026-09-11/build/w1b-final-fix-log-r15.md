# W1b — final review round 15, fix log

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`. Local DB only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **Nothing touched on Strata**: no
`supabase db push`, no `supabase functions deploy`, no `wrangler`, no `db:push`.

Scope: exactly the two MAJOR findings of `w1b-final-review-r15-migrations.md`. Nothing else was
changed — `p1`, `p3`, `p4`, `p5`, `n1–n9` and `m1–m19` are left open by design, and
`w1b-final-review-r15-tests.md` was clean (zero BLOCKING, zero MAJOR), so it asked for nothing.

Both edited migrations are **unapplied on Strata** (00594 §3's banner records that the whole
00590–00594 block has only ever run locally; 00626's own banner says every fix round is an edit in
place), so both are amended in place per the migration rules. No migration number was minted;
00595–00620 stay reserved and untouched.

Grep-winner check before touching either body, as the rules require:

```
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*assert_studio_contact_identity_stable" supabase/migrations/*.sql | sort | tail -1
supabase/migrations/00593_studio_contact_channels.sql
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*reach_state_for" supabase/migrations/*.sql | sort | tail -1
supabase/migrations/00626_people_directory_v4_seats.sql
```

Both heads are the files edited; both bodies were grafted from those heads.

---

## MAJOR-1 — the stamped seat is the sixth holder

**`supabase/migrations/00593_studio_contact_channels.sql`** — `assert_studio_contact_identity_stable()`
(R-AR) counted five holders of a rolodex card and not `project_parties.studio_contact_id`, the
column 00626 made the v4 identity key. `assert_project_party_cards()` (00624:646-678, R-AP) polices
that column from the **seat** side only, so nothing fired when the **card** moved out from under the
stamp, and `studio_contacts_member_update` is `is_active_studio_member(organization_id)` in USING and
WITH CHECK — one ordinary `PATCH /rest/v1/studio_contacts` by a member of two studios.

**Fix** — the sixth holder, in the shape of the five already there (the finding's own text):

```sql
  SELECT count(*) INTO v_n
    FROM public.project_parties pp
   WHERE pp.studio_contact_id = OLD.id;
  IF v_n > 0 THEN
    v_holders := v_holders || (v_n || ' seat(s) stamped with this card');
  END IF;
```

plus the HINT's closing clause, the function COMMENT, and a banner note recording the in-place
amendment. Body stays `SECURITY DEFINER` with `SET search_path TO 'public'` and
`REVOKE ALL … FROM PUBLIC, anon, authenticated`; no grant changed in either direction, so
`generate-legacy-grants.py` reproduces the committed seed byte for byte (below).

### Negative control + positive control — `build/probe58-r15-major1-negative-control.sql`

TX 1 restores the pre-fix five-holder body and walks the finding with ordinary authenticated writes
on seeded objects; TX 2 runs the identical walk against the shipped body. Both ROLLBACK.

```
$ psql … -v ON_ERROR_STOP=1 -f artifacts/…/build/probe58-r15-major1-negative-control.sql
NOTICE:  TX1 BEFORE  localdev admin row: on_paper | opted_out | seat_count 1
NOTICE:  TX1 BEFORE  seats nesting under it: 1
NOTICE:  TX1 holders the guard does NOT count: 1 seat(s) stamped with this card
NOTICE:  TX1 *** CARD MOVED TO THE SECOND STUDIO — no guard fired ***
NOTICE:  TX1 AFTER   localdev admin: directory rows for the card      | 0
NOTICE:  TX1 AFTER   localdev admin: seat rows still nesting under it | 1
NOTICE:  TX1 AFTER   localdev admin: can it read the card at all      | 0
NOTICE:  TX1 AFTER   identity row word      | not_asked
NOTICE:  TX1 AFTER   its own seat line word | opted_out
NOTICE:  TX1 AFTER   and the RECORD at Local Dev Studio | opted_out
ROLLBACK
NOTICE:  TX2 refused: studio_contact_identity_held | hint: … 1 seat(s) stamped with this card. …
NOTICE:  TX2 kind flip refused: studio_contact_identity_held
NOTICE:  TX2 restatement still writes | P58 Fresh Card, renamed
NOTICE:  TX2 localdev admin: directory rows for the card      | 1
NOTICE:  TX2 localdev admin: seat rows nesting under it       | 1
NOTICE:  TX2 localdev admin: the identity word                | opted_out
NOTICE:  TX2 once the seat is closed the card is free again | entity_kind company
ROLLBACK
```

TX 1 reproduces the reviewer's `probe307` walk line for line, including `not_asked` printed over the
studio's own recorded `opted_out`. TX 2 shows the refusal, the hint that counts the seats, that a
RESTATEMENT still writes (the shipped card hook writes `entity_kind` on every edit), that the working
studio keeps the human and the record's word, and that closing the seat reopens the door.

### Regression test — W1a block 47

`supabase/tests/people/w1a_identity_channels_consent_test.sql`, new block 47 (47a unheld card is free,
47b studio move refused + the hint names the seat, 47c kind flip refused, 47d restatement writes,
47e closing the seat reopens the door). Following block 29's own convention, 47a exercises the KIND
flip rather than the studio move, because `studio_contacts`' member RLS WITH CHECK would be what
refuses a move into a studio the member does not belong to and would prove nothing about this guard;
on the held card in 47b the BEFORE trigger is the one that answers first.

```
NOTICE:  47. a seat stamped with the card holds it: the card cannot be moved to the member's other
         studio or change its kind while a seat still names it, the hint counts the seats, a
         restatement still writes, and closing the seat reopens the door (r15 MAJOR-1, R-AR): passed
```

---

## MAJOR-2 — the contacts branch asks the identity, not the unbounded card leg

**`supabase/migrations/00626_people_directory_v4_seats.sql`** — r14 MAJOR-1 gave
`reach_state_for_identity()` the seats view's WHERE verbatim; its sibling `reach_state_for()` kept a
card leg whose only predicate is `pp.studio_contact_id = p_card_id` (`:643`) — no `projects` join, no
tenant leg, no designer-of-record leg — and the CONTACTS branch, where every carded human now lives
(49 of the seeded studio's 62 rows against the party branch's 1), called exactly that leg.

**Fix** — the narrower of the finding's two options, which deletes the asymmetry instead of writing a
fifth copy of R-BG's predicate: the contacts branch now calls

```sql
  public.reach_state_for_identity(sc.profile_id, sc.id::text),
```

the same identity key `identity_consent_status()` and the `identity_seats` join on that branch
already use (`party_identity_key()`'s first COALESCE leg is the card id). `reach_state_for()`'s body
is untouched — its five remaining call sites pass a profile id alone (client, lead, maker, team) or a
party id (`people_directory_seats`, whose own WHERE already bounds which seats it emits) — and its
COMMENT now records that **no reader passes `p_card_id` any more**, so the asymmetry cannot be read
as an oversight next round. Banner, `§`-list lineage entry and the view COMMENT amended to match.

### Negative control + control — `build/probe59-r15-major2-negative-control.sql`

One transaction, ROLLBACKed. Stages the pre-00624 shape (a seat wearing this studio's card on
another studio's job — no live write path can mint it, so `assert_project_party_cards_trg` is lifted
for one INSERT and put straight back), reads it as an admin of the card's studio who is no member of
the job's studio, and prints both functions side by side.

```
NOTICE:  member_of_leah f | member_of_localdev t
NOTICE:  foreign seat readable raw   | 1        ← the premise: the caller really does read both
NOTICE:  foreign link readable raw   | 1           base rows, so the word is not right by accident
NOTICE:  seats nested under the card | 0
NOTICE:  OLD  reach_state_for(profile, card, NULL)        | field_link   ← the finding
NOTICE:  NEW  reach_state_for_identity(profile, card)     | on_paper
NOTICE:  the Directory row                               | on_paper | seat_count 0
NOTICE:  CONTROL the Directory row with its OWN link      | field_link | seat_count 1
NOTICE:  CONTROL the seat line beneath it                | field_link
ROLLBACK
```

The control is the point: the predicate refuses a foreign door, not every door.

### Regression test — W1b block 25

`supabase/tests/people/w1b_compliance_authority_directory_test.sql`, new block 25, the contacts-branch
twin of block 24: the premise legs (both base rows readable raw), the seats view nesting nothing, the
row reading `on_paper / seat_count 0`, `reach_state_for_identity()` itself, then the control leg with
a seat and a live link on the card's own studio's job reading `field_link / seat_count 1` on the row
and `field_link` on the seat line.

```
NOTICE:  25. the CONTACTS branch's reach word reduces over the seats the row nests — a live field
         link on a seat wearing this studio's card but sitting on another studio's job no longer
         prints field_link over seat_count 0 and no seat line, and the studio's own link still does
         (r15 MAJOR-2): passed
```

**Owed to the deploy brief, unchanged and re-stated:** `00624:724-739`'s preflight is still a comment
nothing runs (m11), and this fix does not measure the Strata population it turns on. Run it beside
R-BD's and R-BI's counts before the chain:

```sql
SELECT count(*) FROM project_parties pp
  JOIN projects pj        ON pj.id = pp.project_id
  JOIN studio_contacts sc ON sc.id = pp.studio_contact_id
 WHERE pp.studio_contact_id IS NOT NULL
   AND (pj.studio_id IS NULL OR sc.organization_id <> pj.studio_id);
```

Locally 0, which is why nothing in the fixture moves.

---

## Verification

R-AW / R-AY held throughout: neither edit reads or writes any `project_parties.sms_consent_*` column
and neither introduces a seat read into a consent path. MAJOR-1 adds a `count(*)` over
`project_parties.studio_contact_id` — the identity stamp, not a consent column; MAJOR-2 removes a
seat-shaped read and replaces it with the identity reducer that already carries R-BG's predicate.

```
$ grep -n NEXT_PUBLIC_SUPABASE_URL /Users/kody/Code/patina-merged/apps/designer-portal/.env.local
19:NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321       # the worktree has no copy of its own

$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2724 replayed statements
$ git status --porcelain -- supabase/seed/00-legacy-grants.sql        → (no diff; no grant changed)

$ SUPABASE_DB_URL=… pnpm supabase:reset      RESET1_EXIT=0   555 "Applying migration" lines
$ psql … -At -c "select count(*) from supabase_migrations.schema_migrations;"      → 555
$ psql … -At -c "… where version >= '00590';"
00590 00591 00592 00593 00594 00621 00622 00623 00624 00625 00626 00627 20260910152111
   # 00595–00620 untouched and reserved
   # the only /error/i line in the run is the FILENAME 00458_sms_message_error_capture.sql

$ psql … -f supabase/tests/people/w1a_identity_channels_consent_test.sql   W1A_EXIT=0   50 blocks
$ psql … -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
                                                                          W1B_EXIT=0   25 blocks

# idempotence: both edited files replayed over the populated database
$ psql … -v ON_ERROR_STOP=1 -f supabase/migrations/00593_studio_contact_channels.sql   REPLAY_EXIT=0
$ psql … -v ON_ERROR_STOP=1 -f supabase/migrations/00626_people_directory_v4_seats.sql REPLAY_EXIT=0
$ both suites again                       W1A_AFTER_REPLAY_EXIT=0 (50)  W1B_AFTER_REPLAY_EXIT=0 (25)

$ SUPABASE_DB_URL=… pnpm supabase:reset      RESET2_EXIT=0   555   ledger 555, identical
$ both suites + both probes on that clean reset
  W1A_EXIT=0 (50)   W1B_EXIT=0 (25)   P58_EXIT=0   P59_EXIT=0

$ SUPABASE_DB_URL=… pnpm db:generate      GEN_EXIT=0
$ git diff --numstat -- packages/supabase/src/database.types.ts      → (empty — no drift)

$ pnpm --filter @patina/supabase        type-check   → SUPABASE_TC=0
$ pnpm --filter @patina/designer-portal type-check   → DESIGNER_TC=0

# both fixes live on the reset database, read off the catalogue rather than the file
$ psql … -At -c "select prosrc like '%seat(s) stamped with this card%' from pg_proc
                  where proname='assert_studio_contact_identity_stable';"                → t
$ psql … -At -c "select pg_get_viewdef('public.people_directory'::regclass)
                  like '%reach_state_for_identity(sc.profile_id%';"                      → t

# the seeded fixture is unchanged by either fix (locally 0 cross-tenant stamps)
as designer@patina.dev:  client 7 · contact 49 · lead 5 · sub 1      (r15's own figures)
  reach_state: account 9 · field_link 6 · on_paper 47
  rows claiming a seat_count they cannot nest                        → 0
  contact rows reading field_link over seat_count 0                  → 0
```

### The full SQL sweep, and one honest discrepancy

```
$ for f in $(find supabase/tests -name "*_test.sql" | sort); do psql … -v ON_ERROR_STOP=1 -f $f; done
TOTAL=166 RED=31
```

r15 recorded `TOTAL=166 RED=30`. **The extra red is not this fix**, and the control says so directly:
with the PRE-FIX five-holder guard body restored live on the same database, the same sweep returns

```
CONTROL_WITH_PREFIX_GUARD TOTAL=166 RED=32
```

— i.e. reverting the fix makes one MORE test red (W1a, whose block 47 then fails), and none green.
The sweep was also run on a virgin database (a third `supabase:reset`, `RESET3_EXIT=0`, 555) and
returned the identical 31 files, so it is not order- or state-dependent in this checkout. Separately,
none of the 31 red files references `people_directory`, `reach_state`, `studio_contact_identity`,
`SET entity_kind` or `SET organization_id` (grepped, zero hits across all 31), and no DB function
writes `studio_contacts.entity_kind` or `.organization_id` — so neither changed object is reachable
from any of them. The 30↔31 delta is a baseline difference against r15's run, carried forward with
`m10` rather than silently absorbed.

### Environment note for the orchestrator, not a branch finding

`docker ps` showed `supabase_db_patina-hours` alongside `supabase_db_supabase` throughout — the
hour-tracking session on its own container. No competing `supabase db reset` was running against
54322 during any of the four resets in this pass (checked with `ps` before the first), and r15's
`m15` did not recur.

## Files changed

- `supabase/migrations/00593_studio_contact_channels.sql` — the sixth holder, the HINT, the function
  COMMENT, the banner's in-place-amendment note.
- `supabase/migrations/00626_people_directory_v4_seats.sql` — the contacts branch calls
  `reach_state_for_identity(sc.profile_id, sc.id::text)`; `reach_state_for()`'s COMMENT, the banner's
  reach paragraph, the lineage list and the view COMMENT amended to match. No function body redefined
  beyond the view itself.
- `supabase/tests/people/w1a_identity_channels_consent_test.sql` — block 47 + its header entry.
- `supabase/tests/people/w1b_compliance_authority_directory_test.sql` — block 25.
- `artifacts/people-room-crm-2026-09-11/build/probe58-r15-major1-negative-control.sql` (new).
- `artifacts/people-room-crm-2026-09-11/build/probe59-r15-major2-negative-control.sql` (new).
- `artifacts/people-room-crm-2026-09-11/build/w1b-final-fix-log-r15.md` (this file).

No rulings file was edited: MAJOR-1 is R-AR completed and MAJOR-2 is R-BG applied to the branch r14
did not touch, so neither needs a new ruling id. Both are recorded in the migrations' own banners.
