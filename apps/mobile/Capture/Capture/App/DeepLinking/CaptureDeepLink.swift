//  CaptureDeepLink.swift
//  Capture
//
//  Entry-point + verification deep links. `field://screen/<CaptureScreenID>`
//  drives any screen directly for MobAI / XCUITest per-screen validation (the
//  51-row acceptance matrix). Production entries (E1/E2) also land here.

import Foundation
import CaptureKit
import CaptureKitMocks   // WorkFixtures — stable ids the detail screens resolve to

enum CaptureDeepLink {
    /// Resolve a `field://…` URL into a navigation intent. A `field://login`
    /// URL is the web→app QR sign-in handoff and is routed to `login` (the
    /// controller that runs the exchange + confirm/toast UI); everything else is
    /// screen/entry-point navigation.
    @MainActor
    static func handle(
        _ url: URL,
        coordinator: CaptureCoordinator,
        store: CaptureStore,
        session: any SessionProviding,
        login: PortalLoginController? = nil
    ) {
        if url.scheme == "https",
           url.host == AppConfiguration.guestSiteBaseURL.host,
           url.pathComponents.count == 3,
           url.pathComponents[1] == "field" {
            let token = url.pathComponents[2]
            guard SiteRequestAccessToken.isNativeSiteRequestToken(token) else { return }
            coordinator.enterGuestRequest(accessToken: token)
            return
        }

        guard url.scheme == AppConfiguration.urlScheme else { return }

        if url.host == PortalLoginToken.host {
            login?.receive(url: url)
            return
        }

        if url.host == "screen",
           let raw = url.pathComponents.dropFirst().first,
           let id = CaptureScreenID(rawValue: "screen.\(raw)")
                ?? CaptureScreenID.allCases.first(where: { $0.rawValue.hasSuffix(raw) }) {
            guard verificationHarnessAllowed else { return }
            route(for: id, coordinator: coordinator, store: store, session: session)
            return
        }

        if url.host == "capture" || url.host == nil {
            coordinator.switchRealm(.camera, reset: true)
        }
    }

    /// Drive a specific screen directly (launch-arg `-CaptureScreen <id>` and tests).
    @MainActor
    static func drive(
        screen id: CaptureScreenID,
        coordinator: CaptureCoordinator,
        store: CaptureStore,
        session: any SessionProviding
    ) {
        guard verificationHarnessAllowed else { return }
        route(for: id, coordinator: coordinator, store: store, session: session)
    }

    @MainActor
    private static func route(
        for id: CaptureScreenID,
        coordinator: CaptureCoordinator,
        store: CaptureStore,
        session: any SessionProviding
    ) {
        coordinator.onboardingStep = nil
        coordinator.switchRealm(realm(for: id), reset: true)

        func withSample(_ action: (UUID) -> Void) {
            guard let sampleID = sampleSpecimenID(store: store, session: session) else { return }
            action(sampleID)
        }

        switch id {
        case .c1Viewfinder, .c2Framing, .c3Specimen, .c4MultiShot,
             .e1AppIcon, .e2SystemEntry, .r1LowLight,
             // Reserved ids: V0/C6 are wave 3, V4 is wave 4. They have no
             // destination yet, so the harness stays on C1 rather than
             // screenshotting a screen that does not exist.
             .v0Visit, .c6Voice, .v4VisitReview:
            break
        case .c5SpecimenSheet:  withSample { coordinator.present(.specimenSheet($0)) }
        case .n1TagOCR:         withSample { coordinator.present(.ocr($0)) }
        case .n2Scan:           withSample { coordinator.present(.code($0)) }
        case .n3Measure:        withSample { coordinator.present(.measure($0)) }
        case .n4Voice:          withSample { coordinator.present(.voice($0)) }
        case .n5SmartGuess:     withSample { coordinator.present(.smartGuessCard($0)) }
        case .r2OCRFallback:    withSample { coordinator.present(.ocr($0)) }
        case .r3Denied, .e3ShareSheet: coordinator.present(.photoImport)
        case .r4Offline:        coordinator.navigate(to: .syncStatus)
        case .s1Assign:         withSample { coordinator.present(.assignVenue($0)) }
        case .s2CreateProject:  coordinator.present(.createProject)
        case .s3Destination:    withSample { coordinator.present(.destination($0)) }
        case .s4Saved:          withSample { coordinator.present(.savedTerminal($0)) }
        case .s5Inbox:          withSample { coordinator.present(.inboxTerminal($0)) }
        case .v1SessionTray:    coordinator.navigate(to: .session)
        case .v2Cull:           coordinator.present(.cullDeck)
        case .v3Detail:         withSample { coordinator.navigate(to: .specimen($0)) }
        case .u1Sync:           coordinator.navigate(to: .syncStatus)
        case .u2LibrarySearch:  coordinator.navigate(to: .librarySearch)
        case .t1Settings:       coordinator.navigate(to: .settings)
        case .t2Account:        coordinator.navigate(to: .account)
        case .w1Work,
             .p1ProjectList, .p2ProjectDetail,
             .l1LeadList, .l2LeadDetail,
             .d1DecisionList, .d2DecisionDetail,
             .m1Inbox, .m2Thread,
             .g1Arriving, .g2Inspection, .g3Outcome,
             .q1QRScan, .q2QRApprove,
             .f1ScanSetup, .f1Context, .f2SiteScan, .f3ScanReview, .f4ScanUpload:
            routeWorkScreen(id, coordinator: coordinator)
        case .sr01SiteHub, .sr02Composer, .sr03ItemConfig, .sr04AssignSend,
             .sr05Tracker, .sr06ReviewInbox, .sr07MeasureReview, .sr08PhotoReview,
             .sr09Approval, .sr10BinderRooms, .sr11BinderDetail, .sr12BinderHistory,
             .sr13GuestLanding, .sr14GuestChecklist, .sr15GuestMeasure,
             .sr16GuestPhoto, .sr17GuestQueue, .sr18GuestReceipt,
             .sr19GuestDone, .sr20GuestReturned:
            coordinator.navigate(to: .site(
                screen: id,
                projectID: SiteRequestFixtures.projectID,
                requestID: SiteRequestFixtures.requestID))
        case .o1Welcome:       coordinator.onboardingStep = 0
        case .o2Connect:       coordinator.onboardingStep = 1
        case .o3CameraPriming: coordinator.onboardingStep = 2
        case .o4Ready:         coordinator.onboardingStep = 3
        }
    }

