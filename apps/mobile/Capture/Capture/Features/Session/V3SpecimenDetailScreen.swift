//  V3SpecimenDetailScreen.swift
//  Capture
//
//  V3 · Capture detail / edit. The full specimen record — all angles, every field
//  with its provenance badge (AR-measured, tag-read, smart-guess, voice), each
//  editable. Editing a recognised/measured value re-badges it "edited" to preserve
//  the audit trail. "Re-shoot" jumps back to the viewfinder; "Save changes"
//  persists through the sanctioned setValue mutation path.

import Foundation
import SwiftUI
import CaptureKit

struct V3SpecimenDetailScreen: View {
    let specimen: Specimen?
    let store: CaptureStore
    let coordinator: CaptureCoordinator

    var body: some View {
        Group {
            if let specimen {
                V3Content(specimen: specimen, store: store, coordinator: coordinator)
            } else {
                RouteMissingSpecimen()
            }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier(CaptureScreenID.v3Detail.rawValue)
    }
}

private struct V3Content: View {
    let specimen: Specimen
    let store: CaptureStore
    let coordinator: CaptureCoordinator

    @State private var title: String
    @State private var maker: String
    @State private var sku: String
    @State private var colorway: String
    @State private var material: String
    @State private var priceText: String
    @State private var note: String
    @State private var saved = false

    init(specimen: Specimen, store: CaptureStore, coordinator: CaptureCoordinator) {
        self.specimen = specimen
        self.store = store
        self.coordinator = coordinator
        _title = State(initialValue: specimen.title ?? "")
        _maker = State(initialValue: specimen.maker ?? "")
        _sku = State(initialValue: specimen.sku ?? "")
        _colorway = State(initialValue: specimen.colorway ?? "")
        _material = State(initialValue: specimen.materialNote ?? "")
        _priceText = State(initialValue: RouteFormat.editablePrice(specimen.priceTradeCents))
        _note = State(initialValue: specimen.note ?? "")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                angles

                VStack(spacing: 0) {
                    SpecimenFieldRow("Title", value: $title, source: specimen.provenance(for: .title))
                    SpecimenFieldRow("Maker", value: $maker, source: specimen.provenance(for: .maker))
                    SpecimenFieldRow("SKU", value: $sku, source: specimen.provenance(for: .sku))
                    SpecimenFieldRow("Colorway", value: $colorway, source: specimen.provenance(for: .colorway))
                    SpecimenFieldRow("Material", value: $material, source: specimen.provenance(for: .material))
                    SpecimenFieldRow("Trade price", value: $priceText,
                                     source: specimen.provenance(for: .price), placeholder: "$—")
                    SpecimenFieldRow("Note", value: $note, source: specimen.provenance(for: .note))
                }
                .routeCard()

                if let dimensions = RouteFormat.dimensions(specimen.measurements) {
                    readRow("Dimensions", value: dimensions,
                            source: RouteFormat.dimensionsSource(specimen.measurements))
                }

                if let transcript = specimen.voiceTranscript, !transcript.isEmpty {
                    voiceRow(transcript)
                }

                actions
            }
            .padding(20)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(CaptureColor.paper3)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(specimen.title ?? "Untitled capture")
                .font(CaptureType.display)
                .foregroundStyle(CaptureColor.ink)
            if let placemark = specimen.venue?.placemarkName {
                Text(placemark.uppercased())
                    .font(CaptureType.eyebrow)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
        }
    }

