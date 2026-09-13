# W1a — adversarial migration review, round 3

Reviewer context: fresh. Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD `9b570a36f`
(`fix(people): W1a r2 review — B-1, B-2, B-3, M-1, M-2, M-3`).

Everything below was run against the **local** stack
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). No `supabase db push`,
no `supabase functions deploy`, no Strata contact. `apps/designer-portal/.env.local`
does not exist in this worktree (checked first):

```
$ ls -la .../apps/designer-portal/.env.local
"…/apps/designer-portal/.env.local": No such file or directory (os error 2)
$ ls .../apps/*/.env.local
zsh: no matches found
```

**Verdict: NOT clean — 0 blocking, 4 major, 26 minor.**

---

## 0. What was re-run, and what it said

### Reset (full replay + seeds)

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build supabase:reset
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

### SQL test

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  1. affiliations + RLS: passed
NOTICE:  2. channel normalisation: passed
NOTICE:  3. consent backfill precedence: passed
NOTICE:  4. mirror + 5. record_channel_consent: passed
NOTICE:  6. mirror fan-out (B1) + backfill re-run (M1): passed
NOTICE:  7. widened vocabularies (M2/M3/M4): passed
NOTICE:  8. mirror fan-out, site-request leg (B-1): passed
NOTICE:  9. record_channel_consent transition gate (B-2): passed
NOTICE:  10. mirror evidence refresh (M-1): passed
NOTICE:  11. one normalisation + origin rule (M-3): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

The test leaves nothing behind, and its `public.invoke_edge_function` stand-in is
genuinely rolled back (I checked, because a stand-in that escaped the transaction
would be a live footgun):

```
$ psql … -c "select proname, pg_get_function_identity_arguments(oid), proconfig from pg_proc … where proname='invoke_edge_function'"
 invoke_edge_function | fn_name text, body jsonb | {"search_path=public, extensions"}
$ psql … -Atc "select count(*) from organizations where slug like 'w1a-%';"   → 0
$ psql … -Atc "select count(*) from studio_channel_consent;"                  → 0
```

### Deno tests

```
$ deno test --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 51 passed | 0 failed (102ms)
```

### Idempotency — all three files re-executed TWICE more over the migrated DB

```
$ { printf 'BEGIN;\n'; for i in 1 2; do for f in 00592… 00593… 00594…; do cat "$f"; done; done;
    printf "SELECT 'IDEMPOTENT-OK';\nROLLBACK;\n"; } | psql … -v ON_ERROR_STOP=1
…
 backfill_channel_consent_from_parties
---------------------------------------
                                     0
    result
---------------
 IDEMPOTENT-OK
ROLLBACK
```

Six passes total (one from the reset, two more here), no error, and the re-run
backfill inserts 0.

### Regenerations

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2623 replayed statements
$ git diff --stat supabase/seed/00-legacy-grants.sql        → (empty)

$ SUPABASE_DB_URL=…54322/postgres pnpm --dir … db:generate
$ git diff --stat packages/supabase/src/database.types.ts   → (empty)
$ git diff --stat 700261663 -- packages/supabase/src/database.types.ts
 packages/supabase/src/database.types.ts | 461 ++++++++++++++++++++++++++++++++
 1 file changed, 461 insertions(+)
