//
//  OrderHandoff.swift
//  Patina
//
//  Path A's state machine: create the payable row, hand off to hosted Stripe
//  Checkout in `SFSafariViewController`, and — because a webhook settles the
//  row and nothing comes back into the app — poll the row after the sheet
//  dismisses. The interval and the deadline are `InvoicesViewModel`'s, reused
//  rather than re-picked: 3 s, up to 60 s, started on dismiss (R30).
//
//  One step exists here that the invoice rail has no need of. B §5 says the
//  order sheet discloses attribution before money moves, and R3 says the app
//  may never guess who that designer is — only `create_direct_order` knows,
//  because only it can read `designer_clients`. So when the created row comes
//  back naming a designer the sheet stops, prints the disclosure, and waits
//  for a second tap. When it names none — the ordinary case — the machine goes
//  straight on to Checkout and the reader sees one tap, not two.
//
//  Nothing in this file renders a server sentence. `OrderFailureCopy` is the
//  only source of the words a failure shows.
//

import Foundation
import Observation

@MainActor
@Observable
final class OrderHandoff {

    enum Phase: Equatable {
        case idle
        /// `create_direct_order` in flight.
        case creating
        /// The row exists and names a designer; the disclosure is on screen
        /// and the reader has not yet confirmed.
        case disclosing(DirectOrder)
        /// `create-checkout-session` in flight.
        case openingCheckout(DirectOrder)
        /// Safari is up over the sheet.
        case awaitingPayment(DirectOrder, URL)
        /// Safari dismissed; polling the row for the webhook's flip.
        case confirming(DirectOrder)
        case placed(DirectOrder)
        /// The poll ran out. The order may still settle; the copy says so.
        case unconfirmed(DirectOrder)
        case failed(MoneyFailure)
    }

    private(set) var phase: Phase = .idle

    /// The order the machine is working on, at any phase that has one.
    var order: DirectOrder? {
        switch phase {
        case .idle, .creating, .failed:
            return nil
        case .disclosing(let order), .openingCheckout(let order),
             .confirming(let order), .placed(let order), .unconfirmed(let order):
            return order
        case .awaitingPayment(let order, _):
            return order
        }
    }

    var checkoutURL: URL? {
        if case .awaitingPayment(_, let url) = phase { return url }
        return nil
    }

    var failure: MoneyFailure? {
        if case .failed(let failure) = phase { return failure }
        return nil
    }

    var isWorking: Bool {
        switch phase {
        case .creating, .openingCheckout, .confirming: return true
        default: return false
        }
    }

    // MARK: - Seams

    /// The two network calls and the poll, injected so the machine can be
    /// driven end to end in a test without a live Supabase.
    struct Dependencies: Sendable {
        var create: @Sendable (_ productId: String, _ quantity: Int) async throws -> DirectOrder
        var checkout: @Sendable (_ orderId: String) async throws -> URL
        var poll: @Sendable (_ orderId: String) async throws -> DirectOrder?
        var track: @Sendable (_ event: String, _ properties: [String: String]) -> Void

        static let live = Dependencies(
            create: { productId, quantity in
                try await DirectOrdersAPIClient.shared.createOrder(
                    productId: productId, quantity: quantity
                )
            },
            checkout: { orderId in
                try await DirectOrdersAPIClient.shared.startCheckout(orderId: orderId)
            },
            poll: { orderId in
                try await DirectOrdersAPIClient.shared.fetchOrder(id: orderId)
            },
            track: { event, properties in
                Task { @MainActor in PostHogService.shared.capture(event, properties: properties) }
            }
        )
    }

    private let dependencies: Dependencies
    private let pollInterval: Duration
    private let pollDeadline: Duration
    @ObservationIgnored private var pollTask: Task<Void, Never>?
    /// The order whose Safari return has not yet been reported.
    @ObservationIgnored private var pendingReturn: DirectOrder?

