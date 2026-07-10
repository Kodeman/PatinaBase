//  QRApproveScreen.swift
//  Capture · Wave Q (QR portal-login approval)
//
//  Q2 — the `.qrApprove(payload:)` sheet. Re-parses the raw payload Q1 handed
//  through (cheap, deterministic, no network) to show the request summary,
//  then gates Approve behind Face ID via `PortalAuthApprovalService.approve`.
//  On success: brief "Signed in on the web" state, then dismiss the sheet AND
//  pop Q1 off the stack — "dismiss all the way back" per the flow brief, so
//  the designer isn't left staring at the scanner again. Reject/Close only
//  dismiss the sheet (Q1's live scanner stays up in case of a mis-scan).
//
//  Hosted by the registrar inside its own `NavigationStack` (see
//  QRApproveScreens.swift) — this view must NOT add a second one.

import SwiftUI
import CaptureKit
#if DEBUG
import CaptureKitMocks
#endif

@Observable
@MainActor
final class QRApproveModel {
    enum Phase: Equatable {
        case ready
        case approving
        case approved
        case expired
        case error(String)
    }

    private let portalAuth: any PortalAuthApprovalService
    private let analytics: any CaptureAnalytics
    private let coordinator: CaptureCoordinator

    private(set) var request: FieldPortalAuthRequest?
    var phase: Phase = .ready
    private(set) var secondsRemaining: Int = 0

    @ObservationIgnored private var countdownTask: Task<Void, Never>?

    init(payload: String,
         portalAuth: any PortalAuthApprovalService,
         analytics: any CaptureAnalytics,
         coordinator: CaptureCoordinator) {
        self.portalAuth = portalAuth
        self.analytics = analytics
        self.coordinator = coordinator

        do {
            let parsed = try portalAuth.parse(qrPayload: payload)
            request = parsed
            if parsed.isExpired {
                phase = .expired
            } else {
                secondsRemaining = Self.remaining(until: parsed.expiresAt)
                startCountdown()
            }
        } catch {
            // A real-service parse throws `.expired` outright for an already-past
            // code; the mock instead returns a request with `isExpired == true`
            // (handled above). Fold both into the same dedicated expired state.
            if let authError = error as? FieldPortalAuthError, authError == .expired {
                phase = .expired
            } else {
                phase = .error(Self.message(for: error))
            }
        }
    }

    deinit { countdownTask?.cancel() }

    var isExpiryWarning: Bool { secondsRemaining <= 30 && secondsRemaining > 0 }

    var countdownLabel: String {
        String(format: "%d:%02d", secondsRemaining / 60, secondsRemaining % 60)
    }

    // MARK: - Actions

    func approve() async {
        guard let request else { return }
        guard !request.isExpired else { phase = .expired; return }
        countdownTask?.cancel() // don't let a stray tick flip to .expired mid-flight
        phase = .approving
        analytics.event("Q2.approve-tapped")
        do {
            try await portalAuth.approve(request)
            phase = .approved
            analytics.event("Q2.approve-success")
            CaptureHaptics.success()
            try? await Task.sleep(for: .seconds(1.6))
            dismissAllTheWayBack()
        } catch {
            if let authError = error as? FieldPortalAuthError, authError == .expired {
                countdownTask?.cancel()
                phase = .expired
            } else {
                phase = .error(Self.message(for: error))
            }
            analytics.event("Q2.approve-error")
        }
    }

    /// No confirmation round-trip: the portal has no deny endpoint (see the
    /// real service's `reject(_:)` doc comment) — this only ever affects local
    /// state, so we dismiss immediately rather than making the designer wait.
    func reject() {
        if let request {
            Task { try? await self.portalAuth.reject(request) }
        }
        analytics.event("Q2.reject")
        coordinator.dismissSheet()
    }

    func retry() {
        guard let request else { return }
        if request.isExpired {
            phase = .expired
        } else {
            phase = .ready
            secondsRemaining = Self.remaining(until: request.expiresAt)
            startCountdown()
        }
    }

    /// Expired-state / parse-failure Close — sheet only, scanner stays live.
    func close() {
        coordinator.dismissSheet()
    }

    func stop() {
        countdownTask?.cancel()
    }

