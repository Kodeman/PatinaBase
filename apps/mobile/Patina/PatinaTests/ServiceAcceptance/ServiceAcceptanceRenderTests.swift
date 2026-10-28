//
//  ServiceAcceptanceRenderTests.swift
//  PatinaTests
//
//  US-52 WP-10C-d. The detail sheet's body, rendered through `ImageRenderer`
//  in the states the ticket names, in both appearances. The shots land in the
//  app's Documents/sq-2228 for collection with
//  `xcrun simctl get_app_container <udid> cloud.patina.app data`.
//
//  A signed-in walk needs a seeded service-acceptance request on a database
//  this lane may not write, so the states are driven from a fake service
//  instead; each shot is asserted to have drawn something.
//

import Testing
import SwiftUI
import UIKit
import Foundation
@testable import Patina

private actor StubService: ServiceAcceptanceService {
    let rows: [RemoteServiceAcceptanceRequest]
    let failure: Error?
    let completion: RemoteStudioServiceCompletionRead

    init(rows: [RemoteServiceAcceptanceRequest], failure: Error? = nil,
         completion: RemoteStudioServiceCompletionRead = RemoteStudioServiceCompletionRead()) {
        self.rows = rows
        self.failure = failure
        self.completion = completion
    }

    func fetchMyServiceAcceptanceRequests() async throws -> [RemoteServiceAcceptanceRequest] { rows }

    func respondToServiceAcceptance(_ submission: ServiceAcceptanceSubmission) async throws {
        if let failure { throw failure }
    }

    func fetchStudioServiceCompletion(projectId: String) async throws -> RemoteStudioServiceCompletionRead {
        completion
    }
}

@MainActor
struct ServiceAcceptanceRenderTests {

    private static var shotsDirectory: URL {
        FileManager.default
            .urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("sq-2228", isDirectory: true)
    }

    private static let size = CGSize(width: 393, height: 760)

    private static func model(_ json: String, failure: Error? = nil,
                              completion: RemoteStudioServiceCompletionRead = RemoteStudioServiceCompletionRead())
        async throws -> ServiceAcceptanceModel {
        let request = try ServiceAcceptanceFixture.request(json)
        let model = ServiceAcceptanceModel(
            service: StubService(rows: [request], failure: failure, completion: completion)
        )
        await model.load()
        model.presentedRequestId = request.requestId
        // ImageRenderer never runs `.task`; read the studio service directly.
        await model.loadStudioService(for: request)
        return model
    }

    private static func shoot(_ model: ServiceAcceptanceModel, _ name: String,
                              _ style: UIUserInterfaceStyle) -> Int {
        let view = ServiceAcceptanceDetailContent(model: model)
            .padding(24)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(PatinaColors.Background.primary)
        let raster = RenderPin.raster(view, size: size, style: style)
        let renderer = ImageRenderer(
            content: view
                .frame(width: size.width, height: size.height)
                .environment(\.colorScheme, style == .dark ? .dark : .light)
        )
        renderer.scale = 3
        if let png = renderer.uiImage?.pngData() {
            try? FileManager.default.createDirectory(at: shotsDirectory, withIntermediateDirectories: true)
            try? png.write(to: shotsDirectory.appendingPathComponent("\(name)-\(PatinaContrast.name(style)).png"))
        }
        return raster.distinctTones
    }

    @Test("the sheet body renders in every named state, in both appearances")
    func statesRender() async throws {
        let required = try await Self.model(ServiceAcceptanceFixture.row())
        let conditions = try await Self.model(ServiceAcceptanceFixture.row())
        conditions.choose(.acceptWithConditions)
        let observer = try await Self.model(ServiceAcceptanceFixture.row(viewerRole: "unrecognised_role"))
        let paused = try await Self.model(
            ServiceAcceptanceFixture.row(),
            failure: RoomsAPIError.http(
                status: 403,
                body: #"{"code":"42501","message":"permission denied for function respond_service_acceptance"}"#
            )
        )
        paused.choose(.accept)
        if let request = paused.request(id: "req-1") { await paused.submit(for: request) }
        #expect(paused.refusal == .paused)
        let closed = try await Self.model(
            ServiceAcceptanceFixture.row(lifecycle: "closed", aggregateOutcome: "accepted",
                                         viewerResponse: "accept", method: "ios_authenticated")
        )

        let overLimit = try await Self.model(ServiceAcceptanceFixture.row())
        overLimit.choose(.returnToStudio)
        overLimit.returnReason = String(repeating: "a", count: 2001)
        #expect(overLimit.draftIssue == .reasonTooLong)
        let recorded = try await Self.model(ServiceAcceptanceFixture.row())
        recorded.choose(.accept)
        if let request = recorded.request(id: "req-1") { await recorded.submit(for: request) }
        #expect(recorded.settled["req-1"]?.answer == .accept)

        let states: [(String, ServiceAcceptanceModel)] = [
            ("01-required-signer", required), ("02-accept-with-conditions", conditions),
            ("03-unknown-role-observer", observer), ("04-paused", paused), ("05-closed-accepted", closed),
            ("06-return-over-limit", overLimit), ("07-recorded-awaiting-reload", recorded)
        ]
        Self.shootAll(states)
    }

    @Test("the Studio service section renders in each state, in both appearances")
    func studioServiceRenders() async throws {
        let accepted = StudioServiceFixture.accepted
        let complete = try await Self.model(
            accepted, completion: try StudioServiceFixture.read(StudioServiceFixture.completion(state: "completed"))
        )
        let request = try #require(complete.request(id: "req-1"))
        #expect(complete.studioService(for: request)?.status == .complete)
        let conditions = try await Self.model(
            accepted,
            completion: try StudioServiceFixture.read(StudioServiceFixture.completion(state: "completed_with_conditions"))
        )
        let notYet = try await Self.model(accepted, completion: try StudioServiceFixture.read())
        Self.shootAll([
            ("08-studio-service-complete", complete), ("09-studio-service-conditions", conditions),
            ("10-studio-service-not-yet", notYet)
        ])
    }

    private static func shootAll(_ states: [(String, ServiceAcceptanceModel)]) {
        for style in PatinaContrast.appearances {
            for (name, model) in states {
                let tones = shoot(model, name, style)
                #expect(tones > 4, "\(name) rasterised to \(tones) tone(s) in \(PatinaContrast.name(style))")
            }
        }
    }
}
