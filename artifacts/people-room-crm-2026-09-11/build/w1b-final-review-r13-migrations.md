# W1b — final review, round 13 (migrations)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`. Local Supabase only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **Nothing was pushed to Strata.**

Read in full: `build/w1b-report.md`; the five migrations it names (`00623`–`00627`); `rulings.md` §1–§6
(R-A…R-BH settled); `synthesis/direction.md` §2.2, §3.8, §7, §8; `synthesis/crm-model.md` §1, §2, §4, §5;
`briefing/current-state.md` §B–§E; `build/inventory.md`; `briefing/fixture.md`; `build/w1a-report.md`;
`build/w1a-close-review-r6-migrations.md` / `-tests.md`; `build/w1b-final-fix-log-r12.md` and
`build/w1b-final-review-r12-migrations.md`.

**Verdict: NOT clean — 0 BLOCKING, 2 MAJOR, 28 MINOR (9 new this round, 19 carried).**

Both MAJORs are consequences of r12's own two fixes meeting the shipped inline add
(`useAddProjectParty`, `packages/supabase/src/hooks/use-coordination.ts:500-512`). Neither is a
cross-tenant hole and neither can send a text to a refused number: the send gate
(`supabase/functions/_shared/sms.ts:725-731`) refuses on `channelConsentVerdict() === "refuse"` **before**
the `sms_optin_invite` carve-out, so no path in this wave reaches an `opted_out` number.

---

## 0. What I ran, and what it said

### Environment — local, and the sole-owner premise did not hold

`apps/designer-portal/.env.local` does not exist in this worktree (nothing can point at Strata from here).
The stack under test is `supabase_db_supabase` on `0.0.0.0:54322`; the other program's stack is
`supabase_db_patina-hours` on `:54422`.

**Mid-review another session ran `pnpm --dir .../agent-people-build supabase:reset` against the same
:54322 stack.** It was caught by `ps`:

```
kody 13614 ... supabase db reset
kody 13600 ... node .../pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build supabase:reset
```

Two of my resets were contaminated by it — one died mid-apply with
`LegacyMigrationApplyError: Connection terminated unexpectedly / At statement: 0 / -- 00405 …`, and one
reported `RESET_EXIT=0` with `Applying migration` ×555 while the ledger afterwards read `328`. Both
recovered once the other reset finished. That is r12's `m15` reproducing **with a named cause**; see m15
below. Every number in this report is from the three clean passes taken after `pgrep -f "supabase db
reset"` came back empty.

### Grants, then reset twice, then a third clean pass

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2723 replayed statements
$ git diff --stat -- supabase/seed/00-legacy-grants.sql      # (no output — committed file is current)

$ pnpm --dir …/agent-people-build supabase:reset      # pass A
RESET_A_EXIT=0   applying=555 seeding=30
   lines matching /error/i: 1, a FILENAME — "Applying migration 00458_sms_message_error_capture.sql..."
$ pnpm --dir …/agent-people-build supabase:reset      # pass B (idempotence)
RESET_B_EXIT=0   applying=555 seeding=30
$ psql … -At -c "select count(*), max(version) from supabase_migrations.schema_migrations;"
555|20260910152111
$ psql … -At -c "select string_agg(version,' ' order by version) … where version >= '00590';"
00590 00591 00592 00593 00594 00621 00622 00623 00624 00625 00626 00627 20260910152111
   # 00595–00620 untouched and reserved; W1b mints 00623–00627 (00622 pre-exists on this branch)
```

### Replay of the five files over an already-migrated database (idempotence, beyond the reset)

```
$ for m in 00623 00624 00625 00626 00627; do psql … -v ON_ERROR_STOP=1 -f supabase/migrations/${m}_*.sql; done
00623 EXIT=0 · 00624 EXIT=0 · 00625 EXIT=0 · 00626 EXIT=0 · 00627 EXIT=0
$ psql … -c "select max(updated_at) from project_parties;"
 2026-10-19 12:00:00+00        # the seeded value — r12 MAJOR-1's bracketing holds on real rows
```

### The three suites, after a final clean reset

```
$ pnpm --dir …/agent-people-build supabase:reset      # pass C
RESET_C_EXIT=0   applying=555 seeding=30   ledger 555|20260910152111

$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
EXIT=0  passed=49
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
EXIT=0  passed=23   … NOTICE: All W1b assertions passed.
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/rls/people_directory_scope_test.sql
EXIT=0  passed=12
```

### Full SQL sweep

```
TOTAL=173 RED=30        # the same 30 as r12; nine of them unlisted in KNOWN_FAILURES.md (m10)
```

### Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir … db:generate
GEN_EXIT=0
$ git diff --numstat -- packages/supabase/src/database.types.ts    # (no output — no drift)
```

