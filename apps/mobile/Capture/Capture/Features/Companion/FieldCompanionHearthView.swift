//  FieldCompanionHearthView.swift
//  Capture
//
//  Patina Field's camera-safe Option B Companion surface. Placement and
//  visibility remain feature-owned; this view renders deterministic state.

import CaptureKit
import PatinaDesignKit
import SwiftUI
import UIKit

struct FieldCompanionHearthView: View {
    let presentation: FieldCompanionPresentationState
    var onOpen: () -> Void
    var onDismiss: () -> Void
    var onAction: (FieldCompanionAction) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Namespace private var morphNamespace

    init(
        presentation: FieldCompanionPresentationState,
        onOpen: @escaping () -> Void = {},
        onDismiss: @escaping () -> Void = {},
        onAction: @escaping (FieldCompanionAction) -> Void = { _ in }
    ) {
        self.presentation = presentation
        self.onOpen = onOpen
        self.onDismiss = onDismiss
        self.onAction = onAction
    }

    var body: some View {
        Group {
            switch presentation {
            case .hidden:
                EmptyView()
                    .accessibilityHidden(true)
                    .allowsHitTesting(false)

            case let .collapsed(content):
                collapsedView(content)
                    .transition(contentTransition)

            case let .progress(progress):
                progressView(progress)
                    .transition(contentTransition)

            case let .expanded(content):
                expandedView(content)
                    .transition(contentTransition)
            }
        }
        .animation(
            PatinaCompanionMotion.shellAnimation(reduceMotion: reduceMotion),
            value: presentation.canonicalState
        )
        .onChange(of: presentation) { oldValue, newValue in
            announceProgressMilestone(from: oldValue, to: newValue)
        }
        .accessibilityIdentifier("fieldCompanion.shell")
    }

    private var contentTransition: AnyTransition {
        if reduceMotion {
            return .opacity.animation(
                .easeOut(duration: PatinaCompanionMotion.reducedMotionCrossfadeDuration)
            )
        }

        return .opacity
            .combined(with: .scale(scale: 0.98))
            .animation(PatinaCompanionMotion.contentAnimation)
    }
}

private extension FieldCompanionHearthView {
    func shell<Content: View>(
        cornerRadius: CGFloat,
        @ViewBuilder content: () -> Content
    ) -> some View {
        content()
            .background {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(PatinaColors.Background.dark)
                    .overlay {
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .stroke(PatinaColors.offWhite.opacity(0.12), lineWidth: 1)
                    }
                    .patinaShadow(PatinaShadows.companion)
                    .fieldCompanionMatched(
                        id: "fieldCompanion.shell",
                        namespace: morphNamespace,
                        reduceMotion: reduceMotion
                    )
            }
    }

    func mark(frame: CGFloat, scale: CGFloat, breathing: Bool) -> some View {
        StrataMarkView(
            color: PatinaColors.offWhite,
            scale: scale,
            breathing: breathing,
            useSpecColors: false,
            accessibility: .decorative
        )
        .frame(width: frame, height: frame)
        .fieldCompanionMatched(
            id: "fieldCompanion.mark",
            namespace: morphNamespace,
            reduceMotion: reduceMotion
        )
    }

