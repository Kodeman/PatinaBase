//
//  CaptureTransferState.swift
//  CaptureKit
//
//  One honest transfer vocabulary shared by specimen sync and site-scan
//  recovery. A transfer is never complete without a server receipt.
//

import Foundation

public enum CaptureTransferPhase: String, Codable, CaseIterable, Sendable {
    case local
    case queued
    case uploading
    case awaitingConfirmation
    case complete
    case retryableFailure
    case rejected
}

public struct CaptureTransferState: Codable, Equatable, Sendable {
    public var phase: CaptureTransferPhase
    public var progress: Int
    public var errorMessage: String?
    public var retryCount: Int
    public var receiptID: String?

    public init(
        phase: CaptureTransferPhase,
        progress: Int = 0,
        errorMessage: String? = nil,
        retryCount: Int = 0,
        receiptID: String? = nil
    ) {
        self.phase = phase
        self.progress = min(max(progress, 0), 100)
        self.errorMessage = errorMessage
        self.retryCount = max(retryCount, 0)
        self.receiptID = receiptID
    }

    public static let local = CaptureTransferState(phase: .local)
}

public enum CaptureTransferEvent: Equatable, Sendable {
    case enqueue
    case beginUpload
    case updateProgress(Int)
    case awaitConfirmation
    case confirm(receiptID: String)
    case fail(message: String)
    case reject(message: String)
    case retry
}

public enum CaptureTransferTransitionError: Error, Equatable {
    case invalidTransition
    case missingReceipt
}

public enum CaptureTransferReducer {
    public static func reduce(
        _ state: CaptureTransferState,
        _ event: CaptureTransferEvent
    ) throws -> CaptureTransferState {
        switch (state.phase, event) {
        case (.local, .enqueue):
            return CaptureTransferState(phase: .queued)

        case (.queued, .beginUpload):
            return CaptureTransferState(
                phase: .uploading,
                retryCount: state.retryCount
            )

        case (.uploading, .updateProgress(let progress)):
            return CaptureTransferState(
                phase: .uploading,
                progress: progress,
                retryCount: state.retryCount
            )

        case (.uploading, .awaitConfirmation):
            return CaptureTransferState(
                phase: .awaitingConfirmation,
                progress: 100,
                retryCount: state.retryCount
            )

        case (.awaitingConfirmation, .confirm(let receiptID)):
            let receipt = receiptID.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !receipt.isEmpty else {
                throw CaptureTransferTransitionError.missingReceipt
            }
            return CaptureTransferState(
                phase: .complete,
                progress: 100,
                retryCount: state.retryCount,
                receiptID: receipt
            )

        case (.retryableFailure, .retry):
            return CaptureTransferState(
                phase: .queued,
                retryCount: state.retryCount
            )

        case (.local, .fail(let message)),
             (.queued, .fail(let message)),
             (.uploading, .fail(let message)),
             (.awaitingConfirmation, .fail(let message)):
            return CaptureTransferState(
                phase: .retryableFailure,
                progress: state.progress,
                errorMessage: message,
                retryCount: state.retryCount + 1
            )

        case (.awaitingConfirmation, .reject(let message)):
            return CaptureTransferState(
                phase: .rejected,
                progress: 100,
                errorMessage: message,
                retryCount: state.retryCount
            )

        default:
            throw CaptureTransferTransitionError.invalidTransition
        }
    }
}
