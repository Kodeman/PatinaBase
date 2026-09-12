# W1b — adversarial migration review, final run round 4

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **No prod act of any
kind**: no `supabase db push`, no `supabase functions deploy`, no `supabase link`, no Strata
connection, no read of a Strata credential.

Reviewed: `build/w1b-report.md` and the five migrations it names —
`00623_studio_compliance_documents.sql`, `00624_project_party_window_and_authority.sql`,
`00625_project_site_access_cards.sql`, `00626_people_directory_v4_seats.sql`,
`00627_access_grants_and_field_link_window.sql` — each read in full, plus
`supabase/seed/people_crm_dev.sql`, the two people test suites, and the prior fix log
`build/w1b-final-fix-log-r3.md`. Context read first: `rulings.md` (all, §3 R-A…R-AW/R-AY included),
`synthesis/direction.md` §2.2 §3.8 §7 §8, `synthesis/crm-model.md` §1 §2 §4 §5,
`briefing/current-state.md` §B–§E, `briefing/fixture.md`, `build/inventory.md`,
`build/w1a-report.md`, `build/w1a-close-review-r6-migrations.md` and `-tests.md`.

**Verdict: NOT clean — 0 BLOCKING, 4 MAJOR (all new), 35 MINOR (30 carried, 5 new).**

The three MAJORs handed to r3 are **all closed and re-walked** (§3). The four MAJORs below are
fresh. Three of them are the same class the wave has now closed three times — a paper word or a
consent word printed over a record that says something worse — reached through doors the previous
rounds did not test: one more `doc_type` family, one more holder, and one more RLS degrade.

---

## 0. Environment, before the destructive local act

```
$ ls -la apps/designer-portal/.env.local
"apps/designer-portal/.env.local": No such file or directory (os error 2)
```

The file does not exist in this worktree, so nothing in it can point at Strata — the
destructive-local guard is satisfied by absence, as r2 and r3 also found. The only Supabase URL this
session touched is `127.0.0.1:54322`.

Sole owner of the local database, checked before resetting:

```
$ psql … -c "select pid, usename, application_name, state from pg_stat_activity
             where datname='postgres' and pid <> pg_backend_pid();"
 219 | authenticator          | PostgREST 16.1   | idle
 406 | supabase_storage_admin |                  | idle
 433-439 | supabase_admin     | realtime / cluster_node_realtime | idle
 204 | postgres               | pg_net 0.20.4    | idle
 205 | supabase_admin         | pg_cron scheduler |
(11 rows — infrastructure only; no second agent session)
```

