//  WorkDashboardScreen.swift
//  Capture · Wave W (Work dashboard)
//
//  W1 — the designer's field HQ (route `.work`, id `w1Work`). Renders
//  WorkDashboardModel's four independently-loaded sections (Projects, Leads,
//  Decisions, Messages) plus two on-site jump-offs (Receive delivery, Site
//  scan). One section failing never blanks the others — each keeps its own
//  loading/loaded/empty/error state with its own inline retry. Content mirrors
//  the reference DesignerHomeView/DesignerHomeViewModel (active projects,
//  open leads, pending decisions, unread threads); chrome is field-instrument
//  only (CaptureColor/CaptureType), following FieldPlaceholderScreen's chrome
//  and SettingsScreen/SyncStatusScreen's section-card idiom.

import Foundation
import SwiftUI
import CaptureKit

struct WorkDashboardScreen: View {
    let session: any SessionProviding
    let analytics: any CaptureAnalytics
    let coordinator: CaptureCoordinator

    @State private var model: WorkDashboardModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(container: AppContainer, coordinator: CaptureCoordinator) {
        self.session = container.session
        self.analytics = container.analytics
        self.coordinator = coordinator
        _model = State(wrappedValue: WorkDashboardModel(container: container))
    }

    /// The DB's `project_status` enum (migrations 00001, 00084) is
    /// active/completed/archived/on_hold/draft. FieldProject.status is a raw
    /// passthrough string (no enum in this DTO), so "active" is a denylist
    /// rather than `== "active"` — it narrows to current work the same way
    /// the reference DesignerHomeViewModel.activeProjects does, but also
    /// reads sensibly against the mock fixtures' more descriptive strings
    /// ("in_progress", "design") which aren't literally "active".
    private static let closedProjectStatuses: Set<String> = ["completed", "archived", "on_hold", "draft", "cancelled"]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                projectsSection
                leadsSection
                decisionsSection
                messagesSection
                actionRow
            }
            .padding(20)
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
        }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: sectionsLoadedTick)
        .accessibilityIdentifier(CaptureScreenID.w1Work.rawValue)
    }

    // MARK: Header

    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                Text((session.workspaceName ?? "Your studio").uppercased())
                    .font(CaptureType.eyebrow)
                    .foregroundStyle(CaptureColor.inkSoft)
                Text(greeting)
                    .font(CaptureType.display)
                    .foregroundStyle(CaptureColor.ink)
                Text(todayLabel)
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
            Spacer(minLength: 12)
            captureButton
        }
    }

    private var captureButton: some View {
        Button {
            analytics.event("work.return_to_capture")
            coordinator.goBack()
        } label: {
            VStack(spacing: 4) {
                Image(systemName: "camera.fill").font(CaptureType.title2)
                Text("Capture").font(CaptureType.eyebrow).textCase(.uppercase)
            }
            .foregroundStyle(CaptureColor.verdigrisInk)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 12).fill(CaptureColor.verdigris.opacity(0.18)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Back to capture")
        .accessibilityHint("Returns to the camera viewfinder.")
    }

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        let timeGreeting: String
        switch hour {
        case 0..<12: timeGreeting = "Good morning"
        case 12..<17: timeGreeting = "Good afternoon"
        default: timeGreeting = "Good evening"
        }
        guard let name = session.displayName, let first = name.split(separator: " ").first else {
            return timeGreeting
        }
        return "\(timeGreeting), \(first)"
    }

    private var todayLabel: String {
        CaptureDates.dayHeading(Date())
    }

    // MARK: Sections

    private var projectsSection: some View {
        WorkSectionCard(title: "Projects", count: activeProjectCount,
                        onHeaderTap: { openSectionList(.projectList, section: "projects") }) {
            sectionContent(model.projects, section: "projects", emptyText: "No active projects right now",
                          retry: { Task { await model.loadProjects() } }) { items in
                let active = activeProjects(items)
                if active.isEmpty {
                    WorkEmptyRow(text: "No active projects right now")
                } else {
                    rowList(Array(active.prefix(3))) { project in projectRow(project) }
                }
            }
        }
    }

    private var leadsSection: some View {
        WorkSectionCard(title: "Leads", count: leadsCount,
                        onHeaderTap: { openSectionList(.leadList, section: "leads") }) {
            sectionContent(model.leads, section: "leads", emptyText: "No open leads right now",
                          retry: { Task { await model.loadLeads() } }) { items in
                if let newest = items.first {
                    rowList([newest]) { lead in leadRow(lead) }
                }
            }
        }
    }

    private var decisionsSection: some View {
        WorkSectionCard(title: "Decisions", count: decisionsCount,
                        onHeaderTap: { openSectionList(.decisionList, section: "decisions") }) {
            sectionContent(model.decisions, section: "decisions", emptyText: "Nothing awaiting the client",
                          retry: { Task { await model.loadDecisions() } }) { items in
                rowList(Array(items.prefix(3))) { decision in decisionRow(decision) }
            }
        }
    }

    private var messagesSection: some View {
        WorkSectionCard(title: "Messages", count: unreadThreadCount,
                        onHeaderTap: { openSectionList(.inbox, section: "messages") }) {
            sectionContent(model.threads, section: "messages", emptyText: "No conversations yet",
                          retry: { Task { await model.loadThreads() } }) { items in
                rowList(Array(items.prefix(3))) { thread in threadRow(thread) }
            }
        }
    }

    /// Shared per-section state → content switch: skeleton while loading, the
    /// designed empty state, an inline error + retry, or the caller's rows.
    @ViewBuilder
    private func sectionContent<Item, Rows: View>(
        _ state: WorkSectionState<Item>,
        section: String,
        emptyText: String,
        retry: @escaping () -> Void,
        @ViewBuilder rows: ([Item]) -> Rows
    ) -> some View {
        switch state {
        case .loading:
            WorkSkeletonRows(label: section)
        case .empty:
            WorkEmptyRow(text: emptyText)
        case .error(let message):
            WorkErrorRow(message: message, retry: retry)
        case .loaded(let items):
            rows(items)
        }
    }

    private func rowList<Item: Identifiable, RowContent: View>(
        _ items: [Item], @ViewBuilder row: @escaping (Item) -> RowContent
    ) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                if index != 0 {
                    Rectangle().fill(CaptureColor.line).frame(height: 1).padding(.leading, 16)
                }
                row(item)
            }
        }
    }

    // MARK: Rows

    private func projectRow(_ project: FieldProject) -> some View {
        Button { openSectionItem(.project(project.id), section: "projects") } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(project.name)
                        .font(CaptureType.bodyEmph)
                        .foregroundStyle(CaptureColor.ink)
                        .lineLimit(1)
                    if let clientName = project.clientName {
                        Text(clientName)
                            .font(CaptureType.footnote)
                            .foregroundStyle(CaptureColor.inkSoft)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 8)
                phaseChip(project)
                Image(systemName: "chevron.right")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.line2)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
            "\(project.name)\(project.clientName.map { ", \($0)" } ?? ""), \(project.phaseLabel ?? project.status)"
        )
    }

    private func leadRow(_ lead: FieldLead) -> some View {
        Button { openSectionItem(.leadDetail(lead.id), section: "leads") } label: {
            HStack(spacing: 12) {
                Text(lead.clientName)
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.ink)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Text(Self.relativeAge(lead.createdAt))
                    .font(CaptureType.monoSmall)
                    .foregroundStyle(CaptureColor.inkSoft)
                Image(systemName: "chevron.right")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.line2)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(lead.clientName), \(Self.relativeAge(lead.createdAt))")
    }

    private func decisionRow(_ decision: FieldDecision) -> some View {
        Button { openSectionItem(.decisionDetail(decision.id), section: "decisions") } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(decision.title)
                        .font(CaptureType.bodyEmph)
                        .foregroundStyle(CaptureColor.ink)
                        .lineLimit(1)
                    if let clientName = decision.clientName {
                        Text(clientName)
                            .font(CaptureType.footnote)
                            .foregroundStyle(CaptureColor.inkSoft)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.line2)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(decision.title)\(decision.clientName.map { ", \($0)" } ?? "")")
    }

    private func threadRow(_ thread: FieldThread) -> some View {
        Button { openSectionItem(.thread(thread.id), section: "messages") } label: {
            HStack(alignment: .top, spacing: 12) {
                if thread.unread {
                    Circle().fill(CaptureColor.goldenHour).frame(width: 7, height: 7).padding(.top, 6)
                }
                VStack(alignment: .leading, spacing: 3) {
                    Text(thread.title)
                        .font(CaptureType.bodyEmph)
                        .foregroundStyle(CaptureColor.ink)
                        .lineLimit(1)
                    if let preview = thread.lastMessagePreview {
                        Text(preview)
                            .font(CaptureType.footnote)
                            .foregroundStyle(CaptureColor.inkSoft)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 8)
                if let at = thread.lastMessageAt {
                    Text(Self.shortTime(at))
                        .font(CaptureType.monoSmall)
                        .foregroundStyle(CaptureColor.inkSoft)
                }
                Image(systemName: "chevron.right")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.line2)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(thread.title)\(thread.unread ? ", unread" : "")")
    }

    private func phaseChip(_ project: FieldProject) -> some View {
        let label = project.phaseLabel ?? project.status.replacingOccurrences(of: "_", with: " ")
        let color = phaseColor(project.status)
        return Text(label.uppercased())
            .font(CaptureType.eyebrow)
            .foregroundStyle(color)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .overlay(Capsule().stroke(color.opacity(0.45), lineWidth: 1))
    }

    private func phaseColor(_ status: String) -> Color {
        switch status {
        case "on_hold": return CaptureColor.terracotta
        case "completed", "archived": return CaptureColor.success
        // Active/in-progress: clayDeep(light)/clay(dark) reads AA on both the
        // cream card and the dark card — goldenHour is sub-AA on cream (R28/R33
        // text-chip classification). Dark was already fine; this fixes light.
        default: return CaptureColor.verdigrisInk
        }
    }

    // MARK: Action row

    private var actionRow: some View {
        HStack(spacing: 12) {
            actionButton(title: "Receive delivery", subtitle: "Inspect arriving POs", symbol: "shippingbox") {
                openAction(.receiving, name: "receive_delivery")
            }
            actionButton(title: "Site scan", subtitle: "Capture a room in 3D", symbol: "cube") {
                openAction(.siteScanSetup, name: "site_scan")
            }
        }
    }

    private func actionButton(title: String, subtitle: String, symbol: String,
                              action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: symbol).font(CaptureType.title2).foregroundStyle(CaptureColor.verdigrisInk)
                Text(title).font(CaptureType.bodyEmph).foregroundStyle(CaptureColor.ink)
                Text(subtitle).font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(RoundedRectangle(cornerRadius: 14).fill(CaptureColor.paper3))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(CaptureColor.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityHint(subtitle)
    }

    // MARK: Navigation + analytics

    private func openSectionList(_ route: CaptureRoute, section: String) {
        analytics.event("work.open_list", ["section": section])
        coordinator.navigate(to: route)
    }

    private func openSectionItem(_ route: CaptureRoute, section: String) {
        analytics.event("work.open_item", ["section": section])
        coordinator.navigate(to: route)
    }

    private func openAction(_ route: CaptureRoute, name: String) {
        analytics.event("work.\(name)")
        coordinator.navigate(to: route)
    }

    // MARK: Derived

    private func activeProjects(_ items: [FieldProject]) -> [FieldProject] {
        items.filter { !Self.closedProjectStatuses.contains($0.status) }
    }

    private var activeProjectCount: Int? {
        guard case .loaded(let items) = model.projects else { return nil }
        let count = activeProjects(items).count
        return count > 0 ? count : nil
    }

    private var leadsCount: Int? {
        guard case .loaded(let items) = model.leads else { return nil }
        return items.isEmpty ? nil : items.count
    }

    private var decisionsCount: Int? {
        guard case .loaded(let items) = model.decisions else { return nil }
        return items.isEmpty ? nil : items.count
    }

    private var unreadThreadCount: Int? {
        guard case .loaded(let items) = model.threads else { return nil }
        let count = items.filter(\.unread).count
        return count > 0 ? count : nil
    }

    /// Drives the Reduce-Motion-aware loading→loaded transition — a simple
    /// Equatable proxy since WorkSectionState<Element> isn't itself Equatable.
    private var sectionsLoadedTick: Int {
        func done<T>(_ state: WorkSectionState<T>) -> Int {
            if case .loading = state { return 0 }
            return 1
        }
        return done(model.projects) + done(model.leads) + done(model.decisions) + done(model.threads)
    }

    // MARK: Formatting

    private static func relativeAge(_ date: Date?) -> String {
        CaptureDates.relativeAge(date)
    }

    private static func shortTime(_ date: Date) -> String {
        CaptureDates.timeOrShortDate(date)
    }
}

// MARK: - Section card chrome

private struct WorkSectionCard<Content: View>: View {
    let title: String
    let count: Int?
    let onHeaderTap: () -> Void
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: onHeaderTap) {
                HStack(spacing: 8) {
                    Text(title.uppercased())
                        .font(CaptureType.eyebrow)
                        .foregroundStyle(CaptureColor.inkSoft)
                    if let count, count > 0 {
                        Text("\(count)")
                            .font(CaptureType.eyebrow)
                            .foregroundStyle(CaptureColor.ink)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(CaptureColor.paper2))
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.line2)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(count.map { "\(title), \($0)" } ?? title)
            .accessibilityHint("Opens the full \(title.lowercased()) list.")

            Rectangle().fill(CaptureColor.line).frame(height: 1)

            content()
        }
        .background(RoundedRectangle(cornerRadius: 14).fill(CaptureColor.paper3))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(CaptureColor.line, lineWidth: 1))
    }
}

