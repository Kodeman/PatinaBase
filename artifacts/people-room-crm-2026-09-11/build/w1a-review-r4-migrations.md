# W1a — adversarial migration review, round 4

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, at `e0df228f9`
("a contact rule is filed under the noun its subject actually is (r8 F1)").
Working tree clean for tracked files.

Read in full: `00592_people_cards_affiliations_rules.sql` (1020 lines),
`00593_studio_contact_channels.sql` (583), `00594_studio_channel_consent.sql`
(1665), `supabase/tests/people/w1a_identity_channels_consent_test.sql` (3610),
`_shared/sms.ts`, `sms-inbound/pipeline.ts`, plus the named context
(`rulings.md` all sections, `direction.md` §2.2/§3.8/§7/§8,
`crm-model.md` §1/§2/§4/§5, `current-state.md` §B–§E, `inventory.md`,
`fixture.md`, `w1a-fix-log-r3.md`).

**Verdict: NOT clean — 2 major, 9 minor, 0 blocking.**

Local Supabase only. No `supabase db push`, no `supabase functions deploy`, no
Strata contact. `apps/designer-portal/.env.local` does not exist in this
worktree (checked before the reset):

```
$ ls -la .../apps/designer-portal/.env.local
"…/apps/designer-portal/.env.local": No such file or directory (os error 2)
```

---

## 1. What I ran

### 1.1 Reset (full replay + seeds)

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

(First invocation failed inside the tool sandbox on
`/Users/kody/.supabase/telemetry.json` — an EPERM on the CLI's own telemetry
file, not a migration error. Re-run with the sandbox off, output above.)

### 1.2 SQL suite

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
…
NOTICE:  29. a held card cannot change what it is or whose it is (r8 R8-M2, R-AR): passed
NOTICE:  30. the fold picks the sibling that HOLDS the refusal, so a dateless
         portal refusal never erases the STOP's date or words — on the record
         or on the seats (r2 R2-M1): passed
NOTICE:  31. a rule is filed under the noun its subject actually is (r8 F1): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

All 32 blocks (1–31 plus 16B) pass. The first attempt aborted at line 122 with
`ERROR: deadlock detected` against `handle_new_user()` — a container-restart
artifact right after the reset; it passed on the retry twenty seconds later and
has not recurred. Not a finding, but worth knowing if CI runs the suite
immediately after a reset.

### 1.3 Deno suites

```
$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 71 passed | 0 failed (97ms)
```

### 1.4 Idempotent rerun

All three files replayed in one transaction against the already-migrated
database (seeded, so `project_parties` and `studio_contacts` carry real rows),
then rolled back:

```
$ psql … -v ON_ERROR_STOP=1 -f /tmp/…/rerun3.sql
…
 backfill_channel_consent_from_parties
---------------------------------------
                                     0
…
=== RERUN OK ===
ROLLBACK
```

Zero new consent rows, no constraint or trigger collision. The
`CREATE TABLE IF NOT EXISTS` + restated `ALTER`/`DROP CONSTRAINT … ADD`
idiom holds on all three.

### 1.5 Grants seed and generated types

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2633 replayed statements
$ git diff --stat -- supabase/seed/00-legacy-grants.sql
(empty)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate
$ git diff --stat packages/supabase/src/database.types.ts
(empty)
```

Both regenerate to exactly what is committed.
`git diff --numstat 700261663..HEAD` over the whole wave: `database.types.ts`
+508 / −0, `00-legacy-grants.sql` +216 / −0, three migrations, four edge files.
No portal hook, no `people_directory` change, no view touched — so the
"people_directory keeps every column its readers select" check is vacuously
satisfied this wave (the six-branch view at `00589:696-935` is untouched; the
new `studio_contacts` columns are additive and no reader enumerates columns it
does not ask for).

### 1.6 Grep-winner lineage (both redefined functions)

```
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*fc_dispatch_optin_invite" supabase/migrations/*.sql | sort | tail -1
supabase/migrations/00594_studio_channel_consent.sql        ← this file
  (previous winner: 00432_twilio_activation_hardening.sql:27)
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*_site_request_consent_granted_dispatch" … | sort | tail -1
supabase/migrations/00594_studio_channel_consent.sql        ← this file
  (previous winner: 00374_field_site_request_loop.sql:3399)
