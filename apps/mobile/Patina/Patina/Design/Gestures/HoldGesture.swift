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
