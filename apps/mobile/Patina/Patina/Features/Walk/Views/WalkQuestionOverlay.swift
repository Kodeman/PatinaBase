//
//  WalkQuestionOverlay.swift
//  Patina
//
//  Overlay for displaying questions during the room walk.
//  Questions appear when user is stationary and fade after timeout.
//

import SwiftUI

/// Overlay for walk questions
struct WalkQuestionOverlay: View {

    // MARK: - Properties

    let question: WalkQuestion?
    let onAnswer: (String) -> Void
    let onDismiss: () -> Void

    // MARK: - State

    @State private var visible = false
    @State private var textInput = ""
    @FocusState private var textFieldFocused: Bool

    // MARK: - Constants

    private enum Layout {
        static let timeoutDuration: TimeInterval = 10.0
    }

    var body: some View {
        VStack {
            Spacer()

            if let question = question, visible {
                questionCard(question)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .onChange(of: question) { oldValue, newValue in
            if newValue != nil {
                showQuestion()
            } else {
                hideQuestion()
            }
        }
        .onAppear {
            if question != nil {
                showQuestion()
            }
        }
    }

    // MARK: - Question Card

    private func questionCard(_ question: WalkQuestion) -> some View {
        VStack(spacing: PatinaSpacing.lg) {
            // Question text
            Text(question.text)
                .font(PatinaTypography.patinaVoice)
                .foregroundColor(PatinaColors.Text.primary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, PatinaSpacing.md)

            // Options or text input
            if question.allowsTextInput {
                textInputSection(question)
            } else {
                optionsSection(question)
            }
        }
        .padding(PatinaSpacing.xl)
        .background(
            RoundedRectangle(cornerRadius: PatinaRadius.xl)
                .fill(PatinaColors.Background.primary)
                .shadow(color: .black.opacity(0.2), radius: 20, y: 10)
        )
        .padding(.horizontal, PatinaSpacing.lg)
        .padding(.bottom, PatinaSpacing.xxxl)
    }

    // MARK: - Options Section

    private func optionsSection(_ question: WalkQuestion) -> some View {
        HStack(spacing: PatinaSpacing.sm) {
            ForEach(question.options) { option in
                Button(action: {
                    handleAnswer(option.value)
                }) {
                    Text(option.text)
                        .font(PatinaTypography.bodySmall)
                        .foregroundColor(PatinaColors.Text.primary)
                        .padding(.horizontal, PatinaSpacing.md)
                        .padding(.vertical, PatinaSpacing.sm)
                        .background(
                            RoundedRectangle(cornerRadius: PatinaRadius.lg)
                                .stroke(PatinaColors.clayBeige, lineWidth: 1)
                        )
                }
                .buttonStyle(ScaleButtonStyle())
            }
        }
    }

    // MARK: - Text Input Section

    private func textInputSection(_ question: WalkQuestion) -> some View {
        VStack(spacing: PatinaSpacing.md) {
            TextField("One word...", text: $textInput)
                .font(PatinaTypography.body)
                .foregroundColor(PatinaColors.Text.primary)
                .multilineTextAlignment(.center)
                .textFieldStyle(.plain)
                .padding(.horizontal, PatinaSpacing.md)
                .padding(.vertical, PatinaSpacing.sm)
                .background(
                    RoundedRectangle(cornerRadius: PatinaRadius.lg)
                        .stroke(PatinaColors.Text.muted, lineWidth: 1)
                )
                .focused($textFieldFocused)
                .submitLabel(.done)
                .onSubmit {
                    if !textInput.isEmpty {
                        handleAnswer(textInput)
                    }
                }

            // Submit button (only shows when text is entered)
            if !textInput.isEmpty {
                Button(action: {
                    handleAnswer(textInput)
                }) {
                    Text("Done")
                        .font(PatinaTypography.bodySmall)
                        .foregroundColor(PatinaColors.offWhite)
                        .padding(.horizontal, PatinaSpacing.lg)
                        .padding(.vertical, PatinaSpacing.sm)
                        .background(PatinaColors.clayBeige)
                        .cornerRadius(PatinaRadius.md)
                }
                .buttonStyle(ScaleButtonStyle())
                .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: textInput.isEmpty)
    }

    // MARK: - Actions

    private func handleAnswer(_ value: String) {
        HapticManager.shared.impact(.light)
        hideQuestion()
        onAnswer(value)
    }

    private func showQuestion() {
        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
            visible = true
        }

        // Auto-dismiss after timeout
        Task {
            try? await Task.sleep(nanoseconds: UInt64(Layout.timeoutDuration * 1_000_000_000))
            if visible && question != nil {
                hideQuestion()
                onDismiss()
            }
        }
    }

    private func hideQuestion() {
        textFieldFocused = false
        textInput = ""
        withAnimation(.easeOut(duration: 0.3)) {
            visible = false
        }
    }
}

// MARK: - Scale Button Style

private struct ScaleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

// MARK: - Preview

#Preview("Time Question") {
    ZStack {
        Color.black.opacity(0.5)

        WalkQuestionOverlay(
            question: .timeOfDayQuestion,
            onAnswer: { print("Answer: \($0)") },
            onDismiss: { print("Dismissed") }
        )
    }
    .ignoresSafeArea()
}

#Preview("Text Input Question") {
    ZStack {
        Color.black.opacity(0.5)

        WalkQuestionOverlay(
            question: .roomFeelingQuestion,
            onAnswer: { print("Answer: \($0)") },
            onDismiss: { print("Dismissed") }
        )
    }
    .ignoresSafeArea()
}