```

I extracted both winner bodies and diffed them against 00594's, stripping only
the declared delta (the `patina.suppress_consent_dispatch` guard and its
comment):

```
$ python3 … difflib over 00432:27-68 vs 00594:570-617
--- +++ @@ -7,2 +7,3 @@
 BEGIN
+
   IF NEW.sms_consent_status <> 'pending' OR NEW.phone_e164 IS NULL THEN
```

One blank line. `_site_request_consent_granted_dispatch` is likewise
byte-identical to `00374:3399-3444` apart from the same guard; its trigger
(`00374:3446-3455`) is left alone. **Both grafts are verbatim from the
grep-winner.** No other function in the three files redefines anything: I
re-grepped all twelve new names and none appears in an earlier migration.

### 1.7 Objects, RLS, grants, definer posture (probed, not read off the ledger)

```
          relname           | rls | force | policies
----------------------------+-----+-------+----------
 studio_channel_consent     | t   | f     |        1
 studio_contact_channels    | t   | f     |        4
 studio_contact_rules       | t   | f     |        4
 studio_person_affiliations | t   | f     |        4

         table_name         |    grantee    |   privs
----------------------------+---------------+---------------------------
 studio_channel_consent     | authenticated | SELECT
 studio_channel_consent     | service_role  | DELETE,INSERT,…,UPDATE
 studio_contact_channels    | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_contact_rules       | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_person_affiliations | authenticated | DELETE,INSERT,SELECT,UPDATE
```

`anon` holds nothing on any of the four (no row in
`information_schema.role_table_grants`). Predicates read back exactly as the
direction requires:

- `studio_contact_channels` / `studio_person_affiliations` →
  `is_active_studio_member(studio_contact_org(<card>))`, with the affiliation
  INSERT/UPDATE `WITH CHECK` additionally pinning
  `studio_contact_org(person_id) = studio_contact_org(company_id)`.
- `studio_contact_rules` → `CASE subject_type WHEN 'engagement' THEN
  is_studio_comember(project_party_designer(subject_id)) ELSE
  is_active_studio_member(studio_contact_org(subject_id)) END` on all four
  commands — matching `project_parties`' own posture (00584:884-921) for the
  engagement leg and `is_active_studio_member` for the card legs, per §7.
- `studio_channel_consent` → SELECT only, `is_active_studio_member(organization_id)`,
  no write policy and no write grant. `record_channel_consent()` is the door by
  privilege.

No client-portal branch anywhere in the four tables; the site access card
(PR-w) is not built in this wave, so there is nothing for a client path to
reach.

All nineteen new/redefined functions pin `search_path`; every `SECURITY
DEFINER` one pins it to `public`:

```
                proname                 | prosecdef |            proconfig            | anon | auth
----------------------------------------+-----------+---------------------------------+------+------
 _site_request_consent_granted_dispatch | t         | {search_path=public}            | f    | f
 _sync_person_company_pointer           | t         | {search_path=public}            | f    | f
 assert_affiliation_card_kinds          | t         | {search_path=public}            | f    | f
 assert_channel_owner_kind              | t         | {search_path=public}            | f    | f
 assert_studio_contact_designations     | t         | {search_path=public}            | f    | f
 assert_studio_contact_identity_stable  | t         | {search_path=public}            | f    | f
 assert_studio_contact_rule_route       | t         | {search_path=public}            | f    | f
 backfill_channel_consent_from_parties  | t         | {search_path=public}            | f    | f
 channel_value_was_on_sms_rail          | f         | {search_path=public}            | f    | f
 fc_dispatch_optin_invite               | t         | {search_path=public}            | f    | t*
 mirror_channel_consent_to_parties      | t         | {search_path=public}            | f    | t*
 normalize_channel_value                | f         | {search_path=public}            | f    | t
 normalize_studio_contact_channel       | f         | {"search_path=public, pg_temp"} | f    | t*
 project_party_designer                 | t         | {search_path=public}            | f    | t
 record_channel_consent                 | t         | {search_path=public}            | f    | t
 record_channel_reconsent               | t         | {search_path=public}            | f    | t
 studio_contact_org                     | t         | {search_path=public}            | f    | t
 sync_person_affiliation_from_pointer   | t         | {search_path=public}            | f    | f
 sync_studio_contact_company_pointer    | t         | {search_path=public}            | f    | f
