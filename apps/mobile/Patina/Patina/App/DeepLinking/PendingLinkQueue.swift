//
//  PendingLinkQueue.swift
//  Patina
//
//  Links that arrived before the app could open them.
//
//  What shipped held ONE URL, in memory, on the coordinator, filled only while
//  `phase == .launching` and drained only on arrival at `.main`. Three findings
//  live in the gap between that and what a tester does:
//
//   • C2-02 — `configure(coordinator:)` runs from `ContentView`'s `.onAppear`,
//     strictly after `.onOpenURL` can first fire. In that window the coordinator
//     is nil, so the universal-link arm called `coordinator?.openExternal(…)` —
//     a no-op — and returned `true`. Measured: 2 cold launches in 8 lost the link.
//   • C2-21 — a link arriving at `.auth` or `.onboarding` was not queued at all;
//     it was pushed onto a NavigationStack that is not mounted in those phases.
//   • GAP7B-09 — round one opens SIGNED OUT, so that is the first state every
//     tester is in. The link was lost, not late: nothing survived the process,
//     and nothing on screen said anything had been kept.
//
//  So: a FIFO, bounded, with a short life, written where it survives a cold
//  launch. Two rules the shape enforces —
//
//   1. **Bounded, oldest-first.** A person who taps four links before signing in
//      gets four; a runaway producer cannot grow the file without limit, and the
//      newest tap — the one they are waiting on — is never the one refused.
//   2. **Short-lived.** A link is a request made in a moment. `timeToLive` is one
//      email-code round trip; past it the request is stale and replaying it would
//      open something the person has long stopped thinking about.
//
//  Not here: `patina://auth…`. That arm routes in every phase, because `.main`
//  is unreachable until the magic-link callback is handled — queueing it would
//  hold the app at the auth wall permanently. `DeepLinkHandler` owns that guard.
//

import Foundation

/// One kept link, and when it was tapped.
struct PendingLink: Codable, Equatable, Sendable {
    let url: URL
    let queuedAt: Date
}

/// The FIFO itself. `@MainActor` because every caller — `DeepLinkHandler`,
/// `AppCoordinator` — already is, and the queue must not be written from two
/// isolation domains.
@MainActor
final class PendingLinkQueue {

    /// Four taps before signing in is a person; forty is a producer with a bug.
    static let maximumDepth = 5

    /// Fifteen minutes — one email-code round trip, which is the longest wait
    /// this queue exists to survive (`GAP7B-09` shape (c): tap, cold launch,
    /// sign in, arrive).
    static let timeToLive: TimeInterval = 15 * 60

    /// The App Group suite, so the value lands in the same domain as the
    /// record's own artefacts rather than a second one to keep in sync.
    static let appGroupIdentifier = "group.cloud.patina.app"

    static let defaultsKey = "patina.deeplink.pending.v1"

    private let defaults: UserDefaults

    /// `defaults` is for tests. Production takes the App Group suite, falling
    /// back to `.standard` exactly as `RecordOwnerStamp` and `LastSeenStore` do:
    /// `UserDefaults(suiteName:)` returns nil whenever the entitlement is not
    /// honoured by the running process.
    init(defaults: UserDefaults? = nil) {
        self.defaults = defaults ?? UserDefaults(suiteName: Self.appGroupIdentifier) ?? .standard
    }

    // MARK: - Reading

    /// What is still worth replaying, oldest first. Entries past their life are
    /// dropped on read AND on write, so a queue nobody drains cannot rot.
    func links(now: Date = Date()) -> [PendingLink] {
        stored().filter { now.timeIntervalSince($0.queuedAt) < Self.timeToLive }
    }

    func urls(now: Date = Date()) -> [URL] {
        links(now: now).map(\.url)
    }

    var isEmpty: Bool { links().isEmpty }

    // MARK: - Writing

    func enqueue(_ url: URL, now: Date = Date()) {
        var kept = links(now: now)
        kept.append(PendingLink(url: url, queuedAt: now))
        if kept.count > Self.maximumDepth {
            kept.removeFirst(kept.count - Self.maximumDepth)
        }
        write(kept)
    }

    /// Everything worth replaying, removed from the queue in the same breath.
    /// Draining is one-shot: a link replayed twice is a screen the person did
    /// not ask for the second time.
    func drain(now: Date = Date()) -> [URL] {
        let due = links(now: now).map(\.url)
        clear()
        return due
    }

    func clear() {
        defaults.removeObject(forKey: Self.defaultsKey)
    }

    // MARK: - Storage

    private func stored() -> [PendingLink] {
        guard let data = defaults.data(forKey: Self.defaultsKey) else { return [] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode([PendingLink].self, from: data)) ?? []
    }

    private func write(_ links: [PendingLink]) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(links) else { return }
        defaults.set(data, forKey: Self.defaultsKey)
    }
}
