# W1b — final review, round 14 (migrations)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, local DB only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). Nothing touched on Strata: no
`supabase db push`, no `supabase functions deploy`, no `wrangler`.

Read in full first: `rulings.md` (all of §1–§6, R-A … R-BJ), `synthesis/direction.md` §2.2/§3.8/§7/§8,
`synthesis/crm-model.md` §1/§2/§4/§5, `briefing/current-state.md` §B–§E, `build/inventory.md`,
`briefing/fixture.md`, `build/w1a-report.md`, `build/w1a-close-review-r6-migrations.md` and
`-tests.md`, `build/w1b-report.md`, `build/w1b-final-review-r13-migrations.md`,
`build/w1b-final-fix-log-r13.md`. Then every line of
`00623_studio_compliance_documents.sql`, `00624_project_party_window_and_authority.sql`,
`00625_project_site_access_cards.sql`, `00626_people_directory_v4_seats.sql`,
`00627_access_grants_and_field_link_window.sql`, `supabase/seed/people_crm_dev.sql`,
`supabase/config.toml`, `scripts/generate-legacy-grants.py`, and the grep-winner
`00284_field_dispatch_wiring.sql:37`.

**Verdict: NOT clean — one MAJOR, new this round.** Zero BLOCKING. Both r13 MAJORs are fixed and
re-walked. Every one of r13's 28 MINORs is re-checked below and still open, by design.

---

## 0. What I ran, and what it said

### Premise checks first

`apps/designer-portal/.env.local` **does not exist in this worktree** (only `.env.example`), so no
worktree env can point a destructive local action at Strata. The repo root copy that `supabase`
never reads is local anyway:

```
$ grep -n NEXT_PUBLIC_SUPABASE_URL /Users/kody/Code/patina-merged/apps/designer-portal/.env.local
19:NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
```

r13's m15 (a concurrent `supabase db reset` from another session producing a half-built database
with `RESET_EXIT=0`) did **not** recur. `ps aux | grep supabase` was empty before each reset and the
ledger was polled after each one.

### Grants, then reset — three times, three suites each

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2723 replayed statements
$ git diff --stat -- supabase/seed/00-legacy-grants.sql
   (no diff — the committed seed already reproduces byte-for-byte)

$ pnpm --dir …/agent-people-build supabase:reset      # 1st
RESET1_EXIT=0   555 "Applying migration"   the only /error/i line is the FILENAME
                                           "Applying migration 00458_sms_message_error_capture.sql..."
$ psql … -At -c "select count(*), max(version) from supabase_migrations.schema_migrations;"
555|20260910152111
$ psql … -At -c "select string_agg(version,' ' order by version) … where version >= '00590';"
00590 00591 00592 00593 00594 00621 00622 00623 00624 00625 00626 00627 20260910152111
   # 00595–00620 untouched and reserved, as the brief requires

$ pnpm … supabase:reset      # 2nd     RESET2_EXIT=0   555   ledger 555|20260910152111
$ pnpm … supabase:reset      # 3rd     RESET3_EXIT=0   555   ledger 555
```

Suites, after the 1st and again after the 2nd reset (identical both times):

```
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
W1B_EXIT=0   24 NOTICE lines = 23 blocks + "All W1b assertions passed."
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
W1A_EXIT=0   49 NOTICE lines
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/rls/people_directory_scope_test.sql
RLS_EXIT=0   12 NOTICE lines
```

Block 23 (r13's two findings) reads back:

```
NOTICE:  23. the auto-linked seat prints the identity's paper word — lapsed under a row reading
         lapsed, where it read not_on_file (r13 MAJOR-2) — a seat naming its own firm still keeps
         that firm's word, and the studio-less population's second identity is the RULED residue of
         r13 MAJOR-1: two rows until R-BD's W3 backfill, and never the affirmative consent word: passed
```

### Idempotence beyond the reset — replay of all five files over an already-migrated database

```
$ for f in 00623… 00624… 00625… 00626… 00627…; do psql … -v ON_ERROR_STOP=1 -f $f; done
00623 REPLAY_EXIT=0   00624 REPLAY_EXIT=0   00625 REPLAY_EXIT=0
00626 REPLAY_EXIT=0   00627 REPLAY_EXIT=0
$ psql … -c "select pj.name, pj.status, pp.stage, count(*) …"
 Lindqvist kitchen | completed | warranty    | 7
 Okonkwo residence | active    | active      | 13
 Okonkwo residence | active    | awarded     | 9
 Okonkwo residence | active    | no_response | 1
 Okonkwo residence | active    | off_job     | 1
