//  LogTimeSheet.swift
//  Capture
//
//  H1 · An hour that is not a visit (plan-v2 §7, W6; HT-18, HT-19, HT-41).
//
//  Until now Patina Field could log exactly one thing: a just-closed visit, with
//  a project attached, under the single word `site_visit`. The drive between two
//  houses, the call from the truck, the sourcing run, the admin hour — no
//  surface anywhere (MOB-1, VET-4, LEAH-1, OPS-10).
//
//  A THIN RENDERER over `FieldLogTimeDraft`. Every decision — the pre-fill, the
//  stepper's bounds, whether the role chip appears at all, what the durable
//  record looks like — is the value's, and is therefore covered by
//  `capture-gate.sh test` (which runs `-scheme CaptureKit` alone).
//
//  ⚠ HT-7 — nothing here starts a timer. The duration is a snapshot of how long
//  the ACTIVE visit has been open, taken once when the sheet appears; the single
//  running-timer slot (00177:39-41) stays with the desk in v1.
//
//  ⚠ CR-1 — the act is HELD until there is a project to file the hour against.
//  The failure this closes on the portal was a form that accepted input and
//  silently saved nothing.

import Foundation
import SwiftData
import SwiftUI
import CaptureKit
import PatinaDesignKit

struct LogTimeSheet: View {
    let container: AppContainer
    let coordinator: CaptureCoordinator

    @State private var draft = FieldLogTimeDraft(startedAt: Date())
    @State private var projects: [CaptureProjectSnapshot] = []
    @State private var roles: [FieldRateRole] = []
    @State private var isPickingProject = false
    @State private var isPickingDay = false
    @State private var hasLoaded = false
    @State private var ownerIsMissing = false
    @State private var isLogging = false

    private let contextStore = CaptureSessionContextStore.shared

