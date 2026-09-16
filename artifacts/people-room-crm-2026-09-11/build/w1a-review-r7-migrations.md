# W1a — adversarial migration review, round 7 (second cycle)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`. Local Supabase only — no
`supabase db push`, no `supabase functions deploy`, no Strata contact. No
portal env in this worktree points anywhere:

```
$ ls /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build/apps/*/.env.local
(eval):1: no matches found: .../apps/*/.env.local
```

Scope read in full: `w1a-report.md`; `supabase/migrations/00592_people_cards_affiliations_rules.sql`,
`00593_studio_contact_channels.sql`, `00594_studio_channel_consent.sql`;
`supabase/functions/_shared/sms.ts`, `supabase/functions/sms-inbound/pipeline.ts`;
`supabase/tests/people/w1a_identity_channels_consent_test.sql`; the grep-winner
bodies in `00432` and `00374`; `rulings.md` (all sections), `direction.md`
§2.2/§3.8/§7/§8, `crm-model.md` §1/§2/§4/§5, `current-state.md` §B–§E,
`build/inventory.md`, `briefing/fixture.md`, and `w1a-fix-log-r6.md`.

**Verdict: NOT clean — 3 major, 0 blocking, 14 minor.**

---

## 1. What I ran

### 1.1 Reset — full replay + seeds

```
$ pnpm --dir <worktree> supabase:reset
...
Applying migration 00591_notification_log_delivery.sql...
Applying migration 00592_people_cards_affiliations_rules.sql...
Applying migration 00593_studio_contact_channels.sql...
Applying migration 00594_studio_channel_consent.sql...
Applying migration 20260910152111_create_contact_messages.sql...
Seeding data from supabase/seed/00-legacy-grants.sql...
[...29 seed files...]
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```

### 1.2 SQL suite — all blocks pass

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
...
NOTICE:  30e. a grant's paperwork is never filed as the refusal's own words, and the wordless refusal reaches both seats (r4 R4-M1): passed
NOTICE:  31. a rule is filed under the noun its subject actually is (r8 F1): passed
NOTICE:  32. a recorded refusal never speaks for the grant it stands beside (r6 R6-M1): passed
NOTICE:  33. a blank evidence field cannot empty the evidence set (r6 R6-M2): passed
NOTICE:  34. an email refusal is recoverable by a fresh recorded consent and an SMS one is not (r6 R6-M3): passed
NOTICE:  All W1a assertions passed.
ROLLBACK

$ ... | grep -c "NOTICE:"
36
```

36 NOTICE lines, not the 30 `w1a-report.md` §3 still claims — see **R7-m1**.

### 1.3 Deno suites

```
$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 71 passed | 0 failed (109ms)
```

### 1.4 Idempotent rerun — my own, not the branch's `rerun.sql`

All three files `\i`'d again, in order, inside one rolled-back transaction
against the freshly reset stack:

```
$ psql ... -v ON_ERROR_STOP=1 <<'EOF'
BEGIN;
\i supabase/migrations/00592_people_cards_affiliations_rules.sql
\i supabase/migrations/00593_studio_contact_channels.sql
\i supabase/migrations/00594_studio_channel_consent.sql
SELECT count(*) AS consent_rows FROM public.studio_channel_consent;
SELECT count(*) AS channel_rows FROM public.studio_contact_channels;
ROLLBACK;
EOF
--- all three re-executed ---
 consent_rows | 0
 channel_rows | 0
ROLLBACK
```

Clean. Every object is `IF NOT EXISTS` / `CREATE OR REPLACE` / `ADD COLUMN IF
NOT EXISTS` / `DROP CONSTRAINT IF EXISTS` + `ADD`, every trigger `DROP TRIGGER
IF EXISTS` + `CREATE`, both backfills `ON CONFLICT … DO NOTHING`. The rerun's
`SELECT public.backfill_channel_consent_from_parties()` executes with the mirror
trigger already installed, which is safe: the conflict path inserts nothing, and
anything it did insert would mirror under `patina.suppress_consent_dispatch`.

(0 rows on both counts is a property of the local stack, not of the fold:
`project_parties` and `studio_contacts` are both empty after seeding —
`select count(*) from project_parties` → 0, `studio_contacts` → 0. The fold is
exercised only by the SQL suite's own fixture, as `w1a-report.md` §5 says.)

### 1.5 Grants seed + generated types

```
$ python3 scripts/generate-legacy-grants.py
wrote .../supabase/seed/00-legacy-grants.sql — baseline + 2633 replayed statements
$ git diff --stat supabase/seed/00-legacy-grants.sql
                                                    (empty — regenerates identically)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate
