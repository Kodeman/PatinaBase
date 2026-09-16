# W1b — adversarial migration review, round 1

Reviewer context: fresh. Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD `f21cc0087`. Local Supabase only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **Nothing was pushed to Strata.**

Files reviewed in full: `00623_studio_compliance_documents.sql`,
`00624_project_party_window_and_authority.sql`, `00625_project_site_access_cards.sql`,
`00626_people_directory_v4_seats.sql`, `00627_access_grants_and_field_link_window.sql`,
`supabase/seed/people_crm_dev.sql`, `supabase/tests/people/w1b_compliance_authority_directory_test.sql`,
`supabase/config.toml`, plus every base object and shipped function the five files graft from or read.

**Verdict: NOT clean — 0 BLOCKING, 5 MAJOR, 17 MINOR.**

---

## 0. Environment, before any destructive local act

The brief asks for `apps/designer-portal/.env.local` to be confirmed at `127.0.0.1:54321`.
**There is no `.env.local` in this worktree at all**, so no local act could reach Strata through it:

```
$ ls -la apps/designer-portal/.env*
.rw-r--r--@ 5.0k kody 11 Sep 13:38 apps/designer-portal/.env.example
$ cat supabase/.temp/project-ref        # empty — the CLI is not linked in this worktree
$ node -e "…" | grep supabase:reset
supabase:reset => cd supabase && supabase db reset      # local only, no --linked
$ docker ps --format '{{.Names}}\t{{.Ports}}' | grep 54322
supabase_db_supabase	0.0.0.0:54322->5432/tcp, [::]:54322->5432/tcp
```

---

## 1. What I ran

### 1.1 Legacy grants, regenerated first

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2701 replayed statements
$ git diff --stat -- supabase/seed/00-legacy-grants.sql
                                        # empty — byte-identical to what is committed
```

### 1.2 Reset, twice

```
$ pnpm --dir …/agent-people-build supabase:reset
RESET1_EXIT=0
… Seeding data from supabase/seed/people_crm_dev.sql...
   Seeding data from supabase/seed/99-local-edge-settings.sql...
   Finished supabase db reset on branch main.
   {"target":"local","version":"","message":"Reset local database."}
$ grep -icE 'error' reset1.log   → 1   # the single match is a migration FILENAME:
                                       # "Applying migration 00458_sms_message_error_capture.sql..."
$ pnpm --dir …/agent-people-build supabase:reset
RESET2_EXIT=0   (same, same single filename match)

$ psql … -At -c "select version from supabase_migrations.schema_migrations order by version desc limit 7;"
20260910152111 / 00627 / 00626 / 00625 / 00624 / 00623 / 00622
```

The dev seed replays. 00595–00620 are untouched; the numbering is `00623`–`00627`, which is right —
`00622_consent_record_is_the_only_gate.sql` was already on the branch before this wave (the brief's
"mints from 00622" predates it, and `w1a-report.md` §5.3 already corrected it to 00623).

### 1.3 Both SQL suites

```
$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
W1B_EXIT=0    12 lines matching ": passed"    no ERROR|FAIL match anywhere in the log
NOTICE:  All W1b assertions passed.

$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
W1A_EXIT=0    48 lines matching ": passed"
NOTICE:  All W1a assertions passed.
```

### 1.4 Replay / idempotency — each file in its own rolled-back transaction

```
--- replay 00623_studio_compliance_documents --- EXIT=0  errors=0
--- replay 00624_project_party_window_and_authority --- EXIT=0  errors=0
--- replay 00625_project_site_access_cards --- EXIT=0  errors=0
--- replay 00626_people_directory_v4_seats --- EXIT=0  errors=0
--- replay 00627_access_grants_and_field_link_window --- EXIT=0  errors=0
```

### 1.5 Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir … db:generate
GEN_EXIT=0
$ diff -q <committed> packages/supabase/src/database.types.ts   → NO DRIFT
$ pnpm --dir … --filter @patina/supabase type-check   → SUPABASE_TC=0
```

### 1.6 My own probes (objects and access, never the ledger; every fixture inside `BEGIN … ROLLBACK`)

| Probe | What it asks |
|---|---|
| `build/probe59-w1b-final-r1-divergence.sql` | a closed-window mint; an explicit `p_expires_at` against a window |
| `build/probe60-w1b-final-r1-seats-join.sql` | the Directory↔seats `person_id` join over the seeded fixture |
| `build/probe61-w1b-final-r1-seats-divergence.sql` | the same join for an uncarded identity with a mixed-kind seat set |
| `build/probe63-w1b-final-r1-cross-tenant.sql` | a second studio, read both directions, plus the definer oracles |
| `build/probe64-w1b-final-r1-paper-word.sql` | `blocks[]`, the 30-day window, supersede cycles, cross-type supersede |
| `build/probe65-w1b-final-r1-misc.sql` | anon at every door, PR-n, `v_access_grants` by tier, timing, grants |
| `build/probe66-w1b-final-r1-prn-and-link.sql` | PR-n as a plain member; the mint on every closed-window seat |
| `build/probe67-w1b-final-r1-directory-face.sql` | what `directory-view.tsx` renders before and after 00626 |

