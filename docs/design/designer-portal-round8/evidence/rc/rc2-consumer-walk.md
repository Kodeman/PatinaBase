# RC-2 consumer walk

Date: 2026-10-28. The current result is the last section, **"2026-10-28 RC-2c: owned-target harness, committed runner and evidence content"**. It supersedes the RC-2b harness description and narrows some RC-2b claims. RC-2b and the sections before it are kept as history.

## Owned environment and designer UI

- Reused the owned `patina-sq2235-rc2` Supabase stack at API `http://127.0.0.1:56321`, DB `127.0.0.1:56322`; no reset or reseed. No shared-stack (`54321/54322`) writes were made.
- Started the designer portal on `localhost:3200` with process-only environment values read from `supabase status --workdir <owned stack> -o env`: both Supabase URLs point to 56321, round-8/document flags are enabled, live-data mode is enabled. The service-role key hash matched the owned-stack key hash; neither key was printed or recorded.
- The current fixture project is `2faca847-f28d-4ec3-b580-77a0eb31f9a1`, not the stale `/doc/69372989-365a-431c-acef-e78a0ae1a093` URL in earlier notes. `/desk` and `/doc/2faca847-f28d-4ec3-b580-77a0eb31f9a1` load as `RC2 Designer`; the service-acceptance and studio-service sections are present. Thus the earlier designer role redirect is not currently reproduced with the owned URL/key environment and current fixture route. This does not establish the precise cause of the earlier redirect.
- The request already present in the paper is request `0f482529-14ba-4896-9c10-76af8a2ce137`, lifecycle `draft`, with outbound draft `c5faa7e8-d834-49c3-b06c-d95025ee5225`. It was created by the prior continuation through the authenticated designer RPC, not by this UI pass.
- Opened the existing V22 “Ready to send” sheet from the designer UI. It displayed “To no address on file” and “An explicit recipient and address are required. No audience is chosen for you.” The outbound draft has `to_address IS NULL`, status `awaiting_review`; its stored `to_client_id` is the client signer profile. Did not check or send it. The UI’s explicit recipient hold remains in force.
- Checked names of environment variables in the owned edge-runtime container only: `docker exec supabase_edge_runtime_patina-sq2235-rc2 sh -c 'env | cut -d= -f1 | sort' | grep -Ei 'RESEND|SMTP|MAIL'` returned no output. No provider credentials or external-send configuration were observed; no external message was sent.
- Screenshot of the V22 sheet and its no-address hold: `/Users/kody/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-2235/v22-send-blocked-no-recipient.jpg`.

## Owned-database readback

- Project `2faca847-f28d-4ec3-b580-77a0eb31f9a1`; active scope edition `da88a9ec-c033-4ab3-9de4-700c16e7a829`; evidence manifest `00b674cc-fb92-45c4-be26-017f80521a1e`.
- Request `0f482529-14ba-4896-9c10-76af8a2ce137`: `lifecycle=draft`, `aggregate_outcome=pending`, `sent_at=NULL`; two required active signers (client and partner). There are 0 responses, 0 paper intakes, 0 send-time evidence snapshots, 0 condition resolutions, and 0 studio-service completions for this request.
- The following local-only activation transaction is the exact statement set applied earlier on the owned DB container. The guard refuses any database other than local `postgres` on container port 5432 (host port 56322). It was not run against Strata.

```sql
BEGIN;
DO $$
BEGIN
  IF current_database() <> 'postgres' OR current_setting('port') <> '5432' OR inet_server_port() <> 5432 THEN
    RAISE EXCEPTION 'refusing grants outside the owned local database container on port 5432';
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.create_service_acceptance_request(uuid,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_service_acceptance(uuid,text,jsonb,text,text,text,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_service_acceptance_paper_intake(uuid,uuid,uuid,date,text,text,jsonb,text,integer,text,text,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_service_acceptance_paper_intake(uuid,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_service_acceptance_signer(uuid,uuid,uuid,uuid,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_service_acceptance_request(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stamp_service_acceptance_paper_hash(uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_studio_service(uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_service_acceptance_condition(uuid,uuid,text,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_studio_service_completion(uuid,text) TO authenticated;
COMMIT;
SELECT role_name, function_name, has_function_privilege(role_name, function_name, 'EXECUTE') AS execute_granted
FROM (VALUES
  ('authenticated','public.create_service_acceptance_request(uuid,uuid,uuid,text)'),
  ('authenticated','public.respond_service_acceptance(uuid,text,jsonb,text,text,text,integer,text,text)'),
  ('authenticated','public.record_service_acceptance_paper_intake(uuid,uuid,uuid,date,text,text,jsonb,text,integer,text,text,integer,text)'),
  ('authenticated','public.review_service_acceptance_paper_intake(uuid,text,text,text,text)'),
  ('authenticated','public.replace_service_acceptance_signer(uuid,uuid,uuid,uuid,integer,text,text)'),
  ('authenticated','public.withdraw_service_acceptance_request(uuid,text,text)'),
  ('service_role','public.stamp_service_acceptance_paper_hash(uuid,text,text,text)'),
  ('authenticated','public.complete_studio_service(uuid,uuid,text,text)'),
  ('authenticated','public.resolve_service_acceptance_condition(uuid,uuid,text,jsonb,text)'),
  ('authenticated','public.revoke_studio_service_completion(uuid,text)')
) AS grants(role_name,function_name);
```

