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

    private static let timeOfDaySource = try! SourcePin.read(
        "../PatinaDesignKit/Sources/PatinaDesignKit/Tokens/TimeOfDay.swift"
    )

    @Test("every greeting is one of the three natural-English windows, with no terminal period")
    func greetingsCollapseToThreeWindows() {
        let source = Self.timeOfDaySource
        #expect(source.contains("return \"Good morning\""))
        #expect(source.contains("return \"Good afternoon\""))
        #expect(source.contains("return \"Good evening\""))
    }

    @Test("the retired greetings never appear again")
    func retiredGreetingsAreGone() {
        let source = Self.timeOfDaySource
        #expect(!source.contains("\"Good night."))
        #expect(!source.contains("\"Good day."))
        #expect(!source.contains("\"Early morning."))
        // No greeting return statement still carries a terminal period.
        #expect(!source.contains("Good morning.\""))
        #expect(!source.contains("Good afternoon.\""))
        #expect(!source.contains("Good evening.\""))
    }

    @Test("dawn and morning share one greeting; so do day/afternoon and evening/night")
    func adjacentWindowsShareOneVoice() {
        // Six `case` arms, three distinct return values — asserted by counting
        // occurrences of each canonical string inside the `greeting` switch.
        let source = Self.timeOfDaySource
        guard let range = source.range(of: "var greeting: String {") else {
            Issue.record("TimeOfDay.greeting not found")
            return
        }
        let body = source[range.lowerBound...]
        #expect(body.components(separatedBy: "return \"Good morning\"").count - 1 == 2)
        #expect(body.components(separatedBy: "return \"Good afternoon\"").count - 1 == 2)
        #expect(body.components(separatedBy: "return \"Good evening\"").count - 1 == 2)
    }
}
