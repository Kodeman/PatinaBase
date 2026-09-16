# W1a final review — round 2: tests, types, behaviour

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, reviewed at head `cb2dc8360`
(`fix(consent): a YES cannot answer a STOP, and the record is the whole send
gate`). Local Postgres only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`, this wave's sole
declared owner). No prod act of any kind — no `supabase db push`, no
`supabase functions deploy`, no Strata connection. Working tree clean
throughout (`git status --short` empty before and after).

## 0. Environment note — a stale orphan CLI process corrupted the first two reset attempts

Before any evidence below, record what happened so the numbers are legible.
The first two `supabase db reset` attempts against this shared local Postgres
failed (`relation "vendors" already exists`, then `LegacyDbSetupError: error
running container: exit 1`). Investigation found a **leftover
`supabase db reset` process from this review's own second attempt**, never
reaped, still running in the background and racing the third (successful)
attempt — visible as three live `sh -c cd supabase && supabase db reset` /
`node .../supabase db reset` / CLI-binary process trios in `ps aux`, and as the
DB container repeatedly restarting mid-migration-replay
(`database system was interrupted`). This is the CLI-command analogue of
`patina-local-dev`'s dev-server orphan gotcha, not a codebase defect: killing
the orphan (`kill <pid>`) and re-running `supabase db reset` produced a clean,
fully-seeded database on the first subsequent attempt, confirmed by
`profiles` row count (16, matching seed) and migration head (`00622`). Every
result below was captured only after that clean, singly-owned reset, with
`ps aux | grep "supabase db"` empty immediately before each verification
command. **Flag for Kody / for `patina-parallel-work`:** if another agent or
script issues `supabase db reset` in the background and the shell wrapper that
launched it exits before the CLI itself does, the child is not killed with it —
worth a note in the skill.

Two more session-owned artifacts from an apparently earlier, interrupted
attempt at this exact task were found already present in `build/` at review
start (`probe52-final-r2-objects.sql`, `probe53-final-r2-rail.sql`, timestamps
~08:08–08:13 today) with no accompanying `w1a-final-review-r2-tests.md`. They
were not authored by this review pass, but are well-formed and cheap to run,
so both were executed as part of this review's own evidence and are cited
below alongside probes built fresh for this pass. No conflicting report file
existed to reconcile.

## 1. Prior fix log (r1) — every finding re-checked

`build/w1a-final-fix-log-r1.md` closed BLOCKING-1, MAJOR-1, MAJOR-2 and
MAJOR-3 from `w1a-final-review-r1-migrations.md`. All four re-verified fixed
and, in two cases, found to go further than the fix log itself describes:

| Finding | Fix log's claim | Re-checked | Status |
|---|---|---|---|
| BLOCKING-1 (a bare YES lifts a standing STOP) | `sms-inbound/pipeline.ts` YES branch reads `studiosHoldingRecord(..., ["pending"])`, not the seat | `grep -n "sms_consent_status" supabase/functions/sms-inbound/pipeline.ts` (non-test): zero code matches, five comment lines narrating the retirement (§ below). Read the YES branch directly (`pipeline.ts:858-889`): target set is `studiosHoldingRecord(supabase, from, ["pending"])`, unioned via `withRecordOnlyStudios`, exactly as described | **FIXED, confirmed** |
| MAJOR-1 (R-AY not implemented for the send path) | `sendPartySms`'s three legacy legs deleted; gate is `channelConsentVerdict` alone | Read `sms.ts:697-770` directly: `resolveRecipient` → `channelConsentVerdict` → `refuse`/`allow`/invite-only `unknown`. No `recipient.consent` field, no `reduceConsent()` call site (only a historical comment at :175). `fc_dispatch_court_assignment` / `fc_dispatch_task_assignment` source (`pg_proc.prosrc`) contains **zero** occurrences of `sms_consent_status`, only `channel_consent_status` | **FIXED, confirmed — and further than w1a-report.md's own §5.1b(b) discloses** (see §5 below) |
| MAJOR-2 (unattributable send authorised by the frozen seat) | Closed by MAJOR-1's deletion | Same code path confirms it: `unknown` (no-studio, clean scan) needs `allow` for a non-invite send, which a frozen seat can no longer produce | **FIXED, confirmed** |
| MAJOR-3 (release trigger's bare call aborts the consent write) | `pp.project_id = sr.project_id` join added; `site_request_dispatch_after_consent` call wrapped in `BEGIN...EXCEPTION WHEN OTHERS THEN RAISE WARNING...CONTINUE` | Re-ran the SQL suite fresh (below): block 45h reproduces the wrapped-warning behaviour verbatim (`WARNING: site request consent release failed for request ...: w1a probe: this release cannot be dispatched — the consent write stands` followed by `NOTICE: 45h. ... passed`) | **FIXED, confirmed** |

No prior finding reopened. §5.1b(b)'s disclosure in `w1a-report.md` ("00621's
two dispatch gates keep a seat leg... flagged for Kody") is now **stale** —
the fix log's MAJOR-1 deleted that leg from both gates as a documented side
effect, and this review confirms it against the shipped function source, not
just the fix log's prose.

## 2. SQL test suite

Full clean reset (see §0), migration head confirmed `00622` /
`20260910152111`:

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
...
NOTICE:  45h. a release that raises is a warning, not an aborted consent act (final-run MAJOR-3): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
$ echo $?   # captured separately via a non-piped run
EXIT=0
$ grep -c ": passed" <output>
48
```

