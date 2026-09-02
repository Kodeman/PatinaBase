//
//  DailyStoryCard.swift
//  Patina
//

import SwiftUI

struct DailyStoryCard: View {
    let story: DailyStory
    var namespace: Namespace.ID?
    var isExpanded: Bool = false
    /// Card weight follows content (B, synthesis §5): the story keeps the hero
    /// footprint on a quiet day and drops to a row when the Record carried the
    /// screen. `HomeComposition.storyWeight` decides which.
    var height: CGFloat = 180

    /// "AUG 25 · 4 MIN", or the read time alone where no publish date came
    /// back — never an invented one. M1 block 5: a story is a dated thing, and
    /// on a screen built around what is new the reader is owed which day this
    /// one is. The date comes off the story itself — there is no override, so
    /// no caller can hand the card a date the story does not carry.
    private var datedReadTimeLabel: String {
        guard let date = story.publishedAt else { return story.readTimeLabel }
        return "\(HouseRecordDates.short(date)) · \(story.readTimeLabel)"
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
        // A MINIMUM, not a fixed height. `height` is the card's weight on a
        // normal day (180 hero / a shorter row when the Record carried the
        // screen); at an accessibility text size the tag, title and subtitle
        // are taller than any of those figures, and a hard `.frame(height:)`
        // reported the small number to the enclosing VStack while the text
        // drew past it — so the story overlapped the house rail above it by
        // ~13pt at XXL and, being the later sibling, hit-tested on top of it:
        // the covered portion of the room cards was untappable (w4 re-walk,
        // item 8). Growing with the content is what keeps the column honest.
        .frame(minHeight: height)
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

#if DEBUG
#Preview {
    DailyStoryCard(story: .preview)
        .background(PatinaColors.Background.primary)
}
#endif
