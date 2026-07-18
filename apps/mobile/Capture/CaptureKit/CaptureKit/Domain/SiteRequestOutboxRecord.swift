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
    case terminal

    public func canTransition(to next: SiteRequestOutboxState) -> Bool {
        switch (self, next) {
        case (.queued, .uploading), (.queued, .failed), (.queued, .terminal),
             (.uploading, .queued),
             (.uploading, .awaitingReceipt), (.uploading, .failed), (.uploading, .terminal),
             (.awaitingReceipt, .delivered), (.awaitingReceipt, .failed),
             (.awaitingReceipt, .terminal),
             (.failed, .queued), (.failed, .terminal):
            return true
        default:
            return self == next
        }
    }
}

public enum SiteRequestOutboxTerminalReason: String, Codable, CaseIterable, Sendable {
    case invalidAccess = "invalid_access"
    case requestUnavailable = "request_unavailable"
    case requestChanged = "request_changed"
    case checksumMismatch = "checksum_mismatch"
    case invalidPayload = "invalid_payload"

    public var userMessage: String {
        switch self {
        case .invalidAccess:
            return "This private link is no longer valid. Ask the designer for a new link."
        case .requestUnavailable:
            return "This request is no longer available. Ask the designer before recapturing it."
        case .requestChanged:
            return "The request or item version changed. Reopen the latest private link before recapturing."
        case .checksumMismatch:
            return "The saved media did not match its upload receipt. Recapture this item before sending again."
        case .invalidPayload:
            return "This saved delivery cannot be accepted. Reopen the item and capture it again."
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
    public var terminalReasonRaw: String?
    public var createdAt: Date
    public var updatedAt: Date

    public var state: SiteRequestOutboxState {
        get { SiteRequestOutboxState(rawValue: stateRaw) ?? .failed }
        set { stateRaw = newValue.rawValue }
    }

    public var terminalReason: SiteRequestOutboxTerminalReason? {
        terminalReasonRaw.flatMap(SiteRequestOutboxTerminalReason.init(rawValue:))
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
                           serverDeliverableID: String? = nil,
                           terminalReason: SiteRequestOutboxTerminalReason? = nil,
                           now: Date = Date()) throws {
        guard state.canTransition(to: next) else {
            throw SiteRequestOutboxError.invalidTransition(from: state, to: next)
        }
        if next == .delivered,
           serverDeliverableID?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false {
            throw SiteRequestOutboxError.serverReceiptRequired
        }
        if next == .terminal, terminalReason == nil {
            throw SiteRequestOutboxError.terminalReasonRequired
        }
        state = next
        lastError = error
        self.serverDeliverableID = serverDeliverableID ?? self.serverDeliverableID
        terminalReasonRaw = terminalReason?.rawValue ?? terminalReasonRaw
        updatedAt = now
        if next == .failed {
            retryCount += 1
            nextAttemptAt = now.addingTimeInterval(Self.retryDelay(attempt: retryCount))
        } else if next == .delivered || next == .queued || next == .terminal {
            nextAttemptAt = nil
        }
    }

    public static func retryDelay(attempt: Int) -> TimeInterval {
        min(3_600, pow(2, Double(max(0, attempt - 1))) * 5)
    }
}

public enum SiteRequestOutboxError: Error, Equatable, Sendable {
    case invalidTransition(from: SiteRequestOutboxState, to: SiteRequestOutboxState)
    case serverReceiptRequired
    case terminalReasonRequired
}

public enum SiteRequestFailureDisposition: Equatable, Sendable {
    case transient
    case terminal(SiteRequestOutboxTerminalReason)
}

public enum SiteRequestFailureClassifier {
    /// Guest API failures that cannot succeed with the same immutable
    /// request/item/version/client-delivery identity are terminal. Provider,
    /// network, server, and receipt-not-ready failures remain retryable.
    public static func disposition(status: Int, code: String) -> SiteRequestFailureDisposition {
        switch status {
        case 401:
            return .terminal(.invalidAccess)
        case 404 where code == "invalid_or_expired_link":
            return .terminal(.invalidAccess)
        case 404:
            return .terminal(.requestUnavailable)
        case 409 where code == "request_conflict":
            return .terminal(.requestChanged)
        case 409 where code == "receipt_checksum_mismatch":
            return .terminal(.checksumMismatch)
        case 400, 413, 422:
            return .terminal(.invalidPayload)
        default:
            return .transient
        }
    }
}

public enum SiteRequestChecksum {
    public static func sha256(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
}
