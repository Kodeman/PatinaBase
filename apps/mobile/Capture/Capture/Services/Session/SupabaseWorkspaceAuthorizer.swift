//  SupabaseWorkspaceAuthorizer.swift
//  Capture
//
//  The real `WorkspaceAuthorizing` behind O2's "Continue with Patina" button:
//  runs Supabase Google OAuth (SDK-managed ASWebAuthenticationSession,
//  redirectTo `field://auth/callback`) via the shared SupabaseSessionService,
//  then returns the user's organizations as `[OnboardingWorkspace]`. On failure
//  it throws, and ConnectWorkspaceScreen falls back to its inline retry (O2).

import Foundation

@MainActor
final class SupabaseWorkspaceAuthorizer: WorkspaceAuthorizing {
    private let session: SupabaseSessionService

    init(session: SupabaseSessionService) {
        self.session = session
    }

    func authorize() async throws -> [OnboardingWorkspace] {
        try await session.signInWithGoogle()
        return session.workspaces.map { OnboardingWorkspace(id: $0.id, name: $0.name) }
    }
}
