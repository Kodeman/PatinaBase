//
//  CompanionHearthView.swift
//  Patina
//
//  One shell for the Companion's collapsed, progress, and expanded states.
//

import SwiftUI

// C-06 split `expandedHeader` into a stacked and a compact arm and gave the
// panel a ceiling, which carries this file past the 500-line rule. The same
// scoped disable, for the same reason, that `DailyRoomView` and `SettingsView`
// already carry: the split into separate files belongs to W2's hygiene pass,
// not to a Dynamic Type fix that merges first into every other lane.
// swiftlint:disable file_length

/// The panel's own inset. Applied to the column rather than around it, so
/// that when the column scrolls the inset scrolls with it — see
/// `expandedColumn`. File scope: a generic type may not hold a static stored
/// property.
private let companionPanelPadding: CGFloat = 20

/// The tallest the expanded panel may draw at an accessibility text size, above
/// the bottom safe area and the Hearth's own lift. Everything past it scrolls.
/// File scope for the same reason as the padding above: a generic type may not
/// hold a static stored property.
private let companionAccessibilityPanelCeiling: CGFloat = 620

public struct CompanionHearthView<ExpandedContent: View>: View {
    public let presentation: CompanionPresentationState

    private let attention: MarkAttention
    private let wakePhase: WakePhase
    private let onPrimaryAction: (() -> Void)?
    private let onHintAction: (() -> Void)?
    private let onHelp: (() -> Void)?
    private let onDismiss: (() -> Void)?
    private let expandedContent: ExpandedContent

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Namespace private var morphNamespace

    public init(
        presentation: CompanionPresentationState,
        attention: MarkAttention = .calm,
        wakePhase: WakePhase = .awake,
        onPrimaryAction: (() -> Void)? = nil,
        onHintAction: (() -> Void)? = nil,
        onHelp: (() -> Void)? = nil,
        onDismiss: (() -> Void)? = nil,
        @ViewBuilder expandedContent: () -> ExpandedContent
    ) {
        self.presentation = presentation
        self.attention = attention
        self.wakePhase = wakePhase
        self.onPrimaryAction = onPrimaryAction
        self.onHintAction = onHintAction
        self.onHelp = onHelp
        self.onDismiss = onDismiss
        self.expandedContent = expandedContent()
    }

    public var body: some View {
        Group {
            switch presentation {
            case let .collapsed(hint):
                collapsedView(hint: hint)
                    .transition(contentTransition)

            case let .progress(progress):
                progressView(progress)
                    .transition(contentTransition)

            case let .expanded(content):
                expandedView(content)
                    .transition(contentTransition)
            }
        }
        .animation(shellAnimation, value: presentation.canonicalState)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("companion.shell")
    }

    private var shellAnimation: Animation {
        reduceMotion
            ? .easeOut(duration: CompanionConstants.reducedMotionCrossfadeDuration)
            : .spring(
                response: CompanionConstants.springResponse,
                dampingFraction: CompanionConstants.springDamping
            )
    }

    private var contentTransition: AnyTransition {
        if reduceMotion {
            return .opacity
        }

        return .opacity.combined(with: .scale(scale: 0.98))
            .animation(
                .easeOut(duration: CompanionConstants.contentFadeDuration)
                    .delay(CompanionConstants.contentFollowDelay)
            )
    }
}

private extension CompanionHearthView {
    func shell<Content: View>(
        cornerRadius: CGFloat,
        @ViewBuilder content: () -> Content
    ) -> some View {
        content()
            .background {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(PatinaColors.Background.dark)
                    // C-01, the panel's half: the fill is 1.93:1 on the dark page.
                    .overlay(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .strokeBorder(PatinaColors.Border.onDark, lineWidth: 1))
                    .companionMorphMatched(
                        id: "companion.shell",
                        namespace: morphNamespace,
                        reduceMotion: reduceMotion
                    )
                    .patinaShadow(PatinaShadows.companion)
            }
    }

    private func mark(surface: CompanionMarkSurface) -> some View {
        CompanionMarkView(
            attention: surface == .disc ? attention : .calm,
            wakePhase: wakePhase,
            surface: surface,
            allowsAmbientMotion: surface == .disc
        )
        .companionMorphMatched(
            id: "companion.mark",
            namespace: morphNamespace,
            reduceMotion: reduceMotion
        )
        .accessibilityHidden(true)
    }

