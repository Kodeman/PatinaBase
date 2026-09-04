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

    private func sentence(
        _ code: ErrorCode,
        surface: AuthFailureSurface = .emailForm
    ) -> String {
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
            ),
            surface: surface
        )
    }

    @Test("no auth failure renders the server’s own sentence")
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

        let badCode = sentence(.otpExpired)
        #expect(badCode.contains("didn’t work"))
        #expect(!badCode.lowercased().contains("token"))

        #expect(sentence(.overEmailSendRateLimit).contains("a minute"))
        #expect(sentence(.emailNotConfirmed).contains("confirmed"))
    }

    @Test("an unrecognised failure still gets ours, not the server’s")
    func theFallbackIsOursToo() {
        struct Boom: LocalizedError {
            var errorDescription: String? { "PGRST301: JWSError JWSInvalidSignature" }
        }
        let fallback = AuthService.authErrorSentence(Boom())
        #expect(!fallback.contains("PGRST301"))
        #expect(fallback.contains("hello@patina.cloud"))
    }

    // MARK: - RL3A-17 · validation_failed does not always mean the address

    /// PROGRAM.md §6 · D3 records what Strata's GoTrue actually answers for a
    /// provider it has not configured: `400 validation_failed — "Unsupported
    /// provider: provider is not enabled"`. `signInWithGoogle` routes its
    /// failures through the same mapper, so a reader who tapped a provider
    /// button — a screen with no email field on it — was told to check their
    /// email address. Dark today (`A3-06` removes the row unless GoTrue
    /// enables it) and live again the moment `google: true` appears in
    /// `/auth/v1/settings`.
    @Test("a provider validation failure does not blame the email address")
    func aProviderValidationFailureDoesNotBlameTheEmailAddress() {
        let form = sentence(.validationFailed, surface: .emailForm)
        #expect(form.contains("email address"))

        let provider = sentence(.validationFailed, surface: .provider)
        #expect(!provider.contains("email address"))
        #expect(provider.contains("Apple"))
        #expect(!provider.contains("Unsupported provider"))
    }

    /// And the two OAuth entry points ask for that surface.
    @Test("the Apple and Google paths name themselves to the mapper")
    func theOAuthPathsPassTheProviderSurface() throws {
        let source = try SourcePin.read("Patina/Services/Auth/AuthService.swift")
        let calls = source.components(separatedBy: "surface: .provider").count - 1
        #expect(calls >= 2, "expected the Apple and Google paths to name .provider, found \(calls)")
    }

    // MARK: - W1-A-06 · wrong and expired arrive as one error

    /// GoTrue answers `otp_expired` for a code that is simply WRONG as well as
    /// for one that is spent — the walk typed `999999` seconds after a real
    /// code was issued and read "That sign-in code has expired. Send yourself
    /// a new one." The sentence asserted a fact the wire does not carry and
    /// sent the reader to Resend instead of back to the code in their inbox.
    @Test("a bad code is not reported as an expired one")
    func aBadCodeDoesNotAssertExpiry() {
        let line = sentence(.otpExpired)
        #expect(!line.lowercased().contains("expire"))
        // It still offers the resend, because the code may in fact be spent.
        #expect(line.lowercased().contains("send yourself a new one"))
        // And it still points at the code itself, which is the likelier fault.
        #expect(line.contains("Check it"))
    }

    // MARK: - RL3A-02 · the session-less resolve

    @Test("a code GoTrue accepts but will not exchange reads the same way")
    func aSessionlessResolveReadsAsABadCode() {
        let line = AuthService.authErrorSentence(AuthVerificationFailure.resolvedWithoutSession)
        #expect(line == sentence(.otpExpired))
    }

    /// Brand voice: sentence case, one apostrophe glyph, none of the banned
    /// lexicon, and no interpolation of a thrown value.
    @Test("every sentence reads in Patina’s voice")
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
