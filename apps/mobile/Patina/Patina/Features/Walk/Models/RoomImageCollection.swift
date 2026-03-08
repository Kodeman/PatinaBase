//
//  RoomImageCollection.swift
//  Patina
//
//  Collection of selected room images (hero + supporting) from a room scan.
//  Manages up to 10 images per room with metadata for display and sync.
//

import Foundation

/// Collection of room images captured during a scan
public struct RoomImageCollection: Codable {

    // MARK: - Constants

    /// Maximum number of images in a collection
    public static let maxImageCount = 10

    /// Maximum supporting images (excluding hero)
    public static let maxSupportingCount = 9

    // MARK: - Properties

    /// The primary hero frame
    public var heroImage: SelectedImage?

    /// Supporting images (up to 9)
    public var supportingImages: [SelectedImage]

    // MARK: - Computed Properties

    /// All images in display order (hero first, then supporting by displayOrder)
    public var allImages: [SelectedImage] {
        var images: [SelectedImage] = []
        if let hero = heroImage {
            images.append(hero)
        }
        images.append(contentsOf: supportingImages.sorted())
        return images
    }

    /// Total image count
    public var count: Int {
        (heroImage != nil ? 1 : 0) + supportingImages.count
    }

    /// Whether the collection is empty
    public var isEmpty: Bool {
        heroImage == nil && supportingImages.isEmpty
    }

    /// Whether the collection has a hero image
    public var hasHero: Bool {
        heroImage != nil
    }

    /// Total data size in bytes (approximate)
    public var totalDataSize: Int {
        allImages.compactMap { $0.imageData?.count }.reduce(0, +)
    }

    /// Average quality score across all images
    public var averageQualityScore: Float {
        let images = allImages
        guard !images.isEmpty else { return 0 }
        return images.map { $0.qualityScore }.reduce(0, +) / Float(images.count)
    }

    /// Feature-anchored images only
    public var featureImages: [SelectedImage] {
        allImages.filter { $0.role.isFeatureAnchored }
    }

    /// Coverage-based images only
    public var coverageImages: [SelectedImage] {
        allImages.filter { !$0.role.isFeatureAnchored && !$0.isPrimary }
    }

    /// Feature categories captured in this collection
    public var capturedFeatures: [FeatureCategory] {
        supportingImages.compactMap { $0.associatedFeature }
    }

    // MARK: - Initialization

    public init(heroImage: SelectedImage? = nil, supportingImages: [SelectedImage] = []) {
        self.heroImage = heroImage
        self.supportingImages = Array(supportingImages.prefix(Self.maxSupportingCount))
    }

    /// Create a collection from a list of selected images
    public init(from images: [SelectedImage]) {
        self.heroImage = images.first { $0.isPrimary }
        self.supportingImages = Array(
            images.filter { !$0.isPrimary }
                .sorted()
                .prefix(Self.maxSupportingCount)
        )
    }

    // MARK: - Query Methods

    /// Get images by role
    public func images(for role: ImageRole) -> [SelectedImage] {
        allImages.filter { $0.role == role }
    }

    /// Get image by display order
    public func image(at order: Int) -> SelectedImage? {
        allImages.first { $0.displayOrder == order }
    }

    /// Get images for a specific feature category
    public func images(for feature: FeatureCategory) -> [SelectedImage] {
        supportingImages.filter { $0.associatedFeature == feature }
    }

    /// Check if collection has an image for a specific feature
    public func hasImage(for feature: FeatureCategory) -> Bool {
        supportingImages.contains { $0.associatedFeature == feature }
    }

    // MARK: - Mutation Methods

    /// Add a supporting image to the collection
    public mutating func addSupporting(_ image: SelectedImage) {
        guard supportingImages.count < Self.maxSupportingCount else { return }
        var mutableImage = image
        mutableImage.displayOrder = supportingImages.count + 1
        supportingImages.append(mutableImage)
    }

    /// Set the hero image
    public mutating func setHero(_ image: SelectedImage) {
        var mutableImage = image
        mutableImage.displayOrder = 0
        heroImage = mutableImage
    }

    /// Remove all images
    public mutating func clear() {
        heroImage = nil
        supportingImages = []
    }

    /// Reindex display orders
    public mutating func reindexDisplayOrders() {
        if var hero = heroImage {
            hero.displayOrder = 0
            heroImage = hero
        }
        for i in 0..<supportingImages.count {
            supportingImages[i].displayOrder = i + 1
        }
    }
}

// MARK: - Metadata for Storage

/// Lightweight metadata for cloud storage (excludes image data)
public struct RoomImageCollectionMetadata: Codable {
    public struct ImageMetadata: Codable {
        public let id: UUID
        public let role: ImageRole
        public let isPrimary: Bool
        public let displayOrder: Int
        public let qualityScore: Float
        public let capturedAt: Date
        public let associatedFeature: FeatureCategory?
        public var cloudUrl: String?

        public init(from image: SelectedImage, cloudUrl: String? = nil) {
            self.id = image.id
            self.role = image.role
            self.isPrimary = image.isPrimary
            self.displayOrder = image.displayOrder
            self.qualityScore = image.qualityScore
            self.capturedAt = image.capturedAt
            self.associatedFeature = image.associatedFeature
            self.cloudUrl = cloudUrl
        }
    }

    public var images: [ImageMetadata]
    public let createdAt: Date
    public var averageQuality: Float

    public init(from collection: RoomImageCollection, urls: [UUID: String] = [:]) {
        self.images = collection.allImages.map { image in
            ImageMetadata(from: image, cloudUrl: urls[image.id])
        }
        self.createdAt = Date()
        self.averageQuality = collection.averageQualityScore
    }

    /// Get the hero image URL
    public var heroUrl: String? {
        images.first { $0.isPrimary }?.cloudUrl
    }

    /// Get all image URLs in display order
    public var orderedUrls: [String] {
        images.sorted { $0.displayOrder < $1.displayOrder }
            .compactMap { $0.cloudUrl }
    }
}

// MARK: - Debug Description

extension RoomImageCollection: CustomDebugStringConvertible {
    public var debugDescription: String {
        """
        RoomImageCollection(
            count: \(count),
            hasHero: \(hasHero),
            featureCount: \(featureImages.count),
            coverageCount: \(coverageImages.count),
            avgQuality: \(String(format: "%.2f", averageQualityScore)),
            dataSize: \(totalDataSize / 1024)KB
        )
        """
    }
}