    // MARK: - Countdown

    private func startCountdown() {
        countdownTask?.cancel()
        countdownTask = Task { [weak self] in
            while let self, !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                guard !Task.isCancelled else { return }
                self.tick()
            }
        }
    }

    private func tick() {
        guard let request, phase == .ready else { return }
        secondsRemaining = Self.remaining(until: request.expiresAt)
        if secondsRemaining <= 0 {
            phase = .expired
            countdownTask?.cancel()
        }
    }

    private func dismissAllTheWayBack() {
        coordinator.dismissSheet()
        coordinator.goBack()
    }

    private static func remaining(until date: Date) -> Int {
        max(0, Int(date.timeIntervalSinceNow))
    }

    private static func message(for error: Error) -> String {
        (error as? LocalizedError)?.errorDescription ?? "Something went wrong confirming this sign-in."
    }
}

struct QRApproveScreen: View {
    let analytics: any CaptureAnalytics

    @State private var model: QRApproveModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(payload: String,
         portalAuth: any PortalAuthApprovalService,
         analytics: any CaptureAnalytics,
         coordinator: CaptureCoordinator) {
        self.analytics = analytics
        _model = State(wrappedValue: QRApproveModel(
            payload: payload, portalAuth: portalAuth, analytics: analytics, coordinator: coordinator
        ))
    }

    var body: some View {
        ZStack {
            CaptureColor.paper.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 22) {
                    header

                    if let request = model.request {
                        summaryCard(request)
                        if model.phase == .ready || model.phase == .approving {
                            if model.isExpiryWarning { expiryWarning }
                            biometricNotice
                        }
                    }
                    if case let .error(message) = model.phase {
                        errorBanner(message)
                    }
                    if model.phase == .expired {
                        expiredNotice
                    }

                    Spacer(minLength: 8)
                    actionButtons
                }
                .padding(20)
            }

