//
//  SanityHelpClient.swift
//  Patina
//
//  Lightweight Swift client for the Sanity public read API, scoped to the
//  Help & Guidance System. Mirrors the persona-fallback semantics of the
//  web `useHelpContent` hook in `packages/help-system/src/hooks/useHelpContent.ts`,
//  with the iOS-specific persona chain defined in spec §7.3.
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
    /// content type, applying the iOS persona fallback chain:
    ///
    ///   1. Exact persona match
    ///   2. If `persona` is `.consumer` or `.maker`, fall back to `.designer`
    ///      (designer copy is the canonical authored variant per spec)
    ///   3. Persona-agnostic content (Sanity's `persona == "all"` sentinel,
    ///      which the iOS module models as `nil` on the call side)
    ///   4. Return `nil`
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
    ///   - persona:    The current user's persona, or `nil` to skip
    ///                  directly to the persona-agnostic step.
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

        let chain = personaFallbackChain(for: persona)
        for candidate in chain {
            if let hit = await tryFetch(
                surfaceKey: surfaceKey,
                contentType: contentType,
                persona: candidate
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
            " contentType=\(contentType) persona=\(persona?.rawValue ?? "nil")"
        )
        return nil
    }

    /// Clears the in-memory cache. Use sparingly — typically only on sign-out
    /// (persona may change) or when the app receives a CMS-invalidation push.
    public func clearCache() {
        cache.removeAll(keepingCapacity: true)
    }

    // MARK: - Internals (also exposed for tests via @testable)

    /// Computes the ordered persona-candidate list for the fallback chain.
    /// Each candidate is a wire-level persona token to query Sanity with.
    ///
    /// - `.designer` → `["designer", "all"]`
    /// - `.admin`    → `["admin", "all"]`
    /// - `.consumer` → `["consumer", "designer", "all"]`
    /// - `.maker`    → `["maker", "designer", "all"]`
    /// - `nil`        → `["all"]`
    internal func personaFallbackChain(for persona: Persona?) -> [String] {
        guard let persona else { return ["all"] }
        switch persona {
        case .designer, .admin:
            return [persona.rawValue, "all"]
        case .consumer, .maker:
            return [persona.rawValue, Persona.designer.rawValue, "all"]
        }
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
