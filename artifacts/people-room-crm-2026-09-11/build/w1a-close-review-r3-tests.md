# W1a — close-out review, round 3 (tests, types, behaviour)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build`,
branch `build/people-room-crm-2026-09-11`, HEAD `8132a1a20` (`6ea4e052d` is an
ancestor — `git merge-base --is-ancestor 6ea4e052d HEAD` confirms it). Local
Supabase only, `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

**Verdict: CLEAN except one already-disclosed MAJOR.** Every SQL test passes,
generated types are in sync, RLS/RPC role isolation holds under direct probing
(anon, a client account, a foreign-studio owner), and both prior r2 MAJOR
fixes hold under independent re-check. The one MAJOR below is the
`site_request_send`/`resend`/`dispatch_after_consent` family still gating on
the frozen `project_parties.sms_consent_status` seat column — which the report
itself names, tests on purpose (block 8c), and assigns to W2 (§5.1/§5.1b). I
add one file the report's inventory didn't name (`SupabaseSiteRequestService.swift`,
the same frozen column read for Patina Field's assignee picker) and confirm,
by grep, that **no live writer sets a seat to `granted` any more** — so the
gap is not merely "site requests parked in `awaiting_consent`" but "the whole
resend/dispatch-after-consent leg can never succeed for a seat created after
this wave," which is a sharper statement of the same disclosed defect.

---

## 1. SQL tests — `supabase/tests/people/w1a_identity_channels_consent_test.sql`

```
$ pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build supabase:reset
... (migrations 00001–00594, 20260910152111 applied; all seeds loaded)
Finished supabase db reset on branch main.

$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w1a_identity_channels_consent_test.sql
NOTICE:  1. affiliations + RLS: passed
NOTICE:  2. channel normalisation: passed
NOTICE:  3. consent backfill precedence: passed
NOTICE:  4. mirror + 5. record_channel_consent: passed
NOTICE:  6. no fan-out is possible (B1) + backfill re-run (M1): passed
NOTICE:  7. widened vocabularies (M2/M3/M4): passed
NOTICE:  8. a consent act reaches no seat and sends nothing (B-1): passed
NOTICE:  9. record_channel_consent transition gate (B-2): passed
NOTICE:  10. the record's evidence is refreshed, never erased (M-1/R-AN): passed
NOTICE:  11. one normalisation + origin rule (M-3): passed
NOTICE:  12. affiliations are the home, company_id the pointer (R-AI): passed
NOTICE:  13. the legacy consent columns are frozen (R-AS): passed
NOTICE:  14. the opted_out gate is part of the write (M-1): passed
NOTICE:  15. the card backfill does not invent SMS capability (M-2/M-1): passed
NOTICE:  16. the two consent doors do not compose past a STOP (M-1): passed
NOTICE:  16B. a DATELESS refusal fails closed too (r4 B-1): passed
NOTICE:  17. affiliation and channel kinds are enforced (M-2): passed
NOTICE:  18. the record's evidence is never nulled, and the seat is never written (R-AN/R-AS): passed
NOTICE:  19. the write door reads the seats too (R-AL): passed
NOTICE:  20. the pointer moves one affiliation, not all of them (R-AO): passed
NOTICE:  21. the designated people are people, in this studio (R-AP): passed
NOTICE:  22. the seat gate is on the refusal, not the verdict (r6 B6-1/M6-1): passed
NOTICE:  23. the record keeps both dates, the seat keeps its own (r6 M6-2/R-AS): passed
NOTICE:  24. the routed person is a person, in this studio (r6 M6-4): passed
NOTICE:  25. the channel vocabulary is checked, both ways ... : passed
NOTICE:  26. no studio-side verdict lowers refusal_unanswered (r7 M7-1): passed
NOTICE:  27. reconsent is evidence-only and re-callable ... : passed
NOTICE:  28. a studio-recorded refusal never speaks for a texted one ... : passed
NOTICE:  29. a held card cannot change what it is or whose it is ... : passed
NOTICE:  30. the fold picks the sibling that HOLDS the refusal ... : passed
NOTICE:  30e. a grant's paperwork is never filed as the refusal's own words ... : passed
NOTICE:  30f. a STOP over a standing grant is recorded wordless ... : passed
NOTICE:  31. a rule is filed under the noun its subject actually is (r8 F1): passed
NOTICE:  32. a recorded refusal never speaks for the grant it stands beside (r6 R6-M1): passed
NOTICE:  33. a blank evidence field cannot empty the evidence set (r6 R6-M2): passed
NOTICE:  34. an email refusal is recoverable ... an SMS one is not (r6 R6-M3): passed
NOTICE:  35. a fresh consent recorded over a refusal carries its own date ... (r9 M1): passed
NOTICE:  36. the fold keeps the group's grant evidence ... (r9 M2): passed
NOTICE:  37. the record is the single source ... (R-AS): passed
NOTICE:  38. one resolver for the seat's studio ... (close-review r1 MAJOR-1): passed
NOTICE:  39. the add path never lowers a standing grant ... (close-review r2 MAJOR-1): passed
NOTICE:  40. one reader, one verdict ... (close-review r2 MAJOR-2): passed
NOTICE:  All W1a assertions passed.
```

43 NOTICE lines, **0 ERROR / FAIL**, `psql` exit code **0** (confirmed with a
second run redirected to a file and `echo $?`).

## 2. Generated types

```
$ SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
    pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build db:generate
