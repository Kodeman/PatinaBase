//  FieldExperienceTests.swift
//  CaptureTests
//
//  Option B contracts: Camera and Work keep independent histories, and Work's
//  attention feed is a deterministic projection of data already on-device.

import Foundation
import Testing
@testable import CaptureKit

struct FieldRealmHistoryTests {
    @Test func startsInCameraWithEmptyHistories() {
        let history = FieldRealmHistory()

        #expect(history.activeRealm == .camera)
        #expect(history.path(for: .camera).isEmpty)
        #expect(history.path(for: .work).isEmpty)
    }

    @Test func switchingRealmsRestoresEachHistory() {
        var history = FieldRealmHistory()
        history.push(.session)

        history.activate(.work)
        history.push(.projectList)
        history.push(.project("project-a"))

        history.activate(.camera)
        #expect(history.path(for: .camera) == [.session])
        #expect(history.activePath == [.session])

        history.activate(.work)
        #expect(history.activePath == [.projectList, .project("project-a")])
    }

    @Test func backAndRootOnlyChangeTheActiveRealm() {
        var history = FieldRealmHistory()
        history.push(.session)
        history.activate(.work)
        history.push(.projectList)
        history.push(.project("project-a"))

        history.goBack()
        #expect(history.path(for: .work) == [.projectList])
        #expect(history.path(for: .camera) == [.session])

        history.popToRoot()
        #expect(history.path(for: .work).isEmpty)
        #expect(history.path(for: .camera) == [.session])
    }

    @Test func navigationStackReplacementTargetsOneRealm() {
        var history = FieldRealmHistory()
        history.replacePath([.session, .specimen(UUID())], for: .camera)
        history.replacePath([.leadList], for: .work)

        #expect(history.path(for: .camera).count == 2)
        #expect(history.path(for: .work) == [.leadList])
    }
}

