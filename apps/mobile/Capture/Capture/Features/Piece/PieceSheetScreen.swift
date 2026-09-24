//  PieceSheetScreen.swift
//  Capture
//
//  C5 — the full editable piece record. A photo strip (primary marked, near-
//  dup flagged) over every field rendered through the shared PieceFieldRow
//  with its ProvenanceBadge, so the designer can see and correct how each value
//  was obtained. Edits flow through `setValue` (provenance → manual/edited, N5
//  protected). Save commits & routes (S3); Re-shoot returns to the viewfinder.

import SwiftUI
import CaptureKit
import PatinaDesignKit
#if canImport(UIKit)
import UIKit
#endif

struct PieceSheetScreen: View {
    let store: CaptureStore
    let coordinator: CaptureCoordinator
    let piece: Piece      // @Model — Observation tracks the fields read in body

    @Environment(\.dismiss) private var dismiss
    @State private var showMoreDetails = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    PiecePhotoStrip(store: store, piece: piece)
                    placement
                    fields
                    enrichmentActions
                    actions
                }
                .padding(20)
            }
            .background(CaptureColor.paper.ignoresSafeArea())
            .navigationTitle("Piece")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") { dismiss() }
                        .font(CaptureType.body)
                        .tint(CaptureColor.inkSoft)
                }
            }
        }
        .presentationDragIndicator(.visible)
        .onDisappear { try? store.save() }
        .accessibilityIdentifier(CaptureScreenID.c5PieceSheet.rawValue)
    }

    // MARK: Placement

    /// The same line C3 shows, read-only here: C5 is where she corrects the
    /// RECORD, so placement is reported rather than edited in place, and
    /// *Change* takes her to the same door the card does.
    private var placement: some View {
        HStack(spacing: 8) {
            Text(FieldPlacementLine.text(for: piece))
                .font(CaptureType.footnote)
                .foregroundStyle(FieldPlacementLine.isUnplaced(piece)
                                 ? CaptureColor.terracotta : CaptureColor.inkSoft)
            Spacer(minLength: 8)
            Button("Change") { coordinator.present(.visit) }
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.verdigrisInk)
                .frame(minHeight: 44)
        }
        .accessibilityIdentifier("c5.placement")
    }

    // MARK: Fields

    private var fields: some View {
        VStack(alignment: .leading, spacing: 0) {
            PieceFieldRow("Title", value: scalarBinding(.title) { piece.title },
                             source: piece.provenance(for: .title),
                             placeholder: "Name this piece")
            PieceFieldRow("Maker", value: scalarBinding(.maker) { piece.maker },
                             source: piece.provenance(for: .maker),
                             placeholder: "Vendor / brand")
            PieceFieldRow("Material", value: scalarBinding(.material) { piece.materialNote },
                             source: piece.provenance(for: .material),
                             confirmed: piece.isConfirmed(.material))

            DisclosureGroup(isExpanded: $showMoreDetails) {
                VStack(spacing: 0) {
                    PieceFieldRow("SKU", value: scalarBinding(.sku) { piece.sku },
                                     source: piece.provenance(for: .sku))
                    PieceFieldRow("Colorway", value: scalarBinding(.colorway) { piece.colorway },
                                     source: piece.provenance(for: .colorway),
                                     confirmed: piece.isConfirmed(.colorway))
                    PieceFieldRow("Finish", value: finishBinding,
                                     source: .manual)
                    PieceFieldRow("Trade price", value: priceBinding,
                                     source: piece.provenance(for: .price))
                    PieceFieldRow("Dimensions", value: dimensionsBinding,
                                     source: piece.provenance(for: .dimensions),
                                     placeholder: "Add in Measure")
                    PieceFieldRow("Source", value: scalarBinding(.sourceURL) { piece.sourceURL },
                                     source: piece.provenance(for: .sourceURL),
                                     placeholder: "Website or showroom")
                    PieceFieldRow("Notes", value: scalarBinding(.note) { piece.note },
                                     source: piece.provenance(for: .note))
                    if hasVoiceNote {
                        PieceFieldRow("Voice note", value: voiceBinding, source: .voice,
                                         placeholder: "Transcript")
                    }
                }
            } label: {
                HStack {
                    Text("More details")
                        .font(CaptureType.bodyEmph)
                        .foregroundStyle(CaptureColor.ink)
                    Spacer()
                    Text(detailSummary)
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.inkSoft)
                }
                .padding(.vertical, 14)
            }
            .tint(CaptureColor.verdigris)
        }
    }

    private var enrichmentActions: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Add what matters")
                .font(CaptureType.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(CaptureColor.inkSoft)
            HStack(spacing: 8) {
                enrichmentButton("Tag", icon: "text.viewfinder", sheet: .ocr(piece.id))
                enrichmentButton("Code", icon: "barcode.viewfinder", sheet: .code(piece.id))
                enrichmentButton("Measure", icon: "ruler", sheet: .measure(piece.id))
                enrichmentButton("Voice", icon: "waveform", sheet: .voice(piece.id))
            }
        }
    }

    private func enrichmentButton(
        _ title: String,
        icon: String,
        sheet: CaptureSheet
    ) -> some View {
        Button {
            try? store.save()
            coordinator.present(sheet)
        } label: {
            VStack(spacing: 6) {
                Image(systemName: icon)
                Text(title)
                    .font(CaptureType.footnote)
            }
            .foregroundStyle(CaptureColor.ink)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 11)
            .background(CaptureColor.paper2, in: RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }

    // MARK: Actions

    private var actions: some View {
        HStack(spacing: 12) {
            PatinaButton("Re-shoot", style: .secondary,
                         icon: Image(systemName: "camera.rotate"), action: reshoot)
            PatinaButton("Save", style: .clay,
                         icon: Image(systemName: "checkmark"), action: save)
        }
        .padding(.top, 6)
    }

    private func save() {
        piece.status = .ready
        try? store.save()
        CaptureHaptics.success()
        coordinator.present(.destination(piece.id))      // S3 route & save
    }

    private func reshoot() {
        // Return to the viewfinder to add another angle.
        coordinator.dismissSheet()
    }

    // MARK: Bindings (every write goes through setValue for provenance)

    private func scalarBinding(_ key: FieldKey, get: @escaping () -> String?) -> Binding<String> {
        Binding(
            get: { get() ?? "" },
            set: { newValue in
                let trimmed = newValue.isEmpty ? nil : newValue
                piece.setValue(trimmed, for: key, source: editSource(key))
            }
        )
    }

    private var priceBinding: Binding<String> {
        Binding(
            get: { piece.priceTradeCents.map { String(format: "%.2f", Double($0) / 100) } ?? "" },
            set: { newValue in
                if newValue.isEmpty {
                    piece.setValue(nil, for: .price, source: editSource(.price))
                } else if let dollars = Double(newValue.filter { $0.isNumber || $0 == "." }) {
                    let cents = Int((dollars * 100).rounded())
                    piece.setValue(String(cents), for: .price, source: editSource(.price))
                }
            }
        )
    }

    private var finishBinding: Binding<String> {
        Binding(
            get: { piece.finish ?? "" },
            set: {
                piece.finish = $0.isEmpty ? nil : $0
                piece.touch()
            }
        )
    }

    // Display-only: measurements are authored in Measure (N3, Team C).
    private var dimensionsBinding: Binding<String> {
        Binding(get: { Self.dimensionString(piece.measurements) }, set: { _ in })
    }

    private var voiceBinding: Binding<String> {
        Binding(
            get: { piece.voiceTranscript ?? piece.voicePartialTranscript ?? "" },
            set: { newValue in
                piece.voiceTranscript = newValue.isEmpty ? nil : newValue
                piece.touch()
            }
        )
    }

    private var hasVoiceNote: Bool {
        piece.voiceTranscript != nil || piece.voicePartialTranscript != nil
    }

    private var detailSummary: String {
        var count = 0
        if !(piece.sku ?? "").isEmpty { count += 1 }
        if !(piece.colorway ?? "").isEmpty { count += 1 }
        if !(piece.finish ?? "").isEmpty { count += 1 }
        if piece.priceTradeCents != nil { count += 1 }
        if !piece.measurements.isEmpty { count += 1 }
        if !(piece.sourceURL ?? "").isEmpty { count += 1 }
        if !(piece.note ?? "").isEmpty { count += 1 }
        return count == 0 ? "Optional" : "\(count) added"
    }

    /// A recognised/measured value the designer changes is "edited"; an empty or
    /// already-manual field stays "manual".
    private func editSource(_ key: FieldKey) -> ProvenanceSource {
        switch piece.provenance(for: key) {
        case .none, .manual: return .manual
        default: return .edited
        }
    }

    static func dimensionString(_ measurements: [CaptureMeasurement]) -> String {
        guard !measurements.isEmpty else { return "" }
        func inches(_ mm: Double) -> String { String(format: "%.0f", mm / 25.4) }
        let byAxis = Dictionary(grouping: measurements, by: { $0.axisRaw })
        let order: [MeasurementAxis] = [.width, .depth, .height, .diagonal, .custom]
        let parts = order.compactMap { axis in byAxis[axis.rawValue]?.first.map { inches($0.millimeters) } }
        return parts.isEmpty ? "" : parts.joined(separator: " × ") + " in"
    }
}

