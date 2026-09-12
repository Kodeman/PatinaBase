# W1a close-out — fix log, round 3

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, starting HEAD `625c36c2c`
(`8132a1a20` + the r3 review docs). Local Postgres only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **No prod act of
any kind** — no `supabase db push`, no `supabase functions deploy`, no Strata
connection.

Scope: exactly the five findings handed over from
`w1a-close-review-r3-migrations.md` (MAJOR-1 … MAJOR-4) and
`w1a-close-review-r3-tests.md` (MAJOR-site-request-frozen-column). Nothing
else. The eighteen MINORs of that round are untouched.

Env check before any destructive local act (sandbox disabled for this one
read):

```
$ grep -n NEXT_PUBLIC_SUPABASE_URL /Users/kody/Code/patina-merged/apps/designer-portal/.env.local
1:# prod # NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co
14:# prod # NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
19:NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
```

Local. Not Strata.

---

## Summary

| Finding | Verdict | Where the fix lives |
|---|---|---|
| MAJOR-1 — `field_activity_summary.awaiting_reply_count` counts the frozen seat, and the Desk prints a false number today | **FIXED** (repointed, not merely owed) | `supabase/migrations/00621_consent_readers_repointed.sql` §1 · SQL test block 41 |
| MAJOR-2 — `field-daily` texts nobody the record granted | **FIXED** | `supabase/functions/field-daily/core.ts` (`mayTextField`) + `channelConsentVerdict` exported from `supabase/functions/_shared/sms.ts` · 6 new Deno tests |
| MAJOR-3 — 00284's two dispatch triggers gate on the frozen column | **FIXED** | `00621` §2a/§2b · SQL test block 42 |
| MAJOR-4 — a phone correction transplants a frozen refusal onto a number that never refused | **FIXED at the reachable door + population stated** | `packages/supabase/src/hooks/use-coordination.ts` (`useUpdateProjectParty`) · 3 new/rewritten hook tests · report §5.2 |
| MAJOR-site-request-frozen-column | **DISCLOSURE SHARPENED** (still W2's, as the finding itself asks) | report §5.1, §8 |

Migration numbering: `00595–00620` remain reserved for another program, so this
close-out mints **00621** and the report now says **W1b mints from 00622**.

---

## MAJOR-1 — the Desk rollup

`00282:578-582` counted `project_parties.sms_consent_status = 'pending'` for the
field kinds, and `field-desk.tsx:44-52` renders that as *"N parties haven't
opted in"*. After the freeze no consent act moves a seat, so the count could
never clear — the Call Sheet printed "Texting" and the Desk said the same person
had not opted in, off the same row.

The review offered either arm (repoint, or add to §5.1b's owed list) and said
this was "the only one a designer can see today, so it is the one that must not
ship as-is". Repointed.

Grep-winner first, as the rules require:

```
$ grep -rln "CREATE OR REPLACE VIEW[^(]*field_activity_summary" supabase/migrations/*.sql | sort | tail -1
supabase/migrations/00282_sms_core.sql
$ grep -rln "CREATE\( OR REPLACE\)\? VIEW[^(]*field_activity_summary" supabase/migrations/*.sql | sort
supabase/migrations/00282_sms_core.sql
```

One definition site. 00621 §1 grafts `00282:571-593` and changes one
expression:

```sql
-       AND pp.sms_consent_status = 'pending')            AS awaiting_reply_count,
+       AND public.channel_consent_status(
+             public.project_consent_org(pp.project_id),
+             'sms', pp.phone_e164) = 'pending')          AS awaiting_reply_count,
```

`NULL` (no record) correctly fails the test: a party nobody asked is not a party
awaiting a reply. The two 00282 GRANTs are restated verbatim and deliberately
NOT narrowed — `anon` holds creation-time-default privileges on this view on
every stack older than the 2026-05-30 flip, and revoking them would be a
posture change this close-out was not asked to make.

Object check after the reset:

```
$ psql … -At -c "select definition ilike '%channel_consent_status%' as reads_record,
                        definition ilike '%sms_consent_status%'     as reads_seat
                   from pg_views where viewname='field_activity_summary';"
t|f
```

No TypeScript change was needed: `use-field-activity.ts` and `field-desk.tsx`
already print whatever the view returns, and the copy was never wrong — the
number was.

---

## MAJOR-2 — `field-daily`

`core.ts:154-157` and `:251-255` both pre-filtered on the frozen seat before
`sendPartySms` was ever reached. The finding's own preferred shape is "the one
that cannot drift", so the filter now asks the send gate's own function.

`channelConsentVerdict` was module-private; it is now exported (one line plus
the reason in its docblock). `core.ts` gains `mayTextField()`:

```ts
if (verdict === "refuse") return false;
return verdict === "allow" || party.sms_consent_status === "granted";
```

- `"allow"` — the studio's own recorded grant with no refusing seat behind it.
  This is the branch that was unreachable through this caller.
- `"refuse"` — never texted, whichever ledger carries the refusal.
- `"unknown"` — no record yet (the fold has not reached this pair), so a
  pre-fold `granted` seat keeps its digest, which is exactly what
  `sendPartySms`'s own second, legacy gate still honours. Nothing regresses
  while both ledgers are live, and the pre-filter never widens what may be sent
  because `sendPartySms` re-runs the whole gate for real.

A refused party now increments `parties_skipped`, so a run that texts nobody
says why in its own summary instead of going quietly empty.

```
$ deno test --no-check -A --node-modules-dir=auto --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts \
    supabase/functions/_tests/field-daily.test.ts
ok | 96 passed | 0 failed (151ms)
```

Six new tests: the record grants while the seat says `pending` (digest sent); a
record that refuses; a `granted` record carrying an unanswered refusal; a party
nobody asked; a pre-fold `granted` seat with no record; and the delivery-confirm
filter, granted and refused.

**Negative control — the pre-fix core fails the new tests:**

```
$ git stash push -- supabase/functions/field-daily/core.ts
Saved working directory and index state WIP on build/people-room-crm-2026-09-11
$ deno test … --filter "MAJOR-2" supabase/functions/_tests/field-daily.test.ts
runFieldDaily digests a party the RECORD granted while the frozen seat still says pending (close-out r3 MAJOR-2) => …:236:6
runFieldDaily's delivery confirm follows the same record (MAJOR-2's second filter) => …:292:6
FAILED | 0 passed | 2 failed | 11 filtered out (4ms)
$ git stash pop
```

`_shared/sms.ts` is edited, so the deploy chain owes a redeploy of EVERY
importing function, not only `field-daily`. Stated in report §4 and §8.

---

## MAJOR-3 — 00284's two dispatch gates

```
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*fc_dispatch_court_assignment" supabase/migrations/*.sql | sort
supabase/migrations/00284_field_dispatch_wiring.sql
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*fc_dispatch_task_assignment" supabase/migrations/*.sql | sort
supabase/migrations/00284_field_dispatch_wiring.sql
```

One definition site each. 00621 §2a/§2b graft `00284:101-145` and `:160-203` and
change one condition each:

```sql
-     OR v_party.sms_consent_status <> 'granted' THEN
+     OR (NOT COALESCE(
+           public.channel_consent_status(
+             public.project_consent_org(NEW.project_id),
+             'sms', v_party.phone_e164) = 'granted',
+           false)
+         AND v_party.sms_consent_status <> 'granted') THEN
```

Everything else is byte-identical: both early returns, the party-kind filter,
the fire-and-forget `BEGIN/EXCEPTION` around `invoke_edge_function`, the
template key, the vars, the `REVOKE … FROM PUBLIC, anon`, and the two triggers
(untouched, so `DROP TRIGGER/CREATE TRIGGER` is not repeated — block 42 asserts
both are still wired).

Two decisions worth naming:

- **The seat leg stays.** `sendPartySms` is the authority on every message these
  triggers cause and it still honours a pre-fold `granted` seat. A gate reading
  the record ALONE would refuse dispatches the send rail itself would allow — a
  new silence in the name of fixing one.
- **`COALESCE(… , false)` is load-bearing.** `channel_consent_status()` returns
  NULL for "no record", and in plpgsql `IF … OR NOT (NULL) THEN RETURN NEW` is
  not taken, so without the COALESCE a party with no record would fall THROUGH
  the guard and dispatch. Block 42c is the negative control for exactly that.

Both gates remain SECURITY DEFINER with `search_path=public` pinned and closed
to `anon` (asserted, 42g3–42g5).

SQL test block 42 observes dispatches through `public._w1a_dispatch_log`, the
stand-in for `invoke_edge_function` that block 6 already installs for the length
of the (rolled-back) transaction. Asserted: a task assignment and a court
assignment to a party the record granted each dispatch once; an unasked party,
a recorded refusal and a non-field party dispatch nothing; a pre-fold `granted`
seat with no record still dispatches.

---

## MAJOR-4 — the transplanted refusal

`useUpdateProjectParty` reverted consent only for `pending`/`granted`, so on an
`opted_out` seat the UPDATE named only `phone`/`phone_e164`, the freeze never
fired, and the refusal rode onto the corrected number — where
`orgHasOptedOutParty()` and both write doors' seat gates read it while both
readers took the word from a record that knows nothing about it.

The fix is the smallest one the finding names: refuse the edit.

```ts
if (phoneGenuinelyChanged && currentStatus === 'opted_out') {
  throw new Error(OPTED_OUT_PHONE_EDIT_SENTENCE);
}
```

> This person replied STOP, and that refusal is attached to the number on file.
> Changing it would carry the refusal onto a number that never refused. Add them
> again with the corrected number instead.

Symmetry is the argument: a genuine phone change on a `pending`/`granted` seat
restates the consent columns and 00594's freeze refuses it — including a clear
to NULL — so a genuine phone change on an `opted_out` seat is refused here,
clear included. A cosmetic reformat of the same digits is not a change and still
lands (`normalizePartyPhoneForCompare` decides, as before).

```
$ pnpm --dir … --filter @patina/supabase test -- src/hooks/__tests__/use-update-project-party.test.ts
✓ src/hooks/__tests__/use-update-project-party.test.ts  (12 tests) 6ms
Test Files  1 passed (1)
     Tests  12 passed (12)
```

The old F3-R2-01 test asserted the edit LANDED with consent untouched; it is
rewritten to assert the refusal and that **no write is issued at all**
(`from` called once, `update` never). Two tests added: the cosmetic reformat
still lands, and the clear is refused too. One trap worth recording for the next
editor: `from.mockClear()` in `beforeEach` does not drain a leftover
`mockReturnValueOnce`, so a test that refuses before the write must queue
exactly one return or it poisons every test after it.

**Population stated** (report §5.2, beside the existing permanent-legacy-seat
bullet): seats already transplanted before this fix — any `opted_out` seat whose
`phone_e164` is not the number its `sms_opt_out_at`/evidence belongs to — plus
any future transplant done outside the hook (service_role, SQL, direct
PostgREST). Nothing on any surface names them; the durable fix is W2 retiring
PR-x's seat check, which `rulings.md` PR-x already contemplates.

---

## MAJOR-site-request-frozen-column

The finding says "No action needed for W1a itself; flagging so it isn't lost and
so 'the site-request rail is not released' (test 8c) is understood as strictly
worse than originally scoped". So: no code change, and the disclosure now says
the sharper thing.

Report §5.1 gains the paragraph that `site_request_send()` /
`site_request_resend()` / `site_request_dispatch_after_consent()` gate on the
frozen seat and that **no live writer can set a seat to `granted` any more**, so
resend and dispatch-after-consent can never succeed for any party created after
this wave — not "not released yet". It also names the fourth file the inventory
had missed,
`apps/mobile/Capture/Capture/Features/SiteRequests/SupabaseSiteRequestService.swift`
(`:17`, `:516`, `:524` — `smsConsentGranted: consentStatus == "granted"`), whose
badge will read FALSE for ever for a party whose consent the studio holds.
§8's owed list gains both.

---

## Verification, end to end

```
$ pnpm --dir .../agent-people-build supabase:reset      # pass 1
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
$ psql … -At -c "select version from supabase_migrations.schema_migrations order by version desc limit 3;"
20260910152111
00621
00594

$ (echo "BEGIN;"; cat supabase/migrations/00621_consent_readers_repointed.sql; echo "ROLLBACK;") | psql … -v ON_ERROR_STOP=1
BEGIN / CREATE VIEW / COMMENT / GRANT / GRANT / CREATE FUNCTION / REVOKE / COMMENT /
CREATE FUNCTION / REVOKE / COMMENT / ROLLBACK      REPLAY_EXIT=0

$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2644 replayed statements
# diff vs before: exactly four new statements, all 00621's —
#   GRANT SELECT ON public.field_activity_summary TO authenticated / service_role
#   REVOKE ALL ON FUNCTION public.fc_dispatch_court_assignment() FROM PUBLIC, anon
#   REVOKE ALL ON FUNCTION public.fc_dispatch_task_assignment()  FROM PUBLIC, anon

$ SUPABASE_DB_URL=… pnpm --dir … db:generate
$ git diff --stat packages/supabase/src/database.types.ts
(no output — no drift)

$ pnpm --dir .../agent-people-build supabase:reset      # pass 2
Finished supabase db reset on branch main.
$ psql … → 20260910152111 / 00621

$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
PSQL_EXIT=0
45 lines matching "passed"
the only ERROR|FAIL match is a block TITLE:
  "16B. a DATELESS refusal fails closed too (r4 B-1): passed"
NOTICE:  41. the Desk rollup counts the record's pending, not the frozen seat's,
         and agrees with the Call Sheet about the same person (close-out r3 MAJOR-1): passed
NOTICE:  42. the two 00284 dispatch gates reach a party the record granted, and still
         refuse an unasked, a refused and a non-field one (close-out r3 MAJOR-3): passed
NOTICE:  All W1a assertions passed.
ROLLBACK

$ psql … -f build/probe39-close-r3-fix-negative-control.sql
=== AFTER 00621 (what ships) ===
 desk_awaiting_reply_count_after_00621 = 1     counted = Nan Sorley
 dispatches_after_00621                = 2
=== BEFORE 00621 (the shipped objects) ===
 desk_awaiting_reply_count_before_00621 = 2    counted = Ove Berglund, Vi Odom
 dispatches_before_00621                = 0
 Ove Berglund | granted   ← the Desk was counting these two as "haven't opted in"
 Vi Odom      | granted
ROLLBACK

$ deno test … _shared/sms.test.ts _tests/sms-inbound.test.ts _tests/field-daily.test.ts
ok | 96 passed | 0 failed (151ms)
$ ls deno.lock → No such file or directory        # no stray root lockfile

$ pnpm --dir … --filter @patina/supabase test
Test Files  100 passed (100)
     Tests  1253 passed | 12 skipped (1265)

$ pnpm --dir … --filter @patina/supabase        type-check    # clean, no output
$ pnpm --dir … --filter @patina/designer-portal type-check    # clean, no output
```

## Files touched

```
supabase/migrations/00621_consent_readers_repointed.sql          (new)
supabase/seed/00-legacy-grants.sql                               (regenerated)
supabase/tests/people/w1a_identity_channels_consent_test.sql     (blocks 41, 42 + header)
supabase/functions/_shared/sms.ts                                (export channelConsentVerdict)
supabase/functions/field-daily/core.ts                           (mayTextField, both filters)
supabase/functions/_tests/field-daily.test.ts                    (6 new tests)
packages/supabase/src/hooks/use-coordination.ts                  (opted_out phone edit refused)
packages/supabase/src/hooks/__tests__/use-update-project-party.test.ts
artifacts/people-room-crm-2026-09-11/build/probe39-close-r3-fix-negative-control.sql (new)
artifacts/people-room-crm-2026-09-11/build/w1a-report.md         (§intro, 2.3b, 4, 5.1, 5.1b, 5.2, 6, 8)
artifacts/people-room-crm-2026-09-11/build/w1a-close-fix-log-r3.md (this file)
```

## Still open after this pass

The eighteen MINORs of close-out r3 (untouched, out of scope), the site-request
rail and everything else §5.1/§5.1b/§5.3/§8 assign to W2 or W1b, and the
unattributable-send fail-open that still needs Fable's ruling (§5.2). Nothing
deployed.
