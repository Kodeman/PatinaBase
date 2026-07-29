//  WorkDashboardScreen.swift
//  Capture · Option B Work realm
//
//  Attention first, browsing second. The screen only reflects timestamps and
//  statuses already present in Field's list DTOs and local active captures.

import Foundation
import SwiftUI
import CaptureKit

struct WorkDashboardScreen: View {
    let session: any SessionProviding
    let analytics: any CaptureAnalytics
    let coordinator: CaptureCoordinator
    let companion: FieldCompanionController

    @State private var model: WorkDashboardModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(container: AppContainer, coordinator: CaptureCoordinator) {
        session = container.session
        analytics = container.analytics
        self.coordinator = coordinator
        companion = container.companion
        _model = State(wrappedValue: WorkDashboardModel(container: container))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                header
                if !model.loadIssues.isEmpty {
                    loadIssues
                }
                attentionSection(
                    title: "Needs you",
                    identifier: "work.section.needs-you",
                    items: model.attention.needsYou,
                    emptyText: "You’re caught up for now.",
                    accent: CaptureColor.terracotta
                )
                attentionSection(
                    title: "Waiting on others",
                    identifier: "work.section.waiting",
                    items: model.attention.waitingOnOthers,
                    emptyText: "Nothing is waiting on someone else.",
                    accent: CaptureColor.warning
                )
                attentionSection(
                    title: "Moving today",
                    identifier: "work.section.moving-today",
                    items: model.attention.movingToday,
                    emptyText: "No recorded movement today.",
                    accent: CaptureColor.verdigrisInk
                )
                browseSection
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 40)
        }
        .background(CaptureColor.paper)
        .navigationTitle("Work")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable {
            analytics.event("work.refresh")
            await model.loadAll()
        }
        .task {
            analytics.screen(CaptureScreenID.w1Work.rawValue)
            await model.loadAll()
            updateCompanionHint()
        }
        .onChange(of: contentRevision) {
            updateCompanionHint()
        }
        .animation(
            reduceMotion ? nil : .easeInOut(duration: 0.22),
            value: contentRevision
        )
        .accessibilityIdentifier(CaptureScreenID.w1Work.rawValue)
    }

    // MARK: - Realm header

    private var header: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 5) {
                Text((session.workspaceName ?? "Your studio").uppercased())
                    .font(CaptureType.eyebrow)
                    .foregroundStyle(CaptureColor.inkSoft)
                Text(greeting)
                    .font(CaptureType.display)
                    .foregroundStyle(CaptureColor.ink)
                Text(CaptureDates.dayHeading(Date()))
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
            Spacer(minLength: 4)
            cameraRealmButton
        }
    }

    private var cameraRealmButton: some View {
        Button {
            analytics.event("work.switch_to_camera")
            coordinator.switchRealm(.camera)
        } label: {
            VStack(spacing: 4) {
                Image(systemName: "camera.fill")
                    .font(CaptureType.title2)
                Text("Camera")
                    .font(CaptureType.eyebrow)
                    .textCase(.uppercase)
            }
            .foregroundStyle(CaptureColor.verdigrisInk)
            .frame(minWidth: 68, minHeight: 48)
            .padding(.horizontal, 8)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(CaptureColor.verdigris.opacity(0.14))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(CaptureColor.verdigris.opacity(0.28), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Camera")
        .accessibilityHint("Switches to Camera and keeps your place in Work")
        .accessibilityIdentifier("field.realm.camera")
    }

    private var greeting: String {
        let timeGreeting: String
        switch Calendar.current.component(.hour, from: Date()) {
        case 0..<12: timeGreeting = "Good morning"
        case 12..<17: timeGreeting = "Good afternoon"
        default: timeGreeting = "Good evening"
        }
        guard let displayName = session.displayName,
              let firstName = displayName.split(separator: " ").first else {
            return timeGreeting
        }
        return "\(timeGreeting), \(firstName)"
    }

    private func updateCompanionHint() {
        let hint: String
        let needsYouCount = model.attention.needsYou.count
        if needsYouCount == 1 {
            hint = "1 item needs you"
        } else if needsYouCount > 1 {
            hint = "\(needsYouCount) items need you"
        } else if !model.loadIssues.isEmpty {
            hint = "Some work needs a retry"
        } else if model.hasLoadingSources {
            hint = "Gathering your work"
        } else {
            hint = "You’re caught up"
        }
        companion.send(.collapse(hint: hint, action: nil))
    }

    // MARK: - Attention

    private func attentionSection(
        title: String,
        identifier: String,
        items: [FieldAttentionItem],
        emptyText: String,
        accent: Color
    ) -> some View {
        WorkAttentionSection(
            title: title,
            identifier: identifier,
            items: items,
            isLoading: model.hasLoadingSources,
            emptyText: emptyText,
            accent: accent,
            onSelect: openAttentionItem
        )
    }

    private func openAttentionItem(_ item: FieldAttentionItem) {
        analytics.event("work.open_attention", ["kind": item.kind.rawValue])
        switch item.destination {
        case .specimen(let id):
            coordinator.switchRealm(.camera)
            coordinator.navigate(to: .specimen(id))
        case .thread(let id):
            coordinator.navigate(to: .thread(id))
        case .lead(let id):
            coordinator.navigate(to: .leadDetail(id))
        case .decision(let id):
            coordinator.navigate(to: .decisionDetail(id))
        case .project(let id):
            coordinator.navigate(to: .project(id))
        case .receiving:
            coordinator.navigate(to: .receiving)
        case .syncStatus:
            coordinator.navigate(to: .syncStatus)
        }
    }

    // MARK: - Partial failure

    private var loadIssues: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Some work couldn’t load", systemImage: "wifi.exclamationmark")
                .font(CaptureType.bodyEmph)
                .foregroundStyle(CaptureColor.ink)

            ForEach(model.loadIssues) { issue in
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(issue.source.label)
                            .font(CaptureType.footnote)
                            .foregroundStyle(CaptureColor.ink)
                        Text(issue.message)
                            .font(CaptureType.footnote)
                            .foregroundStyle(CaptureColor.inkSoft)
                    }
                    Spacer(minLength: 8)
                    Button("Retry") {
                        analytics.event("work.retry", ["source": issue.source.rawValue])
                        Task { await model.retry(issue.source) }
                    }
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.verdigrisInk)
                    .frame(minHeight: 44)
                }
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(CaptureColor.warning.opacity(0.12))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(CaptureColor.warning.opacity(0.32), lineWidth: 1)
        )
        .accessibilityIdentifier("work.partial-failure")
    }

    // MARK: - Browse

    private var browseSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            WorkSectionHeading(
                title: "Browse",
                count: nil,
                accent: CaptureColor.inkSoft
            )

            LazyVGrid(
                columns: [GridItem(.adaptive(minimum: 144), spacing: 12)],
                spacing: 12
            ) {
                browseTile(
                    title: "Projects",
                    subtitle: "Current spaces",
                    symbol: "square.stack.3d.up",
                    accessory: browseAccessory(model.projects),
                    route: .projectList
                )
                browseTile(
                    title: "Leads",
                    subtitle: "New opportunities",
                    symbol: "person.crop.circle.badge.plus",
                    accessory: browseAccessory(model.leads),
                    route: .leadList
                )
                browseTile(
                    title: "Decisions",
                    subtitle: "Client choices",
                    symbol: "checkmark.bubble",
                    accessory: browseAccessory(model.decisions),
                    route: .decisionList
                )
                browseTile(
                    title: "Messages",
                    subtitle: "Conversations",
                    symbol: "bubble.left.and.bubble.right",
                    accessory: browseAccessory(model.threads),
                    route: .inbox
                )
                browseTile(
                    title: "Receiving",
                    subtitle: "Arriving orders",
                    symbol: "shippingbox",
                    accessory: browseAccessory(model.arrivingPOs),
                    route: .receiving
                )
                browseTile(
                    title: "Site scan",
                    subtitle: "Capture a room",
                    symbol: "cube.transparent",
                    accessory: .none,
                    route: .siteScanSetup
                )
            }
        }
        .accessibilityIdentifier("work.section.browse")
    }

    private func browseTile(
        title: String,
        subtitle: String,
        symbol: String,
        accessory: WorkBrowseAccessory,
        route: CaptureRoute
    ) -> some View {
        WorkBrowseTile(
            title: title,
            subtitle: subtitle,
            symbol: symbol,
            accessory: accessory
        ) {
            analytics.event("work.open_browse", ["section": title.lowercased()])
            coordinator.navigate(to: route)
        }
    }

    private func browseAccessory<Element>(
        _ state: WorkSectionState<Element>
    ) -> WorkBrowseAccessory {
        switch state {
        case .loaded(let items): .count(items.count)
        case .empty: .count(0)
        case .loading: .loading
        case .error: .none
        }
    }

    private var contentRevision: Int {
        let attention = model.attention
        return attention.needsYou.count
            + attention.waitingOnOthers.count
            + attention.movingToday.count
            + model.loadIssues.count
            + (model.hasLoadingSources ? 0 : 1)
    }
}