```

`*` = the local `00-legacy-grants.sql` baseline re-granting EXECUTE on every
routine; the migrations' own `REVOKE … FROM PUBLIC, anon` is what governs on
Strata, and all three are trigger functions (a trigger function's EXECUTE is
checked at `CREATE TRIGGER`, not at fire time, so the REVOKE costs nothing).
`normalize_channel_value` is declared IMMUTABLE and its only callee,
`normalize_phone_e164` (00281), is also IMMUTABLE (`provolatile = i`) — the
declaration is honest.

### 1.8 Mirror loop, send gate, money, prod

- **The mirror cannot loop.** `mirror_channel_consent_to_parties_trg` is AFTER
  INSERT/UPDATE on `studio_channel_consent`; its only write is to
  `project_parties`, which carries no trigger writing back to
  `studio_channel_consent` (probed: four non-internal triggers, two pure BEFORE
  shapers and the two guarded AFTER dispatchers). The affiliation↔pointer pair
  in 00592 terminates on `patina.suppress_affiliation_sync` plus two early
  returns, and I traced all four entry orders (affiliation INSERT/UPDATE/DELETE,
  pointer INSERT/UPDATE, pointer cleared with a surviving sibling) to a
  one-hop fixed point.
- **The send gate fails closed** in every branch of `channelConsentVerdict`
  except one unchecked read (finding **m2**): a failed studio resolve refuses, a
  failed record read refuses, `opted_out` refuses, `refusal_unanswered`
  refuses whatever the status says, and `granted` is only honoured after
  `orgHasOptedOutParty` comes back clean. `flushDeferredMessages` runs the same
  two gates in the same order keyed off the deferred row's own party.
  `primaryStudioFor()` in `sms.ts:214-262` reproduces `_primary_studio_for`'s
  `ORDER BY (role='owner') DESC, joined_at NULLS LAST, created_at` (00315:64-79)
  exactly, so the two sides cannot disagree about a NULL-`studio_id` project.
- **Money**: the only money-shaped column added is `retainage_bps integer`
  (basis points, 00592:119) — no floats, no currency column in this wave.
- **Vocabulary**: `company_kind`, `channel_kind`, `subject_type`, consent
  `status` and both `source` columns are TEXT + named CHECK, restated with the
  `DROP CONSTRAINT IF EXISTS … ADD` idiom so a rerun can widen them. No enum
  `ADD VALUE` anywhere. `company_kind`'s list is crm-model §2 verbatim plus
  `inspector`/`other` and is a superset of the shipped
  `COMPANY_KIND_LABELS`, so folding `contact_kind` cannot raise 23514.
- **No prod command** appears in any of the three migrations, the SQL test, or
  the two edited edge files. The only `supabase db push` / `functions deploy`
  strings in the wave are the report's own "we did not do this" lines.
- **Numbering**: head before the wave is `00591_notification_log_delivery`;
  00592–00594 follow it. Scanning every local and remote ref, the only ones
  holding `0059[234]_` are this branch and its origin mirror. No collision today.

---

## 2. Findings

Severity: **blocking** = must change before merge; **major** = must change
before the prod fold; **minor** = worth a line. Confidence is mine, stated
separately from severity.

### MAJOR

---

#### R4-M1 — the fold takes the refusal's source, words and recorder off a row that is not a refusal, and the r2 ordering *prefers* that row
**severity: major · confidence: high (demonstrated) · `supabase/migrations/00594_studio_channel_consent.sql:437-463`, `:497-498`**

`backfill_channel_consent_from_parties()`'s `refusal` CTE admits two shapes of
row (`:457-461`):

```sql
 WHERE org IS NOT NULL
   AND (sms_consent_status = 'opted_out'
        OR (sms_opt_out_at IS NOT NULL
            AND (sms_consented_at IS NULL
                 OR sms_consented_at <= sms_opt_out_at)))
```

The second disjunct is r8 W4-M1's population: a seat whose *status* is not
`opted_out` but which carries an unanswered opt-out date. For such a row the
evidence columns — `sms_consent_source` / `sms_consent_evidence` /
`sms_consent_recorded_at` / `sms_consent_recorded_by` — belong to whatever act
wrote the row's *current* status, i.e. **the grant**. The CTE copies them
straight into the refusal's own evidence set anyway (`:440-443`, landing at
`:497-498`):

```sql
           sms_consent_source      AS opt_out_source,
           sms_consent_evidence    AS opt_out_evidence,
           sms_consent_recorded_at AS opt_out_recorded_at,
           sms_consent_recorded_by AS opt_out_recorded_by