$ psql … -f supabase/tests/people/w1b_…_test.sql        W1B_AFTER_REPLAY_EXIT=0   24 NOTICEs
```

The replay re-runs both backfills against a *populated* table (`stage`'s and the rolodex stamp's)
and moves nothing: `stage = 'active'` guards the first, `studio_contact_id IS NULL` the second, and
the fixture's hand-set stages survive. `ALTER TABLE … DISABLE/ENABLE TRIGGER` round-trips cleanly.

### Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir … db:generate
GEN_EXIT=0 ; git diff --numstat -- packages/supabase/src/database.types.ts   → (no diff)
$ (run again)                    GEN2_EXIT=0 ;                                → (no diff)
$ git diff --numstat main -- packages/supabase/src/database.types.ts
1483    10    packages/supabase/src/database.types.ts
```

No drift between two runs; the committed file is current. (The report's `654 7` is still wrong — m12.)

### Full SQL sweep

```
$ for f in $(find supabase/tests -name "*_test.sql" | sort); do psql … -v ON_ERROR_STOP=1 -f $f; done
TOTAL=166 RED=30
```

The same 30 as r12/r13, failing for the same pre-existing reasons — spot-checked:
`rls/field_parties_test.sql` → `consent_legacy_column_frozen`;
`site_requests/security_and_lifecycle_test.sql` → "send must transition not_asked consent to pending";
`commercial/trade_rfq_test.sql` → "design services agreement … not found or access denied";
`agent_os/roles_test.sql` → `permission denied for table agent_tasks`;
`document/journey_authority_integrity_test.sql` → `permission denied for table project_ffe_items`.
**No suite went red that was green at r13.**

### Object posture (`build/probe210-w1b-final-r14-posture.sql` → `.out`)

```
           relname           | relkind | rls | policies | auth_sel | anon_sel | auth_ins | anon_ins
-----------------------------+---------+-----+----------+----------+----------+----------+----------
 people_directory            | v       | f   |        0 | t        | t        | t        | t   ← m7
 people_directory_seats      | v       | f   |        0 | t        | f        | t        | f
 project_party_authority     | r       | t   |        4 | t        | f        | t        | f
 project_site_access_cards   | r       | t   |        4 | t        | f        | t        | f
 studio_compliance_documents | r       | t   |        4 | t        | f        | t        | f
 v_access_grants             | v       | f   |        0 | t        | f        | t        | f

PR-r:  code_like_columns = 0   (gate_code | code | access_code | lockbox_code | show_to_client)
PR-w:  four policies on project_site_access_cards, all
       is_active_studio_member(project_recorded_studio(project_id))
       AND is_studio_comember(project_designer(project_id))   — no client leg, TO authenticated only
PR-n:  insert / update / delete on project_party_authority all carry
       (scope <> ALL (ARRAY['money','draw_certify'])) OR is_org_admin_or_owner(
         project_party_recorded_studio(engagement_id))
       — the SELECT policy correctly does NOT (a member may read a money grant, not write one)
```

29 routines: every SECURITY DEFINER one pins `search_path` (section E returned **0 rows**), every
one is `anon_exec = f`, and the four `assert_*` guards plus `rolodex_card_for_party_phone`,
`link_party_to_rolodex_card` and `link_rolodex_card_to_parties` are `auth_exec = f` as well.

`people_directory` column order: 12 carried (`person_id … scope`, matching
`PeopleDirectoryRow` in `packages/supabase/src/hooks/use-people.ts:58-91` name for name and
position for position) + 5 appended (`reach_state, consent_status, paper_state,
contact_rule_summary, seat_count`). `select('*')` readers widen.

`compliance_state()`'s 30-day window, walked on a probe holder in a rolled-back transaction:

```
expires yesterday   -> lapsed        expires today+30 -> lapses_soon
expires today       -> lapses_soon   expires today+31 -> current
lapsed but GATELESS -> current       no paper at all  -> not_on_file
```

### anon (`build/probe211-…` → `.out`)

```
anon SELECT people_directory  → ERROR: permission denied for table studio_contacts
anon INSERT people_directory  → ERROR: cannot insert into view (UNION, not auto-updatable)
auth INSERT v_access_grants   → ERROR: cannot insert into view (UNION, not auto-updatable)
anon SELECT v_access_grants / people_directory_seats → permission denied for view
```

m7's stray `anon` SELECT+INSERT on `people_directory` is inert in both directions.

### Cross-tenant sweep (`build/probe213-…` → `.out`) — clean

As the unrelated `cf-phase1-alice` (owner of Phase One Synthetic Studio):

```
v_access_grants by tier:  studio_member 1   (their own membership; nothing else)
compliance_docs 0 | authority 0 | site_cards 0 | seats 0 | directory 0
access_grants_trade_rfq 0 | …_trade_agreement_links 0 | …_plan_transmittals 0 | …_invoice_links 0
identity_phone_numbers(<own org>, <a FOREIGN card uuid>, NULL)  → 0 numbers
identity_consent_evidence(same)                                  → 0 rows
compliance_state(<Northgate Electric, another studio's card>)    → not_on_file
```

As the seeded studio's owner: `client_account 3 · field_link 7 · studio_member 3`, and
`0` grant_ids shaped like a 64-hex bearer credential.

### Reader vs record, on the seeded fixture, as `designer@patina.dev`

```
role: client 7 · contact 49 · lead 5 · sub 1        contact branch: person 28 · company 21
Dana Kowalski | contact | seat_count 2 | field_link | granted | lapsed
  Lindqvist kitchen | sub | warranty | stamped t | seat_has_company t | lapsed | granted | on_paper
  Okonkwo residence | sub | active   | stamped t | seat_has_company t | lapsed | granted | field_link

identity paper word vs seat line, disagreements     → 0 rows   (R-BJ / r13 MAJOR-2 holds)
identity consent word vs seat line, disagreements   → 0 rows
rows claiming a seat_count they cannot nest         → 0        (R-BG holds)
contact rows whose word ≠ channel_consent_status()  → 0 rows
```

---

## 1. MAJOR-1 (NEW) — `reach_state_for_identity()` carries no tenant predicate, so another studio's live field link decides this studio's Directory reach word

`00626:806-831`. Every other identity-keyed reducer in this wave is bounded:

| function / site | bound |
|---|---|
| `identity_seat_count()` `00626:697-703` | `is_active_studio_member(project_tenant_org(project_id)) OR pj.designer_id/lead/created_by = auth.uid()` + three co-member legs |
| `identity_seats` CTE `00626:1353-1359` | the same predicate, verbatim |
| `people_directory_seats` WHERE `00626:2066-2072` | the same predicate, verbatim (R-BG) |
| `identity_phone_numbers()` `00626:1027-1067` | `is_active_studio_member(p_organization_id)` **and** a per-seat "belongs to that studio" leg (r5 BLOCKING-1, r7 MAJOR-1) |
| `identity_consent_status()` / `identity_consent_evidence()` | resolved at one `p_organization_id` (R-AK) |
| **`reach_state_for_identity()` `00626:818-828`** | **none — only `party_identity_key(...) = p_identity_key`** |

Its EXISTS is a plain `field_link_tokens JOIN project_parties` under the caller's own RLS, and both
of those RLS predicates are `is_studio_comember(<designer of record>)` — satisfied by sharing **any**
active organization with that designer (`00584:982-992` added
`field_link_tokens_studio_rw`). So the set it reduces over is strictly wider than the set the
Directory will nest, and the extra members are seats in another studio.

`00626:1568` is the only call site, on the Directory's **party** branch — i.e. exactly the uncarded
identities, whose `party_identity_key()` is a phone number, an email or a login rather than a
studio-scoped card uuid, so it *can* collide across studios. (The contacts branch calls
`reach_state_for(profile, card, NULL)` `00626:1786`, which keys on `pp.studio_contact_id = <card>`
and is bounded by `assert_project_party_cards()`.)

### The walk — `build/probe212-w1b-final-r14-reach-cross-studio.sql` (+ `.out`)

Two design studios of the same designer (`designer@patina.dev` owns both, which is the shipped local
shape and the population r5 MAJOR-3 / r8 BLOCKING-1 were graded on). One **unstamped** seat in each,
on the same number. A live field link on studio B's seat only. Read as
`studio_manager@patina.dev` — admin of studio A, **not** a member of studio B:

```
--- neither seat was auto-stamped (no card carries this number) ---
 669acb74-… | Okonkwo residence   | studio_contact_id NULL | +16125559911 | ikey +16125559911
 98a218ee-… | r14 Studio B job    | studio_contact_id NULL | +16125559911 | ikey +16125559911

--- the record ---                 live_links_on_A_seat 0 | live_links_on_B_seat 1
--- the caller ---                 member_of_studio_b   f | member_of_studio_a   t

--- the two views correctly refuse studio B's seat ---
 b_seat_rows_in_seats_view 0 | a_seat_rows_in_seats_view 1
--- but the base tables admit it under shipped RLS ---
 b_seat_readable_raw       1 | b_link_readable_raw      1

--- THE WORD ---
 display_name     | role | reach_state | seat_count | project_id
 R14 Shared Human | sub  | field_link  |          1 | Okonkwo residence
--- and the seat line beneath it ---
 R14 Shared Human | Okonkwo residence | on_paper
--- the function, asked directly ---
 reach_state_for_identity(NULL,'+16125559911') = field_link
 reach_state_for(NULL,NULL,<studio A's seat>)  = on_paper
```

Studio A holds **zero** live field links for this human. Its Directory row nevertheless says
`field_link`, it claims `seat_count 1` and nests exactly that one seat, and the seat line directly
beneath the row says `on_paper`. Direction §3.8 / PD-12 define `field_link` as a live door **this
studio** minted; R-AB lists "Copy field link" among the acts the row carries, and R-F's Call Sheet
vitals count "N on paper". So the room offers a door it cannot open, and the studio's next act —
mint one — is the act the word tells it not to take.

This is the shape r10 MAJOR-2 and r13 MAJOR-2 were both graded on: two columns of one wave
disagreeing on one screen, with the record on the seat line's side.

**Not BLOCKING.** No consent is involved (reach ≠ consent), and no new read is opened: the caller
already reads both base rows directly under `00584`'s shipped policies, so nothing crosses a tenant
boundary that was not already crossed. It is a *word*, and the word is wrong.

**The close**, and it costs one predicate: give `reach_state_for_identity()` the same WHERE the
`identity_seats` CTE carries — join `projects pj`, add
`( is_active_studio_member(project_tenant_org(pp.project_id)) OR pj.designer_id = (select auth.uid())
OR pj.lead_designer_id = (select auth.uid()) OR pj.created_by = (select auth.uid()) )` beside the
three co-member legs. That makes the reach word reduce over exactly the seats the row nests, which
is what R-BG already requires of `seat_count` and what r13 MAJOR-2 just required of `paper_state`.
It cannot regress r11 MAJOR-1 (the solo designer keeps her own job's links through the disjunction)
and it cannot regress r6 MAJOR-1 (the working studio's admin still comes in through the tenant leg).
A narrower `p_organization_id` argument would work too, but the three-site predicate is the one the
file already treats as canonical, and reusing it keeps the R-BG triple a quadruple rather than
inventing a fourth definition.

Confidence: **high** on the fact (walked, with the mutation control on the same rows), **medium-high**
on the grade — it is a W2-planned reader printing a verdict the record contradicts, which is the
MAJOR class as written; it is not a send, a consent or a tenant hole.

---

## 2. Re-check of every r13 finding

### The two MAJORs — both FIXED

| r13 | status | evidence |
|---|---|---|
| MAJOR-1 — the studio-less population's duplicate identity | **RULED, not patched (R-BI)** and the sentence is where the finding asked: `00626:351-388` (§1b, with the walk, the refused fix and the send-gate note), `rolodex_card_for_party_phone()`'s COMMENT `00626:436-441`, `00624:741-757` (the third preflight SELECT), `w1b-report.md:552-580`. Suite block 23c–23e pins the residue and asserts no row of Pete Rusk's ever reads `granted`. Locally `studioless_projects_carrying_seats = 0`. Accepted — the ruling is in `rulings.md` §3 and is settled, not a finding. |
| MAJOR-2 — the auto-linked seat's paper word | **FIXED (R-BJ).** `00626:2024-2026` is `identity_paper_state(pp.studio_contact_id, COALESCE(pp.company_id, sc.company_id))` over a primary-key `LEFT JOIN studio_contacts sc` (`:2040`). Re-walked independently: Dana Kowalski's identity row and **both** her seat lines read `lapsed`; across the whole fixture, identity-vs-seat paper disagreements = **0 rows**. crm-model §5's "open engagements keep the old company_id" is preserved by the COALESCE order (block 23b). |

### The 28 MINORs — all still open, none touched (by design, per the r13 fix log)

| id | status this round | evidence |
|---|---|---|
| n1 seats view's rule clause never falls back to the person rule | **open** | `00626:2027` is still `contact_rule_summary('engagement', pp.id)` alone |
| n2 `project_party_org()` is dead code and still granted to `authenticated` | **open** | `grep -rn project_party_org supabase/ packages/ apps/` finds it only in its own definition file and in `database.types.ts:35397`; probe D shows `auth_exec = t` |
| n3 `field_link_window_closed` is unreachable | **open** | `00627:577-585`'s `ELSE now() + interval '90 days'` makes `v_expires > now()` on every branch, so `00627:589` cannot fire |
| n4 the auto-link makes "unlink this seat" impossible | **open** | `apply_party_rolodex_link_trg` still fires on `UPDATE OF … studio_contact_id` (`00626:495`) |
| n5 `identity_paper_state()` reads only the single derived `studio_contacts.company_id` pointer | **open** | `00626:1795`, `:2024-2026`; R-AO's N×N affiliations are not consulted |
| n6 two migrations `DISABLE TRIGGER set_updated_at_project_parties` | **open** | `00624:806`/`:819`, `00626:561`/`:572`. Verified this round that a `psql -f` replay of each file re-enables it cleanly — but that is the *successful* path; the deploy-brief note stands |
| n7 the 00626 backfill calls `rolodex_card_for_party_phone()` twice per candidate row | **open** | `00626:565` and `:569` |
| n8 `link_rolodex_card_to_parties_trg` does not fire on `entity_kind`/`organization_id` | **open** | `00626:548` |
| n9 a second-studio member can NULL `studio_contact_id`; the auto-link is what makes it harmless | **open** | pre-existing `00584` write door; unchanged this round |
| m1 `project_review` tier projects `pra.revoked_by` into `granted_by` | **open** | `00627:491` |
| m2 the "closed at the GRANT level" premise is false for two of four | **open, re-measured** | `plan_transmittal_tokens` **9** column-level SELECT grants to `authenticated`, `trade_rfq_tokens` **8**; table-level `has_table_privilege` is `f` for all four. `w1b-report.md:205-209` and `:611-613` still ask Kody to rule on a fact that is not the fact |
| m3 the seven invoker branches inherit each base table's predicate | **open** | re-measured: the unrelated studio owner reads `studio_member 1` and nothing else; the posture belongs in the COMMENT |
| m4 the `evidence_upload` tier is unexercised (0 tokens locally) | **open** | `select count(*) from fulfillment_evidence_upload_tokens` = 0 |
| m5 the party branch's rule clause is the winning seat's override | **open** | `00626:1575` |
| m6 all 21 firm rows carry a `consent_status` word R-G gives the company row no column for | **open** | contact branch by entity_kind: person 28 / company 21, every company card carries `phone_e164` |
| m7 `people_directory` is the only wave relation with no explicit `REVOKE … FROM anon` | **open, and inert** | probe A `anon_sel = t`, `anon_ins = t`; probe B shows both refused downstream (`permission denied for table studio_contacts`, `cannot insert into view`) |
| m8 two live portal UPDATE writers of the frozen consent columns | **open** | `packages/supabase/src/hooks/use-coordination.ts:714-736` and `:886-900`; both will raise `consent_legacy_column_frozen` at deploy. The file's own comments say W2 replaces them with `record_channel_consent()`. W1a §8 owes it |
| m9 `blocks='{}'` and an outright `DELETE` each flip a lapse to `current`, untraceably | **open** | `00623:136` (the column default) and `:542-547` (the member DELETE policy). Fable's ruling still owed |
| m10 30 red of 166; nine unlisted in `KNOWN_FAILURES.md` | **open, unchanged** | `TOTAL=166 RED=30`, same list |
| m11 the `studio_contact_id` preflight is a comment nothing runs | **open** | `00624:724-739` |
| m12 `w1b-report.md` drift | **open and wider** | re-measured: `:333` says 2701, actual **2723**; `:356` says `passed=12`, actual **23 blocks**; `:383` says `654 7`, actual **1483 10** vs `main` (and **no diff** vs the working tree); `:435-438` quotes the site-access policies without the `is_active_studio_member(project_recorded_studio(...))` conjunct they all carry; `:444-460` lists 16 functions where the wave defines or redefines **29 routines / 28 names**; `:131` still gives `paper_state` as `compliance_state(COALESCE(company_id, id))`; `:62-70` describes the stage backfill without its trigger brackets; `:229-234` omits `create_field_link`'s "must land in the future" leg |
| m13 eleven-plus definer uuid→fact oracles | **open** | probe D: `project_tenant_org`, `project_recorded_studio`, `project_party_recorded_studio`, `project_designer`, `project_party_org` all `auth_exec = t` |
| m14 the dev seed's `ON CONFLICT … DO UPDATE` on `studio_channel_consent` | **open** | `supabase/seed/people_crm_dev.sql:533-544` still overwrites `status`, `opt_out_at`, `opt_out_source`, `opt_out_evidence`, `refusal_unanswered` outside `record_channel_consent()`/`record_channel_invite()`, and `config.toml:88` still carries the file into `[remotes.staging.db.seed]` for the provisioned branch `vuesoyhfrjabfxbrzekd`. **This remains the one mechanism in the wave with the BLOCKING shape** — a replay sets an `opted_out` record back to `granted` and nulls its opt-out evidence with no newly recorded consent. Graded MINOR again, on the same grounds as r13: every row is hard-coded to the Local Dev Studio uuid and to seven numbers inside the reserved fictional range `+1612555-01xx`, and seeds never run on prod, so no real recipient's refusal can be lost. Route it through the RPCs, or drop `status`/`opt_out_*`/`refusal_unanswered` from the `DO UPDATE` list |
| m15 the half-built-database window | **did not recur** | no `supabase` process before any reset; all three resets 555/555 |
| m16 an explicit `p_expires_at` cannot beat a live window | **open** | `00627:577-585`'s CASE order; PR-l's "make the studio choose" cannot be built on this RPC |
| m17 `SELECT * FROM people_directory` cost | **open, re-measured** | `EXPLAIN (ANALYZE)` as the studio owner: `Planning Time 11.266 ms`, **`Execution Time 101.663 ms` at 62 rows** — r13's 102.4 ms, unchanged |
| m18 r11 MAJOR-1 guarded only by `people_directory_scope_test.sql` (h3); r11 MAJOR-2 by nothing | **open** | no new block covers either |
| m19 a rolodex pick on a `studio_id IS NULL` project hard-errors | **open** | `00624:655-663` raises `party_card_project_has_no_studio`; the Strata count is owed |

---

## 3. MINOR findings, new this round

**p1 — the five appended columns are invisible to every TypeScript reader: `PeopleDirectoryRow` was
not widened.** (`packages/supabase/src/hooks/use-people.ts:58-91`; unchanged against `main` —
`git diff --stat main -- packages/supabase/src/hooks/use-people.ts` is empty.) `database.types.ts`
carries them, but the hand-written interface both hooks cast to
(`usePeopleDirectory` `:120-148`, `usePerson` `:154-166`, both `select('*')`) stops at `scope`. A W2
component writing `row.reach_state` gets a TS error, and the natural fix under pressure is a cast,
which is how a typed data layer stops being one. `packages/supabase` is this wave's own territory —
`use-coordination.ts` was edited here — so this is W1b's line to add, not W2's to discover. Low cost,
high confidence.

**p2 — three COMMENTs assert that `field_link_tokens` is "designer-only RLS (00283)", and it has not
been since `00584`.** (`00626:96-99`, `:652-655`, `:846-847`.) `00584:982-992` added
`field_link_tokens_studio_rw FOR ALL TO authenticated` with `is_studio_comember(p.designer_id)`. So
the "degrade posture" those comments promise — a co-member without designer visibility reads
`on_paper` where a link exists — does not happen for a studio co-member at all; what happens instead
is MAJOR-1 above, the opposite direction. The false premise is load-bearing: it is the sentence that
makes an unscoped identity scan look safe. Fix the three comments with the fix for MAJOR-1.

**p3 — `party_identity_key()` and `party_kind_in_directory()` carry no `SET search_path`, and the
first backs an expression index.** (`00626:271-289`, `:312-315`, `:589-596`.) Both are `IMMUTABLE`,
`SECURITY INVOKER` and touch no table, and every operator they use resolves from `pg_catalog`, so
there is no reachable defect today — the migration rule's "SECURITY DEFINER pins search_path" does
not bind them. Worth pinning anyway, because `idx_project_parties_identity_key` is only as stable as
the function's resolution, and the file's own §1 leans on that stability. Low confidence on
consequence, high on the fact.

---

## 4. Recorded, not findings

- **The BLOCKING class, checked end to end.** No file in `00623`–`00627` reads or writes any
  `project_parties.sms_consent_*` column (`grep` over the five files returns only prose), and none
  writes `studio_channel_consent` at all. The consent word has exactly one source
  (`channel_consent_status()`), the freeze trigger's `UPDATE OF` list is untouched (block 11), and
  the send gate is unchanged. Every consent divergence sweep this round returned 0 rows.
- **Grants, both directions.** Every new table carries `REVOKE ALL … FROM PUBLIC, anon,
  authenticated` followed by an explicit `GRANT`; every new function carries `REVOKE ALL … FROM
  PUBLIC, anon` and, where it is a trigger body or a trigger-only helper, from `authenticated` too.
  `generate-legacy-grants.py` reproduces the committed seed byte-for-byte.
- **`create_field_link` graft.** `grep -rln "CREATE OR REPLACE FUNCTION[^(]*create_field_link"
  supabase/migrations/*.sql | sort | tail -1` → `00284_field_dispatch_wiring.sql`, and `00284:37-80`
  is reproduced verbatim in `00627:525-612` — the same `no_data_found` raise, the same
  `auth.uid() IS NOT NULL AND NOT EXISTS(… p.designer_id = auth.uid())` guard with the NULL-uid
  internal bypass, the same supersede, the same `gen_random_bytes`/`digest` pair schema-qualified to
  `extensions`. Only `expires_at` is added to the INSERT, and the one-argument signature survives as
  a delegate (`00627:636-645`), so `use-party-sms.ts:133` does not move.
- **`v_access_grants` union shapes.** Eleven tiers, twelve columns, four of them through definer
  readers whose `RETURNS TABLE` restates the same twelve types; `SELECT *` from each reader lines up
  positionally with the seven inline branches (the view builds and reads without a cast error, and
  block 9 walks it). `grant_id` is `<tier>:<natural key>` TEXT throughout; zero grant_ids match
  `^[0-9a-f]{64}$`.
- **The `project_parties` trigger order the auto-link depends on** is real:
  `apply_party_rolodex_link_trg` < `assert_project_party_cards_trg` < `normalize_phone_project_parties`
  < `refuse_legacy_consent_write_trg` < `set_updated_at_project_parties`, and
  `link_party_to_rolodex_card()` derives the number with exactly the expression
  `normalize_party_phone_e164()` uses (`normalize_phone_e164(COALESCE(NEW.phone, NEW.phone_e164))`),
  so the stamp and the stored `phone_e164` cannot disagree.
- **`identity_phone_numbers()`'s widened third leg** (`00626:1046-1067`) can only add numbers to a
  worst-first reduction, which can only make the printed word less permissive (R-BB). Walked from the
  outside: the unrelated studio owner gets 0 numbers for a foreign identity key.
- **R-AX's stated rule is still not enforced for the population R-AY created** — unchanged from r12
  and r13, Fable's to rule.
- Two seats nest under no Directory row (`Granite North`/`vendor`, `Karin Lindqvist`/`client`); both
  are the dangles `00626:1928-1943` declares by design.
- The behavioural change the deploy owns is unchanged and correctly stated: `directory-view.tsx:294`
  filters `p.role !== 'contact'` and `people-room.tsx:383` counts `all.length`, so the room reads
  oddly until W2 lands — which rulings §6 already sequences into one chain.

---

## 5. Summary

| # | severity | confidence | where |
|---|---|---|---|
| MAJOR-1 | MAJOR | high on fact, medium-high on grade | `00626:806-831`, call site `:1568` |
| p1 | MINOR | high | `packages/supabase/src/hooks/use-people.ts:58-91` |
| p2 | MINOR | high | `00626:96-99`, `:652-655`, `:846-847` |
| p3 | MINOR | medium on fact, low on consequence | `00626:271-289`, `:312-315`, `:589-596` |
| n1–n9, m1–m19 | MINOR | carried from r13, all re-checked open | see §2 |

**Not clean:** one MAJOR. Zero BLOCKING.
