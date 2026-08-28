//
//  OrderRoutingTests.swift
//  PatinaTests
//
//  F198: "the shipping push exists and reaches nobody." It reached nobody
//  because `NotificationRouter` had no arm for the entity type
//  `fulfillment-notify` actually writes, so every order push fell to nil and
//  opened the feed. These tests pin the spelling against the edge function.
//

import Foundation
import Testing
@testable import Patina

struct OrderRoutingTests {

    // MARK: The router

    @Test("the entity type fulfillment-notify writes routes to the order")
    func theShippedPushRoutes() {
        // `supabase/functions/fulfillment-notify/core.ts:265` sends
        // `entity_type: 'fulfillment_order'` with the fulfillment order's id.
        let route = NotificationRouter.route(
            forEntityType: "fulfillment_order",
            entityId: "11111111-2222-3333-4444-555555555555"
        )
        #expect(route == .orderDetail(
            orderId: "fulfillment:11111111-2222-3333-4444-555555555555"
        ))
    }

    @Test("the shorter spelling is accepted too, because the envelope is hand-assembled")
    func theShortSpellingRoutes() {
        #expect(NotificationRouter.route(forEntityType: "order", entityId: "abc")
                == .orderDetail(orderId: "fulfillment:abc"))
    }

    @Test("a direct order routes to its own rail")
    func theDirectRailRoutes() {
        #expect(NotificationRouter.route(forEntityType: "direct_order", entityId: "abc")
                == .orderDetail(orderId: "direct:abc"))
    }

    @Test("an APNs envelope resolves the same way, and carries its log id")
    func theApnsEnvelopeResolves() {
        let resolved = NotificationRouter.resolve(apnsUserInfo: [
            "entity_type": "fulfillment_order",
            "entity_id": "order-1",
            "notification_log_id": "log-1",
        ])
        #expect(resolved.route == .orderDetail(orderId: "fulfillment:order-1"))
        #expect(resolved.notificationLogId == "log-1")
    }

    @Test("an order row with no entity id routes nowhere rather than to a broken screen")
    func aMissingIdRoutesNowhere() {
        #expect(NotificationRouter.route(forEntityType: "fulfillment_order", entityId: nil) == nil)
        #expect(NotificationRouter.route(forEntityType: "fulfillment_order", entityId: "") == nil)
    }

    // MARK: The bell's bucket

    @Test("an order gets its own bucket, so it never arrives as 'New pieces for you'")
    func theBellBucketsAnOrder() {
        #expect(AppNotificationType(entityType: "fulfillment_order") == .order)
        #expect(AppNotificationType(entityType: "direct_order") == .order)
        #expect(AppNotificationType(serverType: "order_shipped") == .order)
        #expect(AppNotificationType.order.defaultTitle == "An update on your order")
        // The bucket's own spelling round-trips to the router's.
        #expect(AppNotificationType.order.entityType == "fulfillment_order")
    }

    @Test("a bell row for an order lands on the order screen")
    func theBellRowRoutes() {
        let notification = AppNotification(
            type: .order,
            title: "Order #1042 shipped",
            body: "Your order is on its way.",
            timestamp: Date(),
            entityType: "fulfillment_order",
            entityId: "order-1"
        )
        #expect(notification.route == .orderDetail(orderId: "fulfillment:order-1"))
    }

    // MARK: The tab

    @Test("both order routes belong to Studio, beside the money they came out of")
    func theOrderRoutesLiveInStudio() {
        #expect(RouteTabTable.tab(for: .orderList) == .studio)
        #expect(RouteTabTable.tab(for: .orderDetail(orderId: "fulfillment:o1")) == .studio)
    }

    @Test("neither order route is a tab root — both are pushed")
    func neitherIsATabRoot() {
        #expect(!RouteTabTable.isTabRoot(.orderList))
        #expect(!RouteTabTable.isTabRoot(.orderDetail(orderId: "fulfillment:o1")))
    }

    @Test("the canonical names are the words on glass (C4)")
    func theNamesAreCanonical() {
        #expect(AppRoute.orderList.displayName == "Ordered")
        #expect(AppRoute.orderDetail(orderId: "x").displayName == "Order")
    }

    // MARK: The Studio row

    @Test("the Ordered row draws only where an order exists, and names the furthest state")
    @MainActor
    func theStudioRowDrawsFromOrders() {
        #expect(StudioQueueBuilder.orderRecordRow([]) == nil)

        let base = Date(timeIntervalSince1970: 1_787_000_000)
        func order(_ id: String, _ state: ClientOrderState) -> ClientOrder {
            ClientOrder(
                rail: .fulfillment, recordId: id, title: "A piece",
                additionalLineCount: 0, productId: nil, amountCents: 1000,
                currency: "USD", placedAt: base, state: state,
                stateEnteredAt: base, placedBy: .reader, projectId: nil,
                designerId: nil, carrier: nil, tracking: nil, shippedAt: nil,
                deliveredAt: nil, currentEta: nil, directOrderId: nil
            )
        }

        let row = StudioQueueBuilder.orderRecordRow([
            order("a", .confirmed), order("b", .shipped),
        ])
        #expect(row?.title == "Ordered")
        #expect(row?.detail == "2 pieces on their way")
        #expect(row?.meta == "Shipped")
        #expect(row?.route == .orderList)

        // "On its way" counts only what is live and has not arrived. A
        // delivered order is not on its way, and neither is a refunded one.
        let withDelivered = StudioQueueBuilder.orderRecordRow([
            order("a", .confirmed), order("b", .delivered), order("c", .refunded),
        ])
        #expect(withDelivered?.detail == "1 piece on its way")
        #expect(withDelivered?.meta == "Confirmed")

        let allArrived = StudioQueueBuilder.orderRecordRow([
            order("a", .delivered), order("b", .delivered),
        ])
        #expect(allArrived?.detail == "2 pieces delivered")
        #expect(allArrived?.meta == "Delivered")

        // A refunded order is in the list, is not "on its way", and is not
        // what the meta reports.
        let refundedOnly = StudioQueueBuilder.orderRecordRow([order("c", .refunded)])
        #expect(refundedOnly?.meta == nil)
        #expect(refundedOnly?.detail == "1 past order")
    }

    @Test("the Ordered row rides the Studio's Money & documents group")
    @MainActor
    func theRowLandsInMoneyAndDocuments() {
        let base = Date(timeIntervalSince1970: 1_787_000_000)
        let snapshot = StudioQueueBuilder.build(StudioQueueInput(
            projects: [], decisions: [], proposals: [], invoices: [],
            documents: [], threads: [], notifications: [],
            currentUserId: nil, now: base,
            orders: [ClientOrder(
                rail: .fulfillment, recordId: "ful-1", title: "A piece",
                additionalLineCount: 0, productId: nil, amountCents: 1000,
                currency: "USD", placedAt: base, state: .shipped,
                stateEnteredAt: base, placedBy: .reader, projectId: nil,
                designerId: nil, carrier: nil, tracking: nil, shippedAt: nil,
                deliveredAt: nil, currentEta: nil, directOrderId: nil
            )]
        ))
        let money = snapshot.section(.moneyAndDocuments)
        #expect(money.rows.first?.id == "records.orders")
    }

    @Test("no orders leaves the Studio exactly as it was")
    @MainActor
    func noOrdersChangesNothing() {
        let base = Date(timeIntervalSince1970: 1_787_000_000)
        let snapshot = StudioQueueBuilder.build(StudioQueueInput(
            projects: [], decisions: [], proposals: [], invoices: [],
            documents: [], threads: [], notifications: [],
            currentUserId: nil, now: base
        ))
        #expect(!snapshot.section(.moneyAndDocuments).rows.contains { $0.id == "records.orders" })
    }
}
