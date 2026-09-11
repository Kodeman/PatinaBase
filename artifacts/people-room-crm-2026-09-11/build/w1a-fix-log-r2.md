# W1a — round 2 review fixes: B-1, B-2, B-3, M-1, M-2, M-3

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, on top of `c4ca5b9f1`.

Local Supabase only. No `supabase db push`, no `supabase functions deploy`, no
Strata contact, no `.env.local` repoint — `apps/designer-portal/.env.local` does
not exist in this worktree (checked before the reset):

```
$ ls -la .../apps/designer-portal/.env.local
"…/apps/designer-portal/.env.local": No such file or directory (os error 2)
```

Files touched:

```
supabase/migrations/00593_studio_contact_channels.sql
supabase/migrations/00594_studio_channel_consent.sql
supabase/functions/_shared/sms.ts
supabase/functions/_shared/sms.test.ts
supabase/functions/sms-inbound/pipeline.ts
supabase/functions/_tests/sms-inbound.test.ts
supabase/tests/people/w1a_identity_channels_consent_test.sql
supabase/seed/00-legacy-grants.sql        (regenerated, never hand-edited)
packages/supabase/src/database.types.ts   (regenerated)
artifacts/people-room-crm-2026-09-11/build/w1a-report.md
```

---

## B-1 — the mirror fired a second, unguarded AFTER trigger that sends real SMS

**What changed.** 00594 now redefines **both** of `project_parties`' outward-facing
AFTER-row trigger functions, each grafted from its grep-winner body verbatim
plus one first-statement guard, and they read one shared flag renamed to say
what it means:

| Redefined | Lineage (grep-winner) | Delta |
|---|---|---|
| `public.fc_dispatch_optin_invite()` | `00432_twilio_activation_hardening.sql:27-68` (trigger `fc_optin_invite_dispatch`, `00284:254-257`) | guard only |
| `public._site_request_consent_granted_dispatch()` | `00374_field_site_request_loop.sql:3399-3444` (trigger `site_request_consent_granted_dispatch`, `00374:3446-3455`, untouched) | guard only |

`patina.suppress_optin_dispatch` → `patina.suppress_consent_dispatch` (6 call
sites in 00594, 1 in the SQL test). And the invariant is now on the table, so
the third such trigger cannot land unguarded — 00212:46's own text preserved and
appended to:

```
$ psql … -Atc "select obj_description('public.project_parties'::regclass,'pg_class');"
Track 5 coordination courts (R46): … (00212). sms_consent_* is a READ-ONLY CACHED
MIRROR of studio_channel_consent since 00594, maintained by
mirror_channel_consent_to_parties(). INVARIANT: any AFTER-row trigger added to this
table that reaches outside the transaction (an SMS, an email, an edge invocation,
durable dispatch work) MUST stand down when
current_setting('patina.suppress_consent_dispatch', true) = '1' — that flag marks a
mirror write, which is cache maintenance of a verdict already decided, never a studio
act. Guarded so far: fc_dispatch_optin_invite, _site_request_consent_granted_dispatch.
```

**Lineage diff, run.** The graft is the 00374 body plus the guard, nothing else:

```
$ sed -n '3399,3444p' 00374_field_site_request_loop.sql > a.sql
$ sed -n '/^CREATE OR REPLACE FUNCTION public._site_request_consent_granted_dispatch/,/^\$\$;$/p' \
      00594_studio_channel_consent.sql > b.sql
$ diff a.sql b.sql
10a11,17
>   -- 00594: the mirror is maintaining the cached copy of a consent record that
>   -- was already decided elsewhere. Mirroring a verdict is not asking for one,
>   -- and it is not the moment a trade learns there is work waiting.
>   IF COALESCE(current_setting('patina.suppress_consent_dispatch', true), '') = '1' THEN
>     RETURN NEW;
>   END IF;
>
```

And the first one still diffs clean against 00432 after the rename:

```
$ sed -n '27,68p' 00432_twilio_activation_hardening.sql > c.sql
$ sed -n '/^CREATE OR REPLACE FUNCTION public.fc_dispatch_optin_invite/,/^\$\$;$/p' \
      00594_studio_channel_consent.sql > d.sql
$ diff c.sql d.sql
7a8,13
>   -- 00594: the mirror is maintaining the cached copy of a consent record that
>   -- was already decided elsewhere. Mirroring a verdict is not asking for one.
>   IF COALESCE(current_setting('patina.suppress_consent_dispatch', true), '') = '1' THEN
>     RETURN NEW;
>   END IF;
>
```

