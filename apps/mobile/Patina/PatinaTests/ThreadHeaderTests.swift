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

    @Test("the studio’s bookkeeping line is not the client’s transcript")
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
        #expect(code.contains("self.error = \"We couldn’t load this conversation. Try again.\""))
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
        #expect(line == "We couldn’t send that. Nothing was lost — your message is still here.")
        #expect(!line.lowercased().contains("error"))
        #expect(!line.lowercased().contains("http"))
        #expect(!line.contains("URLSession"))
    }

    // Retry's own behaviour is pinned by `retrySendsTheFailedBodyNotTheDraft`
    // at the end of this suite — the round-2 version of this test asserted only
    // the no-failed-body path, which is the half that does nothing (`RL1F-28`).

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

    @Test("the clearance is the flag-off dock’s on the flag-off root")
    func theFlagOffRootStillClearsItsDock() {
        #expect(
            CompanionHearthMetrics.pinnedFooterClearance(houseFirst: false)
                == CompanionHearthMetrics.dockHeight + 8
        )
    }

    // MARK: - The header and the chrome (round 2)

    /// `C-13`'s own fix drew the 34 pt avatar at x 16–50, underneath
    /// `PatinaScreenChrome`'s back chevron (AXFrame {{17.75, 69.75}, {36.5,
    /// 36.5}}). The header starts after the chevron's slot instead.
    @Test("the header clears the back chevron")
    func theHeaderClearsTheBackChevron() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Messaging/Views/ThreadDetailView.swift")
        )
        // The arithmetic, written where the reader can check it: the chrome's
        // own leading inset plus the button it draws.
        #expect(code.contains("backChevronClearance: CGFloat = 18 + 36.5 + 1.5"))
        #expect(code.contains(".padding(.leading, Self.backChevronClearance)"))
        // And the chrome's numbers are still what this depends on.
        let chrome = SourceScan.code(
            in: try SourcePin.read("Patina/Design/Components/PatinaScreenChrome.swift")
        )
        #expect(chrome.contains(".padding(.leading, 18)"))

        let clearance: CGFloat = 18 + 36.5 + 1.5
        #expect(clearance > 54.25, "the chevron’s trailing edge on the measured frame")
    }

    /// C4-12 — L1-B's note F-L1B-4. The fourth of the five Studio detail
    /// screens; it calls exactly what its `.task` calls.
    @Test("the thread can be pulled to refresh")
    func theThreadCanBePulledToRefresh() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Messaging/Views/ThreadDetailView.swift")
        )
        #expect(code.contains(".refreshable { await viewModel.load() }"))
        #expect(code.contains(".task {"))
    }

    // MARK: - The message still in the air (L07-03, first clause)

    /// `send()` clears the draft before the `await`. Until this, that meant the
    /// text left the composer and arrived nowhere for the whole round trip —
    /// up to `URLSession.shared`'s 60 s default — with no bubble, no spinner
    /// and no banner. The disabled Send glyph was not a signal either: `canSend`
    /// is already false because the draft is empty.
    @Test("nothing is in the air on a fresh thread")
    func nothingIsInTheAirToBeginWith() {
        #expect(ThreadDetailViewModel(threadId: "t1").sendingBody == nil)
    }

    @Test("an in-flight send is on the screen")
    func anInFlightSendIsVisible() throws {
        let model = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Messaging/ViewModels/MessagingViewModel.swift")
        )
        // Set for the whole `await`, and cleared on BOTH arms — a `defer`, so
        // a future `return` inside the `do` cannot leave a ghost bubble.
        #expect(model.contains("sendingBody = body"))
        #expect(model.contains("defer { sendingBody = nil }"))

        let view = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Messaging/Views/ThreadDetailView.swift")
        )
        #expect(view.contains("if let sending = viewModel.sendingBody {"))
        #expect(view.contains("unsentBubble(sending)"))
        #expect(view.contains("accessibilityIdentifier(\"ThreadDetailView.Sending\")"))
        // And the tap itself is acknowledged where the thumb was.
        #expect(view.contains("if viewModel.isSending {"))
    }

    /// The bubble is the person's own words, not a status word: no "Sending…"
    /// placeholder standing in for the text, and no second colour.
    @Test("the unsent bubble draws the message, not a label")
    func theUnsentBubbleDrawsTheMessage() throws {
        let view = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Messaging/Views/ThreadDetailView.swift")
        )
        #expect(view.contains("private func unsentBubble(_ body: String) -> some View"))
        #expect(view.contains("Text(body)"))
        // The fill is deliberately NOT asserted. Round 2 pinned
        // `PatinaColors.clay.opacity(0.35)` as a string literal, which made
        // this suite forbid L1-D's `C3` token sweep from touching a call site
        // it legitimately owns — a test that fails a correct fix (`RL1F-27`).
        // What this test is for is that the bubble draws the person's words
        // rather than a status word.
        #expect(!view.contains("Text(\"Sending"))
        #expect(!view.contains("Text(\"Sent"))
    }

    // MARK: - RL1F-22 — the header at accessibility text sizes

    /// At `accessibility-extra-extra-extra-large` the one-line header read
    /// "Leah Hart…" / "Aspen Loft…". `C-13` exists because "the tester is never
    /// told who they are messaging"; a name cut mid-word tells them a different
    /// name. The name gets a second line and a scale floor before it is cut,
    /// and the project — context, not identity — drops past `.accessibility1`.
    @Test("the header names the whole name at every text size")
    func theHeaderSurvivesAccessibilitySizes() throws {
        let view = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Messaging/Views/ThreadDetailView.swift")
        )
        let title = try #require(view.range(of: "viewModel.header?.title ?? ThreadHeader.unnamed"))
        let afterTitle = String(view[title.lowerBound...].prefix(320))
        #expect(afterTitle.contains(".lineLimit(2)"))
        #expect(afterTitle.contains(".minimumScaleFactor(0.8)"))
        #expect(!afterTitle.contains(".lineLimit(1)"))

        #expect(view.contains("dynamicTypeSize < .accessibility1"))
        #expect(view.contains("@Environment(\\.dynamicTypeSize) private var dynamicTypeSize"))
    }

    /// The inset does NOT move with text size, and that is measured rather than
    /// assumed: `BackChevronButton` is `.font(.system(size: 14, weight: .semibold))`
    /// inside a fixed `36×36` frame — a fixed point size is not Dynamic-Type
    /// scaled — so the chrome owns the same x ∈ [18, 54.5] at every size.
    @Test("the back chevron does not grow with the text size")
    func theChevronIsAFixedSize() throws {
        let chrome = SourceScan.code(
            in: try SourcePin.read("Patina/Design/Animations/PatinaTransitions.swift")
        )
        let chevron = try #require(chrome.range(of: "struct BackChevronButton"))
        let body = String(chrome[chevron.lowerBound...].prefix(600))
        #expect(body.contains(".font(.system(size: 14, weight: .semibold))"))
        #expect(body.contains(".frame(width: 36, height: 36)"))
        #expect(!body.contains("relativeTo:"))
    }

    // MARK: - RL1F-34 / RL1F-35 — the anchor and the round trip

    /// The transcript renders `visibleMessages` after `C-14`. An anchor taken
    /// from `messages.last` resolves to a view that is not in the hierarchy the
    /// moment the backend appends an audit row, and the scroll silently no-ops.
    @Test("the scroll anchor is a row that is actually drawn")
    func theAnchorIsARenderedRow() throws {
        let view = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Messaging/Views/ThreadDetailView.swift")
        )
        #expect(view.contains("onChange(of: viewModel.visibleMessages.count)"))
        #expect(view.contains("viewModel.visibleMessages.last?.id"))
        #expect(!view.contains("viewModel.messages.last?.id"))
    }

    /// `load()` ends with `loadHeader()` and `.refreshable` calls `load()`, so
    /// every pull fetched the whole inbox again for a header already on screen.
    @Test("a pull-to-refresh does not re-fetch the header")
    func theHeaderIsFetchedOnce() throws {
        let model = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Messaging/ViewModels/MessagingViewModel.swift")
        )
        let loadHeader = try #require(model.range(of: "func loadHeader() async {"))
        let body = String(model[loadHeader.lowerBound...].prefix(200))
        #expect(body.contains("guard header == nil else { return }"))
    }

    // MARK: - RL1F-28 — retry carries the failed body

    /// The name's claim, asserted. Round 2's body only proved the
    /// no-failed-body path, which is the half that does nothing.
    @Test("retry re-sends the failed body, not the current draft")
    func retrySendsTheFailedBodyNotTheDraft() async throws {
        let viewModel = ThreadDetailViewModel(threadId: "t1")

        // No failed send: retry is a no-op and touches neither the draft nor
        // the error.
        viewModel.draft = "something else"
        await viewModel.retrySend()
        #expect(viewModel.draft == "something else")
        #expect(viewModel.sendError == nil)
        #expect(!viewModel.isSending)

        // And the source says which of the two it reads. `send(body:)` is
        // private and the client is a singleton, so the round trip cannot be
        // driven here; what CAN be held is that `retrySend()` never reaches for
        // `draft`.
        let model = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Messaging/ViewModels/MessagingViewModel.swift")
        )
        guard let range = model.range(of: "func retrySend() async {") else {
            Issue.record("retrySend() is gone")
            return
        }
        let body = String(model[range.lowerBound...].prefix(180))
        #expect(body.contains("guard let body = failedSendBody"))
        #expect(body.contains("await send(body: body)"))
        #expect(!body.contains("draft"))
    }
}
