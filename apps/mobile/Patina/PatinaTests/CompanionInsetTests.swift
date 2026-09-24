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

    /// The modifier pads by the shared metric — the bar's row plus the air
    /// every pinned act reserves — not a third constant.
    @Test("the modifier’s clearance is the shared metric, not a third constant")
    func theModifierDerivesFromTheHearthMetric() throws {
        #expect(CompanionHearthMetrics.pinnedFooterClearance
                == CompanionHearthMetrics.barRowHeight + CompanionHearthMetrics.clearanceAir)
        let source = SourceScan.code(
            in: try SourcePin.read("Patina/Design/Components/CompanionSafeArea.swift")
        )
        #expect(source.contains("CompanionHearthMetrics.pinnedFooterClearance"))
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
    /// the scan flow draws no Companion chrome, so its 110/120/180/190 pt
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

            for value in Self.hardCodedClearances(in: code) {
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

    /// Every `.padding(.bottom, N)` or `Spacer().frame(height: N)` in `code`
    /// with `N >= 90` — large enough that it can only be there to clear the
    /// dock or the bar. Anything smaller is ordinary spacing and is none of
    /// this pin's business.
    ///
    /// **Whitespace is normalised over the whole file before the scan, and that
    /// is the load-bearing part.** The first version read line by line, and
    /// `ProductDetailView` writes the construct across two:
    ///
    /// ```swift
    ///     Spacer()
    ///         .frame(height: 120)
    /// ```
    ///
    /// so the keystone assertion passed while a 120 pt clearance was still
    /// shipped, in this lane's own glob (`RL1C-06`). A scan that a newline can
    /// walk past is not a scan.
    static func hardCodedClearances(in code: String) -> [Int] {
        let flattened = code
            .replacingOccurrences(of: "\\s*\\n\\s*", with: "", options: .regularExpression)
        var found: [Int] = []
        for prefix in [".padding(.bottom,", "Spacer().frame(height:"] {
            var searchFrom = flattened.startIndex
            while let range = flattened.range(of: prefix, range: searchFrom..<flattened.endIndex) {
                searchFrom = range.upperBound
                let digits = flattened[range.upperBound...]
                    .drop { $0 == " " }
                    .prefix { $0.isNumber }
                if !digits.isEmpty, let value = Int(digits), value >= 90 {
                    found.append(value)
                }
            }
        }
        return found
    }

    @Test("the scan sees a clearance spelled across two lines")
    func theScanIsNotFooledByANewline() {
        // The exact shape `ProductDetailView` had, which the line-by-line scan
        // walked straight past.
        let twoLine = """
                            Spacer()
                                .frame(height: 120)
            """
        #expect(Self.hardCodedClearances(in: twoLine) == [120])
        // And the one-line shapes still register…
        #expect(Self.hardCodedClearances(in: ".padding(.bottom, 190)") == [190])
        // …while ordinary spacing does not.
        #expect(Self.hardCodedClearances(in: ".padding(.bottom, 24)").isEmpty)
    }
}
