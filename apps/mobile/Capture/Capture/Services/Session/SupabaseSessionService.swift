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
    private(set) var ownerState: CaptureSessionOwnerState = .loading
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
        static let legacyActiveWorkspaceID = "session.activeWorkspaceID"
        static let legacyActiveWorkspaceName = "session.activeWorkspaceName"

        static func activeWorkspaceID(userID: String) -> String {
            "session.activeWorkspaceID.\(normalized(userID))"
        }

        static func activeWorkspaceName(userID: String) -> String {
            "session.activeWorkspaceName.\(normalized(userID))"
        }

        private static func normalized(_ userID: String) -> String {
            userID.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        }
    }

    // MARK: Init

    init(client: SupabaseClient = SupabaseClientProvider.makeClient(),
         analytics: any CaptureAnalytics,
         defaults: UserDefaults = UserDefaults(suiteName: AppConfiguration.appGroupID) ?? .standard) {
        self.client = client
        self.analytics = analytics
        self.defaults = defaults
        // Never restore the legacy global workspace before the authenticated user
        // and membership list have been hydrated. Per-user choices are read only
        // after their current membership has been validated.
        defaults.removeObject(forKey: Keys.legacyActiveWorkspaceID)
        defaults.removeObject(forKey: Keys.legacyActiveWorkspaceName)
        startAuthListener()
    }

    deinit { authStateTask?.cancel() }

    // MARK: SessionProviding

    var isAuthenticated: Bool { session != nil }
    var userID: String? {
        switch ownerState {
        case .ready(let owner): return owner.userID
        case .needsWorkspace(let userID): return userID
        case .loading, .signedOut: return nil
        }
    }
    var userEmail: String? { session?.user.email }
    var displayName: String? { profileDisplayName }
    var workspaceID: String? { ownerState.owner?.workspaceID }
    var workspaceName: String? { ownerState.owner == nil ? nil : activeWorkspaceName }

    func waitForReady() async {
        if isReady { return }
        await withCheckedContinuation { continuation in
            readyContinuations.append(continuation)
        }
    }

    func selectWorkspace(id: String) {
        guard let currentUserID = currentSessionUserID,
              hydratedUserID == currentUserID,
              let workspace = workspaces.first(where: {
                  $0.id.caseInsensitiveCompare(id) == .orderedSame
              }),
              let owner = CaptureOwnerIdentity(
                  userID: currentUserID,
                  workspaceID: workspace.id
              ) else { return }

        if ownerState.owner != owner {
            CaptureSessionContextStore.shared.reset()
        }
        activeWorkspaceID = workspace.id
        activeWorkspaceName = workspace.name
        persistActiveWorkspace(for: currentUserID)
        ownerState = .ready(owner)
    }

    func signOut() async {
        // Revoke the local owner projection before any network hop so offline or
        // slow sign-out cannot leave the previous account's UI/data visible.
        CaptureSessionContextStore.shared.reset()
        clearLocalState()
        do {
            try await client.auth.signOut()
        } catch {
            log.error("signOut failed: \(error.localizedDescription, privacy: .public)")
        }
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
            acceptSession(session)
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
            acceptSession(session)
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
        acceptSession(session)
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

    private func acceptSession(_ newSession: Session?) {
        let previousUserID = currentSessionUserID
        let incomingUserID = newSession?.user.id.uuidString
        session = newSession
        guard previousUserID != incomingUserID else { return }
        invalidateOwnerReadiness(for: incomingUserID)
    }

    private func invalidateOwnerReadiness(for userID: String?) {
        ownerState = userID == nil ? .signedOut : .loading
        hydrationGeneration += 1
        hydrationTask?.cancel()
        hydrationTask = nil
        hydratedUserID = nil
        workspaces = []
        roles = []
        activeWorkspaceID = nil
        activeWorkspaceName = nil
        profileDisplayName = nil
        CaptureSessionContextStore.shared.reset()
    }

    private func startAuthListener() {
        authStateTask = Task { @MainActor in
            for await (event, incomingSession) in client.auth.authStateChanges {
                switch event {
                case .signedOut, .userDeleted:
                    self.acceptSession(nil)
                    self.clearLocalState()
                    self.markReadyIfNeeded()

                case .initialSession, .signedIn, .tokenRefreshed, .userUpdated,
                     .passwordRecovery, .mfaChallengeVerified:
                    self.acceptSession(incomingSession)
                    guard let user = incomingSession?.user else {
                        self.clearLocalState()
                        self.markReadyIfNeeded()
                        continue
                    }
                    let userID = user.id.uuidString
                    await self.hydrate(user: user)
                    guard self.currentSessionUserID == userID else { continue }
                    // The first membership attempt completed. Query failure stays
                    // fail-closed as `.loading`, but Root may now show recovery UI.
                    self.markReadyIfNeeded()

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
        // Share one in-flight membership fetch across concurrent callers (an
        // auth-stream event and explicit sign-in can arrive together).
        if let task = hydrationTask {
            await task.value
            return
        }
        // A successful query is hydrated even when it legitimately returns no
        // memberships. Only a failed query remains retryable on a later event.
        if isHydrated { return }

        hydrationGeneration += 1
        let generation = hydrationGeneration
        let task = Task { @MainActor in
            await self.performHydration(userID: user.id.uuidString)
        }
        hydrationTask = task
        await task.value

        // Clear only this generation's latch. Account changes cancel and replace
        // it, and an older task must never clear a newer hydration attempt.
        if hydrationGeneration == generation { hydrationTask = nil }
    }

    /// The user id the current session is authenticated for, or nil once signed
    /// out. Used to bail an in-flight hydration whose session changed mid-fetch.
    private var currentSessionUserID: String? { session?.user.id.uuidString }

    /// A successful membership query hydrates the current user even when the
    /// validated membership set is empty. Query failure leaves this false so a
    /// later auth event can retry; an account switch clears `hydratedUserID`.
    private var isHydrated: Bool {
        guard let currentSessionUserID else { return false }
        return hydratedUserID == currentSessionUserID
    }

    private func performHydration(userID: String) async {
        // Membership is the security gate. Profile and role decoration must not
        // delay or determine owner readiness, so resolve the workspace projection
        // first and hydrate display metadata independently afterward.
        guard let fetchedWorkspaces = await fetchWorkspaces(userID: userID) else {
            // Query failure is not equivalent to a validated user with no orgs.
            // Stay loading/fail-closed and retry on the next auth event.
            return
        }
        guard !Task.isCancelled, currentSessionUserID == userID else { return }
        workspaces = fetchedWorkspaces
        hydratedUserID = userID
        resolveActiveWorkspace(for: userID)

        Task { @MainActor [weak self] in
            await self?.hydrateInformationalMetadata(userID: userID)
        }
    }

    private func hydrateInformationalMetadata(userID: String) async {
        let name = await fetchDisplayName(userID: userID)
        guard currentSessionUserID == userID else { return }
        profileDisplayName = name

        let fetchedRoles = await fetchRoles(userID: userID)
        guard currentSessionUserID == userID else { return }
        roles = fetchedRoles
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

    private func fetchWorkspaces(userID: String) async -> [CaptureWorkspace]? {
        do {
            // Active-only: org SELECT RLS only exposes orgs for active memberships, so an
            // invited row embeds null organizations and is omitted from the validated set.
            let joins: [OrgJoin] = try await client
                .from("organization_members")
                .select("organizations(id, name)")
                .eq("user_id", value: userID)
                .eq("status", value: "active")
                .execute()
                .value
            return joins.compactMap { $0.organizations }.map {
                CaptureWorkspace(id: $0.id, name: $0.name)
            }
        } catch {
            log.error("workspaces fetch failed: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    // MARK: Active-workspace resolution / persistence

    private func resolveActiveWorkspace(for userID: String) {
        let idKey = Keys.activeWorkspaceID(userID: userID)
        let nameKey = Keys.activeWorkspaceName(userID: userID)
        let savedID = defaults.string(forKey: idKey)

        if let match = workspaces.first(where: {
            $0.id.caseInsensitiveCompare(savedID ?? "") == .orderedSame
        }) {
            activeWorkspaceID = match.id
            activeWorkspaceName = match.name
            persistActiveWorkspace(for: userID)
        } else if workspaces.count == 1 {
            activeWorkspaceID = workspaces[0].id
            activeWorkspaceName = workspaces[0].name
            persistActiveWorkspace(for: userID)
        } else {
            activeWorkspaceID = nil
            activeWorkspaceName = nil
            defaults.removeObject(forKey: idKey)
            defaults.removeObject(forKey: nameKey)
        }

        guard let activeWorkspaceID,
              workspaces.contains(where: {
                  $0.id.caseInsensitiveCompare(activeWorkspaceID) == .orderedSame
              }),
              let owner = CaptureOwnerIdentity(
                  userID: userID,
                  workspaceID: activeWorkspaceID
              ) else {
            ownerState = .needsWorkspace(
                userID: userID.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            )
            return
        }
        ownerState = .ready(owner)
    }

    private func persistActiveWorkspace(for userID: String) {
        let idKey = Keys.activeWorkspaceID(userID: userID)
        let nameKey = Keys.activeWorkspaceName(userID: userID)
        if let id = activeWorkspaceID {
            defaults.set(id, forKey: idKey)
        } else {
            defaults.removeObject(forKey: idKey)
        }
        if let name = activeWorkspaceName {
            defaults.set(name, forKey: nameKey)
        } else {
            defaults.removeObject(forKey: nameKey)
        }
    }

    private func clearLocalState() {
        ownerState = .signedOut
        hydrationGeneration += 1
        hydrationTask?.cancel()
        hydrationTask = nil
        hydratedUserID = nil
        session = nil
        workspaces = []
        roles = []
        activeWorkspaceID = nil
        activeWorkspaceName = nil
        profileDisplayName = nil
        defaults.removeObject(forKey: Keys.legacyActiveWorkspaceID)
        defaults.removeObject(forKey: Keys.legacyActiveWorkspaceName)
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
    let organizations: OrgRow?
}
private struct OrgRow: Decodable {
    let id: String
    let name: String
}
