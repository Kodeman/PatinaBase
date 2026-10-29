# RC-7 E7: consumer compatibility (X08)

US-52 Room Proof 08, step RC-7, lane E7. This lane covers older parsers, iOS Patina and Patina Field.

**Run facts**

| Item                           | Value                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Date                           | 2026-10-29                                                                                                               |
| Worktree / branch              | `/Users/kody/Code/patina-r8-rc7-e7`, branch `r8-rc7-e7`                                                                  |
| Tip under test                 | `3cf79663c` (the lane base)                                                                                              |
| "Older" reference              | `main` = `9a686cecd`                                                                                                     |
| Owned stack                    | `project_id` `patina-rc7-e7`; ports API 59121, DB 59122, shadow 59120, pooler 59129                                      |
| Migration head on the owned DB | `00899` (825 migration rows)                                                                                             |
| pg_cron                        | `cron.launch_active_jobs = off`, set as `supabase_admin` after each start; `SHOW` confirmed `off`                        |
| Simulator                      | `rc7-e7`, `D68050C3-0A15-4634-82D5-22B181DB6D43` (iPhone 17 Pro, iOS 26.5), created for this lane and deleted at the end |

**Result.** X08 moves from **weak** to **covered** for web, iOS Patina and Field. Real consumer code, both current and older, ran against payloads a live stack returned for one mixed project.

- Every older approval-list read stayed legacy-only. The older parser processed 21 recorded lists from 10 actors without throwing, and no service record reached any of them.
- One recorded service row, injected into the list, does break the older inbox: this is the negative control. The live projections never emit such a row.
- One defect: the **older client page** shows a C5 external line as an ordinary studio piece priced at $0 (RC7-e7-1, low).
- Native UI-tier walks were **not run**; see "Not verified".

## 1. Mixed fixture and real payloads

`apps/designer-portal/e2e/round8/rc7-e7-fixtures/mixed-fixture.sql` builds one fictional studio and runs in a single transaction.

- **Refusal guard.** It refuses unless all of these hold:
  - the host is loopback;
  - `PORT` equals `owned_port` and is not 54321 or 54322;
  - `system_identifier` equals `owned_system_id`.

  It also refuses a second apply. Both refusals were exercised: a wrong system id gave `rc7-e7 fixture refused: not the owned rc7-e7 stack`, and a re-apply gave `fixture already applied`.

- **Activation, owned stack only:**
  - `server_capabilities.scope_editions = true`;
  - the C2, C4 and C6 grants;
  - the C5 rail and presence grants.
- **Ten actors:**
  - studio A: owner, member and admin;
  - studio B: owner;
  - client lead;
  - co-client;
  - partner (replaced);
  - replacement partner;
  - GC;
  - outsider.
- **Produced by their own RPCs, as their real actors:**
  - **Job 1, C4:** r1 is returned. r2 is accepted with conditions after the partner slot is replaced through the RPC.
  - **Job 1, C6:** completion `completed_with_conditions`, with zero blockers.
  - **Job 1, C5:** a GC cabinetry fulfilment and a client-furnishing fulfilment (with a `contract_reported` event). One FF&E line is converted to the client rail with `set_ffe_item_external_fulfilment`.
  - **Job 2, C4 (paper policy):** offline presentation, then two paper intakes, then the service-role hash stamp, then admin review. Result: p1 `closed`/`accepted`.
  - **Job 2, C6:** the completion is completed, then revoked.
  - **Job 3, C4:** s1 is withdrawn. s2 is sent and still open.
- **Legacy rows, constructed because their creation is not under test.** All are on job 1.
  - **Stage-2 `project_artifact_v1`:**
    - a1 `plan_issue`, pending;
    - a2 `spec_book_artifact`, an unsent draft that still needs review;
    - a3 `budget_version`, responded and approved;
    - a4, withdrawn;
    - a5, superseded by a1.

    a1, a3, a4 and a5 each carry the lead's review confirmation (the real publish order). a4 and a5 are `expired` and carry the withdraw and supersede receipts the RPCs write.

  - **Legacy `client_decisions`:**
    - b1, a pending selection with two options;
    - b2, a pending sign-off in the client's court;
    - b3, a pending submittal in the designer's court;
    - b4, a responded selection.

