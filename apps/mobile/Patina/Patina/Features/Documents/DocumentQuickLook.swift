//
//  DocumentQuickLook.swift
//  Patina
//
//  Wave 3 / D.4: a QLPreviewController wrapper for previewing (and sharing —
//  QuickLook's built-in action) a client document that's already been
//  downloaded to a local file URL. Hosted in a UINavigationController so it
//  carries a Done button; QuickLook supplies the share affordance itself.
//

import SwiftUI
import QuickLook

struct DocumentQuickLook: UIViewControllerRepresentable {
    let fileURL: URL
    let onDismiss: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(fileURL: fileURL, onDismiss: onDismiss)
    }

    func makeUIViewController(context: Context) -> UINavigationController {
        let preview = QLPreviewController()
        preview.dataSource = context.coordinator
        preview.navigationItem.leftBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .done,
            target: context.coordinator,
            action: #selector(Coordinator.done)
        )
        return UINavigationController(rootViewController: preview)
    }

    func updateUIViewController(_ controller: UINavigationController, context: Context) {}

    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        private let fileURL: URL
        private let onDismiss: () -> Void

        init(fileURL: URL, onDismiss: @escaping () -> Void) {
            self.fileURL = fileURL
            self.onDismiss = onDismiss
        }

        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }

        func previewController(
            _ controller: QLPreviewController,
            previewItemAt index: Int
        ) -> QLPreviewItem {
            fileURL as NSURL
        }

        @objc func done() { onDismiss() }
    }
}
