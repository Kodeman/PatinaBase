//
//  BadgeFreshnessTests.swift
//  PatinaTests
//
//  C2-07 — read every row, pop back, and the bell still badged three.
//
//  Two independent `NotificationsViewModel` instances: Today held one in
//  `@State` and computed the badge from it (`DailyRoomView.swift:28,258`), the
//  feed held its own (`NotificationFeedView.swift:12`), and `markRead` /
//  `markAllRead` mutated only the feed's. Today reloaded from `.task` — once
//  per mount — so popping back to a mounted Today refreshed nothing.
//
//  ── The VISION check, run and ruled (PROGRAM.md §3 · L1-F, verbatim) ──
//  VISION §6 refuses badges. This fix makes a badge CORRECT rather than asking
//  whether the app should carry one. Ruling: it stays, in one form only — a
//  single count of *what needs you*, the same derived number `A-81` mandates in
//  L1-B, rendered on the bell and mirrored to the app icon. That is the
//  homeowner half of VISION §4, not decoration, and it is one number rather
//  than four. What does NOT survive: any second badge, any badge on a surface
//  that is not the bell or the icon, and any red-as-meaning. This suite asserts
//  the count comes from `BadgeCountService`; L1-B's `AttentionCountTests`
//  asserts there is only one such count in the app. Both, together, are the rule.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct BadgeFreshnessTests {

    private func delivered(id: String, isRead: Bool) -> AppNotification {
        AppNotification(
            remoteId: id,
            type: .decision,
            title: "A decision needs you",
            body: "Shaker oak or rift white.",
            timestamp: Date(timeIntervalSince1970: 1_787_000_000),
            isRead: isRead,
            entityType: "decision",
            entityId: id
        )
    }

    private func composed(id: String) -> AppNotification {
        AppNotification(
            type: .invoice,
            title: "An invoice is waiting",
            body: "",
            timestamp: Date(timeIntervalSince1970: 1_787_000_000),
            isRead: true,
            entityType: "invoice",
            entityId: id,
            isStudioFallback: true
        )
    }

    // MARK: - One source

    @Test("the count is derived from the rows the feed is holding")
    func theCountComesFromTheRows() {
        let service = BadgeCountService.makeForTests()
        service.applyNotificationRows([
            delivered(id: "d1", isRead: false),
            delivered(id: "d2", isRead: false),
            delivered(id: "d3", isRead: true)
        ])
        #expect(service.unreadNotificationCount == 2)
    }

    @Test("reading a row lowers the count in the same breath")
    func readingLowersTheCount() {
        let service = BadgeCountService.makeForTests()
        let rows = [delivered(id: "d1", isRead: false), delivered(id: "d2", isRead: false)]
        service.applyNotificationRows(rows)
        #expect(service.unreadNotificationCount == 2)

        var afterRead = rows
        afterRead[0].isRead = true
        service.applyNotificationRows(afterRead)
        #expect(service.unreadNotificationCount == 1)

        service.applyNotificationRows(afterRead.map { row in
            var copy = row
            copy.isRead = true
            return copy
        })
        #expect(service.unreadNotificationCount == 0)
    }

    /// A Studio-composed stand-in was never delivered, so it has no arrival and
    /// no read state to report (C5). Counting it would badge a number the
    /// person can never clear.
    @Test("a Studio-composed row never counts")
    func composedRowsDoNotCount() {
        let service = BadgeCountService.makeForTests()
        service.applyNotificationRows([composed(id: "inv-1"), composed(id: "inv-2")])
        #expect(service.unreadNotificationCount == 0)

        service.applyNotificationRows([composed(id: "inv-1"), delivered(id: "d1", isRead: false)])
        #expect(service.unreadNotificationCount == 1)
    }

    @Test("a session change takes the count with it")
    func aSessionChangeClearsTheCount() {
        let service = BadgeCountService.makeForTests()
        service.applyNotificationRows([delivered(id: "d1", isRead: false)])
        #expect(service.unreadNotificationCount == 1)

        service.resetForSessionChange()
        #expect(service.unreadNotificationCount == 0)
    }

    // MARK: - The writer, and the only one

    /// The feed's view model is the one writer, and it publishes on every
    /// mutation — load, mark-read, mark-all-read, and each rollback. A path
    /// that changes `notifications` without publishing is the bug coming back.
    @Test("every mutation of the feed's rows publishes the count")
    func everyMutationPublishes() throws {
        let source = try SourcePin.read(
            "Patina/Features/Notifications/ViewModels/NotificationsViewModel.swift"
        )
        let code = SourceScan.code(in: source)

        #expect(code.contains("BadgeCountService.shared.applyNotificationRows(notifications)"))
        // load (guest + resolved), markRead + its rollback, markAllRead + its
        // rollback, and the one definition.
        #expect(code.components(separatedBy: "publishUnreadCount()").count - 1 >= 7)
    }

    /// The bell reads the shared service. `DailyRoomView.swift` is L1-C's file,
    /// so the binding itself arrives there as integration note **L1F→C-1**;
    /// this pins the half that lives in this lane — that nothing in the
    /// notifications feature computes a second count of its own.
    @Test("the notifications feature computes no second count")
    func thereIsNoSecondCount() throws {
        for path in SourcePin.swiftFiles(under: "Patina/Features/Notifications") {
            let code = SourceScan.code(in: try String(contentsOf: URL(fileURLWithPath: path), encoding: .utf8))
            #expect(
                !code.contains("notifications.filter { !$0.isRead }.count"),
                "VISION §6: one count of what needs you, from one service — \(path)"
            )
        }
    }
}
