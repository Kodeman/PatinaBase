# W1a final review, round 1 — tests, types, behavior

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`, branch
`build/people-room-crm-2026-09-11`, head `a6b98fc18` (migration `00622`). Local
Supabase only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`), which this
wave owns exclusively for this pass — reviewed under `dangerouslyDisableSandbox` only
for `supabase db reset` (its telemetry-file write is outside the sandbox's writable
set; unrelated to the migrations themselves) and one `pnpm --dir … db:generate` call
(same cause). Every SQL/behavior probe ran inside the default sandbox.

This round independently re-derives the report's central claims rather than
re-running only the shipped suite: fresh reset, the shipped SQL suite from that
reset, my own hand-built fixtures for the seven named scenarios (org isolation, no
record, fold-then-START, legacy-write refusal, RLS-as-designer/client/anon, and an
independently-constructed site-request release), a negative control injected into
`_shared/sms.ts` to confirm the Deno suite is not tautological, and line-by-line
reads of every function/trigger/view body the report describes, plus every reader
of `people_directory` / `v_project_roster` in the portal and Patina Field.

## Result: clean

Zero BLOCKING, zero MAJOR. Two MINOR/informational notes below, neither a defect.

## 1. Reset + SQL test suite

```
$ pnpm supabase:reset   (dangerouslyDisableSandbox: true — telemetry.json write only)
… Applying migration 00622_consent_record_is_the_only_gate.sql...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}

$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
EXIT=0
$ grep -c ": passed" output.txt
46
$ grep -iE "error|fail" output.txt | grep -v ": passed"
(no matches)
NOTICE:  All W1a assertions passed.
ROLLBACK
```

Re-run again after all probing below (including a live regression injected into
`_shared/sms.ts`, then reverted) — still exit 0, still 46 passed, DB still on head
`00622` with zero stray rows from any of my fixtures (all wrapped in
`BEGIN; … ROLLBACK;`, confirmed by re-querying for the `99999999%`-prefixed ids I
used — zero rows in `organizations`, `organization_members`, `projects`,
`studio_channel_consent`, `project_parties`).

