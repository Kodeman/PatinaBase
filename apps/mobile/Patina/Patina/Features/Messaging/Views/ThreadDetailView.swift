//
//  ThreadDetailView.swift
//  Patina
//
//  Conversation view: bubbles + simple composer. Distinct from the
//  Companion (AI) chat — this is human↔human via `comms_messages`.
//
//  R18 chat anatomy: own messages right-aligned in a filled clay bubble,
//  other-party messages left-aligned on the secondary surface with a
//  DM Mono sender label on the first message of each consecutive group,
//  a subtle time under the last message of each group, mono day
//  separators between calendar days, and centered muted captions for
//  system messages.
//

import SwiftUI
import Supabase

struct ThreadDetailView: View { // swiftlint:disable:this type_body_length
    let threadId: String
    @Environment(\.appCoordinator) private var coordinator
    @State private var viewModel: ThreadDetailViewModel

    init(threadId: String) {
        self.threadId = threadId
        _viewModel = State(initialValue: ThreadDetailViewModel(threadId: threadId))
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollViewReader { proxy in
                ScrollView(showsIndicators: false) {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        if viewModel.isLoading && viewModel.messages.isEmpty {
                            PatinaLoadingState()
                                .padding(.top, 60)
                        } else if let error = viewModel.error, viewModel.messages.isEmpty {
                            PatinaErrorState(
                                message: error,
                                action: { Task { await viewModel.load() } }
                            )
                            .padding(.top, 60)
                        } else if viewModel.visibleMessages.isEmpty {
                            emptyState
                        } else {
                            ForEach(chatItems()) { item in
                                row(for: item)
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, 12)
                }
                .onChange(of: viewModel.messages.count) { _, _ in
                    if let last = viewModel.messages.last?.id {
                        withAnimation { proxy.scrollTo(last, anchor: .bottom) }
                    }
                }
            }
            sendFailureBanner
            composer
                // L07-02, blocker: on the four-tab root the composer was the
                // last child of a plain VStack with no bottom clearance, so the
                // bar was drawn over it and won the hit test — a tap at the
                // text field's own centre selected the Pieces tab. One owner,
                // one seam: the metric the money screens already read.
                //
                // `coordinator.isHouseFirstRoot` rather than a live
                // `FeatureFlags` read, per `MoneyScreenMetrics`' own note: the
                // root is resolved once at launch and a late PostHog payload
                // must not move a screen under someone's thumb.
                .padding(.bottom, CompanionHearthMetrics.pinnedFooterClearance(
                    houseFirst: coordinator.isHouseFirstRoot
                ))
        }
        .background(PatinaColors.Background.primary)
        .task {
            await viewModel.load()
            viewModel.startLiveUpdates()
        }
        .onDisappear { viewModel.stopLiveUpdates() }
        // U18: standard pushed-screen chrome. The in-body header below carries
        // the conversation's name, so the chrome adds only the back chevron —
        // the same shape `NotificationFeedView` takes.
        .patinaScreen(title: nil)
    }

    // MARK: - Header (C-13)

