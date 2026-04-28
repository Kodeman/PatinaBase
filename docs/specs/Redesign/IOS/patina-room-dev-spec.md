# Patina Room System — Development Specification

**Feature Module · Claude Code Build Plan**
**April 2026 · Internal Working Document**

---

## Preamble

This spec covers the complete Room System feature: scanning, creating, naming, populating, managing items within and across rooms, budget tracking, spatial context generation, and the designer hand-off. It extends the v4 iOS dev spec (Sprints 5 and 8) with the full room lifecycle defined in the Room System design document (`patina-room-system.html`).

### Dependencies

This module requires the following to be built first (from v4 dev spec):

- **Sprint 1:** Design System + Companion shell
- **Sprint 2:** Auth (Supabase session required for room ownership)
- **Sprint 3:** Style Quiz (style_profiles needed for recommendation matching)
- **Sprint 4:** Home + Companion navigation (AppRouter for room screen transitions)

### Hard Constraints

| Constraint | Reality |
|---|---|
| **RoomPlan** | Requires LiDAR: iPhone 12 Pro+, iPad Pro. Graceful fallback mandatory. |
| **Scan limits** | 16 object categories, ≤5 min sessions, ≤30×30 ft rooms, ≥50 lux, no ceilings |
| **Scan storage** | USD/USDZ files → Cloudflare R2. Metadata → PostgreSQL JSONB. |
| **Behavioral batch** | Client-side event queue → API every 30 seconds |
| **Spatial context text** | Generated server-side from room dimensions + product dimensions |
| **Budget data** | Derived from `SUM(products.price_cents)` in room_compositions, not stored separately |

---

## File Structure

```
Features/
├── Rooms/
│   ├── RoomsFeature.swift              # Feature entry point, dependency injection
│   │
│   ├── Gallery/
│   │   ├── RoomGalleryView.swift       # "Your Spaces" master gallery
│   │   ├── RoomGalleryViewModel.swift  # Room list state, cross-room summary
│   │   ├── RoomCardView.swift          # Individual room card (image, stats, badge)
│   │   └── CrossRoomSummaryBar.swift   # "Whole Home" top bar
│   │
│   ├── Create/
│   │   ├── CreateRoomSheet.swift       # Bottom sheet: Scan vs Manual
│   │   ├── RoomNamingView.swift        # Name input + room type selector
│   │   ├── ManualEntryView.swift       # Non-LiDAR: type, dims, windows, orientation
│   │   └── CreateRoomViewModel.swift   # Creation flow state machine
│   │
│   ├── Scan/
│   │   ├── RoomScanView.swift          # Camera view with coaching overlay
│   │   ├── RoomScanViewModel.swift     # RoomPlan session management
│   │   ├── ScanCoachingOverlay.swift   # Floating text + particles + progress
│   │   ├── PreScanChecklist.swift      # Lighting/path/clutter checklist
│   │   ├── FloorPlanPreview.swift      # Post-scan review with metrics
│   │   └── ScanErrorHandler.swift      # Poor light, complex room, etc.
│   │
│   ├── Detail/
│   │   ├── RoomDetailView.swift        # Room as project (populated + empty)
│   │   ├── RoomDetailViewModel.swift   # Room data, items, budget, spatial
│   │   ├── RoomItemRow.swift           # Product row with AR badge + actions
│   │   ├── RoomBudgetBar.swift         # Budget tracker (total vs range)
│   │   ├── RoomSpatialInfo.swift       # Dimensions, orientation, windows
│   │   ├── RoomSuggestedNext.swift     # "A rug would ground the arrangement"
│   │   └── RoomSettingsView.swift      # Rename, re-scan, share, delete
│   │
│   ├── CrossRoom/
│   │   ├── CrossRoomView.swift         # All items across all rooms
│   │   ├── CrossRoomViewModel.swift    # Aggregated data, tab state
│   │   ├── CrossRoomItemRow.swift      # Item with room color-tag
│   │   └── CrossRoomCoherence.swift    # Style harmony score display
│   │
│   ├── ItemManagement/
│   │   ├── AddToRoomSheet.swift        # Half-sheet: select room for product
│   │   ├── MoveItemSheet.swift         # Move or copy between rooms
│   │   ├── ItemActionMenu.swift        # Long-press context menu (⋯)
│   │   └── ItemManagementService.swift # CRUD operations for room items
│   │
│   ├── SpatialContext/
│   │   ├── SpatialContextService.swift # Generates "why it fits" text
│   │   └── SpatialContextModels.swift  # DimensionFit, LightingFit, PairingFit
│   │
│   └── Models/
│       ├── Room.swift                  # Core room model
│       ├── RoomScanData.swift          # RoomPlan output structures
│       ├── RoomComposition.swift       # Products in room
│       ├── RoomBudget.swift            # Computed budget state
│       └── SpatialContext.swift        # Per-product room context
```

---

## Data Models

### Swift Models

