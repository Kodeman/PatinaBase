# Direction C — implementation plan

Status: planned, not implemented. Direction C selected by Kody on October 10, 2026.

## 1. Outcome and scope

Make the next task and its destination understandable through consistent, professional studio terminology. This is a wording change, not a navigation redesign or a new workflow.

The approved starting point is the **Direction C column** in [the founder presentation](founder-review.html): 1,334 mapped entries across 106 designer-portal areas. The embedded `copy-data` JSON contains current text, replacement text, context, source, and notes. Preserve that presentation as the decision record.

Assumed scope of “portals”: all four web portals, plus Patina Field.

| Surface | Implementation scope |
| --- | --- |
| Designer portal | Apply the approved mapping across navigation, pages, controls, dialogs, statuses, search, help entry points, feedback, and accessibility labels. |
| Client portal | Extend Direction C to homeowner-facing language, including its single-project Threshold page and public token workflows. Do not introduce designer navigation. |
| Admin portal | Extend the clear, professional vocabulary to administrative tasks without mislabeling identity, fulfillment, or financial operations. |
| Manufacturer portal | Cover existing home and onboarding-placeholder surfaces only. Do not promise capabilities that are not implemented. |
| Patina Field | Cover rendered copy throughout capture and studio-work workflows, shared Field display helpers, system permission descriptions, and accessibility labels. |
| Shared packages | Change rendered text only where a consuming surface needs it. One owner coordinates all consumers. |

Consumer Patina iOS is outside direct relabeling scope. Test affected consumers if a shared mobile component changes. Other exclusions: route restructuring, file/class renaming, business logic, schema migrations, new localization infrastructure, rebranding, and retrospective changes to signed or historical records.

**Coverage qualification:** the original mapping covers the designer portal, not the other three portals or Field. Start with a reconciliation/inventory wave; do not claim the existing 1,334 rows cover all five applications. Dynamic backend messages, CMS article bodies, and conditional screens require additional discovery. User-authored project names and content are not copy to rewrite.

## 2. Language contract

Use the approved row in its actual context, not a global string substitution. Identical current strings can have different replacements: global “Hours” becomes “Timesheets,” while a contact’s “Hours” becomes “Time records.”

| Current designer label | Approved Direction C |
| --- | --- |
| The Desk | Studio overview |
| Library | Resource library |
| People | Studio contacts |
| The Scans | Measured rooms |
| Orders | Purchase orders |
| Accounts | Studio accounts |
| Hours | Timesheets |
| The Post | Studio inbox |
| Call sheet | Project directory |
| Spec book | Specification book |
| Boards | Design boards |
| Open a project — creation action | Create a project file |
| Capture a lead | Record an inquiry |
| Draw an invoice | Draft an invoice |
| Money | Project financials |
| Closing the book | Project closeout |
| Your pen | Action with you |
| At rest | No current alert |
| Keys | Keyboard shortcuts |
| The words | Terminology guide |

Rules for all agents:

- Name destinations with clear nouns and actions with a verb plus object. Preserve the distinction between creating, opening, preparing, issuing, approving, and paying.
- Expand specialist abbreviations such as FF&E at first useful explanation; do not add jargon simply to sound professional.
- Keep a project schedule distinct from an FF&E schedule; keep proposals distinct from design services agreements and purchasing authorizations.
- “Measured rooms” names a destination. It must not imply every photo, scan, dimension, or measurement has been verified.
- Keep helpful historical search aliases where supported so a designer searching “Desk” can still find “Studio overview.” Do not expose duplicate navigation destinations.
- Update tooltips, screen-reader labels, mobile variants, empty/error/loading states, confirmation text, and both active feature-flag copy branches—not just the visible heading.
- Prefer existing display maps/helpers. Add small presentation-only mappings where necessary; do not build a cross-platform translation framework for this project.

### Audience-specific extensions to confirm in Wave 0

The selection approves Direction C, but the new applications did not have row-by-row founder mappings. The language owner supplies a compact exception/extension table before those edits begin. Routine extensions follow the contract; ambiguous terms or changes to consequences come back for product review.

