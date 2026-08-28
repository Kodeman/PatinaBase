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

        #expect(machine.failure?.sentence == "We don't have this piece's size yet.")
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

    @Test("a payment already going through is never told nothing was charged")
    func paymentProcessingNeverClaimsNoCharge() async {
        // `create-checkout-session` returns 409 `payment_processing` on the
        // direct-order branch when a completed session still points at a
        // not-yet-paid order (`index.ts:1228-1237`) — an ACH debit settling,
        // or a card that cleared before the webhook landed. "Nothing has been
        // charged." is false in exactly that window and invites the second tap
        // the server guard exists to prevent.
        let events = EventSink()
        let machine = handoff(
            create: { _, _ in PurchaseFixture.order() },
            checkout: { _ in
                throw OrderCheckoutError.from(
                    code: "payment_processing",
                    detail: "A bank transfer for this order is already processing."
                )
            },
            events: events
        )
        await machine.begin(productId: PurchaseFixture.productId)

        let sentence = try? #require(machine.failure?.sentence)
        #expect(sentence == "A payment on this order is already going through. "
                + "We'll update this as soon as it clears.")
        #expect(sentence?.contains("Nothing has been charged") == false)
        #expect(sentence?.contains("bank transfer") == false)
        #expect(events.properties(of: "order_failed")?["reason"] == "payment_processing")
    }

    // MARK: - The return

    @Test("the Safari return reports its outcome, once, when the row answers")
    func checkoutReturnCarriesItsOutcome() async throws {
        let events = EventSink()
        let machine = handoff(
            create: { _, _ in PurchaseFixture.order() },
            poll: { _ in PurchaseFixture.order(status: "paid") },
            events: events
        )
        await machine.begin(productId: PurchaseFixture.productId)
        machine.checkoutDismissed()
        // Nothing is reported at the dismissal itself: Safari's Done says
        // nothing about whether the money moved.
        #expect(!events.names.contains("order_checkout_returned"))
        try await waitFor { machine.phase == .placed(PurchaseFixture.order(status: "paid")) }

        #expect(events.properties(of: "order_checkout_returned")?["outcome"] == "settled")
        #expect(events.names.filter { $0 == "order_checkout_returned" }.count == 1)
    }

    @Test("a return that never settles reports unconfirmed, not settled")
    func unsettledReturnReportsUnconfirmed() async throws {
        let events = EventSink()
        let machine = handoff(
            create: { _, _ in PurchaseFixture.order() },
            poll: { _ in nil },
            events: events
        )
        await machine.begin(productId: PurchaseFixture.productId)
        machine.checkoutDismissed()
        try await waitFor { machine.phase == .unconfirmed(PurchaseFixture.order()) }
        #expect(events.properties(of: "order_checkout_returned")?["outcome"] == "unconfirmed")
    }

    @Test("closing the sheet mid-poll reports the return as abandoned")
    func abandonedReturnIsItsOwnOutcome() async {
        let events = EventSink()
        let machine = handoff(
            create: { _, _ in PurchaseFixture.order() },
            poll: { _ in nil },
            events: events
        )
        await machine.begin(productId: PurchaseFixture.productId)
        machine.checkoutDismissed()
        machine.stopPolling()
        #expect(events.properties(of: "order_checkout_returned")?["outcome"] == "abandoned")
        // And never twice.
        machine.stopPolling()
        #expect(events.names.filter { $0 == "order_checkout_returned" }.count == 1)
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

    @Test("a guest's tap goes to the wall, on every act that would write")
    func aGuestMeetsTheWallBeforeAnythingIsWritten() {
        // The previous version of this test built a machine, never called
        // `begin`, and asserted the phase was `.idle` — which would pass with
        // the wall deleted. The guard itself is `PieceActResolver.entry`, and
        // this asserts it: no act a guest can tap resolves to anything that
        // writes.
        let acts: [PieceAct] = [
            .buy(priceCents: 420_000),
            .askAboutPiece(reason: nil),
            .askDesigner(firstName: "Leah")
        ]
        for act in acts {
            let entry = PieceActResolver.entry(for: act, isAuthenticated: false)
            guard case .authWall(let title) = entry else {
                Issue.record("a guest reached \(entry) from \(act)")
                continue
            }
            #expect(!title.isEmpty)
        }
        // And the titles name the act that raised the wall — a reader who
        // tapped "Ask about this piece" is not told to sign in to order.
        #expect(PieceActResolver.entry(for: .buy(priceCents: 1), isAuthenticated: false)
                == .authWall(title: "Sign in to order"))
        #expect(PieceActResolver.entry(for: .askAboutPiece(reason: nil), isAuthenticated: false)
                == .authWall(title: "Sign in to ask"))
    }

    @Test("signed in, each act goes to its own destination and only Buy orders")
    func signedInEntriesAreTheActsThemselves() {
        #expect(PieceActResolver.entry(for: .buy(priceCents: 1), isAuthenticated: true) == .order)
        #expect(PieceActResolver.entry(for: .askDesigner(firstName: "Leah"), isAuthenticated: true)
                == .askDesigner)
        #expect(PieceActResolver.entry(for: .askAboutPiece(reason: "why"), isAuthenticated: true)
                == .askAboutPiece(reason: "why"))
    }

    @Test("nothing is written until the machine is started")
    func nothingIsCreatedBeforeBegin() {
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