```swift
// Room.swift
struct Room: Identifiable, Codable {
    let id: UUID
    let userId: UUID
    var name: String
    var roomType: RoomType
    var scanSource: ScanSource
    var dimensions: RoomDimensions?
    var features: RoomFeatures?
    var scanDataURL: URL?           // R2 URL for USD/USDZ file
    var thumbnailURL: URL?          // R2 URL for scan preview image
    var confidence: Float?          // 0.0–1.0, from RoomPlan
    let createdAt: Date
    var updatedAt: Date

    // Computed on client from room_compositions join
    var items: [RoomItem] = []
    var budget: RoomBudget?
    var newPicksCount: Int = 0
}

enum RoomType: String, Codable, CaseIterable {
    case living, bedroom, office, dining, kitchen, bathroom, other
    
    var displayName: String {
        switch self {
        case .living: return "Living Room"
        case .bedroom: return "Bedroom"
        case .office: return "Office"
        case .dining: return "Dining Room"
        case .kitchen: return "Kitchen"
        case .bathroom: return "Bathroom"
        case .other: return "Other"
        }
    }
    
    var icon: String {
        switch self {
        case .living: return "🛋"
        case .bedroom: return "🛏"
        case .office: return "💻"
        case .dining: return "🍽"
        case .kitchen: return "🍳"
        case .bathroom: return "🛁"
        case .other: return "⌂"
        }
    }
}

enum ScanSource: String, Codable {
    case lidar     // Full RoomPlan scan
    case manual    // User-entered dimensions
}

struct RoomDimensions: Codable {
    var length: Float    // feet
    var width: Float     // feet
    var height: Float    // feet (default 8.0)
    var area: Float      // computed: length × width
    var unit: String     // "feet" or "meters"
    
    var areaFormatted: String {
        "\(Int(area)) sq ft"
    }
}

struct RoomFeatures: Codable {
    var windowCount: Int
    var doorCount: Int
    var orientation: RoomOrientation?    // computed from RoomPlan or user-selected
    var lightingCondition: LightingCondition?
    var detectedObjects: [DetectedObject]?
    var hasFireplace: Bool?
    var floorType: String?               // "hardwood", "carpet", "tile", etc.
}

enum RoomOrientation: String, Codable, CaseIterable {
    case north, south, east, west,
         northEast, northWest, southEast, southWest
    
    var displayName: String {
        switch self {
        case .north: return "North-facing"
        case .south: return "South-facing"
        case .east: return "East-facing"
        case .west: return "West-facing"
        case .northEast: return "Northeast"
        case .northWest: return "Northwest"
        case .southEast: return "Southeast"
        case .southWest: return "Southwest"
        }
    }
    
    var lightDescription: String {
        switch self {
        case .south: return "Strong natural light throughout the day"
        case .north: return "Soft, consistent indirect light"
        case .east: return "Bright morning light, softer afternoons"
        case .west: return "Warm golden afternoon and evening light"
        default: return "Mixed natural light"
        }
    }
}

enum LightingCondition: String, Codable {
    case brightNatural, moderateNatural, lowNatural, artificial
}

struct DetectedObject: Codable {
    let type: String         // RoomPlan category: "sofa", "table", "chair", etc.
    let position: SIMD3<Float>?
    let dimensions: SIMD3<Float>?  // w, h, d in meters
    let confidence: Float
}
```

```swift
// RoomItem.swift — A product placed in a room
struct RoomItem: Identifiable, Codable {
    let id: UUID
    let roomId: UUID
    let productId: Int
    let addedAt: Date
    let source: RoomItemSource
    
    // Joined from products table
    var product: Product?
    // Joined from spatial_context table
    var spatialContext: SpatialContext?
}

enum RoomItemSource: String, Codable {
    case feed           // Added from Daily Room feed
    case productDetail  // Added from product detail screen
    case arPlacement    // Saved from AR session
    case crossRoom      // Copied from another room
    case designer       // Added by designer recommendation
}
```

```swift
// RoomBudget.swift — Computed, not stored
struct RoomBudget {
    let totalCents: Int
    let itemCount: Int
    let userBudgetMin: Int     // From style_profiles.budget_range_min
    let userBudgetMax: Int     // From style_profiles.budget_range_max
    
    var totalFormatted: String {
        "$\(totalCents / 100)"
    }
    
    var percentOfRange: Float {
        guard userBudgetMax > 0 else { return 0 }
        return Float(totalCents) / Float(userBudgetMax * 100)
    }
    
    var budgetState: BudgetState {
        switch percentOfRange {
        case ..<0.5: return .building
        case 0.5..<1.0: return .approaching
        case 1.0..<1.5: return .atBudget
        default: return .overBudget
        }
    }
}

enum BudgetState {
    case building       // <50% — no bar shown
    case approaching    // 50–99% — subtle bar
    case atBudget       // 100% — "You're at your budget"
    case overBudget     // >150% — Companion nudges designer
}
```

```swift
// SpatialContext.swift — "Why it fits" per product×room
struct SpatialContext: Codable {
    let productId: Int
    let roomId: UUID
    let dimensionFit: String?    // "108" fits your long wall with 18" clearance"
    let lightingFit: String?     // "South-facing light will warm this walnut grain"
    let pairingFit: PairingContext?
    
    struct PairingContext: Codable {
        let pairedProductId: Int
        let pairedProductName: String
        let reason: String       // "matched wood tones"
    }
}
```

