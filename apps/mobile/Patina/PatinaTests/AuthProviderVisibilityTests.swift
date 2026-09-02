//
//  AuthProviderVisibilityTests.swift
//  PatinaTests
//
//  A3-06 / ruling D3 — the Welcome screen renders only what GoTrue reports.
//  A-03 / P-02 — one icon idiom, and no glyph in an accessibility label.
//  C1-05 — an in-flight state on every provider row.
//
//  Fixtures the live shape so `A3-06` cannot regress when someone later
//  enables Google: the assertion is on the button COUNT and ORDER, for both
//  shapes.
//

import Foundation
import Testing
@testable import Patina

struct AuthProviderVisibilityTests {

    /// Strata, verified read-only 2026-09-01 (research/A3-prod.md §"Auth (b)").
    static let strata: [String: Bool] = [
        "apple": true, "email": true, "google": false, "azure": false,
        "facebook": false, "phone": false, "github": false, "twitter": false
    ]

    /// The local CLI stack, verified this session: apple is OFF there.
    static let localStack: [String: Bool] = [
        "apple": false, "email": true, "google": false, "phone": false
    ]

    @Test("Strata renders Apple and email — never Google (A3-06, D3)")
    func strataShapeDropsGoogle() {
        let providers = AuthProviderCatalog.providers(from: Self.strata)
        #expect(providers == [.apple, .email])
        #expect(!providers.contains(.google))
        #expect(providers.count == 2)
    }

    @Test("enabling Google later brings the button back, in Apple-first order")
    func googleShapeRendersThree() {
        var external = Self.strata
        external["google"] = true
        let providers = AuthProviderCatalog.providers(from: external)
        #expect(providers == [.apple, .google, .email])
        #expect(providers.count == 3)
    }

    @Test("a provider GoTrue does not report is never rendered")
    func unreportedProvidersAreAbsent() {
        #expect(AuthProviderCatalog.providers(from: ["email": true]) == [.email])
        #expect(AuthProviderCatalog.providers(from: Self.localStack) == [.email])
    }

    @Test("a settings map with nothing this app can drive falls back rather than emptying the screen")
    func emptyMapFallsBack() {
        #expect(AuthProviderCatalog.providers(from: [:]) == AuthProviderCatalog.fallback)
        #expect(AuthProviderCatalog.providers(from: ["github": true]) == [.apple, .email])
    }

    @Test("the fallback, before any answer and after any failure, is Apple + email")
    func fallbackIsAppleAndEmail() {
        #expect(AuthProviderCatalog.fallback == [.apple, .email])
        let defaults = UserDefaults(suiteName: "AuthProviderVisibilityTests.fresh")!
        defaults.removePersistentDomain(forName: "AuthProviderVisibilityTests.fresh")
        #expect(AuthProviderCatalog(defaults: defaults).providers == [.apple, .email])
    }

    @Test("a resolved answer is cached, so a launch with no network is not a guess")
    @MainActor
    func resolvedAnswerIsCached() async {
        let suite = "AuthProviderVisibilityTests.cache"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)

        let catalog = AuthProviderCatalog(defaults: defaults)
        await catalog.resolveIfNeeded(fetch: { ["email": true] })
        #expect(catalog.providers == [.email])

        // A second process, no network.
        let cold = AuthProviderCatalog(defaults: defaults)
        #expect(cold.providers == [.email])
        await cold.resolveIfNeeded(fetch: { throw NetworkError.networkUnavailable })
        #expect(cold.providers == [.email])

        defaults.removePersistentDomain(forName: suite)
    }

    // MARK: - A-03 / P-02 — the icons

    @Test("the email row carries an SF Symbol, not the U+2709 emoji (A-03, P-02)")
    func emailRowUsesAnSFSymbol() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthScreenView.swift")
        #expect(source.contains("systemImage: \"envelope\""))
        #expect(!source.contains("\u{2709}"))
        // The letter "G" standing in for Google's mark is gone with it.
        #expect(!source.contains("icon: \"G\""))
    }

    @Test("no provider row puts a glyph in its accessibility label (A-03)")
    func accessibilityLabelsCarryNoGlyph() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthScreenView.swift")
        // AuthProviderRow labels itself from `title` alone; the design kit's
        // AuthButton rendered `Text(icon)` inside the label, which is how the
        // AX tree read "✉, Continue with email".
        #expect(source.contains(".accessibilityLabel(title)"))
        #expect(!source.contains("AuthButton("))
    }

    // MARK: - C1-05 — in flight

    @Test("the screen takes an isLoading input and disables the stack (C1-05)")
    func providerStackHasAnInFlightState() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthScreenView.swift")
        #expect(source.contains("var isLoading: Bool = false"))
        #expect(source.contains("providerStack"))
        #expect(source.contains(".disabled(isLoading)"))
        // Only the pressed row spins.
        #expect(source.contains("@State private var pressed: AuthProvider?"))
        #expect(source.contains("isBusy: pressed == .email"))
    }

    @Test("both auth surfaces thread the service's loading state in (C1-05)")
    func callSitesThreadIsLoading() throws {
        let content = try SourcePin.read("Patina/ContentView.swift")
        #expect(content.contains("isLoading: AuthService.shared.isLoading"))
        let sheet = try SourcePin.read("Patina/Features/Authentication/Views/AuthSheet.swift")
        #expect(sheet.contains("isLoading: AuthService.shared.isLoading"))
    }
}
