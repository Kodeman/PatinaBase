//
//  APIConfiguration.swift
//  Patina
//
//  Extended API configuration for self-hosted Coolify deployment
//  This configuration supports both Supabase Cloud and self-hosted environments
//

import Foundation

// MARK: - Deployment Target

/// Deployment environment (cloud vs self-hosted)
public enum DeploymentTarget {
    /// Supabase Cloud (current)
    case cloud

    /// Self-hosted on Coolify (production)
    case selfHosted

    /// Local development
    case local

    /// Current deployment target
    public static var current: DeploymentTarget {
        // Check for override in UserDefaults for testing
        if let override = UserDefaults.standard.string(forKey: "DeploymentTarget") {
            switch override {
            case "cloud": return .cloud
            case "local": return .local
            default: return .selfHosted
            }
        }
        return .selfHosted
    }
}

// MARK: - API Configuration

/// Extended API configuration for self-hosted deployment
public enum APIConfiguration {

    // MARK: - Base URLs

    /// Primary API URL (Supabase/Kong)
    public static var apiURL: URL {
        switch DeploymentTarget.current {
        case .cloud:
            return AppConfiguration.supabaseURL
        case .selfHosted:
            return URL(string: "https://api.patina.cloud")!
        case .local:
            return URL(string: "http://localhost:8000")!
        }
    }

    /// Portal URL (Next.js web app)
    public static var portalURL: URL {
        switch DeploymentTarget.current {
        case .cloud:
            return URL(string: "https://app.patina.cloud")!
        case .selfHosted:
            return URL(string: "https://app.patina.cloud")!
        case .local:
            return URL(string: "http://localhost:3000")!
        }
    }

    /// Storage URL for file uploads/downloads
    public static var storageURL: URL {
        switch DeploymentTarget.current {
        case .cloud:
            return AppConfiguration.supabaseURL.appendingPathComponent("storage/v1")
        case .selfHosted:
            return URL(string: "https://storage.patina.cloud")!
        case .local:
            return URL(string: "http://localhost:5000")!
        }
    }

    /// Realtime WebSocket URL
    public static var realtimeURL: URL {
        switch DeploymentTarget.current {
        case .cloud:
            return URL(string: "wss://bkvcixdmuyejfzcijpdg.supabase.co/realtime/v1/websocket")!
        case .selfHosted:
            return URL(string: "wss://realtime.patina.cloud/socket")!
        case .local:
            return URL(string: "ws://localhost:4000/socket")!
        }
    }

    /// Search API URL (Typesense)
    public static var searchURL: URL {
        switch DeploymentTarget.current {
        case .cloud:
            // Cloud uses Supabase's built-in full-text search
            return AppConfiguration.supabaseURL
        case .selfHosted:
            return URL(string: "https://search.patina.cloud")!
        case .local:
            return URL(string: "http://localhost:8108")!
        }
    }

    /// ML/Intelligence Service URL
    public static var mlServiceURL: URL {
        switch DeploymentTarget.current {
        case .cloud:
            // Cloud uses Edge Functions for ML
            return AppConfiguration.supabaseURL.appendingPathComponent("functions/v1")
        case .selfHosted:
            return URL(string: "https://ml.patina.cloud")!
        case .local:
            return URL(string: "http://localhost:4002")!
        }
    }

    // MARK: - API Keys

    /// Supabase anon key
    public static var anonKey: String {
        switch DeploymentTarget.current {
        case .cloud:
            return AppConfiguration.supabaseAnonKey
        case .selfHosted:
            // TODO: Replace with self-hosted anon key from environment
            return ProcessInfo.processInfo.environment["SUPABASE_ANON_KEY"] ?? AppConfiguration.supabaseAnonKey
        case .local:
            // Local dev anon key (standard Supabase local key)
            return "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
        }
    }

    /// Typesense search-only key (for self-hosted)
    public static var typesenseSearchKey: String? {
        switch DeploymentTarget.current {
        case .selfHosted:
            return ProcessInfo.processInfo.environment["TYPESENSE_SEARCH_KEY"]
        default:
            return nil
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
        switch DeploymentTarget.current {
        case .cloud:
            return [] // No universal links for cloud currently
        case .selfHosted:
            return ["app.patina.cloud", "api.patina.cloud"]
        case .local:
            return []
        }
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
                 .companionContext, .companionMessage:
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
