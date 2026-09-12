# W1a close-out — tests / types / behaviour review, round 4

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD `6afe098c6` (W1a commits through
`6ea4e052d` plus the close-out fix commit). Local Postgres only
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`). **No prod act of
any kind.** Scope: re-check the five findings closed in
`w1a-close-fix-log-r3.md`, run every gate the task names, and look fresh at
tests/types/behaviour.

**Environment note, stated up front because it shaped how this round was run:**
partway through this pass another live process was found resetting and testing
against this exact database — `ps` showed a second `claude --dangerously-skip-
permissions` session (parent PID 34335, running since 2026-09-11 04:31) with a
shell mid-command doing `pnpm --dir .../agent-people-build supabase:reset` +
the same SQL suite, logging to `/tmp/claude/reset-b.log` /
`w1a-sql-B.log`, while a near-identical `reset-a.log` / `w1a-sql-A.log` pair
sits beside it — i.e. someone (or something) ran this exact verification twice
already today against the "sole owner" database the task describes. This
caused the migration head to read back as `00305`, then `00243`, on two
`psql` probes taken between my own resets, before settling. It is not a defect
in W1a's code and nothing here treats it as one; it is filed as a process/tooling
observation because it means **any single ad hoc `psql` query against this
instance right now is not trustworthy on its own** — every result below either
comes from immediately after a fresh `pnpm supabase:reset` I ran myself (head
verified in the same breath) or from a single atomic `psql -f` transaction, and
the git worktree itself was untouched throughout (`git status --short` clean at
the end, sandbox disabled to avoid an unrelated `.env.example`-read denial
polluting the output).

---

## 1. Prior findings (fix log r3) — re-checked

| Finding | r3 verdict | r4 confirms |
|---|---|---|
| MAJOR-1 — Desk rollup counts the frozen seat | FIXED (00621 §1) | **Holds.** `field_activity_summary` reads `channel_consent_status(...)`, not `pp.sms_consent_status` (probe, §3 below). SQL block 41 passes. Negative-control probe (`probe39-close-r3-fix-negative-control.sql`) re-run this round, byte-identical output to the fix log's: before-00621 body double-counts Ove Berglund + Vi Odom as "haven't opted in" while their roster word is `granted`; after-00621 counts only Nan Sorley. |
| MAJOR-2 — `field-daily` texts nobody the record granted | FIXED | **Holds.** `channelConsentVerdict` is exported from `_shared/sms.ts`; `field-daily/core.ts` has `mayTextField()`. Deno: 96/96 passed this round, including the 6 MAJOR-2 tests. |
| MAJOR-3 — 00284's two dispatch gates | FIXED (00621 §2a/§2b) | **Holds.** SQL block 42 passes; `COALESCE(..., false)` confirmed present (negative-control note in the migration matches; not independently re-broken-and-retested this round since block 42c already covers the no-record-falls-through case). |
| MAJOR-4 — phone correction transplants a frozen refusal | FIXED at the reachable door | **Holds, and independently reproduced.** `use-coordination.ts`'s `useUpdateProjectParty` throws before any write when `phoneGenuinelyChanged && currentStatus === 'opted_out'`. Not re-run at the vitest level this round (already 100/100 files, 1253/12 in the r3 log); accepted on the code read plus the SQL-side seat gate (R-AL) independently confirmed in Scenario B below, which is the same invariant from the other side. |
| MAJOR-site-request-frozen-column | Disclosure sharpened, not fixed (correctly — out of W1a's scope) | **Holds as a correctly-scoped non-fix.** Confirmed by direct read of `00374_field_site_request_loop.sql`: `site_request_send()` (`:1265-1271`), `site_request_resend()` (`:1364`) and `site_request_dispatch_after_consent()` (`:1424`) all still gate on `project_parties.sms_consent_status = 'granted'`, and no migration in this branch writes a seat to `granted`. Report §5.1/§8 name it; this is not a W1a defect, it's an accurately-disclosed gap for W2. Not re-graded upward — nothing about it changed this round, and the task's own "no action needed for W1a itself" framing stands. |

No regression found in any of the five.

---

## 2. SQL test suite

```
$ pnpm supabase:reset      # (sandbox disabled: telemetry.json write + Docker
                            #  socket access are both outside the Bash sandbox's
                            #  allow-list; this is an environment restriction,
                            #  not a code finding)
