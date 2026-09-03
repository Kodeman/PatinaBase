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

            }
            .padding(24)
        }
        .background(PatinaColors.Background.primary)
        .patinaTopBand()
        // GAP1B-02: at AX-XL the visible sheet ended inside the note editor,
        // Send was a clipped sliver at the sheet's bottom edge and Cancel was
        // not on screen at all — the client could not send the message the
        // sheet exists to send. The pair is pinned instead.
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 12) {
                PatinaButton(
                    "Send",
                    style: .clay,
                    isLoading: isSending,
                    isEnabled: !trimmed.isEmpty && !isSending
                ) {
                    onSend(trimmed)
                }
                .accessibilityIdentifier("decisionDefer.send")

                // GAP1B-07, as on the consent sheet.
                PatinaButton("Cancel", style: .secondary, isEnabled: !isSending) {
                    onCancel()
                    dismiss()
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 12)
            .padding(.bottom, 16)
            .background(PatinaColors.Background.primary)
        }
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