    private var header: some View {
        HStack(spacing: 12) {
            avatar
            VStack(alignment: .leading, spacing: 2) {
                Text(viewModel.header?.title ?? ThreadHeader.unnamed)
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .lineLimit(1)
                if let projectName = viewModel.header?.projectName, !projectName.isEmpty {
                    Text(projectName)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
        .padding(.bottom, 12)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("ThreadDetailView.Header")
        .overlay(alignment: .bottom) {
            Rectangle().fill(PatinaColors.pearl).frame(height: 1)
        }
    }

    /// Initials when the thread names someone, the app's own mark when it does
    /// not — never an invented letter.
    private var avatar: some View {
        ZStack {
            Circle()
                .fill(PatinaColors.Background.secondary)
                .frame(width: 34, height: 34)
            let initials = viewModel.header?.initials ?? ""
            if initials.isEmpty {
                Image(systemName: "bubble.left.and.bubble.right")
                    .font(.system(size: 14))
                    .foregroundStyle(PatinaColors.Text.muted)
            } else {
                Text(initials)
                    .font(PatinaTypography.monoLabel)
                    .foregroundStyle(PatinaColors.Text.secondary)
            }
        }
        .accessibilityHidden(true)
    }

    // MARK: - Empty state (C-14)

    private var emptyState: some View {
        PatinaEmptyState(
            icon: "bubble.left.and.bubble.right",
            title: ThreadTranscript.emptyTitle(counterpart: viewModel.header?.name),
            message: ThreadTranscript.emptyMessage
        )
        .padding(.top, 48)
        .accessibilityIdentifier("ThreadDetailView.EmptyState")
    }

    // MARK: - The failed send (C4-04, L07-03)

    @ViewBuilder
    private var sendFailureBanner: some View {
        if let sendError = viewModel.sendError {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(sendError)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                Button("Try again") {
                    Task { await viewModel.retrySend() }
                }
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.interactive)
                .disabled(viewModel.isSending)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(PatinaColors.Background.secondary)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("ThreadDetailView.SendFailure")
        }
    }

    // MARK: - Transcript rows

    /// One renderable row of the transcript.
    private enum ChatItem: Identifiable {
        case daySeparator(id: String, label: String)
        case system(RemoteCommsMessage)
        case bubble(
            message: RemoteCommsMessage,
            isOwn: Bool,
            senderName: String?,
            timeLabel: String?,
            groupedWithPrevious: Bool
        )

        var id: String {
            switch self {
            case .daySeparator(let id, _): return id
            case .system(let message): return message.id
            case .bubble(let message, _, _, _, _): return message.id
            }
        }
    }

    /// Fold the flat message list into day separators + grouped bubbles.
    /// Consecutive same-sender messages within a day form one group:
    /// the sender label shows on the first (other-party only), the time
    /// on the last, and spacing tightens inside the group.
    private func chatItems() -> [ChatItem] {
        let calendar = Calendar.current
        // C-14: the studio's own bookkeeping is not the client's transcript.
        let messages = viewModel.visibleMessages
        var items: [ChatItem] = []
        var previousDate: Date?

        for (index, message) in messages.enumerated() {
            let date = CommsDates.parse(message.created_at)
            var dayBoundary = false
            if let date {
                if previousDate == nil || !calendar.isDate(date, inSameDayAs: previousDate!) {
                    items.append(.daySeparator(
                        id: "day-\(message.id)",
                        label: CommsDates.dayLabel(for: date)
                    ))
                    dayBoundary = true
                }
                previousDate = date
            }

            if message.system {
                items.append(.system(message))
                continue
            }

            let isOwn = isFromCurrentUser(message)
            let senderKey = message.sender_id?.lowercased() ?? ""

            let previous = index > 0 ? messages[index - 1] : nil
            let groupedWithPrevious = !dayBoundary
                && previous != nil
                && previous?.system == false
                && (previous?.sender_id?.lowercased() ?? "") == senderKey

            // The group ends unless the next message continues it on the
            // same calendar day.
            let next = index + 1 < messages.count ? messages[index + 1] : nil
            var isGroupEnd = true
            if let next, !next.system,
               (next.sender_id?.lowercased() ?? "") == senderKey,
               let date, let nextDate = CommsDates.parse(next.created_at),
               calendar.isDate(nextDate, inSameDayAs: date) {
                isGroupEnd = false
            }

            items.append(.bubble(
                message: message,
                isOwn: isOwn,
                senderName: (!isOwn && !groupedWithPrevious) ? viewModel.senderNames[senderKey] : nil,
                timeLabel: isGroupEnd ? date.map { CommsDates.timeLabel(for: $0) } : nil,
                groupedWithPrevious: groupedWithPrevious
            ))
        }
        return items
    }

    @ViewBuilder
    private func row(for item: ChatItem) -> some View {
        switch item {
        case .daySeparator(_, let label):
            MonoLabel(text: label, size: PatinaTypography.monoLabel, color: PatinaColors.Text.muted, tracking: 1)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 18)
                .accessibilityAddTraits(.isHeader)
        case .system(let message):
            Text(message.body)
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.muted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .padding(.horizontal, 24)
                .id(message.id)
        case .bubble(let message, let isOwn, let senderName, let timeLabel, let groupedWithPrevious):
            bubbleRow(
                message,
                isOwn: isOwn,
                senderName: senderName,
                timeLabel: timeLabel,
                groupedWithPrevious: groupedWithPrevious
            )
        }
    }

    private func bubbleRow(
        _ message: RemoteCommsMessage,
        isOwn: Bool,
        senderName: String?,
        timeLabel: String?,
        groupedWithPrevious: Bool
    ) -> some View {
        HStack(spacing: 0) {
            if isOwn { Spacer(minLength: 48) }
            VStack(alignment: isOwn ? .trailing : .leading, spacing: 4) {
                if let senderName {
                    MonoLabel(text: senderName, size: PatinaTypography.monoLabel, tracking: 1)
                        .padding(.horizontal, 4)
                }
                bubbleBody(message, isOwn: isOwn)
                if let timeLabel {
                    MonoLabel(
                        text: timeLabel,
                        size: PatinaTypography.monoSmall,
                        uppercase: false,
                        color: PatinaColors.Text.muted
                    )
                    .padding(.horizontal, 4)
                }
            }
            .frame(maxWidth: 280, alignment: isOwn ? .trailing : .leading)
            if !isOwn { Spacer(minLength: 48) }
        }
        .frame(maxWidth: .infinity, alignment: isOwn ? .trailing : .leading)
        .padding(.top, groupedWithPrevious ? 3 : 14)
        .id(message.id)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel(for: message, isOwn: isOwn))
    }

