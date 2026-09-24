//
//  WidgetFlagOffRenderingTests.swift
//  PatinaTests
//
//  GAP7B-02, ruled by D5.
//
//  What shipped: `drawableRows` returned `[]` unless `flagOn`, and `flagOn`
//  mirrors `house-widget` — which is OFF for round one and stays off. A tester
//  who placed the widget got "Open Patina to see your house." forever, however
//  often they opened Patina. The file on disk had two real rows in it the whole
//  time (`shots/GAP7/41-widget-flag-off.png`).
//
//  D5: "Ship the widget in build 1, fixed: it renders its snapshot regardless
//  of `house-widget`." The flag is now retired and the app no longer writes
//  `flagOn`; these payloads keep the key because files older builds left in
//  the App Group still carry it, and they must still draw.
//
//  The placeholder is now about the ACCOUNT, not the flag: a payload with no
//  owner is the signed-out placeholder (B-16), and that is the only thing the
//  widget refuses to draw.
//

import Foundation
import Testing
@testable import Patina

struct WidgetFlagOffRenderingTests {

    private static let refreshed = Date(timeIntervalSince1970: 1_787_000_000)

    private func decode(_ json: String) throws -> HouseWidgetPayload {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(HouseWidgetPayload.self, from: Data(json.utf8))
    }

    @Test("house-widget off still draws the rows the app wrote")
    func theFlagOffStillDrawsTheSnapshot() throws {
        let payload = try decode("""
        {
          "flagOn": false,
          "ownerId": "a0000000-0000-0000-0000-000000000005",
          "refreshedAt": "2026-08-27T00:00:00Z",
          "movedRows": [
            { "id": "order:direct:abc", "title": "Meadow Linen Sectional shipped.", "date": "2026-08-26T00:00:00Z" }
          ]
        }
        """)

        #expect(!payload.isPlaceholder)
        #expect(payload.drawableRows.count == 1)
        #expect(payload.drawableRows.first?.title == "Meadow Linen Sectional shipped.")
    }

    @Test("an absent flag is no longer a reason to draw nothing")
    func anAbsentFlagStillDraws() throws {
        let payload = try decode("""
        {
          "ownerId": "a0000000-0000-0000-0000-000000000005",
          "refreshedAt": "2026-08-27T00:00:00Z",
          "movedRows": [
            { "id": "message:m1", "title": "Leah asked about the rug colour.", "date": "2026-08-26T00:00:00Z" }
          ]
        }
        """)

        #expect(payload.drawableRows.count == 1)
    }

    @Test("the only payload the widget refuses is the signed-out one")
    func onlyTheSignedOutPayloadIsAPlaceholder() throws {
        let signedOut = try decode("""
        { "flagOn": true, "refreshedAt": "2026-08-27T00:00:00Z", "movedRows": [
          { "title": "Should never be drawn.", "date": "2026-08-26T00:00:00Z" } ] }
        """)

        #expect(signedOut.isPlaceholder)
        #expect(signedOut.drawableRows.isEmpty)
    }

    @Test("an owned payload with an empty window is empty, not a placeholder")
    func anEmptyWindowIsNotAPlaceholder() throws {
        let payload = try decode("""
        {
          "flagOn": false,
          "ownerId": "a0000000-0000-0000-0000-000000000005",
          "refreshedAt": "2026-08-27T00:00:00Z",
          "sinceDate": "2026-08-20T00:00:00Z",
          "movedRows": []
        }
        """)

        #expect(!payload.isPlaceholder)
        #expect(payload.isEmpty)
    }

}