| Context | Required treatment |
| --- | --- |
| Homeowner Threshold | Replace metaphors such as “The doorstep,” “The letterbox,” “The road,” and “The mat” with labels based on their actual content and task. Do not blanket-replace them with studio-administration terminology. |
| Admin “People” | This groups users, studios, roles, applications, verification, and waitlist. It is not “Studio contacts.” Inventory its operational meaning separately. |
| Manufacturer onboarding | Preserve the fact that the flow is not yet available. A label must not imply successful enrollment is possible. |
| Field Today | Retain the distinction between daily field work and a studio-wide overview. Do not rename Today solely to match web home. |
| Field messages | Keep **Messages** for conversations. Field explicitly prohibits user-facing “inbox”; its capture queues are not the designer portal’s Studio inbox. Do not weaken the existing copy gate. |
| Field photo capture | Keep “Photos & notes” distinct from a site scan; preserve non-LiDAR limitations and UNVERIFIED warnings. |
| Shared authentication | Keep defaults audience-neutral; app wrappers own studio/homeowner/admin-specific explanations. |
| Client-hosted public links | Determine audience per workflow. Field, trade, RFQ, paperwork, payment, and evidence links are not all homeowner screens merely because the client portal hosts them. |

### Meaning that must not change

- Designer “Moved” represents ordered commitments minus vendor paid; “Owed” is unpaid client invoices; “Not drawn” is pending vendor payouts, mapped to “Undisbursed vendor payments,” not unbilled client revenue.
- “Release for authorization” has context-specific replacements: prepare the authorization, name the authorization document, or issue it. Opening a review is not sending a purchase order.
- “Brief a vendor” opens vendor correspondence; it does not itself send a message.
- Studio inbox means received conversations and notifications, not an outbound draft queue.
- “No current alert” does not mean the project is complete.
- Field’s local save, queued upload, upload in progress, server confirmation, failure, and rejection stay distinct. Never label a local save as synced.
- Read-only decisions remain read-only. Preserve financial authority, consent, membership, payment responsibility, and access distinctions.
- Wire enums, Codable keys, routes, screen IDs, analytics events, test IDs, permissions, feature-flag keys, bundle identifiers, and deep links stay unchanged. Edit display labels, not contracts.

## 3. Team and exclusive ownership

Use an orchestrator plus **at most three active worker agents** at a time, matching the available four-agent capacity. These are sequentially scheduled roles, not ten simultaneous agents.

| Role | Owned work | Boundaries |
| --- | --- | --- |
| O — orchestrator/integrator | Inventory reconciliation, file assignment, wave coordination, integration, evidence ledger, final handoff | No competing edits in worker-owned files. Own integration-only manifests and final generated-project reconciliation. |
| L — language/shared-package owner | Canonical C manifest and exceptions; affected `packages/patina-design-system/src/components/PortalAuth/`, `packages/help-system/src/`, `packages/catalog-ui/src/components/`, display labels in `packages/types/src/field-config.ts` | Shared package changes come through L, not individual portal agents. No enum/type-contract renaming. |
| D1 — designer shell, people, and settings | Global document registry, navigation/search, Studio overview, people, account/settings, inbox, help entry points | Sole owner of `src/lib/document/registry.tsx`, its tests, shared shell components, and `src/lib/help-system/`. |
| D2 — designer projects and commercial copy | Project documents/sections, specifications, proposals/agreements, purchasing authorization, orders, invoices, project/studio financials, time, closeout | Own document/commercial helpers and corresponding semantic tests. Request central registry changes from D1. |
| D3 — designer sourcing and visual resources | Resource library, product details/configuration, design boards, measured rooms, related capture/scan display copy | Own library/room/board surfaces and their local helpers. Shared project section labels remain with D2; global labels remain with D1. |
| P1 — client portal | Threshold components and derivation helpers, authentication wrappers, public token-route copy | Own both rendered text and helper-generated labels. Coordinate Field/trade terminology with F1/F2. |
| P2 — admin and manufacturer portals | Admin navigation, actions, operational statuses, communications; manufacturer’s existing two-page surface | Own admin nav label producers and badge-count consumers together. No new manufacturer functionality. |
| F1 — Field studio workflows | Root, Work, Projects, Leads, Decisions, Messages, Receiving, People, SiteRequests, Time, Account, Settings, Library, Piece, Route, Session, Companion, SystemEntry; general CaptureKit display helpers | Own any Field-specific shared display glossary and general workflow tests. Do not edit F2’s generator/capture surfaces. |
| F2 — Field capture and permissions | Capture, Recognition, SiteScan, Resilience, Onboarding, Auth, QRApprove; hardware-facing CaptureKit copy; permission strings in `scripts/generate_project.rb` | Presentation only: no sensor, sync, service, state-machine, or manifest-contract changes. Own hardware-entry/reachability acceptance tests. |
| R — independent reviewer | Semantic, coverage, accessibility, and behavior review of each completed slice and final integration | Separate context and opposite provider from the implementer, per repository policy. Report every finding with severity and confidence. |

