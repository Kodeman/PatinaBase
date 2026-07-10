//  SupabaseSessionService.swift
//  Capture
//
//  The real `SessionProviding`: a single supabase-swift client, cold-launch
//  session restore, auth-state observation, profile + roles hydration, and the
//  active-workspace (== organizations.id) resolution/persistence. Feature teams
//  never see any of this — they import CaptureKit and code against
//  `SessionProviding`; the app injects this in real mode.
//
//  Mirrors the existing Patina app's AuthService/ProfileService: fan-out
//  `waitForReady()` continuations, event-agnostic hydration, and the
//  `user_roles → roles.domain` join.

import Foundation
import os
import CaptureKit
import Supabase

/// A workspace the signed-in user can save captures into (== organizations.id).
struct CaptureWorkspace: Identifiable, Hashable, Sendable {
    let id: String
    let name: String
}

/// Failure modes unique to the portal-token exchange.
enum PortalTokenError: Error {
    /// `verifyOTP(tokenHash:)` returned no session (should not happen for a
    /// valid, unconsumed magic-link hash — treated as a sign-in failure).
    case noSession
}

@Observable
@MainActor
final class SupabaseSessionService: SessionProviding {
    @ObservationIgnored private let client: SupabaseClient
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let analytics: any CaptureAnalytics
    @ObservationIgnored private let log = Logger(subsystem: "cloud.patina.field", category: "session")

    // MARK: State (observed — drives SessionProviding + the T2 account screen)

    private var session: Session?
    /// All organizations the user belongs to (populated after hydration).
    private(set) var workspaces: [CaptureWorkspace] = []
    /// Domain roles (e.g. ["designer"]) — informational only, no hard gate.
    private(set) var roles: [String] = []

    private var activeWorkspaceID: String?
    private var activeWorkspaceName: String?
    private var profileDisplayName: String?

    // MARK: Plumbing (not observed)

    @ObservationIgnored private var isReady = false
    @ObservationIgnored private var readyContinuations: [CheckedContinuation<Void, Never>] = []
    @ObservationIgnored private var authStateTask: Task<Void, Never>?
    /// Coalesces concurrent hydration (auth-stream event + explicit sign-in) so
    /// an explicit sign-in and the listener share one fetch and never race.
    @ObservationIgnored private var hydrationTask: Task<Void, Never>?
    /// Monotonic token identifying the current hydration pass. `Task` is a value
    /// type (no `===` identity), so this stands in for it: a finishing pass only
    /// clears the latch if it still owns this generation.
    @ObservationIgnored private var hydrationGeneration = 0
    /// The user id the last *good* hydration pass landed. Makes `isHydrated`
    /// identity-aware so an account switch within a live app run (a portal-QR
    /// sign-in over an existing session) re-hydrates instead of keeping the
    /// previous account's profile/workspaces latched.
    @ObservationIgnored private var hydratedUserID: String?

    private enum Keys {
        static let activeWorkspaceID = "session.activeWorkspaceID"
        static let activeWorkspaceName = "session.activeWorkspaceName"
    }

    // MARK: Init

    init(client: SupabaseClient = SupabaseClientProvider.makeClient(),
         analytics: any CaptureAnalytics,
         defaults: UserDefaults = UserDefaults(suiteName: AppConfiguration.appGroupID) ?? .standard) {
        self.client = client
        self.analytics = analytics
        self.defaults = defaults
        // Show the last-known workspace immediately (survives offline / pre-fetch).
        self.activeWorkspaceID = defaults.string(forKey: Keys.activeWorkspaceID)
        self.activeWorkspaceName = defaults.string(forKey: Keys.activeWorkspaceName)
        startAuthListener()
    }

    deinit { authStateTask?.cancel() }

    // MARK: SessionProviding

    var isAuthenticated: Bool { session != nil }
    var userID: String? { session?.user.id.uuidString }
    var userEmail: String? { session?.user.email }
    var displayName: String? { profileDisplayName }
    var workspaceID: String? { activeWorkspaceID }
    var workspaceName: String? { activeWorkspaceName }

    func waitForReady() async {
        if isReady { return }
        await withCheckedContinuation { continuation in
            readyContinuations.append(continuation)
        }
    }

    func selectWorkspace(id: String) {
        activeWorkspaceID = id
        if let match = workspaces.first(where: { $0.id == id }) {
            activeWorkspaceName = match.name
        }
        persistActiveWorkspace()
    }