> supabase gen types typescript --db-url "$SUPABASE_DB_URL" > src/database.types.ts

$ git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-people-build diff --stat \
    packages/supabase/src/database.types.ts
(empty)
```

Committed types are byte-identical to a fresh regen against the reset DB.

## 3. Role / RLS probes

All run as `SET ROLE ... ; SET request.jwt.claims = '{"sub":"<uid>","role":"authenticated"}'`
inside one rolled-back transaction. `designer@patina.dev` = `a0000000-…-004`
(owner of `b0000000-…-0001` "Local Dev Studio" and `59d78e08-…` "Leah
Hartwell"); `client@patina.dev` = `a0000000-…-005` (no studio memberships);
foreign studio = `55363d51-…` "Studio Manager" (designer is not a member).

| Probe | Result |
|---|---|
| `anon` — `SELECT * FROM studio_channel_consent` | refused, `insufficient_privilege` |
| `anon` — `channel_consent_status(...)` | refused, `insufficient_privilege` (no EXECUTE grant) |
| `anon` — `record_channel_consent(...)` | refused, `insufficient_privilege` |
| designer — `SELECT ... WHERE organization_id IN (own two orgs)` | returns exactly the rows seeded in those two orgs |
| designer — `SELECT count(*) WHERE organization_id = foreign` (before any row exists there) | `0` |
| (postgres seeds a row directly into the foreign studio) | `INSERT 0 1` |
| designer — same count, after the foreign row exists | **still `0`** — RLS holds even once a row is known to exist |
| designer — `record_channel_consent(foreign_org, ...)` | refused, `not_a_studio_member` |
| client — `SELECT count(*) FROM studio_channel_consent` (no filter) | `0` — RLS shows nothing outside membership, anywhere |
| client — `record_channel_consent(own-adjacent org, ...)` | refused, `not_a_studio_member` |
| designer — `SELECT ... FROM v_project_roster WHERE project_id IN (org-A projects)` | returns rows, `sms_consent_status` present |

Table grants confirm the design in code: `studio_channel_consent` carries only
`authenticated: SELECT` (RLS-scoped by `is_active_studio_member`) plus full
grants to `service_role`/`postgres`; `anon` has nothing. `channel_consent_status`,
`project_consent_org`, `record_channel_consent`, `record_channel_reconsent`,
`record_channel_invite` all show `EXECUTE` for `authenticated`/`service_role`
only, `anon` excluded — matching the migration's own `REVOKE ALL … FROM
PUBLIC, anon` + `GRANT … TO authenticated, service_role` pattern.

## 4. Deno tests

```
$ cd supabase/functions && deno test --allow-all --config deno.json _shared/
ok | 422 passed | 0 failed (1s)
```

Includes the exact scenarios this brief asked me to construct, already
unit-tested with a mocked Supabase client and passing:
`"another studio's opt-out does not block this studio's send"`,
`"a granted record does not override an opted-out party row"` (record `granted`
+ party-row `opted_out`, scoped to the *same* studio — refuses; stronger than
the "no record" case I built by hand in §5, and it passes),
`"an unanswered refusal refuses the send, whatever the status now says"`,
`"a granted record carrying an unanswered refusal still refuses"`,
`"a stale granted record does not carry a send past this studio's own STOP"`.

```
$ deno test --allow-all --config deno.json sms-inbound/
error: No test modules found
```
Expected — `sms-inbound/`'s own test lives at `_tests/sms-inbound.test.ts`, not
inside the function's own directory.

```
$ deno test --allow-all --config deno.json _tests/
... TS2345 [ERROR] in supabase/functions/fulfillment-po/core.ts:314:80
    Argument of type 'Uint8Array<ArrayBufferLike>' is not assignable to
    parameter of type 'string | ArrayBuffer'.
