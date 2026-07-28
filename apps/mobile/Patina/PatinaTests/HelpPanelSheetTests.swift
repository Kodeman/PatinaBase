//
//  HelpPanelSheetTests.swift
//  PatinaTests
//
//  Swift Testing coverage for Sprint 2 Stream G6 — the iOS help-panel sheet.
//
//  Scope:
//   * The `SanityHelpClient.fetchArticles(forSurfaceKey:)` method added in G6
//     — URL construction, list decoding, defensive parsing, caching, and
//     network-error handling.
//   * The view-layer state of `HelpPanelSheet` — empty state, loaded state,
//     error path — exercised by constructing the view body for type/render
//     verification.
//   * Analytics method shape — pins the call signatures we depend on so the
//     `HelpAnalytics` API can't silently drift away from this view.
//

import Foundation
import SwiftUI
import Testing
@testable import Patina

// MARK: - Stub session

/// Reuses the FIFO stub session pattern from `SanityHelpClientTests`. Kept
/// local because we need slightly different sample payloads (the article-list
/// envelope is a JSON array, not a single object).
final class ListStubURLSession: URLSessionProtocol, @unchecked Sendable {
    struct Response: Sendable {
        let data: Data
        let status: Int

        static func ok(_ json: String) -> Response {
            Response(data: Data(json.utf8), status: 200)
        }

        static func nonOk(_ status: Int) -> Response {
            Response(data: Data("{}".utf8), status: status)
        }
    }

    private let lock = NSLock()
    private var queue: [Response] = []
    private(set) var requestedURLs: [URL] = []
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
            let url = request.url ?? URL(string: "https://example.invalid/")!
            return (
                Data(#"{"result": []}"#.utf8),
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

private let twoArticlesPayload = """
{
  "result": [
    {
      "_id": "article-pipeline-overview",
      "surfaceKey": "designer-portal/pipeline",
      "title": "What does the pipeline view show?",
      "summary": "A snapshot of every project grouped by deal stage."
    },
    {
      "_id": "article-pipeline-leads",
      "surfaceKey": "designer-portal/pipeline/project-list/empty-leads",
      "title": "How do I add a new lead?",
      "summary": "Tap the + button in the top-right of the leads column."
    }
  ]
}
"""

private let oneArticleWithMissingFieldsPayload = """
{
  "result": [
    {
      "_id": "article-partial",
      "surfaceKey": "designer-portal/today/dashboard"
    },
    {
      "_id": "article-malformed-missing-surface"
    },
    {
      "_id": "article-with-title-only",
      "surfaceKey": "designer-portal/today/dashboard",
      "title": "Only a title here"
    }
  ]
}
"""

private let nullResultPayload = #"{"result": null}"#
private let emptyResultPayload = #"{"result": []}"#

// MARK: - Tests

@MainActor
struct HelpPanelSheetTests {

    // MARK: URL construction (G6 article-list query)

    @Test
    func buildArticleListURL_includesProjectDatasetAndApiVersion() throws {
        let url = try #require(
            SanityHelpClient.buildArticleListURL(
                surfaceKey: "designer-portal/pipeline/project-list"
            )
        )

        #expect(url.host == "kv3qrinl.api.sanity.io")
        #expect(url.path == "/v2024-01-01/data/query/production")

        let components = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false))
        let items = Dictionary(
            uniqueKeysWithValues: (components.queryItems ?? []).map { ($0.name, $0.value ?? "") }
        )

        let query = try #require(items["query"])
        // Pin the wire-shape of the GROQ query so accidental edits surface in
        // review. These substrings together prove we ship the prefix-match
        // semantics + cap + ordering + projection.
        #expect(query.contains("_type == \"helpContent\""))
        #expect(query.contains("contentType == \"helpArticle\""))
        #expect(query.contains("surfaceKey == $sk"))
        #expect(query.contains("string::startsWith($sk, surfaceKey + \"/\")"))
        #expect(query.contains("order(length(surfaceKey) desc)"))
        #expect(query.contains("[0...20]"))
        #expect(query.contains("\"_id\": _id"))
        #expect(query.contains("\"title\": helpArticleContent.title"))
        #expect(query.contains("\"summary\": helpArticleContent.oneSentenceAnswer"))

        #expect(items["$sk"] == "\"designer-portal/pipeline/project-list\"")
    }

