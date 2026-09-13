# W1a — adversarial migration review, round 4

Scope: `supabase/migrations/00592_people_cards_affiliations_rules.sql`,
`00593_studio_contact_channels.sql`, `00594_studio_channel_consent.sql`, the two
redefined trigger functions, `supabase/functions/_shared/sms.ts`,
`supabase/functions/sms-inbound/pipeline.ts`,
`supabase/tests/people/w1a_identity_channels_consent_test.sql`,
`supabase/seed/00-legacy-grants.sql`, `packages/supabase/src/database.types.ts`.

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD `eaef41e0d`.
Local Supabase only. No `supabase db push`, no `supabase functions deploy`, no
Strata contact. `apps/*/.env.local` does not exist in this worktree
(`ls apps/*/.env.local` → `no matches found`), checked before the reset.

**Verdict: NOT clean — 1 blocking, 2 major, 13 minor.**

---

## 0. What I ran

```
$ pnpm --dir …/agent-people-build supabase:reset
Applying migration 00591_notification_log_delivery.sql...
Applying migration 00592_people_cards_affiliations_rules.sql...
Applying migration 00593_studio_contact_channels.sql...
Applying migration 00594_studio_channel_consent.sql...
Applying migration 20260910152111_create_contact_messages.sql...
Seeding data from supabase/seed/00-legacy-grants.sql...
[… 29 seed files …]
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```

(The first attempt failed inside the sandbox — the Supabase CLI could not write
`~/.supabase/telemetry.json`, EPERM. Re-run with the sandbox disabled; nothing
else about the command changed.)

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  1. … NOTICE: 17. affiliation and channel kinds are enforced (M-2): passed
NOTICE:  All W1a assertions passed.
ROLLBACK

$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 61 passed | 0 failed (92ms)

$ deno check --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.ts supabase/functions/sms-inbound/pipeline.ts
Check supabase/functions/_shared/sms.ts
Check supabase/functions/sms-inbound/pipeline.ts
```

`sms-dispatch/index.ts` reports 11 `TS2345` errors. **Verified pre-existing**: I
replaced both edited files with their `700261663` versions and re-checked —
`Found 11 errors.` identically. The errors are a `SupabaseClient` generic
variance mismatch at `sms-dispatch/index.ts:83,121,138,151,178…`, untouched by
this wave. Working tree restored clean afterwards.

---

## 1. Re-check of the prior fix log (`w1a-fix-log-r3.md`)

| Prior finding | Status | Evidence |
|---|---|---|
| M3-1 / R-AG — `not_asked` refused; no write empties the evidence set | **fixed** | `00594:599-604`, `:692-696`; SQL block 9 |
| M3-2 / R-AH — flush runs `channelConsentVerdict` first | **fixed** | `sms.ts:885-920` |
| M3-3 / R-AI — affiliations are the home, pointer bound both ways | **fixed** | `00592:358-373`, `:420-462`, `:487-575`; SQL block 12 |
| M3-4 / R-AJ — START scoped to `opted_out`/`pending` records | **fixed** | `pipeline.ts:523-540` |
| F3 / R-AK — no-record fallback scoped to the resolving studio | **fixed** | `sms.ts:328-364` |
| r3r2 BLOCKING — flush's second gate narrowed to the deferred party | **fixed** | `sms.ts:924-945` |
| r3r2 M-1 — the two consent doors compose past a STOP | **STILL OPEN** — see **B-1**. The added leg (`00594:703-706`) is keyed on `opt_out_at`, and the fold mints `opted_out` records with `opt_out_at` NULL | probe below |
| r3r2 M-2 — entity-kind guards on affiliations and channels | **fixed** | `00592:299-346`, `00593:219-255`; SQL block 17 |
| r3r2 M-3 — the report must not outlive the code | **partly open** — decision 17's stated evidence rule is not what 00593 implements (see **M-1**) | probe below |

---

## 2. Checks that came back clean

**Grafts.** I ran the grep myself and diffed both bodies.

```
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*\bfc_dispatch_optin_invite\b" supabase/migrations/*.sql | sort | tail -1
supabase/migrations/00594_studio_channel_consent.sql        # ours; previous winner:
supabase/migrations/00432_twilio_activation_hardening.sql

$ diff -u <(sed -n '27,68p' …/00432_twilio_activation_hardening.sql) \
          <(sed -n '294,341p' …/00594_studio_channel_consent.sql)
