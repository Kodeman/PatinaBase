# Current portal → approved experience

Source baseline: `ee9c450a5`, checked 23 October 2026. This is a source inventory, not a claim that every path is deployed or runtime-verified. Recheck changes since that baseline at WP-00.

## Existing foundation

The current app is already document-native. `(portal)/` and `the-document-pilot` are retired; `/desk` is the landing. Do not rebuild the old zone portal or revive its flag. The current root package override is Next `~16.2.6` with React 19, despite older summaries naming Next 15. Read package manifests and lockfile at kickoff.

Abbreviations below: `D` = `apps/designer-portal/src/components/document`; `H` = `apps/designer-portal/src/hooks`; `L` = `apps/designer-portal/src/lib/document`; `S` = `packages/supabase/src`.

| Seam / observed entry point | Preserve | Redesign use / owner |
|---|---|---|
| `apps/designer-portal/src/app/(document)/layout.tsx`, `DocumentLayout` | DocumentTimeProvider, MobileShellProvider, HelpStateProvider, DocumentHelpProvider, DeskWalkthroughProvider, NeedActSheetProvider; StudioDrawer/CommandBar/account/invoice overlays and arrival/navigation/save/error services | Restyle shell; mount each provider/instrument once. Foundation team |
| `D/document-route-boundary.tsx`, `D/desk-doorway.tsx`; root `providers/providers.tsx` | Bare `/board/*` excludes inner Document chrome/providers; root session-epoch/query isolation remains. DeskDoorway mounts last so listeners exist before one-shot URL consumption | Preserve boundary and ordering; do not create another URL-driven overlay opener. Integration lead |
| `D/rooms/drafting/service-agreement-drafting-room.tsx`, `agreement/agreement-composer.tsx`; `D/account/account-studio-page.tsx` | Existing service/design-build agreement capability, parts/license/jurisdiction/read-only/issued-state rules and gates | Map service arrangements onto existing contracts, not a second turnkey editor. WP-03/domain owner |
| `app/(document)/doc/[id]/layout.tsx`, `DocumentHoldLayout`; `H/use-document-state.ts`, `documentEngagementQueryOptions`, `useDocumentEngagement` | `document_open(p_id)` resolves engagement/lead/proposal/project identity | One persistent job across activation and deep routes. Integration lead |
| `L/registry.tsx`: STUDIO_ROOMS, STUDIO_LEDGERS, STUDIO_VERBS; `D/desk-contents.tsx`, `D/studio-drawer.tsx` | Global versus document-scoped resources, command aliases, shortcuts, help metadata | One registry drives studio/mobile/command access; no second menu inventory. Integration lead |
| `H/use-desk-engagements.ts`: useDeskEngagements, composeDeskRead, selectOperationalNeedsForDocument; `D/desk-roster.tsx` | Claims, unpaid/released-unsent orders, events, samples, drafts, returns, whose-move and ownership | Image-led studio with truthful next acts from existing derivations. Studio team |
| `app/(document)/doc/[id]/page.tsx`; `H/use-document-running-index.ts`; `L/document-index.ts` | One job orchestrator, identity, existing mounted regions and focus-aware index | Chapter composition and in-place instruments. Only integration lead edits the page during parallel work |
| `D/ffe-section.tsx`: FFESection / FFESectionBody; `D/pieces/build-room-shell.tsx`: BuildRoomShell | Preliminary/specification/pricing/authorization/finish lenses, stable lines and notes | Dense native room work; wrap existing bodies, do not replace with a generic table. Selections team |
| `H/use-place-in-document.ts`; `S/hooks/use-project-ffe-ga.ts`; `H/use-document-rooms.ts` | V2 placement, configuration IDs, candidate disposition, idempotency, room/board and duplicate rules | Library-to-room handoff and usage reading. Selections team |
| `D/rooms/library/library-room.tsx`; `D/people/people-room.tsx` | Personal capture/studio/catalog distinctions; richer relationship work | New resource composition with existing discovery and actions. Studio team |
| `D/plans/`; `S/hooks/use-plan-room.ts` | Current prints, exact issues, transmittals, holdings, client set | Room evidence folio and package references. Design-evidence team |
| `S/hooks/use-product-configurations.ts`; `D/buying/submittals.tsx`; `D/commercial/trade/` | Custom revisions, quotes, locked configurations, submittals, trade scope | Foundations for CP-01; package/readiness/instruction contracts are additional work. Build-team domain owner |
| `H/use-commercial-documents.ts`; `D/accounts/`, `D/account-band.tsx`; `S/hooks/use-invoices.ts` | Commercial bundles, executed authority, budgets, signatures, bids/draws and drift | Financial folds and studio books backed by existing owners. Commerce team |
| `H/document-time-provider.tsx`; `D/hours-ledger.tsx`, `D/log-time-sheet.tsx`; `S/hooks/use-time-tracking.ts` | One timer, billability, dated rates, visibility and invoice claims | Capture in job, review across studio. Commerce team |
| `H/use-margin-items.ts`, `H/use-margin-notes.ts`; `D/coordination/`, `D/field/`, `D/overlays/post-sheet.tsx` | Private note, decision, change, outbound draft, received message and activity remain distinct | Anchored communication in room/package and studio inbox. Coordination team |
| `L/closure-derivation.ts`: deriveCloseoutReadiness; `D/care-band.tsx` | Current phase, coordination, change, FF&E, invoice and money gates | New scoped service acceptance plus care, with compatibility work. Build-team/closeout domain owner |

