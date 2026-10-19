# Purchasing Authorization Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan. Use the US-40 Sidequest contract for dispatch, ownership and evidence; do not create a second queue or orchestration ledger.

**Goal:** Let the designer preview the actual saved client-facing purchasing authorization, then explicitly send the same reviewed version to the client.

**Architecture:** Reuse the existing commercial send-snapshot RPC as the studio-only read/version boundary. Add an allowlisted furnishings preview projection, render its document body through a shared presentational component also used by the client portal, and make all three designer furnishing-send entry points use a saved preview. Preserve the existing send transition, notification dispatch identity and client draft-read denial.

**Tech Stack:** Supabase/Postgres, Next.js, React, TypeScript, TanStack Query, existing Patina types and design system, Jest/Vitest/plain SQL assertions. No new dependency or service.

**Spec:** `docs/superpowers/specs/2026-10-19-purchasing-authorization-preview-design.md`

**Authority:** User authorized the team to deliver this feature to production on 2026-10-19. No client sends, production fixture creation, fake agreements, signatures or overrides are authorized for testing.

## Global Constraints

- Work in isolated trees; explicit pathspecs only; preserve unrelated dirty files. No Serena from worktrees.
- Use Supabase Auth and the existing commercial author predicate; no client impersonation, public preview link, or access widening for drafts.
- Database rows and canonical fingerprints decide document content/version. UI-only computed totals or newly fetched send fingerprints must not replace the version actually previewed.
- Prices remain integer cents. Allowance line totals are authoritative; do not recompute them as quantity times truncated unit price.
- Preview opens/closes read-only; creation happens only through an explicit save action and reserves lines. Failed preview reads retain the saved document ID.
- No automatic Send, acknowledgement, override, billing authority or signature.
- Existing client presentation has no item images. Do not add imagery, PDF export, email composition or purchase-order preview in this feature.
- Local database 127.0.0.1:54322 belongs to SQ-1423 until its explicit terminal/command-clean handoff. No reset. Maximum two heavy workers with finite deadlines and descendant cleanup.
- US-39 owns pending migration 00835. Preview migration 00836 is provisional and must be reconciled at integration; never edit deployed migrations.
- Integrate US-39 first. Preview changes to `use-commercial-documents.ts` and `review-release-sheet.tsx` must preserve external-agreement eligibility, honest no-notification checkpoint publication and held checkpoint behavior.
- Generated types/grants use `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm db:generate` and `python3 scripts/generate-legacy-grants.py`; never hand-edit.
- Ship only after independent acceptance and green applicable gates. Deploy changed portals through `./infra/deploy-portal.sh designer` and `./infra/deploy-portal.sh client`, exporting each portal's Supabase trio from wrangler.jsonc in the same shell.

## Team and sequence

1. **Architecture preflight (independent Opus):** check the bounded seams below, especially snapshot/version atomicity and the third send entry point. This is not final acceptance.
2. **Implementation producer (routed coding.normal):** one owner for shared presentation, database read, designer flow and focused regressions. These share a data contract and send lifecycle; splitting implementation owners would add avoidable integration risk.
3. **Independent acceptance reviewer (other provider):** bind the full immutable submitted candidate; review client-data privacy, reviewed-version enforcement, draft/send lifecycle and cross-portal presentation.
4. **Verification/release owner:** assembled-tree gates, local browser walk and authorized migrations/portal deployments. Browser checks may run alongside read-only acceptance once the implementation owner releases the required resources.

Do not start a third patch against the same premise after two independently rejected candidates. Re-plan the failed seam first.

## Evidence and selected boundaries

