//
//  MessagingThreadCreationTests.swift
//  PatinaTests
//
//  SP-13's client half: a client can start the conversation.
//
//  `MessagingAPIClient` had listThreads / listMessages / sendMessage / markRead
//  and no create, so the Studio's Conversation block was the only block drawn
//  without a route and the client's one visible messaging surface dead-ended.
//  Both RPCs already exist and are granted to `authenticated` — this is client
//  work only (critique B1: 00535 was a duplicate and would not have applied).
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct MessagingThreadCreationTests {

    // MARK: - The RPC contract

    /// Verbatim against `supabase/migrations/00103_comms_rpcs.sql`. A rename on
    /// either side breaks here rather than at runtime, where it would read as
    /// "messaging is broken" to a client.
    @Test("the thread-creation RPC names and parameters are pinned")
    func rpcNamesArePinned() {
        #expect(ThreadCreationRPC.projectFunction == "rpc_start_project_thread")
        #expect(ThreadCreationRPC.projectParameter == "p_project_id")
        #expect(ThreadCreationRPC.directFunction == "rpc_start_direct_thread")
        #expect(ThreadCreationRPC.directParameter == "counterpart")
    }

    /// The migration is the authority; read it rather than trusting the
    /// constants above to have been transcribed correctly.
    ///
    /// Constraint, deliberately taken: this and `createPathsUseThePinnedConstants`
    /// read the working tree at runtime via `#filePath`, so they hold only
    /// where the test bundle runs beside its checkout — true for `ios-gate.sh`
    /// and for Xcode, not for a bundle shipped anywhere else. The alternative
    /// is duplicating the migration into a fixture, which is the drift these
    /// tests exist to catch.
    @Test("the pinned names match the migration that defines them")
    func pinnedNamesMatchTheMigration() throws {
        let migration = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // PatinaTests
            .deletingLastPathComponent()   // Patina
            .deletingLastPathComponent()   // mobile
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // repo root
            .appendingPathComponent("supabase/migrations/00103_comms_rpcs.sql")
        let sql = try String(contentsOf: migration, encoding: .utf8)

        #expect(
            sql.contains("FUNCTION public.\(ThreadCreationRPC.directFunction)(\(ThreadCreationRPC.directParameter) UUID)"),
            "rpc_start_direct_thread's signature moved"
        )
        #expect(
            sql.contains("FUNCTION public.\(ThreadCreationRPC.projectFunction)(\(ThreadCreationRPC.projectParameter) UUID)"),
            "rpc_start_project_thread's signature moved"
        )
        #expect(
            sql.contains("GRANT EXECUTE ON FUNCTION public.\(ThreadCreationRPC.projectFunction)(UUID) TO authenticated")
        )
    }

    /// Source-level, for the same reason `ScanBucketMimeTests` checks its
    /// uploader: both create paths need a live Supabase session to exercise, so
    /// the assertion that matters is that they are built from the pinned
    /// constants rather than from literals that can drift away from them.
    @Test("both create paths build their URL from the pinned constants")
    func createPathsUseThePinnedConstants() throws {
        let client = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Patina/Core/Network/MessagingAPIClient.swift")
        let source = try String(contentsOf: client, encoding: .utf8)

        #expect(source.contains("func createThread(projectId: String)"))
        #expect(source.contains("func createDirectThread(counterpart: UUID)"))
        // Each name may appear exactly once — in `ThreadCreationRPC` itself.
        // A second occurrence is a call site that hard-coded it.
        for name in ["rpc_start_project_thread", "rpc_start_direct_thread"] {
            let occurrences = source.components(separatedBy: "\"\(name)\"").count - 1
            #expect(occurrences == 1,
                    "\(name) appears \(occurrences) times as a literal; only ThreadCreationRPC may declare it")
        }
        let uses = source.components(separatedBy: "ThreadCreationRPC.").count - 1
        #expect(uses >= 4, "expected both function names and both parameter names; found \(uses)")
    }

    // MARK: - The affordance

    private func context(_ relationship: DesignerRelationship?) -> CompanionContext {
        var context = CompanionContext(currentScreen: .heroFrame, roomCount: 2)
        context.designerRelationship = relationship
        return context
    }

    @Test("the Daily Room offers no message row without a designer")
    func messageDesignerRowIsHiddenWithoutADesigner() {
        for relationship in [DesignerRelationship.none, .roster(designerId: UUID())] {
            let rows = CompanionActionProvider.homeItems(context: context(relationship))
            #expect(
                !rows.contains { $0.analyticsId == "message_designer" },
                "a message row was offered for \(relationship)"
            )
        }
        // An unresolved relationship is not a designer either — never open the
        // door on a guess.
        #expect(
            !CompanionActionProvider.homeItems(context: context(nil))
                .contains { $0.analyticsId == "message_designer" }
        )
    }

    @Test("the Daily Room offers a message row when the relationship is live")
    func messageDesignerRowIsShownWhenTheRelationshipIsLive() {
        let live: [DesignerRelationship] = [
            .project(projectId: UUID(), designerId: UUID(), studioName: nil),
            .lead(leadId: UUID(), designerId: UUID(), studioName: "Hartwell Studio")
        ]
        for relationship in live {
            let rows = CompanionActionProvider.homeItems(context: context(relationship))
            let row = rows.first { $0.analyticsId == "message_designer" }
            #expect(row != nil, "no message row for \(relationship)")
            #expect(row?.label == "Message your designer")
            #expect(row?.route == .threadList)
        }
    }
}