Git state clean before I started (`git status --porcelain -- supabase packages apps/designer-portal/src`
→ empty), HEAD `5af2ad6ce` (“w1b r3 — close the third supersede door, the unnestable seat count, and
the party branch's consent word”).

---

## 1. What I ran

### 1.1 Legacy grants, regenerated first

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2707 replayed statements
$ git status --porcelain -- supabase/seed/00-legacy-grants.sql
                                     # (empty — byte-identical; no GRANT/REVOKE moved this round)
```

### 1.2 Reset, twice

```
$ pnpm --dir …/agent-people-build supabase:reset
RESET1_EXIT=0
Seeding data from supabase/seed/people_crm_dev.sql...
Seeding data from supabase/seed/99-local-edge-settings.sql...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
$ grep -in error <log> | grep -vi _error
                                     # (nothing)

$ pnpm --dir …/agent-people-build supabase:reset      # the second run
RESET2_EXIT=0                                          # same tail, same empty error grep

$ psql … -At -c "select version from supabase_migrations.schema_migrations
                 order by version desc limit 6;"
20260910152111 00627 00626 00625 00624 00623
```

W1b's five files are 00623–00627; 00595–00620 are untouched and still reserved; 00621/00622
pre-exist on this branch, which is why the brief's "mints from 00622" could not be honoured and
00623 is correct.

`supabase:reset` needed the sandbox disabled (it writes `~/.supabase/telemetry.json`); its first
attempt failed with `EPERM: operation not permitted, open '/Users/kody/.supabase/telemetry.json.tmp…'`
— a filesystem refusal, never a SQL error. Same for `db:generate` (Docker socket).

### 1.3 The dev seed replays on an already-seeded database

```
$ psql … -v ON_ERROR_STOP=1 -f supabase/seed/people_crm_dev.sql
SEED_REPLAY_EXIT=0
```

### 1.4 Both people suites, and every shipped suite that touches the changed objects

```
people/w1b_compliance_authority_directory_test           exit=0   # 12 blocks, 12 NOTICEs, all passed
people/w1a_identity_channels_consent_test                exit=0   # All W1a assertions passed
field/field_links_test                                   exit=0
rls/project_roster_test                                  exit=0
rls/sms_tables_test                                      exit=0
rls/studio_contacts_backfill_test                        exit=0
document/lead_contact_phone_test                         exit=0
rls/00584_studio_comember_rls_sweep.test                 exit=0
rls/field_parties_test                                   exit=3  ERROR: consent_legacy_column_frozen
rls/people_directory_scope_test                          exit=3  ERROR: FAIL a2: expected exactly 12 columns, got 17
site_requests/security_and_lifecycle_test                exit=3  ERROR: send must transition not_asked consent to pending
commercial/trade_rfq_test                                exit=3  ERROR: design services agreement d9300000-… not found
```

The same four reds, with the same messages, as r3 measured: MINOR-27 (this wave's own append with a
stale assertion), MINOR-28 (W1a's freeze/repoint, plus the unrelated `trade_rfq_test`). None was
fixed; all four remain open.

### 1.5 Replay / idempotency

```
# each file applied TWICE inside one rolled-back transaction
00623_studio_compliance_documents                  replay_exit=0
00624_project_party_window_and_authority           replay_exit=0
00625_project_site_access_cards                    replay_exit=0
00626_people_directory_v4_seats                    replay_exit=0
00627_access_grants_and_field_link_window          replay_exit=0
```

### 1.6 Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir … db:generate
GEN_EXIT=0
$ git diff --numstat -- packages/supabase/src/database.types.ts
                                     # (empty — no drift against the committed file)
```

### 1.7 My own probes

Written fresh this round; every act inside `BEGIN … ROLLBACK`, acting as a real role through
`SET LOCAL role authenticated` + `request.jwt.claims`, never against the migration ledger.

| Probe | What it walks |
|---|---|
| A/A2 | the non-dated `doc_type` supersede door (MAJOR-1) |
| B/C | the person-held gating lapse, on the seeded fixture and on a sole proprietor (MAJOR-2) |
| D | cross-tenant reads and writes on all five new relations, and anon |
| E | every printed consent word vs the record recomputed with no function in the path |
| F | the RLS-degraded consent reduction (MAJOR-3) |
| G/H | seat_count-vs-nesting, the three consent faces, PR-p/PR-r, every `create_field_link` branch |
| I | rule vocabularies, and PR-n on INSERT / UPDATE / DELETE as a plain member |
| J/K | the freeze trigger, every new function's posture, and the word/date split (MAJOR-4) |

---

## 2. Migration rules — pass/fail

| Rule | Verdict |
|---|---|
| Hand-numbered `NNNNN_slug.sql` | PASS — 00623–00627, no `supabase migration new` artefact |
| Grep-winner before redefining | PASS — `create_field_link`'s winner is `00284_field_dispatch_wiring.sql`; 00627:409-496 carries 00284:37's body and its guard verbatim (diffed by eye, line for line), adding only the expiry `CASE` and the pre-supersede raise. Every other redefinition in the wave is of an object this wave created. |
| Banner + lineage | PASS — all five carry a banner; 00623 and 00626 name every fix round including r3 |
| Idempotent | PASS — §1.5 |
| RLS in the same file | PASS — the three new tables enable RLS and create four policies each in their own file |
| Explicit grants both directions + REVOKE FROM PUBLIC, anon | PASS with two carried exceptions — every new table `REVOKE ALL … FROM PUBLIC, anon, authenticated` then grants; **`people_directory` alone restates `GRANT SELECT … TO authenticated` with no REVOKE** (00626:913, carried MINOR-7), and `people_directory_seats` / `v_access_grants` revoke from `PUBLIC, anon` but not `authenticated` (new MINOR-34) |
| REVOKE … anon on definer RPCs | PASS — all four `access_grants_*`, `project_designer`, `project_party_org`, both `create_field_link` signatures; the four `assert_*` trigger functions are revoked from `authenticated` as well |
| SECURITY DEFINER pins search_path | PASS — every definer function carries `search_path=public` (or `public, extensions, pg_temp` for `create_field_link`), probe J2 |
| Schema-qualify extension fns | PASS — `extensions.gen_random_bytes` / `extensions.digest` (00627:486-487) |
| Guarded crons | N/A — no cron added |
| CHECK over enum | PASS — `stage`, `site_access_mode`, `contracted_through`, `doc_type`, `blocks`, `scope`, `holder_type`, `held_by`, `source` are all named CHECKs, drop-and-re-added so a rerun widens them |
| Money integer cents | PASS — `threshold_cents integer` with `>= 0` (00624:305, :327-328) |
| `00-legacy-grants.sql` regenerated | PASS — §1.1, byte-identical |
| Reset twice + SQL tests run and pasted | PASS — §1.2, §1.4 |
| Probe objects, never the ledger | PASS |

### 2.1 The RLS predicates the brief names

```
studio_compliance_documents  4 policies  is_active_studio_member(organization_id)          ✔ the studio_contacts family
project_party_authority      4 policies  is_studio_comember(project_party_designer(engagement_id))
                                          + scope NOT IN ('money','draw_certify')
                                            OR is_org_admin_or_owner(project_party_org(engagement_id))   ✔ PR-n
project_site_access_cards    4 policies  is_studio_comember(project_designer(project_id))  ✔ PR-w
                                          no client leg, no show_to_client column
```

`project_parties`' family predicate is unchanged, and the party/seats views carry
`is_studio_comember(designer_id) OR (lead_designer_id) OR (created_by)` — 00594's three-way clause,
byte for byte (§2.3).

PR-n walked on all three write verbs as a freshly created **plain member** (`role='member'`,
`is_org_admin_or_owner = f`):

```
 money_grants_visible = 2
NOTICE:  I4 plain member DELETE of money grants removed 0 rows
NOTICE:  I4 plain member UPDATE of money thresholds changed 0 rows
NOTICE:  I4 plain member INSERT draw_certify refused -> new row violates row-level security policy
```

### 2.2 Cross-tenant — clean, in both directions

As `cf-phase1-alice@patina.invalid`, owner of a genuinely foreign studio:

```
         rel          | count                NOTICE:  D4 compliance INSERT refused -> RLS
----------------------+-------               NOTICE:  D4 compliance UPDATE affected 0 rows
 compliance_documents |     0                NOTICE:  D4 site card INSERT refused -> RLS
 party_authority      |     0                NOTICE:  D4 outsider can see a seat id: (none - RLS blocked)
 site_access_cards    |     0                NOTICE:  D4 authority INSERT refused -> RLS
 directory_seats      |     0                NOTICE:  D4 create_field_link refused -> party <NULL> not found
 directory            |     0
 access_grants        |     1  ← only their own studio_member row

 compliance_state('<another studio's firm>')          = not_on_file
 identity_consent_status('<another studio>', …)       = (null)
 channel_consent_status('<another studio>','sms',…)   = (null)
```

anon:

```
anon compliance_documents -> permission denied for table studio_compliance_documents
anon site_access_cards    -> permission denied for table project_site_access_cards
anon party_authority      -> permission denied for table project_party_authority
anon directory_seats      -> permission denied for view people_directory_seats
anon access_grants        -> permission denied for view v_access_grants
anon people_directory     -> permission denied for table studio_contacts   ← MINOR-7's harmlessness
```

Carried MINOR-12 is still open and I re-walked it with literal uuids (the prior probe's inner
subquery was itself RLS-filtered, so it proved nothing):

```
 designer_uuid_leaked_to_outsider     | org_uuid_leaked_to_outsider          | consent_org_leaked
--------------------------------------+--------------------------------------+---------------------
 a0000000-0000-0000-0000-000000000004 | b0000000-0000-0000-0000-000000000001 | b0000000-…-0001
 rows_the_outsider_can_read_from_projects = 0
```

### 2.3 `v_access_grants` — the eleven base tables

Every source has RLS enabled AND at least one `authenticated` SELECT/ALL policy wherever
`authenticated` holds SELECT, so no branch can return another tenant's row:

```
              relname               | rls | policies | auth_select_policies | auth_select | anon_select
------------------------------------+-----+----------+----------------------+-------------+------------
 designer_clients                   | t   |    4     |         1            | t           | t
 document_shares                    | t   |    1     |         1            | t           | t
 field_link_tokens                  | t   |    2     |         2            | t           | t
 fulfillment_evidence_upload_tokens | t   |    2     |         1            | t           | f
 invoice_links                      | t   |    0     |         0            | f           | f   ← definer reader
 organization_members               | t   |    7     |         2            | t           | t
 plan_transmittal_tokens            | t   |    1     |         1            | f           | f   ← definer reader
 project_review_access              | t   |    1     |         1            | t           | f
 site_request_access                | t   |    1     |         1            | t           | f
 studio_trade_agreement_tokens      | t   |    0     |         0            | f           | f   ← definer reader
 trade_rfq_tokens                   | t   |    1     |         1            | f           | f   ← definer reader
```

No bearer credential in the ledger (`grant_ids_that_look_like_a_64hex_token = 0`); eleven tiers named,
three populated on the fixture (`client_account 3 · field_link 6 · studio_member 3`).

### 2.4 The stage/window backfill

`00624:283-292` moves only `stage`, guarded by `stage = 'active'`, and is outside
`refuse_legacy_consent_write_trg`'s ten-column `UPDATE OF` list and outside
`assert_project_party_cards_trg`'s three-column list, so neither fires. Carried MINOR-10 (the guard
cannot tell a default `active` from a hand-set one) is unchanged.

