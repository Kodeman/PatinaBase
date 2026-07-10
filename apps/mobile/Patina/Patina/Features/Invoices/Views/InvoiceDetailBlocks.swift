//
//  InvoiceDetailBlocks.swift
//  Patina
//
//  Line-items and payments blocks for InvoiceDetailView (Wave 2 / D.2).
//  Typography-first, tokens only. Field sets mirror the client portal's
//  invoice detail page.
//

import SwiftUI

// MARK: - Line items + totals

struct InvoiceLineItemsBlock: View {
    let invoice: RemoteInvoice

    private var lines: [RemoteInvoiceLineItem] {
        (invoice.line_items ?? []).sorted { ($0.sort_order ?? 0) < ($1.sort_order ?? 0) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            MonoLabel(text: "What's included")
                .padding(.horizontal, 24)
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(lines.enumerated()), id: \.element.id) { index, line in
                    row(line)
                    if index < lines.count - 1 { divider }
                }
                totalsBlock
            }
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .padding(.horizontal, 24)
        }
    }

    private func row(_ line: RemoteInvoiceLineItem) -> some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(line.description ?? "")
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.primary)
                if line.kind == "time" {
                    Text("Design time logged by your designer")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                } else if let qty = line.quantity, qty != 1 {
                    Text("\(qtyText(qty)) × \(PatinaCurrency.format(cents: line.unit_amount_cents ?? 0, currencyCode: invoice.currencyCode))")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                }
            }
            Spacer(minLength: 8)
            Text(PatinaCurrency.format(cents: line.amount_cents ?? 0, currencyCode: invoice.currencyCode))
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.secondary)
        }
        .padding(14)
    }

    private func qtyText(_ qty: Double) -> String {
        qty == qty.rounded() ? "\(Int(qty))" : "\(qty)"
    }

    private var totalsBlock: some View {
        VStack(spacing: 6) {
            divider
            totalRow("Subtotal", invoice.subtotal_cents ?? 0, emphasis: false)
            if let tax = invoice.tax_cents, tax > 0 {
                totalRow("Tax (\(taxPercent)%)", tax, emphasis: false)
            }
            totalRow("Total", invoice.total_cents ?? 0, emphasis: true)
        }
        .padding(14)
    }

    private func totalRow(_ label: String, _ cents: Int, emphasis: Bool) -> some View {
        HStack {
            Text(label)
                .font(emphasis ? PatinaTypography.bodySmallMedium : PatinaTypography.bodySmall)
                .foregroundStyle(emphasis ? PatinaColors.Text.primary : PatinaColors.Text.muted)
            Spacer()
            Text(PatinaCurrency.format(cents: cents, currencyCode: invoice.currencyCode))
                .font(emphasis ? PatinaTypography.bodySmallMedium : PatinaTypography.bodySmall)
                .foregroundStyle(emphasis ? PatinaColors.Text.primary : PatinaColors.Text.secondary)
        }
    }

    private var taxPercent: String {
        let pct = (invoice.tax_rate ?? 0) * 100
        return pct == pct.rounded() ? "\(Int(pct))" : String(format: "%.2f", pct)
    }

    private var divider: some View {
        Rectangle()
            .fill(PatinaColors.pearl)
            .frame(height: 1)
    }
}

// MARK: - Payments

struct InvoicePaymentsBlock: View {
    let invoice: RemoteInvoice

    /// Succeeded payments first, then in-flight pending ones — mirrors the
    /// portal's [succeeded, processing] ordering.
    private var visible: [RemoteInvoicePayment] {
        let payments = invoice.payments ?? []
        let succeeded = payments.filter { $0.isSucceeded }
        let pending = payments.filter { $0.isPending }
        return succeeded + pending
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            MonoLabel(text: "Payments")
                .padding(.horizontal, 24)
            VStack(alignment: .leading, spacing: 0) {
                if visible.isEmpty {
                    Text("No payments recorded yet.")
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.muted)
                        .padding(14)
                } else {
                    ForEach(Array(visible.enumerated()), id: \.element.id) { index, payment in
                        row(payment)
                        if index < visible.count - 1 {
                            Rectangle()
                                .fill(PatinaColors.pearl)
                                .frame(height: 1)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .padding(.horizontal, 24)
        }
    }

    private func row(_ payment: RemoteInvoicePayment) -> some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(methodLabel(payment))
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.primary)
                Text(payment.isPending ? "Payment processing" : receivedLine(payment))
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            Spacer(minLength: 8)
            Text(PatinaCurrency.format(cents: payment.amount_cents ?? 0, currencyCode: invoice.currencyCode))
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.secondary)
        }
        .padding(14)
    }

    private func methodLabel(_ payment: RemoteInvoicePayment) -> String {
        var label: String
        switch payment.method {
        case "stripe": label = "Online payment"
        case "check": label = "Check"
        case "wire": label = "Wire transfer"
        case "ach_manual": label = "Bank transfer"
        case "cash": label = "Cash"
        default: label = "Payment"
        }
        if let reference = payment.reference, !reference.isEmpty {
            label += " · \(reference)"
        }
        return label
    }

    private func receivedLine(_ payment: RemoteInvoicePayment) -> String {
        let raw = payment.received_at ?? payment.created_at
        guard let raw else { return "Received" }
        return "Received \(DateDisplay.fromTimestamp(raw))"
    }
}
