//
//  BudgetBlocks.swift
//  Patina
//
//  Wave 3 / D.3: the per-project budget blocks — an accepted-proposal card
//  (investment + payment schedule) and an invoices rollup block. Extracted
//  from BudgetView so each view stays under the type-body ceiling. Mirrors the
//  client portal's AcceptedProposalSummary + PaymentScheduleBlock +
//  BudgetInvoiceRow.
//

import SwiftUI

// MARK: - Accepted proposal (investment + signed schedule)

struct BudgetProposalCard: View {
    let proposal: BudgetProposal
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        MonoLabel(text: "Investment")
                        Text(proposal.title)
                            .font(PatinaTypography.bodyMedium)
                            .foregroundStyle(PatinaColors.Text.primary)
                    }
                    Spacer(minLength: 8)
                    Text(PatinaCurrency.format(cents: proposal.totalCents))
                        .font(PatinaTypography.bodyMedium)
                        .foregroundStyle(PatinaColors.Text.primary)
                }

                if let terms = PaymentTermsDisplay.label(for: proposal.paymentTerms) {
                    Text(terms)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                }
                if let notes = proposal.paymentNotes, !notes.isEmpty {
                    Text(notes)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                }

                scheduleBlock
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 24)
        .accessibilityIdentifier("budget.proposal.\(proposal.id)")
    }

    @ViewBuilder
    private var scheduleBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            Rectangle()
                .fill(PatinaColors.pearl)
                .frame(height: 1)
            MonoLabel(text: "Payment schedule")
            if proposal.milestones.isEmpty {
                Text("Payment schedule to be confirmed.")
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
            } else {
                ForEach(proposal.milestones) { milestone in
                    scheduleRow(milestone)
                }
            }
        }
    }

    private func scheduleRow(_ milestone: RemoteProposalMilestone) -> some View {
        let amount = BudgetMath.milestoneAmountCents(milestone, totalCents: proposal.totalCents)
        return HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(milestone.label ?? "Payment")
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.primary)
                if let trigger = milestone.trigger_condition, !trigger.isEmpty {
                    Text(trigger)
                        .font(PatinaTypography.captionSmall)
                        .foregroundStyle(PatinaColors.Text.muted)
                }
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text(PatinaCurrency.formatWholeDollars(cents: amount))
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
                if let percentage = milestone.percentage, percentage > 0 {
                    Text(percentText(percentage))
                        .font(PatinaTypography.captionSmall)
                        .foregroundStyle(PatinaColors.Text.muted)
                }
            }
        }
    }

    private func percentText(_ percentage: Double) -> String {
        let whole = percentage == percentage.rounded()
        return whole ? "\(Int(percentage))%" : String(format: "%.1f%%", percentage)
    }
}

// MARK: - Invoices rollup

struct BudgetInvoicesBlock: View {
    let section: BudgetProjectSection
    let onOpenInvoice: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 0) {
                miniTile("Paid", section.rollup.paidCents, color: PatinaColors.sage)
                miniTile("Outstanding", section.rollup.outstandingCents,
                         color: PatinaColors.Text.interactive)
            }
            .padding(.horizontal, 4)

            VStack(spacing: 0) {
                ForEach(Array(section.invoices.enumerated()), id: \.element.id) { index, invoice in
                    Button { onOpenInvoice(invoice.id) } label: {
                        invoiceRow(invoice)
                    }
                    .buttonStyle(.plain)
                    if index < section.invoices.count - 1 {
                        Rectangle().fill(PatinaColors.pearl).frame(height: 1)
                    }
                }
            }
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        .padding(.horizontal, 24)
    }

    private func miniTile(_ label: String, _ cents: Int, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            MonoLabel(text: label)
            Text(PatinaCurrency.format(cents: cents))
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func invoiceRow(_ invoice: RemoteInvoice) -> some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(invoice.invoice_number ?? "Invoice")
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.primary)
                Text(statusLabel(invoice))
                    .font(PatinaTypography.caption)
                    .foregroundStyle(statusColor(invoice))
            }
            Spacer(minLength: 8)
            Text(amountText(invoice))
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.secondary)
            Image(systemName: "chevron.right")
                .font(PatinaTypography.uiSmall)
                .foregroundStyle(PatinaColors.Text.muted)
        }
        .padding(14)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(invoice.invoice_number ?? "Invoice"), \(statusLabel(invoice))")
    }

    private func amountText(_ invoice: RemoteInvoice) -> String {
        let cents = invoice.isPartiallyPaid ? invoice.balanceCents : (invoice.total_cents ?? 0)
        return PatinaCurrency.format(cents: cents, currencyCode: invoice.currencyCode)
    }

    private func isOverdue(_ invoice: RemoteInvoice) -> Bool {
        guard invoice.status == "sent" || invoice.status == "partially_paid",
              let due = invoice.due_date,
              let date = DateDisplayParsing.date(fromDateString: due) else { return false }
        return date < Date()
    }

    private func statusLabel(_ invoice: RemoteInvoice) -> String {
        if isOverdue(invoice) { return "Past due" }
        switch invoice.status {
        case "sent": return "Awaiting payment"
        case "partially_paid": return "Partially paid"
        case "paid": return "Paid"
        default: return invoice.status?.capitalized ?? "Invoice"
        }
    }

    private func statusColor(_ invoice: RemoteInvoice) -> Color {
        if isOverdue(invoice) { return PatinaColors.Text.interactive }
        return PatinaColors.Text.muted
    }
}

// MARK: - Local date parsing

/// Parse a Postgres bare `date` string ("2026-04-01") to a `Date` for overdue
/// comparison. Kept tiny + local so BudgetBlocks doesn't reach into unrelated
/// display helpers.
enum DateDisplayParsing {
    static func date(fromDateString raw: String) -> Date? {
        let parser = DateFormatter()
        parser.dateFormat = "yyyy-MM-dd"
        parser.locale = Locale(identifier: "en_US_POSIX")
        // Pin to end-of-day so an invoice isn't "past due" on its due date.
        return parser.date(from: String(raw.prefix(10)))?
            .addingTimeInterval(24 * 60 * 60 - 1)
    }
}