### 2.5 `create_field_link` — every branch, walked

```
A live window (2027-09-13) + a caller date 5d out -> 2027-09-14 (caller date NOT honoured: t)   ← MINOR-1, open
B warranty alone (2027-10-17)                     -> 2027-10-18                                 ← PR-l
C closed window (40d ago)                         -> 2026-12-11 (= 90d: t)                      ← r1 MAJOR-1's fix holds
D no window + caller date 7d                      -> 2026-09-19 (caller honoured: t)
E no window + caller date in the PAST             -> 2026-12-11 (never past: t)
F off_job seat                                    -> 2026-12-11 (a fresh 90-day door: t)        ← MINOR-20, open
G non-designer member                             -> refused: not authorized to mint a field link  ← 00284's guard intact
```

and the seed's own mints, which prove PR-d and PR-l without a constructed fixture:

```
 display_name  |      project      | on_site_to | warranty_until | link_ends
---------------+-------------------+------------+----------------+------------
 Erin Sato     | Lindqvist kitchen | 2025-10-15 | 2026-11-21     | 2026-11-22  ← the later of the two
 Erin Sato     | Okonkwo residence | 2027-08-13 |                | 2027-08-14  ← ends with the engagement
```

### 2.6 Consent — the record is still the only source (R-AY/R-AW)

Machine-checked rather than asserted:

```
# no new function reads a frozen consent column
SELECT proname FROM pg_proc … WHERE proname IN (<all 15 new functions>)
  AND prosrc ~ 'sms_consent_(status|source|recorded|evidence|disclosure)|sms_consented_at|sms_opt_out_at';
(0 rows)

# no new view reads the frozen seat verdict
SELECT relname FROM pg_class … WHERE relname IN ('people_directory','people_directory_seats','v_access_grants')
  AND pg_get_viewdef(oid) ~ 'pp\.sms_consent|project_parties\.sms_consent|\.sms_consent_status';
(0 rows)

# the freeze trigger's column list is untouched
phone · phone_e164 · sms_consent_disclosure_version · sms_consent_evidence ·
sms_consent_recorded_at · sms_consent_recorded_by · sms_consent_source ·
sms_consent_status · sms_consented_at · sms_opt_out_at

# and no authenticated write path to the record exists at all
studio_channel_consent: sel=t ins=f upd=f del=f · anon sel=f · 1 policy (member SELECT)

# the five migrations write no consent anywhere
grep -n "studio_channel_consent|sms_consent" 0062[3-7]*.sql | grep -i "insert|update|delete|set "
(no rows)
```

That is why nothing below is BLOCKING: the two BLOCKING classes about consent (a text sent to an
opted-out number; an opt-out lost or overwritten) have no reachable path through this wave's code.
The send gate is `channelConsentVerdict` (`supabase/functions/_shared/sms.ts:389`), reading the
record with the service client.

Whole-fixture reader-vs-record sweep, recomputed directly off `studio_channel_consent` with no
Patina function in the path (probe E2):

```
50 rows compared (every contacts-branch and party-branch row carrying a word)
0 rows where the printed word DIVERGES from the record
```

---

## 3. r3's three MAJORs — all closed, and re-walked

