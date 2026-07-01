//  DataScannerCodeService.swift
//  Capture
//
//  N2 — barcode/QR payload parsing. The live capture is done by
//  DataScannerViewController (see DataScannerView, device-only); this value type
//  turns whatever it reads into a typed ScannedCode and offers a *local* catalog
//  stub. No network is invented here — a real catalog lookup is a later seam.

import Foundation
import CaptureKit

public struct DataScannerCodeService: CodeScanService {
    public init() {}

    public func parse(_ payload: String, symbology: String) -> ScannedCode {
        let trimmed = payload.trimmingCharacters(in: .whitespacesAndNewlines)
        if let url = URL(string: trimmed), trimmed.lowercased().hasPrefix("http") {
            return ScannedCode(payload: trimmed, symbology: symbology, kind: .url(url))
        }
        let digits = trimmed.filter(\.isNumber)
        if !digits.isEmpty, digits.count == trimmed.count, (digits.count == 8 || digits.count == 12 || digits.count == 13 || digits.count == 14) {
            return ScannedCode(payload: trimmed, symbology: symbology, kind: .gtin(digits))
        }
        return ScannedCode(payload: trimmed, symbology: symbology, kind: .text(trimmed))
    }

    /// Local-only "catalog match" stand-in (NO network). Returns a friendly title
    /// for a couple of sample codes so the N2 match card has something to show in
    /// the simulator; otherwise nil → the code is kept on the record as a reference.
    public func catalogTitle(for code: ScannedCode) -> String? {
        switch code.kind {
        case .gtin(let g):
            return Self.sampleCatalog[g]
        case .url:
            return "Linked catalog item"
        case .text:
            return nil
        }
    }

    private static let sampleCatalog: [String: String] = [
        "841197022134": "Faro Side Table",
        "00841197022134": "Faro Side Table"
    ]
}
