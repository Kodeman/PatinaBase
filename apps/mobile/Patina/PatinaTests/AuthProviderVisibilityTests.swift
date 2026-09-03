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
import SwiftUI
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
        let providers = AuthProviderCatalog.providers(from: Self.strata, target: .cloud)
        #expect(providers == [.apple, .email])
        #expect(!providers.contains(.google))
        #expect(providers.count == 2)
    }

    @Test("enabling Google later brings the button back, in Apple-first order")
    func googleShapeRendersThree() {
        var external = Self.strata
        external["google"] = true
        let providers = AuthProviderCatalog.providers(from: external, target: .cloud)
        #expect(providers == [.apple, .google, .email])
        #expect(providers.count == 3)
    }

    @Test("a provider GoTrue does not report is never rendered")
    func unreportedProvidersAreAbsent() {
        #expect(AuthProviderCatalog.providers(from: ["email": true], target: .cloud) == [.email])
        #expect(AuthProviderCatalog.providers(from: Self.localStack, target: .cloud) == [.email])
    }

    @Test("a settings map with nothing this app can drive falls back rather than emptying the screen")
    func emptyMapFallsBack() {
        #expect(AuthProviderCatalog.providers(from: [:], target: .cloud) == AuthProviderCatalog.fallback)
        #expect(AuthProviderCatalog.providers(from: ["github": true], target: .cloud) == [.apple, .email])
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
    }

    /// The Apple button hands back a completion, not a tap, so a cancelled
    /// sheet arrives as `.failure` with nothing in flight. Round one marked
    /// the row busy on every completion and `AuthService.isLoading` never
    /// moved for a cancel — so there was no falling edge to clear it, and the
    /// hero button sat at `opacity(0.35)` under a spinner for the rest of the
    /// screen's life.
    @Test("a cancelled Apple result leaves no row busy (C1-05)")
    func aCancelledAppleResultLeavesNoRowBusy() {
        #expect(AuthScreenView.inFlightProvider(forAppleSucceeded: true) == .apple)
        #expect(AuthScreenView.inFlightProvider(forAppleSucceeded: false) == nil)
    }

    /// `isBusy` is a rendered difference, not a string in a file. The email
    /// row does not take it at all: its door opens a sheet synchronously, so
    /// a busy branch there would be a parameter nothing could ever set.
    @Test("a busy row renders differently from an idle one (C1-05)")
    @MainActor
    func aBusyRowRendersDifferently() {
        func png(isBusy: Bool) -> Data? {
            let renderer = ImageRenderer(
                content: AuthProviderRow(
                    title: "Continue with Google",
                    systemImage: nil,
                    isBusy: isBusy
                ) {}
                .frame(width: 337)
            )
            renderer.scale = 1
            return renderer.uiImage?.pngData()
        }
        let idle = try? #require(png(isBusy: false))
        let busy = try? #require(png(isBusy: true))
        #expect(idle != busy)
    }

    /// A3-06's rule is the app's, not one screen's.
    @Test("both auth surfaces gate the Apple button on the catalog")
    func bothSurfacesGateOnTheCatalog() throws {
        let root = try SourcePin.read("Patina/Features/Authentication/Views/AuthScreenView.swift")
        #expect(root.contains("ForEach(catalog.providers, id: \\.self)"))

        let sheet = try SourcePin.read("Patina/Features/Authentication/Views/AuthenticationView.swift")
        #expect(sheet.contains("catalog.providers.contains(.apple)"))
        #expect(sheet.contains("await catalog.resolveIfNeeded()"))
    }

    /// The local CLI stack answers `apple: false` — it has no Apple client id
    /// and needs none — and every W1 walker, the R1 acceptance script and
    /// L1-D's dark-mode check launch `-DeploymentTarget local`. Under the rule
    /// alone the Apple row vanished from the wave's own walks, taking C1-05's
    /// in-flight state and C3-03's white-on-dark style with it.
    @Test("Apple is still offered on the local stack, and still asked for on Strata")
    func appleIsOfferedOnTheLocalStack() {
        #expect(AuthProviderCatalog.providers(from: Self.localStack, target: .local) == [.apple, .email])
        #expect(AuthProviderCatalog.providers(from: Self.localStack, target: .cloud) == [.email])
        // The exception never invents a provider Strata has not enabled.
        var strataWithoutApple = Self.strata
        strataWithoutApple["apple"] = false
        #expect(AuthProviderCatalog.providers(from: strataWithoutApple, target: .cloud) == [.email])
    }

    /// "Once per process" is right for an answer, not for a miss. A first-ever
    /// install with no network has no cache to fall back to, so one blink
    /// would otherwise hide a provider for the whole session.
    @Test("a failed resolve is retried; a successful one is not")
    @MainActor
    func aFailedResolveIsRetried() async {
        let suite = "AuthProviderVisibilityTests.retry"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        defer { defaults.removePersistentDomain(forName: suite) }

        let catalog = AuthProviderCatalog(defaults: defaults)
        await catalog.resolveIfNeeded(fetch: { throw NetworkError.networkUnavailable })
        #expect(catalog.providers == AuthProviderCatalog.fallback)

        // The network came back.
        await catalog.resolveIfNeeded(fetch: { ["email": true] })
        #expect(catalog.providers == [.email])

        // And now it is settled: a later failure cannot un-answer it.
        await catalog.resolveIfNeeded(fetch: { throw NetworkError.networkUnavailable })
        #expect(catalog.providers == [.email])
    }

    @Test("both auth surfaces thread the service's loading state in (C1-05)")
    func callSitesThreadIsLoading() throws {
        let content = try SourcePin.read("Patina/ContentView.swift")
        #expect(content.contains("isLoading: AuthService.shared.isLoading"))
        let sheet = try SourcePin.read("Patina/Features/Authentication/Views/AuthSheet.swift")
        #expect(sheet.contains("isLoading: AuthService.shared.isLoading"))
    }
}
