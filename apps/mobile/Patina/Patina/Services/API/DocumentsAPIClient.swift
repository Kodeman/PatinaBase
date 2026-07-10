//
//  DocumentsAPIClient.swift
//  Patina
//
//  Wave 3 / D.4: client-visible project documents, mirroring the client
//  portal's `use-documents-client` hook + /documents page. Reads
//  `project_documents` where `client_visible = true` (RLS also scopes to the
//  client's own projects — migrations 00203/00252), grouped by project, and
//  hands off a time-boxed signed URL from the PRIVATE `project-documents`
//  bucket (never a public URL — do not widen the bucket).
//
//  Files preview via QuickLook, so we download to the caches directory first
//  (QuickLook needs a local file URL with a real extension), then present.
//

import Foundation
import Supabase

// MARK: - Wire models

/// Embedded `projects(id, name)` on a document — grouping context.
public struct RemoteDocumentProjectRef: Codable, Sendable {
    public let id: String?
    public let name: String?
}

public struct RemoteProjectDocument: Codable, Sendable, Identifiable {
    public let id: String
    public let project_id: String?
    /// The display name (the table has no separate file_name column).
    public let title: String?
    /// Short format token: pdf | img | doc | dwg | xls | xlsx | png | …
    public let doc_type: String?
    /// Semantic category (contract / drawing / spec), often null.
    public let category: String?
    /// Path inside the `project-documents` bucket — feeds `createSignedURL`.
    public let storage_path: String?
    public let size_bytes: Int?
    public let client_visible: Bool?
    public let created_at: String?
    public let project: RemoteDocumentProjectRef?

    public var resolvedTitle: String {
        if let title, !title.isEmpty { return title }
        return "Document"
    }

    public var resolvedProjectId: String { project_id ?? project?.id ?? "unknown" }
    public var resolvedProjectName: String { project?.name ?? "Project" }

    /// Badge label: humanized `category` when present, else the format token
    /// mapped through the portal's FORMAT_LABELS, else the token uppercased.
    public var kindLabel: String {
        if let category, !category.trimmingCharacters(in: .whitespaces).isEmpty {
            return category
                .replacingOccurrences(of: "_", with: " ")
                .split(separator: " ")
                .map { $0.prefix(1).uppercased() + $0.dropFirst() }
                .joined(separator: " ")
        }
        guard let type = doc_type, !type.isEmpty else { return "File" }
        let labels: [String: String] = [
            "pdf": "PDF", "img": "IMG", "doc": "DOC",
            "xls": "XLS", "xlsx": "XLSX", "dwg": "DWG", "png": "PNG"
        ]
        return labels[type] ?? type.uppercased()
    }

    /// "2.3 MB" — human file size when known.
    public var sizeText: String? {
        guard let bytes = size_bytes, bytes > 0 else { return nil }
        return ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
    }

    /// SF Symbol reflecting the format.
    public var systemIcon: String {
        switch doc_type {
        case "pdf": return "doc.richtext"
        case "img", "png": return "photo"
        case "dwg": return "ruler"
        case "xls", "xlsx": return "tablecells"
        case "doc": return "doc.text"
        default: return "doc"
        }
    }
}

// MARK: - Grouping

/// One project's documents (newest first), for the grouped list.
public struct DocumentProjectGroup: Identifiable, Sendable {
    public let id: String
    public let projectName: String
    public let documents: [RemoteProjectDocument]
}

/// Pure grouping — mirrors the portal's `groupDocumentsByProject`. Kept
/// separate so it's directly unit-testable. Input is expected newest-first
/// (the list query orders `created_at` desc); project order follows the
/// most-recent document per project.
public enum DocumentGrouping {
    public static func byProject(_ documents: [RemoteProjectDocument]) -> [DocumentProjectGroup] {
        var order: [String] = []
        var byProject: [String: [RemoteProjectDocument]] = [:]
        var nameByProject: [String: String] = [:]
        for document in documents {
            let pid = document.resolvedProjectId
            if byProject[pid] == nil {
                order.append(pid)
                nameByProject[pid] = document.resolvedProjectName
            }
            byProject[pid, default: []].append(document)
        }
        return order.map { pid in
            DocumentProjectGroup(
                id: pid,
                projectName: nameByProject[pid] ?? "Project",
                documents: byProject[pid] ?? []
            )
        }
    }
}

