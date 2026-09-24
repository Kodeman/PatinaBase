//
//  DailyGreetingHeader.swift
//  Patina
//

import SwiftUI

struct DailyGreetingHeader: View {
    let dateString: String
    /// `TimeOfDay.current.greeting` — the complete token set the app has
    /// carried unused. The surface is still named "Today" (C4); the greeting
    /// is what it says, not what it is called.
    let greeting: String
    /// Tap handler for the `?` help affordance. When non-nil, a small
    /// SF-Symbol question-mark button is rendered to the left of the
    /// monogram avatar; tapping it opens the contextual help panel for
    /// the Home surface (`SurfaceKeys.IOSApp.Home.root`). When nil (the
    /// default — preserves source compatibility with existing previews
    /// and tests) the affordance is omitted entirely.
    var onHelpTap: (() -> Void)? = nil
    /// PT-3-7: tap handler for the bell (notifications) glyph. When non-nil
    /// a bell button is rendered next to the help glyph with an unread-count
    /// badge; tapping routes to `coordinator.navigate(to: .notifications)`.
    var onBellTap: (() -> Void)? = nil
    /// PT-3-7: unread-notification count rendered as a badge over the bell.
    /// 0 hides the badge.
    var unreadCount: Int = 0
    /// R-02 (note O7 / task C-L1B-4): `false` until a notifications fetch has
    /// answered. A count of zero that nobody fetched is not "none", and
    /// VoiceOver was being told it was.
    var unreadCountIsKnown: Bool = true

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    /// C-06 / GAP1B-03. The greeting shares one horizontal band with the
    /// control cluster, so its width is whatever the cluster leaves. At XXXL
    /// the serif h4 broke inside words ("Good / afternoo / n."), at AX-XXXL
    /// into six fragments. Above
    /// `.accessibility1` the band splits: the greeting takes the full content
    /// width and the cluster gets its own row underneath.
    static func stacksControls(at size: DynamicTypeSize) -> Bool {
        size.isAccessibilitySize
    }

    var body: some View {
        Group {
            if Self.stacksControls(at: dynamicTypeSize) {
                VStack(alignment: .leading, spacing: 12) {
                    titleColumn
                    HStack(spacing: 4) {
                        controlCluster
                        Spacer(minLength: 0)
                    }
                }
            } else {
                HStack(alignment: .top) {
                    titleColumn
                    Spacer()
                    controlCluster
                }
            }
        }
        .padding(.top, 56)
        .padding(.horizontal, PatinaSpacing.mdLarge)
        // First-launch tour, step 1. B-10's cut-out never appeared on step 1:
        // steps 2 and 3 punched their subject out of the scrim exactly (walk B
        // re-walk pixel-probed the record card and the Studio tab) while the
        // greeting stayed dimmed at rgb (172,170,167). Both working anchors are
        // applied to a laid-out block AFTER its padding — `HouseRecordCard` in
        // `DailyRoomView`, the Studio control on the bar — and this one was
        // applied to `titleColumn`, an inner VStack inside a `Group`'s
        // conditional branch. It moves here, to the same shape the two that
        // work use, and the block the bubble is about ("This is Today") is the
        // whole header band rather than two of its three lines.
        .firstLaunchTourAnchor(.homeGreeting)
    }

    private var titleColumn: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(dateString)
                .font(PatinaTypography.monoLabel)
                .tracking(0.5)
                .textCase(.uppercase)
                .foregroundStyle(PatinaColors.Text.muted)
                // "TUESDA / Y · / SEP 1" — one line, scaled, never split.
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .allowsTightening(true)
                // C4's canonical name for the surface rides HERE, on the line
                // that carries the least meaning of its own, rather than on the
                // container — see the `.contain` note below.
                .accessibilityLabel("Today. \(dateString)")
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(greeting)
                    .font(PatinaTypography.h4)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .lineSpacing(0)
                    .minimumScaleFactor(0.7)
                    .allowsTightening(true)
                    .fixedSize(horizontal: false, vertical: true)
                // Contextual help: explains what the "Daily Room" feed
                // is — a curated mix of one editorial story and a stream
                // of room-aware product recommendations refreshed daily.
                HelpInfoIcon(
                    surfaceKey: SurfaceKeys.IOSApp.Home.dailyGreeting,
                    fallback: "Today keeps Patina focused: one useful next move, one editorial story, and one active room.",
                    size: 13,
                    accessibilityLabel: "About Today"
                )
            }
        }
        // C-18 / W1-B-05: `.contain` groups the column and leaves its children
        // reachable — until a label is put on the container, at which point
        // VoiceOver reads the container and stops. `describe_screen(nested:)`
        // measured it: `AXGroup "Today"` with `children: []`, swallowing the
        // "About Today" help door, while the identical component on Spaces was
        // a reachable `AXButton "About Your Spaces"`. The surface still keeps
        // its canonical name (C4) — the date line above carries it.
        .accessibilityElement(children: .contain)
    }

    private var controlCluster: some View {
        HStack(spacing: 4) {
            // PT-3-7: bell (notifications) glyph, marked when something is
            // unread. `P-24` / R5 took the number off the mark.
            if let onBellTap {
                Button(action: onBellTap) {
                    Image(systemName: "bell")
                        .font(.system(size: 17, weight: .regular))
                        .foregroundStyle(PatinaColors.Text.secondary)
                        .frame(width: 36, height: 36)
                        .overlay(alignment: .topTrailing) {
                            UnreadMark(isUnread: unreadCount > 0)
                                .offset(x: -6, y: 6)
                        }
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Notifications")
                .accessibilityValue(
                    unreadCount > 0
                        ? "Unread notifications"
                        : (unreadCountIsKnown ? "No unread notifications" : "")
                )
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
    }
}

/// PT-3-7, as `P-24` / **R5** leaves it: the bell says *something* is unread,
/// and does not say how many. Renders nothing when nothing is unread.
///
/// It used to be a clay capsule printing the count, capped at "9+" — the last
/// in-product numeric badge in the app after the Studio pill's went. R5 keeps
/// the springboard badge and retires every one inside the app, so what remains
/// here is the mark without the number: a fixed 8 pt dot, which is also the end
/// of the Dynamic Type problem the count had. At accessibility-XXXL the "3" was
/// a ~40 pt disc with the bell nowhere on screen behind it
/// (shots/w1-l1c/05-today-ax3xl-light.png), and a cap at `xxxLarge` was still a
/// ~24 pt disc over a 17 pt glyph (shots/w1-review-l1c/10b-bell-badge-crop.png).
/// A dot carries no text, so it never grows into the control it marks. The
/// state is announced in words by the button's own accessibilityValue.
private struct UnreadMark: View {
    let isUnread: Bool

    var body: some View {
        if isUnread {
            Circle()
                .fill(PatinaColors.clayInk)
                .frame(width: 8, height: 8)
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
            onHelpTap: {},
            onBellTap: {},
            unreadCount: 3
        )
    }
    .background(PatinaColors.Background.primary)
}
