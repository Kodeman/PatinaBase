# C6 — Studio service completion versus project closure

Status: proposed contract (WP-00.5b, SQ-1813). Owner: closeout domain (WP-10B, after WP-10A and WP-10C). Decisions: P06, K3. Acceptance: A21, A22, A23, X03, X09, X10. Fixture: F08.
Source inspected at `0fabcadf2`. Names without a file:line are **proposed**.

**Revision 2026-10-23 (SQ-1850).** Answers the SQ-1817 frontier review at `4952624a16d1` for findings F3 (§2.2, §2.3, §2.4, §2.11, §3: one coherent transition per K3 option; K3 stays **OPEN**), F7 (§2.5: a shared exclusion protocol across contributing writers, replacing the FOR SHARE snapshot), the F10 blocker bindings (§2.3), and the F8 suspension and F20 revoke rules (§2.7). The review's adjudication stands: C6 writes no `projects` column and fires no freeze.

**Revision 2026-10-23 (SQ-1856).** Answers the SQ-1851 re-review at `6ac0c5acc`:
- **R8** (§2.3): studio installation and studio design bind whoever buys. An included package with `installation = 'studio'` blocks until every member line, external lines included, is `installed` and every live fulfilment on it has a verified `installed` event. A `design = 'studio'` package is discharged only by the edition's agreed phases.
- **R10** (§2.3): a line or fulfilment whose package key is not in the active edition blocks (`package_key_not_in_edition`), next to the NULL-key blocker. C2 §2.2a also stops an amendment from dropping a key.
- **R20** (§2.2, §2.3, §2.5): the financial hold is informational and read as of the derivation. It is outside the obligation hash and outside the §2.5 exclusion promise.

**Revision 2026-10-23 (SQ-1861).** Answers the SQ-1857 re-review at `55569724f9b3`:
- **T3** (§2.3, §2.11): each included package with a studio design or installation responsibility needs a binding of its own (a phase bound through C2 `servicePhaseIds`, or for installation a member line or fulfilment); otherwise `studio_design_unbound` / `studio_installation_unbound`. `studio_design_unphased` is withdrawn. K3 stays **OPEN**.

**Revision 2026-10-27 (SQ-2230, 00888).** K3 is **RULED Option A** (Kody, 2026-10-27; DECISIONS.md K3). Migration `00888_round8_service_completion.sql` implements this contract inactive:
- The state CHECK ships wide: `completed` and `completed_with_conditions` (§2.2). Option B is not built.
- §2.5 step 1 takes `projects` FOR KEY SHARE, not FOR SHARE. Both modes exclude the FOR UPDATE that `close_project` and the C2, C4 and C5 paths take. The writer census found two paths that UPDATE `projects` after a contributing write (`settle_section_on_gate_approval` and `_activate_proposal_as_project_impl`). Against FOR SHARE each would be a hard 40P01. The census is in the 00888 header. It leaves no residual path (corrected by SQ-2257 below).
- The activation grant plan is in §2.7.

**Revision 2026-10-28 (SQ-2257, 00888).** Repairs the SQ-2255 and SQ-2256 review findings on the SQ-2230 candidate:
- **Post-key replay** (§2.4): `complete_studio_service` reads its key's receipt again after step 5. A same-key call that waited on the key gets the replayed receipt, or `idempotency_key_reused` when the actor or body differs. Only then does a different key get `service_already_completed`. The cheap lookup before step 1 stays. The resolution key is read only after step 5. Revocation is not keyed: it replays after its completion row lock.
- **Evidence binding** (§2.2, §2.4): every evidence reference must exist and belong to the request's project, or the resolution refuses with `service_acceptance_evidence_unbound`.
- **Request lock** (§2.5): resolution and revocation take step 3 FOR NO KEY UPDATE, not FOR SHARE. This removes the SQ-2256 cycle: a first completion, and two resolutions of its request.
- **Census** (00888 header): the SQ-2230 residual path through `_sign_proposal_authorized_00400` does not exist. It combined two branches that exclude each other. An accepted retry skips the `client_decisions` insert. With the proposal's project set, the later lock is FOR SHARE, which does not conflict with step 1. FOR UPDATE runs only when the project is NULL, and then the insert took no project's key.

