//
//  PortalLinkRoutingTests.swift
//  PatinaTests
//
//  SP-03 — the share names Patina, and the link opens the app.
//
//  The most-cited finding in the program (F01 = F183 = F53 = F169): a
//  homeowner sharing a chair handed her husband a sheet titled "Patina
//  Designer Portal" / "app.patina.cloud", because the app shared the DESIGNER
//  portal's Library route — and because it declared no associated domains,
//  the link could only ever open Safari.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct PortalLinkRoutingTests {

    // MARK: - The URL

    @Test("a shared piece URL is the client host, not the designer portal")
    func pieceURLIsTheClientHost() {
        #expect(PatinaDeepLinks.piece("abc-123").absoluteString
            == "https://client.patina.cloud/piece/abc-123")
        #expect(!PatinaDeepLinks.piece("abc-123").absoluteString.contains("app.patina.cloud"))
        #expect(!PatinaDeepLinks.piece("abc-123").absoluteString.contains("/library/"))
    }

    /// The three ShareLink call sites live in another lane's files and still
    /// call `productURL(forProductId:)`; it must keep resolving to the new URL.
    @Test("the existing share call sites are repointed without touching them")
    func productURLDelegatesToPiece() {
        #expect(PatinaDeepLinks.productURL(forProductId: "abc-123") == PatinaDeepLinks.piece("abc-123"))
    }

    // MARK: - The routing table

    @Test("the four client-facing universal-link paths route")
    func universalLinksRoute() throws {
        let uuid = "11111111-1111-1111-1111-111111111111"
        #expect(route("https://client.patina.cloud/piece/abc") == .pieceDetail(pieceId: "abc"))
        #expect(route("https://client.patina.cloud/invoice/\(uuid)") == .invoiceDetail(invoiceId: uuid))
        #expect(route("https://client.patina.cloud/proposal/\(uuid)") == .proposalDetail(proposalId: uuid))
        #expect(route("https://client.patina.cloud/decision/\(uuid)") == .decisionDetail(decisionId: uuid))
    }

    /// The spelling the portal actually serves and 00534 actually writes. The
    /// AASA file publishes `/invoices/*`, `/proposals/*`, `/decisions/*`; a
    /// singular-only matcher would never fire on a real link (d-notes.md §4).
    @Test("the plural money paths the portal serves route")
    func pluralUniversalLinksRoute() throws {
        let uuid = "11111111-1111-1111-1111-111111111111"
        #expect(route("https://client.patina.cloud/invoices/\(uuid)") == .invoiceDetail(invoiceId: uuid))
        #expect(route("https://client.patina.cloud/proposals/\(uuid)") == .proposalDetail(proposalId: uuid))
        #expect(route("https://client.patina.cloud/decisions/\(uuid)") == .decisionDetail(decisionId: uuid))
    }

    /// `app.patina.cloud` is the designer portal — the client app has no
    /// business opening its routes, and no other host may steer navigation.
    @Test("a foreign host is not routed")
    func foreignHostsAreRejected() {
        #expect(route("https://evil.example/piece/abc") == nil)
        #expect(route("https://app.patina.cloud/piece/abc") == nil)
        #expect(route("http://client.patina.cloud/piece/abc") == nil)
    }

    @Test("an unknown or incomplete client path is not routed")
    func malformedClientPathsAreRejected() {
        #expect(route("https://client.patina.cloud/piece") == nil)
        #expect(route("https://client.patina.cloud/") == nil)
        #expect(route("https://client.patina.cloud/order/abc") == nil)
    }

    // MARK: - The entitlement

    @Test("the app claims the client host")
    func entitlementsClaimTheClientHost() throws {
        let plist = try SourcePin.read("Patina/Patina.entitlements")
        #expect(plist.contains("com.apple.developer.associated-domains"))
        #expect(plist.contains("applinks:client.patina.cloud"))
    }

    /// `handle(_:)` guarded on `url.scheme == "patina"` and returned false
    /// before the path switch, so an https link was dropped on arrival.
    @Test("handle consults the universal-link table before the scheme guard")
    func handleAcceptsHTTPSForTheClientHost() throws {
        let source = try SourcePin.read("Patina/App/DeepLinking/DeepLinkHandler.swift")
        let guardIndex = try #require(source.range(of: "guard url.scheme == APIConfiguration.appURLScheme"))
        let tableIndex = try #require(source.range(of: "Self.route(forUniversalLink: url)"))
        #expect(tableIndex.lowerBound < guardIndex.lowerBound)
    }

    // MARK: - Helper

    private func route(_ string: String) -> AppRoute? {
        guard let url = URL(string: string) else { return nil }
        return DeepLinkHandler.route(forUniversalLink: url)
    }
}
