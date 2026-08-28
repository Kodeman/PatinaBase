//
//  DecisionDeferSheet.swift
//  Patina
//
//  SP-17: "Not yet" and "Neither of these". The client edits the note, sends
//  it into the project thread, and the decision stays `pending`.
//

import SwiftUI

struct DecisionDeferSheet: View {
    let deferral: DecisionDeferral
    let decisionTitle: String?
    let isSending: Bool
    let failure: MoneyFailure?
    let onSend: (String) -> Void
    let onCancel: () -> Void

    @State private var note: String = ""
    @Environment(\.dismiss) private var dismiss

    private var trimmed: String {
        note.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 6) {
                    MonoLabel(text: "TELL YOUR DESIGNER")
                        .tracking(2)
                    Text(deferral.sheetTitle)
                        .font(PatinaTypography.h3)
                        .foregroundStyle(PatinaColors.Text.primary)
                    Text("This goes to your designer as a message. The decision stays open.")
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.secondary)
                }

                TextEditor(text: $note)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 120)
                    .padding(12)
                    .background(PatinaColors.Background.secondary)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .accessibilityIdentifier("decisionDefer.note")

                if let failure {
                    Text(failure.sentence)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.error)
                        .accessibilityIdentifier("decisionDefer.error")
                }

                PatinaButton(
                    "Send",
                    style: .clay,
                    isLoading: isSending,
                    isEnabled: !trimmed.isEmpty && !isSending
                ) {
                    onSend(trimmed)
                }
                .accessibilityIdentifier("decisionDefer.send")

                PatinaButton("Cancel", style: .ghost, isEnabled: !isSending) {
                    onCancel()
                    dismiss()
                }
            }
            .padding(24)
        }
        .background(PatinaColors.Background.primary)
        .patinaTopBand()
        .onAppear {
            if note.isEmpty { note = deferral.draft(decisionTitle: decisionTitle) }
        }
    }
}

#Preview {
    DecisionDeferSheet(
        deferral: .notYet,
        decisionTitle: "Rug color - Natural vs Sand",
        isSending: false,
        failure: nil,
        onSend: { _ in },
        onCancel: {}
    )
}