struct FieldAttentionBuilderTests {
    private let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }()

    private func date(_ day: Int, _ hour: Int = 12, _ minute: Int = 0) -> Date {
        calendar.date(from: DateComponents(
            year: 2026, month: 7, day: day, hour: hour, minute: minute
        ))!
    }

    @Test func buildsGroundedAttentionSectionsWithoutDuplicates() {
        let now = date(29)
        let draftID = UUID(uuidString: "aaaaaaaa-0000-0000-0000-000000000001")!
        let readyID = UUID(uuidString: "aaaaaaaa-0000-0000-0000-000000000002")!

        let snapshot = FieldAttentionBuilder.build(
            projects: [
                FieldProject(id: "project-moving", name: "Moving project", status: "in_progress",
                             phaseLabel: "Procurement", updatedAt: date(29, 10)),
                FieldProject(id: "project-waiting", name: "Paused project", status: "on_hold",
                             phaseLabel: "On hold", updatedAt: date(28)),
                FieldProject(id: "project-done", name: "Done project", status: "completed",
                             updatedAt: date(29))
            ],
            leads: [
                FieldLead(id: "lead-new", clientName: "Avery", source: "Referral",
                          status: "new", createdAt: date(28)),
                FieldLead(id: "lead-contacted", clientName: "Morgan", status: "contacted",
                          createdAt: date(29))
            ],
            decisions: [
                FieldDecision(id: "decision-pending", title: "Sofa", projectName: "Moving project",
                              clientName: "Avery", status: "pending", sentAt: date(28)),
                FieldDecision(id: "decision-done", title: "Pendant", status: "responded",
                              sentAt: date(29))
            ],
            threads: [
                FieldThread(id: "thread-unread", title: "Client reply",
                            lastMessagePreview: "Can we change the finish?",
                            lastMessageAt: date(28), unread: true),
                FieldThread(id: "thread-today", title: "Install crew",
                            lastMessagePreview: "Confirmed for 2 PM.",
                            lastMessageAt: date(29, 9), unread: false)
            ],
            arrivingPOs: [
                FieldArrivingPO(id: "po-today", poNumber: "PO-1042",
                                vendorName: "Holloway", projectName: "Moving project",
                                eta: date(29), status: "shipped"),
                FieldArrivingPO(id: "po-tomorrow", poNumber: "PO-1043",
                                eta: date(30), status: "shipped")
            ],
            captures: [
                FieldCaptureActivity(id: draftID, title: "Lamp tag", status: .draft,
                                     destination: .undecided, updatedAt: date(28)),
                FieldCaptureActivity(id: readyID, title: "Oak sample", status: .ready,
                                     destination: .library, updatedAt: date(29, 11))
            ],
            now: now,
            calendar: calendar
        )

        #expect(snapshot.needsYou.map(\.id) == [
            "capture:\(draftID.uuidString.lowercased())",
            "thread:thread-unread",
            "lead:lead-new"
        ])
        #expect(snapshot.waitingOnOthers.map(\.id) == [
            "decision:decision-pending"
        ])
        #expect(snapshot.movingToday.map(\.id) == [
            "arrival:po-today",
            "capture:\(readyID.uuidString.lowercased())",
            "project:project-moving",
            "thread:thread-today"
        ])

        let allIDs = snapshot.needsYou.map(\.id)
            + snapshot.waitingOnOthers.map(\.id)
            + snapshot.movingToday.map(\.id)
        #expect(Set(allIDs).count == allIDs.count)
        #expect(!allIDs.contains("project:project-done"))
        #expect(!allIDs.contains("lead:lead-contacted"))
        #expect(!allIDs.contains("decision:decision-done"))
        #expect(!allIDs.contains("arrival:po-tomorrow"))
        #expect(!allIDs.contains("project:project-waiting"))
    }

    @Test func priorityPrecedesRecencyAndStableIDBreaksTies() {
        let now = date(29)
        let oldDraft = UUID(uuidString: "bbbbbbbb-0000-0000-0000-000000000001")!

        let snapshot = FieldAttentionBuilder.build(
            leads: [
                FieldLead(id: "lead-z", clientName: "Zed", status: "new", createdAt: now),
                FieldLead(id: "lead-a", clientName: "Ada", status: "new", createdAt: now)
            ],
            threads: [
                FieldThread(id: "thread-newer", title: "Newer", lastMessageAt: now, unread: true)
            ],
            captures: [
                FieldCaptureActivity(id: oldDraft, title: "Older draft", status: .draft,
                                     destination: .undecided, updatedAt: date(20))
            ],
            now: now,
            calendar: calendar
        )

        #expect(snapshot.needsYou.map(\.id) == [
            "capture:\(oldDraft.uuidString.lowercased())",
            "thread:thread-newer",
            "lead:lead-a",
            "lead:lead-z"
        ])
    }

    @Test func transferFailuresAndRejectedScansNeedAttention() {
        let now = date(29)
        let failedCapture = UUID(
            uuidString: "cccccccc-0000-0000-0000-000000000001"
        )!
        let rejectedCapture = UUID(
            uuidString: "cccccccc-0000-0000-0000-000000000002"
        )!

        let snapshot = FieldAttentionBuilder.build(
            captures: [
                FieldCaptureActivity(
                    id: failedCapture,
                    title: "Chair label",
                    status: .failed,
                    destination: .inbox,
                    transferPhase: .retryableFailure,
                    updatedAt: now
                ),
                FieldCaptureActivity(
                    id: rejectedCapture,
                    title: "Rejected table",
                    status: .failed,
                    destination: .library,
                    transferPhase: .rejected,
                    updatedAt: now
                )
            ],
            scanUploads: [
                FieldScanPendingUpload(
                    id: "scan-review",
                    name: "Library",
                    projectID: "project-a",
                    state: CaptureTransferState(
                        phase: .rejected,
                        errorMessage: "Bundle needs review"
                    )
                )
            ],
            now: now,
            calendar: calendar
        )

        #expect(snapshot.needsYou.map(\.id) == [
            "capture:\(failedCapture.uuidString.lowercased())",
            "capture:\(rejectedCapture.uuidString.lowercased())",
            "scan:scan-review"
        ])
        #expect(snapshot.needsYou.map(\.destination) == [
            .syncStatus,
            .syncStatus,
            .syncStatus
        ])
    }

    @Test func onHoldProjectDoesNotInventAnExternalBlocker() {
        let snapshot = FieldAttentionBuilder.build(
            projects: [
                FieldProject(
                    id: "project-paused",
                    name: "Paused project",
                    status: "on_hold",
                    phaseLabel: "On hold",
                    updatedAt: date(29)
                )
            ],
            now: date(29),
            calendar: calendar
        )

        #expect(snapshot.waitingOnOthers.isEmpty)
        #expect(snapshot.movingToday.isEmpty)
    }

    @Test func activeTransfersMoveTodayWithoutBecomingNeedsYou() {
        let now = date(29)
        let confirming = UUID(
            uuidString: "dddddddd-0000-0000-0000-000000000001"
        )!

        let snapshot = FieldAttentionBuilder.build(
            captures: [
                FieldCaptureActivity(
                    id: confirming,
                    title: "Oak finish",
                    status: .uploading,
                    destination: .library,
                    transferPhase: .awaitingConfirmation,
                    updatedAt: now
                )
            ],
            now: now,
            calendar: calendar
        )

        #expect(snapshot.needsYou.isEmpty)
        #expect(snapshot.movingToday.map(\.id) == [
            "capture:\(confirming.uuidString.lowercased())"
        ])
    }

    @Test func todayUsesTheInjectedCalendarBoundary() {
        let now = date(29, 0, 30)
        let event = date(28, 23, 30)
        let thread = FieldThread(
            id: "thread-boundary", title: "Boundary", lastMessageAt: event, unread: false
        )

        let utc = FieldAttentionBuilder.build(
            threads: [thread], now: now, calendar: calendar
        )

        var pacific = calendar
        pacific.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        let local = FieldAttentionBuilder.build(
            threads: [thread], now: now, calendar: pacific
        )

        #expect(utc.movingToday.isEmpty)
        #expect(local.movingToday.map(\.id) == ["thread:thread-boundary"])
    }

    @Test func emptyInputsBuildEmptySections() {
        let snapshot = FieldAttentionBuilder.build(now: date(29), calendar: calendar)

        #expect(snapshot.needsYou.isEmpty)
        #expect(snapshot.waitingOnOthers.isEmpty)
        #expect(snapshot.movingToday.isEmpty)
    }
}
