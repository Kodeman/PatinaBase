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
    /// Drives the contextual help-panel sheet attached to the Rooms surface.
    /// Toggled by the `?` button in the header.
    @State private var isHelpPanelPresented: Bool = false

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

                        // Whole Home bar with a sibling HelpInfoIcon — the
                        // bar itself stays a tappable navigation target, the
                        // info icon surfaces the Patina concept explanation
                        // (one aggregate figure across every scanned room).
                        HStack(spacing: 6) {
                            WholeHomeCrossRoomBar(
                                roomCount: rooms.count,
                                itemCount: totalItemCount,
                                totalCents: totalInvestmentCents,
                                onTap: { coordinator.navigate(to: .crossRoom) }
                            )
                            HelpInfoIcon(
                                surfaceKey: SurfaceKeys.IOSApp.Rooms.wholeHome,
                                fallback: "Whole Home rolls every room into one figure — total items, total investment, and a jump-off into the cross-room view for decisions that span more than one room.",
                                size: 12
                            )
                        }
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
        // Contextual help panel — surfaces every Sanity article whose
        // surfaceKey is `ios-app/rooms` or a child of it.
        .helpPanel(
            isPresented: $isHelpPanelPresented,
            surfaceKey: SurfaceKeys.IOSApp.Rooms.root
        )
    }

    // MARK: - Pieces

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("Your Spaces")
                    .font(PatinaTypography.h3)
                    .foregroundStyle(PatinaColors.charcoal)
                // Contextual help: explains the "Your Spaces" model —
                // every captured room as a gallery card with budget +
                // item count, plus a Whole Home aggregate at the top.
                HelpInfoIcon(
                    surfaceKey: SurfaceKeys.IOSApp.Rooms.yourSpaces,
                    fallback: "Your Spaces shows every room you've captured. Each card summarizes the room's items and budget. Scroll past the Whole Home bar to see them.",
                    size: 14
                )
            }
            Spacer()
            // Help-panel trigger — surfaces every help article for the
            // rooms gallery in a sheet.
            Button {
                isHelpPanelPresented = true
            } label: {
                Image(systemName: "questionmark.circle")
                    .font(.system(size: 17, weight: .regular))
                    .foregroundStyle(PatinaColors.mocha)
                    .frame(width: 36, height: 36)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Help")
            .accessibilityHint("Opens the help panel for Your Spaces.")
            .accessibilityIdentifier("YourSpacesView.HelpButton")

            // "Add a room" button — sibling HelpInfoIcon (rather than
            // wrapping the button in HelpTooltip, which intercepts taps)
            // so first-time users can learn what `+` does without
            // breaking the navigation path.
            HelpInfoIcon(
                surfaceKey: SurfaceKeys.IOSApp.Rooms.newRoom,
                fallback: "Add a new room — scan it with the camera for the best recommendations, or enter dimensions manually if you don't have the room in front of you.",
                size: 12
            )
            Button {
                coordinator.navigate(to: .newRoom)
            } label: {
                ZStack {
                    Circle()
                        .fill(PatinaColors.charcoal)
                        .frame(width: 36, height: 36)
                    Text("+")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(PatinaColors.offWhite)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Add a room")
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
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("No rooms yet")
                    .font(.custom("PlayfairDisplay-Regular", size: 20))
                    .foregroundStyle(PatinaColors.charcoal)
                // Empty-state help: explains why scanning matters. The
                // copy below is a CTA; this tooltip explains the *why*
                // for a designer-curious user not ready to scan yet.
                HelpInfoIcon(
                    surfaceKey: SurfaceKeys.IOSApp.Rooms.emptyNoRooms,
                    fallback: "Patina builds room-aware recommendations from a scan — the LiDAR camera captures shape, light, and existing items so every suggestion fits the actual space.",
                    size: 13
                )
            }
            Text("Scan a room and Patina fills it with furniture that knows your space — your light, your walls, your style.")
                .font(.system(size: 13))
                .foregroundStyle(PatinaColors.agedOak)
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
                .foregroundStyle(PatinaColors.offWhite)
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
