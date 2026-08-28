//
//  YourHouseRail.swift
//  Patina
//
//  YOUR HOUSE — the persistent object of Direction B (B §2, M1 block 4).
//
//  A rail of the client's rooms: the rooms a designer owns on their project,
//  read from `project_rooms` and drawn as cards the client cannot edit, beside
//  the rooms the client typed or scanned, and `Add a room` last. An
//  activeProject client's house is never an empty state.
//
//  Where there is no room at all the block is the two-act `Start with a room`,
//  and the LIGHT act is first: typing the dimensions before scanning, because
//  today the only act on offer is the heaviest one (F120).
//
//  Honesty (C5): a card prints a figure only where a real one exists.
//  `project_rooms.budget_cents` is NOT NULL with a 0 default, so zero means
//  "not set" and draws nothing rather than "$0".
//

import SwiftUI

// MARK: - What a card says

struct HouseRoomCard: Identifiable, Equatable {

    enum Origin: Equatable {
        /// A designer's room on a project. Read-only.
        case project(projectId: String)
        /// A room the person made themselves.
        case local(roomId: UUID)
    }

    let id: String
    let name: String
    /// One line of real figures, or nil where there are none to print.
    let meta: String?
    let origin: Origin

    var isReadOnly: Bool {
        if case .project = origin { return true }
        return false
    }

    /// Project rooms first — they are the work in flight — then the rooms the
    /// person made.
    static func cards(
        projectRooms: [RemoteProjectRoom],
        localRooms: [RoomModel]
    ) -> [HouseRoomCard] {
        projectRooms.map(card(for:)) + localRooms.map(card(for:))
    }

    static func card(for room: RemoteProjectRoom) -> HouseRoomCard {
        HouseRoomCard(
            id: "project-room:\(room.id)",
            name: room.name,
            meta: meta(for: room),
            origin: .project(projectId: room.project_id)
        )
    }

    /// `252 sq ft · 3 saved pieces · budget $9,000`. W4's addition is the last
    /// clause: the room the person made now carries a budget of its own
    /// (`RoomModel.budgetCents` → `rooms.budget_cents`), so the rail prints a
    /// stored figure or none — never a derived one (C5).
    static func card(for room: RoomModel) -> HouseRoomCard {
        var parts: [String] = []
        if let area = room.formattedArea { parts.append(area) }
        let count = room.items.count
        if count > 0 {
            parts.append("\(count) saved \(count == 1 ? "piece" : "pieces")")
        }
        if let budgetLine = room.budgetLine { parts.append(budgetLine) }
        return HouseRoomCard(
            id: "room:\(room.id.uuidString)",
            name: room.name,
            meta: parts.isEmpty ? nil : parts.joined(separator: " · "),
            origin: .local(roomId: room.id)
        )
    }

    private static func meta(for room: RemoteProjectRoom) -> String? {
        let budget = room.budget_cents ?? 0
        let committed = room.committed_cents ?? 0
        if budget > 0 && committed > 0 {
            return "\(PatinaCurrency.formatWholeDollars(cents: committed)) of "
                + "\(PatinaCurrency.formatWholeDollars(cents: budget)) committed"
        }
        if budget > 0 {
            return "budget \(PatinaCurrency.formatWholeDollars(cents: budget))"
        }
        if committed > 0 {
            return "\(PatinaCurrency.formatWholeDollars(cents: committed)) committed"
        }
        // No figures on the row: the dimensions the designer typed, or nothing.
        if let dimensions = room.dimensions, !dimensions.isEmpty { return dimensions }
        return nil
    }
}

// MARK: - The two acts

/// `Start with a room`, in the ruled order: the light act first.
enum StartWithARoomAct: String, CaseIterable, Identifiable {
    case typeTheDimensions
    case scanIt

    var id: String { rawValue }

    var title: String {
        switch self {
        case .typeTheDimensions: return "Type the dimensions"
        case .scanIt: return "Scan it"
        }
    }

    var detail: String {
        switch self {
        case .typeTheDimensions: return "A minute, and the room is in Patina."
        case .scanIt: return "Walk the room with your camera."
        }
    }

    var symbol: String {
        switch self {
        case .typeTheDimensions: return "square.and.pencil"
        case .scanIt: return "camera.viewfinder"
        }
    }

    /// The light act first (F120). The order is the ruling, so it is a value
    /// and not the order somebody happened to type the views in.
    static let ordered: [StartWithARoomAct] = [.typeTheDimensions, .scanIt]
}

