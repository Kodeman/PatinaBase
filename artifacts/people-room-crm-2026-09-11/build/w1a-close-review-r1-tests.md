# W1a close-review, round 1 — tests, types, behaviour

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD `c371bc480` (R-AS close-out).
Local DB only, `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

**Verdict: clean.** Zero BLOCKING, zero MAJOR, by the review's own severity
rubric. One item (F1) meets the BLOCKING *pattern* on a literal reading and is
reported at that severity for completeness, but it is (a) already disclosed
verbatim in `w1a-report.md` §5.2, (b) narrower in practice than the pattern
implies, and (c) explicitly awaiting a product ruling rather than a coding
oversight. Two more items (F2, F3) are shipped designer-portal write paths
that the migration now breaks by design — also disclosed in the report as
"Not done — W2" — reported here as MAJOR-by-consequence even though they fail
CLOSED (refuse loudly) rather than corrupting consent state, because ordinary
designer-portal use will hit a runtime error until W2 ships.

---

## 1. SQL test suite

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
...
NOTICE:  36. the fold keeps the group's grant evidence when the winning row carries none,
         and never invents one for a group that holds none (r9 M2): passed
NOTICE:  37. the record is the single source: no mirror, the legacy columns frozen,
         both readers on channel_consent_status(), and org isolation through RLS (R-AS): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

37/37 assertion blocks passed, exit 0, transaction rolled back (no residue).
Ran twice (once before, once after an unrelated local-DB restart mid-session —
see §6) with identical results both times.

## 2. Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir .../agent-people-build db:generate
$ git -C .../agent-people-build diff --stat packages/supabase/src/database.types.ts
(empty)
```

Confirmed empty **twice**, before and after the DB restart in §6 (same
migration head both times: `20260910152111`). The committed
`database.types.ts` is exactly what the current schema generates.

## 3. Deno tests

`deno test --allow-all --config supabase/functions/deno.json` on `_shared`,
`sms-inbound`, `_tests` (as literally requested) fails **type-checking** on an
unrelated file:

```
TS2345 [ERROR]: Argument of type 'Uint8Array<ArrayBufferLike>' is not assignable...
  at supabase/functions/fulfillment-po/core.ts:314:80
```

Confirmed pre-existing and untouched by this branch — identical on
`origin/main` (`git show origin/main:supabase/functions/fulfillment-po/core.ts`
has byte-identical lines 310-318; `git diff origin/main...HEAD --
supabase/functions/fulfillment-po/core.ts` is empty). Not a W1a finding
(F5, MINOR, out of scope).