**Revision 2026-10-23 (SQ-1871).** Answers the SQ-1862 re-review at `b63705210`:
- **U1** (§2.3, §2.11): phase bindings are typed per slot (C2 §2.4a). A phase discharges a package's design or installation only when it is bound to that slot and was signed in the slot's current owed run (`owed_since`). A completed design phase can no longer discharge an installation obligation that an amendment adds later. K3 stays **OPEN**.

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
- `financial_hold` (jsonb, informational, §2.3). It is an as-of-read display copy. It is **not** part of `obligation_snapshot` or its hash (SQ-1851 R20);
- `completed_by`, `completed_at`;
- `revoked_at`, `revoked_by`, `revoke_reason`, for an authorized correction only.

**`service_acceptance_condition_resolutions`** (new, append-only, F3). This is the one place a condition is resolved, under either K3 option:
- `id`, `request_id`, `condition_id` (the `conditionId` C4 assigned, C4 §2.1), `response_id`;
- `resolution` (text), `evidence` (jsonb: an issue id, a storage object or a site request). Each reference must be a native row of the request's project (SQ-2257):
  - `issueId`: a `plan_issues` row of that project;
  - `siteRequestId`: a `site_requests` row of that project;
  - `storageObjectId`: a `storage.objects` row whose path names that project. In `project-documents`, `project-ffe-working` and `service-acceptance-paper` the first folder is the project id. In `field-media` the path starts `project/<projectId>/`. In `site-requests` the first folder is a site request of that project. Any other bucket has no project path, so its objects refuse;
- `resolved_by`, `resolved_at`, `client_request_id`;
- `UNIQUE (request_id, condition_id)` and `UNIQUE (request_id, client_request_id)`.

A request's **open conditions** are the `conditionId`s on its counted responses (active signers, `accept_with_conditions`) that have no resolution row.

Constraints:
- A partial unique index allows one non-revoked completion per project and edition.
- A completion row is immutable except for two transitions, under a capability setting: `completed_with_conditions → completed` (option A, §2.4) and revocation. K3 is ruled Option A, so the CHECK ships wide: `state IN ('completed', 'completed_with_conditions')` (00888). A `completed_with_conditions` row must carry at least one open condition id.

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
- **Studio installation, whoever buys (SQ-1851 R8).** In a package with `inclusion='included'` and `installation='studio'`, whatever its `purchasing` and `payer`:
  - every live member line that is not `installed` blocks (`studio_installation_open`). This includes external lines, whose membership is their fulfilment's package (C5 §3.2). Lines with a `trade_scope_document_id` are excluded, because trade acceptance is its own act (§2.1);
  - every `project_external_fulfilments` row on that package that is not `cancelled` and has no **verified** `installed` event blocks (`studio_installation_open`). A reported-only install does not discharge it.
- **Package-specific service bindings (Revision 2026-10-23, SQ-1857 T3).** The previous text blocked only *existing* live lines and fulfilments, and accepted *any* agreed phase anywhere in the edition as discharging studio design. So an amendment that added a client-bought package with studio design and studio installation, but no phase and no line or fulfilment, passed: the predecessor's completed design phase satisfied the design test, and the empty install sets produced no blocker. Client acceptance cannot stand in, because it can be collected before anything is designed or installed. Every included studio service obligation must now be bound to something specific to its package, or it blocks. For each package K of the active edition with `inclusion='included'`:
  - **Typed, current-run phase bindings (Revision 2026-10-23, SQ-1862 U1).** The T3 rule accepted any agreed phase with `package_key = K` both as design coverage and as installation coverage. Take package K whose signed design phase had completed. An amendment then made K's installation `studio` and added no install phase, line or fulfilment. The old design phase passed the installation test, and the newly owed installation could be marked complete with no installation evidence. Phase bindings are now typed and dated (C2 §2.4a). An agreed phase row of the active edition E *discharges slot S of K* only when `package_key = K`, `service_slot = S` and `bound_in_edition >= ` E's `S_owed_since` for K. Edition rows only: nothing reads the package part's payload.
  - **Studio design** (`design='studio'`): K must have at least one *design binding*, an agreed phase row that discharges `design` of K. With none, the blocker is `studio_design_unbound` (with `packageKey`). Each binding phase is then subject to the agreed-phase blocker above (not `completed`, or `agreed_phase_unbound`). These phases never discharge K's design: a phase bound to another package, to no package, or to K's `installation`, or one signed before K's design slot became owed in its current run.
  - **Studio installation** (`installation='studio'`): K must have at least one *installation binding*. That is a live member line (studio or external, §2.3 above), a non-`cancelled` C5 fulfilment with `package_key = K`, or an agreed phase row that discharges `installation` of K. With none, the blocker is `studio_installation_unbound` (with `packageKey`). Each binding is then subject to its own blocker: `studio_installation_open` for lines and fulfilments, and the agreed-phase blocker for phases. A design-typed phase is never an installation binding, however complete it is, and neither is an installation phase signed before the current run (C2 §2.4a owed-since).
  - The two tests are evaluated per package and per slot. An empty operational set is a blocker, never a pass. Nothing infers a service obligation, or its discharge, from purchasing, payer, room, label, or from a binding of another slot. Lines and fulfilments carry no slot. They are installation bindings because they are the goods to be installed, and each is discharged only by its own `installed` state (a verified event for a fulfilment).
  - This preserves the K3 recommendation that included studio obligations block; it decides nothing further about K3.
