# W1a — adversarial migration review, round 2

Reviewer: separate context from the implementer and from the r1 reviewer.
Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD `c4ca5b9f1`
("fix(people): W1a r1 review — B1 + M1–M7").

**Verdict: NOT CLEAN — 3 blocking, 3 major, 16 minor.**

Read in full: `supabase/migrations/00592_people_cards_affiliations_rules.sql`,
`00593_studio_contact_channels.sql`, `00594_studio_channel_consent.sql`,
`supabase/tests/people/w1a_identity_channels_consent_test.sql`,
`supabase/functions/_shared/sms.ts`, `supabase/functions/sms-inbound/pipeline.ts`,
`supabase/functions/_tests/fake-supabase.ts`, plus the cited bodies of
`00281`, `00284`, `00315`, `00374`, `00417`, `00432`, `00556`, `00584`, and
`packages/supabase/src/hooks/use-coordination.ts`.

Everything below was run by this reviewer against the local stack only. No
`supabase db push`, no `supabase functions deploy`, no Strata contact, no
`.env.local` repoint. `apps/designer-portal/.env.local` **does not exist** in
this worktree (checked before the first reset), so nothing could have pointed
at prod.

---

## 0. What passed

| Check | Result |
|---|---|
| Numbering after head 00591 | ✅ 00592/00593/00594; timestamp file `20260910152111` ignored |
| Redefined function grafted from the grep-winner body | ✅ `fc_dispatch_optin_invite` diffed against `00432:27-68` — **only** the guard added (§2) |
| Banner header on each migration | ✅ all three, and 00594's banner now names the redefinition and its lineage (`00594:44-49`, `:213-222`) |
| Idempotent rerun | ✅ all three re-ran **twice more** in one rolled-back transaction, zero errors (§3) |
| New table ⇒ RLS + policies in the same file | ✅ 4/4 tables, RLS on, policies 1/4/4/4 |
| Grants explicit both directions; REVOKE FROM PUBLIC, anon | ✅ `anon` holds zero table privileges and zero EXECUTE on all seven functions (§4) |
| `SECURITY DEFINER` pins `search_path` | ✅ 6 definer functions all `{search_path=public}`; the invoker trigger fn pins `public, pg_temp` |
| `generate-legacy-grants.py` re-run | ✅ regenerates with an **empty diff**; all wave GRANT/REVOKEs present in the seed |
| `db:generate` | ✅ regenerates with an **empty diff**; committed change is `424 +` / `0 −` |
| SQL tests under `supabase/tests/people/` | ✅ all 7 blocks pass under `ON_ERROR_STOP=1` (§3) |
| Deno suites | ✅ 45/45 in the two edited suites; 668 passed / 1 pre-existing `stripe-rail` failure across `_tests` + `_shared` |
| Money in cents | ✅ no money column added; `retainage_bps` is integer basis points |
| Enum `ADD VALUE` in the adding transaction | ✅ none — TEXT + CHECK throughout (PD-4) |
| Guarded crons | ✅ none added |
| Extension functions schema-qualified | ✅ only `gen_random_uuid()` bare (resolves to `pg_catalog`, 158 precedents); `auth.uid()`, `public.normalize_phone_e164`, `public._primary_studio_for` qualified |
| Prod commands anywhere in the wave's files | ✅ none (`grep -nE "db push\|functions deploy\|supabase\.co\|bkvcixdmuyejfzcijpdg"` → no match) |
| `people_directory` altered | ✅ untouched; still 12 columns, same list as `current-state.md` §B1 |
| Client-portal / any app or package reading the new tables | ✅ none outside `database.types.ts` and the two edge functions (§4) — PR-w not yet in play, the site access card is correctly out of scope |
| RLS predicates vs `direction.md` §7 | ✅ channels/affiliations/card-rules on `is_active_studio_member(studio_contact_org(...))`; rules' engagement leg on `is_studio_comember(project_party_designer(...))`; consent on `is_active_studio_member(organization_id)` |
| `studio_channel_consent` write door | ✅ `authenticated` holds SELECT only; no INSERT/UPDATE/DELETE policy and no write grant |
| Mirror trigger cannot loop | ✅ nothing on `project_parties` writes `studio_channel_consent` (§5 — but see **B-1**, the loop is not the hazard) |
| Vocabularies vs `crm-model.md` §2 / `direction.md` §3.8 | ✅ `company_kind`, `channel_kind`, channel `status`, consent `status`, consent `source` all match after the r1 widenings |
| Column coverage vs `direction.md` §7 | ✅ all 11 company columns, all 3 person columns the wave claims, all 8 affiliation, 11 channel, 10 rule, and the full 00432 evidence set + `origin_project_id` on consent (gaps: **m-1**, **m-9**) |

---

## 1. Prior findings — re-checked one by one