### Catalog posture of the 29 routines this wave adds or redefines

All 29 carry a pinned `search_path`; every `SECURITY DEFINER` one is `SET search_path=public` (or
`public, extensions, pg_temp` for `create_field_link`). `anon` holds EXECUTE on none of them:

```
=== EXECUTE for anon on the wave's functions ===
 proname | proacl
---------+--------
(0 rows)
```

`assert_compliance_holder`, `assert_party_authority_copy_to`, `assert_project_party_cards`,
`assert_site_access_key_holder`, `link_party_to_rolodex_card`, `link_rolodex_card_to_parties` and
`rolodex_card_for_party_phone` are `postgres,service_role` only — `authenticated` cannot call any of them.

### Object posture

```
           relname           | relkind | rls | policies | auth_sel | auth_ins | anon_sel | anon_ins
-----------------------------+---------+-----+----------+----------+----------+----------+----------
 people_directory            | v       | f   |        0 | t        | t        | t        | t   ← m7
 people_directory_seats      | v       | f   |        0 | t        | t        | f        | f
 project_party_authority     | r       | t   |        4 | t        | t        | f        | f
 project_site_access_cards   | r       | t   |        4 | t        | t        | f        | f
 studio_compliance_documents | r       | t   |        4 | t        | t        | f        | f
 v_access_grants             | v       | f   |        0 | t        | t        | f        | f   ← m7
```

`project_site_access_cards`: `code_like_columns = 0` over `(code|show_to_client)` — PR-r and PR-w hold in
the shape. All four of its policies read
`is_active_studio_member(project_recorded_studio(project_id)) AND is_studio_comember(project_designer(project_id))`;
there is no client leg. `project_party_authority`'s INSERT/UPDATE/DELETE all carry
`scope <> ALL ('money','draw_certify') OR is_org_admin_or_owner(project_party_recorded_studio(engagement_id))`
— PR-n, in the policy.

### Cross-tenant sweep — clean

Caller A: `cf-phase1-alice`, owner of Phase One Synthetic Studio, sharing **no** organization with the
Okonkwo designer (`is_active_studio_member(LocalDev)=f`, `is_studio_comember(designer)=f`):

```
 studio_compliance_documents 0 · project_party_authority 0 · project_site_access_cards 0
 people_directory 0 · people_directory_seats 0 · project_parties 0 · studio_contacts 0
 studio_channel_consent 0 · v_access_grants 1 (their own studio_member row)
 access_grants_trade_rfq 0 · _trade_agreement_links 0 · _plan_transmittals 0 · _invoice_links 0
 identity_phone_numbers(<my org>, <foreign card uuid>, NULL) → 0
 identity_phone_numbers(<foreign org>, <foreign card uuid>, NULL) → 0
 compliance_state(<foreign firm card>) → not_on_file
 contact_rule_summary('person', <foreign card>) → (null)
 identity_seat_count(<foreign identity>) → 0
```

Caller B: a plain member of the designer's **second** design studio (Leah Hartwell), never a member of
Local Dev — the r5/r8/r9 shape:

```
 studio_compliance_documents 0 · project_party_authority 0 · project_site_access_cards 0
 people_directory_seats 0 · access_grants_{trade_rfq,trade_agreement,plan_transmittals,invoice_links} 0
 identity_phone_numbers(<LocalDev>, <Dana's card>, NULL) → 0
 site access INSERT refused: new row violates row-level security policy
 site access UPDATE rows=0
 create_field_link refused: not authorized to mint a field link for party …
 compliance INSERT refused
```

**No cross-tenant read or write of any object this wave adds.** What that caller *does* still read —
`project_parties` (31 rows), `designer_clients` (6), `leads` (7), `field_link_tokens` (7), `people_directory`
(11 client/lead rows) — is the base tables' own shipped `is_studio_comember(designer)` posture, recorded
as r6 MAJOR-2's owed ruling and untouched by this wave. `v_access_grants` shows that caller 7 `field_link`
rows and a direct `select count(*) from field_link_tokens` shows the same 7: the view adds no door (m3).

### Re-check of every r12 finding

