//
//  InvoiceDetailView.swift
//  Patina
//
//  Client invoice detail (Wave 2 / D.2). Amount summary, line items, payments,
//  and a Pay button that hands off to Stripe Checkout in an SFSafariViewController
//  (R30: pure web handoff, poll-first — no patina:// deep link, zero IAP
//  language). On dismiss the VM polls the invoice for the webhook-settled
//  status. Mirrors the client portal's invoice detail page.
//

import SwiftUI

struct InvoiceDetailView: View {
    let invoiceId: String
    @State private var viewModel = InvoiceDetailViewModel()

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 24) {
                if let invoice = viewModel.invoice {
                    header(invoice)
                    confirmBanner(invoice)
                    amountSummary(invoice)
                    dueLine(invoice)
                    InvoiceLineItemsBlock(invoice: invoice)
                    memoSection(invoice)
                    InvoicePaymentsBlock(invoice: invoice)
                    payFooter(invoice)
                } else if let error = viewModel.error {
                    errorView(error)
                } else {
                    PatinaLoadingState()
                        .padding(.top, 80)
                }
            }
            .padding(.bottom, 140)
        }
        .background(PatinaColors.Background.primary)
        // U18: standard pushed-screen chrome — the header above carries
        // the title, so the chrome adds only the back chevron.
        .patinaScreen(title: nil)
        .task { await viewModel.load(invoiceId: invoiceId) }
        .refreshable { await viewModel.refresh(invoiceId: invoiceId) }
        .onDisappear { viewModel.stopPolling() }
        .fullScreenCover(item: checkoutBinding) { wrapper in
            SafariView(url: wrapper.url) {
                viewModel.checkoutDismissed(invoiceId: invoiceId)
            }
            .ignoresSafeArea()
        }
    }

    private var checkoutBinding: Binding<IdentifiableURL?> {
        Binding(
            get: { viewModel.checkoutURL.map(IdentifiableURL.init) },
            set: { if $0 == nil { viewModel.checkoutURL = nil } }
        )
    }

    // MARK: - Header

    private func header(_ invoice: RemoteInvoice) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            MonoLabel(text: "INVOICE")
                .tracking(2)
            Text(statusHeadline(invoice))
                .font(PatinaTypography.h2)
                .foregroundStyle(isOverdue(invoice) ? PatinaColors.error : PatinaColors.Text.primary)
            Text(invoice.invoice_number ?? "Invoice")
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.secondary)
            Text(contextLine(invoice))
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.muted)
        }
        .padding(.top, 56)
        .padding(.horizontal, 24)
    }

    private func statusHeadline(_ invoice: RemoteInvoice) -> String {
        if invoice.isPaid { return "Paid in full" }
        if invoice.isVoid { return "Voided by your designer" }
        if isOverdue(invoice) { return "Past due" }
        if invoice.isPartiallyPaid { return "Partially paid" }
        return "Awaiting payment"
    }

    private func contextLine(_ invoice: RemoteInvoice) -> String {
        let project = invoice.project?.name ?? "Your project"
        let designer = invoice.designer?.displayName ?? "your designer"
        return "\(project) · from \(designer)"
    }

    // MARK: - Confirm / processing banner

    @ViewBuilder
    private func confirmBanner(_ invoice: RemoteInvoice) -> some View {
        switch viewModel.confirmState {
        case .confirming:
            banner(.info, "Confirming payment… This usually takes a few seconds.")
        case .confirmed:
            banner(.success, "Payment received — thank you! A receipt is on its way to your inbox.")
        case .achPending:
            banner(.warning, "Your bank transfer has been started. Bank transfers take 3–5 business days to clear — we'll email your receipt as soon as it lands.")
        case .idle:
            if invoice.hasPendingPayment {
                banner(.info, processingCopy(invoice))
            }
        }
    }

    private func processingCopy(_ invoice: RemoteInvoice) -> String {
        var copy = "A payment is processing. The balance above will update once it clears."
        if invoice.hasProcessingStripePayment {
            copy += " Bank transfers take 3–5 business days."
        }
        return copy
    }

    private func banner(_ state: PatinaStatusBadge.State, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: bannerIcon(state))
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(bannerTint(state))
            Text(text)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(bannerTint(state).opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 24)
    }

    private func bannerIcon(_ state: PatinaStatusBadge.State) -> String {
        switch state {
        case .success: return "checkmark.circle.fill"
        case .warning: return "clock.fill"
        default: return "info.circle.fill"
        }
    }

    private func bannerTint(_ state: PatinaStatusBadge.State) -> Color {
        switch state {
        case .success: return PatinaColors.success
        case .warning: return PatinaColors.warning
        case .error: return PatinaColors.error
        case .info: return PatinaColors.dustyBlue
        }
    }

    // MARK: - Amount summary

    private func amountSummary(_ invoice: RemoteInvoice) -> some View {
        HStack(spacing: 0) {
            summaryTile("Total", invoice.total_cents ?? 0, invoice.currencyCode)
            summaryTile("Paid", invoice.amount_paid_cents ?? 0, invoice.currencyCode)
            summaryTile(invoice.isVoid ? "Balance" : "Balance", invoice.balanceCents, invoice.currencyCode)
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .padding(.horizontal, 24)
    }

    /// SP-15: "Due Sep 1, 2026" printed on the list and vanished here. It now
    /// sits under the balance, above the pay button, and turns red once past.
    @ViewBuilder
    private func dueLine(_ invoice: RemoteInvoice) -> some View {
        if let due = DateDisplay.due(invoice.due_date), !invoice.isPaid, !invoice.isVoid {
            Text(due.text)
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(due.isPastDue ? PatinaColors.error : PatinaColors.Text.secondary)
                .padding(.horizontal, 24)
                .accessibilityIdentifier("invoiceDetail.due")
        }
    }

    private func summaryTile(_ label: String, _ cents: Int, _ currency: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            MonoLabel(text: label)
            Text(PatinaCurrency.format(cents: cents, currencyCode: currency))
                .font(PatinaTypography.bodyMedium)
                .foregroundStyle(PatinaColors.Text.primary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Memo

    @ViewBuilder
    private func memoSection(_ invoice: RemoteInvoice) -> some View {
        if let memo = invoice.memo, !memo.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                MonoLabel(text: "A note from your designer")
                Text(memo)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 24)
        }
    }

    // MARK: - Pay footer

    @ViewBuilder
    private func payFooter(_ invoice: RemoteInvoice) -> some View {
        if invoice.isVoid {
            Text("This invoice was voided — nothing is owed on it. Reach out to your designer with any questions.")
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.muted)
                .padding(.horizontal, 24)
        } else if invoice.isPayable && viewModel.confirmState != .confirming {
            VStack(alignment: .leading, spacing: 10) {
                PatinaButton(
                    "Pay \(PatinaCurrency.format(cents: invoice.balanceCents, currencyCode: invoice.currencyCode))",
                    style: .clay,
                    isLoading: viewModel.isStartingCheckout
                ) {
                    Task { await viewModel.startCheckout(invoiceId: invoiceId) }
                }
                .accessibilityIdentifier("invoiceDetail.pay")
                if let payError = viewModel.payError {
                    Text(payError)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.error)
                }
                Text("Pay securely by card or bank transfer.")
                    .font(PatinaTypography.captionSmall)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            .padding(.horizontal, 24)
            .padding(.top, 4)
        }
    }

    // MARK: - Helpers

    private func isOverdue(_ invoice: RemoteInvoice) -> Bool {
        guard invoice.status == "sent" || invoice.status == "partially_paid" else { return false }
        return DateDisplay.due(invoice.due_date)?.isPastDue == true
    }

    private func errorView(_ msg: String) -> some View {
        PatinaErrorState(
            message: msg,
            action: { Task { await viewModel.load(invoiceId: invoiceId) } }
        )
        .padding(.top, 80)
    }
}

#Preview {
    NavigationStack {
        InvoiceDetailView(invoiceId: "preview")
    }
}
