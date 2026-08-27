//
//  InvoicesViewModel.swift
//  Patina
//
//  Client-side invoice workflow (Wave 2 / D.2): list invoices, view detail,
//  and pay via Stripe Checkout (web hand-off). R30: poll-first — after the
//  Checkout hand-off dismisses, poll the invoice row for the webhook-driven
//  status flip (no patina:// deep link this wave). Mirrors the client portal's
//  invoices pages.
//

import SwiftUI

@Observable
@MainActor
final class InvoiceListViewModel {
    var invoices: [RemoteInvoice] = []
    var isLoading: Bool = false
    var error: String?

    /// Open (awaiting payment): sent / partially_paid.
    var open: [RemoteInvoice] {
        invoices.filter { $0.status == "sent" || $0.status == "partially_paid" }
    }

    /// Paid in full.
    var paid: [RemoteInvoice] {
        invoices.filter { $0.status == "paid" }
    }

    /// Voided.
    var archived: [RemoteInvoice] {
        invoices.filter { $0.status == "void" }
    }

    var isEmpty: Bool {
        open.isEmpty && paid.isEmpty && archived.isEmpty
    }

    func load() async {
        isLoading = true
        error = nil
        do {
            self.invoices = try await InvoicesAPIClient.shared.listInvoices()
        } catch {
            self.error = "Couldn't load invoices"
            #if DEBUG
            PatinaLog.ui.error("[Invoices] list failed: \(error.localizedDescription)")
            #endif
        }
        isLoading = false
    }
}

@Observable
@MainActor
final class InvoiceDetailViewModel {

    /// Payment-confirmation state after the Checkout hand-off dismisses.
    enum ConfirmState: Equatable {
        case idle
        case confirming
        case confirmed
        /// Poll timed out. SP-15: the app used to call this a bank transfer
        /// regardless of method — a card payer was told to expect 3–5 business
        /// days. The copy now defaults to the truth and names a bank transfer
        /// only where the payment row actually says so.
        case unconfirmed
    }

    var invoice: RemoteInvoice?
    var isLoading: Bool = false
    var error: String?

    // Pay flow.
    var isStartingCheckout: Bool = false
    /// SP-15: the failure as Patina says it, never as the vendor said it.
    var payFailure: MoneyFailure?
    /// Drives the SFSafariViewController presentation.
    var checkoutURL: URL?
    var confirmState: ConfirmState = .idle

    /// ~3s interval, up to ~60s total (R30).
    private let pollInterval: Duration = .seconds(3)
    private let pollDeadline: Duration = .seconds(60)
    private var pollTask: Task<Void, Never>?

    func load(invoiceId: String) async {
        isLoading = true
        error = nil
        do {
            self.invoice = try await InvoicesAPIClient.shared.fetchInvoice(id: invoiceId)
            if self.invoice == nil { self.error = "Couldn't load this invoice" }
        } catch {
            self.error = "Couldn't load this invoice"
            #if DEBUG
            PatinaLog.ui.error("[Invoices] detail failed: \(error.localizedDescription)")
            #endif
        }
        isLoading = false
    }

    /// Manual refresh (pull-to-refresh); never surfaces an error banner.
    func refresh(invoiceId: String) async {
        if let fresh = try? await InvoicesAPIClient.shared.fetchInvoice(id: invoiceId) {
            self.invoice = fresh
        }
    }

    // MARK: - Pay

    /// Start Stripe Checkout. On success we present the hosted checkout in an
    /// SFSafariViewController (the caller observes `checkoutURL`).
    func startCheckout(invoiceId: String) async {
        guard !isStartingCheckout else { return }
        isStartingCheckout = true
        payFailure = nil
        do {
            let url = try await InvoicesAPIClient.shared.startCheckout(invoiceId: invoiceId)
            self.checkoutURL = url
        } catch {
            MoneyFailureCopy.log("checkout", error)
            self.payFailure = MoneyFailureCopy.checkout(error)
        }
        isStartingCheckout = false
    }

    /// The Checkout web view was dismissed — begin polling for the webhook to
    /// settle the payment server-side (R30: poll-first).
    func checkoutDismissed(invoiceId: String) {
        checkoutURL = nil
        payFailure = nil
        startPolling(invoiceId: invoiceId)
    }

    private func startPolling(invoiceId: String) {
        pollTask?.cancel()
        confirmState = .confirming
        pollTask = Task { [weak self] in
            let start = ContinuousClock.now
            while !Task.isCancelled {
                if let fresh = try? await InvoicesAPIClient.shared.fetchInvoice(id: invoiceId) {
                    await MainActor.run {
                        self?.invoice = fresh
                    }
                    if fresh.stripeSettled {
                        await MainActor.run { self?.confirmState = .confirmed }
                        return
                    }
                }
                if ContinuousClock.now - start >= (self?.pollDeadline ?? .seconds(60)) {
                    await MainActor.run { self?.confirmState = .unconfirmed }
                    return
                }
                try? await Task.sleep(for: self?.pollInterval ?? .seconds(3))
            }
        }
    }

    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }
}
