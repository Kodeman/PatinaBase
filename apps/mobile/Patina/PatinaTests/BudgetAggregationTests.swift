//
//  BudgetAggregationTests.swift
//  PatinaTests
//
//  Wave 3 / D.3: pins the pure budget aggregation (`BudgetMath`) and the
//  per-project section builder against the client portal's rollup semantics
//  (apps/client-portal/src/app/budget/rollup.ts + PaymentScheduleBlock):
//   • visible = not draft, not void
//   • billed / paid / outstanding sums
//   • milestone amount = stored cents, else percentage-of-total fallback
//   • sections grouped by project, money-less projects omitted, spine order.
//

import Testing
import Foundation
@testable import Patina

struct BudgetAggregationTests {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    private func invoice(_ json: String) throws -> RemoteInvoice { try decode(RemoteInvoice.self, json) }
    private func proposal(_ json: String) throws -> RemoteProposal { try decode(RemoteProposal.self, json) }
    private func milestone(_ json: String) throws -> RemoteProposalMilestone {
        try decode(RemoteProposalMilestone.self, json)
    }
    private func project(_ json: String) throws -> RemoteProject { try decode(RemoteProject.self, json) }

    // MARK: - isVisible

    @Test
    func draftAndVoidAreNotVisible() throws {
        let draft = try invoice(#"{"id":"d","status":"draft","total_cents":1000,"amount_paid_cents":0}"#)
        let void = try invoice(#"{"id":"v","status":"void","total_cents":1000,"amount_paid_cents":0}"#)
        let sent = try invoice(#"{"id":"s","status":"sent","total_cents":1000,"amount_paid_cents":0}"#)
        let paid = try invoice(#"{"id":"p","status":"paid","total_cents":1000,"amount_paid_cents":1000}"#)
        #expect(!BudgetMath.isVisible(draft))
        #expect(!BudgetMath.isVisible(void))
        #expect(BudgetMath.isVisible(sent))
        #expect(BudgetMath.isVisible(paid))
    }

    // MARK: - rollup

    @Test
    func rollupSumsBilledPaidOutstandingOverVisibleOnly() throws {
        let invoices = [
            try invoice(#"{"id":"a","status":"sent","total_cents":108000,"amount_paid_cents":0}"#),
            try invoice(#"{"id":"b","status":"partially_paid","total_cents":100000,"amount_paid_cents":40000}"#),
            try invoice(#"{"id":"c","status":"paid","total_cents":50000,"amount_paid_cents":50000}"#),
            try invoice(#"{"id":"d","status":"void","total_cents":99999,"amount_paid_cents":0}"#),
            try invoice(#"{"id":"e","status":"draft","total_cents":77777,"amount_paid_cents":0}"#)
        ]
        let rollup = BudgetMath.rollup(invoices)
        #expect(rollup.billedCents == 258_000)      // 108000 + 100000 + 50000
        #expect(rollup.paidCents == 90_000)         // 0 + 40000 + 50000
        #expect(rollup.outstandingCents == 168_000) // 108000 + 60000 + 0
    }

    @Test
    func rollupOfEmptyIsZero() {
        let rollup = BudgetMath.rollup([])
        #expect(rollup.billedCents == 0)
        #expect(rollup.paidCents == 0)
        #expect(rollup.outstandingCents == 0)
    }

    @Test
    func overpaidInvoiceNeverGoesNegativeOutstanding() throws {
        let invoices = [
            try invoice(#"{"id":"a","status":"paid","total_cents":100,"amount_paid_cents":150}"#)
        ]
        let rollup = BudgetMath.rollup(invoices)
        #expect(rollup.outstandingCents == 0)
        #expect(rollup.paidCents == 150)
    }

    // MARK: - milestone amount

    @Test
    func milestoneUsesStoredAmountWhenPositive() throws {
        let entry = try milestone(#"{"id":"m","amount_cents":25000,"percentage":10}"#)
        #expect(BudgetMath.milestoneAmountCents(entry, totalCents: 100_000) == 25_000)
    }

    @Test
    func milestoneFallsBackToPercentageWhenAmountNonPositive() throws {
        let zero = try milestone(#"{"id":"m","amount_cents":0,"percentage":50}"#)
        #expect(BudgetMath.milestoneAmountCents(zero, totalCents: 100_000) == 50_000)
        let missing = try milestone(#"{"id":"m2","percentage":33.3333}"#)
        #expect(BudgetMath.milestoneAmountCents(missing, totalCents: 100_000) == 33_333)
    }

    // MARK: - buildSections

    @Test
    func sectionsGroupByProjectAndOmitMoneylessProjects() throws {
        let projects = [
            try project(#"{"id":"P1","name":"Loft"}"#),
            try project(#"{"id":"P2","name":"Studio"}"#),
            try project(#"{"id":"P3","name":"Empty"}"#)
        ]
        let accepted = [
            try proposal(#"{"id":"propA","project_id":"P1","status":"accepted","total_amount":100000,"title":"Phase 1"}"#)
        ]
        let visibleInvoices = [
            try invoice(#"{"id":"invX","project_id":"P2","status":"sent","total_cents":40000,"amount_paid_cents":0}"#)
        ]
        let sections = BudgetMath.buildSections(
            projects: projects,
            acceptedProposals: accepted,
            milestonesByProposal: ["propA": []],
            visibleInvoices: visibleInvoices
        )
        // P3 has neither a proposal nor an invoice → omitted. Spine order kept.
        #expect(sections.map(\.id) == ["P1", "P2"])
        #expect(sections[0].proposals.count == 1)
        #expect(sections[0].proposals.first?.title == "Phase 1")
        #expect(sections[0].invoices.isEmpty)
        #expect(sections[1].proposals.isEmpty)
        #expect(sections[1].invoices.count == 1)
        #expect(sections[1].rollup.outstandingCents == 40_000)
    }

    @Test
    func sectionMilestonesAreSortedBySortOrder() throws {
        let projects = [try project(#"{"id":"P1","name":"Loft"}"#)]
        let accepted = [
            try proposal(#"{"id":"propA","project_id":"P1","status":"accepted","total_amount":100000,"title":"Phase 1"}"#)
        ]
        let milestones = [
            try milestone(#"{"id":"m2","label":"Second","sort_order":2,"amount_cents":50000}"#),
            try milestone(#"{"id":"m1","label":"First","sort_order":1,"amount_cents":50000}"#)
        ]
        let sections = BudgetMath.buildSections(
            projects: projects,
            acceptedProposals: accepted,
            milestonesByProposal: ["propA": milestones],
            visibleInvoices: []
        )
        #expect(sections.first?.proposals.first?.milestones.map(\.label) == ["First", "Second"])
    }

    @Test
    func paymentScheduleVisibilityFollowsProposalTier() throws {
        let projects = [try project(#"{"id":"P1","name":"Loft"}"#)]
        let accepted = [
            try proposal(#"{"id":"curated","project_id":"P1","status":"accepted","client_visibility_tier":"curated"}"#),
            try proposal(#"{"id":"milestone","project_id":"P1","status":"accepted","client_visibility_tier":"milestone"}"#),
            try proposal(#"{"id":"full","project_id":"P1","status":"accepted","client_visibility_tier":"full"}"#)
        ]
        let sections = BudgetMath.buildSections(
            projects: projects,
            acceptedProposals: accepted,
            milestonesByProposal: [:],
            visibleInvoices: []
        )
        let proposalsById = Dictionary(
            uniqueKeysWithValues: (sections.first?.proposals ?? []).map { ($0.id, $0) }
        )
        #expect(proposalsById["curated"]?.showsPaymentSchedule == false)
        #expect(proposalsById["milestone"]?.showsPaymentSchedule == true)
        #expect(proposalsById["full"]?.showsPaymentSchedule == true)
    }

    @Test
    func budgetCardGuardsTheEntirePaymentScheduleSurface() throws {
        let sourceURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // PatinaTests
            .deletingLastPathComponent() // Patina project directory
            .appendingPathComponent("Patina/Features/Budget/BudgetBlocks.swift")
        let source = try String(contentsOf: sourceURL, encoding: .utf8)
        #expect(source.contains("if proposal.showsPaymentSchedule {\n                    scheduleBlock"))
    }

    @Test
    func orphanMoneyBearingProjectStillGetsASection() throws {
        // A visible invoice whose project isn't in the spine still surfaces,
        // using the embedded project name.
        let invoices = [
            try invoice(#"{"id":"invY","project_id":"PX","status":"sent","total_cents":1000,"amount_paid_cents":0,"project":{"id":"PX","name":"Orphan"}}"#)
        ]
        let sections = BudgetMath.buildSections(
            projects: [],
            acceptedProposals: [],
            milestonesByProposal: [:],
            visibleInvoices: invoices
        )
        #expect(sections.count == 1)
        #expect(sections.first?.name == "Orphan")
    }

    // MARK: - Studio invoices ("the studio · no house") — S11: null-safety only

    /// S11 (studio-invoices program, adopted as recommended): iOS v1 is
    /// null-safety only, not full placement — a project-less invoice must not
    /// crash or corrupt the build, but it is not shown in Budget this wave.
    @Test("a studio invoice (no project) decodes safely and is silently omitted from Budget, not crashed on")
    func studioInvoiceIsOmittedWithoutCrashing() throws {
        let projects = [try project(#"{"id":"P1","name":"Loft"}"#)]
        let visibleInvoices = [
            try invoice(#"{"id":"invP","project_id":"P1","status":"sent","total_cents":10000,"amount_paid_cents":0}"#),
            try invoice(#"""
            {"id":"invS1","project_id":null,"status":"sent","total_cents":40000,"amount_paid_cents":0,
             "title":"Kitchen consult — ad hoc"}
            """#)
        ]
        let sections = BudgetMath.buildSections(
            projects: projects,
            acceptedProposals: [],
            milestonesByProposal: [:],
            visibleInvoices: visibleInvoices
        )
        // Only the project section appears; the studio invoice contributes no
        // section and no crash — it's simply not surfaced here in v1.
        #expect(sections.map(\.id) == ["P1"])
        #expect(sections.first?.rollup.billedCents == 10_000)
    }

    @Test("a client with only a studio invoice (no house at all) gets zero Budget sections")
    func studioOnlyClientGetsNoSections() throws {
        let visibleInvoices = [
            try invoice(#"{"id":"invS","project_id":null,"status":"sent","total_cents":15000,"amount_paid_cents":0}"#)
        ]
        let sections = BudgetMath.buildSections(
            projects: [],
            acceptedProposals: [],
            milestonesByProposal: [:],
            visibleInvoices: visibleInvoices
        )
        #expect(sections.isEmpty)
    }

    /// Round 2: the headline must count exactly what the sections show. A
    /// studio invoice contributes to neither — the summary card can't display
    /// money that appears in no section below it.
    @Test("the headline (projectScopedRollup) equals the sum of the section rollups when a studio invoice is present")
    func headlineExcludesStudioInvoicesLikeSectionsDo() throws {
        let projects = [try project(#"{"id":"P1","name":"Loft"}"#)]
        let visibleInvoices = [
            try invoice(#"{"id":"invP","project_id":"P1","status":"sent","total_cents":10000,"amount_paid_cents":0}"#),
            try invoice(#"""
            {"id":"invS1","project_id":null,"status":"sent","total_cents":40000,"amount_paid_cents":0,
             "title":"Kitchen consult — ad hoc"}
            """#)
        ]
        let sections = BudgetMath.buildSections(
            projects: projects,
            acceptedProposals: [],
            milestonesByProposal: [:],
            visibleInvoices: visibleInvoices
        )
        let summary = BudgetMath.projectScopedRollup(visibleInvoices)
        let sectionsTotalBilled = sections.reduce(0) { $0 + $1.rollup.billedCents }
        #expect(sections.map(\.id) == ["P1"])
        #expect(summary.billedCents == 10_000)
        #expect(summary.billedCents == sectionsTotalBilled)
        // The full 50,000 across both invoices is NOT what the headline shows —
        // that would be counting money the studio invoice's own section doesn't exist to show.
        #expect(summary.billedCents != BudgetMath.rollup(visibleInvoices).billedCents)
    }

    // MARK: - Payment terms display

    @Test
    func paymentTermsHumanize() {
        #expect(PaymentTermsDisplay.label(for: "net_30") == "Net 30")
        #expect(PaymentTermsDisplay.label(for: "due_on_receipt") == "Due on receipt")
        #expect(PaymentTermsDisplay.label(for: "custom") == "Custom terms")
        #expect(PaymentTermsDisplay.label(for: nil) == nil)
        #expect(PaymentTermsDisplay.label(for: "") == nil)
    }

    // MARK: - Route name

    @Test
    func budgetRouteName() {
        #expect(AppRoute.budget.displayName == "Budget")
    }

    // MARK: - SP-16 · the designer's figure is carried, never conflated

    @Test
    func sectionsCarryTheDesignersFigureSeparately() throws {
        let projects = [try project(#"{"id":"pr-1","name":"Aspen Loft Refresh","budget_cents":12000000}"#)]
        let invoices = [try invoice(
            #"{"id":"i-1","project_id":"pr-1","status":"sent","total_cents":425000,"amount_paid_cents":0}"#
        )]
        let sections = BudgetMath.buildSections(
            projects: projects,
            acceptedProposals: [],
            milestonesByProposal: [:],
            visibleInvoices: invoices
        )
        #expect(sections.count == 1)
        #expect(sections[0].designerBudgetCents == 12_000_000)
        #expect(sections[0].rollup.billedCents == 425_000)
        #expect(sections[0].rollup.outstandingCents == 425_000)
    }

    @Test
    func aProjectWithNoBudgetCarriesNoFigure() throws {
        let projects = [try project(#"{"id":"pr-2","name":"Cabin"}"#)]
        let invoices = [try invoice(
            #"{"id":"i-2","project_id":"pr-2","status":"sent","total_cents":1000,"amount_paid_cents":0}"#
        )]
        let sections = BudgetMath.buildSections(
            projects: projects,
            acceptedProposals: [],
            milestonesByProposal: [:],
            visibleInvoices: invoices
        )
        #expect(sections[0].designerBudgetCents == nil)
    }
}
