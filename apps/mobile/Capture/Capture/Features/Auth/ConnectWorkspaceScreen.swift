//  ConnectWorkspaceScreen.swift
//  Capture
//
//  O2 · Connect & pick workspace (screen.O2.connect). Authenticates via
//  "Sign in with Patina" and binds the device to a workspace. Multi-workspace
//  users pick a default destination here; a Face ID offer secures later launches.
//
//  Real OAuth (ASWebAuthenticationSession + supabase) is DEFERRED. The button is
//  wired through the small `WorkspaceAuthorizing` seam so the integrator can drop
//  the concrete authorizer in without touching this view.

import SwiftUI
import CaptureKit

// MARK: - Seam

/// A workspace the signed-in user can save captures into (== organizations.id).
struct OnboardingWorkspace: Identifiable, Hashable, Sendable {
    let id: String
    let name: String
}

extension OnboardingWorkspace {
    /// Representative list for previews, the harness, and the stub authorizer.
    static let demo: [OnboardingWorkspace] = [
        .init(id: "walbridge", name: "Walbridge Studio"),
        .init(id: "harlow", name: "Harlow & Co."),
        .init(id: "meridian", name: "Meridian Interiors")
    ]
}

enum OnboardingAuthError: Error { case failed }

/// "Sign in with Patina" seam. The real impl runs OAuth via
/// `ASWebAuthenticationSession`; CP0 ships `StubWorkspaceAuthorizer`.
@MainActor
protocol WorkspaceAuthorizing: AnyObject {
    /// Begins authentication and returns the workspaces the user can save into.
    func authorize() async throws -> [OnboardingWorkspace]
}

/// Deferred-OAuth stand-in: sleeps briefly, then returns its workspace list
/// (or throws, to exercise the inline-retry path).
@MainActor
final class StubWorkspaceAuthorizer: WorkspaceAuthorizing {
    var workspaces: [OnboardingWorkspace]
    var delay: Duration
    var shouldFail: Bool

    init(workspaces: [OnboardingWorkspace] = OnboardingWorkspace.demo,
         delay: Duration = .milliseconds(650),
         shouldFail: Bool = false) {
        self.workspaces = workspaces
        self.delay = delay
        self.shouldFail = shouldFail
    }

    func authorize() async throws -> [OnboardingWorkspace] {
        try? await Task.sleep(for: delay)
        if shouldFail { throw OnboardingAuthError.failed }
        return workspaces
    }
}

// MARK: - Screen

struct ConnectWorkspaceScreen: View {
    private enum Phase: Equatable { case idle, authorizing, failed }

    let authorizer: WorkspaceAuthorizing
    /// Auth succeeded → continue to camera priming (O3) with the chosen
    /// workspace + whether the designer opted into Face ID.
    var onConnected: (_ workspace: OnboardingWorkspace, _ enableFaceID: Bool) -> Void

    @State private var phase: Phase = .idle
    @State private var workspaces: [OnboardingWorkspace]
    @State private var selected: OnboardingWorkspace?
    @State private var enableFaceID = true

    init(authorizer: WorkspaceAuthorizing,
         workspaces: [OnboardingWorkspace] = OnboardingWorkspace.demo,
         onConnected: @escaping (_ workspace: OnboardingWorkspace, _ enableFaceID: Bool) -> Void = { _, _ in }) {
        self.authorizer = authorizer
        self.onConnected = onConnected
        _workspaces = State(initialValue: workspaces)
        _selected = State(initialValue: workspaces.first)
    }

