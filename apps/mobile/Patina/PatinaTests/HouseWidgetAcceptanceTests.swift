//
//  HouseWidgetAcceptanceTests.swift
//  PatinaTests
//
//  W1A-11 (T7) — the house widget as a tester meets it, judged across the
//  seam: the app's `RecordSnapshotStore` writes, and the widget's own
//  `HouseWidgetPayloadStore` reads the same directory. `HouseWidgetProvider`
//  does nothing but `store.load()`, and `PatinaTests` does not sync the widget
//  target, so the payload store is the provider's whole input.
//

import Foundation
import Testing
@testable import Patina

struct HouseWidgetAcceptanceTests {

    private let referenceDate = Date(timeIntervalSince1970: 1_787_000_000)

    final class ReloadCounter: @unchecked Sendable {
        private let lock = NSLock()
        private var kinds: [String] = []

        func record(_ kind: String) {
            lock.lock(); kinds.append(kind); lock.unlock()
        }

        var count: Int {
            lock.lock(); defer { lock.unlock() }; return kinds.count
        }
    }

    /// The app's writer and the widget's reader over one directory.
    private func seam(
        reloads: ReloadCounter,
        ownerId: String?
    ) -> (app: RecordSnapshotStore, widget: HouseWidgetPayloadStore) {
        let directory = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("patina.tests.widget-acceptance.\(UUID().uuidString)")
        let app = RecordSnapshotStore(
            appGroupIdentifier: "group.does.not.exist.\(UUID().uuidString)",
            fallbackDirectory: directory,
            reloadWidgets: { reloads.record($0) },
            ownerId: { ownerId },
            clearOwner: {},
            stampOwner: { _ in }
        )
        return (app, HouseWidgetPayloadStore(directory: directory))
    }

    private func row(_ id: String, _ kind: HouseRecordRow.Kind, _ route: AppRoute) -> HouseRecordRow {
        HouseRecordRow(
            id: id, kind: kind, title: "\(id) happened.", detail: nil,
            date: referenceDate, state: .none, isNew: true, route: route
        )
    }

    private func record(needsYou: [HouseRecordRow], moved: [HouseRecordRow]) -> HouseRecord {
        HouseRecord(
            needsYou: needsYou,
            moved: moved,
            window: DateInterval(start: referenceDate.addingTimeInterval(-604_800), end: referenceDate),
            lastSeenAt: nil, hasMoreNeedsYou: !needsYou.isEmpty, hasMoreMoved: false
        )
    }

    private var owed: [HouseRecordRow] {
        [
            row("invoice:i1", .invoiceDue, .invoiceDetail(invoiceId: "i1")),
            row("decision:d1", .decisionAsked, .decisionDetail(decisionId: "d1"))
        ]
    }

    @Test("a MOVED event reaches the widget’s reader, newest first, with a redraw")
    func aMovedEventUpdatesTheWidget() throws {
        let reloads = ReloadCounter()
        let (app, widget) = seam(reloads: reloads, ownerId: "owner-1")
        let first = row("message:m1", .messageReceived, .threadDetail(threadId: "t1"))

        app.save(record(needsYou: [], moved: [first]), houseLine: "Aspen Loft", now: referenceDate)
        let before = try #require(widget.load())
        #expect(before.drawableRows.map(\.id) == ["message:m1"])

        let shipped = row("order:direct:o1", .orderMoved, .orderDetail(orderId: "o1"))
        app.save(record(needsYou: [], moved: [shipped, first]), now: referenceDate.addingTimeInterval(60))
        let after = try #require(widget.load())
        #expect(after.drawableRows.map(\.id) == ["order:direct:o1", "message:m1"])
        #expect(after.houseLine == "Aspen Loft")
        #expect(reloads.count == 2, "each MOVED save asks the widget to redraw")
    }

    @Test("what is owed never reaches the widget’s reader, even when nothing moved")
    func theWidgetNeverShowsWhatIsOwed() throws {
        let reloads = ReloadCounter()
        let (app, widget) = seam(reloads: reloads, ownerId: "owner-1")

        app.save(record(needsYou: owed, moved: []), now: referenceDate)
        let payload = try #require(widget.load())
        #expect(payload.drawableRows.isEmpty)
        #expect(payload.isEmpty, "owed rows alone draw the empty line, not a row")
        #expect(!payload.isPlaceholder)

        let moved = row("message:m1", .messageReceived, .threadDetail(threadId: "t1"))
        app.save(record(needsYou: owed, moved: [moved]), now: referenceDate)
        let withMoved = try #require(widget.load())
        #expect(withMoved.drawableRows.map(\.id) == ["message:m1"])
    }

    @Test("with no owner the widget’s reader gets the placeholder, whatever the record held")
    func noOwnerIsThePlaceholder() throws {
        let reloads = ReloadCounter()
        let (app, widget) = seam(reloads: reloads, ownerId: nil)
        let moved = row("message:m1", .messageReceived, .threadDetail(threadId: "t1"))

        app.save(record(needsYou: owed, moved: [moved]), now: referenceDate)
        let payload = try #require(widget.load())
        #expect(payload.ownerId == nil)
        #expect(payload.isPlaceholder)
        #expect(payload.drawableRows.isEmpty, "an unowned payload drew a row")
    }

    @Test("signing out hands the widget’s reader the placeholder")
    func signOutLeavesThePlaceholder() throws {
        let reloads = ReloadCounter()
        let (app, widget) = seam(reloads: reloads, ownerId: "owner-1")
        let moved = row("message:m1", .messageReceived, .threadDetail(threadId: "t1"))
        app.save(record(needsYou: [], moved: [moved]), houseLine: "Aspen Loft", now: referenceDate)

        app.clearForSignedOut(now: referenceDate)

        let payload = try #require(widget.load())
        #expect(payload.isPlaceholder)
        #expect(payload.drawableRows.isEmpty)
        #expect(payload.houseLine == nil)
    }
}
