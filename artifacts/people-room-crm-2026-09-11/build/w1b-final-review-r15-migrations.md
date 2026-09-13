# W1b — final review, round 15 (migrations)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, local DB only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **Nothing touched on Strata**: no
`supabase db push`, no `supabase functions deploy`, no `wrangler`.

Read in full first: `rulings.md` (§1–§6, R-A … R-BJ — all settled, not findings),
`synthesis/direction.md` §2.2/§3.8/§7/§8, `synthesis/crm-model.md` §1/§2/§4/§5,
`briefing/current-state.md` §B–§E, `build/inventory.md`, `briefing/fixture.md`,
`build/w1a-report.md`, `build/w1a-close-review-r6-migrations.md` and `-tests.md`,
`build/w1b-report.md`, `build/w1b-final-review-r14-migrations.md`, `build/w1b-final-fix-log-r14.md`.
Then every line of `00623`–`00627`, `00594`'s `refuse_legacy_consent_write()`,
`00593`'s `assert_studio_contact_identity_stable()`, the grep-winner `00284:37-80`,
`supabase/seed/people_crm_dev.sql`, `supabase/config.toml`, `scripts/generate-legacy-grants.py`.

**Verdict: NOT clean — two MAJOR, both new this round. Zero BLOCKING.** r14's `BLOCKING-1`,
`MAJOR-1` and `p2` are all fixed and independently re-walked. `p1`, `p3`, `n1–n9` and `m1–m19`
are re-checked and still open, by design.

---

## 0. What I ran, and what it said

### Premise checks

`apps/designer-portal/.env.local` does not exist in this worktree; the repo-root copy that the
Supabase CLI never reads is local anyway:

```
$ grep -n NEXT_PUBLIC_SUPABASE_URL /Users/kody/Code/patina-merged/apps/designer-portal/.env.local
19:NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
```

**One environment fact for the orchestrator, not a branch finding.** My first reset died mid-run:

```
RESET1_EXIT=1
{"_tag":"Error","error":{"code":"LegacyMigrationApplyError","message":"FATAL: terminating
 connection due to unexpected postmaster exit (SQLSTATE 57P01)\nAt statement: 0\n… 00423 …"}}
404 "Applying migration" lines of the expected 555
```

`ps aux` then showed **another session's `supabase db reset` running against this same worktree**
(`cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build && SUPABASE_DB_URL=… pnpm
supabase:reset | tail -150`, pid 43476, started 7:41 PM). `docker ps` showed
`supabase_db_supabase` at "Up 4 seconds" and the container log's last lines were a clean
`pg_cron scheduler shutting down` / `shutting down`, i.e. a restart, not an OOM. This is r13's
m15 recurring: the brief says this wave owns 54322 exclusively and it does not. I waited for the
other process to clear and re-ran; everything below is from the clean runs.

### Grants, then reset — twice, as the brief requires

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2724 replayed statements
$ git diff --stat -- supabase/seed/00-legacy-grants.sql
   (no diff — the committed seed reproduces byte-for-byte)

$ pnpm --dir …/agent-people-build supabase:reset          # 1st
RESET1_EXIT=0    555 "Applying migration" lines
   the ONLY /error/i line is a FILENAME: "Applying migration 00458_sms_message_error_capture.sql..."
$ psql … -At -c "select count(*) from supabase_migrations.schema_migrations;"          → 555
$ psql … -At -c "select string_agg(version,' ' order by version) … where version >= '00590';"
00590 00591 00592 00593 00594 00621 00622 00623 00624 00625 00626 00627 20260910152111
   # 00595–00620 untouched and reserved

$ pnpm --dir …/agent-people-build supabase:reset          # 2nd
RESET2_EXIT=0    555    ledger 555, identical
```

### Both suites, after the reset

```
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
W1A_EXIT=0    50 NOTICE lines (49 blocks + "All W1a assertions passed.")
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
W1B_EXIT=0    25 NOTICE lines (24 blocks + "All W1b assertions passed.")
NOTICE:  24. the reach word reduces over exactly the seats the row nests — a live field link
         minted by another studio of the same designer no longer prints field_link over a seat
         line reading on_paper …: passed
```

### Idempotence beyond the reset — all five files replayed over the populated database

```
$ for f in 00623 00624 00625 00626 00627; do psql … -v ON_ERROR_STOP=1 -f supabase/migrations/$f…; done
00623 REPLAY_EXIT=0  00624 REPLAY_EXIT=0  00625 REPLAY_EXIT=0  00626 REPLAY_EXIT=0  00627 REPLAY_EXIT=0

$ psql … -c "select pj.name, pj.status, pp.stage, count(*) …"
 Lindqvist kitchen | completed | warranty    | 7
 Okonkwo residence | active    | active      | 13
 Okonkwo residence | active    | awarded     |  9
 Okonkwo residence | active    | no_response |  1
 Okonkwo residence | active    | off_job     |  1
