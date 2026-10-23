# C6 — Studio service completion versus project closure

Status: proposed contract (WP-00.5b, SQ-1813). Owner: closeout domain (WP-10B, after WP-10A and WP-10C). Decisions: P06, K3. Acceptance: A21, A22, A23, X03, X09, X10. Fixture: F08.
Source inspected at `0fabcadf2`. Names without a file:line are **proposed**.

**Revision 2026-10-23 (SQ-1850).** Answers the SQ-1817 frontier review at `4952624a16d1` for findings F3 (§2.2, §2.3, §2.4, §2.11, §3: one coherent transition per K3 option; K3 stays **OPEN**), F7 (§2.5: a shared exclusion protocol across contributing writers, replacing the FOR SHARE snapshot), the F10 blocker bindings (§2.3), and the F8 suspension and F20 revoke rules (§2.7). The review's adjudication stands: C6 writes no `projects` column and fires no freeze.

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
- `acceptance_request_id`, which must have outcome `accepted` or `accepted_with_conditions` (C4 lifecycle `closed`);
- `state`: `completed`, or `completed_with_conditions` under K3 option A only (§2.4);
- `obligation_snapshot`, a jsonb of the derived blockers and informational items at completion time, plus its hash;
- `open_condition_ids` (uuid[]), the acceptance conditions still unresolved at completion. Always empty under K3 option B;
- `financial_hold` (jsonb, informational, §2.3);
- `completed_by`, `completed_at`;
- `revoked_at`, `revoked_by`, `revoke_reason`, for an authorized correction only.

**`service_acceptance_condition_resolutions`** (new, append-only, F3). This is the one place a condition is resolved, under either K3 option:
- `id`, `request_id`, `condition_id` (the `conditionId` C4 assigned, C4 §2.1), `response_id`;
- `resolution` (text), `evidence` (jsonb: an issue id, a storage object or a site request);
- `resolved_by`, `resolved_at`, `client_request_id`;
- `UNIQUE (request_id, condition_id)` and `UNIQUE (request_id, client_request_id)`.

A request's **open conditions** are the `conditionId`s on its counted responses (active signers, `accept_with_conditions`) that have no resolution row.

Constraints:
- A partial unique index allows one non-revoked completion per project and edition.
- A completion row is immutable except for two transitions, under a capability setting: `completed_with_conditions → completed` (option A, §2.4) and revocation. The ship-time CHECK allows only `state = 'completed'`. The K3 activation migration widens it only if Kody rules option A.

### 2.3 Obligation derivation (server, P06 / K3 recommendation)

`derive_studio_service_obligations(p_project_id)` is STABLE and SECURITY DEFINER, with the studio read predicate. It returns:
```
{ "scopeEditionId", "blockers": [{code, count, packageKey?, label}],
  "informational": [{code, count, packageKey?, label}],
  "financialHold": {openInvoiceCount, balanceCents, uncollectedContractCents},
  "acceptance": {requestId, outcome, pendingRequiredSigners} }
```

**Blockers.** Included studio obligations only, per the active edition. Every join is the canonical one in C2 §2.4a (F10); nothing is inferred:
- Agreed phases (`project_scope_edition_phases` of the active edition) whose bound `project_phases` row is not `completed`. An agreed phase with no bound project phase, or a binding to a deleted row, is the blocker `agreed_phase_unbound` (fails closed).
- Live studio FF&E lines that are not `installed`, in packages with `inclusion='included'` and `purchasing='studio'`. Membership is `project_ffe_items.scope_package_key`. "Live studio line" means no `external_fulfilment_id` and no `trade_scope_document_id`, excluding removed, `not_selected` and `superseded` lines (the live-line rule of `supabase/migrations/00835_external_signed_agreements.sql:1408-1413`).
- A live studio FF&E line with a NULL `scope_package_key`: blocker `ffe_unassigned_to_package`. Membership is never inferred from room, label or category.
- Open acceptance conditions: a blocker under K3 option B only (`acceptance_condition_open`). Under option A they are reported as `conditions` and do not block (§2.4, F3).
- Unresolved studio-owned `client_decisions` and scope-change requests. These use the same terminal-state definitions as `close_project` (`00399:7380-7424`).
- Acceptance not `accepted` or `accepted_with_conditions`. Acceptance is mandatory (R8-04).
- No `active` edition (a `stale` edition counts as none, C2 §2.8), or `scope_editions` inactive.

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
- It re-derives the obligations under the §2.5 protocol and refuses when:
  - any blocker remains;
  - `p_obligation_hash` differs from the server's current snapshot (`serialization_failure`, `stale_obligations`). The hash proves the designer saw the current state. It is **not** the concurrency control; §2.5 is;
  - the request's edition is no longer active.
- **Replay:** a replay with the same `client_request_id` returns the first effect.

**`resolve_service_acceptance_condition(p_request_id, p_condition_id, p_resolution, p_evidence, p_client_request_id) → jsonb`** (replaces `resolve_studio_service_condition(p_completion_id, …)`, F3)
- Keyed by the acceptance request, not by a completion, so it can run before any completion exists. It inserts one resolution row. The caller is the designer or a studio owner/admin.
- It refuses an unknown `conditionId`, a condition that is already resolved, or a request whose edition is not active.
- It is a contributing write (§2.5).