---

## 2. Migration rules — pass/fail

| Rule | This wave |
|---|---|
| hand-numbered `NNNNN_slug.sql` | **PASS.** 00623–00627, no `supabase migration new`, 00595–00620 untouched |
| grep-winner before redefining ANY function | **PASS, re-run by hand.** `create_field_link` ← `00284:37` (guard and supersede carried verbatim; the only change is that the INSERT now supplies `expires_at` where 00284 relied on the table default). `people_directory` ← `00594:1211-1458`; I diffed all five carried branches: every predicate is byte-identical (`00594` lines 42, 73-74, 114, 120-122, 171-173, 198, 212-216, 248 all reappear unchanged), and the only added predicate is the intentional `AND pp.studio_contact_id IS NULL`. `compliance_state`, `party_identity_key`, `reach_state_for`, `identity_seat_count`, `contact_rule_summary`, `project_designer`, `project_party_org` and the four `access_grants_*` readers are all first definitions (grep returns their own file only) |
| banner + lineage | **PASS.** All five carry a banner; 00626 states the full `00221 → … → 00594 → 00626` chain and names what it reconciles; 00627 names `00283:86 → 00284:37` |
| idempotent | **PASS.** `CREATE TABLE IF NOT EXISTS` + named `DROP CONSTRAINT IF EXISTS` / `ADD CONSTRAINT` re-statements, `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP TRIGGER IF EXISTS`/`CREATE TRIGGER`, `CREATE OR REPLACE` throughout, `DROP VIEW IF EXISTS` before `CREATE VIEW v_access_grants`. Replay clean (§1.4). One caveat on the backfill's guard — MINOR-10 |
| RLS in the same file | **PASS.** All three new tables `ENABLE ROW LEVEL SECURITY` with four policies each, in their own file |
| explicit grants both directions + `REVOKE … FROM PUBLIC, anon` on definer RPCs | **PASS on everything this wave creates.** Every new table does `REVOKE ALL … FROM PUBLIC, anon, authenticated` then re-grants. Every new function does `REVOKE ALL … FROM PUBLIC, anon`; the four trigger functions also revoke from `authenticated` (an improvement on w1a's carried MINOR-D). Probed: `anon` holds SELECT on none of the six new relations. One inconsistency — MINOR-7 |
| SECURITY DEFINER pins `search_path` | **PASS.** Catalog sweep: `assert_compliance_holder`, `assert_project_party_cards`, `assert_party_authority_copy_to`, `assert_site_access_key_holder`, `project_designer`, `project_party_org` and all four `access_grants_*` carry `search_path=public`; both `create_field_link` bodies carry `public, extensions, pg_temp` (00284's own value). The five INVOKER functions are not definers and need no pin, though `compliance_state`/`reach_state_for`/`identity_seat_count`/`contact_rule_summary` pin one anyway; `party_identity_key` is IMMUTABLE and pure |
| schema-qualify extension fns | **PASS.** `extensions.gen_random_bytes` / `extensions.digest` in `create_field_link`; `md5()`, `encode()`, `cardinality()`, `unnest()`, `array_to_string()`, `jsonb_typeof()` are all `pg_catalog`. The three `gen_random_uuid()` DEFAULTs resolve to the `pg_catalog` copy (same as 00592/00593, unchanged this round) |
| guarded crons | **N/A.** No `cron.` statement in any of the five files (the expiry sweep is P2) |
| CHECK over enum | **PASS.** `holder_type`, `doc_type`, `held_by`, `source`, `blocks`, `stage`, `site_access_mode`, `contracted_through`, `scope` are all TEXT + CHECK. `doc_label` and the window carry named CHECKs too |
| money integer cents | **PASS.** `project_party_authority.threshold_cents integer` with `>= 0`; the fixture's $2,500 line is `250000` (asserted in block 12) |
| regenerate `seed/00-legacy-grants.sql` | **PASS** — regenerated byte-identical (§1.1) |
| `pnpm supabase:reset` twice | **PASS** (§1.2) |
| `db:generate` | **PASS** — no drift, run against the freshly reset DB (§1.5) |
| SQL tests via psql | **PASS** — 12 + 48 assertions, exit 0 (§1.3) |
| probe objects, never the ledger | **PASS** — catalog reads plus `BEGIN … ROLLBACK` fixtures only |

### 2.1 RLS predicates the brief names

| Family | As applied | Verdict |
|---|---|---|
| `studio_contacts` family — `studio_compliance_documents` | `is_active_studio_member(organization_id)` on SELECT/INSERT/UPDATE/DELETE, plus `assert_compliance_holder()` asserting the holder card is in the SAME `organization_id` | **PASS** |
| `project_parties` family — `project_party_authority` | `is_studio_comember(project_party_designer(engagement_id))` on all four, with PR-n's admin term on the three writes | **PASS** |
| site access card has NO client branch (PR-w) | four policies, all `is_studio_comember(project_designer(project_id))`, no client leg, no `show_to_client` column, `anon` revoked explicitly | **PASS** (probed) |
| no `code` column (PR-r) | catalog: zero columns matching gate_code / code / access_code / lockbox_code / show_to_client | **PASS** |

```
=== anon at every new door (fresh reset) ===
people_directory            → ERROR: permission denied for table studio_contacts
people_directory_seats      → ERROR: permission denied for view people_directory_seats
v_access_grants             → ERROR: permission denied for view v_access_grants
studio_compliance_documents → ERROR: permission denied for table studio_compliance_documents
project_site_access_cards   → ERROR: permission denied for table project_site_access_cards
project_party_authority     → ERROR: permission denied for table project_party_authority
```

### 2.2 Cross-tenant — clean, in both directions

`probe63`, one rolled-back transaction: a whole second studio (Beta) with its own designer, project,
rolodex card, lapsed COI, seat, money authority grant, site access card and recorded `opted_out`.

```
=== Alpha designer reading Beta rows (every number must be 0) ===
 beta_docs | beta_authority | beta_cards | beta_seats | beta_dir | beta_grants
         0 |              0 |          0 |          0 |        0 |           0

=== compliance_state / channel_consent_status on Beta keys, asked by Alpha ===
 beta_paper_as_alpha | beta_consent_as_alpha | beta_seat_count_as_alpha | beta_rule_as_alpha
 not_on_file         |                       |                        0 |

=== Beta owner reading Alpha rows (every number must be 0) ===
 alpha_docs | alpha_dir_rows_visible | alpha_seat_rows_visible | alpha_cards_visible | alpha_authority_visible | grants_visible
          0 |                      2 |                       1 |                   1 |                       1 |              1
              ↑ all six non-zeroes are BETA'S OWN rows, confirmed by the sanity read below

=== Beta reading its OWN rows ===
 own_docs | own_authority | own_cards | own_seats | own_paper | own_seat_consent
        1 |             1 |         1 |         1 | lapsed    | opted_out
```

### 2.3 PR-n, walked as a plain `member` of the studio (`probe66`)

```
-- B1 selections                                   → INSERT 0 1        (lands)
-- B2 money                                        → ERROR: new row violates row-level security policy
-- B3 escalate the selections grant to scope=money → ERROR: new row violates row-level security policy
-- B4 change_order with a $5,000,000 threshold     → INSERT 0 1        (PR-n permits the scope)
-- B5 DELETE an owner-set money grant              → DELETE 0
-- B6 UPDATE that money grant's threshold          → UPDATE 0
-- B7 move that money grant to another seat        → UPDATE 0
```

The gate is in the policy, not in code, and it holds on INSERT, on the escalating UPDATE (the
`WITH CHECK` catches the new `scope`), on UPDATE of an existing money grant and on DELETE. On a project
that resolves to no studio, `is_org_admin_or_owner(NULL)` is false, so it fails closed.

### 2.4 The stage/window backfill

Lindqvist (`completed_at 2025-11-21`, inside twelve months) → `warranty` for all seven seats; the
`stage = 'active'` guard makes a replay a no-op against the seeded stages. Windows land as
direction §3.4's bands. Confirmed against the seed and by the §1.4 replay.

### 2.5 `create_field_link` — the graft

00284's guard (`auth.uid() IS NOT NULL AND NOT EXISTS (… designer_id = auth.uid())` →
`insufficient_privilege`), the NULL-uid internal bypass with `created_by` NULL, the supersede UPDATE,
the token/hash generation and the `RETURN QUERY` are all byte-identical to `00284:37-80`. The
one-argument signature survives as a delegate, and both live call sites (`use-party-sms.ts:133`,
`_shared/sms.ts:565`) use it. Only the expiry changed — see MAJOR-1 and MINOR-1.

### 2.6 Performance (not a finding class, recorded so a later round need not re-measure)

```
SELECT count(*) FROM people_directory;        62 rows    7.8 ms
SELECT count(*) FROM people_directory_seats;  31 rows    2.8 ms
SELECT count(*) FROM v_access_grants;         12 rows   10.1 ms
```

The expression index `idx_project_parties_identity_key` matches `identity_seat_count`'s predicate exactly.

---

## 3. Findings

### BLOCKING — none

Checked and clean against every BLOCKING definition in the brief:

- **"a text can be sent to a number whose studio record says opted_out"** — W1b touches no send path,
  no consent writer, no edge function. `people_directory.consent_status`,
  `people_directory_seats.consent_status` and the party branch's `status_raw` all read
  `channel_consent_status(project_consent_org(…), 'sms', phone_e164)`, which folds
  `refusal_unanswered`. `create_field_link` does not consult consent and never did.
- **"an opt-out can be lost or overwritten without a newly recorded consent"** — the seed writes no
  frozen column (`grep -n "sms_consent" supabase/seed/people_crm_dev.sql` matches one comment line
  only); `refuse_legacy_consent_write_trg` still fires on all ten columns (probed: an
  `UPDATE … SET sms_consent_status='granted'` raises `consent_legacy_column_frozen`); none of 00624's
  ten new columns is on the freeze list, and none of the five files writes
  `studio_channel_consent`. A member attempting to re-home an `opted_out` seat to another studio's
  project is refused twice over — by `project_parties`' own RLS `WITH CHECK`, and (for any seat
  carrying a `company_id`) by 00624's new `assert_project_party_cards()` → `party_company_other_studio`.
