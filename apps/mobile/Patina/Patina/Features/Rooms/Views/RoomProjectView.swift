//
//  RoomProjectView.swift
//  Patina
//
//  Full project view for a single room. Implements the Room System spec's
//  populated and empty variants.
//

import SwiftUI
import SwiftData

/// The three lines M4 draws under the room's name, resolved from the model so
/// every rule is testable without rendering anything.
///
/// The room screen only ever opens a local `RoomModel`. A room a project owns
/// lives in `project_rooms`, is drawn read-only on the house rail, and opens
/// the project — so there is no edit act to withhold here, by construction.
struct RoomScreenLines: Equatable {

    /// `18 × 14 ft · 252 sq ft · TYPED, NOT SCANNED` (M4 block 2).
    let meta: String
    /// `$2,400 in saved pieces · budget $9,000` (B §3) — labelled figures,
    /// never a spend figure, and nil where there are neither pieces nor a
    /// budget (never a `—`).
    let figures: String?
    /// `You added the Brass Arc Floor Lamp on Tuesday` — dated state, never
    /// news. The same composer the Today hero uses, so the two cannot drift.
    let state: String?

    static func make(
        room: RoomModel,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> RoomScreenLines {
        var parts: [String] = []
        if let dimensions = RoomHero.dimensions(for: room) { parts.append(dimensions) }
        parts.append(room.hasBeenScanned ? "SCANNED" : "TYPED, NOT SCANNED")
        return RoomScreenLines(
            meta: parts.joined(separator: " · "),
            figures: room.savedPiecesFigureLine,
            state: RoomHero.stateLine(for: room, now: now, calendar: calendar)
        )
    }
}

struct RoomProjectView: View {
    let roomId: UUID

    @Environment(\.modelContext) private var modelContext
    @Environment(\.appCoordinator) private var coordinator
    @Query private var rooms: [RoomModel]

    /// One presentation, not two. A second `.sheet` attached further down the
    /// hierarchy never presented on the sim walk (`waves/w4/h1-notes.md`), so
    /// both sheets go through one `item:` binding on the root.
    enum Presented: Identifiable {
        case itemActions(SavedItem)
        case budget

        var id: String {
            switch self {
            case .itemActions(let item): return "item:\(item.id.uuidString)"
            case .budget: return "budget"
            }
        }
    }

    @State private var presented: Presented?

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
                            // No budget, no bar and no nudge: there is
                            // nothing to measure against, and inventing a
                            // range to measure against is what this replaced.
                            let level = BudgetAssessment.level(
                                totalCents: room.totalInvestmentCents,
                                budgetCents: room.budgetCents
                            )
                            if let level, let budget = room.budgetCents,
                               BudgetAssessment.shouldShowBar(level) {
                                RoomBudgetBar(
                                    totalCents: room.totalInvestmentCents,
                                    budgetCents: budget
                                )
                                .padding(.horizontal, 20)
                                .padding(.bottom, 16)
                            }
                            itemsSection(for: room)
                            if let level { budgetNudge(for: level, room: room) }
                            cta(primary: "Get design help with this room") {
                                coordinator.presentDesignServices(roomId: room.id)
                            }
                        }
                        actsRow(for: room)
                        Spacer().frame(height: 100)
                    }
                }
                .ignoresSafeArea(edges: .top)
            } else {
                notFoundState
            }
        }
        .sheet(item: $presented) { which in
            switch which {
            case .itemActions(let item):
                ItemActionMenu(item: item) { action in
                    handle(action, item: item)
                }
                .presentationDetents([.medium])
            case .budget:
                if let room {
                    RoomBudgetSheet(room: room)
                        .presentationDetents([.medium])
                }
            }
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
                    coordinator.presentDesignServices(roomId: room.id)
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
                        presented = .itemActions(pair.element)
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
        // SP-11: one control, not three. The body copy pointed at the Daily
        // Room, the button pointed at a generic grid, and a link underneath
        // pointed somewhere else again — a stacked triple ask for one act.
        VStack(spacing: 8) {
            Text("✦").font(.system(size: 40))
            Text("A blank canvas")
                .font(.custom("PlayfairDisplay-Regular", size: 18, relativeTo: .title3))
                .foregroundStyle(PatinaColors.Text.primary)
            cta(primary: "Browse pieces for the \(room.name)") {
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

    // MARK: - M4 block 6 — the two ghost acts

    /// `Edit dimensions` and `Set a budget`, side by side. Both are the
    /// person's own numbers on their own room; neither exists on a room a
    /// project owns, which is drawn read-only on the rail and never opens here.
    private func actsRow(for room: RoomModel) -> some View {
        HStack(spacing: 10) {
            ghostAct(
                title: "Edit dimensions",
                identifier: "RoomProjectView.EditDimensions"
            ) {
                coordinator.navigate(to: .roomSettings(roomId: room.id))
            }
            ghostAct(
                title: room.budgetCents == nil ? "Set a budget" : "Edit budget",
                identifier: "RoomProjectView.SetABudget"
            ) {
                presented = .budget
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
    }

    private func ghostAct(
        title: String,
        identifier: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Text(title)
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.primary)
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(
                    Capsule().stroke(PatinaColors.pearl, lineWidth: 1.5)
                )
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(identifier)
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
        presented = nil
    }
}

// MARK: - Sections

/// The room's hero, header and stat row live outside the view's own body so
/// the screen's type stays inside the house limit. Same file, same visibility
/// to `body`.
private extension RoomProjectView {

    func hero(for room: RoomModel) -> some View {
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

    func heroGradient(for room: RoomModel) -> LinearGradient {
        switch room.roomType.lowercased() {
        case "living", "living_room", "living room": return PatinaGradients.warm
        case "bedroom":                               return PatinaGradients.dusk
        case "office":                                return PatinaGradients.sageGradient
        case "dining", "dining_room":                 return PatinaGradients.earth
        case "kitchen":                               return PatinaGradients.rattan
        default:                                      return PatinaGradients.linen
        }
    }

    func header(for room: RoomModel) -> some View {
        let lines = RoomScreenLines.make(room: room)
        return VStack(alignment: .leading, spacing: 2) {
            Text(room.name)
                .font(PatinaTypography.h2)
                .foregroundStyle(PatinaColors.Text.primary)
            Text(lines.meta)
                .font(PatinaTypography.monoSmall)
                .tracking(0.4)
                .textCase(.uppercase)
                .foregroundStyle(PatinaColors.Text.muted)
                .fixedSize(horizontal: false, vertical: true)
            if let figures = lines.figures {
                Text(figures)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 4)
            }
            if let state = lines.state {
                Text(state)
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 4)
            }
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 16)
        .accessibilityIdentifier("RoomProjectView.Header")
    }

    func statRow(for room: RoomModel) -> some View {
        // SP-18: "IN AR" is gone. `get_recommendations` hard-codes `usdz_url`
        // to NULL and the direct fetch hard-codes it nil, so `hasARModel` is
        // false on every path — the number could never be anything but zero.
        // "MATCH" now names what it matches against.
        HStack(spacing: 8) {
            statCell(value: "\(room.items.count)", label: "Saved pieces")
            statCell(value: room.averageMatchScore.map { "\($0)%" } ?? "—", label: "Room match")
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 16)
    }

    func statCell(value: String, label: String) -> some View {
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
}