48 of 48 assertions passed, exit 0, single transaction, ROLLBACKed. Re-run
twice on two independent clean resets (§0's third and fifth reset attempts) —
identical 48/48 both times.

## 3. Generated types — no drift

```
$ cp packages/supabase/src/database.types.ts /tmp/database.types.before.ts
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir .../agent-people-build db:generate
$ git -C .../agent-people-build diff --stat packages/supabase/src/database.types.ts
(empty)
$ diff -q /tmp/database.types.before.ts packages/supabase/src/database.types.ts
(identical)
```

Confirms the fix log's own claim (00622 in-place edits changed function bodies
and one trigger's table, not any type-visible shape).

## 4. Deno edge-function tests

```
$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts \
    supabase/functions/_tests/field-daily.test.ts
ok | 105 passed | 0 failed (139ms)
```

Matches the fix log's own count exactly (103 → 105, +2 BLOCKING-1 regression
tests).

Full `_shared` + `sms-inbound` + `_tests` sweep (as asked, not only the
consent-scoped subset):

```
$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared supabase/functions/sms-inbound supabase/functions/_tests
FAILED | 721 passed | 1 failed (3s)
```

The one failure is `supabase/functions/_tests/stripe-rail.test.ts`, an
**uncaught module-load error** (`Error: supabaseKey is required` — it reads
`Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!` / `SUPABASE_ANON_KEY!` at import
time with no fallback and no env set in this run). Confirmed pre-existing and
unrelated: it imports nothing this wave touched, and the very first `deno test
--allow-all` invocation (before `--no-check`) also flagged an unrelated
type-check error in `fulfillment-po/core.ts:314` (a `Uint8Array` /
`ArrayBuffer` mismatch feeding `encodeBase64`) — neither file is part of the
consent/people-directory change set. `w1a-report.md` §6 already discloses
"719 passed | 1 failed" for this same stripe-rail red before the fix log added
two tests elsewhere (719+2=721 ties out exactly). Not a w1a finding.

`deno check --no-lock` on the three edited modules — clean, no `deno.lock`
written at repo root (`ls deno.lock` → not found).

## 5. Role probes — designer (member), a client account, and anon

All run via `SET ROLE` + `request.jwt.claims`, inside a rolled-back
transaction, against fresh fixture orgs/projects (not the shared seed rows) so
nothing outlives the probe.

**Same phone number, opted_out in Alpha / granted in Beta — cross-tenant
isolation intact, and B may send where A may not:**

