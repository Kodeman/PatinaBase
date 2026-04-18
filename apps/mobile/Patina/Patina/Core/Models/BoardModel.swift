//
//  BoardModel.swift
//  Patina
//
//  SwiftData model for collection boards
//

import SwiftData
import Foundation

/// A named collection board that organizes saved items
@Model
public final class BoardModel {

    @Attribute(.unique) public var id: UUID
    public var name: String
    public var itemIds: String  // JSON-encoded [String] of product IDs
    public var createdAt: Date
    public var updatedAt: Date

    public init(
        id: UUID = UUID(),
        name: String,
        itemIds: [String] = []
    ) {
        self.id = id
        self.name = name
        self.itemIds = Self.encode(itemIds)
        self.createdAt = Date()
        self.updatedAt = Date()
    }

    // MARK: - Item Management

    public var items: [String] {
        get { Self.decode(itemIds) }
        set {
            itemIds = Self.encode(newValue)
            updatedAt = Date()
        }
    }

    public var itemCount: Int { items.count }

    public func addItem(_ productId: String) {
        var current = items
        if !current.contains(productId) {
            current.append(productId)
            items = current
        }
    }

    public func removeItem(_ productId: String) {
        items = items.filter { $0 != productId }
    }

    // MARK: - JSON Helpers

    private static func encode(_ array: [String]) -> String {
        (try? JSONEncoder().encode(array)).flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
    }

    private static func decode(_ json: String) -> [String] {
        guard let data = json.data(using: .utf8) else { return [] }
        return (try? JSONDecoder().decode([String].self, from: data)) ?? []
    }
}