```

And r2 R2-M1's own ordering leg (`:451`) makes the contaminated row **win**:

```sql
 ORDER BY (sms_consent_source IS NOT NULL) DESC,
```

The honest refusal the shipped portal writes — `opted_out`, no date, no source,
no words (`use-coordination.ts`, and the shape decision 23/R-AQ is built around)
— scores `false` on that leg and loses to a row whose only "words" are the
studio's consent paperwork.

**Demonstrated** on the live local stack (whole probe rolled back). One studio,
one number, two seats: the portal's sourceless `opted_out`, and a legacy seat
reading `granted` with `sms_opt_out_at 2025-11-16`, `sms_consented_at
2025-01-01` and the grant's own evidence:

```
--- THE RECORD THE FOLD MINTS ---
  status   |       opt_out_at       | refusal_unanswered | opt_out_source |         opt_out_evidence          |  opt_out_recorded_at
-----------+------------------------+--------------------+----------------+-----------------------------------+------------------------
 opted_out | 2025-11-16 00:00:00+00 | t                  | written        | Signed the Lindqvist kickoff form | 2025-01-01 00:00:00+00

--- THE SEATS AFTER THE MIRROR ---
 display_name | sms_consent_status |     sms_opt_out_at     | sms_consent_source |       sms_consent_evidence
--------------+--------------------+------------------------+--------------------+-----------------------------------
 Pete Rusk    | opted_out          | 2025-11-16 00:00:00+00 | written            | Signed the Lindqvist kickoff form
 Pete Rusk    | opted_out          | 2025-11-16 00:00:00+00 | written            | Signed the Lindqvist kickoff form
```

R-Q's sentence, composed off either the record or the seat, now reads
**"Opted out in writing, 16 Nov 2025"** — the studio's own consent document
named as the refusal. That is verbatim the failure decisions 22 (r9 R5-M1) and
23 (r8 R8-M1, R-AQ) exist to prevent; it simply arrives from the fold instead of
from the mirror. Two further consequences:

1. `opt_out_recorded_at` (2025-01-01) is now **ten months before** `opt_out_at`
   (2025-11-16) — a record asserting the refusal was written down before it
   happened.
2. Because `opt_out_source` is non-NULL, the mirror's wordless-refusal branch
   (`:803-814`, `v_refusal_wordless`) does **not** fire, so R-AQ's protective
   NULL-write never runs and every seat in the studio on that number carries the
   grant's paperwork as its refusal evidence — including a seat that may have
   been holding the STOP's own words.

R-AQ's premise as stated in the mirror (`:774-776`) — *"Every writer that mints
a refusal WITH words fills `opt_out_*` … so a NULL here means there were never
any refusal words"* — is true of `record_channel_consent` and of the inbound
rail. It is **not** true of this picker, which is exactly the reasoning r2 R2-M1
applied to the *ordering* and did not extend to the *projection*. It only bites
on the first prod fold, and `ON CONFLICT DO NOTHING` plus
`record_channel_reconsent()`'s by-design refusal to touch `opt_out_*` means no
later run repairs it.

Not blocking: `refusal_unanswered` is still `true`, so the record is minted
unsendable and no send-safety hole opens. This is evidence falsification, in the
same family as R2-M1 and R8-M1 (both of which were taken as major/blocking).

**Fix shape.** The refusal's evidence must only be taken from a row whose
evidence set is *about the refusal*. The narrow version: project
`opt_out_source`/`_evidence`/`_recorded_at`/`_recorded_by` as
`CASE WHEN sms_consent_status = 'opted_out' THEN sms_consent_source … END`
(NULL for the stale-opt-out shape, which then correctly reads as "this refusal
has no words" and lets R-AQ's branch do its job), and make the ordering leg ask
the same question — `(sms_consent_status = 'opted_out' AND sms_consent_source
IS NOT NULL) DESC` — so a wordless real refusal is never outranked by a grant's
paperwork. The date legs (`sms_opt_out_at`, `group_opt_out_at`) are fine as they
stand: a date is a date whichever status carries it. A test block belongs beside
block 30 with the shape probed above (a sourceless `opted_out` seat plus a
`granted` seat carrying a stale opt-out and the grant's own evidence), asserting
all four `opt_out_*` come out NULL on the record and on both seats.

---

#### R4-M2 — the one home of the forbidding rule cannot say "never text"
**severity: major · confidence: high · `supabase/migrations/00592_people_cards_affiliations_rules.sql:770-800`, `00593_studio_contact_channels.sql:99-108`**

Decision 1 removed `never_text` / `do_not_contact` / `do_not_contact_reason` /
`route_to_person_id` from `studio_contacts` (direction §7 lists all four there)
and made `studio_contact_rules` the single home of the forbidding fact. r6 M6-5
then constrained both arrays to 00593's seven channel kinds:

```sql
    channels_forbidden <@ ARRAY[
      'mobile', 'office', 'dispatch', 'after_hours',
      'email', 'ap_email',
      'portal_311'
    ]::text[]
