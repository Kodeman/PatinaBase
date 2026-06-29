//  CaptureColor.swift
//  CaptureKit
//
//  The field-instrument palette (spec). verdigris = value/success,
//  brass = decision/recognised data, rust = friction/edge.
//  Raw hex is banned outside this file by the SwiftLint token ratchet.

import SwiftUI

public enum CaptureColor {
    public static let verdigris  = Color(hex: 0x3C7C6C)
    public static let verdigris2 = Color(hex: 0x5BA68F)
    public static let verdigrisInk = Color(hex: 0x22463D)
    public static let brass      = Color(hex: 0xA07C38)
    public static let brass2     = Color(hex: 0xC7A052)
    public static let rust       = Color(hex: 0x9A5A3E)
    public static let rust2      = Color(hex: 0xB97A56)

    public static let paper      = Color(hex: 0xE7E5DB)
    public static let paper2     = Color(hex: 0xDEDBCF)
    public static let paper3     = Color(hex: 0xF1EFE7)
    public static let ink        = Color(hex: 0x211E18)
    public static let ink2       = Color(hex: 0x3C382F)
    public static let inkSoft    = Color(hex: 0x6B6555)

    public static let line       = Color(hex: 0x211E18, opacity: 0.16)
    public static let line2      = Color(hex: 0x211E18, opacity: 0.30)

    /// Provenance badge colour for a field's source (V3/C5).
    public static func provenance(_ source: ProvenanceSource) -> Color {
        switch source {
        case .manual, .imported: return inkSoft
        case .ocr, .code, .voice, .measure, .smartGuess: return brass
        case .edited: return verdigris
        }
    }
}
