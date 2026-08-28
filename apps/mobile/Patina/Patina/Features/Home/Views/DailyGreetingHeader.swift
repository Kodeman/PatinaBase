//
//  DailyGreetingHeader.swift
//  Patina
//

import SwiftUI

/// The labelled `Studio` control that replaced the bare monogram (B §2; the
/// graft synthesis §5 takes from Direction A). Named so its copy is a fact a
/// test can hold rather than a string buried in a view.
enum StudioControlLabel {
    /// The canonical surface name in full, for VoiceOver (C4 / B-7).
    static let voiceOverName = "Your Studio"
    static let title = "Studio"

    /// What the control says is waiting. Nil at zero — a control that prints
    /// "0 waiting" is a chore counter, and this one counts nothing at anybody.
    static func waitingValue(count: Int) -> String? {
        guard count > 0 else { return nil }
        return count == 1 ? "1 waiting" : "\(count) waiting"
    }
}

struct DailyGreetingHeader: View {
    let dateString: String
    /// `TimeOfDay.current.greeting` — the complete token set the app has
    /// carried unused. The surface is still named "Today" (C4); the greeting
    /// is what it says, not what it is called.
    let greeting: String
    /// SP-16's one attention count, printed beside the Studio label.
    var attentionCount: Int = 0
    /// Tap handler for the `?` help affordance. When non-nil, a small
    /// SF-Symbol question-mark button is rendered to the left of the
    /// monogram avatar; tapping it opens the contextual help panel for
    /// the Home surface (`SurfaceKeys.IOSApp.Home.root`). When nil (the
    /// default — preserves source compatibility with existing previews
    /// and tests) the affordance is omitted entirely.
    var onHelpTap: (() -> Void)? = nil
    /// Tap handler for the Studio control. When non-nil the control becomes a
    /// `Button` the parent wires to `coordinator.navigate(to: .profile)`.
    var onStudioTap: (() -> Void)? = nil
    /// PT-3-7: tap handler for the bell (notifications) glyph. When non-nil
    /// a bell button is rendered next to the help glyph with an unread-count
    /// badge; tapping routes to `coordinator.navigate(to: .notifications)`.
    var onBellTap: (() -> Void)? = nil
    /// PT-3-7: unread-notification count rendered as a badge over the bell.
    /// 0 hides the badge.
    var unreadCount: Int = 0

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(dateString)
                    .font(PatinaTypography.monoLabel)
                    .tracking(0.5)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.Text.muted)
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(greeting)
                        .font(PatinaTypography.h4)
                        .foregroundStyle(PatinaColors.Text.primary)
                        .lineSpacing(0)
                        .fixedSize(horizontal: false, vertical: true)
                    // Contextual help: explains what the "Daily Room" feed
                    // is — a curated mix of one editorial story and a stream
                    // of room-aware product recommendations refreshed daily.
                    HelpInfoIcon(
                        surfaceKey: SurfaceKeys.IOSApp.Home.dailyGreeting,
                        fallback: "Today keeps Patina focused: one useful next move, one editorial story, and one active room.",
                        size: 13
                    )
                }
            }
            // First-launch tour anchor — Step 1 popover attaches to the title
            // row of the greeting header. Wrapping the inner VStack rather
            // than the whole HStack so the popover arrow lands on the title.
            .firstLaunchTourAnchor(.homeGreeting)
            // The surface keeps its canonical name for VoiceOver even though
            // the greeting is what the screen prints (C4).
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Today")
            Spacer()
            HStack(spacing: 4) {
                // PT-3-7: bell (notifications) glyph with unread-count badge.
                if let onBellTap {
                    Button(action: onBellTap) {
                        Image(systemName: "bell")
                            .font(.system(size: 17, weight: .regular))
                            .foregroundStyle(PatinaColors.Text.secondary)
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
                            .foregroundStyle(PatinaColors.Text.secondary)
                            .frame(width: 36, height: 36)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Help")
                    .accessibilityHint("Opens the help panel for this screen.")
                    .accessibilityIdentifier("DailyRoomView.HelpButton")
                }
            }
            studioControl
                // First-launch tour anchor — Step 3 popover attaches to the
                // same slot the monogram held; the control there is now
                // labelled, and carries the count.
                .firstLaunchTourAnchor(.profileMonogram)
        }
        .padding(.top, 56)
        .padding(.horizontal, PatinaSpacing.mdLarge)
    }

    /// The Studio control: the surface's name and the one attention count,
    /// where a bare initial used to sit. A monogram said who you are; this
    /// says what is waiting (B §2, synthesis §5).
    @ViewBuilder
    private var studioControl: some View {
        let control = HStack(spacing: 6) {
            Text(StudioControlLabel.title)
                .font(PatinaTypography.uiSmall)
                .foregroundStyle(PatinaColors.Text.primary)
                .lineLimit(1)
            if attentionCount > 0 {
                Text("\(attentionCount)")
                    .font(PatinaTypography.monoMedium)
                    .foregroundStyle(PatinaColors.offWhite)
                    .padding(.horizontal, PatinaSpacing.xs)
                    .frame(minWidth: 18, minHeight: 18)
                    .background(Capsule().fill(PatinaColors.clayDeep))
            }
        }
        .padding(.horizontal, PatinaSpacing.xsm)
        .frame(minHeight: 44)
        .background(Capsule().fill(PatinaColors.Background.secondary))

        if let onStudioTap {
            Button(action: onStudioTap) {
                control.contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(StudioControlLabel.voiceOverName)
            .accessibilityValue(StudioControlLabel.waitingValue(count: attentionCount) ?? "")
            .accessibilityHint("Opens your studio.")
            .accessibilityIdentifier("DailyRoomView.StudioButton")
        } else {
            control
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
                .font(PatinaTypography.captionSmall)
                .foregroundStyle(PatinaColors.offWhite)
                .padding(.horizontal, PatinaSpacing.xs)
                .frame(minWidth: 14, minHeight: 14)
                .background(Capsule().fill(PatinaColors.clay))
                .accessibilityHidden(true)
        }
    }
}

#Preview {
    VStack {
        DailyGreetingHeader(dateString: "WEDNESDAY · APR 7", greeting: "Good morning.")
        DailyGreetingHeader(
            dateString: "WEDNESDAY · APR 7",
            greeting: "Good evening.",
            attentionCount: 4,
            onHelpTap: {},
            onStudioTap: {},
            onBellTap: {},
            unreadCount: 3
        )
    }
    .background(PatinaColors.Background.primary)
}