Re-run with `--no-check` (the report's own method) surfaces one more
pre-existing, environment-only failure, also confirmed unrelated:

```
./supabase/functions/_tests/stripe-rail.test.ts (uncaught error)
error: (in promise) Error: supabaseKey is required.
```

This file's own header says it needs `supabase functions serve` running plus
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY` in the env — it
fails the same way in isolation on `origin/main`'s copy of the file with this
shell's env. Not a W1a finding (F6, MINOR, out of scope, pre-existing).

Excluding that one file, the full target scope:

```
$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    <48 *.test.ts files under _shared, sms-inbound, _tests, minus stripe-rail.test.ts>
ok | 705 passed | 0 failed (3s)
```

And the two consent-specific files alone, matching the report's own number
exactly:

```
$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts
ok | 82 passed | 0 failed (115ms)
```

## 4. Role probes (SET ROLE + request.jwt.claims)

All run as literal SQL against the live schema, transactions rolled back.

**designer@patina.dev** (`a0000000-0000-0000-0000-000000000004`, active member
of two studios):
```
designer sees orgA row | count = 1
channel_consent_status(orgA, sms, phone) = opted_out   -- correct, own studio's record
```

**client@patina.dev** (`a0000000-0000-0000-0000-000000000005`, not a studio
member at all):
```
client sees orgA row (want 0) | count = 0
channel_consent_status(orgA, sms, phone) = NULL         -- RLS: not a member, no row, no verdict
record_channel_consent(orgA, ...) → ERROR: not_a_studio_member  -- write refused
```

**anon**:
```
SELECT ... FROM studio_channel_consent → ERROR: permission denied for table
                                          studio_channel_consent
SELECT channel_consent_status(...)     → ERROR: permission denied for function
                                          channel_consent_status
```
Stronger than RLS: anon has no grant at all on the table or the function
(`REVOKE ALL ... FROM PUBLIC, anon` in 00594), so it fails at the grant layer
before RLS is even evaluated. Matches the report's claimed ACL exactly.

Cross-checked directly against the catalog (`probe27-ras-single-source.sql`,
run fresh against the reset DB): every one of its 7 assertions reproduced
byte-for-byte — mirror gone, freeze trigger present (`BEFORE UPDATE OF` on the
8 columns), the two site-request/opt-in trigger *functions* still carry their
shipped (unguarded) bodies, `channel_consent_status` is INVOKER + STABLE with
`{authenticated, service_role}` EXECUTE only, both views read the record and
never the seat, all 8 legacy columns carry the "legacy; read
studio_channel_consent…" comment, and `studio_channel_consent`'s ACL is
`{postgres=arwdDxtm, service_role=arwdDxtm, authenticated=r}` — no INSERT/
UPDATE/DELETE grant to `authenticated` at all; the three RPCs are the only door.

## 5. The four constructed scenarios

**(1) Phone opted_out in org A, granted in org B — B may send, A may not.**
Built directly with `record_channel_consent` as the designer (a member of
both orgs):
```
record_channel_consent(orgA, sms, +15559990001, 'opted_out', ...)
record_channel_consent(orgB, sms, +15559990001, 'granted',   ...)
channel_consent_status(orgA, ...) = opted_out
channel_consent_status(orgB, ...) = granted
```
Isolation holds at the record layer. Traced the actual send-gate code
(`_shared/sms.ts` `channelConsentVerdict` → `resolveProjectOrg` →
`primaryStudioFor` / the project's own `studio_id`) to confirm the gate scopes
to the *project's own* org before ever reading `studio_channel_consent`, so
org B's send reads only org B's row — B's grant cannot see, and cannot be
overruled by, A's refusal. `orgHasOptedOutParty` (the seat-side fallback) is
independently org-scoped the same way (`sms.ts:355-378`). This exact shape is
also unit-tested: `sms.test.ts:977` "another studio's opted-out party row does
not block this studio's granted record."

**(2) A phone with an opted_out party row and no record — refused.** This is
a TS-side decision (`orgHasOptedOutParty` inside `channelConsentVerdict`,
`sms.ts:490,499`), not a bare SQL fact, so I traced the code path and it is
directly covered by an existing, passing unit test:
`sms.test.ts:576` "with no studio record, an opted-out sibling party row in
the SAME studio still blocks (fail closed)" — asserts `res.sent === false`,
`reason === "opted_out"`. Re-ran this file in isolation: passes.

**(3) A STOP then a new recorded grant with evidence — allowed.** Simulated
the rail's own write shape (`writeChannelConsent`, `pipeline.ts:351-440`)
directly in SQL:
```
INSERT ... status='opted_out', refusal_unanswered=true, opt_out_source='inbound_sms', opt_out_evidence='Replied STOP'
→ channel_consent_status = opted_out

UPDATE ... status='granted', refusal_unanswered=false, source='inbound_sms', evidence='Replied START'
→ channel_consent_status = granted
→ opt_out_source/opt_out_evidence UNCHANGED ('inbound_sms'/'Replied STOP') — both acts survive on one row
```
Matches R-Q's composability claim exactly: the refusal's own words and the
grant's own words stand side by side after the sequence.

**(4) A legacy write to `project_parties.sms_consent_status` by an
authenticated member — refused.** As `designer@patina.dev` (an active member
of the row's project's studio):
```
UPDATE project_parties SET sms_consent_status = 'opted_out' WHERE id = ...
→ ERROR: consent_legacy_column_frozen
  HINT: project_parties.sms_consent_* is legacy since 00594. Consent is a
  fact about (studio, channel, value): record it with record_channel_consent()...
```
Also checked the two documented caveats, both confirmed:
- A whole-row UPDATE that *restates* the same values (mentions the columns
  without changing them) still writes — `BEFORE UPDATE OF` fires on mention,
  not on change, exactly as documented.
- The escape hatch (`SET LOCAL app.consent_legacy_write = 'on'`) lets the
  write through, confirmed by reading the value back afterward.

## 6. Infrastructure note: the local DB was not this session's sole owner

Contrary to the task's framing, the shared local Postgres was mutated by a
process outside this review at least twice during the session — once
resetting it back to migration head `00308` (losing 00592-00594 and all seed
data) mid-review, and again later cycling through a full replay while other
commands were in flight. Both times it settled back at the correct head
(`20260910152111`) with the same schema, and every check that depended on DB
state was re-run and reconfirmed *after* the disruption (SQL test suite,
type-gen diff, org ids for the role probes — which changed identity, since
`organizations.id` for the "Leah Hartwell" seed row is randomly generated on
each reset). This is not a finding about the migration itself — reset/replay
was clean and reproducible every time it ran to completion — but it is a
process fact worth surfacing: this local DB had at least one other writer
during the review window. (F4, MINOR/process — not attributable to the code
under review, flagged so the next session isn't surprised by a stale org id
in this file.)

## 7. Readers of `people_directory` / `v_project_roster`

`grep -rln "people_directory|v_project_roster" apps packages` (TS/TSX):

Actual `.from(...)` query sites (the ones that matter — everything else in the
grep hit is a type name, a comment, or a generated-types entry):

| Site | View | Notes |
|---|---|---|
| `packages/supabase/src/hooks/use-people.ts:125,161` | `people_directory` | `select('*')`, plain passthrough — no client-side re-derivation of consent found in this file |
| `packages/supabase/src/hooks/use-coordination.ts:865` | `v_project_roster` | `useProjectRoster`, `select('*')` |

Downstream consumers that read the `sms_consent_status` field off a roster
row (not the raw seat) — checked each for whether it might be reading a stale
seat value instead of the view's function-backed column:

- `apps/designer-portal/src/lib/document/roster-derivation.ts:390` —
  `if (!isSyntheticClientRow(row) && row.sms_consent_status === 'granted') textable += 1;`
  `row` here is a `v_project_roster` row. Verified live: `v_project_roster`'s
  `sms_consent_status` output column is sourced from
  `channel_consent_status()` (00594's repoint), not from
  `project_parties.sms_consent_status` — confirmed by `\d v_project_roster`
  (column present, same name) and by a direct end-to-end query: a seat left at
  `not_asked` with the studio's record at `granted` (fixture F-11's exact
  shape) prints `granted` through `v_project_roster`, not `not_asked`. This
  reader is correct, not stale.
- `apps/designer-portal/src/lib/document/people-derivation.ts:233` — a
  comment only, no field read.
- `packages/supabase/src/hooks/use-clients.ts:411`,
  `packages/supabase/src/hooks/use-vendors.ts:350,406` — comments only,
  referencing `people_directory` as a concept, no query or field read.

No reader was found that bypasses the view/function to re-derive a consent
verdict client-side from raw party-row columns. `people_directory`'s two date
fields (`meta.sms_consented_at`/`.sms_opt_out_at`) do still read the frozen
columns (disclosed in the report §5.3, owed to W1b's v4 rebuild) — this can
print a stale or absent date beside a correct status word, never a wrong
status. No caller was found reading those two date fields in the grep above
(design-system components in `people/`, `roster/` render the status word; a
manual scan of `party-profile-sheet.tsx`, `roster-row.tsx`, `call-sheet.tsx`
found no `.sms_consented_at`/`.sms_opt_out_at` reads).

## 8. Type-check

```
$ pnpm --dir .../agent-people-build --filter @patina/supabase type-check
> tsc --noEmit                                                    (clean, exit 0)

$ pnpm --dir .../agent-people-build --filter @patina/designer-portal type-check
> tsc --noEmit                                                    (clean, exit 0)
```
No type breaks. Consistent with the empty `database.types.ts` diff (§2) — the
one new symbol (`channel_consent_status`) is additive and nothing in either
package's source needed to change to keep compiling.

---

## Findings

### F1 — BLOCKING-pattern, disclosed, narrow: an unresolvable-studio STOP is no longer recorded anywhere, and the legacy seat it used to flip is now frozen

**File:** `supabase/functions/sms-inbound/pipeline.ts:245` (`if (!org)
continue;` inside `studiosHoldingPhone`), combined with
`supabase/migrations/00594_studio_channel_consent.sql` (the freeze trigger)
and the removal of `optOutAllForPhone()`'s phone-global party write.

**Claim:** Before this wave, an inbound STOP wrote `sms_consent_status =
'opted_out'` onto every `project_parties` row on that phone number,
regardless of whether the owning studio could be resolved (report's own
words: "Before this wave the phone-global party write covered it"). After
this wave, the STOP rail writes `studio_channel_consent` only, scoped to
studios it can resolve (`studiosHoldingPhone`/`studiosHoldingRecord`, both
skip a project whose org can't be determined); `project_parties` is frozen
against every writer but `app.consent_legacy_write='on'`. A seat belonging to
a project with `studio_id IS NULL` and a designer holding no active
`design_studio` membership therefore receives **neither** a record **nor** a
seat update when its recipient replies STOP — the reply is acknowledged to
Twilio but leaves no trace anywhere in the system a future send would check.

**Failure scenario:** A project with no resolvable studio, a legacy party row
already at `sms_consent_status = 'granted'` on some phone number, receives a
real STOP from that recipient. Nothing in the database changes. If the same
(unresolvable) designer/project later sends again to that number through this
rail, `channelConsentVerdict`'s phone-global fallback branch (the one branch
that still reduces across all studios, exactly because no studio can be
scoped to) checks `studio_channel_consent` first (empty — nothing was ever
written) and then the legacy party rows for `opted_out` (this seat still
reads `granted` — the STOP never got there either) — verdict `unknown`, and
the legacy `reduceConsent()` gate, seeing a party row that still says
`granted`, would let the send through.

**Why this is BLOCKING by the letter of the rubric, but reported at reduced
practical severity:** it fits "an opt-out can be lost ... without a newly
recorded consent" exactly. In practice the precondition (a designer with zero
active studio membership, sending SMS through a project with no studio_id)
is narrow — such an account likely has little else it can do in the portal,
and the report's own author flagged this exact gap by name in §5.2 as "one
fail-open, narrow and named," explicitly asking for "Fable's call: leave it,
refuse every unattributable send outright, or make an unresolvable org a
loud 500 on the STOP branch." This review did not find a NEW instance beyond
what §5.2 already discloses — it independently confirms the mechanism by
reading `studiosHoldingPhone` (line 245) and tracing `channelConsentVerdict`'s
last branch, and flags that this is a **regression** relative to
pre-00594 behavior (the old phone-global party write covered this exact case;
the new record-only rail does not), which the report states but does not
label as a regression outright.

**Fix:** Not a review-scope fix — the report already asks for a ruling. The
three options it names are all reasonable; the middle one (make an
unresolvable org a loud, alerted 500 on the STOP branch rather than a silent
200) seems the smallest change that restores fail-closed behavior without
resurrecting the tenant-crossing bug R-AK fixed.

### F2 — MAJOR-by-consequence, disclosed: `useRecordPartySmsConsent` now always raises

**File:** `packages/supabase/src/hooks/use-coordination.ts:744-757` (the
`.update({ sms_consent_status: 'pending', ... })` guarded on
`.eq('sms_consent_status', 'not_asked')`), called from
`apps/designer-portal/src/components/document/people/party-profile-sheet.tsx:200`
(`useRecordPartySmsConsent()`), reachable from the live, un-flag-gated
People Room / party profile sheet UI.

**Claim:** The freeze trigger (`refuse_legacy_consent_write_trg`, BEFORE
UPDATE OF the 8 legacy columns) fires on any UPDATE statement that *mentions*
`sms_consent_status` in its SET list, regardless of value — confirmed live in
§5(4). This hook's UPDATE mentions the column unconditionally, so every call
now raises `consent_legacy_column_frozen` instead of recording a consent.

**Failure scenario:** A designer opens a party's profile sheet in the shipped
Call Sheet / People Room UI, tries to record that a contact has been asked
for SMS consent (or has agreed) — the mutation throws a Postgres exception
surfaced through Supabase's client as a runtime error, with no working
substitute shipped in this same wave.

**Why MAJOR and not BLOCKING:** it fails CLOSED — no consent state changes,
nothing is sent, nothing is silently miscounted. It is a functional
regression of a shipped UI action, not a consent-safety hole. It is also
explicitly disclosed: `w1a-report.md` §3 states this raises, and §8 "Not
done" lists "The portal's two UPDATE writers ... W2 replaces them with the
RPCs" as owed work. This finding exists to make explicit, with exact
file:line, that **this wave should not merge/deploy ahead of W2's writer
replacement** — doing so breaks a live designer action with no flag to hide
it behind.

### F3 — MAJOR-by-consequence, disclosed: the phone-edit `revertsToOptedOut` branch of `useUpdateProjectParty` now always raises

**File:** `packages/supabase/src/hooks/use-coordination.ts:596-630` (the
`Object.assign(dbPatch, revertsToOptedOut ? {...} : NOT_ASKED_CONSENT_COLUMNS)`
branch, both arms of which set `sms_consent_status`, followed by
`.update(dbPatch)` on `project_parties`), called from
`useUpdateProjectParty()` at `roster-row.tsx:102` and
`party-profile-sheet.tsx:298` — again live, un-flag-gated UI.

**Claim/scenario:** identical mechanism to F2 — any phone-number edit on a
party row that touches consent columns (the ordinary case: editing a phone
number always runs this branch, since `dbPatch` is built unconditionally when
`patch.phone !== undefined`) now raises `consent_legacy_column_frozen`
instead of applying the edit. A designer correcting a mistyped phone number
on a tracked contact hits a runtime error.

**Why MAJOR and not BLOCKING:** same reasoning as F2 — fails closed, already
disclosed in the report (§3, §8) as owed to W2. Reported here with exact
file:line for the close-out record.

### F4 — MINOR/process: shared local DB had an outside writer during this review

See §6. Not attributable to the code under review; the migration/seed replay
itself was clean and reproducible every time it ran to completion. Flagged so
whoever reads this file next isn't confused by the org UUID quoted in §4/§5
(`61e38fc9-ccd4-4b96-a023-f058fc2db087`) not matching a UUID quoted anywhere
else — it's a randomly-seeded value that changes on every reset, not a fixed
identifier.

### F5 — MINOR, out of scope: pre-existing type-check failure in `fulfillment-po/core.ts`

See §3. Confirmed byte-identical to `origin/main`, untouched by this branch.
Only surfaces because the task's literal `deno test` invocation (without
`--no-check`) type-checks everything reachable, not just the target files.

### F6 — MINOR, out of scope, environment-only: `stripe-rail.test.ts` needs a running `functions serve` + env vars this shell doesn't have

See §3. Confirmed this file fails identically on `origin/main`'s copy in this
same shell; its own header documents the prerequisite. Reachable only via a
manual `deno test -A` invocation outside its intended `run.sh` harness — not
a defect in the file, and unrelated to consent.

---

## Commands run (for replay)

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
  -f supabase/tests/people/w1a_identity_channels_consent_test.sql

SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build db:generate
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build \
  diff --stat packages/supabase/src/database.types.ts

deno test --no-check --allow-all --config supabase/functions/deno.json \
  supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts

pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build \
  --filter @patina/supabase type-check
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build \
  --filter @patina/designer-portal type-check

psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f artifacts/people-room-crm-2026-09-11/build/probe27-ras-single-source.sql
```
