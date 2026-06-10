//
//  DailyStoryCard.swift
//  Patina
//

import SwiftUI

struct DailyStoryCard: View {
    let story: DailyStory
    var namespace: Namespace.ID? = nil
    var isExpanded: Bool = false

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            Group {
                if let namespace {
                    story.heroGradient
                        .matchedGeometryEffect(
                            id: "story-hero-\(story.id)",
                            in: namespace,
                            isSource: !isExpanded
                        )
                } else {
                    story.heroGradient
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

            // Read time pill
            Text(story.readTimeLabel)
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
        .frame(height: 180)
        .clipShape(RoundedRectangle(cornerRadius: PatinaRadius.xl, style: .continuous))
        .padding(.top, PatinaSpacing.md)
        .padding(.horizontal, PatinaSpacing.mdLarge)
        .opacity(isExpanded ? 0 : 1)
    }
}

#Preview {
    DailyStoryCard(story: .preview)
        .background(PatinaColors.Background.primary)
}
