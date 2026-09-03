//
//  HouseWidgetPayloadTests.swift
//  PatinaTests
//
//  W6, Q8 — the widget carries what MOVED, never what is owed.
//
//  These tests run against the widget's OWN decoder and its OWN link
//  vocabulary: `PatinaWidgetShared/HouseWidgetPayload.swift` is compiled into both
//  `PatinaWidget` and this test target through its own synchronized root group,
//  so there is no second copy that can pass here and fail on a Lock Screen.
//

import Foundation
import Testing
@testable import Patina

struct HouseWidgetPayloadTests {

    // MARK: - Fixtures

    private static let refreshed = Date(timeIntervalSince1970: 1_787_000_000)
    /// 2026-08-20 00:00 UTC — a Thursday, so M6b's ruled line can be asserted
    /// as the ruling words it.
    private static let thursday = Date(timeIntervalSince1970: 1_787_184_000)

    private static let posix = Locale(identifier: "en_US_POSIX")
    private static let utc = TimeZone(identifier: "UTC") ?? .current

    private func decode(_ json: String) throws -> HouseWidgetPayload {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(HouseWidgetPayload.self, from: Data(json.utf8))
    }

    // MARK: - The shape the app writes

    @Test("the minimal payload the brief names decodes")
    func minimalPayloadDecodes() throws {
        let snapshot = try decode("""
        {
          "flagOn": true,
          "ownerId": "a0000000-0000-0000-0000-000000000005",
          "refreshedAt": "2026-08-27T00:00:00Z",
          "houseLine": "Aspen Loft",
          "movedRows": [
            { "title": "Leah asked about the rug colour.", "date": "2026-08-26T00:00:00Z" }
          ]
        }
        """)

        #expect(snapshot.flagOn)
        #expect(snapshot.houseLine == "Aspen Loft")
        #expect(snapshot.movedRows.count == 1)
        #expect(snapshot.movedRows.first?.title == "Leah asked about the rug colour.")
        #expect(snapshot.movedRows.first?.id == nil)
        #expect(snapshot.drawableRows.count == 1)
    }

    @Test("the fuller payload — row ids and the window — decodes too")
    func fullerPayloadDecodes() throws {
        let snapshot = try decode("""
        {
          "version": 1,
          "flagOn": true,
          "ownerId": "a0000000-0000-0000-0000-000000000005",
          "refreshedAt": "2026-08-27T00:00:00Z",
          "sinceDate": "2026-08-27T04:00:00Z",
          "houseLine": "Aspen Loft",
          "movedRows": [
            { "id": "order:direct:abc", "title": "Your sectional shipped.", "date": "2026-08-26T00:00:00Z" }
          ]
        }
        """)

        #expect(snapshot.version == 1)
        #expect(snapshot.sinceDate != nil)
        #expect(snapshot.movedRows.first?.id == "order:direct:abc")
    }

    // MARK: - The honesty rule, structurally

    /// The payload may not carry what is owed. `HouseRecord` does — which is
    /// exactly why the widget reads a different file with a different shape.
    @Test("a payload carrying needsYou or a count decodes, and none of it is reachable")
    func whatIsOwedCannotBeDrawn() throws {
        let snapshot = try decode("""
        {
          "flagOn": true,
          "ownerId": "a0000000-0000-0000-0000-000000000005",
          "refreshedAt": "2026-08-27T00:00:00Z",
          "needsYou": [
            { "title": "Your invoice is due.", "date": "2026-08-26T00:00:00Z" }
          ],
          "needsYouCount": 3,
          "badge": 3,
          "movedRows": [
            { "title": "Your sectional shipped.", "date": "2026-08-26T00:00:00Z" }
          ]
        }
        """)

        #expect(snapshot.movedRows.count == 1)
        #expect(snapshot.drawableRows.count == 1)
        #expect(snapshot.drawableRows.first?.title == "Your sectional shipped.")
    }

