//
//  WorldMapExporter.swift
//  Patina
//
//  Pulls the current ARWorldMap out of the active ARSession and archives it
//  with NSKeyedArchiver so it can be re-hydrated later (for re-localization,
//  persistent AR anchors, and designer-side reconstruction).
//

import Foundation
import ARKit
import os.log

public enum WorldMapExportError: Error, LocalizedError {
    case notAvailable
    case archivingFailed(Error)

    public var errorDescription: String? {
        switch self {
        case .notAvailable:
            return "ARWorldMap was not available from the active session"
        case .archivingFailed(let err):
            return "Failed to archive world map: \(err.localizedDescription)"
        }
    }
}

/// Archives an ARWorldMap to disk. Usable from any actor; the ARKit call
/// hops onto the session's own queue internally.
public enum WorldMapExporter {

    private static let logger = Logger(subsystem: "com.patina.app", category: "WorldMapExport")

    /// Fetch the current world map from `session` and return its archived Data.
    /// Returns `nil` if ARKit reports no world map available yet.
    public static func archivedWorldMap(from session: ARSession) async throws -> Data {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Data, Error>) in
            session.getCurrentWorldMap { map, error in
                if let error = error {
                    logger.error("getCurrentWorldMap failed: \(error.localizedDescription)")
                    continuation.resume(throwing: error)
                    return
                }
                guard let map = map else {
                    continuation.resume(throwing: WorldMapExportError.notAvailable)
                    return
                }
                do {
                    let data = try NSKeyedArchiver.archivedData(
                        withRootObject: map,
                        requiringSecureCoding: true
                    )
                    continuation.resume(returning: data)
                } catch {
                    continuation.resume(throwing: WorldMapExportError.archivingFailed(error))
                }
            }
        }
    }

    /// Convenience — fetch and immediately write into a bundle as the
    /// `.worldMap` artifact.
    @discardableResult
    @MainActor
    public static func exportToBundle(
        session: ARSession,
        bundle: ScanBundleWriter
    ) async -> ScanManifest.Artifact? {
        do {
            let data = try await archivedWorldMap(from: session)
            return try bundle.writeArtifact(
                kind: .worldMap,
                data: data,
                mimeType: "application/octet-stream"
            )
        } catch {
            logger.warning("World map export skipped: \(error.localizedDescription)")
            return nil
        }
    }

    /// Re-hydrate a world map from archived data (for future re-localization).
    public static func unarchive(_ data: Data) throws -> ARWorldMap {
        guard let map = try NSKeyedUnarchiver.unarchivedObject(
            ofClass: ARWorldMap.self,
            from: data
        ) else {
            throw WorldMapExportError.notAvailable
        }
        return map
    }
}
