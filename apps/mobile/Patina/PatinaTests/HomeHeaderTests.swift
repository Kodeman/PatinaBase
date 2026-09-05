//
//  HomeHeaderTests.swift
//  PatinaTests
//
//  The header the Record sits under: the date, the time-of-day greeting, and
//  the labelled Studio control that replaced the bare monogram.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct HomeHeaderTests {

    /// `P-24` / **R5**: the control names the door and counts nothing.
    ///
    /// It used to draw a clay capsule with `BadgeCountService.attentionCount`
    /// in it and speak "4 waiting" to VoiceOver — the app's in-product
    /// attention badge, which VISION §6 refuses. The springboard badge is kept;
    /// inside the app the NEEDS YOU eyebrow carries the truth as rows.
    @Test("the Studio control names the door and carries no count")
    func theStudioControlCarriesNoCount() throws {
        #expect(StudioControlLabel.title == "Studio")
        #expect(StudioControlLabel.voiceOverName == "Your Studio")

        let header = try SourcePin.readCode("Patina/Features/Home/Views/DailyGreetingHeader.swift")
        #expect(!header.contains("attentionCount"),
                "the header still reads the attention count")
        #expect(!header.contains("waitingValue"),
                "VoiceOver still speaks the retired count")
        // `iosb2-M3`: R5 retires the tab badge "and any in-product numeric
        // badge", so the bell's count went too. Clay survives on this header
        // as the unread DOT's fill — a mark, not a number — which is why the
        // capsule pin is still scoped to the Studio control's own block.
        let studio = try #require(header.range(of: "private var studioControl: some View {"))
        let afterStudio = String(header[studio.lowerBound...].prefix(600))
        #expect(!afterStudio.contains("PatinaColors.clayInk"),
                "the count capsule's fill is still drawn on the Studio control")
        // And nowhere on the header does a number get drawn.
        #expect(!header.contains("Capsule().fill(PatinaColors.clayInk)"),
                "an in-product count capsule is still drawn (R5)")
        #expect(!header.contains("UnreadBadge"),
                "the bell's numeric badge is still here (R5)")
    }

    // `TimeOfDay` lives in PatinaDesignKit, which the unit-test target does not
    // link — the greeting is pinned by the source read below instead.

    @Test("the header draws the greeting and keeps the canonical name for VoiceOver")
    func theHeaderKeepsTheCanonicalName() throws {
        let source = try SourcePin.read("Patina/Features/Home/Views/DailyGreetingHeader.swift")
        // The greeting is what the screen prints…
        #expect(source.contains("Text(greeting)"))
        // …and "Today" is still what the surface is called (C4). C-18 /
        // W1-B-05 moved the name off the CONTAINER, where a label collapsed the
        // group and took the "About Today" help door out of the accessibility
        // tree, and onto the date line inside it.
        #expect(source.contains("accessibilityLabel(\"Today. \\(dateString)\")"))
        #expect(!source.contains(".accessibilityLabel(\"Today\")"),
                "labelling the .contain container swallows its children (C-18)")
        // The bare monogram avatar is gone.
        #expect(!source.contains("PatinaGradients.earth"))
        #expect(!source.contains("monogramAvatar"))
    }

    /// `P-24`: the home no longer hands the header a number to badge. The one
    /// hint the Studio surfaces print (`studioHint`) is untouched — it is a
    /// sentence, not a badge.
    @Test("the home hands the header no attention count")
    func theHomePassesNoCount() throws {
        let source = try SourcePin.readCode("Patina/Features/Home/Views/DailyRoomView.swift")
        #expect(!source.contains("attentionCount: BadgeCountService.shared.attentionCount"))
        #expect(source.contains("greeting: TimeOfDay.current.greeting"))
        // SP-16 / AttentionCountTests: this screen still reads the one hint.
        #expect(source.contains("badges.studioHint"))
    }

    /// M1 draws this header as date over greeting and a belled dot. The pill
    /// is B-1's fallback door "if the flag never flips", so it draws on the
    /// flag-off root and not where the bar carries the Studio tab — and the
    /// tour anchor it hosts travels with it rather than being left mounted on
    /// a control that is not there.
    @Test("the Studio pill is the root-without-a-bar’s door, and only that root’s")
    func theStudioPillIsGatedOffWhereTheBarDraws() throws {
        let header = try SourcePin.read("Patina/Features/Home/Views/DailyGreetingHeader.swift")
        #expect(header.contains("var showsStudioControl: Bool = true"))
        #expect(header.contains("if showsStudioControl {"))
        // The anchor is inside the gate, not beside it.
        let gated = try #require(header.range(of: "if showsStudioControl {"))
        let anchor = try #require(header.range(of: ".firstLaunchTourAnchor(.profileMonogram)"))
        #expect(gated.lowerBound < anchor.lowerBound)

        let home = try SourcePin.read("Patina/Features/Home/Views/DailyRoomView.swift")
        #expect(home.contains("showsStudioControl: !coordinator.isHouseFirstRoot"))
    }

    /// SP-19: 44 pt. The Studio control replaced the bare monogram on the
    /// screen every session opens on, so it is held to the ruled target.
    @Test("the Studio control is a 44 pt target")
    func theStudioControlMeetsTheTarget() throws {
        let source = try SourcePin.read("Patina/Features/Home/Views/DailyGreetingHeader.swift")
        #expect(source.contains("minHeight: 44"))
        #expect(!source.contains("minHeight: 36"))
    }
}