- **cross-tenant read or write** — §2.2, both directions, zero.
- **an RLS or grant hole** — §2.1; anon refused at every door; PR-n holds as three roles.
- **reset/replay failure** — §1.2, §1.4.
- **a write path that destroys consent evidence** — none added.

### MAJOR-1 — `create_field_link` mints a token that is already expired, and revokes the live one in the same call. The shipped SMS rail puts that dead link in the text.

**Files.** `supabase/migrations/00627_access_grants_and_field_link_window.sql:447-457`;
`supabase/functions/_shared/sms.ts:560-573` (`mintFieldLink`), `:624-629` (the `{{link}}` template
hook); `packages/supabase/src/hooks/use-party-sms.ts:133`;
`apps/designer-portal/src/components/document/people/party-profile-sheet.tsx:9` (Copy / Regenerate).

The expiry is `max(on_site_to, warranty_until) + 1 day` whenever either is non-NULL, with **no test
that the result is in the future**, and `p_expires_at` cannot rescue it because the window branch is
first. A seat whose window has closed therefore gets a token stamped in the past — and because the
supersede `UPDATE` at `:460-462` runs unconditionally before the INSERT, whatever live link the trade
was using is revoked at the same moment.

```
=== probe66 D2, one rolled-back transaction ===
seat: stage=off_job, on_site_from=2026-02-01, on_site_to=2026-05-31, warranty_until=NULL
a LIVE token already exists, expiring now()+45 days
NOTICE:  minted expiry = 2026-06-01 00:00:00+00  (dead: t) ;
         the prior LIVE token (now+45d) is now revoked
NOTICE:  reach_state_for = on_paper
```

