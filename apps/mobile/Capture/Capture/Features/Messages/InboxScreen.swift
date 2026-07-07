//  InboxScreen.swift
//  Capture · Wave M (Messages)
//
//  M1 — thread list (route `.inbox`, id `m1Inbox`). Title, single-line
//  last-message preview, relative time (mono, right), and an unread brass
//  dot. `.refreshable`; row → M2 (`.thread(id)`). Real data via
//  `MessagingService.listThreads()` — the designer's side of client↔designer
//  threads.

import SwiftUI
import CaptureKit

@Observable
@MainActor
final class InboxViewModel {
    private let messaging: any MessagingService
    var threads: [FieldThread] = []
    var isLoading = false
    var errorMessage: String?

    init(messaging: any MessagingService) {
        self.messaging = messaging
    }

    func load() async {
        errorMessage = nil
        if threads.isEmpty { isLoading = true }
        do {
            threads = try await messaging.listThreads()
        } catch {
            errorMessage = "Couldn't load your conversations."
        }
        isLoading = false
    }
}

struct InboxScreen: View {
    let messaging: any MessagingService
    let analytics: any CaptureAnalytics
    let coordinator: CaptureCoordinator

    @State private var viewModel: InboxViewModel

    init(messaging: any MessagingService, analytics: any CaptureAnalytics, coordinator: CaptureCoordinator) {
        self.messaging = messaging
        self.analytics = analytics
        self.coordinator = coordinator
        _viewModel = State(initialValue: InboxViewModel(messaging: messaging))
    }

    var body: some View {
        content
            .background(CaptureColor.paper)
            .navigationTitle("Messages")
            .navigationBarTitleDisplayMode(.large)
            .task {
                analytics.screen(CaptureScreenID.m1Inbox.rawValue)
                await viewModel.load()
            }
            .refreshable { await viewModel.load() }
            .accessibilityIdentifier(CaptureScreenID.m1Inbox.rawValue)
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading && viewModel.threads.isEmpty {
            ProgressView()
                .tint(CaptureColor.verdigris)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let message = viewModel.errorMessage, viewModel.threads.isEmpty {
            errorState(message)
        } else if viewModel.threads.isEmpty {
            emptyState
        } else {
            list
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.threads) { thread in
                    Button {
                        analytics.event("messages.open_thread")
                        coordinator.navigate(to: .thread(thread.id))
                    } label: {
                        row(thread)
                    }
                    .buttonStyle(.plain)
                    Rectangle().fill(CaptureColor.line).frame(height: 1)
                }
            }
        }
    }

    private func row(_ thread: FieldThread) -> some View {
        HStack(alignment: .top, spacing: 10) {
            unreadDot(thread.unread)
            VStack(alignment: .leading, spacing: 3) {
                Text(thread.title)
                    .font(thread.unread ? CaptureType.bodyEmph : CaptureType.body)
                    .foregroundStyle(CaptureColor.ink)
                    .lineLimit(1)
                Text(thread.lastMessagePreview ?? "No messages yet")
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            if let date = thread.lastMessageAt {
                Text(MessagesDateFormat.compact(date))
                    .font(CaptureType.monoSmall)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel(for: thread))
    }

    private func unreadDot(_ unread: Bool) -> some View {
        Circle()
            .fill(unread ? CaptureColor.brass : Color.clear)
            .frame(width: 8, height: 8)
            .padding(.top, 6)
            .accessibilityHidden(true)
    }

    private func accessibilityLabel(for thread: FieldThread) -> String {
        var parts = [thread.title]
        if thread.unread { parts.append("unread") }
        if let preview = thread.lastMessagePreview, !preview.isEmpty { parts.append(preview) }
        if let date = thread.lastMessageAt { parts.append(MessagesDateFormat.accessible(date)) }
        return parts.joined(separator: ", ")
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(CaptureType.display)
                .foregroundStyle(CaptureColor.inkSoft)
            Text("No conversations yet.")
                .font(CaptureType.body)
                .foregroundStyle(CaptureColor.ink)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 10) {
            Text(message)
                .font(CaptureType.body)
                .foregroundStyle(CaptureColor.inkSoft)
                .multilineTextAlignment(.center)
            Button("Try again") {
                Task { await viewModel.load() }
            }
            .font(CaptureType.bodyEmph)
            .foregroundStyle(CaptureColor.verdigris)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

#if DEBUG
import CaptureKitMocks

#Preview {
    NavigationStack {
        InboxScreen(messaging: MockMessagingService(), analytics: MockCaptureAnalytics(), coordinator: CaptureCoordinator())
    }
}
#endif