- `review-release-sheet.tsx:230–319`: creation persists a draft; send follows creation; failed send retains the created ID. It is not a read-only preview.
- `authorization-detail.tsx:195–369`: existing saved-draft detail and send action.
- `pieces/release-lens.tsx`: third production consumer of `useSendFurnishingsAuthorization`; include it, not just the two obvious sheets.
- `use-commercial-documents.ts:1291–1379`: send currently accepts `proposalId: string`, fetches a current fingerprint and calls send, then uses the returned dispatch ID for notification. The reviewed fingerprint must become required input for this furnishing-specific hook; preserve service-agreement and trade-scope send hooks unchanged.
- `use-commercial-documents.ts:388–452`: existing generic designer bundle does not read furnishing snapshots; it is not sufficient for a faithful preview.
- `00412_design_services_commercial_authority.sql:1415–1442`: existing STABLE `get_commercial_document_send_snapshot(uuid)` authorizes a studio author and returns proposal ID, updatedAt and canonical fingerprint. Preserve these fields and compatibility for existing callers.
- `00744_pieces_release_placements.sql:102`: current delegated creation body; `00813_us37_inherited_pricing_paths.sql:763` is the current public wrapper. US-39 changes the former in its undeployed 00835. No creation-body rewrite is planned for preview.
- `00422_authorized_schedule_phase1.sql:2058`: the current list read omits frozen units and multi-room placements. Do not use live schedule data or this lossy list as preview authority.
- `00755_pieces_w4_review_fixes.sql:697,879`: client draft denial and frozen furnishings projection; find any later body before grafting.
- `client-portal/src/components/commercial-document-shell.tsx:361–472`: current `FurnishingsBody`. Its executed deposit handoff remains client-only; shared preview body covers the pre-signature document, not simulated client actions.
- `client-portal/src/lib/commercial-documents.ts:117–149,483–500`: client-facing item/authorization types and room/quantity helpers. Reuse canonical types from `packages/types/src/commercial.ts`, moving only the existing client-safe projection type when needed rather than redefining domain types.
- `packages/patina-design-system/package.json`: existing `@patina/design-system` root and component exports; it already depends on `@patina/types`. No new UI package or dependency is needed.

## Architecture preflight — accepted with incorporated corrections

SQ-1424's independent Opus source review accepted the architecture with corrections (comment `c_mvfkwf7i_a8e947`); no runtime validation was claimed. Current canonical fingerprint is `00577:188`, proposal review fingerprint `00390:173`, send comparator `00578:6953`. Displayed furnishing body fields are covered, including full frozen placements/unit snapshot, prices, total and deposit percentage. `get_commercial_document_send_snapshot` and the existing client bundle reader are both STABLE; the wrapper will call the existing reader and allowlist its preview fields, preserving the same database snapshot and avoiding a duplicate projection/helper.

There are four send sites in three callers. Items are immutable: Back is read-only; revisions use existing explicit Void (reason at least five trimmed characters) then re-release, not in-place editing. Recipient email, wave name and deposit invoice are not fingerprinted: keep them out of the client body and do not represent them as reviewed content. Use the existing recipient display only as studio chrome, with send-time recipient resolution unchanged.

Both portals already import the design-system typography classes. Scope the designer preview's differing `--text-muted` mapping; do not duplicate all typography or alter global themes. Client Jest resolution of a new design-system export remains UNVERIFIED until the producer checks the actual resolver/build path. Any newly observed missing fingerprint coverage, VOLATILE read dependency, draft-access widening or unavoidable broader lifecycle change reopens that seam before implementation continues.

## Task 1: Shared client-facing presentation and preview contract

**Files:**
- Modify `packages/types/src/commercial.ts` (and its existing export barrel only if needed).
- Create `packages/patina-design-system/src/components/FurnishingsAuthorizationBody/{FurnishingsAuthorizationBody.tsx,index.ts,FurnishingsAuthorizationBody.test.tsx}`.
- Modify `packages/patina-design-system/src/index.ts`; touch its tsup entry configuration only if the existing root export is insufficient.
- Modify `apps/client-portal/src/components/commercial-document-shell.tsx` and `apps/client-portal/src/lib/commercial-documents.ts`.
- Modify `apps/client-portal/src/components/__tests__/commercial-document-shell.test.tsx`.
- Add only scoped preview typography/token styles under the new designer preview component; no global client/designer style rewrite.

**Interface decisions:**
- `FurnishingsAuthorizationBody` is a pure, transport-independent component. Its input is the existing client-safe furnishings projection plus document total/deposit percent. No Supabase, router, send action, signature widget, private pricing or full generic commercial bundle in its props.
- Move/re-export the existing client-facing projection type through `@patina/types`; derive its line fields from canonical `FurnishingsAuthorizationItem` rather than duplicate that domain type.
- Keep the executed-only deposit handoff and Next Link in the client wrapper. Preserve client-facing money, room/unit, allowance and consent wording.
- Scope designer typography/token mappings to the preview root; preserve current client markup/output and use existing design-system package conventions.