    func collapsedView(_ content: FieldCompanionCollapsedPresentation) -> some View {
        VStack(spacing: 4) {
            Button(action: onOpen) {
                shell(cornerRadius: 32) {
                    mark(frame: 64, scale: 0.8, breathing: !reduceMotion)
                }
                .frame(width: 64, height: 64)
                .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .frame(minWidth: 64, minHeight: 64)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text("Patina companion"))
            .accessibilityValue(Text(content.hint))
            .accessibilityHint(Text("Opens the Companion."))
            .accessibilityIdentifier("fieldCompanion.bubble")

            if !dynamicTypeSize.isAccessibilitySize, !content.hint.isEmpty {
                if let action = content.action {
                    Button {
                        onAction(action)
                    } label: {
                        hintLabel(content.hint)
                    }
                    .buttonStyle(.plain)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                    .accessibilityLabel(Text(content.hint))
                    .accessibilityHint(Text("Activates this suggested next step."))
                    .accessibilityIdentifier("fieldCompanion.hint")
                } else {
                    hintLabel(content.hint)
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("fieldCompanion.state.collapsed")
    }

    func hintLabel(_ hint: String) -> some View {
        Text(hint)
            .font(CaptureType.footnote)
            .foregroundStyle(CaptureColor.inkSoft)
            .lineLimit(1)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
    }
}

private extension FieldCompanionHearthView {
    @ViewBuilder
    func progressView(_ progress: FieldCompanionProgressPresentation) -> some View {
        if progress.action != nil {
            Button {
                if let action = progress.action {
                    onAction(action)
                }
            } label: {
                progressShell(progress)
            }
            .buttonStyle(.plain)
            .accessibilityHint(Text("Continues this activity."))
        } else {
            progressShell(progress)
        }
    }

    func progressShell(_ progress: FieldCompanionProgressPresentation) -> some View {
        shell(cornerRadius: dynamicTypeSize.isAccessibilitySize ? 24 : 36) {
            VStack(alignment: .leading, spacing: 10) {
                ViewThatFits(in: .horizontal) {
                    progressHorizontalContent(progress)
                    progressVerticalContent(progress)
                }
                progressTrack(progress)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
        }
        .frame(maxWidth: 380)
        .padding(.horizontal, 24)
        .contentShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(progress.title))
        .accessibilityValue(Text(progress.accessibilityValue))
        .accessibilityIdentifier("fieldCompanion.progress")
    }

    func progressHorizontalContent(_ progress: FieldCompanionProgressPresentation) -> some View {
        HStack(spacing: 12) {
            mark(frame: 42, scale: 0.68, breathing: false)
            progressText(progress)
            Spacer(minLength: 8)
            progressAccessory(progress)
        }
    }

    func progressVerticalContent(_ progress: FieldCompanionProgressPresentation) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                mark(frame: 42, scale: 0.68, breathing: false)
                progressText(progress)
            }
            progressAccessory(progress)
        }
    }

    func progressText(_ progress: FieldCompanionProgressPresentation) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(progress.title)
                .font(CaptureType.bodyEmph)
                .foregroundStyle(PatinaColors.offWhite)
                .fixedSize(horizontal: false, vertical: true)

            if let detail = progress.detail, !detail.isEmpty {
                Text(detail)
                    .font(CaptureType.footnote)
                    .foregroundStyle(PatinaColors.Text.inverse.opacity(0.72))
                    .fixedSize(horizontal: false, vertical: true)
            } else if let stepDescription = progress.stepDescription {
                Text(stepDescription)
                    .font(CaptureType.monoSmall)
                    .foregroundStyle(PatinaColors.Text.inverse.opacity(0.72))
            }
        }
    }

    @ViewBuilder
    func progressAccessory(_ progress: FieldCompanionProgressPresentation) -> some View {
        if let percentComplete = progress.percentComplete {
            Text("\(percentComplete)%")
                .font(CaptureType.monoBody)
                .foregroundStyle(PatinaColors.offWhite)
        } else if reduceMotion {
            Text("In progress")
                .font(CaptureType.monoSmall)
                .foregroundStyle(PatinaColors.Text.inverse.opacity(0.72))
        } else {
            ProgressView()
                .controlSize(.small)
                .tint(PatinaColors.clay)
                .accessibilityHidden(true)
        }
    }

    @ViewBuilder
    func progressTrack(_ progress: FieldCompanionProgressPresentation) -> some View {
        if let fraction = progress.fraction {
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(PatinaColors.offWhite.opacity(0.18))
                    Capsule()
                        .fill(PatinaColors.clay)
                        .frame(width: geometry.size.width * fraction)
                }
            }
            .frame(height: 5)
            .accessibilityHidden(true)
        } else if reduceMotion {
            Capsule()
                .fill(PatinaColors.offWhite.opacity(0.18))
                .frame(height: 5)
                .accessibilityHidden(true)
        } else {
            ProgressView()
                .progressViewStyle(.linear)
                .tint(PatinaColors.clay)
                .accessibilityHidden(true)
        }
    }
}

