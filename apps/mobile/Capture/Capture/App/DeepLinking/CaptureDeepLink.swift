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
    static func handle(_ url: URL,
                       coordinator: CaptureCoordinator,
                       store: CaptureStore,
                       login: PortalLoginController? = nil) {
        // https://client.patina.cloud/field/{opaque-token} — the same link the
        // responsive guest web flow handles when Field is not installed. The
        // raw token remains request-scoped and goes only to guest Edge calls.
        if url.scheme == "https",
           url.host == AppConfiguration.guestSiteBaseURL.host,
           url.pathComponents.count == 3,
           url.pathComponents[1] == "field" {
            let token = url.pathComponents[2]
            guard !token.isEmpty else { return }
            coordinator.enterGuestRequest(accessToken: token)
            return
        }

        guard url.scheme == AppConfiguration.urlScheme else { return }

        // field://login?v=1&th=<token_hash> — portal QR sign-in (works from a
        // signed-out cold start; confirms before switching a live session).
        if url.host == PortalLoginToken.host {
            login?.receive(url: url)
            return
        }

        // field://screen/<id>  — drive a specific screen (debug/verification).
        if url.host == "screen", let raw = url.pathComponents.dropFirst().first,
           let id = CaptureScreenID(rawValue: "screen.\(raw)") ?? CaptureScreenID.allCases.first(where: { $0.rawValue.hasSuffix(raw) }) {
            route(for: id, coordinator: coordinator, store: store)
            return
        }

        // field://capture — instant viewfinder (E1/E2).
        if url.host == "capture" || url.host == nil {
            coordinator.popToRoot()
        }
    }

    /// Drive a specific screen directly (launch-arg `-CaptureScreen <id>` and tests).
    @MainActor
    static func drive(screen id: CaptureScreenID, coordinator: CaptureCoordinator, store: CaptureStore) {
        route(for: id, coordinator: coordinator, store: store)
    }

    @MainActor
    private static func route(for id: CaptureScreenID, coordinator: CaptureCoordinator, store: CaptureStore) {
        // A representative specimen so detail/sheet screens have data to show.
        let sample = store.session().first?.id ?? store.newDraft().id
        coordinator.popToRoot()
        coordinator.dismissSheet()
        switch id {
        case .c1Viewfinder, .c2Framing, .c3Specimen, .c4MultiShot,
             .e1AppIcon, .e2SystemEntry, .r1LowLight:
            break // these live on the viewfinder root
        case .c5SpecimenSheet:  coordinator.present(.specimenSheet(sample))
        case .n1TagOCR:         coordinator.present(.ocr(sample))
        case .n2Scan:           coordinator.present(.code(sample))
        case .n3Measure:        coordinator.present(.measure(sample))
        case .n4Voice:          coordinator.present(.voice(sample))
        case .n5SmartGuess:     coordinator.present(.smartGuessCard(sample))
        case .r2OCRFallback:    coordinator.present(.ocr(sample))
        case .r3Denied, .e3ShareSheet: coordinator.present(.photoImport)
        case .r4Offline:        coordinator.navigate(to: .syncStatus)
        case .s1Assign:         coordinator.present(.assignVenue(sample))
        case .s2CreateProject:  coordinator.present(.createProject)
        case .s3Destination:    coordinator.present(.destination(sample))
        case .s4Saved:          coordinator.present(.savedTerminal(sample))
        case .s5Inbox:          coordinator.present(.inboxTerminal(sample))
        case .v1SessionTray:    coordinator.navigate(to: .session)
        case .v2Cull:           coordinator.present(.cullDeck)
        case .v3Detail:         coordinator.navigate(to: .specimen(sample))
        case .u1Sync:           coordinator.navigate(to: .syncStatus)
        case .u2LibrarySearch:  coordinator.navigate(to: .librarySearch)
        case .t1Settings:       coordinator.navigate(to: .settings)
        case .t2Account:        coordinator.navigate(to: .account)
        // ── Phase 2 designer/pro flows (detail screens use WorkFixtures ids) ──
        case .w1Work:           coordinator.navigate(to: .work)
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
        case .f2SiteScan, .f3ScanReview, .f4ScanUpload:
            coordinator.navigate(to: .siteScan(projectID: WorkFixtures.projectID, projectRoomID: nil))
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
}
