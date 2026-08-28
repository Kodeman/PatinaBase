//
//  PatinaTab.swift
//  Patina
//
//  The four destinations of the house-first bar (B-1). B-7 (a) splits the two
//  names a tab carries: the label on the bar drops the possessive, while the
//  destination it opens keeps its canonical title verbatim — and because a
//  tab's VoiceOver label cannot be two canonical names at once, the label
//  VoiceOver speaks is the canonical one, in full.
//

import Foundation

/// A destination on the house-first bar. Four, in bar order, with the
/// Companion occupying a fifth slot that is not a tab.
public enum PatinaTab: String, CaseIterable, Hashable, Sendable, Identifiable {
    case today
    case spaces
    case pieces
    case studio

    public var id: String { rawValue }

    /// B-7 (a): the word printed on the bar. Possessive dropped.
    public var title: String {
        switch self {
        case .today: return "Today"
        case .spaces: return "Spaces"
        case .pieces: return "Pieces"
        case .studio: return "Studio"
        }
    }

    /// C4: the canonical name of the destination this tab opens, in full —
    /// and therefore this tab's VoiceOver label. B-7 (c) retires "Daily Room"
    /// in favour of the word already printed on the home screen.
    public var canonicalName: String {
        switch self {
        case .today: return "Today"
        case .spaces: return "Your Spaces"
        case .pieces: return "Browse pieces"
        case .studio: return "Your Studio"
        }
    }

    /// Published for lanes that need a glyph for this destination elsewhere
    /// (a menu row, a widget). The bar itself draws **no icons** — M1 §6 sets
    /// four words in Inter Medium 13 and a Strata mark, nothing else.
    public var systemImage: String {
        switch self {
        case .today: return "sun.horizon"
        case .spaces: return "square.grid.2x2"
        case .pieces: return "sparkles"
        case .studio: return "folder"
        }
    }
}
