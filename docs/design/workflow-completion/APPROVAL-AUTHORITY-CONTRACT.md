# Project Approval Authority Contract

**Status:** Stage 2 implementation handoff  
**Depends on:** `00434` privacy and immutable-review remediation  
**Schema waves:** `00435` authority/evidence, `00436` compatibility/routing

## Decision

Project approvals extend `client_decisions`. Patina must not create or dual-write
another approval aggregate. Existing `services/projects.approval_records` rows may
remain historical, but new project approval acts route through Supabase.

The installed-client lifecycle remains:

```text
draft -> pending -> responded
                  -> expired only by studio withdrawal or supersession
```

`approved`, `changes_requested`, and `needs_discussion` are public outcomes on a
responded decision. `overdue` is derived from a pending decision's due date; it is
never a status transition, approval, or phase advance.

## Authority model

Each participating project may opt into one explicit authority record:

- one designated decision lead;
- zero or one contract-required co-approver;
- a positive authority revision for optimistic concurrency;
- the studio actor who last changed the assignment.

No existing project is backfilled. In particular, `projects.client_id`, ownership,
household membership, directory roles, comments, and project-team membership do not
implicitly grant approval authority.

The authority assignment is copied into each approval request when it is created.
Later changes to project authority do not rewrite historical approval evidence.

## Evidence model

A Stage 2 approval request is classified with
`approval_contract = 'project_artifact_v1'` and must have:

- one project and no linked proposal;
- approval decision type/kind and the current client court/routing shape;
- the snapshotted lead, optional co-approver, and authority revision;
- one immutable artifact-version record;
- exactly three canonical outcome options;
- explicit cost, schedule, and lead-time deltas, including zero;
- review confirmation from the lead and from the co-approver when configured.

Supported artifact sources are initially:

- issued Plan Room sets;
- ready Spec Book artifacts;
- published budget versions;
- project documents only after a server-owned immutable byte/hash policy exists.

Artifact identity, project ownership, version, readiness, and checksum are validated
server-side. A caller-supplied URL or mutable row version is not sufficient evidence.

## Required checked commands

`00435` owns additive schema and transaction-safe commands:

- `set_project_decision_authority`
- `create_project_approval_decision`
- `confirm_project_decision_review`
- `withdraw_project_approval_decision`
- `supersede_project_approval_decision`

Creation atomically writes the decision, immutable artifact snapshot, and the three
outcome options. Evidence and confirmations are insert-only through checked RPCs;
direct update/delete is rejected for authenticated and service roles.

`00436` owns compatibility routing:

- `respond_project_approval`
- `get_project_decision_reviews`
- guarded Stage 2 branches in the existing publish/apply/expire/reopen functions

The private apply core remains the single owner of response effects. The approved
option is the only option with `approves = true`, so existing gate settlement remains
compatible. Changes requested and needs discussion keep blockers in place.

## State rules

```text
draft
  |-- lead review confirmed
  |-- required co-approver review confirmed, when configured
  `-- publish -> pending

pending
  |-- approved -> responded; approved effects may settle
  |-- changes requested -> responded; blockers remain
  |-- needs discussion -> responded; blockers remain
  |-- withdraw -> expired
  `-- supersede -> expired + successor draft

responded
  `-- supersede -> historical response retained + successor draft
```

- An exact response replay is idempotent; a conflicting replay fails.
- A revised artifact is a successor decision, never a reopened request.
- Generic expire/reopen commands reject Stage 2 decisions.
- The due-decision expiry job excludes Stage 2 decisions.
- Superseding an approved decision never silently reverses previous effects.

## Visibility and communication

- Studio co-members may read authority assignments and confirmations.
- The addressed client may read the immutable artifact snapshot, requested decision,
  public outcome, deltas, and whether review is complete.
- Internal reviewer identities are not exposed to clients.
- Household comments remain conversation; they are never confirmations or outcomes.
- Notifications and reminders cite the decision and artifact version but cannot apply
  an outcome.

## Compatibility cutover

- Keep `ClientDecision.status` and existing option projections wire-compatible.
- Give installed clients the same three canonical options through
  `apply_client_decision`.
- Move the web milestone approval action from the projects-service endpoint to
  `respond_project_approval`.
- Preserve all three public outcomes in portal data mapping.
- Do not migrate historical Prisma approvals without deterministic artifact and
  authority evidence.
- Proposal signatures remain legacy decisions with no approval contract and must
  pass regression tests unchanged.

## Acceptance gates

The implementation is incomplete until focused tests prove:

1. Legacy decisions and signatures remain unchanged.
2. Invalid authority, cross-project artifacts, mutable/unready artifacts, and stale
   revisions are rejected.
3. Creation is atomic and produces one immutable artifact with three canonical
   outcomes.
4. Only the assigned reviewers can confirm; retries are idempotent.
5. Publish requires every configured confirmation.
6. Each outcome works through the web RPC and installed-client apply path.
7. Only approval settles gates or clears blockers.
8. Studio overrides cannot manufacture a client outcome.
9. Withdrawal and supersession preserve evidence and serialize safely.
10. Overdue changes presentation only; expiry jobs leave Stage 2 rows pending.
11. Read contracts expose no cross-tenant or internal reviewer data.
12. Portal caches for decisions, coordination, workflow, tasks, FF&E, and the
    Document are invalidated after a successful response.

## Product rulings still required

- Whether the configured lead/co-approver are internal studio reviewers or household
  approvers. Current authentication safely supports one addressed client; do not infer
  a multi-member household contract.
- Whether every outcome requires click-through or e-signature evidence.
- Whether changes requested must include a comment at the database layer. Web can
  require it now; installed clients cannot yet provide it.
- The immutable-retention policy for generic project documents.
- Whether cost, schedule, and lead-time deltas are additive or independent. Store the
  signed values separately until product defines a calculation rule.