    @ViewBuilder
    private func bubbleBody(_ message: RemoteCommsMessage, isOwn: Bool) -> some View {
        Group {
            if message.deleted_at != nil {
                Text("Message removed")
                    .italic()
                    .foregroundStyle(PatinaColors.Text.muted)
            } else {
                Text(message.body)
                    .foregroundStyle(PatinaColors.Text.primary)
            }
        }
        .font(PatinaTypography.bodySmall)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            isOwn
                ? AnyShapeStyle(PatinaColors.clay.opacity(0.35))
                : AnyShapeStyle(PatinaColors.Background.secondary)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private func accessibilityLabel(for message: RemoteCommsMessage, isOwn: Bool) -> String {
        let sender = isOwn
            ? "You"
            : (viewModel.senderNames[message.sender_id?.lowercased() ?? ""] ?? "Message")
        var parts: [String] = [sender]
        parts.append(message.deleted_at != nil ? "Message removed" : message.body)
        if let spoken = CommsDates.accessibleLabel(for: CommsDates.parse(message.created_at)) {
            parts.append(spoken)
        }
        return parts.joined(separator: ", ")
    }

    private func isFromCurrentUser(_ message: RemoteCommsMessage) -> Bool {
        guard let sender = message.sender_id else { return false }
        guard let me = try? SupabaseClientManager.shared.client.auth.currentUser?.id.uuidString.lowercased() else {
            return false
        }
        return sender.lowercased() == me
    }

    // MARK: - Composer

    private var composer: some View {
        HStack(spacing: 10) {
            TextField("Type a message…", text: $viewModel.draft, axis: .vertical)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.primary)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(PatinaColors.Background.secondary)
                .clipShape(RoundedRectangle(cornerRadius: 22))
                .lineLimit(1...4)

            Button {
                Task { await viewModel.send() }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(canSend ? PatinaColors.Text.interactive : PatinaColors.Text.muted.opacity(0.6))
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .disabled(!canSend)
            .accessibilityLabel("Send message")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(PatinaColors.Background.primary.opacity(0.98))
        .overlay(alignment: .top) {
            Rectangle().fill(PatinaColors.pearl).frame(height: 1)
        }
    }

    private var canSend: Bool {
        !viewModel.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !viewModel.isSending
    }
}

#Preview {
    NavigationStack {
        ThreadDetailView(threadId: "preview")
    }
}
