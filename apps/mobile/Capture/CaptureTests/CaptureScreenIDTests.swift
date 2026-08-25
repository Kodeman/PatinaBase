//  CaptureScreenIDTests.swift
//  CaptureTests
//
//  CaptureScreenID is the harness's whole vocabulary: capture-shots.sh, the
//  `-CaptureScreen <suffix>` launch flag and CaptureDeepLink all key off it, and
//  the launch flag resolves by SUFFIX (RootView.swift:66 —
//  `allCases.first(where: { $0.rawValue.hasSuffix(raw) })`). So a new id that is
//  a suffix of an older one would silently drive the wrong screen, and the id
//  SiteScanContextScreen has been setting by hand ("screen.F1.context") has
//  never been in the enum at all, which is why it has never appeared in a sweep.

import Foundation
import Testing
@testable import CaptureKit

struct CaptureScreenIDTests {

    @Test func everyScreenIDIsUnique() {
        let raws = CaptureScreenID.allCases.map(\.rawValue)
        #expect(Set(raws).count == raws.count)

        // The launch flag matches on the suffix, so one id's sweep suffix must
        // never be a tail of another id's raw value.
        for id in CaptureScreenID.allCases {
            let matches = CaptureScreenID.allCases.filter {
                $0.rawValue.hasSuffix(id.sweepSuffix)
            }
            #expect(matches == [id],
                    "\(id.sweepSuffix) also resolves \(matches.map(\.rawValue))")
        }
    }

    @Test func contextScreenHasAnID() {
        #expect(CaptureScreenID(rawValue: "screen.F1.context") == .f1Context)
        #expect(CaptureScreenID.f1Context.sweepSuffix == "F1.context")
        #expect(CaptureScreenID.f1Context != .f1ScanSetup)
    }

    @Test func theVisitSpineIdsAreReservedNow() {
        #expect(CaptureScreenID.v0Visit.rawValue == "screen.V0.visit")
        #expect(CaptureScreenID.c6Voice.rawValue == "screen.C6.voice")
        #expect(CaptureScreenID.v4VisitReview.rawValue == "screen.V4.visit-review")
    }

    @Test func sweepSuffixStripsExactlyTheScreenPrefix() {
        #expect(CaptureScreenID.c1Viewfinder.sweepSuffix == "C1.viewfinder")
        #expect(CaptureScreenID.sr20GuestReturned.sweepSuffix == "SR20.guest-returned")
    }
}
