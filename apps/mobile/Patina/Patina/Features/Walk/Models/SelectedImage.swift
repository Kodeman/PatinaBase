//
//  SelectedImage.swift
//  Patina
//
//  Represents a selected room image with role metadata for the multi-image capture system.
//  Each room scan captures up to 10 images: 1 hero + 9 supporting images.
//

import Foundation

/// Role classification for selected room images
public enum ImageRole: String, Codable, CaseIterable {
    // Primary image
    case hero               // Best overall quality - primary display image

    // Feature-anchored images (captured when features detected)
    case featureWindow      // Captured showing window(s)
    case featureLargeWindow // Captured showing large window
    case featureDoor        // Captured showing door(s)
    case featureFireplace   // Captured showing fireplace
    case featureBookshelf   // Built-in bookshelves, storage
    case featureTallCeiling // Architectural - tall ceilings
    case featureHardwood    // Hardwood flooring detail

    // Coverage-based images (spatially/temporally diverse)
    case coverageEarly      // Early in the scan
    case coverageMid        // Middle of the scan
    case coverageLate       // Late in the scan
    case supplemental       // Additional high-quality coverage

    /// Human-readable description
    public var displayName: String {
        switch self {
        case .hero: return "Hero"
        case .featureWindow: return "Window"
        case .featureLargeWindow: return "Large Window"
        case .featureDoor: return "Door"
        case .featureFireplace: return "Fireplace"
        case .featureBookshelf: return "Bookshelf"
        case .featureTallCeiling: return "Tall Ceiling"
        case .featureHardwood: return "Hardwood Floor"
        case .coverageEarly: return "Room View"
        case .coverageMid: return "Room View"
        case .coverageLate: return "Room View"
        case .supplemental: return "Room View"
        }
    }

    /// Whether this role is feature-anchored
    public var isFeatureAnchored: Bool {
        switch self {
        case .featureWindow, .featureLargeWindow, .featureDoor,
             .featureFireplace, .featureBookshelf, .featureTallCeiling,
             .featureHardwood:
            return true
        default:
            return false
        }
    }

    /// Map from FeatureCategory to ImageRole
    public static func from(feature: FeatureCategory) -> ImageRole? {
        switch feature {
        case .window: return .featureWindow
        case .largeWindow: return .featureLargeWindow
        case .door: return .featureDoor
        case .fireplace: return .featureFireplace
        case .bookshelf: return .featureBookshelf
        case .tallCeiling: return .featureTallCeiling
        case .hardwoodFloor: return .featureHardwood
        case .cornerNook, .openArea, .seatingArea:
            return nil // No specific image role for these
        }
    }
}

/// Represents a selected room image with its role and metadata
public struct SelectedImage: Codable, Identifiable {
    public let id: UUID

    /// The captured frame data
    public let frame: CapturedFrame

    /// Classification/role of this image
    public let role: ImageRole

    /// Whether this is the primary/hero image
    public let isPrimary: Bool

    /// Display order in the image collection (0 = hero, 1-9 = supporting)
    public var displayOrder: Int

    /// Associated feature category (if feature-anchored)
    public var associatedFeature: FeatureCategory?

    // MARK: - Computed Properties

    /// Quality score from the underlying frame
    public var qualityScore: Float {
        frame.totalScore
    }

    /// Quality grade from the underlying frame
    public var qualityGrade: CapturedFrame.QualityGrade {
        frame.qualityGrade
    }

    /// Image data from the underlying frame
    public var imageData: Data? {
        frame.imageData
    }

    /// Timestamp when the image was captured
    public var capturedAt: Date {
        frame.timestamp
    }

    // MARK: - Initialization

    public init(
        id: UUID = UUID(),
        frame: CapturedFrame,
        role: ImageRole,
        isPrimary: Bool,
        displayOrder: Int = 0,
        associatedFeature: FeatureCategory? = nil
    ) {
        self.id = id
        self.frame = frame
        self.role = role
        self.isPrimary = isPrimary
        self.displayOrder = displayOrder
        self.associatedFeature = associatedFeature
    }

    /// Convenience initializer for hero frame
    public static func hero(from frame: CapturedFrame) -> SelectedImage {
        SelectedImage(
            frame: frame,
            role: .hero,
            isPrimary: true,
            displayOrder: 0
        )
    }

    /// Convenience initializer for feature-anchored frame
    public static func feature(
        from frame: CapturedFrame,
        feature: FeatureCategory,
        order: Int
    ) -> SelectedImage? {
        guard let role = ImageRole.from(feature: feature) else { return nil }
        return SelectedImage(
            frame: frame,
            role: role,
            isPrimary: false,
            displayOrder: order,
            associatedFeature: feature
        )
    }

    /// Convenience initializer for coverage frame
    public static func coverage(
        from frame: CapturedFrame,
        role: ImageRole,
        order: Int
    ) -> SelectedImage {
        SelectedImage(
            frame: frame,
            role: role,
            isPrimary: false,
            displayOrder: order
        )
    }
}

// MARK: - Comparable

extension SelectedImage: Comparable {
    public static func < (lhs: SelectedImage, rhs: SelectedImage) -> Bool {
        lhs.displayOrder < rhs.displayOrder
    }
}

// MARK: - Debug Description

extension SelectedImage: CustomDebugStringConvertible {
    public var debugDescription: String {
        """
        SelectedImage(
            role: \(role.rawValue),
            order: \(displayOrder),
            isPrimary: \(isPrimary),
            feature: \(associatedFeature?.rawValue ?? "none"),
            score: \(String(format: "%.2f", qualityScore)),
            grade: \(qualityGrade.rawValue)
        )
        """
    }
}