    func signOut() async {
        do {
            try await client.auth.signOut()
        } catch {
            log.error("signOut failed: \(error.localizedDescription, privacy: .public)")
        }
        clearLocalState()
    }

    // MARK: Sign-in (Apple + email one-time-code)

    /// Sign in with Apple. `idToken` / `rawNonce` come from a native
    /// `ASAuthorizationController` credential (no browser redirect). GoTrue
    /// verifies the Apple ID token via `signInWithIdToken`, re-hashing `rawNonce`
    /// against the token's `nonce` claim. Awaits hydration so the caller sees
    /// fresh `workspaces`. Throws on auth failure.
    func signInWithApple(idToken: String, rawNonce: String) async throws {
        analytics.event("account.sign_in.started", ["method": "apple"])
        do {
            let session = try await client.auth.signInWithIdToken(
                credentials: .init(provider: .apple, idToken: idToken, nonce: rawNonce)
            )
            self.session = session
            await hydrateAfterSignIn(user: session.user)
            analytics.event("account.sign_in.succeeded", ["method": "apple"])
        } catch {
            analytics.event("account.sign_in.failed",
                            ["method": "apple", "reason": Self.shortErrorLabel(error)])
            throw error
        }
    }

    /// Email one-time-code, step 1: mail a 6-digit code to `email`.
    ///
    /// `shouldCreateUser: false` is deliberate — Patina Field is invite-only for
    /// designers/trades, who are provisioned (auth user + organization membership)
    /// through the portal. The app must never mint a brand-new auth user, so an
    /// unknown address is rejected by GoTrue rather than silently onboarded.
    /// (This is the one behavioural difference from the Patina client app, whose
    /// `sendMagicLink` leaves `shouldCreateUser` at its `true` default.) No
    /// `redirectTo` is passed: the code is entered natively, never a link tap.
    func sendEmailCode(to email: String) async throws {
        // The email-OTP sign-in spans two methods, so the analytics trio is
        // split across them: `started` fires here (the user's attempt begins
        // with the code request), `failed` can fire at either step, and
        // `succeeded` fires in verifyEmailCode once a session lands. Wrapping
        // each method in its own full trio would double-count starts and
        // emit a bogus "succeeded" for merely mailing a code.
        analytics.event("account.sign_in.started", ["method": "email-otp"])
        do {
            try await client.auth.signInWithOTP(email: email, shouldCreateUser: false)
        } catch {
            analytics.event("account.sign_in.failed",
                            ["method": "email-otp", "reason": Self.shortErrorLabel(error)])
            throw error
        }
    }

    /// Email one-time-code, step 2: verify the 6-digit `code`. `EmailOTPType.email`
    /// matches the code issued by `signInWithOTP(email:)`. Awaits hydration so the
    /// caller sees fresh `workspaces`. Throws on a wrong/expired code.
    func verifyEmailCode(email: String, code: String) async throws {
        do {
            let response = try await client.auth.verifyOTP(email: email, token: code, type: .email)
            guard let session = response.session else {
                analytics.event("account.sign_in.failed",
                                ["method": "email-otp", "reason": "NoSessionInResponse"])
                return
            }
            self.session = session
            await hydrateAfterSignIn(user: session.user)
            analytics.event("account.sign_in.succeeded", ["method": "email-otp"])
        } catch {
            analytics.event("account.sign_in.failed",
                            ["method": "email-otp", "reason": Self.shortErrorLabel(error)])
            throw error
        }
    }

    /// A short, PII-free label for a sign-in failure — the error's Swift
    /// type name (e.g. "AuthError", "URLError", "CancellationError"), not
    /// the localized description, so a dashboard can bucket failure modes
    /// without risking a leaked token/email in event properties.
    private static func shortErrorLabel(_ error: any Error) -> String {
        String(describing: type(of: error))
    }

