//
//  SettingsView.swift
//  Patina
//
//  Settings screen with grouped items, toggles, and navigation
//

import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.appCoordinator) private var coordinator
    @Environment(\.openURL) private var openURL
    @State private var settings = SettingsService.shared
    /// Cellular opt-in for large scan artifact uploads. Backing store is
    /// read by `RoomScanSyncService` at upload-time — UserDefaults key
    /// `patina.scanUploadOnCellularEnabled` keeps the two sides in sync.
    @AppStorage("patina.scanUploadOnCellularEnabled") private var uploadOnCellular = false
    /// Wave 3 dark-mode: appearance override (System / Light / Dark).
    /// PatinaApp reads the same key and applies `.preferredColorScheme`.
    @AppStorage(AppearanceSetting.storageKey) private var appearanceRaw = AppearanceSetting.system.rawValue

    var body: some View {
        // PT-0-5: this is the real settings sheet (was previously
        // AccountView). It's wrapped in a NavigationStack so the "Account"
        // row can push `AccountView` — keeping account details reachable
        // while the toggles (notifications / haptics / cellular) live here.
        NavigationStack {
            settingsContent
        }
    }

    private var settingsContent: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                // Header
                Text("Settings")
                    .font(PatinaTypography.h3)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .padding(.top, 56)
                    .padding(.horizontal, PatinaSpacing.lg)
                    .padding(.bottom, PatinaSpacing.lg)

                // Account group
                settingsGroup(title: "Account") {
                    NavigationLink {
                        // AccountView is presentation-agnostic (no inner
                        // NavigationStack) so this push works inside the
                        // settings sheet's stack (R03).
                        AccountView()
                    } label: {
                        settingsRow(icon: "person.circle", iconColor: PatinaColors.clay, label: "Account")
                    }
                    .buttonStyle(.plain)
                    settingsButtonRow(icon: "qrcode.viewfinder", iconColor: PatinaColors.dustyBlue, label: "Sign in on the web") {
                        // Swap the active sheet from Settings → QR scanner.
                        // `.sheet(item:)` in ContentView animates the change;
                        // same pattern as AccountView's "Sign in to Web".
                        coordinator.presentedSheet = .qr
                    }
                }

                // Preferences group
                settingsGroup(title: "Preferences") {
                    settingsToggleRow(
                        icon: "bell",
                        iconColor: PatinaColors.terracotta,
                        label: "Notifications",
                        isOn: Binding(
                            get: { settings.notificationsEnabled },
                            set: { settings.setNotificationsEnabled($0) }
                        )
                    )
                    settingsToggleRow(
                        icon: "hand.tap",
                        iconColor: PatinaColors.agedOak,
                        label: "Haptic Feedback",
                        isOn: Binding(
                            get: { settings.hapticsEnabled },
                            set: { settings.setHapticsEnabled($0) }
                        )
                    )
                    settingsToggleRow(icon: "antenna.radiowaves.left.and.right", iconColor: PatinaColors.dustyBlue, label: "Upload scans on cellular", isOn: $uploadOnCellular)
                    appearanceRow
                }

                // Support group
                settingsGroup(title: "Support") {
                    settingsButtonRow(icon: "questionmark.circle", iconColor: PatinaColors.sage, label: "Help Center") {
                        openLink("https://patina.cloud/help")
                    }
                    settingsButtonRow(icon: "envelope", iconColor: PatinaColors.clay, label: "Contact Us") {
                        openLink("mailto:hello@patina.cloud")
                    }
                    settingsButtonRow(icon: "doc.text", iconColor: PatinaColors.agedOak, label: "Terms & Privacy") {
                        openLink("https://patina.cloud/terms")
                    }
                }

                Spacer().frame(height: 120)
            }
        }
        .background(PatinaColors.Background.primary)
        .toolbarTitleDisplayMode(.inline)
        .task {
            await settings.load()
        }
    }

    // MARK: - Components

    /// Appearance picker row (Wave 3 dark-mode). Mirrors the settingsRow
    /// visual language with a trailing menu picker instead of a chevron.
    private var appearanceRow: some View {
        HStack(spacing: PatinaSpacing.xsm) {
            ZStack {
                RoundedRectangle(cornerRadius: PatinaRadius.md)
                    .fill(PatinaColors.mocha.opacity(0.15))
                    .frame(width: 32, height: 32)
                Image(systemName: "circle.lefthalf.filled")
                    .font(.system(size: 14))
                    .foregroundStyle(PatinaColors.mocha)
            }

            Text("Appearance")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.primary)

            Spacer()

            Picker("Appearance", selection: $appearanceRaw) {
                ForEach(AppearanceSetting.allCases) { option in
                    Text(option.label).tag(option.rawValue)
                }
            }
            .pickerStyle(.menu)
            .tint(PatinaColors.Text.secondary)
            .accessibilityLabel("Appearance")
        }
        .padding(.horizontal, PatinaSpacing.md)
        .padding(.vertical, PatinaSpacing.sm)
        .overlay(alignment: .bottom) {
            Rectangle().fill(PatinaColors.Text.muted.opacity(0.25)).frame(height: 1)
                .padding(.leading, 60)
        }
    }

    private func openLink(_ urlString: String) {
        guard let url = URL(string: urlString) else { return }
        openURL(url)
    }

    /// A chevron row that performs an action on tap. R03: every row that
    /// looks tappable must be a real Button or NavigationLink.
    private func settingsButtonRow(icon: String, iconColor: Color, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            settingsRow(icon: icon, iconColor: iconColor, label: label)
        }
        .buttonStyle(.plain)
    }

    private func settingsGroup(title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            MonoLabel(text: title, size: PatinaTypography.monoSmall)
                .tracking(1)
                // Card inset (24) + 4 so the label optically aligns with the
                // row content inside the rounded group card.
                .padding(.horizontal, PatinaSpacing.lg + PatinaSpacing.xxs)
                .padding(.bottom, PatinaSpacing.sm)

            VStack(spacing: 0) {
                content()
            }
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.xl))
            .padding(.horizontal, PatinaSpacing.lg)
        }
        .padding(.bottom, PatinaSpacing.lg)
    }

    private func settingsRow(icon: String, iconColor: Color, label: String) -> some View {
        HStack(spacing: PatinaSpacing.xsm) {
            ZStack {
                RoundedRectangle(cornerRadius: PatinaRadius.md)
                    .fill(iconColor.opacity(0.15))
                    .frame(width: 32, height: 32)
                Image(systemName: icon)
                    .font(.system(size: 14))
                    .foregroundStyle(iconColor)
            }

            Text(label)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.primary)

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 14))
                .foregroundStyle(PatinaColors.Text.muted)
        }
        .padding(.horizontal, PatinaSpacing.md)
        .padding(.vertical, PatinaSpacing.xsm)
        .overlay(alignment: .bottom) {
            Rectangle().fill(PatinaColors.Text.muted.opacity(0.25)).frame(height: 1)
                .padding(.leading, 60)
        }
    }

    private func settingsToggleRow(icon: String, iconColor: Color, label: String, isOn: Binding<Bool>) -> some View {
        HStack(spacing: PatinaSpacing.xsm) {
            ZStack {
                RoundedRectangle(cornerRadius: PatinaRadius.md)
                    .fill(iconColor.opacity(0.15))
                    .frame(width: 32, height: 32)
                Image(systemName: icon)
                    .font(.system(size: 14))
                    .foregroundStyle(iconColor)
            }

            Text(label)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.primary)

            Spacer()

            Toggle("", isOn: isOn)
                .tint(PatinaColors.Text.interactive)
                .labelsHidden()
                // R21: without this VoiceOver announces just "switch, on" —
                // give the control the visible row label as its subject.
                .accessibilityLabel(label)
        }
        .padding(.horizontal, PatinaSpacing.md)
        .padding(.vertical, PatinaSpacing.xsm)
        .overlay(alignment: .bottom) {
            Rectangle().fill(PatinaColors.Text.muted.opacity(0.25)).frame(height: 1)
                .padding(.leading, 60)
        }
    }
}

#Preview {
    SettingsView()
}
