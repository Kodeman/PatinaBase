//  SiteRequestContract.swift
//  Capture
//
//  Integration boundary for the P1 Supabase/Edge contract. Keep names and wire
//  envelopes here so migration/function reconciliation does not leak into UI or
//  the durable outbox.

import Foundation

enum SiteRequestContract {
    enum RPC {
        static let createDraft = "site_request_create_draft"
        static let reviseItem = "site_request_revise_item"
        static let send = "site_request_send"
        static let resend = "site_request_resend"
        static let approveItem = "site_request_approve_item"
        static let redoItem = "site_request_redo_item"
        static let close = "site_request_close"
    }

    enum GuestAction {
        static let bootstrap = "bootstrap"
        static let createUpload = "upload-intent"
        static let acknowledgeUpload = "receipt"
        static let deliver = "deliver"
    }

    static let guestFunction = "site-request-guest"

    /// Authenticated comms rail. It preserves the caller JWT into the RPC and
    /// performs the server-side SMS dispatch before acknowledging success.
    static let designerDispatchFunction = "site-request-dispatch"
}

enum SiteRequestRemoteError: LocalizedError, Sendable {
    case assigneePartyRequired
    case noOpenItem
    case reviewDeliveryRequired
    case invalidResponse
    case rejected(status: Int, message: String)

    var invalidatesGuestAccess: Bool {
        guard case let .rejected(status, _) = self else { return false }
        return status == 401 || status == 404
    }

    var errorDescription: String? {
        switch self {
        case .assigneePartyRequired:
            return "Choose a project contact before sending this request."
        case .noOpenItem:
            return "This item is no longer open for capture. Refresh the private link."
        case .reviewDeliveryRequired:
            return "A server-received delivery is required before review."
        case .invalidResponse:
            return "The site request service returned an unreadable response."
        case let .rejected(status, message):
            return "Site request service failed (\(status)): \(message)"
        }
    }
}