    /// Portal QR sign-in: exchange a GoTrue magic-link **hashed** token for a
    /// session. The signed-in portal shows `field://login?v=1&th=<token_hash>`;
    /// Field verifies the hash here — no email round-trip, no code entry, the
    /// hash *is* the proof. `EmailOTPType.magiclink` matches the
    /// `generate_link(type:"magiclink")` the portal calls to mint `th`
    /// (empirically the local GoTrue also accepts `.email` for the same hash, so
    /// `.magiclink` is the explicit, contract-aligned choice). Awaits hydration
    /// so the caller sees fresh `workspaces`. Throws on a wrong/expired/consumed
    /// token (magic-link tokens are single-use).
    func signInWithPortalToken(tokenHash: String) async throws {
        let response = try await client.auth.verifyOTP(tokenHash: tokenHash, type: .magiclink)
        guard let session = response.session else { throw PortalTokenError.noSession }
        self.session = session
        await hydrateAfterSignIn(user: session.user)
    }

    /// Hydrate right after a *fresh* sign-in, tolerating the token-propagation
    /// race. The first PostgREST fetch can outrun the SDK committing the new
    /// session to its auth context, so RLS sees no `auth.uid()` and the
    /// profile/workspace queries come back empty (no error, just zero rows). The
    /// `isHydrated` gate leaves the latch open on such an empty pass, so we retry
    /// with a short backoff until it resolves — the same recovery the next auth
    /// event would trigger, done proactively so the caller sees real `workspaces`.
    /// Bounded: a genuinely org-less account simply exhausts the attempts and
    /// falls through to O2's "no workspace" state.
    private func hydrateAfterSignIn(user: User, attempts: Int = 4) async {
        for attempt in 0..<attempts {
            await hydrate(user: user)
            if isHydrated { return }
            if attempt < attempts - 1 { try? await Task.sleep(for: .milliseconds(250)) }
        }
    }

    // MARK: Auth-state observation

    private func startAuthListener() {
        authStateTask = Task { @MainActor in
            for await (event, session) in client.auth.authStateChanges {
                self.session = session
                self.markReadyIfNeeded()

                switch event {
                case .signedOut:
                    self.clearLocalState()
                case .initialSession, .signedIn, .tokenRefreshed, .userUpdated:
                    if let user = session?.user {
                        await self.hydrate(user: user)
                    }
                case .passwordRecovery:
                    break
                @unknown default:
                    break
                }
            }
        }
    }

    private func markReadyIfNeeded() {
        guard !isReady else { return }
        isReady = true
        let waiting = readyContinuations
        readyContinuations.removeAll()
        for continuation in waiting { continuation.resume() }
    }

    // MARK: Hydration

    private func hydrate(user: User) async {
        // Share one in-flight fetch across concurrent callers (an auth-stream
        // event and an explicit sign-in can land together) so they never race.
        if let task = hydrationTask {
            await task.value
            return
        }
        // Event-driven retry: skip re-fetching only when the last pass actually
        // landed a profile + workspaces. A failed or empty pass — offline cold
        // launch, or the SDK's auth context lagging the event by a tick — must
        // re-hydrate on the *next* auth event (.tokenRefreshed/.signedIn/…).
        // There is no polling loop; the retry is bounded by the event stream.
        if isHydrated { return }
        hydrationGeneration += 1
        let generation = hydrationGeneration
        let task = Task { @MainActor in
            await self.performHydration(userID: user.id.uuidString)
        }
        hydrationTask = task
        await task.value
        // Clear the latch so a later event can retry when this pass came back
        // empty; a successful pass is instead gated out above by `isHydrated`.
        // Only clear OUR slot: a signOut (which nils the latch) or a successor
        // hydration pass that bumped the generation must not be clobbered by this
        // task finishing late.
        if hydrationGeneration == generation { hydrationTask = nil }
    }

    /// The user id the current session is authenticated for, or nil once signed
    /// out. Used to bail an in-flight hydration whose session changed mid-fetch.
    private var currentSessionUserID: String? { session?.user.id.uuidString }

    /// A hydration pass is "good" once it has a profile and at least one
    /// workspace *for the currently-authenticated user*. Mirrors the reference
    /// app re-gating on emptiness so failed fetches retry instead of latching an
    /// empty session for the whole run; the `hydratedUserID` clause additionally
    /// forces a re-fetch when the account changes mid-run (portal-QR switch).
    private var isHydrated: Bool {
        profileDisplayName != nil && !workspaces.isEmpty && hydratedUserID == currentSessionUserID
    }

