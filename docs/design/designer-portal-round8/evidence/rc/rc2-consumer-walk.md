# RC-2 consumer walk — partial / blocked

Date: 2026-10-28. This is a partial observation record, not a passed A20–A23/X08 walk.

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
