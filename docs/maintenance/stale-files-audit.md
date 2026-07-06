# Stale / Removable Files Audit — Patina monorepo

> **Generated:** 2026-07-02 · **Method:** 14 parallel review agents using Serena's symbol/reference analysis (`find_referencing_symbols`) + filesystem heuristics, followed by an adversarial verification pass (each risky candidate re-checked by an agent trying to *prove the file is still used*). 36 agents total, 0 errors.
>
> ### ⛔ Nothing here has been deleted. This is a review list only.
>
> **Hard exclusions applied (never flagged):** `supabase/migrations/**` (append-only history), Next.js App Router convention files (`page`/`layout`/`route`/`loading`/`error`/`middleware`/…), config files, package entry points, seed files, current docs.
>
> **Before mass-deleting Tier 2 orphaned code:** these are LSP-verified as having zero references, but a large TS monorepo has dynamic imports, path aliases, and string-based lookups an LSP can miss. Do a final `git grep <basename>` per file (or delete a folder, run `pnpm build && pnpm type-check`, and check nothing breaks) before committing removals.

## Confidence tiers

| Tier | Meaning | Action |
|------|---------|--------|
| **Tier 1 — Junk** | Backups, compiled build output, temp/state files. Zero code impact. | Safe to `git rm` now. |
| **Tier 2 — Verified dead** | Orphaned/superseded/duplicate/abandoned, and the adversarial verifier confirmed *safe to remove*. | Remove after a quick spot-check. |
| **Tier 3 — Review** | Flagged stale but NOT adversarially cleared (or intentionally retained, e.g. versioned spec history). | Human decision required. |
| **Excluded** | Flagged by a finder but the verifier proved it IS used — listed for transparency. | Keep. |

## Headline counts

| Tier | Files |
|------|-------|
| excluded | 20 |
| tier1-junk | 31 |
| tier2-verified | 246 |
| tier3-review | 76 |

## ⚠ Do first — secrets/state hygiene (local, mostly untracked)

These are **not** committed (good), but sit in your working tree. The `.env.bak*` pair is **not gitignored**, so it's one `git add .` away from leaking secrets.

| File | Git status | Recommend |
|------|-----------|-----------|
| `infra/.env.bak-anon-sync-20260513-040723` | untracked, **not gitignored** | delete locally + add `infra/*.bak*` to `.gitignore` |
| `infra/.env.env.bak.20260512-084926` | untracked, **not gitignored** | delete locally + gitignore |
| `infra/secrets.txt` | untracked, gitignored | delete locally when no longer needed |
| `infra/.env.swp` | untracked, gitignored | delete (stray vim swap) |
| `docs/design/the-document/.fuse_hidden0000000500000001` | untracked, not-ignored | delete (FUSE temp file) |
| `.build/`, `.serena/` (working tree) | untracked | build/tool caches — add to `.gitignore` |

## Tier 1 — Unambiguous junk (safe to remove)

### 1a. Backup files
| File | Git status |
|------|-----------|
| `apps/designer-portal/Dockerfile.bak` | tracked |
| `apps/admin-portal/Dockerfile.bak` | tracked |
| `apps/client-portal/Dockerfile.bak` | tracked |
| `services/orders/prisma/schema.prisma.backup` | tracked |
| `services/projects/prisma/schema.prisma.backup` | tracked |

### 1b. Compiled TypeScript output committed into `src/`/`test/` (largest cleanup)

`tsc` output (`.js`, `.d.ts`, `.js.map`, `.d.ts.map`) was accidentally committed **alongside the `.ts` sources**. The real build goes to `dist/` (which *is* gitignored). These are stale — e.g. `services/projects/src/app.module.js` is older than its `.ts`. **~446 tracked files.**

| Location | Tracked compiled files | Remove with |
|----------|-----------------------|-------------|
| `services/projects/src/**` (excl. `generated/`) | **370** | `git rm` the `.js`/`.d.ts`/`.js.map`/`.d.ts.map` under `src/` |
| `services/media/src/**` (excl. `generated/`) | 23 | same |
| `services/media/test/**` | 12 | same |
| `services/projects/test/**` | 8 | same |
| `services/projects/prisma/seed.{js,d.ts,js.map,d.ts.map}` | 4 | `git rm` (keep `seed.ts`) |
| `packages/patina-design-system/*.{js,d.ts,map}` (compiled config beside `.ts`) | 16 | `git rm` (keep the `.ts` configs) |
| `packages/cache/**/*.d.ts.map` in `src/`/`test/` | 4 | `git rm` |
| `apps/admin-portal/src/**/*.test.d.ts.map` | 4 | `git rm` |
| `apps/designer-portal/e2e/**/*.d.ts.map` | 5 | `git rm` |
| `services/orders/src/**` | 0 (clean — reference for the others) | — |

> After removing, add `**/*.js.map`, `**/*.d.ts`, `**/*.d.ts.map` (or per-service `src/**/*.js`) to the relevant `.gitignore` so tsc output stops leaking back in.

### 1c. Tracked temp / local-state files
| File | Why |
|------|-----|
| `apps/designer-portal/.test-summary.txt` | committed test-run output |
| `supabase/.branches/_current_branch` | Supabase CLI local state (should be gitignored) |
| `apps/mobile/Patina/Patina.xcodeproj/xcuserdata/.../xcschememanagement.plist` | per-user Xcode state |

## Tier 2 — Verified dead (adversarially confirmed "safe to remove")

### 2a. Abandoned feature modules / dirs (whole units)

- `apps/designer-portal/src/components/collaboration/CollaborationPresence.tsx` — Real-time presence widget; only consumer of the dead lib/projects-websocket.ts. Not wired to any page.
- `apps/designer-portal/src/components/collections` — Collections UI folder fully dead: collection-card/hero/stats, collection-*-form, create-collection-modal, rule-builder, index.ts.
- `apps/designer-portal/src/components/crm` — CRM widgets fully dead: ClientKanbanBoard, HealthScoreTrendChart, MLPredictionsPanel.
- `apps/designer-portal/src/components/email-builder` — Entire email-template-builder feature is dead: EmailTemplateBuilder + BlockPalette/BuilderCanvas/PreviewPane/etc + all 11 props-forms + constants.ts + index.ts.
- `apps/designer-portal/src/components/vendors` — Legacy vendor UI folder, entirely superseded. All 17 files orphaned, incl. duplicate pairs review-modal.tsx/ReviewModal.tsx and vendors-provider.tsx/VendorsProv
- `apps/designer-portal/src/features/catalog` — Whole feature module (index.ts barrel, components/, hooks/, types.ts) never wired into any route — only its own colocated tests reference the pieces.
- `apps/mobile/Patina/backend` — A teenybase (Cloudflare Workers + D1) backend starter that was never wired up. The Patina iOS app is Supabase-only, and Patina/CLAUDE.md explicitly says 'Never 
- `packages/types/src/graphql/crm.graphql` — A GraphQL schema file in a Supabase-first repo with no GraphQL codegen tooling or consumer. Pairs with the never-wired crm.ts.
- `services/media/src/modules/media/media-refactored.module.ts` — Root of an abandoned parallel 'hexagonal' rewrite of the media module (MediaRefactoredModule). Never imported into app.module.ts or any other module; it is the 
- `services/media/src/modules/storage/storage.module.ts` — StorageModule (multi-provider abstraction). Never imported into app.module.ts or any live module; sole importer of multi-storage + r2/s3 providers. The live obj
- `services/media/src/modules/transform/transform.module.ts` — TransformModule bundling image-optimization/smart-crop/duplicate-detection/image-analysis. Never imported anywhere; the live ImageTransformService is registered
- `services/orders/src/modules/orders/orders-refactored.controller.ts` — Controller of the abandoned Repository-Pattern rewrite; only referenced by the orphaned orders-refactored.module.ts.
- `services/orders/src/modules/orders/orders-refactored.module.ts` — Entry point of an abandoned Repository-Pattern rewrite of the orders module; never imported by AppModule (which wires OrdersModule instead).
- `services/projects/src/projects/projects-refactored.module.ts` — Entry point of an abandoned DDD/Repository-Pattern rewrite of the projects module; never imported by AppModule (which wires ProjectsModule instead).
- `services/projects/src/projects/projects-refactored.service.ts` — Service of the abandoned rewrite; only referenced by the orphaned projects-refactored.module.ts.
- `supabase/functions/emergence-recommend/` — Complete edge function returning product recommendations (EmergingPiece[]), but its name is never invoked. The live iOS emergence feature fetches recommendation