```

**None of those seven means "a text".** SMS is not a channel kind in this model
— it rides on `mobile`, distinguished only by `studio_contact_channels.sms_capable`,
which 00593's own header insists is *"a fact about the LINE, not about a
studio's consent"* and is set by an evidence test, not by a studio preference.

So the two fixture cases the CHECK's own comment names (`00592:761-763`) cannot
be expressed by it:

- **F-10 Sam Rowe** — *"email only; **phone for emergencies**"*, `n/a (never
  texted)` (`fixture.md:37`). Forbidding `mobile` also forbids the emergency
  voice call the fixture explicitly permits; permitting `mobile` permits the
  text.
- **F-27 Ray Thao** — *"**phone** and email only; NEVER texted; scheduled
  through 311 portal"* (`fixture.md:54`). Same collision, and `fixture.md:63`
  names the never-text rule as the whole point of the pair.

crm-model §2 carries `Person.never_text bool` as a required field in its own
right (CS4-5, "F-27 AHJ must never be texted"), distinct from
`Reach channel.sms_capable` (CS4-7, "an office line must not be offered an SMS
invite"). After decision 1 that fact has no column and no vocabulary token
anywhere in W1a.

W1a ships no writer for `studio_contact_rules`, which is exactly why this is
cheap now and expensive at W1b: the rule editor will either widen the CHECK in a
follow-up migration or start writing `mobile` into `channels_forbidden` and
silently lose the "phone yes, text no" distinction the fixture is built on.

**Fix shape.** Either add an `sms` (or `text`) token to both CHECK arrays — it
is a *rule* vocabulary, not a *channel-row* vocabulary, so it need not appear in
`studio_contact_channels.channel_kind` — or state explicitly in the column
COMMENT and in the fix log that "never text" is deliberately deferred to W1b and
name where it will live, so the next wave does not inherit the current comment's
claim that F-10 and F-27 are covered. The first is a two-line change to
`00592:774-789` plus a test-block line; the second is a decision, not a code
change, but it must be written down.

---

### MINOR

---

#### R4-m1 — `w1a-report.md` §3 is stale for the third consecutive round, and §1's grant counts are stale too
**severity: minor · confidence: high · `artifacts/people-room-crm-2026-09-11/build/w1a-report.md:543-549`, `:736-786`, `:41-45`**

§3 opens "Every output below was re-taken after the r2 round … the section is at
the branch tip, not behind it" and then prints a transcript ending at
`30. the fold picks the sibling that HOLDS the refusal`, with the prose "**31
blocks** (1–30 plus 16B)". Commit `e0df228f9` (the branch tip) added block 31
and 125 lines of test:

```
NOTICE:  31. a rule is filed under the noun its subject actually is (r8 F1): passed
```

There are 32 blocks (1–31 plus 16B). §3 has now been behind at r9 (R5-M2), at r2
(R2-M2) and again here — and the stated remedy ("the re-take now happens AFTER
the round's code lands, never before it") did not hold for the very next commit.

§1 is stale by the same commit: it says the seed "gained 210 lines over this
wave's base commit `700261663`" and "baseline + 2632 replayed statements". The
real numbers are **216** (`git diff --numstat 700261663..HEAD` → `216 0`) and
**2633** (the generator's own line). Both regenerate clean, so nothing is
*wrong* in the tree — only in the report.

**Fix shape.** Re-take §3 and §1's two counts from the tip. If the pattern is
going to keep recurring, the cheapest structural answer is to stop pasting the
transcript at all and instead paste the block count plus the final
`All W1a assertions passed.` line, which does not drift block-by-block.

---

#### R4-m2 — `channelConsentVerdict`'s last branch swallows its read error, unlike the two above it
**severity: minor · confidence: medium · `supabase/functions/_shared/sms.ts:503-511`**

Both earlier reads in the same function check `error` and return `"refuse"` with
a log (`:452-458`, `:466-473`), on the stated doctrine that *"a refusal we could
not read is not a refusal we may assume away"* (`:365-368`). The no-studio
fallback does not:

```ts
  const { data: rows } = await supabase
    .from("project_parties")
    .select("sms_consent_status")
    .eq("phone_e164", phone);
  const anyOptedOut = (rows ?? []).some(…);
  return anyOptedOut ? "refuse" : "unknown";