error: Type checking failed.
```
**Pre-existing, unrelated to this branch.** `fulfillment-po/core.ts` was last
touched by `7c95cb096` ("feat(boh): S3 PO render…"), not by any W1a commit —
a Deno 2.8.3 stricter `Uint8Array`/`ArrayBuffer` typing that blocks
type-checked `deno test` over the whole `_tests/` directory regardless of this
feature. Re-ran with `--no-check` to get a functional signal:

```
$ deno test --allow-all --no-check --config deno.json _tests/
ok | 284 passed | 1 failed
./_tests/stripe-rail.test.ts (uncaught error)
error: (in promise) Error: supabaseKey is required.
```
The one failure is an **environment issue in my shell**, not a code defect —
`stripe-rail.test.ts` reads `SUPABASE_SERVICE_ROLE_KEY` directly from
`Deno.env` (`_tests/stripe-rail.test.ts:23`, non-null-asserted) and my shell
has no such variable set; it is unrelated to people/consent. Isolated run of
the file this brief actually cares about:

```
$ deno test --allow-all --no-check --config deno.json _tests/sms-inbound.test.ts
ok | 43 passed | 0 failed (28ms)
```

No stray root `deno.lock` was left behind (`git status` on
`deno.lock`/`supabase/functions/deno.lock` is empty).

## 5. The four constructed scenarios

One script, one rolled-back transaction
(`/private/tmp/.../scratchpad/probe_full2.sql`, output archived at
`probe_full2_out.txt` in the same scratchpad — not part of the repo).

**a) phone opted_out in org A, granted in org B.**
```sql
record_channel_consent(org_A, 'sms', '+15559990101', 'opted_out', ...)  -- as designer, member of both
record_channel_consent(org_B, 'sms', '+15559990101', 'granted',  ...)
```
```
          label          |  verdict
-------------------------+-----------
 org_A(expect opted_out) | opted_out
 org_B(expect granted)   | granted
```
Per-studio isolation on the same phone holds at the SQL layer, and the TS
layer's own unit test ("another studio's opt-out does not block this studio's
send", §4 above) covers the send-time equivalent.

**b) a phone with an opted_out `project_parties` row and NO `studio_channel_consent` record.**
Seeded a fresh party row (`display_name`, `party_kind` — not `name`/`role`,
correcting my first draft against the real schema) with
`sms_consent_status = 'opted_out'` and no matching record.
```sql
SELECT channel_consent_status(org_A, 'sms', '+15559990202');  -- NULL
```
The **SQL reader** correctly returns NULL ("not_asked" once a view COALESCEs
it) — by design, `channel_consent_status()` never consults party rows; the
party-row fallback lives only in the edge function's `orgHasOptedOutParty()`
(`_shared/sms.ts:355-381`), read and confirmed in code, and exercised by the
already-passing unit test noted in §4. **Caveat on my own fixture**: I could
only construct this by `INSERT`ing the party row directly as `postgres`,
bypassing RLS and the app. Grepping the whole app/package tree
(`grep -rn "\.from(.project_parties.)\.insert\|INSERT INTO project_parties"`)
turns up exactly one shipped writer, `useAddProjectParty`
(`packages/supabase/src/hooks/use-coordination.ts:495`), and it **never**
inserts `sms_consent_status: 'opted_out'` — only `'pending'` or `'not_asked'`.
So this exact "opted_out at birth, no record" shape isn't reachable through
the app today; it only matches **pre-fold legacy rows**, which
`backfill_channel_consent_from_parties()` already swept into
`studio_channel_consent` at fold time (test blocks 6/36). Not a finding —
confirms the design holds at the boundary I could actually construct.

**c) a STOP, then a new recorded grant with evidence.**
```sql
record_channel_consent(org_A, 'sms', '+...0303', 'opted_out', 'inbound_sms', 'Replied STOP', ...)
-- status=opted_out, refusal_unanswered=t, verdict=opted_out
record_channel_reconsent(org_A, 'sms', '+...0303', 'written', 'Signed a fresh kickoff form after the STOP', 'v2', NULL)
-- ALLOWED as a write: status stays opted_out, refusal_unanswered stays TRUE,
-- opt_out_source/opt_out_evidence ('inbound_sms'/'Replied STOP') untouched,
-- source/evidence updated to the fresh consent
-- verdict is STILL 'opted_out' -- the studio's own evidence does not itself lift the flag
UPDATE studio_channel_consent SET status='granted', refusal_unanswered=false, consented_at=now()
  WHERE ...  -- simulating the recipient's own START, the only writer that lowers the flag
