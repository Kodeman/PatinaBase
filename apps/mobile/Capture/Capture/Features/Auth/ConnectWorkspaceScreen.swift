//  ConnectWorkspaceScreen.swift
//  Capture
//
//  O2 · Connect & pick workspace (screen.O2.connect). Signs the designer in and
//  binds the device to a workspace. Two native credential paths — Sign in with
//  Apple and an email one-time-code — sit behind the `WorkspaceAuthorizing` seam
//  (Strata enables only the `apple` and `email` providers). After auth, a
//  multi-workspace user picks a default destination and a Face ID offer secures
//  later launches.

import SwiftUI
import AuthenticationServices
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

/// O2's sign-in seam. Two native flows (no browser redirect): Sign in with Apple
/// (the view runs the official button and hands us `idToken` + the raw nonce) and
/// email one-time-code (`sendEmailCode` then `verifyEmailCode`). Each returns the
/// workspaces the user can save into. The real impl is `SupabaseWorkspaceAuthorizer`;
/// CP0 / the harness / previews ship `StubWorkspaceAuthorizer`.
@MainActor
protocol WorkspaceAuthorizing: AnyObject {
    /// Sign in with Apple. `idToken` / `rawNonce` come from the native
    /// `ASAuthorizationAppleIDCredential` the official button produces.
    func authorizeWithApple(idToken: String, rawNonce: String) async throws -> [OnboardingWorkspace]
    /// Email one-time-code, step 1: mail a 6-digit code (no account creation).
    func sendEmailCode(to email: String) async throws
    /// Email one-time-code, step 2: verify the code; returns workspaces on success.
    func verifyEmailCode(email: String, code: String) async throws -> [OnboardingWorkspace]
    /// Portal QR sign-in: exchange a GoTrue magic-link hashed token (`th`, scanned
    /// from a signed-in portal's QR / arrived via `field://login`) for a session.
    /// Returns the workspaces the user can save into, exactly like the other two.
    func authorizeWithPortalToken(tokenHash: String) async throws -> [OnboardingWorkspace]
}

/// Deferred-backend stand-in: sleeps briefly, then returns its workspace list
/// (or throws, to exercise the inline-retry / code-error paths). The email flow
/// is the harness's drivable happy path; the Apple sheet can't complete on the
/// Simulator without an Apple ID.
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

    func authorizeWithApple(idToken: String, rawNonce: String) async throws -> [OnboardingWorkspace] {
        try? await Task.sleep(for: delay)
        if shouldFail { throw OnboardingAuthError.failed }
        return workspaces
    }

    func sendEmailCode(to email: String) async throws {
        try? await Task.sleep(for: delay)
        if shouldFail { throw OnboardingAuthError.failed }
    }

    func verifyEmailCode(email: String, code: String) async throws -> [OnboardingWorkspace] {
        try? await Task.sleep(for: delay)
        if shouldFail { throw OnboardingAuthError.failed }
        return workspaces
    }

    func authorizeWithPortalToken(tokenHash: String) async throws -> [OnboardingWorkspace] {
        try? await Task.sleep(for: delay)
        if shouldFail { throw OnboardingAuthError.failed }
        return workspaces
    }
}

// MARK: - Screen

struct ConnectWorkspaceScreen: View {
    /// Screen-level stage. The email sub-flow's own step (email vs. code) lives in
    /// `emailFlow`; this only picks which surface is on screen.
    private enum Stage: Equatable { case methods, email, authorizing, chooseWorkspace, empty, failed }

    let authorizer: WorkspaceAuthorizing
    /// Auth succeeded → continue to camera priming (O3) with the chosen
    /// workspace + whether the designer opted into Face ID.
    var onConnected: (_ workspace: OnboardingWorkspace, _ enableFaceID: Bool) -> Void
    /// Escape hatch from the "no workspace" dead end: sign out and restart
    /// onboarding so the designer can try another account. No-op for previews.
    var onSignOut: () -> Void

