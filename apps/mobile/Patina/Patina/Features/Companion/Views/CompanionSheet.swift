//
//  CompanionSheet.swift
//  Patina
//
//  Expanded companion panel - Quick links only (no chat)
//  Context-aware actions based on current screen
//

import SwiftUI

/// Expanded companion sheet with context-aware quick actions
public struct CompanionSheet: View {
    @Bindable var viewModel: CompanionViewModel
    @Environment(\.appCoordinator) private var coordinator
    var onQuickAction: ((QuickAction) -> Void)?

    public init(viewModel: CompanionViewModel, onQuickAction: ((QuickAction) -> Void)? = nil) {
        self.viewModel = viewModel
        self.onQuickAction = onQuickAction
    }

    public var body: some View {
        VStack(spacing: 0) {
            // Context header
            contextHeader
                .padding(.top, PatinaSpacing.sm)

            // Quick action buttons (vertical stack)
            quickActionsView
                .padding(.top, PatinaSpacing.lg)

            Spacer(minLength: PatinaSpacing.xl)
        }
    }

    // MARK: - Context Header

    private var contextHeader: some View {
        HStack(spacing: PatinaSpacing.sm) {
            Image(systemName: viewModel.context.contextIcon)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(PatinaColors.clayBeige)
                .accessibilityHidden(true)

            Text(viewModel.context.contextSummary)
                .font(PatinaTypography.caption)
                .foregroundColor(PatinaColors.mochaBrown)
                .dynamicTypeSize(...DynamicTypeSize.accessibility2) // Cap at 150% per spec
        }
        .padding(.horizontal, PatinaSpacing.lg)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Context: \(viewModel.context.contextSummary)")
    }

    // MARK: - Quick Actions

    private var quickActionsView: some View {
        VStack(spacing: PatinaSpacing.md) {
            ForEach(viewModel.quickActions) { action in
                QuickActionButton(
                    action: action,
                    onTap: { handleQuickAction(action) }
                )
            }
        }
        .padding(.horizontal, PatinaSpacing.lg)
    }

    // MARK: - Actions

    private func handleQuickAction(_ action: QuickAction) {
        if let handler = onQuickAction {
            handler(action)
        } else {
            if action.intent.triggersNavigation {
                _ = coordinator.handleIntent(action.intent)
            } else {
                _ = viewModel.handleQuickAction(action)
            }
        }
    }
}

// MARK: - Quick Action Button

struct QuickActionButton: View {
    let action: QuickAction
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: PatinaSpacing.md) {
                // Icon
                Image(systemName: action.icon)
                    .font(.system(size: action.isPrimary ? 22 : 18, weight: .medium))
                    .frame(width: 28)
                    .accessibilityHidden(true)

                // Title
                Text(action.title)
                    .font(action.isPrimary ? PatinaTypography.h3 : PatinaTypography.body)
                    .dynamicTypeSize(...DynamicTypeSize.accessibility2) // Cap at 150% per spec

                Spacer()

                // Chevron
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .opacity(0.4)
                    .accessibilityHidden(true)
            }
            .padding(.vertical, action.isPrimary ? PatinaSpacing.lg : PatinaSpacing.md)
            .padding(.horizontal, PatinaSpacing.lg)
            // Ensure minimum touch target (44pt per Apple HIG)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(action.isPrimary ? PatinaColors.clayBeige : Color.clear)
            .foregroundColor(action.isPrimary ? PatinaColors.offWhite : PatinaColors.charcoal)
            .cornerRadius(PatinaRadius.lg)
            .overlay(
                RoundedRectangle(cornerRadius: PatinaRadius.lg)
                    .strokeBorder(
                        action.isPrimary ? Color.clear : PatinaColors.clayBeige.opacity(0.3),
                        lineWidth: 1
                    )
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(action.title)
        .accessibilityAddTraits(action.isPrimary ? .startsMediaSession : [])
    }
}

// MARK: - Preview

#Preview("Quick Actions") {
    CompanionSheet(viewModel: CompanionViewModel())
        .frame(height: 350)
        .background(PatinaColors.warmWhite)
        .clipShape(RoundedRectangle(cornerRadius: 24))
        .padding()
        .background(PatinaColors.Background.primary)
}