    @MainActor
    private static func sampleSpecimenID(
        store: CaptureStore,
        session: any SessionProviding
    ) -> UUID? {
        let specimen: Specimen?
        switch CaptureOwnerProjectionPolicy.resolve(
            runsRealServices: AppConfiguration.runsRealServices,
            userID: session.userID,
            workspaceID: session.workspaceID
        ) {
        case .globalFixtures:
            specimen = store.session().first ?? store.newDraft()
        case .owner(let owner):
            specimen = store.session(owner: owner).first ?? store.newDraft(owner: owner)
        case .unavailable:
            specimen = nil
        }
        return specimen?.id
    }

    /// Phase 2 designer/pro harness routes. Detail screens resolve the stable
    /// fixture ids below; W1 itself is already the Work realm root.
    @MainActor
    private static func routeWorkScreen(
        _ id: CaptureScreenID,
        coordinator: CaptureCoordinator
    ) {
        switch id {
        case .w1Work:           break
        case .p1ProjectList:    coordinator.navigate(to: .projectList)
        case .p2ProjectDetail:  coordinator.navigate(to: .project(WorkFixtures.projectID))
        case .l1LeadList:       coordinator.navigate(to: .leadList)
        case .l2LeadDetail:     coordinator.navigate(to: .leadDetail(WorkFixtures.leadID))
        case .d1DecisionList:   coordinator.navigate(to: .decisionList)
        case .d2DecisionDetail: coordinator.navigate(to: .decisionDetail(WorkFixtures.decisionID))
        case .m1Inbox:          coordinator.navigate(to: .inbox)
        case .m2Thread:         coordinator.navigate(to: .thread(WorkFixtures.threadID))
        case .g1Arriving:       coordinator.navigate(to: .receiving)
        case .g2Inspection, .g3Outcome:
            coordinator.present(.receivingInspection(poID: WorkFixtures.poID))
        case .q1QRScan:         coordinator.navigate(to: .qrScan)
        case .q2QRApprove:      coordinator.present(.qrApprove(payload: WorkFixtures.qrPayload))
        case .f1ScanSetup:      coordinator.navigate(to: .siteScanSetup)
        case .f1Context:
            coordinator.siteScanContextRequested = true
            coordinator.navigate(to: .siteScanSetup)
        case .f2SiteScan, .f3ScanReview, .f4ScanUpload:
            coordinator.navigate(to: .siteScan(projectID: WorkFixtures.projectID, projectRoomID: nil))
        default:
            assertionFailure("Non-Work screen sent to routeWorkScreen")
        }
    }

    private static var verificationHarnessAllowed: Bool {
        #if DEBUG
        return true
        #else
        return !AppConfiguration.runsRealServices
        #endif
    }

    private static func realm(for id: CaptureScreenID) -> FieldRealm {
        switch id {
        case .w1Work,
             .p1ProjectList, .p2ProjectDetail,
             .l1LeadList, .l2LeadDetail,
             .d1DecisionList, .d2DecisionDetail,
             .m1Inbox, .m2Thread,
             .g1Arriving, .g2Inspection, .g3Outcome,
             .q1QRScan, .q2QRApprove,
             .f1ScanSetup, .f1Context, .f2SiteScan, .f3ScanReview, .f4ScanUpload,
             .sr01SiteHub, .sr02Composer, .sr03ItemConfig, .sr04AssignSend,
             .sr05Tracker, .sr06ReviewInbox, .sr07MeasureReview, .sr08PhotoReview,
             .sr09Approval, .sr10BinderRooms, .sr11BinderDetail, .sr12BinderHistory,
             .sr13GuestLanding, .sr14GuestChecklist, .sr15GuestMeasure,
             .sr16GuestPhoto, .sr17GuestQueue, .sr18GuestReceipt,
             .sr19GuestDone, .sr20GuestReturned:
            .work
        default:
            .camera
        }
    }
}
