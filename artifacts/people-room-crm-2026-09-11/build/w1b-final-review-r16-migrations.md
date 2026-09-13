# W1b — final review, round 16 (migrations)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, local DB only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **Nothing touched on Strata**: no
`supabase db push`, no `supabase functions deploy`, no `wrangler`, no `db:push`. No migration number
minted; 00595–00620 untouched and reserved.

Read in full first: `rulings.md` (§1–§6, R-A … R-BJ — all settled, not findings, R-AW/R-AY
included), `synthesis/direction.md` §2.2/§3.8/§7/§8, `synthesis/crm-model.md` §1/§2/§4/§5,
`briefing/current-state.md` §B–§E, `build/inventory.md`, `briefing/fixture.md`,
`build/w1a-report.md`, `build/w1a-close-review-r6-migrations.md` and `-tests.md`,
`build/w1b-report.md`, `build/w1b-final-review-r15-migrations.md`,
`build/w1b-final-fix-log-r15.md`. Then every line of `00623`–`00627`, `00593`'s
`assert_studio_contact_identity_stable()`, the grep-winner `00284:37-85`,
`supabase/functions/_shared/sms.ts`'s send gate, `supabase/seed/people_crm_dev.sql`,
`supabase/config.toml`, `scripts/generate-legacy-grants.py`.

**Verdict: CLEAN — zero BLOCKING, zero MAJOR.** Both r15 MAJORs are fixed and independently
re-walked. Two new MINORs (`f1`, `f2`); `p1`, `p3`, `p4`, `p5`, `n1–n9`, `m1–m19` re-checked and
still open by design. `m15` (the shared-database window) **recurred for the third consecutive
round and killed one of my runs mid-flight** — §0.

---

## 0. What I ran, and what it said

### Premise checks

```
$ grep -n NEXT_PUBLIC_SUPABASE_URL /Users/kody/Code/patina-merged/apps/designer-portal/.env.local
1:# prod # NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co   ← commented out
14:# prod # NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321                    ← commented out
19:NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321                             ← the live line
   # the worktree has no .env.local of its own; the repo-root copy points local
```

### Grants, then reset — twice, as the brief requires

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2724 replayed statements
$ git status --porcelain -- supabase/seed/00-legacy-grants.sql
   (empty — the committed seed reproduces byte for byte)

$ pnpm --dir …/agent-people-build supabase:reset              # 1st
RESET1_EXIT=0    555 "Applying migration" lines
   the ONLY /error/i line is a FILENAME: "Applying migration 00458_sms_message_error_capture.sql..."
$ psql … -At -c "select count(*) from supabase_migrations.schema_migrations;"        → 555
$ psql … -At -c "… where version >= '00590';"
00590 00591 00592 00593 00594 00621 00622 00623 00624 00625 00626 00627 20260910152111

$ pnpm --dir …/agent-people-build supabase:reset              # 2nd
RESET2_EXIT=0    555    ledger 555 and the same 00590-block, identical
```

### Both suites, on the clean second reset

```
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
W1A_EXIT2=0      (51 NOTICE lines)
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
W1B_EXIT2=0      25 numbered blocks + "All W1b assertions passed."
NOTICE:  25. the CONTACTS branch's reach word reduces over the seats the row nests — a live field
         link on a seat wearing this studio's card but sitting on another studio's job no longer
         prints field_link over seat_count 0 and no seat line, and the studio's own link still
         does (r15 MAJOR-2): passed
