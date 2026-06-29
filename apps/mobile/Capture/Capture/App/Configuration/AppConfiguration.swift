//  AppConfiguration.swift
//  Capture
//
//  Central config. Mirrors the existing Patina app's pattern. The Supabase URL
//  is the shared backend; the anon key lives in Secrets.swift (gitignored).

import Foundation

public enum AppConfiguration {
    public static let supabaseURL = URL(string: "https://api.patina.cloud")!
    public static var supabaseAnonKey: String { Secrets.supabaseAnonKey }

    public static let appGroupID = "group.cloud.patina.capture"
    public static let urlScheme = "capture"
    public static let authCallback = "capture://auth/callback"
    public static let captureMediaBucket = "capture-media"
    public static let productImagesBucket = "product-images"

    /// Launch-flag toggles (mirror the existing app's --uitesting/--mockar).
    public static var useMocks: Bool {
        let args = ProcessInfo.processInfo.arguments
        return args.contains("-CaptureUseMocks") || args.contains("--uitesting")
    }
    public static var isUITest: Bool {
        ProcessInfo.processInfo.arguments.contains("-CaptureUITest")
    }
}