            if model.phase == .approved { successOverlay }
        }
        .navigationTitle("Sign-in request")
        .navigationBarTitleDisplayMode(.inline)
        .interactiveDismissDisabled(model.phase == .approving)
        .accessibilityIdentifier(CaptureScreenID.q2QRApprove.rawValue)
        .onAppear { analytics.screen(CaptureScreenID.q2QRApprove.rawValue) }
        .onDisappear { model.stop() }
    }

    // MARK: - Header / summary

    private var header: some View {
        VStack(spacing: 6) {
            Text("Sign-in request")
                .font(CaptureType.title)
                .foregroundStyle(CaptureColor.ink)
            Text("Confirm this is you before the browser session starts")
                .font(CaptureType.callout)
                .foregroundStyle(CaptureColor.inkSoft)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 8)
    }

    private func summaryCard(_ request: FieldPortalAuthRequest) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 14) {
                Image(systemName: "laptopcomputer")
                    .font(CaptureType.title)
                    .foregroundStyle(CaptureColor.inkSoft)
                Image(systemName: "arrow.left.arrow.right")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.line2)
                Image(systemName: "iphone")
                    .font(CaptureType.title)
                    .foregroundStyle(CaptureColor.verdigris)
            }
            .frame(maxWidth: .infinity)
            .accessibilityHidden(true)

            summaryRow(icon: "globe", text: request.portalHost)
            if let browserLabel = request.browserLabel {
                summaryRow(icon: "network", text: browserLabel)
            }
            summaryRow(
                icon: "clock",
                text: model.phase == .expired ? "Expired" : "Expires in \(model.countdownLabel)",
                tint: model.phase == .expired || model.isExpiryWarning ? CaptureColor.warning : CaptureColor.ink
            )
        }
        .padding(18)
        .background(RoundedRectangle(cornerRadius: 16).fill(CaptureColor.paper3))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(CaptureColor.line, lineWidth: 1))
    }

    private func summaryRow(icon: String, text: String, tint: Color = CaptureColor.ink) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .foregroundStyle(CaptureColor.inkSoft)
                .frame(width: 20)
            Text(text)
                .font(CaptureType.body)
                .foregroundStyle(tint)
            Spacer(minLength: 0)
        }
    }

    private var expiryWarning: some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(CaptureColor.warning)
            Text("This request expires soon").font(CaptureType.footnote).foregroundStyle(CaptureColor.warning)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 10).fill(CaptureColor.warning.opacity(0.12)))
    }

    private var expiredNotice: some View {
        VStack(spacing: 8) {
            Image(systemName: "clock.badge.exclamationmark")
                .font(CaptureType.title)
                .foregroundStyle(CaptureColor.error)
            Text("This sign-in request has expired")
                .font(CaptureType.bodyEmph)
                .foregroundStyle(CaptureColor.ink)
            Text("Go back to your computer and refresh the code, then scan again.")
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.inkSoft)
                .multilineTextAlignment(.center)
        }
        .padding(18)
    }

    private var biometricNotice: some View {
        HStack(spacing: 8) {
            Image(systemName: "faceid").foregroundStyle(CaptureColor.inkSoft)
            Text("Face ID confirms it's you before this approves the browser.")
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.inkSoft)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(CaptureColor.error)
            Text(message).font(CaptureType.footnote).foregroundStyle(CaptureColor.error)
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 12).fill(CaptureColor.error.opacity(0.12)))
    }

    // MARK: - Actions

    @ViewBuilder
    private var actionButtons: some View {
        switch model.phase {
        case .approved:
            EmptyView()

        case .expired:
            secondaryFillButton("Close", action: model.close)

        case .error:
            VStack(spacing: 12) {
                if model.request != nil {
                    primaryButton("Try again", systemImage: "arrow.clockwise", action: model.retry)
                    rejectButton
                } else {
                    secondaryFillButton("Close", action: model.close)
                }
            }

        case .ready, .approving:
            VStack(spacing: 12) {
                approveButton
                rejectButton
            }
        }
    }

    private var approveButton: some View {
        Group {
            if model.phase == .approving {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: CaptureColor.verdigris))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .accessibilityLabel("Approving")
            } else {
                Button {
                    Task { await model.approve() }
                } label: {
                    Label("Approve sign-in", systemImage: "faceid")
                        .font(CaptureType.bodyEmph)
                        .foregroundStyle(CaptureColor.paper3)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(CaptureColor.verdigris, in: RoundedRectangle(cornerRadius: 12))
                }
                .disabled(model.request == nil)
                .accessibilityHint("Confirms with Face ID, then signs in the browser session.")
            }
        }
    }

    private var rejectButton: some View {
        Button(role: .destructive) { model.reject() } label: {
            Text("Reject")
                .font(CaptureType.bodyEmph)
                .foregroundStyle(CaptureColor.error)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
        }
        .disabled(model.phase == .approving)
    }

    private func primaryButton(_ title: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(CaptureType.bodyEmph)
                .foregroundStyle(CaptureColor.paper3)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(CaptureColor.verdigris, in: RoundedRectangle(cornerRadius: 12))
        }
    }

    private func secondaryFillButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(CaptureType.bodyEmph)
                .foregroundStyle(CaptureColor.paper3)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(CaptureColor.inkSoft, in: RoundedRectangle(cornerRadius: 12))
        }
    }

    // MARK: - Success overlay

    private var successOverlay: some View {
        ZStack {
            CaptureColor.ink.opacity(0.78).ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(CaptureColor.success)
                Text("Signed in on the web")
                    .font(CaptureType.title)
                    .foregroundStyle(CaptureColor.paper)
                Text("You can close this and return to your computer.")
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.paper.opacity(0.8))
                    .multilineTextAlignment(.center)
            }
            .padding(32)
        }
        .transition(reduceMotion ? .identity : .opacity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Signed in on the web")
    }
}

#if DEBUG
#Preview("Q2 · Approve") {
    NavigationStack {
        QRApproveScreen(
            payload: WorkFixtures.qrPayload,
            portalAuth: MockPortalAuthApprovalService(),
            analytics: MockCaptureAnalytics(),
            coordinator: CaptureCoordinator()
        )
    }
}

#Preview("Q2 · Expired") {
    NavigationStack {
        QRApproveScreen(
            payload: "patina://auth?session=a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90&exp=1",
            portalAuth: MockPortalAuthApprovalService(),
            analytics: MockCaptureAnalytics(),
            coordinator: CaptureCoordinator()
        )
    }
}
#endif
