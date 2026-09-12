# W1a final run — fix log, round 1

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, baseline `a6b98fc18`
(`refactor(consent): the record is the only gate and the only reader (R-AW)`).
Local Postgres only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`,
this wave's sole owner). **No prod act of any kind** — no `supabase db push`, no
`supabase functions deploy`, no Strata connection.

**Scope: the four non-minor findings of `w1a-final-review-r1-migrations.md`
(BLOCKING-1, MAJOR-1, MAJOR-2, MAJOR-3) and nothing else.** The 16 MINORs and
the two informational notes in `w1a-final-review-r1-tests.md` are deliberately
untouched and stay open — except where a ruled fix closes one as a side effect,
which is called out per finding below.

Every ruling in `rulings.md` §3 governs, R-AW/R-AY above all: the record is the
only thing any gate, RPC, view, trigger or edge path consults for SMS consent,
and no fix here reintroduces a seat read.

`.env.local` checked before the reset (sandbox disabled for that one grep):

```
$ grep -n NEXT_PUBLIC_SUPABASE_URL /Users/kody/Code/patina-merged/apps/designer-portal/.env.local
1:# prod # NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co
14:# prod # NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
19:NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
$ ls -a .codex/worktrees/agent-people-build/apps/designer-portal/ | grep env
.env.example            # the worktree has no .env.local; the repo root's is the one read
$ psql … -Atc "select version from supabase_migrations.schema_migrations order by version desc limit 3"
20260910152111
00622
00621
```

No new migration number was minted. 00595–00620 are reserved for the other
program and 00622 is unapplied on prod, so the SQL half of MAJOR-1 and all of
MAJOR-3 are **edits in place to 00622** — the standard remediation for an
unapplied migration, and it keeps "the record is the only gate" one file instead
of one file plus an amendment. W1b still mints from 00623.

---

## BLOCKING-1 — a bare `YES` / `Y` lifted a standing recorded STOP

**Taken: the review's own second, preferred option** — "replace `hasPending`
with the record read outright, retiring the last recipient-facing frozen-seat
gate" — not the one-line target filter. The gate itself was the defect: with
every invited seat born `pending` and frozen there, `parties.some(p =>
p.sms_consent_status === "pending")` is armed for ever, so filtering only the
target set would have left the arming condition reading a column no consent act
can move.

### What changed

`supabase/functions/sms-inbound/pipeline.ts`

- The `YES`/`Y` branch asks `studiosHoldingRecord(supabase, from, ["pending"])`
  — `recordVerdict()`-filtered, exactly as the START branch does (R-AU) — and
  runs only when that set is non-empty. A record whose verdict is `opted_out`
  (status `opted_out`, or any record carrying `refusal_unanswered`) is never a
  target, so a YES cannot answer a refusal; START remains the way back, which is
  the word the party sheet and the STOP auto-reply both tell the recipient to
  send.
- Seat-derived targets are filtered to those orgs and unioned with
  `withRecordOnlyStudios()`, so a studio whose record is waiting with no seat
  left on the number is still answered — the same shape START uses.
- The confirmation reply is anchored on a seat held by one of the studios just
  granted (`answered`), falling back to the conversation's own party/project
  when the only target is record-only. Nothing else in the branch moved.
- The frozen column is no longer SELECTed anywhere on this rail: `PhoneParty`
  drops `sms_consent_status`, `loadPhoneParties()` selects `id, project_id`, and
  the candidate-party select drops it too. `seatConsentEvidence()` still reads
  the seat's *evidence* columns for a grant (R-AN) — evidence, never a verdict.

### Evidence

The review's own probe, re-run unchanged
(`build/probe46-final-r1-yes-after-stop.test.ts`):

```
$ deno test --no-check -A --node-modules-dir=auto --config supabase/functions/deno.json \
    artifacts/people-room-crm-2026-09-11/build/probe46-final-r1-yes-after-stop.test.ts