### PostgreSQL Schema

Extends the Phase 1 data model with room system tables:

```sql
-- ============================================
-- ROOMS (updated from Phase 1)
-- ============================================
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    room_type VARCHAR(30) NOT NULL DEFAULT 'other',
    scan_source VARCHAR(10) NOT NULL DEFAULT 'manual',  -- 'lidar' | 'manual'
    
    -- Spatial data
    dimensions JSONB,
    -- { length: 18.5, width: 14.0, height: 8.0, area: 259.0, unit: "feet" }
    
    features JSONB,
    -- { windowCount: 2, doorCount: 1, orientation: "south",
    --   lightingCondition: "bright_natural", detectedObjects: [...],
    --   hasFireplace: false, floorType: "hardwood" }
    
    -- Scan files
    scan_data_url TEXT,           -- R2: rooms/{room_id}/scan.usdz
    thumbnail_url TEXT,           -- R2: rooms/{room_id}/thumb.jpg
    scan_quality FLOAT,           -- 0.0–1.0 from RoomPlan confidence
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_rooms_user ON rooms(user_id, created_at DESC);

-- ============================================
-- ROOM ITEMS (products placed in rooms)
-- ============================================
CREATE TABLE room_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE NOT NULL,
    product_id INT REFERENCES products(id) NOT NULL,
    user_id UUID REFERENCES users(id) NOT NULL,
    source VARCHAR(30) NOT NULL DEFAULT 'feed',
        -- 'feed', 'product_detail', 'ar_placement', 'cross_room', 'designer'
    added_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(room_id, product_id)  -- No duplicate products in same room
);

CREATE INDEX idx_room_items_room ON room_items(room_id, added_at DESC);
CREATE INDEX idx_room_items_user ON room_items(user_id);

-- ============================================
-- SPATIAL CONTEXT (pre-generated "why it fits")
-- ============================================
CREATE TABLE spatial_context (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id INT REFERENCES products(id) NOT NULL,
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE NOT NULL,
    dimension_fit TEXT,           -- "108" fits your long wall with 18" clearance"
    lighting_fit TEXT,            -- "South-facing light will warm this walnut grain"
    pairing_product_id INT,      -- paired product reference
    pairing_product_name VARCHAR(200),
    pairing_reason TEXT,         -- "matched wood tones"
    generated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(product_id, room_id)
);

CREATE INDEX idx_spatial_product_room ON spatial_context(product_id, room_id);

-- ============================================
-- ROOM COMPOSITIONS (updated from Phase 1)
-- kept for backward compat with recommendation engine
-- ============================================
-- room_compositions already exists in Phase 1 schema
-- room_items is the user-facing table
-- room_compositions is the engine-facing table (auto-generated groups)
-- They will converge: room_items = manual adds, room_compositions = engine groups

-- ============================================
-- USER ROOM ENGAGEMENT (from data architecture)
-- ============================================
CREATE TABLE user_room_engagement (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) NOT NULL,
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE NOT NULL,
    total_dwell_ms BIGINT DEFAULT 0,
    session_count INT DEFAULT 0,
    products_viewed INT DEFAULT 0,
    products_added INT DEFAULT 0,
    products_saved INT DEFAULT 0,
    last_active TIMESTAMP,
    primary_category VARCHAR(50),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, room_id)
);

CREATE INDEX idx_ure_user ON user_room_engagement(user_id, last_active DESC);
```

---

## RoomPlan Integration

### Scan Manager