+  -- 00594: the mirror is maintaining the cached copy …
+  IF COALESCE(current_setting('patina.suppress_consent_dispatch', true), '') = '1' THEN
+    RETURN NEW;
+  END IF;
+
(nothing else)

$ diff -u <(sed -n '3399,3444p' …/00374_field_site_request_loop.sql) \
          <(sed -n '361,413p' …/00594_studio_channel_consent.sql)
+  (the same four-line guard)
(nothing else)
```

Both lineages are the grep winners; both deltas are one guard as the first
statement; both triggers (`00284:254-257`, `00374:3446-3455`) are left alone.
No other function in the three files redefines an existing object — every other
`CREATE OR REPLACE FUNCTION` name greps to zero hits outside 00592–00594.

**The trigger inventory the migration claims.** Probed after the reset:

```
 fc_optin_invite_dispatch              | fc_dispatch_optin_invite               | AFTER   ← guarded
 site_request_consent_granted_dispatch | _site_request_consent_granted_dispatch | AFTER   ← guarded
 normalize_phone_project_parties       | normalize_party_phone_e164             | BEFORE
 set_updated_at_project_parties        | update_updated_at_column               | BEFORE

 functions reading patina.suppress_consent_dispatch:
   fc_dispatch_optin_invite · _site_request_consent_granted_dispatch · mirror_channel_consent_to_parties
```

Every outward-facing AFTER trigger on `project_parties` reads the guard. The
mirror sets the flag with `set_config(…, true)` and clears it after its own
UPDATE; SPI runs `AfterTriggerEndQuery` per statement inside a plpgsql function,
so the window is exactly that UPDATE. SQL block 8 asserts it.

**RLS, grants, tenant isolation** — probed with `SET LOCAL ROLE` + `request.jwt.claims`:

```
 studio_channel_consent     | rls t | force f | policies 1
 studio_contact_channels    | rls t | force f | policies 4
 studio_contact_rules       | rls t | force f | policies 4
 studio_person_affiliations | rls t | force f | policies 4

 studio_channel_consent     | authenticated | SELECT
 studio_channel_consent     | service_role  | DELETE,INSERT,…,UPDATE
 studio_contact_channels    | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_contact_rules       | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_person_affiliations | authenticated | DELETE,INSERT,SELECT,UPDATE
 (no anon row on any of the four)

### as ALPHA member          channels 1 · rules 1 · consent 1
### as BETA member           channels 0 · rules 0 · consent 0
  beta → channel on an alpha card : refused (row-level security policy)
  beta → rule for an alpha card   : refused (row-level security policy)
  beta → record_channel_consent(alpha org) : refused: not_a_studio_member
  authenticated → direct INSERT into studio_channel_consent : permission denied
### as ANON                  permission denied on all four tables
```

Predicates match direction §7 row for row: `is_active_studio_member(studio_contact_org(owner/person))`
for the card-owned tables, `is_active_studio_member(organization_id)` for the
consent table, and the engagement leg of `studio_contact_rules` on
`is_studio_comember(project_party_designer(subject_id))` (00584's posture).
Both helpers are NULL-safe (`p_org IS NOT NULL AND …`), so a dangling
`subject_id` reads false, not true.

**No client-portal path.** `grep -niE "show_to_client|client_portal|is_project_client|designer_clients"`
over the three migrations returns only the `REVOKE … FROM PUBLIC, anon` lines.
No table in this wave has a client branch; the site access card (PR-w) is not in
W1a at all.

**SECURITY DEFINER search_path** — all fifteen definer functions in the wave
carry `{search_path=public}`; the two invoker helpers carry
`{search_path=public, pg_temp}` and reference everything schema-qualified.
`normalize_channel_value` is `IMMUTABLE` and its only callee,
`normalize_phone_e164`, is also `i` — the marking is honest.

**Idempotent rerun.** All three files concatenated **twice** over the migrated
database in one transaction:

```
$ { echo BEGIN; for i in 1 2; do cat 00592 00593 00594; done; echo ROLLBACK; } | psql -v ON_ERROR_STOP=1 -f -
ROLLBACK        (no ERROR line; only "already exists, skipping" notices)
```

**Legacy grants** regenerate with an empty diff:

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2628 replayed statements
$ git diff --stat supabase/seed/00-legacy-grants.sql
(empty)
```

**Generated types** — no drift, and 465 insertions / 0 deletions against the
wave's base:

```
$ SUPABASE_DB_URL=…54322/postgres pnpm --dir … db:generate
$ git diff --stat packages/supabase/src/database.types.ts        → (empty)
$ git diff --stat 700261663 HEAD -- packages/supabase/src/database.types.ts
 packages/supabase/src/database.types.ts | 465 ++++++++++++++++++++++++++++++++
```

**Migration numbers.** Head before the wave is `00591`; the timestamp file
`20260910152111` is outside the sequence. Scanned across every local and remote
ref:

```
refs/heads/build/people-room-crm-2026-09-11        :: 00592 00593 00594
refs/heads/hour-tracking/integration               :: 00595 00596 00597
refs/heads/hour-tracking/server                    :: 00595 … 00599
refs/remotes/…                                     :: the same
```

No collision. Numbers stay provisional until merge.

**Vocabulary vs direction §3.8 / crm-model §2.** Consent statuses
(`not_asked|pending|granted|opted_out`) and sources
(`verbal|written|web_form|inbound_sms|other`) match verbatim. `company_kind` is
crm-model §2 verbatim plus `inspector` and `other` (a superset, justified in the
column COMMENT and needed so the shipped UI's `COMPANY_KIND_LABELS` cannot raise
23514). All new vocabularies are TEXT + named CHECK, added with the DROP/ADD
idiom so a rerun can widen them — **no enum, no `ADD VALUE`** anywhere.

**Money.** No money column added. `retainage_bps` is integer basis points;
`tax_id_last4` is `char(4)`. Correct.

**No cron, no prod command.** No `pg_cron` object in the wave.
`grep -niE "supabase (db push|functions deploy)|bkvcixdmuyejfzcijpdg|strata"`
over the migrations, tests and both edited functions → nothing.

**`people_directory`.** Untouched by W1a (`grep -l people_directory` over the
three files → nothing), so every column its readers select survives by
construction and its six branch predicates are unchanged. Adding columns to
`studio_contacts` cannot change a view's stored column list. The view still
resolves after the reset (it returns 0 rows as `postgres` because its branch
predicates call `auth.uid()`, which is NULL there — pre-existing, unrelated).

---

## 3. Findings

### BLOCKING

#### B-1 — the two consent doors still compose past a STOP whenever the refusal has no date, which is exactly what the fold mints

`supabase/migrations/00594_studio_channel_consent.sql:703-706`

```sql
    AND (EXCLUDED.status <> 'granted'
         OR scc.status = 'granted'
         OR scc.opt_out_at IS NULL          -- ← this leg
         OR (scc.consented_at IS NOT NULL AND scc.consented_at > scc.opt_out_at))
```

The r3r2 M-1 guarantee is stated as "`granted` is refused while an unanswered
refusal stands". It is implemented as "refused while `opt_out_at` is set and no
later `consented_at`". A consent record whose status is `opted_out` but whose
`opt_out_at` is NULL therefore passes the gate.

That record is not hypothetical. `backfill_channel_consent_from_parties()`
copies `sms_opt_out_at` straight through (`00594:234-237`), and the **shipped**
portal writes `opted_out` party rows with a NULL `sms_opt_out_at` on purpose —
`packages/supabase/src/hooks/use-coordination.ts:604-617`:

```ts
sms_consent_status: 'opted_out' as const,
// … A sibling with no date leaves this row with none — "opted out,
// date unknown" is the truth …
sms_opt_out_at: siblingOptOutAt,     // = sibling?.sms_opt_out_at ?? null
```

plus every pre-00432 row that never carried a date. On the first Strata push the
fold will mint dateless `opted_out` records for that whole population.

Executed, as an ordinary studio member with RLS on, whole thing rolled back:

```
--- the backfill folds a dateless opted_out party row
 folded
--------
      1
  status   | opt_out_at | consented_at
-----------+------------+--------------
 opted_out |            |

--- step 1: a direct grant is refused (the first gate holds)
NOTICE:  step1 refused: channel_opted_out
--- step 2: reconsent (legal, PR-m) -> pending
 status  | opt_out_at | consented_at
---------+------------+--------------
 pending |            |
--- step 3: the SAME grant again, now that the row moved off opted_out
NOTICE:  step3: ACCEPTED -> a recorded STOP is back at granted in two calls

--- final state of the record, and of the seat the mirror reaches
 status  | opt_out_at |         consented_at         | source  |  evidence
---------+------------+------------------------------+---------+------------
 granted |            | 2026-09-11 22:39:48.05784+00 | written | fresh form

                  id                  | sms_consent_status | sms_opt_out_at
--------------------------------------+--------------------+----------------
 ed000000-0000-4000-8000-000000000001 | granted            |
```