PROBE 1 after STOP: { "org-alpha": "opted_out/true", "org-beta": "opted_out/true" }
PROBE 2 frozen seats after STOP: pA=pending pB=pending
PROBE 3 YES disposition: project_chooser          # was: granted
PROBE 4 after YES:  { "org-alpha": "opted_out/true", "org-beta": "opted_out/true" }
PROBE 5 sendPartySms after the YES: {"sent":false,"reason":"opted_out"}   # was: sent:true
PROBE X-STUDIO 'Y' disposition: granted
PROBE X-STUDIO records after: {
  "org-alpha": "opted_out/unanswered=true/opt_out_at=2026-02-01T00:00:00Z",
  "org-beta":  "granted/unanswered=false/opt_out_at=null"
}
ok | 2 passed | 0 failed
```

Alpha's refusal now stands through a `Y` that answers Beta's brand-new invite,
and the send that used to follow is refused.

### Shipped tests added (the review's ask)

`supabase/functions/_tests/sms-inbound.test.ts`

- `"a bare YES does not lift a standing recorded STOP"` — record at
  `opted_out`/`refusal_unanswered`, seat frozen at `pending`: the disposition is
  not `granted`, the record keeps its status, flag and `opt_out_at`, nothing is
  dated as consent, and the seat never moves.
- `"a Y answering one studio's invite leaves another studio's recorded STOP
  standing"` — the cross-studio shape: Beta reads `granted/false`, Alpha reads
  `opted_out/true`.

The four existing YES tests are repointed from the seat to the record (each
fixture gains the `pending` record `record_channel_invite()` writes); two of them
are made sharper by leaving BOTH frozen seats at `pending` while only one studio
holds the invite on the record, so the seat and the record actively disagree.

---

## MAJOR-1 — R-AW/R-AY was not implemented for the send path

**Taken: the deletion the report names**, plus the two SQL readers the review's
fix text says it retires with them.

### What changed

`supabase/functions/_shared/sms.ts`

- `sendPartySms`'s three legacy legs are gone. The gate is now
  `channelConsentVerdict` alone: `refuse` → `{sent:false, reason:"opted_out"}`;
  a non-invite needs `allow`, else `{sent:false, reason:"not_consented"}`; the
  invite keeps its own door (`unknown` is the invite in flight) and still proves
  its recorded evidence off the seat's *evidence* columns.
- `flushDeferredMessages`'s second check is gone the same way; the deferred row's
  seat is read for its `project_id` only.
- `Recipient.consent`, `reduceConsent()` and the `ConsentStatus` type are
  deleted, and `resolveRecipient()` no longer selects `sms_consent_status` on
  either branch.

`supabase/functions/field-daily/core.ts`

- `mayTextField()` returns `verdict === "allow"`; its `|| party.sms_consent_status
  === "granted"` leg is gone, and both recipient selects stop selecting the
  column.

`supabase/migrations/00622_consent_record_is_the_only_gate.sql` (edited in place)

- **§5, new**: `site_request_resend()` grafted from its only definition
  (00374:1333-1393) with the one gate moved onto
  `channel_consent_status(project_consent_org(project_id), 'sms', phone_e164)`.
  On the frozen column this designer act refused every consent recorded after
  00594. `REVOKE ALL … FROM PUBLIC, anon` + `GRANT EXECUTE … TO authenticated`
  restated verbatim from 00374:3537/3547; COMMENT updated.
- **§6, new**: `fc_dispatch_court_assignment()` and
  `fc_dispatch_task_assignment()` grafted from 00621 with the seat leg (`AND
  v_party.sms_consent_status <> 'granted'`) removed. 00621 carried that leg for
  one stated reason — sendPartySms still honoured a grant on a pre-fold seat —
  and that reason is deleted above; what remained would only dispatch work the
  send rail refuses. `REVOKE ALL … FROM PUBLIC, anon` restated; COMMENTs
  updated. This also closes the review's MINOR-6 as a side effect of the ruled
  fix, which is why it is named here rather than left open.
- The file's banner is amended so it no longer says resend is un-repointed or
  that the two gates keep their seat leg, and `fc_dispatch_optin_invite` is
  moved into "NOT CHANGED, ON PURPOSE" with its reason: it fires off the seat
  INSERT that RECORDS the invite (a write the freeze allows), not a verdict read
  standing between a record and a send, and the send gate it wakes still asks
  the record.

