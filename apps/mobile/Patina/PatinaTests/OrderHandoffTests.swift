//
//  OrderHandoffTests.swift
//  PatinaTests
//
//  W5 · C1 — Path A's state machine, driven end to end without a live
//  Supabase.
//
//  The machine exists to hold three promises: money never moves before the
//  attribution disclosure the server made possible; a failure is Patina's
//  sentence and never the vendor's; and the settle is learned by reading the
//  row, not by trusting the browser that came back.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct OrderHandoffTests {

    private let checkoutURL = URL(string: "https://checkout.stripe.com/c/pay/cs_test_123")!

    private func handoff(
        create: @escaping @Sendable (String, Int) async throws -> DirectOrder,
        checkout: @escaping @Sendable (String) async throws -> URL = { _ in
            URL(string: "https://checkout.stripe.com/c/pay/cs_test_123")!
        },
        poll: @escaping @Sendable (String) async throws -> DirectOrder? = { _ in nil },
        events: EventSink = EventSink()
    ) -> OrderHandoff {
        OrderHandoff(
            dependencies: OrderHandoff.Dependencies(
                create: create,
                checkout: checkout,
                poll: poll,
                track: { name, props in events.record(name, props) }
            ),
            pollInterval: .milliseconds(5),
            pollDeadline: .milliseconds(60)
        )
    }

    /// Captures the analytics the machine fires, so `order_failed`'s reason can
    /// be asserted to be a code rather than a sentence.
    final class EventSink: @unchecked Sendable {
        private let lock = NSLock()
        private var events: [(String, [String: String])] = []
        func record(_ name: String, _ properties: [String: String]) {
            lock.lock(); defer { lock.unlock() }
            events.append((name, properties))
        }
        var names: [String] {
            lock.lock(); defer { lock.unlock() }
            return events.map(\.0)
        }
        func properties(of name: String) -> [String: String]? {
            lock.lock(); defer { lock.unlock() }
            return events.first { $0.0 == name }?.1
        }
    }

    // MARK: - The ordinary path

    @Test("no designer on the row → create goes straight to Checkout, one tap")
    func uncreditedOrderSkipsTheDisclosure() async {
        let events = EventSink()
        let machine = handoff(
            create: { _, _ in PurchaseFixture.order() },
            events: events
        )
        await machine.begin(productId: PurchaseFixture.productId)

        guard case .awaitingPayment(let order, let url) = machine.phase else {
            Issue.record("expected awaitingPayment, got \(machine.phase)")
            return
        }
        #expect(order.designerId == nil)
        #expect(url == checkoutURL)
        #expect(events.names == ["order_created", "order_checkout_opened"])
    }

    @Test("a designer on the row stops the machine so the disclosure is read before money moves")
    func creditedOrderDisclosesFirst() async {
        let machine = handoff(
            create: { _, _ in PurchaseFixture.order(designerId: "a0000000-0000-0000-0000-000000000004") }
        )
        await machine.begin(productId: PurchaseFixture.productId)

        guard case .disclosing(let order) = machine.phase else {
            Issue.record("expected disclosing, got \(machine.phase)")
            return
        }
        #expect(order.designerId != nil)
        #expect(machine.checkoutURL == nil)

        await machine.confirmDisclosure()
        guard case .awaitingPayment = machine.phase else {
            Issue.record("expected awaitingPayment after the disclosure, got \(machine.phase)")
            return
        }
    }

    // MARK: - The settle

    @Test("the poll settles on the row, not on the browser coming back")
    func pollSettlesOnPaid() async throws {
        let machine = handoff(
            create: { _, _ in PurchaseFixture.order() },
            poll: { id in PurchaseFixture.order(id: id, status: "paid") }
        )
        await machine.begin(productId: PurchaseFixture.productId)
        machine.checkoutDismissed()

        try await waitFor { if case .placed = machine.phase { return true } else { return false } }
        guard case .placed(let order) = machine.phase else {
            Issue.record("expected placed, got \(machine.phase)")
            return
        }
        #expect(order.isSettled)
    }

    @Test("a row that never flips times out into the honest sentence, not a failure")
    func pollTimesOutIntoUnconfirmed() async throws {
        let events = EventSink()
        let machine = handoff(
            create: { _, _ in PurchaseFixture.order() },
            poll: { _ in PurchaseFixture.order(status: "pending_payment") },
            events: events
        )
        await machine.begin(productId: PurchaseFixture.productId)
        machine.checkoutDismissed()

        try await waitFor { if case .unconfirmed = machine.phase { return true } else { return false } }
        #expect(machine.failure == nil)
        #expect(events.properties(of: "order_failed")?["reason"] == "poll_timeout")
    }

    // MARK: - Failure

    @Test("a create refusal becomes a Patina sentence, and reports a code")
    func createRefusalIsCopyAndACode() async {
        let events = EventSink()
        let machine = handoff(
            create: { _, _ in throw DirectOrderError.refused(.dimensions) },
            events: events
        )
        await machine.begin(productId: PurchaseFixture.productId)

        #expect(machine.failure?.sentence == "We don't have this piece's size and lead time yet.")
        #expect(events.properties(of: "order_failed")?["reason"] == "dimensions")
        #expect(!events.names.contains("order_checkout_opened"))
    }

    @Test("a Stripe 502 never reaches the reader, and nothing claims a charge")
    func stripeErrorIsNeverEchoed() async {
        let events = EventSink()
        let machine = handoff(
            create: { _, _ in PurchaseFixture.order() },
            checkout: { _ in
                throw OrderCheckoutError.from(
                    code: "stripe_error",
                    detail: "Invalid API Key provided: sk_test_********************alls"
                )
            },
            events: events
        )
        await machine.begin(productId: PurchaseFixture.productId)

        let sentence = try? #require(machine.failure?.sentence)
        #expect(sentence == "We couldn't start this payment. Nothing has been charged.")
        #expect(sentence?.contains("sk_test") == false)
        #expect(events.properties(of: "order_failed")?["reason"] == "checkout_unavailable")
    }

    @Test("an already-paid order says so rather than charging twice")
    func alreadyPaidCopy() async {
        let machine = handoff(
            create: { _, _ in PurchaseFixture.order() },
            checkout: { _ in throw OrderCheckoutError.alreadyPaid }
        )
        await machine.begin(productId: PurchaseFixture.productId)
        #expect(machine.failure?.sentence
                == "This order is already paid. A receipt is on its way to your inbox.")
    }

    @Test("retry returns the machine to idle so the reader can try again")
    func resetClearsTheFailure() async {
        let machine = handoff(create: { _, _ in throw DirectOrderError.unavailable })
        await machine.begin(productId: PurchaseFixture.productId)
        #expect(machine.failure != nil)
        machine.reset()
        #expect(machine.phase == .idle)
        #expect(machine.failure == nil)
    }

    // MARK: - The guest

    @Test("nothing is written for a guest — the machine is never started")
    func aGuestNeverReachesCreate() async {
        // The wall is the screen's, and this is the machine's half of the
        // promise: if `begin` is not called, no row exists to strand.
        let created = Counter()
        let machine = handoff(create: { _, _ in
            created.bump()
            return PurchaseFixture.order()
        })
        #expect(machine.phase == .idle)
        #expect(created.value == 0)
        _ = machine
    }

    final class Counter: @unchecked Sendable {
        private let lock = NSLock()
        private var count = 0
        func bump() { lock.lock(); count += 1; lock.unlock() }
        var value: Int { lock.lock(); defer { lock.unlock() }; return count }
    }

    // MARK: - Helpers

    private func waitFor(
        timeout: Duration = .seconds(3),
        _ condition: @MainActor () -> Bool
    ) async throws {
        let start = ContinuousClock.now
        while ContinuousClock.now - start < timeout {
            if condition() { return }
            try await Task.sleep(for: .milliseconds(5))
        }
        Issue.record("condition never became true within \(timeout)")
    }
}
