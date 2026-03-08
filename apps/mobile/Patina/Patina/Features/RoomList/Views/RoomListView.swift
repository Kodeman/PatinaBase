//
//  RoomListView.swift
//  Patina
//
//  The default landing screen for returning users
//  Shows scanned rooms with quick access to walk new spaces
//

import SwiftUI
import SwiftData

/// Room List - the returning user's home screen
public struct RoomListView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.appCoordinator) private var coordinator
    @State private var viewModel = RoomListViewModel()
    @State private var showingAddRoom = false

    public init() {}

    public var body: some View {
        ScrollView {
            VStack(spacing: PatinaSpacing.xl) {
                // Header
                header

                // Quick action to walk new room
                if viewModel.rooms.isEmpty {
                    emptyState
                } else {
                    // Room grid
                    roomGrid
                }
            }
            .padding(.horizontal, PatinaSpacing.lg)
            .padding(.bottom, 120) // Space for Companion
        }
        .background(PatinaColors.Background.primary)
        .onAppear {
            viewModel.fetchRooms(modelContext: modelContext)
            coordinator.updateRoomCount(viewModel.rooms.count)
        }
        .sheet(isPresented: $showingAddRoom) {
            AddRoomSheet(viewModel: viewModel, modelContext: modelContext)
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: PatinaSpacing.sm) {
            Text(greeting)
                .font(PatinaTypography.patinaVoice)
                .foregroundColor(PatinaColors.Text.secondary)

            Text("Your Rooms")
                .font(PatinaTypography.h1)
                .foregroundColor(PatinaColors.Text.primary)

            if !viewModel.rooms.isEmpty {
                Text("\(viewModel.rooms.count) \(viewModel.rooms.count == 1 ? "space" : "spaces") captured")
                    .font(PatinaTypography.bodySmall)
                    .foregroundColor(PatinaColors.Text.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, PatinaSpacing.xl)
    }

    private var greeting: String {
        CompanionVoice.shared.greeting(for: TimeOfDay.current, isReturning: true)
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: PatinaSpacing.xl) {
            Spacer()
                .frame(height: 60)

            // Illustration
            ZStack {
                Circle()
                    .fill(PatinaColors.Background.secondary)
                    .frame(width: 120, height: 120)

                Image(systemName: "figure.walk")
                    .font(.system(size: 48))
                    .foregroundColor(PatinaColors.clayBeige)
            }

            VStack(spacing: PatinaSpacing.sm) {
                Text("No rooms yet")
                    .font(PatinaTypography.h2)
                    .foregroundColor(PatinaColors.Text.primary)

                Text("Walk through your first space and I'll learn what belongs there.")
                    .font(PatinaTypography.patinaVoice)
                    .foregroundColor(PatinaColors.Text.secondary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
            }

            Button {
                coordinator.navigate(to: .walk)
            } label: {
                HStack(spacing: PatinaSpacing.sm) {
                    Image(systemName: "figure.walk")
                    Text("Walk your first room")
                }
                .font(PatinaTypography.bodyMedium)
                .foregroundColor(.white)
                .padding(.horizontal, PatinaSpacing.xl)
                .padding(.vertical, PatinaSpacing.md)
                .background(PatinaColors.clayBeige)
                .cornerRadius(PatinaRadius.xl)
            }
            .buttonStyle(PressableButtonStyle())

            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, PatinaSpacing.xxl)
    }

    // MARK: - Room Grid

    private var roomGrid: some View {
        VStack(spacing: PatinaSpacing.lg) {
            // Walk new room button
            walkNewRoomButton

            // Rooms
            LazyVGrid(columns: [
                GridItem(.flexible()),
                GridItem(.flexible())
            ], spacing: PatinaSpacing.md) {
                ForEach(viewModel.sortedRooms, id: \.id) { room in
                    RoomCard(room: room, viewModel: viewModel) {
                        coordinator.updateActiveRoom(
                            ActiveRoomContext(
                                id: room.id,
                                name: room.name,
                                hasBeenScanned: room.hasBeenScanned
                            )
                        )
                        coordinator.navigate(to: .walkSession)
                    }
                }
            }
        }
    }

    private var walkNewRoomButton: some View {
        Button {
            showingAddRoom = true
        } label: {
            HStack(spacing: PatinaSpacing.md) {
                ZStack {
                    Circle()
                        .stroke(PatinaColors.clayBeige.opacity(0.3), lineWidth: 2)
                        .frame(width: 44, height: 44)

                    Image(systemName: "plus")
                        .font(.system(size: 20))
                        .foregroundColor(PatinaColors.clayBeige)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text("Walk a new room")
                        .font(PatinaTypography.bodyMedium)
                        .foregroundColor(PatinaColors.Text.primary)

                    Text("Capture another space")
                        .font(PatinaTypography.caption)
                        .foregroundColor(PatinaColors.Text.muted)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 14))
                    .foregroundColor(PatinaColors.Text.muted)
            }
            .padding(PatinaSpacing.md)
            .background(PatinaColors.Background.secondary)
            .cornerRadius(PatinaRadius.lg)
        }
        .buttonStyle(PressableButtonStyle())
    }
}