Current readback of that exact `has_function_privilege` projection on owned DB port 56322 (all rows are `true`):

| Role | Function | EXECUTE |
|---|---|---|
| authenticated | `public.create_service_acceptance_request(uuid,uuid,uuid,text)` | true |
| authenticated | `public.respond_service_acceptance(uuid,text,jsonb,text,text,text,integer,text,text)` | true |
| authenticated | `public.record_service_acceptance_paper_intake(uuid,uuid,uuid,date,text,text,jsonb,text,integer,text,text,integer,text)` | true |
| authenticated | `public.review_service_acceptance_paper_intake(uuid,text,text,text,text)` | true |
| authenticated | `public.replace_service_acceptance_signer(uuid,uuid,uuid,uuid,integer,text,text)` | true |
| authenticated | `public.withdraw_service_acceptance_request(uuid,text,text)` | true |
| service_role | `public.stamp_service_acceptance_paper_hash(uuid,text,text,text)` | true |
| authenticated | `public.complete_studio_service(uuid,uuid,text,text)` | true |
| authenticated | `public.resolve_service_acceptance_condition(uuid,uuid,text,jsonb,text)` | true |
| authenticated | `public.revoke_studio_service_completion(uuid,text)` | true |

## Not completed / limits

No V22 send was performed because the UI draft has no explicit address, and the contract forbids external sends. Therefore no client response/return, successor/supersession, paper intake or real edge-function hash stamp, condition resolution, completion/revocation, care-link return, A22 delivery/silence checks, or X08 compatibility leg could proceed against a sent request. No client-portal session or iOS simulator leg was run. No paper hash was fabricated. Prior fixture setup and the existing proposal acceptance are not counted as service-acceptance consumer evidence.

## Teardown

Stopped the designer dev server on port 3200 with its owned task ID. Ran `supabase stop --workdir /private/tmp/claude-501/-Users-kody-Code-patina-merged/1460bfe7-3b74-49b1-b90e-b7c7dd33fdc9/scratchpad/sq2235-stack --no-backup`; the CLI confirmed the owned stack stopped. A listener check found no processes on ports 3200, 56321, or 56322. No simulator was created in this continuation. The pre-existing `apps/designer-portal/next-env.d.ts` modification is unrelated and outside this evidence change.

## Root cause (orchestrator)

A20–A23/X08 are BLOCKED by the service-acceptance draft address defect: `create_service_acceptance_request` in migrations 00886/00889 calls `compose_outbound_draft` with `client_id` but omits `address`, so the resulting draft has no address and V22 correctly holds Send. Unlike other client-draft callers (for example `supabase/functions/invoice-reminders/index.ts:471`), this path does not resolve and pass the client email. The orchestrator is filing a migration repair; re-walk these legs after it lands. No fixture email was changed and no further journey legs were attempted.

## Verification

Pinned verifier: `test -s docs/design/designer-portal-round8/evidence/rc/rc2-consumer-walk.md`.

## 2026-10-28 continuation attempt after 00890

This continuation did not complete the consumer walk. The owned stack was restarted for read-only checks; startup replayed migrations from `00001` through `00889` and the configured local seeds. On that resulting owned DB at `127.0.0.1:56322`, project `5e665f87-6dde-4840-9420-8ded50e7f71c` and the `RC2`-named project were absent, the fixture profile `8eef5bee-15af-4cc8-8ca1-6c2959663399` was absent, and `service_acceptance_requests` contained zero rows. Therefore this DB could not provide readback for the earlier fixture or confirm the manually applied `00890` state. No reset or manual lifecycle-row creation was performed in this continuation. The stack was stopped afterward with backup enabled.

