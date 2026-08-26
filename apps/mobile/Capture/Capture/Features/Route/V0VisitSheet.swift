//  V0VisitSheet.swift
//  Capture
//
//  V0 · Visit — the door (spec §7.3). One question, answered once: where are
//  you today. Everything after this inherits the answer.
//
//  A THIN RENDERER over `FieldVisitDoorModel`. Every decision — what can start,
//  what the primary says, which rooms exist, whether a restored room is still
//  pending, what the offline line reads — is the model's. Nothing here computes
//  one.

import SwiftUI
import CaptureKit
import PatinaDesignKit

struct V0VisitSheet: View {
    let container: AppContainer
    let coordinator: CaptureCoordinator

    @State private var model: FieldVisitDoorModel?
    @State private var hasLoaded = false
    @State private var ownerIsMissing = false

    private let contextStore = CaptureSessionContextStore.shared

    private var identity: CaptureSessionIdentity {
        CaptureSessionIdentity(userID: container.session.userID,
                               workspaceID: container.session.workspaceID)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                RouteSheetHeader(
                    eyebrow: "Visit",
                    title: "Where are you today?",
                    onClose: { coordinator.dismissSheet() })

                if let model {
                    content(model)
                } else if ownerIsMissing {
                    PatinaEmptyState(
                        icon: "mappin.and.ellipse",
                        title: "No workspace yet",
                        message: "A visit belongs to a workspace. Come back once you're in one.")
                }
            }
            .padding(20)
        }
        .background(CaptureColor.paper3)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .task { await open() }
        .accessibilityIdentifier(CaptureScreenID.v0Visit.rawValue)
    }

    private func open() async {
        container.analytics.screen(CaptureScreenID.v0Visit.rawValue)
        guard model == nil else { return }
        // R78: nothing on this screen may read as "you chose nothing" while the
        // answer is simply not known yet. So the owner is waited for rather than
        // declared absent, and every caption below is gated on `hasLoaded`.
        await container.session.waitForReady()
        guard let owner = container.session.ownerIdentity else {
            ownerIsMissing = true
            return
        }
        let door = FieldVisitDoorModel(cache: container.projectCache,
                                       owner: owner,
                                       existing: contextStore.visitState(identity: identity))
        model = door
        await door.load()
        await door.prefillVenue(from: container.location)
        hasLoaded = true
    }

    @ViewBuilder
    private func content(_ model: FieldVisitDoorModel) -> some View {
        kindRow(model)

        if model.kind == .site {
            projectStep(model)
            if model.selectedProjectID != nil, !model.roomOptions.isEmpty {
                roomStep(model)
            }
        } else {
            venueStep(model)
            projectsInMindStep(model)
        }

        kitRow(model)
        primaryRow(model)

        if model.isChangingAnOpenVisit {
            RouteActionButton("End visit", systemImage: "stop.circle", kind: .danger) {
                endVisit()
            }
        }
    }

    // MARK: - Kind

    private func kindRow(_ model: FieldVisitDoorModel) -> some View {
        HStack(spacing: 10) {
            chip("Site visit", isOn: model.kind == .site) { model.kind = .site }
            chip("Sourcing", isOn: model.kind == .sourcing) { model.kind = .sourcing }
        }
    }

    // MARK: - Site: project

    private func projectStep(_ model: FieldVisitDoorModel) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            RouteFieldShell(label: "Project") {
                TextField("Search projects…", text: Binding(
                    get: { model.query }, set: { model.query = $0 }))
                    .font(CaptureType.body)
                    .foregroundStyle(CaptureColor.ink)
            }

            if let caption = model.offlineCaption {
                Label(caption, systemImage: "wifi.exclamationmark")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
            }

            if hasLoaded, model.projects.isEmpty {
                Text(model.query.isEmpty
                     ? "No projects on this phone yet. Start one below."
                     : "Nothing here by that name.")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
            }

            if !model.projects.isEmpty {
                VStack(spacing: 0) {
                    ForEach(model.projects) { project in
                        projectRow(model, project: project)
                    }
                }
                .routeCard()
            }

            Button("+ New project") { coordinator.present(.createProject) }
                .font(CaptureType.callout)
                .foregroundStyle(CaptureColor.verdigrisInk)
                .frame(minHeight: 44)
        }
    }

    private func projectRow(_ model: FieldVisitDoorModel,
                            project: CaptureProjectSnapshot) -> some View {
        let isOn = model.selectedProjectID == project.id
        let note = note(for: project)
        return Button {
            // Every project selection goes through `select`: it is the only path
            // that clears a previous project's pending room lanes.
            Task { await model.select(projectID: project.id) }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: isOn ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(CaptureColor.verdigris)
                Text(project.name)
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.ink)
                Spacer(minLength: 8)
                if let note {
                    if note.isCaution {
                        Image(systemName: "exclamationmark.triangle")
                            .font(CaptureType.footnote)
                            .foregroundStyle(CaptureColor.warning)
                    }
                    Text(note.text)
                        .font(CaptureType.monoSmall)
                        .foregroundStyle(note.isCaution
                                         ? CaptureColor.warning : CaptureColor.inkSoft)
                }
            }
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }

    private struct ProjectNote {
        let text: String
        let isCaution: Bool
    }

    /// Nil when there is nothing true to say. An empty room lane is NOT "0 rooms":
    /// `CaptureProjectSnapshot` documents that a list-only refresh and a detail
    /// refresh that found none are the same bytes, so a count of zero would
    /// assert something this row cannot know.
    private func note(for project: CaptureProjectSnapshot) -> ProjectNote? {
        if project.isStale(now: Date()) {
            return ProjectNote(text: "on this phone", isCaution: true)
        }
        if let visited = project.lastVisitedAt {
            return ProjectNote(text: "last visit \(CaptureDates.shortDate(visited))",
                               isCaution: false)
        }
        let count = project.specRooms.count
        guard count > 0 else { return nil }
        return ProjectNote(text: count == 1 ? "1 room" : "\(count) rooms", isCaution: false)
    }

    // MARK: - Site: room

    private func roomStep(_ model: FieldVisitDoorModel) -> some View {
        let pending = model.isAwaitingRestoredRoom
        // A visit opened on Whole house reopens with `selectedRoom == nil`, and
        // `draft()` reads nil and Whole house identically — so nil RENDERS as
        // Whole house rather than as a missing answer. Not while the stored
        // lanes are unresolved: there the room genuinely is not known yet, and
        // showing Whole house pre-selected would hide the one tap that resolves it.
        let selectedID = pending ? nil : (model.selectedRoom ?? .wholeHouse).id
        return VStack(alignment: .leading, spacing: 8) {
            stepLabel("Room")
            FlowChips(chips: model.roomOptions.map {
                FlowChips.Chip(id: $0.id, title: $0.name, isOn: $0.id == selectedID)
            }) { id in
                // FC-R5: the option is CHOSEN from `roomOptions`, never rebuilt
                // from an id — rebuilding is the cross-assignment the merge exists
                // to close.
                model.selectedRoom = model.roomOptions.first { $0.id == id }
            }
            if let caption = model.scanLaneCaption {
                Text(caption)
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.warning)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // MARK: - Sourcing

    private func venueStep(_ model: FieldVisitDoorModel) -> some View {
        // R76: `prefillVenue` accepts an empty placemark name, so "a guess ran"
        // and "a guess found something" are one state here. Nothing affirms a
        // prefill — an empty field simply shows its placeholder.
        RouteFieldShell(label: "Where") {
            TextField("High Point · Showroom 214", text: Binding(
                get: { model.venueName }, set: { model.venueName = $0 }))
                .font(CaptureType.body)
                .foregroundStyle(CaptureColor.ink)
        }
    }

    private func projectsInMindStep(_ model: FieldVisitDoorModel) -> some View {
        let isFull = model.projectsInMindIsFull
        return VStack(alignment: .leading, spacing: 8) {
            stepLabel("Projects in mind")
            FlowChips(chips: model.projects.map { project in
                let isOn = model.projectsInMind.contains(project.id)
                // R36: a full list stops OFFERING a fifth rather than swallowing
                // the tap.
                return FlowChips.Chip(id: project.id, title: project.name,
                                      isOn: isOn, isEnabled: isOn || !isFull)
            }) { id in
                model.toggleProjectInMind(id)
            }
            if isFull {
                Text("Four is the most a market run can hold.")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
        }
    }

    // MARK: - Kit

    private func kitRow(_ model: FieldVisitDoorModel) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            stepLabel("Kit")
            HStack(spacing: 8) {
                ForEach(model.offeredKits, id: \.self) { candidate in
                    chip(label(for: candidate), isOn: model.kit == candidate) {
                        model.kit = model.kit == candidate ? nil : candidate
                    }
                }
            }
            Text(model.consentPosture == .conversation
                 ? "Notes on a walk-through start as a conversation — everyone in "
                   + "the room is on the recording."
                 : "Notes start as your own — just you talking.")
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func label(for kit: FieldVisitKit) -> String {
        switch kit {
        case .walkThrough: return "Walk-through"
        case .tradeWalk:   return "Trade walk"
        case .install:     return "Install day"
        }
    }

    // MARK: - Primary

    private func primaryRow(_ model: FieldVisitDoorModel) -> some View {
        let held = !model.canStart || model.isAwaitingRestoredRoom
        // The caption names a Whole house chip, so it waits until there is one on
        // screen — `roomStep` is hidden while `roomOptions` is empty, which is also
        // every moment before `load()` returns.
        let explain = model.isAwaitingRestoredRoom && !model.roomOptions.isEmpty
        return VStack(alignment: .leading, spacing: 8) {
            // R78: the ONLY line that ever sits under a held primary, and it
            // names what the app is missing, never something she failed to do.
            if explain {
                Text("This project's rooms aren't on this phone yet. Change waits "
                     + "for them — or pick Whole house and mean it.")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }
            RouteActionButton(model.primaryTitle, systemImage: "arrow.right", kind: .primary) {
                start(model)
            }
            .disabled(held)
            .opacity(held ? 0.5 : 1)
        }
    }

    private func start(_ model: FieldVisitDoorModel) {
        guard let draft = model.draft(), let owner = container.session.ownerIdentity else { return }
        contextStore.startVisit(draft, identity: identity)
        if let projectID = draft.projectID {
            container.projectCache.recordVisit(projectID: projectID, owner: owner)
        }
        container.analytics.emit(FieldVisitTelemetry.visitStart(
            kind: draft.kind, kit: draft.kit,
            offline: model.offlineCaption != nil))
        CaptureHaptics.success()
        coordinator.dismissSheet()
        coordinator.switchRealm(.camera)
    }

    private func endVisit() {
        // Site 1 of 4 (spec §14): read the visit's own counts BEFORE `endVisit`
        // closes the context — afterwards `visitState` reads `.none` and they
        // are unrecoverable.
        if let context = contextStore.visitState(identity: identity).context {
            let counts = FieldVisitEndCounts.compute(
                context: context, store: container.store,
                runsRealServices: AppConfiguration.runsRealServices,
                userID: container.session.userID,
                workspaceID: container.session.workspaceID)
            container.analytics.emit(FieldVisitTelemetry.visitEnd(
                duration: counts.duration, captures: counts.captures,
                notes: counts.notes, scans: counts.scans, unplaced: counts.unplaced))
        }
        contextStore.endVisit(identity: identity)
        coordinator.dismissSheet()
    }

    // MARK: - Small parts

    private func stepLabel(_ text: String) -> some View {
        Text(text)
            .font(CaptureType.eyebrow)
            .textCase(.uppercase)
            .foregroundStyle(CaptureColor.inkSoft)
    }

    private func chip(_ title: String, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            RouteChipLabel(title: title, isOn: isOn)
        }
        .buttonStyle(.plain)
        .frame(minHeight: 44)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

/// The chip skin, shared by the kind/kit rows and the wrapping chip rows.
private struct RouteChipLabel: View {
    let title: String
    let isOn: Bool

    var body: some View {
        Text(title)
            .font(CaptureType.footnote)
            .foregroundStyle(isOn ? CaptureColor.paper3 : CaptureColor.ink)
            .padding(.horizontal, 14).padding(.vertical, 9)
            .background(isOn ? CaptureColor.verdigris : CaptureColor.paper, in: Capsule())
            .overlay(Capsule().stroke(CaptureColor.line, lineWidth: isOn ? 0 : 1))
    }
}

/// A scrolling chip row. Kept local: the design system has no flow layout and
/// this wave is not the place to add one. Chips are keyed by ID rather than by
/// title so a room selection never round-trips through a display name.
private struct FlowChips: View {
    struct Chip: Identifiable, Equatable {
        let id: String
        let title: String
        let isOn: Bool
        var isEnabled: Bool = true
    }

    let chips: [Chip]
    let onTap: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(chips) { chip in
                    Button { onTap(chip.id) } label: {
                        RouteChipLabel(title: chip.title, isOn: chip.isOn)
                    }
                    .buttonStyle(.plain)
                    .frame(minHeight: 44)
                    .disabled(!chip.isEnabled)
                    .opacity(chip.isEnabled ? 1 : 0.4)
                    .accessibilityAddTraits(chip.isOn ? .isSelected : [])
                }
            }
        }
    }
}