## Flag and layout seams to inventory in WP-00

Record each referenced feature flag’s code default, environment/build override, remote/cohort state if verified, loading behavior and controlling surface. Include `agreement-parts`, `agreement-library`, `design-build`, `procurement-workspace-pilot`, `studio-workspaces`, `loading-register` and `one-voice`; this list is a starting set, not an exhaustive inventory or a claim that any flag is enabled.

The design-build composer requires resolved `agreement-library` and `design-build`; its former outer `agreement-parts` gate is gone. The Account licensing card still requires all three. Flags do not replace license, editing or server-authority checks. Respect existing gates while introducing the renderer. See ROLLOUT for PostHog resolution/override limits.

MobileShellProvider switches below 1180px; 1180–1439 uses a modal margin, and 1440+ can show the persistent margin. Drawer/bar heights are published dynamically. Preserve page-owned unfold → density promotion → landing callbacks for mobile jumps. `InlineErrorSurface` suppresses mutation error toasts in the Document group; each mutating act owns an inline fail line, and supporting queries use `meta: { errorSurface: 'silent' }`. The global design-system Toaster still exists; do not mistake suppression for the absence of an ancestor toaster.

## Shared integration contracts

- Use `S/query-keys/document.ts` (`docKeys`) for document/desk/engagement/tasks/gates. No independent “redesign-job” cache.
- Reuse `invalidateFfeCaches` in `S/hooks/use-procurement.ts` and `invalidateProjectFfe` in `use-project-ffe-ga.ts`. Their fan-out covers more than a line list: project, procurement, readiness, pricing approval/events, workflow, boards and review attention.
- Library placement invalidates `library-piece-usage`; room placement and the library's “used on” reading must agree.
- `invalidateProjectCommerce` and `invalidateTradeScope` own commercial invalidation. New financial presentation must not create a second mutation layer.
- Retain `invalidateProjectApprovalQueries`, including its FF&E/margin/document-state fan-out, and the existing `commercialKeys` / `settleScheduleWrite` paths. Locate their latest definitions before extending them; do not assemble a competing invalidation list in a new view.
- `invalidateMarginSurfaces` owns the relevant document/margin/FF&E/coordination refresh. A note appearing in one view is not proof the others update.
- Preserve `L/pieces/build-room-url.ts` (`buildRoomHref`, `parseBuildRoomSearch`, `buildRoomReturnHref`). Permission-sensitive lenses remain restricted. Existing URLs must still resolve if the default work opens inline.
- Preserve `L/room-origin.ts` and its non-room origin semantics; Library → People must not erase the original job destination.
- Reuse `D/overlays/doc-sheet.tsx` (`DocSheet`) for managed sheet stacking, inert background, focus trap/return, scroll lock and portaled controls.
- `L/pieces/sheet-focus.ts` supplies line/room focus by identity; sorting and room moves must not return focus to the wrong record.
- Reuse `H/use-buffered-autosave.ts` and `useProposalAutosaveBarrier`: pending/error/generation handling is part of send safety, not cosmetic state.
- Preserve one-act-many-surfaces domain transactions. Cache invalidation/realtime refreshes the views; it must not substitute for an atomic business transition.

## Capability preservation beyond the mockup