Not touched, deliberately: `fc_dispatch_optin_invite` (above), the invite's
evidence proof (evidence, not a verdict — it can only refuse more), and the two
Swift readers in Patina Field (R-AV, ruled W2's).

### Evidence

`build/probe47-final-r1-seat-leg.test.ts`, re-run unchanged:

```
PROBE a verdict = allow  | sendPartySms = {"sent":true,…,"body":"hi"}
        # record granted over a frozen opted_out seat — was {"sent":false,"reason":"opted_out"}
PROBE b verdict = refuse | sendPartySms = {"sent":false,"reason":"opted_out"}
        # record opted_out over a frozen granted seat — unchanged, the direction that matters
```

Probe a is the G-3 sentence closed: the Call Sheet row, the Call Sheet vitals,
the Directory row and `field_activity_summary` print "Texting" for that number
and the send now goes.

SQL, after a full reset (block 42, rewritten 42e):

```
NOTICE:  42. the two 00284 dispatch gates reach a party the record granted,
         refuse an unasked, a refused and a non-field one, and no longer read
         the frozen seat at all (close-out r3 MAJOR-3, final-run MAJOR-1): passed
NOTICE:  45. a moved seat's parked request no longer aborts the consent write,
         and resend asks the record (final-run MAJOR-3, MAJOR-1): passed
```

Block 42e was inverted (a frozen `granted` seat with no record must now dispatch
NOTHING) and given two `prosrc` assertions that neither gate contains
`sms_consent_status` at all. Block 45g walks `site_request_resend()` on a
record-granted / seat-frozen assignee (succeeds, `action = resend`) with a
recorded refusal as the negative control (still raises `granted SMS consent and
phone are required to resend`).

---

## MAJOR-2 — the unattributable send was authorised by the frozen seat alone

**Closed by MAJOR-1's deletion**, which is the first of the two options the
review offers; no policy ruling was made or pre-empted. With the legacy legs
gone, an ordinary send needs `allow`, and `unknown` — the no-studio branch's
"nothing on the number has refused" — is not a grant. A frozen `granted` seat
and a frozen `not_asked` seat on that population now behave identically, which
is the whole claim.

The §5.2 fail-open that remains is the double-opt-in INVITE on a studio-less
project, and it is no longer a frozen column's decision: it needs the recorded
evidence set on the seat (`consent_evidence_required` otherwise), and any
studio's recorded refusal on the number still refuses it. The policy question
the report escalates to Kody is untouched.

### Evidence

```
PROBE c verdict = unknown | sendPartySms = {"sent":false,"reason":"not_consented"}
        # studio_id NULL, no membership, no record, seat frozen at `granted`
        # was: {"sent":true,"messageId":"fd5520d0-…"}
```

Two tests carry it: `"with no record and no resolvable studio, NO seat word
authorises the send (final-run MAJOR-2)"` loops over a seat frozen at `granted`
and one frozen at `not_asked` and asserts the same refusal for both, and the
unattributable control is renamed to assert the reason (`not_consented` for a
clean scan) so it can no longer pass for the wrong reason beside its
`opted_out` siblings.

---

## MAJOR-3 — the release trigger's bare call aborted the consent write

**Taken: both of the review's independent lines**, (a) and (b).

### What changed

`supabase/migrations/00622_consent_record_is_the_only_gate.sql` (edited in place)

- (b) The release loop's JOIN gains `AND pp.project_id = sr.project_id`, so a
  seat MOVED to another job drops out of the loop instead of reaching a callee
  that fetches the assignee by id AND by the request's project_id and raises.
- (a) `v_dispatch := public.site_request_dispatch_after_consent(v_request.id)`
  is wrapped in its own `BEGIN … EXCEPTION WHEN OTHERS THEN RAISE WARNING …
  CONTINUE`, so a release that cannot be dispatched for ANY reason is a warning
  and the lifecycle sweep's problem — never an abort of the consent act. The
  pre-existing fire-and-forget handler around `invoke_edge_function` is
  unchanged.
- The function's COMMENT now states both.

### Evidence

`build/probe51-final-r1-consent-write-abort.sql`, re-run unchanged:

```
A1 a studio member moved the seat to the studio's other job: <allowed>
A2 record_channel_consent(granted)                         = <succeeded>
   # was: assignee has not granted SMS consent
A3 the inbound rail's own service_role grant upsert        = duplicate key value
   violates unique constraint "studio_channel_consent_pkey"
```

A3's remaining error is an artifact of the probe, not the defect: A3 is a bare
`INSERT`, and now that A2 no longer aborts, the row it writes already exists.
The rail's real write is an upsert (`writeChannelConsent` uses
`onConflict`), probed in that shape on the same fixture:

```
B1 the rail STOP upsert                                = <succeeded>
B2 the rail START upsert (the recipient's own way back) = <succeeded>
B3 the record now reads                                = granted
B4 the parked request still reads                      = awaiting_consent
```

So the recipient's START is recorded, Twilio's 200 is honest, and the request
the release could not dispatch simply stays parked.

### The missing assertion, added

`supabase/tests/people/w1a_identity_channels_consent_test.sql` — new block 45
(two `DO` blocks, `45a`–`45h`), the assertion the review said the suite had no
form of:

- 45a/45b: a request parks `awaiting_consent`; a studio co-member's `UPDATE
  project_parties SET project_id = <the studio's other job>` is allowed (the
  premise).
- 45c: `record_channel_consent(… 'granted' …)` does not raise, and the grant is
  on the books.
- 45d: the request the loop dropped is still `awaiting_consent` /
  `not_asked` — parked, not released, not raised over.
- 45e: the rail's own service_role STOP and then START upserts both land, and
  the record reads `granted` (the leg that matters: a START that is
  acknowledged must be recorded).
- 45f: both fixes are asserted in the shipped `prosrc`, not just in the fixture
  (`pp.project_id = sr.project_id`, and the wrapped `RAISE WARNING`).
- 45g: `site_request_resend()` on the record (MAJOR-1), with a recorded refusal
  as the negative control.
- 45h: the WRAPPER itself, with the callee replaced by a raising stub for the
  remainder of the rolled-back transaction — the consent transition still lands,
  the record reads `granted`, the request stays parked, and the warning is in
  the output:

```
WARNING:  site request consent release failed for request a1000000-…-c3:
          w1a probe: this release cannot be dispatched — the consent write stands
NOTICE:  45h. a release that raises is a warning, not an aborted consent act
         (final-run MAJOR-3): passed
```

---

## Verification

```
$ pnpm --dir …/agent-people-build supabase:reset        # sandbox disabled (telemetry write only)
Applying migration 00621_consent_readers_repointed.sql...
Applying migration 00622_consent_record_is_the_only_gate.sql...
Finished supabase db reset on branch main.

$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
EXIT=0 · 48 ": passed" (was 46 — blocks 45 and 45h are new) · "All W1a assertions passed." · ROLLBACK

$ psql … -c "BEGIN;" -f supabase/migrations/00622_consent_record_is_the_only_gate.sql -c "ROLLBACK;"
REPLAY_EXIT=0                                          # still idempotent on a DB already at 00622

$ deno test --no-check -A --node-modules-dir=auto --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts \
    supabase/functions/_tests/field-daily.test.ts
ok | 105 passed | 0 failed                             # was 103; +2 BLOCKING-1 regressions

$ deno check --no-lock --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.ts supabase/functions/field-daily/core.ts \
    supabase/functions/sms-inbound/pipeline.ts
EXIT=0

$ python3 scripts/generate-legacy-grants.py
wrote …/supabase/seed/00-legacy-grants.sql — baseline + 2655 replayed statements
# +4 statements, all of them 00622 §5/§6's restated REVOKE/GRANTs

$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate
$ git diff --stat packages/supabase/src/database.types.ts
(empty)                                                # no schema change, only function bodies

$ pnpm --filter @patina/supabase type-check     → tsc --noEmit, EXIT=0
$ pnpm --filter @patina/designer-portal type-check → tsc --noEmit, EXIT=0
```

`grep -rn "sms_consent_status" supabase/functions` (non-test) now returns
**comments only** — five lines, every one of them narrating the column's
retirement. The rail, the send path, the flush and the cron read the record.

## What this round did not touch

- The 16 MINORs of `w1a-final-review-r1-migrations.md` and the two
  MINOR/informational notes of `-tests.md`, except MINOR-6, which MAJOR-1's
  ruled deletion closes outright.
- R-AV (Patina Field's two Swift readers) — ruled W2's.
- The §5.2/§8 unattributable-INVITE policy question — Kody's.
- `fc_dispatch_optin_invite`, `use-coordination.ts`'s three frozen-column
  writers, and every other item the report itself discloses as owed.
