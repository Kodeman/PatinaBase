//
//  AccountView.swift
//  Patina
//
//  Account details and sign out
//

import SwiftUI
import Auth

/// Account details screen. Presentation-agnostic: it does NOT own a
/// `NavigationStack` — SettingsView pushes it inside the settings sheet's
/// stack (a nested NavigationStack would make that push silently fail).
struct AccountView: View {
    @Environment(\.appCoordinator) private var coordinator
    @State private var showingSignOutAlert = false

    private var authService: AuthService { AuthService.shared }
    private var profileService: ProfileService { ProfileService.shared }

    /// Shared formatter for the "member since" date. `static let` so the
    /// formatter is allocated once rather than on every body re-render
    /// (PT-6-5).
    private static let memberSinceFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter
    }()

    /// Designers now work in the separate Patina Field app. Surface a quiet
    /// pointer to it for anyone whose profile still carries the designer role.
    private var isDesigner: Bool {
        profileService.roles.contains("designer")
    }

    var body: some View {
        ScrollView {
            VStack(spacing: PatinaSpacing.xl) {
                // Header
                headerSection

                // Account info
                accountSection

                if isDesigner {
                    patinaFieldRow
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
        .alert("Sign Out", isPresented: $showingSignOutAlert) {
            Button("Cancel", role: .cancel) {}
            Button("Sign Out") {
                Task { @MainActor in
                    // Close the settings sheet first so the splash
                    // transition isn't covered by it, then trigger the
                    // splash window. The phase observer will pick up
                    // the `.signedOut` event from `AuthService` and
                    // land on `.auth` once the splash deadline elapses.
                    // (PT-3-9 also clears `presentedSheet` on the `.auth`
                    // transition as a backstop.)
                    coordinator.presentedSheet = nil
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

    // MARK: - Patina Field Row

    /// A single quiet pointer to the companion Patina Field app, shown only
    /// to users who still carry the designer role. Non-navigating in v1 —
    /// no App Store link yet.
    private var patinaFieldRow: some View {
        HStack(spacing: PatinaSpacing.md) {
            Image(systemName: "briefcase")
                .font(.system(size: 20))
                .foregroundStyle(PatinaColors.Text.secondary)
            Text("Working on Patina projects? Get Patina Field.")
                .font(PatinaTypography.body)
                .foregroundStyle(PatinaColors.Text.secondary)
            Spacer(minLength: 0)
        }
        .padding(PatinaSpacing.md)
        .background(PaperBackground(cornerRadius: PatinaRadius.lg))
    }

    // MARK: - Actions Section

    private var actionsSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            sectionHeader("Actions")

            VStack(spacing: PatinaSpacing.md) {
                // Sign in to Web
                Button {
                    // Swap the active sheet from Account → QR scanner.
                    // `.sheet(item:)` animates the change; no manual delay
                    // needed now that a single sheet drives presentation.
                    coordinator.presentedSheet = .qr
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
        return Self.memberSinceFormatter.string(from: createdAt)
    }
}

#Preview {
    NavigationStack {
        AccountView()
    }
    .environment(\.appCoordinator, AppCoordinator())
}
