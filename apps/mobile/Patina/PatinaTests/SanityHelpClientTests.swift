//
//  SanityHelpClientTests.swift
//  PatinaTests
//
//  Swift Testing coverage for `SanityHelpClient` — the Sprint 1 Stream G2
//  task. Verifies:
//
//   * URL construction round-trips the project ID, dataset, API version,
//     and the parameterized GROQ query.
//   * Persona fallback chain mirrors spec §7.3: exact → designer (for
//     consumer/maker only) → all → nil.
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

private let designerFallbackPayload = """
{
  "result": {
    "_type": "helpContent",
    "surfaceKey": "designer-portal/today/welcome",
    "persona": "designer",
    "contentType": "tooltip",
    "tooltipContent": {
      "eyebrow": "Designer copy",
      "body": "Canonical authored variant for designer / consumer / maker."
    }
  }
}
"""

private let allFallbackPayload = """
{
  "result": {
    "_type": "helpContent",
    "surfaceKey": "designer-portal/today/welcome",
    "persona": "all",
    "contentType": "tooltip",
    "tooltipContent": {
      "body": "Persona-agnostic copy."
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

    // MARK: Persona fallback chain (pure)

    @Test
    func personaFallbackChain_designerYieldsDesignerThenAll() async {
        let client = SanityHelpClient(session: StubURLSession())
        let chain = await client.personaFallbackChain(for: .designer)
        #expect(chain == ["designer", "all"])
    }

    @Test
    func personaFallbackChain_adminYieldsAdminThenAll() async {
        let client = SanityHelpClient(session: StubURLSession())
        let chain = await client.personaFallbackChain(for: .admin)
        #expect(chain == ["admin", "all"])
    }

    @Test
    func personaFallbackChain_consumerFallsBackToDesignerThenAll() async {
        let client = SanityHelpClient(session: StubURLSession())
        let chain = await client.personaFallbackChain(for: .consumer)
        #expect(chain == ["consumer", "designer", "all"])
    }

    @Test
    func personaFallbackChain_makerFallsBackToDesignerThenAll() async {
        let client = SanityHelpClient(session: StubURLSession())
        let chain = await client.personaFallbackChain(for: .maker)
        #expect(chain == ["maker", "designer", "all"])
    }

    @Test
    func personaFallbackChain_nilSkipsToAll() async {
        let client = SanityHelpClient(session: StubURLSession())
        let chain = await client.personaFallbackChain(for: nil)
        #expect(chain == ["all"])
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
    func fetchContent_consumerFallsBackThroughDesignerToAll() async throws {
        let session = StubURLSession()
        // Step 1 ("consumer"): miss
        // Step 2 ("designer"): hit — should stop here
        session.enqueue([.nullResult, .ok(designerFallbackPayload)])
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
        #expect(payload.eyebrow == "Designer copy")
        // Two requests issued — consumer miss, then designer hit. We do NOT
        // continue to the `"all"` step once we have a hit.
        #expect(session.requestCount == 2)

        // Verify persona ordering in the requested URLs.
        let personaParams = session.requestedURLs.compactMap(personaParam(of:))
        #expect(personaParams == ["consumer", "designer"])
    }

    @Test
    func fetchContent_consumerFallsAllTheWayToAll() async throws {
        let session = StubURLSession()
        // consumer → designer → all
        session.enqueue([.nullResult, .nullResult, .ok(allFallbackPayload)])
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
        #expect(payload.body == "Persona-agnostic copy.")
        #expect(session.requestCount == 3)

        let personaParams = session.requestedURLs.compactMap(personaParam(of:))
        #expect(personaParams == ["consumer", "designer", "all"])
    }

    @Test
    func fetchContent_returnsNilWhenAllFallbacksMiss() async throws {
        let session = StubURLSession()
        // consumer → designer → all, all three miss.
        session.enqueue([.nullResult, .nullResult, .nullResult])
        let client = SanityHelpClient(session: session)

        let result = try await client.fetchContent(
            surfaceKey: "designer-portal/today/welcome",
            contentType: "tooltip",
            persona: .consumer
        )

        #expect(result == nil)
        #expect(session.requestCount == 3)
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
        // Each of the two fallback steps (designer, all) attempted exactly one
        // request — the error didn't short-circuit the chain to zero requests.
        #expect(session.requestCount == 2)
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
        // designer + all both miss.
        session.enqueue([.nullResult, .nullResult])
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
        // Two requests for the first call (designer + all), zero for the second.
        #expect(session.requestCount == 2)
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

    /// Extracts the persona param (`$p`) from a Sanity GROQ query URL — used
    /// to assert request ordering in fallback-chain tests.
    private func personaParam(of url: URL) -> String? {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return nil
        }
        guard let raw = components.queryItems?.first(where: { $0.name == "$p" })?.value else {
            return nil
        }
        // The value is a JSON literal like `"designer"`. Strip quotes.
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
