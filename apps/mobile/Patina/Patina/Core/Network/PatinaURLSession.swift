//
//  PatinaURLSession.swift
//  Patina
//
//  The session every Patina request runs on, and the one thing the app can do
//  about a connection that has stopped answering.
//
//  `W1-C-11`. On a cold launch the app fans ~16 requests at PostgREST. Twice,
//  on a HEALTHY local stack with no deliberate outage, walk C watched a
//  decision opened by deep link hang on "One moment…" and fall to "Couldn't
//  load this decision". The CFNetwork log names the shape exactly:
//
//      [C67 … /rest/v1/client_decisions] start
//      → Socket received CONNECTED
//      → reporting state ready
//      → event: client:data_stall @3.114s
//
//  with the twin `[C68 … client_decision_options]` doing the same. Kong logged
//  nothing for either — it writes its access line on response — and the
//  identical queries answered from the host in 7 ms. **Every** request after
//  that timed out at `APIConfiguration.requestTimeout` until the app was
//  relaunched.
//
//  A relaunch was the only cure because every client held `URLSession.shared`.
//  One stalled HTTP/2 connection in that process-wide pool is reused by every
//  following request to the same host, and nothing in the app can reach it:
//  `URLSession.shared` may not be flushed or invalidated. Killing the process
//  is literally the only way to drop it.
//
//  So the app owns its session, and a failure with the shape a stall has
//  flushes the pool. `flush(completionHandler:)` is documented to "ensure that
//  future requests occur on a new TCP connection", which is the whole fix: the
//  next request opens a fresh connection and answers, with no relaunch, no
//  per-call retry loop, and nothing for the reader to do. Recovery is automatic
//  the moment the gateway answers.
//

import Foundation

