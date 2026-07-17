//  SiteScanEntryMode.swift
//  CaptureKit
//
//  The Pro/non-Pro device posture for the SiteScan entry (Field Capture P1 · item 7,
//  R108.2). A LiDAR (Pro) device gets the full instrumented `scan`; a non-LiDAR
//  device gets `contextOnly` — detail photos + voice notes pinned to the project/room
//  and landed in the Capture Inbox, and the output is NEVER labeled a scan (the
//  tolerance promise is the product; a degraded scan path would muddy it, but the
//  context path keeps every designer in the funnel).
//
//  Pure decision, unit-tested — the app gates on `RoomCaptureSession.isSupported`
//  and maps it here so the branch logic is testable with no ARKit.

import Foundation

public enum SiteScanEntryMode: String, Sendable, Equatable {
    /// LiDAR device — the full shared-ARSession instrumented capture (items 3–6).
    case scan
    /// Non-LiDAR device — context capture only (photos + voice → Capture Inbox),
    /// never labeled a scan.
    case contextOnly

    public static func forDevice(lidarSupported: Bool) -> SiteScanEntryMode {
        lidarSupported ? .scan : .contextOnly
    }

    /// Whether this mode produces a scan bundle (vs. context-only Inbox items).
    public var producesScan: Bool { self == .scan }
}