// MARK: - Attention section

private struct WorkAttentionSection: View {
    let title: String
    let identifier: String
    let items: [FieldAttentionItem]
    let isLoading: Bool
    let emptyText: String
    let accent: Color
    let onSelect: (FieldAttentionItem) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            WorkSectionHeading(
                title: title,
                count: items.isEmpty ? nil : items.count,
                accent: accent
            )

            VStack(spacing: 0) {
                if items.isEmpty, isLoading {
                    WorkAttentionSkeleton(title: title)
                } else if items.isEmpty {
                    WorkAttentionEmpty(text: emptyText)
                } else {
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                        if index > 0 {
                            Rectangle()
                                .fill(CaptureColor.line)
                                .frame(height: 1)
                                .padding(.leading, 62)
                        }
                        attentionRow(item)
                    }
                }
            }
            .background(
                RoundedRectangle(cornerRadius: 15)
                    .fill(CaptureColor.paper3)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 15)
                    .stroke(CaptureColor.line, lineWidth: 1)
            )
        }
        .accessibilityIdentifier(identifier)
    }

    private func attentionRow(_ item: FieldAttentionItem) -> some View {
        Button { onSelect(item) } label: {
            HStack(spacing: 12) {
                Image(systemName: symbol(for: item.kind))
                    .font(CaptureType.callout)
                    .foregroundStyle(accent)
                    .frame(width: 34, height: 34)
                    .background(accent.opacity(0.12), in: Circle())

                VStack(alignment: .leading, spacing: 3) {
                    Text(item.title)
                        .font(CaptureType.bodyEmph)
                        .foregroundStyle(CaptureColor.ink)
                        .lineLimit(2)
                    Text(item.detail)
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.inkSoft)
                        .lineLimit(2)
                }

                Spacer(minLength: 8)

                if let timestamp = item.timestamp {
                    Text(CaptureDates.timeOrShortDate(timestamp))
                        .font(CaptureType.monoSmall)
                        .foregroundStyle(CaptureColor.inkSoft)
                        .lineLimit(1)
                }
                Image(systemName: "chevron.right")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.line2)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .frame(minHeight: 56)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(item.title), \(item.detail)")
        .accessibilityHint("Opens this item")
        .accessibilityIdentifier("work.attention.\(item.id)")
    }

    private func symbol(for kind: FieldAttentionKind) -> String {
        switch kind {
        case .capture: "camera.viewfinder"
        case .scan: "cube.transparent"
        case .message: "bubble.left.fill"
        case .lead: "person.crop.circle.badge.plus"
        case .decision: "checkmark.bubble"
        case .project: "square.stack.3d.up"
        case .arrival: "shippingbox.fill"
        }
    }
}