The browser extension disconnected during the designer UI attempt. No UI request, send, client response, paper intake, condition resolution, completion/revocation, care return, client-portal, or iOS leg was completed. No external message was sent.

- A20: **BLOCKED** — no request was sent; the current owned DB had no RC2 project or acceptance request, so scope edition and required signers could not be read back for this attempt.
- A21: **BLOCKED** — no service-completion journey was performed; the absent project/request prevents confirming service completion independently from GC, finance, or project closure.
- A22: **BLOCKED** — no send or response occurred; silence/opening/delivery behavior was not exercised.
- A23: **BLOCKED** — no completion or care-return journey occurred; care records were not tested.
- X08: **BLOCKED** — no current RC2 records were available to exercise compatibility across old and new consumers.

The earlier sections remain historical observations from their captures; this continuation does not supersede their recorded rows or establish that the repaired journey passes. The local evidence needed for a true re-walk must be restored, and the browser automation connection must be available.

## 2026-10-28 RC-2b: reproducible Playwright journey after 00890

SQ-2329 replaced the hand-driven walk with a committed fixture and Playwright legs. Nothing in it is driven through a browser extension, and RC-6 can re-run it.

- Fixture: `apps/designer-portal/e2e/round8/consumer-journey-fixture.sql`. It applies `f01-fixture.sql` first, then follows `service_acceptance_body.psql`'s origin path:
  - The agreement is drafted, sent, signed by the client and countersigned by the designer.
  - That gives an active scope edition whose signer policy names two required signers: client `rc2-client@patina.test` (`profiles.email`) and household partner `rc2-partner@patina.test`.
  - It also creates a `service_acceptance` evidence manifest, one citable drawing issue, and completed phases.
  - Each application composes a fresh job. Acceptance, response and completion rows are append-only, so they are never edited or deleted.
  - Psql guard: `-v expected_port` must match a `127.0.0.1` connection.
  - Two labelled, local-only activation blocks each refuse unless they are on the local container port 5432. Block 1 is the `scope_editions` capability, which must be on before composition and countersign. Block 2 is the GRANT set above, at the end of the file. Migrations stay inactive.
- Designer leg: `apps/designer-portal/e2e/round8/consumer-journey.spec.ts`. Client leg: `apps/client-portal/tests/round8-consumer-journey.spec.ts`. Five tagged legs run in this order: designer `@rc2-send` → client `@rc2-return` → designer `@rc2-resend` → client `@rc2-accept` → designer `@rc2-complete`. Each is its own Playwright run (designer on 3200, client on 3202).
- Configs:
  - Both run with ad hoc `--config` files outside the repo. No `playwright*.config.ts` was edited.
  - The designer config uses the same server env and flags as `playwright.round8.config.ts`, minus that config's global setup and teardown. The F01 teardown deletes the F01 studio between runs, which would delete the journey's studio (it failed on run dev1 with `non-draft proposals are immutable editions`). The fixture applies F01 itself.
- Owned stack: Supabase CLI 2.120.0, project `patina-sq2329-rc2b`, API 56321, DB 56322, edge-runtime enabled.
  - Startup on a fresh volume replayed migrations through `00890` plus the configured seeds. Ledger readback: `00890` present.
  - The functions env was `EMAIL_DEV_MODE=dry_run` only. Before the first Send, the edge-runtime container's env names held no `RESEND`/`SMTP`/`MAIL` key, and `EMAIL_DEV_MODE=dry_run`. `send-email.ts` dry-run returns `delivered` without network I/O, so nothing left the machine.
  - No address, lifecycle, response or completion row was hand-set. Every one came from the UI → RPC → `outbound-draft-send` path.
- Logs and Playwright reports: `/Users/kody/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-2329/{run1,run2}/` (per leg `*.log` plus `designer-*`/`client-*` report dirs). Journey summaries: `run1-journey.txt` and `run2-journey.txt`. `dev1`–`dev3` hold the development iterations.

### Stability

The committed specs (`281ddbd3f`) passed two fresh, back-to-back journeys, 5/5 legs each: run1 (job `f3c75562-b6c1-48c1-b9b5-1b328821abc3`) and run2 (job `03757020-de20-45e2-bb50-92505d8ba99d`). Before them, a full development journey (dev3) also passed 5/5.

### DB readback (run1; run2 matches with its own IDs)

