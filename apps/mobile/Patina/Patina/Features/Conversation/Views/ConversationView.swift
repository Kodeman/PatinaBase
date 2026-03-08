//
//  ConversationView.swift
//  Patina
//
//  Main conversation interface with Patina
//

import SwiftUI

/// The conversation experience - natural dialogue with Patina
struct ConversationView: View {
    @State private var viewModel = ConversationViewModel()
    @FocusState private var isInputFocused: Bool
    @Namespace private var scrollNamespace

    var body: some View {
        ZStack {
            // Background
            PatinaColors.Background.primary
                .ignoresSafeArea()

            VStack(spacing: 0) {
                // Header
                conversationHeader

                // Messages
                messagesScrollView

                // Input area
                inputArea
            }
        }
        .navigationBarHidden(true)
    }

    // MARK: - Header

    private var conversationHeader: some View {
        VStack(spacing: PatinaSpacing.xs) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Patina")
                        .font(PatinaTypography.h2)
                        .foregroundColor(PatinaColors.Text.primary)

                    Text(viewModel.phase.description)
                        .font(PatinaTypography.caption)
                        .foregroundColor(PatinaColors.Text.muted)
                }

                Spacer()

                // Phase indicator
                PhaseIndicator(phase: viewModel.phase)
            }
            .padding(.horizontal, PatinaSpacing.lg)
            .padding(.top, PatinaSpacing.md)
            .padding(.bottom, PatinaSpacing.sm)

            Divider()
                .background(PatinaColors.clayBeige.opacity(0.3))
        }
    }

    // MARK: - Messages

    private var messagesScrollView: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: PatinaSpacing.md) {
                    ForEach(viewModel.messages) { message in
                        MessageBubble(message: message) { suggestion in
                            Task {
                                await viewModel.handleSuggestion(suggestion)
                            }
                        }
                        .id(message.id)
                    }

                    // Typing indicator
                    if viewModel.isTyping {
                        TypingIndicatorWave()
                            .id("typing")
                    }

                    // Scroll anchor
                    Color.clear
                        .frame(height: 1)
                        .id("bottom")
                }
                .padding(.vertical, PatinaSpacing.md)
            }
            .onChange(of: viewModel.messages.count) { _, _ in
                withAnimation {
                    proxy.scrollTo("bottom", anchor: .bottom)
                }
            }
            .onChange(of: viewModel.isTyping) { _, isTyping in
                if isTyping {
                    withAnimation {
                        proxy.scrollTo("typing", anchor: .bottom)
                    }
                }
            }
        }
    }

    // MARK: - Input Area

    private var inputArea: some View {
        VStack(spacing: 0) {
            Divider()
                .background(PatinaColors.clayBeige.opacity(0.3))

            HStack(alignment: .bottom, spacing: PatinaSpacing.sm) {
                // Voice input button
                VoiceInputButton(isActive: $viewModel.isVoiceInputActive) { transcript in
                    viewModel.inputText = transcript
                }

                // Text field
                HStack(alignment: .bottom) {
                    TextField("Share your thoughts...", text: $viewModel.inputText, axis: .vertical)
                        .font(PatinaTypography.body)
                        .foregroundColor(PatinaColors.Text.primary)
                        .lineLimit(1...5)
                        .focused($isInputFocused)
                        .submitLabel(.send)
                        .onSubmit {
                            Task {
                                await viewModel.sendMessage()
                            }
                        }
                }
                .padding(.horizontal, PatinaSpacing.md)
                .padding(.vertical, PatinaSpacing.sm)
                .background(
                    RoundedRectangle(cornerRadius: 20)
                        .fill(PatinaColors.offWhite)
                        .shadow(color: PatinaColors.mochaBrown.opacity(0.06), radius: 2, y: 1)
                )

                // Send button
                Button {
                    Task {
                        await viewModel.sendMessage()
                    }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 32))
                        .foregroundColor(
                            viewModel.inputText.trimmingCharacters(in: .whitespaces).isEmpty
                            ? PatinaColors.clayBeige.opacity(0.5)
                            : PatinaColors.mochaBrown
                        )
                }
                .disabled(viewModel.inputText.trimmingCharacters(in: .whitespaces).isEmpty || viewModel.isTyping)
            }
            .padding(.horizontal, PatinaSpacing.md)
            .padding(.vertical, PatinaSpacing.sm)
            .background(PatinaColors.Background.secondary)
        }
    }
}

// MARK: - Phase Indicator

struct PhaseIndicator: View {
    let phase: ConversationPhase

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<ConversationPhase.allCases.count, id: \.self) { index in
                Circle()
                    .fill(index <= phase.rawValue ? PatinaColors.clayBeige : PatinaColors.clayBeige.opacity(0.3))
                    .frame(width: 6, height: 6)
            }
        }
    }
}

// MARK: - Preview

#Preview {
    ConversationView()
}
