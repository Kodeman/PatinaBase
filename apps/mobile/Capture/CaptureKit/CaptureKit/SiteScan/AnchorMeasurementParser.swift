//  AnchorMeasurementParser.swift
//  CaptureKit
//
//  Parses a designer's typed tape/laser measurement into integer millimetres
//  (Field Capture P1 · item 6). Millimetres-as-integer is the exact storage unit
//  (`scan_anchors.measured_value_mm`, R-h) — never a float.
//
//  GRAMMAR (documented, blessable — US designers speak feet-inches):
//    "<feet>' <inches>\""   e.g. 12' 3 1/2"   → feet + inches (fraction or decimal)
//    "<feet>'"              e.g. 12'          → whole/decimal feet
//    "<inches>\""           e.g. 42 1/2"      → inches only (no foot mark)
//    "<decimalFeet>"        e.g. 12.5         → a BARE number is DECIMAL FEET
//  inches := "<whole> <n>/<d>" | "<decimal>" | "<n>/<d>" | "<whole>"
//  Conversions: 1 ft = 304.8 mm, 1 in = 25.4 mm. Result rounded to the nearest mm;
//  a non-positive or unparseable value returns nil (the CHECK requires value > 0).

import Foundation

public enum AnchorMeasurementParser {

    private static let mmPerFoot = 304.8
    private static let mmPerInch = 25.4
    /// Upper sanity bound: a single room span over 30 m is almost certainly a typo
    /// (a missed foot mark, e.g. "120" read as 120 ft). Rejected so the UI can show
    /// a "check the value" hint rather than storing garbage.
    public static let maxReasonableMillimetres = 30_000

    /// Parse to integer millimetres, or nil if unparseable / non-positive.
    public static func parseMillimetres(_ raw: String) -> Int? {
        // Normalise the quote marks iOS smart-punctuation substitutes for the
        // straight foot/inch marks (’ ” ′ ″ → ' "), so a real keyboard's curly
        // quotes parse the same as straight ones.
        let text = raw
            .replacingOccurrences(of: "\u{2019}", with: "'")   // ' right single
            .replacingOccurrences(of: "\u{2018}", with: "'")   // ' left single
            .replacingOccurrences(of: "\u{2032}", with: "'")   // ′ prime
            .replacingOccurrences(of: "\u{201D}", with: "\"")  // " right double
            .replacingOccurrences(of: "\u{201C}", with: "\"")  // " left double
            .replacingOccurrences(of: "\u{2033}", with: "\"")  // ″ double prime
            .trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return nil }

        var feet = 0.0
        var inches = 0.0

        if let footIndex = text.firstIndex(of: "'") {
            let feetPart = text[text.startIndex..<footIndex].trimmingCharacters(in: .whitespaces)
            guard let f = Double(feetPart) else { return nil }
            feet = f
            let rest = text[text.index(after: footIndex)...]
                .replacingOccurrences(of: "\"", with: "")
                .trimmingCharacters(in: .whitespaces)
            if !rest.isEmpty {
                guard let i = parseInches(rest) else { return nil }
                inches = i
            }
        } else if text.contains("\"") {
            let inchPart = text.replacingOccurrences(of: "\"", with: "").trimmingCharacters(in: .whitespaces)
            guard let i = parseInches(inchPart) else { return nil }
            inches = i
        } else {
            guard let f = Double(text) else { return nil }   // bare number ⇒ decimal feet
            feet = f
        }

        let mm = feet * mmPerFoot + inches * mmPerInch
        guard mm > 0 else { return nil }
        let rounded = Int(mm.rounded())
        guard rounded <= maxReasonableMillimetres else { return nil }   // A2: reject > 30 m
        return rounded
    }

    /// "3 1/2" | "3.5" | "1/2" | "3" → inches (Double), or nil.
    private static func parseInches(_ s: String) -> Double? {
        let parts = s.split(separator: " ", omittingEmptySubsequences: true).map(String.init)
        switch parts.count {
        case 2:
            guard let whole = Double(parts[0]), let frac = parseFraction(parts[1]) else { return nil }
            return whole + frac
        case 1:
            return parts[0].contains("/") ? parseFraction(parts[0]) : Double(parts[0])
        default:
            return nil
        }
    }

    /// "1/2" → 0.5, or a plain decimal fallback.
    private static func parseFraction(_ s: String) -> Double? {
        let f = s.split(separator: "/").map(String.init)
        if f.count == 2, let n = Double(f[0]), let d = Double(f[1]), d != 0 { return n / d }
        return Double(s)
    }
}