// MARK: - Photo strip

struct PiecePhotoStrip: View {
    let store: CaptureStore
    let piece: Piece

    private var photos: [CapturePhoto] { piece.photos.sorted { $0.order < $1.order } }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("\(photos.count) \(photos.count == 1 ? "photo" : "photos")")
                .font(CaptureType.eyebrow).textCase(.uppercase)
                .foregroundStyle(CaptureColor.inkSoft)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    if photos.isEmpty {
                        PiecePhotoThumb(store: store, photo: nil)
                    } else {
                        ForEach(photos, id: \.id) { photo in
                            PiecePhotoThumb(store: store, photo: photo)
                        }
                    }
                }
            }
        }
    }
}

struct PiecePhotoThumb: View {
    let store: CaptureStore
    let photo: CapturePhoto?

    var body: some View {
        ZStack(alignment: .topLeading) {
            image
                .frame(width: 76, height: 92)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(CaptureColor.line, lineWidth: 1))

            if let photo, photo.isPrimary {
                tag("PRIMARY", color: CaptureColor.verdigris)
            } else if let photo, photo.isDuplicate {
                tag("DUP", color: CaptureColor.terracotta)
            }
        }
        .accessibilityLabel(accessibilityLabel)
    }

    @ViewBuilder private var image: some View {
        if let loaded {
            Image(uiImage: loaded).resizable().scaledToFill()
        } else {
            ZStack {
                CaptureColor.paper2
                Image(systemName: "photo")
                    .font(CaptureType.title)
                    .foregroundStyle(CaptureColor.inkSoft.opacity(0.5))
            }
        }
    }

    private var loaded: UIImage? {
        guard let photo else { return nil }
        let url = store.mediaURL(for: photo.thumbnailFilename ?? photo.filename)
        return UIImage(contentsOfFile: url.path)
    }

    private func tag(_ text: String, color: Color) -> some View {
        Text(text)
            .font(CaptureType.eyebrow)
            .foregroundStyle(CaptureColor.paper3)
            .padding(.horizontal, 5).padding(.vertical, 2)
            .background(color, in: RoundedRectangle(cornerRadius: 4))
            .padding(5)
    }

    private var accessibilityLabel: String {
        guard let photo else { return "No photos yet" }
        if photo.isPrimary { return "Primary photo" }
        if photo.isDuplicate { return "Photo, flagged as a near-duplicate" }
        return "Photo"
    }
}

