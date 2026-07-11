//
//  DesignServicesErrorMappingTests.swift
//  PatinaTests
//
//  Pins the message→typed-error mapping for `submit_design_request`. The RPC
//  raises stable slugs (P0001) with the scan id in DETAIL where noted; the
//  client maps on the slug and extracts the scan id.
//

import Testing
import Foundation
@testable import Patina

struct DesignServicesErrorMappingTests {

    @Test
    func mapsEachSlug() {
        #expect(DesignServicesError.map(message: "not_authenticated", detail: nil) == .notAuthenticated)
        #expect(DesignServicesError.map(message: "no_scans", detail: nil) == .noScans)
        #expect(DesignServicesError.map(message: "primary_not_in_set", detail: nil) == .primaryNotInSet)
        #expect(DesignServicesError.map(message: "invalid_project_type", detail: nil) == .invalidProjectType)
        #expect(DesignServicesError.map(message: "designer_not_found", detail: nil) == .designerNotFound)
        #expect(DesignServicesError.map(message: "request_not_found", detail: nil) == .requestNotFound)
    }

    @Test
    func scanNotReadyCarriesScanIdFromDetail() {
        let scanId = UUID()
        let mapped = DesignServicesError.map(message: "scan_not_ready", detail: scanId.uuidString)
        #expect(mapped == .scanNotReady(scanIds: [scanId]))
    }

    @Test
    func scanNotFoundCarriesScanIdFromDetail() {
        let scanId = UUID()
        let mapped = DesignServicesError.map(message: "scan_not_found_or_not_owned", detail: scanId.uuidString)
        #expect(mapped == .scanNotFound(scanIds: [scanId]))
    }

    @Test
    func scanErrorWithoutParsableDetailHasEmptyScanIds() {
        let mapped = DesignServicesError.map(message: "scan_not_ready", detail: nil)
        #expect(mapped == .scanNotReady(scanIds: []))
    }

    @Test
    func unknownMessageFallsBackToSubmissionFailed() {
        #expect(DesignServicesError.map(message: "some unrelated db error", detail: nil) == .submissionFailed)
    }

    @Test
    func mapErrorPassesThroughTypedError() {
        let original = DesignServicesError.alreadySubmitted
        #expect(DesignServicesError.map(original) == .alreadySubmitted)
    }

    @Test
    func mapErrorWrapsUnknownAsNetworkError() {
        struct Boom: Error {}
        if case .networkError = DesignServicesError.map(Boom()) {
            // ok
        } else {
            Issue.record("expected .networkError")
        }
    }
}