```swift
// RoomScanViewModel.swift
import RoomPlan
import Combine

class RoomScanViewModel: NSObject, ObservableObject, RoomCaptureSessionDelegate {
    
    // Published state
    @Published var scanState: ScanState = .ready
    @Published var progress: Float = 0.0
    @Published var coachingText: String = "Let's walk your room together"
    @Published var capturedRoom: CapturedRoom?
    @Published var error: ScanError?
    
    // Private
    private var session: RoomCaptureSession?
    private var startTime: Date?
    private var wallsDetected: Int = 0
    
    // MARK: — Lifecycle
    
    func startScanning() {
        guard RoomScanViewModel.isLiDARAvailable else {
            error = .noLiDAR
            return
        }
        
        session = RoomCaptureSession()
        session?.delegate = self
        
        let config = RoomCaptureSession.Configuration()
        config.isCoachingEnabled = false  // We provide custom coaching
        
        startTime = Date()
        scanState = .scanning
        session?.run(configuration: config)
        
        Analytics.track("room_scan_started", properties: [
            "device_model": UIDevice.current.model,
            "lighting": measureAmbientLight()
        ])
    }
    
    func stopScanning() {
        session?.stop()
    }
    
    // MARK: — LiDAR Check
    
    static var isLiDARAvailable: Bool {
        ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)
    }
    
    // MARK: — RoomCaptureSessionDelegate
    
    func captureSession(_ session: RoomCaptureSession,
                        didUpdate room: CapturedRoom) {
        // Update progress based on detected surfaces
        let surfaces = room.walls.count + room.windows.count + room.doors.count
        let estimatedTotal = max(surfaces, 4)  // Assume at least 4 walls
        progress = min(Float(surfaces) / Float(estimatedTotal + 2), 0.95)
        
        // Update coaching text
        updateCoaching(progress: progress, room: room)
        
        // Haptic on new wall detection
        if room.walls.count > wallsDetected {
            wallsDetected = room.walls.count
            HapticEngine.shared.lightImpact()
        }
    }
    
    func captureSession(_ session: RoomCaptureSession,
                        didEndWith data: CapturedRoomData, error: Error?) {
        if let error = error {
            self.error = .scanFailed(error.localizedDescription)
            scanState = .failed
            return
        }
        
        // Process the final room
        Task {
            do {
                let finalRoom = try data.finalResults
                await MainActor.run {
                    self.capturedRoom = finalRoom
                    self.progress = 1.0
                    self.scanState = .complete
                }
            } catch {
                await MainActor.run {
                    self.error = .processingFailed
                    self.scanState = .failed
                }
            }
        }
        
        let duration = Date().timeIntervalSince(startTime ?? Date())
        Analytics.track("room_scan_completed", properties: [
            "duration_seconds": duration,
            "walls_detected": wallsDetected,
            "scan_quality": progress
        ])
    }
    
    // MARK: — Coaching
    
    private func updateCoaching(progress: Float, room: CapturedRoom) {
        switch progress {
        case 0..<0.15:
            coachingText = "Start with this corner"
        case 0.15..<0.3:
            coachingText = "Good — now turn slowly"
        case 0.3..<0.5:
            coachingText = "Step toward the window"
        case 0.5..<0.7:
            coachingText = "Capturing the details"
        case 0.7..<0.85:
            coachingText = "Almost there — one more corner"
        case 0.85...:
            coachingText = "Beautiful — finishing up"
        default:
            break
        }
    }
    
    // MARK: — Data Extraction
    
    func extractRoomData() -> RoomScanResult? {
        guard let room = capturedRoom else { return nil }
        
        // Convert RoomPlan CapturedRoom to our model
        let dimensions = RoomDimensions(
            length: metersToFeet(room.floors.first?.dimensions.x ?? 0),
            width: metersToFeet(room.floors.first?.dimensions.z ?? 0),
            height: metersToFeet(room.walls.first?.dimensions.y ?? 2.4),
            area: 0,  // computed
            unit: "feet"
        )
        
        let features = RoomFeatures(
            windowCount: room.windows.count,
            doorCount: room.doors.count,
            orientation: estimateOrientation(),
            lightingCondition: estimateLighting(),
            detectedObjects: room.objects.map { obj in
                DetectedObject(
                    type: obj.category.rawValue,
                    position: obj.position,
                    dimensions: obj.dimensions,
                    confidence: obj.confidence
                )
            },
            hasFireplace: nil,
            floorType: nil
        )
        
        return RoomScanResult(
            dimensions: dimensions,
            features: features,
            confidence: progress,
            capturedRoom: room
        )
    }
    
    private func metersToFeet(_ meters: Float) -> Float {
        meters * 3.28084
    }
}

enum ScanState {
    case ready, scanning, complete, failed
}

enum ScanError: LocalizedError {
    case noLiDAR
    case poorLighting
    case roomTooLarge
    case scanFailed(String)
    case processingFailed
    
    var errorDescription: String? {
        switch self {
        case .noLiDAR:
            return "Your device doesn't have a depth sensor"
        case .poorLighting:
            return "Let's brighten things up a bit"
        case .roomTooLarge:
            return "Large space! Let's focus on one area"
        case .scanFailed(let msg):
            return msg
        case .processingFailed:
            return "Something went wrong processing your room"
        }
    }
    
    var recoverySuggestion: String? {
        switch self {
        case .noLiDAR:
            return "You can still add rooms manually with dimensions."
        case .poorLighting:
            return "Try turning on more lights or opening curtains."
        case .roomTooLarge:
            return "Try scanning one section at a time."
        default:
            return "Tap to try again."
        }
    }
}
```

### Scan File Upload

```swift
// RoomUploadService.swift
class RoomUploadService {
    
    /// Exports CapturedRoom to USDZ, uploads to R2, returns URLs
    func uploadScan(roomId: UUID, capturedRoom: CapturedRoom) async throws -> ScanURLs {
        
        // 1. Export to USDZ
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(roomId.uuidString).usdz")
        try capturedRoom.export(to: tempURL)
        
        // 2. Generate thumbnail
        let thumbnailData = try generateThumbnail(from: capturedRoom)
        
        // 3. Upload USDZ to R2 via presigned URL
        let scanUploadURL = try await APIClient.shared.get(
            "/api/rooms/\(roomId)/upload-url?type=scan"
        ) as PresignedURL
        
        let scanData = try Data(contentsOf: tempURL)
        try await uploadToR2(data: scanData, url: scanUploadURL.url)
        
        // 4. Upload thumbnail to R2
        let thumbUploadURL = try await APIClient.shared.get(
            "/api/rooms/\(roomId)/upload-url?type=thumbnail"
        ) as PresignedURL
        
        try await uploadToR2(data: thumbnailData, url: thumbUploadURL.url)
        
        // 5. Clean up temp file
        try? FileManager.default.removeItem(at: tempURL)
        
        return ScanURLs(
            scanURL: scanUploadURL.publicURL,
            thumbnailURL: thumbUploadURL.publicURL
        )
    }
}
```

