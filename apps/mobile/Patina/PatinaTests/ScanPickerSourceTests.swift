//
//  ScanPickerSourceTests.swift
//  PatinaTests
//
//  Pins the pure picker source logic: which packages are attachable (held or
//  synced, newest-first) and how a preselection resolves by scan id OR by
//  room-local id, in the right order and de-duplicated.
//

import Testing
import Foundation
@testable import Patina

@MainActor
struct ScanPickerSourceTests {

    private func makePackage(
        status: RoomScanPackageStatus,
        roomLocalId: UUID = UUID(),
        createdOffset: TimeInterval = 0
    ) -> RoomScanPackage {
        let pkg = RoomScanPackage(
            scanId: UUID(),
            roomLocalId: roomLocalId,
            bundlePath: "Scans/\(UUID())",
            status: status
        )
        pkg.createdAt = Date().addingTimeInterval(createdOffset)
        return pkg
    }

    @Test
    func pickableIsHeldOrSyncedNewestFirst() {
        let held = makePackage(status: .heldLocal, createdOffset: -30)
        let synced = makePackage(status: .synced, createdOffset: -10)
        let pending = makePackage(status: .pending, createdOffset: -5)
        let failed = makePackage(status: .failed, createdOffset: -1)

        let result = ScanPickerSource.pickable(from: [held, pending, failed, synced])
        #expect(result.map { $0.scanId } == [synced.scanId, held.scanId])
    }

    @Test
    func preselectionByScanIdKeepsCallerOrder() {
        let a = makePackage(status: .heldLocal, createdOffset: -1)
        let b = makePackage(status: .synced, createdOffset: -2)
        let resolved = ScanPickerSource.resolvePreselection(
            packages: [a, b],
            preselectedScanIds: [b.scanId, a.scanId],
            preselectedRoomId: nil
        )
        #expect(resolved == [b.scanId, a.scanId])
    }

    @Test
    func preselectionByRoomIdMatchesHeldScans() {
        let room = UUID()
        let a = makePackage(status: .heldLocal, roomLocalId: room, createdOffset: -1)
        let b = makePackage(status: .synced, roomLocalId: UUID(), createdOffset: -2)
        let resolved = ScanPickerSource.resolvePreselection(
            packages: [a, b],
            preselectedScanIds: [],
            preselectedRoomId: room
        )
        #expect(resolved == [a.scanId])
    }

    @Test
    func preselectionDedupesScanIdAndRoomId() {
        let room = UUID()
        let a = makePackage(status: .heldLocal, roomLocalId: room, createdOffset: -1)
        // Same scan matched by both its id AND its room → appears once.
        let resolved = ScanPickerSource.resolvePreselection(
            packages: [a],
            preselectedScanIds: [a.scanId],
            preselectedRoomId: room
        )
        #expect(resolved == [a.scanId])
    }

    @Test
    func preselectionIgnoresNonPickableScans() {
        let pending = makePackage(status: .pending)
        let resolved = ScanPickerSource.resolvePreselection(
            packages: [pending],
            preselectedScanIds: [pending.scanId],
            preselectedRoomId: nil
        )
        #expect(resolved.isEmpty)
    }
}
