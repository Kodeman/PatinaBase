//
//  OrderDetailView.swift
//  Patina
//
//  One order, in full. The piece, the money, where it is, and the two people a
//  homeowner actually wants when something is wrong: the carrier, and whoever
//  is responsible.
//
//  Direction B §5's returns-and-damage gate is a condition on this screen, not
//  a decoration: "one config-driven responsibility paragraph … and one
//  reachable human — an address or a number, not the word 'support'". Both come
//  from `get_direct_order_terms()` and both draw only when the config holds
//  them. Nothing here invents a policy.
//

import SwiftUI

struct OrderDetailView: View {
    let orderId: String

    @Environment(\.appCoordinator) private var coordinator
    @Environment(\.openURL) private var openURL
    @State private var service = OrdersService.shared

    private var order: ClientOrder? { service.order(withId: orderId) }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                if let order {
                    header(order)
                    stateBlock(order)
                    moneyBlock(order)
                    actions(order)
                    responsibility
                } else if service.isLoading {
                    PatinaLoadingState().padding(.top, 60)
                } else {
                    PatinaEmptyState(
                        icon: "shippingbox",
                        title: "We couldn’t find that order",
                        message: "It may have been refunded, or it belongs to another account."
                    )
                    .padding(.top, 80)
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, MoneyScreenMetrics.bottomClearance(
                houseFirst: coordinator.isHouseFirstRoot
            ))
        }
        .background(PatinaColors.Background.primary)
        .patinaScreen(title: nil)
        .task { await service.refreshIfNeeded() }
        .refreshable { await service.refresh() }
    }

    // MARK: Blocks

    private func header(_ order: ClientOrder) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            MonoLabel(text: "ORDERED")
                .tracking(2)
            Text(order.title)
                .font(PatinaTypography.h3)
                .foregroundStyle(PatinaColors.Text.primary)
            Text(ClientOrderCopy.attributionFooter(order, projectName: projectName(order)))
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.muted)
        }
        .padding(.top, 56)
    }

    @ViewBuilder
    private func stateBlock(_ order: ClientOrder) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if order.state.drawsRail {
                OrderRail(state: order.state)
            }
            Text(ClientOrderCopy.stateLine(order))
                .font(PatinaTypography.bodyMedium)
                .foregroundStyle(PatinaColors.Text.primary)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func moneyBlock(_ order: ClientOrder) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            MonoLabel(text: "PAID")
                .tracking(0.4)
            Text(PatinaCurrency.format(
                cents: order.amountCents, currencyCode: order.currency
            ))
            .font(PatinaTypography.h4)
            .foregroundStyle(PatinaColors.Text.primary)
            if let placed = order.placedAt {
                Text(DateDisplay.long(placed))
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
        }
    }

    @ViewBuilder
    private func actions(_ order: ClientOrder) -> some View {
        VStack(spacing: 0) {
            if let tracking = CarrierTracking.url(carrier: order.carrier, tracking: order.tracking) {
                rowButton(CarrierTracking.label(carrier: order.carrier)) {
                    openURL(tracking)
                }
                divider
            }
            if order.isAttributed {
                rowButton(messageLabel(order)) {
                    coordinator.navigate(to: .threadList)
                }
                divider
            }
            if let piece = order.productId {
                rowButton("See the piece") {
                    coordinator.navigate(to: .pieceDetail(pieceId: piece))
                }
                if service.terms?.reachableContact != nil { divider }
            }
            if let contact = service.terms?.reachableContact {
                rowButton("Report a problem") { reach(contact) }
            }
        }
        .padding(.horizontal, 16)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    /// The responsibility paragraph, when the config holds one. Direction B §5
    /// prints it on the order sheet AND here; C1 owns the sheet.
    @ViewBuilder
    private var responsibility: some View {
        if let paragraph = service.terms?.paragraph {
            VStack(alignment: .leading, spacing: 6) {
                MonoLabel(text: "IF SOMETHING'S WRONG")
                    .tracking(0.4)
                Text(paragraph)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // MARK: Pieces

    private var divider: some View {
        Rectangle()
            .fill(PatinaColors.pearl)
            .frame(height: 1)
    }

    private func rowButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Text(title)
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.interactive)
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            // 44 pt, per SP-19.
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func messageLabel(_ order: ClientOrder) -> String {
        guard let name = order.designerFirstName else { return "Message your designer" }
        return "Message \(name)"
    }

    private func projectName(_ order: ClientOrder) -> String? {
        guard let projectId = order.projectId else { return nil }
        return BadgeCountService.shared.projects.first { $0.id == projectId }?.name
    }

    /// The contact resolves to whatever it is: an address opens mail, a number
    /// opens the dialler, and anything else is left to the system rather than
    /// forced into a scheme it does not fit.
    private func reach(_ contact: String) {
        let trimmed = contact.trimmingCharacters(in: .whitespacesAndNewlines)
        if let url = OrderContactLink.url(for: trimmed) { openURL(url) }
    }
}

/// Turning the config's one contact into something tappable. Named and pure so
/// a test can pin it — the string is Kody's copy and will change.
enum OrderContactLink {
    static func url(for contact: String) -> URL? {
        let trimmed = contact.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        if trimmed.lowercased().hasPrefix("http://") || trimmed.lowercased().hasPrefix("https://") {
            return URL(string: trimmed)
        }
        if trimmed.contains("@"), !trimmed.contains(" ") {
            return URL(string: "mailto:\(trimmed)")
        }
        let digits = trimmed.filter { $0.isNumber || $0 == "+" }
        if digits.count >= 10, trimmed.allSatisfy({
            $0.isNumber || "+()- .".contains($0)
        }) {
            return URL(string: "tel:\(digits)")
        }
        return nil
    }
}
