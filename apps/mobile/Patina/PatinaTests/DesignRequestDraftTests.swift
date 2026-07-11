//
//  DesignRequestDraftTests.swift
//  PatinaTests
//
//  Pins the DesignRequestDraft model: ordered scan ids, phase transitions +
//  resume-prompt policy, primary default, and the single-active-draft
//  descriptor.
//

import Testing
import Foundation
import SwiftData
@testable import Patina

@MainActor
struct DesignRequestDraftTests {

    private func makeContainer() throws -> ModelContainer {
        let schema = Schema([DesignRequestDraft.self])
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        return try ModelContainer(for: schema, configurations: [config])
    }

    @Test
    func scanIdsRoundTripPreservesOrder() {
        let s1 = UUID(); let s2 = UUID(); let s3 = UUID()
        let draft = DesignRequestDraft(scanIds: [s1, s2, s3])
        #expect(draft.scanIds == [s1, s2, s3])

        draft.scanIds = [s3, s1]
        #expect(draft.scanIds == [s3, s1])
    }

    @Test
    func primaryDefaultsToFirstScan() {
        let s1 = UUID(); let s2 = UUID()
        let draft = DesignRequestDraft(scanIds: [s1, s2])
        #expect(draft.primaryScanId == s1)
    }

    @Test
    func phaseDefaultsToComposingAndTransitions() {
        let draft = DesignRequestDraft()
        #expect(draft.phase == .composing)
        draft.setPhase(.uploading)
        #expect(draft.phase == .uploading)
        #expect(draft.phaseRaw == "uploading")
    }

    @Test
    func resumePromptPolicy() {
        #expect(DesignRequestPhase.composing.needsResumePrompt == false)
        #expect(DesignRequestPhase.uploading.needsResumePrompt == true)
        #expect(DesignRequestPhase.readyToSubmit.needsResumePrompt == true)
        #expect(DesignRequestPhase.submitting.needsResumePrompt == true)
    }

    @Test
    func sourceDefaultsToPatinaApp() {
        #expect(DesignRequestDraft().sourceRaw == "Patina app")
    }

    @Test
    func activeDraftDescriptorReturnsMostRecent() throws {
        let container = try makeContainer()
        let ctx = container.mainContext

        let older = DesignRequestDraft()
        older.updatedAt = Date().addingTimeInterval(-100)
        let newer = DesignRequestDraft()
        newer.updatedAt = Date()
        ctx.insert(older)
        ctx.insert(newer)
        try ctx.save()

        let found = try ctx.fetch(DesignRequestDraft.activeDraftDescriptor)
        #expect(found.count == 1)
        #expect(found.first?.id == newer.id)
    }
}
