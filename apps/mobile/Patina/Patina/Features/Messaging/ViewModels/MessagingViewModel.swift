//
//  MessagingViewModel.swift
//  Patina
//
//  Client↔designer messaging. Thread list + thread detail with
//  composer. Distinct from Companion (AI) — these are human↔human
//  threads from `comms_threads`.
//

import SwiftUI

@Observable
@MainActor
final class ThreadListViewModel {
    var threads: [RemoteCommsThread] = []
    var isLoading: Bool = false
    var error: String?

    func load() async {
        isLoading = true
        error = nil
        do {
            self.threads = try await MessagingAPIClient.shared.listThreads()
        } catch {
            self.error = "Couldn't load conversations"
            #if DEBUG
            print("[Messaging] threads failed: \(error.localizedDescription)")
            #endif
        }
        isLoading = false
    }
}

@Observable
@MainActor
final class ThreadDetailViewModel {
    let threadId: String
    var messages: [RemoteCommsMessage] = []
    var draft: String = ""
    var isLoading: Bool = false
    var isSending: Bool = false
    var error: String?

    /// Realtime channel for live INSERTs on `comms_messages` for this
    /// thread. Held as `nonisolated(unsafe)` because it's only mutated on
    /// MainActor (`startLiveUpdates`/`stopLiveUpdates`) and the listener
    /// task that reads from its stream runs on MainActor as well.
    private var realtime: MessagingRealtimeService?
    private var realtimeTask: Task<Void, Never>?

    init(threadId: String) {
        self.threadId = threadId
    }

    func load() async {
        isLoading = true
        error = nil
        do {
            self.messages = try await MessagingAPIClient.shared.listMessages(threadId: threadId)
            try? await MessagingAPIClient.shared.markRead(threadId: threadId)
        } catch {
            self.error = "Couldn't load messages"
            #if DEBUG
            print("[Messaging] thread load failed: \(error.localizedDescription)")
            #endif
        }
        isLoading = false
    }

    func send() async {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isSending else { return }
        isSending = true
        let body = trimmed
        draft = ""
        do {
            let saved = try await MessagingAPIClient.shared.sendMessage(threadId: threadId, body: body)
            // Optimistic append; the realtime echo will be deduped by id
            // in `apply(remote:)`.
            apply(remote: saved)
        } catch {
            // Restore the draft so the user doesn't lose what they typed.
            draft = body
            self.error = "Couldn't send"
            #if DEBUG
            print("[Messaging] send failed: \(error.localizedDescription)")
            #endif
        }
        isSending = false
    }

    /// Open a Supabase Realtime subscription for new messages on this
    /// thread. Safe to call repeatedly — the prior subscription is
    /// replaced. Call `stopLiveUpdates()` when the view disappears.
    func startLiveUpdates() {
        // If we already have a running listener, leave it alone so we
        // don't churn the websocket on .task re-fires.
        if realtimeTask != nil { return }

        let service = realtime ?? MessagingRealtimeService()
        self.realtime = service

        let stream = service.subscribe(threadId: threadId)
        realtimeTask = Task { [weak self] in
            for await message in stream {
                guard let self else { return }
                self.apply(remote: message)
            }
        }
    }

    /// Tear down the Realtime subscription. Idempotent.
    func stopLiveUpdates() {
        realtimeTask?.cancel()
        realtimeTask = nil
        if let service = realtime {
            Task { await service.stop() }
        }
        realtime = nil
    }

    /// Append-or-replace by `id`. Used by both optimistic local sends and
    /// the realtime echo of those same rows; whichever arrives first
    /// wins, the second is treated as an update.
    private func apply(remote message: RemoteCommsMessage) {
        if let idx = messages.firstIndex(where: { $0.id == message.id }) {
            messages[idx] = message
        } else {
            messages.append(message)
        }
    }
}
