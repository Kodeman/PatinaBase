# W1b — adversarial migration review, final run round 3

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **No prod act:
no `supabase db push`, no `supabase functions deploy`, no Strata connection.**

Reviewed in full: `00623_studio_compliance_documents.sql`,
`00624_project_party_window_and_authority.sql`, `00625_project_site_access_cards.sql`,
`00626_people_directory_v4_seats.sql`, `00627_access_grants_and_field_link_window.sql`,
`supabase/seed/people_crm_dev.sql`, `supabase/seed/00-legacy-grants.sql`, `supabase/config.toml`,
`supabase/tests/people/w1b_compliance_authority_directory_test.sql`, and the grep-winner bodies
(`00284:37` for `create_field_link`, `00594:1211-1458` for `people_directory`).

Read first, as instructed: `rulings.md` (all of §3, R-A…R-AY, including R-AW/R-AY),
`synthesis/direction.md` §2.2/§3.8/§7/§8, `synthesis/crm-model.md` §1/§2/§4/§5,
`briefing/current-state.md` §B–§E, `briefing/fixture.md`, `build/inventory.md`,
`build/w1a-report.md`, `build/w1a-close-review-r6-migrations.md`, `-tests.md`,
`build/w1b-report.md`, `build/w1b-final-review-r2-migrations.md`, `-tests.md`,
`build/w1b-final-fix-log-r2.md`.

**Verdict: NOT clean — 0 BLOCKING, 2 MAJOR, 24 MINOR (22 carried, 2 new).**

---

## 0. Environment, before the destructive local act

```
$ ls -la apps/designer-portal/.env.local
"apps/designer-portal/.env.local": No such file or directory (os error 2)
```

The worktree has no `apps/designer-portal/.env.local`, so nothing in it can point at Strata. The
brief's guard is satisfied by absence rather than by a grep.

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -Atc \
    "select version from supabase_migrations.schema_migrations order by version desc limit 8;"
20260910152111  00627  00626  00625  00624  00623  00622  00621
```

### ⚠ A second session was resetting this database while I ran

Recorded because it cost two runs and because the brief says this wave is the database's sole owner.
My first pass of the W1b suite died mid-block-9:

```
psql:.../w1b_compliance_authority_directory_test.sql:1070: server closed the connection unexpectedly
psql:.../w1b_compliance_authority_directory_test.sql:1070: error: connection to server was lost
```

and the next statement found an empty database (`relation "public.organizations" does not exist`,
`count(*) from pg_tables where schemaname='public'` → **0**). It was not a backend crash:

```
$ ps aux | grep "supabase db reset"
kody  70557 ... supabase db reset            # started 10:40AM, parent: a pnpm --dir <this worktree>
                                             #   supabase:reset piping to `tail -20` — not my command
kody  71398 ... supabase db reset            # started 10:41AM, mid-flight through MY reset
$ docker ps --format '{{.Names}}\t{{.Status}}' | grep supabase_db
supabase_db_supabase    Up 5 seconds (health: starting)
```

My own first reset also failed for the same reason
(`LegacyMigrationApplyError … Connection error At statement: 36 GRANT SELECT ON TABLE
public.studio_trade_agreements TO authenticated`, RESET_A_EXIT=1). **Neither failure is a defect in
00623–00627**: once the other resets cleared, two consecutive resets of my own ran green (§1.2).
Everything below was measured after that. Flagged so Fable can stop the other session before the
next round, and so nobody reads RESET_A's log as a migration failure.

---

## 1. What I ran

### 1.1 Legacy grants, regenerated first

```
$ python3 scripts/generate-legacy-grants.py
wrote .../supabase/seed/00-legacy-grants.sql — baseline + 2707 replayed statements
$ git diff --stat -- supabase/seed/00-legacy-grants.sql
                                        # (empty — committed file already matches the generator)
$ git status --porcelain                # (empty)
```

The grants file is in sync with the five migrations' GRANT/REVOKEs. **PASS.**

### 1.2 Reset, twice, after the contention cleared

```
$ pnpm --dir <worktree> supabase:reset
RESET_B_EXIT=0        # 555 "Applying migration" lines
Seeding data from supabase/seed/cloudflare-phase1-staging.sql...
Seeding data from supabase/seed/people_crm_dev.sql...
Seeding data from supabase/seed/99-local-edge-settings.sql...
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
$ grep -in error <log>
448:Applying migration 00458_sms_message_error_capture.sql...      # a FILENAME, not an error

$ pnpm --dir <worktree> supabase:reset
RESET_C_EXIT=0                                                    # same, clean
$ psql … -Atc "select version … limit 6"
20260910152111 00627 00626 00625 00624 00623
```

**PASS.** Both resets replay 00623–00627 and the dev seed with no error.

### 1.3 The dev seed replays on an already-seeded database

```
$ psql … -v ON_ERROR_STOP=1 -f supabase/seed/people_crm_dev.sql
SEED_REPLAY_EXIT=0        # no error, no warning
person_cards=28  company_cards=21  docs=36  authority=11  consent=7
seats=31  site_cards=1  field_links=6                     # identical to the post-reset counts
```

**PASS** — idempotent, including the field links, which are minted through the RPC and superseded
rather than duplicated.

### 1.4 Both people suites, and every shipped suite that touches the changed objects

```
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
W1B_EXIT=0
NOTICE:  1. compliance_state: four words, the 30-day boundary both ways, worst-first precedence, a
         superseded lapse released, and a gateless lapse that changes nothing until it holds a gate: passed
