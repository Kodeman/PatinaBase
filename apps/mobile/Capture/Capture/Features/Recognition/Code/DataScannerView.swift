//  DataScannerView.swift
//  Capture
//
//  N2 — the real barcode/QR scanner: a UIViewControllerRepresentable over
//  VisionKit's DataScannerViewController. VisionKit compiles on the
//  iphonesimulator SDK but `DataScannerViewController.isSupported/.isAvailable`
//  are false there, so the N2 sheet checks `DataScannerView.isAvailable` and
//  shows a manual fallback instead of instantiating this on the simulator.

import SwiftUI
import VisionKit

struct DataScannerView: UIViewControllerRepresentable {
    /// (payload, symbology) for each newly recognised code.
    var onCode: (String, String) -> Void

    @MainActor static var isAvailable: Bool {
        DataScannerViewController.isSupported && DataScannerViewController.isAvailable
    }

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode()],
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: true,
            isHighlightingEnabled: true
        )
        scanner.delegate = context.coordinator
        return scanner
    }

    func updateUIViewController(_ uiViewController: DataScannerViewController, context: Context) {
        try? uiViewController.startScanning()
    }

    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onCode: (String, String) -> Void
        private var lastPayload: String?
        init(onCode: @escaping (String, String) -> Void) { self.onCode = onCode }

        func dataScanner(_ dataScanner: DataScannerViewController,
                         didAdd addedItems: [RecognizedItem],
                         allItems: [RecognizedItem]) {
            forward(addedItems)
        }

        func dataScanner(_ dataScanner: DataScannerViewController,
                         didTapOn item: RecognizedItem) {
            forward([item])
        }

        private func forward(_ items: [RecognizedItem]) {
            for item in items {
                if case let .barcode(code) = item, let payload = code.payloadStringValue {
                    guard payload != lastPayload else { continue }
                    lastPayload = payload
                    onCode(payload, code.observation.symbology.rawValue)
                }
            }
        }
    }
}