These are ownership domains, not permission to edit whole directories indiscriminately. Wave 0 converts them into **exact non-overlapping file allowlists**, including tests. Shared files receive one owner; cross-owner edits require an explicit handoff. Resolve mixed-purpose files before implementation.

Known designer ownership boundaries, relative to `apps/designer-portal/src/`:

- D1 owns central `lib/document/` label registries/helpers, including `act-names.ts`, `document-index.ts`, `shelves.ts`, `ticket-derivation.ts`, and lens display derivations; `components/document/{command-bar.tsx,doc-spine.tsx,studio-drawer.tsx}`, `spine/`, `mobile/`, and shared `region/` controls. D1 also owns `people/` and people-navigation tests for this plan.
- D2 owns `app/(document)/doc/[id]/page.tsx`, its project `pieces/`, `plans/`, and `spec-book/` route components; document `pieces/`, `plans/`, `spec-books/`, `schedule/`, `commercial/`, `approvals/`, `buying/`, `accounts/`, `line-unfold/`, **`rooms/drafting/`**, and **`roster/`**. Project financials and drafting are not room-scan tooling.
- D3 owns document `rooms/{library,piece,room-view}/`, board route/components, `project-mood-boards.tsx`, `boards-region-head.tsx`, `recent-boards-strip.tsx`, and the `worktable/` library/board/room entry components. D3 does not own `rooms/drafting/`, `roster/`, or people screens.
- `act-names.ts` includes label-keyed classification: D1 updates producers and dependent lookups together while retaining stable action IDs. Likewise, P2 owns the admin label-keyed badge pairing in `hooks/use-admin-nav-counts.ts` and `components/portal/sub-nav.tsx`.

Use the repository’s configured Sidequest role/category routing rather than hardcoding model versions. Standard implementation goes through the coding route; financial/authority semantics require frontier review. Use Opus to review Codex-built changes and Codex to review Claude-built changes. If that reviewer provider is unavailable, record the review gate as outstanding rather than claiming completion.

## 4. Execution waves

### Wave 0 — reconcile and freeze the contract

**Concurrent workers:** L inventories the designer/shared baseline; P1 inventories the other portals; F1 inventories Field. O consolidates.

1. Extract the approved C rows into a versioned implementation manifest. Preserve current wording and source evidence; assign stable row IDs.
2. Revalidate source locations against the execution baseline. Add missing conditional, accessibility, mobile, error, and flag-variant copy.
3. Inventory the additional applications. For Field, use `CaptureScreenID` and registered screens rather than the README’s outdated screen count. For web, use actual routes and component/helper sources.
4. Each row records: ID, audience, surface/state, source path/symbol, current copy, C copy, semantic meaning, owner, dependencies, exception if any, and verification method.
5. Resolve the audience extensions above and financial/measurement ambiguities. Founder/product review is only needed for unresolved meanings or deviations from approved C—not every mechanical replacement.
6. Freeze the exact file ownership matrix, affected test list, shared-package consumer list, and comparison baseline.

**Exit:** every known surface has an owner; all 1,334 seed rows are reconciled; no unresolved high-risk meaning is delegated as a guess. Report the expanded inventory count rather than estimating it now.

### Wave 1 — shared foundations and a representative vertical slice

**Workers:** L, D1, then R as a review slot becomes available. O integrates.

- L lands the accepted shared display changes and audience exceptions. Rebuild compiled packages before consumer checks.
- D1 applies the global designer vocabulary, search aliases, Studio overview, and corresponding help/accessibility entry points.
- Review one representative path: find a project from Studio overview, open it, locate its documents/actions, and return. Confirm wording and destination agreement before distributing the pattern.
- F1’s small Field display contract, if required, is prepared and reviewed before F2 consumes it. It need not be a new code module if existing helpers suffice.

**Exit:** reviewed foundation becomes the common baseline for implementation worktrees. Do not fan out from divergent glossaries.

### Wave 2 — designer workflows

**Workers:** D1 finishes contacts/settings/inbox; D2 covers projects/commercial; D3 covers library/rooms/boards.

- Implement all assigned rows, including currently hidden conditional states and both active copy branches.
- Update text-dependent tests without weakening behavior assertions.
- Mark each manifest row `implemented`, `unchanged—already correct`, or `exception—review required`, with evidence.
- Review each slice before another slice depends on it. Use a freed worker slot for R; the concurrency cap still applies.

