//  ThreadScreen.swift
//  Capture · Wave M (Messages)
//
//  M2 — message history + composer (route `.thread(id)`, id `m2Thread`).
//  Mine right-aligned verdigris-tinted, theirs left ink-tinted with a
//  sender-name caption on the first bubble of a run; day separators; optimistic
//  send with error rollback; live tail via `MessagingService.observeMessages`,
//  plus a lightweight refresh on foreground/appear so the thread stays usable
//  if Realtime yields nothing (see SupabaseMessagingService's header caveat).

import SwiftUI
import CaptureKit

@Observable
@MainActor
final class ThreadViewModel {
    let threadID: String
    private let messaging: any MessagingService

    var title: String = "Conversation"
    var messages: [FieldMessage] = []
    var draft: String = ""
    var isLoading = false
    var isSending = false
    var errorMessage: String?

    private var observeTask: Task<Void, Never>?

    init(threadID: String, messaging: any MessagingService) {
        self.threadID = threadID
        self.messaging = messaging
    }

    func load() async {
        errorMessage = nil
        if messages.isEmpty { isLoading = true }
        do {
            messages = try await messaging.messages(threadID: threadID)
        } catch {
            errorMessage = "Couldn't load this conversation."
        }
        await resolveTitle()
        isLoading = false
    }

    /// No single-thread fetch in the frozen contract — resolve the header
    /// title from a `listThreads()` lookup by id (cheap, one round trip)
    /// rather than inventing a new seam.
    private func resolveTitle() async {
        guard let match = try? await messaging.listThreads().first(where: { $0.id == threadID }) else { return }
        title = match.title
    }

    func send() async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isSending else { return }
        isSending = true
        draft = ""
        do {
            let sent = try await messaging.send(threadID: threadID, text: text)
            apply(sent)
        } catch {
            draft = text
            errorMessage = "Couldn't send. Try again."
        }
        isSending = false
    }

    func startObserving() {
        guard observeTask == nil else { return }
        observeTask = Task { [weak self] in
            guard let self else { return }
            for await message in self.messaging.observeMessages(threadID: self.threadID) {
                self.apply(message)
            }
        }
    }

    func stopObserving() {
        observeTask?.cancel()
        observeTask = nil
    }

    /// Lightweight re-fetch for foreground/appear — merges without flipping
    /// `isLoading` so a quiet Realtime tail doesn't leave M2 stale.
    func refreshQuietly() async {
        guard let fresh = try? await messaging.messages(threadID: threadID) else { return }
        for message in fresh { apply(message) }
    }

    /// Append-or-replace by id — the same shape covers both the optimistic
    /// local send and the realtime echo of that same row.
    private func apply(_ message: FieldMessage) {
        if let idx = messages.firstIndex(where: { $0.id == message.id }) {
            messages[idx] = message
        } else {
            messages.append(message)
        }
    }
}

struct ThreadScreen: View {
    let threadID: String
    let messaging: any MessagingService
    let analytics: any CaptureAnalytics
    let coordinator: CaptureCoordinator

    @State private var viewModel: ThreadViewModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase

    init(threadID: String, messaging: any MessagingService, analytics: any CaptureAnalytics, coordinator: CaptureCoordinator) {
        self.threadID = threadID
        self.messaging = messaging
        self.analytics = analytics
        self.coordinator = coordinator
        _viewModel = State(initialValue: ThreadViewModel(threadID: threadID, messaging: messaging))
    }

