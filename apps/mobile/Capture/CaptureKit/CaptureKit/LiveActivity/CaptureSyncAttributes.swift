//  CaptureSyncAttributes.swift
//  CaptureKit
//
//  Shared ActivityKit attributes for the offline-sync Live Activity (R4/U1).
//  MUST live in CaptureKit: Team D starts/updates it (app), Team F renders it
//  (widget extension). FROZEN — a ContentState shape change breaks both.

import Foundation
import ActivityKit

public struct CaptureSyncAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var queued: Int
        public var uploading: Int
        public var failed: Int
        public var lastSpecimenTitle: String?
        public init(queued: Int, uploading: Int, failed: Int, lastSpecimenTitle: String? = nil) {
            self.queued = queued; self.uploading = uploading
            self.failed = failed; self.lastSpecimenTitle = lastSpecimenTitle
        }
    }
    public var sessionStartedAt: Date
    public var venueLabel: String?
    public init(sessionStartedAt: Date, venueLabel: String? = nil) {
        self.sessionStartedAt = sessionStartedAt
        self.venueLabel = venueLabel
    }
}
