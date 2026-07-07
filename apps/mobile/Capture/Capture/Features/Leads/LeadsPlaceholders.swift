//  LeadsPlaceholders.swift
//  Capture · Wave L (Leads)
//
//  L1/L2 freeze placeholders. Wave L replaces these with the real lead list +
//  detail, reading from `container.leads`.

import SwiftUI
import CaptureKit

struct LeadListPlaceholder: View {
    var body: some View {
        FieldPlaceholderScreen(screenID: .l1LeadList, title: "Leads", wave: "L",
                               symbol: "person.crop.circle.badge.questionmark")
    }
}

struct LeadDetailPlaceholder: View {
    let leadID: String
    var body: some View {
        FieldPlaceholderScreen(screenID: .l2LeadDetail, title: "Lead", wave: "L",
                               symbol: "person.crop.circle", note: "Lead \(leadID)")
    }
}
