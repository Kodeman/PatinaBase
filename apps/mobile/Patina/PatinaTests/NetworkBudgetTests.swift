//
//  NetworkBudgetTests.swift
//  PatinaTests
//
//  C4-16. Every supabase-swift read — invoices, proposals, decisions,
//  threads, orders, the profile — ran on `URLSession.shared`, whose defaults
//  are 60 s per request and seven days per resource. The nine raw-URLSession
//  clients applied `APIConfiguration.requestTimeout`; the SDK-backed ones
//  inherited no budget at all, which is the mechanism under R-05's measured
//  65–185 s blank proposal.
//

import Foundation
import Testing
@testable import Patina

struct NetworkBudgetTests {

    @Test
    func theSDKSessionCarriesTheAppsRequestBudget() {
        let configuration = SupabaseClientManager.sessionConfiguration
        #expect(configuration.timeoutIntervalForRequest == APIConfiguration.requestTimeout)
        #expect(configuration.timeoutIntervalForRequest == 30)
    }

    /// `URLSession.shared`'s resource default is 604800 seconds. A read that
    /// can outlive the app is not a read. The cap is 300 rather than C4-16's
    /// suggested 120 because this client also carries scan-bundle uploads —
    /// see `APIConfiguration.resourceTimeout`.
    @Test
    func theSDKSessionCapsTheWholeResource() {
        let configuration = SupabaseClientManager.sessionConfiguration
        #expect(configuration.timeoutIntervalForResource == APIConfiguration.resourceTimeout)
        #expect(configuration.timeoutIntervalForResource <= 300)
        #expect(configuration.timeoutIntervalForResource < URLSessionConfiguration.default.timeoutIntervalForResource)
    }

    /// `waitsForConnectivity` would park a request indefinitely on a dead
    /// network instead of failing it, which is the shape the error states in
    /// this wave depend on not happening.
    @Test
    func theSDKSessionDoesNotWaitForConnectivity() {
        #expect(SupabaseClientManager.sessionConfiguration.waitsForConnectivity == false)
    }

    /// The client is constructed with that session. Without this pin the
    /// configuration above can be perfect and unused.
    @Test
    func theClientIsBuiltWithThatSession() throws {
        let source = try SourcePin.read("Patina/Core/Network/SupabaseClient.swift")
        #expect(source.contains("session: URLSession(configuration: Self.sessionConfiguration)"))
    }

    // MARK: - C1-04 (L1-A's half, on this lane's file)

    @Test
    func theQuizHasItsOwnShorterBudget() {
        #expect(APIConfiguration.quizSubmissionTimeout <= 10)
        #expect(APIConfiguration.quizSubmissionTimeout < APIConfiguration.requestTimeout)
    }

    @Test
    func theQuizRPCAppliesIt() throws {
        let source = try SourcePin.read("Patina/Core/Network/ProductAPIClient.swift")
        let quiz = source.components(separatedBy: "func processStyleQuiz(").last ?? ""
        #expect(quiz.contains("request.timeoutInterval = APIConfiguration.quizSubmissionTimeout"))
    }
}
