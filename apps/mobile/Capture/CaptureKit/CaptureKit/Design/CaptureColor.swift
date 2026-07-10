//  CaptureColor.swift
//  CaptureKit
//
//  The Patina brand palette (R28 flip). Every token re-points at
//  PatinaDesignKit values; the semantic Background/Text roles are dynamic, so
//  dark mode arrives with them. The legacy names survive as aliases so ~230
//  call sites keep compiling:
//    verdigris family → clay family (actions / brand accent)
//    success / warning / error / goldenHour / terracotta → new semantic tokens
//  brass/rust were retired at the call sites (classified per use, R28).
//  Raw hex is banned outside this file by the SwiftLint token ratchet.

import PatinaDesignKit
import SwiftUI

public enum CaptureColor {
    // MARK: - Brand accent (the flip: verdigris → clay)

    /// Primary actions, links, selection — Patina clay. Reads on both schemes.
    public static let verdigris  = PatinaColors.clay
    /// Deep accent for interactive text/icons — clayDeep in light, clay in dark.
    public static let verdigrisInk = PatinaColors.Text.interactive

    // MARK: - Semantic status (R28 classification targets)

    /// Confirmations, sync-ok, "saved", positive status.
    public static let success = PatinaColors.success
    /// Actual warnings, pending/deferred states, money due.
    public static let warning = PatinaColors.warning
    /// Errors, failures, destructive affordances.
    public static let error = PatinaColors.error
    /// Bright highlight — chrome/AR states, activity, "new" dots.
    public static let goldenHour = PatinaColors.goldenHour
    /// Softer attention — expiring, low-confidence, offline nudges.
    public static let terracotta = PatinaColors.terracotta

    // MARK: - Surfaces (dynamic: light offWhite family / dark warm graphite)

    /// Primary canvas.
    public static let paper = PatinaColors.Background.primary
    /// Recessed surface (was darker paper) — pearl in light, charcoal in dark.
    public static let paper2 = dynamic(light: PatinaColors.pearl,
                                       dark: PatinaColors.charcoal)
    /// Raised card surface.
    public static let paper3 = PatinaColors.Background.secondary

    // MARK: - Ink (dynamic text roles)

    /// Primary text.
    public static let ink = PatinaColors.Text.primary
    /// Secondary text — mocha in light.
    public static let ink2 = PatinaColors.Text.secondary
    /// Muted text, metadata — agedOak in light.
    public static let inkSoft = PatinaColors.Text.muted

    // MARK: - Hairlines (track the primary text color in both schemes)

    public static let line  = PatinaColors.Text.primary.opacity(0.16)
    public static let line2 = PatinaColors.Text.primary.opacity(0.30)

    /// Provenance badge colour for a field's source (V3/C5) — re-skinned:
    /// recognised data reads clay-deep (per the R28 deck mock), a human edit
    /// reads success, manual/import stays muted.
    public static func provenance(_ source: ProvenanceSource) -> Color {
        switch source {
        case .manual, .imported: return inkSoft
        case .ocr, .code, .voice, .measure, .smartGuess: return verdigrisInk
        case .edited: return success
        }
    }

    /// Trait-aware pairing of two PatinaDesignKit values (the package's
    /// `patinaDynamic` is package-internal; this mirrors it without touching
    /// package sources).
    private static func dynamic(light: Color, dark: Color) -> Color {
        Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark ? UIColor(dark) : UIColor(light)
        })
    }
}
