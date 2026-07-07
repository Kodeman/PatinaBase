//  SiteScanPlaceholders.swift
//  Capture · Wave F (Pro site-scan)
//
//  F1–F4 freeze placeholders. F1 is the setup route; F2 (`.siteScan`) is the live
//  scan route, which hosts F3 review and F4 upload as internal steps. Wave F
//  replaces these with the real RoomPlan scan/review/upload, reading from
//  `container.siteScan`.

import SwiftUI
import CaptureKit

struct ScanSetupPlaceholder: View {
    var body: some View {
        FieldPlaceholderScreen(screenID: .f1ScanSetup, title: "Site scan", wave: "F",
                               symbol: "camera.metering.matrix")
    }
}

struct SiteScanPlaceholder: View {
    let projectID: String?
    let projectRoomID: String?

    var body: some View {
        FieldPlaceholderScreen(screenID: .f2SiteScan, title: "Scanning", wave: "F",
                               symbol: "camera.metering.matrix",
                               note: "Hosts F2 scan → F3 review → F4 upload"
                                   + (projectID.map { " · project \($0)" } ?? ""))
    }
}
