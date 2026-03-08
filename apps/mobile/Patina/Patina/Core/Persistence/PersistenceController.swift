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

    // MARK: - Initialization

    private init() {
        let schema = Schema([
            TableItemModel.self,
            RoomModel.self,
            StylePreferenceModel.self,
            SyncQueueItem.self
        ])

        let configuration = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: false,
            allowsSave: true
        )

        do {
            container = try ModelContainer(for: schema, configurations: [configuration])
        } catch {
            fatalError("Failed to create ModelContainer: \(error)")
        }
    }

    // MARK: - Preview Container

    public static var previewContainer: ModelContainer {
        let schema = Schema([
            TableItemModel.self,
            RoomModel.self,
            StylePreferenceModel.self,
            SyncQueueItem.self
        ])

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
