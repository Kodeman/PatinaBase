//
//  MediaUploadIntentClientTests.swift
//  PatinaTests
//
//  The upload-intent client against a stubbed transport. Establishes the
//  first `URLProtocol` stub in this app — there was none to reuse.
//

import Testing
import Foundation
@testable import Patina

// MARK: - Transport stub

struct StubbedResponse: Sendable {
    var status: Int
    var body: Data
    init(status: Int, json: String) {
        self.status = status
        self.body = Data(json.utf8)
    }
    init(status: Int, raw: String) {
        self.status = status
        self.body = Data(raw.utf8)
    }
}

/// Shared, lock-guarded stub state. A class rather than static `var`s so the
/// tests hold no unsynchronised global mutable state.
final class UploadStubRegistry: @unchecked Sendable {
    static let shared = UploadStubRegistry()

    struct Recorded: Sendable {
        let method: String
        let url: String
        let headers: [String: String]
    }

    private let lock = NSLock()
    private var responses: [StubbedResponse] = []
    private var seen: [Recorded] = []

    func reset(_ queued: [StubbedResponse]) {
        lock.lock(); defer { lock.unlock() }
        responses = queued
        seen = []
    }

    func next() -> StubbedResponse {
        lock.lock(); defer { lock.unlock() }
        guard !responses.isEmpty else {
            return StubbedResponse(status: 599, raw: "no stub queued")
        }
        return responses.removeFirst()
    }

    func record(_ request: URLRequest) {
        lock.lock(); defer { lock.unlock() }
        seen.append(
            Recorded(
                method: request.httpMethod ?? "?",
                url: request.url?.absoluteString ?? "",
                headers: request.allHTTPHeaderFields ?? [:]
            )
        )
    }

    var requests: [Recorded] {
        lock.lock(); defer { lock.unlock() }
        return seen
    }
}

class StubURLProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        UploadStubRegistry.shared.record(request)
        let stub = UploadStubRegistry.shared.next()
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: stub.status,
            httpVersion: "HTTP/1.1",
            headerFields: [:]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: stub.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

// MARK: - Fixtures

private func stubbedSession() -> URLSession {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [StubURLProtocol.self]
    return URLSession(configuration: config)
}

private let scanId = UUID(uuidString: "2f1b0a1e-0000-4000-8000-000000000001")!
private let uploadId = "9c3f5a1d-0000-4000-8000-0000000000aa"

struct UploadFixture {
    let url: URL
    let sha: String
    let size: Int
}

/// 11 bytes, so `content-length` is a fact the test can assert rather than a
/// number it invented.
private func fixtureFile() throws -> UploadFixture {
    let url = FileManager.default.temporaryDirectory
        .appendingPathComponent("shadow-\(UUID().uuidString).bin")
    try Data("hello world".utf8).write(to: url)
    return UploadFixture(
        url: url,
        sha: try MediaUploadIntentClient.sha256Hex(ofFileAt: url),
        size: try MediaUploadIntentClient.fileSize(ofFileAt: url)
    )
}

private func makeClient(
    session: URLSession,
    token: String? = "token-1",
    onRefresh: @escaping @Sendable () -> Void = {}
) -> MediaUploadIntentClient {
    MediaUploadIntentClient(
        baseURL: URL(string: "https://edge.example.test")!,
        session: session,
        accessToken: { token },
        refreshSession: { onRefresh() }
    )
}

private func intentBody(sha: String, size: Int) -> String {
    """
    {"uploadId":"\(uploadId)",
     "putUrl":"https://r2.example.test/scan_originals/o?sig=1",
     "expiresAt":"2026-08-19T00:30:00Z",
     "requiredHeaders":{"content-length":"\(size)","x-amz-checksum-sha256":"\(sha)-b64"}}
    """
}

private func confirmedBody(sha: String) -> String {
    """
    {"uploadId":"\(uploadId)","lifecycle":"stored","sha256":"\(sha)","etag":"abc","sizeBytes":11}
    """
}

private func request(sha: String, size: Int) -> MediaUploadIntentClient.IntentRequest {
    MediaUploadIntentClient.IntentRequest(
        scanId: scanId,
        artifactKind: .usdz,
        filename: "scan.usdz",
        declaredSha256: sha,
        declaredSize: size,
        declaredMime: "model/vnd.usdz+zip"
    )
}

// MARK: - Tests

/// THE suite for everything driving the shared `UploadStubRegistry` — the
/// shadow-leg cases in `ScanUploadShadowLegTests.swift` join it by extension.
/// Swift Testing runs cases in parallel by default, and one global stub queue
/// cannot serve two at once; `.serialized` is what makes the queue safe, so
/// stub-driven cases must live here rather than in a suite of their own.
@Suite(.serialized)
struct StubbedEdgeUploadTests {