```

W1a's block 47 (r15 MAJOR-1's regression test) and W1b's block 25 (r15 MAJOR-2's) are both present
and green.

### Idempotence beyond the reset — all six touched files replayed over the populated database

```
$ for f in 00623 00624 00625 00626 00627 00593; do psql … -v ON_ERROR_STOP=1 -f …/$f…; done
00623 REPLAY_EXIT=0  00624 REPLAY_EXIT=0  00625 REPLAY_EXIT=0
00626 REPLAY_EXIT=0  00627 REPLAY_EXIT=0  00593 REPLAY_EXIT=0
$ psql … -At -c "<project_parties triggers, tgenabled>"
apply_party_rolodex_link_trg|O   assert_project_party_cards_trg|O   fc_optin_invite_dispatch|O
normalize_phone_project_parties|O  refuse_legacy_consent_write_trg|O  set_updated_at_project_parties|O
$ both suites again:   W1B_AFTER_REPLAY_EXIT=0 (25)   W1A_AFTER_REPLAY_EXIT=0 (51)
```

Both bracketed backfills round-trip their `DISABLE/ENABLE TRIGGER` cleanly.

### The dev seed replays

```
$ psql … -v ON_ERROR_STOP=1 -f supabase/seed/people_crm_dev.sql   SEED_REPLAY1_EXIT=0
$ psql … -v ON_ERROR_STOP=1 -f supabase/seed/people_crm_dev.sql   SEED_REPLAY2_EXIT=0
cards|49  docs|36  consent|7  authority|11  site_cards|1  seats|31   (stable across both)
```

### Generated types, type-checks, the full SQL sweep

```
$ SUPABASE_DB_URL=… pnpm --dir … db:generate   GEN_EXIT=0 ; git diff --numstat → (empty)
$ (again)                                       GEN2_EXIT=0 ; → (empty)     # no drift
$ pnpm --dir … --filter @patina/supabase        type-check   → SUPABASE_TC=0
$ pnpm --dir … --filter @patina/designer-portal type-check   → DESIGNER_TC=0
$ for f in $(find supabase/tests -name "*_test.sql" | sort); do psql … -f $f; done
TOTAL=166 RED=31          # identical to r15's own fix-log figure; m10, unchanged
```

### ⚠ An environment fact for the orchestrator, not a branch finding — `m15`, third round running

Mid-way through my post-replay W1b run the server dropped:

```
psql:…/w1b_compliance_authority_directory_test.sql:1734: server closed the connection unexpectedly
psql:…/w1b_compliance_authority_directory_test.sql:1734: error: connection to server was lost
```

`ps` then showed **another session's `supabase db reset` running against this same worktree**:

```
kody 74801 node /Users/kody/.nvm/…/pnpm supabase:reset
kody 74799 /bin/zsh -c … 'cd /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build
                           && pnpm supabase:reset 2>&1 | tail -10'
kody 74814 sh -c cd supabase && supabase db reset
```

`docker ps` showed `supabase_db_supabase` at "Up 16 seconds". I waited for that process to clear
(the container log's tail is an ordinary restart, not an OOM), then ran my own reset #2 and redid
every measurement above on it. Everything reported here is from runs with no competing process. The
brief says this wave is 54322's sole owner and it is not; r13 `m15`, r15 `m15` and now r16 are the
same fact three rounds in a row, and it has now cost a round a discarded run.

### Object posture

```
           relname           | relkind | rls | policies | auth_sel | anon_sel | anon_ins
-----------------------------+---------+-----+----------+----------+----------+----------
 people_directory            | v       | f   |        0 | t        | t        | t   ← m7
 people_directory_seats      | v       | f   |        0 | t        | f        | f
 project_party_authority     | r       | t   |        4 | t        | f        | f
 project_site_access_cards   | r       | t   |        4 | t        | f        | f
 studio_compliance_documents | r       | t   |        4 | t        | f        | f
 v_access_grants             | v       | f   |        0 | t        | f        | f
 studio_channel_consent      | r       | t   |        1 | t        | f        | f   ← SELECT only
```

`m7` is inert, re-walked: as `anon`, `SELECT * FROM public.people_directory` →
`ERROR: permission denied for table studio_contacts`. The view is `security_invoker` and anon holds
no grant on any base table this wave touches.

**Every one of the 30 routines this wave defines or redefines** pins `search_path` where it is
`SECURITY DEFINER`, and **every one is `anon_exec = f`**:

```
 access_grants_invoice_links           | definer | s | search_path=public  | auth t | anon f
 access_grants_plan_transmittals       | definer | s | search_path=public  | auth t | anon f
 access_grants_trade_agreement_links   | definer | s | search_path=public  | auth t | anon f
 access_grants_trade_rfq               | definer | s | search_path=public  | auth t | anon f
 assert_compliance_holder              | definer | v | search_path=public  | auth f | anon f
 assert_party_authority_copy_to        | definer | v | search_path=public  | auth f | anon f
 assert_project_party_cards            | definer | v | search_path=public  | auth f | anon f
 assert_site_access_key_holder         | definer | v | search_path=public  | auth f | anon f
 assert_studio_contact_identity_stable | definer | v | search_path=public  | auth f | anon f
 compliance_state                      | INVOKER | s | search_path=public  | auth t | anon f
 contact_rule_summary                  | INVOKER | s | search_path=public  | auth t | anon f
 create_field_link (both sigs)         | definer | v | public, extensions, pg_temp | auth t | anon f
 identity_consent_evidence             | INVOKER | s | search_path=public  | auth t | anon f
 identity_consent_status               | INVOKER | s | search_path=public  | auth t | anon f
 identity_paper_state                  | INVOKER | s | search_path=public  | auth t | anon f
 identity_phone_numbers                | definer | s | search_path=public  | auth t | anon f
 identity_seat_count                   | INVOKER | s | search_path=public  | auth t | anon f
 link_party_to_rolodex_card            | definer | v | public, pg_temp     | auth f | anon f
 link_rolodex_card_to_parties          | definer | v | public, pg_temp     | auth f | anon f
 party_identity_key                    | INVOKER | i | (none — IMMUTABLE)  | auth t | anon f  ← p3
 party_kind_in_directory               | INVOKER | i | (none — IMMUTABLE)  | auth t | anon f  ← p3
 project_designer                      | definer | s | search_path=public  | auth t | anon f
 project_party_org                     | definer | s | search_path=public  | auth t | anon f  ← n2
 project_party_recorded_studio         | definer | s | search_path=public  | auth t | anon f
 project_recorded_studio               | definer | s | search_path=public  | auth t | anon f
 project_tenant_org                    | definer | s | search_path=public  | auth t | anon f
 reach_state_for                       | INVOKER | s | search_path=public  | auth t | anon f
 reach_state_for_identity              | INVOKER | s | search_path=public  | auth t | anon f
 rolodex_card_for_party_phone          | definer | s | search_path=public  | auth f | anon f
