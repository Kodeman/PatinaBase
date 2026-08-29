//
//  RecordForegroundTests.swift
//  PatinaTests
//
//  W6 `integration.md` §6.2: "refreshed on foreground" was only true on Today.
//  The trigger now sits at the app root, and Today's own trigger stays — so
//  what these pin is that both go through ONE entry point, and that two asks
//  for the same foreground rebuild the record once.
//
//  Once is the safety property, not an optimisation: `RecordRefresh` stamps the
//  visit at the end of a rebuild, so a second rebuild for the same open would
//  build against that stamp and take every row's `isNew` tick off on the open
//  that should have shown them.
//

import Testing
import Foundation
@testable import Patina

@MainActor
@Suite(.serialized)
struct RecordForegroundTests {

    @MainActor
    private final class Counter {
        var runs = 0
    }

    // MARK: - One rebuild per foreground

    @Test("the root's ask and Today's ask rebuild the record once")
    func overlappingAsksCoalesce() async {
        let counter = Counter()
        async let root = RecordForeground.coalesce {
            counter.runs += 1
            try? await Task.sleep(for: .milliseconds(30))
            return nil
        }
        async let today = RecordForeground.coalesce {
            counter.runs += 1
            try? await Task.sleep(for: .milliseconds(30))
            return nil
        }
        let results = await [root, today]

        #expect(counter.runs == 1)
        // Exactly one of the two ran it; the other waited on that one and took
        // its answer, which is what tells `run` whose `paint` still owes a call.
        #expect(results.filter(\.ranTheWork).count == 1)
    }

    @Test("the next foreground is not suppressed by the last one")
    func aLaterAskRunsAgain() async {
        let counter = Counter()
        _ = await RecordForeground.coalesce { counter.runs += 1; return nil }
        _ = await RecordForeground.coalesce { counter.runs += 1; return nil }

        #expect(counter.runs == 2)
    }

    // MARK: - Where the triggers are

    /// The root sees every foreground; Today sees only its own.
    @Test("the app root rebuilds the record when the app comes forward")
    func theRootHooksTheForeground() throws {
        let source = try SourcePin.read("Patina/PatinaApp.swift")
        let active = try #require(source.range(of: "case .active:"))
        let hook = try #require(source.range(of: "RecordForeground.onForeground("))
        let background = try #require(source.range(of: "case .background:"))
        #expect(active.upperBound < hook.lowerBound)
        #expect(hook.upperBound < background.lowerBound)
    }

    @Test("Today's rebuild is the same entry point the root calls")
    func todayGoesThroughTheSameEntryPoint() throws {
        let viewModel = try SourcePin.read(
            "Patina/Features/Home/ViewModels/DailyRoomViewModel.swift"
        )
        #expect(viewModel.contains("await RecordForeground.run("))
        // The build itself moved: a second `RecordRefresh.run` call site here
        // would be a second spelling of what a rebuild is, which is how the
        // root and Today would come apart.
        #expect(!viewModel.contains("RecordRefresh.run("))

        // And Today keeps asking — the root's pass paints nothing, so removing
        // this would leave the screen on its snapshot until the next open.
        let view = try SourcePin.read("Patina/Features/Home/Views/DailyRoomView.swift")
        #expect(view.contains("await viewModel.refreshRecord()"))
    }

    /// The builder is pure and reads what these two are holding, so a rebuild
    /// that runs before them is a rebuild over the last foreground's rows.
    @Test("the root refreshes what the record reads before it rebuilds")
    func theRootFetchesBeforeItBuilds() throws {
        let source = try SourcePin.read(
            "Patina/Features/Home/ViewModels/RecordForeground.swift"
        )
        let start = try #require(source.range(of: "static func onForeground("))
        let body = source[start.upperBound...]
        let badges = try #require(body.range(of: "BadgeCountService.shared.refresh()"))
        let requests = try #require(body.range(of: "DesignRequestStatusService.shared.refresh()"))
        let run = try #require(body.range(of: "await run("))
        #expect(badges.upperBound < run.lowerBound)
        #expect(requests.upperBound < run.lowerBound)
    }
}
