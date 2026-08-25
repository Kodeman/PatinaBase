//  CaptureSyncAttributes.swift
//  CaptureKit
//
//  Shared ActivityKit attributes for the offline-sync Live Activity (R4/U1).
//  MUST live in CaptureKit: the app starts and updates it; a widget extension
//  will render it. FROZEN — a ContentState shape change breaks both, and it is
//  free ONLY while no widget target exists. Wave 2 spends that once (spec §5.5)
//  so wave 5 can render the visit without another shape change.

import Foundation
import ActivityKit

public struct CaptureSyncAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var queued: Int
        public var uploading: Int
        public var failed: Int
        public var lastSpecimenTitle: String?
        /// Visit facts. Wave 5 renders them; the shape lands now because it is
        /// free only until a widget target exists. Optional is also what lets an
        /// Activity started by the previous build decode in this one.
        public var visitLabel: String?
        public var elapsedSeconds: Int?
        public var captureCount: Int?
        public init(queued: Int, uploading: Int, failed: Int,
                    lastSpecimenTitle: String? = nil,
                    visitLabel: String? = nil,
                    elapsedSeconds: Int? = nil,
                    captureCount: Int? = nil) {
            self.queued = queued; self.uploading = uploading
            self.failed = failed; self.lastSpecimenTitle = lastSpecimenTitle
            self.visitLabel = visitLabel; self.elapsedSeconds = elapsedSeconds
            self.captureCount = captureCount
        }
    }
    public var sessionStartedAt: Date
    public var venueLabel: String?
    public init(sessionStartedAt: Date, venueLabel: String? = nil) {
        self.sessionStartedAt = sessionStartedAt
        self.venueLabel = venueLabel
    }
}
