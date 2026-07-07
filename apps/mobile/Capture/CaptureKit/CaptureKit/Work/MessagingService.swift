//  MessagingService.swift
//  CaptureKit
//
//  M1/M2 seam — the comms inbox and one thread (read, send, live-observe). PURE
//  Foundation (no SDK): the app's concrete maps the reference `MessagingAPIClient`
//  rows (comms_threads / comms_messages / participants) into these Field DTOs and
//  bridges Supabase Realtime into `observeMessages`; the mock returns fixtures.
//  Wave M builds the screens against this.
//
//  DTO shaping (from MessagingAPIClient selects):
//  `unread` ← the current user's participant `last_read_at` vs `last_message_at`;
//  `lastMessagePreview` ← the embedded latest message body; `isMine` ← sender ==
//  current user; system messages coalesce `senderID` to "".

import Foundation

/// A thread summary for the M1 inbox.
public struct FieldThread: Identifiable, Sendable, Codable {
    public let id: String
    public let title: String
    public let lastMessagePreview: String?
    public let lastMessageAt: Date?
    public let unread: Bool

    public init(id: String, title: String, lastMessagePreview: String? = nil,
                lastMessageAt: Date? = nil, unread: Bool = false) {
        self.id = id
        self.title = title
        self.lastMessagePreview = lastMessagePreview
        self.lastMessageAt = lastMessageAt
        self.unread = unread
    }
}

/// A single message in the M2 thread.
public struct FieldMessage: Identifiable, Sendable, Codable {
    public let id: String
    public let threadID: String
    /// Sender profile id; "" for system messages.
    public let senderID: String
    public let senderName: String?
    public let text: String
    public let sentAt: Date
    /// True when the sender is the current user.
    public let isMine: Bool

    public init(id: String, threadID: String, senderID: String, senderName: String? = nil,
                text: String, sentAt: Date, isMine: Bool) {
        self.id = id
        self.threadID = threadID
        self.senderID = senderID
        self.senderName = senderName
        self.text = text
        self.sentAt = sentAt
        self.isMine = isMine
    }
}

public protocol MessagingService: Sendable {
    /// Active threads visible to the user, most-recent first.
    func listThreads() async throws -> [FieldThread]
    /// Full message history for a thread, oldest first.
    func messages(threadID: String) async throws -> [FieldMessage]
    /// Post a message; returns the persisted row (echoed into the thread).
    func send(threadID: String, text: String) async throws -> FieldMessage
    /// Live tail — yields each new message as it arrives (Realtime).
    func observeMessages(threadID: String) -> AsyncStream<FieldMessage>
}
