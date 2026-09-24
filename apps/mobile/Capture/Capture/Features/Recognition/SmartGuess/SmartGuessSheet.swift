//  SmartGuessSheet.swift
//  Capture
//
//  N5 · Smart field guess. After capture an on-device vision model proposes
//  category, material, style and colour. Every value is a labelled "guess" the
//  designer confirms or corrects — never silently trusted. "Looks right" confirms
//  every shown field (`Piece.acceptReview`): an unchanged guess keeps its
//  .smartGuess origin, a corrected one becomes .edited and keeps the guess as
//  its proposal; tapping a guess opens just that field; "Edit all" opens them all.
//  Guesses never overwrite a value a tag/scan/measure/human already set.

import SwiftUI
import CaptureKit

struct SmartGuessSheet: View {
    let pieceID: UUID
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
    /// The party fetch has come back. N5 has the same race the card has: an
    /// unloaded list resolves `.noCourt`, which reads as "no GC on this
    /// project" rather than "not asked yet".
    @State private var partiesSettled = false
    /// The three verbs now live in CaptureKit so the C3 card can mount the same
    /// menu (I-4). This screen keeps its presenter — the screenshot harness's
    /// deep link — and renders the shared component.
    @State private var verbMenu = FieldVerbMenu()

    // Working values + the original guesses (to tell a correction from an accept).
    @State private var categoryRaw = PieceCategory.unknown.rawValue
    @State private var material = ""
    @State private var style = ""
    @State private var colour = ""
    @State private var categoryOriginal = PieceCategory.unknown.rawValue
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
                FieldVerbOverflowMenu(menu: $verbMenu, facts: verbFacts,
                                      parties: parties, idPrefix: "n5.",
                                      onAction: performVerb)
            }
            FieldVerbNotice(menu: $verbMenu, facts: verbFacts,
                            parties: parties, idPrefix: "n5.",
                            onAction: performVerb)
            Spacer(minLength: 0)
        }
        .accessibilityIdentifier(CaptureScreenID.n5SmartGuess.rawValue)
        .task {
            await loadGuess()
            await loadParties()
        }
    }

    // MARK: - The three verbs (FC-R7 · FC-R8 · ruling 1)

    private var verbFacts: FieldVerbFacts {
        guard let piece = currentPiece() else {
            return FieldVerbFacts(hasProject: false)
        }
        return FieldVerbFacts(piece: piece, partiesSettled: partiesSettled)
    }

    /// Survives for exactly two cases (ruling 1): a capture with no visit — the
    /// walk-and-talk and the market-run note — and filing an unplaced note from
    /// Today (FC-R6). Inside a placed visit the menu's filed row replaces the
    /// verb, because the drain already did it.
    private func performVerb(_ action: FieldVerbAction) {
        guard let piece = currentPiece() else { return }
        switch action {
        case .note:
            piece.requestMarginNote(noteID: UUID())
            analytics.event("N5.make-note", ["id": piece.id.uuidString])
        case .punchTask(let owner, let partyID, let intent):
            piece.requestPunchTask(taskID: UUID(), owner: owner, partyID: partyID)
            analytics.event("N5.make-task", ["owner": owner, "verb": intent.rawValue])
        }
        try? store.save()
        enqueue(piece.id)
    }

    private func loadParties() async {
        guard let projectID = currentPiece()?.venue?.projectId,
              !projectID.isEmpty else { partiesSettled = true; return }
        parties = (try? await siteRequests.fieldParties(projectID: projectID)) ?? []
        partiesSettled = true
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
                    ForEach(PieceCategory.allCases, id: \.self) { c in
                        Button(c.rawValue.capitalized) { categoryRaw = c.rawValue }
                    }
                } label: {
                    HStack(spacing: 6) {
                        Text(PieceCategory(rawValue: categoryRaw)?.rawValue.capitalized ?? "Unknown")
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
        guard !loaded, let sourcePiece = currentPiece() else { return }
        loaded = true
        analytics.screen("N5.smart-guess")

        let image = await RecognitionImageLoader.captureImage(
            for: sourcePiece,
            store: store,
            camera: camera)
        guard !Task.isCancelled, currentPiece() != nil else { return }

        let guess = await smartGuess.guess(image: image, ocr: [], codes: [])
        guard !Task.isCancelled, let piece = currentPiece() else { return }

        categoryRaw = guess.category == .unknown ? piece.categoryRaw : guess.category.rawValue
        confidence["Category"] = guess.categoryConfidence
        for field in guess.fields {
            switch field.key {
            case .material: material = field.value; confidence["Material"] = field.confidence
            case .colorway: colour = field.value; confidence["Colour"] = field.confidence
            default: break
            }
        }
        if material.isEmpty { material = piece.materialNote ?? "" }
        if colour.isEmpty { colour = piece.colorway ?? "" }
        style = piece.styleTags.first ?? ""

        categoryOriginal = categoryRaw
        materialOriginal = material
        styleOriginal = style
        colourOriginal = colour

        applyAsGuess(piece)
        try? store.save()
    }

    private func applyAsGuess(_ piece: Piece) {
        // setValue refuses to overwrite what a tag, a scan, a measure or she
        // already set. Never pin a confidence to a value we didn't write.
        if categoryRaw != PieceCategory.unknown.rawValue {
            piece.setValue(categoryRaw, for: .category, source: .smartGuess)
            if piece.provenance(for: .category) == .smartGuess {
                piece.setConfidence(confidence["Category"] ?? 0, for: .category)
            }
        }
        if !material.isEmpty {
            piece.setValue(material, for: .material, source: .smartGuess)
            if piece.provenance(for: .material) == .smartGuess {
                piece.setConfidence(confidence["Material"] ?? 0, for: .material)
            }
        }
        if !colour.isEmpty {
            piece.setValue(colour, for: .colorway, source: .smartGuess)
            if piece.provenance(for: .colorway) == .smartGuess {
                piece.setConfidence(confidence["Colour"] ?? 0, for: .colorway)
            }
        }
        if !style.isEmpty, !piece.styleTags.contains(style) {
            piece.styleTags.append(style)
        }
    }

    // MARK: - Accept (promote to confirmed)

    private func accept() {
        guard let piece = currentPiece() else { return }
        var reviews: [GuessReview] = []
        if categoryRaw != PieceCategory.unknown.rawValue {
            reviews.append(GuessReview(key: .category, value: categoryRaw, proposed: categoryOriginal))
        }
        if !material.isEmpty {
            reviews.append(GuessReview(key: .material, value: material, proposed: materialOriginal))
        }
        if !colour.isEmpty {
            reviews.append(GuessReview(key: .colorway, value: colour, proposed: colourOriginal))
        }
        piece.acceptReview(reviews, by: session.userID)
        // Style has no FieldKey — it lives in styleTags (no per-field provenance).
        if !style.isEmpty {
            if let stale = styleOriginal.isEmpty ? nil : piece.styleTags.firstIndex(of: styleOriginal) {
                piece.styleTags[stale] = style
            } else if !piece.styleTags.contains(style) {
                piece.styleTags.append(style)
            }
        }
        piece.touch()
        try? store.save()
        analytics.event("N5.accept", ["category": categoryRaw])
        coordinator?.present(.pieceSheet(pieceID))
    }

    private func currentPiece() -> Piece? {
        CaptureOwnerProjectionPolicy.piece(
            id: pieceID,
            store: store,
            runsRealServices: AppConfiguration.runsRealServices,
            userID: session.userID,
            workspaceID: session.workspaceID)
    }
}

#if DEBUG
import CaptureKitMocks

#Preview("N5 · Smart guess") {
    // swiftlint:disable:next force_try
    let store = try! CaptureStore.inMemory()
    let piece = store.newDraft()
    return SmartGuessSheet(
        pieceID: piece.id,
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