| r12 | Status | Evidence |
|---|---|---|
| **M1 MAJOR** — the stage backfill stamped `updated_at = now()` | **FIXED** | `00624:788-801` brackets `set_updated_at_project_parties`; after replaying 00624 over the seeded table `max(updated_at)` is still `2026-10-19 12:00:00+00`, and Lindqvist's 7 seats sit at `warranty` with no `person_id`/`project_id`/`last_touch_at` movement. Suite block 21 |
| **M2 MAJOR** — an unstamped seat of a carded human was a second identity | **FIXED for the recorded-studio population; OPEN for the studio-less one — see MAJOR-1** | `00626:403-456` + `:462-509` + `:520-531`; probe207 shows the inline add coming back stamped and 3 seats nesting under one row. probe206 shows the same add on a `studio_id IS NULL` project still producing 62→63 |
| m1 `project_review` reports `revoked_by` as `granted_by` | **OPEN** | `00627:491` |
| m2 the 00627 banner's grant premise is false | **OPEN** | `plan_transmittal_tokens` holds 9 column-level SELECT grants to `authenticated`, `trade_rfq_tokens` 8; `00627:26-39` says all four are "closed … at the GRANT level" and `w1b-report.md:205-209`, `:580-583` asks Kody to rule on it |
| m3 `v_access_grants`' invoker branches | **OPEN, walked, harmless** | second-studio caller: 7 `field_link` rows from the view, 7 from the base table |
| m4 `evidence_upload` tier unreachable | **OPEN, not re-walkable** | `00627:465-478`; `fulfillment_evidence_upload_tokens` holds 0 rows locally, so the tier is 0 for everyone |
| m5 rule clause is the winning seat's | **OPEN** | `00626:1534` |
| m6 every firm row carries a consent word | **OPEN** | `00626:1748`; all 21 company cards carry a `phone_e164`, so all 21 print a word R-G gives the company row no column for |
| m7 no `REVOKE … FROM anon` on `people_directory` | **OPEN and one wider** | `00626:1871` grants SELECT with no REVOKE; locally `anon` holds SELECT+INSERT and `authenticated` holds INSERT on `people_directory` **and** on `v_access_grants`, from `seed/00-legacy-grants.sql`. Inert (neither UNION view is auto-updatable) and local-only |
| m8 two portal writers of the frozen columns | **OPEN** | `use-coordination.ts:719-734` + `:769`, `:889-894` + `:924` |
| m9 `blocks` and DELETE both undo the paper word | **OPEN, re-walked** | as a plain member: `before: lapsed` → `after blocks='{}': current` → `restored: lapsed` → `after DELETE: current` |
| m10 nine red, unlisted SQL suites | **OPEN, unchanged** | 30 red of 173; the nine unlisted are exactly r12's nine |
| m11 no pass over existing `studio_contact_id` stamps | **OPEN** | `00624:724-739` is still a comment |
| m12 `w1b-report.md` has drifted | **OPEN and wider** | five more below |
| m13 definer uuid→fact oracles | **OPEN** | caller A reads `project_tenant_org`, `project_recorded_studio`, `project_designer` for a foreign project |
| m14 the dev seed upserts consent records directly | **OPEN** | `seed/people_crm_dev.sql:489-544` ends `ON CONFLICT … DO UPDATE SET status = EXCLUDED.status, …`; `config.toml:88` carries the file into `[remotes.staging.db.seed]` |
| m15 half-built DB after reset | **REPRODUCED — cause found** | a concurrent `supabase db reset` from another session on the same stack; see §0 |
| m16 `p_expires_at` cannot beat a live window | **OPEN, re-walked** | asked `now() + 400 days` on a seat whose `on_site_to` is 2027-09-30; got `2027-10-01` |
| m17 Directory cost | **OPEN** | `SELECT * FROM people_directory` = **102.4 ms** at 62 rows (≈1.65 ms/row); the seats view is 3.7 ms, `v_access_grants` 12.6 ms |
| m18 no regression legs for r11 M1/M2 | **PARTIALLY CLOSED** | r12's own M1/M2 now have blocks 21 and 22; r11 M1 is still only guarded by `tests/rls/people_directory_scope_test.sql` case (h3) and r11 M2 by nothing |
| m19 the r11 M3 fix breaks a shipped act on studio-less jobs | **OPEN, re-walked** | a rolodex pick on a seat of `Aspen Loft Refresh` raises `party_card_project_has_no_studio` |

---

## 1. MAJOR-1 — the shipped inline add on a `projects.studio_id IS NULL` job still puts one human on the feed twice, and the second row prints `not_asked` on the number this studio's own record says `opted_out`

`00626:357-381` · `:346-349` · `:1582-1587` · `use-coordination.ts:500-512`

r12 MAJOR-2's fix keeps the identity link **in the record** by stamping a seat with the one person card in
`project_recorded_studio(project_id)` that carries its exact number. On a project that records no studio
`project_recorded_studio()` is NULL, so `rolodex_card_for_party_phone()` returns NULL and nothing is
stamped. The file notices the case and draws the wrong conclusion from it:

```sql
-- 00626:346-349
-- Archived cards are NOT excluded … A project that records no studio resolves no card at all,
-- so this never collides with r11 MAJOR-3's party_card_project_has_no_studio refusal.
```

It does not collide — and the duplicate identity r12 closed is wide open on that population. Locally it is
**5 of 8 projects**, and R-BD keeps it: W3 backfills `projects.studio_id` from the designer's *single*
active design-studio membership and "ambiguous ones stay NULL and are listed" — all five local ones are
ambiguous (their designer owns two design studios), and the Strata count is still owed.

### The walk — `build/probe206-w1b-final-r13-studioless-duplicate-identity.sql` (+ `.out`)

One ordinary inline add, exactly what `useAddProjectParty` writes (`studio_contact_id` omitted,
`company_name` as TEXT, `sms_consent_status` `not_asked`), on `Aspen Loft Refresh`:

```
--- 1. the record for Pete Rusk's number, at the studio doing the work ---
 b0000000-0000-0000-0000-000000000001 | +16125550112 | opted_out

--- 2. BEFORE: one row, one human ---                     directory_rows = 62
 d0e10000-…-0012 | contact | Pete Rusk | seat_count 2 | opted_out | current

--- 3. the shipped inline add, on Aspen Loft Refresh (projects.studio_id IS NULL) ---
 583019b8-… | studio_contact_id <NULL> | +16125550112

--- 4. AFTER: two rows for one human, two different consent words ---
 d0e10000-…-0012 | contact | Pete Rusk | 2 | opted_out  | current      |
 583019b8-…      | sub     | Pete Rusk | 1 | not_asked  | not_on_file  | b0000000-…-00d1
                                                          directory_rows = 63

--- 5. why: the guessed studio holds no record for that number ---
 recorded <NULL> | guessed 8805f0ab-… | word_at_guessed <NULL> | word_at_working_studio opted_out
```

Two mechanisms compose into one face:

1. the seat cannot be auto-linked, so `party_identity_key()` falls through to the E.164 and the human is a
   second identity — G-9's over-count and r12 MAJOR-2's exact measurement (62 → 63, one row claiming 2 and
   one claiming 1);
2. the party branch's consent word resolves at `project_consent_org(q0.project_id)` (`00626:1583-1586`),
   which on this population is `_primary_studio_for(designer)` — the designer's *other* studio, which holds
   no record for `+16125550112`. `channel_consent_status()` returns NULL, the caller **is** a member of the
   guessed org so r6's gate opens, and the `COALESCE(…, 'not_asked')` prints the dormant word.

So the room shows "Pete Rusk · Opted out" and "Pete Rusk · Not asked" side by side, on the same number,
with the head count saying 63 people where there are 62. `usePerson(seatId, 'sub')` resolves **only** the
duplicate row, so the party-profile sheet for that seat is the one that prints "Not asked".

This is not a send hazard — `channelConsentVerdict()` resolves the same guessed org and returns `unknown`,
so `sms.ts:753-757` refuses a non-invite as `not_consented`, and a text to `+16125550112` through the
working studio is refused as `opted_out`. It is a reader disagreeing with the record on the exact word
r5 MAJOR-1 / r6 MAJOR-1 were graded on, reached by a shipped write path.

