//
//  AccountView.swift
//  Patina
//
//  Account details and sign out
//

import SwiftUI
import Auth

/// Account screen presented as a sheet
struct AccountView: View {
    @Environment(\.appCoordinator) private var coordinator
    @State private var showingSignOutAlert = false
    @State private var homeMode: SettingsService.HomeMode = SettingsService.shared.preferredHomeMode

    private var authService: AuthService { AuthService.shared }
    private var profileService: ProfileService { ProfileService.shared }

    /// Show the Workspace section only when the signed-in user actually
    /// has both designer and consumer roles. Solo-role users have a
    /// deterministic home, so the toggle would be confusing.
    private var showsWorkspaceToggle: Bool {
        let roles = profileService.roles
        return roles.contains("designer") && roles.contains("consumer")
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: PatinaSpacing.xl) {
                    // Header
                    headerSection

                    // Account info
                    accountSection

                    if showsWorkspaceToggle {
                        workspaceSection
                    }

                    // Actions
                    actionsSection

                    // Footer
                    footerSection
                }
                .padding(.horizontal, PatinaSpacing.lg)
                .padding(.top, PatinaSpacing.lg)
                .padding(.bottom, PatinaSpacing.xxl)
            }
            .background(PatinaColors.Background.primary)
            .navigationTitle("Account")
            .toolbarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        coordinator.showingSettings = false
                    }
                    .font(PatinaTypography.bodyMedium)
                    .foregroundStyle(PatinaColors.mocha)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .alert("Sign Out", isPresented: $showingSignOutAlert) {
            Button("Cancel", role: .cancel) {}
            Button("Sign Out") {
                Task { @MainActor in
                    // Close the settings sheet first so the splash
                    // transition isn't covered by it, then trigger the
                    // splash window. The phase observer will pick up
                    // the `.signedOut` event from `AuthService` and
                    // land on `.auth` once the splash deadline elapses.
                    coordinator.showingSettings = false
                    coordinator.beginSplashTransition()
                    try? await authService.signOut()
                }
            }
        } message: {
            Text("Are you sure you want to sign out?")
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: PatinaSpacing.md) {
            Image(systemName: "person.circle.fill")
                .font(.system(size: 64))
                .foregroundStyle(PatinaColors.Text.interactive)

            if let email = authService.currentUser?.email {
                Text(email)
                    .font(PatinaTypography.bodyMedium)
                    .foregroundStyle(PatinaColors.Text.primary)
            } else {
                Text("Not signed in")
                    .font(PatinaTypography.bodyMedium)
                    .foregroundStyle(PatinaColors.Text.secondary)
            }
        }
        .padding(.top, PatinaSpacing.md)
    }

    // MARK: - Account Section

    private var accountSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            sectionHeader("Account")

            VStack(spacing: 0) {
                infoRow(label: "Email", value: authService.currentUser?.email ?? "—")

                Divider()
                    .padding(.horizontal, PatinaSpacing.md)

                infoRow(
                    label: "Member since",
                    value: memberSinceText
                )
            }
            .background(PaperBackground(cornerRadius: PatinaRadius.lg))
        }
    }

    // MARK: - Workspace Section

    private var workspaceSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            sectionHeader("Workspace")

            VStack(spacing: 0) {
                HStack {
                    Text("Mode")
                        .font(PatinaTypography.body)
                        .foregroundStyle(PatinaColors.Text.secondary)
                    Spacer()
                    Menu {
                        Button("Auto") { applyHomeMode(.auto) }
                        Button("Designer") { applyHomeMode(.designer) }
                        Button("Consumer") { applyHomeMode(.consumer) }
                    } label: {
                        HStack(spacing: 6) {
                            Text(homeModeLabel(homeMode))
                                .font(PatinaTypography.body)
                                .foregroundStyle(PatinaColors.Text.primary)
                            Image(systemName: "chevron.up.chevron.down")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(PatinaColors.Text.muted)
                        }
                    }
                }
                .padding(PatinaSpacing.md)
            }
            .background(PaperBackground(cornerRadius: PatinaRadius.lg))
        }
    }

    private func homeModeLabel(_ mode: SettingsService.HomeMode) -> String {
        switch mode {
        case .auto: return "Auto"
        case .designer: return "Designer"
        case .consumer: return "Consumer"
        }
    }

    private func applyHomeMode(_ mode: SettingsService.HomeMode) {
        homeMode = mode
        SettingsService.shared.setPreferredHomeMode(mode)
        // Bounce back to the root so mainHomeView re-evaluates with the
        // new preference. The sheet stays open per existing patterns.
        coordinator.navigate(to: .heroFrame)
    }

    // MARK: - Actions Section

    private var actionsSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            sectionHeader("Actions")

            VStack(spacing: PatinaSpacing.md) {
                // Sign in to Web
                Button {
                    coordinator.showingSettings = false
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        coordinator.showingQRScanner = true
                    }
                } label: {
                    HStack {
                        Image(systemName: "qrcode.viewfinder")
                            .font(.system(size: 20))
                        Text("Sign in to Web")
                            .font(PatinaTypography.body)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(PatinaColors.Text.muted)
                    }
                    .foregroundStyle(PatinaColors.Text.primary)
                    .padding(PatinaSpacing.md)
                    .background(PaperBackground(cornerRadius: PatinaRadius.lg))
                }

                // Sign Out
                if authService.isAuthenticated {
                    PatinaButton("Sign Out", style: .secondary) {
                        showingSignOutAlert = true
                    }
                }
            }
        }
    }

    // MARK: - Footer

    private var footerSection: some View {
        Text("Patina \(AppConfiguration.fullVersion)")
            .font(PatinaTypography.caption)
            .foregroundStyle(PatinaColors.Text.muted)
            .padding(.top, PatinaSpacing.lg)
    }

    // MARK: - Helpers

    private func sectionHeader(_ title: String) -> some View {
        Text(title.uppercased())
            .font(PatinaTypography.caption)
            .foregroundStyle(PatinaColors.Text.muted)
            .padding(.horizontal, PatinaSpacing.sm)
            .padding(.bottom, PatinaSpacing.sm)
    }

    private func infoRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(PatinaTypography.body)
                .foregroundStyle(PatinaColors.Text.secondary)
            Spacer()
            Text(value)
                .font(PatinaTypography.body)
                .foregroundStyle(PatinaColors.Text.primary)
        }
        .padding(PatinaSpacing.md)
    }

    private var memberSinceText: String {
        guard let createdAt = authService.currentUser?.createdAt else {
            return "—"
        }
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter.string(from: createdAt)
    }
}

#Preview {
    AccountView()
        .environment(\.appCoordinator, AppCoordinator())
}
