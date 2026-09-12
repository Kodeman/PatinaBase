# W1a close-out — fix log, round 4

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, base HEAD `bb168fe6a`
(W1a commits through `6ea4e052d` plus the r1/r2/r3 close-out fix commits).
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`).
**No prod act of any kind** — no `supabase db push`, no `supabase functions
deploy`, no Strata connection.

Scope: the three non-minor findings of `w1a-close-review-r4-migrations.md`
(BLOCKING-1, MAJOR-1, MAJOR-2) and nothing else. The 24 MINORs are untouched.

Rulings in force for this round, recorded by Fable in
`artifacts/people-room-crm-2026-09-11/rulings.md`: **R-AT** (a STOP whose
attribution read failed is a 500 with the claim released), **R-AU** (START
targets are chosen by the verdict, not the raw status column), **R-AV** (Patina
Field reads consent from `v_project_roster.sms_consent_status`, never the frozen
party column).

---

## BLOCKING-1 — the fourth read the STOP gate did not ask about — FIXED

**Ruling applied:** R-AT.

`studiosHoldingPhone()` received `orgsOfProjects()`'s `failed`, logged it, and
returned `StudioTarget[]` — so the STOP branch's 500 gate checked three flags
and not the fourth. `orgsOfProjects()` returns an **empty** map when the
`projects` select errors, so a transient failure there is indistinguishable
from "no seat belongs to any studio": the refusal was written only for the
studios that happen to hold a RECORD on the number, Twilio got 200, and the
`twilio_sid` claim stood — so the retry answered `duplicate` and the branch
never ran again.

### What changed

`supabase/functions/sms-inbound/pipeline.ts`

- `studiosHoldingPhone()` now returns `{ targets: StudioTarget[]; failed: boolean }`.
- The STOP branch names the call (`stopPartyOrgs`) and gates on all four flags:

```ts
    if (
      stopPhoneParties.failed || stopRecordStudios.failed ||
      stopPartyOrgs.failed || stopWrite.failed
    ) {
```

  with `partyOrgReadFailed: stopPartyOrgs.failed` added to the error log.
- The three other call sites take `.targets` and are otherwise unchanged. START
  and YES deliberately do NOT gate on the flag — a short target list there
  grants FEWER studios, which leaves a standing refusal standing, and the
  branch comment says so.

### Tests added (`supabase/functions/_tests/sms-inbound.test.ts`)

- `a STOP whose studio-attribution read fails is not acknowledged, and the retry records the seat-only studio`
  — `denyTable(fake, "projects")` makes the attribution read error. org-alpha
  holds a seat and no record (the "text updates" unticked case); org-beta holds
  a record and no seat. Asserts 500 / `opt_out_incomplete`, that org-beta's
  write landed, that org-alpha has **no row at all** (the loss), that
  `twilio_sid` is cleared, and that the retry records both studios.
- `a STOP with a clean studio-attribution read records the seat-only studio and answers 200`
  — the control on the same fixture.

### Negative control

The fix reverted (the fourth flag removed from the disjunction), tests re-run:

```
$ python3 -  # remove `stopPartyOrgs.failed ||` from the STOP disjunction
NEG-A applied: stopPartyOrgs.failed removed from the STOP disjunction
$ deno test --no-check -A --node-modules-dir=auto \
    --config supabase/functions/deno.json supabase/functions/_tests/sms-inbound.test.ts
a STOP whose studio-attribution read fails is not acknowledged, and the retry
  records the seat-only studio ... FAILED (0ms)
FAILED | 46 passed | 1 failed (29ms)
```

Restored, and `diff` against the fixed copy is empty.

---

## MAJOR-1 — the START filter read the column where the room read the verdict — FIXED

**Ruling applied:** R-AU.

### What changed

`supabase/functions/sms-inbound/pipeline.ts`

- `studiosHoldingRecord()` selects `organization_id, status, refusal_unanswered`
  and filters on the **verdict**, through a new module-private
  `recordVerdict(row)` — `refusal_unanswered === true ? "opted_out" : status`,
  which is `channel_consent_status()` (`00594:948-956`) in TypeScript. The
  parameter is renamed `onlyStatuses` → `onlyVerdicts`; the START call site's
  `['opted_out','pending']` list is unchanged and now covers the fold's
  `granted + flag` and `not_asked + flag` shapes.
- R-AJ's narrowing is preserved by construction: a `not_asked` record with no
  refusal standing still reads `not_asked` and is still not a target.
- YES is untouched. It gates on a `project_parties` seat at `pending`, which no
  consent act can produce since the freeze — carried MINOR-10, owed to W2 with
  the rest of §5.1b. START is the recipient's door; YES is not.

### Documentation corrected, as the finding required

- `supabase/migrations/00594_studio_channel_consent.sql` — the
  `refusal_unanswered` column comment now says the door is a START and that it
  reaches the flag **by the verdict, not the status column**, names
  `recordVerdict`, and states that the YES leg is not that door (owed to W2).
  Migration is unapplied on prod, so edited in place.
- Same file — the `COMMENT ON FUNCTION public.channel_consent_status` now says
  the rail applies the same fold in TypeScript, so the START that lowers the
  flag reaches exactly the records the function calls `opted_out`.
- `build/w1a-report.md` §4 (`sms-inbound/pipeline.ts`) — two new paragraphs, one
  per finding, replacing the prose that was wrong about START.
- `build/w1a-report.md` §5.2 bullet 2 — "permanently unsendable until the
  recipient texts START" was **false when written** (no START reached that
  population). The bullet now says so, says the filter was corrected, and names
  the two residues W2 owes: an inbound YES cannot lower the flag either, and
  where the refusing seat itself reads `opted_out` bullet 1's frozen seat gate
  still refuses the send after the START has cleared the record.

### Tests added

- `START lifts an unanswered refusal standing on a record whose status column still says granted`
  — the r8 W4-M1 shape. Because the column already says `granted`, the proof the
  record was REACHED is `refusal_unanswered === false` plus the grant's own
  fresh `source='inbound_sms'` / `evidence='Inbound START'`; the refusal's
  `opt_out_at` / `opt_out_evidence` are asserted to survive (r8 W4-M2).
- `START lifts an unanswered refusal standing on a record whose status column says not_asked`
  — asserts `granted` + flag lowered.
- The negative control for R-AJ already exists and still passes:
  `START does not grant a seat-holding studio whose record never left not_asked`
  (a `not_asked` record with no flag).

### Negative control

```
$ python3 -  # .filter(... onlyVerdicts.includes(recordVerdict(r))) -> (r.status)
NEG-B applied: START filter reads the raw status column again
$ deno test --no-check -A --node-modules-dir=auto \
    --config supabase/functions/deno.json supabase/functions/_tests/sms-inbound.test.ts
START lifts an unanswered refusal standing on a record whose status column
  still says granted ... FAILED (0ms)
START lifts an unanswered refusal standing on a record whose status column
  says not_asked ... FAILED (0ms)
FAILED | 45 passed | 2 failed (32ms)
```

Restored, `diff` empty.

---

## MAJOR-2 — Patina Field's punch routing — option (a) taken, with the reason (b) was rejected

The finding offers **(a)** name `PunchCourtResolver` in §5.1b/§8 with the
`.noCourt` consequence, or **(b)** source `smsConsentGranted` from
`v_project_roster`, "one query change in SupabaseSiteRequestService".

**(b) is not one query change, and it must not land before W2's server side.**
Two pieces of evidence, both probed here:

1. `v_project_roster` has no `phone_e164`, and `PunchCourtResolver.resolve()`
   needs it beside the consent word (a party can be consented and unreachable —
   that is the second clause of the guard):

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -At -c \
   "select string_agg(column_name, ', ' order by ordinal_position)
      from information_schema.columns where table_name='v_project_roster';"
roster_id, source, project_id, kind, display_name, company_name, email, phone,
trade, job_title, staff_role, studio_contact_id, profile_id, show_to_client,
has_active_field_link, sms_consent_status, updated_at
```

   So (b) costs a migration appending `phone_e164` to both branches (no
   dependent views — probed `pg_depend`/`pg_rewrite`: empty — so
   `CREATE OR REPLACE` suffices), plus a `source='party'` filter and the
   `roster_id`/`kind` renames through `ProjectPartyRow`.

2. `ProjectPartyRow` feeds `assignee.smsConsentGranted` as well as
   `fieldParty.smsConsentGranted`, and the site-request RPCs are still on the
   seat: `site_request_send()` UPDATEs `project_parties.sms_consent_status` to
   `pending` (`00374:1265-1268`) — the write 00594 froze — and
   `site_request_resend()` / `site_request_dispatch_after_consent()` gate on
   `= 'granted'` (`00374:1364`, `:1424`). Repointing the client at the record on
   its own would make Patina Field show the assignee as consented and then take
   `consent_legacy_column_frozen` from the RPC it hands her to — louder and
   more confusing than today's uniformly-false badge.

R-AV names WHERE Field must read consent from, not which wave does it. It is
satisfied by scheduling Field's repoint with W2's site-request rail, which is
what the report now says. **If Fable wants (b) in this wave instead, the owed
work is: a migration (00622) appending `phone_e164` to `v_project_roster`, the
`ProjectPartyRow` repoint, and W2's three site-request RPCs moved off the seat
in the same chain — the three cannot be split.**

### What changed — disclosure, per (a)

`build/w1a-report.md`

- §5.1b's "rails that still read the frozen seat" table gains a row for
  **Patina Field's punch routing**, naming
  `CaptureKit/CaptureKit/Sync/PunchTaskWrite.swift:98-106`
  (`PunchCourtResolver.resolve`), its feeders
  `SupabaseSiteRequestService.swift:16-18` and `:513-519`, the `.noCourt` →
  `owner_party_id = nil` chain
  (`Capture/Services/Sync/LocalCaptureSyncService.swift:893-896`), and
  `fc_dispatch_task_assignment`'s early return on
  `NEW.owner_party_id IS NULL` (`00621:207-209`) — i.e. that **00621 §2b's
  repoint is inert on the Field path**, that the punch becomes the designer's
  own task rather than reaching the GC's court, that `field-daily`'s
  `owner_party_id`-keyed digest never lists it, and that `PunchCourtCopy.intent`
  makes the app consistent about the wrong fact.
- The W2 scope sentence after the table now includes Field punch routing, and a
  new paragraph carries both pieces of evidence above.
- §8 gains a bullet: **Patina Field's punch routing is dead until W2**, with
  "fails quietly and the app's own copy agrees with the wrong fact, so there is
  no visible symptom — which makes it the most likely of these to ship
  unnoticed."
- §8's owed list line for `SupabaseSiteRequestService.swift` now also names
  `CaptureKit/Sync/PunchTaskWrite.swift`'s `PunchCourtResolver` and says
  repointing the badge alone leaves punch routing dead.

Line-number citations in the finding were checked against the files and three
were corrected in the report: `LocalCaptureSyncService.swift` is at
`Capture/Services/Sync/`, not `CaptureKit/CaptureKit/Sync/`, and the ruling-2
comment is `:893-896`; the `owner_party_id IS NULL` early return is
`00621:207-209`; the roster-view grant is `00594:1142`.

No Swift file was changed.

---

## Gates run, after the edits

`.env.local` check first, before any destructive local act (sandbox disabled for
that one grep):

```
$ grep -n NEXT_PUBLIC_SUPABASE_URL apps/designer-portal/.env.local
1:# prod # NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co
14:# prod # NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
19:NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
```

Local. Not Strata. And no concurrent reset this round:

```
$ ps -Ao pid,ppid,command | grep -iE "supabase:reset|supabase db reset" | grep -v grep
(no rows)
```

### Reset

```
$ pnpm --dir .../agent-people-build supabase:reset
RESET_EXIT=0
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
$ grep -icE "^error|failed" reset-r4.log → 0
$ psql … -At -c "select version from supabase_migrations.schema_migrations
                  order by version desc limit 3;"
20260910152111
00621
00594
```

### SQL tests

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
PSQL_EXIT=0
44 blocks ": passed"
NOTICE:  All W1a assertions passed.
ROLLBACK
```

(The only `ERROR|FAIL` match is a block title: `16B. a DATELESS refusal fails
closed too (r4 B-1): passed`.)

### The two corrected comments are in the DB, not just the file

```
$ psql … -At
--- refusal_unanswered col comment (close-out r4 clause present?) ---
t
--- channel_consent_status fn comment ---
t
```

### 00594 replays clean (it was edited in place)

```
$ psql … -v ON_ERROR_STOP=1 -f <BEGIN; 00594; ROLLBACK;>
REPLAY_00594_EXIT=0   psql ERROR lines = 0
COMMENT
ROLLBACK
```

### Legacy grants + generated types

```
$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2644 replayed statements
GRANTS: byte-identical (no GRANT/REVOKE change in this round)

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir .../agent-people-build db:generate
GEN_EXIT=0
37486 lines
TYPES: no drift
```

### Deno

```
$ deno check --config supabase/functions/deno.json \
    supabase/functions/sms-inbound/pipeline.ts \
    supabase/functions/sms-inbound/index.ts \
    supabase/functions/_tests/sms-inbound.test.ts
Check supabase/functions/sms-inbound/pipeline.ts
Check supabase/functions/sms-inbound/index.ts
Check supabase/functions/_tests/sms-inbound.test.ts

$ deno test --no-check -A --node-modules-dir=auto \
    --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts \
    supabase/functions/_tests/sms-inbound.test.ts \
    supabase/functions/_tests/field-daily.test.ts
ok | 100 passed | 0 failed (357ms)      # was 96 before this round: +4

$ ls deno.lock → No such file or directory
```

---

## Files touched

| File | Why |
|---|---|
| `supabase/functions/sms-inbound/pipeline.ts` | BLOCKING-1 (`studiosHoldingPhone` returns `failed`; STOP gate checks it) + MAJOR-1 (`studiosHoldingRecord` filters on `recordVerdict`) |
| `supabase/functions/_tests/sms-inbound.test.ts` | 4 tests: 2 for BLOCKING-1 (one control), 2 for MAJOR-1 |
| `supabase/migrations/00594_studio_channel_consent.sql` | comments only — the `refusal_unanswered` column comment and `channel_consent_status`'s function comment, both of which promised a door that did not exist (MAJOR-1) |
| `artifacts/people-room-crm-2026-09-11/build/w1a-report.md` | §4, §5.1b, §5.2 bullet 2, §8 (all three findings) |

No prod act. No Swift change. No new migration. No MINOR touched.
