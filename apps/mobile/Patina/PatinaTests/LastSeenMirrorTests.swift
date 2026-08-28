//
//  LastSeenMirrorTests.swift
//  PatinaTests
//
//  B §3's last row: the visit stamp is local first and mirrored to
//  `profiles.last_seen_at` (00537 §2 added the column; nothing wrote it).
//  The watermark is what keeps a re-render from being a write.
//

import Testing
import Foundation
@testable import Patina

struct LastSeenMirrorTests {

    private let visit = Date(timeIntervalSince1970: 1_787_594_400)

    @Test("a first visit is due")
    func firstVisitIsDue() {
        #expect(ProfileService.mirrorIsDue(stamp: visit, mirrored: nil))
    }

    @Test("the same visit twice is one write")
    func theSameStampIsNotDueTwice() {
        #expect(!ProfileService.mirrorIsDue(stamp: visit, mirrored: visit))
    }

    @Test("a later visit is due, an earlier one is not")
    func onlyForwardMovementWrites() {
        #expect(
            ProfileService.mirrorIsDue(
                stamp: visit.addingTimeInterval(3_600), mirrored: visit
            )
        )
        // A clock that went backwards is not a new visit.
        #expect(
            !ProfileService.mirrorIsDue(
                stamp: visit.addingTimeInterval(-3_600), mirrored: visit
            )
        )
    }

    @Test("before the first open there is nothing to mirror")
    func nilStampNeverWrites() {
        #expect(!ProfileService.mirrorIsDue(stamp: nil, mirrored: nil))
        #expect(!ProfileService.mirrorIsDue(stamp: nil, mirrored: visit))
    }

    @Test("the watermark is its own key, next to the stamp it tracks")
    func theWatermarkKeyIsPinned() {
        #expect(ProfileService.lastSeenMirrorKey == "patina.house.lastSeenAt.mirrored")
        // Distinct from the local stamp itself — overwriting that would
        // rewrite the record's idea of "new".
        #expect(ProfileService.lastSeenMirrorKey != LastSeenStore.key)
    }

    @MainActor
    @Test("a guest writes nothing")
    func aGuestNeverMirrors() async {
        // No session, so no row to own: the call must return before it can
        // build a PATCH at all.
        guard !AuthService.shared.isAuthenticated else { return }
        let suite = UserDefaults(suiteName: "last-seen-mirror-guest-\(UUID())")!
        await ProfileService.shared.mirrorLastSeenIfNeeded(stamp: visit, defaults: suite)
        #expect(suite.object(forKey: ProfileService.lastSeenMirrorKey) == nil)
    }
}