**Exit:** designer C mapping is fully accounted for and semantic review passes.

### Wave 3 — audience portals and Field work

**Workers:** P1, P2, F1.

- Apply reviewed client/admin/manufacturer extensions, preserving each audience’s mental model.
- Cover helper-generated client labels as well as components.
- Update admin navigation labels and display-label-keyed badge counts together.
- F1 implements daily work, project, resource, contact, time, messaging, and sync-state language.

**Exit:** other portal inventories and Field general workflows are reconciled; reviewed Field helper changes are available to F2.

### Wave 4 — Field capture and integrated review

**Workers:** F2, R, and one assigned correction owner as needed. O coordinates final validation.

- F2 implements capture, measurement, permission, recovery, onboarding, and QR-approval copy.
- Regenerate Xcode configuration through the generator/gate; never hand-edit generated project settings.
- Run integrated application gates and cross-surface task walkthroughs. Review Field with simulator evidence and a focused physical-device read-through for changed hardware-facing copy.
- Resolve remaining exceptions and inconsistencies; perform final opposite-provider review.

**Exit:** acceptance checklist below is complete, or remaining blockers are explicit. No deployment is implied.

## 5. Worktree and dispatch protocol

During approved implementation, give each active agent its own `.codex/worktrees/agent-<id>` checkout and branch from the reviewed integration baseline. No implementation agent runs git in the shared main checkout. Bootstrap dependencies and required package outputs in each worktree.

Each dispatch includes:

1. Exact row IDs and allowed source/test paths; forbidden shared paths; upstream baseline/dependencies.
2. Approved replacement text and explicit audience exceptions; no unrequested features, refactors, or abstractions.
3. Protected meanings and identifiers; ask for an ownership handoff rather than editing another agent’s file.
4. Specific test commands, browser/device journeys, and expected evidence for that slice.
5. Report changed paths, completed/exception row IDs, command results, screenshots where useful, and remaining uncertainty.

One agent owns each dev-server port. One owns any local test-data reset, after confirming it is not production. Field lanes use separate simulator clones and explicit UDIDs; physical-device time is serialized. Keep credentials out of logs and commits. Stage only explicit paths when commits are authorized. Retire worktrees and temporary simulators at completion; preserve unmerged work before cleanup.

## 6. Verification gates

Run targeted existing tests first, then the integrated affected-surface checks. Record pre-existing failures separately; do not expand this project into unrelated repairs. Missing prerequisites or failed gates are not passes.

### Web and shared packages

Current source inspection finds lint configs in designer, client, and admin; older skill text saying otherwise is stale. Manufacturer has no lint/test script. Designer/client builds can suppress type errors, so build alone is insufficient.

```bash
pnpm --filter @patina/designer-portal type-check
pnpm --filter @patina/designer-portal lint
pnpm --filter @patina/designer-portal build

pnpm --filter @patina/client-portal type-check
pnpm --filter @patina/client-portal lint
pnpm --filter @patina/client-portal build

pnpm --filter @patina/admin-portal type-check
pnpm --filter @patina/admin-portal lint
pnpm --filter @patina/admin-portal build

pnpm --filter @patina/manufacturer-portal type-check
pnpm --filter @patina/manufacturer-portal build
```

- Rebuild changed compiled packages before these checks; in particular, `pnpm --filter @patina/design-system build` and `pnpm --filter @patina/help-system build` when changed. Design-system currently resolves `dist`, not source.
- Run affected existing Jest tests with `pnpm --filter @patina/<portal>-portal test --runInBand --runTestsByPath <test-paths>`. Wave 0 pins actual paths per owner rather than leaving this placeholder in dispatched briefs.
- Designer baseline candidates include `src/lib/document/registry.test.ts`, `src/lib/document/__tests__/sent-proposal-voice.test.ts`, `src/lib/help-system/keys-reference.test.ts`, `src/lib/help-system/document-pathname-to-surface-key.test.ts`, and `src/components/document/people/__tests__/people-navigation.test.tsx`.
- D2 adds existing money-region, money-ladder/vendor-payout, review-release-sheet, call-sheet, and agreement-copy tests. D3 adds library-entrances, add-to-project-sheet, project-mood-boards, and worktable entry tests. Browser slices include `e2e/document/{pieces-build-room,plan-room,spec-book-workspace,quiet-release-contracts,room-view}.spec.ts` and the existing library-configuration suite. Confirm required feature overrides before running them.
- Run affected shared-package tests and existing browser suites for changed journeys. Use browser checks for both existing manufacturer pages; do not add a new test framework solely for these labels.
- If shared copy reaches additional consumers, extend the affected-consumer gate matrix before merging.

