# W1a — adversarial migration review, round 6 (second cycle)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. Local Supabase only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). No `supabase db
push`, no `supabase functions deploy`, no Strata contact, no `.env.local`
repoint (`ls apps/*/.env.local` → `no matches found`, checked before the reset).

The earlier round-6 review that held this filename was preserved as
`w1a-review-r6-migrations.prior.md` before this file was written.

**Verdict: NOT clean — 3 major, 0 blocking, 7 new minors, 15 prior minors still open.**

Both of the prior round's majors (R5-M1, R5-M2) are **fixed**, verified
independently of the suite. The three majors below are new, all in
`record_channel_consent()`, all demonstrated against the live stack, and all in
the same family the wave has been closing for eleven rounds: consent evidence
destroyed by a write that did not mean to destroy it.

---

## 1. What I ran

### 1.1 Reset — full replay + seeds

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build supabase:reset
…
Applying migration 00591_notification_log_delivery.sql...
Applying migration 00592_people_cards_affiliations_rules.sql...
Applying migration 00593_studio_contact_channels.sql...
Applying migration 00594_studio_channel_consent.sql...
Applying migration 20260910152111_create_contact_messages.sql...
Seeding data from supabase/seed/00-legacy-grants.sql...
[…29 seed files…]
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```

(The first attempt failed inside the sandbox on `EPERM … /Users/kody/.supabase/telemetry.json.tmp…`
— a CLI telemetry write, not a migration error. Re-run with the sandbox
disabled for that one command.)

### 1.2 SQL suite

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
…
NOTICE:  29. a held card cannot change what it is or whose it is — including the
         card a contact rule is filed against (r8 R8-M2, R-AR; r9 R5-M1): passed
NOTICE:  30. the fold picks the sibling that HOLDS the refusal … : passed
NOTICE:  30e. a grant's paperwork is never filed as the refusal's own words … : passed
NOTICE:  31. a rule is filed under the noun its subject actually is (r8 F1): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
$ … | grep -c "NOTICE:"
33
```

33 notices. The report's §3 transcript prints 30 and ends at block 30 — see
**R6-m1**.

### 1.3 Deno suites

```
$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 71 passed | 0 failed (93ms)
```

### 1.4 Idempotent rerun — all three files, twice, one rolled-back transaction

```
$ { echo BEGIN;; cat 00592…; cat 00593…; cat 00594…; echo "SELECT 'PASS-1';";
    cat 00592…; cat 00593…; cat 00594…; echo "SELECT 'PASS-2';"; echo ROLLBACK; } > $TMPDIR/idem.sql
$ psql … -v ON_ERROR_STOP=1 -f $TMPDIR/idem.sql
psql exit=0
ERROR lines: 0
 PASS-1
 PASS-2
ROLLBACK
```

Only `… already exists, skipping` notices. Every `ADD COLUMN` is `IF NOT
EXISTS`, every CHECK is stated in the DROP/ADD idiom, every function is `CREATE
OR REPLACE`, every trigger is `DROP … IF EXISTS` + `CREATE`, and both backfills
are `ON CONFLICT … DO NOTHING`, so the second pass inserts nothing and fires no
trigger.

### 1.5 Grants seed + generated types

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2633 replayed statements
$ git diff --stat -- supabase/seed/00-legacy-grants.sql
(empty)
$ git diff --stat 700261663 -- supabase/seed/00-legacy-grants.sql
 supabase/seed/00-legacy-grants.sql | 216 ++++++++++++++++++++++++++++++++++++

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate
$ git diff --stat packages/supabase/src/database.types.ts
(empty)
$ git diff --stat 700261663 -- packages/supabase/src/database.types.ts
 packages/supabase/src/database.types.ts | 508 ++++++++++++++++++++++++++++++++
 1 file changed, 508 insertions(+)
```

508 insertions, zero deletions; regenerating leaves the committed file
unchanged. The seed regenerates with an empty diff. The report says 210 lines /
2632 statements — **R6-m1**.

### 1.6 Grep-winner lineage — diffed, not read

```
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*fc_dispatch_optin_invite" supabase/migrations/*.sql | sort
00284_field_dispatch_wiring.sql
00432_twilio_activation_hardening.sql
00594_studio_channel_consent.sql          ← this wave
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*_site_request_consent_granted_dispatch" … | sort
00374_field_site_request_loop.sql
00594_studio_channel_consent.sql          ← this wave
```

Bodies extracted with `awk '/CREATE OR REPLACE FUNCTION public.<name>/,/^\$\$;/'`
from the grep-winner *before* this wave and from 00594, then `diff -u`:

```
--- 00432 fc_dispatch_optin_invite      +++ 00594
@@ -5,6 +5,12 @@ SET search_path = public AS $$ BEGIN
+  IF COALESCE(current_setting('patina.suppress_consent_dispatch', true), '') = '1' THEN
+    RETURN NEW;
+  END IF;
```

```
--- 00374 _site_request_consent_granted_dispatch    +++ 00594
@@ -8,6 +8,13 @@ v_dispatch jsonb; BEGIN
+  IF COALESCE(current_setting('patina.suppress_consent_dispatch', true), '') = '1' THEN
+    RETURN NEW;
+  END IF;
```

Both are the grep-winner body **verbatim** plus one guard as the first
statement. Nothing else moved — no signature, no `SET search_path` spelling, no
`SECURITY DEFINER`, no dispatch payload. **Clean.**

Every other function in the three files is new. Each name grepped across
`supabase/migrations/*.sql` returns this wave's file and nothing else
(`studio_contact_org`, `project_party_designer`, `assert_studio_contact_designations`,
`assert_affiliation_card_kinds`, `_sync_person_company_pointer`,
`sync_studio_contact_company_pointer`, `sync_person_affiliation_from_pointer`,
`assert_studio_contact_rule_route`, `normalize_channel_value`,
`channel_value_was_on_sms_rail`, `normalize_studio_contact_channel`,
`assert_channel_owner_kind`, `assert_studio_contact_identity_stable`,
`backfill_channel_consent_from_parties`, `mirror_channel_consent_to_parties`,
`record_channel_consent`, `record_channel_reconsent`).

### 1.7 Numbering

Worktree head is `00591_notification_log_delivery`; this wave mints
00592/00593/00594. Scanned every local and remote ref:

```
refs/heads/build/people-room-crm-2026-09-11        :: 00592 00593 00594
refs/heads/hour-tracking/integration               :: 00595 00596 00597
refs/heads/hour-tracking/server                    :: 00595 … 00599
refs/remotes/origin/… (same three)
```

No collision. The timestamp file `20260910152111_create_contact_messages.sql`
is outside the NNNNN sequence, as `inventory.md` (b) says. Numbers stay
provisional to merge.

### 1.8 Objects, RLS, grants, definer posture — probed, never the ledger

```
          relname           | rls | policies
----------------------------+-----+----------
 studio_channel_consent     | t   |        1      (SELECT only — by design)
 studio_contact_channels    | t   |        4
 studio_contact_rules       | t   |        4
 studio_person_affiliations | t   |        4
```

```
         table_name         |    grantee    | privileges
----------------------------+---------------+-----------------------------------
 studio_channel_consent     | authenticated | SELECT
 studio_channel_consent     | service_role  | DELETE,INSERT,…,UPDATE
 studio_contact_channels    | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_contact_rules       | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_person_affiliations | authenticated | DELETE,INSERT,SELECT,UPDATE
```

`anon` holds nothing on any of the four tables and EXECUTE on none of the
nineteen functions. All nineteen pin a `search_path`; all the definer ones pin
`public`:

```
                proname                 | prosecdef |            proconfig            | anon | auth | svc
----------------------------------------+-----------+---------------------------------+------+------+-----
 _site_request_consent_granted_dispatch | t         | {search_path=public}            | f    | f    | t
 _sync_person_company_pointer           | t         | {search_path=public}            | f    | f    | t
 assert_affiliation_card_kinds          | t         | {search_path=public}            | f    | f    | t
 assert_channel_owner_kind              | t         | {search_path=public}            | f    | f    | t
 assert_studio_contact_designations     | t         | {search_path=public}            | f    | f    | t
 assert_studio_contact_identity_stable  | t         | {search_path=public}            | f    | f    | t
 assert_studio_contact_rule_route       | t         | {search_path=public}            | f    | f    | t
 backfill_channel_consent_from_parties  | t         | {search_path=public}            | f    | f    | t
 channel_value_was_on_sms_rail          | f         | {search_path=public}            | f    | f    | t
 fc_dispatch_optin_invite               | t         | {search_path=public}            | f    | t    | t
 mirror_channel_consent_to_parties      | t         | {search_path=public}            | f    | t    | t
 normalize_channel_value                | f         | {search_path=public}            | f    | t    | t
 normalize_studio_contact_channel       | f         | {"search_path=public, pg_temp"} | f    | t    | t
 project_party_designer                 | t         | {search_path=public}            | f    | t    | t
 record_channel_consent                 | t         | {search_path=public}            | f    | t    | t
 record_channel_reconsent               | t         | {search_path=public}            | f    | t    | t
 studio_contact_org                     | t         | {search_path=public}            | f    | t    | t
 sync_person_affiliation_from_pointer   | t         | {search_path=public}            | f    | f    | t
 sync_studio_contact_company_pointer    | t         | {search_path=public}            | f    | f    | t
(19 rows)
```

RLS predicates match the brief: `is_active_studio_member(studio_contact_org(<card>))`
on the three card-owned tables, `is_active_studio_member(organization_id)` on
`studio_channel_consent`, and `is_studio_comember(project_party_designer(subject_id))`
on `studio_contact_rules`' engagement leg only. No client-portal branch anywhere.

Applied CHECKs (note the eight-name channel arrays, not seven):

```
 studio_channel_consent_opt_out_source_check   | CHECK (opt_out_source = ANY (ARRAY['verbal','written','web_form','inbound_sms','other']))
 studio_channel_consent_source_check           | CHECK (source = ANY (…same five…))
 studio_channel_consent_status_check           | CHECK (status = ANY (ARRAY['not_asked','pending','granted','opted_out']))
 studio_contact_channels_channel_kind_check    | CHECK (channel_kind = ANY (ARRAY['mobile','office','dispatch','after_hours','email','ap_email','portal_311']))
 studio_contact_channels_status_check          | CHECK (status = ANY (ARRAY['active','bounced','unsubscribed','dead']))
 studio_contact_rules_channels_allowed_check   | CHECK (channels_allowed <@ ARRAY['mobile','office','dispatch','after_hours','email','ap_email','portal_311','sms'])
 studio_contact_rules_channels_forbidden_check | CHECK (… same eight …)
 studio_person_affiliations_distinct_cards_check | CHECK (person_id <> company_id)
```

Vocabulary vs `direction.md` §3.8 / `crm-model.md` §2: `channel_kind` is
crm-model's Reach list minus `app/account/field_link/paper`, which the file's
banner justifies as E9-derived reach tiers (§3.8's Reach family words: Account ·
Field link · On paper) — a documented, defensible deviation. `status` is
crm-model's `ok/bounced/unsubscribed/dead` with `ok` spelled `active`, stated in
the file. Consent `status` and `source` are crm-model verbatim. No enums added
anywhere — TEXT + CHECK throughout, per the brief and PD-4. No money column is
added; `retainage_bps` is an `integer` in basis points, `char(4)` `tax_id_last4`
is not money (see R5-m7, still open).

### 1.9 Other spot checks

- **`normalize_channel_value` IMMUTABLE is honest**: `normalize_phone_e164` is
  `provolatile = i`. No index depends on either.
- **Extension-function qualification**: the three files call no extension
  function. `gen_random_uuid()` is used bare and resolved to `pg_catalog`
  (the stored defaults print unqualified, i.e. not `extensions.`), so the 00282
  trap does not apply.
- **Crons**: none added.
- **`_primary_studio_for` is called only from SECURITY DEFINER SQL**
  (`assert_studio_contact_rule_route`, `backfill_…`, the mirror,
  `record_channel_consent`), never from the edge rail — `proacl` is still
  `{postgres=X/postgres}` and `sms.ts`/`pipeline.ts` resolve orgs off
  `organization_members`/`organizations` (R-AM holds).
- **`project_parties.sms_consent_status` is `NOT NULL DEFAULT 'not_asked'` with a
  CHECK matching the record's**, so the fold's `SELECT … r.sms_consent_status`
  into a NOT NULL column cannot abort the prod fold on a NULL.
- **`people_directory` is untouched** by this wave (`grep people_directory
  supabase/migrations/0059[234]*.sql` → nothing; the view's 12 columns are
  unchanged), so every existing reader keeps every column it selects. The
  rebuild is correctly listed in the report's "out of W1a scope".
- **No site-access object exists yet** (`grep site_access supabase/migrations/0059[234]*.sql`
  → nothing), so PR-w is vacuously satisfied; and none of the four new tables
  carries a client-portal branch or a `show_to_client` column.
- **No prod command** appears in any changed file (`db push`, `functions
  deploy`, `supabase.co`, the Strata ref, `wrangler deploy` — all absent). The
  one textual hit in `build/probe10-r9-fold-dry-run.sql:3` is a comment saying
  when to run a read-only dry run.
- **Working tree is clean**; the wave touches 11 files (3 migrations, 1 SQL
  test, 3 edge-function sources, 2 edge test files, the grants seed, the
  generated types).
- **The shipped card editor never sends `entity_kind`** on update
  (`add-person-sheet.tsx:439` — "patches only what changed; entity_kind/contact_kind
  are never sent"), and the R-AR guard early-returns on a restatement, so
  00593's new trigger is not a live regression on the designer portal.

---

## 2. Findings

Severity: **blocking** = must change before merge; **major** = must change
before the prod fold / before the surface it corrupts is read; **minor** = worth
a line. Confidence is stated separately.

### MAJOR

---

#### R6-M1 — a recorded refusal overwrites the CONSENT side's evidence, so the record can no longer say how the grant it still dates arrived
**severity: major · confidence: high (demonstrated) ·
`supabase/migrations/00594_studio_channel_consent.sql:1403-1405`, against its own
invariant at `:1131-1142`**

W4-M2 gave the refusal its own four columns for one stated reason
(`00594:187-191`): *"The record holds two facts at once … 'opted out by text, 3
Dec 2025' AND 'fresh signed consent, 11 Sep 2026' — and one evidence set could
only hold the later of them."* The **symmetric** pair — the record holds a GRANT
and a later REFUSAL at the same time — is not handled. The `opted_out` branch
writes the refusal's set *and* the consent set:

```sql
      source             = COALESCE(EXCLUDED.source, scc.source),        -- :1403
      evidence           = COALESCE(EXCLUDED.evidence, scc.evidence),    -- :1404
      recorded_at        = EXCLUDED.recorded_at,                          -- :1405
```

and the evidence gate forces a refusal to supply a non-blank `p_source` and
`p_evidence` (`:1215-1221`), so `EXCLUDED.source`/`EXCLUDED.evidence` are never
NULL on this path and the COALESCE never protects anything. `consented_at`
survives (`:1380-1381`), so the record keeps the grant's DATE and loses the
grant's SOURCE, WORDS and `recorded_at`.

The file says this must not happen. `00594:1139-1142`: *"The only field a change
may legitimately omit is `disclosure_version` on an `opted_out` — a refusal is
not shown a disclosure — and the version the person WAS shown when they
consented is a fact the audit still needs."* If the disclosure the person was
shown is a fact the audit needs, so is the source and the words of the consent
it belonged to.

**Demonstrated** (`$TMPDIR/fresh1.sql`, rolled back; F-12's shape — a written
kickoff-form grant, then PR-m's manual verbal refusal, both through the RPC as
an ordinary studio member):

```
=== 1. record a WRITTEN grant (the kickoff form) ===
 status  | source  |             evidence              | consented_at | recorded_at | disclosure_version
---------+---------+-----------------------------------+--------------+-------------+--------------------
 granted | written | Signed the Lindqvist kickoff form | 2026-09-12   | 2026-09-12  | v2

=== 2. PR-m: the studio marks a VERBAL refusal it heard ===
  status   | source |      evidence      | recorded_at | consented_at
-----------+--------+--------------------+-------------+--------------
 opted_out | verbal | He told me on site | 2026-09-12  | 2026-09-12

=== 3. what the record now says about the GRANT that still has its date ===
  status   | granted_on | grant_source_now | grant_evidence_now | grant_recorded_at_now
-----------+------------+------------------+--------------------+-----------------------
 opted_out | 2026-09-12 | verbal           | He told me on site | 2026-09-12
```

Report decision 9 and R-Q require both halves printable: *"the room has to be
able to print 'granted 2 May 2025, opted out 3 Dec 2025'"*, and R-Q's canonical
form is `"<Source> consent, <d Mon yyyy>, on the <project>."` After one PR-m
act the grant half composes to **"Verbal consent, 2 May 2025, on the Lindqvist
kitchen"** — the wrong noun for a written consent — and the 10DLC artifact of
the consent itself ("Signed the Lindqvist kickoff form", recorded 2025-05-02) is
gone from the record with no audit row. `record_channel_reconsent()` does not
restore it; it writes the *studio's fresh* consent into the same five columns.

This is verbatim the failure W4-M2 found in the other direction, arriving from
the verdict that W4-M2's own columns were minted to make survivable.

**Fix.** The refusal's account of itself already has a home. On the `opted_out`
branch write `opt_out_source / opt_out_evidence / opt_out_recorded_at /
opt_out_recorded_by` only, and leave `source / evidence / recorded_at /
disclosure_version / recorded_by` exactly as they stand (the same `CASE WHEN
EXCLUDED.status <> 'opted_out' THEN scc.… ` shape the four `opt_out_*` columns
already use, inverted). That keeps `00594:1412-1424`'s intent — the studio's own
account of a refusal is recorded — while putting it where the refusal's account
belongs, and it removes the one remaining way an ordinary studio act destroys a
consent's 10DLC evidence. Add a block asserting that a `granted` followed by an
`opted_out` leaves `source = 'written'` and the grant's words intact.

---

#### R6-M2 — an empty-string disclosure version wipes the one column the file promises a refusal may not touch
**severity: major · confidence: high on the behaviour (demonstrated), medium on
reachability (no caller exists yet) ·
`supabase/migrations/00594_studio_channel_consent.sql:1406`**

```sql
      disclosure_version = COALESCE(EXCLUDED.disclosure_version, scc.disclosure_version),
```

Every gate in this RPC tests blankness the SQL way — `COALESCE(btrim(x), '') = ''`
(`:1208-1220`, `:1646-1652`). This one line tests NULL. And
`p_disclosure_version` is the one evidence argument the `opted_out` branch does
**not** require (`:1215-1221`, deliberately: "a refusal is not shown a
disclosure"), so a caller that sends an empty form field rather than omitting it
passes straight through, and `''` is not NULL.

**Demonstrated** (`$TMPDIR/fresh1.sql`, same fixture, `p_disclosure_version = ''`
on the refusal):

```
=== 3. what the record now says ===
  status   | granted_on | disclosure_version
-----------+------------+--------------------
 opted_out | 2026-09-12 |                     ← was 'v2'
```

With `NULL` instead of `''` the same call keeps `v2` — so the protection works
and is defeated by the blank. Nothing restores it: `record_channel_reconsent()`
overwrites `disclosure_version` with its own argument, the mirror only ever
COALESCEs *from* the record onto the seat, and the fold is `ON CONFLICT DO
NOTHING`. `00594:1139-1142` names this exact column as the one the audit still
needs, and `00594:134-138` states the invariant it breaks ("No write may EMPTY
the evidence set").

W1a ships no caller, which is the wave's own stated reason for closing things
now rather than at W1b (`00592:764-766`).

**Fix.** `disclosure_version = COALESCE(NULLIF(btrim(EXCLUDED.disclosure_version), ''), scc.disclosure_version)`,
and the same `NULLIF(btrim(…), '')` on `source`, `evidence` and
`origin_project_id`'s siblings for consistency. Add a block that records a
grant with `v2`, then an `opted_out` with `p_disclosure_version = ''`, and
asserts `v2` still stands.

---

#### R6-M3 — an EMAIL refusal is permanent: the "fresh recorded consent" half of PR-m's way back does not exist for email
**severity: major · confidence: high (demonstrated) ·
`supabase/migrations/00594_studio_channel_consent.sql:1470-1474`, `:1671-1680`,
`:168`**

`studio_channel_consent.channel_kind` is `CHECK (channel_kind IN ('sms','email'))`
(`:168`) and `record_channel_consent` accepts both (`:1182-1184`). A refusal sets
`refusal_unanswered = true` (`:1364`, `:1401`), and the write gate then refuses
every verdict but `opted_out` while it stands (`:1470-1474`).

The whole design rests on one sentence, stated in the header and in six
comments: *"What answers a refusal is the recipient's own YES or START, which
the inbound rail writes directly — lowering the flag"* (`:1331-1334`). That rail
is `sms-inbound/pipeline.ts`, and it writes **only** `channel_kind: 'sms'`
(`pipeline.ts:364-369`). Nothing in the tree ever writes an `email` consent row
(`grep -rn studio_channel_consent supabase/functions packages apps` → three SMS
call sites and comments). `record_channel_reconsent()` deliberately no longer
moves the status (r7 M7-2, `:1671`). So for email there is **no writer that can
ever lower the flag**, and no door back to `granted`.

**Demonstrated** (`$TMPDIR/fresh2.sql`, rolled back, as an ordinary member):

```
=== email: record an opted_out (an unsubscribe the studio heard) ===
  status   | refusal_unanswered
-----------+--------------------
 opted_out | t

=== email: the person later signs a fresh consent — record_channel_consent granted ===
NOTICE:  REFUSED: channel_opted_out

=== email: reconsent, then granted again ===
NOTICE:  reconsent ACCEPTED
NOTICE:  REFUSED: channel_opted_out

=== final state ===
 channel_kind |  channel_value   |  status   | refusal_unanswered
--------------+------------------+-----------+--------------------
 email        | dana@example.com | opted_out | t
```

PR-m, ruled STAND by Kody: *"The way back is always a fresh recorded consent **or**
an inbound START."* For SMS the wave chose the START half and defended it on
10DLC grounds (r7 M7-2) — a reading a carrier audit supports. For email there is
no START, no carrier, and no CTIA rule requiring one, so the ruled way back
collapses to nothing. Today no data can reach this state (nothing writes email
consent); the moment P3's email channel status lands
(`direction.md` §7, `notification_log` row), an unsubscribe recorded by a studio
member is a permanently dead address in that studio's book.

**Fix.** Either (a) let `record_channel_consent` accept `granted` over an
unanswered refusal when `p_channel_kind = 'email'` and the call supplies a fresh
source + evidence + disclosure_version — the "fresh recorded consent" PR-m names
— or (b) make `record_channel_reconsent()` lower `refusal_unanswered` for
`email` only, keeping `status = 'opted_out'` until the studio records the grant.
Either way name the asymmetry in the header (the SMS half stays the
recipient's), and add a block proving an email refusal is recoverable and an SMS
one is not.

---

### MINOR (new this round)

| # | Finding | Evidence |
|---|---|---|
| R6-m1 | **`w1a-report.md` is stale for the seventh consecutive round, and this time it mis-describes the fix that closed the prior round's major.** Decision 23 (`:480-482`) still says the mirror writes NULL "when `NEW.status = 'opted_out'` **and `NEW.opt_out_source IS NULL`**" — the one-column-wide test r5's R5-M2 replaced; the shipped code writes all four straight from `NEW.opt_out_*` whenever the verdict is a refusal (`00594:870-881`), which is the whole point of the fix. Also: §1 `:15` and §3 `:852` say "the seven-name channel vocabulary" (applied: eight, with `sms`); §3's SQL transcript ends at block 30 and claims 30 notices (actual 33 — 30e and 31 are missing); §1 `:42-44` says "gained 210 lines … baseline + 2632 replayed statements" (actual 216 / 2633). | report `:15`, `:42-44`, `:480-482`, `:774-784`, `:852`; `grep -c NOTICE:` → 33; `git diff --stat 700261663 -- supabase/seed/00-legacy-grants.sql` → 216; generator stdout → 2633 |
| R6-m2 | An out-of-vocabulary `p_source` reaches the table and raises a raw `23514`, unlike every other input in the RPC (`invalid_channel_kind`, `invalid_consent_status`, `invalid_channel_value`, `consent_not_recordable` are all named). A portal that passes a free-text source gets a constraint name, not a sentence. | `00594:1182-1204`; probe → `REFUSED: 23514 / new row … violates check constraint "studio_channel_consent_source_check"` |
| R6-m3 | 00593's four backfill legs have no `archived_at IS NULL` filter, so an archived card gains reach channels and is then permanently **identity-held** by 00593's R-AR guard — a card the studio archived can no longer be re-kinded or moved, and W1a ships no channel editor to detach the rows. | `00593:407-459`; `00593:517-522` |
| R6-m4 | `studio_contact_channels.created_by` and `studio_person_affiliations.created_by` carry no `DEFAULT auth.uid()` while the sibling table's `studio_contact_rules.set_by` does (`00592:733`). Neither table has a writer yet, so every row W1b creates will record no author unless the hook remembers to send one. | `00593:83`; `00592:289` vs `00592:733` |
| R6-m5 | `company_kind`'s CHECK does not carry PR-f's shape: there is no `other_named`-with-a-required-label (the CHECK takes a bare `'other'` with nothing requiring a label), and no `inspector_subtype` (`ahj / lender / third_party`) anywhere — crm-model §2 names the subtype as its own field and R-A/R-H both turn on telling an AHJ from a draw inspector. Neither is listed in the report's "Not done". | `00592:132-146`; `rulings.md` PR-f; `crm-model.md` §2 `inspector_subtype` |
| R6-m6 | `escalation_by_class jsonb NOT NULL DEFAULT '{}'` takes any shape at all. The contract is `decision_class → channel_kind` (crm-model §2, F-05's "phone call over $2,500"), and this table is the ONE home of the routing fact by decision 1 — the same argument r6 M6-5 used to CHECK `channels_allowed`/`channels_forbidden`. A key or value the composer cannot match is a silent non-escalation. | `00592:730`; cf. `00592:754-766` |
| R6-m7 | `record_channel_consent` never checks `p_origin_project_id` against `p_organization_id`. A member may stamp any project id they hold — including another studio's — as the origin R-Q's sentence names ("opted out … on the <project>"). The three other cross-tenant pointers this wave added all got a guard (R-AP, M6-4, R-AR); this one did not. | `00594:1163`, `:1374`, `:1458` |

---

## 3. Prior-round findings, re-checked

| Prior | Ruling | State |
|---|---|---|
| **R5-M1** — R-AR guard omitted `studio_contact_rules.subject_id` | count the fifth holder | **fixed** (`00593:556-562`). Independently probed (`$TMPDIR/fresh4.sql`): flipping a rule subject's `entity_kind` → `REFUSED: studio_contact_identity_held`; moving it to another studio → `REFUSED: studio_contact_identity_held`. Block 29 passes. |
| **R5-M2** — a mirrored refusal lent the seat the GRANT's recorder | decide the four as a set, no seat fallback | **fixed** (`00594:779`, `:870-881`, `:933-941`, `:958-974`). Independently probed (`$TMPDIR/fresh3.sql`, F-12's shape): seat before = `granted / written / "Signed the Lindqvist kickoff form" / …0002`; after the rail's STOP = `opted_out / inbound_sms / "Replied STOP" / (null)` → `seat_names_a_studio_member_as_refuser = f`. Block 27 passes. |
| R5-m1 report staleness | — | **open again** → **R6-m1** (and now mis-describes R5-M2's fix) |
| R5-m2 `channelConsentVerdict`'s last branch swallows its read error | — | **open** (`sms.ts:504-507` — `const { data: rows }` with no `error`) |
| R5-m3 inbound rail swallows its write errors (`upsert`/two `update`s) | — | **open** (`pipeline.ts:364`, `:423`, `:463`) |
| R5-m4 `origin_project_id` follows the current verdict | — | **open** by design (`00594:1458`; `pipeline.ts:409`) |
| R5-m5 `grantPartiesForStudios` writes `sms_opt_out_at: null` | — | **open** (`pipeline.ts:465`); mitigated by the mirror restoring `prior.opt_out_at` |
| R5-m6 `studio_contact_org` / `project_party_designer` answer for any uuid to `authenticated` | — | **open** (`00592:75-76`, `:98-99`; probed) |
| R5-m7 `tax_id_last4 char(4)` blank-pads; crm-model says `text` | — | **open** (`00592:119`) |
| R5-m8 `normalize_studio_contact_channel` pins a different search_path spelling | — | **open** (`00593:248`; probe §1.8) |
| R5-m9 the designation trigger's `UPDATE OF` list omits `entity_kind` | — | **open** (`00592:252-256`) |
| R5-m10 `reach_preference` neither built nor recorded as not built | — | **open** (`grep -rn reach_preference supabase/ packages/` → empty; `direction.md` §7 lists it; report §5 does not) |
| R5-m11 orphan rules from a deleted card | — | **open** (`00592:718-721`, no FK by design) |
| R5-m12 fold keeps the latest `opt_out_at`, the RPC the earliest | — | **open** (`00594:376-377`, `:488-490` vs `:1392-1394`) |
| R5-m13 fold is `O(cards × party rows)` on a non-sargable predicate | — | **open** (`00593:222-227`, `:440`, `:442`) |
| R5-m14 a member may launder a carrier refusal by passing `p_source = 'inbound_sms'` | — | **open** (`00594:1427-1433`) |
| R5-m15 no partial unique index for "one preferred channel per kind" | — | **open** (`00593:77`) |
| r4 R4-M1 grant's paperwork never filed as the refusal's words | — | **fixed** (`00594:465-472`, `:485-490`; block 30e) |
| r4 R4-M2 `sms` as a rule-only token | — | **fixed** (`00592:796-822`; block 25) |
| r2 R2-M1 fold picks the sibling that holds the refusal | — | **fixed** (block 30) |
| r8 R8-M1 / R-AQ, r8 R8-M2 / R-AR, r8 F1, r8 W4-M1/W4-M2, r7 M7-1/M7-2/R7-M1, r6 B6-1/M6-1..M6-5, r5 R-AL..R-AP, r4 B-1/M-1/M-2, r3r2 BLOCKING, r2 B-1, M3-1..M3-4, F3 | — | **all still fixed** (blocks 3, 8–31 pass; grep-winner diffs §1.6; 71 Deno tests) |

---

## 4. Not checked

- **Strata.** Nothing pushed, deployed, or probed against prod.
- **The pre-push fold dry run** (`probe10-r9-fold-dry-run.sql`) was not re-run;
  none of this round's three majors touches the fold's CTE chain, so it does not
  need re-cutting.
- **The wider Deno suite** beyond the two SMS files; the report's note about
  `stripe-rail.test.ts` failing on missing env was not re-verified.
- **Portal type-check / build.** No portal source changed
  (`git diff --stat 700261663 -- apps packages` touches only
  `packages/supabase/src/database.types.ts`).
