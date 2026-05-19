//
//  HelpInfoIcon.swift
//  Patina
//
//  iOS SwiftUI native equivalent of the web `<InfoIcon />` reactive-layer
//  component (spec §4.2). A small "?" glyph that opens a Sanity-backed
//  popover tooltip on tap.
//
//  Sprint 2 · Stream G5 — Reactive layer iOS components.
//
//  Composition note
//  ----------------
//  `HelpInfoIcon` is a thin compositional wrapper over `HelpTooltip` — it
//  supplies the canonical SF Symbol trigger (`questionmark.circle`) and a
//  VoiceOver label, then delegates everything else (CMS lookup, popover
//  presentation, analytics) to `HelpTooltip`. This mirrors the web pattern
//  where `<InfoIcon />` is the affordance and `<Tooltip />` is the wrapper.
//
//  Accessibility (spec §11):
//   - Trigger has `accessibilityLabel("More information")` so VoiceOver
//     announces the affordance correctly.
//   - The icon uses SF Symbols (`questionmark.circle`) so the glyph scales
//     with Dynamic Type when `.font(.body)`-sized.
//   - The popover content (in `HelpTooltip`) uses `.font(.body)` so the
//     body copy also respects Dynamic Type.
//

import SwiftUI

/// A 14pt "?" glyph that opens a CMS-backed help tooltip on tap. The
/// canonical Patina affordance for general "what does this mean?"
/// contextual help on iOS.
///
/// ```swift
/// HelpInfoIcon(surfaceKey: SurfaceKeys.DesignerPortal.Aesthete.score)
/// ```
public struct HelpInfoIcon: View {

    // MARK: - Inputs

    /// Surface key from `SurfaceKeys.*`.
    private let surfaceKey: SurfaceKey

    /// Optional inline fallback body for CMS misses.
    private let fallback: String?

    /// Persona override for CMS lookup; forwarded to `HelpTooltip`.
    private let persona: Persona?

    /// Glyph size in points. Spec §4.2 calls for 14pt.
    private let size: CGFloat

    /// VoiceOver label for the trigger. Defaults to "More information"
    /// per spec §4.2 / §11.
    private let accessibilityLabel: String

    // MARK: - Init

    /// Creates an info-icon affordance backed by a CMS tooltip.
    /// - Parameters:
    ///   - surfaceKey: Surface key from `SurfaceKeys.*`.
    ///   - fallback:   Optional inline body for CMS misses.
    ///   - persona:    Persona for CMS lookup; `nil` queries persona-agnostic content.
    ///   - size:       Glyph size in points (default 14, per spec §4.2).
    ///   - accessibilityLabel: VoiceOver label for the trigger.
    public init(
        surfaceKey: SurfaceKey,
        fallback: String? = nil,
        persona: Persona? = nil,
        size: CGFloat = 14,
        accessibilityLabel: String = "More information"
    ) {
        self.surfaceKey = surfaceKey
        self.fallback = fallback
        self.persona = persona
        self.size = size
        self.accessibilityLabel = accessibilityLabel
    }

    // MARK: - View

    public var body: some View {
        HelpTooltip(
            surfaceKey: surfaceKey,
            fallback: fallback,
            persona: persona
        ) {
            // SF Symbol glyph — scales with Dynamic Type through `.font`,
            // and tints with `.secondary` so it sits comfortably next to
            // body text without dominating the visual hierarchy.
            Image(systemName: "questionmark.circle")
                .font(.system(size: size))
                .foregroundStyle(.secondary)
                // 44x44 minimum hit region (HIG) — the visual glyph stays
                // 14pt, but the tap target is comfortably finger-sized.
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
                .accessibilityLabel(accessibilityLabel)
                .accessibilityHint("Shows additional information.")
                .accessibilityAddTraits(.isButton)
        }
    }
}
