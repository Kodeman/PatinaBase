//
//  DocumentsAPIClientTests.swift
//  PatinaTests
//
//  Wave 3 / D.4: pins DocumentsAPIClient's decode paths against the portal
//  `project_documents` wire shape, the kind/size/title display helpers, the
//  grouping-by-project logic, the safe-filename mapping, and the route name.
//

import Testing
import Foundation
@testable import Patina

struct DocumentsAPIClientTests {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    private func document(_ json: String) throws -> RemoteProjectDocument {
        try decode(RemoteProjectDocument.self, json)
    }

    // MARK: - Decode

    @Test
    func decodesFullDocumentRow() throws {
        let json = """
        {
          "id": "doc-1", "project_id": "proj-1", "title": "Design Agreement",
          "doc_type": "pdf", "category": "contract",
          "storage_path": "proj-1/contracts/agreement.pdf",
          "size_bytes": 2400000, "client_visible": true,
          "created_at": "2026-07-01T00:00:00Z",
          "project": { "id": "proj-1", "name": "Downtown Loft" }
        }
        """
        let doc = try document(json)
        #expect(doc.id == "doc-1")
        #expect(doc.resolvedTitle == "Design Agreement")
        #expect(doc.resolvedProjectId == "proj-1")
        #expect(doc.resolvedProjectName == "Downtown Loft")
        #expect(doc.kindLabel == "Contract")            // humanized category
        #expect(doc.systemIcon == "doc.richtext")       // pdf icon
        #expect(doc.sizeText != nil)
    }

    @Test
    func titleFallsBackWhenBlank() throws {
        let doc = try document(#"{"id":"d","title":"","doc_type":"pdf"}"#)
        #expect(doc.resolvedTitle == "Document")
    }

    @Test
    func projectIdFallsBackToEmbeddedThenUnknown() throws {
        let embedded = try document(#"{"id":"d","doc_type":"pdf","project":{"id":"px","name":"P"}}"#)
        #expect(embedded.resolvedProjectId == "px")
        let none = try document(#"{"id":"d","doc_type":"pdf"}"#)
        #expect(none.resolvedProjectId == "unknown")
        #expect(none.resolvedProjectName == "Project")
    }

    // MARK: - kindLabel

    @Test
    func kindLabelPrefersHumanizedCategory() throws {
        let doc = try document(#"{"id":"d","doc_type":"pdf","category":"floor_plan"}"#)
        #expect(doc.kindLabel == "Floor Plan")
    }

    @Test
    func kindLabelFallsBackToFormatLabels() throws {
        #expect(try document(#"{"id":"a","doc_type":"pdf"}"#).kindLabel == "PDF")
        #expect(try document(#"{"id":"b","doc_type":"dwg"}"#).kindLabel == "DWG")
        #expect(try document(#"{"id":"c","doc_type":"xlsx"}"#).kindLabel == "XLSX")
        // Unknown token → uppercased.
        #expect(try document(#"{"id":"e","doc_type":"heic"}"#).kindLabel == "HEIC")
        // No token at all.
        #expect(try document(#"{"id":"f"}"#).kindLabel == "File")
    }

    // MARK: - sizeText

    @Test
    func sizeTextNilWhenZeroOrMissing() throws {
        #expect(try document(#"{"id":"a","doc_type":"pdf"}"#).sizeText == nil)
        #expect(try document(#"{"id":"b","doc_type":"pdf","size_bytes":0}"#).sizeText == nil)
        #expect(try document(#"{"id":"c","doc_type":"pdf","size_bytes":1048576}"#).sizeText != nil)
    }

    // MARK: - Grouping

    @Test
    func groupsByProjectPreservingEncounterOrder() throws {
        // Newest-first list: proj-B doc, then two proj-A docs.
        let docs = [
            try document(#"{"id":"d1","project_id":"B","doc_type":"pdf","project":{"id":"B","name":"Studio"}}"#),
            try document(#"{"id":"d2","project_id":"A","doc_type":"pdf","project":{"id":"A","name":"Loft"}}"#),
            try document(#"{"id":"d3","project_id":"A","doc_type":"img","project":{"id":"A","name":"Loft"}}"#)
        ]
        let groups = DocumentGrouping.byProject(docs)
        #expect(groups.map(\.id) == ["B", "A"])          // encounter order
        #expect(groups[0].projectName == "Studio")
        #expect(groups[0].documents.count == 1)
        #expect(groups[1].documents.map(\.id) == ["d2", "d3"])  // in-group order kept
    }

    @Test
    func groupingEmptyIsEmpty() {
        #expect(DocumentGrouping.byProject([]).isEmpty)
    }

    // MARK: - Cache filename

    @Test
    func cacheFileURLUsesRealExtensionAndSafeTitle() throws {
        let doc = try document(#"{"id":"doc-9","title":"Q3 / Plan: v2","doc_type":"pdf"}"#)
        let url = DocumentsAPIClient.cacheFileURL(for: doc, storagePath: "proj/x/plan.pdf")
        #expect(url.pathExtension == "pdf")             // extension from storage path
        #expect(url.lastPathComponent == "Q3 - Plan- v2.pdf")  // sanitized title
        #expect(url.deletingLastPathComponent().lastPathComponent == "doc-9")
    }

    @Test
    func sanitizedFilenameHandlesBlank() {
        #expect(DocumentsAPIClient.sanitizedFilename("   ") == "Document")
        #expect(DocumentsAPIClient.sanitizedFilename("a/b:c") == "a-b-c")
    }

    // MARK: - Route name

    @Test
    func documentRouteName() {
        #expect(AppRoute.documentList.displayName == "Documents")
    }
}