-- verdict is now 'granted'
```
Exactly the r7 M7-2 design: the reconsent door is evidence-only and the write
succeeds; the number is not actually sendable again until the recipient's own
reply lowers `refusal_unanswered` (the inbound rail's service_role write).
Matches SQL test blocks 27/34/35 and the TS unit tests
`"a stale granted record does not carry a send past this studio's own STOP"` /
the reconsent-family cases in `_tests/sms-inbound.test.ts`
("STOP records the refusal as unanswered; a START lowers the flag").

**d) a legacy write to `project_parties.sms_consent_status` by an authenticated studio member.**
```sql
SET ROLE authenticated; SET request.jwt.claims = designer's;
UPDATE project_parties SET sms_consent_status = 'granted' WHERE id = <the seeded party>;
```
```
NOTICE:  CONSTRUCT 4: legacy write refused - consent_legacy_column_frozen (P0001)
```
Refused exactly as documented, by `refuse_legacy_consent_write_trg`
(`BEFORE UPDATE OF` the eight frozen columns).

## 6. Prior findings re-checked

**MAJOR-1 (r2) — add-a-second-job pending demoting a standing grant.**
Independently re-verified outside the shipped test file:
```sql
record_channel_consent(org_A, 'sms', '+15559991234', 'granted', 'written', 'Signed the intake form for job A', ...)
record_channel_consent(org_A, 'sms', '+15559991234', 'pending', 'verbal', 'Said yes at the second job walkthrough', ...)
-- NOTICE: MAJOR-1 RECHECK: pending-over-granted refused - consent_already_granted (P0001) -- fix holds
-- row on disk: status=granted, source=written, evidence="Signed the intake form for job A" (untouched)
```
**Still fixed.** `record_channel_invite()` is the shipped door for
`useAddProjectParty` (verified by reading `use-coordination.ts:461-483`); it
returns the standing grant untouched and never calls `record_channel_consent`
with `p_status='pending'` over one.

**MAJOR-2 (r2) — reader printed `granted` for a record every send refuses on.**
Confirmed live in §5(c) above: a record with `status='granted'` (after a
manual write simulating a stale flag) is not part of this branch's own tests,
but `channel_consent_status()`'s body (`\sf`) shows the `CASE WHEN
refusal_unanswered IS TRUE THEN 'opted_out' ELSE status END` wrapper is in
place, test block 40 passes, and my construct (c) shows the wrapper firing
correctly at every step. **Still fixed.**

## 7. Readers of `people_directory` / `v_project_roster`

```
$ grep -rn "people_directory\|v_project_roster" apps packages
```
Excluding the two views' own `database.types.ts` entries and comments, there
are exactly **two direct query sites** in the whole `apps/` + `packages/`
tree:

| Site | Reads |
|---|---|
| `packages/supabase/src/hooks/use-people.ts:125,161` | `.from('people_directory').select('*')` — the canonical `usePeopleDirectory`/`usePerson` hooks |
| `packages/supabase/src/hooks/use-coordination.ts:975` | `.from('v_project_roster')` — the canonical roster hook |

Every other hit (`call-sheet.tsx`, `roster-row.tsx`, `directory-view.tsx`,
`person-bits.tsx`, `people-derivation.ts`, `roster-derivation.ts`,
`audience-rules.ts`, `desk-derivation.ts`, `use-vendors.ts`, `use-clients.ts`,
and the Capture Swift comments) consumes one of those two hooks downstream —
none of them re-queries the view or the base table directly, and none
re-derives the consent word from raw columns. The one place that reads the
delivered `sms_consent_status` value and branches on it,
`roster-derivation.ts:390` (`row.sms_consent_status === 'granted'`), is
consuming the *already-wrapped* verdict `channel_consent_status()` produces
(via `v_project_roster`), so MAJOR-2's fix protects it for free — there is no
second, disagreeing computation client-side.

### One reader outside that grep's scope, found while tracing "every reader": Patina Field reads the frozen seat column directly

`apps/mobile/Capture/Capture/Features/SiteRequests/SupabaseSiteRequestService.swift`
selects `project_parties.sms_consent_status` directly (not through either
view) and turns it into a client-facing boolean:

```swift
// :17
private static let partyColumns =
    "id,display_name,company_name,phone,phone_e164,trade,party_kind,sms_consent_status"