    /// The pin that keeps it structural: no member, in either the shared model
    /// or the widget's own views, that a count could be drawn from.
    @Test("neither the model nor the widget names what is owed")
    func theWidgetHasNoLanguageForACount() throws {
        var sources = [try SourcePin.read("PatinaWidgetShared/HouseWidgetPayload.swift")]
        for path in SourcePin.swiftFiles(under: "PatinaWidget") {
            sources.append(try String(contentsOf: URL(fileURLWithPath: path), encoding: .utf8))
        }

        for source in sources {
            let code = SourceScan.code(in: source)
            #expect(!code.contains("needsYou"), "Q8: the widget carries what moved, never what is owed")
            #expect(!code.contains("badge"), "C5: no badge")
            #expect(!code.contains("isNew"), "C5: no fabricated new")
            #expect(!code.contains(".count"), "B §4: no count on either surface")
        }
    }

    @Test("the widget draws at most two rows, whatever the file holds")
    func theSurfaceCannotBeWidenedByTheFile() throws {
        let rows = (0..<6).map { index in
            """
            { "title": "Row \(index)", "date": "2026-08-26T00:00:00Z" }
            """
        }.joined(separator: ",")
        let snapshot = try decode("""
        { "flagOn": true, "ownerId": "owner-1", "refreshedAt": "2026-08-27T00:00:00Z",
          "movedRows": [\(rows)] }
        """)

        #expect(snapshot.movedRows.count == 6)
        #expect(snapshot.drawableRows.count == HouseWidgetPayload.maximumRows)
        #expect(snapshot.drawableRows.first?.title == "Row 0")
    }

    // MARK: - The flag

    /// **Rewritten by D5 (2026-09-02).** This test used to assert that
    /// `flagOn: false` drew nothing — which is exactly the behaviour
    /// `GAP7B-02` filed: `house-widget` is off for round one, so a tester who
    /// placed the widget read "Open Patina to see your house." forever with
    /// real rows in the file. D5: the flag gates in-app promotion, not what a
    /// placed widget draws. What it still gates is on the wire, and asserted.
    @Test("the flag off no longer stops a placed widget from drawing")
    func theFlagOffStillDraws() throws {
        let snapshot = try decode("""
        {
          "flagOn": false,
          "ownerId": "a0000000-0000-0000-0000-000000000005",
          "refreshedAt": "2026-08-27T00:00:00Z",
          "movedRows": [{ "title": "Your sectional shipped.", "date": "2026-08-26T00:00:00Z" }]
        }
        """)

        #expect(!snapshot.flagOn)
        #expect(!snapshot.isPlaceholder)
        #expect(snapshot.drawableRows.count == 1)
    }

    /// The placeholder is now about the ACCOUNT: a payload nobody owns is the
    /// signed-out one, and the only thing the widget refuses to draw (B-16).
    @Test("a payload with no owner is the placeholder")
    func anUnownedPayloadIsThePlaceholder() throws {
        let snapshot = try decode("""
        { "flagOn": true, "refreshedAt": "2026-08-27T00:00:00Z", "movedRows": [] }
        """)
        #expect(snapshot.ownerId == nil)
        #expect(snapshot.isPlaceholder)
        #expect(snapshot.drawableRows.isEmpty)
    }

    // MARK: - Staleness (C5: a stale snapshot says when it was refreshed)

    @Test("a fresh payload carries no apology")
    func aFreshPayloadSaysNothingAboutItself() {
        let snapshot = HouseWidgetPayload(flagOn: true, refreshedAt: Self.refreshed, movedRows: [])
        let line = snapshot.refreshedLine(now: Self.refreshed.addingTimeInterval(60 * 60), locale: Self.posix)
        #expect(line == nil)
    }

