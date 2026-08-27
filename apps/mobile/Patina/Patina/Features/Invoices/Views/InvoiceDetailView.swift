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
    @Environment(\.appCoordinator) private var coordinator
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
        case .unconfirmed:
            banner(.warning, InvoiceSettleCopy.unconfirmed(invoice))
        case .idle:
            if invoice.hasPendingPayment {
                banner(.info, InvoiceSettleCopy.processing(invoice))
            }
        }
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
                // SP-15: the failure is drawn ABOVE the button. It used to be
                // inserted below a still-enabled "Pay $4,250.00", off the
                // bottom of the screen and behind the Companion dock.
                moneyFailureBanner(invoice)
                PatinaButton(
                    "Pay \(PatinaCurrency.format(cents: invoice.balanceCents, currencyCode: invoice.currencyCode))",
                    style: .clay,
                    isLoading: viewModel.isStartingCheckout,
                    isEnabled: !viewModel.isStartingCheckout
                ) {
                    Task { await viewModel.startCheckout(invoiceId: invoiceId) }
                }
                .accessibilityIdentifier("invoiceDetail.pay")
                Text("Payment opens securely in Safari.")
                    .font(PatinaTypography.captionSmall)
                    .foregroundStyle(PatinaColors.Text.muted)
                Text("Pay securely by card or bank transfer.")
                    .font(PatinaTypography.captionSmall)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            .padding(.horizontal, 24)
            .padding(.top, 4)
        }
    }

    /// SP-15 / C5: one plain sentence in Patina's voice and the two acts that
    /// follow it. No vendor string ever reaches this view — `MoneyFailureCopy`
    /// is the only source of the words.
    @ViewBuilder
    private func moneyFailureBanner(_ invoice: RemoteInvoice) -> some View {
        if let failure = viewModel.payFailure {
            VStack(alignment: .leading, spacing: 10) {
                Text(failure.sentence)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 18) {
                    Button(failure.retryLabel) {
                        Task { await viewModel.startCheckout(invoiceId: invoiceId) }
                    }
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.interactive)
                    .accessibilityIdentifier("invoiceDetail.failure.retry")
                    if failure.offersDesignerMessage, let projectId = invoice.project_id {
                        Button("Message your designer") {
                            openDesignerThread(projectId: projectId)
                        }
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.interactive)
                        .accessibilityIdentifier("invoiceDetail.failure.message")
                    }
                }
                .frame(minHeight: 44)
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PatinaColors.error.opacity(0.1))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .accessibilityIdentifier("invoiceDetail.failure")
        }
    }

    /// Opens (or creates) the project's thread — W1a's merged
    /// `MessagingAPIClient.createThread`. A failure here stays silent; the
    /// retry act above it is still the client's way forward.
    private func openDesignerThread(projectId: String) {
        Task {
            guard let threadId = try? await MessagingAPIClient.shared
                .createThread(projectId: projectId) else { return }
            coordinator.navigate(to: .threadDetail(threadId: threadId))
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