```

### The rulings the brief names, walked independently of the suite

`compliance_state()`'s 30-day window, on a probe holder in a rolled-back transaction as an ordinary
member (`/tmp/claude/p406.sql`):

```
empty        -> not_on_file      d+0          -> lapses_soon
d+31         -> current          d-1          -> lapsed
d+30         -> lapses_soon      d-1 gateless -> current
```

PR-r / PR-w / PR-n, off the catalogue:

```
project_site_access_cards code_like_columns = 0
  (gate_code | ^code$ | access_code | lockbox_code | combination | ^pin$ | show_to_client)
four policies, TO authenticated only, every one
  is_active_studio_member(project_recorded_studio(project_id))
  AND is_studio_comember(project_designer(project_id))     — no client leg
project_party_authority: insert/update/delete carry is_org_admin_or_owner(…); SELECT correctly does not
```

`people_directory`'s twelve carried columns keep name, position and type; five appended:

```
1 person_id 2 role 3 display_name 4 email 5 phone 6 profile_id 7 project_id 8 designer_id
9 status_raw 10 last_touch_at 11 meta 12 scope | 13 reach_state 14 consent_status
15 paper_state 16 contact_rule_summary 17 seat_count
```

`create_field_link`'s graft, checked the way the rules require:

```
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*create_field_link" supabase/migrations/*.sql | sort | tail -1
supabase/migrations/00627_access_grants_and_field_link_window.sql
```

with `00284:37` as the previous head. `00284:49-79` (the `no_data_found` raise, the
`auth.uid() IS NOT NULL AND NOT EXISTS(… p.designer_id = auth.uid())` guard with its NULL-uid
internal bypass, the supersede, `extensions.gen_random_bytes` / `extensions.digest`) is reproduced
in `00627:542-608` line for line; only `expires_at` joins the INSERT, with the expiry CASE and its
pre-supersede raise above it, and `00627:636-645` keeps the one-argument signature as a delegate.

`v_access_grants`: eleven tiers, twelve columns, four through definer readers. Every base table of
the seven invoker branches has RLS enabled with at least one policy —

```
designer_clients t/4  document_shares t/1  field_link_tokens t/2  organization_members t/7
fulfillment_evidence_upload_tokens t/2  project_review_access t/1  site_request_access t/1
site_requests t/1
```

— and the two that carry zero policies (`invoice_links`, `studio_trade_agreement_tokens`) are
`auth_sel = f` and reachable only through their gated definer readers. No tier is an open door.

### The severity-class sweeps

**BLOCKING, end to end.** No file in `00623`–`00627` reads or writes any
`project_parties.sms_consent_*` column (the only greps that hit are prose and the `meta` keys the
view has always carried) and none writes `studio_channel_consent`. The record is **SELECT-only for
`authenticated`** — one policy, `is_active_studio_member(organization_id)`, and no INSERT/UPDATE/
DELETE grant at all — so `record_channel_consent()` remains the only write door. The send gate is
unchanged and refuses first:

```ts
// supabase/functions/_shared/sms.ts:725-731
const verdict = await channelConsentVerdict(supabase, recipient.phone, recipient.projectId);
if (verdict === "refuse") { return { sent: false, reason: "opted_out" }; }
```

— before the `sms_optin_invite` carve-out at `:752-776`.

**And the deploy cannot mass-dispatch**, which is a question the backfills raise and nothing had
walked: `fc_optin_invite_dispatch` is `AFTER INSERT OR UPDATE` on **every column** of
`project_parties`, so 00624's stage backfill and 00626's stamp backfill both fire it on every row
they touch. Staged a legacy seat in the shape the dispatcher fires on — `pending` with all four
evidence columns — then ran both backfill statements over it (`/tmp/claude/p412.sql`, rolled back):

```
queued_after_insert     | 1     ← the INSERT queues its one invite, correctly
queued_after_backfills  | 1     ← the stage UPDATE and the stamp UPDATE queue NOTHING
```

`fc_dispatch_optin_invite()`'s re-entrancy guard (`OLD.sms_consent_status IS NOT DISTINCT FROM
'pending' AND OLD.<all four> present → RETURN NEW`) holds, because neither backfill moves a consent
column. No text is sent by the deploy.

**Divergence sweeps**, as `designer@patina.dev` on the seeded fixture (`/tmp/claude/p402.sql`):

```
role:  client 7 · contact 49 · lead 5 · sub 1
reach: account 9 · field_link 6 · on_paper 47

