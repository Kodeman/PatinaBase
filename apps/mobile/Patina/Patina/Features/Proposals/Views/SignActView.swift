//
//  SignActView.swift
//  Patina
//
//  `P-19`. The signature is a full-screen act, not a medium detent over a
//  dimmed document.
//
//  What the detent cost: a contract's restated terms, a consent line, a name
//  field and the act itself, on half a phone, over a page the reader could
//  still half-see and could dismiss with a downward flick. This is the same
//  content with the room to be read, and it is left deliberately rather than
//  swiped away.
//
//  `ProposalSignTerms` is unchanged and is not re-composed here: its contract
//  — "Nothing here is invented. Every line is a value the RPC sent or it is
//  absent" — is the reason the sheet was trustworthy and is kept verbatim.
//  What is NEW above it is one line: the edition, from `version` and `sent_at`
//  as `get_client_proposal_bundle` already returns them (00407:366).
//

import SwiftUI

struct SignActView: View {
    let proposalTitle: String
    /// SP-04: what is being agreed to, restated from the bundle's own fields.
    let terms: ProposalSignTerms
    /// The edition line, or nil where the bundle carried neither a version
    /// nor an issue date.
    let editionLine: String?
    let isSigning: Bool
    let errorMessage: String?
    let onSign: (String) -> Void
    let onCancel: () -> Void

    @State private var signature = ""
    @State private var hasConsented = false
    @Environment(\.dismiss) private var dismiss

    /// C-06: the restated-terms label column. 78 pt at the default text size,
    /// growing with it so "TOTAL" and "EXPIRY" keep a column they fit in.
    @ScaledMetric(relativeTo: .caption) private var labelColumnWidth: CGFloat = 78

    private var trimmedName: String {
        signature.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Parity with the web: the consent is ticked and the name is typed before
    /// the act is offered. The floor is the RPC's own `invalid_name`.
    private var canSign: Bool {
        hasConsented && trimmedName.count >= ProposalSignActCopy.signatureFloor
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 24) {
                heading
                if let editionLine {
                    Text(editionLine)
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.secondary)
                        .accessibilityIdentifier("signAct.edition")
                }
                restatedTerms
                consent
                signatureLine
                if let errorMessage {
                    // `W2R1-n2`. Body ink, not the error ramp. After this wave
                    // took red off every other line a homeowner reads — the
                    // money rail's "Past due · {date}" included — this was the
                    // only red sentence left in the whole ceremony, and it
                    // meets her at the moment she has just tried to sign. The
                    // sentence already says the whole of it; the colour was
                    // only ever raising its voice.
                    Text(errorMessage)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("proposalSign.error")
                }
                HoldToActButton(
                    title: ProposalSignActCopy.signAction,
                    isEnabled: canSign,
                    isBusy: isSigning
                ) {
                    onSign(trimmedName)
                }
                .accessibilityIdentifier("proposalSign.confirm")
                PatinaButton(ProposalSignActCopy.cancel, style: .ghost, isEnabled: !isSigning) {
                    onCancel()
                    dismiss()
                }
            }
            .padding(.horizontal, 28)
            .padding(.top, 40)
            .padding(.bottom, 48)
        }
        .background(PatinaColors.Background.primary)
        // SP-19: the scroll container reaches the status bar on a full-screen
        // cover exactly as it did at the `.large` detent, and a cover carries
        // no coordinator chrome to reserve it — so it reads the shared band
        // directly, as the sheet it replaces did.
        .patinaTopBand()
    }

    private var heading: some View {
        VStack(alignment: .leading, spacing: 8) {
            MonoLabel(text: ProposalSignActCopy.eyebrow)
                .tracking(2)
            Text(proposalTitle)
                .font(PatinaTypography.h2)
                .foregroundStyle(PatinaColors.Text.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// SP-04, unchanged: every row is a field the bundle returned; an absent
    /// field draws nothing.
    @ViewBuilder
    private var restatedTerms: some View {
        let lines = terms.lines
        if !lines.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(lines, id: \.label) { line in
                    HStack(alignment: .top, spacing: 12) {
                        // C-06 / W1-B-10: label and value each hold one line
                        // and tighten rather than splitting — at accessibility
                        // sizes "TOTAL" wrapped inside the word, and then the
                        // money figure did.
                        MonoLabel(text: line.label)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                            .allowsTightening(true)
                            .frame(width: labelColumnWidth, alignment: .leading)
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

    /// Parity with the web's own checkbox and its own sentence. The line is
    /// `consentLineFor`'s fallback branch verbatim — a `proposals` row carries
    /// no commercial-document kind, so that is the branch it lands in.
    private var consent: some View {
        Button {
            hasConsented.toggle()
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Rectangle()
                    .fill(hasConsented ? PatinaColors.Stamp.mocha : Color.clear)
                    .frame(width: 18, height: 18)
                    .overlay {
                        Rectangle()
                            .strokeBorder(PatinaColors.Border.strong, lineWidth: 1)
                    }
                    .padding(.top, 2)
                Text(ProposalSignActCopy.consentLine)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .multilineTextAlignment(.leading)
            }
        }
        .buttonStyle(.plain)
        .frame(minHeight: 44)
        .accessibilityAddTraits(hasConsented ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier("proposalSign.consent")
    }

    /// `P-18`: the typed name on a ruled line, the date beside it.
    private var signatureLine: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                MonoLabel(text: ProposalSignActCopy.signatureLabel)
                Spacer(minLength: 12)
                MonoLabel(text: DateDisplay.long(Date()))
                    .accessibilityIdentifier("proposalSign.date")
            }
            TextField(ProposalSignActCopy.signaturePlaceholder, text: $signature)
                .font(PatinaTypography.h5)
                .foregroundStyle(PatinaColors.Text.primary)
                .textFieldStyle(.plain)
                .textContentType(.name)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
                .padding(.bottom, 6)
                .accessibilityIdentifier("proposalSign.signatureField")
            Rectangle()
                .fill(PatinaColors.Border.strong)
                .frame(height: 1)
            Text(ProposalSignActCopy.signatureNotice)
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

#Preview {
    SignActView(
        proposalTitle: "Living Room Refresh",
        terms: ProposalSignTerms(
            projectName: "Aspen Loft Refresh",
            total: "$100,000.00",
            depositLabel: "Retainer",
            deposit: "$25,000.00",
            terms: "Net 30",
            expiry: "Expires Sep 8"
        ),
        editionLine: "Edition 3 · Issued Sep 2, 2026",
        isSigning: false,
        errorMessage: nil,
        onSign: { _ in },
        onCancel: {}
    )
}
