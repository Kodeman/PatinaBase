//  PunchTaskWriteTests.swift
//  CaptureTests
//
//  FC-R7: a Field punch item is a project_tasks row owned by the GC, riding
//  the party-anchored SMS rail — never a client_decisions row. The device
//  writes the row and sends NOTHING; fc_dispatch_task_assignment
//  (00284:160-203, trigger 00284:207-210) decides whether a text goes out, and
//  it returns early unless the party's kind is one of
//  ('gc','sub','installer','receiver') AND its sms_consent_status is 'granted'.
//
//  PunchCourtResolver is NARROWER than that gate on purpose (ruling 2): GC with
//  texting on, or nobody. The trigger would happily text a consented plumber,
//  and picking one out of the four kinds by array order would send to a party
//  she never named. So the app promises a send only where FC-R7 says the punch
//  belongs, and files the item as her own task everywhere else.

import Foundation
import Testing
@testable import CaptureKit

struct PunchTaskWriteTests {
    private let taskID = UUID(uuidString: "b1111111-1111-4111-8111-111111111111")!
    private let projectID = UUID(uuidString: "b2222222-2222-4222-8222-222222222222")!
    private let designerID = UUID(uuidString: "b3333333-3333-4333-8333-333333333333")!
    private let captureID = UUID(uuidString: "b4444444-4444-4444-8444-444444444444")!

    private let consentedGC = FieldPartyRef(
        id: "party-gc", displayName: "Delaney Build Co",
        partyKind: "gc", smsConsentGranted: true)
    private let silentGC = FieldPartyRef(
        id: "party-gc2", displayName: "Halloran & Sons",
        partyKind: "gc", smsConsentGranted: false)
    private let client = FieldPartyRef(
        id: "party-client", displayName: "The Ellsworths",
        partyKind: "client_rep", smsConsentGranted: true)

    // MARK: - Which court

    @Test func noPartiesMeansNoCourt() {
        #expect(PunchCourtResolver.resolve(parties: []) == .noCourt)
    }

    @Test func aClientRepIsNeverACourtForAPunchItem() {
        #expect(PunchCourtResolver.resolve(parties: [client]) == .noCourt)
    }

    @Test func aConsentedGeneralContractorIsReachable() {
        #expect(PunchCourtResolver.resolve(parties: [consentedGC]) == .reachable(consentedGC))
    }

    @Test func aGeneralContractorWhoHasNotAgreedToTextsIsNoCourtAtAll() {
        // Ruling 2: a gc-owned row with a null owner_party_id reaches neither
        // the trigger nor the daily digest, so "filed for him" would be a lie.
        #expect(PunchCourtResolver.resolve(parties: [silentGC]) == .noCourt)
    }

