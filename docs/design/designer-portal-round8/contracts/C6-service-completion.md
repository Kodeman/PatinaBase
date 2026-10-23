# C6 — Studio service completion versus project closure

Status: proposed contract (WP-00.5b, SQ-1813). Owner: closeout domain (WP-10B, after WP-10A and WP-10C). Decisions: P06, K3. Acceptance: A21, A22, A23, X03, X09, X10. Fixture: F08.
Source inspected at `0fabcadf2`. Names without a file:line are **proposed**.

## 1. Existing contract that must not change

| Fact | Evidence |
|---|---|
| `close_project(p_project_id, p_closure, p_snapshot)` is designer-only | `supabase/migrations/00399_journey_authority_integrity.sql:7317-7356` (latest definition; later files do not redefine it) |
| It locks the project first | `00399:7339-7346` |
| It requires a completed checklist: walkthrough, punch_list, payment, photography, photos, case_study | `00399:7358-7375` |
| No unresolved scope change | `00399:7380-7401` |
| No unresolved `client_decisions` | `00399:7403-7424` |
| Every `project_phases` row `completed` | `00399:7426-7444` |
| Every FF&E row `installed` | `00399:7473-7481` |
| Every positively priced FF&E row paid in full on studio invoices | `00399:7484-7518` |
| Positive payment milestones paid | `00399:7521-7531` |
| No invoice balance | `00399:7534-7561` |
| Contract total collected | `00399:7562-7591` |
| It then sets `status='completed'`, `closure_checklist` and `portfolio_snapshot` under `app.project_completion_id` | `00399:7595-7600` |
| Closure evidence may change only under that capability | `guard_project_terminal_identity_integrity`, `00399:35`, `:62-71` |
| A status change to `completed`/`archived` freezes the approved client edition and queues the controlled closing draft | Trigger `supabase/migrations/00853_client_edition_closing_draft.sql:759-763`; body `00853:80-105` |
| A frozen snapshot is kept | `supabase/migrations/00848_client_edition_installed_closeout.sql:281-300` |
| Designer-side mirror: `deriveCloseoutReadiness` | `apps/designer-portal/src/lib/document/closure-derivation.ts:146` |
| In that mirror, open install punch items "block nothing" | `closure-derivation.ts:120` |
| Trade acceptance is its own CLIENT act on a trade scope (`trade_scope_terms.progress_state` … `substantially_complete`, `accepted`) | `supabase/migrations/00423_trade_scope_instrument.sql:144-156`, `:2349-2441` |

**Consequence.** `close_project` is an all-installed, all-paid, all-phases gate for the whole house. It cannot represent "the studio's included service is accepted" for:
- design-only or client-buy work;
- full service where GC work continues.

C5 §2 shows that external priced rows would make it unreachable.

## 2. Contract

### 2.1 Four distinct facts

| Fact | Record | Writer |
|---|---|---|
| Studio service accepted | C4 `service_acceptance_requests.aggregate_outcome` | Clients (and reviewed paper intake) through C4 RPCs |
| Studio service completed | **New** `studio_service_completions` | Studio, through `complete_studio_service` (§2.3) |
| GC / trade acceptance | Existing `trade_scope_terms` (00423) and C5 external fulfilment events | Existing paths |
| Project closed | Existing `projects.status`, `closure_checklist`, `portfolio_snapshot` | `close_project` **only** |

None of the first three may write `projects.status`, `closure_checklist` or `portfolio_snapshot`, and none may fire the freeze trigger. That trigger fires only on `UPDATE OF status` (`00853:759-763`), and C6 never updates `projects`.

### 2.2 Record (proposed)

**`studio_service_completions`.** Each row stores:
- `id`, `project_id`;
- `scope_edition_id`, which must be the active edition at completion;
- `acceptance_request_id`, which must have outcome `accepted` or `accepted_with_conditions`;
- `state`: `completed` or `completed_with_conditions`;
- `obligation_snapshot`, a jsonb of the derived blockers and informational items at completion time, plus its hash;
- `conditions` (jsonb), copied from the conditional responses, each with `resolution_state` `open` or `resolved`;
- `financial_hold` (jsonb, informational, §2.5);
- `completed_by`, `completed_at`;
- `revoked_at`, `revoked_by`, `revoke_reason`, for an authorized correction only.