---

## Room CRUD Operations

### Create Room Flow

```swift
// CreateRoomViewModel.swift
class CreateRoomViewModel: ObservableObject {
    @Published var step: CreateStep = .chooseMethod
    @Published var name: String = ""
    @Published var roomType: RoomType = .living
    @Published var scanResult: RoomScanResult?
    @Published var manualDimensions = RoomDimensions(
        length: 0, width: 0, height: 8.0, area: 0, unit: "feet"
    )
    @Published var manualFeatures = RoomFeatures(
        windowCount: 1, doorCount: 1, orientation: nil,
        lightingCondition: nil, detectedObjects: nil,
        hasFireplace: nil, floorType: nil
    )
    @Published var isCreating = false
    @Published var createdRoom: Room?
    
    enum CreateStep {
        case chooseMethod   // Scan vs Manual sheet
        case scanning       // RoomPlan active
        case floorPlan      // Post-scan review
        case naming         // Name + type input
        case manualEntry    // Dimensions form
        case creating       // API call in flight
    }
    
    // Validation
    var canSaveName: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty
    }
    
    var canSaveManual: Bool {
        manualDimensions.length > 0 && manualDimensions.width > 0
    }
    
    // MARK: — Create Room
    
    func createRoom() async {
        isCreating = true
        
        do {
            // 1. Create room record
            let room: Room = try await APIClient.shared.post(
                "/api/rooms",
                body: CreateRoomRequest(
                    name: name,
                    roomType: roomType.rawValue,
                    scanSource: scanResult != nil ? "lidar" : "manual",
                    dimensions: scanResult?.dimensions ?? manualDimensions,
                    features: scanResult?.features ?? manualFeatures,
                    confidence: scanResult?.confidence
                )
            )
            
            // 2. Upload scan files if LiDAR scan
            if let scan = scanResult, let captured = scan.capturedRoom {
                let urls = try await RoomUploadService()
                    .uploadScan(roomId: room.id, capturedRoom: captured)
                
                // 3. Update room with file URLs
                let _: Room = try await APIClient.shared.patch(
                    "/api/rooms/\(room.id)",
                    body: ["scan_data_url": urls.scanURL,
                           "thumbnail_url": urls.thumbnailURL]
                )
            }
            
            // 4. Trigger spatial context generation for this room
            try await APIClient.shared.post(
                "/api/rooms/\(room.id)/generate-context",
                body: EmptyBody()
            )
            
            await MainActor.run {
                createdRoom = room
                isCreating = false
            }
            
            Analytics.track("room_created", properties: [
                "room_type": roomType.rawValue,
                "scan_source": scanResult != nil ? "lidar" : "manual",
                "name_length": name.count,
                "has_scan": scanResult != nil
            ])
            
        } catch {
            await MainActor.run { isCreating = false }
        }
    }
}
```

### Room Detail ViewModel

```swift
// RoomDetailViewModel.swift
class RoomDetailViewModel: ObservableObject {
    @Published var room: Room
    @Published var items: [RoomItem] = []
    @Published var budget: RoomBudget?
    @Published var suggestedNext: String?
    @Published var isLoading = true
    
    private let roomId: UUID
    
    init(roomId: UUID, room: Room) {
        self.roomId = roomId
        self.room = room
    }
    
    func load() async {
        do {
            // Fetch room with items and spatial context
            let detail: RoomDetailResponse = try await APIClient.shared.get(
                "/api/rooms/\(roomId)/detail"
            )
            
            await MainActor.run {
                self.room = detail.room
                self.items = detail.items
                self.budget = detail.budget
                self.suggestedNext = detail.suggestedNext
                self.isLoading = false
            }
        } catch {
            await MainActor.run { isLoading = false }
        }
    }
    
    // MARK: — Item Management
    
    func removeItem(_ item: RoomItem) async {
        do {
            try await APIClient.shared.delete(
                "/api/rooms/\(roomId)/items/\(item.id)"
            )
            await MainActor.run {
                items.removeAll { $0.id == item.id }
                recalculateBudget()
            }
            Analytics.track("room_item_removed", properties: [
                "room_id": roomId.uuidString,
                "product_id": item.productId
            ])
        } catch { }
    }
    
    func moveItem(_ item: RoomItem, to destinationRoomId: UUID) async {
        do {
            try await APIClient.shared.post(
                "/api/rooms/items/move",
                body: MoveItemRequest(
                    itemId: item.id,
                    fromRoomId: roomId,
                    toRoomId: destinationRoomId
                )
            )
            await MainActor.run {
                items.removeAll { $0.id == item.id }
                recalculateBudget()
            }
            Analytics.track("room_item_moved", properties: [
                "from_room": roomId.uuidString,
                "to_room": destinationRoomId.uuidString,
                "product_id": item.productId
            ])
        } catch { }
    }
    
    func copyItem(_ item: RoomItem, to destinationRoomId: UUID) async {
        do {
            let _: RoomItem = try await APIClient.shared.post(
                "/api/rooms/items/copy",
                body: CopyItemRequest(
                    productId: item.productId,
                    fromRoomId: roomId,
                    toRoomId: destinationRoomId
                )
            )
            Analytics.track("room_item_copied", properties: [
                "from_room": roomId.uuidString,
                "to_room": destinationRoomId.uuidString,
                "product_id": item.productId
            ])
        } catch { }
    }
    
    // MARK: — Budget
    
    private func recalculateBudget() {
        let total = items.compactMap { $0.product?.priceCents }.reduce(0, +)
        // budget_range from style_profiles, cached in AppState
        let profile = AppState.shared.styleProfile
        budget = RoomBudget(
            totalCents: total,
            itemCount: items.count,
            userBudgetMin: profile?.budgetRangeMin ?? 0,
            userBudgetMax: profile?.budgetRangeMax ?? 0
        )
    }
    
    // MARK: — Companion State
    
    var companionState: CompanionState {
        if items.isEmpty {
            return .nudging(label: "Browse picks →", action: .viewRecommendations)
        }
        if let budget = budget, budget.budgetState == .overBudget {
            return .nudging(label: "Talk to a designer →", action: .talkToDesigner)
        }
        return .resting
    }
}
```

