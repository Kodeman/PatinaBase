//
//  AuthService.swift
//  Patina
//
//  Authentication service using Supabase Auth
//

import Foundation
import AuthenticationServices
import Supabase

/// Authentication service managing user sessions
@Observable
public final class AuthService {
    public static let shared = AuthService()

    // MARK: - State

    /// Current user session
    public private(set) var session: Session?

    /// Current user
    public var currentUser: User? {
        session?.user
    }

    /// Current user ID as string (for convenience)
    public var currentUserId: String? {
        session?.user.id.uuidString
    }

    /// Whether user is authenticated
    public var isAuthenticated: Bool {
        session != nil
    }

    /// Loading state
    public private(set) var isLoading = false

    /// Error message
    public private(set) var errorMessage: String?

    /// Clear any existing error message
    public func clearError() {
        errorMessage = nil
    }

    /// Whether initial auth state has been determined
    public private(set) var isAuthStateReady = false

    // MARK: - Private

    private var authStateTask: Task<Void, Never>?

    /// Continuations for callers awaiting `waitForAuthReady()`. We keep an
    /// array instead of a single optional because multiple call sites
    /// (RoomScanSyncService, feeds) can all await auth readiness concurrently
    /// during cold start — the previous single-slot implementation would drop
    /// all but the last continuation, leaking the others' tasks forever.
    private var authReadyContinuations: [CheckedContinuation<Void, Never>] = []

    // MARK: - Initialization

    private init() {
        startAuthStateListener()
    }

    // MARK: - Auth State Listener

    private func startAuthStateListener() {
        authStateTask = Task { @MainActor in
            for await (event, session) in supabase.auth.authStateChanges {
                self.session = session

                // Mark auth state as ready after first event and fan out
                // to every awaiting caller.
                if !self.isAuthStateReady {
                    self.isAuthStateReady = true
                    let waiting = self.authReadyContinuations
                    self.authReadyContinuations.removeAll()
                    for continuation in waiting {
                        continuation.resume()
                    }
                }

                // Event-agnostic hydration: whenever the stream yields a
                // session with a user, make sure ProfileService and
                // SettingsService are loaded. This catches `.signedIn`,
                // `.initialSession` (cold launch w/ restored session,
                // requires emitLocalSessionAsInitialSession=true on the
                // client), `.tokenRefreshed`, `.userUpdated` — every
                // case where the SDK confirms a user. Gate on the
                // *presence* of currentProfile rather than `isLoaded`,
                // because the previous gate locked out retries when the
                // initial fetch landed an empty result (which happens
                // when the SDK's auth context lags the event by a tick).
                if let user = session?.user, ProfileService.shared.currentProfile == nil {
                    PatinaLog.auth.debug("Hydrating profile for user (event=\(event)): \(user.id.uuidString)", privacy: .private)
                    await ProfileService.shared.fetchProfile(userId: user.id.uuidString)
                    await SettingsService.shared.load()
                }

                switch event {
                case .signedIn:
                    PatinaLog.auth.debug("User signed in: \(session?.user.id.uuidString ?? "unknown")", privacy: .private)
                    if let user = session?.user {
                        let emailDomain = user.email.map { $0.components(separatedBy: "@").last ?? "" } ?? ""
                        PostHogService.shared.identify(userId: user.id.uuidString, properties: [
                            "email_domain": emailDomain,
                            "platform": "ios",
                            "role": "client"
                        ])
                        // `.signedIn` is GoTrue's fresh-sign-in event — distinct from
                        // `.initialSession` (cold-launch session restore) — so this
                        // fires only on an actual sign-in, never on app relaunch.
                        // NOTE: this one observer covers every AuthService-routed
                        // method (password, magic link, OTP verify, and Apple sign-in
                        // when it doesn't go through CompanionAuthPanel's own path),
                        // so "magic-link" is a best-effort default label, not a
                        // precise per-method breakdown — see CompanionAuthPanel for
                        // the one path that CAN label itself accurately ("apple").
                        PostHogService.shared.capture("login", properties: ["method": "magic-link"])
                    }
                case .signedOut:
                    PatinaLog.auth.debug("User signed out")
                    PostHogService.shared.reset()
                    await ProfileService.shared.clear()
                case .userUpdated:
                    PatinaLog.auth.debug("User updated")
                default:
                    break
                }
            }
        }
    }

