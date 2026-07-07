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

@Observable
@MainActor
final class SupabaseSessionService: SessionProviding {
    @ObservationIgnored private let client: SupabaseClient
    @ObservationIgnored private let defaults: UserDefaults
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
    /// `signInWithGoogle()` and the listener share one fetch and never race.
    @ObservationIgnored private var hydrationTask: Task<Void, Never>?

    private enum Keys {
        static let activeWorkspaceID = "session.activeWorkspaceID"
        static let activeWorkspaceName = "session.activeWorkspaceName"
    }

    // MARK: Init

    init(client: SupabaseClient = SupabaseClientProvider.makeClient(),
         defaults: UserDefaults = UserDefaults(suiteName: AppConfiguration.appGroupID) ?? .standard) {
        self.client = client
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

    // MARK: Sign-in (OAuth)

    /// Runs Supabase Google OAuth via the SDK-managed `ASWebAuthenticationSession`
    /// flow (`redirectTo: field://auth/callback`) and awaits hydration so the
    /// caller sees fresh `workspaces`. Throws on cancellation / auth failure.
    func signInWithGoogle() async throws {
        let session = try await client.auth.signInWithOAuth(
            provider: .google,
            redirectTo: URL(string: AppConfiguration.authCallback)
        )
        self.session = session
        await hydrate(user: session.user)
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
        let task = Task { @MainActor in
            await self.performHydration(userID: user.id.uuidString)
        }
        hydrationTask = task
        await task.value
        // Clear the latch so a later event can retry when this pass came back
        // empty; a successful pass is instead gated out above by `isHydrated`.
        hydrationTask = nil
    }

    /// A hydration pass is "good" once it has both a profile and at least one
    /// workspace. Mirrors the reference app re-gating on emptiness so failed
    /// fetches retry instead of latching an empty session for the whole run.
    private var isHydrated: Bool {
        profileDisplayName != nil && !workspaces.isEmpty
    }

    private func performHydration(userID: String) async {
        profileDisplayName = await fetchDisplayName(userID: userID)
        roles = await fetchRoles(userID: userID)
        workspaces = await fetchWorkspaces(userID: userID)
        resolveActiveWorkspace()
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
