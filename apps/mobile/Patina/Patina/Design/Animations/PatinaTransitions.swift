//
//  PatinaTransitions.swift
//  Patina
//
//  Shared animation curves and chrome components used by hero card transitions
//  (home → fullscreen detail). Keeping these centralized ensures every detail
//  view morphs with the same timing for a coherent, polished feel.
//

import SwiftUI

extension Animation {
    /// Spring curve used for card → fullscreen morphs (both open and dismiss).
    static let patinaHero = Animation.spring(response: 0.5, dampingFraction: 0.82, blendDuration: 0)

    /// Chrome (title, buttons, body copy) fade that tracks alongside the hero
    /// morph rather than stuttering in afterward.
    static let patinaChrome = Animation.easeOut(duration: 0.32)
}

/// Upper-left back chevron used consistently across fullscreen detail views.
struct BackChevronButton: View {
    enum Style {
        /// Dark chevron on a light pill — for light-background detail views.
        case light
        /// Light chevron on a translucent dark pill — for dark-background detail views.
        case dark
    }

    let style: Style
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "chevron.left")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(foreground)
                .frame(width: 36, height: 36)
                // A-89: the control floats over a hidden-nav-bar ScrollView,
                // so scrolled content passes directly behind it — the walk
                // caught it cutting "Conversation" and "Due Sep 6" in half
                // with a flat 92%-opaque disc reading as a sticker on the
                // words. A material blurs what passes under it, which is what
                // a scroll-edge bar does and what the disc was pretending to
                // be.
                //
                // The material is `.light`'s alone. A SwiftUI material resolves
                // against the environment's colorScheme, not the backdrop, so
                // in light appearance `.regularMaterial` renders near-white —
                // and under the `.dark` style's 12 %-opacity overlay that left
                // an offWhite chevron on a pale disc over a dark hero
                // (shots/w1-review-l1c/29b-backchevron-crop.png). `.dark` is
                // used where the content behind it is dark in BOTH
                // appearances, so it carries its own opaque ground.
                .background(disc.clipShape(Circle()))
                .overlay(Circle().stroke(stroke, lineWidth: 0.5))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Back")
    }

    private var foreground: Color {
        style == .light ? PatinaColors.charcoal : PatinaColors.offWhite
    }
    @ViewBuilder
    private var disc: some View {
        switch style {
        case .light:
            // A-89's blur: the control floats over a hidden-nav-bar ScrollView,
            // and a flat disc read as a sticker on the words passing behind it.
            Rectangle()
                .fill(.regularMaterial)
                .overlay(PatinaColors.offWhite.opacity(0.92))
        case .dark:
            PatinaColors.charcoal.opacity(0.72)
        }
    }
    private var stroke: Color {
        style == .light ? PatinaColors.Border.hairline : .clear
    }
}