    /// Wait for auth state to be determined. Safe to call from multiple
    /// tasks concurrently — each caller registers its own continuation and
    /// all of them resume together once the first auth state event arrives.
    @MainActor
    public func waitForAuthReady() async {
        guard !isAuthStateReady else { return }
        await withCheckedContinuation { continuation in
            self.authReadyContinuations.append(continuation)
        }
    }

    // MARK: - Sign In Methods

    /// Sign in with email and password
    @MainActor
    public func signIn(email: String, password: String) async throws {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let session = try await supabase.auth.signIn(
                email: email,
                password: password
            )
            self.session = session
        } catch {
            // GoTrue returns `email_not_confirmed` when a fresh signup tries
            // to sign in before clicking the verification link. Surface this
            // as a distinct error so the UI can offer a "check your inbox"
            // recovery panel with a resend-verification action, instead of
            // the generic "invalid credentials" message the SDK provides.
            if Self.isEmailNotConfirmedError(error) {
                // Do not set errorMessage — the view model routes this case
                // to the "check your inbox" recovery panel, not the error
                // banner. Setting errorMessage here would cause a one-frame
                // red flash before the view model calls clearError().
                throw AuthServiceError.emailNotConfirmed(email: email)
            }
            errorMessage = error.localizedDescription
            throw error
        }
    }

    /// Detect whether a thrown auth error represents the `email_not_confirmed`
    /// branch from GoTrue. Tries the typed `AuthError.errorCode` first
    /// (supabase-swift 2.x exposes this directly), then falls back to a
    /// message match for safety if the server returns the code without a
    /// typed wrapper.
    private static func isEmailNotConfirmedError(_ error: any Error) -> Bool {
        if let authError = error as? AuthError,
           authError.errorCode == .emailNotConfirmed {
            return true
        }
        let description = error.localizedDescription.lowercased()
        return description.contains("email not confirmed")
            || description.contains("email_not_confirmed")
    }

    /// Sign in with Apple
    @MainActor
    public func signInWithApple(credential: ASAuthorizationAppleIDCredential) async throws {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        guard let identityToken = credential.identityToken,
              let tokenString = String(data: identityToken, encoding: .utf8) else {
            errorMessage = "Failed to get Apple ID token"
            throw NetworkError.unauthorized
        }

        do {
            let session = try await supabase.auth.signInWithIdToken(
                credentials: .init(
                    provider: .apple,
                    idToken: tokenString
                )
            )
            self.session = session
        } catch {
            errorMessage = error.localizedDescription
            throw error
        }
    }

    /// Sign in with Google via OAuth (opens ASWebAuthenticationSession)
    @MainActor
    public func signInWithGoogle() async throws {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            try await supabase.auth.signInWithOAuth(
                provider: .google,
                redirectTo: URL(string: "\(APIConfiguration.appURLScheme)://auth/callback")
            )
        } catch {
            errorMessage = error.localizedDescription
            throw error
        }
    }

    // MARK: - Sign Up

    /// Sign up with email and password
    @MainActor
    public func signUp(email: String, password: String, displayName: String?) async throws {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let session = try await supabase.auth.signUp(
                email: email,
                password: password,
                data: displayName.map { ["display_name": .string($0)] } ?? [:]
            )
            self.session = session.session
        } catch {
            errorMessage = error.localizedDescription
            throw error
        }
    }

    // MARK: - Sign Out

    /// Sign out current user
    @MainActor
    public func signOut() async throws {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            try await supabase.auth.signOut()
            session = nil
        } catch {
            errorMessage = error.localizedDescription
            throw error
        }
    }

    // MARK: - Email Verification

    /// Resend the signup confirmation email for an unverified account.
    ///
    /// GoTrue's resend endpoint always succeeds (whether or not the email
    /// exists in the system) to avoid leaking account-existence info — so
    /// the only failures surfaced here are transport or rate-limit errors
    /// from the SDK.
    @MainActor
    public func resendVerificationEmail(_ email: String) async throws {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            try await supabase.auth.resend(
                email: email,
                type: .signup,
                emailRedirectTo: URL(string: "\(APIConfiguration.appURLScheme)://auth/callback")
            )
        } catch {
            errorMessage = error.localizedDescription
            throw error
        }
    }

    // MARK: - Password Reset

    /// Send password reset email
    @MainActor
    public func resetPassword(email: String) async throws {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            try await supabase.auth.resetPasswordForEmail(email)
        } catch {
            errorMessage = error.localizedDescription
            throw error
        }
    }

    // MARK: - Magic Link

    /// Send magic link to email for passwordless login
    @MainActor
    public func sendMagicLink(email: String) async throws {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            try await supabase.auth.signInWithOTP(
                email: email,
                redirectTo: URL(string: "\(APIConfiguration.appURLScheme)://auth/callback")
            )
        } catch {
            errorMessage = error.localizedDescription
            throw error
        }
    }

    /// Verify a 6-digit OTP code that was emailed alongside the magic link.
    ///
    /// This is the explicit "Enter code instead" path: the user receives
    /// both a clickable link and a one-time code in the same email, and
    /// when the link can't be opened in-app (shared-email setups, broken
    /// universal-link handling, etc.) they can paste the code directly.
    ///
    /// On success the session is established via supabase-swift's
    /// `verifyOTP(email:token:type:)`, and the auth state listener in
    /// `startAuthStateListener` picks up the `signedIn` event — so this
    /// method does not need to mutate `session` itself.
    @MainActor
    public func verifyOtp(email: String, token: String) async throws {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            // `EmailOTPType.email` matches the supabase-js `type: 'email'`
            // used by the web portals' verify-otp flow — GoTrue accepts
            // this for codes issued by `signInWithOTP(email:)`.
            try await supabase.auth.verifyOTP(
                email: email,
                token: token,
                type: .email
            )
            // Session is set by the auth state change listener; nothing
            // else to do here.
        } catch {
            errorMessage = error.localizedDescription
            throw error
        }
    }

    /// Handle magic link URL callback. GoTrue's `/verify` endpoint
    /// redirects to `patina://auth/callback#access_token=…&refresh_token=…`
    /// (implicit-flow tokens in the URL fragment). The Supabase Swift SDK
    /// defaults to PKCE and `session(from:)` throws on implicit-flow URLs,
    /// so we parse the fragment ourselves and install the session via
    /// `setSession(accessToken:refreshToken:)`. If the URL is a PKCE
    /// callback (`?code=…`), fall back to the SDK's parser.
    @MainActor
    public func handleMagicLinkURL(_ url: URL) async throws {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        // Try implicit-flow first: tokens live in the URL fragment.
        if let fragment = url.fragment, !fragment.isEmpty {
            let params = parseURLFragment(fragment)
            if let accessToken = params["access_token"],
               let refreshToken = params["refresh_token"] {
                do {
                    let session = try await supabase.auth.setSession(
                        accessToken: accessToken,
                        refreshToken: refreshToken
                    )
                    self.session = session
                    return
                } catch {
                    errorMessage = error.localizedDescription
                    throw error
                }
            }
        }

        // PKCE / code-exchange flow — let the SDK handle it.
        do {
            let session = try await supabase.auth.session(from: url)
            self.session = session
        } catch {
            errorMessage = error.localizedDescription
            throw error
        }
    }

    /// Parse a URL fragment like `a=1&b=2` into a dictionary.
    private nonisolated func parseURLFragment(_ fragment: String) -> [String: String] {
        var out: [String: String] = [:]
        for pair in fragment.split(separator: "&") {
            let parts = pair.split(separator: "=", maxSplits: 1).map(String.init)
            guard parts.count == 2 else { continue }
            let key = parts[0].removingPercentEncoding ?? parts[0]
            let value = parts[1].removingPercentEncoding ?? parts[1]
            out[key] = value
        }
        return out
    }

    // MARK: - Session Management

    /// Refresh current session
    @MainActor
    public func refreshSession() async throws {
        guard let currentSession = session else { return }

        do {
            let newSession = try await supabase.auth.refreshSession()
            self.session = newSession
        } catch {
            // If refresh fails, user needs to re-authenticate
            session = nil
            throw error
        }
    }

    /// Get current session (checking validity)
    @MainActor
    public func getSession() async -> Session? {
        do {
            let session = try await supabase.auth.session
            self.session = session
            return session
        } catch {
            return nil
        }
    }
}

// MARK: - Errors

/// Errors surfaced by `AuthService` that need distinct UI handling.
///
/// Most failures from the underlying supabase-swift `AuthError` are routed
/// through `errorMessage` and re-thrown unchanged. This enum is reserved
/// for branches that the UI needs to recognise and recover from, like
/// `.emailNotConfirmed` (production requires email verification before
/// password sign-in).
public enum AuthServiceError: LocalizedError, Equatable {
    /// Sign-in failed because the account exists but the email has not
    /// been verified. Carries the email so the recovery panel can address
    /// the user and offer a resend action.
    case emailNotConfirmed(email: String)

    public var errorDescription: String? {
        switch self {
        case .emailNotConfirmed:
            return "Please verify your email address before signing in. Check your inbox for the verification link."
        }
    }
}