NOTICE:  2. the holder guard: … a dated type must carry its date (and may not be renewed by an
         undated one), and a supersede may not close a chain: passed
NOTICE:  3. people_directory v4: … and the consent word reduced worst-first over every number the
         identity carries — the card's and its seats': passed
NOTICE:  4. the uncarded identity: … reach reads a live door on a NON-winning seat (and stops reading
         a revoked or expired one), a mixed-kind identity nests every seat it claims, and no row
         anywhere claims a count it cannot nest: passed
NOTICE:  5. project_party_authority: … PR-n: passed
NOTICE:  6. copy_to: … passed
NOTICE:  7. the site access card: no code column and no client toggle (PR-r), four studio policies,
         a client reads nothing and anon is refused at the grant (PR-w): passed
NOTICE:  8. the key holder must be a seat on the card's own project: passed
NOTICE:  9. v_access_grants: … the four grant-closed sources read without raising: passed
NOTICE: 10. create_field_link: … the 90-day fallback survives for a windowless seat and for a CLOSED
         one, no mint is dated in the past or revokes on behalf of one …: passed
NOTICE: 11. the seat's new columns are writable by a member, the eight consent columns are still
         frozen …: passed
NOTICE: 12. the seeded fixture reads as the fixture: … passed
NOTICE:  All W1b assertions passed.
ROLLBACK                                                               (12 blocks, 12 NOTICEs)
```

```
people/w1b_compliance_authority_directory_test             exit=0
people/w1a_identity_channels_consent_test                  exit=0
field/field_links_test                                     exit=0
rls/project_roster_test                                    exit=0
rls/field_parties_test                                     exit=3  ERROR: consent_legacy_column_frozen
rls/people_directory_scope_test                            exit=3  ERROR: FAIL a2: expected exactly 12 columns, got 17
rls/sms_tables_test                                        exit=0
rls/studio_contacts_backfill_test                          exit=0
document/lead_contact_phone_test                           exit=0
rls/00584_studio_comember_rls_sweep.test                   exit=0
site_requests/security_and_lifecycle_test                  exit=3  ERROR: send must transition not_asked consent to pending
commercial/trade_rfq_test                                  exit=3  ERROR: design services agreement d9300000-… not found or access
```

Four shipped suites are red on this branch. `people_directory_scope_test` is **W1b's own**
(MINOR-27); `field_parties_test` and `site_requests/security_and_lifecycle_test` are the program's
W1a freeze/repoint (MINOR-28); `trade_rfq_test` fails on a design-services-agreement RPC with no
W1b object in the path and reads as unrelated. `.github/workflows/integration.yml:49` runs
`supabase test db` over this whole tree on the nightly cron, so all four are a red gate.

### 1.5 Replay / idempotency

```
# each file twice, in its own rolled-back transaction
00623_studio_compliance_documents             exit=0  REPLAY_OK
00624_project_party_window_and_authority      exit=0  REPLAY_OK
00625_project_site_access_cards               exit=0  REPLAY_OK
00626_people_directory_v4_seats               exit=0  REPLAY_OK
00627_access_grants_and_field_link_window     exit=0  REPLAY_OK

# all five replayed in one transaction, then the shapes:
people_directory_columns = 17
person_id role display_name email phone profile_id project_id designer_id status_raw
last_touch_at meta scope | reach_state consent_status paper_state contact_rule_summary seat_count
dated_expiry_check_count = 1
```

**PASS.** Twelve shipped columns in position, five appended, the new CHECK present exactly once.

### 1.6 Generated types, and the two type gates

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir <worktree> db:generate
GEN_EXIT=0
$ git diff --numstat -- packages/supabase/src/database.types.ts
                                        # (empty — no drift against the committed file)
$ grep -n "^      identity_consent_status:\|^      reach_state_for_identity:\|^      party_kind_in_directory:" …
34689:      identity_consent_status:
35258:      party_kind_in_directory:
35458:      reach_state_for_identity:
$ pnpm --dir <worktree> --filter @patina/supabase        type-check   → SUPABASE_TC=0
$ pnpm --dir <worktree> --filter @patina/designer-portal type-check   → DESIGNER_TC=0
```

**PASS.**

### 1.7 My own probes

`build/probe82-w1b-final-r3-seatcount-nesting.sql`,
`probe83-w1b-final-r3-claim-nest-reachability.sql`,
`probe84-w1b-final-r3-branch-claims.sql`,
`probe85-w1b-final-r3-cross-tenant.sql`,
`probe86-w1b-final-r3-reader-vs-record.sql`,
`probe87-w1b-final-r3-remaining-lapse-doors.sql`,
`probe88-w1b-final-r3-expired-successor.sql`,
`probe90-w1b-final-r3-link-expiry.sql`.
Every fixture inside `BEGIN … ROLLBACK`; objects and access only; the ledger was never probed.

---

## 2. Migration rules — pass/fail

