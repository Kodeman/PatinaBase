# Stage 2 approval-authority contracts

These failing-first contracts preserve
[`APPROVAL-AUTHORITY-CONTRACT.md`](../../../../docs/design/workflow-completion/APPROVAL-AUTHORITY-CONTRACT.md)
without introducing another approval aggregate. `client_decisions` remains the
public lifecycle; the projects-service `approval_records` path is legacy only.

The tests are split on the migration boundary:

- `00436_authority_evidence_contract_test.sql` checks household authority,
  private authority snapshots, immutable artifact/version evidence, review
  confirmations, three canonical outcomes with explicit impact deltas, RLS,
  and direct-write denial.
- `00437_lifecycle_compatibility_contract_test.sql` checks the guarded
  publish/respond/withdraw/supersede API, legacy RPC compatibility, Stage-2
  expiry exclusion, and the distinction between an overdue condition and a
  lifecycle state.
- `00438_notification_traceability_contract_test.sql` checks frozen-lead
  notification routing, immutable artifact citations, the service-only Edge
  delivery stamp, the studio-only artifact-candidate projection, usable
  authority revision projection, and evidenced draft withdrawal.

Both files use `to_regclass`, `to_regprocedure`, and catalog lookups before any
future relation or function is referenced. On a schema missing the named
Stage-2 migration they stop with SQLSTATE `55000` and list the absent objects.
Run them only after `00435` and their named migration exist:

```sh
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
  -v ON_ERROR_STOP=1 \
  -f supabase/tests/workflow/approval_authority/00436_authority_evidence_contract_test.sql
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
  -v ON_ERROR_STOP=1 \
  -f supabase/tests/workflow/approval_authority/00437_lifecycle_compatibility_contract_test.sql
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
  -v ON_ERROR_STOP=1 \
  -f supabase/tests/workflow/approval_authority/00438_notification_traceability_contract_test.sql
```

## Preserved contract

00436 extends, rather than replaces, the decision aggregate. The expected
relations are `project_decision_authorities`,
`project_decision_authority_snapshots`, `project_approval_artifacts`,
`project_decision_review_confirmations`, and
`project_approval_action_receipts`. Raw approver identities and confirmations
are studio-private. The addressed household reads the frozen artifact and a
sanitized `get_project_decision_reviews` result, never the private tables.

`client_decisions.approval_contract = 'project_artifact_v1'` classifies new
requests. Legacy and proposal-signature decisions keep it NULL.
`client_decision_options.approval_outcome` is NULL for legacy rows and is
exactly `approved`, `changes_requested`, or `needs_discussion` for Stage 2.
Every Stage-2 option carries non-NULL `cost_cents_delta`,
`schedule_days_delta`, and `lead_time_days_delta`, including zero. The artifact
snapshot records its immutable source ID, version, hash, question/context, due
date, and impact payload. Confirmation
evidence records the configured authority revision, approver, artifact hash,
method, and server time and is insert-only.

The designated household decision lead is explicit authority, not inferred
from `projects.client_id`, directory rows, project ownership, or comments. The
optional co-approver field is preserved, but no successful co-approver fixture
is allowed until a real household-membership authority source exists. Comments
remain discussion only and never satisfy confirmation or response evidence.

00437 preserves wire-compatible `client_decisions.status` values. Stage-2
semantic outcomes are carried separately: draft publishes to pending; approval
responds terminally and clears the gate; changes requested and needs discussion
respond terminally but hold the gate until the studio creates an immutable
successor; and only the studio may withdraw or supersede. One private,
fail-closed predicate supplies phase blockers to phase advancement, the
completed-phase trigger, and workflow projection. Overdue is derived from an
unanswered pending request's due date, never a status and never auto-approval.
Generic expire/reopen paths must reject Stage 2, and the due-expiry worker must
exclude it.

00438 keeps communication explicitly non-authoritative. Required, overdue,
resolved, and reminder communications cite immutable artifact kind, version,
checksum, and title without reviewer identities. Scheduled Stage-2 reminders
target the snapshotted lead and may stamp delivery only through a checked
service RPC; legacy direct-contact reminders retain their installed path. A
studio may withdraw an exact current-leaf draft or pending request through the
same immutable receipt rail, with no notification for an abandoned draft.
The composer discovers only resolver-eligible plan/spec/budget sources through
a sanitized studio-only candidate projection.

## Behavioral assertion matrix

These are the fixture-backed blocks to execute once 00436 supplies a legitimate
household authority fixture. The SQL files name the same blocks so implementation
does not require contract redesign.

| Block | Required assertion |
| --- | --- |
| atomic creation | One RPC creates one decision, one frozen artifact, one authority snapshot, exactly three canonical options, and one receipt or creates nothing. |
| authority identity | Only the configured lead may respond; an unrelated client, designer ownership, and a comment never confer authority. |
| review confirm | Publish rejects missing/stale confirmation; exact retry is a receipt; conflicting reuse fails. |
| three outcomes | Approved selects only the approving option; changes requested and needs discussion never approve or clear the phase gate. |
| revision | Studio supersession creates a new immutable artifact-backed successor; the responded predecessor is never reopened or rewritten. |
| withdraw/supersede | Studio-only actions are evidenced and idempotent; clients cannot perform them; superseding an approved request does not reverse it. |
| overdue/expiry | Past due is metadata only; no status mutation, auto-approval, or generic expiry/reopen is permitted. |
| tenant isolation | Same-studio readers see private evidence; addressed households see only sanitized evidence; foreign users see neither. |
| legacy compatibility | Existing `apply_client_decision` clients still select by option ID; proposal signatures and unclassified rows retain their existing lifecycle. |

## Portal and native contract inventory

- Replace `apps/client-portal/src/app/projects/[projectId]/actions.ts` and both
  projects API wrappers' `submitApproval` call to the projects service with the
  canonical Supabase `respond_project_approval` path.
- Retire reads and writes of `services/projects.approval_records`; do not
  backfill them without deterministic artifact and authority evidence.
- Update client portal decision cards to render the three canonical outcomes,
  frozen artifact/version, explicit deltas, review-complete summary, overdue
  condition, and revised/superseded links.
- Preserve installed native clients calling `apply_client_decision` by option
  ID; add native contract coverage that each canonical option maps to the same
  Stage-2 response result.
- Keep proposal signature decisions on their current signed-proposal RPCs and
  assert their `approval_contract` remains NULL.

Blocked product rulings are limited to the co-approver membership source and
the exact click-through/e-sign evidence payload. Neither is guessed here.