```
=== probe59 P2, the same thing on an `active` seat whose window merely passed ===
NOTICE:  P2 seat window = 2026-01-05 .. 2026-03-31, warranty_until = NULL. today = 2026-09-12
NOTICE:  P2 new link expires_at = 2026-04-01 00:00:00+00   (already expired: t)
NOTICE:  P2 the previously LIVE link (expiry now + 60d) is now: revoked
```

**Why this is not only a desk act.** `_shared/sms.ts:624-629` mints a link for any template containing
`{{link}}` — so `field-daily`'s digest, `fc_dispatch_court_assignment`, `fc_dispatch_task_assignment`
and the site-request rail all send texts whose link is minted by this RPC. On a closed-window seat the
trade receives a URL that is dead on arrival, and the one they had stops working. This is exactly the
population PR-d/PR-l/CS4-17 ("reach must outlive the link") exist for: a warranty callback on a seat
whose `warranty_until` has also passed.

**Fix.** Take the window only when it is still open, and never revoke on behalf of a mint that cannot
produce a usable date:

```sql
v_expires := CASE
  WHEN v_window_end IS NOT NULL
   AND v_window_end::timestamptz + interval '1 day' > now()
       THEN v_window_end::timestamptz + interval '1 day'
  WHEN p_expires_at IS NOT NULL AND p_expires_at > now() THEN p_expires_at
  ELSE now() + interval '90 days'
END;
```

or, if PR-d's "a grant ends with the engagement" is meant literally for a closed seat, **refuse the
mint** (`RAISE EXCEPTION 'field_link_window_closed'`) before the supersede, so the studio is told
rather than handed a dead token. Either way the supersede must not run when the mint cannot succeed.
Verify with `psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql`
plus a new leg in block 10 for a closed window; the suite as it stands tests only future windows.

### MAJOR-2 — `people_directory` and `people_directory_seats` choose different winners for the same identity, so a Directory row can say "2 seats" and nest none. That is the one join the whole redesign rests on.

**Files.** `supabase/migrations/00626_people_directory_v4_seats.sql:441-478` (the party branch's
`DISTINCT ON`, restricted by `pp.party_kind IN (… seven …)` at `:469-470` and
`AND pp.studio_contact_id IS NULL` at `:471`) versus `:631-638` (the seats view's `first_value()`,
whose `PARTITION BY` runs over **every** party kind because the seats view admits them all, by design,
at `:674-678`).

