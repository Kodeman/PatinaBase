//  SiteRequestOutboxRecord.swift
//  CaptureKit
//
//  Durable, request-specific guest delivery queue. A record reaches `delivered`
//  only after the server returns an idempotent delivery receipt.

import Foundation
import SwiftData
import CryptoKit

public enum SiteRequestOutboxState: String, Codable, CaseIterable, Sendable {
    case queued
    case uploading
    case awaitingReceipt = "awaiting_receipt"
    case delivered
    case failed

    public func canTransition(to next: SiteRequestOutboxState) -> Bool {
        switch (self, next) {
        case (.queued, .uploading), (.queued, .failed),
             (.uploading, .queued),
             (.uploading, .awaitingReceipt), (.uploading, .failed),
             (.awaitingReceipt, .delivered), (.awaitingReceipt, .failed),
             (.failed, .queued):
            return true
        default:
            return self == next
        }
    }
}

@Model
public final class SiteRequestOutboxRecord {
    @Attribute(.unique) public var clientDeliveryID: UUID
    public var requestID: String
    public var itemID: String
    public var itemVersionID: String
    public var payloadPath: String
    public var mediaPaths: [String]
    public var checksumSHA256: String
    public var stateRaw: String
    public var retryCount: Int
    public var nextAttemptAt: Date?
    public var lastError: String?
    public var serverDeliverableID: String?
    public var createdAt: Date
    public var updatedAt: Date

    public var state: SiteRequestOutboxState {
        get { SiteRequestOutboxState(rawValue: stateRaw) ?? .failed }
        set { stateRaw = newValue.rawValue }
    }

    public init(clientDeliveryID: UUID = UUID(), requestID: String, itemID: String,
                itemVersionID: String, payloadPath: String,
                mediaPaths: [String] = [], checksumSHA256: String) {
        self.clientDeliveryID = clientDeliveryID
        self.requestID = requestID
        self.itemID = itemID
        self.itemVersionID = itemVersionID
        self.payloadPath = payloadPath
        self.mediaPaths = mediaPaths
        self.checksumSHA256 = checksumSHA256
        self.stateRaw = SiteRequestOutboxState.queued.rawValue
        self.retryCount = 0
        self.createdAt = Date()
        self.updatedAt = Date()
    }

    public func transition(to next: SiteRequestOutboxState, error: String? = nil,
                           serverDeliverableID: String? = nil, now: Date = Date()) throws {
        guard state.canTransition(to: next) else {
            throw SiteRequestOutboxError.invalidTransition(from: state, to: next)
        }
        state = next
        lastError = error
        self.serverDeliverableID = serverDeliverableID ?? self.serverDeliverableID
        updatedAt = now
        if next == .failed {
            retryCount += 1
            nextAttemptAt = now.addingTimeInterval(Self.retryDelay(attempt: retryCount))
        } else if next == .delivered || next == .queued {
            nextAttemptAt = nil
        }
    }

    public static func retryDelay(attempt: Int) -> TimeInterval {
        min(3_600, pow(2, Double(max(0, attempt - 1))) * 5)
    }
}

public enum SiteRequestOutboxError: Error, Equatable, Sendable {
    case invalidTransition(from: SiteRequestOutboxState, to: SiteRequestOutboxState)
}

public enum SiteRequestChecksum {
    public static func sha256(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
}
