//
//  YourSpacesView.swift
//  Patina
//
//  Room gallery — the master "Your Spaces" screen from the Room System spec.
//  Replaces the legacy RoomListView with spec-matching cards, a Whole Home
//  cross-room bar, and a first-room empty state.
//

import SwiftUI
import SwiftData

struct YourSpacesView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.appCoordinator) private var coordinator
    @Query(sort: \RoomModel.createdAt, order: .reverse) private var rooms: [RoomModel]

    var body: some View {
        ZStack {
            PatinaColors.offWhite.ignoresSafeArea()

            if rooms.isEmpty {
                emptyState
            } else {
                ScrollView(showsIndicators: false) {
                    LazyVStack(spacing: 16) {
                        header
                            .padding(.horizontal, 20)
                            .padding(.top, 56)

                        WholeHomeCrossRoomBar(
                            roomCount: rooms.count,
                            itemCount: totalItemCount,
                            totalCents: totalInvestmentCents,
                            onTap: { coordinator.navigate(to: .crossRoom) }
                        )
                        .padding(.horizontal, 20)

                        ForEach(rooms) { room in
                            RoomGalleryCard(
                                room: room,
                                newPickCount: 0,
                                onTap: { coordinator.navigate(to: .roomProject(roomId: room.id)) }
                            )
                            .padding(.horizontal, 20)
                        }

                        Spacer().frame(height: 120)
                    }
                }
            }
        }
    }

    // MARK: - Pieces

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Your Spaces")
                .font(.custom("PlayfairDisplay-Regular", size: 24))
                .foregroundColor(PatinaColors.charcoal)
            Spacer()
            Button {
                coordinator.navigate(to: .newRoom)
            } label: {
                ZStack {
                    Circle()
                        .fill(PatinaColors.charcoal)
                        .frame(width: 36, height: 36)
                    Text("+")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundColor(PatinaColors.offWhite)
                }
            }
            .buttonStyle(.plain)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
            ZStack {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(PatinaColors.softCream)
                    .frame(width: 80, height: 80)
                Text("⌂").font(.system(size: 32))
            }
            Text("No rooms yet")
                .font(.custom("PlayfairDisplay-Regular", size: 20))
                .foregroundColor(PatinaColors.charcoal)
            Text("Scan a room and Patina fills it with furniture that knows your space — your light, your walls, your style.")
                .font(.system(size: 13))
                .foregroundColor(PatinaColors.agedOak)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 260)
                .padding(.bottom, 8)
            Button {
                coordinator.navigate(to: .newRoom)
            } label: {
                HStack(spacing: 8) {
                    Text("◎")
                    Text("Scan Your First Room")
                }
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(PatinaColors.offWhite)
                .frame(maxWidth: .infinity)
                .frame(height: 50)
                .background(Capsule().fill(PatinaColors.charcoal))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 32)
            Spacer()
        }
        .padding(.horizontal, 32)
    }

    // MARK: - Aggregates

    private var totalItemCount: Int {
        rooms.reduce(0) { $0 + $1.items.count }
    }
    private var totalInvestmentCents: Int {
        rooms.reduce(0) { $0 + $1.totalInvestmentCents }
    }
}