// MARK: - Views

struct YourHouseRail: View {
    let cards: [HouseRoomCard]
    var onCard: (HouseRoomCard) -> Void = { _ in }
    /// Both acts, here too. With one room made, `Scan it` was unreachable from
    /// Today — and every rail tap reported itself as the typed one.
    var onAddRoom: (StartWithARoomAct) -> Void = { _ in }

    @State private var isChoosingAct = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            MonoLabel(text: "YOUR HOUSE")
                .padding(.horizontal, PatinaSpacing.mdLarge)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: PatinaSpacing.xsm) {
                    ForEach(cards) { card in
                        roomCard(card)
                    }
                    addRoomCard
                }
                .padding(.horizontal, PatinaSpacing.mdLarge)
                .padding(.top, PatinaSpacing.sm)
            }
        }
        .accessibilityIdentifier("DailyRoomView.HouseRail")
    }

    private func roomCard(_ card: HouseRoomCard) -> some View {
        Button {
            onCard(card)
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                // An adaptive ground, not the `linen` gradient: a fixed light
                // gradient reads as a white band on the dark card (M1d).
                Rectangle()
                    .fill(PatinaColors.Background.primary)
                    .frame(height: 48)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    Text(card.name)
                        .font(PatinaTypography.h5)
                        .foregroundStyle(PatinaColors.Text.primary)
                        .lineLimit(2)
                    if let meta = card.meta {
                        Text(meta)
                            .font(PatinaTypography.caption)
                            .foregroundStyle(PatinaColors.Text.secondary)
                            .lineLimit(2)
                    }
                }
                .padding(.horizontal, PatinaSpacing.md)
                .padding(.vertical, PatinaSpacing.sm)
                Spacer(minLength: 0)
            }
            .frame(width: 240, height: 150, alignment: .topLeading)
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.xl, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            [card.name, card.meta].compactMap { $0 }.joined(separator: ". ")
        )
        .accessibilityHint(card.isReadOnly ? "Opens this project room." : "Opens this room.")
    }

    private var addRoomCard: some View {
        Button { isChoosingAct = true } label: {
            Text("Add a room")
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.interactive)
                .frame(width: 128, height: 150)
                .background(
                    RoundedRectangle(cornerRadius: PatinaRadius.xl, style: .continuous)
                        .strokeBorder(PatinaColors.pearl, style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Add a room")
        .accessibilityIdentifier("DailyRoomView.AddRoom")
        .confirmationDialog("Add a room", isPresented: $isChoosingAct) {
            // The light act first (F120), the same order the empty block draws.
            ForEach(StartWithARoomAct.ordered) { act in
                Button(act.title) { onAddRoom(act) }
            }
            Button("Cancel", role: .cancel) {}
        }
    }
}

/// The block that stands where the rail would be, for a person with no room.
struct StartWithARoomBlock: View {
    var onAct: (StartWithARoomAct) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            MonoLabel(text: "YOUR HOUSE")
            Text("Start with a room")
                .font(PatinaTypography.h4)
                .foregroundStyle(PatinaColors.Text.primary)
                .padding(.top, PatinaSpacing.xs)

            HStack(spacing: PatinaSpacing.xsm) {
                ForEach(StartWithARoomAct.ordered) { act in
                    Button {
                        onAct(act)
                    } label: {
                        VStack(alignment: .leading, spacing: PatinaSpacing.xs) {
                            Image(systemName: act.symbol)
                                .font(.system(size: 20, weight: .medium))
                                .foregroundStyle(PatinaColors.Text.interactive)
                                .accessibilityHidden(true)
                            Text(act.title)
                                .font(PatinaTypography.bodySmallMedium)
                                .foregroundStyle(PatinaColors.Text.primary)
                                .fixedSize(horizontal: false, vertical: true)
                            Text(act.detail)
                                .font(PatinaTypography.caption)
                                .foregroundStyle(PatinaColors.Text.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(PatinaSpacing.md)
                        .background(PatinaColors.Background.secondary)
                        .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.xl, style: .continuous))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(act.title)
                    .accessibilityHint(act.detail)
                }
            }
            .padding(.top, PatinaSpacing.sm)
        }
        .padding(.horizontal, PatinaSpacing.mdLarge)
        .accessibilityIdentifier("DailyRoomView.StartWithARoom")
    }
}
