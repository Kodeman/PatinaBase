# W1a close-out — fix log, round 5

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, baseline `d9de5b04a`
(`docs(people-room): w1a close-out adversarial migration review r5`). Local
Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`, this
wave's sole owner). **No prod act of any kind** — no `supabase db push`, no
`supabase functions deploy`, no Strata connection.

**Scope: the two non-minor findings of `w1a-close-review-r5-migrations.md`
(BLOCKING-1, MAJOR-1) and nothing else.** The five fresh MINORs (A–E) and the
24 carried MINORs are deliberately untouched and stay open.

`.env.local` checked before the reset (sandbox disabled for that one grep):

```
$ grep -n NEXT_PUBLIC_SUPABASE_URL /Users/kody/Code/patina-merged/apps/designer-portal/.env.local
1:# prod # NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co
14:# prod # NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
19:NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
$ ls .codex/worktrees/agent-people-build/apps/designer-portal/.env.local
No such file or directory          # the worktree has none; the repo root's is the one read
$ ps -Ao pid,ppid,command | grep -iE "supabase:reset|supabase db reset" | grep -v grep
(no rows)
```

---

## BLOCKING-1 — a STOP on a project no studio can be resolved for

**Taken: the third of the report's three options**, the one the review named as
"the narrowest close that decides no policy". `studiosHoldingPhone()` now
reports a second flag, and the STOP gate checks it.

### What changed

`supabase/functions/sms-inbound/pipeline.ts`

- `studiosHoldingPhone()` returns `{ targets, failed, unattributed }`.
  `unattributed` is raised when a party's project resolved to **no studio at
  all** — the `if (!org) continue` branch, which until now was silent. It is a
  different fact from `failed` (a read errored), exactly as the review asked,
  and it logs on its own line
  (`studiosHoldingPhone: some seats belong to no studio at all`).
- The STOP branch's gate is now five terms, not four:
  `stopPhoneParties.failed || stopRecordStudios.failed || stopPartyOrgs.failed ||
  stopPartyOrgs.unattributed || stopWrite.failed` → `500 /
  opt_out_incomplete`, with `twilio_sid` cleared first so Twilio's retry runs
  the branch again instead of being answered `duplicate`. The log object gains
  `partyOrgUnattributed`.
- START is deliberately **not** gated on the new flag, and the reason is stated
  where the branch says why it does not gate on `failed`: a studio-less seat can
  hold no record, so there is no refusal for a START to lift and nothing is lost
  by granting nobody.
- The docblock says what the loss was, end to end: fold skipped (`WHERE org IS
  NOT NULL`) → no record → no target → `writeChannelConsent` loops zero times →
  200 with the claim kept → the next send reads `unknown` on
  `channelConsentVerdict`'s no-studio branch and the frozen `granted` seat
  carries both the `field-daily` cron and `sendPartySms`'s legacy leg.

### What did NOT change, and why

The **send** fail-open is untouched. There is no studio for the rail to write a
verdict for, so nothing inside 00594/00621 or this rail can record one; closing
the send means either refusing every unattributable send outright or giving
those projects a studio, and both are policy. That half stays Fable's ruling and
is named as such in the report (§5.2 bullet 3, §8).

### Evidence

```
$ deno test --no-check -A --node-modules-dir=auto --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts \
    supabase/functions/_tests/field-daily.test.ts