    private var identity: CaptureSessionIdentity {
        CaptureSessionIdentity(userID: container.session.userID,
                               workspaceID: container.session.workspaceID)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                RouteSheetHeader(
                    eyebrow: "Hours",
                    title: "Log an hour",
                    subtitle: "A drive, a call, a sourcing run — the work that isn't a visit.",
                    onClose: { coordinator.dismissSheet() })

                if ownerIsMissing {
                    PatinaEmptyState(
                        icon: "clock",
                        title: "No workspace yet",
                        message: "An hour belongs to a project in a workspace. "
                            + "Come back once you're in one.")
                } else {
                    projectStep
                    durationStep
                    dayStep
                    activityStep
                    billableStep
                    if FieldLogTimePolicy.showsRoleChip(roles: roles) { roleStep }
                    notesStep
                    primaryStep
                }
            }
            .padding(20)
        }
        .background(CaptureColor.paper3)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .task { await open() }
        .accessibilityIdentifier(CaptureScreenID.h1LogTime.rawValue)
    }

    // MARK: - Project

    @ViewBuilder
    private var projectStep: some View {
        if let name = draft.projectName ?? draft.projectID, !isPickingProject {
            RouteFieldShell(label: "Project") {
                HStack(spacing: 10) {
                    Text(name)
                        .font(CaptureType.body)
                        .foregroundStyle(CaptureColor.ink)
                    Spacer(minLength: 8)
                    // The sizing lives INSIDE the label: on a plain button the
                    // hit region is the label's rendered content, so a frame
                    // hung outside grows the layout and not the target.
                    Button { isPickingProject = true } label: {
                        Text("Change")
                            .font(CaptureType.footnote)
                            .foregroundStyle(CaptureColor.verdigrisInk)
                            .padding(.horizontal, 8)
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        } else {
            projectPicker
        }
    }

    /// Read from the on-phone cache, never from the network: she is on a road.
    /// `CaptureProjectCache.snapshots` never throws and never blocks.
    private var projectPicker: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("PROJECT")
                .font(CaptureType.eyebrow)
                .foregroundStyle(CaptureColor.inkSoft)

            if hasLoaded, projects.isEmpty {
                Text("No projects on this phone yet. Open one in Work first "
                     + "and the hour will have somewhere to go.")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !projects.isEmpty {
                VStack(spacing: 0) {
                    ForEach(projects) { project in
                        projectRow(project)
                    }
                }
                .routeCard()
            }
        }
    }

    private func projectRow(_ project: CaptureProjectSnapshot) -> some View {
        let isOn = draft.projectID == project.id
        return Button {
            draft.projectID = project.id
            draft.projectName = project.name
            isPickingProject = false
            Task { await loadRoles(projectID: project.id) }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: isOn ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(CaptureColor.verdigris)
                Text(project.name)
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.ink)
                Spacer(minLength: 8)
            }
            .padding(.vertical, 12)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }

    // MARK: - How long

    private var durationStep: some View {
        RouteFieldShell(label: "How long") {
            HStack(spacing: 16) {
                stepButton(systemImage: "minus", label: "Fifteen minutes less",
                           isEnabled: draft.canStepDown) {
                    draft.step(by: -FieldLogTimeDraft.stepMinutes)
                }
                Text(draft.durationLabel)
                    .font(CaptureType.title)
                    .foregroundStyle(CaptureColor.ink)
                    .frame(minWidth: 96)
                    .accessibilityLabel("Duration \(draft.durationLabel)")
                stepButton(systemImage: "plus", label: "Fifteen minutes more",
                           isEnabled: draft.canStepUp) {
                    draft.step(by: FieldLogTimeDraft.stepMinutes)
                }
                Spacer(minLength: 0)
            }
        }
    }

    private func stepButton(systemImage: String, label: String,
                            isEnabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(CaptureType.body)
                .foregroundStyle(CaptureColor.ink)
                .frame(width: 44, height: 44)
                .background(Circle().fill(CaptureColor.paper))
                .overlay(Circle().stroke(CaptureColor.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .opacity(isEnabled ? 1 : 0.4)
        .accessibilityLabel(label)
    }

    // MARK: - Which day (HT-13)

    /// The compact `DatePicker` renders its own 34pt control and owns its own
    /// hit region, so no frame hung around it can reach 44pt. The act is
    /// therefore ours — a full-width row that opens the calendar underneath it.
    private var dayStep: some View {
        RouteFieldShell(label: "Day") {
            VStack(alignment: .leading, spacing: 10) {
                Button { isPickingDay.toggle() } label: {
                    HStack(spacing: 8) {
                        Text(dayLabel)
                            .font(CaptureType.body)
                            .foregroundStyle(CaptureColor.ink)
                        Spacer(minLength: 8)
                        Text(isPickingDay ? "Done" : "Change")
                            .font(CaptureType.footnote)
                            .foregroundStyle(CaptureColor.verdigrisInk)
                    }
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Day \(dayLabel)")
                .accessibilityHint("Picks the day this hour belongs to.")

                if isPickingDay {
                    DatePicker("Day", selection: $draft.startedAt,
                               in: ...Date(), displayedComponents: .date)
                        .datePickerStyle(.graphical)
                        .labelsHidden()
                        .tint(CaptureColor.verdigris)
                }
            }
        }
    }

    private var dayLabel: String {
        draft.startedAt.formatted(
            .dateTime.weekday(.abbreviated).day().month(.abbreviated))
    }

    // MARK: - What it was (HT-19)

    private var activityStep: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("WHAT IT WAS")
                .font(CaptureType.eyebrow)
                .foregroundStyle(CaptureColor.inkSoft)
            LogTimeChips(chips: FieldTimeActivity.allCases.map {
                LogTimeChips.Chip(id: $0.rawValue, title: $0.label,
                                  isOn: $0 == draft.activity)
            }) { id in
                guard let picked = FieldTimeActivity(rawValue: id) else { return }
                draft.activity = picked
            }
        }
    }

    // MARK: - Billable (HT-11)

    private var billableStep: some View {
        Toggle(isOn: $draft.billable) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Billable")
                    .font(CaptureType.body)
                    .foregroundStyle(CaptureColor.ink)
                Text("The studio decides what it's worth — this says whether it's "
                     + "the client's hour.")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .tint(CaptureColor.verdigris)
        .frame(minHeight: 44)
    }

    // MARK: - Which seat (HT-41)

    private var roleStep: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("WHICH SEAT")
                .font(CaptureType.eyebrow)
                .foregroundStyle(CaptureColor.inkSoft)
            LogTimeChips(chips: roles.map {
                LogTimeChips.Chip(id: $0.rawValue, title: $0.label,
                                  isOn: $0 == draft.rateRole)
            }) { id in
                let picked = FieldRateRole(rawValue: id)
                draft.rateRole = draft.rateRole == picked ? nil : picked
            }
            Text("You hold more than one seat here. The one you pick is the one "
                 + "that prices the hour.")
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: - Notes

    private var notesStep: some View {
        RouteFieldShell(label: "Note (optional)") {
            TextField("Maple St → High Point", text: $draft.notes, axis: .vertical)
                .font(CaptureType.body)
                .foregroundStyle(CaptureColor.ink)
                .lineLimit(1...3)
        }
    }

    // MARK: - The act

    private var primaryStep: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !draft.canLog {
                Text("Pick the project this hour belongs to.")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
            RouteActionButton("Log \(draft.durationLabel)", systemImage: "clock",
                              kind: .primary, isLoading: isLogging) {
                log()
            }
            .disabled(!draft.canLog || isLogging)
            // `RouteActionButton` does not forward `PatinaButton`'s own
            // `isEnabled` dimming, so `.disabled` alone gates the tap while
            // leaving the act looking live — a primary that looks tappable and
            // does nothing is the CR-1 failure in a different coat.
            .opacity(draft.canLog ? 1 : 0.5)
            Text("It's kept on this phone and sent when there's signal.")
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.inkSoft)
        }
    }

    /// Durable first, sent second — she is standing on gravel with one bar. The
    /// id is minted here and never regenerated, which is what makes
    /// `log_time`'s ON CONFLICT (00608) a no-op on a replay rather than a
    /// second hour.
    private func log() {
        guard !isLogging,
              let owner = ownerUserID,
              let record = draft.record(
                  entryID: UUID(),
                  ownerUserID: owner,
                  now: Date())
        else { return }

        isLogging = true
        record.rateRoleRaw = FieldLogTimePolicy
            .resolvedRole(picked: draft.rateRole, roles: roles)?.rawValue
        container.store.context.insert(record)
        try? container.store.save()

        container.analytics.event("field.log_time_queued", [
            "activity": record.activityRaw ?? "unset",
            "billable": String(record.billable),
            "source": record.source
        ])

        // The record is durable the moment `save()` returns, so the act is
        // over. Holding the sheet on the drain would spend the URLSession
        // timeout under copy that promises the opposite — on the one-bar road
        // this queue exists for. `V4VisitReviewScreen.resumeCloseOutbox` fires
        // the same `.userInitiated` drain and returns immediately.
        isLogging = false
        coordinator.dismissSheet()
        Task { @MainActor in
            await container.timeEntryOutboxDrainer?.resume(trigger: .userInitiated)
        }
    }

    /// `CaptureSessionIdentity` substitutes "anonymous" for a user id it cannot
    /// resolve, and the drainer scopes its fetch by owner — so an hour queued
    /// against that substitute is one nothing would ever select. The sibling
    /// write lanes guard the same way at composition time.
    private var ownerUserID: UUID? {
        VisitReviewComposer.closeOwnerUserID(
            runsRealServices: AppConfiguration.runsRealServices,
            userID: container.session.userID,
            workspaceID: container.session.workspaceID)
    }

    // MARK: - Loading

    private func open() async {
        container.analytics.screen(CaptureScreenID.h1LogTime.rawValue)
        guard !hasLoaded else { return }
        await container.session.waitForReady()
        guard let owner = container.session.ownerIdentity else {
            ownerIsMissing = true
            return
        }
        // The pre-fill: an ACTIVE visit hands over both the project and how
        // long it has been open today. A stale, ended or absent visit hands
        // over neither — `.context` is non-nil for `.stale` too, so the whole
        // state crosses, never the context alone.
        draft = FieldLogTimeDraft(
            visit: contextStore.visitState(identity: identity),
            now: Date())
        projects = container.projectCache.snapshots(owner: owner)
        isPickingProject = !draft.canLog
        hasLoaded = true
        if let projectID = draft.projectID {
            await loadRoles(projectID: projectID)
        }
        // Best-effort, AFTER the cache has already rendered: `refreshList`
        // never throws and never blocks, and a phone that has not opened the
        // project list yet would otherwise have nothing to file the hour
        // against at all. On a road it simply returns false and the cache
        // stands.
        if await container.projectCache.refreshList(owner: owner) {
            projects = container.projectCache.snapshots(owner: owner)
        }
    }

    /// HT-41. A failure is an ABSENT chip, never a wrong one: with no answer the
    /// role goes unstated and the server derives it, which is what a single-role
    /// member sends anyway.
    private func loadRoles(projectID: String) async {
        roles = (try? await container.hours.myRateRoles(projectID: projectID)) ?? []
        draft.rateRole = FieldLogTimePolicy.resolvedRole(picked: draft.rateRole,
                                                        roles: roles)
    }
}

