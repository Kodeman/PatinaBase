//
//  LegalLinkTests.swift
//  PatinaTests
//
//  C1-30 / C5-04 — "Terms of Service" and "Privacy Policy" opened the same
//  page. Both constants were `https://patina.cloud/terms`, byte-identical, and
//  the comment conceded it. `/privacy` exists and returns
//  `<title>Privacy Policy | Patina</title>` (network-verified in the audit).
//  This is the one legal claim the first screen makes, on the consent line
//  directly under the sign-in buttons — it made two promises and honoured one.
//

import Foundation
import Testing
@testable import Patina

struct LegalLinkTests {

    @Test("Privacy resolves to /privacy")
    func privacyPointsAtPrivacy() {
        #expect(AuthScreenView.privacyURL.absoluteString == "https://patina.cloud/privacy")
    }

    @Test("Terms resolves to /terms")
    func termsPointsAtTerms() {
        #expect(AuthScreenView.termsURL.absoluteString == "https://patina.cloud/terms")
    }

    @Test("they are never the same URL")
    func theTwoLinksAreDistinct() {
        #expect(AuthScreenView.termsURL != AuthScreenView.privacyURL)
    }

    @Test("both links are rendered, each with its own identifier")
    func bothLinksAreOnTheScreen() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthScreenView.swift")
        #expect(source.contains("Button(\"Terms of Service\")"))
        #expect(source.contains("Button(\"Privacy Policy\")"))
        #expect(source.contains("IdentifiableURL(url: Self.termsURL)"))
        #expect(source.contains("IdentifiableURL(url: Self.privacyURL)"))
        #expect(source.contains("auth.welcome.termsLink"))
        #expect(source.contains("auth.welcome.privacyLink"))
    }

    /// `W1-A-04` — both links were `Link(destination:)`, which on iOS opens the
    /// SYSTEM Safari app: tapping Privacy Policy on the Welcome screen replaced
    /// Patina with Safari and left a "◀ Patina" breadcrumb, mid-sign-up. The
    /// reader who checks the terms before creating an account must not have to
    /// leave the screen they are reading to do it.
    @Test("neither legal link ejects the reader into the system browser")
    func theLegalPagesOpenInApp() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthScreenView.swift")
        #expect(!source.contains("Link(\"Terms of Service\""))
        #expect(!source.contains("Link(\"Privacy Policy\""))
        #expect(source.contains("SafariView(url: page.url)"),
                "the legal pages no longer open in an in-app browser (W1-A-04)")
        #expect(source.contains(".sheet(item: $legalPage)"))
    }

    /// GAP1B-08 (L1-C's row, landing on this lane's file — note A-L1C-1). All
    /// six auth text links measured 14.67–17.0 pt against Apple's 44 pt floor,
    /// and they are the first controls a TestFlight tester meets.
    @Test("every text link on the Welcome screen has a 44 pt hit area")
    func welcomeLinksMeetTheTapTarget() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthScreenView.swift")
        for anchor in ["private var termsLink: some View {",
                       "private var privacyLink: some View {",
                       "private var passwordFallback: some View {"] {
            let start = try #require(source.range(of: anchor))
            let block = String(source[start.lowerBound...].prefix(800))
            #expect(block.contains(".frame(minHeight: 44)"), "\(anchor) has no 44 pt hit area")
            #expect(block.contains(".contentShape(Rectangle())"), "\(anchor) has no hit shape")
        }
    }

    @Test("and every text link on the Sign In sheet")
    func signInSheetLinksMeetTheTapTarget() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/Views/AuthenticationView.swift")
        let start = try #require(source.range(of: "private var modeSwitcher: some View {"))
        let end = try #require(source.range(of: "// MARK: - Filled button"))
        let switcher = String(source[start.lowerBound..<end.lowerBound])

        // Four bare-Text links live here: Forgot password? · Email me a code ·
        // Use a password instead · Sign up/Sign in.
        let links = switcher.components(separatedBy: "Button(").count - 1
        let framed = switcher.components(separatedBy: ".frame(minHeight: 44)").count - 1
        #expect(links == 4)
        #expect(framed == links, "a mode-switcher link is under 44 pt (GAP1B-08)")
        #expect(switcher.components(separatedBy: ".contentShape(Rectangle())").count - 1 == links)
    }
}