    @Test func aConsentedGeneralContractorWinsOverASilentOne() {
        #expect(PunchCourtResolver.resolve(parties: [silentGC, consentedGC])
                == .reachable(consentedGC))
    }

    @Test func aConsentedSubIsNotACourt_becauseArrayOrderMustNotPickTheTrade() {
        let plumber = FieldPartyRef(
            id: "party-sub", displayName: "Chen Plumbing",
            partyKind: "sub", smsConsentGranted: true)
        // The plumber is FIRST and consented, and the trigger would happily
        // text him. FC-R7 says a Field punch is the GC's court, so he loses.
        #expect(PunchCourtResolver.resolve(parties: [plumber, consentedGC])
                == .reachable(consentedGC))
        #expect(PunchCourtResolver.resolve(parties: [plumber]) == .noCourt)
    }

    @Test func theDispatchableKindsStillMirrorTheTriggerExactly() {
        // Documentation of 00284:174, not the resolver's filter. If someone
        // widens the court later, this is the line they have to look at.
        #expect(PunchCourtResolver.dispatchableKinds == ["gc", "sub", "installer", "receiver"])
        #expect(PunchCourtResolver.punchCourtKind == "gc")
    }

    // MARK: - The wire shape

    @Test func aPunchEncodesTheExactProjectTasksColumnNames() throws {
        let request = PunchTaskComposer.punch(
            id: taskID, projectID: projectID, createdBy: designerID,
            fieldCaptureID: captureID,
            transcript: "the base cabinet scribe is short on the left return",
            roomName: "Kitchen",
            courtPartyID: consentedGC.id)

        let data = try JSONEncoder().encode(request)
        let json = try #require(
            JSONSerialization.jsonObject(with: data) as? [String: Any])

        #expect(json["id"] as? String == taskID.uuidString)
        #expect(json["project_id"] as? String == projectID.uuidString)
        #expect(json["created_by"] as? String == designerID.uuidString)
        #expect(json["field_capture_id"] as? String == captureID.uuidString)
        #expect(json["status"] as? String == "todo")
        #expect(json["owner"] as? String == "gc")
        #expect(json["owner_party_id"] as? String == "party-gc")
        #expect(json["section_key"] as? String == "install")
        #expect(json["title"] as? String == "The base cabinet scribe is short on the left return")
        #expect(json.count == 10)
    }

    @Test func aPunchAlwaysCarriesAPartyBecauseAPartylessPunchIsInvisible() throws {
        // There is no `.noCourt` punch to compose: punch(courtPartyID:) takes a
        // non-optional id. With no reachable GC the verb calls task() instead
        // (ruling 2), which this test pins by shape.
        let request = PunchTaskComposer.punch(
            id: taskID, projectID: projectID, createdBy: designerID,
            fieldCaptureID: captureID, transcript: "scribe short",
            roomName: nil, courtPartyID: "party-gc")

        #expect(request.owner == "gc")
        #expect(request.ownerPartyID == "party-gc")
        #expect(request.sectionKey == "install")
        #expect(request.status == "todo")
    }

    @Test func aPlainTaskIsHersAndCarriesNoSectionOrParty() throws {
        let request = PunchTaskComposer.task(
            id: taskID, projectID: projectID, createdBy: designerID,
            fieldCaptureID: captureID, transcript: "order the runner",
            roomName: "Living")

        #expect(request.owner == "designer")
        #expect(request.ownerPartyID == nil)
        #expect(request.sectionKey == nil)
        #expect(request.status == "todo")
    }

    @Test func theRoomTravelsInTheDescriptionBecauseThereIsNoRoomColumn() {
        let request = PunchTaskComposer.punch(
            id: taskID, projectID: projectID, createdBy: designerID,
            fieldCaptureID: captureID,
            transcript: "the base cabinet scribe is short on the left return",
            roomName: "Kitchen", courtPartyID: "party-gc")

        #expect(request.description ==
                "the base cabinet scribe is short on the left return\nKitchen")
    }

    @Test func aRoomlessPunchHasNoTrailingBlankLine() {
        let request = PunchTaskComposer.punch(
            id: taskID, projectID: projectID, createdBy: designerID,
            fieldCaptureID: captureID, transcript: "scribe short",
            roomName: nil, courtPartyID: "party-gc")

        #expect(request.description == "scribe short")
    }

    // MARK: - The title

    @Test func theTitleIsTheFirstSentence_sentenceCased() {
        #expect(PunchTaskComposer.title(
            from: "the base cabinet scribe is short. the filler needs re-cutting.")
                == "The base cabinet scribe is short.")
    }

    @Test func aLongUnbrokenTitleIsClippedSoItReadsInAList() {
        let long = String(repeating: "scribe ", count: 40)
        let title = PunchTaskComposer.title(from: long)
        #expect(title.count <= 80)
        #expect(title.hasSuffix("…"))
    }

    @Test func aSpokenlessPunchStillGetsAName() {
        #expect(PunchTaskComposer.title(from: nil) == "From a site visit")
        #expect(PunchTaskComposer.title(from: "   ") == "From a site visit")
    }

    // MARK: - Lookup before write

    @Test func aReplayFindsTheExistingTaskBeforeWritingAgain() async throws {
        let gateway = SpyPunchTaskGateway(exists: true)
        let request = PunchTaskComposer.task(
            id: taskID, projectID: projectID, createdBy: designerID,
            fieldCaptureID: captureID, transcript: "x", roomName: nil)

        let outcome = try await PunchTaskOrchestrator(gateway: gateway).write(request)

        #expect(outcome == .alreadyWritten)
        #expect(gateway.insertCount == 0)
    }

    @Test func aFirstAttemptInsertsExactlyOnce() async throws {
        let gateway = SpyPunchTaskGateway(exists: false)
        let request = PunchTaskComposer.task(
            id: taskID, projectID: projectID, createdBy: designerID,
            fieldCaptureID: captureID, transcript: "x", roomName: nil)

        let outcome = try await PunchTaskOrchestrator(gateway: gateway).write(request)

        #expect(outcome == .written)
        #expect(gateway.insertCount == 1)
    }

    // MARK: - The lane

    @Test func aRefusedTaskClosesTheLaneSoItDegradesInsteadOfLooping() {
        let specimen = Specimen()
        specimen.requestPunchTask(taskID: taskID, owner: "gc", partyID: "party-gc")
        #expect(specimen.needsPunchTask)

        specimen.markPunchTaskRefused("new row violates row-level security policy")
        #expect(specimen.punchTaskState == .refused)
        #expect(specimen.needsPunchTask == false)
    }

    @Test func requestingATaskRecordsTheCourtItWasAimedAt() {
        let specimen = Specimen()
        specimen.requestPunchTask(taskID: taskID, owner: "gc", partyID: "party-gc")

        #expect(specimen.punchTaskId == taskID.uuidString)
        #expect(specimen.punchTaskOwnerRaw == "gc")
        #expect(specimen.punchTaskPartyId == "party-gc")
        #expect(specimen.punchTaskState == .pending)
        #expect(specimen.punchTaskRetryCount == 0)
    }
}

private final class SpyPunchTaskGateway: PunchTaskGateway, @unchecked Sendable {
    private let exists: Bool
    private(set) var insertCount = 0

    init(exists: Bool) { self.exists = exists }

    func existingProjectTask(id: UUID) async throws -> Bool { exists }
    func insertProjectTask(_ request: PunchTaskWriteRequest) async throws { insertCount += 1 }
}