| Rule | Verdict | Evidence |
|---|---|---|
| Hand-numbered `NNNNN_slug.sql`, minted above the reserved band | PASS | 00623–00627; 00595–00620 untouched; 00621/00622 pre-existed, so W1b minting from 00623 is right and the brief's "from 00622" was stale |
| Grep-winner graft before redefining | PASS | `grep -rln "CREATE OR REPLACE FUNCTION[^(]*create_field_link" migrations/*.sql \| sort \| tail -1` → `00284`; 00284's ownership guard and supersede are byte-for-byte in 00627:432-442, :481-484. `compliance_state`, `party_identity_key`, `identity_consent_status`, `reach_state_for*`, `identity_seat_count`, `contact_rule_summary`, `project_designer`, `project_party_org`, `party_kind_in_directory` and the four `access_grants_*` are first definitions (grep returns only the W1b file). `people_directory`'s grep-winner is `00594`; every branch predicate is carried verbatim (§5) |
| Banner + lineage | PASS | 00623:52-62, 00626:5-13 and :87-101, 00627:5-11 all name the lineage and the fix rounds |
| Idempotent | PASS | §1.5 |
| RLS in the same file | PASS | 00623:388-417, 00624:429-485, 00625:179-208 |
| Explicit grants both directions + REVOKE FROM PUBLIC, anon | PASS with one carried exception | every new table and both new views revoke then grant; **`people_directory` alone restates `GRANT SELECT … TO authenticated` with no REVOKE** (00626:829) — carried MINOR-7 |
| `anon` revoked on definer RPCs | PASS | all 20 new/changed functions: `anon` absent from every ACL; the four `assert_*` definers are `postgres,service_role` only |
| SECURITY DEFINER pins `search_path` | PASS | every definer carries `{search_path=public}` or `{public, extensions, pg_temp}`; the two IMMUTABLE pure functions carry none and reference only `pg_catalog` builtins |
| Schema-qualify extension fns | PASS | `extensions.gen_random_bytes`, `extensions.digest` (00627:486-487) |
| Guarded crons | N/A | no cron added |
| CHECK over enum | PASS | `stage`, `site_access_mode`, `contracted_through`, `doc_type`, `held_by`, `source`, `blocks`, `scope` are all named CHECKs, drop-and-re-add |
| Money integer cents | PASS | `threshold_cents integer` with `>= 0` (00624:305, :327-328); the fixture's $2,500 is `250000` |
| Regenerate `00-legacy-grants.sql` | PASS | §1.1 |

### 2.1 The RLS predicates the brief names

```
studio_compliance_documents  ×4  is_active_studio_member(organization_id)
project_party_authority      ×4  is_studio_comember(project_party_designer(engagement_id))
                                  + scope NOT IN ('money','draw_certify') OR is_org_admin_or_owner(project_party_org(...))  on I/U/D
project_site_access_cards    ×4  is_studio_comember(project_designer(project_id))   — no client leg, no show_to_client
```

**PASS**, exactly as specified. `code_like_columns = 0` on the site access card, and a client account
reads `0` from it (test block 7). PR-w and PR-r hold.

### 2.2 Cross-tenant — clean, in both directions

Two real studios (`Local Dev Studio` b0000000-…-0001 / designer@patina.dev; `Phase One Synthetic
Studio` cf120000-…-0001 / cf-phase1-alice), a full studio-B fixture staged as service_role, then both
directions (`probe85`):

```
=== A) as studio A owner: can anything of studio B be read? ===
 b_docs | b_authority | b_site_card | b_directory_rows | b_seats | b_grants | b_member_grants
      0 |           0 |           0 |                0 |       0 |        0 |               0

--- the functions, asked studio B questions by a studio A caller ---
 b_paper_word | b_identity_consent | b_record_verdict | b_seat_count | b_reach  | b_rule
 not_on_file  | not_asked          |                  |            0 | on_paper |

--- writes into studio B, attempted by a studio A member ---
NOTICE:  A -> B document refused: new row violates row-level security policy for "studio_compliance_documents"
NOTICE:  A updated B's document rows: 0
NOTICE:  A updated B's site card (rows matched by RLS): 0
NOTICE:  A -> B authority refused: new row violates row-level security policy for "project_party_authority"
NOTICE:  A -> B mint refused: not authorized to mint a field link for party e9000000-…-ffb1

=== B) as studio B owner (alice) ===
 a_docs | all_authority_visible | all_site_cards_visible | directory_rows | seats_rows | grants_rows
      0 |                     1 |                      1 |              2 |          1 |           2
                                  (her own)                (her own)        (her two cards)  (her own)
 a_paper_word for studio A's Northgate Electric = not_on_file
```

No cross-tenant read, no cross-tenant write, in either direction. `identity_consent_status` and
`identity_seat_count` are SECURITY INVOKER, so the seat set they reduce over is exactly the set
`project_parties`' own RLS shows the caller — R-AK's scoping holds on the read side too.

