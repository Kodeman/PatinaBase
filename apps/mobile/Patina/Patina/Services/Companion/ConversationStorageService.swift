//
//  ConversationStorageService.swift
//  Patina
//
//  Local storage service for conversation history
//  Provides offline access and sync with backend
//

import Foundation

/// Service for locally caching conversation history
public final class ConversationStorageService {

    // MARK: - Singleton

    public static let shared = ConversationStorageService()

    // MARK: - Configuration

    private let fileManager = FileManager.default
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    /// Maximum messages to cache locally
    private let maxCachedMessages = 100

    /// Cache file name
    private let cacheFileName = "conversation_cache.json"

    // MARK: - Cache Model

    private struct ConversationCache: Codable {
        var messages: [CachedMessage]
        var lastSyncTimestamp: Date?
        var userId: String?

        init(messages: [CachedMessage] = [], lastSyncTimestamp: Date? = nil, userId: String? = nil) {
            self.messages = messages
            self.lastSyncTimestamp = lastSyncTimestamp
            self.userId = userId
        }
    }

    /// Cached message representation
    public struct CachedMessage: Codable, Identifiable, Equatable {
        public let id: UUID
        public let content: String
        public let sender: String // "user" or "patina"
        public let timestamp: Date
        public let isSynced: Bool
        public let serverMessageId: String?

        public init(
            id: UUID = UUID(),
            content: String,
            sender: String,
            timestamp: Date = Date(),
            isSynced: Bool = false,
            serverMessageId: String? = nil
        ) {
            self.id = id
            self.content = content
            self.sender = sender
            self.timestamp = timestamp
            self.isSynced = isSynced
            self.serverMessageId = serverMessageId
        }

        /// Convert from Message type
        public init(from message: Message, isSynced: Bool = false, serverMessageId: String? = nil) {
            self.id = message.id
            self.content = message.content
            self.sender = message.sender.rawValue
            self.timestamp = message.timestamp
            self.isSynced = isSynced
            self.serverMessageId = serverMessageId
        }

        /// Convert to Message type
        public func toMessage() -> Message {
            Message(
                id: id,
                content: content,
                sender: MessageSender(rawValue: sender) ?? .patina,
                timestamp: timestamp
            )
        }
    }

    // MARK: - Initialization

    private init() {
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
    }

    // MARK: - Public Methods

    /// Save messages to local cache
    /// - Parameters:
    ///   - messages: Messages to cache
    ///   - userId: Current user ID
    public func saveMessages(_ messages: [Message], userId: String) {
        var cache = loadCache() ?? ConversationCache()

        // Only cache for same user
        if cache.userId != userId {
            cache = ConversationCache(userId: userId)
        }

        // Convert to cached messages
        let cachedMessages = messages.map { CachedMessage(from: $0, isSynced: true) }

        // Update cache
        cache.messages = Array(cachedMessages.suffix(maxCachedMessages))
        cache.lastSyncTimestamp = Date()

        saveCache(cache)
    }

    /// Add a single message to the cache
    /// - Parameters:
    ///   - message: Message to add
    ///   - userId: Current user ID
    ///   - isSynced: Whether the message has been synced to server
    public func addMessage(_ message: Message, userId: String, isSynced: Bool = false) {
        var cache = loadCache() ?? ConversationCache(userId: userId)

        // Only cache for same user
        if cache.userId != userId {
            cache = ConversationCache(userId: userId)
        }

        let cachedMessage = CachedMessage(from: message, isSynced: isSynced)
        cache.messages.append(cachedMessage)

        // Trim to max size
        if cache.messages.count > maxCachedMessages {
            cache.messages = Array(cache.messages.suffix(maxCachedMessages))
        }

        saveCache(cache)
    }

    /// Mark a message as synced
    /// - Parameter messageId: ID of the message to mark
    public func markMessageSynced(_ messageId: UUID, serverMessageId: String? = nil) {
        guard var cache = loadCache() else { return }

        if let index = cache.messages.firstIndex(where: { $0.id == messageId }) {
            let message = cache.messages[index]
            cache.messages[index] = CachedMessage(
                id: message.id,
                content: message.content,
                sender: message.sender,
                timestamp: message.timestamp,
                isSynced: true,
                serverMessageId: serverMessageId
            )
            saveCache(cache)
        }
    }