    @Test
    func happyPathIssuesIntentThenPutThenConfirm() async throws {
        let file = try fixtureFile()
        UploadStubRegistry.shared.reset([
            StubbedResponse(status: 201, json: intentBody(sha: file.sha, size: file.size)),
            StubbedResponse(status: 200, raw: ""),
            StubbedResponse(status: 200, json: confirmedBody(sha: file.sha))
        ])

        let client = makeClient(session: stubbedSession())
        let confirmation = try await client.upload(
            fileAt: file.url,
            request: request(sha: file.sha, size: file.size)
        )

        #expect(confirmation.uploadId == uploadId)
        #expect(confirmation.lifecycle == "stored")
        #expect(confirmation.sha256 == file.sha)
        #expect(confirmation.sizeBytes == 11)

        let seen = UploadStubRegistry.shared.requests
        #expect(seen.count == 3)
        #expect(seen[0].url.hasSuffix("/v1/media/uploads"))
        #expect(seen[0].headers["Authorization"] == "Bearer token-1")
        #expect(seen[1].method == "PUT")
        #expect(seen[2].url.hasSuffix("/v1/media/uploads/\(uploadId)/confirm"))
    }

    /// The signed condition is sent VERBATIM. If this drifts, every real PUT
    /// fails at R2 as SignatureDoesNotMatch with nothing to read.
    @Test
    func putCarriesTheRequiredChecksumHeaderExactly() async throws {
        let file = try fixtureFile()
        UploadStubRegistry.shared.reset([
            StubbedResponse(status: 200, json: intentBody(sha: file.sha, size: file.size)),
            StubbedResponse(status: 200, raw: ""),
            StubbedResponse(status: 200, json: confirmedBody(sha: file.sha))
        ])

        let client = makeClient(session: stubbedSession())
        _ = try await client.upload(fileAt: file.url, request: request(sha: file.sha, size: file.size))

        let put = UploadStubRegistry.shared.requests[1]
        #expect(put.headers["x-amz-checksum-sha256"] == "\(file.sha)-b64")
    }

    @Test
    func badDigestIsSurfacedDistinctly() async throws {
        let file = try fixtureFile()
        UploadStubRegistry.shared.reset([
            StubbedResponse(status: 201, json: intentBody(sha: file.sha, size: file.size)),
            StubbedResponse(
                status: 400,
                raw: "<Error><Code>BadDigest</Code><Message>The SHA-256 checksum you specified did not match</Message></Error>"
            )
        ])

        let client = makeClient(session: stubbedSession())
        var caught: MediaUploadIntentClient.ClientError?
        do {
            _ = try await client.upload(fileAt: file.url, request: request(sha: file.sha, size: file.size))
        } catch let error as MediaUploadIntentClient.ClientError {
            caught = error
        }
        guard case .badDigest = caught else {
            Issue.record("expected .badDigest, got \(String(describing: caught))")
            return
        }
    }

    @Test
    func otherPutFailuresKeepTheirStatusAndCode() async throws {
        let file = try fixtureFile()
        UploadStubRegistry.shared.reset([
            StubbedResponse(status: 201, json: intentBody(sha: file.sha, size: file.size)),
            StubbedResponse(status: 403, raw: "<Error><Code>SignatureDoesNotMatch</Code></Error>")
        ])

        let client = makeClient(session: stubbedSession())
        do {
            _ = try await client.upload(fileAt: file.url, request: request(sha: file.sha, size: file.size))
            Issue.record("expected a throw")
        } catch let error as MediaUploadIntentClient.ClientError {
            guard case .putFailed(let status, let code) = error else {
                Issue.record("expected .putFailed, got \(error)")
                return
            }
            #expect(status == 403)
            #expect(code == "SignatureDoesNotMatch")
        }
    }

