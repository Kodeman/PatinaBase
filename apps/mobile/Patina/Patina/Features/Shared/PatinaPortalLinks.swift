//
//  PatinaPortalLinks.swift
//  Patina
//
//  Canonical web URLs for sharing app entities. The product link matches
//  the Library piece route at `app/(document)/library/[id]` on
//  app.patina.cloud — the same pattern ProductDetailView's ShareLink
//  ships (R25). Repointed off the dissolved `/portal/catalog/[id]` in R21.
//

import Foundation

enum PatinaDeepLinks {

    /// Web deep link for a piece by its product id — the Library piece.
    static func productURL(forProductId id: String) -> URL {
        var components = URLComponents()
        components.scheme = "https"
        components.host = "app.patina.cloud"
        components.path = "/library/\(id)"
        return components.url ?? URL(string: "https://app.patina.cloud/library")!
    }
}
