# RC-2 consumer walk

Date: 2026-10-28. The current result is the last section, **"2026-10-28 RC-2b: reproducible Playwright journey after 00890"**. The sections before it are the historical hand-driven attempts that were blocked.

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