    @Test
    func buildArticleListURL_percentEncodesQuotedSurfaceKey() throws {
        let url = try #require(
            SanityHelpClient.buildArticleListURL(
                surfaceKey: "designer-portal/today/dashboard"
            )
        )
        let raw = url.absoluteString
        #expect(raw.contains("%22designer-portal/today/dashboard%22"))
    }

    // MARK: Article-list fetching

    @Test
    func fetchArticles_decodesTwoArticles() async throws {
        let session = ListStubURLSession()
        session.enqueue([.ok(twoArticlesPayload)])
        let client = SanityHelpClient(session: session)

        let results = try await client.fetchArticles(
            forSurfaceKey: "designer-portal/pipeline/project-list/empty-leads"
        )

        #expect(results.count == 2)
        #expect(results[0].id == "article-pipeline-overview")
        #expect(results[0].title == "What does the pipeline view show?")
        #expect(results[0].summary == "A snapshot of every project grouped by deal stage.")
        #expect(results[1].id == "article-pipeline-leads")
        #expect(session.requestCount == 1)
    }

    @Test
    func fetchArticles_returnsEmptyForNullResult() async throws {
        let session = ListStubURLSession()
        session.enqueue([.ok(nullResultPayload)])
        let client = SanityHelpClient(session: session)

        let results = try await client.fetchArticles(
            forSurfaceKey: "designer-portal/today/dashboard"
        )

        #expect(results.isEmpty)
        #expect(session.requestCount == 1)
    }

    @Test
    func fetchArticles_returnsEmptyForEmptyArray() async throws {
        let session = ListStubURLSession()
        session.enqueue([.ok(emptyResultPayload)])
        let client = SanityHelpClient(session: session)

        let results = try await client.fetchArticles(
            forSurfaceKey: "designer-portal/today/dashboard"
        )

        #expect(results.isEmpty)
    }

    @Test
    func fetchArticles_skipsRowsMissingRequiredFields() async throws {
        let session = ListStubURLSession()
        session.enqueue([.ok(oneArticleWithMissingFieldsPayload)])
        let client = SanityHelpClient(session: session)

        let results = try await client.fetchArticles(
            forSurfaceKey: "designer-portal/today/dashboard"
        )

        // Three rows in the payload:
        //   1. Partial (no title) — kept, title falls back to surfaceKey
        //   2. Malformed (no surfaceKey) — dropped
        //   3. Title only — kept
        #expect(results.count == 2)
        #expect(results.contains { $0.id == "article-partial" })
        #expect(results.contains { $0.id == "article-with-title-only" })
        #expect(!results.contains { $0.id == "article-malformed-missing-surface" })

        // The "partial" row's title should fall back to its surface key.
        let partial = try #require(results.first { $0.id == "article-partial" })
        #expect(partial.title == "designer-portal/today/dashboard")
        #expect(partial.summary == "")
    }

    @Test
    func fetchArticles_throwsOnNetworkError() async throws {
        // U29: a transport failure is a genuine fetch error, distinct from a
        // surface that legitimately has zero articles — it must throw, not
        // collapse to `[]`, so `HelpPanelSheet` can show a retryable error
        // state instead of a silent "no help articles yet."
        struct Boom: Error {}
        let session = ListStubURLSession()
        session.error = Boom()
        let client = SanityHelpClient(session: session)

        await #expect(throws: HelpArticleListFetchError.self) {
            _ = try await client.fetchArticles(
                forSurfaceKey: "designer-portal/today/dashboard"
            )
        }
        #expect(session.requestCount == 1)
    }

    @Test
    func fetchArticles_throwsOnNon2xxStatus() async throws {
        // U29: same as the network-error case — a non-2xx response is a
        // real failure, not a genuine empty result.
        let session = ListStubURLSession()
        session.enqueue([.nonOk(500)])
        let client = SanityHelpClient(session: session)

        await #expect(throws: HelpArticleListFetchError.self) {
            _ = try await client.fetchArticles(
                forSurfaceKey: "designer-portal/today/dashboard"
            )
        }
        #expect(session.requestCount == 1)
    }

    @Test
    func fetchArticles_retryAfterNetworkErrorSucceedsWithoutStaleCache() async throws {
        // U29: failures must NOT populate the article-list cache — otherwise
        // tapping "Let's try that again" after a transient blip would replay
        // a cached empty result instead of re-hitting the network.
        struct Boom: Error {}
        let session = ListStubURLSession()
        session.error = Boom()
        let client = SanityHelpClient(session: session)

        await #expect(throws: HelpArticleListFetchError.self) {
            _ = try await client.fetchArticles(forSurfaceKey: "designer-portal/today/dashboard")
        }

        session.error = nil
        session.enqueue([.ok(twoArticlesPayload)])
        let results = try await client.fetchArticles(forSurfaceKey: "designer-portal/today/dashboard")

        #expect(results.count == 2)
        #expect(session.requestCount == 2)
    }

    @Test
    func fetchArticles_throwsOnInvalidSurfaceKey() async {
        let session = ListStubURLSession()
        let client = SanityHelpClient(session: session)

        await #expect(throws: InvalidSurfaceKeyError.self) {
            _ = try await client.fetchArticles(forSurfaceKey: "NotAValidKey")
        }
        #expect(session.requestCount == 0)
    }

    // MARK: Caching

    @Test
    func fetchArticles_cachesResultsWithinTTL() async throws {
        let session = ListStubURLSession()
        session.enqueue([.ok(twoArticlesPayload)])
        let frozen = Date(timeIntervalSince1970: 1_000_000)
        let client = SanityHelpClient(session: session, now: { frozen })

        let first = try await client.fetchArticles(
            forSurfaceKey: "designer-portal/pipeline"
        )
        let second = try await client.fetchArticles(
            forSurfaceKey: "designer-portal/pipeline"
        )

        #expect(first.count == 2)
        #expect(second.count == 2)
        #expect(session.requestCount == 1, "Second call should be served from cache")
    }

    @Test
    func clearCache_evictsArticleList() async throws {
        let session = ListStubURLSession()
        session.enqueue([.ok(twoArticlesPayload), .ok(twoArticlesPayload)])
        let frozen = Date(timeIntervalSince1970: 1_000_000)
        let client = SanityHelpClient(session: session, now: { frozen })

        _ = try await client.fetchArticles(forSurfaceKey: "designer-portal/pipeline")
        await client.clearCache()
        _ = try await client.fetchArticles(forSurfaceKey: "designer-portal/pipeline")

        #expect(session.requestCount == 2)
    }

    // MARK: HelpArticleSummary

    @Test
    func helpArticleSummary_isIdentifiable() {
        let summary = HelpArticleSummary(
            id: "abc",
            surfaceKey: "designer-portal/today/dashboard",
            title: "Hello",
            summary: "World"
        )
        #expect(summary.id == "abc")
    }

    @Test
    func helpArticleSummary_decodesProjectedPayload() throws {
        let json = #"""
        {
          "_id": "doc-1",
          "surfaceKey": "designer-portal/aesthete/overview",
          "title": "What is Aesthete?",
          "summary": "A scored snapshot of your design DNA."
        }
        """#
        let decoded = try JSONDecoder().decode(HelpArticleSummary.self, from: Data(json.utf8))
        #expect(decoded.id == "doc-1")
        #expect(decoded.surfaceKey == "designer-portal/aesthete/overview")
        #expect(decoded.title == "What is Aesthete?")
        #expect(decoded.summary == "A scored snapshot of your design DNA.")
    }

    // MARK: View construction (smoke)

    @Test
    func helpPanelSheet_buildsBodyWithoutCrashing() {
        // The sheet view is data-driven and `@MainActor`-isolated. Constructing
        // its body verifies that the SurfaceKey wiring, the toolbar, and the
        // conditional `content` branches all type-check together. We don't
        // try to inspect the rendered tree — there's no ViewInspector dep in
        // this target — but a clean build of `body.body` is a meaningful
        // smoke signal because most regressions show up at the type level.
        let sheet = HelpPanelSheet(
            surfaceKey: SurfaceKeys.DesignerPortal.Today.dashboard,
            isPresented: .constant(true)
        )
        _ = sheet.body
    }

    @Test
    func helpArticleStubView_buildsBodyWithoutCrashing() {
        let stub = HelpArticleStubView(
            article: HelpArticleSummary(
                id: "abc",
                surfaceKey: "designer-portal/today/dashboard",
                title: "Title",
                summary: "Summary"
            )
        )
        _ = stub.body
    }

    @Test
    func helpPanelModifier_compilesForArbitraryHost() {
        // Pins the `.helpPanel(isPresented:surfaceKey:)` convenience modifier
        // so the contract advertised in the doc comment can't drift away from
        // the type. We don't need to render — only to confirm the modifier
        // returns a `View`-conforming opaque type that compiles.
        let host = Text("host").helpPanel(
            isPresented: .constant(false),
            surfaceKey: SurfaceKeys.AdminPortal.dashboard
        )
        _ = host
    }

    // MARK: Analytics API surface

    @Test
    func analyticsAPI_panelOpenAndCloseExist() {
        // The view calls these two methods — pin their signatures so a refactor
        // of `HelpAnalytics` can't silently break the sheet's instrumentation.
        // The functions are non-throwing and return Void; calling them with
        // representative arguments asserts the shape at compile + runtime.
        HelpAnalytics.shared.panelOpened(
            fromSurfaceKey: "designer-portal/today/dashboard",
            triggerType: .utilityBar
        )
        HelpAnalytics.shared.panelClosed(
            fromSurfaceKey: "designer-portal/today/dashboard",
            durationMs: 1234,
            articleOpened: false
        )
        HelpAnalytics.shared.articleOpened(
            articleKey: "article-1",
            fromSurfaceKey: "designer-portal/today/dashboard",
            fromSearch: false
        )
    }
}
