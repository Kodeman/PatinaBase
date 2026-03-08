//
//  HeroFrameView.swift
//  Patina
//
//  Main Hero Frame home screen view
//

import SwiftUI
import SwiftData
import Auth

/// The Hero Frame home screen displaying room photos with time-aware styling
struct HeroFrameView: View {

    @Environment(\.modelContext) private var modelContext
    @Environment(\.appCoordinator) private var coordinator
    @State private var viewModel = HeroFrameViewModel()
    private let authService = AuthService.shared

    /// Callback for navigation intents
    var onNavigate: ((HeroFrameIntent) -> Void)?

    /// Callback for expanding companion
    var onExpandCompanion: (() -> Void)?

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .bottom) {
                // Background photo carousel
                photoContent

                // Overlay content
                VStack(spacing: 0) {
                    // Status bar space
                    Spacer()
                        .frame(height: geometry.safeAreaInsets.top + 20)

                    // Greeting
                    greetingSection
                        .padding(.top, 21)

                    // Pagination dots
                    if viewModel.hasMultipleRooms {
                        paginationSection
                            .padding(.top, 70)
                    }

                    Spacer()

                    // Emergence card (if active)
                    if let room = viewModel.currentRoom, room.hasActiveEmergence {
                        emergenceSection(room: room)
                            .padding(.horizontal, 16)
                            .padding(.bottom, 90) // Above companion rest
                    }

                    // Companion rest (handled by parent view typically)
                    // This is here for standalone preview
                }

                // Signed-in status pill with QR scanner button
                if authService.isAuthenticated {
                    VStack {
                        Spacer()
                        signedInPill
                            .padding(.horizontal, 16)
                            .padding(.bottom, 100) // Above companion rest
                    }
                }

                // Stats badge (top right area)
                if let room = viewModel.currentRoom, room.savedItemCount > 0 {
                    statsSection(room: room)
                        .position(
                            x: geometry.size.width - 50,
                            y: geometry.safeAreaInsets.top + 145
                        )
                }
            }
            .ignoresSafeArea()
        }
        .onAppear {
            viewModel.configure(with: modelContext)
        }
        .onDisappear {
            viewModel.stopTimeMonitor()
        }
    }

    // MARK: - Photo Content

    @ViewBuilder
    private var photoContent: some View {
        if viewModel.rooms.isEmpty {
            // No rooms - show empty state
            emptyState
        } else if viewModel.hasMultipleRooms {
            // Multi-room carousel
            RoomPageView(
                rooms: viewModel.rooms,
                currentIndex: Binding(
                    get: { viewModel.currentRoomIndex },
                    set: { viewModel.navigateToRoom(at: $0) }
                ),
                timeOfDay: viewModel.timeOfDay,
                onPhotoTap: { _ in onNavigate?(viewModel.photoTapIntent()) },
                onPhotoLongPress: { _ in onNavigate?(viewModel.photoLongPressIntent()) },
                onPlaceholderTap: { _ in onNavigate?(viewModel.placeholderTapIntent()) }
            )
        } else if let room = viewModel.currentRoom {
            // Single room
            if room.hasHeroFrame {
                HeroPhotoView(
                    imageData: room.heroFrameData,
                    timeOfDay: viewModel.timeOfDay
                )
                .onTapGesture {
                    onNavigate?(viewModel.photoTapIntent())
                }
                .onLongPressGesture {
                    onNavigate?(viewModel.photoLongPressIntent())
                }
            } else {
                HeroPlaceholderView(
                    roomName: room.name,
                    timeOfDay: viewModel.timeOfDay
                ) {
                    onNavigate?(viewModel.placeholderTapIntent())
                }
            }
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        ZStack {
            LinearGradient(
                colors: viewModel.timeOfDay.gradientColors,
                startPoint: .top,
                endPoint: .bottom
            )

            viewModel.timeOfDay.overlayGradient

            VStack(spacing: 24) {
                // Strata mark
                VStack(spacing: 8) {
                    Capsule()
                        .fill(viewModel.timeOfDay.textColor)
                        .frame(width: 60, height: 4)
                    Capsule()
                        .fill(viewModel.timeOfDay.textColor.opacity(0.6))
                        .frame(width: 45, height: 4)
                    Capsule()
                        .fill(viewModel.timeOfDay.textColor.opacity(0.3))
                        .frame(width: 30, height: 4)
                }

                VStack(spacing: 8) {
                    Text("Welcome to Patina")
                        .font(.custom("Playfair Display", size: 24))
                        .italic()
                        .foregroundStyle(viewModel.timeOfDay.textColor)

                    Text("Begin your first walk to capture a room")
                        .font(.system(size: 14))
                        .foregroundStyle(viewModel.timeOfDay.textColor.opacity(0.7))
                }
            }
        }
        .onTapGesture {
            onNavigate?(.startWalk)
        }
    }

    // MARK: - Greeting Section

    private var greetingSection: some View {
        GreetingView(
            timeOfDay: viewModel.timeOfDay,
            roomName: viewModel.currentRoom?.name ?? "Your Space"
        )
    }

    // MARK: - Pagination Section

    private var paginationSection: some View {
        RoomPaginationView(
            currentIndex: viewModel.currentRoomIndex,
            totalCount: viewModel.roomCount
        )
    }

    // MARK: - Stats Section

    private func statsSection(room: RoomModel) -> some View {
        StatsBadgeView(
            count: room.savedItemCount,
            useGlassStyle: viewModel.timeOfDay.usesGlassMorphism
        ) {
            onNavigate?(viewModel.statsTapIntent())
        }
    }

    // MARK: - Emergence Section

    private func emergenceSection(room: RoomModel) -> some View {
        EmergenceCardView(
            message: room.emergenceMessage ?? "Something surfaced for this room",
            useGlassStyle: viewModel.timeOfDay.usesGlassMorphism
        ) {
            onNavigate?(viewModel.emergenceTapIntent())
        }
    }

    // MARK: - Signed-In Status Pill

    private var signedInPill: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(Color.green)
                .frame(width: 6, height: 6)

            Text(truncatedEmail)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(viewModel.timeOfDay.textColor.opacity(0.8))
                .lineLimit(1)

            Button {
                coordinator.showingQRScanner = true
            } label: {
                Image(systemName: "qrcode.viewfinder")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(viewModel.timeOfDay.textColor.opacity(0.9))
                    .frame(width: 28, height: 28)
                    .background(viewModel.timeOfDay.textColor.opacity(0.1))
                    .clipShape(Circle())
            }
            .accessibilityLabel("Scan QR code to sign in to web")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(.ultraThinMaterial)
        .clipShape(Capsule())
    }

    private var truncatedEmail: String {
        guard let email = authService.currentUser?.email else {
            return "Signed in"
        }
        if email.count > 20 {
            let prefix = email.prefix(8)
            let domain = email.split(separator: "@").last.map(String.init) ?? ""
            return "\(prefix)...@\(domain)"
        }
        return email
    }
}

// MARK: - Preview

#Preview("With Room") {
    HeroFrameView()
        .modelContainer(for: RoomModel.self, inMemory: true)
}