- [ ] Add parity fixtures for multi-room/unit lines, allowances with truncating unit prices, zero and nonzero deposit, and stated document totals. Assert exact client text and absence of private fields.
- [ ] Extract the pure body and minimal presentation helpers. Make the existing client body delegate to it without changing its client-only lifecycle UI.
- [ ] Run `pnpm --filter @patina/design-system exec vitest run src/components/FurnishingsAuthorizationBody/FurnishingsAuthorizationBody.test.tsx`.
- [ ] Run `pnpm --filter @patina/client-portal exec jest --runInBand src/components/__tests__/commercial-document-shell.test.tsx`.

## Task 2: Atomic studio preview read and reviewed-version send

**Files:**
- Create `supabase/migrations/00836_purchasing_authorization_preview.sql` (provisional number).
- Create `supabase/tests/commercial/purchasing_authorization_preview_test.sql`.
- Regenerate `supabase/seed/00-legacy-grants.sql` and `packages/supabase/src/database.types.ts`.
- Modify `apps/designer-portal/src/hooks/use-commercial-documents.ts` and its `__tests__/use-commercial-documents.test.ts`.

**Interface decisions:**
- Extend existing `get_commercial_document_send_snapshot(p_proposal_id uuid) returns jsonb` additively for furnishing authorizations with an allowlisted `furnishingsPreview` object. Keep existing proposalId/updatedAt/documentFingerprint fields and other document-kind behavior unchanged.
- Reuse `get_client_commercial_document_bundle(uuid)` inside the STABLE send-snapshot read: it is already STABLE (`00755:678–683`) and already admits studio co-members while denying client access to unsent drafts. Select only its existing client-safe `document`/`furnishings` fields into the allowlisted preview object. Do not re-create that large RPC, add a second projection/helper, expose its whole bundle, or alter its guard. Every function on this read path remains STABLE; no VOLATILE helper/call inside.
- Preview payload includes document/project identity, title and already-visible client metadata, client-safe line projection, total/deposit values, and the canonical fingerprint from the same snapshot. Client reads of unsent drafts remain rejected.
- Add `useFurnishingsAuthorizationPreview(proposalId: string | null)`, project/document-keyed and strict about identity/payload validity. The query returns no usable Send state on loading, error or malformed/mismatched data.
- Furnishing send mutation input becomes `{ proposalId: string; expectedFingerprint: string }`. It passes that reviewed fingerprint to `send_commercial_document`; it does not fetch a replacement at click time. All four send sites across three production callers change with Task 3. Update `onSuccess` to use `variables.proposalId` (not the variables object as a query-key ID), and invalidate the preview query as well. Keep `fetchCommercialDocumentSendFingerprint` for unchanged service-agreement and trade-scope send hooks. Existing server-side guards remain authoritative.
- Preserve notification dispatchId/sentAt handling and pending-delivery outcomes. A pending email after a successful document transition is not a reason to create or transition another authorization.

- [ ] SQL assertions prove author access, wrong-studio/client/anon denial, unchanged client draft denial, snapshot units/rooms/allowance parity, no cost/margin/raw-snapshot leakage, no read mutations, and rejected stale reviewed fingerprints.
- [ ] Keep tests transactional and local; no outbound function invocation. Assert database send transition/dispatch records without executing external delivery.
- [ ] Hook tests prove required reviewed fingerprint, no fresh fingerprint substitution, identity isolation, read failure closure, and existing notification retry semantics.
- [ ] Apply only incrementally after resource handoff. Run `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/commercial/purchasing_authorization_preview_test.sql`.
- [ ] Run `pnpm --filter @patina/designer-portal exec jest --runInBand src/hooks/__tests__/use-commercial-documents.test.ts`.

## Task 3: Save, preview and explicitly send in all entry points

**Files:**
- Create `apps/designer-portal/src/components/document/overlays/purchasing-authorization-preview-sheet.tsx` and a focused test beside existing overlay tests.
- Modify `schedule/review-release-sheet.tsx` and `schedule/__tests__/review-release-sheet.test.tsx`.
- Modify `commercial/authorization-detail.tsx` and `commercial/authorization-detail.test.tsx`.
- Modify `pieces/release-lens.tsx` and `pieces/__tests__/release-lens.test.tsx`.
- Modify the direct caller's owning `ffe-section.tsx` only if required for existing sheet ownership/focus; update affected focused mocks/tests, not broad unrelated source.
- Add `docs/help/purchasing-authorization-preview.md`.

