//
//  WidgetProjectionTests.swift
//  PatinaTests
//
//  W1 · L1-F — what the widget projects, and where each row goes.
//
//   • GAP7B-05 — the first drawn row was a story with no route at all, so the
//     widget's only live tap target resolved to `.heroFrame`. Two byte-identical
//     screenshots proved the fallback: a real story id and a made-up one both
//     opened Today.
//   • GAP7B-04 — the whole small card was ONE tap target, and it did not point
//     at either drawn row.
//   • GAP7B-03 — "A new story fro…", "Meadow Linen…". Two half-sentences were
//     the whole content of the widget.
//
//  D5 adds the medium family, where per-row `Link`s are possible at all.
//

import Foundation
import Testing
@testable import Patina

struct WidgetProjectionTests {

    private let referenceDate = Date(timeIntervalSince1970: 1_787_000_000)

    private func row(id: String, kind: HouseRecordRow.Kind, route: AppRoute?) -> HouseRecordRow {
        HouseRecordRow(
            id: id, kind: kind, title: "\(id) happened.", detail: nil,
            date: referenceDate, state: .none, isNew: true, route: route
        )
    }

    private func record(moved: [HouseRecordRow]) -> HouseRecord {
        HouseRecord(
            needsYou: [row(id: "invoice:i1", kind: .invoiceDue, route: .invoiceDetail(invoiceId: "i1"))],
            moved: moved,
            window: DateInterval(start: referenceDate.addingTimeInterval(-604_800), end: referenceDate),
            lastSeenAt: nil, hasMoreNeedsYou: false, hasMoreMoved: false
        )
    }

    private func snapshot(moved: [HouseRecordRow]) -> WidgetSnapshot {
        WidgetSnapshot(
            record: record(moved: moved), houseLine: "Aspen Loft",
            refreshedAt: referenceDate, flagOn: true, ownerId: "owner-1"
        )
    }

    // MARK: - GAP7B-05 — a projected row always has somewhere to go

    @Test("a row with no route is not projected at all")
    func everyProjectedRowCarriesARoute() {
        let projected = snapshot(moved: [
            row(id: "story:a8b3f8a0", kind: .story, route: nil),
            row(id: "order:direct:abc", kind: .orderMoved, route: .orderDetail(orderId: "direct:abc"))
        ])

        #expect(projected.movedRows.map(\.id) == ["order:direct:abc"])
        #expect(projected.movedRows.allSatisfy { $0.route != nil })
    }

    /// The round trip, not just the projection: every id the widget can carry
    /// resolves back through the app's own resolver to that row's own route —
    /// never to the `.heroFrame` fallback the widget takes when it cannot
    /// resolve an id.
    @MainActor
    @Test("every projected row resolves to its own destination, never the Today fallback")
    func everyProjectedRowResolvesToItself() throws {
        let source = record(moved: [
            row(id: "story:a8b3f8a0", kind: .story, route: nil),
            row(id: "message:m1", kind: .messageReceived, route: .threadDetail(threadId: "t1")),
            row(id: "order:direct:abc", kind: .orderMoved, route: .orderDetail(orderId: "direct:abc"))
        ])
        let projected = WidgetSnapshot(
            record: source, houseLine: nil, refreshedAt: referenceDate, flagOn: true, ownerId: "owner-1"
        )

        for widgetRow in projected.movedRows {
            let payloadRow = HouseWidgetPayloadRow(
                id: widgetRow.id, title: widgetRow.title, date: widgetRow.date
            )
            let link = PatinaWidgetLinks.link(for: payloadRow)
            #expect(link != PatinaWidgetLinks.today, "\(widgetRow.id) fell back to the plain door")
            let resolved = DeepLinkHandler.route(forWidgetLink: link, in: source)
            #expect(resolved != .heroFrame, "\(widgetRow.id) resolved to Today rather than itself")
        }
    }

    @Test("a record whose MOVED half is all stories projects nothing rather than a dead row")
    func allStoriesProjectNothing() {
        let projected = snapshot(moved: [
            row(id: "story:one", kind: .story, route: nil),
            row(id: "story:two", kind: .story, route: nil)
        ])
        #expect(projected.movedRows.isEmpty)
    }

    // MARK: - GAP7B-04 — one tap target, one destination

    /// `systemSmall` cannot host per-row `Link`s: the family has one
    /// `widgetURL` and it wins every pixel. So it draws ONE row, and that row's
    /// own door is the card's door.
    @Test("the small family draws one row and points at that row")
    func theSmallFamilyDrawsOneRowAndPointsAtIt() throws {
        let source = try SourcePin.read("PatinaWidget/HouseWidgetViews.swift")
        let code = SourceScan.code(in: source)

        #expect(code.contains("PatinaWidgetLinks.link(for: snapshot?.drawableRows.first)"))
        #expect(
            !code.contains("SmallHomeView(snapshot: snapshot, now: entry.date)\n                .widgetURL(PatinaWidgetLinks.today)"),
            "GAP7B-04: the small card must not point at Today while drawing rows"
        )
        #expect(code.contains("firstRow"), "the small family draws a single named row")
    }

    @Test("the medium family gives every row its own Link")
    func theMediumFamilyGivesEveryRowItsOwnDoor() throws {
        let views = SourceScan.code(in: try SourcePin.read("PatinaWidget/HouseWidgetViews.swift"))
        let widget = SourceScan.code(in: try SourcePin.read("PatinaWidget/HouseWidget.swift"))

        #expect(widget.contains(".systemMedium"), "D5: the medium family ships in build 1")
        #expect(views.contains("case .systemMedium:"))
        #expect(views.contains("Link(destination: PatinaWidgetLinks.link(for: row))"))
    }

    // MARK: - GAP7B-03 — no title is cut mid-word

    @Test("row titles wrap and scale rather than truncating")
    func rowTitlesWrapRatherThanTruncate() throws {
        let code = SourceScan.code(in: try SourcePin.read("PatinaWidget/HouseWidgetViews.swift"))

        #expect(code.contains(".lineLimit(2)"))
        #expect(code.contains(".minimumScaleFactor("))
        #expect(!code.contains("lineLimit(index == 0 ? 2 : 1)"), "GAP7B-03: the second row truncated")
    }

    // MARK: - The rulings the projection still obeys

    @Test("NEEDS YOU still never reaches the widget")
    func whatIsOwedIsStillNotProjected() throws {
        let projected = snapshot(moved: [
            row(id: "message:m1", kind: .messageReceived, route: .threadDetail(threadId: "t1"))
        ])
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let json = try #require(String(data: try encoder.encode(projected), encoding: .utf8))

        #expect(!json.contains("needsYou"))
        #expect(!json.contains("invoice:i1"))
    }

    @Test("the eyebrow names the window the app computed, not today")
    func theEyebrowComesFromTheWindow() {
        let projected = snapshot(moved: [
            row(id: "message:m1", kind: .messageReceived, route: .threadDetail(threadId: "t1"))
        ])
        #expect(projected.sinceDate == referenceDate.addingTimeInterval(-604_800))
    }
}
