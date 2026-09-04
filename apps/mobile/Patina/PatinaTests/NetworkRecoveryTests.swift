//
//  NetworkRecoveryTests.swift
//  PatinaTests
//
//  `W1-C-11`. Reproduced at re-walk 2 on a HEALTHY stack with no deliberate
//  outage: a decision opened by deep link hung on "One moment…" and fell to
//  "Couldn't load this decision", twice. CFNetwork:
//  `[C67 … /rest/v1/client_decisions] start → Socket received CONNECTED →
//  reporting state ready → event: client:data_stall @3.114s`. Kong logged
//  nothing — it writes its access line on response — and the identical queries
//  answered from the host in 7 ms. Every request after that timed out at 30 s
//  until the app was relaunched.
//
//  The stuck state is `URLSession.shared`'s connection pool, which every client
//  held and which cannot be flushed or invalidated — killing the process is
//  the only way to drop a connection in it. The app owns its session now, and
//  a stall-shaped failure flushes both pools.
//
//  The recovery cannot be driven end to end from a unit test — reproducing a
//  data stall means wedging a real socket — so what is pinned here is the
//  mechanism: the classifier, the once-per-budget policy, and the fact that
//  every client is on the poolthe app can reach.
//

import Foundation
import Testing
@testable import Patina

struct NetworkRecoveryTests {

    // MARK: - The classifier

    /// The two codes that describe a connection the app HAD and can no longer
    /// use. `.timedOut` is the one the walker measured.
    @Test(arguments: [URLError.Code.timedOut, .networkConnectionLost])
    func aStalledConnectionIsRecognised(code: URLError.Code) {
        #expect(PatinaURLSession.isStallShaped(URLError(code)))
    }

    /// And the ones that are answers about the world, or the app's own doing.
    /// Flushing on these would churn the pool every airplane-mode second.
    @Test(arguments: [
        URLError.Code.notConnectedToInternet,
        .cannotFindHost,
        .cancelled,
        .badURL,
        .userAuthenticationRequired
    ])
    func anAnswerAboutTheWorldIsNotAStall(code: URLError.Code) {
        #expect(PatinaURLSession.isStallShaped(URLError(code)) == false)
    }

    @Test("a decoding failure is not a stall")
    func aNonURLErrorIsNotAStall() {
        struct Boom: Error {}
        #expect(PatinaURLSession.isStallShaped(Boom()) == false)
        #expect(
            PatinaURLSession.isStallShaped(
                RoomsAPIError.http(status: 500, body: "")
            ) == false
        )
    }

    // MARK: - The policy

    /// The first stall flushes: there is nothing to protect yet.
    @Test("the first stall drops the pool")
    func theFirstStallFlushes() {
        #expect(PatinaURLSession.shouldFlush(lastFlushAt: nil, now: Date()))
    }

    /// A second stall inside one request budget does not. The connection the
    /// flush just opened has not yet had a request live or die on it, and
    /// flushing again would drop the recovery itself — which is how a "fix"
    /// turns into a loop that never lets a connection establish.
    @Test("a second stall inside one request budget does not flush again")
    func aSecondStallInsideTheBudgetIsIgnored() {
        let flushed = Date()
        #expect(
            PatinaURLSession.shouldFlush(
                lastFlushAt: flushed,
                now: flushed.addingTimeInterval(APIConfiguration.requestTimeout - 1)
            ) == false
        )
    }

    /// Once a whole budget has passed, the flush has been tested and failed, so
    /// the next stall gets its own.
    @Test("a stall after the budget flushes again")
    func aStallAfterTheBudgetFlushesAgain() {
        let flushed = Date()
        #expect(
            PatinaURLSession.shouldFlush(
                lastFlushAt: flushed,
                now: flushed.addingTimeInterval(APIConfiguration.requestTimeout)
            )
        )
    }

    /// The window is the request budget itself, not a number of its own.
    @Test("the cooldown is one request budget")
    func theCooldownIsOneRequestBudget() {
        #expect(PatinaURLSession.flushCooldown == APIConfiguration.requestTimeout)
    }

    /// A request that answered clears the mark, so a stall an hour later is
    /// treated as a fresh one rather than as a repeat inside a cooldown.
    @Test("a successful request re-arms the recovery")
    func aSuccessReArmsTheRecovery() {
        PatinaURLSession.resetRecoveryForTesting()
        PatinaURLSession.noteFailure(URLError(.timedOut))
        // Inside the cooldown a second stall is ignored…
        #expect(
            PatinaURLSession.shouldFlush(lastFlushAt: Date(), now: Date()) == false
        )
        // …but an answered request says the pool is healthy again.
        PatinaURLSession.noteSuccess()
        #expect(PatinaURLSession.shouldFlush(lastFlushAt: nil, now: Date()))
        PatinaURLSession.resetRecoveryForTesting()
    }

    // MARK: - The pool the app can reach

    /// The whole point: no client is on a pool the app cannot drop.
    @Test("no network client holds URLSession.shared any more")
    func nothingHoldsTheSharedPool() throws {
        let clients = [
            "DecisionsAPIClient", "EditorialStoriesAPIClient", "FulfillmentAPIClient",
            "MessagingAPIClient", "NotificationsAPIClient", "ProductAPIClient",
            "ProjectsAPIClient", "RoomsAPIClient", "RosterAPIClient"
        ]
        for client in clients {
            let code = SourceScan.code(
                in: try SourcePin.read("Patina/Core/Network/\(client).swift")
            )
            #expect(code.contains("private let session = PatinaURLSession.shared"),
                    "\(client) is back on the pool nothing can flush (W1-C-11)")
            // `PatinaURLSession.shared` ends in the same eleven characters, so
            // the pin names the assignment rather than the substring.
            #expect(!code.contains("= URLSession.shared"),
                    "\(client) still names the shared pool")
            #expect(!code.contains("session.data(for:"),
                    "\(client) has a request that cannot report a stall")
        }
    }

    /// …including the two outside `Core/Network` that reached for it directly.
    @Test("the auth-adjacent direct callers moved too")
    func theDirectCallersMovedToo() throws {
        for path in [
            "Patina/Features/QRAuth/Services/QRAuthService.swift",
            "Patina/Features/Account/AccountDeletionService.swift"
        ] {
            let code = SourceScan.code(in: try SourcePin.read(path))
            #expect(code.contains("PatinaURLSession.shared.patinaData(for:"))
            #expect(!code.contains("URLSession.shared.data(for:"))
        }
    }

    /// Both pools are dropped, not just the app's: every request in the
    /// cold-launch burst waits on the SDK's session for its auth refresh, so a
    /// stall there wedges the app just as thoroughly.
    @Test("the recovery reaches both pools")
    func theRecoveryReachesBothPools() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Core/Network/PatinaURLSession.swift")
        )
        #expect(code.contains("shared.flush { }"))
        #expect(code.contains("SupabaseClientManager.shared.sdkSession.flush { }"))
    }
}