### Add to Room (From Any Entry Point)

```swift
// ItemManagementService.swift
class ItemManagementService {
    static let shared = ItemManagementService()
    
    /// Add a product to a room — called from feed, product detail, or AR
    func addProduct(
        _ productId: Int,
        toRoom roomId: UUID,
        source: RoomItemSource
    ) async throws -> RoomItem {
        
        let item: RoomItem = try await APIClient.shared.post(
            "/api/rooms/\(roomId)/items",
            body: AddRoomItemRequest(
                productId: productId,
                source: source.rawValue
            )
        )
        
        // Fire haptic
        await MainActor.run {
            HapticEngine.shared.mediumImpact()
        }
        
        Analytics.track("product_added_to_room", properties: [
            "room_id": roomId.uuidString,
            "product_id": productId,
            "source": source.rawValue
        ])
        
        return item
    }
    
    /// Get all rooms for the add-to-room sheet
    func getRoomsForPicker() async throws -> [RoomPickerItem] {
        let rooms: [Room] = try await APIClient.shared.get("/api/rooms")
        return rooms.map { room in
            RoomPickerItem(
                id: room.id,
                name: room.name,
                roomType: room.roomType,
                thumbnailURL: room.thumbnailURL,
                itemCount: room.items.count,
                areaFormatted: room.dimensions?.areaFormatted ?? "—"
            )
        }
    }
}
```

---

## API Contracts

### Room CRUD

```
POST /api/rooms
Body: {
  name: "Living Room",
  room_type: "living",
  scan_source: "lidar",
  dimensions: { length: 18.5, width: 14.0, height: 8.0, area: 259.0, unit: "feet" },
  features: {
    windowCount: 2, doorCount: 1, orientation: "south",
    lightingCondition: "bright_natural",
    detectedObjects: [
      { type: "sofa", position: [2.1,0,3.2], dimensions: [2.0,0.8,0.9], confidence: 0.92 }
    ]
  },
  confidence: 0.92
}
Response: { id, name, room_type, scan_source, dimensions, features, created_at }

GET /api/rooms
Response: [{ id, name, room_type, dimensions, thumbnail_url, item_count, budget_total_cents, avg_match, new_picks_count }]

GET /api/rooms/{id}/detail
Response: {
  room: { ...full room object },
  items: [{
    id, room_id, product_id, added_at, source,
    product: { id, name, price_cents, maker_name, image_url, usdz_url, match_score },
    spatial_context: { dimension_fit, lighting_fit, pairing: { product_name, reason } }
  }],
  budget: { total_cents, item_count, user_budget_min, user_budget_max },
  suggested_next: "A rug would ground the arrangement.",
  new_picks_count: 6
}

PATCH /api/rooms/{id}
Body: { name?, room_type?, scan_data_url?, thumbnail_url? }
Response: { ...updated room }

DELETE /api/rooms/{id}
Response: { deleted: true }
```

### Room Items

```
POST /api/rooms/{id}/items
Body: { product_id: 42, source: "feed" }
Response: { id, room_id, product_id, added_at, source }

DELETE /api/rooms/{room_id}/items/{item_id}
Response: { deleted: true }

POST /api/rooms/items/move
Body: { item_id: "uuid", from_room_id: "uuid", to_room_id: "uuid" }
Response: { moved: true, new_item_id: "uuid" }

POST /api/rooms/items/copy
Body: { product_id: 42, from_room_id: "uuid", to_room_id: "uuid" }
Response: { id, room_id, product_id, added_at, source: "cross_room" }
```

