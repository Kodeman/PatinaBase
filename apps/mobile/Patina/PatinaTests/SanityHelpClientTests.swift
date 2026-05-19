//
//  SanityHelpClientTests.swift
//  PatinaTests
//
//  Swift Testing coverage for `SanityHelpClient`. Verifies:
//
//   * URL construction round-trips the project ID, dataset, API version,
//     and the parameterized GROQ query.
//   * Canonical fallback chain mirrors the web `useHelpContent` hook and
//     spec §7.3:
//       1. exact key + exact persona
//       2. exact key + "all"             (skipped iff persona is nil/"all")
//       3. parent key + exact persona    (skipped iff no parent)
//       4. parent key + "all"            (skipped iff persona is nil/"all"
//                                          OR no parent)
//     Documented in
//     `packages/help-system/src/persistence/helpContentQuery.md`.
//   * The in-memory cache returns the same value within TTL without a
//     second network call.
//   * Network errors collapse to `nil` rather than throwing.
//

import Foundation
import Testing
@testable import Patina

// MARK: - Stub session

/// Counting stub used to verify request count, payload order, and outbound URLs.
final class StubURLSession: URLSessionProtocol, @unchecked Sendable {
    /// FIFO queue of (response data, HTTP status) pairs. One entry consumed per request.
    /// Empty after the queue is drained — further requests trigger a recorded error.
    struct Response: Sendable {
        let data: Data
        let status: Int

        static func ok(_ json: String) -> Response {
            Response(data: Data(json.utf8), status: 200)
        }

        static let nullResult = Response.ok(#"{"result": null}"#)
    }

    private let lock = NSLock()
    private var queue: [Response] = []
    private(set) var requestedURLs: [URL] = []
    /// Optional override that overrides the queue and throws on every call.
    var error: Error?

    func enqueue(_ responses: [Response]) {
        lock.lock(); defer { lock.unlock() }
        queue.append(contentsOf: responses)
    }

    var requestCount: Int {
        lock.lock(); defer { lock.unlock() }
        return requestedURLs.count
    }

    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        lock.lock()
        if let url = request.url {
            requestedURLs.append(url)
        }
        if let error {
            lock.unlock()
            throw error
        }
        guard !queue.isEmpty else {
            lock.unlock()
            // Default to a "no content" response so tests fail loudly with
            // descriptive cache-miss errors rather than ambiguous index OOB.
            let url = request.url ?? URL(string: "https://example.invalid/")!
            return (
                Data(#"{"result": null}"#.utf8),
                HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)!
            )
        }
        let response = queue.removeFirst()
        lock.unlock()

        let url = request.url ?? URL(string: "https://example.invalid/")!
        let http = HTTPURLResponse(
            url: url,
            statusCode: response.status,
            httpVersion: nil,
            headerFields: nil
        )!
        return (response.data, http)
    }
}

// MARK: - Sample payloads

private let tooltipPayload = """
{
  "result": {
    "_type": "helpContent",
    "surfaceKey": "designer-portal/today/welcome",
    "persona": "designer",
    "contentType": "tooltip",
    "tooltipContent": {
      "eyebrow": "What this is",
      "body": "A reminder that lives in the header."
    }
  }
}
"""

private let allLeafPayload = """
{
  "result": {
    "_type": "helpContent",
    "surfaceKey": "designer-portal/today/welcome",
    "persona": "all",
    "contentType": "tooltip",
    "tooltipContent": {
      "body": "Persona-agnostic copy at the leaf surface."
    }
  }
}
"""

private let parentDesignerPayload = """
{
  "result": {
    "_type": "helpContent",
    "surfaceKey": "designer-portal/today",
    "persona": "designer",
    "contentType": "tooltip",
    "tooltipContent": {
      "eyebrow": "Parent designer",
      "body": "Authored at the parent surface for designers."
    }
  }
}
"""

private let parentAllPayload = """
{
  "result": {
    "_type": "helpContent",
    "surfaceKey": "designer-portal/today",
    "persona": "all",
    "contentType": "tooltip",
    "tooltipContent": {
      "body": "Persona-agnostic copy at the parent surface."
    }
  }
}
"""