a STOP on a project no studio can be resolved for is not acknowledged ... ok (1ms)
the same STOP is acknowledged once a studio resolves for the project ... ok (0ms)
a START on a project no studio can be resolved for still answers 200 and grants nobody ... ok (0ms)
ok | 103 passed | 0 failed (366ms)
```

Three tests, in `supabase/functions/_tests/sms-inbound.test.ts`:

1. the finding's own shape — `studio_id IS NULL`, a designer with no
   `organization_members` row, one frozen `granted` seat: **500 /
   `opt_out_incomplete`**, zero `studio_channel_consent` rows written, the seat
   still `granted` (no second copy), the inbound row kept with `twilio_sid =
   null`;
2. the control — the same fixture plus an active owner membership: **200 /
   `opted_out`**, one record for `org-alpha`. So the 500 is the flag, not the
   fixture;
3. START on the same studio-less shape: **200 / `resubscribed`**, zero records —
   no manufactured grant.

---

## MAJOR-1 — a phone-only UPDATE transplanted a frozen `opted_out` refusal

Closed **in the database**, in 00594's own trigger, as the review prescribed.
00594 is unapplied on prod (local head is `00621`, nothing pushed), so it is
edited in place; the grep rule confirms 00594 is the sole definer:

```
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*refuse_legacy_consent_write" supabase/migrations/*.sql | sort | tail -1
supabase/migrations/00594_studio_channel_consent.sql
$ grep -rln "refuse_legacy_consent_write_trg" supabase/migrations/*.sql | sort
supabase/migrations/00594_studio_channel_consent.sql
```

### What changed

`supabase/migrations/00594_studio_channel_consent.sql`

- `refuse_legacy_consent_write_trg`'s `BEFORE UPDATE OF` list gains **`phone,
  phone_e164`** beside the eight consent columns, with the reason inline.
- `refuse_legacy_consent_write()` gains one clause after the eight-column one:
  raise `consent_opted_out_phone_frozen` when `OLD.sms_consent_status =
  'opted_out'` **AND** `NEW.phone_e164 IS DISTINCT FROM OLD.phone_e164`, with
  the portal hook's `OPTED_OUT_PHONE_EDIT_SENTENCE` verbatim as the `HINT`.
- The function COMMENT and §3's narrative say so.

Ordering is load-bearing and is stated in the comment: 00281's trigger is named
`normalize_phone_project_parties`, which sorts before
`refuse_legacy_consent_write_trg`, so `normalize_party_phone_e164()` has already
derived `NEW.phone_e164` from `NEW.phone` when the comparison runs. A cosmetic
reformat is therefore not a change.

### Evidence — the review's own P5b probe, re-run

One rolled-back transaction, probing objects and one fixture, never the ledger
(`/tmp/claude/probe-r5fix.sql`):

```
BEGIN
NOTICE:  P5b AFTER FIX: phone-only UPDATE on an opted_out seat -> consent_opted_out_phone_frozen  (number now +16125550302)
NOTICE:  P5b HINT: This person replied STOP, and that refusal is attached to the number on file. Changing it would carry the refusal onto a number that never refused. Add them again with the corrected number instead.
ROLLBACK
```

Before the fix the same probe printed
`LANDED (freeze did not fire) (now +16125550399 / opted_out)`.

And the trigger's column list, read from the catalog after a clean reset:

```
$ psql … -At -c "select a.attname from pg_trigger tg
                   join pg_class c ON c.oid = tg.tgrelid
                   join pg_attribute a ON a.attrelid = tg.tgrelid
                                      AND a.attnum = ANY(tg.tgattr::int2[])
                  where c.relname='project_parties'
                    and tg.tgname='refuse_legacy_consent_write_trg'
                  order by a.attname;"
phone
phone_e164
sms_consent_disclosure_version
sms_consent_evidence
sms_consent_recorded_at
sms_consent_recorded_by
sms_consent_source
sms_consent_status
sms_consented_at
sms_opt_out_at
```

### SQL test block 43, in the shape of block 13

`supabase/tests/people/w1a_identity_channels_consent_test.sql`, seven legs:

| Leg | Asserts |
|---|---|
| 43a | the exploit shape — `UPDATE … SET phone = …` on an `opted_out` seat, naming no frozen column — raises `consent_opted_out_phone_frozen` |
| 43a2/43a3 | writing `phone_e164` DIRECTLY is **inert, not refused**: 00281's normalizer re-derives it from the unchanged `phone`, so the number is back at `+16125550801` and there was no change to refuse. Asserted rather than assumed — it is why 43a is the only door |
| 43b | the refused writes leave the number alone |
| 43c/43c2 | a cosmetic reformat (`612.555.0801`) plus a `display_name` change still lands, and the normalized number is unchanged |
| 43d/43d2/43d3 | every legitimate edit is untouched: a `not_asked` seat's number moves, a `granted` seat's moves, and an unrelated edit on the refused seat does not even fire the trigger |
| 43e/43e2 | `app.consent_legacy_write = 'on'` still opens the repair door, and closes again with the statement that opened it |
| 43f | the refusal carries the written sentence (`replied STOP` / `never refused` / `corrected number`) in `PG_EXCEPTION_HINT`, so a client that is not the party sheet has something to print |
| 43g/43g2 | the guard is on the TRIGGER's column list, not only in the body: both phone columns are named (2) and the eight are still there (8) |

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
PSQL_EXIT=0
45                                  # lines matching ": passed"
NOTICE:  43. an opted_out seat's number cannot move, and every other phone edit still can (close-out r5 MAJOR-1): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

The first run of block 43 FAILED at 43a2 (`a direct phone_e164 write must be
refused too, got <no error>`), which is how the normalizer's precedence was
established rather than assumed; the assertion now states the true fact.

`packages/supabase/src/hooks/use-coordination.ts` is **not** touched: the hook
still refuses before the UPDATE, so the portal's sentence is unchanged and the
DB clause is the backstop for every other client.

---

## Gates, all of them

```
$ pnpm --dir …/agent-people-build supabase:reset
RESET_EXIT=0
$ grep -icE "^error|failed" reset log → 0
Finished supabase db reset on branch main.
$ psql … -At -c "select version from supabase_migrations.schema_migrations order by version desc limit 4;"
20260910152111 / 00621 / 00594 / 00593

$ psql … -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
PSQL_EXIT=0, 45 ": passed", "All W1a assertions passed.", no ERROR|FAIL line

--- replay 00594_studio_channel_consent   --- EXIT=0 errors=0
--- replay 00621_consent_readers_repointed --- EXIT=0 errors=0

$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2644 replayed statements
$ diff -u <before> supabase/seed/00-legacy-grants.sql → (no output)
$ git status --porcelain supabase/seed/00-legacy-grants.sql → (clean)
   # no GRANT/REVOKE moved: the REVOKE on refuse_legacy_consent_write() is unchanged

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm --dir … db:generate
GEN_EXIT=0
$ diff -u <before> packages/supabase/src/database.types.ts → (no output)   # no drift
37486 packages/supabase/src/database.types.ts

$ deno test --no-check -A --node-modules-dir=auto --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts \
    supabase/functions/_tests/field-daily.test.ts
ok | 103 passed | 0 failed (366ms)
$ ls deno.lock → No such file or directory
```

No package under `packages/` or `apps/` changed, so no portal gate applies.

---

## Migration rules, for the two edited files

| Rule | This pass |
|---|---|
| hand-numbered `NNNNN_slug.sql` | no new migration — 00594 is unapplied on prod and edited in place, which the brief permits |
| reserved 00595–00620 | untouched; 00621 unchanged in number; W1b still mints from 00622 |
| grep-winner before redefining a function | run, pasted above: 00594 is the sole definer of `refuse_legacy_consent_write()` and the sole creator of its trigger, so the edit IS the lineage |
| banner + lineage | §3's narrative gains the phone clause; the function body, the trigger's column list and the function COMMENT each name close-out r5 MAJOR-1 and the reason |
| idempotent | `CREATE OR REPLACE FUNCTION` + `DROP TRIGGER IF EXISTS` / `CREATE TRIGGER` as before; replay clean |
| RLS in the same file | no table or policy touched |
| grants both directions + REVOKE FROM PUBLIC, anon | unchanged (`REVOKE ALL ON FUNCTION public.refuse_legacy_consent_write() FROM PUBLIC, anon` already stood); legacy-grants seed regenerates byte-identical |
| SECURITY DEFINER pins search_path | the freeze function is not a definer (trigger, invoker) and keeps `SET search_path TO 'public'` |
| schema-qualify extension fns | none called |
| guarded crons / CHECK over enum / money cents | N/A |
| probe objects, never the ledger | catalog reads plus one `BEGIN … ROLLBACK` fixture |

---

## Rulings recorded

`artifacts/people-room-crm-2026-09-11/rulings.md`:

- **R-AW** — a STOP that resolves to no studio at all is answered 500 /
  `opt_out_incomplete` with the claim released; `unattributed` is reported
  separately from `failed`; START is not gated on it; the SEND fail-open stays a
  policy ruling owed.
- **R-AX** — an `opted_out` seat's `phone_e164` cannot move; the rule lives in
  the freeze trigger, not only in the hook; a cosmetic reformat still lands and
  `app.consent_legacy_write` remains the one repair door.

## Report amendments

`build/w1a-report.md`: a round-5 line in the header; §5.2 bullet 1 gains the
database half of the phone freeze and drops "any future transplant done outside
the hook" from the remaining population; §5.2 bullet 3 gains **both room readers
print "Not asked" for that population while the rail still texts it** (the half
the review said was unstated) and records which of the three options was taken;
§8 separates the closed acknowledgement from the still-owed send policy; §6
gains a "close-out r5 fixes" evidence block with this round's real numbers.

## Still open, unchanged

The five fresh MINORs (A: 00621's dispatch gate lets a frozen `granted` seat
override a recorded refusal; B: the definer call inside the 30-second Desk poll;
C: the add path failing whole on `consent_awaiting_recipient`; D: `authenticated`
EXECUTE on the two trigger functions; E: the report's own stale counts) and the
24 carried MINORs are untouched by this pass.
