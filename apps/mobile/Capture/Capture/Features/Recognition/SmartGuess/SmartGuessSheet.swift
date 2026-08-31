//  SmartGuessSheet.swift
//  Capture
//
//  N5 · Smart field guess. After capture an on-device vision model proposes
//  category, material, style and colour. Every value is a labelled "guess" the
//  designer confirms or corrects — never silently trusted. "Looks right" accepts
//  the guesses as confirmed fields (source .manual; a corrected value becomes
//  .edited); tapping a guess opens just that field; "Edit all" opens them all.
//  Guesses never overwrite a value a tag/scan/measure/human already set.

import SwiftUI
import CaptureKit

struct SmartGuessSheet: View {
    let specimenID: UUID
    let store: CaptureStore
    let session: any SessionProviding
    let camera: any CameraService
    let smartGuess: any SmartGuessService
    let analytics: any CaptureAnalytics
    let sync: any CaptureSyncService
    let siteRequests: any SiteRequestService
    let coordinator: CaptureCoordinator?

    @State private var loaded = false
    @State private var editAll = false
    @State private var editing: Set<String> = []
    /// Unfiltered project parties — PunchCourtResolver's input (ruling 2).
    @State private var parties: [FieldPartyRef] = []
    @State private var pendingPunch = false
    @State private var court: PunchCourt = .noCourt

    // Working values + the original guesses (to tell a correction from an accept).
    @State private var categoryRaw = SpecimenCategory.unknown.rawValue
    @State private var material = ""
    @State private var style = ""
    @State private var colour = ""
    @State private var categoryOriginal = SpecimenCategory.unknown.rawValue
    @State private var materialOriginal = ""
    @State private var styleOriginal = ""
    @State private var colourOriginal = ""
    @State private var confidence: [String: Double] = [:]

    var body: some View {
        RecognitionSheetLayout {
            RecognitionHeader(eyebrow: "From the photo · confirm or fix", title: "Review guesses",
                              onClose: { coordinator?.dismissSheet() })

            RecognitionCard {
                categoryRow
                textGuessRow(label: "Material", value: $material, key: "Material")
                textGuessRow(label: "Style", value: $style, key: "Style")
                textGuessRow(label: "Colour", value: $colour, key: "Colour")
            }

            HStack(spacing: 12) {
                RecognitionActionBar(
                    secondaryTitle: editAll ? "Collapse" : "Edit all",
                    primaryTitle: "Looks right",
                    onSecondary: { editAll.toggle() },
                    onPrimary: { accept() }
                )
                verbMenu
            }
            punchConfirm
            fieldWriteStatus
            Spacer(minLength: 0)
        }
        .accessibilityIdentifier(CaptureScreenID.n5SmartGuess.rawValue)
        .task {
            await loadGuess()
            await loadParties()
        }
    }

    // MARK: - The three verbs (FC-R7 · FC-R8 · ruling 1)

