# Patina iOS — RoomPlan Implementation Specification

> **Document:** Technical Specification  
> **Feature:** The Walk (Room Scanning)  
> **Version:** 1.0.0  
> **Status:** Implementation Ready  
> **Last Updated:** January 2026

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [RoomPlan Framework Overview](#2-roomplan-framework-overview)
3. [Architecture & Integration](#3-architecture--integration)
4. [Session Lifecycle](#4-session-lifecycle)
5. [Progress Indication System](#5-progress-indication-system)
6. [Coaching & Guidance System](#6-coaching--guidance-system)
7. [Scan Quality Optimization](#7-scan-quality-optimization)
8. [Completion Detection](#8-completion-detection)
9. [Data Capture & Processing](#9-data-capture--processing)
10. [Supabase Integration](#10-supabase-integration)
11. [Error Handling & Recovery](#11-error-handling--recovery)
12. [Performance Optimization](#12-performance-optimization)
13. [Testing Strategy](#13-testing-strategy)
14. [Implementation Checklist](#14-implementation-checklist)

---

## 1. Executive Summary

### 1.1 Purpose

The Walk is Patina's room scanning experience built on Apple's RoomPlan framework. It transforms a technical scanning process into a meditative, companion-guided journey through the user's space.

### 1.2 Key Objectives

| Objective | Success Metric |
|-----------|----------------|
| High-quality room capture | >90% feature detection accuracy |
| Natural user experience | <3 guidance prompts per scan |
| Reliable completion | >95% scans complete successfully |
| Fast processing | <5s from scan end to data ready |
| Seamless sync | 100% successful Supabase uploads |

### 1.3 Framework Requirements

- **iOS Version:** 16.0+ (RoomPlan availability)
- **Device:** iPhone 12 Pro+ or iPad Pro 2020+ (LiDAR required)
- **Frameworks:** RoomPlan, ARKit, RealityKit, Combine

### 1.4 LiDAR Requirement Strategy

```swift
// Check device capability at app launch
static var isRoomPlanSupported: Bool {
    RoomCaptureSession.isSupported
}

// Graceful degradation for non-LiDAR devices
if !RoomCaptureManager.isRoomPlanSupported {
    // Offer manual room input or photo-based estimation
    showAlternativeRoomCapture()
}
```

---

## 2. RoomPlan Framework Overview

### 2.1 Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    RoomPlan Framework                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐    ┌─────────────────────────────┐    │
│  │RoomCaptureSession│    │     RoomCaptureView         │    │
│  │                 │    │  (Optional - we use custom) │    │
│  │ • Manages scan  │    │                             │    │
│  │ • Provides data │    │  • AR visualization         │    │
│  │ • Sends events  │    │  • Real-time feedback       │    │
│  └────────┬────────┘    └─────────────────────────────┘    │
│           │                                                 │
│           ▼                                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              CapturedRoom                            │   │
│  │                                                      │   │
│  │  • walls: [CapturedRoom.Surface]                    │   │
│  │  • doors: [CapturedRoom.Surface]                    │   │
│  │  • windows: [CapturedRoom.Surface]                  │   │
│  │  • openings: [CapturedRoom.Surface]                 │   │
│  │  • floors: [CapturedRoom.Surface]                   │   │
│  │  • objects: [CapturedRoom.Object]                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Data Structures

```swift
// CapturedRoom.Surface - Walls, Floors, Doors, Windows
struct Surface {
    let category: Category  // .wall, .door, .window, .opening, .floor
    let dimensions: simd_float3  // width, height, depth
    let transform: simd_float4x4  // position and orientation
    let identifier: UUID
    let completedEdges: Set<Edge>  // which edges are fully scanned
    let curve: Curve?  // for curved surfaces
}

// CapturedRoom.Object - Detected furniture/fixtures
struct Object {
    let category: Category  // .storage, .bed, .sofa, .table, etc.
    let dimensions: simd_float3
    let transform: simd_float4x4
    let identifier: UUID
    let confidence: Confidence  // .low, .medium, .high
}

// Object categories we care about for Patina
enum RelevantObjectCategory {
    case storage      // shelving, cabinets
    case bed
    case sofa
    case table
    case chair
    case fireplace
    case television
    case bathtub
    case toilet
    case sink
    case refrigerator
    case stove
    case washerDryer
}
```

### 2.3 Delegate Protocol

```swift
protocol RoomCaptureSessionDelegate: AnyObject {
    // Called when capture session provides updated room data
    func captureSession(
        _ session: RoomCaptureSession,
        didUpdate room: CapturedRoom
    )
    
    // Called when capture session adds new room data
    func captureSession(
        _ session: RoomCaptureSession,
        didAdd room: CapturedRoom
    )
    
    // Called when capture session removes room data
    func captureSession(
        _ session: RoomCaptureSession,
        didRemove room: CapturedRoom
    )
    
    // Called when capture session changes state
    func captureSession(
        _ session: RoomCaptureSession,
        didChange state: RoomCaptureSession.CaptureState
    )
    
    // Called when capture session starts
    func captureSession(
        _ session: RoomCaptureSession,
        didStartWith configuration: RoomCaptureSession.Configuration
    )
    
    // Called when capture session ends
    func captureSession(
        _ session: RoomCaptureSession,
        didEndWith data: CapturedRoomData,
        error: Error?
    )
    
    // Called to provide instruction guidance
    func captureSession(
        _ session: RoomCaptureSession,
        didProvide instruction: RoomCaptureSession.Instruction
    )
}
```

---

## 3. Architecture & Integration

### 3.1 Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         WalkView                                 │
│  (SwiftUI)                                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  WalkViewModel                            │  │
│  │  @Observable                                              │  │
│  │                                                           │  │
│  │  • scanState: ScanState                                   │  │
│  │  • progress: ScanProgress                                 │  │
│  │  • currentInstruction: Instruction?                       │  │
│  │  • detectedFeatures: [DetectedFeature]                    │  │
│  │  • narrativeQueue: [NarrativeEvent]                       │  │
│  │  • styleSignals: StyleSignals                             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │               RoomCaptureManager                          │  │
│  │  (Actor - thread-safe)                                    │  │
│  │                                                           │  │
│  │  • session: RoomCaptureSession                            │  │
│  │  • currentRoom: CapturedRoom?                             │  │
│  │  • captureQuality: CaptureQuality                         │  │
│  │  • coverageAnalyzer: CoverageAnalyzer                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                Supporting Services                        │  │
│  │                                                           │  │
│  │  • NarrationService     - Companion dialogue              │  │
│  │  • CoachingService      - User guidance                   │  │
│  │  • FeatureAnalyzer      - Style signal extraction         │  │
│  │  • RoomDataProcessor    - Post-capture processing         │  │
│  │  • SupabaseSync         - Cloud upload                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 File Structure

```
Patina/
├── Features/
│   └── Walk/
│       ├── Views/
│       │   ├── WalkView.swift              # Main SwiftUI view
│       │   ├── WalkARView.swift            # ARView wrapper
│       │   ├── WalkProgressView.swift      # Progress indicator
│       │   ├── WalkNarrationOverlay.swift  # Companion text
│       │   ├── WalkCoachingOverlay.swift   # Guidance prompts
│       │   └── WalkCompletionView.swift    # Completion celebration
│       │
│       ├── ViewModels/
│       │   └── WalkViewModel.swift         # View state management
│       │
│       ├── Models/
│       │   ├── ScanState.swift             # State machine
│       │   ├── ScanProgress.swift          # Progress model
│       │   ├── DetectedFeature.swift       # Feature abstraction
│       │   ├── NarrativeEvent.swift        # Narration model
│       │   └── WalkStyleSignals.swift      # Style extraction
│       │
│       ├── Managers/
│       │   ├── RoomCaptureManager.swift    # RoomPlan wrapper
│       │   ├── CoverageAnalyzer.swift      # Coverage calculation
│       │   └── QualityMonitor.swift        # Quality tracking
│       │
│       └── Services/
│           ├── NarrationService.swift      # Dialogue generation
│           ├── CoachingService.swift       # Guidance logic
│           └── FeatureAnalyzer.swift       # Feature → Style
│
├── Services/
│   └── RoomData/
│       ├── RoomDataProcessor.swift         # Post-processing
│       ├── RoomDataExporter.swift          # USDZ/JSON export
│       └── RoomSupabaseSync.swift          # Cloud sync
│
└── Core/
    └── Models/
        ├── Room.swift                      # Persisted room model
        └── RoomScan.swift                  # Scan result model
```

### 3.3 State Machine

```swift
enum ScanState: Equatable {
    case initializing           // Setting up AR session
    case ready                  // Ready to begin
    case scanning(phase: ScanPhase)  // Active scanning
    case processing             // Post-scan processing
    case complete(RoomScanResult)    // Successfully completed
    case failed(ScanError)      // Error occurred
    case paused                 // User paused
    case cancelled              // User cancelled
}

enum ScanPhase: Equatable {
    case starting               // First few seconds
    case capturing              // Main capture phase
    case refining               // High-quality refinement
    case finishing              // Final touches
}

enum ScanError: Error, Equatable {
    case deviceNotSupported
    case cameraPermissionDenied
    case trackingFailed
    case insufficientLight
    case insufficientSpace
    case sessionInterrupted
    case processingFailed
    case unknown(String)
}
```

---

## 4. Session Lifecycle

### 4.1 Initialization

```swift
actor RoomCaptureManager {
    private var session: RoomCaptureSession?
    private var currentRoom: CapturedRoom?
    private let coverageAnalyzer = CoverageAnalyzer()
    private let qualityMonitor = QualityMonitor()
    
    // Published state for UI binding
    @MainActor @Published private(set) var state: ScanState = .initializing
    @MainActor @Published private(set) var progress: ScanProgress = .zero
    @MainActor @Published private(set) var currentInstruction: RoomCaptureSession.Instruction?
    
    func initialize() async throws {
        // 1. Verify device support
        guard RoomCaptureSession.isSupported else {
            throw ScanError.deviceNotSupported
        }
        
        // 2. Create session
        session = RoomCaptureSession()
        
        // 3. Set delegate
        session?.delegate = self
        
        // 4. Update state
        await MainActor.run {
            state = .ready
        }
    }
    
    func startCapture() async throws {
        guard let session = session else {
            throw ScanError.unknown("Session not initialized")
        }
        
        // Configure for highest quality
        let configuration = RoomCaptureSession.Configuration()
        configuration.isCoachingEnabled = false  // We provide custom coaching
        
        // Start the session
        session.run(configuration: configuration)
        
        await MainActor.run {
            state = .scanning(phase: .starting)
        }
    }
}
```

### 4.2 Active Scanning

```swift
extension RoomCaptureManager: RoomCaptureSessionDelegate {
    
    nonisolated func captureSession(
        _ session: RoomCaptureSession,
        didUpdate room: CapturedRoom
    ) {
        Task { @MainActor in
            // Store current room state
            self.currentRoom = room
            
            // Analyze coverage
            let coverage = await coverageAnalyzer.analyze(room)
            
            // Update progress
            self.progress = ScanProgress(
                coverage: coverage,
                wallsDetected: room.walls.count,
                doorsDetected: room.doors.count,
                windowsDetected: room.windows.count,
                objectsDetected: room.objects.count
            )
            
            // Update scan phase based on progress
            updateScanPhase(coverage: coverage)
            
            // Check quality metrics
            await qualityMonitor.evaluate(room)
        }
    }
    
    nonisolated func captureSession(
        _ session: RoomCaptureSession,
        didProvide instruction: RoomCaptureSession.Instruction
    ) {
        Task { @MainActor in
            self.currentInstruction = instruction
        }
    }
    
    private func updateScanPhase(coverage: Float) {
        switch coverage {
        case 0..<0.15:
            state = .scanning(phase: .starting)
        case 0.15..<0.70:
            state = .scanning(phase: .capturing)
        case 0.70..<0.90:
            state = .scanning(phase: .refining)
        case 0.90...:
            state = .scanning(phase: .finishing)
        default:
            break
        }
    }
}
```

### 4.3 Stopping & Processing

```swift
extension RoomCaptureManager {
    
    func stopCapture() async -> RoomScanResult? {
        guard let session = session else { return nil }
        
        await MainActor.run {
            state = .processing
        }
        
        do {
            // Stop session and get final room data
            let finalRoom = try await session.stop()
            
            // Process the captured data
            let processedRoom = await processRoom(finalRoom)
            
            // Create result
            let result = RoomScanResult(
                id: UUID(),
                capturedRoom: finalRoom,
                processedData: processedRoom,
                quality: await qualityMonitor.finalQuality,
                capturedAt: Date()
            )
            
            await MainActor.run {
                state = .complete(result)
            }
            
            return result
            
        } catch {
            await MainActor.run {
                state = .failed(.processingFailed)
            }
            return nil
        }
    }
    
    private func processRoom(_ room: CapturedRoom) async -> ProcessedRoomData {
        // Extract all surfaces
        let surfaces = extractSurfaces(from: room)
        
        // Calculate room dimensions
        let dimensions = calculateDimensions(from: room)
        
        // Identify key features for style analysis
        let features = extractFeatures(from: room)
        
        // Generate floor plan
        let floorPlan = generateFloorPlan(from: room)
        
        return ProcessedRoomData(
            surfaces: surfaces,
            dimensions: dimensions,
            features: features,
            floorPlan: floorPlan
        )
    }
}
```

---

## 5. Progress Indication System

### 5.1 Philosophy

> **No percentages. No progress bars. Organic indicators that feel alive.**

Progress is shown through:
1. A filling vessel (like water rising)
2. Companion narration ("We're getting somewhere")
3. Visual richness increasing in AR overlay
4. Subtle haptic pulses at milestones

### 5.2 Progress Model

```swift
struct ScanProgress: Equatable {
    // Core metrics (internal)
    let coveragePercentage: Float      // 0.0 - 1.0
    let wallsDetected: Int
    let doorsDetected: Int
    let windowsDetected: Int
    let objectsDetected: Int
    
    // Derived display state
    var displayPhase: ProgressPhase {
        switch coveragePercentage {
        case 0..<0.15: return .beginning
        case 0.15..<0.40: return .exploring
        case 0.40..<0.70: return .developing
        case 0.70..<0.90: return .refining
        case 0.90...: return .complete
        default: return .beginning
        }
    }
    
    // For the organic fill indicator
    var fillLevel: Float {
        // Non-linear mapping for better feel
        // Starts slow, speeds up in middle, slows at end
        let x = coveragePercentage
        return 3 * pow(x, 2) - 2 * pow(x, 3)  // Smoothstep
    }
    
    static let zero = ScanProgress(
        coveragePercentage: 0,
        wallsDetected: 0,
        doorsDetected: 0,
        windowsDetected: 0,
        objectsDetected: 0
    )
}

enum ProgressPhase {
    case beginning    // "Let's begin"
    case exploring    // "Good start"
    case developing   // "We're getting somewhere"
    case refining     // "Nearly there"
    case complete     // "I think I have it"
}
```

### 5.3 Progress Indicator View

```swift
struct WalkProgressView: View {
    let progress: ScanProgress
    
    @State private var animatedFill: Float = 0
    
    var body: some View {
        ZStack {
            // Outer ring (background)
            Circle()
                .stroke(
                    PatinaColors.clayBeige.opacity(0.2),
                    lineWidth: 3
                )
                .frame(width: 52, height: 52)
            
            // Fill indicator (rising water effect)
            WaterFillShape(fillLevel: CGFloat(animatedFill))
                .fill(
                    LinearGradient(
                        colors: [
                            PatinaColors.clayBeige.opacity(0.3),
                            PatinaColors.clayBeige.opacity(0.6)
                        ],
                        startPoint: .bottom,
                        endPoint: .top
                    )
                )
                .frame(width: 46, height: 46)
                .clipShape(Circle())
            
            // Completion glow
            if progress.displayPhase == .complete {
                Circle()
                    .stroke(PatinaColors.clayBeige, lineWidth: 2)
                    .frame(width: 52, height: 52)
                    .blur(radius: 4)
                    .opacity(0.8)
            }
        }
        .onChange(of: progress.fillLevel) { _, newValue in
            withAnimation(.easeInOut(duration: 0.5)) {
                animatedFill = newValue
            }
        }
    }
}

// Custom shape for water-like fill
struct WaterFillShape: Shape {
    var fillLevel: CGFloat
    
    var animatableData: CGFloat {
        get { fillLevel }
        set { fillLevel = newValue }
    }
    
    func path(in rect: CGRect) -> Path {
        var path = Path()
        
        let waterHeight = rect.height * fillLevel
        let yOffset = rect.height - waterHeight
        
        // Create wavy top edge
        path.move(to: CGPoint(x: 0, y: rect.height))
        path.addLine(to: CGPoint(x: 0, y: yOffset))
        
        // Subtle wave at water line
        let waveHeight: CGFloat = 2
        let waveCount = 3
        let waveWidth = rect.width / CGFloat(waveCount)
        
        for i in 0..<waveCount {
            let startX = CGFloat(i) * waveWidth
            let midX = startX + waveWidth / 2
            let endX = startX + waveWidth
            
            path.addQuadCurve(
                to: CGPoint(x: endX, y: yOffset),
                control: CGPoint(x: midX, y: yOffset - waveHeight)
            )
        }
        
        path.addLine(to: CGPoint(x: rect.width, y: rect.height))
        path.closeSubpath()
        
        return path
    }
}
```

### 5.4 Haptic Feedback Schedule

```swift
class ProgressHaptics {
    private var lastPhase: ProgressPhase = .beginning
    
    func checkMilestone(_ progress: ScanProgress) {
        guard progress.displayPhase != lastPhase else { return }
        
        switch progress.displayPhase {
        case .beginning:
            break  // No haptic on start
        case .exploring:
            HapticManager.shared.impact(.light)
        case .developing:
            HapticManager.shared.impact(.medium)
        case .refining:
            HapticManager.shared.impact(.medium)
        case .complete:
            HapticManager.shared.notification(.success)
        }
        
        lastPhase = progress.displayPhase
    }
}
```

---

## 6. Coaching & Guidance System

### 6.1 Dual-Layer Guidance

We have two guidance systems working together:

1. **Technical Coaching** — Based on RoomPlan instructions (move closer, more light, etc.)
2. **Companion Narration** — Patina's observational commentary

### 6.2 RoomPlan Instruction Handling

```swift
extension RoomCaptureSession.Instruction {
    /// Convert technical instructions to Patina's voice
    var patinaGuidance: String? {
        switch self {
        case .moveCloseToWall:
            return "Try moving closer to that wall — I want to see it clearly."
        case .moveAwayFromWall:
            return "Step back a bit. I need some distance to take this in."
        case .slowDown:
            return "Slower... I want to really see this."
        case .turnOnLight:
            return "It's a bit dim here. Can we add some light?"
        case .normal:
            return nil  // No guidance needed
        case .lowTexture:
            return "This surface is tricky. Move around it slowly."
        @unknown default:
            return nil
        }
    }
    
    /// Priority level for display
    var priority: GuidancePriority {
        switch self {
        case .turnOnLight: return .high
        case .moveCloseToWall, .moveAwayFromWall: return .medium
        case .slowDown, .lowTexture: return .low
        case .normal: return .none
        @unknown default: return .none
        }
    }
}

enum GuidancePriority {
    case high    // Show immediately, persist longer
    case medium  // Show with normal timing
    case low     // Show briefly if no other guidance
    case none    // Don't show
}
```

### 6.3 Coaching Service

```swift
actor CoachingService {
    private var lastGuidanceTime: Date = .distantPast
    private var currentGuidance: String?
    
    // Minimum time between guidance messages (avoid overwhelming user)
    private let guidanceInterval: TimeInterval = 8.0
    
    // Track what areas need attention
    private var uncoveredAreas: [UncoveredArea] = []
    
    func processInstruction(_ instruction: RoomCaptureSession.Instruction) async -> CoachingEvent? {
        // Check if we should show guidance
        guard instruction.priority != .none else { return nil }
        guard Date().timeIntervalSince(lastGuidanceTime) >= guidanceInterval else {
            // Queue for later if high priority
            if instruction.priority == .high {
                return CoachingEvent(
                    message: instruction.patinaGuidance,
                    priority: .queued,
                    delay: guidanceInterval - Date().timeIntervalSince(lastGuidanceTime)
                )
            }
            return nil
        }
        
        guard let message = instruction.patinaGuidance else { return nil }
        
        lastGuidanceTime = Date()
        currentGuidance = message
        
        return CoachingEvent(
            message: message,
            priority: .immediate,
            delay: 0
        )
    }
    
    func analyzeUncoveredAreas(_ room: CapturedRoom) -> DirectionalGuidance? {
        // Analyze which walls/areas haven't been scanned
        let allSurfaces = room.walls + room.floors
        
        // Find surfaces with incomplete edges
        let incomplete = allSurfaces.filter { surface in
            surface.completedEdges.count < 4
        }
        
        guard !incomplete.isEmpty else { return nil }
        
        // Determine direction to guide user
        let suggestedDirection = calculateDirection(for: incomplete)
        
        return DirectionalGuidance(
            direction: suggestedDirection,
            message: "I haven't seen that side yet. Mind turning \(suggestedDirection.description)?"
        )
    }
}

struct CoachingEvent {
    let message: String?
    let priority: CoachingPriority
    let delay: TimeInterval
}

enum CoachingPriority {
    case immediate
    case queued
}

struct DirectionalGuidance {
    let direction: Direction
    let message: String
    
    enum Direction: CustomStringConvertible {
        case left, right, behind, up, down
        
        var description: String {
            switch self {
            case .left: return "left"
            case .right: return "right"
            case .behind: return "around"
            case .up: return "up"
            case .down: return "down"
            }
        }
    }
}
```

### 6.4 Coaching Overlay View

```swift
struct WalkCoachingOverlay: View {
    let guidance: String?
    let isVisible: Bool
    
    @State private var opacity: Double = 0
    
    var body: some View {
        VStack {
            Spacer()
            
            if let guidance = guidance, isVisible {
                Text(guidance)
                    .font(PatinaTypography.body)
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                    .padding(.vertical, 16)
                    .background(
                        RoundedRectangle(cornerRadius: 16)
                            .fill(Color.black.opacity(0.6))
                            .blur(radius: 0.5)
                    )
                    .opacity(opacity)
                    .onAppear {
                        withAnimation(.easeIn(duration: 0.3)) {
                            opacity = 1
                        }
                        
                        // Auto-dismiss after 5 seconds
                        DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
                            withAnimation(.easeOut(duration: 0.5)) {
                                opacity = 0
                            }
                        }
                    }
            }
            
            Spacer()
                .frame(height: 160)  // Space for companion
        }
        .animation(.easeInOut(duration: 0.3), value: guidance)
    }
}
```

### 6.5 Timing Rules

| Situation | Timing | Priority |
|-----------|--------|----------|
| Low light detected | Immediate | High |
| Too close to wall | 2s delay | Medium |
| Moving too fast | Immediate | Medium |
| Uncovered area | After 15s stationary | Low |
| Good progress | After milestone | Low |

---

## 7. Scan Quality Optimization

### 7.1 Quality Metrics

```swift
struct ScanQuality: Equatable {
    // Coverage metrics
    let overallCoverage: Float      // 0-1
    let wallCoverage: Float         // 0-1
    let floorCoverage: Float        // 0-1
    
    // Confidence metrics
    let averageConfidence: Float    // 0-1
    let lowConfidenceCount: Int
    
    // Completeness
    let incompleteEdges: Int
    let missingCorners: Int
    
    // Derived grade
    var grade: QualityGrade {
        let score = (overallCoverage * 0.4) +
                    (averageConfidence * 0.3) +
                    (1 - Float(incompleteEdges) / 20) * 0.2 +
                    (1 - Float(missingCorners) / 8) * 0.1
        
        switch score {
        case 0.9...: return .excellent
        case 0.75..<0.9: return .good
        case 0.5..<0.75: return .acceptable
        default: return .poor
        }
    }
}

enum QualityGrade {
    case excellent   // >90% - All features captured well
    case good        // 75-90% - Minor gaps acceptable
    case acceptable  // 50-75% - Usable but limited
    case poor        // <50% - Recommend rescan
}
```

### 7.2 Quality Monitor

```swift
actor QualityMonitor {
    private var samples: [QualitySample] = []
    private let maxSamples = 60  // 1 per second for 60s
    
    var finalQuality: ScanQuality {
        get async {
            calculateFinalQuality()
        }
    }
    
    func evaluate(_ room: CapturedRoom) async {
        let sample = QualitySample(
            timestamp: Date(),
            wallCount: room.walls.count,
            wallConfidences: room.walls.map(\.confidence),
            objectConfidences: room.objects.map(\.confidence),
            incompleteEdges: countIncompleteEdges(room)
        )
        
        samples.append(sample)
        if samples.count > maxSamples {
            samples.removeFirst()
        }
    }
    
    private func calculateFinalQuality() -> ScanQuality {
        guard let lastSample = samples.last else {
            return ScanQuality.zero
        }
        
        // Calculate metrics from samples
        let avgConfidence = lastSample.objectConfidences.isEmpty ? 0 :
            lastSample.objectConfidences.map { Float($0.rawValue) / 2.0 }
                .reduce(0, +) / Float(lastSample.objectConfidences.count)
        
        let lowConfidenceCount = lastSample.objectConfidences
            .filter { $0 == .low }.count
        
        return ScanQuality(
            overallCoverage: calculateCoverage(),
            wallCoverage: calculateWallCoverage(),
            floorCoverage: calculateFloorCoverage(),
            averageConfidence: avgConfidence,
            lowConfidenceCount: lowConfidenceCount,
            incompleteEdges: lastSample.incompleteEdges,
            missingCorners: estimateMissingCorners()
        )
    }
}
```

### 7.3 Optimizing Capture Quality

```swift
extension RoomCaptureManager {
    
    /// Configuration optimized for highest quality capture
    func createOptimalConfiguration() -> RoomCaptureSession.Configuration {
        let config = RoomCaptureSession.Configuration()
        
        // Disable built-in coaching (we use custom)
        config.isCoachingEnabled = false
        
        return config
    }
    
    /// Real-time quality guidance
    func getQualityGuidance() async -> String? {
        guard let room = currentRoom else { return nil }
        
        // Check for low-confidence objects
        let lowConfidenceObjects = room.objects.filter { $0.confidence == .low }
        if !lowConfidenceObjects.isEmpty {
            let objectName = lowConfidenceObjects.first?.category.description ?? "something"
            return "I see \(objectName) but not clearly. Move around it slowly."
        }
        
        // Check for incomplete walls
        let incompleteWalls = room.walls.filter { $0.completedEdges.count < 4 }
        if let wall = incompleteWalls.first {
            let direction = directionToWall(wall)
            return "That wall isn't complete. Try moving \(direction)."
        }
        
        // Check lighting conditions (indirect through confidence)
        let avgConfidence = calculateAverageConfidence(room)
        if avgConfidence < 0.5 {
            return "The lighting might be affecting quality. Can we brighten things up?"
        }
        
        return nil
    }
}
```

### 7.4 Post-Scan Quality Enhancement

```swift
actor RoomDataProcessor {
    
    /// Process and enhance captured room data
    func process(_ room: CapturedRoom) async -> ProcessedRoomData {
        // 1. Merge duplicate surfaces
        let mergedSurfaces = mergeDuplicateSurfaces(room.walls)
        
        // 2. Smooth surface boundaries
        let smoothedSurfaces = smoothSurfaceBoundaries(mergedSurfaces)
        
        // 3. Infer missing geometry
        let completedGeometry = inferMissingGeometry(smoothedSurfaces, room: room)
        
        // 4. Classify objects with enhanced confidence
        let classifiedObjects = enhanceObjectClassification(room.objects)
        
        // 5. Calculate room metrics
        let metrics = calculateRoomMetrics(completedGeometry)
        
        return ProcessedRoomData(
            surfaces: completedGeometry,
            objects: classifiedObjects,
            metrics: metrics,
            floorPlan: generateFloorPlan(completedGeometry)
        )
    }
    
    private func inferMissingGeometry(_ surfaces: [Surface], room: CapturedRoom) -> [Surface] {
        var result = surfaces
        
        // If we have 3 walls, try to infer the 4th
        if result.filter({ $0.category == .wall }).count == 3 {
            if let inferredWall = inferFourthWall(result) {
                result.append(inferredWall)
            }
        }
        
        // Connect wall corners that are close but not touching
        result = connectNearbyCorners(result)
        
        return result
    }
}
```

---

## 8. Completion Detection

### 8.1 Completion Criteria

```swift
struct CompletionCriteria {
    // Minimum thresholds for valid scan
    static let minimumCoverage: Float = 0.85
    static let minimumWalls: Int = 3
    static let minimumFloorCoverage: Float = 0.70
    static let minimumConfidence: Float = 0.6
    
    // Quality thresholds for "good" scan
    static let goodCoverage: Float = 0.92
    static let excellentCoverage: Float = 0.97
}
```

### 8.2 Completion Analyzer

```swift
actor CompletionAnalyzer {
    
    struct CompletionStatus {
        let isComplete: Bool
        let quality: ScanQuality
        let missingAreas: [MissingArea]
        let recommendation: CompletionRecommendation
    }
    
    enum CompletionRecommendation {
        case complete                    // Excellent coverage
        case acceptAndContinue          // Good enough, but more possible
        case suggestMoreScanning        // Missing key areas
        case requireMoreScanning        // Below minimum threshold
    }
    
    func analyze(_ room: CapturedRoom, quality: ScanQuality) -> CompletionStatus {
        let coverage = quality.overallCoverage
        let wallCount = room.walls.count
        
        // Check if minimum requirements met
        let meetsMinimum = coverage >= CompletionCriteria.minimumCoverage &&
                          wallCount >= CompletionCriteria.minimumWalls &&
                          quality.averageConfidence >= CompletionCriteria.minimumConfidence
        
        // Determine recommendation
        let recommendation: CompletionRecommendation
        switch (coverage, meetsMinimum) {
        case (CompletionCriteria.excellentCoverage..., true):
            recommendation = .complete
        case (CompletionCriteria.goodCoverage..., true):
            recommendation = .acceptAndContinue
        case (_, true):
            recommendation = .suggestMoreScanning
        case (_, false):
            recommendation = .requireMoreScanning
        }
        
        // Identify missing areas
        let missingAreas = identifyMissingAreas(room)
        
        return CompletionStatus(
            isComplete: meetsMinimum,
            quality: quality,
            missingAreas: missingAreas,
            recommendation: recommendation
        )
    }
    
    private func identifyMissingAreas(_ room: CapturedRoom) -> [MissingArea] {
        var missing: [MissingArea] = []
        
        // Check wall completeness
        for wall in room.walls {
            if wall.completedEdges.count < 4 {
                let missingEdges = Set(CapturedRoom.Surface.Edge.allCases)
                    .subtracting(wall.completedEdges)
                missing.append(.wallEdge(wallId: wall.identifier, edges: missingEdges))
            }
        }
        
        // Check corner connections
        let disconnectedCorners = findDisconnectedCorners(room.walls)
        for corner in disconnectedCorners {
            missing.append(.corner(location: corner))
        }
        
        return missing
    }
}

enum MissingArea {
    case wallEdge(wallId: UUID, edges: Set<CapturedRoom.Surface.Edge>)
    case corner(location: simd_float3)
    case floorArea(bounds: CGRect)
}
```

### 8.3 Completion Flow

```swift
extension RoomCaptureManager {
    
    func checkCompletion() async -> CompletionCheckResult {
        guard let room = currentRoom else {
            return .notReady
        }
        
        let quality = await qualityMonitor.finalQuality
        let status = await completionAnalyzer.analyze(room, quality: quality)
        
        switch status.recommendation {
        case .complete:
            return .complete(status)
            
        case .acceptAndContinue:
            return .acceptable(
                status: status,
                prompt: "We have a good scan. Want to capture a bit more for better accuracy?"
            )
            
        case .suggestMoreScanning:
            let guidance = formatMissingAreaGuidance(status.missingAreas)
            return .needsMore(
                status: status,
                guidance: guidance
            )
            
        case .requireMoreScanning:
            return .insufficient(
                status: status,
                message: "I need a bit more to work with. Let's keep going."
            )
        }
    }
}

enum CompletionCheckResult {
    case notReady
    case complete(CompletionAnalyzer.CompletionStatus)
    case acceptable(status: CompletionAnalyzer.CompletionStatus, prompt: String)
    case needsMore(status: CompletionAnalyzer.CompletionStatus, guidance: String)
    case insufficient(status: CompletionAnalyzer.CompletionStatus, message: String)
}
```

### 8.4 Completion Celebration

```swift
struct WalkCompletionView: View {
    let result: RoomScanResult
    let styleSignals: StyleSignals
    let onContinue: () -> Void
    
    @State private var showInsights = false
    @State private var insightIndex = 0
    
    var body: some View {
        VStack(spacing: 0) {
            // Abstract room visualization
            RoomVisualization(room: result.capturedRoom)
                .frame(height: 280)
                .overlay(
                    // Completion checkmark
                    CompletionCheckmark()
                        .opacity(showInsights ? 0 : 1)
                )
            
            Spacer()
            
            // Companion reflection
            VStack(spacing: 24) {
                Text("I'm beginning to understand this space — and you.")
                    .font(PatinaTypography.patinaVoice)
                    .foregroundColor(PatinaColors.Text.primary)
                    .multilineTextAlignment(.center)
                    .opacity(showInsights ? 1 : 0)
                
                // Style insights (revealed one by one)
                if showInsights {
                    StyleInsightsList(
                        signals: styleSignals,
                        currentIndex: insightIndex
                    )
                }
                
                Text("Something's already surfacing that might belong here.")
                    .font(PatinaTypography.body)
                    .foregroundColor(PatinaColors.Text.secondary)
                    .multilineTextAlignment(.center)
                    .opacity(insightIndex >= styleSignals.insights.count ? 1 : 0)
                
                PatinaButton("Show me") {
                    onContinue()
                }
                .opacity(insightIndex >= styleSignals.insights.count ? 1 : 0)
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 48)
        }
        .onAppear {
            startInsightReveal()
        }
    }
    
    private func startInsightReveal() {
        // Show "I'm beginning to understand" after 1s
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            withAnimation(.easeIn(duration: 0.5)) {
                showInsights = true
            }
            
            // Reveal insights one by one
            revealNextInsight()
        }
    }
    
    private func revealNextInsight() {
        guard insightIndex < styleSignals.insights.count else { return }
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
            withAnimation(.easeIn(duration: 0.3)) {
                insightIndex += 1
            }
            revealNextInsight()
        }
    }
}
```

---

## 9. Data Capture & Processing

### 9.1 Room Data Model

```swift
// Core persisted room model
struct Room: Identifiable, Codable {
    let id: UUID
    var name: String
    var type: RoomType
    let createdAt: Date
    var updatedAt: Date
    
    // Scan data
    var scanId: UUID?
    var dimensions: RoomDimensions?
    var features: [RoomFeature]
    
    // Style signals extracted from this room
    var styleSignals: StyleSignals?
    
    // Emergence tracking
    var emergenceCount: Int
    var lastEmergenceAt: Date?
}

enum RoomType: String, Codable {
    case livingRoom
    case bedroom
    case kitchen
    case bathroom
    case diningRoom
    case office
    case other
}

struct RoomDimensions: Codable {
    let width: Float       // meters
    let length: Float      // meters
    let height: Float      // meters
    let floorArea: Float   // square meters
    let volume: Float      // cubic meters
}

struct RoomFeature: Identifiable, Codable {
    let id: UUID
    let type: FeatureType
    let position: SIMD3<Float>
    let dimensions: SIMD3<Float>
    let confidence: Float
    
    enum FeatureType: String, Codable {
        case window
        case door
        case fireplace
        case builtInShelving
        case alcove
        case column
        case beam
    }
}
```

### 9.2 Scan Result Model

```swift
struct RoomScanResult: Identifiable {
    let id: UUID
    let capturedRoom: CapturedRoom
    let processedData: ProcessedRoomData
    let quality: ScanQuality
    let capturedAt: Date
    
    // Serializable version for storage
    var storable: StorableRoomScan {
        StorableRoomScan(
            id: id,
            capturedAt: capturedAt,
            quality: quality.grade.rawValue,
            dimensions: extractDimensions(),
            surfaces: serializeSurfaces(),
            objects: serializeObjects(),
            usdzData: exportUSDZ()
        )
    }
}

struct StorableRoomScan: Codable {
    let id: UUID
    let capturedAt: Date
    let quality: String
    let dimensions: RoomDimensions
    let surfaces: [SerializedSurface]
    let objects: [SerializedObject]
    let usdzData: Data?  // Optional USDZ export
}

struct SerializedSurface: Codable {
    let id: UUID
    let category: String
    let width: Float
    let height: Float
    let depth: Float
    let transform: [Float]  // 16 floats for 4x4 matrix
}

struct SerializedObject: Codable {
    let id: UUID
    let category: String
    let width: Float
    let height: Float
    let depth: Float
    let transform: [Float]
    let confidence: String
}
```

### 9.3 USDZ Export

```swift
extension RoomScanResult {
    
    /// Export room as USDZ file for AR visualization
    func exportUSDZ() -> Data? {
        do {
            // Create temporary URL
            let tempURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("\(id).usdz")
            
            // Use RoomPlan's built-in export
            try capturedRoom.export(
                to: tempURL,
                exportOptions: .model  // or .parametric for editable
            )
            
            // Read the file data
            let data = try Data(contentsOf: tempURL)
            
            // Clean up temp file
            try? FileManager.default.removeItem(at: tempURL)
            
            return data
            
        } catch {
            print("USDZ export failed: \(error)")
            return nil
        }
    }
    
    /// Export as JSON for API transmission
    func exportJSON() throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .prettyPrinted
        return try encoder.encode(storable)
    }
}
```

### 9.4 Local Persistence

```swift
actor RoomPersistence {
    private let container: ModelContainer
    
    init() throws {
        let schema = Schema([RoomEntity.self, RoomScanEntity.self])
        let config = ModelConfiguration(isStoredInMemoryOnly: false)
        container = try ModelContainer(for: schema, configurations: config)
    }
    
    @MainActor
    func saveRoom(_ room: Room, scan: RoomScanResult) async throws {
        let context = container.mainContext
        
        // Create room entity
        let roomEntity = RoomEntity(from: room)
        
        // Create scan entity with reference
        let scanEntity = RoomScanEntity(from: scan.storable)
        scanEntity.room = roomEntity
        
        // Store USDZ data separately (large blob)
        if let usdzData = scan.exportUSDZ() {
            let usdzEntity = USDZDataEntity(
                scanId: scan.id,
                data: usdzData
            )
            context.insert(usdzEntity)
        }
        
        context.insert(roomEntity)
        context.insert(scanEntity)
        
        try context.save()
    }
    
    @MainActor
    func fetchRooms() async throws -> [Room] {
        let context = container.mainContext
        let descriptor = FetchDescriptor<RoomEntity>(
            sortBy: [SortDescriptor(\.updatedAt, order: .reverse)]
        )
        let entities = try context.fetch(descriptor)
        return entities.map { $0.toModel() }
    }
}
```

---

## 10. Supabase Integration

### 10.1 Schema Design

```sql
-- Rooms table
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Dimensions
    width_meters FLOAT,
    length_meters FLOAT,
    height_meters FLOAT,
    floor_area_sqm FLOAT,
    volume_cbm FLOAT,
    
    -- Style signals (JSONB for flexibility)
    style_signals JSONB,
    
    -- Metadata
    scan_count INT DEFAULT 0,
    emergence_count INT DEFAULT 0,
    last_emergence_at TIMESTAMPTZ
);

-- Room scans table
CREATE TABLE room_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    captured_at TIMESTAMPTZ NOT NULL,
    quality TEXT NOT NULL,
    
    -- Serialized geometry data
    surfaces JSONB NOT NULL,
    objects JSONB NOT NULL,
    
    -- Processing status
    processing_status TEXT DEFAULT 'pending',
    processed_at TIMESTAMPTZ,
    
    -- Indices
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- USDZ files stored in Supabase Storage
-- Path: rooms/{user_id}/{room_id}/scan_{scan_id}.usdz

-- Room features (extracted from scans)
CREATE TABLE room_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    scan_id UUID REFERENCES room_scans(id) ON DELETE CASCADE,
    
    type TEXT NOT NULL,
    position_x FLOAT NOT NULL,
    position_y FLOAT NOT NULL,
    position_z FLOAT NOT NULL,
    width FLOAT,
    height FLOAT,
    depth FLOAT,
    confidence FLOAT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Style signals derived from rooms
CREATE TABLE user_style_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Aggregated signals across all rooms
    natural_light_preference FLOAT,
    openness_preference FLOAT,
    warmth_preference FLOAT,
    texture_preference FLOAT,
    
    -- Source tracking
    source_room_ids UUID[],
    last_calculated_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_rooms_user_id ON rooms(user_id);
CREATE INDEX idx_room_scans_room_id ON room_scans(room_id);
CREATE INDEX idx_room_features_room_id ON room_features(room_id);
```

### 10.2 Supabase Client Configuration

```swift
import Supabase

actor SupabaseClient {
    static let shared = SupabaseClient()
    
    private let client: SupabaseClient
    
    private init() {
        client = SupabaseClient(
            supabaseURL: URL(string: AppConfiguration.supabaseURL)!,
            supabaseKey: AppConfiguration.supabaseAnonKey
        )
    }
    
    var auth: GoTrueClient { client.auth }
    var database: PostgrestClient { client.database }
    var storage: SupabaseStorageClient { client.storage }
}

// Environment configuration
enum AppConfiguration {
    static var supabaseURL: String {
        #if DEBUG
        return "https://your-project.supabase.co"
        #else
        return ProcessInfo.processInfo.environment["SUPABASE_URL"] ?? ""
        #endif
    }
    
    static var supabaseAnonKey: String {
        #if DEBUG
        return "your-anon-key"
        #else
        return ProcessInfo.processInfo.environment["SUPABASE_ANON_KEY"] ?? ""
        #endif
    }
}
```

### 10.3 Room Sync Service

```swift
actor RoomSupabaseSync {
    private let supabase = SupabaseClient.shared
    
    // MARK: - Upload Room
    
    func uploadRoom(_ room: Room, scan: RoomScanResult) async throws -> SyncResult {
        // 1. Get current user
        guard let userId = await supabase.auth.session?.user.id else {
            throw SyncError.notAuthenticated
        }
        
        // 2. Upload room data
        let roomDTO = RoomDTO(from: room, userId: userId)
        let insertedRoom = try await supabase.database
            .from("rooms")
            .insert(roomDTO)
            .select()
            .single()
            .execute()
            .value as RoomDTO
        
        // 3. Upload scan data
        let scanDTO = RoomScanDTO(from: scan.storable, roomId: insertedRoom.id)
        try await supabase.database
            .from("room_scans")
            .insert(scanDTO)
            .execute()
        
        // 4. Upload USDZ to storage
        if let usdzData = scan.exportUSDZ() {
            try await uploadUSDZ(
                data: usdzData,
                userId: userId,
                roomId: insertedRoom.id,
                scanId: scan.id
            )
        }
        
        // 5. Extract and upload features
        let features = extractFeatures(from: scan)
        if !features.isEmpty {
            let featureDTOs = features.map { 
                RoomFeatureDTO(from: $0, roomId: insertedRoom.id, scanId: scan.id)
            }
            try await supabase.database
                .from("room_features")
                .insert(featureDTOs)
                .execute()
        }
        
        // 6. Update user style signals
        try await updateStyleSignals(userId: userId, newRoom: room)
        
        return SyncResult(
            roomId: insertedRoom.id,
            scanId: scan.id,
            uploadedAt: Date()
        )
    }
    
    // MARK: - USDZ Upload
    
    private func uploadUSDZ(
        data: Data,
        userId: UUID,
        roomId: UUID,
        scanId: UUID
    ) async throws {
        let path = "rooms/\(userId)/\(roomId)/scan_\(scanId).usdz"
        
        try await supabase.storage
            .from("room-scans")
            .upload(
                path: path,
                file: data,
                options: FileOptions(
                    contentType: "model/vnd.usdz+zip"
                )
            )
    }
    
    // MARK: - Style Signal Aggregation
    
    private func updateStyleSignals(userId: UUID, newRoom: Room) async throws {
        guard let signals = newRoom.styleSignals else { return }
        
        // Fetch existing signals
        let existing = try? await supabase.database
            .from("user_style_signals")
            .select()
            .eq("user_id", value: userId)
            .single()
            .execute()
            .value as UserStyleSignalsDTO?
        
        // Calculate new aggregated signals
        let updated = aggregateSignals(existing: existing, new: signals, roomId: newRoom.id)
        
        // Upsert
        try await supabase.database
            .from("user_style_signals")
            .upsert(updated)
            .execute()
    }
}

// MARK: - DTOs

struct RoomDTO: Codable {
    let id: UUID
    let userId: UUID
    let name: String
    let type: String
    let widthMeters: Float?
    let lengthMeters: Float?
    let heightMeters: Float?
    let floorAreaSqm: Float?
    let volumeCbm: Float?
    let styleSignals: StyleSignalsDTO?
    
    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case name, type
        case widthMeters = "width_meters"
        case lengthMeters = "length_meters"
        case heightMeters = "height_meters"
        case floorAreaSqm = "floor_area_sqm"
        case volumeCbm = "volume_cbm"
        case styleSignals = "style_signals"
    }
    
    init(from room: Room, userId: UUID) {
        self.id = room.id
        self.userId = userId
        self.name = room.name
        self.type = room.type.rawValue
        self.widthMeters = room.dimensions?.width
        self.lengthMeters = room.dimensions?.length
        self.heightMeters = room.dimensions?.height
        self.floorAreaSqm = room.dimensions?.floorArea
        self.volumeCbm = room.dimensions?.volume
        self.styleSignals = room.styleSignals.map { StyleSignalsDTO(from: $0) }
    }
}

struct RoomScanDTO: Codable {
    let id: UUID
    let roomId: UUID
    let capturedAt: Date
    let quality: String
    let surfaces: [SerializedSurface]
    let objects: [SerializedObject]
    
    enum CodingKeys: String, CodingKey {
        case id
        case roomId = "room_id"
        case capturedAt = "captured_at"
        case quality, surfaces, objects
    }
}
```

### 10.4 Offline-First Sync Strategy

```swift
actor OfflineFirstSync {
    private let localPersistence: RoomPersistence
    private let remoteSync: RoomSupabaseSync
    private var pendingUploads: [PendingUpload] = []
    
    // MARK: - Save (Always Local First)
    
    func saveRoom(_ room: Room, scan: RoomScanResult) async throws {
        // 1. Save locally immediately
        try await localPersistence.saveRoom(room, scan: scan)
        
        // 2. Queue for remote sync
        let pending = PendingUpload(
            id: UUID(),
            roomId: room.id,
            scanId: scan.id,
            createdAt: Date(),
            status: .pending
        )
        pendingUploads.append(pending)
        
        // 3. Attempt remote sync (non-blocking)
        Task {
            await attemptSync(pending)
        }
    }
    
    // MARK: - Sync Attempt
    
    private func attemptSync(_ pending: PendingUpload) async {
        do {
            // Check network
            guard NetworkMonitor.shared.isConnected else {
                markForRetry(pending)
                return
            }
            
            // Fetch local data
            guard let room = try await localPersistence.fetchRoom(id: pending.roomId),
                  let scan = try await localPersistence.fetchScan(id: pending.scanId) else {
                markFailed(pending, reason: "Local data not found")
                return
            }
            
            // Upload to Supabase
            let result = try await remoteSync.uploadRoom(room, scan: scan)
            
            // Mark complete
            markComplete(pending, result: result)
            
        } catch {
            markForRetry(pending, error: error)
        }
    }
    
    // MARK: - Retry Logic
    
    func retryPendingUploads() async {
        let pending = pendingUploads.filter { $0.status == .pending || $0.status == .retrying }
        
        for upload in pending {
            await attemptSync(upload)
            
            // Small delay between uploads to avoid overwhelming
            try? await Task.sleep(nanoseconds: 500_000_000)
        }
    }
    
    // MARK: - Background Sync
    
    func scheduleBackgroundSync() {
        // Register for background task
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: "com.patina.roomsync",
            using: nil
        ) { task in
            self.handleBackgroundSync(task: task as! BGProcessingTask)
        }
    }
    
    private func handleBackgroundSync(task: BGProcessingTask) {
        Task {
            task.expirationHandler = {
                // Save state if we're interrupted
            }
            
            await retryPendingUploads()
            
            task.setTaskCompleted(success: true)
        }
    }
}

struct PendingUpload: Identifiable {
    let id: UUID
    let roomId: UUID
    let scanId: UUID
    let createdAt: Date
    var status: SyncStatus
    var retryCount: Int = 0
    var lastError: String?
}

enum SyncStatus {
    case pending
    case syncing
    case retrying
    case complete
    case failed
}
```

### 10.5 Real-Time Subscriptions

```swift
actor RoomRealtimeSync {
    private let supabase = SupabaseClient.shared
    private var roomChannel: RealtimeChannel?
    
    func subscribeToRoomUpdates(roomId: UUID) async throws {
        roomChannel = await supabase.realtime.channel("room:\(roomId)")
        
        await roomChannel?.on(
            "postgres_changes",
            filter: ChannelFilter(
                event: "*",
                schema: "public",
                table: "rooms",
                filter: "id=eq.\(roomId)"
            )
        ) { payload in
            Task { @MainActor in
                self.handleRoomUpdate(payload)
            }
        }
        
        await roomChannel?.subscribe()
    }
    
    @MainActor
    private func handleRoomUpdate(_ payload: PostgresChanges) {
        switch payload.eventType {
        case .update:
            // Room was updated (e.g., new emergence count)
            NotificationCenter.default.post(
                name: .roomUpdated,
                object: nil,
                userInfo: ["payload": payload]
            )
        case .delete:
            // Room was deleted
            NotificationCenter.default.post(
                name: .roomDeleted,
                object: nil,
                userInfo: ["roomId": payload.oldRecord?["id"]]
            )
        default:
            break
        }
    }
    
    func unsubscribe() async {
        await roomChannel?.unsubscribe()
        roomChannel = nil
    }
}
```

---

## 11. Error Handling & Recovery

### 11.1 Error Types

```swift
enum ScanError: Error, LocalizedError {
    case deviceNotSupported
    case cameraPermissionDenied
    case trackingFailed(reason: TrackingFailureReason)
    case insufficientLight
    case insufficientSpace
    case sessionInterrupted(reason: InterruptionReason)
    case processingFailed(underlying: Error?)
    case exportFailed(underlying: Error?)
    case syncFailed(underlying: Error?)
    case unknown(String)
    
    var errorDescription: String? {
        switch self {
        case .deviceNotSupported:
            return "This device doesn't support room scanning."
        case .cameraPermissionDenied:
            return "Camera access is needed to scan your room."
        case .trackingFailed(let reason):
            return "I lost my bearings. \(reason.guidance)"
        case .insufficientLight:
            return "It's too dark for me to see clearly."
        case .insufficientSpace:
            return "I need a bit more room to work with."
        case .sessionInterrupted(let reason):
            return reason.message
        case .processingFailed:
            return "Something went wrong while processing."
        case .exportFailed:
            return "Couldn't save the room data."
        case .syncFailed:
            return "Couldn't upload to the cloud."
        case .unknown(let message):
            return message
        }
    }
}

enum TrackingFailureReason {
    case excessiveMotion
    case insufficientFeatures
    case relocalizing
    
    var guidance: String {
        switch self {
        case .excessiveMotion:
            return "Try moving more slowly."
        case .insufficientFeatures:
            return "Point at an area with more detail."
        case .relocalizing:
            return "Hold still while I find my place again."
        }
    }
}

enum InterruptionReason {
    case phoneCall
    case appSwitched
    case systemAlert
    
    var message: String {
        switch self {
        case .phoneCall:
            return "The scan was interrupted by a call."
        case .appSwitched:
            return "The scan was paused when you left the app."
        case .systemAlert:
            return "A system alert interrupted the scan."
        }
    }
}
```

### 11.2 Recovery Strategies

```swift
actor ScanRecovery {
    
    func attemptRecovery(from error: ScanError, manager: RoomCaptureManager) async -> RecoveryResult {
        switch error {
        case .trackingFailed(let reason):
            return await recoverFromTrackingFailure(reason, manager: manager)
            
        case .insufficientLight:
            return .userActionRequired(
                message: "Can you turn on some lights or move to a brighter area?",
                actions: [.retry, .adjustEnvironment]
            )
            
        case .sessionInterrupted:
            return await recoverFromInterruption(manager: manager)
            
        case .processingFailed:
            return .retry(
                message: "Let me try processing that again.",
                automatic: true
            )
            
        case .syncFailed:
            return .deferred(
                message: "Your scan is saved locally. I'll upload it when you're back online.",
                retryLater: true
            )
            
        default:
            return .unrecoverable(error: error)
        }
    }
    
    private func recoverFromTrackingFailure(
        _ reason: TrackingFailureReason,
        manager: RoomCaptureManager
    ) async -> RecoveryResult {
        // Attempt automatic recovery
        var attempts = 0
        let maxAttempts = 3
        
        while attempts < maxAttempts {
            // Wait a moment for tracking to stabilize
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            
            // Check if tracking recovered
            if await manager.isTrackingStable {
                return .recovered(message: "There we go. Continue when ready.")
            }
            
            attempts += 1
        }
        
        // Couldn't recover automatically
        return .userActionRequired(
            message: reason.guidance,
            actions: [.retry, .startOver]
        )
    }
    
    private func recoverFromInterruption(manager: RoomCaptureManager) async -> RecoveryResult {
        // Check if we have enough data to continue
        let progress = await manager.progress
        
        if progress.coveragePercentage >= 0.5 {
            return .canContinue(
                message: "Welcome back. Want to pick up where we left off?",
                savedProgress: progress
            )
        } else {
            return .suggestRestart(
                message: "We didn't get very far. Want to start fresh?",
                canContinue: true
            )
        }
    }
}

enum RecoveryResult {
    case recovered(message: String)
    case canContinue(message: String, savedProgress: ScanProgress)
    case suggestRestart(message: String, canContinue: Bool)
    case retry(message: String, automatic: Bool)
    case userActionRequired(message: String, actions: [RecoveryAction])
    case deferred(message: String, retryLater: Bool)
    case unrecoverable(error: ScanError)
}

enum RecoveryAction {
    case retry
    case startOver
    case adjustEnvironment
    case openSettings
    case savePartial
    case cancel
}
```

### 11.3 Error UI

```swift
struct ScanErrorView: View {
    let error: ScanError
    let recovery: RecoveryResult
    let onAction: (RecoveryAction) -> Void
    
    var body: some View {
        VStack(spacing: 24) {
            // Error icon
            Image(systemName: errorIcon)
                .font(.system(size: 48))
                .foregroundColor(PatinaColors.clayBeige)
            
            // Message
            Text(recovery.message)
                .font(PatinaTypography.patinaVoice)
                .foregroundColor(PatinaColors.Text.primary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            
            // Actions
            VStack(spacing: 12) {
                ForEach(recovery.actions, id: \.self) { action in
                    Button(action.title) {
                        onAction(action)
                    }
                    .buttonStyle(
                        action.isPrimary ? 
                            PatinaButtonStyle.primary : 
                            PatinaButtonStyle.secondary
                    )
                }
            }
        }
        .padding(32)
        .background(
            RoundedRectangle(cornerRadius: 24)
                .fill(.ultraThinMaterial)
        )
    }
    
    private var errorIcon: String {
        switch error {
        case .trackingFailed: return "location.slash"
        case .insufficientLight: return "sun.min"
        case .sessionInterrupted: return "pause.circle"
        default: return "exclamationmark.triangle"
        }
    }
}
```

---

## 12. Performance Optimization

### 12.1 Memory Management

```swift
actor MemoryManager {
    private let memoryWarningThreshold: UInt64 = 200_000_000  // 200MB
    
    func monitorMemoryDuringScan() {
        // Listen for memory warnings
        NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task {
                await self?.handleMemoryWarning()
            }
        }
    }
    
    private func handleMemoryWarning() async {
        // 1. Clear any cached textures
        TextureCache.shared.purge()
        
        // 2. Reduce scan quality temporarily
        await ScanQualityManager.shared.reduceQuality()
        
        // 3. Force garbage collection
        autoreleasepool { }
    }
    
    func currentMemoryUsage() -> UInt64 {
        var info = mach_task_basic_info()
        var count = mach_msg_type_number_t(MemoryLayout<mach_task_basic_info>.size) / 4
        
        let result = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: 1) {
                task_info(mach_task_self_, task_flavor_t(MACH_TASK_BASIC_INFO), $0, &count)
            }
        }
        
        return result == KERN_SUCCESS ? info.resident_size : 0
    }
}
```

### 12.2 Frame Rate Optimization

```swift
class FrameRateMonitor {
    private var displayLink: CADisplayLink?
    private var frameTimestamps: [CFTimeInterval] = []
    private let maxSamples = 60
    
    var currentFPS: Double {
        guard frameTimestamps.count >= 2 else { return 0 }
        let duration = frameTimestamps.last! - frameTimestamps.first!
        return Double(frameTimestamps.count - 1) / duration
    }
    
    func startMonitoring() {
        displayLink = CADisplayLink(target: self, selector: #selector(handleFrame))
        displayLink?.add(to: .main, forMode: .common)
    }
    
    @objc private func handleFrame(_ link: CADisplayLink) {
        frameTimestamps.append(link.timestamp)
        
        if frameTimestamps.count > maxSamples {
            frameTimestamps.removeFirst()
        }
        
        // Warn if FPS drops below threshold
        if currentFPS < 30 {
            NotificationCenter.default.post(
                name: .lowFrameRate,
                object: nil,
                userInfo: ["fps": currentFPS]
            )
        }
    }
    
    func stopMonitoring() {
        displayLink?.invalidate()
        displayLink = nil
    }
}
```

### 12.3 Battery Optimization

```swift
actor BatteryOptimizer {
    private var isLowPowerMode: Bool {
        ProcessInfo.processInfo.isLowPowerModeEnabled
    }
    
    func optimizeForBattery() async -> ScanConfiguration {
        if isLowPowerMode {
            return ScanConfiguration(
                captureRate: .reduced,      // 30fps instead of 60fps
                meshDetail: .medium,         // Less detailed mesh
                enableHaptics: false,        // Disable haptics
                narrativeVoice: false        // Text only, no TTS
            )
        } else {
            return ScanConfiguration.default
        }
    }
    
    func monitorBattery() {
        UIDevice.current.isBatteryMonitoringEnabled = true
        
        NotificationCenter.default.addObserver(
            forName: UIDevice.batteryLevelDidChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task {
                await self?.checkBatteryLevel()
            }
        }
    }
    
    private func checkBatteryLevel() async {
        let level = UIDevice.current.batteryLevel
        
        if level < 0.1 {
            // Critical - suggest saving
            NotificationCenter.default.post(
                name: .criticalBattery,
                object: nil,
                userInfo: ["message": "Battery is very low. Want to save what we have?"]
            )
        } else if level < 0.2 {
            // Low - reduce quality
            await ScanQualityManager.shared.reduceQuality()
        }
    }
}
```

### 12.4 Thermal Management

```swift
actor ThermalMonitor {
    func startMonitoring() {
        NotificationCenter.default.addObserver(
            forName: ProcessInfo.thermalStateDidChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task {
                await self?.handleThermalChange()
            }
        }
    }
    
    private func handleThermalChange() async {
        let state = ProcessInfo.processInfo.thermalState
        
        switch state {
        case .nominal, .fair:
            // Normal operation
            break
            
        case .serious:
            // Reduce quality to cool down
            await ScanQualityManager.shared.reduceQuality()
            
            NotificationCenter.default.post(
                name: .thermalWarning,
                object: nil,
                userInfo: ["message": "Your device is warming up. I'll work more efficiently."]
            )
            
        case .critical:
            // Pause and save
            NotificationCenter.default.post(
                name: .thermalCritical,
                object: nil,
                userInfo: ["message": "Let's take a break. Your device needs to cool down."]
            )
            
        @unknown default:
            break
        }
    }
}
```

---

## 13. Testing Strategy

### 13.1 Unit Tests

```swift
final class CoverageAnalyzerTests: XCTestCase {
    var analyzer: CoverageAnalyzer!
    
    override func setUp() {
        analyzer = CoverageAnalyzer()
    }
    
    func testCoverageCalculation_EmptyRoom() async {
        let room = MockCapturedRoom(walls: [], floors: [])
        let coverage = await analyzer.analyze(room)
        
        XCTAssertEqual(coverage, 0)
    }
    
    func testCoverageCalculation_PartialRoom() async {
        let room = MockCapturedRoom(
            walls: [mockWall(complete: true), mockWall(complete: false)],
            floors: [mockFloor(coverage: 0.5)]
        )
        let coverage = await analyzer.analyze(room)
        
        XCTAssertGreaterThan(coverage, 0.3)
        XCTAssertLessThan(coverage, 0.7)
    }
    
    func testCoverageCalculation_CompleteRoom() async {
        let room = MockCapturedRoom(
            walls: (0..<4).map { _ in mockWall(complete: true) },
            floors: [mockFloor(coverage: 1.0)]
        )
        let coverage = await analyzer.analyze(room)
        
        XCTAssertGreaterThan(coverage, 0.9)
    }
}

final class CompletionAnalyzerTests: XCTestCase {
    func testCompletion_MeetsMinimum() async {
        let room = MockCapturedRoom.goodQuality
        let quality = ScanQuality.good
        
        let analyzer = CompletionAnalyzer()
        let status = await analyzer.analyze(room, quality: quality)
        
        XCTAssertTrue(status.isComplete)
        XCTAssertEqual(status.recommendation, .acceptAndContinue)
    }
    
    func testCompletion_BelowMinimum() async {
        let room = MockCapturedRoom.lowQuality
        let quality = ScanQuality.poor
        
        let analyzer = CompletionAnalyzer()
        let status = await analyzer.analyze(room, quality: quality)
        
        XCTAssertFalse(status.isComplete)
        XCTAssertEqual(status.recommendation, .requireMoreScanning)
    }
}
```

### 13.2 Integration Tests

```swift
final class RoomScanIntegrationTests: XCTestCase {
    var manager: RoomCaptureManager!
    
    @MainActor
    override func setUp() async throws {
        // Skip on simulator (no LiDAR)
        try XCTSkipUnless(
            RoomCaptureSession.isSupported,
            "RoomPlan not supported on this device"
        )
        
        manager = RoomCaptureManager()
        try await manager.initialize()
    }
    
    func testScanLifecycle() async throws {
        // Start capture
        try await manager.startCapture()
        
        // Wait for some scanning
        try await Task.sleep(nanoseconds: 5_000_000_000)
        
        // Check progress updated
        let progress = await manager.progress
        XCTAssertGreaterThan(progress.coveragePercentage, 0)
        
        // Stop capture
        let result = await manager.stopCapture()
        
        XCTAssertNotNil(result)
        XCTAssertNotNil(result?.processedData)
    }
}
```

### 13.3 UI Tests

```swift
final class WalkUITests: XCTestCase {
    var app: XCUIApplication!
    
    override func setUp() {
        app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--mock-roomplan"]
        app.launch()
    }
    
    func testWalkFlow_CompleteScan() {
        // Navigate to walk
        app.buttons["Let's walk"].tap()
        
        // Grant camera permission (mocked)
        app.buttons["Allow"].tap()
        
        // Wait for AR to initialize
        let arView = app.otherElements["WalkARView"]
        XCTAssertTrue(arView.waitForExistence(timeout: 5))
        
        // Wait for mock scan to complete
        let completionView = app.otherElements["WalkCompletionView"]
        XCTAssertTrue(completionView.waitForExistence(timeout: 10))
        
        // Verify style insights shown
        XCTAssertTrue(app.staticTexts["You value natural light."].exists)
        
        // Continue to emergence
        app.buttons["Show me"].tap()
        
        // Verify emergence appeared
        let emergenceView = app.otherElements["EmergenceView"]
        XCTAssertTrue(emergenceView.waitForExistence(timeout: 3))
    }
}
```

### 13.4 Mock RoomPlan for Testing

```swift
#if DEBUG
class MockRoomCaptureSession {
    var delegate: RoomCaptureSessionDelegate?
    private var timer: Timer?
    private var progress: Float = 0
    
    func run(configuration: RoomCaptureSession.Configuration) {
        // Simulate scanning progress
        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.simulateProgress()
        }
    }
    
    private func simulateProgress() {
        progress += 0.05
        
        let mockRoom = createMockRoom(coverage: progress)
        delegate?.captureSession(self as! RoomCaptureSession, didUpdate: mockRoom)
        
        if progress >= 1.0 {
            timer?.invalidate()
        }
    }
    
    func stop() async throws -> CapturedRoom {
        timer?.invalidate()
        return createMockRoom(coverage: 1.0)
    }
    
    private func createMockRoom(coverage: Float) -> CapturedRoom {
        // Create mock CapturedRoom with appropriate coverage
        // This would need to use private APIs or a mock subclass
    }
}
#endif
```

---

## 14. Implementation Checklist

### Phase 1: Core Scanning (Week 1-2)

- [ ] Create `RoomCaptureManager` actor
- [ ] Implement RoomCaptureSession lifecycle
- [ ] Create `WalkView` SwiftUI wrapper
- [ ] Implement `WalkARView` with ARView
- [ ] Create `ScanState` state machine
- [ ] Implement delegate methods for updates
- [ ] Add basic error handling
- [ ] Test on physical device with LiDAR

### Phase 2: Progress & Coaching (Week 2-3)

- [ ] Implement `CoverageAnalyzer`
- [ ] Create `ScanProgress` model
- [ ] Build `WalkProgressView` (water fill indicator)
- [ ] Implement `CoachingService`
- [ ] Create `WalkCoachingOverlay`
- [ ] Add haptic feedback at milestones
- [ ] Test progress accuracy
- [ ] Test coaching timing

### Phase 3: Quality & Completion (Week 3-4)

- [ ] Implement `QualityMonitor`
- [ ] Create `CompletionAnalyzer`
- [ ] Build `WalkCompletionView`
- [ ] Add quality-based guidance
- [ ] Implement completion criteria
- [ ] Create style insight extraction
- [ ] Test completion detection
- [ ] Test quality metrics

### Phase 4: Data Processing (Week 4-5)

- [ ] Create `RoomDataProcessor`
- [ ] Implement USDZ export
- [ ] Create JSON serialization
- [ ] Build `RoomPersistence` for local storage
- [ ] Implement feature extraction
- [ ] Create room/scan models
- [ ] Test data integrity
- [ ] Test export formats

### Phase 5: Supabase Integration (Week 5-6)

- [ ] Set up Supabase schema
- [ ] Create `RoomSupabaseSync` service
- [ ] Implement USDZ storage upload
- [ ] Build `OfflineFirstSync`
- [ ] Add background sync
- [ ] Create real-time subscriptions
- [ ] Test sync reliability
- [ ] Test offline behavior

### Phase 6: Polish & Optimization (Week 6-7)

- [ ] Implement memory management
- [ ] Add thermal monitoring
- [ ] Optimize battery usage
- [ ] Add comprehensive error recovery
- [ ] Performance profiling
- [ ] Memory leak testing
- [ ] Final UI polish
- [ ] Accessibility audit

---

## Appendix A: Quick Reference

### Key Classes

| Class | Purpose |
|-------|---------|
| `RoomCaptureManager` | Wraps RoomPlan session |
| `CoverageAnalyzer` | Calculates scan coverage |
| `QualityMonitor` | Tracks scan quality |
| `CompletionAnalyzer` | Determines completion |
| `CoachingService` | User guidance logic |
| `RoomDataProcessor` | Post-scan processing |
| `RoomSupabaseSync` | Cloud sync |

### Key Thresholds

| Threshold | Value |
|-----------|-------|
| Minimum coverage | 85% |
| Good coverage | 92% |
| Excellent coverage | 97% |
| Guidance interval | 8 seconds |
| Completion wall count | 3 minimum |

### Supabase Tables

| Table | Purpose |
|-------|---------|
| `rooms` | Room metadata |
| `room_scans` | Scan geometry data |
| `room_features` | Extracted features |
| `user_style_signals` | Aggregated preferences |

---

*Patina — Where Time Adds Value*

**Document Version:** 1.0.0  
**Last Updated:** January 2026
