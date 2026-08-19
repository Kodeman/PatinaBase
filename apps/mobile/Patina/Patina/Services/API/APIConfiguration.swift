//
//  APIConfiguration.swift
//  Patina
//
//  API configuration for Supabase Strata and local development
//

import Foundation

// MARK: - Deployment Target

/// Deployment environment
public enum DeploymentTarget {
    /// Supabase Cloud (current)
    case cloud

    /// Local development
    case local

    /// Current deployment target.
    ///
    /// The default is `.cloud` (Supabase Cloud "Strata"). Pass
    /// `-DeploymentTarget local` to use the local Supabase CLI stack. Unknown
    /// values fall back to `.cloud`.
    public static var current: DeploymentTarget {
        if let override = UserDefaults.standard.string(forKey: "DeploymentTarget") {
            switch override {
            case "local": return .local
            default: return .cloud
            }
        }
        return .cloud
    }
}

// MARK: - API Configuration

/// API configuration by deployment target
public enum APIConfiguration {

    // MARK: - Base URLs

    /// Primary API URL (Supabase/Kong)
    public static var apiURL: URL {
        switch DeploymentTarget.current {
        case .cloud:
            // Supabase Cloud "Strata" (project ref bkvcixdmuyejfzcijpdg). A
            // URL is not a secret — only the anon key (see `anonKey`) is
            // sourced from the gitignored Secrets.swift. This is the literal
            // that breaks the old AppConfiguration ↔ APIConfiguration cycle.
            return URL(string: "https://bkvcixdmuyejfzcijpdg.supabase.co")!
        case .local:
            // Local Supabase CLI stack (Kong/PostgREST on 54321), NOT the
            // old self-hosted docker Kong (:8000).
            return URL(string: "http://127.0.0.1:54321")!
        }
    }

    /// Portal URL (Next.js web app)
    public static var portalURL: URL {
        switch DeploymentTarget.current {
        case .cloud:
            return URL(string: "https://app.patina.cloud")!
        case .local:
            return URL(string: "http://localhost:3000")!
        }
    }

    /// Storage URL for file uploads/downloads
    public static var storageURL: URL {
        AppConfiguration.supabaseURL.appendingPathComponent("storage/v1")
    }

    /// Realtime WebSocket URL
    public static var realtimeURL: URL {
        switch DeploymentTarget.current {
        case .cloud:
            return URL(string: "wss://bkvcixdmuyejfzcijpdg.supabase.co/realtime/v1/websocket")!
        case .local:
            return URL(string: "ws://127.0.0.1:54321/realtime/v1/websocket")!
        }
    }

    /// Client Portal URL (Next.js — hosts Daily Room telemetry endpoints)
    public static var clientPortalURL: URL {
        switch DeploymentTarget.current {
        case .cloud:
            return URL(string: "https://client.patina.cloud")!
        case .local:
            return URL(string: "http://localhost:3002")!
        }
    }

    /// Edge API worker base URL, or nil when the app was not built with one.
    ///
    /// The ONLY base URL here with no per-target literal, and the absence is
    /// the design: the Phase-2 upload interface is `MEDIA_UPLOADS: "off"` in
    /// every committed environment and asserted `off` on production
    /// (`infra/edge-api-worker/OPERATIONS.md`). A committed default would be a
    /// hostname this app reaches for before anything on the other end is meant
    /// to answer — and the one hostname that must never be defaulted to is the
    /// production one. Nil means dormant: `ScanUploadShadowLeg` builds no
    /// client and the primary path is the only path.
    ///
    /// Set it per-build via the `EDGE_API_URL` Info.plist key (an
    /// `INFOPLIST_KEY_EDGE_API_URL` build setting reaches it), or via the
    /// process environment for a scheme-level override — the same
    /// environment-first shape `AppConfiguration.postHogHost` uses.
    public static var edgeAPIURL: URL? {
        let raw = ProcessInfo.processInfo.environment["EDGE_API_URL"]
            ?? Bundle.main.infoDictionary?["EDGE_API_URL"] as? String
        guard let raw, !raw.trimmingCharacters(in: .whitespaces).isEmpty else {
            return nil
        }
        return URL(string: raw.trimmingCharacters(in: .whitespaces))
    }

    /// Search API URL (Typesense)
    public static var searchURL: URL {
        AppConfiguration.supabaseURL
    }

    /// ML/Intelligence Service URL
    public static var mlServiceURL: URL {
        AppConfiguration.supabaseURL.appendingPathComponent("functions/v1")
    }

    // MARK: - API Keys

