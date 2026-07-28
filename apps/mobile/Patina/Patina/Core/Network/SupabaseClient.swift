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
import OSLog
import Supabase

#if DEBUG
/// Routes supabase-swift's internal diagnostics into the unified log. Without
/// a logger the SDK swallows them entirely, which is how a failing keychain
/// read — the one that strips `Authorization` off every PostgREST request —
/// stayed invisible during debugging. DEBUG-only: these lines carry session
/// and request detail that has no business in a release log archive.
///
/// `nonisolated` (and using `os.Logger` rather than `PatinaLog`, which is
/// main-actor isolated) because the SDK calls `log(message:)` from whatever
/// context the failure happened on.
nonisolated private struct SupabaseDiagnosticsLogger: SupabaseLogger {
    private let logger = Logger(subsystem: "com.patina.app", category: "Supabase")

    func log(message: SupabaseLogMessage) {
        let line = message.description
        switch message.level {
        case .error, .warning:
            logger.error("\(line, privacy: .private)")
        default:
            logger.debug("\(line, privacy: .private)")
        }
    }
}
#endif

/// Supabase client singleton
public final class SupabaseClientManager {
    public static let shared = SupabaseClientManager()

    /// The Supabase client instance
    public let client: SupabaseClient

    private init() {
        #if DEBUG
        let logger: (any SupabaseLogger)? = SupabaseDiagnosticsLogger()
        #else
        let logger: (any SupabaseLogger)? = nil
        #endif

        client = SupabaseClient(
            supabaseURL: AppConfiguration.supabaseURL,
            supabaseKey: AppConfiguration.supabaseAnonKey,
            options: SupabaseClientOptions(
                auth: SupabaseClientOptions.AuthOptions(
                    emitLocalSessionAsInitialSession: true
                ),
                global: SupabaseClientOptions.GlobalOptions(logger: logger)
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

/// Global accessor for Supabase client. `nonisolated` so it can be reached
/// from TaskGroup / detached-task closures, which matters for the
/// bounded-concurrency scan uploader in `RoomScanSyncService`.
public nonisolated var supabase: SupabaseClient {
    SupabaseClientManager.shared.client
}
