# W1b — adversarial migration review, final run round 5

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`. Local Postgres only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).

**No prod act of any kind**: no `supabase db push`, no `supabase functions deploy`, no
`supabase link`, no Strata connection, no read of a Strata credential. Read in full:
`rulings.md` (all four sections, R-A…R-BC in §3), `synthesis/direction.md` §2.2/§3.8/§7/§8,
`synthesis/crm-model.md` §1/§2/§4/§5, `briefing/current-state.md` §B–§E, `build/inventory.md`,
`briefing/fixture.md`, `build/w1a-report.md`, `build/w1a-close-review-r6-migrations.md` and
`-tests.md`, `build/w1b-report.md`, `build/w1b-final-fix-log-r4.md`, and all five migrations
00623–00627 plus `supabase/seed/people_crm_dev.sql` and
`supabase/tests/people/w1b_compliance_authority_directory_test.sql`.

**Verdict: NOT clean — 1 BLOCKING, 3 MAJOR, 37 MINOR (32 carried and still open, 5 new; carried MINOR-11, MINOR-21 and MINOR-24 are closed this round).**

The four r4 MAJORs are all genuinely fixed and I re-walked each. But **r4 MAJOR-3's fix
traded a fail-open consent word for a cross-tenant phone-number oracle that answers over the
public REST API** (BLOCKING-1), and it closed only one of the three places the fail-open word
lives (MAJOR-1). r4 MAJOR-4's *consequence* — a dated consent claim printed beside a refusal —
is reachable again through `refusal_unanswered`, which `channel_consent_status()` folds into the
word and 00594's own backfill sets on `granted` rows (MAJOR-2).

---

## 0. Environment, before the destructive local act

```
$ ls /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build/apps/designer-portal/.env.local
"…/apps/designer-portal/.env.local": No such file or directory (os error 2)
```

The file does not exist in this worktree, so nothing in it can point at Strata — the
destructive-local guard is satisfied by absence, as r2/r3/r4 also found. Sole owner of the
local database, checked before resetting: no non-infrastructure session.

```
$ psql … -At -c "select current_database(), inet_server_addr(), inet_server_port();"
postgres|172.18.0.2|5432                       # the local supabase container, not Strata
```

Migration numbers: 00595–00620 untouched and reserved; 00621/00622 pre-existed on this branch
(the brief said "mint from 00622"; 00622 already exists, so W1b mints 00623–00627, which
`w1a-report.md` §8 also states). W2 mints from 00628.

---

## 1. What I ran

### 1.1 Legacy grants, regenerated first — no drift

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2713 replayed statements
$ git -C . diff --numstat -- supabase/seed/00-legacy-grants.sql
(nothing)
```

The committed file already matches the generator over 00623–00627's GRANT/REVOKEs.

### 1.2 Reset, twice

```
$ pnpm --dir …/agent-people-build supabase:reset
RESET1_EXIT=0
  … Seeding data from supabase/seed/people_crm_dev.sql...
  … Seeding data from supabase/seed/99-local-edge-settings.sql...
  Finished supabase db reset on branch main.
  {"target":"local","version":"","message":"Reset local database."}
$ grep -in error <log> | grep -vi _error   → (nothing)

$ pnpm --dir …/agent-people-build supabase:reset
RESET2_EXIT=0
$ grep -in error <log> | grep -vi _error   → (nothing)

$ psql … -At -c "select version from supabase_migrations.schema_migrations order by version desc limit 6;"
20260910152111 00627 00626 00625 00624 00623
```

### 1.3 The dev seed replays on an already-seeded database

```
$ psql … -v ON_ERROR_STOP=1 -f supabase/seed/people_crm_dev.sql
SEED_REPLAY_EXIT=0        # no ERROR line
```

### 1.4 Replay / idempotency — all five files applied TWICE in one rolled-back transaction

```
$ psql … -v ON_ERROR_STOP=1 -f <00623..00627 concatenated, then again>
REPLAY2X_EXIT=0           # no ERROR line; 46 "already exists, skipping" notices
```

### 1.5 Both people suites, and every shipped suite touching the changed objects

```
people/w1b_compliance_authority_directory_test   exit=0   12 blocks, "All W1b assertions passed."
people/w1a_identity_channels_consent_test        exit=0   "All W1a assertions passed."
field/field_links_test                           exit=0
rls/project_roster_test                          exit=0
rls/sms_tables_test                              exit=0
rls/studio_contacts_backfill_test                exit=0
document/lead_contact_phone_test                 exit=0
rls/00584_studio_comember_rls_sweep.test         exit=0
rls/people_directory_scope_test                  exit=3  ERROR: FAIL a2: expected exactly 12 columns, got 17
rls/field_parties_test                           exit=3  ERROR: consent_legacy_column_frozen
site_requests/security_and_lifecycle_test        exit=3  ERROR: send must transition not_asked consent to pending
commercial/trade_rfq_test                        exit=3  ERROR: design services agreement d9300000-… not found
```

The same four reds, same messages, as r3 and r4 measured — MINOR-27 and MINOR-28, both still
open. **No new red.**

### 1.6 Generated types and type-checks

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir … db:generate
GEN_EXIT=0
$ git -C . diff --numstat -- packages/supabase/src/database.types.ts
(nothing)                 # the committed types already match the applied schema
$ … db:generate           # run a second time
GEN2_EXIT=0 ; git diff → (nothing)      # NO DRIFT between two runs

