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
    private let queueFileURL: URL = {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("daily_room_queue.json")
    }()

    // MARK: - State

    private var pending: [DailyRoomEvent] = []
    private var sessionId = UUID().uuidString
    private var flushTask: Task<Void, Never>?
    private var trackingDisabled: Bool {
        UserDefaults.standard.bool(forKey: "behavioral_tracking_opt_out")
    }

    private init() {
        Task { await self.loadFromDisk() }
        Task { await self.startFlushTimer() }
    }

    // MARK: - Public API

    /// Begin a new session. Call on app launch or foreground.
    func beginSession() {
        sessionId = UUID().uuidString
    }

    /// Enqueue an event. Dual-emits to PostHog. No-op if tracking is off.
    func enqueue(_ event: DailyRoomEvent) {
        guard !trackingDisabled else { return }

        pending.append(event)

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
    func flush() async {
        guard !pending.isEmpty else { return }
        let batch = pending
        pending.removeAll()
        await persistToDisk()

        let ok = await DailyRoomAPI.shared.postBatch(sessionId: sessionId, events: batch)
        if !ok {
            // Re-queue on failure so retry happens on next flush tick
            pending.insert(contentsOf: batch, at: 0)
            await persistToDisk()
        }
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

    private func persistToDisk() async {
        do {
            let data = try JSONEncoder.telemetryEncoder.encode(pending)
            try data.write(to: queueFileURL, options: Data.WritingOptions.atomic)
        } catch {
            print("[DailyRoomBatchQueue] persist failed: \(error)")
        }
    }

    private func loadFromDisk() async {
        guard let data = try? Data(contentsOf: queueFileURL) else { return }
        do {
            pending = try JSONDecoder.telemetryDecoder.decode([DailyRoomEvent].self, from: data)
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
