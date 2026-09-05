//
//  DailyGreetingHeader.swift
//  Patina
//

import SwiftUI

/// The labelled `Studio` control that replaced the bare monogram (B §2; the
/// graft synthesis §5 takes from Direction A). Named so its copy is a fact a
/// test can hold rather than a string buried in a view.
///
/// `P-24` / **R5**: the control no longer carries a count. The clay capsule
/// beside the word, and the "N waiting" VoiceOver value that spoke the same
/// number, were the app's in-product attention badge — a numeric count chip,
/// which VISION §6 refuses. The springboard (home-screen) badge is kept as the
/// permitted re-engagement instrument, and inside the app the NEEDS YOU eyebrow
/// on the Record is what carries the truth, in rows a client can act on rather
/// than a number she can only feel.
enum StudioControlLabel {
    /// The canonical surface name in full, for VoiceOver (C4 / B-7).
    static let voiceOverName = "Your Studio"
    static let title = "Studio"
}

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
    /// R-02 (note O7 / task C-L1B-4): `false` until a notifications fetch has
    /// answered. A count of zero that nobody fetched is not "none", and
    /// VoiceOver was being told it was.
    var unreadCountIsKnown: Bool = true
    /// Whether this header draws the Studio pill at all.
    ///
    /// B-1 makes the pill the fallback door "if the flag never flips", and M1
    /// draws this header as date over greeting and a belled dot — no monogram,
    /// one Studio door. On the house-first root the bar carries that door, so
    /// `DailyRoomView` passes `false` and the pill (with the tour anchor it
    /// hosts, which moves to the bar with it) does not draw.
    var showsStudioControl: Bool = true

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    /// C-06 / GAP1B-03. The greeting shares one horizontal band with the bell,
    /// the help glyph and the Studio pill, so its width is whatever the
    /// cluster leaves — about 150 pt. At XXXL the serif h4 broke inside words
    /// ("Good / afternoo / n."), at AX-XXXL into six fragments, while the
    /// Studio chip truncated to "Stu…". Above
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
                        anchoredStudioControl
                        Spacer(minLength: 0)
                    }
                }
            } else {
                HStack(alignment: .top) {
                    titleColumn
                    Spacer()
                    controlCluster
                    anchoredStudioControl
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

    /// The Studio pill and its tour anchor, in ONE place.
    ///
    /// Both layout branches draw it, and
    /// `FirstLaunchTourTests.everyDefaultStepAnchorHasExactlyOneProductionMountPerRoot`
    /// requires exactly one mount of `.profileMonogram` in this file — two
    /// branches each carrying the modifier would be two popovers for one step.
    @ViewBuilder
    private var anchoredStudioControl: some View {
        if showsStudioControl {
            studioControl
                // First-launch tour anchor — Step 3 popover attaches to the
                // same slot the monogram held; the control there is now
                // labelled. The anchor travels with the
                // control: on the house-first root the door is the bar's Studio
                // tab and the anchor is mounted there instead.
                .firstLaunchTourAnchor(.profileMonogram)
        }
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
                .accessibilityValue(
                    unreadCount > 0
                        ? "\(unreadCount) unread"
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

    /// The Studio control: the surface's name, where a bare initial used to
    /// sit. A monogram said who you are; this says where the door goes
    /// (B §2, synthesis §5). `P-24` / R5 took the count off it.
    @ViewBuilder
    private var studioControl: some View {
        let control = Text(StudioControlLabel.title)
            .font(PatinaTypography.uiSmall)
            .foregroundStyle(PatinaColors.Text.primary)
            .lineLimit(1)
            .padding(.horizontal, PatinaSpacing.xsm)
            .frame(minHeight: 44)
            .background(Capsule().fill(PatinaColors.Background.secondary))

        if let onStudioTap {
            Button(action: onStudioTap) {
                control.contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(StudioControlLabel.voiceOverName)
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
                .background(Capsule().fill(PatinaColors.clayInk))
                // The bell glyph is a fixed 17 pt inside a 36 pt frame, so an
                // uncapped badge outgrows the control it marks: at
                // accessibility-XXXL the "3" was a ~40 pt disc with the bell
                // nowhere on screen behind it (shots/w1-l1c/05-today-ax3xl-light.png).
                // A first cap at `xxxLarge` was still a ~24 pt disc occluding
                // most of a 17 pt glyph — a clay circle with one sliver of bell
                // outline (shots/w1-review-l1c/10b-bell-badge-crop.png). A badge
                // is a mark ON a control, not body copy: it scales to the top of
                // the standard ramp's usable band for a 17 pt glyph and stops.
                // Its count is announced by the button's accessibilityValue, so
                // nothing is lost by not growing it.
                .dynamicTypeSize(...DynamicTypeSize.large)
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
            onStudioTap: {},
            onBellTap: {},
            unreadCount: 3
        )
    }
    .background(PatinaColors.Background.primary)
}