## 2. Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir .../agent-people-build db:generate    # GEN_EXIT=0
$ diff -u before.ts packages/supabase/src/database.types.ts | wc -l
0
$ git -C .../agent-people-build diff --stat packages/supabase/src/database.types.ts
(empty)
```

Confirmed empty, matching the report's claim exactly.

## 3. Role probes — independently constructed, not the shipped fixtures

Full script and output: `/tmp/claude/probe_r1_independent.sql` /
`/tmp/claude/probe_r1_output3.txt` (session-local; reproduce by re-running the
script below against the same DB). Built fresh orgs A (`…a1`) and B (`…b1`), with
`designer@patina.dev` (`a0000000-0000-0000-0000-000000000004`) a real
`organization_members` owner of both — a genuine two-studio designer, the same
shape the report's own probe29/probe fixtures use. `client@patina.dev`
(`…005`) holds no organization membership at all.

| Scenario | Result |
|---|---|
| Phone opted_out in org A, granted in org B | `channel_consent_status`: org A → `opted_out`, org B → `granted` — both as postgres and as the designer via real `SET LOCAL ROLE authenticated` + `request.jwt.claims` (SECURITY INVOKER + RLS honored the JWT, not just table ownership) |
| No record at all | `channel_consent_status` → SQL `NULL`; the word a reader prints (`COALESCE(…, 'not_asked')`) → `not_asked`, which `channelConsentVerdict` branch 4 refuses |
| A fold refusal (`opted_out`, `refusal_unanswered=true`) then the recipient's own START, written the way the inbound rail writes it (service_role UPDATE: `status='granted', refusal_unanswered=false, consented_at=now(), source='inbound_sms'`) | `channel_consent_status` → `granted`; the **frozen seat itself stays `opted_out`** (proving the record, not the seat, is read); `v_project_roster` prints `granted` both as postgres and as the designer via RLS; `people_directory` prints `granted` in both `status_raw` and `meta.sms_consent_status` |
| The same org-A record/seat, read as `client@patina.dev` (no membership, not this project's client) | `channel_consent_status` → `NULL`, no error; `v_project_roster` row count → `0` (RLS on `project_parties` denies) — no cross-tenant leak |
| The same read, as `anon` | `channel_consent_status` → `42501 permission denied` (function REVOKEd from anon, confirmed live); `v_project_roster` → `42501 permission denied for table profiles` (the view's team-branch join fails outright for anon) |
| Legacy write to `project_parties.sms_consent_status` by a studio member (the designer, via `SET LOCAL ROLE authenticated` — a real RLS-authorized writer, not superuser) | `P0001: consent_legacy_column_frozen` — refused, exactly as claimed, and not merely because RLS blocked it (RLS's `project_parties_designer_all` policy would have allowed the write; the freeze trigger fired independently of RLS) |
| Org isolation, direct table read | Designer sees exactly 2 rows under org A's id and 1 under org B's id via `studio_channel_consent`'s `is_active_studio_member` policy — no bleed either direction |

## 4. Site-request release — independently constructed, not the shipped fixture

Built a fresh org/project/party/site-request/item/version chain (ids prefixed
`99999999-...-c1`) rather than reusing the shipped test's rows. Script:
`/tmp/claude/probe_r1_site_request.sql`.

1. `site_request_send()` on a never-asked assignee, called as the designer via
   real RLS: **no raise**, request parks `awaiting_consent`,
   `consent_status_snapshot = 'not_asked'`. The seat stays `not_asked` (send
   door writes no seat).
2. `record_channel_consent(org, 'sms', phone, 'granted', …)` recorded as the
   same designer.
3. The parked request, re-read: `consent_status_snapshot = 'granted'`,
   `expires_at` now set — released by the `AFTER INSERT OR UPDATE OF status`
   trigger on `studio_channel_consent`, with **the seat still `not_asked`**
   throughout (release trigger writes no seat either).
4. Confirmed `status` itself stays `awaiting_consent` (not `sent`) after
   release — read `site_request_dispatch_after_consent`'s body directly: it
   enqueues a `consent-granted` dispatch row rather than flipping `status`
   synchronously, and that body, comment, and shape are 00374:1395-1460
   verbatim (unchanged by this pass) — not a defect, a pre-existing async
   dispatch design.

## 5. Deno tests + negative control

```
$ deno test --no-check -A --node-modules-dir=auto --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts \
    supabase/functions/_tests/field-daily.test.ts