**K3 transitions (SQ-1817 F3).** The earlier text listed open conditions as blockers (`§2.3`) and refused completion with any blocker, yet promised `completed_with_conditions` with resolution afterwards by `completionId`. Those cannot both hold. K3 stays **OPEN**. Each option below is one coherent lifecycle over the same records:

| | **Option B — conditions block (safe default; ships this way)** | **Option A — complete with conditions (recommended ruling, P06)** |
|---|---|---|
| Open condition in §2.3 | Blocker `acceptance_condition_open` | Not a blocker; listed under `conditions` |
| `complete_studio_service` with an open condition | Refused (blocker) | Succeeds with `state = 'completed_with_conditions'` and `open_condition_ids` = the open set |
| `complete_studio_service` with none open | `state = 'completed'` | `state = 'completed'` |
| `resolve_service_acceptance_condition` | Allowed only while no non-revoked completion exists for the edition. Each resolution removes a blocker | Allowed before and after completion. After completion, resolving the last id in `open_condition_ids` moves the completion to `completed` in the same transaction |
| States ever written | `completed` | `completed_with_conditions`, `completed` |
| Ship-time CHECK | `state = 'completed'` | Widened by the K3 activation migration |

- Under both options a condition is never silently dropped. It is either resolved by a recorded row or it keeps blocking (B) or keeps the completion `completed_with_conditions` (A).
- Revoking a completion does not delete resolutions.

**`revoke_studio_service_completion(p_completion_id, p_reason)`**
- Owner or admin only.
- Preserves history.

**`get_studio_service_completion(p_project_id)`**
- Read only.
- The client projection exposes the state, the dates and the accepted scope reference. It never exposes the financial hold detail beyond what the client's own invoices already show.

### 2.5 Concurrency: the service-obligation lock (SQ-1817 F7)

**Why the earlier rule failed.** It took `projects` FOR SHARE and trusted the obligation hash for the child rows it read without locks. FOR SHARE does not conflict with FOR KEY SHARE, and every FF&E writer takes exactly that:
- `_ffe_lock_job_labels` takes `projects` FOR KEY SHARE plus an advisory label lock (`00808_us37_item_labels.sql:94-95`);
- `place_product_in_project_v2` takes that lock (`00808:770`), and the placement core then inserts the new line (`00828_us37_configured_placement_intermediate.sql:14-210`); the insert's foreign-key check is another KEY SHARE.

So a new live studio line could be placed into an included package after the completion derivation read the old set, and both transactions commit. The hash compares the designer's view with the server's read; it is not a compare-and-swap against later child writes. (The supersede example in the first review checkpoint is withdrawn by the reviewer: `00808:430-432` rejects installed predecessors. New-line placement is the governing case.)

**The protocol.** One per-project advisory key, `hashtext('svc_obligations:' || project_id)`, in the same naming style as the 00808 label lock.
- **Contributing writers take it shared.** A `BEFORE INSERT OR UPDATE OR DELETE … FOR EACH ROW` trigger calls `_service_obligation_write_lock(project_id)` = `pg_advisory_xact_lock_shared(key)` for the old and the new `project_id`. It goes on every table whose rows can change a §2.3 blocker or the snapshot:
  - `project_phases`, `project_ffe_items`, `client_decisions`, `scope_change_requests`;
  - `project_scope_editions` and its child tables (C2);
  - the four C4 tables, and `service_acceptance_condition_resolutions`;
  - `project_external_fulfilments` and their events (C5).
  A trigger, not a list of RPCs, covers every writer, including direct table writes through RLS (`project_ffe_items_studio_rw`), the placement core and future writers. Shared holders never block each other, so ordinary editing gains no new contention.
- **Completion takes it exclusive, last.** `complete_studio_service` locks in this order:
  1. `projects` FOR SHARE. This serializes with `close_project`'s FOR UPDATE (`00399:7339-7346`) and with the C2, C4 and C5 paths that take `projects` FOR UPDATE.
  2. The active `project_scope_editions` row, FOR SHARE.
  3. `service_acceptance_requests`, FOR SHARE.
  4. `studio_service_completions`, FOR UPDATE (or the insert target).
  5. `pg_advisory_xact_lock(key)`, exclusive. It waits for every in-flight contributing writer to commit, and blocks new ones until completion commits.
  6. **Then**, in a later statement, the derivation, the hash comparison and the insert. The RPC is VOLATILE and runs under READ COMMITTED, so step 6 reads a snapshot taken after step 5 was granted. If the transaction runs at REPEATABLE READ or above, the RPC refuses (`serialization_failure`), because its snapshot would predate the lock.
- `resolve_service_acceptance_condition` uses the same order, through step 5, under option A after completion. Under option B it is a plain contributing writer.

**Result.** Completion and any contributing write are totally ordered. Either the write commits first, and completion sees it (a new blocker refuses, or the hash goes stale), or completion commits first and the write lands afterwards against a completed service. A later write never revokes a completion silently; revocation stays an explicit owner/admin act (§2.4).

