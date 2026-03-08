//
//  AppConfiguration.swift
//  Patina
//
//  Environment and configuration settings
//

import Foundation

/// App environment types
public enum AppEnvironment {
    case debug
    case staging
    case release

    public static var current: AppEnvironment {
        #if DEBUG
        return .debug
        #else
        return .release
        #endif
    }
}

/// App-wide configuration settings
public enum AppConfiguration {

    // MARK: - API Configuration

    public static var supabaseURL: URL {
        // Self-hosted Supabase on Coolify
        URL(string: "https://api.patina.cloud")!
    }

    public static var supabaseAnonKey: String {
        // In production, this should come from a secure configuration
        // For now, using the anon key which is safe to expose
        Secrets.supabaseAnonKey
    }

    // MARK: - Feature Flags

    public static var enableDebugOverlay: Bool {
        AppEnvironment.current == .debug
    }

    public static var analyticsEnabled: Bool {
        AppEnvironment.current != .debug
    }

    public static var enableVoiceInput: Bool {
        true // Can be toggled based on environment
    }

    public static var enableARFeatures: Bool {
        true // Can be toggled based on device capability
    }

    // MARK: - App Info

    public static var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
    }

    public static var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
    }

    public static var fullVersion: String {
        "\(appVersion) (\(buildNumber))"
    }
}
