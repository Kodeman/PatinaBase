//
//  InvoiceListView.swift
//  Patina
//
//  Client invoice list (Wave 2 / D.2). Awaiting-payment / Paid / Archive
//  sections, mirroring the client portal's /invoices page. Tap a row → detail.
//

import SwiftUI

struct InvoiceListView: View {
    @Environment(\.appCoordinator) private var coordinator
    @State private var viewModel = InvoiceListViewModel()

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) {
                header
                content
            }
            .padding(.bottom, MoneyScreenMetrics.bottomClearance)
        }
        .background(PatinaColors.Background.primary)
        // U18: standard pushed-screen chrome — the header above carries
        // the title, so the chrome adds only the back chevron.
        .patinaScreen(title: nil)
        .moneyScreenTopBand()
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            MonoLabel(text: "INVOICES")
                .tracking(2)
            // U22: kept static — the empty case names itself in the
            // PatinaEmptyState below; repeating that exact line here doubled
            // the same sentence on an empty Studio.
            Text("Your invoices")
                .font(PatinaTypography.h3)
                .foregroundStyle(PatinaColors.Text.primary)
        }
        .padding(.top, 56)
        .padding(.horizontal, 24)
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading && viewModel.invoices.isEmpty {
            PatinaLoadingState()
                .padding(.top, 60)
        } else if let error = viewModel.error, viewModel.invoices.isEmpty {
            PatinaErrorState(message: error, action: { Task { await viewModel.load() } })
                .padding(.top, 60)
        } else if viewModel.isEmpty {
            emptyView
        } else {
            VStack(alignment: .leading, spacing: 24) {
                section("Awaiting payment", viewModel.open, accent: PatinaColors.Text.interactive)
                section("Paid", viewModel.paid, accent: PatinaColors.sage)
                section("Archive", viewModel.archived, accent: PatinaColors.Text.muted)
            }
            .padding(.top, 12)
        }
    }

    @ViewBuilder
    private func section(_ title: String, _ invoices: [RemoteInvoice], accent: Color) -> some View {
        if !invoices.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Text("\(title) (\(invoices.count))")
                    .font(PatinaTypography.monoLabel)
                    .tracking(0.4)
                    .textCase(.uppercase)
                    .foregroundStyle(accent)
                    .padding(.horizontal, 24)
                VStack(spacing: 12) {
                    ForEach(invoices) { invoice in
                        Button {
                            coordinator.navigate(to: .invoiceDetail(invoiceId: invoice.id))
                        } label: {
                            InvoiceRowCard(invoice: invoice)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 24)
            }
        }
    }

    /// U22: names the surface, names the trigger, and offers the one CTA
    /// that actually unblocks it — track an in-flight request if one
    /// exists, otherwise start one.
    private var emptyView: some View {
        PatinaEmptyState(
            icon: "doc.plaintext",
            title: "Nothing due",
            message: "When your designer sends an invoice, it lands here.",
            ctaTitle: studioCTATitle,
            ctaAction: presentStudioCTA
        )
        .padding(.top, 80)
    }

    private var studioCTATitle: String {
        DesignRequestStatusService.shared.promotedRequest != nil ? "Track your request" : "Get design help"
    }

    private func presentStudioCTA() {
        if DesignRequestStatusService.shared.promotedRequest != nil {
            coordinator.navigate(to: .designRequests(focusLeadId: nil))
        } else {
            coordinator.navigate(to: .designerConsultation)
        }
    }
}

// MARK: - Row

private struct InvoiceRowCard: View {
    let invoice: RemoteInvoice

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(statusLabel)
                        .font(PatinaTypography.monoLabel)
                        .tracking(0.4)
                        .textCase(.uppercase)
                        .foregroundStyle(PatinaColors.Text.muted)
                    Text(invoice.invoice_number ?? "Invoice")
                        .font(PatinaTypography.h5)
                        .foregroundStyle(PatinaColors.Text.primary)
                }
                Spacer(minLength: 8)
                amount
            }
            if let projectName = invoice.project?.name, !projectName.isEmpty {
                Text(projectName)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(invoice.invoice_number ?? "Invoice"), \(statusLabel)")
    }

    @ViewBuilder
    private var amount: some View {
        VStack(alignment: .trailing, spacing: 2) {
            if invoice.isVoid {
                Text("—")
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.muted)
            } else {
                let showBalance = invoice.isPartiallyPaid
                let cents = showBalance ? invoice.balanceCents : (invoice.total_cents ?? 0)
                Text(PatinaCurrency.format(cents: cents, currencyCode: invoice.currencyCode))
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.primary)
                if showBalance, let total = invoice.total_cents {
                    Text("of \(PatinaCurrency.format(cents: total, currencyCode: invoice.currencyCode))")
                        .font(PatinaTypography.captionSmall)
                        .foregroundStyle(PatinaColors.Text.muted)
                } else if let due = dueLine {
                    Text(due.text)
                        .font(PatinaTypography.captionSmall)
                        .foregroundStyle(due.isPastDue ? PatinaColors.error : PatinaColors.Text.muted)
                }
            }
        }
    }

    private var statusLabel: String {
        switch invoice.status {
        case "sent": return "Awaiting payment"
        case "partially_paid": return "Partially paid"
        case "paid": return "Paid"
        case "void": return "Void"
        default: return invoice.status?.capitalized ?? "Invoice"
        }
    }

    /// SP-15: the same line the detail, the decision list and the Studio hub
    /// print. It used to format its own "Due Aug 22, 2026" in muted grey while
    /// the detail one tap later read "Overdue · Aug 22" in red.
    private var dueLine: DateDisplay.DueLine? {
        guard invoice.status == "sent" || invoice.status == "partially_paid" else { return nil }
        return DateDisplay.due(invoice.due_date)
    }
}

#Preview {
    NavigationStack {
        InvoiceListView()
            .environment(\.appCoordinator, AppCoordinator())
    }
}
