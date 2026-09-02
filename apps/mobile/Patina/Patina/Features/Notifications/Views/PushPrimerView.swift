//
//  PushPrimerView.swift
//  Patina
//
//  SP-08 / ruling Q7 — the permission is earned.
//
//  Authorization used to be requested exactly once per install, silently,
//  immediately after a design-request submission — unrelated to money, with
//  no screen of copy in front of it. Q7 moves the ask to the first event a
//  client would actually want to hear about, preceded by one sentence, ruled
//  verbatim. The ask is MOVED, not deleted: it keeps the same once-per-install
//  gate, so an install that was already prompted is never prompted again.
//
//  Which events fire a push is a direction question (C26) settled elsewhere;
//  this screen only makes the ask explained and asked in the right room.
//

import SwiftUI

struct PushPrimerView: View {

    /// Ruling Q7, verbatim. Do not reword: it is the promise the app makes in
    /// exchange for the permission, and it names exactly three things.
    static let sentence = "We'll tell you when your designer sends something that needs you — a decision, a proposal, or an invoice. Nothing else."

    static let title = "Before we interrupt you"

    let onDecided: () -> Void

    /// Set when the ask came back `.denied` — here or in a session before this
    /// one. The screen then says so and offers Settings instead of dismissing
    /// as though something had happened (`C2-09`).
    @State private var isDenied = false
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: PatinaSpacing.lg) {
            Spacer(minLength: 0)

            Image(systemName: "bell")
                .font(.system(size: 34))
                .foregroundStyle(PatinaColors.Text.interactive)
                .accessibilityHidden(true)

            Text(Self.title)
                .font(PatinaTypography.h3)
                .foregroundStyle(PatinaColors.Text.primary)

            Text(Self.sentence)
                .font(PatinaTypography.body)
                .foregroundStyle(PatinaColors.Text.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if isDenied {
                Text(PushTokenService.deniedLine)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("PushPrimerView.DeniedLine")
            }

            Spacer(minLength: 0)

            VStack(spacing: PatinaSpacing.sm) {
                if isDenied {
                    PatinaButton("Open Settings", style: .primary) {
                        if let url = PushTokenService.settingsURL { openURL(url) }
                        onDecided()
                    }
                    .accessibilityIdentifier("PushPrimerView.OpenSettings")
                } else {
                    PatinaButton("Turn on notifications", style: .primary) {
                        Task {
                            let outcome = await PushTokenService.shared.requestAuthorizationAndRegister()
                            // A silent no-op was the bug. When the system will
                            // never show its alert again, the screen stays and
                            // says why, with the only door that still works.
                            if outcome == .denied {
                                isDenied = true
                                return
                            }
                            onDecided()
                        }
                    }
                    .accessibilityIdentifier("PushPrimerView.Allow")
                }

                Button("Not now") { onDecided() }
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .contentShape(Rectangle())
                    .accessibilityIdentifier("PushPrimerView.NotNow")
            }
        }
        .padding(.horizontal, PatinaSpacing.lg)
        .padding(.vertical, PatinaSpacing.xxl)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(PatinaColors.Background.primary)
    }
}

/// When the primer is allowed to appear. Pure, so the rule is testable without
/// touching `UNUserNotificationCenter` — which would surface a real system
/// dialog and hang the run.
enum PushPrimerTrigger {

    /// The three client-facing kinds 00534 writes. Until those rows exist on
    /// the local stack, the same predicate fires on the first client-facing
    /// proposal / invoice / decision row the feed reads by any route — which
    /// includes the Studio-composed fallback, so the primer arrives with the
    /// first money moment either way.
    static func hasMoneyMoment(in rows: [AppNotification]) -> Bool {
        rows.contains { row in
            switch row.type {
            case .proposal, .invoice, .decision: return true
            default: return false
            }
        }
    }

    /// True at most once per install, and only when something money-shaped is
    /// actually waiting. Does NOT arm the gate — the caller arms it as it
    /// presents, so a decision the person never saw cannot burn the one ask.
    @MainActor
    static func shouldPresent(rows: [AppNotification]) -> Bool {
        guard AuthService.shared.isAuthenticated else { return false }
        guard !PushTokenService.shared.hasAskedForAuthorization else { return false }
        return hasMoneyMoment(in: rows)
    }
}