$ git diff --stat packages/supabase/src/database.types.ts
                                                    (empty)
```

### 1.6 Grep-winner lineage — diffed, not taken on trust

```
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*fc_dispatch_optin_invite" supabase/migrations/*.sql | sort | tail -3
supabase/migrations/00284_field_dispatch_wiring.sql
supabase/migrations/00432_twilio_activation_hardening.sql
supabase/migrations/00594_studio_channel_consent.sql          ← this wave

$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*_site_request_consent_granted_dispatch" supabase/migrations/*.sql | sort | tail -3
supabase/migrations/00374_field_site_request_loop.sql
supabase/migrations/00594_studio_channel_consent.sql          ← this wave
```

Grep-winners excluding 00594 are **00432** and **00374**, exactly as the report
claims. I read both bodies side by side (`00432:27-68` vs `00594:642-689`;
`00374:3399-3444` vs `00594:709-761`): both are **verbatim**, the only delta
being the four-line `patina.suppress_consent_dispatch` guard inserted as the
first statement, and in both cases the `SET search_path` clause, the
`SECURITY DEFINER` marker and the `RETURNS trigger` spelling are preserved from
the winner (`SET search_path = public` on the 00432 one, `SET search_path TO
'public'` on the 00374 one — each matching its own source). 00374's trigger
`site_request_consent_granted_dispatch` is not touched. No other function in the
three files redefines anything that exists elsewhere:

```
$ grep -n "^CREATE OR REPLACE FUNCTION" supabase/migrations/0059{2,3,4}*.sql
   → 19 functions; 17 are new to the tree, 2 are the pair above
```

### 1.7 Numbering

Head before this wave is `00591`; the wave mints 00592–00594. Scanned every
local and remote ref:

```
refs/heads/build/people-room-crm-2026-09-11:   00592 00593 00594
refs/remotes/origin/build/people-room-crm-…:   00592 00593 00594
refs/heads/hour-tracking/integration:          00595 00596 00597
refs/heads/hour-tracking/server:               00595 … 00599
origin/main migration tip:                     00591_notification_log_delivery.sql
```

No collision. Still provisional until merge, as the report says.

### 1.8 Objects, RLS, grants, definer posture — probed, never the ledger

```
          relname           | rls | forced | policies
----------------------------+-----+--------+----------
 studio_channel_consent     | t   | f      |        1
 studio_contact_channels    | t   | f      |        4
 studio_contact_rules       | t   | f      |        4
 studio_person_affiliations | t   | f      |        4
```

Predicates read back verbatim from `pg_policies` and they match the direction
§7 contract row for row:

* `studio_person_affiliations` — `is_active_studio_member(studio_contact_org(person_id))`
  on all four, with INSERT/UPDATE `WITH CHECK` additionally pinning
  `studio_contact_org(person_id) = studio_contact_org(company_id)`.
* `studio_contact_channels` — `is_active_studio_member(studio_contact_org(owner_id))`
  on all four.
* `studio_contact_rules` — `CASE subject_type WHEN 'engagement' THEN
  is_studio_comember(project_party_designer(subject_id)) ELSE
  is_active_studio_member(studio_contact_org(subject_id)) END`, on all four —
  the `00584:884-921` posture for the per-job leg, as direction §7 specifies.
* `studio_channel_consent` — one SELECT policy,
  `is_active_studio_member(organization_id)`, and no write policy at all.

Grants, both directions:

```
 studio_channel_consent     | authenticated | SELECT
 studio_channel_consent     | service_role  | DELETE,INSERT,…,UPDATE
 studio_contact_channels    | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_contact_rules       | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_person_affiliations | authenticated | DELETE,INSERT,SELECT,UPDATE
```

`anon` holds nothing on any of the four. `record_channel_consent()` is the only
write door into the consent table by privilege, not by convention.

Definer posture — all 19 functions, `search_path` pinned on every one:

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
```

`normalize_channel_value` is declared IMMUTABLE and calls
`public.normalize_phone_e164`, which is itself IMMUTABLE (`provolatile = i`), so
the declaration is honest.

