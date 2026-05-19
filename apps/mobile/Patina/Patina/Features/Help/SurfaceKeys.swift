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
/// ```
///
/// Out-of-scope portals (consumer iOS app, manufacturer portal) intentionally
/// have no surface keys here — see the source-of-truth file for context.
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
    ]
}