- **Send leg** (`@rc2-send`, `@rc2-resend`). Requests 1 `47a48546…`, 2 `5c1dac6e…` and 3 `736ce4cc…`:
  - Each is `lifecycle=sent` against active edition `24a5c9ed-4de4-47d2-bf3b-220aa2a3bea9`, with `scope_content_hash` equal to the edition `content_hash` and `requiredSigners=2`.
  - Each V22 draft reads `status=sent` and `to_address=rc2-client@patina.test`, for example draft `0aee43fd-8576-441a-833f-8e9543076b89`. The Ready-to-send row showed `To rc2-client@patina.test`.
- **Return leg** (`@rc2-return`):
  - Before answering: responses `[]` and request `sent|pending` after the client opened it from the house-page door.
  - After answering: one `client` response `return` / `portal_authenticated` with a reason. Request 1 is `closed|returned`.
- **Resend / supersession** (`@rc2-resend`):
  - The return is answered by a fresh request 2. Drafting request 3 while request 2 was open set request 2 to `superseded|pending`, `superseded_reason=successor_request`.
  - Request 3's `predecessor_request_id` is request 2. The designer card reads "Replaced because a newer request took its place." Request 1 stays `closed|returned`.
- **Accept leg** (`@rc2-accept`):
  - Partner `accept` / `portal_authenticated` alone left request 3 `sent|pending`. The partner's view still lists the client as "Waiting for response".
  - The client's `accept_with_conditions` (one condition) then closed it `closed|accepted_with_conditions`. Both responses are `portal_authenticated`.
  - Afterwards the client house page rendered with no acceptance door.
- **Completion and care** (`@rc2-complete`):
  - "Complete studio service" recorded completion `98c42509-e913-4fce-a3aa-00522046ee59` as `completed_with_conditions` on request 3 (DB check right after the act). `projects.status` and `closure_checklist` were unchanged.
  - The open condition was resolved through the UI, citing the drawing issue; 1 row in `service_acceptance_condition_resolutions`.
  - Care references read "accepted on request 3". "Open the specification" unfolded `pieces`/`spec` over `/doc/<job>` with no route change. Esc folded it back, cleared `unfold`, and returned focus to the opener in Closeout.
  - Revoke recorded `revoked_at` with reason "Fictional: punch list reopened."
  - Final readback `state=completed`: after the condition closed, the row reads `completed`. Project status and checklist were still unchanged.

### Acceptance IDs

- A20: **PASS** for the legs exercised:
  - The request uses the agreed edition and its two-required-signer policy.
  - One required acceptance with the other pending stays incomplete.
  - A return needs a new request, and a successor supersedes the open request.
  - The designer request goes out through V22 Send to the 00890 address.
  - The authenticated client-portal response produces the scoped truth.
  - **Not exercised:** paper intake (upload, edge hash stamp, second-reviewer confirm), signer replacement, scope-edition supersession, and the iOS response. Those parts of A20 remain unverified by RC-2b.
- A21: **PASS** for one service shape (studio design; client buys; GC installs). Studio service completion was recorded and revoked without touching project status or the closure checklist. **Not exercised:** the design-only and client-buy variants, and GC/financial closeout distinctness beyond the unchanged project row.
- A22: **PASS**:
  - Delivery and opening recorded no acceptance: responses `[]` after the V22 send and the client open.
  - Conditional acceptance kept the open condition visibly listed until it was resolved (K3 option A: completion recorded `completed_with_conditions`).
  - **Not exercised:** walkthrough, and external punch items as informational.
- A23: **PASS** for the care reference: it names the accepted request and edition, unfolds the specification, and returns to its Closeout opener. Revocation keeps the record. **Not exercised:** a later care question after close, and post-close edition behaviour.
- X08: **PASS** for the web client consumer. The existing client house page renders beside the new records, and the decided request drops out of the door. **Not exercised here:** iOS/Field consumers and old-parser fixtures (old-parser coverage is the SQL `service_acceptance_x08_test.sql` in RC-1).

iOS is skipped (optional per the ticket). No product defect blocked the journey.

## 2026-10-28 RC-2c: owned-target harness, committed runner and evidence content

SQ-2337 repairs the RC-2b harness against review SQ-2334 (F1–F3). The legs, tags and order are the same as in RC-2b. What changed is how the target is bound, how the run is driven, and what each leg proves.

### F1: the fixture refuses any target it does not own, before any write

