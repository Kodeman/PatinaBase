//
//  CompanionInsetTests.swift
//  PatinaTests
//
//  W1 · L1-C keystone (`C9-04`). Twenty scroll containers each carried their
//  own bottom clearance — 100 here, 120 there, 190 somewhere else — with no
//  relationship to `CompanionHearthMetrics`, so a change to the Hearth or to
//  the bar re-collided silently. One modifier now answers for all of them, and
//  this file is what stops the twenty coming back.
//
//  The scan is a source scan on purpose: the defect is a *literal*, and a
//  behavioural test cannot see a literal that has been retyped in a new file.
//

import Foundation
import Testing
@testable import Patina

@Suite("Companion bottom clearance")
struct CompanionInsetTests {

    /// Every scroll container that hosts the Companion, by the path
    /// `SourcePin.read` takes.
    static let clearanceCallSites = [
        "Patina/Features/Home/Views/DailyRoomView.swift",
        "Patina/Features/Home/Views/DailyStoryDetailView.swift",
        "Patina/Features/Profile/Views/ProfileView.swift",
        "Patina/Features/Rooms/Views/YourSpacesView.swift",
        "Patina/Features/Rooms/Views/CrossRoomView.swift",
        "Patina/Features/Rooms/Views/RoomProjectView.swift",
        "Patina/Features/Settings/Views/SettingsView.swift",
        "Patina/Features/Collections/Views/CollectionsView.swift",
        "Patina/Features/DesignServices/DesignerConsultationView.swift",
        "Patina/Features/DesignServices/DesignRequestStatusView.swift",
        "Patina/Features/DesignServices/MatchIntroductionView.swift",
        "Patina/Features/Documents/DocumentListView.swift",
        "Patina/Features/Messaging/Views/ThreadListView.swift",
        "Patina/Features/Projects/Views/ProjectListView.swift",
        "Patina/Features/Recommendations/Views/RecommendationsView.swift"
    ]

    // MARK: - The metric

    @Test("the modifier's two answers are the shared metric, not a third constant")
    func theModifierDerivesFromTheHearthMetric() {
        for houseFirst in [true, false] {
            #expect(CompanionBottomClearance.height(houseFirst: houseFirst)
                    == CompanionHearthMetrics.pinnedFooterClearance(houseFirst: houseFirst))
        }
        // And the two answers really are different — a modifier that returned
        // one number for both roots would satisfy the line above and still be
        // the bug (`shots/w3-n1-07-money-footer-under-bar.png`).
        #expect(CompanionBottomClearance.height(houseFirst: true)
                < CompanionBottomClearance.height(houseFirst: false))
    }

    // MARK: - The call sites

    @Test("every Companion scroll container takes its clearance from the modifier")
    func everyCallSiteUsesTheModifier() throws {
        for file in Self.clearanceCallSites {
            let source = try SourcePin.read(file)
            let name = (file as NSString).lastPathComponent
            #expect(SourceScan.code(in: source).contains(".companionBottomClearance()"),
                    "\(name) does not take its bottom clearance from the shared modifier")
        }
    }

    // MARK: - The scan

    /// `Features/RoomScan/**` is excluded and the exclusion is the point:
    /// the scan flow reserves no Hearth at all
    /// (`CompanionHearthMetrics.reservesRootHearth(for: .scanFlow) == false`,
    /// pinned by `CompanionPresentationTests`), so its 110/120/180/190 pt
    /// paddings clear the Whisper Bar and the shutter button — its own chrome,
    /// not the Companion's. Routing them through a Companion metric would be a
    /// wrong number dressed as a right one.
    @Test("no scroll container hard-codes a bottom clearance any more")
    func noHardCodedBottomClearancesRemain() throws {
        var offenders: [String] = []

        for path in SourcePin.swiftFiles(under: "Patina/Features") {
            if path.contains("/Features/RoomScan/") { continue }
            let source = try String(contentsOfFile: path, encoding: .utf8)
            let code = SourceScan.code(in: source)

            for line in code.components(separatedBy: .newlines) {
                guard let value = Self.hardCodedClearance(in: line) else { continue }
                offenders.append("\((path as NSString).lastPathComponent): \(value)")
            }
        }

        #expect(offenders.isEmpty,
                """
                A bottom clearance is hard-coded again instead of derived from \
                CompanionHearthMetrics (C9-04). Use `.companionBottomClearance()`. \
                Offenders: \(offenders.joined(separator: ", "))
                """)
    }

    /// A `.padding(.bottom, N)` or `Spacer().frame(height: N)` with `N >= 90` —
    /// large enough that it can only be there to clear the dock or the bar.
    /// Anything smaller is ordinary spacing and is none of this pin's business.
    private static func hardCodedClearance(in line: String) -> Int? {
        for prefix in [".padding(.bottom, ", "Spacer().frame(height: "] {
            guard let range = line.range(of: prefix) else { continue }
            let tail = line[range.upperBound...]
            let digits = tail.prefix { $0.isNumber }
            guard !digits.isEmpty, let value = Int(digits), value >= 90 else { continue }
            return value
        }
        return nil
    }
}