| r1 ID | Status now | Evidence |
|---|---|---|
| **B1** mirrored `pending` fans out N opt-in SMS | **FIXED** (for `fc_dispatch_optin_invite` only) | Test block 6 passes with a live-rail control (6z); the guard diffs clean against `00432` |
| **M1** post-push backfill re-run reintroduces B1 | **FIXED** | Test block 6e/6f; the dry-run instruction is now in the report and in the function `COMMENT` (`00594:199-205`) |
| **M2** `channel_kind` missing `ap_email` / `portal_311` | **FIXED** | `00593:78-87` re-stated named constraint; probed |
| **M3** `company_kind` narrower than model + shipped UI | **FIXED** | `00592:114-128`; includes `workroom/showroom/supplier/authority` |
| **M4** channel `status` had no `bounced` | **FIXED** | `00593:93-98` |
| **M5** the new gate could refuse but never authorise | **FIXED — and the fix opened B-3** | `sms.ts:541`; see **B-3** |
| **M6** `grantAllForPhone` defeated per-studio scoping | **FIXED** | `pipeline.ts:306-321` `grantPartiesForStudios`, `.in("id", ids)` |
| **M7** rail and SQL resolved org differently | **FIXED** | `sms.ts:199-219` `resolveProjectOrg`; `pipeline.ts:201-247` |
| m1 `reach_preference` silently dropped | **OPEN** | `grep -rn reach_preference supabase/migrations/0059*.sql` → no match |
| m2 orphan contact rule invisible + undeletable | **OPEN (proven)** | §6 probe N7: `rules_left = 1`, `rules_visible_to_member = 0`. New: creating a rule on a non-existent subject is *refused* by RLS (N4), so orphans arise only from a later delete |
| m3 `record_channel_consent` accepts `granted` with no evidence | **OPEN — escalated to B-2** | §6 probe A/B |
| m4 `origin_project_id` not pinned to the org | **OPEN (proven)** | §6 probe N5: an Alpha record carries a Beta project id |
| m5 mirror never refreshes evidence on a same-status re-record | **OPEN — escalated to M-1** | §6 probe N6 |
| m6 the two consent writers disagree on `origin_project_id` precedence | **OPEN** | `00594:406` (new wins) vs `pipeline.ts:288` (prior wins) |
| m7 `tax_id_last4 char(4)` | **OPEN, rationale corrected** | §6 probe N8: `bpchar::text` *does* strip the pad, so r1's comparison hazard does not bite; the real gaps are the fixed-width type and the absent numeric CHECK (`'abcd'` accepted) |
| m8 affiliations' SELECT/DELETE gate only on the person's org | **OPEN** | `00592:226`, `:245`, `:256` still person-only |
| m9 `Consent.evidence_file` not carried | **OPEN** | grep → no match |
| m10 a studio holding the number only on a card gets no opt-out record | **OPEN — escalated to B-3** | `pipeline.ts:201-247` still derives studios from `project_parties` alone |
| m11 / m13 the 00592–00594 collision is live | **RESOLVED on the other side** — and the report's instruction is now stale; see **m-11** | `hour-tracking/server` now carries `00595_time_entry_claim_and_source`, `00596_project_unbilled_time_repair`, `00597_time_entry_auto_roster`. No branch other than this one holds 00592–00594 |
| m12 deploy-order coupling not named in the redeploy list | **OPEN** | `w1a-report.md` §4 lists the four importers but never says migrations-before-functions |
| m14 the backfills exercise nothing locally | **OPEN, partly addressed** | Re-confirmed after a fresh reset: `project_parties` 0 rows, `studio_contacts` 0 rows, `studio_contact_channels` 0, `studio_channel_consent` 0. The report now carries the pre-push dry-run (M1's fix) |

---

## 2. Redefinition lineage — the grep and the diff, run

```
$ cd .../supabase/migrations
$ for f in studio_contact_org project_party_designer normalize_studio_contact_channel \
       backfill_channel_consent_from_parties mirror_channel_consent_to_parties \
       record_channel_consent fc_dispatch_optin_invite; do
    echo "=== $f ==="; grep -rln "CREATE OR REPLACE FUNCTION[^(]*$f" *.sql | sort; done
=== studio_contact_org ===            00592_people_cards_affiliations_rules.sql
=== project_party_designer ===        00592_people_cards_affiliations_rules.sql
=== normalize_studio_contact_channel ===  00593_studio_contact_channels.sql
=== backfill_channel_consent_from_parties === 00594_studio_channel_consent.sql
=== mirror_channel_consent_to_parties ===     00594_studio_channel_consent.sql
=== record_channel_consent ===                00594_studio_channel_consent.sql
=== fc_dispatch_optin_invite ===
00284_field_dispatch_wiring.sql
00432_twilio_activation_hardening.sql
00594_studio_channel_consent.sql
```

Six of the seven are genuinely new. The seventh has a real lineage; the
grep-winner excluding this wave is **00432** (`sort | tail -1`). Diffed:

```
$ diff <(sed -n '27,68p' 00432_twilio_activation_hardening.sql) \
       <(sed -n '223,269p' 00594_studio_channel_consent.sql)
7a8,13
>   -- 00594: the mirror is maintaining the cached copy of a consent record that
>   -- was already decided elsewhere. Mirroring a verdict is not asking for one.
>   IF COALESCE(current_setting('patina.suppress_optin_dispatch', true), '') = '1' THEN
>     RETURN NEW;
>   END IF;
>
42d47
< $$;
```

The graft is exact: the 00432 body verbatim plus one guard. Lineage is named in
the banner (`00594:44-49`) and at the section head (`00594:213-222`).
`CREATE OR REPLACE` preserves the existing ACL, so no grant is owed — confirmed
in §4.

Helpers the wave *calls* were read at their own grep-winner heads and are
unmodified: `is_active_studio_member` (`00417:40-58`), `is_studio_comember`
(`00556`), `_primary_studio_for` (`00315:64-81`, parameter `p_user` — matches
the `supabase.rpc("_primary_studio_for", { p_user })` call sites),
`normalize_phone_e164` (`00281`), `update_updated_at_column`,
`invoke_edge_function` (single overload `(text,jsonb)`).

---

## 3. Reset, tests, idempotent rerun — run by this reviewer

```
$ pnpm --dir .../agent-people-build supabase:reset
…
Applying migration 00591_notification_log_delivery.sql...
Applying migration 00592_people_cards_affiliations_rules.sql...
Applying migration 00593_studio_contact_channels.sql...
Applying migration 00594_studio_channel_consent.sql...
Applying migration 20260910152111_create_contact_messages.sql...
Seeding data from supabase/seed/00-legacy-grants.sql...
… 28 more seed files …
Restarting containers...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```

(The first attempt failed inside the Bash sandbox with
`EPERM … /Users/kody/.supabase/telemetry.json.tmp` — a sandbox restriction on
the CLI's telemetry file, not a migration failure. Re-run with the sandbox
disabled for that one command.)

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  1. affiliations + RLS: passed
NOTICE:  2. channel normalisation: passed
NOTICE:  3. consent backfill precedence: passed
NOTICE:  4. mirror + 5. record_channel_consent: passed
NOTICE:  6. mirror fan-out (B1) + backfill re-run (M1): passed
NOTICE:  7. widened vocabularies (M2/M3/M4): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

```
$ deno test --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 45 passed | 0 failed (106ms)

$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_tests/ supabase/functions/_shared/
FAILED | 668 passed | 1 failed (3s)
  ./supabase/functions/_tests/stripe-rail.test.ts (uncaught error)   ← pre-existing
```

Idempotency, harder than r1's: all three files re-executed **twice more** over
the already-migrated database inside one rolled-back transaction.

```
BEGIN
### pass1 00592 / 00593 / 00594   → NOTICEs only ("already exists, skipping")
### pass2 00592 / 00593 / 00594
 backfill_channel_consent_from_parties
---------------------------------------
                                     0
### all six passes clean
ROLLBACK
```

Caveat, carried from r1 m14 and re-confirmed: the local seed set contains
**zero** `project_parties` rows and **zero** `studio_contacts` rows, so every
backfill inserts 0 rows on every local run. Idempotency of the two backfills is
proven only by the wave's own SQL fixture, never against seed data.

```
$ psql … -c "select count(*), count(phone_e164) from project_parties;"  →  0 | 0
$ psql … -c "select count(*) from studio_contacts;"                     →  0
```

---

## 4. Objects, grants, readers — probed

```
          relname           | rls | forced | policies
----------------------------+-----+--------+----------
 studio_channel_consent     | t   | f      |        1
 studio_contact_channels    | t   | f      |        4
 studio_contact_rules       | t   | f      |        4
 studio_person_affiliations | t   | f      |        4

         table_name         |    grantee    |                          privs
----------------------------+---------------+---------------------------------------------------------
 studio_channel_consent     | authenticated | SELECT
 studio_channel_consent     | service_role  | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
 studio_contact_channels    | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_contact_rules       | authenticated | DELETE,INSERT,SELECT,UPDATE
 studio_person_affiliations | authenticated | DELETE,INSERT,SELECT,UPDATE
   (no `anon` row for any of the four)

                proname                | prosecdef |            proconfig            | acl
---------------------------------------+-----------+---------------------------------+--------------------------------
 backfill_channel_consent_from_parties | t         | {search_path=public}            | postgres=X | service_role=X
 fc_dispatch_optin_invite              | t         | {search_path=public}            | postgres=X | authenticated=X | service_role=X
 mirror_channel_consent_to_parties     | t         | {search_path=public}            | postgres=X | authenticated=X | service_role=X
 normalize_studio_contact_channel      | f         | {"search_path=public, pg_temp"} | postgres=X | authenticated=X | service_role=X
 project_party_designer                | t         | {search_path=public}            | postgres=X | authenticated=X | service_role=X
 record_channel_consent                | t         | {search_path=public}            | postgres=X | authenticated=X | service_role=X
 studio_contact_org                    | t         | {search_path=public}            | postgres=X | authenticated=X | service_role=X
```

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2619 replayed statements
$ git diff --stat supabase/seed/00-legacy-grants.sql       # (empty)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate
$ git diff --stat packages/supabase/src/database.types.ts  # (empty)
```

Readers of the new objects outside `database.types.ts`:

```
$ grep -rn "studio_channel_consent|studio_contact_channels|studio_person_affiliations|
            studio_contact_rules|record_channel_consent" apps packages services supabase/functions studios
supabase/functions/_shared/sms.ts
supabase/functions/_shared/sms.test.ts
supabase/functions/sms-inbound/pipeline.ts
supabase/functions/_tests/sms-inbound.test.ts
```

No portal, no client portal, no iOS path. `people_directory` is untouched
(12 columns, exactly `current-state.md` §B1's list), so its ~20 readers are
unaffected.

---

## FINDINGS

### BLOCKING

#### B-1 — the mirror fires a **second** unguarded AFTER trigger on `project_parties`, and that one sends real SMS
`supabase/migrations/00594_studio_channel_consent.sql:296-310`
(`mirror_channel_consent_to_parties`), firing
`public._site_request_consent_granted_dispatch` (`00374_field_site_request_loop.sql:3399-3455`,
trigger `site_request_consent_granted_dispatch` at `:3448-3455`), which calls
`site-request-dispatch`, which calls `sendPartySms`
(`supabase/functions/site-request-dispatch/index.ts:7`, `:55`, `:154`).
**Severity: blocking. Confidence: high (proven).**

The r1 B1 fix suppresses exactly one trigger. `project_parties` carries **four**
non-internal triggers, two of which are AFTER-row:

```
$ psql … -c "select tgname, p.proname, tgtype from pg_trigger t join pg_proc p on p.oid=t.tgfoid
             where tgrelid='public.project_parties'::regclass and not tgisinternal;"
 set_updated_at_project_parties        | update_updated_at_column               | 19
 normalize_phone_project_parties       | normalize_party_phone_e164             | 23
 fc_optin_invite_dispatch              | fc_dispatch_optin_invite               | 21   ← guarded by 00594
 site_request_consent_granted_dispatch | _site_request_consent_granted_dispatch | 17   ← NOT guarded
```

`_site_request_consent_granted_dispatch` fires `WHEN (OLD.sms_consent_status IS
DISTINCT FROM NEW.sms_consent_status AND NEW.sms_consent_status = 'granted')` —
precisely what the mirror's UPDATE does to every party row in the studio on that
number. 00594's banner asserts the opposite (`:46-47`: "a mirror write is cache
maintenance, never a studio act, and must have no external side effect").

Proof — two seats for one human on one number, one `awaiting_consent` site
request each, `public.invoke_edge_function` stood in for inside a rolled-back
transaction, **one** studio act with no evidence at all:

```sql
SELECT public.record_channel_consent(
  'b3…000a','sms','6125550155','granted');          -- as an active Alpha member
 status
---------
 granted

SELECT fn, body->>'action', body->>'request_id' FROM public._r2_dispatch_log ORDER BY id;
          fn           |     action      |              request_id
-----------------------+-----------------+--------------------------------------
 site-request-dispatch | consent-granted | f3…0001
 site-request-dispatch | consent-granted | f3…0002

 site_request_sms_dispatched
-----------------------------
                           2
```

Two real outbound SMS to a trade, out of a cache-maintenance write, from a
consent the studio typed and nobody confirmed. This is B1's exact class, one
trigger over.

It is also strictly **new**: before 00594 there was no studio-side path to
`granted` at all — `useRecordPartySmsConsent` writes only `pending`
(`packages/supabase/src/hooks/use-coordination.ts:745`), so this trigger could
previously fire only from the recipient's own inbound YES/START, which is the
legitimate cause it was written for.

**Suggested fix:** have `_site_request_consent_granted_dispatch` read the same
`patina.suppress_optin_dispatch` guard (renamed to something honest, e.g.
`patina.suppress_consent_dispatch`), redefined in 00594 with its
`00374:3399-3444` body grafted verbatim — or make the mirror set the guard and
audit *every* trigger on `project_parties`, present and future, rather than the
one the last review named. A comment on `project_parties` naming the invariant
("an AFTER trigger here must tolerate a mirror write") would stop the third one
from landing unguarded.

---

#### B-2 — `record_channel_consent` has no transition guard and no evidence requirement: a studio member can erase an inbound STOP with a four-argument call, and the record inherits the STOP's own evidence
`supabase/migrations/00594_studio_channel_consent.sql:337-411`, especially
`:365-367` (status validated as a *value*, never as a *transition*) and
`:401-402` (`source = COALESCE(EXCLUDED.source, scc.source)`), plus the mirror
at `:296-310`.
**Severity: blocking. Confidence: high (proven).**

The RPC is granted to every `authenticated` studio member (`00594:415-416`) and
is documented as "the ONE write path" (`00594:29-32`, `:112-113`). It validates
membership, the channel kind, the status *value* and the channel format — and
nothing else. `p_source`, `p_evidence` and `p_disclosure_version` all default
NULL and are never required for any status.

Proof — a record folded from a real inbound STOP, flipped by one call:

```sql
-- after backfill: the STOP is on the books
 status    | opt_out_at             | source
-----------+------------------------+-------------
 opted_out | 2025-12-03 00:00:00+00 | inbound_sms

-- an active Alpha member, four arguments, nothing else
SELECT (public.record_channel_consent('b1…000a','sms','6125550177','granted')).status;
 granted

 status  |   source    |   evidence   | disclosure_version | has_consented_at | keeps_optout_date
---------+-------------+--------------+--------------------+------------------+-------------------
 granted | inbound_sms | Replied STOP | field-sms-v1       | t                | t

-- and the mirror cleared the refusal on every party row in the studio
                  id   | sms_consent_status | keeps_optout_date | sms_consent_evidence
-----------------------+--------------------+-------------------+----------------------
 e1…0001               | granted            | t                 | Replied STOP
 e1…0002               | granted            | t                 | Replied STOP
```

Two distinct defects in one call:

1. **The audit trail is laundered.** `COALESCE(EXCLUDED.source, scc.source)` and
   the same line for `evidence`/`disclosure_version` carry the *opt-out's*
   provenance forward onto the *grant*. The record now reads: consent granted,
   source `inbound_sms`, evidence "Replied STOP". That is the 10DLC evidence a
   carrier audit would be shown.
2. **The STOP is erased from the cache.** A third call with `'not_asked'`
   returns every party row to `not_asked` (probe C) — the state the shipped code
   goes out of its way to make impossible.

This directly contradicts the invariant the portal already enforces, in words,
at `packages/supabase/src/hooks/use-coordination.ts:519-522`: *"never lifts
`opted_out`: that status is the only stored record of a recipient's STOP, and
flipping it to `not_asked` would both erase that record and re-open the invite
path for a number that opted out."* `useRecordPartySmsConsent` enforces four
guards the RPC drops: source **and** evidence required (`:699-703`), the UPDATE
guarded on `sms_consent_status = 'not_asked'` (`:754`), an explicit refusal when
any sibling row on the number is `opted_out` (`:721-733`, "This number already
opted out of Patina texts. Only they can rejoin by replying START."), and a
ceiling of `pending` — never `granted` — so the double opt-in always runs
(`:745`).

PR-m sanctions a *fresh recorded consent* as the way back from an opt-out. It
does not sanction a four-argument call with no source, no evidence, no
disclosure version, no double opt-in, and the STOP's own words re-used as the
grant's evidence. Combined with **B-1**, the same call also sends.

**Suggested fix, in 00594 (the table is unpushed):** require
`p_source`, `p_evidence` and `p_disclosure_version` when `p_status IN
('pending','granted')`; refuse `opted_out → granted` outright and require a
separate, explicitly-named path for PR-m's re-consent; stop COALESCE-ing
`source`/`evidence`/`disclosure_version` forward across a status change (clear
them instead, or keep a prior-verdict column); and consider capping the RPC at
`pending` for `sms`, leaving `granted` to the inbound YES/START, as the shipped
rail already does.

---

#### B-3 — the new `allow` verdict lets a stale studio record override an opted-out party row, and the inbound STOP handler can never reach a record the studio holds without a seat
`supabase/functions/_shared/sms.ts:250-281` (`channelConsentVerdict` — the early
`return "unknown"` at `:269` skips the phone-global fallback whenever a record
exists), `:531-545` (`studioGranted`); `supabase/functions/sms-inbound/pipeline.ts:201-247`
(`studiosHoldingPhone` derives studios from `project_parties` only).
**Severity: blocking. Confidence: high on the mechanism (proven); medium on how
soon it fires.**

M5's fix gives the studio record the power to authorise. It is not paired with
any guarantee that the record is current. Proof, against the real
`sendPartySms` with the repo's own fake client:

```
R2-A: a stale granted record overrides an opted-out sibling row ... ok
  {"sent":true,"messageId":"41eac30e…","twilioSid":"dev-72a04cab…","body":"hello"}

R2-B: phone-only path, stale granted record vs phone-global opt-out ... ok
  {"sent":false,"reason":"opted_out"}
```

In R2-A: studio Alpha holds `+15551230001`; party row `p1` (new seat,
`not_asked`), party row `p2` (`opted_out`, from a real inbound STOP), and a
record that still says `granted`. **The text goes out.** Before this wave the
same input returned `not_consented`. The phone-only path (R2-B) still refuses,
so the gate is now asymmetric: the *safer* path is the one without a party id.

The record and the rows drift because the two writers have different reach:

- `optOutAllForPhone` (`pipeline.ts:294-301`) is phone-global over party rows.
- `writeChannelConsent`'s targets come from `studiosHoldingPhone`, which reads
  `project_parties` (`pipeline.ts:172-247`). A studio that holds a record but no
  party row on that number at STOP time is never updated — r1's m10, which was
  minor while the gate could only *print* the stale fact and is not minor now
  that the gate *acts* on it.
- The mirror only fires on a consent write, never on a party-row insert
  (`00594:329-332`), so a seat created after the record is never caught up —
  which is the very asymmetry M5's fix exploits.

Reachable with shipped code today: a studio's seat carries a grant → the
migration's backfill writes `granted` → the designer removes that seat from the
Call Sheet (still a hard delete, G-10, `use-coordination.ts` `useRemoveProjectParty`)
→ the person texts STOP → no target resolves, the record stays `granted` → the
designer re-adds the person next month → Patina texts a number that said STOP.
Reachable trivially once W2 lands the card-level hook the whole wave exists for:
a consent recorded against a rolodex card with no seat can never be reached by
an inbound STOP at all.

**Suggested fix:** (a) in `channelConsentVerdict`, run the phone-global
opted-out scan **before** honouring `granted`, so an opt-out from either ledger
still refuses; and (b) in `studiosHoldingPhone`, union the studios derived from
`project_parties` with the studios that hold a `studio_channel_consent` row for
that `channel_value`, so a STOP reaches every record on the number.

---

### MAJOR

#### M-1 — the mirror never refreshes the evidence set, so `project_parties` can carry `granted` with no source, no evidence and no recorded_at
`supabase/migrations/00594_studio_channel_consent.sql:310`
(`AND pp.sms_consent_status IS DISTINCT FROM NEW.status`).
**Severity: major. Confidence: high (proven).** (r1 m5, escalated.)

The guard is correct for suppressing a re-fire; it also suppresses every
evidence update. Probed:

```sql
-- 1st: granted, no evidence            2nd: granted, WITH evidence
 record_evidence
---------------------
 Signed kickoff form

 sms_consent_status | mirrored_evidence
--------------------+-------------------
 granted            |                     ← still NULL
```

Two consequences the wave's own framing makes serious. First, 00594 declares
`project_parties.sms_consent_*` "a READ-ONLY CACHED MIRROR" with "two readers,
one writer" (`:24-28`); a cache that is permanently wrong about the audit half
of the record is not that. Second, the mirror can put a party row into
`granted` with a NULL `sms_consent_source`, NULL `sms_consent_recorded_at` and
NULL `sms_consent_evidence` — a state the shipped write path made unreachable
(`use-coordination.ts:699-703` requires both source and evidence before a row
may leave `not_asked`) and which `project_parties` has no CHECK against
(confirmed: only `party_kind`, `sms_consent_source` and `sms_consent_status`
CHECKs exist). That is the 10DLC evidence row for the send.

**Suggested fix:** guard on the whole tuple
(`(pp.sms_consent_status, pp.sms_consent_source, pp.sms_consent_evidence,
pp.sms_consent_recorded_at, pp.sms_consent_disclosure_version) IS DISTINCT FROM
(NEW.status, NEW.source, NEW.evidence, NEW.recorded_at, NEW.disclosure_version)`)
— the dispatch is already suppressed by the 00594 guard, so the narrow status
test is no longer load-bearing.

---

#### M-2 — `w1a-report.md` still says no function was redefined, and its probe transcript is the pre-fix run
`artifacts/people-room-crm-2026-09-11/build/w1a-report.md:19`, the 00594 row of
the §1 table, and §3 at `:190-191`, `:213`, `:220`.
**Severity: major. Confidence: high.**

`:19` reads *"No function was redefined, so there is no lineage to graft."*
Since `c4ca5b9f1` that is false — 00594 redefines `fc_dispatch_optin_invite`
with a grafted 00432 body. The lineage rule is the single rule the
`patina-db-migrations` skill treats as load-bearing (00199 silently reverted
00185), and the wave's own report now denies it applies. The §1 table's 00594
row does not list the redefinition either, and §3's "Functions: SECURITY
DEFINER + pinned search_path" table omits `fc_dispatch_optin_invite`.

The report's §3 probe block is also the r1 run: it shows the SQL test ending at
`NOTICE: 4.` with no blocks 6 or 7 (`:190-191`), `16 passed` for the Deno suites
(`:213`, now 45) and `663 passed` for the full run (`:220`, now 668). The fix
log carries the current numbers; the report — the artefact the next wave reads —
does not. The `c4ca5b9f1` commit touched `w1a-report.md` by 10 lines only.

---

#### M-3 — the two consent writers still disagree, and the RPC's own normalisation is not the table's
`supabase/migrations/00594_studio_channel_consent.sql:406` vs
`supabase/functions/sms-inbound/pipeline.ts:288`; and `00594:371-378` vs
`00593:124-143`.
**Severity: major. Confidence: high.** (r1 m6, plus a second half.)

`origin_project_id`: the RPC takes the new value when supplied
(`COALESCE(EXCLUDED.origin_project_id, scc.origin_project_id)` — new wins); the
inbound rail takes the prior (`prior.origin_project_id ?? t.projectId` — prior
wins). One column cannot carry both jobs, and R-Q's sentence ("Opted out by
text, 3 Dec 2025, on the Lindqvist kitchen.") is read straight off it, so it
will name the grant's job after a STOP whenever a grant came first.

Second half, not in r1: `record_channel_consent` refuses an unparseable phone
(`00594:376-378`, `invalid_channel_value`) while
`normalize_studio_contact_channel` keeps the trimmed raw text
(`00593:136-139`, deliberately, because the column is NOT NULL). So a channel
row can exist that no consent record can ever be written for, and the two
"same normalisation" claims (`00594:369-370`) are not the same rule. Pick one:
either the consent key also accepts raw text, or the channel row is refused too.

---

### MINOR

#### m-1 — `reach_preference` silently dropped
`direction.md` §7 lists it on the `studio_contacts` (person) row;
`crm-model.md` §2 types it `text/email/phone/office/app` (CS4-5, F-13 has no
work cell). Absent from 00592, and absent from the report's deliberate-omissions
list (`w1a-report.md:50-54`). Plausibly subsumed by
`studio_contact_channels.preferred` (`00593:56`) — but that is one flag per
channel row, not a person-level posture. **Confidence: high.** Fix: add it, or
record the subsumption as a ruling. (r1 m1, unchanged.)

#### m-2 — an orphaned contact rule is invisible and undeletable
`00592:270-271` (polymorphic `subject_id`, no FK), `:300-301`.
Re-proved this round: after the subject card is deleted, `rules_left = 1`,
`rules_visible_to_member = 0`, and no member can remove it. New datum: creating
a rule on a non-existent subject is *refused* by the INSERT policy
(`new row violates row-level security policy`), so orphans arise only from a
later delete — narrowing the exposure but not closing it. **Confidence: high
(proven).** (r1 m2.)

#### m-3 — `origin_project_id` is not pinned to the recording org
`00594:391`, `:406`. Re-proved: an Alpha member recorded a row whose
`origin_project_id` is a **Beta** project. No read leak (project reads are
RLS-gated), but R-Q's sentence can name a job the studio does not own.
**Confidence: high (proven).** (r1 m4.)

#### m-4 — `tax_id_last4 char(4)`, with r1's rationale corrected
`00592:101`. r1 predicted a blank-padding comparison hazard; `bpchar::text`
strips the pad, so that half does not bite (`'123'` → `as_text '123'`, `len 3`,
`= '123'` true). What remains: a fixed-width type where every other text column
in the wave is `text`, and no numeric CHECK — `'abcd'` is accepted.
**Confidence: high (proven).** Fix: `text` + `CHECK (tax_id_last4 ~ '^[0-9]{4}$')`.

#### m-5 — affiliations' SELECT/DELETE legs gate only on the person's org
`00592:226`, `:245`, `:256`. Only the INSERT/UPDATE `WITH CHECK` pins both cards
to one studio (`:235-238`, `:246-249`). A straddling row written by service_role
or a future migration is visible to the person's studio and invisible to the
company's, with no way for the company's studio to see or remove it.
**Confidence: medium.** (r1 m8.)

#### m-6 — nothing checks that an affiliation's two ids are a person and a firm
`00592:177-178`. Both columns reference `studio_contacts` with no
`entity_kind` constraint. Proved: an affiliation with `person_id` = a **company**
card and `company_id` = a **person** card was accepted by an ordinary member.
E4's whole meaning ("which person does what at which firm",
`crm-model.md` §1) and the company card's crew list rest on this.
**Confidence: high (proven).** Same class the migration guarded for orgs and
missed for kinds. Fix: a CHECK via a small `STABLE` helper, or a BEFORE trigger.

#### m-7 — `studio_contact_channels.owner_type` can contradict the card
`00593:38-39`. Proved: `owner_type = 'company'` on a channel whose `owner_id` is
a **person** card was accepted. The column is pure duplication of
`studio_contacts.entity_kind` with nothing keeping the two honest.
**Confidence: high (proven).** Fix: drop the column and read `entity_kind`, or
constrain it.

#### m-8 — the three designated-person FKs and `route_to_person_id` may point across studios
`00592:105-110`, `:276`. Proved: an Alpha firm card's
`paperwork_contact_person_id` was set to a **Beta** person card by an Alpha
member. No read leak (the target is RLS-invisible), but "chase COI at F-14"
resolves to nothing and the data is silently wrong. **Confidence: high (proven).**

#### m-9 — `Consent.evidence_file` not carried
`crm-model.md` §2 (CS4-18, "the form itself cannot be attached today") lists it;
00594 carries only `evidence text`. Probably a deliberate deferral; named
nowhere. **Confidence: high.** (r1 m9.)

#### m-10 — deploy-order coupling still not named in the redeploy list
`sms.ts:258-269` queries `studio_channel_consent` unconditionally.
`w1a-report.md` §4 lists the four `_shared/sms.ts` importers but never says
**migrations before functions**. A function redeployed ahead of 00594 errors on
the query, `data` is null, and the gate falls through to the party-row scan —
fail-closed, so nothing breaks, but the W7 chain should state the order.
**Confidence: medium.** (r1 m12.)

#### m-11 — the report's renumbering instruction is now stale in the other direction
`w1a-report.md:297-307` tells the integrator to expect to renumber **this
wave's** three files against a live 00592–00594 `time_entry_*` trio. That trio
has since moved:

```
$ for b in <all refs>; do git ls-tree -r --name-only "$b" -- supabase/migrations | grep 0059; done
hour-tracking/server: supabase/migrations/00595_time_entry_claim_and_source.sql
hour-tracking/server: supabase/migrations/00596_project_unbilled_time_repair.sql
hour-tracking/server: supabase/migrations/00597_time_entry_auto_roster.sql
origin/main:          … 00591_notification_log_delivery.sql (tip)
```

No branch other than this one now holds 00592–00594. The numbering is correct as
minted; the report's instruction, followed literally, would renumber the wrong
side. **Confidence: high (observed).** (Supersedes r1 m11/m13.)

#### m-12 — the backfills still exercise nothing locally
Re-confirmed after a fresh reset: 0 `project_parties`, 0 `studio_contacts`,
0 channels, 0 consent rows. The precedence rule the whole room rests on is
proven only against the wave's own SQL fixture. The pre-push dry-run added by
M1's fix is the right mitigation and should be treated as a release gate, not
advice. **Confidence: high (proven).** (r1 m14.)

#### m-13 — `patina.suppress_optin_dispatch` is a plain GUC any role can set
`00594:232`, `:294`. Proved:

```
begin; set local role authenticated;
select set_config('patina.suppress_optin_dispatch','1',true);  → 1
```

So the double-opt-in dispatch has a kill switch that is not privileged. There is
no PostgREST path to `set_config` today, so reachability from the portal is nil;
the exposure is any future SECURITY INVOKER RPC that sets a GUC, and any
service_role script. **Confidence: medium.** Fix: gate on a marker only the
mirror can produce (a transaction-local temp table, or a `pg_trigger_depth()`
plus a sentinel column), or at minimum comment the constraint.

#### m-14 — `ap_email` and `portal_311` channels have no consent kind
`00593:41-47` (7 channel kinds) vs `00594:60` (`channel_kind IN ('sms','email')`).
An AP address and a 311 portal handle cannot carry a consent record; the email
suppression rail `direction.md` §7 P3 plans writes to
`studio_contact_channels.status` instead. Consistent with `crm-model.md` §2
(Consent.channel_kind is `sms/email`), but the mapping from `ap_email` to
consent kind `email` is stated nowhere. **Confidence: high.**

#### m-15 — `resolveProjectOrg` adds two to three round trips to every message
`sms.ts:199-219`, called at `:531` on every `sendPartySms`. Previously the send
path read one party row; it now also reads `projects`, may call
`_primary_studio_for`, and reads `studio_channel_consent`. `field-daily`'s
digest fans out per recipient. Not a correctness issue; worth a note before the
cron runs against Strata volume. **Confidence: medium.**

#### m-16 — `studio_contact_org` / `project_party_designer` are broadly-granted definer lookups
`00592:57-58`, `:80-81`. Any authenticated user may resolve the owning org of any
rolodex card id and the lead designer of any party id. The EXECUTE grant is
required (RLS predicates run as the caller) and the posture copies
`is_active_studio_member` / `is_studio_comember` / `_primary_studio_for`, so
this is house-consistent — recorded because it is two more enumeration doors
returning uuids to any signed-in account, including homeowners.
**Confidence: high (behaviour), low (that it matters).**

---

## 5. Not findings (checked, clean)

- `mirror_channel_consent_to_parties` cannot loop: nothing on `project_parties`
  writes `studio_channel_consent` (all four triggers enumerated in **B-1**).
- The suppression window really is the mirror's own statement: test block 6d
  asserts the flag does not survive the mirror, and 6c proves a direct party-row
  write still dispatches once.
- The test's `public.invoke_edge_function` stand-in genuinely replaces the real
  function — one overload only, `(text,jsonb)`, matching signature — inside a
  rolled-back transaction.
- `normalize_studio_contact_channel` is SECURITY INVOKER with no EXECUTE grant
  to `authenticated`; trigger-function EXECUTE is checked at `CREATE TRIGGER`,
  and the posture copies `00281`'s `normalize_party_phone_e164`.
- `ON CONFLICT DO NOTHING` in 00593's four backfill statements handles
  within-statement duplicates as well as pre-existing rows; the unique index is
  created before the backfill and the normalising trigger runs before the
  arbiter.
- `fake-supabase.ts`'s composite-`onConflict` change reduces to the old
  predicate for single-column callers; the full suite is green.
- No client-facing RLS branch anywhere in the wave; `anon` is fully revoked;
  a homeowner signed in as `authenticated` fails every predicate. PR-w is
  satisfied by omission — the site access card is correctly out of W1a.
- `people_directory` is untouched: 12 columns, identical list, and its readers
  (`use-people.ts` and ~20 designer-portal components) are unaffected.
- 00593's backfill sets `owner_type` from `studio_contacts.entity_kind` in (a)
  and (b) and hard-codes `'person'` behind an `entity_kind = 'person'` join in
  (c) and (d), so the backfill itself cannot produce the m-7 mismatch.

---

## 6. Probe scripts

Written to the session scratchpad, not to the repo:
`$TMPDIR/r2/probe1.sql` (B-2), `$TMPDIR/r2/probe2.sql` (m-2…m-8 recheck),
`$TMPDIR/r2/probe3.sql` (B-1), `$TMPDIR/r2/r2_gate.test.ts` (B-3).
Each SQL probe is one `BEGIN … ROLLBACK`; the Deno probe imports the repo's own
`sendPartySms` and `createFakeSupabase` by absolute path and touches no
database. Nothing was left behind in the worktree.
