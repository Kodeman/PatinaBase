# W1b — adversarial migration review, final run round 2

Reviewer context: fresh. Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD `7eba49899`
(`eea1f4ce3` = the r1 fix commit, over baseline `f21cc0087`). Local Supabase only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **No prod act of any kind** — no
`supabase db push`, no `supabase functions deploy`, no Strata connection, no `supabase link`
(`supabase/.temp/project-ref` is absent in this worktree).

Read in full: `rulings.md` (all, §3's R-A…R-AY settled), `synthesis/direction.md` §2.2/§3.8/§7/§8,
`synthesis/crm-model.md` §1/§2/§4/§5, `briefing/current-state.md` §B–§E, `briefing/fixture.md`,
`build/inventory.md`, `build/w1a-report.md` §8, `build/w1a-close-review-r6-migrations.md` and
`-tests.md`, `build/w1b-report.md`, `build/w1b-final-review-r1-migrations.md` +
`-tests.md`, `build/w1b-final-fix-log-r1.md`; then
`00623_studio_compliance_documents.sql`, `00624_project_party_window_and_authority.sql`,
`00625_project_site_access_cards.sql`, `00626_people_directory_v4_seats.sql`,
`00627_access_grants_and_field_link_window.sql`, `supabase/seed/people_crm_dev.sql`,
`supabase/tests/people/w1b_compliance_authority_directory_test.sql`, `supabase/config.toml`, and
every base object and shipped function those five graft from or read
(`is_studio_comember`, `is_active_studio_member`, `is_org_admin_or_owner`, `channel_consent_status`,
`project_consent_org`, `normalize_channel_value`, `studio_contact_org`, `project_party_designer`,
`record_channel_consent`, `project_parties`' nine policies, `field_link_tokens`' two).

**Verdict: NOT clean — 0 BLOCKING, 3 MAJOR, 26 MINOR.**

The three MAJORs are all in 00623/00626 and all have the same shape: a word on the face that
disagrees with the record beneath it. **Every one of them is invisible to the seeded fixture and to
the SQL suite** — the fixture gives every card the same number as its seat, its one uncarded
identity holds a single seat, and no compliance holder carries an undated paper of a dated type. All
five of r1's MAJORs are genuinely closed (§3).

---

## 0. Environment, before the destructive local act

```
$ grep -n NEXT_PUBLIC_SUPABASE_URL /Users/kody/Code/patina-merged/apps/designer-portal/.env.local
1:# prod # NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co
14:# prod # NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
19:NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321      ← local
$ ls -a .codex/worktrees/agent-people-build/apps/designer-portal | grep -i env
.env.example                                           ← the worktree has no .env.local of its own
$ cat supabase/.temp/project-ref ; echo "exit=$?"
exit=1                                                 ← the CLI is not linked here
```

---

## 1. What I ran

### 1.1 Legacy grants, regenerated first

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2703 replayed statements
$ git -C . diff --stat -- supabase/seed/00-legacy-grants.sql
                       # empty — byte-identical to what is committed
```

### 1.2 Reset, twice

```
$ pnpm --dir …/agent-people-build supabase:reset
RESET1_EXIT=0    (555 "Applying migration" lines; seeds through people_crm_dev.sql
                  and 99-local-edge-settings.sql; no line matching /error/i except the
                  filename 00458_sms_message_error_capture.sql)
$ pnpm --dir …/agent-people-build supabase:reset
RESET2_EXIT=0    (same)
$ psql … -At -c "select count(*), max(version) from supabase_migrations.schema_migrations;"
555|20260910152111
$ psql … -At -c "select count(*) from public.studio_compliance_documents;"   → 36
$ psql … -At -c "select count(*) from public.project_parties;"               → 31
```

The first `supabase:reset` attempt failed at `EPERM … /Users/kody/.supabase/telemetry.json` — the
Bash sandbox, not the DB; rerun with the sandbox disabled for that one command. Worth knowing for
the next round: the CLI restarts containers at the end of a reset, and for ~15 s afterwards the
database answers on :54322 while still mid-swap (a query in that window reported 370 migrations and
an empty `organizations`). Sleep before asserting.

### 1.3 Both SQL suites

```
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
W1B_EXIT=0   13 lines matching "passed"
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
NOTICE:  12. the seeded fixture reads as the fixture: … : passed
NOTICE:  All W1b assertions passed.
ROLLBACK

$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
W1A_EXIT=0   49 lines matching "passed"   NOTICE:  All W1a assertions passed.
```

### 1.4 Replay / idempotency — each file in its own rolled-back transaction

```
$ for n in 00623 00624 00625 00626 00627; do psql … -v ON_ERROR_STOP=1 -c BEGIN -f <file> -c ROLLBACK; done
== 00623 replay exit=0 ==   == 00624 replay exit=0 ==   == 00625 replay exit=0 ==
== 00626 replay exit=0 ==   == 00627 replay exit=0 ==     (no error, no warning)
```

### 1.5 Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir … db:generate
GEN_EXIT=0
$ git -C . diff --numstat -- packages/supabase/src/database.types.ts
                       # empty — no drift from what is committed
```

### 1.6 My own probes (objects and access only; every fixture inside `BEGIN … ROLLBACK`)

`/tmp/claude/p1-cycle.sql` (supersede cycle + undated successor, own studios),
`p4-launder2.sql` / `p5-cycle-member.sql` (the same two doors walked as a plain `member` of the
seeded studio, against Northgate Electric), `p6-crosstenant.sql` + `p7b.sql` (a whole second tenant,
reads and writes both directions, every new pointer), `p8-reach.sql` (an uncarded two-seat
identity), `p9-invariants.sql` (seat_count vs nested seats over all 62 Directory rows; the three
words compared between the Directory row and its own seat lines; `v_access_grants`),
`p10.sql` (`studio_channel_consent` readability; client-branch nesting), `p11.sql` (the date join,
PR-l's caller date, the `blocks[]` and DELETE paths, the seed's frozen columns),
`p12-consent-face.sql` (a card whose number differs from the seat's), `p13-prior.sql` (r1's five
MAJORs, re-walked).

---

## 2. Migration rules — pass/fail

| Rule | Verdict |
|---|---|
| hand-numbered `NNNNN_slug.sql` | **PASS.** 00623–00627, contiguous after 00622. 00595–00620 untouched (`ls supabase/migrations/006[01]*` shows none). The brief's "mint from 00622" could not hold — 00622 pre-exists on this branch — and the report says so in its own §0. |
| grep-winner before redefining | **PASS.** `grep -rln "CREATE OR REPLACE FUNCTION[^(]*create_field_link" supabase/migrations/*.sql \| sort \| tail -1` → `00284` before this wave, `00627` after. 00284's ownership guard and supersede are carried verbatim into the two-argument body; the one-argument form is a delegate, so the two cannot drift. Every other redefinition in the wave is a first definition. |
| banner + lineage | **PASS.** All five carry a banner naming the gap, the ruling and the reconciliation; 00626 carries the `people_directory` lineage to 00594 and 00627 the `create_field_link` lineage to 00284. |
| idempotent | **PASS.** §1.4. |
| RLS in the same file | **PASS.** All three new tables enable RLS and define all four policies in the file that creates them. |
| explicit grants both directions + `REVOKE … FROM PUBLIC, anon` | **PASS on everything the wave creates**; one inherited object is uneven — MINOR-7. Probed: `anon` holds SELECT on none of the five new relations; the four trigger functions also revoke from `authenticated`. |
| SECURITY DEFINER pins `search_path` | **PASS.** Every definer function in the wave carries `search_path=public` (or `public, extensions, pg_temp` for `create_field_link`, matching 00284). The two functions with no `proconfig` (`party_identity_key`, `party_kind_in_directory`) are SECURITY INVOKER, IMMUTABLE and touch no table. |
| schema-qualify extension fns | **PASS.** `extensions.gen_random_bytes` / `extensions.digest` in `create_field_link` (00627:486-487). |
| guarded crons | **N/A.** No cron in this wave (the expiry sweep is P2 and the report says so). |
| CHECK over enum | **PASS.** `stage`, `site_access_mode`, `contracted_through`, `doc_type`, `doc_label`, `blocks`, `held_by`, `source`, `scope` are all named CHECKs, drop-and-re-added so a rerun widens them. |
| money integer cents | **PASS.** `threshold_cents integer` with `>= 0`; the seed's $2,500 line is `250000`. |
| legacy grants regenerated | **PASS.** §1.1 — the committed file is already current. |
| reset applies + the dev seed replays + reset twice | **PASS.** §1.2. |
| SQL tests | **PASS.** §1.3. |
| probe objects, never the ledger | **PASS.** No probe of mine wrote to `supabase_migrations`. |

### 2.1 The RLS predicates the brief names

| Object | Predicate found | Brief |
|---|---|---|
| `studio_compliance_documents` (4 policies) | `is_active_studio_member(organization_id)` on all four | ✔ the `studio_contacts` family |
| `project_party_authority` (4) | `is_studio_comember(project_party_designer(engagement_id))`, plus PR-n's `scope NOT IN ('money','draw_certify') OR is_org_admin_or_owner(project_party_org(engagement_id))` on insert/update/delete | ✔ the `project_parties` family |
| `project_site_access_cards` (4) | `is_studio_comember(project_designer(project_id))`, **no client leg, no `show_to_client` column** | ✔ PR-w |
| `compliance_state` | SECURITY **INVOKER** — a caller outside the studio reads `not_on_file` (probed: Alpha reads Beta's firm as `not_on_file` and vice versa) | ✔ 00594's posture |

`is_studio_comember(NULL)`, `is_active_studio_member(NULL)` and `is_org_admin_or_owner(NULL)` all
return false, so a project with no designer or no studio fails closed everywhere these appear.

### 2.2 Cross-tenant — clean, in both directions

A whole second tenant (Studio Beta: own owner, project, two cards, seat, compliance document,
money authority grant, site access card, consent record). As `designer@patina.dev` (seeded studio):

```
               relation               | beta_rows_visible
--------------------------------------+-------------------
 studio_compliance_documents          |  0
 project_party_authority              |  0
 project_site_access_cards            |  0
 people_directory (beta names)        |  0
 people_directory_seats (beta seat)   |  0
 v_access_grants (beta project scope) |  0
    ALPHA writing into BETA:
ERROR:  new row violates row-level security policy for table "studio_compliance_documents"
UPDATE 0                                   (the site access card)
ERROR:  new row violates row-level security policy for table "project_party_authority"
```

And the reverse (Beta reading Alpha): 0 rows on all five, `compliance_state(<Alpha firm>)` =
`not_on_file`. Every new pointer refuses a cross-tenant value, walked with literal ids so no
subquery could silently resolve to NULL:

```
party_company_other_studio · party_warranty_contact_other_studio ·
compliance_holder_other_studio · site_access_key_holder_off_project ·
authority_copy_to_off_project
```

### 2.3 PR-n, walked as three roles

Test block 5 passes and I re-read the policies: the UPDATE policy gates on the NEW row's scope in
`WITH CHECK`, so the two-statement escape (insert `selections`, then update it to `money`) is
closed. DELETE is gated too, so a member cannot remove a principal's money grant.

### 2.4 The stage/window backfill

`UPDATE … WHERE pj.status='completed' AND pp.stage='active'` (00624:283-292), `warranty` inside
twelve months of `COALESCE(completed_at, updated_at)` and `off_job` after, with the stand-in named
in the comment. Replays without moving a hand-set stage except `active` itself — MINOR-10.

### 2.5 `create_field_link` — the graft

00284's guard and supersede are verbatim; only the expiry changed; both signatures callable; the
one-argument form delegates. The r1 MAJOR-1 invariant (`field_link_window_closed` raised **before**
the supersede) is in place and the raise is now unreachable only because the CASE cannot produce a
dead date — verified in §3.

---

## 3. r1's five MAJORs — all closed

| r1 finding | Status | Evidence (this round) |
|---|---|---|
| MAJOR-1 — a mint dated in the past that revoked the live token | **FIXED** | Dana's Lindqvist seat forced to a closed window (`on_site_to = CURRENT_DATE-40`, `warranty_until = -30`) with a live +30d token standing: `minted expiry 2026-12-11 (dead: f) · prior token now revoked · live tokens on the seat: 1`. Nothing dead, exactly one live door. |
| MAJOR-2 — the two views chose different winners | **FIXED** | A mixed-kind uncarded identity (older `sub`, newer `vendor`, same phone): `claims 2 / nests 2`. Over the whole seeded fixture: `rows_where_count_disagrees = 0` of 62 Directory rows. The two dangling seats (Granite North `vendor`, Karin Lindqvist `client`) are the by-design dangle, not a divergence — but see MINOR-24. |
| MAJOR-3 — `compliance_state` never read `blocks[]` | **FIXED** | `gateless lapse: current` → same paper given one gate → `lapsed`. |
| MAJOR-4 — a W-9 "renewed" a lapsed COI | **FIXED as stated** | `W-9 renewing a COI: refused compliance_successor_wrong_type`; `shorter-dated COI: refused compliance_successor_not_later`. **But the consequence is reachable through two other doors — MAJOR-1 below.** |
| MAJOR-5 — the shipped Directory feed loses every trade on deploy | **RECORDED, as ruled** | The hard-constraint banner is at 00626:78-92 and says what it must. No SQL change was expected. |

Of r1's 17 MINORs, **1 is escalated** (MINOR-2, the supersede cycle — now worse than r1 measured
it, see MAJOR-1), **1 is closed** (MINOR-17's four named coverage gaps now have legs; new gaps
replace it as MINOR-21), and **15 stand open**, re-verified below.

---

## 4. Findings

### BLOCKING — none

Walked and clear:

- **No text can reach a number whose record says `opted_out`.** No file in this wave writes
  `studio_channel_consent`, the frozen `sms_consent_*` columns, or any send gate;
  `grep -n "studio_channel_consent\|sms_consent_\|record_channel_consent\|refusal_unanswered"
  supabase/migrations/0062[3-7]*.sql` returns only comments and the two reads 00594 already owned
  plus one new LEFT JOIN. `record_channel_consent`'s transition gate refuses `pending` **and**
  `granted` while an unanswered refusal stands, keyed on the channel value, so even the wrong face
  word of MAJOR-2 cannot become an invite to a refused number.
- **No opt-out can be lost.** The freeze trigger still names exactly the ten columns
  (`refuse_legacy_consent_write_trg`, test block 11), none of 00624's ten new columns among them.
  The dev seed writes **zero** non-default consent columns on any of the 31 seats
  (`seats_with_a_nondefault_consent_column = 0`), so R-AY is honoured by the fixture as well as the
  code.
- **No cross-tenant read or write** — §2.2, both directions, every relation and every pointer.
- **No RLS or grant hole** — §2, §2.1. `anon` holds SELECT on none of the five new relations and is
  refused at the grant on the site access card before any policy runs.
- **No reset/replay failure** — §1.2, §1.4, two resets and five in-transaction replays.
- **No write path destroys consent evidence** — nothing in the wave writes the consent record; the
  one seed-side exception is MINOR-19 and touches seven invented numbers in one seeded org.

---

### MAJOR-1 — `compliance_state()` prints **current** over a firm whose lapsed, gating COI is still on file. r1 MAJOR-4's consequence is reachable through two other doors, and the MAJOR-3 fix made the second one worse

Two ordinary writes by a **plain `member`** of the seeded studio, through the same PostgREST path
r1 MAJOR-4 used. Both leave the lapsed COI on file with its true date.

**Door (a) — an UNDATED successor of the same paper.** The guard requires same `doc_type` and
`expires_on` no earlier; an undated successor is exempt by design, and the HINT says so
("An undated successor (a signed waiver, a W-9) is open-ended and always qualifies",
`00623:256-258`). Nothing requires `expires_on` on a COI, so the successor can be a COI with no
date at all — which `compliance_state` then counts as held and never lapsing:

```
--- what the room prints for Northgate Electric, as the member, before any act ---
    display_name    | paper_state            display_name  | paper_state
 Northgate Electric | lapsed                 Dana Kowalski | lapsed
--- two writes: record a renewal without typing the date, then mark the old one superseded ---
INSERT … doc_type 'coi_gl', issuer 'Acme Mutual (renewal, no date typed)', blocks {site_access,draw}
UPDATE … SET superseded_by = <new id> WHERE expires_on = '2026-03-31'      → UPDATE 1
    display_name    | after_path_1           display_name  | dana_after_path_1
 Northgate Electric | current                Dana Kowalski | current
--- the record still holds the lapse ---
 doc_type | expires_on |       blocks       | superseded
 coi_gl   | 2026-03-31 | {site_access,draw} | t
 coi_gl   |            | {site_access,draw} | f
 license  | 2027-12-31 | {}                 | f
 w9       |            | {payment}          | f
```

**Door (b) — the two-row supersede CYCLE** (r1 MINOR-2). Only self-reference is blocked
(`00623:96-97`); `A→B, B→A` passes both new legs whenever the two rows share a `doc_type` and a date
(or the successor is undated). r1 measured the cycle as `lapsed → not_on_file` and graded it MINOR
on that basis. **After the MAJOR-3 fix it is `lapsed → current`**, because the surviving
non-superseded rows are the card's gateless paper — and every real firm in the fixture holds a W-9:

```
--- as a plain member: a second lapsed COI of the same type and date, then the cycle ---
UPDATE 1   UPDATE 1
    display_name    | after_the_cycle
 Northgate Electric | current
 doc_type | expires_on |       blocks       | superseded
 coi_gl   | 2026-03-31 | {site_access,draw} | t
 coi_gl   | 2026-03-31 | {site_access,draw} | t
 license  | 2027-12-31 | {}                 | f
 w9       |            | {payment}          | f
```

On a card with no other paper the cycle still reads `not_on_file` — also wrong, and also not
`lapsed`:

```
A1 before the cycle, two lapsed gating COIs  : lapsed
A2 after A->B and B->A (same type, same date): not_on_file   [lapsed rows still on file: 2]
A3 cycle + one undated W-9 on file           : current
```

**Why this is MAJOR and not MINOR.** G-14's headline fact — F-11 Northgate Electric's COI lapsed
2026-03-31 and nothing in Patina knows — is the reason the table exists, and both doors put the
sage word `Current` (direction §3.8) over it while the lapse stands in the record, on the firm card
**and** on every person whose `paper_state` reads that firm (`Dana Kowalski: current`). Door (a)
needs no bad faith at all: "we got the renewal, I didn't have the certificate in front of me" is the
single most likely data entry a studio makes. crm-model §2 already states the rule that would close
it — `expires_on`, "**yes for dated types**" — and the seed's own comment shows the builder knew
(`people_crm_dev.sql:552-554`: "Ashgrove Millwork's install-day COI is deliberately absent … a row
with no expiry would read `current`"). A fixture written around the hazard is not a guard.

- **Files.** `00623:61-98` (no `expires_on` requirement; the only cycle guard is
  `superseded_by <> id`), `00623:224-260` (the successor leg), `00623:355-376` (`compliance_state`).
- **Fix, both halves.** (i) A named CHECK requiring `expires_on` for the dated doc types
  (`coi_gl, coi_wc, coi_auto, license, bond`) — crm-model §2's own rule — and refuse an undated
  successor for a dated type. (ii) Refuse a supersede that closes a chain: the simplest form that
  holds is `superseded_by` must name a row whose own `superseded_by IS NULL`, which makes a cycle
  unreachable in any number of statements and costs one more `SELECT` in a trigger that already
  reads that row. The test needs a leg for each door; block 2 currently has neither.

---

### MAJOR-2 — the Directory row for a carded human reads the consent word off the **card's** number, so a recorded `opted_out` on the number the person's seat carries is not on the face

v4 moves every carded human's identity row to the CONTACTS branch, which reads
`channel_consent_status(sc.organization_id, 'sms', sc.phone_e164)` (`00626:615-618`) — the card's
number. `people_directory_seats` reads the **seat's** number (`00626:723-725`). Where a card's
number differs from the seat's, or the card has none, the two disagree, and the row the redesigned
room renders is the wrong one:

```
--- the identity row the room renders ---
  display_name  |  role   |    phone     | the_word_on_the_face
 Emailonly Sub  | contact |              |                        ← no word at all
 Two-Number Sub | contact | +16125557100 | not_asked
--- the seat line beneath it ---
  display_name  |  phone_e164  | the_word_on_the_seat
 Emailonly Sub  | +16125557001 | opted_out
 Two-Number Sub | +16125557200 | opted_out
--- the record ---
 channel_value |  status
 +16125557001  | opted_out
 +16125557200  | opted_out
```

**This is a regression against what 00594 shipped** for the seated population: before v4 the party
branch emitted a row per seat carrying that seat's own record verdict, so the Directory showed
`Opted out`. After v4 the party branch emits only *uncarded* identities, and the fold (00418) plus
W1a's carding moved essentially everyone to the CONTACTS branch. The fixture cannot show it because
the seed gives every card the same number as its seat (`p9` §3: zero consent disagreements across
all 62 rows), and the suite has no leg for it.

Direction §1.4 is explicit — consent is "printed against the number with its date and the job it
came from, **everywhere that number appears**" — and `Opted out` is the Blocked (terracotta) word in
§3.8's consent family. A studio reading `Not asked` reads an instruction to go and ask.

- **Not BLOCKING.** `record_channel_consent`'s transition gate refuses `pending` and `granted` while
  an unanswered refusal stands on that value, and the send gate reads the record off the seat's
  `phone_e164`, so no text reaches a refused number and no opt-out is lost. The damage is the face
  and the studio act that follows it.
- **Files.** `00626:615-618` (the card read), `00626:723-725` (the seat read), `00626:57-62` and
  `w1b-report.md:130` (which document "NULL where … a card with no `phone_e164`" without naming
  this consequence).
- **Fix.** Either reduce over every number this identity actually carries — the card's plus its
  seats' `phone_e164`, worst-first, which is R-AK/PR-x's own reduction restated on the read side —
  or add a second column so the room can print the card's verdict beside "and a refusal stands on a
  number on this job". Whichever Fable rules, it needs a test leg with a card number ≠ seat number,
  and one with a card carrying no number at all.

---

### MAJOR-3 — `reach_state` on an uncarded identity's Directory row sees only the winning seat's links, so the row prints `On paper` while the seat line beneath it prints `Field link`

The party branch calls `reach_state_for(q.profile_id, NULL, q.id)` (`00626:487`) — the winning
seat's id, and NULL for the card — so the EXISTS clause (`00626:202-211`) can only match links on
that one seat. The contacts branch passes `sc.id` (`00626:614`) and therefore does match every seat
stamped with that card, which is why carded humans are right and uncarded ones are not:

```
--- the Directory row for the uncarded two-seat identity ---
    display_name    | role | seat_count | reach_state
 Two-Seat Tradesman | sub  |          2 | on_paper
--- its seats, and which of them holds the live link ---
   seat_id   |   project_name    |  stage   | reach_state | holds_a_live_link
 …a1         | Lindqvist kitchen | warranty | field_link  | t
 …a2         | Okonkwo residence | active   | on_paper    | f
--- the record ---
 live_links_for_this_human = 1
```

The migration's own comment and the report both state the intended rule, which the code does not
meet: "else a live unexpired field link **on one of this identity's seats**" (`00626:71-76`;
`w1b-report.md:129`). Direction §1.3 puts reach on the Directory row and §3.8 makes `Field link` the
Pending (golden) word; a row reading `On paper` for a trade who has a live door is the reach drift
G-20/G-21 this program exists to remove, and the studio's next act is to mint a second link for
someone who already holds one.

- **Fix.** Pass the identity, not the row: `reach_state_for(q.profile_id, NULL, q.identity_key)`
  with the EXISTS clause matching `party_identity_key(...) = p_identity_key`, or a sibling
  `reach_state_for_identity(text)`. `q.identity_key` is already in the subquery's select list
  (`00626:497-498`) and `identity_seat_count` already keys on exactly that. A test leg needs an
  uncarded identity with the link on the **non-winning** seat; block 4's uncarded identity has no
  link at all.

---

### MINOR findings

Severity per the brief: wording, comments, placement, test coverage, service-role-only paths — plus
divergences whose consequence is not a wrong verdict on a reachable path. "Carried" = r1's finding,
re-verified open this round.

| # | Finding | Where | Evidence |
|---|---|---|---|
| MINOR-1 | **Carried (r1 MINOR-1).** An explicit `p_expires_at` still cannot beat a live window, so PR-l's "make the studio choose, with the warranty end offered as the second option" cannot be built on this RPC | `00627:461-469`; test block 10 asserts the override as intended | `caller asked 2026-09-26, seat window ends 2027-08-13, token expires 2027-08-14 → caller date honoured: f` |
| MINOR-2 | **One UPDATE of `blocks[]` — or one DELETE — moves a holder from `lapsed` to `current`, with no audit row anywhere.** `blocks` is member-writable and outside the assert trigger's `UPDATE OF` list, and DELETE is granted to `authenticated`. The `blocks` semantics are ruled (CS2 §4) and a correction is a legitimate act, but the table has no history object at all, so nothing records that a gate was removed or a lapsed certificate deleted | `00623:78`, `:285-288`, `:326-328` | as the studio owner: `before_blocks_edit lapsed` → `SET blocks='{}'` → `after_blocks_edit current`; then `DELETE 1` → `after_delete current` |
| MINOR-3 | **Carried.** `v_access_grants`' eleven tiers are not crm-model §2's eleven: `project_team_seat` and `maker_account` are missing, `site_request` and `project_review` added. `project_team_members` is a live tier `people_directory`'s own team branch reads, so "what is open on this teammate" is unanswerable | `00627:226-381` vs crm-model §2 | the 11 tier literals grepped from the file: agreement_link, client_account, doc_share, evidence_upload, field_link, invoice_pay, plan_link, project_review, rfq_link, site_request, studio_member |
| MINOR-4 | **Carried.** Four branches carry a LINK id as `subject_id` (`subject_type` `'link'` / `'exception'`), so CS2-14's question — "what is open on this person" — is unanswerable for `plan_link`, `invoice_pay`, `doc_share` and `evidence_upload`; crm-model §2 says `subject_ref` is "Person or Engagement" | `00627:163`, `:198`, `:288`, `:352` | read |
| MINOR-5 | **Carried.** The `project_review` branch sets `granted_by = pra.revoked_by` — the person who closed the door, labelled as the person who opened it | `00627:375` | read |
| MINOR-6 | **Carried.** The `client_account` branch sets `last_used_at = dc.last_contacted_at` — the studio's own outbound touch, not the homeowner's use of the account | `00627:258` | read |
| MINOR-7 | **Carried.** 00626 restates `GRANT SELECT … TO authenticated` on `people_directory` with no `REVOKE … FROM PUBLIC, anon`, unlike every other object the wave touches (`people_directory_seats:759`, `v_access_grants:399` both revoke) | `00626:660` | `people_directory … anon_sel = t`; the other five read `f`. Harmless today (the view is `security_invoker` and anon fails at `studio_contacts`), but the wave's own posture applied unevenly |
| MINOR-8 | **Carried.** `site_access_mode`'s vocabulary is not crm-model §2's (`controls / key / escorted / scheduled / none`): the CHECK says `escorted / key / code / open`, so `scheduled` and `none` are unrepresentable and F-19/F-24/F-25/F-27 all seed as `escorted`; the column is nullable where the model says required; and `code` is added in the wave whose whole argument (PR-r) is that Patina holds no code | `00624:121-124`, `:157-160` | catalog + the seeded distribution |
| MINOR-9 | **Carried.** Stage vocabulary drift: `invited` where crm-model §2 says `invited_to_bid`; `mobilized` and `retired` have no display word in direction §3.8's stage family | `00624:110-116` | catalog |
| MINOR-10 | **Carried.** The backfill's `AND pp.stage = 'active'` guard protects every hand-moved stage except `active` itself, so a seat a studio deliberately set back to `active` on a completed project is re-overwritten on every replay; the comment claims the guard protects hand-moved stages generally | `00624:281-292` | read + §1.4 |
| MINOR-11 | **Carried.** Three formulas for one word: the party branch uses `compliance_state(q.company_id)` (an uncarded seat with no firm reads `not_on_file`, not NULL), the contacts branch `COALESCE(sc.company_id, sc.id)`, the seats view `COALESCE(pp.company_id, pp.studio_contact_id)`. `w1b-report.md` §4 states only the second and calls it the rule | `00626:489`, `:619`, `:727` | read |
| MINOR-12 | **Carried.** Two ungated SECURITY DEFINER oracles: `project_designer(uuid)` and `project_party_org(uuid)` answer for **any** project id to any authenticated caller. Carried class (w1a r4 MINOR-12 on `project_consent_org`), now doubled | `00625:42-53`, `00624:69-82` | as Alpha: `project_designer(<Beta project>)` → Beta's designer uuid, `project_party_org(<Beta seat>)` → Beta's org uuid |
| MINOR-13 | **Carried.** On a `studio_id IS NULL` project `project_consent_org()` falls back to `_primary_studio_for(designer_id)`, so another studio's recorded refusal for the same number is invisible in both new readers. Fail-closed downstream (the send gate resolves the same org and refuses), so it under-reports on the face only | `00626:504-506`, `:517-520`, `:723-725` | `select count(*) filter (where studio_id is null) … from public.projects` → **5 of 8** |
| MINOR-14 | **Carried.** `v_window_end::timestamptz` makes the link's expiry session-timezone-dependent; the comment says "through the END of the window's last day", which in a UTC session is 19:00 the previous evening for a Minneapolis studio | `00627:465-466` | read |
| MINOR-15 | **Carried.** `w1b-report.md` §5 still says `use-party-sms.ts:133` "is the only" `create_field_link` call site | `w1b-report.md:236` | `grep -rn create_field_link packages apps supabase/functions` → also `supabase/functions/_shared/sms.ts:565`, the path by which r1 MAJOR-1 reached the send rail |
| MINOR-16 | **Carried.** `people_crm_dev.sql` is in `[remotes.staging.db.seed]`, and the derivation invariant cited as the reason is already broken in the committed file — `./seed/catalog/first-flight-catalog.sql` is in `[db.seed]` and absent from staging | `supabase/config.toml:60`, `:88` | read; the builder flagged the line itself (report §6, §8) |
| MINOR-17 | `w1b-report.md` is stale against the code it describes, in four places that matter to a reader deciding whether to trust it: §1 and §4's `compliance_state` description never mentions `blocks[]` (the whole of the MAJOR-3 fix); §5's expiry ladder omits the closed-window rule and `field_link_window_closed`; §4's `reach_state` row is falsified by MAJOR-3; §7 pastes `passed=12` and twelve NOTICE lines where the suite now prints thirteen | `w1b-report.md:44`, `:129`, `:226-236`, `:356-371` | read + §1.3 |
| MINOR-18 | 00626's comment (and the report) justify `reach_state_for`'s INVOKER posture by saying `field_link_tokens` is "designer-only RLS (00283), so a co-member without that visibility reads `on_paper` where a link exists". The table also carries `field_link_tokens_studio_rw` (`ALL`, `is_studio_comember(p.designer_id)`), so that degrade does not occur for a studio co-member. The comment describes a hazard that is not there — harmless, but it is the comment a later reader would rely on | `00626:71-76`; `pg_policies` on `field_link_tokens` | two policies: `field_link_tokens_designer_all`, `field_link_tokens_studio_rw` |
| MINOR-19 | The dev seed is the only writer in the tree that moves `studio_channel_consent.status` **and** `refusal_unanswered` without `record_channel_consent`'s transition gate, and it does so unconditionally (`ON CONFLICT … DO UPDATE SET status = EXCLUDED.status, … refusal_unanswered = EXCLUDED.refusal_unanswered`). Local resets wipe first so nothing is lost there; combined with MINOR-16 it is the one path in the program that could write over a refusal outside the gate. Blast radius is seven invented `+1612555…` numbers in one seeded org | `supabase/seed/people_crm_dev.sql:489-542` | read |
| MINOR-20 | `create_field_link` has no stage check, so an `off_job`, `declined` or `retired` seat is minted a fresh **90-day** door (crm-model §5: off job → "links revoked"). This is the reach of the r1 fix's own flagged trade-off — the fix log names the `RAISE`-on-closed-window ruling as owed — but the ruling as owed is about a closed *window*, and a seat explicitly taken off the job is a second case | `00627:461-469`; no `stage` read in the body | §3's MAJOR-1 walk mints a live token for a seat whose window closed 40 days ago |
| MINOR-21 | **Test coverage for the three MAJORs above.** Block 2 has no leg for an undated successor of a dated type and none for a supersede cycle; nothing anywhere stages a card whose `phone_e164` differs from its seat's, or a card with no number; block 4's uncarded identity holds no field link, so the non-winning-seat reach case is untested. The seeded fixture cannot show any of the three, so the suite is the only place they can be caught | `supabase/tests/people/w1b_compliance_authority_directory_test.sql:217-346`, `:432-533` | read + the four probes above |
| MINOR-22 | `access_grants_trade_agreement_links()` gates on `studio_trade_agreements.contact_id`'s org but returns `studio_trade_agreement_tokens.contact_id` as `subject_id`. Both columns exist and should agree; if they ever diverge the row is gated by one card's studio and labelled with another's | `00627:127-135` | `\d studio_trade_agreement_tokens` → carries its own `contact_id` |
| MINOR-23 | `identity_seat_count()` reads `project_parties` under that table's own nine policies (self, project team, coordination party, client `show_to_client`, plus the studio legs) while `people_directory_seats` narrows to co-membership of `designer_id`/`lead_designer_id`/`created_by`, so `seat_count` can exceed the seats that nest — the r1 MAJOR-2 class from the count side rather than the winner side. Zero on the fixture; latent, and it needs a `profile_id`-stamped or team-visible seat to bite | `00626:229-241` vs `:736-740`; `pg_policies` on `project_parties` | `rows_where_count_disagrees = 0` of 62 today |
| MINOR-24 | A client-branch Directory row can never nest a seat: its `person_id` is `designer_clients.id`, which `party_identity_key()` never produces. All 7 client rows report `seat_count = 0` (consistent, so not a divergence), but PR-c's "every member who acts on a job gets a seat carrying the authority grant", read under the household member's card, only works where that member also holds a rolodex card. The seeded `client` seat for Karin Lindqvist is one of the two dangling seats | `00626:320`, `:344`; `00626:686-700` | `client_rows 7 / client_rows_claiming_seats 0`; dangling seats: Granite North (`vendor`, by design), **Karin Lindqvist (`client`)**. Chidi and Adaeze nest correctly because both carry cards |
| MINOR-25 | `verified_by` on a compliance document is an unconstrained `profiles` FK — any profile id in the database, including one in another tenant — where 00623 otherwise asserts every card pointer to the owning studio. A verification attributed to a stranger is a weaker audit than the file's own posture implies | `00623:72`; `assert_compliance_holder()` does not read it | read |
| MINOR-26 | **The consent DATES are absent from the identity row of every carded human.** The CONTACTS branch's `meta` carries no `sms_consented_at` / `sms_opt_out_at` / source / origin project, and the new LEFT JOIN onto the record (`00626:517-520`) lives in the party branch, which after v4 emits only uncarded identities — so R-Q's one consent sentence ("Opted out by text, 3 Dec 2025, on the Lindqvist kitchen") cannot be composed from the row the room renders. `w1b-report.md` §4 item 3 and its probe 7 (`dates_still_off_the_seat = f`) overstate the fix: the mechanism works, but only where nothing renders it | `00626:603-612` vs `:476-477`, `:517-520` | all seven consented humans: `meta_consented_at` and `meta_opt_out_at` empty; the mechanism proven on a constructed uncarded seat (`granted`, `meta_consented_at 2026-09-09T…`). Mitigated: `studio_channel_consent` carries `GRANT SELECT TO authenticated` and a member SELECT policy, so W2 can join it directly |

---

## 5. Things I checked that are clean, so the next round need not re-walk them

- **PR-r.** No `gate_code`, `code`, `access_code`, `lockbox_code` or `show_to_client` column on
  `project_site_access_cards`; the seeded card carries a lockbox *version*, an alarm *account*, the
  hours, six emergency lines and four `told_refs`, and no code value anywhere in its text.
- **PR-w.** Four policies, all `is_studio_comember(project_designer(project_id))`, no client leg;
  `anon` refused at the grant before any policy runs; a client account reads 0 rows from all four
  new objects (test block 7).
- **PR-n.** Gated in the INSERT, UPDATE (both `USING` and `WITH CHECK`) and DELETE policies, so the
  scope-escalation-by-update escape is closed; walked as member, owner and non-member.
- **The freeze.** `refuse_legacy_consent_write_trg` still names exactly the eight consent columns
  plus `phone`/`phone_e164`; none of 00624's ten new columns is on it and all ten are writable by a
  member (test block 11).
- **`v_access_grants`.** Reads without raising for a studio member; the four grant-closed sources
  come through their own definer readers with explicit studio gates and return no token and no hash;
  `grant_ids_that_look_like_a_token = 0`; `REVOKE`d from PUBLIC and anon.
- **`party_identity_key` / `party_kind_in_directory`.** One definition each, IMMUTABLE, pure, used
  by both views and the expression index; the winner is computed over one candidate set.
- **The five appended columns.** All twelve original `people_directory` columns keep their position
  and type; `select('*')` readers widen.
- **Generated types.** No drift, and none after a second `db:generate`.
- **The fixture's headline counts.** 28 person + 21 firm `contact` rows = 49, 62 Directory rows
  total, Dana Kowalski one row / two seats / four words.

---

## 6. What would make this clean

1. **MAJOR-1** — require `expires_on` on the dated doc types and refuse an undated successor for
   one; refuse a supersede that closes a chain. Two test legs.
2. **MAJOR-2** — rule whether the identity row prints the card's number or reduces over every number
   the identity carries, then implement the ruling; two test legs (card ≠ seat, card with no
   number).
3. **MAJOR-3** — pass `q.identity_key` (already in scope) instead of the winning seat's id; one test
   leg with the link on a non-winning seat.

The 26 MINORs are Fable's to filter. If any are worth closing in this round, MINOR-17 (the report no
longer describes the code), MINOR-15 and MINOR-18 cost nothing and are what a later reader will
trust; MINOR-16 and MINOR-19 are one line together.
