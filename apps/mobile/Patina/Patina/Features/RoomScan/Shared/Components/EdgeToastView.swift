//
//  EdgeToastView.swift
//  Patina
//
//  Toast surface used for low-light, fast-movement, and feature-loss states.
//  Per PRD §4.3 "Edge Case States".
//

import SwiftUI

struct EdgeToastView: View {

    enum Kind {
        case lowLight
        case fastMovement
        case featureLoss

        var icon: String {
            switch self {
            case .lowLight:     return "lightbulb.fill"
            case .fastMovement: return "tortoise.fill"
            case .featureLoss:  return "eye.slash"
            }
        }

        var title: String {
            switch self {
            case .lowLight:     return "Let's brighten things up"
            case .fastMovement: return "Easy does it"
            case .featureLoss:  return "I need a bit more detail"
            }
        }

        var body: String {
            switch self {
            case .lowLight:     return "The room needs a bit more light."
            case .fastMovement: return "The room isn't going anywhere."
            case .featureLoss:  return "Try pointing at something with texture."
            }
        }
    }

    let kind: Kind
    var actionLabel: String?
    var onAction: (() -> Void)?

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                Circle()
                    .fill(PatinaColors.warning.opacity(0.2))
                    .frame(width: 32, height: 32)
                Image(systemName: kind.icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(PatinaColors.warning)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(kind.title)
                    .font(.custom("PlayfairDisplay-Medium", size: 15))
                    .foregroundStyle(PatinaColors.charcoal)
                Text(kind.body)
                    .font(.custom("Inter-Regular", size: 12))
                    .foregroundStyle(PatinaColors.mocha)
                if let label = actionLabel, let action = onAction {
                    Button(action: action) {
                        HStack(spacing: 4) {
                            Text(label)
                            Image(systemName: "arrow.right")
                        }
                        .font(.custom("Inter-SemiBold", size: 12))
                        .foregroundStyle(PatinaColors.charcoal)
                        .padding(.top, 6)
                    }
                    .buttonStyle(.plain)
                }
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .background(
            PatinaColors.offWhite
                .opacity(0.95)
                .background(.ultraThinMaterial)
        )
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text("\(kind.title). \(kind.body)"))
    }
}

#Preview {
    VStack(spacing: 12) {
        EdgeToastView(
            kind: .lowLight,
            actionLabel: "Toggle flashlight",
            onAction: {}
        )
        EdgeToastView(kind: .fastMovement)
        EdgeToastView(kind: .featureLoss)
    }
    .padding()
    .background(Color.black)
}