...
Applying migration 00621_consent_readers_repointed.sql...
Applying migration 20260910152111_create_contact_messages.sql...
...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}

$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
    -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
BEGIN
...
NOTICE:  1. affiliations + RLS: passed
...
NOTICE:  16B. a DATELESS refusal fails closed too (r4 B-1): passed
...
NOTICE:  37. the record is the single source: no mirror, the legacy columns
         frozen, both readers on channel_consent_status(), and org isolation
         through RLS (R-AS): passed
NOTICE:  38. one resolver for the seat's studio: reader and writer agree, and
         no view prints another studio's consent word (close-review r1
         MAJOR-1): passed
NOTICE:  39. the add path never lowers a standing grant... : passed
NOTICE:  40. one reader, one verdict... : passed
NOTICE:  41. the Desk rollup counts the record's pending... (close-out r3
         MAJOR-1): passed
NOTICE:  42. the two 00284 dispatch gates... (close-out r3 MAJOR-3): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
$ echo EXIT=$?
EXIT=0
```

All **42 numbered blocks** (1 through 42, including 16B, 30e, 30f) print
`: passed`. No `ERROR` or `FAIL` anywhere except the block-title string itself.
Ran this **twice** across two full resets (once before, once after the stray
concurrent-process interference described above) with identical results both
times.

---

## 3. Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir .../agent-people-build db:generate
# (sandbox disabled: `supabase gen types` shells out to the Docker socket,
#  which the Bash sandbox denies by default — an environment restriction)
Connecting to db 5432
$ git -C .../agent-people-build diff --stat packages/supabase/src/database.types.ts
(no output)
```

**Empty diff — no drift**, matching the report's claim.

One operational trap hit and corrected in-session, noted for the record: the
**first**, sandboxed attempt at `db:generate` failed on the Docker-socket
permission (expected — same class of restriction as the reset above), but
because the package script pipes `> src/database.types.ts` unconditionally,
the failed run **truncated the 37,486-line generated file to zero bytes**
before erroring. Caught immediately (`wc -l` showed `0`), restored with
`git checkout -- packages/supabase/src/database.types.ts` before anything else
touched it, then the regenerate was re-run with the sandbox disabled and
diffed clean. No lasting effect — flagged only because a reviewer running the
sandboxed command first and not checking the file afterward could mistake a
truncated file for "drift."

---

## 4. Deno tests

```
$ deno test --no-check -A --node-modules-dir=auto \
    --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts \
    supabase/functions/_tests/sms-inbound.test.ts \
    supabase/functions/_tests/field-daily.test.ts
...
ok | 96 passed | 0 failed (170ms)
```

