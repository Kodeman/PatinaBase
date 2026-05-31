//
//  ThreadDetailView.swift
//  Patina
//
//  Conversation view: bubbles + simple composer. Distinct from the
//  Companion (AI) chat — this is human↔human via `comms_messages`.
//

import SwiftUI
import Supabase

struct ThreadDetailView: View {
    let threadId: String
    @State private var viewModel: ThreadDetailViewModel

    init(threadId: String) {
        self.threadId = threadId
        _viewModel = State(initialValue: ThreadDetailViewModel(threadId: threadId))
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView(showsIndicators: false) {
                    LazyVStack(alignment: .leading, spacing: 8) {
                        if viewModel.isLoading && viewModel.messages.isEmpty {
                            ProgressView()
                                .tint(PatinaColors.clay)
                                .padding(.top, 60)
                                .frame(maxWidth: .infinity)
                        } else if let error = viewModel.error, viewModel.messages.isEmpty {
                            Text(error)
                                .font(PatinaTypography.bodySmall)
                                .foregroundStyle(PatinaColors.mocha)
                                .frame(maxWidth: .infinity)
                                .padding(.top, 60)
                        } else {
                            ForEach(viewModel.messages) { message in
                                bubble(message)
                                    .id(message.id)
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                    .padding(.bottom, 8)
                }
                .onChange(of: viewModel.messages.count) { _, _ in
                    if let last = viewModel.messages.last?.id {
                        withAnimation { proxy.scrollTo(last, anchor: .bottom) }
                    }
                }
            }
            composer
        }
        .background(PatinaColors.offWhite)
        .task {
            await viewModel.load()
            viewModel.startLiveUpdates()
        }
        .onDisappear { viewModel.stopLiveUpdates() }
        .toolbarTitleDisplayMode(.inline)
    }

    private func bubble(_ message: RemoteCommsMessage) -> some View {
        let isOwn = isFromCurrentUser(message)
        let bg = isOwn ? PatinaColors.clay.opacity(0.18) : PatinaColors.softCream
        let fg = PatinaColors.charcoal
        return HStack {
            if isOwn { Spacer() }
            Text(message.body)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(fg)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(bg)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .frame(maxWidth: 280, alignment: isOwn ? .trailing : .leading)
            if !isOwn { Spacer() }
        }
    }

    private func isFromCurrentUser(_ message: RemoteCommsMessage) -> Bool {
        guard let sender = message.sender_id else { return false }
        guard let me = try? SupabaseClientManager.shared.client.auth.currentUser?.id.uuidString.lowercased() else {
            return false
        }
        return sender.lowercased() == me
    }

    private var composer: some View {
        HStack(spacing: 10) {
            TextField("Type a message…", text: $viewModel.draft, axis: .vertical)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.charcoal)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(PatinaColors.softCream)
                .clipShape(RoundedRectangle(cornerRadius: 22))
                .lineLimit(1...4)

            Button {
                Task { await viewModel.send() }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(canSend ? PatinaColors.clay : PatinaColors.agedOak.opacity(0.6))
            }
            .disabled(!canSend)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(PatinaColors.offWhite.opacity(0.98))
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