Two calls, any active studio member, no recipient involved: the record reads
`granted`, the mirror has cleared the party-row backstop `sendPartySms` falls
back on (`sms.ts:619-634`), and `channelConsentVerdict()` now returns `"allow"`
for a number that replied STOP. That is a real outbound text to a STOPped number
— the TCPA/10DLC exposure the r3r2 round ruled blocking, reopened for the exact
rows the prod fold will create.

**Fix.** Stop inferring "unanswered refusal" from a nullable date. Either (a)
record the fact explicitly — e.g. `record_channel_reconsent()` stamps a
`superseded_opt_out_at` (or a `pending_since_refusal` boolean) that
`record_channel_consent()`'s `granted` leg tests and the inbound rail clears with
its own YES/START; or (b) make the refusal always dated — have the fold write
`COALESCE(sms_opt_out_at, sms_consent_recorded_at, updated_at)` into
`opt_out_at` for any `opted_out` winner **and** drop the
`scc.opt_out_at IS NULL` escape from `00594:705` so a dateless refusal fails
closed rather than open. (a) is the honest one: (b) dates a STOP it does not
know the date of, which is the thing `use-coordination.ts:604-617` refuses to do.
Add the dateless case to SQL block 16, which today only exercises a dated one.

---

### MAJOR

#### M-1 — 00593's backfill marks numbers SMS-capable that were never on an SMS rail, including the two cards the fixture says must never be texted

`supabase/migrations/00593_studio_contact_channels.sql:322-342` (leg a) and
`:353-360` (leg c).

Report decision 17 states the rule as: `sms_capable` stays `false` "unless there
is EVIDENCE: a party row folded onto the same card (00418) carrying the same
normalised number — that number really was on an SMS rail."

The implemented test is weaker than the claim. It asks only that *some*
`project_parties` row is folded onto the card with the same number — of any
`party_kind`. `party_kind` ranges over `architect`, `photographer`, `stager`,
`client`, `client_rep`, `vendor`, `other`, none of which the SMS rail covers
(`FIELD_KINDS = ["gc","sub","installer","receiver"]`, `pipeline.ts:29`;
current-state §D). Leg (c) is worse: it writes a literal `true` for every folded
party phone with no test at all.

Executed against the reset database (both probes rolled back):

```
--- leg (a), an architect card and an AHJ card, each with a party row on the same number
             full_name              | channel_kind |    value     | sms_capable |             label
------------------------------------+--------------+--------------+-------------+--------------------------------
 Ray Thao (AHJ, NEVER text)         | mobile       | +16125550311 | t           | From the card (00593 backfill)
 Sam Rowe (architect, never texted) | mobile       | +16125550199 | t           | From the card (00593 backfill)

--- leg (c) alone, a card with no phone of its own and one `other`-kind party row
          full_name          | channel_kind |    value     | sms_capable |                 label
-----------------------------+--------------+--------------+-------------+----------------------------------------
 Ray Thao (AHJ) — NEVER text | mobile       | +16125550311 | t           | From a project roster (00593 backfill)
```

F-10 Sam Rowe ("email only; phone for emergencies… never texted") and F-27 Ray
Thao ("phone and email only; NEVER texted; scheduled through 311") both come out
of the fold marked SMS-capable, and neither gets the `line type unconfirmed`
label that W1b's Reach editor would use to ask the studio. That is precisely the
assertion crm-model §2 CS4-7 says `sms_capable` exists to deny, on a one-shot
backfill the studio then has to correct by hand.

**Fix.** Make the evidence an actual SMS rail, not a row's existence. The
database already holds it: `sms_conversations` is keyed `(twilio_number,
phone_e164)` and carries `last_inbound_at` / `last_outbound_at`; an
`EXISTS (SELECT 1 FROM sms_conversations c WHERE c.phone_e164 = <normalised>)`
— or, weaker but still honest, `pp.sms_consent_status <> 'not_asked'` on a
`FIELD_KINDS` row — says the number really was texted. Apply the same test to
leg (c) instead of the literal `true`, and label everything else
`line type unconfirmed`. Extend SQL block 15, which today only proves the
no-party-row case.

#### M-2 — an inbound YES flips sibling seats to `granted` through the mirror, so their parked site requests are never released

`supabase/functions/sms-inbound/pipeline.ts:567-586` +
`supabase/migrations/00594_studio_channel_consent.sql:441-492`.

