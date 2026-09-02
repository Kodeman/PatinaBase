//
//  ThreadHeaderTests.swift
//  PatinaTests
//
//  The message thread, all four of its W1 findings:
//
//   • C-13 — no header at all. The complete AX tree was: Back, "TUESDAY · SEP
//     1", "Project conversation opened.", the composer, Send. The tester
//     arrived from a button labelled "Message your designer" and was never told
//     who they were messaging.
//   • C-14 — that system line was the ONLY content, with ~600 pt of dead space
//     under it. It is server-seeded (`00103_comms_rpcs.sql:167`) bookkeeping
//     addressed to the studio, not to the client.
//   • C4-04 / L07-03 — a failed send was completely silent: the error was
//     rendered at exactly one place, `viewModel.messages.isEmpty`, and every
//     real thread has messages because the backend seeds one. Twelve seconds of
//     nothing, then the draft silently reappearing after a 60 s timeout.
//   • L07-02 (blocker) — the composer was drawn under the four-tab bar and a
//     tap at the text field's own centre selected the Pieces tab.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct ThreadHeaderTests {

    // MARK: - Fixtures

    private static let me = "a0000000-0000-0000-0000-000000000005"
    private static let designer = "a0000000-0000-0000-0000-000000000002"

    private func participant(_ id: String) -> RemoteCommsParticipant {
        RemoteCommsParticipant(profile_id: id, role: "member", last_read_at: nil, left_at: nil)
    }

    private func summary(
        participants: [String] = [ThreadHeaderTests.me, ThreadHeaderTests.designer],
        project: String? = "Aspen Loft Refresh"
    ) -> RemoteCommsThreadSummary {
        RemoteCommsThreadSummary(
            id: "c0ff0000-0000-0000-0000-000000000001",
            kind: "project",
            project_id: "b0000000-0000-0000-0000-0000000000d1",
            title: nil,
            last_message_at: nil,
            comms_messages: nil,
            comms_thread_participants: participants.map(participant),
            projects: project.map { RemoteCommsProjectRef(name: $0) }
        )
    }

    private func message(id: String, body: String, system: Bool, sender: String? = nil) -> RemoteCommsMessage {
        RemoteCommsMessage(
            id: id, thread_id: "t1", sender_id: sender, body: body,
            attachments: nil, reply_to_message_id: nil, decision_id: nil,
            mentions: nil, system: system, created_at: "2026-09-01T12:00:00Z",
            edited_at: nil, deleted_at: nil
        )
    }

    // MARK: - C-13, who am I messaging

    @Test("a thread names the person, their initials and the project")
    func aThreadNamesWhoYouAreMessaging() {
        let header = ThreadHeader.from(
            summary: summary(),
            me: Self.me,
            names: [Self.designer: "Leah Hartwell"]
        )

        #expect(header.name == "Leah Hartwell")
        #expect(header.title == "Leah Hartwell")
        #expect(header.initials == "LH")
        #expect(header.projectName == "Aspen Loft Refresh")
    }

    @Test("with no name to give, the header says so rather than inventing one")
    func anUnnamedThreadIsHonest() {
        let header = ThreadHeader.from(summary: summary(), me: Self.me, names: [:])

        #expect(header.name == nil)
        #expect(header.title == "Your designer")
        // No invented letter on the avatar: the app draws its own mark instead.
        #expect(header.initials.isEmpty)
    }

    @Test("a one-word name yields one initial, and a long name yields two")
    func initialsAreBounded() {
        #expect(ThreadHeader(name: "Leah", projectName: nil).initials == "L")
        #expect(ThreadHeader(name: "Leah Marie Hartwell", projectName: nil).initials == "LM")
    }

    @Test("the header is rendered, with the project under the name")
    func theHeaderIsOnScreen() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Messaging/Views/ThreadDetailView.swift")
        )
        #expect(code.contains("ThreadDetailView.Header"))
        #expect(code.contains("viewModel.header?.title ?? ThreadHeader.unnamed"))
        #expect(code.contains("viewModel.header?.projectName"))
    }

    // MARK: - C-14, the audit line

    @Test("the studio's bookkeeping line is not the client's transcript")
    func theAuditLineIsSuppressed() {
        let messages = [
            message(id: "m0", body: "Project conversation opened.", system: true),
            message(id: "m1", body: "Shaker oak it is.", system: false, sender: Self.me)
        ]

        #expect(ThreadTranscript.isAudit(messages[0]))
        #expect(!ThreadTranscript.isAudit(messages[1]))
        #expect(ThreadTranscript.visible(messages).map(\.id) == ["m1"])
    }

    @Test("a thread whose only content was the audit line reads as empty")
    func anAuditOnlyThreadIsEmpty() {
        let messages = [message(id: "m0", body: "Project conversation opened.", system: true)]
        #expect(ThreadTranscript.visible(messages).isEmpty)
    }

    /// Only the seeded lines. A system row that actually tells the client
    /// something still belongs on screen.
    @Test("a system message that is not bookkeeping still shows")
    func anInformativeSystemLineSurvives() {
        let messages = [message(id: "m0", body: "Leah added Sam to this thread.", system: true)]
        #expect(ThreadTranscript.visible(messages).map(\.id) == ["m0"])
    }

    @Test("the empty state invites, and promises nothing the app cannot know")
    func theEmptyStateIsAnInvitation() {
        #expect(ThreadTranscript.emptyTitle(counterpart: "Leah Hartwell") == "Say hello to Leah")
        #expect(ThreadTranscript.emptyTitle(counterpart: nil) == "Say hello")
        #expect(ThreadTranscript.emptyMessage == "Messages here go straight to your designer.")
        // C-14's fix line offered "she usually replies within a day". The app
        // does not know that, and a first-run promise it cannot keep is worse
        // than the dead space it replaces. Flagged for L1-E's deck.
        #expect(!ThreadTranscript.emptyMessage.contains("within a day"))
    }

    // MARK: - C4-04 / L07-03, the failed send

    @Test("a send failure is a separate state from a load failure")
    func sendAndLoadFailuresAreDifferentThings() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Messaging/ViewModels/MessagingViewModel.swift")
        )
        #expect(code.contains("var sendError: String?"))
        #expect(code.contains("sendError = Self.sendFailureLine"))
        // The load failure keeps its own field and its own retry.
        #expect(code.contains("self.error = \"Couldn't load messages\""))
        #expect(!code.contains("self.error = \"Couldn't send\""))
    }

    @Test("a failed send is visible on a thread that has messages, above the composer")
    func aFailedSendIsVisibleOnAThreadWithMessages() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Messaging/Views/ThreadDetailView.swift")
        )

        // Rendered unconditionally on `sendError`, with no `messages.isEmpty`
        // anywhere near it — that condition IS the bug.
        #expect(code.contains("if let sendError = viewModel.sendError {"))
        #expect(code.contains("ThreadDetailView.SendFailure"))
        #expect(code.contains("Button(\"Try again\")"))
        #expect(code.contains("await viewModel.retrySend()"))

        // And it sits between the transcript and the composer, so it is where
        // the person's eyes already are.
        let banner = try #require(code.range(of: "sendFailureBanner\n            composer"))
        #expect(!banner.isEmpty)
    }

    @Test("the failure sentence says nothing was lost, and names no server")
    func theFailureSentenceIsAHomeownerSentence() {
        let line = ThreadDetailViewModel.sendFailureLine
        #expect(line == "We couldn't send that. Nothing was lost — your message is still here.")
        #expect(!line.lowercased().contains("error"))
        #expect(!line.lowercased().contains("http"))
        #expect(!line.contains("URLSession"))
    }

    /// Retry re-sends the body that failed, not whatever is in the composer
    /// now — a person who typed something else while the first was in the air
    /// must not have it sent in place of the message they are looking at.
    @Test("retry carries the failed body, and does nothing without one")
    func retryCarriesTheFailedBody() async {
        let viewModel = ThreadDetailViewModel(threadId: "t1")
        #expect(viewModel.failedSendBody == nil)
        await viewModel.retrySend()
        #expect(viewModel.sendError == nil)
        #expect(!viewModel.isSending)
    }

    // MARK: - L07-02, the composer under the bar

    @Test("the composer clears the tab bar")
    func composerClearsTheTabBar() throws {
        // The metric itself: the bar's tappable row plus the same 8 pt of air
        // every pinned money act reserves.
        #expect(
            CompanionHearthMetrics.pinnedFooterClearance(houseFirst: true)
                == CompanionHearthMetrics.barRowHeight + 8
        )
        #expect(CompanionHearthMetrics.barRowHeight == 49)

        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Messaging/Views/ThreadDetailView.swift")
        )
        #expect(code.contains("CompanionHearthMetrics.pinnedFooterClearance("))
        #expect(code.contains("houseFirst: coordinator.isHouseFirstRoot"))
        // Never a live flag read: the root is chosen once at launch, and a late
        // PostHog payload must not move a screen under someone's thumb
        // (`MoneyScreenMetrics`' own note).
        #expect(!code.contains("FeatureFlags.shared.isOn(.houseFirst)"))
    }

    @Test("the clearance is the flag-off dock's on the flag-off root")
    func theFlagOffRootStillClearsItsDock() {
        #expect(
            CompanionHearthMetrics.pinnedFooterClearance(houseFirst: false)
                == CompanionHearthMetrics.dockHeight + 8
        )
    }
}
