//  TagOCRSheet.swift
//  Capture
//
//  N1 · Tag / label OCR. Points the camera at a price tag / spec card / fabric
//  memo and lifts vendor, SKU and price into the record (source .ocr). Misread
//  characters are correctable inline; an unreadable tag drops to the R2 fallback
//  ("Couldn't read — glare?") which keeps the crop and offers manual entry.

import SwiftUI
import UIKit
import CaptureKit

struct TagOCRSheet: View {
    let pieceID: UUID
    let store: CaptureStore
    let session: any SessionProviding
    let camera: any CameraService
    let ocr: any TagOCRService
    let analytics: any CaptureAnalytics
    let coordinator: CaptureCoordinator?

    enum Phase { case scanning, reading, results, fallback, manualEntry }

    @State private var phase: Phase = .scanning
    @State private var isEditing = false
    @State private var crop: CaptureImage?

    // Editable recognised fields (display strings).
    @State private var maker = ""
    @State private var sku = ""
    @State private var price = ""
    // Originals, to tell an inline correction (.edited) from an untouched read (.ocr).
    @State private var makerOriginal = ""
    @State private var skuOriginal = ""
    @State private var priceOriginal = ""

    private var screenID: String {
        phase == .fallback ? CaptureScreenID.r2OCRFallback.rawValue : CaptureScreenID.n1TagOCR.rawValue
    }

    var body: some View {
        RecognitionSheetLayout {
            RecognitionHeader(eyebrow: "Read from tag", title: "Tag / label",
                              onClose: { coordinator?.dismissSheet() })

            switch phase {
            case .scanning, .reading:
                scanning
            case .results:
                results
            case .fallback:
                fallback
            case .manualEntry:
                manualEntry
            }
            Spacer(minLength: 0)
        }
        .accessibilityIdentifier(screenID)
        .onAppear { analytics.screen("N1.tag-ocr") }
    }

    // MARK: - Scanning

    private var scanning: some View {
        VStack(alignment: .leading, spacing: 18) {
            TagOCRScanner(prompt: phase == .reading ? "reading…" : "Point at the label",
                          isReading: phase == .reading).makeBody()
            RecognitionActionBar(
                secondaryTitle: "Type fields",
                primaryTitle: phase == .reading ? "Reading…" : "Read tag",
                primaryEnabled: phase != .reading,
                onSecondary: { startManualEntry() },
                onPrimary: { read() }
            )
        }
    }

    // MARK: - Results

