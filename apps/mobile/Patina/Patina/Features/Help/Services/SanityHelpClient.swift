//
//  SanityHelpClient.swift
//  Patina
//
//  Lightweight Swift client for the Sanity public read API, scoped to the
//  Help & Guidance System. Byte-for-byte parity with the web
//  `useHelpContent` hook in `packages/help-system/src/hooks/useHelpContent.ts`.
//
//  CANONICAL CONTRACT
//  ------------------
//  Both this Swift client AND the web hook implement the same 4-step
//  persona fallback chain documented in
//  `packages/help-system/src/persistence/helpContentQuery.md`. The same
//  (surfaceKey, contentType, persona) triple must resolve to the same
//  Sanity `_id` on both platforms. Drift between the two implementations
//  is risk R3 from the help-system plan; if you change the chain here,
//  update the web hook, the shared doc, and the parity fixtures together.
//
//  Why not pull in a Sanity SDK?
//  -----------------------------
//  The iOS app only needs read-only GROQ queries against the public dataset
//  (`kv3qrinl/production`). A 40-line URLSession wrapper is dramatically
//  cheaper than importing a SwiftPM dependency for one HTTP endpoint, and
//  keeps the binary small.
//
//  Thread safety
//  -------------
//  The client is an `actor`, so HTTP dispatch and in-memory cache mutations
//  are serialized. Call sites can `await` from any concurrency context.
//
//  Failure mode
//  ------------
//  Network errors, decoding errors, and "missing content" all collapse to
//  `nil` so help-content downtime never crashes the UI (spec §13.4). The
//  client logs warnings via `print` rather than throwing; in production
//  this lands in OSLog via stdout capture.
//

import Foundation

// MARK: - SanityHelpClient