// MARK: - Per-section states

private struct WorkSkeletonRows: View {
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(0..<2, id: \.self) { index in
                if index != 0 {
                    Rectangle().fill(CaptureColor.line).frame(height: 1).padding(.leading, 16)
                }
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Loading title").font(CaptureType.bodyEmph)
                        Text("Loading subtitle").font(CaptureType.footnote)
                    }
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
        }
        .redacted(reason: .placeholder)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading \(label)")
    }
}

private struct WorkEmptyRow: View {
    let text: String
    var body: some View {
        Text(text)
            .font(CaptureType.callout)
            .foregroundStyle(CaptureColor.inkSoft)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.vertical, 20)
    }
}

private struct WorkErrorRow: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(CaptureType.callout)
                .foregroundStyle(CaptureColor.error)
                .accessibilityHidden(true)
            Text(message)
                .font(CaptureType.callout)
                .foregroundStyle(CaptureColor.error)
            Spacer(minLength: 8)
            Button("Retry", action: retry)
                .font(CaptureType.bodyEmph)
                .foregroundStyle(CaptureColor.verdigris)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 16)
    }
}

#if DEBUG
#Preview {
    NavigationStack {
        WorkDashboardScreen(container: AppContainer(), coordinator: CaptureCoordinator())
    }
}
#endif
