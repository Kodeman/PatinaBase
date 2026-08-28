//
//  OrderedListView.swift
//  Patina
//
//  Studio → Ordered. Direction B §11 M8: "answer T8 — 'where is it' — in one
//  screen, for everything on the job, not only what you bought yourself."
//
//  Deliberately UNFLAGGED. `direct-orders` gates *Buy* (R3), and M8's second
//  card is a piece the designer bought — which exists whether or not the client
//  can buy anything herself. Gating this list would hide a designer-sourced
//  order from the client whose house it is going into.
//

import SwiftUI

struct OrderedListView: View {
    @Environment(\.appCoordinator) private var coordinator
    @State private var service = OrdersService.shared

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) {
                header
                content
            }
            .padding(.bottom, MoneyScreenMetrics.bottomClearance(
                houseFirst: coordinator.isHouseFirstRoot
            ))
        }
        .background(PatinaColors.Background.primary)
        .patinaScreen(title: nil)
        .task { await service.refreshIfNeeded() }
        .refreshable { await service.refresh() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            MonoLabel(text: "ORDERED")
                .tracking(2)
            Text("Your orders")
                .font(PatinaTypography.h3)
                .foregroundStyle(PatinaColors.Text.primary)
        }
        .padding(.top, 56)
        .padding(.horizontal, 24)
    }

    @ViewBuilder
    private var content: some View {
        if service.isLoading && service.orders.isEmpty {
            PatinaLoadingState()
                .padding(.top, 60)
        } else if service.lastRefreshFailed && service.orders.isEmpty {
            // Patina's own sentence. The server's words went to the log.
            PatinaErrorState(
                message: "We couldn’t reach your orders. Check your connection and try again.",
                action: { Task { await service.refresh() } }
            )
            .padding(.top, 60)
        } else if service.orders.isEmpty {
            emptyView
        } else {
            VStack(spacing: 14) {
                ForEach(service.orders) { order in
                    Button {
                        coordinator.navigate(to: .orderDetail(orderId: order.id))
                    } label: {
                        OrderCard(order: order, projectName: projectName(for: order))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 12)
        }
    }

    /// M8's states row: "no orders → the section does not render". This screen
    /// is reachable directly from the Studio row, so it names itself rather
    /// than drawing a blank.
    private var emptyView: some View {
        PatinaEmptyState(
            icon: "shippingbox",
            title: "Nothing ordered yet",
            message: "When you or your designer order a piece, you can follow it here."
        )
        .padding(.top, 80)
    }

    private func projectName(for order: ClientOrder) -> String? {
        guard let projectId = order.projectId else { return nil }
        return BadgeCountService.shared.projects.first { $0.id == projectId }?.name
    }
}

// MARK: - Card

struct OrderCard: View {
    let order: ClientOrder
    let projectName: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 2) {
                if let eyebrow = ClientOrderCopy.placedByLabel(order) {
                    Text(eyebrow)
                        .font(PatinaTypography.monoLabel)
                        .tracking(0.4)
                        .textCase(.uppercase)
                        .foregroundStyle(PatinaColors.Text.muted)
                }
                Text(order.title)
                    .font(PatinaTypography.h5)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .multilineTextAlignment(.leading)
                if order.additionalLineCount > 0 {
                    Text(order.additionalLineCount == 1
                         ? "and one more piece"
                         : "and \(order.additionalLineCount) more pieces")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                }
            }

            // No painted tracker. A direct order that has not reached the
            // fulfillment rail has no line state to draw, so it draws none.
            if order.state.drawsRail {
                OrderRail(state: order.state)
                    .padding(.top, 14)
            }

            Text(ClientOrderCopy.stateLine(order))
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.primary)
                .padding(.top, order.state.drawsRail ? 10 : 12)

            Text(ClientOrderCopy.moneyLine(order))
                .font(PatinaTypography.monoLabel)
                .tracking(0.4)
                .textCase(.uppercase)
                .foregroundStyle(PatinaColors.Text.muted)
                .padding(.top, 4)

            Text(ClientOrderCopy.attributionFooter(order, projectName: projectName))
                .font(PatinaTypography.captionSmall)
                .foregroundStyle(PatinaColors.Text.muted)
                .padding(.top, 10)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "\(order.title). \(ClientOrderCopy.stateLine(order)) "
            + "\(ClientOrderCopy.attributionFooter(order, projectName: projectName))"
        )
        .accessibilityIdentifier("Ordered.Card.\(order.id)")
    }
}

// MARK: - The four-step rail

/// `Confirmed · In production · Shipped · Delivered`, current step in charcoal
/// and the rest in pearl — M8's callout 3.
///
/// It draws only for a state that is actually ON the rail. There is no
/// "pending" step and no step for `transmitted` / `acknowledged`: those are
/// stages between Patina and a workshop, and inventing a step the client was
/// never told about is the painted tracker this wave exists to avoid.
struct OrderRail: View {
    let state: ClientOrderState

    var body: some View {
        HStack(spacing: 6) {
            ForEach(Array(ClientOrderState.railSteps.enumerated()), id: \.offset) { index, step in
                VStack(alignment: .leading, spacing: 6) {
                    Capsule()
                        .fill(fill(for: index))
                        .frame(height: 3)
                    Text(step.railLabel ?? "")
                        .font(PatinaTypography.captionSmall)
                        .textCase(.uppercase)
                        .foregroundStyle(
                            index == currentIndex
                            ? PatinaColors.Text.primary
                            : PatinaColors.Text.muted
                        )
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(state.railLabel.map { "Stage: \($0)" } ?? "")
    }

    private var currentIndex: Int { state.railIndex ?? 0 }

    private func fill(for index: Int) -> Color {
        if index < currentIndex { return PatinaColors.clay }
        if index == currentIndex { return PatinaColors.Text.primary }
        return PatinaColors.pearl
    }
}