public actor SanityHelpClient {

    // MARK: Singleton

    /// Shared instance, mirroring the `PostHogService.shared` pattern used
    /// elsewhere in `Services/Analytics/`.
    public static let shared = SanityHelpClient()

    // MARK: Configuration

    /// Sanity project ID. Pinned to the help-system studio (`studios/help-system/sanity.config.ts`).
    public static let projectId: String = "kv3qrinl"

    /// Sanity dataset name. Content for help moments lives in the `production` dataset.
    public static let dataset: String = "production"

    /// Sanity API version. Pinned per Sanity best practice (never `latest`).
    /// Keep in sync with `packages/help-system/src/sanityClient.ts`.
    public static let apiVersion: String = "v2024-01-01"

    /// In-memory cache TTL. Matches the React Query `staleTime` in
    /// `useHelpContent` (spec §7.3).
    public static let cacheTTL: TimeInterval = 5 * 60

    /// URLSession request timeout, in seconds. Keeps the UI snappy when
    /// Sanity is degraded — failures fall back to `nil` so we never block
    /// the caller for long.
    public static let requestTimeout: TimeInterval = 10

    // MARK: Dependencies

    private let session: URLSessionProtocol
    private let now: @Sendable () -> Date

    // MARK: Cache

    /// Composite key for the in-memory cache. Two queries with the same
    /// surface key, content type, and persona may legitimately yield
    /// different results across versions, so we include all three.
    private struct CacheKey: Hashable, Sendable {
        let surfaceKey: SurfaceKey
        let contentType: String
        /// Raw persona value or `"__nil__"` for the fallback path.
        let personaRaw: String

        init(surfaceKey: SurfaceKey, contentType: String, persona: Persona?) {
            self.surfaceKey = surfaceKey
            self.contentType = contentType
            self.personaRaw = persona?.rawValue ?? "__nil__"
        }
    }

    private struct CacheEntry: Sendable {
        let value: HelpContent?
        let storedAt: Date
    }

    private var cache: [CacheKey: CacheEntry] = [:]

    /// Cache entry for `fetchArticles(forSurfaceKey:)`. Keyed by surface key
    /// only — persona-agnostic by design, because the article-list is a
    /// surface-level navigation aid, not persona-targeted content. The shared
    /// `cacheTTL` keeps semantics aligned with single-document fetches.
    private struct ArticleListCacheEntry: Sendable {
        let value: [HelpArticleSummary]
        let storedAt: Date
    }

    private var articleListCache: [SurfaceKey: ArticleListCacheEntry] = [:]

    // MARK: Init

    /// Designated initializer. The shared singleton uses `URLSession.shared`
    /// and `Date.init`. Tests can construct their own instance with a stub
    /// session and clock.
    public init(
        session: URLSessionProtocol = URLSession.shared,
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.session = session
        self.now = now
    }

    // MARK: - Public API

    /// Fetches a single `HelpContent` document for the given surface key and
    /// content type, applying the **canonical 4-step persona fallback chain**
    /// (see `packages/help-system/src/persistence/helpContentQuery.md` for
    /// the full contract):
    ///
    ///   1. Exact match — `surfaceKey + contentType + persona`
    ///   2. Persona-agnostic at exact key — `surfaceKey + contentType + "all"`
    ///      (skipped iff the caller passed `nil`/`"all"` — same wire request)
    ///   3. Parent key + exact persona —
    ///      `parent(surfaceKey) + contentType + persona`
    ///   4. Parent key + `"all"`
    ///      (skipped iff persona is `nil`/`"all"`)
    ///   5. Return `nil` and log one warning.
    ///
    /// `parent(surfaceKey)` is everything before the last `/`. If the key
    /// has no `/`, steps 3 and 4 are skipped (the surface-key regex enforces
    /// at least two segments, so in practice steps 3/4 always run).
    ///
    /// The `Persona?` parameter is a Swift ergonomics shim — `nil` maps to
    /// the wire-level sentinel `"all"` so Sanity always sees a non-null
    /// persona param.
    ///
    /// Network errors and decoding errors collapse to `nil` so the UI can
    /// remain functional during Sanity downtime (spec §13.4).
    ///
    /// - Parameters:
    ///   - surfaceKey: A surface key from the canonical registry, e.g.
    ///                 `"designer-portal/today/welcome"`. Must satisfy
    ///                 `isSurfaceKey(_:)`; otherwise throws
    ///                 `InvalidSurfaceKeyError`.
    ///   - contentType: The `contentType` discriminator from the Sanity
    ///                  schema (e.g. `"tooltip"`, `"emptyState"`).
    ///   - persona:    The current user's persona, or `nil` for the
    ///                 persona-agnostic path (wire value `"all"`).
    /// - Returns: The first matching `HelpContent`, or `nil` if all fallback
    ///            steps miss.
    /// - Throws: `InvalidSurfaceKeyError` when `surfaceKey` fails the
    ///           format check. Network/HTTP/decoding errors are NOT thrown
    ///           to the caller — they are swallowed and treated as a miss.
    public func fetchContent(
        surfaceKey: SurfaceKey,
        contentType: String,
        persona: Persona?
    ) async throws -> HelpContent? {
        try validateSurfaceKey(surfaceKey)

        let cacheKey = CacheKey(surfaceKey: surfaceKey, contentType: contentType, persona: persona)
        if let cached = cachedValue(for: cacheKey) {
            return cached
        }

        let plan = Self.fallbackPlan(surfaceKey: surfaceKey, persona: persona)
        for step in plan {
            if let hit = await tryFetch(
                surfaceKey: step.surfaceKey,
                contentType: contentType,
                persona: step.persona
            ) {
                cache[cacheKey] = CacheEntry(value: hit, storedAt: now())
                return hit
            }
        }

        // All fallbacks exhausted — cache the miss so we don't hammer Sanity
        // for content that genuinely doesn't exist (matches the web hook's
        // SWR semantics where `null` is a valid memoized value).
        cache[cacheKey] = CacheEntry(value: nil, storedAt: now())
        print(
            "[SanityHelpClient] No content found surfaceKey=\(surfaceKey)" +
            " contentType=\(contentType) persona=\(persona?.rawValue ?? "all")"
        )
        return nil
    }

    /// Clears the in-memory cache. Use sparingly — typically only on sign-out
    /// (persona may change) or when the app receives a CMS-invalidation push.
    public func clearCache() {
        cache.removeAll(keepingCapacity: true)
        articleListCache.removeAll(keepingCapacity: true)
    }

    // MARK: - Article List (G6)

    /// Fetches the list of `helpArticle` documents relevant to the given
    /// surface. Mirrors the web `ContextualHelpPanel` GROQ query in
    /// `packages/help-system/src/reactive/ContextualHelpPanel/ContextualHelpPanel.tsx`:
    /// a doc matches when its `surfaceKey` is either an exact match of, OR a
    /// prefix path of, the active surface key. The match-by-prefix uses GROQ
    /// `string::startsWith` so an article authored against
    /// `designer-portal/pipeline` surfaces on every nested
    /// `designer-portal/pipeline/...` screen.
    ///
    /// Result count is capped at 20 — the panel never needs more in a single
    /// scroll session, and a hard cap protects the UI when a misconfigured
    /// surface key accidentally claims half the article catalogue. Results are
    /// ordered by `surfaceKey` length descending so the most-specific articles
    /// appear first.
    ///
    /// Failure mode: network/HTTP/decoding errors and an empty result set are
    /// both modelled as an empty array — the panel renders the
    /// "no articles for this surface yet" empty state in either case so help
    /// downtime never crashes the UI (spec §13.4).
    ///
    /// - Parameter surfaceKey: A valid surface key from
    ///   `Features/Help/SurfaceKeys.swift`.
    /// - Returns: Up to 20 `HelpArticleSummary` entries, ordered by
    ///   surface-key specificity.
    /// - Throws: `InvalidSurfaceKeyError` when `surfaceKey` is malformed.
    ///   All other failures collapse to an empty array.
    public func fetchArticles(
        forSurfaceKey surfaceKey: SurfaceKey
    ) async throws -> [HelpArticleSummary] {
        try validateSurfaceKey(surfaceKey)

        if let cached = cachedArticleList(for: surfaceKey) {
            return cached
        }

        guard let url = Self.buildArticleListURL(surfaceKey: surfaceKey) else {
            print("[SanityHelpClient] Failed to build article-list URL surfaceKey=\(surfaceKey)")
            articleListCache[surfaceKey] = ArticleListCacheEntry(value: [], storedAt: now())
            return []
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = Self.requestTimeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        do {
            let (data, response) = try await session.data(for: request)
            if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                print(
                    "[SanityHelpClient] Article-list non-2xx status=\(http.statusCode)" +
                    " url=\(url.absoluteString)"
                )
                articleListCache[surfaceKey] = ArticleListCacheEntry(value: [], storedAt: now())
                return []
            }
            let summaries = try decodeArticleList(data: data)
            articleListCache[surfaceKey] = ArticleListCacheEntry(value: summaries, storedAt: now())
            return summaries
        } catch {
            print("[SanityHelpClient] Article-list fetch failed: \(error)")
            // Cache the miss briefly so a transient blip doesn't hammer Sanity.
            articleListCache[surfaceKey] = ArticleListCacheEntry(value: [], storedAt: now())
            return []
        }
    }

    /// Builds the article-list GROQ URL for a given surface key.
    ///
    /// The GROQ query mirrors the web `ContextualHelpPanel` ARTICLES_QUERY:
    ///
    ///   *[_type == "helpContent" && contentType == "helpArticle"
    ///     && (surfaceKey == $sk || string::startsWith($sk, surfaceKey + "/"))]
    ///   | order(length(surfaceKey) desc) [0...20] {
    ///     "_id": _id,
    ///     surfaceKey,
    ///     "title": helpArticleContent.title,
    ///     "summary": helpArticleContent.oneSentenceAnswer
    ///   }
    ///
    /// The projection pulls `title` and `oneSentenceAnswer` out of the nested
    /// `helpArticleContent` object — the Sanity schema stores all article
    /// fields under that object on the parent `helpContent` document
    /// (see `studios/help-system/schemas/helpContent.ts`).
    internal static func buildArticleListURL(surfaceKey: SurfaceKey) -> URL? {
        let query = """
        *[_type == "helpContent" && contentType == "helpArticle" \
        && (surfaceKey == $sk || string::startsWith($sk, surfaceKey + "/"))]\
         | order(length(surfaceKey) desc) [0...20] {\
        "_id": _id, surfaceKey, \
        "title": helpArticleContent.title, \
        "summary": helpArticleContent.oneSentenceAnswer\
        }
        """

        var components = URLComponents()
        components.scheme = "https"
        components.host = "\(projectId).api.sanity.io"
        components.path = "/\(apiVersion)/data/query/\(dataset)"
        components.queryItems = [
            URLQueryItem(name: "query", value: query),
            URLQueryItem(name: "$sk", value: jsonStringLiteral(surfaceKey)),
        ]
        return components.url
    }

    /// Returns a cached article list if the entry is still fresh; otherwise `nil`.
    private func cachedArticleList(for surfaceKey: SurfaceKey) -> [HelpArticleSummary]? {
        guard let entry = articleListCache[surfaceKey] else { return nil }
        if now().timeIntervalSince(entry.storedAt) > Self.cacheTTL {
            articleListCache.removeValue(forKey: surfaceKey)
            return nil
        }
        return entry.value
    }

    /// Decodes a Sanity `{ "result": [...] }` envelope into typed summaries.
    /// Returns an empty array if the envelope's `result` is missing, null, or
    /// not a JSON array.
    private func decodeArticleList(data: Data) throws -> [HelpArticleSummary] {
        let decoder = JSONDecoder()
        let envelope = try decoder.decode(SanityArticleListEnvelope.self, from: data)
        return envelope.result ?? []
    }

    // MARK: - Internals (also exposed for tests via @testable)

    /// One step in the canonical fallback chain — the exact pair of
    /// `(surfaceKey, persona)` values we'll send to Sanity for this attempt.
    /// Wire-level persona is always a non-null string (the `"all"` sentinel
    /// stands in for a `nil`/persona-agnostic caller).
    internal struct FallbackStep: Equatable, Sendable {
        let surfaceKey: SurfaceKey
        let persona: String
    }

    /// Computes the ordered fallback plan for a given (surfaceKey, persona).
    /// Implements the canonical 4-step chain documented in
    /// `packages/help-system/src/persistence/helpContentQuery.md`:
    ///
    ///   1. surfaceKey + persona
    ///   2. surfaceKey + "all"                (skipped iff persona is "all")
    ///   3. parent(surfaceKey) + persona      (skipped iff no parent)
    ///   4. parent(surfaceKey) + "all"        (skipped iff persona is "all"
    ///                                          OR no parent)
    ///
    /// "Parent" is everything before the last `/` in `surfaceKey`. A surface
    /// key without a `/` has no parent — steps 3 and 4 are dropped. The
    /// surface-key regex enforces at least two segments, so in production
    /// the parent always exists.
    ///
    /// A `nil` persona at the call site maps to the wire string `"all"` so
    /// step 1 already targets the persona-agnostic document; step 2 is then
    /// skipped to avoid an identical second request.
    ///
    /// Static + free of side effects so tests can pin the plan without
    /// instantiating the actor or stubbing the network.
    internal static func fallbackPlan(
        surfaceKey: SurfaceKey,
        persona: Persona?
    ) -> [FallbackStep] {
        let wirePersona = persona?.rawValue ?? "all"
        let parent = parentSurfaceKey(surfaceKey)

        var steps: [FallbackStep] = []
        // Step 1 — exact key + exact persona (or "all" when persona is nil).
        steps.append(FallbackStep(surfaceKey: surfaceKey, persona: wirePersona))
        // Step 2 — exact key + "all", iff that's not already step 1.
        if wirePersona != "all" {
            steps.append(FallbackStep(surfaceKey: surfaceKey, persona: "all"))
        }
        // Steps 3 & 4 — parent key fallbacks, iff a parent exists.
        if let parent {
            steps.append(FallbackStep(surfaceKey: parent, persona: wirePersona))
            if wirePersona != "all" {
                steps.append(FallbackStep(surfaceKey: parent, persona: "all"))
            }
        }
        return steps
    }

    /// Returns the parent surface key (everything before the last `/`), or
    /// `nil` if `surfaceKey` has no `/`. Mirrors the `lastIndexOf('/')`
    /// derivation in `packages/help-system/src/hooks/useHelpContent.ts`.
    internal static func parentSurfaceKey(_ surfaceKey: SurfaceKey) -> SurfaceKey? {
        guard let lastSlash = surfaceKey.lastIndex(of: "/") else { return nil }
        let parent = surfaceKey[..<lastSlash]
        return parent.isEmpty ? nil : String(parent)
    }

    /// Builds the GROQ URL for a single fallback step.
    /// Visible to tests so we can pin the URL shape under @testable import.
    internal static func buildQueryURL(
        surfaceKey: SurfaceKey,
        contentType: String,
        personaParam: String
    ) -> URL? {
        // Use parameterized GROQ (`$sk`, `$ct`, `$p`) to keep the query string
        // free of unescaped user-supplied substrings. Surface keys and content
        // types are first-party constants on iOS, but parameterized queries
        // are the right hygiene regardless.
        let query = "*[_type == \"helpContent\" && surfaceKey == $sk && contentType == $ct && persona == $p][0]"

        var components = URLComponents()
        components.scheme = "https"
        components.host = "\(projectId).api.sanity.io"
        components.path = "/\(apiVersion)/data/query/\(dataset)"
        components.queryItems = [
            URLQueryItem(name: "query", value: query),
            // Sanity params are encoded as JSON strings; per the HTTP API:
            //   $sk -> ?$sk=%22designer-portal%2Ftoday%2Fwelcome%22
            URLQueryItem(name: "$sk", value: jsonStringLiteral(surfaceKey)),
            URLQueryItem(name: "$ct", value: jsonStringLiteral(contentType)),
            URLQueryItem(name: "$p", value: jsonStringLiteral(personaParam)),
        ]
        return components.url
    }

    /// Wraps a Swift string in JSON-style double quotes with minimal escaping.
    /// Sanity's HTTP API expects `$param` query values to be JSON literals.
    private static func jsonStringLiteral(_ value: String) -> String {
        var escaped = ""
        escaped.reserveCapacity(value.count + 2)
        escaped.append("\"")
        for scalar in value.unicodeScalars {
            switch scalar {
            case "\"": escaped.append("\\\"")
            case "\\": escaped.append("\\\\")
            case "\n": escaped.append("\\n")
            case "\r": escaped.append("\\r")
            case "\t": escaped.append("\\t")
            default:
                if scalar.value < 0x20 {
                    escaped.append(String(format: "\\u%04x", scalar.value))
                } else {
                    escaped.append(Character(scalar))
                }
            }
        }
        escaped.append("\"")
        return escaped
    }

    // MARK: - Private helpers

    /// Returns a cached value if the entry is still fresh; otherwise `nil`.
    private func cachedValue(for key: CacheKey) -> HelpContent?? {
        guard let entry = cache[key] else { return nil }
        if now().timeIntervalSince(entry.storedAt) > Self.cacheTTL {
            cache.removeValue(forKey: key)
            return nil
        }
        // Note: the outer Optional disambiguates "not in cache" (`nil`) from
        // "cached miss" (`.some(nil)`).
        return .some(entry.value)
    }

    /// Performs one GROQ fetch for a specific surfaceKey/contentType/persona
    /// triple. Returns `nil` for missing content, transport errors, non-2xx
    /// responses, and decoding failures.
    private func tryFetch(
        surfaceKey: SurfaceKey,
        contentType: String,
        persona: String
    ) async -> HelpContent? {
        guard let url = Self.buildQueryURL(
            surfaceKey: surfaceKey,
            contentType: contentType,
            personaParam: persona
        ) else {
            print("[SanityHelpClient] Failed to build query URL surfaceKey=\(surfaceKey)")
            return nil
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = Self.requestTimeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        do {
            let (data, response) = try await session.data(for: request)
            if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                print("[SanityHelpClient] Non-2xx status=\(http.statusCode) url=\(url.absoluteString)")
                return nil
            }
            return try decode(data: data)
        } catch {
            print("[SanityHelpClient] Sanity fetch failed: \(error)")
            return nil
        }
    }

    /// Decodes a Sanity `{ "result": <doc?> }` envelope into a `HelpContent`.
    /// Returns `nil` if `result` is null or an empty array.
    private func decode(data: Data) throws -> HelpContent? {
        let decoder = JSONDecoder()
        // Sanity's query API returns either:
        //   { "result": null }                 — no match
        //   { "result": { ...helpContent } }   — single doc when query ends with `[0]`
        //   { "result": [ ...docs ] }          — array form (defensive fallback)
        let envelope = try decoder.decode(SanityEnvelope.self, from: data)
        switch envelope.result {
        case .none:
            return nil
        case .some(let value):
            return try value.decodeFirst(using: decoder)
        }
    }
}

