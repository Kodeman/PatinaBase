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

    /// Snapshot of every surface-key string the iOS registry MUST declare to
    /// stay in lock-step with the web source of truth at
    /// `packages/help-system/src/surfaceKeys.ts`.
    ///
    /// The iOS registry intentionally only mirrors:
    ///   - The Sprint-1 scaffolding (DesignerPortal/Today, /Pipeline,
    ///     /Aesthete; AdminPortal; ClientPortal).
    ///   - The iOS-app surfaces that ship migrations on iOS (IOSApp/Home and
    ///     IOSApp/ProductDetail in G7).
    ///
    /// Other web-only namespaces (DesignerPortal/ActivationWizard, /Products,
    /// /Clients, the Aesthete/Engine deep-dives) live in the web registry only
    /// because they have no iOS counterpart — listing them here would
    /// uselessly bloat the iOS binary. The parity test enforces that
    /// `iOS ⊆ web` (no rogue iOS-only keys), not exact set equality.
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

        // IOSApp/Home (G7 — first iOS user-facing migration)
        "ios-app/home",
        "ios-app/home/daily-greeting",
        "ios-app/home/daily-story-card",
        "ios-app/home/daily-product-card",
        "ios-app/home/tier-pill",
        "ios-app/home/match-pill",
        "ios-app/home/add-to-room",

        // IOSApp/ProductDetail (G7)
        "ios-app/product-detail",
        "ios-app/product-detail/saved-status",
        "ios-app/product-detail/share-action",
        "ios-app/product-detail/ar-action",
        "ios-app/product-detail/spatial-context",
        "ios-app/product-detail/materials",

        // IOSApp/FirstLaunchTour (G9 — Sprint 3 iOS first-launch tour)
        "ios-app/first-launch-tour",
        "ios-app/first-launch-tour/step-1-home",
        "ios-app/first-launch-tour/step-2-saved",
        "ios-app/first-launch-tour/step-3-profile",

        // IOSApp/Designer (G10 — Sprint 3 iOS Features sweep)
        "ios-app/designer",
        "ios-app/designer/studio-today",
        "ios-app/designer/pending-decision",
        "ios-app/designer/open-lead",
        "ios-app/designer/consultation",

        // IOSApp/QRAuth (G10)
        "ios-app/qr-auth",
        "ios-app/qr-auth/scan-intro",
        "ios-app/qr-auth/approval",
        "ios-app/qr-auth/biometric",
        "ios-app/qr-auth/success-state",

        // IOSApp/Companion (G10)
        "ios-app/companion",
        "ios-app/companion/what-next",
        "ios-app/companion/context-summary",
        "ios-app/companion/quick-action",

        // IOSApp/Rooms (G10)
        "ios-app/rooms",
        "ios-app/rooms/your-spaces",
        "ios-app/rooms/empty-no-rooms",
        "ios-app/rooms/whole-home",
        "ios-app/rooms/new-room",

        // IOSApp/Profile (G10)
        "ios-app/profile",
        "ios-app/profile/design-journal",
        "ios-app/profile/style-badge",
        "ios-app/profile/match-percentage",
        "ios-app/profile/saved-items",
    ]

    @Test
    func surfaceKeyCountMatchesWebSpec() {
        #expect(SurfaceKeys.allKnown.count == 57)
        #expect(Self.expectedSurfaceKeys.count == 57)
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

    @Test
    func iosAppHomeAccessors() {
        #expect(SurfaceKeys.IOSApp.Home.root == "ios-app/home")
        #expect(SurfaceKeys.IOSApp.Home.dailyGreeting == "ios-app/home/daily-greeting")
        #expect(SurfaceKeys.IOSApp.Home.dailyStoryCard == "ios-app/home/daily-story-card")
        #expect(SurfaceKeys.IOSApp.Home.dailyProductCard == "ios-app/home/daily-product-card")
        #expect(SurfaceKeys.IOSApp.Home.tierPill == "ios-app/home/tier-pill")
        #expect(SurfaceKeys.IOSApp.Home.matchPill == "ios-app/home/match-pill")
        #expect(SurfaceKeys.IOSApp.Home.addToRoom == "ios-app/home/add-to-room")
    }

    @Test
    func iosAppProductDetailAccessors() {
        #expect(SurfaceKeys.IOSApp.ProductDetail.root == "ios-app/product-detail")
        #expect(SurfaceKeys.IOSApp.ProductDetail.savedStatus == "ios-app/product-detail/saved-status")
        #expect(SurfaceKeys.IOSApp.ProductDetail.shareAction == "ios-app/product-detail/share-action")
        #expect(SurfaceKeys.IOSApp.ProductDetail.arAction == "ios-app/product-detail/ar-action")
        #expect(SurfaceKeys.IOSApp.ProductDetail.spatialContext == "ios-app/product-detail/spatial-context")
        #expect(SurfaceKeys.IOSApp.ProductDetail.materials == "ios-app/product-detail/materials")
    }

    @Test
    func iosAppFirstLaunchTourAccessors() {
        #expect(SurfaceKeys.IOSApp.FirstLaunchTour.root == "ios-app/first-launch-tour")
        #expect(SurfaceKeys.IOSApp.FirstLaunchTour.step1Home == "ios-app/first-launch-tour/step-1-home")
        #expect(SurfaceKeys.IOSApp.FirstLaunchTour.step2Saved == "ios-app/first-launch-tour/step-2-saved")
        #expect(SurfaceKeys.IOSApp.FirstLaunchTour.step3Profile == "ios-app/first-launch-tour/step-3-profile")
    }

    @Test
    func iosAppDesignerAccessors() {
        #expect(SurfaceKeys.IOSApp.Designer.root == "ios-app/designer")
        #expect(SurfaceKeys.IOSApp.Designer.studioToday == "ios-app/designer/studio-today")
        #expect(SurfaceKeys.IOSApp.Designer.pendingDecision == "ios-app/designer/pending-decision")
        #expect(SurfaceKeys.IOSApp.Designer.openLead == "ios-app/designer/open-lead")
        #expect(SurfaceKeys.IOSApp.Designer.consultation == "ios-app/designer/consultation")
    }

    @Test
    func iosAppQRAuthAccessors() {
        #expect(SurfaceKeys.IOSApp.QRAuth.root == "ios-app/qr-auth")
        #expect(SurfaceKeys.IOSApp.QRAuth.scanIntro == "ios-app/qr-auth/scan-intro")
        #expect(SurfaceKeys.IOSApp.QRAuth.approval == "ios-app/qr-auth/approval")
        #expect(SurfaceKeys.IOSApp.QRAuth.biometric == "ios-app/qr-auth/biometric")
        #expect(SurfaceKeys.IOSApp.QRAuth.successState == "ios-app/qr-auth/success-state")
    }

    @Test
    func iosAppCompanionAccessors() {
        #expect(SurfaceKeys.IOSApp.Companion.root == "ios-app/companion")
        #expect(SurfaceKeys.IOSApp.Companion.whatNext == "ios-app/companion/what-next")
        #expect(SurfaceKeys.IOSApp.Companion.contextSummary == "ios-app/companion/context-summary")
        #expect(SurfaceKeys.IOSApp.Companion.quickAction == "ios-app/companion/quick-action")
    }

    @Test
    func iosAppRoomsAccessors() {
        #expect(SurfaceKeys.IOSApp.Rooms.root == "ios-app/rooms")
        #expect(SurfaceKeys.IOSApp.Rooms.yourSpaces == "ios-app/rooms/your-spaces")
        #expect(SurfaceKeys.IOSApp.Rooms.emptyNoRooms == "ios-app/rooms/empty-no-rooms")
        #expect(SurfaceKeys.IOSApp.Rooms.wholeHome == "ios-app/rooms/whole-home")
        #expect(SurfaceKeys.IOSApp.Rooms.newRoom == "ios-app/rooms/new-room")
    }

    @Test
    func iosAppProfileAccessors() {
        #expect(SurfaceKeys.IOSApp.Profile.root == "ios-app/profile")
        #expect(SurfaceKeys.IOSApp.Profile.designJournal == "ios-app/profile/design-journal")
        #expect(SurfaceKeys.IOSApp.Profile.styleBadge == "ios-app/profile/style-badge")
        #expect(SurfaceKeys.IOSApp.Profile.matchPercentage == "ios-app/profile/match-percentage")
        #expect(SurfaceKeys.IOSApp.Profile.savedItems == "ios-app/profile/saved-items")
    }
}
