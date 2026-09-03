//
//  AuthFailureCopyTests.swift
//  PatinaTests
//
//  RL2A-07 — L1-A's W1 exit criterion is "no raw server string anywhere", and
//  the two paths every round-one tester walks broke it: the password sheet
//  rendered GoTrue's own "Invalid login credentials" and the code sheet its
//  "Token has expired or is invalid", both inside `auth.form.errorBanner`.
//
//  Same shape as `MoneyFailureCopy` / `OrderFailureCopy`: a typed error
//  becomes a fixed, app-authored sentence; the thrown error is logged, never
//  interpolated.
//

import Foundation
import Auth
import Testing
@testable import Patina

struct AuthFailureCopyTests {

    private func sentence(_ code: ErrorCode) -> String {
        let response = HTTPURLResponse(
            url: URL(string: "https://example.invalid/auth/v1/token")!,
            statusCode: 400,
            httpVersion: nil,
            headerFields: nil
        )!
        return AuthService.authErrorSentence(
            AuthError.api(
                message: "server words",
                errorCode: code,
                underlyingData: Data(),
                underlyingResponse: response
            )
        )
    }

    @Test("no auth failure renders the server's own sentence")
    func noRawServerStringOnAnyPath() throws {
        let source = try SourcePin.read("Patina/Services/Auth/AuthService.swift")
        #expect(!source.contains("setError(error.localizedDescription"))
        #expect(!source.contains("errorMessage = error.localizedDescription"))
    }

    @Test("the four common GoTrue codes each get a Patina sentence")
    func theCommonCodesAreMapped() {
        let invalid = sentence(.invalidCredentials)
        #expect(invalid.contains("don’t match"))
        #expect(!invalid.contains("Invalid login credentials"))

        let expired = sentence(.otpExpired)
        #expect(expired.contains("expired"))
        #expect(!expired.lowercased().contains("token"))

        #expect(sentence(.overEmailSendRateLimit).contains("a minute"))
        #expect(sentence(.emailNotConfirmed).contains("confirmed"))
    }

    @Test("an unrecognised failure still gets ours, not the server's")
    func theFallbackIsOursToo() {
        struct Boom: LocalizedError {
            var errorDescription: String? { "PGRST301: JWSError JWSInvalidSignature" }
        }
        let fallback = AuthService.authErrorSentence(Boom())
        #expect(!fallback.contains("PGRST301"))
        #expect(fallback.contains("hello@patina.cloud"))
    }

    /// Brand voice: sentence case, one apostrophe glyph, none of the banned
    /// lexicon, and no interpolation of a thrown value.
    @Test("every sentence reads in Patina's voice")
    func everySentenceIsInVoice() {
        let all = [
            sentence(.invalidCredentials),
            sentence(.otpExpired),
            sentence(.overEmailSendRateLimit),
            sentence(.overRequestRateLimit),
            sentence(.emailNotConfirmed),
            sentence(.validationFailed),
            AuthService.authErrorSentence(NSError(domain: "x", code: 1))
        ]
        for line in all {
            #expect(!line.contains("'"), "straight apostrophe in \"\(line)\"")
            #expect(!line.contains("server words"), "the thrown error leaked into \"\(line)\"")
            for banned in ["curated", "journey", "elevated", "AI", "disrupt"] {
                #expect(!line.contains(banned), "banned lexicon in \"\(line)\"")
            }
            #expect(line.hasSuffix(".") || line.hasSuffix("?"), "unpunctuated: \"\(line)\"")
        }
    }
}