| r3 finding | Status | Evidence |
|---|---|---|
| migrations MAJOR-1 — a third supersede door: an already-lapsed successor, and `blocks`' empty default | **FIXED for both named legs** | `compliance_successor_already_lapsed` (00623:381-390) and `compliance_successor_drops_a_gate` (00623:392-401) both present after a double replay; `v_succ_blocks` added to the successor SELECT (00623:283-284); test block 2's title names both. **But the same consequence is reachable through a fourth door — MAJOR-1 below.** |
| migrations MAJOR-2 — a client/lead/maker/team row claimed a `seat_count` it cannot nest | **FIXED** | `0::integer` on all four branches (00626:550, :588, :635, :800). Whole fixture: `rows_where_count_disagrees = 0 / 62 total_rows`; `client` 7 rows and `lead` 5 rows all `min=max=0`. Test block 4's title names PR-c's login-stamped seat. |
| tests MAJOR-1 — the party branch's consent word read the winning seat's number | **FIXED** | `identity_consent_status()` in a wrapper above the `DISTINCT ON` (00626:725-767); all three faces move together — `party_rows_with_disagreeing_faces = 0`; and no Directory row is softer than any seat beneath it (`pairs = 29`, `row_softer_than_a_seat = 0`). **But the fix's own reduction fails open under RLS — MAJOR-3 — and its dates now belong to a different number than its word — MAJOR-4.** |

### The 30 carried MINORs, re-checked