The YES branch writes party rows first (correct, r2r2 B-1) but with
`onlyPending: true` — only seats already at `pending` take the real
`pending → granted` transition that fires
`site_request_consent_granted_dispatch`. The record write that follows then
mirrors `granted` onto **every** seat in that studio on that number, including
seats at `not_asked`, under `patina.suppress_consent_dispatch`. Those seats end
up `granted` with their `awaiting_consent` site requests never released — and
00374's trigger is the only caller of `site_request_dispatch_after_consent()`,
while the lifecycle sweep only promotes requests that already hold an outbox row
(`pipeline.ts:337-350`).

Executed — one studio, one person, one number, two jobs; Job A's seat `pending`,
Job B's seat `not_asked`, a parked request on each:

```
--- seats after the YES
 e9…0001 | Job A | granted
 e9…0002 | Job B | granted          ← flipped by the mirror
--- parked site requests: was each released?
 a9…0011 | awaiting_consent | granted   | outbox_rows 1   ← released
 a9…0012 | awaiting_consent | not_asked | outbox_rows 0   ← parked for ever
--- edge dispatches logged
 site-request-dispatch | a9…0011        (only one)
```

Job B's seat reads `granted` for ever while its request sits in
`awaiting_consent` for ever and its `consent_status_snapshot` still says
`not_asked`. The same shape applies to every studio-side grant through
`record_channel_consent()` — the mirror is the only writer and it is always
suppressed — so once W2's hook lands, a studio recording a grant releases
nothing at all. SQL block 13 does not catch this because both its seats are
`pending`.

**Fix.** Either widen the party-first write on YES to every seat the record is
about to cover (the START branch already uses `onlyPending: false`), or give the
mirror a narrow release path — an AFTER trigger on `studio_channel_consent` that
calls `site_request_dispatch_after_consent()` for requests parked on seats it
just moved to `granted`, which is durable in-transaction work and not an outward
send, so it need not hide behind the dispatch guard. Add the `not_asked`-sibling
case to SQL block 13.

---

### MINOR

**m-1 — `reach_preference` is neither built nor recorded as not built.**
direction §7 lists it as a P1 `studio_contacts` (person) column and crm-model §2
defines it (`enum text/email/phone/office/app`, F-13). `grep -rn reach_preference
supabase/ packages/ apps/` → nothing. The report's decision 1 explains dropping
`never_text` / `do_not_contact` / `do_not_contact_reason` / `route_to_person_id`
(orchestrator ruling: the rule has one home) but never mentions
`reach_preference`, and §5 "Not done" does not list it.
`studio_contact_channels.preferred` is a different fact (crm-model §2 defines
both). *Confidence: high.* Fix: add it, or add one line to §5.

**m-2 — the fold's precedence has no deterministic tie-break.**
`00594:214-224` ranks on the status class then
`COALESCE(sms_opt_out_at, sms_consented_at, sms_consent_recorded_at, updated_at) DESC NULLS LAST`.
After a real STOP every party row on the number carries the same
`sms_opt_out_at` (one `now` from `optOutAllForPhone`, `pipeline.ts:325-330`), so
two or more rows tie and `ROW_NUMBER()` picks one arbitrarily. Which row wins
decides whether the record keeps the earlier `consented_at` and the real
evidence text — the two things R-Q needs to print "granted 2 May 2025, opted out
3 Dec 2025". Both orderings of my probe happened to keep the grant, so this is
latent rather than demonstrated. *Confidence: medium.* Fix: append an explicit
tie-break (`consented_at DESC NULLS LAST, sms_consent_recorded_at DESC, id`), or
fold the dates with `MAX()` across the org's rows independently of the winner.

**m-3 — a studio-recorded `pending` sends no opt-in invite, and §5 does not say so.**
`record_channel_consent(…, 'pending', …)` and `record_channel_reconsent()` mirror
`pending` onto every seat with `fc_dispatch_optin_invite` suppressed
(`00594:441-492`). The migration header names the owner — "Sending for a consent
RECORD is W2's hook, once, deliberately" (`00594:75`) — but the report's §5 "Not
done" says only "No portal hook or UI". PR-m's way back therefore records a
consent the recipient is never asked to confirm until W2 ships the sender.
*Confidence: high.* Fix: one line in §5 naming the owed sender.