The two ungated oracles survive and are the only cross-tenant *facts* either caller can obtain:
`project_designer(<B's project>)` → B's designer uuid, `project_party_org(<B's seat>)` → B's org
uuid, to a studio-A caller. Carried MINOR-12.

### 2.3 The base tables `v_access_grants` unions

All eleven sources have RLS enabled; every SELECT/ALL policy is studio- or self-scoped
(`organization_members` ×3, `designer_clients`, `field_link_tokens` ×2, `document_shares`,
`site_request_access`, `site_requests`, `project_review_access`, and
`fulfillment_evidence_upload_tokens` which is platform-admin-only for `authenticated`, so the
`evidence_upload` branch — the one carrying `md5(token)` — is empty for a studio member). The seven
branches with no WHERE of their own are therefore not holes. **PASS.**

### 2.4 The stage/window backfill

```
UPDATE project_parties SET stage = CASE WHEN COALESCE(pj.completed_at, pj.updated_at)
       > now() - interval '12 months' THEN 'warranty' ELSE 'off_job' END
  … WHERE pj.status='completed' AND pp.stage='active';                      (00624:283-292)
```

Fires no other trigger: `assert_project_party_cards_trg` is `UPDATE OF company_id,
warranty_contact_person_id, project_id` and `refuse_legacy_consent_write_trg` is `UPDATE OF` the
eight consent columns plus `phone`/`phone_e164` (R-AX) — `stage` is on neither list, confirmed from
`pg_get_triggerdef`. Idempotent on replay because the guard no longer matches. **PASS**, with carried
MINOR-10 (the guard cannot protect a hand-set `active`).

### 2.5 `create_field_link` — the graft and the expiry

00284's body diffed against 00627's two-argument body: the `party % not found` lookup, the
`auth.uid() IS NOT NULL AND NOT EXISTS (… designer_id = auth.uid())` guard, the supersede UPDATE and
the hash-at-rest mint are identical; the only additions are `v_window_end`/`v_expires` and the
explicit `expires_at` on the INSERT. The one-argument signature is a pure delegate
(00627:520-529), so `use-party-sms.ts:133` and `_shared/sms.ts:565` both move to the window rule with
no call-site change. Measured (`probe90`):

```
MINOR-1  live window 2027-08-13, caller asked 2026-09-15, minted 2027-08-14 -> caller honoured: f
MINOR-20 off_job seat, window closed 40d ago: minted 2026-12-11 (= 90 days: t)
UTC session     -> expires_at 2027-10-01 00:00:00+00   (window end 2027-09-30)
Chicago session -> expires_at 2027-10-01 00:00:00-05
```

**PASS** on the graft and on PR-d/PR-l's default; the three carried MINORs are unchanged.

### 2.6 Consent — R-AY/R-AW holds in W1b

No W1b migration writes `studio_channel_consent` or any `project_parties.sms_consent_*` column; every
consent read in the five files resolves through `channel_consent_status()`
(00626:669-671, :782, :892-894). Live audit:

```
functions whose body mentions sms_consent_status:
  backfill_channel_consent_from_parties · channel_value_was_on_sms_rail
  fc_dispatch_optin_invite · refuse_legacy_consent_write          (all W1a's, none W1b's)
