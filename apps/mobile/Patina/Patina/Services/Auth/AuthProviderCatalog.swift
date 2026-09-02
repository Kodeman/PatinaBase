//
//  AuthProviderCatalog.swift
//  Patina
//
//  A3-06 / ruling D3 — the Welcome screen renders only the sign-in providers
//  GoTrue actually has enabled.
//
//  "Continue with Google" was the first button on the first screen and Google
//  has never been configured on Strata: `GET /auth/v1/settings` answers
//  `"google": false`, and `/auth/v1/authorize?provider=google` answers
//  `400 validation_failed — "Unsupported provider: provider is not enabled"`.
//  A hard-coded button list cannot know that. This one asks.
//
//  Fetched once per process, cached to UserDefaults so a launch with no
//  network uses the last answer instead of guessing, and falling back to
//  Apple + email — what Strata reports today — before the first answer and
//  after any failure.
//

import Foundation

/// A sign-in method the Welcome screen can offer, in render order.
public enum AuthProvider: String, CaseIterable, Sendable {
    case apple
    case google
    case email

    /// The key this provider carries in GoTrue's `settings.external` map.
    var settingsKey: String { rawValue }
}

@Observable
public final class AuthProviderCatalog {
    public static let shared = AuthProviderCatalog()

    /// What Strata reports today, and what the app shows until GoTrue says
    /// otherwise. Never empty: a screen with no way to sign in is worse than
    /// a screen offering one that might not be configured.
    static let fallback: [AuthProvider] = [.apple, .email]

    static let cacheKey = "patina.auth.enabledProviders.v1"

    public private(set) var providers: [AuthProvider]

    @ObservationIgnored
    private let defaults: UserDefaults

    @ObservationIgnored
    private var resolveTask: Task<Void, Never>?

    /// `defaults` and `session` are seams for tests; production takes the
    /// standard domain and the shared session.
    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.providers = Self.cached(from: defaults) ?? Self.fallback
    }

    // MARK: - Decision (pure)

    /// The providers to render, from GoTrue's `settings.external` map.
    ///
    /// Order is fixed by `AuthProvider.allCases` — Apple first (Apple's own
    /// guideline when it is offered at all), then Google, then email — so the
    /// stack cannot reorder itself between launches. A map that enables
    /// nothing this app can drive falls back rather than rendering an empty
    /// screen.
    static func providers(from external: [String: Bool]) -> [AuthProvider] {
        let enabled = AuthProvider.allCases.filter { external[$0.settingsKey] == true }
        return enabled.isEmpty ? fallback : enabled
    }

    // MARK: - Resolve

    /// Ask GoTrue once per process. Safe to call from every `.task` on the
    /// auth surfaces — the second caller joins the first request.
    @MainActor
    public func resolveIfNeeded(
        fetch: @escaping @Sendable () async throws -> [String: Bool] = AuthProviderCatalog.fetchSettings
    ) async {
        if let resolveTask {
            await resolveTask.value
            return
        }
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let external = try await fetch()
                let resolved = Self.providers(from: external)
                self.providers = resolved
                self.defaults.set(resolved.map(\.rawValue), forKey: Self.cacheKey)
            } catch {
                // The cached or fallback list stands. A welcome screen that
                // renders nothing because the network blinked is the worse
                // failure.
                PatinaLog.auth.debug(
                    "AuthProviderCatalog: settings unavailable — \(error.localizedDescription)"
                )
            }
        }
        resolveTask = task
        await task.value
    }

    /// `GET {supabase}/auth/v1/settings` → its `external` map.
    public static func fetchSettings() async throws -> [String: Bool] {
        var request = URLRequest(
            url: APIConfiguration.apiURL.appendingPathComponent("/auth/v1/settings")
        )
        request.setValue(APIConfiguration.anonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 10

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw NetworkError.serverError(
                statusCode: (response as? HTTPURLResponse)?.statusCode ?? -1,
                message: nil
            )
        }
        let decoded = try JSONDecoder().decode(GoTrueSettings.self, from: data)
        return decoded.external
    }

    private struct GoTrueSettings: Decodable {
        let external: [String: Bool]
    }

    private static func cached(from defaults: UserDefaults) -> [AuthProvider]? {
        guard let raw = defaults.stringArray(forKey: cacheKey) else { return nil }
        let restored = raw.compactMap(AuthProvider.init(rawValue:))
        return restored.isEmpty ? nil : restored
    }
}