```

461 insertions, zero deletions, and both artefacts regenerate to a no-op — so the
committed seed and types really are the output of the committed schema.

---

## 1. Redefinition lineage — grep and diff, run by this reviewer

The rule: find the current body with
`grep -rln "CREATE OR REPLACE FUNCTION[^(]*<name>" supabase/migrations/*.sql | sort | tail -1`,
copy it verbatim, graft the delta.

```
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*[ .]fc_dispatch_optin_invite *(" supabase/migrations/*.sql | sort | tail -3
supabase/migrations/00284_field_dispatch_wiring.sql
supabase/migrations/00432_twilio_activation_hardening.sql     ← grep-winner before this wave
supabase/migrations/00594_studio_channel_consent.sql

$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*[ .]_site_request_consent_granted_dispatch *(" supabase/migrations/*.sql | sort | tail -3
supabase/migrations/00374_field_site_request_loop.sql          ← grep-winner before this wave
supabase/migrations/00594_studio_channel_consent.sql
```

Both grafts diff clean against their winners — one guard, nothing else:

```
$ sed -n '27,68p' 00432_twilio_activation_hardening.sql > a1.sql
$ sed -n '/^CREATE OR REPLACE FUNCTION public.fc_dispatch_optin_invite/,/^\$\$;$/p' 00594… > b1.sql
$ diff a1.sql b1.sql
7a8,13
>   -- 00594: the mirror is maintaining the cached copy of a consent record that
>   -- was already decided elsewhere. Mirroring a verdict is not asking for one.
>   IF COALESCE(current_setting('patina.suppress_consent_dispatch', true), '') = '1' THEN
>     RETURN NEW;
>   END IF;
>

$ sed -n '3399,3444p' 00374_field_site_request_loop.sql > a2.sql
$ sed -n '/^CREATE OR REPLACE FUNCTION public._site_request_consent_granted_dispatch/,/^\$\$;$/p' 00594… > b2.sql
$ diff a2.sql b2.sql
10a11,17
>   -- 00594: … (same guard, plus one sentence of comment)
>   IF COALESCE(current_setting('patina.suppress_consent_dispatch', true), '') = '1' THEN
>     RETURN NEW;
>   END IF;
>
```

Every other object in the three files is new. `grep` for each new name across
`supabase/migrations/*.sql` returns only the wave's own file. **Lineage rule: honoured.**

---

## 2. The mirror's suppression window — proved independently

The r2 fix rests on a claim about *when* `project_parties`' AFTER-row triggers
fire relative to `set_config(..., '', true)`. Rather than take the wave's own
assertion, I planted a spy trigger:

```sql
CREATE TEMP TABLE guard_log(seen text, tg text);
CREATE FUNCTION pg_temp.spy() … INSERT INTO guard_log
  VALUES (COALESCE(current_setting('patina.suppress_consent_dispatch', true),'<unset>'), TG_NAME);
CREATE TRIGGER zz_spy_after AFTER INSERT OR UPDATE ON public.project_parties …;
```

```
--- what the AFTER trigger on project_parties saw during the MIRROR write
 seen |      tg
------+--------------
 1    | zz_spy_after

--- flag after the mirror returned (should be cleared)
 after_mirror
--------------
             (empty)

--- a DIRECT party-row write in the same tx
 seen |      tg
------+--------------
      | zz_spy_after
```

The window is exactly the mirror's own statement. **B-1's mechanism is sound.**

`project_parties` carries only the two outward AFTER triggers, both guarded, and
the site-request one is further narrowed at the trigger:

```
 fc_optin_invite_dispatch              | AFTER INSERT OR UPDATE … fc_dispatch_optin_invite()
 site_request_consent_granted_dispatch | AFTER UPDATE OF sms_consent_status … WHEN (old IS DISTINCT FROM new AND new='granted')
 normalize_phone_project_parties       | BEFORE … (pure)
 set_updated_at_project_parties        | BEFORE … (pure)
```

**The mirror cannot loop:** nothing on `project_parties` writes
`studio_channel_consent`; all four triggers are enumerated above.

---

## 3. RLS, grants, definer posture — probed

```
          relname           | rls | force | policies
----------------------------+-----+-------+----------
 studio_channel_consent     | t   | f     |        1
 studio_contact_channels    | t   | f     |        4
 studio_contact_rules       | t   | f     |        4
 studio_person_affiliations | t   | f     |        4
```

Predicates, verbatim from `pg_policies`:

| table | predicate |
|---|---|
| `studio_channel_consent` (SELECT only) | `is_active_studio_member(organization_id)` |
| `studio_contact_channels` (4) | `is_active_studio_member(studio_contact_org(owner_id))` |
| `studio_person_affiliations` (4) | `is_active_studio_member(studio_contact_org(person_id))`; INSERT/UPDATE `WITH CHECK` also pins `studio_contact_org(person_id) = studio_contact_org(company_id)` |
| `studio_contact_rules` (4) | `CASE subject_type WHEN 'engagement' THEN is_studio_comember(project_party_designer(subject_id)) ELSE is_active_studio_member(studio_contact_org(subject_id)) END` |

These are the predicates the brief names: `is_active_studio_member` for the
`studio_contacts`-family, `is_studio_comember` for the `project_parties`-family
(00584's posture). `is_active_studio_member` excludes guests
(`role <> 'guest'`, `status='active'`) — checked in `pg_proc`.

Grants, both directions:

```
 studio_channel_consent     | authenticated | SELECT
 studio_channel_consent     | service_role  | ALL
 studio_contact_channels    | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_contact_rules       | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_person_affiliations | authenticated | DELETE,INSERT,SELECT,UPDATE
```

`anon` holds nothing on any of the four tables. `studio_channel_consent` has no
INSERT/UPDATE/DELETE policy AND no write grant — the RPC really is the only door,
by privilege.

Functions:

```
                proname                 | prosecdef |            proconfig            | anon | auth | svc
----------------------------------------+-----------+---------------------------------+------+------+-----
 _site_request_consent_granted_dispatch | t         | {search_path=public}            | f    | f    | t
 backfill_channel_consent_from_parties  | t         | {search_path=public}            | f    | f    | t
 fc_dispatch_optin_invite               | t         | {search_path=public}            | f    | t*   | t
 mirror_channel_consent_to_parties      | t         | {search_path=public}            | f    | t*   | t
 normalize_channel_value                | f         | {search_path=public}            | f    | t    | t
 normalize_studio_contact_channel       | f         | {"search_path=public, pg_temp"} | f    | t*   | t
 project_party_designer                 | t         | {search_path=public}            | f    | t    | t
 record_channel_consent                 | t         | {search_path=public}            | f    | t    | t
 record_channel_reconsent               | t         | {search_path=public}            | f    | t    | t
 studio_contact_org                     | t         | {search_path=public}            | f    | t    | t
```

Every SECURITY DEFINER pins `search_path`. `anon` executes none of them.
(`t*` = the local `00-legacy-grants.sql` baseline re-granting EXECUTE on every
routine; each file's own `REVOKE … FROM PUBLIC, anon` is what governs on Strata.
Same posture as 00281's `normalize_party_phone_e164`.) All six new functions are
owned by `postgres`, so the definer bodies bypass RLS as intended.

`normalize_channel_value` is declared `IMMUTABLE`; its only callee
`normalize_phone_e164` is `IMMUTABLE` too (`provolatile='i'`), so the declaration
is honest.

---

## 4. Things checked that are clean

- **No prod command anywhere in the wave.** `git diff 700261663 HEAD` matches
  `db push` / `functions deploy` / `supabase.co` / `bkvcixdmuyejfzcijpdg` only
  inside the report's own prose.
- **Numbering.** `origin/main` tip is `00591`; only this branch holds 00592–00594
  (`hour-tracking/server` now holds 00595–00597). The mint is correct.
  (The *report's* instruction about it is not — see m-11.)
- **Backfill vocabulary and FKs cannot 23514/23503 on Strata.** The new table's
  CHECKs and FKs are byte-identical in meaning to `project_parties`':
  `sms_consent_status_check` = the same four values, `sms_consent_source_check` =
  the same five, `sms_consent_recorded_by_fkey → profiles(id)` = the same target.
  `sms_consent_status` is `NOT NULL DEFAULT 'not_asked'`, so the fold cannot
  insert a NULL status. `studio_contacts.entity_kind` is CHECKed to
  `person|company`, so 00593's `owner_type` CHECK cannot be violated by the
  backfill. This was the biggest unexercised-on-local risk and it is closed.
- **`company_kind`'s CHECK is a superset of the shipped UI vocabulary.**
  `company-row.tsx:34-40` renders `gc/workroom/showroom/vendor/supplier`; all five
  are in the CHECK.
- **Money.** Nothing in the wave stores money. `retainage_bps` is integer basis
  points, per crm-model §2.
- **`people_directory` is untouched and intact** — 12 columns, unchanged order
  (`person_id … scope`), matching `current-state.md` §B1. W1a does not rebuild it
  (correct: out of scope by instruction), and adding columns to `studio_contacts`
  cannot break its named-column projections.
- **No client-portal path reads any new table.** All four gate on
  `is_active_studio_member` / `is_studio_comember`; a homeowner is `authenticated`
  but is not a studio member, so every predicate is false. The site access card
  (PR-w) is not in this wave at all.
- **Consent vocabulary matches direction §3.8** (`granted/pending/opted_out/not_asked`
  behind Texting/Invited/Opted out/Not asked) and crm-model §2
  (`source` = verbal/written/web_form/inbound_sms/other; `channel_kind` = sms/email).
- **Idempotent reruns**: six passes, no error (§0).

---

# FINDINGS

Severity and confidence on every one; nothing filtered.

## BLOCKING

None.

## MAJOR

### M3-1 — `record_channel_consent(…,'not_asked')` needs no evidence and passes no transition gate: one call erases a recorded grant and its whole 10DLC evidence set, from the record and from every mirrored party row
`supabase/migrations/00594_studio_channel_consent.sql:566-581` (the evidence
branch covers `pending`/`granted`/`opted_out` and says nothing about `not_asked`),
`:592-597` (the transition gate blocks only exits *from* `opted_out`),
`:625-633` (`v_same` false ⇒ `source`/`evidence`/`disclosure_version` = `EXCLUDED.*` = NULL).

r2's B-2 fix closed the *opted_out* direction. The `granted → not_asked`
direction is wide open and takes no arguments at all. Proved, as an ordinary
studio member:

```
--- A. record a granted consent with full evidence
 status  | source  |      evidence       | disclosure_version | has_consented_at
---------+---------+---------------------+--------------------+------------------
 granted | written | Signed kickoff form | field-sms-v1       | t

--- A2. party rows now mirrored
 f1000000-…0001 | granted | written | Signed kickoff form | field-sms-v1
 f1000000-…0002 | granted | written | Signed kickoff form | field-sms-v1

--- B. record_channel_consent(org,'sms','612-555-0199','not_asked')   ← four args, no evidence
  status   | source | evidence | disclosure_version | stamped
-----------+--------+----------+--------------------+---------
 not_asked |        |          |                    | t

--- B2. what happened to the party rows (the 10DLC evidence)
 f1000000-…0001 | not_asked |  |  |
 f1000000-…0002 | not_asked |  |  |
```

Two party rows that carried a source, the evidence in words and the disclosure
version now carry none, and the record that used to hold them holds none either.
There is no history table, so the fact is gone. The send gate stays fail-closed
(`not_asked` refuses), so this is not a send-safety hole — it is an
**evidence-destruction hole**, and it fans out across every seat in the studio on
that number, which is precisely the blast radius the mirror introduced.

The RPC is granted to `authenticated`, so it is reachable over PostgREST by any
studio member today, with or without a portal hook.

**Confidence: high (proven).** Fix: require source + evidence for `not_asked`
too, or refuse `not_asked` outright (there is nothing to record), and in either
case forbid a status change that empties the evidence set without restating it.

### M3-2 — the second send path, `flushDeferredMessages`, never reads `studio_channel_consent`: every quiet-hours-deferred message escapes the wave's primary gate
`supabase/functions/_shared/sms.ts:798` (the function), `:864-871` (the re-check:
`reduceConsent` over `project_parties` only), vs `:606-616` where `sendPartySms`
calls `channelConsentVerdict` first.

`flushDeferredMessages` is not a dead path: `field-daily/core.ts:17`, `:143` call
it on the cron, and `sendPartySms` itself parks off-hours sends there
(`deferToCaller` / `deferred`). So the module now has two consent gates that
disagree:

- **Fail-closed direction:** a studio record saying `granted` (the F-11 case the
  `allow` branch exists for) is not honoured on the flush — a deferred non-invite
  to a seat still sitting at `not_asked` is suppressed as `not_consented`. The
  wave's own feature does not survive quiet hours.
- **Fail-open direction:** a studio record saying `opted_out` does not stop the
  flush by itself. It stops it only through the mirrored party rows. Where those
  rows are gone (G-10 hard-deletes a party row on roster remove) or were never
  there (a record-only studio, which r2's B-3 fix explicitly taught the inbound
  rail to write), `reduceConsent` is phone-global and another studio's `granted`
  row wins. The deferred message goes out on a number whose owning studio's
  record says opted_out.

The row already carries what the fix needs: the select at `:820` reads
`party_id`, so `resolveProjectOrg` is one hop away.

**Confidence: high (the code path is unambiguous); medium that the fail-open
shape is reachable in Leah's data today.** Fix: call `channelConsentVerdict`
(or at minimum the record read) in the flush loop, keyed off `row.party_id`.

### M3-3 — `studio_person_affiliations` lands as E4's home while `studio_contacts.company_id` still holds the same fact, with no backfill, no precedence and no deprecation
`supabase/migrations/00592_people_cards_affiliations_rules.sql:174-204` (the new
table), against `supabase/migrations/00417_studio_contacts.sql:80` — `company_id
uuid REFERENCES public.studio_contacts(id)`, the existing person→firm link, with
its own index at `00417:178-179` and its own CHECK at `:119`.

It is not vestigial. It is written today:

```
packages/supabase/src/hooks/use-studio-contacts.ts:202:  company_id: input.companyId ?? null,      (useCreateStudioContact)
packages/supabase/src/hooks/use-studio-contacts.ts:234:  if (input.companyId !== undefined) updates.company_id = input.companyId;
```

So after this migration the answer to "which firm is this person at" has two
homes, one of them empty. Two consequences, both concrete:

1. Every rolodex person already linked to a firm through `company_id` has **no
   affiliation row**, so the company card's crew list (direction §2.2 E4 → "company
   card crew list", ruling R-W) renders empty for firms whose people are already
   linked. No backfill statement exists anywhere in 00592.
2. Two writers, two readers, and nothing says which wins — the exact failure the
   same migration's own header names when it refuses to put the contact rule in
   two places (`00592:17-21`: "a second home for the same fact is how a
   forbidding rule gets missed by one of two readers").

**Confidence: high (facts observed; the judgement that it matters is high too —
it is the wave's own stated principle).** Fix: backfill
`studio_person_affiliations` from `studio_contacts.company_id` in 00592 (open
row, `to_date` NULL), and state in the column COMMENT which one the room reads.

### M3-4 — `w1a-report.md` states a consent-safety property the code does not have: the inbound START *does* manufacture consent for a seat-holding studio whose record never left `not_asked`
`artifacts/people-room-crm-2026-09-11/build/w1a-report.md` §1, the `sms-inbound`
bullet: *"START/UNSTOP upserts `granted` for seat-holding studios plus any studio
whose record is currently `opted_out` (it lifts the refusals it mirrors; **it
never manufactures consent for a studio whose record never left `not_asked`**)."*
The same claim is in the code comment at
`supabase/functions/sms-inbound/pipeline.ts:514-515`.

The sentence contradicts its own first clause. `studiosHoldingPhone()`
(`pipeline.ts:205-229`) returns **every** studio with a party row on the number,
without looking at `sms_consent_status` or at the studio's record;
`withRecordOnlyStudios()` then *adds* the opted-out record-only studios. So
`startTargets` includes a studio that has a seat on the number, has never invited
it, and whose record is `not_asked` — and `writeChannelConsent(..., "granted",
...)` writes it `granted` with `source: 'inbound_sms'`, after which the send
gate's `allow` branch authorises that studio to text.

The restriction to `["opted_out"]` at `pipeline.ts:516` applies **only** to the
record-only arm. The wave's own test ("START lifts a seatless `opted_out` record
but leaves a seatless `not_asked` one alone") tests exactly and only the arm
where the claim holds.

The underlying behaviour is inherited — pre-wave `grantAllForPhone` flipped every
party row on the number — so this is not a regression in what gets sent. It is a
**stated safety property that is false**, in the document the integrator and W2
will build on, about consent. That is the M-2 class from r2.

**Confidence: high (code read is unambiguous; behaviour is pre-existing).**
Fix: correct both sentences, or scope the seat-derived arm the way the
record-only arm is scoped and keep the claim.

---

## MINOR

### New this round

**m3-a — a channel value that normalises to nothing is stored as `''`, and no consent record can ever be written for it.**
`00593:178-183` (`COALESCE(normalize_channel_value(...), '')`) vs `00594:561-564`
(`IF v_value IS NULL THEN RAISE 'invalid_channel_value'`). Proved:

```
--- P1. INSERT … channel_kind 'mobile', value '   '
 b9e1424b-… | mobile | ''                     ← accepted, stored empty
--- P1b. record_channel_consent(org,'sms','   ', …)
NOTICE:  P1b: consent REFUSED — invalid_channel_value
```

This is the degenerate case of the very drift M-3 was fixed to close ("a channel
row could exist that no consent record could ever be written for" —
`00593:130-134`). One `CHECK (btrim(value) <> '')` closes it.
**Confidence: high (proven).**

**m3-b — the new `COMMENT ON TABLE public.project_parties` asserts an invariant that is false today.**
`00594:419-421`: *"sms_consent_* is a READ-ONLY CACHED MIRROR of
studio_channel_consent since 00594"*. Three live writers remain, and the wave
keeps them deliberately (PR-x):
`packages/supabase/src/hooks/use-coordination.ts:439`, `:604`, `:745`;
`supabase/functions/sms-inbound/pipeline.ts:328`, `:348`. No grant, policy or
trigger prevents them. The *dispatch* half of the comment (the guard invariant)
is true and valuable; the read-only half is aspirational and will be read as
fact. **Confidence: high.** Fix: say "is becoming a cached mirror; direct writers
still exist and are retired in PR-x's follow-up".

**m3-c — the mirror re-dates "last touch" for every seat on the number.**
`00594:446-475` updates `project_parties`, which fires
`set_updated_at_project_parties`; `people_directory`'s parties branch exports
`pp.updated_at AS last_touch_at` (probed in the live view definition; lineage
`00589:824-860`). So recording one consent stamps "last touch = today" on every
person in that studio holding that number, across every project — people nobody
touched. The Directory sorts and the nurture surfaces read this column.
**Confidence: high (mechanism proven by the view definition + the trigger).**

**m3-d — `record_channel_consent`'s locking comment is false for the first write.**
`00594:584-590`: *"Lock the row so two members cannot race past this check."*
`SELECT … FOR UPDATE` that matches zero rows takes no lock. When no record exists
yet, a concurrent inbound STOP (service_role upsert, `pipeline.ts:274-315`) and a
portal `granted` both see "no prior", and whichever `ON CONFLICT DO UPDATE`
commits last wins — a first-ever STOP can be overwritten by a first-ever grant,
and the mirror then rewrites the party rows `optOutAllForPhone` had just set. The
existing-row case is genuinely safe (READ COMMITTED re-reads after the lock).
Window is milliseconds. **Confidence: high (mechanism), low (that it fires).**
Fix: `INSERT … ON CONFLICT DO NOTHING` a `not_asked` shell first, then lock, or
re-read after the conflict.

**m3-e — the channel backfill asserts `sms_capable` for numbers it cannot know are mobiles.**
`00593:254-263` sets `sms_capable = (entity_kind='person')` for every person
card's single phone; `:274-281` hardcodes `true` for every folded party phone.
CS4-7 and the column's own comment (`00593:57`) say "an office line must never be
offered an SMS invite" — and the fixture's F-13, F-14 and F-17 are exactly people
whose only number is an office line. The backfill marks all three SMS-capable.
**Confidence: high.** Fix: backfill `sms_capable = false` and let the studio
raise it, or mark backfilled rows `verified = false` and gate the invite on that.

**m3-f — nothing enforces one `preferred` channel per (owner, kind).**
`00593:62` vs crm-model §2 Reach channel `preferred`: "one preferred channel per
kind". No partial unique index. **Confidence: high.**

**m3-g — `role_at_firm` and `set_by` are optional where the field dictionary marks them required.**
`00592:183` (`role_at_firm text`, nullable) vs crm-model §2 Affiliation
`role_at_firm … Req yes`; `00592:283` (`set_by … DEFAULT auth.uid()`, nullable —
NULL for any service_role write) vs Contact rule `set_by … Req yes`, whose whole
point is "who learned the rule". **Confidence: high.**

**m3-h — four crm-model reach-channel kinds are dropped, with the rationale only in the migration.**
`00593:80-83` drops `app / account / field_link / paper` from crm-model §2's
eleven kinds. The reasoning (they are access tiers, E9, not typed addresses) is
sound and written down — but it amends the field dictionary and appears in no
ruling. **Confidence: high.**

**m3-i — the mirror has no DELETE branch.**
`00594:496-498` is `AFTER INSERT OR UPDATE`. A service_role delete of a consent
record leaves every party row in the studio carrying the deleted verdict, with no
record behind it. No delete path exists for `authenticated` today.
**Confidence: high (behaviour), low (that it matters).**

**m3-j — `orgHasOptedOutParty` fails open on a query error.**
`supabase/functions/_shared/sms.ts:273-290`: a failed query yields `data: null` →
`rows = []` → `return false`, and if the record says `granted` the verdict becomes
`allow`. Every other error path in the new gate falls through to the phone-global
scan (fail-closed); this one does not. **Confidence: high.**

### Carried from round 2 — re-checked, all still open

`00592` is byte-identical to its r2 state
(`git diff c4ca5b9f1 HEAD -- supabase/migrations/00592…` → empty), so every
00592-rooted minor stands untouched. Re-proved this round where a probe was cheap:

| ID | Finding | Status | Evidence this round |
|---|---|---|---|
| m-1 | `reach_preference` silently dropped (direction §7, crm-model §2) | **open** | `information_schema.columns … 'reach_preference'` → 0 rows |
| m-2 | an orphaned contact rule is invisible and undeletable (`00592:270-271`, `:300-301`) | **open** | 00592 unchanged |
| m-3 | `origin_project_id` not pinned to the recording org (`00594:615`, `:637`) | **open** | code unchanged |
| m-4 | `tax_id_last4 char(4)` with no numeric CHECK (`00592:101`) | **open** | `P5: ACCEPTED tax_id_last4='abcd'` |
| m-5 | affiliations' SELECT/DELETE legs gate only on the person's org (`00592:226`, `:245`, `:256`) | **open** | policy dump in §3 |
| m-6 | nothing checks an affiliation's two ids are a person and a firm (`00592:177-178`) | **open** | `P2: ACCEPTED` (person_id = a company card) |
| m-7 | `studio_contact_channels.owner_type` can contradict the card (`00593:44-45`) | **open** | `P3: ACCEPTED` (owner_type 'company' on a person card) |
| m-8 | designated-person FKs / `route_to_person_id` may point across studios (`00592:105-110`, `:276`) | **open** | `P4: ACCEPTED cross-studio pointer` |
| m-9 | `Consent.evidence_file` not carried (crm-model §2, CS4-18) | **open** | `00594:101-125` |
| m-10 | deploy-order coupling (migrations before functions) not in the redeploy list | **open** | `w1a-report.md` §4 still lists four functions with no order |
| m-11 | the report's renumbering instruction is stale **in the wrong direction** | **open** | see below |
| m-12 | the backfills exercise nothing locally | **open** | 0 consent rows after a fresh reset |
| m-13 | the dispatch kill-switch is a plain GUC any role can set (renamed to `patina.suppress_consent_dispatch`, `00594:292`, `:363`, `:444`) | **open** | rename only |
| m-14 | `ap_email` / `portal_311` have no consent kind (`00593:47-53` vs `00594:103`) | **open** | CHECKs unchanged |
| m-15 | `resolveProjectOrg` adds 2–3 round trips to every message (`sms.ts:202-222`, called `:606`) | **open** | unchanged |
| m-16 | `studio_contact_org` / `project_party_designer` are broadly-granted definer lookups (`00592:57-58`, `:80-81`) | **open** | grants dump in §3 |

**m-11, restated with this round's evidence.** `w1a-report.md` §5 still tells the
integrator there is "a live collision" on 00592–00594 and to "expect to renumber
this wave's three files". That is now backwards:

```
$ for b in <every local + remote ref>; do git ls-tree -r --name-only "$b" -- supabase/migrations | grep -E "0059[2-7]"; done
### refs/heads/build/people-room-crm-2026-09-11    00592…, 00593…, 00594…
### refs/heads/hour-tracking/server                00595…, 00596…, 00597…
### refs/remotes/origin/build/people-room-crm-…    00592…, 00593…, 00594…
### refs/remotes/origin/hour-tracking/server       00595…, 00596…, 00597…
```

`origin/main`'s tip is `00591`. No other branch holds 00592–00594. The mint is
correct as it stands; following the report literally would renumber the wrong
side. **Confidence: high (observed).**

---

## 5. Not findings (checked, clean)

- The mirror **cannot loop** — nothing on `project_parties` writes
  `studio_channel_consent`; all four triggers enumerated (§2).
- The suppression window is exactly the mirror's own statement — proved with a
  spy trigger, not taken on the wave's word (§2).
- Both redefinitions are verbatim grafts of their grep-winner bodies (§1).
- PR-x is honoured: `reduceConsent` (`sms.ts:181-190`) still stands behind the new
  gate for the phone-only path, and `opted_out` still wins in it. The new
  `studioGranted` bypass at `sms.ts:622`, `:627` lifts only the *positive* gates;
  the opt-out check at `:619` runs first and unconditionally.
- Backfill precedence is right: `opted_out` ranked 0, then `granted` by most
  recent, then `pending`, then `not_asked`, partitioned `BY org, phone_e164`
  (`00594:201-216`) — per-org isolation, proved by the wave's test block 3 and by
  the `WHERE org IS NOT NULL` guard (a party whose org cannot be resolved yields
  no record, and the send gate then falls to the fail-closed phone-global scan).
- `record_channel_consent` keeps a date it does not restate (`00594:621-624`), so
  R-Q's "granted 2 May 2025, opted out 3 Dec 2025" stays printable.
- `record_channel_reconsent` refuses unless the channel is currently `opted_out`,
  lands on `pending`, and keeps `opt_out_at` (`00594:724-743`) — PR-m's named way
  back, as ruled.
- The STOP path's phone-global reach across studios is a deliberate, documented
  asymmetry (`pipeline.ts:319-324`): a STOP to a shared 10DLC number is a
  carrier-level refusal and can only ever refuse. Recorded, not a finding.
- No prod command, no Strata contact, no `.env.local` in the worktree (§0).
