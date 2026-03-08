//
//  RoomDetailView.swift
//  Patina
//
//  View showing details for a scanned room including dimensions,
//  style insights, and furniture recommendations.
//

import SwiftUI
import SwiftData

/// Room detail view showing room info and recommendations
struct RoomDetailView: View {

    // MARK: - Properties

    let roomId: UUID

    // MARK: - Environment

    @Environment(\.appCoordinator) private var coordinator
    @Environment(\.modelContext) private var modelContext

    // MARK: - State

    @State private var room: RoomModel?
    @State private var headerVisible = false
    @State private var contentVisible = false
    @State private var showShareSheet = false

    var body: some View {
        ZStack {
            // Background
            PatinaColors.Background.primary
                .ignoresSafeArea()

            ScrollView {
                VStack(spacing: PatinaSpacing.xl) {
                    // Header section
                    headerSection
                        .opacity(headerVisible ? 1 : 0)
                        .offset(y: headerVisible ? 0 : 20)

                    // Room info section
                    if let room = room {
                        roomInfoSection(room)
                            .opacity(contentVisible ? 1 : 0)
                            .offset(y: contentVisible ? 0 : 20)

                        // Quick actions
                        actionsSection
                            .opacity(contentVisible ? 1 : 0)
                            .offset(y: contentVisible ? 0 : 20)
                    }

                    Spacer(minLength: 120)
                }
                .padding(.top, PatinaSpacing.xxl)
            }

            // Companion overlay
            VStack {
                Spacer()
                CompanionOverlay()
            }
        }
        .navigationBarHidden(true)
        .onAppear {
            loadRoom()
            animateEntrance()
        }
        .sheet(isPresented: $showShareSheet) {
            if let room = room {
                ShareScanSheet(
                    scanId: room.id,
                    scanName: room.name,
                    onDismiss: { showShareSheet = false }
                )
            }
        }
    }

    // MARK: - Header Section

    private var headerSection: some View {
        VStack(spacing: PatinaSpacing.md) {
            // Room name
            Text(room?.name ?? "Your Room")
                .font(PatinaTypography.h1)
                .foregroundColor(PatinaColors.Text.primary)

            // Room type badge
            if let room = room {
                Text(room.roomType)
                    .font(PatinaTypography.eyebrow)
                    .foregroundColor(PatinaColors.Text.muted)
                    .padding(.horizontal, PatinaSpacing.md)
                    .padding(.vertical, PatinaSpacing.xs)
                    .background(PatinaColors.Background.secondary)
                    .cornerRadius(PatinaRadius.sm)
            }
        }
        .padding(.horizontal, PatinaSpacing.xl)
    }

    // MARK: - Room Info Section

    private func roomInfoSection(_ room: RoomModel) -> some View {
        VStack(spacing: PatinaSpacing.lg) {
            // Dimensions card
            if room.hasBeenScanned {
                dimensionsCard(room)
            }

            // Scan status
            scanStatusCard(room)
        }
        .padding(.horizontal, PatinaSpacing.xl)
    }

