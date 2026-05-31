//
//  ProfileView.swift
//  Patina
//
//  Profile / Design Journal with avatar, stats, style badge, rooms
//

import SwiftUI
import SwiftData

struct ProfileView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.appCoordinator) private var coordinator
    @State private var viewModel = ProfileViewModel()
    /// Drives the contextual help-panel sheet attached to the Profile surface.
    /// Toggled by the `?` button in the top-right corner of the header.
    @State private var isHelpPanelPresented: Bool = false

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 0) {
                // Header
                VStack(spacing: 0) {
                    // Top-right `?` help-panel trigger. Placed in a leading-
                    // edge HStack so it lives in the corner of the profile
                    // header without disturbing the centered avatar layout.
                    HStack {
                        Spacer()
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
                        .accessibilityHint("Opens the help panel for your profile.")
                        .accessibilityIdentifier("ProfileView.HelpButton")
                    }
                    .padding(.horizontal, 24)

                    // Avatar
                    Circle()
                        .fill(PatinaGradients.earth)
                        .frame(width: 80, height: 80)
                        .overlay(
                            Text(viewModel.userInitial)
                                .font(.custom("PlayfairDisplay-Medium", size: 28))
                                .foregroundStyle(PatinaColors.offWhite)
                        )
                        .padding(.bottom, 16)

                    Text(viewModel.userName)
                        .font(PatinaTypography.h3)
                        .foregroundStyle(PatinaColors.charcoal)
                        .padding(.bottom, 4)

                    // "Member since…" — wrapped in HelpTooltip because the
                    // Design Journal concept (Patina's name for the profile
                    // as a record of personal taste evolution) is worth
                    // explaining to a curious user.
                    HelpTooltip(
                        surfaceKey: SurfaceKeys.IOSApp.Profile.designJournal,
                        fallback: "Your profile is a Design Journal — Patina tracks the style you've taught it, the rooms you've captured, and the pieces you've saved. Everything here informs your recommendations."
                    ) {
                        MonoLabel(text: viewModel.memberSince)
                            .accessibilityLabel("Member since \(viewModel.memberSince). More information available.")
                    }

                    // Style badge — wrapped in HelpTooltip because the
                    // style signature is a Patina-specific resolved concept
                    // (it blends the quiz, teaching turns, and saved items).
                    HelpTooltip(
                        surfaceKey: SurfaceKeys.IOSApp.Profile.styleBadge,
                        fallback: "Your style signature is the label Patina has resolved for your taste — it blends the style quiz, every teaching turn, and the pieces you've saved into a single descriptor."
                    ) {
                        HStack(spacing: 6) {
                            Text("✦")
                            Text(viewModel.styleBadge)
                                .font(PatinaTypography.uiSmall)
                                .foregroundStyle(PatinaColors.mocha)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 6)
                        .background(PatinaColors.softCream)
                        .clipShape(Capsule())
                        .padding(.top, 12)
                        .accessibilityLabel("Style: \(viewModel.styleBadge). More information available.")
                    }
                }
                .padding(.top, 56)
                .padding(.bottom, 24)

                // Stats row — Saved and Match are Patina-specific concepts,
                // so each is wrapped in HelpTooltip. Rooms is self-explanatory
                // and gets no affordance to keep the row uncluttered.
                HStack(spacing: 0) {
                    statItem(value: "\(viewModel.roomCount)", label: "Rooms")
                    statDivider
                    HelpTooltip(
                        surfaceKey: SurfaceKeys.IOSApp.Profile.savedItems,
                        fallback: "Saved counts every piece you've hearted across the app — from the daily feed, room views, and product details. They flow into your style signature."
                    ) {
                        statItem(value: "\(viewModel.savedItemCount)", label: "Saved")
                            .accessibilityLabel("Saved items: \(viewModel.savedItemCount). More information available.")
                    }
                    statDivider
                    HelpTooltip(
                        surfaceKey: SurfaceKeys.IOSApp.Profile.matchPercentage,
                        fallback: "Match is the average score Patina has computed for the pieces you've seen — it goes up as the app learns your taste and the room context tightens."
                    ) {
                        statItem(value: viewModel.matchPercentage, label: "Match")
                            .accessibilityLabel("Match: \(viewModel.matchPercentage). More information available.")
                    }
                }
                .padding(.vertical, 20)
                .padding(.horizontal, 24)
                .overlay(alignment: .top) {
                    Rectangle().fill(PatinaColors.pearl).frame(height: 1)
                }
                .overlay(alignment: .bottom) {
                    Rectangle().fill(PatinaColors.pearl).frame(height: 1)
                }

                // Your Rooms section
                if !viewModel.rooms.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("YOUR ROOMS")
                            .font(PatinaTypography.monoMedium)
                            .foregroundStyle(PatinaColors.agedOak)
                            .tracking(1)

                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 12) {
                                ForEach(viewModel.rooms) { room in
                                    roomCard(room)
                                        .onTapGesture {
                                            coordinator.navigate(to: .roomDetail(roomId: room.id))
                                        }
                                }
                            }
                        }
                    }
                    .padding(24)
                }

                // Actions
                VStack(spacing: 12) {
                    profileActionRow(icon: "paintpalette", label: "Retake Style Quiz") {
                        coordinator.navigate(to: .styleQuiz)
                    }
                    profileActionRow(icon: "bubble.left", label: "Work with a Designer") {
                        coordinator.navigate(to: .designServicesRequest(roomId: nil))
                    }
                    profileActionRow(icon: "gearshape", label: "Settings") {
                        coordinator.showingSettings = true
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, viewModel.rooms.isEmpty ? 24 : 0)

                Spacer().frame(height: 120)
            }
        }
        .background(PatinaColors.offWhite)
        .toolbarTitleDisplayMode(.inline)
        .onAppear {
            viewModel.loadData(context: modelContext)
        }
        // Contextual help panel — surfaces every Sanity article whose
        // surfaceKey is `ios-app/profile` or a child of it.
        .helpPanel(
            isPresented: $isHelpPanelPresented,
            surfaceKey: SurfaceKeys.IOSApp.Profile.root
        )
    }

    // MARK: - Components

    private func statItem(value: String, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.custom("PlayfairDisplay-Medium", size: 22))
                .foregroundStyle(PatinaColors.charcoal)
            MonoLabel(text: label, size: PatinaTypography.monoTiny)
        }
        .frame(maxWidth: .infinity)
    }

    private var statDivider: some View {
        Rectangle()
            .fill(PatinaColors.pearl)
            .frame(width: 1, height: 36)
    }

    private func roomCard(_ room: RoomModel) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            PatinaGradients.warm
                .frame(height: 100)

            VStack(alignment: .leading, spacing: 2) {
                Text(room.name)
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.charcoal)

                let formatter = DateFormatter()
                let _ = formatter.dateFormat = "MMM d"
                MonoLabel(text: "Scanned \(formatter.string(from: room.createdAt))", size: PatinaTypography.monoTiny)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
        }
        .frame(width: 140)
        .background(PatinaColors.softCream)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func profileActionRow(icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 16))
                    .foregroundStyle(PatinaColors.clay)
                    .frame(width: 32, height: 32)
                    .background(PatinaColors.clay.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 8))

                Text(label)
                    .font(PatinaTypography.uiAction)
                    .foregroundStyle(PatinaColors.charcoal)

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 13))
                    .foregroundStyle(PatinaColors.agedOak)
            }
            .padding(14)
            .background(PatinaColors.softCream)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    ProfileView()
        .environment(\.appCoordinator, AppCoordinator())
}