**Evidence — A/B on the reviewer's own reproduction.** Two seats for one human on
one number, one `awaiting_consent` site request each, `public.invoke_edge_function`
stood in for, all inside a rolled-back transaction. One studio act:
`record_channel_consent(org,'sms','(612) 555-0155','granted','written','Signed
kickoff form','field-sms-v1',NULL)`.

With 00594's guard **stripped** (the 00374 body as it stood at `c4ca5b9f1`):

```
        fn_name        |     action      |              request_id
-----------------------+-----------------+--------------------------------------
 site-request-dispatch | consent-granted | a1000000-0000-4000-8000-0000000000f1
 site-request-dispatch | consent-granted | a1000000-0000-4000-8000-0000000000f2

 site_request_dispatches
-------------------------
                       2
```

With the guard **in place**, same transaction shape, same one call:

```
 fn_name | action | request_id
---------+--------+------------
(0 rows)

 site_request_dispatches
-------------------------
                       0
```

**Regression test.** New block 8 in
`supabase/tests/people/w1a_identity_channels_consent_test.sql`: the mirrored
grant dispatches nothing (8b) and mints no durable dispatch work — both requests
still `awaiting_consent` with `consent_status_snapshot <> 'granted'` (8c) —
while a designer flipping a party row to `granted` DIRECTLY still dispatches
once and releases its request (8d, the live-rail control), and the flag does not
outlive the mirror's statement (8e).

---

## B-2 — `record_channel_consent` had no transition guard and no evidence requirement

**What changed**, all in 00594 (the table is unpushed):

1. **Evidence is required.** `pending`/`granted` need `p_source` + `p_evidence` +
   `p_disclosure_version`; `opted_out` needs `p_source` + `p_evidence` (PR-m: a
   verbal STOP the studio heard is a real record and has to say who heard it).
   Error `consent_evidence_required`.
2. **Nothing leaves `opted_out` through this door** — not to `granted`, not to
   `pending`, not to `not_asked` (which would erase the only stored record of
   the refusal, exactly what `use-coordination.ts:519-522` refuses to do). The
   prior status is read `FOR UPDATE`, so two members cannot race past it. Error
   `channel_opted_out`, with a HINT naming the way back.
3. **No laundering.** `source` / `evidence` / `disclosure_version` are
   `COALESCE`d forward only on a re-record of the SAME status; on a status
   change the new values are written as given (NULL included). Dates still
   survive a verdict that does not restate them (R-Q).
4. **PR-m's way back has its own named door**, `record_channel_reconsent(...)`:
   requires all three evidence arguments, refuses unless the record is currently
   `opted_out` (`no_opt_out_to_supersede`), lands on **`pending`** — never
   `granted`, which stays the recipient's to give by YES/START — and keeps
   `opt_out_at` so the refusal it superseded stays printable.
   `REVOKE … FROM PUBLIC, anon`; `GRANT EXECUTE … TO authenticated, service_role`.

**Not taken:** the review's optional fourth suggestion, capping the sms RPC at
`pending` outright. That would retire the `allow` branch r1's M5 exists for and
fixture F-11 needs (a studio holding auditable prior express written consent for
a number whose new seat starts `not_asked`). The evidence requirement is the bar
that was missing; the cap would have removed a capability the wave deliberately
built. Recorded here so the next reviewer can overrule it knowingly.

**Evidence — the review's own reproduction, replayed.** A record folded from a
real inbound STOP:

```
 folded
--------
      1

  status   |       opt_out_at       |   source    |   evidence
-----------+------------------------+-------------+--------------
 opted_out | 2025-12-03 00:00:00+00 | inbound_sms | Replied STOP
```

The four-argument flip, as an active member of that studio:

```
SELECT (public.record_channel_consent(
  'b0000000-0000-4000-8000-0000000000e1','sms','6125550177','granted')).status;

ERROR:  consent_evidence_required
HINT:  pending and granted need a source, the evidence in words, and the
       disclosure version the person was shown.
```