ok | 103 passed | 0 failed (141-151ms), run twice, both clean
```

`deno test --allow-all` across all of `_shared`, `sms-inbound`, and `_tests`
(the literal command given) type-checks the whole edge-function tree first and
fails on a **pre-existing, unrelated** error: `fulfillment-po/core.ts:314`
(`Uint8Array` vs `ArrayBuffer` in `encodeBase64`). Confirmed via
`git log -- supabase/functions/fulfillment-po/core.ts` that this file predates
and is untouched by this branch's consent commits — not this pass's defect, and
the report's own commands use `--no-check` for exactly this reason.

**Negative control** (not the report's own — a fresh one, to confirm the suite
isn't tautological): edited `_shared/sms.ts`'s `channelConsentVerdict` so the
"no record" branch returned `"allow"` instead of `"refuse"`. Re-ran the
`R-AW`-filtered subset: **2 failed** (`no studio record at all the send is
refused`, `no record refuses even a seat frozen at granted`), both with the
exact assertion messages you'd want from a real regression. Restored the file;
`git diff --stat` on it is empty; full 103-test run is green again.

Read (not just ran) the following against the report's prose, confirming each
matches the live source rather than trusting the description:

- `channelConsentVerdict` (`_shared/sms.ts:394-`): the four branches (resolve
  failure → refuse; no record → refuse; `refusal_unanswered` → refuse;
  `granted`→allow / `pending`→unknown / else refuse) are exactly as described,
  in that order.
- `studiosHoldingPhone` / the STOP gate (`sms-inbound/pipeline.ts:249-`,
  `:776-800`): the STOP branch checks **all five** conditions named in the
  code's own comment (`stopPhoneParties.failed`, `stopRecordStudios.failed`,
  `stopPartyOrgs.failed`, `stopPartyOrgs.unattributed`, `stopWrite.failed`) and
  releases the `twilio_sid` claim (`.update({ twilio_sid: null })`) before
  answering 500/`opt_out_incomplete` — matches R-AT/R-AW verbatim.
- `studiosHoldingRecord` (`:314-`): filters on `recordVerdict(r)` (folds
  `refusal_unanswered`), not the raw `status` column — matches R-AU.
- `writeChannelConsent` (`:417-`): a failed prior-read **and** a failed upsert
  both set `failed = true` — matches the close-review r1 BLOCKING-1 claim.
- The four consent RPC bodies (`record_channel_consent`,
  `record_channel_reconsent`, `record_channel_invite`,
  `channel_consent_status`): grepped for `project_parties` / `sms_consent_` —
  **zero matches** in all four. Confirms probe 1's `reads_seat_col = f`
  independently of the report's own probe script.
- `fc_dispatch_court_assignment` (00621): read the live function body —
  dispatches on `record = granted OR seat = granted` — matches the "can only
  be more permissive, never less" description; the send gate downstream is the
  actual backstop, and that gate reads the record only.
- `useAddProjectParty` (`use-coordination.ts:460-499`): confirmed
  `record_channel_invite` RPC fires **before** the `project_parties` INSERT,
  exactly as §3/§5.1b(c) describe.
- `roster-derivation.ts:390`'s `vitals()` textable counter: confirmed its
  input type (`ProjectRosterRow`) is sourced from `v_project_roster`
  (`use-coordination.ts:1008`), so it reads the record's verdict, not the
  frozen seat, contrary to what a naive read of the type name might suggest.
- Patina Field (`SupabaseSiteRequestService.swift:17`,
  `PunchTaskWrite.swift:34-101`): confirmed these still `select` and gate on
  `project_parties.sms_consent_status` directly — genuinely dead as the report
  says. This is **R-AV, ruled and named W2** in `rulings.md` §3 and disclosed
  as "Not done" in the report's own §8 — settled, not a new finding, and it
  fails *closed* (routes to `.noCourt`, sends nothing) rather than open.

## 6. Migration replay + legacy grants

```
$ psql … BEGIN; -f 00621_consent_readers_repointed.sql; ROLLBACK;   EXIT=0
$ psql … BEGIN; -f 00622_consent_record_is_the_only_gate.sql; ROLLBACK;   EXIT=0
$ python3 scripts/generate-legacy-grants.py
wrote …00-legacy-grants.sql — baseline + 2651 replayed statements
$ diff -q before.sql supabase/seed/00-legacy-grants.sql
(identical)
$ git status --short supabase/seed/00-legacy-grants.sql
(clean)
```

Migration numbering: `ls supabase/migrations/ | grep '^006(1|2)'` shows exactly
`00621` and `00622`, no gap, no collision, and confirms `00595`–`00620` are
absent from this branch (reserved for the other program, untouched).

## 7. Type-checks

```
$ pnpm --dir .../agent-people-build --filter @patina/supabase type-check
tsc --noEmit   EXIT=0
$ pnpm --dir .../agent-people-build --filter @patina/designer-portal type-check
tsc --noEmit   EXIT=0
```

Both clean. No type breaks from the regenerated `database.types.ts` (which, per
§2, has no diff to begin with).

```
$ deno check --no-lock --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.ts supabase/functions/field-daily/core.ts \
    supabase/functions/sms-inbound/pipeline.ts