- A live studio FF&E line with a NULL `scope_package_key`: blocker `ffe_unassigned_to_package`. Membership is never inferred from room, label or category.
- **Unknown key (SQ-1851 R10).** A live FF&E line (studio or external) or a non-cancelled fulfilment whose non-NULL package key is not a package of the active edition: blocker `package_key_not_in_edition`, with the key. C2 §2.2a makes this unreachable through amendments, which can only set a package to `excluded`. The blocker covers fixtures, legacy rows and any writer that bypasses C2, so a key that misses the included join never passes silently.
- Open acceptance conditions: a blocker under K3 option B only (`acceptance_condition_open`). Under option A they are reported as `conditions` and do not block (§2.4, F3).
- Unresolved studio-owned `client_decisions` and scope-change requests. These use the same terminal-state definitions as `close_project` (`00399:7380-7424`).
- Acceptance not `accepted` or `accepted_with_conditions`. Acceptance is mandatory (R8-04).
- No `active` edition (a `stale` edition counts as none, C2 §2.8), or `scope_editions` inactive.

**Informational (never blockers):**
- Excluded or `conditional`-excluded packages.
- External fulfilment purchase, receipt and contract status (C5). The installation status of a fulfilment in a studio-installed package is a blocker above, not informational.
- Trade-scope progress.
- Open install punch items (consistent with `closure-derivation.ts:120`, C-34).

**Financial hold:**
- Computed with the same invoice-truth arithmetic as `close_project` (`00399:7534-7591`).
- It is displayed separately and does **not** block service completion (K3 recommendation).
- It continues to block `close_project`, unchanged.
- **As of read (SQ-1851 R20).** `financialHold` is excluded from the obligation hash that `complete_studio_service` compares, and from the §2.5 exclusion. Invoice and payment writers take no service-obligation lock. The stored `financial_hold` is a copy read in the completion transaction; a payment that commits a moment later does not make it wrong, and does not make the completion stale.

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
- **Replay:** a replay with the same `client_request_id` returns the first effect. The key's receipt is read before step 1 and again after step 5 (§2.5): the same caller and body get the replayed receipt, another caller or body gets `idempotency_key_reused`, and only a different key gets `service_already_completed`.

**`resolve_service_acceptance_condition(p_request_id, p_condition_id, p_resolution, p_evidence, p_client_request_id) → jsonb`** (replaces `resolve_studio_service_condition(p_completion_id, …)`, F3)
- Keyed by the acceptance request, not by a completion, so it can run before any completion exists. It inserts one resolution row. The caller is the designer or a studio owner/admin.
- It refuses an unknown `conditionId`, a condition that is already resolved, or a request whose edition is not active.
- It refuses evidence that is not one object of the three keys with UUID strings (`service_acceptance_resolution_invalid`), and evidence that names a row that does not exist or belongs to another project (`service_acceptance_evidence_unbound`, `check_violation`) (§2.2).
- **Replay:** the same `client_request_id` with the same caller and body returns the first resolution (`replayed: true`); a different caller or body refuses with `idempotency_key_reused`. The key is read after step 5 (§2.5), so a racing twin replays.
- It is a contributing write (§2.5).