**Fix, or a ruling.** The cheapest honest close is to let `rolodex_card_for_party_phone()` fall back to
`project_tenant_org(p_project_id)` **for the link only** when the record names no studio, and to make
`assert_project_party_cards()`' `studio_contact_id` leg accept a card in that same resolver on exactly that
population — the identity link is then as good as the record allows, and the guard still refuses a card of
any *other* studio. If Fable would rather not let a caller-relative resolver near the identity key at all
(r11 MAJOR-3's whole point), the alternative is to say in writing that the studio-less population keeps the
duplicate identity until W3's backfill, put the sentence in `00626`'s banner beside `:346-349` and in
`w1b-report.md` §8, and give the deploy brief the Strata count of
`projects where studio_id IS NULL AND EXISTS (a seat)`.

---

## 2. MAJOR-2 — the auto-link's own seat reads `paper_state = not_on_file` while the identity row above it reads `lapsed` off the same record

`00626:1960` vs `00626:1754` · `00624:473-479` · `use-coordination.ts:500-512`

`people_directory_seats.paper_state` is `identity_paper_state(pp.studio_contact_id, pp.company_id)` — the
**seat's** firm pointer. The Directory row is `identity_paper_state(sc.id, sc.company_id)` — the **card's**.
The shipped inline add writes `company_name` as free TEXT and never `company_id` (00624 added the column;
no portal writer sets it yet, and 00626 §1b writes only `studio_contact_id`). So every seat the auto-link
now claims has a card and no firm, and the two readers of one wave give the paper word two answers.

### The walk — `build/probe207-w1b-final-r13-autolinked-seat-paper-word.sql` (+ `.out`)

```
--- 1. the record: Dana Kowalski, Northgate Electric, COI lapsed 2026-03-31 ---
 Dana Kowalski | company d0e20000-…-0003 | her_own_paper not_on_file | her_firm_paper lapsed | identity lapsed
 coi_gl  | 2026-03-31 | {site_access,draw}
 w9      |            | {payment}
 license | 2027-12-31 | {}

--- 2. the shipped inline add on her own number, no rolodex pick ---
 884bef5b-… | studio_contact_id d0e10000-…-0011 | company_id <NULL> | company_name 'Northgate Electric'

--- 3. the identity row, and every seat line beneath it ---
 Dana Kowalski | seat_count 3 | row_paper lapsed
   project_name    | stamped | seat_has_company | seat_paper
 Lindqvist kitchen | t       | t                | lapsed
 Okonkwo residence | t       | f                | not_on_file   ← the new seat
 Okonkwo residence | t       | t                | lapsed
```

PR-h is "**Both, one source.** The document lives on the company card; the roster row prints a held clause
in words with a terracotta leading rule", and direction §2.2 names the roster row's held clause as a reader
of E10. The seat this wave just created reports "no paper on file" for a sub whose firm's general-liability
certificate expired on 2026-03-31 gating `site_access` and `draw` — the fixture's F-11, the one fact
`00623`'s banner says the whole table exists for. Before r12's auto-link the same add produced an unstamped
seat and both readers agreed on `not_on_file` (wrongly, but consistently); the link makes them disagree,
which is the shape r10 MAJOR-2 was graded on ("two columns of one wave disagreeing").

**Fix.** One line: `identity_paper_state(pp.studio_contact_id, COALESCE(pp.company_id, sc.company_id))`
with a `LEFT JOIN studio_contacts sc ON sc.id = pp.studio_contact_id` in `people_directory_seats` — the
seat's own firm when the seat names one (crm-model §5's "open engagements keep the old `company_id`" stays
intact), the card's otherwise. `identity_paper_state()` itself already de-duplicates when the two ids match
(`00626:851-853`).

---

## 3. MINOR findings

### New this round

**n1 — `people_directory_seats.contact_rule_summary` never falls back to the person's rule, so every seat
line in the fixture prints nothing while the identity row prints "Never text."** (`00626:1961`)

E7 is "one per person, optional per-job override; **the job override wins for that job**", and R-S says the
blocked clause prints "wherever a rule is shown (Directory row, roster row, person card, company card crew
line)". The seats view asks `contact_rule_summary('engagement', pp.id)` only:

```
 display_name     | row_rule
 Frank Bauer      | Never text. Do not use: after_hours, ap_email, dispatch, email, mobile, office. Write Rosa Delgado instead.
 Ray Thao         | Never text. Use: email, office, portal_311. Hours: Weekdays 08:00 to 16:00.
 Ingrid Halvorsen | Never text. Do not use: mobile. Use: email, office.

 display_name     | project_name       | seat_rule
 Frank Bauer      | Okonkwo residence  | (null)
 Ray Thao         | Okonkwo residence  | (null)
 Ingrid Halvorsen | Okonkwo residence  | (null)
```

Not graded MAJOR because the identity row directly above the seat carries the clause and R-G/R-M put the
word columns on the person row; graded a finding because the column exists, is empty for every seat in the
fixture, and a W2 reader that takes the seat line's own column will print no never-text clause on a roster
row. `COALESCE(contact_rule_summary('engagement', pp.id), contact_rule_summary('person',
pp.studio_contact_id))` is the whole change. Medium confidence on severity, high on the fact.