EXIT=0
$ ls deno.lock supabase/functions/deno.lock
No such file or directory (both) — confirmed no stray lockfile
```

## 8. Readers of `people_directory` / `v_project_roster` in apps/packages

`grep -rln "people_directory\|v_project_roster" apps packages` (TS/TSX only) —
25 files. Cross-checked every one that names `sms_consent*`:

- `apps/designer-portal/src/lib/document/roster-derivation.ts:390` — reads
  `v_project_roster`'s folded verdict (§5, confirmed correct).
- `apps/designer-portal/src/lib/document/roster-derivation.ts:145` — a
  synthetic client row hard-codes `sms_consent_status: null` (never texted;
  not a consent path).
- `packages/supabase/src/hooks/use-coordination.ts` — the portal's own
  **writers** to the frozen columns (`useAddProjectParty`,
  `useUpdateProjectParty`'s `revertsToOptedOut` branch,
  `useRecordPartySmsConsent`). All three are explicitly named in the report's
  §5.1b(c) as raising `consent_legacy_column_frozen` in a sentence, owed to
  W2. Confirmed by reading the RPC-call sites and the frozen-column UPDATE
  calls directly (lines 495-499, 715-727, 884-893) — matches the report
  exactly, nothing concealed.

No reader outside those already named by the report touches
`sms_consent_status` off a raw `project_parties` select for a send/verdict
decision; `apps/mobile/Capture` is Swift and outside this grep, checked
separately in §5.

## 9. Findings

Two MINOR/informational notes. Neither is BLOCKING or MAJOR under the given
severity classes (no send-on-opted_out path, no lost/overwritten opt-out, no
cross-tenant read/write, no RLS/grant hole that actually admits a read, no
reset/replay failure, no evidence-destroying write path).

### F1 — MINOR — stale line count in the report's own verification section

- **File**: `artifacts/people-room-crm-2026-09-11/build/w1a-report.md:497`
- **Claim**: "`supabase/tests/people/w1a_identity_channels_consent_test.sql`
  (4,765 lines, one transaction, ROLLBACKed)."
- **Actual**: the file is 6,061 lines as of head `00622` (`wc -l`). The 4,765
  figure describes an earlier revision, before the R-AW pass appended block 44
  and its fixtures; the surrounding prose was never updated after that
  amendment.
- **Confidence**: high (direct `wc -l` against the file cited).
- **Fix**: update the line count in that sentence (or drop the number and say
  "one transaction, ROLLBACKed" only) the next time this report is touched.
  No code or behavior implication.

### F2 — MINOR — local-only blanket `anon` GRANT on the two consent-adjacent views (confirmed inert, not a live hole)

- **File**: `supabase/seed/00-legacy-grants.sql` (generated;
  not a migration under this branch's control) — surfaced by
  `information_schema.role_table_grants` on this local DB.
- **Claim under test**: whether `anon` can read any SMS-consent-bearing fact
  through `v_project_roster` or `people_directory`.
- **Observation**: locally, `anon` holds blanket `SELECT`/`INSERT`/`UPDATE`/
  `DELETE` grants on both views (from `00-legacy-grants.sql`'s "restore
  pre-2026-05-30 creation-time defaults" sweep — `supabase/config.toml`'s own
  comment names this file as local-only and explicitly excludes it from
  staging). Independently confirmed inert three ways: (1) `SET ROLE anon;
  SELECT count(*) FROM project_parties` → `0` (RLS grants no anon policy on
  that table); (2) `SELECT … FROM studio_channel_consent` as anon →
  `permission denied` outright (no anon grant on the base table at all,
  confirmed via `information_schema.role_table_grants` — only
  `v_project_roster`/`people_directory` carry the legacy sweep, not
  `studio_channel_consent`); (3) `channel_consent_status()` as anon →
  `42501 permission denied for function` (REVOKEd from anon by 00594/00621
  themselves). No row of any tenant's consent state is reachable by `anon`
  through any path tried.
- **Confidence**: high (three independent live probes plus the config.toml
  citation explaining the mechanism).
- **Fix**: none needed — this is baseline local-dev seed infrastructure that
  predates this branch and does not reach staging or prod. Noted for the
  record only, since the raw `role_table_grants` output looks alarming out of
  context.

## 10. What this round did not re-litigate

Per instructions, every ruling in `rulings.md` §3 (R-A through R-AY, including
R-AW/R-AY themselves) is treated as settled — not re-argued here. In
particular: R-AV (Patina Field repoint is W2's), the §5.1b(b) "still on the
seat, deliberately" list (00621's two dispatch gates, `sendPartySms`'s legacy
leg, `flushDeferredMessages`, `mayTextField`'s mirror leg, the opt-in evidence
proof, the inbound YES gate, `fc_dispatch_optin_invite`), `site_request_resend()`
(§5.1), and the unattributable-send policy question (§5.2) are all disclosed by
the report itself as "Not done" / "owed," each with its own reasoning for why
it fails in the safe direction (refuse-more, never send-more) or is explicitly
Fable's/Kody's policy call rather than a code defect. None of these are new
findings; this round independently confirmed several of them read correctly
against source (§5 above) rather than re-deriving conclusions the report and
`rulings.md` have already settled.