    @State private var stage: Stage = .methods
    @State private var emailFlow = EmailOTPMachine()
    @State private var appleNonce: SignInNonce?
    @State private var workspaces: [OnboardingWorkspace]
    @State private var selected: OnboardingWorkspace?
    @State private var enableFaceID = true
    /// Presents the "Scan from the portal" camera sheet (the third method).
    @State private var showingPortalScan = false
    @Environment(\.colorScheme) private var colorScheme
    @FocusState private var fieldFocused: Bool

    init(authorizer: WorkspaceAuthorizing,
         workspaces: [OnboardingWorkspace] = OnboardingWorkspace.demo,
         onConnected: @escaping (_ workspace: OnboardingWorkspace, _ enableFaceID: Bool) -> Void = { _, _ in },
         onSignOut: @escaping () -> Void = {}) {
        self.authorizer = authorizer
        self.onConnected = onConnected
        self.onSignOut = onSignOut
        _workspaces = State(initialValue: workspaces)
        _selected = State(initialValue: workspaces.first)
    }

    var body: some View {
        OnboardingScaffold {
            VStack(spacing: 0) {
                header
                Spacer(minLength: 24)
                stageContent
                Spacer(minLength: 24)
            }
            .padding(.horizontal, 28)
            .padding(.top, 32)
            .padding(.bottom, 24)
        }
        .accessibilityIdentifier(CaptureScreenID.o2Connect.rawValue)
        .sheet(isPresented: $showingPortalScan) {
            PortalLoginScanSheet(
                onToken: { token in
                    showingPortalScan = false
                    Task { await authorizePortalToken(token) }
                },
                onCancel: { showingPortalScan = false }
            )
        }
    }

    // MARK: Header

    private var header: some View {
        VStack(spacing: 18) {
            OnboardingGlyph(symbol: "square.on.square", tint: CaptureColor.ink2)
            VStack(spacing: 10) {
                Text(headerTitle)
                    .font(CaptureType.title)
                    .foregroundStyle(CaptureColor.ink)
                    .multilineTextAlignment(.center)
                Text(headerSubtitle)
                    .font(CaptureType.body)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(.top, 28)
    }

    private var headerTitle: String {
        switch stage {
        case .chooseWorkspace, .empty: return "Connect your workspace"
        default:                       return "Sign in to Patina Field"
        }
    }

    private var headerSubtitle: String {
        switch stage {
        case .chooseWorkspace: return "Choose where captures save. Switch any time."
        case .empty:           return "This account isn’t part of a studio yet."
        default:               return "Sync captures to your studio’s Patina library."
        }
    }

    // MARK: Stage router

    @ViewBuilder private var stageContent: some View {
        switch stage {
        case .methods:         methodsView
        case .email:           emailView
        case .authorizing:     authorizingView
        case .chooseWorkspace: chooseWorkspaceView
        case .empty:           emptyView
        case .failed:          failedView
        }
    }

    // MARK: Methods (Apple + email)

    private var methodsView: some View {
        VStack(spacing: 14) {
            SignInWithAppleButton(.signIn) { request in
                let nonce = SignInNonce.make()
                appleNonce = nonce
                request.requestedScopes = [.fullName, .email]
                request.nonce = nonce.hashed
            } onCompletion: { result in
                handleAppleCompletion(result)
            }
            .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
            .frame(maxWidth: .infinity, minHeight: 52)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .accessibilityIdentifier("o2.appleButton")

            Button("Continue with email") {
                emailFlow = EmailOTPMachine()
                stage = .email
                fieldFocused = true
            }
            .buttonStyle(OnboardingGhostButtonStyle())
            .accessibilityIdentifier("o2.emailButton")

            Button {
                showingPortalScan = true
            } label: {
                Label("Scan from the portal", systemImage: "qrcode.viewfinder")
            }
            .buttonStyle(OnboardingGhostButtonStyle())
            .accessibilityIdentifier("o2.portalScanButton")
        }
    }

    // MARK: Email one-time-code

    @ViewBuilder private var emailView: some View {
        if emailFlow.step == .email { emailEntryView } else { codeEntryView }
    }

    private var emailEntryView: some View {
        VStack(spacing: 12) {
            fieldContainer(label: "EMAIL") {
                TextField("you@studio.com", text: Binding(
                    get: { emailFlow.email }, set: { emailFlow.setEmail($0) }))
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($fieldFocused)
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.ink)
                    .accessibilityIdentifier("o2.emailField")
            }
            errorLabel(emailFlow.errorMessage)
            Button { Task { await sendCode() } } label: {
                buttonLabel("Send code", busy: emailFlow.status == .working)
            }
            .buttonStyle(OnboardingFilledButtonStyle(enabled: emailFlow.canSend))
            .disabled(!emailFlow.canSend)
            .accessibilityIdentifier("o2.sendCodeButton")
            Button("Back") { stage = .methods }
                .buttonStyle(OnboardingGhostButtonStyle())
        }
    }

    private var codeEntryView: some View {
        VStack(spacing: 12) {
            Text("Enter the 6-digit code we sent to \(emailFlow.email).")
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.inkSoft)
                .multilineTextAlignment(.center)
            fieldContainer(label: "CODE") {
                TextField("123456", text: Binding(
                    get: { emailFlow.code }, set: { emailFlow.setCode($0) }))
                    .textContentType(.oneTimeCode)
                    .keyboardType(.numberPad)
                    .focused($fieldFocused)
                    .font(CaptureType.title2.monospacedDigit())
                    .foregroundStyle(CaptureColor.ink)
                    .accessibilityIdentifier("o2.codeField")
            }
            errorLabel(emailFlow.errorMessage)
            Button { Task { await verifyCode() } } label: {
                buttonLabel("Verify", busy: emailFlow.status == .working)
            }
            .buttonStyle(OnboardingFilledButtonStyle(enabled: emailFlow.canVerify))
            .disabled(!emailFlow.canVerify)
            .accessibilityIdentifier("o2.verifyButton")
            Button("Use a different email") { emailFlow.backToEmail(); fieldFocused = true }
                .buttonStyle(OnboardingGhostButtonStyle())
        }
    }