```

A failed read yields `rows === null` → `anyOptedOut === false` → `"unknown"`,
and the send falls through to the legacy party-row gate. In practice the legacy
gate then refuses a non-granted recipient, so the exposure is narrow — but it is
the one branch of the wave's own gate that answers a *failure* as a *fact*, and
it is the branch reached exactly when no studio could be attributed, i.e. the
least-known case.

**Fix shape.** Destructure `error`, log, and `return "refuse"`, matching the two
reads above it. One line plus a test alongside the existing "with no resolvable
studio at all any opted_out row on the number still blocks" case.

---

#### R4-m3 — the inbound STOP rail's two new readers swallow their errors, and Twilio never retries a 200
**severity: minor · confidence: medium · `supabase/functions/sms-inbound/pipeline.ts:172-181`, `:255-270`**

`loadPhoneParties()` and `studiosHoldingRecord()` are both new in this wave and
both destructure `data` only:

```ts
  const { data } = await supabase.from("project_parties") …
  return (data ?? []) as PhoneParty[];
```

```ts
  const { data } = await supabase.from("studio_channel_consent") …
  const rows = (data ?? []) as Array<{ organization_id: string; status: string }>;
```

On a STOP, `stopTargets` is the union of the two (`:604-607`). A transient
failure in `studiosHoldingRecord()` silently drops every **record-only** studio
— precisely the population `withRecordOnlyStudios()` was added to cover — so
that studio's record stays `granted`, it holds no seat for
`orgHasOptedOutParty()` to find, and `channelConsentVerdict` returns `"allow"`.
The handler then returns `200` (`:622`), so Twilio does not retry and nothing
else re-reaches that record. A failure in `loadPhoneParties()` is less bad: the
seat-holding studios still fail closed through `optOutAllForPhone()` plus the
send gate's seat scan.

Narrow (record-only studio × transient read failure), but it is a compliance
rail with no retry, and the same code checks `failed` carefully one call deeper
(`orgsOfProjects`, R-AM).

**Fix shape.** Check `error` in both, and on a failure either return `502` so
Twilio retries, or at minimum log loudly and still run `optOutAllForPhone()`
(which it already does) so the party-row ledger carries the refusal.

---

#### R4-m4 — the record's `origin_project_id` can name a job the refusal did not happen on
**severity: minor · confidence: medium · `supabase/migrations/00594_studio_channel_consent.sql:499`**

The fold takes `origin_project_id` from the **ranked winner** (`r.project_id`)
while r6 R6-M2 moved the refusal's date and r8 W4-M2 moved its words onto the
**refusing sibling** (`f.*`). When those are different rows on different
projects — a studio holding the number on two jobs, the STOP received on job A
and the dateless portal refusal sitting on job B — the record reads
"opted out by text, 3 Dec 2025, on **job B**". R-Q's sentence is composed from
`opt_out_source` + `opt_out_at` + `origin_project_id` (the table's own column
comment says so, `:250-257`), so two of the three come off one row and the third
off another.

Block 30's fixture has both seats on one project, so the suite cannot see this.

**Fix shape.** Take `origin_project_id` from `f` when the record's status is
`opted_out` and `f` exists — `CASE WHEN r.sms_consent_status = 'opted_out'
THEN COALESCE(f.project_id, r.project_id) ELSE r.project_id END`, with
`project_id` carried through the `refusal` CTE. Or, if the winner's project is
deliberate, say so at the line and in the column comment.

---

#### R4-m5 — the inbound grant nulls the seat's `sms_opt_out_at`, which r6 M6-2 forbade the mirror from doing
**severity: minor · confidence: high (pre-existing line) · `supabase/functions/sms-inbound/pipeline.ts:464-467`**

```ts
  await supabase
    .from("project_parties")
    .update({ sms_consent_status: "granted", sms_consented_at: now, sms_opt_out_at: null })
    .in("id", ids);
