//
//  PhaseDisplay.swift
//  Patina
//
//  Human-readable project phase + status vocabulary (UX master plan R16).
//
//  Swift port of the canonical web vocabulary in
//  `packages/types/src/phase-config.ts` — keep the two in sync. Raw slugs
//  like `design_development` must never reach the UI; route every phase or
//  status render through these helpers.
//

import Foundation

public enum PhaseDisplay {

    public enum Slug: String, CaseIterable {
        case consultation
        case conceptDevelopment = "concept_development"
        case designRefinement = "design_refinement"
        case procurement
        case installation
        case finalWalkthrough = "final_walkthrough"
    }

    /// Legacy / simplified phase keys mapped to their canonical slug
    /// (mirrors PHASE_SLUG_ALIASES in phase-config.ts).
    private static let aliases: [String: Slug] = [
        "concept": .conceptDevelopment,
        "schematic": .conceptDevelopment,
        "schematic_design": .conceptDevelopment,
        "design": .designRefinement,
        "design_development": .designRefinement,
        "procure": .procurement,
        "install": .installation,
        "completion": .finalWalkthrough,
        "handover": .finalWalkthrough,
        "walkthrough": .finalWalkthrough,
        "final": .finalWalkthrough,
    ]

    private struct Config {
        let label: String
        let shortLabel: String
        let clientLabel: String
    }

    private static let configs: [Slug: Config] = [
        .consultation: Config(
            label: "Programming & Consultation", shortLabel: "Consult", clientLabel: "Discovery"),
        .conceptDevelopment: Config(
            label: "Schematic Design", shortLabel: "Schematic", clientLabel: "Design"),
        .designRefinement: Config(
            label: "Design Development", shortLabel: "Design Dev", clientLabel: "Design Refinement"),
        .procurement: Config(
            label: "Procurement & Order Management", shortLabel: "Procurement", clientLabel: "Procurement"),
        .installation: Config(
            label: "Installation & Styling", shortLabel: "Install", clientLabel: "Installation"),
        .finalWalkthrough: Config(
            label: "Completion & Handover", shortLabel: "Completion", clientLabel: "Completion"),
    ]

    /// Normalize any phase string to a canonical slug. Always succeeds
    /// (falls back to `.consultation`) so lookups can never miss — same
    /// contract as the web's `normalizePhaseSlug`.
    public static func normalize(_ value: String?) -> Slug {
        guard let value, !value.isEmpty else { return .consultation }
        let v = value.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        if let slug = Slug(rawValue: v) { return slug }
        if let slug = aliases[v] { return slug }
        for (slug, config) in configs {
            if config.label.lowercased() == v
                || config.shortLabel.lowercased() == v
                || config.clientLabel.lowercased() == v {
                return slug
            }
        }
        return .consultation
    }

    /// Designer-facing display label, e.g. "Design Development".
    public static func label(for value: String?) -> String {
        configs[normalize(value)]!.label
    }

    /// Compact label for dense rows, e.g. "Design Dev".
    public static func shortLabel(for value: String?) -> String {
        configs[normalize(value)]!.shortLabel
    }

    /// Client-facing label, e.g. "Design Refinement".
    public static func clientLabel(for value: String?) -> String {
        configs[normalize(value)]!.clientLabel
    }

    /// Human label for a phase/milestone status value
    /// (pending → Upcoming, in_progress → In Progress, …).
    public static func statusLabel(for value: String?) -> String {
        switch value?.lowercased().trimmingCharacters(in: .whitespacesAndNewlines) {
        case "in_progress", "active": return "In Progress"
        case "completed", "complete": return "Completed"
        case "pending": return "Upcoming"
        case "delayed": return "Delayed"
        case "blocked": return "Blocked"
        case "paused": return "Paused"
        case .some(let other) where !other.isEmpty:
            return other.replacingOccurrences(of: "_", with: " ").capitalized
        default:
            return "—"
        }
    }
}
