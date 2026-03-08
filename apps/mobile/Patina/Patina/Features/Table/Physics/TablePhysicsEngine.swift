//
//  TablePhysicsEngine.swift
//  Patina
//
//  Physics engine for the Table using UIKit Dynamics
//

import UIKit
import SwiftUI

/// Physics engine that powers the Table's drag and drop behavior
@MainActor
public final class TablePhysicsEngine: NSObject {

    // MARK: - Properties

    private var animator: UIDynamicAnimator?
    private var snapBehaviors: [UUID: UISnapBehavior] = [:]
    private var itemBehaviors: [UUID: UIDynamicItemBehavior] = [:]
    private var collisionBehavior: UICollisionBehavior?

    private var dynamicItems: [UUID: PhysicsItem] = [:]

    /// Bounds for collision detection
    private var bounds: CGRect = .zero

    /// Friction coefficient (0-1)
    public var friction: CGFloat = 0.3

    /// Density of items
    public var density: CGFloat = 0.5

    /// Elasticity on collision (0-1)
    public var elasticity: CGFloat = 0.3

    /// Resistance (drag) coefficient
    public var resistance: CGFloat = 0.5

    // MARK: - Initialization

    public override init() {
        super.init()
    }

    /// Configure the engine with a reference view
    public func configure(with view: UIView) {
        animator = UIDynamicAnimator(referenceView: view)
        bounds = view.bounds

        // Setup collision behavior
        collisionBehavior = UICollisionBehavior()
        collisionBehavior?.translatesReferenceBoundsIntoBoundary = true
        collisionBehavior?.collisionDelegate = self

        if let collision = collisionBehavior {
            animator?.addBehavior(collision)
        }
    }

    /// Update bounds (e.g., on rotation)
    public func updateBounds(_ newBounds: CGRect) {
        bounds = newBounds
    }

    // MARK: - Item Management

    /// Add an item to the physics simulation
    public func addItem(id: UUID, at position: CGPoint, size: CGSize) {
        let item = PhysicsItem(id: id, center: position, bounds: CGRect(origin: .zero, size: size))
        dynamicItems[id] = item

        // Add to collision
        collisionBehavior?.addItem(item)

        // Add item behavior
        let itemBehavior = UIDynamicItemBehavior(items: [item])
        itemBehavior.friction = friction
        itemBehavior.density = density
        itemBehavior.elasticity = elasticity
        itemBehavior.resistance = resistance
        itemBehavior.allowsRotation = false

        animator?.addBehavior(itemBehavior)
        itemBehaviors[id] = itemBehavior
    }

    /// Remove an item from the simulation
    public func removeItem(id: UUID) {
        guard let item = dynamicItems[id] else { return }

        // Remove snap behavior
        if let snap = snapBehaviors[id] {
            animator?.removeBehavior(snap)
            snapBehaviors.removeValue(forKey: id)
        }

        // Remove item behavior
        if let behavior = itemBehaviors[id] {
            animator?.removeBehavior(behavior)
            itemBehaviors.removeValue(forKey: id)
        }

        // Remove from collision
        collisionBehavior?.removeItem(item)

        dynamicItems.removeValue(forKey: id)
    }

    /// Update item position during drag
    public func updateItemPosition(id: UUID, to position: CGPoint) {
        guard let item = dynamicItems[id] else { return }

        // Remove snap during drag
        if let snap = snapBehaviors[id] {
            animator?.removeBehavior(snap)
            snapBehaviors.removeValue(forKey: id)
        }

        item.center = position
        animator?.updateItem(usingCurrentState: item)
    }

    /// Snap item to position when released
    public func snapItem(id: UUID, to position: CGPoint, completion: (() -> Void)? = nil) {
        guard let item = dynamicItems[id] else { return }

        // Remove existing snap
        if let existingSnap = snapBehaviors[id] {
            animator?.removeBehavior(existingSnap)
        }

        // Constrain to bounds
        let constrainedPosition = constrainToBounds(position, itemSize: item.bounds.size)

        // Create new snap behavior
        let snap = UISnapBehavior(item: item, snapTo: constrainedPosition)
        snap.damping = 0.7
        animator?.addBehavior(snap)
        snapBehaviors[id] = snap

        // Completion after animation settles
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            completion?()
        }
    }

    /// Apply impulse to item (for flicking)
    public func applyImpulse(to id: UUID, velocity: CGPoint) {
        guard let item = dynamicItems[id],
              let behavior = itemBehaviors[id] else { return }

        behavior.addLinearVelocity(velocity, for: item)
    }

    /// Get current position of an item
    public func getPosition(for id: UUID) -> CGPoint? {
        return dynamicItems[id]?.center
    }

    // MARK: - Private Helpers

    private func constrainToBounds(_ position: CGPoint, itemSize: CGSize) -> CGPoint {
        let halfWidth = itemSize.width / 2
        let halfHeight = itemSize.height / 2

        let x = max(halfWidth, min(bounds.width - halfWidth, position.x))
        let y = max(halfHeight, min(bounds.height - halfHeight, position.y))

        return CGPoint(x: x, y: y)
    }

    // MARK: - Cleanup

    public func cleanup() {
        animator?.removeAllBehaviors()
        dynamicItems.removeAll()
        snapBehaviors.removeAll()
        itemBehaviors.removeAll()
        collisionBehavior = nil
    }
}

// MARK: - UICollisionBehaviorDelegate

extension TablePhysicsEngine: UICollisionBehaviorDelegate {
    public func collisionBehavior(
        _ behavior: UICollisionBehavior,
        beganContactFor item1: UIDynamicItem,
        with item2: UIDynamicItem,
        at point: CGPoint
    ) {
        // Items collided - can add haptic feedback here
        HapticManager.shared.impact(.light)
    }

    public func collisionBehavior(
        _ behavior: UICollisionBehavior,
        beganContactFor item: UIDynamicItem,
        withBoundaryIdentifier identifier: NSCopying?,
        at point: CGPoint
    ) {
        // Item hit boundary
        HapticManager.shared.impact(.soft)
    }
}

// MARK: - PhysicsItem

/// A dynamic item for UIKit Dynamics
private class PhysicsItem: NSObject, UIDynamicItem {
    let id: UUID
    var center: CGPoint
    var bounds: CGRect
    var transform: CGAffineTransform = .identity

    init(id: UUID, center: CGPoint, bounds: CGRect) {
        self.id = id
        self.center = center
        self.bounds = bounds
        super.init()
    }
}
