//  MediaUploadIntentClientTests.swift
//  CaptureTests
//
//  The upload-intent client against a stubbed transport. Ported alongside
//  `CaptureKit/SiteScan/MediaUploadIntentClient.swift` from the client app's
//  `PatinaTests/MediaUploadIntentClientTests.swift` (W3-B). Establishes the
//  first `URLProtocol` stub in this test target — there was none to reuse.

import Testing
import Foundation
@testable import CaptureKit

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

/// Lock-guarded call counter — the tests count refreshes and shadow runs from
/// closures that are not main-actor bound.
final class TestCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0
    func bump() { lock.lock(); count += 1; lock.unlock() }
    var value: Int { lock.lock(); defer { lock.unlock() }; return count }
}

// MARK: - Fixtures

func stubbedUploadSession() -> URLSession {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [StubURLProtocol.self]
    return URLSession(configuration: config)
}

let stubScanId = UUID(uuidString: "2f1b0a1e-0000-4000-8000-000000000001")!
let stubUploadId = "9c3f5a1d-0000-4000-8000-0000000000aa"

struct UploadFixture {
    let url: URL
    let sha: String
    let size: Int
}

/// 11 bytes, so `content-length` is a fact the test can assert rather than a
/// number it invented.
func makeUploadFixture() throws -> UploadFixture {
    let url = FileManager.default.temporaryDirectory
        .appendingPathComponent("shadow-\(UUID().uuidString).bin")
    try Data("hello world".utf8).write(to: url)
    return UploadFixture(
        url: url,
        sha: try MediaUploadIntentClient.sha256Hex(ofFileAt: url),
        size: try MediaUploadIntentClient.fileSize(ofFileAt: url)
    )
}

