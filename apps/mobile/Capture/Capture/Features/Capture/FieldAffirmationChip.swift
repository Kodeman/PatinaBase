//  FieldAffirmationChip.swift
//  Capture
//
//  FC-R11 / §15.2 item 2. One chip, two surfaces: the C3 quick-confirm card and
//  C6. It is a BUTTON and it GATES the recorder — a line of text she cannot tap
//  affirms nothing. Once tapped it stays tapped for that note and reads back as
//  a statement rather than a control.

import SwiftUI
import CaptureKit

struct FieldAffirmationChip: View {
    let noteSetting: FieldNoteSetting?
    @Binding var affirmed: Bool

    var body: some View {
        if let title = FieldAffirmationPolicy.chipTitle(noteSetting: noteSetting) {
            Button { affirmed = true } label: {
                Label(title, systemImage: affirmed ? "checkmark.circle.fill" : "circle")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.ink)
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .background(CaptureColor.goldenHour, in: Capsule())
            }
            .buttonStyle(.plain)
            .disabled(affirmed)
            .frame(minHeight: 44)
            .accessibilityLabel(title)
            .accessibilityHint(affirmed ? "Affirmed" : "Tap to confirm before recording")
            .accessibilityAddTraits(affirmed ? .isSelected : [])
            .accessibilityIdentifier("voice.affirmation")
        }
    }
}
