//
//  ProfileView.swift
//  Patina
//
//  Profile / Design Journal screen with avatar, stats, style badge, rooms
//

import SwiftUI

struct ProfileView: View {
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
                            Text("K")
                                .font(.custom("PlayfairDisplay-Medium", size: 28))
                                .foregroundColor(PatinaColors.offWhite)
                        )
                        .padding(.bottom, 16)

                    Text("Kody")
                        .font(PatinaTypography.h3)
                        .foregroundColor(PatinaColors.charcoal)
                        .padding(.bottom, 4)

                    MonoLabel(text: "Member since April 2026")

                    // Style badge
                    HStack(spacing: 6) {
                        Text("✦")
                        Text("Warm Minimalist")
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
                    statItem(value: "3", label: "Rooms")
                    statDivider
                    statItem(value: "24", label: "Saved")
                    statDivider
                    statItem(value: "87%", label: "Match")
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
                VStack(alignment: .leading, spacing: 12) {
                    Text("YOUR ROOMS")
                        .font(PatinaTypography.monoMedium)
                        .foregroundColor(PatinaColors.agedOak)
                        .tracking(1)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 12) {
                            roomCard(name: "Living Room", date: "Scanned Apr 2", gradient: PatinaGradients.warm)
                            roomCard(name: "Bedroom", date: "Scanned Mar 28", gradient: PatinaGradients.dusk)
                            roomCard(name: "Office", date: "Scanned Mar 15", gradient: PatinaGradients.sageGradient)
                        }
                    }
                }
                .padding(24)

                Spacer().frame(height: 120)
            }
        }
        .background(PatinaColors.offWhite)
        .navigationBarTitleDisplayMode(.inline)
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

    private func roomCard(name: String, date: String, gradient: LinearGradient) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            gradient
                .frame(height: 100)

            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .font(PatinaTypography.uiSmall)
                    .foregroundColor(PatinaColors.charcoal)
                MonoLabel(text: date, size: PatinaTypography.monoTiny)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
        }
        .frame(width: 140)
        .background(PatinaColors.softCream)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

#Preview {
    ProfileView()
}
