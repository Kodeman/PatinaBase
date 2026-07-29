//  CodeScanSheet.swift
//  Capture
//
//  N2 · Barcode / QR scan. Reads a 1D/2D code off the piece or its tag and
//  surfaces a catalog-match card. "Use match" adopts the record (source .code)
//  and opens the specimen sheet; "Not this" keeps scanning. No catalog match
//  keeps the code on the record as a reference and continues.

import SwiftUI
import UIKit
import CaptureKit

struct CodeScanSheet: View {
    let specimenID: UUID
    let store: CaptureStore
    let session: any SessionProviding
    let codeService: DataScannerCodeService
    let analytics: any CaptureAnalytics
    let coordinator: CaptureCoordinator?

    enum Phase { case scanning, match }

    @State private var phase: Phase = .scanning
    @State private var scanned: ScannedCode?
    @State private var catalogTitle: String?
    @State private var manualCode = ""

    var body: some View {
        RecognitionSheetLayout {
            RecognitionHeader(eyebrow: "Scan", title: "Barcode / QR",
                              onClose: { coordinator?.dismissSheet() })
            switch phase {
            case .scanning: scanning
            case .match: match
            }
            Spacer(minLength: 0)
        }
        .accessibilityIdentifier(CaptureScreenID.n2Scan.rawValue)
        .onAppear { analytics.screen("N2.scan") }
    }

    // MARK: - Scanning

    @ViewBuilder private var scanning: some View {
        if DataScannerView.isAvailable {
            DataScannerView { payload, symbology in lock(payload, symbology) }
                .frame(height: 240)
                .clipShape(RoundedRectangle(cornerRadius: 18))
                .overlay(alignment: .bottom) {
                    Text("Line up the code")
                        .font(CaptureType.monoBody)
                        .foregroundStyle(CaptureColor.paper)
                        .padding(8)
                        .background(Capsule().fill(CaptureColor.ink.opacity(0.6)))
                        .padding(.bottom, 14)
                }
        } else {
            simulatorFallback
        }
    }

    private var simulatorFallback: some View {
        VStack(alignment: .leading, spacing: 14) {
            RecognitionViewport(prompt: "Scanner needs a device\nEnter a code by hand", tint: CaptureColor.verdigris, isActive: false)
            RecognitionCard {
                Text("Enter code")
                    .font(CaptureType.eyebrow).textCase(.uppercase)
                    .foregroundStyle(CaptureColor.inkSoft)
                TextField("e.g. 841197022134", text: $manualCode)
                    .font(CaptureType.monoBody)
                    .foregroundStyle(CaptureColor.ink)
                    .keyboardType(.numbersAndPunctuation)
                    .autocorrectionDisabled()
            }
            RecognitionActionBar(
                secondaryTitle: "Use sample",
                primaryTitle: "Match",
                primaryEnabled: !manualCode.trimmingCharacters(in: .whitespaces).isEmpty,
                onSecondary: { manualCode = "841197022134"; lock(manualCode, "ean13") },
                onPrimary: { lock(manualCode, "manual") }
            )
        }
    }

    // MARK: - Match

    @ViewBuilder private var match: some View {
        if let scanned {
            VStack(alignment: .leading, spacing: 14) {
                RecognitionCard {
                    Text(catalogTitle == nil ? "No catalog match" : "Catalog match")
                        .font(CaptureType.eyebrow).textCase(.uppercase)
                        .foregroundStyle(catalogTitle == nil ? CaptureColor.terracotta : CaptureColor.verdigrisInk)
                    Text(catalogTitle ?? "Kept as a reference on the record")
                        .font(CaptureType.title2)
                        .foregroundStyle(CaptureColor.ink)
                    RecognisedValueRow(label: "Code", value: scanned.payload, source: .code, onTap: nil)
                    HStack {
                        Text(catalogTitle == nil ? "no linked catalog item" : "from vendor catalog")
                            .font(CaptureType.footnote)
                            .foregroundStyle(CaptureColor.inkSoft)
                        if catalogTitle != nil {
                            Text("linked")
                                .font(CaptureType.eyebrow).textCase(.uppercase)
                                .foregroundStyle(CaptureColor.success)
                        }
                    }
                }
                RecognitionActionBar(
                    secondaryTitle: "Not this",
                    primaryTitle: catalogTitle == nil ? "Keep code" : "Use match",
                    onSecondary: { reset() },
                    onPrimary: { useMatch() }
                )
            }
        }
    }

    // MARK: - Actions

    private func lock(_ payload: String, _ symbology: String) {
        let trimmed = payload.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let code = codeService.parse(trimmed, symbology: symbology)
        scanned = code
        catalogTitle = codeService.catalogTitle(for: code)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        phase = .match
    }

    private func reset() {
        scanned = nil
        catalogTitle = nil
        phase = .scanning
    }

    private func useMatch() {
        guard let scanned, let specimen = currentSpecimen() else { return }
        let tag = codeTag(scanned)
        if !specimen.scannedCodes.contains(tag) { specimen.scannedCodes.append(tag) }
        if let title = catalogTitle {
            specimen.setValue(title, for: .title, source: .code)
            specimen.catalogMatchRemoteId = scanned.payload
        }
        if case .gtin(let g) = scanned.kind, specimen.sku == nil {
            specimen.setValue(g, for: .sku, source: .code)
        }
        if case .url(let url) = scanned.kind {
            specimen.setValue(url.absoluteString, for: .sourceURL, source: .code)
        }
        specimen.touch()
        try? store.save()
        analytics.event("N2.use-match", ["matched": String(catalogTitle != nil)])
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

    private func codeTag(_ code: ScannedCode) -> String {
        switch code.kind {
        case .gtin(let g): return "gtin:\(g)"
        case .url(let u): return "url:\(u.absoluteString)"
        case .text(let t): return "text:\(t)"
        }
    }
}

#if DEBUG
import CaptureKitMocks

#Preview("N2 · Scan") {
    // swiftlint:disable:next force_try
    let store = try! CaptureStore.inMemory()
    let specimen = store.newDraft()
    return CodeScanSheet(
        specimenID: specimen.id,
        store: store,
        session: MockSessionProviding(),
        codeService: DataScannerCodeService(),
        analytics: MockCaptureAnalytics(),
        coordinator: CaptureCoordinator()
    )
}
#endif
