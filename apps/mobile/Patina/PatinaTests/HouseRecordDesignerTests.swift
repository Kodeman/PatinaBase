//
//  HouseRecordDesignerTests.swift
//  PatinaTests
//
//  The record says who acted. "Leah sent a proposal to review", not "a
//  proposal was sent" — the whole thesis of Direction B is that another
//  person did something about your house.
//
//  Where the name comes from is not uniform, and the tests pin the shape
//  rather than the wish:
//   • invoices already embed `designer:profiles!invoices_designer_id_fkey`
//   • decisions cannot embed profiles directly — `client_decisions.designer_id`
//     FKs `auth.users`, not `public.profiles` — so the name arrives THROUGH
//     the project embed
//   • projects embed it directly
//   • proposals arrive from the SECURITY DEFINER RPC `list_client_proposals()`,
//     which returns jsonb and takes no embed at all; they fall back to the
//     record's resolver chain.
//

import Foundation
import Testing
@testable import Patina

struct HouseRecordDesignerTests {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    // MARK: - Decisions

    @Test("a decision carries its designer through the project embed")
    func aDecisionCarriesItsDesignerThroughTheProject() throws {
        let decision = try decode(RemoteClientDecision.self, """
        { "id": "d1", "title": "Rug color", "status": "pending",
          "created_at": "2026-08-22T12:00:00Z",
          "project": { "name": "Aspen Loft Refresh",
            "designer": { "id": "u1", "display_name": "Leah Hartwell",
                          "full_name": "Leah B. Hartwell",
                          "business_name": "Hartwell Studio" } } }
        """)

        #expect(decision.designerDisplayName == "Leah Hartwell")
        #expect(decision.designerStudioName == "Hartwell Studio")
    }

    @Test("a decision with no project falls back to your designer")
    func aDecisionWithNoProjectFallsBackToYourDesigner() throws {
        let decision = try decode(RemoteClientDecision.self, """
        { "id": "d1", "title": "Rug color", "status": "pending",
          "created_at": "2026-08-22T12:00:00Z" }
        """)

        #expect(decision.designerDisplayName == "your designer")
        #expect(decision.designerStudioName == nil)
    }

    @Test("a designer with only a full name still gets named")
    func fullNameIsUsedWhenDisplayNameIsMissing() throws {
        let decision = try decode(RemoteClientDecision.self, """
        { "id": "d1", "status": "pending", "created_at": "2026-08-22T12:00:00Z",
          "project": { "name": "Aspen Loft Refresh",
            "designer": { "id": "u1", "full_name": "Leah B. Hartwell" } } }
        """)

        #expect(decision.designerDisplayName == "Leah B. Hartwell")
    }

    // MARK: - Projects

    @Test("a project carries the designer and the studio")
    func aProjectCarriesDesignerAndStudio() throws {
        let project = try decode(RemoteProject.self, """
        { "id": "pr1", "name": "Aspen Loft Refresh", "designer_id": "u1",
          "designer": { "id": "u1", "display_name": "Leah Hartwell",
                        "business_name": "Hartwell Studio" } }
        """)

        #expect(project.designerDisplayName == "Leah Hartwell")
        #expect(project.designerStudioName == "Hartwell Studio")
    }

    @Test("a project with no designer embed still decodes")
    func aProjectWithoutTheEmbedStillDecodes() throws {
        let project = try decode(RemoteProject.self, """
        { "id": "pr1", "name": "Aspen Loft Refresh" }
        """)

        #expect(project.designer == nil)
        #expect(project.designerDisplayName == "your designer")
    }

    // MARK: - The selects

    @Test("the decision select embeds the designer once, through the project")
    func theDecisionSelectEmbedsTheDesignerOnce() {
        let select = DecisionsAPIClient.decisionSelect
        #expect(select.components(separatedBy: "projects_designer_id_fkey").count - 1 == 1)
        // The embed must sit INSIDE project:projects(...), not beside it —
        // client_decisions has no FK to public.profiles.
        #expect(select.contains("project:projects(name,designer:profiles!projects_designer_id_fkey("))
        // Nothing the existing decode needs may be dropped by the rewrite.
        for column in ["id", "project_id", "title", "description:context", "status",
                       "decision_type", "recommended_option_id", "viewed_at",
                       "responded_at", "due_date", "client_consent_method",
                       "client_consented_at", "created_at"] {
            #expect(select.contains(column), "decisionSelect dropped \(column)")
        }
    }

    @Test("the project select embeds the designer once and still takes every column")
    func theProjectSelectEmbedsTheDesignerOnce() {
        let select = ProjectsAPIClient.projectSelect
        #expect(select.components(separatedBy: "projects_designer_id_fkey").count - 1 == 1)
        #expect(select.hasPrefix("*,"))
    }

    @Test("the designer reference asks only for the columns profiles actually has")
    func theDesignerReferenceAsksForRealColumns() {
        // `profiles` has display_name / full_name / business_name and NO
        // studio_name — a select naming a column that does not exist 400s the
        // whole query, taking the row list with it.
        let select = RemoteDesignerRef.selectColumns
        #expect(select == "id,display_name,full_name,business_name")
        #expect(!select.contains("studio_name"))
    }
}
