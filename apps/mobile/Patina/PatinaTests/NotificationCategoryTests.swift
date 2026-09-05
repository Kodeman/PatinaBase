//
//  NotificationCategoryTests.swift
//  PatinaTests
//
//  `P-22`. The lock screen carries two acts and no outcome.
//
//  The refusal is the load-bearing test in this file: no action a homeowner can
//  tap from a banner may approve, sign, accept, pay or decline anything. A
//  one-tap approve consents to a document nobody opened, and a phone on a
//  counter is not proof of who tapped it.
//

import Foundation
import Testing
import UserNotifications
@testable import Patina

@MainActor
struct NotificationCategoryTests {

    // MARK: - The set that gets registered

    @Test("three categories are registered, one per rail")
    func theThreeCategoriesAreRegistered() {
        var registered: Set<UNNotificationCategory> = []
        NotificationCategories.register { registered = $0 }

        let identifiers = Set(registered.map(\.identifier))
        #expect(identifiers == ["PATINA_DECISION", "PATINA_PROPOSAL", "PATINA_INVOICE"])
        #expect(registered.count == 3)
    }

    @Test("every category carries the same two acts, in the same order")
    func everyCategoryCarriesTheTwoActs() {
        for category in NotificationCategories.categories() {
            #expect(
                category.actions.map(\.identifier) == ["PATINA_OPEN", "PATINA_ASK_QUESTION"],
                "\(category.identifier) draws the wrong acts"
            )
            #expect(category.actions.map(\.title) == ["Open", "Ask a question"])
        }
    }

    /// Both acts carry the reader into the app. A background act would answer
    /// for her without showing her anything.
    @Test("both acts are foreground")
    func bothActsAreForeground() {
        for action in NotificationCategories.actions() {
            #expect(action.options.contains(.foreground), "\(action.identifier) is not foreground")
            #expect(!action.options.contains(.destructive))
        }
    }

    @Test("no lock-screen act approves, signs, accepts, pays or declines")
    func noActIsAnOutcome() {
        for action in NotificationCategories.actions() {
            let title = action.title.lowercased()
            let identifier = action.identifier.lowercased()
            for word in NotificationCategories.refusedActionWords {
                #expect(!title.contains(word), "\(action.title) offers an outcome from the lock screen")
                #expect(!identifier.contains(word), "\(action.identifier) names an outcome")
            }
        }
        // The whole vocabulary, not only what happens to be built today.
        #expect(PatinaNotificationAction.allCases.count == 2)
    }

    // MARK: - Thread identifiers

    @Test("the thread identifier is the shape the backend sends")
    func theThreadIdentifierIsTheBackendsShape() {
        #expect(
            PatinaNotificationCategory.decision.threadIdentifier(entityId: "abc") == "decision-abc"
        )
        #expect(
            PatinaNotificationCategory.proposal.threadIdentifier(entityId: "abc") == "proposal-abc"
        )
        #expect(
            PatinaNotificationCategory.invoice.threadIdentifier(entityId: "abc") == "invoice-abc"
        )
    }

    /// An id can contain hyphens — a UUID always does — so the split is on the
    /// first one only.
    @Test("a thread identifier reads back to its entity, hyphens and all")
    func theThreadIdentifierReadsBack() {
        let uuid = "7b1f0f4e-1f2a-4a3e-9c2b-0d1e2f3a4b5c"
        let read = PatinaNotificationCategory.entity(
            fromThreadIdentifier: "decision-\(uuid)"
        )
        #expect(read?.category == .decision)
        #expect(read?.entityId == uuid)

        #expect(PatinaNotificationCategory.entity(fromThreadIdentifier: "decision-") == nil)
        #expect(PatinaNotificationCategory.entity(fromThreadIdentifier: "room-abc") == nil)
        #expect(PatinaNotificationCategory.entity(fromThreadIdentifier: "nohyphen") == nil)
    }

    // MARK: - Which category a payload is

    @Test("the category is read from aps, from the flat key, or from the entity")
    func theCategoryIsReadFromThePayload() {
        #expect(
            PatinaNotificationCategory.from(apnsUserInfo: [
                "aps": ["category": "PATINA_INVOICE"]
            ]) == .invoice
        )
        #expect(
            PatinaNotificationCategory.from(apnsUserInfo: ["category": "PATINA_PROPOSAL"])
                == .proposal
        )
        // A Wave 1 envelope names no category; its entity still says which rail.
        #expect(
            PatinaNotificationCategory.from(apnsUserInfo: ["entity_type": "decision"]) == .decision
        )
        #expect(PatinaNotificationCategory.from(apnsUserInfo: ["entity_type": "room"]) == nil)
        #expect(PatinaNotificationCategory.from(apnsUserInfo: [:]) == nil)
    }

    // MARK: - Where each act lands

    /// One rail's envelope and where its Open act must land.
    private struct OpenCase {
        let entity: String
        let id: String
        let route: AppRoute
    }

    @Test("Open lands on the entity, for each of the three categories")
    func openLandsOnTheEntity() {
        let cases = [
            OpenCase(entity: "decision", id: "d-1", route: .decisionDetail(decisionId: "d-1")),
            OpenCase(entity: "proposal", id: "p-1", route: .proposalDetail(proposalId: "p-1")),
            OpenCase(entity: "invoice", id: "i-1", route: .invoiceDetail(invoiceId: "i-1"))
        ]
        for openCase in cases {
            let expected = openCase.route
            let userInfo: [AnyHashable: Any] = [
                "entity_type": openCase.entity, "entity_id": openCase.id
            ]
            #expect(
                NotificationCategories.route(
                    forActionIdentifier: PatinaNotificationAction.open.rawValue,
                    apnsUserInfo: userInfo
                ) == expected
            )
            // The plain banner tap is the same destination.
            #expect(
                NotificationCategories.route(
                    forActionIdentifier: UNNotificationDefaultActionIdentifier,
                    apnsUserInfo: userInfo
                ) == expected
            )
        }
    }

    @Test("Ask a question opens the thread the envelope names")
    func askOpensTheNamedThread() {
        #expect(
            NotificationCategories.route(
                forActionIdentifier: PatinaNotificationAction.askQuestion.rawValue,
                apnsUserInfo: [
                    "entity_type": "decision", "entity_id": "d-1", "thread_id": "t-9"
                ]
            ) == .threadDetail(threadId: "t-9")
        )
    }

    /// No `PATINA_*` envelope carries a thread today — `buildApnsPayload`
    /// (`apns-send/core.ts`) writes `aps`, `entity_type`, `entity_id` and
    /// `notification_log_id` and nothing else — so this is the leg that
    /// actually runs. The act belongs to the document: it lands on the
    /// document's own screen, where "Ask a question" is an act she can take,
    /// not in a general inbox with the approval's identity thrown away.
    @Test("Ask a question opens the document itself when the envelope names no thread")
    func askOpensTheDocumentItself() {
        let expected: [String: AppRoute] = [
            "decision": .decisionDetail(decisionId: "x-1"),
            "proposal": .proposalDetail(proposalId: "x-1"),
            "invoice": .invoiceDetail(invoiceId: "x-1")
        ]
        for (entity, route) in expected {
            #expect(
                NotificationCategories.route(
                    forActionIdentifier: PatinaNotificationAction.askQuestion.rawValue,
                    apnsUserInfo: ["entity_type": entity, "entity_id": "x-1"]
                ) == route,
                "\(entity)"
            )
        }
    }

    /// The real payload, byte for byte, as `buildApnsPayload` assembles it for
    /// a Stage-2 approval: an `aps` block with the category, the entity pair,
    /// the log id — and no `thread_id`.
    @Test("Ask a question on the real decision envelope reaches the approval")
    func askOnTheRealEnvelopeReachesTheApproval() {
        let userInfo: [AnyHashable: Any] = [
            "aps": [
                "alert": ["title": "An approval needs you", "body": "Kitchen millwork spec"],
                "category": "PATINA_DECISION",
                "thread-id": "decision-d-1",
                "interruption-level": "active"
            ],
            "entity_type": "decision",
            "entity_id": "d-1",
            "notification_log_id": "n-1"
        ]
        #expect(
            NotificationCategories.route(
                forActionIdentifier: PatinaNotificationAction.askQuestion.rawValue,
                apnsUserInfo: userInfo
            ) == .decisionDetail(decisionId: "d-1")
        )
    }

    /// A Threshold link, and then the sender's grouping key, are the two
    /// remaining ways an envelope can name the document.
    @Test("Ask a question follows the deep link, then the thread identifier")
    func askFollowsTheLinkThenTheGroupingKey() {
        #expect(
            NotificationCategories.route(
                forActionIdentifier: PatinaNotificationAction.askQuestion.rawValue,
                apnsUserInfo: ["deep_link": "/projects/proj-1?invoice=inv-4#ledger"]
            ) == .invoiceDetail(invoiceId: "inv-4")
        )
        #expect(
            NotificationCategories.route(
                forActionIdentifier: PatinaNotificationAction.askQuestion.rawValue,
                apnsUserInfo: [:],
                threadIdentifier: "decision-d-7"
            ) == .decisionDetail(decisionId: "d-7")
        )
    }

    /// The app will not invent a thread that does not exist, and it will not
    /// invent a document either: an envelope that names nothing lands in the
    /// inbox, where she writes to the studio. Never a dead end.
    @Test("Ask a question opens the inbox when the envelope names nothing at all")
    func askFallsBackToTheInbox() {
        #expect(
            NotificationCategories.route(
                forActionIdentifier: PatinaNotificationAction.askQuestion.rawValue,
                apnsUserInfo: ["notification_log_id": "n-1"]
            ) == .threadList
        )
    }

    @Test("a dismissal opens nothing and is not an opening")
    func aDismissalOpensNothing() {
        #expect(
            NotificationCategories.route(
                forActionIdentifier: UNNotificationDismissActionIdentifier,
                apnsUserInfo: ["entity_type": "decision", "entity_id": "d-1"]
            ) == nil
        )
        #expect(!NotificationCategories.isOpening(
            actionIdentifier: UNNotificationDismissActionIdentifier
        ))
        #expect(NotificationCategories.isOpening(
            actionIdentifier: UNNotificationDefaultActionIdentifier
        ))
        #expect(NotificationCategories.isOpening(
            actionIdentifier: PatinaNotificationAction.askQuestion.rawValue
        ))
    }

    /// P-06's fallback reaches the lock screen too: a Threshold link with no
    /// entity pair still opens the native screen from a banner act.
    @Test("Open follows a Threshold deep link when the envelope carries no entity")
    func openFollowsTheDeepLink() {
        #expect(
            NotificationCategories.route(
                forActionIdentifier: PatinaNotificationAction.open.rawValue,
                apnsUserInfo: ["deep_link": "/projects/proj-1?invoice=inv-4#ledger"]
            ) == .invoiceDetail(invoiceId: "inv-4")
        )
    }

    /// The sender's grouping key is the last thing that can name the entity.
    @Test("Open falls back to the thread identifier when nothing else names the entity")
    func openFollowsTheThreadIdentifier() {
        #expect(
            NotificationCategories.route(
                forActionIdentifier: PatinaNotificationAction.open.rawValue,
                apnsUserInfo: [:],
                threadIdentifier: "decision-d-7"
            ) == .decisionDetail(decisionId: "d-7")
        )
        #expect(
            NotificationCategories.route(
                forActionIdentifier: UNNotificationDefaultActionIdentifier,
                apnsUserInfo: [:],
                threadIdentifier: "proposal-p-7"
            ) == .proposalDetail(proposalId: "p-7")
        )
        // An identifier that is not ours names nothing, and the delegate's own
        // fall-back (the feed) takes over.
        #expect(
            NotificationCategories.route(
                forActionIdentifier: PatinaNotificationAction.open.rawValue,
                apnsUserInfo: [:],
                threadIdentifier: "room-abc"
            ) == nil
        )
    }

    @Test("the envelope still wins over the thread identifier beside it")
    func theEnvelopeBeatsTheThreadIdentifier() {
        #expect(
            NotificationCategories.route(
                forActionIdentifier: PatinaNotificationAction.open.rawValue,
                apnsUserInfo: ["entity_type": "invoice", "entity_id": "i-3"],
                threadIdentifier: "decision-d-7"
            ) == .invoiceDetail(invoiceId: "i-3")
        )
    }

    // MARK: - The delegate is wired

    /// The stub's own header names the wiring this pins: the delegate calls
    /// `DecisionPushHandler.handle`, registers the categories at launch, and
    /// still routes every other letter through `DeepLinkHandler`.
    @Test("the app delegate registers the categories and calls the decision handler")
    func theDelegateIsWired() throws {
        let source = try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .appendingPathComponent("Patina/App/AppDelegate.swift"),
            encoding: .utf8
        )
        #expect(source.contains("NotificationCategories.register()"))
        #expect(source.contains("DecisionPushHandler.handle(apnsUserInfo: userInfo)"))
        #expect(source.contains("NotificationCategories.route("))
        #expect(source.contains("response.actionIdentifier"))
        #expect(source.contains("response.notification.request.content.threadIdentifier"))
        // P-08's seam: a route that arrives before the app can show it is held.
        #expect(source.contains("DeepLinkHandler.shared.navigate(to: resolved)"))
    }
}
