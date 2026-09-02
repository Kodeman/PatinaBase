//
//  DailyRoomBatchQueue.swift
//  Patina
//
//  Persistent, 30-second-flush telemetry queue for The Daily Room.
//  Events are appended from anywhere in the app, persisted to disk so they
//  survive app termination, and POSTed in a single batch to the client
//  portal's /api/interactions/batch endpoint. Also dual-emits to PostHog
//  for real-time dashboards.
//

import Foundation

actor DailyRoomBatchQueue {
    static let shared = DailyRoomBatchQueue()

    // MARK: - Config

    private let flushInterval: TimeInterval = 30
    private let maxBatchSize = 100

    /// C7-13: the hard ceiling this queue never had. `maxBatchSize` only
    /// triggered a flush; nothing capped `pending`, and every failed flush
    /// put the whole batch back at the front. A client-portal route that
    /// 404s — and `/api/interactions/batch`'s deploy is still owed — grew
    /// this list for as long as the app was open, and the list survives a
    /// relaunch on disk.
    static let maxPending = 500

    /// Failure backoff, doubling from the flush interval and capped so a
    /// long outage settles at one attempt every ten minutes rather than one
    /// every thirty seconds forever.
    static let maxBackoff: TimeInterval = 600

    static func backoff(afterConsecutiveFailures failures: Int, base: TimeInterval) -> TimeInterval {
        guard failures > 0 else { return 0 }
        let doublings = min(failures - 1, 16)
        return min(base * pow(2, Double(doublings)), maxBackoff)
    }

    private let queueFileURL: URL

    /// Injected so a test can drive the queue without a network. The
    /// singleton passes `DailyRoomAPI.shared.postBatch`.
    typealias Poster = @Sendable (String, [DailyRoomEvent]) async -> Bool
    private let post: Poster

    // MARK: - State

    private var pending: [DailyRoomEvent] = []
    private var sessionId = UUID().uuidString
    private var flushTask: Task<Void, Never>?
    private var consecutiveFailures = 0
    /// The earliest a flush may be attempted. `distantPast` while healthy.
    private var nextAttemptAt = Date.distantPast
    /// Bumped on every change to `pending`, and compared against what disk
    /// last saw. A tick that changed nothing must not rewrite the file — the
    /// old code wrote it twice per failed tick, every thirty seconds, for the
    /// whole outage.
    private var revision = 0
    private var persistedRevision = 0
    private var trackingDisabled: Bool {
        UserDefaults.standard.bool(forKey: "behavioral_tracking_opt_out")
    }

    private init() {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        self.queueFileURL = dir.appendingPathComponent("daily_room_queue.json")
        self.post = { sessionId, events in
            await DailyRoomAPI.shared.postBatch(sessionId: sessionId, events: events)
        }
        Task { await self.loadFromDisk() }
        Task { await self.startFlushTimer() }
    }

    /// A detached queue for tests: its own file, its own poster, and no
    /// flush timer.
    init(queueFileURL: URL, post: @escaping Poster) {
        self.queueFileURL = queueFileURL
        self.post = post
    }

    // MARK: - Test inspection

    var pendingCount: Int { pending.count }
    var failureCount: Int { consecutiveFailures }
    var isBackingOff: Bool { Date() < nextAttemptAt }
    var diskWriteCount: Int { writes }
    private var writes = 0

    // MARK: - Public API

    /// Begin a new session. Call on app launch or foreground.
    func beginSession() {
        sessionId = UUID().uuidString
    }

    /// Enqueue an event. Dual-emits to PostHog. No-op if tracking is off.
    func enqueue(_ event: DailyRoomEvent) {
        guard !trackingDisabled else { return }

        pending.append(event)
        // Oldest first: a telemetry event's value decays, and the newest
        // events are the ones describing whatever the person is doing now.
        if pending.count > Self.maxPending {
            pending.removeFirst(pending.count - Self.maxPending)
        }
        revision += 1

        // PostHog mirror (fire and forget)
        Task.detached {
            await PostHogService.shared.capture(
                event.eventType.rawValue,
                properties: Self.postHogProperties(from: event)
            )
        }

        if pending.count >= maxBatchSize {
            Task { await self.flush() }
        }
    }

    /// Force an immediate flush (e.g. on app backgrounding).
    ///
    /// Nothing leaves `pending` until the POST has succeeded, so there is no
    /// re-queue and no second file write on a failed tick. A failure sets a
    /// doubling backoff instead of retrying at the flush interval forever.
    func flush(now: Date = Date()) async {
        // Durability first, and only when the list has actually changed since
        // disk last saw it.
        await persistIfChanged()

        guard !pending.isEmpty else { return }
        guard now >= nextAttemptAt else { return }

        let batch = Array(pending.prefix(maxBatchSize))
        let ok = await post(sessionId, batch)

        guard ok else {
            consecutiveFailures += 1
            nextAttemptAt = now.addingTimeInterval(
                Self.backoff(afterConsecutiveFailures: consecutiveFailures, base: flushInterval)
            )
            return
        }

        pending.removeFirst(batch.count)
        revision += 1
        consecutiveFailures = 0
        nextAttemptAt = .distantPast
        await persistIfChanged()
    }

    // MARK: - Timer

    private func startFlushTimer() {
        flushTask?.cancel()
        flushTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(flushInterval * 1_000_000_000))
                await self.flush()
            }
        }
    }

    // MARK: - Persistence

    private func persistIfChanged() async {
        guard revision != persistedRevision else { return }
        do {
            let data = try JSONEncoder.telemetryEncoder.encode(pending)
            try data.write(to: queueFileURL, options: Data.WritingOptions.atomic)
            persistedRevision = revision
            writes += 1
        } catch {
            PatinaLog.ui.error("[DailyRoomBatchQueue] persist failed: \(error)")
        }
    }

    /// Restore what a previous run left. Internal so a test can drive it.
    func loadFromDisk() async {
        guard let data = try? Data(contentsOf: queueFileURL) else { return }
        do {
            var restored = try JSONDecoder.telemetryDecoder.decode([DailyRoomEvent].self, from: data)
            // A file written before the cap existed can hold any number of
            // rows. Take the newest, and only the newest.
            let overflow = restored.count - Self.maxPending
            if overflow > 0 {
                restored.removeFirst(overflow)
            }
            pending = restored
            if overflow > 0 {
                // Disk still holds the rows we just dropped; the next flush
                // writes the trimmed list.
                revision += 1
            } else {
                persistedRevision = revision
            }
        } catch {
            try? FileManager.default.removeItem(at: queueFileURL)
        }
    }

    // MARK: - PostHog mapping

    private static func postHogProperties(from event: DailyRoomEvent) -> [String: Any] {
        var props: [String: Any] = [:]
        if let pid = event.productId { props["product_id"] = pid }
        if let rid = event.roomId { props["room_id"] = rid }
        for (k, v) in event.metadata {
            switch v {
            case .string(let s): props[k] = s
            case .int(let i):    props[k] = i
            case .double(let d): props[k] = d
            case .bool(let b):   props[k] = b
            }
        }
        return props
    }
}

// MARK: - JSON coders

extension JSONEncoder {
    static let telemetryEncoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()
}

extension JSONDecoder {
    static let telemetryDecoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}
