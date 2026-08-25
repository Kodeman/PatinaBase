//  VisitContextTests.swift
//  CaptureTests
//
//  The visit spine (Field Companion wave 3, packages 3-2). Patina Field is not
//  live anywhere, so there is deliberately NO legacy-decode test here.

import Foundation
import Testing
@testable import CaptureKit

struct VisitContextTests {

    private let identity = CaptureSessionIdentity(userID: "u1", workspaceID: "w1")
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    @Test func aContextWithNoKindIsNotAVisit() {
        let context = CaptureSessionContext(identity: identity, startedAt: now, lastActivityAt: now)
        #expect(context.kind == nil)
        #expect(!context.isVisit)
    }

    @Test func aKindedContextIsAVisitUntilItEnds() {
        var context = CaptureSessionContext(identity: identity, startedAt: now,
                                            lastActivityAt: now, kind: .site,
                                            kit: .walkThrough, label: "Maple St")
        #expect(context.isVisit)
        context.endedAt = now.addingTimeInterval(600)
        #expect(!context.isVisit)
    }

    @Test func theVisitRoundTripsThroughCodable() throws {
        let context = CaptureSessionContext(
            identity: identity, startedAt: now, lastActivityAt: now,
            kind: .sourcing, kit: .install, label: "High Point 214",
            scanRoomID: "r1", projectsInMind: ["p1", "p2"], endedAt: nil)
        let data = try JSONEncoder().encode(context)
        let decoded = try JSONDecoder().decode(CaptureSessionContext.self, from: data)
        #expect(decoded == context)
        #expect(decoded.kit == .install)
        #expect(decoded.kit?.rawValue == "install")
    }

    @Test func kitRawValuesAreTheSchemaVocabulary() {
        #expect(FieldVisitKit.walkThrough.rawValue == "walk_through")
        #expect(FieldVisitKit.tradeWalk.rawValue == "trade_walk")
        #expect(FieldVisitKit.install.rawValue == "install")
        #expect(FieldVisitKind.allCases.map(\.rawValue) == ["site", "sourcing"])
    }
}