For an **uncarded** identity — keyed on the phone, the email or the row — the two winners are computed
over different candidate sets. Whenever the most recently updated seat is outside the seven kinds, the
Directory picks an in-the-seven seat and the seats view picks the other one, and
`people_directory_seats.person_id = people_directory.person_id` matches nothing.

```
=== probe61, one rolled-back transaction ===
one uncarded human, both seats on the same phone:
                  id                  | party_kind |          updated_at
 11111111-…-aaaa                      | sub        | 2026-09-03 14:18:24+00
 11111111-…-bbbb                      | vendor     | 2026-09-12 14:18:24+00

people_directory  (DISTINCT ON over the seven kinds)
              person_id  | role | seat_count
 11111111-…-aaaa         | sub  |          2

people_directory_seats   (first_value over EVERY kind)
               seat_id   |     person_id     | party_kind
 11111111-…-aaaa         | 11111111-…-bbbb   | sub
 11111111-…-bbbb         | 11111111-…-bbbb   | vendor

the join W2 is meant to make
              dir_person | claims | nests
 11111111-…-aaaa         |      2 |     0
```

The migration's own comment at `:614-619` claims "a UI joining
`people_directory_seats.person_id = people_directory.person_id` nests every seat under exactly one
row, and no seat dangles for a carded human" — the hedge is accurate and the sentence before it is
not. The seeded fixture happens not to contain the case (every carded human is stamped, and the one
uncarded identity, Rivera Finishes, holds a single seat), which is why block 4 passes: it stages two
`sub` seats, both inside the seven.

This is the redesign's central object — "one human, one row, seats beneath" (C6, PR-p) — failing for
the population it was built for: the trade who is on one job as a `sub` and on another as a `vendor`
or a `client_rep`, with no rolodex card yet.

**Fix.** Compute the winner in one place. The cheapest shape is to give the seats view the same
candidate set the Directory uses for its winner, while still emitting every seat:

```sql
first_value(pp.id) OVER (
  PARTITION BY public.party_identity_key(...)
  ORDER BY (pp.party_kind IN ('gc','sub','installer','receiver',
                              'architect','photographer','stager')) DESC,
           pp.updated_at DESC, pp.id
)
```

— or better, lift the winner into one `identity_winner_party(text)` STABLE function both views call,
so the two can never drift again (the `project_consent_org` lesson from close-review r1 MAJOR-1,
applied to identity). Add a block-4 leg with a mixed-kind seat set and assert
`nests = claims`.

### MAJOR-3 — `compliance_state()` never reads `blocks[]`, so a lapsed paper that gates nothing prints the blocked word

