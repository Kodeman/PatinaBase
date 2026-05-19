//
//  DailyGreetingHeader.swift
//  Patina
//

import SwiftUI

struct DailyGreetingHeader: View {
    let dateString: String
    let monogram: String
    /// Tap handler for the `?` help affordance. When non-nil, a small
    /// SF-Symbol question-mark button is rendered to the left of the
    /// monogram avatar; tapping it opens the contextual help panel for
    /// the Home surface (`SurfaceKeys.IOSApp.Home.root`). When nil (the
    /// default — preserves source compatibility with existing previews
    /// and tests) the affordance is omitted entirely.
    var onHelpTap: (() -> Void)? = nil

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(dateString)
                    .font(PatinaTypography.monoTiny)
                    .tracking(0.5)
                    .textCase(.uppercase)
                    .foregroundColor(PatinaColors.agedOak)
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("Your Daily Room")
                        .font(.custom("PlayfairDisplay-Regular", size: 21))
                        .foregroundColor(PatinaColors.charcoal)
                        .lineSpacing(0)
                    // Contextual help: explains what the "Daily Room" feed
                    // is — a curated mix of one editorial story and a stream
                    // of room-aware product recommendations refreshed daily.
                    HelpInfoIcon(
                        surfaceKey: SurfaceKeys.IOSApp.Home.dailyGreeting,
                        fallback: "Your Daily Room is a fresh, room-aware feed of one editorial story and curated product picks — updated every day.",
                        size: 13
                    )
                }
            }
            Spacer()
            // Optional `?` help-panel trigger. The parent screen owns the
            // sheet state and binds via the closure so this view stays a
            // pure presentation component.
            if let onHelpTap {
                Button(action: onHelpTap) {
                    Image(systemName: "questionmark.circle")
                        .font(.system(size: 17, weight: .regular))
                        .foregroundStyle(PatinaColors.mocha)
                        .frame(width: 36, height: 36)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Help")
                .accessibilityHint("Opens the help panel for this screen.")
                .accessibilityIdentifier("DailyRoomView.HelpButton")
            }
            ZStack {
                Circle()
                    .fill(PatinaGradients.earth)
                    .frame(width: 36, height: 36)
                Text(monogram)
                    .font(.custom("PlayfairDisplay-Medium", size: 14))
                    .foregroundColor(PatinaColors.offWhite)
            }
        }
        .padding(.top, 56)
        .padding(.horizontal, 20)
    }
}

#Preview {
    DailyGreetingHeader(dateString: "WEDNESDAY · APR 7", monogram: "K")
        .background(PatinaColors.offWhite)
}
