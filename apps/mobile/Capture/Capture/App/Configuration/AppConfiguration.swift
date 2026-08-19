//  AppConfiguration.swift
//  Capture
//
//  Central config. Mirrors the existing Patina app's pattern. The Supabase URL
//  is the shared backend; the anon key lives in Secrets.swift (gitignored).

import Foundation

public enum AppConfiguration {
    /// Shared backend. Defaults to Supabase Cloud "Strata" (project ref
    /// bkvcixdmuyejfzcijpdg); overridable for local-stack testing via
    /// `-CaptureSupabaseURL <url>`.
    public static var supabaseURL: URL {
        if let raw = launchArgValue("-CaptureSupabaseURL"), let url = URL(string: raw) { return url }
        return URL(string: "https://bkvcixdmuyejfzcijpdg.supabase.co")!
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

    /// Zero-install guest web origin and native universal-link allow-list host.
    /// The installed Field app claims only `/field/{opaque-token}` links.
    public static var guestSiteBaseURL: URL {
        if let raw = launchArgValue("-CaptureGuestSiteBaseURL"), let url = URL(string: raw) { return url }
        return URL(string: "https://client.patina.cloud")!
    }

    /// Media service origin (receiving photo uploads). Defaults to
    /// production; overridable via `-CaptureMediaBaseURL <url>`.
    public static var mediaBaseURL: URL {
        if let raw = launchArgValue("-CaptureMediaBaseURL"), let url = URL(string: raw) { return url }
        return URL(string: "https://media.patina.cloud")!
    }

    /// Edge API worker base URL, or nil when the app was not built with one.
    ///
    /// The ONLY base URL in this file with no production default, and the
    /// absence is the design: the Phase-2 upload interface is
    /// `MEDIA_UPLOADS: "off"` in every committed environment and asserted `off`
    /// on production (`infra/edge-api-worker/OPERATIONS.md`). A committed
    /// default would be a hostname this app reaches for before anything on the
    /// other end is meant to answer — and the one hostname that must never be
    /// defaulted to is the production one. Nil means dormant:
    /// `FieldScanUploadShadowLeg.live` builds no client and the primary upload
    /// is the only upload.
    ///
    /// Resolution mirrors the rest of this file plus the client app's
    /// `APIConfiguration.edgeAPIURL`: `-CaptureEdgeAPIURL <url>` for a
    /// scheme/launch override, then the `EDGE_API_URL` process environment
    /// variable, then an `EDGE_API_URL` Info.plist key (an
    /// `INFOPLIST_KEY_EDGE_API_URL` build setting reaches it). No key is
    /// committed to `Capture/Info.plist`.
    public static var edgeAPIURL: URL? {
        let raw = launchArgValue("-CaptureEdgeAPIURL")
            ?? ProcessInfo.processInfo.environment["EDGE_API_URL"]
            ?? Bundle.main.infoDictionary?["EDGE_API_URL"] as? String
        guard let raw else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return nil }
        return URL(string: trimmed)
    }

    public static let appGroupID = "group.cloud.patina.field"
    /// `field://` scheme — still used for `field://screen/<id>` / `field://capture`
    /// deep links (CaptureDeepLink). Auth no longer redirects here: Sign in with
    /// Apple and email one-time-code are native, with no browser callback.
    public static let urlScheme = "field"
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