    /// The app's first overflow menu. It sits BESIDE "Looks right", never in
    /// place of it — accepting the guesses is still the primary act on this card.
    private var verbMenu: some View {
        Menu {
            if currentSpecimen()?.marginNoteId != nil {
                // Ruling 1: inside a placed visit the drain already filed it, so
                // this row is state, not an action. Offering the verb here would
                // either write a second note or do nothing, and both teach her
                // that the menu lies.
                Label("Filed in the Document.", systemImage: "checkmark")
                    .labelStyle(.titleAndIcon)
            } else {
                Button("Make it a note in the Document") { promoteToNote() }
            }
            if hasProject {
                Button("Make it a task") { makeTask() }
                if currentSpecimen()?.punchTaskState == .written {
                    // The lane re-opens for a deliberate second item, which is
                    // right — but silently, so the first filing had to be
                    // remembered rather than read. Same shape as the note
                    // branch's landed row, above.
                    Label(PunchCourtCopy.punchFiledMenuRow, systemImage: "checkmark")
                        .labelStyle(.titleAndIcon)
                }
                Button("Make it a punch item") { beginPunchItem() }
            } else {
                // Both writes need a project_id. Said plainly rather than shown
                // as a dead row. (Filing an unplaced note is FC-R6's Today flow,
                // not this card's.)
                Text("Put this on a project first.")
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(CaptureType.callout)
                .foregroundStyle(CaptureColor.inkSoft)
                .frame(width: 44, height: 44)
        }
    }

    @ViewBuilder
    private var punchConfirm: some View {
        if pendingPunch {
            VStack(alignment: .leading, spacing: 8) {
                // An INTENTION. The row is not written yet, and
                // fc_dispatch_task_assignment re-reads the party's real consent
                // when it is.
                Text(PunchCourtCopy.intent(for: court))
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
                Button("Add") { confirmPunchItem() }
                    .buttonStyle(RecognitionPrimaryButtonStyle())
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder
    private var fieldWriteStatus: some View {
        switch currentSpecimen()?.punchTaskState {
        case .refused:
            // Reports only. The degrade write already happened on the drain
            // (ruling 3), because this card may never be on screen when the
            // refusal arrives.
            statusLine(PunchCourtCopy.refusedTask)
        case .written:
            statusLine(PunchCourtCopy.filed(for: filedCourt))
        default:
            EmptyView()
        }
    }

    private func statusLine(_ text: String) -> some View {
        Text(text)
            .font(CaptureType.footnote)
            .foregroundStyle(CaptureColor.inkSoft)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// The court as the WRITTEN row records it, not as this session resolved it:
    /// the card can be reopened after a relaunch, long after `court` was set.
    private var filedCourt: PunchCourt {
        guard let specimen = currentSpecimen(),
              specimen.punchTaskOwnerRaw == "gc",
              let partyID = specimen.punchTaskPartyId,
              let party = parties.first(where: { $0.id == partyID })
        else { return .noCourt }
        return .reachable(party)
    }

    private var hasProject: Bool {
        currentSpecimen()?.venue?.projectId?.isEmpty == false
    }

    private func loadParties() async {
        guard let projectID = currentSpecimen()?.venue?.projectId,
              !projectID.isEmpty else { return }
        parties = (try? await siteRequests.fieldParties(projectID: projectID)) ?? []
    }

    /// Survives for exactly two cases (ruling 1): a capture with no visit — the
    /// walk-and-talk and the market-run note — and filing an unplaced note from
    /// Today (FC-R6). Inside a placed visit the branch above hides it, because
    /// the drain already did it.
    private func promoteToNote() {
        guard let specimen = currentSpecimen() else { return }
        specimen.requestMarginNote(noteID: UUID())
        try? store.save()
        analytics.event("N5.make-note", ["id": specimen.id.uuidString])
        enqueue(specimen.id)
    }

    private func makeTask() { requestPunch(owner: "designer", partyID: nil) }

    private func beginPunchItem() {
        court = PunchCourtResolver.resolve(parties: parties)
        pendingPunch = true
    }

    private func confirmPunchItem() {
        pendingPunch = false
        // Ruling 2: with no reachable GC this is written as HER task — which is
        // exactly what the intent line already told her would happen.
        switch court {
        case .reachable(let party): requestPunch(owner: "gc", partyID: party.id)
        case .noCourt:              requestPunch(owner: "designer", partyID: nil)
        }
    }

    private func requestPunch(owner: String, partyID: String?) {
        guard let specimen = currentSpecimen() else { return }
        specimen.requestPunchTask(taskID: UUID(), owner: owner, partyID: partyID)
        try? store.save()
        analytics.event("N5.make-task", ["owner": owner])
        enqueue(specimen.id)
    }

    private func enqueue(_ id: UUID) {
        Task { await sync.enqueue(id) }
    }

    // MARK: - Rows

    private var categoryRow: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text("Category")
                        .font(CaptureType.eyebrow).textCase(.uppercase)
                        .foregroundStyle(CaptureColor.inkSoft)
                    ProvenanceBadge(.smartGuess)
                    confidenceTag("Category")
                }
                Menu {
                    ForEach(SpecimenCategory.allCases, id: \.self) { c in
                        Button(c.rawValue.capitalized) { categoryRaw = c.rawValue }
                    }
                } label: {
                    HStack(spacing: 6) {
                        Text(SpecimenCategory(rawValue: categoryRaw)?.rawValue.capitalized ?? "Unknown")
                            .font(CaptureType.bodyEmph)
                            .foregroundStyle(CaptureColor.verdigrisInk)
                        Image(systemName: "chevron.down")
                            .font(CaptureType.footnote)
                            .foregroundStyle(CaptureColor.inkSoft)
                    }
                }
            }
            Spacer()
        }
        .padding(.vertical, 8)
        .overlay(alignment: .bottom) { Rectangle().fill(CaptureColor.line).frame(height: 1) }
    }

    @ViewBuilder
    private func textGuessRow(label: String, value: Binding<String>, key: String) -> some View {
        let isEditing = editAll || editing.contains(key)
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label)
                    .font(CaptureType.eyebrow).textCase(.uppercase)
                    .foregroundStyle(CaptureColor.inkSoft)
                ProvenanceBadge(.smartGuess)
                confidenceTag(key)
                Spacer()
            }
            if isEditing {
                TextField("—", text: value)
                    .font(CaptureType.body)
                    .foregroundStyle(CaptureColor.ink)
            } else {
                Button { editing.insert(key) } label: {
                    Text(value.wrappedValue.isEmpty ? "Tap to add" : value.wrappedValue)
                        .font(CaptureType.bodyEmph)
                        .foregroundStyle(value.wrappedValue.isEmpty ? CaptureColor.inkSoft : CaptureColor.verdigrisInk)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 8)
        .overlay(alignment: .bottom) { Rectangle().fill(CaptureColor.line).frame(height: 1) }
    }

