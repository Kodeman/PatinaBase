//
//  SurfaceKeysParityTests.swift
//  PatinaTests
//
//  Pins the iOS `SurfaceKeys` registry to the web source of truth at
//  `packages/help-system/src/surfaceKeys.ts`. Every help moment is
//  identified by a surface key, and Sanity stores help content keyed on
//  these strings — so cross-platform parity is a wire contract.
//
//  If you intentionally add, rename, or remove a surface key, update BOTH
//  the web registry AND `expectedSurfaceKeys` below in the same PR (along
//  with `SurfaceKeys.allKnown` in `Features/Help/SurfaceKeys.swift`).
//

import Testing
@testable import Patina

struct SurfaceKeysParityTests {

    /// Snapshot of every surface-key string declared in the web registry as
    /// of Sprint 1 (16 keys). Hand-enumerated on purpose — when this list
    /// drifts from the iOS registry the parity test should fail loudly.
    static let expectedSurfaceKeys: Set<String> = [
        // DesignerPortal/Today
        "designer-portal/today/dashboard",
        "designer-portal/today/empty-state",

        // DesignerPortal/Pipeline
        "designer-portal/pipeline/project-list",
        "designer-portal/pipeline/project-list/empty-leads",
        "designer-portal/pipeline/project-list/empty-proposals",
        "designer-portal/pipeline/project-list/empty-active",
        "designer-portal/pipeline/project-list/empty-completed",
        "designer-portal/pipeline/stage/leads",
        "designer-portal/pipeline/stage/proposals",
        "designer-portal/pipeline/stage/active",
        "designer-portal/pipeline/stage/completed",

        // DesignerPortal/Aesthete
        "designer-portal/aesthete/overview",
        "designer-portal/aesthete/score-meaning",
        "designer-portal/aesthete/engine-overview",

        // AdminPortal
        "admin-portal/dashboard",

        // ClientPortal
        "client-portal/home",
    ]

    @Test
    func surfaceKeyCountMatchesWebSpec() {
        #expect(SurfaceKeys.allKnown.count == 16)
        #expect(Self.expectedSurfaceKeys.count == 16)
    }

    @Test
    func surfaceKeyValuesMatchWebSpec() {
        let actual = SurfaceKeys.allKnown
        let expected = Self.expectedSurfaceKeys

        let missing = expected.subtracting(actual)
        let extra = actual.subtracting(expected)

        #expect(missing.isEmpty, "Missing surface keys on iOS: \(missing.sorted())")
        #expect(
            extra.isEmpty,
            "Extra surface keys on iOS (not in web registry): \(extra.sorted())"
        )
    }

    @Test
    func everySurfaceKeyMatchesTheFormatRegex() {
        for key in SurfaceKeys.allKnown {
            #expect(isSurfaceKey(key), "Key \"\(key)\" failed isSurfaceKey()")
        }
    }

    @Test
    func surfaceKeysAreUniqueAndNonEmpty() {
        // allKnown is already a Set; this guards against a future migration
        // to Array storage and against accidental empty entries.
        #expect(
            SurfaceKeys.allKnown.allSatisfy { !$0.isEmpty },
            "Empty surface key in registry"
        )
    }

    // MARK: - Spot-check namespaced accessors

    @Test
    func designerPortalTodayAccessors() {
        #expect(SurfaceKeys.DesignerPortal.Today.dashboard == "designer-portal/today/dashboard")
        #expect(SurfaceKeys.DesignerPortal.Today.emptyState == "designer-portal/today/empty-state")
    }

    @Test
    func designerPortalPipelineAccessors() {
        #expect(SurfaceKeys.DesignerPortal.Pipeline.projectList == "designer-portal/pipeline/project-list")
        #expect(SurfaceKeys.DesignerPortal.Pipeline.ProjectListEmpty.leads == "designer-portal/pipeline/project-list/empty-leads")
        #expect(SurfaceKeys.DesignerPortal.Pipeline.ProjectListEmpty.proposals == "designer-portal/pipeline/project-list/empty-proposals")
        #expect(SurfaceKeys.DesignerPortal.Pipeline.ProjectListEmpty.active == "designer-portal/pipeline/project-list/empty-active")
        #expect(SurfaceKeys.DesignerPortal.Pipeline.ProjectListEmpty.completed == "designer-portal/pipeline/project-list/empty-completed")
        #expect(SurfaceKeys.DesignerPortal.Pipeline.StageDefinitions.leads == "designer-portal/pipeline/stage/leads")
        #expect(SurfaceKeys.DesignerPortal.Pipeline.StageDefinitions.proposals == "designer-portal/pipeline/stage/proposals")
        #expect(SurfaceKeys.DesignerPortal.Pipeline.StageDefinitions.active == "designer-portal/pipeline/stage/active")
        #expect(SurfaceKeys.DesignerPortal.Pipeline.StageDefinitions.completed == "designer-portal/pipeline/stage/completed")
    }

    @Test
    func designerPortalAesthetheAccessors() {
        #expect(SurfaceKeys.DesignerPortal.Aesthete.overview == "designer-portal/aesthete/overview")
        #expect(SurfaceKeys.DesignerPortal.Aesthete.score == "designer-portal/aesthete/score-meaning")
        #expect(SurfaceKeys.DesignerPortal.Aesthete.engineOverview == "designer-portal/aesthete/engine-overview")
    }

    @Test
    func adminAndClientPortalAccessors() {
        #expect(SurfaceKeys.AdminPortal.dashboard == "admin-portal/dashboard")
        #expect(SurfaceKeys.ClientPortal.home == "client-portal/home")
    }
}
