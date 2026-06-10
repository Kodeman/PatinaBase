//
//  CompanionConversationView.swift
//  Patina
//
//  Conversation view with message bubbles for the Companion sheet
//  Per spec section 4.4: Patina left, User right, scrollable
//
//  Uses existing Message type from Features/Conversation/Models/Message.swift
//

import SwiftUI

// MARK: - Companion Conversation View

/// Scrollable conversation view with message bubbles for the Companion sheet
/// Patina messages aligned left, User messages aligned right
public struct CompanionConversationView: View {
    let messages: [Message]
    var showTypingIndicator: Bool = false

    public init(messages: [Message], showTypingIndicator: Bool = false) {
        self.messages = messages
        self.showTypingIndicator = showTypingIndicator
    }

    public var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: PatinaSpacing.md) {
                    ForEach(messages) { message in
                        CompanionMessageBubble(message: message)
                            .id(message.id)
                    }

                    if showTypingIndicator {
                        CompanionTypingIndicator()
                            .id("typing")
                    }
                }
                .padding(.horizontal, PatinaSpacing.md)
                .padding(.vertical, PatinaSpacing.sm)
            }
            .onChange(of: messages.count) { _, _ in
                // Scroll to latest message
                withAnimation(.easeOut(duration: 0.3)) {
                    if showTypingIndicator {
                        proxy.scrollTo("typing", anchor: .bottom)
                    } else if let lastMessage = messages.last {
                        proxy.scrollTo(lastMessage.id, anchor: .bottom)
                    }
                }
            }
        }
    }
}

// MARK: - Companion Message Bubble

/// Individual message bubble with appropriate styling for the Companion
public struct CompanionMessageBubble: View {
    let message: Message

    private var isPatina: Bool {
        message.sender == .patina
    }

    /// Aggregated VoiceOver label: sender + text + (Patina/you) so focus
    /// stops once per bubble rather than on each Text.
    private var accessibilityText: String {
        let sender = isPatina ? "Patina" : "You"
        return "\(sender) said: \(message.content)"
    }

    public var body: some View {
        HStack {
            if !isPatina {
                Spacer(minLength: 60)
            }

            VStack(alignment: isPatina ? .leading : .trailing, spacing: PatinaSpacing.xxs) {
                // Sender label (optional, for first message or after gap)
                if isPatina {
                    Text("Patina")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(PatinaColors.Text.muted)
                }

                // Message content
                Text(message.content)
                    .font(isPatina ? PatinaTypography.patinaVoice : PatinaTypography.body)  // Spec: Playfair Italic 14pt vs Inter 14pt
                    .foregroundStyle(PatinaColors.Text.primary)
                    .lineSpacing(4)
                    .padding(.horizontal, PatinaSpacing.md)
                    .padding(.vertical, PatinaSpacing.sm)
                    .background(
                        RoundedRectangle(cornerRadius: PatinaRadius.lg)
                            .fill(isPatina ? PatinaColors.Background.secondary : PatinaColors.clay.opacity(0.15))
                    )
            }

            if isPatina {
                Spacer(minLength: 60)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
    }
}

// MARK: - Companion Typing Indicator

/// Animated typing indicator for when Patina is "thinking"
public struct CompanionTypingIndicator: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var animationPhase: Int = 0
    @State private var timer: Timer?

    public var body: some View {
        HStack {
            HStack(spacing: 4) {
                ForEach(0..<3) { index in
                    Circle()
                        .fill(PatinaColors.clay)
                        .frame(width: 6, height: 6)
                        // Reduce Motion: hold all dots at full opacity (static).
                        .opacity(reduceMotion ? 0.8 : (animationPhase == index ? 1.0 : 0.4))
                }
            }
            .padding(.horizontal, PatinaSpacing.md)
            .padding(.vertical, PatinaSpacing.sm)
            .background(
                RoundedRectangle(cornerRadius: PatinaRadius.lg)
                    .fill(PatinaColors.Background.secondary)
            )

            Spacer()
        }
        .accessibilityLabel("Patina is typing")
        .onAppear {
            guard !reduceMotion else { return }
            startAnimation()
        }
        .onDisappear {
            timer?.invalidate()
            timer = nil
        }
    }

    private func startAnimation() {
        timer = Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { _ in
            withAnimation(.easeInOut(duration: 0.2)) {
                animationPhase = (animationPhase + 1) % 3
            }
        }
    }
}

// MARK: - Preview

#Preview("Companion Conversation") {
    CompanionConversationView(
        messages: [
            Message(
                content: "Something surfaced for your living room — a piece that caught my attention.",
                sender: .patina
            ),
            Message(
                content: "Show me",
                sender: .user
            ),
            Message(
                content: "Hand-shaped cherry from a workshop in Maine. The kind of piece that only gets better with Sunday afternoons.",
                sender: .patina
            )
        ],
        showTypingIndicator: false
    )
    .frame(height: 300)
    .background(PatinaColors.Background.primary)
}

#Preview("With Typing") {
    CompanionConversationView(
        messages: [
            Message(
                content: "Let me think about that...",
                sender: .patina
            )
        ],
        showTypingIndicator: true
    )
    .frame(height: 200)
    .background(PatinaColors.Background.primary)
}