And with every argument supplied, so the gate is the transition, not the
paperwork:

```
SELECT (public.record_channel_consent(
  'b0000000-0000-4000-8000-0000000000e1','sms','6125550177','granted',
  'written','Signed 2026 form','field-sms-v1',NULL)).status;

ERROR:  channel_opted_out
HINT:  This number or address already opted out. Only they can rejoin by replying
       START, or the studio can record a fresh consent through
       record_channel_reconsent().
```

**Regression tests.** Block 9 (ten assertions): a bare grant, a `pending` with no
disclosure version and a bare `opted_out` are all refused
(`consent_evidence_required`); a grant followed by a status change with nothing
supplied leaves `source`/`evidence`/`disclosure_version` NULL while
`consented_at` survives (9d — the laundering proof, inverted); `opted_out →
not_asked` and `opted_out → pending` both refused (9e/9e2); a same-status
re-record of the refusal restates its own words (9f); reconsent needs the full
set (9g), lands on `pending` keeping `opt_out_at` (9h), refuses with no refusal
on the books (9i), and refuses a non-member (9j). Block 4 was rewritten around
the gate: `opted_out → granted` through the ordinary door is now the assertion,
and the named door carries the record to `pending` on the SAME row.

---

## B-3 — a stale `granted` record could override an opted-out party row, and a STOP could not reach a seatless record

Two halves, both fixed.

**(a) `channelConsentVerdict` no longer treats a record as self-certifying**
(`supabase/functions/_shared/sms.ts`). When a record exists: `opted_out` →
refuse, as before; then a scan for any party row on this number **belonging to
the same studio** that says `opted_out` → refuse; only then `granted` → allow.

The scan is **studio-scoped, not phone-global** — deliberately, and this departs
from the finding's literal wording. `optOutAllForPhone` writes party rows
phone-globally on every inbound STOP, so a phone-global scan would refuse every
studio's send after any one studio's STOP: G-3 in full, the bug the whole table
exists to fix. Scoping it to the owning studio blocks exactly the drift the
finding proved (a refusal recorded on this studio's own rows, by the portal's
still-live direct writes or by a STOP, after the record was written) and leaves
the cross-studio case alone. New `orgsOfProjects()` resolves the org with the
same `COALESCE(studio_id, _primary_studio_for(designer_id))` the SQL side uses,
and is exported so `pipeline.ts` uses the one resolver too.

**(b) a STOP now reaches every record on the number, seat or no seat**
(`supabase/functions/sms-inbound/pipeline.ts`). New `studiosHoldingRecord(phone,
onlyStatuses?)` reads `studio_channel_consent` directly;
`withRecordOnlyStudios()` unions those orgs onto the seat-derived targets with
`projectId: null`. STOP unions **all** record-holding studios. START unions only
those whose record is currently `opted_out` — it lifts the refusals it mirrors
and does not manufacture a grant for a studio whose record never left
`not_asked`. `YES` unions nothing: it confirms only the studios that invited
(r1 M6 unchanged).

**Evidence.**

```
$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/sms.test.ts
a stale granted record does not carry a send past this studio's own STOP ... ok
another studio's opted-out party row does not block this studio's granted record ... ok
the stale-record scan resolves a NULL-studio_id project through _primary_studio_for ... ok
ok | 22 passed | 0 failed (39ms)

$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_tests/sms-inbound.test.ts
STOP reaches a studio that holds a consent record but no party row ... ok
START lifts a seatless opted_out record but leaves a seatless not_asked one alone ... ok
a STOP re-homes origin_project_id onto the job it came from ... ok
ok | 29 passed | 0 failed (29ms)
```

The first test is the reviewer's R2-A input exactly — party `p1` `not_asked`,
sibling `p2` `opted_out` in the same studio, record `granted` — and the send now
returns `{sent:false, reason:"opted_out"}` where it returned `{"sent":true}`.
The second is the guard against over-correcting: Beta's opted-out party row must
not silence Alpha.

---

## M-1 — the mirror suppressed every evidence update, not just a re-fire

**What changed.** `mirror_channel_consent_to_parties()`'s row filter is now the
whole cached tuple:

```sql
AND (pp.sms_consent_status, pp.sms_consented_at, pp.sms_opt_out_at,
     pp.sms_consent_source, pp.sms_consent_evidence,
     pp.sms_consent_recorded_at, pp.sms_consent_disclosure_version,
     pp.sms_consent_recorded_by)
    IS DISTINCT FROM
    (NEW.status, NEW.consented_at, NEW.opt_out_at,
     NEW.source, NEW.evidence,
     NEW.recorded_at, NEW.disclosure_version, NEW.recorded_by);
```

Re-firing is held off by `patina.suppress_consent_dispatch` (B-1), so the narrow
status test was no longer load-bearing — it was only preventing the cache from
ever being right about the audit half of the record.

**Regression test.** Block 10: a same-status re-record with different words
reaches both seats (`sms_consent_source='verbal'`,
`sms_consent_evidence='Said yes on site'`, `recorded_at NOT NULL` — 2 rows), and
a whole-table assertion that **no** party row anywhere sits at `granted` with a
NULL source, NULL `recorded_at` or blank evidence (10b).

---

## M-2 — the report denied the lineage rule applied, and carried the pre-fix transcripts

`artifacts/people-room-crm-2026-09-11/build/w1a-report.md` updated:

- §1 prose: *"No function was redefined, so there is no lineage to graft."* is
  gone, replaced by a lineage table naming both redefinitions
  (`fc_dispatch_optin_invite` ← `00432:27-68`,
  `_site_request_consent_granted_dispatch` ← `00374:3399-3444`), their triggers,
  and the exact delta; plus the `COMMENT ON TABLE project_parties` lineage
  (`00212:46`). The "every other object is new" claim is kept and now lists the
  names it covers.
- §1 table: the 00594 row names both redefinitions, `record_channel_reconsent`
  and the table comment; the 00593 row names `normalize_channel_value`.
- §1 edge-function bullets: `channelConsentRefuses()` → `channelConsentVerdict()`
  with the stale-record scan, and the pipeline bullet now describes
  `studiosHoldingRecord`/`withRecordOnlyStudios` and the origin rule.
- §2 decisions 8, 10 and 11 corrected (tuple guard; the org fallback is on both
  sides; one shared normaliser), and a new decision 12 states the transition
  gate, the named reconsent door, and the one suggestion deliberately not taken.
- §3 function table re-pasted from this run (10 rows, `anon_exec` false on every
  one), plus the `pg_get_functiondef` probe showing both AFTER triggers read the
  guard and the full `project_parties` trigger list.
- §3 SQL transcript re-pasted: blocks 1–11, `All W1a assertions passed.`
- §3 Deno counts re-pasted: 22 / 29 / **674 passed, 1 pre-existing failure**
  (was 16 / 24 / 663), with the `_tests/sms-inbound.test.ts` path noted.
- §3 generated types: 461 insertions against the wave's base `700261663`, and
  the new function types named.
- §5: the backfill-re-run safety claim now names both suppressed triggers.

---

## M-3 — the two writers disagreed on origin, and the two normalisations were not the same rule

**Half 1 — origin.** One rule, both writers: **the origin follows the current
verdict.** `record_channel_consent` already did
(`COALESCE(EXCLUDED.origin_project_id, scc.origin_project_id)`);
`pipeline.ts:288` was `prior.origin_project_id ?? t.projectId` and is now
`t.projectId ?? prior.origin_project_id ?? null`. R-Q's sentence reads off this
column, so a STOP now names the job the STOP came from, not the job an older
grant came from. Tested both ways: `a STOP re-homes origin_project_id onto the
job it came from` (deno), and block 11b/11b2 in SQL — a supplied origin wins, an
unnamed one keeps what stands.

**Half 2 — normalisation.** The rule now exists once, as
`public.normalize_channel_value(channel_kind, value)`, created in **00593** (so
it is in place before 00594 runs) and called by both
`normalize_studio_contact_channel()` and the two consent RPCs. It keeps 00593's
behaviour exactly — E.164 for phone kinds, falling back to the trimmed raw text
when unparseable; `lower(btrim(...))` for `email`/`ap_email`; trimmed raw for
`portal_311` — so an unparseable phone now gets a channel row **and** a consent
record on the same key. `00594:369-370`'s "the same normalisation" is a fact
rather than a claim.

