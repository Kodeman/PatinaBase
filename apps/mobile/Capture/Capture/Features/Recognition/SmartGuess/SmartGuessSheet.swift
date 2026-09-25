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
//
//  The frame's OCR and the piece's scanned codes feed the guess, and every
//  row shows what the piece holds after the write, never the sheet's own guess
//  (`SmartGuessApplication`, CaptureKit). A refused guess is marked
//  "not applied" beside the value that stayed.

import SwiftUI
import CaptureKit

struct SmartGuessSheet: View {
    let pieceID: UUID
    let store: CaptureStore
    let session: any SessionProviding
    let camera: any CameraService
    let smartGuess: any SmartGuessService
    /// N1's reader and N2's parser, the same ones those sheets are built with.
    var ocr: any TagOCRService = VisionTagOCRService()
    var codeService: any CodeScanService = DataScannerCodeService()
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

    // Working values + what the piece held when shown (to tell a correction
    // from an accept). Both start from the piece, read back after the write.
    @State private var values: [FieldKey: String] = [:]
    @State private var originals: [FieldKey: String] = [:]
    @State private var origins: [FieldKey: ProvenanceSource] = [:]
    @State private var confirmedKeys: Set<FieldKey> = []
    @State private var results: [FieldKey: SmartGuessFieldResult] = [:]
    @State private var style = ""
    @State private var styleOriginal = ""

    /// Category, material and colour always show; a maker or SKU only when
    /// this pass read one off the tag or the code.
    private var shownKeys: [FieldKey] { Self.shownKeys(results) }

    private static func shownKeys(_ results: [FieldKey: SmartGuessFieldResult]) -> [FieldKey] {
        [.category, .material, .colorway] + [FieldKey.maker, .sku].filter { results[$0] != nil }
    }

    var body: some View {
        RecognitionSheetLayout {
            RecognitionHeader(eyebrow: "From the photo · confirm or fix", title: "Review guesses",
                              onClose: { coordinator?.dismissSheet() })

            RecognitionCard {
                categoryRow
                textGuessRow(label: "Material", value: binding(.material), id: FieldKey.material.rawValue,
                             field: .material)
                textGuessRow(label: "Style", value: $style, id: "style", field: nil)
                textGuessRow(label: "Colour", value: binding(.colorway), id: FieldKey.colorway.rawValue,
                             field: .colorway)
                if results[.maker] != nil {
                    textGuessRow(label: "Maker", value: binding(.maker), id: FieldKey.maker.rawValue,
                                 field: .maker)
                }
                if results[.sku] != nil {
                    textGuessRow(label: "SKU", value: binding(.sku), id: FieldKey.sku.rawValue, field: .sku)
                }
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
                rowHeader("Category", field: .category)
                Menu {
                    ForEach(PieceCategory.allCases, id: \.self) { c in
                        Button(c.rawValue.capitalized) { values[.category] = c.rawValue }
                    }
                } label: {
                    HStack(spacing: 6) {
                        Text(PieceCategory(rawValue: values[.category] ?? "")?.rawValue.capitalized ?? "Unknown")
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
    private func textGuessRow(label: String, value: Binding<String>, id: String, field: FieldKey?) -> some View {
        let isEditing = editAll || editing.contains(id)
        VStack(alignment: .leading, spacing: 4) {
            rowHeader(label, field: field)
            if isEditing {
                TextField("—", text: value)
                    .font(CaptureType.body)
                    .foregroundStyle(CaptureColor.ink)
            } else {
                Button { editing.insert(id) } label: {
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

    /// The label, the persisted field's own origin, and what became of this
    /// pass's guess for it. Style has no FieldKey, so no origin of its own.
    private func rowHeader(_ label: String, field: FieldKey?) -> some View {
        HStack {
            Text(label)
                .font(CaptureType.eyebrow).textCase(.uppercase)
                .foregroundStyle(CaptureColor.inkSoft)
            ProvenanceBadge(field.flatMap { origins[$0] } ?? .smartGuess,
                            confirmed: field.map { confirmedKeys.contains($0) } ?? false)
            if let field { guessTag(field) }
            Spacer()
        }
    }

    @ViewBuilder
    private func guessTag(_ key: FieldKey) -> some View {
        if let result = results[key] {
            if !result.isApplied {
                Text("not applied")
                    .font(CaptureType.eyebrow).textCase(.uppercase)
                    .foregroundStyle(CaptureColor.inkSoft)
            } else if result.confidence > 0, result.confidence < 0.55 {
                Text("low")
                    .font(CaptureType.eyebrow).textCase(.uppercase)
                    .foregroundStyle(CaptureColor.terracotta)
            }
        }
    }

    private func binding(_ key: FieldKey) -> Binding<String> {
        Binding(get: { values[key] ?? "" }, set: { values[key] = $0 })
    }

    // MARK: - Load + apply

    private func loadGuess() async {
        guard !loaded, let sourcePiece = currentPiece() else { return }
        loaded = true
        analytics.screen("N5.smart-guess")
        let codeTags = sourcePiece.scannedCodes

        let image = await RecognitionImageLoader.captureImage(
            for: sourcePiece,
            store: store,
            camera: camera)
        guard !Task.isCancelled, currentPiece() != nil else { return }

        let observed = await SmartGuessApplication(ocr: ocr, codes: codeService, smartGuess: smartGuess)
            .observe(image: image, scannedCodeTags: codeTags)
        guard !Task.isCancelled, let piece = currentPiece() else { return }

        let applied = SmartGuessApplication.apply(observed.suggestions, to: piece)
        try? store.save()
        showPersisted(piece, keys: Self.shownKeys(applied))
        results = applied
    }

    /// Every row starts from what the piece holds now, applied or refused.
    private func showPersisted(_ piece: Piece, keys: [FieldKey]) {
        var persisted: [FieldKey: String] = [:]
        for key in keys {
            persisted[key] = piece.fieldValue(for: key) ?? ""
            origins[key] = piece.provenance(for: key)
            if piece.isConfirmed(key) { confirmedKeys.insert(key) }
        }
        values = persisted
        originals = persisted
        style = piece.styleTags.first ?? ""
        styleOriginal = style
    }

    // MARK: - Accept (promote to confirmed)

    private func accept() {
        guard let piece = currentPiece() else { return }
        let reviews: [GuessReview] = shownKeys.compactMap { key in
            guard let value = values[key], !value.isEmpty,
                  value != PieceCategory.unknown.rawValue || key != .category else { return nil }
            return GuessReview(key: key, value: value, proposed: originals[key] ?? "")
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
        analytics.event("N5.accept", ["category": values[.category] ?? PieceCategory.unknown.rawValue])
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
        ocr: MockTagOCRService(),
        codeService: MockCodeScanService(),
        analytics: MockCaptureAnalytics(),
        sync: InMemoryCaptureSyncService(),
        siteRequests: MockSiteRequestService(),
        coordinator: CaptureCoordinator()
    )
}
#endif