    private func dimensionsCard(_ room: RoomModel) -> some View {
        VStack(alignment: .leading, spacing: PatinaSpacing.md) {
            Text("Dimensions")
                .font(PatinaTypography.eyebrow)
                .foregroundColor(PatinaColors.Text.muted)

            HStack(spacing: PatinaSpacing.lg) {
                if let width = room.width, let length = room.length {
                    dimensionItem(
                        value: String(format: "%.1f", width * 3.28084),
                        unit: "ft",
                        label: "Width"
                    )

                    dimensionItem(
                        value: String(format: "%.1f", length * 3.28084),
                        unit: "ft",
                        label: "Length"
                    )
                }

                if let area = room.formattedArea {
                    dimensionItem(
                        value: area,
                        unit: "",
                        label: "Area"
                    )
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(PatinaSpacing.lg)
        .background(PatinaColors.Background.secondary)
        .cornerRadius(PatinaRadius.lg)
    }

    private func dimensionItem(value: String, unit: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: PatinaSpacing.xs) {
            HStack(alignment: .lastTextBaseline, spacing: 2) {
                Text(value)
                    .font(PatinaTypography.h2)
                    .foregroundColor(PatinaColors.Text.primary)

                if !unit.isEmpty {
                    Text(unit)
                        .font(PatinaTypography.bodySmall)
                        .foregroundColor(PatinaColors.Text.muted)
                }
            }

            Text(label)
                .font(PatinaTypography.caption)
                .foregroundColor(PatinaColors.Text.muted)
        }
    }

    private func scanStatusCard(_ room: RoomModel) -> some View {
        HStack(spacing: PatinaSpacing.md) {
            Image(systemName: room.hasBeenScanned ? "checkmark.circle.fill" : "camera.viewfinder")
                .font(.system(size: 24))
                .foregroundColor(room.hasBeenScanned ? PatinaColors.clayBeige : PatinaColors.Text.muted)

            VStack(alignment: .leading, spacing: PatinaSpacing.xs) {
                Text(room.hasBeenScanned ? "Room scanned" : "Not yet scanned")
                    .font(PatinaTypography.bodyMedium)
                    .foregroundColor(PatinaColors.Text.primary)

                if room.hasBeenScanned {
                    Text("Last updated \(room.updatedAt.formatted(date: .abbreviated, time: .shortened))")
                        .font(PatinaTypography.caption)
                        .foregroundColor(PatinaColors.Text.muted)
                }
            }

            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding(PatinaSpacing.lg)
        .background(PatinaColors.Background.secondary)
        .cornerRadius(PatinaRadius.lg)
    }

    // MARK: - Actions Section

    private var actionsSection: some View {
        VStack(spacing: PatinaSpacing.md) {
            // Share with designer button (only show if scanned)
            if room?.hasBeenScanned == true {
                Button {
                    HapticManager.shared.impact(.medium)
                    showShareSheet = true
                } label: {
                    HStack(spacing: PatinaSpacing.sm) {
                        Image(systemName: "person.badge.plus")
                        Text("Share with Designer")
                    }
                    .font(PatinaTypography.bodyMedium)
                    .foregroundColor(PatinaColors.offWhite)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, PatinaSpacing.md)
                    .background(PatinaColors.clayBeige)
                    .cornerRadius(PatinaRadius.lg)
                }
                .buttonStyle(ScaleButtonStyle())
            }

            // Walk again button
            Button {
                HapticManager.shared.impact(.medium)
                if let room = room {
                    coordinator.updateActiveRoom(
                        ActiveRoomContext(
                            id: room.id,
                            name: room.name,
                            hasBeenScanned: room.hasBeenScanned
                        )
                    )
                }
                coordinator.navigate(to: .walk)
            } label: {
                HStack(spacing: PatinaSpacing.sm) {
                    Image(systemName: "figure.walk")
                    Text("Walk this room again")
                }
                .font(PatinaTypography.bodyMedium)
                .foregroundColor(room?.hasBeenScanned == true ? PatinaColors.Text.secondary : PatinaColors.offWhite)
                .frame(maxWidth: .infinity)
                .padding(.vertical, PatinaSpacing.md)
                .background(room?.hasBeenScanned == true ? PatinaColors.Background.secondary : PatinaColors.clayBeige)
                .cornerRadius(PatinaRadius.lg)
            }
            .buttonStyle(ScaleButtonStyle())

            // View all rooms button
            Button {
                HapticManager.shared.impact(.light)
                coordinator.navigate(to: .roomList)
            } label: {
                Text("View all rooms")
                    .font(PatinaTypography.bodyMedium)
                    .foregroundColor(PatinaColors.Text.secondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, PatinaSpacing.md)
                    .background(PatinaColors.Background.secondary)
                    .cornerRadius(PatinaRadius.lg)
            }
            .buttonStyle(ScaleButtonStyle())
        }
        .padding(.horizontal, PatinaSpacing.xl)
    }

    // MARK: - Data Loading

    private func loadRoom() {
        let descriptor = FetchDescriptor<RoomModel>(
            predicate: #Predicate { $0.id == roomId }
        )

        do {
            let rooms = try modelContext.fetch(descriptor)
            room = rooms.first
        } catch {
            print("Error loading room: \(error)")
        }
    }

    // MARK: - Animation

    private func animateEntrance() {
        withAnimation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.2)) {
            headerVisible = true
        }

        withAnimation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.4)) {
            contentVisible = true
        }
    }
}

// MARK: - Scale Button Style

private struct ScaleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: configuration.isPressed)
    }
}

// MARK: - Preview

#Preview("Room Detail") {
    RoomDetailView(roomId: UUID())
        .environment(\.appCoordinator, AppCoordinator())
}
