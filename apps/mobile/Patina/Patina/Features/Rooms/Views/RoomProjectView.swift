//
//  RoomProjectView.swift
//  Patina
//
//  Full project view for a single room. Implements the Room System spec's
//  populated and empty variants.
//

import SwiftUI
import SwiftData

struct RoomProjectView: View {
    let roomId: UUID

    @Environment(\.modelContext) private var modelContext
    @Environment(\.appCoordinator) private var coordinator
    @Query private var rooms: [RoomModel]

    // MARK: - Budget context (from user preferences / quiz; defaults for now)
    private let budgetMinCents: Int = 200_000   // $2K
    private let budgetMaxCents: Int = 500_000   // $5K

    @State private var actionItem: SavedItem?

    init(roomId: UUID) {
        self.roomId = roomId
        let predicate = #Predicate<RoomModel> { $0.id == roomId }
        _rooms = Query(filter: predicate)
    }

    private var room: RoomModel? { rooms.first }

    var body: some View {
        ZStack {
            PatinaColors.Background.primary.ignoresSafeArea()

            if let room {
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 0) {
                        hero(for: room)
                        header(for: room)
                        statRow(for: room)
                        if room.items.isEmpty {
                            SpatialMetadataRow(room: room)
                                .padding(.horizontal, 20)
                                .padding(.bottom, 16)
                            emptyBlock(for: room)
                        } else {
                            let level = BudgetAssessment.level(
                                totalCents: room.totalInvestmentCents,
                                minCents: budgetMinCents,
                                maxCents: budgetMaxCents
                            )
                            if BudgetAssessment.shouldShowBar(level) {
                                RoomBudgetBar(
                                    totalCents: room.totalInvestmentCents,
                                    minCents: budgetMinCents,
                                    maxCents: budgetMaxCents
                                )
                                .padding(.horizontal, 20)
                                .padding(.bottom, 16)
                            }
                            itemsSection(for: room)
                            budgetNudge(for: level, room: room)
                            cta(primary: "Get design help with this room") {
                                coordinator.presentedSheet = .designServices(
                                    roomId: room.id,
                                    preselectedScanIds: []
                                )
                            }
                        }
                        Spacer().frame(height: 100)
                    }
                }
                .ignoresSafeArea(edges: .top)
            } else {
                notFoundState
            }
        }
        .sheet(item: $actionItem) { item in
            ItemActionMenu(item: item) { action in
                handle(action, item: item)
            }
            .presentationDetents([.medium])
        }
        // U18: standard pushed-screen chrome — covers both the populated
        // room (its own header carries the title) and `notFoundState`
        // below (U31), which previously had no back affordance at all.
        .patinaScreen(title: nil)
    }

    // MARK: - Room not found (U31)

    /// U31: the local room row is gone (e.g. removed on another device, or a
    /// stale deep link) — real empty-state copy; the back affordance comes
    /// from the screen-wide `.patinaScreen` chrome, and "Your rooms" gives a
    /// forward path so this isn't a dead end.
    private var notFoundState: some View {
        VStack(spacing: 6) {
            Text("This room isn't on this phone")
                .font(PatinaTypography.h4)
                .foregroundStyle(PatinaColors.Text.primary)
            Text("It may have been removed.")
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.muted)

            Button {
                coordinator.navigate(to: .yourSpaces)
            } label: {
                Text("Your rooms")
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.inverse)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(Capsule().fill(PatinaColors.Interactive.active))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 40)
            .padding(.top, 12)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Designer Lead CTA

    /// Budget-level nudge under the item list. Only the `.overRange` case is
    /// a real invitation into the design-request flow (Companion copy
    /// "Get design help with this room →"); `.atRange` is informational only
    /// ("You're at your budget for {room}") and must not read as a link —
    /// rendering it in the same interactive color/Button as `.overRange`
    /// silently looked tappable and did nothing (U05).
    @ViewBuilder
    private func budgetNudge(for level: BudgetLevel, room: RoomModel) -> some View {
        if let nudge = BudgetAssessment.companionNudge(for: level, roomName: room.name) {
            if level == .overRange {
                Button {
                    coordinator.presentedSheet = .designServices(
                        roomId: room.id,
                        preselectedScanIds: []
                    )
                } label: {
                    Text(nudge)
                        .font(.custom("PlayfairDisplay-Italic", size: 13, relativeTo: .footnote))
                        .foregroundStyle(PatinaColors.Text.interactive)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 20)
                .padding(.top, 12)
            } else {
                Text(nudge)
                    .font(.custom("PlayfairDisplay-Italic", size: 13, relativeTo: .footnote))
                    .foregroundStyle(PatinaColors.Text.muted)
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
            }
        }
    }

    // MARK: - Sections

    private func hero(for room: RoomModel) -> some View {
        ZStack(alignment: .top) {
            heroGradient(for: room)
                .frame(height: 240)
                .clipped()
            LinearGradient(
                colors: [.clear, PatinaColors.Background.primary],
                startPoint: .top, endPoint: .bottom
            )
            .frame(height: 120)
            .frame(maxHeight: .infinity, alignment: .bottom)

            HStack {
                Spacer()
                Button {
                    coordinator.navigate(to: .roomSettings(roomId: room.id))
                } label: {
                    Text("⚙")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(PatinaColors.Text.primary)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(PatinaColors.Background.primary.opacity(0.92)))
                        .overlay(Circle().stroke(PatinaColors.pearl, lineWidth: 0.5))
                }
                .buttonStyle(.plain)
            }
            .padding(.top, 56)
            .padding(.horizontal, 18)
        }
        .frame(height: 240)
    }

    private func heroGradient(for room: RoomModel) -> LinearGradient {
        switch room.roomType.lowercased() {
        case "living", "living_room", "living room": return PatinaGradients.warm
        case "bedroom":                               return PatinaGradients.dusk
        case "office":                                return PatinaGradients.sageGradient
        case "dining", "dining_room":                 return PatinaGradients.earth
        case "kitchen":                               return PatinaGradients.rattan
        default:                                      return PatinaGradients.linen
        }
    }

    private func header(for room: RoomModel) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(room.name)
                .font(PatinaTypography.h2)
                .foregroundStyle(PatinaColors.Text.primary)
            Text(metaLine(for: room))
                .font(PatinaTypography.monoSmall)
                .tracking(0.4)
                .textCase(.uppercase)
                .foregroundStyle(PatinaColors.Text.muted)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 16)
    }

    private func metaLine(for room: RoomModel) -> String {
        var parts: [String] = []
        if let sf = room.squareFeet { parts.append(String(format: "%.0f sq ft", sf)) }
        if !room.orientationLabel.isEmpty { parts.append(room.orientationLabel) }
        if room.windowCount > 0 { parts.append("\(room.windowCount) window\(room.windowCount == 1 ? "" : "s")") }
        if room.hasBeenScanned {
            parts.append("Scanned \(Self.scannedDateFormatter.string(from: room.updatedAt))")
        }
        return parts.joined(separator: " · ")
    }

    /// Shared formatter — avoids a `DateFormatter` allocation on every render of `metaLine`.
    private static let scannedDateFormatter: DateFormatter = {
        let fmt = DateFormatter()
        fmt.dateFormat = "MMM d"
        return fmt
    }()

    private func statRow(for room: RoomModel) -> some View {
        HStack(spacing: 8) {
            statCell(value: "\(room.items.count)", label: "Items")
            statCell(value: room.averageMatchScore.map { "\($0)%" } ?? "—", label: "Match")
            statCell(value: "\(room.arReadyCount)", label: "In AR")
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 16)
    }

    private func statCell(value: String, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.custom("PlayfairDisplay-Medium", size: 20, relativeTo: .title3))
                .foregroundStyle(PatinaColors.Text.primary)
            Text(label)
                .font(.custom("DMMono-Regular", size: 7, relativeTo: .caption2))
                .tracking(0.6)
                .textCase(.uppercase)
                .foregroundStyle(PatinaColors.Text.muted)
        }
        .frame(maxWidth: .infinity)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(PatinaColors.Background.secondary)
        )
    }

    private func itemsSection(for room: RoomModel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Your Items")
                    .font(PatinaTypography.eyebrow)
                    .tracking(1.0)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.Text.muted)
                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 8)

            ForEach(Array(room.items.enumerated()), id: \.element.id) { pair in
                RoomItemRow(
                    item: pair.element,
                    // R10: tapping the row body opens the piece detail —
                    // mirrors the .viewDetail action in handle(_:item:).
                    onTap: {
                        coordinator.navigate(to: .pieceDetail(pieceId: pair.element.productId))
                    },
                    onActions: {
                        actionItem = pair.element
                    }
                )
                if pair.offset < room.items.count - 1 {
                    Rectangle()
                        .fill(PatinaColors.pearl)
                        .frame(height: 1)
                        .padding(.horizontal, 20)
                }
            }
        }
    }

    private func emptyBlock(for room: RoomModel) -> some View {
        VStack(spacing: 8) {
            Text("✦").font(.system(size: 40))
            Text("A blank canvas")
                .font(.custom("PlayfairDisplay-Regular", size: 18, relativeTo: .title3))
                .foregroundStyle(PatinaColors.Text.primary)
            Text("We've already found pieces that would fit this space. Browse your Daily Room to start building this room.")
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.muted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 240)
            cta(primary: "Browse Picks for This Room") {
                // U07: this used to root-reset to .heroFrame regardless of
                // whether the room synced. Once a room has a remote id the
                // room-scoped emergence carries real context; local-only
                // rooms fall back to the unscoped picks feed.
                if room.remoteId != nil {
                    coordinator.navigate(to: .roomEmergence(roomId: room.id))
                } else {
                    coordinator.navigate(to: .emergence(pieceId: nil))
                }
            }
            .padding(.top, 14)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }

    private func cta(primary title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.inverse)
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(Capsule().fill(PatinaColors.Interactive.active))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 20)
        .padding(.top, 16)
    }

    // MARK: - Item actions

    private func handle(_ action: ItemActionMenu.Action, item: SavedItem) {
        let store = RoomStore(context: modelContext)
        switch action {
        case .viewAR:
            coordinator.navigate(to: .arPlacement(
                productId: item.productId,
                roomRemoteId: room?.remoteId
            ))
        case .viewDetail:
            coordinator.navigate(to: .pieceDetail(pieceId: item.productId))
        case .move, .copy:
            coordinator.presentedSheet = .moveItem(itemId: item.id)
        case .remove:
            store.removeItem(item)
        }
        actionItem = nil
    }
}
