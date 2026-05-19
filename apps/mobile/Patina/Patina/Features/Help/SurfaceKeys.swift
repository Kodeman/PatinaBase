//
//  SurfaceKeys.swift
//  Patina
//
//  iOS surface-key registry for the Help & Guidance System (spec §3 + §6).
//
//  This file MIRRORS the web source of truth at
//  `packages/help-system/src/surfaceKeys.ts`. Every string here MUST be
//  identical to its web counterpart — Sanity stores help content once per
//  surface key, and cross-platform lookups depend on byte-for-byte parity.
//
//  When adding a new surface key:
//    1. Add it to the web registry FIRST (`packages/help-system/src/surfaceKeys.ts`).
//    2. Add the matching constant here.
//    3. Add the literal string to `SurfaceKeys.allKnown` below.
//    4. Add it to the Sanity CMS schema enum.
//
//  The `allKnown` set is intentionally hand-enumerated — Swift's reflection
//  story for static-only enums is not robust, and an explicit edit per new
//  key is a useful forcing function that surfaces in code review.
//

import Foundation

/// Canonical iOS catalogue of surface keys.
///
/// Mirrors the nested shape of the web `SurfaceKeys` const for ergonomic,
/// type-safe access at call sites:
///
/// ```swift
/// helpService.fetch(SurfaceKeys.DesignerPortal.Today.dashboard)
/// helpService.fetch(SurfaceKeys.IOSApp.Home.root)
/// ```
///
/// Other web-only namespaces (e.g. ActivationWizard, Products, Clients)
/// live in the web registry only — they have no iOS counterpart yet and
/// would uselessly bloat the binary. The parity test enforces `iOS ⊆ web`.
public enum SurfaceKeys {
    // MARK: - DesignerPortal

    public enum DesignerPortal {
        public enum Today {
            public static let dashboard: SurfaceKey = "designer-portal/today/dashboard"
            public static let emptyState: SurfaceKey = "designer-portal/today/empty-state"
        }

        public enum Pipeline {
            public static let projectList: SurfaceKey = "designer-portal/pipeline/project-list"

            public enum ProjectListEmpty {
                public static let leads: SurfaceKey = "designer-portal/pipeline/project-list/empty-leads"
                public static let proposals: SurfaceKey = "designer-portal/pipeline/project-list/empty-proposals"
                public static let active: SurfaceKey = "designer-portal/pipeline/project-list/empty-active"
                public static let completed: SurfaceKey = "designer-portal/pipeline/project-list/empty-completed"
            }

            public enum StageDefinitions {
                public static let leads: SurfaceKey = "designer-portal/pipeline/stage/leads"
                public static let proposals: SurfaceKey = "designer-portal/pipeline/stage/proposals"
                public static let active: SurfaceKey = "designer-portal/pipeline/stage/active"
                public static let completed: SurfaceKey = "designer-portal/pipeline/stage/completed"
            }
        }

        public enum Aesthete {
            public static let overview: SurfaceKey = "designer-portal/aesthete/overview"
            public static let score: SurfaceKey = "designer-portal/aesthete/score-meaning"
            public static let engineOverview: SurfaceKey = "designer-portal/aesthete/engine-overview"
        }
    }

    // MARK: - AdminPortal

    public enum AdminPortal {
        // Sprint 1: only the minimum to prove the namespace works. Sprint 3 expands.
        public static let dashboard: SurfaceKey = "admin-portal/dashboard"
    }

    // MARK: - ClientPortal

    public enum ClientPortal {
        // Sprint 1: only the minimum.
        public static let home: SurfaceKey = "client-portal/home"
    }