views:  people_directory (a JSON KEY name; the value is q.consent_word, the record's verdict)
        v_project_roster (COALESCE(channel_consent_status(project_consent_org(...)), 'not_asked'))
```

`studio_channel_consent` is `SELECT`-only for `authenticated` (one member policy, no INSERT/UPDATE
grant), so **no authenticated write path to a consent record exists at all** — the two BLOCKING
consent classes are unreachable from anything W1b adds. Reader-versus-record, whole fixture
(`probe86`):

```
=== no Directory row is MORE PERMISSIVE than the record for any number it carries ===
 pairs | face_hides_a_refusal | face_overstates
    49 |                    0 |               0
=== no seat line is more permissive than the record ===
 seats | seat_overstates
    31 |               0
=== Pete Rusk ===
 Pete Rusk | opted_out | on_paper | current | 2 seats
 Pete Rusk | Okonkwo residence | opted_out | +16125550112
 Pete Rusk | Lindqvist kitchen | opted_out | +16125550112
 +16125550112 | opted_out | refusal_unanswered f | opt_out_at 2025-12-03 21:00+00
```

**PASS.**

---

## 3. r2's three MAJORs — all closed, and re-walked

| r2 finding | Status | Evidence |
|---|---|---|
| MAJOR-1 — `compliance_state()` printed `current` over a firm whose lapsed gating COI was on file, through the undated successor and the two-row cycle | **FIXED for both named doors** | `studio_compliance_documents_dated_expiry_check` present exactly once after a double replay; `compliance_successor_undated` (00623:320-327) and `compliance_successor_already_superseded` (00623:340-347) both in the trigger; test block 2's title now names all three. **But the same consequence is reachable through a third door — MAJOR-1 below.** |
| MAJOR-2 — the carded human's consent word came off the CARD's number | **FIXED** | `identity_consent_status()` (00626:413-441) reduces worst-first over the card's number plus every seat keyed to the same identity; `face_hides_a_refusal = 0` over all 49 pairs; test block 3's title names it |
| MAJOR-3 — `reach_state` on an uncarded identity saw only the winning seat's links | **FIXED** | `reach_state_for_identity()` (00626:331-356) matches on `party_identity_key`; test block 4 covers the live-link-on-a-non-winning-seat, revoked and expired cases |

### The 26 r2 MINORs, re-checked

| # | Status now |
|---|---|
| MINOR-1 (a caller date cannot beat a live window) | **OPEN** — `caller honoured: f`, §2.5 |
| MINOR-2 (one `blocks` UPDATE or DELETE moves a holder from `lapsed` to `current`, no audit anywhere) | **OPEN** — `probe87` DOOR e: `SET blocks='{}'` → Northgate and Dana both `current`. Widened: `holder_id` is member-writable and outside the assert trigger's concern beyond kind/studio, so DOOR d re-files the lapse onto **Great Northern Bank** — a lender, which by R-A prints no paper word at all, so the lapse leaves every surface in two writes with no history row |
| MINOR-3 (the eleven tiers are not crm-model §2's eleven) | OPEN, unchanged |
| MINOR-4 (four branches carry a LINK id as `subject_id`) | OPEN, unchanged (00627:163, :198, :288, :352) |
| MINOR-5 (`project_review.granted_by = pra.revoked_by`) | OPEN (00627:375) |
| MINOR-6 (`client_account.last_used_at = dc.last_contacted_at`) | OPEN (00627:258) |
| MINOR-7 (`people_directory` restates GRANT with no REVOKE) | **OPEN** (00626:829). Harmless in fact — as `anon`, `select count(*) from people_directory` → `ERROR: permission denied for table studio_contacts` |
| MINOR-8 (`site_access_mode` vocabulary, nullable, and `code` in the no-code wave) | OPEN (00624:121-124) |
| MINOR-9 (stage vocabulary drift: `invited` vs `invited_to_bid`; `mobilized`/`retired` have no display word) | OPEN (00624:110-116) |
| MINOR-10 (the backfill guard cannot protect a hand-set `active`) | OPEN (00624:281-292) |
| MINOR-11 (three formulas for the paper word) | OPEN — `compliance_state(q.company_id)` (00626:655), `COALESCE(sc.company_id, sc.id)` (00626:783), `COALESCE(pp.company_id, pp.studio_contact_id)` (00626:896) |
| MINOR-12 (two ungated definer oracles) | **OPEN** — walked in §2.2 |
| MINOR-13 (`studio_id IS NULL` projects fall back to `_primary_studio_for`) | OPEN, unchanged |
| MINOR-14 (`v_window_end::timestamptz` is session-timezone-dependent) | **OPEN** — the two sessions print `2027-10-01 00:00+00` and `2027-10-01 00:00-05`; in a UTC session a Minneapolis studio's link dies at 19:00 the evening before the window's last day ends (00627:465-466) |
| MINOR-15 (`w1b-report.md` says `use-party-sms.ts:133` is the only call site) | OPEN — `_shared/sms.ts:565` is the second |
| MINOR-16 (`people_crm_dev.sql` in `[remotes.staging.db.seed]`, whose cited invariant is already broken) | OPEN — `config.toml:60` and `:88`; `./seed/catalog/first-flight-catalog.sql` is in local and absent from staging |
| MINOR-17 (`w1b-report.md` stale) | **OPEN AND MATERIALLY WORSE** — see MINOR-26 below |
| MINOR-18 (00626's comment claims a degrade `field_link_tokens_studio_rw` prevents) | OPEN (00626:80-85, :233-236); `pg_policies` shows both `field_link_tokens_designer_all` and `field_link_tokens_studio_rw` |
| MINOR-19 (the dev seed is the only writer that moves `status` + `refusal_unanswered` outside the gate) | OPEN, and sharper: the `ON CONFLICT … DO UPDATE` (`people_crm_dev.sql:533-542`) sets `status`, `consented_at`, `source`, `evidence`, `opt_out_at`, `opt_out_source`, `opt_out_evidence`, `refusal_unanswered`, `origin_project_id` but **not** `recorded_at`, `disclosure_version`, `recorded_by` or `opt_out_recorded_at`, so a replay over an edited row leaves a mixed evidence set. Still MINOR: `studio_channel_consent` has no INSERT/UPDATE grant for `authenticated`, so this is a service-role/seed path only, and a local reset truncates first |
| MINOR-20 (no stage check on the mint) | **OPEN** — an `off_job` seat whose window closed 40 days ago is minted a fresh 90-day door |
| MINOR-21 (no test legs for r2's three MAJORs) | **CLOSED** — blocks 2, 3 and 4 now name and cover the undated successor, the cycle, the card-number/seat-number split, the numberless card, and the live link on a non-winning seat |
| MINOR-22 (`access_grants_trade_agreement_links` gates on one `contact_id` and labels with another) | OPEN (00627:127-135) |
| MINOR-23 (`identity_seat_count` reads under nine policies, the seats view under three legs) | OPEN; still 0 on the fixture |
| MINOR-24 (a client-branch row can never nest a seat) | **PROMOTED TO MAJOR-2** — reachable, walked below |
| MINOR-25 (`verified_by` is an unconstrained `profiles` FK) | OPEN (00623:84) |
| MINOR-26 (the consent DATES are absent from every carded human's row) | **OPEN** — all seven consented humans print empty `meta.sms_consented_at` / `meta.sms_opt_out_at`, so R-Q's one consent sentence still cannot be composed from the row the room renders |

---

## 4. Findings

### BLOCKING — none

No path in 00623–00627 lets a text reach a number the record says is `opted_out`; no path loses or
overwrites an opt-out (there is no authenticated write to `studio_channel_consent` at all); no
cross-tenant read or write; no RLS or grant hole; both resets and the seed replay green; nothing
destroys consent evidence.

---

### MAJOR-1 — a third door to the same lapse: `compliance_successor_not_later` accepts a renewal that is **itself already expired**, and `blocks` defaults to empty, so two ordinary member writes flip a firm with no general-liability cover from `lapsed` to `current` on every surface

**Where.** `supabase/migrations/00623_studio_compliance_documents.sql:301-311`
(`compliance_successor_not_later` compares the two rows' dates to each other and never to
`CURRENT_DATE`), `:90` (`blocks text[] NOT NULL DEFAULT '{}'`), `:456-471`
(`compliance_state` counts only `cardinality(d.blocks) > 0` rows and excludes every superseded row).

**The act.** Two ordinary writes by a plain studio member (`studio_manager@patina.dev`), through
PostgREST, on the seeded Okonkwo fixture. `blocks` is **never mentioned** — the new row takes the
column default:

```sql
INSERT INTO studio_compliance_documents (organization_id, holder_type, holder_id, doc_type, issuer, expires_on)
VALUES (…, 'company', <Northgate Electric>, 'coi_gl', 'Acme Mutual', CURRENT_DATE - 5);
UPDATE studio_compliance_documents SET superseded_by = <the new row>
 WHERE holder_id = <Northgate Electric> AND doc_type='coi_gl' AND expires_on='2026-03-31';
```

Both legs are accepted: the successor is the same `doc_type`, its `expires_on` is not earlier than the
row it retires, it carries a date (so the r2 CHECK and `compliance_successor_undated` are satisfied),
and its own `superseded_by` is null (so `compliance_successor_already_superseded` is satisfied). Every
r2 guard passes. `probe88`:

```
--- V1: two ordinary writes, blocks never mentioned (column default) ---
    display_name    | paper_state
 Dana Kowalski      | current
 Northgate Electric | current
 display_name  |   project_name    | paper_state
 Dana Kowalski | Okonkwo residence | current
 Dana Kowalski | Lindqvist kitchen | current

--- V2: identical act, but the new certificate carries the gates ---
 Dana Kowalski      | lapsed
 Northgate Electric | lapsed

--- V3: an HONEST renewal (future date), gates left at the default ---
 Dana Kowalski      | current
 Northgate Electric | current
```

**Why it is MAJOR and not MINOR-2.** The record after V1 holds a general-liability certificate that
expired 2026-03-31 gating `site_access` and `draw`, retired by a general-liability certificate that
expired five days ago gating nothing. The firm has **no** in-force GL cover, and the Directory row,
the company card, Dana Kowalski's identity row and **both** her seat lines all print `current` —
G-14's and F-11's exact defect restored. MINOR-2 is a member deliberately clearing a gate the studio
itself set on an existing row; here the member never touches `blocks` on the lapsed row at all and
never types a gate on the new one. "We got the renewal" typed with a stale certificate date in hand
is, like r2 door (a), the single most likely data entry a studio makes.

V2 and V3 isolate the two halves: with the gates carried forward the word stays honest (`lapsed`),
and an honest future-dated renewal reads `current` with `blocks` at the default. So the missing
invariants are (a) **a successor must itself be in force** and (b) **a successor must carry at least
the blocks of the row it retires** — without (b), V3's honest renewal silently drops
`{site_access,draw}` and will read `current` forever once it too lapses, which is the same hole one
renewal later.

**Fix, inside the trigger that already reads the successor row.** Add `blocks` to the `SELECT` at
00623:275-280 and two legs beside 00623:301-311:

```sql
IF NEW.doc_type IN ('coi_gl','coi_wc','coi_auto','license','bond')
   AND v_succ_expires < CURRENT_DATE THEN
  RAISE EXCEPTION 'compliance_successor_already_lapsed' …;
END IF;
IF NOT (NEW.blocks <@ v_succ_blocks) THEN
  RAISE EXCEPTION 'compliance_successor_drops_a_gate' …;
END IF;
```

and a test leg per door in block 2, beside `2i`–`2o`. Pair it with the MINOR-2 history object if
Fable would rather the whole family were auditable instead of guarded.

---

### MAJOR-2 — a Directory row on the client, lead, maker or team branch claims a `seat_count` it can never nest, and the seats land under a `person_id` no Directory row carries. Reachable with one ordinary insert — PR-c's own `client_rep` seat

**Where.** `supabase/migrations/00626_people_directory_v4_seats.sql:478` (`person_id = dc.id`,
a `designer_clients` id) against `:508` (`seat_count = identity_seat_count(dc.client_id::text)`, a
**profile** id) — and the same mismatch at `:544` (lead: `person_id = l.id`, count on
`l.homeowner_id`), `:588` (maker: `person_id = v.id`, count on `v.contact_profile_id`) and `:725`
(team: `person_id = t.id` = a `project_team_members` id, count on `t.user_id`). The seats view's
`person_id` (`:855-869`) is `COALESCE(studio_contact_id, first_value(pp.id) …)` — a card id or a
party id, never a `designer_clients`/`leads`/`vendors`/`project_team_members` id. So for these four
branches the count and the nesting are keyed on different things by construction.

**The act.** One INSERT a studio member makes through PostgREST — and precisely the thing PR-c rules
in ("every member who acts on a job gets a seat carrying the authority grant") and the dev seed
already does for Chidi Okonkwo:

```sql
INSERT INTO project_parties (project_id, party_kind, display_name, profile_id, email, stage)
VALUES (<Lindqvist kitchen>, 'client_rep', 'Client User (rep seat)', <the household member's login>, …, 'active'),
       (<Lindqvist kitchen>, 'other',      'Client User (second rep seat)', <same login>, …, 'active');
```

`probe83`, read back as the studio owner:

```
=== the CLIENT Directory row for that household: claimed vs nested ===
  role  | display_name |              person_id               | seat_count | nested
 client | Client User  | 5faef857-2b96-4a68-8e83-6d999994464c |          2 |      0

=== where those two seats nest (person_id in the seats view) ===
              person_id               |  party_kind |         display_name
 233f6db6-7aa3-4f17-8c84-043c719bbe8c | client_rep  | Client User (rep seat)
 233f6db6-7aa3-4f17-8c84-043c719bbe8c | other       | Client User (second rep seat)

=== does ANY Directory row carry that person_id? ===  0

=== whole-fixture invariant now ===
 rows_where_count_disagrees | total_rows
                          2 |         62          (before the insert: 0 of 62)
```

**Why it is MAJOR.** This is r1 MAJOR-2's class — "the two views chose different winners, so the one
join the redesign rests on nested NOTHING" — surviving on four branches, and 00626's own comment
(`:838-841`) states the invariant it breaks: *"a UI joining people_directory_seats.person_id =
people_directory.person_id nests every seat under exactly one row, and no seat dangles for any
identity the Directory emits — carded or not."* The client identity **is** emitted. The record says
this human holds two seats on the job; the row says "2" and unfolds to nothing, and the seats
themselves hang under an id the Directory never returns, so PR-c's "read under the household member's
card" cannot be built. The r2 review saw the shape (MINOR-24) and graded it latent because all seven
client rows read 0 on the fixture; the write that makes it bite is the feature this program is
building, so it is a reachable write path leaving a reader and the record disagreeing.

**Fix, pick one and state it:** either (a) make the four branches' `seat_count` agree with what can
nest — `0` on client/lead/maker/team until a household/party object exists, which is honest and
costs one edit per branch; or (b) key the seats view's `person_id` for a `profile_id`-stamped,
uncarded seat to the identity's Directory row on those branches (a second COALESCE arm resolving
`profile_id` → `designer_clients.id`), which is what PR-c actually wants and is bigger. Either way the
whole-fixture assertion in test block 4 ("no row anywhere claims a count it cannot nest") needs a
leg that stages a `client_rep` seat, because today it only proves the invariant on data that cannot
break it.

---

### MINOR findings

| # | Finding | Where | Evidence |
|---|---|---|---|
| MINOR-1 … MINOR-20, MINOR-22 … MINOR-25 | **All carried from r2 with the statuses in §3.** MINOR-2 is widened (the `holder_id` move onto a lender card), MINOR-19 is sharpened (the omitted evidence columns in the seed's `DO UPDATE`), MINOR-21 is closed, MINOR-24 is promoted to MAJOR-2 | see §3 | see §3 |
| MINOR-26 | **NEW (MINOR-17, worse). `w1b-report.md` is now the record of a code state three fix rounds old, and names none of the objects the fixes added.** `grep -c` over the report: `identity_consent_status` **0**, `reach_state_for_identity` **0**, `party_kind_in_directory` **0**, `dated_expiry_check` **0**, `compliance_successor_already_superseded` **0**, `field_link_window_closed` **0**; `blocks` appears twice and never in §1's or §4's description of `compliance_state`, which is the whole of r1 MAJOR-3's fix. §7's "New top-level keys" list omits three of the eleven new functions. The next reader who trusts the report will believe the card reads a date without a gate, that the contacts branch reads the card's number alone, and that `reach_state` reads the winning seat | `build/w1b-report.md:44`, `:129`, `:226-236`, `:390-398` | grep counts above |
| MINOR-27 | **NEW. `supabase/tests/rls/people_directory_scope_test.sql` is red on this branch because of 00626, and nothing in the wave owns it.** It hard-codes the pre-v4 shape; `scope` is still column 12 so its `a3` leg passes, only the count is stale. `integration.yml:49` runs `supabase test db` over this tree nightly, so the wave ships a red gate | `supabase/tests/rls/people_directory_scope_test.sql:308`; 00626:40-46 | `ERROR:  FAIL a2: expected exactly 12 columns, got 17` (exit 3). The r2 fix log flagged it as pre-existing; it is not pre-existing to the program — it is 00626's append, correctly made, with its assertion never updated. One line: `12` → `17`, plus a leg naming the five appended columns |
| MINOR-28 | **NEW, and W1a's not W1b's, recorded so the chain's owner sees all four reds together.** `rls/field_parties_test` fails `consent_legacy_column_frozen` (the R-AX freeze) and `site_requests/security_and_lifecycle_test` fails `send must transition not_asked consent to pending` (the R-AY repoint). `commercial/trade_rfq_test` fails on a design-services-agreement RPC with no W1b object in its path and reads as unrelated to the program | §1.4 | exits 3, 3, 3 |
| MINOR-29 | **NEW. `field_link_window_closed` is unreachable, and the function's own COMMENT promises behaviour it does not have.** The `CASE` at 00627:461-469 ends `ELSE now() + interval '90 days'`, so `v_expires` is always non-null and always in the future and the `IF v_expires IS NULL OR v_expires <= now()` guard at :473-479 can never fire. Nothing in the tree references the error string (`grep -rn field_link_window_closed supabase/` → the two lines of 00627 itself), so no test asserts it either. Harmless as a belt, but the COMMENT (:508-511) tells a reader that a mint can refuse, and `_shared/sms.ts:562-573` handles an error by returning `null` and letting the text go out with no link — so if a future edit ever makes the guard reachable, it will be reachable through the send rail | `00627:461-479`, `:508-511`; `supabase/functions/_shared/sms.ts:565-573` | `grep` + the branch analysis |
| MINOR-30 | **NEW. The five appended columns cost ~130× the contacts branch they hang off, and the room's only Directory query is `select('*')`.** Measured as designer@patina.dev on the seeded fixture (49 cards, 31 seats), `EXPLAIN (ANALYZE)`: the twelve shipped columns of the contacts branch alone **1.5 ms**; the same query plus `identity_consent_status` **70.4 ms**; plus `identity_seat_count` **60.9 ms**; the whole view **190.5 ms**. That is ~1.4 ms and ~1.2 ms per card, each a fresh RLS-filtered `project_parties` scan plus a `channel_consent_status()` call per number, before `compliance_state`, `contact_rule_summary` and `reach_state_for`. A studio with a two-thousand-card rolodex pays seconds on the room's primary list, and W2 is about to build the Directory on it (`use-people.ts:125`, `:161` are both `select('*')`) | `00626:508`, `:544`, `:588`, `:656`, `:725`, `:782-785`; `packages/supabase/src/hooks/use-people.ts:125`, `:161` | the four `Execution Time` lines above |

---

## 5. Things I checked that are clean, so the next round need not re-walk them

- **Cross-tenant, both directions, all six new relations and all eleven new functions** — §2.2.
- **The three RLS predicate families the brief names**, and PR-w's no-client-leg / PR-r's no-code-column — §2.1, test blocks 7 and 8.
- **PR-n as three roles** — test block 5; the gate is on both `USING` and `WITH CHECK` of UPDATE and on DELETE, so a `selections` grant cannot be edited into a `money` one.
- **Grants and search_path on all 20 new/changed functions** — no `anon` anywhere, every definer pinned, the four `assert_*` triggers revoked from `authenticated`.
- **`agent_reader` reads the new objects** because it is a member of `pg_read_all_data`, and it has `rolbypassrls = f`, so RLS still applies and it reads nothing without a studio identity. Not a hole.
- **R-AY/R-AW**: no consent write anywhere in W1b; no frozen-column read anywhere in W1b; `people_directory` and `v_project_roster` both resolve the verdict through `channel_consent_status()` — §2.6.
- **Reader-versus-record, whole fixture, both directions of permissiveness** — 0 of 49 pairs and 0 of 31 seats.
- **`create_field_link`'s graft against `00284:37`** — §2.5.
- **Idempotency**: each file twice, then all five in one transaction; 17 columns, one CHECK — §1.5.
- **Generated types**: zero drift, the three new functions present, both type-checks green — §1.6.
- **The dev seed replays** on an already-seeded database with identical counts — §1.3.
- **`v_access_grants` carries no bearer credential** and all eleven base tables are RLS-scoped — §2.3; the one hash it does carry (`md5(token)`, 00627:350) sits behind a platform-admin-only policy.

## 6. What would make this clean

1. **MAJOR-1** — two legs in `assert_compliance_holder()`: a dated successor must be in force, and a successor must carry at least the retired row's `blocks`. Plus a test leg per door in block 2.
2. **MAJOR-2** — decide (a) or (b) for the four branches whose `seat_count` cannot nest, and add the `client_rep` leg to block 4's whole-fixture assertion.

Everything else is MINOR and may stand. Two of the MINORs are worth a decision rather than a fix,
because they are the wave's paperwork rather than its code: **MINOR-26** (`w1b-report.md` no longer
describes the migrations it documents — the report should be rewritten from the code, not patched)
and **MINOR-27** (`people_directory_scope_test.sql`'s stale column count is a one-line change that
turns a red nightly gate green and belongs to this wave, not to "whoever owns the test debt").
**MINOR-30** is a number Fable may want before W2 commits the room to `select('*')`.

## 7. Not a finding, for the record

A second session ran `supabase db reset` against `127.0.0.1:54322` twice during this review and
destroyed the database under a running test (§0). Nothing in 00623–00627 caused it, and both of my
own resets are green once it cleared — but the brief says this wave owns the database, and the next
round will lose runs the same way if that session is still live.