    /// Supabase anon key
    public static var anonKey: String {
        switch DeploymentTarget.current {
        case .cloud:
            // Strata anon key from the gitignored Secrets.swift. Read
            // directly (not via AppConfiguration.supabaseAnonKey) so the
            // AppConfiguration ↔ APIConfiguration resolution can't cycle.
            return Secrets.supabaseAnonKey
        case .local:
            // Local dev anon key (standard Supabase local key)
            return "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
        }
    }

    // MARK: - Timeouts

    /// Default request timeout
    public static let requestTimeout: TimeInterval = 30.0

    /// File upload timeout
    public static let uploadTimeout: TimeInterval = 120.0

    /// ML inference timeout (longer for complex operations)
    public static let mlInferenceTimeout: TimeInterval = 60.0

    // MARK: - Deep Linking

    /// URL scheme for app deep links
    public static let appURLScheme = "patina"

    /// Universal link domains
    public static var universalLinkDomains: [String] {
        []
    }
}

// MARK: - API Endpoints

extension APIConfiguration {

    /// API endpoint definitions
    public enum Endpoint {
        // Auth
        case signIn
        case signUp
        case signOut
        case refreshToken
        case resetPassword

        // User
        case currentUser
        case updateProfile
        case deleteAccount

        // Rooms
        case rooms
        case room(id: String)
        case createRoom
        case uploadRoomScan

        // Products
        case products
        case product(id: String)
        case searchProducts
        case recommendations(roomId: String?)

        // Interactions
        case trackInteraction

        // Style
        case styleQuiz

        // Companion
        case companionContext
        case companionMessage
        case companionHistory

        /// Endpoint path
        public var path: String {
            switch self {
            // Auth (Supabase GoTrue)
            case .signIn: return "/auth/v1/token?grant_type=password"
            case .signUp: return "/auth/v1/signup"
            case .signOut: return "/auth/v1/logout"
            case .refreshToken: return "/auth/v1/token?grant_type=refresh_token"
            case .resetPassword: return "/auth/v1/recover"

            // User (PostgREST)
            case .currentUser: return "/rest/v1/profiles?select=*"
            case .updateProfile: return "/rest/v1/profiles"
            case .deleteAccount: return "/rest/v1/rpc/delete_user_account"

            // Rooms
            case .rooms: return "/rest/v1/rooms?select=*"
            case .room(let id): return "/rest/v1/rooms?id=eq.\(id)&select=*"
            case .createRoom: return "/rest/v1/rooms"
            case .uploadRoomScan: return "/storage/v1/object/room-scans"

            // Products
            case .products: return "/rest/v1/products?select=*"
            case .product(let id): return "/rest/v1/products?id=eq.\(id)&select=*"
            case .searchProducts: return "/rest/v1/rpc/search_products"
            case .recommendations(let roomId):
                if let roomId {
                    return "/rest/v1/rpc/get_recommendations?room_id=\(roomId)"
                }
                return "/rest/v1/rpc/get_recommendations"

            // Interactions
            case .trackInteraction: return "/rest/v1/interactions"

            // Style
            case .styleQuiz: return "/rest/v1/rpc/process_style_quiz"

            // Companion (Edge Functions)
            case .companionContext: return "/functions/v1/companion-context"
            case .companionMessage: return "/functions/v1/companion-message"
            case .companionHistory: return "/functions/v1/companion-history"
            }
        }

        /// HTTP method for this endpoint
        public var method: String {
            switch self {
            case .signIn, .signUp, .signOut, .refreshToken, .resetPassword,
                 .createRoom, .uploadRoomScan, .searchProducts,
                 .companionContext, .companionMessage,
                 .recommendations, .trackInteraction, .styleQuiz:
                return "POST"
            case .updateProfile:
                return "PATCH"
            case .deleteAccount:
                return "DELETE"
            default:
                return "GET"
            }
        }

        /// Whether this endpoint requires authentication
        public var requiresAuth: Bool {
            switch self {
            case .signIn, .signUp, .resetPassword:
                return false
            default:
                return true
            }
        }
    }
}

// MARK: - Storage Buckets

extension APIConfiguration {

    /// Storage bucket definitions
    public enum StorageBucket: String {
        case roomScans = "room-scans"
        case productImages = "product-images"
        case avatars = "avatars"
        case heroFrames = "hero-frames"

        /// Whether this bucket allows public access
        public var isPublic: Bool {
            switch self {
            case .productImages, .avatars:
                return true
            case .roomScans, .heroFrames:
                return false
            }
        }
    }
}
