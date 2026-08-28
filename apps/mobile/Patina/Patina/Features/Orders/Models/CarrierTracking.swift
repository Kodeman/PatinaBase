//
//  CarrierTracking.swift
//  Patina
//
//  `Track with the carrier →`, resolved client-side.
//
//  M8's data sheet is explicit: "resolves `carrier` + `tracking` through a
//  client-side carrier→URL template map (no `tracking_url` column exists, and
//  none is added)". Verified: `fulfillment_shipments` (00350:160-176) carries
//  `carrier` and `tracking` and no URL.
//
//  A carrier the map does not know resolves to nil, and the row does not draw.
//  Guessing a tracking URL is how a homeowner lands on a 404 with her sofa's
//  number in the address bar.
//

import Foundation

enum CarrierTracking {

    /// The carriers whose public tracking URL is a stable, documented template.
    /// Keys are normalised (lower-cased, non-alphanumerics stripped) so
    /// "UPS Freight", "ups-freight" and "upsfreight" all land on one row.
    private static let templates: [String: String] = [
        "ups": "https://www.ups.com/track?tracknum=%@",
        "upsfreight": "https://www.ups.com/track?tracknum=%@",
        "fedex": "https://www.fedex.com/fedextrack/?trknbr=%@",
        "fedexfreight": "https://www.fedex.com/fedextrack/?trknbr=%@",
        "usps": "https://tools.usps.com/go/TrackConfirmAction?tLabels=%@",
        "dhl": "https://www.dhl.com/en/express/tracking.html?AWB=%@",
        "estes": "https://www.estes-express.com/myestes/shipment-tracking/?searchValue=%@",
        "xpo": "https://www.xpo.com/tracking/?reference=%@",
        "olddominion": "https://www.odfl.com/us/en/tracking.html?pro=%@",
        "odfl": "https://www.odfl.com/us/en/tracking.html?pro=%@",
        "saia": "https://www.saia.com/track/details?pro=%@",
        "rlcarriers": "https://www.rlcarriers.com/shipping/tracking?pro=%@",
    ]

    static func normalise(_ carrier: String) -> String {
        carrier.lowercased().filter { $0.isLetter || $0.isNumber }
    }

    /// The public tracking page for this carrier and number, or nil when the
    /// map does not know the carrier, the number is blank, or the composed
    /// string is not a URL.
    static func url(carrier: String?, tracking: String?) -> URL? {
        guard let carrier, let tracking else { return nil }
        let number = tracking.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !number.isEmpty,
              let template = templates[normalise(carrier)],
              let encoded = number.addingPercentEncoding(
                  withAllowedCharacters: .urlQueryAllowed
              )
        else { return nil }
        return URL(string: String(format: template, encoded))
    }

    /// The row's own label. The carrier is named where it is known, because
    /// "Track with UPS" tells the reader where the tap is about to take her.
    static func label(carrier: String?) -> String {
        guard let carrier, !carrier.isEmpty else { return "Track with the carrier" }
        return "Track with \(carrier)"
    }
}