**K3 transitions (SQ-1817 F3).** The earlier text listed open conditions as blockers (`§2.3`) and refused completion with any blocker, yet promised `completed_with_conditions` with resolution afterwards by `completionId`. Those cannot both hold. K3 is **RULED Option A** (2026-10-27); 00888 builds Option A only. The table keeps both lifecycles for the record. Each option below is one coherent lifecycle over the same records:

| | **Option B — conditions block (not built)** | **Option A — complete with conditions (RULED, built in 00888)** |
|---|---|---|
| Open condition in §2.3 | Blocker `acceptance_condition_open` | Not a blocker; listed under `conditions` |
| `complete_studio_service` with an open condition | Refused (blocker) | Succeeds with `state = 'completed_with_conditions'` and `open_condition_ids` = the open set |
| `complete_studio_service` with none open | `state = 'completed'` | `state = 'completed'` |
| `resolve_service_acceptance_condition` | Allowed only while no non-revoked completion exists for the edition. Each resolution removes a blocker | Allowed before and after completion. After completion, resolving the last id in `open_condition_ids` moves the completion to `completed` in the same transaction |
| States ever written | `completed` | `completed_with_conditions`, `completed` |
| Ship-time CHECK | `state = 'completed'` | Ships wide in 00888 |

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
  Invoice, payment and milestone tables are **not** on this list (SQ-1851 R20). The financial hold is outside the promise below (§2.3).
  A trigger, not a list of RPCs, covers every writer, including direct table writes through RLS (`project_ffe_items_studio_rw`), the placement core and future writers. Shared holders never block each other, so ordinary editing gains no new contention.
- **Completion takes it exclusive, last.** `complete_studio_service` locks in this order:
  1. `projects` FOR KEY SHARE. This serializes with `close_project`'s FOR UPDATE (`00399:7339-7346`) and with the C2, C4 and C5 paths that take `projects` FOR UPDATE. It does not conflict with a plain `UPDATE projects`, which two writers run after a contributing write (SQ-2230 census); FOR SHARE would deadlock them.
  2. The active `project_scope_editions` row, FOR SHARE.
  3. `service_acceptance_requests`, FOR SHARE.
  4. `studio_service_completions`, FOR UPDATE (or the insert target).
  5. `pg_advisory_xact_lock(key)`, exclusive. It waits for every in-flight contributing writer to commit, and blocks new ones until completion commits.
  6. **Then**, in a later statement, the key's receipt is read again (a same-key call that committed during the wait is replayed or refused, §2.4), then the derivation, the hash comparison and the insert. The RPC is VOLATILE and runs under READ COMMITTED, so step 6 reads a snapshot taken after step 5 was granted. If the transaction runs at REPEATABLE READ or above, the RPC refuses (`serialization_failure`), because its snapshot would predate the lock.
- `resolve_service_acceptance_condition` uses the same order, through step 5, on every call (Option A), before or after completion. Its step 3 is FOR NO KEY UPDATE. `revoke_studio_service_completion` takes steps 1-4, with the same FOR NO KEY UPDATE at step 3.

| Step | Lock | Completion | Resolution | Revocation |
|---|---|---|---|---|
| 1 | `projects` | FOR KEY SHARE | FOR KEY SHARE | FOR KEY SHARE |
| 2 | the request's edition | FOR SHARE | FOR SHARE | FOR SHARE |
| 3 | the acceptance request | FOR SHARE | FOR NO KEY UPDATE | FOR NO KEY UPDATE |
| 4 | live completions of that edition | FOR UPDATE | FOR UPDATE | FOR UPDATE, then the revoked row |
| 5 | service-obligation key | exclusive | exclusive | — |

Step 3 FOR NO KEY UPDATE conflicts with a completion's FOR SHARE and with another resolution's or revocation's lock. It does not conflict with the FOR KEY SHARE that a child-row foreign-key check takes (signers, responses, intakes, resolutions, completions), so it adds no wait to a writer that holds the shared key. A completion row is inserted only while its inserter holds the request FOR SHARE. So when a resolution's step 4 runs, every completion row it can later UPDATE is committed and visible, and step 4 locks it. After step 5, no C6 caller waits on a row lock.

