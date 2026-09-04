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

    /// The session every supabase-swift read runs on.
    ///
    /// Without it the SDK falls back to `URLSession.shared`, whose defaults
    /// are 60 s per request and **seven days** per resource — so a proposal,
    /// an invoice, a decision or a thread fetched through the SDK inherited a
    /// budget four times the one the raw-URLSession clients apply, and a
    /// tester on a dead backend watched "One moment…" for a full minute with
    /// nothing to cancel (C4-16; the mechanism behind R-05's measured 65–185 s).
    /// `static` and read by `NetworkBudgetTests`, which is the only way to
    /// assert a timeout the SDK does not expose back.
    public static let sessionConfiguration: URLSessionConfiguration = {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = APIConfiguration.requestTimeout
        configuration.timeoutIntervalForResource = APIConfiguration.resourceTimeout
        configuration.waitsForConnectivity = false
        return configuration
    }()

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
                global: SupabaseClientOptions.GlobalOptions(
                    session: URLSession(configuration: Self.sessionConfiguration),
                    logger: logger
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

/// Global accessor for Supabase client. `nonisolated` so it can be reached
/// from TaskGroup / detached-task closures, which matters for the
/// bounded-concurrency scan uploader in `RoomScanSyncService`.
public nonisolated var supabase: SupabaseClient {
    SupabaseClientManager.shared.client
}
