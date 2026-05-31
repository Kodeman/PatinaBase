//
//  DailyGreetingHeader.swift
//  Patina
//

import SwiftUI

struct DailyGreetingHeader: View {
    let dateString: String
    let monogram: String
    /// Tap handler for the `?` help affordance. When non-nil, a small
    /// SF-Symbol question-mark button is rendered to the left of the
    /// monogram avatar; tapping it opens the contextual help panel for
    /// the Home surface (`SurfaceKeys.IOSApp.Home.root`). When nil (the
    /// default — preserves source compatibility with existing previews
    /// and tests) the affordance is omitted entirely.
    var onHelpTap: (() -> Void)? = nil
    /// PT-0-6: tap handler for the profile monogram avatar. When non-nil
    /// the avatar becomes a `Button` that the parent wires to
    /// `coordinator.navigate(to: .profile)`. Nil keeps the avatar a
    /// static decoration (preview/source compatibility).
    var onMonogramTap: (() -> Void)? = nil
    /// PT-3-7: tap handler for the bell (notifications) glyph. When non-nil
    /// a bell button is rendered next to the help glyph with an unread-count
    /// badge; tapping routes to `coordinator.navigate(to: .notifications)`.
    var onBellTap: (() -> Void)? = nil
    /// PT-3-7: unread-notification count rendered as a badge over the bell.
    /// 0 hides the badge.
    var unreadCount: Int = 0
    /// PT-4-10: dual-role mode chip. When non-nil a mono chip
    /// ("DESIGNER" / "CONSUMER") renders left of the help glyph; tapping it
    /// flips the saved home preference and re-routes `mainHomeView`.
    var roleChip: RoleChip? = nil

    /// PT-4-10: the dual-role mode-switch chip descriptor. `label` is the
    /// mono text shown; `onTap` performs the switch + analytics.
    struct RoleChip {
        let label: String
        let onTap: () -> Void
    }

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(dateString)
                    .font(PatinaTypography.monoTiny)
                    .tracking(0.5)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.agedOak)
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("Your Daily Room")
                        .font(.custom("PlayfairDisplay-Regular", size: 21))
                        .foregroundStyle(PatinaColors.charcoal)
                        .lineSpacing(0)
                    // Contextual help: explains what the "Daily Room" feed
                    // is — a curated mix of one editorial story and a stream
                    // of room-aware product recommendations refreshed daily.
                    HelpInfoIcon(
                        surfaceKey: SurfaceKeys.IOSApp.Home.dailyGreeting,
                        fallback: "Your Daily Room is a fresh, room-aware feed of one editorial story and curated product picks — updated every day.",
                        size: 13
                    )
                }
            }
            // First-launch tour anchor — Step 1 popover attaches to the title
            // row of the greeting header. Wrapping the inner VStack rather
            // than the whole HStack so the popover arrow lands on the title.
            .firstLaunchTourAnchor(.homeGreeting)
            Spacer()
            HStack(spacing: 4) {
                // PT-4-10: dual-role mode-switch chip.
                if let roleChip {
                    Button(action: roleChip.onTap) {
                        MonoLabel(text: roleChip.label, size: PatinaTypography.monoSmall, color: PatinaColors.mocha, tracking: 1.5)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(
                                Capsule().fill(PatinaColors.softCream)
                            )
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Switch home mode")
                    .accessibilityHint("Switches between your designer and consumer home.")
                    .accessibilityIdentifier("DailyRoomView.RoleChip")
                }
                // PT-3-7: bell (notifications) glyph with unread-count badge.
                if let onBellTap {
                    Button(action: onBellTap) {
                        Image(systemName: "bell")
                            .font(.system(size: 17, weight: .regular))
                            .foregroundStyle(PatinaColors.mocha)
                            .frame(width: 36, height: 36)
                            .overlay(alignment: .topTrailing) {
                                UnreadBadge(count: unreadCount)
                                    .offset(x: -4, y: 4)
                            }
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Notifications")
                    .accessibilityValue(unreadCount > 0 ? "\(unreadCount) unread" : "No unread notifications")
                    .accessibilityHint("Opens your notifications.")
                    .accessibilityIdentifier("DailyRoomView.BellButton")
                }
                // Optional `?` help-panel trigger. The parent screen owns the
                // sheet state and binds via the closure so this view stays a
                // pure presentation component.
                if let onHelpTap {
                    Button(action: onHelpTap) {
                        Image(systemName: "questionmark.circle")
                            .font(.system(size: 17, weight: .regular))
                            .foregroundStyle(PatinaColors.mocha)
                            .frame(width: 36, height: 36)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Help")
                    .accessibilityHint("Opens the help panel for this screen.")
                    .accessibilityIdentifier("DailyRoomView.HelpButton")
                }
            }
            monogramAvatar
                // First-launch tour anchor — Step 3 popover attaches to the
                // profile monogram avatar, now the live Profile entry point.
                .firstLaunchTourAnchor(.profileMonogram)
        }
        .padding(.top, 56)
        .padding(.horizontal, 20)
    }

    /// PT-0-6: the profile monogram. A `Button` when `onMonogramTap` is set,
    /// otherwise a static circle (previews / tests).
    @ViewBuilder
    private var monogramAvatar: some View {
        let circle = ZStack {
            Circle()
                .fill(PatinaGradients.earth)
                .frame(width: 36, height: 36)
            Text(monogram)
                .font(.custom("PlayfairDisplay-Medium", size: 14))
                .foregroundStyle(PatinaColors.offWhite)
        }
        if let onMonogramTap {
            Button(action: onMonogramTap) {
                circle.contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Profile")
            .accessibilityHint("Opens your profile and account settings.")
            .accessibilityIdentifier("DailyRoomView.ProfileButton")
        } else {
            circle
        }
    }
}

/// PT-3-7: small unread-count badge rendered over the bell glyph. Renders
/// nothing when `count <= 0`. Caps the displayed value at "9+".
private struct UnreadBadge: View {
    let count: Int

    var body: some View {
        if count > 0 {
            Text(count > 9 ? "9+" : "\(count)")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(PatinaColors.offWhite)
                .padding(.horizontal, 4)
                .frame(minWidth: 14, minHeight: 14)
                .background(Capsule().fill(PatinaColors.clay))
                .accessibilityHidden(true)
        }
    }
}

#Preview {
    VStack {
        DailyGreetingHeader(dateString: "WEDNESDAY · APR 7", monogram: "K")
        DailyGreetingHeader(
            dateString: "WEDNESDAY · APR 7",
            monogram: "K",
            onHelpTap: {},
            onMonogramTap: {},
            onBellTap: {},
            unreadCount: 3,
            roleChip: .init(label: "DESIGNER", onTap: {})
        )
    }
    .background(PatinaColors.offWhite)
}
