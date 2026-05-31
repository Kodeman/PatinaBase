//
//  PatinaLog.swift
//  Patina
//
//  Patina Design System - Logging
//
//  Thin wrapper over os.Logger giving the app a single, categorized logging
//  surface to replace ad-hoc console logging (PT-6-15). Mirrors the os.Logger
//  usage in `Services/Sync/UploadDiagnosticsLog.swift`: one shared subsystem,
//  per-domain categories, and an explicit privacy option for user-derived data.
//
//  Additive foundation — the console-logging migration happens in a later wave.
//

import Foundation
import OSLog

/// Categorized os.Logger surface for the Patina app.
///
/// ```swift
/// PatinaLog.scan.info("Captured room \(roomId, privacy: .private)")
/// PatinaLog.auth.error("Sign-in failed", privacy: .public)
/// ```
enum PatinaLog {

    /// Shared logging subsystem — matches the bundle's reverse-DNS prefix.
    private static let subsystem = "com.patina.app"

    /// Logical domains the app logs against.
    enum Category: String {
        case scan
        case auth
        case companion
        case sync
        case ui
        case nav
    }

    // MARK: - Category Accessors

    static let scan = PatinaLogger(category: .scan)
    static let auth = PatinaLogger(category: .auth)
    static let companion = PatinaLogger(category: .companion)
    static let sync = PatinaLogger(category: .sync)
    static let ui = PatinaLogger(category: .ui)
    static let nav = PatinaLogger(category: .nav)

    /// Underlying os.Logger factory.
    fileprivate static func logger(for category: Category) -> Logger {
        Logger(subsystem: subsystem, category: category.rawValue)
    }
}

/// Per-category logging facade. Each call accepts a privacy option so that
/// user-derived data can be redacted in release logs (default `.public` for
/// developer diagnostics, switch to `.private` for anything user-identifying).
struct PatinaLogger {

    private let logger: Logger

    init(category: PatinaLog.Category) {
        self.logger = PatinaLog.logger(for: category)
    }

    /// Debug-level message — stripped from release log archives.
    func debug(_ message: String, privacy: OSLogPrivacy = .public) {
        switch privacy {
        case .private:
            logger.debug("\(message, privacy: .private)")
        default:
            logger.debug("\(message, privacy: .public)")
        }
    }

    /// Informational message — persisted, useful for flow tracing.
    func info(_ message: String, privacy: OSLogPrivacy = .public) {
        switch privacy {
        case .private:
            logger.info("\(message, privacy: .private)")
        default:
            logger.info("\(message, privacy: .public)")
        }
    }

    /// Error message — always persisted to the log archive.
    func error(_ message: String, privacy: OSLogPrivacy = .public) {
        switch privacy {
        case .private:
            logger.error("\(message, privacy: .private)")
        default:
            logger.error("\(message, privacy: .public)")
        }
    }

    /// Redaction control for user-derived data.
    enum OSLogPrivacy {
        /// Visible in log output — safe developer diagnostics.
        case `public`
        /// Redacted in release builds — user-identifying data.
        case `private`
    }
}
