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

    /// Where the last error was raised (P-29).
    ///
    /// The Welcome root and the sign-in sheets share one `errorMessage`, so
    /// "Invalid login credentials" typed into the password SHEET rendered on
    /// the auth ROOT after Cancel, pushed the button stack down 33 pt, and the
    /// mis-tap at the remembered position dropped the tester into a guest flow
    /// they could not get out of. The root now reads `rootErrorMessage`, which
    /// is nil for anything a sheet raised.
    public private(set) var errorScope: AuthErrorScope = .root

    /// The message the Welcome root may render: only what the root itself
    /// raised (the Apple / Google paths and `reportExternalError`).
    public var rootErrorMessage: String? {
        errorScope == .root ? errorMessage : nil
    }

    /// The mirror of `rootErrorMessage`: what a presented sheet may render.
    /// Without it a root-scoped failure — an Apple exchange raised behind the
    /// sheet — painted the sheet's own status region, which is the same leak
    /// P-29 closed, pointing the other way.
    public var sheetErrorMessage: String? {
        errorScope == .sheet ? errorMessage : nil
    }

    /// Clear any existing error message.
    ///
    /// The scope goes back with it. Leaving a stale `.sheet` behind a nil
    /// message meant the next reader of `errorScope` was answering about an
    /// error that no longer existed.
    public func clearError() {
        errorMessage = nil
        errorScope = .root
    }

    /// Record an error against the surface that raised it. Not `private`:
    /// `AuthErrorRoutingTests` drives it, because a test that compares two
    /// enum cases to each other has not exercised the routing at all.
    @MainActor
    func setError(_ message: String?, scope: AuthErrorScope) {
        errorScope = scope
        errorMessage = message
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

    /// A3-16 / D7 — the test-account-login fallback, injectable for tests.
    var testAccountLogin: TestAccountLoginFallback = .live

    /// B-21 — onboarding is a fact about the account, resolved once per
    /// sign-in. Injectable for tests.
    var onboardingCompletion: OnboardingCompletion = .shared

    /// The account `onboardingCompletion` has already been resolved for this
    /// launch. See the call site for why `accountChanged` cannot do this job.
    private var onboardingResolvedForUserId: String?

    /// The account the in-memory singletons currently hold data for. Compared
    /// against every auth-state event so a token refresh — which yields the
    /// same user several times a session — costs nothing, and a real change of
    /// account costs exactly one reset.
    private var settledUserId: String?

    // MARK: - Initialization

    private init() {
        startAuthStateListener()
    }

    // MARK: - Auth State Listener

    /// The one place `session` moves.
    ///
    /// Nine call sites install a session on this service, and eight of them run
    /// BEFORE GoTrue delivers the matching `.signedIn` on `authStateChanges` —
    /// the password grant, the Apple/Google id-token exchange, OTP verify, the
    /// QR `setSession`, the `patina://auth/callback` deep link, the refresh and
    /// `getSession`. With the reset wired only into the listener, each of those
    /// opened a window where `currentUserId` answered the NEW account on the
    /// main actor while every `SessionScope` participant still held the
    /// previous one's rows. Narrower than W5's walk failure — a task hop, and
    /// RLS still refuses the write — but the same shape. Routing every site
    /// through here closes it by construction rather than by remembering.
    ///
    /// - Returns: whether this was a real change of account.
    @MainActor
    @discardableResult
    private func applySession(_ session: Session?) -> Bool {
        let incomingUserId = session?.user.id.uuidString
        let accountChanged = Self.isAccountChange(
            previous: settledUserId, incoming: incomingUserId
        )
        self.session = session
        if accountChanged {
            settledUserId = incomingUserId
            SessionScope.reset()
        }
        return accountChanged
    }

    /// Install a session, with `B-21` resolved FIRST.
    ///
    /// `applySession` publishing `session` is what wakes the phase observer,
    /// and `derivePhase` reads `AppSettings.hasCompletedOnboarding` the moment
    /// it does. Resolving from the auth-state listener instead put the resolve
    /// ~130 ms late: signing in as an account that has already onboarded
    /// logged `phase auth → onboarding (onboarded=false)` and then
    /// `phase onboarding → main (onboarded=true)`, and `ContentView` animates
    /// phase changes over 0.5 s — so it was a visible cross-fade through the
    /// intro carousel, not a dropped frame.
    ///
    /// The resolve costs nothing on the repeat path (`hasCompletedOnboarding`
    /// already true, or the account already recorded on this device); only a
    /// genuinely unknown account pays the budgeted server read, which is
    /// exactly the case `B-21` is about. `nil` sessions do not come through
    /// here — there is nothing to resolve for a sign-out.
    @MainActor
    @discardableResult
    private func establishSession(_ session: Session) async -> Bool {
        let userId = session.user.id.uuidString
        // Stamped before the await so a second install landing during the read
        // cannot double-run it.
        if onboardingResolvedForUserId != userId {
            onboardingResolvedForUserId = userId
            await onboardingCompletion.resolve(userId: userId)
        }
        return applySession(session)
    }

    /// Mark auth state as ready after the first event and fan out to every
    /// awaiting caller. Its own function so the listener stays under the
    /// branch budget `cyclomatic_complexity` sets.
    private func markAuthStateReady() {
        guard !isAuthStateReady else { return }
        isAuthStateReady = true
        let waiting = authReadyContinuations
        authReadyContinuations.removeAll()
        for continuation in waiting {
            continuation.resume()
        }
    }

    private func startAuthStateListener() {
        authStateTask = Task { @MainActor in
            for await (event, session) in supabase.auth.authStateChanges {
                let incomingUserId = session?.user.id.uuidString
                // Before anything below fetches for the new account: the
                // hydration a few lines down, and `settleLocalStore`'s room
                // reconcile, both read singletons that are still holding the
                // previous account's rows until the reset inside this runs.
                //
                // B-21's resolve is inside `establishSession`, not here: it has
                // to precede the assignment that wakes the phase observer, and
                // the observer wakes on `applySession`, wherever it is called
                // from. Its own watermark means the six call sites that install
                // a session BEFORE GoTrue emits the matching event have already
                // paid for it by the time this arrives.
                let accountChanged: Bool
                if let session {
                    accountChanged = await self.establishSession(session)
                } else {
                    accountChanged = self.applySession(nil)
                    // Signed out: the next sign-in resolves again.
                    onboardingResolvedForUserId = nil
                }

                if let user = session?.user {
                    Self.settleLocalStore(for: user.id.uuidString)
                }

                self.markAuthStateReady()

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

                // And after: the two services nothing else will ask for.
                if accountChanged, incomingUserId != nil {
                    SessionScope.refresh()
                }
            }
        }
    }

    /// Whether this auth-state event is a different account from the one the
    /// in-memory singletons hold. Pure, so the seam is a testable fact rather
    /// than something only a live GoTrue stream can exercise.
    ///
    /// A sign-out (`user → nil`) counts: it is the first half of the switch the
    /// W5 walk failed on, and leaving one account's rows standing on the auth
    /// wall is how they were still there when the next account arrived.
    static func isAccountChange(previous: String?, incoming: String?) -> Bool {
        previous != incoming
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
            await establishSession(session)
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
            setError(error.localizedDescription, scope: .sheet)
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
        rawNonce: String?,
        scope: AuthErrorScope = .root
    ) async throws {
        lastAttemptedSignInMethod = "apple"
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        guard let identityToken = credential.identityToken,
              let tokenString = String(data: identityToken, encoding: .utf8) else {
            setError("Failed to get Apple ID token", scope: scope)
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
            await establishSession(session)
            await captureAppleName(from: credential)
            // B2 v3(c) / A3-07 — see `applyHomeownerRoleAfterOAuth`.
            await applyHomeownerRoleAfterOAuth(session: session)
        } catch {
            setError(error.localizedDescription, scope: scope)
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

    /// A3-07 / ruling B2 v3(c) — relabel this account's own profile row
    /// `role = 'homeowner'` after an OAuth sign-in.
    ///
    /// `handle_new_user` (00313) honours exactly one client-supplied role
    /// string, the literal `'homeowner'` in `raw_user_meta_data.role`, and
    /// otherwise falls to the 00013 default, `'designer'`. The email and OTP
    /// paths send the hint; `signInWithIdToken` and `signInWithOAuth` take no
    /// `data:` parameter, so an Apple tester was created labelled `designer`
    /// and nothing corrected it. B2 v3 kept the trigger at 00313 verbatim —
    /// which button somebody tapped is not which kind of account they are —
    /// and moved the correction to the two callers that know the answer. This
    /// app is one of them.
    ///
    /// The own-row UPDATE policy (00555 §a2(i-a)) is a one-way ratchet:
    /// `role` may become `'homeowner'` and `is_designer` may become `false`,
    /// never the reverse. So:
    ///
    /// * scoped to `id = self`, from the session this sign-in just returned;
    /// * `role` only — one key in the body. `is_designer` is already false for
    ///   a fresh sign-up, and writing it would make a label write look like an
    ///   authority write;
    /// * idempotent, and run after EVERY Apple/Google sign-in, because the app
    ///   cannot tell a first sign-in from a returning one and a returning user
    ///   whose relabel failed must still get it;
    /// * once per sign-in, here — not in a view's `onAppear`, not in a retry;
    /// * never fatal. The person is signed in; a wrong label is cosmetic (it
    ///   changes the word `comms_resolve_role` renders beside their name) and
    ///   the next sign-in retries it. A sign-in that failed because a cosmetic
    ///   PATCH 4xx'd would be the worse bug.
    ///
    /// Deliberately NOT on the email/OTP paths: they already send the hint and
    /// the trigger honours it. A second write there would make the app look
    /// like it writes its own role unconditionally.
    @MainActor
    private func applyHomeownerRoleAfterOAuth(session: Session) async {
        do {
            try await supabase.database
                .from("profiles")
                .update(["role": "homeowner"])
                .eq("id", value: session.user.id)
                .execute()
        } catch {
            PatinaLog.auth.debug(
                "AuthService: homeowner relabel deferred — \(error.localizedDescription)"
            )
        }
    }

    /// Sign in with Google via OAuth (opens ASWebAuthenticationSession)
    @MainActor
    public func signInWithGoogle() async throws {
        lastAttemptedSignInMethod = "google"
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let session = try await supabase.auth.signInWithOAuth(
                provider: .google,
                redirectTo: URL(string: "\(APIConfiguration.appURLScheme)://auth/callback")
            )
            // B2 v3(c) / A3-07 — see `applyHomeownerRoleAfterOAuth`.
            await applyHomeownerRoleAfterOAuth(session: session)
        } catch {
            // Backing out of the OAuth web sheet is a user cancellation, not an
            // error — mirror the Apple `.canceled` filter so the welcome
            // screen's error banner stays silent instead of showing a raw
            // "WebAuthenticationSession error 1" string.
            if (error as? ASWebAuthenticationSessionError)?.code != .canceledLogin {
                setError(error.localizedDescription, scope: .root)
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
                await establishSession(session)
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
            setError(error.localizedDescription, scope: .sheet)
            throw error
        }
    }

    /// Surface an error from an external sign-in surface (e.g. the Apple
    /// authorization callback) on the shared auth error banner. Used by the
    /// welcome screen, which otherwise has no way to report a pre-service
    /// failure. User-cancellation should NOT be reported here.
    /// `scope` names the surface the button lives on. The Apple button exists
    /// on the Welcome root AND inside the sign-in sheet; a failure belongs to
    /// whichever one the reader is looking at.
    @MainActor
    public func reportExternalError(_ message: String, scope: AuthErrorScope = .root) {
        setError(message, scope: scope)
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
            applySession(nil)
        } catch {
            // Root scope: a failed sign-out leaves the reader looking at the
            // Welcome screen, which is where this has to be readable.
            setError(error.localizedDescription, scope: .root)
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
            setError(error.localizedDescription, scope: .sheet)
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
            setError(error.localizedDescription, scope: .sheet)
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
            setError(error.localizedDescription, scope: .sheet)
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
            let response = try await supabase.auth.verifyOTP(
                email: email,
                token: token,
                type: .email
            )
            // A3-16: GoTrue can resolve WITHOUT a session for a spent or
            // expired code. The portal treats that as a miss too.
            if response.session == nil,
               await testAccountLogin.attempt(email: email, code: token) {
                return
            }
            // Session is set by the auth state change listener; nothing
            // else to do here.
        } catch {
            // A3-16 / ruling D7 — the advertised tester credential. Tried
            // ONLY from here, after the ordinary path has already failed, so
            // it can never intercept a real sign-in. Fails closed: anything
            // other than a redeemed session falls through to the error below.
            if await testAccountLogin.attempt(email: email, code: token) {
                return
            }
            setError(error.localizedDescription, scope: .sheet)
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
                    await establishSession(session)
                    return
                } catch {
                    // Root scope: the emailed link is opened against the auth
                    // root, often on a cold launch with no sheet in sight.
                    setError(error.localizedDescription, scope: .root)
                    throw error
                }
            }
        }

        // PKCE / code-exchange flow — let the SDK handle it.
        do {
            let session = try await supabase.auth.session(from: url)
            await establishSession(session)
        } catch {
            setError(error.localizedDescription, scope: .root)
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
            await establishSession(newSession)
        } catch {
            // If refresh fails, user needs to re-authenticate
            applySession(nil)
            throw error
        }
    }

    /// Get current session (checking validity)
    @MainActor
    public func getSession() async -> Session? {
        do {
            let session = try await supabase.auth.session
            await establishSession(session)
            return session
        } catch {
            return nil
        }
    }
}

// MARK: - Errors

/// Which auth surface raised the current error (P-29).
///
/// The Welcome root and the sign-in sheets share one `AuthService`, and one
/// `errorMessage` with them. Without this, "Invalid login credentials" typed
/// into the password sheet survived its Cancel and rendered on the root.
public enum AuthErrorScope: Sendable, Equatable {
    /// Raised by the Welcome screen itself — the Apple and Google paths.
    case root
    /// Raised inside a presented sheet. Never rendered on the root.
    case sheet
}

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
