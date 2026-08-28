//
//  OrdersService.swift
//  Patina
//
//  The one place the client's orders are fetched and held, so the three
//  surfaces that print them — Studio → Ordered, the record's MOVED rows, and
//  the order screens themselves — can never disagree about what she has
//  ordered. The same discipline `BadgeCountService` holds for the money rail
//  (SP-16: one count, one source).
//
//  Four reads, concurrently, all of them partial-failure tolerant: a shipment
//  read that fails costs the carrier row and not the list.
//

import Foundation
import Observation

@MainActor
@Observable
final class OrdersService {

    static let shared = OrdersService()

    /// Both rails, merged and sorted. Empty for a guest and after a failure —
    /// an empty list draws nothing, which is the honest silence.
    private(set) var orders: [ClientOrder] = []

    /// The responsibility paragraph and the contact behind "Report a problem".
    /// Nil until `get_direct_order_terms()` answers; the rows that need it
    /// simply do not draw until then.
    private(set) var terms: OrderResponsibilityTerms?

    private(set) var isLoading = false
    private(set) var hasLoaded = false
    /// True when every one of the reads failed. Distinguishes "you have no
    /// orders" from "we could not reach them" — the difference between an
    /// empty state and a retry.
    private(set) var lastRefreshFailed = false

    private var inFlight: Task<Void, Never>?

    /// Orders on the fulfillment rail whose state moved. What the Record's
    /// `orderMoved` producer reads.
    var movedOrders: [ClientOrder] {
        orders.filter { $0.rail == .fulfillment }
    }

    func refreshIfNeeded() async {
        guard !hasLoaded else { return }
        await refresh()
    }

    func refresh() async {
        if let inFlight { return await inFlight.value }
        guard AuthService.shared.isAuthenticated else {
            orders = []
            terms = nil
            hasLoaded = true
            lastRefreshFailed = false
            return
        }

        let task = Task<Void, Never> { [weak self] in await self?.performRefresh() }
        inFlight = task
        await task.value
        inFlight = nil
    }

    private func performRefresh() async {
        isLoading = true
        let userId = AuthService.shared.currentUserId
        let fallbackFirstName = ClientOrderBuilder.firstName(
            of: HouseRecordBuilder.resolveDesigner(
                badges: BadgeCountService.shared,
                liveLead: DesignRequestStatusService.shared.liveLead
            ).flatMap { $0.isPerson ? $0.name : nil }
        )

        async let fulfillment = Self.fetch { try await FulfillmentAPIClient.shared.orders() }
        async let shipments = Self.fetch { try await FulfillmentAPIClient.shared.shipments() }
        async let direct = Self.fetch {
            try await FulfillmentAPIClient.shared.directOrders(clientId: userId)
        }
        let loaded = await (fulfillment, shipments, direct)

        // The lines depend on which orders came back, so they are the one read
        // that cannot ride the same `async let` group.
        let items: [RemoteFulfillmentOrderItem]?
        if let orders = loaded.0, !orders.isEmpty {
            items = await Self.fetch {
                try await FulfillmentAPIClient.shared.orderItems(orderIds: orders.map(\.id))
            }
        } else {
            items = []
        }

        lastRefreshFailed = loaded.0 == nil && loaded.2 == nil
        orders = ClientOrderBuilder.build(
            fulfillmentOrders: loaded.0 ?? [],
            items: items ?? [],
            shipments: loaded.1 ?? [],
            directOrders: loaded.2 ?? [],
            designerFallbackFirstName: fallbackFirstName
        )
        if terms == nil {
            terms = await Self.fetch { try await FulfillmentAPIClient.shared.orderTerms() }
        }
        hasLoaded = true
        isLoading = false
    }

    /// One order by its routing token — `"fulfillment:<uuid>"` /
    /// `"direct:<uuid>"`.
    ///
    /// A **bare uuid also resolves**, against both the row's own id and the
    /// direct order merged behind it. The purchase path navigates to
    /// `.orderDetail` straight off `Order placed.` carrying the raw
    /// `direct_orders.id`, and a settled direct order has by then become a
    /// fulfillment row whose `recordId` is a different uuid entirely. A
    /// terminal CTA that lands on "we couldn't find that order" seconds after a
    /// charge is the worst screen in this program to get wrong.
    func order(withId id: String) -> ClientOrder? {
        Self.resolve(id, in: orders)
    }

    /// The resolution itself, pure, so the seam between the purchase path and
    /// this screen is pinned by a test rather than by a walk.
    nonisolated static func resolve(_ id: String, in orders: [ClientOrder]) -> ClientOrder? {
        if let exact = orders.first(where: { $0.id == id }) { return exact }
        guard !id.contains(":") else { return nil }
        return orders.first { $0.recordId == id || $0.directOrderId == id }
    }

    /// Whether a miss on the detail screen is worth one re-read.
    ///
    /// `OrdersService` is session-lifetime and `hasLoaded` is set by whichever
    /// surface loaded first — Today's record build, or the Studio hub — so on
    /// any warm app `refreshIfNeeded()` is a no-op. An order minted since that
    /// load (a push about a shipment; the direct order placed thirty seconds
    /// ago) is therefore simply not in `orders` yet, and the empty state would
    /// be a lie. One refresh, then the empty state means it.
    nonisolated static func shouldRefetchOnMiss(found: Bool, alreadyRefetched: Bool) -> Bool {
        !found && !alreadyRefetched
    }

    /// A failure costs its own source and nothing else. The server's own words
    /// go to the log and never to the reader (C5) — the screens print Patina
    /// copy for every failure.
    private static func fetch<T>(_ work: () async throws -> T) async -> T? {
        do {
            return try await work()
        } catch {
            PatinaLog.sync.error("[Orders] read failed: \(String(describing: error))")
            return nil
        }
    }
}
