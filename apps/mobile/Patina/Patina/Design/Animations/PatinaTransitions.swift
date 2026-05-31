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
                .background(Circle().fill(background))
                .overlay(Circle().stroke(stroke, lineWidth: 0.5))
        }
        .buttonStyle(.plain)
    }

    private var foreground: Color {
        style == .light ? PatinaColors.charcoal : PatinaColors.offWhite
    }
    private var background: Color {
        style == .light ? PatinaColors.offWhite.opacity(0.92) : PatinaColors.offWhite.opacity(0.12)
    }
    private var stroke: Color {
        style == .light ? PatinaColors.pearl : .clear
    }
}