Triggers, all six affected tables:

```
 project_parties            | fc_optin_invite_dispatch                  | fc_dispatch_optin_invite               ← guarded
 project_parties            | normalize_phone_project_parties           | normalize_party_phone_e164             (BEFORE, pure)
 project_parties            | set_updated_at_project_parties            | update_updated_at_column               (BEFORE, pure)
 project_parties            | site_request_consent_granted_dispatch     | _site_request_consent_granted_dispatch ← guarded
 studio_channel_consent     | mirror_channel_consent_to_parties_trg     | mirror_channel_consent_to_parties
 studio_channel_consent     | set_updated_at_studio_channel_consent     | update_updated_at_column
 studio_contact_channels    | assert_channel_owner_kind_trg             | assert_channel_owner_kind
 studio_contact_channels    | normalize_studio_contact_channel_trg      | normalize_studio_contact_channel
 studio_contact_channels    | set_updated_at_studio_contact_channels    | update_updated_at_column
 studio_contact_rules       | assert_studio_contact_rule_route_trg      | assert_studio_contact_rule_route
 studio_contact_rules       | set_updated_at_studio_contact_rules       | update_updated_at_column
 studio_contacts            | assert_studio_contact_designations_trg    | assert_studio_contact_designations
 studio_contacts            | assert_studio_contact_identity_stable_trg | assert_studio_contact_identity_stable
 studio_contacts            | normalize_phone_studio_contacts           | normalize_party_phone_e164
 studio_contacts            | set_updated_at_studio_contacts            | update_updated_at_column
 studio_contacts            | sync_person_affiliation_from_pointer_trg  | sync_person_affiliation_from_pointer
 studio_person_affiliations | assert_affiliation_card_kinds_trg         | assert_affiliation_card_kinds
 studio_person_affiliations | set_updated_at_studio_person_affiliations | update_updated_at_column
 studio_person_affiliations | sync_studio_contact_company_pointer_trg   | sync_studio_contact_company_pointer
```

### 1.9 Other spot checks that came back clean

* **The mirror cannot loop.** `mirror_channel_consent_to_parties()` writes
  `project_parties` only; no `project_parties` trigger writes
  `studio_channel_consent`, and the one function the mirror calls after clearing
  the suppression flag, `site_request_dispatch_after_consent()`
  (`00374`), reads `project_parties` `FOR UPDATE` but never writes it. So the
  narrow release path cannot re-enter either outward trigger. Terminates in one
  statement.
* **The two-way affiliation binding terminates.** `sync_studio_contact_company_pointer`
  returns early on `patina.suppress_affiliation_sync`;
  `_sync_person_company_pointer`'s `UPDATE` is guarded `IS DISTINCT FROM`; the
  reverse trigger returns at its first test when pointer and open affiliation
  already agree. Walked INSERT / UPDATE / clear / DELETE by hand and each
  settles in one hop. SQL blocks 12 and 20 assert it.
* **Backfill precedence and per-org isolation.** `party_org` resolves the org as
  `COALESCE(p.studio_id, _primary_studio_for(p.designer_id))` and everything
  downstream partitions by `(org, phone_e164)`; `ranked` drops `org IS NULL`.
  `opted_out` outranks every other status; the refusal CTE is asked of the whole
  group, orders by words → date → recency, and carries a group-wide
  `max(sms_opt_out_at)` last resort. SQL blocks 3, 30 and 30e.
* **No enum `ADD VALUE` anywhere** — every new vocabulary is TEXT + CHECK, per
  PD-4. `grep -n "CREATE TYPE\|ADD VALUE" 0059{2,3,4}` returns only two prose
  comments explaining why.
* **No cron, no `invoke_edge_function` from the mirror, no prod command.**
  `grep -rn "db push\|functions deploy\|bkvcixdmuyejfzcijpdg\|supabase\.co\|cron\.schedule"`
  over the three migrations and the SQL test file: nothing.
* **Money in cents.** No money column is added by this wave. `retainage_bps` is
  an integer in basis points, commented as such (`00592:169-171`).
* **`people_directory` is untouched** — `grep -n "people_directory" 0059{2,3,4}`
  is empty, and no column is dropped or renamed on any table it reads, so every
  branch keeps its columns and its predicate. Correct: the rebuild is declared
  out of W1a scope.
