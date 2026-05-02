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
    @State private var designerLeadState: DesignerLeadState = .idle

    private enum DesignerLeadState: Equatable {
        case idle, sending, sent, failed(String)
    }

    init(roomId: UUID) {
        self.roomId = roomId
        let predicate = #Predicate<RoomModel> { $0.id == roomId }
        _rooms = Query(filter: predicate)
    }

    private var room: RoomModel? { rooms.first }

    var body: some View {
        ZStack {
            PatinaColors.offWhite.ignoresSafeArea()

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
                            suggestedNextSection
                            if let nudge = BudgetAssessment.companionNudge(for: level, roomName: room.name) {
                                Text(nudge)
                                    .font(.custom("PlayfairDisplay-Italic", size: 13))
                                    .foregroundColor(PatinaColors.clay)
                                    .padding(.horizontal, 20)
                                    .padding(.top, 12)
                            }
                            cta(primary: "Work with a Designer on This Room") {
                                coordinator.navigate(to: .designServicesRequest(roomId: room.id))
                            }
                            sendToDesignersButton(for: room)
                        }
                        Spacer().frame(height: 100)
                    }
                }
                .ignoresSafeArea(edges: .top)
            } else {
                Text("Room not found")
                    .foregroundColor(PatinaColors.agedOak)
            }
        }
        .sheet(item: $actionItem) { item in
            ItemActionMenu(item: item) { action in
                handle(action, item: item)
            }
            .presentationDetents([.medium])
        }
    }

    // MARK: - Designer Lead CTA

    @ViewBuilder
    private func sendToDesignersButton(for room: RoomModel) -> some View {
        let hasRemote = room.remoteId != nil
        VStack(spacing: 8) {
            Button {
                guard let remoteId = room.remoteId else { return }
                designerLeadState = .sending
                Task {
                    do {
                        _ = try await DesignerLeadService.shared.send(roomRemoteId: remoteId)
                        await MainActor.run { designerLeadState = .sent }
                    } catch {
                        await MainActor.run {
                            designerLeadState = .failed(error.localizedDescription)
                        }
                    }
                }
            } label: {
                HStack(spacing: 8) {
                    if case .sending = designerLeadState {
                        ProgressView().tint(PatinaColors.offWhite)
                    }
                    Text(buttonLabel)
                        .font(.system(size: 14, weight: .medium))
                }
                .foregroundColor(PatinaColors.offWhite)
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(hasRemote ? PatinaColors.clay : PatinaColors.pearl)
                )
            }
            .buttonStyle(.plain)
            .disabled(!hasRemote || designerLeadState == .sending)
            .padding(.horizontal, 20)
            .padding(.top, 8)

            if case .failed(let msg) = designerLeadState {
                Text(msg)
                    .font(.system(size: 11))
                    .foregroundColor(PatinaColors.clay)
                    .padding(.horizontal, 20)
            }
        }
    }

    private var buttonLabel: String {
        switch designerLeadState {
        case .idle:    return "Send to designers"
        case .sending: return "Sending…"
        case .sent:    return "Sent ✓"
        case .failed:  return "Try again"
        }
    }

    // MARK: - Sections

    private func hero(for room: RoomModel) -> some View {
        ZStack(alignment: .top) {
            heroGradient(for: room)
                .frame(height: 240)
                .clipped()
            LinearGradient(
                colors: [.clear, PatinaColors.offWhite],
                startPoint: .top, endPoint: .bottom
            )
            .frame(height: 120)
            .frame(maxHeight: .infinity, alignment: .bottom)

            HStack {
                BackChevronButton(style: .light) { coordinator.goBack() }
                Spacer()
                Button {
                    coordinator.navigate(to: .roomSettings(roomId: room.id))
                } label: {
                    Text("⚙")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(PatinaColors.charcoal)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(PatinaColors.offWhite.opacity(0.92)))
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
                .font(.custom("PlayfairDisplay-Regular", size: 26))
                .foregroundColor(PatinaColors.charcoal)
            Text(metaLine(for: room))
                .font(.custom("DMMono-Regular", size: 9))
                .tracking(0.4)
                .textCase(.uppercase)
                .foregroundColor(PatinaColors.agedOak)
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
            let fmt = DateFormatter()
            fmt.dateFormat = "MMM d"
            parts.append("Scanned \(fmt.string(from: room.updatedAt))")
        }
        return parts.joined(separator: " · ")
    }

    private func statRow(for room: RoomModel) -> some View {
        HStack(spacing: 8) {
            statCell(value: "\(room.items.count)", label: "Items")
            statCell(value: room.averageMatchScore.map { "\($0)%" } ?? "—", label: "Avg Match")
            statCell(value: "\(room.arReadyCount)", label: "AR Ready")
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 16)
    }

    private func statCell(value: String, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.custom("PlayfairDisplay-Medium", size: 20))
                .foregroundColor(PatinaColors.charcoal)
            Text(label)
                .font(.custom("DMMono-Regular", size: 7))
                .tracking(0.6)
                .textCase(.uppercase)
                .foregroundColor(PatinaColors.agedOak)
        }
        .frame(maxWidth: .infinity)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(PatinaColors.softCream)
        )
    }

    private func itemsSection(for room: RoomModel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Your Items")
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(1.0)
                    .textCase(.uppercase)
                    .foregroundColor(PatinaColors.agedOak)
                Spacer()
                Text("View in AR →")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(PatinaColors.clay)
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, 8)

            ForEach(Array(room.items.enumerated()), id: \.element.id) { pair in
                RoomItemRow(item: pair.element) {
                    actionItem = pair.element
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                    Button(role: .destructive) {
                        let store = RoomStore(context: modelContext)
                        store.removeItem(pair.element)
                    } label: { Label("Remove", systemImage: "trash") }
                }
                if pair.offset < room.items.count - 1 {
                    Rectangle()
                        .fill(PatinaColors.pearl)
                        .frame(height: 1)
                        .padding(.horizontal, 20)
                }
            }
        }
    }

    private var suggestedNextSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Suggested Next")
                    .font(.system(size: 10, weight: .semibold))
                    .tracking(1.0)
                    .textCase(.uppercase)
                    .foregroundColor(PatinaColors.agedOak)
                Spacer()
                Text("See all →")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(PatinaColors.clay)
            }
            Text("\"Your seating and surfaces are set. A rug would ground the arrangement.\"")
                .font(.custom("PlayfairDisplay-Italic", size: 13))
                .foregroundColor(PatinaColors.agedOak)
        }
        .padding(.horizontal, 20)
        .padding(.top, 20)
        .padding(.bottom, 12)
    }

    private func emptyBlock(for room: RoomModel) -> some View {
        VStack(spacing: 8) {
            Text("✦").font(.system(size: 40))
            Text("A blank canvas")
                .font(.custom("PlayfairDisplay-Regular", size: 18))
                .foregroundColor(PatinaColors.charcoal)
            Text("We've already found pieces that would fit this space. Browse your Daily Room to start building this room.")
                .font(.system(size: 12))
                .foregroundColor(PatinaColors.agedOak)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 240)
            cta(primary: "Browse Picks for This Room") {
                coordinator.navigate(to: .heroFrame)
            }
            .padding(.top, 14)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }

    private func cta(primary title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(PatinaColors.offWhite)
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(Capsule().fill(PatinaColors.charcoal))
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
                roomRemoteId: room?.remoteId?.uuidString
            ))
        case .viewDetail:
            coordinator.navigate(to: .pieceDetail(pieceId: item.productId))
        case .move, .copy:
            coordinator.navigate(to: .moveItem(savedItemId: item.id))
        case .findSimilar:
            coordinator.navigate(to: .pieceDetail(pieceId: item.productId))
        case .remove:
            store.removeItem(item)
        }
        actionItem = nil
    }
}