Constraints:
- A partial unique index allows one non-revoked completion per project and edition.
- A row is immutable except for condition resolution and revocation, under a capability setting.

### 2.3 Obligation derivation (server, P06 / K3 recommendation)

`derive_studio_service_obligations(p_project_id)` is STABLE and SECURITY DEFINER, with the studio read predicate. It returns:
```
{ "scopeEditionId", "blockers": [{code, count, packageKey?, label}],
  "informational": [{code, count, packageKey?, label}],
  "financialHold": {openInvoiceCount, balanceCents, uncollectedContractCents},
  "acceptance": {requestId, outcome, pendingRequiredSigners} }
```

**Blockers.** Included studio obligations only, per the active edition's packages:
- Project phases frozen into the edition (`edition.content.phaseIds`, C2 §2.4) that are not `completed`. Phases added later by an addendum belong to the later edition.
- In packages with `inclusion='included'` and `purchasing='studio'`: FF&E lines that are not `installed`. These are lines with no `external_fulfilment_id` and no `trade_scope_document_id`, excluding removed, `not_selected` and `superseded` lines (the live-line rule of `supabase/migrations/00835_external_signed_agreements.sql:1408-1413`).
- Open conditions from a conditional acceptance (K3), until each is resolved.
- Unresolved studio-owned `client_decisions` and scope-change requests. These use the same terminal-state definitions as `close_project` (`00399:7380-7424`).
- Acceptance not `accepted` or `accepted_with_conditions`. Acceptance is mandatory (R8-04).

**Informational (never blockers):**
- Excluded or `conditional`-excluded packages.
- External fulfilment status (C5).
- Trade-scope progress.
- Open install punch items (consistent with `closure-derivation.ts:120`, C-34).

**Financial hold:**
- Computed with the same invoice-truth arithmetic as `close_project` (`00399:7534-7591`).
- It is displayed separately and does **not** block service completion (K3 recommendation).
- It continues to block `close_project`, unchanged.

### 2.4 RPCs

**`complete_studio_service(p_project_id, p_acceptance_request_id, p_obligation_hash, p_client_request_id) → jsonb`**

- Response:
  ```
  {completionId, state, conditionsOpen:n, replayed}
  ```
- The caller is the designer or a studio owner/admin, using the same identity rule as closing. The `close_project` designer-only rule (`00399:7353-7356`) is kept for closure itself.
- It re-derives the obligations under lock and refuses when:
  - any blocker remains;
  - `p_obligation_hash` differs from the server's current snapshot (`serialization_failure`, `stale_obligations`);
  - the request's edition is no longer active.
- **Replay:** a replay with the same `client_request_id` returns the first effect.

**`resolve_studio_service_condition(p_completion_id, p_condition_id, p_resolution, p_evidence, p_client_request_id)`**
- Records how a condition was resolved.
- `completed_with_conditions` becomes `completed` when the last condition resolves.

**`revoke_studio_service_completion(p_completion_id, p_reason)`**
- Owner or admin only.
- Preserves history.

**`get_studio_service_completion(p_project_id)`**
- Read only.
- The client projection exposes the state, the dates and the accepted scope reference. It never exposes the financial hold detail beyond what the client's own invoices already show.

### 2.5 Lock order

1. `projects` (FOR SHARE). FOR UPDATE is not taken, because completion does not mutate `projects`. FOR SHARE is still enough to serialize with `close_project`'s FOR UPDATE.
2. The active `project_scope_editions` row (FOR SHARE).
3. `service_acceptance_requests` (FOR SHARE).
4. `studio_service_completions` (FOR UPDATE, or insert).

