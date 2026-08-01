//
//  NotificationsAPIClientContractTests.swift
//  PatinaTests
//
//  Keeps the native feed aligned with the delivery state machine. An
//  `unconfirmed` attempt is terminal but still belongs in user-visible history.
//

import Testing
import Foundation
@testable import Patina

struct NotificationsAPIClientContractTests {

    @Test("notification history includes unconfirmed delivery attempts")
    func visibleStatusesIncludeUnconfirmed() {
        #expect(
            NotificationsAPIClient.visibleStatusFilter
                == "in.(queued,sending,delivered,unconfirmed,opened,clicked)"
        )
    }

    @Test("the list request uses the audited visible status contract")
    func listRequestUsesVisibleStatusFilter() throws {
        let sourceURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // PatinaTests
            .deletingLastPathComponent() // Patina project directory
            .appendingPathComponent("Patina/Core/Network/NotificationsAPIClient.swift")
        let source = try String(contentsOf: sourceURL, encoding: .utf8)
        #expect(source.contains("URLQueryItem(name: \"status\", value: Self.visibleStatusFilter)"))
        #expect(!source.contains("in.(queued,sending,delivered,opened,clicked)"))
    }
}
