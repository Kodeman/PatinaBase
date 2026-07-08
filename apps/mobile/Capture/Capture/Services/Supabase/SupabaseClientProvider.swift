//  SupabaseClientProvider.swift
//  Capture
//
//  Builds the single supabase-swift client the app owns. Only app-side code
//  (SupabaseSessionService, SupabaseWorkspaceAuthorizer) touches it — CaptureKit
//  and the feature teams never import Supabase, they go through SessionProviding.
//
//  Mirrors the existing Patina app's SupabaseClientManager: local session is
//  emitted as the initial auth-state event so cold-launch session restore drives
//  `waitForReady()`.

import Foundation
import Supabase

enum SupabaseClientProvider {
    /// A fresh client pointed at `AppConfiguration.supabaseURL` (overridable by
    /// `-CaptureSupabaseURL` / `-CaptureSupabaseAnonKey` for local-stack tests).
    static func makeClient() -> SupabaseClient {
        SupabaseClient(
            supabaseURL: AppConfiguration.supabaseURL,
            supabaseKey: AppConfiguration.supabaseAnonKey,
            options: SupabaseClientOptions(
                auth: SupabaseClientOptions.AuthOptions(
                    // Emit the locally stored session immediately as
                    // `.initialSession`, so a cold launch with a restored
                    // session resolves `waitForReady()` from the auth stream.
                    emitLocalSessionAsInitialSession: true
                )
            )
        )
    }
}
