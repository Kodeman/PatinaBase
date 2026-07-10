//  SupabaseWorkspaceAuthorizer.swift
//  Capture
//
//  The real `WorkspaceAuthorizing` behind O2's two sign-in entry points —
//  Sign in with Apple (native ASAuthorizationController, no redirect) and email
//  one-time-code (`signInWithOTP` → `verifyOTP`, no redirect). Both run through
//  the shared SupabaseSessionService, then return the user's organizations as
//  `[OnboardingWorkspace]`. On failure each throws, and ConnectWorkspaceScreen
//  falls back to its inline retry / code-error state (O2).
//
//  Strata (prod Supabase) has only the `apple` and `email` auth providers
//  enabled — Google is intentionally not configured.

import Foundation

@MainActor
final class SupabaseWorkspaceAuthorizer: WorkspaceAuthorizing {
    private let session: SupabaseSessionService

    init(session: SupabaseSessionService) {
        self.session = session
    }

    func authorizeWithApple(idToken: String, rawNonce: String) async throws -> [OnboardingWorkspace] {
        try await session.signInWithApple(idToken: idToken, rawNonce: rawNonce)
        return session.workspaces.map { OnboardingWorkspace(id: $0.id, name: $0.name) }
    }

    func sendEmailCode(to email: String) async throws {
        try await session.sendEmailCode(to: email)
    }

    func verifyEmailCode(email: String, code: String) async throws -> [OnboardingWorkspace] {
        try await session.verifyEmailCode(email: email, code: code)
        return session.workspaces.map { OnboardingWorkspace(id: $0.id, name: $0.name) }
    }
}
