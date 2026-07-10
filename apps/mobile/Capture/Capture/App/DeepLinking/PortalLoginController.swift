//  PortalLoginController.swift
//  Capture
//
//  Drives the web→app QR sign-in when it arrives as a *deep link* — the iOS
//  Camera app (or any app) opening `field://login?v=1&th=<token_hash>`, including
//  from a signed-out cold start. (O2's "Scan from the portal" sheet handles the
//  in-app scanner path itself; Q1 forwards a login code here defensively.)
//
//  It exchanges the token through the same `WorkspaceAuthorizing` seam as Apple /
//  email, and honours the three signed-in states via the pure `PortalLogin`
//  state machine (CaptureKit): signed out → sign in; signed in as the same
//  account → a friendly no-op toast; signed in as someone else → confirm before
//  switching. Because the hashed token carries no recoverable identity, "same vs
//  different" can't be known before the exchange, so any live session is
//  confirmed first; the same/different toast is then chosen by comparing the
//  resolved user id afterwards.

import SwiftUI
import CaptureKit

/// A pending "you're already signed in — switch?" prompt (drives an alert).
struct PortalLoginConfirm: Identifiable, Equatable {
    let id = UUID()
    let token: PortalLoginToken
    /// The account signed in right now (for the alert copy).
    let currentEmail: String?
    /// Its user id, to classify the post-exchange result as same vs. switched.
    let previousUserID: String?
}

/// A transient banner shown after a deep-link exchange resolves.
struct PortalLoginToast: Identifiable, Equatable {
    enum Kind: Equatable { case success, info, error }
    let id = UUID()
    let kind: Kind
    let message: String
}

@Observable
@MainActor
final class PortalLoginController {
    // Injected once the composition root is available (see `configure`).
    @ObservationIgnored private var session: (any SessionProviding)?
    @ObservationIgnored private var authorizer: (any WorkspaceAuthorizing)?
    /// Fired after a successful exchange so the shell can leave onboarding for
    /// the Work/viewfinder surface (RootView sets `coordinator.phase = .ready`).
    @ObservationIgnored private var onSignedIn: (() -> Void)?

    // Observed UI state (RootView renders these).
    var confirmPrompt: PortalLoginConfirm?
    var toast: PortalLoginToast?
    private(set) var isExchanging = false

    // A link can arrive before `.task` wires dependencies (cold-start deep link);
    // buffer it and replay on `configure`.
    @ObservationIgnored private var configured = false
    @ObservationIgnored private var pendingURL: URL?
    @ObservationIgnored private var toastClearTask: Task<Void, Never>?

    init() {}

    /// Inject the composition-root dependencies. Idempotent; replays a buffered
    /// cold-start URL.
    func configure(session: any SessionProviding,
                   authorizer: any WorkspaceAuthorizing,
                   onSignedIn: @escaping () -> Void) {
        self.session = session
        self.authorizer = authorizer
        self.onSignedIn = onSignedIn
        configured = true
        if let url = pendingURL {
            pendingURL = nil
            receive(url: url)
        }
    }

    // MARK: - Intake

    /// Entry from `CaptureDeepLink` for a `field://login` URL. Parses, then runs
    /// the state machine. Surfaces a toast on a malformed / wrong-version link.
    func receive(url: URL) {
        guard configured else { pendingURL = url; return }
        do {
            let token = try PortalLoginToken.parse(url: url)
            receive(token: token)
        } catch {
            showToast(.init(kind: .error,
                            message: (error as? LocalizedError)?.errorDescription
                                ?? "That sign-in link isn’t valid."))
        }
    }

    /// Entry for an already-parsed token (Q1's scanner forwards login codes here).
    func receive(token: PortalLoginToken) {
        guard configured, let session else { pendingURL = nil; return }
        let state: PortalLoginState = session.isAuthenticated
            ? .signedIn(userID: session.userID ?? "", email: session.userEmail)
            : .signedOut
        // Pre-exchange the target is unknown (opaque hash), so a live session
        // resolves to `.confirmSwitch` — we never replace it silently.
        switch PortalLogin.resolve(state: state, target: nil) {
        case .signIn:
            Task { await exchange(token: token, previousUserID: nil) }
        case .confirmSwitch:
            confirmPrompt = PortalLoginConfirm(token: token,
                                               currentEmail: session.userEmail,
                                               previousUserID: session.userID)
        case .alreadySignedIn:
            break   // unreachable with target == nil; the resolved case is handled post-exchange
        }
    }

    // MARK: - Confirm-switch alert

    func confirmSwitch() {
        guard let prompt = confirmPrompt else { return }
        confirmPrompt = nil
        Task { await exchange(token: prompt.token, previousUserID: prompt.previousUserID) }
    }

    func cancelSwitch() { confirmPrompt = nil }

    // MARK: - Exchange

    private func exchange(token: PortalLoginToken, previousUserID: String?) async {
        guard let authorizer, let session else { return }
        isExchanging = true
        defer { isExchanging = false }
        do {
            _ = try await authorizer.authorizeWithPortalToken(tokenHash: token.tokenHash)
            let email = session.userEmail
            // Classify the resolved result: same account as before → friendly
            // no-op; a real switch or a first sign-in → success.
            if let previousUserID, previousUserID == session.userID {
                showToast(.init(kind: .info,
                                message: email.map { "You’re already signed in as \($0)." }
                                    ?? "You’re already signed in."))
            } else {
                showToast(.init(kind: .success,
                                message: email.map { "Signed in as \($0)." } ?? "Signed in."))
            }
            onSignedIn?()
        } catch {
            showToast(.init(kind: .error,
                            message: "Couldn’t sign in with that code — ask the portal to show a fresh one."))
        }
    }

    // MARK: - Toast lifecycle

    private func showToast(_ toast: PortalLoginToast) {
        self.toast = toast
        toastClearTask?.cancel()
        toastClearTask = Task { [weak self, id = toast.id] in
            try? await Task.sleep(for: .seconds(3.2))
            guard let self, !Task.isCancelled, self.toast?.id == id else { return }
            self.toast = nil
        }
    }
}
