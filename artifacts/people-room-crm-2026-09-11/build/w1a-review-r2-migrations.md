# W1a — adversarial migration review, round 2 (fresh pass)

Reviewer context: separate from the implementer. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, HEAD `7376cea54`
("fix(consent): a wordless refusal wipes the seat's evidence, and a held card
cannot change what it is (r8 R-AQ/R-AR)"), working tree clean under
`supabase/` and `packages/`.

Read in full before looking at code: `rulings.md` (all sections, §6 program
rulings included), `synthesis/direction.md` §2.2 / §3.8 / §7 / §8,
`synthesis/crm-model.md` §1 / §2 / §4 / §5, `briefing/current-state.md`
§B–§E, `build/inventory.md`, `briefing/fixture.md`, then
`build/w1a-report.md` and all three migrations, the SQL suite, and the two
edited edge-function files.

**Verdict: NOT clean — 2 major, 0 blocking, 17 minor.**

The major that matters is R2-M1: a reachable fold shape destroys the 10DLC
artifact of an inbound STOP on both ledgers. It fails *closed* for sending
(`refusal_unanswered` still stands), so nothing gets texted that should not
be — but the record and every seat lose "by text, 3 Dec 2025, Replied STOP",
which is the noun R-Q's sentence prints and the artifact a carrier audit asks
for. It is the same class of defect as r6 R6-M2, r8 W4-M2 and r8 R8-M1, one
layer further back: those fixed how the refusal's evidence is *carried*; this
is about which sibling seat the fold *picks it from*.

---

## 0. Gates run, with output

### Local stack ownership / prod safety

`apps/designer-portal/.env.local` does not exist in this worktree, so there is
no prod pointer to check:

```
$ ls -la .../apps/designer-portal/.env.local
"…/apps/designer-portal/.env.local": No such file or directory (os error 2)
```

No `supabase db push`, no `supabase functions deploy`, no Strata ref anywhere
in the wave's files:

```
$ grep -rn "db push|functions deploy|bkvcixdmuyejfzcijpdg|supabase link" \
    supabase/migrations/0059[234]*.sql supabase/tests/people/*.sql \
    artifacts/people-room-crm-2026-09-11/build/w1a-report.md
w1a-report.md:4:  … no `supabase db push`, no
w1a-report.md:5:  `supabase functions deploy`.
w1a-report.md:905: - **Not applied to Strata.** No `supabase db push`, no …
```

Only the report's own prose. Nothing executable.

### Reset

```
$ pnpm --dir .../agent-people-build supabase:reset
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

(Environment note, not a finding: the FIRST invocation died after applying
every migration with
`{"_tag":"Error","error":{"code":"LegacyMigrationSeedError","message":"failed to send batch: effect/sql/SqlError: Connection error"}}`
and left the stack mid-replay. The immediate re-run above is clean. The CLI
also needs the sandbox disabled — it writes `~/.supabase/telemetry.json`.)

### SQL suite — 30 blocks, all pass

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
…
NOTICE:  26. no studio-side verdict lowers refusal_unanswered (r7 M7-1): passed
NOTICE:  27. reconsent is evidence-only and re-callable (r7 M7-2), leaves the
         refusal's own evidence standing (r8 W4-M2), the seat carries the
         refusal's own words too (r9 R5-M1), and a sourceless refusal is never
         given the studio's consent as its words (r6 R6-M1) — nor left standing
         on the sibling seat (r8 R8-M1): passed
NOTICE:  28. a studio-recorded refusal never speaks for a texted one, and the
         refusal keeps the date it arrived (r7 R7-M1): passed
NOTICE:  29. a held card cannot change what it is or whose it is (r8 R8-M2, R-AR): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

30 blocks (1–29 plus 16B), not the 28 the report claims — see R2-M2.

### Deno — the two suites the migrations' invariants rest on

```
$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 71 passed | 0 failed (93ms)
```

### Idempotent re-run — clean

Each migration replayed against the already-migrated database:

```
$ for f in 00592_… 00593_… 00594_…; do psql … -v ON_ERROR_STOP=1 -f supabase/migrations/$f.sql; done
=== 00592 === NOTICE: relation "studio_person_affiliations" already exists, skipping … exit=0
=== 00593 === NOTICE: relation "studio_contact_channels" already exists, skipping … exit=0
=== 00594 === NOTICE: relation "idx_studio_channel_consent_value" already exists, skipping
              backfill_channel_consent_from_parties
              -------------------------------------
                                                  0
              exit=0
```

Every CHECK/constraint is stated in the `DROP CONSTRAINT IF EXISTS` / `ADD`
idiom or a `DO $ck$` guard, so a rerun really does re-assert (and could widen)
them rather than skipping the inline versions — 00592:130-144, :384-388,
:766-786; 00593:99-119; 00594:209-233.

### Legacy grants + generated types regenerate identically

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2633 replayed statements
$ git diff --stat -- supabase/seed/00-legacy-grants.sql
(empty)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate
$ git diff --stat -- packages/supabase/src/database.types.ts
(empty)
```

### Lineage — both redefined bodies ARE the grep-winner, verbatim + one guard

I ran the grep myself, then diffed:

```
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*fc_dispatch_optin_invite" supabase/migrations/*.sql | sort | tail -3
00284_field_dispatch_wiring.sql
00432_twilio_activation_hardening.sql      ← winner (00594 excluded)
00594_studio_channel_consent.sql

$ diff -u <00432 body> <00594 body>
+  -- 00594: the mirror is maintaining the cached copy …
+  IF COALESCE(current_setting('patina.suppress_consent_dispatch', true), '') = '1' THEN
+    RETURN NEW;
+  END IF;
+
   IF NEW.sms_consent_status <> 'pending' OR NEW.phone_e164 IS NULL THEN
```

```
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*_site_request_consent_granted_dispatch" supabase/migrations/*.sql | sort | tail -3
00374_field_site_request_loop.sql          ← winner
00594_studio_channel_consent.sql

$ diff -u <00374 body> <00594 body>
+  -- 00594: … Mirroring a verdict is not asking for one,
+  -- and it is not the moment a trade learns there is work waiting.
+  IF COALESCE(current_setting('patina.suppress_consent_dispatch', true), '') = '1' THEN
+    RETURN NEW;
+  END IF;
+
   IF NEW.sms_consent_status <> 'granted'
```

Both grafts are the winner body byte-for-byte with exactly one first-statement
guard added. No other function in the wave redefines anything that existed
before it (`CREATE OR REPLACE FUNCTION` inventory of 00594: backfill,
fc_dispatch_optin_invite, _site_request_consent_granted_dispatch, mirror,
record_channel_consent, record_channel_reconsent — the last four are new names).

### Numbering

Head on `origin/main` is `00591`; the wave mints 00592–00594. Scanned every
local and remote ref:

```
refs/heads/build/people-room-crm-2026-09-11         :: 00592 00593 00594
refs/heads/hour-tracking/integration                :: 00595 00596 00597
refs/heads/hour-tracking/server                     :: 00595 … 00599
refs/remotes/origin/… (same three)
```

No collision. Numbers stay provisional until merge (patina-parallel-work).

### Objects, RLS, policies, grants

```
          relname           | rls | policies
----------------------------+-----+----------
 studio_channel_consent     | t   |        1
 studio_contact_channels    | t   |        4
 studio_contact_rules       | t   |        4
 studio_person_affiliations | t   |        4

         table_name         |    grantee    |                          privs
----------------------------+---------------+---------------------------------------------------------
 studio_channel_consent     | authenticated | SELECT
 studio_channel_consent     | service_role  | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
 studio_contact_channels    | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_contact_rules       | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_person_affiliations | authenticated | DELETE,INSERT,SELECT,UPDATE
```

`anon` holds nothing on any of the four. Predicates match direction §7 and the
brief's rule set:

- `studio_person_affiliations` / `studio_contact_channels` —
  `is_active_studio_member(studio_contact_org(<card>))` (00592:334, 00593:342).
- `studio_contact_rules` — card legs `is_active_studio_member(studio_contact_org(subject_id))`,
  engagement leg `is_studio_comember(project_party_designer(subject_id))`,
  matching `project_parties`' own posture (00592:914-919).
- `studio_channel_consent` — `is_active_studio_member(organization_id)`, SELECT
  only, no write policy and no write grant (00594:301-309).

`is_active_studio_member(NULL)` and `is_studio_comember(NULL)` both return
`f`, so a rule or channel pointing at a card that does not exist reads as "not
yours", not as "everyone's".

Probed behaviourally (`SET LOCAL ROLE` + `request.jwt.claims`):

```
--- as the STUDIO OWNER ---      ch | ru | co | af
                                  1 |  1 |  1 |  0
--- as a NON-MEMBER (client-portal user) ---
                                  0 |  0 |  0 |  0
NOTICE:  consent INSERT refused: 42501
NOTICE:  channel INSERT refused: 42501
--- as anon ---
NOTICE:  anon SELECT consent refused: 42501
NOTICE:  anon SELECT channels refused: 42501
```

PR-w's site access card (`project_site_access_cards`) is out of W1a by
instruction and does not exist yet — nothing in this wave creates a
client-readable path to anything, and no policy in the three files carries a
client branch.

### SECURITY DEFINER + pinned search_path — all 19

```
                proname                 | prosecdef |            proconfig            | anon_x | auth_x | svc_x
----------------------------------------+-----------+---------------------------------+--------+--------+-------
 _site_request_consent_granted_dispatch | t         | {search_path=public}            | f      | f      | t
 _sync_person_company_pointer           | t         | {search_path=public}            | f      | f      | t
 assert_affiliation_card_kinds          | t         | {search_path=public}            | f      | f      | t
 assert_channel_owner_kind              | t         | {search_path=public}            | f      | f      | t
 assert_studio_contact_designations     | t         | {search_path=public}            | f      | f      | t
 assert_studio_contact_identity_stable  | t         | {search_path=public}            | f      | f      | t
 assert_studio_contact_rule_route       | t         | {search_path=public}            | f      | f      | t
 backfill_channel_consent_from_parties  | t         | {search_path=public}            | f      | f      | t
 channel_value_was_on_sms_rail          | f         | {search_path=public}            | f      | f      | t
 fc_dispatch_optin_invite               | t         | {search_path=public}            | f      | t      | t
 mirror_channel_consent_to_parties      | t         | {search_path=public}            | f      | t      | t
 normalize_channel_value                | f         | {search_path=public}            | f      | t      | t
 normalize_studio_contact_channel       | f         | {"search_path=public, pg_temp"} | f      | t      | t
 project_party_designer                 | t         | {search_path=public}            | f      | t      | t
 record_channel_consent                 | t         | {search_path=public}            | f      | t      | t
 record_channel_reconsent               | t         | {search_path=public}            | f      | t      | t
 studio_contact_org                     | t         | {search_path=public}            | f      | t      | t
 sync_person_affiliation_from_pointer   | t         | {search_path=public}            | f      | f      | t
 sync_studio_contact_company_pointer    | t         | {search_path=public}            | f      | f      | t
(19 rows)
```

Nineteen, not the eighteen §3 prints (R2-M2). Every definer pins
`search_path`; `anon` holds EXECUTE on none. `normalize_channel_value` is
declared `IMMUTABLE` and its only callee, `normalize_phone_e164`, really is
`IMMUTABLE` (`provolatile = i`) — the declaration is honest.

### The mirror cannot loop, and its release path is durable-only

```
=== functions that write studio_channel_consent ===
backfill_channel_consent_from_parties
record_channel_consent
record_channel_reconsent

=== triggers on studio_channel_consent ===
set_updated_at_studio_channel_consent -> update_updated_at_column
mirror_channel_consent_to_parties_trg -> mirror_channel_consent_to_parties

=== triggers on project_parties ===
 fc_optin_invite_dispatch              | fc_dispatch_optin_invite               | AFTER  ← guarded
 normalize_phone_project_parties       | normalize_party_phone_e164             | BEFORE
 set_updated_at_project_parties        | update_updated_at_column               | BEFORE
 site_request_consent_granted_dispatch | _site_request_consent_granted_dispatch | AFTER  ← guarded
```

The mirror writes `project_parties` only; nothing on `project_parties` writes
back to `studio_channel_consent`. Termination is structural, not timed.
`site_request_dispatch_after_consent()` (read in full from `pg_get_functiondef`)
writes `site_requests` + `site_request_dispatch_outbox` and calls no
`invoke_edge_function`; neither of those tables carries an outward trigger
(only `update_updated_at_column` and `_site_request_validate_request`). The
mirror's narrow release really is durable-in-transaction.

Both affiliation triggers terminate too: `sync_person_affiliation_from_pointer`
holds `patina.suppress_affiliation_sync` around its affiliation write, and its
one unsuppressed re-derive re-enters the function only to hit the
`v_open IS NOT DISTINCT FROM NEW.company_id` early return (00592:601-603).

### Send gate

`channelConsentVerdict` (sms.ts:440-511) fails closed in every branch I could
find: unresolvable studio → `refuse`; record read error → `refuse`;
`status = 'opted_out'` → `refuse`; `refusal_unanswered = true` → `refuse`
whatever the status says; a seat refusal in the same studio → `refuse`; no
record → studio-scoped seat scan, `refuse` on a hit; no studio at all →
phone-global reduction, `refuse` on any opted-out row.
`orgHasOptedOutParty` returns `true` on a read error and on an unattributable
seat (sms.ts:362-376). `sendPartySms` (`:762-786`) and
`flushDeferredMessages` (`:1048-1115`) run the same two gates in the same
order, and the flush's second gate is narrowed to the deferred row's own party
exactly as `resolveRecipient`'s `partyId` branch is. `refusal_unanswered` is
raised by the fold, by `record_channel_consent`'s `opted_out` branch, by
`record_channel_reconsent`, and by the inbound STOP rail, and lowered by the
one write in `pipeline.ts:378` — I could not construct a studio-side path that
lowers it.

### Vocabulary, money, crons, prod

- Every new vocabulary is TEXT + CHECK, no enum, no `ADD VALUE`:
  `company_kind` (15 values, crm-model §2 verbatim + `inspector`/`other`),
  `channel_kind` (7), channel `status` (4), consent `status` (4),
  consent `source` / `opt_out_source` (5 each), rule `subject_type` (3),
  `channels_allowed` / `channels_forbidden` `<@` the 7-name channel list.
  Consent's four statuses map 1:1 onto direction §3.8's consent word family
  (Texting / Invited / Opted out / Not asked). Stage, the other §3.8 family,
  belongs to `project_parties` and is out of W1a by instruction.
- Money: `retainage_bps` is an integer basis-point count. No float anywhere in
  the three files; no `*_cents` column is minted here.
- No `pg_cron` job is scheduled or unscheduled by this wave.
- `gen_random_uuid()` is pgcrypto-in-core on PG17 and is what the rest of the
  repo uses; no `uuid_generate_v5`-style extension call needs qualifying.

---

## 1. Prior findings — re-checked

The brief names `w1a-fix-log-r1.md`. All eight of its findings remain fixed:

| r1 | Claim | Now |
|---|---|---|
| B1 | one recorded `pending` became N real opt-in SMS | **fixed** — `patina.suppress_consent_dispatch` read by both outward triggers (00594:525-527, :589-594); SQL block 8 |
| M1 | the documented post-push backfill re-run reintroduced B1 | **fixed** — block 6e/6f; my own re-run of 00594 folded 0 and sent nothing |
| M2 | `channel_kind` omitted `ap_email` / `portal_311` | **fixed** — 00593:103-107 |
| M3 | `company_kind` narrower than the model and the shipped UI | **fixed** — 00592:134-143 |
| M4 | channel `status` CHECK had no `bounced` | **fixed** — 00593:117-119 |
| M5 | the consent gate could refuse but never authorise | **fixed** — `ChannelConsentVerdict` returns `"allow"` (sms.ts:511) |
| M6 | `grantAllForPhone` defeated the per-studio scoping | **fixed** — `grantPartiesForStudios` (pipeline.ts:456) |
| M7 | the rail and the SQL side resolved the org differently | **fixed** — shared `orgsOfProjects` / `resolveProjectOrg` (sms.ts:276-341) |

I also re-checked the four minors the immediately prior round (r8) raised,
because they are the ones most likely to have been carried:

| r8 | Claim | Now |
|---|---|---|
| R8-m1 | the fold writes the REFUSAL's source and words into the record's CONSENT evidence set | **still open** — see m1 below, with probe output |
| R8-m2 | two writers, two rules for `opt_out_at` on a repeat refusal | **still open** — see m2 |
| R8-m3 | `email` refusals are a permanent dead end and the file does not say so | **still open** — see m3 |
| R8-m4 | the report does not contain this wave's most recent fix | **still open, and wider** — see R2-M2 |

I did not re-enumerate the "twenty-seven minors carried open from r6 and r7"
one by one; the ones I happened to re-derive independently are listed in §2.

---

## 2. Findings

### MAJOR — R2-M1. The fold picks the refusing sibling by *most recently touched*, so a dateless portal refusal erases the real STOP's date and words — on the record, and then off the seat that carried them

**Confidence: high (probed, reproduced on a clean stack).**

`backfill_channel_consent_from_parties()`'s `refusal` CTE ranks the refusing
seats with

```sql
-- 00594:401-405
ROW_NUMBER() OVER (
  PARTITION BY org, phone_e164
  ORDER BY COALESCE(sms_opt_out_at, sms_consent_recorded_at, updated_at) DESC NULLS LAST
) AS rrn
```

`updated_at` is a row-maintenance timestamp, not a refusal date. The shipped
portal writes `opted_out` party rows with a NULL `sms_opt_out_at`, a NULL
`sms_consent_source` and a NULL `sms_consent_evidence` **on purpose**
(`use-coordination.ts` — "opted out, date unknown" is the truth), and the file
says so five times. Such a row is touched whenever anything on the roster
changes, so its `updated_at` routinely outranks the 2025 `sms_opt_out_at` of
the seat that actually received the STOP. `ranked`'s own tiebreak
(00594:355-356) has the identical shape, so the winning row is chosen the same
way.

The consequence chain, all inside one org on one number:

1. `opt_out_at` is `COALESCE(r.sms_opt_out_at, f.sms_opt_out_at)` (00594:428).
   Both come off the dateless row ⇒ **NULL**.
2. `opt_out_source` / `opt_out_evidence` / `opt_out_recorded_at` /
   `opt_out_recorded_by` come off `f` (00594:447-448) ⇒ **all NULL**. R-Q's
   "Opted out **by text**, 3 Dec 2025" has nothing left to print, and the
   carrier-audit artifact is gone from the record permanently
   (`ON CONFLICT DO NOTHING` means no later fold repairs it, and
   `record_channel_reconsent()` may not touch `opt_out_*` by design).
3. Because `NEW.opt_out_source IS NULL`, the mirror takes R-AQ's *wordless
   refusal* branch (00594:754) and writes NULL over
   `sms_consent_source` / `sms_consent_evidence` / `sms_consent_recorded_at` /
   `sms_consent_recorded_by` on **every** seat in the studio on that number
   (00594:810-818) — including the seat that was holding
   `inbound_sms` / "Replied STOP". R-AQ's premise, "a NULL here means there
   were never any refusal words", is false for exactly this population: the
   words existed, on the sibling the `refusal` CTE discarded.

Probe (`/tmp/claude/probe_r2_fold.sql`, one org, one project, two seats on
`+16125550333`: the real dated inbound STOP, and the portal's dateless
sourceless refusal):

```
 folded
--------
      1

--- the record the fold minted ---
  status   | opt_out_at | refusal_unanswered | opt_out_source | opt_out_evidence | opt_out_recorded_at
-----------+------------+--------------------+----------------+------------------+---------------------
 opted_out |            | t                  |                |                  |

--- seats (the mirror has already run) ---
                  id                  | sms_consent_status |     sms_opt_out_at     | sms_consent_source | sms_consent_evidence
--------------------------------------+--------------------+------------------------+--------------------+----------------------
 …0008 (the dateless portal refusal)  | opted_out          |                        |                    |
 …0009 (the REAL inbound STOP)        | opted_out          | 2025-12-03 00:00:00+00 |                    |
```

Seat `…0009` went in holding `inbound_sms` / "Replied STOP on the Lindqvist
thread" / `2025-12-03`. It came out holding nothing.

Counterfactual, same script with the dateless sibling removed
(`/tmp/claude/probe_r2_fold_single.sql`):

```
  status   |       opt_out_at       | refusal_unanswered | opt_out_source |           opt_out_evidence
-----------+------------------------+--------------------+----------------+--------------------------------------
 opted_out | 2025-12-03 00:00:00+00 | t                  | inbound_sms    | Replied STOP on the Lindqvist thread
```

So the sibling is the whole cause.

**When it fires.** On the first prod push the migration's own
`SELECT backfill_channel_consent_from_parties()` (00594:483) runs *before* the
mirror trigger is created, so step 3 is deferred — but step 1/2 (the record
minted without the refusal's date or words) happens immediately and is
permanent. Step 3 then fires on the first later write to that record: the
maintenance re-run report §5 explicitly instructs
("`backfill_channel_consent_from_parties()` can then be re-run afterwards as
`service_role` without overwriting anything"), a `record_channel_consent`
re-record of the refusal, or a `record_channel_reconsent()` call — the exact
door the `channel_opted_out` HINT sends a studio through.

**Not a send-safety bug.** `refusal_unanswered` is `t` throughout, so
`channelConsentVerdict` still refuses. This is evidence destruction, which is
what W4-M2, R5-M1 and R8-M1 were each raised as major for.

**Fix shape (not prescriptive).** Rank the `refusal` CTE (and `ranked`'s
tiebreak) on the refusal's *own* facts before falling back to row age — e.g.
`ORDER BY (sms_opt_out_at IS NOT NULL) DESC, (sms_consent_source IS NOT NULL) DESC,
COALESCE(sms_opt_out_at, sms_consent_recorded_at, updated_at) DESC NULLS LAST`
— so a refusal that carries a date and words outranks one that carries
neither. Alternatively compute `opt_out_at` and the four `opt_out_*` columns
independently (`max(sms_opt_out_at)`, and the source/words from the row that
has them) rather than from one chosen sibling. Either way the SQL suite wants a
block for "two refusals, one dateless: the record and the seats keep the
STOP's own date and words".

---

### MAJOR — R2-M2. The report is a round and a half behind the branch: an entire shipped trigger, two rulings and three probe counts are missing from it

**Confidence: high (mechanical; the report is in the tree and the DB is in front of me).**

`build/w1a-report.md` is the hand-off artifact — §5 is the pre-push runbook the
deploy chain reads, and §1 is the object inventory a reviewer or a later wave
trusts. It does not describe the branch it sits on. HEAD is `7376cea54`
("r8 R-AQ/R-AR"); the report stops at r9 R5-M1.

Specifically:

- **A whole shipped object is absent.** `public.assert_studio_contact_identity_stable()`
  and its `assert_studio_contact_identity_stable_trg` BEFORE UPDATE trigger on
  `studio_contacts` (00593:502-583) appear nowhere in the report: not in §1's
  per-file table (`w1a-report.md:16`, the 00593 row), not in the "grep for each
  new name returned nothing" list (`:33-39`), not in §2's decisions, not in §3's
  trigger probe. This is the one object in the wave most likely to surprise an
  existing writer — it refuses an `entity_kind` / `organization_id` change with
  a bespoke `studio_contact_identity_held` exception whenever any channel,
  designation, rule route or affiliation points at the card, and after 00593's
  backfill essentially every card with a phone or an email is held.
- **Two rulings' decisions are absent.** R-AQ (a wordless refusal wipes the
  seat's evidence) and R-AR (a held card cannot change what it is) are in
  `rulings.md` §3 and in the code; §2 of the report ends at decision 22.
- **§3's probes are stale in three places.** `:549` prints "(18 rows)" for the
  SECURITY DEFINER table — the database has 19. `:620-626` lists four triggers
  on `studio_contacts` — there are five. `:688` says "**28 blocks** (1–27 plus
  16B)" — the suite emits 30 (1–29 plus 16B), and the transcript at `:651-686`
  stops at block 27 while blocks 28 and 29 exist and pass.
- The §3 preamble claims the section "was re-taken after the r9 (R5-M1) round",
  which is true and is precisely the problem: two rounds of work landed after
  the last re-take and the discipline did not hold.

The prior round raised the same thing as R8-m4 and it recurred within one
round, which is why I am filing it a step higher. The report is not a
side-artifact here — §5 carries the pre-push fold dry-run instruction, and
R2-M1 above changes what that dry run has to show.

---

### MINOR findings

**m1 (minor, confidence high) — the fold writes the REFUSAL's source and words into the record's CONSENT evidence set.** `00594:444-446` takes
`source` / `evidence` / `recorded_at` / `disclosure_version` / `recorded_by`
from the *winning* row with no branch on its status, so when the winner is the
`opted_out` seat the record claims the studio's consent evidence is the STOP:

```
  status   |   source    |               evidence               |      recorded_at       | disclosure_version
-----------+-------------+--------------------------------------+------------------------+--------------------
 opted_out | inbound_sms | Replied STOP on the Lindqvist thread | 2025-12-03 00:00:00+00 | field-sms-v1
```

R-Q's consent half prints the refusal's words until a `record_channel_reconsent()`
overwrites them. Carried open from r8 (R8-m1).

**m2 (minor, confidence high) — two writers, two rules for `opt_out_at` on a repeat refusal.** The rail stamps `now` on every STOP
(`pipeline.ts:370`), walking "opted out 3 Dec 2025" forward to today on a
second STOP; `record_channel_consent` deliberately keeps the earliest
(`LEAST`, 00594:1264-1266) for exactly the reason r7 R7-M1 gives. One of the
two rules is wrong. Carried open from r8 (R8-m2).

**m3 (minor, confidence high) — an `email` refusal is a permanent dead end and no comment says so.** `record_channel_consent` accepts
`channel_kind = 'email'` and sets `refusal_unanswered` on an `opted_out`
(00594:1236); the only writer that lowers the flag is the SMS inbound rail
(`pipeline.ts:378`). So an email opt-out can never be answered: every later
verdict is refused with `consent_awaiting_recipient`, and
`record_channel_reconsent()` leaves the record at `opted_out` by design. The
`refusal_unanswered` comment (00594:267-285) describes the SMS lifecycle as if
it were the only one. Carried open from r8 (R8-m3).

**m4 (minor, confidence high — probed) — for a person with two open affiliations, the pointer silently reverts the designer's firm pick on the next affiliation write.** `sync_person_affiliation_from_pointer`'s ELSE branch
(00592:641-655) opens the named affiliation `ON CONFLICT DO NOTHING`, so when
that affiliation is already open nothing at all changes — and
`_sync_person_company_pointer` (00592:485-490) then re-derives the pointer to
the *most recently begun* open affiliation on the next affiliation write:

```
--- pointer after the two affiliations (expect Firm B) ---   Firm B (new)
--- pointer right after the designer saves Firm A ---        Firm A (old)
--- pointer after an UNRELATED affiliation write ---         Firm B (new)
```

Arguably inside R-AO ("the pointer holds one — the most recently begun"), but
it is a designer's saved value silently changing with no act, on the column the
person card's firm line still reads. R-AI's reverse binding closes this for the
single-affiliation case and not for R-AO's own two-firm case.

**m5 (minor, confidence high) — `reach_preference` is neither shipped nor named as out of scope.** direction §7 lists it on the `studio_contacts` (person)
row and crm-model §2 gives it a type; it exists nowhere in the migrations or
in `packages/supabase` (`grep -rn reach_preference` → nothing). Report §2
decision 1 explains the four *rule* columns that were deliberately withheld
(`never_text`, `do_not_contact`, `do_not_contact_reason`, `route_to_person_id`)
and report §5's out-of-scope list does not mention `reach_preference`, so a
later wave cannot tell whether it was ruled away or dropped.

**m6 (minor, confidence medium) — `escalation_by_class` is unchecked jsonb while the channel arrays beside it were CHECKed for the same reason.** r6 M6-5
added a vocabulary CHECK to `channels_allowed` / `channels_forbidden`
(00592:766-786) on the argument that "a value the composer cannot match is not
a forbidding, it is a silent permission". `escalation_by_class`
(00592:728) maps decision_class → channel_kind and carries the same hazard for
F-05's "a phone call over $2,500", with no constraint and no comment.

**m7 (minor, confidence medium-high) — `studio_contact_rules.subject_id` has no FK and no cleanup, so a deleted subject strands the rule permanently invisible.** The column is polymorphic by design (00592:718-719), but
`studio_contacts` and `project_parties` are both deletable —
`project_parties` REMOVE is a hard delete today (current-state G-10) — and once
the subject is gone `studio_contact_org(subject_id)` / `project_party_designer(subject_id)`
return NULL, so every policy leg (00592:910-958) evaluates false: no member can
see the row, and no member can delete it. Latent while W1a ships no writer;
W1b's rule editor makes it real.

**m8 (minor, confidence high) — `origin_project_id` is never checked against the org.** Both RPCs write `p_origin_project_id` straight through
(00594:1246, :1568) with only an FK to `projects`. A studio member can store
another studio's project id on their own consent record; R-Q's sentence then
names a project the reader's RLS will not resolve.

**m9 (minor, confidence high) — the account-holder SMS rail still does not read this table, and §5 does not name it.** `sms-dispatch/index.ts:105-142`
sends on `profiles.sms_opt_in` + `notification_preferences.channels_sms` with
no `studio_channel_consent` read, and the inbound rail never touches
`profiles.sms_opt_in` (`grep sms_opt_in pipeline.ts` → one PostHog event, no
write). So a homeowner or studio member who replies STOP is refused on the
field rail and still textable on the account rail. Pre-existing
(current-state §D), but the wave declares "one consent record per studio per
channel value" and report §5's "Not done" list does not name the second rail.

**m10 (minor, confidence high) — the SQL suite's own header index is stale.** The
header of `supabase/tests/people/w1a_identity_channels_consent_test.sql`
enumerates blocks 1–21, then jumps to 26, 27 and 29; blocks 22–25 and 28 exist
and pass but are undescribed. Same class as R2-M2, in the test file.

**m11 (minor, confidence medium) — `tax_id_last4 char(4)` blank-pads and `retainage_bps` has no range.** `char(4)` (00592:117) stores `'12'` as `'12  '`;
`text` + a `length = 4` CHECK would say what is meant. `retainage_bps`
(00592:119) accepts negative values and values above 10000 — the comment says
"1000 = 10%" and nothing enforces the domain.

**m12 (minor, confidence medium) — the affiliation SELECT policy gates on the person's org only.** 00592:331-334 checks
`is_active_studio_member(studio_contact_org(person_id))`; the INSERT/UPDATE
`WITH CHECK` additionally pins both cards to one studio (`:343-346`), but
`service_role` (and the 00592 backfill's own predicate, which is the reason the
straddle case is discussed at all) can write rows the SELECT leg will then show
to the person's studio while `company_id` belongs to another. Cheap to make the
SELECT leg symmetric.

**m13 (minor, confidence medium) — `preferred` has no "one per kind" constraint.** crm-model §2 says "one preferred channel per kind";
`studio_contact_channels.preferred` (00593:77) is a bare boolean with no
partial unique index on `(owner_id, channel_kind) WHERE preferred`.

**m14 (minor, confidence high, acknowledged in-file) — the seat gate's INSERT branch still has a read-then-write window.** The upsert's `DO UPDATE … WHERE`
legs (00594:1342-1362) close the race only for the conflict branch; the pure
INSERT path is guarded by the 2a read at `:1139-1164`, and the file says so at
`:1347-1349`. A concurrent seat refusal landing between that read and the
INSERT still mints a `granted` first record.

**m15 (minor, confidence high) — two functions are REVOKEd from `PUBLIC, anon` only, unlike the other guards.** `mirror_channel_consent_to_parties`
(00594:898) and `normalize_studio_contact_channel` (00593:261) leave
`authenticated` holding EXECUTE (confirmed `auth_x = t` in the probe above).
Harmless — both are trigger functions and a direct call raises — but every
other new guard in the wave revokes `authenticated` explicitly, and the report
§3 note explains this away as the legacy-grants baseline when the migrations
themselves simply do not revoke it.

**m16 (minor, confidence medium) — `_primary_studio_for()` is called per row in four correlated predicates over all of `project_parties`.** 00594:340
(the fold), :770 and :822 (the mirror's capture and its UPDATE) and :1146 /
:1361 / :1390 (the seat gate). On Strata every consent write scans
`project_parties ⋈ projects` and calls a SECURITY DEFINER function for each row
whose `studio_id` is NULL. Correct, but the mirror runs on every inbound STOP
and every recorded verdict.

**m17 (minor, confidence low-medium) — `role_at_firm` and `trades` are unconstrained while the model gives both closed vocabularies.** 00592:278 and
:115. Defensible under PD-4 (the same posture `contact_kind` keeps), but r6
M6-5 CHECKed the rule's channel arrays against a code-resident vocabulary for
the fail-open reason, and neither column carries a comment saying why it is
treated differently.

---

## 3. Checks that came back clean

- Lineage: both redefinitions grafted from the grep-winner body, verbatim plus
  one guard; greps run in this session and diffed (§0).
- RLS present on all four new tables, with the predicates the brief names, and
  probed behaviourally as owner / non-member / anon.
- Grants explicit in both directions on all four tables and every new function;
  `anon` holds nothing; `studio_channel_consent` has no write policy and no
  write grant, so `record_channel_consent` is the only portal door *by
  privilege*.
- `00-legacy-grants.sql` regenerates with an empty diff; `database.types.ts`
  regenerates with an empty diff.
- Every SECURITY DEFINER function pins `search_path`.
- Idempotent rerun of all three files against a migrated database: exit 0, only
  "already exists, skipping" notices, fold returns 0.
- Backfill precedence: `opted_out` over everything inside one org, then most
  recent `granted`, then `pending`, then `not_asked`; per-org isolation proved
  by suite block 3 (Alpha's STOP never reaches Beta) — the *refusal* half of
  the fold is where R2-M1 lives, not the precedence half.
- The mirror cannot loop (three writers, one trigger, no write-back path) and
  its release path calls `site_request_dispatch_after_consent()` only — read in
  full, no `invoke_edge_function`, and neither `site_requests` nor
  `site_request_dispatch_outbox` carries an outward trigger.
- The send gate fails closed in every branch of `channelConsentVerdict`,
  `sendPartySms` and `flushDeferredMessages`, including read errors and
  unattributable seats; `refusal_unanswered` is lowered by exactly one writer.
- No client-portal path can reach anything this wave creates (probe above);
  `project_site_access_cards` (PR-w) is out of W1a and does not exist.
- `people_directory` is untouched by all three files
  (`grep people_directory` on them → nothing) and still carries its twelve
  columns after the reset: `person_id, role, display_name, email, phone,
  profile_id, project_id, designer_id, status_raw, last_touch_at, meta, scope`.
- Vocabulary matches direction §3.8's consent family and crm-model §2's channel
  and company-kind lists (the four documented omissions from §2's channel list
  — `app`, `account`, `field_link`, `paper` — are reach tiers, argued at
  00593:95-98). No enum, no `ADD VALUE`. Money as integers. No cron. No prod
  command anywhere.
- The R-AR identity guard does not break a shipped writer: the edit sheet sends
  a diff-only patch that never includes `entity_kind`
  (`add-person-sheet.tsx:503-513`), and no migration in the repo updates
  `studio_contacts.organization_id` or `entity_kind`.

---

## 4. Recommendation

**Not clean.** Fix R2-M1 (the fold's refusal picker, plus a suite block for the
two-refusal shape) and R2-M2 (bring §1/§2/§3 and §5's dry-run note up to HEAD).
The seventeen minors are the orchestrator's to filter; m1, m2 and m3 are
carried from r8 and are all in the same neighbourhood as R2-M1, so they are
cheapest to take in the same pass.