- `consumer-journey-fixture.sql` now refuses before its first statement that writes, and before the `\ir f01-fixture.sql` include. It requires three psql variables: `owned_port`, `owned_server_addr` and `owned_system_id`. It refuses when:
  - the connection host is not loopback;
  - the port is a shared-stack port (54321/54322), or `owned_port` is one;
  - the port differs from `owned_port`;
  - `inet_server_addr()` differs from `owned_server_addr`;
  - `pg_control_system().system_identifier` differs from `owned_system_id`.
- Inside the transaction, `pg_temp.require_owned_cluster()` re-checks the system identifier before each of the two activation blocks (the `scope_editions` capability and the GRANT set).
- The identity is not derived from the URL under test. The runner reads it from Docker for the stack it started:
  - container label `com.supabase.cli.project=patina-rc2-journey`;
  - the published `5432/tcp` and `8000/tcp` host ports;
  - the DB container's IP on that project's network;
  - the cluster system identifier, read inside that container over its own loopback.

  It then cross-checks that the URL under test reports the same server address and system identifier. It also checks that the shared stack's identifier differs.
- The Playwright configs and both journey files refuse to start unless the `RC2_OWNED_*` variables are set. They also refuse a non-loopback URL, a shared port, or a port other than the owned one.
- **Refusal proof** (`run-consumer-journey.mjs --refusal-check postgresql://postgres:postgres@127.0.0.1:54322/postgres`): `/Users/kody/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-2337/refusal/refusal-check.json`.
  - Read-only markers were taken before and after: RC2 users, RC2 jobs, F01 actors, RC2 manifests, the `scope_editions` capability, and the EXECUTE grants on `create_service_acceptance_request`/`complete_studio_service`. They were identical (0, 0, 0, 0, false, false, null).
  - Fixture with no identity: exit 3, refused.
  - Fixture with an identity self-derived from the 54322 URL: exit 3, `REFUSED: port 54322 is the shared Supabase stack`.
  - Designer journey config with shared-stack env: exit 1, refused.
  - Nothing was written to the shared stack.

### F2: committed opt-in configs and a sequential runner

- New configs:
  - `apps/designer-portal/playwright.consumer-journey.config.ts` (port 3200);
  - `apps/client-portal/playwright.consumer-journey.config.ts` (port 3202).

  No existing `playwright*.config.ts` was edited. There is no global setup or teardown.
- The journey files were renamed `*.spec.ts` → `*.journey.ts`, so the default configs' `testMatch` does not discover them. Only the consumer-journey configs match them. Type-check covers them.
- Runner: `node apps/designer-portal/e2e/round8/run-consumer-journey.mjs --evidence <dir> [--runs 2]`. It uses Node built-ins only. For each run it:
  1. Checks that at least 9 GiB of disk is free. It refuses if the project's containers already exist or ports 57321/57322/3200/3202 are in use.
  2. Creates an exclusively owned scratch child with `mkdtemp` (under an existing `--workdir <parent>` when supplied) and copies `supabase/` there. It refuses root, home, the repo and git checkout roots, resolving symlinks before checking. It copies only the five version/storage-migration pins from `supabase/.temp`, never the project-ref, linked-project or pooler-url pins.
  3. Offsets every port by +3000.
  4. Writes `functions/.env` with `EMAIL_DEV_MODE=dry_run` only.
  5. Runs `supabase start` without studio, mailpit, logflare, vector, imgproxy or postgres-meta. Edge-runtime stays up for V22 Send.
  6. Proves ownership as described above.
  7. Records `stack-receipt.json` (names and ids only, never keys). It includes the edge-runtime functions env: `EMAIL_DEV_MODE=dry_run`, and no name matching RESEND/SMTP/SENDGRID/POSTMARK/MAILGUN/SES_/TWILIO.
  8. Runs the five legs in order against that one stack. F01 is set up once, by `@rc2-send`'s `beforeAll`, before the designer signs in. No leg tears anything down.
  9. Finally runs `supabase stop --no-backup`. A non-zero stop exit, a failed resource check, or any remaining container or volume makes the result FAIL. Only a complete teardown (stop exit 0 and both counts 0) removes the owned child; incomplete teardown retains it and prints its recovery path. Preparation failure before startup removes only that owned child. The caller's parent is never removed. `--keep-stack` intentionally retains the stack and child and prints the recovery path.

### F3: what each leg now proves

- **Issued evidence:**
  - The `@rc2-send` `beforeAll` uploads two real PDF prints through the Storage API into `project-documents` under a uuid run folder.
  - The fixture refuses unless both objects exist. It then inserts the plan chain on top of them, the same way `service_acceptance_client_evidence_test.sql` does: documents, sheets A-101/A-201, a print batch, two prints with their sha256, and two issues.
    - Issue 1 is "RC2 fictional drawing set" (A-101).
    - Issue 2 is "RC2 fictional drawing set, revised" (A-101 + A-201).
  - It mints two evidence manifests with `create_evidence_manifest` as the designer: `rc2-sa-1` over issue 1 and `rc2-sa-2` over issue 2.
