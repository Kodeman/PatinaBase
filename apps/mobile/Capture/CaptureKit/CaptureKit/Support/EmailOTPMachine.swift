//  EmailOTPMachine.swift
//  CaptureKit
//
//  Pure state + validators for the O2 "Continue with email" one-time-code flow:
//  collect an email → request a 6-digit code → enter code → verify. Kept
//  SDK-free (no Supabase, no SwiftUI) so every transition unit-tests in
//  CaptureTests. The view owns one `EmailOTPMachine` and drives it; the real
//  network calls live app-side behind the `WorkspaceAuthorizing` seam.

import Foundation

/// Email-address helpers (validation + normalization).
public enum EmailAddress {
    /// Loose RFC-ish shape check — mirrors the Patina app's AuthViewModel regex.
    public static func isValid(_ email: String) -> Bool {
        let pattern = #"^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$"#
        return normalize(email).range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
    }

    /// Trim + lowercase — the value actually sent to GoTrue.
    public static func normalize(_ email: String) -> String {
        email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }
}

/// Six-digit email-code helpers.
public enum EmailCode {
    /// Digits only, capped at six — bind a text field through this.
    public static func sanitize(_ raw: String) -> String {
        String(raw.filter(\.isNumber).prefix(6))
    }

    /// A submittable code is exactly six digits.
    public static func isComplete(_ code: String) -> Bool {
        code.count == 6 && code.allSatisfy(\.isNumber)
    }
}

/// Deterministic state machine for O2's email sub-flow. Value type; the view
/// holds one in `@State` and calls the mutating transitions.
public struct EmailOTPMachine: Equatable, Sendable {
    /// Which field the user is on.
    public enum Step: Equatable, Sendable { case email, code }
    /// Async status of the current step.
    public enum Status: Equatable, Sendable { case idle, working, failed(String) }

    public private(set) var step: Step = .email
    public private(set) var status: Status = .idle
    public private(set) var email: String = ""
    public private(set) var code: String = ""

    public init() {}

    /// Non-nil user-facing error, when the last transition failed.
    public var errorMessage: String? {
        if case let .failed(message) = status { return message }
        return nil
    }

    /// The "Send code" button is live: on the email step, not in flight, valid email.
    public var canSend: Bool {
        step == .email && status != .working && EmailAddress.isValid(email)
    }

    /// The "Verify" button is live: on the code step, not in flight, six digits.
    public var canVerify: Bool {
        step == .code && status != .working && EmailCode.isComplete(code)
    }

    // MARK: Input

    /// Set the email (email step only). Clears a prior failure so the banner
    /// doesn't linger while the user edits.
    public mutating func setEmail(_ raw: String) {
        email = raw
        clearFailure()
    }

    /// Set the code, sanitized to ≤6 digits. Clears a prior failure.
    public mutating func setCode(_ raw: String) {
        code = EmailCode.sanitize(raw)
        clearFailure()
    }

    // MARK: Transitions

    /// Begin sending a code. Precondition: ``canSend``.
    public mutating func beginSend() { status = .working }

    /// Send succeeded → advance to the code step with an empty field.
    public mutating func codeSent() {
        step = .code
        status = .idle
        code = ""
    }

    /// Begin verifying. Precondition: ``canVerify``.
    public mutating func beginVerify() { status = .working }

    /// A send or verify failed with a user-facing `message`. On the code step
    /// the entered digits are cleared so the user retypes cleanly.
    public mutating func fail(_ message: String) {
        status = .failed(message)
        if step == .code { code = "" }
    }

    /// Return to the email step (from the code step), reset to idle.
    public mutating func backToEmail() {
        step = .email
        status = .idle
        code = ""
    }

    private mutating func clearFailure() {
        if case .failed = status { status = .idle }
    }
}