    // MARK: Authorizing (Apple sheet resolved, hydrating)

    private var authorizingView: some View {
        VStack(spacing: 14) {
            ProgressView().tint(CaptureColor.verdigris)
            Text("Signing you in…")
                .font(CaptureType.body)
                .foregroundStyle(CaptureColor.inkSoft)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: Choose workspace (+ Face ID)

    private var chooseWorkspaceView: some View {
        VStack(alignment: .leading, spacing: 12) {
            workspaceCard
            Text("Choose where captures save. Switch any time.")
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.inkSoft)
                .padding(.horizontal, 4)
            faceIDToggle
            Button { commitWorkspace() } label: { Text("Continue") }
                .buttonStyle(OnboardingFilledButtonStyle(enabled: selected != nil))
                .disabled(selected == nil)
                .accessibilityIdentifier("o2.continueButton")
                .padding(.top, 4)
        }
    }

    private var emptyView: some View {
        VStack(spacing: 12) {
            Label("No workspace found for your account — ask your studio admin.",
                  systemImage: "person.crop.circle.badge.exclamationmark")
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.error)
                .multilineTextAlignment(.center)
            Button("Sign in with a different account") {
                onSignOut()
                resetToMethods()
            }
            .buttonStyle(OnboardingGhostButtonStyle())
        }
    }

