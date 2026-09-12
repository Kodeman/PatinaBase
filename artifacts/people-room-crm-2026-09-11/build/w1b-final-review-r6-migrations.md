# W1b — final review, round 6 (migrations)

Adversarial review of `build/w1b-report.md` and the five migrations it names
(`00623`–`00627`), the dev seed, and the SQL suite, on branch
`build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.

Prior fix log re-checked: `build/w1b-final-fix-log-r5.md`. **All four r5 findings
(BLOCKING-1, MAJOR-1, MAJOR-2, MAJOR-3) are CLOSED and re-walked** (§3). Then I looked
fresh, and the fresh pass found one BLOCKING and two MAJORs, all three of them in places
the r5 round's own "clean" list declared clean — because that round probed them with the
wrong actor.

**Not clean.** 1 BLOCKING · 2 MAJOR · 27 open MINOR (23 carried, 4 new).

---

## 0. Environment, before the destructive local act

```
$ ls .../agent-people-build/apps/designer-portal/.env.local
"apps/designer-portal/.env.local": No such file or directory (os error 2)

$ psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -At \
    -c "select current_database(), inet_server_addr(), inet_server_port(), version();"
postgres|172.18.0.2|5432|PostgreSQL 17.6 on aarch64-unknown-linux-gnu…
```

The guard is satisfied by absence, as r2–r5 also found. **No prod act of any kind**: no
`supabase db push`, no `supabase functions deploy`, no `supabase link`, no Strata
connection, no read of a Strata credential.

### ⚠ The local database is NOT solely owned — another session reset it mid-review

Half-way through, `studio_channel_consent` and `channel_consent_status` vanished from the
database and the migration ledger was climbing through `00404`:

```
$ ps aux | grep "supabase db reset"
kody 57686 … supabase db reset                                  ← 1:11PM, not mine
kody 57683 … sh -c cd supabase && supabase db reset
kody 57666 … node … pnpm supabase:reset
$ psql … -c "select version from supabase_migrations.schema_migrations order by version desc limit 1;"
 00404