/// The chip row. Kept local for the same reason V0's is: the design system has
/// no flow layout, and this wave is not the place to add one.
private struct LogTimeChips: View {
    struct Chip: Identifiable, Equatable {
        let id: String
        let title: String
        let isOn: Bool
    }

    let chips: [Chip]
    let onTap: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(chips) { chip in
                    Button { onTap(chip.id) } label: {
                        Text(chip.title)
                            .font(CaptureType.footnote)
                            .foregroundStyle(chip.isOn ? CaptureColor.paper3 : CaptureColor.ink)
                            .padding(.horizontal, 14)
                            // Before the background, so the capsule itself grows
                            // to the target rather than a frame around it.
                            .frame(minHeight: 44)
                            .background(chip.isOn ? CaptureColor.verdigris : CaptureColor.paper,
                                        in: Capsule())
                            .overlay(Capsule().stroke(CaptureColor.line,
                                                      lineWidth: chip.isOn ? 0 : 1))
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(chip.isOn ? .isSelected : [])
                }
            }
        }
    }
}

/// H1's own registrar, the one-line-per-feature seam `ScreenRegistry` documents.
enum TimeScreens {
    @MainActor
    static func register(into r: RouteRegistry,
                         container: AppContainer,
                         coordinator: CaptureCoordinator) {
        r.registerSheet(CaptureSheet.logTime.registryKey) { _ in
            AnyView(LogTimeSheet(container: container, coordinator: coordinator))
        }
    }
}
