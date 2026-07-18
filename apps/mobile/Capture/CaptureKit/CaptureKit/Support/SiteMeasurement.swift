//  SiteMeasurement.swift
//  CaptureKit
//
//  K-01 conversion utilities. Storage is integer millimetres; imperial entry is
//  quantized to the nearest sixteenth of an inch before conversion.

import Foundation

public enum SiteMeasurementUnit: String, Codable, Sendable {
    case imperial
    case metric
}

public enum SiteMeasurementError: Error, Equatable, Sendable {
    case empty
    case invalidFormat
    case negative
}

public enum SiteMeasurement {
    public static func millimetres(fromImperial text: String) throws -> Int {
        let trimmed = text
            .lowercased()
            .replacingOccurrences(of: "inches", with: "")
            .replacingOccurrences(of: "inch", with: "")
            .replacingOccurrences(of: "in", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw SiteMeasurementError.empty }

        let normalized = replaceUnicodeFractions(trimmed)
        let tokens = normalized.split(whereSeparator: { $0.isWhitespace }).map(String.init)
        var inches = 0.0
        for token in tokens {
            if token.contains("/") {
                let parts = token.split(separator: "/")
                guard parts.count == 2, let numerator = Double(parts[0]),
                      let denominator = Double(parts[1]), denominator > 0 else {
                    throw SiteMeasurementError.invalidFormat
                }
                inches += numerator / denominator
            } else if let value = Double(token) {
                inches += value
            } else {
                throw SiteMeasurementError.invalidFormat
            }
        }
        guard inches >= 0 else { throw SiteMeasurementError.negative }
        let sixteenths = (inches * 16).rounded()
        return Int((sixteenths / 16 * 25.4).rounded())
    }

    public static func millimetres(fromMetric text: String) throws -> Int {
        let normalized = text.lowercased()
            .replacingOccurrences(of: "millimetres", with: "")
            .replacingOccurrences(of: "millimeters", with: "")
            .replacingOccurrences(of: "mm", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { throw SiteMeasurementError.empty }
        guard let value = Double(normalized) else { throw SiteMeasurementError.invalidFormat }
        guard value >= 0 else { throw SiteMeasurementError.negative }
        return Int(value.rounded())
    }

    public static func imperialString(millimetres: Int) -> String {
        let sixteenths = Int((Double(millimetres) / 25.4 * 16).rounded())
        let whole = sixteenths / 16
        let remainder = sixteenths % 16
        guard remainder != 0 else { return "\(whole) in" }
        let divisor = greatestCommonDivisor(remainder, 16)
        return "\(whole) \(remainder / divisor)/\(16 / divisor) in"
    }

    private static func replaceUnicodeFractions(_ value: String) -> String {
        let map: [Character: String] = [
            "⅛": "1/8", "¼": "1/4", "⅜": "3/8", "½": "1/2",
            "⅝": "5/8", "¾": "3/4", "⅞": "7/8"
        ]
        var result = ""
        for character in value {
            if let fraction = map[character] {
                if result.last.map({ !$0.isWhitespace }) == true { result.append(" ") }
                result.append(fraction)
            } else {
                result.append(character)
            }
        }
        return result
    }

    private static func greatestCommonDivisor(_ lhs: Int, _ rhs: Int) -> Int {
        var a = lhs
        var b = rhs
        while b != 0 { (a, b) = (b, a % b) }
        return max(1, a)
    }
}