### Cross-Room

```
GET /api/rooms/cross-room
Response: {
  summary: { room_count: 3, total_items: 14, total_budget_cents: 858300 },
  items: [{
    id, product_id, room_id, room_name, room_type,
    product: { name, maker_name, price_cents, image_url },
    added_at
  }],
  style_coherence: {
    score: 0.82,
    description: "Your rooms share natural materials and warm tones"
  }
}
```

### Scan Upload

```
GET /api/rooms/{id}/upload-url?type=scan|thumbnail
Response: {
  url: "https://r2.patina.cloud/presigned/...",    // PUT target
  public_url: "https://cdn.patina.cloud/rooms/..."  // Read URL
}
```

### Spatial Context Generation

```
POST /api/rooms/{id}/generate-context
— Triggers server-side job that:
  1. Loads room dimensions + features
  2. Loads top 50 recommended products for this room
  3. Generates spatial_context text for each (product, room) pair
  4. Stores in spatial_context table
Response: { generated: 42, room_id: "uuid" }
```

---

## Spatial Context Generation (Server-Side)

The "why it fits" text is generated by a template engine on the FastAPI sidecar:

```python
# spatial_context_generator.py

def generate_context(room: dict, product: dict) -> dict:
    context = {}
    
    # Dimension fit
    if product.get("dimensions") and room.get("dimensions"):
        product_width_in = product["dimensions"].get("width_inches", 0)
        room_length_ft = room["dimensions"]["length"]
        room_width_ft = room["dimensions"]["width"]
        
        # Find best wall
        long_wall_in = max(room_length_ft, room_width_ft) * 12
        clearance = long_wall_in - product_width_in
        
        if clearance > 24:  # >2ft clearance on each side
            side_clearance = (clearance / 2)
            context["dimension_fit"] = (
                f'{product_width_in}" fits your long wall '
                f'with {int(side_clearance)}" clearance on each side'
            )
        elif clearance > 0:
            context["dimension_fit"] = "Snug fit — consider measuring first"
    
    # Lighting fit
    orientation = room.get("features", {}).get("orientation")
    materials = product.get("material_tags", [])
    
    if orientation == "south" and "wood" in materials:
        wood_type = next((m for m in materials if m != "wood"), "wood")
        context["lighting_fit"] = (
            f"South-facing light will warm this {wood_type} grain "
            f"beautifully in afternoon"
        )
    elif orientation == "west" and "linen" in materials:
        context["lighting_fit"] = (
            "Linen breathes with your east-west airflow — "
            "stays cool summer, warm winter"
        )
    elif orientation == "north":
        context["lighting_fit"] = (
            "Soft north light brings out texture without harsh shadows"
        )
    
    # Pairing fit (from designer_feedback.pairing_product_id)
    # Checked against existing room_items
    
    return context
```

---

## Analytics Events — Room System

| Event | Properties | Trigger |
|---|---|---|
| `room_created` | room_type, scan_source, name_length, has_scan | Room saved to API |
| `room_scan_started` | device_model, lighting | RoomPlan session begins |
| `room_scan_completed` | duration_seconds, walls_detected, scan_quality | RoomPlan session ends |
| `room_scan_failed` | error_type, duration_seconds | Scan error |
| `room_scan_retried` | previous_error_type | User taps rescan |
| `room_named` | room_type, name_length, used_suggested_name | Name saved |
| `room_viewed` | room_id, item_count, budget_total | Room detail opened |
| `room_item_added` | room_id, product_id, source, feed_position | Product added to room |
| `room_item_removed` | room_id, product_id | Product removed |
| `room_item_moved` | from_room, to_room, product_id | Item moved |
| `room_item_copied` | from_room, to_room, product_id | Item copied |
| `room_gallery_viewed` | room_count, total_items | Gallery opened |
| `room_channel_switched` | from_room, to_room, time_in_previous_ms | Daily Room chip tap |
| `room_settings_opened` | room_id | Settings gear tapped |
| `room_renamed` | room_id, old_name, new_name | Name changed |
| `room_rescanned` | room_id, items_preserved | Re-scan completed |
| `room_deleted` | room_id, item_count_at_delete | Room deleted |
| `room_shared_with_designer` | room_id, item_count, budget_total | Share CTA tapped |
| `cross_room_viewed` | room_count, total_items, tab_selected | Cross-room opened |
| `room_budget_threshold` | room_id, budget_state, total_cents | Budget bar state change |
| `manual_room_created` | room_type, dimensions | Non-LiDAR room saved |
| `add_to_room_sheet_opened` | product_id, source_screen | Sheet presented |
| `add_to_room_sheet_dismissed` | product_id, time_open_ms | Sheet dismissed without action |
| `item_action_menu_opened` | product_id, room_id | ⋯ menu tapped |

---

## Error Handling