`IMMUTABLE`, `SET search_path TO 'public'`, `REVOKE … FROM PUBLIC, anon`,
`GRANT EXECUTE … TO authenticated, service_role`.

**Regression test.** Block 11a: the channel row from block 2d holds `'ext 411'`;
`record_channel_consent(org,'sms','  ext 411 ','granted', …)` now lands a record
whose `channel_value` equals that same `studio_contact_channels.value`.

---

## Verification, in full

Before the first reset, `apps/designer-portal/.env.local` confirmed absent (see
head of this file). Local stack only.

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2623 replayed statements
$ git diff supabase/seed/00-legacy-grants.sql
  +4 DO-blocks: REVOKE/GRANT on normalize_channel_value(text,text) [00593]
                REVOKE/GRANT on record_channel_reconsent(uuid,text,text,text,text,text,uuid) [00594]

$ pnpm --dir …/agent-people-build supabase:reset
Applying migration 00592_people_cards_affiliations_rules.sql...
Applying migration 00593_studio_contact_channels.sql...
Applying migration 00594_studio_channel_consent.sql...
Applying migration 20260910152111_create_contact_messages.sql...
Seeding data from supabase/seed/00-legacy-grants.sql... (+28 more)
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}

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
exit=0

# idempotency: all three files re-executed TWICE MORE over the migrated DB,
# in one rolled-back transaction
$ psql … -v ON_ERROR_STOP=1 -f idem.sql ; echo exit=$?
exit=0
$ grep -icE "^ERROR|^psql.*ERROR" idem.out
0
 ### pass 1 / backfill_channel_consent_from_parties
 ### pass 2 / backfill_channel_consent_from_parties
ROLLBACK

$ deno check --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.ts supabase/functions/sms-inbound/pipeline.ts
Check supabase/functions/_shared/sms.ts
Check supabase/functions/sms-inbound/pipeline.ts

$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/sms.test.ts
ok | 22 passed | 0 failed (39ms)
$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_tests/sms-inbound.test.ts
ok | 29 passed | 0 failed (29ms)
$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_tests/ supabase/functions/_shared/
FAILED | 674 passed | 1 failed (3s)
  ./supabase/functions/_tests/stripe-rail.test.ts (uncaught error)   ← pre-existing,
  wants _tests/test.env; unchanged from r1/r2 (663 → 668 → 674 passed)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate
$ git diff --stat packages/supabase/src/database.types.ts
 packages/supabase/src/database.types.ts | 37 +++++++++++++++++++++++++++++++++
 1 file changed, 37 insertions(+)
   → exactly normalize_channel_value + record_channel_reconsent. Nothing else.

$ pnpm --filter @patina/supabase type-check          (exit 0, no output)
$ pnpm --filter @patina/designer-portal type-check   (exit 0, no output)
```

Object probe after the reset:

```
                proname                 | prosecdef |            proconfig            | anon_exec | auth_exec
----------------------------------------+-----------+---------------------------------+-----------+-----------
 _site_request_consent_granted_dispatch | t         | {search_path=public}            | f         | f
 backfill_channel_consent_from_parties  | t         | {search_path=public}            | f         | f
 fc_dispatch_optin_invite               | t         | {search_path=public}            | f         | t
 mirror_channel_consent_to_parties      | t         | {search_path=public}            | f         | t
 normalize_channel_value                | f         | {search_path=public}            | f         | t
 normalize_studio_contact_channel       | f         | {"search_path=public, pg_temp"} | f         | t
 record_channel_consent                 | t         | {search_path=public}            | f         | t
 record_channel_reconsent               | t         | {search_path=public}            | f         | t

$ psql … "select p.proname … pg_get_functiondef(p.oid) like '%patina.suppress_consent_dispatch%'"
_site_request_consent_granted_dispatch
fc_dispatch_optin_invite
mirror_channel_consent_to_parties
```

## Deploy note carried forward

`_shared/sms.ts` changed again, so the four importers still all redeploy together
(`sms-dispatch`, `site-request-dispatch`, `field-daily`, `sms-inbound`) — and
**migrations before functions**: `channelConsentVerdict`'s stale-record scan and
`studiosHoldingRecord` read `studio_channel_consent`, which does not exist until
00594 lands.