    // MARK: - IOSApp
    //
    // Surface keys exclusive to the native iOS consumer app. Mirrors the
    // `IOSApp` namespace added to `packages/help-system/src/surfaceKeys.ts`
    // so authoring tools, Sanity, and the parity test can reason about both
    // platforms in one shape.
    //
    // The iOS app's `Home` is the editorial "Daily Room" surface — a feed
    // of one curated story plus a stream of room-aware product
    // recommendations. The `ProductDetail` surface is the full-screen
    // product page with maker story, spatial context pills, and AR
    // placement. Both screens lean heavily on Patina vocabulary (tier,
    // match score, why-it-fits) that benefits from contextual help.
    //
    // Sprint 2 · Stream G7 — first user-facing iOS migration.
    public enum IOSApp {
        public enum Home {
            /// Root surface — used by the `?` toolbar button to populate
            /// the contextual help panel with every related article.
            public static let root: SurfaceKey = "ios-app/home"
            /// "Your Daily Room" greeting header explaining the daily-feed concept.
            public static let dailyGreeting: SurfaceKey = "ios-app/home/daily-greeting"
            /// The featured editorial story card at the top of the feed.
            public static let dailyStoryCard: SurfaceKey = "ios-app/home/daily-story-card"
            /// One product recommendation card in the daily stream.
            public static let dailyProductCard: SurfaceKey = "ios-app/home/daily-product-card"
            /// Patina concept — product tier pill (Maker Piece / Designer's Pick / Sourced).
            public static let tierPill: SurfaceKey = "ios-app/home/tier-pill"
            /// Patina concept — match-score pill on the product card.
            public static let matchPill: SurfaceKey = "ios-app/home/match-pill"
            /// "Add" icon-only button → adds product to a room.
            public static let addToRoom: SurfaceKey = "ios-app/home/add-to-room"
        }

        public enum ProductDetail {
            /// Root surface — used by the `?` toolbar button to populate
            /// the contextual help panel.
            public static let root: SurfaceKey = "ios-app/product-detail"
            /// Saved (heart) toggle in the top bar.
            public static let savedStatus: SurfaceKey = "ios-app/product-detail/saved-status"
            /// Share icon button in the top bar.
            public static let shareAction: SurfaceKey = "ios-app/product-detail/share-action"
            /// AR placement icon button in the bottom action bar.
            public static let arAction: SurfaceKey = "ios-app/product-detail/ar-action"
            /// "Place in your room" header + spatial-context pills.
            public static let spatialContext: SurfaceKey = "ios-app/product-detail/spatial-context"
            /// Material badges row — sustainability / origin claims.
            public static let materials: SurfaceKey = "ios-app/product-detail/materials"
        }
    }

    // MARK: - Parity helpers

    /// Every surface key declared in this registry, as a flat set.
    ///
    /// Used by `SurfaceKeysParityTests` to assert one-to-one parity with the
    /// web registry. Update this set whenever you add or remove a constant
    /// above — the parity test will fail loudly if you forget.
    public static let allKnown: Set<SurfaceKey> = [
        // DesignerPortal/Today
        DesignerPortal.Today.dashboard,
        DesignerPortal.Today.emptyState,
        // DesignerPortal/Pipeline
        DesignerPortal.Pipeline.projectList,
        DesignerPortal.Pipeline.ProjectListEmpty.leads,
        DesignerPortal.Pipeline.ProjectListEmpty.proposals,
        DesignerPortal.Pipeline.ProjectListEmpty.active,
        DesignerPortal.Pipeline.ProjectListEmpty.completed,
        DesignerPortal.Pipeline.StageDefinitions.leads,
        DesignerPortal.Pipeline.StageDefinitions.proposals,
        DesignerPortal.Pipeline.StageDefinitions.active,
        DesignerPortal.Pipeline.StageDefinitions.completed,
        // DesignerPortal/Aesthete
        DesignerPortal.Aesthete.overview,
        DesignerPortal.Aesthete.score,
        DesignerPortal.Aesthete.engineOverview,
        // AdminPortal
        AdminPortal.dashboard,
        // ClientPortal
        ClientPortal.home,
        // IOSApp/Home
        IOSApp.Home.root,
        IOSApp.Home.dailyGreeting,
        IOSApp.Home.dailyStoryCard,
        IOSApp.Home.dailyProductCard,
        IOSApp.Home.tierPill,
        IOSApp.Home.matchPill,
        IOSApp.Home.addToRoom,
        // IOSApp/ProductDetail
        IOSApp.ProductDetail.root,
        IOSApp.ProductDetail.savedStatus,
        IOSApp.ProductDetail.shareAction,
        IOSApp.ProductDetail.arAction,
        IOSApp.ProductDetail.spatialContext,
        IOSApp.ProductDetail.materials,
    ]
}