$ pnpm --dir … --filter @patina/supabase        type-check    SUPABASE_TC=0
$ pnpm --dir … --filter @patina/designer-portal type-check    DESIGNER_TC=0
```

### 1.7 My own probes

Written to `build/`, with their `.out` beside them:

| Probe | What it walks |
|---|---|
| `probe105-w1b-final-r5-cross-tenant-numbers.sql` | BLOCKING-1 at the SQL level, with the r4 control that passes |
| `probe106-w1b-final-r5-postgrest-cross-tenant.py` | BLOCKING-1 over `/rest/v1/rpc/`, with the view controls |
| `probe107-w1b-final-r5-consent-fail-open-side-studio.sql` | MAJOR-1, both call sites, with the owner control |
| `probe108-w1b-final-r5-folded-refusal-dates.sql` | MAJOR-2, the folded refusal's dates |
| `probe109-w1b-final-r5-side-studio-sensitive.sql` | MAJOR-3, the site access card read AND written cross-studio |
| `probe110-w1b-final-r5-lapse-doors-and-window.sql` | MINOR-31/MINOR-36 and `compliance_state`'s 30-day boundaries |
| `probe111-w1b-final-r5-field-link-branches.sql` | all seven `create_field_link` expiry branches + 00284's guard |
| `probe112-w1b-final-r5-pr-n-by-role.sql` | PR-n as a plain member, including scope escalation, and as the owner |
| `probe113-w1b-final-r5-duplicate-firm-row.sql` | MINOR-37, one firm on two Directory rows |
| `probe114-w1b-final-r5-objects-and-access.sql` | relations, policies, grants, function postures, column order, the freeze trigger, the backfill |
| `probe115-w1b-final-r5-access-grant-base-rls.sql` | the RLS posture of every `v_access_grants` base table read without a view predicate |

---

## 2. Migration rules — pass/fail

| Rule | Verdict |
|---|---|
| Hand-numbered `NNNNN_slug.sql` | PASS — 00623…00627, no `supabase migration new` timestamps |
| Grep-winner before redefining | PASS — checked all 19 functions and 3 views; every winner is the file being edited, except `create_field_link`, whose winner is `00284:37` and whose guard/supersede I diffed line by line against 00627:426-442 and :481-484 (identical) |
| Banner + lineage | PASS — every file carries a banner; 00626 names r1…r4 fix rounds, 00623 names the four supersede doors, 00627 names `00283:86 → 00284:37 → this file` |
| Idempotent | PASS — §1.4, double replay exit 0; named DROP-then-ADD CONSTRAINT idiom throughout |
| RLS in the same file | PASS — 00623, 00624, 00625 each enable RLS and create their four policies inline |
| Explicit grants both directions + REVOKE FROM PUBLIC, anon | PASS with three carried exceptions — every new **table** does `REVOKE ALL … FROM PUBLIC, anon, authenticated` then grants; `people_directory` alone restates `GRANT SELECT` with **no REVOKE** (00626:1196, MINOR-7), and `people_directory_seats` / `v_access_grants` revoke from `PUBLIC, anon` but **not** `authenticated` (00626:1312, 00627:399, MINOR-34). Measured consequence on a local stack: `relacl` shows `anon=arwdDxtm` on `people_directory` and `authenticated=arwdDxtm` on all three — the `00-legacy-grants.sql` blanket survives the partial REVOKE. All three views are non-updatable (UNION / window function), so no write actually lands |
| SECURITY DEFINER pins search_path | PASS — all 9 definer functions show `search_path=public` (or `public, extensions, pg_temp` for the two `create_field_link` bodies) |
| `party_identity_key` / `party_kind_in_directory` pin search_path | FAIL (MINOR-33, carried) — `proconfig` is NULL on both; every other new function pins |
| Schema-qualify extension fns | PASS — `extensions.gen_random_bytes`, `extensions.digest` (00627:486-487) |
| Guarded crons | N/A — no cron in this wave |
| CHECK over enum | PASS — `stage`, `site_access_mode`, `contracted_through`, `doc_type`, `blocks`, `scope` are all named CHECKs |
| Money integer cents | PASS — `threshold_cents integer` with `>= 0` (00624:305, :327-328); the fixture's $2,500 is `250000` |
| Regenerate `00-legacy-grants.sql` | PASS — §1.1, no drift |
| Apply with `supabase:reset`, twice | PASS — §1.2 |
| `db:generate` | PASS, no drift between runs — §1.6 |
| Probe objects, never the ledger | PASS — every probe reads `pg_class`/`pg_policy`/`pg_proc`/`information_schema` and the views; nothing reads `supabase_migrations.schema_migrations` except the one head check the brief asks for |

### 2.1 The RLS predicates the brief names

```
studio_compliance_documents  ×4   is_active_studio_member(organization_id)      ✓ (the studio_contacts family)
project_party_authority      ×4   is_studio_comember(project_party_designer(engagement_id))  ✓ (the project_parties family)
                                  + PR-n: … AND (scope NOT IN ('money','draw_certify')
                                                 OR is_org_admin_or_owner(project_party_org(engagement_id)))
                                  on INSERT/UPDATE/DELETE, not on SELECT              ✓
project_site_access_cards    ×4   is_studio_comember(project_designer(project_id))     ✓ no client leg
```

Probe 2: `code_like_columns = 0` over `gate_code|code|access_code|lockbox_code|show_to_client`
on `project_site_access_cards` — **PR-r holds, there is no code column and no client toggle.**

PR-n walked as three roles (`probe112`, and suite block 5):

```
plain member (member=t admin=f)
  selections   -> lands
  money        -> REFUSED  new row violates row-level security policy (42501)
  draw_certify -> REFUSED  new row violates row-level security policy (42501)
  UPDATE selections -> money -> REFUSED (42501)      ← the escalation door is closed too
owner        money -> LANDED
non-member   reads 0 authority rows
```

### 2.2 Cross-tenant — one hole, and it is BLOCKING-1

As a genuine foreign studio's owner (`cf100000-…-0001`, owner of Phase One Synthetic Studio and
nothing else; `member_of_the_victim_studio = f`), `probe105`/`probe109`:

```
victim_seats_visible 0 · victim_cards_visible 0 · victim_directory_rows 0 · victim_seat_rows 0
studio_compliance_documents 0 · project_party_authority 0 · project_site_access_cards 0
v_access_grants: studio_member 1 (their own membership row only)
access_grants_trade_rfq / _trade_agreement_links / _plan_transmittals / _invoice_links: 0 each
compliance_state(a foreign card)      -> not_on_file
identity_paper_state(foreign, foreign)-> not_on_file
contact_rule_summary(foreign)         -> (null)
identity_seat_count(foreign)          -> 0
reach_state_for(NULL, foreign, NULL)  -> on_paper
identity_consent_status(my org, a foreign card) -> not_asked
identity_consent_evidence(…)          -> 0 rows
anon: project_site_access_cards / people_directory_seats / v_access_grants / identity_phone_numbers
      -> permission denied, at the GRANT, before any policy runs
a CLIENT account (client@patina.dev): compliance 0 · authority 0 · seats 0 · grants 0 · site access 0
```

Every one of those is right. **`identity_phone_numbers()` is the exception** — see BLOCKING-1.

### 2.3 `v_access_grants` — the eleven sources

Seven tiers are named in the view's own text (`client_account, doc_share, evidence_upload,
field_link, project_review, site_request, studio_member`); the other four
(`rfq_link, agreement_link, plan_link, invoice_pay`) sit inside the four definer readers, which
is the correct shape — a `security_invoker` view checks the CALLER's table privileges at plan
time and `trade_rfq_tokens`, `studio_trade_agreement_tokens`, `plan_transmittal_tokens` and
`invoice_links` have `auth_sel = f`. Measured:

```
relname                             rls  policies  auth_sel  anon_sel
organization_members                 t      7         t         t      ← 3 SELECT policies, all membership-scoped
designer_clients                     t      4         t         t
field_link_tokens                    t      2         t         t
document_shares                      t      1         t         t      ← is_design_studio_comember via proposals
site_request_access                  t      1         t         f      ← is_studio_comember via site_requests→projects
fulfillment_evidence_upload_tokens   t      2         t         f      ← admin role, + agent_reader USING true (pre-existing, and
                                                                          v_access_grants is not granted to agent_reader)