* **The site access card has no client path because it does not exist yet** —
  `project_site_access_cards` is not in this wave (report §5, direction §7 P1).
  Nothing here adds a client-portal RLS branch to anything: all 13 policies
  above are `TO authenticated` gated on studio membership, and
  `studio_channel_consent` has no client branch. PR-w is not violated, but it is
  also not yet exercised.
* **Vocabulary vs direction §3.8.** Consent words map one-to-one
  (`not_asked | pending | granted | opted_out` ↔ Not asked / Invited / Texting /
  Opted out). Stage and Paper belong to objects declared out of scope. The
  consent `source` CHECK matches `project_parties_sms_consent_source_check`
  exactly, so the mirror can never raise 23514 on a seat.

---

## 2. Findings

Severity: **blocking** = the wave must not merge; **major** = must be fixed
before this wave is called clean; **minor** = recorded, fix at will. Confidence
is my confidence that the defect is real as described.

### MAJOR

#### R7-M1 — the inbound STOP rail still writes the CONSENT side, so r6 R6-M1 is only half closed: a STOP destroys the grant's own 10DLC evidence

**Severity major · confidence high.**

r6's R6-M1 ruled that *"the consent side is not free space; it holds the grant's
evidence"* and closed it inside `record_channel_consent`
(`00594:1469-1479` — `CASE WHEN EXCLUDED.status = 'opted_out' THEN scc.source …`,
five columns). The header restates the rule as an invariant of the record:
`00594:159-170` (*"AND A REFUSAL WRITES NONE OF THE CONSENT'S FIVE"*) and
`00594:181-190`.

The rail is the **other** writer of refusals — the one that writes *every* real
STOP — and it writes those columns unconditionally:

```
supabase/functions/sms-inbound/pipeline.ts:379-381

      source: "inbound_sms",
      evidence,
      recorded_at: now,
```

`writeChannelConsent()` takes `status: "granted" | "opted_out"` and this block is
outside any `status === …` test, unlike the four `opt_out_*` columns directly
below it (`:392-405`), which are correctly conditional. So on an ordinary STOP
against a number the studio holds a *written* grant for, the record keeps
`consented_at` but loses the grant's `source`, its words and its `recorded_at`.

**Repro, run against the reset stack, rolled back.** The insert is the shape
`record_channel_consent` mints for a written grant; the upsert is
`pipeline.ts:364-405` transcribed into SQL (the rail writes as `service_role`,
which has full INSERT/UPDATE on this table):

```
--- 1. the studio records a WRITTEN grant ---
 status  | source  |             evidence              | granted_on | grant_recorded
---------+---------+-----------------------------------+------------+----------------
 granted | written | Signed the Lindqvist kickoff form | 2025-05-02 | 2025-05-02

--- 2. the recipient texts STOP: the rail upsert, verbatim shape ---
INSERT 0 1

--- 3. the record AFTER the STOP: the GRANT side has been overwritten ---
  status   | grant_source_now | grant_evidence_now | granted_on | grant_recorded_now | opt_out_source | opt_out_evidence
-----------+------------------+--------------------+------------+--------------------+----------------+------------------
 opted_out | inbound_sms      | Replied STOP       | 2025-05-02 | 2026-09-12         | inbound_sms    | Replied STOP
```

**What it costs.** Exactly what R6-M1 costs, arriving from the rail instead of
the RPC:

* R-Q's **grant** sentence, composed off the record, reads *"Consent by text,
  2 May 2025"* for a consent that arrived on a signed kickoff form. The record
  now names the STOP as the way the consent arrived.
* The 10DLC artifact of the grant — the words the person was shown and agreed
  to, and the date the studio wrote them down — is gone, with no audit row.
  `recorded_at` (today) and `consented_at` (2025-05-02) are left contradicting
  each other on one row.
* `opt_out_recorded_by` is correctly left NULL on a rail write (`:405`), but
  `recorded_by` keeps `prior.recorded_by` — so the row reads "this consent
  arrived by text and <a named studio member> wrote it down", which is the
  attribution r7 R7-M1 ruled against.
* It is not recoverable: `record_channel_reconsent()` writes the consent side
  from the studio's *new* paperwork, and `record_channel_consent` refuses every
  non-refusal verdict while `refusal_unanswered` stands. Nothing restores the
  original grant's source and words.

