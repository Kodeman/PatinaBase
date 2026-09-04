//
//  GreetingWindowTests.swift
//  PatinaTests
//
//  C5-06: the Today headline said "Good night." for eight hours a day (a
//  farewell, not a greeting), "Early morning." at dawn and "Good day." at
//  midday — three windows this app invented that nobody actually says.
//  `TimeOfDay` lives in PatinaDesignKit, which the unit-test target does not
//  link (the convention `HomeHeaderTests.swift` already uses), so this pins
//  the fact from source the same way.
//

import Foundation
import Testing

struct GreetingWindowTests {

    /// `RL1E2-17`: this was a `try!` in a static, so a moved file trapped
    /// on first access and took the whole shared `PatinaTests` process with
    /// it — a total gate failure with no attribution. Every other suite in
    /// this lane reads with `throws` + `try`; so does this one now.
    private static let timeOfDayPath =
        "../PatinaDesignKit/Sources/PatinaDesignKit/Tokens/TimeOfDay.swift"

    @Test("every greeting is one of the three natural-English windows, with no terminal period")
    func greetingsCollapseToThreeWindows() throws {
        let source = try SourcePin.read(Self.timeOfDayPath)
        #expect(source.contains("return \"Good morning\""))
        #expect(source.contains("return \"Good afternoon\""))
        #expect(source.contains("return \"Good evening\""))
    }

    @Test("the retired greetings never appear again")
    func retiredGreetingsAreGone() throws {
        let source = try SourcePin.read(Self.timeOfDayPath)
        #expect(!source.contains("\"Good night."))
        #expect(!source.contains("\"Good day."))
        #expect(!source.contains("\"Early morning."))
        // No greeting return statement still carries a terminal period.
        #expect(!source.contains("Good morning.\""))
        #expect(!source.contains("Good afternoon.\""))
        #expect(!source.contains("Good evening.\""))
    }

    @Test("dawn and morning share one greeting; so do day/afternoon and evening/night")
    func adjacentWindowsShareOneVoice() throws {
        // Six `case` arms, three distinct return values — asserted by counting
        // occurrences of each canonical string inside the `greeting` switch.
        let source = try SourcePin.read(Self.timeOfDayPath)
        guard let range = source.range(of: "var greeting: String {") else {
            Issue.record("TimeOfDay.greeting not found")
            return
        }
        let body = source[range.lowerBound...]
        #expect(body.components(separatedBy: "return \"Good morning\"").count - 1 == 2)
        #expect(body.components(separatedBy: "return \"Good afternoon\"").count - 1 == 2)
        #expect(body.components(separatedBy: "return \"Good evening\"").count - 1 == 2)
    }

    /// The other half of `C5-06`. Collapsing the six greeting strings is only
    /// half the fix — the hour bands decide which greeting a tester actually
    /// reads, and editing one silently changed the answer with every
    /// assertion above still passing. Pinned arm by arm, so the 24-hour sweep
    /// the charter asks for is a fact about the source, not an assumption.
    @Test("TimeOfDay.current’s six hour bands are pinned")
    func hourBandsArePinned() throws {
        let source = try SourcePin.read(Self.timeOfDayPath)
        guard let range = source.range(of: "public static var current: TimeOfDay {") else {
            Issue.record("TimeOfDay.current not found")
            return
        }
        let body = source[range.lowerBound...]
        for arm in [
            "case 5..<7:   return .dawn",
            "case 7..<11:  return .morning",
            "case 11..<14: return .day",
            "case 14..<18: return .afternoon",
            "case 18..<21: return .evening",
            "default:      return .night"
        ] {
            #expect(body.contains(arm), "TimeOfDay.current no longer carries `\(arm)`")
        }
        // The band that moved furthest: 21:00-04:59 was "Good night." and now
        // reads "Good evening". Recorded in the deck's "recorded consequences"
        // table rather than split into a fourth band; pinned here so a later
        // split is a deliberate edit to a failing test, not a silent drift.
        #expect(source.contains("case .night:\n            return \"Good evening\""))
    }
}