**Result.** Completion and any contributing write are totally ordered. This covers every blocker and the obligation hash, not the financial hold (§2.3). Either the write commits first, and completion sees it (a new blocker refuses, or the hash goes stale), or completion commits first and the write lands afterwards against a completed service. A later write never revokes a completion silently; revocation stays an explicit owner/admin act (§2.4).

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

**Activation grant plan (plan only; 00888 ships none of it).** Mirrors C4 §2.8. One reviewed migration, after the K3 ruling (recorded), C4 activation and WP-10C sign-off:
1. `GRANT EXECUTE ON FUNCTION public.complete_studio_service(uuid,uuid,text,text) TO authenticated;`
2. `GRANT EXECUTE ON FUNCTION public.resolve_service_acceptance_condition(uuid,uuid,text,jsonb,text) TO authenticated;`
3. `GRANT EXECUTE ON FUNCTION public.revoke_studio_service_completion(uuid,text) TO authenticated;`
4. Nothing else. `anon`, `service_role` and `PUBLIC` stay revoked on all three. Every `_`-prefixed helper and guard stays revoked from all four, including `_service_obligation_write_lock` and `_derive_studio_service_obligations`. The tables keep RLS with no table grant.
5. The two reads, `derive_studio_service_obligations(uuid)` and `get_studio_service_completion(uuid)`, are already granted to `authenticated` in 00888 and need no change.
6. The `scope_editions` capability gates every mutation at entry. Turning it off suspends C6 without a grant change (F8).
7. Write the grants top-level, one statement each, so `scripts/generate-legacy-grants.py` replays them, and extend `service_completion_acl_replay_check.py` to the activation file.
8. Verify with `has_function_privilege`: `authenticated` true on the three mutations, `anon` and `service_role` false. Rerun `service_completion_test.sql` with its inactive census moved to the activated expectation, and the concurrency suite.

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
  - An excluded package, or an external package whose installation is not `studio`, that is still open does not block it.
  - An open punch item does not block it.
  - An invoice balance appears as a financial hold, does not block completion, and `close_project` still refuses on that balance.
- **Conditional acceptance (F3), K3 Option A (ruled; 00888):**
  - Option B is not built; its refusal `acceptance_condition_open` does not exist.
  - With an open condition, completion succeeds as `completed_with_conditions` with that id in `open_condition_ids`. Resolving it moves the row to `completed` in the same transaction. Resolving an unknown or already-resolved id is refused.
  - Both: a resolution keyed by request works before any completion exists.
- **Bindings (F10):** an addendum phase with no bound project phase blocks (`agreed_phase_unbound`). A live studio line with a NULL `scope_package_key` blocks (`ffe_unassigned_to_package`). A line assigned to an excluded package does not block.
- **Studio installation on client-bought goods (SQ-1851 R8):** an included package with `purchasing='client'`, `payer='client'`, `installation='studio'` and one converted external line. Completion is refused (`studio_installation_open`) while the line is not `installed`, and while the fulfilment has only a reported `installed` event. After the event is verified, the blocker clears. The same package with `installation='client'` does not block.
- **Unbound service obligations (SQ-1857 T3):** predecessor design phase P (bound to `pkg.living`) is `completed`. An amendment adds `pkg.dining`, included, `purchasing='client'`, `payer='client'`, `design='studio'`, `installation='studio'`, with no `serviceBindings`, no lines and no fulfilment. Completion is refused with both `studio_design_unbound` and `studio_installation_unbound` for `pkg.dining`, even with an `accepted` acceptance. P does not discharge `pkg.dining`. Variants: a `completed` phase bound to `pkg.dining`'s `design` slot clears `studio_design_unbound` but **not** `studio_installation_unbound` (SQ-1862 U1); a phase bound to its `installation` slot clears that one; an external line converted into `pkg.dining` clears `studio_installation_unbound` and then blocks as `studio_installation_open` until its fulfilment's install is verified; a phase bound to no package discharges nothing. A package with `inclusion='excluded'` or `design`/`installation` other than `studio` adds no unbound blocker.
- **Design done, installation added later (SQ-1862 U1):**
  - **Setup.** E1 includes `pkg.kitchen` with `design='studio'` and `installation='gc'`. Its signed design phase P (`service_slot='design'`, `bound_in_edition=1`) is bound to its project phase and `completed`. Amendment A2 keeps `pkg.kitchen` and changes only `installation` to `studio`. It adds no install phase, no line and no fulfilment. Its copied part has no `serviceBindings` (C2 §2.2, U2). E2 is active with `installation_owed_since = 2`.
  - **Refused.** Completion is refused with `studio_installation_unbound` for `pkg.kitchen`, even with an `accepted` acceptance. P still clears `studio_design_unbound`, because `design_owed_since = 1` is carried. It never clears installation.
  - **A2 binds its own phase Q under `installation`.** `studio_installation_unbound` clears. Q, an addendum phase with no project phase, then blocks as `agreed_phase_unbound` until a phase writer binds it (C2 §3). That is fail-closed.
  - **A live member line is assigned to `pkg.kitchen` after A2.** `studio_installation_unbound` clears, and the line blocks as `studio_installation_open` until it is `installed`.
  - **Interrupted run.** E1 has `installation='studio'` with a `completed` install phase R (`bound_in_edition=1`). A2 sets installation to `gc`, and A3 sets it back to `studio` with no new binding. E3 has `installation_owed_since = 3`, so R (bound in 1) does not discharge it, and completion is refused with `studio_installation_unbound`.
  - **Uninterrupted run.** An amendment that changes nothing about `pkg.kitchen` keeps both `owed_since` values, so E1's bindings still discharge in E2.