```
alpha_verdict | beta_verdict
--------------+--------------
opted_out     | granted

project_id (Alpha) | phone         | roster_word
--------------------+--------------+-------------
...b001             | +15555550001 | opted_out
...b002             | +15555550001 | granted

alpha_may_send | beta_may_send
----------------+---------------
f               | t
```

**No record at all:**

```
channel_consent_status(...) IS NULL  -> t
COALESCE(..., 'not_asked')           -> not_asked
```

**A fold refusal (`opted_out`, `refusal_unanswered=true`) then the
recipient's own START (simulated as the rail's own service_role upsert would
write it — status→`granted`, `refusal_unanswered`→`false`, opt-out fields
cleared):**

```
before_start -> opted_out
after_start  -> granted

roster_word (v_project_roster, as the designer)     -> granted
status_raw / directory_word (people_directory, as the designer) -> granted / granted
```

Both room readers agree with the record and with each other, org-scoped:

```
who                             | verdict
---------------------------------+-----------
designer as member of Alpha      | opted_out
designer as member of Beta       | granted
designer direct table read       | Alpha=opted_out, Beta=granted   (2 rows — RLS lets a member see BOTH their own orgs, never a third)

who                                | verdict_should_be_null / rows_visible_should_be_0
------------------------------------+----------------------------------------------------
client (non-member) via function    | <null>
client (non-member) direct table read | 0

anon: EXECUTE refused                -> 42501 / permission denied for function channel_consent_status
anon: table read refused             -> 42501 / permission denied for table studio_channel_consent
```

A direct, non-RPC `UPDATE public.studio_channel_consent ... ` attempted as the
authenticated member (bypassing every RPC gate) is refused at the **grant**
level, not merely by RPC convention:

```
information_schema.role_table_grants for studio_channel_consent:
  authenticated | SELECT            (no INSERT/UPDATE/DELETE)
  service_role  | SELECT,INSERT,UPDATE,DELETE,...
  postgres      | SELECT,INSERT,UPDATE,DELETE,...

DO $$ ... UPDATE public.studio_channel_consent SET status='granted' ... $$
NOTICE: direct write refused as expected: 42501 / permission denied for table studio_channel_consent
```

This closes off "an RLS or grant hole" for the BLOCKING class outright: even a
studio owner with full RLS visibility into their own org's row cannot write it
except through the three SECURITY DEFINER RPCs or the service_role rail.

**Legacy write to `project_parties.sms_consent_status` by a studio member:**

```
NOTICE: legacy write refused as expected: P0001 / consent_legacy_column_frozen
```

**A site request parked `awaiting_consent`, released when the record turns
granted** (through the actual RPC, as a real studio member, not a raw insert):

```
site_requests.status before  -> awaiting_consent
record_channel_consent(..., 'granted', ...) -> succeeds
site_requests.status after   -> awaiting_consent   (still — see note)
site_requests.consent_status_snapshot after -> granted
site_request_dispatch_outbox: 1 new row, action='consent-granted', status='pending'
site_request_events: 'consent_granted_dispatch_ready' recorded
```

`status` staying `awaiting_consent` while `consent_status_snapshot` flips to
`granted` and an outbox row + event are minted is **correct, not a defect** —
per `site_request_dispatch_after_consent()`'s own body (00622 §5), the release
enqueues durable dispatch work; a separate worker/edge invocation later moves
`status` to `sent`. Confirmed by re-deriving the same scenario with an outbox
row count taken before/after: 0 → 1, plus the `consent_granted_dispatch_ready`
event — this is the "released" signal the design actually promises, and it
fired.

