//  WorkMocks.swift
//  CaptureKitMocks
//
//  Mock conformers for the Phase 2 designer/pro seams (Projects, Leads, Decisions,
//  Messaging, Receiving, PortalAuth, SiteScan) plus `WorkFixtures` — the stable
//  ids + sample QR payload the deep-link harness drives. Field-instrument-plausible
//  fixtures (real-ish projects/POs/decisions) so every W/P/L/D/M/G/Q/F screen
//  renders on the simulator without network. Wired by AppContainer in mock mode;
//  wave agents also use these behind their factories until the real services land.

import Foundation
import CoreGraphics
import CaptureKit

// MARK: - Forced-failure injection (Simulator error-state walk)

/// Launch-arg switches that make specific mock seams throw, so Field's
/// forced-failure states can be driven and screenshotted on the Simulator
/// without a live backend. Consulted ONLY by the mock conformers below.
///
/// - `-CaptureMockFailUpload` — `MockSiteScanService.upload()` always throws,
///   driving F4's upload-failure state (Retry upload / Finish later).
/// - `-CaptureMockFailProjects` — `MockProjectsService.listProjects()` always
///   throws, driving P1's load-error affordance (`ProjectsErrorState`, which
///   shares the same errorMessage plumbing as the inline refresh banner).
///   Fails deterministically on first load so the state is reachable without a
///   pull-to-refresh gesture (synthetic gestures don't reliably commit
///   SwiftUI `.refreshable` on the Simulator; drive the inline-banner variant
///   with a real pull on device).
public enum MockFailure {
    private static let args = ProcessInfo.processInfo.arguments

    public static var failUpload: Bool { args.contains("-CaptureMockFailUpload") }
    public static var failProjects: Bool { args.contains("-CaptureMockFailProjects") }
}

/// A mock-injected failure carrying a field-appropriate message.
public struct MockInjectedFailure: LocalizedError {
    public let errorDescription: String?
    public init(_ message: String) { errorDescription = message }
}

/// Parse a fixed ISO-8601 string into a stable fixture `Date`.
private func iso(_ string: String) -> Date {
    ISO8601DateFormatter().date(from: string) ?? Date(timeIntervalSince1970: 1_781_568_000)
}

// MARK: - Stable fixtures + harness ids

public enum WorkFixtures {
    // Stable ids the `-CaptureScreen` deep-link harness resolves detail screens to.
    public static let projectID = "proj-9f2a41"
    public static let leadID = "lead-4c8130"
    public static let decisionID = "dec-7b3055"
    public static let threadID = "thread-1a55e0"
    public static let poID = "po-6d2418"

    /// A well-formed portal-login QR payload (64-hex nonce, far-future expiry) the
    /// PortalAuth mock parses cleanly for the Q2 harness screen.
    public static let qrPayload =
        "patina://auth?session=a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90"
        + "&exp=4102444800&browser=Chrome&os=macOS&loc=Chicago"

    // ── Sample data (returned by the mocks) ──

    public static let projects: [FieldProject] = [
        FieldProject(id: projectID, name: "Ashford Residence — Living + Dining",
                     status: "in_progress", clientName: "The Ashfords",
                     phaseLabel: "Procurement", updatedAt: iso("2026-06-14T16:20:00Z")),
        FieldProject(id: "proj-3e7702", name: "Whitfield Loft",
                     status: "design", clientName: "M. Whitfield",
                     phaseLabel: "Design development", updatedAt: iso("2026-06-11T09:05:00Z")),
        FieldProject(id: "proj-b10488", name: "Cedarbrook Lake House",
                     status: "on_hold", clientName: "Cedarbrook LLC",
                     phaseLabel: "On hold", updatedAt: iso("2026-05-29T14:40:00Z"))
    ]