    private func collapsedView(hint: String) -> some View {
        VStack(spacing: 4) {
            Button {
                onPrimaryAction?()
            } label: {
                shell(cornerRadius: CompanionConstants.buttonCornerRadius) {
                    mark(surface: .embedded)
                        .frame(
                            width: CompanionConstants.buttonSize,
                            height: CompanionConstants.buttonSize
                        )
                }
                .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .frame(
                minWidth: CompanionConstants.minimumTouchTarget,
                minHeight: CompanionConstants.minimumTouchTarget
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(presentation.accessibilityLabel)
            .accessibilityValue(hint)
            .accessibilityHint("Opens the Companion.")
            .accessibilityIdentifier("companion.bubble")

            // At accessibility text sizes the visual hint stops being subtle
            // and can obscure the surface below the floating Hearth. The same
            // context remains available as the Companion button's announced
            // accessibility value and inside the expanded panel.
            if !dynamicTypeSize.isAccessibilitySize, !hint.isEmpty {
                if let onHintAction {
                    Button(action: onHintAction) {
                        hintLabel(hint)
                    }
                    .buttonStyle(.plain)
                    .frame(minHeight: CompanionConstants.minimumTouchTarget)
                    .contentShape(Rectangle())
                    .accessibilityLabel(hint)
                    .accessibilityHint("Activates this suggested next step.")
                    .accessibilityIdentifier("companion.hint")
                } else {
                    hintLabel(hint)
                        .accessibilityHidden(true)
                        .allowsHitTesting(false)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("companion.state.collapsed")
    }

    private func hintLabel(_ hint: String) -> some View {
        Text(hint)
            .font(PatinaTypography.monoSmall)
            .tracking(0.4)
            .textCase(.uppercase)
            .foregroundStyle(PatinaColors.Text.muted)
            .lineLimit(2)
            .multilineTextAlignment(.center)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
    }

    @ViewBuilder
    private func progressView(_ progress: CompanionProgressPresentation) -> some View {
        VStack(spacing: 0) {
            if onPrimaryAction != nil {
                Button {
                    onPrimaryAction?()
                } label: {
                    progressShell(progress)
                }
                .buttonStyle(.plain)
                .accessibilityHint(progress.actionLabel ?? "Continues this activity.")
            } else {
                progressShell(progress)
            }
        }
        .frame(maxWidth: 380)
        .padding(.horizontal, 24)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("companion.state.progress")
    }

    private func progressShell(_ progress: CompanionProgressPresentation) -> some View {
        shell(cornerRadius: dynamicTypeSize.isAccessibilitySize ? 24 : 36) {
            ViewThatFits(in: .horizontal) {
                progressHorizontalContent(progress)
                progressVerticalContent(progress)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
        }
        .contentShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(progress.title)
        .accessibilityValue(progress.accessibilityValue)
        .accessibilityIdentifier("companion.progress")
    }

    private func progressHorizontalContent(_ progress: CompanionProgressPresentation) -> some View {
        HStack(spacing: 12) {
            mark(surface: .embedded)
                .frame(width: 42, height: 42)

            progressText(progress)

            Spacer(minLength: 8)

            progressAccessory(progress)
        }
    }

    private func progressVerticalContent(_ progress: CompanionProgressPresentation) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                mark(surface: .embedded)
                    .frame(width: 42, height: 42)
                progressText(progress)
            }

            HStack {
                progressBar(fraction: progress.fraction)
                progressAccessory(progress)
            }
        }
    }

    private func progressText(_ progress: CompanionProgressPresentation) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(progress.title)
                .font(PatinaTypography.uiSmall)
                .foregroundStyle(PatinaColors.offWhite)
                .lineLimit(dynamicTypeSize.isAccessibilitySize ? 3 : 2)
                .multilineTextAlignment(.leading)

            if let detail = progress.detail, !detail.isEmpty {
                Text(detail)
                    .font(PatinaTypography.monoSmall)
                    .tracking(0.3)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.clay)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? 3 : 2)
                    .multilineTextAlignment(.leading)
            } else if let stepDescription = progress.stepDescription {
                Text(stepDescription)
                    .font(PatinaTypography.monoSmall)
                    .tracking(0.3)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.clay)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    @ViewBuilder
    private func progressAccessory(_ progress: CompanionProgressPresentation) -> some View {
        if let actionLabel = progress.actionLabel {
            Text(actionLabel)
                .font(PatinaTypography.uiSmall)
                .foregroundStyle(PatinaColors.clay)
                .lineLimit(2)
                .multilineTextAlignment(.trailing)
        } else {
            Text("\(progress.percentComplete)%")
                .font(PatinaTypography.bodySmallMedium)
                .monospacedDigit()
                .foregroundStyle(PatinaColors.offWhite)
                .contentTransition(.numericText(value: progress.fraction))
        }
    }

    private func progressBar(fraction: Double) -> some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color.white.opacity(0.15))

