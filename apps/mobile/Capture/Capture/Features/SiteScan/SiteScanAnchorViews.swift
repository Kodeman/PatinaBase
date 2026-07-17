//  SiteScanAnchorViews.swift
//  Capture · Wave F (Pro site-scan) · Field Capture P1 · item 6 — typed anchor entry
//
//  The anchor-entry step between scanning and review (deck SC-08, R108.1/R108.5).
//  Tap two points on the live model (raycasts the SHARED session via
//  `AnchorCapturing`), read the live span, type the tape/laser value, add. Prompt for
//  three spans (two long + one ceiling height). Skipping is allowed — a SOFT gate —
//  with a clear "will be stamped UNVERIFIED" moment. UX budget: tap-tap-type-next,
//  minimal chrome (AC: three anchors in ≤ 60 s).
//
//  ⚠️ ALL user-facing strings here are ESCALATE-class PLACEHOLDERS (coach/anchor
//  wording is designer-visible) — catalogued in the item-6 report for Kody's M2
//  review. Typography-first, no box shadows.

import SwiftUI
import CaptureKit

@MainActor
@Observable
final class SiteScanAnchorModel {
    private let capture: any AnchorCapturing

    var pendingCount = 0
    var spanMeters: Double?
    var anchorCount = 0
    var lastTapMissed = false

    init(capture: any AnchorCapturing) {
        self.capture = capture
        anchorCount = capture.capturedAnchors.count
    }

    func tap(at point: CGPoint, viewport: CGSize) {
        let hit = capture.tapAnchorPoint(screenPoint: point, viewport: viewport)
        lastTapMissed = !hit
        pendingCount = capture.pendingEndpoints.count
        spanMeters = capture.pendingSpanMeters
    }

    func canAdd(_ text: String) -> Bool {
        pendingCount == 2 && AnchorMeasurementParser.parseMillimetres(text) != nil
    }

    func addAnchor(_ text: String) {
        guard let mm = AnchorMeasurementParser.parseMillimetres(text) else { return }
        _ = capture.commitAnchor(measuredValueMillimetres: mm, label: "span \(anchorCount + 1)")  // ESCALATE label
        anchorCount = capture.capturedAnchors.count
        pendingCount = capture.pendingEndpoints.count
        spanMeters = nil
        lastTapMissed = false
    }

    func clearPending() {
        capture.clearPendingAnchor()
        pendingCount = 0
        spanMeters = nil
        lastTapMissed = false
    }

    var isUnverified: Bool { AnchorGate.isUnverified(anchorCount: anchorCount) }
}

struct SiteScanAnchorStep: View {
    let model: SiteScanHostModel
    let analytics: any CaptureAnalytics
    let onDone: () -> Void

    @State private var anchor: SiteScanAnchorModel?
    @State private var valueText = ""

    var body: some View {
        ZStack {
            liveSurface.ignoresSafeArea()
            // Tap layer — MUST share the RoomCaptureView's render coordinate space:
            // both ignore the safe area, so `geo.size` == the camera render bounds and
            // `value.location` is a render-space point. If the tap layer respected the
            // safe area, the projection viewport would be short and taps would land
            // vertically offset from where the user aimed (A1 invariant).
            GeometryReader { geo in
                Color.clear
                    .contentShape(Rectangle())
                    .gesture(SpatialTapGesture().onEnded { value in
                        anchor?.tap(at: value.location, viewport: geo.size)
                    })
            }
            .ignoresSafeArea()
            // Chrome respects the safe area (kept out from under the notch / home bar).
            VStack(spacing: 0) {
                instructionBar
                Spacer()
                entryPanel
            }
        }
        .statusBarHidden(true)
        .environment(\.colorScheme, .light)
        .accessibilityIdentifier("screen.F2.anchors")
        .task {
            analytics.screen("screen.F2.anchors")
            if anchor == nil, let capture = model.session as? AnchorCapturing {
                anchor = SiteScanAnchorModel(capture: capture)
            }
        }
    }

    @ViewBuilder private var liveSurface: some View {
        #if canImport(RoomPlan)
        if let roomSession = model.session as? RoomPlanScanSession {
            RoomCaptureViewContainer(session: roomSession)
        } else {
            SiteScanBackdrop()
        }
        #else
        SiteScanBackdrop()
        #endif
    }

    // MARK: - Panels (ESCALATE placeholder copy)

    private var instructionBar: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Add measured spans")
                .font(CaptureType.eyebrow).textCase(.uppercase)
                .foregroundStyle(CaptureColor.paper3)
            Text("Anchor \(min((anchor?.anchorCount ?? 0) + 1, 3)) of 3")
                .font(CaptureType.title2)
                .foregroundStyle(CaptureColor.paper)
            Text(headline)
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.paper2)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 18)
        .padding(.top, 8)
    }

    private var headline: String {
        if anchor?.lastTapMissed == true { return "Aim at a wall or the floor and tap again" }
        switch anchor?.pendingCount ?? 0 {
        case 0: return "Tap the two ends of a real span (a wall run, or floor to ceiling)"
        case 1: return "Tap the second point"
        default: return "Type what your tape or laser reads"
        }
    }

    @ViewBuilder private var entryPanel: some View {
        VStack(spacing: 12) {
            if let span = anchor?.spanMeters {
                HStack {
                    Text("Measured on model")
                        .font(CaptureType.footnote).foregroundStyle(CaptureColor.paper2)
                    Spacer()
                    Text(String(format: "%.2f m", span))
                        .font(CaptureType.bodyEmph).foregroundStyle(CaptureColor.paper)
                }

                HStack(spacing: 10) {
                    TextField("e.g. 12' 3 1/2\"", text: $valueText)
                        .textFieldStyle(.roundedBorder)
                        .font(CaptureType.body)
                        .accessibilityLabel("Measured length")
                    SiteScanPrimaryButton(title: "Add", systemImage: "plus") {
                        analytics.event("siteScan.anchor.add")
                        anchor?.addAnchor(valueText)
                        valueText = ""
                    }
                    .disabled(!(anchor?.canAdd(valueText) ?? false))
                }
                if anchor?.pendingCount == 2, !valueText.isEmpty,
                   AnchorMeasurementParser.parseMillimetres(valueText) == nil {
                    Text("Check the value")          // ESCALATE placeholder (A2 out-of-range/unparseable)
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.warning)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                SiteScanSecondaryButton(title: "Retap", systemImage: "arrow.counterclockwise",
                                        tint: CaptureColor.paper2) {
                    anchor?.clearPending()
                }
            }

            doneButton
        }
        .padding(14)
        .background(.ultraThinMaterial)
    }

    private var doneButton: some View {
        let unverified = anchor?.isUnverified ?? true
        return SiteScanPrimaryButton(
            title: unverified ? "Finish — mark UNVERIFIED" : "Finish",
            systemImage: unverified ? "exclamationmark.triangle" : "checkmark"
        ) {
            analytics.event("siteScan.anchor.done")
            onDone()
        }
    }
}