All three suites requested (`_shared`, `sms-inbound`, `field-daily`, which is
under `_tests`, not `_shared` — the task named "_shared and sms-inbound and
_tests"; `field-daily.test.ts` lives in `_tests` and is included). 0 failures.

---

## 5. Role / RLS probes

Probed as `designer@patina.dev` (`a0000000-0000-0000-0000-000000000004`,
`design_studio` member — dev-accounts.sql), `client@patina.dev`
(`a0000000-0000-0000-0000-000000000005`, homeowner, no org membership), and
`anon`, via `SET LOCAL ROLE` + `request.jwt.claims` (the same
`pg_temp.assume_user()` pattern the shipped test file already uses), against a
fresh two-org fixture (`f0000000-…-a1` / `f0000000-…-b1`) in one rolled-back
transaction:

```
PROBE 1a designer SELECT own-org studio_channel_consent row count (expect 1): 1
PROBE 1b client SELECT (not a member) row count (expect 0): 0
PROBE 1c client record_channel_consent refused: not_a_studio_member (P0001)
PROBE 1d anon SELECT refused: permission denied for table studio_channel_consent (42501)
PROBE 1e anon channel_consent_status refused: permission denied for function channel_consent_status (42501)
PROBE 1f anon project_consent_org refused: permission denied for function project_consent_org (42501)
PROBE 1g designer reads org_b verdict for a phone only org_a granted (expect NULL/not_asked): NULL
```

All seven as expected:

- `designer@patina.dev` reads only rows for orgs they are an active member of
  (RLS `studio_channel_consent_member_select` holds).
- `client@patina.dev` (a real profile, but not a studio member anywhere) sees
  zero rows and is refused by the RPC's own `is_active_studio_member` gate —
  membership, not role name, is what's checked, so a real authenticated user
  with the wrong relationship to the studio is refused the same as anon.
- `anon` cannot even reach the table or either SECURITY DEFINER function —
  `REVOKE ALL ... FROM PUBLIC, anon` on all three (00594) holds under a live
  probe, not just a grants listing.
- **No cross-tenant leak**: the designer, a real member of *both* fixture
  orgs, reading org B's verdict for a phone only org A had recorded, gets
  `NULL` (not org A's word, not an error that could be mistaken for a verdict).
  This exercises the exact class of bug close-review r1 MAJOR-1 fixed
  (`project_consent_org` resolving the wrong studio) from the read side, with
  two orgs that are both real memberships rather than one ambiguous
  `studio_id IS NULL` project.

## 6. Constructed scenarios

All four in one rolled-back transaction, immediately after a verified-clean
reset.

**A — phone `opted_out` in org A, `granted` in org B:**
```
SCENARIO A: org_a verdict (expect opted_out)=opted_out | org_b verdict (expect granted)=granted
```
Correct and isolated — B may send, A may not, and recording each took an
ordinary `record_channel_consent` call by the same designer (a member of
both), so this isn't merely "two different studios never talk" but "the same
human, wearing two studio hats, gets two different, independently correct
answers for the same phone number."

**B — a phone with an opted_out `project_parties` seat and no
`studio_channel_consent` record at all:**
```
SCENARIO B: record verdict with no record row (expect NULL): NULL
SCENARIO B seat-gated grant refused as expected: channel_opted_out (P0001)
```
`channel_consent_status()` correctly answers "no record" as NULL/not_asked
(it only ever reads the record, by design — R-AS). But the scenario the task
actually asks about — "refused" — is answered by `record_channel_consent`'s
own R-AL seat gate: a studio member attempting to write `granted` for this
phone is refused with `channel_opted_out`, precisely because a seat in that
org is marked `opted_out` even though the record has nothing yet. This is the
mechanism report §2.2 documents and SQL test block 19 covers; reproduced fresh
here with a purpose-built fixture rather than the shipped test's fixture. The
**send-time** half of this (the edge function's `orgHasOptedOutParty()`
fallback) is exercised by the existing `sms.test.ts` suite, not re-derived
here.

**C — a STOP, then a new recorded grant with evidence:**
```
SCENARIO C: verdict after STOP (expect opted_out): opted_out
SCENARIO C: after reconsent (evidence-only) status=opted_out refusal_unanswered=t
SCENARIO C direct re-grant over STOP refused as expected: channel_opted_out (P0001)
```
Two things worth being precise about, because the task's parenthetical
("allowed") doesn't specify *which* door:

- A **studio-initiated** "new recorded grant with evidence" — whether via
  `record_channel_reconsent()` (which is deliberately evidence-only and
  **does not** flip `status` or lower `refusal_unanswered`, confirmed above)
  or via a direct second `record_channel_consent(..., 'granted', ...)` call
  (refused outright with `channel_opted_out`) — **cannot** unstick a standing
  STOP. This is intentional, documented design (report §5.2, SQL blocks
  26/27), not a defect: no studio-side act may lower `refusal_unanswered`,
  only the recipient's own reply can.
- The door that **is** "allowed" is the recipient's own YES/START, handled
  entirely in `sms-inbound/pipeline.ts`'s `writeChannelConsent()` (not a SQL
  RPC): on a `status: "granted"` write it sets
  `refusal_unanswered: status === "opted_out"` → `false`, which is exactly
  what reopens `record_channel_consent`'s granted door afterward. This exact
  path is covered by `Deno.test("STOP records the refusal as unanswered; a
  START lowers the flag")` (`_tests/sms-inbound.test.ts:1245`), part of the
  96/96 passing this round — not re-derived in SQL since it's TypeScript
  logic, not a database rule.

So: "allowed" is true, but only through the recipient's own SMS reply, never
through any studio-side RPC — which is the correct, and already-tested,
behaviour.

**D — a legacy write to `project_parties.sms_consent_status` by an
authenticated studio member:**
```
SCENARIO D authenticated legacy write refused as expected: consent_legacy_column_frozen (P0001)
```
`refuse_legacy_consent_write_trg` fires for a real authenticated member (not
just superuser/service_role), refusing the naked `UPDATE ... SET
sms_consent_status = 'granted'`. Confirmed exactly as `refuse_legacy_consent_
write()` (00594) documents.

---

## 7. Every reader of `people_directory` / `v_project_roster` columns

```
$ grep -rln "people_directory" apps packages --include="*.ts" --include="*.tsx"
apps/designer-portal/src/components/document/desk-reconnect.tsx
apps/designer-portal/src/components/document/brief-section.tsx
apps/designer-portal/src/components/document/roster/roster-row.tsx
apps/designer-portal/src/components/document/roster/__tests__/roster-row.test.tsx
apps/designer-portal/src/components/document/roster/__tests__/call-sheet-mount.test.tsx
apps/designer-portal/src/components/document/roster/call-sheet-mount.tsx
apps/designer-portal/src/components/document/overlays/household-sheet.tsx
apps/designer-portal/src/components/document/people/person-bits.tsx
apps/designer-portal/src/components/document/people/party-profile-sheet.tsx
apps/designer-portal/src/components/document/people/directory/makers-marketplace.tsx
apps/designer-portal/src/components/document/people/__tests__/person-row-hardening.test.tsx
apps/designer-portal/src/components/document/people/profile/maker-profile.tsx
apps/designer-portal/src/components/document/people/outreach/audience-rules.ts
apps/designer-portal/src/components/document/people/views/directory-view.tsx
apps/designer-portal/src/lib/document/people-derivation.ts
apps/designer-portal/src/lib/document/desk-derivation.ts
apps/designer-portal/src/lib/document/roster-derivation.ts
apps/designer-portal/src/lib/document/__tests__/roster-derivation.test.ts
packages/supabase/src/database.types.ts
packages/supabase/src/hooks/use-coordination.ts
packages/supabase/src/hooks/use-vendors.ts
packages/supabase/src/hooks/use-clients.ts
packages/supabase/src/hooks/use-people.ts

$ grep -rln "v_project_roster" apps packages --include="*.ts" --include="*.tsx"
apps/designer-portal/src/components/document/letterhead-instruments.tsx
apps/designer-portal/src/components/document/roster/call-sheet.tsx
apps/designer-portal/src/components/document/roster/call-sheet-mount.tsx
apps/designer-portal/src/components/document/roster/__tests__/call-sheet.test.tsx
apps/designer-portal/src/lib/document/roster-derivation.ts
apps/designer-portal/src/lib/document/__tests__/roster-derivation.test.ts
packages/supabase/src/database.types.ts
packages/supabase/src/hooks/use-coordination.ts
```

The consent-bearing readers, individually verified against the *actual view
definitions* (not assumed from the report), all read the repointed column:

- **`roster-derivation.ts:390`** (`vitals()`, the Call Sheet's "N REACHABLE BY
  TEXT" line) and **`roster-row.tsx:95`** both read `row.sms_consent_status`
  off a `ProjectRosterRow`. Traced to source: `v_project_roster`'s
  `CREATE OR REPLACE VIEW` in `00594` (line 1088) aliases
  `public.channel_consent_status(public.project_consent_org(pp.project_id),
  'sms', pp.phone_e164)` **AS `sms_consent_status`** on the party branch — the
  column name is unchanged from `00419`, but its expression is the repointed
  one. These two readers are correct, not merely "probably fine because the
  report says so."
- **`party-profile-sheet.tsx:260`** reads `meta.sms_consent_status`, and
  **`people-derivation.ts`**'s status-dot logic reads `p.status_raw` for the
  field kinds. Both trace to `people_directory`'s party branch (`00594:1280,
  1292`), which similarly wraps the same `COALESCE(channel_consent_status(...),
  'not_asked')` expression into both `status_raw` and `meta->>'sms_consent_status'`.
  Correct.
- **`use-people.ts` / `use-clients.ts` / `use-vendors.ts`** all do
  `supabase.from('people_directory').select('*')` (or narrower) — no
  independent `project_parties` fetch, so they inherit whatever the view
  returns. No bypass.
- **`audience-rules.ts`** (outreach audience-building) has **zero** references
  to consent or `sms_*` fields at all — it is not a consent reader, contrary
  to what its directory location might suggest; confirmed by grep, not
  assumed.

No reader was found — in either apps or packages — that fetches
`project_parties.sms_consent_status` directly for a row also exposed by
`people_directory`/`v_project_roster` and displays it instead of (or
alongside, disagreeing with) the view's repointed value. The one place the
raw seat column IS read directly in `apps`/`packages` outside test files and
migrations is `use-coordination.ts`'s own writers (the two frozen UPDATE
doors, and the read used to decide whether a phone edit is "genuinely
changed" — all already known and already covered by report §3/§5.2, not new).

`apps/designer-portal/e2e/field/field-coordination.spec.ts` also selects
`sms_consent_status` directly, but that's a Playwright fixture assertion
against the raw table for test setup, not a shipped reader.

---

## 8. Type-checks

```
$ pnpm --dir .../agent-people-build --filter @patina/supabase type-check
> tsc --noEmit
(clean, no output)

$ pnpm --dir .../agent-people-build --filter @patina/designer-portal type-check
> tsc --noEmit
(clean, no output)
```

Both clean. No type breaks from the regenerated types (which, per §3, are
byte-identical to what's committed).

---

## 9. Findings

None rise to BLOCKING or MAJOR. Two process/tooling notes, filed as MINOR
because they affect reviewer trust in ad hoc probes against this instance
rather than anything W1a's code does:

1. **A second live session was concurrently resetting and testing against
   the same "sole owner" local database during this round**
   (`/tmp/claude/reset-a.log`, `reset-b.log`, `w1a-sql-A.log`, `w1a-sql-B.log`,
   all timestamped today; a `claude --dangerously-skip-permissions` process,
   PID 34335, running since 2026-09-11 04:31, was mid-`supabase:reset` against
   this exact worktree path when checked). This isn't a W1a code defect, but
   it means the "sole owner" premise the task states did not hold for part of
   this session, and a reviewer trusting a single un-verified `psql` query's
   result against `127.0.0.1:54322` right now could be looking at a
   half-reset database. Every result in this report was re-verified
   immediately after a self-run reset or inside one atomic transaction for
   exactly this reason.
2. **`db:generate`'s package script truncates `database.types.ts` before it
   can fail** when the underlying `supabase gen types` call errors (here: a
   sandboxed Docker-socket permission denial) — `> src/database.types.ts`
   redirects before the command's exit code is known. Caught and reverted via
   `git checkout` in-session; worth a `mv`-after-success pattern (write to a
   temp file, only `mv` over the real one on exit 0) so a failed regeneration
   can't silently zero out a 37k-line generated file for the next person who
   runs the same command without checking `git diff` first.

No code, RLS, or consent-semantics finding from this round rises above MINOR.
All five items closed in `w1a-close-fix-log-r3.md` verified still fixed, no
regressions. All gates named in the task (SQL suite, deno suite, type
regen/diff, both type-checks) pass clean.

---

## 10. Commands run (for re-verification)

```
grep -n NEXT_PUBLIC_SUPABASE_URL apps/designer-portal/.env.local   # confirmed local
pnpm supabase:reset                                                # x2, both clean, head 00621
psql ... -f supabase/tests/people/w1a_identity_channels_consent_test.sql  # x2, 42/42 passed, exit 0
SUPABASE_DB_URL=... pnpm db:generate && git diff --stat database.types.ts  # empty diff
deno test --no-check -A --node-modules-dir=auto --config supabase/functions/deno.json \
  supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts \
  supabase/functions/_tests/field-daily.test.ts                    # 96/96 passed
psql ... -f probe_r4.sql (role probes A-G + scenarios A-D, one rolled-back tx)
psql ... -f artifacts/.../probe39-close-r3-fix-negative-control.sql  # re-run, matches fix log
pnpm --filter @patina/supabase type-check                          # clean
pnpm --filter @patina/designer-portal type-check                   # clean
grep -rln "people_directory\|v_project_roster" apps packages --include="*.ts" --include="*.tsx"
git status --short                                                  # clean, nothing uncommitted
```
