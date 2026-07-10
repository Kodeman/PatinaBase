//
//  ProposalSignSheet.swift
//  Patina
//
//  E-signature sheet for a proposal (Wave 2 / D.1). The client types their
//  full legal name (min 2 chars, matching the sign_proposal RPC guard and the
//  portal route's invalid_name check) and taps Sign; the caller runs the
//  atomic sign_proposal RPC. Mirrors DecisionConsentSheet's idioms.
//

import SwiftUI

struct ProposalSignSheet: View {
    let proposalTitle: String
    let isSigning: Bool
    let errorMessage: String?
    let onSign: (String) -> Void
    let onCancel: () -> Void

    @State private var signature = ""
    @Environment(\.dismiss) private var dismiss

    private var trimmedName: String {
        signature.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canSign: Bool {
        trimmedName.count >= 2
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 6) {
                    MonoLabel(text: "SIGN PROPOSAL")
                        .tracking(2)
                    Text(proposalTitle)
                        .font(PatinaTypography.h3)
                        .foregroundStyle(PatinaColors.Text.primary)
                    Text("Type your full name to e-sign. Signing confirms the scope and kicks off your project.")
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.secondary)
                }

                PatinaTextField(
                    "Full name",
                    text: $signature,
                    label: "Signature",
                    icon: "signature",
                    textContentType: .name,
                    autocapitalization: .words
                )
                .accessibilityIdentifier("proposalSign.signatureField")

                if let errorMessage {
                    Text(errorMessage)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.error)
                        .accessibilityIdentifier("proposalSign.error")
                }

                PatinaButton(
                    "Sign proposal",
                    style: .clay,
                    isLoading: isSigning,
                    isEnabled: canSign && !isSigning
                ) {
                    onSign(trimmedName)
                }
                .accessibilityIdentifier("proposalSign.confirm")

                PatinaButton("Cancel", style: .ghost, isEnabled: !isSigning) {
                    onCancel()
                    dismiss()
                }
            }
            .padding(24)
        }
        .background(PatinaColors.Background.primary)
    }
}

#Preview {
    ProposalSignSheet(
        proposalTitle: "Living Room Refresh",
        isSigning: false,
        errorMessage: nil,
        onSign: { _ in },
        onCancel: {}
    )
}
