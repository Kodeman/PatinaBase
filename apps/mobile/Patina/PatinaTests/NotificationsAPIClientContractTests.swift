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

    // MARK: - P-05 · one count, not two

    /// `notify_client_attention()` (00534) writes an `in_app` row AND a `push`
    /// row for one event. A filter admitting both counted every attention
    /// twice, so the number a homeowner saw was roughly double the truth.
    @Test("the attention filter admits the in-app channel and nothing else")
    func attentionFilterIsInAppOnly() {
        #expect(NotificationsAPIClient.attentionChannelFilter == "eq.in_app")
        #expect(!NotificationsAPIClient.attentionChannelFilter.contains("push"))
    }

    /// Both filter sites read the one constant — the list and the mark-all
    /// PATCH, which must never disagree about which rows the feed is about.
    @Test("both channel filters are the one constant, and the pair is gone")
    func bothChannelSitesUseTheConstant() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Core/Network/NotificationsAPIClient.swift")
        )
        #expect(!code.contains("in.(in_app,push)"), "the double-reading filter is back")
        let uses = code.components(
            separatedBy: "URLQueryItem(name: \"channel\", value: Self.attentionChannelFilter)"
        ).count - 1
        #expect(uses == 2, "expected the list and the mark-all site, found \(uses)")
    }
}