- [ ] Use existing DocSheet/DocumentAction focus patterns. Expose saved document identity and close callback, not a new modal framework.
- [ ] Replace create-and-send forward action with **Save draft & preview** and the explicit reservation/no-send explanation. Retain the saved ID through preview-load failure and close/reopen.
- [ ] Add **Preview** for existing drafts and route BOTH release-lens send sites through it: pending-draft Send at line 618 and create-and-send at line 657. Together with review-release-sheet and authorization-detail, that is four send sites in three production callers. Never expose a fallback direct-send action that silently obtains an unreviewed fingerprint.
- [ ] Render the persisted shared body with **Preview · Not sent**, existing recipient information, Close/Back and distinct **Send to client**. Hide non-applicable live signing/payment controls.
- [ ] Bind Send to the displayed ID/fingerprint. Hold on both `serialization_failure` (content changed) and `insufficient_privilege` (already sent, voided or unavailable); never recreate automatically. Offer reload/re-review where applicable, but never auto-send after reload. A successful transition with pending email uses its existing dispatch identity, not a second send transition.
- [ ] Test save once/no send, preview retry without recreate, existing-draft read-only open/close, successful send, stale refusal, notification pending, no duplicate retry, project switch/out-of-order data, keyboard return focus and cancellation.
- [ ] Run the hook test plus the four focused designer UI test files with `pnpm --filter @patina/designer-portal exec jest --runInBand <the exact paths above>`; freeze the expanded concrete command on the implementation ticket before dispatch.

## Review focus and acceptance gates

Independent review binds the entire submitted candidate and reports every finding with severity and confidence. It must examine:
1. Atomic content/fingerprint capture and whether all displayed client content is covered by the server comparison.
2. Unsent-draft and cross-studio privacy, including helper grants and accidental raw snapshot/cost leakage.
3. Create/read/send/notification failure boundaries and all three real entry points; no duplicates or surprise sends.
4. Shared client rendering regressions, authoritative allowance totals, styles and mobile/keyboard focus.
5. Preservation of integrated US-39 external-only checkpoint and purchasing enforcement.

- [ ] Producer supplies meaningful assertion-failure negative controls, a restored green pinned capture, exact baseline/candidate and all scoped commits.
- [ ] Independent reviewer accepts the exact immutable candidate before integration/deployment.
- [ ] Integration owner runs one assembled-tree gate: relevant SQL regression set, all selected designer/client/shared tests, `pnpm --filter @patina/design-system type-check`, designer/client type-check, and the strict admin/shared generated-type build gate required by patina-verification.
- [ ] Browser verifier uses synthetic LOCAL data at desktop and genuine 390px, keyboard-only save/preview/back/reopen/stale cases. No real sends. Record what was actually exercised; do not claim VoiceOver without running it.
- [ ] Quality measurement remains UNVERIFIED if the configured scorer is still unavailable; do not claim an invented score or install tooling without authorization.

## Release

- [ ] Recheck main and Strata migration tips; renumber only the undeployed preview migration if necessary. Explicit main integration; preserve unrelated changes.
- [ ] Commit/push the reviewed feature and plan/spec/help through the authorized release sequence.
- [ ] Apply migration to Strata; deploy no edge function unless a separately reviewed scoped change actually requires one.
- [ ] Deploy both changed portals through the repository scripts with the correct build-time Supabase variables.
- [ ] Verify new RPC object/permissions and Worker deployment identities plus real behavior, not static version text.
- [ ] Production smoke may open the real project's existing UI/read-only preview if available. Do not save test authorizations, upload fake agreements or Send to client. Report honestly if real draft data prevents a full production walk.
- [ ] Record migration, commits, deployment IDs, test evidence and remaining manual steps; retire only this team's owned worktrees/tabs safely.


## Settled deposit correction — 2026-10-19

US-40 story log revision 1 / SQ-1426 ruling `c_mvfmsx6k_aad247`: the client reader may prefer an unfingerprinted linked invoice amount. Both the saved preview and actual pre-signature client body therefore derive contractual deposit with `round(document.totalAmountCents * document.depositPercent / 100)`. The shared body owns that rule. Only the executed client body may retain its existing invoice-backed amount; executed payment/deposit handoff stays unchanged. Preview excludes invoice-backed amounts and depositPaidCents. Add deliberately mismatched invoice parity and executed-handoff preservation assertions. No client-reader rewrite, helper RPC, fingerprint expansion or billing lifecycle change.
