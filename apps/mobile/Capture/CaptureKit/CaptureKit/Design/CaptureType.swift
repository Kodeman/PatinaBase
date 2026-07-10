//  CaptureType.swift
//  CaptureKit
//
//  Typography ramp — Patina brand faces (R33 flip): Playfair Display (display
//  serif), Inter (body), DM Mono (labels). The faces are vendored and
//  registered by PatinaDesignKit's PatinaFonts.registerAll() at launch. Token
//  names, sizes, and `relativeTo:` Dynamic Type anchors are unchanged from the
//  Fraunces/Hanken/Plex era; if a font is missing the custom font silently
//  falls back to the system face.
//  Untokenized Font.custom in Features/ is banned by the SwiftLint ratchet.

import SwiftUI

public enum CaptureType {
    // Family names of the PatinaDesignKit vendored faces (same families
    // PatinaTypography uses; registered process-wide at launch).
    static let serif = "Playfair Display"
    static let sans  = "Inter"
    static let mono  = "DM Mono"

    // Display (Playfair Display)
    public static let display   = Font.custom(serif, size: 32, relativeTo: .largeTitle)
    public static let title     = Font.custom(serif, size: 24, relativeTo: .title)
    public static let title2    = Font.custom(serif, size: 20, relativeTo: .title2)

    // Body (Inter)
    public static let body      = Font.custom(sans, size: 16, relativeTo: .body)
    public static let bodyEmph  = Font.custom(sans, size: 16, relativeTo: .body).weight(.semibold)
    public static let callout   = Font.custom(sans, size: 15, relativeTo: .callout)
    public static let footnote  = Font.custom(sans, size: 13, relativeTo: .footnote)

    // Mono / eyebrow labels (DM Mono)
    public static let eyebrow   = Font.custom(mono, size: 11, relativeTo: .caption2)
    public static let monoSmall = Font.custom(mono, size: 12, relativeTo: .caption)
    public static let monoBody  = Font.custom(mono, size: 14, relativeTo: .subheadline)
}