                Capsule()
                    .fill(PatinaColors.clay)
                    .frame(width: geometry.size.width * fraction)
            }
        }
        .frame(height: 3)
        .accessibilityHidden(true)
    }

    private func expandedView(_ content: CompanionExpandedPresentation) -> some View {
        VStack(spacing: 0) {
            shell(cornerRadius: presentation.usesFullSheet ? 30 : 26) {
                expandedColumn(content)
                    .frame(
                        maxWidth: .infinity,
                        minHeight: presentation.usesFullSheet ? 360 : 0,
                        // `shell` is a `.background`, so it takes the content's
                        // size, and an unbounded ScrollView takes its column's:
                        // at an accessibility size the rows drew straight out
                        // through the panel's rounded bottom and over the tab
                        // bar, one overlapping the next
                        // (shots/w1-l1c/fx-06-companion-ax3xl-before.png). A
                        // ceiling here is what gives the ScrollView inside
                        // something to scroll within, and it leaves the page
                        // visible above the panel — which is what tells a reader
                        // the panel is a panel.
                        maxHeight: dynamicTypeSize.isAccessibilitySize
                            ? companionAccessibilityPanelCeiling
                            : nil,
                        alignment: .topLeading
                    )
                    // A `.frame(maxHeight:)` bounds LAYOUT, not drawing: the
                    // shell sized to the ceiling above while its rows carried on
                    // painting through the rounded bottom and over the tab bar.
                    .clipShape(
                        RoundedRectangle(
                            cornerRadius: presentation.usesFullSheet ? 30 : 26,
                            style: .continuous
                        )
                    )
            }
            .frame(maxWidth: presentation.usesFullSheet ? .infinity : 380)
            .padding(.horizontal, presentation.usesFullSheet ? 0 : 24)
            .contentShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
            .onTapGesture {}
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("companion.panel")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("companion.state.expanded")
    }

    /// The panel's column: header, optional progress, then the action rows.
    ///
    /// At an accessibility text size the rows are taller than the panel and the
    /// last of them — `Your spaces` and `Your profile` — fell off the bottom
    /// with no way to reach them: on the flag-off root the Companion is the
    /// app's only nav surface, so those destinations became unreachable by
    /// touch (w4 re-walk, item 8's second note).
    ///
    /// Two things had to be true for a scroll to reach them, and round 3's fix
    /// had only the first. Measured on `dr-w5-a11y` (402×874 pt,
    /// `accessibility-extra-extra-large`, `client@patina.dev`):
    ///
    ///  1. **The panel takes the height it is given.** The ScrollView was
    ///     capped at a hardcoded 460 pt: a viewport of 336…796 on an 874 pt
    ///     screen, for a column measuring 1,522 pt — three and a third
    ///     viewports of travel, with ~250 pt of screen sitting unused above the
    ///     panel. 460 was a guess, and it is the right number on no device.
    ///     `ViewThatFits` replaces it with the actual answer: the plain column
    ///     while the column fits (which is every non-accessibility size, and
    ///     the short accessibility panels too), the scrolling one otherwise,
    ///     taking the room the overlay's frame chain already offers.
    ///  2. **The inset scrolls with the rows.** `.padding(20)` used to sit
    ///     around this view, i.e. outside the ScrollView, so the 20 pt strip at
    ///     796…816 was visible panel that did not scroll — the panel's bottom
    ///     edge, where a thumb lands. A drag from y=790 moved the column; the
    ///     same drag from y=800 did nothing, which is why walk 4's four
    ///     attempts (all from y=800 or y=850) reported a list that would not
    ///     move. The inset now belongs to the column and travels with it.
    @ViewBuilder
    private func expandedColumn(_ content: CompanionExpandedPresentation) -> some View {
        let column = VStack(alignment: .leading, spacing: 16) {
            expandedHeader(content)

            if let progress = content.progress {
                expandedProgress(progress)
            }

            expandedContent
        }
        .padding(companionPanelPadding)

        // Above `.accessibility1` the answer is not a guess. `ViewThatFits`
        // picks the scrolling arm only when the proposal it is handed is
        // smaller than the column, and the proposal this view receives is the
        // overlay's frame, not the panel's drawn height — so at
        // accessibility-extra-large the panel clipped its last row
        // ("BASED ON YOUR ROOMS") against its own bottom edge with no scroll at
        // all (shots/w1-review-l1c/11-companion-axxl.png). At those sizes the
        // column cannot fit on any iPhone, so it always scrolls.
        if dynamicTypeSize.isAccessibilitySize {
            ScrollView(.vertical, showsIndicators: true) {
                column
            }
            .scrollBounceBehavior(.basedOnSize)
        } else {
            ViewThatFits(in: .vertical) {
                column

                ScrollView(.vertical, showsIndicators: true) {
                    column
                }
                .scrollBounceBehavior(.basedOnSize)
            }
        }
    }

    /// At an accessibility text size the mark, the text column and up to two
    /// 32 pt buttons leave the title about 230 pt — narrower than the single
    /// word "considered" sets at 41 pt, so the line broke inside it: "A
    /// considere / d next move" on the app's signature voice moment (`C-06`,
    /// `shots/C/36-ax3xl-companion.png`). `minimumScaleFactor` cannot fix this
    /// — with no `lineLimit` SwiftUI wraps rather than shrinks — so the answer
    /// is the same one the Today header takes for `GAP1B-03`: the controls get
    /// their own row and the words get the width.
    @ViewBuilder
    private func expandedHeader(_ content: CompanionExpandedPresentation) -> some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 12) {
                    mark(surface: .embedded)
                        .frame(width: 44, height: 44)
                    Spacer(minLength: 4)
                    headerControls
                }
                headerText(content)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        } else {
            compactHeader(content)
        }
    }

    private func compactHeader(_ content: CompanionExpandedPresentation) -> some View {
        HStack(alignment: .top, spacing: 12) {
            mark(surface: .embedded)
                .frame(width: 44, height: 44)

            headerText(content)

            Spacer(minLength: 4)

            headerControls
        }
    }

    private func headerText(_ content: CompanionExpandedPresentation) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            // C-06 / W1-C-03: the AX branch above already gives the title its
            // own full-width row, and it STILL broke mid-word at
            // accessibility-XXXL — "Want a recommendati / on?" — because
            // `minimumScaleFactor` does nothing while wrapping is unbounded:
            // SwiftUI wraps first, and a single word wider than the line
            // breaks inside itself. A line ceiling is what makes the scale
            // factor engage, so the longest word is shrunk to fit rather than
            // split.
            Text(content.title)
                .font(PatinaTypography.patinaVoice)
                .foregroundStyle(PatinaColors.offWhite)
                .lineLimit(3)
                .minimumScaleFactor(0.5)
                .allowsTightening(true)
                .fixedSize(horizontal: false, vertical: true)

            if let detail = content.detail, !detail.isEmpty {
                Text(detail)
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(PatinaColors.OnDark.secondary)
                    .minimumScaleFactor(0.7)
                    .allowsTightening(true)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    @ViewBuilder
    private var headerControls: some View {
        if onHelp != nil {
            headerButton(
                systemName: "questionmark",
                label: "Help",
                hint: "Opens help for the Companion.",
                identifier: "companion.help",
                action: { onHelp?() }
            )
        }

        if onDismiss != nil {
            headerButton(
                systemName: "xmark",
                label: "Close",
                hint: "Collapses the Companion.",
                identifier: "companion.close",
                action: { onDismiss?() }
            )
        }
    }

    private func expandedProgress(_ progress: CompanionProgressPresentation) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(progress.stepDescription ?? "\(progress.percentComplete)%")
                    .font(PatinaTypography.monoSmall)
                    .tracking(0.3)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.clay)
                Spacer()
                Text("\(progress.percentComplete)%")
                    .font(PatinaTypography.monoSmall)
                    .monospacedDigit()
                    .foregroundStyle(PatinaColors.offWhite)
            }

            progressBar(fraction: progress.fraction)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Progress")
        .accessibilityValue(progress.accessibilityValue)
    }

    private func headerButton(
        systemName: String,
        label: String,
        hint: String,
        identifier: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Circle()
                .fill(Color.white.opacity(0.1))
                .frame(width: 32, height: 32)
                .overlay {
                    Image(systemName: systemName)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(PatinaColors.OnDark.primary)
                }
                .frame(
                    minWidth: CompanionConstants.minimumTouchTarget,
                    minHeight: CompanionConstants.minimumTouchTarget
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityHint(hint)
        .accessibilityIdentifier(identifier)
    }
}

private extension View {
    @ViewBuilder
    func companionMorphMatched(
        id: String,
        namespace: Namespace.ID,
        reduceMotion: Bool
    ) -> some View {
        if reduceMotion {
            self
        } else {
            matchedGeometryEffect(id: id, in: namespace)
        }
    }
}

// swiftlint:enable file_length