    private var angles: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                let count = max(specimen.photos.count, 1)
                ForEach(Array(0..<count), id: \.self) { index in
                    RoundedRectangle(cornerRadius: 12)
                        .fill(CaptureColor.paper2)
                        .frame(width: 120, height: 150)
                        .overlay(
                            VStack(spacing: 6) {
                                Image(systemName: "photo")
                                    .font(CaptureType.title2)
                                    .foregroundStyle(CaptureColor.line2)
                                Text("Angle \(index + 1)")
                                    .font(CaptureType.eyebrow)
                                    .foregroundStyle(CaptureColor.inkSoft)
                            }
                        )
                        .overlay(alignment: .topLeading) {
                            if index == 0 {
                                Text("PRIMARY")
                                    .font(CaptureType.eyebrow)
                                    .foregroundStyle(CaptureColor.paper3)
                                    .padding(.horizontal, 6).padding(.vertical, 2)
                                    .background(CaptureColor.verdigris)
                                    .clipShape(RoundedRectangle(cornerRadius: 4))
                                    .padding(6)
                            }
                        }
                }
                Button {
                    coordinator.popToRoot()
                } label: {
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(CaptureColor.line2, style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                        .frame(width: 120, height: 150)
                        .overlay(
                            VStack(spacing: 6) {
                                Image(systemName: "plus")
                                    .font(CaptureType.title2)
                                Text("Add angle")
                                    .font(CaptureType.eyebrow)
                            }
                            .foregroundStyle(CaptureColor.inkSoft)
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func readRow(_ label: String, value: String, source: ProvenanceSource) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label)
                    .font(CaptureType.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(CaptureColor.inkSoft)
                Spacer()
                ProvenanceBadge(source)
            }
            Text(value)
                .font(CaptureType.body)
                .foregroundStyle(CaptureColor.ink)
        }
        .routeCard()
    }

    private func voiceRow(_ transcript: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Voice")
                    .font(CaptureType.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(CaptureColor.inkSoft)
                Spacer()
                ProvenanceBadge(.voice)
            }
            Text("“\(transcript)”")
                .font(CaptureType.body)
                .foregroundStyle(CaptureColor.ink)
            if let seconds = specimen.voiceDurationSeconds {
                Text(String(format: "0:%02d", Int(seconds)))
                    .font(CaptureType.monoSmall)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
        }
        .routeCard()
    }

    private var actions: some View {
        HStack(spacing: 10) {
            RouteActionButton("Re-shoot", systemImage: "camera.rotate", kind: .secondary) {
                coordinator.popToRoot()
            }
            RouteActionButton(saved ? "Saved" : "Save changes",
                                systemImage: saved ? "checkmark" : "tray.and.arrow.down",
                                kind: .primary) {
                save()
            }
        }
        .padding(.top, 4)
    }

    // MARK: Editing

    private func save() {
        commit(title, original: specimen.title, key: .title)
        commit(maker, original: specimen.maker, key: .maker)
        commit(sku, original: specimen.sku, key: .sku)
        commit(colorway, original: specimen.colorway, key: .colorway)
        commit(material, original: specimen.materialNote, key: .material)
        commitPrice()
        commit(note, original: specimen.note, key: .note)
        try? store.save()
        saved = true
        coordinator.goBack()
    }

    private func commit(_ newValue: String, original: String?, key: FieldKey) {
        let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed != (original ?? "") else { return }
        specimen.setValue(trimmed.isEmpty ? nil : trimmed, for: key, source: newSource(for: key))
    }

    private func commitPrice() {
        let cents = RouteFormat.centsFromEditable(priceText)
        guard cents != specimen.priceTradeCents else { return }
        specimen.setValue(cents.map(String.init), for: .price, source: newSource(for: .price))
    }

    /// A recognised/measured value the designer changed becomes `.edited`;
    /// a manually-typed or empty field stays `.manual`.
    private func newSource(for key: FieldKey) -> ProvenanceSource {
        guard let existing = specimen.provenance(for: key) else { return .manual }
        switch existing {
        case .manual, .imported, .edited: return .manual
        case .ocr, .code, .measure, .voice, .smartGuess: return .edited
        }
    }
}

#if DEBUG
#Preview {
    let demo = RoutePreviewData.make()
    return NavigationStack {
        V3SpecimenDetailScreen(specimen: demo.specimen, store: demo.store, coordinator: CaptureCoordinator())
    }
}
#endif