**A STOP whose studio-attribution read fails — answered 500, claim
released, retry completes it.** This scenario is inherently a mocked-I/O
construction (forcing a real Postgres read to fail from a raw SQL script isn't
meaningful), so it is verified through the shipped, already-passing Deno test
that constructs exactly this shape (`sms-inbound.test.ts`, "a STOP whose
studio-attribution read fails is not acknowledged, and the retry records the
seat-only studio", part of the 105/105 passing run above): a seat-only studio
(org-alpha, no record) plus a record-only studio (org-beta, `granted`), STOP
arrives with `projects` reads denied →

```
res.status = 500, res.disposition = "opt_out_incomplete"
studio_channel_consent after: org-beta -> opted_out, org-alpha -> undefined (never reached)
sms_messages.twilio_sid for the inbound row -> null   ("the MessageSid claim is released for the retry")
retry (clean read): res.status = 200, res.disposition = "opted_out"
studio_channel_consent after retry: org-alpha -> opted_out, org-beta -> opted_out
```

Exactly the required shape: 500 on the failed-attribution attempt, claim
released, both studios correctly refused once the retry succeeds. The control
test (clean read, same fixture) answers 200 and records both studios in one
pass, so the 500 is genuinely gated on the read failure, not the fixture
shape.

## 6. Two additional probes found in `build/` (not authored by this pass) — run and cross-checked

`probe52-final-r2-objects.sql` (object/access sweep) and
`probe53-final-r2-rail.sql` (site-request rail walk) were present at review
start with no accompanying report (see §0). Both were run to completion as
part of this review's evidence, cross-checking every claim above independently
where they overlap, plus one genuinely new observation:

- **probe52 block 6 has a false-positive regex**, worth noting so it doesn't
  read as a finding on its own: it flags `v_project_roster` as
  `reads_status = t` (i.e. "still reads the frozen seat column") because its
  check is an *unqualified* `pg_get_viewdef(...) ~ 'sms_consent_status'` —
  which matches the view's own **output column alias**
  (`... AS sms_consent_status`), not a read of `pp.sms_consent_status`. Read
  directly: `pg_get_viewdef('v_project_roster')` shows the party branch as
  `COALESCE(channel_consent_status(project_consent_org(pp.project_id), 'sms',
  pp.phone_e164), 'not_asked') AS sms_consent_status` — the record, aliased to
  the historical column name. `people_directory`'s equivalent check in the
  same probe is correctly qualified (`pp.sms_consent_status`) and reads `f`.
  Not a finding; noted so the probe's own output isn't mis-read later.
- probe53 sections A–F all print their stated "must be" values with no
  deviation (site_request_send parks with no seat write and no record minted;
  resend still gates on the frozen seat, matching the disclosed, not-yet-paid
  §5.1 residue; the two 00621 dispatch gates (D1–D3) refuse a frozen-granted
  seat with no record, confirming §1's re-check above from a second angle;
  cross-tenant isolation E1–E3 all read as isolated; the legacy freeze F1–F2
  refuse, F3–F4 (an ordinary edit, a project move) pass through untouched).
- **probe53 section G — a new, MINOR observation, not reachable via any
  shipped writer.** It manually crafts a raw
  `UPDATE studio_channel_consent SET refusal_unanswered = false ...` that
  names *only* that column (starting from a fold-shaped row: `status='granted'`,
  `refusal_unanswered=true`, i.e. "granted but for an unanswered refusal").
  The release trigger is `AFTER INSERT OR UPDATE OF status` (00622 §4) —
  Postgres's "UPDATE OF column" fires on any statement that **names** that
  column in its SET list, independent of whether the value changes; naming
  only `refusal_unanswered` means the trigger never fires at all, yet
  `channel_consent_status()`'s fold (`status` AND `refusal_unanswered`
  together) now correctly reads `granted`. Result: the verdict is sendable,
  but a request already parked `awaiting_consent` for that same phone/studio
  stays parked — nothing re-checks it.
  - **This finding is graded MINOR, not MAJOR/BLOCKING, because it is not a
    reachable write path in the shipped code.** All three writer RPCs and the
    inbound rail's own upsert were checked directly against this exact
    question:
    - `record_channel_consent`'s `ON CONFLICT DO UPDATE` always includes
      `status = EXCLUDED.status` in its SET list (00622:152), so it always
      fires the trigger regardless of whether the value textually changes.
    - `record_channel_reconsent`'s UPDATE always includes
      `SET status = 'opted_out', ...` (00594:2377 area) for the same reason.
    - `sms-inbound/pipeline.ts`'s `writeChannelConsent()` always
      `.upsert({ ..., status, refusal_unanswered: status === "opted_out",
      ... })` as one object — `status` is always part of the same
      upsert statement.
    - `backfill_channel_consent_from_parties()` writes via `INSERT`, which the
      trigger's `AFTER INSERT` clause always fires on regardless of columns.
    No shipped caller updates `refusal_unanswered` alone. The gap is real —
    the trigger is coupled to *which column a writer's SET clause happens to
    name*, not to the semantic transition it exists to catch — but today it
    is latent, and its consequence if a future writer (or a hand-run repair
    against `studio_channel_consent`, which has no equivalent of
    `app.consent_legacy_write` naming it as a sanctioned manual door) ever did
    write this shape would be a **stuck** site request (under-permissive:
    nothing gets released that shouldn't), never a wrongful send or a lost
    refusal. Recommend the trigger's `WHEN` clause additionally test
    `OLD.refusal_unanswered IS DISTINCT FROM NEW.refusal_unanswered` alongside
    `UPDATE OF status`, and that this be caught by adding `UPDATE OF status,
    refusal_unanswered` to the trigger definition — a one-line, low-risk
    change — but it is not required for this wave to ship, since nothing
    reachable exercises it.

## 7. Readers of `people_directory` / `v_project_roster` columns

`grep -rln "people_directory\|v_project_roster" apps packages --include="*.ts" --include="*.tsx"`:

```
apps/designer-portal/src/components/document/desk-reconnect.tsx
apps/designer-portal/src/components/document/brief-section.tsx
apps/designer-portal/src/components/document/letterhead-instruments.tsx
apps/designer-portal/src/components/document/roster/roster-row.tsx
apps/designer-portal/src/components/document/roster/__tests__/call-sheet.test.tsx
apps/designer-portal/src/components/document/roster/__tests__/roster-row.test.tsx
apps/designer-portal/src/components/document/roster/call-sheet.tsx
apps/designer-portal/src/components/document/roster/__tests__/call-sheet-mount.test.tsx
apps/designer-portal/src/components/document/overlays/household-sheet.tsx
apps/designer-portal/src/components/document/roster/call-sheet-mount.tsx
apps/designer-portal/src/components/document/people/person-bits.tsx
apps/designer-portal/src/components/document/people/party-profile-sheet.tsx
apps/designer-portal/src/components/document/people/profile/maker-profile.tsx
apps/designer-portal/src/components/document/people/directory/makers-marketplace.tsx
apps/designer-portal/src/components/document/people/__tests__/person-row-hardening.test.tsx
apps/designer-portal/src/components/document/people/views/directory-view.tsx
apps/designer-portal/src/components/document/people/outreach/audience-rules.ts
apps/designer-portal/src/lib/document/desk-derivation.ts
apps/designer-portal/src/lib/document/roster-derivation.ts
apps/designer-portal/src/lib/document/people-derivation.ts
apps/designer-portal/src/lib/document/__tests__/roster-derivation.test.ts
packages/supabase/src/database.types.ts
packages/supabase/src/hooks/use-vendors.ts
packages/supabase/src/hooks/use-coordination.ts
packages/supabase/src/hooks/use-people.ts
packages/supabase/src/hooks/use-clients.ts
```

Of these, the ones that actually key off the SMS verdict field
(`grep -n "sms_consent_status\|sms_consented_at\|sms_opt_out_at"`):

- `roster-row.tsx:95` — `row.sms_consent_status ?? 'not_asked'`. Reads the
  view's aliased column, which is the record's verdict since 00621/00622 —
  transparently correct, no code change needed on this side of the freeze.
- `roster-derivation.ts:145` — a synthetic-row default (`sms_consent_status:
  null`), unaffected.
- `roster-derivation.ts:390` — `row.sms_consent_status === 'granted'` feeding
  the "N reachable by text" vitals count. **This is the disclosed §5.2
  under-count for the studio-less-project population** (a project with
  `studio_id IS NULL` whose designer has no resolvable studio membership):
  `channel_consent_status(NULL, ...)` can never match a row, so the view
  COALESCEs to `not_asked` for a number the unattributable send path may still
  text. `w1a-report.md` §5.2 and §8 name this exact line and gap explicitly as
  owed to Fable's policy ruling, not a code defect of this wave. **Settled by
  disclosure, not a new finding** — cited here only to confirm the disclosure
  matches the code as it ships today.
- `person-bits.tsx:163`, `people-derivation.ts:233` — comments only, no code
  read.
- No file reads `meta.sms_consented_at` / `meta.sms_opt_out_at` off
  `people_directory` in a way that diverges from `w1a-report.md` §5.3's
  disclosure (those two date fields still read the frozen columns; owed to
  W1b's v4 rebuild — settled, not a finding).

`packages/supabase/src/hooks/use-coordination.ts` — confirmed the three
disclosed portal writers (§5.1b(c)) are unchanged from the report's own
description: `useAddProjectParty` (INSERT, unaffected by the freeze, also
calls `record_channel_consent(..., 'pending', ...)`), the
`revertsToOptedOut` branch and `useRecordPartySmsConsent` both still issue the
frozen-column UPDATE and both are still caught/rethrown as a sentence
(`consent_legacy_column_frozen`). Owed to W2, as disclosed. Not a finding.

## 8. Type-checks

```
$ pnpm --dir .../agent-people-build --filter @patina/supabase type-check
> tsc --noEmit
(clean, exit 0)

$ pnpm --dir .../agent-people-build --filter @patina/designer-portal type-check
> tsc --noEmit
(clean, exit 0)
```

No type breaks from the regenerated `database.types.ts` (there was no drift to
begin with — §3). `git status --short` on the worktree confirmed empty both
before this review began and after every command in it.

## 9. Settled, not findings (rulings.md §3, in scope of this review)

Everything cross-checked in this pass line up with the ruling that governs it
and none is re-litigated here: R-AS (mirror retired, record is the single
source), R-AT/R-AU/R-AW/R-AY (STOP attribution-failure handling, START target
filter on verdict not column, record-only consent), R-AV (Patina Field —
confirmed still on the frozen seat, still disclosed as W2's, not this wave's
to fix — `apps/mobile/Capture` was not touched by this review since it carries
no SQL/TS surface this task's scope covers), R-AX (opted_out seat's phone
frozen — re-confirmed live via probe53 F2: `consent_opted_out_phone_frozen`).
§5.1b(b)'s and §5.1(b)'s residual disclosures were re-checked against the
current code rather than assumed from the report's prose, and are recorded
above (§1, §6) as either confirmed-current or confirmed-since-closed.

## 10. Summary

- SQL suite: 48/48 passed, exit 0, two independent clean resets.
- Generated types: zero drift.
- Deno: 105/105 on the consent-scoped subset; 721/722 on the full
  `_shared`+`sms-inbound`+`_tests` sweep, the one red pre-existing and
  unrelated (env-var-dependent stripe test).
- Role probes (designer/client/anon) via `SET ROLE` + `request.jwt.claims`:
  cross-tenant isolation holds at both the RPC/function layer and the raw
  table-grant layer; anon has no access to either the function or the table.
- All six constructed live-DB scenarios behave as designed: cross-tenant
  same-number divergence, no-record refusal, fold-refusal-then-START granted
  (both room readers agree), legacy-column write refusal, site-request
  release-on-grant (via outbox + event, not a synchronous status flip), and
  (via the shipped Deno test) STOP-attribution-failure 500-with-claim-release.
- Type-checks clean on `@patina/supabase` and `@patina/designer-portal`.
- Zero BLOCKING findings. Zero MAJOR findings. One MINOR finding (§6, the
  release trigger's column-name coupling) that is not reachable via any
  shipped writer today.

**Verdict: clean.**
