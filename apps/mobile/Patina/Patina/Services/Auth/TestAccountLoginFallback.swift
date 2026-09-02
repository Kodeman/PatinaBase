//
//  TestAccountLoginFallback.swift
//  Patina
//
//  A3-16 / ruling D7 — the advertised tester credential works IN THE APP.
//
//  `supabase/functions/test-account-login` is an owner-authorized, pre-auth
//  path for accounts on a Vault-backed allow-list (`app_setting`
//  'test_login_accounts' / 'test_login_code'). A caller POSTs `{email, code}`;
//  on a match the function mints a normal single-use GoTrue **magiclink**
//  token and returns its `hashed_token`. The CALLER redeems it. The designer
//  portal does exactly that in `apps/designer-portal/src/app/auth/
//  test-account-fallback.ts`; this is the same contract for iOS.
//
//  Three properties the reviewer will check, all inherited from the portal:
//
//  1. **No allow-list in the app.** The pair goes to the server and the server
//     decides. Every failure mode — not allow-listed, wrong code, missing
//     config, rate limited, `generateLink` failure — comes back as the same
//     generic 403, so the app cannot learn (and must not encode) who is on it.
//  2. **Fail closed.** Anything that is not a 200 carrying a `token_hash` that
//     then redeems to a session returns `false`, and the caller falls through
//     to the ordinary invalid-code error. `code` is never logged.
//  3. **Never on the happy path.** It is tried only after the plain GoTrue
//     verify has failed, so it can never intercept a real user's sign-in.
//
//  Redeems with `type: .magiclink`, matching the function's
//  `generateLink({ type: 'magiclink' })`. `.email` is for a real OTP code, not
//  a magiclink token hash — the portal's comment says the same.
//

import Foundation
import Supabase

struct TestAccountLoginFallback: Sendable {

    static let functionName = "test-account-login"

    /// The function's success body. A 403 carries `{error}` and no hash.
    struct Response: Decodable, Sendable {
        let tokenHash: String?

        enum CodingKeys: String, CodingKey {
            case tokenHash = "token_hash"
        }
    }

    /// POST `{email, code}` and return the body. Injected in tests.
    var mintTokenHash: @Sendable (_ email: String, _ code: String) async throws -> Response
    /// Redeem the minted hash. Injected in tests.
    var redeem: @Sendable (_ tokenHash: String) async throws -> Bool

    static let live = TestAccountLoginFallback(
        mintTokenHash: { email, code in
            try await SupabaseClientManager.shared.client.functions.invoke(
                functionName,
                options: FunctionInvokeOptions(body: ["email": email, "code": code])
            )
        },
        redeem: { tokenHash in
            let response = try await SupabaseClientManager.shared.client.auth.verifyOTP(
                tokenHash: tokenHash,
                type: .magiclink
            )
            return response.session != nil
        }
    )

    /// Whether the pair is even worth sending. Deliberately NOT an allow-list:
    /// the only thing rejected here is a request the server could not act on
    /// anyway, so no real address is ever singled out and no one can read the
    /// roster off the binary.
    static func isWorthAttempting(email: String, code: String) -> Bool {
        !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// `true` only when a session actually landed.
    func attempt(email: String, code: String) async -> Bool {
        guard Self.isWorthAttempting(email: email, code: code) else { return false }
        do {
            let response = try await mintTokenHash(email, code)
            guard let tokenHash = response.tokenHash, !tokenHash.isEmpty else { return false }
            return try await redeem(tokenHash)
        } catch {
            // Never logs `code`, and never surfaces the function's words to a
            // homeowner — the caller shows the ordinary invalid-code error.
            PatinaLog.auth.debug("test-account-login fallback declined")
            return false
        }
    }
}
