//
//  PersistenceController.swift
//  Patina
//
//  SwiftData persistence management
//

import SwiftData
import Foundation

/// SwiftData model container configuration
@MainActor
public final class PersistenceController {

    // MARK: - Singleton

    public static let shared = PersistenceController()

    // MARK: - Properties

    public let container: ModelContainer

    /// True when this launch is running on a store that had to be started
    /// over. `LocalStoreRecovery.shared.pending` carries the detail.
    public private(set) var didRecoverStore = false

    // MARK: - Initialization

    private init() {
        let schema = Schema(versionedSchema: PatinaSchemaV1.self)
        let configuration = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: false,
            allowsSave: true
        )

        let opened = Self.open(schema: schema, configuration: configuration)
        container = opened.container
        didRecoverStore = opened.recovery != nil
        if let recovery = opened.recovery {
            LocalStoreRecovery.shared.record(recovery)
        }
    }

    /// Open the store, and if it will not open, start over rather than trap.
    ///
    /// Three attempts, in the only order that keeps a launch survivable:
    /// the store as it stands; a fresh store with the unreadable one moved
    /// aside; and — if even that fails, which means the disk itself is the
    /// problem — memory, so the app opens and can say what happened. There is
    /// no `fatalError` on this path: a shipping build must not answer a
    /// corrupt file with a crash loop the person cannot escape (C7-01).
    private static func open(
        schema: Schema,
        configuration: ModelConfiguration
    ) -> (container: ModelContainer, recovery: LocalStoreRecoveryRecord?) {
        do {
            let container = try ModelContainer(
                for: schema,
                migrationPlan: PatinaMigrationPlan.self,
                configurations: [configuration]
            )
            return (container, nil)
        } catch {
            PatinaLog.sync.error(
                "[Persistence] store would not open: \(error.localizedDescription)"
            )
        }

        let archived = LocalStoreRecovery.archiveStore(at: configuration.url)
        if archived != nil {
            do {
                let container = try ModelContainer(
                    for: schema,
                    migrationPlan: PatinaMigrationPlan.self,
                    configurations: [configuration]
                )
                return (
                    container,
                    LocalStoreRecoveryRecord(archivedAt: archived!, occurredAt: Date())
                )
            } catch {
                PatinaLog.sync.error(
                    "[Persistence] fresh store would not open: \(error.localizedDescription)"
                )
            }
        }

        let memory = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        // The in-memory container is the last rung and it takes no plan: there
        // is no prior store to migrate. If it throws, `try!` is honest — the
        // process has no store of any kind and nothing below this can run.
        // swiftlint:disable:next force_try
        let container = try! ModelContainer(for: schema, configurations: [memory])
        return (
            container,
            LocalStoreRecoveryRecord(
                archivedAt: archived ?? configuration.url,
                occurredAt: Date()
            )
        )
    }

    // MARK: - Preview Container

    public static var previewContainer: ModelContainer {
        let schema = Schema(versionedSchema: PatinaSchemaV1.self)
        let configuration = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: true
        )

        do {
            let container = try ModelContainer(for: schema, configurations: [configuration])

            // Add sample data
            Task { @MainActor in
                let context = container.mainContext

                for i in 0..<5 {
                    let item = TableItemModel(
                        name: "Sample Piece \(i + 1)",
                        productId: UUID().uuidString,
                        savedAt: Date().addingTimeInterval(Double(-i * 86400 * 3))
                    )
                    item.positionX = Float.random(in: 50...300)
                    item.positionY = Float.random(in: 100...500)
                    context.insert(item)
                }

                try? context.save()
            }

            return container
        } catch {
            fatalError("Failed to create preview container: \(error)")
        }
    }
}