### Patina Field

```bash
CAPTURE_SIM_UDID=<lane-owned-simulator-udid> \
  apps/mobile/Capture/scripts/capture-gate.sh all
```

The current `all` tier runs build, CaptureKit unit tests, CaptureUITests, strict lint, `fcr3`, and `p4`. SwiftLint is pinned to 0.65.1. The gate bootstraps and regenerates the project. Run focused helper/UI checks during the slices and the full gate after integration.

- Keep `CaptureScreenID` raw values, accessibility identifiers, route keys, analytics taxonomy, and `CaptureDestination`/`CaptureStatus` raw values unchanged.
- Permission descriptions are generated in `apps/mobile/Capture/scripts/generate_project.rb`. Preserve truthful permission explanations, including the speech-processing fallback.
- Check long names, narrow screens, Dynamic Type, VoiceOver labels, offline/empty/error states, and real navigation—not just screen-harness screenshots.
- Simulator mocks establish copy/layout behavior, not real sensor or upload correctness. A focused physical-device walkthrough is required for changed permission prompts and scan/measurement coaching; record explicit UDID and verification limits.
- Leave `PatinaDesignKit` untouched unless a shared rendered label actually needs changing. If it changes, run consumer `apps/mobile/Patina/scripts/ios-gate.sh build` plus affected tests/UI smoke checks; consumer unit/UI tiers use `IOS_GATE_UDID`.

### Cross-surface task acceptance

| Task | What must be clear and unchanged |
| --- | --- |
| Find the next project action | Studio overview wording leads to the correct project and action; no-alert status is not completion. |
| Source and specify a product | Resource library, Design boards, FF&E selections, and Specification book are distinguishable and consistent. |
| Review a measured room | Field capture and portal room labels distinguish notes, scans, unverified dimensions, and confirmed data. |
| Request purchasing authorization | Preparing/reviewing versus issuing is explicit; homeowner wording matches the request without changing authority. |
| Review money and purchase orders | Client invoices, vendor commitments, vendor payments, and receiving retain their distinct meanings and amounts. |
| Find a conversation | Studio inbox on web and Messages in Field are accurately named for their actual content. |
| Record time or an inquiry | Creation actions and saved-state confirmations agree across desktop and Field. |
| Administer users or review maker onboarding | Admin roles/badges still work; manufacturer copy honestly describes unavailable functionality. |

Use test accounts and local/staging fixtures. Do not issue live purchase orders, charge payments, send external messages, or mutate production to demonstrate a label change.

## 7. Completion and handoff

- Every approved seed row and added inventory row has an owner, final wording, disposition, and verification evidence. No unreviewed exception remains hidden.
- Search for retired UI phrases within active copy sources, then inspect matches contextually. Do not ban ordinary words, internal identifiers, user text, historical documents, or deliberate search aliases.
- All relevant surfaces agree: navigation, headers, search, accessibility, help references, confirmations, notifications, and new generated output. CMS-managed help changes remain reviewable drafts until publishing is separately authorized.
- Existing calculations, navigation targets, permissions, badges, side effects, analytics, persisted values, and legal/financial meanings are unchanged.
- Required tests/builds and task walkthroughs pass; independent review findings are resolved or explicitly accepted by the decision owner.
- Founder handoff includes a before/after walkthrough, completed mapping, audience exceptions, test evidence, and any outstanding device/CMS/release dependencies.

The practical order is **contract → shared foundation → designer workflows → other portals and Field work → Field capture → integrated review**. This prevents five independently invented versions of Direction C.

## 8. Release boundary

This request authorizes planning, not app implementation or production rollout. No application code is changed by this document.

After implementation approval, prepare reviewed changes and previews. Production release requires an explicit shipping request. Portal releases use `./infra/deploy-portal.sh <name>` with required package rebuilds—never the retired infrastructure or a direct OpenNext build shortcut. Field distribution/TestFlight is a separate release step using the applicable release procedures. Coordinate web/Field/help availability so references remain understandable while users still have an older app.

No database migration is expected. Any discovered need for a schema, state, behavior, or permission change is a separate proposal, not part of this labeling rollout.
