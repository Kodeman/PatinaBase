//
//  DailyStoryCard.swift
//  Patina
//

import SwiftUI

struct DailyStoryCard: View {
    let story: DailyStory
    var namespace: Namespace.ID? = nil
    var isExpanded: Bool = false
    /// Card weight follows content (B, synthesis §5): the story keeps the hero
    /// footprint on a quiet day and drops to a row when the Record carried the
    /// screen. `HomeComposition.storyWeight` decides which.
    var height: CGFloat = 180
    /// When it was published. M1 block 5 draws the date beside the read time
    /// ("AUG 25 · 4 MIN"): a story is a dated thing, and on a screen built
    /// around what is new the reader is owed which day this one is.
    var publishedAt: Date? = nil

    /// "AUG 25 · 4 MIN", or the read time alone where no publish date came
    /// back — never an invented one.
    private var datedReadTimeLabel: String {
        guard let publishedAt else { return story.readTimeLabel }
        return "\(HouseRecordDates.short(publishedAt)) · \(story.readTimeLabel)"
    }

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            Group {
                if let namespace {
                    storyArtwork
                        .matchedGeometryEffect(
                            id: "story-hero-\(story.id)",
                            in: namespace,
                            isSource: !isExpanded
                        )
                } else {
                    storyArtwork
                }
            }

            // Bottom gradient overlay
            LinearGradient(
                stops: [
                    .init(color: PatinaColors.charcoal.opacity(0.88), location: 0.0),
                    .init(color: PatinaColors.charcoal.opacity(0.2), location: 0.6),
                    .init(color: .clear, location: 1.0)
                ],
                startPoint: .bottom,
                endPoint: .top
            )
            .frame(maxHeight: .infinity, alignment: .bottom)
            .frame(height: 135, alignment: .bottom)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)

            // Content
            VStack(alignment: .leading, spacing: PatinaSpacing.xxxs) {
                Text(story.tag)
                    .font(PatinaTypography.monoSmall)
                    .tracking(0.6)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.Text.interactive)
                    .padding(.bottom, 1)
                Text(story.title)
                    .font(PatinaTypography.h5)
                    .foregroundStyle(PatinaColors.offWhite)
                    .lineSpacing(0)
                    .lineLimit(2)
                Text(story.subtitle)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.pearl)
                    .lineLimit(2)
            }
            .padding(.horizontal, PatinaSpacing.md)
            .padding(.bottom, PatinaSpacing.md)

            // Date and read time
            Text(datedReadTimeLabel)
                .font(PatinaTypography.monoSmall)
                .tracking(0.3)
                .textCase(.uppercase)
                .foregroundStyle(PatinaColors.offWhite)
                .padding(.vertical, 3)
                .padding(.horizontal, PatinaSpacing.sm)
                .background(
                    RoundedRectangle(cornerRadius: PatinaRadius.md, style: .continuous)
                        .fill(PatinaColors.charcoal.opacity(0.5))
                )
                .padding(.top, PatinaSpacing.xsm)
                .padding(.leading, PatinaSpacing.xsm)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

            // Unread dot
            if story.isUnread {
                Circle()
                    .fill(PatinaColors.clay)
                    .frame(width: 7, height: 7)
                    .padding(.top, PatinaSpacing.xsm)
                    .padding(.trailing, PatinaSpacing.xsm)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            }
        }
        .frame(height: height)
        .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.xl, style: .continuous))
        .padding(.top, PatinaSpacing.md)
        .padding(.horizontal, PatinaSpacing.mdLarge)
        .opacity(isExpanded ? 0 : 1)
    }

    @ViewBuilder
    private var storyArtwork: some View {
        if let heroImageURL = story.heroImageURL {
            PatinaAsyncImage(url: heroImageURL, contentMode: .fill)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipped()
        } else {
            story.heroGradient
        }
    }
}

#Preview {
    DailyStoryCard(story: .preview)
        .background(PatinaColors.Background.primary)
}