// MARK: - Room Card

struct RoomCard: View {
    let room: RoomModel
    let viewModel: RoomListViewModel
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: PatinaSpacing.sm) {
                // Icon
                ZStack {
                    RoundedRectangle(cornerRadius: PatinaRadius.md)
                        .fill(PatinaColors.Background.secondary)
                        .frame(height: 80)

                    Image(systemName: viewModel.icon(for: room.roomType))
                        .font(.system(size: 32))
                        .foregroundColor(room.hasBeenScanned ? PatinaColors.mochaBrown : PatinaColors.clayBeige.opacity(0.5))
                }

                // Info
                VStack(alignment: .leading, spacing: 2) {
                    Text(room.name)
                        .font(PatinaTypography.bodyMedium)
                        .foregroundColor(PatinaColors.Text.primary)
                        .lineLimit(1)

                    if room.hasBeenScanned {
                        if let area = room.formattedArea {
                            Text(area)
                                .font(PatinaTypography.caption)
                                .foregroundColor(PatinaColors.Text.muted)
                        } else {
                            Text("Scanned")
                                .font(PatinaTypography.caption)
                                .foregroundColor(PatinaColors.clayBeige)
                        }
                    } else {
                        Text("Not yet scanned")
                            .font(PatinaTypography.caption)
                            .foregroundColor(PatinaColors.Text.muted)
                    }
                }
            }
            .padding(PatinaSpacing.md)
            .background(Color.white)
            .cornerRadius(PatinaRadius.lg)
            .shadow(color: PatinaColors.mochaBrown.opacity(0.06), radius: 8, y: 4)
        }
        .buttonStyle(PressableButtonStyle())
    }
}

// MARK: - Add Room Sheet

struct AddRoomSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.appCoordinator) private var coordinator
    let viewModel: RoomListViewModel
    let modelContext: ModelContext

    @State private var roomName = ""
    @State private var selectedType = "Living Room"

    var body: some View {
        NavigationStack {
            VStack(spacing: PatinaSpacing.xl) {
                // Room name
                VStack(alignment: .leading, spacing: PatinaSpacing.sm) {
                    Text("Room name")
                        .font(PatinaTypography.eyebrow)
                        .foregroundColor(PatinaColors.Text.muted)

                    TextField("e.g., Master Bedroom", text: $roomName)
                        .font(PatinaTypography.body)
                        .padding(PatinaSpacing.md)
                        .background(PatinaColors.Background.secondary)
                        .cornerRadius(PatinaRadius.md)
                }

                // Room type
                VStack(alignment: .leading, spacing: PatinaSpacing.sm) {
                    Text("Room type")
                        .font(PatinaTypography.eyebrow)
                        .foregroundColor(PatinaColors.Text.muted)

                    LazyVGrid(columns: [
                        GridItem(.flexible()),
                        GridItem(.flexible())
                    ], spacing: PatinaSpacing.sm) {
                        ForEach(RoomListViewModel.roomTypes, id: \.self) { type in
                            Button {
                                selectedType = type
                            } label: {
                                HStack(spacing: PatinaSpacing.sm) {
                                    Image(systemName: viewModel.icon(for: type))
                                        .font(.system(size: 16))

                                    Text(type)
                                        .font(PatinaTypography.bodySmall)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(PatinaSpacing.md)
                                .background(
                                    selectedType == type
                                        ? PatinaColors.clayBeige.opacity(0.2)
                                        : PatinaColors.Background.secondary
                                )
                                .foregroundColor(
                                    selectedType == type
                                        ? PatinaColors.mochaBrown
                                        : PatinaColors.Text.secondary
                                )
                                .cornerRadius(PatinaRadius.md)
                                .overlay(
                                    RoundedRectangle(cornerRadius: PatinaRadius.md)
                                        .stroke(
                                            selectedType == type
                                                ? PatinaColors.clayBeige
                                                : Color.clear,
                                            lineWidth: 1
                                        )
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                Spacer()

                // Create button
                Button {
                    createRoomAndWalk()
                } label: {
                    Text("Walk this room")
                        .font(PatinaTypography.bodyMedium)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(PatinaSpacing.md)
                        .background(roomName.isEmpty ? PatinaColors.clayBeige.opacity(0.5) : PatinaColors.clayBeige)
                        .cornerRadius(PatinaRadius.lg)
                }
                .disabled(roomName.isEmpty)
            }
            .padding(PatinaSpacing.lg)
            .navigationTitle("New Room")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .foregroundColor(PatinaColors.Text.secondary)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func createRoomAndWalk() {
        viewModel.addRoom(name: roomName, roomType: selectedType, modelContext: modelContext)
        dismiss()

        // Navigate to walk with this room
        if let room = viewModel.rooms.last {
            coordinator.updateActiveRoom(
                ActiveRoomContext(
                    id: room.id,
                    name: room.name,
                    hasBeenScanned: false
                )
            )
        }
        coordinator.navigate(to: .walk)
    }
}

// MARK: - Preview

#Preview {
    RoomListView()
        .environment(\.appCoordinator, AppCoordinator())
}