    public static let projectDetail = FieldProjectDetail(
        project: projects[0],
        phases: [
            FieldProjectPhase(id: "ph-1", name: "Discovery", status: "complete", sortOrder: 0),
            FieldProjectPhase(id: "ph-2", name: "Design development", status: "complete", sortOrder: 1),
            FieldProjectPhase(id: "ph-3", name: "Procurement", status: "in_progress", sortOrder: 2),
            FieldProjectPhase(id: "ph-4", name: "Install", status: "not_started", sortOrder: 3)
        ],
        milestones: [
            FieldMilestone(id: "ms-1", label: "Design fee — deposit", amountCents: 450_000,
                           dueDate: iso("2026-04-01T00:00:00Z"), status: "paid"),
            FieldMilestone(id: "ms-2", label: "Procurement — 50%", amountCents: 1_820_000,
                           dueDate: iso("2026-06-20T00:00:00Z"), status: "due"),
            FieldMilestone(id: "ms-3", label: "Balance on install", amountCents: 900_000,
                           dueDate: nil, status: "upcoming")
        ],
        ffeItems: [
            FieldFFEItem(id: "ffe-1", name: "Holloway 3-seat sofa", status: "specified", roomName: "Living room"),
            FieldFFEItem(id: "ffe-2", name: "Oak dining table", status: "ordered", roomName: "Dining room"),
            FieldFFEItem(id: "ffe-3", name: "Brass pendant", status: "proposed", roomName: "Dining room")
        ],
        rooms: [
            FieldProjectRoom(id: "room-1", name: "Living room"),
            FieldProjectRoom(id: "room-2", name: "Dining room"),
            FieldProjectRoom(id: "room-3", name: "Entry")
        ]
    )

    public static let leads: [FieldLead] = [
        FieldLead(id: leadID, clientName: "Priya Anand", source: "Website", status: "new",
                  budgetLabel: "$75k–$120k",
                  note: "Full-home refresh for a 1920s bungalow — wants a warm, layered look.",
                  createdAt: iso("2026-06-13T18:02:00Z")),
        FieldLead(id: "lead-9a0217", clientName: "Tom & Rachel Boyd", source: "Referral",
                  status: "contacted", budgetLabel: "$40k–$60k",
                  note: "Nursery plus the primary bedroom before an August due date.",
                  createdAt: iso("2026-06-09T13:15:00Z"))
    ]

    public static let decisions: [FieldDecision] = [
        FieldDecision(id: decisionID, title: "Living room sofa", projectName: "Ashford Residence",
                      clientName: "The Ashfords", status: "pending",
                      sentAt: iso("2026-06-12T15:00:00Z"), viewedAt: iso("2026-06-12T20:41:00Z")),
        FieldDecision(id: "dec-2f1806", title: "Dining pendant", projectName: "Whitfield Loft",
                      clientName: "M. Whitfield", status: "pending",
                      sentAt: iso("2026-06-13T11:30:00Z"), viewedAt: nil)
    ]

    public static let decisionDetail = FieldDecisionDetail(
        decision: decisions[0],
        context: "Two directions for the main sofa — both in a performance bouclé that holds up to "
            + "the dog. The Holloway reads warmer; the Marlow is a touch more tailored.",
        options: [
            FieldDecisionOption(id: "opt-1", title: "Holloway 3-seat — Oatmeal bouclé",
                                note: "Deeper seat, the warmer white.", imageURL: nil,
                                priceLabel: "$3,120", isRecommended: true, isSelected: false),
            FieldDecisionOption(id: "opt-2", title: "Marlow 3-seat — Fog",
                                note: "Tighter back, cooler tone.", imageURL: nil,
                                priceLabel: "$2,780", isRecommended: false, isSelected: false)
        ]
    )

    public static let threads: [FieldThread] = [
        FieldThread(id: threadID, title: "Ashford Residence",
                    lastMessagePreview: "Sounds great — let's go with the oak.",
                    lastMessageAt: iso("2026-06-14T17:12:00Z"), unread: true),
        FieldThread(id: "thread-77b1c2", title: "Whitfield Loft",
                    lastMessagePreview: "Can we see one more pendant option?",
                    lastMessageAt: iso("2026-06-13T10:48:00Z"), unread: false)
    ]

