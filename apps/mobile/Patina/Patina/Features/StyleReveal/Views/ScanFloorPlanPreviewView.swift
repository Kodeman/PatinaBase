//
//  ScanFloorPlanPreviewView.swift
//  Patina
//
//  Screen 17: Floor Plan Preview. Validates scan accuracy before the
//  user continues into recommendations.
//  Per PRD §4.9.
//
//  Named with the `Scan` prefix to avoid clashing with the existing
//  Features/Walk/Views/FloorPlanPreviewView.swift.
//

import SwiftUI

struct ScanFloorPlanPreviewView: View {

    let session: RoomScanSession
    let onAccept: () -> Void
    let onRescan: () -> Void

    @Namespace private var whisperNamespace

    var body: some View {
        ZStack {
            PatinaColors.offWhite.ignoresSafeArea()

            VStack(spacing: 0) {
                ConversationHeaderView(
                    whisperTop: "Your space",
                    question: "Here's what I see.",
                    whisperGeometryNamespace: whisperNamespace
                )
                .padding(.bottom, 24)

                floorPlanCanvas
                    .padding(.horizontal, 32)
                    .padding(.vertical, 16)

                statsRow
                    .padding(.horizontal, 24)
                    .padding(.vertical, 20)

                Spacer()

                HStack(spacing: 12) {
                    Button(action: onRescan) {
                        Text("Rescan")
                            .font(PatinaTypography.uiAction)
                            .foregroundStyle(PatinaColors.charcoal)
                            .padding(.horizontal, 28)
                            .frame(height: 52)
                            .background(
                                RoundedRectangle(cornerRadius: 26)
                                    .stroke(PatinaColors.charcoal, lineWidth: 1.5)
                            )
                    }
                    .buttonStyle(.plain)

                    Button(action: onAccept) {
                        Text("This Looks Right")
                            .font(PatinaTypography.uiAction)
                            .foregroundStyle(PatinaColors.offWhite)
                            .frame(maxWidth: .infinity)
                            .frame(height: 52)
                            .background(RoundedRectangle(cornerRadius: 26).fill(PatinaColors.charcoal))
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 42)
            }
        }
        .onAppear {
            ScanAnalytics.shared.track(.floorplanDisplayed)
        }
    }

    // MARK: - Canvas

    private var floorPlanCanvas: some View {
        GeometryReader { geo in
            let width = geo.size.width
            let height = geo.size.height
            let aspect = max(CGFloat(session.dimensions.width / max(session.dimensions.length, 0.1)), 0.4)
            let drawWidth = min(width, height * aspect)
            let drawHeight = drawWidth / aspect

            ZStack {
                RoundedRectangle(cornerRadius: 4)
                    .stroke(PatinaColors.charcoal, lineWidth: 2)
                    .frame(width: drawWidth, height: drawHeight)

                dimensionLabels(width: drawWidth, height: drawHeight)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(height: 240)
    }

    private func dimensionLabels(width: CGFloat, height: CGFloat) -> some View {
        let widthFt = metersToFeet(session.dimensions.width)
        let lengthFt = metersToFeet(session.dimensions.length)

        return ZStack {
            Text(String(format: "%.0f ft", widthFt))
                .font(.custom("DMMono-Regular", size: 11))
                .foregroundStyle(PatinaColors.clay)
                .offset(y: -(height / 2) - 16)

            Text(String(format: "%.0f ft", lengthFt))
                .font(.custom("DMMono-Regular", size: 11))
                .foregroundStyle(PatinaColors.clay)
                .rotationEffect(.degrees(-90))
                .offset(x: -(width / 2) - 16)
        }
    }

    // MARK: - Stats

    private var statsRow: some View {
        let sqft = metersSquaredToFeet(session.dimensions.area)
        return HStack(spacing: 0) {
            stat(value: String(format: "%.0f", sqft), label: "Square Feet")
            divider
            stat(value: "\(session.features.windowCount)", label: "Windows")
            divider
            stat(value: "\(session.detectedObjects.count)", label: "Items Detected")
        }
    }

    private func stat(value: String, label: String) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(PatinaTypography.headlineSerif)
                .foregroundStyle(PatinaColors.charcoal)
            Text(label)
                .font(PatinaTypography.monoSmall)
                .tracking(0.5)
                .textCase(.uppercase)
                .foregroundStyle(PatinaColors.clay)
        }
        .frame(maxWidth: .infinity)
    }

    private var divider: some View {
        Rectangle()
            .fill(PatinaColors.pearl)
            .frame(width: 1, height: 36)
    }

    // MARK: - Conversions

    private func metersToFeet(_ m: Float) -> Float {
        m * 3.28084
    }

    private func metersSquaredToFeet(_ m2: Float) -> Float {
        m2 * 10.7639
    }
}