private extension FieldCompanionHearthView {
    func expandedView(_ content: FieldCompanionExpandedPresentation) -> some View {
        shell(cornerRadius: 26) {
            VStack(alignment: .leading, spacing: 16) {
                expandedHeader(content)

                if !content.actions.isEmpty {
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 10) {
                            ForEach(content.actions) { action in
                                actionButton(action)
                            }
                        }

                        VStack(spacing: 10) {
                            ForEach(content.actions) { action in
                                actionButton(action)
                            }
                        }
                    }
                }
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .frame(maxWidth: 380)
        .padding(.horizontal, 24)
        .contentShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("fieldCompanion.panel")
    }

    func expandedHeader(_ content: FieldCompanionExpandedPresentation) -> some View {
        HStack(alignment: .top, spacing: 12) {
            mark(frame: 44, scale: 0.72, breathing: false)

            VStack(alignment: .leading, spacing: 4) {
                Text(content.title)
                    .font(CaptureType.title2)
                    .foregroundStyle(PatinaColors.offWhite)
                    .fixedSize(horizontal: false, vertical: true)

                if let detail = content.detail, !detail.isEmpty {
                    Text(detail)
                        .font(CaptureType.callout)
                        .foregroundStyle(PatinaColors.Text.inverse.opacity(0.72))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            Spacer(minLength: 4)

            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(PatinaColors.offWhite)
                    .frame(width: 44, height: 44)
                    .background(PatinaColors.offWhite.opacity(0.10), in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("Close"))
            .accessibilityHint(Text("Collapses the Companion."))
            .accessibilityIdentifier("fieldCompanion.close")
        }
    }

    func actionButton(_ action: FieldCompanionAction) -> some View {
        Button {
            onAction(action)
        } label: {
            Text(action.label)
                .font(CaptureType.bodyEmph)
                .foregroundStyle(actionForeground(action.role))
                .frame(maxWidth: .infinity, minHeight: 44)
                .padding(.horizontal, 14)
                .background(actionBackground(action.role), in: Capsule())
                .overlay {
                    Capsule()
                        .stroke(actionBorder(action.role), lineWidth: 1)
                }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("fieldCompanion.action.\(action.id)")
    }

    func actionForeground(_ role: FieldCompanionAction.Role) -> Color {
        switch role {
        case .primary:
            return PatinaColors.Background.dark
        case .secondary, .destructive:
            return PatinaColors.offWhite
        }
    }

    func actionBackground(_ role: FieldCompanionAction.Role) -> Color {
        switch role {
        case .primary:
            return PatinaColors.clay
        case .secondary:
            return PatinaColors.offWhite.opacity(0.08)
        case .destructive:
            return CaptureColor.error
        }
    }

    func actionBorder(_ role: FieldCompanionAction.Role) -> Color {
        switch role {
        case .primary, .destructive:
            return .clear
        case .secondary:
            return PatinaColors.offWhite.opacity(0.26)
        }
    }
}

private extension FieldCompanionHearthView {
    func announceProgressMilestone(
        from oldState: FieldCompanionPresentationState,
        to newState: FieldCompanionPresentationState
    ) {
        guard UIAccessibility.isVoiceOverRunning,
              case let .progress(oldProgress) = oldState,
              case let .progress(newProgress) = newState,
              oldProgress.activityID == newProgress.activityID,
              let announcement = FieldCompanionProgressAnnouncementPolicy.announcement(
                  from: oldProgress.fraction,
                  to: newProgress
              ) else {
            return
        }

        UIAccessibility.post(notification: .announcement, argument: announcement)
    }
}

private extension View {
    @ViewBuilder
    func fieldCompanionMatched(
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

#Preview("Field Companion states") {
    VStack(spacing: 28) {
        FieldCompanionHearthView(
            presentation: .collapsed(.init(hint: "Review next steps"))
        )

        FieldCompanionHearthView(
            presentation: .progress(.init(
                activityID: "preview.scan",
                kind: .determinate(0.58),
                title: "Scanning room",
                detail: "Keep the far wall in view",
                step: 2,
                totalSteps: 4
            ))
        )

        FieldCompanionHearthView(
            presentation: .expanded(.init(
                title: "One thing needs attention",
                detail: "Move closer to the far wall, then continue.",
                primaryAction: .init(id: "continue", label: "Continue"),
                secondaryAction: .init(id: "later", label: "Later", role: .secondary)
            ))
        )
    }
    .padding(.vertical, 28)
    .background(CaptureColor.paper)
}