**n2 — `project_party_org()` is now dead code, and it is still granted to `authenticated`.**
(`00624:263-284`) Every policy in the wave resolves `project_party_recorded_studio()` after r8 BLOCKING-1;
`grep -rn project_party_org supabase/migrations supabase/tests` finds it nowhere outside its own definition
file. It is a twelfth definer uuid→fact oracle (m13's family) answering for nothing. Drop it, or say in the
COMMENT that it is kept for W2.

**n3 — `create_field_link`'s `field_link_window_closed` raise is unreachable.** (`00627:577-595`) The
`CASE`'s `ELSE now() + interval '90 days'` guarantees `v_expires > now()` on every branch, so the `IF
v_expires IS NULL OR v_expires <= now()` can never fire. Defensive by intent (the COMMENT calls it "the
invariant, stated where it cannot be edited around") and harmless, but it is untestable and the suite's
block 10 cannot cover it.

**n4 — the auto-link makes "unlink this seat from the rolodex" impossible; crm-model §4's split has no
door.** (`00626:452-456`) `apply_party_rolodex_link_trg` fires on `UPDATE OF … studio_contact_id`, so an
`UPDATE … SET studio_contact_id = NULL` on a seat whose number still names one card is silently re-stamped
in the same statement. The COMMENT states this as the intent ("nulling the stamp … does not reopen the
second identity"), and it is the right default; crm-model §4's "Split a person card — allowed when a phone
or email proved wrong" then has no reachable act, and PR-o/R-Y's merge sheet is P2. Worth a sentence in
the banner naming the act that is now unavailable.

**n5 — `identity_paper_state()` reads only `studio_contacts.company_id`, the single derived pointer, so a
person with two open affiliations gets the *newest* firm's word and the other firm's lapse disappears.**
(`00626:1754`, `:838-861`) `idx_studio_person_affiliations_open` is UNIQUE on `(person_id, company_id)
WHERE to_date IS NULL`, so N open affiliations to N firms are legal — R-AO says exactly that. Walked: Sam
Rowe (Beck + Rowe, `current`) gains a second open affiliation to Northgate Electric; the 00592 pointer
trigger moves `studio_contacts.company_id` to Northgate and his Directory row flips `current` → `lapsed`,
with Beck + Rowe's word now unreachable. Either direction can be the wrong one. crm-model §1 E4 is N×N and
`identity_paper_state()` already reduces worst-first over two holders; reducing over every **open**
affiliation instead of the one pointer is the same formula with a different input set.

**n6 — two migrations now `ALTER TABLE … DISABLE TRIGGER set_updated_at_project_parties`.**
(`00624:788`/`:801`, `00626:520`/`:531`) Both take ACCESS EXCLUSIVE on `project_parties` at the deploy, and
an apply that is not wrapped in one transaction — a split file, a manual retry, a `psql -f` by hand — leaves
`updated_at` silently unmaintained on prod. `supabase db push` is transactional per file and neither file
contains a statement that breaks that, so this is a note for the deploy brief, not a defect.

**n7 — `00626`'s one-time backfill calls `rolodex_card_for_party_phone()` twice per candidate row**
(`00626:522-529`, once in the `SET` and once in the `WHERE`), so the deploy pays 2N definer calls where N
is every unstamped seat carrying a number. A `FROM (SELECT id, rolodex_card_for_party_phone(...) card FROM
project_parties WHERE …) c` halves it. Local cost is nil (0 rows after the seed); the Strata count is
unknown for the same reason m11's is.

**n8 — `link_rolodex_card_to_parties_trg` does not fire on `entity_kind` or `organization_id`.**
(`00626:506-509`) A card written as `company` and later corrected to `person`, or moved between studios,
never claims the seats its number matches. R-AR's `assert_studio_contact_identity_stable_trg` refuses both
changes while any pointer exists, so the window is narrow; the trigger's column list should say so.

**n9 — a plain member of the designer's SECOND design studio can NULL `studio_contact_id` on this studio's
seats, and the auto-link is what makes that harmless.** Walked: that caller's
`UPDATE project_parties SET studio_contact_id = NULL` reported **28 rows**, and the owning studio's
Directory came back byte-identical (62 rows, Ngozi/Pete/Tom unchanged) because
`apply_party_rolodex_link_trg` re-stamped every one — every stamped seat in this fixture carries a number
that uniquely names its own card. A seat stamped by the rolodex picker whose card has a different number,
or no number, would lose its stamp for good and split its human into two Directory rows, which is r9
MAJOR-2's consequence through the write door `project_parties`' own shipped RLS (`00584`) still leaves
open. The door is pre-existing and is R-BD/r6 MAJOR-2's owed ruling; what is new is that the identity key
now hangs off it.

### Carried from r12, all re-checked and still open

**m1** `00627:491` — the `project_review` tier projects `pra.revoked_by` into `granted_by`.
**m2** `00627:26-39` — the "closed at the GRANT level" premise is false for two of the four:
`plan_transmittal_tokens` carries 9 column-level SELECT grants to `authenticated` and `trade_rfq_tokens` 8,
so their `FOR ALL TO authenticated` policies are not simply dead. (The readers are still needed — the view
selects a column each grant does not cover — but `w1b-report.md:205-209` and `:580-583` ask Kody to rule on
a fact that is not the fact.)
**m3** `00627:342-497` — the seven invoker branches inherit each base table's predicate. Walked: 7
`field_link` rows for the second-studio caller, identical to their direct read. Belongs in the COMMENT.
**m4** `00627:465-478` — the `evidence_upload` tier; 0 tokens exist locally, so it cannot be re-walked
either way.
**m5** `00626:1534` — the party branch's rule clause is the winning seat's override.
**m6** `00626:1748` — all 21 firm rows carry a `consent_status` word R-G gives the company row no column
for; all 21 company cards hold a `phone_e164`, so none is NULL.
**m7** `00626:1871` — `people_directory` is the wave's only relation with no explicit `REVOKE … FROM anon`;
locally `anon` holds SELECT+INSERT on it and `authenticated` holds INSERT on it and on `v_access_grants`,
both from `seed/00-legacy-grants.sql` and both inert (neither UNION view is auto-updatable).
**m8** `use-coordination.ts:719-734` + `:769`, `:889-894` + `:924` — two live portal UPDATE writers of the frozen consent
columns; both will raise `consent_legacy_column_frozen` the moment this chain ships. W1a §8 owes them to W2.
**m9** `00623:136`, `:542-547` — re-walked as a plain member: `blocks='{}'` and an outright `DELETE` each
flip Northgate Electric `lapsed → current`, untraceably. The ruling is still owed.
**m10** 30 red of 173; nine unlisted in `supabase/tests/KNOWN_FAILURES.md`:
`capture_enrichment/target_type_visibility_test.sql`, `field/field_capture_note_routing_test.sql`,
`field/project_task_field_capture_ref_test.sql`, `proposals/proposal_copy_immutability_test.sql`,
`rls/field_parties_test.sql`, `site_requests/00471_authority_and_action_detail_test.sql`,
`site_requests/00472_binder_exact_studio_privacy_test.sql`,
`site_requests/security_and_lifecycle_test.sql`,
`workflow/00470_site_request_awaiting_consent_handoff_contract_test.sql`. No suite went red that was green
at r12.
**m11** `00624:724-739` — the preflight that would size the existing `studio_contact_id` stamps on Strata is
a comment; nothing runs it and R-BD's W7 preflight looks only for `projects.studio_id IS NULL`.
**m12** `w1b-report.md` drift, **wider than r12 recorded**. Five more, measured this round:
- `:383` says `654  7  packages/supabase/src/database.types.ts`; the actual diff against `main` is
  `1483  10`.
- `:356` says `W1B_EXIT=0 passed=12`; the suite now passes **23** blocks.
- `:333` says `baseline + 2701 replayed statements`; `generate-legacy-grants.py` writes **2723**.
- `:435-438` quotes the site-access policies as `is_studio_comember(project_designer(project_id))`; every
  one of the four now carries `is_active_studio_member(project_recorded_studio(project_id)) AND …`.
- `:444-460` lists 16 new functions; the wave now defines or redefines **29**, including
  `identity_paper_state`, `identity_phone_numbers`, `identity_consent_status`,
  `identity_consent_evidence`, `reach_state_for_identity`, `party_kind_in_directory`,
  `rolodex_card_for_party_phone`, `link_party_to_rolodex_card`, `link_rolodex_card_to_parties`,
  `project_recorded_studio` and `project_party_recorded_studio`.
- carried: `:133` still gives `paper_state` as `compliance_state(COALESCE(company_id, id))` (it is
  `identity_paper_state`), `:67-70` still describes the backfill without its trigger brackets, and §5's
  `create_field_link` branches omit the "must land in the future" leg.
**m13** eleven-plus definer uuid→fact oracles answer any authenticated caller; caller A read
`project_tenant_org`, `project_recorded_studio` and `project_designer` for a foreign project. With n2's
`project_party_org` the count is twelve.
**m14** `seed/people_crm_dev.sql:489-544` — `ON CONFLICT (organization_id, channel_kind, channel_value) DO
UPDATE SET status = EXCLUDED.status, consented_at = …, opt_out_at = …`, bypassing `record_channel_consent()`
/ `record_channel_invite()`'s R-AG/R-AL gates, and `config.toml:88` carries the file into
`[remotes.staging.db.seed]` for a provisioned branch (`vuesoyhfrjabfxbrzekd`). **This is the only mechanism
in the wave with the BLOCKING shape** — a replay can set an `opted_out` record back to `granted` with no
newly recorded consent. It is graded MINOR only because the rows are hard-coded to the Local Dev Studio
uuid and to seven fictional `+1612555xxxx` numbers, and seeds never run on prod. Either route the seed
through the RPCs or drop the `status`/`opt_out_*` columns from the `DO UPDATE` list.
**m15** the half-built-database window **reproduced twice this round**, and the cause is now named: a
concurrent `supabase db reset` from another session against the same `:54322` stack, caught in `ps`. The
CLI reported `RESET_EXIT=0` with 555 `Applying migration` lines while the ledger afterwards read `328` —
so exit code alone does not prove a reset landed. The runbook line should be "check `pgrep -f 'supabase db
reset'` first, and poll `count(*) from supabase_migrations.schema_migrations` after".
**m16** `00627:577-585` — an explicit `p_expires_at` still cannot beat a live window (asked `now() + 400
days`, got `2027-10-01`), so PR-l's "make the studio choose" cannot be built on this RPC.
**m17** `00626:1305-1320`, `use-people.ts:125`, `config.toml:18` — `SELECT * FROM people_directory` costs
**102.4 ms at 62 rows** (≈1.65 ms/row), and r12's own measured curve (0.10 s @ 62 rows → 3.16 s @ 1262 → 8.37 s @ 3262) is superlinear, so a raw
read still crosses an 8 s `statement_timeout` near 3 200 rows; PostgREST's `max_rows = 1000` caps the shipped feed at r12's ≈2.5 s and truncates past 1 000 rows with no
pagination.
**m18** partially closed — r12's own M1 and M2 now have suite blocks 21 and 22; r11 MAJOR-1 is still
guarded only by `tests/rls/people_directory_scope_test.sql` case (h3) and r11 MAJOR-2 (the per-row
`identity_seat_count()` blow-up) by nothing that would catch a regression.
**m19** `00624:646-678` — re-walked: a rolodex pick (`UPDATE project_parties SET studio_contact_id = …`) on
a seat of a `studio_id IS NULL` project raises `party_card_project_has_no_studio`. A shipped studio act
that hard-errors on 5 of 8 local projects; the deploy brief owes the Strata count.

---

## 4. Recorded, not findings

- **The BLOCKING class, checked.** `sms.ts:717-757`: `channelConsentVerdict()` is consulted first and
  `verdict === "refuse"` returns `{sent:false, reason:"opted_out"}` **before** the `sms_optin_invite`
  carve-out, so even the double-opt-in invite cannot reach a refused number. `fc_optin_invite_dispatch`
  (the one AFTER trigger on `project_parties` that dispatches) returns early on every write this wave makes:
  its UPDATE branch exits whenever `OLD` already reads a fully-evidenced `pending`, which is always true
  for `00624`'s stage backfill, `00626`'s stamp backfill and both link triggers, none of which name a
  consent column. No write path in `00623`–`00627` reads or writes `project_parties.sms_consent_*` — R-AY
  holds.
- **R-AX's stated rule is still not enforced for the population R-AY created**, exactly as
  `w1b-final-fix-log-r12.md` recorded: `refuse_legacy_consent_write()`'s phone clause keys on
  `OLD.sms_consent_status = 'opted_out'`, the frozen column, so Pete Rusk's seat (frozen `not_asked`,
  record `opted_out`) will let its `phone_e164` move. Walked again; no send hazard follows (the gate reads
  the number that is actually on the seat, and the refusal stays attached to the old number). Fable's to
  rule, unchanged from r12.
