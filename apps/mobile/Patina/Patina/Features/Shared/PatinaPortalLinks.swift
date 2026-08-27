//
//  PatinaPortalLinks.swift
//  Patina
//
//  Canonical web URLs for sharing app entities.
//
//  SP-03: the piece link used to be `app.patina.cloud/library/<id>` — the
//  DESIGNER portal's Library route — so a homeowner sharing a chair with her
//  husband handed him a sheet titled "Patina Designer Portal". It now points
//  at the client-facing piece route, whose Open Graph title is the piece and
//  its maker, on the host the app claims in `Patina.entitlements`.
//

import Foundation

enum PatinaDeepLinks {

    /// The host the app claims via `applinks:` and the one the client piece
    /// route is served from.
    static let clientHost = "client.patina.cloud"

    /// Web link for a piece by its product id.
    static func piece(_ id: String) -> URL {
        var components = URLComponents()
        components.scheme = "https"
        components.host = clientHost
        components.path = "/piece/\(id)"
        return components.url ?? URL(string: "https://\(clientHost)/piece")!
    }

    /// Source-compatible name kept for the three existing `ShareLink` call
    /// sites (`ProductDetailView`, `RecommendationsView`, `CollectionsView`),
    /// which live in another lane's files.
    static func productURL(forProductId id: String) -> URL {
        piece(id)
    }
}