```

Only this worktree carries `00623`–`00627`
(`for w in …/worktrees/*; do ls $w/supabase/migrations | grep -cE '^0062[3-7]_'; done` → `5`
here, `0` everywhere else), so that reset was launched from **this** worktree by another
agent. I waited it out (`until ! pgrep -f "supabase db reset"`), re-verified the ledger and
the suite, and re-measured everything I had taken before it started. **One earlier
measurement in this review was poisoned by it and is discarded** (§7).

Recorded because the brief says "this wave is its sole owner" and it is not: any figure in
`w1b-report.md` or in any fix log measured across that window is unreliable.

### Probe hygiene

Every probe is `BEGIN … ROLLBACK` except `probe124` (the PostgREST fixture), which must
commit for the API to see it. It was torn down immediately and the counts are back to the
seeded numbers:

```
 orgs | oms | sc | pp | docs | auth | cards | links | strays
    4 |   5 | 49 | 31 |   36 |   11 |     1 |     6 |      0
```

---

## 1. What I ran

### 1.1 Legacy grants, regenerated first — no drift

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2713 replayed statements
$ git diff --numstat -- supabase/seed/00-legacy-grants.sql
(nothing)
```

### 1.2 Reset, twice

```
$ pnpm --dir … supabase:reset    RESET1_EXIT=0
   grep -in error (minus *_error filenames) → nothing
   Seeding data from supabase/seed/people_crm_dev.sql...
   Seeding data from supabase/seed/99-local-edge-settings.sql...
$ pnpm --dir … supabase:reset    RESET2_EXIT=0   (idem)
$ psql … -At -c "select version from supabase_migrations.schema_migrations order by version desc limit 6;"
20260910152111 00627 00626 00625 00624 00623
```

00595–00620 untouched and reserved; 00621/00622 pre-existed; W1b is exactly 00623–00627.

### 1.3 The dev seed replays on an already-seeded database

```
$ psql … -v ON_ERROR_STOP=1 -f supabase/seed/people_crm_dev.sql      SEED_REPLAY_EXIT=0
 sc | pp | docs | consent | links | auth | cards
 49 | 31 |   36 |       7 |     6 |   11 |     1     ← unchanged; the RPC mint is guarded
```

### 1.4 Idempotency — all five files applied TWICE in one rolled-back transaction

```
$ psql … -v ON_ERROR_STOP=1 -f <00623..00627, then again>   REPLAY2X_EXIT=0
46 "already exists, skipping" notices; no ERROR line
```

### 1.5 The suites

```
people/w1b_compliance_authority_directory_test   exit=0   13 blocks, "All W1b assertions passed."
people/w1a_identity_channels_consent_test        exit=0
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

The same four reds, same messages, as r3/r4/r5 — MINOR-27 and MINOR-28, still open. **No new red.**

### 1.6 Generated types, type-checks, unit suites

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir … db:generate
GEN_EXIT=0
$ git status --porcelain -- packages/supabase/src/database.types.ts
(nothing)                                   # no drift against the committed file

$ pnpm --dir … --filter @patina/supabase        type-check   SUPABASE_TC=0
$ pnpm --dir … --filter @patina/designer-portal type-check   DESIGNER_TC=0
$ pnpm --dir … --filter @patina/supabase        test         VITEST_EXIT=0
   Test Files  100 passed (100)   Tests  1253 passed | 12 skipped (1265)
$ npx jest src/lib/document/__tests__ (designer-portal)
   Test Suites: 104 passed, 104 total   Tests: 2241 passed, 2241 total
```

### 1.7 My own probes

| file | what |
|---|---|
| `probe117-w1b-final-r6-vag-definer-readers.sql/.out` | a third studio holding the seeded designer + one outsider, against 00627's four readers |
| `probe118-w1b-final-r6-reader-vs-shipped-policy.sql/.out` | the readers' gate vs the token tables' OWN shipped policy predicate |
| `probe119-…-reader-vs-record.sql/.out` | first sweep — **its ground truth was wrong, see §7** |
| `probe120-…-reader-vs-record-v2.sql/.out` | the sweep with ground truth taken from the record TABLE |
| `probe121-…-studioless-project.sql/.out` | what the tenant conjunct does to a `studio_id IS NULL` project |
| `probe122-…-lapse-doors.sql/.out` | MINOR-2/31/36 re-walked, plus the DELETE door |
| `probe123-…-postgrest-definer-readers.py/.out` + `probe124`/`probe125` | the same three readers over `POST /rest/v1/rpc/…` |
| `probe126-…-untightened-branches.sql/.out` | the client/lead/maker/team branches, asked by a co-member of the designer |
| `probe127-…-mint-and-oracles.sql/.out` | MINOR-1, MINOR-20, MINOR-37, MINOR-12 |

---

## 2. Migration rules — pass/fail

| Rule | Verdict |
|---|---|
| Hand-numbered `NNNNN_slug.sql` | PASS — 00623–00627; 00595–00620 untouched |
| grep-winner before redefining | PASS — `create_field_link` grafted from `00284:37` (guard and supersede byte-identical, suite block 10); `people_directory` lineage `00221→00281→00420→00478→00583→00589→00594→00626` |
| Banner + lineage | PASS, and unusually good — each file's banner names every fix round in place |
| Idempotent | PASS — §1.4 |
| RLS in the same file | PASS — all three new tables |
| Explicit grants both directions + `REVOKE … FROM PUBLIC, anon` | **PARTIAL** — every new table and function complies; `people_directory` restates `GRANT SELECT … TO authenticated` at `00626:1302` with **no REVOKE**, so the local blanket seed's `anon=arwdDxtm` survives (MINOR-7) |
| `SECURITY DEFINER` pins `search_path` | **PARTIAL** — every definer pins `search_path=public`; the two IMMUTABLE invoker helpers `party_identity_key` / `party_kind_in_directory` pin none (MINOR-33) |
| Schema-qualify extension fns | PASS — `extensions.gen_random_bytes`, `extensions.digest` in `create_field_link` |
| Guarded crons | N/A — no cron added |
| CHECK over enum | PASS — `stage`, `site_access_mode`, `contracted_through`, `doc_type`, `blocks`, `scope`, `held_by`, `source` all named CHECKs, drop-and-re-add |
| Money integer cents | PASS — `threshold_cents integer`, the $2,500 line is `250000`; `integer` is the house convention (32 of 33 `*_cents` columns) |
| `generate-legacy-grants.py` re-run | PASS — no drift |
| `pnpm supabase:reset`, twice | PASS |
| `db:generate` | PASS, no drift |
| Probe objects, never the ledger | PASS |

### 2.1 The RLS predicates the brief names

```
studio_compliance_documents  ×4  is_active_studio_member(organization_id)                       ✔ the studio_contacts family
project_party_authority      ×4  is_active_studio_member(project_party_org(engagement_id))
                                 AND is_studio_comember(project_party_designer(engagement_id))  ✔ + PR-n on I/U/D
project_site_access_cards    ×4  is_active_studio_member(project_consent_org(project_id))
                                 AND is_studio_comember(project_designer(project_id))           ✔ PR-w, no client leg
```

`project_site_access_cards`: no `gate_code`, `code`, `access_code`, `lockbox_code` or
`show_to_client` column (suite block 7); `anon` refused **at the grant** before any policy
runs; a real client account reads 0 rows from all four new objects (probe119, §"AS A CLIENT
ACCOUNT": `cards 0 | authority 0 | seats 0 | docs 0`).

PR-n walks by role (suite block 5) and the escalation path is closed: the UPDATE policy
carries the scope gate in **both** `USING` and `WITH CHECK`, so a member cannot re-scope a
`selections` grant to `money`.

### 2.2 Cross-tenant — three holes, one of them new and BLOCKING

r5 closed the tenant hole on `project_site_access_cards`, `project_party_authority`, the
party branch and `people_directory_seats`. It did **not** close the same hole in
`00627`'s definer readers (BLOCKING-1 below) and left the Directory's other four branches
on the loose predicate (MAJOR-2). And the conjunct it did add has a consequence nobody
measured (MAJOR-1).

The predicate that matters, measured:

```
is_studio_comember(p_owner)        → true whenever the caller shares ANY active organization
                                     with p_owner, of ANY type
is_design_studio_comember(p_owner) → same, but the shared organization must be type='design_studio'
is_active_studio_member(p_org)     → the caller is an active non-guest member of THAT org
```

### 2.3 `v_access_grants` — the eleven sources

Eleven tiers named, twelve normalised columns, no token and no hash in any branch
(`grant_ids_that_look_like_a_hash = 0`, suite block 9). The four grant-closed sources are
genuinely closed:

```
 relname                       | relacl
 trade_rfq_tokens              | {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
 plan_transmittal_tokens       | {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
 invoice_links                 | {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
 studio_trade_agreement_tokens | {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
```

so the four definer readers are load-bearing. Three of them are the BLOCKING finding.
`fulfillment_evidence_upload_tokens` is admin-only for `authenticated`
(`…_select_admin`, `r.domain='admin'`), so the `evidence_upload` tier is invisible to an
ordinary member — clean.

### 2.4 The stage/window backfill

```
 name              |    stage    | count
 Lindqvist kitchen | warranty    |     7      ← completed, close inside 12 months
 Okonkwo residence | active      |    13
 Okonkwo residence | awarded     |     9
 Okonkwo residence | no_response |     1
 Okonkwo residence | off_job     |     1
```

Correct, and the `stage = 'active'` guard makes the rerun a no-op (§1.4).
`COALESCE(pj.completed_at, pj.updated_at)` is named as a stand-in in the migration
(00624:288) rather than silently assumed. MINOR-10 (the guard cannot protect a hand-set
`active`) stands.

### 2.5 `create_field_link` — every branch walked

```
$ field_link_tokens after the seed
 status | count |    min     |    max
 active |     6 | 2026-11-21 | 2027-10-01

leg A  a LIVE window + an explicit caller date  → asked for 5 days, got 69 (2026-11-21)   MINOR-1, OPEN
leg B  warranty alone                            → the later of the two (suite 10)         ✔ PR-l default
leg C  no window                                 → now() + 90 days                         ✔
leg D  a CLOSED window                           → now() + 90 days, never a past date       ✔ r1 MAJOR-1
leg E  `field_link_window_closed` (00627:474)     → unreachable: the ELSE arm is always
                                                    now() + 90 days                        MINOR-29, OPEN
leg F  an `off_job` seat                         → minted, 90 days                         MINOR-20, OPEN
leg G  00284's ownership guard + supersede        → byte-identical (suite 10)               ✔
```

### 2.6 Consent — record-only (R-AY/R-AW) holds, at source and as applied

```
$ grep -nE "INSERT INTO public.studio_channel_consent|UPDATE …|record_channel_consent|DELETE FROM …" \
    supabase/migrations/0062[3-7]*.sql
(none)
$ grep -nE "pp\.sms_consent|pp\.sms_opt_out_at|pp\.sms_consented_at|project_parties\.sms_consent" \
    supabase/migrations/0062[3-7]*.sql
00626:546, :653, :715, :1068   ← all four are COMMENT prose, no column read
$ psql … -At -c "select viewname from pg_views where viewname in
    ('people_directory','people_directory_seats','v_access_grants')
     and definition ~ '[a-z_]+\.sms_consent|[a-z_]+\.sms_opt_out_at|[a-z_]+\.sms_consented_at';"
(empty)
$ the freeze trigger's column list, as the database reports it
refuse_legacy_consent_write_trg | phone, phone_e164, sms_consent_disclosure_version,
  sms_consent_evidence, sms_consent_recorded_at, sms_consent_recorded_by, sms_consent_source,
  sms_consent_status, sms_consented_at, sms_opt_out_at
assert_project_party_cards_trg  | company_id, project_id, warranty_contact_person_id
```

None of 00624's ten new columns joins the freeze list; suite block 11 asserts both halves.

**No reader disagrees with the record, for either member of the seeded studio**
(`probe120`, ground truth computed from `studio_channel_consent` itself):

```
consent_mismatches (contacts branch, 49 rows)          0
seat_mismatches    (people_directory_seats, 31 rows)    0
a permissive identity word over ANY refused number      0 rows
a dated consent claim beside a refusal                  0 rows
rows claiming a seat_count they cannot nest             0
```

and the record, for the record:

```
 +16125550106 granted | +16125550108 granted | +16125550109 granted | +16125550111 granted
 +16125550112 opted_out (opt_out 2025-12-03) | +16125550116 granted | +16125550118 pending
```

**Nothing in this wave lets a text reach an `opted_out` number, and nothing here writes or
destroys consent evidence.** The BLOCKING finding below is a cross-tenant read, not a consent defect.

### 2.7 `compliance_state` and the 30-day window

Four words, both boundaries, worst-first, gating-only, `not_on_file` only on an empty set —
suite block 1 passes, and the four supersede-laundering doors r1–r4 closed are still closed
(`probe122` leg (e): `supersede refused: compliance_successor_already_lapsed`). The
non-supersede doors are not (MINOR-31/36/41, §4).

### 2.8 `people_directory` v4 — the shape the brief asks for

```
 1 person_id · 2 role · 3 display_name · 4 email · 5 phone · 6 profile_id · 7 project_id ·
 8 designer_id · 9 status_raw · 10 last_touch_at · 11 meta · 12 scope ·
 13 reach_state · 14 consent_status · 15 paper_state · 16 contact_rule_summary · 17 seat_count
```

Twelve carried columns unchanged in name, order and type; five appended. One row per
identity (`client 7 / contact 49 / lead 5 / sub 1`; contacts branch `company 21 / person 28`),
Dana Kowalski one row with `seat_count 2` and two seat lines, no person-level `stage` column
(PR-p). `v_access_grants` and `people_directory_seats` both `REVOKE`d from anon; the
`security_invoker` degrade is real (`anon` reading `people_directory` raises
`permission denied for table studio_contacts`).

---

## 3. r5's four findings — all CLOSED, re-walked

| r5 finding | status |
|---|---|
| **BLOCKING-1** `identity_phone_numbers()` cross-tenant phone oracle | **CLOSED.** The seat leg now carries `project_consent_org(pj.id) = p_organization_id` (00626:602). Replayed as the Phase One Synthetic owner in SQL (`foreign_numbers 0`) and over `POST /rest/v1/rpc/identity_phone_numbers` with a locally minted HS256 JWT for a co-member of the seeded designer: `HTTP 200 []`. Suite legs `4e8` (re-stated intra-studio), `4e8b`, `13j`–`13n1` all present and passing |
| **MAJOR-1** the consent word failed OPEN at two call sites | **CLOSED.** `is_active_studio_member(project_consent_org(pp.project_id))` at 00626:1123 (party branch) and 00626:1403 (seats view). A co-member of the designer who is not a member of the owning studio now reads `people_directory_seats 0` and 0 party-branch rows (probe117, probe118, probe126) |
| **MAJOR-2** a dated consent claim over a folded `refusal_unanswered` | **CLOSED.** `identity_consent_evidence()`'s two dates are one-sided (00626:790-792). `probe120` A6: 0 rows where `consent_status='opted_out'` carries a `sms_consented_at`. Suite legs `4e18`–`4e23` present |
| **MAJOR-3** the sensitive new objects scoped through the designer | **CLOSED for the three objects it named.** `project_site_access_cards` ×4 (00625:210/220/230/244), `project_party_authority` ×4 (00624:459/475/491/508), the seats view (00626:1403). Measured: a manufacturer-org co-member of the designer reads `site_cards 0 | seats 0 | authority 0 | docs 0` and an UPDATE lands on 0 rows. **The same shape survives in 00627's definer readers — BLOCKING-1 below** |

### The 40 carried MINORs, re-checked

| # | status this round |
|---|---|
| MINOR-1 (a caller date cannot beat a live window) | **OPEN** — probe127: asked for 5 days, got 69 |
| MINOR-2 (one `blocks` write moves `lapsed` → `current`, no audit) | **OPEN** — probe122(a) |
| MINOR-3 (the eleven tiers are not crm-model §2's eleven) | OPEN — 11 named, 6 populated locally |
| MINOR-4 (four branches carry a LINK id as `subject_id`) | **OPEN** — `00627:163` (`'link', p.id`), `:198` (`'link', il.id`); confirmed over the API (`subject_type":"link","subject_id":"ad500000-…"`) |
| MINOR-5 (`project_review.granted_by = pra.revoked_by`) | **OPEN** — `00627:375` |
| MINOR-6 (`client_account.last_used_at = dc.last_contacted_at`) | **OPEN** — `00627:258` |
| MINOR-7 (`people_directory` restates GRANT with no REVOKE) | **OPEN** — `00626:1302`; measured `anon=arwdDxtm/postgres`, `has_table_privilege('anon',…,'SELECT') = true`; reads nothing (`permission denied for table studio_contacts`) |
| MINOR-8 (`site_access_mode` carries `code` in the no-code wave, nullable) | **OPEN** — `00624:129` |
| MINOR-9 (stage vocabulary drift vs direction §3.8's nine words) | **OPEN** — `00624:117-121` |
| MINOR-10 (the backfill guard cannot protect a hand-set `active`) | **OPEN** — `00624:290-298` |
| MINOR-11 (three formulas for the paper word) | CLOSED (r4 MAJOR-2's `identity_paper_state`) |
| MINOR-12 (two ungated definer oracles) | **OPEN, and one half proven**: as the Phase One Synthetic owner, `project_designer('d0e00000-…-000a')` returns `a0000000-…-0004` while `is_active_studio_member(<that project's studio>) = f`. `project_party_org` could not be walked the same way (its argument had to come through the caller's own RLS), so it is an oracle only for a seat uuid the caller already holds |
| MINOR-13 (`studio_id IS NULL` projects fall back to `_primary_studio_for`) | **OPEN, and now it has a measured consequence — promoted to MAJOR-1** |
| MINOR-14 (`v_window_end::timestamptz` is session-timezone-dependent) | **OPEN** — `00627:465-466` |
| MINOR-15 (`w1b-report.md` says `use-party-sms.ts:133` is the only call site) | **OPEN** — `supabase/functions/_shared/sms.ts:565` is the second |
| MINOR-16 (`people_crm_dev.sql` in `[remotes.staging.db.seed]`) | **OPEN** — `supabase/config.toml:60` and `:88` |
| MINOR-17 → MINOR-26 (`w1b-report.md` stale) | **OPEN, see MINOR-35** |
| MINOR-18 (00626's comment claims a degrade `field_link_tokens`' second policy prevents) | **OPEN** — `00626:85-89`; `field_link_tokens` carries both `…_designer_all` and `…_studio_rw` (`is_studio_comember(p.designer_id)`), so the "co-member without designer visibility" the comment describes does not exist |
| MINOR-19 (the seed's `ON CONFLICT DO UPDATE` leaves a mixed evidence set) | **OPEN** — `people_crm_dev.sql:533-542` sets `status/consented_at/source/evidence/opt_out_*/refusal_unanswered/origin_project_id` and NOT `recorded_at`, `recorded_by`, `disclosure_version`, `opt_out_recorded_at`. Service-role-only |
| MINOR-20 (no stage check on the mint) | **OPEN** — probe127: an `off_job` seat is handed a fresh 90-day door |
| MINOR-21 (no test legs for r2's three MAJORs) | CLOSED (r3) |
| MINOR-22 (`access_grants_trade_agreement_links` gates on `ag.contact_id`, labels with `a.contact_id`) | **OPEN** — `00627:128` vs `:135` |
| MINOR-23 (`identity_seat_count` reads under `project_parties`' policies, the seats view under four legs) | **OPEN, and the two predicates now differ more** than when it was written: the seats view gained the tenant conjunct and `identity_seat_count` (00626:308-318) did not, so the claim is computed over a strictly broader set. 0 disagreements on the fixture (probe120 A5) |
| MINOR-24 (a client-branch row can never nest a seat) | CLOSED (r3 MAJOR-2 → `0::integer` on all four branches) |
| MINOR-25 (`verified_by` is an unconstrained `profiles` FK) | **OPEN** — `00623:103`; probe122(d): a member set `verified_by` to the owner's profile id and `verified_at = now()` in one write |
| MINOR-26 (the consent DATES are absent from every carded human's row) | **OPEN** — R-BC permits "left empty"; stays MINOR |
| MINOR-27 (`people_directory_scope_test.sql`'s stale column count) | **OPEN** — still `ERROR: FAIL a2: expected exactly 12 columns, got 17`, exit 3. One line |
| MINOR-28 (W1a's two reds plus the unrelated `trade_rfq_test`) | **OPEN** — same three, same messages, §1.5 |
| MINOR-29 (`field_link_window_closed` is unreachable and its COMMENT promises a refusal) | **OPEN** — `00627:474` vs the `ELSE now() + interval '90 days'` at `:469` |
| MINOR-30 (the five appended columns' cost against a `select('*')` room) | OPEN |
| MINOR-31 (`blocks` is not in the trigger's `UPDATE OF` list) | **OPEN** — probe122(a): one `UPDATE … SET blocks = '{}'` on Northgate Electric's 2026-03-31 gating lapse, as an ordinary member → `current` |
| MINOR-32 (`project_parties.studio_contact_id` has no same-studio guard) | **OPEN** — the trigger at `00623:476-480` covers `company_id`, `warranty_contact_person_id`, `project_id` and not `studio_contact_id` |
| MINOR-33 (`party_identity_key` / `party_kind_in_directory` pin no `search_path`) | **OPEN** — `proconfig` NULL on both, `search_path=public` on all 21 others. Both bodies resolve only to `pg_catalog` builtins, so nothing is hijackable today; `party_identity_key` nonetheless carries an expression index (`00626:218-222`) |
| MINOR-34 (the two new views revoke from `PUBLIC, anon` but not `authenticated`) | **OPEN** — `authenticated=arwdDxtm/postgres` on both, from the blanket seed; both views are non-updatable |
| MINOR-35 (`w1b-report.md` is the record of an old code state) | **OPEN AND WORSE — now SIX rounds stale.** `grep -c` over the report: `identity_paper_state` 0, `identity_phone_numbers` 0, `identity_consent_status` 0, `identity_consent_evidence` 0, `reach_state_for_identity` 0, `party_kind_in_directory` 0, `field_link_window_closed` 0, `compliance_successor_undated` 0, **`is_active_studio_member` 0** — i.e. the report does not mention the predicate that is now on eight of the wave's twelve new policies. `w1b-report.md:131` still describes r4 MAJOR-2 **as a feature** ("`paper_state` \| `compliance_state(COALESCE(company_id, id))`"); §3 prints the site-access policies as `is_studio_comember(project_designer(project_id))` alone; §7 claims `passed=12` where the suite now has 13 blocks and `654 7` on `database.types.ts` where there is no diff at all. §5 calls the four definer readers "behind an explicit studio gate", which for three of them is exactly what BLOCKING-1 disputes |
| MINOR-36 (two more one-write `lapsed` → `current` paths: reparent, date edit) | **OPEN** — probe122(b): one `UPDATE … SET expires_on = CURRENT_DATE + 400` → `current` |
| MINOR-37 (one firm, two Directory rows) | **OPEN and re-measured** — probe127: `Rivera Finishes` appears as `contact/d0e20000-…-0019/seat_count 0` **and** `sub/d0e30000-…-0091/seat_count 1`; the card's `phone_e164 = +16125550219` equals the unstamped seat's, and `party_identity_key()` never consults the rolodex for it (crm-model §4 rule 2 would have collapsed them). Both rows agree on every word, so nothing lies; the head over-counts by one and PR-g's mixed list shows one firm twice |
| MINOR-38 (`identity_consent_evidence()` re-ran the reduction per number) | CLOSED — r5's `WITH decided` CTE (00626:786-789) |
| MINOR-39 (the suite's gate test tested only the passing case) | CLOSED — suite block 13 `13j`–`13n1` |
| MINOR-40 (`told_refs uuid[]` and `emergency_lines jsonb` carry no shape guard) | **OPEN** — `00625:86`, `:92`, `:98-99`; `emergency_lines` is checked only for `jsonb_typeof = 'array'`, not the `{label,name,phone}` shape its own COMMENT at `:133-135` documents |

---

## 4. Findings

### BLOCKING-1 — three of 00627's four SECURITY DEFINER access-grant readers are gated on `is_studio_comember(<designer>)`, not on the tenant; a *manufacturer*-organisation co-member reads another studio's invoice-link, plan-transmittal and RFQ grants over the public REST API

**Files:** `supabase/migrations/00627_access_grants_and_field_link_window.sql:101`
(`access_grants_trade_rfq`), `:170` (`access_grants_plan_transmittals`), `:204`
(`access_grants_invoice_links`).

This is r5 MAJOR-3's finding, in the one place that round did not look. Its §5 clean list
says "the four definer readers return 0 to a foreign owner" — and they do, because a
foreign owner shares no organisation with anybody. The population r5 MAJOR-3 was *about*
is the caller who shares **one** organisation with the designer of record and is not a
member of the owning studio, and nobody pointed that caller at these four functions.

Three of the four are `SECURITY DEFINER`, so the gate is the **whole** access rule — there
is no RLS behind it — and all four are `GRANT EXECUTE … TO authenticated` in `public`, so
PostgREST publishes them at `/rest/v1/rpc/<name>`.

**The gate is also broader than the shipped policy the banner claims it restates.**
`00627:105-113` says of the RFQ reader "The gate is the table's own shipped policy,
restated", and `:178-183` says the same for plan transmittals. The shipped policies are:

```
trade_rfq_tokens_studio_rw         ALL  …is_design_studio_comember(p.designer_id)
plan_transmittal_tokens_studio_rw  ALL  …is_design_studio_comember(p.designer_id)
```

`is_design_studio_comember` requires the shared organisation to be
`type = 'design_studio'`; the readers call `is_studio_comember`, which accepts
`manufacturer`, `contractor` and `admin_team` too. The two remaining sources are worse
than a restatement: `invoice_links` and `studio_trade_agreement_tokens` have RLS enabled
with **zero policies** and no `SELECT` grant to `authenticated` (§2.3), so before this wave
**no authenticated caller could read them at all**, and `access_grants_invoice_links()`
invents a gate rather than restating one.

**Walked** (`probe118`), with a `manufacturer` organisation holding the seeded studio's
designer and one outsider:

```
=== the two predicates, on the same designer ===
 readers_gate_is_studio_comember | shipped_policy_gate | member_of_the_owning_studio
 t                               | f                   | f