`export-payloads.mjs` refuses any API other than 127.0.0.1:59121. It signs each actor in through GoTrue (password grant) and records the exact RPCs and PostgREST selects each consumer sends:

- the web hooks;
- iOS `DecisionsAPIClient` `listPending`/`listOptions`, approvals and service acceptance;
- Capture `SupabaseDecisionsReadService`;
- the client-portal legacy count select.

The output is `payloads/mixed-payloads.json` (10 actors, 279 kB, no keys or tokens; `grep -c "eyJ\|sb_secret\|password"` = 0).

Each rebuild runs `supabase stop --no-backup`, start, cron off, apply, export. Final run: `START 0 · CRON off · SYS 7702039555739615274 · APPLY 0 · EXPORT 0`, with 0 `ERROR` lines in the apply log.

**What the projections returned, read back from the payloads**

- **Studio A (owner, member, admin)**
  - Approval inbox: a1–a5 (5 rows, `viewerRole` `studio`).
  - Service requests (`get_my_service_acceptance_requests`): `[]`.
  - Evidence: 403.
- **Client lead**
  - Approval inbox: a1–a5 (`viewerRole` `lead`).
  - Service requests: s2 sent/`signer_required`, s1 withdrawn, p1 closed/**observer** (a paper-policy job), r2 closed, r1 closed.
- **Co-client**
  - Approval inbox: 0.
  - Service requests: r1, r2, s1 and s2.
- **Replaced partner**
  - Service requests: r1, s1 and s2. **r2 is gone.**
- **Replacement partner**
  - Service requests: only r2. The answer is recorded.
- **Studio B, GC and outsider**
  - Empty lists.
  - `get_project_decision_review` returns `null`.
  - Project reads return 403.
- **Client threshold (`get_client_project_threshold`, job 1)**
  - The lead gets one `kind:"external"` selection: `responsibility:"external"`, `clientUnitPriceCents:null`, `externalFulfilmentId` set.
  - The co-client gets 403.

## 2. Criterion table

| ID / clause                                                             | Before                     | Now                                       | Spec                           | Asserted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Readback                           | Runs                              |
| ----------------------------------------------------------------------- | -------------------------- | ----------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | --------------------------------- |
| X08a: an unsupported service kind never reaches the older approval list | weak (SQL projection only) | **covered**                               | ACCEPTANCE X08                 | `main`'s `use-project-approvals.ts` is transpiled from `git show main:` and run over all 21 recorded approval lists (10 actors; inbox plus per-job). Every row parses, the kind is one of 3 legacy kinds, the ids are a1–a5, and no row has `requestId` or `signers`. Older output `toEqual` current output, and the blob is identical. Single-review reads parse for readers and are `null` for everyone else.                                                                                                                                                                                                                                                                                                                | recorded payloads                  | designer jest 29/29 ×2            |
| X08b: one new record cannot break that inbox                            | weak                       | **covered**                               | ACCEPTANCE X08                 | Negative control: a recorded service row thrown into the older parser fails with `invalid artifactKind`, and the whole list fails with it. The projections never emit one (above). Client project counts (`projects.ts`, same blob as main): job1 = 2, job2/job3 = 0, unchanged with every service row injected into the Stage-2 list. iOS: an approvals list holding one service row fails `DecodingError` (the list then degrades to `[]` via `try?` in `DecisionsListViewModel.load`). The recorded lists never hold one.                                                                                                                                                                                                   | recorded payloads                  | client jest 15/15 ×2; Patina unit |
| X08c: current consumers show the right items (web)                      | weak (RC-2 walk)           | **covered**                               | X08, C4 §2.10                  | Client attention: `[true,true,false,false,false]`; labels `Response required / Review required / Approved / Withdrawn / Superseded`. Door: exactly one link `/acceptance/<s2>` on job 3 for the lead, co-client and replaced partner; none on jobs 1–2, and none for the replacement partner. `readMyStudioServiceCompletion`: r2 `completed_with_conditions`; p1 (revoked) `null`. Studio readers parse all three jobs; job2's completion is listed with `revokedAt`.                                                                                                                                                                                                                                                         | recorded payloads, rendered DOM    | jest ×2                           |
| X08d: iOS Patina decoders and feeds                                     | absent                     | **covered (unit, recorded payloads)**     | X08, C4 §2.10                  | `[RemoteProjectApprovalReview]` decodes for all 10 actors. The lead `viewerAnswers` all 5, and the feed carries only a1. Studio readers observe, with an empty feed. Default-include is pinned: `signer_required`/`signer_optional` → `.unspecified` (answers); `observer`/`household` → observes. Service decoder unknown → observer. `canRespond` is s2 only, for the lead, co-client and replaced partner. The model gives 1 open and 4 past. Evidence `matches` its request for every signer who can read it (403 otherwise). `StudioServiceReading`: r2 → `completeWithConditions`; revoked p1 → `notYet`. Legacy `listPending`: the lead gets b1–b3 (b2 is the only approvable sign-off); the studio gets a1 plus b1–b3. | recorded payloads                  | ios-gate unit, 2813 tests         |
| X08e: Field (Capture) consumers and deep links                          | absent                     | **covered (logic bundle, source-pinned)** | X08                            | The app's select, filter and required `DecisionRow` fields are pinned from source. Every recorded row carries them and maps to `FieldDecision`. Studio: a1 plus b1–b3 with project and client names; others empty. Detail plus options decode. A Field margin note (`MarginNoteWriteRequest`) has no `subject_*` keys, and the live insert as designer 1 succeeds under 00874/00877 (subject null; rolled back). Deep links reach decisions only through the harness, and no service route exists. Capture has 0 source changes vs main.                                                                                                                                                                                       | recorded payloads; live psql probe | capture-gate                      |
| X08f: existing client-page consumer of a new record (C5 external line)  | not covered                | **covered, DEFECT**                       | ROLLOUT §27 (old readers safe) | Current `adaptClientSelections` keeps the line `external` and unpriced; `threshold.tsx` filters it. `main`'s adapter reads it as `kind:'furnishings'`, priced 0/0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | recorded payload                   | client jest ×2                    |

## 3. Commands and counts (verbatim)

```
# owned stack (scratch config: ports 591xx, project_id patina-rc7-e7)
supabase stop --workdir <scratch> --no-backup; supabase start --workdir <scratch> -x realtime,studio,mailpit,logflare,vector,edge-runtime,imgproxy,postgres-meta
psql postgresql://supabase_admin:…@127.0.0.1:59122/postgres -c "ALTER SYSTEM SET cron.launch_active_jobs = off" -c "select pg_reload_conf()"   # SHOW → off
psql -X -1 -v ON_ERROR_STOP=1 -v owned_port=59122 -v owned_system_id=<sysid> …:59122/postgres -f apps/designer-portal/e2e/round8/rc7-e7-fixtures/mixed-fixture.sql   # exit 0
RC7_E7_ENV=<scratch env, mode 600> node apps/designer-portal/e2e/round8/rc7-e7-fixtures/export-payloads.mjs   # exit 0

# web (each run twice)
cd apps/designer-portal && npx jest src/hooks/__tests__/rc7-e7-x08-consumers.test.ts   # Tests: 29 passed, 29 total (×2)
cd apps/client-portal && npx jest src/lib/__tests__/rc7-e7-x08                        # Tests: 15 passed, 15 total (×2)

# iOS
IOS_GATE_UDID=D68050C3-… apps/mobile/Patina/scripts/ios-gate.sh all
CAPTURE_SIM_UDID=D68050C3-… apps/mobile/Capture/scripts/capture-gate.sh all
```

Gate results are in §5.

## 4. Defects and observations

**DEFECT RC7-e7-1 (low): an older client page renders a C5 external line as a $0 studio piece.**

- **Root cause.** `supabase/migrations/00883_round8_external_reader_parity.sql:773` appends `_external_presence_lines(p_project_id,true)` (row shape :18, `'kind','external'`) to the existing, unversioned `selections` array of `get_client_project_threshold`.
- **What the older reader does.** `main`'s `apps/client-portal/src/lib/commercial-documents.ts` `adaptClientSelections` runs `oneOf(row.kind, ['furnishings','trade'], 'furnishings')` and `number(undefined) → 0` (main :416). The older client page therefore draws a "client-bought chair" as an ordinary studio furnishing at $0.
- **When it can happen.** Only once C5 presence is active (the `set_ffe_item_external_fulfilment` grants) while a pre-round-8 client portal is being served. That covers a client-portal rollback after activation, or activation before the client deploy.
- **Test.** `apps/client-portal/src/lib/__tests__/rc7-e7-x08-client-consumers.test.tsx`, "older adapter (main)". It asserts today's older behaviour under a `// DEFECT RC7-e7-1` comment.
- **Fix options.** Not fixed here (product code). Either version the projection, or add an activation-gate rule: never activate C5 presence while a pre-round-8 client build can be served, and never roll the client portal back past round 8 after activation.

**Observations (pre-existing, not X08 defects)**

- **Client legacy pending count is always 0 for clients.** A client JWT cannot read `designer_clients`; its RLS policies cover designers only. The client-portal legacy pending count (`projects.ts` `countLegacyPendingDecisionsByProject`, `designer_clients!inner`) therefore returns `[]` for the lead: legacy b1/b2 add 0 to the project badge. Same blob as main.
- **Web and iOS treat an unsent Stage-2 draft differently.** Web `isClientActionableProjectApproval` counts the unsent draft a2 ("Review required"). iOS `awaitsClientInFeed` excludes it (`isPublished`, the W1R2-M3 ruling). Both files are unchanged from main.
- **Field shows Stage-2 rows.** Field's designer pending list includes the Stage-2 row a1 next to legacy rows. Capture reads `client_decisions` directly and has not changed since main. No round-8 record enters this list.

## 5. Gates

- **jest.** Designer 29/29 and client 15/15, each run twice.
- **Type-check and lint.** `npx tsc --noEmit -p .` in `apps/designer-portal` exit 0 and in `apps/client-portal` exit 0. `npx eslint .` in `apps/designer-portal`: exit 0, `0 errors, 252 warnings` (none in E7's file after removing two unused disable directives). Prettier clean on E7's web files (commit `54591c6e0`); jest re-run twice after formatting: 29/29 and 15/15.
- **`ios-gate.sh all` (Patina), run twice; the final run is on the committed tree (`54591c6e0`, simulator `rc7-e7`).** Build: pass. Unit: `Test run with 2813 tests in 302 suites passed … with 2 known issues`, `** TEST SUCCEEDED **`. Suite "RC7-E7 X08 mixed-record payloads" passed.
  - The 2 known issues are `withKnownIssue` markers in `BrandVoiceLintTests` and `RoomLifecycleTests`, which are not E7 files.
  - `lint-delta` reported **red** on three round-8 product files, all new on this branch versus main:
    - `DecisionsAPIClient+ServiceAcceptance.swift` (0 → 1, `file_length`);
    - `ServiceAcceptanceDetailView.swift` (0 → 2, `file_length` and `type_body_length`);
    - `ServiceAcceptanceModel.swift` (0 → 1, `statement_position`).

    These are **pre-existing at the lane base `3cf79663c`**. E7 does not touch them, and `swiftlint lint` on them at the base gives the same 1/2/1. They are branch debt for whoever owns WP-10C-d. E7's own Swift files lint clean (`swiftlint lint --quiet` gives no output).

- **`capture-gate.sh all` (Field).** ✔ build, ✔ tests (CaptureTests, including "RC7-E7 X08 Patina Field consumers"), ✔ ui tests, ✘ swiftlint.
  - The swiftlint red is four `function_parameter_count` errors in `Capture/Features/SiteScan/SupabaseSiteScanService.swift` (:304, :353, :423, :967). **Pre-existing:** that file is byte-identical to `main` (`git diff --quiet main -- …` exit 0, blob `ab5863472`), and E7 changes no Capture product file. E7's `RC7E7FieldConsumerTests.swift` lints clean.
  - The gate regenerated `Capture.xcodeproj` for the new test file (`project.pbxproj` plus the `Capture` and `CaptureKit` schemes' CaptureTests BlueprintIdentifier); those regenerated files are committed with the test (`da52bd4cf`).

## 6. Harness debt (shared-port grep)

- No existing suite, helper or fixture runner was run in this lane.
- `grep -nE '5432[12]'` across E7's files matches only `mixed-fixture.sql:23`. That line is the refusal guard, which rejects 54321 and 54322.
- `ios-gate.sh` and `capture-gate.sh` have no matches.

## 7. Not verified, and why

- **Patina UI tier against the owned stack.** It is possible in principle: `-DeploymentTarget local` plus the `LocalSupabaseURL` user default accept `http://127.0.0.1:59121`. It was not run, for three reasons:
  - this lane has no device-automation tool;
  - an XCUITest would also need sign-in and onboarding automation;
  - a launch argument that is lost or misparsed falls back to `.cloud` (Strata, production), which this lane must never touch.

  The decoder and model tier ran over the real payloads instead.

- **Field app-target decoder.** `DecisionRow` is `private` to the app target, and `CaptureTests` links CaptureKit only (generate_project.rb: SDK use is app-side). E7 therefore pins the select and the required fields from source and checks the payloads against them. The supabase-swift decode itself did not run.
- **The `/acceptance/[requestId]` page and approval detail screens were not rendered.** RC-2 covered the web walk.
- **Device-level walks.** No device-level behaviour was checked: no VoiceOver and no physical device.

## 8. Teardown

- **Owned stack.** `supabase stop --workdir <scratch> --no-backup` for `project_id = "patina-rc7-e7"`. Afterwards `docker ps -a` and `docker volume ls` show 0 entries for `patina-rc7-e7`. No listener is left in the owned block (59120–59129, 59183). The one 591xx listener still up is a node process on 59134 that predates this lane and is not E7's.
- **Local env file.** The scratch env file (mode 600) is deleted.
- **pg_cron.** It was off for the stack's whole life: `cron.launch_active_jobs = off` was applied as `supabase_admin` after every start, and `SHOW` returned `off`. No scenario needed a scheduled job.
- **Simulator.** `rc7-e7` (`D68050C3-0A15-4634-82D5-22B181DB6D43`) is shut down and deleted (`simctl list` gives 0 matches). No other simulator or device was touched.
- **Shared stack.** 54321 and 54322 were never touched. No `supabase:reset`, `--linked`, Strata, PostHog or any production service.
- **Key exposure (disclosure).** While diagnosing a failed start, one `supabase start` log tail printed the owned stack's local credentials to the agent transcript. They are the standard Supabase CLI demo keys for a throwaway local stack (the same anon key is committed in `APIConfiguration.swift`), and that stack no longer exists. Nothing was written to the repo, and every committed file passes a `eyJ…|sb_secret|sb_publishable|service_role_key|PGPASSWORD` grep.
