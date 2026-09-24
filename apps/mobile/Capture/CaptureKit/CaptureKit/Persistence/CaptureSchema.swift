//  CaptureSchema.swift
//  CaptureKit
//
//  Field's store schema, versioned, and the plan that carries an installed
//  store across a change to it. The same pattern as Patina's PatinaSchema.swift.
//
//  Until this file existed the container was built from a bare `Schema([...])`
//  with no `SchemaMigrationPlan`. A change that lightweight inference could not
//  carry had no stage to go in, so the only way forward was the store-open
//  ladder setting the designer's store aside, unsynced queue and all.

import SwiftData

/// The schema Patina Field 0.1 (6) shipped: the store in
/// `CaptureTests/Fixtures/Store-0.1-6` is V1, and opens through the V1→V2 stage.
///
/// The model classes are declared INSIDE this enum (each in its own file, as
/// `extension CaptureSchemaV1 { @Model public final class … }`), and the app
/// reaches them through the typealiases below. That is what lets V1 stay
/// frozen: the next version declares its own nested classes, the typealiases
/// move to them, and these declarations remain what a V1 store holds. Nesting
/// does not qualify the stored entity name: `CaptureSchemaV1.Specimen` is still
/// the entity `Specimen`.
///
/// `versionIdentifier` is 1.0.0 because this is the first version of the store
/// schema, not a build number: the app's version moves on every build whether
/// or not the schema does. The next schema is 2.0.0. Never edit a stored
/// property here in place, since that changes V1 itself; add a version and a
/// stage instead.
public enum CaptureSchemaV1: VersionedSchema {
    public static var versionIdentifier: Schema.Version { Schema.Version(1, 0, 0) }

    public static var models: [any PersistentModel.Type] {
        [
            Specimen.self,
            CapturePhoto.self,
            CaptureMeasurement.self,
            CaptureProjectRef.self,
            ScanUploadRecord.self,
            SiteRequestOutboxRecord.self,
            FieldVisitCloseRecord.self,
            TimeEntryOutboxRecord.self
        ]
    }
}

/// V2 (W1-02): the capture record is `Piece` (lexicon ruling D3a), and a
/// field's origin and its confirmation are separate facts (`confirmedByRaw`,
/// `confirmedAtRaw`, `proposedValueRaw`; inventory P0-08).
///
/// Only the three classes that changed are redeclared (Piece.swift). The other
/// five are V1's classes, unchanged, so V1 and V2 share them.
public enum CaptureSchemaV2: VersionedSchema {
    public static var versionIdentifier: Schema.Version { Schema.Version(2, 0, 0) }

    public static var models: [any PersistentModel.Type] {
        [
            Piece.self,
            CapturePhoto.self,
            CaptureMeasurement.self,
            CaptureSchemaV1.CaptureProjectRef.self,
            CaptureSchemaV1.ScanUploadRecord.self,
            CaptureSchemaV1.SiteRequestOutboxRecord.self,
            CaptureSchemaV1.FieldVisitCloseRecord.self,
            CaptureSchemaV1.TimeEntryOutboxRecord.self
        ]
    }
}

/// Every version Field has shipped, oldest first, and the stages between them.
/// A new version is appended here with its stage. Every `ModelContainer` Field
/// opens is built from this plan (`CaptureStore.makeContainer(configuration:)`).
public enum CaptureMigrationPlan: SchemaMigrationPlan {
    public static var schemas: [any VersionedSchema.Type] {
        [CaptureSchemaV1.self, CaptureSchemaV2.self]
    }

    /// V1→V2 is custom because SwiftData cannot rename an entity: a lightweight
    /// stage would drop every Specimen row. willMigrate carries the rows out of
    /// the V1 store; `CaptureStore.makeContainer` puts them back as pieces after
    /// the open (PieceMigrationCarry.swift says why not in didMigrate).
    public static var stages: [MigrationStage] {
        [
            .custom(fromVersion: CaptureSchemaV1.self, toVersion: CaptureSchemaV2.self,
                    willMigrate: { context in try PieceMigrationCarry.write(from: context) },
                    didMigrate: nil)
        ]
    }
}

// The live model types. Retarget these at the newest version's classes when
// one is added.
public typealias Piece = CaptureSchemaV2.Piece
public typealias CapturePhoto = CaptureSchemaV2.CapturePhoto
public typealias CaptureMeasurement = CaptureSchemaV2.CaptureMeasurement
public typealias CaptureProjectRef = CaptureSchemaV1.CaptureProjectRef
public typealias ScanUploadRecord = CaptureSchemaV1.ScanUploadRecord
public typealias SiteRequestOutboxRecord = CaptureSchemaV1.SiteRequestOutboxRecord
public typealias FieldVisitCloseRecord = CaptureSchemaV1.FieldVisitCloseRecord
public typealias TimeEntryOutboxRecord = CaptureSchemaV1.TimeEntryOutboxRecord