| # | Status this round |
|---|---|
| MINOR-1 (a caller date cannot beat a live window) | **OPEN** — walked, §2.5 line A |
| MINOR-2 (one `blocks` UPDATE or DELETE moves a holder from `lapsed` to `current`, no audit) | **OPEN**, and now the enforcement gap of a leg added in r3 — see new MINOR-31 |
| MINOR-3 (the eleven tiers are not crm-model §2's eleven) | OPEN, unchanged (11 named, 3 populated) |
| MINOR-4 (four branches carry a LINK id as `subject_id`) | OPEN (00627:163, :198, :288, :352) |
| MINOR-5 (`project_review.granted_by = pra.revoked_by`) | OPEN (00627:375) |
| MINOR-6 (`client_account.last_used_at = dc.last_contacted_at`) | OPEN (00627:258) |
| MINOR-7 (`people_directory` restates GRANT with no REVOKE) | **OPEN** (00626:913). Harmless in fact — as `anon`, `people_directory` → `permission denied for table studio_contacts`; `anon_select = t` is the local-only `00-legacy-grants.sql` blanket |
| MINOR-8 (`site_access_mode` vocabulary, nullable, and `code` in the no-code wave) | OPEN (00624:121-124) |
| MINOR-9 (stage vocabulary drift; `mobilized`/`retired` have no display word) | OPEN (00624:110-116) |
| MINOR-10 (the backfill guard cannot protect a hand-set `active`) | OPEN (00624:283-292) |
| MINOR-11 (three formulas for the paper word) | **OPEN AND LOAD-BEARING** — it is the mechanism of MAJOR-2 below (00626:701, :858, :991) |
| MINOR-12 (two ungated definer oracles) | **OPEN** — re-walked with literal uuids, §2.2 |
| MINOR-13 (`studio_id IS NULL` projects fall back to `_primary_studio_for`) | OPEN, unchanged |
| MINOR-14 (`v_window_end::timestamptz` is session-timezone-dependent) | **OPEN** — `UTC -> 2027-10-02 00:00+00`, `America/Chicago -> 2027-10-02 00:00-05` (00627:465-466) |
| MINOR-15 (`w1b-report.md` says `use-party-sms.ts:133` is the only call site) | OPEN — `_shared/sms.ts` is the second |
| MINOR-16 (`people_crm_dev.sql` in `[remotes.staging.db.seed]`) | OPEN (`config.toml:60`, `:88`) |
| MINOR-17 → MINOR-26 (`w1b-report.md` stale) | **OPEN AND WORSE AGAIN** — see MINOR-35 |
| MINOR-18 (00626's comment claims a degrade `field_link_tokens_studio_rw` prevents) | OPEN (00626:80-85) |
| MINOR-19 (the dev seed's `ON CONFLICT DO UPDATE` leaves a mixed evidence set) | OPEN, and confirmed service-role-only: `studio_channel_consent` has `ins=f upd=f del=f` for `authenticated` |
| MINOR-20 (no stage check on the mint) | **OPEN** — walked, §2.5 line F |
| MINOR-21 (no test legs for r2's three MAJORs) | CLOSED (r3) |
| MINOR-22 (`access_grants_trade_agreement_links` gates on one `contact_id` and labels with another) | OPEN (00627:128 vs :135) |
| MINOR-23 (`identity_seat_count` reads under nine policies, the seats view under three legs) | OPEN; still 0 disagreements on the fixture |
| MINOR-24 (a client-branch row can never nest a seat) | CLOSED (promoted to r3 MAJOR-2, fixed) |
| MINOR-25 (`verified_by` is an unconstrained `profiles` FK) | OPEN (00623:91) |
| MINOR-26 (the consent DATES are absent from every carded human's row) | **OPEN, and now measured exactly**: `carded_rows_with_a_consent_word = 49`, `rows_carrying_a_consent_date = 0`. R-Q's one consent sentence still cannot be composed from the row the room renders |
| MINOR-27 (`people_directory_scope_test.sql`'s stale column count) | **OPEN** — still `ERROR: FAIL a2: expected exactly 12 columns, got 17`, exit 3. One line: `12` → `17` |
| MINOR-28 (W1a's two reds plus the unrelated `trade_rfq_test`) | **OPEN** — same three, same messages, §1.4 |
| MINOR-29 (`field_link_window_closed` is unreachable and its COMMENT promises a refusal) | **OPEN** — the `CASE` still ends `ELSE now() + interval '90 days'` (00627:468), so the guard at :473-479 cannot fire; `grep -rn field_link_window_closed supabase/` returns only 00627:474 and its own COMMENT at :509 |
| MINOR-30 (the five appended columns' cost against a `select('*')` room) | OPEN, not re-measured this round |

---

## 4. Findings

### BLOCKING — none

Everything the BLOCKING classes name was probed and is closed: no cross-tenant read or write on any
of the five new relations (§2.2), no RLS or grant hole, no reset/replay failure (§1.2, §1.5), no
authenticated write path to a consent record at all, and no consent write anywhere in the five
migrations (§2.6). The three consent-face MAJORs below cannot put a text on the wire, because the
send gate reads the record with the service client and never the Directory.

---

### MAJOR-1 — a FOURTH supersede door: for `w9`, `lien_waiver_conditional`, `lien_waiver_unconditional` and `other_named`, an **undated** successor still retires a gating, expired paper, and the firm reads `current`

r2 MAJOR-1 door (a) was closed twice — once as a CHECK
(`studio_compliance_documents_dated_expiry_check`, 00623:157-160) and once as a trigger leg
(`compliance_successor_undated`, 00623:328-335) — and **both enumerate the same five doc_types**:

```sql
-- 00623:158
doc_type NOT IN ('coi_gl', 'coi_wc', 'coi_auto', 'license', 'bond') OR expires_on IS NOT NULL
-- 00623:328
IF NEW.doc_type IN ('coi_gl', 'coi_wc', 'coi_auto', 'license', 'bond')
   AND v_succ_expires IS NULL THEN RAISE 'compliance_successor_undated'
```

So for the other four of the nine types the whole door is still open. `compliance_successor_not_later`
(00623:309-311) passes when `v_succ_expires IS NULL`; `compliance_successor_already_lapsed`
(00623:381-382) is guarded by the same five-type list; `compliance_successor_drops_a_gate` is
satisfied by simply typing the gates on the renewal. And `compliance_state()` reads
`d.superseded_by IS NULL` (00623:531) and treats an undated paper as held and unable to lapse
(00623:521, :525) — which is exactly the shape r2 named.

**Walked, two ordinary member writes, as a plain studio member through RLS** (`probe A2`):

```
=== word BEFORE, on the record the studio holds ===
 lapsed                     # a lien_waiver_conditional, expired 40 days ago, blocks {draw,payment}

 acting_as = studio_manager@patina.dev   is_member = t

=== ACT 1: record an UNDATED successor of the same non-dated type, gates carried ===
INSERT 0 1
=== ACT 2: retire the expired gating waiver with it ===
UPDATE 1

=== word AFTER, and the record that is still on file ===
 current                    # <<< the firm now reads `current`

                  id                  |        doc_type         | expires_on |     blocks     | retired
--------------------------------------+-------------------------+------------+----------------+---------
 dd000000-…-0000000000a1              | lien_waiver_conditional | 2026-08-03 | {draw,payment} | t
 dd000000-…-0000000000a2              | lien_waiver_conditional |            | {draw,payment} | f

=== the same act with a coi_gl is REFUSED (the dated-type control) ===
NOTICE:  control: undated coi_gl refused ->
  violates check constraint "studio_compliance_documents_dated_expiry_check"
```

**Why it is MAJOR and not MINOR-2.** MINOR-2 is a member deliberately clearing a gate, which leaves
the record and the reader agreeing (the record then says "no gate"). Here the record still holds an
expired paper that gates `draw` and `payment` — the studio's own evidence that the cover has run out
— and every reader prints `current` over it. That is r2 MAJOR-1's exact consequence and G-14's exact
defect, and the acts are the single most likely data entry a studio makes ("we got the new waiver, I
didn't have the through-date in front of me").

**Fixture reachability, not a contrivance.** crm-model §2 gives
`lien_waiver_conditional` the `draw` gate, and a conditional waiver is dated by construction ("through
31 Oct"). The seed already carries a dated, `site_access`-gating `other_named` —
`d0e50000-0000-0000-0000-000000000036`, F-09's OSHA 30 card, `expires_on 2029-05-01` — so the only
thing standing between the fixture and this door is the calendar.

**Fix.** Do not enumerate. Both the successor-undated leg and the already-lapsed leg should key on
"the row being retired carries a date" rather than on a type list — e.g. refuse when
`NEW.expires_on IS NOT NULL AND v_succ_expires IS NULL` (a dated paper may only be retired by a
dated one), and apply the in-force test whenever `v_succ_expires IS NOT NULL`. That closes all nine
types with one rule and needs no vocabulary to be kept in step. Plus a test leg per non-dated type
in block 2, beside `2p`/`2q`.

*Evidence:* `supabase/migrations/00623_studio_compliance_documents.sql:157-160`, `:309-311`,
`:328-335`, `:381-390`, `:392-401`, `:517-531`;
`artifacts/people-room-crm-2026-09-11/build/probe93-w1b-final-r4-nondated-supersede.sql`.

---

### MAJOR-2 — a person's OWN gating lapse is invisible on every reader whenever they carry a firm: `paper_state` asks the firm only, never both

`holder_type person|company` exists because "a COI is the firm's and a master licence is the
person's" — the table's banner (00623:16-17), its COMMENT (00623:174-176) and CS2-21 all say so, and
00626's own banner repeats it. But both readers ask exactly one holder:

```sql
-- 00626:858  (people_directory, contacts branch)
public.compliance_state(COALESCE(sc.company_id, sc.id))
-- 00626:991  (people_directory_seats)
public.compliance_state(COALESCE(pp.company_id, pp.studio_contact_id))
```

`COALESCE` means the person's own card is consulted **only when they have no firm**. A person-held
paper is therefore reportable on a sole proprietor and unreportable on everyone else — which is the
entire population `holder_type = 'person'` was added for.

**Walked on the seeded fixture, no launder, one honest record change** (`probe B`, `probe C`). Luis
Ochoa (F-09) holds the fixture's own person-held, `site_access`-gating OSHA 30 card; his firm is
Marrow & Sons, whose paper is current:

```
=== the record, as the studio holds it (the card expired last month) ===
 his_own_card = lapsed      his_firm = current

=== what the two shipped readers print for him ===
 display_name | paper_state          display_name |   project_name    | paper_state
--------------+-------------         -------------+-------------------+-------------
 Luis Ochoa   | current              Luis Ochoa   | Okonkwo residence | current

=== the control: the same expired card on a sole proprietor (no company_id) ===
 Sole Prop Sam | lapsed
```

The `site_access` gate this program built the vocabulary for is held by a lapsed card, and no surface
in the room can say so. It also means the launder in MAJOR-1 is *unnecessary* against a person: a
person-held lapse never reaches a face in the first place.

**Why it is MAJOR.** It is a reader showing a verdict different from the record, reachable with zero
adversarial writes, on a fixture row the seed deliberately created to exercise `holder_type='person'`
(w1b-report §6: "F-09's OSHA 30 card is a **person**-held … document — one row exercising three of
the table's less obvious columns"). Test block 3 asserts "her four fixture words" against Dana
Kowalski, who holds no personal paper, so nothing in the suite can see it.

**Fix.** One formula, worst-first over both holders — a third `compliance_state`-shaped reducer
(`identity_paper_state(card_id, company_id)`) reducing `compliance_state(card_id)` and
`compliance_state(company_id)` the way `identity_consent_status()` reduces numbers, called from all
three sites. That also closes MINOR-11 (three formulas), which is the same defect stated as a
smell. Plus a test leg: a person with a current firm and a lapsed personal card reads `lapsed`.

*Evidence:* `supabase/migrations/00626_people_directory_v4_seats.sql:69-72`, `:701`, `:858`, `:991`;
`supabase/migrations/00623_studio_compliance_documents.sql:16-17`, `:174-176`;
`supabase/seed/people_crm_dev.sql` (F-09's OSHA 30 row, `d0e50000-…-036`);
`build/probe94-w1b-final-r4-person-held-paper.sql`.

---

### MAJOR-3 — `identity_consent_status()` fails **open**: a seat the caller cannot see drops out of the worst-first reduction, and the Directory prints `granted` over a record that says `opted_out`

The function is SECURITY INVOKER and its number set is a `project_parties` scan:

```sql
-- 00626:443-453
WITH numbers AS (
  SELECT NULLIF(btrim(COALESCE(p_card_phone_e164,'')),'') AS v
  UNION
  SELECT NULLIF(btrim(COALESCE(pp.phone_e164,'')),'')
    FROM public.project_parties pp
   WHERE … party_identity_key(…) = p_identity_key )
```

Its own COMMENT and banner call the reduction "WORST-FIRST, which is least-permission-first" and
"fail-closed" (00626:416-419, :479-482). Under RLS it is the opposite: an invisible seat contributes
nothing, so removing information can only make the word **more** permissive. The INVOKER degrade is
documented for `reach_state` and `paper_state` — where the failure direction is `on_paper` /
`not_on_file`, i.e. safe — and is not documented, or considered, for consent.

**Walked with an ordinary studio act — a designer of record leaves the studio** (`probe F`). The card
lists the office line (granted); the mobile, which said STOP, is carried only by a seat on that
designer's job:

```
=== F1: the record, as the studio holds it ===
 +16125559001 | granted        # the card's own line
 +16125559002 | opted_out      # the seat's mobile

=== F2: while the leaver is still a member, the owner reads the honest word ===
  display_name  | consent_status | seat_count
 Two Line Trade | opted_out      |          1
 Two Line Trade | Leaver job | +16125559002 | opted_out      (the seat line)

=== F3: the leaver leaves the studio (an ordinary act) ===
UPDATE 1        # organization_members.status = 'removed'

=== F4: what the owner now reads for the same card, over the same record ===
  display_name  | consent_status | reach_state | seat_count
 Two Line Trade | granted        | on_paper    |          0
 (0 rows)       # the seat line is gone too, so nothing on the face contradicts it

=== F5: the record itself is unchanged and still says opted_out ===
 +16125559002 | opted_out
 record_verdict = opted_out
```

The room reads **"granted, 0 seats"** for a human whose number the studio's own record refuses, and
`people_directory_seats` no longer carries the line that would argue. Every other softening
transition is reachable the same way (`opted_out` → `not_asked`, `not_asked` → `granted`), because
dropping a number can only remove the worse verdicts.

**Why MAJOR and not BLOCKING.** No text can go out: the send gate is `channelConsentVerdict`
(`supabase/functions/_shared/sms.ts:389`), which reads `studio_channel_consent` with the service
client, and `authenticated` holds no INSERT/UPDATE/DELETE on that table (§2.6). So this is a reader
disagreeing with the record, not a refused number reachable by a send. But the reader it misleads is
a send door: `party-profile-sheet.tsx:262` computes `granted = consent === 'granted'` from
`person.status_raw ?? meta.sms_consent_status` — both of which are this word on the party branch —
and `:742` opens the text composer and the **Send text** act on it. The studio is invited to text a
number the rail will refuse, which is G-3's defect restated.

**Fix.** The reduction has to be as authoritative as the verdict it reduces. Either make
`identity_consent_status()` SECURITY DEFINER over `project_parties` (it already takes the studio as
an argument and can gate on `is_active_studio_member(p_organization_id)`, so it would read only the
caller's own studio — 00594's `channel_consent_status()` posture), or reduce over
`studio_channel_consent` rather than over seats: every number the identity has ever carried inside
this studio is already in the record, and the record has no per-project RLS. Plus a test leg with a
seat outside the caller's visibility.

*Evidence:* `supabase/migrations/00626_people_directory_v4_seats.sql:416-419`, `:431-432`,
`:433-468`, `:479-482`, `:857`; `supabase/functions/_shared/sms.ts:389`;
`apps/designer-portal/src/components/document/people/party-profile-sheet.tsx:259-262`, `:742`;
`build/probe95-w1b-final-r4-rls-softened-consent.sql`.

---

### MAJOR-4 — the party branch's consent WORD and its two consent DATES come off different numbers, so the row composes R-Q's sentence as a consent claim over a refusal

r3's fix lifted the word above the `DISTINCT ON` and keyed it on the identity (00626:728-730). The two
dates were left inside the subquery, joined on the **winning seat's** number:

```sql
-- 00626:753-756
LEFT JOIN public.studio_channel_consent scc
  ON scc.organization_id = public.project_consent_org(pp.project_id)
 AND scc.channel_kind    = 'sms'
 AND scc.channel_value   = pp.phone_e164
```

and projected as `meta.sms_consented_at` / `meta.sms_opt_out_at` (00626:687-688) beside
`meta.sms_consent_status` (00626:686), which is now the identity's word. For the very population the
r3 fix exists for — an uncarded identity keyed on a login or an email, holding two seats with two
different numbers — the three values cannot all be true at once.

**Walked** (`probe K`), the r3 fix log's own test shape with the granted number on the **winning**
seat:

```
=== K1: the one Directory row — its word, and the two dates it carries ===
 display_name  | consent_status | status_raw | winning_number |       consented_at        | opt_out_at | seat_count
---------------+----------------+------------+----------------+---------------------------+------------+------------
 Two Num Trade | opted_out      | opted_out  | +16125559102   | 2025-05-02T00:00:00+00:00 |            |          2

=== K2: the record, per number ===
 +16125559101 | opted_out |              | 2025-12-03
 +16125559102 | granted   | 2025-05-02   |
```

R-Q fixes one sentence for every surface: `"<Source> consent, <d Mon yyyy>, on the <project>."` /
`"Opted out by text, <date>, on the <project>."`. Composed from this row it reads **"Written consent,
2 May 2025"** for a human the record refuses, and the refusal's own date (3 Dec 2025) is nowhere on
the row at all. `opt_out_at` is NULL on an `opted_out` row, which also makes the refusal undateable —
the same hole MINOR-26 names for the contacts branch, except here the field is present and
contradicting rather than absent.

**Why MAJOR.** The brief's MAJOR class covers a W2-planned reader, and R-Q is a binding ruling W2
must satisfy from this row (`use-people.ts:125`, `:161` are both `select('*')`; no shipped component
renders the dates yet, which is why this is not worse). Test legs `4e6`–`4e11` assert all three
*words* and never the dates.

**Fix.** Either join the record the word came from (the number whose verdict won the reduction — have
`identity_consent_status()` return the number or the record's key, or add a sibling
`identity_consent_evidence()` returning the winning record's `consented_at`/`opt_out_at`), or set
both dates NULL on the party branch whenever the identity carries more than one number, so the room
falls back to R-V's "no record" line instead of printing a false one. Plus a leg asserting the dates
beside `4e6`–`4e11`.

*Evidence:* `supabase/migrations/00626_people_directory_v4_seats.sql:686-688`, `:728-730`,
`:753-756`; `rulings.md` §3 R-Q; `build/probe96-w1b-final-r4-word-date-split.sql`.

---

### MINOR findings

| # | Finding | Where | Evidence |
|---|---|---|---|
| MINOR-1 … MINOR-20, MINOR-22, MINOR-23, MINOR-25 … MINOR-30 | **All carried from r2/r3 with the statuses in §3.** MINOR-11 is promoted in effect (it is MAJOR-2's mechanism) but stays listed; MINOR-21 and MINOR-24 are closed | see §3 | see §3 |
| MINOR-31 | **NEW. The `blocks` invariant r3 added cannot be enforced after the fact: `blocks` is not in the trigger's `UPDATE OF` list.** `assert_compliance_holder_trg` fires `BEFORE INSERT OR UPDATE OF holder_id, holder_type, organization_id, superseded_by, doc_type, expires_on` — so once a supersede has landed with its gates carried, a member may `UPDATE … SET blocks = '{}'` on the successor and `compliance_successor_drops_a_gate` is never re-evaluated. The r3 fix log names this as MINOR-2's second half and leaves it; it is worth restating as the enforcement gap of a leg added *that round*, because the leg's own HINT ("record the gates on the renewal, or do not retire the lapse") promises an invariant the schema holds only at one instant | `00623:392-401`, `:441-442` | reasoned from the trigger's `UPDATE OF` list; the same act MINOR-2 already walks |
| MINOR-32 | **NEW. `project_parties.studio_contact_id` has no same-studio guard, while the two pointers 00624 adds do.** `assert_project_party_cards()` holds `company_id` and `warranty_contact_person_id` to a card in the project's own studio (00624:212-243); `studio_contact_id` — the stamp that v4 makes load-bearing, since it decides which branch emits the identity and what `people_directory_seats.person_id` is — has no such assertion anywhere (`grep -rn "studio_contact_id" supabase/migrations/*.sql | grep -i "assert\|RAISE"` → only 00593's unrelated identity-stability trigger). An `authenticated` writer cannot reach it (they would need INSERT on the other studio's project), so this is a service-role / edge-writer path, which is why it is MINOR; but the wave added the guard for two weaker pointers and not for the one it depends on | `00624:189-266`; `00626:948-964` | grep above; probe D4 shows the `authenticated` path closed |
| MINOR-33 | **NEW. `party_identity_key` and `party_kind_in_directory` are the only two of the wave's functions with no `SET search_path`.** Both are IMMUTABLE pure expressions referencing no table, so there is no hijack surface today (`btrim`/`lower`/`COALESCE`/`IN` only) — but both are called from two `security_invoker` views and from an expression index, and the wave's other sixteen functions all pin. A later edit that adds a table reference inherits the caller's `search_path` silently | `00626:137-155`, `:191-198`; probe J2 `cfg = (none)` | `SELECT proconfig …` — every other new function shows `search_path=public` |
| MINOR-34 | **NEW. The two new views revoke from `PUBLIC, anon` but not from `authenticated`, unlike the three new tables.** `REVOKE ALL ON TABLE public.people_directory_seats FROM PUBLIC, anon` (00626:1023) and the same for `v_access_grants` (00627:399), where each new table does `FROM PUBLIC, anon, authenticated` before granting. Harmless in fact (both are freshly created / replaced and then granted exactly `SELECT`), but it means "explicit grants both directions" is stated three different ways inside one wave — and `people_directory` (MINOR-7) a fourth | `00626:1023-1025`, `00627:399-401`, vs `00623:480-484`, `00624:487-490`, `00625:211-214` | read |
| MINOR-35 | **NEW (MINOR-26/MINOR-17, worse again). `w1b-report.md` is now the record of a code state FOUR fix rounds old, and MAJOR-1 and MAJOR-2 are both mis-described in it.** §1 says `compliance_state` reads "the holder's non-superseded documents, worst-first, with the 30-day window written in one place" and never mentions `blocks[]` — the whole of r1 MAJOR-3. §1's "An undated paper is HELD and cannot lapse" is stated as a judgement with no mention that an undated paper may also *retire* a dated one for four of the nine types (MAJOR-1). §4's table says `paper_state` is "the FIRM's paper for a person, the card's own for a firm and for a sole proprietor" — which is precisely MAJOR-2, described as a feature. `grep -c` over the report: `identity_consent_status` 0, `reach_state_for_identity` 0, `party_kind_in_directory` 0, `compliance_successor_already_lapsed` 0, `compliance_successor_drops_a_gate` 0, `field_link_window_closed` 0. A reader who trusts it will believe the card reads a date without a gate, that the contacts branch reads the card's number alone, and that `reach_state` reads the winning seat. It should be rewritten from the code, not patched | `build/w1b-report.md:43-53`, `:129-133`, `:390-398` | grep counts above |

---

## 5. Things I checked that are clean, so the next round need not re-walk them

- **Cross-tenant, both directions, on all five new relations** — reads 0, writes refused at the
  policy, `compliance_state` / `identity_consent_status` / `channel_consent_status` all degrade to
  `not_on_file` / NULL for an outsider (§2.2).
- **anon** — refused at the GRANT on four of the five; `people_directory` refused at
  `studio_contacts` (§2.2).
- **The eleven `v_access_grants` base tables** — every one RLS-enabled with an `authenticated`
  policy wherever `authenticated` holds SELECT; no bearer credential and no hash in the ledger
  (§2.3).
- **PR-n** on INSERT, UPDATE and DELETE, as a genuinely non-admin member (§2.1).
- **PR-r / PR-w** — `site_card_code_cols = 0` (no `gate_code`, `code`, `access_code`,
  `lockbox_code`, `show_to_client`), four studio policies, no client leg.
- **PR-p** — `directory_stage_cols = 0`.
- **R-AY/R-AW** — no frozen column read by any new function or view, freeze trigger's ten columns
  intact, no authenticated write path to the record, no consent write in the five migrations (§2.6).
- **The whole-fixture consent sweep** — 50 rows, 0 divergences from the record recomputed with no
  Patina function in the path.
- **r3's three MAJORs** — all three fixes re-walked and holding (§3).
- **`seat_count` vs nesting** — 0 disagreements over 62 rows.
- **`create_field_link`** — all seven branches, plus 00284's ownership guard (§2.5).
- **`people_directory`'s twelve shipped columns** — identical names, order and types to 00594's
  projection; five appended at 13–17.
- **Every branch predicate** — 00594's `is_studio_comember` clauses carried verbatim; the party
  branch adds only `studio_contact_id IS NULL` and swaps the literal seven-kind `IN` for
  `party_kind_in_directory()`.
- **Replay, twice per file and once for the whole wave; reset twice; the seed replays; no type
  drift.**

---

## 6. What would make this clean

1. **MAJOR-1** — stop enumerating doc_types in the two successor legs; key on "the row being
   retired carries a date" and "the successor carries one", so all nine types are covered by one
   rule. A test leg per non-dated type beside `2p`/`2q`.
2. **MAJOR-2** — one paper-word formula that reduces the person's own card and their firm worst-first
   (`identity_paper_state()`), called from all three sites. Closes MINOR-11 with it. A test leg:
   current firm + lapsed personal card reads `lapsed`.
3. **MAJOR-3** — make `identity_consent_status()` as authoritative as the verdict it reduces: either
   SECURITY DEFINER gated on `is_active_studio_member(p_organization_id)`, or reduce over
   `studio_channel_consent` instead of over seats. A test leg with a seat outside the caller's
   visibility.
4. **MAJOR-4** — take the two dates from the record the winning verdict came from, or NULL them on a
   multi-number identity. A test leg beside `4e6`–`4e11`.

The two paperwork MINORs worth doing in the same pass, because they are the wave's record rather
than its code: **MINOR-35** (`w1b-report.md` now mis-describes two of the four MAJORs as features)
and **MINOR-27** (one line, `12` → `17`, to stop the wave shipping a red nightly gate). **MINOR-30**
is still the number Fable may want before W2 commits the room to `select('*')`.

---

## 7. Not a finding, for the record

- The brief's "W1b mints from 00622" could not be honoured; 00622 pre-exists on this branch and
  00623–00627 is correct. 00595–00620 remain untouched.
- `people_directory.anon_select = t` is the local-only `00-legacy-grants.sql` blanket, not this
  wave's grant; the view is `security_invoker` and anon is refused at `studio_contacts`.
- `create_field_link` refuses a studio co-member who is not the designer of record (probe H line G).
  That is 00284's shipped guard, carried verbatim as the brief requires; widening it is a ruling,
  not a defect.
- Every ruling in `rulings.md` §3, R-AW/R-AY included, is treated as settled and is not a finding
  here.
