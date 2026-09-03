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
    /// One re-read per appearance, and no more — see
    /// `OrdersService.shouldRefetchOnMiss`.
    @State private var refetchedOnMiss = false

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
                } else if service.isLoading || !refetchedOnMiss {
                    PatinaLoadingState().padding(.top, 60)
                } else if service.lastRefreshFailed {
                    // We could not reach the orders at all — that is not the
                    // same fact as "this order does not exist", and saying the
                    // second when the first is true is the lie.
                    PatinaErrorState(
                        message: "We couldn’t reach your orders. "
                            + "Check your connection and try again.",
                        action: { Task { await service.refresh() } }
                    )
                    .padding(.top, 60)
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
        .task {
            await service.refreshIfNeeded()
            if OrdersService.shouldRefetchOnMiss(
                found: order != nil, alreadyRefetched: refetchedOnMiss
            ) {
                await service.refresh()
            }
            refetchedOnMiss = true
        }
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

    /// Money draws only for an order the reader paid for herself, and the label
    /// follows the state — see `ClientOrderCopy.moneyLabel`. A designer-sourced
    /// order prints none: the capture total is not this reader's bill and
    /// `intake_at` is not a payment date.
    @ViewBuilder
    private func moneyBlock(_ order: ClientOrder) -> some View {
        if let label = ClientOrderCopy.moneyLabel(order) {
            VStack(alignment: .leading, spacing: 6) {
                MonoLabel(text: label)
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
    }

    /// The rows are built as a list first and the dividers drawn between them,
    /// so no arrangement can leave a rule hanging under the last row, and an
    /// empty list draws no card at all rather than a padded box around nothing.
    private func actionRows(_ order: ClientOrder) -> [OrderDetailAction] {
        var rows: [OrderDetailAction] = []
        if let tracking = CarrierTracking.url(carrier: order.carrier, tracking: order.tracking) {
            rows.append(.track(label: CarrierTracking.label(carrier: order.carrier), url: tracking))
        }
        if order.isAttributed {
            rows.append(.message(label: messageLabel(order)))
        }
        if let piece = order.productId {
            rows.append(.piece(pieceId: piece))
        }
        if let contact = service.terms?.reachableContact {
            // A contact that resolves to no scheme is printed, not offered as a
            // tap that would do nothing. Today's config value is an address;
            // the moment Kody's copy becomes "Patina Concierge, 9–5 CT" this is
            // the branch that keeps the row honest.
            if let url = OrderContactLink.url(for: contact) {
                rows.append(.report(url: url))
            } else {
                rows.append(.contact(text: contact))
            }
        }
        return rows
    }

    @ViewBuilder
    private func actions(_ order: ClientOrder) -> some View {
        let rows = actionRows(order)
        if !rows.isEmpty {
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                    if index > 0 { divider }
                    actionRow(row)
                }
            }
            .padding(.horizontal, 16)
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
    }

    @ViewBuilder
    private func actionRow(_ row: OrderDetailAction) -> some View {
        switch row {
        case .track(let label, let url):
            rowButton(label) { openURL(url) }
        case .message(let label):
            rowButton(label) { coordinator.navigate(to: .threadList) }
        case .piece(let pieceId):
            rowButton("See the piece") {
                coordinator.navigate(to: .pieceDetail(pieceId: pieceId))
            }
        case .report(let url):
            rowButton("Report a problem") { openURL(url) }
        case .contact(let text):
            VStack(alignment: .leading, spacing: 2) {
                Text("Report a problem")
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.primary)
                Text(text)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .textSelection(.enabled)
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        }
    }

    /// The responsibility paragraph, when the config holds one. Direction B §5
    /// prints it on the order sheet AND here; C1 owns the sheet.
    @ViewBuilder
    private var responsibility: some View {
        if let paragraph = service.terms?.paragraph {
            VStack(alignment: .leading, spacing: 6) {
                MonoLabel(text: "IF SOMETHING’S WRONG")
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
            .fill(PatinaColors.Border.hairline)
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

}

/// One row of the order's action card. Named so the rows can be assembled
/// before they are drawn — that is what keeps the dividers between them and
/// the card off the screen when there are none.
enum OrderDetailAction: Identifiable {
    case track(label: String, url: URL)
    case message(label: String)
    case piece(pieceId: String)
    /// The config's contact, resolved to something tappable.
    case report(url: URL)
    /// The config's contact, printed plainly because it resolves to no scheme
    /// (T5's third branch). A row that cannot act must not look like one.
    case contact(text: String)

    var id: String {
        switch self {
        case .track: return "track"
        case .message: return "message"
        case .piece: return "piece"
        case .report: return "report"
        case .contact: return "contact"
        }
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