project_review_access                t      1         t         f
trade_rfq_tokens                     t      1         f         f
studio_trade_agreement_tokens        t      0         f         f      ← service-role-only by design
plan_transmittal_tokens              t      1         f         f
invoice_links                        t      0         f         f      ← service-role-only, plaintext token
```

No bearer credential is in the view: `grant_ids_that_look_like_a_hash = 0`, `invoice_pay` keys on
the row uuid, `evidence_upload` on `md5(token)`. The five branches that carry no view predicate
all sit on a base table whose own RLS is membership- or designer-scoped, and the foreign-owner
read returns only that owner's own membership row.

### 2.4 The stage/window backfill

```
 status    | stage       | count
 active    | active      |    13
 active    | awarded     |     9
 active    | no_response |     1
 active    | off_job     |     1
 completed | warranty    |     7     ← the backfill: close inside twelve months
```

Guarded by `stage = 'active'` so a rerun cannot overwrite a hand-moved stage (MINOR-10 notes the
guard cannot protect a *deliberate* `active`; carried). `assert_project_party_cards_trg` fires on
`{project_id, company_id, warranty_contact_person_id}` only, so the backfill does not trip it.

### 2.5 `create_field_link` — every branch, walked

`probe111`, as the owning designer, today = 2026-09-12:

```
A live window + caller date 5d out     -> 2026-10-23 (today+41)   ← window+1d wins; caller date IGNORED (MINOR-1, open)
B window + warranty (later of two)     -> 2027-10-18 (today+401)  ← PR-l's later-of-two
C closed window                        -> 2026-12-11 (today+90)   ← r1 MAJOR-1's fix holds
D no window + caller date 7d           -> 2026-09-19 (today+7)
E no window, no caller date            -> 2026-12-11 (today+90)
F warranty only                        -> 2027-04-01 (today+201)
G off_job seat                         -> 2026-12-11 (today+90)   ← a fresh door for a seat off the job (MINOR-20, open)
X3 a non-owning studio member          -> REFUSED insufficient_privilege   ← 00284's guard intact
```

`field_link_window_closed` (00627:473-479) remains **unreachable**: the `CASE` ends
`ELSE now() + interval '90 days'`, which is never NULL and never `<= now()` (MINOR-29, open).

### 2.6 Consent — record-only (R-AY/R-AW) holds at the source level

```
$ grep -n "INSERT INTO public.studio_channel_consent|UPDATE public.studio_channel_consent|record_channel_consent" 0062[3-7]*.sql
(nothing)                                        # the five migrations write no consent anywhere
$ psql … functions of this wave reading a frozen sms_consent_* / sms_consented_at / sms_opt_out_at column
0
$ psql … views reading pp.sms_consent* / .sms_consented_at / .sms_opt_out_at
people_directory f | people_directory_seats f | v_access_grants f | v_project_roster f
$ the freeze trigger's column list, unchanged:
refuse_legacy_consent_write_trg {phone, phone_e164, sms_consent_status, sms_consented_at,
  sms_opt_out_at, sms_consent_source, sms_consent_evidence, sms_consent_recorded_at,
  sms_consent_recorded_by, sms_consent_disclosure_version}
  # none of 00624's ten new columns is on it, and the suite's block 11 walks both halves