$ psql … -At -c "<project_parties triggers, tgenabled>"
apply_party_rolodex_link_trg|O   assert_project_party_cards_trg|O   fc_optin_invite_dispatch|O
normalize_phone_project_parties|O   refuse_legacy_consent_write_trg|O   set_updated_at_project_parties|O
$ both suites again:  W1B_AFTER_REPLAY_EXIT=0 (25)   W1A_AFTER_REPLAY_EXIT=0 (50)
```

Both bracketed backfills (00624's `stage`, 00626's rolodex stamp) move nothing on a populated
table and the `DISABLE/ENABLE TRIGGER` round-trips clean.

### The dev seed replays

```
$ psql … -v ON_ERROR_STOP=1 -f supabase/seed/people_crm_dev.sql    SEED_REPLAY1_EXIT=0
$ psql … -v ON_ERROR_STOP=1 -f supabase/seed/people_crm_dev.sql    SEED_REPLAY2_EXIT=0
cards|49  docs|36  consent|7  authority|11  site_cards|1      (unchanged across both replays)
+16125550112 | opted_out | dated t | inbound_sms | refusal_unanswered f     (the refusal survives)
```

### Generated types, type-checks, full SQL sweep

```
$ SUPABASE_DB_URL=… pnpm --dir … db:generate      GEN_EXIT=0 ; git diff --numstat → (empty)
$ (run again)                                      GEN2_EXIT=0 ; → (empty)        # no drift
$ git diff --numstat main -- packages/supabase/src/database.types.ts   → 1483  10
$ pnpm --dir … --filter @patina/supabase        type-check   → SUPABASE_TC=0
$ pnpm --dir … --filter @patina/designer-portal type-check   → DESIGNER_TC=0
$ for f in $(find supabase/tests -name "*_test.sql" | sort); do psql … -f $f; done
TOTAL=166 RED=30      # the same 30 as r12/r13/r14, none new
```

### Object posture (`build/probe300-r15-posture.sql`)

```
           relname           | relkind | rls | policies | auth_sel | anon_sel | auth_ins | anon_ins
-----------------------------+---------+-----+----------+----------+----------+----------+----------
 people_directory            | v       | f   |        0 | t        | t        | t        | t   ← m7
 people_directory_seats      | v       | f   |        0 | t        | f        | t        | f
 project_party_authority     | r       | t   |        4 | t        | f        | t        | f
 project_site_access_cards   | r       | t   |        4 | t        | f        | t        | f
 studio_compliance_documents | r       | t   |        4 | t        | f        | t        | f
 v_access_grants             | v       | f   |        0 | t        | f        | t        | f

PR-r   code_like_columns = 0   (gate_code | ^code$ | access_code | lockbox_code | combination | pin | show_to_client)
PR-w   four policies, TO authenticated only, every one
       is_active_studio_member(project_recorded_studio(project_id))
       AND is_studio_comember(project_designer(project_id))   — no client leg
PR-n   insert/update/delete on project_party_authority all carry is_org_admin_or_owner(
       project_party_recorded_studio(engagement_id)); the SELECT policy correctly does not
people_directory columns:  1 person_id … 12 scope (carried, name for name and position for
       position against PeopleDirectoryRow) + 13 reach_state 14 consent_status 15 paper_state
       16 contact_rule_summary 17 seat_count — appended, so select('*') widens