    init(
        dependencies: Dependencies = .live,
        pollInterval: Duration = .seconds(3),
        pollDeadline: Duration = .seconds(60)
    ) {
        self.dependencies = dependencies
        self.pollInterval = pollInterval
        self.pollDeadline = pollDeadline
    }

    // MARK: - Drive

    /// Tap one: create the payable row.
    ///
    /// The caller has already established that the reader is signed in — a
    /// guest meets the auth wall over the piece and **nothing is written**
    /// (`create_direct_order` would refuse anyway, EXECUTE being revoked from
    /// `anon`, but the app must not make the call to find that out).
    func begin(productId: String, quantity: Int = 1) async {
        guard !isWorking else { return }
        phase = .creating
        do {
            let order = try await dependencies.create(productId, quantity)
            dependencies.track("order_created", ["order_id": order.id])
            if order.designerId != nil {
                phase = .disclosing(order)
            } else {
                await openCheckout(for: order)
            }
        } catch {
            let reason: String
            if case .refused(let refusal) = DirectOrdersAPIClient.mapCreate(error) {
                reason = BuyabilityGate.analyticsReason(for: refusal)
            } else {
                reason = "create_unavailable"
            }
            dependencies.track("order_failed", ["reason": reason])
            phase = .failed(OrderFailureCopy.create(error))
        }
    }

    /// Tap two, and only where the disclosure was shown.
    func confirmDisclosure() async {
        guard case .disclosing(let order) = phase else { return }
        await openCheckout(for: order)
    }

    private func openCheckout(for order: DirectOrder) async {
        phase = .openingCheckout(order)
        do {
            let url = try await dependencies.checkout(order.id)
            dependencies.track("order_checkout_opened", ["order_id": order.id])
            phase = .awaitingPayment(order, url)
        } catch {
            let reason = (error as? OrderCheckoutError)?.analyticsReason ?? "checkout_unavailable"
            dependencies.track("order_failed", ["reason": reason])
            phase = .failed(OrderFailureCopy.checkout(error))
        }
    }

    /// Safari's Done was pressed. Whether the reader paid is not knowable from
    /// here — the row is, once the webhook lands. So the return event is armed
    /// here and reported with its outcome when the row answers, rather than
    /// carrying a property nothing at this moment could fill.
    func checkoutDismissed() {
        guard case .awaitingPayment(let order, _) = phase else { return }
        pendingReturn = order
        phase = .confirming(order)
        startPolling(order)
    }

    /// The failure state's one act. Returns the machine to where the reader
    /// can try again rather than stranding the sheet.
    func reset() {
        stopPolling()
        phase = .idle
    }

    /// Cancels the poll. A return still in flight is reported as abandoned —
    /// the reader closed the sheet before the row answered, which is a real
    /// outcome and not the same as either of the other two.
    func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
        reportReturn("abandoned")
    }

    /// `order_checkout_returned {outcome}` — settled · unconfirmed ·
    /// abandoned. Fires at most once per return.
    private func reportReturn(_ outcome: String) {
        guard let order = pendingReturn else { return }
        pendingReturn = nil
        dependencies.track(
            "order_checkout_returned",
            ["order_id": order.id, "outcome": outcome]
        )
    }

    private func startPolling(_ order: DirectOrder) {
        pollTask?.cancel()
        pollTask = Task { [weak self, dependencies, pollInterval, pollDeadline] in
            let start = ContinuousClock.now
            while !Task.isCancelled {
                if let fresh = try? await dependencies.poll(order.id), fresh.isSettled {
                    await MainActor.run {
                        self?.reportReturn("settled")
                        dependencies.track("order_settled", ["order_id": fresh.id])
                        self?.phase = .placed(fresh)
                    }
                    return
                }
                if ContinuousClock.now - start >= pollDeadline {
                    await MainActor.run {
                        self?.reportReturn("unconfirmed")
                        dependencies.track("order_failed", ["reason": "poll_timeout"])
                        self?.phase = .unconfirmed(order)
                    }
                    return
                }
                try? await Task.sleep(for: pollInterval)
            }
        }
    }
}
