//
//  HoldGesture.swift
//  Patina
//
//  Custom hold gesture for threshold crossing and thoughtful interactions
//

import SwiftUI

// MARK: - Hold Button Modifier

/// Modifier that adds hold-to-activate behavior to any view
public struct HoldableModifier: ViewModifier {
    let duration: Double
    let onProgress: (CGFloat) -> Void
    let onComplete: () -> Void
    let onCancel: () -> Void

    @State private var isHolding = false
    @State private var progress: CGFloat = 0
    @State private var holdTask: Task<Void, Never>?

    public init(
        duration: Double = 2.0,
        onProgress: @escaping (CGFloat) -> Void = { _ in },
        onComplete: @escaping () -> Void,
        onCancel: @escaping () -> Void = {}
    ) {
        self.duration = duration
        self.onProgress = onProgress
        self.onComplete = onComplete
        self.onCancel = onCancel
    }

    public func body(content: Content) -> some View {
        content
            .scaleEffect(isHolding ? 0.97 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: isHolding)
            .simultaneousGesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in
                        guard !isHolding else { return }
                        isHolding = true
                        startHold()
                    }
                    .onEnded { _ in
                        cancelHold()
                    }
            )
            // Accessible alternative: a press-and-hold is impractical under
            // VoiceOver, so a single tap (and an explicit custom action)
            // completes the threshold immediately (PT-2-4).
            .accessibilityAction(named: Text("Activate")) {
                accessibleComplete()
            }
            .accessibilityValue(Text("\(Int(progress * 100)) percent"))
            .modifier(VoiceOverTapModifier { accessibleComplete() })
    }

    /// Skip the timed hold and fire completion directly — used when
    /// VoiceOver is running, where a sustained drag cannot be performed.
    private func accessibleComplete() {
        holdTask?.cancel()
        holdTask = nil
        progress = 1
        onProgress(1)
        HapticManager.shared.notification(.success)
        onComplete()
        withAnimation(.easeOut(duration: 0.2)) {
            resetState()
        }
    }

    private func startHold() {
        holdTask = Task { @MainActor in
            let steps = 60
            let stepDuration = duration / Double(steps)

            for step in 1...steps {
                guard !Task.isCancelled else { return }

                try? await Task.sleep(nanoseconds: UInt64(stepDuration * 1_000_000_000))

                progress = CGFloat(step) / CGFloat(steps)
                onProgress(progress)
            }

            if isHolding {
                HapticManager.shared.notification(.success)
                onComplete()
            }
            resetState()
        }
    }

    private func cancelHold() {
        holdTask?.cancel()
        holdTask = nil

        if progress > 0 && progress < 1 {
            onCancel()
        }

        withAnimation(.easeOut(duration: 0.2)) {
            resetState()
        }
    }

    private func resetState() {
        isHolding = false
        progress = 0
        onProgress(0)
    }
}

// MARK: - VoiceOver Tap Alternative
//
// Shared helper for the hold/linger gestures: when VoiceOver is running a
// sustained drag is impractical, so a single tap stands in as the
// accessible activation path. Plain pointer users keep the original
// press-and-hold behavior because the tap is only wired up while
// VoiceOver is active (PT-2-4).
struct VoiceOverTapModifier: ViewModifier {
    let action: () -> Void

    @Environment(\.accessibilityVoiceOverEnabled) private var isVoiceOverEnabled

    func body(content: Content) -> some View {
        if isVoiceOverEnabled {
            content.onTapGesture {
                action()
            }
        } else {
            content
        }
    }
}

// MARK: - View Extension

extension View {
    /// Add hold-to-activate behavior
    public func holdable(
        duration: Double = 2.0,
        onProgress: @escaping (CGFloat) -> Void = { _ in },
        onComplete: @escaping () -> Void,
        onCancel: @escaping () -> Void = {}
    ) -> some View {
        modifier(HoldableModifier(
            duration: duration,
            onProgress: onProgress,
            onComplete: onComplete,
            onCancel: onCancel
        ))
    }
}