It fires on the first real STOP after the first real grant. No later act by
anyone is needed, and the SQL suite cannot catch it because the suite never
exercises the rail's upsert shape (block 28 tests the same act through
`record_channel_consent`, which is the half that *was* fixed).

**Fix.** Make the three lines conditional the way their four neighbours already
are, and carry the prior values through on a refusal:

```ts
source:      status === "granted" ? "inbound_sms" : (prior.source ?? null),
evidence:    status === "granted" ? evidence      : (prior.evidence ?? null),
recorded_at: status === "granted" ? now           : (prior.recorded_at ?? null),
```

(`prior` is already selected at `:333-341` — it would need `source, evidence,
recorded_at` added to that `select`.) Then add the rail's shape to the SQL suite
beside block 32, or a Deno case in `_tests/sms-inbound.test.ts`, so the two
writers are asserted to agree.

**Not a finding, for the record:** the rail's `opt_out_at: now` (`:370`)
overwrites an earlier refusal date where `record_channel_consent` uses
`LEAST(…)`. `00594:1498-1499` explicitly rules that *"a second INBOUND refusal
does restate all four — that is the carrier speaking again"*, so this is
consistent with the ruling.

---

#### R7-M2 — `channelConsentVerdict()`'s one remaining phone-global branch does not check its read, so a failed read answers "unknown" where every sibling answers "refuse"

**Severity major · confidence high on the code, medium on frequency.**

