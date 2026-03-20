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

    private var authService: AuthService { AuthService.shared }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: PatinaSpacing.xl) {
                    // Header
                    headerSection

                    // Account info
                    accountSection

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
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        coordinator.showingSettings = false
                    }
                    .font(PatinaTypography.bodyMedium)
                    .foregroundColor(PatinaColors.mochaBrown)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .alert("Sign Out", isPresented: $showingSignOutAlert) {
            Button("Cancel", role: .cancel) {}
            Button("Sign Out") {
                Task {
                    try? await authService.signOut()
                    coordinator.showingSettings = false
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
                .foregroundColor(PatinaColors.clayBeige)

            if let email = authService.currentUser?.email {
                Text(email)
                    .font(PatinaTypography.bodyMedium)
                    .foregroundColor(PatinaColors.Text.primary)
            } else {
                Text("Not signed in")
                    .font(PatinaTypography.bodyMedium)
                    .foregroundColor(PatinaColors.Text.secondary)
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
                            .foregroundColor(PatinaColors.Text.muted)
                    }
                    .foregroundColor(PatinaColors.Text.primary)
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
            .foregroundColor(PatinaColors.Text.muted)
            .padding(.top, PatinaSpacing.lg)
    }

    // MARK: - Helpers

    private func sectionHeader(_ title: String) -> some View {
        Text(title.uppercased())
            .font(PatinaTypography.caption)
            .foregroundColor(PatinaColors.Text.muted)
            .padding(.horizontal, PatinaSpacing.sm)
            .padding(.bottom, PatinaSpacing.sm)
    }

    private func infoRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(PatinaTypography.body)
                .foregroundColor(PatinaColors.Text.secondary)
            Spacer()
            Text(value)
                .font(PatinaTypography.body)
                .foregroundColor(PatinaColors.Text.primary)
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
