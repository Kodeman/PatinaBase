//
//  SettingsView.swift
//  Patina
//
//  Settings screen with grouped items, toggles, and navigation
//

import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var notificationsOn = true
    @State private var hapticOn = true

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                // Header
                Text("Settings")
                    .font(PatinaTypography.h3)
                    .foregroundColor(PatinaColors.charcoal)
                    .padding(.top, 56)
                    .padding(.horizontal, 24)
                    .padding(.bottom, 24)

                // Account group
                settingsGroup(title: "Account") {
                    settingsRow(icon: "person.circle", iconColor: PatinaColors.clay, label: "Profile")
                    settingsRow(icon: "paintpalette", iconColor: PatinaColors.sage, label: "Style Preferences")
                    settingsRow(icon: "qrcode.viewfinder", iconColor: PatinaColors.dustyBlue, label: "Connected Portals")
                }

                // Preferences group
                settingsGroup(title: "Preferences") {
                    settingsToggleRow(icon: "bell", iconColor: PatinaColors.terracotta, label: "Notifications", isOn: $notificationsOn)
                    settingsToggleRow(icon: "hand.tap", iconColor: PatinaColors.agedOak, label: "Haptic Feedback", isOn: $hapticOn)
                    settingsRow(icon: "moon", iconColor: PatinaColors.dustyBlue, label: "Appearance")
                }

                // Support group
                settingsGroup(title: "Support") {
                    settingsRow(icon: "questionmark.circle", iconColor: PatinaColors.sage, label: "Help Center")
                    settingsRow(icon: "envelope", iconColor: PatinaColors.clay, label: "Contact Us")
                    settingsRow(icon: "doc.text", iconColor: PatinaColors.agedOak, label: "Terms & Privacy")
                }

                Spacer().frame(height: 120)
            }
        }
        .background(PatinaColors.offWhite)
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Components

    private func settingsGroup(title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            MonoLabel(text: title, size: PatinaTypography.monoSmall)
                .tracking(1)
                .padding(.horizontal, 28)
                .padding(.bottom, 8)

            VStack(spacing: 0) {
                content()
            }
            .background(PatinaColors.softCream)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .padding(.horizontal, 24)
        }
        .padding(.bottom, 24)
    }

    private func settingsRow(icon: String, iconColor: Color, label: String) -> some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(iconColor.opacity(0.15))
                    .frame(width: 32, height: 32)
                Image(systemName: icon)
                    .font(.system(size: 14))
                    .foregroundColor(iconColor)
            }

            Text(label)
                .font(PatinaTypography.bodySmall)
                .foregroundColor(PatinaColors.charcoal)

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 14))
                .foregroundColor(PatinaColors.agedOak)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .overlay(alignment: .bottom) {
            Rectangle().fill(PatinaColors.pearl).frame(height: 1)
                .padding(.leading, 60)
        }
    }

    private func settingsToggleRow(icon: String, iconColor: Color, label: String, isOn: Binding<Bool>) -> some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(iconColor.opacity(0.15))
                    .frame(width: 32, height: 32)
                Image(systemName: icon)
                    .font(.system(size: 14))
                    .foregroundColor(iconColor)
            }

            Text(label)
                .font(PatinaTypography.bodySmall)
                .foregroundColor(PatinaColors.charcoal)

            Spacer()

            Toggle("", isOn: isOn)
                .tint(PatinaColors.clay)
                .labelsHidden()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .overlay(alignment: .bottom) {
            Rectangle().fill(PatinaColors.pearl).frame(height: 1)
                .padding(.leading, 60)
        }
    }
}

#Preview {
    SettingsView()
}