```

r6 M6-2 changed the mirror so a verdict without an `opt_out_at` cannot wipe a
real dated refusal off the seats — *"the RPC goes to trouble to keep both dates
on the RECORD … and the mirror must not destroy the pair on the seats"*
(`00594:846-855`). `writeChannelConsent()` likewise carries `prior.opt_out_at`
forward on a grant (`pipeline.ts:370`). This line does the opposite on the same
transaction's party write, so after an inbound START/YES the record can print
"opted out 3 Dec 2025, granted today" while the seats — which decision 22 says
are what every shipped surface actually reads, since W1a ships no hook for the
new table — have lost the date entirely. The mirror runs second and COALESCEs,
so it cannot restore it.

Verified pre-existing: the identical line is at `700261663:pipeline.ts:174`, so
this is not a regression of the wave. It is an inconsistency the wave created
around it.

**Fix shape.** Drop `sms_opt_out_at: null` from the grant patch, or state at the
line why the seat's refusal date is deliberately cleared while the record's is
deliberately kept.

---

#### R4-m6 — two new SECURITY DEFINER helpers answer for any uuid, from any signed-in caller
**severity: minor · confidence: high (behaviour) / low (that it matters) · `00592:63-79`, `:83-101`**

`studio_contact_org(uuid)` and `project_party_designer(uuid)` are both
`SECURITY DEFINER`, both `GRANT EXECUTE … TO authenticated`, and neither checks
membership before answering. Any signed-in user holding a `studio_contacts.id`
learns which organization owns it; any user holding a `project_parties.id`
learns that project's lead designer's `profiles.id`. Both are uuids one would
normally have to be inside the tenant to possess, so the practical exposure is
small, and the pattern matches existing RLS helpers (`is_studio_comember` takes
a raw `designer_id`). Recording it because the wave adds two more such doors and
the count is now the thing worth watching.

**Fix shape.** None required. If it is ever worth closing, the cheap version is
to have each return NULL unless the caller is a member of the resolved org —
which is what every policy that calls them immediately tests anyway.

---

#### R4-m7 — `tax_id_last4 char(4)` blank-pads where crm-model §2 says text
**severity: minor · confidence: high · `supabase/migrations/00592_people_cards_affiliations_rules.sql:117`**

`char(n)` pads on storage and strips trailing blanks on comparison, so a value
shorter than four characters stores as `'12  '` and `length()` reads 4 while
`=` against `'12'` still matches — a shape that confuses a duplicate-vendor
check (CS6-11 is the stated reason the column exists). crm-model §2 types it
`text`. Every other short-string column in this wave is `text`.

**Fix shape.** `text` plus a `CHECK (tax_id_last4 ~ '^[0-9]{4}$')`, in the same
DROP/ADD idiom as the other named constraints. Nothing writes the column yet, so
the change is free today.

---

#### R4-m8 — one function pins a different `search_path` spelling from the other eighteen
**severity: minor · confidence: high · `supabase/migrations/00593_studio_contact_channels.sql:248`**

`normalize_studio_contact_channel()` uses `SET search_path = public, pg_temp`;
every other function the wave adds uses `SET search_path TO 'public'`. It is
harmless — the function is SECURITY INVOKER and the spelling copies 00281's
`normalize_party_phone_e164` on purpose — but it is the one row in the probe
table that reads differently, which costs a reviewer a lookup every round.

**Fix shape.** Either normalise to `TO 'public'` or note at the line that the
spelling is inherited from 00281 deliberately.

---

#### R4-m9 — the identity guard holds the card that is POINTED AT, not the card that POINTS
**severity: minor · confidence: high · `supabase/migrations/00593_studio_contact_channels.sql:502-560`**

`assert_studio_contact_identity_stable()` counts: channels *on* the card,
designations *naming* it, rules *routing to* it, affiliations *standing on* it.
It does not count the designations the card itself **holds**. So a company card
with no channels and no affiliations — a firm entered with no phone or email,
which then names a paperwork contact and a signer — can be flipped to
`entity_kind = 'person'`, and `assert_studio_contact_designations_trg` does not
fire on the flip (its `UPDATE OF` list is the three designation columns plus
`organization_id`, not `entity_kind`). The result is a person card still
carrying `company_kind`, `legal_name`, `retainage_bps` and three
`*_person_id` designations.

Nothing this wave's guards promise is violated (the designations still name
person cards in the same studio), and no reader breaks. It is the residual
half of R-AR's symmetry.

**Fix shape.** Add `entity_kind` to `assert_studio_contact_designations_trg`'s
`UPDATE OF` list and have that trigger refuse a non-`company` card that holds
any of the three designations — or record the asymmetry in R-AR's line so the
next reviewer does not re-derive it.

---

## 3. Prior-round findings, re-checked

Every finding in `w1a-fix-log-r3.md` and the rounds it summarises was re-checked
against the tree and, where the suite covers it, against a passing block.

| Prior | Ruling | State |
|---|---|---|
| M3-1 / R-AG — `not_asked` erased a grant | refused outright | **fixed** (`00594:1117-1122`; block 9) |
| M3-2 / R-AH — deferred path skipped the record | flush runs both gates | **fixed** (`sms.ts:1048-1085`; 3 Deno cases) |
| M3-3 / R-AI — affiliations vs `company_id` | bound both ways | **fixed** (`00592:449-693`; block 12) |
| M3-4 / R-AJ — START granted seat-holders | scoped to opted_out/pending | **fixed** (`pipeline.ts:633-649`) |
| F3 / R-AK — phone-global fallback | studio-scoped, one global case | **fixed** (`sms.ts:355-380`, `:497-511`) |
| r2 B-1 — mirror fired the opt-in SMS | both AFTER triggers guarded | **fixed** (block 8; probe in §1.6) |
| r3r2 BLOCKING — flush's 2nd gate reduced phone-globally | narrowed to the deferred party | **fixed** (`sms.ts:1074-1086`) |
| r4 B-1 — dateless refusal failed open | `refusal_unanswered` stored fact | **fixed** (block 16B) |
| r4 M-1 — backfill invented `sms_capable` | evidence test, both legs | **fixed** (`00593:209-229`, `:407-450`; block 15) |
| r4 M-2 — mirror stranded parked site requests | narrow durable release | **fixed** (`00594:930-946`; block 13) |
| r5 R-AL — write door ignored the seats | seat leg, dated or not | **fixed** (blocks 19, 22) |
| r5 R-AM — rail called the revoked RPC | reads the tables | **fixed** (`sms.ts:214-262`, matches 00315) |
| r5 R-AN / R-AO / R-AP | all three | **fixed** (blocks 18, 20, 21) |
| r6 B6-1 / M6-1..M6-5 | gate on the refusal; dateless; both dates; route guard; channel CHECK | **fixed** (blocks 22–25) — but see **R4-M2** on what the CHECK still cannot say |
| r7 M7-1 / M7-2 / R7-M1 | no RPC lowers the flag; reconsent evidence-only; earliest `opt_out_at` | **fixed** (blocks 26, 27, 28) |
| r8 W4-M1 / W4-M2 | refusal asked of the whole group; refusal's own evidence set | **fixed in shape** (block 27) — the *projection* of that evidence is **R4-M1** |
| r8 R8-M1 / R-AQ | wordless refusal wipes the seats | **fixed** (block 27i–27i5) — but **R4-M1** stops the branch firing when it should |
| r8 R8-M2 / R-AR | identity guard | **fixed** (block 29) — residual asymmetry is **R4-m9** |
| r8 F1 | rule filed under its subject's noun | **fixed** (`00592:848-962`; block 31) |
| r2 R2-M1 | fold picks the refusing sibling by its own facts | **fixed for the ordering's date leg**; the words leg is **R4-M1** |
| r2 R2-M2 | report §3 brought to the tip | **open again** — **R4-m1** |

Two prior findings are therefore only half-closed (r8 W4-M2 / r2 R2-M1 →
**R4-M1**; r2 R2-M2 → **R4-m1**); the rest hold.

---

## 4. Not checked

- **Strata.** Nothing was pushed, deployed or probed against prod. The pre-push
  fold dry run (`probe10-r9-fold-dry-run.sql`) must be re-cut **after** R4-M1
  lands, since its projection mirrors the function's.
- **The Deno suite beyond the two named files.** I ran `_shared/sms.test.ts` and
  `_tests/sms-inbound.test.ts` (71 passed). The report's separate note about
  `stripe-rail.test.ts` failing on missing env is pre-existing and unrelated;
  I did not re-verify it.
- **Portal type-check / build.** No portal code changed this wave.