```

That is why MAJOR-1 and MAJOR-2 are MAJOR and not BLOCKING: no text can go out on a softened
word — the send rail reads `studio_channel_consent` with the service role — and no consent
evidence is destroyed or overwritten by anything in this wave.

### 2.7 `compliance_state` — the window and the worst-first order

```
expires yesterday   -> lapsed
expires today       -> lapses_soon          ← "lapses today" is not yet lapsed, correct
expires CURRENT_DATE+30 -> lapses_soon      ← the 30-day boundary, inclusive
expires CURRENT_DATE+31 -> current
a gateless lapse    -> current              ← CS2 §4, "a date with no gate changes nothing"
no paper at all     -> not_on_file
```

The four supersede doors r1/r2/r3/r4 found are all closed and I re-walked the r4 one
(`compliance_successor_undated` now keys on `NEW.expires_on IS NOT NULL AND v_succ_expires IS
NULL`, 00623:353, and `compliance_successor_already_lapsed` on `v_succ_expires IS NOT NULL AND
v_succ_expires < CURRENT_DATE`, 00623:414 — no `doc_type` list on either leg).

---

## 3. r4's four MAJORs — all closed, and re-walked

| Finding | Status | Evidence |
|---|---|---|
| r4 MAJOR-1 — the FOURTH supersede door (an undated successor retiring a dated gating lapse for the four non-dated types) | **FIXED** | Both legs key on the paper's own date (00623:353, :414), no `doc_type` enumeration. Suite block 2 legs `2h`, `2h1`, `2r0`–`2r4` pass; the CHECK keeps its five-type list for the different question it answers (00623:169-172), and the banner now says why |
| r4 MAJOR-2 — a person's own gating lapse invisible whenever they carry a firm | **FIXED** | `identity_paper_state(card, firm)` (00626:449-472) reduces worst-first over both holders, `not_on_file` last; called from all three sites (00626:966, :1134, :1277). Closes carried MINOR-11 with it. Fixture unchanged: the four paper words still read `Marrow & Sons current / Northgate Electric lapsed / Lakeshore Painting Co. lapses_soon / Great Northern Bank not_on_file` |
| r4 MAJOR-3 — `identity_consent_status()` failed open under RLS | **FIXED for the case it names, and only for that case.** The number set is now the gated definer `identity_phone_numbers()` (00626:535-560) and an RLS-invisible seat no longer drops its refusal. **But the gate it added is the hole in BLOCKING-1, and the same fail-open survives at two other call sites — MAJOR-1** |
| r4 MAJOR-4 — the word and the dates came off different numbers | **FIXED as stated.** `identity_consent_evidence()` (00626:701-727) takes both dates off the deciding record; the party branch's `LEFT JOIN studio_channel_consent … ON scc.channel_value = pp.phone_e164` is gone, replaced by one `LEFT JOIN LATERAL` (00626:1036-1037). **But the same consequence is reachable through `refusal_unanswered` — MAJOR-2** |

### The 35 carried MINORs, re-checked

| ID | Status this round |
|---|---|
| MINOR-1 (a caller date cannot beat a live window) | **OPEN** — §2.5 leg A: asked for 5 days, got 41 |
| MINOR-2 (one `blocks` UPDATE or DELETE moves a holder from `lapsed` to `current`, no audit) | **OPEN** — walked, and now with two more one-write variants: new MINOR-36 |
| MINOR-3 (the eleven tiers are not crm-model §2's eleven) | OPEN (11 named, 3 populated locally) |
| MINOR-4 (four branches carry a LINK id as `subject_id`) | OPEN (00627:163, :198, :288, :352-355) |
| MINOR-5 (`project_review.granted_by = pra.revoked_by`) | OPEN (00627:375) |
| MINOR-6 (`client_account.last_used_at = dc.last_contacted_at`) | OPEN (00627:258) |
| MINOR-7 (`people_directory` restates GRANT with no REVOKE) | **OPEN** (00626:1196). Measured: `relacl` `anon=arwdDxtm/postgres`. Local-only (the blanket seed); the view is `security_invoker` and as `anon` it raises `permission denied for table studio_contacts` |
| MINOR-8 (`site_access_mode` vocabulary carries `code` in the no-code wave, and is nullable) | OPEN (00624:121-124) |
| MINOR-9 (stage vocabulary drift; `invited`/`mobilized`/`retired` have no display word in direction §3.8's nine) | OPEN (00624:110-116); the twelve match crm-model §5's ladder minus Repeat |
| MINOR-10 (the backfill guard cannot protect a hand-set `active`) | OPEN (00624:283-292) |
| MINOR-11 (three formulas for the paper word) | **CLOSED** by r4 MAJOR-2's `identity_paper_state()` |
| MINOR-12 (two ungated definer oracles: `project_party_org`, `project_designer`) | **OPEN** — both `definer`, no membership predicate, EXECUTE to `authenticated`. They return a uuid; BLOCKING-1 is the same shape returning PII |
| MINOR-13 (`studio_id IS NULL` projects fall back to `_primary_studio_for`) | **OPEN and now measured**: 5 of 8 local projects carry `studio_id IS NULL`, and all five resolve to `e1c06557…` (Leah Hartwell) rather than to Local Dev Studio. The resolver can name a studio that is not the one doing the work |
| MINOR-14 (`v_window_end::timestamptz` is session-timezone-dependent) | OPEN (00627:464-466) |
| MINOR-15 (`w1b-report.md` says `use-party-sms.ts:133` is the only call site) | **OPEN** — `supabase/functions/_shared/sms.ts:565` is the second |
| MINOR-16 (`people_crm_dev.sql` in `[remotes.staging.db.seed]`) | OPEN (`config.toml:60`, `:88`) |
| MINOR-17 → MINOR-26 (`w1b-report.md` stale) | **OPEN AND WORSE AGAIN** — see MINOR-35 |
| MINOR-18 (00626's comment claims a degrade `field_link_tokens`' policy prevents) | OPEN (00626:80-89) |
| MINOR-19 (the dev seed's `ON CONFLICT DO UPDATE` leaves a mixed evidence set) | OPEN, service-role-only |
| MINOR-20 (no stage check on the mint) | **OPEN** — §2.5 leg G: an `off_job` seat is handed a fresh 90-day door |
| MINOR-21 (no test legs for r2's three MAJORs) | CLOSED (r3) |
| MINOR-22 (`access_grants_trade_agreement_links` gates on `ag.contact_id` and labels with `a.contact_id`) | OPEN (00627:128 vs :135). 00579:637 mints the token with `v_agreement.contact_id`, so the two agree unless the service role writes otherwise |
| MINOR-23 (`identity_seat_count` reads under `project_parties`' policies, the seats view under three legs) | OPEN; still 0 disagreements on the fixture (`rows_claiming_more_than_they_nest = 0` over all 62 rows) |
| MINOR-24 (a client-branch row can never nest a seat) | CLOSED (promoted to r3 MAJOR-2, fixed — `0::integer` on all four branches) |
| MINOR-25 (`verified_by` is an unconstrained `profiles` FK) | OPEN (00623:103) |
| MINOR-26 (the consent DATES are absent from every carded human's row) | **OPEN, re-measured**: `carded_rows_with_a_word = 49`, `rows_carrying_a_date = 0`. R-BC permits "left empty", so this is compliant with the ruling and stays MINOR |
| MINOR-27 (`people_directory_scope_test.sql`'s stale column count) | **OPEN** — still `ERROR: FAIL a2: expected exactly 12 columns, got 17`, exit 3. One line, `12` → `17` |
| MINOR-28 (W1a's two reds plus the unrelated `trade_rfq_test`) | **OPEN** — same three, same messages, §1.5 |
| MINOR-29 (`field_link_window_closed` is unreachable and its COMMENT promises a refusal) | **OPEN** — §2.5 |
| MINOR-30 (the five appended columns' cost against a `select('*')` room) | OPEN; see new MINOR-38 for a measured amplifier |
| MINOR-31 (`blocks` is not in the trigger's `UPDATE OF` list, so the r3 invariant holds at one instant) | **OPEN and walked**: as a member, one `UPDATE … SET blocks = '{}'` on Northgate Electric's 2026-03-31 gating lapse moved the word `lapsed → current` |
| MINOR-32 (`project_parties.studio_contact_id` has no same-studio guard, while the two pointers 00624 adds do) | **OPEN** — `grep "studio_contact_id" migrations/*.sql \| grep -i "assert\|RAISE"` returns only 00593's unrelated identity-stability trigger |
| MINOR-33 (`party_identity_key` and `party_kind_in_directory` pin no `search_path`) | **OPEN** — `proconfig` NULL on both; every other new function shows `search_path=public` |
| MINOR-34 (the two new views revoke from `PUBLIC, anon` but not `authenticated`) | **OPEN and measured** — `relacl` `authenticated=arwdDxtm/postgres` on both, from the local blanket seed. Both views are non-updatable, so no write lands |
| MINOR-35 (`w1b-report.md` is the record of an old code state) | **OPEN AND WORSE — now FIVE rounds stale.** `grep -c` over the report: `identity_paper_state` 0, `identity_phone_numbers` 0, `identity_consent_status` 0, `identity_consent_evidence` 0, `reach_state_for_identity` 0, `party_kind_in_directory` 0, `compliance_successor_undated` 0, `compliance_successor_already_lapsed` 0, `compliance_successor_drops_a_gate` 0, `compliance_successor_already_superseded` 0, `field_link_window_closed` 0. And `w1b-report.md:131` still describes r4 MAJOR-2 **as a feature**: "`paper_state` \| `compliance_state(COALESCE(company_id, id))` — the FIRM's paper for a person, the card's own for a firm and for a sole proprietor". A reader who trusts it will believe the wrong things about four of the five migrations |

---

## 4. Findings

### BLOCKING-1 — `identity_phone_numbers()` is a cross-tenant phone-number oracle, answering over the public REST API to any authenticated member of any studio

**File:** `supabase/migrations/00626_people_directory_v4_seats.sql:535-560`
**Confidence:** CONFIRMED (walked in SQL and over HTTP)

r4 MAJOR-3's fix lifted the consent reduction's number set into a `SECURITY DEFINER` function.
Its only gate is:

```sql
-- 00626:546-559
  SELECT n.v FROM (
    SELECT NULLIF(btrim(COALESCE(p_card_phone_e164, '')), '') AS v
     WHERE public.is_active_studio_member(p_organization_id)
    UNION
    SELECT NULLIF(btrim(COALESCE(pp.phone_e164, '')), '')
      FROM public.project_parties pp
     WHERE public.is_active_studio_member(p_organization_id)
       AND p_identity_key IS NOT NULL
       AND public.party_identity_key(
             pp.studio_contact_id, pp.profile_id,
             pp.phone_e164, pp.email, pp.id
           ) = p_identity_key
  ) n
  WHERE n.v IS NOT NULL;
```

**`p_organization_id` and `p_identity_key` are BOTH caller-supplied, and the seat leg has no
organization predicate at all.** The gate therefore proves that the caller belongs to the studio
they *named*, and says nothing about the studio the rows belong to. Inside the view
`p_organization_id` is derived from the row, so the view path is constrained — but the function
carries `GRANT EXECUTE … TO authenticated` (00626:564-565) and lives in `public`, so PostgREST
serves it directly.

Walked as `cf100000-…-0001`, owner of Phase One Synthetic Studio and a member of nothing else
(`probe105-w1b-final-r5-cross-tenant-numbers.out`):

```
 acting_as cf100000-…-0001 | member_of_my_own_studio t | member_of_the_victim_studio f

 victim_seats_visible 0 · victim_cards_visible 0 · victim_directory_rows 0 · victim_seat_rows 0

=== THE LEAK: my own org id + a FOREIGN identity key (a login) ===
 identity_phone_numbers
 +16125559871

=== THE LEAK: my own org id + a FOREIGN rolodex card uuid ===
        which        |      v
 Adaeze Okonkwo card | +16125550104
 Amara Osei card     | +16125550116

=== the existence oracle on a guessed number ===
 a number seated in the victim studio (+16125550219) | 1
 a number seated nowhere (+19995550000)              | 0

=== the CONTROL the r4 round ran, which passes: the victim org id refuses ===
 numbers_when_I_name_the_victim_org 0
```

And over the API (`probe106-w1b-final-r5-postgrest-cross-tenant.out`), with a locally minted
HS256 JWT for the same user:

```
a FOREIGN rolodex card (Adaeze Okonkwo)       -> HTTP 200 ["+16125550104"]
a FOREIGN rolodex card (Amara Osei)           -> HTTP 200 ["+16125550116"]
GET people_directory             -> HTTP 200 []
GET people_directory_seats       -> HTTP 200 []
GET project_site_access_cards    -> HTTP 200 []
```

The three views correctly return `[]` to the foreign tenant; the RPC hands over the numbers.

**Failure scenario.** A designer at studio B, holding a Patina login and any active membership,
POSTs to `/rest/v1/rpc/identity_phone_numbers` with `p_organization_id` = their own studio and
`p_identity_key` = a `studio_contacts` uuid, a `profiles` uuid, an email address or a phone
number belonging to studio A. They receive the `phone_e164` of every `project_parties` seat on
the platform keyed to that identity — a trade's mobile number, from a studio they have no
relationship with — plus a yes/no oracle on any number or login ("is this person seated
anywhere"). Nothing in the rolodex, the Directory, the seats view or the site access card leaks;
this one function does.

This is new in W1b: before r4 the reduction was `SECURITY INVOKER` over an RLS-filtered scan, so
no cross-tenant read existed. The fix traded a fail-open word for a cross-tenant read.

**Fix.** The seat leg must be scoped to the studio it is answering for, not to the studio the
caller names — e.g. join `projects` and require
`public.project_consent_org(pp.project_id) = p_organization_id` (or
`is_active_studio_member(public.project_consent_org(pp.project_id))`), which is exactly the
population the record it feeds is read at (R-AK). Note that this **will** fail suite leg `4e8`
(`w1b_compliance_authority_directory_test.sql:1283`), whose premise is a refusal recorded at
studio B on a number only a studio-A seat carries — the r4 fix log names that leg as the reason
it did not narrow the scan. That leg's shape is itself only constructible through the
cross-studio read, so it should be re-stated rather than preserved: with the scan narrowed, the
number is not one studio B holds, and `not_asked` is the honest word for it. A narrower
alternative that keeps 4e8: leave the scan wide but **revoke EXECUTE from `authenticated`** and
make the function callable only from the views (`service_role` + the view owner), which removes
the oracle without changing any word the room prints.

---

### MAJOR-1 — the consent word still fails OPEN at two call sites: a caller who can see the seat but is not a member of the seat's consent studio reads `not_asked` over a record that says `opted_out`

**Files:** `supabase/migrations/00626_people_directory_v4_seats.sql:1001-1003` (the Directory's
party branch) and `:1270-1272` (`people_directory_seats.consent_status`)
**Confidence:** CONFIRMED

r4 MAJOR-3's own standard was "as authoritative as the verdict it reduces". It is met only
*inside the membership set*, and seat **visibility** is a different, wider set:

- visibility (00626:1028-1030, :1288-1290) is
  `is_studio_comember(pj.designer_id) OR …lead_designer_id OR …created_by` — the brief's own
  predicate, satisfied by sharing **any** active organization with the designer of record;
- the consent word is resolved at `project_consent_org(project_id)` and both paths COALESCE an
  unreadable record to a **word**:
  - party branch: `COALESCE(identity_consent_status(project_consent_org(q0.project_id), …), 'not_asked')`
    — `identity_phone_numbers`' gate returns no numbers to a non-member, so the reduction is over
    the empty set → NULL → `'not_asked'`;
  - seats view: `COALESCE(channel_consent_status(project_consent_org(pp.project_id), 'sms', pp.phone_e164), 'not_asked')`
    — `studio_channel_consent`'s member-only RLS returns 0 rows → NULL → `'not_asked'`.

So "I may not read the record" is rendered as the affirmative verdict "Not asked", which is the
exact softening direction the wave declared unsafe for consent (00626:511-513: *"The INVOKER
degrade is only safe where the failure direction is safe … and is not true of consent."*).

The shape needs no contrivance: **`designer@patina.dev` owns both "Local Dev Studio" and "Leah
Hartwell" in the shipped local seed.** One ordinary member of the second org
(`probe107-w1b-final-r5-consent-fail-open-side-studio.out`):

```
=== the record, as postgres ===
 b0000000-…-0001 | +16125550112 | opted_out | verdict opted_out
 b0000000-…-0001 | +16125550219 | opted_out | verdict opted_out

 comember_of_the_designer t | member_of_local_dev_studio f
 seat_rows_they_read 31

=== the word they read, over a record that says opted_out ===
  display_name   | role | status_raw | consent_status | meta_word
 Rivera Finishes | sub  | not_asked  | not_asked      | not_asked
  display_name   |  phone_e164  | consent_status
 Pete Rusk       | +16125550112 | not_asked
 Pete Rusk       | +16125550112 | not_asked
 Rivera Finishes | +16125550219 | not_asked

=== the control: the OWNER of Local Dev Studio reads the record honestly ===
 Rivera Finishes | contact | active     | opted_out
 Rivera Finishes | sub     | opted_out  | opted_out
 Pete Rusk       | +16125550112 | opted_out    (×2)
 Rivera Finishes | +16125550219 | opted_out
```

MINOR-13 makes the same gap reachable from the other side: 5 of 8 local projects carry
`studio_id IS NULL` and `project_consent_org()` resolves them to `e1c06557…`, so the record is
looked up in a studio that may not be the one whose members are reading.

**Failure scenario.** A designer who consults for two studios adds a colleague to the second
one. That colleague opens the People room, sees the first studio's 31 seats, and every one of
them reads "Not asked" — including the two Pete Rusk seats whose number the first studio
recorded as `opted_out`. `party-profile-sheet.tsx:262` computes its send affordance from that
word and `:742` opens the composer on it, so the room invites a text to a refused number. No
text goes out (the rail reads the record with the service role), which is why this is MAJOR and
not BLOCKING — but the Call Sheet and the person card's seat region are W2's readers of exactly
this column.

Note the party-branch half is **carried** from 00594:1350-1353, which already COALESCEd the same
way; the `people_directory_seats` half is **new in this wave** (00626:1270-1272) and was not
touched by r4's fix.

**Fix.** Do not turn an unreadable record into a word. Either (a) drop the COALESCE and let the
column be NULL — "no word", which R-V already has a line for — or (b) require
`is_active_studio_member(public.project_consent_org(pp.project_id))` alongside the
`is_studio_comember` visibility leg on both the party branch and the seats view, so a caller who
cannot read the record does not see the seat either. (b) also closes MAJOR-3.

---

### MAJOR-2 — the Directory row composes a dated consent claim over a refusal again, this time through `refusal_unanswered`

**File:** `supabase/migrations/00626_people_directory_v4_seats.sql:701-727` and `:948-949`
**Confidence:** CONFIRMED

r4 MAJOR-4's stated consequence was: *"the walked row printed consent_status `opted_out` with
sms_consented_at 2025-05-02 and sms_opt_out_at NULL … composed from that row it read 'Written
consent, 2 May 2025' for a human the record refuses."* `identity_consent_evidence()` now takes
both dates from the record whose verdict **won**, which is R-BC and is correct. But
`channel_consent_status()` (00594:1016) folds `refusal_unanswered` **into** the word:

```sql
SELECT CASE WHEN scc.refusal_unanswered IS TRUE THEN 'opted_out' ELSE scc.status END
```

and 00594's own backfill (00594:658-690) deliberately mints records that are `granted` *and*
carry an unanswered refusal — its comment says so: *"INCLUDING a winner whose status reads
`granted`"* — with a real `consented_at` and, because *"a folded `opted_out` row is routinely
DATELESS"*, frequently no `opt_out_at`. The deciding record is then internally contradictory and
the view reproduces it faithfully (`probe108-w1b-final-r5-folded-refusal-dates.out`):

```
=== the record ===
 +16125559301 | granted | refusal_unanswered t | consented_at 2025-05-02 | opt_out_at (null) | verdict opted_out

=== the Directory row the room renders ===
     display_name     | consent_status | meta_word |     sms_consented_at      | sms_opt_out_at
 Folded Refusal Trade | opted_out      | opted_out | 2025-05-02T00:00:00+00:00 |

=== identity_consent_evidence, which is R-BC-correct and still yields it ===
 +16125559301 | 2025-05-02 00:00:00+00 | (null)
```

**Failure scenario.** A studio's backfilled record for a trade folds a dateless refusal onto a
`granted` row. The rail refuses the number (correct). The Directory row carries the word
`opted_out` with `sms_consented_at` set and `sms_opt_out_at` empty, and R-Q's one fixed sentence
— "*\<Source\> consent, \<d Mon yyyy\>, on the \<project\>*" — has a source, a date and a
project to compose from. The studio reads "Written consent, 2 May 2025" beside a refusal, which
is G-3's defect verbatim. The local fixture has `refusal_unanswered` false on all 7 records, so
no test or probe in the wave touches this population; on Strata the 00594/00622 backfill creates
it.

**Fix.** One-sided, in the view or in `identity_consent_evidence()`: when the deciding verdict is
`opted_out`, project no `consented_at` (the grant it names has been answered by a refusal), and
when it is not `opted_out`, project no `opt_out_at`. The dates then cannot compose a clause the
word contradicts. R-BC is unaffected — the dates still come from the deciding record, or are left
empty, which R-BC explicitly permits.

---

### MAJOR-3 — the wave's most sensitive new objects sit behind `is_studio_comember(designer)`, which is not tenant-scoped: another studio's member reads AND writes the site access card

**Files:** `supabase/migrations/00625_project_site_access_cards.sql:183-208`,
`supabase/migrations/00624_project_party_window_and_authority.sql:431-485`,
`supabase/migrations/00626_people_directory_v4_seats.sql:1288-1290`
**Confidence:** CONFIRMED

`studio_compliance_documents` is genuinely tenant-scoped — `is_active_studio_member(organization_id)`
— and probes correctly. The other three new surfaces are scoped through the **designer**, and
`is_studio_comember(p_owner)` is true whenever the caller shares *any* active organization with
that owner. With `designer@patina.dev` in two orgs in the shipped local seed, one ordinary member
of the second org gets the first org's card — read and write
(`probe109-w1b-final-r5-side-studio-sensitive.out`):

```
 comember_of_the_designer t | member_of_local_dev_studio f

=== org-scoped tables: correctly closed ===
 studio_compliance_documents        0
 people_directory contacts branch   0

=== designer-scoped (is_studio_comember) tables: open ===
 project_party_authority     11
 people_directory_seats      31
 project_site_access_cards    1

=== the site access card itself ===
 lockbox_version "Lockbox, version 3" | alarm_ref "Sentry Alarm, account 88-4412"
 site_hours "Weekdays 07:00 to 17:00. No Saturday work before 09:00."
 key_holder_engagement_id d0e30000-…-0006 | emergency_lines 6 | told 4

=== and the authority grants, with their money thresholds ===
 change_order 250000 | money 250000 | draw_certify | key | selections | site_access …

=== can they WRITE, too? ===
NOTICE:  UPDATE landed on 1 row(s) — write is open as well
```

**Failure scenario.** A studio brings in an outside designer who also works for another studio.
Every member of that other studio can now read the lockbox version, the alarm account, the site
hours, the key holder and six emergency lines for this studio's job, and can change the lockbox
version — and can read every authority grant including the $2,500 money line. Direction §7 rates
`project_site_access_cards` risk **High** and calls it "the first genuinely sensitive text in the
room"; PR-w rules it studio-only.

**On severity.** Under the brief's literal BLOCKING wording ("any cross-tenant read or write")
this qualifies, and I am flagging that explicitly rather than deciding it. I graded it MAJOR
because `is_studio_comember` is the predicate the brief names for this family, the predicate
direction §7 specifies for this table, and the predicate `project_parties` itself has carried
since 00420/00584's shipped sweep — so this is the platform's definition of "the studio", not a
slip in these five files. **Fable's call whether to promote it.** PR-w (§2) rules out a client
branch and says nothing about which studio predicate, so tightening it reopens no ruling.

**Fix.** One extra conjunct on the three site-access policies and the four authority policies,
and one on the seats view's WHERE:
`AND public.is_active_studio_member(public.project_consent_org(project_id))`. Verified safe
against the fixture: every seeded project that carries the card resolves to
`b0000000-…-0001`, of which both the owner and the admin are active members. (MINOR-13's five
`studio_id IS NULL` projects would resolve through `_primary_studio_for`, which is the separate
carried finding.)

---

### MINOR findings

| ID | Finding | Where | Evidence |
|---|---|---|---|
| MINOR-1 … MINOR-35 | **All carried from r2/r3/r4, statuses in §3** — 32 still open; MINOR-11 (closed by r4 MAJOR-2), MINOR-21 and MINOR-24 are closed; MINOR-35 is worse again | see §3 | see §3 |
| MINOR-36 | **NEW. Two more one-write paths from `lapsed` to `current`, beside MINOR-2/MINOR-31, both permitted by `assert_compliance_holder()`.** (a) **Reparent**: `UPDATE studio_compliance_documents SET holder_id = <another firm card in the same studio>` on Northgate Electric's 2026-03-31 gating COI — the trigger fires (holder_id is in its `UPDATE OF` list) but only checks kind and org, so the write lands: `before lapsed → after_reparent current`, and the lapse reappears on `Granite North lapsed`. Evidence survives, on the wrong card. (b) **Date edit in place**: `UPDATE … SET expires_on = CURRENT_DATE + 400` → `current`, no successor row, no audit. Both are the MINOR-2 family (an explicit act on the document rather than a laundering disguised as a renewal), which is why they are MINOR; recorded because the four MAJOR doors were closed one at a time and the enumeration is now complete | `00623:474-480`, `00623:547-568` | walked as a member, `probe110` |
| MINOR-37 | **NEW. One firm gets two Directory rows, so G-9's over-count survives exactly where crm-model §4 rule 2 would have collapsed it.** `party_identity_key()` keys an unstamped seat on its `phone_e164` and never consults the rolodex for a card carrying the same number. Rivera Finishes holds a company card (`d0e20000-…-0019`, `phone_e164 = +16125550219`) **and** an unstamped seat with the same `phone_e164`, so `people_directory` returns it twice — `role='contact'` with `seat_count 0`, and `role='sub'` with `seat_count 1`. crm-model §4 rule 2 is "Phone match, `phone_e164` exact, strong, auto-link within one studio". `w1b-report.md` §6 calls Rivera "the one seat with no card" while §6 also counts a Rivera *card* among its 21 — the report is inconsistent and the duplicate is not named. Both rows agree on every word today (probed, including with a refusal recorded on the number), so nothing lies; the head over-counts and PR-g's mixed list shows one firm twice with two "open this firm" doors | `00626:161-179`, `00626:1007-1012` | `probe113`: two rows, `Rivera Finishes contact/sub`; `studio_contacts.phone_e164 = +16125550219` equals the seat's |
| MINOR-38 | **NEW. `identity_consent_evidence()` re-runs the whole reduction once per number, so the party branch costs O(n²) `channel_consent_status()` calls per identity.** Its `WHERE` compares each number's verdict against `identity_consent_status(p_organization_id, p_identity_key, p_card_phone_e164)`, which itself reduces over every number — and the planner cannot hoist it out of the per-row comparison. Harmless on the fixture (8.5 ms / 62 rows, measured in r4) and on a two-number identity; it is the amplifier MINOR-30 worries about for a studio whose identities carry several numbers. Passing the winning word in as an argument, or a `WITH` that computes it once, removes it | `00626:715-726` | read; the r4 fix log's own cost figures |
| MINOR-39 | **NEW. The suite's own gate test for `identity_phone_numbers()` tests only the case that passes.** Leg `3x2` calls `identity_consent_status('f1000000-…-000a', …)` as a non-member — the victim's org id, which the gate correctly refuses. It never calls with the **caller's own** org id and a foreign identity key, which is BLOCKING-1 and was therefore invisible to two review rounds' worth of probes (including r4's `probe104`, which made the same substitution). A leg that names the caller's own org and a foreign key belongs beside `3x2` | `supabase/tests/people/w1b_compliance_authority_directory_test.sql:1120-1125` | read; `probe105`'s last two blocks are the passing control and the failing case side by side |
| MINOR-40 | **NEW. `project_site_access_cards.told_refs uuid[]` and `emergency_lines jsonb` carry no shape guard at all**, while the wave asserts every other pointer it adds (`assert_site_access_key_holder`, `assert_project_party_cards`, `assert_party_authority_copy_to`, `assert_compliance_holder`). `told_refs` is documented as "Person-card or seat ids" (00625:118-121) with nothing holding it to either, and `emergency_lines` is checked only for `jsonb_typeof = 'array'`, not for the `{label,name,phone}` shape its own comment documents and a reader will iterate. `copy_to uuid[]` on the same wave got a trigger for exactly this reason | `00625:81`, `:87`, `:93-94` | read |

---

## 5. Things I checked that are clean, so the next round need not re-walk them

- **PR-r** — `code_like_columns = 0`; there is no `gate_code`, `code`, `access_code`,
  `lockbox_code` or `show_to_client` column on `project_site_access_cards`.
- **PR-w's client half** — four policies, all `is_studio_comember(project_designer(project_id))`,
  no client leg; a real client account (`client@patina.dev`) reads 0 rows from all four new
  objects, and `anon` is refused at the GRANT before any policy runs.
- **PR-n** — the admin gate is on INSERT/UPDATE/DELETE and not on SELECT; a plain member is
  refused `money` and `draw_certify` on insert *and* on scope escalation via UPDATE; an owner
  lands both; a non-member reads nothing.
- **PR-p** — `people_directory` has no `stage` column (17 columns, §2 probe 6); stage lives only
  on `people_directory_seats`.
- **The twelve carried columns** — positions 1–12 unchanged in name, order and type; five
  appended at 13–17. `select('*')` readers widen.
- **Every branch predicate carried verbatim from 00594** — client `is_studio_comember(dc.designer_id)`;
  lead + `status NOT IN ('accepted','declined','expired')`; maker's `saved_vendors ∪ project_parties`
  three-way; party's three-way co-member leg and the same seven kinds (now via
  `party_kind_in_directory()`), plus the intended `AND pp.studio_contact_id IS NULL`; team's
  `removed_at IS NULL`/`user_id <> auth.uid()`/four roles; contacts
  `is_active_studio_member(sc.organization_id)`.
- **One row per identity, and a row claims only what it nests** —
  `rows_claiming_more_than_they_nest = 0` over all 62 rows; `row_softer_than_a_seat = 0`;
  `client`/`lead`/`maker`/`team` all carry `seat_count 0`.
- **The fixture reads as the fixture** — `client 7 / contact 49 / lead 5 / sub 1`;
  contacts branch `company 21 / person 28`; Dana Kowalski one row, `seat_count 2`,
  `field_link / granted / lapsed`, two seat lines (`warranty` + `active`); the four paper words on
  the four named firms.
- **`v_access_grants`** — eleven tiers across the view and its four definer readers; twelve
  normalised columns; no token and no hash (`grant_ids_that_look_like_a_hash = 0`); every
  no-predicate branch sits on a base table with membership- or designer-scoped RLS; the four
  definer readers return 0 to a foreign owner.
- **`create_field_link`** — 00284's ownership guard and supersede are byte-identical; both
  signatures callable; the one-argument form is a pure delegate; all seven expiry branches land
  in the future.
- **R-AY / R-AW** — no consent write anywhere in the five files; 0 functions and 0 views of this
  wave read a frozen `sms_consent_*` column; the freeze trigger's ten-column list is untouched
  and none of 00624's ten new columns joins it.
- **Trigger coverage** — `assert_compliance_holder` (9 named errors), `assert_project_party_cards`
  (5), `assert_party_authority_copy_to` (1), `assert_site_access_key_holder` (1); all four
  `SECURITY DEFINER`, `search_path=public`, `REVOKE ALL … FROM PUBLIC, anon, authenticated` so
  only `postgres` and `service_role` hold EXECUTE.
- **`compliance_state`** — the four words, both 30-day boundaries, gateless lapse, and empty-set
  `not_on_file`.

---

## 6. What would make this clean

1. **BLOCKING-1** — scope `identity_phone_numbers()`' seat leg to the studio it answers for
   (`project_consent_org(pp.project_id) = p_organization_id`), or revoke EXECUTE from
   `authenticated` so only the views can call it. Re-state suite leg `4e8` if the first is taken,
   and add MINOR-39's missing leg either way.
2. **MAJOR-1** — stop rendering an unreadable record as `'not_asked'`. Drop both COALESCEs to
   NULL, or add `is_active_studio_member(project_consent_org(project_id))` beside the
   `is_studio_comember` visibility leg on the party branch and the seats view.
3. **MAJOR-2** — suppress the clause the word contradicts: no `sms_consented_at` when the
   deciding verdict is `opted_out`, no `sms_opt_out_at` when it is not. Add a test leg over a
   `granted` + `refusal_unanswered` record, which no probe or leg in the wave currently touches.
4. **MAJOR-3** — the same extra conjunct as (2) on the three site-access policies, the four
   authority policies and the seats view; or Fable's ruling that `is_studio_comember`'s breadth
   is accepted for these objects, recorded in `rulings.md`.

Two MINORs cost a line each and are worth taking with the above: **MINOR-27** (`12` → `17`, to
stop the wave shipping a red nightly gate) and **MINOR-33** (`SET search_path TO 'public'` on the
two IMMUTABLE functions, so the wave states the rule one way). **MINOR-35** is the one that most
misleads a reader who is not holding the code: `w1b-report.md` is now five rounds stale and
describes r4 MAJOR-2 as a feature — it should be rewritten from the migrations, not patched.

---

## 7. Not a finding, for the record

- **`people_directory.anon_select = t`** is the local-only `seed/00-legacy-grants.sql` blanket.
  00221/00281 only ever granted `authenticated`, the view is `security_invoker`, and as `anon` it
  raises `permission denied for table studio_contacts`. Recorded as MINOR-7 because the wave's
  three new tables do REVOKE `authenticated` first and the view does not, which is an
  inconsistency, not a hole.
- **Deploy sequencing.** 00626's banner (`:91-105`) states, correctly, that this file must not
  reach Strata ahead of W2's Directory: every carded human is now `role='contact'` and
  `directory-view.tsx:294` drops exactly that role. Measured here as the Local Dev owner: the
  feed renders `client 7 / lead 5 / sub 1` while `people-room.tsx:383` counts 62. rulings §6
  rules one chain at the end of the program, so this is sequencing, not a defect.
- **The four standing red suites** are MINOR-27 and MINOR-28, unchanged in count and message
  since r3. `trade_rfq_test` is unrelated to this wave.
- **R-A/C13/C24** (no paper word for a lender or an inspector) is deliberately left in the app;
  the view reports `not_on_file` as a fact and suite leg `12g` asserts the split. Settled.
- Every ruling in `rulings.md` §3, R-A…R-BC, is treated as settled and is not a finding here.
