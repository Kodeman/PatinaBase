//
//  AnchorMeasurementParser.swift
//  Patina
//
//  PORTED VERBATIM FROM Patina Field:
//    apps/mobile/Capture/CaptureKit/CaptureKit/SiteScan/AnchorMeasurementParser.swift
//
//  Parses a typed tape/laser measurement into integer millimetres.
//  Millimetres-as-integer is the exact storage unit (`scan_anchors.measured_value_mm`)
//  — never a float.
//
//  GRAMMAR (documented, blessable — US users speak feet-inches):
//    "<feet>' <inches>\""   e.g. 12' 3 1/2"   → feet + inches (fraction or decimal)
//    "<feet>'"              e.g. 12'          → whole/decimal feet
//    "<inches>\""           e.g. 42 1/2"      → inches only (no foot mark)
//    "<decimalFeet>"        e.g. 12.5         → a BARE number is DECIMAL FEET
//  inches := "<whole> <n>/<d>" | "<decimal>" | "<n>/<d>" | "<whole>"
//  Conversions: 1 ft = 304.8 mm, 1 in = 25.4 mm. Result rounded to the nearest mm;
//  a non-positive or unparseable value returns nil (the CHECK requires value > 0).
//
//  ⚠ CARRIED FAITHFULLY, FLAGGED AS QUESTIONABLE: a BARE number means DECIMAL FEET,
//  so "96" (a user thinking in inches) parses as 96 ft = 29 260 mm — under the 30 m
//  sanity cap, therefore accepted silently. See the report; not changed here.
//
//  ISOLATION: `nonisolated` — see the note in `KeyframeGate.swift`.
//

import Foundation

nonisolated public enum AnchorMeasurementParser {

    private static let mmPerFoot = 304.8
    private static let mmPerInch = 25.4
    /// Upper sanity bound: a single room span over 30 m is almost certainly a typo
    /// (a missed foot mark, e.g. "120" read as 120 ft). Rejected so the UI can show
    /// a "check the value" hint rather than storing garbage.
    public static let maxReasonableMillimetres = 30_000

    /// Parse to integer millimetres, or nil if unparseable / non-positive / above
    /// `maxReasonableMillimetres`.
    public static func parseMillimetres(_ raw: String) -> Int? {
        // Normalise the quote marks iOS smart-punctuation substitutes for the
        // straight foot/inch marks (’ ” ′ ″ → ' "), so a real keyboard's curly
        // quotes parse the same as straight ones.
        let text = raw
            .replacingOccurrences(of: "\u{2019}", with: "'")   // ’ right single
            .replacingOccurrences(of: "\u{2018}", with: "'")   // ‘ left single
            .replacingOccurrences(of: "\u{2032}", with: "'")   // ′ prime
            .replacingOccurrences(of: "\u{201D}", with: "\"")  // ” right double
            .replacingOccurrences(of: "\u{201C}", with: "\"")  // “ left double
            .replacingOccurrences(of: "\u{2033}", with: "\"")  // ″ double prime
            .trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return nil }

        var feet = 0.0
        var inches = 0.0

        if let footIndex = text.firstIndex(of: "'") {
            let feetPart = text[text.startIndex..<footIndex].trimmingCharacters(in: .whitespaces)
            guard let parsedFeet = Double(feetPart) else { return nil }
            feet = parsedFeet
            let rest = text[text.index(after: footIndex)...]
                .replacingOccurrences(of: "\"", with: "")
                .trimmingCharacters(in: .whitespaces)
            if !rest.isEmpty {
                guard let parsedInches = AnchorMeasurementParser.parseInches(rest) else { return nil }
                inches = parsedInches
            }
        } else if text.contains("\"") {
            let inchPart = text.replacingOccurrences(of: "\"", with: "").trimmingCharacters(in: .whitespaces)
            guard let parsedInches = AnchorMeasurementParser.parseInches(inchPart) else { return nil }
            inches = parsedInches
        } else {
            // A bare number is DECIMAL FEET (see the ⚠ note in the file header).
            guard let parsedFeet = Double(text) else { return nil }
            feet = parsedFeet
        }

        let millimetres = feet * AnchorMeasurementParser.mmPerFoot + inches * AnchorMeasurementParser.mmPerInch
        guard millimetres > 0 else { return nil }
        let rounded = Int(millimetres.rounded())
        guard rounded <= AnchorMeasurementParser.maxReasonableMillimetres else { return nil }
        return rounded
    }

    /// "3 1/2" | "3.5" | "1/2" | "3" → inches (Double), or nil.
    private static func parseInches(_ text: String) -> Double? {
        let parts = text.split(separator: " ", omittingEmptySubsequences: true).map(String.init)
        switch parts.count {
        case 2:
            guard let whole = Double(parts[0]),
                  let fraction = AnchorMeasurementParser.parseFraction(parts[1]) else { return nil }
            return whole + fraction
        case 1:
            return parts[0].contains("/") ? AnchorMeasurementParser.parseFraction(parts[0]) : Double(parts[0])
        default:
            return nil
        }
    }

    /// "1/2" → 0.5, or a plain decimal fallback.
    private static func parseFraction(_ text: String) -> Double? {
        let parts = text.split(separator: "/").map(String.init)
        if parts.count == 2, let numerator = Double(parts[0]), let denominator = Double(parts[1]),
           denominator != 0 {
            return numerator / denominator
        }
        return Double(text)
    }
}
