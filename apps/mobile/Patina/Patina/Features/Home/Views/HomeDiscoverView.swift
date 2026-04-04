//
//  HomeDiscoverView.swift
//  Patina
//
//  Home / Discover screen with greeting, search, scan prompt, and featured content
//

import SwiftUI

struct HomeDiscoverView: View {
    @Environment(\.appCoordinator) private var coordinator

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                // Greeting
                VStack(alignment: .leading, spacing: 4) {
                    MonoLabel(text: greetingTime)
                    Text("Welcome back")
                        .font(PatinaTypography.h2)
                        .foregroundColor(PatinaColors.charcoal)
                }
                .padding(.top, 56)
                .padding(.horizontal, 24)

                // Search bar
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(PatinaColors.agedOak)
                    Text("Search furniture, makers, styles...")
                        .font(PatinaTypography.bodySmall)
                        .foregroundColor(PatinaColors.agedOak)
                    Spacer()
                }
                .padding(.horizontal, 16)
                .frame(height: 44)
                .background(PatinaColors.softCream)
                .clipShape(Capsule())
                .padding(.horizontal, 24)
                .padding(.top, 16)

                // Scan prompt card
                scanPromptCard
                    .padding(.horizontal, 24)
                    .padding(.top, 16)

                // Picked for you
                sectionHeader(title: "Picked for you", action: "See all →")
                    .padding(.top, 16)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        featuredCard(
                            title: "New from Thos. Moser",
                            subtitle: "Cherry & walnut collection",
                            gradient: PatinaGradients.warm
                        )
                        featuredCard(
                            title: "Spring Living Rooms",
                            subtitle: "Curated for warm minimalists",
                            gradient: PatinaGradients.sageGradient
                        )
                        featuredCard(
                            title: "Artisan Lighting",
                            subtitle: "Handcrafted table & floor lamps",
                            gradient: PatinaGradients.rattan
                        )
                    }
                    .padding(.horizontal, 24)
                }

                // Meet the makers
                sectionHeader(title: "Meet the makers", action: "See all →")
                    .padding(.top, 16)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        artisanCard(name: "Jonathan Chilton", craft: "Woodworker · Maine", gradient: PatinaGradients.earth)
                        artisanCard(name: "Sarah Chen", craft: "Ceramicist · Vermont", gradient: PatinaGradients.stone)
                        artisanCard(name: "Marcus Webb", craft: "Metalsmith · Ohio", gradient: PatinaGradients.metal)
                    }
                    .padding(.horizontal, 24)
                }

                // Bottom padding for Companion
                Spacer()
                    .frame(height: 120)
            }
        }
        .background(PatinaColors.offWhite)
        .navigationBarHidden(true)
    }

    // MARK: - Components

    private var scanPromptCard: some View {
        Button {
            coordinator.navigate(to: .walk)
        } label: {
            HStack(spacing: 16) {
                ZStack {
                    RoundedRectangle(cornerRadius: 14)
                        .fill(PatinaColors.clay)
                        .frame(width: 56, height: 56)

                    Image(systemName: "viewfinder")
                        .font(.system(size: 24))
                        .foregroundColor(PatinaColors.offWhite)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("Scan a new room")
                        .font(PatinaTypography.h5)
                        .foregroundColor(PatinaColors.offWhite)

                    Text("Get personalized picks in under 10 minutes")
                        .font(PatinaTypography.caption)
                        .foregroundColor(PatinaColors.pearl)
                }

                Spacer()
            }
            .padding(24)
            .background(PatinaColors.charcoal)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
    }

    private func sectionHeader(title: String, action: String) -> some View {
        HStack {
            Text(title)
                .font(PatinaTypography.h5)
                .foregroundColor(PatinaColors.charcoal)
            Spacer()
            Text(action)
                .font(PatinaTypography.uiSmall)
                .foregroundColor(PatinaColors.clay)
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 12)
    }

    private func featuredCard(title: String, subtitle: String, gradient: LinearGradient) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            gradient
                .frame(height: 160)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundColor(PatinaColors.charcoal)
                Text(subtitle)
                    .font(PatinaTypography.caption)
                    .foregroundColor(PatinaColors.agedOak)
            }
            .padding(14)
        }
        .frame(width: 260)
        .background(PatinaColors.softCream)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private func artisanCard(name: String, craft: String, gradient: LinearGradient) -> some View {
        VStack(spacing: 8) {
            gradient
                .frame(width: 200, height: 200)
                .clipShape(RoundedRectangle(cornerRadius: 14))

            Text(name)
                .font(PatinaTypography.h5)
                .foregroundColor(PatinaColors.charcoal)

            MonoLabel(text: craft, size: PatinaTypography.monoSmall)
        }
        .frame(width: 200)
    }

    // MARK: - Helpers

    private var greetingTime: String {
        let hour = Calendar.current.component(.hour, from: Date())
        if hour < 12 { return "Good Morning" }
        if hour < 17 { return "Good Afternoon" }
        return "Good Evening"
    }
}

#Preview {
    HomeDiscoverView()
        .environment(\.appCoordinator, AppCoordinator())
}
