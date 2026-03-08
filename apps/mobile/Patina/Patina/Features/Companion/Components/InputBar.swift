//
//  InputBar.swift
//  Patina
//
//  Input bar for the Companion with text field and voice button
//  Per spec section 4.4: 56px height + safe area, TextField + 44×44px voice button
//

import SwiftUI

/// Input bar for sending messages to the Companion
public struct InputBar: View {
    @Binding var text: String
    var placeholder: String = "Ask or say anything..."
    var isVoiceActive: Bool = false
    var onSend: (String) -> Void
    var onVoiceStart: () -> Void
    var onVoiceEnd: () -> Void

    @FocusState private var isFocused: Bool

    // Per spec: 56px height
    private let barHeight: CGFloat = 56

    public init(
        text: Binding<String>,
        placeholder: String = "Ask or say anything...",
        isVoiceActive: Bool = false,
        onSend: @escaping (String) -> Void,
        onVoiceStart: @escaping () -> Void,
        onVoiceEnd: @escaping () -> Void
    ) {
        self._text = text
        self.placeholder = placeholder
        self.isVoiceActive = isVoiceActive
        self.onSend = onSend
        self.onVoiceStart = onVoiceStart
        self.onVoiceEnd = onVoiceEnd
    }

    public var body: some View {
        HStack(spacing: PatinaSpacing.sm) {
            // Text input field
            HStack {
                TextField(placeholder, text: $text)
                    .font(PatinaTypography.body)  // Spec: 13pt placeholder
                    .foregroundColor(PatinaColors.Text.primary)
                    .focused($isFocused)
                    .submitLabel(.send)
                    .onSubmit {
                        sendMessage()
                    }

                // Send button (appears when there's text)
                if !text.isEmpty {
                    Button {
                        sendMessage()
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 24))
                            .foregroundColor(PatinaColors.clayBeige)
                    }
                    .transition(.scale.combined(with: .opacity))
                }
            }
            .padding(.horizontal, PatinaSpacing.md)
            .padding(.vertical, PatinaSpacing.sm)
            .background(PatinaColors.Background.secondary)
            .cornerRadius(PatinaRadius.xl)

            // Voice input button (spec: 44×44px)
            VoiceButton(
                isActive: isVoiceActive,
                onStart: onVoiceStart,
                onEnd: onVoiceEnd
            )
        }
        .frame(height: barHeight)
        .padding(.horizontal, PatinaSpacing.md)
        .animation(.easeInOut(duration: 0.2), value: text.isEmpty)
    }

    private func sendMessage() {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        HapticManager.shared.impact(.light)
        onSend(trimmed)
        text = ""
    }
}

// MARK: - Voice Button

/// Voice input button with active state
public struct VoiceButton: View {
    var isActive: Bool
    var onStart: () -> Void
    var onEnd: () -> Void

    @State private var isPressing = false
    @State private var pulseScale: CGFloat = 1.0

    // Per spec: 44×44px
    private let buttonSize: CGFloat = 44

    public var body: some View {
        ZStack {
            // Pulse animation when active
            if isActive {
                Circle()
                    .fill(PatinaColors.clayBeige.opacity(0.3))
                    .frame(width: buttonSize * pulseScale, height: buttonSize * pulseScale)
                    .onAppear {
                        withAnimation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true)) {
                            pulseScale = 1.3
                        }
                    }
            }

            // Main button
            Circle()
                .fill(isActive ? PatinaColors.clayBeige : PatinaColors.mochaBrown)
                .frame(width: buttonSize, height: buttonSize)
                .overlay(
                    Image(systemName: isActive ? "mic.fill" : "mic")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundColor(.white)
                )
                .scaleEffect(isPressing ? 0.95 : 1.0)
        }
        .gesture(
            LongPressGesture(minimumDuration: CompanionConstants.longPressDuration)
                .onChanged { _ in
                    isPressing = true
                }
                .onEnded { _ in
                    isPressing = false
                    if !isActive {
                        HapticManager.shared.impact(.medium)
                        onStart()
                    }
                }
        )
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onEnded { _ in
                    if isActive {
                        isPressing = false
                        onEnd()
                    }
                }
        )
        .onTapGesture {
            // Quick tap toggles voice mode (scaffold behavior)
            HapticManager.shared.impact(.light)
            if isActive {
                onEnd()
            } else {
                onStart()
            }
        }
        .animation(.easeInOut(duration: 0.15), value: isPressing)
        .animation(.easeInOut(duration: 0.2), value: isActive)
    }
}

// MARK: - Preview

#Preview("Empty") {
    VStack {
        Spacer()
        InputBar(
            text: .constant(""),
            onSend: { print("Send: \($0)") },
            onVoiceStart: { print("Voice start") },
            onVoiceEnd: { print("Voice end") }
        )
    }
    .background(Color.white)
}

#Preview("With Text") {
    VStack {
        Spacer()
        InputBar(
            text: .constant("Show me my table"),
            onSend: { print("Send: \($0)") },
            onVoiceStart: { print("Voice start") },
            onVoiceEnd: { print("Voice end") }
        )
    }
    .background(Color.white)
}

#Preview("Voice Active") {
    VStack {
        Spacer()
        InputBar(
            text: .constant(""),
            isVoiceActive: true,
            onSend: { print("Send: \($0)") },
            onVoiceStart: { print("Voice start") },
            onVoiceEnd: { print("Voice end") }
        )
    }
    .background(Color.white)
}
