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

    @Test("the Studio control says what is waiting, and says nothing at zero")
    func theStudioControlNamesTheCount() {
        #expect(StudioControlLabel.title == "Studio")
        #expect(StudioControlLabel.voiceOverName == "Your Studio")
        #expect(StudioControlLabel.waitingValue(count: 0) == nil)
        #expect(StudioControlLabel.waitingValue(count: 1) == "1 waiting")
        #expect(StudioControlLabel.waitingValue(count: 4) == "4 waiting")
    }

    // `TimeOfDay` lives in PatinaDesignKit, which the unit-test target does not
    // link — the greeting is pinned by the source read below instead.

    @Test("the header draws the greeting and keeps the canonical name for VoiceOver")
    func theHeaderKeepsTheCanonicalName() throws {
        let source = try SourcePin.read("Patina/Features/Home/Views/DailyGreetingHeader.swift")
        // The greeting is what the screen prints…
        #expect(source.contains("Text(greeting)"))
        // …and "Today" is still what the surface is called (C4).
        #expect(source.contains("accessibilityLabel(\"Today\")"))
        // The bare monogram avatar is gone.
        #expect(!source.contains("PatinaGradients.earth"))
        #expect(!source.contains("monogramAvatar"))
    }

    @Test("the home passes the one attention count into the Studio control")
    func theHomePassesTheOneCount() throws {
        let source = try SourcePin.read("Patina/Features/Home/Views/DailyRoomView.swift")
        #expect(source.contains("attentionCount: BadgeCountService.shared.attentionCount"))
        #expect(source.contains("greeting: TimeOfDay.current.greeting"))
        // SP-16 / AttentionCountTests: this screen still reads the one hint.
        #expect(source.contains("badges.studioHint"))
    }

    /// M1 draws this header as date over greeting and a belled dot. The pill
    /// is B-1's fallback door "if the flag never flips", so it draws on the
    /// flag-off root and not where the bar carries the Studio tab — and the
    /// tour anchor it hosts travels with it rather than being left mounted on
    /// a control that is not there.
    @Test("the Studio pill is the root-without-a-bar's door, and only that root's")
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