// :516, :524
smsConsentGranted: consentStatus == "granted"
```

This isn't literally a reader of `people_directory`/`v_project_roster`, so it
falls outside the letter of "list every reader of \[those\] columns" — but it
is the same class of bug the report's own §5.1/§5.1b names (a rail reading the
now-frozen seat), on a fourth file the report doesn't list next to
`SiteRequestContract.swift`. Grepping the whole tree for any writer that could
still bring a seat to `'granted'` turns up nothing live:

```
$ grep -rn "sms_consent_status\s*=\s*'granted'\|sms_consent_status:\s*'granted'" supabase packages apps
supabase/migrations/00374_field_site_request_loop.sql:3410,3453   -- trigger READS this value, writes nothing
supabase/tests/site_requests/live_dispatch_loop.sh:176            -- raw SQL in a test harness
apps/designer-portal/e2e/field/field-coordination.spec.ts:139     -- e2e fixture, not app code
```
No application writer sets a seat to `'granted'` any more: the inbound
rail's old `grantPartiesForStudios()` was deleted this wave (report §3), and
`useRecordPartySmsConsent` only ever flips `not_asked → pending`. So the gap
is sharper than "a site request parked in `awaiting_consent` is not
released" (test 8c) — **`site_request_resend()` and
`site_request_dispatch_after_consent()` (both `v_party.sms_consent_status <>
'granted' → RAISE`, `00374:1364`, `:1424`) can never succeed for any party
created after this wave, for any phone, no matter what the studio's real
`studio_channel_consent` record says**, because nothing can ever move that
column to `'granted'` again. `SupabaseSiteRequestService.swift`'s
`smsConsentGranted` badge in Patina Field will show `false` forever for such a
party even once the studio holds — and the room correctly prints — a real
`granted` verdict.

This is graded MAJOR by the letter of this review's own rubric ("a shipped ...
reader shows a wrong verdict, or a reachable write path leaves the record and
a reader disagreeing" — `site_request_send`'s family is
`GRANT EXECUTE ... TO authenticated` and called from both the designer portal
and Patina Field, per the report's own citation of
`SiteRequestContract.swift:15`). **It is not a new or hidden problem**: the
report names it explicitly (§5.1, §5.1b), assigns it to W2, and test block 8c
in the shipped SQL suite asserts today's (broken) behavior on purpose with a
comment telling the next dev to update the assertion once the rail is
repointed. I'm reporting it because the brief says report every finding
without filtering by disclosure status — Fable should filter this one at
synthesis knowing it is disclosed, scoped, and tested-as-is, not overlooked.

## 8. Type-checks

```
$ pnpm --dir .../agent-people-build --filter @patina/supabase type-check
> tsc --noEmit
(clean, no output)

$ pnpm --dir .../agent-people-build --filter @patina/designer-portal type-check
> tsc --noEmit
(clean, no output)
```
No type breaks from the regenerated `database.types.ts` (which is itself
byte-identical to the committed file, §2).

```
$ pnpm --dir .../agent-people-build --filter @patina/supabase test -- src/hooks/__tests__/use-coordination-authority.test.ts
✓ (25 tests) 9ms
```

## 9. Operational note — the shared local Supabase container was reset mid-review by something else

Partway through the role probes, `docker inspect supabase_db_supabase` showed
the container had restarted (`StartedAt` ~1 minute prior) and the schema had
silently rolled back to migration `00433` — 161 migrations short of `00594`,
with `studio_channel_consent`, `organizations`, and 300+ other tables simply
gone. The brief states "this wave is its sole owner (the other session moved
to its own stack)"; whatever happened, it did not hold for the full session.
I re-ran `supabase:reset` (confirmed back at `00594`/`20260910152111`) and
finished the review from there — the SQL-test results in §1 were captured
*before* this happened and are unaffected, but every role probe and construct
in §3/§5 was re-run *after* the second reset, against a freshly verified
`00594` head, so nothing in this report rests on the clobbered window. Flagging
this as a MINOR/operational item, not a code finding: if another process can
reach this same local Postgres and reset it independently mid-session, that's
worth tightening (worktree-local ports, or a lock file) before the next
multi-session wave on this stack.

## Not re-litigated

The eleven MINOR findings from `w1a-close-review-r2-migrations.md` are
untouched per the fix log and out of scope for this pass; I did not re-audit
them. `w1a-report.md`'s own "Not done (deliberately)" section and §5
("what this costs") already enumerate the W2-owed gaps beyond the one I
sharpened in §7 above (the site-request rail's other four readers, the two
portal UPDATE writers, `people_directory.meta.sms_consented_at`/`.sms_opt_out_at`).