**Deadlock freedom.** Completion takes no child-row locks, so a writer that holds a child row and waits for the shared key can always be granted once completion commits. Completion takes the exclusive key last, after its row locks, so a writer that already holds the shared key never waits on a completion-held row. Any path that writes a contributing row *and later* locks a C2, C4 or C6 row must either:
- hold `projects` FOR UPDATE first (the C2 amendment, C4 create/withdraw/replace and C5 create/convert already do, which excludes completion at step 1); or
- take those row locks before its first contributing write (the C4 response path does).
The implementing slice greps every writer of the listed tables and records which rule each satisfies. One wait edge is soft: while completion waits for the exclusive key, a new shared request queues behind it, and a writer holding the shared key may wait on a row that queued writer holds. PostgreSQL's deadlock detector resolves that soft edge by reordering the wait queue, without aborting. A hard `40P01` in the §2.11 race tests is a defect in the protocol, not an accepted retry. `close_project` is not edited: it reads the same tables and already holds `projects` FOR UPDATE, which excludes completion at step 1.

### 2.6 Relationship to `close_project` and the client edition

- **`close_project` is unchanged.** Its body, its gates, its designer-only rule and the freeze and closing-draft triggers all stay as they are (`00853:759-763`, `:80-105`).
- **Service completion is not a prerequisite of `close_project` in this contract.** Making it one changes an existing gate, and that is a separate, explicit migration decision.
- **Project closure is not a prerequisite of service completion.** A full-service job can show "Studio service complete" while GC work and the project stay open (A21, F08).
- **Design-only or client-buy jobs** whose external lines were converted under C5 become closable through `close_project` once those lines are verified `installed`. Unconverted legacy priced lines keep today's behaviour. Any scoped-closure change for such jobs is a future, separately reviewed migration.
- **A later care question** (A23) neither reopens nor revokes a completion. Post-close client-edition work continues through the existing controlled closing draft.

### 2.7 RLS, grants, activation

- **RLS:** enabled on the table. `REVOKE ALL FROM PUBLIC, anon, authenticated`.
- **Reads:** through the definer read RPC only. The studio predicate is `is_studio_comember` plus the tenant leg. Clients see their own project's projection.
- **Grants:** mutations and internal helpers (including `_service_obligation_write_lock`) ship with `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated`. Revoking `authenticated` alone is not enough, because the stack default grants `anon` and `authenticated` EXECUTE (`00654:209-214`; F20). Each mutation also refuses while `scope_editions` is inactive (C2 §2.8, F8).
- **The lock triggers are not gated.** They ship active with the tables, because they change no data and only order writers against completion.
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
- **Conditional acceptance (F3), per K3 option:**
  - Option B (ship default): with an open condition, completion is refused with `acceptance_condition_open`. After `resolve_service_acceptance_condition`, it succeeds with `state = 'completed'`. No row ever holds `completed_with_conditions`; the CHECK refuses a direct attempt.
  - Option A (after the K3 activation migration): with an open condition, completion succeeds as `completed_with_conditions` with that id in `open_condition_ids`. Resolving it moves the row to `completed` in the same transaction. Resolving an unknown or already-resolved id is refused.
  - Both: a resolution keyed by request works before any completion exists.
- **Bindings (F10):** an addendum phase with no bound project phase blocks (`agreed_phase_unbound`). A live studio line with a NULL `scope_package_key` blocks (`ffe_unassigned_to_package`). A line assigned to an excluded package does not block.
- **Concurrency (F7).** Each race runs in two sessions, in both orders. The pass condition is one serial outcome: either the write commits first and completion refuses (a blocker or `stale_obligations`), or completion commits first and the write commits after it. No pair may raise `40P01`.
  - `place_product_in_project_v2` placing a new live line into an included studio package (the governing case);
  - a direct-table `project_ffe_items` status regression from `installed`;
  - a phase reopened from `completed`;
  - a `client_decisions` insert and a `scope_change_requests` insert;
  - C5 `set_ffe_item_external_fulfilment` reversal;
  - a C4 response, and `resolve_service_acceptance_condition`;
  - `close_project`.
  - Also: a stale obligation hash is refused, and the RPC refuses under REPEATABLE READ.
- **Fixtures:** full-service and design-only/client-buy fixtures through F08. A direct call while inactive is denied; `has_function_privilege` is false for `PUBLIC`, `anon` and `authenticated` (F20). With `scope_editions` inactive, completion refuses even with its grant restored (F8).
- **Existing suite:** `supabase/tests/document/close_project_readiness_test.sql` passes unchanged.

## 3. Ruling needed

K3 is **OPEN**. It decides:
- which included obligations block;
- the treatment of conditional acceptance: option A or option B (§2.4). Option B is the safe default the schema ships with;
- whether a condition's resolution needs the client's confirmation, or is a studio-recorded fact with evidence (as specified here, under either option);
- whether an open included defect blocks;
- that balances are a financial hold.

Recommended answers: `P04-P07-proposals.md` §P06. Nothing in this contract resolves K3. Activation still requires the recorded ruling (§2.7).