    private var failedView: some View {
        VStack(spacing: 12) {
            Label("Couldn’t sign in. Please try again.", systemImage: "exclamationmark.triangle.fill")
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.error)
                .multilineTextAlignment(.center)
            Button("Try again") { resetToMethods() }
                .buttonStyle(OnboardingFilledButtonStyle())
        }
    }

    // MARK: Shared field / button chrome

    private func fieldContainer<Content: View>(label: String,
                                               @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(CaptureType.eyebrow)
                .foregroundStyle(CaptureColor.inkSoft)
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(CaptureColor.paper3))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(CaptureColor.line, lineWidth: 1))
    }

    private func buttonLabel(_ title: String, busy: Bool) -> some View {
        HStack(spacing: 8) {
            if busy { ProgressView().tint(CaptureColor.paper3) }
            Text(title)
        }
    }

    @ViewBuilder private func errorLabel(_ message: String?) -> some View {
        if let message {
            Text(message)
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.error)
                .multilineTextAlignment(.center)
        }
    }

    // MARK: Workspace picker + Face ID

    @ViewBuilder private var workspaceCard: some View {
        if workspaces.count > 1 {
            Menu {
                ForEach(workspaces) { ws in
                    Button { selected = ws } label: {
                        if ws == selected { Label(ws.name, systemImage: "checkmark") } else { Text(ws.name) }
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

    // MARK: Actions — Apple

    private func handleAppleCompletion(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let idToken = String(data: tokenData, encoding: .utf8),
                  let rawNonce = appleNonce?.raw else {
                stage = .failed
                return
            }
            Task { await authorizeApple(idToken: idToken, rawNonce: rawNonce) }
        case .failure(let error):
            // Cancel is a normal choice, not an error — return to the methods
            // quietly. Anything else surfaces the retry state.
            if (error as? ASAuthorizationError)?.code == .canceled {
                stage = .methods
            } else {
                stage = .failed
            }
        }
    }

    private func authorizeApple(idToken: String, rawNonce: String) async {
        stage = .authorizing
        do {
            let result = try await authorizer.authorizeWithApple(idToken: idToken, rawNonce: rawNonce)
            handleAuthorized(result)
        } catch {
            stage = .failed
        }
    }

    // MARK: Actions — portal QR token

    /// A code scanned from the signed-in portal parsed as a `PortalLoginToken`;
    /// exchange it for a session through the same seam as Apple / email, then
    /// branch on the returned workspaces.
    private func authorizePortalToken(_ token: PortalLoginToken) async {
        stage = .authorizing
        do {
            let result = try await authorizer.authorizeWithPortalToken(tokenHash: token.tokenHash)
            handleAuthorized(result)
        } catch {
            stage = .failed
        }
    }

    // MARK: Actions — email one-time-code

    private func sendCode() async {
        guard emailFlow.canSend else { return }
        emailFlow.beginSend()
        do {
            try await authorizer.sendEmailCode(to: EmailAddress.normalize(emailFlow.email))
            emailFlow.codeSent()
            fieldFocused = true
        } catch {
            emailFlow.fail("Couldn’t send a code to that email. Check the address and try again.")
        }
    }

    private func verifyCode() async {
        guard emailFlow.canVerify else { return }
        emailFlow.beginVerify()
        do {
            let result = try await authorizer.verifyEmailCode(
                email: EmailAddress.normalize(emailFlow.email), code: emailFlow.code)
            handleAuthorized(result)
        } catch {
            emailFlow.fail("That code didn’t match. Request a new one and try again.")
        }
    }

    // MARK: Post-auth branching

    /// Branch honestly on what the account actually has — never persisting or
    /// proceeding on a workspace the user didn't choose.
    private func handleAuthorized(_ result: [OnboardingWorkspace]) {
        workspaces = result
        switch result.count {
        case 0:
            selected = nil
            stage = .empty
        case 1:
            selected = result[0]
            stage = .chooseWorkspace
        default:
            // Force an explicit pick before persisting a default (Continue gated).
            selected = nil
            stage = .chooseWorkspace
        }
    }

    private func commitWorkspace() {
        guard let chosen = selected else { return }
        stage = .methods
        onConnected(chosen, enableFaceID)
    }

    private func resetToMethods() {
        emailFlow = EmailOTPMachine()
        appleNonce = nil
        selected = workspaces.first
        stage = .methods
    }
}

#Preview("Sign in") {
    ConnectWorkspaceScreen(authorizer: StubWorkspaceAuthorizer())
}

#Preview("Auth failure") {
    ConnectWorkspaceScreen(authorizer: StubWorkspaceAuthorizer(shouldFail: true))
}