The derivation reads `project_phases`, `client_decisions`, `scope_change_requests` and `project_ffe_items` **without** row locks. The obligation hash check plus the FOR SHARE parent lock handle concurrency without adding a second lock ladder that could invert `close_project`'s order (`00399:7378-7470`).

### 2.6 Relationship to `close_project` and the client edition

- **`close_project` is unchanged.** Its body, its gates, its designer-only rule and the freeze and closing-draft triggers all stay as they are (`00853:759-763`, `:80-105`).
- **Service completion is not a prerequisite of `close_project` in this contract.** Making it one changes an existing gate, and that is a separate, explicit migration decision.
- **Project closure is not a prerequisite of service completion.** A full-service job can show "Studio service complete" while GC work and the project stay open (A21, F08).
- **Design-only or client-buy jobs** whose external lines were converted under C5 become closable through `close_project` once those lines are verified `installed`. Unconverted legacy priced lines keep today's behaviour. Any scoped-closure change for such jobs is a future, separately reviewed migration.
- **A later care question** (A23) neither reopens nor revokes a completion. Post-close client-edition work continues through the existing controlled closing draft.

### 2.7 RLS, grants, activation

- **RLS:** enabled on the table. `REVOKE ALL FROM PUBLIC, anon, authenticated`.
- **Reads:** through the definer read RPC only. The studio predicate is `is_studio_comember` plus the tenant leg. Clients see their own project's projection.
- **Grants:** mutations ship with `EXECUTE` revoked from `authenticated`.
- **Activation:**
  - **Requires** the K3 ruling.
  - **Requires** activation of C4.
  - **Requires** WP-10C sign-off.
  - Is a reviewed grant migration.
- **Deactivation:** revoke the mutation grants. Reads and existing completions stay visible.

### 2.8 Audit

- Each completion stores its actor, time, obligation snapshot and hash, and acceptance request.
- Each condition resolution stores its actor, evidence and time.
- A revocation stores its reason.
- The derivation is deterministic for the same rows, so a reviewer can recompute it.

### 2.9 Old-reader compatibility

| Consumer | Behaviour |
|---|---|
| Designer portal | `deriveCloseoutReadiness` and the Care checklist are unchanged. The round-8 closeout chapter adds a separate "Studio service" reading. It never relabels the project-closure blockers |
| Client portal | The existing closing edition flow is unchanged. Service completion is an additive section read from the new RPC |
| Patina iOS | Old builds never see it. New builds read the same projection |
| Field | No change |
| `projects.status` consumers (lists, archive, freeze) | Unaffected, because C6 never writes `projects` |

### 2.10 Backfill rule

- None.
- A `completed` or `archived` project is **not** treated as having an accepted or completed studio service.
- A `closure_checklist` walkthrough, `payment` or `case_study` item is not acceptance (A22).
- A historic project shows "Studio service acceptance not recorded".

### 2.11 Required tests

- **Service completion has no project-level side effects.**
  - `projects.status`, `closure_checklist` and `portfolio_snapshot` are byte-identical before and after `complete_studio_service`.
  - No new `client_edition_requests` row appears.
  - `client_editions.frozen_at` is unchanged.
- **Blocker and informational behaviour:**
  - An included phase still open blocks completion.
  - An excluded or external package that is still open does not block it.
  - An open punch item does not block it.
  - An invoice balance appears as a financial hold, does not block completion, and `close_project` still refuses on that balance.
- **Conditional acceptance:**
  - `completed_with_conditions` is reached with an open condition.
  - It becomes `completed` when the condition is resolved.
- **Concurrency:**
  - A stale obligation hash is refused.
  - Racing `complete_studio_service` and `close_project` gives one coherent ordering.
- **Fixtures:** full-service and design-only/client-buy fixtures through F08. A direct call while inactive is denied.
- **Existing suite:** `supabase/tests/document/close_project_readiness_test.sql` passes unchanged.

## 3. Ruling needed

K3 decides:
- which included obligations block;
- the treatment of conditional acceptance;
- whether an open included defect blocks;
- that balances are a financial hold.

Recommended answers: `P04-P07-proposals.md` §P06.
