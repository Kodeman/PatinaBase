//  ReceivingPlaceholders.swift
//  Capture · Wave G (Receiving / goods-in)
//
//  G1/G2/G3 freeze placeholders. G1 is the arriving-POs route; the G2 inspection
//  and G3 outcome are internal steps of the `.receivingInspection` sheet, so one
//  sheet placeholder stands in for both. Wave G replaces these with the real
//  arriving list + inspection/outcome flow, reading from `container.receiving`.

import SwiftUI
import CaptureKit

struct ArrivingPlaceholder: View {
    var body: some View {
        FieldPlaceholderScreen(screenID: .g1Arriving, title: "Receiving", wave: "G",
                               symbol: "shippingbox")
    }
}

/// The `.receivingInspection` sheet (G2 → G3). Presented sheet → a Done button.
struct ReceivingInspectionPlaceholder: View {
    let poID: String
    let coordinator: CaptureCoordinator

    var body: some View {
        FieldPlaceholderScreen(screenID: .g2Inspection, title: "Inspection", wave: "G",
                               symbol: "shippingbox",
                               note: "Hosts G2 inspection → G3 outcome · PO \(poID)",
                               onClose: { coordinator.dismissSheet() })
    }
}