    var body: some View {
        VStack(spacing: 0) {
            transcript
            if let message = viewModel.errorMessage {
                errorBanner(message)
            }
            composer
        }
        .background(CaptureColor.paper)
        .navigationTitle(viewModel.title)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            analytics.screen(CaptureScreenID.m2Thread.rawValue)
            await viewModel.load()
            viewModel.startObserving()
        }
        .onDisappear { viewModel.stopObserving() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await viewModel.refreshQuietly() } }
        }
        .accessibilityIdentifier(CaptureScreenID.m2Thread.rawValue)
    }

    // MARK: Transcript

    @ViewBuilder
    private var transcript: some View {
        if viewModel.isLoading && viewModel.messages.isEmpty {
            ProgressView()
                .tint(CaptureColor.verdigris)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if viewModel.messages.isEmpty {
            emptyState
        } else {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 2) {
                        ForEach(rows) { row in
                            rowView(row)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                }
                .onChange(of: viewModel.messages.count) { _, _ in
                    scrollToLatest(proxy)
                }
                .task {
                    scrollToLatest(proxy, animated: false)
                }
                .refreshable { await viewModel.load() }
            }
        }
    }

    private func scrollToLatest(_ proxy: ScrollViewProxy, animated: Bool = true) {
        guard let lastID = viewModel.messages.last?.id else { return }
        if animated, !reduceMotion {
            withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo(lastID, anchor: .bottom) }
        } else {
            proxy.scrollTo(lastID, anchor: .bottom)
        }
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: 10) {
            Text(message)
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.rust)
            Spacer(minLength: 8)
            Button("Try again") {
                Task { await viewModel.load() }
            }
            .font(CaptureType.footnote.weight(.semibold))
            .foregroundStyle(CaptureColor.verdigris)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    // MARK: Row model (day separators + sender-name grouping)

    private var rows: [ThreadRow] {
        var result: [ThreadRow] = []
        var previousDate: Date?
        var previousSenderKey: String?
        let calendar = Calendar.current

        for message in viewModel.messages {
            let sameDayAsPrevious = previousDate.map { calendar.isDate(message.sentAt, inSameDayAs: $0) } ?? false
            if !sameDayAsPrevious {
                result.append(ThreadRow(id: "day-\(message.id)", kind: .daySeparator(MessagesDateFormat.dayLabel(message.sentAt))))
                previousSenderKey = nil
            }
            previousDate = message.sentAt

            if message.senderID.isEmpty {
                result.append(ThreadRow(id: message.id, kind: .system(message.text)))
                previousSenderKey = nil
                continue
            }

            let showSenderName = !message.isMine && message.senderID != previousSenderKey
            result.append(ThreadRow(id: message.id, kind: .bubble(message: message, showSenderName: showSenderName)))
            previousSenderKey = message.senderID
        }
        return result
    }

    @ViewBuilder
    private func rowView(_ row: ThreadRow) -> some View {
        switch row.kind {
        case .daySeparator(let label):
            Text(label)
                .font(CaptureType.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(CaptureColor.inkSoft)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .accessibilityAddTraits(.isHeader)
        case .system(let text):
            Text(text)
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.inkSoft)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
        case .bubble(let message, let showSenderName):
            bubbleRow(message, showSenderName: showSenderName)
        }
    }

    private func bubbleRow(_ message: FieldMessage, showSenderName: Bool) -> some View {
        HStack(spacing: 0) {
            if message.isMine { Spacer(minLength: 48) }
            VStack(alignment: message.isMine ? .trailing : .leading, spacing: 4) {
                if showSenderName, let name = message.senderName {
                    Text(name)
                        .font(CaptureType.eyebrow)
                        .textCase(.uppercase)
                        .foregroundStyle(CaptureColor.inkSoft)
                }
                Text(message.text)
                    .font(CaptureType.body)
                    .foregroundStyle(message.isMine ? CaptureColor.paper3 : CaptureColor.ink)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        message.isMine ? CaptureColor.verdigris : CaptureColor.ink.opacity(0.06),
                        in: RoundedRectangle(cornerRadius: 14)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(message.isMine ? Color.clear : CaptureColor.line, lineWidth: 1)
                    )
                Text(MessagesDateFormat.timeLabel(message.sentAt))
                    .font(CaptureType.monoSmall)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
            .frame(maxWidth: 280, alignment: message.isMine ? .trailing : .leading)
            if !message.isMine { Spacer(minLength: 48) }
        }
        .frame(maxWidth: .infinity, alignment: message.isMine ? .trailing : .leading)
        .padding(.top, 6)
        .id(message.id)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel(for: message))
    }

    private func accessibilityLabel(for message: FieldMessage) -> String {
        var parts: [String] = [message.isMine ? "You" : (message.senderName ?? "Message")]
        parts.append(message.text)
        parts.append(MessagesDateFormat.accessible(message.sentAt))
        return parts.joined(separator: ", ")
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(CaptureType.display)
                .foregroundStyle(CaptureColor.inkSoft)
            Text("No messages yet.")
                .font(CaptureType.body)
                .foregroundStyle(CaptureColor.ink)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: Composer

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField("Message", text: $viewModel.draft, axis: .vertical)
                .font(CaptureType.body)
                .foregroundStyle(CaptureColor.ink)
                .lineLimit(1...4)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(CaptureColor.paper3, in: RoundedRectangle(cornerRadius: 20))
                .overlay(RoundedRectangle(cornerRadius: 20).stroke(CaptureColor.line, lineWidth: 1))

            Button {
                analytics.event("messages.send")
                Task { await viewModel.send() }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(CaptureType.title)
                    .foregroundStyle(canSend ? CaptureColor.verdigris : CaptureColor.inkSoft.opacity(0.4))
                    .frame(minWidth: 44, minHeight: 44)
            }
            .disabled(!canSend)
            .accessibilityLabel("Send message")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(CaptureColor.paper2)
    }

    private var canSend: Bool {
        !viewModel.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !viewModel.isSending
    }
}

/// One renderable transcript row. File-scope (not nested in `ThreadScreen`)
/// so `Kind` stays only one level deep — `nesting` is one of the ratcheted
/// SwiftLint rules under `--strict`.
private struct ThreadRow: Identifiable {
    enum Kind {
        case daySeparator(String)
        case system(String)
        case bubble(message: FieldMessage, showSenderName: Bool)
    }
    let id: String
    let kind: Kind
}

#if DEBUG
import CaptureKitMocks

#Preview {
    NavigationStack {
        ThreadScreen(
            threadID: WorkFixtures.threadID,
            messaging: MockMessagingService(),
            analytics: MockCaptureAnalytics(),
            coordinator: CaptureCoordinator()
        )
    }
}
#endif