R-AM's rule, which this file states four times and implements four times, is
that *a lookup that errored is not the same fact as an absent answer*:
`resolveProjectOrg` (`sms.ts:287-289`), `orgsOfProjects` (`:319-321`),
`orgHasOptedOutParty` (`:366-369` — *"A refusal we could not read is not a
refusal we may assume away"* → `return true`), and `channelConsentVerdict`'s own
record read (`:466-472` → `return "refuse"`).

The last branch of the same function drops it:

```
supabase/functions/_shared/sms.ts:504-511

  const { data: rows } = await supabase
    .from("project_parties")
    .select("sms_consent_status")
    .eq("phone_e164", phone);
  const anyOptedOut = (rows ?? []).some(
    (r) => (r as { sms_consent_status: string }).sms_consent_status === "opted_out",
  );
  return anyOptedOut ? "refuse" : "unknown";
```

No `error` is destructured. On a failed read `data` is null, `rows ?? []` is
empty, `anyOptedOut` is false, and the verdict is `"unknown"` — which lifts the
primary gate and hands the decision to the legacy party-row check.

This is the branch the design keeps phone-global *precisely because* nothing can
be scoped here (`sms.ts:411-415`, decision 13, R-AK): it is the last line
between an unattributable send and a STOP. Reached when
`resolveProjectOrg` returns `{org: null, failed: false}` — a project with a NULL
`studio_id` whose `designer_id` resolves to no active `design_studio`
membership (`primaryStudioFor` returns a null org without `failed`), or a send
with no `projectId` at all.

**The path to an actual send.** `sendPartySms` with a `partyId`: `resolveRecipient`'s
`partyId` branch reads that one row, so `recipient.consent` is the party's own
status. If that seat says `granted` while another studio's seat on the same
number says `opted_out`, the phone-global scan is the only thing that catches it
— and on a read error it does not. `sendPartySms:775-783` then passes
(`recipient.consent === "granted"`) and the text goes out. The same holds in
`flushDeferredMessages` (`:1048-1052`, then `:1077` `deferredPartyConsent`).

**Fix.** One line, matching its four siblings:

```ts
const { data: rows, error } = await supabase…
if (error) {
  console.error("channelConsentVerdict: refusing, the phone-global scan failed", error);
  return "refuse";
}
```

---

#### R7-M3 — a STOP's target resolution swallows both of its reads, so a record-only studio can keep a `granted` record after the number has said STOP

**Severity major · confidence high on the code, medium on frequency.**

Two of the three reads the STOP branch depends on ignore their `error`:

```
supabase/functions/sms-inbound/pipeline.ts:176-180   loadPhoneParties()
  const { data } = await supabase
    .from("project_parties")
    .select("id, project_id, sms_consent_status")
    .eq("phone_e164", phone);
  return (data ?? []) as PhoneParty[];

supabase/functions/sms-inbound/pipeline.ts:260-264   studiosHoldingRecord()
  const { data } = await supabase
    .from("studio_channel_consent")
    .select("organization_id, status")
    .eq("channel_kind", "sms")
    .eq("channel_value", phone);
  const rows = (data ?? []) as …
```

`studiosHoldingPhone()` between them does check (`:217-227`) and logs `failed`,
which is exactly the R-AM discipline — so the omission on either side of it
reads as an oversight rather than a decision.

On the STOP branch (`:604-614`) the targets are
`withRecordOnlyStudios(studiosHoldingPhone(loadPhoneParties(…)), studiosHoldingRecord(…))`.
A failed read at either site silently yields an empty list, so
`writeChannelConsent()` writes **no** consent records, and the branch continues
to `optOutAllForPhone()` and returns 200 to Twilio. No retry, no log.

For a studio that still holds a **seat**, `optOutAllForPhone` is the backstop:
its seats go `opted_out` phone-globally and `channelConsentVerdict`'s
`orgHasOptedOutParty` leg catches them. For a **record-only** studio there is no
backstop by construction — `studiosHoldingRecord()` exists because
*"a studio whose seat was removed … its record then sits at `granted` for ever
while the number has said STOP, and the send gate acts on that stale fact"*
(`pipeline.ts:246-254`). With that read swallowed, that is the state a single
failed query produces, and `channelConsentVerdict` returns `"allow"` for it
(`sms.ts:490-491`) — the positive branch, which carries a send. Seat removal is
a hard delete on the shipped Call Sheet today (G-10), so record-only studios are
not hypothetical once the fold has run on Strata.

**Fix.** Check both reads. `studiosHoldingRecord` should propagate a `failed`
flag the way `orgsOfProjects` does, and the STOP branch should return a
non-200 (or otherwise force Twilio's retry) rather than acknowledging a STOP it
did not fully record.

---

### MINOR

| ID | Finding | Evidence |
|---|---|---|
| R7-m1 | **`w1a-report.md` is stale for the eighth consecutive round, and this round it is stale in four separate places.** §1 `:15` and §3 `:852` say the two rule-array CHECKs hold "the seven-name channel vocabulary"; the applied constraints hold **eight** — `…,'portal_311','sms'` (r4 R4-M2). §3's pasted constraint transcript `:729-730` prints the seven-name arrays, i.e. output taken before that change. §3's SQL transcript `:736-779` ends at block 30 and `:781` claims "30 notices"; a fresh run emits **36** and ends at block 34 (30e, 31, 32, 33, 34 all missing). §1 `:42-44` says the grants seed "gained 210 lines … baseline + 2632 replayed statements"; actual is **216 / 2633**. §1's 00592 row also never mentions `rule_subject_kind_mismatch` (the r8 F1 subject guard, `00592:929-937`) or the `sms` rule token. This was r6-m1 and it has got worse, not better. | report `:15`, `:42-44`, `:729-730`, `:736-781`, `:852`; `grep -c NOTICE:` → 36; `git diff --stat 700261663 -- supabase/seed/00-legacy-grants.sql` → 216; generator stdout → 2633; `pg_get_constraintdef` → 8-element arrays |
| R7-m2 | An out-of-vocabulary `p_source` reaches the table and raises a raw `23514`, unlike every other input in the RPC (`invalid_channel_kind`, `invalid_consent_status`, `invalid_channel_value`, `consent_not_recordable` are all named). `grep -n "p_source NOT IN\|invalid_consent_source" 00594` → nothing. A portal that passes a free-text source gets a constraint name, not a sentence. (= r6-m2, untouched.) | `00594:1215-1229` (the named checks), `:1241-1253` (no vocabulary test) |
| R7-m3 | 00593's four backfill legs have no `archived_at IS NULL` filter (`grep -c archived_at 00593` → 0), so an archived card gains reach channels and is then permanently **identity-held** by `assert_studio_contact_identity_stable()` — a card the studio archived can no longer be re-kinded or moved, and W1a ships no channel editor to detach the rows. (= r6-m3, untouched.) | `00593:407-459`; `00593:517-519`, `:609-612` |
| R7-m4 | `studio_contact_channels.created_by` and `studio_person_affiliations.created_by` carry no `DEFAULT auth.uid()` while the sibling table's `studio_contact_rules.set_by` does. Neither table has a writer yet, so every row W1b creates will record no author unless the hook remembers to send one. (= r6-m4, untouched.) | `00593:83`; `00592:289` vs `00592:733` |
| R7-m5 | `company_kind`'s CHECK does not carry PR-f's shape: no `other_named`-with-a-required-label (the CHECK takes a bare `'other'` with nothing requiring a label), and no `inspector_subtype` (`ahj / lender / third_party`) anywhere — crm-model §2 names the subtype as its own field and R-A/R-H both turn on telling an AHJ from a draw inspector. Still not listed in the report's "Not done". (= r6-m5, untouched.) | `00592:132-146`; `rulings.md` PR-f; `crm-model.md` §2 `inspector_subtype` |
| R7-m6 | `escalation_by_class jsonb NOT NULL DEFAULT '{}'` takes any shape at all. The contract is `decision_class → channel_kind` (crm-model §2, F-05's "phone call over $2,500"), and this table is the ONE home of the routing fact by decision 1 — the same argument r6 M6-5 used to CHECK `channels_allowed`/`channels_forbidden`. A key or value the composer cannot match is a silent non-escalation. (= r6-m6, untouched.) | `00592:730`; cf. `00592:796-822` |
| R7-m7 | Neither RPC checks `p_origin_project_id` against `p_organization_id`. A member may stamp any project id they hold — including another studio's — as the origin R-Q's sentence names ("opted out … on the <project>"). The four other cross-tenant pointers this wave added all got a guard (R-AP, M6-4, R-AR, r8 F1); this one did not. (= r6-m7, untouched.) | `00594:1196`, `:1409`, `:1752`, `:1823` |
| R7-m8 | **`studio_contact_org(uuid)` and `project_party_designer(uuid)` are SECURITY DEFINER, granted to `authenticated`, and answer for ANY id with no membership test** — so they are PostgREST RPCs that turn a card id into its owning `organization_id`, and a party id into its lead designer's profile id, for a caller who cannot read either row. Probed: `SET LOCAL ROLE authenticated` with a random `sub` → `is_member = f`, `card_rows_visible = 0`, and `studio_contact_org(<card>)` still returns `423be29a-…`. The grant is genuinely required (policies evaluate in the caller's context), but the bodies can be narrowed to `… WHERE id = p_contact_id AND public.is_active_studio_member(organization_id)` without changing any policy's meaning — a non-member's policy already evaluates to false. | `00592:65-76`, `:85-99`; probe above |
| R7-m9 | `mirror_channel_consent_to_parties()` and `normalize_studio_contact_channel()` revoke only `FROM PUBLIC, anon`, while the seven sibling guard/trigger functions in the same three files also revoke `authenticated`. Probed, `authenticated` holds EXECUTE on the mirror on the local stack (`auth_x = t`). Harmless — a trigger function cannot be called outside a trigger — but it is the file's own posture stated two ways. | `00594:1054`; `00593:261`; cf. `00592:236-237`, `:423-424`, `:505-506`, `:539-540`, `:673-674`, `:976-977`, `00593:310-311` |
| R7-m10 | `record_channel_consent`'s 2a seat gate is a **read-then-write on the INSERT path**. `:1300-1325` reads `EXISTS(… pp.sms_consent_status = 'opted_out' …)` before the upsert; the same rule inside the write (`:1576-1584`) is a `DO UPDATE … WHERE` leg and therefore only runs when a conflict occurs. With no record yet — the exact case `:1327-1339` argues the gate must live inside the write for — a seat marked `opted_out` between the read and the INSERT is not re-tested, and a `granted` record is minted over it. The send gate's `orgHasOptedOutParty` catches it at send time, so this fails closed downstream; the write door does not. | `00594:1300-1325` vs `:1327-1339`, `:1576-1584` |
| R7-m11 | `optOutAllForPhone()` writes `sms_consent_status` and `sms_opt_out_at` phone-globally and touches no evidence column, so a seat in a studio the mirror did not reach (a project whose org will not resolve) sits at `opted_out` still carrying the **grant's** `sms_consent_source` / `sms_consent_evidence` / `sms_consent_recorded_at` / `sms_consent_recorded_by` — verbatim the R-AQ / r8 R8-M1 shape the mirror was rewritten to prevent, in the rows no mirror covers. | `supabase/functions/sms-inbound/pipeline.ts:422-427`; cf. `00594:903-914`, `:966-974` |
| R7-m12 | `studio_contact_channels.preferred` has no "one preferred channel per kind" constraint, though crm-model §2 marks the field required with exactly that rule and R-L's channel-selection rule reads it. A partial unique index on `(owner_id, channel_kind) WHERE preferred` would say it; W1b's editor otherwise has to. | `00593:77`; `crm-model.md` §2 Reach channel `preferred` |
| R7-m13 | `studio_person_affiliations`' SELECT and DELETE policies key only on `studio_contact_org(person_id)` while INSERT and UPDATE also pin `studio_contact_org(company_id)`. A cross-studio row (only `service_role` can mint one today) would be readable and deletable from the person's studio, exposing the other studio's card id. | `00592:333-336`, `:361-366` vs `:345-348`, `:356-359` |
| R7-m14 | `ranked`'s final tiebreak is `COALESCE(sms_opt_out_at, sms_consented_at, sms_consent_recorded_at, updated_at) DESC NULLS LAST`; two seats in one `(org, phone)` group with identical status and identical timestamps tie completely, so `ROW_NUMBER()` picks one arbitrarily and the record's `origin_project_id` and `consented_at` are non-deterministic across replays of the same fold. A final `, id` leg would make the fold reproducible. | `00594:405-411` |

---

## 3. Prior-round findings, re-checked

Round-6 review (`w1a-review-r6-migrations.md`), three majors:

| ID | Status | Evidence |
|---|---|---|
| R6-M1 — a recorded refusal overwrites the CONSENT side | **FIXED in `record_channel_consent`, OPEN in the inbound rail.** The `CASE WHEN EXCLUDED.status = 'opted_out' THEN scc.<col>` shape is installed on all five columns and SQL block 32 passes. The same hole in `writeChannelConsent()` was not closed → **R7-M1** above. | `00594:1469-1479`; suite block 32; `pipeline.ts:379-381` |
| R6-M2 — an empty-string disclosure version wipes the stored one | **FIXED.** `NULLIF(btrim(EXCLUDED.x), '')` on `source`, `evidence` and `disclosure_version`; block 33 passes, including 33b (a blank is still refused where required) and 33c (the three forms asserted on the installed source text). | `00594:1470`, `:1472`, `:1476-1477`; suite block 33 |
| R6-M3 — an EMAIL refusal was permanent | **FIXED.** The email leg is present in all three places it has to be — the `refusal_unanswered` CASE, the first `WHERE` leg and the second — and `pending` is still refused on email with its own hint. Block 34 passes, and 34e/34e2 hold the SMS control. | `00594:1442-1443`, `:1548`, `:1564`, `:1601-1607`; suite block 34 |

Round-6 minors R6-m1 … R6-m7: **all seven still open**, re-verified directly and
carried forward above as R7-m1 … R7-m7 (the fix log says explicitly that "the
seven minors are untouched"). R6-m1 has additionally drifted further.

Earlier-round rulings I re-verified as still holding: R-AG (`consent_not_recordable`,
`00594:1224-1229`), R-AH (`sms.ts:1048-1052`), R-AI/R-AO (`00592:580-695`, suite
blocks 12/20), R-AJ (`pipeline.ts` START scoping, suite via Deno cases), R-AK
(`sms.ts:490-499`), R-AL + r6 B6-1/M6-1 (`00594:1300-1325`, suite block 22),
R-AM (`sms.ts:287-289`, `:319-321`, `:366-369`, `:451-458` — with the two
exceptions that are R7-M2/R7-M3), R-AN (`00594:966-974`, block 18), R-AP
(`00592:190-256`, block 21), R-AQ + r9 R5-M2 (`00594:903-914`, block 27),
R-AR + r9 R5-M1 (`00593:502-612`, block 29), r7 M7-1 (block 26), r7 M7-2
(`00594:1793-1828`, block 27), r8 W4-M1/W4-M2 (blocks 3/27), r2 R2-M1
(block 30), r4 R4-M1 (block 30e), r8 F1 (block 31).

---

## 4. Not checked

* Strata. Nothing was pushed, deployed, or read from prod.
* The fold against real `project_parties` data — impossible locally (0 rows).
  The pre-push dry run `probe10-r9-fold-dry-run.sql` remains owed, and its
  instructions in report §5 are correct as written.
* `supabase/functions/_tests/fake-supabase.ts`'s composite-key `upsert` fix
  beyond confirming the 71 tests pass.
* W1b/W2 surfaces — no portal hook reads any of the four new tables yet.