// MARK: - URLSession abstraction (for testability)

/// Narrow protocol that lets `SanityHelpClient` accept either `URLSession.shared`
/// or a stub in tests without forcing the full `URLSession` API surface on the
/// stub. Mirrors the pattern in Apple's URLSession async test recipes.
public protocol URLSessionProtocol: Sendable {
    func data(for request: URLRequest) async throws -> (Data, URLResponse)
}

extension URLSession: URLSessionProtocol {}

// MARK: - Sanity envelope

/// Wire-level wrapper for the Sanity query API. The `result` field can be
/// `null`, a single document object, or an array of documents — we accept
/// all three and surface the first hit.
private struct SanityEnvelope: Decodable {
    let result: SanityResultBox?

    enum CodingKeys: String, CodingKey { case result }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if try container.decodeNil(forKey: .result) {
            self.result = nil
        } else {
            self.result = try container.decode(SanityResultBox.self, forKey: .result)
        }
    }
}

/// Discriminated form of the `result` payload — either a single object or
/// an array. Decoded eagerly into a typed enum so callers don't need to
/// re-encode/decode to figure out the shape.
private enum SanityResultBox: Decodable {
    case object(JSONValue)
    case array([JSONValue])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let arr = try? container.decode([JSONValue].self) {
            self = .array(arr)
        } else {
            self = .object(try container.decode(JSONValue.self))
        }
    }

    /// Re-encodes the wrapped payload as JSON and decodes it into a
    /// `HelpContent`. For arrays, picks the first element; for empty arrays
    /// returns `nil`.
    func decodeFirst(using decoder: JSONDecoder) throws -> HelpContent? {
        let encoder = JSONEncoder()
        switch self {
        case .object(let value):
            if case .null = value { return nil }
            let payload = try encoder.encode(value)
            return try decoder.decode(HelpContent.self, from: payload)
        case .array(let values):
            guard let first = values.first else { return nil }
            if case .null = first { return nil }
            let payload = try encoder.encode(first)
            return try decoder.decode(HelpContent.self, from: payload)
        }
    }
}