    private var results: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let crop, let ui = UIImage(data: crop.data) {
                cropThumb(ui)
            }
            RecognitionCard {
                Text("Read from tag")
                    .font(CaptureType.eyebrow).textCase(.uppercase)
                    .foregroundStyle(CaptureColor.inkSoft)
                if isEditing {
                    PieceFieldRow("Vendor", value: $maker, source: .ocr, placeholder: "Vendor")
                    PieceFieldRow("SKU", value: $sku, source: .ocr, placeholder: "SKU")
                    PieceFieldRow("Trade", value: $price, source: .ocr, placeholder: "$0")
                } else {
                    RecognisedValueRow(label: "Vendor", value: maker, source: .ocr) { beginEdit() }
                    RecognisedValueRow(label: "SKU", value: sku, source: .ocr) { beginEdit() }
                    RecognisedValueRow(label: "Trade", value: price, source: .ocr) { beginEdit() }
                }
            }
            RecognitionActionBar(
                secondaryTitle: isEditing ? "Done editing" : "Edit",
                primaryTitle: "Add to piece",
                onSecondary: { isEditing.toggle() },
                onPrimary: { merge(defaultSource: .ocr) }
            )
        }
    }

    // MARK: - R2 fallback

    private var fallback: some View {
        VStack(alignment: .leading, spacing: 14) {
            RecognitionCard {
                HStack(spacing: 12) {
                    if let crop, let ui = UIImage(data: crop.data) {
                        cropThumb(ui, size: 64)
                    } else {
                        RoundedRectangle(cornerRadius: 8).fill(CaptureColor.paper2)
                            .frame(width: 64, height: 64)
                            .overlay(Image(systemName: "doc.viewfinder").foregroundStyle(CaptureColor.terracotta))
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Couldn't read — glare?")
                            .font(CaptureType.bodyEmph)
                            .foregroundStyle(CaptureColor.terracotta)
                        Text("The crop is kept. Type the fields by hand, or line the tag up again.")
                            .font(CaptureType.footnote)
                            .foregroundStyle(CaptureColor.inkSoft)
                    }
                }
            }
            RecognitionActionBar(
                secondaryTitle: "Retry",
                primaryTitle: "Type fields",
                onSecondary: { phase = .scanning },
                onPrimary: { startManualEntry() }
            )
        }
    }

    // MARK: - Manual entry (typed, source .manual)

    private var manualEntry: some View {
        VStack(alignment: .leading, spacing: 14) {
            RecognitionCard {
                Text("Type the tag")
                    .font(CaptureType.eyebrow).textCase(.uppercase)
                    .foregroundStyle(CaptureColor.inkSoft)
                PieceFieldRow("Vendor", value: $maker, source: .manual, placeholder: "Vendor")
                PieceFieldRow("SKU", value: $sku, source: .manual, placeholder: "SKU")
                PieceFieldRow("Trade", value: $price, source: .manual, placeholder: "$0")
            }
            RecognitionActionBar(
                secondaryTitle: "Cancel",
                primaryTitle: "Add to piece",
                onSecondary: { coordinator?.dismissSheet() },
                onPrimary: { merge(defaultSource: .manual) }
            )
        }
    }

    // MARK: - Helpers

    private func cropThumb(_ ui: UIImage, size: CGFloat = 120) -> some View {
        Image(uiImage: ui)
            .resizable().scaledToFill()
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(CaptureColor.verdigrisInk.opacity(0.6), lineWidth: 1))
    }

    private func beginEdit() { isEditing = true }

    private func startManualEntry() {
        maker = ""; sku = ""; price = ""
        phase = .manualEntry
    }

    private func read() {
        phase = .reading
        Task { @MainActor in
            guard let piece = currentPiece() else { phase = .fallback; return }
            let image = await RecognitionImageLoader.captureImage(for: piece, store: store, camera: camera)
            crop = image
            let observations = (try? await ocr.recognizeText(in: image)) ?? []
            apply(observations)
        }
    }

    private func apply(_ observations: [OCRObservation]) {
        for obs in observations {
            guard let field = obs.suggestedField else { continue }
            switch field {
            case .maker: if maker.isEmpty { maker = obs.text }
            case .sku:   if sku.isEmpty { sku = obs.text }
            case .price: if price.isEmpty { price = obs.text }
            default: break
            }
        }
        makerOriginal = maker; skuOriginal = sku; priceOriginal = price
        let gotSomething = !maker.isEmpty || !sku.isEmpty || !price.isEmpty
        UIImpactFeedbackGenerator(style: gotSomething ? .light : .rigid).impactOccurred()
        phase = gotSomething ? .results : .fallback
    }

    private func merge(defaultSource: ProvenanceSource) {
        guard let piece = currentPiece() else { return }
        // A corrected read records the read it replaced (`proposed`), in the
        // field's own stored form.
        if !maker.isEmpty {
            piece.setValue(maker, for: .maker, source: source(for: maker, original: makerOriginal, fallback: defaultSource),
                              proposed: makerOriginal)
        }
        if !sku.isEmpty {
            piece.setValue(sku, for: .sku, source: source(for: sku, original: skuOriginal, fallback: defaultSource),
                              proposed: skuOriginal)
        }
        if !price.isEmpty, let cents = Self.centsFromPrice(price) {
            piece.setValue(String(cents), for: .price, source: source(for: price, original: priceOriginal, fallback: defaultSource),
                              proposed: Self.centsFromPrice(priceOriginal).map(String.init))
            piece.currencyCode = piece.currencyCode ?? "USD"
        }
        try? store.save()
        analytics.event("N1.merge", ["source": defaultSource.rawValue])
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

    private func source(for value: String, original: String, fallback: ProvenanceSource) -> ProvenanceSource {
        if fallback == .ocr, value != original { return .edited }
        return fallback
    }

    static func centsFromPrice(_ s: String) -> Int? {
        let cleaned = s.filter { $0.isNumber || $0 == "." }
        guard !cleaned.isEmpty else { return nil }
        if cleaned.contains(".") {
            return Double(cleaned).map { Int(($0 * 100).rounded()) }
        }
        return Int(cleaned).map { $0 * 100 }
    }
}

#if DEBUG
import CaptureKitMocks

#Preview("N1 · Tag OCR") {
    // swiftlint:disable:next force_try
    let store = try! CaptureStore.inMemory()
    let piece = store.newDraft()
    return TagOCRSheet(
        pieceID: piece.id,
        store: store,
        session: MockSessionProviding(),
        camera: MockCameraService(),
        ocr: MockTagOCRService(),
        analytics: MockCaptureAnalytics(),
        coordinator: CaptureCoordinator()
    )
}
#endif
