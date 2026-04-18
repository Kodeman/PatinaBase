//
//  FloorPlanPreviewView.swift
//  Patina
//
//  Post-scan floor plan preview with room outline, dimensions,
//  detected items, confidence badge, and Rescan/Use actions
//

import SwiftUI

struct FloorPlanPreviewView: View {
    let roomData: FirstWalkRoomData
    var onRescan: () -> Void
    var onUseScan: () -> Void

    private var dimensions: WalkRoomDimensions { roomData.dimensions }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            VStack(alignment: .leading, spacing: 4) {
                Text("Your Room")
                    .font(PatinaTypography.h3)
                    .foregroundColor(PatinaColors.charcoal)

                MonoLabel(text: "\(roomData.roomName.uppercased()) · \(confidenceLabel)")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 56)
            .padding(.horizontal, 24)
            .padding(.bottom, 12)

            // Floor plan view
            ZStack {
                PatinaColors.softCream

                // Room outline
                ZStack {
                    // Room shape
                    RoundedRectangle(cornerRadius: 3)
                        .stroke(PatinaColors.mocha, lineWidth: 2)
                        .frame(
                            width: roomWidth,
                            height: roomHeight
                        )

                    // Detected features as small indicators
                    ForEach(roomData.detectedFeatures.prefix(6)) { feature in
                        featureIndicator(feature)
                            .offset(featureOffset(for: feature))
                    }

                    // Dimension labels
                    // Width label (bottom)
                    Text(String(format: "%.1fm", dimensions.width))
                        .font(PatinaTypography.monoTiny)
                        .foregroundColor(PatinaColors.agedOak)
                        .offset(y: roomHeight / 2 + 14)

                    // Length label (right)
                    Text(String(format: "%.1fm", dimensions.length))
                        .font(PatinaTypography.monoTiny)
                        .foregroundColor(PatinaColors.agedOak)
                        .offset(x: roomWidth / 2 + 20)
                }

                // Confidence badge
                VStack {
                    HStack {
                        Spacer()
                        confidenceBadge
                            .padding(12)
                    }
                    Spacer()
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .padding(.horizontal, 24)
            .frame(maxHeight: .infinity)

            // Metrics row
            HStack(spacing: 12) {
                metricCard(value: String(format: "%.0f", dimensions.areaInSquareFeet), label: "Sq Ft")
                metricCard(value: "\(roomData.windowCount)", label: "Windows")
                metricCard(value: "\(roomData.detectedFeatures.count)", label: "Items")
            }
            .padding(.horizontal, 24)
            .padding(.top, 14)

            // Action buttons
            HStack(spacing: 12) {
                Button(action: onRescan) {
                    Text("Rescan")
                        .font(PatinaTypography.uiAction)
                        .foregroundColor(PatinaColors.charcoal)
                        .frame(maxWidth: .infinity)
                        .frame(height: 48)
                        .background(PatinaColors.softCream)
                        .clipShape(Capsule())
                }

                Button(action: onUseScan) {
                    Text("Use This Scan")
                        .font(PatinaTypography.uiAction)
                        .foregroundColor(PatinaColors.offWhite)
                        .frame(maxWidth: .infinity)
                        .frame(height: 48)
                        .background(PatinaColors.charcoal)
                        .clipShape(Capsule())
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 12)
            .padding(.bottom, 100) // Companion space
        }
        .background(PatinaColors.offWhite)
        .navigationBarHidden(true)
    }

    // MARK: - Confidence

    private var confidenceLabel: String {
        let pct = roomData.coveragePercentage
        if pct >= 0.8 { return "HIGH CONFIDENCE" }
        if pct >= 0.5 { return "GOOD CONFIDENCE" }
        return "PARTIAL SCAN"
    }

    private var confidenceBadge: some View {
        let pct = roomData.coveragePercentage
        let color: Color = pct >= 0.8 ? PatinaColors.success :
                           pct >= 0.5 ? PatinaColors.clay : PatinaColors.terracotta

        return Text("✓ \(confidenceLabel)")
            .font(PatinaTypography.monoTiny)
            .foregroundColor(.white)
            .tracking(0.5)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(color)
            .clipShape(Capsule())
    }

    // MARK: - Room Sizing

    private var roomWidth: CGFloat {
        let maxWidth: CGFloat = 200
        let ratio = CGFloat(dimensions.width) / max(CGFloat(dimensions.length), 1)
        return min(maxWidth, maxWidth * ratio)
    }

    private var roomHeight: CGFloat {
        let maxHeight: CGFloat = 160
        let ratio = CGFloat(dimensions.length) / max(CGFloat(dimensions.width), 1)
        return min(maxHeight, maxHeight * ratio)
    }

    // MARK: - Feature Indicators

    private func featureIndicator(_ feature: DetectedFeature) -> some View {
        Group {
            switch feature.category {
            case .window, .largeWindow:
                Rectangle()
                    .fill(PatinaColors.dustyBlue.opacity(0.4))
                    .frame(width: 20, height: 6)
            case .door:
                Rectangle()
                    .fill(PatinaColors.agedOak.opacity(0.3))
                    .frame(width: 14, height: 4)
            case .fireplace:
                Rectangle()
                    .fill(PatinaColors.terracotta.opacity(0.4))
                    .frame(width: 18, height: 8)
            default:
                Circle()
                    .fill(PatinaColors.clay.opacity(0.3))
                    .frame(width: 8, height: 8)
            }
        }
    }

    private func featureOffset(for feature: DetectedFeature) -> CGSize {
        // Distribute features around the room perimeter
        let index = roomData.detectedFeatures.firstIndex(where: { $0.id == feature.id }) ?? 0
        let angle = Double(index) * (2.0 * .pi / Double(max(roomData.detectedFeatures.count, 1)))
        let radius = Double(min(roomWidth, roomHeight) / 2.5)
        return CGSize(
            width: Foundation.cos(angle) * radius,
            height: Foundation.sin(angle) * radius
        )
    }

    // MARK: - Metric Card

    private func metricCard(value: String, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(PatinaTypography.h5)
                .foregroundColor(PatinaColors.charcoal)

            Text(label.uppercased())
                .font(PatinaTypography.monoTiny)
                .foregroundColor(PatinaColors.agedOak)
                .tracking(0.5)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(PatinaColors.softCream)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

#Preview {
    FloorPlanPreviewView(
        roomData: FirstWalkRoomData(
            dimensions: .standard,
            detectedFeatures: [
                DetectedFeature(category: .window),
                DetectedFeature(category: .window),
                DetectedFeature(category: .door),
                DetectedFeature(category: .seatingArea),
            ],
            scanDuration: 45,
            coveragePercentage: 0.88
        ),
        onRescan: {},
        onUseScan: {}
    )
}
