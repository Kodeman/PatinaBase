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
            messages.append(saved)
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
}
