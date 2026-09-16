# W1a — adversarial migration review, round 3 (fresh pass)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, working tree clean at the start and
at the end of this review (`git status --short` → empty; my two regenerations —
`generate-legacy-grants.py` and `db:generate` — both produced byte-identical
files).

Read in full: `build/w1a-report.md`; `supabase/migrations/00592_people_cards_affiliations_rules.sql`,
`00593_studio_contact_channels.sql`, `00594_studio_channel_consent.sql`;
`supabase/tests/people/w1a_identity_channels_consent_test.sql` (header + run);
the two redefined lineage bodies (`00432:27-68`, `00374:3399-3455`);
`supabase/functions/_shared/sms.ts` and `supabase/functions/sms-inbound/pipeline.ts`
(the consent-bearing paths); `rulings.md` (all sections), `synthesis/direction.md`
§2.2/§3.8/§7/§8, `synthesis/crm-model.md` §1/§2/§4/§5,
`briefing/current-state.md` §B–§E, `build/inventory.md`, `briefing/fixture.md`,
`build/w1a-fix-log-r2.md`, `build/w1a-review-r2-migrations.md`.

**NO PROD.** No `supabase db push`, no `supabase functions deploy`, nothing
pointed at Strata. Local stack only, `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
`apps/designer-portal/.env.local` does not exist in this worktree
(`ls` → "No such file or directory (os error 2)"), so the reset could not reach
a cloud project.

**Verdict: NOT CLEAN — 1 major, 0 blocking.** Everything the round-2 review
raised as major is fixed and verified. The one new major is a guard the wave
argued for three times elsewhere and did not apply to `studio_contact_rules`'
own subject.

---

## 0. Gates run, with output

### Reset (mine, this session)

```
$ pnpm --dir .codex/worktrees/agent-people-build supabase:reset
…
Applying migration 00591_notification_log_delivery.sql...
Applying migration 00592_people_cards_affiliations_rules.sql...
Applying migration 00593_studio_contact_channels.sql...
Applying migration 00594_studio_channel_consent.sql...
Applying migration 20260910152111_create_contact_messages.sql...
Seeding data from supabase/seed/00-legacy-grants.sql...
…29 seed files…
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```

(The first attempt failed inside the sandbox on `EPERM … /Users/kody/.supabase/telemetry.json`
— a CLI telemetry write, not a migration error. Re-run with the sandbox
disabled for that one command.)

Ledger tip after the reset: `20260910152111 · 00594 · 00593 · 00592 · 00591`.
Backfills found nothing locally, as the report says:

```
 channels | consent | affiliations | cards | parties
----------+---------+--------------+-------+---------
        0 |       0 |            0 |     0 |       0
```

### SQL suite — 30 notices, all pass

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
…
NOTICE:  26. no studio-side verdict lowers refusal_unanswered (r7 M7-1): passed
NOTICE:  27. reconsent is evidence-only … (r6 R6-M1) — nor left standing on the sibling seat (r8 R8-M1): passed
NOTICE:  28. a studio-recorded refusal never speaks for a texted one … (r7 R7-M1): passed
NOTICE:  29. a held card cannot change what it is or whose it is (r8 R8-M2, R-AR): passed
NOTICE:  30. the fold picks the sibling that HOLDS the refusal … (r2 R2-M1): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

### Deno — the two suites the invariants rest on

```
$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 71 passed | 0 failed (92ms)
```

### Idempotent re-run — clean

All three files concatenated **twice** and replayed against the already-migrated
database inside one rolled-back transaction:

```
$ psql … -v ON_ERROR_STOP=1 -f rerun2x.sql ; echo exit=$?
exit=0        # no ERROR lines; backfill_channel_consent_from_parties() → 0
ROLLBACK
```

### Legacy grants + generated types

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2633 replayed statements
$ git diff --stat supabase/seed/00-legacy-grants.sql      # (empty — regenerates identically)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate
$ git diff --stat packages/supabase/src/database.types.ts # (empty)
$ git diff --stat 700261663 -- packages/supabase/src/database.types.ts
 packages/supabase/src/database.types.ts | 508 ++++++++++++++++++++++++++++++++
 1 file changed, 508 insertions(+)      # 508 insertions, ZERO deletions
```

(Note: the first `db:generate` attempt ran inside the sandbox, failed on the
CLI's Docker probe, and — because the script is a `>` redirect — truncated the
committed file to zero. Restored with `git checkout --` and re-run outside the
sandbox. Flagging the shape: `pnpm db:generate` destroys `database.types.ts`
on any CLI failure.)