- **Send (`@rc2-send`):**
  - The designer picks evidence set 1 in "Evidence the client reviews".
  - The request row carries the agreed `scope_edition_id` and that manifest.
  - The send-time snapshot freezes member `plan_issue:RC2 fictional drawing set` and exactly the manifest's one file.
  - The V22 draft is `sent`, with `delivery_message_id` matching `^dryrun_\d+$`.
- **Return (`@rc2-return`):**
  - The client page shows the request number, the agreed scope edition id, and "Evidence reference · <manifest hash>".
  - As the client signer, the leg signs in through GoTrue and calls `get_my_service_acceptance_evidence`. The returned request, edition, manifest hash and member match.
  - It then downloads each listed document from Storage. Each starts `%PDF-`, and its sha256 equals the issued print's.
- **Resend (`@rc2-resend`):**
  - The new request uses the revised manifest, which differs from request 1's. Its snapshot freezes `plan_issue:RC2 fictional drawing set, revised` and two files, one of which is request 1's.
  - Request 3 is drafted on the revised set; supersession is asserted as in RC-2b.
  - Each send asserts the `dryrun_` id.
- **Accept (`@rc2-accept`):** the partner, then the client, each get the same page references and signer-API proof for the revised set (2 files). The accepted edition is `active`.
- **Complete (`@rc2-complete`):**
  - The accepted request is on the agreed edition.
  - The completion row reads `completed_with_conditions`, the request and that `scope_edition_id`.
  - Care reads "scope edition N, in force from … accepted on request M".
  - The rest is as in RC-2b.

### Narrowed claims

- **The client page shows references, not evidence content.** `ServiceAcceptancePage` does not pass the evidence to `ServiceAcceptanceReading`. The client sees the request number, the agreed scope edition id and the manifest hash, with the text "Their contents are not available on this page yet." The file contents reaching the client are proven through the signer's own authenticated API (RPC plus Storage download), not through page rendering. No claim is made that the client page renders the evidence.
- **The evidence prints sit in a uuid run folder, not under `<job>/`.** The job id is minted by countersign inside the fixture, after the upload. So the files are not listed among the job's stored documents in the condition-resolution picker; the drawing issues are.
- **Not exercised** (unchanged from RC-2b): paper intake, signer replacement, scope-edition supersession, iOS, design-only and client-buy service shapes, walkthrough, external punch items, later care questions, and old-parser consumers outside RC-1's SQL test.

### Runs

Command (from the worktree root): `node apps/designer-portal/e2e/round8/run-consumer-journey.mjs --evidence /Users/kody/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-2337/final --runs 2`.

- One fresh owned stack (Supabase CLI 2.120.0, project `patina-rc2-journey`, API 57321, DB 57322).
  - DB system identifier `7701817895472816170`, server address `172.24.0.2`. The shared stack's identifier is `7701004642274893866`.
  - The functions env holds `EMAIL_DEV_MODE=dry_run` and no provider key names.
- **run1: 5/5 passed**, job `fe6f6c50-f6ca-4644-aebd-a6ac8829fdc9`. Sends `dryrun_1793219308184`, `dryrun_1793219389413`, `dryrun_1793219395214`.
- **run2: 5/5 passed**, job `c05fca9b-c96a-4a12-ac5d-a5eee9320e66`. Sends `dryrun_1793219538816`, `dryrun_1793219610976`, `dryrun_1793219616666`.
- Teardown: `supabase stop --no-backup` exit 0; 0 containers and 0 volumes left; workdir removed.
- Evidence (outside the repo): `/Users/kody/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-2337/final/`.
  - `stack-receipt.json`, `journey.txt`, and per-leg logs and reports under `run1/` and `run2/`.
  - `executed-bytes.sha256` holds the hashes of the six harness files as executed.
- An earlier attempt (`final-attempt1/`) passed `@rc2-send`, but the runner rejected it on dev-server log text ("Sanity fetch failed"). The runner now judges only Playwright's own summary line.
- Development iterations are in `dev1/` and `dev2/`. dev2 found that a non-uuid first path segment in `project-documents` fails every designer list of that bucket, so the condition-resolution picker read "The references could not be read." The prints now use a uuid run folder.