freeze trigger UPDATE OF:  phone, phone_e164 + the eight sms_consent_* — none of 00624's ten new columns
```

30 routine rows for the 28 names this wave defines or redefines; **every SECURITY DEFINER one
pins `search_path`** (the file's own list; section F's 23 rows are all pre-existing platform
functions, none of them this wave's), and `assert_*`, `refuse_legacy_consent_write`,
`link_*_rolodex_*` and `rolodex_card_for_party_phone` are `auth_exec = f` as well as
`anon_exec = f`.

### The severity-class sweeps, all clean

As `designer@patina.dev` on the seeded fixture (`build/probe301-r15-readers-vs-record.sql`):

```
role: client 7 · contact 49 · lead 5 · sub 1          contact branch: person 28 · company 21
contact rows whose word <> identity_consent_status() recomputed   → 0
identity paper word vs its own seat lines, disagreements          → 0
identity consent word vs its own seat lines, disagreements        → 0 rows
rows claiming a seat_count they cannot nest                       → 0
rows reading granted/not_asked/pending while ANY of their numbers is refused → 0 rows
```

`compliance_state()`'s 30-day window, walked on a probe holder in a rolled-back transaction
(`build/probe302-r15-compliance-window.sql`):

```
expires yesterday   -> lapsed        expires today+30 -> lapses_soon
expires today       -> lapses_soon   expires today+31 -> current
lapsed but GATELESS -> current       no paper at all  -> not_on_file
A -> B -> C, all four writes honest, the day B's own certificate expires  -> current   (R-BF holds)
```

Tenant sweep (`build/probe305-r15-tenant-sweep.sql`):

```
as cf-phase1-alice (owner of an unrelated studio):
  compliance_docs 0 | authority 0 | site_cards 0 | directory_seats 0 | directory 0
  access_grants 1 (studio_member: her own membership) | all four definer readers 0
  identity_phone_numbers(<own org>, <a FOREIGN card uuid>, NULL)  → 0
  compliance_state(<Northgate Electric, another studio's card>)   → not_on_file
  identity_consent_status(<their org>, <their card>, <their no.>) → (null)
as client@patina.dev (PR-w):  site_cards 0 | authority 0 | compliance_docs 0 | directory_seats 0
as anon:  permission denied for table project_site_access_cards / for view people_directory_seats /
          for view v_access_grants / for table studio_contacts / for table studio_compliance_documents
```

PR-n, walked as three roles on one seat:

```
member selections:                LANDED
member money:                     REFUSED  new row violates row-level security policy
member draw_certify:              REFUSED  new row violates row-level security policy
member rescope selections->money: REFUSED  new row violates row-level security policy
admin money:                      LANDED
admin draw_certify:               LANDED
member raises the admin's money threshold: rows=0
member deletes the admin's money grant:    rows=0
member READS the money grant:              scope money, threshold_cents 250000   (intended)
```

`create_field_link`'s graft: `grep -rln "CREATE OR REPLACE FUNCTION[^(]*create_field_link"
supabase/migrations/*.sql | sort | tail -1` → `00627`; the previous head is `00284:37`, and
`00284:43-79` is reproduced in `00627:534-610` line for line — the same `no_data_found` raise, the
same `auth.uid() IS NOT NULL AND NOT EXISTS(… p.designer_id = auth.uid())` guard with the NULL-uid
internal bypass, the same supersede, the same `extensions.gen_random_bytes`/`extensions.digest`.
Only `expires_at` is added to the INSERT, the expiry CASE and its pre-supersede raise are inserted
above it, and the one-argument signature survives as a delegate (`00627:636-645`).

`v_access_grants`: eleven tiers, twelve columns, four through definer readers whose `RETURNS TABLE`
restates the same twelve types positionally; the view builds and reads with no cast error and
`0` grant_ids match `[0-9a-f]{64}`. Locally only three tiers carry rows (`studio_member`,
`client_account`, `field_link`), which is m4's unexercised-tier note, unchanged.

---

## 1. MAJOR-1 (NEW) — a rolodex card can be moved to another studio **while seats still point at it**, because `project_parties.studio_contact_id` is not one of `assert_studio_contact_identity_stable()`'s holders

`supabase/migrations/00593_studio_contact_channels.sql:502-585`, trigger at `:607-612`.

R-AR's guard refuses an `entity_kind` / `organization_id` change while **five** things hold the
card: reach channels (`:517-522`), designations on other cards (`:524-531`), contact-rule routes
(`:533-538`), contact-rule subjects (`:556-562`) and affiliations (`:564-569`). **A seat stamped
with the card is not on that list** — and `00626` is the file that made
`project_parties.studio_contact_id` the v4 identity key (`00626:288-294` `party_identity_key()`'s
first COALESCE leg; `00626:1700` the party branch excluding every stamped seat; `00626:1997-2011`
`people_directory_seats.person_id` COALESCEing to the stamp).

`assert_project_party_cards()` (`00624:646-678`, r9 MAJOR-2 / r11 MAJOR-3) polices this from the
**seat** side only: it fires `BEFORE INSERT OR UPDATE OF company_id, warranty_contact_person_id,
studio_contact_id, project_id` **on `project_parties`**. Nothing fires when the **card** moves out
from under the stamp. `studio_contacts_member_update` is
`is_active_studio_member(organization_id)` in USING and WITH CHECK, so any plain member of two
studios — the designer who owns two, which is the shipped local shape and the population every one
of r5/r6/r8/r11/r14's findings turns on — can do it with one `PATCH /rest/v1/studio_contacts`.

### The walk — `build/probe307-r15-card-repoint.sql` (inline, rolled back)

Ordinary shipped writes only: a member files a person card in Local Dev Studio, inline-adds a seat
on that number (`§1b`'s auto-link stamps it), and the studio records the refusal.

```
-- the auto-link did its job --
 bbbb2222-…-0001 | studio_contact_id bbbb1111-…-0001 | +16125556622

-- BEFORE: the Local Dev Studio room --
  display_name   |  role   | consent_status | reach_state | seat_count
 P307 Fresh Card | contact | opted_out      | on_paper    |          1
  display_name   |   project_name   | consent_status
 P307 Fresh Card | Cedar Lane Study | opted_out

-- one PATCH: UPDATE studio_contacts SET organization_id = <the designer's OTHER studio> --
NOTICE:  CARD MOVED TO THE SECOND STUDIO — no guard fired

-- AFTER, as the working studio's ADMIN (studio_manager@patina.dev, Local Dev) --
 localdev admin: directory rows for the card      | 0
 localdev admin: seat rows still nesting under it | 1
 localdev admin: can it read the card at all      | 0
 localdev admin: seat consent word                | opted_out

-- AFTER, as designer@patina.dev, a member of BOTH studios --
     line                |  display_name   |   word    | seats
 identity row            | P307 Fresh Card | not_asked | 1
 seat line beneath it    | P307 Fresh Card | opted_out | Cedar Lane Study

-- and the record --
 b0000000-…-0001 | +16125556622 | opted_out

-- what the guard counts as a holder --
 seats stamped with this card | 1        ← and it counted none of them
```

Two consequences, both of them shapes this programme has already graded:

1. **The working studio loses the human's Directory row while its own seat still nests under that
   `person_id`.** That is r9 MAJOR-2's consequence verbatim — "a seat nesting under a person_id it
   can open no Directory row for" — reached through the card side, which the r9/r11 guard does not
   cover. `usePerson` / the party-profile sheet resolve nothing for that seat.
2. **The row that survives prints `not_asked` over the studio's own recorded `opted_out`, with its
   own seat line directly beneath it reading `opted_out`.** `identity_consent_status()` is called
   at `sc.organization_id` (`00626:1837`), which is now the *other* studio, and
   `identity_phone_numbers()`' seat leg requires `pj.studio_id = p_organization_id`
   (`00626:1095`), so the seat's number drops out of a **worst-first** reduction — the exact
   fail-open direction r4 MAJOR-3 and r7 MAJOR-1 were graded on. The seat line is resolved at
   `project_consent_org(project_id)` and still says `opted_out`. Two columns of one wave
   disagreeing on one screen with the record on the seat line's side is r10 MAJOR-2's and r13
   MAJOR-2's grading shape.

**Not BLOCKING.** No text can reach the number: the send gate asks
`channelConsentVerdict()` at `resolveProjectOrg()`, which for this seat is still Local Dev Studio,
and `_shared/sms.ts:730-732` returns `{sent:false, reason:"opted_out"}` before the invite
carve-out; the record is neither lost nor overwritten; and the composer would read `not_asked`,
not `granted`. It is a reachable write path that leaves a shipped-and-W2-planned reader and the
record disagreeing, which is the MAJOR class as written.

**The close, and it is one more `SELECT count(*)` in a function that already makes five of them.**
Add a sixth holder to `assert_studio_contact_identity_stable()` (`00593:564-569` is the pattern):

```sql
  SELECT count(*) INTO v_n
    FROM public.project_parties pp
   WHERE pp.studio_contact_id = OLD.id;
  IF v_n > 0 THEN
    v_holders := v_holders || (v_n || ' seat(s) stamped with this card');
  END IF;
```

It is the same argument the file's own §540-555 makes for the rule-SUBJECT holder — "one
member-reachable `UPDATE studio_contacts` undid the guard on the referencing row" — and the
referencing-row guard here is `assert_project_party_cards()`. It cannot regress anything in the
fixture: locally every stamped seat's card is in its own project's studio, so the guard fires only
on the move this finding walks. 00593 is unapplied on Strata (00594's §3 banner states the whole
00590–00594 block has only ever run locally), so it is an edit in place like r11–r14's.

Confidence: **high** on the fact (walked, with the record and both readers printed side by side, and
the guard's own holder count printed beside them), **high** on the grade.

---

## 2. MAJOR-2 (NEW) — `reach_state_for()` carries no tenant predicate, so r14 MAJOR-1's word survives on the branch that now carries every carded human

`00626:624-648`, call site `00626:1834` (the CONTACTS branch).

r14 MAJOR-1 gave `reach_state_for_identity()` the seats view's WHERE verbatim (`00626:857-867`) so
the reach word reduces over exactly the seats the row nests. **Its sibling did not get the same
treatment.** `reach_state_for(p_profile_id, p_card_id, p_party_id)`'s EXISTS is still a plain
`field_link_tokens JOIN project_parties` whose only predicate is
`pp.studio_contact_id = p_card_id` (`:643`) — no `projects` join, no
`is_active_studio_member(project_tenant_org(...))`, no designer-of-record leg, no co-member legs.
And the contacts branch is where **every carded human in the room now lives** (49 of the seeded
studio's 62 rows), against the party branch's 1.

The file's own argument for why that is safe is the R-AP card guard: a stamp can only name a card
in `project_recorded_studio(project_id)` (`00624:655-677`). That guard covers **writes from this
wave onward**. It does not cover rows already on the table — and `00624:724-739` says so in as many
words, with the preflight `SELECT` that would size them, which `m11` has recorded open for three
rounds as "a comment nothing runs":

```sql
SELECT count(*) FROM project_parties pp
  JOIN projects pj       ON pj.id = pp.project_id
  JOIN studio_contacts sc ON sc.id = pp.studio_contact_id
 WHERE pp.studio_contact_id IS NOT NULL
   AND (pj.studio_id IS NULL OR sc.organization_id <> pj.studio_id);
```

Locally 0. On Strata, unmeasured.

### The walk — `build/probe306-r15-reach-contacts-branch.sql` (inline, rolled back)

One seat on a **Leah Hartwell** project stamped with a **Local Dev Studio** card (the pre-00624
shape; I had to `DISABLE TRIGGER assert_project_party_cards_trg` to write it, which is exactly the
point — no live write path can produce it, and a legacy row can carry it), one live field link on
that seat, read as `studio_manager@patina.dev`: **admin of Local Dev, not a member of Leah**.

```
 member_of_leah | member_of_localdev
 f              | t

 seats nested under the card | 0
 foreign seat readable raw   | 1
 foreign link readable raw   | 1
 reach_state_for(card)       | field_link

   display_name    |  role   | reach_state | seat_count
 P306 Shared Human | contact | field_link  |          0
```

`field_link` over `seat_count 0` and no seat line at all. Direction §3.8 / PD-12 define
`field_link` as a live door **this studio** minted; R-AB puts "Copy field link" on that row; R-F's
Call Sheet vitals count "N on paper". The room offers a door it cannot open and suppresses the mint
the studio needs — r14 MAJOR-1's sentence, on the branch r14 did not touch.

**Not BLOCKING** (no consent, and no read door moves: the caller already reads both base rows
directly, which is r6 MAJOR-2's recorded posture). Graded MAJOR rather than MINOR because the
consequence is identical to the one r14 graded MAJOR and because the population's size is an
**owed Strata number, not a measured zero** — a finding whose severity is currently unknowable by
construction should not be filed as cosmetic.

**The close**, and it is the predicate the file already writes four times: give `reach_state_for()`
the `projects` join and the same tenant/designer/co-member legs when `p_card_id` is supplied, or
— cheaper and narrower — have the contacts branch call `reach_state_for_identity(sc.profile_id,
sc.id::text)`, which already carries them and whose first COALESCE leg for a stamped seat is
exactly `sc.id::text`. The second option deletes the asymmetry rather than duplicating a fifth copy
of R-BG's predicate. Either way, run the preflight above on Strata before the chain, beside R-BD's
and R-BI's counts — this is the third finding in three rounds that turns on it.

Confidence: **high** on the fact (walked, with the mutation control on the same rows: the seats
view correctly nests nothing), **medium-high** on the grade, which rests on a Strata count nobody
has taken.

---

## 3. Re-check of every r14 finding

| r14 | status | evidence |
|---|---|---|
| **BLOCKING-1** — the `opted_out` phone freeze asked a column R-AY froze at `not_asked` | **FIXED**, independently re-walked | `00594:943-947` now reads `channel_consent_status(project_consent_org(OLD.project_id),'sms',OLD.phone_e164) = 'opted_out' OR OLD.sms_consent_status = 'opted_out'`; the body is `SECURITY DEFINER` with `search_path=public` (`:865-866`), `REVOKE … FROM PUBLIC, anon, authenticated` + `GRANT … TO service_role` (`:959-964`), `auth_exec = f` on the live catalogue. My own walk on a seat of a project that RECORDS Local Dev Studio: `CONTROL REFUSED: consent_opted_out_phone_frozen`. W1a block 46 present and green. Residue on the studio-less population: see `p5` below. |
| **MAJOR-1** — `reach_state_for_identity()` had no tenant predicate | **FIXED**, independently re-walked | `00626:857-863` carries the `identity_seats` WHERE verbatim (I diffed all five statements of R-BG's predicate: `:708`, `:857`, `:1401`, `:1732`, `:2114` — identical). Re-walked the finding's own shape from scratch: two unstamped seats on `+16125558844`, one in each of the designer's two studios, a live link on studio B's seat only, read as an admin of A and no member of B — `b_seat readable raw 1`, `b_link readable raw 1`, **`reach_state_for_identity = on_paper`**, the Directory row `on_paper / seat_count 1`, the one nested seat line `on_paper`. The two columns agree and no read door moved. |
| **p2** — three COMMENTs calling `field_link_tokens` "designer-only RLS (00283)" | **FIXED** | `00626:95-105`, `:657-665`, `:891-895` now name `field_link_tokens_studio_rw (00584:982-992)`, say it is `is_studio_comember(the project's designer_id)`, and describe the real degrade. |
| **p1** — `PeopleDirectoryRow` not widened | **open** | `packages/supabase/src/hooks/use-people.ts:56-89` still stops at `scope`; `git diff --stat main -- packages/supabase/src/hooks/use-people.ts` is empty. `database.types.ts` carries all five. |
| **p3** — `party_identity_key()` / `party_kind_in_directory()` pin no `search_path` | **open** | live catalogue: both `cfg = (none)`; both IMMUTABLE, INVOKER, table-free. |
| **n1** seats view's rule clause never falls back to the person rule | **open** | `00626:2075` is still `contact_rule_summary('engagement', pp.id)` alone |
| **n2** `project_party_org()` dead and still granted to `authenticated` | **open** | `auth_exec = t`; no caller outside its own definition file and `database.types.ts` |
| **n3** `field_link_window_closed` unreachable | **open** | `00627:577-585`'s `ELSE now() + interval '90 days'` makes every branch future, so `:589` cannot fire |
| **n4** the auto-link makes "unlink this seat" impossible | **open** | `apply_party_rolodex_link_trg` still fires on `UPDATE OF … studio_contact_id` (`00626:501`) |
| **n5** `identity_paper_state()` reads only the derived `studio_contacts.company_id` | **open** | `00626:1843`, `:2072-2074`; R-AO's N×N affiliations are not consulted |
| **n6** two migrations `DISABLE TRIGGER set_updated_at_project_parties` | **open** | `00624:806`/`:819`, `00626:567`/`:578`; re-verified this round that a `psql -f` replay re-enables cleanly (all six triggers `tgenabled = O` after the replay) — the deploy-brief note stands for the failure path |
| **n7** the 00626 backfill calls `rolodex_card_for_party_phone()` twice per row | **open** | `00626:571` and `:575` |
| **n8** `link_rolodex_card_to_parties_trg` does not fire on `entity_kind`/`organization_id` | **open** | `00626:554`. **MAJOR-1 above is the other half of this observation, and it is not cosmetic.** |
| **n9** a second-studio member can NULL `studio_contact_id` | **open** | pre-existing `00584` write door |
| **m1** `project_review` projects `pra.revoked_by` into `granted_by` | **open** | `00627:491` |
| **m2** the "closed at the GRANT level" premise is false for two of four | **open** | table-level `has_table_privilege` is `f` for all four, but `plan_transmittal_tokens` / `trade_rfq_tokens` carry column-level SELECT grants; `w1b-report.md:205-209` and `:611-613` still ask Kody to rule on a fact that is not the fact |
| **m3** the seven invoker branches inherit each base table's predicate | **open** | re-measured: the unrelated studio owner reads `studio_member 1` and nothing else |
| **m4** the `evidence_upload` tier is unexercised | **open** | locally only three of eleven tiers carry rows |
| **m5** the party branch's rule clause is the winning seat's override | **open** | `00626:1623` |
| **m6** all 21 firm rows carry a `consent_status` word R-G gives the company row no column for | **open** | contact branch: person 28 / company 21 |
| **m7** `people_directory` is the only wave relation with no explicit `REVOKE … FROM anon` | **open, and inert** | probe A `anon_sel = t`, `anon_ins = t`; probe C: anon gets `permission denied for table studio_contacts` and a UNION view is not insertable |
| **m8** two live portal UPDATE writers of the frozen consent columns | **open** | `packages/supabase/src/hooks/use-coordination.ts:755-775` and `:929-932` still assemble `NOT_ASKED_CONSENT_COLUMNS` / `sms_opt_out_at` into an UPDATE patch; both raise `consent_legacy_column_frozen` at deploy. W1a §8 owes it |
| **m9** `blocks='{}'` and an outright `DELETE` each flip a lapse to `current`, untraceably | **open** | `00623:136` and the member DELETE policy `:542-547`. Fable's ruling still owed |
| **m10** 30 red of 166 | **open, unchanged** | `TOTAL=166 RED=30`, the same list |
| **m11** the `studio_contact_id` preflight is a comment nothing runs | **open — and MAJOR-2 above now depends on it** | `00624:724-739` |
| **m12** `w1b-report.md` drift | **open and unchanged from r14** | re-measured: `:333` says 2701, actual **2724**; `:356` says `passed=12`, actual **24 blocks**; `:383` says `654 7`, actual **no diff** vs the working tree and **1483 10** vs `main`; `:131` still gives `paper_state` as `compliance_state(COALESCE(company_id, id))`; `:444-460` lists 16 functions where the wave defines or redefines **28 names / 30 routines** |
| **m13** eleven-plus definer uuid→fact oracles | **open** | `project_tenant_org`, `project_recorded_studio`, `project_party_recorded_studio`, `project_designer`, `project_party_org` all `auth_exec = t` |
| **m14** the dev seed's `ON CONFLICT … DO UPDATE` on `studio_channel_consent` | **open, unchanged, and still the one mechanism in the wave with the BLOCKING shape** | `supabase/seed/people_crm_dev.sql`'s tail: `DO UPDATE SET status, consented_at, source, evidence, opt_out_at, opt_out_source, opt_out_evidence, refusal_unanswered, origin_project_id = EXCLUDED.*`, outside `record_channel_consent()`; and `supabase/config.toml:88` still carries the file into `[remotes.staging.db.seed].sql_paths` for the provisioned branch `vuesoyhfrjabfxbrzekd`. A replay sets an `opted_out` record back to `granted` and nulls its opt-out evidence with **no newly recorded consent**. **Graded MINOR again, on r13's and r14's grounds and not on a new argument:** every row is hard-coded to `b0000000-…-0001` and to seven numbers inside the reserved fictional `+1612555-01xx` range, and seeds never run on Strata main, so no real recipient's refusal can be lost. Drop `status` / `opt_out_*` / `refusal_unanswered` from the `DO UPDATE` list, or route the seven rows through the RPCs |
| **m15** the half-built-database window | **RECURRED** | see §0: another session's `supabase db reset` on this same worktree killed my first reset mid-run at migration 00423 (`RESET1_EXIT=1`, 404 of 555). The brief's "this wave is its sole owner" is not being observed |
| **m16** an explicit `p_expires_at` cannot beat a live window | **open** | `00627:577-585`'s CASE order; PR-l's "make the studio choose" cannot be built on this RPC |
| **m17** `SELECT * FROM people_directory` cost | **open** | unchanged shape; the r14 fix log's own measurement is 79.8 ms at 62 rows |
| **m18** r11 MAJOR-1 guarded only by `people_directory_scope_test.sql`; r11 MAJOR-2 by nothing | **open** | no new block covers either |
| **m19** a rolodex pick on a `studio_id IS NULL` project hard-errors | **open** | `00624:655-663`; the Strata count is owed |

---

## 4. MINOR findings, new this round

**p4 — `studio_contacts.phone_e164` can be moved off a refused number by an ordinary member, and
v4 makes that the identity's whole number set when the card holds no seat on it.**
(`00626:1837` calls `identity_consent_status(sc.organization_id, sc.id::text, sc.phone_e164)`;
`identity_phone_numbers()` `00626:1073-1121` unions the card's number with its seats'.) Walked
(`build/probe303-r15-card-phone-move.sql`):

```
-- a card-only identity (seat_count 0) on the fixture's refused number --
  display_name  |     phone      | consent_status | seat_count
 P303 Card Only | (612) 555-0112 | opted_out      |          0
-- UPDATE studio_contacts SET phone_e164 = '+16125557777'  → UPDATE 1
 P303 Card Only | (612) 555-7777 | not_asked      |          0
-- the record --
 +16125550112 | opted_out          (intact)
```

This is r14 BLOCKING-1's mechanism one table over — `00594`'s freeze covers
`project_parties.phone/phone_e164` and nothing covers the card. **Graded MINOR, deliberately**, and
the reasoning matters: the record is neither lost nor overwritten; the number now on the card
genuinely never refused, so no reader disagrees with the record about a number; the send rail is
number-keyed (`channelConsentVerdict()` per `recipient.phone`), so nothing can reach
`+16125550112`; and a card that DOES hold a seat on the refused number keeps `opted_out`, because
the seat contributes its number to the worst-first reduction (verified: Pete Rusk's two seats both
carry `+16125550112`). What is lost is the studio's own sight of the fact that **this person**
refused, with nothing on any surface saying it happened. If Fable reads r14's grading of the
identical mechanism on `project_parties` as binding precedent, this is the same finding and would
be BLOCKING; I am grading by consequence, as the brief directs, and the consequence here stops at
the face.

**p5 — the r14 phone freeze does not fire on the `projects.studio_id IS NULL` population, because
both of its legs are blind there.** Walked (`build/probe304-r15-studioless-freeze.sql`):

```
-- an UNCARDED seat on Aspen Loft Refresh (studio_id NULL; project_consent_org guesses
-- 29a5162a… Leah Hartwell), on a number Local Dev Studio has recorded opted_out --
 phone_e164 +16125550112 | legacy_column not_asked
 working_studio_record   opted_out
 guessed_studio_record   (null)

-- an ordinary member moves the number (phone only) --
NOTICE:  PHONE MOVE SUCCEEDED — the freeze did not fire
 number_now  +16125559999

-- control: the same seat on a project that RECORDS Local Dev Studio --
NOTICE:  CONTROL REFUSED: consent_opted_out_phone_frozen
```

The record leg asks `channel_consent_status(project_consent_org(OLD.project_id), …)`, which on this
population names the guessed studio (no record → NULL); the column leg asks
`OLD.sms_consent_status`, which R-AY defaults to `not_asked` on every seat a live write path
produces. **MINOR**, and the grounds are measured, not assumed: no reader regresses (this branch's
`consent_word` is already NULL/`not_asked` for the working studio before AND after the move,
because `00626:1671-1676` gates the COALESCE on membership of the deciding record's org), and no
send is reachable (`_shared/sms.ts:752-758` refuses every non-invite on a verdict that is not
`allow`, and the invite branch `:759-776` additionally requires the four frozen evidence columns
that R-AY leaves NULL). R-BD's W3 backfill closes it by writing `projects.studio_id`, after which
`project_consent_org()` names the working studio and the freeze fires — which is the argument for
recording it here rather than patching it, but it should be written into the deploy brief beside
R-BI, because *if the backfill slips and the freeze is not repaired, this population keeps a
losable refusal.*

---

## 5. Recorded, not findings

- **The BLOCKING class, checked end to end.** No file in `00623`–`00627` reads or writes any
  `project_parties.sms_consent_*` column (grep over the five files returns only prose) and none
  writes `studio_channel_consent`. The consent word has exactly one source
  (`channel_consent_status()`); the freeze's `UPDATE OF` list is intact (block 11, and the
  catalogue read above); the send gate is unchanged. Every consent divergence sweep this round
  returned 0 rows, and no cross-tenant read or write was reachable from any of the four callers I
  walked (an unrelated studio owner, a client account, anon, and a plain member).
- **Grants, both directions.** Every new table carries `REVOKE ALL … FROM PUBLIC, anon,
  authenticated` followed by an explicit `GRANT`; every new function carries `REVOKE ALL … FROM
  PUBLIC, anon` and, where it is a trigger body or trigger-only helper, from `authenticated` too.
  `generate-legacy-grants.py` reproduces the committed seed byte-for-byte at 2724 statements.
- **The `project_parties` trigger order the auto-link depends on** is real and survived the replay:
  `apply_party_rolodex_link_trg` < `assert_project_party_cards_trg` < `fc_optin_invite_dispatch` <
  `normalize_phone_project_parties` < `refuse_legacy_consent_write_trg` <
  `set_updated_at_project_parties`.
- **`projects.studio_id` is effectively immutable from PostgREST**, which closes one shape I went
  looking for: `set_project_studio_id()`'s first qualification block raises
  `studio_id_not_designer_studio` for any `TG_OP <> 'INSERT'` when `current_user = 'authenticated'`,
  so a member cannot move a project between two studios and strand its seats' stamps. MAJOR-1's
  door is the card, not the project.
- **Two seats nest under no Directory row** (`Granite North`/`vendor`, `Karin Lindqvist`/`client`);
  both are the dangles `00626:1974-1991` declares by design.
- **The behavioural change the deploy owns is unchanged and correctly stated**
  (`00626:107-121`): `directory-view.tsx:294` filters `p.role !== 'contact'` and
  `people-room.tsx:383` counts `all.length`, so the room reads oddly until W2 lands — one chain,
  rulings §6.

---

## 6. Summary

| # | severity | confidence | where |
|---|---|---|---|
| MAJOR-1 | MAJOR | high on fact, high on grade | `supabase/migrations/00593_studio_contact_channels.sql:502-585` (holder list), trigger `:607-612`; the uncovered column is `project_parties.studio_contact_id` (`00626:288-294`, `:1700`, `:1997-2011`) |
| MAJOR-2 | MAJOR | high on fact, medium-high on grade | `supabase/migrations/00626_people_directory_v4_seats.sql:624-648`, call site `:1834`; the unmeasured population is `00624:724-739`'s preflight |
| p4 | MINOR | high on fact, deliberate on grade | `00626:1837`, `:1073-1121`; no guard on `studio_contacts.phone_e164` |
| p5 | MINOR | high | `00594:943-947`; `00626:1671-1676`; `_shared/sms.ts:730-732, :752-776` |
| p1, p3, n1–n9, m1–m19 | MINOR | carried from r13/r14, all re-checked | §3 |

**Not clean: two MAJOR. Zero BLOCKING.** Reset twice (both `EXIT=0`, 555 migrations, the only
`/error/i` line a filename), both suites green before and after, all five files replay clean over a
populated database, the dev seed replays twice with stable counts, generated types show no drift
across two runs, and both type-checks pass.