// MARK: - Missing piece fallback (registry resolves a bad/expired id)

struct PieceMissingView: View {
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "doc.questionmark")
                .font(CaptureType.display)
                .foregroundStyle(CaptureColor.inkSoft)
            Text("That piece is no longer here.")
                .font(CaptureType.body)
                .foregroundStyle(CaptureColor.ink)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(CaptureColor.paper.ignoresSafeArea())
        .accessibilityIdentifier(CaptureScreenID.c5PieceSheet.rawValue)
    }
}

#Preview("Piece sheet") {
    let container = AppContainer()
    let store = container.store
    let piece = store.newDraft()
    piece.setValue("Lina Lounge Chair", for: .title, source: .manual)
    piece.setValue("Holloway & Co.", for: .maker, source: .ocr)
    piece.setValue("LQ-3S-OAK", for: .sku, source: .ocr)
    piece.setValue("Bone bouclé", for: .colorway, source: .smartGuess)
    piece.setValue("Oak / bouclé", for: .material, source: .smartGuess)
    piece.setValue("312000", for: .price, source: .ocr)        // cents → $3,120.00
    piece.category = .seating
    piece.voiceTranscript = "Oak base, the warmer bouclé, rep is Dana."
    piece.provenanceRaw[FieldKey.note.rawValue] = ProvenanceSource.voice.rawValue
    piece.addMeasurement(axis: .width, millimeters: 813, source: .arkit)
    piece.addMeasurement(axis: .depth, millimeters: 762, source: .arkit)
    piece.addMeasurement(axis: .height, millimeters: 864, source: .arkit)
    let primary = CapturePhoto(filename: "p1.heic", isPrimary: true, order: 0)
    primary.piece = piece; piece.photos.append(primary)
    let side = CapturePhoto(filename: "p2.heic", order: 1)
    side.piece = piece; piece.photos.append(side)
    return PieceSheetScreen(store: store, coordinator: CaptureCoordinator(), piece: piece)
}