**Files.** `supabase/migrations/00623_studio_compliance_documents.sql:318-331` (the body);
`:143-147` (the column's own comment: *"CS2 §4 — a date with no gate changes nothing"*);
`:31-35` (the banner: *"`blocks[]` is the point of the whole object"*);
`synthesis/direction.md:186-189` (§3.8 puts `Lapsed` in the **terracotta / blocked** family);
`rulings.md` PR-h (*"the roster row prints a held clause in words with a terracotta leading rule"*).

```
=== probe64 A ===
 reads_blocks
 f                    ← compliance_state's source text contains no reference to blocks

=== probe64 C, one rolled-back transaction ===
holder holds: coi_gl expiring CURRENT_DATE + 200 with blocks {site_access,payment,draw}
              other_named "a training card" expiring CURRENT_DATE - 1 with blocks {}
  word  |                            record
 lapsed | COI current to +200d; a gateless other_named lapsed yesterday
```

Nothing anywhere reads the column (`grep -rn "blocks" supabase/migrations/0062*.sql` outside 00623
returns nothing; no portal or package reader references it). The word family that a W2 roster row,
Directory row and company card all print is therefore computed over papers that hold no gate at all.
The fixture's own F-09 OSHA 30 card is a `blocks={site_access}` person-held `other_named` expiring
2029-05-01 — so the case does not bite the seed today, and it will the first time a studio records an
expired certificate, training card or resale certificate it never gated anything on.

**Fix.** Either filter the word to gating paper —
`AND (cardinality(d.blocks) > 0)` on the two `FILTER` clauses, keeping `count(*) = 0` over all
non-superseded rows so `not_on_file` still means "no paper" — or state in the function's own COMMENT
that the word deliberately ignores `blocks` and amend the column comment that says the opposite.
The first is what CS2 §4 and PR-h describe. Gate:
`psql … -f supabase/tests/people/w1b_compliance_authority_directory_test.sql` with a new leg in
block 1 for a gateless lapse.

### MAJOR-4 — one UPDATE by any studio member turns `lapsed` into `current` while the lapsed COI is still on file. `superseded_by` is checked for card and studio, never for type or date.

**Files.** `supabase/migrations/00623_studio_compliance_documents.sql:221-232`
(`assert_compliance_holder`'s successor leg), `:95-96` (the only other constraint — self-reference),
`:293-294` (UPDATE granted to `authenticated`, so PostgREST is a writer), `:318-331`
(`compliance_state` excludes every `superseded_by IS NOT NULL` row).

The guard asks only that the successor be *another document for the same card in the same studio*. It
does not ask that the successor be the same `doc_type`, that it be issued later, or that it be
current. So pointing a lapsed COI at the firm's undated W-9 removes the lapse from the word entirely.
Walked as a plain `member` of the studio, against the fixture's own headline fact — F-11 Northgate
Electric, COI lapsed 2026-03-31, the lapse G-14 exists to make visible:

```
=== as plainmember@example.test, role 'member', one rolled-back transaction ===
    display_name    | paper_state
 Northgate Electric | lapsed

WITH w AS (SELECT id FROM studio_compliance_documents WHERE holder_id = <Northgate> AND doc_type='w9')
UPDATE studio_compliance_documents SET superseded_by=(SELECT id FROM w)
 WHERE holder_id = <Northgate> AND doc_type='coi_gl';
UPDATE 1

    display_name    | paper_after_the_hide
 Northgate Electric | current

 doc_type | expires_on | superseded
 coi_gl   | 2026-03-31 | t            ← the lapse is still on file, and now invisible
 license  | 2027-12-31 | f
 w9       |            | f
```

A renewal supersede is the shipped act the column is for; the defect is that the guard cannot tell a
renewal from a laundering. The room then prints "Current" for a firm whose general liability expired
in March, which is the one thing the whole object was built to stop.

**Fix.** Extend `assert_compliance_holder()`'s successor leg with the two checks a renewal implies:

```sql
IF NOT FOUND THEN … END IF;                      -- keep
-- and additionally, read the successor and require:
--   d.doc_type = NEW.doc_type                    (a renewal is of the same paper)
--   AND (d.expires_on IS NULL OR NEW.expires_on IS NULL
--        OR d.expires_on >= NEW.expires_on)      (the successor covers at least as long)
```

raising `compliance_successor_wrong_type` / `compliance_successor_not_later`. Gate:
`psql … -f supabase/tests/people/w1b_compliance_authority_directory_test.sql` with a new leg in
block 2 (which already walks the other three holder-guard refusals).

### MAJOR-5 — on deploy the shipped Directory feed loses every trade: 22 rows become 1

**Files.** `supabase/migrations/00626_people_directory_v4_seats.sql:471` (`AND pp.studio_contact_id
IS NULL`), `:541-572` (the contacts branch that now carries every carded human as `role='contact'`);
`apps/designer-portal/src/components/document/people/views/directory-view.tsx:294`
(`const list = (data ?? []).filter((p) => p.role !== 'contact')`);
`apps/designer-portal/src/components/document/people/people-room.tsx:383`
(`count={all ? \`${all.length} people\` : undefined}`).

```
=== probe67, as designer@patina.dev ===
what directory-view.tsx renders AFTER 00626 (role <> 'contact')
  role  | count          what the six-branch view rendered for the same seats
 client |     7           architect    |  1
 lead   |     5           gc           |  5
 sub    |     1           photographer |  1
                          receiver     |  1
                          stager       |  1
                          sub          | 13

the room head count
 head_count_all_rows | rows_the_feed_renders
                  62 |                    13
```

Every GC, sub, installer, receiver, architect, photographer and stager on both fixture jobs — 22 rows
— disappears from the Directory, and the one survivor is Rivera Finishes, the single uncarded
identity. The head then says "62 people" over 49 cards plus 13 others.

`w1b-report.md` §4 and §8 both own this, `rulings.md` §6 rules out the flag that would have hidden it,
and the same §6 rules one deploy chain at the end of the program — so nothing reaches a studio until
W2's mixed list (PR-g), honest head count and seat lines land in the same chain. I am reporting it at
MAJOR because it is the wave's largest shipped-reader consequence and the mitigation is a *process*
commitment rather than anything in the migration: if 00626 is ever pushed to Strata without W2's
`directory-view.tsx`, the People room is empty of trades.

**Fix.** No SQL change. Record it as a hard sequencing constraint on the deploy chain (00626 must not
be pushed ahead of W2's Directory), and consider having W2's chip mapping read
`meta.entity_kind` + `people_directory_seats.party_kind` rather than `role`, which is the shape the
view now offers.

---

### MINOR findings

| # | Finding | File:line | Evidence |
|---|---|---|---|
| MINOR-1 | **An explicit `p_expires_at` is ignored whenever the seat carries a window**, so the studio cannot choose. PR-l is "Make the studio choose, with the warranty end offered as the second option in words"; the implementation makes the later of the two mandatory and block 10 asserts the override as intended ("the engagement window sets the expiry and **outranks a caller date**"). The two-arg form is new, so nothing is broken today — but PR-l's act cannot be built on it | `00627:452-457`; test block 10 (`:674`) | `probe59 P3`: caller asked `now()+7d`, seat window ends 2027-07-09, link expires 2027-07-10 → `caller date honoured? f` |
| MINOR-2 | **A supersede cycle hides both papers.** Only self-reference is blocked (`00623:95-96`); `A→B, B→A` makes a holder carrying two lapsed papers read `not_on_file` | `00623:95-96`, `:221-232`, `:318-331` | `probe64 D`: `before_cycle=lapsed` → `after_cycle=not_on_file`, `lapsed_papers_still_on_file=2` |
| MINOR-3 | **`v_access_grants`' eleven tiers are not crm-model §2's eleven.** `project_team_seat` and `maker_account` are missing; `site_request` and `project_review` are added. `project_team_members` is a live tier that `people_directory`'s own team branch reads, so the ledger cannot answer "what is open on this teammate" | `00627:226-381` vs `crm-model.md` §2 (Access grant · tier) | catalog + read of the view's 11 branch literals |
| MINOR-4 | **Four of the eleven branches carry a LINK id as `subject_id`** (`subject_type` `'link'` / `'exception'`), so CS2-14's own question — "what is open on this person" — is unanswerable for `doc_share`, `plan_link`, `invoice_pay` and `evidence_upload`. crm-model §2 says `subject_ref` is "Person or Engagement" | `00627:163`, `:198`, `:288`, `:352` | read |
| MINOR-5 | `v_access_grants`' `project_review` branch sets **`granted_by = pra.revoked_by`** — the person who closed the door, labelled as the person who opened it | `00627:375` | read |
| MINOR-6 | `v_access_grants`' `client_account` branch sets **`last_used_at = dc.last_contacted_at`** — the studio's own outbound touch, not the homeowner's use of the account | `00627:259` | read |
| MINOR-7 | **00626 restates `GRANT SELECT … TO authenticated` on `people_directory` without a `REVOKE … FROM PUBLIC, anon`**, unlike every other object this wave creates (`people_directory_seats:695`, `v_access_grants:399` both revoke). Harmless today — `anon` fails at `studio_contacts` before RLS — but the wave's own posture is applied unevenly to the one object it inherits | `00626:609` | `probe65 F`: `people_directory anon_sel = t`; `probe62`: anon's read raises `permission denied for table studio_contacts` |
| MINOR-8 | **`site_access_mode`'s vocabulary is not crm-model §2's.** The model says `controls / key / escorted / scheduled / none`; the CHECK says `escorted / key / code / open`. `scheduled` and `none` are unrepresentable, so F-19 (radon, 2027-02), F-24, F-25 and F-27 all seed as `escorted`; and `code` is added in the wave whose PR-r argument is that Patina holds no code. The column is also nullable where the model says required (4 of 31 seeded seats carry NULL) | `00624:121-124`, `:157-160` | catalog + the seeded distribution (18 `escorted`, 1 `key`, 8 `open`, 4 NULL) |
| MINOR-9 | **Stage vocabulary drift:** `invited` where crm-model §2 says `invited_to_bid`; `mobilized` and `retired` have no display word in direction §3.8's stage family | `00624:110-116` vs `crm-model.md` §2, `direction.md:188` | catalog |
| MINOR-10 | **The backfill's guard protects every hand-moved stage except `active` itself.** `AND pp.stage = 'active'` means a seat a studio deliberately set back to `active` on a completed project is re-overwritten on every replay; the comment at `:281-282` claims the guard protects hand-moved stages generally | `00624:281-292` | read + §1.4 replay |
| MINOR-11 | **Three slightly different formulas for one word.** The party branch uses `compliance_state(q.company_id)` (so an uncarded seat with no firm reads `not_on_file`, not NULL); the contacts branch uses `COALESCE(sc.company_id, sc.id)`; the seats view uses `COALESCE(pp.company_id, pp.studio_contact_id)`. `w1b-report.md` §4's table states only the second and calls it the rule | `00626:437`, `:568`, `:665` | read |
| MINOR-12 | **Two new ungated SECURITY DEFINER oracles.** `project_designer(uuid)` and `project_party_org(uuid)` return a designer uuid and a studio uuid for *any* project id to any authenticated caller. Carried class (w1a r4 MINOR-12 on `project_consent_org`), now doubled | `00625:42-53`, `00624:69-82` | `probe63`: as Alpha, `project_designer(<Beta project>)` and `project_party_org(<Beta seat>)` both return Beta's ids |
| MINOR-13 | **On a `studio_id IS NULL` project the resolver names one studio, and another studio's recorded refusal for the same number is invisible in both new readers.** Fail-closed downstream (the send gate resolves the same org, finds no record, and branch 4 refuses), so no text goes out; it under-reports on the face. 5 of the 8 seeded projects carry `studio_id IS NULL` | `00626:452-454`, `:466`, `:661-663`; w1a §5.2's reader-side half | probe: resolver picks a third org, `directory_word = not_asked`, `seat_word = not_asked`, the other studio's record says `opted_out` |
| MINOR-14 | **`date::timestamptz` makes the link's expiry session-timezone-dependent.** The comment says "through the END of the window's last day"; in a UTC session that is midnight UTC, i.e. 19:00 the previous evening for a Minneapolis studio | `00627:454` | read |
| MINOR-15 | **`w1b-report.md` §5 says `use-party-sms.ts:133` "is the only" `create_field_link` call site.** `supabase/functions/_shared/sms.ts:565` also calls it, behind `mintFieldLink`, and that is the path by which MAJOR-1 reaches the send rail | `w1b-report.md:236`; `_shared/sms.ts:565`, `:628` | `grep -rn create_field_link packages apps supabase/functions` |
| MINOR-16 | **The reason given for adding `people_crm_dev.sql` to `[remotes.staging.db.seed]` does not hold.** The derivation invariant it cites is already broken in the committed file — `./seed/catalog/first-flight-catalog.sql` is in `[db.seed]` and absent from staging — so "the comment's invariant" is not a reason to push the Okonkwo fixture to a shared environment. The builder flagged the line itself (`w1b-report.md` §6, §8) | `supabase/config.toml:60`, `:88` | read |
| MINOR-17 | **Test coverage for the two divergences above.** Block 4 stages the uncarded identity with two `sub` seats — both inside the Directory's seven — so MAJOR-2's mixed-kind case is untested; block 10 stages only future windows, so MAJOR-1's closed window is untested; block 1 has no gateless-lapse leg (MAJOR-3) and block 2 no wrong-type-supersede leg (MAJOR-4) | `supabase/tests/people/w1b_compliance_authority_directory_test.sql:326-376`, `:602-674`, `:174`, `:240` | read + the four probes above |

---

## 4. Things I checked that are clean, so the next round need not re-walk them

- **PR-r.** No `gate_code`, `code`, `access_code`, `lockbox_code` or `show_to_client` column on
  `project_site_access_cards` (catalog: 0 matches). The table's own COMMENT states the ruling and why.
- **PR-w.** Four policies, all `is_studio_comember(project_designer(project_id))`, no client leg;
  `anon` refused at the grant before any policy runs; a client account reads 0 rows (block 7).
- **PR-n.** §2.3, walked as member / owner / non-member.
- **The consent freeze.** Untouched: the trigger is still `BEFORE UPDATE OF` the eight consent columns
  plus `phone`/`phone_e164`, none of 00624's ten new columns is on it, and `assert_project_party_cards_trg`
  sorts before `normalize_phone_project_parties` so R-AX's derived-value comparison is unaffected.
- **`compliance_state`'s posture.** SECURITY INVOKER, member-only RLS is the whole access rule, a
  caller outside the studio reads `not_on_file` (§2.2). The 30-day window is stated once, at `:325`.
  Undated paper is held and cannot lapse; no paper is `not_on_file` (block 1).
- **The three holder/pointer guards.** `assert_compliance_holder` (kind, studio, successor-card),
  `assert_project_party_cards` (COMPANY card / PERSON card, in the project's own studio, refusing a
  studio-less project), `assert_site_access_key_holder` (a seat on this project),
  `assert_party_authority_copy_to` (seats on the grant's own project) — all four SECURITY DEFINER with
  a pinned `search_path`, all four revoked from PUBLIC, anon **and** authenticated.
- **The four definer readers in 00627.** Each returns exactly the twelve normalised columns, no token
  and no hash; each carries its own studio gate; `anon` holds EXECUTE on none. Probe: zero `grant_id`
  values match `[0-9a-f]{64}`, and Alpha reads none of Beta's.
- **`people_directory`'s twelve original columns** keep their position and type (`attnum` 1–12
  unchanged), and the five new ones are appended at 13–17 — so `select('*')` readers widen.
- **`contact_rule_summary`'s clause order** is fixed and one rule per subject is guaranteed by
  `idx_studio_contact_rules_subject` (UNIQUE on `subject_type, subject_id`), so the scalar SQL
  function cannot silently pick a row. All six seeded rules render as one line each.
- **`db:generate`** run against the freshly reset database produces no drift from what is committed,
  and `@patina/supabase type-check` is clean.

---

## 5. What would make this clean

1. **MAJOR-1** — never mint an expiry in the past, and do not supersede a live token on behalf of a
   mint that cannot produce a usable date.
2. **MAJOR-2** — one winner function both views call, and a block-4 leg with a mixed-kind seat set.
3. **MAJOR-3** — make the paper word read `blocks[]`, or amend the two comments that say it does.
4. **MAJOR-4** — `assert_compliance_holder` must require a renewal to be the same paper, covering at
   least as long.
5. **MAJOR-5** — no SQL change; record the sequencing constraint on the deploy chain in writing.

Gate for all four code changes:

```
python3 scripts/generate-legacy-grants.py
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build supabase:reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
  -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
  -f supabase/tests/people/w1a_identity_channels_consent_test.sql
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build db:generate
```

**Nothing was deployed. No `supabase db push`, no `supabase functions deploy`, no Strata contact.**
