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

    // MARK: - W1R2-m1 · the read narrows, the write does not

    /// 00534 writes an `in_app` row AND a `push` row for one event. Marking
    /// only the in-app leg opened left its twin `opened_at IS NULL` forever —
    /// a row every server-side unread count, the springboard badge included,
    /// still sees. One event is read once, on both legs (ruled, 2026-09-05).
    @Test("the opened write marks both delivery legs")
    func theOpenedWriteMarksBothLegs() {
        #expect(NotificationsAPIClient.openedWriteChannelFilter == "in.(in_app,push)")
        #expect(NotificationsAPIClient.openedWriteChannelFilter.contains("in_app"))
        #expect(NotificationsAPIClient.openedWriteChannelFilter.contains("push"))
        // …and the read is still the one channel the feed is about.
        #expect(NotificationsAPIClient.attentionChannelFilter == "eq.in_app")
    }

    // MARK: - W1R2-M3 · the widened write may not launder a failed delivery

    /// The push leg is the one that carries delivery state:
    /// `notify_client_attention` inserts it `queued` (00534:192) and
    /// `apns-send` stamps it `delivered` or `failed`. Widening the opened
    /// write to reach that leg put a mark-all in a position to rewrite a
    /// terminal `failed` to `opened` — the record then says she read a notice
    /// that never arrived, and P-28's retry sweep, keyed on `failed`, would
    /// skip exactly the rows that were laundered.
    @Test("the opened write leaves a failed delivery alone")
    func theOpenedWriteLeavesAFailedDeliveryAlone() {
        #expect(
            NotificationsAPIClient.openedWriteStatusFilter
                == "in.(queued,sending,delivered,unconfirmed)"
        )
        #expect(!NotificationsAPIClient.openedWriteStatusFilter.contains("failed"))
        #expect(!NotificationsAPIClient.openedWriteStatusFilter.contains("suppressed"))
    }

    /// …and the mark-all request actually carries it, beside the channel.
    @Test("mark-all sends the status predicate with the channel predicate")
    func markAllSendsTheStatusPredicate() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Core/Network/NotificationsAPIClient.swift")
        )
        let markAll = try #require(code.range(of: "public func markAllOpened() async throws {"))
        let body = String(code[markAll.upperBound...].prefix(400))
        #expect(body.contains(
            "URLQueryItem(name: \"channel\", value: Self.openedWriteChannelFilter)"
        ))
        #expect(body.contains(
            "URLQueryItem(name: \"status\", value: Self.openedWriteStatusFilter)"
        ))
        // The single-row mark is addressed by id and keeps no status leg; the
        // constant belongs to mark-all alone.
        let uses = code.components(
            separatedBy: "value: Self.openedWriteStatusFilter"
        ).count - 1
        #expect(uses == 1, "expected the mark-all site alone, found \(uses)")
    }

    /// Each site reads its own constant, and neither reads the other's: the
    /// list may never admit the push leg, and mark-all may never leave it.
    @Test("the read site and the write site read their own constants")
    func eachChannelSiteReadsItsOwnConstant() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Core/Network/NotificationsAPIClient.swift")
        )
        let reads = code.components(
            separatedBy: "URLQueryItem(name: \"channel\", value: Self.attentionChannelFilter)"
        ).count - 1
        #expect(reads == 1, "expected the list site alone, found \(reads)")
        let writes = code.components(
            separatedBy: "URLQueryItem(name: \"channel\", value: Self.openedWriteChannelFilter)"
        ).count - 1
        #expect(writes == 1, "expected the mark-all site alone, found \(writes)")
        #expect(!code.contains("value: \"in.(in_app,push)\""),
                "the filter is typed at a call site instead of read from the constant")
    }
}