// MARK: - Tests

struct SanityHelpClientTests {

    // MARK: URL construction

    @Test
    func buildQueryURL_includesProjectDatasetAndApiVersion() throws {
        let url = try #require(SanityHelpClient.buildQueryURL(
            surfaceKey: "designer-portal/today/welcome",
            contentType: "tooltip",
            personaParam: "designer"
        ))

        #expect(url.host == "kv3qrinl.api.sanity.io")
        #expect(url.path == "/v2024-01-01/data/query/production")

        let components = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false))
        let items = Dictionary(
            uniqueKeysWithValues: (components.queryItems ?? []).map { ($0.name, $0.value ?? "") }
        )

        let query = try #require(items["query"])
        #expect(query.contains("_type == \"helpContent\""))
        #expect(query.contains("surfaceKey == $sk"))
        #expect(query.contains("contentType == $ct"))
        #expect(query.contains("persona == $p"))
        #expect(query.hasSuffix("[0]"))

        #expect(items["$sk"] == "\"designer-portal/today/welcome\"")
        #expect(items["$ct"] == "\"tooltip\"")
        #expect(items["$p"] == "\"designer\"")
    }

    @Test
    func buildQueryURL_percentEncodesJSONQuoting() throws {
        let url = try #require(SanityHelpClient.buildQueryURL(
            surfaceKey: "designer-portal/today/welcome",
            contentType: "tooltip",
            personaParam: "designer"
        ))
        // `URLComponents` percent-encodes JSON quote characters in query
        // values (`%22`) so the GROQ string literal survives transit.
        // Forward slashes inside query values are technically legal per
        // RFC 3986 and `URLComponents` leaves them as-is — that's fine
        // because the Sanity HTTP API accepts either form.
        let raw = url.absoluteString
        #expect(raw.contains("%22designer-portal/today/welcome%22"))
        #expect(raw.contains("%22tooltip%22"))
        #expect(raw.contains("%22designer%22"))
        // The GROQ string operator `==` is percent-encoded by URLComponents.
        #expect(raw.contains("%3D%3D"))
    }

    // MARK: Canonical fallback plan (pure)

    @Test
    func fallbackPlan_designerYieldsFourSteps() {
        let plan = SanityHelpClient.fallbackPlan(
            surfaceKey: "designer-portal/today/welcome",
            persona: .designer
        )
        #expect(plan == [
            .init(surfaceKey: "designer-portal/today/welcome", persona: "designer"),
            .init(surfaceKey: "designer-portal/today/welcome", persona: "all"),
            .init(surfaceKey: "designer-portal/today", persona: "designer"),
            .init(surfaceKey: "designer-portal/today", persona: "all"),
        ])
    }

    @Test
    func fallbackPlan_consumerYieldsFourSteps() {
        // Consumer no longer falls back through "designer" — the canonical
        // chain only uses the persona-agnostic "all" sentinel (matches web).
        let plan = SanityHelpClient.fallbackPlan(
            surfaceKey: "designer-portal/today/welcome",
            persona: .consumer
        )
        #expect(plan == [
            .init(surfaceKey: "designer-portal/today/welcome", persona: "consumer"),
            .init(surfaceKey: "designer-portal/today/welcome", persona: "all"),
            .init(surfaceKey: "designer-portal/today", persona: "consumer"),
            .init(surfaceKey: "designer-portal/today", persona: "all"),
        ])
    }

    @Test
    func fallbackPlan_nilCallerSkipsRedundantAllSteps() {
        // A nil/persona-agnostic caller maps to wire "all". Steps 2 and 4
        // would re-issue identical requests and are therefore skipped.
        let plan = SanityHelpClient.fallbackPlan(
            surfaceKey: "designer-portal/today/welcome",
            persona: nil
        )
        #expect(plan == [
            .init(surfaceKey: "designer-portal/today/welcome", persona: "all"),
            .init(surfaceKey: "designer-portal/today", persona: "all"),
        ])
    }

    @Test
    func fallbackPlan_noParentDropsSteps3And4() {
        // A surface key without a `/` has no parent — only the two
        // exact-key steps remain.
        let plan = SanityHelpClient.fallbackPlan(
            surfaceKey: "rootless",
            persona: .designer
        )
        #expect(plan == [
            .init(surfaceKey: "rootless", persona: "designer"),
            .init(surfaceKey: "rootless", persona: "all"),
        ])
    }

    @Test
    func parentSurfaceKey_dropsLastSegment() {
        #expect(
            SanityHelpClient.parentSurfaceKey("designer-portal/today/welcome")
                == "designer-portal/today"
        )
        #expect(
            SanityHelpClient.parentSurfaceKey("designer-portal/today") == "designer-portal"
        )
        #expect(SanityHelpClient.parentSurfaceKey("rootless") == nil)
    }

    // MARK: Network behaviour

    @Test
    func fetchContent_returnsExactPersonaHit() async throws {
        let session = StubURLSession()
        session.enqueue([.ok(tooltipPayload)])
        let client = SanityHelpClient(session: session)

        let result = try await client.fetchContent(
            surfaceKey: "designer-portal/today/welcome",
            contentType: "tooltip",
            persona: .designer
        )

        guard case .tooltip(let payload) = try #require(result) else {
            Issue.record("Expected tooltip result")
            return
        }
        #expect(payload.body == "A reminder that lives in the header.")
        #expect(payload.eyebrow == "What this is")
        #expect(session.requestCount == 1)
    }

    @Test
    func fetchContent_consumerFallsBackToLeafAllThenStops() async throws {
        // Canonical chain step 1 (consumer at leaf) misses; step 2
        // (leaf + "all") hits, so the parent steps are NOT issued.
        let session = StubURLSession()
        session.enqueue([.nullResult, .ok(allLeafPayload)])
        let client = SanityHelpClient(session: session)

        let result = try await client.fetchContent(
            surfaceKey: "designer-portal/today/welcome",
            contentType: "tooltip",
            persona: .consumer
        )

        guard case .tooltip(let payload) = try #require(result) else {
            Issue.record("Expected tooltip result")
            return
        }
        #expect(payload.body == "Persona-agnostic copy at the leaf surface.")
        #expect(session.requestCount == 2)

        let trace = session.requestedURLs.compactMap { stepTrace(of: $0) }
        #expect(trace == [
            StepTrace(surfaceKey: "designer-portal/today/welcome", persona: "consumer"),
            StepTrace(surfaceKey: "designer-portal/today/welcome", persona: "all"),
        ])
    }

    @Test
    func fetchContent_walksToParentSurfaceWhenLeafBothMiss() async throws {
        // Steps 1+2 miss at the leaf; step 3 (parent + designer) hits.
        // Step 4 (parent + "all") is therefore not issued.
        let session = StubURLSession()
        session.enqueue([.nullResult, .nullResult, .ok(parentDesignerPayload)])
        let client = SanityHelpClient(session: session)

        let result = try await client.fetchContent(
            surfaceKey: "designer-portal/today/welcome",
            contentType: "tooltip",
            persona: .designer
        )

        guard case .tooltip(let payload) = try #require(result) else {
            Issue.record("Expected tooltip result")
            return
        }
        #expect(payload.eyebrow == "Parent designer")
        #expect(session.requestCount == 3)

        let trace = session.requestedURLs.compactMap { stepTrace(of: $0) }
        #expect(trace == [
            StepTrace(surfaceKey: "designer-portal/today/welcome", persona: "designer"),
            StepTrace(surfaceKey: "designer-portal/today/welcome", persona: "all"),
            StepTrace(surfaceKey: "designer-portal/today", persona: "designer"),
        ])
    }

    @Test
    func fetchContent_walksAllFourStepsBeforeStoppingAtParentAll() async throws {
        // Steps 1–3 miss; step 4 (parent + "all") finally hits.
        let session = StubURLSession()
        session.enqueue([.nullResult, .nullResult, .nullResult, .ok(parentAllPayload)])
        let client = SanityHelpClient(session: session)

        let result = try await client.fetchContent(
            surfaceKey: "designer-portal/today/welcome",
            contentType: "tooltip",
            persona: .designer
        )

        guard case .tooltip(let payload) = try #require(result) else {
            Issue.record("Expected tooltip result")
            return
        }
        #expect(payload.body == "Persona-agnostic copy at the parent surface.")
        #expect(session.requestCount == 4)

        let trace = session.requestedURLs.compactMap { stepTrace(of: $0) }
        #expect(trace == [
            StepTrace(surfaceKey: "designer-portal/today/welcome", persona: "designer"),
            StepTrace(surfaceKey: "designer-portal/today/welcome", persona: "all"),
            StepTrace(surfaceKey: "designer-portal/today", persona: "designer"),
            StepTrace(surfaceKey: "designer-portal/today", persona: "all"),
        ])
    }

    @Test
    func fetchContent_nilPersonaSkipsRedundantAllSteps() async throws {
        // A nil/persona-agnostic caller maps to wire "all". Only the leaf+all
        // and parent+all queries are issued (2 wire calls, not 4).
        let session = StubURLSession()
        session.enqueue([.nullResult, .nullResult])
        let client = SanityHelpClient(session: session)

        let result = try await client.fetchContent(
            surfaceKey: "designer-portal/today/welcome",
            contentType: "tooltip",
            persona: nil
        )

        #expect(result == nil)
        #expect(session.requestCount == 2)

        let trace = session.requestedURLs.compactMap { stepTrace(of: $0) }
        #expect(trace == [
            StepTrace(surfaceKey: "designer-portal/today/welcome", persona: "all"),
            StepTrace(surfaceKey: "designer-portal/today", persona: "all"),
        ])
    }

    @Test
    func fetchContent_returnsNilWhenAllFallbacksMiss() async throws {
        let session = StubURLSession()
        // All four canonical steps miss.
        session.enqueue([.nullResult, .nullResult, .nullResult, .nullResult])
        let client = SanityHelpClient(session: session)

        let result = try await client.fetchContent(
            surfaceKey: "designer-portal/today/welcome",
            contentType: "tooltip",
            persona: .designer
        )

        #expect(result == nil)
        #expect(session.requestCount == 4)
    }

    @Test
    func fetchContent_swallowsNetworkErrorsAndReturnsNil() async throws {
        struct Boom: Error {}
        let session = StubURLSession()
        session.error = Boom()
        let client = SanityHelpClient(session: session)

        // Should NOT throw — network errors collapse to nil per spec §13.4.
        let result = try await client.fetchContent(
            surfaceKey: "designer-portal/today/welcome",
            contentType: "tooltip",
            persona: .designer
        )

        #expect(result == nil)
        // All four canonical steps attempted exactly one request — the error
        // for one step does NOT short-circuit the rest of the chain.
        #expect(session.requestCount == 4)
    }

    @Test
    func fetchContent_throwsOnInvalidSurfaceKey() async {
        let session = StubURLSession()
        let client = SanityHelpClient(session: session)

        await #expect(throws: InvalidSurfaceKeyError.self) {
            _ = try await client.fetchContent(
                surfaceKey: "NotAValidKey",
                contentType: "tooltip",
                persona: .designer
            )
        }
        #expect(session.requestCount == 0)
    }

    // MARK: Cache behaviour

    @Test
    func fetchContent_cachesSuccessfulHitsWithinTTL() async throws {
        let session = StubURLSession()
        session.enqueue([.ok(tooltipPayload)])
        // Frozen clock — both calls happen "now" so the TTL is in range.
        let frozen = Date(timeIntervalSince1970: 1_000_000)
        let client = SanityHelpClient(session: session, now: { frozen })

        let first = try await client.fetchContent(
            surfaceKey: "designer-portal/today/welcome",
            contentType: "tooltip",
            persona: .designer
        )
        let second = try await client.fetchContent(
            surfaceKey: "designer-portal/today/welcome",
            contentType: "tooltip",
            persona: .designer
        )

        #expect(first != nil)
        #expect(second == first)
        #expect(session.requestCount == 1, "Second call should be served from cache")
    }

    @Test
    func fetchContent_cachesMissesWithinTTL() async throws {
        let session = StubURLSession()
        // All four canonical steps miss on the first call; the second call
        // is served from the negative cache and issues zero new requests.
        session.enqueue([.nullResult, .nullResult, .nullResult, .nullResult])
        let frozen = Date(timeIntervalSince1970: 1_000_000)
        let client = SanityHelpClient(session: session, now: { frozen })

        let first = try await client.fetchContent(
            surfaceKey: "designer-portal/today/welcome",
            contentType: "tooltip",
            persona: .designer
        )
        let second = try await client.fetchContent(
            surfaceKey: "designer-portal/today/welcome",
            contentType: "tooltip",
            persona: .designer
        )

        #expect(first == nil)
        #expect(second == nil)
        #expect(session.requestCount == 4)
    }

    @Test
    func fetchContent_refetchesAfterTTLExpires() async throws {
        let session = StubURLSession()
        session.enqueue([.ok(tooltipPayload), .ok(tooltipPayload)])

        let clock = MutableClock(start: Date(timeIntervalSince1970: 1_000_000))
        let client = SanityHelpClient(session: session, now: clock.now)

        _ = try await client.fetchContent(
            surfaceKey: "designer-portal/today/welcome",
            contentType: "tooltip",
            persona: .designer
        )
        // Advance past the 5-minute TTL.
        clock.advance(by: SanityHelpClient.cacheTTL + 1)
        _ = try await client.fetchContent(
            surfaceKey: "designer-portal/today/welcome",
            contentType: "tooltip",
            persona: .designer
        )

        #expect(session.requestCount == 2)
    }

    @Test
    func clearCache_evictsCachedValuesSoNextFetchHitsTheNetwork() async throws {
        let session = StubURLSession()
        session.enqueue([.ok(tooltipPayload), .ok(tooltipPayload)])
        let frozen = Date(timeIntervalSince1970: 1_000_000)
        let client = SanityHelpClient(session: session, now: { frozen })

        _ = try await client.fetchContent(
            surfaceKey: "designer-portal/today/welcome",
            contentType: "tooltip",
            persona: .designer
        )
        await client.clearCache()
        _ = try await client.fetchContent(
            surfaceKey: "designer-portal/today/welcome",
            contentType: "tooltip",
            persona: .designer
        )

        #expect(session.requestCount == 2, "clearCache should force a refetch")
    }

    // MARK: Helpers

    /// Per-step record extracted from a Sanity GROQ query URL — used to
    /// assert that the chain hits each (surfaceKey, persona) pair in the
    /// canonical order.
    struct StepTrace: Equatable {
        let surfaceKey: String
        let persona: String
    }

    /// Extracts the surfaceKey + persona pair from a Sanity GROQ query URL.
    private func stepTrace(of url: URL) -> StepTrace? {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let items = components.queryItems
        else {
            return nil
        }
        let lookup = Dictionary(uniqueKeysWithValues: items.map { ($0.name, $0.value ?? "") })
        guard let rawSK = lookup["$sk"], let rawP = lookup["$p"] else { return nil }
        return StepTrace(surfaceKey: stripJSONQuotes(rawSK), persona: stripJSONQuotes(rawP))
    }

    /// Strips the leading/trailing double-quotes from a JSON string literal
    /// (Sanity GROQ params are JSON-encoded query values). Returns the input
    /// unchanged if it isn't a quoted literal.
    private func stripJSONQuotes(_ raw: String) -> String {
        guard raw.count >= 2, raw.hasPrefix("\""), raw.hasSuffix("\"") else { return raw }
        return String(raw.dropFirst().dropLast())
    }
}

// MARK: - MutableClock

/// Lock-protected mutable clock used to simulate TTL expiry in tests.
private final class MutableClock: @unchecked Sendable {
    private let lock = NSLock()
    private var current: Date

    init(start: Date) {
        self.current = start
    }

    func advance(by interval: TimeInterval) {
        lock.lock(); defer { lock.unlock() }
        current = current.addingTimeInterval(interval)
    }

    var now: @Sendable () -> Date {
        { [self] in
            self.lock.lock(); defer { self.lock.unlock() }
            return self.current
        }
    }
}
