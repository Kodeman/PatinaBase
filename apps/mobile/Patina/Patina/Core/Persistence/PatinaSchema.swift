//
//  PatinaSchema.swift
//  Patina
//
//  The local store's schema, versioned, and the plan that carries an
//  installed app across a change to it.
//
//  Until this file existed the container was built from a bare
//  `Schema([...])` with no `SchemaMigrationPlan` and a `fatalError` on the
//  catch. A model added or a property renamed in build 2 would have met an
//  installed store SwiftData could not open by inference, and every tester
//  would have got a launch crash loop with no way out but a delete-and-
//  reinstall. Versioning the schema is what makes a stage writable when
//  inference is not enough; `PersistenceController`'s recovery path is what
//  makes even a failed stage survivable.
//

import Foundation
import SwiftData

/// The shipped schema. `BoardModel` is in it — `CollectionsViewModel` fetches
/// and inserts boards against this container, and until now the container's
/// schema did not contain the type (C7-02).
enum PatinaSchemaV1: VersionedSchema {
    static var versionIdentifier: Schema.Version { Schema.Version(1, 0, 0) }

    static var models: [any PersistentModel.Type] {
        [
            TableItemModel.self,
            RoomModel.self,
            SavedItem.self,
            StylePreferenceModel.self,
            SyncQueueItem.self,
            RoomScanPackage.self,
            DesignRequestDraft.self,
            SubmittedDesignRequest.self,
            BoardModel.self
        ]
    }
}

/// Every version this app has shipped, oldest first, and the stages between
/// them. A new version is appended here with its stage; the plan is what
/// `ModelContainer` is given, so the stage list is not optional bookkeeping.
enum PatinaMigrationPlan: SchemaMigrationPlan {
    static var schemas: [any VersionedSchema.Type] {
        [PatinaSchemaV1.self]
    }

    static var stages: [MigrationStage] { [] }
}
