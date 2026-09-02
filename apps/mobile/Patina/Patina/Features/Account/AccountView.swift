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
    /// SP-20 / App Store 5.1.1(v). Kept in step with the same two acts in
    /// Settings so the two surfaces can never offer different answers.
    @State private var showingDeleteAlert = false
    @State private var isDeletingAccount = false
    @State private var deleteFailureMessage: String?

    private var authService: AuthService { AuthService.shared }

    /// Shared formatter for the "member since" date. `static let` so the
    /// formatter is allocated once rather than on every body re-render
    /// (PT-6-5).
    private static let memberSinceFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter
    }()

    var body: some View {
        ScrollView {
            VStack(spacing: PatinaSpacing.xl) {
                if authService.isAuthenticated {
                    headerSection
                    accountSection
                    actionsSection
                } else {
                    // B-12 / C1-14: a guest used to land on
                    // person.circle.fill, "Not signed in", "Email —",
                    // "Member since —" and one button that opened a QR
                    // scanner needing the session they do not have.
                    signedOutSection
                }

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
        .alert(AccountDeletionService.confirmationTitle, isPresented: $showingDeleteAlert) {
            Button("Cancel", role: .cancel) {}
            Button("Delete account", role: .destructive) { deleteAccount() }
        } message: {
            Text(AccountDeletionService.confirmationBody)
        }
    }

    // MARK: - Delete account (SP-20)

    private func deleteAccount() {
        guard !isDeletingAccount else { return }
        isDeletingAccount = true
        deleteFailureMessage = nil
        Task { @MainActor in
            do {
                // Ask first, tear the UI down after. A failure must leave the
                // person on this screen with one sentence, not flash a splash
                // and bounce back.
                try await AccountDeletionService.shared.deleteAccount()
                coordinator.presentedSheet = nil
                coordinator.beginSplashTransition()
                try? await AuthService.shared.signOut()
            } catch {
                // C5: our sentence, never the server's.
                deleteFailureMessage = AccountDeletionService.failureCopy
            }
            isDeletingAccount = false
        }
    }

    // MARK: - Signed out (B-12, C1-14)

    /// One sentence and a door. The QR row is hidden here: "Sign in on the
    /// web" approves a PORTAL sign-in from a session this reader has not got.
    private var signedOutSection: some View {
        VStack(spacing: PatinaSpacing.lg) {
            Image(systemName: "person.circle")
                .font(.system(size: 56))
                .foregroundStyle(PatinaColors.Text.muted)
                .padding(.top, PatinaSpacing.lg)

            Text("You're looking around without an account.")
                .font(PatinaTypography.bodyMedium)
                .foregroundStyle(PatinaColors.Text.primary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            Text("Sign in to see your projects, decisions, proposals and invoices.")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            PatinaButton("Sign in or create your account", style: .primary) {
                coordinator.presentedSheet = .auth
            }
            .accessibilityIdentifier("AccountView.SignInButton")
        }
        .padding(.horizontal, PatinaSpacing.sm)
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

    // MARK: - Actions Section
    //
    // No "Get Patina Field" pointer lives here: Patina Field has no App Store
    // URL in the app or its configuration, and a row that navigates nowhere is
    // worse than no row. Add one as a `Link` once the Field listing ships.

    private var actionsSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            sectionHeader("Actions")

            VStack(spacing: PatinaSpacing.md) {
                // Sign in on the web — approves a PORTAL sign-in with this
                // session, so it belongs to a signed-in reader only (C1-14).
                Button {
                    // Swap the active sheet from Account → QR scanner.
                    // `.sheet(item:)` animates the change; no manual delay
                    // needed now that a single sheet drives presentation.
                    coordinator.presentedSheet = .qr
                } label: {
                    HStack {
                        Image(systemName: "qrcode.viewfinder")
                            .font(.system(size: 20))
                        Text("Sign in on the web")
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
                PatinaButton("Sign out", style: .secondary) {
                    showingSignOutAlert = true
                }

                Button("Delete account") {
                    showingDeleteAlert = true
                }
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.terracotta)
                .frame(maxWidth: .infinity, minHeight: 44)
                .contentShape(Rectangle())
                .accessibilityIdentifier("AccountView.DeleteAccountButton")

                if let deleteFailureMessage {
                    Text(deleteFailureMessage)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.secondary)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("AccountView.DeleteAccountFailure")
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