**m-4 — `p_origin_project_id` is unvalidated.** `00594:682`: any project uuid is
accepted, including one belonging to another studio (the FK only checks
existence). It is stored on the record and is what R-Q's sentence names.
Harmless today (the room cannot read a stranger studio's project name through
RLS) but it lets a member stamp an unresolvable origin.
*Confidence: high.* Fix: `AND EXISTS (… projects p WHERE p.id = p_origin_project_id
AND COALESCE(p.studio_id, _primary_studio_for(p.designer_id)) = p_organization_id)`
or NULL it out.

**m-5 — "one preferred channel per kind" is not enforced.** crm-model §2
(CS1-21) says one; `00593:66` is a plain boolean with no partial unique index on
`(owner_id, channel_kind) WHERE preferred`. *Confidence: high.*

**m-6 — a whitespace-only value is stored as the empty string.**
`00593:185-188` wraps the normaliser in `COALESCE(…, '')` so the NOT NULL cannot
fire; a member posting `"   "` gets a row whose `value` is `''`, which then
occupies the `(owner_id, channel_kind, value)` unique slot. *Confidence: high.*
Fix: `RAISE EXCEPTION` (or refuse in the RLS-facing hook) when the normalised
value is NULL, instead of substituting `''`.

**m-7 — writing the legacy pointer silently closes a second open affiliation.**
`00592:544-548` closes every open affiliation whose company differs from the
pointer. crm-model §4 explicitly allows a person at two firms (the sole
proprietor who also crews for a GC), and `_sync_person_company_pointer` is
written for exactly that case (`00592:391-393`). So a shipped
`useUpdateStudioContact` write to `company_id` ends the other affiliation with
no act by the studio. *Confidence: high.* Fix: close only the affiliation the
pointer previously named (`OLD.company_id`), not all of them.

**m-8 — an orphaned contact rule is invisible and undeletable.**
`studio_contact_rules.subject_id` has no FK and the table carries no
`organization_id` (`00592:597-598`), so if the subject card or party row is ever
deleted, `studio_contact_org(subject_id)` returns NULL, every policy evaluates
false, and no studio member can see or delete the row. *Confidence: high.*
Fix: an `ON DELETE` cleanup trigger, or an `organization_id` column stamped on
write. Affiliations and channels are safe (both `ON DELETE CASCADE`).

**m-9 — no mirror on DELETE of a consent record.** The trigger is
`AFTER INSERT OR UPDATE` only (`00594:507-509`). Only `service_role` can delete
(the table has no DELETE policy and no authenticated DELETE grant), but a
service-role delete leaves every party row in that studio holding the deleted
verdict with no record behind it. *Confidence: high.* Fix: extend the trigger to
DELETE (resetting the mirror to `not_asked`), or state that the table is
append-only in the COMMENT.

**m-10 — channel `status` spells crm-model's `ok` as `active`.**
`00593:68-69`, `:103-108`. Documented as a deliberate rename in the file, but
crm-model §2 and direction §7 both say `ok`, and the email rail (P3) will be
written against one of the two spellings. *Confidence: high.* Fix: pick one and
amend the losing document.

**m-11 — `channel_kind` omits crm-model §2's `app` / `account` / `field_link` /
`paper`.** `00593:51-57`. Deliberate and reasoned in the file (`:84-87`: those
are reach tiers derived from E9, not addresses), and consistent with direction
§3.8's reach family. Recorded here as a checked deviation from the field
dictionary, not a defect. *Confidence: high.*

**m-12 — one normaliser pins a different search_path from its siblings.**
`00593:180` uses `SET search_path = public, pg_temp`; every other function in the
wave uses `TO 'public'`. It is SECURITY INVOKER and every reference inside it is
schema-qualified, so there is no privilege consequence — style only, and it does
make the probe table in the report read as if one function were mispinned.
*Confidence: high.*

**m-13 — the mirror widens what a homeowner can read on a party row.**
`project_parties` has a client SELECT policy where `show_to_client` is true
(`00420:373-383`), and those rows now carry a studio-wide consent verdict
mirrored from any of the studio's jobs rather than the verdict captured on that
row. No policy changed; the meaning of an existing readable column did.
*Confidence: medium.* Worth one sentence in the report so the client-page copy is
written knowing it.

---

## 4. Summary

| Severity | Count | IDs |
|---|---|---|
| blocking | 1 | B-1 |
| major | 2 | M-1, M-2 |
| minor | 13 | m-1 … m-13 |

**clean = false.**

B-1 must be fixed before this wave is applied to Strata: the fold creates the
vulnerable rows, and the consequence is an outbound text to a number that
replied STOP.
