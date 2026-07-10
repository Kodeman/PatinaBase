//
//  DocumentsViewModel.swift
//  Patina
//
//  Wave 3 / D.4: client-visible documents grouped by project, with a
//  download-then-QuickLook open flow. Read-only; mirrors the client portal's
//  /documents page. Download-in-progress is tracked per document so only the
//  tapped row shows a spinner; signed-URL / download failures surface as a
//  soft inline error.
//

import SwiftUI

@Observable
@MainActor
final class DocumentListViewModel {
    var groups: [DocumentProjectGroup] = []
    var isLoading: Bool = false
    var error: String?

    /// The document currently being fetched for preview (drives its spinner).
    var downloadingDocumentId: String?
    /// The downloaded file to preview — drives the QuickLook cover.
    var previewURL: IdentifiableURL?
    /// A soft, transient open failure (signed URL or download).
    var openError: String?

    var isEmpty: Bool { groups.isEmpty }

    func load() async {
        isLoading = true
        error = nil
        do {
            let documents = try await DocumentsAPIClient.shared.listDocuments()
            self.groups = DocumentGrouping.byProject(documents)
        } catch {
            self.error = "Couldn't load your documents"
            #if DEBUG
            PatinaLog.ui.error("[Documents] list failed: \(error.localizedDescription)")
            #endif
        }
        isLoading = false
    }

    /// Download the document's file to caches, then present it in QuickLook.
    func open(_ document: RemoteProjectDocument) {
        guard downloadingDocumentId == nil else { return }
        openError = nil
        downloadingDocumentId = document.id
        Task {
            defer { downloadingDocumentId = nil }
            do {
                let fileURL = try await DocumentsAPIClient.shared.downloadedFileURL(for: document)
                self.previewURL = IdentifiableURL(url: fileURL)
            } catch {
                self.openError = (error as? LocalizedError)?.errorDescription
                    ?? "We couldn't open this file. Please try again."
                #if DEBUG
                PatinaLog.ui.error("[Documents] open failed: \(error.localizedDescription)")
                #endif
            }
        }
    }

    func isDownloading(_ document: RemoteProjectDocument) -> Bool {
        downloadingDocumentId == document.id
    }
}
