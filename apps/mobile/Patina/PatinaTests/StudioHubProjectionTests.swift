//
//  StudioHubProjectionTests.swift
//  PatinaTests
//
//  `W3R2-M1`. The Studio hub, on a cold first entry, printed "Awaiting you,
//  zero things awaiting you / Nothing needs a decision." under a summary
//  reading "Eight things need your eye" — and held that reading for as long as
//  the homeowner stayed on the screen, correcting only when she left and came
//  back. Three states, and the hub has to be able to tell them apart: the
//  merge has not answered, the merge answered and there is nothing, the merge
//  answered and there is something.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct StudioHubProjectionTests {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    private func loaded(
        withDecision: Bool,
        projectionAnswered: Bool = true
    ) throws -> StudioLoadResult {
        let decisions = try decode([RemoteClientDecision].self, """
        [{ "id": "d1", "title": "Rug colour", "status": "pending",
           "due_date": "2026-08-22", "created_at": "2026-08-12T12:00:00Z" }]
        """)
        let projects = try decode([RemoteProject].self, """
        [{ "id": "p1", "name": "Aspen Loft", "status": "active",
           "updated_at": "2026-08-20T12:00:00Z" }]
        """)
        return StudioLoadResult(
            projects: projects,
            decisions: withDecision ? decisions : [],
            approvals: projectionAnswered ? [] : nil,
            proposals: [], invoices: [], documents: [], threads: [], notifications: []
        )
    }

    // MARK: - 1 · the merge has not answered

    @Test
    func aHubThatHasNotLoadedAssertsNothing() {
        let hub = StudioHubViewModel()
        #expect(hub.hasLoaded == false)
        #expect(hub.hasLoadedProjection == false)
        #expect(hub.isAwaitingProjection, "an unloaded snapshot is not an empty one")
    }

    /// The half that made this a screen rather than a frame: the approvals leg
    /// is not a `failures` entry, so a projection read that never answered
    /// produced no notice, no staleness line and no error card — only silence
    /// and an empty section.
    @Test
    func aProjectionThatDidNotAnswerKeepsTheHubQuiet() throws {
        let hub = StudioHubViewModel()
        hub.apply(try loaded(withDecision: false, projectionAnswered: false))
        #expect(hub.hasLoaded, "the other seven sources answered")
        #expect(hub.failedSources.isEmpty, "the projection is not one of the seven")
        #expect(hub.isAwaitingProjection, "so the emptiness is still unproven")
    }

    @Test
    func theSectionDrawsThePlaceholderRatherThanTheEmptySentence() throws {
        let view = try SourcePin.read("Patina/Features/Profile/Views/StudioHubView.swift")
        #expect(view.contains("viewModel.isAwaitingProjection"))
        #expect(view.contains("StudioQueueSectionKind.gatheringMessage"))
        // And the count word waits with it — "zero things awaiting you" was
        // what VoiceOver read out over eight open approvals.
        #expect(view.contains("if !viewModel.isAwaitingProjection {"))
        // The frames between mount and the task firing are `isLoading == false`
        // and `hasLoaded == false`, which used to fall through to the sections.
        #expect(view.contains("} else if !viewModel.hasLoaded {"))
        #expect(view.contains("viewModel.isLoading && !viewModel.hasLoaded") == false)
    }

    // MARK: - 2 · the merge answered, and there is nothing

    @Test
    func anAnsweredMergeWithNothingInItMaySaySo() throws {
        let hub = StudioHubViewModel()
        hub.apply(try loaded(withDecision: false))
        #expect(hub.hasLoaded)
        #expect(hub.hasLoadedProjection)
        #expect(hub.isAwaitingProjection == false)
        #expect(hub.snapshot.section(.awaitingYou).rows.isEmpty)
        #expect(hub.snapshot.attentionSummary.awaitingCount == 0)
    }

    /// "Decision" is reserved for a choice between named alternatives, and this
    /// section holds approvals too.
    @Test
    func theEmptySentenceNamesHerAnswerAndNotACategory() {
        #expect(StudioQueueSectionKind.awaitingYou.emptyMessage == "Nothing needs your answer.")
        #expect(StudioQueueSectionKind.gatheringMessage == "Still gathering.")
    }

    // MARK: - 3 · the merge answered, and there is something

    @Test
    func anAnswerAlreadyOwedFillsTheSection() throws {
        let hub = StudioHubViewModel()
        hub.apply(try loaded(withDecision: true))
        #expect(hub.isAwaitingProjection == false)
        #expect(hub.snapshot.section(.awaitingYou).rows.isEmpty == false)
        #expect(hub.snapshot.attentionSummary.awaitingCount > 0)
    }

    /// A merge that lands on the second ask corrects the screen she is still
    /// looking at, rather than the next one she opens.
    @Test
    func aLateMergeClearsThePlaceholder() throws {
        let hub = StudioHubViewModel()
        hub.apply(try loaded(withDecision: true, projectionAnswered: false))
        #expect(hub.isAwaitingProjection)

        hub.apply(try loaded(withDecision: true))
        #expect(hub.isAwaitingProjection == false)
        #expect(hub.snapshot.section(.awaitingYou).rows.isEmpty == false)
    }

    @Test
    func theHubAsksTheProjectionOnceMoreBeforeItGivesUp() throws {
        let source = try SourcePin.read(
            "Patina/Features/Profile/ViewModels/StudioHubViewModel.swift"
        )
        #expect(source.contains("func load(retryingProjection: Bool = true) async"))
        #expect(source.contains("if retryingProjection, !hasLoadedProjection {"))
        #expect(source.contains("await load(retryingProjection: false)"))
    }
}
