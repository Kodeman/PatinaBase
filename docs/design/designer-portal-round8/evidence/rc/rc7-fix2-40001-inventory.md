# RC7-fix2: retryable-SQLSTATE raises live on Strata

This is a read-only analysis. Nothing here changes a migration. Moving these raises needs a forward prod migration and Kody's ruling.

- **Base:** `r8-rc7-fix2`. Strata's applied head is `00866` (plus `20260910152111`), from a read-only `list_migrations` on 2026-10-29.
- **Scope:** every `RAISE ... USING ERRCODE = 'serialization_failure'` (40001) whose function's latest definition at or before 00866 still carries it. There are no 40P01 raises. `00464:216` *catches* `serialization_failure OR deadlock_detected`; it does not raise one.
- **Count:** 46 raises in 31 functions.
  - The orchestrator's earlier count was 45. It was measured against the repo head. `_place_product_in_project_v2_00438_impl` (`00828:105`) is superseded on the branch by 00873/00881, but it is still the live body on Strata.
- **Method:** a heuristic parser (nearest enclosing `CREATE FUNCTION`, overloads grouped by name), then manual reading of each raise.

## Why it matters

Strata's PostgREST (14.x) runs every request through hasql-transaction's `inRetryingTransaction`. That function re-runs the whole transaction, with no limit and no backoff, whenever the server answers 40001 or 40P01. This was fixed upstream in PostgREST 16.0 (PostgREST/postgrest#3673, PR #4222).

A **deterministic** refusal raised as 40001 never reaches the caller:
- the request hangs until the gateway's 60 s upstream timeout and returns 504;
- the backend keeps looping after the 504, burning CPU and filling logs;
- this applies to RPCs and to table writes alike (row 46's trigger fires on a PostgREST table PATCH).

A **transient** 40001 (a concurrent commit moved a row between an unlocked read and its lock) is safe to retry. Each further attempt needs another concurrent commit, so the retry ends.

RC7-e2-2 measured this end to end on round-8 code: 37 ms in psql, and a 504 at 60 004 ms through `/rest/v1/rpc`.

## Proposed codes

- **Deterministic:** `PT409`, which PostgREST returns as HTTP 409 and does not retry. Keep the message. This follows the 00837 precedent and the round-8 fix (commit `59d35b07d` and its follow-up).
- **Transient:** keep 40001 and add a "40001 on purpose" comment naming what bounds the retry.

## Ranked inventory

Rows are ranked by likely user exposure.
- **Surfaces:**
  - DP = designer portal (`apps/designer-portal`, or a `packages/supabase` hook it uses);
  - CP = client portal;
  - iOS = `apps/mobile/Patina`;
  - Ext = Chrome extension;
  - Edge = edge function, named.
- **Class:**
  - D = deterministic (a retry of the same request raises again, so it hangs and then 504s);
  - T = transient (bounded retry).

### Tier 1: homeowner-facing, deterministic

| # | Function (entry RPC) | file:line | Message | Class | Impact if hit | Surfaces | Proposed |
|---|---|---|---|---|---|---|---|
| 1 | `_respond_project_approval_checked` (`respond_project_approval`; also reached from `_apply_client_decision_authorized`) | `00810:674` | project approval decision changed since it was loaded | D | The homeowner approves or declines an approval the designer edited after her screen loaded. Her "Approve" spins for 60 s, then fails generically. | CP (`useRespondProjectApproval`), iOS (`DecisionsAPIClient+ProjectApprovals`) | PT409 |
| 2 | `_apply_client_decision_authorized` (`apply_client_decision`, `apply_decision`, `apply_decision_override`, `apply_client_effect`) | `00810:962` | decision % was already resolved with another option | D | The homeowner, or an SMS reply, picks an option after someone else resolved the decision differently. The app hangs. The SMS webhook's edge function hangs past Twilio's timeout. | iOS, DP, Edge `sms-inbound` / `client-invite` / `field-daily` (`apply_client_effect`) | PT409 |
| 3 | `_apply_client_decision_authorized` | `00810:1021` | decision % was already resolved with another option | D | As row 2 (the resolved-decision branch). | as row 2 | PT409 |
| 4 | `approve_client_signoff` | `00564:170` | decision % was already resolved by another actor | D | A household member signs off after another member already resolved it. iOS hangs. | iOS | PT409 |

### Tier 2: designer daily work on The Document, deterministic

| # | Function (entry RPC) | file:line | Message | Class | Impact if hit | Surfaces | Proposed |
|---|---|---|---|---|---|---|---|
| 5 | `advance_project_phase` | `00464:2494` | advance_project_phase: phase status changed (expected %, found %) | D | Advancing a phase from a stale tab, or a second click after another tab advanced it. The phase control hangs. | DP (`use-project-v2`) | PT409 |
| 6 | `_resolve_coordination_item_authorized` (`resolve_coordination_item`) | `00808:2154` | coordination item % was resolved with another selection | D | Resolving a coordination item that someone else resolved differently. Hangs. | DP (`useResolveCoordinationItem`) | PT409 |
| 7 | same | `00808:2163` | coordination item % was resolved with another answer | D | as row 6 | DP | PT409 |
| 8 | same | `00808:2178` | coordination item % was resolved with another revision | D | as row 6 | DP | PT409 |
| 9 | same | `00808:2185` | coordination item % was resolved with another answer | D | as row 6 | DP | PT409 |
| 10 | same | `00808:2191` | coordination item % already moved to another court | D | as row 6, for the court move | DP | PT409 |
| 11 | `apply_phase_template` | `00474:132` | template request % conflicts with its recorded effect | D | Re-applying a template request whose recorded effect drifted. C2 §1 documents the A → discard → A case. The template button hangs. | DP | PT409 |
| 12 | `apply_phase_template` | `00474:169` | template % was already applied but its recorded effect changed | D | as row 11 | DP | PT409 |
| 13 | `update_project_phase` | `00398:718` | update_project_phase: phase changed since it was read | D | Editing a schedule phase from a stale view. Hangs. | DP (`use-schedule-compose`) | PT409 |
| 14 | `update_proposal_phase` | `00399:5871` | proposal phase % changed since it was loaded | D | Editing a proposal phase from a stale scope builder. | DP (`use-scope-builder`) | PT409 |
| 15 | `remove_proposal_phase` | `00399:5975` | proposal phase % changed since it was loaded | D | Removing a proposal phase from a stale view. | DP | PT409 |
| 16 | `publish_client_decision` | `00464:928` | publish receipt conflicts with the current request | D | Publishing a decision again with the same key but a changed payload. | DP (pkg), iOS, Edge `decision-first-notice` | PT409 |
| 17 | `extend_and_reopen_client_decision` | `00464:2010` | decision % already reflects a different extend-and-reopen effect | D | Extending or reopening a decision that was already extended differently. | DP (pkg), Edge `_shared` | PT409 |
| 18 | `extend_and_reopen_client_decision` | `00464:2019` | decision % changed since it was loaded | D | Stale decision on extend or reopen. | DP, Edge `_shared` | PT409 |
| 19 | `update_client_decision` | `00415:906` | decision % changed since it was loaded | D | Editing a decision from a stale view. | DP (pkg) | PT409 |
| 20 | `withdraw_project_approval_decision` | `00465:666` | project approval decision changed since it was loaded | D | Withdrawing an approval from a stale view. | DP (pkg) | PT409 |
| 21 | `supersede_project_approval_decision` | `00569:891` | project approval decision changed since it was loaded | D | Superseding from a stale view. | DP, Edge `decision-first-notice` | PT409 |
| 22 | `field_time_report_decide` | `00653:942` | field_time_report_decide: field_time_report_stale — expected version %, found % | D | Two people decide the same field time card. The loser hangs; `isFieldTimeReportStale` never sees its token. | DP (`use-field-time-reports`) | PT409 |
| 23 | `rerate_pending_time_entries` | `00797:715` | rerate_pending_time_entries: the rate changed since you saved it; save it again to price these hours | D | Rerating hours after someone corrected the rate. The prompt the copy promises never arrives. | DP (`use-studio-member-rates`) | PT409 |
| 24 | `set_project_operational_status` | `00399:216` | project % changed since it was loaded | D | Changing job status from a stale view. | DP | PT409 |
| 25 | `archive_project` | `00399:278` | project % changed since it was loaded | D | Archiving from a stale view. | DP | PT409 |
| 26 | `reassign_project_lead` | `00399:340` | project % lead changed since it was loaded | D | Reassigning a lead that someone already changed. | DP | PT409 |
| 27 | `create_client_decision` | `00415:709` | p_decision_id was already used for another decision | D | A retry with the same decision id and a changed payload (idempotency-key reuse). | DP, Ext | PT409 |
| 28 | `set_project_decision_authority` | `00463:1046` | authority revision conflict: expected 0 for first assignment | D | Assigning the first decision authority from a stale view. | DP (pkg) | PT409 |
| 29 | `set_project_decision_authority` | `00463:1058` | authority revision conflict: expected %, actual % | D | Stale authority revision. | DP (pkg) | PT409 |
| 30 | `revise_project_ffe_configuration` | `00810:1972` | project specification changed in another session | D | Revising a line's configuration from a stale view. | DP (pkg) | PT409 |
| 31 | `revise_project_ffe_configuration` | `00810:1991` | configuration version changed in another session | D | as row 30 | DP (pkg) | PT409 |
| 32 | `approve_product_configuration` | `00403:2566` | configuration changed in another session | D | Approving a configuration from a stale view. | DP (pkg) | PT409 |
| 33 | `create_custom_commission_revision` | `00403:2901` | configuration is not the latest version; refresh before revising | D | Revising an older configuration version. | DP (pkg) | PT409 |
| 34 | `upsert_product_configuration_schema` | `00413:287` | configuration definition changed in another session (expected %, current %) | D | Saving a stale configuration definition. | DP (pkg) | PT409 |

### Tier 3: deterministic, but rarely reachable

| # | Function (entry RPC) | file:line | Message | Class | Impact if hit | Surfaces | Proposed |
|---|---|---|---|---|---|---|---|
| 35 | `_place_product_in_project_v2_00438_impl` (`place_product_in_project_v2`, `commit_project_ffe_import`) | `00828:105` | idempotent command is still in progress | D | `INSERT ... ON CONFLICT DO NOTHING` waits for an in-flight twin, and the twin sets `response` in its own transaction. So a NULL response is seen only on same-transaction re-entry or on a committed NULL row. If it is ever seen, placement hangs. | DP, Ext | PT409 (the round-8 body, 00881, already moved) |
| 36 | `_record_project_ffe_receipt_batch_00446_impl` (`record_project_ffe_receipt_batch`) | `00862:329` | receipt command is still in progress | D | Same shape as row 35, for receiving. | DP (pkg) | PT409 |
| 37 | `spec_book_bump_spec_version` (BEFORE UPDATE trigger on `project_ffe_specs`) | `00382:24` | row_version is managed by the database | D | Only a writer that sets `row_version` to something other than OLD or OLD+1, i.e. a legacy or buggy client. A table PATCH through PostgREST would hang. | DP, iOS Capture, Edge `po-send`, pkg (any `project_ffe_specs` UPDATE) | PT409 |

### Tier 4: transient, keep 40001

| # | Function | file:line | Message | Class | Why the retry is bounded | Surfaces | Proposed |
|---|---|---|---|---|---|---|---|
| 38 | `update_project_phase` | `00398:803` | update_project_phase: phase changed during update | T | Defensive post-lock re-check. A retry re-reads. **Today the retry can still loop, because it then meets row 13's deterministic check.** It is bounded once row 13 is PT409. | DP | keep 40001 + comment |
| 39 | `delete_project_phase` | `00398:963` | delete_project_phase: follower set changed during relink | T | Post-lock row-count invariant. A further failure needs a concurrent commit. | DP | keep + comment |
| 40 | `delete_project_phase` | `00398:974` | delete_project_phase: phase changed during delete | T | as row 39 | DP | keep + comment |
| 41 | `advance_project_phase` | `00464:2682` | advance_project_phase: delayed phase changed during resume | T | Post-lock invariant. **The retry meets row 5's deterministic check**, so it is bounded once row 5 is PT409. | DP | keep + comment |
| 42 | `advance_project_phase` | `00464:2706` | advance_project_phase: phase changed during completion | T | as row 41 | DP | keep + comment |
| 43 | `advance_project_phase` | `00464:2720` | advance_project_phase: successor changed during activation | T | as row 41 | DP | keep + comment |
| 44 | `advance_project_phase` | `00464:2763` | advance_project_phase: project pointer update failed | T | The project row is already locked, so this is effectively unreachable. As row 41. | DP | keep + comment |
| 45 | `merge_studio_product` | `00830:207` | A line or board reference was added to this product while it merged. Try the merge again. | T | A reference landed in a job outside the locked census. The retry recomputes the census. Each further failure needs another concurrent insert. | DP | keep + comment |
| 46 | `_spec_book_trade_chapter` (`spec_book_attach_ffe_line`, `ensure_project_spec_book`, `_spec_book_refile`) | `00767:341` | spec book trade chapter % could not be filed | T | Raised after 3 insert/select passes lose to a concurrent prune. The retry starts fresh, and each failure needs 3 more concurrent prunes. | DP (pkg) | keep + comment |

Totals: 37 deterministic (D), 9 transient (T).

## Consumers that must change with the forward migration

None of these UI paths branch on the code: they key on the message. These do need updating:

- **`supabase/functions/sms-inbound/pipeline.ts:2156` and `:3527`.** These lines treat `23xxx | 42501 | P0001 | 40001 | 40P01` as proof of rollback.
  - Add `PT409`. Otherwise a PT409 from `apply_client_effect` (rows 2–3) returns 503 `prompt_commit_unknown` instead of the known-failure path.
  - Redeploy the function.
- **Doc comments that name 40001:**
  - `packages/supabase/src/hooks/use-field-time-reports.ts:93,101`;
  - `packages/supabase/src/hooks/use-studio-member-rates.ts:200`;
  - `apps/mobile/Patina/Patina/Core/Network/DecisionsAPIClient+ProjectApprovals.swift:426`.
- **Already accepts PT409, so no change needed:** `apps/designer-portal/src/components/document/overlays/purchasing-authorization-preview-sheet.tsx:97`.
- **Test fixtures that assert 40001 for these functions:**
  - `packages/supabase/src/hooks/__tests__/use-project-v2.test.ts:406` and `use-decisions.test.ts:644`;
  - SQL: `supabase/tests/document/{advance_project_phase_atomicity,decision_journey_atomicity,delete_project_phase_atomicity,journey_authority_integrity,project_journey_authority,proposal_phase_authority_atomicity}_test.sql`;
  - SQL: `supabase/tests/billing/us36_rerate_pending_hours_test.sql`, `supabase/tests/ffe/us37_{inherited_pricing_lock_order,pricing_approval}_test.sql`;
  - SQL: `supabase/tests/field/{field_time_reports,sms_resend}_test.sql`, `supabase/tests/spec_books/security_and_lifecycle_test.sql`.
  - Grep each one before editing, because some also assert transient rows that keep 40001.

## Not verified

- No row was reproduced through PostgREST on Strata, or on any stack. The impact column is inferred from the RC7-e2-2 mechanism, which was reproduced for round-8 code.
- Surface attribution comes from grep: RPC name to caller file. A `packages/supabase` hook was not traced to every portal that imports it.
- Whether a stale-view path is reachable in today's UI was not walked. Some screens may refetch before calling.