    private func performHydration(userID: String) async {
        // After EACH await, re-check that the session still belongs to the user
        // this pass started for before writing any state. Otherwise a signOut (or
        // a different account signing in) that lands while a fetch is in flight
        // would let this task's post-await writes repopulate identity/workspace
        // state for the wrong user — and, via the `isHydrated` gate, make the new
        // account skip hydration and even re-persist the old org id. Bail silently.
        let name = await fetchDisplayName(userID: userID)
        guard currentSessionUserID == userID else { return }
        profileDisplayName = name

        let fetchedRoles = await fetchRoles(userID: userID)
        guard currentSessionUserID == userID else { return }
        roles = fetchedRoles

        let fetchedWorkspaces = await fetchWorkspaces(userID: userID)
        guard currentSessionUserID == userID else { return }
        workspaces = fetchedWorkspaces

        resolveActiveWorkspace()
        // Mark this user as the hydrated identity. On an empty pass `isHydrated`
        // still reads false (no name / no workspaces), so the retry continues;
        // on a good pass it now also proves *this* account is the one loaded.
        hydratedUserID = userID
    }

    private func fetchDisplayName(userID: String) async -> String? {
        do {
            let row: ProfileRow = try await client
                .from("profiles")
                .select("display_name, full_name")
                .eq("id", value: userID)
                .single()
                .execute()
                .value
            return row.displayName ?? row.fullName
        } catch {
            log.error("profile fetch failed: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    private func fetchRoles(userID: String) async -> [String] {
        do {
            let joins: [RoleJoin] = try await client
                .from("user_roles")
                .select("roles(domain)")
                .eq("user_id", value: userID)
                .execute()
                .value
            return joins.map { $0.roles.domain }
        } catch {
            log.error("roles fetch failed: \(error.localizedDescription, privacy: .public)")
            return []
        }
    }

    private func fetchWorkspaces(userID: String) async -> [CaptureWorkspace] {
        do {
            let joins: [OrgJoin] = try await client
                .from("organization_members")
                .select("organizations(id, name)")
                .eq("user_id", value: userID)
                .execute()
                .value
            return joins.map { CaptureWorkspace(id: $0.organizations.id, name: $0.organizations.name) }
        } catch {
            log.error("workspaces fetch failed: \(error.localizedDescription, privacy: .public)")
            return []
        }
    }

    // MARK: Active-workspace resolution / persistence

    private func resolveActiveWorkspace() {
        let savedID = defaults.string(forKey: Keys.activeWorkspaceID)
        if let match = workspaces.first(where: { $0.id == savedID }) {
            activeWorkspaceID = match.id
            activeWorkspaceName = match.name
        } else if workspaces.count == 1 {
            // Default to the single org.
            activeWorkspaceID = workspaces[0].id
            activeWorkspaceName = workspaces[0].name
            persistActiveWorkspace()
        } else if savedID == nil {
            // Multi-org (or zero) with no prior choice → wait for O2 selection.
            activeWorkspaceID = nil
            activeWorkspaceName = nil
        }
        // else: keep the persisted selection restored in init (e.g. offline fetch).
    }

    private func persistActiveWorkspace() {
        if let id = activeWorkspaceID {
            defaults.set(id, forKey: Keys.activeWorkspaceID)
        } else {
            defaults.removeObject(forKey: Keys.activeWorkspaceID)
        }
        if let name = activeWorkspaceName {
            defaults.set(name, forKey: Keys.activeWorkspaceName)
        } else {
            defaults.removeObject(forKey: Keys.activeWorkspaceName)
        }
    }

    private func clearLocalState() {
        session = nil
        workspaces = []
        roles = []
        activeWorkspaceID = nil
        activeWorkspaceName = nil
        profileDisplayName = nil
        hydrationTask = nil
        hydratedUserID = nil
        defaults.removeObject(forKey: Keys.activeWorkspaceID)
        defaults.removeObject(forKey: Keys.activeWorkspaceName)
    }
}

// MARK: - PostgREST row models

/// `profiles` row (display name), mirroring ProfileService.
private struct ProfileRow: Decodable {
    let displayName: String?
    let fullName: String?

    enum CodingKeys: String, CodingKey {
        case displayName = "display_name"
        case fullName = "full_name"
    }
}

/// `user_roles` → `roles.domain` join, mirroring ProfileService.
private struct RoleJoin: Decodable {
    let roles: RoleRow
}
private struct RoleRow: Decodable {
    let domain: String
}

/// `organization_members` → `organizations(id, name)` join.
private struct OrgJoin: Decodable {
    let organizations: OrgRow
}
private struct OrgRow: Decodable {
    let id: String
    let name: String
}
