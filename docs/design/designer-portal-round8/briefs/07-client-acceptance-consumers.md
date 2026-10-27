# WP-10C — client acceptance consumers and request delivery

**Direction:** approved Room Proof 08 governs this program’s look/flow; current source and domain rules govern existing behavior. Follow FOUNDER-DIRECTION precedence. Resolve only the concrete P01/P02 conflict before its dependent change; continue unaffected work.

**Outcome:** the designer’s acceptance reading reflects real, authorized client responses across supported web/native consumers, with clear handling of old clients and any approved offline evidence.

Read C4/C6/C7, P06/P07, A20–A22 and X02/X03/X08/X09. The closeout domain owns the state transition; this stream owns consumer presentation, delivery handoff and compatibility. WP-10A first supplies the tested record/RPC/projections and server activation plan. Consume that implementation; do not introduce the RPC in a client branch. This stream’s evidence is a dependency of WP-10B, not a later polish task.

## Scope and ownership

- Designer request: use the current outbound draft owner and V22 designer Send. Request delivery is distinct from response, signature and final acceptance. Coordinate the designer integration patch with WP-07.
- Client portal: authenticated exact-scope review, required/optional signer role, pending/returned/superseded states, explicit response and printable evidence. Preserve deep links and truthful observer controls.
- Patina iOS: the same authority/version contract, including cached evidence, offline/revoked access, attachments and resuming an incomplete response. Do not claim old installed apps were upgraded by a web deployment.
- Paper/offline: implement only the policy recorded under P06/P07; name the authorized recorder, source evidence, date, review and provenance. A designer clicking a status is not automatically a client response.
- Compatibility: separate service-acceptance record/projection by default. Older approval lists cannot receive unknown artifact kinds. Current consumers can default an unknown viewer role to actionable UI, so new roles require coordinated projections and explicit-denial tests; the server remains authoritative.

## Current source entry points

- `packages/supabase/src/hooks/use-project-approvals.ts`: exact review/confirmation/response and list parsers.
- `apps/client-portal/src/components/threshold/approval-ask.tsx`, its `__tests__/approval-ask.test.tsx`, `src/lib/data/active-project.ts`, and `src/app/decisions/[id]/record/page.tsx`.
- `apps/mobile/Patina/Patina/Core/Network/DecisionsAPIClient+ProjectApprovals.swift`: native list/confirmation/response.
- `apps/mobile/Patina/Patina/Core/Network/DecisionsAPIClient+SharedDirection.swift`: current `get_project_decision_editions` / `get_project_decision_edition` detail reads with held authority revision/checksum. Inspect `SharedDirectionStore*` and `project-approval-attachments` for cached/attachment behavior.
- Existing SQL suites in `supabase/tests/workflow/approval_authority/`, `supabase/tests/decisions/00670_shared_direction_editions_test.sql`, and `supabase/tests/document/close_project_readiness_test.sql` are foundations, not proof of joint service acceptance.

Assign explicit web/native/hook pathspecs before dispatch. One domain owner reviews all API changes; consumer teams do not each introduce their own acceptance status.

## Gates

Build required shared distributions, then run affected `@patina/supabase`, designer and client type/unit gates. Client entry points include:

```bash
pnpm --filter @patina/client-portal type-check
pnpm --filter @patina/client-portal exec jest --runInBand --runTestsByPath \
  src/components/threshold/__tests__/approval-ask.test.tsx
pnpm --filter @patina/client-portal exec playwright test \
  tests/homeowner-usability.spec.ts --project=edition-usability
```

Confirm the actual test inventory/config at kickoff, and add assertions for the new behavior; existing filenames do not establish coverage. Integration CI’s Chromium project does not cover the separate `edition` / `edition-usability` projects.

Load `patina-ios-verification` before native execution. With an assigned simulator, use `IOS_GATE_UDID=<owned-simulator> apps/mobile/Patina/scripts/ios-gate.sh all <base-sha>`; `all` excludes UI tests, so run the `ui` tier for changed native acceptance interaction. Current regression families include ProjectApprovalPath/Act, ApprovalWhyAndChair, WalkCASAndFeed and SharedDirectionStore/Race/Files.

Required local cases: one required signer pending, concurrent/retried responses, changed scope, replacement/revocation while offline, observer/foreign-household denial, unsupported new records excluded from old lists, V22 delivery failure, and permitted paper evidence. Final state must agree across designer portal, client portal and iOS. Use local fixtures, never real outbound sends to prove the design.
