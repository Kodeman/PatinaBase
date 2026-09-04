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
    /// SP-04: what is being agreed to, restated from the bundle's own fields.
    let terms: ProposalSignTerms
    let isSigning: Bool
    let errorMessage: String?
    let onSign: (String) -> Void
    let onCancel: () -> Void

    @State private var signature = ""
    @Environment(\.dismiss) private var dismiss

    /// C-06: the restated-terms label column. 78 pt at the default text size,
    /// growing with it so "TOTAL" and "EXPIRY" keep a column they fit in.
    @ScaledMetric(relativeTo: .caption) private var labelColumnWidth: CGFloat = 78

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
                }

                restatedTerms

                Text("Type your full name to e-sign. Signing confirms the scope and kicks off your project.")
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.secondary)

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
                        .foregroundStyle(PatinaColors.Text.error)
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
        .patinaTopBand()
    }

    /// SP-04: what is being agreed to, above the name field. Every row is a
    /// field the bundle returned; an absent field draws nothing.
    @ViewBuilder
    private var restatedTerms: some View {
        let lines = terms.lines
        if !lines.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(lines, id: \.label) { line in
                    HStack(alignment: .top, spacing: 12) {
                        // C-06: a hard 78 pt column. At accessibility-extra-
                        // large "TOTAL" and "EXPIRY" no longer fit it and the
                        // label wrapped INSIDE the word — "TOTA / L", "EXPI /
                        // RY" — on the sheet a client signs a contract from.
                        // The column grows with the type ramp, and the label
                        // holds one line and tightens rather than splitting.
                        MonoLabel(text: line.label)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                            .allowsTightening(true)
                            .frame(width: labelColumnWidth, alignment: .leading)
                        // W1-B-10: `C-06`'s label fix took and the VALUE broke
                        // instead — at accessibility-extra-large TOTAL read
                        // "$18,500 / .00", a contract's money figure split
                        // after the thousands group. Same treatment as the
                        // label: one line, tightened, scaled, never split.
                        Text(line.value)
                            .font(PatinaTypography.bodySmallMedium)
                            .foregroundStyle(PatinaColors.Text.primary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                            .allowsTightening(true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .accessibilityIdentifier("proposalSign.terms")
        }
    }
}

#Preview {
    ProposalSignSheet(
        proposalTitle: "Living Room Refresh",
        terms: ProposalSignTerms(
            projectName: "Aspen Loft Refresh",
            total: "$100,000.00",
            depositLabel: "Retainer",
            deposit: "$25,000.00",
            terms: "Net 30",
            expiry: "Expires Sep 8"
        ),
        isSigning: false,
        errorMessage: nil,
        onSign: { _ in },
        onCancel: {}
    )
}
