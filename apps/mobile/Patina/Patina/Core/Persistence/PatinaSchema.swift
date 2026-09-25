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

/// V1 plus the cached shared direction (W1A-10, CONTRACT-C §C.2): one row per
/// approval edition an account has read. Every V1 model is carried unchanged,
/// so the stage below is lightweight — it adds a table and touches no existing
/// row. A tester's store keeps everything it held.
enum PatinaSchemaV2: VersionedSchema {
    static var versionIdentifier: Schema.Version { Schema.Version(2, 0, 0) }

    static var models: [any PersistentModel.Type] {
        PatinaSchemaV1.models + [CachedDirectionEdition.self]
    }
}

/// Every version this app has shipped, oldest first, and the stages between
/// them. A new version is appended here with its stage; the plan is what
/// `ModelContainer` is given, so the stage list is not optional bookkeeping.
enum PatinaMigrationPlan: SchemaMigrationPlan {
    static var schemas: [any VersionedSchema.Type] {
        [PatinaSchemaV1.self, PatinaSchemaV2.self]
    }

    static var stages: [MigrationStage] {
        [.lightweight(fromVersion: PatinaSchemaV1.self, toVersion: PatinaSchemaV2.self)]
    }
}