private struct WorkSectionHeading: View {
    let title: String
    let count: Int?
    let accent: Color

    var body: some View {
        HStack(spacing: 8) {
            Capsule()
                .fill(accent)
                .frame(width: 18, height: 3)
                .accessibilityHidden(true)
            Text(title.uppercased())
                .font(CaptureType.eyebrow)
                .foregroundStyle(CaptureColor.inkSoft)
            if let count {
                Text("\(count)")
                    .font(CaptureType.eyebrow)
                    .foregroundStyle(CaptureColor.ink)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2)
                    .background(CaptureColor.paper2, in: Capsule())
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

private struct WorkAttentionSkeleton: View {
    let title: String

    var body: some View {
        VStack(spacing: 0) {
            ForEach(0..<2, id: \.self) { index in
                if index > 0 {
                    Rectangle()
                        .fill(CaptureColor.line)
                        .frame(height: 1)
                        .padding(.leading, 62)
                }
                HStack(spacing: 12) {
                    Circle()
                        .fill(CaptureColor.paper2)
                        .frame(width: 34, height: 34)
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Loading attention")
                            .font(CaptureType.bodyEmph)
                        Text("Loading detail")
                            .font(CaptureType.footnote)
                    }
                    Spacer()
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 11)
            }
        }
        .redacted(reason: .placeholder)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading \(title)")
    }
}

private struct WorkAttentionEmpty: View {
    let text: String

    var body: some View {
        Label(text, systemImage: "checkmark.circle")
            .font(CaptureType.callout)
            .foregroundStyle(CaptureColor.inkSoft)
            .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
            .padding(.horizontal, 14)
            .accessibilityElement(children: .combine)
    }
}

// MARK: - Browse tile

private enum WorkBrowseAccessory {
    case count(Int)
    case loading
    case none
}

private struct WorkBrowseTile: View {
    let title: String
    let subtitle: String
    let symbol: String
    let accessory: WorkBrowseAccessory
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 9) {
                HStack(alignment: .top) {
                    Image(systemName: symbol)
                        .font(CaptureType.title2)
                        .foregroundStyle(CaptureColor.verdigrisInk)
                    Spacer()
                    if case .count(let count) = accessory {
                        Text("\(count)")
                            .font(CaptureType.bodyEmph)
                            .foregroundStyle(CaptureColor.ink)
                    } else if case .loading = accessory {
                        ProgressView()
                            .controlSize(.small)
                    }
                }
                Text(title)
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.ink)
                Text(subtitle)
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity, minHeight: 92, alignment: .leading)
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(CaptureColor.paper3)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(CaptureColor.line, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityHint("Opens \(title.lowercased())")
    }

    private var accessibilityLabel: String {
        if case .count(let count) = accessory {
            return "\(title), \(count)"
        }
        return title
    }
}
