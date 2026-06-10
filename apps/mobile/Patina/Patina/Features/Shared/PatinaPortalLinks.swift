//
//  PatinaPortalLinks.swift
//  Patina
//
//  Canonical web URLs for sharing app entities. The product link matches
//  the designer-portal product detail route at
//  `app/(portal)/portal/catalog/[id]` on app.patina.cloud — the same
//  pattern ProductDetailView's ShareLink ships (R25).
//

import Foundation

enum PatinaPortalLinks {

    /// Portal deep link for a piece by its product id.
    static func productURL(forProductId id: String) -> URL {
        var components = URLComponents()
        components.scheme = "https"
        components.host = "app.patina.cloud"
        components.path = "/portal/catalog/\(id)"
        return components.url ?? URL(string: "https://app.patina.cloud/portal/catalog")!
    }
}
