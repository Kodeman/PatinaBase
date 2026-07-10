//  PortalLoginScanSheet.swift
//  Capture
//
//  O2's third sign-in method — "Scan from the portal". A signed-in Patina portal
//  shows a QR (`field://login?v=1&th=<token_hash>`); this sheet reads it and hands
//  the parsed `PortalLoginToken` back so O2 can run the exchange behind the same
//  `WorkspaceAuthorizing` seam as Apple / email.
//
//  Reuses the app's existing VisionKit host (`DataScannerView`, same target) — a
//  recognised code that parses as a login token is forwarded; anything else shows
//  a soft inline hint and can be retried. VisionKit's live scanner is unavailable
//  on the Simulator, so a paste fallback (and a DEBUG "Use sample") keeps the
//  approval path drivable there and gives the shots harness a placeholder state.

import SwiftUI
import CaptureKit

struct PortalLoginScanSheet: View {
    /// A code parsed as a portal-login token. The host (O2) runs the exchange.
    var onToken: (PortalLoginToken) -> Void
    /// Dismiss without signing in.
    var onCancel: () -> Void

    @State private var manualPayload = ""
    @State private var errorMessage: String?
    @State private var lastPayload: String?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        NavigationStack {
            ZStack {
                CaptureColor.ink.ignoresSafeArea()

                if DataScannerView.isAvailable {
                    DataScannerView { payload, _ in submit(payload) }
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
            .navigationTitle("Scan from the portal")
            .navigationBarTitleDisplayMode(.inline)
            // The camera surface stays deliberately dark — pin light so the
            // dynamic tokens keep their designed values under system dark mode.
            .environment(\.colorScheme, .light)
            .accessibilityIdentifier("o2.portalScanSheet")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { onCancel() }
                        .foregroundStyle(CaptureColor.paper)
                }
            }
        }
    }

    // MARK: - Intake

    private func submit(_ payload: String) {
        guard payload != lastPayload else { return }
        lastPayload = payload
        do {
            let token = try PortalLoginToken.parse(payload: payload)
            errorMessage = nil
            CaptureHaptics.selection()
            onToken(token)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription
                ?? "That code isn’t a Patina sign-in link."
            // Allow the same code to be retried once the hint clears.
            Task { [payload] in
                try? await Task.sleep(for: .seconds(2.5))
                if lastPayload == payload {
                    errorMessage = nil
                    lastPayload = nil
                }
            }
        }
    }

    private func submitManual() {
        let trimmed = manualPayload.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        submit(trimmed)
    }

    // MARK: - Live scan chrome

    private var viewfinderFrame: some View {
        RoundedRectangle(cornerRadius: 28)
            .stroke(CaptureColor.verdigris, lineWidth: 3)
            .frame(width: 240, height: 240)
            .accessibilityHidden(true)
    }

    private var captionCard: some View {
        VStack(spacing: 10) {
            Text("Point at the sign-in code shown in the portal")
                .font(CaptureType.callout)
                .foregroundStyle(CaptureColor.paper)
                .multilineTextAlignment(.center)
            if let errorMessage {
                Text(errorMessage)
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.error)
                    .multilineTextAlignment(.center)
                    .transition(reduceMotion ? .identity : .opacity)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .background(Capsule().fill(CaptureColor.ink.opacity(0.72)))
        .padding(.horizontal, 28)
        .animation(reduceMotion ? nil : .default, value: errorMessage)
    }

    // MARK: - Simulator fallback

    private var simulatorFallback: some View {
        ScrollView {
            VStack(spacing: 18) {
                Image(systemName: "qrcode.viewfinder")
                    .font(CaptureType.display)
                    .foregroundStyle(CaptureColor.goldenHour)
                    .accessibilityHidden(true)

                Text("Scanner needs a real device")
                    .font(CaptureType.title2)
                    .foregroundStyle(CaptureColor.paper)

                Text("VisionKit's live scanner isn't available in Simulator. Paste a portal sign-in code to test the exchange.")
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.paper.opacity(0.7))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                VStack(alignment: .leading, spacing: 8) {
                    Text("Sign-in code")
                        .font(CaptureType.eyebrow)
                        .textCase(.uppercase)
                        .foregroundStyle(CaptureColor.paper.opacity(0.6))
                    TextField("field://login?v=1&th=…", text: $manualPayload)
                        .font(CaptureType.monoSmall)
                        .foregroundStyle(CaptureColor.ink)
                        .padding(10)
                        .background(CaptureColor.paper3, in: RoundedRectangle(cornerRadius: 10))
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .accessibilityLabel("Sign-in code")
                        .accessibilityIdentifier("o2.portalScanField")
                }
                .padding(.horizontal, 28)

                if let errorMessage {
                    Text(errorMessage)
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.error)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 28)
                }

                HStack(spacing: 12) {
                    #if DEBUG
                    Button {
                        manualPayload = PortalLoginToken(tokenHash: "sample-token-hash").urlString()
                        submitManual()
                    } label: {
                        Text("Use sample")
                            .font(CaptureType.bodyEmph)
                            .foregroundStyle(CaptureColor.paper)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(CaptureColor.paper.opacity(0.35), lineWidth: 1))
                    }
                    .accessibilityIdentifier("o2.portalScanSample")
                    #endif

                    Button {
                        submitManual()
                    } label: {
                        Text("Continue")
                            .font(CaptureType.bodyEmph)
                            .foregroundStyle(CaptureColor.paper3)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(CaptureColor.verdigris, in: RoundedRectangle(cornerRadius: 12))
                    }
                    .disabled(manualPayload.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                .padding(.horizontal, 28)
            }
            .padding(.vertical, 40)
            .frame(maxWidth: .infinity)
        }
    }
}

#if DEBUG
#Preview("Portal scan sheet") {
    PortalLoginScanSheet(onToken: { _ in }, onCancel: {})
}
#endif
