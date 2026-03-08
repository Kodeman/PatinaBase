//
//  SupabaseClient.swift
//  Patina
//
//  Supabase client configuration and singleton
//
//  Note: Add supabase-swift package via SPM:
//  https://github.com/supabase/supabase-swift
//

import Foundation
import Supabase

/// Supabase client singleton
public final class SupabaseClientManager {
    public static let shared = SupabaseClientManager()

    /// The Supabase client instance
    public let client: SupabaseClient

    private init() {
        client = SupabaseClient(
            supabaseURL: AppConfiguration.supabaseURL,
            supabaseKey: AppConfiguration.supabaseAnonKey,
            options: SupabaseClientOptions(
                auth: SupabaseClientOptions.AuthOptions(
                    emitLocalSessionAsInitialSession: true
                )
            )
        )
    }

    // MARK: - Convenience Accessors

    /// Auth client for authentication operations
    public var auth: AuthClient {
        client.auth
    }

    /// Database client for queries
    public var database: PostgrestClient {
        client.database
    }

    /// Storage client for file uploads
    public var storage: SupabaseStorageClient {
        client.storage
    }
}

// MARK: - Global Accessor

/// Global accessor for Supabase client
public var supabase: SupabaseClient {
    SupabaseClientManager.shared.client
}