    var body: some View {
        OnboardingScaffold {
            VStack(spacing: 0) {
                VStack(spacing: 18) {
                    OnboardingGlyph(symbol: "square.on.square", tint: CaptureColor.ink2)

                    VStack(spacing: 10) {
                        Text("Connect your workspace")
                            .font(CaptureType.title)
                            .foregroundStyle(CaptureColor.ink)
                            .multilineTextAlignment(.center)

                        Text("Sign in to sync captures to your Patina library.")
                            .font(CaptureType.body)
                            .foregroundStyle(CaptureColor.inkSoft)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(.top, 28)

                Spacer(minLength: 28)

                VStack(alignment: .leading, spacing: 12) {
                    workspaceCard

                    Text("Choose where captures save. Switch any time.")
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.inkSoft)
                        .padding(.horizontal, 4)

                    faceIDToggle
                }

                Spacer(minLength: 28)

                VStack(spacing: 10) {
                    if phase == .failed {
                        Label("Couldn’t connect. Tap to try again.", systemImage: "exclamationmark.triangle.fill")
                            .font(CaptureType.footnote)
                            .foregroundStyle(CaptureColor.rust)
                    }

                    Button(action: { Task { await connect() } }) {
                        HStack(spacing: 8) {
                            if phase == .authorizing {
                                ProgressView().tint(CaptureColor.paper3)
                            }
                            Text(phase == .authorizing ? "Connecting…" : "Continue with Patina")
                        }
                    }
                    .buttonStyle(OnboardingFilledButtonStyle(enabled: phase != .authorizing))
                    .disabled(phase == .authorizing)
                }
            }
            .padding(.horizontal, 28)
            .padding(.top, 32)
            .padding(.bottom, 24)
        }
        .accessibilityIdentifier(CaptureScreenID.o2Connect.rawValue)
    }

    // MARK: Workspace picker

    @ViewBuilder private var workspaceCard: some View {
        // Single-workspace accounts skip the picker — show a static row.
        if workspaces.count > 1 {
            Menu {
                ForEach(workspaces) { ws in
                    Button { selected = ws } label: {
                        if ws == selected {
                            Label(ws.name, systemImage: "checkmark")
                        } else {
                            Text(ws.name)
                        }
                    }
                }
            } label: {
                workspaceRow(showChevron: true)
            }
        } else {
            workspaceRow(showChevron: false)
        }
    }

    private func workspaceRow(showChevron: Bool) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text("WORKSPACE")
                    .font(CaptureType.eyebrow)
                    .foregroundStyle(CaptureColor.inkSoft)
                Text(selected?.name ?? "Choose a workspace")
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.ink)
            }
            Spacer()
            if showChevron {
                Image(systemName: "chevron.up.chevron.down")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(CaptureColor.paper3))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(CaptureColor.line, lineWidth: 1))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Workspace, \(selected?.name ?? "none chosen")")
    }

    private var faceIDToggle: some View {
        Toggle(isOn: $enableFaceID) {
            HStack(spacing: 12) {
                Image(systemName: "faceid")
                    .font(CaptureType.title2)
                    .foregroundStyle(CaptureColor.verdigris)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Unlock with Face ID")
                        .font(CaptureType.bodyEmph)
                        .foregroundStyle(CaptureColor.ink)
                    Text("Secure the app on later launches")
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.inkSoft)
                }
            }
        }
        .tint(CaptureColor.verdigris)
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(CaptureColor.paper3))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(CaptureColor.line, lineWidth: 1))
    }

    // MARK: Auth

    @MainActor
    private func connect() async {
        phase = .authorizing
        do {
            let result = try await authorizer.authorize()
            if !result.isEmpty {
                workspaces = result
                let stillValid = selected.map { result.contains($0) } ?? false
                if !stillValid { selected = result.first }
            }
            let chosen = selected ?? result.first ?? OnboardingWorkspace(id: "default", name: "Patina")
            phase = .idle
            onConnected(chosen, enableFaceID)
        } catch {
            phase = .failed
        }
    }
}

#Preview("Connect") {
    ConnectWorkspaceScreen(authorizer: StubWorkspaceAuthorizer())
}

#Preview("Auth failure") {
    ConnectWorkspaceScreen(authorizer: StubWorkspaceAuthorizer(shouldFail: true))
}
