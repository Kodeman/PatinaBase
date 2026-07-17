//  UploadStateTests.swift
//  CaptureTests
//
//  Pure upload-state-machine contracts (Field Capture P1 · item 8, Part 3): the
//  resume set, completion gating, progress, and the bounded-retry decision.

import Foundation
import Testing
@testable import CaptureKit

struct UploadStateTests {

    private func artifact(_ kind: String, _ status: ScanArtifactUploadState.Status,
                          attempts: Int = 0) -> ScanArtifactUploadState {
        ScanArtifactUploadState(kind: kind, relativePath: "\(kind).bin", mimeType: "application/octet-stream",
                                status: status, attempts: attempts)
    }

    @Test func pendingIsTheResumeSet() {
        let arts = [artifact("usdz", .uploaded), artifact("mesh", .failed),
                    artifact("depth", .pending), artifact("photos", .uploading)]
        let resume = ScanUploadPlanner.pending(arts).map(\.kind)
        #expect(Set(resume) == ["mesh", "depth"])     // failed + pending only
    }

    @Test func allDoneGatesCompletion() {
        #expect(!ScanUploadPlanner.allDone([]))                                   // empty → not done
        #expect(!ScanUploadPlanner.allDone([artifact("a", .uploaded), artifact("b", .pending)]))
        #expect(ScanUploadPlanner.allDone([artifact("a", .uploaded), artifact("b", .skipped)]))
    }

    @Test func progressFraction() {
        let arts = [artifact("a", .uploaded), artifact("b", .skipped),
                    artifact("c", .pending), artifact("d", .failed)]
        #expect(ScanUploadPlanner.progress(arts) == 0.5)     // 2 of 4 terminal-success
        #expect(ScanUploadPlanner.progress([]) == 0)
    }

    @Test func canAttemptRespectsRetryBudget() {
        #expect(ScanUploadPlanner.maxAttempts == 3)
        #expect(ScanUploadPlanner.canAttempt(artifact("a", .pending, attempts: 0)))
        #expect(ScanUploadPlanner.canAttempt(artifact("a", .failed, attempts: 2)))
        #expect(!ScanUploadPlanner.canAttempt(artifact("a", .failed, attempts: 3)))   // budget spent
        #expect(!ScanUploadPlanner.canAttempt(artifact("a", .uploaded, attempts: 0))) // already done
    }
}