// `nonisolated`: the target's `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`
// otherwise pins this enum — and `URLSession.patinaData` below — to the main
// actor, so every request would enter and resume there, and the nine actor
// clients that hold `shared` each drew "main actor-isolated static property
// 'shared' can not be referenced on a nonisolated actor instance". Nothing here
// touches main-actor state; the two places that must (`SupabaseClientManager`,
// `PatinaLog`) hop for themselves.
nonisolated public enum PatinaURLSession {

    /// The session every API client sends through.
    ///
    /// Same budget as the supabase-swift client's — `SupabaseClientManager
    /// .sessionConfiguration`'s shape, kept here rather than shared so the two
    /// pools stay two pools and a stall in one cannot be mistaken for the
    /// other. `NetworkBudgetTests` reads both.
    public static let shared: URLSession = URLSession(configuration: configuration)

    static let configuration: URLSessionConfiguration = {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = APIConfiguration.requestTimeout
        configuration.timeoutIntervalForResource = APIConfiguration.resourceTimeout
        configuration.waitsForConnectivity = false
        return configuration
    }()

    // MARK: - The classifier

    /// Whether this failure is the shape a stalled pooled connection makes.
    ///
    /// `.timedOut` is what the walker saw — a connection that reached
    /// `ready` and then produced no bytes for the full 30 s budget.
    /// `.networkConnectionLost` is its sibling: the connection went away
    /// mid-flight. Both describe a connection the app HAD and can no longer
    /// use, which is what a new one fixes.
    ///
    /// Deliberately narrow. `.notConnectedToInternet` and
    /// `.cannotFindHost` are answers about the world, not about the pool; a
    /// `.cancelled` is the app's own doing. Flushing on those would churn the
    /// pool on every airplane-mode second and prove nothing.
    public static func isStallShaped(_ error: Error) -> Bool {
        guard let urlError = error as? URLError else { return false }
        switch urlError.code {
        case .timedOut, .networkConnectionLost:
            return true
        default:
            return false
        }
    }

    /// How long a flush is left to prove itself before another is allowed.
    ///
    /// One request's whole budget: a flush that has not yet been followed by a
    /// request that either answered or timed out has not been tested, and
    /// flushing again inside that window would drop the connection the recovery
    /// just opened.
    static let flushCooldown: TimeInterval = APIConfiguration.requestTimeout

    /// The pure policy, so the recovery is a fact rather than something only a
    /// wedged simulator can exercise.
    static func shouldFlush(lastFlushAt: Date?, now: Date) -> Bool {
        guard let lastFlushAt else { return true }
        return now.timeIntervalSince(lastFlushAt) >= flushCooldown
    }

    /// Whether an answered request is evidence that the flush worked.
    ///
    /// Only a request that STARTED after the flush was served by the
    /// connection the flush opened. On a cold launch ~16 requests are in
    /// flight at once: several were already running when the stall fired, and
    /// one of those answering says nothing about the new connection. Clearing
    /// the mark on it re-arms the flush inside the same burst, so the next of
    /// the old requests to time out drops the connection the recovery just
    /// opened — which is the loop the cooldown exists to prevent.
    static func successProvesFlush(lastFlushAt: Date?, requestStartedAt: Date) -> Bool {
        guard let lastFlushAt else { return false }
        return requestStartedAt >= lastFlushAt
    }

    // MARK: - The recovery

    /// Recovery bookkeeping. A lock rather than an actor: the callers are the
    /// API clients' own actors and a hop would put the decision after the
    /// throw it belongs to.
    private final class Recovery: @unchecked Sendable {
        static let shared = Recovery()
        private let lock = NSLock()
        private var lastFlushAt: Date?

        /// Returns whether the caller should flush now.
        func claimFlush(now: Date) -> Bool {
            lock.lock()
            defer { lock.unlock() }
            guard PatinaURLSession.shouldFlush(lastFlushAt: lastFlushAt, now: now) else {
                return false
            }
            lastFlushAt = now
            return true
        }

        /// A request that BEGAN after the flush answered, so the connection
        /// the flush opened is healthy and the next stall is a new one. A
        /// request older than the flush proves nothing and leaves the mark.
        func noteSuccess(requestStartedAt: Date) {
            lock.lock()
            defer { lock.unlock() }
            guard PatinaURLSession.successProvesFlush(
                lastFlushAt: lastFlushAt, requestStartedAt: requestStartedAt
            ) else { return }
            lastFlushAt = nil
        }

        #if DEBUG
        func resetForTesting() {
            lock.lock()
            defer { lock.unlock() }
            lastFlushAt = nil
        }
        #endif
    }

    static func noteSuccess(requestStartedAt: Date) {
        Recovery.shared.noteSuccess(requestStartedAt: requestStartedAt)
    }

    /// Called with every failed request. A stall-shaped one drops the pooled
    /// connections — both pools, because the SDK's session carries the auth
    /// refresh every one of these requests waits on.
    static func noteFailure(_ error: Error, now: Date = Date()) {
        guard isStallShaped(error) else { return }
        guard Recovery.shared.claimFlush(now: now) else { return }
        shared.flush { }
        // The SDK's session and the logger are main-actor state; the flush
        // above is not, and belongs on the failing request's own thread.
        Task { @MainActor in dropSDKPoolAndSaySo() }
    }

    @MainActor
    private static func dropSDKPoolAndSaySo() {
        SupabaseClientManager.shared.sdkSession.flush { }
        PatinaLog.sync.error(
            "[network] a request stalled on a connected socket — pooled connections dropped (W1-C-11)"
        )
    }

    #if DEBUG
    /// Test seam: forget that a flush has happened.
    static func resetRecoveryForTesting() {
        Recovery.shared.resetForTesting()
    }

    /// Test seam: ask the live bookkeeping whether a stall now would flush,
    /// which is the question a burst answers wrongly if a success re-arms it.
    static func claimFlushForTesting(now: Date) -> Bool {
        Recovery.shared.claimFlush(now: now)
    }
    #endif
}

// `nonisolated` for the same reason the enum above is: a request must not
// enter or resume on the main actor to reach its own recovery.
nonisolated extension URLSession {
    /// `data(for:)` with `W1-C-11`'s recovery attached.
    ///
    /// Every `Core/Network` client calls this instead of `data(for:)`, which is
    /// what makes the recovery reachable from a stall the app cannot otherwise
    /// see — the stall happens inside URLSession, after the socket is ready,
    /// and the only evidence the app gets is the timeout this catches.
    func patinaData(for request: URLRequest) async throws -> (Data, URLResponse) {
        let startedAt = Date()
        do {
            let result = try await data(for: request)
            PatinaURLSession.noteSuccess(requestStartedAt: startedAt)
            return result
        } catch {
            PatinaURLSession.noteFailure(error)
            throw error
        }
    }

    /// The same, for the reads that name a URL rather than build a request —
    /// a signed document download, a hero frame. Same pool, same recovery.
    func patinaData(from url: URL) async throws -> (Data, URLResponse) {
        // A hand-built `URLRequest` carries Foundation's own 60 s default
        // rather than the session's budget, which is what `data(from:)` would
        // have applied.
        var request = URLRequest(url: url)
        request.timeoutInterval = configuration.timeoutIntervalForRequest
        return try await patinaData(for: request)
    }
}
