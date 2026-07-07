//  QRApprovePlaceholders.swift
//  Capture · Wave Q (QR portal-login approval)
//
//  Q1/Q2 freeze placeholders. Q1 is the scanner route; Q2 (`.qrApprove`) is the
//  approve/reject sheet. Wave Q replaces these with the real scanner + biometric
//  approval, reading from `container.portalAuth`.

import SwiftUI
import CaptureKit

struct QRScanPlaceholder: View {
    var body: some View {
        FieldPlaceholderScreen(screenID: .q1QRScan, title: "Scan portal QR", wave: "Q",
                               symbol: "qrcode.viewfinder")
    }
}

/// The `.qrApprove` sheet. Presented sheet → a Done button.
struct QRApprovePlaceholder: View {
    let payload: String
    let coordinator: CaptureCoordinator

    var body: some View {
        FieldPlaceholderScreen(screenID: .q2QRApprove, title: "Approve login", wave: "Q",
                               symbol: "qrcode",
                               note: "Approve or reject the scanned portal login",
                               onClose: { coordinator.dismissSheet() })
    }
}