    @ViewBuilder
    private func confidenceTag(_ key: String) -> some View {
        if let c = confidence[key], c > 0, c < 0.55 {
            Text("low")
                .font(CaptureType.eyebrow).textCase(.uppercase)
                .foregroundStyle(CaptureColor.terracotta)
        }
    }

    // MARK: - Load + apply

    private func loadGuess() async {
        guard !loaded, let sourceSpecimen = currentSpecimen() else { return }
        loaded = true
        analytics.screen("N5.smart-guess")

        let image = await RecognitionImageLoader.captureImage(
            for: sourceSpecimen,
            store: store,
            camera: camera)
        guard !Task.isCancelled, currentSpecimen() != nil else { return }

        let guess = await smartGuess.guess(image: image, ocr: [], codes: [])
        guard !Task.isCancelled, let specimen = currentSpecimen() else { return }

        categoryRaw = guess.category == .unknown ? specimen.categoryRaw : guess.category.rawValue
        confidence["Category"] = guess.categoryConfidence
        for field in guess.fields {
            switch field.key {
            case .material: material = field.value; confidence["Material"] = field.confidence
            case .colorway: colour = field.value; confidence["Colour"] = field.confidence
            default: break
            }
        }
        if material.isEmpty { material = specimen.materialNote ?? "" }
        if colour.isEmpty { colour = specimen.colorway ?? "" }
        style = specimen.styleTags.first ?? ""

        categoryOriginal = categoryRaw
        materialOriginal = material
        styleOriginal = style
        colourOriginal = colour

        applyAsGuess(specimen)
        try? store.save()
    }

    private func applyAsGuess(_ specimen: Specimen) {
        // setValue refuses to overwrite what a tag, a scan, a measure or she
        // already set. Never pin a confidence to a value we didn't write.
        if categoryRaw != SpecimenCategory.unknown.rawValue {
            specimen.setValue(categoryRaw, for: .category, source: .smartGuess)
            if specimen.provenance(for: .category) == .smartGuess {
                specimen.setConfidence(confidence["Category"] ?? 0, for: .category)
            }
        }
        if !material.isEmpty {
            specimen.setValue(material, for: .material, source: .smartGuess)
            if specimen.provenance(for: .material) == .smartGuess {
                specimen.setConfidence(confidence["Material"] ?? 0, for: .material)
            }
        }
        if !colour.isEmpty {
            specimen.setValue(colour, for: .colorway, source: .smartGuess)
            if specimen.provenance(for: .colorway) == .smartGuess {
                specimen.setConfidence(confidence["Colour"] ?? 0, for: .colorway)
            }
        }
        if !style.isEmpty, !specimen.styleTags.contains(style) {
            specimen.styleTags.append(style)
        }
    }

    // MARK: - Accept (promote to confirmed)

    private func accept() {
        guard let specimen = currentSpecimen() else { return }
        if categoryRaw != SpecimenCategory.unknown.rawValue {
            specimen.setValue(categoryRaw, for: .category, source: promotedSource(categoryRaw, categoryOriginal))
        }
        if !material.isEmpty {
            specimen.setValue(material, for: .material, source: promotedSource(material, materialOriginal))
        }
        if !colour.isEmpty {
            specimen.setValue(colour, for: .colorway, source: promotedSource(colour, colourOriginal))
        }
        // Style has no FieldKey — it lives in styleTags (no per-field provenance).
        if !style.isEmpty {
            if let stale = styleOriginal.isEmpty ? nil : specimen.styleTags.firstIndex(of: styleOriginal) {
                specimen.styleTags[stale] = style
            } else if !specimen.styleTags.contains(style) {
                specimen.styleTags.append(style)
            }
        }
        specimen.touch()
        try? store.save()
        analytics.event("N5.accept", ["category": categoryRaw])
        coordinator?.present(.specimenSheet(specimenID))
    }

    private func currentSpecimen() -> Specimen? {
        CaptureOwnerProjectionPolicy.specimen(
            id: specimenID,
            store: store,
            runsRealServices: AppConfiguration.runsRealServices,
            userID: session.userID,
            workspaceID: session.workspaceID)
    }

    /// Accepted unchanged → .manual (designer-confirmed); corrected → .edited.
    private func promotedSource(_ value: String, _ original: String) -> ProvenanceSource {
        value == original ? .manual : .edited
    }
}

#if DEBUG
import CaptureKitMocks

#Preview("N5 · Smart guess") {
    // swiftlint:disable:next force_try
    let store = try! CaptureStore.inMemory()
    let specimen = store.newDraft()
    return SmartGuessSheet(
        specimenID: specimen.id,
        store: store,
        session: MockSessionProviding(),
        camera: MockCameraService(),
        smartGuess: StubSmartGuessService(),
        analytics: MockCaptureAnalytics(),
        sync: InMemoryCaptureSyncService(),
        siteRequests: MockSiteRequestService(),
        coordinator: CaptureCoordinator()
    )
}
#endif