    /// 409 leaves the registry row `pending`, so a re-PUT is the interface's
    /// own prescribed answer — made exactly once.
    @Test
    func mismatchRePutsOnceAndSucceeds() async throws {
        let file = try fixtureFile()
        UploadStubRegistry.shared.reset([
            StubbedResponse(status: 201, json: intentBody(sha: file.sha, size: file.size)),
            StubbedResponse(status: 200, raw: ""),
            StubbedResponse(status: 409, json: #"{"error":"upload_mismatch","reason":"size"}"#),
            StubbedResponse(status: 200, raw: ""),
            StubbedResponse(status: 200, json: confirmedBody(sha: file.sha))
        ])

        let client = makeClient(session: stubbedSession())
        let confirmation = try await client.upload(
            fileAt: file.url,
            request: request(sha: file.sha, size: file.size)
        )

        #expect(confirmation.lifecycle == "stored")
        let puts = UploadStubRegistry.shared.requests.filter { $0.method == "PUT" }
        #expect(puts.count == 2)
    }

    @Test
    func secondMismatchIsSurfaced() async throws {
        let file = try fixtureFile()
        UploadStubRegistry.shared.reset([
            StubbedResponse(status: 201, json: intentBody(sha: file.sha, size: file.size)),
            StubbedResponse(status: 200, raw: ""),
            StubbedResponse(status: 409, json: #"{"error":"upload_mismatch","reason":"checksum"}"#),
            StubbedResponse(status: 200, raw: ""),
            StubbedResponse(status: 409, json: #"{"error":"upload_mismatch","reason":"checksum"}"#)
        ])

        let client = makeClient(session: stubbedSession())
        do {
            _ = try await client.upload(fileAt: file.url, request: request(sha: file.sha, size: file.size))
            Issue.record("expected a throw")
        } catch let error as MediaUploadIntentClient.ClientError {
            guard case .mismatch(let reason) = error else {
                Issue.record("expected .mismatch, got \(error)")
                return
            }
            #expect(reason == "checksum")
        }
        let puts = UploadStubRegistry.shared.requests.filter { $0.method == "PUT" }
        #expect(puts.count == 2)
    }

    /// A 200 with no `putUrl` is the interface saying the object has landed.
    /// Nothing is sent and nothing is confirmed.
    @Test
    func alreadyStoredSkipsPutAndConfirm() async throws {
        let file = try fixtureFile()
        UploadStubRegistry.shared.reset([
            StubbedResponse(status: 200, json: #"{"uploadId":"\#(uploadId)","lifecycle":"verified"}"#)
        ])

        let client = makeClient(session: stubbedSession())
        let confirmation = try await client.upload(
            fileAt: file.url,
            request: request(sha: file.sha, size: file.size)
        )

        #expect(confirmation.lifecycle == "verified")
        #expect(confirmation.sha256 == file.sha)
        #expect(UploadStubRegistry.shared.requests.count == 1)
    }

    @Test
    func unauthorizedRefreshesOnceThenRetries() async throws {
        let file = try fixtureFile()
        UploadStubRegistry.shared.reset([
            StubbedResponse(status: 401, json: #"{"error":"unauthorized"}"#),
            StubbedResponse(status: 201, json: intentBody(sha: file.sha, size: file.size)),
            StubbedResponse(status: 200, raw: ""),
            StubbedResponse(status: 200, json: confirmedBody(sha: file.sha))
        ])

        let refreshes = Counter()
        let client = makeClient(session: stubbedSession(), onRefresh: { refreshes.bump() })
        let confirmation = try await client.upload(
            fileAt: file.url,
            request: request(sha: file.sha, size: file.size)
        )

        #expect(confirmation.lifecycle == "stored")
        #expect(refreshes.value == 1)
    }

    @Test
    func repeatedUnauthorizedGivesUpAfterOneRefresh() async throws {
        let file = try fixtureFile()
        UploadStubRegistry.shared.reset([
            StubbedResponse(status: 401, json: #"{"error":"unauthorized"}"#),
            StubbedResponse(status: 401, json: #"{"error":"unauthorized"}"#)
        ])

        let refreshes = Counter()
        let client = makeClient(session: stubbedSession(), onRefresh: { refreshes.bump() })
        do {
            _ = try await client.upload(fileAt: file.url, request: request(sha: file.sha, size: file.size))
            Issue.record("expected a throw")
        } catch let error as MediaUploadIntentClient.ClientError {
            guard case .unauthorized = error else {
                Issue.record("expected .unauthorized, got \(error)")
                return
            }
        }
        #expect(refreshes.value == 1)
        #expect(UploadStubRegistry.shared.requests.count == 2)
    }

    @Test
    func notFoundIsTyped() async throws {
        let file = try fixtureFile()
        UploadStubRegistry.shared.reset([
            StubbedResponse(status: 404, json: #"{"error":"not_found"}"#)
        ])

        let client = makeClient(session: stubbedSession())
        do {
            _ = try await client.upload(fileAt: file.url, request: request(sha: file.sha, size: file.size))
            Issue.record("expected a throw")
        } catch let error as MediaUploadIntentClient.ClientError {
            guard case .notFound = error else {
                Issue.record("expected .notFound, got \(error)")
                return
            }
        }
    }

    @Test
    func missingSessionNeverReachesTheNetwork() async throws {
        let file = try fixtureFile()
        UploadStubRegistry.shared.reset([])

        let client = makeClient(session: stubbedSession(), token: nil)
        do {
            _ = try await client.upload(fileAt: file.url, request: request(sha: file.sha, size: file.size))
            Issue.record("expected a throw")
        } catch let error as MediaUploadIntentClient.ClientError {
            guard case .missingSession = error else {
                Issue.record("expected .missingSession, got \(error)")
                return
            }
        }
        #expect(UploadStubRegistry.shared.requests.isEmpty)
    }

    @Test
    func sha256AndSizeAreMeasuredOffDisk() throws {
        let file = try fixtureFile()
        // sha256("hello world")
        #expect(file.sha == "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9")
        #expect(file.size == 11)
    }

    @Test
    func r2ErrorCodeIsReadFromAnXmlBody() {
        let body = Data("<Error><Code>EntityTooLarge</Code><Message>x</Message></Error>".utf8)
        #expect(MediaUploadIntentClient.r2ErrorCode(in: body) == "EntityTooLarge")
        #expect(MediaUploadIntentClient.r2ErrorCode(in: Data("not xml".utf8)) == nil)
    }
}

/// Minimal thread-safe counter for closure call counts.
final class Counter: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0
    func bump() { lock.lock(); count += 1; lock.unlock() }
    var value: Int { lock.lock(); defer { lock.unlock() }; return count }
}
