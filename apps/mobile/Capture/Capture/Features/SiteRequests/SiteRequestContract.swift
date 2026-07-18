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

    enum GuestFunction {
        static let bootstrap = "site_request_guest_bootstrap"
        static let createUpload = "site_request_guest_create_upload"
        static let acknowledgeUpload = "site_request_guest_ack_upload"
        static let deliver = "site_request_guest_deliver"
    }

    /// Authenticated comms rail. It preserves the caller JWT into the RPC and
    /// performs the server-side SMS dispatch before acknowledging success.
    static let designerDispatchFunction = "site-request-dispatch"
}

enum SiteRequestRemoteError: LocalizedError, Sendable {
    case assigneePartyRequired
    case invalidResponse
    case rejected(status: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .assigneePartyRequired:
            return "Choose a project contact before sending this request."
        case .invalidResponse:
            return "The site request service returned an unreadable response."
        case let .rejected(status, message):
            return "Site request service failed (\(status)): \(message)"
        }
    }
}
