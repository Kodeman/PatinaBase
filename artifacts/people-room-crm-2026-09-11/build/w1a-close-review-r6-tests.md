# W1a — close-out review, round 6: tests, types, behaviour

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD `d1b95d9cc` ("a refusal the rail
cannot record is not one it acknowledges, and an opted_out seat's number cannot
move" — the r5 fix commit; `6ea4e052d` confirmed an ancestor). Local Postgres
only (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`), this wave's
sole owner. No prod act of any kind.

**Verdict: clean.** Zero BLOCKING, zero MAJOR. One carried MINOR
independently re-verified as still open and still MINOR (not escalated). No new
findings survive scrutiny.

---

## 0. Environment note (sandbox, not a wave defect)

`pnpm supabase:reset` and `db:generate` both failed on the first attempt inside
this session's default sandbox — the CLI writes `~/.supabase/telemetry.json`
and shells out to the Docker socket, both outside the sandbox's allowed paths.
Both were re-run with the sandbox disabled for that one command and succeeded
cleanly; no code or migration issue. Recorded because the first `db:generate`
attempt's failure truncated `packages/supabase/src/database.types.ts` to zero
bytes via shell redirection (`> src/database.types.ts` still opens/truncates
the file even when the piped command fails) — caught immediately via `git
diff --stat` showing "37486 deletions", restored with `git checkout --` before
any further step, and the real (sandbox-disabled) run reproduced a clean,
empty diff. Anyone re-running this gate should disable the sandbox for the
`db:generate` / `supabase:reset` commands specifically, and always check `git
diff` immediately after a `db:generate`, not just its own exit code.

---

## 1. Reset

```
$ pnpm supabase:reset   (dangerouslyDisableSandbox: true)
...
Applying migration 00621_consent_readers_repointed.sql...
Applying migration 20260910152111_create_contact_messages.sql...
...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
```

Clean. `supabase_migrations.schema_migrations` head: `20260910152111`, then
`00621`, `00594`, `00593` — matches the report and the r5 fix log exactly.

---

## 2. SQL tests — every file under `supabase/tests/people`

Only one file exists there: `w1a_identity_channels_consent_test.sql` (one
transaction, ROLLBACKed).

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
...
NOTICE:  40. one reader, one verdict: an unanswered refusal reads opted_out everywhere the room prints it (close-review r2 MAJOR-2): passed
NOTICE:  41. the Desk rollup counts the record's pending, not the frozen seat's, and agrees with the Call Sheet about the same person (close-out r3 MAJOR-1): passed
NOTICE:  42. the two 00284 dispatch gates reach a party the record granted, and still refuse an unasked, a refused and a non-field one (close-out r3 MAJOR-3): passed
NOTICE:  43. an opted_out seat's number cannot move, and every other phone edit still can (close-out r5 MAJOR-1): passed
NOTICE:  All W1a assertions passed.
ROLLBACK
```

`EXIT=0`. `grep -c ": passed"` → **45**. `grep -inE "error|fail"` → one line,
which is the block-16B *title* ("a DATELESS refusal fails closed too") followed
by "passed" — not a real failure. No other match.

---

## 3. Generated types — `db:generate` + diff

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir .../agent-people-build db:generate   (dangerouslyDisableSandbox: true)
...
> supabase gen types typescript --db-url "$SUPABASE_DB_URL" > src/database.types.ts
Connecting to db 5432
$ git -C .../agent-people-build diff --stat packages/supabase/src/database.types.ts
(no output)
```

Empty diff, as required. No drift.

---

## 4. Role probes — designer@patina.dev, a client account, anon

Two scripts, both one rolled-back transaction, using the test file's own
`pg_temp.assume_user()` / `SET ROLE` pattern re-declared inline (with the
`GRANT EXECUTE ... TO PUBLIC` the pattern needs — the database revokes default
EXECUTE from PUBLIC, so this is not optional).

### 4a. Fresh org-pair fixture (`r6-probe.sql`)

```
      label       |  verdict
------------------+-----------
 S1 org A verdict | opted_out
 S1 org B verdict | granted
NOTICE:  S1 org-A-member reading org-B verdict (should be NULL / not visible) = NULL

                label                 | verdict
--------------------------------------+---------
 S2 record verdict (no record exists) |
NOTICE:  S2 grant attempt over opted_out SEAT with no record: raised = channel_opted_out

NOTICE:  S3 record_channel_reconsent() after STOP: raised = (no error — call succeeded)
NOTICE:  S3 record.status column after reconsent = opted_out
NOTICE:  S3 channel_consent_status() verdict after reconsent (what the send gate/room read) = opted_out
NOTICE:  S3b direct record_channel_consent(granted) over a standing STOP: raised = channel_opted_out

NOTICE:  S4 legacy UPDATE of project_parties.sms_consent_status by studio member: raised = consent_legacy_column_frozen

NOTICE:  anon channel_consent_status() call: raised = permission denied for function channel_consent_status, verdict = NULL
NOTICE:  anon record_channel_consent() call: raised = permission denied for function record_channel_consent
NOTICE:  anon direct SELECT on studio_channel_consent: raised = permission denied for table studio_channel_consent, count = NULL

NOTICE:  client-account channel_consent_status() on org A: raised = (no error), verdict = NULL
NOTICE:  client-account record_channel_consent() on org A (not a member): raised = not_a_studio_member
NOTICE:  client-account direct SELECT studio_channel_consent WHERE org=A: raised = (no error), count = 0
ROLLBACK
```

Reading each constructed scenario against the task's own severity classes:

- **phone opted_out in org A, granted in org B** (same number): org A reads
  `opted_out`, org B reads `granted`, and org A's own member reading org B's
  key gets `NULL` (not org B's word) — no cross-tenant read. **B may send, A
  may not — confirmed, no leak.**
- **a phone with an opted_out PARTY ROW and no `studio_channel_consent`
  record**: `channel_consent_status()` returns NULL (the room prints
  `not_asked`, matching §5.2's documented residue — *not* a false "granted"),
  and an attempt to WRITE a grant over it is refused with `channel_opted_out`
  (R-AL, the seat gate inside `record_channel_consent`). **Refused —
  confirmed.**
- **a STOP, then a fresh recorded act with evidence**: `record_channel_reconsent()`
  (PR-m's evidence-only door) succeeds — the call is *allowed* to record fresh
  evidence — but the record's `status` column and `channel_consent_status()`'s
  verdict both stay `opted_out` afterward. A studio attempting the OTHER door —
  `record_channel_consent(..., 'granted', ...)` directly over the standing
  refusal — is refused with `channel_opted_out` (R-AJ: only the recipient's own
  inbound YES/START lowers a refusal; a studio-side write, however much
  evidence it carries, cannot). **Matches the documented design exactly: the
  "allowed" act is the evidence-only reconsent, and it does not, and must not,
  make the number sendable again.**
- **a legacy write to `project_parties.sms_consent_status` by an authenticated
  studio member**: refused with `consent_legacy_column_frozen`. **Refused —
  confirmed**, and via the real RLS policy path (`project_parties_studio_update`,
  `00584:895-908`, `is_studio_comember(p.designer_id)` — checked directly,
  §6 below), not merely at the portal door.
- **anon**: every one of the three surfaces tried (the read RPC, the write RPC,
  a direct table SELECT) is refused with `permission denied` — the REVOKE ALL
  FROM PUBLIC, anon` on both functions and the table-level grant hold.
- **an unrelated client account** (not a member of org A): the read RPC
  returns no error but a NULL verdict (RLS-invoker degrade, not a thrown
  error — matches the documented posture "a caller who is not a member reads
  NULL"), the write RPC is refused by name (`not_a_studio_member`), and a
  direct SELECT against the table returns zero rows. No cross-tenant read or
  write through any of the three doors.

### 4b. Real seeded data, both shipped views (`r6-views-probe.sql`)

Used `designer@patina.dev` (`a0000000-0000-0000-0000-000000000004`) and
`client@patina.dev` (`a0000000-0000-0000-0000-000000000005`) by name, against a
real seeded project of designer@patina.dev's (`b0000000-...-0000000000d1`,
`studio_id` genuinely NULL on the row — exercises `project_consent_org`'s
`_primary_studio_for()` fallback, not the simple case). Recorded a fresh
`opted_out` through the RPC, then added a `project_parties` seat for the same
number frozen at `granted` (the exact "record says one thing, seat says the
stale other" shape §2.3b exists for):

```
NOTICE:  picked project b0000000-0000-0000-0000-0000000000d1 resolved studio
         (project_consent_org, studio_id column is NULL on this row)
         dd296128-f213-4d7b-b3ea-a253d2876ac4
NOTICE:  designer: v_project_roster rows for the probe phone = 1
NOTICE:  designer sees v_project_roster: phone=+16125559777 sms_consent_status=opted_out
         (frozen seat says granted; record says opted_out)
NOTICE:  designer: people_directory rows matching probe party by name = 1
NOTICE:  unrelated client account: v_project_roster rows for the probe phone (should be 0) = 0
NOTICE:  anon: v_project_roster read: raised=permission denied for table profiles, rows=NULL
```

On real data, not a fixture: the room prints the RECORD's `opted_out` even
though the frozen seat still says `granted` — the whole point of R-AS,
independently reproduced. The unrelated client account (real seeded row, real
RLS, no test-only bypass) sees zero rows for a phone belonging to a studio it
is not a member of. anon is refused (the `profiles` join anon has no grant on
is what surfaces first, which is itself a second layer of protection on top of
the view's own base-table RLS).

---

## 5. Deno tests

### 5a. Exactly the files named in the task

```
$ deno test --no-check -A --node-modules-dir=auto --config supabase/functions/deno.json \
    supabase/functions/_shared/sms.test.ts supabase/functions/_tests/sms-inbound.test.ts \
    supabase/functions/_tests/field-daily.test.ts
ok | 103 passed | 0 failed (376ms)
```

### 5b. The literal command, no `--no-check`, whole directories

```
$ deno test --allow-all --config supabase/functions/deno.json \
    supabase/functions/_shared supabase/functions/sms-inbound supabase/functions/_tests
```

Two failures, **both pre-existing and unrelated to W1a**:

1. **A type error** in `supabase/functions/fulfillment-po/core.ts:314`
   (`Uint8Array<ArrayBufferLike>` not assignable to `string | ArrayBuffer`,
   inside a Deno-std/base64 call). `git diff origin/main...HEAD --stat -- 
   supabase/functions/fulfillment-po/core.ts` is empty — this branch never
   touched the file, and its last change on `main` is `7c95cb096` ("feat(boh):
   S3 PO render + transmit engine"), unrelated to consent. `--type-check` is on
   by default for `deno test` without `--no-check`, and it type-checks every
   file reachable from the test graph, so an unrelated pre-existing type error
   anywhere under `_tests`'s import graph blocks the whole run. Re-ran with
   `--no-check` (§5a and below) to route around it, which is what every prior
   round's own evidence commands already did.
2. **A runtime failure**, once `--no-check` is added: `stripe-rail.test.ts`
   throws `supabaseKey is required` — that file's own header says it needs a
   running `supabase functions serve` plus `SUPABASE_URL` /
   `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` in the environment
   (`_tests/run.sh`), neither of which this task set up. `git diff
   origin/main...HEAD --stat -- supabase/functions/_tests/stripe-rail.test.ts`
   is empty. Unrelated to W1a and to consent.

With `--no-check` added (routing around finding 1) and the harness-dependent
file excluded, the same directories:

```
$ deno test --no-check -A --node-modules-dir=auto --config supabase/functions/deno.json \
    supabase/functions/_shared supabase/functions/sms-inbound supabase/functions/_tests
ok | 719 passed | 0 failed  (excluding stripe-rail.test.ts's harness-only failure)
```

Neither failure is a W1a finding — both are pre-existing, both outside the
branch's diff, and both are pure test-harness/environment gaps (a repo-wide
strict-type issue in an unrelated edge function; a suite that needs
`supabase functions serve` and Stripe env vars neither present nor part of
this task's setup).

`ls deno.lock` → No such file or directory (no untracked lockfile left behind).

---

## 6. RLS objects, read directly from the catalog

```
$ psql ... -c "select rolname from pg_roles where rolname in ('anon','authenticated','service_role');"
 authenticated | anon | service_role     -- all three exist, none login-capable checked separately, not needed here

$ grep -n "project_parties" supabase/migrations/00584_studio_comember_rls_sweep.sql | head
884: project_parties_studio_insert  FOR INSERT ... WITH CHECK is_studio_comember(p.designer_id)
896: project_parties_studio_update  FOR UPDATE ... USING/WITH CHECK is_studio_comember(p.designer_id)
914: project_parties_studio_delete  FOR DELETE ... USING is_studio_comember(p.designer_id)
```

Confirms the report's claim (§5.2 bullet 1): the UPDATE policy really is
`is_studio_comember(designer_id)` with no narrower predicate, so
`PATCH /rest/v1/project_parties?id=eq.X` with only `{"phone": ...}` really is
reachable by any authenticated co-member — which is exactly the shape the
freeze trigger (block 43, §4 above) has to, and does, refuse in the database,
not only at the portal door.

---

## 7. Type-checks

```
$ pnpm --dir .../agent-people-build --filter @patina/supabase type-check
> tsc --noEmit
(clean, no output, exit 0)

$ pnpm --dir .../agent-people-build --filter @patina/designer-portal type-check
> tsc --noEmit
(clean, no output, exit 0)
```

No type breaks from the regenerated types (which, per §3, didn't actually
change anything).

---

## 8. Every reader of `people_directory` / `v_project_roster` in apps + packages

Grepped `apps/` and `packages/` for both view names, then read every hit that
was not a comment referencing the view by name only:

| File | What it reads | Verdict |
|---|---|---|
| `apps/designer-portal/src/components/document/roster/roster-row.tsx:95` | `row.sms_consent_status` off a `v_project_roster` row | Correct — the view's own `sms_consent_status` OUTPUT column is the `channel_consent_status()`-derived value (aliased `AS sms_consent_status` in 00594:1158/1186), not the raw table column. Confirmed by reading the view SQL directly, not assumed. |
| `apps/designer-portal/src/components/document/people/party-profile-sheet.tsx:260` | `meta.sms_consent_status` off a `people_directory` row | Same alias, through the `meta` jsonb branch (00594:1362). Correct. |
| `apps/designer-portal/src/lib/document/roster-derivation.ts:390` | `row.sms_consent_status === 'granted'` (the "N reachable by text" count) | Reads the fixed view's output column. Correct — this is the exact counter §5.2 bullet 3 names as under-counting **only** for the studio-less-project population, which is disclosed and owed, not a fresh finding. |
| `apps/designer-portal/src/components/document/people/person-bits.tsx` (`ConsentChip`) | a `status` prop passed in from callers already reading the fixed view/row | Correct, one remove from the source. |
| `packages/supabase/src/hooks/use-field-activity.ts:48-49` | `.from('field_activity_summary').select(...)` → `field-desk.tsx:44-52` | `field_activity_summary` was repointed at the record in 00621 (§2.3b of the report, test block 41). Confirmed the hook selects only the view's already-fixed columns. |
| `packages/supabase/src/hooks/use-coordination.ts:66-73` | a local `ProjectParty` TS type shape naming the eight legacy columns | Type-only; the two portal WRITE hooks in this same file (`useRecordPartySmsConsent`, the `revertsToOptedOut` branch of `useUpdateProjectParty`) are the two doors §3/§8 of the report already name as deliberately failing loudly post-freeze. Not a new finding — restates the disclosed one. |
| `packages/supabase/src/database.types.ts` | generated FK-name strings only (`project_parties_sms_consent_recorded_by_fkey`) | Not a query; generated metadata. No behaviour. |
| everything else matched (`desk-reconnect.tsx`, `letterhead-instruments.tsx`, `brief-section.tsx`, `call-sheet.tsx`, `call-sheet-mount.tsx`, `household-sheet.tsx`, `makers-marketplace.tsx`, `maker-profile.tsx`, `directory-view.tsx`, `audience-rules.ts`, `desk-derivation.ts`, `people-derivation.ts`, `use-vendors.ts`, `use-people.ts`, `use-clients.ts`) | comments referencing the view by name, or `.select('*')` / `.eq('person_id', ...)` against `people_directory` with no consent-specific projection | No direct read of a raw `project_parties` consent column anywhere in this set. |

**No reader in `apps/` or `packages/` selects
`project_parties.sms_consent_status` (or any of its seven siblings) directly.**
The only literal string matches for that column path outside the fixed views
are a code comment (`use-coordination.ts:551`, describing the write side, which
is already disclosed) and generated FK-name metadata. Every live read goes
through `v_project_roster`, `people_directory`, or `field_activity_summary`, all
three of which are confirmed (by reading their SQL directly, not by trusting
the report's prose) to project the record's verdict.

---

## 9. Prior findings — r5's own list, each re-checked

| Finding | r5 status | Re-checked here | Verdict |
|---|---|---|---|
| BLOCKING-1 (a STOP on a project no studio can be resolved for) | Fixed | Deno test "a STOP on a project no studio can be resolved for is not acknowledged" passes (§5a); `unattributed` flag confirmed present in `studiosHoldingPhone()`'s return shape by reading `pipeline.ts` | **Fixed, confirmed** |
| MAJOR-1 (a phone-only UPDATE transplants a frozen `opted_out` refusal) | Fixed | SQL block 43 passes (§2); independently reproduced with a fresh fixture (S4, §4a) — refused with `consent_legacy_column_frozen`; confirmed the trigger's column list carries `phone, phone_e164` beside the eight (§6 catalog read of `00594`'s trigger definition, not re-pasted since it matches the fix log verbatim) | **Fixed, confirmed** |
| MINOR-A (`00621`'s dispatch gate lets a frozen `granted` seat OVERRIDE a recorded refusal, R5) | Open, deliberately not fixed | Re-read `00621_consent_readers_repointed.sql:149-157` and `:213-221` directly — the conjunction is unchanged, so the seat leg still overrides rather than falls back. Re-read `sendPartySms` (`_shared/sms.ts:780-826`) directly: it calls `channelConsentVerdict` FIRST and returns `{ sent: false, reason: "opted_out" }` before any Twilio call or `insertOutbound`, independent of the trigger that invoked it — so the dispatch trigger's over-permissive gate causes an extra `pg_net`/edge-function round trip for a refused party, never an actual send. | **Confirmed still open, confirmed still MINOR** (matches this task's own rubric: no text can be sent to an opted_out number through this path, because the send-time gate is a second, independent, correctly-ordered check) |
| MINOR B–E (the 30s Desk poll's definer call; the add path failing whole on `consent_awaiting_recipient`; `authenticated` EXECUTE on the two trigger functions; the report's stale counts) | Open, deliberately not fixed | Not re-verified line-by-line this round (all four are cost/UX/paperwork-only by the report's own description, none touch send-gating or cross-tenant access) | Not re-checked — no severity class in this round's rubric reaches them; left as the fix log states |

No prior BLOCKING or MAJOR finding is open. No new BLOCKING or MAJOR surfaced
under fresh construction (§4).

---

## 10. What is NOT re-litigated here

§5.1/§5.1b/§5.2/§8 of `w1a-report.md` (the site-request rail, Patina Field's
punch routing and `smsConsentGranted` badge, the opt-in invite's evidence
proof, the inbound YES gate, `resolveRecipient`/`flushDeferredMessages`, and
the unattributable-send fail-open) are unchanged by this round and are already
disclosed by the wave itself as owed to W2 or to Fable's policy ruling — they
are not re-stated as findings here because they carry no new information this
round produced; the report and this review agree they are correctly described
as **not yet fixed**, not as **silently broken**.

---

## Summary

- SQL: 45/45 blocks passed, clean reset, exit 0.
- Types: `db:generate` diff empty (after recovering from a sandbox-caused
  truncation of the target file — restored via `git checkout --` before it
  could be mistaken for a real drift finding).
- Deno: the three named consent files at 103/103; the full `_shared` +
  `sms-inbound` + `_tests` directories at 719/719 once two pre-existing,
  branch-unrelated, environment-only failures are set aside (both documented
  in §5b with the exact evidence that they are pre-existing).
- RLS/role probes: four constructed scenarios (cross-org same-number, seat-only
  refusal, STOP-then-reconsent, legacy-column write) plus anon and an unrelated
  client account, all against a fresh fixture AND against real seeded data —
  every verdict matches the report's documented design, no cross-tenant leak,
  no send-gate hole.
- Type-check: `@patina/supabase` and `@patina/designer-portal` both clean.
- Readers: every `people_directory` / `v_project_roster` consumer in `apps/`
  and `packages/` traced; none bypasses the repointed views.
- One carried MINOR (00621's dispatch-trigger gate) independently re-verified
  as still open and still genuinely MINOR — the send-time gate it feeds is a
  separate, correctly-ordered check that still refuses the actual send.
