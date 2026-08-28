//
//  OrderPlacedView.swift
//  Patina
//
//  M5c. What a person sees the moment the webhook settles the row.
//
//  Two departures from the mock, both required by the money rules and both
//  deliberate:
//
//  1. **No painted tracker.** The mock's "We'll tell you when it ships." is
//     kept as "We'll email you when it ships." — the email is a thing the rail
//     actually does (settle enqueues `fulfillment_intake`, which mints the
//     `fulfillment_orders` row the notify templates address). A step rail
//     would be a picture of a state machine this order has not entered.
//  2. **No "Notify me" row unless push is already authorized.** Q7 rules the
//     permission ask, its copy, and where it happens; an order confirmation is
//     not that room, and a button that asks for nothing and writes nothing is
//     décor. Where authorization is already held the screen states the fact
//     instead of offering a control.
//

import SwiftUI
import UserNotifications

struct OrderPlacedView: View {

    let order: DirectOrder
    let responsibilityParagraph: String?
    let contactLine: String?
    let soldBy: String
    /// Whether the session actually collected delivery and tax. Passed from
    /// the terms the screen already read — the mock's "· total with delivery
    /// and tax" is printed only where that is true.
    let taxShippingEnabled: Bool
    /// Given the direct-order id. `nil` where no order destination exists yet
    /// — the control is then not drawn at all rather than pushed at a screen
    /// that would tell a person who paid ninety seconds ago that we cannot
    /// find their order.
    let onSeeOrder: ((String) -> Void)?
    let onBackToToday: () -> Void

    @State private var pushAuthorized = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer(minLength: 0)

            StrataMarkView(color: PatinaColors.mocha, accessibility: .decorative)
                .padding(.bottom, 22)

            Text("Order placed.")
                .font(PatinaTypography.displaySmall)
                .foregroundStyle(PatinaColors.Text.primary)
                .padding(.bottom, 12)
                .accessibilityIdentifier("OrderPlaced.Title")

            Text(Self.summaryLine(order, taxShippingEnabled: taxShippingEnabled))
                .font(PatinaTypography.body)
                .foregroundStyle(PatinaColors.Text.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 10)
                .accessibilityIdentifier("OrderPlaced.Summary")

            Text(Self.receiptLine)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.muted)
                .padding(.bottom, 10)

            Text(Self.shipLine)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.muted)
                .padding(.bottom, pushAuthorized ? 6 : 22)
                .accessibilityIdentifier("OrderPlaced.ShipLine")

            if pushAuthorized {
                Text(Self.notifyLine)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .padding(.bottom, 22)
                    .accessibilityIdentifier("OrderPlaced.NotifyLine")
            }

            responsibility

            Spacer(minLength: 0)

            VStack(spacing: 6) {
                if let onSeeOrder {
                    PatinaButton("See your order", style: .primary) { onSeeOrder(order.id) }
                        .accessibilityIdentifier("OrderPlaced.SeeOrder")
                    Button("Back to Today") { onBackToToday() }
                        .font(PatinaTypography.uiSmall)
                        .foregroundStyle(PatinaColors.Text.interactive)
                        .accessibilityIdentifier("OrderPlaced.BackToToday")
                } else {
                    PatinaButton("Back to Today", style: .primary) { onBackToToday() }
                        .accessibilityIdentifier("OrderPlaced.BackToToday")
                }
            }
            .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 24)
        .padding(.top, 96)
        .padding(.bottom, 36)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PatinaColors.Background.primary)
        .task {
            // Read-only. Reading the setting must never consume the one ask.
            let settings = await UNUserNotificationCenter.current().notificationSettings()
            pushAuthorized = settings.authorizationStatus == .authorized
        }
    }

    @ViewBuilder
    private var responsibility: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(soldBy)
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.muted)
            if let responsibilityParagraph {
                Text(responsibilityParagraph)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let contactLine {
                Text(contactLine)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Copy

    /// `Heirloom Oak Dining Table · $4,200.00` — the piece and the total the
    /// session actually took. The mock's trailing "total with delivery and tax"
    /// is printed only where the server says those were collected; where it
    /// does not, naming them would be the same untruth the order sheet refuses.
    /// No default: the caller holds the terms, and a defaulted `false` is how
    /// the enabled branch became unreachable from the app in the first place.
    static func summaryLine(_ order: DirectOrder, taxShippingEnabled: Bool) -> String {
        let base = "\(order.productName) · \(order.formattedTotal)"
        return taxShippingEnabled ? "\(base) · total with delivery and tax" : base
    }

    static let receiptLine = "A receipt is on its way to your inbox."
    static let shipLine = "We'll email you when it ships."
    static let notifyLine = "You'll get a notification too."
}