func makeIntentClient(
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

func intentBody(sha: String, size: Int) -> String {
    """
    {"uploadId":"\(stubUploadId)",
     "putUrl":"https://r2.example.test/scan_originals/o?sig=1",
     "expiresAt":"2026-08-19T00:30:00Z",
     "requiredHeaders":{"content-length":"\(size)","x-amz-checksum-sha256":"\(sha)-b64"}}
    """
}

func confirmedBody(sha: String) -> String {
    """
    {"uploadId":"\(stubUploadId)","lifecycle":"stored","sha256":"\(sha)","etag":"abc","sizeBytes":11}
    """
}

private func request(sha: String, size: Int) -> MediaUploadIntentClient.IntentRequest {
    MediaUploadIntentClient.IntentRequest(
        scanId: stubScanId,
        artifactKind: .usdz,
        filename: "scan.usdz",
        declaredSha256: sha,
        declaredSize: size,
        declaredMime: "model/vnd.usdz+zip"
    )
}

// MARK: - Tests

/// THE suite for everything driving the shared `UploadStubRegistry` — the
/// shadow-leg cases in `FieldScanUploadShadowLegTests.swift` join it by
/// extension. Swift Testing runs cases in parallel by default, and one global
/// stub queue cannot serve two at once; `.serialized` is what makes the queue
/// safe, so stub-driven cases must live here rather than in a suite of their own.
@Suite(.serialized)
struct StubbedEdgeUploadTests {

    @Test
    func happyPathIssuesIntentThenPutThenConfirm() async throws {
        let fixture = try makeUploadFixture()
        UploadStubRegistry.shared.reset([
            StubbedResponse(status: 201, json: intentBody(sha: fixture.sha, size: fixture.size)),
            StubbedResponse(status: 200, raw: ""),
            StubbedResponse(status: 200, json: confirmedBody(sha: fixture.sha))
        ])

        let client = makeIntentClient(session: stubbedUploadSession())
        let confirmation = try await client.upload(
            fileAt: fixture.url,
            request: request(sha: fixture.sha, size: fixture.size)
        )

        #expect(confirmation.uploadId == stubUploadId)
        #expect(confirmation.lifecycle == "stored")
        #expect(confirmation.sha256 == fixture.sha)

        let seen = UploadStubRegistry.shared.requests
        #expect(seen.count == 3)
        #expect(seen[0].method == "POST")
        #expect(seen[0].url == "https://edge.example.test/v1/media/uploads")
        #expect(seen[1].method == "PUT")
        #expect(seen[2].url.hasSuffix("/v1/media/uploads/\(stubUploadId)/confirm"))
    }

    @Test
    func putCarriesTheRequiredChecksumHeaderExactly() async throws {
        let fixture = try makeUploadFixture()
        UploadStubRegistry.shared.reset([
            StubbedResponse(status: 201, json: intentBody(sha: fixture.sha, size: fixture.size)),
            StubbedResponse(status: 200, raw: ""),
            StubbedResponse(status: 200, json: confirmedBody(sha: fixture.sha))
        ])

        let client = makeIntentClient(session: stubbedUploadSession())
        _ = try await client.upload(
            fileAt: fixture.url,
            request: request(sha: fixture.sha, size: fixture.size)
        )

        let put = UploadStubRegistry.shared.requests[1]
        #expect(put.headers["x-amz-checksum-sha256"] == "\(fixture.sha)-b64")
    }

    /// A 400 BadDigest from R2 is the one PUT failure that means the bytes
    /// changed under us — it must never blur into a generic transport failure.
    @Test
    func badDigestIsSurfacedDistinctly() async throws {
        let fixture = try makeUploadFixture()
        UploadStubRegistry.shared.reset([
            StubbedResponse(status: 201, json: intentBody(sha: fixture.sha, size: fixture.size)),
            StubbedResponse(
                status: 400,
                raw: "<Error><Code>BadDigest</Code><Message>no</Message></Error>"
            )
        ])

        do {
            _ = try await makeIntentClient(session: stubbedUploadSession()).upload(
                fileAt: fixture.url,
                request: request(sha: fixture.sha, size: fixture.size)
            )
            Issue.record("expected badDigest")
        } catch MediaUploadIntentClient.ClientError.badDigest {
            // the one outcome this case exists to name
        }
    }

    @Test
    func otherPutFailuresKeepTheirStatusAndCode() async throws {
        let fixture = try makeUploadFixture()
        UploadStubRegistry.shared.reset([
            StubbedResponse(status: 201, json: intentBody(sha: fixture.sha, size: fixture.size)),
            StubbedResponse(
                status: 403,
                raw: "<Error><Code>SignatureDoesNotMatch</Code></Error>"
            )
        ])

        do {
            _ = try await makeIntentClient(session: stubbedUploadSession()).upload(
                fileAt: fixture.url,
                request: request(sha: fixture.sha, size: fixture.size)
            )
            Issue.record("expected putFailed")
        } catch MediaUploadIntentClient.ClientError.putFailed(let status, let code) {
            #expect(status == 403)
            #expect(code == "SignatureDoesNotMatch")
        }
    }

    /// 409 leaves the registry row `pending`, so the interface's own answer is
    /// to re-PUT. Exactly once.
    @Test
    func mismatchRePutsOnceAndSucceeds() async throws {
        let fixture = try makeUploadFixture()
        UploadStubRegistry.shared.reset([
            StubbedResponse(status: 201, json: intentBody(sha: fixture.sha, size: fixture.size)),
            StubbedResponse(status: 200, raw: ""),
            StubbedResponse(status: 409, json: #"{"reason":"upload_mismatch"}"#),
            StubbedResponse(status: 200, raw: ""),
            StubbedResponse(status: 200, json: confirmedBody(sha: fixture.sha))
        ])

        let confirmation = try await makeIntentClient(session: stubbedUploadSession()).upload(
            fileAt: fixture.url,
            request: request(sha: fixture.sha, size: fixture.size)
        )

        #expect(confirmation.lifecycle == "stored")
        let methods = UploadStubRegistry.shared.requests.map(\.method)
        #expect(methods == ["POST", "PUT", "POST", "PUT", "POST"])
    }

    @Test
    func secondMismatchIsSurfaced() async throws {
        let fixture = try makeUploadFixture()
        UploadStubRegistry.shared.reset([
            StubbedResponse(status: 201, json: intentBody(sha: fixture.sha, size: fixture.size)),
            StubbedResponse(status: 200, raw: ""),
            StubbedResponse(status: 409, json: #"{"reason":"upload_mismatch"}"#),
            StubbedResponse(status: 200, raw: ""),
            StubbedResponse(status: 409, json: #"{"reason":"upload_mismatch"}"#)
        ])

        do {
            _ = try await makeIntentClient(session: stubbedUploadSession()).upload(
                fileAt: fixture.url,
                request: request(sha: fixture.sha, size: fixture.size)
            )
            Issue.record("expected mismatch")
        } catch MediaUploadIntentClient.ClientError.mismatch(let reason) {
            #expect(reason == "upload_mismatch")
        }
        // Five calls and no sixth: the retry budget is one re-PUT.
        #expect(UploadStubRegistry.shared.requests.count == 5)
    }

    /// A 200 with no `putUrl` is the interface saying the object already landed.
    @Test
    func alreadyStoredSkipsPutAndConfirm() async throws {
        let fixture = try makeUploadFixture()
        UploadStubRegistry.shared.reset([
            StubbedResponse(
                status: 200,
                json: #"{"uploadId":"\#(stubUploadId)","lifecycle":"verified"}"#
            )
        ])

        let confirmation = try await makeIntentClient(session: stubbedUploadSession()).upload(
            fileAt: fixture.url,
            request: request(sha: fixture.sha, size: fixture.size)
        )

        #expect(confirmation.lifecycle == "verified")
        #expect(confirmation.sha256 == fixture.sha)
        #expect(UploadStubRegistry.shared.requests.count == 1)
    }

    @Test
    func unauthorizedRefreshesOnceThenRetries() async throws {
        let fixture = try makeUploadFixture()
        UploadStubRegistry.shared.reset([
            StubbedResponse(status: 401, json: #"{"error":"unauthorized"}"#),
            StubbedResponse(status: 201, json: intentBody(sha: fixture.sha, size: fixture.size)),
            StubbedResponse(status: 200, raw: ""),
            StubbedResponse(status: 200, json: confirmedBody(sha: fixture.sha))
        ])

        let refreshes = TestCounter()
        let client = makeIntentClient(
            session: stubbedUploadSession(),
            onRefresh: { refreshes.bump() }
        )
        let confirmation = try await client.upload(
            fileAt: fixture.url,
            request: request(sha: fixture.sha, size: fixture.size)
        )

        #expect(confirmation.lifecycle == "stored")
        #expect(refreshes.value == 1)
    }

    @Test
    func repeatedUnauthorizedGivesUpAfterOneRefresh() async throws {
        let fixture = try makeUploadFixture()
        UploadStubRegistry.shared.reset([
            StubbedResponse(status: 401, json: "{}"),
            StubbedResponse(status: 401, json: "{}")
        ])

        let refreshes = TestCounter()
        do {
            _ = try await makeIntentClient(
                session: stubbedUploadSession(),
                onRefresh: { refreshes.bump() }
            ).upload(fileAt: fixture.url, request: request(sha: fixture.sha, size: fixture.size))
            Issue.record("expected unauthorized")
        } catch MediaUploadIntentClient.ClientError.unauthorized {
            #expect(refreshes.value == 1)
        }
    }

    @Test
    func notFoundIsTyped() async throws {
        let fixture = try makeUploadFixture()
        UploadStubRegistry.shared.reset([StubbedResponse(status: 404, json: "{}")])

        do {
            _ = try await makeIntentClient(session: stubbedUploadSession()).upload(
                fileAt: fixture.url,
                request: request(sha: fixture.sha, size: fixture.size)
            )
            Issue.record("expected notFound")
        } catch MediaUploadIntentClient.ClientError.notFound {
            // typed, and deliberately identical for all four server-side causes
        }
    }

    @Test
    func missingSessionNeverReachesTheNetwork() async throws {
        let fixture = try makeUploadFixture()
        UploadStubRegistry.shared.reset([])

        do {
            _ = try await makeIntentClient(
                session: stubbedUploadSession(),
                token: nil
            ).upload(fileAt: fixture.url, request: request(sha: fixture.sha, size: fixture.size))
            Issue.record("expected missingSession")
        } catch MediaUploadIntentClient.ClientError.missingSession {
            #expect(UploadStubRegistry.shared.requests.isEmpty)
        }
    }
}

// MARK: - Pure helpers (no stub queue)

struct MediaUploadIntentPureTests {

    @Test
    func sha256AndSizeAreMeasuredOffDisk() throws {
        let fixture = try makeUploadFixture()
        #expect(fixture.size == 11)
        // Same file, same algorithm as the primary path's checksum helper.
        #expect(fixture.sha == BundleChecksum.sha256(ofFile: fixture.url))
    }

    @Test
    func r2ErrorCodeIsReadFromAnXmlBody() {
        let body = Data("<Error><Code>BadDigest</Code><Message>x</Message></Error>".utf8)
        #expect(MediaUploadIntentClient.r2ErrorCode(in: body) == "BadDigest")
        #expect(MediaUploadIntentClient.r2ErrorCode(in: Data("not xml".utf8)) == nil)
    }
}
