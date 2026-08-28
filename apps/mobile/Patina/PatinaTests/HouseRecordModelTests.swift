//
//  HouseRecordModelTests.swift
//  PatinaTests
//
//  The record is written to disk so Today can paint before any fetch lands,
//  and `AppRoute` is Hashable but not Codable — so the row's route travels as
//  a token. If that token drops a case, a row silently stops being tappable
//  after a cold launch, which is the failure these tests exist to catch.
//

import Foundation
import Testing
@testable import Patina

struct HouseRecordModelTests {

    private let referenceDate = Date(timeIntervalSince1970: 1_787_000_000)

    private func row(
        id: String = "row-1",
        kind: HouseRecordRow.Kind = .decisionAsked,
        state: HouseRecordRow.State = .none,
        route: AppRoute? = nil,
        isNew: Bool = false
    ) -> HouseRecordRow {
        HouseRecordRow(
            id: id, kind: kind, title: "Leah asked you to choose.",
            detail: "Rug color — Natural vs Sand", date: referenceDate,
            state: state, isNew: isNew, route: route
        )
    }

    private func roundTrip(_ record: HouseRecord) throws -> HouseRecord {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(HouseRecord.self, from: encoder.encode(record))
    }

    private func record(
        needsYou: [HouseRecordRow] = [], moved: [HouseRecordRow] = []
    ) -> HouseRecord {
        HouseRecord(
            needsYou: needsYou, moved: moved,
            window: DateInterval(start: referenceDate.addingTimeInterval(-604_800),
                                 end: referenceDate),
            lastSeenAt: referenceDate.addingTimeInterval(-86_400),
            hasMoreNeedsYou: false, hasMoreMoved: false
        )
    }

    // MARK: - Empty

    @Test("a record with no rows on either eyebrow is empty")
    func anEmptyRecordIsEmpty() {
        #expect(record().isEmpty)
        #expect(HouseRecord.empty.isEmpty)
    }

    @Test("one row on either eyebrow is not empty")
    func oneRowIsNotEmpty() {
        #expect(!record(needsYou: [row()]).isEmpty)
        #expect(!record(moved: [row(kind: .story)]).isEmpty)
    }

    // MARK: - State

    @Test("every state the record can carry round-trips through JSON")
    func everyStateRoundTripsThroughJSON() throws {
        let states: [HouseRecordRow.State] = [
            .none,
            .overdue,
            .due(referenceDate),
            .amount(cents: 425_000, due: referenceDate),
            .amount(cents: 425_000, due: nil),
            .new
        ]
        let rows = states.enumerated().map { index, state in
            row(id: "row-\(index)", state: state)
        }

        let decoded = try roundTrip(record(needsYou: rows))

        #expect(decoded.needsYou.map(\.state) == states)
    }

    // MARK: - Route

    @Test("every route the record emits survives encoding")
    func theRoutesTheRecordEmitsSurviveEncoding() throws {
        let routes: [AppRoute] = [
            .decisionDetail(decisionId: "d1"),
            .proposalDetail(proposalId: "p1"),
            .invoiceDetail(invoiceId: "i1"),
            .threadDetail(threadId: "t1"),
            .projectDetail(projectId: "pr1"),
            .pieceDetail(pieceId: "piece-1"),
            .designRequests(focusLeadId: "lead-1"),
            .designRequests(focusLeadId: nil)
        ]
        let rows = routes.enumerated().map { index, route in
            row(id: "row-\(index)", route: route)
        }

        let decoded = try roundTrip(record(moved: rows))

        #expect(decoded.moved.map(\.route) == routes)
    }

    @Test("a row with no route stays routeless")
    func aRoutelessRowStaysRouteless() throws {
        let decoded = try roundTrip(record(moved: [row(route: nil)]))
        #expect(decoded.moved.first?.route == nil)
    }

    @Test("a route the record never emits decodes back as no route, not a crash")
    func anUnmappedRouteIsDropped() throws {
        let decoded = try roundTrip(record(moved: [row(route: .styleQuiz)]))
        #expect(decoded.moved.count == 1)
        #expect(decoded.moved.first?.route == nil)
    }

    // MARK: - Whole record

    @Test("the window, the last visit and the has-more flags all survive")
    func theRecordEnvelopeSurvives() throws {
        let original = HouseRecord(
            needsYou: [row(isNew: false)],
            moved: [row(id: "m1", kind: .story, isNew: true)],
            window: DateInterval(start: referenceDate.addingTimeInterval(-1_209_600),
                                 end: referenceDate),
            lastSeenAt: referenceDate.addingTimeInterval(-1_209_600),
            hasMoreNeedsYou: true, hasMoreMoved: false
        )

        let decoded = try roundTrip(original)

        #expect(decoded == original)
        #expect(decoded.hasMoreNeedsYou)
        #expect(!decoded.hasMoreMoved)
        #expect(decoded.moved.first?.isNew == true)
    }
}
