//  AppConfiguration.swift
//  Capture
//
//  Central config. Mirrors the existing Patina app's pattern. The Supabase URL
//  is the shared backend; the anon key lives in Secrets.swift (gitignored).

import Foundation

public enum AppConfiguration {
    /// Shared backend. Defaults to production; overridable for local-stack
    /// testing via `-CaptureSupabaseURL <url>`.
    public static var supabaseURL: URL {
        if let raw = launchArgValue("-CaptureSupabaseURL"), let url = URL(string: raw) { return url }
        return URL(string: "https://api.patina.cloud")!
    }

    /// Anon (publishable) key. From `Secrets.swift` (gitignored) by default;
    /// overridable via `-CaptureSupabaseAnonKey <key>` for local-stack testing.
    public static var supabaseAnonKey: String {
        launchArgValue("-CaptureSupabaseAnonKey") ?? Secrets.supabaseAnonKey
    }

    /// Designer portal origin (QR sign-in approval verifies against it).
    /// Defaults to production; overridable via `-CapturePortalBaseURL <url>`
    /// for local-stack testing, mirroring `-CaptureSupabaseURL`.
    public static var portalBaseURL: URL {
        if let raw = launchArgValue("-CapturePortalBaseURL"), let url = URL(string: raw) { return url }
        return URL(string: "https://app.patina.cloud")!
    }

    /// Media service origin (receiving photo uploads). Defaults to
    /// production; overridable via `-CaptureMediaBaseURL <url>`.
    public static var mediaBaseURL: URL {
        if let raw = launchArgValue("-CaptureMediaBaseURL"), let url = URL(string: raw) { return url }
        return URL(string: "https://media.patina.cloud")!
    }

    public static let appGroupID = "group.cloud.patina.field"
    public static let urlScheme = "field"
    public static let authCallback = "field://auth/callback"
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

    /// Composition policy: whether the app wires REAL services (Supabase session,
    /// persistent store, local sync outbox) instead of mocks.
    ///
    /// All-mock (returns `false`): `-CaptureUseMocks` / `--uitesting`,
    /// `-CaptureUITest`, **or** running on the simulator without
    /// `-CaptureForceReal`. This keeps the 51-screen `-CaptureScreen` harness,
    /// capture-run.sh, capture-shots.sh, and previews working by default.
    ///
    /// Real (returns `true`): a physical device by default, or the simulator
    /// with `-CaptureForceReal`.
    public static var runsRealServices: Bool {
        if useMocks || isUITest { return false }
        #if targetEnvironment(simulator)
        return ProcessInfo.processInfo.arguments.contains("-CaptureForceReal")
        #else
        return true
        #endif
    }

    /// Value that follows a `-Flag value` launch argument, if present.
    private static func launchArgValue(_ flag: String) -> String? {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: flag), i + 1 < args.count else { return nil }
        return args[i + 1]
    }

    /// `-CaptureScreen <suffix>` drives a screen on launch (deterministic sim/UITest
    /// verification of the 51-screen matrix), e.g. `-CaptureScreen T1.settings`.
    public static var initialScreenRaw: String? {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-CaptureScreen"), i + 1 < args.count else { return nil }
        return args[i + 1]
    }

    // MARK: - PostHog (Phase 1b analytics)

    /// PostHog project key. From `Secrets.swift` (gitignored), else the
    /// `POSTHOG_API_KEY` env var, else empty (analytics stays a no-op). Mirrors
    /// the existing Patina app's resolution.
    public static var postHogAPIKey: String {
        Secrets.postHogAPIKey ?? ProcessInfo.processInfo.environment["POSTHOG_API_KEY"] ?? ""
    }

    /// PostHog host, overridable via `POSTHOG_HOST` (defaults to US cloud).
    public static var postHogHost: String {
        ProcessInfo.processInfo.environment["POSTHOG_HOST"] ?? "https://us.i.posthog.com"
    }
}
