//  CaptureType.swift
//  CaptureKit
//
//  Typography ramp — Fraunces (display serif), Hanken Grotesk (body),
//  IBM Plex Mono (labels). Vendored TTFs registered by CaptureFonts. Each token
//  is `relativeTo:` a text style so Dynamic Type works; if a vendored font is
//  missing the custom font silently falls back to the system face.
//  Untokenized Font.custom in Features/ is banned by the SwiftLint ratchet.

import SwiftUI

public enum CaptureType {
    // Family names (PostScript family of the vendored faces).
    static let serif = "Fraunces"
    static let sans  = "Hanken Grotesk"
    static let mono  = "IBM Plex Mono"

    // Display (Fraunces)
    public static let display   = Font.custom(serif, size: 32, relativeTo: .largeTitle)
    public static let title     = Font.custom(serif, size: 24, relativeTo: .title)
    public static let title2    = Font.custom(serif, size: 20, relativeTo: .title2)

    // Body (Hanken Grotesk)
    public static let body      = Font.custom(sans, size: 16, relativeTo: .body)
    public static let bodyEmph  = Font.custom(sans, size: 16, relativeTo: .body).weight(.semibold)
    public static let callout   = Font.custom(sans, size: 15, relativeTo: .callout)
    public static let footnote  = Font.custom(sans, size: 13, relativeTo: .footnote)

    // Mono / eyebrow labels (IBM Plex Mono)
    public static let eyebrow   = Font.custom(mono, size: 11, relativeTo: .caption2)
    public static let monoSmall = Font.custom(mono, size: 12, relativeTo: .caption)
    public static let monoBody  = Font.custom(mono, size: 14, relativeTo: .subheadline)
}
