//  SpecimenSheetScreen.swift
//  Capture
//
//  C5 — the full editable specimen record. A photo strip (primary marked, near-
//  dup flagged) over every field rendered through the shared SpecimenFieldRow
//  with its ProvenanceBadge, so the designer can see and correct how each value
//  was obtained. Edits flow through `setValue` (provenance → manual/edited, N5
//  protected). Save commits & routes (S3); Re-shoot returns to the viewfinder.

import SwiftUI
import CaptureKit
#if canImport(UIKit)
import UIKit
#endif

struct SpecimenSheetScreen: View {
    let store: CaptureStore
    let coordinator: CaptureCoordinator
    let specimen: Specimen      // @Model — Observation tracks the fields read in body

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    SpecimenPhotoStrip(store: store, specimen: specimen)
                    fields
                    actions
                }
                .padding(20)
            }
            .background(CaptureColor.paper.ignoresSafeArea())
            .navigationTitle("Specimen")
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
        .accessibilityIdentifier(CaptureScreenID.c5SpecimenSheet.rawValue)
    }

    // MARK: Fields

    private var fields: some View {
        VStack(alignment: .leading, spacing: 0) {
            SpecimenFieldRow("Title", value: scalarBinding(.title) { specimen.title },
                             source: specimen.provenance(for: .title),
                             placeholder: "Name this piece")
            SpecimenFieldRow("Maker", value: scalarBinding(.maker) { specimen.maker },
                             source: specimen.provenance(for: .maker),
                             placeholder: "Vendor / brand")
            SpecimenFieldRow("SKU", value: scalarBinding(.sku) { specimen.sku },
                             source: specimen.provenance(for: .sku))
            SpecimenFieldRow("Colorway", value: scalarBinding(.colorway) { specimen.colorway },
                             source: specimen.provenance(for: .colorway))
            SpecimenFieldRow("Material", value: scalarBinding(.material) { specimen.materialNote },
                             source: specimen.provenance(for: .material))
            SpecimenFieldRow("Trade price", value: priceBinding,
                             source: specimen.provenance(for: .price))
            SpecimenFieldRow("Dimensions", value: dimensionsBinding,
                             source: specimen.provenance(for: .dimensions),
                             placeholder: "Add in Measure")
            if hasVoiceNote {
                SpecimenFieldRow("Voice note", value: voiceBinding, source: .voice,
                                 placeholder: "Transcript")
            }
        }
    }

    // MARK: Actions

    private var actions: some View {
        HStack(spacing: 12) {
            Button(action: reshoot) {
                Label("Re-shoot", systemImage: "camera.rotate")
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.rust)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(CaptureColor.rust.opacity(0.5), lineWidth: 1))
            }
            Button(action: save) {
                Label("Save", systemImage: "checkmark")
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.paper3)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(CaptureColor.verdigris, in: RoundedRectangle(cornerRadius: 12))
            }
        }
        .padding(.top, 6)
    }

    private func save() {
        specimen.status = .ready
        try? store.save()
        CaptureHaptics.success()
        coordinator.present(.destination(specimen.id))      // S3 route & save
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
                specimen.setValue(trimmed, for: key, source: editSource(key))
            }
        )
    }

    private var priceBinding: Binding<String> {
        Binding(
            get: { specimen.priceTradeCents.map { String(format: "%.2f", Double($0) / 100) } ?? "" },
            set: { newValue in
                if newValue.isEmpty {
                    specimen.setValue(nil, for: .price, source: editSource(.price))
                } else if let dollars = Double(newValue.filter { $0.isNumber || $0 == "." }) {
                    let cents = Int((dollars * 100).rounded())
                    specimen.setValue(String(cents), for: .price, source: editSource(.price))
                }
            }
        )
    }

    // Display-only: measurements are authored in Measure (N3, Team C).
    private var dimensionsBinding: Binding<String> {
        Binding(get: { Self.dimensionString(specimen.measurements) }, set: { _ in })
    }

    private var voiceBinding: Binding<String> {
        Binding(
            get: { specimen.voiceTranscript ?? specimen.voicePartialTranscript ?? "" },
            set: { newValue in
                specimen.voiceTranscript = newValue.isEmpty ? nil : newValue
                specimen.touch()
            }
        )
    }

    private var hasVoiceNote: Bool {
        specimen.voiceTranscript != nil || specimen.voicePartialTranscript != nil
    }

    /// A recognised/measured value the designer changes is "edited"; an empty or
    /// already-manual field stays "manual".
    private func editSource(_ key: FieldKey) -> ProvenanceSource {
        switch specimen.provenance(for: key) {
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

struct SpecimenPhotoStrip: View {
    let store: CaptureStore
    let specimen: Specimen

    private var photos: [CapturePhoto] { specimen.photos.sorted { $0.order < $1.order } }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("\(photos.count) \(photos.count == 1 ? "photo" : "photos")")
                .font(CaptureType.eyebrow).textCase(.uppercase)
                .foregroundStyle(CaptureColor.inkSoft)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    if photos.isEmpty {
                        SpecimenPhotoThumb(store: store, photo: nil)
                    } else {
                        ForEach(photos, id: \.id) { photo in
                            SpecimenPhotoThumb(store: store, photo: photo)
                        }
                    }
                }
            }
        }
    }
}

struct SpecimenPhotoThumb: View {
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
                tag("DUP", color: CaptureColor.rust)
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

// MARK: - Missing specimen fallback (registry resolves a bad/expired id)

struct SpecimenMissingView: View {
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "doc.questionmark")
                .font(CaptureType.display)
                .foregroundStyle(CaptureColor.inkSoft)
            Text("That specimen is no longer here.")
                .font(CaptureType.body)
                .foregroundStyle(CaptureColor.ink)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(CaptureColor.paper.ignoresSafeArea())
        .accessibilityIdentifier(CaptureScreenID.c5SpecimenSheet.rawValue)
    }
}

#Preview("Specimen sheet") {
    let container = AppContainer()
    let store = container.store
    let specimen = store.newDraft()
    specimen.setValue("Lina Lounge Chair", for: .title, source: .manual)
    specimen.setValue("Holloway & Co.", for: .maker, source: .ocr)
    specimen.setValue("LQ-3S-OAK", for: .sku, source: .ocr)
    specimen.setValue("Bone bouclé", for: .colorway, source: .smartGuess)
    specimen.setValue("Oak / bouclé", for: .material, source: .smartGuess)
    specimen.setValue("312000", for: .price, source: .ocr)        // cents → $3,120.00
    specimen.category = .seating
    specimen.voiceTranscript = "Oak base, the warmer bouclé, rep is Dana."
    specimen.provenanceRaw[FieldKey.note.rawValue] = ProvenanceSource.voice.rawValue
    specimen.addMeasurement(axis: .width, millimeters: 813, source: .arkit)
    specimen.addMeasurement(axis: .depth, millimeters: 762, source: .arkit)
    specimen.addMeasurement(axis: .height, millimeters: 864, source: .arkit)
    let primary = CapturePhoto(filename: "p1.heic", isPrimary: true, order: 0)
    primary.specimen = specimen; specimen.photos.append(primary)
    let side = CapturePhoto(filename: "p2.heic", order: 1)
    side.specimen = specimen; specimen.photos.append(side)
    return SpecimenSheetScreen(store: store, coordinator: CaptureCoordinator(), specimen: specimen)
}
