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

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 0) {
                // Header
                VStack(spacing: 0) {
                    // Avatar
                    Circle()
                        .fill(PatinaGradients.earth)
                        .frame(width: 80, height: 80)
                        .overlay(
                            Text(viewModel.userInitial)
                                .font(.custom("PlayfairDisplay-Medium", size: 28))
                                .foregroundColor(PatinaColors.offWhite)
                        )
                        .padding(.bottom, 16)

                    Text(viewModel.userName)
                        .font(PatinaTypography.h3)
                        .foregroundColor(PatinaColors.charcoal)
                        .padding(.bottom, 4)

                    MonoLabel(text: viewModel.memberSince)

                    // Style badge
                    HStack(spacing: 6) {
                        Text("✦")
                        Text(viewModel.styleBadge)
                            .font(PatinaTypography.uiSmall)
                            .foregroundColor(PatinaColors.mocha)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
                    .background(PatinaColors.softCream)
                    .clipShape(Capsule())
                    .padding(.top, 12)
                }
                .padding(.top, 56)
                .padding(.bottom, 24)

                // Stats row
                HStack(spacing: 0) {
                    statItem(value: "\(viewModel.roomCount)", label: "Rooms")
                    statDivider
                    statItem(value: "\(viewModel.savedItemCount)", label: "Saved")
                    statDivider
                    statItem(value: viewModel.matchPercentage, label: "Match")
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
                            .foregroundColor(PatinaColors.agedOak)
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
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            viewModel.loadData(context: modelContext)
        }
    }

    // MARK: - Components

    private func statItem(value: String, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.custom("PlayfairDisplay-Medium", size: 22))
                .foregroundColor(PatinaColors.charcoal)
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
                    .foregroundColor(PatinaColors.charcoal)

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
                    .foregroundColor(PatinaColors.clay)
                    .frame(width: 32, height: 32)
                    .background(PatinaColors.clay.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 8))

                Text(label)
                    .font(PatinaTypography.uiAction)
                    .foregroundColor(PatinaColors.charcoal)

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 13))
                    .foregroundColor(PatinaColors.agedOak)
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
