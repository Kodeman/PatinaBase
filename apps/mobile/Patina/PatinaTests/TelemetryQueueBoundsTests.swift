//
//  TelemetryQueueBoundsTests.swift
//  PatinaTests
//
//  C7-13. `flush()` used to empty `pending`, write the file, POST, and on
//  failure put the whole batch back at the front and write the file again —
//  two whole-file writes per failed tick, every thirty seconds, forever.
//  `maxBatchSize` triggered a flush and capped nothing, so an unreachable
//  `/api/interactions/batch` (a client-portal route whose deploy is still
//  owed) grew the list without bound, on disk, across launches.
//

import Foundation
import Testing
@testable import Patina

struct TelemetryQueueBoundsTests {

    private func tempFile() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("telemetry-\(UUID().uuidString).json")
    }

    private func event(_ index: Int) -> DailyRoomEvent {
        DailyRoomEvent(
            type: .productDwell,
            productId: "p\(index)",
            at: Date(timeIntervalSince1970: TimeInterval(index))
        )
    }

    // MARK: - The cap

    @Test
    func thePendingListIsCappedAndDropsOldest() async {
        let file = tempFile()
        defer { try? FileManager.default.removeItem(at: file) }
        let queue = DailyRoomBatchQueue(queueFileURL: file) { _, _ in false }

        for index in 0..<(DailyRoomBatchQueue.maxPending + 50) {
            await queue.enqueue(event(index))
        }
        #expect(await queue.pendingCount == DailyRoomBatchQueue.maxPending)
    }

    /// A file left by a build without the cap must not be restored whole.
    @Test
    func aRestoredFileIsCappedToo() async throws {
        let file = tempFile()
        defer { try? FileManager.default.removeItem(at: file) }
        let oversized = (0..<(DailyRoomBatchQueue.maxPending + 200)).map(event)
        try JSONEncoder.telemetryEncoder.encode(oversized).write(to: file)

        let queue = DailyRoomBatchQueue(queueFileURL: file) { _, _ in false }
        await queue.loadFromDisk()
        #expect(await queue.pendingCount == DailyRoomBatchQueue.maxPending)
    }

    // MARK: - Backoff

    @Test
    func theBackoffDoublesAndIsCapped() {
        let base: TimeInterval = 30
        #expect(DailyRoomBatchQueue.backoff(afterConsecutiveFailures: 0, base: base) == 0)
        #expect(DailyRoomBatchQueue.backoff(afterConsecutiveFailures: 1, base: base) == 30)
        #expect(DailyRoomBatchQueue.backoff(afterConsecutiveFailures: 2, base: base) == 60)
        #expect(DailyRoomBatchQueue.backoff(afterConsecutiveFailures: 3, base: base) == 120)
        #expect(
            DailyRoomBatchQueue.backoff(afterConsecutiveFailures: 40, base: base)
                == DailyRoomBatchQueue.maxBackoff
        )
    }

    @Test
    func aFailedFlushBacksOffAndTheNextTickIsSkipped() async {
        let file = tempFile()
        defer { try? FileManager.default.removeItem(at: file) }

        let attempts = TelemetryAttemptCounter()
        let queue = DailyRoomBatchQueue(queueFileURL: file) { _, _ in
            await attempts.increment()
            return false
        }
        await queue.enqueue(event(1))

        let start = Date()
        await queue.flush(now: start)
        #expect(await attempts.value == 1)
        #expect(await queue.failureCount == 1)

        // The next tick, thirty seconds later, is inside the backoff window.
        await queue.flush(now: start.addingTimeInterval(29))
        #expect(await attempts.value == 1, "a tick inside the backoff must not POST")

        // Past it, the queue tries again.
        await queue.flush(now: start.addingTimeInterval(31))
        #expect(await attempts.value == 2)
        #expect(await queue.failureCount == 2)
    }

    /// The events are still there — a failure must never drop telemetry, it
    /// must only stop hammering.
    @Test
    func aFailedFlushKeepsTheEvents() async {
        let file = tempFile()
        defer { try? FileManager.default.removeItem(at: file) }
        let queue = DailyRoomBatchQueue(queueFileURL: file) { _, _ in false }
        await queue.enqueue(event(1))
        await queue.enqueue(event(2))
        await queue.flush()
        #expect(await queue.pendingCount == 2)
    }

    // MARK: - The disk

    /// The heart of C7-13: an outage that changes nothing must not rewrite
    /// the file. One write for the two events, then nothing.
    @Test
    func repeatedFailedTicksDoNotRewriteTheFile() async {
        let file = tempFile()
        defer { try? FileManager.default.removeItem(at: file) }
        let queue = DailyRoomBatchQueue(queueFileURL: file) { _, _ in false }
        await queue.enqueue(event(1))
        await queue.enqueue(event(2))

        let start = Date()
        await queue.flush(now: start)
        let afterFirst = await queue.diskWriteCount
        #expect(afterFirst == 1)

        for minute in 1...10 {
            await queue.flush(now: start.addingTimeInterval(TimeInterval(minute) * 600))
        }
        #expect(await queue.diskWriteCount == afterFirst,
                "a tick that changed nothing rewrote the whole queue file")
    }

    @Test
    func aSuccessfulFlushClearsTheSentEventsAndTheBackoff() async {
        let file = tempFile()
        defer { try? FileManager.default.removeItem(at: file) }

        let shouldFail = TelemetryFailureFlag(true)
        let queue = DailyRoomBatchQueue(queueFileURL: file) { _, _ in
            await shouldFail.value == false
        }
        await queue.enqueue(event(1))

        let start = Date()
        await queue.flush(now: start)
        #expect(await queue.failureCount == 1)

        await shouldFail.set(false)
        await queue.flush(now: start.addingTimeInterval(60))
        #expect(await queue.pendingCount == 0)
        #expect(await queue.failureCount == 0)
        #expect(await queue.isBackingOff == false)
    }
}

// MARK: - Helpers

private actor TelemetryAttemptCounter {
    private(set) var value = 0
    func increment() { value += 1 }
}

private actor TelemetryFailureFlag {
    private(set) var value: Bool
    init(_ value: Bool) { self.value = value }
    func set(_ newValue: Bool) { value = newValue }
}
