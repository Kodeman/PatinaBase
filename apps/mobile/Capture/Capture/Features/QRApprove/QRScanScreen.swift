//  QRScanScreen.swift
//  Capture · Wave Q (QR portal-login approval)
//
//  Q1 — live scan for the designer-portal sign-in handshake. Reuses the app's
//  existing VisionKit host (`DataScannerView`, Capture/Features/Recognition/
//  Code/ — same target, read-only) instead of standing up a second camera
//  session. A recognised code that parses as a portal request (any other
//  barcode/QR just fails to parse and shows a soft inline hint) pushes Q2
//  (`.qrApprove(payload:)`) for review + biometric approval. No torch toggle:
//  `DataScannerView`'s frozen initializer has no torch hook, and duplicating
//  a second scanner host solely for that isn't "cheap" — see task report.

import SwiftUI
import CaptureKit
#if DEBUG
import CaptureKitMocks
#endif

@Observable
@MainActor
final class QRScanModel {
    private let portalAuth: any PortalAuthApprovalService
    private let analytics: any CaptureAnalytics
    private let coordinator: CaptureCoordinator

    var manualPayload: String = ""
    var errorMessage: String?

    private var lastPayload: String?
    private var clearErrorTask: Task<Void, Never>?

    init(portalAuth: any PortalAuthApprovalService, analytics: any CaptureAnalytics, coordinator: CaptureCoordinator) {
        self.portalAuth = portalAuth
        self.analytics = analytics
        self.coordinator = coordinator
    }

    /// Called by the live `DataScannerView` for every newly-recognised code.
    func handleScanned(_ payload: String) {
        submit(payload)
    }

    /// Simulator fallback: manual "paste payload" entry (DataScanner is
    /// unavailable on the simulator — VisionKit compiles there but
    /// `.isSupported`/`.isAvailable` are false).
    func submitManual() {
        let trimmed = manualPayload.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        submit(trimmed)
    }

    private func submit(_ payload: String) {
        guard payload != lastPayload else { return }
        lastPayload = payload

        do {
            _ = try portalAuth.parse(qrPayload: payload)
            errorMessage = nil
            CaptureHaptics.selection()
            analytics.event("Q1.detected")
            coordinator.present(.qrApprove(payload: payload))
        } catch {
            analytics.event("Q1.parse-failed")
            errorMessage = (error as? LocalizedError)?.errorDescription
                ?? "That code doesn't look like a Patina sign-in request."
            // Let the same code be retried once the hint clears (a different
            // code is never blocked — only exact-duplicate payloads are).
            clearErrorTask?.cancel()
            clearErrorTask = Task { [weak self] in
                try? await Task.sleep(for: .seconds(2.5))
                guard let self, !Task.isCancelled else { return }
                self.errorMessage = nil
                self.lastPayload = nil
            }
        }
    }

    func stop() {
        clearErrorTask?.cancel()
    }
}

struct QRScanScreen: View {
    let analytics: any CaptureAnalytics

    @State private var model: QRScanModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(portalAuth: any PortalAuthApprovalService, analytics: any CaptureAnalytics, coordinator: CaptureCoordinator) {
        self.analytics = analytics
        _model = State(wrappedValue: QRScanModel(portalAuth: portalAuth, analytics: analytics, coordinator: coordinator))
    }

    var body: some View {
        ZStack {
            CaptureColor.ink.ignoresSafeArea()

            if DataScannerView.isAvailable {
                DataScannerView { payload, _ in model.handleScanned(payload) }
                    .ignoresSafeArea()

                viewfinderFrame

                VStack {
                    Spacer()
                    captionCard
                        .padding(.bottom, 28)
                }
            } else {
                simulatorFallback
            }
        }
        .navigationTitle("Scan to sign in")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier(CaptureScreenID.q1QRScan.rawValue)
        .task { analytics.screen(CaptureScreenID.q1QRScan.rawValue) }
        .onDisappear { model.stop() }
    }

    // MARK: - Live scan chrome

    private var viewfinderFrame: some View {
        RoundedRectangle(cornerRadius: 28)
            .stroke(CaptureColor.verdigris2, lineWidth: 3)
            .frame(width: 240, height: 240)
            .accessibilityHidden(true)
    }

    private var captionCard: some View {
        VStack(spacing: 10) {
            Text("Point at the sign-in code on your screen")
                .font(CaptureType.callout)
                .foregroundStyle(CaptureColor.paper)
                .multilineTextAlignment(.center)

            if let errorMessage = model.errorMessage {
                Text(errorMessage)
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.rust2)
                    .multilineTextAlignment(.center)
                    .transition(reduceMotion ? .identity : .opacity)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .background(Capsule().fill(CaptureColor.ink.opacity(0.72)))
        .padding(.horizontal, 28)
        .animation(reduceMotion ? nil : .default, value: model.errorMessage)
    }

    // MARK: - Simulator fallback

    private var simulatorFallback: some View {
        ScrollView {
            VStack(spacing: 18) {
                Image(systemName: "qrcode.viewfinder")
                    .font(CaptureType.display)
                    .foregroundStyle(CaptureColor.brass)
                    .accessibilityHidden(true)

                Text("Scanner needs a real device")
                    .font(CaptureType.title2)
                    .foregroundStyle(CaptureColor.paper)

                Text("VisionKit's live scanner isn't available in Simulator. Paste a sign-in code to test the approval screen.")
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.paper.opacity(0.7))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                VStack(alignment: .leading, spacing: 8) {
                    Text("Sign-in code")
                        .font(CaptureType.eyebrow)
                        .textCase(.uppercase)
                        .foregroundStyle(CaptureColor.paper.opacity(0.6))
                    TextField("patina://auth?session=…", text: $model.manualPayload)
                        .font(CaptureType.monoSmall)
                        .foregroundStyle(CaptureColor.ink)
                        .padding(10)
                        .background(CaptureColor.paper3, in: RoundedRectangle(cornerRadius: 10))
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .accessibilityLabel("Sign-in code")
                }
                .padding(.horizontal, 28)

                if let errorMessage = model.errorMessage {
                    Text(errorMessage)
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.rust2)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 28)
                }

                HStack(spacing: 12) {
                    #if DEBUG
                    Button {
                        model.manualPayload = WorkFixtures.qrPayload
                        model.submitManual()
                    } label: {
                        Text("Use sample")
                            .font(CaptureType.bodyEmph)
                            .foregroundStyle(CaptureColor.paper)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(CaptureColor.paper.opacity(0.35), lineWidth: 1))
                    }
                    #endif

                    Button {
                        model.submitManual()
                    } label: {
                        Text("Continue")
                            .font(CaptureType.bodyEmph)
                            .foregroundStyle(CaptureColor.paper3)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(CaptureColor.verdigris, in: RoundedRectangle(cornerRadius: 12))
                    }
                    .disabled(model.manualPayload.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                .padding(.horizontal, 28)
            }
            .padding(.vertical, 40)
            .frame(maxWidth: .infinity)
        }
    }
}

#if DEBUG
#Preview("Q1 · Scan") {
    NavigationStack {
        QRScanScreen(
            portalAuth: MockPortalAuthApprovalService(),
            analytics: MockCaptureAnalytics(),
            coordinator: CaptureCoordinator()
        )
    }
}
#endif
