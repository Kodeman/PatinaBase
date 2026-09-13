# W1a — round 6 review: tests, types, behaviour

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD `9efdbeb55`. Local Supabase
only — no `supabase db push`, no `supabase functions deploy`, no Strata
contact. Read `build/w1a-report.md` (full, both pages) and
`build/w1a-fix-log-r5.md` (all three appended rounds: the R5-M1..M4 round, the
"R5-M1/R5-M2" mirror-append round, and the r9 "review round 9" round) before
running anything.

Re-check of prior findings (`w1a-fix-log-r5.md`): **all five are fixed and
still hold** — B5-1/R-AL (block 19 passes; my own role probe below confirms
the RPC is still the only write door), M5-1/R-AM (`_primary_studio_for` is
still revoked from every PostgREST role — reconfirmed below — and the rail's
`primaryStudioFor()` reads `organization_members`/`organizations` instead),
M5-2/R-AN (block 18 passes), M5-3/R-AO (block 20 passes), M5-4/R-AP (block 21
passes). The two later-appended rounds (R5-M1 "seat borrowed the studio's
consent as the refusal's words", R5-M2 "seat borrowed the grant's recorder")
are also fixed and covered (blocks 27/29). Nothing regressed.

---

## 1. SQL tests — `supabase/tests/people/w1a_identity_channels_consent_test.sql`

```
$ pnpm --dir .../agent-people-build supabase:reset   # sandbox disabled: EPERM on
                                                       # ~/.supabase/telemetry.json,
                                                       # matches the fix log's own note
Applying migration 00592_people_cards_affiliations_rules.sql...
Applying migration 00593_studio_contact_channels.sql...
Applying migration 00594_studio_channel_consent.sql...
...
Finished supabase db reset on branch main.

$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  1. affiliations + RLS: passed
NOTICE:  2. channel normalisation: passed
...
NOTICE:  29. a held card cannot change what it is or whose it is — including the
         card a contact rule is filed against (r8 R8-M2, R-AR; r9 R5-M1): passed
NOTICE:  30. the fold picks the sibling that HOLDS the refusal ... (r2 R2-M1): passed
NOTICE:  30e. a grant's paperwork is never filed as the refusal's own words, and
         the wordless refusal reaches both seats (r4 R4-M1): passed
NOTICE:  31. a rule is filed under the noun its subject actually is (r8 F1): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

Exit code 0, `ROLLBACK` at the end (test file is self-contained and leaves no
state). **32 blocks, all pass** — 1–31 plus 16B and 30e.

## 2. `db:generate` + types diff

First attempt (immediately after `supabase:reset`) produced a **corrupted
regen**: `packages/supabase/src/database.types.ts` came back as a 179-line
empty-schema stub (`public: { Tables: { [_ in never]: never } ... }`) with
**exit 0 and no error text** — see finding T-1. A second, identical invocation
seconds later regenerated the full 37,439-line file correctly:

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir .../agent-people-build db:generate
$ git diff --stat -- packages/supabase/src/database.types.ts
(empty)
```

**Empty diff — confirmed clean** after the good run. `grep -c
studio_channel_consent packages/supabase/src/database.types.ts` → 12, so the
new table is present; the committed file matches what the local schema now
generates, byte for byte.

## 3. Role probes

`project_site_access_cards` **does not exist in this database** —
`information_schema.tables` returns nothing for it. It is explicitly listed in
`w1a-report.md` §5 under "Out of W1a scope by instruction," so the "site
access card" half of this task's instructions targets a table this wave never
built. Treated as informational (F-2 below), not a finding against the code.
Probed the four tables W1a *did* ship instead, against a rolled-back fixture
(one card + affiliation + channel + rule + consent record in the designer's
own studio, `b0000000-0000-0000-0000-000000000001`, plus a sibling card in an
unrelated studio):

- **service_role**: sees all 3 contact rows (own-studio ×2 + other-studio ×1)
  and all 4 new-table rows. Baseline confirmed.
- **`designer@patina.dev`** (`a0000000-…-004`, owner of `Local Dev Studio` /
  `b0000000-…-001`, per `supabase/seed/dev-accounts.sql:12`): sees exactly its
  own studio's channel, rule, affiliation and consent row (1 each); the
  other-studio contact card is **invisible** (0 rows) — RLS holds. A **direct
  `INSERT` into `studio_channel_consent`** as `authenticated` is refused with
  `insufficient_privilege` — confirms decision 5 ("the RPC is the only write
  door, by privilege, not by convention") still holds on this HEAD.
- **`client@patina.dev`** (`a0000000-…-005`, homeowner, no
  `organization_members` row at all): sees **0 rows** on all four tables.
- **anon**: gets `permission denied` (not merely an empty result set) on
  `studio_contacts`, `studio_contact_channels`, `studio_contact_rules`,
  `studio_person_affiliations` and `studio_channel_consent` — no `SELECT`
  grant exists at all, RLS is never even reached. Matches the report's §3
  privilege table exactly.

`assert_studio_contact_identity_stable()`'s live body was pulled with
`pg_get_functiondef` and compared line-for-line against the fix-log's r9
description: five holders (channels, designations, rule *routes*, rule
*subjects* restricted to `subject_type IN ('person','company')`, affiliations)
— `engagement`-typed rule subjects are correctly excluded, exactly as
documented. No drift between the fix log's prose and the shipped function.

## 4. Edge functions

```
$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared
ok | 418 passed | 0 failed (1s)

$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/sms-inbound
error: No test modules found
```

The second result is **expected and documented** (`w1a-report.md` §3: the
suite lives at `supabase/functions/_tests/sms-inbound.test.ts`, not under
`sms-inbound/`). Running the actual location:

```
$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_tests/sms-inbound.test.ts supabase/functions/_shared/sms.test.ts
ok | 71 passed | 0 failed (93ms)

$ deno test --no-check --allow-all --config supabase/functions/deno.json \
    supabase/functions/_tests/ supabase/functions/_shared/
FAILED | 694 passed | 1 failed (2s)
  ./supabase/functions/_tests/stripe-rail.test.ts (uncaught error): supabaseKey is required.
```

Both numbers (`71 passed`, `694 passed | 1 failed`) match the report and fix
log exactly. The `stripe-rail.test.ts` failure is pre-existing/unrelated (env
file not loaded outside its own test-runner invocation) — confirmed by the
error text naming `supabaseKey is required`, nothing touched by this wave.

```
$ deno check --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.ts supabase/functions/sms-inbound/pipeline.ts
Check supabase/functions/_shared/sms.ts
Check supabase/functions/sms-inbound/pipeline.ts
```

Clean.

### Constructed failure cases (independent — not re-running the shipped suite)

Wrote a standalone Deno test file exercising `sendPartySms()` from scratch
against two fixtures, to independently verify the two scenarios named in this
task rather than trust the shipped assertions of the same shape:

**Case A — a phone opted out in org A, granted in org B.**
- 1a: a send scoped to org A's project, where org A's own
  `studio_channel_consent` record is `opted_out` (org B's is `granted` on the
  same `+1555…` number) → **refused**, `reason: "opted_out"`.
- 1b: the same number, send scoped to org B's project, where org B's own
  record is `granted` (org A's is `opted_out`) → **sent**.
- Neither leaked the other tenant's verdict in either direction.

**Case B — a phone with no consent record, but an `opted_out` party row.**
- 2a: no `studio_channel_consent` row anywhere; a sibling `project_parties`
  seat on the same number, **same studio**, reads `opted_out` → the fail-closed
  fallback (`channelConsentVerdict`'s no-record branch → `orgHasOptedOutParty`)
  **refuses** the send, `reason: "opted_out"`.
- 2b: identical shape, but the opted-out sibling seat is in a **different**
  studio → the send **proceeds** — confirms R-AK (the fallback reduces across
  the sending studio's own projects only, never across tenants).

```
$ deno test --no-check --allow-all --config supabase/functions/deno.json <probe file>
FAILURE CASE 1a ... ok (9ms)
FAILURE CASE 1b ... ok (10ms)
FAILURE CASE 2a ... ok (0ms)
FAILURE CASE 2b ... ok (0ms)
ok | 4 passed | 0 failed (23ms)
```

All four behave exactly as `sms.ts`'s own `channelConsentVerdict()` comment
(lines 383–439) and decision 13/R-AK claim. No daylight found between the
narrated gate logic and its actual runtime behaviour.

## 5. Readers of `people_directory` + type-check

`grep -rl people_directory apps packages --include='*.ts' --include='*.tsx'`
found 18 files under `apps/designer-portal` (roster/brief/people-directory
components, `desk-derivation.ts`, `people-derivation.ts`,
`roster-derivation.ts`, and their tests) and 5 under `packages` (generated
types, `use-vendors.ts`, `use-people.ts`, `use-coordination.ts`,
`use-clients.ts`).

**W1a does not touch `people_directory` at all.** Its rebuild is explicitly
named under `w1a-report.md` §5 "Out of W1a scope by instruction," and a grep
of all three new migrations (`00592`–`00594`) for `CREATE OR REPLACE VIEW`
turns up nothing naming that view — confirmed by reading the view's live
definition (`00589_return_to_lead_hardening.sql:696-937`, most recent
`CREATE OR REPLACE VIEW public.people_directory`), which selects an **explicit
column list** off `studio_contacts`/`project_parties` (no `sc.*`), so the
fifteen new `studio_contacts` columns 00592 adds cannot leak into or reorder
its output. Every one of the 23 readers above is therefore structurally
unaffected by this wave — not because the view was rebuilt to keep satisfying
them, but because the view was never touched.

```
$ pnpm --dir .../agent-people-build --filter @patina/supabase type-check
> tsc --noEmit
(clean, no output)

$ pnpm --dir .../agent-people-build --filter @patina/designer-portal type-check
> tsc --noEmit
(clean, no output)
```

Both clean. No type breaks anywhere in `apps/designer-portal` or
`packages/supabase` from the regenerated `database.types.ts` — expected, since
the diff against the committed file is empty (§2) and every column this wave
adds is additive (`ADD COLUMN`, new tables), never a narrowing or removal of
an existing column a reader depends on.

---

## Findings

### T-1 — MINOR, confidence: HIGH — `db:generate` silently produced an empty-schema stub immediately after `supabase:reset`

`packages/supabase/package.json:15` (`generate` script);
observed via `pnpm --dir .../agent-people-build db:generate` run seconds after
`supabase:reset` finished ("Restarting containers…").

The very first `db:generate` invocation in this round returned exit 0, no
stderr, and overwrote `database.types.ts` with a 179-line stub containing
`public: { Tables: { [_ in never]: never } }` — i.e. the CLI introspected an
apparently-empty or not-yet-ready Postgres and printed a *valid, empty*
schema rather than erroring. `git diff --stat` against that file showed
"37,269 deletions" — which, read naively right after a reset-then-regen
sequence, looks exactly like "the migrations broke the schema," when the real
cause was a race between the reset's container restart and the CLI's
connection. A second, immediate retry of the identical command succeeded and
reproduced the committed file exactly (empty diff).

This is not a defect in W1a's migrations or code — the SQL and Deno suites
both ran cleanly against the same stack seconds apart. It's a **process
hazard**: any script or CI step that chains `supabase:reset && ... &&
pnpm db:generate && git commit` without checking the *shape* of the diff (only
"is it empty/non-empty," not "did it just delete 37k lines and add 9") could
silently commit a destroyed types file. Suggest either a short readiness wait/
retry-with-backoff around `db:generate` after a reset, or a sanity assertion
in whatever CI step runs it (e.g. `grep -q '\[_ in never\]: never' && exit 1`
on the `public` schema block, or a minimum line-count floor) so this fails
loudly instead of committing silently.

**Fix**: none applied — reported per instructions; not this wave's code to
change, and the committed `database.types.ts` in this branch is verified
correct (§2).

### T-2 — MINOR, confidence: HIGH — `w1a-report.md` §3 is stale by two test blocks and two decisions relative to the current HEAD

`artifacts/people-room-crm-2026-09-11/build/w1a-report.md` (§2 decisions list,
§3 SQL-test transcript and narrative), vs.
`supabase/tests/people/w1a_identity_channels_consent_test.sql` (blocks 30e and
31) and commits `e0df228f9` ("a contact rule is filed under the noun its
subject actually is (r8 F1)") and `6541f1a8e` ("refusal words only off a
refusing row; rule-only sms token").

The report's transcript in §3 ends at block 30 / "31 blocks (1–30 plus 16B)."
The actual test file at HEAD has 32 blocks (adds 30e and 31). Grepping the
whole report for `F1`, `rule-only`, `rule_subject_kind_mismatch`, `30e`, and
`block 31` returns **zero matches** — the r8 F1 fix (a contact rule filed
under the wrong noun, `rule_subject_kind_mismatch`) and the "rule-only sms
token" work are real, shipped, tested code (confirmed live via
`pg_get_functiondef` in §3 above and passing in the SQL suite), but the
report's decisions list (1–25) and block-by-block narrative never describe
them. `w1a-fix-log-r5.md`'s r9 section *does* reference `00592:929-937` and
"added for r8 F1" in passing (inside its own R5-M1 writeup), so the fix
existed and was known before the r9 fix-log round — but the main report was
never brought current with it.

Functionally inert (everything it describes still passes; nothing it
describes is wrong) — but a reviewer or the next wave (W1b) reading only
`w1a-report.md` would not know a rule's `subject_id` is guarded, or that a
rule-only `sms` channel token exists in the vocabulary, without cross-checking
the fix log or the migration source directly.

**Fix**: add a decision entry (or an appendix note) for r8 F1 and the
rule-only `sms` token, and extend §3's block count/narrative to 32 (through
30e/31), the same way each prior round's fix-log entry did for its own
blocks.

### F-1 — INFORMATIONAL — task instruction (3) names a table this wave does not build

The "site access card" probe requested in the task ("assert the site access
card is invisible outside the studio") targets `project_site_access_cards`,
which does not exist in this database (`information_schema.tables` — no row)
and is explicitly listed in `w1a-report.md` §5 under "Out of W1a scope by
instruction." Not a finding against W1a; noted so the gap in task/wave scope
is visible rather than silently skipped. Probed the four tables W1a *did*
ship instead (§3 above), which is the closest available equivalent.

### F-2 — INFORMATIONAL — task instruction (5) presumes a rebuilt `people_directory` view that this wave does not ship

Same shape as F-1: "whether the new view still satisfies it" presumes W1a
redefines `people_directory`. It does not — confirmed by grepping all three
new migrations for `CREATE OR REPLACE VIEW` (no match) and by
`w1a-report.md` §5, which lists "the `people_directory` rebuild" as explicitly
out of scope. Answered the underlying question instead: are the 23 existing
readers still satisfied *by the wave that shipped*, given `people_directory`
is untouched and its column list is explicit (not `sc.*`) — yes (§5 above).

---

## Verdict

**Clean** in the sense this task defines it: zero blocking, zero major
findings. Two minor findings, both informational/process in nature (T-1: a
transient `db:generate` race, not attributable to this wave's migrations or
code, self-corrected on retry, and the committed types file is verified
correct; T-2: report documentation drift by two test blocks/decisions, code
and tests both correct and passing). Every SQL test block (32/32), every Deno
test (418 + 71, and 694/695 with the one pre-existing unrelated failure),
every role probe, every independently-constructed failure case, and both
requested type-checks came back exactly as `w1a-report.md` and
`w1a-fix-log-r5.md` claim — no drift between narration and shipped behaviour
anywhere I could reach.
