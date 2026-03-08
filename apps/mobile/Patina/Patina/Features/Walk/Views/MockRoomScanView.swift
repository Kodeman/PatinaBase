//
//  MockRoomScanView.swift
//  Patina
//
//  Mock room scanning view for simulator testing.
//  Simulates feature detection and progress when LiDAR is not available.
//

import SwiftUI

/// Mock scanning view for simulator testing
struct MockRoomScanView: View {
    @ObservedObject var captureService: RoomCaptureService
    @ObservedObject var narrationService: WalkNarrationService

    @State private var scanProgress: CGFloat = 0
    @State private var detectedItems: [MockDetectedItem] = []
    @State private var showingGrid = true
    @State private var pulseScale: CGFloat = 1.0
    @State private var scanLineOffset: CGFloat = 0

    // Timer for simulated scanning
    @State private var scanTimer: Timer?

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Simulated camera background
                simulatedCameraBackground

                // Scanning overlay grid
                if showingGrid {
                    scanningGrid(size: geometry.size)
                }

                // Scanning line animation
                scanningLine(height: geometry.size.height)

                // Detected features visualization
                ForEach(detectedItems) { item in
                    detectedItemView(item: item, in: geometry.size)
                }

                // Center scanning indicator
                scanningIndicator
            }
        }
        .onAppear {
            startMockScanning()
        }
        .onDisappear {
            stopMockScanning()
        }
    }

    // MARK: - Subviews

    private var simulatedCameraBackground: some View {
        ZStack {
            // Base gradient simulating a room
            LinearGradient(
                colors: [
                    Color(white: 0.15),
                    Color(white: 0.1),
                    Color(white: 0.08)
                ],
                startPoint: .top,
                endPoint: .bottom
            )

            // Subtle room texture
            GeometryReader { geo in
                Path { path in
                    // Simulate floor perspective
                    path.move(to: CGPoint(x: 0, y: geo.size.height * 0.6))
                    path.addLine(to: CGPoint(x: geo.size.width, y: geo.size.height * 0.6))

                    // Simulate wall corners
                    path.move(to: CGPoint(x: geo.size.width * 0.1, y: 0))
                    path.addLine(to: CGPoint(x: 0, y: geo.size.height * 0.6))

                    path.move(to: CGPoint(x: geo.size.width * 0.9, y: 0))
                    path.addLine(to: CGPoint(x: geo.size.width, y: geo.size.height * 0.6))
                }
                .stroke(Color.white.opacity(0.1), lineWidth: 1)
            }

            // Simulated window glow
            Circle()
                .fill(
                    RadialGradient(
                        colors: [Color.white.opacity(0.15), Color.clear],
                        center: .center,
                        startRadius: 0,
                        endRadius: 150
                    )
                )
                .frame(width: 300, height: 300)
                .offset(x: 80, y: -100)
        }
        .ignoresSafeArea()
    }

    private func scanningGrid(size: CGSize) -> some View {
        Canvas { context, canvasSize in
            let gridSpacing: CGFloat = 40

            // Draw vertical lines
            for x in stride(from: 0, to: canvasSize.width, by: gridSpacing) {
                var path = Path()
                path.move(to: CGPoint(x: x, y: 0))
                path.addLine(to: CGPoint(x: x, y: canvasSize.height))
                context.stroke(path, with: .color(PatinaColors.clayBeige.opacity(0.15)), lineWidth: 0.5)
            }

            // Draw horizontal lines
            for y in stride(from: 0, to: canvasSize.height, by: gridSpacing) {
                var path = Path()
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: canvasSize.width, y: y))
                context.stroke(path, with: .color(PatinaColors.clayBeige.opacity(0.15)), lineWidth: 0.5)
            }
        }
        .opacity(0.5)
    }

    private func scanningLine(height: CGFloat) -> some View {
        Rectangle()
            .fill(
                LinearGradient(
                    colors: [
                        Color.clear,
                        PatinaColors.clayBeige.opacity(0.5),
                        PatinaColors.clayBeige,
                        PatinaColors.clayBeige.opacity(0.5),
                        Color.clear
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .frame(height: 2)
            .offset(y: scanLineOffset - height / 2)
            .onAppear {
                withAnimation(.linear(duration: 3).repeatForever(autoreverses: false)) {
                    scanLineOffset = height
                }
            }
    }

    private func detectedItemView(item: MockDetectedItem, in size: CGSize) -> some View {
        let position = CGPoint(
            x: item.relativeX * size.width,
            y: item.relativeY * size.height
        )

        return ZStack {
            // Detection box
            RoundedRectangle(cornerRadius: 4)
                .stroke(item.color, lineWidth: 2)
                .frame(width: item.width, height: item.height)

            // Label
            Text(item.label)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(item.color)
                .padding(.horizontal, 4)
                .padding(.vertical, 2)
                .background(Color.black.opacity(0.6))
                .cornerRadius(2)
                .offset(y: -(item.height / 2 + 12))
        }
        .position(position)
        .transition(.scale.combined(with: .opacity))
    }

    private var scanningIndicator: some View {
        VStack(spacing: PatinaSpacing.sm) {
            // Pulsing ring
            ZStack {
                Circle()
                    .stroke(PatinaColors.clayBeige.opacity(0.3), lineWidth: 2)
                    .frame(width: 80, height: 80)

                Circle()
                    .stroke(PatinaColors.clayBeige, lineWidth: 2)
                    .frame(width: 80, height: 80)
                    .scaleEffect(pulseScale)
                    .opacity(2 - pulseScale)

                Image(systemName: "viewfinder")
                    .font(.system(size: 24))
                    .foregroundColor(PatinaColors.clayBeige)
            }
            .onAppear {
                withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: false)) {
                    pulseScale = 2.0
                }
            }

            // Progress text
            Text("Scanning... \(Int(scanProgress * 100))%")
                .font(PatinaTypography.caption)
                .foregroundColor(PatinaColors.offWhite.opacity(0.7))

            // Simulator notice
            Text("(Simulator Mode)")
                .font(.system(size: 10))
                .foregroundColor(PatinaColors.clayBeige.opacity(0.5))
        }
    }

    // MARK: - Mock Scanning Logic

    /// Speed multiplier for UI testing (20x faster)
    private var progressIncrement: CGFloat {
        PatinaApp.isUITesting ? 0.1 : 0.005
    }

    private func startMockScanning() {
        scanProgress = 0
        detectedItems = []

        // Simulate scanning progress and feature detection
        scanTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
            Task { @MainActor in
                // Update progress (faster in UI testing mode)
                if scanProgress < 1.0 {
                    scanProgress += progressIncrement
                    captureService.onProgressUpdate?(Float(scanProgress))
                }

                // Detect features at certain progress points
                detectFeaturesAtProgress()

                // Complete scan at 100%
                if scanProgress >= 1.0 {
                    completeMockScan()
                }
            }
        }
    }

    private func stopMockScanning() {
        scanTimer?.invalidate()
        scanTimer = nil
    }

    private func detectFeaturesAtProgress() {
        // Detect window at 15%
        if scanProgress >= 0.15 && scanProgress < 0.16 {
            let feature = DetectedFeature(category: .largeWindow, confidence: 0.95)
            captureService.onFeatureDetected?(feature)
            withAnimation(.spring()) {
                detectedItems.append(MockDetectedItem(
                    label: "Window",
                    relativeX: 0.7,
                    relativeY: 0.3,
                    width: 100,
                    height: 80,
                    color: .cyan
                ))
            }
        }

        // Detect high ceiling at 35%
        if scanProgress >= 0.35 && scanProgress < 0.36 {
            let feature = DetectedFeature(category: .tallCeiling, confidence: 0.9, value: 3.2)
            captureService.onFeatureDetected?(feature)
        }

        // Detect seating area at 55%
        if scanProgress >= 0.55 && scanProgress < 0.56 {
            let feature = DetectedFeature(category: .seatingArea, confidence: 0.85)
            captureService.onFeatureDetected?(feature)
            withAnimation(.spring()) {
                detectedItems.append(MockDetectedItem(
                    label: "Seating",
                    relativeX: 0.4,
                    relativeY: 0.7,
                    width: 120,
                    height: 60,
                    color: .green
                ))
            }
        }

        // Detect open area at 75%
        if scanProgress >= 0.75 && scanProgress < 0.76 {
            let feature = DetectedFeature(category: .openArea, confidence: 0.88, value: 28.5)
            captureService.onFeatureDetected?(feature)
            withAnimation(.spring()) {
                detectedItems.append(MockDetectedItem(
                    label: "Open Area",
                    relativeX: 0.5,
                    relativeY: 0.5,
                    width: 200,
                    height: 150,
                    color: .orange.opacity(0.7)
                ))
            }
        }
    }

    private func completeMockScan() {
        stopMockScanning()

        // Create mock room data
        let mockRoomData = FirstWalkRoomData(
            roomName: "Living Room",
            dimensions: WalkRoomDimensions(width: 5.5, length: 4.2, height: 3.2),
            detectedFeatures: [
                DetectedFeature(category: .largeWindow, confidence: 0.95),
                DetectedFeature(category: .tallCeiling, confidence: 0.9, value: 3.2),
                DetectedFeature(category: .seatingArea, confidence: 0.85),
                DetectedFeature(category: .openArea, confidence: 0.88, value: 28.5)
            ],
            scanDuration: 20.0,
            coveragePercentage: 0.92
        )

        // Notify completion (using a mock CapturedRoom is complex, so we'll trigger via different mechanism)
        // The captureService.onScanComplete expects CapturedRoom, but we'll set the processed data directly

        // For simulator, we need to manually complete the walk
        NotificationCenter.default.post(
            name: .mockScanCompleted,
            object: nil,
            userInfo: ["roomData": mockRoomData]
        )
    }
}

// MARK: - Supporting Types

struct MockDetectedItem: Identifiable {
    let id = UUID()
    let label: String
    let relativeX: CGFloat
    let relativeY: CGFloat
    let width: CGFloat
    let height: CGFloat
    let color: Color
}

extension Notification.Name {
    static let mockScanCompleted = Notification.Name("mockScanCompleted")
}

// MARK: - Preview

#Preview {
    MockRoomScanView(
        captureService: RoomCaptureService(),
        narrationService: WalkNarrationService()
    )
}