// MARK: - HelpArticleSummary

/// Lightweight projection of a `helpContent` document for list rendering in
/// the iOS Help Panel. Mirrors the web `PanelArticle` shape in
/// `ContextualHelpPanel.tsx`, minus the inline-excerpt field (the iOS panel
/// renders the one-sentence answer as the row summary; full-article body
/// rendering is deferred to Sprint 3 Stream E).
///
/// `id` corresponds to the Sanity document `_id`, which doubles as the
/// article key used in `HelpAnalytics.articleOpened`. We expose it as a
/// `String` rather than wrapping it because Sanity IDs are opaque strings
/// and consumers don't need a stronger type.
public struct HelpArticleSummary: Identifiable, Equatable, Sendable, Decodable {
    public let id: String
    public let surfaceKey: String
    public let title: String
    public let summary: String

    private enum CodingKeys: String, CodingKey {
        case id = "_id"
        case surfaceKey
        case title
        case summary
    }

    public init(
        id: String,
        surfaceKey: String,
        title: String,
        summary: String
    ) {
        self.id = id
        self.surfaceKey = surfaceKey
        self.title = title
        self.summary = summary
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let decodedId = try container.decode(String.self, forKey: .id)
        let decodedSurfaceKey = try container.decode(String.self, forKey: .surfaceKey)
        self.id = decodedId
        self.surfaceKey = decodedSurfaceKey
        // The projection in `buildArticleListURL` aliases
        // `helpArticleContent.title` and `helpArticleContent.oneSentenceAnswer`
        // as top-level `title` / `summary`. Defensive fallbacks: a missing
        // title falls back to the surface key; a missing summary is empty.
        self.title = (try? container.decode(String.self, forKey: .title)) ?? decodedSurfaceKey
        self.summary = (try? container.decode(String.self, forKey: .summary)) ?? ""
    }
}

// MARK: - Article list envelope

/// Wire-level wrapper for the article-list GROQ response. The query returns
/// `{"result": [ ...summaries ]}`; we accept a missing or null `result` as an
/// empty list so callers always get a usable array.
private struct SanityArticleListEnvelope: Decodable {
    let result: [HelpArticleSummary]?

    enum CodingKeys: String, CodingKey { case result }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if (try? container.decodeNil(forKey: .result)) == true {
            self.result = []
            return
        }
        // Defensive: skip rows that fail to decode rather than blowing up the
        // whole list. CMS authors may publish partial documents during
        // schema-migration windows.
        if let rows = try? container.decode([FailableArticleSummary].self, forKey: .result) {
            self.result = rows.compactMap { $0.value }
        } else {
            self.result = []
        }
    }
}

/// Wrapper that lets us decode an array of `HelpArticleSummary` and tolerate
/// individual row failures without failing the entire response.
private struct FailableArticleSummary: Decodable {
    let value: HelpArticleSummary?

    init(from decoder: Decoder) throws {
        self.value = try? HelpArticleSummary(from: decoder)
    }
}
