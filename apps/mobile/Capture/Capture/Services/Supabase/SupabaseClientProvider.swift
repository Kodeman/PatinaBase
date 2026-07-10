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
            options: SupabaseClientOptions(auth: authOptions)
        )
    }

    private static var authOptions: SupabaseClientOptions.AuthOptions {
        #if targetEnvironment(simulator)
        // The Simulator runs the app ad-hoc-signed (no `application-identifier`
        // entitlement), so supabase-swift's default Keychain storage can't
        // persist the session: `auth.session` then throws and every PostgREST
        // request silently falls back to the anon key (RLS sees no `auth.uid()`),
        // so a `-CaptureForceReal` sign-in authenticates but never hydrates. A
        // plain `UserDefaults` store keeps the session on the Simulator. Physical
        // devices are compiled to the branch below and keep the secure Keychain.
        return .init(
            storage: SimulatorAuthStorage(),
            emitLocalSessionAsInitialSession: true
        )
        #else
        // Emit the locally stored session immediately as `.initialSession`, so a
        // cold launch with a restored session resolves `waitForReady()` from the
        // auth stream. Uses supabase-swift's default (Keychain) local storage.
        return .init(emitLocalSessionAsInitialSession: true)
        #endif
    }
}

#if targetEnvironment(simulator)
/// Simulator-only auth-token storage backed by `UserDefaults` (see the note in
/// `authOptions`). Never compiled for a device build.
private struct SimulatorAuthStorage: AuthLocalStorage {
    private let defaults: UserDefaults = .standard
    func store(key: String, value: Data) throws { defaults.set(value, forKey: key) }
    func retrieve(key: String) throws -> Data? { defaults.data(forKey: key) }
    func remove(key: String) throws { defaults.removeObject(forKey: key) }
}
#endif
