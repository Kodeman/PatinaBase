//
//  DailyFeedEmptyModule.swift
//  Patina
//
//  Theme V: the single editorial module that replaces the filter chips +
//  empty recommendations rail on the Daily Room. Instead of dead air the
//  user gets exactly one next step in the house card language:
//   - no style profile yet → a style-quiz prompt, or
//   - profile present      → a "scan another room" / browse prompt.
//  A one-line contextual empty state ("Nothing saved for Kitchen yet")
//  sits above the card when the selected room has no saved items.
//

import SwiftUI

struct DailyFeedEmptyModule: View {
    /// Name of the currently selected room, for contextual copy.
    let roomName: String?
    /// Whether the selected room has any saved items.
    let roomHasItems: Bool
    /// Whether a style profile (quiz / teaching output) exists.
    let hasStyleProfile: Bool

    let onTakeQuiz: () -> Void
    let onScanRoom: () -> Void
    let onBrowse: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let roomName, !roomHasItems {
                // One-line contextual empty state for the rail area.
                Text("Nothing saved for \(roomName) yet")
                    .font(PatinaTypography.monoLabel)
                    .tracking(0.5)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .padding(.leading, 2)
            }

            if hasStyleProfile {
                scanPromptCard
            } else {
                quizPromptCard
            }
        }
    }

    // MARK: - Quiz prompt (no style profile yet)

    private var quizPromptCard: some View {
        card(
            eyebrow: "Your style",
            headline: "Teach Patina your taste",
            bodyText: "Take the short style quiz and the picks \(roomPhrase) will be chosen for you.",
            primaryTitle: "Take the Style Quiz",
            primaryAction: onTakeQuiz,
            secondary: nil
        )
    }

    // MARK: - Scan / browse prompt (profile exists, rail just empty)

    private var scanPromptCard: some View {
        card(
            eyebrow: "While picks brew",
            headline: headlineForScanPrompt,
            bodyText: "Recommendations sharpen as Patina learns each space. "
                + "Scan another room to widen the net, or browse the full collection.",
            primaryTitle: "Scan Another Room",
            primaryAction: onScanRoom,
            secondary: ("Browse all pieces →", onBrowse)
        )
    }

    private var headlineForScanPrompt: String {
        if let roomName {
            return "Picks for \(roomName) are on their way"
        }
        return "Your picks are on their way"
    }

    private var roomPhrase: String {
        if let roomName { return "for \(roomName)" }
        return "for your rooms"
    }

    // MARK: - Card scaffold (house language: rounded 16, softCream,
    // Playfair headline, clay accent)

    private func card(
        eyebrow: String,
        headline: String,
        bodyText: String,
        primaryTitle: String,
        primaryAction: @escaping () -> Void,
        secondary: (title: String, action: () -> Void)?
    ) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                Text("✦")
                    .font(.system(size: 11))
                    .foregroundStyle(PatinaColors.clay)
                Text(eyebrow)
                    .font(PatinaTypography.monoLabel)
                    .tracking(0.8)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.Text.interactive)
            }
            .padding(.bottom, 8)

            Text(headline)
                .font(.custom("PlayfairDisplay-Regular", size: 20, relativeTo: .title3))
                .foregroundStyle(PatinaColors.Text.primary)
                .lineSpacing(2)
                .padding(.bottom, 6)

            Text(bodyText)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.muted)
                .lineSpacing(3)
                .padding(.bottom, 16)

            Button(action: primaryAction) {
                Text(primaryTitle)
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.inverse)
                    .frame(maxWidth: .infinity)
                    // minHeight (not height) so the CTA grows instead of
                    // clipping its label at accessibility type sizes.
                    .frame(minHeight: 44)
                    .background(Capsule().fill(PatinaColors.Interactive.active))
            }
            .buttonStyle(.plain)

            if let secondary {
                Button(action: secondary.action) {
                    Text(secondary.title)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.interactive)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: 36)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.top, 4)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(PatinaColors.Background.secondary)
        )
    }

}

#Preview("Quiz prompt") {
    DailyFeedEmptyModule(
        roomName: "Kitchen",
        roomHasItems: false,
        hasStyleProfile: false,
        onTakeQuiz: {},
        onScanRoom: {},
        onBrowse: {}
    )
    .padding(20)
    .background(PatinaColors.Background.primary)
}

#Preview("Scan prompt") {
    DailyFeedEmptyModule(
        roomName: "Living Room",
        roomHasItems: true,
        hasStyleProfile: true,
        onTakeQuiz: {},
        onScanRoom: {},
        onBrowse: {}
    )
    .padding(20)
    .background(PatinaColors.Background.primary)
}