### Lineage — both redefined bodies ARE the grep-winner, verbatim + one guard

```
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*fc_dispatch_optin_invite" supabase/migrations/*.sql | sort | tail -1
supabase/migrations/00432_twilio_activation_hardening.sql
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*_site_request_consent_granted_dispatch" supabase/migrations/*.sql | sort | tail -1
supabase/migrations/00374_field_site_request_loop.sql
```

Mechanical diffs (winner body → 00594's body):

```
$ diff -u <(sed -n '27,68p'     00432_twilio_activation_hardening.sql) \
          <(sed -n '570,617p'   00594_studio_channel_consent.sql)
+  -- 00594: the mirror is maintaining the cached copy …
+  IF COALESCE(current_setting('patina.suppress_consent_dispatch', true), '') = '1' THEN
+    RETURN NEW;
+  END IF;
+
   IF NEW.sms_consent_status <> 'pending' OR NEW.phone_e164 IS NULL THEN

$ diff -u <(sed -n '3399,3443p' 00374_field_site_request_loop.sql) \
          <(sed -n '637,689p'   00594_studio_channel_consent.sql)
+  -- 00594: the mirror is maintaining the cached copy …
+  IF COALESCE(current_setting('patina.suppress_consent_dispatch', true), '') = '1' THEN
+    RETURN NEW;
+  END IF;
+
   IF NEW.sms_consent_status <> 'granted'
```

Nothing else differs. The 00374 trigger definition (`:3446-3455`,
`AFTER UPDATE OF sms_consent_status … WHEN (… NEW = 'granted')`) is untouched.

Every other function name in the three files returns **no** prior definition:

```
$ for n in studio_contact_org project_party_designer assert_studio_contact_designations \
           assert_affiliation_card_kinds _sync_person_company_pointer \
           sync_studio_contact_company_pointer sync_person_affiliation_from_pointer \
           assert_studio_contact_rule_route normalize_channel_value \
           channel_value_was_on_sms_rail normalize_studio_contact_channel \
           assert_channel_owner_kind assert_studio_contact_identity_stable \
           backfill_channel_consent_from_parties mirror_channel_consent_to_parties \
           record_channel_consent record_channel_reconsent ; do
    grep -rln "CREATE OR REPLACE FUNCTION[^(]*\b$n\b" supabase/migrations/*.sql \
      | grep -v "0059[234]_" ; done
(no output)
```

### Numbering

Head is `00591`; the wave mints `00592/00593/00594`. Across all local and remote
refs, only this branch and its origin mirror carry those numbers:

```
refs/heads/build/people-room-crm-2026-09-11    -> 00592 00593 00594
refs/remotes/origin/build/people-room-crm-2026-09-11 -> 00592 00593 00594
```

No `supabase migration new`. Provisional until merge, as the report says.

### Objects, RLS, policies, grants

```
          relname           | rls | policies
----------------------------+-----+----------
 studio_channel_consent     | t   |        1
 studio_contact_channels    | t   |        4
 studio_contact_rules       | t   |        4
 studio_person_affiliations | t   |        4

         table_name         |    grantee    |  privs
----------------------------+---------------+------------------------------
 studio_channel_consent     | authenticated | SELECT
 studio_channel_consent     | service_role  | (all)
 studio_contact_channels    | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_contact_rules       | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_person_affiliations | authenticated | DELETE,INSERT,SELECT,UPDATE
```

`anon` holds nothing anywhere — probed behaviourally, not only by ACL:

```
NOTICE:  anon refused: permission denied for function studio_contact_org
NOTICE:  anon channels refused: permission denied for table studio_contact_channels
NOTICE:  anon consent refused: permission denied for table studio_channel_consent
```

Predicates match the brief: `is_active_studio_member(studio_contact_org(<card>))`
for the `studio_contacts`-family tables (00592:331-364, 00593:338-361),
`is_active_studio_member(organization_id)` for the consent record (00594:301-305),
and `is_studio_comember(project_party_designer(subject_id))` for
`studio_contact_rules`' engagement leg (00592:910-958), matching 00584's
`project_parties` posture. `is_active_studio_member` excludes `role = 'guest'`
and non-members, so no client-portal identity reaches any of the four tables;
`project_site_access_cards` (PR-w) does not exist in this wave, and none of the
three files contains a client branch or a `show_to_client`.

### SECURITY DEFINER + pinned search_path — all 19

```
                proname                 | prosecdef |            proconfig            | anon_x | auth_x
----------------------------------------+-----------+---------------------------------+--------+--------
 _site_request_consent_granted_dispatch | t         | {search_path=public}            | f      | f
 _sync_person_company_pointer           | t         | {search_path=public}            | f      | f
 assert_affiliation_card_kinds          | t         | {search_path=public}            | f      | f
 assert_channel_owner_kind              | t         | {search_path=public}            | f      | f
 assert_studio_contact_designations     | t         | {search_path=public}            | f      | f
 assert_studio_contact_identity_stable  | t         | {search_path=public}            | f      | f
 assert_studio_contact_rule_route       | t         | {search_path=public}            | f      | f
 backfill_channel_consent_from_parties  | t         | {search_path=public}            | f      | f
 channel_value_was_on_sms_rail          | f         | {search_path=public}            | f      | f
 fc_dispatch_optin_invite               | t         | {search_path=public}            | f      | t
 mirror_channel_consent_to_parties      | t         | {search_path=public}            | f      | t
 normalize_channel_value                | f         | {search_path=public}            | f      | t
 normalize_studio_contact_channel       | f         | {"search_path=public, pg_temp"} | f      | t
 project_party_designer                 | t         | {search_path=public}            | f      | t
 record_channel_consent                 | t         | {search_path=public}            | f      | t
 record_channel_reconsent               | t         | {search_path=public}            | f      | t
 studio_contact_org                     | t         | {search_path=public}            | f      | t
 sync_person_affiliation_from_pointer   | t         | {search_path=public}            | f      | f
 sync_studio_contact_company_pointer    | t         | {search_path=public}            | f      | f
(19 rows)
```

Every `prosecdef = t` pins `search_path`. `normalize_channel_value`'s IMMUTABLE
label is honest: `normalize_phone_e164` is itself `provolatile = i`.

### The mirror cannot loop, and its release path is durable-only

Full non-internal trigger inventory of every table the mirror touches:

```
           relname            |                  tgname                   |                proname
------------------------------+-------------------------------------------+---------------------------------------
 project_parties              | fc_optin_invite_dispatch                  | fc_dispatch_optin_invite       (AFTER, guarded)
 project_parties              | normalize_phone_project_parties           | normalize_party_phone_e164     (BEFORE, pure)
 project_parties              | set_updated_at_project_parties            | update_updated_at_column       (BEFORE, pure)
 project_parties              | site_request_consent_granted_dispatch     | _site_request_consent_granted_dispatch (AFTER, guarded)
 site_request_dispatch_outbox | set_updated_at_site_dispatch_outbox       | update_updated_at_column       (BEFORE)
 site_requests                | set_updated_at_site_requests              | update_updated_at_column       (BEFORE)
 site_requests                | site_requests_validate_project_party      | _site_request_validate_request (BEFORE)
 studio_channel_consent       | mirror_channel_consent_to_parties_trg      | mirror_channel_consent_to_parties
 studio_channel_consent       | set_updated_at_studio_channel_consent      | update_updated_at_column
 studio_contacts              | assert_studio_contact_designations_trg     | …
 studio_contacts              | assert_studio_contact_identity_stable_trg  | …
 studio_contacts              | normalize_phone_studio_contacts            | …
 studio_contacts              | set_updated_at_studio_contacts             | …
 studio_contacts              | sync_person_affiliation_from_pointer_trg   | …
```

No path writes back into `studio_channel_consent`, so the mirror cannot loop.
`site_request_dispatch_after_consent(uuid, timestamptz)` — read in full from
`pg_get_functiondef` — touches only `site_requests` and
`site_request_dispatch_outbox`, with no `invoke_edge_function` and no `net.*`;
both tables carry BEFORE triggers only. The two `invoke_edge_function` calls in
00594 are inside the two grafted bodies, verbatim from their lineage.

The two affiliation-sync triggers terminate in one hop in every direction
(`patina.suppress_affiliation_sync` on the forward write, the
`v_open IS NOT DISTINCT FROM NEW.company_id` early return on the back-write,
and the `IS DISTINCT FROM` guard on `_sync_person_company_pointer`'s UPDATE).
Suite blocks 12 and 20 exercise it.

### Send gate

`channelConsentVerdict` (sms.ts:440-511) refuses on: a failed org resolve, a
failed record read, `status = 'opted_out'`, `refusal_unanswered = true` at ANY
status, and an opted-out seat in the same studio; `"allow"` requires a `granted`
record AND no opted-out seat. The one remaining phone-global read is the
no-studio branch, and although it does not check its own read error, a failed
read there falls through to `resolveRecipient`'s `"not_asked"` default, which
the legacy gate refuses (`not_consented` / `not_invitable`) — fail-closed in
every branch I could construct. `flushDeferredMessages` (sms.ts:1048-1090) runs
the same two gates in the same order, keyed off the deferred row's own party.
`refusal_unanswered` is lowered by exactly one writer
(`pipeline.ts:378`, `status === "opted_out"` → false only on a YES/START).

### Vocabulary, money, crons, prod

`status` `not_asked|pending|granted|opted_out` and `source`
`verbal|written|web_form|inbound_sms|other` match direction §3.8's consent family
and crm-model §2, **and match `project_parties`' own CHECKs byte for byte** —
so the first prod fold cannot raise 23514:

```
 project_parties_sms_consent_source_check | CHECK (… 'verbal','written','web_form','inbound_sms','other')
 project_parties_sms_consent_status_check | CHECK (… 'not_asked','pending','granted','opted_out')
```

Every column the fold copies is FK-safe too (`sms_consent_recorded_by` already
REFERENCES `profiles`), so no 23503 either. Channel kinds are crm-model §2's
list minus the four reach tiers (`app/account/field_link/paper`), argued at
00593:95-98. `company_kind` is a superset of the shipped UI labels. No enum, no
`ADD VALUE`. `retainage_bps` is an integer; the wave adds no money column. No
`cron.schedule`. No prod command in any of the three files or in the SQL suite.
`people_directory` is untouched (`grep` → 0 hits in all three files) and still
carries its twelve columns after the reset; `use-people.ts` reads it with
`select('*')`.

The R-AR identity guard breaks no shipped writer: the only non-test caller of
`useUpdateStudioContact` is `add-person-sheet.tsx`, whose patch is diff-only and
never contains `entityKind`; and `grep -rniE "update\s+(public\.)?studio_contacts"`
over `supabase/`, `packages/` and `apps/` returns nothing outside this wave.

---

## 1. Prior findings — re-checked

### Round 2's two majors

| r2 | Claim | Now |
|---|---|---|
| R2-M1 | the fold picked the refusing sibling by most recently TOUCHED | **FIXED** — `refusal`'s `ROW_NUMBER()` orders `(source IS NOT NULL) DESC, (opt_out_at IS NOT NULL) DESC, …` with a group-wide `max(sms_opt_out_at)` fallback (00594:437-464), and `ranked`'s within-status tiebreak carries the same two legs, inert outside the refusal bucket (00594:372-375). Suite block 30 passes in my run; `probe20-r2-negative-control.sql` exists. I re-derived the inertness claim by hand: both CASEs require `sms_consent_status = 'opted_out'`, and the status bucket is the first ORDER BY key, so a granted/pending/not_asked group scores 1 on both. |
| R2-M2 | the report was a round and a half behind the branch | **FIXED in substance** — I re-took every number: 19 SECURITY DEFINER rows, 5 `studio_contacts` triggers, 30 suite notices / 31 blocks, 508 type insertions with zero deletions, 29 seed files. All match the report. Decisions 23/24/25 and the §5 dry-run note are present. **One figure is still stale** — see m18 below. |

### Round 2's seventeen minors — none were fixed (by the fix log's own scope line: "no ruling covers them"). Re-verified this round:

| r2 | Now | Evidence I took |
|---|---|---|
| m1 | **open** | 00594:494-496 takes `source/evidence/recorded_at/disclosure_version/recorded_by` from the winning row with no branch on its status, so a folded refusal writes the STOP's words into the record's CONSENT set as well as `opt_out_*` |
| m2 | **open** | `pipeline.ts:370` stamps `opt_out_at: now` on every STOP; `00594:1318-1320` keeps `LEAST(...)`. Two rules, one column |
| m3 | **open** | `record_channel_consent` sets `refusal_unanswered` for `channel_kind='email'` (00594:1290); the only writer that lowers it is the SMS rail. An email refusal is permanently unanswerable and nothing says so |
| m4 | **open** (not re-probed; code unchanged at 00592:485-490, :641-655) |
| m5 | **open** | `grep -rn reach_preference supabase packages apps` → nothing. direction §7 lists it; report §5's out-of-scope list does not |
| m6 | **open** | `escalation_by_class jsonb NOT NULL DEFAULT '{}'` (00592:728), no CHECK, no comment, beside two arrays CHECKed for exactly this reason |
| m7 | **open** | `studio_contact_rules` FKs are `route_to_person_id` and `set_by` only — `subject_id` has none |
| m8 | **open**, and now probed — see F4 |
| m9 | **open** | `grep -c studio_channel_consent supabase/functions/sms-dispatch/index.ts` → 0 |
| m10 | **open, wider** — see m19 |
| m11 | **open** | `tax_id_last4 char(4)`; `retainage_bps integer` with no range CHECK |
| m12 | **open** | 00592:331-334 SELECT gates on `person_id`'s org only; the WITH CHECK legs pin both |
| m13 | **open** | `pg_indexes` on `studio_contact_channels` → pkey, `(owner_id, channel_kind, value)`, `(value)`. No partial unique on `preferred` |
| m14 | **open**, acknowledged in-file at 00594:1401-1407 |
| m15 | **open** | probed: `mirror_channel_consent_to_parties` and `normalize_studio_contact_channel` show `auth_x = t`; their REVOKEs name `PUBLIC, anon` only (00594:952, 00593:261) |
| m16 | **open** | `_primary_studio_for` is called per row at 00594:340, :824, :876, :1200, :1415, :1444 |
| m17 | **open** | `role_at_firm text` (00592:278) and `trades text[]` (00592:115), both uncommented on the vocabulary question |

---

## 2. Findings

### MAJOR — F1. `studio_contact_rules.subject_type` is not held to the subject card's `entity_kind`, so a firm's rule can be filed as a person's and disappear

**Confidence: high (probed).** `subject_type` carries a CHECK
(`person|company|engagement`, 00592:718) and `subject_id` is deliberately
FK-less and polymorphic (00592:719, 744-746). Nothing asserts the two agree.
The RLS legs (00592:910-958) catch only the *cross-family* mismatch — a
`studio_contacts` id under `engagement` resolves `project_party_designer()` to
NULL, and a `project_parties` id under `person` resolves `studio_contact_org()`
to NULL, and `is_*` of NULL is false. Within `studio_contacts` there is no test
at all. `assert_studio_contact_rule_route()` (00592:827-882) tests the ROUTE's
kind and studio and returns at its first statement when
`route_to_person_id IS NULL`, so an unrouted rule is never inspected — and even
a routed one is not, because that function only resolves the subject's ORG.

Probed as a studio owner over `authenticated` with a real JWT claim:

```
NOTICE:  A1: ACCEPTED — subject_type=person naming a COMPANY card (no guard)
NOTICE:  A2: ACCEPTED — subject_type=company naming a PERSON card (no guard)
NOTICE:  C1: ACCEPTED — the route guard checks the ROUTE kind, never the SUBJECT kind

 subject_type |              subject_id              | channels_forbidden
--------------+--------------------------------------+--------------------
 company      | c1000000-0000-0000-0000-000000000001 | {mobile}     ← a PERSON card
 person       | c1000000-0000-0000-0000-000000000002 | {mobile}     ← a COMPANY card
```

Why it matters, in the wave's own terms. This table's COMMENT promises
"Omission fails closed at the composer, never open" (00592:741-742), and r6 M6-5
added the `channels_allowed` / `channels_forbidden` vocabulary CHECKs on the
argument that *"a value the composer cannot match is not a forbidding, it is a
silent permission"* (00592:748-760). A rule filed under the wrong noun is that
same failure, one level up: the composer resolving a PERSON's rule queries
`(subject_type='person', subject_id=<person id>)` and the composer resolving a
FIRM's rule queries `('company', <firm id>)` — neither query finds a row filed
the other way, so F-27's "NEVER texted" and F-10's "never texted" are simply not
there. It is also the exact hole the wave closed three separate times for its
neighbours: `assert_affiliation_card_kinds()` (r3r2 M-2), `assert_channel_owner_kind()`
(00593), and `assert_studio_contact_designations()` (r5 R-AP) — all argued from
"`studio_contacts` holds BOTH kinds of card and the FK/CHECK each say half of
this and neither says they agree". `studio_contact_rules` is the one self-FK
family left unguarded on the SUBJECT side.

And r6 M6-5's own closing argument applies verbatim: *"W1a ships no writer for
this table, which is exactly why it is cheap to close now, before W1b's rule
editor becomes the thing that has to be trusted."*

**Fix.** Move the `IF NEW.route_to_person_id IS NULL THEN RETURN NEW` early
return down (or split the function) so the subject test runs on every rule, and
add, before the route checks:

```sql
IF NEW.subject_type IN ('person','company') THEN
  SELECT sc.entity_kind INTO v_subject_kind
    FROM public.studio_contacts sc WHERE sc.id = NEW.subject_id;
  IF v_subject_kind IS DISTINCT FROM NEW.subject_type THEN
    RAISE EXCEPTION 'rule_subject_kind_mismatch' USING HINT = '…';
  END IF;
ELSE  -- engagement
  IF NOT EXISTS (SELECT 1 FROM public.project_parties pp WHERE pp.id = NEW.subject_id) THEN
    RAISE EXCEPTION 'rule_subject_not_an_engagement' USING HINT = '…';
  END IF;
END IF;
```

plus a suite block in the shape of block 17 / block 24 (accept the matching
pair, refuse both crossings, on INSERT and on UPDATE).

---

### MINOR — F2. 00593's `sms_capable` backfill is quadratic in `project_parties`, and leg (c) pays it twice per row

**Confidence: high for the measurement; medium for whether it bites on Strata
(I cannot see prod row counts).** `channel_value_was_on_sms_rail()`
(00593:209-229) wraps `project_parties.phone_e164` in
`normalize_channel_value()`, which no index can serve, so each call is a scan of
`project_parties`. Leg (a) (00593:407-424) calls it once per rolodex card; leg
(c) (00593:438-450) calls it **twice per party row** — once for the column and
once again inside the label CASE — where leg (a) hoists the single call into a
`CROSS JOIN LATERAL`.

Measured on this stack, leg (c) verbatim, one studio, N folded seats on N
distinct numbers, `ANALYZE`d, inside a rolled-back transaction:

```
 2 000 seats → INSERT 0 2000   Time:   634.006 ms
 8 000 seats → INSERT 0 8000   Time: 9 372.955 ms
```

4× the rows, ~14.8× the time. Extrapolating the same curve: ~40 k seats ≈ 4 min,
~100 k seats ≈ 25 min — inside `supabase db push`'s migration transaction, on
the first prod push. Leg (a) has the same shape over
`studio_contacts × project_parties`.

**Fix** (no behaviour change): materialise the evidence set once —

```sql
WITH texted AS (
  SELECT DISTINCT c.phone_e164 AS v FROM public.sms_conversations c
  UNION
  SELECT DISTINCT public.normalize_channel_value('mobile', COALESCE(pp.phone_e164, pp.phone))
    FROM public.project_parties pp
   WHERE pp.party_kind IN ('gc','sub','installer','receiver')
     AND COALESCE(pp.sms_consent_status,'not_asked') <> 'not_asked'
)
```

and LEFT JOIN both legs against it, keeping
`channel_value_was_on_sms_rail()` as the single-value predicate the SQL suite
tests (block 15).

---

### MINOR — F3. `studio_contact_org(uuid)` and `project_party_designer(uuid)` are SECURITY DEFINER cross-tenant oracles that every authenticated user may call

**Confidence: high (probed).** Both are `SECURITY DEFINER` and granted EXECUTE
to `authenticated` (00592:73-74, :96-97) — necessarily, since RLS policy
expressions are evaluated with the caller's privileges. But neither checks the
caller. Probed as studio Beta's owner against a studio Alpha card:

```
              q              | rows_visible |          org_oracle_returns
-----------------------------+--------------+--------------------------------------
 stranger sees the card row? |            0 | b2000000-0000-0000-0000-00000000000a
```

The card's row is invisible to this caller and its owning organisation is
returned anyway. `project_party_designer(uuid)` is the same shape for a party's
lead designer. The leak is small (an org / profile uuid, and a card uuid has to
be known first) but it is a card-existence and tenancy oracle, and the wave's
other new helpers are all revoked from `authenticated` entirely.

**Fix, if taken:** wrap the body as
`SELECT organization_id FROM studio_contacts WHERE id = $1 AND (auth.uid() IS NULL OR public.is_active_studio_member(organization_id))`
— the `auth.uid() IS NULL` leg is required, because
`sync_person_affiliation_from_pointer()` (00592:626) calls
`studio_contact_org()` from a definer body that is a member of nothing, and a
naive membership test would make every trigger-time call read as a cross-studio
pointer.

---

### MINOR — F4. `origin_project_id` keeps the *previous* verdict's job, contradicting the rule stated at the line

**Confidence: high (probed).** 00594:1381-1384 says *"The origin follows the
CURRENT verdict, in both writers… R-Q's sentence names the job the verdict on
the books came from, not an older one"* — and the code is
`COALESCE(EXCLUDED.origin_project_id, scc.origin_project_id)` (00594:1384), which
is precisely "take the older one when the new verdict does not name a job".
`pipeline.ts:409` does the same (`t.projectId ?? prior.origin_project_id`).
Probed: record a grant on the "Grant Job", then a project-less refusal —

```
                   q                    |  status   | names_the_job
----------------------------------------+-----------+----------------
 C3 origin after a project-less refusal | opted_out | R3 C Grant Job
```

R-Q's ruled sentence then prints "Opted out by text, 11 Sep 2026, on the R3 C
**Grant** Job" for a refusal that has nothing to do with that job. Either the
comment is wrong (and R-Q should be told the origin is "the last job that named
one"), or the write should be
`CASE WHEN EXCLUDED.status = 'opted_out' THEN EXCLUDED.origin_project_id ELSE COALESCE(…) END`.
This is adjacent to carried m8 (`origin_project_id` is never checked against the
org either).

---

### MINOR — F5. A blank channel value is accepted and stored as the empty string

**Confidence: high (probed).** `normalize_studio_contact_channel()`
(00593:253-256) coalesces the normaliser's NULL to `''` because `value` is NOT
NULL. The NOT NULL then says nothing:

```
NOTICE:  C2: ACCEPTED — blank phone stored as ''
```

A member INSERT of `value = '   '` yields a live `mobile` channel with no
number, which every reader will render as a reach line. W1a ships no writer, so
this is cheap now: add `CHECK (btrim(value) <> '')`, or have the trigger
`RAISE EXCEPTION 'channel_value_required'` instead of writing `''`.

---

### MINOR — F6. The report's legacy-grants figures are stale

**Confidence: high.** §1 says the seed *"gained 210 lines over this wave's base
commit `700261663` ("baseline + 2632 replayed statements")"*. Actual, this
session:

```
$ git diff --numstat 700261663 -- supabase/seed/00-legacy-grants.sql
216     0       supabase/seed/00-legacy-grants.sql
$ python3 scripts/generate-legacy-grants.py
… — baseline + 2633 replayed statements
```

216 / 2633, not 210 / 2632. Same class as R2-M2, two numbers wide. (The file
itself is correct and regenerates with an empty diff; only the report's prose
drifted.)

---

### MINOR — F7. The SQL suite's own header index is still missing five blocks (carried m10, now wider)

**Confidence: high.** The header enumerates 1–21, then jumps to 26, 27, 29, 30.
Blocks **22, 23, 24, 25 and 28** exist and pass and are undescribed — the r6
seat-gate/mirror-dates/route-guard/channel-vocabulary set and r7's R7-M1. A
reader of the header cannot tell those rulings are covered.

---

### MINOR — F8. Report decision 15 names a live shipped writer that does not exist

**Confidence: high.** Decision 15 and 00592:440-442, :556-563 justify the
reverse binding by *"the hooks that still write `company_id`
(`use-studio-contacts.ts:202, :234`)"* and *"a designer who set a person's firm
through the shipped UI"*. The hook surface accepts `companyId`, but no caller
passes it: `grep -rn "companyId" apps/designer-portal/src --include='*.ts*'`
(tests excluded) returns **nothing**, and `add-person-sheet.tsx`'s edit patch
(`:478-501`) never includes it. The binding is a correct defensive move for
W1b; the report presents it as repairing a live path. Worth one sentence, so the
next wave does not assume the legacy write is in production use.

---

### MINOR — F9. `record_channel_reconsent()`'s evidence-only shape is a reinterpretation of a *Kody* ruling, recorded only as an orchestrator decision

**Confidence: medium (judgement, not a defect).** PR-m (rulings §2, STAND,
Kody 2026-09-11) reads: *"The way back is always a fresh recorded consent **or**
an inbound START."* After r7 M7-2 the fresh recorded consent no longer is a way
back: it writes evidence and leaves the record at `opted_out` with
`refusal_unanswered` true, so only the inbound START reopens sending. Report
decision 18 argues the reinterpretation well ("the fresh recorded consent is
what the studio may WRITE; the inbound START is what reopens SENDING") and I
agree with the engineering. But it narrows a ruling Kody signed, and
`rulings.md` §3 records it as R-AG/R-AL-adjacent orchestrator decisions rather
than as an amendment to PR-m. It should be put in front of Kody as an
amendment, the way PR-a and PR-y were.

---

### MINOR — F10. `pnpm db:generate` destroys `database.types.ts` when the CLI fails

**Confidence: high (hit it).** The script is
`supabase gen types typescript --db-url "$SUPABASE_DB_URL" > src/database.types.ts`;
the shell truncates the target before the CLI runs, so any failure (in my case
a sandboxed Docker probe) leaves a zero-byte committed file:

```
 packages/supabase/src/database.types.ts | 37439 ------------------------------
```

Pre-existing and outside this wave's files, recorded because this wave's
verification loop runs that command every round and the damage is silent unless
the operator reads `git diff --stat`. A `> tmp && mv` would fix it.

---

## 3. Checks that came back clean

- Lineage: both redefinitions are the grep-winner body **verbatim plus one
  guard** — greps run and diffs taken in this session (§0). Every other function
  in the three files is new; no prior definition anywhere in `supabase/migrations/`.
- Banner header on each of the three files, naming what it carries, what it
  deliberately does not, its RLS posture, and the legacy-grants regeneration.
- Idempotent: all three files replayed twice over the migrated database,
  exit 0, no ERROR, fold returns 0. Every DDL is `IF NOT EXISTS` /
  `CREATE OR REPLACE` / `ADD COLUMN IF NOT EXISTS`, and every CHECK the
  `CREATE TABLE IF NOT EXISTS` body would skip on a rerun is restated in the
  DROP-and-ADD (or `DO $ck$`) idiom.
- RLS enabled on all four new tables in the same file that creates them, with
  policies in the same file, and the predicates the brief names.
- Grants explicit in both directions on all four tables and on every new
  function; `anon` holds nothing (probed behaviourally).
  `studio_channel_consent` has **no** write policy and **no** write grant for
  `authenticated`, so `record_channel_consent()` is the only portal door by
  privilege.
- `00-legacy-grants.sql` regenerates with an empty diff; `database.types.ts`
  regenerates with an empty diff and is +508/−0 against the wave's base.
- Every SECURITY DEFINER function pins `search_path`; the extension function
  the wave relies on (`gen_random_uuid`) is a pg_catalog builtin here, and no
  `uuid_generate_*` call is made.
- Backfill precedence: `opted_out` over everything inside one org, then most
  recent `granted`, then `pending`, then `not_asked`; per-org isolation proved
  by suite block 3 (Alpha's STOP never reaches Beta). The `refusal` CTE asks the
  whole group, picks by the refusal's own facts, and carries the date and the
  words off the same row; I re-derived the "inert outside the refusal bucket"
  claim by hand and could not break it.
- The fold cannot fail on prod data: its status and source vocabularies are
  `project_parties`' own CHECKs byte for byte, and every uuid it copies already
  carries an FK to the same parent.
- The mirror cannot loop (full trigger inventory above), its release path calls
  `site_request_dispatch_after_consent()` only — read in full from the catalog,
  no `invoke_edge_function`, no `net.*` — and neither `site_requests` nor
  `site_request_dispatch_outbox` carries an outward trigger.
  `patina.suppress_consent_dispatch` is set and cleared around the mirror's own
  UPDATE, and nested AFTER-row triggers fire at the end of that inner statement,
  so the window is exactly the mirror's write; suite block 8 asserts both
  directions.
- The send gate fails closed in every branch of `channelConsentVerdict`,
  `sendPartySms` and `flushDeferredMessages`, read errors and unattributable
  seats included; `refusal_unanswered` is raised by four writers and lowered by
  exactly one.
- No client-portal path can reach anything the wave creates:
  `is_active_studio_member` requires an active non-guest `organization_members`
  row, no policy carries a client branch, and `project_site_access_cards` (PR-w)
  does not exist in this wave.
- `people_directory` is untouched by all three files and still carries its
  twelve columns after the reset; its readers use `select('*')`.
- Vocabulary matches direction §3.8 and crm-model §2 (four documented channel
  omissions, argued at 00593:95-98); `company_kind` is TEXT + CHECK, not an
  enum, per the brief's rule and PD-4. Money is integer (`retainage_bps`); the
  wave adds no money column. No cron. No prod command.
- The R-AR identity guard breaks no shipped writer (the only non-test caller of
  `useUpdateStudioContact` sends a diff-only patch without `entityKind`, and no
  SQL anywhere updates `studio_contacts.entity_kind` or `organization_id`).
- Migration numbers 00592–00594 sit after head 00591, collide with no other ref,
  and were hand-minted.

---

## 4. Recommendation

**Not clean: 1 major, 0 blocking.** Fix F1 (the rule's subject kind, plus a
suite block) and the round is clean. F2 is the only other one with a prod-push
consequence and is a ten-line rewrite of two backfill statements; F6 and F7 are
report/test-header hygiene of the same class as R2-M2. F9 wants a Kody ruling,
not code. The seventeen carried minors plus F3/F4/F5/F8/F10 are the
orchestrator's to filter — F4 and m8 are the same neighbourhood and are cheapest
taken together.