    /// Load cached messages for a user
    /// - Parameter userId: User ID to load messages for
    /// - Returns: Array of cached messages, or nil if no cache exists
    public func loadMessages(for userId: String) -> [Message]? {
        guard let cache = loadCache(), cache.userId == userId else {
            return nil
        }

        return cache.messages.map { $0.toMessage() }
    }

    /// Get unsynced messages that need to be sent to server
    /// - Parameter userId: User ID
    /// - Returns: Array of unsynced messages
    public func getUnsyncedMessages(for userId: String) -> [CachedMessage] {
        guard let cache = loadCache(), cache.userId == userId else {
            return []
        }

        return cache.messages.filter { !$0.isSynced }
    }

    /// Get the last sync timestamp
    /// - Parameter userId: User ID
    /// - Returns: Last sync date, or nil if never synced
    public func lastSyncTimestamp(for userId: String) -> Date? {
        guard let cache = loadCache(), cache.userId == userId else {
            return nil
        }

        return cache.lastSyncTimestamp
    }

    /// Update the last sync timestamp
    /// - Parameter userId: User ID
    public func updateLastSyncTimestamp(for userId: String) {
        guard var cache = loadCache(), cache.userId == userId else { return }

        cache.lastSyncTimestamp = Date()
        saveCache(cache)
    }

    /// Clear the cache for a user (e.g., on logout)
    /// - Parameter userId: User ID to clear cache for, or nil to clear all
    public func clearCache(for userId: String? = nil) {
        if let userId = userId {
            guard let cache = loadCache(), cache.userId == userId else { return }
        }

        do {
            let cacheURL = getCacheFileURL()
            if fileManager.fileExists(atPath: cacheURL.path) {
                try fileManager.removeItem(at: cacheURL)
            }
        } catch {
            print("Failed to clear conversation cache: \(error)")
        }
    }

    /// Check if cache exists and is valid for user
    /// - Parameter userId: User ID
    /// - Returns: True if valid cache exists
    public func hasCachedMessages(for userId: String) -> Bool {
        guard let cache = loadCache(), cache.userId == userId else {
            return false
        }

        return !cache.messages.isEmpty
    }

    // MARK: - Private Methods

    private func getCacheFileURL() -> URL {
        let documentsDirectory = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first!
        return documentsDirectory.appendingPathComponent(cacheFileName)
    }

    private func loadCache() -> ConversationCache? {
        let cacheURL = getCacheFileURL()

        guard fileManager.fileExists(atPath: cacheURL.path) else {
            return nil
        }

        do {
            let data = try Data(contentsOf: cacheURL)
            return try decoder.decode(ConversationCache.self, from: data)
        } catch {
            print("Failed to load conversation cache: \(error)")
            return nil
        }
    }

    private func saveCache(_ cache: ConversationCache) {
        let cacheURL = getCacheFileURL()

        do {
            let data = try encoder.encode(cache)
            try data.write(to: cacheURL, options: .atomic)
        } catch {
            print("Failed to save conversation cache: \(error)")
        }
    }
}

// MARK: - Sync Support

extension ConversationStorageService {

    /// Sync local cache with server data
    /// - Parameters:
    ///   - serverMessages: Messages from server
    ///   - userId: Current user ID
    /// - Returns: Merged messages (server + unsynced local)
    public func syncWithServer(_ serverMessages: [Message], userId: String) -> [Message] {
        // Get unsynced local messages
        let unsyncedLocal = getUnsyncedMessages(for: userId)

        // Find local messages that aren't on server yet
        let serverIds = Set(serverMessages.map { $0.id })
        let localOnlyMessages = unsyncedLocal.filter { !serverIds.contains($0.id) }

        // Merge: server messages + unsynced local messages
        var merged = serverMessages
        for localMsg in localOnlyMessages {
            // Insert at correct position by timestamp
            let insertIndex = merged.firstIndex { $0.timestamp > localMsg.timestamp } ?? merged.endIndex
            merged.insert(localMsg.toMessage(), at: insertIndex)
        }

        // Update cache with merged data
        saveMessages(merged, userId: userId)

        return merged
    }
}