    public static let messages: [FieldMessage] = [
        FieldMessage(id: "msg-1", threadID: threadID, senderID: "u-client", senderName: "The Ashfords",
                     text: "Is the oak console still available?", sentAt: iso("2026-06-14T16:55:00Z"), isMine: false),
        FieldMessage(id: "msg-2", threadID: threadID, senderID: "u-me", senderName: "You",
                     text: "It is — I'll add it to the proposal today.", sentAt: iso("2026-06-14T17:03:00Z"), isMine: true),
        FieldMessage(id: "msg-3", threadID: threadID, senderID: "u-client", senderName: "The Ashfords",
                     text: "Sounds great — let's go with the oak.", sentAt: iso("2026-06-14T17:12:00Z"), isMine: false)
    ]

    public static let arrivingPOs: [FieldArrivingPO] = [
        FieldArrivingPO(id: poID, poNumber: "PO-10428", vendorName: "Holloway & Co.",
                        projectName: "Ashford Residence", eta: iso("2026-07-12T00:00:00Z"),
                        status: "shipped", paymentPattern: "deposit_balance"),
        FieldArrivingPO(id: "po-881103", poNumber: "PO-10502", vendorName: "Cedar & Twine",
                        projectName: "Whitfield Loft", eta: iso("2026-07-19T00:00:00Z"),
                        status: "in_production", paymentPattern: "net_30")
    ]

    /// Fixture on-disk bundle location for the site-scan mock's finished result.
    public static let scanBundleURL =
        URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("mock-scan-bundle", isDirectory: true)
}

// MARK: - Projects

public struct MockProjectsService: ProjectsService {
    public init() {}
    public func listProjects() async throws -> [FieldProject] {
        if MockFailure.failProjects {
            throw MockInjectedFailure("Couldn't reach the studio. Check your connection.")
        }
        return WorkFixtures.projects
    }
    public func projectDetail(id: String) async throws -> FieldProjectDetail { WorkFixtures.projectDetail }
}

// MARK: - Leads

public struct MockLeadsService: LeadsService {
    public init() {}
    public func listOpenLeads() async throws -> [FieldLead] { WorkFixtures.leads }
    public func leadDetail(id: String) async throws -> FieldLead {
        WorkFixtures.leads.first { $0.id == id } ?? WorkFixtures.leads[0]
    }
}

// MARK: - Decisions (read-only)

public struct MockDecisionsReadService: DecisionsReadService {
    public init() {}
    public func listPending() async throws -> [FieldDecision] { WorkFixtures.decisions }
    public func decisionDetail(id: String) async throws -> FieldDecisionDetail { WorkFixtures.decisionDetail }
}

// MARK: - Messaging

public struct MockMessagingService: MessagingService {
    public init() {}
    public func listThreads() async throws -> [FieldThread] { WorkFixtures.threads }
    public func messages(threadID: String) async throws -> [FieldMessage] { WorkFixtures.messages }
    /// Echoes the sent text back as the current user's message.
    public func send(threadID: String, text: String) async throws -> FieldMessage {
        FieldMessage(id: UUID().uuidString, threadID: threadID, senderID: "u-me",
                     senderName: "You", text: text, sentAt: Date(), isMine: true)
    }
    /// No live tail in the mock — the stream finishes immediately.
    public func observeMessages(threadID: String) -> AsyncStream<FieldMessage> {
        AsyncStream { $0.finish() }
    }
}

// MARK: - Receiving

public struct MockReceivingService: ReceivingService {
    public init() {}
    public func arrivingPOs() async throws -> [FieldArrivingPO] { WorkFixtures.arrivingPOs }
    public func uploadInspectionPhoto(_ data: Data, poID: String) async throws -> String {
        "receiving/\(poID)/\(UUID().uuidString).jpg"
    }
    public func submitInspection(_ submission: FieldInspectionSubmission) async throws {}
}

// MARK: - Portal auth approval

public enum MockPortalAuthError: Error { case malformed }