contact rows whose word <> identity_consent_status() recomputed                 → 0
contact rows NOT opted_out while ANY number they carry IS refused               → 0
rows claiming a seat_count they cannot nest                                     → 0
seat lines reading opted_out under an identity row that does not                → 0
contact rows reading field_link over seat_count 0            (r15 MAJOR-2)      → 0
seats nesting under a person_id the Directory does not return                   → 2
   (Granite North/vendor and Karin Lindqvist/client — the two dangles 00626:2019-2036 declares)
```

**Cross-tenant**, four callers, every count zero except a caller's own membership row:

```
cf-phase1-alice (owner of an unrelated studio):
  compliance_docs 0 | authority 0 | site_cards 0 | dir_seats 0 | directory 0
  ag_rfq 0 | ag_agree 0 | ag_plan 0 | ag_inv 0
  access_grants 1   (studio_member: her own membership)
  identity_phone_numbers(<own org>, <Dana's card uuid>, NULL)   → 0 rows
  compliance_state(<Northgate Electric, another studio's card>) → not_on_file
  identity_consent_status(<own org>, <Dana's card>, NULL)       → (null)
  identity_paper_state(<Dana's card>, NULL)                     → not_on_file
  contact_rule_summary('person', <Dana's card>)                 → (null)
  identity_seat_count(<Dana's card>)                            → 0
  reach_state_for_identity(NULL, <Dana's card>)                 → on_paper

manufacturer@patina.dev: all ten counts 0
client@patina.dev (PR-w): site_cards 0 · authority 0 · compliance_docs 0 · dir_seats 0
anon: permission denied for table studio_contacts (through people_directory), for view
      people_directory_seats, for view v_access_grants, for table project_site_access_cards

control — studio_manager@patina.dev, Local Dev admin:
  compliance_docs 36 · authority 11 · site_cards 1 · dir_seats 31 · directory 62 · access_grants 13
```

**Cross-tenant WRITE.** A member of both studios cannot move a stamped seat onto the other
studio's job — `party_company_other_studio` / `party_studio_contact_other_studio` — and cannot
stamp a foreign card (suite block 20). `studio_contacts` carries **no DELETE grant for
`authenticated`** (`permission denied for table studio_contacts`), so the ON-DELETE-CASCADE path
that would take a card's compliance documents with it is not member-reachable. Moving an
**unstamped** seat to a job of the designer's second studio does land — a pre-existing
`project_parties` write door, not this wave's — and it carries no consent with it: the record is
per studio (R-AK/R-AY), the receiving studio holds none, `verdict` is not `allow`, and
`sms.ts:752-758` refuses every non-invite while the invite's four frozen evidence columns are NULL
on any live-written seat. Settled by R-AY, not a finding.

---

## 1. Re-check of every r15 finding

| r15 | status | evidence |
|---|---|---|
| **MAJOR-1** — a stamped card could be moved to another studio, because `project_parties.studio_contact_id` was not one of `assert_studio_contact_identity_stable()`'s holders | **FIXED**, independently walked | `00593:598-603` adds the sixth `count(*)`, `:602` the hint clause. Walked as `designer@patina.dev`, a member of both studios, on the seeded fixture: `UPDATE studio_contacts SET organization_id = <the other studio> WHERE full_name='Dana Kowalski'` → `ERROR: studio_contact_identity_held … 2 reach channel(s) on this card, 1 designation(s) naming it on other cards, 1 affiliation(s) standing on it, 2 seat(s) stamped with this card`. **Sole-holder positive control** (the r15 hint alone does not prove the new leg bites, because Dana is held four ways): a fresh person card whose ONLY holder is one seat → `ERROR: studio_contact_identity_held … 1 seat(s) stamped with this card`, and the kind flip is refused the same way. **Bypass hunt:** NULLing the stamp first does not open it — `apply_party_rolodex_link_trg` re-stamps the seat in the same statement (`restamped_by_trigger | a1b7d5e5-…`) and the move is refused again. The one sequence that does land is move the SEAT's number away, then unstamp, then move the card — which is the detach-then-move path the HINT itself prescribes, and leaves the seat a different identity by construction. Not a residue. |
| **MAJOR-2** — `reach_state_for()` carried no tenant predicate on the branch that holds every carded human | **FIXED**, independently verified | `00626:1873` is `public.reach_state_for_identity(sc.profile_id, sc.id::text)`; `reach_state_for()`'s body is untouched and its COMMENT (`:679-688`) records that no reader passes `p_card_id`. Live catalogue: `pg_get_viewdef('public.people_directory') LIKE '%reach_state_for_identity(sc.profile_id%'` → `t`. Measured on the fixture: **0** contact rows read `field_link` over `seat_count 0`, and `reach_state` still distributes `account 9 · field_link 6 · on_paper 47` — the predicate refuses a foreign door, not every door. W1b block 25 is the regression test and is green. |
| **p4** — `studio_contacts.phone_e164` can be moved off a refused number by an ordinary member | **open**, re-walked | A card-only identity (`seat_count 0`) on the fixture's refused `+16125550112` reads `opted_out`; one `UPDATE studio_contacts SET phone_e164='+16125557777'` and the row reads `not_asked`, while the record for `+16125550112` is intact and still `opted_out`. MINOR on r15's grounds, and I concur on the same reasoning: no reader disagrees with the record **about any number** (the number now on the card genuinely never refused), the send rail is number-keyed, and a card that holds a seat on the refused number keeps `opted_out` because the seat contributes its number to the worst-first reduction. |
| **p5** — the r14 phone freeze does not fire on the `projects.studio_id IS NULL` population | **open**, re-walked | An uncarded seat on `Aspen Loft Refresh` (`studio_id` NULL) carrying `+16125550112`: `UPDATE project_parties SET phone='612-555-9999'` → `UPDATE 1`, `phone_e164` now `+16125559999`. **Control**, the same seat shape on a job that RECORDS Local Dev Studio → `ERROR: consent_opted_out_phone_frozen`. R-BD's W3 backfill closes it; it belongs in the deploy brief beside R-BI. |
| **p1** — `PeopleDirectoryRow` not widened | **open** | `packages/supabase/src/hooks/use-people.ts:56-89` still ends at `scope`; `database.types.ts` carries all five. |
| **p3** — `party_identity_key()` / `party_kind_in_directory()` pin no `search_path` | **open** | live catalogue `cfg = (none)` for both; both IMMUTABLE, INVOKER and table-free, and `party_identity_key()` carries an expression index. |
| **n1** seats view's rule clause never falls back to the person rule | **open** | `00626:2120` is still `contact_rule_summary('engagement', pp.id)` alone |
| **n2** `project_party_org()` dead and still granted to `authenticated` | **open** | `grep -rn project_party_org supabase packages apps` returns only `00624`'s own definition and two lines of `seed/00-legacy-grants.sql`. `auth_exec = t`. |
| **n3** `field_link_window_closed` unreachable | **open** | `00627:577-585`'s `ELSE now() + interval '90 days'` makes every branch future, so `:589` cannot fire |
| **n4** the auto-link makes "unlink this seat" impossible | **open**, and **now demonstrated** | `00626:513-516`. My MAJOR-1 bypass walk is the demonstration: `UPDATE project_parties SET studio_contact_id = NULL` came back re-stamped in the same statement |
| **n5** `identity_paper_state()` reads only the derived `studio_contacts.company_id` | **open** | `00626:1882`, `:2117-2119`; R-AO's N×N affiliations are not consulted |
| **n6** two migrations `DISABLE TRIGGER set_updated_at_project_parties` | **open** | `00624:806`/`:819`, `00626:580`/`:591`; re-verified this round that a `psql -f` replay re-enables cleanly (all six triggers `tgenabled = O`) |
| **n7** the 00626 backfill calls `rolodex_card_for_party_phone()` twice per row | **open** | `00626:584` and `:588` |
| **n8** `link_rolodex_card_to_parties_trg` does not fire on `entity_kind`/`organization_id` | **open, and its dangerous half is now CLOSED** | `00626:566-569`. r15 MAJOR-1 was the other half and is fixed: the card can no longer move out from under a stamp at all |
| **n9** a second-studio member can NULL `studio_contact_id` | **open, and inert on a numbered seat** | the auto-link re-stamps in the same statement; it sticks only where the seat's number no longer names the card |
| **m1** `project_review` projects `pra.revoked_by` into `granted_by` | **open** | `00627:491` |
| **m2** the "closed at the GRANT level" premise is false for two of four | **open, and re-measured with a stronger fact** — see `f2` | table-level `has_table_privilege` is `f` for all four, but `trade_rfq_tokens` carries **8** column-level SELECT grants to `authenticated` and `plan_transmittal_tokens` **9**, and as an ordinary member `SELECT count(*) FROM public.trade_rfq_tokens` / `plan_transmittal_tokens` **returns rows rather than raising** — the shipped policies are not dead |
| **m3** the seven invoker branches inherit each base table's predicate | **open** | re-measured: the unrelated studio owner reads `studio_member 1` and nothing else |
| **m4** the `evidence_upload` tier is unexercised | **open** | locally only three of eleven tiers carry rows |
| **m5** the party branch's rule clause is the winning seat's override | **open** | `00626:1645` |
| **m6** all 21 firm rows carry a `consent_status` word R-G gives the company row no column for | **open** | contact branch: person 28 / company 21 |
| **m7** `people_directory` is the only wave relation with no explicit `REVOKE … FROM anon` | **open, and inert** | `anon_sel = t`, `anon_ins = t`; as anon the view raises `permission denied for table studio_contacts` |
| **m8** two live portal UPDATE writers of the frozen consent columns | **open** | `packages/supabase/src/hooks/use-coordination.ts:544-552`, `:743-759` still assemble `NOT_ASKED_CONSENT_COLUMNS` / `sms_opt_out_at` into an UPDATE patch; both raise `consent_legacy_column_frozen` at deploy. W1a §8 owes it |
| **m9** `blocks='{}'` and an outright `DELETE` each flip a lapse to `current`, untraceably | **open** | `00623:136` and the member DELETE policy `:542-547`. Fable's ruling still owed |
| **m10** 31 red of 166 | **open, unchanged** | `TOTAL=166 RED=31` — identical to the figure r15's own fix log carried forward |
| **m11** the `studio_contact_id` preflight is a comment nothing runs | **open** | `00624:724-739`; `00626:1864-1866` now names it too, because r15 MAJOR-2's population is the one it sizes |
| **m12** `w1b-report.md` drift | **open and worse** | `:333` says 2701, actual **2724**; `:353` says `passed=48`, actual **51 NOTICE lines**; `:356` says `passed=12`, actual **25 blocks**; `:368` reproduces block 12's r10-era wording, superseded; `:383` says `654 7`, actual **no diff** vs the working tree; `:131` still gives `paper_state` as `compliance_state(COALESCE(company_id, id))`, which r4 MAJOR-2 replaced with `identity_paper_state()`; `:444-460` lists 16 functions where the wave defines or redefines **30 routines / 28 names**; §5 and §8's "two things for Fable to rule" rest on `m2`'s false premise (`f2`). `probe57-w1b-objects.out` and `probe58-w1b-directory-as-designer.out` are likewise the r1-era captures |
| **m13** eleven-plus definer uuid→fact oracles | **open** | `project_tenant_org`, `project_recorded_studio`, `project_party_recorded_studio`, `project_designer`, `project_party_org` all `auth_exec = t` with no gate of their own |
| **m14** the dev seed's `ON CONFLICT … DO UPDATE` on `studio_channel_consent` | **open — and now REPRODUCED live** | see §2 |
| **m15** the half-built-database window | **RECURRED, third round** | see §0 |
| **m16** an explicit `p_expires_at` cannot beat a live window | **open** | `00627:577-585`'s CASE order; PR-l's "make the studio choose" cannot be built on this RPC |
| **m17** `SELECT * FROM people_directory` cost | **open** | unchanged shape |
| **m18** r11 MAJOR-1 guarded only by `people_directory_scope_test.sql`; r11 MAJOR-2 by nothing | **open** | no new block covers either |
| **m19** a rolodex pick on a `studio_id IS NULL` project hard-errors | **open, and re-walked incidentally** | both of my seat-move probes on the studio-less population came back `party_card_project_has_no_studio` |

---

## 2. `m14`, reproduced — the one mechanism in the wave with the BLOCKING shape

Graded **MINOR** by consequence, for the third round, on the same grounds — but this round it is
walked rather than read, so the fix log has a target.

`supabase/seed/people_crm_dev.sql:489-543` inserts the seven consent records outside
`record_channel_consent()` and closes with

```sql
ON CONFLICT (organization_id, channel_kind, channel_value) DO UPDATE
  SET status = EXCLUDED.status, consented_at = EXCLUDED.consented_at,
      source = EXCLUDED.source, evidence = EXCLUDED.evidence,
      opt_out_at = EXCLUDED.opt_out_at, opt_out_source = EXCLUDED.opt_out_source,
      opt_out_evidence = EXCLUDED.opt_out_evidence,
      refusal_unanswered = EXCLUDED.refusal_unanswered,
      origin_project_id = EXCLUDED.origin_project_id;
```

Walked (rolled back): the studio records a refusal on one of the five granted numbers, then the
seed replays.

```
--- BEFORE: the studio records a refusal on a granted number ---
 channel_value |  status   | has_optout |  opt_out_evidence
---------------+-----------+------------+--------------------
 +16125550106  | opted_out | t          | Said stop on site.

\i supabase/seed/people_crm_dev.sql

--- AFTER the seed replay ---
 channel_value | status  | has_optout | opt_out_evidence
---------------+---------+------------+------------------
 +16125550106  | granted | f          | (null)
```

An `opted_out` record is set back to `granted` and its opt-out evidence is NULLed, **with no newly
recorded consent**, bypassing `record_channel_consent()`'s R-AG / R-AL gates entirely. That is the
BLOCKING class as the brief words it — *"an opt-out can be lost or overwritten without a newly
recorded consent"* and *"a write path that destroys consent evidence"*.

**Why it stays MINOR, and where the tension is.** The brief also directs grading by consequence.
Every row is hard-coded to `b0000000-…-0001` (Local Dev Studio) and to seven numbers inside the
reserved fictional `+1612555-01xx` range; seeds never run on Strata main; a real tester on the
staging branch holds a different number and therefore a different record row, untouched by the
`ON CONFLICT`. No real recipient's refusal can be lost and no text can reach one. The file **is**
carried into `[remotes.staging.db.seed].sql_paths` for the provisioned branch `vuesoyhfrjabfxbrzekd`
(`supabase/config.toml:88`), so the blast radius is those seven fictional numbers on staging, not
zero. If Fable reads the brief's BLOCKING wording as naming the mechanism rather than the
consequence, this is the one row in the wave that answers to it, and the close is two lines: drop
`status`, `opt_out_*` and `refusal_unanswered` from the `DO UPDATE` list, or route the seven rows
through `record_channel_consent()`.

Confidence: **high** on the fact (reproduced), **deliberate** on the grade, stated so Fable can
overrule it without re-walking.

---

## 3. New MINOR findings

### `f1` — the two grant-closed definer readers project `created_by`, a column the shipped ACL withholds from `authenticated`

`00627:145` (`access_grants_trade_rfq()` → `t.created_by`) and `00627:235`
(`access_grants_plan_transmittals()` → `p.created_by`).

`m2`'s fact, followed one step further. The two tables are closed at the **table** level but carry
**column-level** SELECT grants to `authenticated`, and `created_by` is not among them:

```
trade_rfq_tokens        : created_at, expires_at, id, last_used_at, party_id,
                          proposal_id, rfq_request_id, status                    (8 — no created_by)
plan_transmittal_tokens : created_at, expires_at, first_opened_at, id, last_used_at,
                          project_id, status, transmittal_id, view_count          (9 — no created_by)
```

Both readers are `SECURITY DEFINER`, so they return `created_by` regardless. r6 BLOCKING-1's own
walk named "which profile opened each door" as part of the leaked shape and narrowed the **gate**;
the **column** is still projected. After r9 BLOCKING-1 the gate is
`is_active_studio_member(project_recorded_studio(…)) AND is_design_studio_comember(designer)` — an
active member of the owning studio — so what is handed out is *which of our own people minted this
link*, to our own studio. No credential and no hash is in either reader (verified: neither
`token_hash` nor `token` appears in any `RETURNS TABLE`, and 0 grant_ids match `[0-9a-f]{64}`), and
the local population is 0 rows, so nothing is measurable on the fixture. Graded **MINOR**: the
consequence stops at a studio learning a fact about itself. Named because it is the only place in
the wave where a definer reader surfaces a column a shipped ACL deliberately withholds, and a later
widening of either reader's gate would carry it.

Confidence: **high** on the fact (both column-grant lists and both reader bodies read off the live
catalogue and the file), **high** on the grade.

### `f2` — `w1b-report.md` §5 and §8 ask Fable to rule on a premise that is not true

`build/w1b-report.md:205-209` and `:611-613`.

The report tells Fable that `trade_rfq_tokens` and `plan_transmittal_tokens` "each carry a
`FOR ALL TO authenticated` studio-co-member policy that **cannot fire today**, because the SELECT
grant was never given. **Those policies are dead.** Granting SELECT would restore the posture they
plainly intend", and lists it first among "Two things for Fable to rule".

Measured as an ordinary studio member on a clean reset:

```
$ SELECT count(*) FROM public.trade_rfq_tokens;         → 0     (no error)
$ SELECT count(*) FROM public.plan_transmittal_tokens;  → 0     (no error)
```

Neither raises. The policies fire; the grant *was* given, column by column, on 8 and 9 columns
respectively. The premise is false for two of the four sources named, so the ruling as framed —
"grant SELECT to restore the intended posture" — asks Fable to do something already done, and would
in fact widen the ACL to the columns the shipped grant deliberately excludes (`created_by`,
`token_hash`). `m2` has carried this for four rounds as a documentation defect; it is re-filed here
because it is now load-bearing on a ruling Kody is being asked for, not just on a comment.

The report's sentence is true, unqualified, only of `studio_trade_agreement_tokens` and
`invoice_links`, which have RLS enabled with zero policies and are genuinely service-role-only.

Confidence: **high** on the fact, **high** on the grade (MINOR — it is wording that misroutes a
ruling, and no shipped behaviour depends on it).

---

## 4. Recorded, not findings

- **The behavioural change the deploy owns is unchanged and correctly stated** (`00626:109-123`):
  every carded human is `role='contact'`, `directory-view.tsx:294` filters exactly that role out,
  and `people-room.tsx:383` counts `all.length`, so the room reads oddly until W2 lands. One chain,
  rulings §6. Measured again this round: the feed renders `client 7 / lead 5 / sub 1` where the
  six-branch view rendered 22 field rows.
- **Two seats nest under no Directory row** (`Granite North`/`vendor`, `Karin Lindqvist`/`client`) —
  the dangles `00626:2019-2036` declares by design.
- **Grants, both directions.** Every new table carries `REVOKE ALL … FROM PUBLIC, anon,
  authenticated` followed by an explicit `GRANT`; every new function carries `REVOKE ALL … FROM
  PUBLIC, anon` and, where it is a trigger body or trigger-only helper, from `authenticated` too.
  `generate-legacy-grants.py` reproduces the committed seed byte for byte at 2724 statements.
- **`studio_contacts` has no DELETE grant for `authenticated`**, which closes a door I went looking
  for: `studio_compliance_documents.holder_id` is `ON DELETE CASCADE`, so a member-reachable card
  delete would take the firm's paper with it. It is not reachable. `project_parties.studio_contact_id`
  is `ON DELETE SET NULL`, and `studio_channel_consent` is keyed on the number and not on the card,
  so no card-shaped act can reach a consent record at all.
- **`projects.studio_id` stays effectively immutable from PostgREST** (r15's own check, re-confirmed
  by both of my seat-move walks landing on `party_card_project_has_no_studio`), so a member cannot
  move a project between two studios and strand its seats' stamps.

---

## 5. Summary

| # | severity | confidence | where |
|---|---|---|---|
| f1 | MINOR | high / high | `supabase/migrations/00627_access_grants_and_field_link_window.sql:145`, `:235` |
| f2 | MINOR | high / high | `artifacts/people-room-crm-2026-09-11/build/w1b-report.md:205-209`, `:611-613` |
| m14 | MINOR (BLOCKING mechanism, MINOR consequence — stated for Fable) | high / deliberate | `supabase/seed/people_crm_dev.sql:533-543`; `supabase/config.toml:88` |
| m15 | environment, not a branch finding | high | §0 — another session's `supabase db reset` on this worktree, third round running |
| p1, p3, p4, p5, n1–n9, m1–m13, m16–m19 | MINOR | carried from r13/r14/r15, all re-checked | §1 |

**CLEAN: zero BLOCKING, zero MAJOR.** Both r15 MAJORs fixed and independently re-walked with
sole-holder positive controls and a bypass hunt. Reset twice (both `EXIT=0`, 555 migrations, the
only `/error/i` line a filename), both suites green before and after, all six touched files replay
clean over a populated database with every trigger re-enabled, the dev seed replays twice with
stable counts, generated types show no drift across two runs, both type-checks pass, the grants seed
reproduces byte for byte, and every cross-tenant and consent-divergence sweep returned zero.
