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

    /// Transient label for the sign-in method most recently attempted. Set at
    /// the START of each explicit sign-in entry point (password / apple /
    /// google / magic-link / otp) and consumed — then cleared — by the
    /// `.signedIn` observer, so the `login` analytics event fires exactly
    /// once per fresh sign-in with an accurate per-method label, instead of
    /// once per capturing call site (which double-fired when a view-layer
    /// capture and the observer both ran).
    private var lastAttemptedSignInMethod: String?

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

                if let user = session?.user {
                    Self.settleLocalStore(for: user.id.uuidString)
                }

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
                        // Single source of truth for the `login` event: every
                        // sign-in entry point on this service stamps
                        // `lastAttemptedSignInMethod` at its start, so the label
                        // is accurate per method and fires exactly once.
                        PostHogService.shared.capture("login", properties: [
                            "method": lastAttemptedSignInMethod ?? "unknown"
                        ])
                        lastAttemptedSignInMethod = nil
                    }
                case .signedOut:
                    PatinaLog.auth.debug("User signed out")
                    PostHogService.shared.reset()
                    await ProfileService.shared.clear()
                    // Signing out is owed the gate again, not a silent slide
                    // into guest mode on the way back to `.auth`.
                    GuestSessionStore.shared.clear()
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

    // MARK: - Account isolation

    /// UserDefaults key holding the user id that currently owns the device-local
    /// SwiftData store.
    private static let localStoreOwnerKey = "local_store_owner_user_id"

    /// Enforce per-account isolation of the device-global local store. Wipe the
    /// previous owner's user-scoped data ONLY when a DIFFERENT real account has
    /// taken over; a fresh/guest owner (nil) claims the store WITHOUT wiping, so
    /// a guest who scanned a room keeps it after signing up. Same-user events
    /// (relaunch, token refresh) are a no-op. Never wiped on sign-out — the same
    /// user re-signing-in keeps their rooms (the app doesn't sync rooms back
    /// down, so a sign-out wipe would lose them).
    /// What a real session does to the device-local store, in order.
    ///
    /// Account isolation first: the store is device-global and unscoped, so a
    /// DIFFERENT real account signing in wipes the previous owner's
    /// rooms/scans/etc. A guest→account transition keeps the guest's work and
    /// asks whose it is (SP-06).
    ///
    /// Then the account's own rooms, which live on the server and which
    /// nothing read back until W4's fix round — a room typed on this phone and
    /// synced was gone after a sign-out and a sign-in, and a room made anywhere
    /// else never arrived. Debounced and owner-keyed inside the coordinator; it
    /// does nothing for a guest.
    ///
    /// While the claim sheet is up the hydrate waits: the person is being asked
    /// what to do with the guest's work, and hydrating underneath that question
    /// puts the account's own rooms inside the answer. `LocalStoreClaim` runs
    /// it when the sheet is answered, either way.
    @MainActor
    private static func settleLocalStore(for userId: String) {
        let claimPending = reconcileLocalStoreOwner(userId: userId)
        // W3 ruling 9: a real session ends the guest session. An
        // `.initialSession` carrying no user clears nothing — that is the cold
        // launch the persisted opt-in exists for.
        GuestSessionStore.shared.clear()
        guard !claimPending else { return }
        Task { @MainActor in
            await RoomSyncCoordinator.shared.reconcileSharedStore()
        }
    }

    /// Returns whether the claim sheet is now up, and therefore whether the
    /// store is still waiting on a decision.
    @MainActor
    private static func reconcileLocalStoreOwner(userId: String) -> Bool {
        let defaults = UserDefaults.standard
        let stored = defaults.string(forKey: localStoreOwnerKey)
        if shouldWipeLocalStore(previousOwner: stored, incomingUser: userId) {
            PatinaLog.auth.debug("[account-isolation] owner changed — wiping local store")
            LocalStoreReset.wipeUserScopedData()
        }
        // SP-06: a nil previous owner still claims the store, but the claim is
        // now the account's own decision rather than something that happens to
        // it — on a shared phone the silent version handed one person's room
        // and saves to a different person's account, and then counted them as
        // account data everywhere.
        let asking = LocalStoreClaim.shared.askIfNeeded(previousOwner: stored)
        if stored != userId {
            defaults.set(userId, forKey: localStoreOwnerKey)
        }
        return asking
    }

    /// Pure decision (unit-tested): wipe only when a DIFFERENT real account
    /// takes over. A nil previous owner (fresh install / guest that just scanned)
    /// claims the store WITHOUT wiping; the same account re-signing-in is a no-op.
    static func shouldWipeLocalStore(previousOwner: String?, incomingUser: String) -> Bool {
        guard let previousOwner else { return false }
        return previousOwner != incomingUser
    }

    // MARK: - Sign In Methods

    /// Sign in with email and password
    @MainActor
    public func signIn(email: String, password: String) async throws {
        lastAttemptedSignInMethod = "password"
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

    /// Sign in with Apple.
    ///
    /// `rawNonce` is the unhashed nonce whose SHA256 was set on the
    /// authorization request (see `AppleSignInNonce` / `PatinaSignInWithAppleButton`);
    /// GoTrue verifies it against the id_token's `nonce` claim. Passing it is
    /// what makes the id-token flow replay-resistant.
    @MainActor
    public func signInWithApple(
        credential: ASAuthorizationAppleIDCredential,
        rawNonce: String?
    ) async throws {
        lastAttemptedSignInMethod = "apple"
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
                    idToken: tokenString,
                    nonce: rawNonce
                )
            )
            self.session = session
            await captureAppleName(from: credential)
        } catch {
            errorMessage = error.localizedDescription
            throw error
        }
    }

    /// Apple sends the user's name ONLY on the very first authorization, so
    /// persist it as GoTrue user metadata now or lose it forever. Best-effort
    /// — a failure here must never fail the sign-in that already succeeded.
    @MainActor
    private func captureAppleName(from credential: ASAuthorizationAppleIDCredential) async {
        guard let fullName = credential.fullName else { return }
        let name = PersonNameComponentsFormatter().string(from: fullName)
        guard !name.isEmpty else { return }
        _ = try? await supabase.auth.update(
            user: UserAttributes(data: ["display_name": .string(name)])
        )
    }

    /// Sign in with Google via OAuth (opens ASWebAuthenticationSession)
    @MainActor
    public func signInWithGoogle() async throws {
        lastAttemptedSignInMethod = "google"
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            try await supabase.auth.signInWithOAuth(
                provider: .google,
                redirectTo: URL(string: "\(APIConfiguration.appURLScheme)://auth/callback")
            )
        } catch {
            // Backing out of the OAuth web sheet is a user cancellation, not an
            // error — mirror the Apple `.canceled` filter so the welcome
            // screen's error banner stays silent instead of showing a raw
            // "WebAuthenticationSession error 1" string.
            if (error as? ASWebAuthenticationSessionError)?.code != .canceledLogin {
                errorMessage = error.localizedDescription
            }
            throw error
        }
    }

    // MARK: - Sign Up

    /// Sign up with email and password.
    ///
    /// `role` metadata tags the account as a client so the `handle_new_user`
    /// trigger sets `profiles.role` correctly (otherwise it falls back to the
    /// legacy table default of `'designer'`).
    @MainActor
    public func signUp(email: String, password: String, displayName: String?) async throws {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            var metadata: [String: AnyJSON] = ["role": .string("homeowner")]
            if let displayName, !displayName.isEmpty {
                metadata["display_name"] = .string(displayName)
            }
            let response = try await supabase.auth.signUp(
                email: email,
                password: password,
                data: metadata
            )
            if let session = response.session {
                self.session = session
            } else {
                // Production has email confirmation on, so GoTrue returns a
                // user but NO session here. Surface the same case `signIn`
                // throws so the UI routes to the "check your inbox" recovery
                // panel instead of silently stranding the user with a spinner
                // that resolves to nothing.
                throw AuthServiceError.emailNotConfirmed(email: email)
            }
        } catch let error as AuthServiceError {
            // Already the typed "verify your email" case — don't wrap it in a
            // generic error banner (the view model routes it to the panel).
            throw error
        } catch {
            errorMessage = error.localizedDescription
            throw error
        }
    }

    /// Surface an error from an external sign-in surface (e.g. the Apple
    /// authorization callback) on the shared auth error banner. Used by the
    /// welcome screen, which otherwise has no way to report a pre-service
    /// failure. User-cancellation should NOT be reported here.
    @MainActor
    public func reportExternalError(_ message: String) {
        errorMessage = message
    }

    // MARK: - Sign Out

    /// Sign out current user
    @MainActor
    public func signOut() async throws {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        // Push: delete this device's token row BEFORE the session dies —
        // `device_push_tokens` RLS is owner-only (user_id = auth.uid()), so
        // the delete needs a live JWT. Best-effort: a failure here must
        // never block sign-out.
        await PushTokenService.shared.removeCurrentToken()

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

    /// Send a passwordless sign-in code (and matching magic link) to `email`.
    ///
    /// `shouldCreateUser: true` makes this a single unified sign-up + sign-in:
    /// an unknown email creates the account, a known one signs in — so there is
    /// no separate password "Create Account" path and no email-confirmation
    /// round-trip (entering the emailed code IS the confirmation). `role`
    /// metadata tags a newly-created account as a client for `handle_new_user`.
    @MainActor
    public func sendMagicLink(email: String) async throws {
        lastAttemptedSignInMethod = "magic-link"
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            try await supabase.auth.signInWithOTP(
                email: email,
                redirectTo: URL(string: "\(APIConfiguration.appURLScheme)://auth/callback"),
                shouldCreateUser: true,
                data: ["role": .string("homeowner")]
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
        lastAttemptedSignInMethod = "otp"
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
        // Stamped here as well as in sendMagicLink: the link is often opened
        // after an app relaunch, which loses the transient send-time stamp.
        lastAttemptedSignInMethod = "magic-link"
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