public struct MockPortalAuthApprovalService: PortalAuthApprovalService {
    public init() {}

    public func parse(qrPayload: String) throws -> FieldPortalAuthRequest {
        guard let comps = URLComponents(string: qrPayload),
              let items = comps.queryItems,
              let session = items.first(where: { $0.name == "session" })?.value,
              !session.isEmpty else {
            throw MockPortalAuthError.malformed
        }
        let exp = items.first { $0.name == "exp" }?.value.flatMap(TimeInterval.init)
        let expiresAt = exp.map { Date(timeIntervalSince1970: $0) } ?? Date(timeIntervalSinceNow: 300)
        let browser = items.first { $0.name == "browser" }?.value
        let os = items.first { $0.name == "os" }?.value
        let label = [browser, os.map { "on \($0)" }].compactMap { $0 }
        return FieldPortalAuthRequest(
            nonce: session,
            portalHost: "app.patina.cloud",
            expiresAt: expiresAt,
            browserLabel: label.isEmpty ? nil : label.joined(separator: " ")
        )
    }

    public func approve(_ request: FieldPortalAuthRequest) async throws {}
    public func reject(_ request: FieldPortalAuthRequest) async throws {}
}

// MARK: - Site scan

/// Always-supported scan session with a scripted coverage ramp, so F2–F4 render
/// on the simulator (where real RoomPlan/LiDAR is unavailable).
@MainActor
public final class MockScanSession: FieldScanSession, AnchorCapturing, ContextCapturing {
    public init() {}

    // Item-7 context capture (scripted — a placeholder frame so the sim flow enqueues).
    public let scanSessionId = UUID().uuidString.lowercased()
    public func captureContextFrame() -> ContextFrameSnapshot? {
        ContextFrameSnapshot(imageData: Data([0xFF, 0xD8, 0xFF, 0xD9]), width: 4, height: 3,
                             poseRowMajor: nil, filenameExtension: "jpg")
    }

    public var events: AsyncStream<FieldScanEvent> {
        AsyncStream { continuation in
            continuation.yield(.status("Scanning — walk the room slowly"))
            continuation.yield(.coverage(0.15))
            // Partial coverage + a nudge, so the F2 coach overlay renders on the sim.
            continuation.yield(.coverageUpdate(CoverageSnapshot(
                coveragePct: 35,
                checklist: [
                    SurfaceStatus(surface: "wall:north", covered: true),
                    SurfaceStatus(surface: "wall:south", covered: false),
                    SurfaceStatus(surface: "wall:east", covered: false),
                    SurfaceStatus(surface: "wall:west", covered: false),
                    SurfaceStatus(surface: "floor", covered: true),
                    SurfaceStatus(surface: "ceiling", covered: false)
                ],
                warnings: [.tooFar])))
            continuation.yield(.coverage(0.4))
            continuation.yield(.status("Capture the far corner"))
            continuation.yield(.coverage(0.7))
            continuation.yield(.coverageUpdate(CoverageSnapshot(
                coveragePct: 100, checklist: Self.completeChecklist, warnings: [])))
            continuation.yield(.coverage(0.92))
            continuation.yield(.coverage(1.0))
            continuation.yield(.status("Room captured"))
            continuation.finish()
        }
    }

    public func finish() async throws -> FieldScanResult {
        // Scorecard reflects the anchors the sim user entered (drives UNVERIFIED).
        FieldScanResult(localBundleURL: WorkFixtures.scanBundleURL,
                        roomName: "Living room", areaLabel: "312 sq ft",
                        scorecard: Scorecard(
                            coveragePct: 100, sharpFrameRatio: 0.88, trackingHealth: .good,
                            anchorCount: capturedAnchors.count, verdict: .green,
                            surfaceChecklist: Self.completeChecklist, namedGaps: []))
    }

    public func cancel() {}

    // MARK: - AnchorCapturing (scripted — no raycast on the sim, but the F-flow
    // anchor step stays walkable: taps drop scripted endpoints ~4 m apart).

