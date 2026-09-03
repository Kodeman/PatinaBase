//
//  TestAccountLoginFallbackTests.swift
//  PatinaTests
//
//  A3-16 / ruling D7 — the advertised tester credential works in the app.
//
//  Grepping all 435 Swift files for `test-account-login` returned nothing: the
//  fallback existed only in the designer portal
//  (`apps/designer-portal/src/app/auth/test-account-fallback.ts`), so the
//  invite's instruction failed on the tester's first act.
//
//  The contract this pins, from `supabase/functions/test-account-login/lib.ts`:
//  POST `{email, code}` → 200 `{token_hash}` on a match, and the SAME generic
//  403 for every miss so the caller can never learn who is allow-listed. The
//  caller redeems the hash with `type: magiclink`.
//

import Foundation
import Testing
@testable import Patina

struct TestAccountLoginFallbackTests {

    private func fallback(
        mint: @escaping @Sendable (String, String) async throws -> TestAccountLoginResponse,
        redeem: @escaping @Sendable (String) async throws -> Bool = { _ in true }
    ) -> TestAccountLoginFallback {
        TestAccountLoginFallback(mintTokenHash: mint, redeem: redeem)
    }

    @Test("a minted hash is redeemed and the sign-in lands")
    func mintedHashRedeems() async {
        let redeemed = TestLoginBox<[String]>([])
        let sut = fallback(
            mint: { _, _ in .init(tokenHash: "hashed-token-abc") },
            redeem: { hash in redeemed.withLock { $0.append(hash) }; return true }
        )
        #expect(await sut.attempt(email: "firstflight@patina.cloud", code: "000000"))
        #expect(redeemed.withLock { $0 } == ["hashed-token-abc"])
    }

    @Test("a generic 403 — the only answer a miss ever gets — fails closed")
    func genericDenyFailsClosed() async {
        let sut = fallback(mint: { _, _ in throw NetworkError.serverError(statusCode: 403, message: nil) })
        #expect(await sut.attempt(email: "someone@example.com", code: "111111") == false)
    }

    @Test("a 200 with no token_hash fails closed")
    func missingHashFailsClosed() async {
        let sut = fallback(mint: { _, _ in .init(tokenHash: nil) })
        #expect(await sut.attempt(email: "a@b.co", code: "000000") == false)
        let empty = fallback(mint: { _, _ in .init(tokenHash: "") })
        #expect(await empty.attempt(email: "a@b.co", code: "000000") == false)
    }

    @Test("a 429 rate limit fails closed")
    func rateLimitFailsClosed() async {
        let sut = fallback(mint: { _, _ in throw NetworkError.rateLimited })
        #expect(await sut.attempt(email: "a@b.co", code: "000000") == false)
    }

    @Test("a hash that will not redeem fails closed")
    func failedRedeemFailsClosed() async {
        let throwing = fallback(
            mint: { _, _ in .init(tokenHash: "h") },
            redeem: { _ in throw NetworkError.unauthorized }
        )
        #expect(await throwing.attempt(email: "a@b.co", code: "000000") == false)

        let sessionless = fallback(mint: { _, _ in .init(tokenHash: "h") }, redeem: { _ in false })
        #expect(await sessionless.attempt(email: "a@b.co", code: "000000") == false)
    }

    @Test("an empty email or code is never sent — nothing else is filtered")
    func onlyUnsendablePairsAreWithheld() async {
        let sent = TestLoginBox<Int>(0)
        let sut = fallback(
            mint: { _, _ in sent.withLock { $0 += 1 }; return .init(tokenHash: "h") }
        )
        #expect(await sut.attempt(email: "", code: "000000") == false)
        #expect(await sut.attempt(email: "a@b.co", code: "   ") == false)
        #expect(sent.withLock { $0 } == 0)

        // Any real-looking pair goes to the server — the server decides.
        #expect(await sut.attempt(email: "anyone@anywhere.test", code: "424242"))
        #expect(sent.withLock { $0 } == 1)
    }

    @Test("THE ALLOW-LIST IS THE SERVER'S — the app carries no address list")
    func noAllowListInTheBinary() throws {
        let service = try SourcePin.read("Patina/Services/Auth/TestAccountLoginFallback.swift")
        // No hard-coded tester identity, and no domain gate. `isWorthAttempting`
        // rejects only a pair the server could not act on at all.
        #expect(!service.contains("patina.cloud\""))
        #expect(!service.contains("@patina"))
        #expect(!service.lowercased().contains("allowlist ="))
        #expect(service.contains("func isWorthAttempting"))
        #expect(TestAccountLoginFallback.isWorthAttempting(email: "a@b.co", code: "1"))
        #expect(!TestAccountLoginFallback.isWorthAttempting(email: " ", code: "1"))
    }

    @Test("the code is never logged")
    func codeIsNeverLogged() throws {
        let service = try SourcePin.read("Patina/Services/Auth/TestAccountLoginFallback.swift")
        let logLines = service
            .components(separatedBy: .newlines)
            .filter { $0.contains("PatinaLog") }
        #expect(!logLines.isEmpty)
        for line in logLines {
            #expect(!line.contains("code"), "log line leaks the code: \(line)")
        }
    }

    @Test("redeems as magiclink, matching the function's generateLink type")
    func redeemsAsMagiclink() throws {
        let service = try SourcePin.read("Patina/Services/Auth/TestAccountLoginFallback.swift")
        #expect(service.contains("type: .magiclink"))
        #expect(!service.contains("tokenHash: tokenHash,\n                type: .email"))
    }

    @Test("verifyOtp tries it only AFTER the ordinary path has missed (A3-16)")
    func wiredIntoVerifyOtpOnTheFailurePath() throws {
        let source = try SourcePin.read("Patina/Services/Auth/AuthService.swift")
        let start = try #require(source.range(of: "public func verifyOtp("))
        let end = try #require(source.range(of: "/// Handle magic link URL callback"))
        let body = String(source[start.lowerBound..<end.lowerBound])

        // The plain GoTrue verify runs first, unconditionally.
        let plain = try #require(body.range(of: "supabase.auth.verifyOTP("))
        let firstAttempt = try #require(body.range(of: "testAccountLogin.attempt"))
        #expect(plain.lowerBound < firstAttempt.lowerBound)

        // Both miss shapes are covered: a throw, and a resolve with no session.
        #expect(body.contains("response.session == nil"))
        #expect(body.components(separatedBy: "testAccountLogin.attempt").count - 1 == 2)

        // It never intercepts a real sign-in: no other method calls it.
        let elsewhere = source.components(separatedBy: "testAccountLogin.attempt").count - 1
        #expect(elsewhere == 2)
    }
}

/// Minimal lock so the sendable test closures can record what they saw.
private final class TestLoginBox<Value>: @unchecked Sendable {
    private var value: Value
    private let lock = NSLock()

    init(_ value: Value) { self.value = value }

    func withLock<R>(_ body: (inout Value) -> R) -> R {
        lock.lock()
        defer { lock.unlock() }
        return body(&value)
    }
}
