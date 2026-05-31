//
//  ConversationHeaderView.swift
//  Patina
//
//  Shared header for every Conversation question screen.
//  Per PRD §4.6.
//

import SwiftUI

struct ConversationHeaderView: View {

    let whisperTop: String
    let question: String
    var subtext: String? = nil
    var whisperGeometryNamespace: Namespace.ID? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let ns = whisperGeometryNamespace {
                whisperLabel
                    .matchedGeometryEffect(id: "whisperTop", in: ns)
            } else {
                whisperLabel
            }

            Text(question)
                .font(.custom("PlayfairDisplay-Italic", size: 26))
                .foregroundStyle(PatinaColors.charcoal)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 2)

            if let subtext {
                Text(subtext)
                    .font(.custom("Inter-Light", size: 13))
                    .foregroundStyle(PatinaColors.agedOak)
                    .padding(.top, 8)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 24)
        .padding(.top, 66)
    }

    private var whisperLabel: some View {
        Text(whisperTop)
            .font(.custom("DMMono-Regular", size: 10))
            .tracking(0.6)
            .textCase(.uppercase)
            .foregroundStyle(PatinaColors.clay)
            .padding(.bottom, 20)
    }
}

#Preview {
    VStack {
        ConversationHeaderView(
            whisperTop: "Your room is captured · Let's discover your style",
            question: "Which room speaks to you?",
            subtext: "Choose one that pulls you in"
        )
        Spacer()
    }
    .background(PatinaColors.offWhite)
}