> These pull in most of the Tier 2 orphaned files below (e.g. the whole `components/vendors`, `components/collections`, `components/crm`, `features/catalog` trees, and the three `*-refactored` service rewrites).

### 2b. Orphaned code files (Serena: zero references; verifier confirmed)

_Grouped by review territory. Count per group in parentheses._

#### client-portal (10)
- `apps/client-portal/src/components/timeline/__tests__/celebration-overlay.test.tsx` — Test whose subject-under-test (celebration-overlay.tsx) is orphaned; flag alongside the subject per audit rules.
- `apps/client-portal/src/components/timeline/celebration-overlay.tsx` — Only referenced by the unused timeline barrel (index.ts) and its own test. The barrel is imported nowhere; enhanced-time
- `apps/client-portal/src/components/timeline/index.ts` — Timeline barrel that is imported nowhere and re-exports only dead components (celebration-overlay + mobile-timeline-wrap
- `apps/client-portal/src/components/timeline/milestone-card.tsx` — Only importer is the orphaned project-timeline.tsx; transitively dead.
- `apps/client-portal/src/components/timeline/milestone-decisions.tsx` — Only importer is milestone-card.tsx, which is itself only reachable from the orphaned project-timeline.tsx; transitively
- `apps/client-portal/src/components/timeline/mobile-timeline-wrapper.tsx` — Only referenced by the unused timeline barrel (index.ts). Barrel imported nowhere; enhanced-timeline (live) does not use
- `apps/client-portal/src/components/timeline/project-timeline.tsx` — Root of a dead timeline subtree. The live in-app timeline is enhanced-timeline.tsx (rendered via project-view-wrapper); 
- `apps/client-portal/src/hooks/use-progress-analytics.ts` — Timeline progress/health/analytics-tracking hooks (useProgressAnalytics/useHealthIndicators/useTimelineViewTracking/useM
- `apps/client-portal/src/hooks/use-touch-gestures.ts` — Only consumer is the dead mobile-timeline-wrapper.tsx; transitively dead.
- `apps/client-portal/src/lib/api-client-server.ts` — Server-side NestJS projects API client (serverFetch/serverProjectsApi). Superseded when client-portal projects were repo

#### designer-app-routes (1)
- `apps/designer-portal/src/app/font-config.ts` — Module exporting `inter`/`playfair` next/font/google definitions with a DISABLE_REMOTE_FONTS fallback path, but nothing 

#### designer-lib (71)
- `apps/designer-portal/src/components/auth/index.ts` — Dead barrel re-exporting the orphaned auth-guard components; nothing imports the barrel.
- `apps/designer-portal/src/components/auth/protected-component.tsx` — Legacy auth-guard component; unreferenced (QR auth components in this folder are still live).
- `apps/designer-portal/src/components/auth/protected-route.tsx` — Legacy auth-guard; referenced only by the dead components/auth/index.ts barrel.
- `apps/designer-portal/src/components/auth/protected.tsx` — Legacy auth-guard; referenced only by the dead components/auth/index.ts barrel.
- `apps/designer-portal/src/components/auth/rate-limit-banner.tsx` — Unreferenced; sole consumer of dead lib/auth/rate-limit-handler.ts.
- `apps/designer-portal/src/components/auth/require-auth.tsx` — Legacy auth-guard; referenced only by the dead components/auth/index.ts barrel.
- `apps/designer-portal/src/components/auth/user-avatar.tsx` — Legacy auth avatar; unreferenced.
- `apps/designer-portal/src/components/catalog` — 12 orphaned legacy catalog components: back-to-top, category-tree-selector, delete-product-dialog, duplicate-detection-p
- `apps/designer-portal/src/components/communications/PreSendChecklist.tsx` — Only file in components/communications and it is orphaned; app communications pages do not import it.
- `apps/designer-portal/src/components/dashboards/DesignerAnalyticsDashboard.tsx` — Analytics dashboard never mounted; its only dependents are the 3 dead local ui/ shims.
- `apps/designer-portal/src/components/error-boundary.tsx` — Local error-boundary component; unreferenced (app uses app/error.tsx convention / design-system).
- `apps/designer-portal/src/components/layout/nav.tsx` — Legacy nav component (sole file in components/layout); unreferenced.
- `apps/designer-portal/src/components/leads/lead-room-scans.tsx` — Lead room-scan widget; unreferenced (both files in components/leads are dead).
- `apps/designer-portal/src/components/leads/shared-scan-badge.tsx` — Shared-scan badge; unreferenced.
- `apps/designer-portal/src/components/media` — Media components (image-with-fallback, image-zoom, media-badges, product-gallery, index.ts) are reachable only via their
- `apps/designer-portal/src/components/navigation/PrimaryNav.tsx` — Legacy primary nav (sole file in components/navigation); unreferenced.
- `apps/designer-portal/src/components/portal/catalog-refine-bar.tsx` — Orphaned portal component (9 of 92 in components/portal are dead legacy).
- `apps/designer-portal/src/components/portal/date-divider.tsx` — Orphaned portal date-divider; unreferenced.
- `apps/designer-portal/src/components/portal/editable-field.tsx` — Orphaned portal editable-field; unreferenced.
- `apps/designer-portal/src/components/portal/inbox-bell.tsx` — Orphaned portal inbox-bell; unreferenced.
- `apps/designer-portal/src/components/portal/procurement/order-via-patina.tsx` — Orphaned procurement component; unreferenced.
- `apps/designer-portal/src/components/portal/product-card.tsx` — Orphaned portal product-card; unreferenced.
- `apps/designer-portal/src/components/portal/product-list-item.tsx` — Orphaned portal product-list-item; unreferenced.
- `apps/designer-portal/src/components/portal/project-detail/client-view-toggle.tsx` — Orphaned project-detail client-view toggle; unreferenced.
- `apps/designer-portal/src/components/portal/quick-reply-bar.tsx` — Orphaned portal quick-reply-bar; unreferenced.
- `apps/designer-portal/src/components/portal/status-dot.tsx` — Orphaned portal status-dot; unreferenced.
- `apps/designer-portal/src/components/portal/tier-badge.tsx` — Orphaned portal tier-badge; unreferenced.
- `apps/designer-portal/src/components/product-detail/gallery-thumbnail.tsx` — Orphaned product-detail sub-component (3 of 15 in folder are dead).
- `apps/designer-portal/src/components/product-detail/model-viewer.tsx` — Orphaned product-detail 3D model viewer; unreferenced.
- `apps/designer-portal/src/components/product-detail/rich-text-field.tsx` — Orphaned product-detail rich-text field; unreferenced.
- `apps/designer-portal/src/components/products/product-creation-wizard.tsx` — Old product creation wizard; unreferenced. Sole importer of dead lib/permissions.ts.
- `apps/designer-portal/src/components/products/product-editor-modal.tsx` — Old product editor modal; unreferenced.
- `apps/designer-portal/src/components/products/product-filters.tsx` — Old product filters component; sole consumer of dead types/product-filters.ts.
- `apps/designer-portal/src/components/products/tabs` — Product-editor tab set fully dead: details/inventory/media/pricing/seo tabs + index.ts.
- `apps/designer-portal/src/components/products/validation-issues-panel.tsx` — Product validation panel; unreferenced.
- `apps/designer-portal/src/components/rooms/associated-room-scans.tsx` — Top-level rooms scan component (NOT the live rooms/viewer subtree); unreferenced.
- `apps/designer-portal/src/components/rooms/room-scan-detail.tsx` — Top-level rooms scan-detail component; unreferenced.
- `apps/designer-portal/src/components/rooms/room-scans-list.tsx` — Top-level rooms scan-list component; unreferenced.
- `apps/designer-portal/src/components/rooms/viewer/controls/index.ts` — Dead barrel: the live viewer imports the control components directly, not via this index.
- `apps/designer-portal/src/components/shell/PageHeader.tsx` — Legacy shell page header; unreferenced (shell now via design-system/document surfaces).
- `apps/designer-portal/src/components/shell/WorkstreamBoard.tsx` — Legacy workstream board; unreferenced.
- `apps/designer-portal/src/components/teaching` — 4 orphaned legacy teaching widgets: EmbeddedTeaching, ImpactStats, QuickTeachModal, TeachingModeCard. Teaching zone unde
- `apps/designer-portal/src/components/timeline` — Timeline components (MilestoneCard, ProjectTimeline) + index.ts reachable only via tests; no production importer.
- `apps/designer-portal/src/components/ui/badge.tsx` — Legacy local UI shim; used only by the dead DesignerAnalyticsDashboard. App uses @patina/design-system.
- `apps/designer-portal/src/components/ui/card.tsx` — Legacy local UI shim; used only by the dead DesignerAnalyticsDashboard.
- `apps/designer-portal/src/components/ui/progress.tsx` — Legacy local UI shim; used only by the dead DesignerAnalyticsDashboard.
- `apps/designer-portal/src/hooks/use-categories.ts` — Categories hook never consumed.
- `apps/designer-portal/src/hooks/use-intersection-observer.ts` — Utility hook never consumed.
- `apps/designer-portal/src/hooks/use-keyboard-navigation.ts` — Utility hook never consumed.
- `apps/designer-portal/src/hooks/use-orders.ts` — Data hook never consumed (orders data comes via other layer).
- `apps/designer-portal/src/hooks/use-profile.ts` — Profile hook never consumed.
- `apps/designer-portal/src/hooks/use-project-subscription.ts` — Realtime project-subscription hook; consumes dead lib/projects-websocket.ts and is itself unreferenced.
- `apps/designer-portal/src/hooks/use-pull-to-refresh.ts` — Utility hook never consumed.
- `apps/designer-portal/src/hooks/use-sessions.ts` — Sessions hook never consumed.
- `apps/designer-portal/src/hooks/use-style-profile.ts` — Style-profile hook never consumed.
- `apps/designer-portal/src/hooks/use-swipe-gesture.ts` — Utility hook never consumed.
- `apps/designer-portal/src/lib/analytics/nomination-events.ts` — Analytics event helpers; unreferenced (no static or string caller).
- `apps/designer-portal/src/lib/api-client-server.ts` — Server API client; used only by the dead api-client-updated.ts.
- `apps/designer-portal/src/lib/auth-utils.ts` — Auth utility wrapper around dead lib/auth.ts; unreferenced.
- `apps/designer-portal/src/lib/auth.ts` — Legacy auth() helper; used only by the dead lib/auth-utils.ts (and one code comment).
- `apps/designer-portal/src/lib/auth/rate-limit-handler.ts` — Only file in lib/auth; used only by the dead auth/rate-limit-banner.tsx.
- `apps/designer-portal/src/lib/catalog-cache.ts` — Catalog cache util; unreferenced.
- `apps/designer-portal/src/lib/debounce.ts` — Local debounce util; unreferenced (design-system/utils cover this).
- `apps/designer-portal/src/lib/permissions.ts` — Permissions helper; consumed only by the dead product-creation-wizard.tsx (the api/admin/permissions route hit was a bas
- `apps/designer-portal/src/lib/projects-websocket.ts` — WebSocket client; only referrers are the dead CollaborationPresence.tsx and use-project-subscription.ts.
- `apps/designer-portal/src/providers/react-query-provider.tsx` — Unused React Query provider; the app root wires a different provider.
- `apps/designer-portal/src/stores/campaign-wizard-store.ts` — Campaign wizard store; unreferenced (tied to dead comms/email-builder surfaces).
- `apps/designer-portal/src/stores/campaigns-store.ts` — Campaigns store; unreferenced.
- `apps/designer-portal/src/stores/template-builder-store.ts` — Template-builder store; unreferenced (tied to dead email-builder).
- `apps/designer-portal/src/stores/vendors-store.ts` — Zustand store used only by the dead components/vendors cluster.
- `apps/designer-portal/src/types/product-filters.ts` — Type module used only by the dead products/product-filters.tsx.

#### extension (6)
- `apps/extension/src/components/ImageCarousel.tsx` — Old multi-image carousel component, superseded by the ImageSelectSheet overlay in the T-01 rebuild. No live path from an
- `apps/extension/src/components/ProposalTargetSelector.tsx` — Intended proposal-target picker (a 'mirror' of the live DecisionTargetSelector) that was never wired into any sheet/scre
- `apps/extension/src/components/StyleChips.tsx` — Style-chip UI component with no importers; current flows use CertificationChips (live) instead.
- `apps/extension/src/components/VendorCard.tsx` — Old vendor-display component; the live vendor flow (VendorScreen) uses VendorCaptureForm instead. No references.
- `apps/extension/src/components/VendorInlineForm.tsx` — Old inline vendor form; superseded by VendorCaptureForm (used by VendorScreen). No references.
- `apps/extension/src/components/VendorSelector.tsx` — Old vendor-selection component with no importers; current architecture uses VendorScreen + VendorCaptureForm.

#### mobile-ios (25)
- `apps/mobile/Patina/Patina/Core/Models/UserMode.swift` — UserMode (guest/authenticated) + UserContext model, never referenced — appears to be an early guest-mode auth model that
- `apps/mobile/Patina/Patina/Design/Accessibility/AccessibleHitTarget.swift` — AccessibleHitTargetModifier + .accessibleHitTarget() convenience modifier, never used.
- `apps/mobile/Patina/Patina/Design/Components/CompanionSafeArea.swift` — Extension-only file exposing a .companionSafeArea() View modifier that is never applied.
- `apps/mobile/Patina/Patina/Design/Components/PatinaCard.swift` — Design-system card component (PatinaCard, PatinaCardStyle, CardShadow) never used by any screen.
- `apps/mobile/Patina/Patina/Design/Components/PatinaEmptyState.swift` — Design-system empty-state View never referenced.
- `apps/mobile/Patina/Patina/Design/Components/PatinaSheetHeader.swift` — Design-system sheet-header View never referenced.
- `apps/mobile/Patina/Patina/Design/Components/PatinaStatusBadge.swift` — Design-system status badge View never referenced.
- `apps/mobile/Patina/Patina/Design/Gestures/CompanionPullGesture.swift` — CompanionLongPressDragModifier/CompanionSwipeDownModifier and their .companionSwipeDownGesture()/.companionTapGesture()/
- `apps/mobile/Patina/Patina/Design/Gestures/HoldGesture.swift` — HoldableModifier + public .holdable() modifier; its only inbound reference is VoiceOverTapModifier, consumed solely by t
- `apps/mobile/Patina/Patina/Design/Gestures/LingerGesture.swift` — LingerModifier/LingerRevealView/LingerDemoView + public .lingerable() modifier. No screen adopts it; part of a dead gest
- `apps/mobile/Patina/Patina/Features/Companion/Components/CompanionConversationView.swift` — CompanionConversationView/CompanionMessageBubble/CompanionTypingIndicator, unused by the live Companion UI.
- `apps/mobile/Patina/Patina/Features/Companion/Components/ContextBar.swift` — Companion ContextBar View, unused by the live Companion UI.
- `apps/mobile/Patina/Patina/Features/Companion/Components/InputBar.swift` — Companion InputBar/VoiceButton Views. The live Companion entry point (CompanionOverlay) does not reference them; superse
- `apps/mobile/Patina/Patina/Features/Companion/Components/PulseAnimation.swift` — Companion PulseAnimation View, unused by the live Companion UI.
- `apps/mobile/Patina/Patina/Features/Companion/Components/QuickActionsBar.swift` — Companion QuickActionsBar/QuickActionChip/ContextIndicator/CompanionNotificationBanner Views, unused.
- `apps/mobile/Patina/Patina/Features/Companion/Services/NotificationManager.swift` — Companion NotificationManager + MockNotifications, never instantiated.
- `apps/mobile/Patina/Patina/Features/Companion/Views/CompanionAuthPanel.swift` — CompanionAuthPanel View, unused.
- `apps/mobile/Patina/Patina/Features/Companion/Views/CompanionSheet.swift` — CompanionSheet/QuickActionButton Views; superseded by CompanionOverlay presentation.
- `apps/mobile/Patina/Patina/Features/Decisions/DecisionPushHandler.swift` — DecisionPushHandler/DecisionPush/DecisionPushType push-notification handler, never wired.
- `apps/mobile/Patina/Patina/Features/Help/HelpModule.swift` — Contains only HelpModuleVersion, a 'module marker' version-string enum from Help Sprint-1 G1 that no consumer ever reads
- `apps/mobile/Patina/Patina/Features/QRAuth/Models/DevicePairModels.swift` — DevicePairExchangeRequest/Response/Session models for QR device pairing, never referenced.
- `apps/mobile/Patina/Patina/Features/Walk/Components/WalkProgressIndicator.swift` — WalkProgressIndicator/WalkProgressBar Views, unused by the Walk flow.
- `apps/mobile/Patina/Patina/Features/Walk/Views/WalkErrorView.swift` — WalkErrorOverlay View + WalkError type, unused by the Walk flow.
- `apps/mobile/Patina/Patina/Services/Analytics/DwellTracker.swift` — DwellTracker analytics helper, never instantiated.
- `apps/mobile/Patina/Patina/Services/Analytics/InteractionTracker.swift` — InteractionTracker analytics helper, never instantiated.

#### packages-data (12)
- `packages/api-client/src/auth.ts` — AuthApi legacy shim over the dead ApiClient; index.ts re-exports it 'for backwards compatibility' but nothing consumes i
- `packages/api-client/src/client.ts` — Legacy axios-based ApiClient (posts to /auth/login, /users, /products NestJS REST endpoints that don't exist in the Supa
- `packages/api-client/src/clients/media.client.ts` — MediaApiClient is exported from the api-client barrel but no consumer (admin/client/designer portal api-client.ts files)
- `packages/api-client/src/clients/notifications.client.ts` — NotificationsApiClient is exported from the api-client barrel but no consumer instantiates it.
- `packages/api-client/src/products.ts` — ProductsApi legacy shim over the dead ApiClient; barrel back-compat re-export with no consumers.
- `packages/api-client/src/users.ts` — UsersApi legacy shim over the dead ApiClient; barrel back-compat re-export with no consumers.
- `packages/types/src/crm.ts` — A whole CRM domain type module (ClientProfileV2, Customer360View, HouseholdMember, FinancialInfo, etc.) that was never w
- `packages/utils/src/error-tracking` — Entire Sentry error-tracking module (sentry.ts + index.ts). Deliberately excluded from the @patina/utils barrel (comment
- `packages/utils/src/logging` — Winston StructuredLogger module (logger.ts + index.ts). Commented out of the utils barrel and no subpath export, so unre
- `packages/utils/src/performance` — web-vitals performance module (web-vitals.ts + index.ts). Re-exported via the main @patina/utils barrel but none of its 
- `packages/utils/src/presence` — localStorage presence module. It IS re-exported via the main @patina/utils barrel (so technically public API), but none 
- `packages/utils/src/websocket` — WebSocket hooks/util module (index.ts, useWebSocket.ts, useOptimisticUpdate.ts, connection-monitor.ts). Commented out of

#### packages-ui (26)
- `packages/catalog-ui/src/components/destination-picker.tsx` — Exported both from the catalog-ui barrel AND via a dedicated package.json subpath (./destination-picker) yet consumed no
- `packages/help-system/src/reference/VideoPlayer/` — Reference-layer VideoPlayer exported from the help-system barrel but never imported by any app (distinct from the also-u
- `packages/patina-design-system/src/components/AceternitySidebar/` — Exported from barrel (Sidebar was commented out in favor of it), yet never consumed.
- `packages/patina-design-system/src/components/AuthLayout/` — Exported from barrel, never consumed (AuthForm is separate and is used).
- `packages/patina-design-system/src/components/Blockquote/` — Exported from barrel, never consumed.
- `packages/patina-design-system/src/components/Breadcrumbs/` — Exported from barrel, never consumed (designer-portal uses its own breadcrumb resolver).
- `packages/patina-design-system/src/components/ChangeOrderCard/` — Project-management card exported from barrel, never consumed in code.
- `packages/patina-design-system/src/components/ColorSwatch/` — Exported from barrel, never consumed (not even used by the color pickers).
- `packages/patina-design-system/src/components/DesignerMessage/` — Only referenced by the non-exported examples demo file; no real consumer.
- `packages/patina-design-system/src/components/FileUpload/` — Exported from barrel but consumed by no app; code usage limited to the orphan useFormIntegration.ts demo and one Progres
- `packages/patina-design-system/src/components/IssueCard/` — Project-management card exported from barrel, never consumed in code.
- `packages/patina-design-system/src/components/Navbar/` — Exported from barrel, never consumed (apps use their own nav).
- `packages/patina-design-system/src/components/PinInput/` — Exported from barrel but consumed by no app; only code usage is the orphan useFormIntegration.ts demo. (May be intended 
- `packages/patina-design-system/src/components/ProgressPhotography/` — Only referenced by the non-exported examples demo file; no real consumer.
- `packages/patina-design-system/src/components/ProgressRing/` — Exported from barrel, never consumed (ProgressBar is the used one).
- `packages/patina-design-system/src/components/ProjectStatusBadge/` — Only referenced by TaskCard (itself an orphan); transitively dead.
- `packages/patina-design-system/src/components/RFICard/` — Project-management card exported from barrel, never consumed in code.
- `packages/patina-design-system/src/components/Radio/` — Form primitive exported from barrel but consumed by no app; its only code usage is the orphaned useFormIntegration.ts de
- `packages/patina-design-system/src/components/Sidebar/` — Its barrel export line is commented out ('to avoid conflict with AceternitySidebar'); dir is dead (and AceternitySidebar
- `packages/patina-design-system/src/components/StyleQuizCard/` — Exported from barrel, never consumed. Pulls DragDrop internally, which is otherwise unused.
- `packages/patina-design-system/src/components/TaskBoard/` — Exported from barrel, never consumed. (Internally pulls TaskCard which is otherwise unused.)
- `packages/patina-design-system/src/components/TaskCard/` — Only referenced by TaskBoard (itself an orphan); no app/package consumes it. Transitively dead.
- `packages/patina-design-system/src/components/UserProfileCard/` — Exported from barrel, never consumed.
- `packages/patina-design-system/src/components/VirtualList/` — Component exported from the DS barrel but never imported/re-exported by any app or package. Whole directory (component +
- `packages/patina-design-system/src/components/examples/CompleteMilestoneJourney.example.tsx` — Standalone demo (.example.tsx) not exported from any barrel, not matched by Storybook glob (*.stories.*/*.mdx only), and
- `packages/patina-design-system/src/hooks/useFormIntegration.ts` — Demo/example file masquerading as a hook: exports CompleteFormExample() (returns JSX) and a formIntegrationExample strin

#### services-media-aesthete (24)
- `services/media/src/application/services/media-storage.service.ts` — Part of the dead media-refactored hexagonal layer; only imported by media-refactored.module/service.
- `services/media/src/application/services/media-transformation.service.ts` — Part of the dead media-refactored hexagonal layer; only imported by media-refactored.module/service.
- `services/media/src/application/services/media-upload.service.ts` — Part of the dead media-refactored hexagonal layer; only imported by media-refactored.module/service.
- `services/media/src/config/cdn.config.ts` — Exports cdnConfig/cachePolicies/r2Pricing/terraformCloudFrontConfig/etc. None are imported anywhere (the live CDN code l
- `services/media/src/domain/repositories/media.repository.interface.ts` — IMediaRepository/MEDIA_REPOSITORY token used only by the dead application/services and media-refactored.module.
- `services/media/src/domain/services/media-metadata-extractor.service.spec.ts` — Test for the orphaned metadata-extractor; flag with its subject.
- `services/media/src/domain/services/media-metadata-extractor.service.ts` — MediaMetadataExtractorService used only by dead media-upload.service + media-refactored.module (distinct from the LIVE m
- `services/media/src/domain/validators/media.validator.spec.ts` — Test for the orphaned MediaValidator; flag with its subject.
- `services/media/src/domain/validators/media.validator.ts` — MediaValidator used only by the dead application/services and media-refactored.*.
- `services/media/src/infrastructure/repositories/prisma-media.repository.spec.ts` — Test for the orphaned PrismaMediaRepository; flag with its subject.
- `services/media/src/infrastructure/repositories/prisma-media.repository.ts` — PrismaMediaRepository bound only in the dead media-refactored.module.
- `services/media/src/modules/media/media-refactored.service.ts` — MediaRefactoredService, only referenced by the dead media-refactored.module.ts. Duplicate of the live media.service.ts.
- `services/media/src/modules/storage/multi-storage.service.ts` — MultiStorageService only registered in the dead storage.module.ts.
- `services/media/src/modules/storage/providers/r2-storage.provider.ts` — R2StorageProvider only imported by the dead storage.module.ts.
- `services/media/src/modules/storage/providers/s3-storage.provider.ts` — S3StorageProvider only imported by the dead storage.module.ts.
- `services/media/src/modules/storage/storage-provider.interface.ts` — IStorageProvider implemented only by the orphaned r2/s3 providers; the live oci-storage.service.ts does NOT import it.
- `services/media/src/modules/transform/duplicate-detection.service.spec.ts` — Test for the orphaned DuplicateDetectionService; flag with its subject.
- `services/media/src/modules/transform/duplicate-detection.service.ts` — Referenced only by the dead transform.module.ts and the dead image-processing.worker.ts.
- `services/media/src/modules/transform/image-analysis.service.ts` — Referenced only by the dead transform.module.ts and the dead image-processing.worker.ts (no spec).
- `services/media/src/modules/transform/image-optimization.service.spec.ts` — Test for the orphaned ImageOptimizationService; flag with its subject.
- `services/media/src/modules/transform/image-optimization.service.ts` — Referenced only by the dead transform.module.ts and the dead image-processing.worker.ts.
- `services/media/src/modules/transform/smart-crop.service.spec.ts` — Test for the orphaned SmartCropService; flag with its subject.
- `services/media/src/modules/transform/smart-crop.service.ts` — Referenced only by the dead transform.module.ts and the dead image-processing.worker.ts.
- `services/media/src/workers/image-processing.worker.ts` — Standalone worker never imported and never invoked: Dockerfile.worker CMD and package.json worker:transform/worker:3d po

### 2c. Superseded docs (verified replaced / obsolete)

- `CATALOG-ISSUES-CYCLE-1.md` — One-off 'Product Catalog Test Cycle 1' QA issue list (April 2026). Root-level clutter; issues are marked FIXED/landed and there wa
- `_test_reports/` — Directory of 7 stale one-off manual test/QA reports from April 2026. Includes explicit version progression (designer-portal-client
- `apps/client-portal/CSP_FIX_SUMMARY.md` — One-off report of the Cloudflare-Insights CSP fix. Point-in-time artifact, one of three docs covering the same single fix.
- `apps/client-portal/FRONTEND_FIXES_SUMMARY.md` — Point-in-time report of frontend issues fixed after a Playwright run. Historical snapshot, not ongoing docs.
- `apps/client-portal/IMPLEMENTATION_SUMMARY.md` — 'Security Implementation Summary' whose stated objective is the same Cloudflare-Insights CSP fix. Point-in-time completion report 
- `apps/client-portal/ISSUES-CYCLE-1.md` — QA 'Test Cycle 1' issue list (42 cases, pass/fail counts). Point-in-time test-cycle report from a single run.
- `apps/client-portal/WEBSOCKET_FIX_SUMMARY.md` — One-off report of a past websocket-connection fix (stub implementation). Historical snapshot; the living reference is WEBSOCKET_SE
- `apps/client-portal/src/components/error-fallback.tsx` — Deprecated re-export shim: just re-exports ErrorFallback/LoadingFallback/EmptyStateFallback from @patina/design-system. Header say
- `apps/designer-portal/API_INTEGRATION_ANALYSIS_REPORT.md` — Historical one-off API-integration status report from the 2026-03-08 initial dump; not current documentation.
- `apps/designer-portal/API_INTEGRATION_COMPLETE.md` — Historical 'integration complete' status report; superseded.
- `apps/designer-portal/AUTHENTICATION_DELIVERY_STATUS.md` — Historical auth delivery-status report; superseded (auth is Supabase-only now).
- `apps/designer-portal/AUTHENTICATION_IMPLEMENTATION_SUMMARY.md` — Historical auth implementation summary; superseded.
- `apps/designer-portal/BLOCKER_002_RESOLUTION_PLAN.md` — One-off blocker resolution plan; a resolved historical artifact.
- `apps/designer-portal/BUNDLE_OPTIMIZATION_REPORT.md` — One-off bundle-optimization report; historical.
- `apps/designer-portal/CATALOG_TEST_ISSUES.md` — One-off catalog test-issues log; historical (catalog superseded by library).
- `apps/designer-portal/DELIVERY_REPORT.md` — One-off delivery report; historical status artifact.
- `apps/designer-portal/EXECUTIVE_SUMMARY.md` — One-off executive summary; historical status artifact.
- `apps/designer-portal/FOXTROT2_MISSION_SUMMARY.md` — Agent 'mission summary' report; clearly a one-off historical artifact.
- `apps/designer-portal/IMPLEMENTATION_QUICKSTART.md` — One-off implementation quickstart; historical.
- `apps/designer-portal/INTEGRATION_TEST_REPORT.md` — One-off integration test report; historical.
- `apps/designer-portal/NEXT_STEPS.md` — One-off next-steps note; historical.
- `apps/designer-portal/TEST-CONFIG-SUMMARY.md` — One-off test-config summary; historical.
- `apps/designer-portal/TESTING_SUMMARY.md` — One-off testing summary; historical (distinct from TESTING.md which is kept).
- `docs/product/portal-vs-desk-feature-gap-matrix.md` — Superseded v1 gap matrix (⛔ SUPERSEDED banner) under docs/product; replaced by v2 whose canonical copy lives in docs/design/the-do
- `packages/api-routes/AGENT_3_DELIVERABLE.md` — One-off agent handoff artifact ('Agent 3 Deliverable / Mission Complete') documenting a circuit-breaker implementation and NextAut
- `packages/api-routes/CIRCUIT_BREAKER.md` — Design/reference doc for a circuit-breaker feature that was intentionally not implemented in this package's proxy layer.
- `packages/patina-design-system/FORM_COMPONENTS_DELIVERY_REPORT.md` — One-off delivery report (Dec 2025) documenting form components; historical, not part of current living docs (README/QUICK_START re
- `packages/patina-design-system/MILESTONE_CELEBRATION_COMPONENTS.md` — One-off delivery/summary doc for the milestone-celebration components; historical artifact.
- `packages/types/EXPORT_VERIFICATION.md` — One-off point-in-time verification report ('All requested types are properly defined and exported... No missing exports were found
- `services/media/BULK_OPERATIONS_IMPLEMENTATION.md` — One-off 'Implementation Complete' report for bulk operations.
- `services/media/BULK_OPERATIONS_QUICK_REFERENCE.md` — One-off quick-reference companion to BULK_OPERATIONS_IMPLEMENTATION.
- `services/media/CDN_STORAGE_IMPLEMENTATION.md` — 'Team Juliet' one-off report documenting the multi-provider storage layer (storage.module + multi-storage + providers) that is now
- `services/media/CDN_STORAGE_QUICK_REFERENCE.md` — Team Juliet one-off quick-reference for the orphaned storage layer.
- `services/media/IMAGE_PROCESSING_PIPELINE.md` — Documents the transform/optimization/duplicate-detection/analysis pipeline that is now orphaned code (transform.module + worker no
- `services/media/IMPLEMENTATION_SUMMARY.md` — One-off implementation-completion report; carries a stale absolute path (/home/middle/patina/services/media) and is not linked fro
- `services/media/MEDIA_MODULE_STRUCTURE.md` — One-off 'Created Files' snapshot doc of the media module file layout, quickly stale.
- `services/media/QUICK_REFERENCE.md` — Generic service quick-start; overlaps README.md and the other one-off reports.
- `services/media/SEARCH_API_QUICK_REFERENCE.md` — 'Team Lima' one-off quick-reference report.
- `services/media/TEAM_HOTEL_FINAL_REPORT.md` — Agent-team one-off deliverable report ('Team Hotel ... Mission Complete') for the image-processing pipeline, which is now orphaned
- `services/media/TEAM_HOTEL_QUICK_REFERENCE.md` — Agent-team one-off quick-reference paired with TEAM_HOTEL_FINAL_REPORT; documents the now-orphaned transform pipeline.
- `services/orders/IMPLEMENTATION_CHECKLIST.txt` — Point-in-time build checklist for the orders service; historical dev-process artifact, not living reference.

### 2d. Duplicate files (verified)

- `apps/client-portal/CHANGES_SUMMARY.txt` — Point-in-time report titled 'CLIENT PORTAL - WEBSOCKET FIX COMPLETE'; duplicates WEBSOCKET_FIX_SUMMARY.md. Not a living doc.
- `apps/client-portal/CSP_BEFORE_AFTER.md` — Before/after diff writeup of the same Cloudflare-Insights CSP fix; redundant with CSP_FIX_SUMMARY.md / IMPLEMENTATION_SUMMARY.md.
- `apps/client-portal/QUICK_START.md` — Second quick-start guide duplicating QUICK_START_GUIDE.md (the more detailed, dated 'Team Alpha foundation' version). One of the p
- `apps/client-portal/SECURITY_QUICK_REFERENCE.md` — One of four overlapping security docs (SECURITY.md, SECURITY_README.md, SECURITY_CHECKLIST.md, SECURITY_QUICK_REFERENCE.md). Quick
- `apps/client-portal/SECURITY_README.md` — Overlaps SECURITY.md as another top-level security overview; part of the redundant 4-doc security set.
- `apps/designer-portal/src/lib/api-client-updated.ts` — Superseded variant of the live lib/api-client.ts; only imports the also-dead api-client-server.ts.
- `docs/design/Chrome ext/io-mobile-Capture/patina-mobile-ux-flow.html` — Byte-identical copy of docs/design/ios-Capture/patina-mobile-ux-flow.html, mis-nested under a 'Chrome ext' folder with a garbled '
- `docs/product/portal-vs-desk-feature-gap-matrix-v2.html` — Byte-identical copy of docs/design/the-document/portal-vs-desk-feature-gap-matrix-v2.html (canonical location).
- `docs/product/portal-vs-desk-feature-gap-matrix-v2.md` — Byte-identical copy of the canonical file in docs/design/the-document/. The superseded v1 banner in docs/product explicitly design
- `docs/product/portal-vs-desk-feature-gap-matrix.html` — Byte-identical copy of docs/design/the-document/portal-vs-desk-feature-gap-matrix.html (the superseded v1 baseline), redundantly s
- `docs/wireframes/mobile-immersive-exp-v2.html` — Byte-identical to docs/wireframes/mobile-immersive-experience.html — the '-v2' is not actually a revised version, just a redundant
- `packages/api-routes/CIRCUIT_BREAKER_SUMMARY.md` — Summary/duplicate companion of CIRCUIT_BREAKER.md, describing the same intentionally-absent feature.
- `packages/patina-design-system/src/components/DatePicker/` — Standalone DatePicker dir is superseded by the DatePicker/DateRangePicker actually defined inside Calendar/Calendar.tsx. The barre

### 2e. One-off script (verified single-use)

- `apps/designer-portal/start-dev.sh` — Ad-hoc dev launcher not referenced by package.json or docs; project uses pnpm dev:* workflows.

## Tier 3 — Review recommended (NOT auto-cleared)

Flagged as possibly stale but the verifier could not confirm removal, or they are intentionally retained. **Do not bulk-delete.**

> **Note on spec history:** `docs/design/the-document/` keeps *versioned spec cuts* (v1.3, v1.4, v1.5, …) deliberately as history (per DECISIONS.md). Most "superseded-doc" entries below are that retained history — treat as KEEP unless you're consciously pruning old spec versions.

### 3a. `apps/manufacturer-portal` — intentional pre-pilot scaffold (recommend KEEP)

7-file Sprint-3 scaffold (port 3003), depends on `@patina/supabase`, not wired into any `dev:*` script. Onboarding review judged it *pre-pilot, not abandoned*. Listed only so you can decide.

### 3b. Superseded/other docs — not verified (50)

- `apps/admin-portal/ACCESSIBILITY_COMPLIANCE_REPORT.md` — One-off compliance status report at repo root.
- `apps/admin-portal/ADMIN_CATALOG_PROJECT_COMPLETE.md` — Project-completion 'master index' status report ('All three phases delivered').
- `apps/admin-portal/ADMIN_CATALOG_TDD_SUMMARY.md` — TDD summary status report from catalog delivery batch.
- `apps/admin-portal/ADMIN_CATALOG_TEST_COMPLETION_REPORT.md` — Test-completion status report from catalog delivery batch.
- `apps/admin-portal/ADMIN_CATALOG_TEST_STRATEGY.md` — Catalog test-strategy planning doc from delivery batch.
- `apps/admin-portal/CATALOG_HOOKS_IMPLEMENTATION.md` — Implementation write-up for catalog hooks; process artifact.
- `apps/admin-portal/CATALOG_SERVICE_IMPLEMENTATION.md` — Implementation write-up for catalog service layer; process artifact.
- `apps/admin-portal/DOCUMENTATION_DELIVERY.md` — Meta 'documentation delivery' status artifact.
- `apps/admin-portal/IMPLEMENTATION_SUMMARY.md` — AI-delivery status report ('Implementation Status: MVP COMPLETE'); process artifact at repo root, superseded b
- `apps/admin-portal/MEDIA_MANAGEMENT_CHECKLIST.md` — Delivery checklist for media management feature.
- `apps/admin-portal/MEDIA_MANAGEMENT_DELIVERY_SUMMARY.md` — Delivery summary status report for media management.
- `apps/admin-portal/MEDIA_MANAGEMENT_GUIDE.md` — Media guide describing defunct OCI Object Storage flow (app now uses media service / MinIO/S3).
- `apps/admin-portal/MEDIA_MANAGEMENT_IMPLEMENTATION_COMPLETE.md` — Implementation-complete status report for media management.
- `apps/admin-portal/MEDIA_MANAGEMENT_QUICK_START.md` — Root quick-start for media management from delivery batch.
- `apps/admin-portal/MEDIA_MANAGEMENT_README.md` — Duplicate README for media-management feature at repo root.
- `apps/admin-portal/PERFORMANCE_BASELINE_REPORT.md` — One-off performance baseline report.
- `apps/admin-portal/PERFORMANCE_IMPLEMENTATION_SUMMARY.md` — Performance work implementation summary.
- `apps/admin-portal/PERFORMANCE_NEXT_STEPS.md` — Ad-hoc performance next-steps notes.
- `apps/admin-portal/PERFORMANCE_OPTIMIZATION_GUIDE.md` — Performance optimization guide from delivery batch.
- `apps/admin-portal/PERFORMANCE_OPTIMIZATION_REPORT.md` — Performance optimization status report.
- `apps/admin-portal/PHASE1_TYPE_SYSTEM_COMPLETE.md` — Phase-completion status report for type system work.
- `apps/admin-portal/PHASE_3_COMPLETION_SUMMARY.md` — Phase 3 completion summary status report.
- `apps/admin-portal/PHASE_3_PRESENTER_IMPLEMENTATION.md` — Phase 3 presenter implementation write-up.
- `apps/admin-portal/PHASE_4_COMPONENT_TREE.md` — Phase 4 component-tree delivery doc.
- `apps/admin-portal/PHASE_4_INSTALLATION.md` — Phase 4 installation notes from delivery batch.
- `apps/admin-portal/PHASE_4_QUICK_REFERENCE.md` — Phase 4 quick-reference delivery doc.
- `apps/admin-portal/PHASE_4_SUMMARY.md` — Phase 4 'Executive Summary' status report.
- `apps/admin-portal/PHASE_4_UI_IMPLEMENTATION.md` — Phase 4 UI implementation write-up.
- `apps/admin-portal/PLAYWRIGHT_TEST_REPORT.md` — One-off Playwright test run report.
- `apps/admin-portal/PRODUCT_CREATE_DIALOG_IMPLEMENTATION.md` — Implementation write-up for the product-create dialog.
- `apps/admin-portal/PRODUCT_EDIT_PAGE_DOCUMENTATION.md` — Root doc for the product-edit page from delivery batch.
- `apps/admin-portal/PRODUCT_EDIT_PAGE_IMPLEMENTATION_SUMMARY.md` — Implementation summary for the product-edit page.
- `apps/admin-portal/PRODUCT_EDIT_PAGE_QUICK_START.md` — Quick-start doc for the product-edit page.
- `apps/admin-portal/QUICK_REFERENCE.md` — Root-level quick-reference AI-delivery artifact; superseded by docs/QUICK_REFERENCE.md.
- `apps/admin-portal/QUICK_START.md` — Setup guide describing a defunct architecture (OCI Identity Domains, user-management/search backend services) 
- `apps/admin-portal/TDD_QUICK_REFERENCE.md` — TDD quick-reference from delivery batch.
- `apps/admin-portal/TEST_SUITE_DELIVERY_SUMMARY.md` — Test-suite delivery summary status report.
- `apps/admin-portal/TEST_SUMMARY.md` — One-off test summary status report.
- `apps/admin-portal/TOAST_AND_ERROR_BOUNDARY_USAGE_GUIDE.md` — Usage guide from delivery batch at repo root.
- `apps/admin-portal/TYPE_QUICK_REFERENCE.md` — Type-system quick reference from delivery batch.
- `apps/admin-portal/TYPE_SYSTEM_SUMMARY.md` — Type-system summary status report.
- `apps/admin-portal/USER_MANAGEMENT_UI_IMPLEMENTATION.md` — Implementation write-up for user-management UI.
- `apps/admin-portal/VARIANT_MANAGEMENT_CHECKLIST.md` — Delivery checklist for variant management.
- `apps/admin-portal/VARIANT_MANAGEMENT_DELIVERY_SUMMARY.md` — Delivery summary status report for variant management.
- `apps/admin-portal/VARIANT_MANAGEMENT_GUIDE.md` — Variant management guide from delivery batch.
- `apps/admin-portal/VARIANT_MANAGEMENT_QUICK_START.md` — Quick-start doc for variant management.
- `apps/admin-portal/src/app/api/auth/[...nextauth]/route.ts` — Legacy NextAuth catch-all that only returns HTTP 410 ('Auth is now handled by Supabase'); CLAUDE.md states the
- `services/orders/TASK_23_COMPLETION.md, TEAM_GOLF_IMPLEMENTATION_REPORT.md, STRIPE_INTEGRATION_COMPLETE.md, IMPLEMENTATION_SUMMARY.md, REPOSITORY_PATTERN_IMPLEMENTATION_SUMMARY.md` — Historical completion/implementation-report snapshots superseded by the shipped code (REPOSITORY_PATTERN_* eve
- `services/projects/IMPLEMENTATION_CHECKLIST.md, IMPLEMENTATION_STATUS.md, IMPLEMENTATION_SUMMARY.md, SECURITY_FIX_COMPLETE.md, TYPESCRIPT_FIXES_SUMMARY.md, TEAM_ECHO_SUMMARY.md` — Historical completion/status/fix-report snapshots for the projects service, superseded by the shipped code.
- `services/projects/PHASE_*.md (PHASE_1_COMPLETION_SUMMARY, PHASE_2_COMPLETION_SUMMARY, PHASE_2.1_COMPLETION_SUMMARY, PHASE_3_COMPLETION_SUMMARY, PHASE4_1_API_IMPLEMENTATION_COMPLETE)` — Per-phase completion snapshots from the projects service build-out; historical, superseded by current state.

### 3c. Orphaned code — unverified / uncertain (17)

- `apps/admin-portal/src/features/catalog/USAGE_EXAMPLE.tsx` — Documentation/template example (.tsx) demonstrating useAdminCatalogPresenter; not a route/convention file and 
- `apps/admin-portal/tests/e2e/projects-management.spec.ts` — Playwright spec not picked up by any runner: playwright.config testDir is './e2e' (not tests/e2e), and jest te
- `apps/client-portal/src/hooks/__tests__/use-immersive-timeline.test.tsx` — Test whose subject-under-test (use-immersive-timeline.ts) is orphaned; flag alongside the subject per audit ru
- `apps/client-portal/src/hooks/use-immersive-timeline.ts` — Only non-test consumer is the dead celebration-overlay.tsx; transitively dead.
- `apps/designer-portal/src/hooks/use-orders.ts (see also)` — DUPLICATE-ENTRY-GUARD placeholder — ignore (use-orders already listed).
- `apps/extension/src/__tests__/trade-pricing/trade-pricing.test.ts` — Test whose subject-under-test (lib/trade-pricing.ts) is itself orphaned; flagged alongside its subject per the
- `apps/extension/src/components/TradePricing.tsx` — Full 156-line trade-pricing UI component, orphaned. The live TradeRegion reimplemented a leaner trade section 
- `apps/extension/src/hooks/use-trade-account.ts` — Trade-account hook whose ONLY consumer is the orphaned TradePricing.tsx (also re-exports calculateTradePrice/f
- `apps/extension/src/lib/trade-pricing.ts` — Trade-price math lib whose only consumers are the orphaned TradePricing.tsx, the (dead) use-trade-account.ts r
- `apps/mobile/Capture/Capture/Services/Sync/LocalCaptureSyncService.swift` — A local CaptureSyncService concrete that is never wired: AppContainer injects InMemoryCaptureSyncService() (mo
- `apps/mobile/Patina/Patina/Core/Persistence/FirstLaunchDataStore.swift` — FirstLaunchDataStore persistence type, never referenced (not even by FirstLaunch tests).
- `services/orders/src/application/** (commands/, queries/, services/order-application.service.ts)` — CQRS/application layer of the abandoned refactor; sole consumer is the orphaned OrdersRefactoredModule/Control
- `services/orders/src/domain/** (entities/, exceptions/, repositories/, value-objects/ + their __tests__ specs)` — Domain layer of the abandoned refactor (order.entity, order-item.entity, order.exceptions, order.repository.in
- `services/orders/src/infrastructure/mappers/order.mapper.ts and services/orders/src/infrastructure/repositories/order.repository.ts` — Infrastructure layer of the abandoned refactor; consumed only by the orphaned OrdersRefactoredModule.
- `services/projects/src/application/services/** (project-management, project-progress, project-activity, approval-management)` — Application-service layer of the abandoned refactor; sole consumers are the orphaned projects-refactored.{modu
- `services/projects/src/domain/** (repositories/, services/, validators/ + their .spec.ts)` — Domain layer of the abandoned refactor (project/approval repository interfaces, progress-calculator, approval-
- `services/projects/src/infrastructure/repositories/** (prisma-project.repository.ts, prisma-approval.repository.ts)` — Prisma repository implementations of the abandoned refactor; consumed only by the orphaned ProjectsRefactoredM

### 3d. Other review items (scripts / duplicates / abandoned)

- `docs/design/the-document/portal-vs-desk-feature-gap-matrix.html` [duplicate] — Gap-matrix docs are dual-homed byte-identically in docs/design/the-document/ and docs/product/ (the .html, -v2
- `packages/supabase/supabase` [duplicate] — Stale mini Supabase project stub. Its migrations/00001_initial_schema.sql, migrations/00002_anon_read_policies
- `apps/client-portal/src/app/demo/approval-flow/page.tsx` [one-off-script] — 661-line design-system showcase (ApprovalCelebration/ApprovalTheater/CostVisualizer with sample data). Not lin
- `apps/client-portal/src/app/demo/timeline-3d/page.tsx` [one-off-script] — 832-line design-system showcase (ImmersiveTimelineCarousel/ApprovalTheater with sample data). Not linked in-ap
- `apps/client-portal/src/app/demo/timeline/page.tsx` [one-off-script] — Design-system showcase page (StoryTimeline with hardcoded sample milestones). Not linked from any nav; only re
- `apps/client-portal/tests/e2e/timeline-3d-centering.spec.ts` [one-off-script] — E2E spec targeting /demo/timeline-3d centering only; exercises the demo showcase page. Dead if the demo page i
- `apps/client-portal/tests/e2e/timeline-3d.spec.ts` [one-off-script] — E2E spec that navigates to /demo/timeline-3d — exercises the demo showcase page only. Dead if the demo page is
- `scripts/the-document-people-demo.sql` [one-off-script] — One-off demo seed for the People/⌘K feature; used to stage a walkthrough, not part of any automated flow.

## Excluded — flagged by a finder, but verification proved it's USED (keep)

Listed for transparency so these don't get re-flagged next audit.

- `apps/designer-portal/src/app/api/auth/[...nextauth]/route.ts` [abandoned-feature] — This is a Next.js App Router route.ts file — a filesystem-convention entry point that Next.js discovers and serves without any import, so absence of i
- `supabase/functions/sms-dispatch/` [abandoned-feature] — No caller (repo-wide grep for sms-dispatch/smsDispatch = zero; notification-dispatch lists 'sms' in its channel type union but has no dispatch branch,
- `services/orders/src/generated/prisma-client/**` [build-artifact] — Actively imported by live application code via relative source paths, e.g. `import { PrismaClient } from '../generated/prisma-client'` in src/config/p
- `services/projects/src/generated/prisma-client/**` [build-artifact] — Imported by live code: src/prisma/prisma.service.ts `import { PrismaClient as ProjectsPrismaClient } from '../generated/prisma-client'`, and reference
- `scripts/the-document-decision-composer-demo.sql` [one-off-script] — Referenced in DECISIONS.md:2186 as 'Demo aid: scripts/the-document-decision-composer-demo.sql (wires Olsen a client so the composer resolves)' — a doc
- `scripts/the-document-discovery-smoke.sql` [one-off-script] — Cited in DECISIONS.md:2467 as the verification artifact ('SQL smoke 8/8 (scripts/the-document-discovery-smoke.sql — Shape D->B flip...')'. Documented 
- `scripts/the-document-track3-demo-earnings.sql` [one-off-script] — Referenced in DECISIONS.md:1743 as the dev-only 'Local demo seed', and cited as a documented prerequisite in apps/designer-portal/scripts/the-document
- `scripts/the-document-track5-demo-coordination.sql` [one-off-script] — Cited by scripts/aesthete-demo-seed.sql:39 as the conventions exemplar ('Conventions: scripts/the-document-track5-demo-coordination.sql') and named in
- `scripts/verify-proposal-build.sql` [one-off-script] — Documented with concrete run instructions in docs/superpowers/reports/2026-05-06-proposal-verification.md (lines 91/93: 'docker cp scripts/verify-prop
- `studios/help-system/scripts/migrate-coachmark-s4-4.ts` [one-off-script] — Referenced with run instructions in studios/help-system/README.md:76 ('npx sanity@latest exec --with-user-token ./scripts/migrate-coachmark-s4-4.ts') 
- `studios/help-system/scripts/run-coachmark-migration.mjs` [one-off-script] — Cited as the canonical pattern by an active sibling script: studios/help-system/scripts/run-decisions-help-seed.mjs:3 says 'Direct @sanity/client invo
- `apps/mobile/Capture/Capture/Services/Camera/AVFoundationCameraService.swift` [orphaned-code] — In the pbxproj Sources build phase (compiled) and has zero current references, BUT it is the only real AVFoundation implementation of the CameraServic
- `apps/mobile/Patina/Patina/Features/FirstLaunch/Coordinators/FirstLaunchCoordinator.swift` [orphaned-code] — NOT dead — the candidate note is wrong. This file declares `extension EnvironmentValues { @Entry var firstLaunchCoordinator: FirstLaunchCoordinator? }
- `packages/patina-design-system/src/components/DragDrop/` [orphaned-code] — REVIEWER CLAIM IS WRONG. DragDrop/index.ts does `export * from './useDragDrop'`, which exports DragDropContext/SortableList/useSortableItem/reorderIte
- `packages/patina-design-system/src/components/Fallbacks/` [orphaned-code] — REVIEWER CLAIM IS WRONG (fails the zero-references bar). apps/client-portal/src/components/error-fallback.tsx re-exports ErrorFallback/LoadingFallback
- `services/media/src/modules/media/config/cors.config.ts` [orphaned-code] — Real compile-time reference: modules/media/index.ts barrel re-exports corsConfig/uploadCorsConfig/cdnCorsConfig from it. That barrel is NOT in the can
- `apps/designer-portal/IMPLEMENTATION_SUMMARY.md` [superseded-doc] — The live app README.md links to it: README.md line 439 '- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md)'. A real reference from the canonical 
- `docs/design/the-document/the-document-spec-v1.3.md` [superseded-doc] — Explicit maintainer retention convention: DECISIONS.md:2202 states 'the spec is versioned cuts' / prior versions 'retained as history', and spec-v1.6 
- `docs/design/the-document/the-document-spec-v1.4.md` [superseded-doc] — Same versioned-history retention convention (DECISIONS.md:2202 'v1.4 is retained as history (the spec is versioned cuts)'). Referenced by track3-packa
- `docs/design/the-document/the-document-spec-v1.5.md` [superseded-doc] — Same versioned-history retention convention; spec-v1.6 header explicitly 'supersedes v1.5' while preserving numbering lineage, and DECISIONS.md refere

## Special case — committed generated Prisma clients (do NOT plain-delete)

`services/{orders,projects,media}/src/generated/prisma-client/` — **63 tracked files, 6 native `libquery_engine` binaries (~MBs).** Conventionally these belong in `.gitignore` and are regenerated by `prisma generate` (each service's `postinstall`). **However, live code imports them** (`import { PrismaClient } from '../generated/prisma-client'`), so removing them only works if you *guarantee* `prisma generate` runs in every build/CI/deploy path first. Verifier marked orders/projects **keep** for this reason.

**Options:** (a) leave as-is; or (b) `git rm -r` all three, add them to `.gitignore`, and confirm `postinstall`/Dockerfiles run `prisma generate` before build. Not a plain "stale file" delete.

## How this was produced

- Serena project `patina-merged` activated + onboarded (8 memories written: `core`, `tech_stack`, `suggested_commands`, `conventions`, `task_completion`, `frontend/core`, `backend/core`, `data/core`).
- 14 territory agents (one per app/service/package group + a repo-wide cross-cutting agent) used Serena `find_referencing_symbols` for orphan detection + `git ls-files`/grep for junk/dupes.
- Each territory's risky candidates were re-checked by an adversarial verifier agent instructed to *prove the file is still used*; only "safe_to_remove" verdicts reach Tier 2.
- Raw finder data: workflow run `wf_64e52db7-f70` (373 candidates, 20 rescued as false positives).

_No files were deleted in producing this report._