- **Unknown key (SQ-1851 R10):** a fixture line and a fixture fulfilment whose key is in no package of the active edition each block (`package_key_not_in_edition`). A key set to `excluded` does not block.
- **Financial hold outside the hash (SQ-1851 R20):** a payment committed between the designer's read and `complete_studio_service` changes `financialHold` but not the obligation hash; completion succeeds and stores the hold as read in its own transaction. An invoice insert does not wait on the service-obligation key.
- **Concurrency (F7).** Each race runs in two sessions, in both orders. The pass condition is one serial outcome: either the write commits first and completion refuses (a blocker or `stale_obligations`), or completion commits first and the write commits after it. No pair may raise `40P01`.
  - `place_product_in_project_v2` placing a new live line into an included studio package (the governing case);
  - a direct-table `project_ffe_items` status regression from `installed`;
  - a phase reopened from `completed`;
  - a `client_decisions` insert and a `scope_change_requests` insert;
  - C5 `set_ffe_item_external_fulfilment` reversal, and a C5 `installed` verification in a studio-installed package (R8);
  - a C4 response, and `resolve_service_acceptance_condition`;
  - `close_project`.
  - Also: a stale obligation hash is refused, and the RPC refuses under REPEATABLE READ.
  - Keyed completions (SQ-2257): two identical calls (the second returns the replayed receipt); the same key with another actor, and with another body (`idempotency_key_reused`); two different keys (`service_already_completed`).
  - The SQ-2256 schedule (SQ-2257): a first completion, a session queued for the key, and two resolutions of the completion's request, so that before the step-3 fix one resolution locks the committed completion row while the other already waits on the key. The pass condition is no `40P01` and one terminal state: one resolution, one `completed` completion, and the second resolution refused as already resolved.
- **Evidence binding (SQ-2257):** an unknown id and another project's id refuse for each kind, as does an object in a bucket without a project path, and one foreign reference beside a bound one. A site request and objects under each project path convention are accepted.
- **Fixtures:** full-service and design-only/client-buy fixtures through F08. A direct call while inactive is denied; `has_function_privilege` is false for `PUBLIC`, `anon` and `authenticated` (F20). With `scope_editions` inactive, completion refuses even with its grant restored (F8).
- **Existing suite:** `supabase/tests/document/close_project_readiness_test.sql` passes unchanged.

## 3. Ruling needed

K3 is **RULED Option A** (Kody, 2026-10-27; `DECISIONS.md` K3). 00888 implements it. The ruling covered:
- which included obligations block;
- the treatment of conditional acceptance: Option A (§2.4), complete with conditions;
- whether a condition's resolution needs the client's confirmation, or is a studio-recorded fact with evidence (as specified here, under either option);
- whether an open included defect blocks;
- that balances are a financial hold.

Recommended answers: `P04-P07-proposals.md` §P06. Activation needs the reviewed grant migration in §2.7.
