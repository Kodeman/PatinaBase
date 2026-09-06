//
//  SettingsView.swift
//  Patina
//
//  Settings screen with grouped items, toggles, and navigation
//

import SwiftUI
import SwiftData

// W1b integration: the plank work grew this past the SwiftLint size floor,
// and P-07's authorization-aware notifications row grew it past the file
// floor as well. Both scoped so lint-delta still catches every other class of
// regression here; the split belongs to W2's R3 hygiene pass, not to a
// behaviour fix.
// swiftlint:disable file_length
// swiftlint:disable:next type_body_length
struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.appCoordinator) private var coordinator
    @Environment(\.openURL) private var openURL
    @Environment(\.modelContext) private var modelContext
    @State private var settings = SettingsService.shared
    @State private var contextMemory = ContextMemoryStore.shared
    @State private var showingForgetContextConfirmation = false
    @State private var showingResetTasteConfirmation = false
    /// SP-20: Sign Out and Delete account live here, not only behind a screen
    /// that could not be reached.
    @State private var showingSignOutConfirmation = false
    @State private var showingDeleteConfirmation = false
    @State private var isDeletingAccount = false
    @State private var deleteFailureMessage: String?
    private var authService: AuthService { AuthService.shared }
    /// Cellular opt-in for large scan artifact uploads. Backing store is
    /// read by `RoomScanSyncService` at upload-time — UserDefaults key
    /// `patina.scanUploadOnCellularEnabled` keeps the two sides in sync.
    @AppStorage("patina.scanUploadOnCellularEnabled") private var uploadOnCellular = false
    /// Wave 3 dark-mode: appearance override (System / Light / Dark).
    /// PatinaApp reads the same key and applies `.preferredColorScheme`.
    @AppStorage(AppearanceSetting.storageKey) private var appearanceRaw = AppearanceSetting.system.rawValue
    /// `W1-C-08` / `P-07`: whether iOS itself will deliver a notification for
    /// Patina. The Notifications row used to bind a local `AppSettings` bool
    /// alone, so on the very launch where `PushPrimerView` had just said
    /// "Notifications are off for Patina" this screen showed the switch ON.
    /// The model reads `UNUserNotificationCenter` on appear and holds `nil`
    /// until that read lands, so the row never asserts either answer before
    /// it has one.
    @State private var notificationsAuthorization = NotificationsRowModel()

    var body: some View {
        // PT-0-5: this is the real settings sheet (was previously
        // AccountView). It's wrapped in a NavigationStack so the "Account"
        // row can push `AccountView` — keeping account details reachable
        // while the toggles (notifications / haptics / cellular) live here.
        NavigationStack {
            settingsContent
        }
        // A-99: `PatinaApp` applies this at the window, but a sheet is its own
        // presentation and did not follow it back — choosing Dark and then
        // Light left a black sheet over a light window (shots/A/60, 63, 64).
        .preferredColorScheme(appearance.colorScheme)
        // C-23: one sheet chrome. Help had a grabber and an ✕; this had
        // neither.
        .presentationDragIndicator(.visible)
    }

    private var appearance: AppearanceSetting {
        AppearanceSetting(rawValue: appearanceRaw) ?? .system
    }

    private var settingsContent: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
                // Header. A-100 / C-23: the sheet had no dismiss control at
                // all — the only exit was a drag from its very top edge, and a
                // swipe started 48 pt lower scrolled the list instead. Done
                // sits in the header the screen already draws rather than in a
                // navigation bar it otherwise hides.
                HStack(alignment: .firstTextBaseline) {
                    Text("Settings")
                        .font(PatinaTypography.h3)
                        .foregroundStyle(PatinaColors.Text.primary)
                    Spacer()
                    // `minHeight` alone left the width to the glyph: measured
                    // 38 × 44 on the clone, in the lane that is enforcing the
                    // 44 pt floor everywhere else.
                    Button("Done") { dismiss() }
                        .font(PatinaTypography.uiAction)
                        .foregroundStyle(PatinaColors.Text.interactive)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                        .accessibilityIdentifier("SettingsView.DoneButton")
                }
                .padding(.top, 56)
                .padding(.horizontal, PatinaSpacing.lg)
                .padding(.bottom, PatinaSpacing.lg)

                // Account group
                settingsGroup(title: "Account") {
                    // C1-14: a guest saw a QR row that cannot work without the
                    // session they have not got, and no way to sign in at all.
                    if !authService.isAuthenticated {
                        settingsButtonRow(
                            icon: "person.crop.circle.badge.plus",
                            iconColor: PatinaColors.clay,
                            label: "Sign in or create your account"
                        ) {
                            coordinator.presentedSheet = .auth
                        }
                        .accessibilityIdentifier("SettingsView.SignInButton")
                    }
                    NavigationLink {
                        // AccountView is presentation-agnostic (no inner
                        // NavigationStack) so this push works inside the
                        // settings sheet's stack (R03).
                        AccountView()
                    } label: {
                        settingsRow(icon: "person.circle", iconColor: PatinaColors.clay, label: "Account")
                    }
                    .buttonStyle(.plain)
                    if authService.isAuthenticated {
                        // C1-14: this approves a PORTAL sign-in with THIS
                        // device's session, so it belongs inside the guard.
                        settingsButtonRow(icon: "qrcode.viewfinder", iconColor: PatinaColors.dustyBlue, label: "Sign in on the web") {
                            // Swap the active sheet from Settings → QR scanner.
                            // `.sheet(item:)` in ContentView animates the change;
                            // same pattern as AccountView's "Sign in to Web".
                            coordinator.presentedSheet = .qr
                        }
                        settingsButtonRow(
                            icon: "rectangle.portrait.and.arrow.right",
                            iconColor: PatinaColors.agedOak,
                            label: "Sign out"
                        ) {
                            showingSignOutConfirmation = true
                        }
                        .accessibilityIdentifier("SettingsView.SignOutButton")
                        settingsButtonRow(
                            icon: "trash",
                            iconColor: PatinaColors.terracotta,
                            label: "Delete account"
                        ) {
                            showingDeleteConfirmation = true
                        }
                        .accessibilityIdentifier("SettingsView.DeleteAccountButton")
                    }
                }

                if let deleteFailureMessage {
                    Text(deleteFailureMessage)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, PatinaSpacing.lg)
                        .padding(.bottom, PatinaSpacing.lg)
                        .accessibilityIdentifier("SettingsView.DeleteAccountFailure")
                }

                // Preferences group
                settingsGroup(title: "Preferences") {
                    notificationsRow
                    reminderCadenceRow
                    settingsToggleRow(
                        icon: "hand.tap",
                        iconColor: PatinaColors.agedOak,
                        label: "Haptic feedback",
                        isOn: Binding(
                            get: { settings.hapticsEnabled },
                            set: { settings.setHapticsEnabled($0) }
                        )
                    )
                    settingsToggleRow(icon: "antenna.radiowaves.left.and.right", iconColor: PatinaColors.dustyBlue, label: "Upload scans on cellular", isOn: $uploadOnCellular)
                    appearanceRow
                }

                settingsGroup(title: "Privacy & Memory") {
                    contextMemoryToggle
                    settingsButtonRow(
                        icon: "clock.arrow.circlepath",
                        iconColor: PatinaColors.agedOak,
                        label: "Forget recent context"
                    ) {
                        showingForgetContextConfirmation = true
                    }
                    .accessibilityIdentifier("SettingsView.ForgetContextButton")
                    settingsButtonRow(
                        icon: "paintpalette",
                        iconColor: PatinaColors.clay,
                        label: "Reset taste portrait"
                    ) {
                        showingResetTasteConfirmation = true
                    }
                    .accessibilityIdentifier("SettingsView.ResetTasteButton")
                }

                // Support group
                settingsGroup(title: "Support") {
                    settingsButtonRow(icon: "envelope", iconColor: PatinaColors.clay, label: "Contact us") {
                        openLink("mailto:hello@patina.cloud")
                    }
                    settingsButtonRow(icon: "doc.text", iconColor: PatinaColors.agedOak, label: "Terms & privacy") {
                        openLink("https://patina.cloud/terms")
                    }
                }
            }
            .companionBottomClearance()
        }
        .background(PatinaColors.Background.primary)
        .toolbarTitleDisplayMode(.inline)
        .task {
            // C2-09's rule — read the status, do not assume it — applied to
            // the row that asserts it (`W1-C-08`). It runs FIRST: it is a
            // local read, `settings.load()` is two network round-trips, and
            // in between them the row would have to draw from the stored
            // preference alone, which defaults on.
            await notificationsAuthorization.refresh()
            await settings.load()
        }
        .alert("Forget recent context?", isPresented: $showingForgetContextConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Forget", role: .destructive) {
                contextMemory.forgetAll()
                RoomSelectionStore.shared.clear()
                PostHogService.shared.capture("context_memory_forgotten")
            }
        } message: {
            Text("Patina will forget recent room, product, project, and style activity. Your rooms, scans, saved pieces, projects, and taste portrait stay intact.")
        }
        .alert("Reset taste portrait?", isPresented: $showingResetTasteConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Reset", role: .destructive) {
                StyleProfileStore.shared.resetTasteProfile(in: modelContext)
                contextMemory.forgetStyle()
                PostHogService.shared.capture("taste_portrait_reset")
            }
        } message: {
            Text("This removes your local taste portrait and its tuning. Rooms, scans, saved pieces, and projects are not changed.")
        }
        .alert("Sign out?", isPresented: $showingSignOutConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Sign out") { signOut() }
        } message: {
            Text("Are you sure you want to sign out?")
        }
        .alert(AccountDeletionService.confirmationTitle, isPresented: $showingDeleteConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Delete account", role: .destructive) { deleteAccount() }
        } message: {
            Text(AccountDeletionService.confirmationBody)
        }
    }

    // MARK: - Account actions (SP-20)

    private func signOut() {
        Task { @MainActor in
            // Close this sheet first so the splash transition isn't covered
            // by it — the same order AccountView's alert uses.
            coordinator.presentedSheet = nil
            coordinator.beginSplashTransition()
            try? await AuthService.shared.signOut()
        }
    }

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

    // MARK: - Components

    private var contextMemoryToggle: some View {
        HStack(alignment: .top, spacing: PatinaSpacing.xsm) {
            ZStack {
                RoundedRectangle(cornerRadius: PatinaRadius.md)
                    .fill(PatinaColors.sage.opacity(0.15))
                    .frame(width: 32, height: 32)
                Image(systemName: "brain.head.profile")
                    .font(.system(size: 14))
                    .foregroundStyle(PatinaColors.sage)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text("Use activity for context")
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.primary)
                Text("Off until you choose it. When on, Patina remembers only activity type, an identifier, and time for up to 90 days.")
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 8)

            Toggle("Use activity for context", isOn: Binding(
                get: { contextMemory.isEnabled },
                set: { enabled in
                    contextMemory.setEnabled(enabled)
                    PostHogService.shared.capture("context_memory_setting_changed", properties: [
                        "enabled": enabled
                    ])
                }
            ))
            .labelsHidden()
            .tint(PatinaColors.Text.interactive)
            .accessibilityHint("Turning this off also forgets all recent contextual activity stored on this device.")
            .accessibilityIdentifier("SettingsView.ContextMemoryToggle")
        }
        .padding(.horizontal, PatinaSpacing.md)
        .padding(.vertical, PatinaSpacing.sm)
        .frame(minHeight: 44)
        .overlay(alignment: .bottom) {
            Rectangle().fill(PatinaColors.Text.muted.opacity(0.25)).frame(height: 1)
                .padding(.leading, 60)
        }
    }

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
        .frame(minHeight: 44)
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
        // SP-20: this is the label of a NavigationLink/Button carrying
        // `.buttonStyle(.plain)`, which hit-tests only the drawn content —
        // so the Spacer in the middle of the row swallowed every centred tap
        // and "Account" never pushed. Bisected on the simulator: a tap on the
        // word worked, a tap dead-centre did not.
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .overlay(alignment: .bottom) {
            Rectangle().fill(PatinaColors.Text.muted.opacity(0.25)).frame(height: 1)
                .padding(.leading, 60)
        }
    }

    /// `W1-C-08` / `P-07`. With iOS authorization denied the app's own
    /// preference is not the truth about whether anything arrives, and a
    /// switch reading ON over a denied authorization is a straightforward lie.
    /// There the row stops being a switch and becomes the one door that works.
    /// Undecided, the switch is the door: turning it on asks iOS, and the
    /// preference is written only if something was granted.
    @ViewBuilder
    private var notificationsRow: some View {
        if notificationsAuthorization.state == .denied {
            settingsButtonRow(
                icon: "bell.slash",
                iconColor: PatinaColors.terracotta,
                label: Self.turnOnInSettingsLabel
            ) {
                if let url = PushTokenService.settingsURL { openURL(url) }
            }
            .accessibilityIdentifier("SettingsView.NotificationsDenied")
        } else {
            settingsToggleRow(
                icon: "bell",
                iconColor: PatinaColors.terracotta,
                label: "Notifications",
                isOn: Binding(
                    get: {
                        // Only an authorization the app has actually read can
                        // carry the preference. Undecided means iOS has never
                        // been asked; nil means the read has not landed yet —
                        // and the stored preference defaults ON, so falling
                        // through to it would draw the same lie for the whole
                        // pre-read window.
                        notificationsAuthorization.state == .authorized
                            ? settings.notificationsEnabled
                            : false
                    },
                    set: { enabled in
                        Task {
                            await notificationsAuthorization.setEnabled(enabled, settings: settings)
                        }
                    }
                )
            )
            .accessibilityIdentifier("SettingsView.NotificationsToggle")
        }
    }

    /// `P-28`. How often Patina checks in, in three plain words rather than
    /// the column's two tokens. The floor beneath it is the one promise the
    /// push leg actually keeps, said as a fact rather than sold as a feature.
    ///
    /// It draws under the notifications row and not inside it: the switch is
    /// whether anything arrives at all, and this is the pace of what does.
    private var reminderCadenceRow: some View {
        VStack(alignment: .leading, spacing: PatinaSpacing.xxs) {
            HStack(spacing: PatinaSpacing.xsm) {
                ZStack {
                    RoundedRectangle(cornerRadius: PatinaRadius.md)
                        .fill(PatinaColors.clay.opacity(0.15))
                        .frame(width: 32, height: 32)
                    Image(systemName: "clock")
                        .font(.system(size: 14))
                        .foregroundStyle(PatinaColors.clay)
                }

                Text(DecisionPaceCopy.cadenceLabel)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.primary)

                Spacer()

                Picker(DecisionPaceCopy.cadenceLabel, selection: Binding(
                    get: { settings.reminderCadence },
                    set: { settings.setReminderCadence($0) }
                )) {
                    ForEach(ReminderCadence.allCases) { option in
                        Text(option.label).tag(option)
                    }
                }
                .pickerStyle(.menu)
                .tint(PatinaColors.Text.secondary)
                .accessibilityLabel(DecisionPaceCopy.cadenceLabel)
                .accessibilityIdentifier("SettingsView.ReminderCadence")
            }
            .frame(minHeight: 44)

            Text(DecisionPaceCopy.quietHours)
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.Text.muted)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("SettingsView.ReminderQuietHours")
        }
        .padding(.horizontal, PatinaSpacing.md)
        .padding(.vertical, PatinaSpacing.sm)
        .overlay(alignment: .bottom) {
            Rectangle().fill(PatinaColors.Text.muted.opacity(0.25)).frame(height: 1)
                .padding(.leading, 60)
        }
    }

    /// The denied row's own sentence — a door, not a diagnosis.
    static let turnOnInSettingsLabel = "Turn on in iOS Settings"

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
        .frame(minHeight: 44)
        .overlay(alignment: .bottom) {
            Rectangle().fill(PatinaColors.Text.muted.opacity(0.25)).frame(height: 1)
                .padding(.leading, 60)
        }
    }
}

#Preview {
    SettingsView()
}
