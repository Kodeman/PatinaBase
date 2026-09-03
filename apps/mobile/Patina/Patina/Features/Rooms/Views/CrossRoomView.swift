//
//  CrossRoomView.swift
//  Patina
//
//  All items across every room. Tabs: All / By Category / By Maker.
//  Tap an item to view its detail; use the row's ⋯ to move or copy it
//  to another room (U16).
//

import SwiftUI
import SwiftData

struct CrossRoomView: View {
    enum Tab: Hashable { case all, category, maker }

    @Environment(\.modelContext) private var modelContext
    @Environment(\.appCoordinator) private var coordinator
    @Query(sort: \SavedItem.addedAt, order: .reverse) private var items: [SavedItem]

    @State private var tab: Tab = .all

    var body: some View {
        VStack(spacing: 0) {
            header
            tabs
            ScrollView {
                LazyVStack(spacing: 0) {
                    // U31: `items` empty implies every grouped dictionary is
                    // also empty, so one check covers all three tabs.
                    if items.isEmpty {
                        emptyState
                    } else {
                        switch tab {
                        case .all:
                            ForEach(items) { row($0) }
                        case .category:
                            ForEach(groupedByCategory.keys.sorted(), id: \.self) { key in
                                sectionHeader(key.capitalized)
                                ForEach(groupedByCategory[key] ?? []) { row($0) }
                            }
                        case .maker:
                            ForEach(groupedByMaker.keys.sorted(), id: \.self) { key in
                                sectionHeader(key)
                                ForEach(groupedByMaker[key] ?? []) { row($0) }
                            }
                        }
                    }
                    Spacer().frame(height: 120)
                }
            }
        }
        .background(PatinaColors.Background.primary.ignoresSafeArea())
        // U18: standard pushed-screen chrome — the header below carries
        // the title, so the chrome adds only the back chevron.
        .patinaScreen(title: nil)
    }

    // MARK: - Header / Tabs

    private var header: some View {
        HStack(alignment: .bottom) {
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text("All Items")
                    .font(PatinaTypography.h4)
                    .foregroundStyle(PatinaColors.Text.primary)
                Text(summary)
                    .font(PatinaTypography.monoSmall)
                    .tracking(0.4)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.Text.muted)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 56)
        .padding(.bottom, 14)
    }

    private var tabs: some View {
        HStack(spacing: 0) {
            tabButton("All Items", .all)
            tabButton("By Category", .category)
            tabButton("By Maker", .maker)
        }
        .padding(.horizontal, 20)
        .overlay(
            Rectangle()
                .fill(PatinaColors.pearl)
                .frame(height: 1),
            alignment: .bottom
        )
    }

    private func tabButton(_ title: String, _ value: Tab) -> some View {
        Button { tab = value } label: {
            VStack(spacing: 6) {
                Text(title)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(tab == value ? PatinaColors.Text.primary : PatinaColors.Text.muted)
                Rectangle()
                    .fill(tab == value ? PatinaColors.clay : .clear)
                    .frame(height: 2)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Rows

    private func row(_ item: SavedItem) -> some View {
        HStack(spacing: 8) {
            // U16: row body tap is app-wide "tap = detail" convention — the
            // move/copy action lives behind the trailing ⋯ instead.
            rowDetailButton(item)
            rowMoveButton(item)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .overlay(
            Rectangle()
                .fill(PatinaColors.pearl.opacity(0.5))
                .frame(height: 1),
            alignment: .bottom
        )
    }

    private func rowDetailButton(_ item: SavedItem) -> some View {
        Button {
            coordinator.navigate(to: .pieceDetail(pieceId: item.productId))
        } label: {
            HStack(spacing: 12) {
                item.placeholderGradient
                    .frame(width: 56, height: 56)
                    .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.productName)
                        .font(PatinaTypography.uiSmall)
                        .foregroundStyle(PatinaColors.Text.primary)
                    Text(item.makerName)
                        .font(PatinaTypography.monoLabel)
                        .tracking(0.4)
                        .textCase(.uppercase)
                        .foregroundStyle(PatinaColors.Text.muted)
                    if let roomName = item.room?.name {
                        HStack(spacing: 4) {
                            Circle()
                                .fill(roomColor(item.room))
                                .frame(width: 6, height: 6)
                            Text(roomName)
                                .font(PatinaTypography.monoSmall)
                                .foregroundStyle(PatinaColors.Text.secondary)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(
                            Capsule().fill(PatinaColors.Background.secondary)
                        )
                    }
                }
                Spacer(minLength: 0)
                Text(item.fullFormattedPrice)
                    .font(PatinaTypography.h5)
                    .foregroundStyle(PatinaColors.Text.primary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func rowMoveButton(_ item: SavedItem) -> some View {
        Button {
            coordinator.presentedSheet = .moveItem(itemId: item.id)
        } label: {
            Text("⋯")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PatinaColors.Text.primary)
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(PatinaColors.Background.secondary)
                )
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("More actions")
        .accessibilityHint("Move or copy \(item.productName) to another room.")
    }

    // MARK: - Empty state (U31)

    private var emptyState: some View {
        VStack(spacing: 10) {
            Text("✦").font(.system(size: 36))
                .foregroundStyle(PatinaColors.Text.muted)
            Text("No items yet")
                .font(PatinaTypography.h4)
                .foregroundStyle(PatinaColors.Text.primary)
            Text("Pieces you save land here, organized across your rooms.")
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.muted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 260)
            Button {
                coordinator.navigate(to: .emergence(pieceId: nil))
            } label: {
                Text("Browse pieces")
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.inverse)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(Capsule().fill(PatinaColors.Interactive.active))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 40)
            .padding(.top, 6)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 80)
        .padding(.horizontal, 20)
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(PatinaTypography.monoLabel)
            .tracking(0.6)
            .textCase(.uppercase)
            .foregroundStyle(PatinaColors.Text.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 4)
    }

    // MARK: - Aggregates

    private var summary: String {
        // C5-14
        let total = items.reduce(0) { $0 + $1.priceCents }
        let dollarString = PatinaCurrency.formatWholeDollars(cents: total)
        return "\(items.count) items · \(dollarString)"
    }

    private var groupedByCategory: [String: [SavedItem]] {
        Dictionary(grouping: items, by: { $0.thumbGradientKey })
    }

    private var groupedByMaker: [String: [SavedItem]] {
        Dictionary(grouping: items, by: { $0.makerName })
    }

    private func roomColor(_ room: RoomModel?) -> Color {
        guard let room else { return PatinaColors.pearl }
        switch room.roomType.lowercased() {
        case "living", "living_room", "living room": return PatinaColors.clay
        case "bedroom":                               return PatinaColors.dustyBlue
        case "office":                                return PatinaColors.sage
        case "dining", "dining_room":                 return PatinaColors.agedOak
        case "kitchen":                               return PatinaColors.terracotta
        default:                                      return PatinaColors.mocha
        }
    }
}
