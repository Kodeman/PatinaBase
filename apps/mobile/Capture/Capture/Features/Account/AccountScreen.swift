//  AccountScreen.swift
//  Capture · Team F (System Surface)
//
//  T2 · Account & workspace (route `.account`, id `t2Account`). Identity, active
//  workspace, plan, and this device's sync state, with a clear sign-out that warns
//  when captures are still unsynced. Switching workspace re-points where future
//  captures save. Sources: container.session (identity/workspace/signOut),
//  container.store.outbox() (unsynced count), container.sync.snapshots (device sync).

import SwiftUI
import Foundation
import CaptureKit

struct AccountScreen: View {
    let session: any SessionProviding
    let store: CaptureStore
    let sync: any CaptureSyncService
    let analytics: any CaptureAnalytics
    let coordinator: CaptureCoordinator

    @Environment(\.openURL) private var openURL

    @State private var snapshot = SyncSnapshot(queued: 0, uploading: 0, failed: 0)
    @State private var unsyncedCount = 0
    @State private var showSignOutConfirm = false

    private let webAppURL = URL(string: "https://app.patina.cloud")
    private let billingURL = URL(string: "https://app.patina.cloud/settings/billing")

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                identityCard
                workRow
                workspaceSection
                deviceSection
                actions
            }
            .padding(20)
        }
        .background(CaptureColor.paper)
        .navigationTitle("Account")
        .navigationBarTitleDisplayMode(.large)
        .task {
            analytics.screen(CaptureScreenID.t2Account.rawValue)
            unsyncedCount = CaptureOwnerIdentity(
                userID: session.userID,
                workspaceID: session.workspaceID
            ).map { store.outbox(owner: $0).count } ?? 0
            for await snap in sync.snapshots { snapshot = snap }
        }
        .alert("Captures still on this device", isPresented: $showSignOutConfirm) {
            Button("Sign out anyway", role: .destructive) { performSignOut() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("\(unsyncedCount) capture\(unsyncedCount == 1 ? "" : "s") haven't synced yet. They stay on this device and upload next time you sign in.")
        }
        .accessibilityIdentifier(CaptureScreenID.t2Account.rawValue)
    }

    // MARK: identity

    private var identityCard: some View {
        HStack(spacing: 14) {
            Circle()
                .fill(CaptureColor.verdigris.opacity(0.16))
                .frame(width: 52, height: 52)
                .overlay(
                    Image(systemName: "person.fill")
                        .foregroundStyle(CaptureColor.verdigris)
                )
            VStack(alignment: .leading, spacing: 3) {
                Text("Signed in")
                    .font(CaptureType.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(CaptureColor.inkSoft)
                Text(identityLabel)
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.ink)
                    .lineLimit(1)
                    .truncationMode(.middle)
                if let sub = identitySubLabel {
                    Text(sub)
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.inkSoft)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
            }
            Spacer()
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 14).fill(CaptureColor.paper3))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(CaptureColor.line, lineWidth: 1))
    }

    private var identityLabel: String {
        // Prefer the human name, then email, then the raw user id.
        session.displayName ?? session.userEmail ?? session.userID ?? "Not signed in"
    }

    /// Email shown beneath the name when we have both and they differ.
    private var identitySubLabel: String? {
        guard let email = session.userEmail, email != identityLabel else { return nil }
        return email
    }

    // MARK: work (W1 — designer/pro dashboard)

    private var workRow: some View {
        Button {
            analytics.event("work.open", ["from": "account"])
            coordinator.navigate(to: .work)
        } label: {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(CaptureColor.verdigrisInk.opacity(0.12))
                        .frame(width: 44, height: 44)
                    Image(systemName: "briefcase.fill")
                        .font(CaptureType.title2)
                        .foregroundStyle(CaptureColor.verdigrisInk)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("Work")
                        .font(CaptureType.bodyEmph)
                        .foregroundStyle(CaptureColor.ink)
                    Text("Projects, leads, decisions, messages")
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.inkSoft)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.line2)
            }
            .padding(16)
            .background(RoundedRectangle(cornerRadius: 14).fill(CaptureColor.paper3))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(CaptureColor.line, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .accessibilityIdentifier("account.work")
    }

    // MARK: workspace + plan

    private var workspaceSection: some View {
        VStack(spacing: 0) {
            rowChrome("Workspace") {
                Menu {
                    // No enumerate/switch-workspace seam; current shown, checked.
                    Picker("Workspace", selection: .constant(session.workspaceID ?? "")) {
                        Text(session.workspaceName ?? "Workspace").tag(session.workspaceID ?? "")
                    }
                    Button("Manage in web app") { open(webAppURL, "account.manage_workspace") }
                } label: {
                    valueLabel(session.workspaceName ?? "—")
                }
            }
            divider
            rowChrome("Plan") {
                Button {
                    open(billingURL, "account.manage_plan")
                } label: {
                    HStack(spacing: 4) {
                        Text("Manage in web app")
                            .font(CaptureType.body)
                            .foregroundStyle(CaptureColor.ink)
                        Image(systemName: "arrow.up.right")
                            .font(.caption2)
                            .foregroundStyle(CaptureColor.inkSoft)
                    }
                }
            }
        }
        .background(RoundedRectangle(cornerRadius: 14).fill(CaptureColor.paper3))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(CaptureColor.line, lineWidth: 1))
    }

    // MARK: this device

    private var deviceSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("This device")
                .font(CaptureType.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(CaptureColor.verdigrisInk)
                .padding(.leading, 4)
            HStack {
                HStack(spacing: 8) {
                    Circle().fill(deviceSyncColor).frame(width: 8, height: 8)
                    Text(deviceSyncLabel)
                        .font(CaptureType.body)
                        .foregroundStyle(CaptureColor.ink)
                }
                Spacer()
                Button("Sync now") {
                    analytics.event("account.sync_now")
                    Task {
                        await sync.drain()
                        unsyncedCount = CaptureOwnerIdentity(
                            userID: session.userID,
                            workspaceID: session.workspaceID
                        ).map { store.outbox(owner: $0).count } ?? 0
                    }
                }
                .font(CaptureType.callout.weight(.semibold))
                .foregroundStyle(CaptureColor.verdigris)
            }
            .padding(16)
            .background(RoundedRectangle(cornerRadius: 14).fill(CaptureColor.paper3))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(CaptureColor.line, lineWidth: 1))
        }
    }

    private var deviceSyncLabel: String {
        if unsyncedCount == 0 && snapshot.failed == 0 { return "Synced" }
        var parts: [String] = []
        if snapshot.uploading > 0 { parts.append("\(snapshot.uploading) uploading") }
        let waiting = max(unsyncedCount - snapshot.failed, snapshot.queued)
        if waiting > 0 { parts.append("\(waiting) queued") }
        if snapshot.failed > 0 { parts.append("\(snapshot.failed) failed") }
        return parts.isEmpty ? "\(unsyncedCount) waiting" : parts.joined(separator: " · ")
    }

    private var deviceSyncColor: Color {
        if snapshot.failed > 0 { return CaptureColor.error }
        if unsyncedCount > 0 || snapshot.uploading > 0 { return CaptureColor.warning }
        return CaptureColor.success
    }

    // MARK: actions

    private var actions: some View {
        VStack(spacing: 12) {
            Button {
                if unsyncedCount > 0 {
                    showSignOutConfirm = true
                } else {
                    performSignOut()
                }
            } label: {
                Text("Sign out")
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.error)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(CaptureColor.error.opacity(0.5), lineWidth: 1))
            }
            if unsyncedCount > 0 {
                Text("Signing out keeps queued captures on-device until they sync.")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(.top, 4)
    }

    // MARK: helpers

    private func performSignOut() {
        analytics.event("account.sign_out", ["unsynced": String(unsyncedCount)])
        Task {
            await session.signOut()
            // Clear the pushed stack and drop back to onboarding (O1).
            coordinator.popToRoot()
            coordinator.phase = .auth
        }
    }

    private func open(_ url: URL?, _ event: String) {
        analytics.event(event)
        if let url { openURL(url) }
    }

    private func rowChrome<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        HStack {
            Text(title)
                .font(CaptureType.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(CaptureColor.inkSoft)
            Spacer(minLength: 12)
            content()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 15)
    }

    private var divider: some View {
        Rectangle().fill(CaptureColor.line).frame(height: 1).padding(.leading, 16)
    }

    private func valueLabel(_ text: String) -> some View {
        HStack(spacing: 4) {
            Text(text).font(CaptureType.body).foregroundStyle(CaptureColor.ink)
            Image(systemName: "chevron.down").font(.caption2).foregroundStyle(CaptureColor.inkSoft)
        }
    }
}

#if DEBUG
import CaptureKitMocks

#Preview {
    // swiftlint:disable:next force_try
    let store = try! CaptureStore.inMemory()
    let s = store.newDraft()
    s.title = "Oak console"
    s.status = .queued
    let s2 = store.newDraft()
    s2.title = "Brass lamp"
    s2.status = .ready

    return NavigationStack {
        AccountScreen(
            session: MockSessionProviding(),
            store: store,
            sync: InMemoryCaptureSyncService(),
            analytics: MockCaptureAnalytics(),
            coordinator: CaptureCoordinator()
        )
    }
}
#endif