| Scenario | Detection | User Message | Recovery |
|---|---|---|---|
| No LiDAR | `ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)` returns false | "Your device doesn't have a depth sensor" | Offer manual entry path |
| Poor lighting | Ambient light < 50 lux (from ARFrame.lightEstimate) | "Let's brighten things up a bit" | Torch toggle + pause |
| Room too large | RoomPlan detects > ~30ft span | "Large space! Let's focus on one area" | Section-by-section suggestion |
| Fast movement | RoomPlan coaching delegate signals motion too fast | "Slow down a bit" | Speed indicator on screen |
| Feature loss | RoomPlan loses tracking | "Point at a textured surface" | Visual guide overlay |
| Scan timeout | Session > 5 minutes | "Let's wrap up — we have enough" | Auto-finalize |
| Upload failed | R2 presigned URL fails or network error | "Your scan is saved locally" | Retry queue, background upload |
| Duplicate product | `UNIQUE(room_id, product_id)` violation | "Already in this room" | Show toast, no error screen |
| Room limit | User creates > 10 rooms (Phase 1 soft limit) | "You're building quite the home!" | Allow but log for monitoring |

---

## Build Sequence

This room system maps to **Sprints 5 and 8** from the v4 dev spec, expanded:

### Sprint 5a (Week 1): Scan + Floor Plan

- [ ] `RoomScanViewModel` with RoomPlan integration
- [ ] `ScanCoachingOverlay` with Companion Journey Mode
- [ ] `PreScanChecklist` screen
- [ ] `FloorPlanPreview` with confidence badge and metrics
- [ ] LiDAR detection and non-LiDAR gate
- [ ] Scan file export to USDZ + R2 upload via presigned URL
- [ ] `POST /api/rooms` endpoint
- [ ] Acceptance: RoomPlan runs, coaching text updates, floor plan renders

### Sprint 5b (Week 2): Create + Name + Manual

- [ ] `CreateRoomSheet` (Scan vs Manual)
- [ ] `RoomNamingView` with Playfair input + type chips
- [ ] `ManualEntryView` (dimensions, windows, orientation)
- [ ] Full create flow: choose method → scan/manual → name → save
- [ ] Room created in DB with correct scan_source
- [ ] Acceptance: Both paths create functional rooms

### Sprint 8a (Week 1): Room Detail + Item Management

- [ ] `RoomDetailView` (populated + empty states)
- [ ] `RoomItemRow` with AR badge and ⋯ menu
- [ ] `RoomBudgetBar` with threshold states
- [ ] `RoomSpatialInfo` metadata display
- [ ] `AddToRoomSheet` callable from feed, product detail, AR
- [ ] `ItemActionMenu` (view AR, move, copy, remove, find similar)
- [ ] `ItemManagementService` CRUD operations
- [ ] All room item API endpoints functional
- [ ] Acceptance: Can add, view, remove, move items between rooms

### Sprint 8b (Week 2): Gallery + Cross-Room + Settings

- [ ] `RoomGalleryView` with room cards, stats, new-pick badges
- [ ] `CrossRoomSummaryBar` (whole home totals)
- [ ] `CrossRoomView` with tabs (All Items, By Category, By Maker)
- [ ] `MoveItemSheet` (move vs copy + room picker)
- [ ] `RoomSettingsView` (rename, re-scan, share, delete)
- [ ] Re-scan flow (preserves items, updates spatial data)
- [ ] Gallery empty state (first room CTA)
- [ ] `GET /api/rooms/cross-room` endpoint
- [ ] Acceptance: Full room lifecycle works end-to-end

### Sprint 8c (Ongoing): Spatial Context Integration

- [ ] `spatial_context_generator.py` on FastAPI sidecar
- [ ] `POST /api/rooms/{id}/generate-context` triggers generation
- [ ] Context text appears on Daily Room feed product cards
- [ ] Context text appears in Room Detail item list
- [ ] Pairing suggestions use `designer_feedback.pairing_product_id`
- [ ] Context regenerates on re-scan
- [ ] Acceptance: "Why it fits" text renders with real room data

---

## Success Metrics

| Metric | Target | Measurement |
|---|---|---|
| Scan completion rate | >80% of scan starts | `room_scan_completed / room_scan_started` |
| Scan duration | <5 minutes avg | `room_scan_completed.duration_seconds` |
| Manual entry adoption | <30% of rooms (LiDAR preferred) | `room_created.scan_source` distribution |
| Items per room avg | >3 within 7 days of creation | `room_items` count per room after 7d |
| Add-to-room conversion | >15% of feed impressions | `room_item_added / product_dwell (>3s)` |
| Cross-room usage | >40% of multi-room users | `cross_room_viewed` unique users / users with 2+ rooms |
| Budget threshold → designer | >20% of rooms hitting threshold | `room_budget_threshold.overBudget` → `room_shared_with_designer` |
| Room deletion rate | <10% | `room_deleted / room_created` |
| Re-scan rate | <5% (quality should be high) | `room_rescanned / room_created` |

---

*The room is the project. The project is the lead. Build the room system and you build the lead pipeline.*

---

**Document Version:** 1.0
**Last Updated:** April 2026
**Design Reference:** `patina-room-system.html`
**Architecture Reference:** `patina-data-architecture.md`
**Parent Spec:** `patina-ios-dev-spec.md` (Sprints 5 + 8)
