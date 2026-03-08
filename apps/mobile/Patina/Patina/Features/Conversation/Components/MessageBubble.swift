//
//  MessageBubble.swift
//  Patina
//
//  Individual message bubble in conversation
//

import SwiftUI

/// A single message bubble in the conversation
struct MessageBubble: View {
    let message: Message
    var onSuggestionTap: ((String) -> Void)?

    @State private var isAppearing = false

    private var isFromUser: Bool {
        message.sender == .user
    }

    var body: some View {
        VStack(alignment: isFromUser ? .trailing : .leading, spacing: PatinaSpacing.sm) {
            // Message content
            HStack {
                if isFromUser { Spacer(minLength: 60) }

                VStack(alignment: isFromUser ? .trailing : .leading, spacing: PatinaSpacing.xs) {
                    // Main bubble
                    Text(message.content)
                        .font(isFromUser ? PatinaTypography.body : PatinaTypography.patinaVoice)
                        .foregroundColor(bubbleTextColor)
                        .padding(.horizontal, PatinaSpacing.md)
                        .padding(.vertical, PatinaSpacing.sm + 4)
                        .background(bubbleBackground)
                        .clipShape(MessageBubbleShape(isFromUser: isFromUser))

                    // Timestamp
                    Text(message.formattedTime)
                        .font(PatinaTypography.caption)
                        .foregroundColor(PatinaColors.Text.muted)
                        .padding(.horizontal, PatinaSpacing.xs)
                }

                if !isFromUser { Spacer(minLength: 60) }
            }

            // Suggestions (if any)
            if let suggestions = message.metadata?.suggestions, !suggestions.isEmpty {
                suggestionChips(suggestions)
            }
        }
        .padding(.horizontal, PatinaSpacing.md)
        .opacity(isAppearing ? 1 : 0)
        .offset(y: isAppearing ? 0 : 10)
        .onAppear {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                isAppearing = true
            }
        }
    }

    // MARK: - Bubble Styling

    private var bubbleTextColor: Color {
        isFromUser ? PatinaColors.Text.inverse : PatinaColors.Text.primary
    }

    @ViewBuilder
    private var bubbleBackground: some View {
        if isFromUser {
            PatinaColors.charcoal
        } else {
            PatinaColors.offWhite
                .shadow(color: PatinaColors.mochaBrown.opacity(0.08), radius: 4, y: 2)
        }
    }

    // MARK: - Suggestion Chips

    @ViewBuilder
    private func suggestionChips(_ suggestions: [String]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: PatinaSpacing.sm) {
                ForEach(suggestions, id: \.self) { suggestion in
                    Button {
                        onSuggestionTap?(suggestion)
                        HapticManager.shared.impact(.light)
                    } label: {
                        Text(suggestion)
                            .font(PatinaTypography.bodySmall)
                            .foregroundColor(PatinaColors.mochaBrown)
                            .padding(.horizontal, PatinaSpacing.md)
                            .padding(.vertical, PatinaSpacing.sm)
                            .background(
                                Capsule()
                                    .stroke(PatinaColors.clayBeige, lineWidth: 1)
                            )
                    }
                }
            }
            .padding(.horizontal, PatinaSpacing.md)
        }
    }
}

// MARK: - Message Bubble Shape

struct MessageBubbleShape: Shape {
    let isFromUser: Bool
    let cornerRadius: CGFloat = 18

    func path(in rect: CGRect) -> Path {
        var path = Path()

        let topLeft = isFromUser ? cornerRadius : cornerRadius
        let topRight = isFromUser ? cornerRadius : cornerRadius
        let bottomLeft = isFromUser ? cornerRadius : 4
        let bottomRight = isFromUser ? 4 : cornerRadius

        // Start from top-left
        path.move(to: CGPoint(x: topLeft, y: 0))

        // Top edge
        path.addLine(to: CGPoint(x: rect.width - topRight, y: 0))

        // Top-right corner
        path.addArc(
            center: CGPoint(x: rect.width - topRight, y: topRight),
            radius: topRight,
            startAngle: .degrees(-90),
            endAngle: .degrees(0),
            clockwise: false
        )

        // Right edge
        path.addLine(to: CGPoint(x: rect.width, y: rect.height - bottomRight))

        // Bottom-right corner
        path.addArc(
            center: CGPoint(x: rect.width - bottomRight, y: rect.height - bottomRight),
            radius: bottomRight,
            startAngle: .degrees(0),
            endAngle: .degrees(90),
            clockwise: false
        )

        // Bottom edge
        path.addLine(to: CGPoint(x: bottomLeft, y: rect.height))

        // Bottom-left corner
        path.addArc(
            center: CGPoint(x: bottomLeft, y: rect.height - bottomLeft),
            radius: bottomLeft,
            startAngle: .degrees(90),
            endAngle: .degrees(180),
            clockwise: false
        )

        // Left edge
        path.addLine(to: CGPoint(x: 0, y: topLeft))

        // Top-left corner
        path.addArc(
            center: CGPoint(x: topLeft, y: topLeft),
            radius: topLeft,
            startAngle: .degrees(180),
            endAngle: .degrees(270),
            clockwise: false
        )

        return path
    }
}

// MARK: - Preview

#Preview {
    VStack(spacing: PatinaSpacing.md) {
        MessageBubble(
            message: Message(
                content: "I love spaces with natural light and warm wood tones.",
                sender: .user
            )
        )

        MessageBubble(
            message: Message(
                content: "That sounds lovely. Natural light really transforms a space. Tell me more about the feeling you want your room to have.",
                sender: .patina,
                metadata: MessageMetadata(
                    suggestions: ["Cozy & inviting", "Open & airy", "Calm & serene"]
                )
            )
        )
    }
    .padding()
    .background(PatinaColors.Background.primary)
}