=== what the definer readers hand a manufacturer-org co-member ===
   branch    | count
 rfq_link    |     1
 plan_link   |     1
 invoice_pay |     1

=== and the objects r5 tightened, for contrast ===
 site_cards | seats | authority
          0 |     0 |         0
```

**And over the public API** (`probe123`, a locally minted HS256 JWT for that outsider;
`probe124` commits the fixture, `probe125`/teardown removes it):

```
=== 00627's four definer readers, over /rest/v1/rpc ===
  access_grants_invoice_links     -> HTTP 200 [{"grant_id":"invoice_pay:ad300000-…","tier":"invoice_pay",
      "subject_type":"link","subject_id":"ad300000-…","scope_type":"invoice",
      "scope_id":"b0000000-0000-0000-0000-00000000e141","granted_by":"a0000000-…-0004","granted_at":"20…
  access_grants_plan_transmittals -> HTTP 200 [{"grant_id":"plan_link:ad500000-…","tier":"plan_link",
      "scope_type":"project","scope_id":"d0e00000-0000-0000-0000-00000000000a","granted_by":"a0000000-…
  access_grants_trade_rfq         -> HTTP 200 [{"grant_id":"rfq_link:ad700000-…","tier":"rfq_link",
      "subject_type":"engagement","subject_id":"d0e30000-0000-0000-0000-000000000004",
      "scope_type":"proposal","scope_id":"b0000000-0000-0000-0000-000000000001","granted_by":"a0000000-…
  access_grants_trade_agreement_links -> HTTP 200 []          ← the one that IS tenant-scoped

=== controls: the objects r5 tightened ===
  people_directory_seats      -> HTTP 200 []
  project_site_access_cards   -> HTTP 200 []
  project_party_authority     -> HTTP 200 []
  studio_compliance_documents -> HTTP 200 []
```

No bearer credential is returned — the report's rule holds. What is returned is the shape
of another studio's paperwork: which invoices have live pay links and when they were last
viewed, which projects have live plan transmittals, which seat on which proposal was sent
an RFQ, and which profile opened each door. `subject_id` on the RFQ branch is a
`project_parties` id of the other studio's job.

**Severity.** The brief's BLOCKING class is "any cross-tenant read or write; an RLS or
grant hole", and this is a definer read of another tenant's rows reachable over the public
API by a caller of a different organisation *type*. r5 recorded the structurally identical
finding as MAJOR-3 and left promotion to Fable; I am grading it BLOCKING because (a) the
caller here fails even the shipped policy's own predicate, and (b) two of the sources were
service-role-only and the reader manufactures the access.

**Fix.** Put the tenant first, the way r5 did everywhere else, and keep the shipped
predicate beside it:

```sql
-- access_grants_plan_transmittals
WHERE public.is_active_studio_member(public.project_consent_org(pj.id))
  AND public.is_design_studio_comember(pj.designer_id);

-- access_grants_trade_rfq   (pr.designer_id → the proposal's project, or _primary_studio_for)
WHERE public.is_active_studio_member(public.project_consent_org(pr.project_id))
  AND public.is_design_studio_comember(pr.designer_id);

-- access_grants_invoice_links
WHERE public.is_active_studio_member(public.project_consent_org(inv.project_id))
  AND public.is_design_studio_comember(inv.designer_id);
```

and correct `00627:105-113` / `:178-183`, which currently state something untrue about the
gate. The suite needs a block-13-shaped leg over all four readers: r5's own §5 claim
("return 0 to a foreign owner") is the leg that exists, and it is the wrong actor.

---

### MAJOR-1 — on a project whose `studio_id` is NULL, r5's tenant conjunct hides every seat, site access card and authority grant from the members of the studio doing the work, and refuses their writes

**Files:** `00626:1123` (party branch), `00626:1403` (seats view),
`00625:210`/`:220`/`:230`/`:244`, `00624:459`/`:475`/`:491`/`:508`.

`project_consent_org(p)` is `COALESCE(p.studio_id, _primary_studio_for(p.designer_id))`.
When `studio_id` is NULL it names whatever studio the resolver picks for the designer —
which need not be the studio doing the work, and on this fixture never is:

```
 name                    | studio_id        | resolved_name    | seats
 Aspen Loft Refresh      |                  | Leah Hartwell    |     0
 Birch Hollow            |                  | Leah Hartwell    |     0
 Cedar Lane Study        | Local Dev Studio | Local Dev Studio |     0
 Chen Residence          |                  | Leah Hartwell    |     0
 Lindqvist kitchen       | Local Dev Studio | Local Dev Studio |     7
 Marrow & Vale Residence |                  | Leah Hartwell    |     0
 Okonkwo residence       | Local Dev Studio | Local Dev Studio |    24
 Olsen Lake House        |                  | Leah Hartwell    |     0
```

**Five of eight local projects.** `studio_manager@patina.dev` is an **admin of Local Dev
Studio** and a co-member of the designer of record, and is not a member of the org the
resolver names. Walked (`probe121`) with a seat, a site access card and an authority grant
written on `Aspen Loft Refresh` by `service_role`:

```
-- the admin of the studio actually doing the work
 member_of_local_dev | member_of_the_resolved_org | comember_of_the_designer
 t                   | f                          | t

=== AS THE ADMIN of Local Dev Studio ===
 seats_seen | directory_rows | cards_seen | grants_seen | raw_seats_seen
          0 |              0 |          0 |           0 |              1
                                                           ↑ project_parties itself is visible

-- and may the admin RECORD a card on such a project at all?
NOTICE:  admin INSERT refused: new row violates row-level security policy for table
         "project_site_access_cards"

=== AS THE OWNER (a member of BOTH orgs) — the control ===
 seats_seen | cards_seen | grants_seen
          1 |          1 |           1
```

For `people_directory` this is a **regression**, not merely a new object being unreachable.
00594's party branch carried no tenant leg:

```
00594:1339-1345
FROM public.project_parties pp
JOIN public.projects pj ON pj.id = pp.project_id
WHERE pp.party_kind IN ('gc','sub','installer','receiver','architect','photographer','stager')
  AND ( public.is_studio_comember(pj.designer_id)
     OR public.is_studio_comember(pj.lead_designer_id)
     OR public.is_studio_comember(pj.created_by) )
```

so that admin used to see the seat on the People room and now does not: the record holds a
human on the job and the reader shows nobody. And the three new tables are not merely
invisible — the room's own acts (record the way in, record who signs money) are refused for
that whole class of projects, by the studio's own admin.

MINOR-13 has been open since r2 as "the resolver can name a studio that is not the one
doing the work". r5 made that observation load-bearing without measuring what it now
decides.

**Fix** — one of:
1. Backfill `projects.studio_id` for every project that resolves through the fallback, in
   the same migration, and keep the conjunct (cleanest; `project_consent_org` then stops
   guessing for the People room).
2. Keep the fallback but require it to agree with the designer's own studios:
   `is_active_studio_member(project_consent_org(pp.project_id)) OR (pj.studio_id IS NULL AND <the three co-member legs>)`
   — which restores the old population exactly where the resolver is guessing.
3. Rule it acceptable and say so in the banner, with the prod count measured first.

Whichever is chosen, **the number of `studio_id IS NULL` projects on Strata has to be
measured before this chain runs**; on the local fixture the answer is 5 of 8, and the report
never asks the question.

---

### MAJOR-2 — the client, lead, maker and team branches of `people_directory` are still `is_studio_comember(...)` alone, so a manufacturer-org co-member of the designer reads the studio's households with names, emails and phones

**Files:** `00626:898` (client), `:936` (lead), `:985`/`:991` (maker), `:1185` (team).
Compare `:1123` (party, tenant-scoped by r5) and `:1234` (contacts,
`is_active_studio_member(sc.organization_id)`).

Walked (`probe126`) with the same manufacturer-organisation actor as BLOCKING-1:

```
-- premise
 comember_of_designer | design_studio_comember | member_of_local_dev
 t                    | f                      | f

-- what this caller reads from people_directory, by role
  role  | count
 client |     6
 lead   |     5

-- the client rows
 client | Karin Lindqvist                    | karin@lindqvist-household.com | (612) 555-0190
 client | The Okonkwo household              | adaeze@okonkwo-household.com  | (612) 555-0104
 client | Elena Marlowe (no-login household) |                               |
 client | The Ashfords (no-login household)  |                               |
 client | Client User                        | client@patina.dev             |
 client | Nora Ellison                       | client-solo@patina.dev        |
 lead   | Elena Ruiz  | elena.ruiz@example.com     |
 lead   | Marcus Wright | marcus.wright@example.com |

-- and the objects r5 tightened, for contrast
 seats | cards | authority | docs
     0 |     0 |         0 |    0
```

**This predicate is carried verbatim from 00594/00420** and r5's §5 clean list names it
explicitly as clean-because-carried ("client `is_studio_comember(dc.designer_id)`"), so
Fable may well rule it pre-existing and out of scope. I am reporting it because r5's own
fix is the argument against it: the round ruled that predicate insufficient for the seat
row and for three new tables, and left it standing on four branches of the same view — so
`people_directory` is now tenant-scoped on two branches of six and not on four, and the
un-scoped four are the ones that carry a homeowner's name, email and telephone number. The
brief's BLOCKING class covers the read; the fact that the wave did not author the line is
why I have graded it MAJOR rather than BLOCKING.

**Fix (if in scope).** `AND public.is_active_studio_member(public.designer_primary_org(...))`
is not available as one resolver on those branches, but `designer_clients`, `leads` and
`vendors` all reach an organisation; the narrow version is to make the four branches agree
with the party branch by resolving the designer's studio the same way, in one conjunct, and
to say in the view's COMMENT which branches are tenant-scoped and which are not. If Fable
rules it out of scope, the banner should say so rather than leave the inconsistency silent.

---

### MINOR findings

| # | Finding | Cite | Evidence |
|---|---|---|---|
| MINOR-1 … MINOR-40 | **Carried from r2/r3/r4/r5 — statuses in §3.** 27 open (MINOR-11, 21, 24, 38, 39 closed); MINOR-35 worse again; MINOR-13 promoted to MAJOR-1 | see §3 | see §3 |
| MINOR-41 | **NEW. One `DELETE` by an ordinary studio member takes a gating lapse off a card, and the table's own COMMENT promises it cannot happen.** `studio_compliance_documents_member_delete` grants DELETE to any active member with no narrowing, while `00623:190-198` says "A renewal sets `superseded_by` on its predecessor; **nothing is deleted**" and `:117-119` repeats it. Walked as the studio's admin on Northgate Electric's 2026-03-31 `{site_access,draw}` lapse: `after_delete = current`. This is the MINOR-2/31/36 family (an explicit act on the document, not a laundering disguised as a renewal) and the record and the reader still agree afterwards, which is why it is MINOR — but the enumeration of one-write doors is now four (`blocks`, `expires_on`, reparent, DELETE) and the fourth contradicts a documented invariant | `00623:509-514`, `00623:190-198` | `probe122-…-lapse-doors.out` leg (c) |
| MINOR-42 | **NEW. `identity_seat_count()` and `people_directory_seats` now count over different populations.** r5 added `is_active_studio_member(project_consent_org(pp.project_id))` to the seats view (`00626:1403`) and not to `identity_seat_count()` (`00626:308-318`), which still scans `project_parties` under that table's own `is_studio_comember(designer)` policies. A row's `seat_count` is therefore computed over a strictly broader set than the seats it can nest, and the divergence is reachable by exactly the caller BLOCKING-1 and MAJOR-1 describe. 0 disagreements on the fixture (`rows_overclaiming = 0` over 62 rows), because every seeded seat sits on a project whose `studio_id` is set. This is carried MINOR-23 with a new cause; the one-line fix is the same conjunct | `00626:308-318` vs `00626:1403` | read; `probe120` A5 |
| MINOR-43 | **NEW. `00627`'s three RFQ/plan/invoice readers misdescribe their own gate in prose.** `:105-113` "The gate is the table's own shipped policy, restated" and `:178-183` "The gate is that policy, restated" are false: the shipped policies use `is_design_studio_comember`, the readers use `is_studio_comember` (§2.2). `:214-218` describes `access_grants_invoice_links`' gate as "the invoice's designer must be a studio co-member" without saying that `invoice_links` had no authenticated read path at all before this file. A reader auditing the ACL decision from the banner would conclude nothing changed | `00627:105-113`, `:178-183`, `:214-218` | read; `probe118` |
| MINOR-44 | **NEW. `identity_consent_evidence()` will project a `consented_at` beside a `not_asked` word if a `not_asked` RECORD ever exists.** The suppression at `00626:790-792` is keyed only on `opted_out`; the `WHERE` at `:799-800` matches any record whose verdict equals the printed word, and `channel_consent_status()` returns `scc.status` verbatim for anything but a folded refusal. R-AG refuses `not_asked` as a target of `record_channel_consent`, and no CHECK on `studio_channel_consent.status` was relied on here, so the guarantee lives one table away from the formula. Unreachable on the fixture (`status` is only `granted`/`pending`/`opted_out`), and the honest fix is one clause: project `consented_at` only when the word is `granted` | `00626:790-792`, `:799-800` | read |

---

## 5. Things I checked that are clean, so the next round need not re-walk them

- **R-AY / R-AW** — no consent write in any of the five files; no view or function of this
  wave reads a frozen `sms_consent_*` column (measured against `pg_views`, not only the
  source); the freeze trigger's ten-column list is byte-identical and none of 00624's ten
  new columns joins it.
- **No reader disagrees with the record** — 0 consent mismatches over 49 contact rows, 0
  over 31 seat rows, 0 permissive words over a refused number, 0 dated consent claims
  beside a refusal, for both members of the seeded studio (`probe120`).
- **PR-r** — no `gate_code` / `code` / `access_code` / `lockbox_code` / `show_to_client`
  column; PR-w — four studio policies, no client leg, `anon` refused at the grant, a real
  client account reads 0 from all four new objects.
- **PR-n** — the admin gate is on INSERT/UPDATE/DELETE and not SELECT, and the UPDATE
  policy carries it in both `USING` and `WITH CHECK`, so scope escalation is refused.
- **PR-p** — `people_directory` has 17 columns and no `stage`.
- **The twelve carried columns** — positions 1–12 unchanged in name, order and type; five
  appended at 13–17. The Strata append path is exercised by the reset itself (00594's
  12-column view is created, then replaced by this file).
- **One row per identity, and a row claims only what it nests** — `client 7 / contact 49 /
  lead 5 / sub 1`; `company 21 / person 28`; Dana Kowalski one row, `seat_count 2`,
  `field_link / granted / lapsed`, two seat lines; `rows_overclaiming = 0`.
- **The four supersede-laundering doors r1–r4 closed** are still closed
  (`compliance_successor_already_lapsed` on the control write).
- **`create_field_link`** — 00284's guard and supersede byte-identical, both signatures
  callable, the one-argument form a pure delegate, no branch dates a token in the past, and
  all six seeded links are `active` with expiries from 2026-11-21 to 2027-10-01.
- **`v_access_grants`** — eleven tiers, twelve columns, no token and no hash;
  `access_grants_trade_agreement_links` IS tenant-scoped (`is_active_studio_member(studio_contact_org(ag.contact_id))`)
  and returns `[]` to the BLOCKING-1 actor; `fulfillment_evidence_upload_tokens` is
  admin-only for `authenticated`, so the `evidence_upload` tier leaks nothing.
- **Trigger coverage** — `assert_compliance_holder` (10 named errors),
  `assert_project_party_cards` (5), `assert_party_authority_copy_to` (1),
  `assert_site_access_key_holder` (1); all four `SECURITY DEFINER`, `search_path=public`,
  `REVOKE ALL … FROM PUBLIC, anon, authenticated`, so only `postgres` and `service_role`
  hold EXECUTE (measured).
- **The dev seed replays** idempotently on an already-seeded database, and the field-link
  block guards on an existing active token rather than re-minting.
- **The suite** — 13 blocks, `All W1b assertions passed`, including block 13's tenant
  boundary with its `13j`–`13n1` legs (r5 MINOR-39's gap) and `4e18`–`4e23` (r5 MAJOR-2).

---

## 6. What would make this clean

1. **BLOCKING-1** — tenant-scope the three definer readers in 00627 (and correct their
   banners). One conjunct each, plus one suite block pointing the block-13 actor at all
   four readers.
2. **MAJOR-1** — decide what `project_consent_org()`'s fallback may decide. Either backfill
   `projects.studio_id`, or let the three new tables and the two views fall back to the
   co-member legs when `studio_id IS NULL`. Measure the Strata count first.
3. **MAJOR-2** — rule it: either tenant-scope the client/lead/maker/team branches or state
   in the view's COMMENT that four of six branches are designer-scoped by inheritance.
4. Free while you are in the files: **MINOR-27** (one line, `12` → `17`), **MINOR-33**
   (`SET search_path TO 'public'` on the two immutable helpers), **MINOR-7** (`REVOKE ALL ON
   TABLE public.people_directory FROM PUBLIC, anon` beside its GRANT), **MINOR-42** (the
   same conjunct in `identity_seat_count`), **MINOR-43/44** (prose and one CASE clause), and
   **MINOR-35** — `w1b-report.md` is now six rounds stale and does not contain the string
   `is_active_studio_member` anywhere, which is the predicate on eight of the wave's twelve
   new policies. It is the document Fable and W2 will read.

---

## 7. Not a finding, for the record

- **`probe119`'s first sweep reported 49 consent mismatches and 21 seat mismatches. Both
  were artefacts of the probe, not of the view**, and are recorded here so the number is
  not quoted later: the ground-truth table was built while connected as `postgres`, where
  `is_active_studio_member()` is false, so `identity_consent_status()` returned NULL for all
  49 rows; and the seat comparison used the raw `channel_consent_status()` (NULL where no
  record) against the view's documented `COALESCE(…, 'not_asked')`. `probe120` re-derives
  the truth from `studio_channel_consent` itself and reports 0 and 0.
- **The earlier RLS/grant snapshot in this session showed `organization_members` with no
  `SELECT` for `authenticated`.** That reading was taken inside the other session's reset
  window (§0) and is wrong; re-measured, `organization_members` carries the blanket
  `authenticated=arwdDxtm/postgres`.
- **`field_link_tokens` rows reach the BLOCKING-1 actor through `v_access_grants`'
  invoker branch 3** (`field_link 6` in `probe117`/`probe123`). That is
  `field_link_tokens_studio_rw` — `is_studio_comember(p.designer_id)`, shipped in 00283/00584
  with a `SELECT` grant — so the view surfaces what the table already permits and adds
  nothing. Named because it appears in the same probe output as the finding and is not part
  of it. It is also the counter-example to `00626:85-89`'s claim (MINOR-18).
- **`project_party_org(NULL)` returning NULL** in `probe127` is not a closed oracle: the
  argument had to be fetched through the caller's own `project_parties` RLS, which returned
  nothing. The function itself is still ungated (MINOR-12).
- The `w1b-report.md` §5 "finding for Fable" about the dead policies on `trade_rfq_tokens`
  and `plan_transmittal_tokens` is real and now sharper: BLOCKING-1's fix should use
  `is_design_studio_comember`, the predicate those dead policies actually carry.
