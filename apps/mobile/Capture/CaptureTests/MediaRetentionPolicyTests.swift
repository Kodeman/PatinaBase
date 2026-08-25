//  MediaRetentionPolicyTests.swift
//  CaptureTests
//
//  FC-R19 — MediaRetentionPolicy is the pure soft-cap math; CaptureStore's
//  sweep (P-3) is what actually walks the App Group media dir. Both are
//  covered here: the soft-cap boundary in both directions for the policy,
//  and the sweep's "oldest receipted file first, stop the moment overage
//  clears, never touch anything un-receipted" contract.

import Foundation
import Testing
@testable import CaptureKit

struct MediaRetentionPolicyTests {
    @Test func justUnderTheCapHasNoOverage() {
        #expect(MediaRetentionPolicy.overage(
            totalBytes: MediaRetentionPolicy.softCapBytes - 1
        ) == 0)
    }

    @Test func exactlyAtTheCapHasNoOverage() {
        #expect(MediaRetentionPolicy.overage(
            totalBytes: MediaRetentionPolicy.softCapBytes
        ) == 0)
    }

    @Test func justOverTheCapHasOverageOfExactlyOne() {
        #expect(MediaRetentionPolicy.overage(
            totalBytes: MediaRetentionPolicy.softCapBytes + 1
        ) == 1)
    }

    @Test func wellOverTheCapReportsTheExactExcess() {
        #expect(MediaRetentionPolicy.overage(
            totalBytes: MediaRetentionPolicy.softCapBytes + 10_000_000
        ) == 10_000_000)
    }

    @Test func zeroBytesHasNoOverage() {
        #expect(MediaRetentionPolicy.overage(totalBytes: 0) == 0)
    }
}

@MainActor
struct CaptureStoreMediaRetentionSweepTests {
    /// Writes a real (small) file for a fresh specimen's photo, stamps a
    /// remote path so it counts as receipted, and pins its modification date
    /// so ordering is deterministic without writing anywhere near the real
    /// 512 MB soft cap.
    @discardableResult
    private func makeReceiptedPhoto(
        in store: CaptureStore,
        bytes: Int,
        modifiedAt: Date
    ) throws -> URL {
        let specimen = store.newDraft()
        let filename = "sweep-photo-\(UUID().uuidString).heic"
        try store.writeMedia(Data(repeating: 0xAB, count: bytes), filename: filename)
        let url = store.mediaURL(for: filename)
        try FileManager.default.setAttributes(
            [.modificationDate: modifiedAt], ofItemAtPath: url.path)
        let photo = CapturePhoto(filename: filename)
        photo.remotePath = "remote/\(filename)"
        photo.specimen = specimen
        specimen.photos.append(photo)
        return url
    }

    /// Same as above but with no remote path stamped — un-receipted.
    @discardableResult
    private func makeUnreceiptedPhoto(
        in store: CaptureStore,
        bytes: Int,
        modifiedAt: Date
    ) throws -> URL {
        let specimen = store.newDraft()
        let filename = "sweep-unreceipted-\(UUID().uuidString).heic"
        try store.writeMedia(Data(repeating: 0xCD, count: bytes), filename: filename)
        let url = store.mediaURL(for: filename)
        try FileManager.default.setAttributes(
            [.modificationDate: modifiedAt], ofItemAtPath: url.path)
        let photo = CapturePhoto(filename: filename)
        photo.specimen = specimen
        specimen.photos.append(photo)
        return url
    }

    @Test func sweepDoesNothingWhenUnderTheCap() throws {
        let store = try CaptureStore.inMemory()
        let url = try makeReceiptedPhoto(in: store, bytes: 100, modifiedAt: Date())
        defer { try? FileManager.default.removeItem(at: url) }

        let deleted = store.sweepMediaRetention(totalBytes: 100)

        #expect(deleted == 0)
        #expect(FileManager.default.fileExists(atPath: url.path))
    }

    @Test func sweepDeletesOldestReceiptedFileFirstAndStopsWhenOverageClears() throws {
        let store = try CaptureStore.inMemory()
        let now = Date()
        let oldestURL = try makeReceiptedPhoto(
            in: store, bytes: 100, modifiedAt: now.addingTimeInterval(-3600))
        let middleURL = try makeReceiptedPhoto(
            in: store, bytes: 100, modifiedAt: now.addingTimeInterval(-1800))
        let newestURL = try makeReceiptedPhoto(
            in: store, bytes: 100, modifiedAt: now)
        defer {
            for url in [oldestURL, middleURL, newestURL] {
                try? FileManager.default.removeItem(at: url)
            }
        }

        // 150 bytes of overage clears once the two oldest (200 bytes) are gone.
        let deleted = store.sweepMediaRetention(
            totalBytes: MediaRetentionPolicy.softCapBytes + 150)

        #expect(deleted == 2)
        #expect(!FileManager.default.fileExists(atPath: oldestURL.path))
        #expect(!FileManager.default.fileExists(atPath: middleURL.path))
        #expect(FileManager.default.fileExists(atPath: newestURL.path))
    }

    @Test func sweepNeverDeletesAnUnreceiptedFileEvenWhenItIsTheOldestAndLargest() throws {
        let store = try CaptureStore.inMemory()
        let now = Date()
        let unreceiptedURL = try makeUnreceiptedPhoto(
            in: store, bytes: 10_000, modifiedAt: now.addingTimeInterval(-7200))
        let receiptedURL = try makeReceiptedPhoto(
            in: store, bytes: 100, modifiedAt: now)
        defer {
            try? FileManager.default.removeItem(at: unreceiptedURL)
            try? FileManager.default.removeItem(at: receiptedURL)
        }

        let deleted = store.sweepMediaRetention(
            totalBytes: MediaRetentionPolicy.softCapBytes + 50)

        #expect(deleted == 1)
        #expect(FileManager.default.fileExists(atPath: unreceiptedURL.path))
        #expect(!FileManager.default.fileExists(atPath: receiptedURL.path))
    }

    @Test func sweepTreatsAReceiptedVoiceSegmentTheSameAsAReceiptedPhoto() throws {
        let store = try CaptureStore.inMemory()
        let specimen = store.newDraft()
        let uploadedName = "seg-uploaded-\(UUID().uuidString).m4a"
        let lostName = "seg-lost-\(UUID().uuidString).m4a"
        try store.writeMedia(Data(repeating: 0x01, count: 100), filename: uploadedName)
        try store.writeMedia(Data(repeating: 0x02, count: 100), filename: lostName)
        let uploadedURL = store.mediaURL(for: uploadedName)
        let lostURL = store.mediaURL(for: lostName)
        let old = Date().addingTimeInterval(-3600)
        try FileManager.default.setAttributes([.modificationDate: old], ofItemAtPath: uploadedURL.path)
        try FileManager.default.setAttributes([.modificationDate: old], ofItemAtPath: lostURL.path)
        specimen.voiceAudioSegmentsRaw = [uploadedName, lostName]
        // Only `uploadedName` carries a stamped remote path (Task 9's receipt).
        specimen.voiceAudioRemotePathsRaw = ["some/folder/\(uploadedName)"]
        defer {
            try? FileManager.default.removeItem(at: uploadedURL)
            try? FileManager.default.removeItem(at: lostURL)
        }

        let deleted = store.sweepMediaRetention(
            totalBytes: MediaRetentionPolicy.softCapBytes + 50)

        #expect(deleted == 1)
        #expect(!FileManager.default.fileExists(atPath: uploadedURL.path))
        #expect(FileManager.default.fileExists(atPath: lostURL.path))
    }
}
