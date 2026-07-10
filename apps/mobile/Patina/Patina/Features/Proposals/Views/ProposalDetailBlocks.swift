//
//  ProposalDetailBlocks.swift
//  Patina
//
//  The typography-first document blocks rendered inside ProposalDetailView
//  (Wave 2 / D.1). Each block renders nothing when its data is empty, so the
//  detail collapses cleanly. Tokens only, zero shadows. Field sets mirror the
//  client portal's ProposalDocument blocks.
//

import SwiftUI

// MARK: - Shared scaffolding

/// A labelled document block: a mono section label + a rounded surface card.
private struct ProposalBlock<Content: View>: View {
    let label: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            MonoLabel(text: label)
                .padding(.horizontal, 24)
            VStack(alignment: .leading, spacing: 0) {
                content
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .padding(.horizontal, 24)
        }
    }
}

/// Hairline divider between rows in a block card.
private struct BlockDivider: View {
    var leadingInset: CGFloat = 16
    var body: some View {
        Rectangle()
            .fill(PatinaColors.pearl)
            .frame(height: 1)
            .padding(.leading, leadingInset)
    }
}

// MARK: - Narrative sections

struct ProposalNarrativeBlock: View {
    let sections: [RemoteProposalSection]

    private var renderable: [RemoteProposalSection] {
        sections.filter { !($0.body ?? "").isEmpty || !($0.title ?? "").isEmpty }
    }

    var body: some View {
        ForEach(renderable) { section in
            VStack(alignment: .leading, spacing: 6) {
                if let title = section.title, !title.isEmpty {
                    Text(title)
                        .font(PatinaTypography.h5)
                        .foregroundStyle(PatinaColors.Text.primary)
                }
                if let body = section.body, !body.isEmpty {
                    Text(body)
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 24)
        }
    }
}

// MARK: - Scope rooms

struct ProposalScopeRoomsBlock: View {
    let rooms: [RemoteProposalScopeRoom]

    var body: some View {
        if !rooms.isEmpty {
            ProposalBlock(label: "Scope") {
                ForEach(Array(rooms.enumerated()), id: \.element.id) { index, room in
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(room.name ?? "Room")
                                .font(PatinaTypography.bodySmallMedium)
                                .foregroundStyle(PatinaColors.Text.primary)
                            if let type = room.room_type, !type.isEmpty {
                                Text(type.replacingOccurrences(of: "_", with: " ").capitalized)
                                    .font(PatinaTypography.caption)
                                    .foregroundStyle(PatinaColors.Text.muted)
                            }
                        }
                        Spacer(minLength: 8)
                        if let budget = room.budget_cents, budget > 0 {
                            Text(PatinaCurrency.formatWholeDollars(cents: budget))
                                .font(PatinaTypography.bodySmallMedium)
                                .foregroundStyle(PatinaColors.Text.secondary)
                        }
                    }
                    .padding(14)
                    if index < rooms.count - 1 { BlockDivider() }
                }
            }
        }
    }
}

// MARK: - Selections (items)

struct ProposalSelectionsBlock: View {
    let items: [RemoteProposalItem]

    private var visible: [RemoteProposalItem] {
        items.filter { $0.item_type != "tbd" }
    }

    var body: some View {
        if !visible.isEmpty {
            ProposalBlock(label: "Selections") {
                ForEach(Array(visible.enumerated()), id: \.element.id) { index, item in
                    row(item)
                    if index < visible.count - 1 { BlockDivider(leadingInset: 72) }
                }
            }
        }
    }

    private func row(_ item: RemoteProposalItem) -> some View {
        HStack(alignment: .top, spacing: 12) {
            PatinaAsyncImage(url: item.resolvedImageURL)
                .frame(width: 48, height: 48)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 2) {
                Text(item.resolvedName)
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.primary)
                if let vendor = item.resolvedVendor {
                    Text(vendor)
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.Text.muted)
                }
                if let qty = item.quantity, qty > 1 {
                    Text("Qty \(Int(qty))")
                        .font(PatinaTypography.captionSmall)
                        .foregroundStyle(PatinaColors.Text.muted)
                }
            }
            Spacer(minLength: 8)
            if let total = item.line_total_cents {
                Text(PatinaCurrency.formatWholeDollars(cents: total))
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.secondary)
            }
        }
        .padding(14)
    }
}

// MARK: - Timeline (phases)

struct ProposalTimelineBlock: View {
    let phases: [RemoteProposalPhase]

    var body: some View {
        if !phases.isEmpty {
            ProposalBlock(label: "Timeline") {
                ForEach(Array(phases.enumerated()), id: \.element.id) { index, phase in
                    HStack {
                        Text(phase.name ?? "Phase")
                            .font(PatinaTypography.bodySmallMedium)
                            .foregroundStyle(PatinaColors.Text.primary)
                        Spacer(minLength: 8)
                        if let weeks = phase.duration_weeks, weeks > 0 {
                            Text(weeks == 1 ? "1 week" : "\(weeks) weeks")
                                .font(PatinaTypography.caption)
                                .foregroundStyle(PatinaColors.Text.muted)
                        }
                    }
                    .padding(14)
                    if index < phases.count - 1 { BlockDivider() }
                }
            }
        }
    }
}

// MARK: - Payment schedule (milestones)

struct ProposalMilestonesBlock: View {
    let milestones: [RemoteProposalMilestone]

    var body: some View {
        if !milestones.isEmpty {
            ProposalBlock(label: "Payment schedule") {
                ForEach(Array(milestones.enumerated()), id: \.element.id) { index, milestone in
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(milestone.label ?? "Payment")
                                .font(PatinaTypography.bodySmallMedium)
                                .foregroundStyle(PatinaColors.Text.primary)
                            if let trigger = milestone.trigger_condition, !trigger.isEmpty {
                                Text(trigger)
                                    .font(PatinaTypography.caption)
                                    .foregroundStyle(PatinaColors.Text.muted)
                            }
                        }
                        Spacer(minLength: 8)
                        VStack(alignment: .trailing, spacing: 2) {
                            if let amount = milestone.amount_cents {
                                Text(PatinaCurrency.format(cents: amount))
                                    .font(PatinaTypography.bodySmallMedium)
                                    .foregroundStyle(PatinaColors.Text.secondary)
                            }
                            if let pct = milestone.percentage, pct > 0 {
                                Text("\(Int(pct))%")
                                    .font(PatinaTypography.captionSmall)
                                    .foregroundStyle(PatinaColors.Text.muted)
                            }
                        }
                    }
                    .padding(14)
                    if index < milestones.count - 1 { BlockDivider() }
                }
            }
        }
    }
}

// MARK: - Exclusions

struct ProposalExclusionsBlock: View {
    let exclusions: [RemoteProposalExclusion]

    var body: some View {
        if !exclusions.isEmpty {
            ProposalBlock(label: "Not included") {
                ForEach(Array(exclusions.enumerated()), id: \.element.id) { index, exclusion in
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(exclusion.description ?? "")
                                .font(PatinaTypography.bodySmall)
                                .foregroundStyle(PatinaColors.Text.primary)
                            if let category = exclusion.category, !category.isEmpty {
                                Text(category)
                                    .font(PatinaTypography.caption)
                                    .foregroundStyle(PatinaColors.Text.muted)
                            }
                        }
                        Spacer(minLength: 8)
                    }
                    .padding(14)
                    if index < exclusions.count - 1 { BlockDivider() }
                }
            }
        }
    }
}