    public private(set) var capturedAnchors: [AnchorRecord] = []
    public private(set) var pendingEndpoints: [SIMD3<Float>] = []

    public var pendingSpanMeters: Double? {
        guard pendingEndpoints.count == 2 else { return nil }
        return Double(Self.distance(pendingEndpoints[0], pendingEndpoints[1]))
    }

    @discardableResult
    public func tapAnchorPoint(screenPoint: CGPoint, viewport: CGSize) -> Bool {
        if pendingEndpoints.count >= 2 { pendingEndpoints.removeAll() }
        pendingEndpoints.append(pendingEndpoints.isEmpty ? SIMD3<Float>(0, 0, -2) : SIMD3<Float>(4, 0, -2))
        return true
    }

    @discardableResult
    public func commitAnchor(measuredValueMillimetres: Int, label: String) -> AnchorRecord? {
        guard pendingEndpoints.count == 2, measuredValueMillimetres > 0 else { return nil }
        let a = pendingEndpoints[0], b = pendingEndpoints[1]
        let record = AnchorRecord(
            id: UUID().uuidString.lowercased(), index: capturedAnchors.count, label: label,
            spanKind: AnchorGate.autoSpanKind(dx: Double(b.x - a.x), dy: Double(b.y - a.y), dz: Double(b.z - a.z)),
            entryMethod: .typed,
            endpointA: .init(x: Double(a.x), y: Double(a.y), z: Double(a.z)),
            endpointB: .init(x: Double(b.x), y: Double(b.y), z: Double(b.z)),
            modelSpanMeters: Double(Self.distance(a, b)), measuredValueMm: measuredValueMillimetres)
        capturedAnchors.append(record)
        pendingEndpoints.removeAll()
        return record
    }

    public func clearPendingAnchor() { pendingEndpoints.removeAll() }

    public func beginAnchoringPhase() {}   // no lanes to quiesce on the mock

    private static func distance(_ a: SIMD3<Float>, _ b: SIMD3<Float>) -> Float {
        let d = a - b
        return (d.x * d.x + d.y * d.y + d.z * d.z).squareRoot()
    }

    private static let completeChecklist: [SurfaceStatus] = [
        SurfaceStatus(surface: "wall:north", covered: true),
        SurfaceStatus(surface: "wall:south", covered: true),
        SurfaceStatus(surface: "wall:east", covered: true),
        SurfaceStatus(surface: "wall:west", covered: true),
        SurfaceStatus(surface: "floor", covered: true),
        SurfaceStatus(surface: "ceiling", covered: true),
        SurfaceStatus(surface: "opening:1", covered: true)
    ]
}

@MainActor
public final class MockSiteScanService: SiteScanService {
    private var pending: [FieldScanPendingUpload] = []
    public init() {}
    /// Always supported for previews/sim (the real seam gates on LiDAR).
    public var isSupported: Bool { true }
    public func startSession() async throws -> any FieldScanSession { MockScanSession() }
    public func upload(result: FieldScanResult, projectID: String?, projectRoomID: String?,
                       name: String) async throws -> FieldScanUploadReceipt {
        if MockFailure.failUpload {
            let id = result.localBundleURL.lastPathComponent
            if !pending.contains(where: { $0.id == id }) {
                pending.append(FieldScanPendingUpload(
                    id: id,
                    name: name,
                    projectID: projectID,
                    state: CaptureTransferState(
                        phase: .retryableFailure,
                        errorMessage: "Upload failed.",
                        retryCount: 1)))
            }
            throw MockInjectedFailure("Upload failed.")
        }
        let receipt = "scan-\(UUID().uuidString.prefix(8))"
        pending.removeAll { $0.id == result.localBundleURL.lastPathComponent }
        return FieldScanUploadReceipt(remoteScanID: receipt)
    }
    public func pendingUploads() async -> [FieldScanPendingUpload] { pending }
    public func resumePendingUploads(retryFailures: Bool) async {
        if retryFailures, !MockFailure.failUpload { pending.removeAll() }
    }
}