    @Test("past six hours the widget says when it was refreshed")
    func aStalePayloadSaysSo() throws {
        let snapshot = HouseWidgetPayload(flagOn: true, refreshedAt: Self.refreshed, movedRows: [])
        let line = try #require(
            snapshot.refreshedLine(now: Self.refreshed.addingTimeInterval(8 * 60 * 60), locale: Self.posix)
        )
        #expect(line.hasPrefix("Refreshed "))
        #expect(line.contains("hours"))
    }

    // MARK: - Copy

    @Test("the empty variant is M6b's line, with the day from the window")
    func theEmptyLineNamesTheDayTheWindowNames() {
        let snapshot = HouseWidgetPayload(
            flagOn: true, refreshedAt: Self.refreshed, movedRows: [],
            sinceDate: Self.thursday, ownerId: "owner-1"
        )
        #expect(snapshot.emptyLine(locale: Self.posix, timeZone: Self.utc) == "Nothing moved since Thursday.")
        #expect(snapshot.eyebrow(locale: Self.posix, timeZone: Self.utc) == "Since Thu")
        #expect(snapshot.isEmpty)
    }

    @Test("without a window the copy claims no day")
    func withoutAWindowNoDayIsInvented() {
        let snapshot = HouseWidgetPayload(flagOn: true, refreshedAt: Self.refreshed, movedRows: [])
        #expect(snapshot.emptyLine(locale: Self.posix, timeZone: Self.utc) == "Nothing moved.")
        #expect(snapshot.eyebrow(locale: Self.posix, timeZone: Self.utc) == "What moved")
    }

    @Test("the no-data copy is the screen sheet's, verbatim")
    func theNoDataCopyIsTheRuledOne() {
        #expect(HouseWidgetCopy.noData == "Open Patina to see your house.")
    }

    // MARK: - The store

    @Test("an absent file is no data, not an empty record")
    func anAbsentFileIsNoData() throws {
        let directory = try Self.temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        #expect(HouseWidgetPayloadStore(directory: directory).load() == nil)
    }

    @Test("an undecodable file is no data, never a guess")
    func anUndecodableFileIsNoData() throws {
        let directory = try Self.temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = HouseWidgetPayloadStore(directory: directory)
        try Data("{ not json".utf8).write(to: store.fileURL)
        #expect(store.load() == nil)
    }

    @Test("the store reads the file the app writes, beside the record — not the record")
    func theStoreReadsItsOwnFile() throws {
        let directory = try Self.temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = HouseWidgetPayloadStore(directory: directory)

        #expect(HouseWidgetPayload.fileName == "widget-snapshot.json")
        #expect(HouseWidgetPayload.fileName != RecordSnapshotStore.fileName)
        #expect(store.fileURL.lastPathComponent == "widget-snapshot.json")
        #expect(HouseWidgetPayloadStore.appGroupIdentifier == "group.cloud.patina.app")

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        try encoder.encode(
            HouseWidgetPayload(
                flagOn: true, refreshedAt: Self.refreshed,
                movedRows: [HouseWidgetPayloadRow(id: "order:direct:abc", title: "Shipped.", date: Self.refreshed)],
                ownerId: "owner-1"
            )
        ).write(to: store.fileURL)

        let loaded = try #require(store.load())
        #expect(loaded.drawableRows.first?.id == "order:direct:abc")
    }

    // MARK: - The link vocabulary

    @Test("the widget's plain door is patina://today")
    func theWidgetOpensTodayPlain() {
        #expect(PatinaWidgetLinks.today.absoluteString == "patina://today")
        #expect(PatinaWidgetLinks.scheme == "patina")
    }

    @Test("a row's door carries its id, colons and all")
    func aRowsDoorCarriesItsId() {
        #expect(PatinaWidgetLinks.record(rowId: "thread:abc").absoluteString == "patina://record/thread:abc")
        // `ClientOrder.id` is itself a prefixed token, so a row id can carry
        // two colons and must still arrive as ONE path component.
        let url = PatinaWidgetLinks.record(rowId: "order:direct:abc")
        #expect(url.pathComponents.dropFirst().joined(separator: "/") == "order:direct:abc")
    }

    @Test("a row with no id opens Today rather than nothing")
    func aRowWithoutAnIdStillOpensSomewhereTrue() {
        #expect(PatinaWidgetLinks.link(for: nil) == PatinaWidgetLinks.today)
        let row = HouseWidgetPayloadRow(title: "Shipped.", date: Self.refreshed)
        #expect(PatinaWidgetLinks.link(for: row) == PatinaWidgetLinks.today)
        let identified = HouseWidgetPayloadRow(id: "order:direct:abc", title: "Shipped.", date: Self.refreshed)
        #expect(PatinaWidgetLinks.link(for: identified).absoluteString == "patina://record/order:direct:abc")
    }

    // MARK: - Helper

    private static func temporaryDirectory() throws -> URL {
        let directory = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("patina-widget-tests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }
}
