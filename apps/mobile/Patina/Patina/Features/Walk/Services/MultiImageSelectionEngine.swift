//
//  MultiImageSelectionEngine.swift
//  Patina
//
//  Engine for selecting diverse, feature-focused images from captured candidates.
//  Implements a two-tier selection approach:
//  1. Feature-anchored images: Captured when significant room features detected
//  2. Coverage-based images: Spatially/temporally diverse high-quality frames
//

import Foundation

/// Engine for selecting diverse, feature-focused images from captured candidates
public actor MultiImageSelectionEngine {

    // MARK: - Configuration

    /// Target number of images to select (hero + supporting)
    private let targetImageCount = 10

    /// Minimum feature-anchored images to include
    private let minFeatureImages = 4

    /// Maximum feature-anchored images to include
    private let maxFeatureImages = 6

    /// Time window (seconds) to search for frames near a feature detection
    private let featureTimeWindow: TimeInterval = 5.0

    /// Priority order for feature categories (rarer/more impactful features first)
    private let featurePriority: [FeatureCategory] = [
        .fireplace,      // Highest - rare and visually impactful
        .largeWindow,    // High - architectural statement
        .bookshelf,      // Medium-high - personality
        .tallCeiling,    // Medium - architectural
        .window,         // Medium - common but important
        .hardwoodFloor,  // Medium-low - detail shot
        .door            // Low - common, less impactful
    ]

    // MARK: - Public Methods

    /// Select diverse images from candidates based on detected features
    /// - Parameters:
    ///   - candidates: All captured frames from the scan
    ///   - detectedFeatures: Features detected during the scan
    ///   - featureTimestamps: When each feature type was first detected
    /// - Returns: A RoomImageCollection with hero + supporting images
    public func selectImages(
        from candidates: [CapturedFrame],
        detectedFeatures: [DetectedFeature],
        featureTimestamps: [FeatureCategory: Date]
    ) async -> RoomImageCollection {

        guard !candidates.isEmpty else {
            return RoomImageCollection()
        }

        var selected: [SelectedImage] = []
        var usedFrameIds: Set<UUID> = []
        var currentOrder = 0

        // Step 1: Select hero frame (best quality)
        if let hero = selectHeroFrame(from: candidates) {
            selected.append(.hero(from: hero))
            usedFrameIds.insert(hero.id)
            currentOrder = 1
        }

        // Step 2: Select feature-anchored images
        let featureImages = selectFeatureImages(
            from: candidates,
            features: detectedFeatures,
            timestamps: featureTimestamps,
            excluding: usedFrameIds,
            startingOrder: currentOrder
        )

        for image in featureImages {
            selected.append(image)
            usedFrameIds.insert(image.frame.id)
        }
        currentOrder = selected.count

        // Step 3: Fill remaining slots with temporally diverse coverage images
        let remainingSlots = targetImageCount - selected.count
        if remainingSlots > 0 {
            let coverageImages = selectCoverageImages(
                from: candidates,
                count: remainingSlots,
                excluding: usedFrameIds,
                startingOrder: currentOrder
            )
            selected.append(contentsOf: coverageImages)
        }

        // Build collection
        return RoomImageCollection(from: selected)
    }

    // MARK: - Hero Frame Selection

    /// Select the best quality frame as the hero
    private func selectHeroFrame(from candidates: [CapturedFrame]) -> CapturedFrame? {
        // Filter to frames that meet quality threshold
        let qualityFrames = candidates.filter { $0.meetsQualityThreshold }

        // If we have quality frames, use the best one
        if let best = qualityFrames.max(by: { $0.totalScore < $1.totalScore }) {
            return best
        }

        // Fallback: best available even if below threshold
        return candidates.max(by: { $0.totalScore < $1.totalScore })
    }

    // MARK: - Feature-Anchored Selection

    /// Select images captured near feature detection times
    private func selectFeatureImages(
        from candidates: [CapturedFrame],
        features: [DetectedFeature],
        timestamps: [FeatureCategory: Date],
        excluding usedIds: Set<UUID>,
        startingOrder: Int
    ) -> [SelectedImage] {

        var featureImages: [SelectedImage] = []
        var usedCategories: Set<FeatureCategory> = []
        var order = startingOrder

        // Iterate through features by priority
        for category in featurePriority {
            guard featureImages.count < maxFeatureImages else { break }
            guard !usedCategories.contains(category) else { continue }
            guard let detectionTime = timestamps[category] else { continue }

            // Find best frame captured within time window of feature detection
            let nearbyFrames = candidates
                .filter { !usedIds.contains($0.id) }
                .filter { abs($0.timestamp.timeIntervalSince(detectionTime)) <= featureTimeWindow }
                .filter { $0.meetsQualityThreshold }
                .sorted { $0.totalScore > $1.totalScore }

            if let bestFrame = nearbyFrames.first,
               let selectedImage = SelectedImage.feature(from: bestFrame, feature: category, order: order) {
                featureImages.append(selectedImage)
                usedCategories.insert(category)
                order += 1
            }
        }

        return featureImages
    }

    // MARK: - Coverage Selection

    /// Select temporally diverse frames for room coverage
    private func selectCoverageImages(
        from candidates: [CapturedFrame],
        count: Int,
        excluding usedIds: Set<UUID>,
        startingOrder: Int
    ) -> [SelectedImage] {

        guard count > 0 else { return [] }

        // Filter to unused, quality frames
        let available = candidates
            .filter { !usedIds.contains($0.id) && $0.meetsQualityThreshold }
            .sorted { $0.timestamp < $1.timestamp }

        guard !available.isEmpty else { return [] }

        // Get time range
        guard let earliest = available.first?.timestamp,
              let latest = available.last?.timestamp else {
            return []
        }

        let duration = latest.timeIntervalSince(earliest)

        // If very short duration or few frames, just take best quality ones
        if duration < 5.0 || available.count <= count {
            return available
                .sorted { $0.totalScore > $1.totalScore }
                .prefix(count)
                .enumerated()
                .map { index, frame in
                    let role: ImageRole = switch index % 3 {
                    case 0: .coverageEarly
                    case 1: .coverageMid
                    default: .coverageLate
                    }
                    return SelectedImage.coverage(
                        from: frame,
                        role: role,
                        order: startingOrder + index
                    )
                }
        }

        // Divide into temporal segments and pick best from each
        let segmentDuration = duration / Double(count)
        var coverageImages: [SelectedImage] = []

        for i in 0..<count {
            let segmentStart = earliest.addingTimeInterval(segmentDuration * Double(i))
            let segmentEnd = earliest.addingTimeInterval(segmentDuration * Double(i + 1))

            // Find frames in this segment
            let segmentFrames = available.filter {
                $0.timestamp >= segmentStart && $0.timestamp < segmentEnd
            }

            // Take the best quality frame from this segment
            if let best = segmentFrames.max(by: { $0.totalScore < $1.totalScore }) {
                let role: ImageRole
                let progress = Double(i) / Double(count)
                if progress < 0.33 {
                    role = .coverageEarly
                } else if progress < 0.66 {
                    role = .coverageMid
                } else {
                    role = .coverageLate
                }

                coverageImages.append(SelectedImage.coverage(
                    from: best,
                    role: role,
                    order: startingOrder + i
                ))
            }
        }

        // If we didn't get enough from segments, fill with best remaining
        if coverageImages.count < count {
            let usedInCoverage = Set(coverageImages.map { $0.frame.id })
            let remaining = available
                .filter { !usedInCoverage.contains($0.id) }
                .sorted { $0.totalScore > $1.totalScore }
                .prefix(count - coverageImages.count)

            for (index, frame) in remaining.enumerated() {
                coverageImages.append(SelectedImage.coverage(
                    from: frame,
                    role: .supplemental,
                    order: startingOrder + coverageImages.count + index
                ))
            }
        }

        return coverageImages
    }
}

// MARK: - Selection Statistics

extension MultiImageSelectionEngine {
    /// Statistics about the selection process
    public struct SelectionStats {
        public let totalCandidates: Int
        public let qualityCandidates: Int
        public let selectedCount: Int
        public let heroScore: Float?
        public let featureCount: Int
        public let coverageCount: Int
        public let featuresFound: [FeatureCategory]
    }

    /// Get statistics about a selection
    public func getStats(for collection: RoomImageCollection, from candidates: [CapturedFrame]) -> SelectionStats {
        SelectionStats(
            totalCandidates: candidates.count,
            qualityCandidates: candidates.filter { $0.meetsQualityThreshold }.count,
            selectedCount: collection.count,
            heroScore: collection.heroImage?.qualityScore,
            featureCount: collection.featureImages.count,
            coverageCount: collection.coverageImages.count,
            featuresFound: collection.capturedFeatures
        )
    }
}
