//
//  WhisperBarView.swift
//  Patina
//
//  The Quiet Conversation's signature UI element — a single-line italic
//  guide bar that sits anchored to the bottom of the scan view.
//
//  Replaces progress ribbons, coaching overlays, percentage indicators,
//  and state labels with one warm sentence in Playfair Display italic.
//
//  Per PRD §1.4 and §4.1.
//

import SwiftUI

struct WhisperBarView: View {

    let state: WhisperState

    /// When true, disables animated transitions (Reduce Motion).
    var reduceMotion: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(state.text)
                .font(.custom("PlayfairDisplay-Italic", size: 17))
                .foregroundStyle(PatinaColors.charcoal)
                .id(state.text)
                .transition(.opacity)

            Text(state.subtext)
                .font(.custom("DMMono-Regular", size: 10))
                .tracking(0.6)
                .textCase(.uppercase)
                .foregroundStyle(PatinaColors.clay)
                .id(state.subtext)
                .transition(.opacity)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.top, 20)
        .padding(.bottom, 38) // above home indicator
        .background(
            PatinaColors.offWhite
                .opacity(0.95)
                .background(.ultraThinMaterial)
        )
        .clipShape(
            UnevenRoundedRectangle(
                topLeadingRadius: 24,
                bottomLeadingRadius: 0,
                bottomTrailingRadius: 0,
                topTrailingRadius: 24
            )
        )
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.4), value: state.text)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.4), value: state.subtext)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text("\(state.text). \(state.subtext)"))
    }
}

// MARK: - Preview

#Preview("Whisper Bar - All Bands") {
    VStack(spacing: 0) {
        Spacer()
        WhisperBarView(state: WhisperState.forProgress(0))
        WhisperBarView(state: WhisperState.forProgress(0.2))
        WhisperBarView(state: WhisperState.forProgress(0.5))
        WhisperBarView(state: WhisperState.forProgress(0.75))
        WhisperBarView(state: WhisperState.forProgress(0.92))
        WhisperBarView(state: WhisperState.forProgress(1.0))
    }
    .background(Color.black)
}
