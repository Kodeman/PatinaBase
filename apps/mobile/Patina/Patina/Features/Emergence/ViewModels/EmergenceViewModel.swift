//
//  EmergenceViewModel.swift
//  Patina
//
//  ViewModel for the Emergence experience
//

import SwiftUI
import SwiftData
import Observation

/// ViewModel for piece emergence and reveal
@MainActor
@Observable
public final class EmergenceViewModel {

    // MARK: - Properties

    /// The piece being revealed
    private(set) var piece: EmergingPiece?

    /// Current room context
    var roomName: String = "Your Living Room"

    /// Reveal state
    private(set) var isRevealing = false
    private(set) var isRevealed = false
    private(set) var showStory = false

    /// Action state
    private(set) var isSaving = false
    private(set) var hasSaved = false
    private(set) var hasDrifted = false

    /// Error state
    var errorMessage: String?

    /// Model context for saving to Table
    private var modelContext: ModelContext?

    // MARK: - Initialization

    public init() {}

    /// Configure with a specific piece ID
    public func configure(pieceId: String?, modelContext: ModelContext?) {
        self.modelContext = modelContext

        if let pieceId = pieceId, let foundPiece = MockPieces.piece(withId: pieceId) {
            self.piece = foundPiece
            self.roomName = foundPiece.roomSuggestion ?? "Your Space"
        } else {
            // Get a random piece for demonstration
            self.piece = MockPieces.randomPiece()
            self.roomName = piece?.roomSuggestion ?? "Your Space"
        }
    }

    // MARK: - Reveal Actions

    /// Begin the reveal sequence
    public func beginReveal() {
        guard !isRevealing else { return }

        isRevealing = true

        // Anticipation delay before reveal
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            withAnimation(.spring(response: 0.8, dampingFraction: 0.7)) {
                self?.isRevealed = true
            }
            HapticManager.shared.emergenceReveal()
        }

        // Show story after reveal settles
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
            withAnimation(.easeOut(duration: 0.5)) {
                self?.showStory = true
            }
        }
    }

    // MARK: - User Actions

    /// "Stay" - Save the piece to the user's Table
    public func stay() {
        guard let piece = piece, !isSaving, !hasSaved else { return }

        isSaving = true
        HapticManager.shared.impact(.medium)

        // Simulate save with slight delay for UX
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            self?.saveToTable(piece)
            self?.isSaving = false
            self?.hasSaved = true
            HapticManager.shared.notification(.success)
        }
    }

    /// "Drift" - Let the piece go for now
    public func drift() {
        guard !hasDrifted else { return }

        HapticManager.shared.impact(.light)

        withAnimation(.easeOut(duration: 0.5)) {
            hasDrifted = true
        }
    }

    /// Reset for a new emergence
    public func reset() {
        isRevealing = false
        isRevealed = false
        showStory = false
        isSaving = false
        hasSaved = false
        hasDrifted = false
        piece = MockPieces.randomPiece()
        roomName = piece?.roomSuggestion ?? "Your Space"
    }

    // MARK: - Private Helpers

    private func saveToTable(_ piece: EmergingPiece) {
        guard let context = modelContext else {
            // No context - just mark as saved for demo
            return
        }

        // Create TableItemModel from EmergingPiece
        let tableItem = TableItemModel(
            name: piece.name,
            productId: piece.id,
            imageURL: piece.imageURL,
            brandName: piece.maker,
            priceInCents: piece.priceInCents
        )

        context.insert(tableItem)

        do {
            try context.save()
        } catch {
            errorMessage = "Failed to save: \(error.localizedDescription)"
        }
    }
}