The following are release obligations even where round eight shows only a brief or simplified control. WP-00 records their current role, route/entry point, backing data, test and destination; removal requires a named product decision.

| Capability family | Destination / preservation rule |
|---|---|
| Inquiry, lead/discovery, proposal, direct project, agreement, activation | Studio openings and early job chapters; preserve lineage and identity |
| All rooms, bulk work, grouping, alternates, finishes, COM, labor, tax/markup, protected issued values, change orders | Dense room instruments; retain existing richer business rules |
| Personal capture, studio library, catalog, configurations, boards/materials, teaching and usage provenance | Library/room design; no collapse into six demo cards |
| Measured rooms, plan uploads/revisions/issues, render lifecycle and source privacy | Library resource + job evidence; cannot disappear because studio mockup has five top-level labels |
| Order register, weekly orders, receiving, claims, vendor accounts, external/store purchases | Orders book and relevant job instrument |
| Accounts, receivables/aging, invoices/receipts, commercial authority, earnings visibility | Studio books and job financials; permission boundaries retained |
| Timer, manual hours, member/project/studio scopes, pending rates, claims/releases | One time subsystem across job and Hours book |
| Client/maker/trade relationships, communications, nurture, reviews, portfolio and outreach | People/resource views and contextual actions; preserve draft-first sends |
| Project directory, work orders, Field observations, tasks, changes, distribution and receipts | Site/team chapter and scoped recipients |
| Studio membership, rates, agreement defaults, preferences, notification rules, profile, help/command search | Quiet utilities and existing global instruments |
| Save errors, loading, missing/redirected identity, access loss, offline/retry, concurrency and activity | First-class production states in every affected surface |
| Current client page and Field/iOS consumers | Existing contracts and links remain valid; necessary new evidence surfaces are coordinated work, not silent downstream breaks |

Source coverage is a starting inventory. WP-00 must prove actual runtime behavior in a local live-data profile and record any inherited failure separately from redesign regressions.

## Corrections after WP-00 audit (2026-10-23)

These correct the program's initial assumptions against the current source; implementation ownership and boundary constraints remain in the US-52 contract.

1. The job page mounts exactly one active section (§4); `PROJECT_PAPER_ORDER` has six stops. Round 8 project jobs become continuous paper (R8-02); lead/proposal pre-work regions stay unchanged.
2. `/doc/[id]/pieces` is a separate route whose inner `BuildRoom` unmounts the paper. Inline unfold uses embedded `BuildRoom` plus `history.pushState`; existing `/pieces` URLs continue resolving.
3. `DocSpine` retires under round 8, but its section ladder moves to contents margin, money-ladder doors to chapter sub-labels, and room-in-hand release to job head.
4. `apply_phase_template` is already idempotent (00474); C2 adds scope-edition provenance and amendment semantics, not new idempotency.
5. `studio_purchases` (00703/00862) is studio commerce, not external fulfilment. C5 is a separate build-domain contract; do not fake POs. GC cabinetry stays outside priced studio FF&E by default.
6. The submittal resolver (00399:4800, 00808:2240) already approves, clears holds and unblocks tasks; define fabrication authority's relationship to it.
7. Fabrication scope is a text CHECK (00624); current co-member write policies would permit it unless deliberately rewritten.
8. Web approval parsing throws on unknown kinds (`use-project-approvals.ts:14,329`); native defaults unknown roles to answering. Service acceptance needs a separate record, RPC and projection.
9. Keep `close_project` unchanged: service acceptance must not write `projects.status`, `closure_checklist` or `portfolio_snapshot`.
10. FF&E readiness issues one RPC per selection (`use-project-ffe-ga.ts:88`, eight at a time); P11 measures request count as well as DOM cost.
11. Some named invalidators are private. Reuse mutation hooks; do not export invalidators or create a whole-job refresh fan-out.
12. Green gates have gaps: `verify:affected` omits SQL suites, designer build ignores type errors, Jest thresholds are zero, and AI-quality bundle measurement runs only on PRs. Each slice names assertions and allowed skips.
13. The shell DOM contract is relied on by about 40 source files and 40 e2e specs. Preserve `data-document-shell`, `data-document-paper`, `data-index-region`, `data-reading-index`, `data-arrival*`, `data-spotlight-frame`, `#doc-ticket-sentinel`, `data-shell-regime`, and `data-drafting-stock`; see [evidence/dom-contract.md](evidence/dom-contract.md).