// MARK: - Errors

public enum DocumentError: LocalizedError, Sendable {
    case missingPath
    case signedURLFailed
    case downloadFailed

    public var errorDescription: String? {
        switch self {
        case .missingPath:
            return "This document isn't available to open yet."
        case .signedURLFailed:
            return "We couldn't open this file. Please try again."
        case .downloadFailed:
            return "We couldn't download this file. Please try again."
        }
    }
}

// MARK: - Client

public actor DocumentsAPIClient {
    public static let shared = DocumentsAPIClient()

    public init() {}

    private var client: SupabaseClient { SupabaseClientManager.shared.client }

    /// The private bucket that backs `project_documents.storage_path`.
    private static let bucket = "project-documents"

    private static let listSelect =
        "id,project_id,title,doc_type,category,storage_path,size_bytes,client_visible,created_at,"
        + "project:projects(id,name)"

    // MARK: Reads

    /// Every client-visible document across this client's projects, newest
    /// first (RLS scopes to own projects). Mirrors the portal `useClientDocuments`.
    public func listDocuments() async throws -> [RemoteProjectDocument] {
        try await client
            .from("project_documents")
            .select(Self.listSelect)
            .eq("client_visible", value: true)
            .order("created_at", ascending: false)
            .execute()
            .value
    }

    /// Whether a project has any client-visible documents — powers the
    /// ProjectDetailView documents affordance.
    public func hasDocuments(forProject projectId: String) async throws -> Bool {
        struct IdRow: Decodable { let id: String }
        let rows: [IdRow] = try await client
            .from("project_documents")
            .select("id")
            .eq("project_id", value: projectId)
            .eq("client_visible", value: true)
            .limit(1)
            .execute()
            .value
        return !rows.isEmpty
    }

    // MARK: Open

    /// A time-boxed signed URL for a document's file (1 hour), from the private
    /// bucket. Mirrors the portal's `documentSignedUrl`.
    public func signedURL(storagePath: String) async throws -> URL {
        do {
            return try await client.storage
                .from(Self.bucket)
                .createSignedURL(path: storagePath, expiresIn: 3600)
        } catch {
            throw DocumentError.signedURLFailed
        }
    }

    /// Resolve a signed URL, download the bytes, and stash them in the caches
    /// directory under a filename with the real extension so QuickLook can
    /// render + share it. Returns the on-disk URL.
    public func downloadedFileURL(for document: RemoteProjectDocument) async throws -> URL {
        guard let path = document.storage_path, !path.isEmpty else {
            throw DocumentError.missingPath
        }
        let url = try await signedURL(storagePath: path)

        let data: Data
        do {
            let (downloaded, response) = try await URLSession.shared.data(from: url)
            if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                throw DocumentError.downloadFailed
            }
            data = downloaded
        } catch is DocumentError {
            throw DocumentError.downloadFailed
        } catch {
            throw DocumentError.downloadFailed
        }

        let destination = Self.cacheFileURL(for: document, storagePath: path)
        do {
            try FileManager.default.createDirectory(
                at: destination.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try data.write(to: destination, options: .atomic)
        } catch {
            throw DocumentError.downloadFailed
        }
        return destination
    }

    /// Caches/PatinaDocuments/{docId}/{sanitized title}.{ext}. The extension is
    /// taken from the storage path (real file extension) so QuickLook picks the
    /// right renderer; the title makes the QuickLook/share sheet read nicely.
    static func cacheFileURL(for document: RemoteProjectDocument, storagePath: String) -> URL {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let ext = (storagePath as NSString).pathExtension
        let base = sanitizedFilename(document.resolvedTitle)
        let name = ext.isEmpty ? base : "\(base).\(ext)"
        return caches
            .appendingPathComponent("PatinaDocuments", isDirectory: true)
            .appendingPathComponent(document.id, isDirectory: true)
            .appendingPathComponent(name)
    }

    /// Strip path separators and trim so an arbitrary title is a safe filename.
    static func sanitizedFilename(_ raw: String) -> String {
        let cleaned = raw
            .replacingOccurrences(of: "/", with: "-")
            .replacingOccurrences(of: ":", with: "-")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? "Document" : cleaned
    }
}