- `party_identity_key()` merges two humans who share one number within a studio — the fixture's office
  lines (F-13, F-14, F-17, F-27) are the population. crm-model §4 rule 2 says "strong — auto-link within
  one studio", so this is settled by the model, not a finding. The fixture currently has no card/seat pair
  on one number with different names (`0 rows`), and two cards sharing a number correctly stamp nobody.
- The four `access_grants_*` readers, `identity_phone_numbers()`, `compliance_state()`,
  `identity_paper_state()`, `contact_rule_summary()` and `identity_seat_count()` all returned nothing for
  an unrelated studio owner and for the second-studio caller. The R-BG triple — `identity_seat_count()`'s
  body (`00626:641-665`), the `identity_seats` CTE (`:1305-1320`) and `people_directory_seats`' WHERE
  (`:1996-2002`) — is the same predicate written three times, and `claimed <> nested` returned **0 rows**
  for the studio owner.
- Two seats nest under no Directory row (`Granite North`/`vendor`, `Karin Lindqvist`/`client`). Both are
  the dangles `00626:1884-1902` declares by design.
- PR-n walked as a genuine plain member of the studio: `selections` INSERT allowed, `money` and
  `draw_certify` INSERT refused by RLS, re-scoping `selections → money` refused by the WITH CHECK, and both
  the money `UPDATE` and the money `DELETE` matched 0 rows.
- PR-d/PR-l walked on the seeded links: Erin Sato's Lindqvist seat ends `2026-11-22` (warranty
  `2026-11-21`, `on_site_to` `2025-10-15` — the later of the two) and her Okonkwo seat `2027-08-14`
  (`on_site_to` `2027-08-13`).
